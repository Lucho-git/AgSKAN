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
  import {
    currentTrailStore,
    pendingCoordinatesStore,
    pendingClosuresStore,
  } from "$lib/stores/currentTrailStore"
  import { toast } from "svelte-sonner"

  import { browser } from "$app/environment"
  import { onMount, onDestroy } from "svelte"
  import {
    Home,
    MapPin,
    RotateCcw,
    AlertTriangle,
    X,
    Clock,
    Database,
    Wifi,
    WifiOff,
    ChevronDown,
    Palette,
    Ruler,
  } from "lucide-svelte"
  import IconSVG from "../components/IconSVG.svelte"
  import { getAllMarkers } from "$lib/data/markerDefinitions"

  let isCircular = true
  let isRefreshing = false
  let isExpanded = false
  let showExitModal = false
  let showTrailInfoModal = false
  let liveUpdateInterval

  const dispatch = createEventDispatcher()

  onMount(async () => {
    console.log("Mounting ButtonSection")

    setTimeout(() => {
      isExpanded = true
    }, 200)

    // Start live duration updates
    liveUpdateInterval = setInterval(() => {
      if ($currentTrailStore && showTrailInfoModal) {
        // Force reactivity update
        currentTrailStore.update((t) => t)
      }
    }, 1000)
  })

  onDestroy(() => {
    if (liveUpdateInterval) {
      clearInterval(liveUpdateInterval)
    }
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
    $pendingCoordinatesStore.length > 0 || $pendingClosuresStore.length > 0

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

  // Calculate trail duration with live updates - using start_time from store
  $: trailDuration = (() => {
    if (!$currentTrailStore) return null

    // Use start_time field from the trail store
    const startTime = $currentTrailStore.start_time
    if (!startTime) return null

    const start = new Date(startTime).getTime()
    const end = $currentTrailStore.end_time
      ? new Date($currentTrailStore.end_time).getTime()
      : Date.now()

    const diffMs = end - start
    const hours = Math.floor(diffMs / (1000 * 60 * 60))
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
    const seconds = Math.floor((diffMs % (1000 * 60)) / 1000)

    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`
    } else {
      return `${seconds}s`
    }
  })()

  // Calculate raw time difference in milliseconds
  $: timeDifferenceMs = (() => {
    if (!$currentTrailStore) return 0

    const startTime = $currentTrailStore.start_time
    if (!startTime) return 0

    const start = new Date(startTime).getTime()
    const end = $currentTrailStore.end_time
      ? new Date($currentTrailStore.end_time).getTime()
      : Date.now()

    return end - start
  })()

  // Get trail color value from vehicle marker
  $: trailColorValue = (() => {
    const bodyColor = $userVehicleStore?.vehicle_marker?.bodyColor
    if (!bodyColor) return "#6b7280"

    const colorValues = {
      HotPink: "#ff69b4",
      LightGreen: "#90ee90",
      DarkBlue: "#00008b",
      LightBlue: "#add8e6",
      DarkRed: "#8b0000",
      LightRed: "#ffcccb",
      DarkGreen: "#006400",
      Yellow: "#ffff00",
      Orange: "#ffa500",
      Purple: "#800080",
      Brown: "#a52a2a",
      Black: "#000000",
      White: "#ffffff",
      Gray: "#808080",
      Grey: "#808080",
      Red: "#ff0000",
      Green: "#008000",
      Blue: "#0000ff",
    }

    return colorValues[bodyColor] || bodyColor
  })()

  // Get trail color display name
  $: trailColorName = (() => {
    const bodyColor = $userVehicleStore?.vehicle_marker?.bodyColor
    if (!bodyColor) return "Default"

    const colorMap = {
      HotPink: "Hot Pink",
      LightGreen: "Light Green",
      DarkBlue: "Dark Blue",
      LightBlue: "Light Blue",
      DarkRed: "Dark Red",
      LightRed: "Light Red",
      DarkGreen: "Dark Green",
      Yellow: "Yellow",
      Orange: "Orange",
      Purple: "Purple",
      Brown: "Brown",
      Black: "Black",
      White: "White",
      Gray: "Gray",
      Grey: "Gray",
      Red: "Red",
      Green: "Green",
      Blue: "Blue",
    }

    return colorMap[bodyColor] || bodyColor
  })()

  // Get trail width from current trail store (trail_width field)
  $: trailWidth = $currentTrailStore?.trail_width || 3

  // Get trail swath from vehicle marker
  $: trailSwath = (() => {
    const swath = $userVehicleStore?.vehicle_marker?.swath
    return swath ? `${swath}m` : "N/A"
  })()

  // Get current operation name
  $: operationName = $userVehicleStore?.operation_name || "No operation"

  // Get trail start time formatted
  $: trailStartTime = (() => {
    if (!$currentTrailStore?.start_time) return null
    const date = new Date($currentTrailStore.start_time)
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
  })()

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

  function openTrailInfoModal() {
    showTrailInfoModal = true

    // 🔍 COMPREHENSIVE LOGGING ON MODAL OPEN
    console.group("🔍 Trail Info Modal Data Sources")
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

    console.log("📊 currentTrailStore:", {
      exists: !!$currentTrailStore,
      fullData: $currentTrailStore,
      id: $currentTrailStore?.id,
      start_time: $currentTrailStore?.start_time,
      end_time: $currentTrailStore?.end_time,
      trail_color: $currentTrailStore?.trail_color,
      trail_width: $currentTrailStore?.trail_width,
      pathLength: $currentTrailStore?.path?.length || 0,
      pathSample: $currentTrailStore?.path?.slice(0, 2),
    })

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

    console.log("📡 pendingCoordinatesStore:", {
      length: $pendingCoordinatesStore.length,
      sample: $pendingCoordinatesStore.slice(0, 2),
    })

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

    console.log("🔒 pendingClosuresStore:", {
      length: $pendingClosuresStore.length,
      sample: $pendingClosuresStore.slice(0, 1),
    })

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

    console.log("🚗 userVehicleStore:", {
      vehicle_id: $userVehicleStore?.vehicle_id,
      operation_name: $userVehicleStore?.operation_name,
      vehicle_marker: $userVehicleStore?.vehicle_marker,
      bodyColor: $userVehicleStore?.vehicle_marker?.bodyColor,
      swath: $userVehicleStore?.vehicle_marker?.swath,
    })

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

    console.log("⏱️ Computed Values:", {
      trailDuration,
      trailStartTime,
      timeDifferenceMs,
      totalTrailPoints,
      syncedPoints,
      unsyncedPoints,
      trailColorValue,
      trailColorName,
      trailWidth,
      trailSwath,
      operationName,
    })

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

    console.log("🌐 Pending Data:", {
      pendingCoordinatesLength: $pendingCoordinatesStore.length,
      pendingClosuresLength: $pendingClosuresStore.length,
      hasUnsyncedChanges,
    })

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

    console.log("🎯 Trail Status:", {
      userVehicleTrailing: $userVehicleTrailing,
      showBadge,
      badgeColor,
    })

    console.groupEnd()
  }

  function closeTrailInfoModal() {
    showTrailInfoModal = false
  }

  function endTrailFromModal() {
    if ($userVehicleTrailing) {
      commands.trail.stop()
      toast.success("Trail recording stopped")
    }
    showTrailInfoModal = false
  }

  function continueTrailFromModal() {
    showTrailInfoModal = false
  }

  function formatDateTime(dateString) {
    if (!dateString) return "N/A"
    const date = new Date(dateString)
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
  }

  function formatDateTimeUTC(dateString) {
    if (!dateString) return "N/A"
    const date = new Date(dateString)
    return date.toUTCString()
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

  <!-- Trail Info Modal -->
  {#if showTrailInfoModal && $currentTrailStore}
    <div class="modal-overlay" on:click={closeTrailInfoModal}>
      <div class="trail-modal" on:click|stopPropagation>
        <!-- Header -->
        <div
          class="trail-modal-header {$userVehicleTrailing
            ? 'recording'
            : 'stopped'}"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <h3 class="text-base font-semibold text-white">
                Trail Recording
              </h3>
              <div
                class="status-dot {$userVehicleTrailing
                  ? 'recording'
                  : 'stopped'}"
              ></div>
            </div>
            <button
              class="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-white/10 active:bg-white/20"
              on:click={closeTrailInfoModal}
              aria-label="Close trail info"
            >
              <X size={16} class="text-white/70" />
            </button>
          </div>
        </div>

        <!-- Body -->
        <div class="trail-modal-body">
          <!-- Start Time & Duration Banner -->
          {#if trailStartTime}
            <div class="time-banner">
              <div class="time-banner-row">
                <Clock size={14} class="text-purple-400" />
                <div class="time-banner-content">
                  <span class="time-banner-label">Started</span>
                  <span class="time-banner-value">{trailStartTime}</span>
                </div>
              </div>
              <div class="time-banner-row">
                <Clock size={14} class="text-green-400" />
                <div class="time-banner-content">
                  <span class="time-banner-label">Duration</span>
                  <span class="time-banner-value">{trailDuration || "0s"}</span>
                </div>
              </div>
            </div>
          {/if}

          <!-- Compact Stats Grid - ALWAYS 3 COLUMNS -->
          <div class="compact-stats-row">
            <div class="stat-compact">
              <Database size={14} class="text-blue-400" />
              <div class="stat-compact-content">
                <span class="stat-compact-label">Points</span>
                <span class="stat-compact-value">{totalTrailPoints}</span>
              </div>
            </div>

            <div class="stat-compact">
              <Wifi size={14} class="text-green-400" />
              <div class="stat-compact-content">
                <span class="stat-compact-label">Synced</span>
                <span class="stat-compact-value">{syncedPoints}</span>
              </div>
            </div>

            <div class="stat-compact {hasUnsyncedChanges ? 'warning' : ''}">
              <WifiOff
                size={14}
                class={hasUnsyncedChanges ? "text-amber-400" : "text-white/40"}
              />
              <div class="stat-compact-content">
                <span class="stat-compact-label">Queue</span>
                <span class="stat-compact-value">{unsyncedPoints}</span>
              </div>
            </div>
          </div>

          <!-- Trail Properties -->
          <div class="trail-properties">
            <div class="property-item">
              <Palette size={14} class="text-white/60" />
              <span class="property-label">Color</span>
              <div class="flex items-center gap-2">
                <div
                  class="h-3 w-6 rounded border border-white/20"
                  style="background-color: {trailColorValue};"
                ></div>
                <span class="property-value">{trailColorName}</span>
              </div>
            </div>

            <div class="property-item">
              <Ruler size={14} class="text-white/60" />
              <span class="property-label">Swath</span>
              <span class="property-value">{trailSwath}</span>
            </div>
          </div>

          <!-- Operation Info -->
          {#if operationName !== "No operation"}
            <div class="operation-banner">
              <div class="operation-label">Operation</div>
              <div class="operation-name">{operationName}</div>
            </div>
          {/if}

          <!-- Warning Banner for Unsynced Data -->
          {#if hasUnsyncedChanges}
            <div class="warning-banner">
              <AlertTriangle size={16} class="flex-shrink-0 text-amber-400" />
              <div class="text-xs">
                <strong
                  >{$pendingCoordinatesStore.length} point{$pendingCoordinatesStore.length !==
                  1
                    ? "s"
                    : ""}</strong
                >
                {#if $pendingClosuresStore.length > 0}
                  and <strong
                    >{$pendingClosuresStore.length} trail{$pendingClosuresStore.length !==
                    1
                      ? "s"
                      : ""}</strong
                  >
                {/if}
                waiting to sync
              </div>
            </div>
          {/if}
        </div>

        <!-- Footer Actions -->
        <div class="trail-modal-footer">
          {#if $userVehicleTrailing}
            <button
              class="modal-btn secondary"
              on:click={continueTrailFromModal}
            >
              <ChevronDown size={16} />
              Continue
            </button>
            <button class="modal-btn danger" on:click={endTrailFromModal}>
              Stop Trail
            </button>
          {:else}
            <button
              class="modal-btn primary full-width"
              on:click={closeTrailInfoModal}
            >
              Close
            </button>
          {/if}
        </div>
      </div>
    </div>
  {/if}

  <!-- Exit Confirmation Modal -->
  {#if showExitModal}
    <div class="modal-overlay" on:click={cancelExit}>
      <div class="trail-modal" on:click|stopPropagation>
        <div class="trail-modal-header danger">
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold text-white">Exit Map View?</h3>
            <button
              class="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-white/10"
              on:click={cancelExit}
            >
              <X size={16} class="text-white/70" />
            </button>
          </div>
        </div>

        <div class="trail-modal-body">
          <div class="flex flex-col items-center gap-4 py-4 text-center">
            <AlertTriangle size={48} class="text-red-400" />

            {#if $userVehicleTrailing}
              <div>
                <p class="mb-2 font-semibold text-white/90">
                  You are currently recording a trail.
                </p>
                <p class="text-sm text-white/70">
                  Exiting will stop the trail recording and save your progress.
                </p>
              </div>
            {:else if hasUnsyncedChanges}
              <div>
                <p class="mb-2 font-semibold text-white/90">
                  You have unsynced changes.
                </p>
                <p class="mb-2 text-sm text-white/70">
                  You have {$pendingCoordinatesStore.length} trail point{$pendingCoordinatesStore.length !==
                  1
                    ? "s"
                    : ""}
                  {#if $pendingClosuresStore.length > 0}
                    and {$pendingClosuresStore.length} trail closure{$pendingClosuresStore.length !==
                    1
                      ? "s"
                      : ""}
                  {/if}
                  waiting to sync.
                </p>
                <p class="text-sm text-white/70">
                  Exiting now may result in data loss. Please wait for sync to
                  complete.
                </p>
              </div>
            {/if}
          </div>
        </div>

        <div class="trail-modal-footer">
          <button class="modal-btn secondary" on:click={cancelExit}>
            Cancel
          </button>
          <button class="modal-btn danger" on:click={confirmExit}>
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

  /* Modal Overlay - INCREASED Z-INDEX */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999; /* Increased from 1000 */
    animation: fadeIn 0.2s ease-out;
  }

  /* Trail Modal */
  .trail-modal {
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(20px);
    border-radius: 16px;
    max-width: 420px;
    width: 90%;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.1);
    animation: slideIn 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
    overflow: hidden;
  }

  /* Modal Header */
  .trail-modal-header {
    padding: 16px 18px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .trail-modal-header.recording {
    background: linear-gradient(
      135deg,
      rgba(34, 197, 94, 0.15) 0%,
      rgba(22, 163, 74, 0.1) 100%
    );
  }

  .trail-modal-header.stopped {
    background: linear-gradient(
      135deg,
      rgba(107, 114, 128, 0.15) 0%,
      rgba(75, 85, 99, 0.1) 100%
    );
  }

  .trail-modal-header.danger {
    background: linear-gradient(
      135deg,
      rgba(239, 68, 68, 0.15) 0%,
      rgba(220, 38, 38, 0.1) 100%
    );
  }

  /* Status Dot */
  .status-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .status-dot.recording {
    background: #22c55e;
    animation: pulse-dot 2s ease-in-out infinite;
  }

  .status-dot.stopped {
    background: #6b7280;
  }

  @keyframes pulse-dot {
    0%,
    100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.6;
      transform: scale(0.8);
    }
  }

  /* Modal Body */
  .trail-modal-body {
    padding: 16px 18px;
    overflow-y: auto;
    flex: 1;
  }

  .trail-modal-body::-webkit-scrollbar {
    width: 4px;
  }

  .trail-modal-body::-webkit-scrollbar-track {
    background: transparent;
  }

  .trail-modal-body::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 2px;
  }

  /* Time Banner - Prominent display of start time and duration */
  .time-banner {
    background: linear-gradient(
      135deg,
      rgba(168, 85, 247, 0.15) 0%,
      rgba(147, 51, 234, 0.1) 100%
    );
    border: 1px solid rgba(168, 85, 247, 0.25);
    border-radius: 10px;
    padding: 12px;
    margin-bottom: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .time-banner-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .time-banner-content {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
  }

  .time-banner-label {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.5);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .time-banner-value {
    font-size: 14px;
    color: rgba(255, 255, 255, 0.95);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  /* Compact Stats Row - ALWAYS 3 COLUMNS IN A ROW */
  .compact-stats-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    margin-bottom: 12px;
  }

  .stat-compact {
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    padding: 10px;
    transition: all 0.2s;
  }

  .stat-compact:hover {
    background: rgba(255, 255, 255, 0.08);
  }

  .stat-compact.warning {
    background: rgba(251, 191, 36, 0.1);
    border-color: rgba(251, 191, 36, 0.2);
  }

  .stat-compact-content {
    display: flex;
    flex-direction: column;
    gap: 1px;
    flex: 1;
    min-width: 0;
  }

  .stat-compact-label {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.5);
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .stat-compact-value {
    font-size: 16px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.95);
    font-variant-numeric: tabular-nums;
  }

  /* Trail Properties */
  .trail-properties {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    padding: 12px;
    margin-bottom: 12px;
  }

  .property-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }

  .property-item:last-child {
    border-bottom: none;
  }

  .property-label {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.6);
    flex: 1;
  }

  .property-value {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.95);
    font-weight: 600;
  }

  /* Operation Banner */
  .operation-banner {
    background: rgba(96, 165, 250, 0.1);
    border: 1px solid rgba(96, 165, 250, 0.2);
    border-radius: 10px;
    padding: 10px 12px;
    margin-bottom: 12px;
  }

  .operation-label {
    font-size: 10px;
    color: rgba(147, 197, 253, 0.8);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 2px;
  }

  .operation-name {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.95);
    font-weight: 600;
  }

  /* Warning Banner */
  .warning-banner {
    display: flex;
    align-items: center;
    gap: 10px;
    background: rgba(251, 191, 36, 0.15);
    border: 1px solid rgba(251, 191, 36, 0.3);
    border-radius: 10px;
    padding: 10px 12px;
    color: rgba(255, 255, 255, 0.95);
    margin-bottom: 10px;
  }

  .warning-banner.info {
    background: rgba(59, 130, 246, 0.15);
    border-color: rgba(59, 130, 246, 0.3);
  }

  /* Modal Footer */
  .trail-modal-footer {
    padding: 14px 18px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    gap: 10px;
    background: rgba(0, 0, 0, 0.3);
  }

  /* Modal Buttons */
  .modal-btn {
    flex: 1;
    padding: 11px 18px;
    border-radius: 10px;
    font-weight: 600;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }

  .modal-btn.primary {
    background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
    color: white;
  }

  .modal-btn.primary:hover {
    background: linear-gradient(135deg, #16a34a 0%, #15803d 100%);
    transform: translateY(-1px);
  }

  .modal-btn.secondary {
    background: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.9);
    border: 1px solid rgba(255, 255, 255, 0.2);
  }

  .modal-btn.secondary:hover {
    background: rgba(255, 255, 255, 0.15);
    border-color: rgba(255, 255, 255, 0.3);
  }

  .modal-btn.danger {
    background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
    color: white;
  }

  .modal-btn.danger:hover {
    background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
    transform: translateY(-1px);
  }

  .modal-btn.full-width {
    flex: 1 1 100%;
  }

  /* Animations */
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
      transform: translateY(-20px) scale(0.95);
      opacity: 0;
    }
    to {
      transform: translateY(0) scale(1);
      opacity: 1;
    }
  }

  /* Mobile responsiveness */
  @media (max-width: 640px) {
    .trail-modal {
      width: 95%;
      max-height: 90vh;
      max-width: 380px;
    }

    /* Stats row stays as 3 columns even on mobile */
    .compact-stats-row {
      grid-template-columns: repeat(3, 1fr);
      gap: 6px;
    }

    .stat-compact {
      padding: 8px 6px;
      gap: 6px;
    }

    .stat-compact-value {
      font-size: 15px;
    }

    .modal-btn {
      font-size: 12px;
      padding: 10px 14px;
    }

    .time-banner-value {
      font-size: 13px;
    }
  }
</style>
