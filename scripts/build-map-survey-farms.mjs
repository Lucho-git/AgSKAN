// Turns a raw export of demo-farm data into the small static files the
// /mapsurvey page loads (static/mapsurvey-data/farm-*.json).
//
// The export query (kept out of the repo; it names the source maps) already
// leaves out every name, note and operator. This step shrinks the geometry and
// re-labels paddocks "Paddock 1…n" so nothing in the output identifies a farm
// beyond its position on the satellite image.
//
//   node scripts/build-map-survey-farms.mjs <raw-export.json>
import fs from "node:fs"
import path from "node:path"
import * as turf from "@turf/turf"

const [rawPath] = process.argv.slice(2)
if (!rawPath) {
  console.error(
    "usage: node scripts/build-map-survey-farms.mjs <raw-export.json>",
  )
  process.exit(1)
}

const OUT_DIR = "static/mapsurvey-data"
const round = (n) => Math.round(n * 1e5) / 1e5
const roundCoords = (c) =>
  typeof c[0] === "number" ? [round(c[0]), round(c[1])] : c.map(roundCoords)
const slim = (geometry, tolerance) => {
  const simplified = turf.simplify(
    { type: "Feature", properties: {}, geometry },
    { tolerance, highQuality: false, mutate: false },
  )
  return {
    type: simplified.geometry.type,
    coordinates: roundCoords(simplified.geometry.coordinates),
  }
}

const raw = JSON.parse(fs.readFileSync(rawPath, "utf8").replace(/^\uFEFF/, ""))
const farms = raw[0]?.farms ?? raw.farms ?? raw

fs.mkdirSync(OUT_DIR, { recursive: true })
for (const farm of farms) {
  const out = {
    center: farm.center,
    fields: (farm.fields ?? []).map((f, i) => ({
      name: `Paddock ${i + 1}`,
      color: f.color ?? "default",
      area: f.area,
      boundary: slim(f.boundary, 0.00003),
    })),
    trails: (farm.trails ?? [])
      .slice(0, 24)
      .map((t) => ({
        color: t.color,
        width: Number(t.width) || 12,
        geometry: slim(t.geometry, 0.00007),
      }))
      .filter((t) => JSON.stringify(t.geometry.coordinates).length > 40),
    markers: (farm.markers ?? [])
      .filter((m) => m.icon && Array.isArray(m.at))
      .map((m) => ({
        icon: m.icon,
        color: m.color || "default",
        at: m.at.map(round),
      })),
  }
  const file = path.join(OUT_DIR, `farm-${farm.label}.json`)
  fs.writeFileSync(file, JSON.stringify(out))
  console.log(
    file,
    `${(fs.statSync(file).size / 1024).toFixed(0)} KB`,
    `${out.fields.length} fields, ${out.trails.length} trails, ${out.markers.length} markers`,
  )
}
