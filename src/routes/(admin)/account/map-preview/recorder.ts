/**
 * Recording this person's own trail.
 *
 * Every write goes through the app's existing `trailsApi`, in the order the
 * current viewer uses: open a trail row, stream each point to the server as
 * it is laid, and on stop hand the whole path over to be closed (which is
 * what builds the spray records and the hectares). Points that can't be sent
 * wait in a queue, kept in localStorage, and are retried; a trail is only
 * closed once every point has reached the server.
 *
 * Left out on purpose for now: pausing a trail, and the automatic
 * trail-per-paddock mode.
 */
import { get, writable, type Writable } from "svelte/store"
import { trailsApi } from "$lib/api/trailsApi"
import type { LngLat } from "$lib/components/mapnext/geo"
import {
  findMyOpenTrail,
  loadTrailPoints,
  type TrailInfo,
  type TrailPoint,
  type VehicleMarkerData,
} from "./liveData"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>

export type RecorderState = {
  /**
   * "found": this person has a trail running that this screen didn't start
   * (most likely on another device). It is shown, but nothing is added to it
   * from here until they say this is the machine doing the work.
   */
  phase: "off" | "found" | "starting" | "on" | "stopping"
  trail: TrailInfo | null
  /** Points laid but not yet on the server. */
  waiting: number
  /** Why the last start or stop didn't go through, in plain words. */
  problem: string | null
}

export type FinishedTrail = {
  info: TrailInfo
  points: TrailPoint[]
  /** One per paddock the trail covered; empty when it covered none. */
  sprayRecords: { field_name?: string; area_hectares?: number }[]
}

type Pending = { trailId: string; operationId: string; points: TrailPoint[] }

const STORE = "agskan-map-next:trail-queue"
/** The trail this device itself is recording, so a reload carries on. */
const HERE = "agskan-map-next:trail-here"

const recordingHere = () => {
  try {
    return localStorage.getItem(HERE)
  } catch {
    return null
  }
}
const rememberHere = (trailId: string | null) => {
  try {
    if (trailId) localStorage.setItem(HERE, trailId)
    else localStorage.removeItem(HERE)
  } catch {
    // Storage blocked: a reload will ask before carrying on.
  }
}

const readQueue = (): Pending | null => {
  try {
    const raw = localStorage.getItem(STORE)
    return raw ? (JSON.parse(raw) as Pending) : null
  } catch {
    return null
  }
}
const writeQueue = (queue: Pending | null) => {
  try {
    if (queue && queue.points.length)
      localStorage.setItem(STORE, JSON.stringify(queue))
    else localStorage.removeItem(STORE)
  } catch {
    // Storage blocked: the queue still lives in memory for this visit.
  }
}

const infoFromTrailRow = (row: Row): TrailInfo => ({
  id: String(row.id),
  vehicleId: String(row.vehicle_id),
  operationId: String(row.operation_id),
  start: row.start_time ? new Date(row.start_time).getTime() : Date.now(),
  end: null,
  colour: row.trail_color || "",
  width: Number(row.trail_width) || 3,
  operator: row.operator_name ?? null,
  ha: null,
})

export class TrailRecorder {
  readonly state: Writable<RecorderState> = writable({
    phase: "off",
    trail: null,
    waiting: 0,
    problem: null,
  })
  /** Every point of the trail being recorded, oldest first. */
  points: TrailPoint[] = []

  private queue: TrailPoint[] = []
  private sending = false
  private retry: ReturnType<typeof setInterval> | null = null

  constructor(private userId: string) {
    if (typeof window !== "undefined")
      window.addEventListener("online", this.flush)
  }

  get recording() {
    return get(this.state).phase === "on"
  }

  /** A trail of this person's is running, but not from this screen. */
  get elsewhere() {
    return get(this.state).phase === "found"
  }

  /**
   * Look for a trail this person left running. One this device was
   * recording (the page reloaded) carries straight on. One started somewhere
   * else is only shown: adding this screen's position to a trail another
   * machine is laying would spoil it, so that waits for `carryOn`.
   */
  async resume() {
    if (get(this.state).phase !== "off") return
    const open = await findMyOpenTrail(this.userId).catch(() => null)
    if (!open || get(this.state).phase !== "off") return
    if (recordingHere() === open.info.id) {
      this.adopt(open.info, open.points)
      return
    }
    this.points = [...open.points]
    this.state.set({
      phase: "found",
      trail: open.info,
      waiting: 0,
      problem: null,
    })
  }

  /** This is the machine doing the work: record the found trail from here. */
  carryOn() {
    const { phase, trail } = get(this.state)
    if (phase === "found" && trail) this.adopt(trail, this.points)
  }

  /** Has the trail found elsewhere been finished since? */
  async recheck() {
    if (!this.elsewhere) return
    const open = await findMyOpenTrail(this.userId).catch(() => undefined)
    // `undefined` is a failed check: leave things as they are.
    if (open === undefined || !this.elsewhere) return
    if (!open) this.reset()
    else {
      this.points = [...open.points]
      this.state.update((s) => ({ ...s, trail: open.info }))
    }
  }

  private adopt(info: TrailInfo, points: TrailPoint[]) {
    this.points = [...points]
    const saved = readQueue()
    this.queue = saved?.trailId === info.id ? saved.points : []
    for (const point of this.queue)
      if (!this.points.some((p) => p.t === point.t)) this.points.push(point)
    this.points.sort((a, b) => a.t - b.t)
    rememberHere(info.id)
    this.state.set({
      phase: "on",
      trail: info,
      waiting: this.queue.length,
      problem: null,
    })
    this.keepRetrying()
    this.flush()
  }

  async start(
    operationId: string,
    marker: VehicleMarkerData,
    operator: { id: string; name: string } | null,
  ) {
    if (get(this.state).phase !== "off") return
    this.state.update((s) => ({ ...s, phase: "starting", problem: null }))
    try {
      // Tidies up anything this person left open (closing stale trails) and
      // hands back one that is still warm, exactly as the current viewer does
      // before it lets a new trail start.
      const check = (await trailsApi.checkOpenTrails(this.userId)) as Row
      if (check?.error) throw new Error(check.message)
      if (check?.openTrail) {
        const points: TrailPoint[] = (check.trailData ?? []).map((p: Row) => ({
          at: [p.coordinates.longitude, p.coordinates.latitude] as LngLat,
          t: p.timestamp,
        }))
        this.adopt(infoFromTrailRow(check.openTrail), points)
        return
      }
      const opened = (await trailsApi.openNewTrail(
        this.userId,
        operationId,
        { vehicle_marker: marker },
        operator,
      )) as Row
      if (opened?.error || !opened?.trail)
        throw new Error(opened?.message || "The trail didn't start")
      this.adopt(infoFromTrailRow(opened.trail), [])
    } catch (error) {
      this.state.set({
        phase: "off",
        trail: null,
        waiting: 0,
        problem: navigator.onLine
          ? "The trail didn't start. Try again."
          : "No signal: a trail needs a connection to start.",
      })
      console.warn("[map-preview] trail start failed", error)
    }
  }

  /** Lay a point (while recording). Timestamps stay unique per trail. */
  add(at: LngLat, t: number) {
    const { phase, trail } = get(this.state)
    if (phase !== "on" || !trail) return
    const last = this.points[this.points.length - 1]
    const stamp = last && t <= last.t ? last.t + 1 : t
    const point = { at, t: stamp }
    this.points.push(point)
    this.queue.push(point)
    this.remember(trail)
    this.flush()
  }

  private remember(trail: TrailInfo) {
    writeQueue({
      trailId: trail.id,
      operationId: trail.operationId,
      points: this.queue,
    })
    this.state.update((s) => ({ ...s, waiting: this.queue.length }))
  }

  /** Send whatever is waiting. Resolves true when nothing is left. */
  flush = async (): Promise<boolean> => {
    const { trail } = get(this.state)
    if (!trail) return true
    if (this.sending) return this.queue.length === 0
    if (!this.queue.length) return true
    this.sending = true
    const batch = [...this.queue]
    try {
      const result = (await trailsApi.saveCoordinates(
        trail.operationId,
        trail.id,
        batch.map((p) => ({
          coordinates: { latitude: p.at[1], longitude: p.at[0] },
          timestamp: p.t,
        })),
      )) as Row
      if (result?.error) return false
      const sent = new Set(batch.map((p) => p.t))
      this.queue = this.queue.filter((p) => !sent.has(p.t))
      this.remember(trail)
    } finally {
      this.sending = false
    }
    // Points laid while that batch was in the air.
    return this.queue.length ? this.flush() : true
  }

  private keepRetrying() {
    if (this.retry) return
    this.retry = setInterval(() => {
      if (this.queue.length) this.flush()
    }, 10_000)
  }

  /**
   * Finish the trail. Resolves with it once the server has it; with null if
   * it was too short to keep (it is then deleted, as in the current viewer),
   * or if it couldn't be saved yet, in which case it stays running and
   * `state.problem` says why.
   */
  async stop(): Promise<FinishedTrail | null> {
    const { phase, trail } = get(this.state)
    if (phase !== "on" || !trail) return null
    this.state.update((s) => ({ ...s, phase: "stopping", problem: null }))
    const giveUp = (problem: string) => {
      this.state.update((s) => ({ ...s, phase: "on", problem }))
      return null
    }
    try {
      // A send may be in the air: wait for it, then send the rest.
      for (let i = 0; i < 40 && this.sending; i++)
        await new Promise((r) => setTimeout(r, 150))
      if (!(await this.flush()))
        return giveUp(
          "No signal, so the trail can't be saved yet. It's still running: stop it again when you're back in range.",
        )

      // The server's copy is the record; add anything only it has (points
      // from another screen), in time order.
      const stored = await loadTrailPoints(trail.id)
      const byTime = new Map<number, TrailPoint>()
      for (const point of [...stored, ...this.points])
        byTime.set(point.t, point)
      const path = [...byTime.values()].sort((a, b) => a.t - b.t)

      if (path.length < 2) {
        const removed = (await trailsApi.deleteTrail(trail.id)) as Row
        if (removed?.error)
          return giveUp("Couldn't finish the trail. Try again.")
        this.reset()
        return null
      }

      const closed = (await trailsApi.closeTrail({
        trail_id: trail.id,
        vehicle_id: trail.vehicleId,
        operation_id: trail.operationId,
        trail_color: trail.colour,
        trail_width: trail.width,
        path: path.map((p) => ({
          latitude: p.at[1],
          longitude: p.at[0],
          timestamp: p.t,
        })),
        pauses: [],
      })) as Row
      if (closed?.error) return giveUp("Couldn't save the trail. Try again.")

      const finished: FinishedTrail = {
        info: {
          ...trail,
          end: Date.now(),
          ha:
            closed.trail?.trail_hectares === null ||
            closed.trail?.trail_hectares === undefined
              ? null
              : Number(closed.trail.trail_hectares),
        },
        points: path,
        sprayRecords: Array.isArray(closed.sprayRecords)
          ? closed.sprayRecords
          : [],
      }
      this.reset()
      return finished
    } catch (error) {
      console.warn("[map-preview] trail stop failed", error)
      return giveUp("Couldn't save the trail. Try again.")
    }
  }

  private reset() {
    this.points = []
    this.queue = []
    writeQueue(null)
    rememberHere(null)
    this.state.set({ phase: "off", trail: null, waiting: 0, problem: null })
  }

  destroy() {
    if (this.retry) clearInterval(this.retry)
    if (typeof window !== "undefined")
      window.removeEventListener("online", this.flush)
  }
}

/** Confirm the spray records a finished trail produced. */
export async function confirmSprayRecords(
  trailId: string,
  operator: { id: string; name: string } | null,
) {
  const result = (await trailsApi.confirmSprayRecords(
    trailId,
    operator?.id,
    operator?.name,
  )) as Row
  return !result?.error
}
