// src/lib/services/nativeSyncAuth.ts
// Auth plumbing for the native (transistorsoft) background HTTP sync: getting
// tokens to hand to the native layer, deciding whether a refresh failure means
// "log in again" or "just keep the current token", and remembering a pending
// re-login across app restarts.

/* eslint-disable @typescript-eslint/no-explicit-any -- supabase error shapes vary */

export const NATIVE_SYNC_AUTH_REQUIRED_KEY = "agskan_native_sync_auth_required"

/** The bits of `supabase.auth` this module uses. */
export interface AuthClientLike {
  auth: {
    getSession(): Promise<{ data: { session: any } | null }>
    refreshSession(): Promise<{ data: { session: any } | null; error: any }>
  }
}

export type NativeSyncTokens =
  | { authFailed?: undefined; accessToken: string; refreshToken: string }
  | { authFailed: true; status: unknown; message: string }

/**
 * True when a refresh error means the refresh token is unusable (so the user
 * must sign in again), as opposed to a network blip.
 */
export function isPermanentRefreshError(error: any): boolean {
  const status = Number(error?.status || error?.code || error?.statusCode)
  const message = String(
    error?.message || error?.error_description || "",
  ).toLowerCase()

  return (
    status === 400 ||
    status === 401 ||
    status === 403 ||
    message.includes("invalid refresh") ||
    message.includes("refresh token") ||
    message.includes("jwt")
  )
}

/**
 * Tokens for the native sync engine. Refreshes the session when online;
 * transient refresh failures fall back to the current tokens, permanent ones
 * come back as `{ authFailed: true }`. A successful refresh calls
 * `onRefreshed` (used to clear a remembered auth failure).
 */
export async function getNativeSyncTokens(
  client: AuthClientLike,
  context = "native sync",
  opts: { isOnline?: boolean; onRefreshed?: () => void } = {},
): Promise<NativeSyncTokens> {
  const { data: sessionData } = await client.auth.getSession()
  let session = sessionData?.session

  if (!session?.access_token || !session?.refresh_token) {
    return {
      authFailed: true,
      status: null,
      message: !session?.access_token
        ? "Missing access token"
        : "Missing refresh token",
    }
  }

  const current = {
    accessToken: session.access_token as string,
    refreshToken: session.refresh_token as string,
  }

  if (opts.isOnline === false) return current

  const failed = (error: any): NativeSyncTokens => ({
    authFailed: true,
    status: error?.status || error?.code || null,
    message: error?.message || `Session refresh failed during ${context}`,
  })

  try {
    const { data, error } = await client.auth.refreshSession()
    if (error || !data?.session) {
      if (isPermanentRefreshError(error)) return failed(error)
      console.warn(
        `[BG-DIAG] Transient session refresh failure during ${context}; using current token`,
        error?.message || error,
      )
      return current
    }

    opts.onRefreshed?.()
    session = data.session
    return {
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
    }
  } catch (error) {
    if (isPermanentRefreshError(error)) return failed(error)
    console.warn(
      `[BG-DIAG] Session refresh exception during ${context}; using current token`,
      error,
    )
    return current
  }
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">

/** Persist "native sync needs a re-login" so it survives an app restart. */
export function rememberNativeSyncAuthRequired(
  storage: StorageLike,
  details: Record<string, unknown> = {},
  now: number = Date.now(),
): void {
  try {
    storage.setItem(
      NATIVE_SYNC_AUTH_REQUIRED_KEY,
      JSON.stringify({ at: now, ...details }),
    )
  } catch (error) {
    console.warn("[BG-DIAG] Could not persist native sync auth state:", error)
  }
}

export function clearNativeSyncAuthRequired(storage: StorageLike): void {
  try {
    storage.removeItem(NATIVE_SYNC_AUTH_REQUIRED_KEY)
  } catch (error) {
    console.warn("[BG-DIAG] Could not clear native sync auth state:", error)
  }
}

/** Payload for backgroundService.configureNativeSync(). */
export function buildNativeSyncConfig(opts: {
  supabaseUrl: string
  anonKey: string
  authToken: string
  refreshToken: string
  isTrailing: boolean
  currentTrail: { id?: string | null; operation_id?: string | null } | null | undefined
  userVehicle: { vehicle_id?: string | null; operation_id?: string | null } | null | undefined
  masterMapId: string | null | undefined
}) {
  const { isTrailing, currentTrail, userVehicle } = opts
  return {
    supabaseUrl: opts.supabaseUrl,
    anonKey: opts.anonKey,
    authToken: opts.authToken,
    refreshToken: opts.refreshToken,
    operationId: isTrailing
      ? currentTrail?.operation_id || userVehicle?.operation_id || ""
      : "",
    trailId: isTrailing ? currentTrail?.id || "" : "",
    vehicleId: userVehicle?.vehicle_id || "",
    masterMapId: opts.masterMapId || "",
    isTrailing,
  }
}
