// Extracts raw glyph SVG art for the runtime SVG marker renderer (full set)
// and writes:
//   - static/marker-svg-glyphs.json        → heavy payload (fetched lazily)
//   - src/lib/components/map/markers/markerSvgGlyphs.js → tiny sync key set
//
// Sources:
//   custom-svg-*  → IconSVG.svelte <symbol> blocks (class fills inlined;
//                   <defs>/<use>/<style> removed so browser + librsvg render)
//   ionic-*       → node_modules/ionicons/dist/ionicons/svg/<name>.svg
//   at-*          → scripts/atlas-icons.js (stroke:currentColor outline icons)
//
// tint: "keep" renders the glyph art as-is (keeps its own colours, e.g. the
// grey rock boulder); "fill" wraps it in <g color fill> so it tints fully
// (works for both fill-based ionics and stroke-based atlas outlines).
//
// Run: node scripts/gen-svg-glyphs.mjs
import { readFileSync, writeFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { atlasIconSvgs } from './atlas-icons.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ICON_SVG = path.join(__dirname, '../src/lib/components/general/IconSVG.svelte')
const GLYPHS_JSON = path.join(__dirname, '../static/marker-svg-glyphs.json')
const SET_JS = path.join(__dirname, '../src/lib/components/map/markers/markerSvgGlyphs.js')
const IONIC_DIR = path.join(__dirname, '../node_modules/ionicons/dist/ionicons/svg')

// ── Icon lists ──
// Custom SVG symbols (id in IconSVG.svelte). These keep their original glyph
// colours EXCEPT the fully-tinted set (mirrors markerPalette
// FULLY_TINTED_CUSTOM_SVG).
const CUSTOM_ICONS = [
  'rock', 'rock_pile', 'tree13', 'wheat2', 'kangaroo', 'watertank2',
  'water_tower2', 'liquid_tank', 'recharge_icon', 'fuel_refill',
  'machine_pump', 'electric_tower', 'gate', 'repair_shop', 'tractor',
  'silo2', 'tree_stump', 'workshop_icon',
]
const FULLY_TINTED_CUSTOM = new Set([
  'custom-svg-gate',
  'custom-svg-fuel_refill',
  'custom-svg-liquid_tank',
  'custom-svg-water_tower2',
])

// Ionic icon names (same list as generateIcons.js).
const IONIC_NAMES = [
  'pin', 'arrow-up-circle', 'arrow-down-circle', 'arrow-back-circle',
  'arrow-forward-circle', 'thumbs-down', 'thumbs-up', 'accessibility',
  'people', 'settings', 'home', 'checkmark-circle', 'close-circle',
  'information-circle', 'warning', 'help-circle', 'ban', 'location',
  'lock-closed', 'lock-open', 'trash', 'cart', 'locate', 'leaf', 'call',
  'wifi', 'radio', 'cloud-offline', 'battery-charging', 'thermometer',
  'sunny', 'cloud', 'thunderstorm', 'rainy', 'water', 'fast-food',
  'restaurant', 'airplane', 'trail-sign', 'car', 'beer', 'bonfire',
  'boat', 'bed', 'bicycle', 'build', 'desktop', 'earth', 'camera',
  'fish', 'flame', 'footsteps', 'key', 'man', 'paw', 'skull',
  'construct', 'bus', 'subway', 'telescope',
]

// Properties that map 1:1 to SVG presentation attributes (safe to inline).
// `currentColor` values are preserved as-is (they resolve against the
// wrapper's `color` property at render time).
const PRESENTATION_PROPS = new Set([
  'fill', 'fill-rule', 'fill-opacity', 'clip-rule',
  'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap',
  'stroke-linejoin', 'stroke-miterlimit', 'opacity',
])

// Parse a CSS string into className → presentation attributes.
/** @param {string} css */
function parseStyleRules(css) {
  /** @type {Map<string, string>} */
  const map = new Map()
  for (const rule of css.matchAll(/\.([\w-]+)\s*\{([^}]*)\}/g)) {
    const [, cls, body] = rule
    const attrs = []
    for (const prop of body.matchAll(/([\w-]+)\s*:\s*([^;]+);/g)) {
      const [, name, value] = prop
      const v = value.trim()
      if (PRESENTATION_PROPS.has(name)) attrs.push(`${name}="${v}"`)
    }
    if (attrs.length) map.set(cls, attrs.join(' '))
  }
  return map
}

// Replace class="N" with the presentation attributes for N (from `map`).
/** @param {string} content @param {Map<string, string>} map */
function inlineClassAttrs(content, map) {
  return content.replace(/class="([\w-]+)"/g, (match, cls) => {
    const attrs = map.get(cls)
    return attrs ? attrs : match
  })
}

// Strip <defs> and <style> blocks from an SVG fragment (styles are inlined
// first via inlineClassAttrs, so they're no longer needed).
/** @param {string} content */
function stripDefsAndStyle(content) {
  return content
    .replace(/<defs[^>]*>[\s\S]*?<\/defs>/g, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
}

// ── IconSVG.svelte: symbol extraction + style inlining ──
const src = readFileSync(ICON_SVG, 'utf-8')

// Build a global class → presentation-attribute map from every <style> block
// (both <defs>-style blocks and inline <style> inside symbols).
const classProps = new Map() // className -> "fill=\"#...\" fill-rule=\"evenodd\""
for (const styleMatch of src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
  for (const [cls, attrs] of parseStyleRules(styleMatch[1])) {
    classProps.set(cls, attrs)
  }
}

function extractSymbol(id) {
  const m = src.match(new RegExp(`<symbol id="${id}"([^>]*)>[\\s\\S]*?<\\/symbol>`))
  if (!m) throw new Error(`No <symbol id="${id}"> found`)
  const viewBox = (m[1].match(/viewBox="([^"]+)"/) || [])[1] || '0 0 100 100'
  let content = m[0].replace(/^<symbol[^>]*>/, '').replace(/<\/symbol>$/, '')
  // Drop <use href="#X-defs"/> (styles parsed globally above) then inline
  // the class rules and strip defs/style.
  content = content.replace(/<use[^>]*\/>/g, '')
  content = inlineClassAttrs(content, classProps)
  content = stripDefsAndStyle(content)
  return { viewBox, content: content.trim() }
}

// ── SVG inner-content extraction (ionic + atlas) ──
function svgInner(fullSvg) {
  const viewBox = (fullSvg.match(/viewBox="([^"]+)"/) || [])[1] || '0 0 24 24'
  let inner = (fullSvg.match(/<svg[^>]*>([\s\S]*)<\/svg>/) || [])[1] || ''
  // Atlas icons carry their own <defs><style> with fill:none + stroke:
  // currentColor rules — inline them as attributes (a <style> inside a <g>
  // wrapper isn't applied by some rasterizers) and strip defs/style.
  // Ionicons files have no styles (their fill comes from the <g> wrapper).
  if (/<style/i.test(inner)) {
    const styleMap = new Map()
    for (const styleMatch of inner.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
      for (const [cls, attrs] of parseStyleRules(styleMatch[1])) {
        styleMap.set(cls, attrs)
      }
    }
    inner = inlineClassAttrs(inner, styleMap)
    inner = stripDefsAndStyle(inner)
  }
  return { viewBox, content: inner.trim() }
}

// ── Build the glyph map ──
/** @type {Record<string, {viewBox: string, tint: string, content: string}>} */
const glyphs = {}

for (const id of CUSTOM_ICONS) {
  const key = `custom-svg-${id}`
  glyphs[key] = {
    ...extractSymbol(id),
    tint: FULLY_TINTED_CUSTOM.has(key) ? 'fill' : 'keep',
  }
}

const missingIonic = []
for (const name of IONIC_NAMES) {
  const file = path.join(IONIC_DIR, `${name}.svg`)
  let svg
  try {
    svg = readFileSync(file, 'utf-8')
  } catch {
    missingIonic.push(name)
    continue
  }
  glyphs[`ionic-${name}`] = { ...svgInner(svg), tint: 'fill' }
}

for (const [name, svg] of Object.entries(atlasIconSvgs)) {
  glyphs[`at-${name}`] = { ...svgInner(svg), tint: 'fill' }
}

if (missingIonic.length) {
  console.warn('⚠️ Missing ionicons:', missingIonic.join(', '))
}

// ── Write outputs ──
writeFileSync(GLYPHS_JSON, JSON.stringify(glyphs, null, 2) + '\n')

const keys = Object.keys(glyphs).sort()
const setJs =
  '// GENERATED by scripts/gen-svg-glyphs.mjs — do not edit by hand.\n' +
  '// Icon classes rendered by the runtime SVG marker renderer (sync key set;\n' +
  '// the heavy glyph payload is fetched lazily from /marker-svg-glyphs.json).\n' +
  `export const SVG_RENDERED_ICONS = new Set([\n${keys
    .map((k) => `  "${k}",`)
    .join('\n')}\n])\n`
writeFileSync(SET_JS, setJs)

console.log(`✅ Wrote ${keys.length} glyphs →`)
console.log('   ', GLYPHS_JSON)
console.log('   ', SET_JS)
