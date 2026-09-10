// src/lib/utils/powerNearFields.js
// Compute the "within my paddocks" subset of the power layers.
//
// mapbox-gl 1.13 has no way to spatially clip a vector-tileset layer to the
// operator's field polygons, so when "show outside fields" is OFF we instead
// decode the small set of Mapbox vector tiles that overlap the mapped fields
// (buffered by POWER_BUFFER_METERS), keep the line/pole features that touch
// any ONE of those buffered paddocks, and hand back plain GeoJSON
// FeatureCollections the map can style like the full layers.
//
// IMPORTANT: each feature is tested against every field's OWN buffer polygon
// — never against a turf.union() of all buffers, because unioning many
// complex paddock buffers silently degrades/fails and drops features that are
// clearly inside the fields.
//
// WA features are decoded from the hosted tilesets (luchodore.pit699 lines /
// luchodore.rzpget poles). National lines (a local GeoJSON) are filtered with
// turf directly, so operators outside WA still get their field-only lines.

import * as turf from "@turf/turf"

export const POWER_BUFFER_METERS = 1000
// Poles sit ON the lines. Once a line is rendered (touches the paddock area),
// every pole that lies on it is shown too — even if the pole is far from the
// paddocks — so poles aren't "filtered out due to distance".
export const POWER_POLE_LINE_TOLERANCE_M = 40
export const POWER_DECODE_ZOOM = 13

export const WA_LINES_TILESET = "luchodore.pit699"
export const WA_POLES_TILESET = "luchodore.rzpget"
export const WA_LINES_LAYER = "powerlines"
export const WA_POLES_LAYER = "poles"

// Geographic extent of the WA (Western Power) tilesets, [west, south, east,
// north]. Tiles entirely outside this box contain no data, so they are never
// fetched — fields in other states therefore trigger ZERO WA tile requests
// (their near lines still come from the national GeoJSON below). Currently
// covers all of WA state; tighten to the SWIS-only extent if a Horizon Power
// (north WA) region pack is added later.
export const WA_REGION_BOUNDS = [112.9, -35.5, 129.0, -13.5]

function lonLatToTile(lon, lat, z) {
  const n = 2 ** z
  const x = Math.floor(((lon + 180) / 360) * n)
  const latRad = (lat * Math.PI) / 180
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  )
  return { x, y }
}

function bboxToTiles(bbox, z) {
  // bbox = [west, south, east, north]
  const { x: x0, y: y0 } = lonLatToTile(bbox[0], bbox[3], z)
  const { x: x1, y: y1 } = lonLatToTile(bbox[2], bbox[1], z)
  const tiles = []
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      tiles.push({ x, y, z })
    }
  }
  return tiles
}

// Geographic bounds of one web-mercator tile → [west, south, east, north].
function tileBounds(x, y, z) {
  const n = 2 ** z
  const west = (x / n) * 360 - 180
  const east = ((x + 1) / n) * 360 - 180
  const yLat = (yy) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * yy) / n))) * 180) / Math.PI
  return [west, yLat(y + 1), east, yLat(y)]
}

function boundsIntersect(a, b) {
  return a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]
}

// Does any part of this tile fall inside the region's bounding box?
function tileIntersectsRegion(tile, regionBounds) {
  return boundsIntersect(tileBounds(tile.x, tile.y, tile.z), regionBounds)
}

// Pick a decode zoom so the tile count stays sane for huge multi-farm setups.
function chooseZoom(bufferedFields) {
  let z = POWER_DECODE_ZOOM
  for (let tries = 0; tries < 4; tries++) {
    let count = 0
    for (const bf of bufferedFields) {
      count += bboxToTiles(bf.bbox, z).length
    }
    if (count <= 500 || z <= 10) return z
    z -= 1
  }
  return z
}

// Build one buffered polygon per field (never unioned), each with a precomputed
// bbox for cheap rejection. Returns [] if nothing usable.
function buildBufferedFields(fields) {
  const out = []
  const fieldFeatures = (fields || [])
    .filter((f) => f && f.boundary && f.boundary.coordinates)
    .map((f) => ({ type: "Feature", properties: {}, geometry: f.boundary }))
  for (const f of fieldFeatures) {
    let b = null
    try {
      b = turf.buffer(f, POWER_BUFFER_METERS, { units: "meters" })
    } catch {
      b = null
    }
    const geom = b && b.geometry ? b : f
    try {
      out.push({ feat: geom, bbox: turf.bbox(geom) })
    } catch {
      /* skip unusable field */
    }
  }
  return out
}

// Does the feature touch ANY buffered paddock? (per-field test, no union)
function intersectsAnyBuffered(feature, bufferedFields) {
  if (!feature || !feature.geometry) return false
  let fbb = null
  try {
    fbb = turf.bbox(feature)
  } catch {
    return false
  }
  for (const bf of bufferedFields) {
    const bb = bf.bbox
    if (fbb[0] > bb[2] || fbb[2] < bb[0] || fbb[1] > bb[3] || fbb[3] < bb[1]) continue
    try {
      if (turf.booleanIntersects(feature, bf.feat)) return true
    } catch {
      /* try next field */
    }
  }
  return false
}

// Flatten rendered line features into bare coordinate arrays (LineString +
// MultiLineString). These are the lines actually shown on the map.
function lineCoordinateSets(features) {
  const sets = []
  for (const f of features || []) {
    const g = f && f.geometry
    if (!g) continue
    if (g.type === "LineString") sets.push(g.coordinates)
    else if (g.type === "MultiLineString") for (const c of g.coordinates) sets.push(c)
  }
  return sets
}

// Is a pole within `tolMeters` of ANY of the rendered line segments? Uses a
// local planar approximation (fine at these short distances).
function poleNearAnyLine(poleCoords, lineSets, tolMeters) {
  const lon = poleCoords[0]
  const lat = poleCoords[1]
  const cosLat = Math.cos((lat * Math.PI) / 180)
  const mPerLon = 111320 * cosLat
  const mPerLat = 111320
  const tolLon = tolMeters / mPerLon
  const tolLat = tolMeters / mPerLat
  const px = lon * mPerLon
  const py = lat * mPerLat

  for (const coords of lineSets) {
    if (!coords || coords.length < 2) continue
    // quick bbox reject
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const c of coords) {
      if (c[0] < minX) minX = c[0]
      if (c[0] > maxX) maxX = c[0]
      if (c[1] < minY) minY = c[1]
      if (c[1] > maxY) maxY = c[1]
    }
    if (lon < minX - tolLon || lon > maxX + tolLon || lat < minY - tolLat || lat > maxY + tolLat) {
      continue
    }
    for (let i = 0; i < coords.length - 1; i++) {
      const a = coords[i]
      const b = coords[i + 1]
      const ax = a[0] * mPerLon
      const ay = a[1] * mPerLat
      const bx = b[0] * mPerLon
      const by = b[1] * mPerLat
      const dx = bx - ax
      const dy = by - ay
      const len2 = dx * dx + dy * dy
      let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0
      t = Math.max(0, Math.min(1, t))
      const cx = ax + t * dx
      const cy = ay + t * dy
      const d = Math.hypot(px - cx, py - cy)
      if (d <= tolMeters) return true
    }
  }
  return false
}

async function decodeTiles(tiles, tilesetId, sourceLayer, accessToken) {
  const out = []
  if (!tiles.length) return out
  const vtMod = await import("@mapbox/vector-tile")
  const VectorTile = vtMod.VectorTile || vtMod.default?.VectorTile
  const pbfMod = await import("pbf")
  const Pbf = pbfMod.default || pbfMod
  const concurrency = 6
  let cursor = 0

  async function worker() {
    while (cursor < tiles.length) {
      const { x, y, z } = tiles[cursor++]
      const ac = new AbortController()
      const timer = setTimeout(() => ac.abort(), 15000)
      try {
        const res = await fetch(
          `https://api.mapbox.com/v4/${tilesetId}/${z}/${x}/${y}.vector.pbf?access_token=${accessToken}`,
          { signal: ac.signal },
        )
        if (!res.ok) continue
        const buf = new Uint8Array(await res.arrayBuffer())
        const vt = new VectorTile(new Pbf(buf))
        const layer = vt.layers[sourceLayer]
        if (!layer) continue
        for (let i = 0; i < layer.length; i++) {
          const gj = layer.feature(i).toGeoJSON(x, y, z)
          if (gj && gj.geometry && gj.geometry.coordinates?.length) out.push(gj)
        }
      } catch {
        /* skip a bad or timed-out tile */
      } finally {
        clearTimeout(timer)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tiles.length) }, worker))
  return out
}

// Filter the NATIONAL GeoJSON down to the lines that touch the buffered fields.
// `fields` = raw records with `.boundary`.
export async function filterNationalNear(nationalData, fields) {
  const fc = { type: "FeatureCollection", features: [] }
  if (!nationalData || !nationalData.features?.length) return fc
  const bufferedFields = buildBufferedFields(fields)
  if (!bufferedFields.length) return fc
  for (const f of nationalData.features || []) {
    if (!f || !f.geometry) continue
    if (intersectsAnyBuffered(f, bufferedFields)) fc.features.push(f)
  }
  return fc
}

/**
 * Compute field-only power features.
 * @param {object} opts
 * @param {Array<object>} opts.fields field records with a GeoJSON `boundary` geometry
 * @param {string} opts.accessToken Mapbox pk token
 * @param {object|null} [opts.nationalData] national GeoJSON FeatureCollection (for non-WA lines)
 * @returns {Promise<{lines: object, poles: object, decodeZoom: number, tiles: number}>}
 */
export async function computePowerNearData({ fields, accessToken, nationalData }) {
  const empty = {
    lines: { type: "FeatureCollection", features: [] },
    poles: { type: "FeatureCollection", features: [] },
    decodeZoom: POWER_DECODE_ZOOM,
    tiles: 0,
  }
  const bufferedFields = buildBufferedFields(fields)
  if (!bufferedFields.length) return empty

  // Pick the tiles to fetch from each buffered paddock's bbox (deduped), but
  // keep only the tiles that overlap the WA tilesets' geographic extent — a
  // tile outside it (fields in other states) holds no data, so fetching it
  // would be pure waste. National lines below are NOT extent-limited, so
  // out-of-region paddocks still get their transmission lines.
  const z = chooseZoom(bufferedFields)
  const seen = new Set()
  const tiles = []
  for (const bf of bufferedFields) {
    for (const t of bboxToTiles(bf.bbox, z)) {
      const key = `${t.x},${t.y}`
      if (seen.has(key)) continue
      seen.add(key)
      if (tileIntersectsRegion(t, WA_REGION_BOUNDS)) tiles.push(t)
    }
  }

  // Only decode WA tiles when there are in-extent tiles to decode; the
  // national features are always filtered directly with turf.
  const [waLines, waPoles, nationalLines] = await Promise.all([
    tiles.length
      ? decodeTiles(tiles, WA_LINES_TILESET, WA_LINES_LAYER, accessToken)
      : Promise.resolve([]),
    tiles.length
      ? decodeTiles(tiles, WA_POLES_TILESET, WA_POLES_LAYER, accessToken)
      : Promise.resolve([]),
    nationalData ? Promise.resolve(nationalData.features || []) : Promise.resolve([]),
  ])

  const nearLines = []
  const nearPoles = []
  const poleSeen = new Set()

  for (const f of waLines) {
    if (intersectsAnyBuffered(f, bufferedFields)) nearLines.push(f)
  }
  for (const f of nationalLines) {
    if (!f || !f.geometry) continue
    if (intersectsAnyBuffered(f, bufferedFields)) nearLines.push(f)
  }

  // Lines that will actually be rendered — used to keep every pole on them.
  const renderedLineSets = lineCoordinateSets(nearLines)

  for (const f of waPoles) {
    const type = f.properties?.pole_type
    if (type === "METAL_LIGHTING") continue // street lights, not network poles
    const pid = f.properties?.pick_id
    if (pid != null) {
      if (poleSeen.has(pid)) continue
      poleSeen.add(pid)
    }
    if (intersectsAnyBuffered(f, bufferedFields)) {
      nearPoles.push(f)
    } else if (poleNearAnyLine(f.geometry.coordinates, renderedLineSets, POWER_POLE_LINE_TOLERANCE_M)) {
      // On a rendered power line → show it regardless of distance to fields.
      nearPoles.push(f)
    }
  }

  return {
    lines: { type: "FeatureCollection", features: nearLines },
    poles: { type: "FeatureCollection", features: nearPoles },
    decodeZoom: z,
    tiles: tiles.length,
  }
}

// ── Greyscale-outside-fields mask ────────────────────────────────────
// A single huge Polygon whose outer ring covers a very large box around ALL
// the fields and whose holes are the fields themselves (outer rings, reversed).
// Rendered as a dim grey fill it "greys out" everything outside the paddocks
// — the same trick used by FieldTrailOverlay / thumbnailRenderer. Returns the
// polygon geometry, or null when there are no usable fields.
export function buildPowerMask(fields) {
  const fieldFeatures = (fields || []).filter((f) => f && f.boundary && f.boundary.coordinates)
  if (!fieldFeatures.length) return null

  // All outer rings across all fields (Polygon + MultiPolygon) for the holes.
  const holeRings = []
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity
  for (const f of fieldFeatures) {
    const geom = f.boundary
    const polys = geom.type === "MultiPolygon" ? geom.coordinates : [geom.coordinates]
    for (const poly of polys) {
      const outer = poly[0] // outer ring [lng,lat,...]
      if (!Array.isArray(outer) || outer.length < 4) continue
      holeRings.push([...outer].reverse())
      for (const [lng, lat] of outer) {
        if (lng < minLng) minLng = lng
        if (lng > maxLng) maxLng = lng
        if (lat < minLat) minLat = lat
        if (lat > maxLat) maxLat = lat
      }
    }
  }
  if (!holeRings.length) return null

  const lngSpan = Math.max(maxLng - minLng, 0.001)
  const latSpan = Math.max(maxLat - minLat, 0.001)
  const pad = 15
  const clampLat = (v) => Math.max(-85, Math.min(85, v))
  const clampLng = (v) => Math.max(-180, Math.min(180, v))
  const outerRing = [
    [clampLng(minLng - lngSpan * pad), clampLat(minLat - latSpan * pad)],
    [clampLng(maxLng + lngSpan * pad), clampLat(minLat - latSpan * pad)],
    [clampLng(maxLng + lngSpan * pad), clampLat(maxLat + latSpan * pad)],
    [clampLng(minLng - lngSpan * pad), clampLat(maxLat + latSpan * pad)],
    [clampLng(minLng - lngSpan * pad), clampLat(minLat - latSpan * pad)],
  ]

  return { type: "Polygon", coordinates: [outerRing, ...holeRings] }
}
