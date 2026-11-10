// src/lib/utils/networkErrors.ts
//
// Turns an opaque fetch/Supabase failure into something the UI can act on.
//
// Supabase does not throw on transport errors — it resolves with
// `{ data: null, error }`. Before this existed the account layout only looked
// at `data`, so a dropped connection was indistinguishable from "this account
// owns no map" and the dashboard silently fell back to Create/Join Map.

export type LoadFailureKind =
  | "offline"
  | "timeout"
  | "auth"
  | "server"
  | "unknown"

export interface LoadFailure {
  kind: LoadFailureKind
  /** Short, user-facing headline. */
  title: string
  /** Plain-language explanation of what happened. */
  detail: string
  /** True when simply running the same request again could fix it. */
  retryable: boolean
}

const OFFLINE_PATTERNS = [
  "failed to fetch",
  "networkerror",
  "network request failed",
  "network connection was lost",
  "load failed",
  "the internet connection appears to be offline",
  "err_internet_disconnected",
  "err_network_changed",
  "err_name_not_resolved",
  "err_connection_refused",
  "err_connection_reset",
  "err_connection_closed",
  "err_address_unreachable",
  "econnreset",
  "enotfound",
  "econnrefused",
  "enetunreach",
  "eai_again",
  "socket hang up",
  "connection closed",
  "offline",
]

const TIMEOUT_PATTERNS = [
  "timeout",
  "timed out",
  "etimedout",
  "err_timed_out",
  "aborted",
  "aborterror",
  "canceling statement due to statement timeout",
]

const AUTH_PATTERNS = [
  "jwt expired",
  "invalid jwt",
  "invalid claim",
  "refresh token",
  "not authenticated",
  "authentication required",
  "jwt malformed",
]

/** Gather every string a Supabase/fetch error might hide its cause in. */
function collectErrorText(error: unknown): string {
  if (error == null) return ""

  if (typeof error === "string") return error.toLowerCase()

  if (typeof error === "object") {
    const value = error as Record<string, unknown>
    return [
      value.message,
      value.name,
      value.code,
      value.details,
      value.hint,
      value.status,
      value.statusCode,
    ]
      .filter((part) => part !== undefined && part !== null)
      .map((part) => String(part))
      .join(" | ")
      .toLowerCase()
  }

  return String(error).toLowerCase()
}

function matches(text: string, patterns: string[]): boolean {
  return patterns.some((pattern) => text.includes(pattern))
}

function statusCodeOf(error: unknown): number | null {
  if (!error || typeof error !== "object") return null
  const value = error as Record<string, unknown>
  const raw = value.status ?? value.statusCode
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

/**
 * Classify a failed load.
 *
 * @param error   Whatever the API/Supabase returned in `.error`.
 * @param options.browserOnline The browser's own view of connectivity. Only
 *   used to sharpen "failed to fetch" into offline vs. server-unreachable.
 */
export function classifyLoadError(
  error: unknown,
  options: { browserOnline?: boolean } = {},
): LoadFailure {
  const text = collectErrorText(error)
  const status = statusCodeOf(error)
  const browserOffline = options.browserOnline === false

  if (status === 401 || status === 403 || matches(text, AUTH_PATTERNS)) {
    return {
      kind: "auth",
      title: "Your session needs refreshing",
      detail:
        "We couldn't confirm who you are. Sign in again to reload your dashboard — anything saved on this device is kept.",
      retryable: false,
    }
  }

  if (matches(text, OFFLINE_PATTERNS)) {
    return browserOffline
      ? {
          kind: "offline",
          title: "You're offline",
          detail:
            "AgSKAN couldn't reach the server. Trails and markers you've recorded are saved on this device and will sync once you have signal.",
          retryable: true,
        }
      : {
          kind: "offline",
          title: "Can't reach AgSKAN",
          detail:
            "The connection looks patchy — the request didn't make it through. We'll keep retrying automatically.",
          retryable: true,
        }
  }

  if (matches(text, TIMEOUT_PATTERNS)) {
    return {
      kind: "timeout",
      title: "The connection is too slow",
      detail:
        "The server didn't answer in time. This usually clears up on its own — we'll keep retrying.",
      retryable: true,
    }
  }

  if (status !== null || text.length > 0) {
    return {
      kind: "server",
      title: "AgSKAN couldn't load your dashboard",
      detail:
        "The server responded with an error. We'll retry automatically; if it keeps happening, contact support.",
      retryable: true,
    }
  }

  return {
    kind: "unknown",
    title: "Something went wrong loading your dashboard",
    detail: "We couldn't work out why. Reloading the app usually fixes it.",
    retryable: true,
  }
}

export function isRetryableFailure(failure: LoadFailure | null): boolean {
  return !!failure?.retryable
}

/**
 * PostgREST answers `.single()` with 406/PGRST116 when the query matched no
 * rows. That is an empty result, not a failed request — for tables whose rows
 * are created lazily (subscriptions, settings) a brand-new account legitimately
 * has none yet. Treating it as a transport failure produced "some data didn't
 * load" banners on healthy connections.
 */
export function isNoRowsError(error: unknown): boolean {
  if (error == null) return false
  if (typeof error !== "object") return false

  const value = error as Record<string, unknown>
  if (String(value.code ?? "") === "PGRST116") return true

  const text = collectErrorText(error)
  return (
    text.includes("json object requested") ||
    text.includes("multiple (or no) rows returned") ||
    text.includes("result contains 0 rows")
  )
}

/** One-line technical summary for logs / the details toggle. */
export function describeLoadError(error: unknown): string {
  if (error == null) return "no error object"
  if (typeof error === "string") return error
  if (typeof error === "object") {
    const value = error as Record<string, unknown>
    return (
      [value.message, value.details, value.hint, value.code]
        .filter(Boolean)
        .join(" | ") || JSON.stringify(error)
    )
  }
  return String(error)
}
