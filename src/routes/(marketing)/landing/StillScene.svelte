<script lang="ts">
  /**
   * Still (non-animated) job vignettes in the farm-map style. The seeding and
   * harvest stills are the originals that FieldScene.svelte now animates;
   * they're kept for places a static image is wanted.
   */
  import MapVehicle from "./MapVehicle.svelte"
  import MapPin from "./MapPin.svelte"

  export let kind: "seeding" | "harvest" | "rocks" | "contract"
</script>

<svg viewBox="0 0 160 100" preserveAspectRatio="xMidYMid slice">
  {#if kind === "seeding"}
    <rect width="160" height="100" fill="#C79A5B" />
    <rect width="160" height="100" fill="#2F62D6" opacity="0.22" />
    <path
      d="M-5,22 H165 M-5,50 H96"
      stroke="#1F8A4C"
      stroke-width="24"
      opacity="0.6"
      fill="none"
    />
    <MapVehicle
      name="TowBehindSeeder"
      x={112}
      y={50}
      size={50}
      color="#1F8A4C"
    />
  {:else if kind === "harvest"}
    <rect width="160" height="100" fill="#E0B94F" />
    <path
      d="M24,105 V-5 M50,105 V-5 M76,105 V44"
      stroke="#D95D39"
      stroke-width="24"
      opacity="0.55"
      fill="none"
    />
    <MapVehicle
      name="HeaderDuals"
      x={76}
      y={36}
      size={36}
      heading={0}
      color="#D95D39"
    />
    <MapVehicle
      name="FourWheelDriveChaserBin"
      x={48}
      y={56}
      size={42}
      heading={0}
      color="#2F62D6"
    />
    <MapVehicle
      name="CabOverTruck"
      x={128}
      y={66}
      size={34}
      heading={-90}
      color="#F4F1E6"
    />
  {:else if kind === "rocks"}
    <rect width="160" height="100" fill="#6E9B5C" />
    <path
      d="M26,76 L56,34 L94,62 L130,28"
      stroke="#fff"
      stroke-width="1.8"
      stroke-dasharray="4 4"
      fill="none"
      opacity="0.85"
    />
    {#each [[56, 34], [94, 62], [130, 28]] as [x, y]}
      <MapPin kind="rock" {x} {y} r={10} />
    {/each}
    <MapVehicle
      name="FarmUte"
      x={24}
      y={78}
      size={30}
      heading={36}
      color="#0E8C99"
    />
  {:else}
    <rect width="160" height="100" fill="#D8B04A" />
    <path
      d="M-5,16 H165 M-5,44 H165 M-5,72 H104"
      stroke="#2F62D6"
      stroke-width="26"
      opacity="0.5"
      fill="none"
    />
    <MapVehicle
      name="SelfPropelledBoomspray"
      x={112}
      y={72}
      size={40}
      color="#2F62D6"
    />
    <circle cx="134" cy="26" r="13" fill="#fbf9f2" />
    <path
      d="M128,26.5 L132.5,31 L141,21.5"
      stroke="#15261C"
      stroke-width="3"
      fill="none"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  {/if}
</svg>

<style>
  svg {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
