// extract-atlas-glyphs.mjs — Recover missing atlas marker glyphs from the
// atlas font packs and store them as standalone SVGs in icon-art/atlas/.
// ============================================================================
// The legacy atlas classes (at-exit, at-houses, at-rain-drops, …) are still
// used by ~151 live markers but have no art in any pipeline, so those markers
// render no icon. The glyphs DO exist inside the atlas font packs
// (static/atlas-icons/packs/<pack>/fonts/<pack>.svg, IcoMoon-style SVG fonts).
//
// This script:
//   1. reads the pack stylesheet to find the unicode (content: "\eXXX") for
//      each class
//   2. pulls that glyph's outline from the pack's SVG font
//   3. converts it to a standalone SVG (flips the font coordinate system)
//      and writes icon-art/atlas/<name>.svg
//
// scripts/atlas-icons.js merges icon-art/atlas/*.svg into the atlas art set,
// so `node scripts/gen-svg-glyphs.mjs` picks them up automatically and the
// runtime SVG renderer draws those markers again.
//
// Run: node scripts/extract-atlas-glyphs.mjs [--preview]
//   --preview also rasterizes a few glyphs to scripts/tmp-atlas-preview/
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const PACKS_DIR = path.join(ROOT, 'static/atlas-icons/packs')
const OUT_DIR = path.join(ROOT, 'icon-art/atlas')

// Atlas class (WITHOUT the "at-" prefix) -> pack that defines it.
const TARGETS = {
  exit: 'real-estate',
  houses: 'real-estate',
  'house-home': 'real-estate',
  'rain-drops': 'weather',
  'rain-storm': 'weather',
  'farming-tractor': 'transportation',
  airplane: 'transportation',
  'xmark-circle': 'basic-ui',
  home: 'basic-ui',
  users: 'basic-ui',
  user: 'basic-ui',
  gear: 'basic-ui',
  berries: 'christmas',
  'green-gas': 'ecology',
  'green-can': 'ecology',
  'green-container': 'ecology',
  'arrow-left-circle': 'arrow',
  'arrow-up-circle': 'arrow',
  signal: 'communication',
  hamburger: 'food-beverage',
}

// Find the CSS content code (unicode) for a class in a pack stylesheet.
function classToCode(css, cls) {
  const sel = new RegExp(`\\.at-${cls}(?![\\w-])`)
  for (const rule of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (!sel.test(rule[1])) continue
    const m = rule[2].match(/content:\s*"\\([0-9a-fA-F]+)"/)
    if (m) return parseInt(m[1], 16)
  }
  return null
}

// Pull one glyph's outline + metrics from an SVG font file.
function glyphFromFont(fontSvg, code) {
  const faceTag = fontSvg.match(/<font-face[^>]*>/)?.[0] || ''
  const fontTag = fontSvg.match(/<font\b[^>]*>/)?.[0] || ''
  const upem = Number((faceTag.match(/units-per-em="(-?\d+)"/) || [])[1] || 1024)
  const ascent = Number((faceTag.match(/ascent="(-?\d+)"/) || [])[1] || upem)
  const descent = Number((faceTag.match(/descent="(-?\d+)"/) || [])[1] || 0)
  const defaultAdv = Number((fontTag.match(/horiz-adv-x="(-?\d+)"/) || [])[1] || upem)
  const target = String.fromCodePoint(code)

  for (const g of fontSvg.matchAll(/<glyph\b[^>]*>/g)) {
    const tag = g[0]
    const raw = (tag.match(/unicode="([^"]*)"/) || [])[1]
    if (!raw) continue
    const resolved = raw
      .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    if (resolved !== target) continue
    const d = (tag.match(/ d="([^"]*)"/) || [])[1]
    if (!d) continue
    const adv = Number((tag.match(/horiz-adv-x="(-?\d+)"/) || [])[1] || defaultAdv)
    return { d, adv, upem, ascent, descent }
  }
  return null
}

mkdirSync(OUT_DIR, { recursive: true })

let ok = 0
const failures = []
for (const [cls, pack] of Object.entries(TARGETS)) {
  const cssPath = path.join(PACKS_DIR, pack, 'style.css')
  const fontsDir = path.join(PACKS_DIR, pack, 'fonts')
  let code = null
  let glyph = null
  try {
    code = classToCode(readFileSync(cssPath, 'utf-8'), cls)
    if (code != null) {
      for (const f of readdirSync(fontsDir).filter((f) => f.endsWith('.svg'))) {
        const found = glyphFromFont(readFileSync(path.join(fontsDir, f), 'utf-8'), code)
        if (found) {
          glyph = found
          break
        }
      }
    }
  } catch (e) {
    failures.push(`${cls} (${pack}): ${e.message}`)
    continue
  }
  if (code == null) {
    failures.push(`${cls} (${pack}): class not found in style.css`)
    continue
  }
  if (!glyph) {
    failures.push(`${cls} (${pack}): glyph U+${code.toString(16)} not found in font`)
    continue
  }
  // Font space is y-up with baseline at 0 — flip into SVG space (y-down).
  const height = glyph.ascent - glyph.descent
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${glyph.adv}" height="${height}" viewBox="0 0 ${glyph.adv} ${height}">` +
    `<path transform="translate(0 ${glyph.ascent}) scale(1 -1)" d="${glyph.d}"/></svg>\n`
  writeFileSync(path.join(OUT_DIR, `${cls}.svg`), svg)
  console.log(`  ✓ ${cls}  ←  ${pack}  (U+${code.toString(16).toUpperCase()}, adv ${glyph.adv})`)
  ok++
}

console.log(`\n✅ ${ok}/${Object.keys(TARGETS).length} glyphs extracted → icon-art/atlas/`)
if (failures.length) {
  console.log('❌ Failures:')
  for (const f of failures) console.log(`   ${f}`)
  process.exitCode = 1
}

// Optional visual check: rasterize a few to scripts/tmp-atlas-preview/.
if (process.argv.includes('--preview')) {
  const { createCanvas, loadImage } = await import('canvas')
  const pvDir = path.join(__dirname, 'tmp-atlas-preview')
  mkdirSync(pvDir, { recursive: true })
  for (const cls of ['exit', 'rain-drops', 'hamburger', 'airplane', 'gear']) {
    try {
      const svg = readFileSync(path.join(OUT_DIR, `${cls}.svg`))
      const img = await loadImage(svg)
      const S = 105
      const scale = 90 / Math.max(img.width, img.height)
      const w = img.width * scale
      const h = img.height * scale
      const canvas = createCanvas(S, S)
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#dbeafe'
      ctx.fillRect(0, 0, S, S)
      ctx.drawImage(img, (S - w) / 2, (S - h) / 2, w, h)
      writeFileSync(path.join(pvDir, `${cls}.png`), canvas.toBuffer('image/png'))
    } catch (e) {
      console.log(`  preview failed for ${cls}: ${e.message}`)
    }
  }
  console.log(`🖼  previews → scripts/tmp-atlas-preview/`)
}
