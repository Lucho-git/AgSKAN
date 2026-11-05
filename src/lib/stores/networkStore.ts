// src/lib/stores/networkStore.ts
//
// One shared answer to "can we reach the backend right now?".
//
// `navigator.onLine` alone is not good enough out here: it reports "online"
// on a wifi link with no upstream (captive portals, farm sheds), and some
// Android VPNs report "offline" while the radio is fine. So the status is
// driven by an active, cheap probe against the Supabase host — any HTTP
// response counts as reachable, only a transport failure does not.

import { writable, derived, get, type Readable } from "svelte/store"
import { browser } from "$app/environment"
import { PUBLIC_SUPABASE_URL } from "$env/static/public"

export type NetworkStatus = "unknown" | "online" | "degraded" | "offline"

export interface NetworkState {
  status: NetworkStatus
  /** What the browser/WebView thinks (cheap, but unreliable). */
  browserOnline: boolean
  /** Result of the last real probe. null = never probed yet. */
  serverReachable: boolean | null
  lastCheckAt: number | null
  lastOnlineAt: number | null
}

const PROBE_TIMEOUT_MS = 6000
const PROBE_INTERVAL_MS = 60_000
const MIN_PROBE_GAP_MS = 5_000

const initialState: NetworkState = {
  status: "unknown",
  browserOnline: browser ? navigator.onLine !== false : true,
  serverReachable: null,
  lastCheckAt: null,
  lastOnlineAt: null,
}

export const networkStore = writable<NetworkState>(initialState)

export const isOffline: Readable<boolean> = derived(
  networkStore,
  ($net) => $net.status === "offline",
)

let started = false
let intervalId: ReturnType<typeof setInterval> | null = null
let inFlight: Promise<NetworkState> | null = null
let lastProbeStartedAt = 0

async function probeOnce(timeoutMs = PROBE_TIMEOUT_MS): Promise<boolean> {
  if (!browser) return true

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    // Any response — 200, 404 or 401 — proves the host is reachable.
    await fetch(`${PUBLIC_SUPABASE_URL}/auth/v1/health`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: { accept: "application/json" },
    })
    return true
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Probe the backend now.
 *
 * Two attempts are made before declaring the server unreachable so a single
 * dropped packet doesn't flash the offline banner at the user.
 */
export async function refreshNetworkNow(force = false): Promise<NetworkState> {
  if (!browser) return get(networkStore)

  const now = Date.now()
  if (!force && now - lastProbeStartedAt < MIN_PROBE_GAP_MS) {
    return get(networkStore)
  }
  if (inFlight) return inFlight

  lastProbeStartedAt = now

  inFlight = (async () => {
    const browserOnline = navigator.onLine !== false

    let reachable = await probeOnce()
    if (!reachable && browserOnline) reachable = await probeOnce()

    const status: NetworkStatus = reachable
      ? "online"
      : browserOnline
        ? "degraded"
        : "offline"

    let next: NetworkState = {
      status,
      browserOnline,
      serverReachable: reachable,
      lastCheckAt: Date.now(),
      lastOnlineAt: null,
    }

    networkStore.update((prev) => {
      next = {
        ...next,
        lastOnlineAt: reachable ? next.lastCheckAt : prev.lastOnlineAt,
      }
      return next
    })

    return next
  })().finally(() => {
    inFlight = null
  })

  return inFlight
}

function handleBrowserConnectivityChange() {
  // The browser just told us something changed — trust it enough to re-probe
  // immediately rather than waiting for the next interval.
  void refreshNetworkNow(true)
}

function handleVisibilityChange() {
  if (document.visibilityState === "visible") void refreshNetworkNow()
}

/** Idempotent. Safe to call from every layout that needs connectivity. */
export function startNetworkMonitor(): void {
  if (!browser || started) return
  started = true

  window.addEventListener("online", handleBrowserConnectivityChange)
  window.addEventListener("offline", handleBrowserConnectivityChange)
  document.addEventListener("visibilitychange", handleVisibilityChange)

  void refreshNetworkNow(true)

  intervalId = setInterval(() => {
    if (document.visibilityState === "visible") void refreshNetworkNow()
  }, PROBE_INTERVAL_MS)
}

export function stopNetworkMonitor(): void {
  if (!browser || !started) return
  started = false

  window.removeEventListener("online", handleBrowserConnectivityChange)
  window.removeEventListener("offline", handleBrowserConnectivityChange)
  document.removeEventListener("visibilitychange", handleVisibilityChange)

  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }
}

/** Human-readable "checked 12s ago" for banners and debug panels. */
export function describeLastCheck(
  state: NetworkState,
  now = Date.now(),
): string {
  if (!state.lastCheckAt) return "not checked yet"
  const seconds = Math.max(0, Math.round((now - state.lastCheckAt) / 1000))
  if (seconds < 60) return `checked ${seconds}s ago`
  const minutes = Math.round(seconds / 60)
  return `checked ${minutes}m ago`
}
