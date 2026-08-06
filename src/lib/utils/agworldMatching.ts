// Predictive matching: AgSKAN trail records ↔ Agworld activities.
//
// Signals (weighted):
//   - Timing (0.50): trail window vs actual started/completed, or plan/work-order due date
//   - Vehicle / job type (0.25): inferred category from vehicle_type + swath_width
//     vs activity operation_type_name / name (+ common job-name keywords)
//   - Field coverage (0.25): cluster area vs field area
//
// Trail clustering: records within CLUSTER_GAP of each other merge into one "job".

export const CLUSTER_GAP_MS = 5 * 24 * 60 * 60 * 1000 // merge records ≤5 days apart
const TIME_DECAY_ACTUAL_MS = 3 * 24 * 60 * 60 * 1000 // 3 days
const TIME_DECAY_PLAN_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
// Minimum pair score for an activity to be assignable to a cluster in the
// exclusive assignment (below this it's treated as "no nearby trail").
const ASSIGN_THRESHOLD = 0.25

export interface TrailCluster {
  records: any[]
  start: number // epoch ms
  end: number
  midpoint: number
  areaHa: number
  distanceKm: number
  vehicles: string[]
  operators: string[]
  swathWidths: number[]
}

export function clusterTrailRecords(records: any[]): TrailCluster[] {
  const sorted = [...records].sort(
    (a, b) =>
      new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
  )
  const clusters: TrailCluster[] = []
  for (const r of sorted) {
    const start = new Date(r.start_time).getTime()
    const end = new Date(r.end_time || r.start_time).getTime()
    const area = parseFloat(r.area_hectares || 0) || 0
    const dist = parseFloat(r.distance_km || 0) || 0
    const last = clusters[clusters.length - 1]
    if (last && start - last.end <= CLUSTER_GAP_MS) {
      last.records.push(r)
      last.end = Math.max(last.end, end)
      last.midpoint = (last.start + last.end) / 2
      last.areaHa += area
      last.distanceKm += dist
      if (r.vehicle_type) last.vehicles.push(r.vehicle_type)
      if (r.operator_name) last.operators.push(r.operator_name)
      const sw = parseFloat(r.swath_width)
      if (!isNaN(sw) && sw > 0) last.swathWidths.push(sw)
    } else {
      const sw = parseFloat(r.swath_width)
      clusters.push({
        records: [r],
        start,
        end,
        midpoint: (start + end) / 2,
        areaHa: area,
        distanceKm: dist,
        vehicles: r.vehicle_type ? [r.vehicle_type] : [],
        operators: r.operator_name ? [r.operator_name] : [],
        swathWidths: !isNaN(sw) && sw > 0 ? [sw] : [],
      })
    }
  }
  return clusters
}

// Infer job category from a trail record's vehicle type + swath width.
// Sprayers/boomsprays are usually 24–40m; seeders/airseeders 10–16m.
export function inferTrailJobCategory(
  vehicleType?: string,
  swathWidth?: number,
): string {
  const v = (vehicleType || "").toLowerCase()
  const s = swathWidth || 0
  if (/(boom|spray)/.test(v)) return "spray"
  if (/(seed|air.?seeder|sower|planter|bar)/.test(v)) return "seed"
  if (/(spreader|fert|top.?dress)/.test(v)) return "spread"
  if (/(chaser|truck|header|harvest|combine|cart)/.test(v)) return "harvest"
  if (/(cultivat|disc|plough|till|roller|scrub|harrow)/.test(v))
    return "tillage"
  if (/(mow|slasher|windrow|baler)/.test(v)) return "hay"
  // Swath-width heuristic fallback
  if (s >= 18) return "spray"
  if (s > 0 && s <= 16) return "seed"
  return "unknown"
}

export function inferActivityCategory(activity: any): string {
  const attrs = activity?.attributes || {}
  const name = `${attrs.operation_type_name || ""} ${attrs.name || ""}`
    .toLowerCase()
  // Spraying: chemicals + common farm job names for knockdown/burndown/pass work
  if (
    /(spray|herbicide|insecticide|fungicide|pesticide|chemical|knockdown|knock down|burndown|burn down|burnoff|burn off|pre[- ]?emergent|post[- ]?emergent|desiccat|fallow|pass)/.test(
      name,
    )
  )
    return "spray"
  if (/(seed|sow|plant|direct drill|airseeder|drill)/.test(name)) return "seed"
  if (/(fertil|spread|top ?dress|lime|urea)/.test(name)) return "spread"
  if (/(harvest|header|windrow|swath|chaser|cart)/.test(name))
    return "harvest"
  if (/(cultivat|till|disc|plough|plow|roller|harrow|scrub|chisel|scarif|ridge)/.test(name))
    return "tillage"
  if (/(mow|slash|bale|hay|silage)/.test(name)) return "hay"
  return "unknown"
}

// Absolute time gap between a trail cluster and an activity window/due date:
//   0 = windows overlap, >0 = ms apart, null = activity has no timing info.
// Handles BOTH directions (trail before OR after the activity window).
function timingGapMs(
  cluster: TrailCluster,
  activity: any,
  type: string,
): number | null {
  const a = activity?.attributes || {}
  if (type === "actual") {
    const s = a.started_at || a.start_time
    if (!s) return null
    const e = a.completed_at || a.end_time || s
    const aStart = new Date(s).getTime()
    const aEnd = new Date(e).getTime()
    const overlap = Math.min(cluster.end, aEnd) - Math.max(cluster.start, aStart)
    if (overlap > 0) return 0
    return Math.max(
      0,
      cluster.end < aStart ? aStart - cluster.end : cluster.start - aEnd,
    )
  }
  const due =
    a.due_at || a.due_date || a.planned_date || a.planned_at || a.start_date
  if (!due) return null
  return Math.max(0, Math.abs(cluster.midpoint - new Date(due).getTime()))
}

function timingDetails(
  cluster: TrailCluster,
  activity: any,
  type: string,
  gapMs: number | null,
  range: { min: number; max: number } | undefined,
): { score: number; details: Record<string, string> } {
  const a = activity?.attributes || {}
  const fmt = (t: number) =>
    new Date(t).toLocaleString("en-AU", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    })
  if (gapMs === null) return { score: 0.5, details: { "Activity timing": "none" } }
  const decay = type === "actual" ? TIME_DECAY_ACTUAL_MS : TIME_DECAY_PLAN_MS
  // Absolute: how far from the activity's window (0 = directly over it)
  const absScore = gapMs === 0 ? 1 : Math.max(0, 1 - gapMs / decay)
  // Relative: where this cluster sits vs the CLOSEST cluster for this activity
  // (closest competing cluster → 1.0, farthest competing cluster → 0.0)
  const hasCompetition = !!(range && range.max > range.min)
  const relScore = hasCompetition
    ? Math.max(0, 1 - (gapMs - range.min) / (range.max - range.min))
    : 1
  // With competing clusters, blend absolute proximity + relative rank (the
  // closest cluster wins the timing component). With a single candidate,
  // fall back to pure absolute proximity so a far-away lone cluster scores low.
  const score = hasCompetition
    ? Math.max(0, Math.min(1, absScore * 0.4 + relScore * 0.6))
    : absScore
  const gapH = gapMs / 3600000
  const common: Record<string, string> = {
    Gap: `${gapH.toFixed(1)} h`,
    "Abs score": `${Math.round(absScore * 100)}%`,
    "Rel score": `${Math.round(relScore * 100)}%`,
    "Closest gap": range ? `${(range.min / 3600000).toFixed(1)} h` : "—",
  }
  if (type === "actual") {
    const s = a.started_at || a.start_time
    const e = a.completed_at || a.end_time || s
    const aStart = new Date(s).getTime()
    const aEnd = new Date(e).getTime()
    return {
      score,
      details: {
        "Trail window": `${fmt(cluster.start)} – ${fmt(cluster.end)}`,
        "Actual window": `${fmt(aStart)} – ${fmt(aEnd)}`,
        Overlap: gapMs === 0 ? "yes" : "none",
        ...common,
        "Decay (actual)": `${decay / 3600000} h`,
      },
    }
  }
  const due =
    a.due_at || a.due_date || a.planned_date || a.planned_at || a.start_date
  return {
    score,
    details: {
      "Trail midpoint": fmt(cluster.midpoint),
      "Due date": new Date(due).toLocaleDateString("en-AU", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
      ...common,
      "Decay (plan)": `${decay / 3600000} h`,
    },
  }
}

function vehicleDetails(
  cluster: TrailCluster,
  activity: any,
): { score: number; details: Record<string, string> } {
  const swaths = cluster.swathWidths
  const swath = swaths.length
    ? swaths.reduce((a, b) => a + b, 0) / swaths.length
    : 0
  const cat = inferTrailJobCategory(cluster.vehicles[0] || "", swath)
  const aCat = inferActivityCategory(activity)
  const a = activity?.attributes || {}
  const score =
    cat === "unknown" || aCat === "unknown" ? 0.3 : cat === aCat ? 1 : 0
  return {
    score,
    details: {
      "Trail vehicle": cluster.vehicles[0] || "—",
      "Swath (avg)": swath ? `${swath} m` : "—",
      "Trail category": cat,
      Activity: a.operation_type_name || a.name || "—",
      "Activity category": aCat,
    },
  }
}

function coverageDetails(
  cluster: TrailCluster,
  fieldAreaHa: number,
): { score: number; details: Record<string, string> } {
  const clusterHa = Math.round(cluster.areaHa * 100) / 100
  if (!fieldAreaHa || fieldAreaHa <= 0)
    return {
      score: 0.5,
      details: {
        "Cluster area": `${clusterHa} ha`,
        "Field area": "unknown",
        Ratio: "—",
      },
    }
  const ratio = Math.min(1, cluster.areaHa / fieldAreaHa)
  const score = ratio >= 0.7 ? 1 : ratio >= 0.3 ? 0.6 : 0.2
  return {
    score,
    details: {
      "Cluster area": `${clusterHa} ha`,
      "Field area": `${Math.round(fieldAreaHa * 100) / 100} ha`,
      Ratio: `${Math.round(ratio * 100)}%`,
    },
  }
}

export interface MatchBreakdown {
  timing: { score: number; weight: number; details: Record<string, string> }
  vehicle: { score: number; weight: number; details: Record<string, string> }
  coverage: { score: number; weight: number; details: Record<string, string> }
}

export interface MatchSuggestion {
  cluster: TrailCluster
  activity: any | null
  type: "actual" | "plan" | "work_order" | null
  score: number
  confidence: "high" | "medium" | "low" | "none"
  signals: { timing: boolean; vehicle: boolean; coverage: boolean }
  breakdown: MatchBreakdown | null
}

type ActivityList = { activity: any; type: "actual" | "plan" | "work_order" }[]

function buildActivityList(
  activities: {
    actuals?: any[]
    plans?: any[]
    workOrders?: any[]
  } | null | undefined,
): ActivityList {
  return [
    ...(activities?.actuals || []).map((a) => ({
      activity: a,
      type: "actual" as const,
    })),
    ...(activities?.plans || []).map((a) => ({
      activity: a,
      type: "plan" as const,
    })),
    ...(activities?.workOrders || []).map((a) => ({
      activity: a,
      type: "work_order" as const,
    })),
  ]
}

interface PairScore {
  score: number
  signals: { timing: boolean; vehicle: boolean; coverage: boolean }
  breakdown: MatchBreakdown
}

// Score every (cluster, activity) pair. Timing is scored RELATIVE to the other
// clusters competing for the same activity (closest cluster wins).
function scorePairs(
  clusters: TrailCluster[],
  all: ActivityList,
  fieldAreaHa: number,
): PairScore[][] {
  const pairGaps: (number | null)[][] = clusters.map((cluster) =>
    all.map(({ activity, type }) => timingGapMs(cluster, activity, type)),
  )
  const ranges = new Map<any, { min: number; max: number }>()
  all.forEach(({ activity }, ai) => {
    let min = Infinity
    let max = -1
    for (let ci = 0; ci < clusters.length; ci++) {
      const g = pairGaps[ci][ai]
      if (g === null) continue
      if (g < min) min = g
      if (g > max) max = g
    }
    ranges.set(activity, {
      min: min === Infinity ? 0 : min,
      max: max === -1 ? 0 : max,
    })
  })
  return clusters.map((cluster, ci) =>
    all.map(({ activity, type }, ai) => {
      const time = timingDetails(
        cluster,
        activity,
        type,
        pairGaps[ci][ai],
        ranges.get(activity),
      )
      const vehicle = vehicleDetails(cluster, activity)
      const coverage = coverageDetails(cluster, fieldAreaHa)
      return {
        score: time.score * 0.5 + vehicle.score * 0.25 + coverage.score * 0.25,
        signals: {
          timing: time.score >= 0.6,
          vehicle: vehicle.score === 1,
          coverage: coverage.score >= 0.6,
        },
        breakdown: {
          timing: { score: time.score, weight: 0.5, details: time.details },
          vehicle: { score: vehicle.score, weight: 0.25, details: vehicle.details },
          coverage: { score: coverage.score, weight: 0.25, details: coverage.details },
        },
      }
    }),
  )
}

export function suggestMatches(
  records: any[],
  activities: { actuals?: any[]; plans?: any[]; workOrders?: any[] } | null | undefined,
  fieldAreaHa: number,
): MatchSuggestion[] {
  const clusters = clusterTrailRecords(records)
  const all = buildActivityList(activities)
  const matrix = scorePairs(clusters, all, fieldAreaHa)
  return clusters.map((cluster, ci) => {
    let best: {
      score: number
      activity: any
      type: "actual" | "plan" | "work_order"
      signals: { timing: boolean; vehicle: boolean; coverage: boolean }
      breakdown: MatchBreakdown | null
    } | null = null
    for (let ai = 0; ai < all.length; ai++) {
      const p = matrix[ci][ai]
      if (!best || p.score > best.score) {
        best = {
          score: p.score,
          activity: all[ai].activity,
          type: all[ai].type,
          signals: p.signals,
          breakdown: p.breakdown,
        }
      }
    }
    const score = best?.score || 0
    const confidence: MatchSuggestion["confidence"] =
      !best || score < 0.25
        ? "none"
        : score >= 0.6
          ? "high"
          : score >= 0.4
            ? "medium"
            : "low"
    return {
      cluster,
      activity: best?.activity || null,
      type: best?.type || null,
      score,
      confidence,
      signals: best?.signals || { timing: false, vehicle: false, coverage: false },
      breakdown: best?.breakdown || null,
    }
  })
}

export interface ActivityAssignment {
  label: string
  type: "actual" | "plan" | "work_order"
  activity: any
  plan: any | null
  actual: any | null
  status: string
  cluster: TrailCluster | null
  clusterIdx: number | null
  score: number
  confidence: "high" | "medium" | "low" | "none"
  signals: { timing: boolean; vehicle: boolean; coverage: boolean }
}

// Pair plans → actuals (converted parent_id when known, else name matching).
function pairActivities(
  plans: any[],
  actuals: any[],
  convertedIds?: Set<string>,
): {
  pairs: { plan: any; actual: any }[]
  unmatchedActuals: any[]
  pendingPlans: any[]
} {
  const getName = (r: any) =>
    ((r.attributes?.name || r.attributes?.operation_type_name || "") as string)
      .trim()
      .toLowerCase()
  const converted = convertedIds || new Set<string>()
  const pairs: { plan: any; actual: any }[] = []
  const matchedActualIds = new Set<string>()
  for (const plan of plans) {
    const pn = getName(plan)
    if (!pn) continue
    let actual = actuals.find((a) => converted.has(a.id) && getName(a) === pn)
    if (!actual && converted.size === 0) {
      actual = actuals.find(
        (a) => getName(a) === pn && !matchedActualIds.has(a.id),
      )
    }
    if (actual) {
      pairs.push({ plan, actual })
      matchedActualIds.add(actual.id)
    }
  }
  const unmatchedActuals = actuals.filter((a) => !matchedActualIds.has(a.id))
  const pendingPlans = plans.filter((p) => !pairs.some((pr) => pr.plan === p))
  return { pairs, unmatchedActuals, pendingPlans }
}

// Maximum-weight bipartite assignment (Hungarian / Kuhn–Munkres) on a
// rectangular score matrix: each row (activity unit) is assigned to a DISTINCT
// column (trail cluster), maximizing the total score. Returns, per row, the
// assigned column index or -1 if unmatched. Ineligible pairs (score < threshold)
// are treated as forbidden; dummy rows/columns let rows/columns stay unused.
function maxWeightAssignment(score: (number | null)[][]): number[] {
  const n = score.length
  if (n === 0) return []
  const m = score[0].length
  const size = n + m // add one dummy column per row + one dummy row per column
  const M = 1e9
  const cost: number[][] = []
  for (let i = 0; i < size; i++) {
    cost.push([])
    for (let j = 0; j < size; j++) {
      if (i < n && j < m) {
        cost[i].push(score[i][j] === null ? M : -score[i][j])
      } else {
        cost[i].push(0)
      }
    }
  }
  // Hungarian min-cost perfect matching on the square cost matrix
  const u = new Array(size + 1).fill(0)
  const v = new Array(size + 1).fill(0)
  const p = new Array(size + 1).fill(0)
  const way = new Array(size + 1).fill(0)
  for (let i = 1; i <= size; i++) {
    p[0] = i
    let j0 = 0
    const minv = new Array(size + 1).fill(Infinity)
    const used = new Array(size + 1).fill(false)
    do {
      used[j0] = true
      const i0 = p[j0]
      let delta = Infinity
      let j1 = 0
      for (let j = 1; j <= size; j++) {
        if (used[j]) continue
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j]
        if (cur < minv[j]) {
          minv[j] = cur
          way[j] = j0
        }
        if (minv[j] < delta) {
          delta = minv[j]
          j1 = j
        }
      }
      for (let j = 0; j <= size; j++) {
        if (used[j]) {
          u[p[j]] += delta
          v[j] -= delta
        } else {
          minv[j] -= delta
        }
      }
      j0 = j1
    } while (p[j0] !== 0)
    do {
      const j1 = way[j0]
      p[j0] = p[j1]
      j0 = j1
    } while (j0 !== 0)
  }
  const ans = new Array(n).fill(-1)
  for (let j = 1; j <= size; j++) {
    if (p[j] > 0 && p[j] <= n && j <= m) ans[p[j] - 1] = j - 1
  }
  return ans
}

// Activity-centric view: for EVERY Agworld activity (plan → actual pairs,
// standalone actuals, pending plans, work orders) show the trail cluster the
// algorithm would assign it to, with confidence — i.e. what the matcher would
// do if it had to assign the trails.
export function suggestActivityAssignments(
  records: any[],
  activities: {
    actuals?: any[]
    plans?: any[]
    workOrders?: any[]
    _convertedActualIds?: Set<string>
  } | null | undefined,
  fieldAreaHa: number,
): ActivityAssignment[] {
  const clusters = clusterTrailRecords(records)
  const actuals = activities?.actuals || []
  const plans = activities?.plans || []
  const workOrders = activities?.workOrders || []
  const all = buildActivityList(activities)
  const matrix = scorePairs(clusters, all, fieldAreaHa)
  const colOf = new Map<any, number>()
  all.forEach((u, i) => colOf.set(u.activity, i))

  const nameOf = (r: any) =>
    ((r.attributes?.name || r.attributes?.operation_type_name || "") as string).trim()
  const { pairs, unmatchedActuals, pendingPlans } = pairActivities(
    plans,
    actuals,
    activities?._convertedActualIds,
  )

  const units: {
    label: string
    type: "actual" | "plan" | "work_order"
    activity: any
    plan: any | null
    actual: any | null
    status: string
  }[] = []
  for (const pr of pairs) {
    units.push({
      label: nameOf(pr.plan) || nameOf(pr.actual),
      type: "actual",
      activity: pr.actual,
      plan: pr.plan,
      actual: pr.actual,
      status: pr.plan.attributes?.status || "",
    })
  }
  for (const a of unmatchedActuals)
    units.push({
      label: nameOf(a),
      type: "actual",
      activity: a,
      plan: null,
      actual: a,
      status: "",
    })
  for (const p of pendingPlans)
    units.push({
      label: nameOf(p),
      type: "plan",
      activity: p,
      plan: p,
      actual: null,
      status: p.attributes?.status || "",
    })
  for (const w of workOrders)
    units.push({
      label: nameOf(w),
      type: "work_order",
      activity: w,
      plan: null,
      actual: null,
      status: w.attributes?.status || "",
    })

  // Solve the ASSIGNMENT problem: each activity unit is assigned to a DISTINCT
  // trail cluster, maximizing the TOTAL score — i.e. what we'd do if we had to
  // assign every activity to a cluster. Below-threshold pairs are ineligible.
  const scored: {
    unit: (typeof units)[0]
    col: number
    row: (number | null)[]
  }[] = []
  for (const u of units) {
    const col = colOf.get(u.activity)
    if (col === undefined) continue
    scored.push({
      unit: u,
      col,
      row: clusters.map((_, ci) => {
        const s = matrix[ci][col].score
        return s >= ASSIGN_THRESHOLD ? s : null
      }),
    })
  }
  const assignedClusters = maxWeightAssignment(scored.map((s) => s.row))

  const out: ActivityAssignment[] = []
  for (let i = 0; i < scored.length; i++) {
    const { unit: u, col } = scored[i]
    const ci = assignedClusters[i]
    const p = ci >= 0 ? matrix[ci][col] : null
    const score = p?.score || 0
    const confidence: ActivityAssignment["confidence"] =
      !p || score < 0.25
        ? "none"
        : score >= 0.6
          ? "high"
          : score >= 0.4
            ? "medium"
            : "low"
    out.push({
      label: u.label,
      type: u.type,
      activity: u.activity,
      plan: u.plan,
      actual: u.actual,
      status: u.status,
      cluster: ci >= 0 ? clusters[ci] : null,
      clusterIdx: ci >= 0 ? ci : null,
      score,
      confidence,
      signals: p?.signals || {
        timing: false,
        vehicle: false,
        coverage: false,
      },
    })
  }
  // Order chronologically: by the assigned trail cluster's start date, or for
  // unmatched activities by their own timing (actual window / plan due date).
  const anchor = (a: ActivityAssignment): number => {
    if (a.cluster) return a.cluster.start
    const attrs = a.activity?.attributes || {}
    if (a.type === "actual") {
      const s = attrs.started_at || attrs.start_time
      if (s) return new Date(s).getTime()
    } else {
      const due =
        attrs.due_at ||
        attrs.due_date ||
        attrs.planned_date ||
        attrs.planned_at ||
        attrs.start_date
      if (due) return new Date(due).getTime()
    }
    return 0
  }
  return out.sort((a, b) => anchor(a) - anchor(b))
}
