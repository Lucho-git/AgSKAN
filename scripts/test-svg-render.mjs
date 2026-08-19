// Dev aid: builds composed marker SVGs using the SAME glyph data and
// composition logic as the runtime renderer, writes them to build/tmp so we
// can eyeball them in the browser. NOT part of the app.
import { writeFileSync, mkdirSync, readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, '../build/tmp-svg-render')
mkdirSync(OUT, { recursive: true })
const MARKER_SVG_GLYPHS = JSON.parse(
  readFileSync(path.join(__dirname, '../static/marker-svg-glyphs.json'), 'utf-8'),
)

const SIZE = 105

// Sample colorDefs (same shape markerColor returns).
const colorDefs = {
  blue: { light: '#3b82f6', dark: '#1d4ed8', deep: '#1e3a8a' },
  black: { light: '#4b5563', dark: '#111827', deep: '#030712' },
}

function glyphTransform(viewBox, target) {
  const [x, y, w, h] = viewBox.split(' ').map(Number)
  const scale = target / Math.max(w, h)
  const tx = SIZE / 2 - (w * scale) / 2 - x * scale
  const ty = SIZE / 2 - (h * scale) / 2 - y * scale
  return `translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${scale.toFixed(4)})`
}

// Mirror of markerSvgRenderer.buildSvg
function buildSvg(glyph, colorDef, mode, glassAlpha) {
  const { light, dark, deep } = colorDef
  const glassAlphaDark = glassAlpha != null ? glassAlpha : 0.55
  const glassAlphaLight = glassAlpha != null ? glassAlpha : 0.38
  const GLYPH_WHITE = '#f8fafc'
  const GLYPH_BLACK = '#000000'
  const CIRCLE_WHITE = '#f1f5f9'
  const GLASS_DARK = '#0f172a'
  const GLASS_LIGHT = '#f0f4f8'
  const RING_GREY = '#cbd5e1'

  let glyphFill = dark
  if (mode === 'circle-fill') glyphFill = GLYPH_WHITE
  else if (mode === 'circle-fill-black') glyphFill = GLYPH_BLACK
  else if (mode === 'icon-fill') glyphFill = deep
  else if (mode === 'original') glyphFill = '#111827'

  let disc = ''
  if (mode === 'original') disc = `<circle cx="52.5" cy="52.5" r="49.5" fill="${light}"/>`
  else if (mode === 'circle-fill' || mode === 'circle-fill-black') disc = `<circle cx="52.5" cy="52.5" r="49.5" fill="${dark}"/>`
  else if (mode === 'icon-fill') disc = `<circle cx="52.5" cy="52.5" r="49.5" fill="${CIRCLE_WHITE}"/>`
  else if (mode === 'icon-dark-glass') disc = `<circle cx="52.5" cy="52.5" r="49.5" fill="${GLASS_DARK}" fill-opacity="${glassAlphaDark}"/>`
  else if (mode === 'icon-light-glass') disc = `<circle cx="52.5" cy="52.5" r="49.5" fill="${GLASS_LIGHT}" fill-opacity="${glassAlphaLight}"/>`

  let ring = ''
  if (mode === 'original') ring = `<circle cx="52.5" cy="52.5" r="47" fill="none" stroke="${dark}" stroke-width="5" stroke-opacity="0.9"/>`
  else if (mode === 'icon-fill') ring = `<circle cx="52.5" cy="52.5" r="47" fill="none" stroke="${RING_GREY}" stroke-width="5" stroke-opacity="0.7"/>`

  const glyphWrap = glyph.tint === 'fill' ? `<g fill="${glyphFill}">${glyph.content}</g>` : glyph.content
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  ${disc}
  ${ring}
  <g transform="${glyphTransform(glyph.viewBox, 74)}">${glyphWrap}</g>
</svg>`
}

const modes = ['original', 'circle-fill', 'circle-fill-black', 'icon-fill', 'icon-only', 'icon-dark-glass', 'icon-light-glass']
// A representative spread across every glyph type: custom keep (rock,
// kangaroo multi-colour, workshop_icon black), fully-tinted custom (gate),
// ionic fill (thumbs-up, paw) and stroke-based atlas (gasoline).
const icons = [
  'custom-svg-rock',
  'custom-svg-rock_pile',
  'custom-svg-kangaroo',
  'custom-svg-workshop_icon',
  'custom-svg-gate',
  'ionic-thumbs-up',
  'ionic-paw',
  'at-gasoline',
]

// A contact-sheet: rows of icons × columns of modes on a light checkerboard.
const cell = 120
const pad = 20
const W = pad + modes.length * cell + pad
const H = pad + icons.length * cell + pad
let sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`
sheet += `<rect width="${W}" height="${H}" fill="#f1f5f9"/>`
const colors = ['blue', 'black']
icons.forEach((icon, ri) => {
  modes.forEach((mode, ci) => {
    const x = pad + ci * cell
    const y = pad + ri * cell
    const colorDef = colorDefs[colors[ri % colors.length]]
    const svg = buildSvg(MARKER_SVG_GLYPHS[icon], colorDef, mode, 0.3)
    sheet += `<g transform="translate(${x} ${y})"><rect width="120" height="120" fill="#fff" stroke="#cbd5e1"/><g transform="translate(7.5 7.5) scale(1)">${svg.replace(/^<svg[^>]*>|<\/svg>$/g, '')}</g><text x="60" y="112" text-anchor="middle" font-size="9" fill="#334155">${mode}</text></g>`
  })
  sheet += `<text x="${pad - 8}" y="${pad + ri * cell + 12}" text-anchor="end" font-size="10" fill="#334155" transform="rotate(-90 ${pad - 8} ${pad + ri * cell + 12})">${icon}</text>`
})
sheet += '</svg>'

writeFileSync(path.join(OUT, 'contact-sheet.svg'), sheet)

// Also write single per-icon × circle-fill + original for zoomed inspection.
icons.forEach((icon) => {
  writeFileSync(path.join(OUT, `${icon}.svg`), buildSvg(MARKER_SVG_GLYPHS[icon], colorDefs.blue, 'circle-fill', 0.3))
})
console.log('✅ Wrote contact sheet + singles to', OUT)
