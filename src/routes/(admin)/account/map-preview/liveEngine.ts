/**
 * The new map on a real farm: the Mapbox map, the farm's paddocks, pins,
 * trails and crew, and this person's own machine, live.
 *
 * `liveData.ts` does the talking to the server and `recorder.ts` records the
 * trail; this file draws what they return and keeps the camera. The page owns
 * the chrome and talks to the engine through a handful of methods and stores.
 */
import { get, writable, type Writable } from "svelte/store"
// @ts-expect-error -- no type declarations for mapbox-gl 1.x
import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import VehicleMarker from "$lib/components/mapnext/VehicleMarker.svelte"
import {
  ACCURACY_SOURCE,
  FARM_SOURCE,
  HISTORY_SOURCE,
  LABEL_SOURCE,
  MY_TRAIL_SOURCE,
  PIN_LAYER,
  PIN_SOURCE,
  TRAIL_SOURCE,
  applyBase,
  buildStyle,
  setImagery,
  type BaseLook,
  type MapboxMap,
} from "$lib/components/mapnext/mapStyle"
import {
  bearingDeg,
  clamp,
  distanceM,
  easeHeading,
  labelPoint,
  lerp,
  pixelsPerMetre,
  pointInPolygon,
  projector,
  turn,
  type LngLat,
} from "$lib/components/mapnext/geo"
import { formatAgo, formatHa } from "$lib/components/mapnext/format"
import { machineFor, type VehicleType } from "$lib/components/mapnext/machines"
import { drawColour } from "$lib/components/mapnext/palette"
import {
  loadPinGlyphs,
  pinDataUrl,
  pinImageKey,
  pinLabel,
} from "$lib/components/mapnext/pins"
import {
  CrewLink,
  createPin,
  loadCrew,
  loadHistory,
  loadLiveTrails,
  loadPaddocks,
  loadPins,
  loadTrailShape,
  removePin,
  restorePin,
  saveMyMachine,
  watchPins,
  watchTrails,
  type CrewProfile,
  type LivePin,
  type Paddock,
  type TrailInfo,
  type TrailPoint,
  type TrailShape,
  type VehicleMarkerData,
  type VehicleState,
} from "./liveData"
import { TrailRecorder, type FinishedTrail } from "./recorder"

export type GpsState = "idle" | "asking" | "live" | "denied" | "unavailable"
export type FollowMode = "free" | "follow" | "cab"
export type Operation = { id: string; name: string; year?: number | null }

export type Readout = {
  hasFix: boolean
  /** km/h */
  speed: number
  heading: number
  /** Hectares of the trail being recorded (width × distance, so far). */
  ha: number
  /** GPS accuracy in metres, when known. */
  accuracy: number | null
  paddock: { name: string; ha: number } | null
  /** No fix for a while. */
  stale: boolean
  /** On the map, but a long way from this farm. */
  far: boolean
}

export type CrewRow = {
  id: string
  name: string
  guest: boolean
  type: VehicleType
  machineLabel: string
  /** The colour to draw, already translated from the saved name. */
  colour: string
  doing: string
  /** km/h, 0 when stopped or not heard from lately. */
  speed: number
  /** Metres from the viewer, once both are on the map. */
  distance: number | null
  /** Has the map open right now. */
  online: boolean
  /** Not heard from for days. */
  away: boolean
  /** Has ever reported a position on this map. */
  placed: boolean
}

export type ToolView = "home" | "machine" | "pins" | "trails" | "map" | "farm"
export type BaseChoice = { key: string; label: string; note: string }

export type Loading = {
  paddocks: boolean
  pins: boolean
  /** Finished trails drawn so far, and how many there are to draw. */
  trails: { done: number; total: number } | null
}

type Fix = {
  at: LngLat
  /** ms */
  t: number
  accuracy: number | null
  /** m/s from the GPS chip, when it reports one. */
  speed: number | null
  heading: number | null
}

type Vehicle = {
  marker: MapboxMap
  view: VehicleMarker
  type: VehicleType
  pos: LngLat
  /** Where it is pointing, and the smoothed version that is drawn. */
  heading: number
  eased: number
  shownHeading: number
  shownSize: number
}

type Tween = { from: LngLat; to: LngLat; start: number; dur: number }

type CrewEntry = {
  profile: CrewProfile
  state: VehicleState | null
  vehicle: Vehicle | null
  tween: Tween | null
  online: boolean
}

type LiveTrail = { info: TrailInfo; points: TrailPoint[] }

const AUSTRALIA: LngLat = [133.7751, -25.2744]
const DAY = 86_400_000
/** Not heard from for this long: drawn faded, listed as away. */
const AWAY_AFTER = 3 * DAY
/** A position older than this isn't "moving", whatever speed it carried. */
const FRESH_FOR = 30_000
const CHUNK = 400
/** Paddock tones for the drawn map: stubble, canola, pasture, fallow. */
const TONES = [
  "#E0B94F",
  "#D8B04A",
  "#EDD352",
  "#C79A5B",
  "#E3C766",
  "#8FB06E",
  "#E8CC57",
  "#B9A15E",
  "#A9BE7A",
]

const line = (
  coordinates: LngLat[],
  color: string,
  width: number,
  extra: Record<string, unknown> = {},
) => ({
  type: "Feature",
  properties: { color, width, ...extra },
  geometry: { type: "LineString", coordinates },
})
const collection = (features: unknown[]) => ({
  type: "FeatureCollection",
  features,
})

const hash = (text: string) => {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0
  return Math.abs(h)
}

/** Mix a hex colour towards the drawn map's paper. */
function soften(hex: string, amount = 0.45) {
  const full =
    hex.length === 4
      ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
      : hex.slice(0, 7)
  const paper = [230, 222, 194]
  const channel = (i: number) =>
    Math.round(
      lerp(parseInt(full.slice(1 + i * 2, 3 + i * 2), 16), paper[i], amount),
    )
      .toString(16)
      .padStart(2, "0")
  return `#${channel(0)}${channel(1)}${channel(2)}`
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name

export class LiveEngine {
  readonly map: MapboxMap
  readonly gps: Writable<GpsState> = writable("idle")
  readonly follow: Writable<FollowMode> = writable("free")
  readonly ready = writable(false)
  /** Realtime link to the crew is up. */
  readonly linked = writable(false)
  readonly readout: Writable<Readout> = writable({
    hasFix: false,
    speed: 0,
    heading: 0,
    ha: 0,
    accuracy: null,
    paddock: null,
    stale: false,
    far: false,
  })
  readonly crew: Writable<CrewRow[]> = writable([])
  readonly pinCount = writable(0)
  /** How many pins this person has dropped this visit. */
  readonly dropped = writable(0)
  readonly selectedPin: Writable<LivePin | null> = writable(null)
  readonly selectedCrew: Writable<string | null> = writable(null)
  readonly loading: Writable<Loading> = writable({
    paddocks: true,
    pins: true,
    trails: null,
  })
  /** Finished trails of the job on show, newest first. */
  readonly trails: Writable<TrailInfo[]> = writable([])
  readonly farm: Writable<{ paddocks: number; ha: number }> = writable({
    paddocks: 0,
    ha: 0,
  })
  /** Something went wrong that the person should know about. */
  readonly problem: Writable<string | null> = writable(null)
  /** Map bearing in degrees, for the compass on the follow button. */
  readonly bearing = writable(0)
  readonly recorder: TrailRecorder

  private userId: string
  private mapId: string
  private me: VehicleMarkerData
  private base: BaseLook
  private imagery: string | null
  private operation: Operation | null = null

  private paddocks: Paddock[] = []
  private farmBounds: [number, number, number, number] | null = null
  private pinsById = new Map<string, LivePin>()
  private pinDraw = 0
  private pinImages = new Set<string>()
  private crewById = new Map<string, CrewEntry>()
  private onlineIds = new Set<string>()
  private link: CrewLink
  private stops: (() => void)[] = []

  // Trails
  private history: unknown[] = []
  private historyIds = new Set<string>()
  private historyDirty = false
  private liveTrails = new Map<string, LiveTrail>()
  private liveDirty = false
  private trailLoad = 0
  private stopTrailWatch: (() => void) | null = null
  private recordedM = 0
  private recordedCount = 0
  private frozenChunks = 0
  private myTrailDrawn = ""

  // The viewer's own machine
  private mine: Vehicle | null = null
  private lastFix: Fix | null = null
  private courseAnchor: Fix | null = null
  private tween: Tween | null = null
  private speedKmh = 0
  /** The person's saved machine has been read (or they have chosen one). */
  private meKnown = false
  private elsewhereTick = 0
  /** Until the machine has moved, which way it points is a guess. */
  private headingKnown = false
  private lastSent = 0
  private lastRecorded: LngLat | null = null
  private arrived = false

  private armed: string | null = null
  private insets = { left: 0, bottom: 0 }
  private watchId: number | null = null
  private wakeLock: { release: () => Promise<void> } | null = null
  private raf = 0
  private lastFrame = 0
  private slowTick = 0
  private trailTick = 0
  private followPausedUntil = 0
  /** Fingers are on the map: leave the camera alone until they lift. */
  private touching = false
  private destroyed = false

  constructor(
    container: HTMLElement,
    token: string,
    options: {
      userId: string
      mapId: string
      me: VehicleMarkerData
      base: BaseLook
      imagery: string | null
    },
  ) {
    this.userId = options.userId
    this.mapId = options.mapId
    this.me = options.me
    this.base = options.base
    this.imagery = options.imagery
    this.recorder = new TrailRecorder(options.userId)

    mapboxgl.accessToken = token
    this.map = new mapboxgl.Map({
      container,
      style: buildStyle(),
      center: AUSTRALIA,
      zoom: 3.4,
      minZoom: 3,
      maxZoom: 19.5,
      attributionControl: false,
      doubleClickZoom: false,
      pitchWithRotate: false,
      maxPitch: 0,
      fadeDuration: 200,
    })
    this.map.touchZoomRotate.disableRotation()
    this.map.dragRotate.disable()

    // The style, not the first full screen of tiles: on a slow connection the
    // farm should be drawn long before the last imagery tile arrives.
    this.map.once("style.load", () => {
      if (this.destroyed) return
      applyBase(this.map, this.base)
      setImagery(this.map, this.imagery, this.base)
      this.ready.set(true)
      this.drawPaddocks()
      this.drawPins()
      this.historyDirty = true
      this.liveDirty = true
      this.onZoom()
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
    this.map.on(
      "click",
      (e: {
        point: { x: number; y: number }
        lngLat: { lng: number; lat: number }
      }) => {
        if (this.armed) {
          this.dropPin(this.armed, [e.lngLat.lng, e.lngLat.lat])
          return
        }
        // A finger is wider than a pin: look a little around the tap.
        const reach = 16
        const hits = this.map.getLayer(PIN_LAYER)
          ? this.map.queryRenderedFeatures(
              [
                [e.point.x - reach, e.point.y - reach],
                [e.point.x + reach, e.point.y + reach],
              ],
              { layers: [PIN_LAYER] },
            )
          : []
        const id = hits[0]?.properties?.id as string | undefined
        const pin = id ? this.pinsById.get(id) : undefined
        this.selectedCrew.set(null)
        this.selectedPin.update((current) =>
          pin && current?.id !== pin.id ? pin : null,
        )
      },
    )
    this.map.on("mouseenter", PIN_LAYER, () => {
      if (!this.armed) this.map.getCanvas().style.cursor = "pointer"
    })
    this.map.on("mouseleave", PIN_LAYER, () => {
      if (!this.armed) this.map.getCanvas().style.cursor = ""
    })
    this.selectedPin.subscribe((pin) => {
      if (get(this.ready))
        this.map.setFilter("mv-pin-halo", ["==", ["get", "id"], pin?.id ?? ""])
    })
    document.addEventListener("visibilitychange", this.onVisibility)

    this.link = new CrewLink(this.mapId, this.userId, {
      vehicle: (state) => this.onVehicle(state),
      gone: (id) => this.dropCrew(id),
      online: (ids) => {
        this.onlineIds = ids
        for (const [id, entry] of this.crewById) entry.online = ids.has(id)
        this.publishCrew()
      },
      crewChanged: () => this.refreshCrew(),
      linked: (ok) => this.linked.set(ok),
    })
  }

  // ── Loading the farm ────────────────────────────────────────────────────

  /** Read the farm and start listening for changes. */
  connect() {
    loadPaddocks(this.mapId)
      .then((paddocks) => {
        if (this.destroyed) return
        this.paddocks = paddocks
        // The farm's extent, known as soon as the paddocks are (the map may
        // not be ready to draw them yet, but it can already be aimed).
        this.farmBounds = paddocks.length
          ? [
              Math.min(...paddocks.map((p) => p.bbox[0])),
              Math.min(...paddocks.map((p) => p.bbox[1])),
              Math.max(...paddocks.map((p) => p.bbox[2])),
              Math.max(...paddocks.map((p) => p.bbox[3])),
            ]
          : null
        this.farm.set({
          paddocks: paddocks.length,
          ha: paddocks.reduce((sum, p) => sum + p.ha, 0),
        })
        this.drawPaddocks()
        if (!this.arrived) this.fitFarm(0)
        else if (this.lastFix && this.farAway(this.lastFix.at)) {
          // Their first fix beat the paddocks here, and it is nowhere near
          // this farm: show the farm rather than where they are sitting.
          this.readout.update((r) => ({ ...r, far: true }))
          this.fitFarm(0)
        }
      })
      .catch(() => this.problem.set("Couldn't load the paddocks."))
      .finally(() => this.loading.update((l) => ({ ...l, paddocks: false })))

    loadPins(this.mapId)
      .then((pins) => {
        if (this.destroyed) return
        for (const pin of pins) this.pinsById.set(pin.id, pin)
        this.drawPins()
        if (!this.arrived && !this.paddocks.length) this.fitFarm(0)
      })
      .catch(() => this.problem.set("Couldn't load the pins."))
      .finally(() => this.loading.update((l) => ({ ...l, pins: false })))
    this.stops.push(
      watchPins(this.mapId, {
        upsert: (pin) => {
          this.pinsById.set(pin.id, pin)
          if (get(this.selectedPin)?.id === pin.id) this.selectedPin.set(pin)
          this.drawPins()
        },
        remove: (id) => this.forgetPin(id),
      }),
    )

    this.refreshCrew()
    this.link.start()
    this.recorder.resume().then(() => this.onRecorderChange())
    this.stops.push(
      this.recorder.state.subscribe(() => this.onRecorderChange()),
    )
  }

  private refreshing = false
  private async refreshCrew() {
    if (this.refreshing || this.destroyed) return
    this.refreshing = true
    try {
      const { crew, vehicles } = await loadCrew(this.mapId, this.userId)
      if (this.destroyed) return
      const connected = new Set(crew.map((p) => p.id))
      for (const id of [...this.crewById.keys()])
        if (!connected.has(id)) this.dropCrew(id)
      for (const profile of crew) {
        const entry = this.crewById.get(profile.id)
        if (entry) {
          entry.profile = profile
          entry.vehicle?.view.$set({ label: this.tagFor(entry) })
        } else
          this.crewById.set(profile.id, {
            profile,
            state: null,
            vehicle: null,
            tween: null,
            online: this.onlineIds.has(profile.id),
          })
      }
      for (const state of vehicles) this.onVehicle(state)
      this.publishCrew()
    } catch {
      // The crew list simply stays as it was; the next refresh tries again.
    } finally {
      this.refreshing = false
    }
  }

  // ── Paddocks ────────────────────────────────────────────────────────────

  private drawPaddocks() {
    if (!get(this.ready)) return
    const features: unknown[] = []
    const labels: unknown[] = []
    for (const paddock of this.paddocks) {
      features.push({
        type: "Feature",
        properties: {
          id: paddock.id,
          fill: paddock.colour
            ? soften(paddock.colour)
            : TONES[hash(paddock.id) % TONES.length],
          tint: paddock.colour ?? "#F4F1E6",
          wash: paddock.colour ? 0.2 : 0.07,
        },
        geometry: { type: "MultiPolygon", coordinates: paddock.polygons },
      })
      // One name per paddock, on its biggest part.
      let biggest = paddock.polygons[0]
      let size = 0
      for (const polygon of paddock.polygons) {
        const xs = polygon[0].map((p) => p[0])
        const ys = polygon[0].map((p) => p[1])
        const area =
          (Math.max(...xs) - Math.min(...xs)) *
          (Math.max(...ys) - Math.min(...ys))
        if (area > size) {
          size = area
          biggest = polygon
        }
      }
      labels.push({
        type: "Feature",
        properties: {
          name: paddock.name,
          sub: paddock.ha > 0 ? `${formatHa(paddock.ha)} ha` : "",
        },
        geometry: { type: "Point", coordinates: labelPoint(biggest) },
      })
    }
    this.map.getSource(FARM_SOURCE).setData(collection(features))
    this.map.getSource(LABEL_SOURCE).setData(collection(labels))
  }

  private paddockAt(at: LngLat) {
    for (const paddock of this.paddocks) {
      const [w, s, e, n] = paddock.bbox
      if (at[0] < w || at[0] > e || at[1] < s || at[1] > n) continue
      if (paddock.polygons.some((rings) => pointInPolygon(at, rings)))
        return paddock
    }
    return null
  }

  /** Show the whole farm (its paddocks, or its pins if it has none). */
  fitFarm(duration = 900) {
    let bounds = this.farmBounds
    if (!bounds && this.pinsById.size) {
      const pins = [...this.pinsById.values()]
      bounds = [
        Math.min(...pins.map((p) => p.at[0])),
        Math.min(...pins.map((p) => p.at[1])),
        Math.max(...pins.map((p) => p.at[0])),
        Math.max(...pins.map((p) => p.at[1])),
      ]
    }
    if (!bounds) return false
    this.setFollow("free")
    this.map.fitBounds(
      [
        [bounds[0], bounds[1]],
        [bounds[2], bounds[3]],
      ],
      {
        padding: {
          top: 90,
          right: 50,
          bottom: 60 + this.insets.bottom,
          left: 50 + this.insets.left,
        },
        maxZoom: 15.5,
        duration,
      },
    )
    return true
  }

  // ── Pins ────────────────────────────────────────────────────────────────

  private lookOf = (pin: LivePin) => ({
    iconClass: pin.iconClass,
    colour: pin.colour,
    gateOpen: pin.gateOpen,
    rockPicked: pin.rockPicked,
    fill: pin.fill,
    grainColour: pin.grainColour,
  })

  private addPinImage(key: string) {
    return new Promise<void>((resolve) => {
      const image = new Image(96, 96)
      image.onload = () => {
        if (!this.destroyed && !this.map.hasImage(key))
          this.map.addImage(key, image, { pixelRatio: 2 })
        this.pinImages.add(key)
        resolve()
      }
      image.onerror = () => resolve()
      image.src = pinDataUrl(key, 96)
    })
  }

  /** Redraw the pin layer, drawing any pin art it hasn't used before first. */
  private async drawPins() {
    this.pinCount.set(this.pinsById.size)
    if (!get(this.ready)) return
    const turnNumber = ++this.pinDraw
    await loadPinGlyphs()
    const pins = [...this.pinsById.values()]
    const features = pins.map((pin) => {
      const image = pinImageKey(this.lookOf(pin))
      const bin = pin.grainType || pin.fill > 0
      return {
        type: "Feature",
        properties: {
          id: pin.id,
          image,
          note: pin.noteVisible
            ? pin.note ||
              (bin
                ? [pin.grainType, `${Math.round(pin.fill)}%`]
                    .filter(Boolean)
                    .join(" · ")
                : "")
            : "",
        },
        geometry: { type: "Point", coordinates: pin.at },
      }
    })
    const missing = [
      ...new Set(features.map((f) => f.properties.image)),
    ].filter((key) => !this.pinImages.has(key))
    await Promise.all(missing.map((key) => this.addPinImage(key)))
    if (this.destroyed || turnNumber !== this.pinDraw) return
    this.map.getSource(PIN_SOURCE)?.setData(collection(features))
  }

  private forgetPin(id: string) {
    if (!this.pinsById.delete(id)) return
    if (get(this.selectedPin)?.id === id) this.selectedPin.set(null)
    this.drawPins()
  }

  armPin(iconClass: string | null) {
    this.armed = iconClass
    if (iconClass) {
      this.selectedPin.set(null)
      this.selectedCrew.set(null)
    }
    this.map.getCanvas().style.cursor = iconClass ? "crosshair" : ""
  }

  /** Drop a pin; with no position, at the viewer's machine (or mid-screen). */
  async dropPin(iconClass: string, at?: LngLat) {
    const centre = this.map.getCenter()
    const where = at ?? this.mine?.pos ?? [centre.lng, centre.lat]
    try {
      const pin = await createPin(this.mapId, this.userId, iconClass, where)
      this.pinsById.set(pin.id, pin)
      this.dropped.update((n) => n + 1)
      this.drawPins()
      return pin
    } catch {
      this.problem.set(
        navigator.onLine
          ? "That pin didn't save. Try again."
          : "No signal: that pin didn't save.",
      )
      return null
    }
  }

  async removePin(id: string) {
    const pin = this.pinsById.get(id)
    if (!pin) return null
    this.forgetPin(id)
    try {
      await removePin(id)
      return pin
    } catch {
      this.pinsById.set(id, pin)
      this.drawPins()
      this.problem.set("That pin couldn't be removed. Try again.")
      return null
    }
  }

  /** Put back a pin that was just removed. */
  async restorePin(pin: LivePin) {
    try {
      await restorePin(pin.id)
      this.pinsById.set(pin.id, pin)
      this.drawPins()
    } catch {
      this.problem.set("That pin couldn't be put back.")
    }
  }

  pinName = (pin: LivePin) => pin.note || pinLabel(pin.iconClass)

  // ── Crew ────────────────────────────────────────────────────────────────

  private tagFor(entry: CrewEntry) {
    const name =
      firstName(entry.profile.name) + (entry.profile.guest ? " (guest)" : "")
    const age = entry.state ? Date.now() - entry.state.t : 0
    return age > AWAY_AFTER ? `${name} · ${Math.floor(age / DAY)}d` : name
  }

  private onVehicle(state: VehicleState) {
    const entry = this.crewById.get(state.id)
    // Rows linger after someone leaves a map: only the connected crew count.
    if (!entry) return
    if (entry.state && state.t < entry.state.t) return
    const previous = entry.state
    // A broadcast between phones may leave the machine out; keep what we had.
    entry.state = { ...state, marker: state.marker ?? previous?.marker ?? null }
    const marker = entry.state.marker
    if (!state.at || !marker) return

    const spec = machineFor(marker.type)
    const colour = drawColour(marker.bodyColor)
    if (!entry.vehicle) {
      entry.vehicle = this.mountVehicle(
        spec.type,
        colour,
        this.tagFor(entry),
        state.at,
        false,
      )
      const el = entry.vehicle.marker.getElement() as HTMLElement
      el.addEventListener("click", (event) => {
        event.stopPropagation()
        if (this.armed) return
        this.selectedPin.set(null)
        this.selectedCrew.update((id) => (id === state.id ? null : state.id))
      })
      entry.vehicle.view.$set({ tappable: true })
      if (state.heading !== null) entry.vehicle.heading = state.heading
      this.onZoom()
    } else {
      const vehicle = entry.vehicle
      if (vehicle.type !== spec.type) {
        vehicle.type = spec.type
        vehicle.shownSize = 0
        vehicle.view.$set({ art: spec.type })
        this.onZoom()
      }
      vehicle.view.$set({ colour })
      if (state.heading !== null) vehicle.heading = state.heading
      const moved = distanceM(vehicle.pos, state.at)
      if (moved > 250 || !previous) {
        vehicle.pos = state.at
        entry.tween = null
      } else if (moved > 0.05) {
        entry.tween = {
          from: vehicle.pos,
          to: state.at,
          start: performance.now(),
          dur: clamp(state.t - previous.t, 300, 1500),
        }
      }
    }
    entry.vehicle.view.$set({
      label: this.tagFor(entry),
      away: Date.now() - state.t > AWAY_AFTER,
    })
  }

  private dropCrew(id: string) {
    const entry = this.crewById.get(id)
    if (!entry) return
    entry.vehicle?.view.$destroy()
    entry.vehicle?.marker.remove()
    this.crewById.delete(id)
    if (get(this.selectedCrew) === id) this.selectedCrew.set(null)
    this.publishCrew()
  }

  private publishCrew() {
    const now = Date.now()
    const mine = this.mine
    const rows: (CrewRow & { seen: number })[] = []
    for (const [id, entry] of this.crewById) {
      const state = entry.state
      const marker = state?.marker
      const spec = machineFor(marker?.type)
      const age = state?.t ? now - state.t : Infinity
      const moving = !!state && age < FRESH_FOR && state.speed >= 0.7
      const where = state?.at ? this.paddockAt(state.at) : null
      let doing: string
      if (!state?.at)
        doing = entry.online
          ? "On the map, no position yet"
          : "Not on the map yet"
      else if (moving)
        doing =
          (state.trailing && spec.paints ? spec.verb : "On the move") +
          (where ? ` · ${where.name}` : "")
      else if (age < 10 * 60_000)
        doing = where ? `Stopped · ${where.name}` : "Stopped"
      else doing = `Last seen ${formatAgo(state.t, now)}`
      rows.push({
        id,
        name: entry.profile.name,
        guest: entry.profile.guest,
        type: spec.type,
        machineLabel: spec.label,
        colour: drawColour(marker?.bodyColor),
        doing,
        speed: moving ? Math.round(state!.speed) : 0,
        distance:
          mine && entry.vehicle ? distanceM(mine.pos, entry.vehicle.pos) : null,
        online: entry.online,
        away: age > AWAY_AFTER,
        placed: !!state?.at,
        seen: state?.t ?? 0,
      })
    }
    rows.sort((a, b) => Number(b.online) - Number(a.online) || b.seen - a.seen)
    this.crew.set(rows)
  }

  /** Look at a crew member (and stop following yourself). */
  lookAt(id: string) {
    const vehicle = this.crewById.get(id)?.vehicle
    if (!vehicle) return false
    this.setFollow("free")
    this.map.easeTo({
      center: vehicle.pos,
      zoom: Math.max(this.map.getZoom(), 15),
      offset: [this.insets.left / 2, -this.insets.bottom / 2],
      duration: 900,
    })
    return true
  }

  // ── Trails ──────────────────────────────────────────────────────────────

  /** Show the trails of one job (or none). */
  setOperation(operation: Operation | null) {
    if (operation?.id === this.operation?.id) {
      this.operation = operation
      return
    }
    this.operation = operation
    const load = ++this.trailLoad
    this.stopTrailWatch?.()
    this.stopTrailWatch = null
    this.history = []
    this.historyIds.clear()
    this.historyDirty = true
    this.liveTrails.clear()
    this.liveDirty = true
    this.trails.set([])
    if (!operation) {
      this.loading.update((l) => ({ ...l, trails: null }))
      return
    }
    const current = () => load === this.trailLoad && !this.destroyed

    this.loading.update((l) => ({ ...l, trails: { done: 0, total: 0 } }))
    let done = 0
    loadHistory(
      operation.id,
      (shape) => {
        this.addHistory(shape)
        done++
        this.loading.update((l) =>
          l.trails ? { ...l, trails: { ...l.trails, done } } : l,
        )
      },
      () => !current(),
    )
      .then((trails) => {
        if (!current()) return
        this.trails.update((already) => {
          const ids = new Set(trails.map((t) => t.id))
          return [...already.filter((t) => !ids.has(t.id)), ...trails].sort(
            (a, b) => b.start - a.start,
          )
        })
      })
      .catch(() => {
        if (current()) this.problem.set("Couldn't load the trails.")
      })
      .finally(() => {
        if (current()) this.loading.update((l) => ({ ...l, trails: null }))
      })

    loadLiveTrails(operation.id, this.userId)
      .then((live) => {
        if (!current()) return
        for (const trail of live) this.liveTrails.set(trail.info.id, trail)
        this.liveDirty = true
      })
      .catch(() => {})

    this.stopTrailWatch = watchTrails(operation.id, this.userId, {
      started: (info) => {
        if (this.liveTrails.has(info.id) || this.historyIds.has(info.id)) return
        // One live trail per machine: a new one replaces an older one.
        for (const [id, trail] of this.liveTrails)
          if (trail.info.vehicleId === info.vehicleId)
            this.liveTrails.delete(id)
        this.liveTrails.set(info.id, { info, points: [] })
        this.liveDirty = true
      },
      point: (trailId, point) => {
        const trail = this.liveTrails.get(trailId)
        if (!trail) return
        const last = trail.points[trail.points.length - 1]
        if (last && point.t <= last.t) {
          if (trail.points.some((p) => p.t === point.t)) return
          trail.points.push(point)
          trail.points.sort((a, b) => a.t - b.t)
        } else trail.points.push(point)
        this.liveDirty = true
      },
      finished: (info) => {
        if (this.historyIds.has(info.id)) return
        loadTrailShape(info).then((shape) => {
          if (!current() || !shape) return
          this.liveTrails.delete(info.id)
          this.liveDirty = true
          this.addHistory(shape)
          this.trails.update((list) => [
            info,
            ...list.filter((t) => t.id !== info.id),
          ])
        })
      },
      deleted: (id) => {
        if (this.liveTrails.delete(id)) this.liveDirty = true
        if (this.historyIds.delete(id)) {
          this.history = this.history.filter(
            (f) => (f as { properties: { id: string } }).properties.id !== id,
          )
          this.historyDirty = true
          this.trails.update((list) => list.filter((t) => t.id !== id))
        }
      },
    })
  }

  private addHistory(shape: TrailShape) {
    const { info } = shape
    if (this.historyIds.has(info.id)) return
    this.historyIds.add(info.id)
    const properties = {
      id: info.id,
      color: drawColour(info.colour),
      width: info.width,
    }
    this.history.push({ type: "Feature", properties, geometry: shape.path })
    if (shape.pausePath)
      this.history.push({
        type: "Feature",
        properties: { ...properties, segment: "pause" },
        geometry: shape.pausePath,
      })
    this.historyDirty = true
  }

  /** Bring a finished trail into view. */
  lookAtTrail(id: string) {
    const feature = this.history.find(
      (f) => (f as { properties: { id: string } }).properties.id === id,
    ) as { geometry: { type: string; coordinates: unknown } } | undefined
    if (!feature) return false
    const points = (
      feature.geometry.type === "LineString"
        ? [feature.geometry.coordinates]
        : feature.geometry.coordinates
    ) as LngLat[][]
    let w = Infinity
    let s = Infinity
    let e = -Infinity
    let n = -Infinity
    for (const part of points)
      for (const [lng, lat] of part) {
        w = Math.min(w, lng)
        e = Math.max(e, lng)
        s = Math.min(s, lat)
        n = Math.max(n, lat)
      }
    if (!Number.isFinite(w)) return false
    this.setFollow("free")
    this.map.fitBounds(
      [
        [w, s],
        [e, n],
      ],
      {
        padding: {
          top: 100,
          right: 60,
          bottom: 80 + this.insets.bottom,
          left: 60 + this.insets.left,
        },
        maxZoom: 16.5,
        duration: 900,
      },
    )
    return true
  }

  private drawTrails() {
    if (this.historyDirty) {
      this.historyDirty = false
      this.map.getSource(HISTORY_SOURCE)?.setData(collection(this.history))
    }

    const recording = get(this.recorder.state).trail
    const points = recording ? this.recorder.points : []
    const colour = recording ? drawColour(recording.colour) : ""
    const width = recording?.width ?? 0

    // Long trails are drawn in stretches. The finished stretches of my own
    // trail ride along with the crew's live trails, which change seldom; only
    // the stretch still being laid is redrawn as the machine moves.
    const frozen = Math.max(0, Math.floor((points.length - 1) / CHUNK) - 1)
    if (frozen !== this.frozenChunks) {
      this.frozenChunks = frozen
      this.liveDirty = true
    }
    if (this.liveDirty) {
      this.liveDirty = false
      const features: unknown[] = []
      for (const trail of this.liveTrails.values()) {
        const coords = trail.points.map((p) => p.at)
        for (let i = 0; i < coords.length - 1; i += CHUNK)
          features.push(
            line(
              coords.slice(i, i + CHUNK + 1),
              drawColour(trail.info.colour),
              trail.info.width,
            ),
          )
      }
      for (let i = 0; i < frozen; i++)
        features.push(
          line(
            points.slice(i * CHUNK, (i + 1) * CHUNK + 1).map((p) => p.at),
            colour,
            width,
          ),
        )
      this.map.getSource(TRAIL_SOURCE)?.setData(collection(features))
    }

    const mineLines: unknown[] = []
    if (recording && points.length) {
      const tail = points.slice(frozen * CHUNK).map((p) => p.at)
      // The stretch being painted runs right up to the machine.
      if (this.mine && this.speedKmh >= 0.7 && this.painting())
        tail.push(this.mine.pos)
      for (let i = 0; i < tail.length - 1; i += CHUNK)
        mineLines.push(line(tail.slice(i, i + CHUNK + 1), colour, width))
    }
    const lead = this.mine && mineLines.length ? this.mine.pos.join() : ""
    const drawn = `${recording?.id ?? ""}|${points.length}|${lead}`
    if (drawn === this.myTrailDrawn) return
    this.myTrailDrawn = drawn
    this.map.getSource(MY_TRAIL_SOURCE)?.setData(collection(mineLines))
  }

  /** A trail is running, so each fix lays a point. */
  private painting() {
    return this.recorder.recording
  }

  private onRecorderChange() {
    const { trail } = get(this.recorder.state)
    const points = this.recorder.points
    if (!trail) {
      this.recordedM = 0
      this.recordedCount = 0
      this.lastRecorded = null
      this.readout.update((r) => (r.ha ? { ...r, ha: 0 } : r))
      return
    }
    // A trail picked up from the server: measure what is already laid.
    if (points.length && !this.recordedCount) {
      for (let i = 1; i < points.length; i++)
        this.recordedM += distanceM(points[i - 1].at, points[i].at)
      this.recordedCount = points.length
      this.lastRecorded = points[points.length - 1].at
      this.readout.update((r) => ({ ...r, ha: this.hectares(trail.width) }))
    }
  }

  private hectares(width: number) {
    return (this.recordedM * width) / 10000
  }

  /** Start painting. Resolves false (with `recorder.state.problem`) if not. */
  async startTrail(operator: { id: string; name: string } | null) {
    if (!this.operation || !this.meKnown) return false
    await this.recorder.start(this.operation.id, this.me, operator)
    const started = this.recorder.recording
    if (started) {
      this.link.saveSoon()
      this.sendNow()
    }
    return started
  }

  /** Record the trail found running elsewhere from this screen instead. */
  carryOnTrail() {
    this.recorder.carryOn()
    this.link.saveSoon()
    this.sendNow()
  }

  async stopTrail(): Promise<FinishedTrail | null> {
    const finished = await this.recorder.stop()
    if (this.recorder.recording) return null
    this.link.saveSoon()
    this.sendNow()
    if (finished) {
      const coords = finished.points.map((p) => p.at)
      this.addHistory({
        info: finished.info,
        path: { type: "LineString", coordinates: coords },
        pausePath: null,
      })
      this.trails.update((list) => [finished.info, ...list])
    }
    return finished
  }

  // ── What the page can ask for ───────────────────────────────────────────

  /** A different machine, colour or width. Saved for the crew straight away. */
  setMe(marker: VehicleMarkerData, save = true) {
    this.me = marker
    this.meKnown = true
    if (this.mine) {
      const spec = machineFor(marker.type)
      this.mine.type = spec.type
      this.mine.shownSize = 0
      this.mine.view.$set({
        art: spec.type,
        colour: drawColour(marker.bodyColor),
      })
      this.onZoom()
    }
    if (!save) return
    if (this.lastFix) {
      this.link.saveSoon()
      this.sendNow()
    } else
      saveMyMachine(this.userId, this.mapId, marker).catch(() =>
        this.problem.set("Your machine didn't save. Try again."),
      )
  }

  setBase(look: BaseLook, imagery: string | null) {
    this.base = look
    const changed = imagery !== this.imagery
    this.imagery = imagery
    if (!get(this.ready)) return
    if (changed) setImagery(this.map, imagery, look)
    applyBase(this.map, look)
  }

  /** Space the chrome covers, so "centred" means centred in what's left. */
  setInsets(left: number, bottom: number) {
    this.insets = { left, bottom }
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

  /** Where the viewer's machine is drawn right now, if it is on the map. */
  myPosition(): LngLat | null {
    return this.mine?.pos ?? null
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
        this.gps.set("live")
        this.onFix({
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
        })
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) this.gps.set("denied")
        else if (get(this.gps) !== "live") this.gps.set("unavailable")
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 },
    )
    this.keepAwake()
  }

  /** First fix: go to the viewer if they are on (or near) this farm. */
  private arrive(at: LngLat) {
    this.arrived = true
    const far = this.farAway(at)
    this.readout.update((r) => ({ ...r, far }))
    if (far) return
    this.map.jumpTo({ center: at, zoom: 15.4 })
    this.follow.set("follow")
  }

  private farAway(at: LngLat) {
    const bounds = this.farmBounds
    if (!bounds) return false
    const centre: LngLat = [
      (bounds[0] + bounds[2]) / 2,
      (bounds[1] + bounds[3]) / 2,
    ]
    return distanceM(at, centre) > 40_000
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

  private mountVehicle(
    type: VehicleType,
    colour: string,
    label: string,
    at: LngLat,
    me: boolean,
  ): Vehicle {
    const el = document.createElement("div")
    const view = new VehicleMarker({
      target: el,
      props: { art: type, colour, label, me, size: 44 },
    })
    const marker = new mapboxgl.Marker({ element: el })
      .setLngLat(at)
      .addTo(this.map)
    marker.getElement().style.zIndex = me ? "4" : "3"
    return {
      marker,
      view,
      type,
      pos: at,
      heading: 0,
      eased: NaN,
      shownHeading: NaN,
      shownSize: 0,
    }
  }

  private onFix(fix: Fix) {
    // A fix this vague would put the machine in the wrong paddock.
    if (fix.accuracy !== null && fix.accuracy > 100 && this.mine) return
    const previous = this.lastFix
    const now = performance.now()
    const jumped =
      !previous ||
      distanceM(previous.at, fix.at) > 150 ||
      fix.t - previous.t > 30000

    if (!this.mine) {
      this.mine = this.mountVehicle(
        machineFor(this.me.type).type,
        drawColour(this.me.bodyColor),
        "You",
        fix.at,
        true,
      )
      this.onZoom()
    }
    if (!this.arrived) this.arrive(fix.at)

    // Speed: trust the GPS chip when it reports one, else work it out.
    if (fix.speed !== null) {
      this.speedKmh = lerp(this.speedKmh, fix.speed * 3.6, 0.6)
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
    const anchor = this.courseAnchor
    if (!anchor || jumped || fix.t - anchor.t > 10000) {
      this.courseAnchor = fix
    } else if (distanceM(anchor.at, fix.at) >= 5) {
      heading = bearingDeg(anchor.at, fix.at)
      this.courseAnchor = fix
      this.headingKnown = true
    } else if (fix.heading !== null && this.speedKmh >= 4) {
      heading = fix.heading
      this.headingKnown = true
    }
    this.mine.heading = heading

    if (jumped) {
      this.mine.pos = fix.at
      this.tween = null
      this.lastRecorded = null
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
    this.record(fix)

    const paddock = this.paddockAt(fix.at)
    const recording = get(this.recorder.state).trail
    this.readout.update((r) => ({
      ...r,
      hasFix: true,
      speed: this.speedKmh,
      heading,
      ha: recording ? this.hectares(recording.width) : 0,
      accuracy: fix.accuracy,
      paddock: paddock ? { name: paddock.name, ha: paddock.ha } : null,
      stale: false,
    }))

    // Tell the crew: every fix that moved or turned, at most once a second.
    if (Date.now() - this.lastSent >= 900) this.sendNow()
  }

  /** Lay a trail point for this fix, if a trail is running. */
  private record(fix: Fix) {
    if (!this.painting()) return
    if (fix.accuracy !== null && fix.accuracy > 100) return
    const last = this.lastRecorded
    if (last) {
      const moved = distanceM(last, fix.at)
      // GPS wobble while parked isn't coverage.
      if (moved < 1) return
      if (moved < 150) this.recordedM += moved
    }
    this.lastRecorded = fix.at
    this.recordedCount++
    this.recorder.add(fix.at, fix.t)
  }

  private sendNow() {
    const fix = this.lastFix
    if (!fix) return
    // Never write a machine we haven't read yet: the placeholder would
    // replace the one this person saved.
    if (!this.meKnown) return
    // Their machine is out laying a trail from another screen. That screen
    // says where they are; this one would only drag them across the map.
    if (this.recorder.elsewhere) return
    this.lastSent = Date.now()
    this.link.send({
      userId: this.userId,
      mapId: this.mapId,
      at: fix.at,
      t: fix.t,
      heading: this.headingKnown ? (this.mine?.heading ?? null) : null,
      speed: this.speedKmh,
      trailing: this.recorder.recording,
      marker: this.me,
      operation: this.operation
        ? { id: this.operation.id, name: this.operation.name }
        : null,
    })
  }

  private showAccuracy(fix: Fix) {
    const source = this.map.getSource(ACCURACY_SOURCE)
    if (!source) return
    const radius = fix.accuracy ?? 0
    if (radius < 12) {
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

  // ── Every frame ─────────────────────────────────────────────────────────

  private frame = (now: number) => {
    if (this.destroyed) return
    const dt = Math.min(0.25, (now - this.lastFrame) / 1000)
    this.lastFrame = now
    const bearing = this.map.getBearing()

    for (const entry of this.crewById.values()) {
      const vehicle = entry.vehicle
      if (!vehicle) continue
      if (entry.tween) {
        const t = clamp((now - entry.tween.start) / entry.tween.dur, 0, 1)
        vehicle.pos = [
          lerp(entry.tween.from[0], entry.tween.to[0], t),
          lerp(entry.tween.from[1], entry.tween.to[1], t),
        ]
        if (t >= 1) entry.tween = null
        vehicle.marker.setLngLat(vehicle.pos)
      }
      vehicle.eased = Number.isNaN(vehicle.eased)
        ? vehicle.heading
        : easeHeading(vehicle.eased, vehicle.heading, 1 - Math.exp(-dt * 5))
      this.turnTo(vehicle, vehicle.eased - bearing)
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
    this.trailTick -= dt
    if (this.trailTick <= 0) {
      this.trailTick = 0.25
      this.drawTrails()
    }
    this.slowTick -= dt
    if (this.slowTick <= 0) {
      this.slowTick = 1
      this.publishCrew()
      if (this.recorder.elsewhere && ++this.elsewhereTick >= 45) {
        this.elsewhereTick = 0
        this.recorder.recheck()
      }
      const fix = this.lastFix
      if (fix && Date.now() - fix.t > 15000)
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

  /** Machines are drawn to scale up close and never shrink to a dot. */
  private onZoom = () => {
    const zoom = this.map.getZoom()
    const ppm = pixelsPerMetre(zoom, this.map.getCenter().lat)
    // Zoomed right out, the whole crew sits close together: ease them down.
    const far = clamp((zoom - 10.5) / 3, 0.62, 1)
    const resize = (vehicle: Vehicle) => {
      const spec = machineFor(vehicle.type)
      const size = Math.round(clamp(spec.span * ppm, spec.minPx * far, 190))
      if (size === vehicle.shownSize) return
      vehicle.shownSize = size
      vehicle.view.$set({ size })
    }
    for (const entry of this.crewById.values())
      if (entry.vehicle) resize(entry.vehicle)
    if (this.mine) resize(this.mine)
  }

  destroy() {
    this.destroyed = true
    cancelAnimationFrame(this.raf)
    document.removeEventListener("visibilitychange", this.onVisibility)
    if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId)
    this.wakeLock?.release().catch(() => {})
    this.stops.forEach((stop) => stop())
    this.stopTrailWatch?.()
    this.link.stop()
    this.recorder.destroy()
    for (const entry of this.crewById.values()) entry.vehicle?.view.$destroy()
    this.mine?.view.$destroy()
    this.map.remove()
  }
}
