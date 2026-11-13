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
import SelectedPin from "$lib/components/mapnext/SelectedPin.svelte"
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
  breathe,
  MEASURE_SOURCE,
  showLayers,
  showPickedMarks,
  showArrowsTo,
  showDrawingsFor,
  FEATURE_LAYERS,
  FEATURE_SOURCE,
  LASSO_SOURCE,
  DRAWING_LAYERS,
  DRAWING_SOURCE,
  ARROW_SOURCE,
  PICKED_ARROW_SOURCE,
  pickPaddock,
  pinPixels,
  pickTrail as paintPickedTrail,
  PICKED_TRAIL_SOURCE,
  REPLAY_SOURCE,
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
import { blockColour, drawColour } from "$lib/components/mapnext/palette"
import {
  loadPinGlyphs,
  pinDataUrl,
  pinColour,
  pinImageKey,
  pinLabel,
  type PinLook,
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
  loadTrailTimeline,
  deleteTrail,
  patchPin,
  setPinNote,
  loadDrawings,
  watchDrawings,
  addPaddockFeature,
  removePaddockFeature,
  cutPaddock,
  type JobItem,
  createDrawing,
  deleteDrawing,
  addPinPhoto,
  removePinPhoto,
  type PinDrawing,
  type PinPhoto,
  type PinPatch,
  patchPaddock,
  deletePaddock,
  loadFarmNames,
  type FarmName,
  type PaddockPatch,
  flashLabel,
  type Flash,
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
  /** This is the viewer's own row. */
  me: boolean
  /** The job they have on the map ("Spraying"…), if any. */
  operation: string | null
  /** Laying a trail right now. */
  trailing: boolean
  /** When they were last heard from (ms), 0 if never. */
  seen: number
}

export type ToolView =
  | "home"
  | "messages"
  | "jobs"
  | "crew"
  | "machine"
  | "pins"
  | "trails"
  | "paddocks"
  | "map"
  | "layers"
  | "broadcast"
  | "farm"
export type BaseChoice = { key: string; label: string; note: string }

/** This person's own marker colour settings (which colour a pin gets). */
export type PinSettings = {
  markerDefaultColor?: string | null
  markerTypeDefaultColors?: Record<string, string> | null
}

/** What the measure tool has so far. */
export type Measure = {
  points: number
  /** Metres along the line tapped out. */
  distance: number
  /** Hectares inside it, once there are three corners. */
  ha: number
  /** Measuring an area (the shape closes) or a line. */
  kind: "polygon" | "line"
  /** The paddock the first corner sits in, if it is in one. */
  paddock: { id: string; name: string } | null
  /** Being kept: a save is on its way. */
  keeping?: boolean
  /** Set when what is being tapped out will be attached to a pin. */
  drawing?: {
    pinId: string
    kind: "polygon" | "line"
    colour: string
    saving: boolean
  }
}

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

export type ReplayState = {
  trailId: string
  phase: "loading" | "playing" | "paused" | "done"
  /** How far through the trail, 0 to 1. */
  progress: number
  /** The time of day the machine was at this point (ms). */
  time: number
  /** Playback speed: 1, 2, 4 or 8 times the base pace. */
  rate: number
  /** Timed from the trail's own record, not spread evenly start to finish. */
  timed: boolean
}

type ReplayPoint = {
  at: LngLat
  /** When the machine was here (ms). */
  t: number
  /** Metres driven to here along its stretch of the trail. */
  along: number
  /** Position on the playback axis: working time so far, stops shortened. */
  axis: number
  part: number
}

type Replay = {
  info: TrailInfo
  points: ReplayPoint[]
  /** Each stretch's coordinates and where it starts in `points`. */
  parts: { coords: LngLat[]; from: number }[]
  total: number
  cursor: number
  index: number
  /** Seconds the whole trail takes at 1×. */
  seconds: number
  vehicle: Vehicle
  colour: string
  drawn: number
  told: number
  /** Metres of trail before each stretch begins (for the arrows). */
  offsets: number[]
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
  /** The job they are on, as their machine last said it. */
  operation?: string | null
  state: VehicleState | null
  vehicle: Vehicle | null
  tween: Tween | null
  online: boolean
}

type LiveTrail = { info: TrailInfo; points: TrailPoint[] }

/** How long a broadcast runs before it stops itself. */
export const BROADCAST_FOR = 5 * 60_000

/** `selectedCrew` holds this when the viewer's own machine is picked. */
export const ME = "me"

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

/** Metres of ground between direction arrows (the current viewer's 30). */
const ARROW_EVERY = 30

/**
 * Direction arrows for a trail: a point every 30 metres along it, each with
 * the way the trail was heading there (`rot`, for a glyph that points east)
 * and how far along the trail it is (`d`, metres). The spacing carries
 * across the trail's stretches, so none land in a gap. Worked out from the
 * ground, not the screen, so the arrows stay put as the map zooms.
 */
function arrowsAlong(
  parts: LngLat[][],
  color: string,
  extra: Record<string, unknown> = {},
) {
  const arrows: unknown[] = []
  let since = 0
  let travelled = 0
  for (const part of parts)
    for (let i = 0; i < part.length - 1; i++) {
      const a = part[i]
      const b = part[i + 1]
      const length = distanceM(a, b)
      if (!(length > 0)) continue
      since += length
      while (since >= ARROW_EVERY) {
        const along = length - (since - ARROW_EVERY)
        const f = along / length
        arrows.push({
          type: "Feature",
          properties: {
            color,
            rot: bearingDeg(a, b) - 90,
            d: travelled + along,
            ...extra,
          },
          geometry: {
            type: "Point",
            coordinates: [lerp(a[0], b[0], f), lerp(a[1], b[1], f)],
          },
        })
        since -= ARROW_EVERY
      }
      travelled += length
    }
  return arrows
}

/** Hectares inside a ring of corners, on flat ground around the first. */
function areaHa(points: LngLat[]) {
  if (points.length < 3) return 0
  const flat = projector(points[0])
  const xy = points.map((p) => flat.toXY(p))
  let twice = 0
  for (let i = 0, j = xy.length - 1; i < xy.length; j = i++)
    twice += xy[j][0] * xy[i][1] - xy[i][0] * xy[j][1]
  return Math.abs(twice) / 2 / 10000
}

function lengthM(points: LngLat[]) {
  let metres = 0
  for (let i = 1; i < points.length; i++)
    metres += distanceM(points[i - 1], points[i])
  return metres
}

const middle = (points: LngLat[]): LngLat => [
  points.reduce((sum, p) => sum + p[0], 0) / points.length,
  points.reduce((sum, p) => sum + p[1], 0) / points.length,
]

/** How big something drawn is, in words: hectares, or metres along. */
export const sizeOf = (kind: "polygon" | "line", points: LngLat[]) => {
  if (kind === "polygon") return `${formatHa(areaHa(points))} ha`
  const metres = lengthM(points)
  return metres >= 1000
    ? `${(metres / 1000).toFixed(2)} km`
    : `${Math.round(metres)} m`
}

/** A line or multi-line feature's stretches. */
const partsOf = (feature: unknown): LngLat[][] => {
  const geometry = (
    feature as { geometry?: { type: string; coordinates: unknown } }
  ).geometry
  if (!geometry) return []
  return (
    geometry.type === "LineString"
      ? [geometry.coordinates]
      : geometry.coordinates
  ) as LngLat[][]
}

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
  readonly selectedPaddock: Writable<Paddock | null> = writable(null)
  /** The finished trail picked out on the map, and its replay if running. */
  readonly selectedTrail: Writable<TrailInfo | null> = writable(null)
  readonly replay: Writable<ReplayState | null> = writable(null)
  /** The measure tool's running figures while it is in use, else null. */
  readonly measure: Writable<Measure | null> = writable(null)
  /** Every paddock on the farm, for the paddock list. */
  readonly paddockList: Writable<Paddock[]> = writable([])
  /** This person's own broadcast, while one is running. */
  readonly broadcast: Writable<Flash | null> = writable(null)
  /** A crew member has just started broadcasting (for a notice). */
  readonly heard: Writable<{ id: string; name: string; flash: Flash } | null> =
    writable(null)
  /** The farms (blocks) the paddocks are grouped into. */
  readonly farmNames: Writable<FarmName[]> = writable([])
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
  /** The main body of the farm, without far-flung blocks: the first view. */
  private homeBounds: [number, number, number, number] | null = null
  private pinsById = new Map<string, LivePin>()
  private pinDraw = 0
  private pinImages = new Set<string>()
  private pinSettings: PinSettings | null
  /** The tapped pin, lifted off the layer as an animated marker. */
  private picked: { id: string; marker: MapboxMap; view: SelectedPin } | null =
    null
  /** The pin being moved (dragged to a new place, then placed). */
  readonly movingPin: Writable<string | null> = writable(null)
  private move: {
    id: string
    origin: LngLat
    live: LngLat
    /** Where the finger is, in screen pixels: the pin eases towards it. */
    target: [number, number] | null
    dragging: boolean
    ring: MapboxMap
    stop: () => void
  } | null = null
  /** Every drawing attached to a pin on this map. */
  readonly drawings: Writable<PinDrawing[]> = writable([])
  /** Every pin, the newest first (for the list of pins). */
  readonly pins: Writable<LivePin[]> = writable([])
  /** The viewer's own row for the crew list, once they are on the map. */
  readonly self: Writable<CrewRow | null> = writable(null)
  /** The crew member the camera is following, and which way up. */
  readonly following: Writable<{ id: string; mode: "follow" | "cab" } | null> =
    writable(null)
  private tail: { id: string; mode: "follow" | "cab" } | null = null
  /** The crew's order in the list, kept steady between re-sorts. */
  private crewOrder: string[] = []
  private crewSignature = ""
  private crewSorted = 0
  /** Taps on the map are being collected (for a job), not acted on. */
  private grabbing = false
  readonly grabbed: Writable<JobItem | null> = writable(null)
  /** Pins being rounded up to remove: drawing the lasso, then confirming. */
  readonly lasso: Writable<{
    phase: "drawing" | "confirm"
    count: number
  } | null> = writable(null)
  private lassoed: string[] = []
  private stopLasso: (() => void) | null = null
  /** The finished trails of the job on show that cross the picked paddock. */
  readonly paddockTrails: Writable<TrailInfo[]> = writable([])
  /** The thing kept on a paddock that was last tapped. */
  readonly pickedFeature: Writable<string | null> = writable(null)
  /** Something is picked out with marching dashes: keep them moving. */
  private marching = false
  private measured: LngLat[] = []
  /** Layers the person has switched off (the same keys the old viewer saves). */
  private shown: Record<string, boolean> = {}
  /** Direction marks on the picked trail and its replay. */
  private marks = { centre: false, arrows: false }
  /** Direction arrows for every trail: worked out once per trail, on demand. */
  private historyArrows = new Map<string, unknown[]>()
  private arrowsDrawn = ""
  private replaying: Replay | null = null
  private marchTick = 0
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
      pinSettings?: PinSettings | null
    },
  ) {
    this.pinSettings = options.pinSettings ?? null
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
      showLayers(this.map, this.shown, this.base)
      showPickedMarks(this.map, this.marks)
      showDrawingsFor(this.map, get(this.selectedPin)?.id ?? null)
      this.ready.set(true)
      this.drawPaddocks()
      this.drawPins()
      this.hidePinInLayer()
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
      if (e.originalEvent && !(touches && touches.length > 1)) {
        this.setFollow("free")
        this.followCrew(null)
      }
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
        if (get(this.measure)) {
          this.measured.push([e.lngLat.lng, e.lngLat.lat])
          this.drawMeasure()
          return
        }
        // A pin being moved is dragged, not tapped into place.
        if (this.move) return
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
        let pin = id ? this.pinsById.get(id) : undefined
        // A tap on something drawn picks the pin it belongs to.
        if (!pin && this.map.getLayer(DRAWING_LAYERS[0])) {
          const drawn = this.map.queryRenderedFeatures([e.point.x, e.point.y], {
            layers: DRAWING_LAYERS,
          })[0]?.properties?.pin as string | undefined
          if (drawn && drawn !== get(this.selectedPin)?.id)
            pin = this.pinsById.get(drawn)
        }
        const at: LngLat = [e.lngLat.lng, e.lngLat.lat]
        // Putting a job together: a tap picks up what is under it.
        if (this.grabbing) {
          const paddock = pin ? null : this.paddockAt(at)
          const item: JobItem = pin
            ? {
                type: "marker",
                id: pin.id,
                label: this.pinName(pin),
                at: pin.at,
              }
            : paddock
              ? {
                  type: "field",
                  id: paddock.id,
                  label: paddock.name,
                  at: [
                    (paddock.bbox[0] + paddock.bbox[2]) / 2,
                    (paddock.bbox[1] + paddock.bbox[3]) / 2,
                  ],
                }
              : { type: "spot", id: null, label: "A spot", at }
          this.grabbed.set(item)
          this.ripple(item.at)
          return
        }
        // Something kept on a paddock is tapped before the paddock is.
        const feature = pin
          ? undefined
          : (this.map.queryRenderedFeatures([e.point.x, e.point.y], {
              layers: FEATURE_LAYERS,
            })[0]?.properties as { id?: string; paddock?: string } | undefined)
        this.pickedFeature.set(feature?.id ?? null)
        if (feature?.paddock) {
          const owner = this.paddocks.find((p) => p.id === feature.paddock)
          if (owner) {
            this.pickTrail(null)
            this.selectedPin.set(null)
            this.selectedCrew.set(null)
            this.selectedPaddock.set(owner)
            return
          }
        }
        this.tapped(pin ?? null, at)
      },
    )
    this.map.on("mouseenter", PIN_LAYER, () => {
      if (!this.armed) this.map.getCanvas().style.cursor = "pointer"
    })
    this.map.on("mouseleave", PIN_LAYER, () => {
      if (!this.armed) this.map.getCanvas().style.cursor = ""
    })
    this.selectedPin.subscribe((pin) => {
      // Letting go of a pin while moving it puts it back.
      if (this.move && pin?.id !== this.move.id) this.endMove(false)
      this.showPicked(pin)
      if (get(this.ready)) showDrawingsFor(this.map, pin?.id ?? null)
    })
    this.selectedCrew.subscribe((id) => {
      for (const [crewId, entry] of this.crewById)
        entry.vehicle?.view.$set({ selected: crewId === id })
      this.mine?.view.$set({ selected: id === ME })
    })
    this.selectedPaddock.subscribe((paddock) => {
      if (get(this.ready)) pickPaddock(this.map, paddock?.id ?? null)
      this.keepMarching()
      this.paddockTrails.set(paddock ? this.trailsIn(paddock) : [])
      if (!paddock) this.pickedFeature.set(null)
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
        this.paddockList.set(paddocks)
        // The farm's extent, known as soon as the paddocks are (the map may
        // not be ready to draw them yet, but it can already be aimed).
        const around = (
          list: Paddock[],
        ): [number, number, number, number] | null =>
          list.length
            ? [
                Math.min(...list.map((p) => p.bbox[0])),
                Math.min(...list.map((p) => p.bbox[1])),
                Math.max(...list.map((p) => p.bbox[2])),
                Math.max(...list.map((p) => p.bbox[3])),
              ]
            : null
        this.farmBounds = around(paddocks)
        // A block or two a long way off would shrink the first view to a
        // smudge: open on the main body of the farm instead.
        const centre = (p: Paddock): LngLat => [
          (p.bbox[0] + p.bbox[2]) / 2,
          (p.bbox[1] + p.bbox[3]) / 2,
        ]
        const middle = (values: number[]) =>
          [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
        if (paddocks.length >= 6) {
          const heart: LngLat = [
            middle(paddocks.map((p) => centre(p)[0])),
            middle(paddocks.map((p) => centre(p)[1])),
          ]
          const reach = paddocks.map((p) => distanceM(centre(p), heart))
          const typical = [...reach].sort((a, b) => a - b)[
            Math.floor(reach.length * 0.75)
          ]
          this.homeBounds = around(
            paddocks.filter((_, i) => reach[i] <= typical * 2.2),
          )
        } else this.homeBounds = this.farmBounds
        this.farm.set({
          paddocks: paddocks.length,
          ha: paddocks.reduce((sum, p) => sum + p.ha, 0),
        })
        this.drawPaddocks()
        if (!this.arrived) this.fitFarm(0, false)
        else if (this.lastFix && this.farAway(this.lastFix.at)) {
          // Their first fix beat the paddocks here, and it is nowhere near
          // this farm: show the farm rather than where they are sitting.
          this.readout.update((r) => ({ ...r, far: true }))
          this.fitFarm(0, false)
        }
      })
      .catch(() => this.problem.set("Couldn't load the paddocks."))
      .finally(() => this.loading.update((l) => ({ ...l, paddocks: false })))

    loadFarmNames(this.mapId)
      .then((farms) => this.farmNames.set(farms))
      .catch(() => {})

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

    this.refreshDrawings()
    this.stops.push(watchDrawings(this.mapId, () => this.refreshDrawings()))

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
      // On the dark map a paddock with no colour takes its block's.
      const glow = paddock.colour ?? blockColour(paddock.farmId ?? this.mapId)
      features.push({
        type: "Feature",
        properties: {
          id: paddock.id,
          fill: paddock.colour
            ? soften(paddock.colour)
            : TONES[hash(paddock.id) % TONES.length],
          tint: paddock.colour ?? "#F4F1E6",
          wash: paddock.colour ? 0.2 : 0.07,
          // Its fence is dashed in its own colour (white when it has none).
          line: paddock.colour ?? null,
          glow,
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
          sub:
            paddock.ha > 0 && this.shown.fieldHectares !== false
              ? `${formatHa(paddock.ha)} ha`
              : "",
          // For the dot that stands in for it from far away on the dark map.
          glow,
          ha: paddock.ha,
        },
        geometry: { type: "Point", coordinates: labelPoint(biggest) },
      })
    }
    this.map.getSource(FARM_SOURCE).setData(collection(features))
    this.map.getSource(LABEL_SOURCE).setData(collection(labels))
    // What has been kept on each paddock: its shape, and its name and size.
    const kept: unknown[] = []
    for (const paddock of this.paddocks)
      for (const feature of paddock.features) {
        const properties = {
          id: feature.id,
          paddock: paddock.id,
          color: feature.colour,
          label: feature.label,
          size: sizeOf(feature.kind, feature.coordinates),
        }
        kept.push({
          type: "Feature",
          properties,
          geometry:
            feature.kind === "polygon"
              ? {
                  type: "Polygon",
                  coordinates: [
                    [...feature.coordinates, feature.coordinates[0]],
                  ],
                }
              : { type: "LineString", coordinates: feature.coordinates },
        })
        kept.push({
          type: "Feature",
          properties,
          geometry: {
            type: "Point",
            coordinates:
              feature.kind === "polygon"
                ? middle(feature.coordinates)
                : feature.coordinates[
                    Math.floor(feature.coordinates.length / 2)
                  ],
          },
        })
      }
    this.map.getSource(FEATURE_SOURCE)?.setData(collection(kept))
    pickPaddock(this.map, get(this.selectedPaddock)?.id ?? null)
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
  fitFarm(duration = 900, whole = true) {
    let bounds = whole ? this.farmBounds : this.homeBounds
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

  /** How a pin is drawn, with the colour this person sees it in. */
  pinLook = (pin: LivePin): PinLook => ({
    iconClass: pin.iconClass,
    colour: pinColour(pin, this.pinSettings),
    gateOpen: pin.gateOpen,
    rockPicked: pin.rockPicked,
    fill: pin.fill,
    grainColour: pin.grainColour,
  })

  /** Their marker colour settings changed: repaint the pins. */
  setPinSettings(settings: PinSettings | null) {
    this.pinSettings = settings
    this.drawPins()
    this.showPicked(get(this.selectedPin))
  }

  /** Lift the tapped pin off the layer as an animated marker (or put it back). */
  private showPicked(pin: LivePin | null) {
    const old = this.picked
    if (old && old.id !== pin?.id) {
      // Let go: it eases back to its size in the layer, then the layer's
      // own pin takes over again.
      this.picked = null
      old.view.$set({ leaving: true })
      setTimeout(() => {
        old.view.$destroy()
        old.marker.remove()
        this.hidePinInLayer()
      }, 200)
    }
    if (!pin) return
    const props = {
      image: pinImageKey(this.pinLook(pin)),
      size: Math.round(pinPixels()),
    }
    if (this.picked) {
      this.picked.view.$set(props)
      // Mid-move it is wherever it has been dragged to.
      if (this.move?.id !== pin.id) this.picked.marker.setLngLat(pin.at)
      return
    }
    const el = document.createElement("div")
    el.style.pointerEvents = "none"
    const view = new SelectedPin({ target: el, props })
    const marker = new mapboxgl.Marker({ element: el })
      .setLngLat(pin.at)
      .addTo(this.map)
    marker.getElement().style.zIndex = "2"
    this.picked = { id: pin.id, marker, view }
    this.hidePinInLayer()
  }

  /** The picked pin is drawn by its marker, so the layer leaves it out. */
  private hidePinInLayer() {
    if (!get(this.ready)) return
    this.map.setFilter(
      PIN_LAYER,
      this.picked ? ["!=", ["get", "id"], this.picked.id] : null,
    )
  }

  /** Rings spreading from a spot: a pin has just landed there. */
  private ripple(at: LngLat, moved = false) {
    const el = document.createElement("div")
    el.className = moved ? "mn-ripple moved" : "mn-ripple"
    el.innerHTML = "<i></i><i></i>"
    const marker = new mapboxgl.Marker({ element: el })
      .setLngLat(at)
      .addTo(this.map)
    marker.getElement().style.zIndex = "1"
    setTimeout(() => marker.remove(), 1400)
  }

  /**
   * Change the picked pin (its type, colour, note, gate, and so on). The map
   * shows the change straight away and puts it back if it doesn't save.
   */
  async updatePin(id: string, change: PinPatch & { note?: string }) {
    const before = this.pinsById.get(id)
    if (!before) return false
    const { note, ...rest } = change
    const after: LivePin = {
      ...before,
      ...(rest.iconClass !== undefined ? { iconClass: rest.iconClass } : {}),
      ...(rest.colour !== undefined ? { colour: rest.colour } : {}),
      ...(rest.gateOpen !== undefined ? { gateOpen: rest.gateOpen } : {}),
      ...(rest.rockPicked !== undefined ? { rockPicked: rest.rockPicked } : {}),
      ...(rest.noteVisible !== undefined
        ? { noteVisible: rest.noteVisible }
        : {}),
      ...(rest.fill !== undefined ? { fill: rest.fill } : {}),
      ...(rest.grainType !== undefined ? { grainType: rest.grainType } : {}),
      ...(rest.at ? { at: rest.at } : {}),
      ...(rest.drawingsAlways !== undefined
        ? { drawingsAlways: rest.drawingsAlways }
        : {}),
      ...(note !== undefined ? { note: note.trim().slice(0, 500) } : {}),
    }
    const show = (pin: LivePin) => {
      this.pinsById.set(id, pin)
      if (get(this.selectedPin)?.id === id) this.selectedPin.set(pin)
      this.drawPins()
    }
    show(after)
    try {
      if (Object.keys(rest).length) await patchPin(id, this.userId, rest)
      if (note !== undefined) await setPinNote(id, note)
      return true
    } catch {
      if (this.pinsById.has(id)) show(before)
      this.problem.set(
        navigator.onLine
          ? "That change didn't save. Try again."
          : "No signal: that change didn't save.",
      )
      return false
    }
  }

  // ── Moving a pin ────────────────────────────────────────────────────────
  // The current viewer's way: the picked pin is dragged with a finger and
  // eases after it, a dashed ring marks where it started, and nothing is
  // saved until it is placed. Away from the pin the map pans as usual.

  /** Start moving the picked pin, or (null) put it back where it was. */
  movePin(id: string | null) {
    this.endMove(false)
    const pin = id ? this.pinsById.get(id) : undefined
    if (!id || !pin || this.picked?.id !== id) return

    const el = document.createElement("div")
    el.className = "mn-origin"
    const ring = new mapboxgl.Marker({ element: el })
      .setLngLat(pin.at)
      .addTo(this.map)
    ring.getElement().style.zIndex = "1"

    const container = this.map.getContainer() as HTMLElement
    const pointOf = (e: MouseEvent | TouchEvent): [number, number] | null => {
      const touch = "touches" in e ? (e.touches[0] ?? e.changedTouches[0]) : e
      if (!touch) return null
      const box = container.getBoundingClientRect()
      return [touch.clientX - box.left, touch.clientY - box.top]
    }
    const down = (e: MouseEvent | TouchEvent) => {
      const move = this.move
      const at = pointOf(e)
      if (!move || !at || ("touches" in e && e.touches.length > 1)) return
      // Only a press on the pin itself drags it; anywhere else pans.
      const on = this.map.project(move.live)
      if (Math.hypot(at[0] - on.x, at[1] - on.y) > 32) return
      e.preventDefault()
      e.stopPropagation()
      move.dragging = true
      move.target = at
    }
    const drag = (e: MouseEvent | TouchEvent) => {
      const move = this.move
      const at = pointOf(e)
      if (!move?.dragging || !at) return
      if (e.cancelable) e.preventDefault()
      move.target = at
    }
    const up = () => {
      if (this.move) this.move.dragging = false
    }
    container.addEventListener("mousedown", down, true)
    container.addEventListener("touchstart", down, {
      capture: true,
      passive: false,
    })
    window.addEventListener("mousemove", drag)
    window.addEventListener("touchmove", drag, { passive: false })
    window.addEventListener("mouseup", up)
    window.addEventListener("touchend", up)
    window.addEventListener("touchcancel", up)
    this.move = {
      id,
      origin: pin.at,
      live: pin.at,
      target: null,
      dragging: false,
      ring,
      stop: () => {
        container.removeEventListener("mousedown", down, true)
        container.removeEventListener("touchstart", down, true)
        window.removeEventListener("mousemove", drag)
        window.removeEventListener("touchmove", drag)
        window.removeEventListener("mouseup", up)
        window.removeEventListener("touchend", up)
        window.removeEventListener("touchcancel", up)
      },
    }
    this.movingPin.set(id)
  }

  /** Leave move mode; unless `keep`, the pin goes back where it started. */
  private endMove(keep: boolean) {
    const move = this.move
    if (!move) return
    this.move = null
    move.stop()
    move.ring.remove()
    this.movingPin.set(null)
    if (!keep && this.picked?.id === move.id)
      this.picked.marker.setLngLat(move.origin)
  }

  /**
   * Put the pin being moved down where it has been dragged to and save it.
   * As in the current viewer, the pin is let go of afterwards.
   */
  placePin() {
    const move = this.move
    if (!move) return false
    const { id, live, origin } = move
    this.endMove(true)
    const moved = live[0] !== origin[0] || live[1] !== origin[1]
    if (moved) {
      this.updatePin(id, { at: live })
      this.ripple(live, true)
    }
    this.selectedPin.set(null)
    return moved
  }

  /** Each frame of a move: the pin eases towards the finger. */
  private stepMove(dt: number) {
    const move = this.move
    if (!move || this.picked?.id !== move.id) return
    if (move.target) {
      const now = this.map.project(move.live)
      const ease = 1 - Math.pow(0.65, (dt * 1000) / 16.7)
      let x = lerp(now.x, move.target[0], ease)
      let y = lerp(now.y, move.target[1], ease)
      if (Math.hypot(move.target[0] - x, move.target[1] - y) < 0.5) {
        ;[x, y] = move.target
        if (!move.dragging) move.target = null
      }
      const at = this.map.unproject([x, y])
      move.live = [at.lng, at.lat]
      this.picked.marker.setLngLat(move.live)
    }
    const from = this.map.project(move.origin)
    const to = this.map.project(move.live)
    move.ring
      .getElement()
      .classList.toggle("moved", Math.hypot(to.x - from.x, to.y - from.y) > 22)
  }

  // ── What is attached to a pin: drawings and photos ──────────────────────

  private async refreshDrawings() {
    try {
      const drawings = await loadDrawings(this.mapId)
      if (this.destroyed) return
      this.drawings.set(drawings)
      this.drawDrawings()
    } catch {
      // What is already drawn stays; the next change tries again.
    }
  }

  private drawDrawings() {
    if (!get(this.ready)) return
    const features = get(this.drawings).flatMap((drawing) => {
      const pin = this.pinsById.get(drawing.pinId)
      if (!pin) return []
      return [
        {
          type: "Feature",
          properties: {
            id: drawing.id,
            pin: drawing.pinId,
            kind: drawing.kind,
            color: drawing.colour,
            fillOpacity: drawing.fillOpacity,
            width: drawing.width,
            dashed: drawing.dashed,
            always: pin.drawingsAlways,
          },
          geometry: drawing.geometry,
        },
      ]
    })
    this.map.getSource(DRAWING_SOURCE)?.setData(collection(features))
  }

  /**
   * Start drawing an area or a line to attach to a pin: taps on the map add
   * its corners, the same way the measure tool works.
   */
  startDrawing(pinId: string, kind: "polygon" | "line", colour: string) {
    this.endMove(false)
    this.measured = []
    this.armPin(null)
    this.measure.set({
      points: 0,
      distance: 0,
      ha: 0,
      kind,
      paddock: null,
      drawing: { pinId, kind, colour, saving: false },
    })
    this.map.getCanvas().style.cursor = "crosshair"
    this.drawMeasure()
  }

  setDrawingColour(colour: string) {
    this.measure.update((m) =>
      m?.drawing ? { ...m, drawing: { ...m.drawing, colour } } : m,
    )
    this.drawMeasure()
  }

  /** Stop drawing without keeping it. */
  cancelDrawing() {
    this.measured = []
    this.measure.set(null)
    this.map.getCanvas().style.cursor = ""
    this.drawMeasure()
  }

  /** Attach what has been drawn to its pin. */
  async saveDrawing() {
    const drawing = get(this.measure)?.drawing
    const points = [...this.measured]
    if (!drawing || drawing.saving) return false
    if (points.length < (drawing.kind === "polygon" ? 3 : 2)) return false
    const saving = (on: boolean) =>
      this.measure.update((m) =>
        m?.drawing ? { ...m, drawing: { ...m.drawing, saving: on } } : m,
      )
    saving(true)
    try {
      await createDrawing({
        mapId: this.mapId,
        userId: this.userId,
        pinId: drawing.pinId,
        kind: drawing.kind,
        points,
        colour: drawing.colour,
      })
    } catch {
      saving(false)
      this.problem.set(
        navigator.onLine
          ? "That drawing didn't save. Try again."
          : "No signal: that drawing didn't save.",
      )
      return false
    }
    this.cancelDrawing()
    await this.refreshDrawings()
    return true
  }

  /** Take a drawing off its pin. */
  async removeDrawing(id: string) {
    const before = get(this.drawings)
    this.drawings.set(before.filter((drawing) => drawing.id !== id))
    this.drawDrawings()
    try {
      await deleteDrawing(id, this.userId)
      return true
    } catch {
      this.drawings.set(before)
      this.drawDrawings()
      this.problem.set("That drawing couldn't be removed. Try again.")
      return false
    }
  }

  private setPhotos(pinId: string, photos: PinPhoto[]) {
    const pin = this.pinsById.get(pinId)
    if (!pin) return
    const next = { ...pin, photos }
    this.pinsById.set(pinId, next)
    if (get(this.selectedPin)?.id === pinId) this.selectedPin.set(next)
  }

  /** Add a photo to a pin. */
  async addPhoto(pinId: string, image: Blob) {
    try {
      this.setPhotos(
        pinId,
        await addPinPhoto(this.mapId, pinId, this.userId, image),
      )
      return true
    } catch {
      this.problem.set(
        navigator.onLine
          ? "That photo didn't upload. Try again."
          : "No signal: that photo didn't upload.",
      )
      return false
    }
  }

  /** Remove a photo from a pin. */
  async removePhoto(pinId: string, photo: PinPhoto) {
    try {
      this.setPhotos(pinId, await removePinPhoto(pinId, this.userId, photo))
      return true
    } catch {
      this.problem.set("That photo couldn't be removed. Try again.")
      return false
    }
  }

  /**
   * A tap on the map that wasn't for dropping a pin: a pin under the finger
   * wins, then the paddock it landed in; tapping what is already picked, or
   * open ground, lets go of everything.
   */
  private tapped(pin: LivePin | null, at: LngLat) {
    const current = {
      pin: get(this.selectedPin),
      crew: get(this.selectedCrew),
      paddock: get(this.selectedPaddock),
    }
    // A replay isn't ended by a stray tap; a picked trail is let go by one.
    if (this.replaying) return
    if (get(this.selectedTrail)) {
      this.pickTrail(null)
      if (!pin) return
    }
    this.selectedCrew.set(null)
    if (pin) {
      this.selectedPaddock.set(null)
      this.selectedPin.set(current.pin?.id === pin.id ? null : pin)
      return
    }
    this.selectedPin.set(null)
    // Letting go of a pin or a machine shouldn't pick the paddock under it.
    if (current.pin || current.crew) return
    const paddock = this.paddockAt(at)
    this.selectedPaddock.set(
      paddock && current.paddock?.id !== paddock.id ? paddock : null,
    )
  }

  /** Pick a crew member out (from the list), letting go of anything else. */
  pickCrew(id: string | null) {
    this.selectedPin.set(null)
    this.selectedPaddock.set(null)
    this.selectedCrew.set(id)
  }

  /**
   * Change the picked paddock (name, crop, colour, farm). The map shows the
   * change straight away and puts it back if it doesn't save.
   */
  async updatePaddock(id: string, change: PaddockPatch) {
    const before = this.paddocks.find((p) => p.id === id)
    if (!before) return false
    const farms = get(this.farmNames)
    const after: Paddock = {
      ...before,
      ...(change.name !== undefined ? { name: change.name } : {}),
      ...(change.crop !== undefined ? { crop: change.crop } : {}),
      ...(change.colour !== undefined ? { colour: change.colour } : {}),
      ...(change.farmId !== undefined
        ? {
            farmId: change.farmId,
            farm:
              farms.length > 1
                ? (farms.find((f) => f.id === change.farmId)?.name ?? null)
                : null,
          }
        : {}),
    }
    const show = (paddock: Paddock) => {
      this.paddocks = this.paddocks.map((p) => (p.id === id ? paddock : p))
      this.paddockList.set(this.paddocks)
      if (get(this.selectedPaddock)?.id === id)
        this.selectedPaddock.set(paddock)
      this.drawPaddocks()
    }
    show(after)
    try {
      await patchPaddock(id, change)
      return true
    } catch {
      show(before)
      this.problem.set(
        navigator.onLine
          ? "That change didn't save. Try again."
          : "No signal: that change didn't save.",
      )
      return false
    }
  }

  /** Delete the picked paddock for good. */
  async removePaddock(id: string) {
    try {
      await deletePaddock(id)
    } catch {
      this.problem.set("That paddock couldn't be deleted. Try again.")
      return false
    }
    this.paddocks = this.paddocks.filter((p) => p.id !== id)
    this.paddockList.set(this.paddocks)
    this.farm.set({
      paddocks: this.paddocks.length,
      ha: this.paddocks.reduce((sum, p) => sum + p.ha, 0),
    })
    if (get(this.selectedPaddock)?.id === id) this.selectedPaddock.set(null)
    this.drawPaddocks()
    return true
  }

  /** Pick a paddock out from the list and bring it into view. */
  pickPaddockById(id: string) {
    const paddock = this.paddocks.find((p) => p.id === id)
    if (!paddock) return false
    this.pickTrail(null)
    this.selectedPin.set(null)
    this.selectedCrew.set(null)
    this.selectedPaddock.set(paddock)
    return this.lookAtPaddock(id)
  }

  /**
   * Broadcast a word to the crew ("Full", "Help"…): it flashes on this
   * machine on everyone's map for five minutes, or until stopped. Needs a
   * position, since that is what the crew is being pointed at.
   */
  startBroadcast(reason: string, colour: string) {
    if (!this.lastFix || !this.meKnown) {
      this.problem.set("A broadcast needs your location first.")
      return false
    }
    const flash: Flash = { reason, colour, started: Date.now() }
    this.broadcast.set(flash)
    this.mine?.view.$set({
      flash: { label: flashLabel(flash), colour: flash.colour },
    })
    this.sendNow(flash)
    return true
  }

  stopBroadcast() {
    if (!get(this.broadcast)) return
    this.broadcast.set(null)
    this.mine?.view.$set({ flash: null })
    this.sendNow(null)
  }

  /** Pick up a broadcast this person left running (a reload). */
  resumeBroadcast(flash: Flash | null | undefined) {
    if (!flash || Date.now() - flash.started >= BROADCAST_FOR) return
    this.broadcast.set(flash)
    this.mine?.view.$set({
      flash: { label: flashLabel(flash), colour: flash.colour },
    })
  }

  /** Let go of whatever is picked on the map. */
  clearSelection() {
    this.pickTrail(null)
    this.selectedPin.set(null)
    this.selectedCrew.set(null)
    this.selectedPaddock.set(null)
  }

  private keepMarching() {
    this.marching = !!get(this.selectedPaddock) || !!get(this.selectedTrail)
  }

  /** Bring a paddock into view. */
  lookAtPaddock(id: string) {
    const paddock = this.paddocks.find((p) => p.id === id)
    if (!paddock) return false
    this.setFollow("free")
    this.map.fitBounds(
      [
        [paddock.bbox[0], paddock.bbox[1]],
        [paddock.bbox[2], paddock.bbox[3]],
      ],
      {
        padding: {
          top: 110,
          right: 60,
          bottom: 190 + this.insets.bottom,
          left: 60 + this.insets.left,
        },
        maxZoom: 16.5,
        duration: 900,
      },
    )
    return true
  }

  private addPinImage(key: string) {
    return new Promise<void>((resolve) => {
      // Three times its size on screen, like the current viewer's pins.
      const image = new Image(144, 144)
      image.onload = () => {
        if (!this.destroyed && !this.map.hasImage(key))
          this.map.addImage(key, image, { pixelRatio: 3 })
        this.pinImages.add(key)
        resolve()
      }
      image.onerror = () => resolve()
      image.src = pinDataUrl(key, 144)
    })
  }

  /** Redraw the pin layer, drawing any pin art it hasn't used before first. */
  private async drawPins() {
    // A drawing shows or hides with its pin.
    this.drawDrawings()
    this.pinCount.set(this.pinsById.size)
    if (!get(this.ready)) return
    const turnNumber = ++this.pinDraw
    await loadPinGlyphs()
    const pins = [...this.pinsById.values()]
    this.pins.set([...pins].sort((a, b) => b.t - a.t))
    const features = pins.map((pin) => {
      const image = pinImageKey(this.pinLook(pin))
      const bin = pin.grainType || pin.fill > 0
      // A long note is cut short on the map, as the current viewer does.
      const words =
        pin.note.length > 25 ? `${pin.note.slice(0, 25)}...` : pin.note
      return {
        type: "Feature",
        properties: {
          id: pin.id,
          image,
          note: pin.noteVisible
            ? words
              ? `\u2022 ${words}`
              : bin
                ? [pin.grainType, `${Math.round(pin.fill)}%`]
                    .filter(Boolean)
                    .join(" · ")
                : ""
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
      this.ripple(pin.at)
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
    if (this.shown.vehicleLabels === false) return ""
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
    // Likewise it only says what they are flashing when that has changed.
    const flash = state.flash === undefined ? previous?.flash : state.flash
    entry.state = {
      ...state,
      marker: state.marker ?? previous?.marker ?? null,
      flash: flash ?? null,
    }
    if (state.operation !== undefined) entry.operation = state.operation
    // A broadcast runs five minutes; one left on longer is stale.
    const live =
      flash && Date.now() - flash.started < BROADCAST_FOR ? flash : null
    if (live && (!previous?.flash || previous.flash.started !== live.started))
      this.heard.set({ id: state.id, name: entry.profile.name, flash: live })
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
        this.selectedPaddock.set(null)
        this.selectedCrew.update((id) => (id === state.id ? null : state.id))
      })
      entry.vehicle.view.$set({
        tappable: true,
        selected: get(this.selectedCrew) === state.id,
      })
      if (this.shown.vehicles === false) el.style.display = "none"
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
      flash: live ? { label: flashLabel(live), colour: live.colour } : null,
      label: this.tagFor(entry),
      away: Date.now() - state.t > AWAY_AFTER,
      speed: Date.now() - state.t < FRESH_FOR ? state.speed : 0,
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
    this.publishSelf(now)
    const rows: CrewRow[] = []
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
        me: false,
        operation:
          entry.operation !== undefined
            ? entry.operation
            : entry.profile.operation,
        trailing: !!state?.trailing && age < 5 * 60_000,
        seen: state?.t ?? 0,
      })
    }
    this.crew.set(this.inOrder(rows, now))
  }

  /**
   * The crew in a steady order (the current viewer's rule). Who is first is
   * decided by what matters, the machine being followed, then whoever is on
   * and trailing, on, trailing, and how lately they were heard from in broad
   * steps, and after that people keep the place they had. It is only worked
   * out again when one of those changes or half a minute has gone by, so a
   * row doesn't hop about each time someone's position ticks over.
   */
  private inOrder(rows: CrewRow[], now: number) {
    const recency = (row: CrewRow) => {
      if (!row.seen) return 5
      const age = now - row.seen
      if (age < 30_000) return 0
      if (age < 2 * 60_000) return 1
      if (age < 10 * 60_000) return 2
      if (age < 60 * 60_000) return 3
      return 4
    }
    const followed = this.tail?.id
    const signature = rows
      .map(
        (row) =>
          `${row.id}:${row.id === followed ? 1 : 0}${row.online ? 1 : 0}${
            row.trailing ? 1 : 0
          }`,
      )
      .sort()
      .join("|")
    const byId = new Map(rows.map((row) => [row.id, row]))
    const place = new Map(this.crewOrder.map((id, index) => [id, index]))
    const rank = (a: CrewRow, b: CrewRow) =>
      Number(b.id === followed) - Number(a.id === followed) ||
      Number(b.online && b.trailing) - Number(a.online && a.trailing) ||
      Number(b.online) - Number(a.online) ||
      Number(b.trailing) - Number(a.trailing) ||
      recency(a) - recency(b) ||
      (place.get(a.id) ?? Infinity) - (place.get(b.id) ?? Infinity) ||
      b.seen - a.seen ||
      a.name.localeCompare(b.name)
    const due =
      !this.crewOrder.length ||
      signature !== this.crewSignature ||
      now - this.crewSorted >= 30_000
    let ordered: CrewRow[]
    if (due) {
      ordered = [...rows].sort(rank)
      this.crewSignature = signature
      this.crewSorted = now
    } else {
      // The same order as before; anyone new goes on the end.
      const kept = this.crewOrder
        .map((id) => byId.get(id))
        .filter((row): row is CrewRow => !!row)
      const known = new Set(this.crewOrder)
      ordered = [...kept, ...rows.filter((r) => !known.has(r.id)).sort(rank)]
    }
    this.crewOrder = ordered.map((row) => row.id)
    return ordered
  }

  /** The viewer's own row for the crew list. */
  private publishSelf(now: number) {
    const mine = this.mine
    if (!mine || !this.meKnown) {
      this.self.set(null)
      return
    }
    const spec = machineFor(this.me.type)
    const fresh = !!this.lastFix && now - this.lastFix.t < 15_000
    const moving = fresh && this.speedKmh >= 0.7
    const where = this.paddockAt(mine.pos)
    const trailing = this.recorder.recording
    this.self.set({
      id: ME,
      name: "You",
      guest: false,
      type: spec.type,
      machineLabel: spec.label,
      colour: drawColour(this.me.bodyColor),
      doing:
        (moving
          ? trailing && spec.paints
            ? spec.verb
            : "On the move"
          : "Stopped") + (where ? ` · ${where.name}` : ""),
      speed: moving ? Math.round(this.speedKmh) : 0,
      distance: null,
      online: true,
      away: false,
      placed: true,
      me: true,
      operation: this.operation?.name ?? null,
      trailing,
      seen: this.lastFix?.t ?? now,
    })
  }

  /**
   * Keep the camera on one of the crew: north up ("follow") or turned the
   * way they are heading ("cab"). Dragging the map, or null, lets go.
   */
  followCrew(id: string | null, mode: "follow" | "cab" = "follow") {
    const vehicle = id ? this.crewById.get(id)?.vehicle : null
    const before = this.tail
    if (!id || !vehicle) {
      if (!before) return false
      this.tail = null
      this.following.set(null)
      if (before.mode === "cab")
        this.map.easeTo({ bearing: 0, duration: 500, offset: [0, 0] })
      return false
    }
    // One thing is followed at a time: not yourself as well.
    this.setFollow("free")
    this.tail = { id, mode }
    this.following.set(this.tail)
    this.followPausedUntil = performance.now() + 650
    this.map.easeTo({
      center: vehicle.pos,
      zoom: Math.max(this.map.getZoom(), 15.2),
      bearing: mode === "cab" ? vehicle.heading : 0,
      offset: this.followOffset(mode),
      duration: 650,
    })
    return true
  }

  /** Collect taps on the map (for a job) instead of acting on them. */
  setGrabbing(on: boolean) {
    this.grabbing = on
    if (on) {
      this.clearSelection()
      this.armPin(null)
    }
    this.grabbed.set(null)
    this.map.getCanvas().style.cursor = on ? "copy" : ""
  }

  /** What is picked on the map right now, as something a job can point at. */
  pickedItem(): JobItem | null {
    const pin = get(this.selectedPin)
    if (pin)
      return {
        type: "marker",
        id: pin.id,
        label: this.pinName(pin),
        at: pin.at,
      }
    const paddock = get(this.selectedPaddock)
    if (paddock)
      return {
        type: "field",
        id: paddock.id,
        label: paddock.name,
        at: [
          (paddock.bbox[0] + paddock.bbox[2]) / 2,
          (paddock.bbox[1] + paddock.bbox[3]) / 2,
        ],
      }
    return null
  }

  /** Bring everything a job points at into view, and pick out its first. */
  showJob(items: JobItem[]) {
    if (!items.length) return
    let w = Infinity
    let s = Infinity
    let e = -Infinity
    let n = -Infinity
    const take = (lng: number, lat: number) => {
      w = Math.min(w, lng)
      e = Math.max(e, lng)
      s = Math.min(s, lat)
      n = Math.max(n, lat)
    }
    for (const item of items) {
      const paddock =
        item.type === "field"
          ? this.paddocks.find((p) => p.id === item.id)
          : null
      if (paddock) {
        take(paddock.bbox[0], paddock.bbox[1])
        take(paddock.bbox[2], paddock.bbox[3])
      } else take(item.at[0], item.at[1])
    }
    this.clearSelection()
    const first = items[0]
    const pin =
      first.type === "marker" && first.id ? this.pinsById.get(first.id) : null
    const paddock =
      first.type === "field"
        ? this.paddocks.find((p) => p.id === first.id)
        : null
    if (pin) this.selectedPin.set(pin)
    else if (paddock) this.selectedPaddock.set(paddock)
    this.setFollow("free")
    this.followCrew(null)
    this.map.fitBounds(
      [
        [w, s],
        [e, n],
      ],
      {
        padding: {
          top: 110,
          right: 70,
          bottom: 210 + this.insets.bottom,
          left: 70 + this.insets.left,
        },
        maxZoom: 16,
        duration: 900,
      },
    )
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

  /**
   * Bring a place someone shared in a message into view, picking out the
   * pin, paddock or machine it points at if that is still on the map.
   */
  showPlace(place: {
    at: LngLat
    refType?: string | null
    refId?: string | null
  }) {
    const id = place.refId ?? ""
    if (place.refType === "field" && this.pickPaddockById(id)) return
    if (place.refType === "vehicle" && this.lookAt(id)) {
      this.pickCrew(id)
      return
    }
    this.clearSelection()
    const pin = place.refType === "marker" ? this.pinsById.get(id) : undefined
    if (pin) this.selectedPin.set(pin)
    const at = pin?.at ?? place.at
    this.setFollow("free")
    this.map.easeTo({
      center: at,
      zoom: Math.max(this.map.getZoom(), 15.5),
      // A pin opens its menu over the lower half of the map: sit above it.
      offset: [this.insets.left / 2, -this.insets.bottom / 2 - (pin ? 150 : 0)],
      duration: 900,
    })
    if (!pin) this.ripple(at)
  }

  /** Where a paddock's name sits: the spot a shared paddock points at. */
  paddockPoint(id: string): LngLat | null {
    const paddock = this.paddocks.find((p) => p.id === id)
    if (!paddock) return null
    return [
      (paddock.bbox[0] + paddock.bbox[2]) / 2,
      (paddock.bbox[1] + paddock.bbox[3]) / 2,
    ]
  }

  // ── Trails ──────────────────────────────────────────────────────────────

  /** Show the trails of one job (or none). */
  setOperation(operation: Operation | null) {
    if (operation?.id === this.operation?.id) {
      this.operation = operation
      return
    }
    this.operation = operation
    this.pickTrail(null)
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
        if (get(this.selectedTrail)?.id === id) this.pickTrail(null)
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

  // ── Picking a trail out, and replaying it ───────────────────────────────

  private trailFeatures(id: string) {
    return this.history.filter((f) => {
      const properties = (f as { properties: Record<string, unknown> })
        .properties
      return properties.id === id && properties.segment !== "pause"
    }) as { geometry: { type: string; coordinates: unknown } }[]
  }

  /** Dim or restore the trails to suit what is picked (and being replayed). */
  private paintPicked() {
    if (!get(this.ready)) return
    const picked = get(this.selectedTrail)
    paintPickedTrail(this.map, picked?.id ?? null, this.base, !!this.replaying)
  }

  /**
   * Pick one finished trail out: it stands forward with a line marching
   * the way it was driven, the others fade back, and the map moves to it.
   * `null` lets it go.
   */
  pickTrail(id: string | null) {
    const info = id ? get(this.trails).find((t) => t.id === id) : null
    if (!info && !get(this.selectedTrail)) return false
    this.stopReplay()
    if (info) {
      this.selectedPin.set(null)
      this.selectedCrew.set(null)
      this.selectedPaddock.set(null)
    }
    const features = info ? this.trailFeatures(info.id) : []
    // Chosen from the list before its shape has arrived: nothing to show.
    if (info && !features.length) return false
    this.selectedTrail.set(info ?? null)
    if (get(this.ready)) {
      this.map.getSource(PICKED_TRAIL_SOURCE)?.setData(collection(features))
      this.pickedArrows(features.flatMap(partsOf), info?.colour)
    }
    this.paintPicked()
    this.keepMarching()
    if (info) this.lookAtTrail(info.id)
    return true
  }

  /** Delete the picked trail for good. */
  async deletePickedTrail() {
    const info = get(this.selectedTrail)
    if (!info) return false
    try {
      await deleteTrail(info.id)
    } catch {
      this.problem.set("That trail couldn't be deleted. Try again.")
      return false
    }
    this.pickTrail(null)
    this.historyIds.delete(info.id)
    this.history = this.history.filter(
      (f) => (f as { properties: { id: string } }).properties.id !== info.id,
    )
    this.historyDirty = true
    this.trails.update((list) => list.filter((t) => t.id !== info.id))
    return true
  }

  /** Play the picked trail back (or carry on, or start again at the end). */
  async playReplay() {
    const info = get(this.selectedTrail)
    if (!info) return
    const running = this.replaying
    if (running) {
      if (running.cursor >= running.total) running.cursor = 0
      this.replay.update((r) => (r ? { ...r, phase: "playing" } : r))
      return
    }
    if (get(this.replay)?.phase === "loading") return
    this.replay.set({
      trailId: info.id,
      phase: "loading",
      progress: 0,
      time: info.start,
      rate: 1,
      timed: false,
    })
    const timeline = await loadTrailTimeline(info).catch(() => null)
    // They moved on while it loaded.
    if (get(this.selectedTrail)?.id !== info.id || !get(this.replay)) return
    if (!timeline || !timeline.parts.length) {
      this.replay.set(null)
      this.problem.set("This trail has no recorded path to replay.")
      return
    }

    // Lay every point on one axis of working time. Untimed trails get an
    // even pace from start to finish; long stops are shortened either way.
    const points: ReplayPoint[] = []
    const parts: Replay["parts"] = []
    let length = 0
    if (!timeline.timed)
      for (const part of timeline.parts)
        for (let i = 1; i < part.length; i++)
          length += distanceM(part[i - 1].at, part[i].at)
    const span =
      info.end && info.end > info.start
        ? info.end - info.start
        : (length / 5) * 1000
    let axis = 0
    let covered = 0
    timeline.parts.forEach((part, index) => {
      parts.push({ coords: part.map((point) => point.at), from: points.length })
      part.forEach((point, i) => {
        let t = point.t
        if (!timeline.timed) {
          if (i > 0) covered += distanceM(part[i - 1].at, point.at)
          t = info.start + (length ? covered / length : 0) * span
        }
        const before = i > 0 ? points[points.length - 1] : null
        if (before) axis += clamp(t - before.t, 0, 20_000)
        points.push({
          at: point.at,
          t,
          axis,
          part: index,
          along: before ? before.along + distanceM(before.at, point.at) : 0,
        })
      })
    })
    if (points.length < 2 || axis <= 0) {
      this.replay.set(null)
      this.problem.set("This trail is too short to replay.")
      return
    }

    const spec = machineFor(info.machine)
    const vehicle = this.mountVehicle(
      spec.type,
      drawColour(info.colour),
      "Replay",
      points[0].at,
      false,
    )
    vehicle.marker.getElement().style.zIndex = "5"
    this.replaying = {
      info,
      points,
      parts,
      total: axis,
      cursor: 0,
      index: 0,
      // A whole trail plays in under a minute or so at 1×.
      seconds: clamp(axis / 1000 / 150, 14, 70),
      vehicle,
      colour: drawColour(info.colour),
      drawn: -1,
      told: 0,
      offsets: parts.map((_, index) =>
        parts
          .slice(0, index)
          .reduce(
            (sum, part) =>
              sum + points[part.from + part.coords.length - 1].along,
            0,
          ),
      ),
    }
    this.onZoom()
    this.paintPicked()
    // The marching line steps aside: the trail paints itself in instead,
    // and its arrows show as the machine passes them.
    this.map.getSource(PICKED_TRAIL_SOURCE)?.setData(collection([]))
    this.pickedArrows(
      parts.map((part) => part.coords),
      info.colour,
    )
    showArrowsTo(this.map, 0)
    this.replay.set({
      trailId: info.id,
      phase: "playing",
      progress: 0,
      time: points[0].t,
      rate: 1,
      timed: timeline.timed,
    })
  }

  /**
   * Draw the picked trail (and its replay) with a black line down its
   * middle, with arrows the way it was driven, both, or neither.
   */
  setTrailMarks(marks: { centre: boolean; arrows: boolean }) {
    this.marks = { ...marks }
    if (get(this.ready)) showPickedMarks(this.map, this.marks)
  }

  pauseReplay() {
    this.replay.update((r) =>
      r && r.phase === "playing" ? { ...r, phase: "paused" } : r,
    )
  }

  /** Jump to a point in the replay, 0 to 1. */
  seekReplay(progress: number) {
    const running = this.replaying
    if (!running) return
    running.cursor = clamp(progress, 0, 1) * running.total
    running.drawn = -1
    this.replay.update((r) =>
      r && r.phase === "done" ? { ...r, phase: "paused" } : r,
    )
  }

  setReplayRate(rate: number) {
    this.replay.update((r) => (r ? { ...r, rate } : r))
  }

  /** End the replay and put the trail back as it was. */
  stopReplay() {
    const running = this.replaying
    this.replay.set(null)
    if (!running) return
    running.vehicle.view.$destroy()
    running.vehicle.marker.remove()
    this.replaying = null
    this.map.getSource(REPLAY_SOURCE)?.setData(collection([]))
    const features = this.trailFeatures(running.info.id)
    this.map.getSource(PICKED_TRAIL_SOURCE)?.setData(collection(features))
    this.pickedArrows(features.flatMap(partsOf), running.info.colour)
    this.paintPicked()
  }

  /** Lay out the picked trail's direction arrows, all of them showing. */
  private pickedArrows(parts: LngLat[][], colour: string | null | undefined) {
    this.map
      .getSource(PICKED_ARROW_SOURCE)
      ?.setData(collection(arrowsAlong(parts, drawColour(colour))))
    showArrowsTo(this.map, null)
  }

  /** Where the replay's machine is `along` metres into its current stretch. */
  private replayAt(running: Replay, along: number): LngLat {
    const { points } = running
    const part = points[running.index].part
    let i = running.index
    if (along < points[i].along) {
      while (i > 0 && points[i - 1].part === part && points[i].along > along)
        i--
    } else {
      while (
        i < points.length - 2 &&
        points[i + 1].part === part &&
        points[i + 1].along < along
      )
        i++
    }
    const a = points[i]
    const b = points[i + 1]
    if (!b || b.part !== part || b.along <= a.along) return a.at
    const f = clamp((along - a.along) / (b.along - a.along), 0, 1)
    return [lerp(a.at[0], b.at[0], f), lerp(a.at[1], b.at[1], f)]
  }

  /** Move the replay on by one frame. */
  private stepReplay(dt: number, now: number) {
    const running = this.replaying
    const state = get(this.replay)
    if (!running || !state) return
    const { points } = running
    if (state.phase === "playing")
      running.cursor = Math.min(
        running.total,
        running.cursor + dt * (running.total / running.seconds) * state.rate,
      )

    const last = points.length - 1
    while (
      running.index < last - 1 &&
      points[running.index + 1].axis <= running.cursor
    )
      running.index++
    while (running.index > 0 && points[running.index].axis > running.cursor)
      running.index--
    const a = points[running.index]
    const b = points[Math.min(running.index + 1, last)]
    let at = a.at
    let time = a.t
    // How far along the whole trail the machine is, for its arrows.
    let travelled = running.offsets[a.part] + a.along
    if (b.part === a.part && b.axis > a.axis) {
      const f = clamp((running.cursor - a.axis) / (b.axis - a.axis), 0, 1)
      at = [lerp(a.at[0], b.at[0], f), lerp(a.at[1], b.at[1], f)]
      time = lerp(a.t, b.t, f)
      // Which way it points comes from the path itself: from a little
      // behind the machine to a little ahead. That turns it smoothly through
      // a headland at any replay speed, and GPS wobble between two points a
      // few metres apart can't swing it about.
      const here = lerp(a.along, b.along, f)
      travelled = running.offsets[a.part] + here
      const reach = clamp(machineFor(running.info.machine).span * 0.45, 5, 14)
      const behind = this.replayAt(running, here - reach)
      const ahead = this.replayAt(running, here + reach)
      if (distanceM(behind, ahead) > 1)
        running.vehicle.heading = bearingDeg(behind, ahead)
    } else if (running.cursor >= b.axis) {
      // The end of a stretch: the machine picks up where the next begins.
      at = b.at
      time = b.t
      travelled = running.offsets[b.part] + b.along
    }

    const { vehicle } = running
    vehicle.pos = at
    vehicle.marker.setLngLat(at)
    // Only the last of the jitter is eased out; the path does the turning.
    vehicle.eased = Number.isNaN(vehicle.eased)
      ? vehicle.heading
      : easeHeading(vehicle.eased, vehicle.heading, 1 - Math.exp(-dt * 30))
    this.turnTo(vehicle, vehicle.eased - this.map.getBearing())

    // The trail paints in behind the machine, a few times a second.
    if (running.cursor !== running.drawn && now - running.told > 70) {
      running.drawn = running.cursor
      const onNext = at === b.at && b.part !== a.part
      const here = onNext ? b : a
      const hereIndex = onNext ? running.index + 1 : running.index
      const features = running.parts.flatMap((part, index) => {
        if (index > here.part) return []
        const coords =
          index < here.part
            ? part.coords
            : [...part.coords.slice(0, hereIndex - part.from + 1), at]
        return coords.length > 1
          ? [line(coords, running.colour, running.info.width)]
          : []
      })
      // The stretch just laid is still bright: the last hundred metres or so.
      const stretch = running.parts[here.part]
      const laid = [
        ...stretch.coords.slice(0, hereIndex - stretch.from + 1),
        at,
      ]
      const fresh: LngLat[] = [at]
      let length = 0
      for (let i = laid.length - 2; i >= 0 && length < 110; i--) {
        length += distanceM(laid[i + 1], laid[i])
        fresh.push(laid[i])
      }
      if (fresh.length > 1)
        features.push(
          line(fresh, running.colour, running.info.width, { segment: "head" }),
        )
      this.map.getSource(REPLAY_SOURCE)?.setData(collection(features))
      showArrowsTo(this.map, travelled)
    }
    if (now - running.told > 70) {
      running.told = now
      const done = running.cursor >= running.total
      this.replay.update((r) =>
        r
          ? {
              ...r,
              progress: running.cursor / running.total,
              time,
              phase: done && r.phase === "playing" ? "done" : r.phase,
            }
          : r,
      )
    }
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
          bottom: 200 + this.insets.bottom,
          left: 60 + this.insets.left,
        },
        maxZoom: 16.5,
        duration: 900,
      },
    )
    return true
  }

  private drawTrails() {
    const changed = this.historyDirty || this.liveDirty
    if (this.historyDirty) {
      this.historyDirty = false
      this.map.getSource(HISTORY_SOURCE)?.setData(collection(this.history))
    }

    const recording = get(this.recorder.state).trail
    const points = recording ? this.recorder.points : []
    const colour = recording ? drawColour(recording.colour) : ""
    const width = recording?.width ?? 0
    this.drawArrows(
      changed,
      points.map((p) => p.at),
      colour,
    )

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

  /**
   * Direction arrows over every trail, when they are switched on in Layers.
   * A finished trail's arrows are worked out once and kept; the trails still
   * being laid are redone as they grow.
   */
  private drawArrows(changed: boolean, mine: LngLat[], mineColour: string) {
    const source = this.map.getSource(ARROW_SOURCE)
    if (!source) return
    if (this.shown.trailArrows !== true) {
      if (!this.arrowsDrawn) return
      this.arrowsDrawn = ""
      this.historyArrows.clear()
      source.setData(collection([]))
      return
    }
    const drawn = `on|${mine.length}`
    if (!changed && drawn === this.arrowsDrawn) return
    this.arrowsDrawn = drawn

    const arrows: unknown[] = []
    for (const id of [...this.historyArrows.keys()])
      if (!this.historyIds.has(id)) this.historyArrows.delete(id)
    for (const feature of this.history) {
      const properties = (
        feature as {
          properties: { id: string; color: string; segment?: string }
        }
      ).properties
      if (properties.segment === "pause") continue
      let kept = this.historyArrows.get(properties.id)
      if (!kept) {
        kept = arrowsAlong(partsOf(feature), properties.color, {
          kind: "historicalTrails",
        })
        this.historyArrows.set(properties.id, kept)
      }
      for (const arrow of kept) arrows.push(arrow)
    }
    for (const trail of this.liveTrails.values())
      for (const arrow of arrowsAlong(
        [trail.points.map((p) => p.at)],
        drawColour(trail.info.colour),
        { kind: "activeTrails" },
      ))
        arrows.push(arrow)
    for (const arrow of arrowsAlong([mine], mineColour, {
      kind: "activeTrails",
    }))
      arrows.push(arrow)
    source.setData(collection(arrows))
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
    showLayers(this.map, this.shown, look)
    this.paintPicked()
  }

  /**
   * Show and hide layers. The keys are the ones the current viewer saves in
   * the person's settings, so a choice made on either map holds on both.
   */
  setLayers(shown: Record<string, boolean>) {
    const hectares = shown.fieldHectares !== this.shown.fieldHectares
    this.shown = { ...shown }
    if (get(this.ready)) showLayers(this.map, this.shown, this.base)
    if (hectares) this.drawPaddocks()
    for (const entry of this.crewById.values()) {
      if (!entry.vehicle) continue
      entry.vehicle.marker.getElement().style.display =
        shown.vehicles === false ? "none" : ""
      entry.vehicle.view.$set({ label: this.tagFor(entry) })
    }
  }

  // ── Measuring ───────────────────────────────────────────────────────────

  /**
   * Start (or stop) the measure and draw tool: taps on the map add corners
   * of an area, or points along a line. What is drawn can then be kept.
   */
  setMeasuring(on: boolean, kind: "polygon" | "line" = "polygon") {
    this.measured = []
    this.clearSelection()
    this.armPin(null)
    this.measure.set(
      on ? { points: 0, distance: 0, ha: 0, kind, paddock: null } : null,
    )
    this.map.getCanvas().style.cursor = on ? "crosshair" : ""
    this.drawMeasure()
  }

  /** Switch between an area and a line without losing the corners. */
  setMeasureKind(kind: "polygon" | "line") {
    this.measure.update((m) => (m ? { ...m, kind } : m))
    this.drawMeasure()
  }

  /** What has been tapped out, if there is enough of it to keep. */
  private drawn() {
    const state = get(this.measure)
    const points = [...this.measured]
    if (!state || state.drawing || state.keeping) return null
    if (points.length < (state.kind === "polygon" ? 3 : 2)) return null
    return { state, points }
  }

  private async keep(save: () => Promise<void>, failed: string) {
    this.measure.update((m) => (m ? { ...m, keeping: true } : m))
    try {
      await save()
    } catch {
      this.measure.update((m) => (m ? { ...m, keeping: false } : m))
      this.problem.set(navigator.onLine ? failed : `No signal: ${failed}`)
      return false
    }
    this.cancelDrawing()
    return true
  }

  private setPaddock(id: string, change: Partial<Paddock>) {
    this.paddocks = this.paddocks.map((p) =>
      p.id === id ? { ...p, ...change } : p,
    )
    this.paddockList.set(this.paddocks)
    const now = this.paddocks.find((p) => p.id === id)
    if (now && get(this.selectedPaddock)?.id === id)
      this.selectedPaddock.set(now)
    this.farm.set({
      paddocks: this.paddocks.length,
      ha: this.paddocks.reduce((sum, p) => sum + p.ha, 0),
    })
    this.drawPaddocks()
  }

  /** Keep what has been drawn on the paddock it sits in, with a name. */
  keepOnPaddock(label: string, colour: string) {
    const drawn = this.drawn()
    const paddock = drawn?.state.paddock
    if (!drawn || !paddock) return Promise.resolve(false)
    return this.keep(async () => {
      const features = await addPaddockFeature(paddock.id, {
        kind: drawn.state.kind,
        label: label.trim().slice(0, 40),
        colour,
        coordinates: drawn.points,
      })
      this.setPaddock(paddock.id, { features })
    }, "that didn't save. Try again.")
  }

  /** Take something kept on a paddock off it. */
  async removeFeature(paddockId: string, featureId: string) {
    try {
      const features = await removePaddockFeature(paddockId, featureId)
      this.setPaddock(paddockId, { features })
      return true
    } catch {
      this.problem.set("That couldn't be removed. Try again.")
      return false
    }
  }

  /**
   * Cut the drawn area out of the paddock it sits in, for good: the
   * paddock's boundary and hectares change.
   */
  cutFromPaddock() {
    const drawn = this.drawn()
    const paddock = this.paddocks.find((p) => p.id === drawn?.state.paddock?.id)
    if (!drawn || !paddock || drawn.state.kind !== "polygon")
      return Promise.resolve(false)
    return this.keep(async () => {
      const cut = await cutPaddock(paddock, drawn.points)
      if (!cut) throw new Error("Nothing to cut")
      this.setPaddock(paddock.id, { polygons: cut.polygons, ha: cut.ha })
    }, "that couldn't be cut out. Try again.")
  }

  /** Keep what has been drawn on a new pin dropped in its middle. */
  keepAsPin(iconClass: string, note: string, colour: string) {
    const drawn = this.drawn()
    if (!drawn) return Promise.resolve(false)
    return this.keep(async () => {
      const pin = await createPin(
        this.mapId,
        this.userId,
        iconClass,
        middle(drawn.points),
      )
      this.pinsById.set(pin.id, pin)
      this.drawPins()
      if (note.trim()) await this.updatePin(pin.id, { note })
      await createDrawing({
        mapId: this.mapId,
        userId: this.userId,
        pinId: pin.id,
        kind: drawn.state.kind,
        points: drawn.points,
        colour,
      })
      await this.refreshDrawings()
      const made = this.pinsById.get(pin.id)
      if (made) this.selectedPin.set(made)
    }, "that didn't save. Try again.")
  }

  /** The finished trails of the job on show that cross a paddock. */
  private trailsIn(paddock: Paddock) {
    const [w, s, e, n] = paddock.bbox
    const inside = (at: LngLat) =>
      at[0] >= w &&
      at[0] <= e &&
      at[1] >= s &&
      at[1] <= n &&
      paddock.polygons.some((rings) => pointInPolygon(at, rings))
    const found = new Set<string>()
    for (const feature of this.history) {
      const properties = (
        feature as { properties: { id: string; segment?: string } }
      ).properties
      if (properties.segment === "pause" || found.has(properties.id)) continue
      for (const part of partsOf(feature)) {
        // Every few points is plenty to tell if a trail went through.
        const step = Math.max(1, Math.floor(part.length / 400))
        let hit = false
        for (let i = 0; i < part.length && !hit; i += step)
          hit = inside(part[i])
        if (hit) {
          found.add(properties.id)
          break
        }
      }
    }
    return get(this.trails).filter((trail) => found.has(trail.id))
  }

  // ── Rounding up pins to remove ──────────────────────────────────────────
  // The current viewer's bulk delete: drag a line round the pins, see which
  // it caught, confirm.

  startLasso() {
    this.cancelLasso()
    this.clearSelection()
    this.armPin(null)
    this.map.dragPan.disable()
    this.map.getCanvas().style.cursor = "crosshair"
    this.lasso.set({ phase: "drawing", count: 0 })
    const container = this.map.getContainer() as HTMLElement
    let path: LngLat[] | null = null
    const pointOf = (e: MouseEvent | TouchEvent): LngLat | null => {
      const touch = "touches" in e ? (e.touches[0] ?? e.changedTouches[0]) : e
      if (!touch) return null
      const box = container.getBoundingClientRect()
      const at = this.map.unproject([
        touch.clientX - box.left,
        touch.clientY - box.top,
      ])
      return [at.lng, at.lat]
    }
    const draw = (features: unknown[]) =>
      this.map.getSource(LASSO_SOURCE)?.setData(collection(features))
    const lineOf = (points: LngLat[]) => ({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: points },
    })
    const down = (e: MouseEvent | TouchEvent) => {
      if (get(this.lasso)?.phase !== "drawing") return
      if ("touches" in e && e.touches.length > 1) return
      const at = pointOf(e)
      if (!at) return
      e.preventDefault()
      e.stopPropagation()
      path = [at]
    }
    const drag = (e: MouseEvent | TouchEvent) => {
      const at = pointOf(e)
      if (!path || !at) return
      if (e.cancelable) e.preventDefault()
      path.push(at)
      draw([lineOf(path)])
    }
    const up = () => {
      const ring = path
      path = null
      if (!ring) return
      if (ring.length < 3) {
        draw([])
        return
      }
      const caught = [...this.pinsById.values()].filter((pin) =>
        pointInPolygon(pin.at, [ring]),
      )
      if (!caught.length) {
        draw([])
        this.problem.set("No pins inside that. Draw right round them.")
        return
      }
      this.lassoed = caught.map((pin) => pin.id)
      draw([
        {
          type: "Feature",
          properties: {},
          geometry: { type: "Polygon", coordinates: [[...ring, ring[0]]] },
        },
        lineOf([...ring, ring[0]]),
        ...caught.map((pin) => ({
          type: "Feature",
          properties: {},
          geometry: { type: "Point", coordinates: pin.at },
        })),
      ])
      this.map.dragPan.enable()
      this.map.getCanvas().style.cursor = ""
      this.lasso.set({ phase: "confirm", count: caught.length })
    }
    container.addEventListener("mousedown", down, true)
    container.addEventListener("touchstart", down, {
      capture: true,
      passive: false,
    })
    window.addEventListener("mousemove", drag)
    window.addEventListener("touchmove", drag, { passive: false })
    window.addEventListener("mouseup", up)
    window.addEventListener("touchend", up)
    this.stopLasso = () => {
      container.removeEventListener("mousedown", down, true)
      container.removeEventListener("touchstart", down, true)
      window.removeEventListener("mousemove", drag)
      window.removeEventListener("touchmove", drag)
      window.removeEventListener("mouseup", up)
      window.removeEventListener("touchend", up)
    }
  }

  /** Put the lasso away without removing anything. */
  cancelLasso() {
    this.stopLasso?.()
    this.stopLasso = null
    this.lassoed = []
    if (!get(this.lasso)) return
    this.lasso.set(null)
    this.map.dragPan.enable()
    this.map.getCanvas().style.cursor = ""
    this.map.getSource(LASSO_SOURCE)?.setData(collection([]))
  }

  /** Go back to drawing the lasso again. */
  redoLasso() {
    if (get(this.lasso)) this.startLasso()
  }

  /** Remove every pin the lasso caught. Resolves with the ones removed. */
  async removeLassoed() {
    const ids = [...this.lassoed]
    this.cancelLasso()
    const removed: LivePin[] = []
    for (const id of ids) {
      const pin = await this.removePin(id)
      if (pin) removed.push(pin)
    }
    return removed
  }

  /** Put back pins that were just removed. */
  async restorePins(pins: LivePin[]) {
    for (const pin of pins) await this.restorePin(pin)
  }

  /** Take back the last corner. */
  undoMeasure() {
    this.measured.pop()
    this.drawMeasure()
  }

  private drawMeasure() {
    const points = this.measured
    // Drawing for a pin: in its colour. A line stays open either way.
    const state = get(this.measure)
    const drawing = state?.drawing
    const properties = drawing ? { color: drawing.colour } : {}
    const closed =
      points.length > 2 && (drawing?.kind ?? state?.kind) !== "line"
    const features: unknown[] = points.map((at) => ({
      type: "Feature",
      properties,
      geometry: { type: "Point", coordinates: at },
    }))
    let distance = 0
    for (let i = 1; i < points.length; i++)
      distance += distanceM(points[i - 1], points[i])
    // An area is measured all the way round, back to where it started.
    if (closed) distance += distanceM(points[points.length - 1], points[0])
    let ha = 0
    if (points.length > 1)
      features.push({
        type: "Feature",
        properties,
        geometry: {
          type: "LineString",
          coordinates: closed ? [...points, points[0]] : points,
        },
      })
    if (closed) {
      features.push({
        type: "Feature",
        properties,
        geometry: { type: "Polygon", coordinates: [[...points, points[0]]] },
      })
      // Area on flat ground around the first corner: plenty for a paddock.
      const flat = projector(points[0])
      const xy = points.map((p) => flat.toXY(p))
      let twice = 0
      for (let i = 0, j = xy.length - 1; i < xy.length; j = i++)
        twice += xy[j][0] * xy[i][1] - xy[i][0] * xy[j][1]
      ha = Math.abs(twice) / 2 / 10000
    }
    if (get(this.ready))
      this.map.getSource(MEASURE_SOURCE)?.setData(collection(features))
    // Which paddock it is being drawn in (where its first corner sits).
    const under = points.length ? this.paddockAt(points[0]) : null
    this.measure.update((m) =>
      m
        ? {
            ...m,
            points: points.length,
            distance,
            ha,
            paddock: under ? { id: under.id, name: under.name } : null,
          }
        : m,
    )
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
    if (this.tail) {
      this.tail = null
      this.following.set(null)
    }
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
      // Tapping your own machine opens its menu (colour, width, machine).
      const el = this.mine.marker.getElement() as HTMLElement
      el.addEventListener("click", (event) => {
        event.stopPropagation()
        if (this.armed || get(this.measure) || this.replaying) return
        this.pickTrail(null)
        this.selectedPin.set(null)
        this.selectedPaddock.set(null)
        this.selectedCrew.update((id) => (id === ME ? null : ME))
      })
      const flashing = get(this.broadcast)
      this.mine.view.$set({
        tappable: true,
        selected: get(this.selectedCrew) === ME,
        flash: flashing
          ? { label: flashLabel(flashing), colour: flashing.colour }
          : null,
      })
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

  private sendNow(flash?: Flash | null) {
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
      ...(flash !== undefined ? { flash } : {}),
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

    const tail = this.tail
    if (tail) {
      const followed = this.crewById.get(tail.id)?.vehicle
      if (!followed) this.followCrew(null)
      else if (now > this.followPausedUntil && !this.touching)
        this.map.easeTo({
          center: followed.pos,
          ...(tail.mode === "cab"
            ? {
                bearing:
                  bearing +
                  turn(bearing, followed.heading) * (1 - Math.exp(-dt * 3)),
              }
            : {}),
          offset: this.followOffset(tail.mode),
          duration: 0,
        })
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

    this.stepReplay(dt, now)
    this.stepMove(dt)

    // Whatever is picked out breathes: its glow swells and settles.
    if (this.marching) {
      this.marchTick -= dt
      if (this.marchTick <= 0) {
        this.marchTick = 0.05
        breathe(this.map, 0.5 - 0.5 * Math.cos(now / 520))
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
      // A machine that has gone quiet isn't doing the speed it last sent.
      for (const entry of this.crewById.values())
        if (
          entry.vehicle &&
          entry.state &&
          entry.state.speed > 0 &&
          Date.now() - entry.state.t >= FRESH_FOR
        )
          entry.vehicle.view.$set({ speed: 0 })
      this.mine?.view.$set({
        speed:
          this.lastFix && Date.now() - this.lastFix.t < 15000
            ? this.speedKmh
            : 0,
      })
      const mine = get(this.broadcast)
      if (mine && Date.now() - mine.started >= BROADCAST_FOR)
        this.stopBroadcast()
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
    // Looking at a whole district, the crew's name tags pile up on one
    // spot, and further out so do the machines: they step back in turn.
    const classes = this.map.getContainer().classList
    classes.toggle("mn-far", zoom < 9.5)
    classes.toggle("mn-farther", zoom < 8)
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
    if (this.replaying) resize(this.replaying.vehicle)
  }

  destroy() {
    this.destroyed = true
    this.endMove(false)
    this.stopLasso?.()
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
    this.picked?.view.$destroy()
    this.replaying?.vehicle.view.$destroy()
    this.map.remove()
  }
}
