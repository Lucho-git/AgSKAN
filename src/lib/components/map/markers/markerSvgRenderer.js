// Runtime SVG → canvas marker renderer.
//
// Composes a marker from SVG parts — an explicit disc/ring layer (coloured
// per style) + the raw glyph art — and rasterizes it offline to a canvas for
// the map. There are no pixel heuristics: the disc is the disc because we drew
// it, so grey glyphs (the rock boulder) keep their own colours while still
// getting the style treatment, and fully-tinted icons get wrapped in a single
// <g color fill=...> (works for fill-based ionics AND stroke-based atlas
// outlines). No pixel classifier, no baked grey PNG to tint.
//
// The sync key set (SVG_RENDERED_ICONS) is tiny and always in the bundle; the
// heavy glyph payload is fetched lazily from /marker-svg-glyphs.json (like
// icon-paths.json) so the main bundle doesn't grow.
import { markerColor } from './markerPalette'
import { SVG_RENDERED_ICONS } from './markerSvgGlyphs'

// Composition coordinates (disc r=49.5, centre 52.5, stamp paths, glyph
// transform) are authored in the 105px LOGICAL space (VIEW). The SVG is
// rasterised at SIZE = 4× the 35px display size so disc edges stay crisp on
// high-DPI screens — including the 1.3× selected-marker pop that magnifies
// the texture. Map registration must pass MARKER_ICON_PIXEL_RATIO so the
// on-screen size is unchanged (logical 105 × icon-size 0.35 = 36.75px).
const VIEW = 105 // logical art space
const SIZE = 140 // 4x the 35px display size (was 3x/105)
export const MARKER_ICON_PIXEL_RATIO = SIZE / VIEW
const MAX_CACHE = 400 // bounded render cache (each entry is a SIZE×SIZE canvas)

export function isSvgRenderedIcon(iconClass) {
  return !!iconClass && SVG_RENDERED_ICONS.has(iconClass)
}

let glyphsPromise = null
function loadSvgGlyphs() {
  if (!glyphsPromise) {
    glyphsPromise = fetch('/marker-svg-glyphs.json').then((r) => {
      if (!r.ok) throw new Error(`marker-svg-glyphs.json: ${r.status}`)
      return r.json()
    })
  }
  return glyphsPromise
}

const cache = new Map() // key -> Promise<HTMLCanvasElement>

// Rasterize an SVG string to a SIZE×SIZE canvas (fully offline — data URL).
function svgToCanvas(svg) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = SIZE
      canvas.height = SIZE
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('no 2d context'))
      ctx.drawImage(img, 0, 0, SIZE, SIZE)
      resolve(canvas)
    }
    img.onerror = () => reject(new Error('SVG rasterize failed'))
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
  })
}

// Fit a glyph's viewBox into a centred box (keeps the glyph inside the disc,
// like the baked PNGs). Centred in the LOGICAL art space (VIEW) — NOT the
// raster SIZE: they were equal at 105, but after the 4× bump using SIZE here
// offset every glyph down-right inside the disc.
function glyphTransform(viewBox, target) {
  const [x, y, w, h] = viewBox.split(' ').map(Number)
  const scale = target / Math.max(w, h)
  const tx = VIEW / 2 - (w * scale) / 2 - x * scale
  const ty = VIEW / 2 - (h * scale) / 2 - y * scale
  return `translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${scale.toFixed(4)})`
}

// Build the composed SVG for one icon × colour × mode. Shade mapping mirrors
// markerTint.js: bright = dark, deep = icon-fill glyph, light = original disc.
function buildSvg(glyph, colorDef, mode, glassAlpha, picked = false) {
  const { light, dark, deep } = colorDef
  const glassAlphaDark = glassAlpha != null ? glassAlpha : 0.55
  const glassAlphaLight = glassAlpha != null ? glassAlpha : 0.38
  const GLYPH_WHITE = '#f8fafc' // slate-50
  const GLYPH_BLACK = '#000000'
  const CIRCLE_WHITE = '#f1f5f9' // slate-100
  const GLASS_DARK = '#0f172a' // slate-900
  const GLASS_LIGHT = '#f0f4f8'
  const RING_GREY = '#cbd5e1' // slate-300 (subtle icon-fill rim)

  // Glyph fill when fully tinted (glyph.tint === "fill", e.g. thumbs-up).
  let glyphFill = dark // bright for icon-only / glass
  if (mode === 'circle-fill') glyphFill = GLYPH_WHITE
  else if (mode === 'circle-fill-black') glyphFill = GLYPH_BLACK
  else if (mode === 'icon-fill') glyphFill = deep
  else if (mode === 'original') glyphFill = '#111827' // baked CDN dark

  // Disc layer per mode ("" = no disc for icon-only).
  let disc = ''
  if (mode === 'original') {
    // The original style can't use a pure white disc — white reads as the
    // same soft off-white as the circle-fill white disc (#f1f5f9).
    const discFill = colorDef.key === 'white' ? '#f1f5f9' : light
    disc = `<circle cx="52.5" cy="52.5" r="49.5" fill="${discFill}"/>`
  } else if (mode === 'circle-fill' || mode === 'circle-fill-black') {
    // Circle-fill-black softens the pure white disc (reads as icon-fill's
    // soft off-white #f1f5f9). Black stays a REAL black in circle-fill —
    // it's a palette colour now (the circle-fill default is blue).
    let discFill = dark
    if (mode === 'circle-fill-black' && colorDef.key === 'white') {
      discFill = '#f1f5f9'
    }
    disc = `<circle cx="52.5" cy="52.5" r="49.5" fill="${discFill}"/>`
  } else if (mode === 'icon-fill') {
    disc = `<circle cx="52.5" cy="52.5" r="49.5" fill="${CIRCLE_WHITE}"/>`
  } else if (mode === 'icon-dark-glass') {
    disc = `<circle cx="52.5" cy="52.5" r="49.5" fill="${GLASS_DARK}" fill-opacity="${glassAlphaDark}"/>`
  } else if (mode === 'icon-light-glass') {
    disc = `<circle cx="52.5" cy="52.5" r="49.5" fill="${GLASS_LIGHT}" fill-opacity="${glassAlphaLight}"/>`
  }

  // Ring layer (matches markerTint.js exactly): radius pulled in to the disc
  // edge so no pale disc shows OUTSIDE the border, 5px stroke
  // (Math.max(3, round(105*0.05)) = 5), and 90% alpha for original / 70%
  // for the subtle icon-fill rim (both drawn over the disc).
  let ring = ''
  if (mode === 'original') {
    ring = `<circle cx="52.5" cy="52.5" r="47" fill="none" stroke="${dark}" stroke-width="5" stroke-opacity="0.9"/>`
  } else if (mode === 'icon-fill') {
    ring = `<circle cx="52.5" cy="52.5" r="47" fill="none" stroke="${RING_GREY}" stroke-width="5" stroke-opacity="0.7"/>`
  }

  // Fully-tinted glyphs are wrapped so the colour flows to BOTH fill-based
  // art (ionics: fill attr / currentColor) and stroke-based art (atlas:
  // stroke:currentColor resolves via the color property). "keep" glyphs
  // (e.g. the grey rock) are rendered as-is.
  const glyphWrap =
    glyph.tint === 'fill'
      ? `<g color="${glyphFill}" fill="${glyphFill}">${glyph.content}</g>`
      : glyph.content

  // "Picked" stamp (rock / rock pile) — a bold green tick with a white
  // casing, drawn in DISC coordinates so it never scales with the glyph.
  // Baked into the rasterized image: every picked rock on the map shares
  // this one cached image — no per-marker DOM or draw cost.
  const pickedStamp = picked
    ? `<g stroke-linecap="round" stroke-linejoin="round" fill="none">
    <path d="M22 57 L41 75 L84 27" stroke="#ffffff" stroke-width="14" stroke-opacity="0.9"/>
    <path d="M22 57 L41 75 L84 27" stroke="#16a34a" stroke-width="8.5"/>
  </g>`
    : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${VIEW} ${VIEW}">
  ${disc}
  ${ring}
  <g transform="${glyphTransform(glyph.viewBox, 74)}">${glyphWrap}</g>
  ${pickedStamp}
</svg>`
}

function cacheKey(iconClass, colorKey, mode, glassAlpha, picked) {
  return `${iconClass}|${colorKey}|${mode}|${glassAlpha ?? ''}|${picked ? 'pk' : ''}`
}

/** Rasterize a marker icon to a SIZE×SIZE canvas (cached per key). */
export function renderSvgMarkerCanvas(
  iconClass,
  colorKey,
  mode,
  glassAlpha,
  picked = false,
) {
  const key = cacheKey(iconClass, colorKey, mode, glassAlpha, picked)
  const hit = cache.get(key)
  if (hit) return hit
  const p = (async () => {
    const glyphs = await loadSvgGlyphs()
    const glyph = glyphs[iconClass]
    if (!glyph) throw new Error(`no glyph for ${iconClass}`)
    const colorDef = markerColor(colorKey, mode)
    const svg = buildSvg(glyph, colorDef, mode, glassAlpha, picked)
    return svgToCanvas(svg)
  })()
  cache.set(key, p)
  p.catch(() => cache.delete(key))
  // Bounded cache: drop the oldest entry when over the cap (Map insertion
  // order = oldest first).
  if (cache.size > MAX_CACHE) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  return p
}

/** Raw RGBA data for map.addImage. */
export async function renderSvgMarkerImageData(
  iconClass,
  colorKey,
  mode,
  glassAlpha,
  picked = false,
) {
  const canvas = await renderSvgMarkerCanvas(
    iconClass,
    colorKey,
    mode,
    glassAlpha,
    picked,
  )
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  return { width: canvas.width, height: canvas.height, data: imageData.data }
}
