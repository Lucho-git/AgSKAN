// Dev aid: pixel-verify the composed SVG renders (sharp rasterization).
import sharp from 'sharp'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, '../build/tmp-svg-render')
const MARKER_SVG_GLYPHS = JSON.parse(
  readFileSync(path.join(__dirname, '../static/marker-svg-glyphs.json'), 'utf-8'),
)

const SIZE = 105
const colorDefs = {
  blue: { light: '#3b82f6', dark: '#1d4ed8', deep: '#1e3a8a' },
}

function glyphTransform(viewBox, target) {
  const [x, y, w, h] = viewBox.split(' ').map(Number)
  const scale = target / Math.max(w, h)
  const tx = SIZE / 2 - (w * scale) / 2 - x * scale
  const ty = SIZE / 2 - (h * scale) / 2 - y * scale
  return `translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${scale.toFixed(4)})`
}

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
  if (mode === 'original') ring = `<circle cx="52.5" cy="52.5" r="46.5" fill="none" stroke="${dark}" stroke-width="4"/>`
  else if (mode === 'icon-fill') ring = `<circle cx="52.5" cy="52.5" r="46.5" fill="none" stroke="${RING_GREY}" stroke-width="2.5"/>`
  const glyphWrap = glyph.tint === 'fill' ? `<g fill="${glyphFill}">${glyph.content}</g>` : glyph.content
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  ${disc}
  ${ring}
  <g transform="${glyphTransform(glyph.viewBox, 74)}">${glyphWrap}</g>
</svg>`
}

function near(c, target, tol = 12) {
  return Math.abs(c[0] - target[0]) <= tol && Math.abs(c[1] - target[1]) <= tol && Math.abs(c[2] - target[2]) <= tol
}

async function analyze(name, icon, mode) {
  const svg = buildSvg(MARKER_SVG_GLYPHS[icon], colorDefs.blue, mode, 0.3)
  const png = path.join(OUT, `${name}.png`)
  await sharp(Buffer.from(svg)).png().toFile(png)
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true })
  const px = (x, y) => [data[(y * info.width + x) * 4], data[(y * info.width + x) * 4 + 1], data[(y * info.width + x) * 4 + 2], data[(y * info.width + x) * 4 + 3]]
  // Stats
  let greyGlyph = 0
  let whiteGlyph = 0
  let opaque = 0
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]
    if (a > 200) {
      opaque++
      const r = data[i], g = data[i + 1], b = data[i + 2]
      if (Math.abs(r - g) < 10 && Math.abs(g - b) < 10 && r > 40 && r < 150) greyGlyph++
      if (r > 235 && g > 235 && b > 235) whiteGlyph++
    }
  }
  const edge = px(8, 52) // disc edge, left
  const center = px(52, 52)
  console.log(`\n── ${name} (${icon} / ${mode}) ──`)
  console.log('  discEdge(8,52):', edge.join(','), 'opaque:', edge[3] > 200)
  console.log('  center(52,52):', center.join(','))
  console.log('  opaquePx:', opaque, ' greyGlyphPx:', greyGlyph, ' whiteGlyphPx:', whiteGlyph)
}

const cases = [
  ['rock-circle-fill', 'custom-svg-rock', 'circle-fill'],
  ['rock-original', 'custom-svg-rock', 'original'],
  ['rock-icon-only', 'custom-svg-rock', 'icon-only'],
  ['rock-dark-glass', 'custom-svg-rock', 'icon-dark-glass'],
  ['rockpile-circle-fill', 'custom-svg-rock_pile', 'circle-fill'],
  ['thumbs-circle-fill', 'ionic-thumbs-up', 'circle-fill'],
  ['thumbs-icon-fill', 'ionic-thumbs-up', 'icon-fill'],
  ['thumbs-icon-only', 'ionic-thumbs-up', 'icon-only'],
]

for (const [name, icon, mode] of cases) await analyze(name, icon, mode)

// Assertions for the PoC
console.log('\n── CHECKS ──')
async function check(name, icon, mode, pred, label) {
  const svg = buildSvg(MARKER_SVG_GLYPHS[icon], colorDefs.blue, mode, 0.3)
  const { data, info } = await sharp(Buffer.from(svg)).raw().toBuffer({ resolveWithObject: true })
  const px = (x, y) => [data[(y * info.width + x) * 4], data[(y * info.width + x) * 4 + 1], data[(y * info.width + x) * 4 + 2], data[(y * info.width + x) * 4 + 3]]
  console.log((pred(px) ? '✅' : '❌'), label)
}
// 1. rock circle-fill: disc edge is blue dark (#1d4ed8 = 29,78,216)
await check('rock-cf', 'custom-svg-rock', 'circle-fill', (px) => near(px(8, 52), [29, 78, 216], 20), 'rock circle-fill: disc edge is blue')
// 2. rock circle-fill: some mid-grey glyph pixels exist (rock keeps its grey)
{
  const svg = buildSvg(MARKER_SVG_GLYPHS['custom-svg-rock'], colorDefs.blue, 'circle-fill', 0.3)
  const { data, info } = await sharp(Buffer.from(svg)).raw().toBuffer({ resolveWithObject: true })
  let grey = 0
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 200) { const r = data[i], g = data[i + 1], b = data[i + 2]; if (Math.abs(r - g) < 10 && Math.abs(g - b) < 10 && r > 40 && r < 150) grey++ }
  }
  console.log(grey > 300 ? '✅' : '❌', `rock circle-fill: grey glyph pixels present (${grey})`)
}
// 3. rock icon-only: disc edge is transparent (no disc), glyph grey present
await check('rock-io', 'custom-svg-rock', 'icon-only', (px) => px(8, 52)[3] < 30, 'rock icon-only: no disc at edge (transparent)')
// 4. thumbs-up circle-fill: disc blue + white glyph pixels
await check('th-cf', 'ionic-thumbs-up', 'circle-fill', (px) => near(px(8, 52), [29, 78, 216], 20), 'thumbs-up circle-fill: disc edge is blue')
{
  const svg = buildSvg(MARKER_SVG_GLYPHS['ionic-thumbs-up'], colorDefs.blue, 'circle-fill', 0.3)
  const { data, info } = await sharp(Buffer.from(svg)).raw().toBuffer({ resolveWithObject: true })
  let white = 0
  for (let i = 0; i < data.length; i += 4) { if (data[i + 3] > 200) { const r = data[i], g = data[i + 1], b = data[i + 2]; if (r > 235 && g > 235 && b > 235) white++ } }
  console.log(white > 200 ? '✅' : '❌', `thumbs-up circle-fill: white glyph pixels present (${white})`)
}
// 5. thumbs-up icon-fill: glyph is deep blue (#1e3a8a = 30,58,138)
{
  const svg = buildSvg(MARKER_SVG_GLYPHS['ionic-thumbs-up'], colorDefs.blue, 'icon-fill', 0.3)
  const { data, info } = await sharp(Buffer.from(svg)).raw().toBuffer({ resolveWithObject: true })
  let deep = 0
  for (let i = 0; i < data.length; i += 4) { if (data[i + 3] > 200) { const r = data[i], g = data[i + 1], b = data[i + 2]; if (near([r, g, b], [30, 58, 138], 25)) deep++ } }
  console.log(deep > 200 ? '✅' : '❌', `thumbs-up icon-fill: deep-blue glyph pixels present (${deep})`)
}
// 6. rock original: disc interior light blue (#3b82f6 = 59,130,246) + dark ring reaching the disc edge (NO pale halo)
// Sample (52,12): 40px from centre — above the rock glyph box (top ~15.5), below the ring inner edge (~y=8) → pure disc.
await check('rock-or', 'custom-svg-rock', 'original', (px) => near(px(52, 12), [59, 130, 246], 25), 'rock original: disc interior is light blue')
{
  const svg = buildSvg(MARKER_SVG_GLYPHS['custom-svg-rock'], colorDefs.blue, 'original', 0.3)
  const { data, info } = await sharp(Buffer.from(svg)).raw().toBuffer({ resolveWithObject: true })
  let dark = 0
  for (let i = 0; i < data.length; i += 4) { if (data[i + 3] > 200) { const r = data[i], g = data[i + 1], b = data[i + 2]; if (near([r, g, b], [29, 78, 216], 20)) dark++ } }
  console.log(dark > 200 ? '✅' : '❌', `rock original: dark ring pixels present (${dark})`)
}
// 7. rock dark-glass: disc edge is slate-900 (#0f172a = 15,23,42) at ~0.3 alpha → blended with... on transparent bg it stays dark
await check('rock-dg', 'custom-svg-rock', 'icon-dark-glass', (px) => { const c = px(8, 52); return c[0] < 45 && c[1] < 55 && c[2] < 70 }, 'rock dark-glass: disc edge is dark slate')
// 8. HALO regression: the ring must cover the disc edge (no pale light band outside the dark ring)
{
  const svg = buildSvg(MARKER_SVG_GLYPHS['custom-svg-rock'], colorDefs.blue, 'original', 0.3)
  const { data, info } = await sharp(Buffer.from(svg)).raw().toBuffer({ resolveWithObject: true })
  const px = (x, y) => [data[(y * info.width + x) * 4], data[(y * info.width + x) * 4 + 1], data[(y * info.width + x) * 4 + 2], data[(y * info.width + x) * 4 + 3]]
  // px(4,52): distance 48.5 from centre — was the pale halo band (light disc between ring outer 48.5 and disc edge 49.5); now inside the 44.5-49.5 ring stroke → dark
  const halo = px(4, 52)
  const haloDark = near(halo, [29, 78, 216], 30) && halo[3] > 150
  // px(2,52): distance 50.5 → outside the disc entirely → transparent
  const outside = px(2, 52)
  const outsideTransparent = outside[3] < 30
  console.log(haloDark && outsideTransparent ? '✅' : '❌', `rock original: no pale halo — ring covers disc edge (px(4,52)=${halo.join(',')}) and beyond disc is transparent (px(2,52)=${outside.join(',')})`)
}
// 9. icon-fill grey rim reaches the disc edge too (not just the pale slate disc)
{
  const svg = buildSvg(MARKER_SVG_GLYPHS['ionic-thumbs-up'], colorDefs.blue, 'icon-fill', 0.3)
  const { data, info } = await sharp(Buffer.from(svg)).raw().toBuffer({ resolveWithObject: true })
  const px = (x, y) => [data[(y * info.width + x) * 4], data[(y * info.width + x) * 4 + 1], data[(y * info.width + x) * 4 + 2], data[(y * info.width + x) * 4 + 3]]
  const rim = px(4, 52) // inside the grey rim band (44.5-49.5)
  const rimGrey = rim[0] < 238 && rim[3] > 150 // clearly darker than the plain slate-100 disc (241,245,249) → rim present at edge
  console.log(rimGrey ? '✅' : '❌', `icon-fill: grey rim reaches disc edge (px(4,52)=${rim.join(',')})`)
}
// 10. GATE (fully-tinted custom): circle-fill → blue disc + WHITE gate glyph (wrapped in <g fill>)
{
  const svg = buildSvg(MARKER_SVG_GLYPHS['custom-svg-gate'], colorDefs.blue, 'circle-fill', 0.3)
  const { data, info } = await sharp(Buffer.from(svg)).raw().toBuffer({ resolveWithObject: true })
  let white = 0
  for (let i = 0; i < data.length; i += 4) { if (data[i + 3] > 200) { const r = data[i], g = data[i + 1], b = data[i + 2]; if (r > 235 && g > 235 && b > 235) white++ } }
  console.log(white > 200 ? '✅' : '❌', `gate circle-fill: white glyph pixels present (${white})`)
}
// 11. KANGAROO (keep, multi-colour): original mode keeps its own non-grey art on the light disc
{
  const svg = buildSvg(MARKER_SVG_GLYPHS['custom-svg-kangaroo'], colorDefs.blue, 'original', 0.3)
  const { data, info } = await sharp(Buffer.from(svg)).raw().toBuffer({ resolveWithObject: true })
  let colourful = 0 // non-grey, non-disc-light pixels (kangaroo's own hues)
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 200) {
      const r = data[i], g = data[i + 1], b = data[i + 2]
      const dev = Math.max(r, g, b) - Math.min(r, g, b)
      if (dev > 40) colourful++
    }
  }
  console.log(colourful > 200 ? '✅' : '❌', `kangaroo original: multi-colour art kept (${colourful} chroma px)`)
}
// 12. AT-GASOLINE (stroke-based atlas): circle-fill → blue disc + BLUE outline glyph (stroke:currentColor via <g color>), interior OPEN
{
  const svg = buildSvg(MARKER_SVG_GLYPHS['at-gasoline'], colorDefs.blue, 'circle-fill', 0.3)
  const { data, info } = await sharp(Buffer.from(svg)).raw().toBuffer({ resolveWithObject: true })
  let outline = 0
  let white = 0
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 200) {
      const r = data[i], g = data[i + 1], b = data[i + 2]
      if (r > 235 && g > 235 && b > 235) white++
      else if (near([r, g, b], [29, 78, 216], 30)) outline++
    }
  }
  // Interior of the hollow outline shows the BLUE disc (29,78,216); a buggy
  // FILLED glyph would be mostly WHITE in circle-fill. So: outline present +
  // very few white pixels = correct outline-only rendering.
  const outlineOpen = white < 100
  console.log(outline > 100 && outlineOpen ? '✅' : '❌', `at-gasoline circle-fill: blue outline present (${outline} px), interior open (white=${white} px)`)
}
// 13. WORKSHOP_ICON (keep, black glyph): original mode keeps the black glyph on the light disc
{
  const svg = buildSvg(MARKER_SVG_GLYPHS['custom-svg-workshop_icon'], colorDefs.blue, 'original', 0.3)
  const { data, info } = await sharp(Buffer.from(svg)).raw().toBuffer({ resolveWithObject: true })
  let black = 0
  for (let i = 0; i < data.length; i += 4) { if (data[i + 3] > 200) { const r = data[i], g = data[i + 1], b = data[i + 2]; if (r < 60 && g < 60 && b < 60) black++ } }
  console.log(black > 200 ? '✅' : '❌', `workshop_icon original: black glyph kept (${black} px)`)
}
// 14. SILO (keep) original mode: light disc + grain-coloured? silos render via SVG with original mode; check glyph pixels exist
{
  const svg = buildSvg(MARKER_SVG_GLYPHS['custom-svg-silo2'], colorDefs.blue, 'original', 0.3)
  const { data, info } = await sharp(Buffer.from(svg)).raw().toBuffer({ resolveWithObject: true })
  let opaque = 0
  for (let i = 0; i < data.length; i += 4) { if (data[i + 3] > 200) opaque++ }
  console.log(opaque > 1500 ? '✅' : '❌', `silo2 original: glyph renders (${opaque} opaque px)`)
}
