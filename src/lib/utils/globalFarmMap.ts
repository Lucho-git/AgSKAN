// src/lib/utils/globalFarmMap.ts
// Shared helpers for the admin global farm map (page + farm card).
import type { GlobalFarm } from "$lib/api/adminApi"

export type FarmStatus =
  | "live"
  | "day"
  | "week"
  | "month"
  | "season"
  | "dormant"
  | "dead"

/** Activity colours — fixed, since they're drawn on the dark map. */
export const STATUS_META: Record<
  FarmStatus,
  { label: string; hint: string; color: string }
> = {
  live: { label: "Live now", hint: "A vehicle reported in the last 15 minutes", color: "#22c55e" },
  day: { label: "Active today", hint: "A vehicle reported in the last 24 hours", color: "#a3e635" },
  week: { label: "Active this week", hint: "Activity in the last 7 days", color: "#facc15" },
  month: { label: "Active this month", hint: "Activity in the last 30 days", color: "#fb923c" },
  season: { label: "Active this season", hint: "Activity in the last 3 months", color: "#f472b6" },
  dormant: { label: "Dormant", hint: "No activity in 3 months", color: "#94a3b8" },
  dead: { label: "Dead", hint: "No activity in over 12 months", color: "#475569" },
}

export const STATUS_ORDER: FarmStatus[] = [
  "live",
  "day",
  "week",
  "month",
  "season",
  "dormant",
  "dead",
]

const MIN = 60 * 1000
const DAY = 24 * 60 * MIN

/** Live/today come from vehicle GPS; the longer bands also count member sign-ins. */
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
  if (age <= 90 * DAY) return "season"
  if (age <= 365 * DAY) return "dormant"
  return "dead"
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

/** Vehicle types are stored loosely ("tractor", "simpleTractor") — find the icon's real key. */
export function vehicleIconKey(type: string | null, keys: string[]): string {
  if (!type) return "Pointer"
  if (keys.includes(type)) return type
  const lower = type.toLowerCase()
  return keys.find((k) => k.toLowerCase() === lower) ?? "Pointer"
}
