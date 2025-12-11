<!-- VehicleControls.svelte -->
<script>
  import { createEventDispatcher } from "svelte"
  import {
    userVehicleStore,
    userVehicleTrailing,
    otherVehiclesStore,
  } from "$lib/stores/vehicleStore"
  import {
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
  export let trackedVehicleId = null
  export let isTrackingVehicle = false
  export let isFirstPersonMode = false

  const dispatch = createEventDispatcher()

  let showUnifiedMenu = false
  let sortedVehicles = []

  function truncateName(name, maxLength = 15) {
    if (typeof window !== "undefined" && window.innerWidth < 640) {
      if (name.length > maxLength) {
        return name.substring(0, maxLength - 3) + "..."
      }
    }
    return name
  }

  function parseCoordinates(coords) {
    if (!coords) return null
    if (typeof coords === "object" && coords.latitude && coords.longitude) {
      return { latitude: coords.latitude, longitude: coords.longitude }
    }
    if (typeof coords === "string") {
      const cleanedCoords = coords.slice(1, -1)
      const [longitude, latitude] = cleanedCoords.split(",").map(parseFloat)
      return { latitude: latitude, longitude: longitude }
    }
    return null
  }

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
        const aOnline = isVehicleOnline(a)
        const bOnline = isVehicleOnline(b)
        const aTrailing = Boolean(a.is_trailing)
        const bTrailing = Boolean(b.is_trailing)
        const aTime =
          typeof a.last_update === "string"
            ? new Date(a.last_update).getTime()
            : a.last_update || 0
        const bTime =
          typeof b.last_update === "string"
            ? new Date(b.last_update).getTime()
            : b.last_update || 0

        if (a.id === trackedVehicleId) return -1
        if (b.id === trackedVehicleId) return 1

        if (a.isCurrentUser && !b.isCurrentUser) return -1
        if (b.isCurrentUser && !a.isCurrentUser) return 1

        const aOnlineTrailing = aOnline && aTrailing
        const bOnlineTrailing = bOnline && bTrailing

        if (aOnlineTrailing && !bOnlineTrailing) return -1
        if (bOnlineTrailing && !aOnlineTrailing) return 1

        if (aOnline && !bOnline) return -1
        if (bOnline && !aOnline) return 1

        if (aTrailing && !bTrailing) return -1
        if (bTrailing && !aTrailing) return 1

        return bTime - aTime
      })

    return allVehicles
  }

  function toggleUnifiedMenu() {
    showUnifiedMenu = !showUnifiedMenu
    if (showUnifiedMenu) {
      sortedVehicles = calculateSortedVehicles()
    }
  }

  function closeUnifiedMenu() {
    showUnifiedMenu = false
  }

  function stopTrackingAndClose() {
    dispatch("stopTracking")
    showUnifiedMenu = false
  }

  function startTrackingVehicle(vehicleId) {
    dispatch("startTracking", { vehicleId })
    showUnifiedMenu = false
  }

  function stopTrackingVehicle() {
    dispatch("stopTracking")
    showUnifiedMenu = false
  }

  function toggleFirstPersonMode() {
    dispatch("toggleFirstPerson")
  }

  function zoomToVehicle(vehicle) {
    dispatch("zoomToVehicle", { vehicle })
    showUnifiedMenu = false
  }

  function zoomToTrackedVehicleInstant() {
    if (trackedVehicle) {
      dispatch("instantZoomToVehicle", { vehicle: trackedVehicle })
    }
  }

  function formatLastUpdate(timestamp) {
    if (!timestamp) return "Unknown"
    let timestampMs =
      typeof timestamp === "string" ? new Date(timestamp).getTime() : timestamp
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
    if (vehicle.isCurrentUser) return "You"
    return truncateName(vehicle.full_name || "Unknown", 10)
  }

  $: trackedVehicle =
    isTrackingVehicle && trackedVehicleId
      ? getVehicleById(trackedVehicleId)
      : null
</script>

<!-- Vehicle Controls Button -->
{#if !isTrackingVehicle && !showUnifiedMenu}
  <button
    class="fixed bottom-4 left-3 z-50 flex h-10 w-10 items-center justify-center rounded-full border-none bg-black/70 text-white backdrop-blur transition-all hover:scale-110 hover:bg-black/90"
    on:click={toggleUnifiedMenu}
    aria-label="Open vehicle menu"
  >
    <Users size={20} />
  </button>
{/if}

<!-- Expanded Vehicle Menu -->
{#if showUnifiedMenu}
  <div
    class="menu-expanded fixed bottom-4 left-3 z-40 overflow-hidden rounded-xl bg-black/70 text-white shadow-2xl backdrop-blur-md"
    style="width: 320px; max-width: calc(100vw - 1.5rem); max-height: 65vh; transform-origin: bottom left;"
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
        on:click={isTrackingVehicle ? stopTrackingAndClose : closeUnifiedMenu}
        aria-label={isTrackingVehicle
          ? "Stop tracking and close"
          : "Close vehicle menu"}
        title={isTrackingVehicle
          ? "Stop tracking and close menu"
          : "Close menu"}
      >
        <X size={16} class="text-white/70" />
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
              <button
                class="min-w-0 flex-1 p-3 text-left transition-colors hover:bg-white/10 active:bg-white/20"
                on:click={() => zoomToVehicle(vehicle)}
              >
                <div class="flex items-center gap-3">
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
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2">
                      <p
                        class="truncate text-sm font-medium text-white"
                        title={vehicle.full_name}
                      >
                        {truncateName(vehicle.full_name)}
                        {#if vehicle.isCurrentUser}<span
                            class="text-xs font-normal text-blue-300"
                            >(You)</span
                          >{/if}
                        {#if vehicle.id === trackedVehicleId}<span
                            class="text-xs font-normal text-green-300"
                            >(Tracking)</span
                          >{/if}
                      </p>
                      <div class="flex flex-shrink-0 items-center gap-1">
                        {#if vehicle.is_trailing}
                          <span
                            class="inline-flex items-center rounded-full bg-green-500/20 px-1.5 py-0.5 text-xs font-medium text-green-300"
                            >•</span
                          >
                        {/if}
                        {#if isVehicleOnline(vehicle) && !vehicle.isCurrentUser}
                          <span
                            class="inline-flex items-center rounded-full bg-blue-500/20 px-1.5 py-0.5 text-xs font-medium text-blue-300"
                            >Online</span
                          >
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
                    {#if vehicle.isCurrentUser}
                      <div
                        class="absolute -inset-1 animate-ping rounded-full bg-blue-400 opacity-30"
                      ></div>
                    {:else if vehicle.is_trailing && isVehicleOnline(vehicle)}
                      <div
                        class="absolute -inset-1 animate-ping rounded-full bg-green-400 opacity-30"
                      ></div>
                    {/if}
                  </div>
                </div>
              </button>
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
    <div
      class="border-t border-white/20 {isTrackingVehicle
        ? 'bg-green-500/10'
        : ''}"
    >
      {#if isTrackingVehicle && trackedVehicle}
        <div class="flex items-center justify-between p-3">
          <div class="flex items-center gap-2">
            <Target size={14} class="animate-pulse text-green-300" />
            <span class="text-xs text-green-300"
              >Tracking {getTrackedVehicleName(trackedVehicle)}</span
            >
          </div>
          <div class="flex items-center gap-2">
            <button
              on:click={toggleFirstPersonMode}
              class="flex h-7 w-7 items-center justify-center rounded-full transition-all hover:scale-110 {isFirstPersonMode
                ? 'bg-yellow-500/30 hover:bg-yellow-500/50'
                : 'bg-white/20 hover:bg-white/30'}"
              aria-label={isFirstPersonMode
                ? "Disable first-person view"
                : "Enable first-person view"}
            >
              {#if isFirstPersonMode}<Navigation
                  size={12}
                  class="text-yellow-300"
                />{:else}<Navigation2 size={12} class="text-white/70" />{/if}
            </button>
            <button
              on:click={closeUnifiedMenu}
              class="flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:bg-white/10"
              aria-label="Collapse to tracking bar"
              title="Minimize to tracking bar"
            >
              <ChevronDown size={12} class="text-white/70" />
            </button>
          </div>
        </div>
      {:else}
        <button
          class="flex w-full items-center justify-center gap-2 p-3 transition-colors hover:bg-white/10 active:bg-white/20"
          on:click={closeUnifiedMenu}
          aria-label="Collapse menu"
        >
          <ChevronDown size={16} class="text-white/70" />
          <span class="text-xs text-white/60">Collapse</span>
        </button>
      {/if}
    </div>
  </div>
{/if}

<!-- Tracking Bar -->
{#if isTrackingVehicle && !showUnifiedMenu && trackedVehicle}
  <div
    class="tracking-bar fixed bottom-4 left-3 z-50 flex h-10 items-center rounded-full bg-black/70 text-white shadow-lg backdrop-blur"
    style="transform-origin: left center;"
  >
    <!-- Users Icon Button -->
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div
      class="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-white/10"
      on:click={toggleUnifiedMenu}
      title="Open vehicle menu"
    >
      <Users size={20} />
    </div>

    <!-- Separator -->
    <div class="mx-2 h-6 w-px bg-white/20"></div>

    <!-- Vehicle Info Section -->
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div
      class="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 transition-colors hover:bg-blue-500/10"
      on:click={zoomToTrackedVehicleInstant}
      title="Zoom to {getTrackedVehicleName(trackedVehicle)}"
    >
      <!-- Vehicle Icon -->
      <div
        class="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-green-500/20 p-0.5"
      >
        {#if getVehicleIcon(trackedVehicle)}
          <svelte:component
            this={getVehicleIcon(trackedVehicle)}
            bodyColor={getVehicleColor(trackedVehicle)}
            size="14px"
          />
        {:else}
          <div class="h-2.5 w-2.5 rounded bg-green-300/60"></div>
        {/if}
      </div>

      <!-- Vehicle Name -->
      <span class="min-w-0 truncate text-sm font-medium text-green-300"
        >{getTrackedVehicleName(trackedVehicle)}</span
      >

      <!-- Tracking Icon -->
      <Target size={14} class="flex-shrink-0 animate-pulse text-green-300" />
    </div>

    <!-- Controls Section -->
    <div class="flex items-center gap-1 pl-2 pr-1">
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

      <button
        on:click={stopTrackingVehicle}
        class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-red-500/20 transition-all hover:scale-110 hover:bg-red-500/40 active:bg-red-500/60"
        aria-label="Stop tracking"
        title="Stop tracking"
      >
        <X size={14} class="text-red-300 hover:text-red-200" />
      </button>
    </div>
  </div>
{/if}

<style>
  .menu-expanded {
    animation: bubbleExpand 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
  }

  .tracking-bar {
    animation: extendFromButton 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55);
  }

  @media (min-width: 640px) {
    .menu-expanded {
      width: 400px !important;
    }
  }

  @media (min-width: 1024px) {
    .menu-expanded {
      width: 450px !important;
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

  @keyframes extendFromButton {
    0% {
      opacity: 0;
      transform: scaleX(0.25) translateX(0);
    }
    60% {
      opacity: 0.8;
      transform: scaleX(1.05) translateX(0);
    }
    100% {
      opacity: 1;
      transform: scaleX(1) translateX(0);
    }
  }

  .menu-expanded ::-webkit-scrollbar {
    width: 3px;
  }

  .menu-expanded ::-webkit-scrollbar-track {
    background: transparent;
  }

  .menu-expanded ::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.3);
    border-radius: 2px;
  }

  .menu-expanded ::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.5);
  }
</style>
