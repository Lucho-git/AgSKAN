// src/lib/utils/vehicleBadges.ts
// What VehicleTracker shows about the *set* of vehicles: the HUD picker list,
// the off-screen edge badges ("Show vehicles always" + broadcasts), and the
// toast raised when another vehicle starts broadcasting.

import { getVehicleDisplayName } from "./vehicleDisplayName"
import { isValidHeading } from "./heading"
import { parseCoordinates } from "./vehicleMotion"

/* eslint-disable @typescript-eslint/no-explicit-any -- vehicle rows are untyped store data */
type VehicleRow = Record<string, any>

/** A vehicle has "moved recently" if it updated within this window. */
export const VEHICLE_TRACK_ACTIVE_MS = 3 * 60 * 1000
export const EDGE_BADGE_ID_PREFIX = "vehicle-track-"

export const VEHICLE_COLOR_HEX: Record<string, string> = {
  Yellow: "#eab308",
  Orange: "#f97316",
  Red: "#ef4444",
  Green: "#22c55e",
  Blue: "#3b82f6",
  Purple: "#a855f7",
  HotPink: "#ec4899",
}

/** The name shown for another vehicle: its operator, else its preset name. */
export function vehicleName(v: VehicleRow): string {
  return v.full_name || getVehicleDisplayName(v as any)
}

const LEGACY_BROADCAST_COLORS: Record<string, string> = {
  FULL: "#f59e0b",
  EMPTY: "#8b5cf6",
  HELP: "#ef4444",
}

export interface VehicleListItem {
  id: unknown
  name: string
  isCurrentUser: boolean
  coordinates: unknown
  last_update: unknown
  vehicleType: string
  bodyColor: string
}

/** Vehicles for the HUD picker — yours first, only those with a position. */
export function buildVehicleList(
  userVehicle: VehicleRow,
  otherVehicles: VehicleRow[],
): VehicleListItem[] {
  return [
    {
      id: userVehicle.vehicle_id,
      name: "You",
      isCurrentUser: true,
      coordinates: userVehicle.coordinates,
      last_update: userVehicle.last_update,
      vehicleType: userVehicle.vehicle_marker?.type || "SimpleTractor",
      bodyColor: userVehicle.vehicle_marker?.bodyColor || "red",
    },
    ...otherVehicles.map((v) => ({
      id: v.vehicle_id,
      name: vehicleName(v),
      isCurrentUser: false,
      coordinates: v.coordinates,
      last_update: v.last_update,
      vehicleType: v.vehicle_marker?.type || "SimpleTractor",
      bodyColor: v.vehicle_marker?.bodyColor || "red",
    })),
  ].filter((v) => parseCoordinates(v.coordinates) !== null)
}

/** Label + colour for a broadcasting vehicle (with legacy colour fallbacks). */
export function broadcastStyle(v: VehicleRow): { color: string; reason: string } {
  const reason = String(v.flash_reason || "Broadcast").toUpperCase()
  return {
    color: v.flash_color || LEGACY_BROADCAST_COLORS[reason] || "#f59e0b",
    reason,
  }
}

export function isRecentlyActive(lastUpdate: unknown, now: number): boolean {
  if (!lastUpdate) return false
  const ts =
    typeof lastUpdate === "string"
      ? new Date(lastUpdate).getTime()
      : (lastUpdate as number)
  return Number.isFinite(ts) && now - ts < VEHICLE_TRACK_ACTIVE_MS
}

export interface EdgeBadge {
  id: string
  coordinates: [number, number]
  color: string
  label: string
  heading: number | undefined
  /** true → show the broadcast signal icon instead of the vehicle icon. */
  broadcast: boolean
  vehicleType: string
  componentProps: { bodyColor: string; size: string; swath: number }
}

/**
 * The edge badges that should exist right now. Broadcasting vehicles always
 * get one (in the broadcast colour); with `enabled && vehiclesVisible`, every
 * vehicle that moved in the last 3 minutes gets one too. Later entries with
 * the same id replace earlier ones (the store upserts by id).
 */
export function planEdgeBadges(opts: {
  enabled: boolean
  vehiclesVisible: boolean
  userVehicle: VehicleRow | null | undefined
  otherVehicles: VehicleRow[] | null | undefined
  now: number
}): EdgeBadge[] {
  const { userVehicle, now } = opts
  const others = opts.otherVehicles || []
  const badges: EdgeBadge[] = []

  const add = (
    id: string,
    coords: unknown,
    vehicleMarker: VehicleRow | undefined,
    heading: unknown,
    label: string,
    broadcast?: { color: string },
  ) => {
    const parsed = parseCoordinates(coords)
    if (!parsed) return
    const bodyColor = vehicleMarker?.bodyColor || "Yellow"
    const size = vehicleMarker?.size ?? 45
    badges.push({
      id,
      coordinates: [parsed.longitude, parsed.latitude],
      color: broadcast
        ? broadcast.color
        : VEHICLE_COLOR_HEX[bodyColor] || "#eab308",
      label,
      heading: !broadcast && isValidHeading(heading) ? heading : undefined,
      broadcast: !!broadcast,
      vehicleType: vehicleMarker?.type || "SimpleTractor",
      componentProps: {
        bodyColor,
        size: `${Math.max(16, Math.min(30, Math.round(size * 0.55)))}px`,
        swath: vehicleMarker?.swath ?? 12,
      },
    })
  }

  const userId = `${EDGE_BADGE_ID_PREFIX}${userVehicle?.vehicle_id || "me"}`

  if (userVehicle?.is_flashing) {
    const b = broadcastStyle(userVehicle)
    add(
      userId,
      userVehicle.coordinates,
      userVehicle.vehicle_marker,
      userVehicle.heading,
      `You — broadcasting ${b.reason}`,
      b,
    )
  }
  for (const v of others) {
    if (!v.is_flashing) continue
    const b = broadcastStyle(v)
    add(
      `${EDGE_BADGE_ID_PREFIX}${v.vehicle_id}`,
      v.coordinates,
      v.vehicle_marker,
      v.heading,
      `${vehicleName(v)} — broadcasting ${b.reason}`,
      b,
    )
  }

  if (opts.enabled && opts.vehiclesVisible) {
    if (isRecentlyActive(userVehicle?.last_update, now) && !userVehicle?.is_flashing) {
      add(
        userId,
        userVehicle!.coordinates,
        userVehicle!.vehicle_marker,
        userVehicle!.heading,
        "You",
      )
    }
    for (const v of others) {
      if (!isRecentlyActive(v.last_update, now) || v.is_flashing) continue
      add(
        `${EDGE_BADGE_ID_PREFIX}${v.vehicle_id}`,
        v.coordinates,
        v.vehicle_marker,
        v.heading,
        vehicleName(v),
      )
    }
  }

  return badges
}

/** Ids of existing edge badges that are no longer wanted. */
export function staleEdgeBadgeIds(
  current: Array<{ id?: string }>,
  wanted: Iterable<string>,
): string[] {
  const keep = new Set(wanted)
  return current
    .map((item) => item.id)
    .filter(
      (id): id is string =>
        !!id && id.startsWith(EDGE_BADGE_ID_PREFIX) && !keep.has(id),
    )
}

export interface BroadcastToast {
  level: "error" | "warning"
  title: string
  description: string
  duration: number
  style: string
}

/**
 * The toast for another vehicle that just started broadcasting, or null when
 * this change isn't a broadcast start (already broadcasting, unknown vehicle,
 * or broadcast stopping).
 */
export function broadcastStartToast(
  change: VehicleRow,
  existing: VehicleRow | undefined,
): BroadcastToast | null {
  if (!change.is_flashing || !existing || existing.is_flashing) return null
  const reasonLabel = String(change.flash_reason || "Broadcast").toUpperCase()
  const isHelp = String(change.flash_reason || "").toLowerCase() === "help"
  return {
    level: isHelp ? "error" : "warning",
    title: isHelp
      ? `🆘 ${reasonLabel} Broadcast`
      : `📢 ${reasonLabel} Broadcast`,
    description: isHelp
      ? `${change.full_name} needs assistance!`
      : `${change.full_name} is broadcasting ${reasonLabel}`,
    duration: isHelp ? 45000 : 8000,
    style: `border-left: 4px solid ${change.flash_color || "#f59e0b"};`,
  }
}

/**
 * Merge a realtime change into the other-vehicles list (in place, matching
 * the store's existing update style) and return the same array.
 */
export function upsertVehicle(
  vehicles: VehicleRow[],
  change: VehicleRow,
): VehicleRow[] {
  const index = vehicles.findIndex((v) => v.vehicle_id === change.vehicle_id)
  if (index !== -1) {
    vehicles[index] = { ...vehicles[index], ...change, speed: change.speed }
  } else {
    vehicles.push({ ...change, speed: change.speed })
  }
  return vehicles
}
