// fiver-icons.mjs — Import / remove the Fiverr SVG marker icons
// ==============================================================
// The SVGs live in static/icons/fiver/*.svg. They are imported into the
// existing custom-SVG marker pipeline so they:
//   • render on the map (runtime SVG renderer via marker-svg-glyphs.json)
//   • render in the marker pickers (<IconSVG> symbols)
//   • get high-DPI PNG fallbacks (static/icons/*-3x.png + icon-paths.json)
//   • become selectable markers (MARKER_DEFINITIONS)
//
// Usage:
//   node scripts/fiver-icons.mjs            → import everything (idempotent)
//   node scripts/fiver-icons.mjs --list     → show the naming manifest
//   node scripts/fiver-icons.mjs --remove fiver_kg,fiver_kg_v2
//                                           → remove specific icons everywhere
//
// After ANY run, regenerate the derived assets:
//   node scripts/gen-svg-glyphs.mjs
//   node scripts/generateIcons.js
//
// Naming system:  fiver_<name>  (snake_case, kebab files become underscores).
// Variants get _v2 / _v4 matching the " 2"/" (4)" suffixes in the filenames,
// so the user can say "keep fiver_bulldozer, remove fiver_bulldozer_v2".
//
// The currently-imported set is persisted in scripts/fiver-icons-manifest.json
// so a plain re-run never re-adds icons that were removed.

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIVER_DIR = path.join(__dirname, '../static/icons/fiver')
const MANIFEST_FILE = path.join(__dirname, 'fiver-icons-manifest.json')

// Files we recognise. IMPORTANT: exact filename (spaces + trailing spaces
// preserved) — the SVG folder is the source of truth.
const MANIFEST = [
  { file: 'bulldozer.svg',         id: 'fiver_bulldozer',     name: 'Bulldozer' },
  { file: 'bulldozer 2.svg',       id: 'fiver_bulldozer_v2',  name: 'Bulldozer 2' },
  { file: 'dump truck .svg',       id: 'fiver_dump_truck',    name: 'Dump Truck' },
  { file: 'dump truck 2.svg',      id: 'fiver_dump_truck_v2', name: 'Dump Truck 2' },
  { file: 'field bin.svg',         id: 'fiver_field_bin',     name: 'Field Bin' },
  { file: 'field bin 2.svg',       id: 'fiver_field_bin_v2',  name: 'Field Bin 2' },
  { file: 'field bin (4).svg',     id: 'fiver_field_bin_v4',  name: 'Field Bin', special: true },
  { file: 'fuel.svg',              id: 'fiver_fuel',          name: 'Fuel' },
  { file: 'fuel 2.svg',            id: 'fiver_fuel_v2',       name: 'Fuel 2' },
  { file: 'harvest .svg',          id: 'fiver_harvest',       name: 'Harvest' },
  { file: 'harvest 2.svg',         id: 'fiver_harvest_v2',    name: 'Harvest 2' },
  { file: 'house car.svg',         id: 'fiver_house_car',     name: 'House Car' },
  { file: 'house car 2.svg',       id: 'fiver_house_car_v2',  name: 'House Car 2' },
  { file: 'kg.svg',                id: 'fiver_kg',            name: 'KG Weight' },
  { file: 'kg 2.svg',              id: 'fiver_kg_v2',         name: 'KG Weight 2' },
  { file: 'rude.svg',              id: 'fiver_rude',          name: 'Rude' },
  { file: 'rude 2.svg',            id: 'fiver_rude_v2',       name: 'Rude 2' },
  { file: 'tow truck.svg',         id: 'fiver_tow_truck',     name: 'Tow Truck' },
  { file: 'tow truck 2.svg',       id: 'fiver_tow_truck_v2',  name: 'Tow Truck 2' },
  { file: 'vegetables.svg',        id: 'fiver_vegetables',    name: 'Vegetables' },
  { file: 'vegetables 2.svg',      id: 'fiver_vegetables_v2', name: 'Vegetables 2' },
]

const SOURCES = [
  {
    label: 'IconSVG.svelte',
    file: path.join(__dirname, '../src/lib/components/general/IconSVG.svelte'),
    start: '<!-- FIVER_ICONS_START -->',
    end: '<!-- FIVER_ICONS_END -->',
    block: async (entries) => {
      const blocks = []
      for (const e of entries) {
        const b = await buildSymbolBlock(e)
        if (b) blocks.push(b)
      }
      return blocks.join('\n\n')
    },
  },
  {
    label: 'gen-svg-glyphs.mjs (CUSTOM_ICONS)',
    file: path.join(__dirname, 'gen-svg-glyphs.mjs'),
    start: '// FIVER_ICONS_START',
    end: '// FIVER_ICONS_END',
    block: (entries) => entries.map((e) => `  '${e.id}',`).join('\n'),
  },
  {
    label: 'generateIcons.js (customSvgIcons)',
    file: path.join(__dirname, 'generateIcons.js'),
    start: '// FIVER_ICONS_START',
    end: '// FIVER_ICONS_END',
    block: (entries) => entries.map((e) => `  "${e.id}",`).join('\n'),
  },
  {
    label: 'markerDefinitions.js',
    file: path.join(__dirname, '../src/lib/data/markerDefinitions.js'),
    start: '// FIVER_ICONS_START',
    end: '// FIVER_ICONS_END',
    block: (entries) =>
      entries
        .map(
          (e) =>
            `  { id: "${e.id}", class: "custom-svg", name: "${e.name}", active: true${e.special ? ', special: true' : ''} },`,
        )
        .join('\n'),
  },
]

// ── helpers ──

function readState() {
  if (!existsSync(MANIFEST_FILE)) return { imported: [], removed: [] }
  try {
    const data = JSON.parse(readFileSync(MANIFEST_FILE, 'utf-8'))
    return {
      imported: Array.isArray(data.imported) ? data.imported : [],
      removed: Array.isArray(data.removed) ? data.removed : [],
    }
  } catch {
    return { imported: [], removed: [] }
  }
}

function writeState(state) {
  writeFileSync(MANIFEST_FILE, JSON.stringify(state, null, 2) + '\n')
}

async function buildSymbolBlock(entry) {
  const p = path.join(FIVER_DIR, entry.file)
  if (!existsSync(p)) {
    console.warn(`  ⚠️  Missing file (skipped): ${entry.file}`)
    return null
  }
  let svg = readFileSync(p, 'utf-8')
  svg = svg.replace(/<\?xml[^>]*\?>/g, '')
  let viewBox = (svg.match(/viewBox="([^"]+)"/) || [])[1] || '0 0 512 512'
  const inner = (svg.match(/<svg[^>]*>([\s\S]*)<\/svg>/) || [])[1] || ''
  // Drop id="..." attrs from nested elements so the symbols never collide.
  const content = inner.replace(/\sid="[^"]*"/g, '').trim()
  if (!content) {
    console.warn(`  ⚠️  No <svg> content in ${entry.file}`)
    return null
  }
  // Tighten the viewBox to the artwork's actual bounding box so the icon
  // fills the 74-unit glyph box like the atlas icons (the 512×512 canvas
  // has lots of internal padding, which made these icons render smaller).
  // A per-icon `pad` fraction (e.g. 0.1) expands the box so the glyph
  // renders slightly smaller — used for icons that come out a bit too big.
  viewBox = await tightViewBox(content, viewBox, entry.pad || 0)
  return `<symbol id="${entry.id}" viewBox="${viewBox}">\n  ${content}\n</symbol>`
}

// Rasterise the raw glyph art and return a viewBox that hugs its pixels.
// `pad` (fraction of the larger side) expands the box on all sides so the
// glyph renders smaller — e.g. 0.1 ≈ 17% smaller.
async function tightViewBox(content, viewBox, pad = 0) {
  const [vx, vy, vw, vh] = viewBox.split(' ').map(Number)
  if (!vw || !vh) return viewBox
  const scale = 2 // 2× raster for a clean edge estimate
  const W = Math.round(vw * scale)
  const H = Math.round(vh * scale)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="${viewBox}"><g fill="#000000">${content}</g></svg>`
  try {
    const { data, info } = await sharp(Buffer.from(svg)).png().raw().toBuffer({ resolveWithObject: true })
    let minX = info.width, minY = info.height, maxX = -1, maxY = -1
    for (let y = 0; y < info.height; y++) {
      const row = y * info.width
      for (let x = 0; x < info.width; x++) {
        if (data[(row + x) * 4 + 3] > 0) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    }
    if (maxX < 0) return viewBox // blank art — keep the original box
    const px = vw / W
    const py = vh / H
    let x0 = vx + minX * px
    let y0 = vy + minY * py
    let x1 = vx + (maxX + 1) * px
    let y1 = vy + (maxY + 1) * py
    if (pad > 0) {
      const dim = Math.max(x1 - x0, y1 - y0)
      const off = dim * pad
      x0 -= off
      y0 -= off
      x1 += off
      y1 += off
    }
    return `${x0.toFixed(2)} ${y0.toFixed(2)} ${(x1 - x0).toFixed(2)} ${(y1 - y0).toFixed(2)}`
  } catch (e) {
    console.warn(`  ⚠️  viewBox tighten failed (${e.message}) — using ${viewBox}`)
    return viewBox
  }
}

async function regenerate(entries) {
  for (const src of SOURCES) {
    const text = readFileSync(src.file, 'utf-8')
    const s = text.indexOf(src.start)
    const e = text.indexOf(src.end)
    if (s === -1 || e === -1) {
      console.warn(`  ⚠️  Sentinel not found in ${src.label} — skipped`)
      continue
    }
    const head = text.slice(0, s + src.start.length)
    const tail = text.slice(e)
    const block = await src.block(entries)
    const body = block ? `\n${block}\n` : '\n'
    writeFileSync(src.file, head + body + tail)
    console.log(`  ✅ ${src.label} — ${entries.length} icon(s)`)
  }
}

function printTable(entries) {
  console.log('\nNaming manifest (id → file → display name):')
  for (const e of entries) {
    const exists = existsSync(path.join(FIVER_DIR, e.file))
    console.log(`  ${e.id.padEnd(24)} ${e.name.padEnd(14)} ${e.file}${exists ? '' : '  ⚠️ missing'}`)
  }
}

// ── commands ──

const args = process.argv.slice(2)

// ── --list ──
if (args.includes('--list')) {
  const { imported, removed } = readState()
  printTable(MANIFEST)
  console.log(`\nCurrently imported: ${imported.length} icon(s)`)
  if (removed.length) console.log(`Removed (won't re-import): ${removed.join(', ')}`)
  process.exit(0)
}

// ── --remove ──
if (args.includes('--remove')) {
  const idx = args.indexOf('--remove')
  const ids = args[idx + 1] ? args[idx + 1].split(',').map((s) => s.trim()).filter(Boolean) : []
  if (!ids.length) {
    console.error('Usage: node scripts/fiver-icons.mjs --remove id1,id2')
    process.exit(1)
  }
  const state = readState()
  const removedHere = ids.filter((id) => state.imported.some((i) => i.id === id))
  state.imported = state.imported.filter((i) => !ids.includes(i.id))
  for (const id of ids) {
    if (!state.removed.includes(id)) state.removed.push(id)
  }
  writeState(state)
  console.log(`Removed ${removedHere.length} icon(s): ${removedHere.join(', ') || '(none were imported)'}`)
  await regenerate(state.imported)
  console.log('\nNext: run "node scripts/gen-svg-glyphs.mjs" then "node scripts/generateIcons.js"')
  process.exit(0)
}

// ── default: import ──
{
  const files = readdirSync(FIVER_DIR).filter((f) => f.endsWith('.svg'))
  const state = readState()
  const importedIds = new Set(state.imported.map((i) => i.id))
  const removedSet = new Set(state.removed)
  let added = 0
  for (const m of MANIFEST) {
    if (!files.includes(m.file)) {
      console.warn(`  ⚠️  ${m.file} not found in static/icons/fiver/`)
      continue
    }
    if (removedSet.has(m.id)) continue
    if (!importedIds.has(m.id)) {
      state.imported.push({ file: m.file, id: m.id, name: m.name, ...(m.special ? { special: true } : {}) })
      importedIds.add(m.id)
      added++
    }
  }
  writeState(state)
  console.log(`\nImporting fiver icons… (${added} new, ${state.imported.length} total)`)
  printTable(state.imported)
  console.log('')
  await regenerate(state.imported)
  console.log('\nNext: run "node scripts/gen-svg-glyphs.mjs" then "node scripts/generateIcons.js"')
}
