<!-- src/components/ButtonSection.svelte -->
<script>
  import { createEventDispatcher } from "svelte"
  import {
    markerStore,
    locationMarkerStore,
    pendingMarkerChangesStore,
    pendingMarkerDeletionsStore,
  } from "$lib/stores/markerStore"
  import {
    userVehicleStore,
    userVehicleTrailing,
  } from "$lib/stores/vehicleStore"
  import { userSettingsStore } from "$lib/stores/userSettingsStore"
  import { commands } from "$lib/stores/commandStore"
  import {
    currentTrailStore,
    pendingCoordinatesStore,
    pendingClosuresStore,
  } from "$lib/stores/currentTrailStore"
  import { toast } from "svelte-sonner"

  import { browser } from "$app/environment"
  import { onMount, onDestroy } from "svelte"
  import { Home, MapPin, RotateCcw, Wifi, WifiOff } from "lucide-svelte"
  import IconSVG from "../components/IconSVG.svelte"
  import { getAllMarkers } from "$lib/data/markerDefinitions"

  export let pendingCoordinates = []
  export let pendingClosures = []

  let isCircular = true
  let isRefreshing = false
  let isExpanded = false

  const dispatch = createEventDispatcher()

  onMount(async () => {
    console.log("Mounting ButtonSection")

    setTimeout(() => {
      isExpanded = true
    }, 200)
  })

  // Make defaultMarker reactive to userSettingsStore changes
  $: defaultMarker = (() => {
    const storeMarker = $userSettingsStore?.defaultMarker
    if (storeMarker) {
      // First try to find in ALL markers (includes deprecated)
      const allMarkers = getAllMarkers()
      const foundMarker = allMarkers.find(
        (icon) =>
          icon.id === storeMarker.id && icon.class === storeMarker.class,
      )
      if (foundMarker) return foundMarker
    }
    // Fallback to default
    return {
      id: "default",
      class: "default",
      name: "Default Marker",
    }
  })()

  // Computed property to check if there are unsynced TRAIL changes
  $: hasUnsyncedTrailChanges =
    $pendingCoordinatesStore.length > 0 || $pendingClosuresStore.length > 0

  // Computed property to check if there are unsynced MARKER changes
  $: hasUnsyncedMarkerChanges =
    $pendingMarkerChangesStore.size > 0 || $pendingMarkerDeletionsStore.size > 0

  // Combined unsynced changes check
  $: hasUnsyncedChanges = hasUnsyncedTrailChanges || hasUnsyncedMarkerChanges

  // Get total points in current trail
  $: totalTrailPoints = $currentTrailStore ? $currentTrailStore.path.length : 0

  // Get number of unsynced points (pending coordinates)
  $: unsyncedPoints = $pendingCoordinatesStore.length

  // Get number of synced points (total minus pending)
  $: syncedPoints = totalTrailPoints - unsyncedPoints

  // Show badge when there's an active trail OR unsynced data
  $: showBadge =
    $userVehicleTrailing || totalTrailPoints > 0 || hasUnsyncedChanges

  // Badge is red when offline with unsynced data, green when actively trailing
  $: badgeColor = hasUnsyncedChanges ? "red" : "green"

  function toggleTrailing() {
    commands.trail.toggle()
  }

  function handleBackToDashboard() {
    dispatch("requestExit")
  }

  function toggleExpanded() {
    isExpanded = !isExpanded
  }

  function handleLocationClick() {
    const coordinates = $userVehicleStore.coordinates
    if (coordinates) {
      locationMarkerStore.set(coordinates)
    } else {
      toast.error("Unable to get your current location")
    }
  }

  function handleLocateHome() {
    dispatch("locateHome")
  }

  async function handleRefresh() {
    if (isRefreshing) return

    isRefreshing = true
    console.log("🔄 Initiating map refresh...")

    toast.loading("Refreshing map data...", { id: "map-refresh" })

    try {
      if (browser) {
        window.location.reload()
      }
    } catch (error) {
      console.error("Error refreshing map:", error)
      toast.error("Failed to refresh map data", { id: "map-refresh" })
      isRefreshing = false
    }
  }

  function openTrailInfoModal() {
    dispatch("openTrailInfo")
  }
</script>

<div>
  <!-- Back to Dashboard Button, Top Left -->
  <button
    class="top-button btn {isCircular
      ? 'btn-circle'
      : 'btn-square'} btn-lg absolute left-4 top-4 z-10 bg-white bg-opacity-50 hover:bg-opacity-100"
    on:click={handleBackToDashboard}
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      class="h-6 w-6"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M10 19l-7-7m0 0l7-7m-7 7h18"
      />
    </svg>
  </button>

  <!-- Floating button container -->
  <div class="fixed right-4 top-4 z-20 flex flex-col items-end">
    <!-- Toggle expand/collapse button -->
    <button
      class="top-button btn {isCircular
        ? 'btn-circle'
        : 'btn-square'} btn-lg mb-3 bg-white hover:bg-opacity-90"
      on:click={toggleExpanded}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="h-8 w-8 transition-transform duration-300 {isExpanded
          ? 'rotate-180'
          : ''}"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M19 9l-7 7-7-7"
        />
      </svg>
    </button>

    <!-- Button list container -->
    <div
      class="flex origin-top flex-col space-y-3 transition-all duration-700 ease-in-out {isExpanded
        ? 'scale-100 opacity-90'
        : 'h-50 scale-0 overflow-hidden opacity-0'}"
    >
      <!-- Refresh Map Button -->
      <button
        class="menu-button btn {isCircular
          ? 'btn-circle'
          : 'btn-square'} btn-lg bg-white hover:bg-opacity-90 {isRefreshing
          ? 'refreshing'
          : ''}"
        on:click={handleRefresh}
        disabled={isRefreshing}
      >
        <RotateCcw size={24} class={isRefreshing ? "spinning" : ""} />
      </button>

      <!-- InstantLocationMarker Button with Default Marker Icon -->
      <button
        class="menu-button btn {isCircular
          ? 'btn-circle'
          : 'btn-square'} marker-icon-button btn-lg bg-white text-sm hover:bg-opacity-90"
        on:click={handleLocationClick}
      >
        <div class="marker-icon-container">
          {#key defaultMarker.id + defaultMarker.class}
            {#if defaultMarker.id === "default"}
              <IconSVG icon="mapbox-marker" size="32px" />
            {:else if defaultMarker.class === "custom-svg"}
              <IconSVG icon={defaultMarker.id} size="32px" />
            {:else if defaultMarker.class?.startsWith("ionic-")}
              <ion-icon name={defaultMarker.id} style="font-size: 32px;"
              ></ion-icon>
            {:else if defaultMarker.class?.startsWith("at-")}
              <i class={`${defaultMarker.class}`} style="font-size: 32px;"></i>
            {:else}
              <MapPin size={24} />
            {/if}
          {/key}
        </div>
      </button>

      <!-- Locate Home Button -->
      <button
        class="menu-button btn {isCircular
          ? 'btn-circle'
          : 'btn-square'} btn-lg bg-white hover:bg-opacity-90"
        on:click={handleLocateHome}
      >
        <Home size={24} />
      </button>

      <!-- Toggle Trailing Button with Status Badge -->
      <div class="relative">
        <button
          class="menu-button btn {isCircular
            ? 'btn-circle'
            : 'btn-square'} btn-lg bg-white hover:bg-opacity-90 {$userVehicleTrailing
            ? 'trailing-active'
            : ''}"
          on:click={toggleTrailing}
        >
          <svg
            class={$userVehicleTrailing ? "animate-trail" : ""}
            fill="currentColor"
            width="36px"
            height="36px"
            viewBox="0 0 32 32"
            version="1.1"
            xmlns="http://www.w3.org/2000/svg"
          >
            <title>trail</title>
            <path
              d="M30.165 30.887c-1.604 0.076-21.522-0.043-21.522-0.043-12.101-12.151 18.219-16.173-0.521-26.154l-1.311 1.383-1.746-4.582 5.635 0.439-1.128 1.267c23.438 6.83-3.151 19.631 20.594 27.69v0z"
            ></path>
          </svg>
        </button>

        <!-- Trail Status Badge - Shows point count, clickable for details -->
        {#if showBadge}
          <button
            class="trail-status-badge {badgeColor}"
            on:click={openTrailInfoModal}
            title="Click for trail details"
          >
            {#if hasUnsyncedChanges}
              <WifiOff size={12} />
            {:else}
              <Wifi size={12} />
            {/if}
            <span>{totalTrailPoints}</span>
          </button>
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  /* Base styles for all menu buttons */
  .menu-button {
    transition: all 0.3s ease;
    background-color: #f7db5c;
    border: 2px solid #000000;
    color: #000000;
  }

  .menu-button:hover {
    background-color: rgb(0, 0, 0, 0.5);
    color: #f7db5c;
  }

  .menu-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .menu-button.refreshing {
    background-color: rgba(96, 165, 250, 0.3);
    border-color: #000000;
  }

  /* Marker icon container for proper sizing */
  .marker-icon-container {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
  }

  /* Ensure marker icon button displays correctly */
  .marker-icon-button {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Top button styles */
  .top-button {
    background-color: #f7db5c;
    border: 2px solid #000000;
    color: #000000;
  }

  .top-button:hover {
    background-color: rgb(0, 0, 0, 0.5);
    color: #f7db5c;
  }

  /* Trailing active state */
  .menu-button.trailing-active {
    background-color: #ff0000;
    border: 2px solid #000000;
    color: #f7db5c;
  }

  .menu-button.trailing-active:hover {
    background-color: #dc0000;
    color: #f7db5c;
  }

  /* Trail Status Badge */
  .trail-status-badge {
    position: absolute;
    top: -8px;
    right: -8px;
    border: 2px solid #000000;
    border-radius: 12px;
    padding: 2px 8px;
    font-size: 11px;
    font-weight: bold;
    display: flex;
    align-items: center;
    gap: 3px;
    z-index: 10;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .trail-status-badge.green {
    background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
    color: white;
    box-shadow: 0 2px 8px rgba(34, 197, 94, 0.4);
  }

  .trail-status-badge.green:hover {
    transform: scale(1.05);
    box-shadow: 0 4px 12px rgba(34, 197, 94, 0.6);
  }

  .trail-status-badge.red {
    background: linear-gradient(135deg, #ff6b6b 0%, #ff8787 100%);
    color: white;
    box-shadow: 0 2px 8px rgba(255, 107, 107, 0.4);
    animation: pulse-badge 2s ease-in-out infinite;
  }

  .trail-status-badge.red:hover {
    transform: scale(1.05);
    box-shadow: 0 4px 12px rgba(255, 107, 107, 0.6);
  }

  .trail-status-badge svg {
    width: 12px;
    height: 12px;
    flex-shrink: 0;
  }

  @keyframes pulse-badge {
    0%,
    100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.05);
    }
  }

  /* Spinning animation for refresh icon */
  .menu-button :global(.spinning) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes draw {
    0% {
      stroke-dashoffset: 1000;
    }
    100% {
      stroke-dashoffset: 0;
    }
  }

  @keyframes fillUnfill {
    0%,
    100% {
      fill-opacity: 0;
    }
    50%,
    51% {
      fill-opacity: 1;
    }
  }

  .animate-trail path {
    stroke: currentColor;
    stroke-width: 1;
    fill: currentColor;
    stroke-dasharray: 105;
    animation:
      draw 10s linear infinite,
      fillUnfill 3s linear infinite;
  }

  .trailing-active {
    position: relative;
    overflow: visible !important;
  }
</style>
