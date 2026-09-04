#!/usr/bin/env node
// fetch-osm-power.mjs — pull OpenStreetMap power infrastructure (poles,
// towers, and optionally lines) for a bounding box via the Overpass API and
// write compact GeoJSON ready for tippecanoe.
//
// OSM data © OpenStreetMap contributors, ODbL.
//
// Usage:
//   node scripts/fetch-osm-power.mjs [--bbox "minLon,minLat,maxLon,maxLat"] [--out <dir>] [--lines]
//
//   --bbox   default is the sample NSW mid-north-coast box:
//            152.0,-32.4,153.2,-31.4  (~3.3k poles/towers)
//   --out    output folder (default: data/osm-power)
//   --lines  also fetch power=line + power=minor_line ways (bigger result)
//
// Outputs:
//   osm_power_poles.geojson   (Point per power=pole / power=tower)
//   osm_power_lines.geojson   (LineString per power=line / power=minor_line, --lines)
//
// Overpass public instances rate-limit aggressively; the script falls back
// through a list of mirrors. If every instance is busy/blocked (406/504),
// wait a bit and retry, or run the query in Overpass Turbo from your browser:
//   https://overpass-turbo.eu — paste the query this script prints with --debug
//
// ODbL note: OSM-derived data keeps the ODbL share-alike licence — keep an
// "© OpenStreetMap contributors, ODbL" attribution on the layer.

const OSM_TYPES = {
  pole: "power=pole", // low-voltage distribution poles
  tower: "power=tower", // high-voltage transmission towers
  line: "power=line", // transmission lines
  minor_line: "power=minor_line", // lower-voltage/distribution lines
}

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
]

function parseArgs(argv) {
  const args = {
    bbox: [152.0, -32.4, 153.2, -31.4],
    out: "data/osm-power",
    lines: false,
    debug: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--bbox") {
      args.bbox = argv[++i].split(",").map(Number)
      if (args.bbox.length !== 4) {
        console.error("--bbox must be minLon,minLat,maxLon,maxLat")
        process.exit(1)
      }
    } else if (a === "--out") args.out = argv[++i]
    else if (a === "--lines") args.lines = true
    else if (a === "--debug") args.debug = true
  }
  return args
}

async function overpass(query, args) {
  let lastErr = null
  for (const endpoint of ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "AgSKAN-powerlines-builder/1.0",
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(60000),
      })
      if (!res.ok) {
        lastErr = new Error(`${endpoint} → HTTP ${res.status}`)
        console.warn(`⚠  ${lastErr.message} — trying next mirror`)
        continue
      }
      const json = await res.json()
      if (json.remark && /rate.limit|too many|abort/i.test(json.remark)) {
        lastErr = new Error(`${endpoint} → ${json.remark}`)
        console.warn(`⚠  ${lastErr.message} — trying next mirror`)
        continue
      }
      return json
    } catch (e) {
      lastErr = e
      console.warn(`⚠  ${endpoint} failed (${e.message}) — trying next mirror`)
    }
  }
  throw lastErr || new Error("All Overpass endpoints failed")
}

function buildQuery(bbox, args) {
  const [minLon, minLat, maxLon, maxLat] = bbox
  const box = `(${minLat},${minLon},${maxLat},${maxLon})`
  const parts = []
  if (!args.lines) {
    parts.push(
      `(node[${JSON.stringify("power")}=${JSON.stringify("pole")}]${box};` +
        `node[${JSON.stringify("power")}=${JSON.stringify("tower")}]${box};)`,
    )
  } else {
    parts.push(
      `(node[${JSON.stringify("power")}=${JSON.stringify("pole")}]${box};` +
        `node[${JSON.stringify("power")}=${JSON.stringify("tower")}]${box};` +
        `way[${JSON.stringify("power")}=${JSON.stringify("line")}]${box};` +
        `way[${JSON.stringify("power")}=${JSON.stringify("minor_line")}]${box};)`,
    )
  }
  const out = args.lines ? "out geom;" : "out;"
  return `[out:json][timeout:240];${parts[0]}${out}`
}

function keepTags(tags) {
  if (!tags) return {}
  const out = {}
  for (const k of ["power", "name", "operator", "ref", "voltage", "cables", "material"]) {
    if (tags[k] !== undefined) out[k] = tags[k]
  }
  return out
}

function toGeoJson(json, args) {
  const points = { type: "FeatureCollection", features: [] }
  const lines = { type: "FeatureCollection", features: [] }
  for (const el of json.elements || []) {
    if (!el || !el.type) continue
    if (el.type === "node" && (el.tags?.power === "pole" || el.tags?.power === "tower")) {
      points.features.push({
        type: "Feature",
        properties: { ...keepTags(el.tags), osm_id: el.id },
        geometry: { type: "Point", coordinates: [el.lon, el.lat] },
      })
    } else if (el.type === "way" && (el.tags?.power === "line" || el.tags?.power === "minor_line")) {
      const coords = (el.geometry || [])
        .filter((n) => n && typeof n.lat === "number" && typeof n.lon === "number")
        .map((n) => [n.lon, n.lat])
      if (coords.length >= 2) {
        lines.features.push({
          type: "Feature",
          properties: { ...keepTags(el.tags), osm_id: el.id },
          geometry: { type: "LineString", coordinates: coords },
        })
      }
    }
  }
  return { points, lines }
}

const { writeFileSync, mkdirSync } = await import("node:fs")
const { join } = await import("node:path")

const args = parseArgs(process.argv.slice(2))
const query = buildQuery(args.bbox, args)
if (args.debug) console.log("QUERY:\n" + query + "\n")

console.log(
  `Fetching OSM power data for bbox [${args.bbox.join(", ")}]` +
    (args.lines ? " (poles + towers + lines)" : " (poles + towers)"),
)
const json = await overpass(query, args)
const { points, lines } = toGeoJson(json, args)

mkdirSync(args.out, { recursive: true })
const write = (name, fc) => {
  const p = join(args.out, name)
  writeFileSync(p, JSON.stringify(fc))
  console.log(`✅ ${name}: ${fc.features.length} features → ${p}`)
}
write("osm_power_poles.geojson", points)
if (args.lines) write("osm_power_lines.geojson", lines)

console.log(
  `\nNext (once tippecanoe is installed):\n` +
    `  tippecanoe -zg -Z6 -z16 -r1 -l poles -o ${join(args.out, "osm_power_poles.pmtiles")} ${join(args.out, "osm_power_poles.geojson")}` +
    (args.lines
      ? `\n  tippecanoe -zg -Z6 -z14 -r1 -l powerlines -o ${join(args.out, "osm_power_lines.pmtiles")} ${join(args.out, "osm_power_lines.geojson")}`
      : ""),
)
