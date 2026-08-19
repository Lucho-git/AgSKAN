// Converts the new marker SVGs in static/icons/new/ into high-DPI (3x) PNGs
// in static/icons/, using the same rendering as scripts/generateIcons.js
// (35px display @ 3x = 105px canvas, light-grey disc + shadow, icon at 0.85
// scale, viewBox fitted + centered).
//
// Also writes scripts/gen-new-icons-symbols.txt with ready-to-paste
// <symbol> blocks for src/lib/components/general/IconSVG.svelte (rock_pile's
// class-based fills are inlined so rendering never depends on a <style>).
//
// Run: node scripts/gen-new-icons.mjs
import { createCanvas, loadImage } from 'canvas'
import { readFileSync, writeFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.join(__dirname, '../static/icons/new')
const OUT = path.join(__dirname, '../static/icons')

const ICONS = [
  { file: 'fuel_refill.svg', id: 'fuel_refill' },
  { file: 'liquid_tank.svg', id: 'liquid_tank' },
  { file: 'rock_pile.svg', id: 'rock_pile' },
  { file: 'water_tower2.svg', id: 'water_tower2' },
]

// rock_pile uses class-based fills — inline them so the rendered PNG (and
// the <symbol>) never depends on a <style> block.
const ROCK_PILE_FILLS = {
  st0: '#787878',
  st1: '#8C8C8C',
  st2: '#828282',
  st3: '#404040',
  st4: '#474747',
  st5: '#3B3B3B',
  st6: '#595959',
  st7: '#696969',
  st8: '#363636',
  st9: '#878787',
  st10: '#616161',
  st11: '#5E5E5E',
  st12: '#707070',
  st13: '#424240',
}

function transformRockPile(inner) {
  let out = inner
  // Drop the <style> block entirely (fills are inlined below).
  out = out.replace(/<style[\s\S]*?<\/style>/gi, '')
  // The st14 wrapper is the shadow layer (opacity 0.16) — apply inline.
  out = out.replace(/<g class="st14">/gi, '<g opacity="0.16">')
  for (const [cls, fill] of Object.entries(ROCK_PILE_FILLS)) {
    out = out.replace(new RegExp(`class="${cls}"`, 'g'), `fill="${fill}"`)
  }
  return out
}

function extractSvg(raw) {
  const viewBox = raw.match(/viewBox="([^"]+)"/)?.[1] || '0 0 100 100'
  const inner = (raw.match(/<svg[^>]*>([\s\S]*)<\/svg>/)?.[1] || '').trim()
  return { viewBox, inner }
}

function calculateIconTransform(viewBox, targetSize) {
  const [x, y, width, height] = viewBox.split(' ').map(Number)
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

function createCompleteSvg(inner, viewBox, size) {
  const iconSize = size * 0.8
  const transform = calculateIconTransform(viewBox, iconSize)
  const centerOffset = (size - iconSize) / 2
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
    <g transform="translate(${centerOffset + transform.translateX}, ${centerOffset + transform.translateY}) scale(${transform.scale})">
      ${inner}
    </g>
  </svg>`
}

async function main() {
  const displaySize = 35
  const dpiScale = 3
  const canvasSize = displaySize * dpiScale // 105
  const symbols = []

  for (const icon of ICONS) {
    const raw = readFileSync(path.join(SRC, icon.file), 'utf-8')
    const { viewBox, inner: rawInner } = extractSvg(raw)
    const inner =
      icon.id === 'rock_pile' ? transformRockPile(rawInner) : rawInner

    // Grey disc + shadow (identical to generateIcons.js custom icons).
    const canvas = createCanvas(canvasSize, canvasSize)
    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    const centerX = canvasSize / 2
    const centerY = canvasSize / 2
    const radius = canvasSize / 2 - 1 * dpiScale
    ctx.fillStyle = 'rgba(211, 211, 211, 0.9)'
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
    const completeSvg = createCompleteSvg(inner, viewBox, svgSize)
    const img = await loadImage(Buffer.from(completeSvg, 'utf-8'))
    const iconX = (canvasSize - svgSize) / 2
    const iconY = (canvasSize - svgSize) / 2
    ctx.drawImage(img, iconX, iconY, svgSize, svgSize)

    const outPath = path.join(OUT, `${icon.id}-3x.png`)
    writeFileSync(
      outPath,
      canvas.toBuffer('image/png', { compressionLevel: 9, quality: 1.0 }),
    )
    console.log('✅ Generated', outPath)

    symbols.push(
      `  <symbol id="${icon.id}" viewBox="${viewBox}">\n    ${inner}\n  </symbol>`,
    )
  }

  const symbolsPath = path.join(__dirname, 'gen-new-icons-symbols.txt')
  writeFileSync(symbolsPath, symbols.join('\n\n') + '\n')
  console.log('✅ Symbols written to', symbolsPath)

  // Insert or UPDATE the <symbol> blocks in IconSVG.svelte (before the final
  // render <svg>) so the marker pickers' thumbnails render them. Existing
  // symbols are replaced (so regenerated SVGs like rock_pile update), missing
  // ones are inserted — idempotent.
  const iconSvgPath = path.join(__dirname, '../src/lib/components/general/IconSVG.svelte')
  let iconSvg = readFileSync(iconSvgPath, 'utf-8')
  const marker = '<svg width={size} height={size} fill={color}>'
  const insertAt = iconSvg.indexOf(marker)
  if (insertAt === -1) {
    throw new Error('Could not find the IconSVG render <svg> to insert symbols')
  }
  for (const block of symbols) {
    const idMatch = block.match(/<symbol id="([^"]+)"/)
    const id = idMatch ? idMatch[1] : null
    if (id && new RegExp(`<symbol id="${id}"[\\s\\S]*?<\\/symbol>`).test(iconSvg)) {
      iconSvg = iconSvg.replace(
        new RegExp(`<symbol id="${id}"[\\s\\S]*?<\\/symbol>`),
        block,
      )
      console.log('✅ Updated symbol', id)
    } else {
      iconSvg = iconSvg.slice(0, insertAt) + block + '\n\n' + iconSvg.slice(insertAt)
      console.log('✅ Inserted symbol', id || '?')
    }
  }
  writeFileSync(iconSvgPath, iconSvg)
  console.log('✅ IconSVG.svelte symbols synced')
}

main().catch((e) => {
  console.error('❌', e)
  process.exit(1)
})
