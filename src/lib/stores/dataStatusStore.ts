// src/lib/stores/dataStatusStore.ts
//
// Tracks whether each slice of data the app needs actually arrived.
//
// The gap this closes: Supabase resolves `{ data: null, error }` instead of
// throwing, so a dropped connection during boot used to leave `vehicle_states`
// empty (team members lose their vehicle icons), `marker_count`/`field_count`
// at zero and `operations` empty — while the screen still said everything was
// fine. Nothing recorded that, so nothing could retry it.
//
// Each domain reports loading/ok/failed and registers the function that can
// fetch it again. The banner surfaces whatever failed and re-runs it in place
// (no page reload), automatically once the connection is back.

import { writable, derived, get, type Readable } from "svelte/store"
import { classifyLoadError, isNoRowsError, type LoadFailure } from "$lib/utils/networkErrors"
import { networkStore } from "$lib/stores/networkStore"

export type DataDomain =
  | "profile"
  | "subscription"
  | "settings"
  | "map"
  | "operations"
  | "team"
  | "stats"
  | "fields"
  | "markers"
  | "trails"
  | "activeTrails"

export type DataState = "idle" | "loading" | "ok" | "failed"

export interface DomainStatus {
  state: DataState
  error: LoadFailure | null
  at: number
}

export const DOMAIN_LABELS: Record<DataDomain, string> = {
  profile: "your account",
  subscription: "your plan",
  settings: "your settings",
  map: "your map",
  operations: "operations",
  team: "team members",
  stats: "map totals",
  fields: "field boundaries",
  markers: "markers",
  trails: "trails",
  activeTrails: "active trails from other machines",
}

const emptyStatus = (): DomainStatus => ({
  state: "idle",
  error: null,
  at: 0,
})

function initialState(): Record<DataDomain, DomainStatus> {
  const domains = Object.keys(DOMAIN_LABELS) as DataDomain[]
  return domains.reduce(
    (acc, domain) => ({ ...acc, [domain]: emptyStatus() }),
    {} as Record<DataDomain, DomainStatus>,
  )
}

export const dataStatusStore =
  writable<Record<DataDomain, DomainStatus>>(initialState())

/** Domains currently failed, newest problem first. */
export const failedDomains: Readable<DataDomain[]> = derived(
  dataStatusStore,
  ($status) =>
    (Object.entries($status) as [DataDomain, DomainStatus][])
      .filter(([, value]) => value.state === "failed")
      .map(([domain]) => domain),
)

/** Retry handlers live in memory only — they are not serialisable state. */
const retryHandlers = new Map<DataDomain, () => Promise<void>>()

export function registerDomainRetry(
  domain: DataDomain,
  handler: () => Promise<void>,
): void {
  retryHandlers.set(domain, handler)
}

export function unregisterDomainRetry(domain: DataDomain): void {
  retryHandlers.delete(domain)
}

function patch(domain: DataDomain, next: Partial<DomainStatus>): void {
  dataStatusStore.update((status) => ({
    ...status,
    [domain]: { ...(status[domain] ?? emptyStatus()), ...next, at: Date.now() },
  }))
}

export function reportLoading(domain: DataDomain): void {
  patch(domain, { state: "loading", error: null })
}

export function reportOk(domain: DataDomain): void {
  patch(domain, { state: "ok", error: null })
}

/** `null`/`undefined` error = success. Anything else is classified. */
export function reportResult(
  domain: DataDomain,
  error: unknown,
  options: { browserOnline?: boolean } = {},
): boolean {
  if (!error) {
    reportOk(domain)
    return true
  }

  // "No rows" is an empty result, not data that failed to arrive.
  if (isNoRowsError(error)) {
    reportOk(domain)
    return true
  }

  patch(domain, {
    state: "failed",
    error: classifyLoadError(error, options),
  })
  return false
}

export function reportFailed(
  domain: DataDomain,
  error: unknown,
  options: { browserOnline?: boolean } = {},
): void {
  reportResult(domain, error ?? new Error("unknown failure"), options)
}

export function clearDomain(domain: DataDomain): void {
  patch(domain, emptyStatus())
}

export function resetDataStatus(): void {
  dataStatusStore.set(initialState())
}

/** Human summary for the banner, e.g. "team members, map totals". */
export function describeFailedDomains(domains: DataDomain[]): string {
  const labels = domains.map((domain) => DOMAIN_LABELS[domain] ?? domain)
  if (labels.length === 0) return ""
  if (labels.length === 1) return labels[0]
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`
  return `${labels.slice(0, 2).join(", ")} and ${labels.length - 2} more`
}

const labelsIn = (domains: DataDomain[]) => domains

/** Re-run every failed domain that has a registered handler. */
export async function retryFailedDomains(
  domains?: DataDomain[],
): Promise<DataDomain[]> {
  const targets = domains ?? get(failedDomains)
  const stillFailing: DataDomain[] = []

  for (const domain of targets) {
    const handler = retryHandlers.get(domain)
    if (!handler) {
      stillFailing.push(domain)
      continue
    }
    try {
      await handler()
      if (get(dataStatusStore)[domain]?.state === "failed") {
        stillFailing.push(domain)
      }
    } catch (error) {
      console.warn(`[dataStatus] retry for ${domain} threw:`, error)
      stillFailing.push(domain)
    }
  }

  return stillFailing
}

// ── Automatic recovery ────────────────────────────────────────────────────
// Re-run failed loads whenever the connection becomes usable again. Driven by
// the probe-based network store rather than the browser's `online` event, so a
// silent drop (radio still associated, no upstream) also triggers it.

let recoveryStarted = false
let lastRetryAt = 0

export function startDataRecovery(): void {
  if (recoveryStarted) return
  recoveryStarted = true

  let wasOnline = get(networkStore).status === "online"

  networkStore.subscribe((net) => {
    const isOnline = net.status === "online"

    if (isOnline && !wasOnline) {
      const failed = get(failedDomains)
      if (failed.length > 0) {
        console.log(
          "[dataStatus] back online, retrying:",
          labelsIn(failed).join(", "),
        )
        lastRetryAt = Date.now()
        void retryFailedDomains(failed)
      }
    }

    wasOnline = isOnline
  })
}

export function describeLastRetry(now = Date.now()): string {
  if (!lastRetryAt) return "not retried yet"
  const seconds = Math.round((now - lastRetryAt) / 1000)
  return seconds < 60 ? `${seconds}s ago` : `${Math.round(seconds / 60)}m ago`
}
