// Shared runtime marker tinting logic.
//
// Used by BOTH MarkerManager (on-map markers) and MarkerEditPanel (new-marker
// preview grid in test mode) so the previews always match the real map.
// Extracted from MarkerManager.tintMarkerCanvas.

/**
 * Convert a "#rrggbb" hex string to [r, g, b].
 * @param {string} hex
 * @returns {number[]}
 */
export function hexToRgb(hex) {
  const h = hex.replace("#", "")
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

/**
 * Convert HSL (h in degrees 0-360, s/l 0-1) to [r, g, b].
 * @param {number} h
 * @param {number} s
 * @param {number} l
 * @returns {number[]}
 */
function hslToRgb(h, s, l) {
  const a = s * Math.min(l, 1 - l)
  const f = (/** @type {number} */ n) => {
    const k = (n + h / 30) % 12
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))))
  }
  return [f(0), f(8), f(4)]
}

/**
 * Load an image file into a canvas at its natural size.
 * @param {string} path
 * @returns {Promise<HTMLCanvasElement>}
 */
export function loadPngToCanvas(path) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement("canvas")
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      // willReadFrequently: tintMarkerCanvas does getImageData readbacks.
      const ctx = canvas.getContext("2d", { willReadFrequently: true })
      if (ctx) ctx.drawImage(img, 0, 0)
      resolve(canvas)
    }
    img.onerror = reject
    img.src = path
  })
}

// Recolour the baked light-grey circle and/or the glyph (dark strokes +
// coloured details) depending on the mode, then stroke a ring.
//
// Modes:
//   original    — icon NEVER changes; circle gets a light tint, ring is a
//                 strong dark border.
//   circle-fill — the circle carries all the colour right to the edge; the
//                 middle (glyph) is white for contrast. No ring.
//   circle-fill-black — same as circle-fill but the glyph is black.
//   icon-fill   — the icon itself carries the rich deep colour; the circle
//                 is a pure white/grey canvas so the icon pops. Ring is a
//                 subtle neutral grey.
//   icon-only   — DEEP accent icon; the circle is removed entirely.
//   icon-dark-glass — bright accent icon on a DARK translucent glass disc.
//   icon-light-glass — DEEP (much darker) accent icon on the light frosted
//                 glass disc (better contrast than bright-on-bright).
//   default-pin — the default Mapbox pin: the body recolours with the vivid
//                 accent, the baked white circle ALWAYS stays white.
//
// Crispness: instead of hard-snapping each pixel to "circle" or "glyph",
// we compute a smooth circle-ness factor t in [0,1] per pixel from its
// greyness and luminance. That keeps the icon's baked anti-aliasing — the
// soft transition band between strokes and circle blends continuously
// rather than stepping, so edges stay clean instead of "baked".
/**
 * @param {HTMLCanvasElement} canvas  Mutated in place.
 * @param {{ key: string, light: string, dark: string, deep: string }} colorDef
 * @param {string} mode
 * @param {{ keepGlyphOriginal?: boolean, borderColor?: string | null, glassAlpha?: number | null }} [opts]
 *   keepGlyphOriginal — when true the glyph keeps its baked-in colours
 *   (custom SVG icons), only the circle/disc follows the mode.
 *   borderColor — hex override for the ring/rim colour (the profile's
 *   per-style "Border colour" default); null = ring follows the fill.
 *   glassAlpha — 0-1 override for how solid the icon-only glass disc is
 *   (the Profile's opacity slider); null/undefined = built-in per-variant
 *   alphas (dark 0.55 / light 0.38).
 */
export function tintMarkerCanvas(canvas, colorDef, mode, opts = {}) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  if (!ctx) return
  const { width, height } = canvas
  const keepGlyphOriginal = !!opts.keepGlyphOriginal
  const borderColor = opts.borderColor || null
  const isRainbow = colorDef.key === "rainbow"
  const imageData = ctx.getImageData(0, 0, width, height)
  const data = imageData.data
  let [lr, lg, lb] = hexToRgb(colorDef.light)
  // Bright vivid accent — the colour set used by every non-original style
  // EXCEPT icon-fill (saturated, never the dark/deep shades).
  let [br, bg, bb] = hexToRgb(colorDef.dark)
  // Neutral-disc softening (2026-08-20): the pure WHITE discs read as
  // icon-fill's soft off-white #f1f5f9 (circle-fill-black AND original).
  // Black is a real black again in circle-fill — it's a palette colour now
  // (the circle-fill default is blue).
  if (mode === "circle-fill-black" && colorDef.key === "white") {
    br = 241
    bg = 245
    bb = 249 // #f1f5f9 slate-100 (icon-fill's circle)
  } else if (mode === "original" && colorDef.key === "white") {
    // Original's disc uses the light shade — soften pure white to the same
    // off-white so the original style stops being "too white".
    lr = 241
    lg = 245
    lb = 249 // #f1f5f9 slate-100
  }
  // Deep rich shade — icon-fill only (its glyph on the white circle).
  const [dr, dg, db] = hexToRgb(colorDef.deep)
  // Neutral glyph colour used by circle-fill so the symbol always shows.
  const GLYPH = [248, 250, 252] // slate-50
  // Black glyph used by circle-fill-black (black on colour).
  const GLYPH_BLACK = [0, 0, 0]
  // Pure white/grey "canvas" used by icon-fill so the icon pops.
  const CIRCLE_WHITE = [241, 245, 249] // slate-100
  // Light frosted "glass" disc used by icon-light-glass: translucent white
  // so the map shows through but the icon always reads.
  const GLASS = [240, 244, 248]
  const GLASS_ALPHA = 0.38 // how solid the glass disc is (0=invisible, 1=solid)
  // Darker "glass" disc used by icon-dark-glass: a translucent dark slate so
  // the bright icon pops. Slightly more solid than the light glass since
  // dark-on-light needs more presence to read as "dark".
  const GLASS_DARK = [15, 23, 42] // slate-900
  const GLASS_DARK_ALPHA = 0.55
  // Optional user override for how solid the glass disc is (0=invisible,
  // 1=solid) — the Profile's "Icon only" opacity slider drives this. When
  // absent each variant falls back to its baked-in alpha above.
  const glassAlpha =
    typeof opts.glassAlpha === "number" ? opts.glassAlpha : null
  const glassAlphaDark = glassAlpha != null ? glassAlpha : GLASS_DARK_ALPHA
  const glassAlphaLight = glassAlpha != null ? glassAlpha : GLASS_ALPHA

  const lerp = (/** @type {number} */ a, /** @type {number} */ b, /** @type {number} */ x) =>
    a + (b - a) * x

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const a = data[i + 3]
    if (a === 0) continue
    const lum = 0.299 * r + 0.587 * g + 0.114 * b
    // Greyness: 1 for near-grey (circle / stroke), 0 for coloured details.
    const dev = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b))
    const greyT = Math.max(0, Math.min(1, (40 - dev) / 30))
    // Circle-ness by luminance: bright grey = circle, dark = glyph stroke.
    const lumT = Math.max(0, Math.min(1, (lum - 60) / 100))
    const t = greyT * lumT

    // Rainbow fill: when the selected colour is "rainbow" every pixel of the
    // colour-carrying part uses an angular rainbow gradient instead of a
    // solid shade.
    let rainR = 0
    let rainG = 0
    let rainB = 0
    if (isRainbow) {
      const px = (i / 4) % width
      const py = Math.floor(i / 4 / width)
      const hue =
        ((Math.atan2(py - height / 2, px - width / 2) + Math.PI) /
          (2 * Math.PI)) *
        360
      ;[rainR, rainG, rainB] = hslToRgb(hue, 0.95, 0.55)
    }

    // keepGlyphOriginal (custom SVG icons): each mode's glyph-end colour is
    // swapped for the baked-in pixel so only the circle/disc/ring follows
    // the style. `lerp(..., t)` keeps the glyph side (t→0) untouched and
    // applies the mode colour to the circle (t→1), preserving anti-aliasing.
    if (mode === "circle-fill") {
      // BRIGHT circle (the vivid accent shade used by every non-original
      // style); the glyph inside turns white (or stays original for custom
      // icons) so the symbol always stays visible.
      const gR = keepGlyphOriginal ? r : GLYPH[0]
      const gG = keepGlyphOriginal ? g : GLYPH[1]
      const gB = keepGlyphOriginal ? b : GLYPH[2]
      data[i] = lerp(gR, isRainbow ? rainR : br, t)
      data[i + 1] = lerp(gG, isRainbow ? rainG : bg, t)
      data[i + 2] = lerp(gB, isRainbow ? rainB : bb, t)
    } else if (mode === "circle-fill-black") {
      // Same BRIGHT circle as circle-fill — one consistent colour set across
      // every non-original style — but the glyph turns black (custom icons
      // keep their original glyph).
      const gR = keepGlyphOriginal ? r : GLYPH_BLACK[0]
      const gG = keepGlyphOriginal ? g : GLYPH_BLACK[1]
      const gB = keepGlyphOriginal ? b : GLYPH_BLACK[2]
      data[i] = lerp(gR, isRainbow ? rainR : br, t)
      data[i + 1] = lerp(gG, isRainbow ? rainG : bg, t)
      data[i + 2] = lerp(gB, isRainbow ? rainB : bb, t)
    } else if (mode === "icon-fill") {
      // DEEP icon → pure white/grey circle (icon-fill is the one style that
      // uses the deep shade); custom icons keep their original glyph so only
      // the circle is blanked.
      const gR = keepGlyphOriginal ? r : isRainbow ? rainR : dr
      const gG = keepGlyphOriginal ? g : isRainbow ? rainG : dg
      const gB = keepGlyphOriginal ? b : isRainbow ? rainB : db
      data[i] = lerp(gR, CIRCLE_WHITE[0], t)
      data[i + 1] = lerp(gG, CIRCLE_WHITE[1], t)
      data[i + 2] = lerp(gB, CIRCLE_WHITE[2], t)
    } else if (mode === "icon-only") {
      // Glyph with the circle removed entirely: keep the glyph's colour
      // (rainbow for the rainbow option, otherwise original for custom icons)
      // and fade the circle's alpha out so only the icon remains.
      data[i] = keepGlyphOriginal ? r : isRainbow ? rainR : br
      data[i + 1] = keepGlyphOriginal ? g : isRainbow ? rainG : bg
      data[i + 2] = keepGlyphOriginal ? b : isRainbow ? rainB : bb
      data[i + 3] = Math.round(a * (1 - t))
    } else if (mode === "icon-dark-glass") {
      // BRIGHT icon (same set as every non-original style) on the DARK
      // frosted glass disc; custom icons keep their original glyph on the
      // same dark disc.
      const gR = keepGlyphOriginal ? r : isRainbow ? rainR : br
      const gG = keepGlyphOriginal ? g : isRainbow ? rainG : bg
      const gB = keepGlyphOriginal ? b : isRainbow ? rainB : bb
      data[i] = lerp(gR, GLASS_DARK[0], t)
      data[i + 1] = lerp(gG, GLASS_DARK[1], t)
      data[i + 2] = lerp(gB, GLASS_DARK[2], t)
      data[i + 3] = Math.round(a * (1 - t + t * glassAlphaDark))
    } else if (mode === "icon-light-glass") {
      // BRIGHT icon on the light frosted glass disc; custom icons keep their
      // original glyph on the same light disc.
      const gR = keepGlyphOriginal ? r : isRainbow ? rainR : br
      const gG = keepGlyphOriginal ? g : isRainbow ? rainG : bg
      const gB = keepGlyphOriginal ? b : isRainbow ? rainB : bb
      data[i] = lerp(gR, GLASS[0], t)
      data[i + 1] = lerp(gG, GLASS[1], t)
      data[i + 2] = lerp(gB, GLASS[2], t)
      data[i + 3] = Math.round(a * (1 - t + t * glassAlphaLight))
    } else if (mode === "default-pin") {
      // The default Mapbox pin: recolour the pin body with the BRIGHT accent
      // shade (same set as every non-original style) but ALWAYS keep the
      // baked white circle white. The body is a saturated colour (high
      // channel deviation) while the circle is bright grey — a "whiteness"
      // factor separates them, blending so the anti-aliased edges stay crisp.
      const whiteT =
        Math.max(0, Math.min(1, (lum - 150) / 80)) *
        (1 - Math.max(0, Math.min(1, (dev - 30) / 40)))
      data[i] = lerp(br, 255, whiteT)
      data[i + 1] = lerp(bg, 255, whiteT)
      data[i + 2] = lerp(bb, 255, whiteT)
    } else {
      // original — only the circle is tinted light (or rainbow); glyph stays
      // as baked.
      data[i] = lerp(r, isRainbow ? rainR : lr, t)
      data[i + 1] = lerp(g, isRainbow ? rainG : lg, t)
      data[i + 2] = lerp(b, isRainbow ? rainB : lb, t)
    }
  }
  ctx.putImageData(imageData, 0, 0)

  // Ring — circle-fill, icon-only, the glass modes and default-pin run to
  // the edge with no border at all (icon-only has no circle, the glass
  // discs are intentionally borderless, and the pin has its own outline).
  // original gets the strong dark border; icon-fill gets a subtle neutral
  // grey rim so the white circle reads on light maps. The ring is pulled in
  // from the baked edge so no background pixels peek through.
  if (
    mode === "circle-fill" ||
    mode === "circle-fill-black" ||
    mode === "icon-only" ||
    mode === "icon-dark-glass" ||
    mode === "icon-light-glass" ||
    mode === "default-pin"
  )
    return
  const isIconFill = mode === "icon-fill"
  // A user-set default border colour overrides the ring/rim colour
  // (Profile → "Border colour"); otherwise the ring follows the marker's
  // fill colour (original) or stays the neutral grey rim (icon-fill). When
  // the fill is white (or very light) the matching ring would be invisible,
  // so it falls back to a dark slate to keep the marker readable.
  let ringHex = isIconFill ? "#cbd5e1" : colorDef.dark
  if (!isIconFill && !borderColor) {
    const [ar, ag, ab] = hexToRgb(ringHex)
    if (0.299 * ar + 0.587 * ag + 0.114 * ab > 200) ringHex = "#334155"
  }
  const [rr, rg, rb] = borderColor ? hexToRgb(borderColor) : hexToRgb(ringHex)
  ctx.beginPath()
  ctx.arc(width / 2, height / 2, width / 2 - 6, 0, 2 * Math.PI)
  ctx.lineWidth = Math.max(3, Math.round(width * 0.05))
  ctx.strokeStyle = `rgba(${rr}, ${rg}, ${rb}, ${isIconFill ? 0.7 : 0.9})`
  ctx.stroke()
}

// Shared module-level caches for the preview grid (used by TintedIconPreview).
/** @type {Promise<Record<string, string>> | null} */
let iconPathsPromise = null
const baseCanvasCache = new Map() // iconKey -> Promise<HTMLCanvasElement>

/**
 * Load /icon-paths.json once and cache it.
 * @returns {Promise<Record<string, string>>}
 */
export function loadIconPaths() {
  if (!iconPathsPromise) {
    iconPathsPromise = fetch("/icon-paths.json").then((r) => {
      if (!r.ok) throw new Error(`icon-paths.json: ${r.status}`)
      return r.json()
    })
  }
  return iconPathsPromise
}

/**
 * Get the untinted source canvas for an icon image key (e.g. "custom-svg-rock",
 * "ionic-pin", "default"), loading + caching it.
 * @param {string} iconKey
 * @returns {Promise<HTMLCanvasElement | null>}
 */
export function getIconBaseCanvas(iconKey) {
  if (baseCanvasCache.has(iconKey)) return baseCanvasCache.get(iconKey)
  const p = loadIconPaths()
    .then((paths) => {
      const path = paths[iconKey]
      if (!path) return null
      return loadPngToCanvas(`/${path}`)
    })
    .catch((e) => {
      console.warn(`⚠️ Could not load icon ${iconKey}:`, e)
      return null
    })
  baseCanvasCache.set(iconKey, p)
  return p
}
