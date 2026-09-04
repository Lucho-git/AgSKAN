#!/usr/bin/env node
// tile-powerlines.mjs — slice a GeoJSON power/network file into a PMTiles
// archive (MVT vector tiles) using pure-JS tools already in this repo
// (geojson-vt + vt-pbf + a small PMTiles writer ported from the reference
// Python implementation in protomaps/PMTiles). No tippecanoe needed.
//
// The app serves these archives locally through the existing service-worker
// route (/ftw-client-pmtiles/{z}/{x}/{y}.mvt?archive=<path>).
//
// Usage:
//   node scripts/tile-powerlines.mjs --input <file.geojson> --layer <name> \
//        --out <out.pmtiles> [--maxzoom N] [--props a,b,c] [--name "..."] \
//        [--attribution "..."] [--maxpoints N]
//
// --maxpoints caps the number of POINT features written into any single tile
// (evenly sub-sampled when a tile holds more than N points). Huge point sets
// (e.g. 800k poles) otherwise put every point into the handful of low-zoom
// tiles that cover them, and those tiles blow past Mapbox's 500 KB per-tile
// upload limit. Line/polygon layers are never capped.
//
// Examples:
//   node scripts/tile-powerlines.mjs \
//       --input data/powerLines/wa-raw/Distribution_Pole_WP_029_WA_GDA2020_Public_Secure.geojson \
//       --layer poles --out static/powerLines/wa-poles.pmtiles \
//       --maxzoom 15 --props pick_id,pole_type --name "WA Distribution Poles" \
//       --maxpoints 12000
//   node scripts/tile-powerlines.mjs \
//       --input data/powerLines/wa-raw/Distribution_Overhead_Powerlines_WP_031_WA_GDA2020_Public_Secure.geojson \
//       --layer powerlines --out static/powerLines/wa-lines.pmtiles \
//       --maxzoom 14 --props pick_id,kv --name "WA Distribution Overhead Lines"

import {
  readFileSync,
  writeFileSync,
  openSync,
  closeSync,
  readSync as fsReadSync,
  mkdtempSync,
  rmSync,
  appendFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { gzipSync, gunzipSync } from "node:zlib"
import geojsonvt from "geojson-vt"
import vtpbf from "vt-pbf"

// ── tiny varint helpers ─────────────────────────────────────────────
function writeVarint(bytes, i) {
  const arr = []
  while (true) {
    let towrite = i & 0x7f
    i = Math.floor(i / 128)
    if (i) arr.push(towrite | 0x80)
    else {
      arr.push(towrite)
      break
    }
  }
  for (const b of arr) bytes.push(b)
}

// ── PMTiles tile-id (space-filling curve id, mirrors reference) ─────
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

function zxyToTileId(z, x, y) {
  let acc = Math.floor((Math.pow(2, z * 2) - 1) / 3)
  let a = z - 1
  let xx = x
  let yy = y
  while (a >= 0) {
    const s = 1 << a
    const rx = s & xx
    const ry = s & yy
    acc += ((3 * rx) ^ ry) << a
    ;[xx, yy] = rotate(s, xx, yy, rx ? 1 : 0, ry ? 1 : 0)
    a -= 1
  }
  return acc
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
  let acc = Math.floor((Math.pow(2, z * 2) - 1) / 3)
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

// ── PMTiles directory serialization (matches reference) ────────────
class Entry {
  constructor(tileId, offset, length, runLength) {
    this.tileId = tileId
    this.offset = offset
    this.length = length
    this.runLength = runLength
  }
}

function serializeDirectory(entries) {
  const bytes = []
  writeVarint(bytes, entries.length)
  let lastId = 0
  for (const e of entries) {
    writeVarint(bytes, e.tileId - lastId)
    lastId = e.tileId
  }
  for (const e of entries) writeVarint(bytes, e.runLength)
  for (const e of entries) writeVarint(bytes, e.length)
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]
    if (i > 0 && e.offset === entries[i - 1].offset + entries[i - 1].length) {
      writeVarint(bytes, 0)
    } else {
      writeVarint(bytes, e.offset + 1)
    }
  }
  return gzipSync(Buffer.from(bytes))
}

function buildRootsLeaves(entries, leafSize) {
  const rootEntries = []
  const leavesParts = []
  let numLeaves = 0
  for (let i = 0; i < entries.length; i += leafSize) {
    numLeaves += 1
    const serialized = serializeDirectory(entries.slice(i, i + leafSize))
    const offset = leavesParts.reduce((a, b) => a + b.length, 0)
    rootEntries.push(new Entry(entries[i].tileId, offset, serialized.length, 0))
    leavesParts.push(serialized)
  }
  return [serializeDirectory(rootEntries), Buffer.concat(leavesParts), numLeaves]
}

function optimizeDirectories(entries, targetRootLen) {
  const test = serializeDirectory(entries)
  if (test.length < targetRootLen) return [test, Buffer.alloc(0), 0]
  let leafSize = 4096
  while (true) {
    const [rootBytes, leavesBytes, numLeaves] = buildRootsLeaves(entries, leafSize)
    if (rootBytes.length < targetRootLen) return [rootBytes, leavesBytes, numLeaves]
    leafSize *= 2
  }
}

// ── PMTiles writer (reference port) ────────────────────────────────
function serializeHeader(h) {
  const b = Buffer.alloc(127)
  b.write("PMTiles", 0, "latin1")
  b[7] = 0x03
  const u64 = (pos, v) => b.writeBigUInt64LE(BigInt(v), pos)
  const i32 = (pos, v) => b.writeInt32LE(v, pos)
  u64(8, h.rootOffset)
  u64(16, h.rootLength)
  u64(24, h.metadataOffset)
  u64(32, h.metadataLength)
  u64(40, h.leafDirectoryOffset || 0)
  u64(48, h.leafDirectoryLength || 0)
  u64(56, h.tileDataOffset)
  u64(64, h.tileDataLength)
  u64(72, h.addressedTilesCount || 0)
  u64(80, h.tileEntriesCount || 0)
  u64(88, h.tileContentsCount || 0)
  b[96] = h.clustered ? 1 : 0
  b[97] = 2 // internal compression: gzip
  b[98] = 2 // tile compression: gzip
  b[99] = 1 // tile type: MVT
  b[100] = h.minZoom
  b[101] = h.maxZoom
  i32(102, h.minLonE7)
  i32(106, h.minLatE7)
  i32(110, h.maxLonE7)
  i32(114, h.maxLatE7)
  b[118] = h.centerZoom
  i32(119, h.centerLonE7)
  i32(123, h.centerLatE7)
  return b
}

class PmtilesWriter {
  constructor() {
    this.dir = mkdtempSync(join(tmpdir(), "pmtiles-tiles-"))
    this.tileFile = join(this.dir, "tiles.bin")
    this.fd = openSync(this.tileFile, "w")
    this.entries = []
    this.hashToOffset = new Map()
    this.offset = 0
    this.addressedTiles = 0
    this.clustered = true
  }

  writeTile(tileId, data) {
    if (this.entries.length > 0 && tileId < this.entries[this.entries.length - 1].tileId) {
      this.clustered = false
    }
    // FNV-1a-ish fingerprint keyed by content (compare real bytes on hit).
    let hash = 0x811c9dc5
    for (let i = 0; i < data.length && i < 64; i++) {
      hash ^= data[i]
      hash = Math.imul(hash, 0x01000193) >>> 0
    }
    hash = hash * 0x9e3779b1 + data.length // include length in key
    hash = hash >>> 0

    const found = this.hashToOffset.get(hash)
    if (found !== undefined) {
      const last = this.entries[this.entries.length - 1]
      // verify actual content match by re-reading stored bytes
      const stored = this.readAt(found, data.length)
      if (stored && stored.equals(data)) {
        if (tileId === last.tileId + last.runLength && last.offset === found) {
          last.runLength += 1
        } else {
          this.entries.push(new Entry(tileId, found, data.length, 1))
        }
        this.addressedTiles += 1
        return
      }
      // hash collision → fall through to store normally
    }
    const buf = Buffer.from(data)
    appendFileSync(this.tileFile, buf, { fd: this.fd })
    this.entries.push(new Entry(tileId, this.offset, buf.length, 1))
    this.hashToOffset.set(hash, this.offset)
    this.offset += buf.length
    this.addressedTiles += 1
  }

  readAt(offset, length) {
    try {
      const fd = openSync(this.tileFile, "r")
      const b = Buffer.alloc(length)
      let n = 0
      while (n < length) {
        const r = fsReadSync(fd, b, n, length - n, offset + n)
        if (r <= 0) break
        n += r
      }
      closeSync(fd)
      return n === length ? b : null
    } catch {
      return null
    }
  }

  finalize(header, metadata) {
    header.addressedTilesCount = this.addressedTiles
    header.tileEntriesCount = this.entries.length
    header.tileContentsCount = this.hashToOffset.size

    this.entries.sort((a, b) => a.tileId - b.tileId)

    const [z0] = tileIdToZxy(this.entries[0].tileId)
    const lastZxy = tileIdToZxy(this.entries[this.entries.length - 1].tileId)
    header.minZoom = z0
    header.maxZoom = lastZxy[0]

    const [rootBytes, leavesBytes] = optimizeDirectories(this.entries, 16384 - 127)
    const compressedMetadata = gzipSync(Buffer.from(JSON.stringify(metadata), "utf8"))

    header.clustered = this.clustered
    header.rootOffset = 127
    header.rootLength = rootBytes.length
    header.metadataOffset = header.rootOffset + header.rootLength
    header.metadataLength = compressedMetadata.length
    header.leafDirectoryOffset = header.metadataOffset + header.metadataLength
    header.leafDirectoryLength = leavesBytes.length
    header.tileDataOffset = header.leafDirectoryOffset + header.leafDirectoryLength
    header.tileDataLength = this.offset

    const headerBytes = serializeHeader(header)
    const tiles = readFileSync(this.tileFile)
    const out = Buffer.concat([
      headerBytes,
      rootBytes,
      compressedMetadata,
      leavesBytes,
      tiles,
    ])
    closeSync(this.fd)
    rmSync(this.dir, { recursive: true, force: true })
    return out
  }
}

// ── CLI ─────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const a = { input: null, layer: null, out: null, maxZoom: 14, minZoom: 0, props: null, name: "", attribution: "", maxPoints: 0 }
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]
    const v = () => argv[++i]
    if (k === "--input") a.input = v()
    else if (k === "--layer") a.layer = v()
    else if (k === "--out") a.out = v()
    else if (k === "--maxzoom") a.maxZoom = parseInt(v(), 10)
    else if (k === "--minzoom") a.minZoom = parseInt(v(), 10)
    else if (k === "--props") a.props = v().split(",").map((s) => s.trim()).filter(Boolean)
    else if (k === "--name") a.name = v()
    else if (k === "--attribution") a.attribution = v()
    else if (k === "--maxpoints") a.maxPoints = parseInt(v(), 10)
  }
  return a
}

const args = parseArgs(process.argv.slice(2))
if (!args.input || !args.layer || !args.out) {
  console.error("Usage: tile-powerlines.mjs --input <geojson> --layer <name> --out <out.pmtiles> [--maxzoom N] [--props a,b]")
  process.exit(1)
}

console.log(`Loading ${args.input} …`)
let gj = JSON.parse(readFileSync(args.input, "utf8"))

let features = gj.features
const keepProps = args.props
if (keepProps) {
  features = features.map((f) => {
    const p = {}
    for (const key of keepProps) {
      if (f.properties && f.properties[key] !== undefined) p[key] = f.properties[key]
    }
    return { type: "Feature", properties: p, geometry: f.geometry }
  })
}
// Drop the parsed source now that we hold mapped features (only geometry
// objects are shared, so this frees the big properties trees).
gj = null
console.log(`  features: ${features.length}`)

// geojson-vt requires a FeatureCollection (not a bare array).
const indexData = { type: "FeatureCollection", features }

// Rough bounds for metadata (lon/lat degrees assumed).
let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity
{
  let counted = 0
  for (const f of features) {
    walkCoords(f.geometry, (x, y) => {
      if (x < minLon) minLon = x
      if (x > maxLon) maxLon = x
      if (y < minLat) minLat = y
      if (y > maxLat) maxLat = y
    })
    if (++counted > 40000) break
  }
}

function walkCoords(geom, fn) {
  if (!geom) return
  const c = geom.coordinates
  if (!c) return
  if (geom.type === "Point") fn(c[0], c[1])
  else if (geom.type === "MultiPoint" || geom.type === "LineString") for (const p of c) fn(p[0], p[1])
  else if (geom.type === "MultiLineString" || geom.type === "Polygon") for (const part of c) for (const p of part) fn(p[0], p[1])
  else if (geom.type === "MultiPolygon") for (const poly of c) for (const part of poly) for (const p of part) fn(p[0], p[1])
}

const tileIndex = geojsonvt(indexData, {
  maxZoom: args.maxZoom,
  indexMaxZoom: Math.min(args.maxZoom, 5),
  tolerance: 3,
  extent: 4096,
  buffer: 64,
  lineMetrics: false,
  promoteId: null,
  generateId: false,
})

const writer = new PmtilesWriter()
let emitted = 0
let empty = 0

function tileHasData(tile) {
  return tile && Array.isArray(tile.features) && tile.features.length > 0
}

// Evenly sub-sample a tile's POINT features down to args.maxPoints so no
// single tile ever exceeds Mapbox's ~500 KB upload limit. Line/polygon
// layers are untouched. NOTE: tiles from geojson-vt are in its internal
// format — feature.type is numeric (1 = Point, 2 = LineString, 3 = Polygon)
// and feature.geometry is a plain coordinate array, NOT a GeoJSON object.
function capTilePoints(tile) {
  const cap = args.maxPoints
  if (!cap || cap <= 0) return tile
  const feats = tile && Array.isArray(tile.features) ? tile.features : []
  if (feats.length <= cap) return tile
  if (!feats[0] || feats[0].type !== 1) return tile // only cap pure-point tiles
  const stride = feats.length / cap
  const out = new Array(cap)
  for (let k = 0; k < cap; k++) {
    out[k] = feats[Math.min(feats.length - 1, Math.floor(k * stride))]
  }
  tile.features = out
  tile.numPoints = cap
  return tile
}

function emit(tile, z, x, y) {
  capTilePoints(tile)
  const pbf = vtpbf.fromGeojsonVt({ [args.layer]: tile }, { version: 2, extent: 4096 })
  const gz = gzipSync(pbf)
  writer.writeTile(zxyToTileId(z, x, y), gz)
  emitted++
}

const queue = []
// Seed the pyramid walk from ONE zoom level (never two, or the same tile gets
// enqueued both by the scan and by its parent's expansion → duplicate tiles).
const seedZoom = Math.min(Math.max(args.minZoom, 4), args.maxZoom)
const seedSize = 1 << seedZoom
for (let x = 0; x < seedSize; x++) {
  for (let y = 0; y < seedSize; y++) {
    const tile = tileIndex.getTile(seedZoom, x, y)
    if (tileHasData(tile)) queue.push({ z: seedZoom, x, y })
  }
}

while (queue.length > 0) {
  const { z, x, y } = queue.pop()
  const tile = tileIndex.getTile(z, x, y)
  if (!tileHasData(tile)) {
    empty++
    continue
  }
  emit(tile, z, x, y)
  if (z < args.maxZoom) {
    queue.push({ z: z + 1, x: x * 2, y: y * 2 })
    queue.push({ z: z + 1, x: x * 2 + 1, y: y * 2 })
    queue.push({ z: z + 1, x: x * 2, y: y * 2 + 1 })
    queue.push({ z: z + 1, x: x * 2 + 1, y: y * 2 + 1 })
  }
  if (emitted % 20000 === 0) console.log(`  ${emitted} tiles …`)
}
console.log(`  emitted ${emitted} tiles (${empty} empty) → finalizing`)

const header = {
  minLonE7: Math.round(minLon * 1e7),
  minLatE7: Math.round(minLat * 1e7),
  maxLonE7: Math.round(maxLon * 1e7),
  maxLatE7: Math.round(maxLat * 1e7),
  centerZoom: Math.round((args.minZoom + args.maxZoom) / 2),
  centerLonE7: Math.round(((minLon + maxLon) / 2) * 1e7),
  centerLatE7: Math.round(((minLat + maxLat) / 2) * 1e7),
}
const metadata = {
  name: args.name || args.layer,
  format: "pbf",
  compression: "gzip",
  bounds: [minLon, minLat, maxLon, maxLat].map((v) => Number(v.toFixed(6))),
}
if (args.attribution) metadata.attribution = args.attribution

const out = writer.finalize(header, metadata)
writeFileSync(args.out, out)
console.log(`✅ Wrote ${args.out} (${(out.length / 1048576).toFixed(2)} MB, ${emitted} tiles)`)
