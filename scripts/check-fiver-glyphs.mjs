// One-off: rasterize every fiver glyph with sharp to prove the SVG art is
// valid and renders non-blank (mirrors the runtime buildSvg logic).
import sharp from 'sharp'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const GLYPHS = JSON.parse(
  readFileSync(path.join(__dirname, '../static/marker-svg-glyphs.json'), 'utf-8'),
)
const SIZE = 105

function glyphTransform(viewBox, target) {
  const [x, y, w, h] = viewBox.split(' ').map(Number)
  const scale = target / Math.max(w, h)
  const tx = SIZE / 2 - (w * scale) / 2 - x * scale
  const ty = SIZE / 2 - (h * scale) / 2 - y * scale
  return `translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${scale.toFixed(4)})`
}

const keys = Object.keys(GLYPHS).filter((k) => k.startsWith('custom-svg-fiver'))
let failures = 0
for (const key of keys) {
  const glyph = GLYPHS[key]
  const wrap =
    glyph.tint === 'fill'
      ? `<g color="#111827" fill="#111827">${glyph.content}</g>`
      : glyph.content
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}"><circle cx="52.5" cy="52.5" r="49.5" fill="#f1f5f9"/><g transform="${glyphTransform(glyph.viewBox, 74)}">${wrap}</g></svg>`
  try {
    const { data, info } = await sharp(Buffer.from(svg)).png().raw().toBuffer({ resolveWithObject: true })
    let opaque = 0
    let dark = 0
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3]
      if (a > 0) opaque++
      if (a > 0 && data[i] < 100 && data[i + 1] < 100 && data[i + 2] < 100) dark++
    }
    const status = dark > 0 ? 'ok' : 'BLANK'
    if (status !== 'ok') failures++
    console.log(`${status === 'ok' ? '✅' : '❌'} ${key}  dark=${dark}px opaque=${opaque}px`)
  } catch (e) {
    failures++
    console.log(`❌ ${key}  RASTER ERROR: ${e.message}`)
  }
}
console.log(`\n${keys.length} fiver glyphs checked — ${failures} failure(s)`)
process.exit(failures ? 1 : 0)
