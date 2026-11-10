// src/lib/utils/boundaryGeometry.ts
// Bounds and label centre for a field boundary (Polygon or MultiPolygon).

/* eslint-disable @typescript-eslint/no-explicit-any -- GeoJSON geometry from the DB */

export type LngLat = [number, number]

/** Every outer-ring coordinate; MultiPolygon rings are flattened together. */
export function getAllOuterRings(boundary: any): LngLat[] {
  if (boundary.type === "Polygon") return boundary.coordinates[0]
  if (boundary.type === "MultiPolygon") {
    return boundary.coordinates.flatMap((poly: number[][][]) => poly[0])
  }
  return []
}

/** [[minLng, minLat], [maxLng, maxLat]] of the outer rings. */
export function getBoundsFromBoundary(boundary: any): [LngLat, LngLat] {
  let minLng = Infinity
  let minLat = Infinity
  let maxLng = -Infinity
  let maxLat = -Infinity
  for (const [lng, lat] of getAllOuterRings(boundary)) {
    minLng = Math.min(minLng, lng)
    minLat = Math.min(minLat, lat)
    maxLng = Math.max(maxLng, lng)
    maxLat = Math.max(maxLat, lat)
  }
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ]
}

/** Mean of the outer-ring vertices — good enough for label placement. */
export function getFieldCentroid(boundary: any): LngLat | null {
  const coords = getAllOuterRings(boundary)
  if (coords.length === 0) return null
  let lng = 0
  let lat = 0
  for (const [cLng, cLat] of coords) {
    lng += cLng
    lat += cLat
  }
  return [lng / coords.length, lat / coords.length]
}
