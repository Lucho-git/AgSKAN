<!-- VehicleControls.svelte -->
<script>
  import { createEventDispatcher } from "svelte"
  import {
    userVehicleStore,
    userVehicleTrailing,
    otherVehiclesStore,
  } from "../stores/vehicleStore"
  import {
    Gauge,
    Users,
    Crosshair,
    Target,
    ChevronDown,
    X,
    Navigation,
    Navigation2,
  } from "lucide-svelte"
  import SVGComponents from "$lib/vehicles/index.js"

  export let map
  export let currentSpeed = 0
  export let trackedVehicleId = null
  export let isTrackingVehicle = false
  export let isFirstPersonMode = false

  const dispatch = createEventDispatcher()

  let showSpeedometer = false
  let showVehicleList = false
  let sortedVehicles = []

  // Helper function to truncate long names on mobile
  function truncateName(name, maxLength = 15) {
    if (typeof window !== "undefined" && window.innerWidth < 640) {
      if (name.length > maxLength) {
        return name.substring(0, maxLength - 3) + "..."
      }
    }
    return name
  }

  // Helper function to parse coordinates
  function parseCoordinates(coords) {
    if (!coords) return null

    if (typeof coords === "object" && coords.latitude && coords.longitude) {
      return {
        latitude: coords.latitude,
        longitude: coords.longitude,
      }
    }

    if (typeof coords === "string") {
      const cleanedCoords = coords.slice(1, -1)
      const [longitude, latitude] = cleanedCoords.split(",").map(parseFloat)
      return {
        latitude: latitude,
        longitude: longitude,
      }
    }

    return null
  }

  // Helper function to determine if vehicle is online/recent
  function isVehicleOnline(vehicle) {
    if (!vehicle.last_update) return false

    let timestampMs
    if (typeof vehicle.last_update === "string") {
      timestampMs = new Date(vehicle.last_update).getTime()
    } else {
      timestampMs = vehicle.last_update
    }

    const now = Date.now()
    const diff = now - timestampMs
    const fiveMinutes = 5 * 60 * 1000

    return diff < fiveMinutes
  }

  // Function to get current vehicle data by ID
  function getVehicleById(vehicleId) {
    if (vehicleId === $userVehicleStore.vehicle_id) {
      return {
        id: $userVehicleStore.vehicle_id,
        full_name: "You",
        vehicle_marker: $userVehicleStore.vehicle_marker,
        coordinates: $userVehicleStore.coordinates,
        heading: $userVehicleStore.heading,
        is_trailing: $userVehicleTrailing,
        last_update: $userVehicleStore.last_update,
        isCurrentUser: true,
      }
    }

    const otherVehicle = $otherVehiclesStore.find(
      (v) => v.vehicle_id === vehicleId,
    )
    if (otherVehicle) {
      return {
        ...otherVehicle,
        id: otherVehicle.vehicle_id,
        isCurrentUser: false,
      }
    }

    return null
  }

  // Function to calculate and sort vehicles
  function calculateSortedVehicles() {
    const allVehicles = [
      {
        id: $userVehicleStore.vehicle_id,
        full_name: "You",
        vehicle_marker: $userVehicleStore.vehicle_marker,
        coordinates: $userVehicleStore.coordinates,
        heading: $userVehicleStore.heading,
        is_trailing: $userVehicleTrailing,
        last_update: $userVehicleStore.last_update,
        isCurrentUser: true,
      },
      ...$otherVehiclesStore.map((vehicle) => ({
        ...vehicle,
        id: vehicle.vehicle_id,
        isCurrentUser: false,
      })),
    ]
      .filter((vehicle) => {
        const parsedCoords = parseCoordinates(vehicle.coordinates)
        return parsedCoords !== null
      })
      .sort((a, b) => {
        if (a.id === trackedVehicleId) return -1
        if (b.id === trackedVehicleId) return 1

        if (a.isCurrentUser) return -1
        if (b.isCurrentUser) return 1

        if (a.is_trailing && !b.is_trailing) return -1
        if (b.is_trailing && !a.is_trailing) return 1

        const aOnline = isVehicleOnline(a)
        const bOnline = isVehicleOnline(b)
        if (aOnline && !bOnline) return -1
        if (bOnline && !aOnline) return 1

        const aTime =
          typeof a.last_update === "string"
            ? new Date(a.last_update).getTime()
            : a.last_update || 0
        const bTime =
          typeof b.last_update === "string"
            ? new Date(b.last_update).getTime()
            : b.last_update || 0
        return bTime - aTime
      })

    return allVehicles
  }

  function toggleSpeedometer() {
    showSpeedometer = !showSpeedometer
  }

  function toggleVehicleList() {
    showVehicleList = !showVehicleList

    if (showVehicleList) {
      sortedVehicles = calculateSortedVehicles()
    }
  }

  // ✅ Remove the handleTrackingIndicatorClick function since it's no longer needed

  function startTrackingVehicle(vehicleId) {
    dispatch("startTracking", { vehicleId })
    showVehicleList = false
  }

  function stopTrackingVehicle() {
    dispatch("stopTracking")
    showVehicleList = false
  }

  function toggleFirstPersonMode() {
    dispatch("toggleFirstPerson")
  }

  function zoomToVehicle(vehicle) {
    dispatch("zoomToVehicle", { vehicle })
    showVehicleList = false
  }

  function formatLastUpdate(timestamp) {
    if (!timestamp) return "Unknown"

    let timestampMs
    if (typeof timestamp === "string") {
      timestampMs = new Date(timestamp).getTime()
    } else {
      timestampMs = timestamp
    }

    const now = Date.now()
    const diff = now - timestampMs
    const minutes = Math.floor(diff / (1000 * 60))
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (days > 0) return `${days}d ago`
    if (hours > 0) return `${hours}h ago`
    if (minutes > 0) return `${minutes}m ago`
    return "Just now"
  }

  function getVehicleDisplayName(vehicle) {
    const vehicleType = vehicle.vehicle_marker?.type || "Vehicle"

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

  function getVehicleIcon(vehicle) {
    const vehicleType = vehicle.vehicle_marker?.type
    if (!vehicleType) return null

    return SVGComponents[vehicleType] || SVGComponents.SimpleTractor || null
  }

  function getVehicleColor(vehicle) {
    return (
      vehicle.vehicle_marker?.bodyColor ||
      vehicle.vehicle_marker?.color ||
      "red"
    )
  }

  function getTrackedVehicleName(vehicle) {
    if (!vehicle) return "Unknown"

    if (vehicle.isCurrentUser) {
      return "You"
    }

    return truncateName(vehicle.full_name || "Unknown", 10)
  }
</script>

<!-- Vehicle List Button -->
<button
  class="btn btn-circle fixed bottom-32 left-6 z-50 flex h-10 w-10 items-center justify-center border-none bg-black/70 text-white backdrop-blur transition-all hover:scale-110 hover:bg-black/90"
  style="background: {showVehicleList ? 'rgba(255, 255, 255, 0.9)' : ''}"
  class:text-black={showVehicleList}
  on:click={toggleVehicleList}
  aria-label={showVehicleList ? "Hide vehicle list" : "Show vehicle list"}
>
  {#if showVehicleList}
    <ChevronDown size={20} color="black" />
  {:else}
    <Users size={20} />
  {/if}
</button>

<!-- Speedometer Button -->
<button
  class="btn btn-circle fixed bottom-20 left-6 z-50 flex h-10 w-10 items-center justify-center border-none bg-black/70 text-white backdrop-blur transition-all hover:scale-110 hover:bg-black/90"
  style="background: {showSpeedometer ? 'rgba(255, 255, 255, 0.9)' : ''}"
  class:text-black={showSpeedometer}
  on:click={toggleSpeedometer}
  aria-label={showSpeedometer ? "Hide speed" : "Show speed"}
>
  {#if showSpeedometer}
    <ChevronDown size={20} color="black" />
  {:else}
    <Gauge size={20} />
  {/if}
</button>

<!-- ✅ FIXED: Tracking Status Indicator - Now a simple display container -->
{#if isTrackingVehicle && trackedVehicleId}
  {@const vehicle = getVehicleById(trackedVehicleId)}
  {#if vehicle}
    <div
      class="tracking-indicator fixed z-50 flex h-10 items-center gap-2 rounded-full bg-black/70 px-3 text-white shadow-lg backdrop-blur"
      style="bottom: 8rem; left: 4.5rem; transform-origin: left center;"
    >
      <!-- Vehicle Icon -->
      <div
        class="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-green-500/20 p-0.5"
      >
        {#if getVehicleIcon(vehicle)}
          <svelte:component
            this={getVehicleIcon(vehicle)}
            bodyColor={getVehicleColor(vehicle)}
            size="14px"
          />
        {:else}
          <div class="h-2.5 w-2.5 rounded bg-green-300/60"></div>
        {/if}
      </div>

      <!-- Vehicle Name -->
      <span class="min-w-0 truncate text-sm font-medium text-green-300">
        {getTrackedVehicleName(vehicle)}
      </span>

      <!-- Tracking Icon -->
      <Target size={14} class="flex-shrink-0 animate-pulse text-green-300" />

      <!-- First-Person Camera Toggle Button -->
      <button
        on:click={toggleFirstPersonMode}
        class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full transition-all hover:scale-110 {isFirstPersonMode
          ? 'bg-yellow-500/30 hover:bg-yellow-500/50'
          : 'bg-white/20 hover:bg-white/30'} active:scale-95"
        aria-label={isFirstPersonMode
          ? "Disable first-person view"
          : "Enable first-person view"}
        title={isFirstPersonMode
          ? "Disable first-person view"
          : "Enable first-person camera rotation"}
      >
        {#if isFirstPersonMode}
          <Navigation size={14} class="text-yellow-300" />
        {:else}
          <Navigation2 size={14} class="text-white/70 hover:text-white" />
        {/if}
      </button>

      <!-- Stop Tracking Button -->
      <button
        on:click={stopTrackingVehicle}
        class="ml-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-red-500/20 transition-all hover:scale-110 hover:bg-red-500/40 active:bg-red-500/60"
        aria-label="Stop tracking"
        title="Stop tracking"
      >
        <X size={14} class="text-red-300 hover:text-red-200" />
      </button>
    </div>
  {/if}
{/if}

<!-- Vehicle List Modal -->
{#if showVehicleList}
  <div
    class="vehicle-list-modal wider-screen fixed z-40 overflow-hidden rounded-xl bg-black/70 text-white shadow-2xl backdrop-blur-md"
    style="bottom: 11rem; left: 1.5rem; width: 320px; max-width: calc(100vw - 3rem); max-height: 60vh; transform-origin: bottom left;"
  >
    <!-- Header -->
    <div class="flex items-center justify-between border-b border-white/20 p-4">
      <div class="flex items-center gap-2">
        <Users size={18} class="flex-shrink-0 text-white" />
        <h3 class="text-base font-semibold text-white">Vehicles</h3>
        <span
          class="flex-shrink-0 rounded-full bg-white/20 px-2 py-0.5 text-xs font-medium text-white"
        >
          {sortedVehicles.length}
        </span>
      </div>
      <button
        class="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-white/10 active:bg-white/20"
        on:click={toggleVehicleList}
        aria-label="Close vehicle list"
      >
        <ChevronDown size={16} class="text-white/70" />
      </button>
    </div>

    <!-- Vehicle List -->
    <div class="max-h-80 overflow-y-auto">
      {#if sortedVehicles.length === 0}
        <div
          class="flex flex-col items-center justify-center p-6 text-white/70"
        >
          <Users size={32} class="mb-2 opacity-50" />
          <p class="text-sm">No vehicles on map</p>
        </div>
      {:else}
        <div class="divide-y divide-white/10">
          {#each sortedVehicles as vehicle (vehicle.id)}
            <div class="flex items-stretch">
              <!-- Main vehicle button -->
              <button
                class="min-w-0 flex-1 p-3 text-left transition-colors hover:bg-white/10 active:bg-white/20"
                on:click={() => zoomToVehicle(vehicle)}
              >
                <div class="flex items-center gap-3">
                  <!-- Vehicle Icon -->
                  <div
                    class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white/20 p-1"
                  >
                    {#if getVehicleIcon(vehicle)}
                      <svelte:component
                        this={getVehicleIcon(vehicle)}
                        bodyColor={getVehicleColor(vehicle)}
                        size="24px"
                      />
                    {:else}
                      <div class="h-4 w-4 rounded bg-white/40"></div>
                    {/if}
                  </div>

                  <!-- Vehicle Info -->
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2">
                      <p
                        class="truncate text-sm font-medium text-white"
                        title={vehicle.full_name}
                      >
                        {truncateName(vehicle.full_name)}
                        {#if vehicle.isCurrentUser}
                          <span class="text-xs font-normal text-blue-300"
                            >(You)</span
                          >
                        {/if}
                        {#if vehicle.id === trackedVehicleId}
                          <span class="text-xs font-normal text-green-300"
                            >(Tracking)</span
                          >
                        {/if}
                      </p>
                      <div class="flex flex-shrink-0 items-center gap-1">
                        {#if vehicle.is_trailing}
                          <span
                            class="inline-flex items-center rounded-full bg-green-500/20 px-1.5 py-0.5 text-xs font-medium text-green-300"
                          >
                            •
                          </span>
                        {/if}
                        {#if isVehicleOnline(vehicle) && !vehicle.isCurrentUser}
                          <span
                            class="inline-flex items-center rounded-full bg-blue-500/20 px-1.5 py-0.5 text-xs font-medium text-blue-300"
                          >
                            Online
                          </span>
                        {/if}
                      </div>
                    </div>
                    <div class="mt-0.5 flex items-center gap-2">
                      <p class="truncate text-xs text-white/70">
                        {getVehicleDisplayName(vehicle)}
                      </p>
                      <div
                        class="h-2 w-2 flex-shrink-0 rounded-full border border-white/30"
                        style="background-color: {getVehicleColor(vehicle)}"
                        title="Vehicle color"
                      ></div>
                    </div>
                    <p class="mt-0.5 truncate text-xs text-white/50">
                      {formatLastUpdate(vehicle.last_update)}
                    </p>
                  </div>

                  <!-- Status Indicator -->
                  <div class="relative flex-shrink-0">
                    <div
                      class="h-2 w-2 rounded-full {vehicle.isCurrentUser
                        ? 'bg-blue-400'
                        : vehicle.is_trailing
                          ? 'bg-green-400'
                          : isVehicleOnline(vehicle)
                            ? 'bg-blue-400'
                            : 'bg-white/40'}"
                    ></div>
                    {#if vehicle.is_trailing && !vehicle.isCurrentUser}
                      <div
                        class="absolute -inset-1 animate-ping rounded-full bg-green-400 opacity-30"
                      ></div>
                    {/if}
                    {#if vehicle.isCurrentUser}
                      <div
                        class="absolute -inset-1 animate-ping rounded-full bg-blue-400 opacity-30"
                      ></div>
                    {/if}
                  </div>
                </div>
              </button>

              <!-- Track button -->
              <button
                class="flex h-auto w-12 flex-shrink-0 items-center justify-center border-l border-white/10 transition-colors hover:bg-white/10 active:bg-white/20 {vehicle.id ===
                trackedVehicleId
                  ? 'bg-green-500/20'
                  : ''}"
                on:click={() =>
                  vehicle.id === trackedVehicleId
                    ? stopTrackingVehicle()
                    : startTrackingVehicle(vehicle.id)}
                aria-label={vehicle.id === trackedVehicleId
                  ? "Stop tracking"
                  : "Track vehicle"}
                title={vehicle.id === trackedVehicleId
                  ? "Stop tracking"
                  : "Track this vehicle"}
              >
                {#if vehicle.id === trackedVehicleId}
                  <X size={16} class="text-red-300" />
                {:else}
                  <Crosshair size={16} class="text-white/60" />
                {/if}
              </button>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Footer -->
    <div class="border-t border-white/20 p-3">
      <p class="text-center text-xs text-white/60">
        Tap vehicle to zoom • Tap crosshair to track
        {#if isTrackingVehicle}
          <br />Use compass in tracking bar for camera rotation
        {/if}
      </p>
    </div>
  </div>
{/if}

<!-- Speedometer Display -->
{#if showSpeedometer}
  <div
    class="speed-fade-in fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center rounded-lg bg-black/70 px-5 py-2.5 text-white backdrop-blur"
    style="min-width: min-content"
  >
    <div class="text-2xl font-bold">{currentSpeed}</div>
    <div class="text-xs opacity-80">km/h</div>
  </div>
{/if}

<style>
  .speed-fade-in {
    animation: fadeIn 0.3s ease-in-out;
  }

  .vehicle-list-modal {
    animation: bubbleExpand 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
  }

  .tracking-indicator {
    animation: expandFromLeft 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
  }

  @media (min-width: 640px) {
    .vehicle-list-modal.wider-screen {
      width: 400px !important;
    }
  }

  @media (min-width: 1024px) {
    .vehicle-list-modal.wider-screen {
      width: 450px !important;
    }
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translate(-50%, 20px);
    }
    to {
      opacity: 1;
      transform: translate(-50%, 0);
    }
  }

  @keyframes bubbleExpand {
    0% {
      opacity: 0;
      transform: scale(0.1) translateY(20px);
    }
    60% {
      opacity: 0.8;
      transform: scale(1.05) translateY(-5px);
    }
    100% {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }

  @keyframes expandFromLeft {
    0% {
      opacity: 0;
      transform: scaleX(0.1) translateX(-20px);
    }
    60% {
      opacity: 0.8;
      transform: scaleX(1.05) translateX(5px);
    }
    100% {
      opacity: 1;
      transform: scaleX(1) translateX(0);
    }
  }

  .vehicle-list-modal ::-webkit-scrollbar {
    width: 3px;
  }

  .vehicle-list-modal ::-webkit-scrollbar-track {
    background: transparent;
  }

  .vehicle-list-modal ::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.3);
    border-radius: 2px;
  }

  .vehicle-list-modal ::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.5);
  }
</style>
