// src/lib/utils/fieldTrailTimeline.ts
// The field trail overlay's time filter and per-record derived data: trail
// colours, the date-range slider, filtering/sorting records, the operation
// picker, and which Agworld activity each record was matched to.

import type { MatchSuggestion } from "./agworldMatching"
import {
  activityTypeLabel,
  matchActivityName,
  recordKey,
} from "./fieldTrailFormat"

/* eslint-disable @typescript-eslint/no-explicit-any -- spray records are untyped rows */

const DAY_MS = 86400000

/**
 * High-contrast palette for satellite imagery — 12 colours, enough for most
 * field views without adjacent duplicates.
 */
export const TRAIL_COLORS = [
  "#ef4444",
  "#3b82f6",
  "#22c55e",
  "#f97316",
  "#a855f7",
  "#06b6d4",
  "#eab308",
  "#ec4899",
  "#84cc16",
  "#f43f5e",
  "#8b5cf6",
  "#14b8a6",
]

/**
 * Deterministic colour: the record id is hashed to a stable index, so the
 * same record keeps its colour across sort and filter changes. Records
 * without an id fall back to their position. Locked mode (single record
 * preview) is always red to match thumbnails.
 */
export function getTrailColor(
  record: any,
  idx: number,
  lockedMode = false,
): string {
  if (lockedMode) return "#ef4444"
  if (record.id) {
    let hash = 0
    const s = String(record.id)
    for (let i = 0; i < s.length; i++)
      hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0
    return TRAIL_COLORS[Math.abs(hash) % TRAIL_COLORS.length]
  }
  return TRAIL_COLORS[idx % TRAIL_COLORS.length]
}

export const startMs = (r: any): number => new Date(r.start_time).getTime()

/** Length of each range-picker period. */
export const RANGE_SPANS: Record<string, number> = {
  "1d": DAY_MS,
  "7d": 7 * DAY_MS,
  "30d": 30 * DAY_MS,
  "3m": 90 * DAY_MS,
  "1y": 365 * DAY_MS,
}

/** Records' start times, ascending. */
export function sortedRecordTimes(records: any[]): number[] {
  return records.map(startMs).sort((a, b) => a - b)
}

/**
 * The first range (7d → 30d → 3m → 1y → all) that shows at least one record,
 * so the overlay doesn't open on an empty map.
 */
export function initialRangeMode(recordTimes: number[], now: number): string {
  for (const mode of ["7d", "30d", "3m", "1y"]) {
    if (recordTimes.some((t) => t >= now - RANGE_SPANS[mode])) return mode
  }
  return "all"
}

/**
 * Slider bounds for a range mode. "all" (and locked mode) spans the records;
 * a period ends now, clamped to a day either side of the records.
 */
export function sliderBounds(opts: {
  rangeMode: string
  lockedMode: boolean
  timeMin: number
  timeMax: number
  now: number
}): { min: number; max: number } {
  const { rangeMode, timeMin, timeMax, now } = opts
  if (rangeMode === "all" || opts.lockedMode) {
    return { min: timeMin, max: timeMax }
  }
  const span = RANGE_SPANS[rangeMode] || RANGE_SPANS["7d"]
  return {
    min: Math.max(now - span, timeMin - DAY_MS),
    max: Math.min(now, timeMax + DAY_MS),
  }
}

/** Position of `t` along [min, max] as a 0–100 percentage (clamped). */
export function timeToPct(t: number, min: number, max: number): number {
  if (max <= min) return 0
  return Math.max(0, Math.min(100, ((t - min) / (max - min)) * 100))
}

/** Minimum gap between the two slider handles (1 hour). */
export const SLIDER_MIN_GAP = 3600000

/** Keep the start handle at least SLIDER_MIN_GAP before the end handle. */
export function clampSliderStart(value: number, end: number): number {
  return Math.min(value, end - SLIDER_MIN_GAP)
}

/** Keep the end handle at least SLIDER_MIN_GAP after the start handle. */
export function clampSliderEnd(value: number, start: number): number {
  return Math.max(value, start + SLIDER_MIN_GAP)
}

/** Records starting within [start, end], optionally for one operation. */
export function filterRecords(
  records: any[],
  start: number,
  end: number,
  operationId = "",
): any[] {
  return records.filter((r) => {
    const t = startMs(r)
    if (t < start || t > end) return false
    if (operationId && r.operation_id !== operationId) return false
    return true
  })
}

/** Copy sorted by start time — layer ids are index-based on this order. */
export function sortByStart(records: any[]): any[] {
  return records.slice().sort((a, b) => startMs(a) - startMs(b))
}

export interface OperationOption {
  id: any
  name: string
  count: number
  latest: number
}

/** Operations present in the records, with counts, most recent first. */
export function availableOperations(records: any[]): OperationOption[] {
  const seen = new Map<any, OperationOption>()
  for (const r of records) {
    let entry = seen.get(r.operation_id)
    if (!entry) {
      entry = {
        id: r.operation_id,
        name: r.operation_name || "Unknown",
        count: 0,
        latest: 0,
      }
      seen.set(r.operation_id, entry)
    }
    entry.count++
    const t = startMs(r)
    if (t > entry.latest) entry.latest = t
  }
  return [...seen.values()].sort((a, b) => b.latest - a.latest)
}

export interface MatchedInfo {
  name: string
  type: string
}

/** record key → the Agworld activity its cluster was matched to. */
export function matchedRecordMap(
  suggestions: MatchSuggestion[],
): Map<string, MatchedInfo> {
  const m = new Map<string, MatchedInfo>()
  for (const s of suggestions) {
    if (s.confidence === "none" || !s.activity) continue
    const info = { name: matchActivityName(s), type: activityTypeLabel(s.type) }
    for (const r of s.cluster.records) m.set(recordKey(r), info)
  }
  return m
}
