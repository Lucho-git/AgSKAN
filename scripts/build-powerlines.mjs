#!/usr/bin/env node
// build-powerlines.mjs — clean GeoJSON power-line layers into one compact
// file the map loads directly (static/powerLines/powerlines.geojson).
//
// What it does:
//   • strips the top-level `crs` (data must already be lon/lat degrees —
//     reproject first if you get a projected export like MGA/GDA2020 zones)
//   • keeps only the attributes worth styling on
//   • normalises whitespace in string values (GA ships "Operational " etc.)
//   • rounds coordinates to 6dp (~0.1 m)
//
// Usage:
//   node scripts/build-powerlines.mjs <inputDir> [--out <dir>] [--points]
//                                          [--lines <file> ...]
//
//   <inputDir>  folder containing power-line geojson (default: data/powerlines).
//   --lines     one or more explicit line files to MERGE into powerlines.geojson
//               (paths relative to <inputDir>). Great for adding a Western
//               Power / Horizon WA export on top of the GA national lines:
//                 node scripts/build-powerlines.mjs data/powerlines \
//                   --lines Electricity_Transmission_Lines.geojson WA_Network_Lines.geojson
//               Without --lines it auto-detects the GA transmission file.
//   --out       output folder (default: <inputDir>/clean) → powerlines.geojson
//   --points    also clean substations + major power stations point files
//
// Next (no tippecanoe needed — the map uses a GeoJSON source):
//   Copy-Item <out>/powerlines.geojson static/powerLines/powerlines.geojson
//   npx -y mapshaper static/powerLines/powerlines.geojson -simplify dp 12% keep-shapes -o static/powerLines/powerlines.geojson

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from "node:fs"
import { join, resolve } from "node:path"

const LINE_PROPS = [
  "NAME",
  "CLASS", // Overhead | Underground | Overhead/Underground
  "OPERATIONALSTATUS", // Operational | Non Operational | Under Construction
  "CAPACITYKV", // number, e.g. 132
  "VOLTAGE", // some local exports name it VOLTAGE instead of CAPACITYKV
  "STATE",
]
const POINT_PROPS = [
  "NAME",
  "FEATURETYPE",
  "CLASS",
  "OPERATIONALSTATUS",
  "STATE",
  "VOLTAGEKV", // substations
  "GENERATIONMW", // power stations
  "PRIMARYFUELTYPE", // power stations
]

function parseArgs(argv) {
  const args = {
    inputDir: "data/powerlines",
    outDir: null,
    points: false,
    lines: [],
    positional: [],
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--out") args.outDir = argv[++i]
    else if (a === "--points") args.points = true
    else if (a === "--lines") args.lines.push(argv[++i])
    else if (!a.startsWith("-")) args.positional.push(a)
  }
  if (args.positional[0]) args.inputDir = args.positional[0]
  return args
}

const norm = (v) => (typeof v === "string" ? v.trim() : v)
const round6 = (v) => Math.round(v * 1e6) / 1e6

function cleanFeature(feature, keepProps) {
  const properties = {}
  for (const key of keepProps) {
    if (feature.properties && feature.properties[key] !== undefined && feature.properties[key] !== null) {
      properties[key] = norm(feature.properties[key])
    }
  }
  const coords = feature.geometry.coordinates
  const geometry =
    feature.geometry.type === "LineString"
      ? { type: "LineString", coordinates: coords.map(([x, y]) => [round6(x), round6(y)]) }
      : feature.geometry.type === "Point"
        ? { type: "Point", coordinates: [round6(coords[0]), round6(coords[1])] }
        : feature.geometry
  return { type: "Feature", properties, geometry }
}

function cleanFeatures(inputPaths, outputPath, keepProps, label) {
  const present = inputPaths.filter((p) => existsSync(p))
  if (present.length === 0) {
    console.warn(`⚠  none of the ${label} files exist: ${inputPaths.join(", ")}`)
    return null
  }

  let totalFeatures = 0
  let totalRaw = 0
  const allFeatures = []
  for (const p of present) {
    const raw = JSON.parse(readFileSync(p, "utf8"))
    const feats = (raw.features || []).map((f) => cleanFeature(f, keepProps))
    totalRaw += statSync(p).size
    totalFeatures += feats.length
    allFeatures.push(...feats)
    console.log(`   + ${p} → ${feats.length} features`)
  }

  writeFileSync(outputPath, JSON.stringify({ type: "FeatureCollection", features: allFeatures }))
  const outKB = Math.round(statSync(outputPath).size / 1024)
  const rawKB = Math.round(totalRaw / 1024)
  console.log(
    `✅ ${label}: ${totalFeatures} features (merged)  ${rawKB} KB → ${outKB} KB ` +
      `(${Math.round((1 - outKB / rawKB) * 100)}% smaller)  → ${outputPath}`,
  )
  return { features: totalFeatures, outKB }
}

const args = parseArgs(process.argv.slice(2))
const inputDir = resolve(args.inputDir)
const outDir = resolve(args.outDir || join(inputDir, "clean"))
mkdirSync(outDir, { recursive: true })

console.log(`Input : ${inputDir}`)
console.log(`Output: ${outDir}`)

if (!existsSync(inputDir)) {
  console.error(
    `\nInput folder not found: ${inputDir}\n` +
      `\nDownload the GA "National Electricity Infrastructure" JSON zip ` +
      `(eCat 150022):\n  https://d28rz98at9flks.cloudfront.net/150022/150022_01_1.zip\n` +
      `unzip it and point this script at the folder containing the .geojson files.`,
  )
  process.exit(1)
}

const files = readdirSync(inputDir)
const findFile = (prefix) => files.find((f) => f.startsWith(prefix) && f.endsWith(".geojson"))

// Lines: explicit --lines files (paths resolved relative to inputDir), or the
// auto-detected GA transmission file.
let lineFiles
if (args.lines.length > 0) {
  lineFiles = args.lines.map((f) => (resolve(f) === f ? f : join(inputDir, f)))
} else {
  const auto =
    findFile("Electricity_Transmission_Lines") || findFile("Power_Lines") || "Electricity_Transmission_Lines.geojson"
  lineFiles = [join(inputDir, auto)]
}
cleanFeatures(lineFiles, join(outDir, "powerlines.geojson"), LINE_PROPS, "Power lines")

if (args.points) {
  const subName = findFile("Electricity_Transmission_Substations") || "Electricity_Transmission_Substations.geojson"
  cleanFeatures([join(inputDir, subName)], join(outDir, "substations.geojson"), POINT_PROPS, "Substations")
  const psName = findFile("Major_Power_Stations") || "Major_Power_Stations.geojson"
  cleanFeatures([join(inputDir, psName)], join(outDir, "power_stations.geojson"), POINT_PROPS, "Power stations")
}

console.log(
  `\nNext: copy the cleaned file into the app and (optionally) simplify it:\n` +
    `  Copy-Item ${join(outDir, "powerlines.geojson")} static/powerLines/powerlines.geojson\n` +
    `  npx -y mapshaper static/powerLines/powerlines.geojson -simplify dp 12% keep-shapes -o static/powerLines/powerlines.geojson`,
)
