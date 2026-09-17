// vehicleCoords.js — parse a vehicle's raw coordinates into
// { latitude, longitude }. Mirrors VehicleTracker.parseCoordinates: either a
// { latitude, longitude } object or a "(lng,lat)" string (parens optional).
// Returns null when unparseable.

/**
 * @param {unknown} coords
 * @returns {{ latitude: number, longitude: number } | null}
 */
export function parseVehicleCoords(coords) {
  if (!coords) return null

  if (typeof coords === "object" && coords.latitude && coords.longitude) {
    return { latitude: coords.latitude, longitude: coords.longitude }
  }

  if (typeof coords === "string") {
    const cleaned = coords.replace(/[()]/g, "")
    const [longitude, latitude] = cleaned.split(",").map(parseFloat)
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
    return { latitude, longitude }
  }

  return null
}
