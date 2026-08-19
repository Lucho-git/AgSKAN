// Regenerates static/icons/rock-3x.png from the rock <symbol> in IconSVG.svelte
// with a FULLY OPAQUE disc (the previous 0.9-alpha disc let the map background
// show through, which combined with the grey-rock tint made the rock look
// translucent and recoloured). Same rendering as scripts/generateIcons.js
// (105px @3x, grey disc + shadow, icon at 0.85 scale).
//
// Run: node scripts/regen-rock.mjs
import { createCanvas, loadImage } from 'canvas'
import { readFileSync, writeFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ICON_SVG = path.join(
  __dirname,
  '../src/lib/components/general/IconSVG.svelte',
)
const OUT = path.join(__dirname, '../static/icons/rock-3x.png')

const src = readFileSync(ICON_SVG, 'utf-8')

const symbolMatch = src.match(/<symbol id="rock"[\s\S]*?<\/symbol>/)
const defsMatch = src.match(/<defs id="rock-defs">[\s\S]*?<\/defs>/)
if (!symbolMatch || !defsMatch) {
  console.error('❌ Could not find the rock symbol/defs in IconSVG.svelte')
  process.exit(1)
}

const symbolInner = symbolMatch[0]
  .replace(/^<symbol[^>]*>/, '')
  .replace(/<\/symbol>$/, '')
const defsInner = defsMatch[0]
  .replace(/^<defs[^>]*>/, '')
  .replace(/<\/defs>$/, '')
const viewBox = '0 0 100 101.14'

function calculateIconTransform(vb, targetSize) {
  const [x, y, width, height] = vb.split(' ').map(Number)
  const scale = targetSize / Math.max(width, height)
  const scaledWidth = width * scale
  const scaledHeight = height * scale
  const offsetX = (targetSize - scaledWidth) / 2
  const offsetY = (targetSize - scaledHeight) / 2
  return {
    scale,
    translateX: offsetX - x * scale,
    translateY: offsetY - y * scale,
  }
}

function createCompleteSvg(inner, vb, size) {
  const iconSize = size * 0.8
  const transform = calculateIconTransform(vb, iconSize)
  const centerOffset = (size - iconSize) / 2
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
    <defs>${defsInner}</defs>
    <g transform="translate(${centerOffset + transform.translateX}, ${centerOffset + transform.translateY}) scale(${transform.scale})">
      ${inner}
    </g>
  </svg>`
}

const displaySize = 35
const dpiScale = 3
const canvasSize = displaySize * dpiScale // 105
const canvas = createCanvas(canvasSize, canvasSize)
const ctx = canvas.getContext('2d')
ctx.imageSmoothingEnabled = true
ctx.imageSmoothingQuality = 'high'

// Fully opaque disc — the whole point of this regen.
const centerX = canvasSize / 2
const centerY = canvasSize / 2
const radius = canvasSize / 2 - 1 * dpiScale
ctx.fillStyle = 'rgba(211, 211, 211, 1)'
ctx.beginPath()
ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI)
ctx.fill()
ctx.shadowColor = 'rgba(0, 0, 0, 0.2)'
ctx.shadowBlur = 4 * dpiScale
ctx.shadowOffsetY = 2 * dpiScale
ctx.fill()
ctx.shadowColor = 'transparent'
ctx.shadowBlur = 0
ctx.shadowOffsetY = 0

const svgSize = Math.floor(canvasSize * 0.85) // 89
const completeSvg = createCompleteSvg(symbolInner, viewBox, svgSize)
const img = await loadImage(Buffer.from(completeSvg, 'utf-8'))
const iconX = (canvasSize - svgSize) / 2
const iconY = (canvasSize - svgSize) / 2
ctx.drawImage(img, iconX, iconY, svgSize, svgSize)

writeFileSync(
  OUT,
  canvas.toBuffer('image/png', { compressionLevel: 9, quality: 1.0 }),
)
console.log('✅ Regenerated rock-3x.png with an opaque disc')
