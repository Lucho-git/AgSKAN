// Account provisioning on sign-in. The database now creates profile, settings
// and (for managers) plan rows itself, see
// supabase/migrations/20261110072131_add_handle_new_user_provisioning.sql.
// These helpers are the client-side repair path for accounts that predate it,
// so they must never create a duplicate or a plan for a non-manager.
import { beforeEach, describe, expect, it, vi } from "vitest"
import { createFakeSupabase, type FakeSupabase } from "$lib/test/fakeSupabase"

const h = vi.hoisted(() => ({ sb: null as any }))

vi.mock("$lib/stores/sessionStore", async () => {
  const { writable } = await import("svelte/store")
  return {
    get supabase() {
      return h.sb
    },
    session: writable(null),
    initializeSession: vi.fn(),
  }
})
vi.mock("$app/navigation", () => ({ goto: vi.fn() }))

const {
  createSubscriptionIfNeeded,
  createUserSettingsIfNeeded,
  updateOrCreateProfile,
} = await import("./authHelpers")

let sb: FakeSupabase
let n = 0
// updateOrCreateProfile remembers user ids it has handled, so use a fresh one per test.
const newUserId = () => `user-${++n}`
const sessionFor = (id: string, meta: Record<string, unknown> = {}) =>
  ({ user: { id, email: `${id}@example.test`, user_metadata: meta } }) as any

beforeEach(() => {
  sb = createFakeSupabase()
  h.sb = sb
  vi.spyOn(console, "log").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("createUserSettingsIfNeeded", () => {
  it("does nothing when settings already exist", async () => {
    sb.respond("user_settings", "select", {
      data: [{ user_id: "u" }],
      error: null,
    })

    expect(await createUserSettingsIfNeeded("u")).toBe(true)
    expect(sb.calls("user_settings", "insert")).toHaveLength(0)
  })

  it("creates default settings when none exist", async () => {
    sb.respond("user_settings", "select", { data: [], error: null })

    expect(await createUserSettingsIfNeeded("u")).toBe(true)
    expect(sb.calls("user_settings", "insert")[0].payload).toEqual({
      user_id: "u",
    })
  })

  it("treats a unique-violation race as success", async () => {
    sb.respond("user_settings", "select", { data: [], error: null })
    sb.respond("user_settings", "insert", { error: { code: "23505" } })

    expect(await createUserSettingsIfNeeded("u")).toBe(true)
  })

  it("still tries to create when the existence check errors", async () => {
    sb.respond("user_settings", "select", {
      data: null,
      error: { code: "500" },
    })

    await createUserSettingsIfNeeded("u")

    expect(sb.calls("user_settings", "insert")).toHaveLength(1)
  })

  it("reports failure on any other insert error", async () => {
    sb.respond("user_settings", "select", { data: [], error: null })
    sb.respond("user_settings", "insert", { error: { code: "42501" } })

    expect(await createUserSettingsIfNeeded("u")).toBe(false)
  })
})

describe("createSubscriptionIfNeeded", () => {
  it("does nothing when a plan row exists", async () => {
    sb.respond("user_subscriptions", "select", {
      data: [{ user_id: "u" }],
      error: null,
    })

    expect(await createSubscriptionIfNeeded("u")).toBe(true)
    expect(sb.calls("user_subscriptions", "insert")).toHaveLength(0)
  })

  it("creates a FREE plan with the standard limits", async () => {
    sb.respond("user_subscriptions", "select", { data: [], error: null })

    expect(await createSubscriptionIfNeeded("u")).toBe(true)
    expect(sb.calls("user_subscriptions", "insert")[0].payload).toMatchObject({
      user_id: "u",
      subscription: "FREE",
      marker_limit: 100,
      trail_limit: 100000,
      current_seats: 1,
    })
  })

  it("treats a unique-violation race as success", async () => {
    sb.respond("user_subscriptions", "select", { data: [], error: null })
    sb.respond("user_subscriptions", "insert", { error: { code: "23505" } })

    expect(await createSubscriptionIfNeeded("u")).toBe(true)
  })
})

describe("updateOrCreateProfile", () => {
  it("rejects a missing session", async () => {
    expect(await updateOrCreateProfile(null as any)).toBe(false)
    expect(sb.calls()).toHaveLength(0)
  })

  it("creates profile + settings but no plan when the profile is missing", async () => {
    const id = newUserId()
    sb.respond("profiles", "select", {
      data: null,
      error: { code: "PGRST116" },
    })
    sb.respond("user_settings", "select", { data: [], error: null })

    expect(
      await updateOrCreateProfile(sessionFor(id, { full_name: "Sam Field" })),
    ).toBe(true)

    expect(sb.calls("profiles", "insert")[0].payload).toMatchObject({
      id,
      email: `${id}@example.test`,
      full_name: "Sam Field",
      onboarded: false,
    })
    expect(sb.calls("user_settings", "insert")).toHaveLength(1)
    // Role isn't chosen yet; the DB trigger mints the plan once they become a manager.
    expect(sb.calls("user_subscriptions")).toHaveLength(0)
  })

  it("tolerates the DB trigger having created the profile first", async () => {
    sb.respond("profiles", "select", {
      data: null,
      error: { code: "PGRST116" },
    })
    sb.respond("profiles", "insert", { error: { code: "23505" } })
    sb.respond("user_settings", "select", {
      data: [{ user_id: "x" }],
      error: null,
    })

    expect(await updateOrCreateProfile(sessionFor(newUserId()))).toBe(true)
  })

  it("fills in missing profile fields without overwriting existing ones", async () => {
    const id = newUserId()
    sb.respond("profiles", "select", {
      data: {
        id,
        email: null,
        full_name: "Kept Name",
        avatar_url: null,
        role: "operator",
      },
      error: null,
    })
    sb.respond("user_settings", "select", {
      data: [{ user_id: id }],
      error: null,
    })

    await updateOrCreateProfile(
      sessionFor(id, { full_name: "New Name", avatar_url: "https://a/b.png" }),
    )

    const update = sb.calls("profiles", "update")[0].payload as Record<
      string,
      unknown
    >
    expect(update.email).toBe(`${id}@example.test`)
    expect(update.avatar_url).toBe("https://a/b.png")
    expect(update).not.toHaveProperty("full_name")
  })

  it("repairs a manager's missing plan and settings", async () => {
    const id = newUserId()
    sb.respond("profiles", "select", {
      data: {
        id,
        email: "e",
        full_name: "n",
        avatar_url: "a",
        role: "manager",
      },
      error: null,
    })
    sb.respond("user_subscriptions", "select", { data: [], error: null })
    sb.respond("user_settings", "select", { data: [], error: null })

    expect(await updateOrCreateProfile(sessionFor(id))).toBe(true)

    expect(sb.calls("user_subscriptions", "insert")).toHaveLength(1)
    expect(sb.calls("user_settings", "insert")).toHaveLength(1)
    // Complete profile: only the sign-in timestamp is touched.
    expect(
      Object.keys(sb.calls("profiles", "update")[0].payload as object),
    ).toEqual(["last_sign_in"])
  })

  it("never creates a plan for operators or viewers", async () => {
    for (const role of ["operator", "viewer", null]) {
      const id = newUserId()
      sb.respond("profiles", "select", {
        data: { id, email: "e", full_name: "n", avatar_url: "a", role },
        error: null,
      })
      sb.respond("user_settings", "select", {
        data: [{ user_id: id }],
        error: null,
      })

      await updateOrCreateProfile(sessionFor(id))
    }
    expect(sb.calls("user_subscriptions")).toHaveLength(0)
  })

  it("only processes each user once per app session", async () => {
    const id = newUserId()
    sb.respond("profiles", "select", {
      data: { id, email: "e", full_name: "n", avatar_url: "a", role: "viewer" },
      error: null,
    })
    sb.respond("user_settings", "select", {
      data: [{ user_id: id }],
      error: null,
    })

    await updateOrCreateProfile(sessionFor(id))
    await updateOrCreateProfile(sessionFor(id))

    expect(sb.calls("profiles", "select")).toHaveLength(1)
  })
})
