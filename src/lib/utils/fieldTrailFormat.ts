// src/lib/utils/fieldTrailFormat.ts
// Display formatting for the field trail overlay (FieldTrailOverlay.svelte):
// record fields, durations, the trail selection card, the hover popup, and
// the Agworld match labels on the timeline strip.

import type { MatchSuggestion } from "./agworldMatching"

/* eslint-disable @typescript-eslint/no-explicit-any -- spray records are untyped rows */

/** Stable identity for a spray record across filters and re-sorts. */
export function recordKey(r: any): string {
  return r?.id ?? r?.trail_id ?? r?.start_time
}

export function formatDuration(seconds: number): string {
  if (!seconds) return "0s"
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m`
  return `${seconds}s`
}

export function formatDate(ts: string | number): string {
  return new Date(ts).toLocaleDateString([], {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

export function formatTime(ts: string | number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  })
}

/** Slider handle labels use the same day/month/year format. */
export const formatSliderDate = formatDate

export function formatHa(ha: any): string {
  return `${parseFloat(String(ha || 0)).toFixed(2)} ha`
}

export function formatKm(km: any): string {
  return `${parseFloat(String(km || 0)).toFixed(2)} km`
}

/** "SimpleTractor" → "Simple Tractor". */
export function formatVehicleType(type: string): string {
  return type ? type.replace(/([A-Z])/g, " $1").trim() : "Unknown"
}

export function getVehicleType(record: any): string {
  return record.vehicle_type || record.vehicle_marker?.type || ""
}

/** Gap between two spray records, e.g. "2 hours", "3 days", "2 months". */
export function formatTimeBetween(prevTime: number, currTime: number): string {
  const diff = currTime - prevTime
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  const months = Math.floor(days / 30)
  const years = Math.floor(days / 365)
  if (years > 0) return `${years} year${years > 1 ? "s" : ""}`
  if (months > 0) return `${months} month${months > 1 ? "s" : ""}`
  if (days > 0) return `${days} day${days > 1 ? "s" : ""}`
  if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""}`
  if (minutes > 0) return `${minutes} min`
  return "moments"
}

export interface TrailSelection {
  recordIdx: number
  recordId: any
  intervalIdx: number | null
  color: string
  date: string
  operator: string
  vehicle: string
  area: string
  distance: string
  startTime: string | null
  endTime: string | null
  intervalCount: number
}

/**
 * The info card for a selected trail. With `intervalIdx` null the whole
 * record is selected; otherwise one visit, whose own area / distance / times
 * are shown where present.
 */
export function buildTrailSelection(
  record: any,
  recordIdx: number,
  color: string,
  intervalIdx: number | null = null,
): TrailSelection {
  const interval = intervalIdx === null ? null : record.intervals?.[intervalIdx]
  return {
    recordIdx,
    recordId: record.id,
    intervalIdx,
    color,
    date: formatDate(record.start_time),
    operator: record.operator_name || "Unknown",
    vehicle: formatVehicleType(getVehicleType(record)),
    area: formatHa(interval?.area_hectares || record.area_hectares),
    distance: formatKm(interval?.distance_km || record.distance_km),
    startTime: interval?.entry_time ? formatTime(interval.entry_time) : null,
    endTime: interval?.exit_time ? formatTime(interval.exit_time) : null,
    intervalCount: record.intervals?.length || 1,
  }
}

/** HTML for the hover popup over a trail (feature properties from the map). */
export function trailPopupHtml(props: Record<string, any>): string {
  return `
          <div style="padding: 8px 12px; font-size: 13px; color: #333; min-width: 180px;">
            <div style="font-weight: 600; margin-bottom: 6px; color: ${props.color};">${props.date}</div>
            <div style="margin-bottom: 4px;">👤 ${props.operator}</div>
            <div style="margin-bottom: 4px;">🚜 ${props.vehicle}</div>
            ${props.startTime ? `<div style="margin-bottom: 4px;">⏰ ${props.startTime} – ${props.endTime}</div>` : ""}
            <div style="margin-bottom: 4px;">📐 ${props.area}</div>
            <div>📏 ${props.distance}</div>
          </div>
        `
}

// ── Agworld match labels ─────────────────────────────────────────────────

export function matchActivityName(s: Pick<MatchSuggestion, "activity">): string {
  return (
    s.activity?.attributes?.name ||
    s.activity?.attributes?.operation_type_name ||
    "Unnamed"
  )
}

/** Distinct colour per attempted match on the timeline strip. */
export const MATCH_COLORS = [
  "#4ade80",
  "#60a5fa",
  "#fbbf24",
  "#f472b6",
  "#a78bfa",
  "#34d399",
  "#fb923c",
  "#f87171",
  "#22d3ee",
  "#facc15",
]

export function matchColor(i: number): string {
  return MATCH_COLORS[i % MATCH_COLORS.length]
}

/** "3 Mar" (same day), "3 – 9 Mar"-style ranges, with the year when needed. */
export function formatClusterWindow(c: { start: number; end: number }): string {
  const fmt = (t: number, withYear: boolean) =>
    new Date(t).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      ...(withYear ? { year: "numeric" } : {}),
    })
  const sameYear =
    new Date(c.start).getFullYear() === new Date(c.end).getFullYear()
  if (fmt(c.start, false) === fmt(c.end, false)) return fmt(c.start, true)
  return `${fmt(c.start, false)} – ${fmt(c.end, !sameYear)}`
}

export function confidenceLabel(c: MatchSuggestion["confidence"]): string {
  return c === "high"
    ? "Likely match"
    : c === "medium"
      ? "Possible match"
      : c === "low"
        ? "Weak match"
        : "No match"
}

export function activityTypeLabel(t: MatchSuggestion["type"]): string {
  return t === "actual"
    ? "Actual"
    : t === "plan"
      ? "Plan"
      : t === "work_order"
        ? "Work Order"
        : ""
}

export function clusterSwathLabel(c: { swathWidths: number[] }): string {
  if (!c.swathWidths.length) return ""
  const avg = Math.round(
    c.swathWidths.reduce((a, b) => a + b, 0) / c.swathWidths.length,
  )
  return `~${avg}m swath`
}

export interface BreakdownRow {
  label: string
  pct: number
  weight: number
  contrib: number
  details: Record<string, string>
}

type BreakdownComponent =
  | { score: number; weight: number; details?: Record<string, string> }
  | undefined

function bdRow(label: string, comp: BreakdownComponent): BreakdownRow | null {
  if (!comp) return null
  return {
    label,
    pct: Math.round(comp.score * 100),
    weight: comp.weight,
    contrib: Math.round(comp.score * comp.weight * 1000) / 1000,
    details: comp.details || {},
  }
}

/** Score breakdown rows (timing / vehicle / coverage) for a match card. */
export function bdRows(breakdown: any): BreakdownRow[] {
  return [
    bdRow("timing", breakdown?.timing),
    bdRow("vehicle", breakdown?.vehicle),
    bdRow("coverage", breakdown?.coverage),
  ].filter((r): r is BreakdownRow => !!r)
}
