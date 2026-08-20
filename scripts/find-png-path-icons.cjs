// List icons that still use the PNG tint path (not SVG-rendered).
const fs = require('fs')
const paths = require('../static/icon-paths.json')
const src = fs.readFileSync(
  './src/lib/components/map/markers/markerSvgGlyphs.js',
  'utf8',
)
// Pull the quoted strings inside the SVG_RENDERED_ICONS set literal.
const block = src.slice(src.indexOf('new Set(['), src.indexOf('])'))
const set = new Set([...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]))
const keys = Object.keys(paths)
const notSvg = keys.filter((k) => !set.has(k))
console.log('total PNG keys:', keys.length)
console.log('NOT svg-rendered:', JSON.stringify(notSvg))
