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
      const ctx = canvas.getContext("2d")
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
//   icon-fill   — the icon itself carries the rich deep colour; the circle
//                 is a pure white/grey canvas so the icon pops. Ring is a
//                 subtle neutral grey.
//   icon-only   — DEEP accent icon; the circle is removed entirely.
//   icon-dark-glass — bright accent icon on a DARK translucent glass disc.
//   icon-light-glass — DEEP (much darker) accent icon on the light frosted
//                 glass disc (better contrast than bright-on-bright).
//
// Crispness: instead of hard-snapping each pixel to "circle" or "glyph",
// we compute a smooth circle-ness factor t in [0,1] per pixel from its
// greyness and luminance. That keeps the icon's baked anti-aliasing — the
// soft transition band between strokes and circle blends continuously
// rather than stepping, so edges stay clean instead of "baked".
/**
 * @param {HTMLCanvasElement} canvas  Mutated in place.
 * @param {{ light: string, dark: string, deep: string }} colorDef
 * @param {string} mode
 */
export function tintMarkerCanvas(canvas, colorDef, mode) {
  const ctx = canvas.getContext("2d")
  if (!ctx) return
  const { width, height } = canvas
  const imageData = ctx.getImageData(0, 0, width, height)
  const data = imageData.data
  const [lr, lg, lb] = hexToRgb(colorDef.light)
  const [dr, dg, db] = hexToRgb(colorDef.deep)
  // Bright accent used by icon-dark-glass so the icon pops on the dark disc.
  const [br, bg, bb] = hexToRgb(colorDef.dark)
  // Neutral glyph colour used by circle-fill so the symbol always shows.
  const GLYPH = [248, 250, 252] // slate-50
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

    if (mode === "circle-fill") {
      // White/grey glyph → deep circle, blended smoothly.
      data[i] = lerp(GLYPH[0], dr, t)
      data[i + 1] = lerp(GLYPH[1], dg, t)
      data[i + 2] = lerp(GLYPH[2], db, t)
    } else if (mode === "icon-fill") {
      // Deep rich icon → pure white/grey circle, blended smoothly.
      data[i] = lerp(dr, CIRCLE_WHITE[0], t)
      data[i + 1] = lerp(dg, CIRCLE_WHITE[1], t)
      data[i + 2] = lerp(db, CIRCLE_WHITE[2], t)
    } else if (mode === "icon-only") {
      // Deep-coloured icon with the circle removed entirely: colour the
      // glyph with the rich deep shade and fade the circle's alpha out so
      // only the icon remains.
      data[i] = dr
      data[i + 1] = dg
      data[i + 2] = db
      data[i + 3] = Math.round(a * (1 - t))
    } else if (mode === "icon-dark-glass") {
      // Bright icon on a DARK frosted glass disc: the circle becomes a
      // translucent dark slate so the bright colour pops instead of washing
      // out.
      data[i] = lerp(br, GLASS_DARK[0], t)
      data[i + 1] = lerp(bg, GLASS_DARK[1], t)
      data[i + 2] = lerp(bb, GLASS_DARK[2], t)
      data[i + 3] = Math.round(a * (1 - t + t * GLASS_DARK_ALPHA))
    } else if (mode === "icon-light-glass") {
      // DEEP (much darker) icon on the light frosted glass disc: tints the
      // glyph with the rich deep shade so it reads clearly instead of
      // bright-on-bright.
      data[i] = lerp(dr, GLASS[0], t)
      data[i + 1] = lerp(dg, GLASS[1], t)
      data[i + 2] = lerp(db, GLASS[2], t)
      data[i + 3] = Math.round(a * (1 - t + t * GLASS_ALPHA))
    } else {
      // original — only the circle is tinted light; glyph stays as baked.
      data[i] = lerp(r, lr, t)
      data[i + 1] = lerp(g, lg, t)
      data[i + 2] = lerp(b, lb, t)
    }
  }
  ctx.putImageData(imageData, 0, 0)

  // Ring — circle-fill, icon-only and the glass modes run to the edge with
  // no border at all (icon-only has no circle, the glass discs are
  // intentionally borderless). original gets the strong dark border;
  // icon-fill gets a subtle neutral grey rim so the white circle reads on
  // light maps. The ring is pulled in from the baked edge so no background
  // pixels peek through.
  if (
    mode === "circle-fill" ||
    mode === "icon-only" ||
    mode === "icon-dark-glass" ||
    mode === "icon-light-glass"
  )
    return
  const isIconFill = mode === "icon-fill"
  const [rr, rg, rb] = hexToRgb(isIconFill ? "#cbd5e1" : colorDef.dark)
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
