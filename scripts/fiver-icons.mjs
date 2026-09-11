// fiver-icons.mjs — Import / remove the Fiverr SVG marker icons
// ==============================================================
// The SVGs live in icon-art/fiver/*.svg. They are imported into the
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
const FIVER_DIR = path.join(__dirname, '../icon-art/fiver')
const MANIFEST_FILE = path.join(__dirname, 'fiver-icons-manifest.json')

// Second art pack — icon-art/fiver2 (prefix fiver2_). Same pipeline,
// separate manifest so each pack's removed/imported state is independent.
const FIVER2_DIR = path.join(__dirname, '../icon-art/fiver2')
const FIVER2_MANIFEST_FILE = path.join(__dirname, 'fiver2-icons-manifest.json')

// Third art pack — icon-art/fiver3 (prefix fiver3_): late review/test
// icons (better directions / new variants) the user added.
const FIVER3_DIR = path.join(__dirname, '../icon-art/fiver3')
const FIVER3_MANIFEST_FILE = path.join(__dirname, 'fiver3-icons-manifest.json')

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
  { file: 'Artboard 1.svg',        id: 'fiver_open_shed',     name: 'Open Shed' },
  { file: 'Artboard 2.svg',        id: 'fiver_chem_shed',     name: 'Chem Shed' },
  { file: 'Artboard 3.svg',        id: 'fiver_fert_shed',     name: 'Fert Shed' },
  { file: 'Artboard 4.svg',        id: 'fiver_grain_shed',    name: 'Grain Shed' },
  { file: 'Artboard 5.svg',        id: 'fiver_hay_shed',      name: 'Hay Shed' },
  { file: 'Artboard 6.svg',        id: 'fiver_tractor_shed',  name: 'Tractor Shed' },
  { file: 'Artboard 7.svg',        id: 'fiver_tools_shed',    name: 'Tools Shed' },
  { file: 'Artboard 8.svg',        id: 'fiver_sheep_shed',    name: 'Sheep Shed' },
  { file: 'Artboard 9.svg',        id: 'fiver_flexy_tank',    name: 'Flexy Tank' },
  { file: 'Artboard 10.svg',       id: 'fiver_diesel_bowser', name: 'Diesel Bowser' },
  { file: 'Artboard 11.svg',       id: 'fiver_hay_stack',     name: 'Hay Stack' },
  { file: 'Artboard 12.svg',       id: 'fiver_mother_bin',    name: 'Mother Bin' },
  { file: 'Artboard 13.svg',       id: 'fiver_grain_bag',     name: 'Grain Bag' },
  { file: 'Artboard 14.svg',       id: 'fiver_spray_trailer', name: 'Spray Trailer' },
  { file: 'Artboard 15.svg',       id: 'fiver_road_train',    name: 'Road Train' },
  { file: 'Artboard 16.svg',       id: 'fiver_sheep_mob',     name: 'Sheep Mob' },
  { file: 'Artboard 17.svg',       id: 'fiver_cattle_mob',    name: 'Cattle Mob' },
  { file: 'Artboard 18.svg',       id: 'fiver_service_trailer', name: 'Service Trailer' },
  { file: 'Artboard 19.svg',       id: 'fiver_water_trough',  name: 'Water Trough' },
  { file: 'Artboard 20.svg',       id: 'fiver_crossing',      name: 'Crossing' },
  { file: 'Artboard 21.svg',       id: 'fiver_fillup_truck',  name: 'Fillup Truck' },
  { file: 'Artboard 22.svg',       id: 'fiver_kangaroo',      name: 'Kangaroo' },
  { file: 'Artboard 23.svg',       id: 'fiver_rabbit',        name: 'Rabbit' },
  { file: 'Artboard 24.svg',       id: 'fiver_fox',           name: 'Fox' },
  { file: 'Artboard 25.svg',       id: 'fiver_pig',           name: 'Pig' },
]

// fiver2 pack — files live in static/icons/fiver2. "OPTION B/C" art variants
// keep a _b/_c suffix so the user can say "remove fiver2_mother_bin_b" later.
const FIVER2_MANIFEST = [
  { file: 'Berries.svg',               id: 'fiver2_berries',        name: 'Berries' },
  { file: 'Chem Shed.svg',             id: 'fiver2_chem_shed',      name: 'Chem Shed' },
  { file: 'Cow Mob.svg',               id: 'fiver2_cow_mob',        name: 'Cow Mob' },
  { file: 'Crossing.svg',              id: 'fiver2_crossing',       name: 'Crossing' },
  { file: 'Delivery.svg',              id: 'fiver2_delivery',       name: 'Delivery' },
  { file: 'Delivery OPTION B.svg',     id: 'fiver2_delivery_b',     name: 'Delivery' },
  { file: 'Diesel Bowser.svg',         id: 'fiver2_diesel_bowser',  name: 'Diesel Bowser' },
  { file: 'Fert Shed.svg',             id: 'fiver2_fert_shed',      name: 'Fert Shed' },
  { file: 'Field Bin.svg',             id: 'fiver2_field_bin',      name: 'Field Bin' },
  { file: 'Fill Up Truck.svg',         id: 'fiver2_fillup_truck',   name: 'Fillup Truck' },
  { file: 'Flexi Tank.svg',            id: 'fiver2_flexi_tank',     name: 'Flexi Tank' },
  { file: 'Fox.svg',                   id: 'fiver2_fox',            name: 'Fox' },
  { file: 'Fuel.svg',                  id: 'fiver2_fuel',           name: 'Fuel' },
  { file: 'Fuel Trailer.svg',          id: 'fiver2_fuel_trailer',   name: 'Fuel Trailer' },
  { file: 'Grain Bag.svg',             id: 'fiver2_grain_bag',      name: 'Grain Bag' },
  { file: 'Grain Bag OPTION B.svg',    id: 'fiver2_grain_bag_b',    name: 'Grain Bag B' },
  { file: 'Grain Shed.svg',            id: 'fiver2_grain_shed',     name: 'Grain Shed' },
  { file: 'Harvest.svg',               id: 'fiver2_harvest',        name: 'Harvest' },
  { file: 'hay shed.svg',              id: 'fiver2_hay_shed',       name: 'Hay Shed' },
  { file: 'Hay Stack.svg',             id: 'fiver2_hay_stack',      name: 'Hay Stack' },
  { file: 'Hay Stack OPTION B.svg',    id: 'fiver2_hay_stack_b',    name: 'Hay Stack B' },
  { file: 'Kangaroo.svg',              id: 'fiver2_kangaroo',       name: 'Kangaroo' },
  { file: 'Liquid.svg',                id: 'fiver2_liquid',         name: 'Liquid' },
  { file: 'Machine Shed.svg',          id: 'fiver2_machine_shed',   name: 'Machine Shed' },
  { file: 'Mother Bin.svg',            id: 'fiver2_mother_bin',     name: 'Mother Bin' },
  { file: 'Mother Bin OPTION B.svg',   id: 'fiver2_mother_bin_b',   name: 'Mother Bin B' },
  { file: 'Mother Bin OPTION C.svg',   id: 'fiver2_mother_bin_c',   name: 'Mother Bin C' },
  { file: 'Open Shed.svg',             id: 'fiver2_open_shed',      name: 'Open Shed' },
  { file: 'Pig.svg',                   id: 'fiver2_pig',            name: 'Pig' },
  { file: 'Pile of Rocks.svg',         id: 'fiver2_pile_of_rocks',  name: 'Pile of Rocks' },
  { file: 'Rabbit.svg',                id: 'fiver2_rabbit',         name: 'Rabbit' },
  { file: 'Road Train.svg',            id: 'fiver2_road_train',     name: 'Road Train' },
  { file: 'Road Train OPTION B.svg',   id: 'fiver2_road_train_b',   name: 'Road Train B' },
  { file: 'Rock.svg',                  id: 'fiver2_rock',           name: 'Rock' },
  { file: 'Rude.svg',                  id: 'fiver2_rude',           name: 'Rude' },
  { file: 'Shearing Shed.svg',         id: 'fiver2_shearing_shed',  name: 'Shearing Shed' },
  { file: 'Sheep Mob.svg',             id: 'fiver2_sheep_mob',      name: 'Sheep Mob' },
  { file: 'Sheep Mob OPTION B.svg',    id: 'fiver2_sheep_mob_b',    name: 'Sheep Mob B' },
  { file: 'Silo.svg',                  id: 'fiver2_silo',           name: 'Silo' },
  { file: 'Spray Trailer.svg',         id: 'fiver2_spray_trailer',  name: 'Spray Trailer' },
  { file: 'Tree.svg',                  id: 'fiver2_tree',           name: 'Tree' },
  { file: 'Trough.svg',                id: 'fiver2_trough',         name: 'Trough' },
  { file: 'Ute Vehicle.svg',           id: 'fiver2_ute',            name: 'Ute' },
  { file: 'Vegetables.svg',            id: 'fiver2_vegetables',     name: 'Vegetables' },
  { file: 'Water Tank.svg',            id: 'fiver2_water_tank',     name: 'Water Tank' },
  { file: 'Wheel Ruts.svg',            id: 'fiver2_wheel_ruts',     name: 'Wheel Ruts' },
  { file: 'Workshop Shed.svg',         id: 'fiver2_workshop_shed',  name: 'Workshop Shed' },
]

// fiver3 pack — static/icons/fiver3 (prefix fiver3_). User-added review/test
// icons; artboards map to the concept they improve so they can be compared
// with the existing versions and later chosen/rejected.
const FIVER3_MANIFEST = [
  { file: 'Artboard 15.svg', id: 'fiver3_road_train',    name: 'Road Train' },
  { file: 'Artboard 19.svg', id: 'fiver3_trough',        name: 'Trough' },
  { file: 'Artboard 21.svg', id: 'fiver3_fillup_truck',  name: 'Fillup Truck' },
  { file: 'Artboard 31.svg', id: 'fiver3_truck_fillup',  name: 'Truck Fill Up' },
]

// Pack registry. One script drives both packs: --pack fiver2 targets the
// second art pack; the default (fiver) behaves exactly as before.
const PACKS = {
  fiver: {
    dir: FIVER_DIR,
    manifestFile: MANIFEST_FILE,
    tag: 'FIVER',
    manifest: MANIFEST,
  },
  fiver2: {
    dir: FIVER2_DIR,
    manifestFile: FIVER2_MANIFEST_FILE,
    tag: 'FIVER2',
    manifest: FIVER2_MANIFEST,
  },
  fiver3: {
    dir: FIVER3_DIR,
    manifestFile: FIVER3_MANIFEST_FILE,
    tag: 'FIVER3',
    manifest: FIVER3_MANIFEST,
  },
}

// The markers differ per file type (HTML comment in IconSVG, // in JS).
function markersFor(kind, tag) {
  if (kind === 'html') {
    return { start: `<!-- ${tag}_ICONS_START -->`, end: `<!-- ${tag}_ICONS_END -->` }
  }
  return { start: `// ${tag}_ICONS_START`, end: `// ${tag}_ICONS_END` }
}

// Picker ordering in markerDefinitions.js is one COMBINED, grouped block
// (FARM_ICONS_* sentinels) fed by BOTH packs, so related icons from the old
// (fiver) and new (fiver2) packs sit together and duplicate concepts are
// adjacent for easy comparing. Order lives here, not in the generated file.
//
// Icons in FARM_BLOCK_EXCLUDED live in the hand-edited CORE region above the
// block (the "Fuel, tanks & storage" cluster in markerDefinitions.js, next to
// the charge/pump/tank icons) so they are never written into the auto block
// (which would duplicate them).
const FARM_BLOCK_EXCLUDED = new Set([
  // Fuel/tank cluster (hand-placed above the FARM block)
  'fiver_fuel',
  'fiver_diesel_bowser',
  'fiver_flexy_tank',
  'fiver2_trough',
  'fiver2_liquid',
  // New tree sits beside the old (core) tree at the top of the picker
  'fiver2_tree',
  // Animals group sits just above the fuel cluster
  'fiver_sheep_mob',
  'fiver2_cow_mob',
  'fiver2_fox',
  'fiver2_kangaroo',
  'fiver2_pig',
  'fiver2_rabbit',
  // Crossing sits next to the high-usage Gate
  'fiver2_crossing',
])

const FARM_GROUPS = [
  {
    h: 'Sheds & buildings',
    ids: [
      'fiver_open_shed', 'fiver2_hay_shed',
      'fiver_chem_shed', 'fiver_fert_shed', 'fiver_grain_shed',
      'fiver_sheep_shed', 'fiver_tractor_shed', 'fiver_tools_shed',
    ],
  },
  {
    h: 'Storage & grain',
    ids: [
      'fiver_field_bin_v4', 'fiver2_mother_bin', 'fiver2_hay_stack',
      'fiver2_grain_bag',
    ],
  },
  {
    h: 'Vehicles & machinery',
    ids: [
      'fiver_dump_truck_v2', 'fiver_tow_truck', 'fiver_bulldozer', 'fiver2_ute',
      'fiver3_fillup_truck', 'fiver3_truck_fillup',
      'fiver2_delivery_b', 'fiver2_fuel_trailer',
      'fiver_service_trailer', 'fiver_spray_trailer',
      'fiver2_road_train', 'fiver2_wheel_ruts',
    ],
  },
  {
    h: 'Produce & crops',
    ids: ['fiver_harvest', 'fiver_vegetables', 'fiver2_berries', 'fiver_kg'],
  },
  {
    h: 'Misc',
    ids: ['fiver2_rude'],
  },
]

const SOURCES = [
  {
    label: 'IconSprite.svelte',
    file: path.join(__dirname, '../src/lib/components/general/IconSprite.svelte'),
    kind: 'html',
    block: async (entries, pack) => {
      const blocks = []
      for (const e of entries) {
        const b = await buildSymbolBlock(pack, e)
        if (b) blocks.push(b)
      }
      return blocks.join('\n\n')
    },
  },
  {
    label: 'gen-svg-glyphs.mjs (CUSTOM_ICONS)',
    file: path.join(__dirname, 'gen-svg-glyphs.mjs'),
    kind: 'js',
    block: (entries) => entries.map((e) => `  '${e.id}',`).join('\n'),
  },
  {
    label: 'generateIcons.js (customSvgIcons)',
    file: path.join(__dirname, 'generateIcons.js'),
    kind: 'js',
    block: (entries) => entries.map((e) => `  "${e.id}",`).join('\n'),
  },
]

// ── helpers ──

function readState(manifestFile = MANIFEST_FILE) {
  if (!existsSync(manifestFile)) return { imported: [], removed: [] }
  try {
    const data = JSON.parse(readFileSync(manifestFile, 'utf-8'))
    return {
      imported: Array.isArray(data.imported) ? data.imported : [],
      removed: Array.isArray(data.removed) ? data.removed : [],
    }
  } catch {
    return { imported: [], removed: [] }
  }
}

function writeState(manifestFile, state) {
  writeFileSync(manifestFile, JSON.stringify(state, null, 2) + '\n')
}

async function buildSymbolBlock(pack, entry) {
  const p = path.join(pack.dir, entry.file)
  if (!existsSync(p)) {
    console.warn(`  ⚠️  Missing file (skipped): ${entry.file}`)
    return null
  }
  let svg = readFileSync(p, 'utf-8')
  svg = svg.replace(/<\?xml[^>]*\?>/g, '')
  // Some art styles shapes via a <style> block (e.g. `.cls-1 { fill:#000207;
  // fill-rule:evenodd; }`) instead of inline attributes. The CSS fill overrides
  // the tint colour just like an inline one, so drop every `fill:` declaration
  // but keep other props (fill-rule keeps even-odd winding rendering right).
  svg = svg.replace(/\bfill\s*:\s*[^;}]*(?:;|})/g, '')
  let viewBox = (svg.match(/viewBox="([^"]+)"/) || [])[1] || '0 0 512 512'
  const inner = (svg.match(/<svg[^>]*>([\s\S]*)<\/svg>/) || [])[1] || ''
  // Drop id="..." attrs from nested elements so the symbols never collide.
  // Also strip baked colour fills (e.g. fill="#000000") — these packs are
  // black silhouettes meant to be tinted, and an explicit fill overrides the
  // tint colour (making the icon render black in the pickers/map).
  const content = inner
    .replace(/\sid="[^"]*"/g, '')
    .replace(/\sfill="[^"]*"/g, '')
    .trim()
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

async function regenerate(entries, pack) {
  for (const src of SOURCES) {
    const text = readFileSync(src.file, 'utf-8')
    const { start, end } = markersFor(src.kind, pack.tag)
    const s = text.indexOf(start)
    const e = text.indexOf(end)
    if (s === -1 || e === -1) {
      console.warn(`  ⚠️  Sentinel ${start} not found in ${src.label} — skipped`)
      continue
    }
    const head = text.slice(0, s + start.length)
    const tail = text.slice(e)
    const block = await src.block(entries, pack)
    const body = block ? `\n${block}\n` : '\n'
    writeFileSync(src.file, head + body + tail)
    console.log(`  ✅ ${src.label} — ${entries.length} icon(s)`)
  }
}

// Rewrite the COMBINED, grouped picker block in markerDefinitions.js from the
// current imported state of both packs (see FARM_GROUPS above).
function regenerateFarmDefs() {
  const file = path.join(__dirname, '../src/lib/data/markerDefinitions.js')
  const start = '// FARM_ICONS_START'
  const end = '// FARM_ICONS_END'
  const text = readFileSync(file, 'utf-8')
  const s = text.indexOf(start)
  const e = text.indexOf(end)
  if (s === -1 || e === -1) {
    console.warn(`  ⚠️  Sentinel ${start} not found in markerDefinitions.js — skipped`)
    return
  }
  const map = new Map()
  for (const mf of [MANIFEST_FILE, FIVER2_MANIFEST_FILE, FIVER3_MANIFEST_FILE]) {
    for (const ent of readState(mf).imported) {
      if (!FARM_BLOCK_EXCLUDED.has(ent.id)) map.set(ent.id, ent)
    }
  }
  const lineFor = (id) => {
    const ent = map.get(id)
    return `  { id: "${ent.id}", class: "custom-svg", name: "${ent.name}", active: true${ent.special ? ', special: true' : ''} },`
  }
  const lines = []
  const listed = new Set()
  for (const g of FARM_GROUPS) {
    const ids = g.ids.filter((id) => map.has(id))
    if (!ids.length) continue
    if (lines.length) lines.push('')
    lines.push(`  // ── ${g.h} ──`)
    for (const id of ids) {
      lines.push(lineFor(id))
      listed.add(id)
    }
  }
  const leftovers = [...map.keys()].filter((id) => !listed.has(id))
  if (leftovers.length) {
    if (lines.length) lines.push('')
    lines.push('  // ── Others ──')
    for (const id of leftovers) lines.push(lineFor(id))
  }
  const head = text.slice(0, s + start.length)
  const tail = text.slice(e)
  writeFileSync(file, head + '\n' + lines.join('\n') + '\n' + tail)
  console.log(`  ✅ markerDefinitions.js (grouped) — ${map.size} icon(s)`)
}

function printTable(pack, entries) {
  console.log('\nNaming manifest (id → file → display name):')
  for (const e of entries) {
    const exists = existsSync(path.join(pack.dir, e.file))
    console.log(`  ${e.id.padEnd(24)} ${e.name.padEnd(14)} ${e.file}${exists ? '' : '  ⚠️ missing'}`)
  }
}

// ── commands ──

const args = process.argv.slice(2)

// Which pack to act on: `--pack fiver2`, default `fiver`.
const packKey = args.includes('--pack')
  ? args[args.indexOf('--pack') + 1]
  : 'fiver'
const PACK = PACKS[packKey] || PACKS.fiver

// ── --list ──
if (args.includes('--list')) {
  const { imported, removed } = readState(PACK.manifestFile)
  printTable(PACK, imported)
  console.log(`\n[${packKey}] imported: ${imported.length} icon(s)`)
  if (removed.length) console.log(`Removed (won't re-import): ${removed.join(', ')}`)
  process.exit(0)
}

// ── --remove ──
if (args.includes('--remove')) {
  const idx = args.indexOf('--remove')
  const ids = args[idx + 1] ? args[idx + 1].split(',').map((s) => s.trim()).filter(Boolean) : []
  if (!ids.length) {
    console.error('Usage: node scripts/fiver-icons.mjs --pack fiver2 --remove id1,id2')
    process.exit(1)
  }
  const state = readState(PACK.manifestFile)
  const removedHere = ids.filter((id) => state.imported.some((i) => i.id === id))
  state.imported = state.imported.filter((i) => !ids.includes(i.id))
  for (const id of ids) {
    if (!state.removed.includes(id)) state.removed.push(id)
  }
  writeState(PACK.manifestFile, state)
  console.log(`Removed ${removedHere.length} icon(s): ${removedHere.join(', ') || '(none were imported)'}`)
  await regenerate(state.imported, PACK)
  regenerateFarmDefs()
  console.log('\nNext: run "node scripts/gen-svg-glyphs.mjs" then "node scripts/generateIcons.js"')
  process.exit(0)
}

// ── default: import ──
{
  const files = readdirSync(PACK.dir).filter((f) => f.endsWith('.svg'))
  const state = readState(PACK.manifestFile)
  const importedIds = new Set(state.imported.map((i) => i.id))
  const removedSet = new Set(state.removed)
  let added = 0
  for (const m of PACK.manifest) {
    if (!files.includes(m.file)) {
      console.warn(`  ⚠️  ${m.file} not found in ${PACK.dir}`)
      continue
    }
    if (removedSet.has(m.id)) continue
    if (!importedIds.has(m.id)) {
      state.imported.push({
        file: m.file,
        id: m.id,
        name: m.name,
        ...(m.pad ? { pad: m.pad } : {}),
        ...(m.special ? { special: true } : {}),
      })
      importedIds.add(m.id)
      added++
    }
  }
  writeState(PACK.manifestFile, state)
  console.log(`\nImporting ${packKey} icons… (${added} new, ${state.imported.length} total)`)
  printTable(PACK, state.imported)
  console.log('')
  await regenerate(state.imported, PACK)
  regenerateFarmDefs()
  console.log('\nNext: run "node scripts/gen-svg-glyphs.mjs" then "node scripts/generateIcons.js"')
}
