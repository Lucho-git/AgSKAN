/**
 * The moving parts of the map prototype: the Mapbox map, the viewer's own
 * machine (real GPS or an example drive), coverage trails, the example crew,
 * pins and the follow camera. The page owns the chrome and talks to this
 * through a handful of methods and Svelte stores.
 *
 * Nothing here talks to a server: the join choices, dropped pins and the
 * farm's anchor point live in localStorage, and the trail lives in memory.
 */
import { get, writable, type Writable } from "svelte/store"
// @ts-expect-error -- no type declarations for mapbox-gl 1.x
import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import VehicleMarker from "$lib/components/mapnext/VehicleMarker.svelte"
import PinMarker from "./PinMarker.svelte"
import {
  ACCURACY_SOURCE,
  FARM_SOURCE,
  MY_TRAIL_SOURCE,
  SCRUB_SOURCE,
  TRAIL_SOURCE,
  applyBase,
  buildStyle,
  type BaseLook,
  type MapboxMap,
} from "$lib/components/mapnext/mapStyle"
import {
  CREW,
  EXAMPLE_PINS,
  MACHINE_SPECS,
  PADDOCKS,
  Runner,
  crewRunner,
  exampleDrive,
  machineById,
  type CrewSpec,
  type MachineId,
  type Paddock,
} from "./farm"
import { VEHICLE_PALETTE } from "$lib/components/mapnext/palette"
import {
  bearingDeg,
  clamp,
  distanceM,
  easeHeading,
  lerp,
  pixelsPerMetre,
  pointInPolygon,
  projector,
  turn,
  type LngLat,
  type Projector,
} from "$lib/components/mapnext/geo"
import type { PinKind } from "./glyphs"

export type Me = { name: string; machine: MachineId; colour: string }
export type GpsState = "idle" | "asking" | "live" | "denied" | "unavailable"
export type FollowMode = "free" | "follow" | "cab"

export type Readout = {
  hasFix: boolean
  /** km/h */
  speed: number
  heading: number
  /** Hectares painted so far by the viewer's own machine. */
  ha: number
  /** GPS accuracy in metres, when known. */
  accuracy: number | null
  paddock: Paddock | null
  /** No fix for a while (and not on an example drive). */
  stale: boolean
}

export type CrewRow = {
  id: string
  name: string
  machine: MachineId
  machineLabel: string
  colour: string
  doing: string
  speed: number
  /** Metres from the viewer, once they are on the map. */
  distance: number | null
}

export type Pin = {
  id: string
  kind: PinKind
  at: LngLat
  by: "you" | "example"
  /** When it was dropped (ms), for the viewer's own pins. */
  t: number
  note?: string
}

type Fix = {
  at: LngLat
  /** ms */
  t: number
  accuracy: number | null
  /** m/s from the GPS chip, when it reports one. */
  speed: number | null
  heading: number | null
  /** Heading is known exactly (example drive), not inferred. */
  exact?: boolean
  /** Implement lifted (turning on the headland): don't paint. */
  lifted?: boolean
}

type Vehicle = {
  marker: MapboxMap
  view: VehicleMarker
  machine: MachineId
  colour: string
  pos: LngLat
  /** Where it is pointing, and the smoothed version that is drawn. */
  heading: number
  eased: number
  shownHeading: number
  shownSize: number
}

type CrewMember = Vehicle & {
  spec: CrewSpec
  runner: Runner
  /** Seconds since the job finished; it starts over after a short rest. */
  finishedFor: number
}

/** A wheatbelt paddock, used until the viewer's own position is known. */
const DEFAULT_ANCHOR: LngLat = [118.257866, -32.238795]
/** Example machines run faster than life so there is something to watch. */
const TIME_SCALE = 4
const STORE = "agskan-map-preview"
const MAX_SEGMENT_POINTS = 400

const read = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(`${STORE}:${key}`)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(`${STORE}:${key}`, JSON.stringify(value))
  } catch {
    // Private mode or a full disk: the prototype carries on without it.
  }
}

const swathOf = (machine: MachineId) => MACHINE_SPECS[machine].swath

const line = (coordinates: LngLat[], color: string, width: number) => ({
  type: "Feature",
  properties: { color, width },
  geometry: { type: "LineString", coordinates },
})
const collection = (features: unknown[]) => ({
  type: "FeatureCollection",
  features,
})

export class MapEngine {
  readonly map: MapboxMap
  readonly gps: Writable<GpsState> = writable("idle")
  readonly follow: Writable<FollowMode> = writable("free")
  readonly driving = writable(false)
  readonly ready = writable(false)
  readonly readout: Writable<Readout> = writable({
    hasFix: false,
    speed: 0,
    heading: 0,
    ha: 0,
    accuracy: null,
    paddock: null,
    stale: false,
  })
  readonly crew: Writable<CrewRow[]> = writable([])
  readonly pins: Writable<Pin[]> = writable([])
  readonly selectedPin: Writable<Pin | null> = writable(null)
  /** Map bearing in degrees, for the compass on the follow button. */
  readonly bearing = writable(0)

  private proj: Projector
  private me: Me
  private base: BaseLook
  private mine: Vehicle | null = null
  private crewMembers: CrewMember[] = []
  private labelMarkers: MapboxMap[] = []
  private pinViews = new Map<string, { marker: MapboxMap; view: PinMarker }>()
  private removedExamples: string[] = read("removed-pins", [])

  // The viewer's own motion
  private lastFix: Fix | null = null
  private lastRealFix: Fix | null = null
  private courseAnchor: Fix | null = null
  private tween: {
    from: LngLat
    to: LngLat
    start: number
    dur: number
  } | null = null
  private speedKmh = 0
  private drive: Runner | null = null
  private driveClock = 0

  // The viewer's own trail: finished stretches plus the one being painted.
  private trail: { coords: LngLat[]; color: string; width: number }[] = []
  private paintedM = 0

  /** Tap-to-drop is armed with this pin kind. */
  private armed: PinKind | null = null
  private insets = { left: 0, bottom: 0 }
  private watchId: number | null = null
  private wakeLock: { release: () => Promise<void> } | null = null
  private raf = 0
  private lastFrame = 0
  private trailDirty = 0
  private crewTick = 0
  private followPausedUntil = 0
  /** Fingers are on the map: leave the camera alone until they lift. */
  private touching = false
  private destroyed = false

  constructor(
    container: HTMLElement,
    token: string,
    options: { me: Me; base: BaseLook },
  ) {
    this.me = options.me
    this.base = options.base
    this.proj = projector(read<LngLat>("anchor", DEFAULT_ANCHOR))

    mapboxgl.accessToken = token
    this.map = new mapboxgl.Map({
      container,
      style: buildStyle(),
      center: this.proj.anchor,
      zoom: 14.4,
      minZoom: 9,
      maxZoom: 19.5,
      attributionControl: false,
      doubleClickZoom: false,
      pitchWithRotate: false,
      maxPitch: 0,
      fadeDuration: 200,
    })
    this.map.touchZoomRotate.disableRotation()
    this.map.dragRotate.disable()

    this.map.on("load", () => {
      if (this.destroyed) return
      applyBase(this.map, this.base)
      this.placeFarm()
      this.restorePins()
      this.buildCrew()
      this.onZoom()
      this.ready.set(true)
      this.lastFrame = performance.now()
      this.raf = requestAnimationFrame(this.frame)
    })
    this.map.on("zoom", this.onZoom)
    this.map.on("rotate", () => this.bearing.set(this.map.getBearing()))
    // Dragging the map means "let me look around": stop following.
    // A pinch also nudges the map, but that is zooming, not looking around.
    this.map.on("dragstart", (e: { originalEvent?: Event }) => {
      const touches = (e.originalEvent as TouchEvent | undefined)?.touches
      if (e.originalEvent && !(touches && touches.length > 1))
        this.setFollow("free")
    })
    // Moving the camera cancels a gesture in progress, so following waits
    // while fingers are down or the wheel is turning.
    const canvas = this.map.getCanvasContainer() as HTMLElement
    canvas.addEventListener("touchstart", () => (this.touching = true), {
      passive: true,
    })
    for (const type of ["touchend", "touchcancel"])
      canvas.addEventListener(type, (e) => {
        this.touching = (e as TouchEvent).touches.length > 0
      })
    canvas.addEventListener(
      "wheel",
      () => (this.followPausedUntil = performance.now() + 400),
      { passive: true },
    )
    this.selectedPin.subscribe((selected) => {
      for (const [id, { view }] of this.pinViews)
        view.$set({ selected: id === selected?.id })
    })
    this.map.on("click", (e: { lngLat: { lng: number; lat: number } }) => {
      if (this.armed) this.dropPin(this.armed, [e.lngLat.lng, e.lngLat.lat])
      else this.selectedPin.set(null)
    })
    document.addEventListener("visibilitychange", this.onVisibility)
  }

  // ── Set-up ──────────────────────────────────────────────────────────────

  /** Put the example paddocks, labels and crew lines around the anchor. */
  private placeFarm() {
    const { toLngLat } = this.proj
    const closed = (ring: [number, number][]) => {
      const out = ring.map(toLngLat)
      out.push(out[0])
      return out
    }
    this.map.getSource(FARM_SOURCE).setData(
      collection(
        PADDOCKS.map((p) => ({
          type: "Feature",
          properties: { id: p.id, fill: p.fill },
          geometry: { type: "Polygon", coordinates: p.rings.map(closed) },
        })),
      ),
    )
    this.map.getSource(SCRUB_SOURCE).setData(
      collection(
        PADDOCKS.flatMap((p) =>
          p.rings.slice(1).map((hole) => ({
            type: "Feature",
            properties: {},
            geometry: { type: "Polygon", coordinates: [closed(hole)] },
          })),
        ),
      ),
    )

    this.labelMarkers.forEach((m) => m.remove())
    this.labelMarkers = PADDOCKS.map((p) => {
      const el = document.createElement("div")
      el.className = "mv-paddock-label"
      const name = document.createElement("b")
      name.textContent = p.name
      const ha = document.createElement("span")
      ha.textContent = `${p.ha} ha`
      el.append(name, ha)
      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat(toLngLat(p.label))
        .addTo(this.map)
      marker.getElement().style.zIndex = "1"
      return marker
    })
  }

  private restorePins() {
    const examples: Pin[] = EXAMPLE_PINS.map((p, i) => ({
      id: `example-${i}`,
      kind: p.kind,
      at: this.proj.toLngLat(p.at),
      by: "example" as const,
      t: 0,
      note: p.note,
    })).filter((p) => !this.removedExamples.includes(p.id))
    const mine = read<Pin[]>("pins", [])
    this.pins.set([...examples, ...mine])
    for (const [id, { marker, view }] of this.pinViews) {
      view.$destroy()
      marker.remove()
      this.pinViews.delete(id)
    }
    get(this.pins).forEach((pin) => this.mountPin(pin, false))
  }

  private mountPin(pin: Pin, fresh: boolean) {
    const el = document.createElement("div")
    const view = new PinMarker({
      target: el,
      props: { kind: pin.kind, fresh, note: pin.note ?? "" },
    })
    view.$on("tap", () => {
      if (this.armed) return
      this.selectedPin.update((current) =>
        current?.id === pin.id ? null : pin,
      )
    })
    const marker = new mapboxgl.Marker({ element: el })
      .setLngLat(pin.at)
      .addTo(this.map)
    marker.getElement().style.zIndex = "2"
    this.pinViews.set(pin.id, { marker, view })
  }

  private mountVehicle(
    machine: MachineId,
    colour: string,
    label: string,
    at: LngLat,
    me: boolean,
  ): Vehicle {
    const el = document.createElement("div")
    const view = new VehicleMarker({
      target: el,
      props: { art: machineById(machine).name, colour, label, me, size: 44 },
    })
    const marker = new mapboxgl.Marker({ element: el })
      .setLngLat(at)
      .addTo(this.map)
    marker.getElement().style.zIndex = me ? "4" : "3"
    return {
      marker,
      view,
      machine,
      colour,
      pos: at,
      heading: 0,
      eased: NaN,
      shownHeading: NaN,
      shownSize: 0,
    }
  }

  private buildCrew() {
    this.crewMembers = CREW.map((spec) => {
      const runner = crewRunner(spec)
      const { xy, heading } = runner.position
      const vehicle = this.mountVehicle(
        spec.machine,
        spec.colour,
        spec.name,
        this.proj.toLngLat(xy),
        false,
      )
      vehicle.heading = heading
      return { ...vehicle, spec, runner, finishedFor: 0 }
    })
    this.recolourCrew()
  }

  /** Nobody on the map shares the viewer's colour. */
  private recolourCrew() {
    const taken = new Set([this.me.colour.toLowerCase()])
    for (const member of this.crewMembers) {
      let colour = member.spec.colour
      if (taken.has(colour.toLowerCase())) {
        colour =
          VEHICLE_PALETTE.map((c) => c.value).find(
            (c) =>
              !taken.has(c.toLowerCase()) &&
              !CREW.some((s) => s.colour.toLowerCase() === c.toLowerCase()),
          ) ?? colour
      }
      taken.add(colour.toLowerCase())
      if (colour !== member.colour) {
        member.colour = colour
        member.view.$set({ colour })
      }
    }
  }

  // ── What the page can ask for ───────────────────────────────────────────

  setMe(me: Me) {
    const changed =
      me.machine !== this.me.machine || me.colour !== this.me.colour
    this.me = me
    if (this.mine) {
      this.mine.machine = me.machine
      this.mine.colour = me.colour
      this.mine.shownSize = 0
      this.mine.view.$set({
        art: machineById(me.machine).name,
        colour: me.colour,
      })
    }
    // A different machine or colour starts a new stretch of trail.
    if (changed) this.breakTrail()
    this.recolourCrew()
    this.onZoom()
  }

  setBase(look: BaseLook) {
    this.base = look
    if (get(this.ready)) applyBase(this.map, look)
  }

  /** Space the chrome covers, so "centred" means centred in what's left. */
  setInsets(left: number, bottom: number) {
    this.insets = { left, bottom }
  }

  armPin(kind: PinKind | null) {
    this.armed = kind
    if (kind) this.selectedPin.set(null)
    this.map.getCanvas().style.cursor = kind ? "crosshair" : ""
  }

  /** Drop a pin; with no position, at the viewer's machine (or mid-screen). */
  dropPin(kind: PinKind, at?: LngLat) {
    const centre = this.map.getCenter()
    const pin: Pin = {
      id: `pin-${Date.now().toString(36)}`,
      kind,
      at: at ?? this.mine?.pos ?? [centre.lng, centre.lat],
      by: "you",
      t: Date.now(),
    }
    this.pins.update((list) => [...list, pin])
    this.mountPin(pin, true)
    this.savePins()
    return pin
  }

  removePin(id: string) {
    const entry = this.pinViews.get(id)
    if (entry) {
      entry.view.$destroy()
      entry.marker.remove()
      this.pinViews.delete(id)
    }
    if (id.startsWith("example-")) {
      this.removedExamples.push(id)
      write("removed-pins", this.removedExamples)
    }
    this.pins.update((list) => list.filter((p) => p.id !== id))
    this.selectedPin.set(null)
    this.savePins()
  }

  private savePins() {
    write(
      "pins",
      get(this.pins).filter((p) => p.by === "you"),
    )
  }

  setFollow(mode: FollowMode) {
    const previous = get(this.follow)
    if (mode === previous) return
    this.follow.set(mode)
    if (mode === "free") {
      if (previous === "cab")
        this.map.easeTo({ bearing: 0, duration: 500, offset: [0, 0] })
      return
    }
    if (!this.mine) return
    // Glide to the machine once, then stick to it frame by frame.
    this.followPausedUntil = performance.now() + 650
    this.map.easeTo({
      center: this.mine.pos,
      zoom: Math.max(this.map.getZoom(), 15.2),
      bearing: mode === "cab" ? this.mine.heading : 0,
      offset: this.followOffset(mode),
      duration: 650,
    })
  }

  private followOffset(mode: FollowMode): [number, number] {
    const height = this.map.getContainer().clientHeight
    return [
      this.insets.left / 2,
      -this.insets.bottom / 2 + (mode === "cab" ? height * 0.16 : 0),
    ]
  }

  /** Look at a crew member (and stop following yourself). */
  lookAt(id: string) {
    const member = this.crewMembers.find((m) => m.spec.id === id)
    if (!member) return
    this.setFollow("free")
    this.map.easeTo({
      center: member.pos,
      zoom: Math.max(this.map.getZoom(), 15),
      offset: [this.insets.left / 2, -this.insets.bottom / 2],
      duration: 900,
    })
  }

  /** Where the viewer's machine is drawn right now, if it is on the map. */
  myPosition(): LngLat | null {
    return this.mine?.pos ?? null
  }

  clearTrail() {
    this.trail = []
    this.paintedM = 0
    this.trailDirty = 0
    this.readout.update((r) => ({ ...r, ha: 0 }))
  }

  // ── Real position ───────────────────────────────────────────────────────

  /** Ask the browser for the viewer's position and keep watching it. */
  startGps() {
    if (!("geolocation" in navigator) || !window.isSecureContext) {
      this.gps.set("unavailable")
      return
    }
    if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId)
    this.gps.set("asking")
    this.watchId = navigator.geolocation.watchPosition(
      (p) => {
        const first = get(this.gps) !== "live"
        this.gps.set("live")
        const fix: Fix = {
          at: [p.coords.longitude, p.coords.latitude],
          t: p.timestamp || Date.now(),
          accuracy: p.coords.accuracy ?? null,
          speed:
            p.coords.speed !== null && p.coords.speed >= 0
              ? p.coords.speed
              : null,
          heading:
            p.coords.heading !== null && !Number.isNaN(p.coords.heading)
              ? p.coords.heading
              : null,
        }
        this.lastRealFix = fix
        if (first) this.arrive(fix.at)
        if (!this.drive) this.onFix(fix)
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) this.gps.set("denied")
        else if (get(this.gps) !== "live") this.gps.set("unavailable")
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 },
    )
    this.keepAwake()
  }

  /** First real fix: bring the example farm to the viewer if it is far off. */
  private arrive(at: LngLat) {
    if (distanceM(at, this.proj.anchor) > 4000) {
      this.proj = projector(at)
      write("anchor", at)
      this.placeFarm()
      this.restorePins()
      for (const member of this.crewMembers) {
        member.pos = this.proj.toLngLat(member.runner.position.xy)
        member.marker.setLngLat(member.pos)
      }
      this.trailDirty = 0
    }
    this.map.jumpTo({ center: at, zoom: 15.4 })
    this.follow.set("follow")
  }

  private async keepAwake() {
    try {
      const nav = navigator as Navigator & {
        wakeLock?: {
          request: (type: "screen") => Promise<{ release: () => Promise<void> }>
        }
      }
      this.wakeLock = (await nav.wakeLock?.request("screen")) ?? null
    } catch {
      // Not supported or not allowed: the screen just follows its usual timer.
    }
  }

  private onVisibility = () => {
    if (document.visibilityState === "visible" && this.watchId !== null)
      this.keepAwake()
  }

  // ── Example drive ───────────────────────────────────────────────────────

  startDrive() {
    const from = this.mine?.pos ?? this.proj.anchor
    this.drive = exampleDrive(this.me.machine, this.proj.toXY(from))
    this.driveClock = 0
    this.breakTrail()
    this.driving.set(true)
    this.onFix(this.driveFix())
    this.setFollow("follow")
  }

  stopDrive() {
    if (!this.drive) return
    this.drive = null
    this.driving.set(false)
    this.breakTrail()
    this.speedKmh = 0
    // Back to where the viewer really is, if we know.
    if (this.lastRealFix) {
      this.lastFix = null
      this.onFix({ ...this.lastRealFix, t: Date.now() })
    } else {
      this.readout.update((r) => ({ ...r, speed: 0 }))
    }
  }

  private driveFix(): Fix {
    const runner = this.drive!
    const { xy, heading } = runner.position
    return {
      at: this.proj.toLngLat(xy),
      t: Date.now(),
      accuracy: 3,
      speed: runner.moving ? runner.speed : 0,
      heading,
      exact: true,
      lifted: swathOf(this.me.machine) > 0 && !runner.working,
    }
  }

  // ── The viewer's machine ────────────────────────────────────────────────

  private onFix(fix: Fix) {
    const previous = this.lastFix
    const now = performance.now()
    const jumped =
      !previous ||
      distanceM(previous.at, fix.at) > 150 ||
      fix.t - previous.t > 30000

    if (!this.mine) {
      this.mine = this.mountVehicle(
        this.me.machine,
        this.me.colour,
        "You",
        fix.at,
        true,
      )
      this.onZoom()
    }

    // Speed: trust the GPS chip when it reports one, else work it out.
    if (fix.speed !== null) {
      this.speedKmh = lerp(this.speedKmh, fix.speed * 3.6, fix.exact ? 1 : 0.6)
    } else if (previous && !jumped) {
      const dt = (fix.t - previous.t) / 1000
      const moved = distanceM(previous.at, fix.at)
      if (dt >= 0.5) {
        const implied = moved < 0.8 ? 0 : (moved / dt) * 3.6
        if (implied < 200) this.speedKmh = lerp(this.speedKmh, implied, 0.6)
      }
    }
    if (this.speedKmh < 0.4) this.speedKmh = 0

    // Heading: where it has actually travelled wins over the chip's guess;
    // standing still keeps the last heading rather than spinning.
    let heading = this.mine.heading
    if (fix.exact && fix.heading !== null) {
      heading = fix.heading
    } else {
      const anchor = this.courseAnchor
      if (!anchor || jumped || fix.t - anchor.t > 10000) {
        this.courseAnchor = fix
      } else if (distanceM(anchor.at, fix.at) >= 5) {
        heading = bearingDeg(anchor.at, fix.at)
        this.courseAnchor = fix
      } else if (fix.heading !== null && this.speedKmh >= 4) {
        heading = fix.heading
      }
    }
    this.mine.heading = heading

    if (jumped) {
      this.breakTrail()
      this.mine.pos = fix.at
      this.tween = null
    } else {
      const gap = previous ? fix.t - previous.t : 1000
      this.tween = {
        from: this.mine.pos,
        to: fix.at,
        start: now,
        dur: clamp(gap, 180, 1200),
      }
    }
    this.lastFix = fix
    this.showAccuracy(fix)

    const xy = this.proj.toXY(fix.at)
    this.readout.set({
      hasFix: true,
      speed: this.speedKmh,
      heading,
      ha: this.hectares(),
      accuracy: fix.exact ? null : fix.accuracy,
      paddock: PADDOCKS.find((p) => pointInPolygon(xy, p.rings)) ?? null,
      stale: false,
    })
  }

  private showAccuracy(fix: Fix) {
    const source = this.map.getSource(ACCURACY_SOURCE)
    if (!source) return
    const radius = fix.accuracy ?? 0
    if (fix.exact || radius < 12) {
      source.setData(collection([]))
      return
    }
    const here = projector(fix.at)
    const ring: LngLat[] = []
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * Math.PI * 2
      ring.push(here.toLngLat([Math.cos(a) * radius, Math.sin(a) * radius]))
    }
    source.setData(
      collection([
        {
          type: "Feature",
          properties: {},
          geometry: { type: "Polygon", coordinates: [ring] },
        },
      ]),
    )
  }

  private hectares() {
    return this.paintedM > 0
      ? (this.paintedM * MACHINE_SPECS[this.me.machine].swath) / 10000
      : 0
  }

  /** End the stretch of trail being painted; the next point starts a new one. */
  private breakTrail() {
    const current = this.trail[this.trail.length - 1]
    if (!current || current.coords.length === 0) return
    if (current.coords.length === 1) current.coords = []
    else this.trail.push({ ...current, coords: [] })
  }

  /** Lay trail behind the machine as its drawing moves across the map. */
  private paint() {
    const mine = this.mine
    const fix = this.lastFix
    if (!mine || !fix) return
    const { swath } = MACHINE_SPECS[this.me.machine]
    // Road vehicles paint nothing; a poor fix or a parked machine neither.
    if (swath === 0 || this.speedKmh < 0.7) return
    if (!fix.exact && fix.accuracy !== null && fix.accuracy > 100) return
    if (fix.lifted) {
      this.breakTrail()
      return
    }

    let current = this.trail[this.trail.length - 1]
    if (
      !current ||
      current.color !== this.me.colour ||
      current.width !== swath
    ) {
      current = { coords: [], color: this.me.colour, width: swath }
      this.trail.push(current)
    }
    const last = current.coords[current.coords.length - 1]
    if (!last) {
      current.coords.push(mine.pos)
      return
    }
    const moved = distanceM(last, mine.pos)
    if (moved < 2) return
    current.coords.push(mine.pos)
    this.paintedM += moved
    this.trailDirty = 0
    if (current.coords.length >= MAX_SEGMENT_POINTS)
      this.trail.push({ ...current, coords: [mine.pos] })
  }

  // ── Every frame ─────────────────────────────────────────────────────────

  private frame = (now: number) => {
    if (this.destroyed) return
    const dt = Math.min(0.25, (now - this.lastFrame) / 1000)
    this.lastFrame = now
    const bearing = this.map.getBearing()

    // Example crew
    for (const member of this.crewMembers) {
      const { runner } = member
      if (runner.finished) {
        member.finishedFor += dt
        if (member.finishedFor >= 8) {
          runner.dist = 0
          member.finishedFor = 0
        }
      }
      runner.step(dt * TIME_SCALE)
      const { xy, heading } = runner.position
      member.pos = this.proj.toLngLat(xy)
      member.heading = heading
      member.eased = Number.isNaN(member.eased)
        ? heading
        : easeHeading(member.eased, heading, 1 - Math.exp(-dt * 5))
      member.marker.setLngLat(member.pos)
      this.turnTo(member, member.eased - bearing)
    }

    // The viewer: an example drive feeds fixes just like the GPS would.
    if (this.drive) {
      this.drive.step(dt * TIME_SCALE)
      this.driveClock += dt
      if (this.driveClock >= 0.15) {
        this.driveClock = 0
        this.onFix(this.driveFix())
      }
    }
    const mine = this.mine
    if (mine) {
      if (this.tween) {
        const t = clamp((now - this.tween.start) / this.tween.dur, 0, 1)
        mine.pos = [
          lerp(this.tween.from[0], this.tween.to[0], t),
          lerp(this.tween.from[1], this.tween.to[1], t),
        ]
        if (t >= 1) this.tween = null
      }
      mine.marker.setLngLat(mine.pos)
      mine.eased = Number.isNaN(mine.eased)
        ? mine.heading
        : easeHeading(mine.eased, mine.heading, 1 - Math.exp(-dt * 6))
      this.turnTo(mine, mine.eased - bearing)
      this.paint()

      const mode = get(this.follow)
      if (mode !== "free" && now > this.followPausedUntil && !this.touching) {
        this.map.easeTo({
          center: mine.pos,
          ...(mode === "cab"
            ? {
                bearing:
                  bearing +
                  turn(bearing, mine.heading) * (1 - Math.exp(-dt * 3)),
              }
            : {}),
          offset: this.followOffset(mode),
          duration: 0,
        })
      }
    }

    // Trails redraw a few times a second, not every frame.
    this.trailDirty -= dt
    if (this.trailDirty <= 0) {
      this.trailDirty = 0.25
      this.drawTrails()
    }
    this.crewTick -= dt
    if (this.crewTick <= 0) {
      this.crewTick = 1
      this.publishCrew()
      const fix = this.lastFix
      if (fix && !this.drive && Date.now() - fix.t > 15000)
        this.readout.update((r) =>
          r.stale ? r : { ...r, stale: true, speed: 0 },
        )
    }

    this.raf = requestAnimationFrame(this.frame)
  }

  /** Rotate a machine's drawing, skipping changes too small to see. */
  private turnTo(vehicle: Vehicle, screenHeading: number) {
    if (
      !Number.isNaN(vehicle.shownHeading) &&
      Math.abs(turn(vehicle.shownHeading, screenHeading)) < 0.4
    )
      return
    vehicle.shownHeading = screenHeading
    vehicle.view.$set({ heading: screenHeading })
  }

  private drawTrails() {
    const crewLines = this.crewMembers.flatMap((member) => {
      const { swath } = MACHINE_SPECS[member.machine]
      if (swath === 0) return []
      return member.runner
        .painted()
        .map((pass) => line(pass.map(this.proj.toLngLat), member.colour, swath))
    })
    this.map.getSource(TRAIL_SOURCE)?.setData(collection(crewLines))

    const mine = this.mine
    const mineLines = this.trail.flatMap((stretch, i) => {
      // The stretch being painted runs right up to the machine.
      const live =
        i === this.trail.length - 1 &&
        mine &&
        stretch.coords.length > 0 &&
        this.speedKmh >= 0.7 &&
        !this.lastFix?.lifted
      const coords = live ? [...stretch.coords, mine.pos] : stretch.coords
      return coords.length > 1
        ? [line(coords, stretch.color, stretch.width)]
        : []
    })
    this.map.getSource(MY_TRAIL_SOURCE)?.setData(collection(mineLines))
    if (this.paintedM > 0)
      this.readout.update((r) => ({ ...r, ha: this.hectares() }))
  }

  private publishCrew() {
    const mine = this.mine
    this.crew.set(
      this.crewMembers.map((member) => {
        const { spec, runner } = member
        const { verb, speed } = MACHINE_SPECS[spec.machine]
        let doing = verb
        const job = spec.job
        if (job.type === "work") {
          const name = PADDOCKS.find((p) => p.id === job.paddock)?.name
          doing = runner.finished ? `Finished ${name}` : `${verb} · ${name}`
        } else if (!runner.moving) {
          doing = runner.doing || "Stopped"
        }
        return {
          id: spec.id,
          name: spec.name,
          machine: spec.machine,
          machineLabel: machineById(spec.machine).label,
          colour: member.colour,
          doing,
          speed: runner.moving ? speed : 0,
          distance: mine ? distanceM(mine.pos, member.pos) : null,
        }
      }),
    )
  }

  /** Machines are drawn to scale up close and never shrink to a dot. */
  private onZoom = () => {
    const zoom = this.map.getZoom()
    const ppm = pixelsPerMetre(zoom, this.proj.anchor[1])
    // Zoomed right out, the whole crew sits close together: ease them down.
    const far = clamp((zoom - 10.5) / 3, 0.62, 1)
    const resize = (vehicle: Vehicle) => {
      const spec = MACHINE_SPECS[vehicle.machine]
      const size = Math.round(clamp(spec.span * ppm, spec.minPx * far, 190))
      if (size === vehicle.shownSize) return
      vehicle.shownSize = size
      vehicle.view.$set({ size })
    }
    this.crewMembers.forEach(resize)
    if (this.mine) resize(this.mine)

    // Pins and paddock names ease off as the map zooms out.
    const style = this.map.getContainer().style
    style.setProperty(
      "--mv-pin-scale",
      clamp((zoom - 9) / 6, 0.5, 1).toFixed(2),
    )
    style.setProperty("--mv-note-opacity", zoom >= 14.5 ? "1" : "0")
    style.setProperty(
      "--mv-label-size",
      `${clamp(11 + (zoom - 13.5) * 2.2, 9, 17).toFixed(1)}px`,
    )
    style.setProperty("--mv-label-opacity", zoom >= 12.6 ? "1" : "0")
  }

  destroy() {
    this.destroyed = true
    cancelAnimationFrame(this.raf)
    document.removeEventListener("visibilitychange", this.onVisibility)
    if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId)
    this.wakeLock?.release().catch(() => {})
    this.crewMembers.forEach((m) => m.view.$destroy())
    this.mine?.view.$destroy()
    this.pinViews.forEach(({ view }) => view.$destroy())
    this.map.remove()
  }
}
