// src/lib/utils/adminFormat.ts
// Shared formatting helpers for the admin portal — used by the page and the
// admin client components so the look stays consistent everywhere.
import type { AdminMapContentStats, AdminMapNote } from "$lib/api/adminApi"

export function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return "Never"
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 5) return "Just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—"
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

export function seatStatusBadge(status: string): string {
  if (status === "EXCEEDING") return "badge-error"
  if (status === "AT_LIMIT") return "badge-warning"
  return "badge-success"
}

export function seatStatusLabel(status: string): string {
  if (status === "EXCEEDING") return "Exceeding"
  if (status === "AT_LIMIT") return "At Limit"
  return "OK"
}

export function subBadge(sub: string): string {
  if (sub === "FREE") return "badge-ghost"
  return "badge-primary"
}

// "PAID" | "FREE" → "Paid" | "Free" for chip labels.
export function subscriptionLabel(sub: string): string {
  if (!sub) return "—"
  return sub.charAt(0) + sub.slice(1).toLowerCase()
}

export function notePreview(
  mapId: string,
  notes: Record<string, AdminMapNote>,
): string {
  return (notes[mapId]?.note || "").trim() || "No note yet — click to add one"
}

// NOTE: deps are passed in as args — a bare noteIsDirty(mapId) call in the
// template never re-evaluates (function-body reads aren't tracked by the
// compiler), which left Save buttons stuck disabled.
export function noteIsDirty(
  mapId: string,
  drafts: Record<string, string>,
  notes: Record<string, AdminMapNote>,
): boolean {
  return (drafts[mapId] ?? "") !== (notes[mapId]?.note ?? "")
}

// Combined hectarage of every field (paddock) on the farm's map, e.g.
// "Mapping: 8413 ha · 24 fields"; maps with no fields read "No mapping".
export function fieldAreaLabel(
  mapId: string,
  stats: Map<string, AdminMapContentStats>,
): string {
  const s = stats.get(mapId)
  if (!s || !s.field_count) return "No mapping"
  const ha = Number(s.field_hectares) || 0
  const fieldWord = s.field_count === 1 ? "field" : "fields"
  return `Mapping: ${ha.toLocaleString("en-AU", { maximumFractionDigits: 0 })} ha · ${s.field_count} ${fieldWord}`
}

// Compact size-only version (just the hectares) for stat badges.
export function fieldSizeLabel(
  mapId: string,
  stats: Map<string, AdminMapContentStats>,
): string {
  const s = stats.get(mapId)
  if (!s || !s.field_count) return "No mapping"
  const ha = Number(s.field_hectares) || 0
  return `${ha.toLocaleString("en-AU", { maximumFractionDigits: 0 })} ha`
}

// Trails recorded on the farm (auto travel segments excluded, matching the
// map's own trail lists).
export function trailCountLabel(
  mapId: string,
  stats: Map<string, AdminMapContentStats>,
): string {
  const n = stats.get(mapId)?.trail_count ?? 0
  return `${n.toLocaleString("en-AU")} trail${n === 1 ? "" : "s"}`
}

// Markers placed on the farm (soft-deleted markers excluded).
export function markerCountLabel(
  mapId: string,
  stats: Map<string, AdminMapContentStats>,
): string {
  const n = stats.get(mapId)?.marker_count ?? 0
  return `${n.toLocaleString("en-AU")} marker${n === 1 ? "" : "s"}`
}

// Raw counts for compact icon badges (icon + number only).
export function trailCountValue(
  mapId: string,
  stats: Map<string, AdminMapContentStats>,
): number {
  return stats.get(mapId)?.trail_count ?? 0
}

export function markerCountValue(
  mapId: string,
  stats: Map<string, AdminMapContentStats>,
): number {
  return stats.get(mapId)?.marker_count ?? 0
}
