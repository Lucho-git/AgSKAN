/** Shared options for the onboarding prototype. */

export type MachineId =
  | "sprayer"
  | "seeder"
  | "header"
  | "chaser"
  | "truck"
  | "ute"

export type Machine = {
  id: MachineId
  label: string
  /** Component name in $lib/vehicles. */
  name:
    | "SelfPropelledBoomspray"
    | "TowBehindSeeder"
    | "HeaderDuals"
    | "FourWheelDriveChaserBin"
    | "CabOverTruck"
    | "FarmUte"
  /** Size on the stage map, in map units. */
  size: number
  /** Works a paddock and paints coverage; road vehicles don't. */
  field: boolean
  /** Coverage trail width on the stage map. */
  trail: number
}

export const MACHINES: Machine[] = [
  {
    id: "sprayer",
    label: "Sprayer",
    name: "SelfPropelledBoomspray",
    size: 36,
    field: true,
    trail: 26,
  },
  {
    id: "seeder",
    label: "Seeder",
    name: "TowBehindSeeder",
    size: 48,
    field: true,
    trail: 22,
  },
  {
    id: "header",
    label: "Header",
    name: "HeaderDuals",
    size: 36,
    field: true,
    trail: 24,
  },
  {
    id: "chaser",
    label: "Chaser bin",
    name: "FourWheelDriveChaserBin",
    size: 42,
    field: false,
    trail: 0,
  },
  {
    id: "truck",
    label: "Truck",
    name: "CabOverTruck",
    size: 32,
    field: false,
    trail: 0,
  },
  {
    id: "ute",
    label: "Ute",
    name: "FarmUte",
    size: 25,
    field: false,
    trail: 0,
  },
]

export const machineById = (id: MachineId) =>
  MACHINES.find((m) => m.id === id) ?? MACHINES[0]

export const COLOURS = [
  { name: "Blue", value: "#2F62D6" },
  { name: "Green", value: "#1F8A4C" },
  { name: "Rust", value: "#D95D39" },
  { name: "Purple", value: "#7B4BC4" },
  { name: "Teal", value: "#0E8C99" },
  { name: "Gold", value: "#D99A00" },
]

export type Season = "spraying" | "seeding" | "harvest" | "looking"

export const SEASONS: {
  id: Season
  label: string
  note: string
  machine: MachineId
}[] = [
  {
    id: "spraying",
    label: "Spraying",
    note: "Boom out, covering ground",
    machine: "sprayer",
  },
  {
    id: "seeding",
    label: "Seeding",
    note: "Following the sprayer in",
    machine: "seeder",
  },
  {
    id: "harvest",
    label: "Harvest",
    note: "Headers, chasers, trucks",
    machine: "header",
  },
  {
    id: "looking",
    label: "Just having a look",
    note: "Show me around",
    machine: "ute",
  },
]

export type DroppedPin = {
  x: number
  y: number
  kind: "rock" | "stump" | "gate" | "fieldBin"
}

export const PIN_KINDS: { kind: DroppedPin["kind"]; label: string }[] = [
  { kind: "rock", label: "Rock" },
  { kind: "stump", label: "Stump" },
  { kind: "gate", label: "Gate" },
  { kind: "fieldBin", label: "Field bin" },
]
