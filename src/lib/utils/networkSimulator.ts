// src/lib/utils/networkSimulator.ts
//
// Reproducible "patchy reception" on demand.
//
// DevTools throttling only exists on desktop, and airplane mode can't be
// toggled from inside the WebView — neither helps when you're standing in a
// paddock with a tablet. This wraps window.fetch for cross-origin requests
// only (the backend), so you can reproduce the dashboard/offline failures on
// a real device and watch the retry behaviour.
//
//   agskanSim.set("offline")   // every backend request rejects like a dead link
//   agskanSim.set("slow")      // every backend request takes 4s
//   agskanSim.set("flaky")     // ~50% of backend requests fail
//   agskanSim.clear()          // back to normal
//
// The mode is stored in localStorage so it survives a reload; clear it when
// you're done or the app will keep pretending to be offline.

import { browser } from "$app/environment"

export type SimNetMode = "offline" | "slow" | "flaky"

const STORAGE_KEY = "agskan-sim-net"
const SLOW_DELAY_MS = 4000
const FLAKY_FAILURE_RATE = 0.5

let installed = false
let wrapped = false
let originalFetch: typeof window.fetch | null = null

function storage(): Storage | null {
  if (!browser) return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function getSimNetMode(): SimNetMode | null {
  const raw = storage()?.getItem(STORAGE_KEY)
  return raw === "offline" || raw === "slow" || raw === "flaky" ? raw : null
}

/**
 * Wrap window.fetch lazily: with no simulation active the app runs on the
 * untouched native fetch, so shipping this file costs production nothing.
 */
function ensureWrapped(): void {
  if (wrapped || !browser) return
  wrapped = true

  originalFetch = window.fetch.bind(window)

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const mode = getSimNetMode()
    if (!mode || !isBackendRequest(input)) {
      return originalFetch!(input, init)
    }

    if (mode === "offline") simulateFailure()
    if (mode === "flaky" && Math.random() < FLAKY_FAILURE_RATE) {
      simulateFailure()
    }
    if (mode === "slow") {
      await new Promise((resolve) => setTimeout(resolve, SLOW_DELAY_MS))
    }

    return originalFetch!(input, init)
  }
}

export function setSimNetMode(mode: SimNetMode | null): void {
  const store = storage()
  if (!store) return

  if (mode) {
    store.setItem(STORAGE_KEY, mode)
    ensureWrapped()
  } else {
    store.removeItem(STORAGE_KEY)
  }

  // Force the connectivity banner to re-evaluate straight away.
  if (browser) {
    void import("$lib/stores/networkStore").then(({ refreshNetworkNow }) =>
      refreshNetworkNow(true),
    )
  }
}

/** Only simulate traffic that actually leaves the device. */
function isBackendRequest(input: RequestInfo | URL): boolean {
  try {
    const raw =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url

    if (!raw) return false

    const url = new URL(raw, window.location.href)
    if (url.protocol !== "http:" && url.protocol !== "https:") return false

    // Bundle assets, the dev server and Capacitor's https://localhost shell
    // are same-origin — never simulated, or the app wouldn't even boot.
    return url.host !== window.location.host
  } catch {
    return false
  }
}

function simulateFailure(): never {
  // Shaped like the error a dead link actually produces.
  throw new TypeError("Failed to fetch")
}

export function installNetworkSimulator(): void {
  if (!browser || installed) return
  installed = true
  ;(window as unknown as Record<string, unknown>).agskanSim = {
    get: getSimNetMode,
    set: (mode: SimNetMode) => {
      setSimNetMode(mode)
      console.info(`[agskanSim] network simulation: ${mode}`)
    },
    clear: () => {
      setSimNetMode(null)
      console.info("[agskanSim] network simulation off")
    },
    help: () =>
      console.info(
        "agskanSim.set('offline' | 'slow' | 'flaky') · agskanSim.clear()",
      ),
  }

  const mode = getSimNetMode()
  if (mode) {
    ensureWrapped()
    console.warn(
      `[agskanSim] network simulation ACTIVE (${mode}). Run agskanSim.clear() to restore.`,
    )
  }
}
