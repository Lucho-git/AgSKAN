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
  markerDefaultColorKey,
  randomColorForId,
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
  /**
   * The colour the pin is filled with: a marker palette key ("red",
   * "skyblue", …). "default", empty or null leaves the plain white disc.
   * See `pinColour` for how a saved pin's colour is decided.
   */
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

const defaultPin = (colour: string) =>
  `<path fill="${colour}" d="M12 1.6c-4.3 0-7.7 3.3-7.7 7.5 0 5.4 6.5 12.4 7.1 13a.8.8 0 0 0 1.2 0c.6-.6 7.1-7.6 7.1-13 0-4.2-3.4-7.5-7.7-7.5Zm0 10.5a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z"/>`

const RAINBOW =
  `<linearGradient id="rb" x1="0" y1="0" x2="1" y2="1">` +
  ["#E5484D", "#F2A20C", "#F7DB5C", "#30A46C", "#2F8FD6", "#7B4BC4"]
    .map((c, i) => `<stop offset="${i / 5}" stop-color="${c}"/>`)
    .join("") +
  `</linearGradient>`

/** How bright a #rrggbb colour reads, 0 (black) to 1 (white). */
function brightness(hex: string) {
  const n = parseInt(hex.slice(1, 7), 16)
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255]
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

/** A pin nobody has given a colour: sky blue, which sits well on any map. */
export const PIN_DEFAULT = "#38bdf8"

/**
 * The disc a pin sits on. With no colour chosen it is sky blue; with one,
 * the disc is filled with it and the art turns white or ink, whichever
 * reads. "white" is the plain white disc.
 */
function disc(key: string) {
  if (!key) return { defs: "", fill: PIN_DEFAULT, art: INK, ring: INK }
  if (key === "white") return { defs: "", fill: "#fff", art: INK, ring: INK }
  if (key === "rainbow")
    return { defs: RAINBOW, fill: "url(#rb)", art: "#fff", ring: INK }
  const fill = key === "black" ? INK : markerColor(key, "circle-fill").dark
  return {
    defs: "",
    fill,
    art: brightness(fill) > 0.62 ? INK : "#fff",
    ring: key === "black" ? "#fff" : INK,
  }
}

/** The SVG for one pin image key (see `pinImageKey`). */
export function pinSvg(key: string, size = 96): string {
  const [, icon, colour, level, picked] = key.split("|")
  const set = glyphs ?? {}
  const glyph = set[icon] ?? set[STAND_INS[icon] ?? ""]
  const bin = level !== ""
  // A grain bin keeps its white disc: its colour is the gauge round the rim.
  const look = disc(bin ? "white" : colour)

  let art: string
  if (glyph) {
    const inner =
      glyph.tint === "fill"
        ? `<g fill="${look.art}" color="${look.art}">${glyph.content}</g>`
        : glyph.content
    art = `<svg x="-9" y="-9" width="18" height="18" viewBox="${glyph.viewBox}">${inner}</svg>`
  } else {
    art = `<svg x="-8.5" y="-8.5" width="17" height="17" viewBox="0 0 24 24">${defaultPin(look.art)}</svg>`
  }

  // Grain bins carry a gauge round the rim: how full they are.
  let gauge = ""
  if (bin) {
    const tenths = Number(level)
    if (tenths > 0) {
      const r = 13.6
      const around = 2 * Math.PI * r
      gauge = `<circle r="${r}" fill="none" stroke="${gaugeColour(colour)}" stroke-width="3.6" stroke-dasharray="${((around * tenths) / 10).toFixed(2)} ${around.toFixed(2)}" transform="rotate(-90)"/>`
    }
  }
  const tick = picked
    ? `<g transform="translate(9.5 -9.5)"><circle r="5.2" fill="#1F8A4C" stroke="#fff" stroke-width="1.2"/><path d="M-2.3 0.1 L-0.7 1.7 L2.4 -1.6" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></g>`
    : ""

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${size}" height="${size}" viewBox="-16 -16 32 32">` +
    (look.defs ? `<defs>${look.defs}</defs>` : "") +
    `<circle cy="1" r="14.4" fill="${INK}" opacity="0.22"/>` +
    `<circle r="13.6" fill="${look.fill}" stroke="${bin ? "#C9C4B0" : look.ring}" stroke-width="${bin ? 3.6 : 2.2}"/>` +
    gauge +
    art +
    tick +
    `</svg>`
  )
}

function gaugeColour(key: string) {
  const colour = markerColor(key || "yellow", "circle-fill")
  // White and the palest shades vanish against the disc: fall back to ink.
  return /^#f/i.test(colour.dark) || colour.key === "rainbow"
    ? INK
    : colour.dark
}

export const pinDataUrl = (key: string, size = 96) =>
  "data:image/svg+xml;charset=utf-8," + encodeURIComponent(pinSvg(key, size))

/**
 * The colour a saved pin is filled with: the one chosen for that pin, else
 * the one this person has set for pins of its type (or for all their pins)
 * in their marker colour settings, else none.
 */
export function pinColour(
  pin: { id: string; iconClass: string; colour?: string | null },
  settings: {
    markerDefaultColor?: string | null
    markerTypeDefaultColors?: Record<string, string> | null
  } | null,
): string {
  if (pin.colour && pin.colour !== "default") return pin.colour
  const chosen = markerDefaultColorKey(pin.iconClass, settings)
  if (!chosen || chosen === "default") return ""
  return chosen === "random" ? randomColorForId(pin.id) : chosen
}

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
