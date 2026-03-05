<!-- src/lib/components/map/toolbox/ButtonSection.svelte -->
<script>
  import { createEventDispatcher } from "svelte"
  import {
    markerStore,
    locationMarkerStore,
    extraLocationMarkerStore,
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
    trailPausedStore,
    trailPausePointStore,
  } from "$lib/stores/currentTrailStore"
  import { toast } from "svelte-sonner"

  import { browser } from "$app/environment"
  import { onMount } from "svelte"
  import {
    Home,
    MapPin,
    RotateCcw,
    Wifi,
    WifiOff,
    Plus,
    Pause,
    Play,
    Square,
    Timer,
    AlertTriangle,
  } from "lucide-svelte"
  import IconSVG from "$lib/components/general/IconSVG.svelte"
  import { getAllMarkers } from "$lib/data/markerDefinitions"

  export let pendingCoordinates = []
  export let pendingClosures = []

  let isCircular = true
  let isRefreshing = false
  let isExpanded = false

  // ── UI variation ──
  // Locked to A. Other variations (B = bottom-right position) removed.
  // To experiment again, restore cycleVariation() and variation templates from git history.

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

  // Extra markers - resolved from store
  $: extraMarkers = ($userSettingsStore?.extraMarkers || []).map(
    (storeMarker) => {
      const allMarkers = getAllMarkers()
      return (
        allMarkers.find(
          (icon) =>
            icon.id === storeMarker.id && icon.class === storeMarker.class,
        ) || storeMarker
      )
    },
  )

  // Has extra markers configured
  $: hasExtraMarkers = extraMarkers.length > 0

  // Last extra marker for stack preview
  $: lastExtraMarker = hasExtraMarkers
    ? extraMarkers[extraMarkers.length - 1]
    : null

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
  $: badgeColor = hasUnsyncedChanges ? "red" : "blue"

  function toggleTrailing() {
    commands.trail.toggle()
  }

  function pauseTrailing() {
    commands.trail.pause()
  }

  // ── Resume confirmation modal state ──
  const RESUME_DISTANCE_WARNING_METERS = 300
  let showResumeConfirm = false
  let resumeDistanceText = ""

  /** Haversine distance in metres between two lat/lng points */
  function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000
    const toRad = (deg) => (deg * Math.PI) / 180
    const dLat = toRad(lat2 - lat1)
    const dLon = toRad(lon2 - lon1)
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  }

  function resumeTrailing() {
    const pausePoint = $trailPausePointStore
    const currentCoords = $userVehicleStore.coordinates

    // Check distance from pause point
    if (pausePoint && currentCoords?.latitude && currentCoords?.longitude) {
      const distance = haversineDistance(
        pausePoint.latitude,
        pausePoint.longitude,
        currentCoords.latitude,
        currentCoords.longitude,
      )

      if (distance > RESUME_DISTANCE_WARNING_METERS) {
        // Format distance for display
        if (distance >= 1000) {
          resumeDistanceText = `${(distance / 1000).toFixed(1)}km`
        } else {
          resumeDistanceText = `${Math.round(distance)}m`
        }
        showResumeConfirm = true
        return
      }
    }

    // Distance is fine, resume directly
    commands.trail.resume()
  }

  function confirmResume() {
    showResumeConfirm = false
    commands.trail.resume()
  }

  async function endAndStartNew() {
    showResumeConfirm = false
    // First unpause so stop works cleanly
    trailPausedStore.set(false)
    trailPausePointStore.set(null)
    // Stop current trail
    commands.trail.stop()
    // Wait for trailing state to actually clear before starting new
    await waitForTrailingStop()
    commands.trail.start()
  }

  /** Wait for userVehicleTrailing to become false (stop complete) */
  function waitForTrailingStop(timeoutMs = 10000) {
    return new Promise((resolve) => {
      // Already stopped
      if (!$userVehicleTrailing) { resolve(true); return }
      const unsub = userVehicleTrailing.subscribe((trailing) => {
        if (!trailing) {
          unsub()
          // Small tick to let everything settle
          setTimeout(() => resolve(true), 50)
        }
      })
      // Safety timeout so we don't hang forever
      setTimeout(() => { unsub(); resolve(false) }, timeoutMs)
    })
  }

  function stopTrailing() {
    commands.trail.stop()
  }

  // Elapsed time display for trailing
  let elapsedText = ""
  let elapsedInterval = null

  $: if ($userVehicleTrailing && !elapsedInterval) {
    elapsedInterval = setInterval(updateElapsed, 1000)
  } else if (!$userVehicleTrailing && elapsedInterval) {
    clearInterval(elapsedInterval)
    elapsedInterval = null
    elapsedText = ""
  }

  function updateElapsed() {
    if (!$currentTrailStore?.start_time) return
    const start = new Date($currentTrailStore.start_time).getTime()
    const diff = Math.floor((Date.now() - start) / 1000)
    const m = Math.floor(diff / 60)
    const s = diff % 60
    elapsedText = `${m}:${s.toString().padStart(2, "0")}`
  }

  function handleBackToDashboard() {
    dispatch("requestExit")
  }

  function toggleExpanded() {
    isExpanded = !isExpanded
  }

  function dropPrimaryMarker() {
    const coordinates = $userVehicleStore.coordinates
    if (coordinates) {
      locationMarkerStore.set(coordinates)
    } else {
      toast.error("Unable to get your current location")
    }
  }

  function dropExtraMarker(marker) {
    const coordinates = $userVehicleStore.coordinates
    if (coordinates) {
      extraLocationMarkerStore.drop(coordinates, marker)
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

  <!-- ── Top-right column: dropdown + marker grid stacked ── -->
  <div class="fixed right-4 top-4 z-20 flex flex-col items-end gap-3">

    <!-- Dropdown menu column -->
    <div class="flex flex-col items-end">
      <!-- Chevron toggle -->
      <button
        class="top-button btn {isCircular
          ? 'btn-circle'
          : 'btn-square'} btn-lg bg-white hover:bg-opacity-90"
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
        class="mt-3 flex origin-top flex-col items-end space-y-3 transition-all duration-700 ease-in-out {isExpanded
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

        <!-- Locate Home Button -->
        <button
          class="menu-button btn {isCircular
            ? 'btn-circle'
            : 'btn-square'} btn-lg bg-white hover:bg-opacity-90"
          on:click={handleLocateHome}
        >
          <Home size={24} />
        </button>

        <!-- ══════════════════════════════════════ -->
        <!-- TRAIL BUTTON                            -->
        <!-- ══════════════════════════════════════ -->

          <div class="trail-btn-row-a">
            {#if $userVehicleTrailing}
              <!-- Pause / Resume -->
              <button
                class="menu-button btn btn-circle pause-btn-a"
                class:pause-active={$trailPausedStore}
                on:click={() => $trailPausedStore ? resumeTrailing() : pauseTrailing()}
                title={$trailPausedStore ? "Resume trail" : "Pause trail"}
              >
                {#if $trailPausedStore}
                  <Play size={18} />
                {:else}
                  <Pause size={18} />
                {/if}
              </button>
            {/if}

            <div class="relative">
              <button
                class="menu-button btn {isCircular
                  ? 'btn-circle'
                  : 'btn-square'} btn-lg {$userVehicleTrailing
                  ? 'trailing-active'
                  : ''}"
                on:click={() => $userVehicleTrailing ? stopTrailing() : toggleTrailing()}
              >
                {#if $userVehicleTrailing}
                  <!-- Animated trail icon - plays while trailing, pauses when paused -->
                  <svg
                    width="36px"
                    height="36px"
                    viewBox="0 0 32 32"
                    class="trail-draw-a"
                    class:trail-draw-paused={$trailPausedStore}
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M30.165 30.887c-1.604 0.076-21.522-0.043-21.522-0.043-12.101-12.151 18.219-16.173-0.521-26.154l-1.311 1.383-1.746-4.582 5.635 0.439-1.128 1.267c23.438 6.83-3.151 19.631 20.594 27.69v0z"
                    ></path>
                  </svg>
                {:else}
                  <svg
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
                {/if}
              </button>

              {#if showBadge}
                <!-- NOTE: Badge currently calls stopTrailing() for quick stop.
                     To re-enable trail info modal, change on:click to {openTrailInfoModal} -->
                <button
                  class="trail-status-badge {$trailPausedStore ? 'amber' : badgeColor}"
                  on:click={() => $userVehicleTrailing ? stopTrailing() : openTrailInfoModal()}
                  title={$userVehicleTrailing ? "Stop trailing" : "Click for trail details"}
                >
                  {#if $trailPausedStore}
                    <Pause size={10} />
                  {:else if hasUnsyncedChanges}
                    <WifiOff size={12} />
                  {:else}
                    <Wifi size={12} />
                  {/if}
                  <span>{totalTrailPoints}</span>
                </button>
              {/if}

              <!-- Status pill underneath trailing button -->
              {#if $userVehicleTrailing}
                <button
                  class="trail-status-pill-a"
                  class:paused-pill-a={$trailPausedStore}
                  on:click={() => stopTrailing()}
                  title="Stop trailing"
                >
                  <span class="pill-a-text">{$trailPausedStore ? 'Paused' : 'Trailing'}</span>
                </button>
              {/if}
            </div>
          </div>
      </div>
    </div>

    <!-- Marker grid: below the dropdown column -->
    <div class="marker-grid-panel">
      <!-- Primary marker -->
      <button
        class="marker-slot btn btn-circle"
        on:click={dropPrimaryMarker}
        title="Drop {defaultMarker?.name || 'Default'} marker"
      >
        <div class="marker-icon-container fan-icon">
          {#if defaultMarker.id === "default"}
            <IconSVG icon="mapbox-marker" size="26px" />
          {:else if defaultMarker.class === "custom-svg"}
            <IconSVG icon={defaultMarker.id} size="26px" />
          {:else if defaultMarker.class?.startsWith("ionic-")}
            <ion-icon name={defaultMarker.id} style="font-size: 26px;"></ion-icon>
          {:else if defaultMarker.class?.startsWith("at-")}
            <i class={`${defaultMarker.class}`} style="font-size: 26px;"></i>
          {:else}
            <MapPin size={20} />
          {/if}
        </div>
      </button>

      <!-- Extra markers -->
      {#each extraMarkers as extraMarker}
        <button
          class="marker-slot btn btn-circle"
          on:click={() => dropExtraMarker(extraMarker)}
          title="Drop {extraMarker?.name || 'Marker'}"
        >
          <div class="marker-icon-container fan-icon">
            {#if extraMarker?.class === "custom-svg" || extraMarker?.class?.startsWith("custom-svg")}
              <IconSVG icon={extraMarker.id} size="26px" />
            {:else if extraMarker?.class?.startsWith("ionic-")}
              <ion-icon name={extraMarker.id} style="font-size: 26px;"></ion-icon>
            {:else if extraMarker?.class?.startsWith("at-")}
              <i class={`${extraMarker.class}`} style="font-size: 26px;"></i>
            {:else}
              <MapPin size={20} />
            {/if}
          </div>
        </button>
      {/each}

      <!-- Add / Edit markers button -->
      <button
        class="marker-slot marker-slot-add btn btn-circle"
        on:click={() => dispatch('openMarkerSettings')}
        title="Add or edit quick-drop markers"
      >
        <Plus size={20} />
      </button>
    </div>

  </div>
</div>

<!-- Resume confirmation modal -->
{#if showResumeConfirm}
  <div class="resume-modal-overlay" on:click={() => (showResumeConfirm = false)}>
    <div class="resume-modal" on:click|stopPropagation>
      <!-- Header -->
      <div class="resume-modal-header">
        <h3 class="text-base font-semibold text-white">Resume trail?</h3>
      </div>

      <!-- Body -->
      <div class="resume-modal-body">
        <div class="flex flex-col items-center gap-4 py-3 text-center">
          <AlertTriangle size={42} class="text-amber-400" />
          <div>
            <p class="mb-2 font-semibold text-white/90">
              You've moved <strong class="text-amber-300">{resumeDistanceText}</strong> from your pause point.
            </p>
            <p class="text-sm text-white/70">
              A straight line will connect the gap if you resume.
            </p>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="resume-modal-footer">
        <div class="resume-modal-actions">
          <button class="resume-modal-btn primary" on:click={confirmResume}>
            Resume Trail
          </button>
          <button class="resume-modal-btn danger" on:click={endAndStartNew}>
            End &amp; Restart
          </button>
        </div>
        <button class="resume-modal-cancel" on:click={() => (showResumeConfirm = false)}>
          Cancel
        </button>
      </div>
    </div>
  </div>
{/if}

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

  /* Trailing active state — always red, even when paused */
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

  .trail-status-badge.green, .trail-status-badge.blue {
    background: linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%);
    color: white;
    box-shadow: 0 2px 8px rgba(96, 165, 250, 0.4);
  }

  .trail-status-badge.green:hover, .trail-status-badge.blue:hover {
    transform: scale(1.05);
    box-shadow: 0 4px 12px rgba(96, 165, 250, 0.6);
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

  .trail-status-badge.amber {
    background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
    color: white;
    box-shadow: 0 2px 8px rgba(245, 158, 11, 0.4);
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

  /* ── Marker Grid Panel (below dropdown column) ── */
  .marker-grid-panel {
    display: grid;
    grid-template-columns: repeat(2, 44px);
    gap: 8px;
    padding: 8px;
    background: rgba(0, 0, 0, 0.65);
    border: 2px solid rgba(247, 219, 92, 0.4);
    border-radius: 16px;
    justify-self: end;
  }

  /* Single marker: single column */
  .marker-grid-panel:has(.marker-slot:only-child) {
    grid-template-columns: 44px;
  }

  .marker-slot {
    width: 44px;
    height: 44px;
    min-height: 44px;
    background-color: #f7db5c;
    border: 2px solid #000000;
    color: #000000;
    transition: all 0.2s ease;
  }

  .marker-slot:hover {
    background-color: rgba(0, 0, 0, 0.5);
    color: #f7db5c;
  }

  .marker-slot-add {
    background-color: rgba(255, 255, 255, 0.12);
    border: 2px dashed rgba(247, 219, 92, 0.55);
    color: rgba(247, 219, 92, 0.85);
  }

  .marker-slot-add:hover {
    background-color: rgba(247, 219, 92, 0.2);
    border-style: solid;
    color: #f7db5c;
  }

  .fan-icon {
    width: 26px;
    height: 26px;
  }

  /* ═══════════════════════════════════════ */
  /*  VARIATION A – inline pause + animated stop */
  /* ═══════════════════════════════════════ */
  .trail-btn-row-a {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
  }

  .pause-btn-a {
    width: 44px !important;
    height: 44px !important;
    min-height: 44px !important;
    padding: 0;
  }

  .pause-btn-a.pause-active {
    background-color: #f59e0b !important;
    border-color: #000 !important;
    color: #000 !important;
    animation: pausePulse 2s ease-in-out infinite;
  }

  /* Animated trail icon (line-draw) */
  .trailing-active .trail-draw-a {
    opacity: 0.55;
  }
  .trailing-active .trail-draw-a path {
    stroke: currentColor;
    stroke-width: 1.5;
    fill: currentColor;
    stroke-dasharray: 105;
    animation: drawA 2s linear infinite, fillUnfillA 1.5s ease-in-out infinite;
  }

  /* Freeze animation when paused */
  .trailing-active .trail-draw-a.trail-draw-paused {
    opacity: 0.35;
  }
  .trailing-active .trail-draw-a.trail-draw-paused path {
    animation-play-state: paused;
  }

  @keyframes drawA {
    0% { stroke-dashoffset: 105; }
    100% { stroke-dashoffset: 0; }
  }

  @keyframes fillUnfillA {
    0%, 100% { fill-opacity: 0; }
    50% { fill-opacity: 1; }
  }

  @keyframes pausePulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }

  /* Status pill underneath A's trailing button */
  .trail-status-pill-a {
    position: absolute;
    bottom: -10px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f7db5c;
    border: 1.5px solid #000;
    border-radius: 10px;
    padding: 2px 8px;
    z-index: 12;
    white-space: nowrap;
    animation: pillPulseA 1.5s ease-in-out infinite;
    height: 18px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .trail-status-pill-a:hover {
    filter: brightness(0.95);
  }

  .trail-status-pill-a.paused-pill-a {
    background: #f59e0b;
  }

  .pill-a-text {
    font-size: 8px;
    font-weight: 900;
    color: #000;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    line-height: 1;
  }

  @keyframes pillPulseA {
    0%, 100% { opacity: 0.7; transform: translateX(-50%) scale(1); }
    50% { opacity: 1; transform: translateX(-50%) scale(1.05); }
  }

  /* ── Resume confirmation modal ── */
  .resume-modal-overlay {
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
    z-index: 50;
    animation: resumeFadeIn 0.2s ease-out;
  }

  .resume-modal {
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(20px);
    border-radius: 16px;
    max-width: 380px;
    width: 90%;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.1);
    animation: resumeSlideIn 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
    overflow: hidden;
  }

  .resume-modal-header {
    padding: 16px 18px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    background: linear-gradient(
      135deg,
      rgba(251, 191, 36, 0.15) 0%,
      rgba(245, 158, 11, 0.1) 100%
    );
  }

  .resume-modal-body {
    padding: 16px 18px;
  }

  .resume-modal-footer {
    padding: 14px 18px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    flex-direction: column;
    gap: 8px;
    background: rgba(0, 0, 0, 0.3);
  }

  .resume-modal-actions {
    display: flex;
    gap: 10px;
    width: 100%;
  }

  .resume-modal-btn {
    flex: 1;
    padding: 11px 10px;
    border-radius: 10px;
    font-weight: 600;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    white-space: nowrap;
  }

  .resume-modal-cancel {
    width: 100%;
    padding: 8px;
    border-radius: 8px;
    font-weight: 500;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
    background: transparent;
    color: rgba(255, 255, 255, 0.5);
    text-align: center;
  }

  .resume-modal-cancel:hover {
    color: rgba(255, 255, 255, 0.8);
    background: rgba(255, 255, 255, 0.05);
  }

  .resume-modal-btn.primary {
    background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
    color: white;
  }

  .resume-modal-btn.primary:hover {
    background: linear-gradient(135deg, #16a34a 0%, #15803d 100%);
    transform: translateY(-1px);
  }

  .resume-modal-btn.danger {
    background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
    color: white;
  }

  .resume-modal-btn.danger:hover {
    background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
    transform: translateY(-1px);
  }

  @keyframes resumeFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes resumeSlideIn {
    from {
      transform: translateY(-20px) scale(0.95);
      opacity: 0;
    }
    to {
      transform: translateY(0) scale(1);
      opacity: 1;
    }
  }

  @media (max-width: 640px) {
    .resume-modal {
      width: 95%;
      max-width: 340px;
    }

    .resume-modal-btn {
      font-size: 12px;
      padding: 10px 8px;
    }
  }
</style>
