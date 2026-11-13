/**
 * Everything the new map reads from or writes to the server, in one place.
 *
 * It sits on the same tables, the same realtime topics and (for every write
 * that has one) the same API functions as the current map viewer, so a
 * person on the new map and a person on the old one see each other's
 * machines, trails and pins. The shapes written here are the old viewer's
 * shapes exactly; see the notes beside each function.
 *
 * Nothing in here draws anything.
 */
// @ts-expect-error -- no type declarations for uuid in this repo
import { v4 as uuidv4 } from "uuid"
import { supabase } from "$lib/supabaseClient"
import { area as turfArea, difference } from "@turf/turf"
import { fileApi } from "$lib/api/fileApi"
import { mapApi } from "$lib/api/mapApi"
import { farmApi } from "$lib/api/farmApi"
import { markerApi } from "$lib/api/markerApi"
import { trailsApi } from "$lib/api/trailsApi"
import { listMapBroadcasts } from "$lib/api/broadcastApi"
import { userSettingsApi } from "$lib/api/userSettingsApi"
import { markerRowToClientMarker } from "$lib/utils/markerRow"
import { grainBinDefaultCapacity } from "$lib/components/map/markers/markerPalette"
import type { LngLat } from "$lib/components/mapnext/geo"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>
type Channel = ReturnType<typeof supabase.channel>

const PAGE = 1000

/** Read every row of a query, a page at a time. */
async function readAll(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{
    data: Row[] | null
    error: { message: string } | null
  }>,
): Promise<Row[]> {
  const rows: Row[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE) return rows
  }
}

/** Run jobs a few at a time. */
async function pooled<T>(
  items: T[],
  size: number,
  job: (item: T) => Promise<void>,
) {
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) await job(items[next++])
    }),
  )
}

// ── Paddocks ──────────────────────────────────────────────────────────────

export type Paddock = {
  id: string
  name: string
  /** Hectares, as the farm recorded them. */
  ha: number
  /** The farm it belongs to, when the map has more than one. */
  farm: string | null
  farmId: string | null
  /** What is in it ("Wheat", "Canola"…), if anyone has said. */
  crop: string
  /** The owner's chosen colour, if any. */
  colour: string | null
  /** Polygon rings, outer first; a paddock in several parts has several. */
  polygons: LngLat[][][]
  bbox: [number, number, number, number]
  /** Areas and lines kept on it, each with a name. */
  features: PaddockFeature[]
}

/** An area or a line kept on a paddock: a wet patch, a drain, a rock heap. */
export type PaddockFeature = {
  id: string
  kind: "polygon" | "line"
  label: string
  colour: string
  /** Its corners (an area closes back to the first). */
  coordinates: LngLat[]
  /** ms */
  t: number
}

const featuresOf = (properties: Row | null | undefined): PaddockFeature[] =>
  Array.isArray(properties?.agskan_features)
    ? (properties.agskan_features as Row[])
        .filter(
          (feature) =>
            feature?.id &&
            Array.isArray(feature.coordinates) &&
            feature.coordinates.length > 1,
        )
        .map((feature) => ({
          id: String(feature.id),
          kind: feature.kind === "line" ? "line" : "polygon",
          label: String(feature.label ?? ""),
          colour: String(feature.colour ?? "#0ea5e9"),
          coordinates: feature.coordinates as LngLat[],
          t: feature.created_at ? Date.parse(feature.created_at) : 0,
        }))
    : []

function polygonsOf(boundary: Row | null): LngLat[][][] {
  if (!boundary) return []
  if (boundary.type === "Polygon") return [boundary.coordinates]
  if (boundary.type === "MultiPolygon") return boundary.coordinates
  return []
}

export type FarmName = { id: string; name: string }

/** The farms (blocks) a map's paddocks are grouped into. */
export async function loadFarmNames(mapId: string): Promise<FarmName[]> {
  const result = await farmApi.loadFarms(mapId)
  return ((result.farms ?? []) as Row[])
    .map((f) => ({ id: String(f.id), name: String(f.name ?? "") }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** What can be changed about a paddock from its menu. */
export type PaddockPatch = {
  name?: string
  crop?: string
  /** A hex colour, or null for the default. */
  colour?: string | null
  farmId?: string
}

/** Change a paddock, through the same call the current viewer's panel makes. */
export async function patchPaddock(id: string, change: PaddockPatch) {
  const updates: Row = {}
  if (change.name !== undefined) updates.name = change.name
  if (change.crop !== undefined) updates.field_type = change.crop
  if (change.colour !== undefined) updates.color = change.colour ?? "default"
  if (change.farmId !== undefined) updates.farm_id = change.farmId
  const result = (await fileApi.updateField(id, updates)) as Row
  if (result?.error || result?.success === false)
    throw new Error(result.message || result.error || "Couldn't save")
}

/** Delete a paddock for good (its boundary goes with it). */
export async function deletePaddock(id: string) {
  const result = (await fileApi.deleteField(id)) as Row
  if (result?.error || result?.success === false)
    throw new Error(result.message || result.error || "Couldn't delete")
}

export async function loadPaddocks(mapId: string): Promise<Paddock[]> {
  const [fields, farms] = await Promise.all([
    fileApi.loadFields(),
    farmApi.loadFarms(mapId),
  ])
  if (fields.error) throw new Error(String(fields.error))
  const farmNames = new Map<string, string>(
    (farms.farms ?? []).map((f: Row) => [f.id, f.name]),
  )
  const paddocks: Paddock[] = []
  for (const field of (fields.fields ?? []) as Row[]) {
    const polygons = polygonsOf(field.boundary)
    if (!polygons.length) continue
    let w = Infinity
    let s = Infinity
    let e = -Infinity
    let n = -Infinity
    for (const polygon of polygons)
      for (const [lng, lat] of polygon[0] ?? []) {
        if (lng < w) w = lng
        if (lng > e) e = lng
        if (lat < s) s = lat
        if (lat > n) n = lat
      }
    if (!Number.isFinite(w)) continue
    const colour =
      typeof field.color === "string" && /^#[0-9a-f]{3,8}$/i.test(field.color)
        ? field.color
        : null
    paddocks.push({
      id: String(field.field_id),
      name: field.name || "Paddock",
      ha: Number(field.area) || 0,
      farm:
        farmNames.size > 1 && field.farm_id
          ? (farmNames.get(field.farm_id) ?? null)
          : null,
      farmId: field.farm_id ?? null,
      crop: field.field_type ?? "",
      colour,
      polygons,
      bbox: [w, s, e, n],
      features: featuresOf(field.properties),
    })
  }
  return paddocks
}

// ── Pins (`map_markers`) ──────────────────────────────────────────────────

export type LivePin = {
  id: string
  at: LngLat
  iconClass: string
  note: string
  noteVisible: boolean
  /** `marker_color` palette key ("default" when none was chosen). */
  colour: string
  gateOpen: boolean
  rockPicked: boolean
  /** Grain bins. */
  fill: number
  grainType: string
  grainColour: string
  capacity: number | null
  /** When it was dropped (ms). */
  t: number
  /** Its drawings show all the time, or only while it is picked. */
  drawingsAlways: boolean
  photos: PinPhoto[]
  /** Who last changed it (the map keeps no record of who dropped it). */
  by: string | null
}

/** A photo attached to a pin: where its file is kept. */
export type PinPhoto = { id: string; path: string; created_at: string }

const photosOf = (properties: Row | null | undefined): PinPhoto[] =>
  Array.isArray(properties?.photos)
    ? (properties.photos as Row[])
        .filter((photo) => photo?.id && photo.path)
        .map((photo) => ({
          id: String(photo.id),
          path: String(photo.path),
          created_at: String(photo.created_at ?? ""),
        }))
    : []

function pinFromRow(row: Row): LivePin | null {
  const coordinates = row.marker_data?.geometry?.coordinates
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null
  if (row.marker_data?.properties?.drawings_visibility === "hidden") return null
  const m = markerRowToClientMarker(row) as Row
  return {
    id: String(row.id),
    at: [Number(coordinates[0]), Number(coordinates[1])],
    iconClass: m.iconClass || "default",
    note: (m.notes ?? "").trim(),
    noteVisible: m.noteLabelVisible !== false,
    colour: m.markerColor || "default",
    gateOpen: !!m.gateOpen,
    rockPicked: !!m.rockPicked,
    fill: Number(m.siloFill) || 0,
    grainType: m.grainType || "",
    grainColour: m.grainColor || "yellow",
    capacity: m.capacityTonnes ?? null,
    t: new Date(m.created_at || row.updated_at || Date.now()).getTime(),
    drawingsAlways:
      (row.marker_data?.properties?.drawings_visibility ?? "always") ===
      "always",
    photos: photosOf(row.marker_data?.properties),
    by: row.update_user_id ? String(row.update_user_id) : null,
  }
}

const PIN_COLUMNS =
  "id, marker_data, notes, last_confirmed, created_at, updated_at, deleted, update_user_id"

export async function loadPins(mapId: string): Promise<LivePin[]> {
  const rows = await readAll((from, to) =>
    supabase
      .from("map_markers")
      .select(PIN_COLUMNS)
      .eq("master_map_id", mapId)
      .or("deleted.is.null,deleted.eq.false")
      .order("id", { ascending: true })
      .range(from, to),
  )
  return rows.map(pinFromRow).filter((p): p is LivePin => !!p)
}

/** Follow pins other people add, change or remove. Returns a stop function. */
export function watchPins(
  mapId: string,
  handlers: { upsert: (pin: LivePin) => void; remove: (id: string) => void },
) {
  const channel = supabase
    .channel(`mapnext-pins-${mapId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "map_markers",
        filter: `master_map_id=eq.${mapId}`,
      },
      (payload: Row) => {
        const row = payload.new as Row | undefined
        if (payload.eventType === "DELETE" || row?.deleted === true) {
          const id = row?.id ?? payload.old?.id
          if (id) handlers.remove(String(id))
          return
        }
        if (!row) return
        const pin = pinFromRow(row)
        if (pin) handlers.upsert(pin)
        else handlers.remove(String(row.id))
      },
    )
    .subscribe()
  return () => {
    supabase.removeChannel(channel)
  }
}

/**
 * Drop a pin. Writes the row the old viewer writes when it confirms a new
 * marker (MapStateSaver's upsert), so it shows up there unchanged.
 */
export async function createPin(
  mapId: string,
  userId: string,
  iconClass: string,
  at: LngLat,
): Promise<LivePin> {
  const now = new Date().toISOString()
  // The same generator the old viewer uses: `crypto.randomUUID` is missing
  // on the older iPads still found in cabs.
  const id = uuidv4()
  const row = {
    master_map_id: mapId,
    id,
    marker_data: {
      type: "Feature",
      geometry: { type: "Point", coordinates: [at[0], at[1]] },
      properties: {
        icon: iconClass,
        id,
        drawings_visibility: "always",
        note_label_visible: true,
        silo_fill: 0,
        grain_type: "",
        grain_color: "yellow",
        marker_color: "default",
        tint_mode: "circle-fill-black",
        capacity_tonnes: grainBinDefaultCapacity(iconClass),
        field_bin_configured: false,
        bin_show_always: true,
        gate_open: false,
        rock_picked: false,
        photos: [],
      },
    },
    notes: null,
    last_confirmed: now,
    created_at: now,
    updated_at: now,
    update_user_id: userId,
  }
  const { error } = await supabase
    .from("map_markers")
    .upsert([row], { onConflict: "id" })
  if (error) throw new Error(error.message)
  // Keeps the "most used first" order of the pin picker in step.
  userSettingsApi.recordMarkerUsage(iconClass).catch(() => {})
  return pinFromRow(row)!
}

/** What can be changed about a pin from its menu. */
export type PinPatch = {
  iconClass?: string
  /** A marker colour key; "default" for none. */
  colour?: string
  gateOpen?: boolean
  rockPicked?: boolean
  /** Whether its note shows as a label on the map. */
  noteVisible?: boolean
  /** Grain bins: how full (0–100) and what is in it. */
  fill?: number
  grainType?: string
  /** A new place for it. */
  at?: LngLat
  /** Show its drawings all the time, or only while it is picked. */
  drawingsAlways?: boolean
}

/**
 * Change a pin. The old viewer rewrites the whole pin whenever anything on
 * it changes; this reads the pin first and changes only what was asked, so
 * photos, drawings and anything else on it are left exactly as they were.
 */
export async function patchPin(id: string, userId: string, change: PinPatch) {
  const { data, error } = await supabase
    .from("map_markers")
    .select("marker_data")
    .eq("id", id)
    .single()
  if (error) throw new Error(error.message)
  const current = ((data as Row | null)?.marker_data ?? {}) as Row
  const properties: Row = { ...(current.properties ?? {}) }
  if (change.iconClass !== undefined) {
    properties.icon = change.iconClass
    // A pin turned into a grain bin starts at that bin's usual size.
    if (properties.capacity_tonnes === undefined)
      properties.capacity_tonnes = grainBinDefaultCapacity(change.iconClass)
  }
  if (change.colour !== undefined) properties.marker_color = change.colour
  if (change.gateOpen !== undefined) properties.gate_open = change.gateOpen
  if (change.rockPicked !== undefined)
    properties.rock_picked = change.rockPicked
  if (change.noteVisible !== undefined)
    properties.note_label_visible = change.noteVisible
  if (change.fill !== undefined) properties.silo_fill = change.fill
  if (change.grainType !== undefined) properties.grain_type = change.grainType
  if (change.drawingsAlways !== undefined)
    properties.drawings_visibility = change.drawingsAlways
      ? "always"
      : "selected"
  const next: Row = { ...current, properties }
  if (change.at)
    next.geometry = {
      ...(current.geometry ?? {}),
      type: "Point",
      coordinates: [change.at[0], change.at[1]],
    }
  const { error: failed } = await supabase
    .from("map_markers")
    .update({
      marker_data: next,
      updated_at: new Date().toISOString(),
      update_user_id: userId,
    })
    .eq("id", id)
  if (failed) throw new Error(failed.message)
}

/** Change a pin's note (its own column, saved by the existing API). */
export async function setPinNote(id: string, note: string) {
  const result = (await markerApi.updateMarkerNotes(
    id,
    note.trim().slice(0, 500),
  )) as Row
  if (result?.error || result?.success === false)
    throw new Error(result.message || "Couldn't save the note")
}

/** Remove a pin (a soft delete, as everywhere else in the app). */
export async function removePin(id: string) {
  const result = (await markerApi.deleteMarker(id)) as Row
  if (result?.error || result?.success === false)
    throw new Error(result.message || "Couldn't remove the pin")
}

export async function restorePin(id: string) {
  const result = (await markerApi.restoreMarker(id)) as Row
  if (result?.error || result?.success === false)
    throw new Error(result.message || "Couldn't put the pin back")
}

// ── Machines (`vehicle_state`) ────────────────────────────────────────────

/** `vehicle_state.vehicle_marker`: what someone is driving. */
export type VehicleMarkerData = {
  type: string
  bodyColor: string
  size: number
  swath: number
  [extra: string]: unknown
}

export type VehicleState = {
  id: string
  at: LngLat | null
  /** GPS time of the position (ms). */
  t: number
  heading: number | null
  /** km/h */
  speed: number
  trailing: boolean
  /**
   * The job they have on the map ("Spraying"…): null for none, undefined
   * when this update doesn't say.
   */
  operation?: string | null
  marker: VehicleMarkerData | null
  /**
   * What they are broadcasting to the crew ("Full", "Help"…), null when
   * nothing, undefined when this update doesn't say either way.
   */
  flash?: Flash | null
}

/** A broadcast: a word and a colour flashed on a machine for the crew. */
export type Flash = {
  /** "full", "help", or a custom label. */
  reason: string
  colour: string
  /** When it began (ms). */
  started: number
}

/** What a broadcast is called on screen. */
export const flashLabel = (flash: Flash) =>
  flash.reason === "full"
    ? "Full"
    : flash.reason === "help"
      ? "Help"
      : flash.reason

const LEGACY_FLASH: Record<string, string> = {
  full: "#f59e0b",
  empty: "#8b5cf6",
  help: "#ef4444",
}

function flashFromRow(row: Row): Flash | null | undefined {
  if (!("is_flashing" in row)) return undefined
  if (!row.is_flashing) return null
  const reason = String(row.flash_reason || "full")
  return {
    reason,
    colour: row.flash_color || LEGACY_FLASH[reason] || "#f59e0b",
    started: row.flash_started_at
      ? new Date(row.flash_started_at).getTime()
      : Date.now(),
  }
}

/** The broadcasts a map offers: the two built in, then the crew's own. */
export async function loadBroadcastChoices(mapId: string) {
  const own = await listMapBroadcasts(mapId).catch(() => [])
  return [
    { reason: "full", label: "Full", colour: "#f59e0b" },
    { reason: "help", label: "Help", colour: "#ef4444" },
    ...own.map((b) => ({ reason: b.label, label: b.label, colour: b.color })),
  ]
}

export type CrewProfile = {
  id: string
  name: string
  /** A guest looking at the map, not one of the crew. */
  guest: boolean
  operation: string | null
}

/** `vehicle_state.coordinates` is a Postgres point: the text "(lng,lat)". */
export function parsePoint(value: unknown): LngLat | null {
  if (!value) return null
  if (typeof value === "string") {
    const match = value.match(
      /^\(?\s*(-?[\d.]+(?:e-?\d+)?)\s*,\s*(-?[\d.]+(?:e-?\d+)?)\s*\)?$/i,
    )
    if (!match) return null
    const lng = Number(match[1])
    const lat = Number(match[2])
    return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null
  }
  const point = value as { x?: number; y?: number }
  return typeof point.x === "number" && typeof point.y === "number"
    ? [point.x, point.y]
    : null
}

export const pointText = (at: LngLat) => `(${at[0]},${at[1]})`

function vehicleFromRow(row: Row): VehicleState {
  const marker = row.vehicle_marker
  return {
    id: String(row.vehicle_id),
    at: parsePoint(row.coordinates),
    t: row.last_update ? new Date(row.last_update).getTime() : 0,
    heading:
      typeof row.heading === "number" && Number.isFinite(row.heading)
        ? row.heading
        : null,
    speed: Number(row.speed) || 0,
    trailing: !!row.is_trailing,
    // Said in what a machine sends as it moves, not kept with its position.
    operation:
      typeof row.operation_name === "string"
        ? row.operation_name === "No operation"
          ? null
          : row.operation_name
        : undefined,
    flash: flashFromRow(row),
    marker:
      marker && typeof marker === "object" && marker.type
        ? {
            ...marker,
            bodyColor: marker.bodyColor ?? marker.color ?? "Yellow",
            size: Number(marker.size) || 45,
            swath: Number(marker.swath) || 4,
          }
        : null,
  }
}

/** The signed-in person's own row, if they have one yet. */
export async function loadMyVehicle(userId: string) {
  const { data, error } = await supabase
    .from("vehicle_state")
    .select("*")
    .eq("vehicle_id", userId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ? vehicleFromRow(data) : null
}

/** Everyone connected to this map, and where each was last seen. */
export async function loadCrew(mapId: string, userId: string) {
  const [profiles, states] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, full_name, map_role, operations!profiles_selected_operation_id_fkey(name)",
      )
      .eq("master_map_id", mapId),
    supabase.from("vehicle_state").select("*").eq("master_map_id", mapId),
  ])
  if (profiles.error) throw new Error(profiles.error.message)
  if (states.error) throw new Error(states.error.message)
  const crew: CrewProfile[] = ((profiles.data ?? []) as Row[])
    .filter((p) => p.id !== userId)
    .map((p) => ({
      id: String(p.id),
      name: p.full_name || (p.map_role === "viewer" ? "Visitor" : "Someone"),
      guest: p.map_role === "viewer",
      operation: p.operations?.name ?? null,
    }))
  const connected = new Set(crew.map((p) => p.id))
  const vehicles = ((states.data ?? []) as Row[])
    .map(vehicleFromRow)
    .filter((v) => connected.has(v.id))
  return { crew, vehicles }
}

export type MyVehicleUpdate = {
  userId: string
  mapId: string
  at: LngLat
  /** GPS time of the fix (ms). */
  t: number
  heading: number | null
  /** km/h */
  speed: number
  trailing: boolean
  marker: VehicleMarkerData
  operation: { id: string; name: string } | null
  /**
   * Set only when this screen has just started or stopped a broadcast (null
   * to stop). Left out otherwise, so a broadcast running from another of
   * this person's devices is never touched from here.
   */
  flash?: Flash | null
}

/**
 * The live link to everyone else on the map: one realtime channel carrying
 * who is online, position broadcasts between phones, and changes to the
 * `vehicle_state` and `profiles` tables. Same topic and payloads as the old
 * viewer's VehicleStateSynchronizer; the two must never be open in the same
 * page.
 */
export class CrewLink {
  private channel: Channel | null = null
  private poll: ReturnType<typeof setInterval> | null = null
  private lastSaved = 0
  private savedMarker = ""
  private stopped = false

  constructor(
    private mapId: string,
    private userId: string,
    private handlers: {
      vehicle: (state: VehicleState) => void
      gone: (id: string) => void
      online: (ids: Set<string>) => void
      /** Someone joined, left or was renamed: the crew list needs re-reading. */
      crewChanged: () => void
      linked: (ok: boolean) => void
    },
  ) {}

  start() {
    const channel = supabase.channel(`vehicle_updates_${this.mapId}`, {
      config: { presence: { key: this.userId } },
    })
    this.channel = channel
    channel
      .on("presence", { event: "sync" }, () => {
        this.handlers.online(new Set(Object.keys(channel.presenceState())))
      })
      .on("broadcast", { event: "vehicle_update" }, (message: Row) => {
        const payload = message.payload as Row | undefined
        if (!payload?.vehicle_id || payload.vehicle_id === this.userId) return
        this.handlers.vehicle(vehicleFromRow(payload))
      })
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "vehicle_state",
          filter: `master_map_id=eq.${this.mapId}`,
        },
        (payload: Row) => {
          if (payload.eventType === "DELETE") {
            const id = payload.old?.vehicle_id
            if (id) this.handlers.gone(String(id))
            return
          }
          const row = payload.new as Row | undefined
          if (!row?.vehicle_id || row.vehicle_id === this.userId) return
          this.handlers.vehicle(vehicleFromRow(row))
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "profiles",
          filter: `master_map_id=eq.${this.mapId}`,
        },
        () => this.handlers.crewChanged(),
      )
      .subscribe((status: string) => {
        if (this.stopped) return
        this.handlers.linked(status === "SUBSCRIBED")
        if (status === "SUBSCRIBED")
          channel.track({
            user_id: this.userId,
            online_at: new Date().toISOString(),
          })
      })
    // People leaving the map don't show up on the channel, and a dropped
    // socket misses updates: re-read the crew now and then.
    this.poll = setInterval(() => this.handlers.crewChanged(), 90_000)
  }

  /** Tell the crew where this machine is; saved to the table every 10 s. */
  async send(update: MyVehicleUpdate) {
    const at = pointText(update.at)
    const stamp = new Date(update.t).toISOString()
    const heading =
      update.heading === null ? null : Math.round(update.heading) % 360
    const speed = Math.round(update.speed * 10) / 10
    const flash =
      update.flash === undefined
        ? {}
        : {
            is_flashing: !!update.flash,
            flash_started_at: update.flash
              ? new Date(update.flash.started).toISOString()
              : null,
            flash_reason: update.flash?.reason ?? null,
            flash_color: update.flash?.colour ?? null,
          }

    this.channel?.send({
      type: "broadcast",
      event: "vehicle_update",
      payload: {
        vehicle_id: update.userId,
        master_map_id: update.mapId,
        coordinates: at,
        last_update: stamp,
        is_trailing: update.trailing,
        vehicle_marker: update.marker,
        heading,
        speed,
        selected_operation_id: update.operation?.id ?? null,
        operation_id: update.operation?.id ?? null,
        operation_name: update.operation?.name ?? "No operation",
        ...flash,
      },
    })

    const marker = JSON.stringify(update.marker)
    const now = Date.now()
    if (
      update.flash === undefined &&
      now - this.lastSaved < 10_000 &&
      marker === this.savedMarker
    )
      return
    this.lastSaved = now
    this.savedMarker = marker
    // The broadcast columns are only sent when this screen has just started
    // or stopped one: an upsert only touches the columns it sends, so a
    // broadcast started on another of this person's devices is not cleared.
    const { error } = await supabase.from("vehicle_state").upsert(
      {
        vehicle_id: update.userId,
        master_map_id: update.mapId,
        coordinates: at,
        last_update: stamp,
        is_trailing: update.trailing,
        vehicle_marker: update.marker,
        heading,
        speed,
        ...flash,
      },
      { onConflict: "vehicle_id" },
    )
    if (error) this.lastSaved = 0
  }

  /** Make the next `send` write to the table straight away. */
  saveSoon() {
    this.lastSaved = 0
  }

  stop() {
    this.stopped = true
    if (this.poll) clearInterval(this.poll)
    if (this.channel) {
      this.channel.untrack()
      supabase.removeChannel(this.channel)
    }
    this.channel = null
  }
}

/**
 * Save what this person is driving when they have no position yet (with a
 * position, `CrewLink.send` carries it). Mirrors the onboarding pages.
 */
export async function saveMyMachine(
  userId: string,
  mapId: string,
  marker: VehicleMarkerData,
) {
  const { error } = await supabase
    .from("vehicle_state")
    .upsert(
      { vehicle_id: userId, master_map_id: mapId, vehicle_marker: marker },
      { onConflict: "vehicle_id" },
    )
  if (error) throw new Error(error.message)
}

// ── Trails ────────────────────────────────────────────────────────────────

export type TrailInfo = {
  id: string
  vehicleId: string
  operationId: string
  /** ms */
  start: number
  end: number | null
  /** As saved: a colour name ("Red") or a hex value. */
  colour: string
  /** Working width in metres. */
  width: number
  operator: string | null
  ha: number | null
  /** The machine that laid it (`vehicle_marker.type`), when recorded. */
  machine?: string | null
  /** Metres driven, and the share of it that went over ground already done. */
  distance?: number | null
  overlap?: number | null
}

export type TrailPoint = { at: LngLat; t: number }

const TRAIL_COLUMNS =
  "id, vehicle_id, operation_id, start_time, end_time, trail_color, trail_width, operator_name, trail_hectares, trail_distance, trail_percentage_overlap, vehicle_marker, source"

function trailFromRow(row: Row): TrailInfo {
  return {
    id: String(row.id),
    vehicleId: String(row.vehicle_id),
    operationId: String(row.operation_id),
    start: row.start_time ? new Date(row.start_time).getTime() : 0,
    end: row.end_time ? new Date(row.end_time).getTime() : null,
    colour: row.trail_color || "",
    width: Number(row.trail_width) || 3,
    operator: row.operator_name ?? null,
    ha:
      row.trail_hectares === null || row.trail_hectares === undefined
        ? null
        : Number(row.trail_hectares),
    machine: row.vehicle_marker?.type ?? null,
    distance: numberOrNull(row.trail_distance),
    overlap: numberOrNull(row.trail_percentage_overlap),
  }
}

const numberOrNull = (value: unknown) =>
  value === null || value === undefined || Number.isNaN(Number(value))
    ? null
    : Number(value)

type LineGeometry =
  | { type: "LineString"; coordinates: LngLat[] }
  | { type: "MultiLineString"; coordinates: LngLat[][] }

export type TrailShape = {
  info: TrailInfo
  path: LineGeometry
  pausePath: LineGeometry | null
}

const isLine = (g: unknown): g is LineGeometry =>
  !!g &&
  typeof g === "object" &&
  ((g as Row).type === "LineString" || (g as Row).type === "MultiLineString")

/** The drawn shape of one finished trail. */
export async function loadTrailShape(
  info: TrailInfo,
): Promise<TrailShape | null> {
  const { data, error } = await supabase.rpc("get_trail_path_as_geojson", {
    trail_id_param: info.id,
  })
  if (error || !data) return null
  // Older deployments return the bare geometry rather than { path, pause_path }.
  const path = (data as Row).path ?? ((data as Row).type ? data : null)
  if (!isLine(path)) return null
  const pause = (data as Row).pause_path
  return { info, path, pausePath: isLine(pause) ? pause : null }
}

// ── A trail's timeline, for replaying it ──────────────────────────────────

/**
 * Read a line (or several) with a measure on every point from PostGIS's
 * EWKB hex, which is how a `geography` column arrives. A closed trail's
 * `detailed_path` is such a line: longitude, latitude, and the time each
 * point was laid as epoch milliseconds.
 */
export function parseTimedLines(hex: string): TrailPoint[][] {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2) return []
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++)
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16)
  const view = new DataView(bytes.buffer)
  let at = 0
  const lines: TrailPoint[][] = []

  const geometry = () => {
    const little = view.getUint8(at) === 1
    at += 1
    const type = view.getUint32(at, little)
    at += 4
    const hasZ = !!(type & 0x80000000)
    const hasM = !!(type & 0x40000000)
    if (type & 0x20000000) at += 4 // SRID
    const kind = type & 0xff
    const count = view.getUint32(at, little)
    at += 4
    if (kind === 2) {
      const line: TrailPoint[] = []
      for (let i = 0; i < count; i++) {
        const lng = view.getFloat64(at, little)
        const lat = view.getFloat64(at + 8, little)
        at += 16
        if (hasZ) at += 8
        let t = NaN
        if (hasM) {
          t = view.getFloat64(at, little)
          at += 8
        }
        line.push({ at: [lng, lat], t })
      }
      lines.push(line)
    } else if (kind === 5 || kind === 7) {
      // A multi-line (or a collection): each part is a geometry of its own.
      for (let i = 0; i < count; i++) geometry()
    } else throw new Error("not a line")
  }

  try {
    geometry()
  } catch {
    return []
  }
  return lines.filter((line) => line.length > 1)
}

export type TrailTimeline = {
  /** The trail in stretches (a pause splits it), oldest point first. */
  parts: TrailPoint[][]
  /** Every point carries the real time it was laid. */
  timed: boolean
}

/**
 * The points of a finished trail with the time each was laid, for replay.
 * Older trails without that detail come back untimed, from the drawn shape,
 * and are replayed at an even pace between their start and finish.
 */
export async function loadTrailTimeline(
  info: TrailInfo,
): Promise<TrailTimeline | null> {
  // The detail is a point a second or so: a very long trail would be many
  // megabytes on a phone, so those replay from the drawn shape instead.
  const hours = info.end ? (info.end - info.start) / 3_600_000 : 0
  const { data } =
    hours > 6
      ? { data: null }
      : await supabase
          .from("trails")
          .select("detailed_path")
          .eq("id", info.id)
          .maybeSingle()
  const raw = (data as Row | null)?.detailed_path
  let parts: TrailPoint[][] = []
  if (typeof raw === "string") parts = parseTimedLines(raw)
  else if (isLine(raw)) {
    // Some set-ups hand geography back as GeoJSON; the measure, if kept,
    // rides along as a third number.
    const lines = (
      raw.type === "LineString" ? [raw.coordinates] : raw.coordinates
    ) as number[][][]
    parts = lines.map((line) =>
      line.map((c) => ({
        at: [c[0], c[1]] as LngLat,
        t: c.length > 2 ? c[c.length - 1] : NaN,
      })),
    )
  }
  // A real timestamp is epoch milliseconds; anything else isn't a time.
  const timed =
    parts.length > 0 &&
    parts.every((line) => line.every((p) => p.t > 1e11 && p.t < 1e14))
  if (timed) return { parts, timed }

  const shape = await loadTrailShape(info)
  if (!shape) return null
  const lines = (
    shape.path.type === "LineString"
      ? [shape.path.coordinates]
      : shape.path.coordinates
  ) as LngLat[][]
  return {
    parts: lines
      .filter((line) => line.length > 1)
      .map((line) => line.map((at) => ({ at, t: NaN }))),
    timed: false,
  }
}

/** Delete a finished trail for good (the same call the current viewer makes). */
export async function deleteTrail(id: string) {
  const result = (await trailsApi.deleteTrail(id)) as Row
  if (result?.error) throw new Error(result.message || "Couldn't delete it")
}

/**
 * Finished trails of one job, newest first, handed over one at a time as
 * their shapes arrive so the map can fill in while it loads.
 */
export async function loadHistory(
  operationId: string,
  each: (shape: TrailShape) => void,
  cancelled: () => boolean,
): Promise<TrailInfo[]> {
  const rows = await readAll((from, to) =>
    supabase
      .from("trails")
      .select(TRAIL_COLUMNS)
      .eq("operation_id", operationId)
      .not("end_time", "is", null)
      .neq("source", "auto_travel")
      .order("start_time", { ascending: false })
      .range(from, to),
  )
  const trails = rows.map(trailFromRow)
  await pooled(trails, 6, async (info) => {
    if (cancelled()) return
    const shape = await loadTrailShape(info)
    if (shape && !cancelled()) each(shape)
  })
  return trails
}

export async function loadTrailPoints(trailId: string): Promise<TrailPoint[]> {
  const rows = await readAll((from, to) =>
    supabase
      .from("trail_stream")
      .select("coordinate, timestamp")
      .eq("trail_id", trailId)
      .order("timestamp", { ascending: true })
      .range(from, to),
  )
  return rows.flatMap(pointFromStream)
}

function pointFromStream(row: Row): TrailPoint[] {
  const coordinates = row.coordinate?.coordinates
  if (!Array.isArray(coordinates)) return []
  return [
    {
      at: [Number(coordinates[0]), Number(coordinates[1])],
      t: new Date(row.timestamp).getTime(),
    },
  ]
}

/**
 * Trails other people are painting right now in this job, with the points
 * laid so far. Read-only: unlike the old viewer's check, it never closes
 * anyone's trail.
 */
export async function loadLiveTrails(operationId: string, userId: string) {
  const { data, error } = await supabase
    .from("trails")
    .select(TRAIL_COLUMNS)
    .eq("operation_id", operationId)
    .neq("vehicle_id", userId)
    .neq("source", "auto_travel")
    .is("end_time", null)
    .order("start_time", { ascending: false })
  if (error) throw new Error(error.message)
  // One live trail per machine: the newest.
  const newest = new Map<string, TrailInfo>()
  for (const row of (data ?? []) as Row[]) {
    const info = trailFromRow(row)
    if (!newest.has(info.vehicleId)) newest.set(info.vehicleId, info)
  }
  return Promise.all(
    [...newest.values()].map(async (info) => ({
      info,
      points: await loadTrailPoints(info.id).catch(() => [] as TrailPoint[]),
    })),
  )
}

/** Follow trails starting, growing, finishing and being deleted in a job. */
export function watchTrails(
  operationId: string,
  userId: string,
  handlers: {
    started: (info: TrailInfo) => void
    point: (trailId: string, point: TrailPoint) => void
    finished: (info: TrailInfo) => void
    deleted: (id: string) => void
  },
) {
  const filter = `operation_id=eq.${operationId}`
  const theirs = (row: Row | undefined) =>
    !!row && row.vehicle_id !== userId && row.source !== "auto_travel"
  const channel = supabase
    .channel(`mapnext-trails-${operationId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "trails", filter },
      (payload: Row) => {
        if (theirs(payload.new)) handlers.started(trailFromRow(payload.new))
      },
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "trails", filter },
      (payload: Row) => {
        const row = payload.new as Row | undefined
        if (theirs(row) && row!.end_time) handlers.finished(trailFromRow(row!))
      },
    )
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "trails", filter },
      (payload: Row) => {
        if (payload.old?.id) handlers.deleted(String(payload.old.id))
      },
    )
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "trail_stream", filter },
      (payload: Row) => {
        const row = payload.new as Row | undefined
        if (!row?.trail_id) return
        for (const point of pointFromStream(row))
          handlers.point(String(row.trail_id), point)
      },
    )
    .subscribe()
  return () => {
    supabase.removeChannel(channel)
  }
}

/**
 * This person's own unfinished trail, if they have one that is still warm
 * (a point in the last half hour). Read-only.
 */
export async function findMyOpenTrail(userId: string) {
  const { data, error } = await supabase
    .from("trails")
    .select(TRAIL_COLUMNS)
    .eq("vehicle_id", userId)
    .is("end_time", null)
    .order("start_time", { ascending: false })
    .limit(1)
  if (error) throw new Error(error.message)
  const row = (data ?? [])[0] as Row | undefined
  if (!row) return null
  const info = trailFromRow(row)
  const points = await loadTrailPoints(info.id)
  const last = points.length ? points[points.length - 1].t : info.start
  if (Date.now() - last > 30 * 60_000) return null
  return { info, points }
}

// ── Farms the person can switch to ────────────────────────────────────────

export type FarmChoice = { id: string; name: string; owner: string }

export async function loadFarmChoices(
  userId: string,
  recent: string[],
): Promise<FarmChoice[]> {
  const columns =
    "id, map_name, master_user_id, profiles:master_user_id(full_name)"
  const [owned, visited] = await Promise.all([
    supabase.from("master_maps").select(columns).eq("master_user_id", userId),
    recent.length
      ? supabase.from("master_maps").select(columns).in("id", recent)
      : Promise.resolve({ data: [] as Row[], error: null }),
  ])
  const seen = new Set<string>()
  const farms: FarmChoice[] = []
  const add = (row: Row) => {
    if (seen.has(row.id)) return
    seen.add(row.id)
    farms.push({
      id: String(row.id),
      name: row.map_name || "Unnamed farm",
      owner:
        row.master_user_id === userId
          ? "You"
          : (row.profiles?.full_name ?? "Someone else"),
    })
  }
  // Most recently opened first, then any others the person owns.
  for (const id of recent) {
    const row = ((visited.data ?? []) as Row[]).find((m) => m.id === id)
    if (row) add(row)
  }
  for (const row of (owned.data ?? []) as Row[]) add(row)
  return farms
}

// ── Messages ────────────────────────────────────────────────────────────
// Direct messages between two people on a map: the `map_messages` table the
// current viewer writes, so a conversation carries on across both viewers.

/** A place sent with a message: a spot, or a pin, paddock or machine. */
export type SharedPlace = {
  at: LngLat
  label: string
  refType: "marker" | "field" | "vehicle" | null
  refId: string | null
}

/** One thing a job points at: a paddock, a pin, or just a spot. */
export type JobItem = {
  type: "field" | "marker" | "spot"
  id: string | null
  label: string
  at: LngLat
}

/**
 * A job on the map (`map_jobs`): what to do and where. It is either given
 * to one person or left open for anyone on the crew to take; whoever takes
 * it moves it from open to "on it" to done.
 */
export type Job = {
  id: string
  title: string
  note: string
  items: JobItem[]
  status: "open" | "accepted" | "done"
  createdBy: string
  createdByName: string | null
  /** Who it was given to; null when it is open to anyone. */
  assignedTo: string | null
  /** Who took it on. */
  takenBy: string | null
  takenByName: string | null
  /** ms */
  createdAt: number
  acceptedAt: number | null
  doneAt: number | null
}

export type Message = {
  id: number
  from: string
  fromName: string | null
  to: string
  body: string
  place: SharedPlace | null
  /** The job this message handed over, if it handed one over. */
  jobRef: { id: string; title: string } | null
  /** ms */
  at: number
  /** The other person has opened it. */
  read: boolean
}

function messageFromRow(row: Row): Message {
  const attachment = row.attachment as Row | null
  const lng = Number(attachment?.lng)
  const lat = Number(attachment?.lat)
  return {
    jobRef: attachment?.job?.id
      ? {
          id: String(attachment.job.id),
          title: String(attachment.job.title ?? "Job"),
        }
      : null,
    id: Number(row.id),
    from: String(row.sender_id),
    fromName: row.sender_name ?? null,
    to: String(row.recipient_id),
    body: row.body ?? "",
    place:
      attachment && Number.isFinite(lng) && Number.isFinite(lat)
        ? {
            at: [lng, lat],
            label: attachment.label || "Shared location",
            refType: attachment.refType ?? null,
            refId: attachment.refId ?? null,
          }
        : null,
    at: row.created_at ? Date.parse(row.created_at) : Date.now(),
    read: !!row.read_at,
  }
}

/** Everything I've sent or been sent on this map lately, newest first. */
export async function loadMessages(
  mapId: string,
  userId: string,
  limit = 300,
): Promise<Message[]> {
  const { data, error } = await supabase
    .from("map_messages")
    .select("*")
    .eq("master_map_id", mapId)
    .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
    .order("id", { ascending: false })
    .limit(limit)
  if (error) throw error
  return ((data ?? []) as Row[])
    .map(messageFromRow)
    .filter((m) => m.from === userId || m.to === userId)
}

/** One conversation, oldest first. */
export async function loadConversation(
  mapId: string,
  userId: string,
  otherId: string,
  limit = 100,
): Promise<Message[]> {
  const { data, error } = await supabase
    .from("map_messages")
    .select("*")
    .eq("master_map_id", mapId)
    .or(
      `and(sender_id.eq.${userId},recipient_id.eq.${otherId}),and(sender_id.eq.${otherId},recipient_id.eq.${userId})`,
    )
    .order("id", { ascending: false })
    .limit(limit)
  if (error) throw error
  return ((data ?? []) as Row[])
    .map(messageFromRow)
    .filter(
      (m) =>
        (m.from === userId && m.to === otherId) ||
        (m.from === otherId && m.to === userId),
    )
    .reverse()
}

/**
 * Send a message. If the other person hasn't got the map open, their phone
 * is buzzed as well, the way the current viewer does it.
 */
export async function sendMessage(message: {
  mapId: string
  from: string
  fromName: string
  to: string
  body: string
  place: SharedPlace | null
  /** A job being handed to them; the message points at it. */
  job?: Job | null
  /** The other person has the map open right now. */
  online: boolean
}): Promise<Message> {
  const job = message.job ?? null
  const first = job?.items[0]
  // A job is also a place (its first one), so the current viewer, which
  // knows nothing of jobs, still shows where it is.
  const place: SharedPlace | null =
    job && first
      ? {
          at: first.at,
          label: `Job: ${job.title}`.slice(0, 80),
          refType: first.type === "spot" ? null : first.type,
          refId: first.id,
        }
      : message.place
  const { data, error } = await supabase
    .from("map_messages")
    .insert({
      master_map_id: message.mapId,
      sender_id: message.from,
      sender_name: message.fromName,
      recipient_id: message.to,
      body: message.body,
      attachment: place
        ? {
            kind: "location",
            lng: place.at[0],
            lat: place.at[1],
            label: place.label,
            refType: place.refType,
            refId: place.refId,
            ...(job ? { job: { id: job.id, title: job.title } } : {}),
          }
        : null,
    })
    .select("*")
    .single()
  if (error) throw error
  if (!message.online)
    supabase.functions
      .invoke("send-message-push", {
        body: {
          recipient_id: message.to,
          sender_name: message.fromName,
          // A place or a job sent on its own still says what it is.
          body: message.body || place?.label || "",
        },
      })
      .catch(() => {})
  return messageFromRow(data as Row)
}

/** Mark everything one person has sent me as read. */
export async function markMessagesRead(
  mapId: string,
  userId: string,
  otherId: string,
) {
  const { error } = await supabase
    .from("map_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("master_map_id", mapId)
    .eq("recipient_id", userId)
    .eq("sender_id", otherId)
    .is("read_at", null)
  if (error) throw error
}

/**
 * Hear messages on this map as they happen: one sent to me arriving, and
 * one of mine (either way) changing, such as being read.
 */
export function watchMessages(
  mapId: string,
  userId: string,
  handlers: {
    arrived: (message: Message) => void
    changed: (message: Message) => void
  },
) {
  const mine = (row: Row | undefined): row is Row =>
    !!row && (row.recipient_id === userId || row.sender_id === userId)
  const channel = supabase
    .channel(`mapnext-messages-${mapId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "map_messages",
        filter: `master_map_id=eq.${mapId}`,
      },
      (payload: Row) => {
        const row = payload.new as Row | undefined
        if (!row || row.recipient_id !== userId) return
        handlers.arrived(messageFromRow(row))
      },
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "map_messages",
        filter: `master_map_id=eq.${mapId}`,
      },
      (payload: Row) => {
        const row = payload.new as Row | undefined
        if (mine(row)) handlers.changed(messageFromRow(row))
      },
    )
    .subscribe()
  return () => {
    supabase.removeChannel(channel)
  }
}

// ── Things attached to a pin: drawings and photos ───────────────────────
// The same rows and files the current viewer keeps, so what is attached on
// either viewer shows on both.

/** An area or a line drawn on the map and attached to a pin. */
export type PinDrawing = {
  id: string
  pinId: string
  kind: "polygon" | "line"
  geometry: { type: string; coordinates: unknown }
  colour: string
  fillOpacity: number
  /** A multiplier of the map's scale, as the current viewer saves it. */
  width: number
  dashed: boolean
  /** ms */
  t: number
}

/** The colours a drawing can be (the current viewer's six). */
export const DRAWING_COLOURS = [
  "#0ea5e9",
  "#22c55e",
  "#ef4444",
  "#eab308",
  "#a855f7",
  "#f97316",
]

function drawingFromRow(row: Row): PinDrawing | null {
  let geometry = row.geometry
  if (typeof geometry === "string") {
    try {
      geometry = JSON.parse(geometry)
    } catch {
      return null
    }
  }
  if (!geometry?.type || !geometry.coordinates) return null
  const style = (row.style ?? {}) as Row
  return {
    id: String(row.id),
    pinId: String(row.marker_id),
    kind: row.drawing_type === "line" ? "line" : "polygon",
    geometry,
    colour: style.strokeColor || style.fillColor || DRAWING_COLOURS[0],
    fillOpacity: Number.isFinite(Number(style.fillOpacity))
      ? Number(style.fillOpacity)
      : 0.5,
    width: Number(style.strokeWidth) || 3,
    dashed: style.strokeStyle === "dashed",
    t: row.created_at ? Date.parse(row.created_at) : Date.now(),
  }
}

/** Every drawing on this map whose pin is still there, oldest first. */
export async function loadDrawings(mapId: string): Promise<PinDrawing[]> {
  const { data, error } = await supabase
    .from("marker_drawings")
    .select(
      "id, marker_id, drawing_type, style, created_at, geometry:geometry_geojson, map_markers(deleted)",
    )
    .eq("master_map_id", mapId)
    .or("deleted.is.null,deleted.eq.false")
    .order("created_at", { ascending: true })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Row[])
    .filter((row) => row.deleted !== true && !row.map_markers?.deleted)
    .map(drawingFromRow)
    .filter((drawing): drawing is PinDrawing => !!drawing)
}

/** Hear that a drawing on this map was added, changed or removed. */
export function watchDrawings(mapId: string, changed: () => void) {
  const channel = supabase
    .channel(`mapnext-drawings-${mapId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "marker_drawings",
        filter: `master_map_id=eq.${mapId}`,
      },
      () => changed(),
    )
    .subscribe()
  return () => {
    supabase.removeChannel(channel)
  }
}

/**
 * Attach an area (three or more corners) or a line (two or more points) to
 * a pin, through the same database function the current viewer calls.
 */
export async function createDrawing(drawing: {
  mapId: string
  userId: string
  pinId: string
  kind: "polygon" | "line"
  points: LngLat[]
  colour: string
}): Promise<string> {
  const text = (points: LngLat[]) =>
    points.map(([lng, lat]) => `${lng} ${lat}`).join(", ")
  const wkt =
    drawing.kind === "polygon"
      ? `POLYGON((${text([...drawing.points, drawing.points[0]])}))`
      : `LINESTRING(${text(drawing.points)})`
  const { data, error } = await supabase.rpc("insert_marker_drawing", {
    p_marker_id: drawing.pinId,
    p_master_map_id: drawing.mapId,
    p_drawing_type: drawing.kind,
    p_geometry_wkt: wkt,
    p_style: {
      fillColor: drawing.colour,
      strokeColor: drawing.colour,
      fillOpacity: 0.5,
      strokeWidth: 3,
      strokeStyle: "solid",
    },
    p_user_id: drawing.userId,
  })
  if (error) throw new Error(error.message)
  return String(data)
}

/** Take a drawing off its pin (kept in the table, marked deleted). */
export async function deleteDrawing(id: string, userId: string) {
  const { error } = await supabase
    .from("marker_drawings")
    .update({
      deleted: true,
      deleted_at: new Date().toISOString(),
      update_user_id: userId,
    })
    .eq("id", id)
  if (error) throw new Error(error.message)
}

const PHOTO_BUCKET = "user_files_bucket"

/** Links to a pin's photos, good for an hour (the files are private). */
export async function loadPhotoLinks(
  photos: PinPhoto[],
): Promise<Record<string, string>> {
  const links: Record<string, string> = {}
  await Promise.all(
    photos.map(async (photo) => {
      const { data } = await supabase.storage
        .from(PHOTO_BUCKET)
        .createSignedUrl(photo.path, 3600)
      if (data?.signedUrl) links[photo.id] = data.signedUrl
    }),
  )
  return links
}

/** Read a pin's photo list, change it, and write it back. */
async function writePhotos(
  pinId: string,
  userId: string,
  change: (photos: PinPhoto[]) => PinPhoto[],
) {
  const { data, error } = await supabase
    .from("map_markers")
    .select("marker_data")
    .eq("id", pinId)
    .single()
  if (error) throw new Error(error.message)
  const current = ((data as Row | null)?.marker_data ?? {}) as Row
  const photos = change(photosOf(current.properties))
  const { error: failed } = await supabase
    .from("map_markers")
    .update({
      marker_data: {
        ...current,
        properties: { ...(current.properties ?? {}), photos },
      },
      updated_at: new Date().toISOString(),
      update_user_id: userId,
    })
    .eq("id", pinId)
  if (failed) throw new Error(failed.message)
  return photos
}

/** Add a photo to a pin: the file goes up first, then the pin lists it. */
export async function addPinPhoto(
  mapId: string,
  pinId: string,
  userId: string,
  image: Blob,
): Promise<PinPhoto[]> {
  const id = uuidv4() as string
  const path = `maps/${mapId}/marker-photos/${pinId}/${id}.${
    image.type === "image/png" ? "png" : "jpg"
  }`
  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, image, {
      contentType: image.type || "image/jpeg",
      upsert: false,
    })
  if (error) throw new Error(error.message)
  const photo: PinPhoto = { id, path, created_at: new Date().toISOString() }
  return writePhotos(pinId, userId, (photos) => [...photos, photo])
}

/** Remove a photo from a pin, and its file. */
export async function removePinPhoto(
  pinId: string,
  userId: string,
  photo: PinPhoto,
): Promise<PinPhoto[]> {
  await supabase.storage.from(PHOTO_BUCKET).remove([photo.path])
  return writePhotos(pinId, userId, (photos) =>
    photos.filter((p) => p.id !== photo.id),
  )
}

// ── Things kept on a paddock: areas and lines with a name ───────────────
// Kept in the paddock's own `properties` (under `agskan_features`), beside
// whatever its import left there, so no other screen is disturbed by them.

/** Read a paddock's features, change them, write them back. */
async function writeFeatures(
  paddockId: string,
  change: (features: PaddockFeature[]) => PaddockFeature[],
) {
  const { data, error } = await supabase
    .from("fields")
    .select("properties")
    .eq("field_id", paddockId)
    .single()
  if (error) throw new Error(error.message)
  const properties = ((data as Row | null)?.properties ?? {}) as Row
  const features = change(featuresOf(properties))
  const { error: failed } = await supabase
    .from("fields")
    .update({
      properties: {
        ...properties,
        agskan_features: features.map((feature) => ({
          id: feature.id,
          kind: feature.kind,
          label: feature.label,
          colour: feature.colour,
          coordinates: feature.coordinates,
          created_at: new Date(feature.t).toISOString(),
        })),
      },
    })
    .eq("field_id", paddockId)
  if (failed) throw new Error(failed.message)
  return features
}

/** Keep an area or a line on a paddock, with a name. */
export function addPaddockFeature(
  paddockId: string,
  feature: Omit<PaddockFeature, "id" | "t">,
) {
  const added: PaddockFeature = {
    ...feature,
    id: uuidv4() as string,
    t: Date.now(),
  }
  return writeFeatures(paddockId, (features) => [...features, added])
}

export function removePaddockFeature(paddockId: string, featureId: string) {
  return writeFeatures(paddockId, (features) =>
    features.filter((feature) => feature.id !== featureId),
  )
}

const HA = 10_000

/**
 * Cut an area out of a paddock for good: its boundary gets a hole (or loses
 * a bite from its edge) and its hectares come down to match. Resolves with
 * the new shape, or null if the area doesn't touch the paddock.
 */
export async function cutPaddock(
  paddock: Paddock,
  area: LngLat[],
): Promise<{ polygons: LngLat[][][]; ha: number } | null> {
  const before = {
    type: "Feature" as const,
    properties: {},
    geometry: { type: "MultiPolygon" as const, coordinates: paddock.polygons },
  }
  const bite = {
    type: "Feature" as const,
    properties: {},
    geometry: {
      type: "Polygon" as const,
      coordinates: [[...area, area[0]]],
    },
  }
  const after = difference({
    type: "FeatureCollection",
    features: [before, bite],
  } as never)
  if (!after) return null
  const polygons = (
    after.geometry.type === "Polygon"
      ? [after.geometry.coordinates]
      : after.geometry.coordinates
  ) as LngLat[][][]
  const parts = polygons.map(
    (coordinates) => turfArea({ type: "Polygon", coordinates } as never) / HA,
  )
  const measured = parts.reduce((sum, part) => sum + part, 0)
  // Nothing came off: the area was drawn outside the paddock.
  const was = turfArea(before as never) / HA
  const off = was - measured
  if (!(off > 0.0001)) return null
  // The farm's own figure for the paddock comes down by what was cut,
  // rather than being replaced by a measurement of its outline.
  const ha = polygons.length > 1 ? measured : Math.max(0, paddock.ha - off)
  const result = (await fileApi.updateField(paddock.id, {
    boundary:
      polygons.length === 1
        ? { type: "Polygon", coordinates: polygons[0] }
        : { type: "MultiPolygon", coordinates: polygons },
    area: ha,
    polygonAreas:
      polygons.length > 1 ? { individual_areas: parts, total_area: ha } : null,
  })) as Row
  if (result?.error || result?.success === false)
    throw new Error(result.message || result.error || "Couldn't save")
  return { polygons, ha }
}

// ── Who is on the map: inviting and removing ────────────────────────────

/**
 * A link that lets someone onto this map as a guest, the same kind the
 * current viewer's "Invite to map" makes. Good for a week.
 */
export async function createGuestInvite(): Promise<string> {
  const { data, error } = await supabase.rpc("create_map_invite", {
    p_role: "viewer",
    p_expires_hours: 168,
    p_access_hours: 48,
    p_retain_on_signup: false,
  })
  if (error) throw new Error(error.message)
  const row = (Array.isArray(data) ? data[0] : data) as Row | null
  if (!row?.token) throw new Error("No invite came back")
  return `https://www.skanfarming.com.au/guest?invite=${row.token}`
}

/**
 * Take someone off this map. A guest is removed the way the current
 * viewer's people menu does it; one of the crew the way the account page
 * does (which only the farm's owner is offered).
 */
export async function removeFromMap(person: { id: string; guest: boolean }) {
  if (person.guest) {
    const { error } = await supabase.rpc("revoke_guest_access", {
      p_user_id: person.id,
    })
    if (error) throw new Error(error.message)
    return
  }
  const result = (await mapApi.kickUser(person.id)) as Row
  if (!result?.success) throw new Error(result?.message || "Couldn't remove")
}

// ── Jobs (`map_jobs`) ───────────────────────────────────────────────────

function jobFromRow(row: Row): Job {
  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    note: String(row.note ?? ""),
    items: (Array.isArray(row.items) ? (row.items as Row[]) : [])
      .filter(
        (item) =>
          Number.isFinite(Number(item?.lng)) &&
          Number.isFinite(Number(item?.lat)),
      )
      .map((item) => ({
        type:
          item.type === "field" || item.type === "marker" ? item.type : "spot",
        id: item.id ? String(item.id) : null,
        label: String(item.label ?? ""),
        at: [Number(item.lng), Number(item.lat)] as LngLat,
      })),
    status:
      row.status === "accepted" || row.status === "done" ? row.status : "open",
    createdBy: String(row.created_by),
    createdByName: row.created_by_name ?? null,
    assignedTo: row.assigned_to ? String(row.assigned_to) : null,
    takenBy: row.taken_by ? String(row.taken_by) : null,
    takenByName: row.taken_by_name ?? null,
    createdAt: row.created_at ? Date.parse(row.created_at) : Date.now(),
    acceptedAt: row.taken_at ? Date.parse(row.taken_at) : null,
    doneAt: row.done_at ? Date.parse(row.done_at) : null,
  }
}

/** The jobs on this map that haven't been withdrawn, the newest first. */
export async function loadJobs(mapId: string): Promise<Job[]> {
  const { data, error } = await supabase
    .from("map_jobs")
    .select("*")
    .eq("master_map_id", mapId)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(200)
  if (error) throw new Error(error.message)
  return ((data ?? []) as Row[])
    .filter((row) => row.status !== "cancelled")
    .map(jobFromRow)
}

/** Post a job: for one person, or (`assignedTo` null) for anyone to take. */
export async function createJob(job: {
  mapId: string
  userId: string
  name: string
  assignedTo: string | null
  title: string
  note: string
  items: JobItem[]
}): Promise<Job> {
  const { data, error } = await supabase
    .from("map_jobs")
    .insert({
      master_map_id: job.mapId,
      created_by: job.userId,
      created_by_name: job.name,
      assigned_to: job.assignedTo,
      title: job.title,
      note: job.note,
      items: job.items.map((item) => ({
        type: item.type,
        id: item.id,
        label: item.label,
        lng: item.at[0],
        lat: item.at[1],
      })),
    })
    .select("*")
    .single()
  if (error) throw new Error(error.message)
  return jobFromRow(data as Row)
}

/**
 * Take a job on. Only a job nobody has started can be taken, so if two
 * people tap at once one of them is told it has gone (null).
 */
export async function takeJob(
  id: string,
  userId: string,
  name: string,
): Promise<Job | null> {
  const { data, error } = await supabase
    .from("map_jobs")
    .update({
      status: "accepted",
      taken_by: userId,
      taken_by_name: name,
      taken_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "open")
    .select("*")
  if (error) throw new Error(error.message)
  const row = ((data ?? []) as Row[])[0]
  return row ? jobFromRow(row) : null
}

/** Say a job is done (taking it on first, if it was done straight off). */
export async function finishJob(
  job: Job,
  userId: string,
  name: string,
): Promise<Job | null> {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from("map_jobs")
    .update({
      status: "done",
      done_at: now,
      ...(job.takenBy
        ? {}
        : { taken_by: userId, taken_by_name: name, taken_at: now }),
    })
    .eq("id", job.id)
    .neq("status", "done")
    .select("*")
  if (error) throw new Error(error.message)
  const row = ((data ?? []) as Row[])[0]
  return row ? jobFromRow(row) : null
}

/** Withdraw a job (whoever posted it). It is kept, marked cancelled. */
export async function cancelJob(id: string) {
  const { error } = await supabase
    .from("map_jobs")
    .update({ status: "cancelled" })
    .eq("id", id)
  if (error) throw new Error(error.message)
}

/** Hear jobs on this map being posted, taken, finished and withdrawn. */
export function watchJobs(
  mapId: string,
  handlers: { changed: (job: Job) => void; gone: (id: string) => void },
) {
  const channel = supabase
    .channel(`mapnext-jobs-${mapId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "map_jobs",
        filter: `master_map_id=eq.${mapId}`,
      },
      (payload: Row) => {
        const row = payload.new as Row | undefined
        if (payload.eventType === "DELETE" || row?.status === "cancelled") {
          const id = row?.id ?? payload.old?.id
          if (id) handlers.gone(String(id))
          return
        }
        if (row?.id) handlers.changed(jobFromRow(row))
      },
    )
    .subscribe()
  return () => {
    supabase.removeChannel(channel)
  }
}
