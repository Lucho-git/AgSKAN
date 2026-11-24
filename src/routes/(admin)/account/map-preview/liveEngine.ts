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
  grainBinDefaultCapacity,
  grainBinName,
  isGrainBinIcon,
} from "$lib/components/map/markers/markerPalette"
import { logGrainEvent } from "$lib/api/grainLogApi"
import {
  computePowerNearData,
  filterNationalNear,
} from "$lib/utils/powerNearFields.js"
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
  JOB_SOURCE,
  GUIDE_SOURCE,
  GUIDE_AHEAD_SOURCE,
  EDIT_SOURCE,
  THROUGH_SOURCE,
  THROUGH_MASK_SOURCE,
  OUTSIDE_SOURCE,
  POWER_LINE_SOURCE,
  POWER_POLE_SOURCE,
  POWER_POLE_IMAGE,
  setTrailLevel,
  type TrailLevel,
  PICKED_SHAPE_SOURCE,
  showThrough,
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
  type Projector,
  workingPasses,
} from "$lib/components/mapnext/geo"
import { formatAgo, formatHa } from "$lib/components/mapnext/format"
import { machineFor, type VehicleType } from "$lib/components/mapnext/machines"
import {
  blockColour,
  drawColour,
  setTrailPalette,
  trailColour,
  type TrailPalette,
} from "$lib/components/mapnext/palette"
import { checkTrail, type TrailCheck } from "./trailCheck"
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
  loadTrailDetail,
  loadTrailTimeline,
  deleteTrail,
  patchPin,
  setPinNote,
  loadDrawings,
  watchDrawings,
  addPaddockFeature,
  removePaddockFeature,
  takeOut,
  joinOn,
  crossesItself,
  haAfter,
  outlineHa,
  saveBoundary,
  bboxOf,
  createPaddock,
  createPaddockLike,
  changePaddockFeatures,
  splitAlong,
  outlineOfPath,
  mergeOutlines,
  gapBetween,
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
  createFarm,
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
  /** The account's name (often a machine: "H3", "Wheels"). */
  name: string
  /** Who is in the machine now, when the account has picked a driver. */
  driver: string | null
  guest: boolean
  type: VehicleType
  machineLabel: string
  /** The colour to draw, already translated from the saved name. */
  colour: string
  /** What they are doing and where, in one line ("Spraying · Railway"). */
  doing: string
  /** The same in two parts: what ("Spraying"), and the paddock, if any. */
  action: string
  where: string | null
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
  | "crewSettings"
  | "machine"
  | "pins"
  | "trails"
  | "paddocks"
  | "map"
  | "layers"
  | "broadcast"
  | "farm"
  | "dev"

/**
 * A made-up position for testing, in place of the device's own (admin
 * accounts only): "roam" works its way through the nearest paddocks,
 * "drive" goes wherever the map is tapped.
 */
export type DevGps = { mode: "roam" | "drive"; kmh: number }
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
  /** The colour it is drawn in (and kept in). */
  colour?: string
  /** Being drawn for the job that is being put together. */
  forJob?: boolean
  /** Some of it sits on a paddock (so it can't become one itself). */
  overPaddock?: boolean
  /** Set when what is being tapped out will be attached to a pin. */
  drawing?: {
    pinId: string
    kind: "polygon" | "line"
    colour: string
    saving: boolean
  }
}

/** A trail's check, for its card: the figures, and whether it is fixed. */
export type TrailSuspect = Omit<TrailCheck, "kept"> & {
  trailId: string
  /** Its strays are hidden on this device. */
  fixed: boolean
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
  /** km/h the machine was doing here, from the trail's own timing. */
  speed: number
  shownSpeed: number
  /** Metres of trail before each stretch begins (for the arrows). */
  offsets: number[]
}

/**
 * Following a trail that has already been driven: where the line is from
 * the driver's seat, what the path does next, and how much of it is left.
 */
export type Guide = {
  trailId: string
  /**
   * loading: fetching the path. waiting: no position yet. away: too far off
   * to steer by (go to it first). on: steering along it. done: at its end.
   */
  phase: "loading" | "waiting" | "away" | "on" | "done"
  /**
   * Metres from the driver to the line: below zero it is to their left,
   * above zero to their right.
   */
  offset: number
  /** How far to the line, and which way on the screen, while away. */
  away: { metres: number; screen: number } | null
  /** The next turn in the path, if there is one coming. */
  turn: { side: "left" | "right"; metres: number; back: boolean } | null
  /** Metres still to go, and of the whole trail. */
  left: number
  total: number
  /** Heading for the start of the trail rather than its nearest point. */
  toStart: boolean
  /** Following it backwards from the way it was driven. */
  reversed: boolean
  /** The machine is travelling against the way the guide is set. */
  against: boolean
  /** How good the position is, in metres, when the device says. */
  accuracy: number | null
  /** A made-up machine is driving it, to show how the guide looks. */
  demo: boolean
  /** How many times faster than a working pace the demo runs. */
  rate: number
}

/** What saving a boundary did, so it can be put back. */
export type BoundarySaved = {
  paddockId: string
  name: string
  /** Paddocks made by a split. */
  made: Paddock[]
  /** Paddocks that were joined on, and so are gone. */
  gone: Paddock[]
}

/** What every trail through one paddock adds up to, inside its fence. */
export type ThroughStats = {
  trails: number
  /** Kilometres driven inside the paddock. */
  km: number
  /** Hectares of it that a trail has been over (overlaps counted once). */
  ha: number
  /** Hectares of that which more than one of the trails went over. */
  twice: number
  /** The paddock's own hectares. */
  of: number
  /** Who drove them. */
  drivers: string[]
  /** First and last, ms. */
  from: number
  to: number
}

/** Several trails being replayed together, on one clock. */
export type SetReplayState = {
  phase: "loading" | "playing" | "paused" | "done"
  /** How far through, 0 to 1. */
  progress: number
  /** The time of day it has reached (ms). */
  time: number
  rate: number
  /** While loading: how many trails are ready, of how many. */
  loaded: number
  total: number
  /** Who is working at this moment. */
  active: string[]
}

type SetTrack = {
  info: TrailInfo
  colour: string
  points: { at: LngLat; t: number; axis: number; part: number }[]
  /** Where it begins and ends on the shared clock. */
  from: number
  to: number
  index: number
  vehicle: Vehicle | null
}

type SetRun = {
  tracks: SetTrack[]
  /** Real time against the shared clock, where idle time was cut out. */
  breaks: { real: number; axis: number }[]
  total: number
  cursor: number
  /** Seconds the whole set takes at 1×. */
  seconds: number
  drawn: number
  told: number
  /** The trails already finished, as last drawn. */
  done: string
}

/** A drawing picked out: one on a pin, or one kept on a paddock. */
export type PickedShape = {
  id: string
  /** west, south, east, north */
  bbox: [number, number, number, number]
}

/** A paddock's boundary while it is being changed. */
export type BoundaryEdit = {
  paddockId: string
  name: string
  /** Hectares inside the outline as it stands, and as it was to begin with. */
  ha: number
  was: number
  pieces: number
  holes: number
  /** A corner is picked out: what can be done with it. */
  picked: {
    hole: boolean
    canRemoveCorner: boolean
    canRemoveRing: boolean
  } | null
  /**
   * Ground being tapped out: a hole to cut, a piece to add, or a line
   * across the paddock to split it along.
   */
  adding: { kind: "hole" | "piece" | "split"; points: number } | null
  /** Waiting for a tap on the paddock next door, to join it on. */
  joining: boolean
  /** The paddocks joined onto this one so far, by name. */
  joined: string[]
  /**
   * Split with a line: on saving, each piece becomes a paddock of its own.
   * The hectares of each, the biggest (which keeps the name) first.
   */
  apart: number[] | null
  /** Changes that can be stepped back through. */
  steps: number
  changed: boolean
  saving: boolean
  /** This is a new paddock being drawn, not an existing one being changed. */
  creating: boolean
  /**
   * It is not a paddock at all but a line or an area drawn on a pin: what
   * it is, how many corners it has, and how long a line is.
   */
  shape: {
    kind: "polygon" | "line"
    corners: number
    metres: number
    colour: string
  } | null
  /** The outline as it stands, for a picture of it. */
  polygons: LngLat[][][]
}

type Editing = {
  paddock: Paddock
  /** Each piece's rings, outer first, without the corner that closes them. */
  rings: LngLat[][][]
  original: string
  history: { rings: LngLat[][][]; absorbed: string[]; apart: boolean }[]
  /** Piece, ring, corner. */
  picked: [number, number, number] | null
  adding: { kind: "hole" | "piece" | "split"; points: LngLat[] } | null
  /** Paddocks joined on: they go when this is saved. */
  absorbed: string[]
  /** Split with a line: the pieces part company when this is saved. */
  apart: boolean
  joining: boolean
  /** A new paddock is being made: the farm it is for. */
  creating: { farmId: string | null } | null
  /**
   * A line or an area is being changed, not a paddock: one drawn on a pin,
   * or one kept on a paddock.
   */
  shape: {
    on:
      | { pin: string; drawingId: string }
      | { paddock: string; featureId: string; label: string }
    kind: "polygon" | "line"
    colour: string
    /** The colour it had to begin with. */
    was: string
  } | null
  drag: {
    at: [number, number, number]
    from: [number, number]
    moved: boolean
  } | null
  was: number
  dirty: boolean
  told: number
  /** A press that ended on a corner is not also a tap on the map. */
  quietUntil: number
  saving: boolean
  stop: () => void
}

const openRing = (ring: LngLat[]): LngLat[] => {
  const last = ring[ring.length - 1]
  const closed =
    ring.length > 1 && ring[0][0] === last[0] && ring[0][1] === last[1]
  return (closed ? ring.slice(0, -1) : ring).map((c) => [c[0], c[1]])
}
const openRings = (polygons: LngLat[][][]) =>
  polygons.map((polygon) => polygon.map(openRing))
const closeRings = (rings: LngLat[][][]): LngLat[][][] =>
  rings.map((polygon) => polygon.map((ring) => [...ring, ring[0]]))

/** The pace the demo machine works at, km/h. */
const SIM_KMH = 14

type GuidePath = {
  info: TrailInfo
  /** The path as recorded, joined end to end, in the order followed. */
  raw: LngLat[]
  flat: Projector
  /** The path every few metres, in metres around `flat.anchor`. */
  x: Float64Array
  y: Float64Array
  /** Metres from the start to each of those points. */
  along: Float64Array
  turns: { at: number; side: "left" | "right"; angle: number }[]
  /** The stretch the machine was last matched to. */
  index: number
  /** It has been on (or near) the line at least once. */
  joined: boolean
  toStart: boolean
  reversed: boolean
  againstFor: number
  told: number
  searched: number
}

/** Metres between the points a followed path is cut into. */
const GUIDE_STEP = 5

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
/** The id of a pin that is being placed and doesn't exist yet. */
const DRAFT = "__draft"

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
/**
 * The national power lines (Geoscience Australia), a file of the app's own:
 * fetched once, and only when a map first needs it.
 */
let nationalPower: Promise<{ features: unknown[] }> | null = null
const loadNationalPower = () => {
  nationalPower ??= fetch("/powerLines/powerlines.geojson")
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return response.json()
    })
    .catch((error) => {
      nationalPower = null
      throw error
    })
  return nationalPower
}

/** A power pole as the map draws it: a dark disc with a yellow bolt. */
function powerPoleImage() {
  const size = 30
  const scale = 2
  const canvas = document.createElement("canvas")
  canvas.width = size * scale
  canvas.height = size * scale
  const ctx = canvas.getContext("2d")
  if (!ctx) return null
  ctx.scale(scale, scale)
  ctx.beginPath()
  ctx.arc(size / 2, size / 2, 12.5, 0, Math.PI * 2)
  ctx.fillStyle = "#15261c"
  ctx.fill()
  ctx.lineWidth = 2
  ctx.strokeStyle = "#facc15"
  ctx.stroke()
  // (The current viewer's bolt, scaled to sit in the disc.)
  ctx.translate(size / 2 - 12.3 * 0.62, size / 2 - 15 * 0.62)
  ctx.scale(0.62, 0.62)
  ctx.fillStyle = "#facc15"
  ctx.fill(new Path2D("M13.5 2 L5.2 16.5 H10.8 L9.2 28 L19.4 13.5 H12.9 Z"))
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height)
  return { width: pixels.width, height: pixels.height, data: pixels.data }
}

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

/**
 * What goes on the tag over each machine: short, and different for each.
 * A name with a number in it ("Tablet 4", "Header 2") becomes its initials
 * and the number ("T4", "H2"), as the current viewer has it; anyone else
 * is their first name, with the first letter of their surname when two
 * people share one ("Adam S", "Adam J").
 */
export function shortTags(names: string[]): Map<string, string> {
  const tags = new Map<string, string>()
  const first = (name: string) => {
    const words = name.trim().split(/\s+/).filter(Boolean)
    const numbers = words.filter((word) => /^\d+$/.test(word))
    const others = words.filter((word) => !/^\d+$/.test(word))
    if (numbers.length && others.length)
      return (
        others.map((word) => word[0].toUpperCase()).join("") + numbers.join("")
      )
    return others[0] ?? words[0] ?? name
  }
  for (const name of names) tags.set(name, first(name))
  // Two the same: tell them apart by the next word along.
  const count = new Map<string, number>()
  for (const tag of tags.values()) count.set(tag, (count.get(tag) ?? 0) + 1)
  for (const name of names) {
    const tag = tags.get(name) as string
    if ((count.get(tag) ?? 0) < 2) continue
    const words = name.trim().split(/\s+/).filter(Boolean)
    if (words.length > 1 && !/\d/.test(tag))
      tags.set(name, `${words[0]} ${words[words.length - 1][0].toUpperCase()}`)
  }
  return tags
}

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
  /**
   * What looks wrong with the picked trail's GPS, once its detail has been
   * read (null while it is being read, and when nothing is wrong).
   */
  readonly trailSuspect: Writable<TrailSuspect | null> = writable(null)
  /** Trails looked over already, by id. */
  private trailChecks = new Map<string, TrailCheck | null>()
  /** Trails whose strays are hidden: what was drawn for each before. */
  private trailFixes = new Map<string, unknown[]>()
  /** The trails this device wants fixed (kept between visits by the page). */
  private fixWanted = new Set<string>()
  /** Told when the trails fixed on this device change. */
  onTrailFixes: ((ids: string[]) => void) | null = null
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
  /**
   * Asked on a tap on open ground: the page says true if it had something
   * to put away (and did), and the tap then picks nothing.
   */
  onAway: (() => boolean) | null = null
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
    /** Rounding up pins to remove, or ground a trail covered. */
    purpose: "pins" | "ground"
  } | null> = writable(null)
  /** What the ground inside a lasso comes back as (the page builds on it). */
  onGround: (outline: LngLat[][][]) => void = () => {}
  private lassoed: string[] = []
  private stopLasso: (() => void) | null = null
  /** The finished trails of the job on show that cross the picked paddock. */
  readonly paddockTrails: Writable<TrailInfo[]> = writable([])
  /** The thing kept on a paddock that was last tapped. */
  readonly pickedFeature: Writable<string | null> = writable(null)
  /** The drawing on a pin that is picked out, and the box it sits in. */
  readonly pickedDrawing: Writable<PickedShape | null> = writable(null)
  /** The paddock whose trails are all being shown at once, if one is. */
  readonly through: Writable<string | null> = writable(null)
  /** Several trails replaying together (a paddock's, or a whole job's). */
  readonly setReplay: Writable<SetReplayState | null> = writable(null)
  private setRun: SetRun | null = null
  /** What those trails add up to inside it. */
  readonly throughStats: Writable<ThroughStats | null> = writable(null)
  private throughIds: string[] = []
  /**
   * A pin being placed by hand before it exists (the one dropped with a
   * drawing): what it will be. It is dragged like a pin being moved.
   */
  /** The trail being followed, if one is. */
  readonly guide: Writable<Guide | null> = writable(null)
  private guiding: GuidePath | null = null
  /** The made-up machine of a demo run. */
  private sim: {
    vehicle: Vehicle
    along: number
    index: number
    rate: number
    wander: number
  } | null = null
  /** The paddock whose boundary is being changed, if one is. */
  readonly boundary: Writable<BoundaryEdit | null> = writable(null)
  private editing: Editing | null = null
  readonly placing: Writable<{ iconClass: string; colour: string } | null> =
    writable(null)
  private draft: LivePin | null = null
  /** The trail the picked crew member is laying right now, in figures. */
  readonly crewTrail: Writable<{
    since: number
    metres: number
    ha: number
    /** The colour it is being laid in, ready to draw. */
    colour: string
    /** Picked out on the map (it can be switched off, see below). */
    lit: boolean
  } | null> = writable(null)
  private crewTrailDrawn = ""
  private crewTrailLit = true
  private historyDrawnAt = 0
  private arrowsStale = false
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
  /** The made-up position being fed in, if one is (see `DevGps`). */
  readonly devGps: Writable<DevGps | null> = writable(null)
  private dev: {
    mode: "roam" | "drive"
    kmh: number
    at: LngLat
    heading: number
    /** Where it is going, and how far along that it has got. */
    route: LngLat[]
    next: number
    /** The paddock it last worked, so it moves on to another. */
    worked: string | null
    timer: ReturnType<typeof setInterval>
    last: number
  } | null = null
  /** The map is zooming about its middle (it is locked to a machine). */
  private zoomCentred = false
  private wakeLock: { release: () => Promise<void> } | null = null
  private raf = 0
  private lastFrame = 0
  private slowTick = 0
  private trailTick = 0
  private followPausedUntil = 0
  /** A kind and colour being tried on the picked pin, not yet saved. */
  private trying: { id: string; iconClass: string; colour: string } | null =
    null
  /** When a long press on the map last went off. */
  private heldAt = -1e9
  /** What a long press on the map does (the page drops the default pin). */
  onHold: (at: LngLat) => void = () => {}
  /** Where the riding camera is, and the way its machine has been going. */
  private cam: {
    key: string
    at: LngLat
    /** Trails twenty metres behind the machine: the line to it is its course. */
    hitch: LngLat
    course: number
    /** The map is part-way through turning to a new course. */
    turning: boolean
  } | null = null
  /** Fingers are on the map: leave the camera alone until they lift. */
  private touching = false
  /** So is the mouse button: the same. */
  private mouseHeld = false
  /** The pin just let go of, while it eases back into the layer. */
  private letGoOf: {
    id: string
    at: { lng: number; lat: number }
    until: number
  } | null = null
  /**
   * The press now down on the map itself, if there is one. A tap only
   * counts if it began as a press on the map, stayed put, and didn't turn
   * into a hold: so letting go over a paddock after a drag, or after a
   * press that began on a menu, picks nothing; and nor does lifting the
   * finger that has just dropped a pin by holding.
   */
  private tap: {
    x: number
    y: number
    moved: boolean
    held: boolean
    /** A finger, not a mouse: it is given a little more room. */
    touch: boolean
  } | null = null
  /** The ground each drawn trail covers (west, south, east, north). */
  private trailBoxes = new WeakMap<object, [number, number, number, number]>()
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
    this.noTapZoom()
    // Locked to a machine (yours, or one of the crew's), zooming in or out
    // keeps that machine where it is: the lock is only let go by a drag.
    const lock = () =>
      this.zoomAboutCentre(get(this.follow) !== "free" || !!get(this.following))
    this.follow.subscribe(lock)
    this.following.subscribe(lock)

    // The style, not the first full screen of tiles: on a slow connection the
    // farm should be drawn long before the last imagery tile arrives.
    this.map.once("style.load", () => {
      if (this.destroyed) return
      applyBase(this.map, this.base)
      setImagery(this.map, this.imagery, this.base)
      showLayers(this.map, this.shown, this.base)
      showPickedMarks(this.map, this.marks)
      showDrawingsFor(this.map, get(this.selectedPin)?.id ?? null)
      const pole = powerPoleImage()
      if (pole && !this.map.hasImage(POWER_POLE_IMAGE))
        this.map.addImage(POWER_POLE_IMAGE, pole, { pixelRatio: 2 })
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
      if (this.tap) this.tap.moved = true
      const touches = (e.originalEvent as TouchEvent | undefined)?.touches
      if (e.originalEvent && !(touches && touches.length > 1)) {
        // (The map is left facing the way it was: turning it north now
        // would snatch it out from under the finger dragging it.)
        this.setFollow("free", undefined, true)
        this.followCrew(null)
        // (And a replay is left to run without the map moving under it.)
        this.watch = null
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
    // The same for the mouse: with the camera turning under it every frame
    // (heading up), a drag never got started, so the lock couldn't be
    // dragged off.
    canvas.addEventListener("mousedown", () => (this.mouseHeld = true))
    const mouseUp = () => (this.mouseHeld = false)
    window.addEventListener("mouseup", mouseUp)
    this.stops.push(() => window.removeEventListener("mouseup", mouseUp))
    // Holding a finger (or the mouse) still on the map for three quarters
    // of a second, as in the current viewer: the page drops the default pin
    // there. A drag, a pinch or a second finger calls it off.
    let hold: {
      timer: ReturnType<typeof setTimeout>
      x: number
      y: number
    } | null = null
    const letGo = () => {
      if (hold) clearTimeout(hold.timer)
      hold = null
    }
    const press = (e: {
      point: { x: number; y: number }
      lngLat: { lng: number; lat: number }
      originalEvent: MouseEvent | TouchEvent
    }) => {
      letGo()
      this.tap = null
      const event = e.originalEvent
      if ("touches" in event ? event.touches.length !== 1 : event.button !== 0)
        return
      if ((event.target as HTMLElement | null)?.closest?.(".mapboxgl-marker"))
        return
      this.tap = {
        x: e.point.x,
        y: e.point.y,
        moved: false,
        held: false,
        touch: "touches" in event,
      }
      if (
        this.editing ||
        this.move ||
        this.draft ||
        this.grabbing ||
        this.replaying ||
        get(this.measure) ||
        get(this.lasso)
      )
        return
      const at: LngLat = [e.lngLat.lng, e.lngLat.lat]
      hold = {
        x: e.point.x,
        y: e.point.y,
        timer: setTimeout(() => {
          hold = null
          // The finger lifting afterwards is not also a tap on the map.
          if (this.tap) this.tap.held = true
          this.heldAt = performance.now()
          this.onHold(at)
        }, 765),
      }
    }
    const drift = (e: { point: { x: number; y: number } }) => {
      if (hold && Math.hypot(e.point.x - hold.x, e.point.y - hold.y) > 5)
        letGo()
      const tap = this.tap
      if (tap && Math.hypot(e.point.x - tap.x, e.point.y - tap.y) > 8)
        tap.moved = true
    }
    this.map.on("mousedown", press)
    this.map.on("touchstart", press)
    this.map.on("mousemove", drift)
    this.map.on("touchmove", drift)
    for (const over of [
      "mouseup",
      "touchend",
      "touchcancel",
      "dragstart",
      "zoomstart",
    ])
      this.map.on(over, letGo)
    this.map.on(
      "click",
      (e: {
        point: { x: number; y: number }
        lngLat: { lng: number; lat: number }
      }) => {
        // (See `tap`: only a press that began on the map and stayed put.)
        const tap = this.tap
        this.tap = null
        if (!tap || tap.moved || tap.held) return
        if (performance.now() - this.heldAt < 600) return
        if (this.editing) {
          this.editTap([e.lngLat.lng, e.lngLat.lat])
          return
        }
        // A pin being dragged into place takes no taps.
        if (this.move) return
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
        // Driving the made-up position: a tap is where to go.
        if (this.dev?.mode === "drive") {
          this.dev.route = [[e.lngLat.lng, e.lngLat.lat]]
          this.dev.next = 0
          this.ripple([e.lngLat.lng, e.lngLat.lat], true)
          return
        }
        // Which pin was tapped, if one was. The tap has to land on the pin
        // itself: within its own radius of its middle, and a little more
        // for a finger than for a mouse. (It used to be anything whose box
        // came within 16px of the tap, which took in pins a good way off
        // and gave whichever was drawn last, not whichever was nearest.)
        // Of pins that overlap, the one drawn on top keeps the tap unless
        // one under it is clearly nearer.
        const reach = pinPixels() / 2 + (tap.touch ? 9 : 3)
        const hits = this.map.getLayer(PIN_LAYER)
          ? this.map.queryRenderedFeatures(
              [
                [e.point.x - reach, e.point.y - reach],
                [e.point.x + reach, e.point.y + reach],
              ],
              { layers: [PIN_LAYER] },
            )
          : []
        let id: string | undefined
        let nearest = Infinity
        const tried = new Set<string>()
        for (const hit of hits) {
          const hitId = hit.properties?.id as string | undefined
          const known = hitId ? this.pinsById.get(hitId) : undefined
          if (!hitId || !known || tried.has(hitId)) continue
          tried.add(hitId)
          const spot = this.map.project(known.at)
          const off = Math.hypot(spot.x - e.point.x, spot.y - e.point.y)
          if (off <= reach && off < nearest - 6) {
            nearest = off
            id = hitId
          }
        }
        // The picked pin is drawn by its marker, not the layer, so the layer
        // can't say it was tapped (it would give whichever pin is beside or
        // under it): measure to it instead. A tap on it lets go of it.
        const held = this.picked ? get(this.selectedPin) : null
        let onHeld = false
        if (held && this.picked?.id === held.id) {
          const spot = this.map.project(this.picked.marker.getLngLat())
          onHeld =
            Math.hypot(spot.x - e.point.x, spot.y - e.point.y) <=
            (pinPixels() * 1.3) / 2 + 6
        }
        let pin = onHeld
          ? (held ?? undefined)
          : id
            ? this.pinsById.get(id)
            : undefined
        // (A second quick tap on a pin lands while it is shrinking back:
        // it is that pin again, not the paddock it sits on.)
        const gone = this.letGoOf
        if (!pin && gone && performance.now() < gone.until) {
          const spot = this.map.project(gone.at)
          if (
            Math.hypot(spot.x - e.point.x, spot.y - e.point.y) <=
            (pinPixels() * 1.3) / 2 + 6
          )
            pin = this.pinsById.get(gone.id)
        }
        // A tap on something drawn picks the pin it belongs to.
        let drawingId: string | null = null
        if (!pin && this.map.getLayer(DRAWING_LAYERS[0])) {
          const drawn = this.map.queryRenderedFeatures([e.point.x, e.point.y], {
            layers: DRAWING_LAYERS,
          })[0]?.properties as { pin?: string; id?: string } | undefined
          if (drawn?.pin) {
            pin = this.pinsById.get(drawn.pin)
            drawingId = pin ? (drawn.id ?? null) : null
          }
        }
        const at: LngLat = [e.lngLat.lng, e.lngLat.lat]
        // A drawing on a pin: its pin's menu opens with the drawing picked.
        if (pin && drawingId && !this.grabbing) {
          if (get(this.selectedTrail)) this.pickTrail(null)
          this.selectedCrew.set(null)
          this.selectedPaddock.set(null)
          if (get(this.selectedPin)?.id !== pin.id) this.selectedPin.set(pin)
          this.pickDrawing(
            get(this.pickedDrawing)?.id === drawingId ? null : drawingId,
            false,
          )
          return
        }
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
        if (feature?.paddock) {
          const owner = this.paddocks.find((p) => p.id === feature.paddock)
          if (owner) {
            this.pickTrail(null)
            this.selectedPin.set(null)
            this.selectedCrew.set(null)
            this.selectedPaddock.set(owner)
            this.pickFeature(owner.id, feature.id ?? null, false)
            return
          }
        }
        this.pickFeature(null, null)
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
      // Letting go of a pin saves whatever was being tried on it.
      if (this.trying && this.trying.id !== pin?.id) this.commitPreview()
      // Letting go of a pin while moving it puts it back.
      if (this.move && pin?.id !== this.move.id) this.endMove(false)
      this.showPicked(pin)
      if (get(this.ready)) showDrawingsFor(this.map, pin?.id ?? null)
      const drawing = get(this.pickedDrawing)
      if (
        drawing &&
        !get(this.drawings).some(
          (d) => d.id === drawing.id && d.pinId === pin?.id,
        )
      )
        this.pickDrawing(null)
    })
    this.selectedCrew.subscribe((id) => {
      for (const [crewId, entry] of this.crewById)
        entry.vehicle?.view.$set({ selected: crewId === id })
      this.mine?.view.$set({ selected: id === ME })
      // (Each machine picked starts with its trail picked out.)
      this.crewTrailLit = true
      this.showCrewTrail()
    })
    this.selectedPaddock.subscribe((paddock) => {
      if (get(this.ready)) pickPaddock(this.map, paddock?.id ?? null)
      this.keepMarching()
      // Which trails went through it is known with it, so its menu opens
      // whole (their row used to arrive a moment later and push the menu
      // up). Only the trails anywhere near it are gone over: see `trailsIn`.
      this.paddockTrails.set(paddock ? this.trailsIn(paddock) : [])
      if (!paddock) this.pickFeature(null, null)
      const through = get(this.through)
      if (through && through !== paddock?.id) this.showThrough(null)
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
      // The one whose boundary is being changed is drawn by the editor.
      if (this.editing?.paddock.id === paddock.id) continue
      if (this.editing?.absorbed.includes(paddock.id)) continue
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
    this.powerSoon()
    // Everywhere that isn't a paddock: the world, with each paddock cut out
    // (the dark map eases it back).
    this.map.getSource(OUTSIDE_SOURCE)?.setData(
      collection(
        this.paddocks.length
          ? [
              {
                type: "Feature",
                properties: {},
                geometry: {
                  type: "Polygon",
                  coordinates: [
                    [
                      [-180, -85],
                      [180, -85],
                      [180, 85],
                      [-180, 85],
                      [-180, -85],
                    ],
                    ...this.paddocks.flatMap((paddock) =>
                      paddock.polygons.map((polygon) => polygon[0]),
                    ),
                  ],
                },
              },
            ]
          : [],
      ),
    )
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
      this.letGoOf = {
        id: old.id,
        at: old.marker.getLngLat(),
        until: performance.now() + 450,
      }
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

  /** A word that rises and fades where something just happened to a pin. */
  private flag(at: LngLat, text: string, gone = false) {
    const el = document.createElement("div")
    el.className = gone ? "mn-flag gone" : "mn-flag"
    el.innerHTML = "<i></i><b></b>"
    ;(el.lastChild as HTMLElement).textContent = text
    const marker = new mapboxgl.Marker({ element: el })
      .setLngLat(at)
      .addTo(this.map)
    marker.getElement().style.zIndex = "6"
    setTimeout(() => marker.remove(), 1500)
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
      ...(rest.grainColour !== undefined
        ? { grainColour: rest.grainColour }
        : {}),
      ...(rest.capacity !== undefined ? { capacity: rest.capacity } : {}),
      ...(rest.binButton !== undefined ? { binButton: rest.binButton } : {}),
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
      // A bin's level changing goes on the farm's grain record, as it does
      // from the current viewer.
      if (isGrainBinIcon(after.iconClass)) {
        const tonnes = (pin: LivePin) =>
          Math.round(
            (pin.capacity && pin.capacity > 0
              ? pin.capacity
              : grainBinDefaultCapacity(pin.iconClass)) * pin.fill,
          ) / 100
        if (tonnes(before) !== tonnes(after))
          logGrainEvent({
            action: "bin.level",
            binId: id,
            binName: after.note || grainBinName(after.iconClass),
            tonnesBefore: tonnes(before),
            tonnesAfter: tonnes(after),
            binFillBefore: before.fill,
            binFillAfter: after.fill,
          })
      }
      // Saved: a word floats up from the pin, as when one is placed.
      this.flag(after.at, rest.at ? "Moved" : "Updated")
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
    this.beginDrag(id, pin.at)
  }

  /** Make the lifted pin (a real one, or one being placed) draggable. */
  private beginDrag(id: string, from: LngLat) {
    const el = document.createElement("div")
    el.className = "mn-origin"
    const ring = new mapboxgl.Marker({ element: el })
      .setLngLat(from)
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
      origin: from,
      live: from,
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
    if (id !== DRAFT) this.movingPin.set(id)
  }

  // ── Placing a pin that doesn't exist yet ────────────────────────────────
  // A pin dropped with a drawing starts in the drawing's middle and is
  // dragged to where it should sit; what kind it is and its colour are
  // chosen while it is still loose. Nothing is saved until it is placed.

  startPlacing(iconClass: string, colour = "default") {
    const drawn = this.drawn()
    if (!drawn) return false
    this.endMove(false)
    this.selectedPin.set(null)
    const draft: LivePin = {
      id: DRAFT,
      at: middle(drawn.points),
      iconClass,
      note: "",
      noteVisible: true,
      colour,
      gateOpen: false,
      rockPicked: false,
      fill: 0,
      grainType: "",
      grainColour: "yellow",
      capacity: null,
      t: Date.now(),
      drawingsAlways: true,
      photos: [],
      by: null,
      binButton: true,
      changed: null,
    }
    this.draft = draft
    this.showPicked(draft)
    this.beginDrag(DRAFT, draft.at)
    this.placing.set({ iconClass, colour })
    this.map.getCanvas().style.cursor = ""
    // Bring the pin up into the open part of the map, clear of the card
    // that asks where it goes.
    this.setFollow("free")
    this.map.easeTo({
      center: draft.at,
      offset: [
        this.insets.left / 2,
        -Math.round(this.map.getCanvas().clientHeight * 0.24),
      ],
      duration: 600,
    })
    return true
  }

  /** Change what the pin being placed will be. */
  setPlacing(look: { iconClass?: string; colour?: string }) {
    if (!this.draft) return
    this.draft = {
      ...this.draft,
      ...look,
      at: this.move?.live ?? this.draft.at,
    }
    // (showPicked leaves a pin mid-drag where it has been dragged to.)
    this.showPicked(this.draft)
    this.placing.set({
      iconClass: this.draft.iconClass,
      colour: this.draft.colour,
    })
  }

  private endPlacing() {
    const at = this.move?.live ?? this.draft?.at ?? null
    this.endMove(true)
    this.draft = null
    this.showPicked(null)
    this.placing.set(null)
    return at
  }

  /** Give up placing the pin; what was drawn is still there to keep. */
  cancelPlacing() {
    if (!this.draft) return
    this.endPlacing()
    if (get(this.measure)) this.map.getCanvas().style.cursor = "crosshair"
  }

  /** Put the pin down where it has been dragged to, with the drawing on it. */
  confirmPlacing(note: string, drawColour: string) {
    const draft = this.draft
    const drawn = this.drawn()
    if (!draft || !drawn) return Promise.resolve(false)
    const at = this.endPlacing() ?? draft.at
    return this.keep(async () => {
      const pin = await createPin(this.mapId, this.userId, draft.iconClass, at)
      this.pinsById.set(pin.id, pin)
      this.drawPins()
      this.ripple(at)
      if (draft.colour !== "default" || note.trim())
        await this.updatePin(pin.id, {
          ...(draft.colour !== "default" ? { colour: draft.colour } : {}),
          ...(note.trim() ? { note } : {}),
        })
      await createDrawing({
        mapId: this.mapId,
        userId: this.userId,
        pinId: pin.id,
        kind: drawn.state.kind,
        points: drawn.points,
        colour: drawColour,
      })
      await this.refreshDrawings()
      const made = this.pinsById.get(pin.id)
      if (made) this.selectedPin.set(made)
    }, "that didn't save. Try again.")
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
    // A card the page has up that isn't for anything picked (a bin's, from
    // its button): a tap on open ground puts it away, and does no more.
    if (!pin && this.onAway?.()) return
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

  // ── A drawing picked out ────────────────────────────────────────────────
  // From a menu's list or by a tap on the map: it gets a white halo, and the
  // map moves only as far as it must to have it in view.

  private haloShape(
    shape: {
      kind: "polygon" | "line"
      points: LngLat[]
      colour: string
    } | null,
  ) {
    if (!get(this.ready)) return
    this.map.getSource(PICKED_SHAPE_SOURCE)?.setData(
      collection(
        shape
          ? [
              {
                type: "Feature",
                properties: { color: shape.colour },
                geometry:
                  shape.kind === "line"
                    ? { type: "LineString", coordinates: shape.points }
                    : {
                        type: "Polygon",
                        coordinates: [[...shape.points, shape.points[0]]],
                      },
              },
            ]
          : [],
      ),
    )
  }

  /** Move the map so a box is in view above the menus, if it isn't. */
  private bringIntoView(bbox: [number, number, number, number]) {
    const container = this.map.getContainer() as HTMLElement
    const wide = container.clientWidth
    const tall = container.clientHeight
    const a = this.map.project([bbox[0], bbox[3]])
    const b = this.map.project([bbox[2], bbox[1]])
    // A menu card sits over the bottom of the map: what it covers is no use
    // for showing anything. (A pin's menu opens under its drawing instead.)
    const card = container.parentElement?.querySelector(".mn-card")
    const covered = card
      ? container.getBoundingClientRect().bottom -
        card.getBoundingClientRect().top
      : tall * 0.45
    const room = {
      top: 80,
      right: 50,
      bottom: Math.round(
        Math.min(tall * 0.74, Math.max(covered + 24, 60 + this.insets.bottom)),
      ),
      left: 50 + this.insets.left,
    }
    const inView =
      a.x >= room.left - 20 &&
      b.x <= wide - room.right + 20 &&
      a.y >= room.top - 20 &&
      b.y <= tall - room.bottom + 20 &&
      // And not a speck: big enough on screen to make out.
      Math.max(b.x - a.x, b.y - a.y) > 40
    if (inView) return
    this.setFollow("free")
    this.map.fitBounds(
      [
        [bbox[0], bbox[1]],
        [bbox[2], bbox[3]],
      ],
      { padding: room, maxZoom: 17.5, duration: 700 },
    )
  }

  /** Pick out something kept on a paddock (or let it go). */
  pickFeature(paddockId: string | null, featureId: string | null, look = true) {
    const paddock = this.paddocks.find((p) => p.id === paddockId)
    const feature = paddock?.features.find((f) => f.id === featureId)
    this.pickedFeature.set(feature?.id ?? null)
    if (feature) this.pickedDrawing.set(null)
    if (feature || !get(this.pickedDrawing))
      this.haloShape(
        feature
          ? {
              kind: feature.kind,
              points: feature.coordinates,
              colour: feature.colour,
            }
          : null,
      )
    if (feature && look) this.bringIntoView(bboxOf([[feature.coordinates]]))
  }

  /** Pick out a drawing on the picked pin (or let it go). */
  pickDrawing(id: string | null, look = true) {
    const drawing = id ? get(this.drawings).find((d) => d.id === id) : null
    if (!drawing) {
      if (get(this.pickedDrawing)) {
        this.pickedDrawing.set(null)
        this.haloShape(null)
      }
      return
    }
    const points = (
      drawing.kind === "line"
        ? drawing.geometry.coordinates
        : (drawing.geometry.coordinates as LngLat[][])[0].slice(0, -1)
    ) as LngLat[]
    const bbox = bboxOf([[points]])
    this.pickedFeature.set(null)
    this.pickedDrawing.set({ id: drawing.id, bbox })
    this.haloShape({ kind: drawing.kind, points, colour: drawing.colour })
    if (look) this.bringIntoView(bbox)
  }

  /** Where a pin is right now: where it is being dragged to, mid-move. */
  pinPlace(id: string): LngLat | null {
    if (this.move?.id === id) return this.move.live
    return this.pinsById.get(id)?.at ?? null
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
      ...(change.variety !== undefined ? { variety: change.variety } : {}),
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
    this.marching =
      !!get(this.selectedPaddock) ||
      !!get(this.selectedTrail) ||
      !!get(this.crewTrail)
  }

  /**
   * Picking a machine that is laying a trail picks that trail out too (as a
   * finished trail is when it is picked) and gives its figures: how long it
   * has been going, how far, how many hectares.
   */
  private showCrewTrail() {
    const id = get(this.selectedCrew)
    if (get(this.selectedTrail)) {
      if (!id) return
      this.pickTrail(null)
    }
    let coords: LngLat[] = []
    let info: TrailInfo | null = null
    if (id === ME) {
      info = get(this.recorder.state).trail
      coords = info ? this.recorder.points.map((p) => p.at) : []
      if (this.mine && coords.length) coords.push(this.mine.pos)
    } else if (id) {
      const live = [...this.liveTrails.values()].find(
        (trail) => trail.info.vehicleId === id,
      )
      info = live?.info ?? null
      coords = live?.points.map((p) => p.at) ?? []
    }
    const drawn = info
      ? `${info.id}|${coords.length}|${this.crewTrailLit ? 1 : 0}`
      : ""
    if (drawn === this.crewTrailDrawn) return
    this.crewTrailDrawn = drawn
    if (!get(this.ready)) return
    const laying = !!info && coords.length > 1
    const showing = laying && this.crewTrailLit
    this.map
      .getSource(PICKED_TRAIL_SOURCE)
      ?.setData(
        collection(
          showing && info
            ? [line(coords, trailColour(info.colour), info.width)]
            : [],
        ),
      )
    this.pickedArrows(showing ? [coords] : [], info?.colour)
    if (laying && info) {
      const metres = lengthM(coords)
      this.crewTrail.set({
        since: info.start,
        metres,
        ha: (metres * info.width) / 10000,
        colour: trailColour(info.colour),
        lit: this.crewTrailLit,
      })
    } else this.crewTrail.set(null)
    this.keepMarching()
  }

  /**
   * Take the highlight off the trail the picked machine is laying (its
   * figures stay on the card), or put it back.
   */
  lightCrewTrail(on: boolean) {
    this.crewTrailLit = on
    this.showCrewTrail()
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
      this.flag(pin.at, "Placed")
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
    this.flag(pin.at, "Deleted", true)
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
      this.flag(pin.at, "Put back")
    } catch {
      this.problem.set("That pin couldn't be put back.")
    }
  }

  /**
   * Try a kind and a colour on the picked pin without saving them: stepping
   * through the choices then makes one change (and one line in the farm's
   * log) when the choosing is over, not one for every tap on the way.
   */
  previewPin(id: string, look: { iconClass: string; colour: string }) {
    const pin = this.pinsById.get(id)
    if (!pin || this.picked?.id !== id) return
    this.trying = { id, ...look }
    this.picked.view.$set({
      image: pinImageKey(this.pinLook({ ...pin, ...look })),
    })
  }

  /** Save what was being tried on (if it differs from what the pin is). */
  commitPreview() {
    const trying = this.trying
    this.trying = null
    const pin = trying ? this.pinsById.get(trying.id) : null
    if (!trying || !pin) return
    if (pin.iconClass === trying.iconClass && pin.colour === trying.colour)
      return
    this.updatePin(trying.id, {
      iconClass: trying.iconClass,
      colour: trying.colour,
    })
  }

  /** Put back what a row of the farm's log did to a pin. */
  async undoLogged(
    what:
      | { kind: "restore"; id: string }
      | { kind: "remove"; id: string }
      | { kind: "edit"; id: string; iconClass: string; colour: string }
      | { kind: "move"; id: string; at: LngLat },
  ) {
    if (what.kind === "restore") {
      try {
        await restorePin(what.id)
        const back = (await loadPins(this.mapId)).find((p) => p.id === what.id)
        if (back) {
          this.pinsById.set(back.id, back)
          this.drawPins()
        }
        return true
      } catch {
        this.problem.set("That pin couldn't be put back.")
        return false
      }
    }
    if (!this.pinsById.has(what.id)) {
      this.problem.set("That pin isn't on the map any more.")
      return false
    }
    if (what.kind === "remove") return !!(await this.removePin(what.id))
    if (what.kind === "edit")
      return this.updatePin(what.id, {
        iconClass: what.iconClass,
        colour: what.colour,
      })
    return this.updatePin(what.id, { at: what.at })
  }

  pinName = (pin: LivePin) => pin.note || pinLabel(pin.iconClass)

  // ── Crew ────────────────────────────────────────────────────────────────

  private tagFor(entry: CrewEntry) {
    if (this.shown.vehicleLabels === false) return ""
    const tags = shortTags(
      [...this.crewById.values()].map((other) => other.profile.name),
    )
    const name =
      (tags.get(entry.profile.name) ?? firstName(entry.profile.name)) +
      (entry.profile.guest ? " (guest)" : "")
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
          // A little longer than the gap between reports: the machine is
          // still gliding when the next one lands, instead of stopping at
          // each and starting again.
          dur: clamp((state.t - previous.t) * 1.25, 450, 3200),
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
      let action: string
      // (Where they are is only said while it is fresh.)
      let place: string | null = null
      if (!state?.at)
        action = entry.online
          ? "On the map, no position yet"
          : "Not on the map yet"
      else if (moving) {
        action = state.trailing && spec.paints ? spec.verb : "On the move"
        place = where?.name ?? null
      } else if (age < 10 * 60_000) {
        action = "Stopped"
        place = where?.name ?? null
      } else action = `Seen ${formatAgo(state.t, now)}`
      const doing = action + (place ? ` · ${place}` : "")
      rows.push({
        id,
        name: entry.profile.name,
        driver: entry.profile.guest ? null : entry.profile.driver,
        guest: entry.profile.guest,
        type: spec.type,
        machineLabel: spec.label,
        colour: drawColour(marker?.bodyColor),
        doing,
        action,
        where: place,
        speed: moving ? Math.round(state!.speed * 10) / 10 : 0,
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
    const action = moving
      ? trailing && spec.paints
        ? spec.verb
        : "On the move"
      : "Stopped"
    this.self.set({
      id: ME,
      name: "You",
      // (The page knows who the viewer is driving as, and says it.)
      driver: null,
      guest: false,
      type: spec.type,
      machineLabel: spec.label,
      colour: drawColour(this.me.bodyColor),
      doing: action + (where ? ` · ${where.name}` : ""),
      action,
      where: where?.name ?? null,
      speed: moving ? Math.round(this.speedKmh * 10) / 10 : 0,
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
    this.trailFixes.clear()
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
      color: trailColour(info.colour, info.id),
      // (The colour as saved, so it can be drawn in another palette.)
      raw: info.colour,
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
    // Fixed on this device on an earlier visit: fix it again.
    if (this.fixWanted.has(info.id)) void this.hideStrays(info)
  }

  // ── A trail's GPS, looked over ──────────────────────────────────────────
  // (See trailCheck.) The fix is on this device only: the trail as saved is
  // not touched, so its figures and everyone else's map stay as they were.

  /** The trails to fix as they arrive (from an earlier visit). */
  setTrailFixes(ids: string[]) {
    this.fixWanted = new Set(ids)
  }

  private async checked(info: TrailInfo): Promise<TrailCheck | null> {
    if (this.trailChecks.has(info.id))
      return this.trailChecks.get(info.id) ?? null
    const parts = await loadTrailDetail(info.id).catch(() => null)
    const check = parts ? checkTrail(parts) : null
    if (this.trailChecks.size > 30) this.trailChecks.clear()
    this.trailChecks.set(info.id, check)
    return check
  }

  private async lookOver(info: TrailInfo) {
    this.trailSuspect.set(null)
    const check = await this.checked(info)
    if (get(this.selectedTrail)?.id !== info.id) return
    this.trailSuspect.set(check ? this.suspectOf(info.id, check) : null)
  }

  private suspectOf(id: string, check: TrailCheck): TrailSuspect {
    return {
      strays: check.strays,
      jumps: check.jumps,
      jumpM: check.jumpM,
      totalM: check.totalM,
      keptM: check.keptM,
      worst: check.worst,
      trailId: id,
      fixed: this.trailFixes.has(id),
    }
  }

  /** Hide the picked trail's strays on this device, or show them again. */
  async fixTrail(on: boolean) {
    const info = get(this.selectedTrail)
    if (!info) return false
    return on ? this.hideStrays(info) : this.showStrays(info.id)
  }

  private async hideStrays(info: TrailInfo) {
    if (this.trailFixes.has(info.id)) return true
    const check = await this.checked(info)
    if (!check || !this.historyIds.has(info.id)) return false
    const own = this.trailFeatures(info.id)
    const lines = check.kept.filter((line) => line.length > 1)
    if (!own.length || !lines.length || this.trailFixes.has(info.id))
      return false
    this.trailFixes.set(info.id, own)
    const gone = new Set<unknown>(own)
    this.history = this.history.filter((f) => !gone.has(f))
    this.history.push({
      type: "Feature",
      properties: (own[0] as { properties?: unknown }).properties,
      geometry: { type: "MultiLineString", coordinates: lines },
    })
    this.historyDirty = true
    this.fixWanted.add(info.id)
    this.onTrailFixes?.([...this.fixWanted])
    this.redrawPicked(info.id)
    return true
  }

  private showStrays(id: string) {
    const original = this.trailFixes.get(id)
    if (!original) return false
    const gone = new Set<unknown>(this.trailFeatures(id))
    this.history = [...this.history.filter((f) => !gone.has(f)), ...original]
    this.trailFixes.delete(id)
    this.historyDirty = true
    this.fixWanted.delete(id)
    this.onTrailFixes?.([...this.fixWanted])
    this.redrawPicked(id)
    return true
  }

  /** The picked trail's shape changed under it: draw its highlight again. */
  private redrawPicked(id: string) {
    this.trailSuspect.update((suspect) =>
      suspect?.trailId === id
        ? { ...suspect, fixed: this.trailFixes.has(id) }
        : suspect,
    )
    const picked = get(this.selectedTrail)
    if (picked?.id !== id || !get(this.ready)) return
    const features = this.trailFeatures(id)
    this.map.getSource(PICKED_TRAIL_SOURCE)?.setData(collection(features))
    this.pickedArrows(features.flatMap(partsOf), picked.colour)
  }

  /** Draw trails in another palette (see `trailColour`). */
  setTrailPalette(palette: TrailPalette) {
    setTrailPalette(palette)
    for (const feature of this.history) {
      const properties = (feature as { properties: Record<string, unknown> })
        .properties
      if (typeof properties.raw === "string")
        properties.color = trailColour(properties.raw, String(properties.id))
    }
    this.historyDirty = true
    this.liveDirty = true
    const picked = get(this.selectedTrail)
    if (picked) this.redrawPicked(picked.id)
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
    if (!picked && (get(this.through) || this.setRun))
      showThrough(this.map, this.throughIds, this.base)
    else
      paintPickedTrail(
        this.map,
        picked?.id ?? null,
        this.base,
        !!this.replaying,
      )
  }

  // ── The camera on a replay ─────────────────────────────────────────────
  // Starting a replay brings the trail into the middle of the map. One that
  // covers so much ground that its machine would be a speck is watched from
  // closer in, the map sliding along only as the machine nears the edge of
  // what shows. Several trails together are framed round whoever is working
  // at that moment (and where they are about to go). Dragging the map lets
  // go of all of it; zooming doesn't.
  private watch: {
    /** It all fits and the map stays put; slide with one machine; or frame
     *  the machines that are working. */
    mode: "whole" | "ride" | "fleet"
    /** The ground being held in frame (fleet): west, south, east, north. */
    held: [number, number, number, number] | null
    /** Nothing moves before this: an ease is still running. */
    quiet: number
    /** Since when the machines have sat in a small part of the frame. */
    snug: number
  } | null = null

  /** The edges of the map that menus cover, with a trail's card up. */
  private watchPadding() {
    const canvas = this.map.getCanvas()
    const tall = canvas.clientHeight
    const bottom = Math.min(200 + this.insets.bottom, tall * 0.55)
    return { top: 100, right: 60, bottom, left: 60 + this.insets.left }
  }

  private canWatch(now: number) {
    return (
      !!this.watch &&
      now > this.watch.quiet &&
      now > this.followPausedUntil &&
      !this.touching &&
      !this.mouseHeld
    )
  }

  /** Begin watching one trail's replay. */
  private watchReplay(running: Replay) {
    let w = Infinity
    let s = Infinity
    let e = -Infinity
    let n = -Infinity
    for (const point of running.points) {
      w = Math.min(w, point.at[0])
      e = Math.max(e, point.at[0])
      s = Math.min(s, point.at[1])
      n = Math.max(n, point.at[1])
    }
    if (!Number.isFinite(w)) return
    this.setFollow("free")
    const padding = this.watchPadding()
    const fit = this.map.cameraForBounds(
      [
        [w, s],
        [e, n],
      ],
      { padding, maxZoom: 16.5 },
    )
    if (!fit) return
    const quiet = performance.now() + 950
    // Close enough in to see the machine working: the whole trail is put
    // in the middle and left there.
    const CLOSE = 13.4
    if (fit.zoom >= CLOSE) {
      this.watch = { mode: "whole", held: null, quiet, snug: 0 }
      this.map.easeTo({
        center: fit.center,
        zoom: fit.zoom,
        bearing: 0,
        duration: 800,
      })
      return
    }
    // Too much ground for that: start where the trail starts, closer in,
    // and go along with the machine.
    this.watch = { mode: "ride", held: null, quiet, snug: 0 }
    this.map.easeTo({
      center: running.points[0].at,
      zoom: CLOSE + 0.5,
      bearing: 0,
      offset: [
        (padding.left - padding.right) / 2,
        (padding.top - padding.bottom) / 2,
      ],
      duration: 800,
    })
  }

  /**
   * Going along with one machine: it has the middle of the open map to
   * work in without anything moving, and the map slides only as it nears
   * the edge of that.
   */
  private rideWatch(at: LngLat, dt: number, now: number) {
    if (this.watch?.mode !== "ride" || !this.canWatch(now)) return
    const canvas = this.map.getCanvas()
    const wide = canvas.clientWidth
    const tall = canvas.clientHeight
    const pad = this.watchPadding()
    const roomX = Math.max(40, wide - pad.left - pad.right)
    const roomY = Math.max(40, tall - pad.top - pad.bottom)
    const x0 = pad.left + roomX * 0.2
    const x1 = pad.left + roomX * 0.8
    const y0 = pad.top + roomY * 0.2
    const y1 = pad.top + roomY * 0.8
    const p = this.map.project(at)
    const dx = p.x < x0 ? p.x - x0 : p.x > x1 ? p.x - x1 : 0
    const dy = p.y < y0 ? p.y - y0 : p.y > y1 ? p.y - y1 : 0
    // (Out past the open part of the map altogether, as after a jump along
    // the bar, it is fetched back smartly.)
    const lost =
      p.x < pad.left ||
      p.x > wide - pad.right ||
      p.y < pad.top ||
      p.y > tall - pad.bottom
    const k = 1 - Math.exp(-dt * (lost ? 9 : 3.2))
    // (Under a third of a pixel isn't worth drawing the map again for.)
    if (Math.abs(dx * k) < 0.3 && Math.abs(dy * k) < 0.3) return
    this.map.jumpTo({
      center: this.map.unproject([wide / 2 + dx * k, tall / 2 + dy * k]),
    })
  }

  /**
   * Several machines: hold in frame the ground those working now are on
   * and are about to cover. The frame is left alone while they are inside
   * it, and drawn again (in one glide) when one of them is about to leave,
   * or when they have all drawn into a small part of it.
   */
  private frameFleet(
    run: SetRun,
    active: SetTrack[],
    rate: number,
    now: number,
  ) {
    const watch = this.watch
    if (watch?.mode !== "fleet" || !this.canWatch(now)) return
    let working = active.filter((track) => track.vehicle)
    if (!working.length) return
    // Most of them, not all at any price: one machine a long way from the
    // rest is left out, or the frame would be mostly empty ground.
    if (working.length >= 3) {
      const spots = working.map((track) => track.vehicle!.pos)
      const mid = (values: number[]) =>
        [...values].sort((a, b) => a - b)[values.length >> 1]
      const centre: LngLat = [
        mid(spots.map((spot) => spot[0])),
        mid(spots.map((spot) => spot[1])),
      ]
      const far = spots
        .map((spot, i) => ({ i, d: distanceM(spot, centre) }))
        .sort((a, b) => b.d - a.d)
      if (far[0].d > Math.max(1500, far[1].d * 4))
        working = working.filter((_, i) => i !== far[0].i)
    }
    // Where each is now, where it has just been, and where the next few
    // seconds of the replay will take it.
    const perSecond = (run.total / run.seconds) * rate
    const back = run.cursor - perSecond * 2
    const ahead = run.cursor + perSecond * 7
    let w = Infinity
    let s = Infinity
    let e = -Infinity
    let n = -Infinity
    const take = (at: LngLat) => {
      w = Math.min(w, at[0])
      e = Math.max(e, at[0])
      s = Math.min(s, at[1])
      n = Math.max(n, at[1])
    }
    for (const track of working) {
      take(track.vehicle!.pos)
      const points = track.points
      let from = track.index
      while (from > 0 && points[from].axis > back) from--
      let to = track.index
      while (to < points.length - 1 && points[to].axis < ahead) to++
      const stride = Math.max(1, Math.floor((to - from) / 50))
      for (let i = from; i <= to; i += stride) take(points[i].at)
      take(points[to].at)
    }
    if (!Number.isFinite(w)) return
    const held = watch.held
    if (held) {
      const marginX = (held[2] - held[0]) * 0.05
      const marginY = (held[3] - held[1]) * 0.05
      const inside =
        w >= held[0] + marginX &&
        e <= held[2] - marginX &&
        s >= held[1] + marginY &&
        n <= held[3] - marginY
      if (inside) {
        const across = distanceM([held[0], held[1]], [held[2], held[1]])
        const small =
          across > 900 &&
          e - w < (held[2] - held[0]) * 0.3 &&
          n - s < (held[3] - held[1]) * 0.3
        if (!small) {
          watch.snug = 0
          return
        }
        if (!watch.snug) watch.snug = now
        if (now - watch.snug < 2500) return
      }
    }
    // Room round them: a third of their spread, and never less than 150 m.
    const lat = (s + n) / 2
    const perLng = 111_320 * Math.cos((lat * Math.PI) / 180)
    const roomX = Math.max(150, (e - w) * perLng * 0.35) / perLng
    const roomY = Math.max(150, (n - s) * 110_540 * 0.35) / 110_540
    watch.held = [w - roomX, s - roomY, e + roomX, n + roomY]
    watch.snug = 0
    const fit = this.map.cameraForBounds(
      [
        [watch.held[0], watch.held[1]],
        [watch.held[2], watch.held[3]],
      ],
      { padding: this.watchPadding(), maxZoom: 15.6 },
    )
    if (!fit) return
    watch.quiet = now + 1300
    this.map.easeTo({ center: fit.center, zoom: fit.zoom, duration: 1200 })
  }

  // ── Several trails replayed together ───────────────────────────────────
  // One clock runs through all of them in the order they happened. Two
  // machines that were working at the same time are on the map at the same
  // time; the hours when nobody was working are cut down to a moment.

  /** Play (or carry on, or start again at the end). */
  async playSet(trails: TrailInfo[], rate = 4) {
    const going = this.setRun
    if (going) {
      if (going.cursor >= going.total) {
        going.cursor = 0
        // From the top again: the camera takes them up again too.
        this.setFollow("free")
        this.watch = { mode: "fleet", held: null, quiet: 0, snug: 0 }
      }
      this.setReplay.update((s) => (s ? { ...s, phase: "playing" } : s))
      return
    }
    if (get(this.setReplay)) return
    if (get(this.selectedTrail)) this.pickTrail(null)
    const wanted = [...trails].sort((a, b) => a.start - b.start)
    this.setReplay.set({
      phase: "loading",
      progress: 0,
      time: wanted[0]?.start ?? Date.now(),
      rate,
      loaded: 0,
      total: wanted.length,
      active: [],
    })
    const tracks: SetTrack[] = []
    for (let i = 0; i < wanted.length; i += 4) {
      const batch = wanted.slice(i, i + 4)
      const loaded = await Promise.all(
        batch.map((info) => loadTrailTimeline(info).catch(() => null)),
      )
      // Stopped while it was loading.
      if (!get(this.setReplay)) return
      loaded.forEach((timeline, k) => {
        const info = batch[k]
        if (!timeline?.parts.length) return
        const points: SetTrack["points"] = []
        if (timeline.timed)
          timeline.parts.forEach((part, index) =>
            part.forEach((point) =>
              points.push({ at: point.at, t: point.t, axis: 0, part: index }),
            ),
          )
        else {
          // No times kept: an even pace from its start to its finish.
          const lengths = timeline.parts.map((part) =>
            part.reduce(
              (sum, point, j) =>
                j ? sum + distanceM(part[j - 1].at, point.at) : sum,
              0,
            ),
          )
          const whole = lengths.reduce((sum, length) => sum + length, 0) || 1
          const took = Math.max(60_000, (info.end ?? info.start) - info.start)
          let before = 0
          timeline.parts.forEach((part, index) => {
            let along = 0
            part.forEach((point, j) => {
              if (j) along += distanceM(part[j - 1].at, point.at)
              points.push({
                at: point.at,
                t: info.start + ((before + along) / whole) * took,
                axis: 0,
                part: index,
              })
            })
            before += lengths[index]
          })
        }
        if (points.length > 1)
          tracks.push({
            info,
            colour: trailColour(info.colour, info.id),
            points,
            from: 0,
            to: 0,
            index: 0,
            vehicle: null,
          })
      })
      this.setReplay.update((s) =>
        s ? { ...s, loaded: Math.min(wanted.length, i + 4) } : s,
      )
    }
    if (!tracks.length) {
      this.setReplay.set(null)
      this.problem.set("None of these trails has a recorded path to replay.")
      return
    }
    // The shared clock: real time, with any stretch where nobody moved for
    // more than a few seconds cut down to those few seconds.
    const CUT = 6000
    const times = new Float64Array(
      tracks.reduce((sum, track) => sum + track.points.length, 0),
    )
    let n = 0
    for (const track of tracks)
      for (const point of track.points) times[n++] = point.t
    times.sort()
    const breaks: SetRun["breaks"] = [{ real: times[0], axis: 0 }]
    let axis = 0
    for (let i = 1; i < times.length; i++) {
      const gap = times[i] - times[i - 1]
      axis += Math.min(gap, CUT)
      if (gap > CUT) breaks.push({ real: times[i], axis })
    }
    const onClock = (t: number) => {
      let lo = 0
      let hi = breaks.length - 1
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1
        if (breaks[mid].real <= t) lo = mid
        else hi = mid - 1
      }
      return breaks[lo].axis + (t - breaks[lo].real)
    }
    for (const track of tracks) {
      for (const point of track.points) point.axis = onClock(point.t)
      track.from = track.points[0].axis
      track.to = track.points[track.points.length - 1].axis
    }
    this.setRun = {
      tracks,
      breaks,
      total: Math.max(1, axis),
      cursor: 0,
      // An hour's work goes by in a quarter of a minute at 1×.
      seconds: clamp(axis / 1000 / 240, 12, 150),
      drawn: -1,
      told: 0,
      done: "?",
    }
    this.throughIds = tracks.map((track) => track.info.id)
    this.map.getSource(THROUGH_SOURCE)?.setData(collection([]))
    this.paintPicked()
    // The camera keeps whoever is working in frame, until the map is dragged.
    this.setFollow("free")
    this.watch = { mode: "fleet", held: null, quiet: 0, snug: 0 }
    this.setReplay.update((s) => (s ? { ...s, phase: "playing" } : s))
  }

  pauseSet() {
    this.setReplay.update((s) =>
      s?.phase === "playing" ? { ...s, phase: "paused" } : s,
    )
  }

  /** Jump to a point in it (0 to 1), and hold there. */
  seekSet(progress: number) {
    const run = this.setRun
    if (!run) return
    run.cursor = clamp(progress, 0, 1) * run.total
    this.setReplay.update((s) =>
      s ? { ...s, phase: s.phase === "playing" ? "playing" : "paused" } : s,
    )
  }

  setSetRate(rate: number) {
    this.setReplay.update((s) => (s ? { ...s, rate } : s))
  }

  /** End it and put the trails back as they were. */
  stopSet() {
    const run = this.setRun
    this.setRun = null
    if (!get(this.setReplay) && !run) return
    if (this.watch?.mode === "fleet") this.watch = null
    this.setReplay.set(null)
    for (const track of run?.tracks ?? []) {
      track.vehicle?.view.$destroy()
      track.vehicle?.marker.remove()
    }
    this.map.getSource(REPLAY_SOURCE)?.setData(collection([]))
    // A paddock's trails go back to all showing; otherwise the job's do.
    const paddock = get(this.through)
    if (paddock) {
      this.through.set(null)
      this.showThrough(paddock)
    } else {
      this.throughIds = []
      this.map.getSource(THROUGH_SOURCE)?.setData(collection([]))
      this.paintPicked()
    }
  }

  private stepSet(dt: number, now: number) {
    const run = this.setRun
    const state = get(this.setReplay)
    if (!run || !state) return
    if (state.phase === "playing")
      run.cursor = Math.min(
        run.total,
        run.cursor + dt * (run.total / run.seconds) * state.rate,
      )
    const bearing = this.map.getBearing()
    const active: SetTrack[] = []
    for (const track of run.tracks) {
      const working = run.cursor >= track.from && run.cursor < track.to
      if (!working) {
        if (track.vehicle) {
          track.vehicle.view.$destroy()
          track.vehicle.marker.remove()
          track.vehicle = null
        }
        track.index = run.cursor < track.from ? 0 : track.points.length - 1
        continue
      }
      active.push(track)
      const points = track.points
      const last = points.length - 1
      while (
        track.index < last - 1 &&
        points[track.index + 1].axis <= run.cursor
      )
        track.index++
      while (track.index > 0 && points[track.index].axis > run.cursor)
        track.index--
      const a = points[track.index]
      const b = points[Math.min(track.index + 1, last)]
      let at = a.at
      if (b.part === a.part && b.axis > a.axis) {
        const f = clamp((run.cursor - a.axis) / (b.axis - a.axis), 0, 1)
        at = [lerp(a.at[0], b.at[0], f), lerp(a.at[1], b.at[1], f)]
      }
      if (!track.vehicle) {
        track.vehicle = this.mountVehicle(
          machineFor(track.info.machine).type,
          track.colour,
          firstName(track.info.operator ?? "") || "Trail",
          at,
          false,
        )
        track.vehicle.marker.getElement().style.zIndex = "5"
        this.onZoom()
      }
      const vehicle = track.vehicle
      vehicle.pos = at
      vehicle.marker.setLngLat(at)
      // It points the way the path runs over the next few points.
      const ahead = points[Math.min(last, track.index + 3)]
      if (ahead.part === a.part && distanceM(a.at, ahead.at) > 2)
        vehicle.heading = bearingDeg(a.at, ahead.at)
      vehicle.eased = Number.isNaN(vehicle.eased)
        ? vehicle.heading
        : easeHeading(vehicle.eased, vehicle.heading, 1 - Math.exp(-dt * 12))
      this.turnTo(vehicle, vehicle.eased - bearing)
    }

    if (now - run.told < 90) return
    run.told = now
    if (state.phase === "playing") this.frameFleet(run, active, state.rate, now)
    if (run.cursor !== run.drawn) {
      run.drawn = run.cursor
      // What is finished is drawn once; only what is being laid is redrawn.
      const lineOf = (track: SetTrack, upTo: number, tip: LngLat | null) => {
        const features: unknown[] = []
        let coords: LngLat[] = []
        let part = track.points[0].part
        for (let i = 0; i <= upTo; i++) {
          const point = track.points[i]
          if (point.part !== part) {
            if (coords.length > 1)
              features.push(line(coords, track.colour, track.info.width))
            coords = []
            part = point.part
          }
          coords.push(point.at)
        }
        if (tip) coords.push(tip)
        if (coords.length > 1)
          features.push(line(coords, track.colour, track.info.width))
        return features
      }
      const finished = run.tracks.filter((track) => run.cursor >= track.to)
      const key = finished.map((track) => track.info.id).join()
      if (key !== run.done) {
        run.done = key
        this.map.getSource(THROUGH_SOURCE)?.setData(
          collection(
            finished.flatMap((track) =>
              lineOf(track, track.points.length - 1, null).map((feature) => ({
                ...(feature as object),
                properties: {
                  ...(feature as { properties: object }).properties,
                  part: "in",
                },
              })),
            ),
          ),
        )
      }
      this.map
        .getSource(REPLAY_SOURCE)
        ?.setData(
          collection(
            active.flatMap((track) =>
              lineOf(track, track.index, track.vehicle?.pos ?? null),
            ),
          ),
        )
    }
    // The time of day the clock has reached.
    let at = run.breaks[0]
    for (const mark of run.breaks) {
      if (mark.axis > run.cursor) break
      at = mark
    }
    const done = run.cursor >= run.total
    this.setReplay.update((s) =>
      s
        ? {
            ...s,
            progress: run.cursor / run.total,
            time: at.real + (run.cursor - at.axis),
            active: active.map(
              (track) => firstName(track.info.operator ?? "") || "Someone",
            ),
            phase: done && s.phase === "playing" ? "done" : s.phase,
          }
        : s,
    )
  }

  /**
   * What a set of trails adds up to over all the ground they covered (a
   * whole job's, with no paddock to keep to): the same figures a paddock's
   * trails get, measured more coarsely over the larger area.
   */
  statsFor(trails: TrailInfo[]): ThroughStats | null {
    const ids = new Map(trails.map((trail, i) => [trail.id, i + 1]))
    const runs: { points: LngLat[]; width: number; who: number }[] = []
    let w = Infinity
    let s = Infinity
    let east = -Infinity
    let n = -Infinity
    for (const feature of this.history) {
      const properties = (
        feature as {
          properties: { id: string; segment?: string; width?: number }
        }
      ).properties
      const who = ids.get(properties.id)
      if (!who || properties.segment === "pause") continue
      for (const part of partsOf(feature)) {
        runs.push({ points: part, width: Number(properties.width) || 0, who })
        for (const [lng, lat] of part) {
          if (lng < w) w = lng
          if (lng > east) east = lng
          if (lat < s) s = lat
          if (lat > n) n = lat
        }
      }
    }
    if (!runs.length) return null
    const flat = projector([w, s])
    const far = flat.toXY([east, n])
    const cell = clamp(Math.sqrt((far[0] * far[1]) / 250000), 3, 20)
    const cols = Math.max(1, Math.ceil(far[0] / cell) + 4)
    const rows = Math.max(1, Math.ceil(far[1] / cell) + 4)
    const grid = new Uint8Array(cols * rows)
    const owner = new Uint16Array(cols * rows)
    let metres = 0
    for (const run of runs) {
      const reach = Math.max(0, Math.round(run.width / 2 / cell - 0.25))
      let before = flat.toXY(run.points[0])
      for (let i = 1; i < run.points.length; i++) {
        const now = flat.toXY(run.points[i])
        const length = Math.hypot(now[0] - before[0], now[1] - before[1])
        metres += length
        const steps = Math.max(1, Math.ceil(length / (cell * 0.7)))
        for (let step = 0; step <= steps; step++) {
          const cx = Math.floor(
            (before[0] + ((now[0] - before[0]) * step) / steps) / cell,
          )
          const cy = Math.floor(
            (before[1] + ((now[1] - before[1]) * step) / steps) / cell,
          )
          for (let dy = -reach; dy <= reach; dy++)
            for (let dx = -reach; dx <= reach; dx++) {
              if (dx * dx + dy * dy > reach * reach + reach) continue
              const gx = cx + dx + 2
              const gy = cy + dy + 2
              if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) continue
              const i2 = gy * cols + gx
              if (!owner[i2]) {
                owner[i2] = run.who
                grid[i2] = 1
              } else if (owner[i2] !== run.who) grid[i2] = 2
            }
        }
        before = now
      }
    }
    let covered = 0
    let twice = 0
    for (let i = 0; i < grid.length; i++) {
      if (grid[i]) covered++
      if (grid[i] === 2) twice++
    }
    return {
      trails: trails.length,
      km: metres / 1000,
      ha: (covered * cell * cell) / 10000,
      twice: (twice * cell * cell) / 10000,
      of: 0,
      drivers: [
        ...new Set(
          trails
            .map((trail) => (trail.operator ?? "").trim().split(/\s+/)[0])
            .filter(Boolean),
        ),
      ],
      from: Math.min(...trails.map((trail) => trail.start)),
      to: Math.max(...trails.map((trail) => trail.end ?? trail.start)),
    }
  }

  /**
   * Show every trail through a paddock at once (or stop): inside the
   * paddock they stand as they were laid, outside it each carries on as a
   * dashed line, and the rest of the job's trails fade back. The map stays
   * where it is.
   */
  showThrough(paddockId: string | null) {
    const paddock = paddockId
      ? this.paddocks.find((p) => p.id === paddockId)
      : null
    const source = this.map.getSource(THROUGH_SOURCE)
    const mask = this.map.getSource(THROUGH_MASK_SOURCE)
    if (!paddock) {
      const was = get(this.through)
      // A replay of the set ends with it.
      if (this.setRun || get(this.setReplay)) {
        this.through.set(null)
        this.stopSet()
      }
      if (!was) return
      this.through.set(null)
      this.throughStats.set(null)
      this.throughIds = []
      source?.setData(collection([]))
      mask?.setData(collection([]))
      this.paintPicked()
      return
    }
    if (get(this.selectedTrail)) this.pickTrail(null)
    const through = this.trailsIn(paddock)
    const ids = new Set(through.map((trail) => trail.id))
    // What is inside the fence is measured as it is cut: metres driven,
    // and the ground covered, on a grid of cells a few metres across so
    // that two passes over the same ground count once.
    const flat = projector([paddock.bbox[0], paddock.bbox[1]])
    const far = flat.toXY([paddock.bbox[2], paddock.bbox[3]])
    const cell = clamp(Math.sqrt((far[0] * far[1]) / 60000), 3, 14)
    const cols = Math.max(1, Math.ceil(far[0] / cell))
    const rows = Math.max(1, Math.ceil(far[1] / cell))
    // Each cell: 1 once a trail has been over it, 2 once a second trail
    // has (a trail crossing its own path is not an overlap between trails).
    const grid = new Uint8Array(cols * rows)
    const owner = new Uint16Array(cols * rows)
    const order = new Map([...ids].map((id, i) => [id, i + 1]))
    let metres = 0
    const cover = (run: LngLat[], width: number, who: number) => {
      const reach = Math.max(0, Math.round(width / 2 / cell - 0.25))
      const stamp = (x: number, y: number) => {
        const cx = Math.floor(x / cell)
        const cy = Math.floor(y / cell)
        for (let dy = -reach; dy <= reach; dy++)
          for (let dx = -reach; dx <= reach; dx++) {
            if (dx * dx + dy * dy > reach * reach + reach) continue
            const gx = cx + dx
            const gy = cy + dy
            if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) continue
            const i = gy * cols + gx
            if (!owner[i]) {
              owner[i] = who
              grid[i] = 1
            } else if (owner[i] !== who) grid[i] = 2
          }
      }
      let before = flat.toXY(run[0])
      for (let i = 1; i < run.length; i++) {
        const now = flat.toXY(run[i])
        const length = Math.hypot(now[0] - before[0], now[1] - before[1])
        metres += length
        const steps = Math.max(1, Math.ceil(length / (cell * 0.7)))
        for (let step = 0; step <= steps; step++)
          stamp(
            before[0] + ((now[0] - before[0]) * step) / steps,
            before[1] + ((now[1] - before[1]) * step) / steps,
          )
        before = now
      }
    }
    const [w, s, e, n] = paddock.bbox
    const inside = (at: LngLat) =>
      at[0] >= w &&
      at[0] <= e &&
      at[1] >= s &&
      at[1] <= n &&
      paddock.polygons.some((rings) => pointInPolygon(at, rings))
    const features: unknown[] = []
    for (const feature of this.history) {
      const properties = (
        feature as {
          properties: { id: string; segment?: string; color: string }
        }
      ).properties
      if (properties.segment === "pause" || !ids.has(properties.id)) continue
      for (const part of partsOf(feature)) {
        // The trail is cut wherever it crosses the fence: runs inside the
        // paddock, and runs outside it.
        let run: LngLat[] = []
        let within = false
        const end = () => {
          if (run.length < 2) return
          features.push({
            type: "Feature",
            properties: { ...properties, part: within ? "in" : "out" },
            geometry: { type: "LineString", coordinates: run },
          })
          if (within)
            cover(
              run,
              Number((properties as { width?: number }).width) || 0,
              order.get(properties.id) ?? 1,
            )
        }
        part.forEach((at, i) => {
          const here = inside(at)
          if (i === 0) within = here
          else if (here !== within) {
            run.push(at)
            end()
            run = []
            within = here
          }
          run.push(at)
        })
        end()
      }
    }
    this.throughIds = [...ids]
    source?.setData(collection(features))
    // Everything but the paddock dims.
    mask?.setData(
      collection([
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [-180, -85],
                [180, -85],
                [180, 85],
                [-180, 85],
                [-180, -85],
              ],
              ...paddock.polygons.map((polygon) => polygon[0]),
            ],
          },
        },
      ]),
    )
    // The cells a trail went over that are really inside the fence.
    const rings = paddock.polygons.map((polygon) =>
      polygon.map((ring) => ring.map((at) => flat.toXY(at))),
    )
    let covered = 0
    let twice = 0
    for (let gy = 0; gy < rows; gy++)
      for (let gx = 0; gx < cols; gx++) {
        const mark = grid[gy * cols + gx]
        if (!mark) continue
        const at: [number, number] = [(gx + 0.5) * cell, (gy + 0.5) * cell]
        if (!rings.some((polygon) => pointInPolygon(at, polygon))) continue
        covered++
        if (mark === 2) twice++
      }
    const whole = paddock.ha > 0 ? paddock.ha : outlineHa(paddock.polygons)
    this.throughStats.set({
      trails: through.length,
      km: metres / 1000,
      ha: Math.min(whole, (covered * cell * cell) / 10000),
      twice: Math.min(whole, (twice * cell * cell) / 10000),
      of: whole,
      drivers: [
        ...new Set(
          through
            .map((trail) => (trail.operator ?? "").trim().split(/\s+/)[0])
            .filter(Boolean),
        ),
      ],
      from: Math.min(...through.map((trail) => trail.start)),
      to: Math.max(...through.map((trail) => trail.end ?? trail.start)),
    })
    this.through.set(paddock.id)
    this.paintPicked()
  }

  /**
   * Pick one finished trail out: it stands forward with a line marching
   * the way it was driven, the others fade back, and the map moves to it.
   * `null` lets it go.
   */
  pickTrail(id: string | null, look = true) {
    if (id && (this.setRun || get(this.setReplay))) this.stopSet()
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
    if (info) void this.lookOver(info)
    else this.trailSuspect.set(null)
    if (get(this.ready)) {
      this.map.getSource(PICKED_TRAIL_SOURCE)?.setData(collection(features))
      this.pickedArrows(features.flatMap(partsOf), info?.colour)
    }
    this.paintPicked()
    this.keepMarching()
    if (info && look) this.lookAtTrail(info.id)
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
  async playReplay(rate = 1) {
    const info = get(this.selectedTrail)
    if (!info) return
    const running = this.replaying
    if (running) {
      if (running.cursor >= running.total) {
        running.cursor = 0
        // From the top again: the trail is brought back into the middle.
        this.watchReplay(running)
      }
      this.replay.update((r) => (r ? { ...r, phase: "playing" } : r))
      return
    }
    if (get(this.replay)?.phase === "loading") return
    this.replay.set({
      trailId: info.id,
      phase: "loading",
      progress: 0,
      time: info.start,
      rate,
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
      (info.operator ?? "").trim().split(/\s+/)[0] || "Replay",
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
      colour: trailColour(info.colour, info.id),
      drawn: -1,
      told: 0,
      speed: 0,
      shownSpeed: -1,
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
    // The trail is put in the middle of the map (or, a very long one, the
    // map goes along with its machine) until the map is dragged.
    this.watchReplay(this.replaying)
    this.replay.set({
      trailId: info.id,
      phase: "playing",
      progress: 0,
      time: points[0].t,
      rate,
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
    if (this.watch?.mode !== "fleet") this.watch = null
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
      ?.setData(
        collection(
          arrowsAlong(parts, trailColour(colour, get(this.selectedTrail)?.id)),
        ),
      )
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
      // How fast it was going here: the ground between two recorded points
      // over the time between them. (Only when the trail kept its timing;
      // leaving points out can't inflate it, since the ground is measured
      // along the points that remain.)
      const took = b.t - a.t
      if (state.timed && took > 300 && took < 60_000)
        running.speed = lerp(
          running.speed,
          ((b.along - a.along) / (took / 1000)) * 3.6,
          1 - Math.exp(-dt * 4),
        )
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
    this.rideWatch(at, dt, now)
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
      const speed =
        state.timed && state.phase === "playing" ? Math.round(running.speed) : 0
      if (speed !== running.shownSpeed) {
        running.shownSpeed = speed
        running.vehicle.view.$set({ speed })
      }
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
    // While a job's trails are still arriving, the map is handed the lot
    // again only every second or so: each hand-over is a pause, and one per
    // trail made the map stutter.
    const loading = !!get(this.loading).trails
    const now = performance.now()
    const flush =
      this.historyDirty && (!loading || now - this.historyDrawnAt > 1200)
    const changed = flush || this.liveDirty
    if (flush) {
      this.historyDirty = false
      this.historyDrawnAt = now
      this.map.getSource(HISTORY_SOURCE)?.setData(collection(this.history))
    }
    if (this.liveDirty || get(this.selectedCrew)) this.showCrewTrail()

    const recording = get(this.recorder.state).trail
    const points = recording ? this.recorder.points : []
    const colour = recording ? trailColour(recording.colour) : ""
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
              trailColour(trail.info.colour),
              trail.info.width,
            ),
          )
      }
      for (let i = 0; i < frozen; i++)
        features.push(
          ...this.laid(
            points.slice(i * CHUNK, (i + 1) * CHUNK + 1),
            colour,
            width,
          ),
        )
      this.map.getSource(TRAIL_SOURCE)?.setData(collection(features))
    }

    const mineLines: unknown[] = []
    if (recording && points.length) {
      const tail = points.slice(frozen * CHUNK)
      // The stretch being painted runs right up to the machine.
      if (this.mine && this.speedKmh >= 0.7 && this.painting())
        tail.push({ at: this.mine.pos, t: Date.now() })
      for (let i = 0; i < tail.length - 1; i += CHUNK)
        mineLines.push(
          ...this.laid(tail.slice(i, i + CHUNK + 1), colour, width),
        )
    }
    const lead = this.mine && mineLines.length ? this.mine.pos.join() : ""
    const drawn = `${recording?.id ?? ""}|${points.length}|${lead}|${
      this.recorder.pauses.length
    }${get(this.recorder.paused) ? "p" : ""}`
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
    // Arrows for every trail are the heaviest thing on the map: they are
    // worked out once the trails have all arrived, not after each one.
    if (get(this.loading).trails) {
      this.arrowsStale = this.arrowsStale || changed
      return
    }
    const drawn = `on|${mine.length}`
    if (!changed && !this.arrowsStale && drawn === this.arrowsDrawn) return
    this.arrowsDrawn = drawn
    this.arrowsStale = false

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
        trailColour(trail.info.colour),
        { kind: "activeTrails" },
      ))
        arrows.push(arrow)
    for (const arrow of arrowsAlong([mine], mineColour, {
      kind: "activeTrails",
    }))
      arrows.push(arrow)
    source.setData(collection(arrows))
  }

  /**
   * A stretch of my own trail as lines to draw: what was driven with the
   * trail paused is marked, so it shows as a dotted line and not coverage.
   */
  private laid(points: TrailPoint[], colour: string, width: number) {
    if (points.length < 2) return []
    if (!this.recorder.pauses.length)
      return [
        line(
          points.map((p) => p.at),
          colour,
          width,
        ),
      ]
    const out: unknown[] = []
    let run: LngLat[] = [points[0].at]
    let paused = false
    const put = () => {
      if (run.length > 1)
        out.push(line(run, colour, width, paused ? { segment: "pause" } : {}))
    }
    for (let i = 1; i < points.length; i++) {
      const now = this.recorder.inPause(points[i].t)
      if (now !== paused) {
        put()
        run = [points[i - 1].at]
        paused = now
      }
      run.push(points[i].at)
    }
    put()
    return out
  }

  /** Pause my trail: driving still shows, dotted, but isn't coverage. */
  pauseTrail() {
    const done = this.recorder.pause(this.mine?.pos ?? null)
    if (done) this.liveDirty = true
    return done
  }

  /** Carry on laying coverage. */
  resumeTrail() {
    const done = this.recorder.unpause()
    if (done) this.liveDirty = true
    return done
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

  /** Throw the trail being laid away, unsaved. */
  async discardTrail() {
    const gone = await this.recorder.discard()
    if (!gone) return false
    this.link.saveSoon()
    this.sendNow()
    this.liveDirty = true
    return true
  }

  async stopTrail(): Promise<FinishedTrail | null> {
    const pauses = [...this.recorder.pauses]
    const finished = await this.recorder.stop()
    if (this.recorder.recording) return null
    this.link.saveSoon()
    this.sendNow()
    if (finished) {
      const coords = finished.points.map((p) => p.at)
      // Drawn the way it will come back from the server: the stretches
      // driven paused apart from the coverage.
      const paused = (t: number) =>
        pauses.some(
          (w) => t > w.pausedAt && (w.resumedAt === null || t < w.resumedAt),
        )
      const work: LngLat[][] = []
      const rest: LngLat[][] = []
      if (pauses.length) {
        let run: LngLat[] = [finished.points[0].at]
        let was = false
        for (let i = 1; i < finished.points.length; i++) {
          const now = paused(finished.points[i].t)
          if (now !== was) {
            if (run.length > 1) (was ? rest : work).push(run)
            run = [finished.points[i - 1].at]
            was = now
          }
          run.push(finished.points[i].at)
        }
        if (run.length > 1) (was ? rest : work).push(run)
      }
      this.addHistory({
        info: finished.info,
        path: work.length
          ? { type: "MultiLineString", coordinates: work }
          : { type: "LineString", coordinates: coords },
        pausePath: rest.length
          ? { type: "MultiLineString", coordinates: rest }
          : null,
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
    this.powerSoon()
    if (hectares) this.drawPaddocks()
    for (const entry of this.crewById.values()) {
      if (!entry.vehicle) continue
      entry.vehicle.marker.getElement().style.display =
        shown.vehicles === false ? "none" : ""
      entry.vehicle.view.$set({ label: this.tagFor(entry) })
    }
  }

  /** How vivid the trails are drawn (the Map tool's setting). */
  setTrailLevel(level: TrailLevel) {
    setTrailLevel(get(this.ready) ? this.map : null, level, this.base)
    this.paintPicked()
  }

  /** The pins' style changed (see `pinStyle`): draw them again. */
  redrawPins() {
    this.drawPins()
    this.showPicked(get(this.selectedPin))
  }

  // ── Power lines and poles ───────────────────────────────────────────────
  // The current viewer's data: Western Power's lines and poles (two Mapbox
  // tilesets) and Geoscience Australia's national lines (a file of the
  // app's). Only what is within a kilometre of a paddock is drawn, worked
  // out by the current viewer's own helper from the few tiles the paddocks
  // sit in. It is done once per set of paddocks, a moment after they
  // settle, and not at all while both layers are switched off.

  private powerKey = ""
  private powerTimer: ReturnType<typeof setTimeout> | null = null

  private powerSoon() {
    if (this.shown.powerLines === false && this.shown.powerPoles === false)
      return
    if (this.powerTimer) clearTimeout(this.powerTimer)
    this.powerTimer = setTimeout(() => this.loadPower(), 1500)
  }

  private async loadPower() {
    this.powerTimer = null
    if (this.destroyed || !get(this.ready)) return
    const key = this.paddocks
      .map((paddock) => `${paddock.id}:${paddock.bbox.join()}`)
      .join("|")
    if (key === this.powerKey) return
    this.powerKey = key
    const fields = this.paddocks.map((paddock) => ({
      boundary: { type: "MultiPolygon", coordinates: paddock.polygons },
    }))
    const show = (lines: unknown[], poles: unknown[]) => {
      if (this.destroyed || this.powerKey !== key) return
      this.map.getSource(POWER_LINE_SOURCE)?.setData(collection(lines))
      this.map.getSource(POWER_POLE_SOURCE)?.setData(collection(poles))
    }
    if (!fields.length) {
      show([], [])
      return
    }
    try {
      const near = (await computePowerNearData({
        fields,
        accessToken: mapboxgl.accessToken,
        nationalData: null,
      })) as {
        lines: { features: unknown[] }
        poles: { features: unknown[] }
      }
      const lines = near.lines.features
      const poles = near.poles.features
      show(lines, poles)
      // The national lines come after: every other state's, and the big
      // transmission lines the Western Power set leaves out.
      const national = await loadNationalPower()
      const more = await filterNationalNear(national, fields)
      if (more.features.length)
        show([...lines, ...(more.features as unknown[])], poles)
    } catch {
      // Nothing more is drawn; the next change to the paddocks tries again.
      if (this.powerKey === key) this.powerKey = ""
    }
  }

  // ── Measuring ───────────────────────────────────────────────────────────

  /**
   * Start (or stop) the measure and draw tool: taps on the map add corners
   * of an area, or points along a line. What is drawn can then be kept.
   */
  setMeasuring(
    on: boolean,
    kind: "polygon" | "line" = "polygon",
    forJob = false,
  ) {
    if (this.draft) this.endPlacing()
    if (on && this.editing) this.cancelEdit(false)
    this.measured = []
    this.clearSelection()
    this.armPin(null)
    this.measure.set(
      on
        ? { points: 0, distance: 0, ha: 0, kind, paddock: null, forJob }
        : null,
    )
    this.map.getCanvas().style.cursor = on ? "crosshair" : ""
    this.drawMeasure()
  }

  /** Switch between an area and a line without losing the corners. */
  setMeasureKind(kind: "polygon" | "line") {
    this.measure.update((m) => (m ? { ...m, kind } : m))
    this.drawMeasure()
  }

  /** The colour what is being drawn shows in (and will be kept in). */
  setMeasureColour(colour: string) {
    this.measure.update((m) => (m ? { ...m, colour } : m))
    this.drawMeasure()
  }

  /** Hand over what has been drawn (for a job) and stop drawing. */
  takeDrawn() {
    const drawn = this.drawn()
    if (!drawn) return null
    const taken = { kind: drawn.state.kind, points: drawn.points }
    this.cancelDrawing()
    return taken
  }

  /**
   * Show a job's places on the map: a numbered dot for each (the number is
   * its step), and any line or area drawn for it. Null clears them.
   */
  setJobShapes(steps: { items: JobItem[] }[] | null) {
    const features: unknown[] = []
    const many = (steps?.length ?? 0) > 1
    steps?.forEach((step, index) => {
      for (const item of step.items) {
        if (item.points && item.points.length > 1)
          features.push({
            type: "Feature",
            properties: {},
            geometry:
              item.type === "area"
                ? {
                    type: "Polygon",
                    coordinates: [[...item.points, item.points[0]]],
                  }
                : { type: "LineString", coordinates: item.points },
          })
        // Every place gets its dot (a lone step's carry no number).
        features.push({
          type: "Feature",
          properties: { n: many ? String(index + 1) : "" },
          geometry: {
            type: "Point",
            coordinates: item.points ? item.points[0] : item.at,
          },
        })
      }
    })
    this.map.getSource(JOB_SOURCE)?.setData(collection(features))
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
   * Give a paddock a new boundary. The one it replaces is kept with it, so
   * the change can be put back.
   */
  private async changeBoundary(paddock: Paddock, polygons: LngLat[][][]) {
    const ha = haAfter(paddock, polygons)
    const prior = await saveBoundary(paddock, polygons, ha)
    this.setPaddock(paddock.id, {
      polygons,
      ha,
      prior,
      bbox: bboxOf(polygons),
    })
  }

  /** Put a paddock's boundary back to what it was before its last change. */
  async undoBoundary(id: string) {
    const paddock = this.paddocks.find((p) => p.id === id)
    const back = paddock?.prior
    if (!paddock || !back) return false
    try {
      const prior = await saveBoundary(paddock, back.polygons, back.ha)
      this.setPaddock(id, {
        polygons: back.polygons,
        ha: back.ha,
        prior,
        bbox: bboxOf(back.polygons),
      })
      return true
    } catch {
      this.problem.set("The boundary couldn't be put back. Try again.")
      return false
    }
  }

  /**
   * Cut the drawn area out of the paddock it sits in: the paddock's own
   * boundary changes (and its hectares with it). It can be put back.
   */
  cutFromPaddock() {
    const drawn = this.drawn()
    const paddock = this.paddocks.find((p) => p.id === drawn?.state.paddock?.id)
    if (!drawn || !paddock || drawn.state.kind !== "polygon")
      return Promise.resolve(false)
    return this.keep(async () => {
      const polygons = takeOut(paddock.polygons, drawn.points)
      if (!polygons) throw new Error("Nothing to cut")
      await this.changeBoundary(paddock, polygons)
    }, "that couldn't be cut out. Try again.")
  }

  // ── Changing a paddock's boundary ───────────────────────────────────────
  // Corners are dragged; a small dot between two corners is dragged out
  // into a new one; a corner that is tapped can be taken away. Ground is
  // tapped out to cut a hole (or a bite off the edge), or to add a piece.
  // Nothing is saved until Save, and every step can be stepped back.

  editBoundary(id: string) {
    const paddock = this.paddocks.find((p) => p.id === id)
    if (!paddock) return false
    return this.openEditor(paddock, null)
  }

  /**
   * Build a new paddock in the same editor: tapped out on the map from
   * nothing, or started from an outline (the ground a trail covered). It has
   * everything the editor has, so it can have holes and several pieces
   * from the start. Nothing exists until it is saved with a name.
   */
  newPaddock(farmId: string | null, start: LngLat[][][] | null = null) {
    const farms = get(this.farmNames)
    const farm =
      farms.find((f) => f.id === farmId) ??
      (farms.length === 1 ? farms[0] : null)
    const polygons = start ?? []
    const opened = this.openEditor(
      {
        id: "",
        name: "New paddock",
        ha: 0,
        farm: farms.length > 1 ? (farm?.name ?? null) : null,
        farmId: farm?.id ?? null,
        crop: "",
        variety: "",
        colour: null,
        polygons,
        bbox: polygons.length ? bboxOf(polygons) : [0, 0, 0, 0],
        features: [],
        prior: null,
      },
      { farmId: farm?.id ?? null },
    )
    // Starting from nothing, the first thing is to tap round the ground.
    if (opened && !polygons.length) this.startAdding("piece")
    return opened
  }

  /** The outline of the ground a finished trail covered. */
  outlineOfTrail(id: string) {
    const info = get(this.trails).find((trail) => trail.id === id)
    const parts = this.trailFeatures(id).flatMap(partsOf)
    if (!info || !parts.length) return null
    try {
      return outlineOfPath(parts, info.width)
    } catch {
      return null
    }
  }

  /**
   * Change a line or an area that is drawn on a pin, in the same editor:
   * corners drag, a dot between two makes a new one, a tapped corner can be
   * taken away. Saved, it replaces the drawing.
   */
  editDrawing(id: string) {
    const drawing = get(this.drawings).find((d) => d.id === id)
    if (!drawing) return false
    const points = (
      drawing.kind === "line"
        ? drawing.geometry.coordinates
        : (drawing.geometry.coordinates as LngLat[][])[0].slice(0, -1)
    ) as LngLat[]
    if (points.length < 2) return false
    return this.openEditor(
      {
        id: "",
        name: drawing.kind === "line" ? "Line" : "Area",
        ha: 0,
        farm: null,
        farmId: null,
        crop: "",
        variety: "",
        colour: drawing.colour,
        polygons: [[points.map((at) => [at[0], at[1]] as LngLat)]],
        bbox: bboxOf([[points]]),
        features: [],
        prior: null,
      },
      null,
      {
        on: { pin: drawing.pinId, drawingId: drawing.id },
        kind: drawing.kind,
        colour: drawing.colour,
        was: drawing.colour,
      },
    )
  }

  /** The same, for a line or an area that is kept on a paddock. */
  editFeature(paddockId: string, featureId: string) {
    const paddock = this.paddocks.find((p) => p.id === paddockId)
    const feature = paddock?.features.find((f) => f.id === featureId)
    if (!paddock || !feature || feature.coordinates.length < 2) return false
    return this.openEditor(
      {
        id: "",
        name: feature.label || (feature.kind === "line" ? "Line" : "Area"),
        ha: 0,
        farm: null,
        farmId: null,
        crop: "",
        variety: "",
        colour: feature.colour,
        polygons: [[feature.coordinates.map((at) => [at[0], at[1]] as LngLat)]],
        bbox: bboxOf([[feature.coordinates]]),
        features: [],
        prior: null,
      },
      null,
      {
        on: {
          paddock: paddock.id,
          featureId: feature.id,
          label: feature.label,
        },
        kind: feature.kind,
        colour: feature.colour,
        was: feature.colour,
      },
    )
  }

  /** Give the line or area being changed another colour. */
  setShapeColour(colour: string) {
    const edit = this.editing
    if (!edit?.shape) return
    edit.shape.colour = colour
    this.touchEdit()
  }

  /** Save the line or area being changed back onto its pin. */
  async saveShape() {
    const edit = this.editing
    const shape = edit?.shape
    if (!edit || !shape || edit.saving) return false
    const points = edit.rings[0]?.[0] ?? []
    if (points.length < (shape.kind === "line" ? 2 : 3)) return false
    edit.saving = true
    this.tellEdit()
    try {
      if ("pin" in shape.on) {
        // (There is no call that changes a drawing's shape, so the new one
        // goes on and the old one comes off.)
        await createDrawing({
          mapId: this.mapId,
          userId: this.userId,
          pinId: shape.on.pin,
          kind: shape.kind,
          points,
          colour: shape.colour,
        })
        await deleteDrawing(shape.on.drawingId, this.userId)
      } else {
        const features = await changePaddockFeatures(
          shape.on.paddock,
          [
            {
              id: `${shape.on.featureId}-${Date.now().toString(36)}`,
              kind: shape.kind,
              label: shape.on.label,
              colour: shape.colour,
              coordinates: points,
              t: Date.now(),
            },
          ],
          [shape.on.featureId],
        )
        this.setPaddock(shape.on.paddock, { features })
      }
    } catch {
      edit.saving = false
      this.tellEdit()
      this.problem.set(
        navigator.onLine
          ? "That didn't save. Try again."
          : "No signal: that didn't save.",
      )
      return false
    }
    this.cancelEdit()
    if ("pin" in shape.on) await this.refreshDrawings()
    return true
  }

  private openEditor(
    paddock: Paddock,
    creating: { farmId: string | null } | null,
    shape: Editing["shape"] = null,
  ) {
    this.cancelEdit(false)
    if (get(this.measure)) this.setMeasuring(false)
    if (this.draft) this.endPlacing()
    this.clearSelection()
    this.armPin(null)

    const container = this.map.getContainer() as HTMLElement
    const pointOf = (e: MouseEvent | TouchEvent): [number, number] | null => {
      const touch = "touches" in e ? (e.touches[0] ?? e.changedTouches[0]) : e
      if (!touch) return null
      const box = container.getBoundingClientRect()
      return [touch.clientX - box.left, touch.clientY - box.top]
    }
    const down = (e: MouseEvent | TouchEvent) => {
      const edit = this.editing
      const at = pointOf(e)
      if (!edit || edit.adding || edit.joining || edit.saving || !at) return
      if ("touches" in e && e.touches.length > 1) return
      // A finger is wider than a mouse pointer.
      const reach = "touches" in e ? 30 : 22
      let corner: { at: [number, number, number]; d: number } | null = null
      let mid: { at: [number, number, number]; d: number } | null = null
      edit.rings.forEach((polygon, p) =>
        polygon.forEach((ring, r) =>
          ring.forEach((point, c) => {
            const a = this.map.project(point)
            const d = Math.hypot(a.x - at[0], a.y - at[1])
            if (d < reach && (!corner || d < corner.d))
              corner = { at: [p, r, c], d }
            if (edit.shape) return
            const b = this.map.project(ring[(c + 1) % ring.length])
            if (Math.hypot(a.x - b.x, a.y - b.y) < 44) return
            const m = Math.hypot(
              (a.x + b.x) / 2 - at[0],
              (a.y + b.y) / 2 - at[1],
            )
            if (m < reach - 4 && (!mid || m < mid.d))
              mid = { at: [p, r, c], d: m }
          }),
        ),
      )
      const onCorner = corner as { at: [number, number, number] } | null
      const onMid = mid as { at: [number, number, number] } | null
      if (onCorner) {
        edit.drag = { at: onCorner.at, from: at, moved: false }
      } else if (onMid) {
        // Pressing the dot between two corners makes a corner there.
        this.rememberEdit()
        const [p, r, c] = onMid.at
        const here = this.map.unproject(at)
        edit.rings[p][r].splice(c + 1, 0, [here.lng, here.lat])
        edit.drag = { at: [p, r, c + 1], from: at, moved: true }
        edit.picked = [p, r, c + 1]
        edit.dirty = true
      } else return
      e.preventDefault()
      e.stopPropagation()
    }
    const drag = (e: MouseEvent | TouchEvent) => {
      const edit = this.editing
      const at = pointOf(e)
      const held = edit?.drag
      if (!edit || !held || !at) return
      if (e.cancelable) e.preventDefault()
      if (!held.moved) {
        if (Math.hypot(at[0] - held.from[0], at[1] - held.from[1]) < 5) return
        this.rememberEdit()
        held.moved = true
      }
      const here = this.map.unproject(at)
      edit.rings[held.at[0]][held.at[1]][held.at[2]] = [here.lng, here.lat]
      edit.picked = held.at
      edit.dirty = true
    }
    const up = () => {
      const edit = this.editing
      const held = edit?.drag
      if (!edit || !held) return
      edit.drag = null
      if (!held.moved) {
        // A tap on a corner picks it out; a second tap lets it go.
        const same =
          !!edit.picked && edit.picked.every((v, i) => v === held.at[i])
        edit.picked = same ? null : held.at
      } else {
        // Once it has been put down, a dragged corner is let go.
        edit.picked = null
      }
      edit.quietUntil = performance.now() + 350
      edit.dirty = true
      edit.told = 0
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

    this.editing = {
      paddock,
      rings: openRings(paddock.polygons),
      original: JSON.stringify(closeRings(openRings(paddock.polygons))),
      history: [],
      picked: null,
      adding: null,
      absorbed: [],
      apart: false,
      joining: false,
      creating,
      shape,
      drag: null,
      was: outlineHa(paddock.polygons),
      dirty: false,
      told: 0,
      quietUntil: 0,
      saving: false,
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
    this.setFollow("free")
    this.followCrew(null)
    if (paddock.polygons.length)
      this.map.fitBounds(
        [
          [paddock.bbox[0], paddock.bbox[1]],
          [paddock.bbox[2], paddock.bbox[3]],
        ],
        {
          // The editor's card takes the lower half of the map.
          padding: {
            top: 90,
            right: 70,
            bottom: Math.max(
              250 + this.insets.bottom,
              Math.round(container.clientHeight * 0.52),
            ),
            left: 70 + this.insets.left,
          },
          maxZoom: 17.5,
          duration: 700,
        },
      )
    this.drawPaddocks()
    this.drawEdit()
    this.tellEdit()
    return true
  }

  /** Keep the outline as it stands, so the next change can be stepped back. */
  private rememberEdit() {
    const edit = this.editing
    if (!edit) return
    edit.history.push({
      rings: edit.rings.map((polygon) =>
        polygon.map((ring) => ring.map((c) => [c[0], c[1]] as LngLat)),
      ),
      absorbed: [...edit.absorbed],
      apart: edit.apart,
    })
    if (edit.history.length > 80) edit.history.shift()
  }

  private touchEdit() {
    const edit = this.editing
    if (!edit) return
    edit.dirty = true
    edit.told = 0
  }

  private editTap(at: LngLat) {
    const edit = this.editing
    if (!edit || edit.saving || performance.now() < edit.quietUntil) return
    if (edit.joining) {
      this.joinAt(at)
      return
    }
    if (edit.shape) {
      // A drawing: a tap puts another point on the end of it.
      this.rememberEdit()
      edit.rings[0][0].push(at)
      edit.picked = null
    } else if (edit.adding) edit.adding.points.push(at)
    else edit.picked = null
    this.touchEdit()
  }

  /** Start joining a neighbour on: the next tap on a paddock picks it. */
  startJoining() {
    const edit = this.editing
    if (!edit) return
    edit.adding = null
    edit.picked = null
    edit.joining = true
    this.map.getCanvas().style.cursor = "pointer"
    this.touchEdit()
  }

  cancelJoining() {
    const edit = this.editing
    if (!edit) return
    edit.joining = false
    this.map.getCanvas().style.cursor = ""
    this.touchEdit()
  }

  /** Join the paddock under a tap onto the one being changed. */
  private joinAt(at: LngLat) {
    const edit = this.editing
    if (!edit) return
    const other = this.paddocks.find(
      (paddock) =>
        paddock.id !== edit.paddock.id &&
        !edit.absorbed.includes(paddock.id) &&
        at[0] >= paddock.bbox[0] &&
        at[0] <= paddock.bbox[2] &&
        at[1] >= paddock.bbox[1] &&
        at[1] <= paddock.bbox[3] &&
        paddock.polygons.some((rings) => pointInPolygon(at, rings)),
    )
    if (!other) {
      this.problem.set("Tap the paddock you want joined onto this one.")
      return
    }
    const now = closeRings(edit.rings)
    let after: LngLat[][][] | null = null
    let gap = 0
    try {
      gap = gapBetween(now, other.polygons)
      after = mergeOutlines(now, other.polygons)
    } catch {
      after = null
    }
    if (!after) {
      this.problem.set(`${other.name} couldn't be joined on. Try again.`)
      return
    }
    this.rememberEdit()
    edit.rings = openRings(after)
    edit.absorbed = [...edit.absorbed, other.id]
    edit.joining = false
    this.map.getCanvas().style.cursor = ""
    if (after.length > 1 && gap > 40)
      this.problem.set(
        `${other.name} is ${Math.round(gap)} m away, too far to close the gap: it joins as a second piece of the same paddock.`,
      )
    this.drawPaddocks()
    this.touchEdit()
  }

  private drawEdit() {
    const source = this.map.getSource(EDIT_SOURCE)
    if (!source) return
    const edit = this.editing
    if (!edit) {
      source.setData(collection([]))
      return
    }
    const point = (at: LngLat, properties: Record<string, unknown>) => ({
      type: "Feature",
      properties,
      geometry: { type: "Point", coordinates: at },
    })
    const features: unknown[] = [
      {
        type: "Feature",
        properties: { kind: "shape" },
        geometry:
          edit.shape?.kind === "line"
            ? { type: "LineString", coordinates: edit.rings[0]?.[0] ?? [] }
            : { type: "MultiPolygon", coordinates: closeRings(edit.rings) },
      },
    ]
    const adding = edit.adding
    if (adding) {
      const split = adding.kind === "split"
      const color = split
        ? "#F7DB5C"
        : adding.kind === "hole"
          ? "#e5484d"
          : "#22c55e"
      const points = adding.points
      if (points.length > 2 && !split)
        features.push({
          type: "Feature",
          properties: { kind: "newfill", color },
          geometry: { type: "Polygon", coordinates: [[...points, points[0]]] },
        })
      if (points.length > 1)
        features.push({
          type: "Feature",
          properties: { kind: "new", color },
          geometry: {
            type: "LineString",
            coordinates:
              points.length > 2 && !split ? [...points, points[0]] : points,
          },
        })
      for (const at of points)
        features.push(point(at, { kind: "newpoint", color }))
    } else if (!edit.joining) {
      edit.rings.forEach((polygon, p) =>
        polygon.forEach((ring, r) =>
          ring.forEach((corner, c) => {
            const picked =
              !!edit.picked &&
              edit.picked[0] === p &&
              edit.picked[1] === r &&
              edit.picked[2] === c
            features.push(point(corner, { kind: "corner", picked }))
            // A dot between corners far enough apart to press between
            // (a paddock's boundary only: a drawing is added to by tapping).
            if (edit.shape) return
            const next = ring[(c + 1) % ring.length]
            const a = this.map.project(corner)
            const b = this.map.project(next)
            if (Math.hypot(a.x - b.x, a.y - b.y) >= 44)
              features.push(
                point([(corner[0] + next[0]) / 2, (corner[1] + next[1]) / 2], {
                  kind: "mid",
                }),
              )
          }),
        ),
      )
    }
    source.setData(collection(features))
  }

  private tellEdit() {
    const edit = this.editing
    if (!edit) {
      this.boundary.set(null)
      return
    }
    const polygons = closeRings(edit.rings)
    const picked = edit.picked
    const ring = picked ? edit.rings[picked[0]]?.[picked[1]] : null
    this.boundary.set({
      paddockId: edit.paddock.id,
      name: edit.paddock.name,
      ha: outlineHa(polygons),
      was: edit.was,
      pieces: edit.rings.length,
      holes: edit.rings.reduce((sum, polygon) => sum + polygon.length - 1, 0),
      picked:
        picked && ring
          ? {
              hole: picked[1] > 0,
              canRemoveCorner:
                ring.length > (edit.shape?.kind === "line" ? 2 : 3),
              canRemoveRing: picked[1] > 0 || edit.rings.length > 1,
            }
          : null,
      adding: edit.adding
        ? { kind: edit.adding.kind, points: edit.adding.points.length }
        : null,
      joining: edit.joining,
      joined: edit.absorbed.map(
        (id) => this.paddocks.find((p) => p.id === id)?.name ?? "Paddock",
      ),
      apart:
        edit.apart && polygons.length > 1
          ? polygons
              .map((coordinates) => outlineHa([coordinates]))
              .sort((a, b) => b - a)
          : null,
      steps: edit.history.length,
      creating: !!edit.creating,
      shape: edit.shape
        ? {
            kind: edit.shape.kind,
            colour: edit.shape.colour,
            corners: edit.rings[0]?.[0]?.length ?? 0,
            metres: (edit.rings[0]?.[0] ?? []).reduce(
              (sum, at, i, all) => (i ? sum + distanceM(all[i - 1], at) : sum),
              0,
            ),
          }
        : null,
      changed: edit.creating
        ? polygons.length > 0
        : (!!edit.shape && edit.shape.colour !== edit.shape.was) ||
          JSON.stringify(polygons) !== edit.original ||
          edit.absorbed.length > 0,
      saving: edit.saving,
      polygons,
    })
  }

  /** Redraw the boundary being changed when it has moved. */
  private stepEdit(now: number) {
    const edit = this.editing
    if (!edit?.dirty) return
    edit.dirty = false
    this.drawEdit()
    // The figures follow a drag a few times a second, not every frame.
    if (!edit.drag || now - edit.told > 150) {
      edit.told = now
      this.tellEdit()
    }
  }

  /** Take the picked corner away. */
  removeEditCorner() {
    const edit = this.editing
    const picked = edit?.picked
    if (!edit || !picked) return
    const ring = edit.rings[picked[0]][picked[1]]
    if (ring.length <= (edit.shape?.kind === "line" ? 2 : 3)) return
    this.rememberEdit()
    ring.splice(picked[2], 1)
    edit.picked = null
    this.touchEdit()
  }

  /** Take away the hole, or the whole piece, the picked corner belongs to. */
  removeEditRing() {
    const edit = this.editing
    const picked = edit?.picked
    if (!edit || !picked) return
    if (picked[1] > 0) {
      this.rememberEdit()
      edit.rings[picked[0]].splice(picked[1], 1)
    } else if (edit.rings.length > 1) {
      this.rememberEdit()
      edit.rings.splice(picked[0], 1)
    } else return
    edit.picked = null
    this.touchEdit()
  }

  /** Start tapping out ground to cut from the paddock, or to add to it. */
  startAdding(kind: "hole" | "piece" | "split") {
    const edit = this.editing
    if (!edit) return
    edit.joining = false
    edit.adding = { kind, points: [] }
    edit.picked = null
    this.map.getCanvas().style.cursor = "crosshair"
    this.touchEdit()
  }

  undoAdding() {
    this.editing?.adding?.points.pop()
    this.touchEdit()
  }

  cancelAdding() {
    const edit = this.editing
    if (!edit) return
    edit.adding = null
    this.map.getCanvas().style.cursor = ""
    // A new paddock with nothing drawn yet has nothing to go back to.
    if (edit.creating && !edit.rings.length) {
      this.cancelEdit(false)
      return
    }
    this.touchEdit()
  }

  /** Cut what was tapped out from the paddock, or join it on. */
  finishAdding() {
    const edit = this.editing
    const adding = edit?.adding
    const split = adding?.kind === "split"
    if (!edit || !adding || adding.points.length < (split ? 2 : 3)) return false
    const now = closeRings(edit.rings)
    let after: LngLat[][][] | null = null
    try {
      after = split
        ? splitAlong(now, adding.points)
        : adding.kind === "hole"
          ? takeOut(now, adding.points)
          : now.length
            ? joinOn(now, adding.points)
            : [[[...adding.points, adding.points[0]]]]
    } catch {
      after = null
    }
    if (!after) {
      this.problem.set(
        split
          ? "The line has to go right across the paddock, from one fence to another."
          : adding.kind === "hole"
            ? "That isn't over the paddock, so there is nothing to take out."
            : "That is already inside the paddock.",
      )
      return false
    }
    this.rememberEdit()
    edit.rings = openRings(after)
    if (split) edit.apart = true
    this.cancelAdding()
    return true
  }

  /** Step back one change. */
  undoEdit() {
    const edit = this.editing
    const before = edit?.history.pop()
    if (!edit || !before) return
    const joined = edit.absorbed.length !== before.absorbed.length
    edit.rings = before.rings
    edit.absorbed = before.absorbed
    edit.apart = before.apart
    edit.picked = null
    if (joined) this.drawPaddocks()
    this.touchEdit()
  }

  /** Back to the boundary as it was when editing began. */
  resetEdit() {
    const edit = this.editing
    if (!edit) return
    this.rememberEdit()
    edit.rings = openRings(edit.paddock.polygons)
    edit.picked = null
    edit.apart = false
    if (edit.absorbed.length) {
      edit.absorbed = []
      this.drawPaddocks()
    }
    this.touchEdit()
  }

  /** Bring in the boundary the paddock had before its last saved change. */
  usePriorBoundary() {
    const edit = this.editing
    const prior = edit?.paddock.prior
    if (!edit || !prior) return
    this.rememberEdit()
    edit.rings = openRings(prior.polygons)
    edit.picked = null
    edit.apart = false
    if (edit.absorbed.length) {
      edit.absorbed = []
      this.drawPaddocks()
    }
    this.touchEdit()
  }

  /** Leave the editor without saving. */
  cancelEdit(reselect = true) {
    const edit = this.editing
    if (!edit) return
    edit.stop()
    this.editing = null
    this.boundary.set(null)
    this.map.getCanvas().style.cursor = ""
    this.drawEdit()
    this.drawPaddocks()
    const paddock = this.paddocks.find((p) => p.id === edit.paddock.id)
    if (reselect && paddock) this.selectedPaddock.set(paddock)
    // A drawing: back to the pin or the paddock it is on.
    const on = edit.shape?.on
    const pin = on && "pin" in on ? this.pinsById.get(on.pin) : null
    if (reselect && pin) this.selectedPin.set(pin)
    const owner =
      on && "paddock" in on
        ? this.paddocks.find((p) => p.id === on.paddock)
        : null
    if (reselect && owner) this.selectedPaddock.set(owner)
  }

  private listPaddocks(paddocks: Paddock[]) {
    this.paddocks = paddocks
    this.paddockList.set(this.paddocks)
    this.farm.set({
      paddocks: this.paddocks.length,
      ha: this.paddocks.reduce((sum, p) => sum + p.ha, 0),
    })
    this.drawPaddocks()
  }

  /** A name no paddock on the map has yet: "Home 2", "Home 3"… */
  private freeName(base: string, taken: string[]) {
    const used = new Set(
      [...this.paddocks.map((p) => p.name), ...taken].map((name) =>
        name.trim().toLowerCase(),
      ),
    )
    const stem = base.replace(/\s+\d+$/, "").slice(0, 54)
    for (let n = 2; n < 200; n++)
      if (!used.has(`${stem} ${n}`.toLowerCase())) return `${stem} ${n}`
    return `${stem} ${Date.now() % 10000}`
  }

  /**
   * Put back what the last save of a boundary did: the outline, and any
   * paddocks a split made or a join took away.
   */
  async undoSaved(saved: BoundarySaved) {
    try {
      for (const made of saved.made) {
        await deletePaddock(made.id)
        this.listPaddocks(this.paddocks.filter((p) => p.id !== made.id))
      }
      if (!(await this.undoBoundary(saved.paddockId))) return false
      if (saved.gone.length) {
        const moved = saved.gone.flatMap((paddock) =>
          paddock.features.map((feature) => feature.id),
        )
        if (moved.length) {
          const features = await changePaddockFeatures(
            saved.paddockId,
            [],
            moved,
          )
          this.setPaddock(saved.paddockId, { features })
        }
        for (const gone of saved.gone) {
          const back = await createPaddockLike(
            this.mapId,
            gone,
            gone.name,
            gone.polygons,
            gone.ha,
            gone.features,
          )
          this.listPaddocks([...this.paddocks, back])
        }
      }
      return true
    } catch {
      this.problem.set("That couldn't all be put back. Check the paddocks.")
      return false
    }
  }

  async saveEdit(name = ""): Promise<BoundarySaved | false> {
    const edit = this.editing
    if (!edit || edit.saving) return false
    let polygons = closeRings(edit.rings)
    if (edit.creating && !polygons.length) return false
    let crossed = false
    try {
      crossed = crossesItself(polygons)
    } catch {
      crossed = false
    }
    if (crossed) {
      this.problem.set(
        "The boundary crosses over itself. Move a corner so it doesn't.",
      )
      return false
    }
    edit.saving = true
    this.tellEdit()
    const saved: BoundarySaved = {
      paddockId: edit.paddock.id,
      name: edit.paddock.name,
      made: [],
      gone: [],
    }
    try {
      // Split with a line: the biggest piece stays this paddock, and each
      // of the others becomes a paddock of its own.
      let others: LngLat[][][] = []
      if (edit.apart && polygons.length > 1) {
        const bySize = [...polygons].sort(
          (a, b) => outlineHa([b]) - outlineHa([a]),
        )
        polygons = [bySize[0]]
        others = bySize.slice(1)
      }
      const gone = this.paddocks.filter((p) => edit.absorbed.includes(p.id))
      const called = name.trim().slice(0, 60) || edit.paddock.name
      if (edit.creating) {
        // A new paddock: made with the name it was given.
        const first = await createPaddockLike(
          this.mapId,
          edit.paddock,
          this.paddocks.some(
            (p) => p.name.trim().toLowerCase() === called.toLowerCase(),
          )
            ? this.freeName(called, [])
            : called,
          polygons,
          outlineHa(polygons),
        )
        saved.made.push(first)
        saved.paddockId = first.id
        saved.name = first.name
        this.paddocks = [...this.paddocks, first]
      } else await this.changeBoundary(edit.paddock, polygons)
      for (const piece of others) {
        const made = await createPaddockLike(
          this.mapId,
          edit.paddock,
          this.freeName(
            called,
            saved.made.map((p) => p.name),
          ),
          [piece],
          outlineHa([piece]),
        )
        saved.made.push(made)
      }
      // Joined on: what was kept on the neighbour moves over, then it goes.
      const carried = gone.flatMap((paddock) => paddock.features)
      if (carried.length) {
        const features = await changePaddockFeatures(saved.paddockId, carried)
        this.setPaddock(saved.paddockId, { features })
      }
      for (const paddock of gone) {
        await deletePaddock(paddock.id)
        saved.gone.push(paddock)
      }
    } catch {
      edit.saving = false
      this.tellEdit()
      this.problem.set(
        navigator.onLine
          ? "The boundary didn't all save. Check the paddock and try again."
          : "No signal: the boundary didn't save.",
      )
      if (saved.made.length || saved.gone.length)
        this.listPaddocks([
          ...this.paddocks.filter(
            (p) => !saved.gone.some((gone) => gone.id === p.id),
          ),
          ...saved.made,
        ])
      return false
    }
    const goneIds = new Set(saved.gone.map((p) => p.id))
    this.paddocks = [
      ...this.paddocks.filter(
        (p) => !goneIds.has(p.id) && !saved.made.some((m) => m.id === p.id),
      ),
      ...saved.made,
    ]
    this.cancelEdit()
    this.listPaddocks(this.paddocks)
    if (edit.creating) {
      const first = this.paddocks.find((p) => p.id === saved.paddockId)
      if (first) this.selectedPaddock.set(first)
    }
    return saved
  }

  /** Add a farm (a block of paddocks) to this map. */
  async addFarm(name: string) {
    const wanted = name.trim().slice(0, 60)
    if (!wanted) return null
    try {
      const farm = await createFarm(this.mapId, wanted)
      this.farmNames.update((farms) =>
        [...farms, farm].sort((a, b) => a.name.localeCompare(b.name)),
      )
      return farm
    } catch (error) {
      this.problem.set(
        error instanceof Error && /exist|duplicate/i.test(error.message)
          ? `There is already a farm called ${wanted}.`
          : "That farm couldn't be added. Try again.",
      )
      return null
    }
  }

  /** Make what has been drawn (an area) into a new paddock. */
  keepAsPaddock(name: string, farmId: string | null = null) {
    const drawn = this.drawn()
    if (!drawn || drawn.state.kind !== "polygon") return Promise.resolve(false)
    return this.keep(async () => {
      // It goes in the farm it was started from; failing that, on a map
      // with one farm it joins it, and with several it is left to be filed.
      const farms = get(this.farmNames)
      const farm =
        farms.find((f) => f.id === farmId) ??
        (farms.length === 1 ? farms[0] : null)
      const made = await createPaddock(
        this.mapId,
        name.trim().slice(0, 60) || "New paddock",
        drawn.points,
        farm?.id ?? null,
      )
      const paddock = {
        ...made,
        farmId: farm?.id ?? made.farmId,
        farm: farms.length > 1 ? (farm?.name ?? null) : null,
      }
      this.paddocks = [...this.paddocks, paddock]
      this.paddockList.set(this.paddocks)
      this.farm.set({
        paddocks: this.paddocks.length,
        ha: this.paddocks.reduce((sum, p) => sum + p.ha, 0),
      })
      this.drawPaddocks()
      this.selectedPaddock.set(paddock)
    }, "that paddock didn't save. Is the name already used?")
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
      // A trail that never comes near the paddock is passed over without
      // looking at its points. (Where each trail goes is worked out once.)
      let box = this.trailBoxes.get(feature as object)
      if (!box) {
        box = [Infinity, Infinity, -Infinity, -Infinity]
        for (const part of partsOf(feature))
          for (const at of part) {
            if (at[0] < box[0]) box[0] = at[0]
            if (at[1] < box[1]) box[1] = at[1]
            if (at[0] > box[2]) box[2] = at[0]
            if (at[1] > box[3]) box[3] = at[1]
          }
        this.trailBoxes.set(feature as object, box)
      }
      if (box[0] > e || box[2] < w || box[1] > n || box[3] < s) continue
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

  startLasso(purpose: "pins" | "ground" = "pins") {
    this.cancelLasso()
    this.clearSelection()
    this.armPin(null)
    this.map.dragPan.disable()
    this.map.getCanvas().style.cursor = "crosshair"
    this.lasso.set({ phase: "drawing", count: 0, purpose })
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
      if (purpose === "ground") {
        // Every stretch of the job's trails that lies inside the loop, each
        // as wide as the machine that laid it, makes the outline.
        const parts: LngLat[][] = []
        const widths: number[] = []
        for (const feature of this.history) {
          const properties = (
            feature as { properties: { segment?: string; width?: number } }
          ).properties
          if (properties.segment === "pause") continue
          for (const part of partsOf(feature)) {
            let run: LngLat[] = []
            const end = () => {
              if (run.length > 1) {
                parts.push(run)
                widths.push(Number(properties.width) || 0)
              }
              run = []
            }
            for (const at of part)
              if (pointInPolygon(at, [ring])) run.push(at)
              else end()
            end()
          }
        }
        let outline: LngLat[][][] | null = null
        try {
          outline = parts.length ? outlineOfPath(parts, widths) : null
        } catch {
          outline = null
        }
        draw([])
        if (!outline) {
          this.problem.set(
            parts.length
              ? "The trail inside that covers too little ground for a boundary."
              : "No trail inside that. Draw right round the ground it covered.",
          )
          return
        }
        this.cancelLasso()
        this.onGround(outline)
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
      this.lasso.set({ phase: "confirm", count: caught.length, purpose })
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
    const lasso = get(this.lasso)
    if (lasso) this.startLasso(lasso.purpose)
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
    const colour = drawing?.colour ?? state?.colour
    const properties = colour ? { color: colour } : {}
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
            overPaddock: points.some((at) => !!this.paddockAt(at)),
          }
        : m,
    )
  }

  /** Space the chrome covers, so "centred" means centred in what's left. */
  setInsets(left: number, bottom: number) {
    this.insets = { left, bottom }
  }

  setFollow(mode: FollowMode, closest = 15.2, keepBearing = false) {
    const previous = get(this.follow)
    if (mode === previous) return
    this.follow.set(mode)
    if (mode === "free") {
      if (previous === "cab" && !keepBearing)
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
      zoom: Math.max(this.map.getZoom(), closest),
      bearing: mode === "cab" ? this.mine.heading : 0,
      offset: this.followOffset(mode),
      duration: 650,
    })
  }

  /**
   * Ride along with a machine. The camera doesn't sit on every position
   * the machine reports (they arrive a second or so apart and wander a
   * metre either way, which made the map shake); it glides after it. And
   * when the map is turning with the machine, it turns to the way the
   * machine has actually travelled over the last twenty metres (as a
   * trailer follows a ute), not to each heading reading.
   */
  private ride(
    key: string,
    pos: LngLat,
    heading: number,
    swing: boolean,
    offset: [number, number],
    dt: number,
    rate = 1,
  ) {
    let cam = this.cam
    if (!cam || cam.key !== key || distanceM(cam.at, pos) > 300)
      cam = this.cam = {
        key,
        at: pos,
        hitch: pos,
        course: heading,
        turning: true,
      }
    // The camera is on a slack leash. A position wanders a metre or so even
    // on a machine that is crawling or stopped, and a camera that answered
    // every wander kept the whole map trembling (worst zoomed right in).
    // So within the slack it is left alone, and past it it glides to the
    // end of the leash, not onto the machine: it comes to rest, rather
    // than creeping after each new reading.
    const zoom = this.map.getZoom()
    const slack = Math.max(1.5, 6 / pixelsPerMetre(zoom, pos[1]))
    const gap = distanceM(cam.at, pos)
    let moved = false
    if (gap > slack) {
      const reach = (gap - slack) / gap
      // (Further behind, it catches up faster.)
      const keen = clamp(gap / (slack * 3), 0.4, 1)
      const glide = (1 - Math.exp(-dt * 3.4 * rate * keen)) * reach
      cam.at = [lerp(cam.at[0], pos[0], glide), lerp(cam.at[1], pos[1], glide)]
      moved = true
    }
    const out = distanceM(cam.hitch, pos)
    const REACH = 20
    if (out > REACH) {
      cam.course = bearingDeg(cam.hitch, pos)
      const pull = (out - REACH) / out
      cam.hitch = [
        lerp(cam.hitch[0], pos[0], pull),
        lerp(cam.hitch[1], pos[1], pull),
      ]
    }
    // Turning with the machine: the same wander swings its course a few
    // degrees either way, and every degree moves the edges of the map a
    // long way. The map starts to turn only once the course is properly
    // off (four degrees), and then turns until it is square again.
    const bearing = this.map.getBearing()
    let turned = bearing
    if (swing) {
      const off = turn(bearing, cam.course)
      if (!cam.turning && Math.abs(off) > 4) cam.turning = true
      if (cam.turning) {
        turned = bearing + off * (1 - Math.exp(-dt * 1.7 * rate))
        if (Math.abs(off) < 0.5) cam.turning = false
      }
    }
    // Nothing to do: the map is left still (and isn't drawn again).
    if (!moved && turned === bearing && !this.camUnsettled(offset)) return
    this.map.easeTo({
      center: cam.at,
      ...(swing ? { bearing: turned } : {}),
      offset,
      duration: 0,
    })
  }

  /**
   * The camera isn't where the ride last put it (a zoom, a resize, or the
   * space the menus take changed): it needs putting back even though the
   * machine hasn't moved.
   */
  private camUnsettled(offset: [number, number]) {
    const cam = this.cam
    if (!cam) return false
    const size = this.map.getContainer()
    const at = this.map.project(cam.at)
    return (
      Math.hypot(
        at.x - (size.clientWidth / 2 + offset[0]),
        at.y - (size.clientHeight / 2 + offset[1]),
      ) > 0.75
    )
  }

  private followOffset(mode: FollowMode): [number, number] {
    const height = this.map.getContainer().clientHeight
    return [
      this.insets.left / 2,
      -this.insets.bottom / 2 + (mode === "cab" ? height * 0.16 : 0),
    ]
  }

  // ── Following a trail ───────────────────────────────────────────────────

  /**
   * Follow a trail that has already been driven: its path becomes a line
   * to steer along, with how far off it the machine is, the next turn and
   * what is left. A phone's position is good to a few metres, so this is
   * for keeping to a path, not for steering to the centimetre.
   */
  async startGuide(info: TrailInfo, demo = false) {
    this.stopGuide()
    this.stopReplay()
    this.guide.set({
      trailId: info.id,
      phase: "loading",
      offset: 0,
      away: null,
      turn: null,
      left: 0,
      total: 0,
      toStart: false,
      reversed: false,
      against: false,
      accuracy: null,
      demo,
      rate: 4,
    })
    const timeline = await loadTrailTimeline(info).catch(() => null)
    // They stopped, or picked another, while it loaded.
    if (get(this.guide)?.trailId !== info.id) return false
    const raw: LngLat[] = []
    for (const part of timeline?.parts ?? [])
      for (const point of part) raw.push(point.at)
    if (raw.length < 2) {
      this.guide.set(null)
      this.problem.set("This trail has no recorded path to follow.")
      return false
    }
    this.layGuide(info, raw, false, false)
    this.pickTrail(null)
    if (demo) {
      this.startSim()
      return true
    }
    if (this.mine) {
      if (get(this.follow) === "cab")
        this.map.easeTo({
          zoom: Math.max(this.map.getZoom(), 17),
          duration: 500,
        })
      else this.setFollow("cab", 17)
    } else {
      // Nowhere to follow from yet: show the whole of it.
      let west = raw[0][0]
      let east = raw[0][0]
      let south = raw[0][1]
      let north = raw[0][1]
      for (const [lng, lat] of raw) {
        west = Math.min(west, lng)
        east = Math.max(east, lng)
        south = Math.min(south, lat)
        north = Math.max(north, lat)
      }
      this.map.fitBounds(
        [
          [west, south],
          [east, north],
        ],
        {
          padding: {
            top: 150,
            right: 60,
            bottom: 60 + this.insets.bottom,
            left: 60 + this.insets.left,
          },
          maxZoom: 16.5,
          duration: 800,
        },
      )
    }
    return true
  }

  /** Cut the path into even steps, find its turns, and draw it. */
  private layGuide(
    info: TrailInfo,
    raw: LngLat[],
    reversed: boolean,
    toStart: boolean,
  ) {
    const flat = projector(raw[0])
    // A machine standing still wanders a metre or two on the record; leave
    // that out, or it reads as path.
    const kept: [number, number][] = []
    for (const at of raw) {
      const p = flat.toXY(at)
      const last = kept[kept.length - 1]
      if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) >= 2.5)
        kept.push(p)
    }
    const end = flat.toXY(raw[raw.length - 1])
    if (kept.length < 2) kept.push(end)
    const xs: number[] = [kept[0][0]]
    const ys: number[] = [kept[0][1]]
    const alongs: number[] = [0]
    let carried = 0
    let travelled = 0
    for (let i = 1; i < kept.length; i++) {
      const [ax, ay] = kept[i - 1]
      const [bx, by] = kept[i]
      const length = Math.hypot(bx - ax, by - ay)
      let at = GUIDE_STEP - carried
      while (at <= length) {
        xs.push(ax + ((bx - ax) * at) / length)
        ys.push(ay + ((by - ay) * at) / length)
        alongs.push(travelled + at)
        at += GUIDE_STEP
      }
      carried = (carried + length) % GUIDE_STEP
      travelled += length
    }
    const tail = kept[kept.length - 1]
    if (travelled - alongs[alongs.length - 1] > 0.5 || xs.length < 2) {
      xs.push(tail[0])
      ys.push(tail[1])
      alongs.push(Math.max(travelled, alongs[alongs.length - 1] + 0.5))
    }
    // A recorded position is good to a metre or so, which leaves a path
    // that twitches from side to side. Each point is drawn a little toward
    // its neighbours (twice over), which takes the twitch out and leaves
    // the turns where they are.
    for (let pass = 0; pass < 2; pass++) {
      let px = xs[0]
      let py = ys[0]
      for (let i = 1; i < xs.length - 1; i++) {
        const nx = (px + 2 * xs[i] + xs[i + 1]) / 4
        const ny = (py + 2 * ys[i] + ys[i + 1]) / 4
        px = xs[i]
        py = ys[i]
        xs[i] = nx
        ys[i] = ny
      }
    }
    const count = xs.length

    // Turns: where the path swings well off its line within a short
    // distance. Each is followed through to where it straightens out, so a
    // headland turn reads as one turn, and as a turn back when it is one.
    const heading: number[] = []
    for (let i = 0; i < count - 1; i++)
      heading.push(
        (Math.atan2(xs[i + 1] - xs[i], ys[i + 1] - ys[i]) * 180) / Math.PI,
      )
    const found: { at: number; end: number; swung: number }[] = []
    const reach = 6
    for (let i = 0; i + reach < heading.length; i++) {
      if (Math.abs(turn(heading[i], heading[i + reach])) < 40) continue
      let last = i + reach
      let swung = turn(heading[i], heading[last])
      while (
        last + 2 < heading.length &&
        last - i < 60 &&
        Math.abs(turn(heading[last], heading[last + 2])) > 12
      ) {
        swung += turn(heading[last], heading[last + 2])
        last += 2
      }
      if (Math.abs(swung) >= 40) {
        // Two corners the same way close together are one turn: the square
        // end of a run, out and back.
        const before = found[found.length - 1]
        if (
          before &&
          alongs[i] - before.end <= 60 &&
          before.swung > 0 === swung > 0
        ) {
          before.end = alongs[last]
          before.swung += swung
        } else found.push({ at: alongs[i], end: alongs[last], swung })
      }
      i = last
    }
    const turns: GuidePath["turns"] = found.map((t) => ({
      at: t.at,
      side: t.swung > 0 ? "right" : "left",
      angle: Math.abs(t.swung),
    }))

    this.guiding = {
      info,
      raw,
      flat,
      x: Float64Array.from(xs),
      y: Float64Array.from(ys),
      along: Float64Array.from(alongs),
      turns,
      index: 0,
      joined: false,
      toStart,
      reversed,
      againstFor: 0,
      told: 0,
      searched: 0,
    }
    const coords: LngLat[] = []
    for (let i = 0; i < count; i++) coords.push(flat.toLngLat([xs[i], ys[i]]))
    this.map.getSource(GUIDE_SOURCE)?.setData(
      collection([
        {
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: coords },
        },
      ]),
    )
    this.map.getSource(GUIDE_AHEAD_SOURCE)?.setData(collection([]))
  }

  /**
   * A demo run: a made-up machine (the viewer's own, by its look) drives
   * the trail from its start, wandering a little off the line as a real
   * one does, so the guide can be seen working from anywhere.
   */
  private startSim() {
    const g = this.guiding
    if (!g) return
    const at = g.flat.toLngLat([g.x[0], g.y[0]])
    const vehicle = this.mountVehicle(
      machineFor(this.me.type).type,
      drawColour(this.me.bodyColor),
      "Demo",
      at,
      false,
    )
    vehicle.marker.getElement().style.zIndex = "5"
    vehicle.heading =
      ((Math.atan2(g.x[1] - g.x[0], g.y[1] - g.y[0]) * 180) / Math.PI + 360) %
      360
    vehicle.view.$set({ speed: SIM_KMH })
    this.sim = { vehicle, along: 0, index: 0, rate: 4, wander: 0 }
    this.setFollow("free")
    this.followCrew(null)
    this.followPausedUntil = performance.now() + 700
    this.map.easeTo({
      center: at,
      zoom: Math.max(this.map.getZoom(), 17),
      bearing: vehicle.heading,
      offset: this.followOffset("cab"),
      duration: 700,
    })
    this.onZoom()
  }

  /** How fast the demo runs: so many times a working pace. */
  setGuideRate(rate: number) {
    if (this.sim) this.sim.rate = rate
  }

  /** Move the demo machine on by one frame, and keep the camera on it. */
  private stepSim(dt: number, now: number) {
    const sim = this.sim
    const g = this.guiding
    if (!sim || !g) return
    const last = g.x.length - 1
    const total = g.along[last]
    sim.along = Math.min(total, sim.along + (SIM_KMH / 3.6) * sim.rate * dt)
    while (sim.index < last - 1 && g.along[sim.index + 1] < sim.along)
      sim.index++
    const i = sim.index
    const f = clamp(
      (sim.along - g.along[i]) / (g.along[i + 1] - g.along[i] || 1),
      0,
      1,
    )
    const dx = g.x[i + 1] - g.x[i]
    const dy = g.y[i + 1] - g.y[i]
    const length = Math.hypot(dx, dy) || 1
    // It drifts a few metres either side of the line on the straights, and
    // holds the line through a turn and at the very end.
    const turning = g.turns.some(
      (t) => sim.along > t.at - 30 && sim.along < t.at + 70,
    )
    const aim =
      turning || total - sim.along < 20
        ? 0
        : 3.2 * Math.sin(sim.along / 60) + 1.6 * Math.sin(sim.along / 21 + 1)
    sim.wander = lerp(sim.wander, aim, 1 - Math.exp(-dt * sim.rate * 0.6))
    const pos = g.flat.toLngLat([
      lerp(g.x[i], g.x[i + 1], f) + (dy / length) * sim.wander,
      lerp(g.y[i], g.y[i + 1], f) - (dx / length) * sim.wander,
    ])
    const vehicle = sim.vehicle
    vehicle.pos = pos
    vehicle.marker.setLngLat(pos)
    const back = Math.max(0, i - 2)
    const on = Math.min(last, i + 3)
    vehicle.heading =
      ((Math.atan2(g.x[on] - g.x[back], g.y[on] - g.y[back]) * 180) / Math.PI +
        360) %
      360
    const bearing = this.map.getBearing()
    vehicle.eased = Number.isNaN(vehicle.eased)
      ? vehicle.heading
      : easeHeading(
          vehicle.eased,
          vehicle.heading,
          1 - Math.exp(-dt * 5 * Math.max(1, sim.rate / 3)),
        )
    this.turnTo(vehicle, vehicle.eased - bearing)
    // The camera rides with it until the map is dragged; the "where am I"
    // button goes back to the viewer's own machine as usual.
    if (
      get(this.follow) === "free" &&
      now > this.followPausedUntil &&
      !this.touching &&
      !this.mouseHeld
    )
      // (Run faster, it turns faster, so the way ahead stays up the screen.)
      this.ride(
        "demo",
        pos,
        vehicle.heading,
        true,
        this.followOffset("cab"),
        dt,
        Math.max(1, sim.rate / 2),
      )
  }

  /** Follow it the other way round. */
  turnGuideRound() {
    const g = this.guiding
    if (!g) return
    const total = g.along[g.along.length - 1]
    this.layGuide(g.info, [...g.raw].reverse(), !g.reversed, g.toStart)
    if (this.sim) {
      this.sim.along = Math.max(0, total - this.sim.along)
      this.sim.index = 0
      this.sim.vehicle.eased = NaN
    }
  }

  /** Head for the start of the trail, or for the nearest point on it. */
  setGuideStart(toStart: boolean) {
    const g = this.guiding
    if (!g) return
    // A demo simply begins again.
    if (this.sim) {
      this.sim.along = 0
      this.sim.index = 0
      this.sim.wander = 0
      g.index = 0
      g.joined = false
      return
    }
    g.toStart = toStart
    g.joined = false
    g.index = 0
    g.searched = 0
    g.told = 0
  }

  stopGuide() {
    if (!this.guiding && !get(this.guide)) return
    if (this.sim) {
      this.sim.vehicle.view.$destroy()
      this.sim.vehicle.marker.remove()
      this.sim = null
      this.map.easeTo({ bearing: 0, duration: 500 })
    }
    this.guiding = null
    this.guide.set(null)
    this.map.getSource(GUIDE_SOURCE)?.setData(collection([]))
    this.map.getSource(GUIDE_AHEAD_SOURCE)?.setData(collection([]))
  }

  /**
   * The nearest place on the followed path between two of its points, to
   * a spot in metres. Places further along than where the machine was last
   * matched count as a little further off, so a pass alongside doesn't
   * steal the match from the one being driven.
   */
  private nearestOnGuide(
    g: GuidePath,
    px: number,
    py: number,
    from: number,
    to: number,
    sticky: boolean,
  ) {
    let best = { index: from, f: 0, distance: Infinity, score: Infinity }
    const here = g.along[g.index]
    for (let i = from; i < to; i++) {
      const ax = g.x[i]
      const ay = g.y[i]
      const dx = g.x[i + 1] - ax
      const dy = g.y[i + 1] - ay
      const length2 = dx * dx + dy * dy
      const f = length2
        ? clamp(((px - ax) * dx + (py - ay) * dy) / length2, 0, 1)
        : 0
      const distance = Math.hypot(px - (ax + dx * f), py - (ay + dy * f))
      const score = sticky
        ? distance + 0.03 * Math.max(0, Math.abs(g.along[i] - here) - 15)
        : distance
      if (score < best.score) best = { index: i, f, distance, score }
    }
    return best
  }

  /** Work out where the machine is against the trail it is following. */
  private stepGuide(now: number) {
    const g = this.guiding
    if (!g) return
    if (now - g.told < 200) return
    g.told = now
    const base = {
      trailId: g.info.id,
      offset: 0,
      away: null,
      turn: null,
      left: g.along[g.along.length - 1],
      total: g.along[g.along.length - 1],
      toStart: g.toStart,
      reversed: g.reversed,
      against: false,
      accuracy: this.sim ? null : (this.lastFix?.accuracy ?? null),
      demo: !!this.sim,
      rate: this.sim?.rate ?? 1,
    }
    // In a demo the made-up machine stands in for the viewer's own.
    const mine = this.sim ? this.sim.vehicle : this.mine
    if (!mine) {
      this.guide.set({ ...base, phase: "waiting" })
      return
    }
    const [px, py] = g.flat.toXY(mine.pos)
    const last = g.x.length - 1
    const total = g.along[last]
    const ahead: unknown[] = []
    const lineTo = (x: number, y: number) => ({
      type: "Feature",
      properties: { kind: "join" },
      geometry: {
        type: "LineString",
        coordinates: [mine.pos, g.flat.toLngLat([x, y])],
      },
    })
    const stretch = (from: number, f: number, metres: number) => {
      const coords: LngLat[] = [
        g.flat.toLngLat([
          lerp(g.x[from], g.x[from + 1], f),
          lerp(g.y[from], g.y[from + 1], f),
        ]),
      ]
      const until = g.along[from] + metres
      for (let i = from + 1; i <= last && g.along[i] <= until; i++)
        coords.push(g.flat.toLngLat([g.x[i], g.y[i]]))
      return {
        type: "Feature",
        properties: { kind: "ahead" },
        geometry: { type: "LineString", coordinates: coords },
      }
    }
    const screen = (x: number, y: number) =>
      (Math.atan2(x - px, y - py) * 180) / Math.PI - this.map.getBearing()

    // Asked to begin at the beginning: head there until it is reached.
    if (g.toStart && !g.joined) {
      const metres = Math.hypot(g.x[0] - px, g.y[0] - py)
      if (metres < 25) {
        g.joined = true
        g.index = 0
      } else {
        ahead.push(lineTo(g.x[0], g.y[0]), stretch(0, 0, 300))
        this.map.getSource(GUIDE_AHEAD_SOURCE)?.setData(collection(ahead))
        this.guide.set({
          ...base,
          phase: "away",
          away: { metres, screen: screen(g.x[0], g.y[0]) },
        })
        return
      }
    }

    // Look close to where it was last; look everywhere when it has never
    // been on the line, or has strayed and may have gone to another pass.
    let best = this.nearestOnGuide(
      g,
      px,
      py,
      Math.max(0, g.index - 6),
      Math.min(last, g.index + 40),
      true,
    )
    if ((!g.joined || best.distance > 12) && now - g.searched > 1000) {
      g.searched = now
      const anywhere = this.nearestOnGuide(g, px, py, 0, last, false)
      if (!g.joined || anywhere.distance < best.distance - 8) best = anywhere
    }
    g.index = best.index
    const nx = lerp(g.x[best.index], g.x[best.index + 1], best.f)
    const ny = lerp(g.y[best.index], g.y[best.index + 1], best.f)
    const gone =
      g.along[best.index] +
      (g.along[best.index + 1] - g.along[best.index]) * best.f
    const left = Math.max(0, total - gone)

    if (best.distance > 30) {
      ahead.push(lineTo(nx, ny), stretch(best.index, best.f, 300))
      this.map.getSource(GUIDE_AHEAD_SOURCE)?.setData(collection(ahead))
      this.guide.set({
        ...base,
        phase: "away",
        left,
        away: { metres: best.distance, screen: screen(nx, ny) },
      })
      return
    }
    g.joined = true

    // Which side the line is on, from the driver's seat: by the way the
    // machine is travelling when that is known, else by the path's own way.
    const pathHeading =
      (Math.atan2(
        g.x[best.index + 1] - g.x[best.index],
        g.y[best.index + 1] - g.y[best.index],
      ) *
        180) /
      Math.PI
    const moving = !!this.sim || (this.headingKnown && this.speedKmh >= 2)
    const facing = moving ? mine.heading : pathHeading
    const rad = (facing * Math.PI) / 180
    // Metres to the right of the way it faces.
    const offset = (nx - px) * Math.cos(rad) - (ny - py) * Math.sin(rad)

    // Going the other way from how the guide is set, for a few seconds.
    const wrongWay = moving && Math.abs(turn(mine.heading, pathHeading)) > 120
    g.againstFor = wrongWay ? g.againstFor + 0.2 : 0

    const next = g.turns.find((t) => t.at > gone + 2)
    const done = left < 8
    ahead.push(stretch(best.index, best.f, 300))
    if (best.distance > 6) ahead.push(lineTo(nx, ny))
    if (next && next.at - gone < 600) {
      let i = best.index
      while (i < last && g.along[i] < next.at) i++
      ahead.push({
        type: "Feature",
        properties: { kind: "turn" },
        geometry: {
          type: "Point",
          coordinates: g.flat.toLngLat([g.x[i], g.y[i]]),
        },
      })
    }
    this.map.getSource(GUIDE_AHEAD_SOURCE)?.setData(collection(ahead))
    this.guide.set({
      ...base,
      phase: done ? "done" : "on",
      offset,
      left,
      turn: next
        ? {
            side: next.side,
            metres: next.at - gone,
            back: next.angle >= 140,
          }
        : null,
      against: g.againstFor >= 3,
    })
  }

  /** Where the viewer's machine is drawn right now, if it is on the map. */
  myPosition(): LngLat | null {
    return this.mine?.pos ?? null
  }

  /** Where someone on the crew is right now, if they are on the map. */
  crewPosition(id: string): LngLat | null {
    return this.crewById.get(id)?.vehicle?.pos ?? null
  }

  /**
   * No zooming by tapping twice. A second tap on a phone is a second tap
   * (on a pin, on a paddock), never a zoom. Mapbox has two of these: the
   * double tap itself (off with `doubleClickZoom`), and "tap, then tap and
   * slide", which a second tap with the least wobble in it sets off. That
   * one comes back on whenever pinch-zoom is switched on, and has no switch
   * of its own, so it is reached for directly.
   */
  private noTapZoom() {
    this.map.doubleClickZoom.disable()
    const pinch = this.map.touchZoomRotate as {
      _tapDragZoom?: { disable(): void }
    }
    pinch._tapDragZoom?.disable()
  }

  /**
   * Zoom about the middle of the map (true) or about the fingers or the
   * cursor, as a map usually does (false).
   */
  private zoomAboutCentre(on: boolean) {
    if (on === this.zoomCentred) return
    this.zoomCentred = on
    const options = on ? { around: "center" } : undefined
    // (Each is switched off first: switching on what is already on changes
    // nothing, the option included.)
    this.map.scrollZoom.disable()
    this.map.scrollZoom.enable(options)
    this.map.touchZoomRotate.disable()
    this.map.touchZoomRotate.enable(options)
    this.map.touchZoomRotate.disableRotation()
    this.noTapZoom()
  }

  /** Where on the map a point of the screen is. */
  lngLatAt(clientX: number, clientY: number): LngLat {
    const box = (this.map.getContainer() as HTMLElement).getBoundingClientRect()
    const at = this.map.unproject([clientX - box.left, clientY - box.top])
    return [at.lng, at.lat]
  }

  // ── A made-up position, for testing ─────────────────────────────────────
  // Everything downstream takes it for the real thing: the machine moves,
  // the crew sees it move, and a trail started while it runs is recorded.
  // That is the point (it is how to test all of that from a desk), and why
  // only admin accounts are offered it.

  /** Feed in a made-up position in place of the device's own. */
  startDevGps(mode: "roam" | "drive", kmh = this.dev?.kmh ?? 12) {
    if (this.destroyed) return
    const centre = this.map.getCenter()
    const at: LngLat = this.dev?.at ??
      this.mine?.pos ??
      this.lastFix?.at ?? [centre.lng, centre.lat]
    if (this.dev) clearInterval(this.dev.timer)
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId)
      this.watchId = null
    }
    this.dev = {
      mode,
      kmh,
      at,
      heading: this.dev?.heading ?? this.mine?.heading ?? 0,
      route: [],
      next: 0,
      worked: null,
      timer: setInterval(() => this.stepDevGps(), 1000),
      last: performance.now(),
    }
    this.devGps.set({ mode, kmh })
    this.stepDevGps()
  }

  setDevSpeed(kmh: number) {
    if (!this.dev) return
    this.dev.kmh = kmh
    this.devGps.set({ mode: this.dev.mode, kmh })
  }

  /** Back to the device's own position. */
  stopDevGps() {
    if (!this.dev) return
    clearInterval(this.dev.timer)
    this.dev = null
    this.devGps.set(null)
    this.startGps()
  }

  /** Once a second: move along, and report where that is as a fix. */
  private stepDevGps() {
    const dev = this.dev
    if (!dev || this.destroyed) return
    const now = performance.now()
    const dt = Math.min(3, Math.max(0.2, (now - dev.last) / 1000))
    dev.last = now
    if (dev.mode === "roam" && dev.next >= dev.route.length) {
      dev.route = this.roamRoute(dev.at)
      dev.next = 0
    }
    let left = (dev.kmh / 3.6) * dt
    let moved = 0
    while (left > 0 && dev.next < dev.route.length) {
      const target = dev.route[dev.next]
      const gap = distanceM(dev.at, target)
      if (gap > 0.05) dev.heading = bearingDeg(dev.at, target)
      if (gap <= left) {
        dev.at = target
        dev.next += 1
        left -= gap
        moved += gap
      } else {
        const share = left / gap
        dev.at = [
          lerp(dev.at[0], target[0], share),
          lerp(dev.at[1], target[1], share),
        ]
        moved += left
        left = 0
      }
    }
    this.gps.set("live")
    this.onFix({
      at: dev.at,
      t: Date.now(),
      accuracy: 4,
      speed: moved / dt,
      heading: dev.heading,
    })
  }

  /**
   * Where a roaming machine goes next: up and down the nearest paddock it
   * hasn't just worked, a pass every machine-width. With no paddocks on the
   * farm it wanders a few hundred metres at a time.
   */
  private roamRoute(from: LngLat): LngLat[] {
    const dev = this.dev
    const paddock = this.paddocks
      .filter((p) => p.id !== dev?.worked && p.polygons.length)
      .map((p) => ({
        p,
        far: distanceM(from, [
          (p.bbox[0] + p.bbox[2]) / 2,
          (p.bbox[1] + p.bbox[3]) / 2,
        ]),
      }))
      .sort((a, b) => a.far - b.far)[0]?.p
    if (!paddock) {
      const turn = Math.random() * Math.PI * 2
      const reach = 150 + Math.random() * 250
      return [
        projector(from).toLngLat([
          Math.cos(turn) * reach,
          Math.sin(turn) * reach,
        ]),
      ]
    }
    if (dev) dev.worked = paddock.id
    const proj = projector([
      (paddock.bbox[0] + paddock.bbox[2]) / 2,
      (paddock.bbox[1] + paddock.bbox[3]) / 2,
    ])
    const rings = paddock.polygons[0].map((ring) => ring.map(proj.toXY))
    const passes = workingPasses(rings, Math.max(8, this.me.swath || 12))
    return passes.map(proj.toLngLat)
  }

  // ── Real position ───────────────────────────────────────────────────────

  /** Ask the browser for the viewer's position and keep watching it. */
  startGps() {
    // Asked for after the map was closed (the answer to "may I?" can come
    // late): there is nothing left to show a position on.
    if (this.destroyed) return
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
    if (this.destroyed) return
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
        dur: clamp(gap * 1.15, 200, 1600),
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
      // (Driven with the trail paused, it isn't coverage either.)
      if (moved < 150 && !get(this.recorder.paused)) this.recordedM += moved
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
      else if (
        now > this.followPausedUntil &&
        !this.touching &&
        !this.mouseHeld
      )
        this.ride(
          `crew:${tail.id}`,
          followed.pos,
          followed.heading,
          tail.mode === "cab",
          this.followOffset(tail.mode),
          dt,
        )
      else if (this.cam?.key === `crew:${tail.id}`) this.cam.at = followed.pos
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
      if (
        mode !== "free" &&
        now > this.followPausedUntil &&
        !this.touching &&
        !this.mouseHeld
      )
        this.ride(
          "me",
          mine.pos,
          mine.heading,
          mode === "cab",
          this.followOffset(mode),
          dt,
        )
      else if (this.cam?.key === "me") this.cam.at = mine.pos
    }

    this.stepReplay(dt, now)
    this.stepSet(dt, now)
    this.stepMove(dt)
    this.stepSim(dt, now)
    this.stepGuide(now)
    this.stepEdit(now)

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
    for (const track of this.setRun?.tracks ?? [])
      if (track.vehicle) resize(track.vehicle)
    if (this.sim) resize(this.sim.vehicle)
    // The dots between a boundary's corners come and go with the zoom.
    if (this.editing) this.editing.dirty = true
  }

  destroy() {
    this.destroyed = true
    this.endMove(false)
    this.stopLasso?.()
    cancelAnimationFrame(this.raf)
    document.removeEventListener("visibilitychange", this.onVisibility)
    if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId)
    if (this.dev) clearInterval(this.dev.timer)
    this.wakeLock?.release().catch(() => {})
    this.stops.forEach((stop) => stop())
    this.stopTrailWatch?.()
    this.link.stop()
    this.recorder.destroy()
    for (const entry of this.crewById.values()) entry.vehicle?.view.$destroy()
    this.mine?.view.$destroy()
    this.picked?.view.$destroy()
    this.replaying?.vehicle.view.$destroy()
    this.sim?.vehicle.view.$destroy()
    this.editing?.stop()
    this.map.remove()
  }
}
