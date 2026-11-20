/**
 * Looking a recorded trail over for GPS that can't be right.
 *
 * A trail's detail is a point every couple of seconds with the time it was
 * laid. Now and then a phone loses its fix and reports somewhere else
 * altogether (the last place it had a network position, kilometres off) for
 * a few seconds, goes quiet, and comes back where the machine really is.
 * Drawn as it was recorded that is a straight line across the district and
 * back, and it is counted in the trail's distance and hectares.
 *
 * What gives it away, with nothing but the points:
 *  - a step no farm machine could take: hundreds of metres at well over
 *    road speed (the one this was written from was 7.3 km in 2 seconds);
 *  - the trail going quiet for a minute or more and turning up somewhere
 *    else, with only a short burst of points in between.
 *
 * So the trail is cut into runs wherever it breaks in one of those two
 * ways, and a short run cut off from the rest is called a stray. Taking the
 * strays out (and not joining across where they were, since nothing was
 * recorded there) is the fix. Everything here is pure: the engine decides
 * what to do with it.
 */
import { distanceM, type LngLat } from "$lib/components/mapnext/geo"
import type { TrailPoint } from "./liveData"

/** Over this, across more than `FAR_STEP` metres, is not a machine moving. */
const TOO_FAST_KMH = 60
const FAR_STEP = 200
/** Faster than anything on a farm, whatever the gap: a jump, not a drive. */
const IMPOSSIBLE_KMH = 150
/** Quiet for this long and back this far away: lost, and found elsewhere. */
const QUIET_MS = 60_000
const QUIET_STEP = 500
/** A run cut off from the rest is a stray only if it is this short. */
const STRAY_MS = 180_000
const STRAY_POINTS = 120

type Break = {
  /** Metres and milliseconds between the two points either side. */
  metres: number
  ms: number
  /** No machine could have done it. */
  impossible: boolean
}

export type Stray = {
  /** When it starts and ends (ms), and how many points it is. */
  start: number
  end: number
  points: number
  /** How far it is from where the trail was just before it, in metres. */
  away: number
}

export type TrailCheck = {
  strays: Stray[]
  /** Places the trail jumps with no stray between (it carries on there). */
  jumps: number
  /** Metres of the trail that are jumps rather than driving. */
  jumpM: number
  /** Metres recorded in all, and what is left without the jumps. */
  totalM: number
  keptM: number
  /** The fastest single jump: metres, the seconds it took, and when. */
  worst: { metres: number; seconds: number; at: number } | null
  /** The trail without its strays, as the lines to draw. */
  kept: LngLat[][]
}

function breakAt(a: TrailPoint, b: TrailPoint): Break | null {
  const metres = distanceM(a.at, b.at)
  const ms = b.t - a.t
  // (Points out of order, or two at one instant: any distance is a jump.)
  const kmh = ms > 0 ? (metres / (ms / 1000)) * 3.6 : Infinity
  const tooFast = metres > FAR_STEP && kmh > TOO_FAST_KMH
  const lost = metres > QUIET_STEP && ms > QUIET_MS
  if (!tooFast && !lost) return null
  return { metres, ms, impossible: metres > FAR_STEP && kmh > IMPOSSIBLE_KMH }
}

/**
 * Check a trail's timed points (one array per recorded line). Null when
 * there is nothing wrong with it, or nothing to go on.
 */
export function checkTrail(parts: TrailPoint[][]): TrailCheck | null {
  const strays: Stray[] = []
  const kept: LngLat[][] = []
  let jumps = 0
  let jumpM = 0
  let totalM = 0
  let keptM = 0
  let worst: TrailCheck["worst"] = null
  let worstPace = -1

  for (const points of parts) {
    if (points.length < 2) continue
    if (points.some((p) => !(p.t > 1e11 && p.t < 1e14))) return null

    // Cut into runs at every break.
    type Run = { from: number; to: number; before: Break | null }
    const runs: Run[] = [{ from: 0, to: 0, before: null }]
    for (let i = 1; i < points.length; i++) {
      const step = distanceM(points[i - 1].at, points[i].at)
      totalM += step
      const cut = breakAt(points[i - 1], points[i])
      if (cut) runs.push({ from: i, to: i, before: cut })
      else runs[runs.length - 1].to = i
    }
    if (runs.length === 1) {
      kept.push(points.map((p) => p.at))
      keptM += totalOf(points, 0, points.length - 1)
      continue
    }

    // A short run with a break either side is a stray; at either end of
    // the trail it has to have got there by a jump no machine could make.
    const stray = runs.map((run, index) => {
      const after = runs[index + 1]?.before ?? null
      const short =
        points[run.to].t - points[run.from].t < STRAY_MS &&
        run.to - run.from + 1 < STRAY_POINTS
      if (!short) return false
      if (run.before && after) return true
      return !!(run.before ?? after)?.impossible
    })

    let line: LngLat[] = []
    let last = -1
    runs.forEach((run, index) => {
      if (stray[index]) {
        const anchor = run.before ? points[run.from - 1] : points[run.to + 1]
        strays.push({
          start: points[run.from].t,
          end: points[run.to].t,
          points: run.to - run.from + 1,
          away: anchor ? distanceM(anchor.at, points[run.from].at) : 0,
        })
        return
      }
      // Carry straight on from the last run kept only if nothing was taken
      // out between them and the step between them could have been driven.
      const joins = last === index - 1 && !!run.before && !run.before.impossible
      if (!joins && line.length) {
        kept.push(line)
        line = []
      }
      if (joins && run.before) keptM += run.before.metres
      else if (run.before && last === index - 1) jumps += 1
      for (let i = run.from; i <= run.to; i++) line.push(points[i].at)
      keptM += totalOf(points, run.from, run.to)
      last = index
    })
    if (line.length) kept.push(line)

    for (const run of runs) {
      const cut = run.before
      if (!cut) continue
      // (The one that says most is the fastest, not the longest: the way
      // out is often seconds, the way back minutes.)
      const pace = cut.ms > 0 ? cut.metres / cut.ms : Infinity
      if (pace > worstPace) {
        worstPace = pace
        worst = {
          metres: cut.metres,
          seconds: Math.max(0, cut.ms / 1000),
          at: points[run.from].t,
        }
      }
    }
  }

  jumpM = Math.max(0, totalM - keptM)
  if (!strays.length && !jumps) return null
  return { strays, jumps, jumpM, totalM, keptM, worst, kept }
}

function totalOf(points: TrailPoint[], from: number, to: number) {
  let metres = 0
  for (let i = from + 1; i <= to; i++)
    metres += distanceM(points[i - 1].at, points[i].at)
  return metres
}
