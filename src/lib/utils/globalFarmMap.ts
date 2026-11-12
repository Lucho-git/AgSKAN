// src/lib/utils/globalFarmMap.ts
// Shared helpers for the admin global farm map (page + farm card).
import type { GlobalFarm } from "$lib/api/adminApi"

export type FarmStatus = "live" | "day" | "week" | "month" | "dormant"

/** Activity colours — fixed, since they're drawn on the dark map. */
export const STATUS_META: Record<FarmStatus, { label: string; color: string }> = {
  live: { label: "Live now", color: "#22c55e" },
  day: { label: "Active today", color: "#a3e635" },
  week: { label: "Active this week", color: "#facc15" },
  month: { label: "Active this month", color: "#fb923c" },
  dormant: { label: "Dormant", color: "#64748b" },
}

export const STATUS_ORDER: FarmStatus[] = ["live", "day", "week", "month", "dormant"]

const MIN = 60 * 1000
const DAY = 24 * 60 * MIN

/** Live/today come from vehicle GPS; week/month also count member sign-ins. */
export function farmStatus(farm: GlobalFarm, now = Date.now()): FarmStatus {
  const vehicleAge = farm.latest_vehicle_update
    ? now - new Date(farm.latest_vehicle_update).getTime()
    : Infinity
  if (vehicleAge <= 15 * MIN) return "live"
  if (vehicleAge <= DAY) return "day"
  const age = farm.last_activity
    ? now - new Date(farm.last_activity).getTime()
    : Infinity
  if (age <= 7 * DAY) return "week"
  if (age <= 30 * DAY) return "month"
  return "dormant"
}

export function formatHa(ha: number): string {
  const n = Number(ha) || 0
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M ha`
  if (n >= 10_000) return `${Math.round(n / 1_000)}k ha`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k ha`
  return `${Math.round(n)} ha`
}

// Bright, well-separated hues that hold up on both the dark basemap and
// satellite imagery. A farm keeps its colour between visits (hash of its id).
const FARM_COLORS = [
  "#38bdf8", "#f472b6", "#a78bfa", "#34d399", "#fbbf24", "#fb7185",
  "#2dd4bf", "#c084fc", "#f97316", "#60a5fa", "#e879f9", "#4ade80",
]

export function farmColor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0
  return FARM_COLORS[Math.abs(hash) % FARM_COLORS.length]
}

function haversineKm(a: [number, number], b: [number, number]): number {
  const rad = Math.PI / 180
  const dLat = (b[1] - a[1]) * rad
  const dLng = (b[0] - a[0]) * rad
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(h))
}

/** Greatest distance between any two located farms — "how far we spread". */
export function spreadKm(farms: GlobalFarm[]): number {
  const pts = farms
    .filter((f) => f.lng != null && f.lat != null)
    .map((f) => [f.lng, f.lat] as [number, number])
  let max = 0
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const d = haversineKm(pts[i], pts[j])
      if (d > max) max = d
    }
  }
  return max
}
