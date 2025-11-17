<!-- src/components/ButtonSection.svelte -->
<script>
  import { createEventDispatcher } from "svelte"
  import { mapStore, locationMarkerStore } from "../stores/mapStore"
  import {
    userVehicleStore,
    userVehicleTrailing,
  } from "$lib/stores/vehicleStore"
  import { userSettingsStore } from "$lib/stores/userSettingsStore"
  import { commands } from "$lib/stores/commandStore"
  import { toast } from "svelte-sonner"

  import { browser } from "$app/environment"
  import { onMount } from "svelte"
  import { Home, MapPin, RotateCcw, AlertTriangle } from "lucide-svelte"
  import IconSVG from "../components/IconSVG.svelte"
  import { getAllMarkers } from "$lib/data/markerDefinitions"

  // Import the stores we need to check for unsynced data
  export let pendingCoordinates = { length: 0 }
  export let pendingClosures = { length: 0 }

  let isCircular = true
  let isRefreshing = false
  let isExpanded = false
  let showExitModal = false

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

  // Computed property to check if there are unsynced changes
  $: hasUnsyncedChanges =
    pendingCoordinates.length > 0 || pendingClosures.length > 0

  function toggleTrailing() {
    // Use command store instead of dispatching events
    commands.trail.toggle()
  }

  function handleBackToDashboard() {
    // Check if we should show confirmation modal
    if ($userVehicleTrailing || hasUnsyncedChanges) {
      showExitModal = true
    } else {
      // Safe to exit
      dispatch("backToDashboard")
    }
  }

  function confirmExit() {
    showExitModal = false

    // If actively trailing, stop it first using command store
    if ($userVehicleTrailing) {
      commands.trail.stop()

      // Give a moment for the stop trail to process
      setTimeout(() => {
        dispatch("backToDashboard")
      }, 500)
    } else {
      // Just exit (unsynced data will be lost)
      dispatch("backToDashboard")
    }
  }

  function cancelExit() {
    showExitModal = false
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
      // Force a hard reload of the current page
      if (browser) {
        window.location.reload()
      }
    } catch (error) {
      console.error("Error refreshing map:", error)
      toast.error("Failed to refresh map data", { id: "map-refresh" })
      isRefreshing = false
    }
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

      <!-- Toggle Trailing Button with Pending Sync Badge -->
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

        <!-- Pending Sync Badge -->
        {#if hasUnsyncedChanges}
          <div
            class="sync-badge"
            title="{pendingCoordinates.length} trail points{pendingClosures.length >
            0
              ? ` and ${pendingClosures.length} trail closures`
              : ''} pending sync"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="3"
            >
              <path
                d="M1 1l6 6m0 0l6-6M7 7v10m0 0l-6 6m6-6l6 6"
                stroke-linecap="round"
              />
            </svg>
            <span>{pendingCoordinates.length + pendingClosures.length}</span>
          </div>
        {/if}
      </div>
    </div>
  </div>

  <!-- Exit Confirmation Modal -->
  {#if showExitModal}
    <div class="modal-overlay" on:click={cancelExit}>
      <div class="modal-content" on:click|stopPropagation>
        <div class="modal-icon">
          <AlertTriangle size={48} color="#ff6b6b" />
        </div>

        <h2 class="modal-title">Exit Map View?</h2>

        <div class="modal-body">
          {#if $userVehicleTrailing}
            <p class="warning-text">
              <strong>You are currently recording a trail.</strong>
            </p>
            <p>Exiting will stop the trail recording and save your progress.</p>
          {:else if hasUnsyncedChanges}
            <p class="warning-text">
              <strong>You have unsynced changes.</strong>
            </p>
            <p>
              You have {pendingCoordinates.length} trail point{pendingCoordinates.length !==
              1
                ? "s"
                : ""}
              {#if pendingClosures.length > 0}
                and {pendingClosures.length} trail closure{pendingClosures.length !==
                1
                  ? "s"
                  : ""}
              {/if}
              waiting to sync.
            </p>
            <p>
              Exiting now may result in data loss. Please wait for sync to
              complete.
            </p>
          {/if}
        </div>

        <div class="modal-actions">
          <button class="btn-cancel" on:click={cancelExit}> Cancel </button>
          <button class="btn-confirm" on:click={confirmExit}>
            {$userVehicleTrailing ? "Stop Trail & Exit" : "Exit Anyway"}
          </button>
        </div>
      </div>
    </div>
  {/if}
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

  /* Pending Sync Badge */
  .sync-badge {
    position: absolute;
    top: -8px;
    right: -8px;
    background: linear-gradient(135deg, #ff6b6b 0%, #ff8787 100%);
    color: white;
    border: 2px solid #000000;
    border-radius: 12px;
    padding: 2px 8px;
    font-size: 11px;
    font-weight: bold;
    display: flex;
    align-items: center;
    gap: 3px;
    box-shadow: 0 2px 8px rgba(255, 107, 107, 0.4);
    animation: pulse-badge 2s ease-in-out infinite;
    z-index: 10;
    pointer-events: none;
  }

  .sync-badge svg {
    width: 12px;
    height: 12px;
    flex-shrink: 0;
  }

  @keyframes pulse-badge {
    0%,
    100% {
      transform: scale(1);
      box-shadow: 0 2px 8px rgba(255, 107, 107, 0.4);
    }
    50% {
      transform: scale(1.05);
      box-shadow: 0 4px 12px rgba(255, 107, 107, 0.6);
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

  /* Modal styles */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    animation: fadeIn 0.2s ease-out;
  }

  .modal-content {
    background: white;
    border-radius: 16px;
    padding: 32px;
    max-width: 400px;
    width: 90%;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    animation: slideIn 0.3s ease-out;
  }

  .modal-icon {
    display: flex;
    justify-content: center;
    margin-bottom: 20px;
  }

  .modal-title {
    font-size: 24px;
    font-weight: bold;
    text-align: center;
    margin-bottom: 16px;
    color: #1f2937;
  }

  .modal-body {
    text-align: center;
    color: #4b5563;
    line-height: 1.6;
    margin-bottom: 24px;
  }

  .modal-body p {
    margin-bottom: 12px;
  }

  .warning-text {
    color: #dc2626;
    font-weight: 600;
  }

  .modal-actions {
    display: flex;
    gap: 12px;
    justify-content: center;
  }

  .btn-cancel,
  .btn-confirm {
    padding: 12px 24px;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
    font-size: 16px;
  }

  .btn-cancel {
    background-color: #e5e7eb;
    color: #374151;
  }

  .btn-cancel:hover {
    background-color: #d1d5db;
  }

  .btn-confirm {
    background-color: #dc2626;
    color: white;
  }

  .btn-confirm:hover {
    background-color: #b91c1c;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes slideIn {
    from {
      transform: translateY(-20px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }
</style>
