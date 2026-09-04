#!/usr/bin/env node
// pmtiles2mbtiles.mjs — convert a PMTiles archive (as produced by
// tile-powerlines.mjs) into an .mbtiles file for uploading to Mapbox
// (Studio drag-and-drop or the Tilesets API/CLI). Both formats store the same
// gzip MVT tiles; mbtiles is just SQLite + TMS row ordering.
//
// Usage:
//   node scripts/pmtiles2mbtiles.mjs --input <file.pmtiles> --out <file.mbtiles> \
//        --layer <name> --name "..." [--attribution "..."]

import { readFileSync, writeFileSync, unlinkSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { DatabaseSync } from "node:sqlite"

// ── pmtiles primitives (mirror tile-powerlines.mjs / reference) ─────
function readVarintAt(buf, state) {
  let shift = 0
  let result = 0
  while (true) {
    const b = buf[state.pos++]
    result += (b & 0x7f) << shift
    shift += 7
    if (!(b & 0x80)) break
  }
  return result
}

function rotate(n, x, y, rx, ry) {
  if (ry === 0) {
    if (rx === 1) {
      x = n - 1 - x
      y = n - 1 - y
    }
    const t = x
    x = y
    y = t
  }
  return [x, y]
}

function bitLength(x) {
  let n = 0
  while (x > 0) {
    n++
    x = Math.floor(x / 2)
  }
  return n
}

function tileIdToZxy(tileId) {
  const z = Math.floor((bitLength(3 * tileId + 1) - 1) / 2)
  const acc = Math.floor((Math.pow(2, z * 2) - 1) / 3)
  let pos = tileId - acc
  const n = 1 << z
  let x = 0
  let y = 0
  let s = 1
  while (s < n) {
    const rx = Math.floor(pos / 2) & s
    const ry = (pos ^ rx) & s
    ;[x, y] = rotate(s, x, y, rx ? 1 : 0, ry ? 1 : 0)
    x += rx
    y += ry
    pos = Math.floor(pos / 2)
    s <<= 1
  }
  return [z, x, y]
}

function parseDir(gzBytes) {
  const buf = gunzipSync(gzBytes)
  const state = { pos: 0 }
  const n = readVarintAt(buf, state)
  const ids = []
  let last = 0
  for (let i = 0; i < n; i++) {
    last += readVarintAt(buf, state)
    ids.push(last)
  }
  const runs = []
  for (let i = 0; i < n; i++) runs.push(readVarintAt(buf, state))
  const lens = []
  for (let i = 0; i < n; i++) lens.push(readVarintAt(buf, state))
  const offs = []
  for (let i = 0; i < n; i++) {
    const tmp = readVarintAt(buf, state)
    if (i > 0 && tmp === 0) offs.push(offs[i - 1] + lens[i - 1])
    else offs.push(tmp - 1)
  }
  return ids.map((tileId, i) => ({ tileId, offset: offs[i], length: lens[i], runLength: runs[i] }))
}

// ── CLI ─────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const a = {
    input: null,
    out: null,
    layer: null,
    name: "",
    attribution: "",
    fields: "", // e.g. "kv:String,pick_id:String"
  }
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]
    const v = () => argv[++i]
    if (k === "--input") a.input = v()
    else if (k === "--out") a.out = v()
    else if (k === "--layer") a.layer = v()
    else if (k === "--name") a.name = v()
    else if (k === "--attribution") a.attribution = v()
    else if (k === "--fields") a.fields = v()
  }
  return a
}

const args = parseArgs(process.argv.slice(2))
if (!args.input || !args.out) {
  console.error("Usage: pmtiles2mbtiles.mjs --input <file.pmtiles> --out <file.mbtiles> [--layer name] [--name ...] [--attribution ...]")
  process.exit(1)
}

const buf = readFileSync(args.input)
if (buf.toString("latin1", 0, 7) !== "PMTiles") throw new Error("Not a PMTiles file")

const u64 = (pos) => Number(buf.readBigUInt64LE(pos))
const rootOffset = u64(8)
const rootLength = u64(16)
const metaOffset = u64(24)
const metaLength = u64(32)
const leafOffset = u64(40)
const leafLength = u64(48)
const tileDataOffset = u64(56)
const minZoom = buf[100]
const maxZoom = buf[101]
const minLonE7 = buf.readInt32LE(102)
const minLatE7 = buf.readInt32LE(106)
const maxLonE7 = buf.readInt32LE(110)
const maxLatE7 = buf.readInt32LE(114)

// Gather every (tileId, bytes)
const tiles = []
const rootEntries = parseDir(buf.subarray(rootOffset, rootOffset + rootLength))
for (const e of rootEntries) {
  if (e.runLength === 0) {
    // Leaf-directory pointer (offset is relative to the leaf region)
    const leafBytes = buf.subarray(leafOffset + e.offset, leafOffset + e.offset + e.length)
    for (const te of parseDir(leafBytes)) {
      if (te.runLength > 0) pushTileRun(tiles, te, buf, tileDataOffset)
    }
  } else {
    pushTileRun(tiles, e, buf, tileDataOffset)
  }
}

function pushTileRun(tiles, e, buf, tileDataOffset) {
  const data = buf.subarray(tileDataOffset + e.offset, tileDataOffset + e.offset + e.length)
  const copy = Buffer.from(data)
  for (let k = 0; k < e.runLength; k++) tiles.push({ tileId: e.tileId + k, data: copy })
}

console.log(`Parsed ${tiles.length} tiles (z ${minZoom}..${maxZoom}) from ${args.input}`)

const layerId = args.layer || "powerlines"
// Build the vector_layers description Mapbox requires in the metadata `json` row.
const fields = {}
if (args.fields) {
  for (const pair of args.fields.split(",")) {
    const [name, type] = pair.split(":").map((s) => s.trim())
    if (name) fields[name] = type || "String"
  }
}
const vectorLayers = [
  {
    id: layerId,
    description: args.name || layerId,
    minzoom: minZoom,
    maxzoom: maxZoom,
    fields,
  },
]

// ── write mbtiles ───────────────────────────────────────────────────
if (require_fs_exists(args.out)) unlinkSync(args.out)
const db = new DatabaseSync(args.out)
db.exec(
  "CREATE TABLE metadata (name text, value text);" +
    "CREATE TABLE tiles (zoom_level integer, tile_column integer, tile_row integer, tile_data blob);" +
    "CREATE UNIQUE INDEX tile_index ON tiles (zoom_level, tile_column, tile_row);",
)
const meta = [
  ["name", args.name || layerId],
  ["format", "pbf"],
  ["compression", "gzip"],
  ["minzoom", String(minZoom)],
  ["maxzoom", String(maxZoom)],
  ["bounds", `${(minLonE7 / 1e7).toFixed(6)},${(minLatE7 / 1e7).toFixed(6)},${(maxLonE7 / 1e7).toFixed(6)},${(maxLatE7 / 1e7).toFixed(6)}`],
  ["type", "overlay"],
  ["json", JSON.stringify({ vector_layers: vectorLayers })],
]
if (args.attribution) meta.push(["attribution", args.attribution])
const prepMeta = db.prepare("INSERT INTO metadata (name, value) VALUES (?, ?)")
for (const [k, v] of meta) prepMeta.run(k, v)

const insert = db.prepare(
  "INSERT OR REPLACE INTO tiles (zoom_level, tile_column, tile_row, tile_data) VALUES (?, ?, ?, ?)",
)
db.exec("BEGIN")
let count = 0
for (const t of tiles) {
  const [z, x, y] = tileIdToZxy(t.tileId)
  const row = (1 << z) - 1 - y // TMS
  insert.run(z, x, row, t.data)
  if (++count % 50000 === 0) console.log(`  ${count} tiles …`)
}
db.exec("COMMIT")
db.exec("VACUUM")
db.close()
console.log(`✅ Wrote ${args.out} (${tiles.length} tiles)`)

function require_fs_exists(p) {
  try {
    readFileSync(p)
    return true
  } catch {
    return false
  }
}
