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
import { writable } from "svelte/store"
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
// The art on a pin is pure black, as the current viewer draws it.
const ART = "#000000"

/**
 * How every pin is drawn, chosen in the Map tool. The three are styles of
 * the current viewer's, drawn the way it draws them:
 *  - "solid":   its "circle fill, black": a disc of the pin's colour with a
 *               black picture
 *  - "classic": its "original": a pale disc of the colour with a strong
 *               ring of it, and a dark picture
 *  - "icon":    its "icon fill": an off-white disc with a grey rim, and the
 *               picture in a deep shade of the colour
 */
export type PinStyle = "solid" | "classic" | "icon"
export const PIN_STYLES: { key: PinStyle; label: string }[] = [
  { key: "solid", label: "Solid" },
  { key: "classic", label: "Classic" },
  { key: "icon", label: "Icon fill" },
]
/** A style saved under an earlier name (or anything else) as one of these. */
export const asPinStyle = (saved: unknown): PinStyle =>
  saved === "classic" || saved === "light"
    ? "classic"
    : saved === "icon" || saved === "dark"
      ? "icon"
      : "solid"
export const pinStyle = writable<PinStyle>("solid")
let styleNow: PinStyle = "solid"
pinStyle.subscribe((style) => (styleNow = style))

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

/** The pin art has arrived (so a picture can be drawn straight away). */
export const pinGlyphsLoaded = () => !!glyphs

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
export function pinImageKey(look: PinLook, style?: PinStyle | null): string {
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
  return `pin|${icon}|${colour}|${level}|${picked}|${style ?? styleNow}`
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

/** A pin nobody has given a colour: sky blue, which sits well on any map. */
export const PIN_DEFAULT = "#7dd3fc"

/**
 * The plain pin ("default") is the one exception to the disc: it is the
 * map pin itself, a teardrop with a white eye and nothing round it, as the
 * current viewer draws it. Its colour is the teardrop's; with none chosen it
 * is the current viewer's blue. It looks the same in every marker style.
 */
const BARE_BLUE = "#3fb1ce"
export const isBarePin = (imageKey: string) =>
  imageKey.split("|")[1] === "default"
function barePin(key: string): { defs: string; art: string } {
  const body = !key
    ? BARE_BLUE
    : key === "rainbow"
      ? "url(#rb)"
      : key === "black"
        ? INK
        : key === "white"
          ? "#f1f5f9"
          : markerColor(key, "circle-fill").dark
  // A dark pin is edged in white, every other in ink, so it has an edge on
  // any map.
  const edge = key === "black" ? "rgba(255,255,255,0.85)" : "rgba(21,38,28,0.6)"
  return {
    defs: key === "rainbow" ? RAINBOW : "",
    art:
      `<path d="M0 14.6 Q-2.4 7.2 -8.3 2.4 A10.2 10.2 0 1 1 8.3 2.4 Q2.4 7.2 0 14.6Z" fill="${body}" stroke="${edge}" stroke-width="0.9" stroke-linejoin="round"/>` +
      `<circle cy="-3.9" r="4.1" fill="#ffffff"${
        key === "white"
          ? ` stroke="rgba(21,38,28,0.45)" stroke-width="0.7"`
          : ""
      }/>`,
  }
}

type Disc = {
  defs: string
  /** The disc's fill, and the colour of the picture on it. */
  fill: string
  art: string
  /** A ring drawn just inside the disc's edge, if the style has one. */
  rim: string
  rimOpacity: number
}

/** A colour too pale to ring a pale disc with. */
function pale(hex: string) {
  const n = parseInt(hex.replace("#", "").slice(0, 6), 16)
  if (Number.isNaN(n)) return false
  return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 200
}

/**
 * The disc a pin sits on, and the colour of its picture, in a style (see
 * `PinStyle`). The numbers are the current viewer's (markerSvgRenderer).
 */
function disc(key: string, style: PinStyle = "solid"): Disc {
  const rainbow = key === "rainbow"
  const defs = rainbow ? RAINBOW : ""
  if (style === "classic") {
    // A pin with no colour of its own is white in this style.
    const colour = markerColor(key || "white", "original")
    const white = !key || key === "white"
    return {
      defs,
      fill: rainbow ? "url(#rb)" : white ? "#f1f5f9" : colour.light,
      art: "#111827",
      rim: rainbow ? INK : pale(colour.dark) ? "#334155" : colour.dark,
      rimOpacity: 0.9,
    }
  }
  if (style === "icon") {
    // A pin with no colour of its own is black in this style.
    const colour = markerColor(key || "black", "icon-fill")
    return {
      defs,
      fill: "#f1f5f9",
      art: rainbow ? "url(#rb)" : colour.deep,
      rim: "#cbd5e1",
      rimOpacity: 0.7,
    }
  }
  // Solid. With no colour chosen the disc is sky blue; "white" is the plain
  // off-white disc. The picture is black on every colour, so a kind of pin
  // reads the same whatever colour it is given; only on a black disc does
  // it turn white.
  const fill = !key
    ? PIN_DEFAULT
    : key === "white"
      ? "#f1f5f9"
      : rainbow
        ? "url(#rb)"
        : key === "black"
          ? INK
          : markerColor(key, "circle-fill").dark
  return {
    defs,
    fill,
    art: key === "black" ? "#fff" : ART,
    rim: "",
    rimOpacity: 0,
  }
}

/** The SVG for one pin image key (see `pinImageKey`). */
export function pinSvg(key: string, size = 96): string {
  const [, icon, colour, level, picked, styled] = key.split("|")
  const style: PinStyle =
    styled === "classic" || styled === "icon" ? styled : "solid"
  const set = glyphs ?? {}
  const glyph = set[icon] ?? set[STAND_INS[icon] ?? ""]
  const bin = level !== ""
  if (icon === "default" && !bin) {
    const bare = barePin(colour)
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="-16 -16 32 32">` +
      (bare.defs ? `<defs>${bare.defs}</defs>` : "") +
      bare.art +
      `</svg>`
    )
  }
  // A grain bin keeps its white disc: its colour is the gauge round the rim.
  const look = bin ? disc("white") : disc(colour, style)

  let art: string
  if (glyph) {
    const inner =
      glyph.tint === "fill"
        ? `<g fill="${look.art}" color="${look.art}">${glyph.content}</g>`
        : glyph.content
    art = `<svg x="-11.28" y="-11.28" width="22.56" height="22.56" viewBox="${glyph.viewBox}">${inner}</svg>`
  } else {
    art = `<svg x="-10" y="-10" width="20" height="20" viewBox="0 0 24 24">${defaultPin(look.art)}</svg>`
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
    // The current viewer's pin exactly: a disc of flat colour that all but
    // fills the image (49.5 of 52.5), no ring and no shadow under it, with
    // the picture fitted to 74 of its 105 (a bin keeps its rim: the gauge
    // runs round it; a white pin gets a hair of an edge so it has one).
    (bin
      ? `<circle r="13.6" fill="${look.fill}" stroke="#C9C4B0" stroke-width="3.6"/>`
      : `<circle r="15.09" fill="${look.fill}"${
          style === "solid" && colour === "white"
            ? ` stroke="rgba(21,38,28,0.3)" stroke-width="0.7"`
            : ""
        }/>` +
        // (The ring of the classic and icon styles: 5 wide at 47 of the
        // image's 52.5, over the disc.)
        (look.rim
          ? `<circle r="14.32" fill="none" stroke="${look.rim}" stroke-width="1.52" stroke-opacity="${look.rimOpacity}"/>`
          : "")) +
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
