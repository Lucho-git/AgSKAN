import { describe, it, expect } from "vitest"
import { parseVehicleCoords, liveVehicleCoords } from "./vehicleCoords"

describe("parseVehicleCoords", () => {
  it("parses a { latitude, longitude } object", () => {
    expect(parseVehicleCoords({ latitude: -30.6, longitude: 116.9 })).toEqual({
      latitude: -30.6,
      longitude: 116.9,
    })
  })

  it("parses PostGIS point strings, with or without parens", () => {
    expect(parseVehicleCoords("(116.9,-30.6)")).toEqual({
      latitude: -30.6,
      longitude: 116.9,
    })
    expect(parseVehicleCoords("116.9,-30.6")).toEqual({
      latitude: -30.6,
      longitude: 116.9,
    })
  })

  it("parses [lng, lat] arrays", () => {
    expect(parseVehicleCoords([116.9, -30.6])).toEqual({
      latitude: -30.6,
      longitude: 116.9,
    })
  })

  it("accepts coordinates on the equator / prime meridian", () => {
    expect(parseVehicleCoords({ latitude: 0, longitude: 0 })).toEqual({
      latitude: 0,
      longitude: 0,
    })
  })

  it("returns null for missing or unparseable values", () => {
    expect(parseVehicleCoords(null)).toBeNull()
    expect(parseVehicleCoords("")).toBeNull()
    expect(parseVehicleCoords("nonsense")).toBeNull()
    expect(parseVehicleCoords({})).toBeNull()
    expect(parseVehicleCoords([1])).toBeNull()
  })
})

describe("liveVehicleCoords", () => {
  const own = { vehicle_id: "me", coordinates: { latitude: -30.1, longitude: 116.1 } }
  const others = [
    { vehicle_id: "other", coordinates: "(116.2,-30.2)" },
    { vehicle_id: "parked", coordinates: null },
  ]

  it("finds the current user's own vehicle", () => {
    expect(liveVehicleCoords("me", own, others)).toEqual({
      lng: 116.1,
      lat: -30.1,
    })
  })

  it("finds another vehicle and converts lng/lat to { lng, lat }", () => {
    expect(liveVehicleCoords("other", own, others)).toEqual({
      lng: 116.2,
      lat: -30.2,
    })
  })

  it("returns null when the vehicle is unknown or has no fix", () => {
    expect(liveVehicleCoords("missing", own, others)).toBeNull()
    expect(liveVehicleCoords("parked", own, others)).toBeNull()
    expect(liveVehicleCoords(null, own, others)).toBeNull()
    expect(liveVehicleCoords("me", null, null)).toBeNull()
  })
})
