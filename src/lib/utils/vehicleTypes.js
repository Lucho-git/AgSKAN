// Shared machine catalogue for setup screens.
//
// Mirrors the vehicle list used by operator onboarding
// ((admin)/account/onboarding/operator/operator_vehicle) — keep in sync
// when machines are added there.

/** Standard machine body colours (display order). */
export const VEHICLE_COLORS = [
  "Red",
  "Blue",
  "Green",
  "Yellow",
  "Orange",
  "Purple",
  "SkyBlue",
  "LightGreen",
  "HotPink",
]

/** Swatch values for the machine colours (icons take the colour NAME). */
export const VEHICLE_COLOR_HEX = {
  Red: "#ff0000",
  Blue: "#0000ff",
  Green: "#008000",
  Yellow: "#ffff00",
  Orange: "#ffa500",
  Purple: "#800080",
  SkyBlue: "#87ceeb",
  LightGreen: "#90ee90",
  HotPink: "#ff69b4",
}

/** Machine types with their default marker size + swath. */
export const VEHICLE_TYPES = [
  { type: "Tractor", bodyColor: "green", size: 45, swath: 4 },
  { type: "FourWheelDriveTractor", bodyColor: "green", size: 35, swath: 4 },
  { type: "CombineHarvester", bodyColor: "yellow", size: 60, swath: 12 },
  { type: "TowBehindSeeder", bodyColor: "red", size: 80, swath: 12 },
  { type: "TowBetweenSeeder", bodyColor: "red", size: 80, swath: 12 },
  { type: "TowBehindSeederTracks", bodyColor: "red", size: 80, swath: 12 },
  { type: "TowBehindBoomspray", bodyColor: "red", size: 80, swath: 36 },
  { type: "SelfPropelledBoomspray", bodyColor: "red", size: 45, swath: 36 },
  { type: "ThreePointBoomspray", bodyColor: "red", size: 45, swath: 36 },
  { type: "HeaderDuals", bodyColor: "red", size: 50, swath: 12 },
  { type: "HeaderSingles", bodyColor: "red", size: 50, swath: 12 },
  { type: "HeaderTracks", bodyColor: "red", size: 50, swath: 12 },
  { type: "SelfPropelledSwather", bodyColor: "red", size: 50, swath: 12 },
  { type: "Baler", bodyColor: "red", size: 80, swath: 12 },
  { type: "FarmUte", bodyColor: "red", size: 40, swath: 4 },
  { type: "Truck", bodyColor: "red", size: 60, swath: 4 },
  { type: "CabOverTruck", bodyColor: "red", size: 60, swath: 4 },
  { type: "WorkCar", bodyColor: "red", size: 45, swath: 4 },
  { type: "FrontWheelChaserBin", bodyColor: "red", size: 70, swath: 12 },
  { type: "FourWheelDriveChaserBin", bodyColor: "red", size: 70, swath: 12 },
  { type: "Spreader", bodyColor: "red", size: 80, swath: 12 },
  { type: "Mower", bodyColor: "red", size: 60, swath: 12 },
  { type: "SelfPropelledMower", bodyColor: "red", size: 60, swath: 12 },
  { type: "Telehandler", bodyColor: "red", size: 70, swath: 12 },
  { type: "Loader", bodyColor: "red", size: 50, swath: 4 },
  { type: "WheelLoader", bodyColor: "yellow", size: 60, swath: 4 },
  { type: "Excavator", bodyColor: "orange", size: 70, swath: 4 },
  { type: "Airplane", bodyColor: "blue", size: 85, swath: 50 },
]

/** Find a catalogue entry by machine type. */
export function findVehicleType(type) {
  return VEHICLE_TYPES.find((v) => v.type === type) || null
}
