/**
 * Every machine the app can draw, described for the new map.
 *
 * `type` is the name saved in `vehicle_marker.type` and the key into
 * `$lib/vehicles`; both viewers share it. What is new here is the plain
 * label, the grouping for the picker and one distinction the old viewer never
 * made: road and yard vehicles show up live but don't usually paint a trail
 * (the live map checks before starting one in them; the demo never does).
 */
import vehicles from "$lib/vehicles"

export type VehicleType = keyof typeof vehicles

export type MachineGroup =
  | "Spraying"
  | "Seeding"
  | "Harvest"
  | "Hay & spreading"
  | "Tractors"
  | "Road & yard"

export type MachineSpec = {
  type: VehicleType
  label: string
  group: MachineGroup
  /** Working width in metres when the owner hasn't set one. */
  swath: number
  /** Real-world length of the drawing's longest side, in metres. */
  span: number
  /** Smallest the drawing gets on screen, in pixels. */
  minPx: number
  /** Marker size the old viewer uses for this type (saved alongside it). */
  size: number
  /** Works a paddock and paints coverage; road and yard vehicles usually don't. */
  paints: boolean
  /** What it is doing while it works. */
  verb: string
}

const spec = (
  type: VehicleType,
  label: string,
  group: MachineGroup,
  swath: number,
  span: number,
  minPx: number,
  size: number,
  verb = "Working",
): MachineSpec => ({
  type,
  label,
  group,
  swath,
  span,
  minPx,
  size,
  paints: group !== "Road & yard",
  verb,
})

export const MACHINE_CATALOGUE: MachineSpec[] = [
  spec(
    "SelfPropelledBoomspray",
    "Self-propelled sprayer",
    "Spraying",
    36,
    40,
    46,
    45,
    "Spraying",
  ),
  spec(
    "TowBehindBoomspray",
    "Tow-behind sprayer",
    "Spraying",
    36,
    40,
    56,
    80,
    "Spraying",
  ),
  spec(
    "ThreePointBoomspray",
    "Three-point sprayer",
    "Spraying",
    36,
    36,
    46,
    45,
    "Spraying",
  ),
  spec("Airplane", "Spray plane", "Spraying", 50, 18, 54, 85, "Spraying"),

  spec("TowBehindSeeder", "Seeder", "Seeding", 12, 23, 58, 80, "Seeding"),
  spec(
    "TowBetweenSeeder",
    "Seeder, tow-between",
    "Seeding",
    12,
    23,
    58,
    80,
    "Seeding",
  ),
  spec(
    "TowBehindSeederTracks",
    "Seeder on tracks",
    "Seeding",
    12,
    23,
    58,
    80,
    "Seeding",
  ),
  spec(
    "TowBetweenSeederTracks",
    "Seeder, tow-between on tracks",
    "Seeding",
    12,
    23,
    58,
    80,
    "Seeding",
  ),

  spec("HeaderDuals", "Header, duals", "Harvest", 12, 16, 46, 50, "Harvesting"),
  spec(
    "HeaderSingles",
    "Header, singles",
    "Harvest",
    12,
    16,
    46,
    50,
    "Harvesting",
  ),
  spec(
    "HeaderTracks",
    "Header, tracks",
    "Harvest",
    12,
    16,
    46,
    50,
    "Harvesting",
  ),
  spec("CombineHarvester", "Combine", "Harvest", 12, 16, 48, 60, "Harvesting"),
  spec(
    "SelfPropelledSwather",
    "Swather",
    "Harvest",
    12,
    14,
    46,
    50,
    "Swathing",
  ),

  spec("Spreader", "Spreader", "Hay & spreading", 12, 16, 54, 80, "Spreading"),
  spec("Baler", "Baler", "Hay & spreading", 12, 16, 54, 80, "Baling"),
  spec("Mower", "Mower", "Hay & spreading", 12, 12, 48, 60, "Mowing"),
  spec(
    "SelfPropelledMower",
    "Self-propelled mower",
    "Hay & spreading",
    12,
    12,
    48,
    60,
    "Mowing",
  ),

  spec(
    "FourWheelDriveTractor",
    "Four-wheel-drive tractor",
    "Tractors",
    4,
    9,
    40,
    35,
  ),
  spec("Tractor", "Tractor", "Tractors", 4, 7, 40, 45),
  spec("SimpleTractor", "Small tractor", "Tractors", 4, 6, 40, 45),

  spec("FarmUte", "Ute", "Road & yard", 4, 5.5, 34, 40, "On the move"),
  spec("WorkCar", "Work car", "Road & yard", 4, 5, 34, 45, "On the move"),
  spec(
    "FourWheelDriveChaserBin",
    "Chaser bin",
    "Road & yard",
    12,
    13,
    52,
    70,
    "On the move",
  ),
  spec(
    "FrontWheelChaserBin",
    "Chaser bin, front-wheel",
    "Road & yard",
    12,
    13,
    52,
    70,
    "On the move",
  ),
  spec("CabOverTruck", "Truck", "Road & yard", 4, 12, 42, 60, "On the move"),
  spec("Truck", "Truck, bonneted", "Road & yard", 4, 12, 42, 60, "On the move"),
  spec(
    "CabOverRoadTrain",
    "Road train",
    "Road & yard",
    4,
    30,
    60,
    100,
    "On the move",
  ),
  spec("Loader", "Loader", "Road & yard", 4, 8, 40, 50, "On the move"),
  spec(
    "WheelLoader",
    "Wheel loader",
    "Road & yard",
    4,
    8,
    44,
    60,
    "On the move",
  ),
  spec(
    "Telehandler",
    "Telehandler",
    "Road & yard",
    12,
    8,
    44,
    70,
    "On the move",
  ),
  spec("Excavator", "Excavator", "Road & yard", 4, 9, 46, 70, "On the move"),
  spec("Pointer", "Arrow", "Road & yard", 4, 6, 36, 45, "On the move"),
]

export const MACHINE_GROUPS: MachineGroup[] = [
  "Spraying",
  "Seeding",
  "Harvest",
  "Hay & spreading",
  "Tractors",
  "Road & yard",
]

const byType = new Map(MACHINE_CATALOGUE.map((m) => [m.type as string, m]))
/** Spellings that have turned up in saved data over the years. */
const ALIASES: Record<string, VehicleType> = {
  simpleTractor: "SimpleTractor",
}

const FALLBACK = byType.get("FarmUte")!

/** The catalogue entry for a saved machine type; a ute if it is unknown. */
export function machineFor(type: string | null | undefined): MachineSpec {
  if (!type) return FALLBACK
  return byType.get(type) ?? byType.get(ALIASES[type] ?? "") ?? FALLBACK
}

export const isKnownMachine = (type: string | null | undefined) =>
  !!type && (byType.has(type) || type in ALIASES)
