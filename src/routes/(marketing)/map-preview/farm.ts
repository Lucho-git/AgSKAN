/**
 * The example farm: paddocks, pins and crew that get placed around wherever
 * the viewer is standing, so there is something to look at straight away.
 *
 * Everything is in metres east/north of the viewer. The paddock outlines are
 * modelled on real boundary data (irregular, sharing fences, creek lines cut
 * in, scrub left standing) but mirrored, renamed and stripped of any
 * location, so they don't describe anyone's actual farm. Sizes and pin
 * choices follow what crews really use: a typical paddock is about 70 ha,
 * the common working widths are 36 m and 12 m, and rocks, trees and gates are
 * the pins dropped most.
 */
import {
  MACHINES,
  machineById,
  type MachineId,
} from "../onboarding-preview/machines"
import {
  Track,
  labelPoint,
  workingPasses,
  type XY,
} from "$lib/components/mapnext/geo"
import type { PinKind } from "./glyphs"

export { MACHINES, machineById, type MachineId }

/** How each machine behaves on the real map. */
export const MACHINE_SPECS: Record<
  MachineId,
  {
    /** Working width in metres; 0 for road vehicles, which paint nothing. */
    swath: number
    /** Real-world length of the drawing's longest side, in metres. */
    span: number
    /** Smallest the drawing gets on screen, in pixels. */
    minPx: number
    /** Typical speed, km/h. */
    speed: number
    /** What it is doing while it moves. */
    verb: string
  }
> = {
  sprayer: { swath: 36, span: 40, minPx: 46, speed: 24, verb: "Spraying" },
  seeder: { swath: 12, span: 23, minPx: 58, speed: 11, verb: "Seeding" },
  header: { swath: 12, span: 16, minPx: 46, speed: 8, verb: "Harvesting" },
  chaser: { swath: 0, span: 13, minPx: 52, speed: 18, verb: "On the move" },
  truck: { swath: 0, span: 12, minPx: 42, speed: 45, verb: "On the move" },
  ute: { swath: 0, span: 5.5, minPx: 34, speed: 35, verb: "On the move" },
}

const ring = (raw: string): XY[] =>
  raw
    .split(" ")
    .slice(0, -1) // the last point repeats the first
    .map((pair) => {
      const [x, y] = pair.split(",").map(Number)
      return [-x, y] as XY
    })

export type Paddock = {
  id: string
  name: string
  ha: number
  /** Crop colour, used on the drawn map and as a faint tint on imagery. */
  fill: string
  /** Outer fence first, then any scrub or dams left out of the paddock. */
  rings: XY[][]
  label: XY
}

const paddock = (
  id: string,
  name: string,
  ha: number,
  fill: string,
  outer: string,
  holes: string[] = [],
): Paddock => {
  const rings = [ring(outer), ...holes.map(ring)]
  return { id, name, ha, fill, rings, label: labelPoint(rings) }
}

export const PADDOCKS: Paddock[] = [
  paddock(
    "home",
    "Home",
    68,
    "#C79A5B",
    "-499,-136 -239,-130 -203,123 429,121 400,-81 362,-159 327,-192 303,-203 229,-143 174,-129 118,-133 217,-147 286,-210 321,-212 380,-154 418,-54 423,53 452,181 463,193 521,172 523,-376 293,-589 177,-614 149,-592 112,-597 96,-631 -271,-716 -271,-735 -485,-740 -498,-724 -498,-431 -374,-403 -304,-347 -227,-347 -215,-327 -310,-328 -397,-397 -498,-393 -499,-136",
    [
      "104,-254 110,-340 163,-326 142,-303 129,-245 104,-254",
      "158,-319 239,-332 307,-326 401,-294 451,-264 506,-112 473,-157 452,-247 394,-288 236,-323 202,-316 214,-283 197,-285 195,-312 158,-319",
    ],
  ),
  paddock(
    "shed",
    "Shed",
    49,
    "#E0B94F",
    "-530,662 -527,648 -476,655 -468,676 -341,709 -222,631 -9,611 506,598 523,584 524,490 500,465 500,294 487,261 448,232 431,121 -203,123 -391,152 -406,238 -519,287 -530,662",
  ),
  paddock(
    "railway",
    "Railway",
    120,
    "#D8B04A",
    "534,1084 564,1116 571,1205 659,1321 689,1312 688,1236 1518,1240 1549,1218 1696,1027 1744,917 1746,788 1785,726 1770,542 1785,503 1781,269 1763,253 543,251 534,1084",
    ["1167,342 1190,292 1246,307 1251,351 1274,386 1264,481 1212,490 1167,342"],
  ),
  paddock(
    "dam",
    "Dam",
    66,
    "#EDD352",
    "539,-375 541,233 554,244 1016,246 1131,180 1191,110 1232,102 1249,132 1207,174 1174,164 1111,227 1116,244 1767,242 1764,-219 1436,-218 1433,-375 838,-375 747,-304 691,-284 664,-252 620,-219 600,-150 681,-117 685,-105 643,-48 641,27 668,55 716,70 746,107 709,163 687,172 643,153 600,86 597,64 624,41 631,-31 605,-49 577,7 558,180 571,6 583,-23 589,-185 679,-285 732,-303 795,-353 797,-376 539,-375",
    [
      "915,18 960,-65 1025,-46 1036,-8 980,55 923,47 915,18",
      "1108,-314 1109,-343 1233,-339 1257,-322 1256,-302 1203,-296 1183,-314 1108,-314",
    ],
  ),
  paddock(
    "creek",
    "Creek",
    87,
    "#6E9B5C",
    "-278,2003 -12,1979 198,1988 213,2009 219,2039 168,2056 157,2018 131,2008 4,2012 1,2598 27,2605 112,2465 142,2454 151,2357 174,2339 231,2343 231,2369 221,2388 162,2391 161,2487 228,2460 232,2397 369,2363 544,2263 614,2135 525,2135 520,618 508,606 2,624 -1,776 31,921 142,899 194,966 154,998 126,976 37,955 9,999 5,1035 208,1089 393,1245 391,1438 146,1438 48,1590 -113,1648 -255,1657 -275,1674 -278,2003",
  ),
  paddock(
    "back",
    "Back",
    65,
    "#E3C766",
    "-1206,-417 -1206,45 -1191,65 -1077,67 -1125,176 -1128,709 -529,661 -523,286 -539,269 -610,277 -666,154 -731,140 -731,91 -696,74 -524,61 -525,-393 -576,-410 -593,-326 -661,-317 -671,-220 -665,-101 -687,-241 -738,-323 -893,-406 -1066,-401 -1139,-360 -1139,-292 -1147,-320 -1144,-368 -1056,-412 -891,-412 -783,-367 -710,-311 -687,-327 -695,-428 -1193,-427 -1206,-417",
  ),
  paddock(
    "rocky",
    "Rocky",
    54,
    "#9B5B36",
    "-1227,-1091 -1224,-481 -1194,-431 -597,-428 -584,-473 -535,-495 -527,-1386 -545,-1396 -715,-1305 -893,-1277 -892,-1233 -972,-1152 -1227,-1091",
    [
      "-1092,-1107 -1081,-1114 -1052,-1084 -1035,-1019 -939,-980 -799,-825 -705,-664 -763,-650 -793,-662 -821,-711 -787,-735 -820,-810 -961,-962 -1056,-1010 -1092,-1107",
    ],
  ),
  paddock(
    "bore",
    "Bore",
    40,
    "#E8CC57",
    "529,-417 538,-375 1027,-376 1060,-415 1080,-406 1092,-377 1210,-377 1212,-429 1227,-440 1266,-379 1433,-377 1435,-633 1697,-637 1724,-721 1720,-737 1338,-854 1313,-825 1315,-715 1239,-720 1206,-772 1191,-843 1133,-877 1041,-855 897,-793 757,-766 733,-734 695,-725 668,-776 559,-833 540,-821 535,-656 574,-657 547,-624 542,-553 579,-527 592,-477 879,-564 1016,-580 1131,-563 1182,-657 1240,-698 1251,-683 1182,-635 1132,-548 1016,-564 880,-549 662,-495 529,-417",
  ),
  paddock(
    "triangle",
    "Triangle",
    30,
    "#4E8153",
    "109,-988 -235,-993 -265,-986 -285,-961 -244,-953 -229,-906 -138,-887 9,-784 2,-774 -49,-822 -153,-880 -219,-887 -230,-874 -225,-811 -162,-795 -183,-727 -173,-710 20,-666 42,-672 43,-686 26,-769 107,-737 113,-646 299,-604 477,-444 499,-445 542,-638 466,-674 389,-733 227,-739 190,-766 207,-805 271,-755 400,-739 473,-680 534,-655 543,-844 127,-1278 109,-1254 112,-1017 109,-988",
  ),
]

export const paddockById = (id: string) =>
  PADDOCKS.find((p) => p.id === id) ?? PADDOCKS[0]

/** Example pins, weighted towards what crews really drop. */
export const EXAMPLE_PINS: { at: XY; kind: PinKind; note?: string }[] = [
  { at: [260, 520], kind: "rock" },
  { at: [120, 380], kind: "rock" },
  { at: [-150, 420], kind: "rock" },
  { at: [150, -430], kind: "rock" },
  { at: [-960, 640], kind: "rock" },
  { at: [800, 200], kind: "tree" },
  { at: [-1380, 70], kind: "tree" },
  { at: [300, 138], kind: "gate" },
  { at: [-523, -90], kind: "gate" },
  { at: [-10, 122], kind: "gate" },
  { at: [-900, 880], kind: "powerTower" },
  { at: [-1320, -610], kind: "kangaroo" },
  { at: [-210, -520], kind: "wheelRuts", note: "Soft after rain" },
  { at: [345, 5], kind: "waterTank" },
  { at: [650, -1010], kind: "stump" },
  { at: [-478, 560], kind: "fieldBin", note: "Field bin" },
]

export type Stop = {
  at: XY
  pause?: number
  doing?: string
  /** The stretch arriving at this point is worked, so it gets painted. */
  work?: boolean
}

/**
 * Join working passes into one drive: each pass is worked, then the machine
 * lifts out and swings round on the headland to line up the next one.
 */
function passRoute(passes: XY[], from?: XY): Stop[] {
  const stops: Stop[] = from ? [{ at: from }] : []
  for (let i = 0; i + 1 < passes.length; i += 2) {
    const start = passes[i]
    const end = passes[i + 1]
    if (stops.length) {
      const last = stops[stops.length - 1].at
      const across = Math.hypot(start[0] - last[0], start[1] - last[1])
      const length = Math.hypot(end[0] - start[0], end[1] - start[1]) || 1
      // Only a neighbouring pass gets the tidy half-circle; a long hop is
      // driven straight.
      if (i > 0 && across < 120) {
        const out: XY = [
          (start[0] - end[0]) / length,
          (start[1] - end[1]) / length,
        ]
        const mid: XY = [(last[0] + start[0]) / 2, (last[1] + start[1]) / 2]
        const half: XY = [(start[0] - last[0]) / 2, (start[1] - last[1]) / 2]
        const r = across / 2
        for (let k = 1; k < 8; k++) {
          const a = (k / 8) * Math.PI
          stops.push({
            at: [
              mid[0] - Math.cos(a) * half[0] + Math.sin(a) * r * out[0],
              mid[1] - Math.cos(a) * half[1] + Math.sin(a) * r * out[1],
            ],
          })
        }
      }
    }
    stops.push({ at: start }, { at: end, work: true })
  }
  return stops
}

export type CrewSpec = {
  id: string
  name: string
  machine: MachineId
  colour: string
  /** Working a paddock up and back, or travelling a set run. */
  job:
    | { type: "work"; paddock: string; angle: number; startAt: number }
    | { type: "run"; stops: Stop[] }
}

export const CREW: CrewSpec[] = [
  {
    id: "mick",
    name: "Mick",
    machine: "sprayer",
    colour: "#2F62D6",
    job: { type: "work", paddock: "railway", angle: 90, startAt: 0.34 },
  },
  {
    id: "jess",
    name: "Jess",
    machine: "seeder",
    colour: "#1F8A4C",
    job: { type: "work", paddock: "dam", angle: 90, startAt: 0.22 },
  },
  {
    id: "tom",
    name: "Tom",
    machine: "truck",
    colour: "#F4F1E6",
    job: {
      type: "run",
      stops: [
        { at: [-531, -372], pause: 20, doing: "Waiting at the gate" },
        { at: [-531, 560], pause: 26, doing: "At the field bin" },
        { at: [-531, 1078], pause: 14, doing: "Turning round" },
        { at: [-531, 560] },
      ],
    },
  },
  {
    id: "bec",
    name: "Bec",
    machine: "ute",
    colour: "#1A9BC2",
    job: {
      type: "run",
      stops: [
        { at: [318, 40], pause: 24, doing: "At the house" },
        { at: [300, 138] },
        { at: [260, 520], pause: 12, doing: "Picking rocks" },
        { at: [120, 380], pause: 12, doing: "Picking rocks" },
        { at: [-150, 420], pause: 12, doing: "Picking rocks" },
        { at: [120, 250] },
        { at: [300, 138] },
      ],
    },
  },
]

/** A machine following a line: steady work, or a run with stops. */
export class Runner {
  readonly track: Track
  private pauseAt: Map<number, Stop>
  private work: boolean[]
  private waiting = 0
  private waitedAt = -1
  dist = 0
  laps = 0
  doing = ""

  constructor(
    stops: Stop[],
    /** Metres per second. */
    readonly speed: number,
    readonly loop: boolean,
  ) {
    const points = stops.map((s) => s.at)
    if (loop) points.push(stops[0].at)
    this.track = new Track(points)
    this.work = stops.map((s) => s.work === true)
    this.pauseAt = new Map()
    stops.forEach((s, i) => {
      if (s.pause) this.pauseAt.set(i, s)
    })
  }

  get moving() {
    return this.waiting <= 0 && !this.finished
  }
  get finished() {
    return !this.loop && this.dist >= this.track.length
  }

  step(dt: number) {
    if (this.waiting > 0) {
      this.waiting -= dt
      return
    }
    if (this.finished) return
    const before = this.track.segmentAt(this.dist)
    let next = this.dist + this.speed * dt
    // Stop at the next corner if someone is meant to pause there.
    const corner = this.track.cum[before]
    const stop = this.pauseAt.get(before % (this.track.points.length - 1))
    if (next >= corner && stop && this.waitedAt !== before) {
      next = corner
      this.waiting = stop.pause ?? 0
      this.waitedAt = before
      this.doing = stop.doing ?? ""
    }
    if (next >= this.track.length && this.loop) {
      next -= this.track.length
      this.laps += 1
      this.waitedAt = -1
    }
    this.dist = next
  }

  get position() {
    return this.track.at(this.dist)
  }

  /** On a worked stretch right now (not turning or travelling). */
  get working() {
    return !this.finished && this.work[this.track.segmentAt(this.dist)] === true
  }

  /** The worked stretches covered so far, as separate lines. */
  painted(): XY[][] {
    const current = this.track.segmentAt(this.dist)
    const lines: XY[][] = []
    let open: XY[] | null = null
    for (let i = 1; i <= current; i++) {
      if (!this.work[i]) {
        open = null
        continue
      }
      if (!open) {
        open = [this.track.points[i - 1]]
        lines.push(open)
      }
      open.push(i === current ? this.position.xy : this.track.points[i])
    }
    return lines
  }
}

/** The line a crew member follows, built from their job. */
export function crewRunner(spec: CrewSpec): Runner {
  const { swath, speed } = MACHINE_SPECS[spec.machine]
  const mps = speed / 3.6
  if (spec.job.type === "run") {
    const runner = new Runner(spec.job.stops, mps, true)
    return runner
  }
  const field = paddockById(spec.job.paddock)
  // Passes sit a touch closer than the working width, so neighbouring passes
  // overlap by a sliver and show the darker strip a real job leaves.
  const passes = workingPasses(field.rings, swath * 0.95, spec.job.angle)
  const runner = new Runner(passRoute(passes), mps, false)
  runner.dist = runner.track.length * spec.job.startAt
  return runner
}

/**
 * The viewer's own example drive, starting from where they are (the origin).
 * A field machine works the home paddock; a road vehicle does a lap of the
 * lane.
 */
export function exampleDrive(machine: MachineId, from: XY = [0, 0]): Runner {
  const { swath, speed } = MACHINE_SPECS[machine]
  const mps = speed / 3.6
  if (swath > 0) {
    const passes = workingPasses(paddockById("home").rings, swath * 0.95, 0)
    // Start with the pass nearest the viewer rather than the far fence.
    let nearest = 0
    let best = Infinity
    for (let i = 0; i < passes.length; i += 2) {
      const d = Math.hypot(passes[i][0] - from[0], passes[i][1] - from[1])
      if (d < best) {
        best = d
        nearest = i
      }
    }
    const ordered = passes.slice(nearest)
    return new Runner(passRoute(ordered, from), mps, false)
  }
  const lap: XY[] = [
    from,
    [-260, -40],
    [-523, -90],
    [-531, -90],
    [-531, 560],
    [-531, 1078],
    [-531, -372],
    [-531, -90],
    [-523, -90],
    [-260, -40],
  ]
  return new Runner(
    lap.map((at) => ({ at })),
    mps,
    true,
  )
}
