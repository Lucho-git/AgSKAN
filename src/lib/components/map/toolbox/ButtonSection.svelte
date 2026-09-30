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
  import { profileStore } from "$lib/stores/profileStore"
  import { commands } from "$lib/stores/commandStore"
  import {
    currentTrailStore,
    pendingCoordinatesStore,
    pendingClosuresStore,
    trailPausedStore,
    trailClosingStore,
    trailStartingStore,
  } from "$lib/stores/currentTrailStore"
  import { toast } from "svelte-sonner"

  import { browser } from "$app/environment"
  import { onMount, onDestroy } from "svelte"
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
  } from "lucide-svelte"
  import IconSVG from "$lib/components/general/IconSVG.svelte"
  import { getAllMarkers } from "$lib/data/markerDefinitions"
  import { resolveDefaultMarkerPreference } from "$lib/utils/defaultMarkerPreference"
  export let pendingCoordinates = []
  export let pendingClosures = []

  let isCircular = true
  let isRefreshing = false
  let isExpanded = false

  // View-only guests (temporary invite links) can't record or place anything.
  $: isViewer = $profileStore?.user_type === "viewer"

  // ── Guest-mode tooltip ──
  // Guests keep the yellow buttons visible, but pin drop + trail recording
  // are disabled — tapping them explains why with a small tooltip.
  /** @type {{ text: string, x: number, y: number } | null} */
  let guestTip = null
  /** @type {ReturnType<typeof setTimeout> | null} */
  let guestTipTimer = null

  /** @param {MouseEvent} event */
  function showGuestTip(event, text = "Guest mode — view only") {
    const target = /** @type {HTMLElement | null} */ (event.currentTarget)
    if (!target) return
    const rect = target.getBoundingClientRect()
    guestTip = { text, x: rect.left - 12, y: rect.top + rect.height / 2 }
    if (guestTipTimer) clearTimeout(guestTipTimer)
    guestTipTimer = setTimeout(() => (guestTip = null), 2200)
  }

  onDestroy(() => {
    if (guestTipTimer) clearTimeout(guestTipTimer)
  })

  // ── UI variation ──
  // Locked to A. Other variations (B = bottom-right position) removed.
  // To experiment again, restore cycleVariation() and variation templates from git history.

  // ── Marker button style ──
  // Locked to Yellow (trail below). Other variations removed.

  // ── "Placed!" flash badge state ──
  // Tracks which marker key just got dropped (null = none)
  /** @type {string | null} */
  let flashedMarkerKey = null
  /** @type {ReturnType<typeof setTimeout> | null} */
  let flashTimeout = null

  /** @param {string} key */
  function flashMarker(key) {
    if (flashTimeout) clearTimeout(flashTimeout)
    flashedMarkerKey = key
    flashTimeout = setTimeout(() => {
      flashedMarkerKey = null
      flashTimeout = null
    }, 1500)
  }

  // ── Static badge pulse on button click ──
  /** @type {string | null} */
  let pulsedBadge = null
  /** @type {ReturnType<typeof setTimeout> | null} */
  let pulseTimeout = null

  /** @param {string} badgeId */
  function pulseBadge(badgeId) {
    if (pulseTimeout) clearTimeout(pulseTimeout)
    pulsedBadge = null
    // Force reflow so re-adding the class triggers animation again
    requestAnimationFrame(() => {
      pulsedBadge = badgeId
      pulseTimeout = setTimeout(() => {
        pulsedBadge = null
        pulseTimeout = null
      }, 400)
    })
  }

  // Total marker count (1 default + extras)
  $: totalMarkerCount = 1 + extraMarkers.length

  const dispatch = createEventDispatcher()

  onMount(async () => {
    setTimeout(() => {
      isExpanded = true
    }, 200)
  })

  // Make defaultMarker reactive to userSettingsStore changes
  $: defaultMarker = (() => {
    const storeMarker = resolveDefaultMarkerPreference(
      $userSettingsStore?.defaultMarker,
    )
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

  function resumeTrailing() {
    // Pause no longer warns about connector lines: the transfer stretch is
    // recorded and shown as a dotted "ant line", so resuming just continues.
    commands.trail.resume()
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
      flashMarker("primary")
    } else {
      toast.error("Unable to get your current location")
    }
  }

  function dropExtraMarker(marker) {
    const coordinates = $userVehicleStore.coordinates
    if (coordinates) {
      extraLocationMarkerStore.drop(coordinates, marker)
      flashMarker(`extra-${marker.id}-${marker.class}`)
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
  <!-- Back to Dashboard Button, Top Left (guests: leads to their guest home) -->
  <button
    class="back-button btn {isCircular
      ? 'btn-circle'
      : 'btn-square'} btn-lg absolute left-4 top-4 z-10"
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
    <!-- Chevron row: compact marker grid (left) + chevron toggle (right) -->
    <div class="flex items-start gap-3">
      {#if totalMarkerCount >= 3}
        <!-- Compact 2-col grid to left of chevron -->
        <div class="marker-grid-panel">
          <button
            class="marker-slot btn btn-circle"
            class:marker-just-dropped={flashedMarkerKey === "primary"}
            class:guest-disabled={isViewer}
            on:click={(event) => {
              if (isViewer) {
                showGuestTip(event, "Guest mode — pins are disabled")
                return
              }
              dropPrimaryMarker()
            }}
            title="Drop {defaultMarker?.name || 'Default'} marker"
          >
            <div class="marker-icon-container fan-icon">
              {#if defaultMarker.id === "default"}
                <IconSVG icon="mapbox-marker" size="22px" />
              {:else if defaultMarker.class === "custom-svg"}
                <IconSVG icon={defaultMarker.id} size="22px" />
              {:else if defaultMarker.class?.startsWith("ionic-")}
                <ion-icon name={defaultMarker.id} style="font-size: 22px;"
                ></ion-icon>
              {:else if defaultMarker.class?.startsWith("at-")}
                <i class={`${defaultMarker.class}`} style="font-size: 22px;"
                ></i>
              {:else}
                <MapPin size={18} />
              {/if}
            </div>
          </button>
          {#each extraMarkers as extraMarker}
            {@const eKey = `extra-${extraMarker.id}-${extraMarker.class}`}
            <button
              class="marker-slot btn btn-circle"
              class:marker-just-dropped={flashedMarkerKey === eKey}
              class:guest-disabled={isViewer}
              on:click={(event) => {
                if (isViewer) {
                  showGuestTip(event, "Guest mode — pins are disabled")
                  return
                }
                dropExtraMarker(extraMarker)
              }}
              title="Drop {extraMarker?.name || 'Marker'}"
            >
              <div class="marker-icon-container fan-icon">
                {#if extraMarker?.id === "default" || extraMarker?.class === "default"}
                  <IconSVG icon="mapbox-marker" size="22px" />
                {:else if extraMarker?.class === "custom-svg" || extraMarker?.class?.startsWith("custom-svg")}
                  <IconSVG icon={extraMarker.id} size="22px" />
                {:else if extraMarker?.class?.startsWith("ionic-")}
                  <ion-icon name={extraMarker.id} style="font-size: 22px;"
                  ></ion-icon>
                {:else if extraMarker?.class?.startsWith("at-")}
                  <i class={`${extraMarker.class}`} style="font-size: 22px;"
                  ></i>
                {:else}
                  <MapPin size={18} />
                {/if}
              </div>
            </button>
          {/each}
          <button
            class="marker-slot marker-slot-add btn btn-circle"
            on:click={() => dispatch("openMarkerSettings")}
            title="Add or edit quick-drop markers"
          >
            <Plus size={18} />
          </button>
        </div>
      {/if}

      <!-- Dropdown menu column -->
      <div class="flex flex-col items-end">
        <!-- Chevron toggle -->
        <button
          class="top-button btn {isCircular
            ? 'btn-circle'
            : 'btn-square'} btn-lg"
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
            : 'h-50 scale-0 overflow-hidden opacity-0'} trail-below"
        >
          <!-- Refresh Map Button -->
          <div class="relative">
            <button
              class="menu-button btn {isCircular
                ? 'btn-circle'
                : 'btn-square'} btn-lg bg-white hover:bg-opacity-90 {isRefreshing
                ? 'refreshing'
                : ''}"
              on:click={() => {
                handleRefresh()
                pulseBadge("refresh")
              }}
              disabled={isRefreshing}
            >
              <RotateCcw size={24} class={isRefreshing ? "spinning" : ""} />
            </button>
            <span class="static-badge" class:pulse={pulsedBadge === "refresh"}
              >Refresh</span
            >
          </div>

          <!-- Locate Home Button -->
          <div class="relative">
            <button
              class="menu-button btn {isCircular
                ? 'btn-circle'
                : 'btn-square'} btn-lg bg-white hover:bg-opacity-90"
              on:click={() => {
                handleLocateHome()
                pulseBadge("home")
              }}
            >
              <Home size={24} />
            </button>
            <span class="static-badge" class:pulse={pulsedBadge === "home"}
              >Home</span
            >
          </div>

          <!-- ══════════════════════════════════════ -->
          <!-- TRAIL BUTTON (guests see it greyed out)  -->
          <!-- ══════════════════════════════════════ -->
          <div class="trail-btn-row-a">
            {#if $userVehicleTrailing}
              <!-- Pause / Resume -->
              <button
                class="menu-button pause-btn-a btn btn-circle"
                class:pause-active={$trailPausedStore}
                on:click={() =>
                  $trailPausedStore ? resumeTrailing() : pauseTrailing()}
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
                class:guest-disabled={isViewer}
                on:click={(event) => {
                  if (isViewer) {
                    showGuestTip(event, "Guest mode — recording is disabled")
                    return
                  }
                  if ($userVehicleTrailing) {
                    stopTrailing()
                  } else {
                    toggleTrailing()
                    pulseBadge("record")
                  }
                }}
                disabled={!isViewer &&
                  ($trailClosingStore || $trailStartingStore)}
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
                <button
                  class="trail-status-badge {$trailPausedStore
                    ? 'amber'
                    : badgeColor}"
                  on:click={() => openTrailInfoModal()}
                  title={hasUnsyncedChanges
                    ? "Unsynced data — tap for details"
                    : "Trail details"}
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
                  disabled={$trailClosingStore || $trailStartingStore}
                  title="Stop trailing"
                >
                  <span class="pill-a-text"
                    >{$trailPausedStore ? "Paused" : "Trailing"}</span
                  >
                </button>
              {/if}

              {#if !$userVehicleTrailing}
                <span
                  class="static-badge"
                  class:pulse={pulsedBadge === "record"}>Record</span
                >
              {/if}
            </div>
          </div>

          <!-- ── Divider + Marker buttons (only when < 3 markers) ── -->
          {#if totalMarkerCount < 3}
            <div class="dropdown-divider"></div>

            <div class="marker-grid">
              <div class="marker-btn-wrap">
                <button
                  class="menu-button btn {isCircular
                    ? 'btn-circle'
                    : 'btn-square'} btn-lg"
                  class:marker-just-dropped={flashedMarkerKey === "primary"}
                  class:guest-disabled={isViewer}
                  on:click={(event) => {
                    if (isViewer) {
                      showGuestTip(event, "Guest mode — pins are disabled")
                      return
                    }
                    dropPrimaryMarker()
                  }}
                  title="Drop {defaultMarker?.name || 'Default'} marker"
                >
                  <div class="marker-icon-container">
                    {#if defaultMarker.id === "default"}
                      <IconSVG icon="mapbox-marker" size="26px" />
                    {:else if defaultMarker.class === "custom-svg"}
                      <IconSVG icon={defaultMarker.id} size="26px" />
                    {:else if defaultMarker.class?.startsWith("ionic-")}
                      <ion-icon name={defaultMarker.id} style="font-size: 26px;"
                      ></ion-icon>
                    {:else if defaultMarker.class?.startsWith("at-")}
                      <i
                        class={`${defaultMarker.class}`}
                        style="font-size: 26px;"
                      ></i>
                    {:else}
                      <MapPin size={20} />
                    {/if}
                  </div>
                </button>
                {#if flashedMarkerKey === "primary"}
                  <span class="marker-flash-badge">Placed!</span>
                {/if}
              </div>
              {#each extraMarkers as extraMarker}
                {@const eKey = `extra-${extraMarker.id}-${extraMarker.class}`}
                <div class="marker-btn-wrap">
                  <button
                    class="menu-button btn {isCircular
                      ? 'btn-circle'
                      : 'btn-square'} btn-lg"
                    class:marker-just-dropped={flashedMarkerKey === eKey}
                    class:guest-disabled={isViewer}
                    on:click={(event) => {
                      if (isViewer) {
                        showGuestTip(event, "Guest mode — pins are disabled")
                        return
                      }
                      dropExtraMarker(extraMarker)
                    }}
                    title="Drop {extraMarker?.name || 'Marker'}"
                  >
                    <div class="marker-icon-container">
                      {#if extraMarker?.id === "default" || extraMarker?.class === "default"}
                        <IconSVG icon="mapbox-marker" size="26px" />
                      {:else if extraMarker?.class === "custom-svg" || extraMarker?.class?.startsWith("custom-svg")}
                        <IconSVG icon={extraMarker.id} size="26px" />
                      {:else if extraMarker?.class?.startsWith("ionic-")}
                        <ion-icon name={extraMarker.id} style="font-size: 26px;"
                        ></ion-icon>
                      {:else if extraMarker?.class?.startsWith("at-")}
                        <i
                          class={`${extraMarker.class}`}
                          style="font-size: 26px;"
                        ></i>
                      {:else}
                        <MapPin size={20} />
                      {/if}
                    </div>
                  </button>
                  {#if flashedMarkerKey === eKey}
                    <span class="marker-flash-badge">Placed!</span>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
</div>

<!-- Guest-mode tooltip -->
{#if guestTip}
  <div
    class="guest-tip fixed z-[80]"
    style="left: {guestTip.x}px; top: {guestTip.y}px;"
  >
    {guestTip.text}
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
    background-color: rgba(0, 0, 0, 0.5);
    color: #f7db5c;
  }

  .menu-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* Guest mode: buttons stay visible but greyed out */
  .guest-disabled {
    opacity: 0.45;
    filter: grayscale(0.9);
    cursor: not-allowed;
  }

  .guest-tip {
    transform: translate(-100%, -50%);
    background: rgba(0, 0, 0, 0.85);
    color: #fde68a;
    border: 1px solid rgba(245, 158, 11, 0.45);
    padding: 6px 10px;
    border-radius: 8px;
    font-size: 12px;
    white-space: nowrap;
    pointer-events: none;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  }

  /* Divider between dropdown actions and marker buttons */
  .dropdown-divider {
    width: 52px;
    height: 2px;
    background: rgba(0, 0, 0, 0.15);
    border-radius: 1px;
    align-self: center;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* ═══════════════════════════════════════════════════════ */
  /*  Marker grid — centers buttons & goes 2-col when >3   */
  /* ═══════════════════════════════════════════════════════ */
  .marker-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: center;
    align-self: flex-end; /* anchor to right edge like other buttons */
    width: 60px; /* fixed width — won't shift when trail row widens */
  }

  /* Wrapper for each marker button + flash badge */
  .marker-btn-wrap {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* ═══════════════════════════════════════════════════════ */
  /*  "Placed!" flash badge overlay                         */
  /* ═══════════════════════════════════════════════════════ */
  .marker-flash-badge {
    position: absolute;
    top: -6px;
    left: 50%;
    transform: translateX(-50%);
    background: #22c55e;
    color: #fff;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    padding: 2px 7px;
    border-radius: 6px;
    white-space: nowrap;
    pointer-events: none;
    z-index: 20;
    animation: flashBadge 1.5s ease forwards;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
    border: 1px solid #000;
  }

  @keyframes flashBadge {
    0% {
      opacity: 0;
      transform: translateX(-50%) translateY(4px) scale(0.8);
    }
    12% {
      opacity: 1;
      transform: translateX(-50%) translateY(0) scale(1.05);
    }
    20% {
      transform: translateX(-50%) translateY(0) scale(1);
    }
    75% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      transform: translateX(-50%) translateY(-6px) scale(0.9);
    }
  }

  /* Dim the button momentarily after placing */
  .marker-just-dropped {
    opacity: 0.55;
    pointer-events: none;
    transition: opacity 0.3s ease;
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

  /* Back button — yellow */
  .back-button {
    background-color: #f7db5c;
    border: 2px solid #000000;
    color: #000000;
  }

  .back-button:hover {
    background-color: rgba(0, 0, 0, 0.5);
    color: #f7db5c;
  }

  /* Top button — white glass */
  .top-button {
    background-color: rgba(255, 255, 255, 0.5);
    border: 2px solid #000000;
    color: #000000;
  }

  .top-button:hover {
    background-color: #f7db5c;
    color: #000000;
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
    z-index: 15;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .trail-status-badge.green,
  .trail-status-badge.blue {
    background: linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%);
    color: white;
    box-shadow: 0 2px 8px rgba(96, 165, 250, 0.4);
  }

  .trail-status-badge.green:hover,
  .trail-status-badge.blue:hover {
    transform: scale(1.05);
    box-shadow: 0 4px 12px rgba(96, 165, 250, 0.6);
  }

  .trail-status-badge.red {
    background: linear-gradient(135deg, #ff6b6b 0%, #ff8787 100%);
    color: white;
    box-shadow: 0 2px 8px rgba(255, 107, 107, 0.4);
    animation: agskan-pulse-badge 2s ease-in-out infinite;
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

  @keyframes agskan-pulse-badge {
    0%,
    100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.05);
    }
  }

  /* Static label pills (Home, Refresh, Drop) — matches trailing pill style */
  .static-badge {
    position: absolute;
    bottom: -4px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f7db5c;
    border: 1.5px solid #000;
    border-radius: 10px;
    padding: 2px 8px;
    z-index: 10;
    white-space: nowrap;
    height: 18px;
    pointer-events: none;
    font-size: 8px;
    font-weight: 900;
    color: #000;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    line-height: 1;
  }

  .static-badge.pulse {
    animation: pillClickPulse 0.4s ease-out;
  }

  @keyframes pillClickPulse {
    0% {
      transform: translateX(-50%) scale(1);
    }
    50% {
      transform: translateX(-50%) scale(1.15);
    }
    100% {
      transform: translateX(-50%) scale(1);
    }
  }

  /* Spinning animation for refresh icon */
  .menu-button :global(.spinning) {
    animation: agskan-spin 1s linear infinite;
  }

  @keyframes agskan-spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes agskan-draw {
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
      agskan-draw 10s linear infinite,
      fillUnfill 3s linear infinite;
  }

  .trailing-active {
    position: relative;
    overflow: visible !important;
  }

  /* ── Marker Grid Panel (to left of chevron button) ── */
  .marker-grid-panel {
    display: grid;
    grid-template-columns: repeat(2, 44px);
    gap: 8px;
    padding: 8px;
    background: rgba(0, 0, 0, 0.65);
    border: 2px solid rgba(247, 219, 92, 0.4);
    border-radius: 16px;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
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

  /* When variation 3 is active, move trail button below markers */
  :global(.trail-below) .trail-btn-row-a {
    order: 20;
  }

  :global(.trail-below) .dropdown-divider {
    order: 10;
  }

  :global(.trail-below) .marker-grid {
    order: 15;
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
    animation:
      drawA 2s linear infinite,
      fillUnfillA 1.5s ease-in-out infinite;
  }

  /* Freeze animation when paused */
  .trailing-active .trail-draw-a.trail-draw-paused {
    opacity: 0.35;
  }
  .trailing-active .trail-draw-a.trail-draw-paused path {
    animation-play-state: paused;
  }

  @keyframes drawA {
    0% {
      stroke-dashoffset: 105;
    }
    100% {
      stroke-dashoffset: 0;
    }
  }

  @keyframes fillUnfillA {
    0%,
    100% {
      fill-opacity: 0;
    }
    50% {
      fill-opacity: 1;
    }
  }

  @keyframes pausePulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.6;
    }
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
    0%,
    100% {
      opacity: 0.7;
      transform: translateX(-50%) scale(1);
    }
    50% {
      opacity: 1;
      transform: translateX(-50%) scale(1.05);
    }
  }

</style>
