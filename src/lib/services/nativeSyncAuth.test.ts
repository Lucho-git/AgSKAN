import { afterEach, describe, expect, it, vi } from "vitest"
import {
  buildNativeSyncConfig,
  clearNativeSyncAuthRequired,
  getNativeSyncTokens,
  isPermanentRefreshError,
  rememberNativeSyncAuthRequired,
  NATIVE_SYNC_AUTH_REQUIRED_KEY,
} from "./nativeSyncAuth"

// fakeSupabase covers query chains; auth is small enough to fake inline.
function fakeAuth(
  session: any,
  refresh: (() => Promise<any>) | { data: any; error: any },
) {
  return {
    auth: {
      getSession: vi.fn(async () => ({ data: { session } })),
      refreshSession: vi.fn(
        typeof refresh === "function" ? refresh : async () => refresh,
      ),
    },
  }
}

const session = { access_token: "a1", refresh_token: "r1" }
const fresh = { access_token: "a2", refresh_token: "r2" }

afterEach(() => {
  vi.restoreAllMocks()
})

describe("isPermanentRefreshError", () => {
  it("treats 4xx auth statuses and token messages as permanent", () => {
    expect(isPermanentRefreshError({ status: 400 })).toBe(true)
    expect(isPermanentRefreshError({ code: "401" })).toBe(true)
    expect(isPermanentRefreshError({ statusCode: 403 })).toBe(true)
    expect(isPermanentRefreshError({ message: "Invalid Refresh Token: x" })).toBe(true)
    expect(isPermanentRefreshError({ error_description: "JWT expired" })).toBe(true)
  })

  it("treats network-ish failures as transient", () => {
    expect(isPermanentRefreshError({ status: 500 })).toBe(false)
    expect(isPermanentRefreshError(new Error("Failed to fetch"))).toBe(false)
    expect(isPermanentRefreshError(null)).toBe(false)
  })
})

describe("getNativeSyncTokens", () => {
  it("fails when the session has no tokens", async () => {
    const client = fakeAuth(null, { data: null, error: null })
    expect(await getNativeSyncTokens(client)).toEqual({
      authFailed: true,
      status: null,
      message: "Missing access token",
    })
    const noRefresh = fakeAuth({ access_token: "a" }, { data: null, error: null })
    expect((await getNativeSyncTokens(noRefresh)) as any).toMatchObject({
      message: "Missing refresh token",
    })
  })

  it("uses the current tokens offline without refreshing", async () => {
    const client = fakeAuth(session, { data: null, error: null })
    expect(await getNativeSyncTokens(client, "x", { isOnline: false })).toEqual({
      accessToken: "a1",
      refreshToken: "r1",
    })
    expect(client.auth.refreshSession).not.toHaveBeenCalled()
  })

  it("returns refreshed tokens and reports the refresh", async () => {
    const onRefreshed = vi.fn()
    const client = fakeAuth(session, { data: { session: fresh }, error: null })
    expect(await getNativeSyncTokens(client, "x", { onRefreshed })).toEqual({
      accessToken: "a2",
      refreshToken: "r2",
    })
    expect(onRefreshed).toHaveBeenCalledOnce()
  })

  it("keeps the current tokens on a transient refresh failure", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const client = fakeAuth(session, {
      data: { session: null },
      error: { status: 503, message: "unavailable" },
    })
    expect(await getNativeSyncTokens(client)).toEqual({
      accessToken: "a1",
      refreshToken: "r1",
    })
  })

  it("reports a permanent refresh failure", async () => {
    const client = fakeAuth(session, {
      data: { session: null },
      error: { status: 400, message: "Invalid Refresh Token" },
    })
    expect(await getNativeSyncTokens(client, "bg")).toEqual({
      authFailed: true,
      status: 400,
      message: "Invalid Refresh Token",
    })
  })

  it("handles thrown errors the same way", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const permanent = fakeAuth(session, async () => {
      throw { status: 401 }
    })
    expect(await getNativeSyncTokens(permanent, "bg")).toEqual({
      authFailed: true,
      status: 401,
      message: "Session refresh failed during bg",
    })
    const transient = fakeAuth(session, async () => {
      throw new Error("Failed to fetch")
    })
    expect(await getNativeSyncTokens(transient)).toEqual({
      accessToken: "a1",
      refreshToken: "r1",
    })
  })
})

describe("remembered auth failure", () => {
  function memoryStorage() {
    const m = new Map<string, string>()
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    }
  }

  it("round-trips through storage", () => {
    const storage = memoryStorage()
    rememberNativeSyncAuthRequired(storage, { reason: "x" }, 42)
    expect(JSON.parse(storage.getItem(NATIVE_SYNC_AUTH_REQUIRED_KEY)!)).toEqual({
      at: 42,
      reason: "x",
    })
    clearNativeSyncAuthRequired(storage)
    expect(storage.getItem(NATIVE_SYNC_AUTH_REQUIRED_KEY)).toBeNull()
  })

  it("swallows storage errors", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const broken = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota")
      },
      removeItem: () => {
        throw new Error("nope")
      },
    }
    expect(() => rememberNativeSyncAuthRequired(broken)).not.toThrow()
    expect(() => clearNativeSyncAuthRequired(broken)).not.toThrow()
  })
})

describe("buildNativeSyncConfig", () => {
  const base = {
    supabaseUrl: "https://x.supabase.co",
    anonKey: "anon",
    authToken: "a",
    refreshToken: "r",
    currentTrail: { id: "t1", operation_id: "op-trail" },
    userVehicle: { vehicle_id: "v1", operation_id: "op-vehicle" },
    masterMapId: "m1",
  }

  it("includes the trail when trailing", () => {
    expect(buildNativeSyncConfig({ ...base, isTrailing: true })).toMatchObject({
      trailId: "t1",
      operationId: "op-trail",
      vehicleId: "v1",
      masterMapId: "m1",
      isTrailing: true,
    })
  })

  it("falls back to the vehicle's operation", () => {
    expect(
      buildNativeSyncConfig({
        ...base,
        isTrailing: true,
        currentTrail: { id: "t1" },
      }).operationId,
    ).toBe("op-vehicle")
  })

  it("blanks trail fields when not trailing", () => {
    expect(
      buildNativeSyncConfig({
        ...base,
        isTrailing: false,
        userVehicle: null,
        masterMapId: null,
      }),
    ).toMatchObject({
      trailId: "",
      operationId: "",
      vehicleId: "",
      masterMapId: "",
    })
  })
})
