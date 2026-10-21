// vehicleCoords.js — parse a vehicle's raw coordinates into
// { latitude, longitude }. Mirrors VehicleTracker.parseCoordinates: a
// { latitude, longitude } object, a "(lng,lat)" string (parens optional), or a
// [lng, lat] array. Returns null when unparseable.

/**
 * @param {unknown} coords
 * @returns {{ latitude: number, longitude: number } | null}
 */
export function parseVehicleCoords(coords) {
  if (!coords) return null

  if (typeof coords === "string") {
    const cleaned = coords.replace(/[()]/g, "")
    const [longitude, latitude] = cleaned.split(",").map(parseFloat)
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
    return { latitude, longitude }
  }

  if (Array.isArray(coords) && coords.length >= 2) {
    const longitude = Number(coords[0])
    const latitude = Number(coords[1])
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
    return { latitude, longitude }
  }

  if (typeof coords === "object") {
    const { latitude, longitude } = /** @type {any} */ (coords)
    if (!Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude)))
      return null
    return { latitude: Number(latitude), longitude: Number(longitude) }
  }

  return null
}

/**
 * Live map position of a vehicle, looked up across the vehicle stores.
 * Returns null when the vehicle isn't on this map right now.
 *
 * @param {string|null|undefined} refId vehicle_id to look up
 * @param {any} ownVehicle `$userVehicleStore` value
 * @param {any[]|null|undefined} otherVehicles `$otherVehiclesStore` value
 * @returns {{ lng: number, lat: number } | null}
 */
export function liveVehicleCoords(refId, ownVehicle, otherVehicles) {
  if (refId === null || refId === undefined) return null

  const source =
    ownVehicle?.vehicle_id && String(ownVehicle.vehicle_id) === String(refId)
      ? ownVehicle
      : (otherVehicles || []).find(
          (v) => String(v.vehicle_id) === String(refId),
        )

  const parsed = parseVehicleCoords(source?.coordinates)
  return parsed ? { lng: parsed.longitude, lat: parsed.latitude } : null
}
