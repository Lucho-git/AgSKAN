// src/lib/utils/vehicleTag.ts
// The floating name tag above each vehicle marker on the map: the initials
// text, "Away (3D)" state for inactive vehicles, live speed, and colours.
// The DOM builders work on a plain element; the map marker that holds the
// element stays in VehicleTracker.svelte.

/** 3 days without an update → the vehicle is shown as "Away". */
export const INACTIVE_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000
/** No update for 30s → treat speed as 0. */
export const STALE_SPEED_THRESHOLD_MS = 30000
/** Which tag layout to use (see renderActiveTag). */
export const DEFAULT_TAG_STYLE = 7

export const TAG_BACKGROUND_BY_COLOR: Record<string, string> = {
  Yellow: "rgba(234, 179, 8, 0.95)",
  Orange: "rgba(249, 115, 22, 0.95)",
  Red: "rgba(239, 68, 68, 0.95)",
  Green: "rgba(34, 197, 94, 0.95)",
  Blue: "rgba(59, 130, 246, 0.95)",
  Purple: "rgba(168, 85, 247, 0.95)",
  HotPink: "rgba(236, 72, 153, 0.95)",
}
export const TAG_DEFAULT_BACKGROUND = "rgba(0, 0, 0, 0.85)"
export const TAG_INACTIVE_BACKGROUND = "rgba(120, 120, 120, 0.85)"

export type LastUpdate = string | number | null | undefined

/** Epoch ms from an ISO string or a number. */
function toMs(lastUpdate: string | number): number {
  return typeof lastUpdate === "string"
    ? new Date(lastUpdate).getTime()
    : lastUpdate
}

/** "Kim Smith" → "KS", "Kim" → "KI", "" → "". */
export function getUserInitials(fullName: unknown): string {
  if (!fullName || typeof fullName !== "string") return ""

  const trimmed = fullName.trim()
  if (!trimmed) return ""

  const names = trimmed.split(/\s+/)

  if (names.length === 1) {
    return names[0].substring(0, 2).toUpperCase()
  }

  return (names[0][0] + names[names.length - 1][0]).toUpperCase()
}

/** Guests show "<initials> (Guest)" — e.g. "KS (Guest)" for Kim Smith. */
export function getGuestTagLabel(fullName: unknown): string {
  const initials = getUserInitials(fullName)
  return initials ? `${initials} (Guest)` : "Guest"
}

/** The text a vehicle's tag starts with: guest label or plain initials. */
export function tagLabelFor(fullName: unknown, isGuest: boolean): string {
  return isGuest ? getGuestTagLabel(fullName) : getUserInitials(fullName)
}

export function isVehicleInactive(
  lastUpdate: LastUpdate,
  now: number = Date.now(),
): boolean {
  if (!lastUpdate) return true
  return now - toMs(lastUpdate) > INACTIVE_THRESHOLD_MS
}

/** Whole days since the last update (0 when unknown). */
export function getAwayDays(
  lastUpdate: LastUpdate,
  now: number = Date.now(),
): number {
  if (!lastUpdate) return 0
  return Math.floor((now - toMs(lastUpdate)) / (24 * 60 * 60 * 1000))
}

export function isSpeedStale(
  lastUpdate: LastUpdate,
  now: number = Date.now(),
): boolean {
  if (!lastUpdate) return true
  return now - toMs(lastUpdate) > STALE_SPEED_THRESHOLD_MS
}

/** Background colour of a tag for a vehicle body colour. */
export function tagBackground(
  vehicleColor: string | null | undefined,
  inactive: boolean,
): string {
  if (inactive) return TAG_INACTIVE_BACKGROUND
  return (vehicleColor && TAG_BACKGROUND_BY_COLOR[vehicleColor]) ||
    TAG_DEFAULT_BACKGROUND
}

const NAME_LINE_CSS = "font-weight: 700; font-size: 11px; line-height: 1.1;"
const SPEED_LINE_CSS =
  "font-weight: 600; font-size: 9px; line-height: 1.1; opacity: 0.85;"
const AWAY_LINE_CSS =
  "font-weight: 600; font-size: 9px; line-height: 1.1; opacity: 0.8;"

function appendLine(el: HTMLElement, text: string, css: string) {
  const line = document.createElement("div")
  line.textContent = text
  line.style.cssText = css
  el.appendChild(line)
}

/**
 * Fill EL with an active vehicle's tag in the given style. If lastUpdate is
 * stale (>30s), speed is shown as 0.
 */
export function renderActiveTag(
  el: HTMLElement,
  initials: string,
  speed: number | null | undefined,
  lastUpdate: LastUpdate = null,
  tagStyle: number = DEFAULT_TAG_STYLE,
): void {
  const effectiveSpeed = isSpeedStale(lastUpdate) ? 0 : speed || 0
  const s = effectiveSpeed.toFixed(1)
  el.innerHTML = ""

  switch (tagStyle) {
    case 1: // mid-dot
      el.textContent = `${initials} · ${s}`
      break

    case 2: // pipe
      el.textContent = `${initials} | ${s}`
      break

    case 3: // km suffix
      el.textContent = `${initials} ${s}km`
      break

    case 4: // two-line
      appendLine(el, initials, NAME_LINE_CSS)
      appendLine(el, `${s} km/h`, SPEED_LINE_CSS)
      break

    case 5: {
      // pill badge — two segments
      const left = document.createElement("span")
      left.textContent = initials
      left.style.cssText =
        "padding: 1px 5px; border-radius: 6px; background: rgba(255,255,255,0.2);"
      el.appendChild(left)
      el.appendChild(document.createTextNode(" "))
      const right = document.createElement("span")
      right.textContent = s
      right.style.cssText =
        "padding: 1px 5px; border-radius: 6px; background: rgba(0,0,0,0.25);"
      el.appendChild(right)
      break
    }

    case 6: // speed only when moving (single line)
      el.textContent = parseFloat(s) > 0 ? `${initials} · ${s}` : initials
      break

    case 7: // smart two-line: two-line when moving, initials only when stopped
      if (parseFloat(s) > 0) {
        appendLine(el, initials, NAME_LINE_CSS)
        appendLine(el, `${s} km/h`, SPEED_LINE_CSS)
      } else {
        el.textContent = initials
      }
      break

    default:
      el.textContent = `${initials} · ${s}`
  }
}

/** Fill EL with the two-line "initials / Away (XD)" layout. */
export function renderAwayTag(
  el: HTMLElement,
  initials: string,
  lastUpdate: LastUpdate,
): void {
  const days = getAwayDays(lastUpdate)
  el.innerHTML = ""
  appendLine(el, initials, NAME_LINE_CSS)
  appendLine(el, days > 0 ? `Away (${days}D)` : "Away", AWAY_LINE_CSS)
}

/** Re-render a tag's text for its current active/away state. */
export function renderTagText(
  el: HTMLElement,
  initials: string,
  inactive = false,
  lastUpdate: LastUpdate = null,
  speed: number | null | undefined = 0,
): void {
  if (inactive) renderAwayTag(el, initials, lastUpdate)
  else renderActiveTag(el, initials, speed, lastUpdate)
}

/** Build a new tag element. */
export function createTagElement(
  initials: string,
  vehicleColor: string | null = null,
  inactive = false,
  lastUpdate: LastUpdate = null,
  speed: number | null | undefined = 0,
): HTMLDivElement {
  const el = document.createElement("div")
  el.className = "fm-initials-marker"

  renderTagText(el, initials, inactive, lastUpdate, speed)

  el.style.cssText = `
      background: ${tagBackground(vehicleColor, inactive)};
      color: white;
      font-size: 11px;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 10px;
      border: 2px solid white;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
      white-space: nowrap;
      pointer-events: none;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
      user-select: none;
      line-height: 1;
      text-align: center;
      ${inactive ? "opacity: 0.75;" : ""}
    `

  return el
}

/** Recolour an existing tag element. */
export function applyTagColor(
  el: HTMLElement,
  vehicleColor: string | null | undefined,
  inactive = false,
): void {
  el.style.background = tagBackground(vehicleColor, inactive)
  el.style.opacity = inactive ? "0.75" : "1"
}
