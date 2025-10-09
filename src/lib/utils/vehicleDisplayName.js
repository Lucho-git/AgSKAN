// src/lib/utils/vehicleDisplayName.js
import { get } from 'svelte/store'
import { vehiclePresetStore } from '$lib/stores/vehiclePresetStore'

/**
 * Get display name for a vehicle, matching by configuration
 * @param {Object} vehicle - Vehicle data
 * @param {Object} vehicle.vehicle_marker - Vehicle marker data
 * @param {string} vehicle.vehicle_marker.type - Vehicle type
 * @param {string} vehicle.vehicle_marker.bodyColor - Body color
 * @param {number} vehicle.vehicle_marker.swath - Swath width
 * @returns {string} Display name
 */
export function getVehicleDisplayName(vehicle) {
  const presets = get(vehiclePresetStore)
  const marker = vehicle?.vehicle_marker
  
  if (marker) {
    // Try to find a matching preset by configuration
    const matchingPreset = presets.find(
      p => p.type === marker.type && 
           p.body_color === marker.bodyColor && 
           p.swath === marker.swath
    )
    
    if (matchingPreset) {
      return matchingPreset.name
    }
  }

  // Fall back to vehicle type short name
  const vehicleType = marker?.type || 'Vehicle'
  
  const shortNames = {
    FourWheelDriveTractor: "FWD Tractor",
    TowBetweenSeeder: "TB Seeder",
    TowBehindSeeder: "TB Seeder",
    TowBehindSeederTracks: "TB Seeder Tracks",
    TowBehindBoomspray: "TB Boomspray",
    SelfPropelledBoomspray: "SP Boomspray",
    ThreePointBoomspray: "3P Boomspray",
    FarmUte: "Farm Ute",
    FrontWheelChaserBin: "FW Chaser",
    FourWheelDriveChaserBin: "FWD Chaser",
    HeaderDuals: "Header Duals",
    HeaderSingles: "Header Singles",
    HeaderTracks: "Header Tracks",
    SelfPropelledSwather: "SP Swather",
    Spreader: "Spreader",
    Truck: "Truck",
    CabOverTruck: "Cab Over Truck",
    CabOverRoadTrain: "Road Train",
    Baler: "Baler",
    Mower: "Mower",
    SelfPropelledMower: "SP Mower",
    Telehandler: "Telehandler",
    Loader: "Loader",
    SimpleTractor: "Simple Tractor",
    Pointer: "Pointer",
    CombineHarvester: "Combine",
    Excavator: "Excavator",
    Tractor: "Tractor",
    WheelLoader: "Wheel Loader",
    WorkCar: "Work Car",
    Airplane: "Airplane",
    simpleTractor: "Simple Tractor",
  }

  return shortNames[vehicleType] || vehicleType
}

/**
 * Get short vehicle type name (without preset consideration)
 * @param {string} vehicleType - Vehicle type
 * @returns {string} Short name
 */
export function getVehicleTypeName(vehicleType) {
  const shortNames = {
    FourWheelDriveTractor: "FWDTractor",
    TowBetweenSeeder: "TBSeeder",
    TowBehindSeeder: "TBSeeder",
    TowBehindSeederTracks: "TBSeederT",
    TowBehindBoomspray: "TBBoom",
    SelfPropelledBoomspray: "SPBoom",
    ThreePointBoomspray: "3PBoom",
    FarmUte: "FarmUte",
    FrontWheelChaserBin: "FWChaser",
    FourWheelDriveChaserBin: "FWDChaser",
    HeaderDuals: "HeaderD",
    HeaderSingles: "HeaderS",
    HeaderTracks: "HeaderT",
    SelfPropelledSwather: "SPSwather",
    Spreader: "Spreader",
    Truck: "Truck",
    CabOverTruck: "COTruck",
    CabOverRoadTrain: "CORoad",
    Baler: "Baler",
    Mower: "Mower",
    SelfPropelledMower: "SPMower",
    Telehandler: "Telehand",
    Loader: "Loader",
    SimpleTractor: "STractor",
    Pointer: "Pointer",
    CombineHarvester: "Combine",
    Excavator: "Excavator",
    Tractor: "Tractor",
    WheelLoader: "WLoader",
    WorkCar: "WorkCar",
    Airplane: "Airplane",
  }
  
  return shortNames[vehicleType] || vehicleType
}