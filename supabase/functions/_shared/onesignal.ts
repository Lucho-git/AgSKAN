// Shared OneSignal REST helper for Supabase edge functions.
//
// Sends a push to a single user via their OneSignal `external_id` (which the
// native apps set with `OneSignal.login(supabaseUserId)`). Works for all of
// that user's app installs at once, and nothing needs storing on our side.
//
// Requires secrets: ONESIGNAL_REST_API_KEY (and optionally ONESIGNAL_APP_ID).

export interface OneSignalSendResult {
  /** True when the API accepted the message. */
  ok: boolean
  /** True when the helper did not even attempt a send (e.g. key not configured). */
  skipped: boolean
  /** How many subscriptions OneSignal accepted the message for. */
  recipients: number
  /** OneSignal message id, when available. */
  id?: string
  /** Raw/reported errors from the API (e.g. "All included players are not subscribed"). */
  errors?: unknown
  error?: string
}

const DEFAULT_APP_ID = "33d6ac8f-e529-4532-af42-efbb93aba93b"

export async function sendOneSignalPush(opts: {
  /** Supabase user id of the recipient(s). */
  externalId?: string | null
  title: string
  body: string
  /** Custom data delivered with the notification (e.g. { url: "/account/mapviewer" }). */
  data?: Record<string, unknown>
  /** Optional top-level launch URL (web push fallback). Prefer `data.url`. */
  url?: string
  /** Groups notifications by conversation (e.g. sender id) on iOS + Android. */
  groupKey?: string
  appId?: string
  apiKey?: string
}): Promise<OneSignalSendResult> {
  const appId = opts.appId ?? Deno.env.get("ONESIGNAL_APP_ID") ?? DEFAULT_APP_ID
  const apiKey = opts.apiKey ?? Deno.env.get("ONESIGNAL_REST_API_KEY")

  if (!apiKey) {
    return {
      ok: false,
      skipped: true,
      recipients: 0,
      error: "ONESIGNAL_REST_API_KEY is not configured",
    }
  }
  if (!opts.externalId) {
    return {
      ok: false,
      skipped: true,
      recipients: 0,
      error: "No recipient external id",
    }
  }

  // Optional: route to a specific Android channel (e.g. a high-importance
  // "Messages" channel configured in the OneSignal dashboard) so phones show
  // these as banner notifications. Set the secret once the channel exists.
  const androidChannelId = Deno.env.get("ONESIGNAL_ANDROID_CHANNEL_ID")
  // Channel created by the Android app itself (MainActivity) — high importance,
  // so message pushes show as heads-up banners.
  const existingAndroidChannelId =
    Deno.env.get("ONESIGNAL_ANDROID_EXISTING_CHANNEL_ID") ?? "agskan_messages"

  const payload: Record<string, unknown> = {
    app_id: appId,
    target_channel: "push",
    include_aliases: { external_id: [opts.externalId] },
    headings: { en: opts.title },
    contents: { en: opts.body },
    ...(opts.data ? { data: opts.data } : {}),
    ...(opts.url ? { url: opts.url } : {}),
    ...(opts.groupKey
      ? { thread_id: opts.groupKey, android_group: opts.groupKey }
      : {}),
    ...(androidChannelId ? { android_channel_id: androidChannelId } : {}),
    existing_android_channel_id: existingAndroidChannelId,
  }

  try {
    const res = await fetch("https://api.onesignal.com/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Key ${apiKey}`,
      },
      body: JSON.stringify(payload),
    })
    const json = await res.json().catch(() => null)
    if (!res.ok) {
      console.warn("[onesignal] send failed:", res.status, json)
      return {
        ok: false,
        skipped: false,
        recipients: 0,
        error: `OneSignal API ${res.status}`,
        errors: (json as { errors?: unknown })?.errors ?? json ?? undefined,
      }
    }
    return {
      ok: true,
      skipped: false,
      recipients: Number((json as { recipients?: number })?.recipients ?? 0),
      id: (json as { id?: string })?.id,
      errors: (json as { errors?: unknown })?.errors,
    }
  } catch (error) {
    console.error("[onesignal] request error:", error)
    return {
      ok: false,
      skipped: false,
      recipients: 0,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Count a user's enabled push subscriptions.
 *
 * OneSignal's immediate `recipients` count on a send can read 0 while alias
 * resolution is still in flight (the message still delivers). Looking the
 * user up afterwards gives the real subscription state.
 */
export async function countOneSignalSubscriptions(opts: {
  externalId?: string | null
  appId?: string
  apiKey?: string
}): Promise<number> {
  const appId = opts.appId ?? Deno.env.get("ONESIGNAL_APP_ID") ?? DEFAULT_APP_ID
  const apiKey = opts.apiKey ?? Deno.env.get("ONESIGNAL_REST_API_KEY")
  if (!apiKey || !opts.externalId) return 0
  try {
    const res = await fetch(
      `https://api.onesignal.com/apps/${appId}/users/by/external_id/${encodeURIComponent(opts.externalId)}`,
      { headers: { Authorization: `Key ${apiKey}` } },
    )
    if (!res.ok) return 0
    const json = await res.json()
    const subs = Array.isArray(json?.subscriptions) ? json.subscriptions : []
    return subs.filter(
      (s: { type?: string; enabled?: boolean }) =>
        s &&
        typeof s.type === "string" &&
        s.type.toLowerCase().includes("push") &&
        s.enabled !== false,
    ).length
  } catch (error) {
    console.warn("[onesignal] subscription lookup failed:", error)
    return 0
  }
}
