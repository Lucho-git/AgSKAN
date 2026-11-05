import { describe, it, expect } from "vitest"
import {
  classifyLoadError,
  describeLoadError,
  isRetryableFailure,
} from "./networkErrors"

describe("classifyLoadError", () => {
  it("treats a dead fetch while offline as offline", () => {
    const failure = classifyLoadError(new TypeError("Failed to fetch"), {
      browserOnline: false,
    })
    expect(failure.kind).toBe("offline")
    expect(failure.retryable).toBe(true)
    expect(failure.title).toBe("You're offline")
  })

  it("treats a dead fetch while the browser claims to be online as unreachable", () => {
    const failure = classifyLoadError(new TypeError("Failed to fetch"), {
      browserOnline: true,
    })
    expect(failure.kind).toBe("offline")
    expect(failure.title).toBe("Can't reach AgSKAN")
    expect(failure.retryable).toBe(true)
  })

  it("recognises Capacitor/WebView network wording", () => {
    expect(
      classifyLoadError(new Error("Network request failed")).kind,
    ).toBe("offline")
    expect(
      classifyLoadError(
        new Error("The Internet connection appears to be offline."),
      ).kind,
    ).toBe("offline")
  })

  it("recognises aborted requests as timeouts", () => {
    const aborted = new Error("The user aborted a request.")
    aborted.name = "AbortError"
    const failure = classifyLoadError(aborted)
    expect(failure.kind).toBe("timeout")
    expect(failure.retryable).toBe(true)
  })

  it("recognises a Postgres statement timeout as a timeout, not a network error", () => {
    const failure = classifyLoadError({
      message: "canceling statement due to statement timeout",
      code: "57014",
    })
    expect(failure.kind).toBe("timeout")
  })

  it("flags expired auth as non-retryable", () => {
    const failure = classifyLoadError({
      message: "JWT expired",
      code: "PGRST301",
    })
    expect(failure.kind).toBe("auth")
    expect(failure.retryable).toBe(false)
    expect(isRetryableFailure(failure)).toBe(false)
  })

  it("flags HTTP 401 as auth", () => {
    expect(classifyLoadError({ status: 401 }).kind).toBe("auth")
  })

  it("flags the map page's own auth guard as auth", () => {
    expect(
      classifyLoadError(new Error("Authentication required")).kind,
    ).toBe("auth")
  })

  it("treats a database error as a retryable server failure", () => {
    const failure = classifyLoadError({
      message: "duplicate key value violates unique constraint",
      code: "23505",
    })
    expect(failure.kind).toBe("server")
    expect(failure.retryable).toBe(true)
  })

  it("treats an HTTP 500 as a server failure", () => {
    expect(classifyLoadError({ status: 500 }).kind).toBe("server")
  })

  it("falls back to unknown for nothing useful", () => {
    expect(classifyLoadError(null).kind).toBe("unknown")
    expect(classifyLoadError(undefined).kind).toBe("unknown")
    expect(classifyLoadError({}).kind).toBe("unknown")
  })

  it("is retryable for everything except auth", () => {
    expect(isRetryableFailure(classifyLoadError(new TypeError("Failed to fetch")))).toBe(true)
    expect(isRetryableFailure(classifyLoadError({ status: 500 }))).toBe(true)
    expect(isRetryableFailure(classifyLoadError({ status: 401 }))).toBe(false)
    expect(isRetryableFailure(null)).toBe(false)
  })
})

describe("describeLoadError", () => {
  it("joins the useful Supabase fields", () => {
    expect(
      describeLoadError({
        message: "boom",
        details: "detail",
        hint: "try again",
        code: "XX000",
      }),
    ).toBe("boom | detail | try again | XX000")
  })

  it("survives a missing error", () => {
    expect(describeLoadError(null)).toBe("no error object")
  })
})
