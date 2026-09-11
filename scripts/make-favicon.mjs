// make-favicon.mjs — Generate the browser favicon set from the current app icon
// ============================================================================
// The "new" AgSKAN app icon (gear + map pin + field motif, black on yellow)
// lives as a raster in the native app projects. This script re-derives the web
// favicon files from it so the browser tab matches the installed app icon:
//
//   static/favicon.png         64x64 PNG (referenced by src/app.html)
//   static/favicon.ico         16+32+48 multi-size ICO (PNG-in-ICO container)
//   static/icons/favicon.ico   same bytes (legacy location)
//   static/icon.svg            SVG wrapper embedding a 96x96 PNG so the
//                              <link rel="icon" .../icon.svg> in src/app.html
//                              keeps working without a stale vector.
//
// Source (change here if the icon artwork moves):
//   ios/App/App/Assets.xcassets/AppIcon.appiconset/SkanLogoYellow.png
//
// Run: node scripts/make-favicon.mjs
// (browsers cache favicons hard — hard-refresh after regenerating)
import { writeFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.join(
  __dirname,
  '../ios/App/App/Assets.xcassets/AppIcon.appiconset/SkanLogoYellow.png',
)

const png = (size) =>
  sharp(SRC).resize(size, size, { fit: 'cover' }).png({ compressionLevel: 9 }).toBuffer()

// Minimal ICO container with PNG payloads (supported by every modern browser,
// Windows Vista+). width/height byte = size (0 means 256).
function buildIco(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(images.length, 4)

  const entries = []
  const blobs = []
  let offset = 6 + 16 * images.length
  for (const img of images) {
    const e = Buffer.alloc(16)
    e.writeUInt8(img.size >= 256 ? 0 : img.size, 0)
    e.writeUInt8(img.size >= 256 ? 0 : img.size, 1)
    e.writeUInt8(0, 2) // palette
    e.writeUInt8(0, 3) // reserved
    e.writeUInt16LE(1, 4) // color planes
    e.writeUInt16LE(32, 6) // bits per pixel
    e.writeUInt32LE(img.buf.length, 8)
    e.writeUInt32LE(offset, 12)
    offset += img.buf.length
    entries.push(e)
    blobs.push(img.buf)
  }
  return Buffer.concat([header, ...entries, ...blobs])
}

const [p16, p32, p48, p64, p96] = await Promise.all(
  [16, 32, 48, 64, 96].map(png),
)

writeFileSync(path.join(__dirname, '../static/favicon.png'), p64)

const ico = buildIco([
  { size: 16, buf: p16 },
  { size: 32, buf: p32 },
  { size: 48, buf: p48 },
])
writeFileSync(path.join(__dirname, '../static/favicon.ico'), ico)
writeFileSync(path.join(__dirname, '../static/icons/favicon.ico'), ico)

const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">` +
  `<image width="96" height="96" href="data:image/png;base64,${p96.toString('base64')}"/>` +
  `</svg>\n`
writeFileSync(path.join(__dirname, '../static/icon.svg'), svg)

console.log(
  `✅ favicon.png (64px, ${p64.length} B) · favicon.ico (16/32/48, ${ico.length} B) · icon.svg (${svg.length} B)`,
)
