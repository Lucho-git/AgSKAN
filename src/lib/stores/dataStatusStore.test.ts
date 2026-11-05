import { describe, it, expect, beforeEach } from "vitest"
import { get } from "svelte/store"
import {
  dataStatusStore,
  describeFailedDomains,
  failedDomains,
  registerDomainRetry,
  reportLoading,
  reportOk,
  reportResult,
  resetDataStatus,
  retryFailedDomains,
  unregisterDomainRetry,
} from "./dataStatusStore"

describe("dataStatusStore", () => {
  beforeEach(() => {
    resetDataStatus()
    for (const domain of ["team", "stats", "trails"] as const) {
      unregisterDomainRetry(domain)
    }
  })

  it("starts every domain idle", () => {
    const status = get(dataStatusStore)
    expect(status.team.state).toBe("idle")
    expect(get(failedDomains)).toEqual([])
  })

  it("records a successful result", () => {
    expect(reportResult("team", null)).toBe(true)
    expect(get(dataStatusStore).team.state).toBe("ok")
    expect(get(failedDomains)).toEqual([])
  })

  it("records and classifies a failed result", () => {
    const ok = reportResult("team", new TypeError("Failed to fetch"), {
      browserOnline: false,
    })
    expect(ok).toBe(false)
    expect(get(dataStatusStore).team.state).toBe("failed")
    expect(get(dataStatusStore).team.error?.kind).toBe("offline")
    expect(get(failedDomains)).toContain("team")
  })

  it("clears a failure once the domain reports ok again", () => {
    reportResult("stats", { message: "boom", code: "XX000" })
    expect(get(failedDomains)).toContain("stats")

    reportOk("stats")
    expect(get(failedDomains)).not.toContain("stats")
  })

  it("tracks loading without clearing a previous failure verdict", () => {
    reportResult("trails", new TypeError("Failed to fetch"))
    reportLoading("trails")
    expect(get(dataStatusStore).trails.state).toBe("loading")
  })

  it("reports several failed domains at once", () => {
    reportResult("team", new TypeError("Failed to fetch"))
    reportResult("stats", new TypeError("Failed to fetch"))
    expect(get(failedDomains).sort()).toEqual(["stats", "team"])
  })
})

describe("describeFailedDomains", () => {
  it("formats one, two and many", () => {
    expect(describeFailedDomains(["team"])).toBe("team members")
    expect(describeFailedDomains(["team", "stats"])).toBe(
      "team members and map totals",
    )
    expect(describeFailedDomains(["team", "stats", "trails"])).toBe(
      "team members, map totals and 1 more",
    )
    expect(describeFailedDomains([])).toBe("")
  })
})

describe("retryFailedDomains", () => {
  beforeEach(() => {
    resetDataStatus()
    for (const domain of ["team", "stats", "trails"] as const) {
      unregisterDomainRetry(domain)
    }
  })

  it("runs the registered handler and clears the failure", async () => {
    let calls = 0
    registerDomainRetry("team", async () => {
      calls += 1
      reportOk("team")
    })
    reportResult("team", new TypeError("Failed to fetch"))

    const stillFailing = await retryFailedDomains()

    expect(calls).toBe(1)
    expect(stillFailing).toEqual([])
    expect(get(failedDomains)).toEqual([])
  })

  it("keeps reporting a domain whose handler leaves it failed", async () => {
    registerDomainRetry("trails", async () => {
      reportResult("trails", new TypeError("Failed to fetch"))
    })
    reportResult("trails", new TypeError("Failed to fetch"))

    const stillFailing = await retryFailedDomains()

    expect(stillFailing).toEqual(["trails"])
    expect(get(failedDomains)).toEqual(["trails"])
  })

  it("reports a domain whose handler throws", async () => {
    registerDomainRetry("stats", async () => {
      throw new Error("kaboom")
    })
    reportResult("stats", new TypeError("Failed to fetch"))

    const stillFailing = await retryFailedDomains()

    expect(stillFailing).toEqual(["stats"])
  })

  it("skips domains with no handler instead of hanging", async () => {
    reportResult("markers", new TypeError("Failed to fetch"))
    const stillFailing = await retryFailedDomains(["markers"])
    expect(stillFailing).toEqual(["markers"])
  })
})
