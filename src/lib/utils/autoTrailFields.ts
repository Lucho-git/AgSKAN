// src/lib/utils/autoTrailFields.ts
// Pure geometry helpers for the experimental auto trail mode: deciding which
// field (if any) the vehicle is currently in, cheaply, on every position fix.
//
// Fields come from mapFieldsStore as { field_id, name, area, boundary } where
// boundary is a GeoJSON Polygon/MultiPolygon. We precompute bounding boxes so
// the per-point work is: bbox test first, ray-cast only on candidates, and
// pick the SMALLEST field containing the point (most specific wins when
// paddocks overlap).

export interface AutoTrailFieldEntry {
  fieldId: string
  name: string
  area: number
  bbox: [number, number, number, number] // [minLng, minLat, maxLng, maxLat]
  boundary: {
    type: "Polygon" | "MultiPolygon"
    coordinates: any[]
  }
}

/** Flatten any nested coordinate arrays into [lng, lat] rings. */
function ringsFor(type: string, coordinates: any[]): any[][] {
  if (type === "MultiPolygon") {
    const rings: any[][] = []
    for (const polygon of coordinates || []) {
      for (const ring of polygon || []) rings.push(ring)
    }
    return rings
  }
  return (coordinates || []) as any[][]
}

function bboxFor(coordinates: any[]): [number, number, number, number] {
  let minLng = Infinity
  let minLat = Infinity
  let maxLng = -Infinity
  let maxLat = -Infinity
  for (const [lng, lat] of coordinates as [number, number][]) {
    if (lng < minLng) minLng = lng
    if (lng > maxLng) maxLng = lng
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
  }
  return [minLng, minLat, maxLng, maxLat]
}

/** Ray-casting point-in-ring (GeoJSON winding agnostic). */
function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0]
    const yi = ring[i][1]
    const xj = ring[j][0]
    const yj = ring[j][1]
    const intersects =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi + Number.EPSILON) + xi
    if (intersects) inside = !inside
  }
  return inside
}

/** Point-in-polygon honouring holes (ring 0 outer, rings 1+ holes). */
function pointInPolygon(lng: number, lat: number, rings: number[][]): boolean {
  if (!rings.length) return false
  if (!pointInRing(lng, lat, rings[0])) return false
  for (let i = 1; i < rings.length; i++) {
    if (pointInRing(lng, lat, rings[i])) return false
  }
  return true
}

/**
 * Build the lookup index from the map's fields. Fields without a usable
 * boundary are skipped. Rebuild whenever mapFieldsStore changes identity.
 */
export function buildFieldIndex(fields: any[]): AutoTrailFieldEntry[] {
  const index: AutoTrailFieldEntry[] = []
  for (const field of fields || []) {
    const boundary = field?.boundary
    if (!boundary || !boundary.type || !field.field_id) continue
    const rings = ringsFor(boundary.type, boundary.coordinates || [])
    if (!rings.length) continue
    const bbox = bboxFor(rings.flat())
    if (!bbox.every(Number.isFinite)) continue
    index.push({
      fieldId: field.field_id,
      name: field.name || "Field",
      area: Number(field.area) || Number.MAX_SAFE_INTEGER,
      bbox,
      boundary,
    })
  }
  return index
}

/**
 * The smallest field containing the point, or null when outside all fields.
 */
export function fieldAtPoint(
  index: AutoTrailFieldEntry[],
  lng: number,
  lat: number,
): AutoTrailFieldEntry | null {
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
  let best: AutoTrailFieldEntry | null = null
  for (const entry of index) {
    const [minLng, minLat, maxLng, maxLat] = entry.bbox
    if (lng < minLng || lng > maxLng || lat < minLat || lat > maxLat) continue
    const polygons =
      entry.boundary.type === "MultiPolygon"
        ? entry.boundary.coordinates
        : [entry.boundary.coordinates]
    let inside = false
    for (const polygon of polygons) {
      if (pointInPolygon(lng, lat, polygon)) {
        inside = true
        break
      }
    }
    if (inside && (!best || entry.area < best.area)) best = entry
  }
  return best
}
