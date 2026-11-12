/**
 * The app's real pins, drawn the way the landing page draws them: the pin's
 * own art on a white disc with an ink ring.
 *
 * A pin is saved with an icon class ("default", "custom-svg-rock",
 * "ionic-warning", …). The art for every class lives in
 * /marker-svg-glyphs.json, which the old viewer also uses; this module turns
 * a class (plus the few bits of state that change how a pin looks) into an
 * SVG image for the map layer, the pin picker and the pin card.
 */
import {
  getAllMarkers,
  findMarkerByIconClass,
  orderMarkersByUsage,
} from "$lib/data/markerDefinitions"
import {
  gateDisplayIconClass,
  grainBinName,
  isGrainBinIcon,
  isRockPicked,
  markerColor,
  siloColorKey,
} from "$lib/components/map/markers/markerPalette"

type Glyph = { viewBox: string; content: string; tint: "fill" | "keep" }
type GlyphSet = Record<string, Glyph>

const INK = "#15261C"

let glyphsPromise: Promise<GlyphSet> | null = null
let glyphs: GlyphSet | null = null

/** Fetch the pin art once. Resolves to an empty set if it can't be reached. */
export function loadPinGlyphs(): Promise<GlyphSet> {
  if (!glyphsPromise) {
    glyphsPromise = fetch("/marker-svg-glyphs.json")
      .then((r) => (r.ok ? (r.json() as Promise<GlyphSet>) : {}))
      .catch(() => ({}))
      .then((set) => (glyphs = set))
  }
  return glyphsPromise
}

/** What changes a pin's look, beyond its icon class. */
export type PinLook = {
  iconClass: string
  /** `marker_color` palette key; "default" for none. */
  colour?: string | null
  gateOpen?: boolean
  rockPicked?: boolean
  /** Grain bins: 0–100, and the grain's colour key. */
  fill?: number | null
  grainColour?: string | null
}

/** A stable name for the image a pin needs, so each look is drawn once. */
export function pinImageKey(look: PinLook): string {
  const icon = gateDisplayIconClass(
    look.iconClass || "default",
    !!look.gateOpen,
  )
  const bin = isGrainBinIcon(look.iconClass)
  const colour = bin
    ? siloColorKey(look.grainColour)
    : look.colour && look.colour !== "default"
      ? look.colour
      : ""
  const level = bin
    ? Math.round(Math.max(0, Math.min(100, look.fill ?? 0)) / 10)
    : ""
  const picked = isRockPicked(look.iconClass, !!look.rockPicked) ? "p" : ""
  return `pin|${icon}|${colour}|${level}|${picked}`
}

// The older kangaroo pin has no vector art; the newer one stands in for it.
const STAND_INS: Record<string, string> = {
  "custom-svg-kangaroo": "custom-svg-fiver2_kangaroo",
}

const DEFAULT_PIN = `<path fill="${INK}" d="M12 1.6c-4.3 0-7.7 3.3-7.7 7.5 0 5.4 6.5 12.4 7.1 13a.8.8 0 0 0 1.2 0c.6-.6 7.1-7.6 7.1-13 0-4.2-3.4-7.5-7.7-7.5Zm0 10.5a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z"/>`

/** The SVG for one pin image key (see `pinImageKey`). */
export function pinSvg(key: string, size = 96): string {
  const [, icon, colour, level, picked] = key.split("|")
  const set = glyphs ?? {}
  const glyph = set[icon] ?? set[STAND_INS[icon] ?? ""]
  const ring = colour ? ringColour(colour) : INK

  let art: string
  if (glyph) {
    const inner =
      glyph.tint === "fill"
        ? `<g fill="${INK}" color="${INK}">${glyph.content}</g>`
        : glyph.content
    art = `<svg x="-9" y="-9" width="18" height="18" viewBox="${glyph.viewBox}">${inner}</svg>`
  } else {
    art = `<svg x="-8.5" y="-8.5" width="17" height="17" viewBox="0 0 24 24">${DEFAULT_PIN}</svg>`
  }

  // Grain bins carry a gauge round the rim: how full they are.
  let gauge = ""
  if (level !== "") {
    const tenths = Number(level)
    if (tenths > 0) {
      const r = 13.6
      const around = 2 * Math.PI * r
      gauge = `<circle r="${r}" fill="none" stroke="${ring}" stroke-width="3.6" stroke-dasharray="${((around * tenths) / 10).toFixed(2)} ${around.toFixed(2)}" transform="rotate(-90)"/>`
    }
  }
  const tick = picked
    ? `<g transform="translate(9.5 -9.5)"><circle r="5.2" fill="#1F8A4C" stroke="#fff" stroke-width="1.2"/><path d="M-2.3 0.1 L-0.7 1.7 L2.4 -1.6" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></g>`
    : ""

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${size}" height="${size}" viewBox="-16 -16 32 32">` +
    `<circle cy="1" r="14.4" fill="${INK}" opacity="0.22"/>` +
    `<circle r="13.6" fill="#fff" stroke="${level !== "" ? "#C9C4B0" : ring}" stroke-width="${level !== "" ? 3.6 : 2.2}"/>` +
    gauge +
    art +
    tick +
    `</svg>`
  )
}

function ringColour(key: string) {
  const colour = markerColor(key, "circle-fill")
  // White and the palest shades vanish against the disc: fall back to ink.
  return /^#f/i.test(colour.dark) || colour.key === "rainbow"
    ? INK
    : colour.dark
}

export const pinDataUrl = (key: string, size = 96) =>
  "data:image/svg+xml;charset=utf-8," + encodeURIComponent(pinSvg(key, size))

/** What a pin is called: "Rock", "Gate", "Field bin"… */
export function pinLabel(iconClass: string | null | undefined): string {
  if (isGrainBinIcon(iconClass)) return grainBinName(iconClass)
  const found = findMarkerByIconClass(iconClass || "default")
  if (!found) return "Pin"
  return found.id === "default" ? "Pin" : found.name
}

export type PinChoice = { iconClass: string; label: string }

const classOf = (m: { id: string; class: string }) =>
  m.class === "default"
    ? "default"
    : m.class === "custom-svg"
      ? `custom-svg-${m.id}`
      : m.class

/**
 * Every pin the picker offers, the ones this person uses most first (the
 * same order the old viewer's picker settles into).
 */
export function pinChoices(usageOrder: string[] = []): PinChoice[] {
  const offered = getAllMarkers().filter(
    (m: { active: boolean; class: string }) =>
      m.active && !m.class.startsWith("at-"),
  )
  return orderMarkersByUsage(offered, usageOrder).map(
    (m: { id: string; class: string; name: string }) => ({
      iconClass: classOf(m),
      label: m.id === "default" ? "Pin" : m.name,
    }),
  )
}

/** The icon class for a saved "default pin" preference. */
export const preferenceIconClass = (
  preference: { id: string; class: string } | null | undefined,
) => (preference ? classOf(preference) : "default")
