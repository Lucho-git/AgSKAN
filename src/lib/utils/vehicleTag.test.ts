// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import {
  applyTagColor,
  createTagElement,
  getAwayDays,
  getGuestTagLabel,
  getUserInitials,
  isSpeedStale,
  isVehicleInactive,
  renderActiveTag,
  renderTagText,
  tagBackground,
  tagLabelFor,
  INACTIVE_THRESHOLD_MS,
  TAG_DEFAULT_BACKGROUND,
  TAG_INACTIVE_BACKGROUND,
} from "./vehicleTag"

const DAY = 24 * 60 * 60 * 1000

describe("initials", () => {
  it("uses first + last initial for multi-word names", () => {
    expect(getUserInitials("Kim Smith")).toBe("KS")
    expect(getUserInitials("  kim  van der   smith ")).toBe("KS")
  })

  it("uses the first two letters of a single name", () => {
    expect(getUserInitials("kim")).toBe("KI")
  })

  it("returns empty for missing or non-string names", () => {
    expect(getUserInitials("")).toBe("")
    expect(getUserInitials("   ")).toBe("")
    expect(getUserInitials(null)).toBe("")
    expect(getUserInitials(42)).toBe("")
  })

  it("labels guests", () => {
    expect(getGuestTagLabel("Kim Smith")).toBe("KS (Guest)")
    expect(getGuestTagLabel("")).toBe("Guest")
    expect(tagLabelFor("Kim Smith", true)).toBe("KS (Guest)")
    expect(tagLabelFor("Kim Smith", false)).toBe("KS")
  })
})

describe("activity", () => {
  const now = Date.UTC(2026, 0, 10)

  it("treats missing updates as inactive and stale", () => {
    expect(isVehicleInactive(null, now)).toBe(true)
    expect(isSpeedStale(undefined, now)).toBe(true)
    expect(getAwayDays(null, now)).toBe(0)
  })

  it("goes inactive after 3 days", () => {
    expect(isVehicleInactive(now - INACTIVE_THRESHOLD_MS, now)).toBe(false)
    expect(isVehicleInactive(now - INACTIVE_THRESHOLD_MS - 1, now)).toBe(true)
  })

  it("accepts ISO strings", () => {
    const iso = new Date(now - 5 * DAY).toISOString()
    expect(isVehicleInactive(iso, now)).toBe(true)
    expect(getAwayDays(iso, now)).toBe(5)
  })

  it("marks speed stale after 30s", () => {
    expect(isSpeedStale(now - 30000, now)).toBe(false)
    expect(isSpeedStale(now - 30001, now)).toBe(true)
  })
})

describe("tag colours", () => {
  it("maps body colours, falling back to black", () => {
    expect(tagBackground("Red", false)).toBe("rgba(239, 68, 68, 0.95)")
    expect(tagBackground("Teal", false)).toBe(TAG_DEFAULT_BACKGROUND)
    expect(tagBackground(null, false)).toBe(TAG_DEFAULT_BACKGROUND)
  })

  it("greys out inactive vehicles", () => {
    expect(tagBackground("Red", true)).toBe(TAG_INACTIVE_BACKGROUND)
  })

  it("recolours an element", () => {
    const el = document.createElement("div")
    applyTagColor(el, "Blue", false)
    expect(el.style.opacity).toBe("1")
    applyTagColor(el, "Blue", true)
    expect(el.style.opacity).toBe("0.75")
  })
})

describe("tag DOM", () => {
  const fresh = () => Date.now()

  it("style 7 shows initials only when stopped", () => {
    const el = document.createElement("div")
    renderActiveTag(el, "KS", 0, fresh())
    expect(el.textContent).toBe("KS")
    expect(el.children).toHaveLength(0)
  })

  it("style 7 adds a speed line when moving", () => {
    const el = document.createElement("div")
    renderActiveTag(el, "KS", 12.34, fresh())
    expect(el.children).toHaveLength(2)
    expect(el.children[1].textContent).toBe("12.3 km/h")
  })

  it("zeroes speed when the update is stale", () => {
    const el = document.createElement("div")
    renderActiveTag(el, "KS", 50, Date.now() - 60000)
    expect(el.textContent).toBe("KS")
  })

  it("supports the other tag styles", () => {
    const el = document.createElement("div")
    renderActiveTag(el, "KS", 5, fresh(), 1)
    expect(el.textContent).toBe("KS · 5.0")
    renderActiveTag(el, "KS", 5, fresh(), 3)
    expect(el.textContent).toBe("KS 5.0km")
    renderActiveTag(el, "KS", 0, fresh(), 6)
    expect(el.textContent).toBe("KS")
  })

  it("renders the away layout for inactive vehicles", () => {
    const el = document.createElement("div")
    renderTagText(el, "KS", true, Date.now() - 4 * DAY - 1000)
    expect(el.children[0].textContent).toBe("KS")
    expect(el.children[1].textContent).toBe("Away (4D)")
  })

  it("builds a styled tag element", () => {
    const el = createTagElement("KS", "Green", false, fresh(), 0)
    expect(el.className).toBe("fm-initials-marker")
    expect(el.textContent).toBe("KS")
    expect(el.style.background).toContain("rgba(34, 197, 94, 0.95)")
  })
})
