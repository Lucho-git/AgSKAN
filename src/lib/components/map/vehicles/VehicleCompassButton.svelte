<!-- src/lib/components/map/vehicles/VehicleCompassButton.svelte -->
<!--
  Vehicle HUD hub: compass icon with speed arc, status ring,
  speed/wifi badges, vertical action menu, trail wave, and stats modal.
-->
<script>
  import { userVehicleStore, userVehicleTrailing } from "$lib/stores/vehicleStore"
  import {
    currentTrailStore,
    pendingCoordinatesStore,
    pendingClosuresStore,
  } from "$lib/stores/currentTrailStore"
  import {
    pendingMarkerChangesStore,
    pendingMarkerDeletionsStore,
  } from "$lib/stores/markerStore"
  import { clearAllPersistedData } from "$lib/services/db"
  import SVGComponents from "$lib/vehicles/index.js"
  import {
    Wifi,
    WifiOff,
    Database,
    X,
    AlertTriangle,
    MapPinned,
    Trash2,
  } from "lucide-svelte"

  /** Current calculated speed (km/h) passed from VehicleTracker */
  export let currentSpeed = 0
  /** Callback to open vehicle controls in the toolbox */
  export let onOpenVehicleControls = null
  /** Callback to reset map bearing to true north */
  export let onTrueNorth = null
  /** Callback to enter first person mode on a specific vehicle */
  export let onFirstPersonVehicle = null
  /** Callback to open flash signal panel */
  export let onFlashMe = null
  /** Callback to broadcast a message */
  export let onBroadcast = null
  /** List of vehicles for the first person picker */
  export let vehicles = []
  /** Current map bearing in degrees (0 = north) */
  export let mapBearing = 0

  // Compass north rotation: negative of map bearing so the indicator always points to true north
  $: compassRotation = -mapBearing

  $: vehicleType = $userVehicleStore.vehicle_marker?.type || "SimpleTractor"
  $: vehicleColor = $userVehicleStore.vehicle_marker?.bodyColor || "red"
  $: rawHeading = $userVehicleStore.heading || 0
  $: VehicleIcon = SVGComponents[vehicleType] || SVGComponents.SimpleTractor

  // ── Shortest-path rotation (fix 0° crossing) ──
  let cumulativeRotation = 0
  let prevRawHeading = 0

  $: {
    let delta = rawHeading - prevRawHeading
    if (delta > 180) delta -= 360
    if (delta < -180) delta += 360
    cumulativeRotation += delta
    prevRawHeading = rawHeading
  }

  // ── Speed logic ──
  $: speed = currentSpeed || 0

  // ── Trailing state ──
  $: isTrailing = $userVehicleTrailing

  // ── Wifi / signal strength ──
  const STALE_MS = 30000
  $: lastUpdate = $userVehicleStore.last_update
  $: isStale =
    !lastUpdate || Date.now() - new Date(lastUpdate).getTime() > STALE_MS
  $: timeSinceUpdate = lastUpdate
    ? Math.floor((Date.now() - new Date(lastUpdate).getTime()) / 1000)
    : 999

  // Signal bars: 3 = fresh (<5s), 2 = recent (<15s), 1 = aging (<30s), 0 = stale
  $: signalBars = isStale ? 0 : timeSinceUpdate < 5 ? 3 : timeSinceUpdate < 15 ? 2 : 1
  $: wifiBorderColor = signalBars >= 1 ? 'rgba(59,130,246,0.4)' : 'rgba(239,68,68,0.4)'
  $: barFill1 = signalBars >= 1 ? '#3b82f6' : 'rgba(255,255,255,0.2)'
  $: barFill2 = signalBars >= 2 ? '#3b82f6' : 'rgba(255,255,255,0.2)'
  $: barFill3 = signalBars >= 3 ? '#3b82f6' : 'rgba(255,255,255,0.2)'
  $: modalBarFills = [
    signalBars >= 1 ? '#3b82f6' : 'rgba(255,255,255,0.15)',
    signalBars >= 2 ? '#3b82f6' : 'rgba(255,255,255,0.15)',
    signalBars >= 3 ? '#3b82f6' : 'rgba(255,255,255,0.15)',
  ]

  // ── Trail data for badge & modal ──
  $: hasUnsyncedTrailChanges =
    $pendingCoordinatesStore.length > 0 || $pendingClosuresStore.length > 0
  $: hasUnsyncedMarkerChanges =
    $pendingMarkerChangesStore.size > 0 || $pendingMarkerDeletionsStore.size > 0
  $: hasUnsyncedChanges = hasUnsyncedTrailChanges || hasUnsyncedMarkerChanges
  $: totalTrailPoints = $currentTrailStore ? $currentTrailStore.path.length : 0
  $: unsyncedPoints = $pendingCoordinatesStore.length
  $: syncedPoints = totalTrailPoints - unsyncedPoints

  // ── Marker sync counts ──
  $: unsyncedMarkerChanges = $pendingMarkerChangesStore.size
  $: unsyncedMarkerDeletions = $pendingMarkerDeletionsStore.size
  $: totalUnsyncedMarkers = unsyncedMarkerChanges + unsyncedMarkerDeletions

  // ── Status ring color ──
  $: statusColor = isTrailing
    ? "#ef4444"
    : isStale
      ? "#6b7280"
      : speed > 2
        ? "#22c55e"
        : "#f59e0b"

  // ── Speed arc gauge (SVG) ──
  const MAX_SPEED = 60
  const RADIUS = 47
  const STROKE = 5
  const CENTER = 54
  const ARC_START_ANGLE = 135
  const ARC_SPAN = 270

  $: clampedSpeed = Math.min(speed, MAX_SPEED)
  $: arcAngle = (clampedSpeed / MAX_SPEED) * ARC_SPAN
  $: arcPath = describeArc(CENTER, CENTER, RADIUS, ARC_START_ANGLE, ARC_START_ANGLE + arcAngle)
  $: bgArcPath = describeArc(CENTER, CENTER, RADIUS, ARC_START_ANGLE, ARC_START_ANGLE + ARC_SPAN)

  $: arcColor = isTrailing
    ? "#eab308"
    : clampedSpeed < MAX_SPEED * 0.5
      ? "#22c55e"
      : clampedSpeed < MAX_SPEED * 0.8
        ? "#eab308"
        : "#ef4444"

  // ── Connection level label ──
  $: connectionLabel = signalBars === 3 ? 'Excellent' : signalBars === 2 ? 'Good' : signalBars === 1 ? 'Weak' : 'Offline'

  // ── Vehicle info for modal ──
  $: operationName = $userVehicleStore.operation_name || "No operation"
  $: swathWidth = $userVehicleStore.vehicle_marker?.swath || 0
  $: bodyColor = $userVehicleStore.vehicle_marker?.bodyColor || "Default"

  // ── Menus & modals ──
  let menuOpen = false
  let showStatsModal = false
  let vehiclePickerOpen = false
  let broadcastPickerOpen = false
  let purging = false

  const broadcastMessages = [
    "Gone for lunch",
    "Filling up",
    "Taking a break",
    "Heading home",
    "Stuck, need help",
    "On my way",
    "Finished this paddock",
    "Waiting at gate",
  ]

  const actions = [
    { label: "Edit Vehicle" },
    { label: "First Person View" },
    { label: "Broadcast Message" },
    { label: "Flash Signal" },
    { label: "Align North" },
  ]

  function handleMainClick() {
    if (vehiclePickerOpen) {
      vehiclePickerOpen = false
      return
    }
    if (broadcastPickerOpen) {
      broadcastPickerOpen = false
      return
    }
    menuOpen = !menuOpen
  }

  function handleActionClick(label) {
    menuOpen = false
    switch (label) {
      case "Edit Vehicle":
        if (onOpenVehicleControls) onOpenVehicleControls()
        break
      case "First Person View":
        // Open vehicle picker instead of toggling directly
        vehiclePickerOpen = true
        break
      case "Flash Signal":
        if (onFlashMe) onFlashMe()
        break
      case "Align North":
        if (onTrueNorth) onTrueNorth()
        break
      case "Broadcast Message":
        broadcastPickerOpen = true
        break
    }
  }

  function handleVehiclePick(vehicleId) {
    vehiclePickerOpen = false
    if (onFirstPersonVehicle) onFirstPersonVehicle(vehicleId)
  }

  function handleBroadcastPick(message) {
    broadcastPickerOpen = false
    if (onBroadcast) onBroadcast(message)
  }

  function handleLongPress() {
    if (onOpenVehicleControls) onOpenVehicleControls()
  }

  function openStatsModal() {
    showStatsModal = true
  }

  function closeStatsModal() {
    showStatsModal = false
  }

  async function purgeAllData() {
    purging = true
    try {
      // 1. Clear all IndexedDB tables (coordinates, closures, markers)
      await clearAllPersistedData()

      // 2. Clear in-memory stores
      pendingCoordinatesStore.set([])
      pendingClosuresStore.clear()
      pendingMarkerChangesStore.set(new Set())
      pendingMarkerDeletionsStore.set(new Set())
      currentTrailStore.set(null)
      userVehicleTrailing.set(false)

      console.log("🗑️ All queued data purged")
    } catch (e) {
      console.error("❌ Purge failed:", e)
    } finally {
      purging = false
    }
  }

  // ── Helpers ──
  function polarToCartesian(cx, cy, r, angleDeg) {
    const rad = ((angleDeg - 90) * Math.PI) / 180
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
  }

  function describeArc(cx, cy, r, startAngle, endAngle) {
    if (endAngle - startAngle < 0.5) return ""
    const start = polarToCartesian(cx, cy, r, endAngle)
    const end = polarToCartesian(cx, cy, r, startAngle)
    const largeArc = endAngle - startAngle > 180 ? 1 : 0
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`
  }

  // ── Long-press detection ──
  let pressTimer = null
  function onPointerDown() {
    pressTimer = setTimeout(() => {
      handleLongPress()
      pressTimer = null
    }, 500)
  }
  function onPointerUp() {
    if (pressTimer) {
      clearTimeout(pressTimer)
      pressTimer = null
      handleMainClick()
    }
  }
  function onPointerLeave() {
    if (pressTimer) {
      clearTimeout(pressTimer)
      pressTimer = null
    }
  }
</script>

<!-- HUD Container -->
<div class="fixed bottom-4 left-4 z-50" style="width: 110px; height: 110px;">

  <!-- ── Action Buttons (slide up, anchored to the right of the bubble) ── -->
  {#if !vehiclePickerOpen && !broadcastPickerOpen}
    {#each actions as action, i}
      <button
        class="hub-action absolute flex items-center gap-3 rounded-full border border-white/20 bg-black/85 backdrop-blur shadow-lg transition-all duration-300 ease-out"
        class:hub-action-open={menuOpen}
        style="
          height: 48px;
          padding: 0 18px 0 14px;
          white-space: nowrap;
          left: 120px;
          bottom: 35px;
          transform:
            {menuOpen
              ? `translateY(-${i * 56}px) scale(1)`
              : 'translateY(0px) scale(0.8)'};
          opacity: {menuOpen ? 1 : 0};
          transition-delay: {menuOpen ? i * 60 : (actions.length - i) * 30}ms;
          pointer-events: {menuOpen ? 'auto' : 'none'};
        "
        on:click|stopPropagation={() => handleActionClick(action.label)}
        title={action.label}
      >
        <span class="text-sm font-semibold text-white/90">{action.label}</span>
      </button>
    {/each}
  {/if}

  <!-- ── Vehicle Picker (bubble buttons, one per vehicle) ── -->
  {#if vehiclePickerOpen}
    {#each vehicles as v, i}
      <button
        class="hub-action hub-action-open absolute flex items-center gap-3 rounded-full border border-white/20 bg-black/85 backdrop-blur shadow-lg transition-all duration-300 ease-out"
        style="
          height: 48px;
          padding: 0 16px 0 8px;
          white-space: nowrap;
          left: 120px;
          bottom: 35px;
          transform: translateY(-{i * 56}px) scale(1);
          opacity: 1;
          transition-delay: {i * 60}ms;
          pointer-events: auto;
        "
        on:click|stopPropagation={() => handleVehiclePick(v.id)}
        title="Track {v.name}"
      >
        <div class="flex h-7 w-7 items-center justify-center rounded-full" style="background: {v.bodyColor}22; border: 1.5px solid {v.bodyColor}66;">
          <svelte:component this={SVGComponents[v.vehicleType] || SVGComponents.SimpleTractor} bodyColor={v.bodyColor} size="20px" />
        </div>
        <span class="text-sm font-semibold text-white/90">{v.name}</span>
        {#if v.isCurrentUser}
          <span class="ml-auto rounded-full bg-blue-500/20 px-2 py-0.5 text-[10px] font-bold text-blue-400">YOU</span>
        {/if}
      </button>
    {:else}
      <div
        class="hub-action hub-action-open absolute flex items-center gap-2 rounded-full border border-white/20 bg-black/85 backdrop-blur shadow-lg"
        style="height: 48px; padding: 0 18px; left: 120px; bottom: 35px;"
      >
        <span class="text-sm text-white/40">No vehicles online</span>
      </div>
    {/each}
  {/if}

  <!-- ── Broadcast Message Picker (bubble buttons, one per message) ── -->
  {#if broadcastPickerOpen}
    {#each broadcastMessages as msg, i}
      <button
        class="hub-action hub-action-open absolute flex items-center rounded-full border border-white/20 bg-black/85 backdrop-blur shadow-lg transition-all duration-300 ease-out"
        style="
          height: 44px;
          padding: 0 18px;
          white-space: nowrap;
          left: 120px;
          bottom: 35px;
          transform: translateY(-{i * 52}px) scale(1);
          opacity: 1;
          transition-delay: {i * 50}ms;
          pointer-events: auto;
        "
        on:click|stopPropagation={() => handleBroadcastPick(msg)}
        title={msg}
      >
        <span class="text-sm font-medium text-white/90">“{msg}”</span>
      </button>
    {/each}
  {/if}

  <!-- ── Main HUD Button ── -->
  <div
    class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
    style="width: 96px; height: 96px;"
  >
    <!-- Compass North Indicator (rotates with map bearing) -->
    <div
      class="compass-ring pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
      style="width: 120px; height: 120px; transform: translate(-50%, -50%) rotate({compassRotation}deg); transition: transform 0.3s ease-out;"
    >
      <!-- North triangle -->
      <svg class="absolute left-1/2 -translate-x-1/2" style="top: -4px;" width="18" height="14" viewBox="0 0 18 14">
        <polygon points="9,0 2,14 16,14" fill="#3b82f6" />
        <polygon points="9,2 4,12 14,12" fill="#60a5fa" opacity="0.6" />
      </svg>
      <!-- N label -->
      <span
        class="absolute left-1/2 -translate-x-1/2 font-black"
        style="top: 11px; font-size: 10px; color: #3b82f6; text-shadow: 0 1px 4px rgba(0,0,0,0.9), 0 0 8px rgba(59,130,246,0.4);"
      >N</span>
      <!-- Cardinal tick marks: E, S, W -->
      <span class="compass-tick" style="top: 50%; right: -2px; transform: translateY(-50%);">E</span>
      <span class="compass-tick" style="bottom: -2px; left: 50%; transform: translateX(-50%);">S</span>
      <span class="compass-tick" style="top: 50%; left: -2px; transform: translateY(-50%);">W</span>
      <!-- Minor tick marks at 45° intervals -->
      <span class="compass-tick-minor" style="top: 14%; right: 14%; transform: translate(50%, -50%);"></span>
      <span class="compass-tick-minor" style="bottom: 14%; right: 14%; transform: translate(50%, 50%);"></span>
      <span class="compass-tick-minor" style="bottom: 14%; left: 14%; transform: translate(-50%, 50%);"></span>
      <span class="compass-tick-minor" style="top: 14%; left: 14%; transform: translate(-50%, -50%);"></span>
    </div>

    <!-- Trailing: spinning red/yellow conic ring -->
    {#if isTrailing}
      <div class="trail-ring-spinner pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style="width: 104px; height: 104px;"
      />
    {/if}

    <!-- Speed Arc Gauge (SVG overlay) -->
    <svg
      class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
      width="108" height="108" viewBox="0 0 108 108"
    >
      {#if bgArcPath}
        <path d={bgArcPath} fill="none" stroke="white" stroke-opacity="0.15"
          stroke-width={STROKE} stroke-linecap="round" />
      {/if}
      {#if arcPath && !isTrailing}
        <path d={arcPath} fill="none" stroke={arcColor}
          stroke-width={STROKE} stroke-linecap="round"
          class="transition-all duration-500 ease-out" />
      {/if}
    </svg>

    <!-- Status Ring + Button -->
    <button
      class="relative flex h-full w-full items-center justify-center rounded-full border-[3px] bg-black/80 shadow-lg backdrop-blur transition-all duration-200"
      class:trail-glow={isTrailing}
      style="border-color: {statusColor}; box-shadow: 0 0 16px {statusColor}50;"
      on:pointerdown={onPointerDown}
      on:pointerup={onPointerUp}
      on:pointerleave={onPointerLeave}
      aria-label="Vehicle HUD"
      title="Tap: menu · Hold: vehicle setup"
    >
      <div
        class="flex items-center justify-center transition-transform duration-300 ease-out"
        style="transform: rotate({cumulativeRotation}deg);"
      >
        <svelte:component this={VehicleIcon} bodyColor={vehicleColor} size="48px" />
      </div>

      {#if speed > 2 && !isStale}
        <div
          class="absolute inset-0 rounded-full border-2 animate-ping pointer-events-none"
          style="border-color: {statusColor}; opacity: 0.3;"
        />
      {/if}
    </button>
  </div>

  <!-- ── Speed Badge (bottom-right) ── -->
  <div
    class="absolute flex items-center gap-1 rounded-full border border-white/20 bg-black/85 px-2 py-1 font-mono text-xs font-bold text-white backdrop-blur shadow-lg"
    style="bottom: -6px; right: -22px; min-width: 54px; justify-content: center;"
  >
    <span style="color: {arcColor};">{speed.toFixed(1)}</span>
    <span class="text-white/50 text-[10px]">km/h</span>
  </div>

  <!-- ── Wifi Signal Badge (top-right) — clickable to open stats modal ── -->
  <button
    class="absolute flex items-center gap-1.5 rounded-full border bg-black/85 px-2 py-1 backdrop-blur shadow-lg transition-all hover:scale-105"
    style="top: -6px; right: -22px; min-width: 44px; justify-content: center; border-color: {wifiBorderColor};"
    on:click|stopPropagation={openStatsModal}
    title="Signal: {signalBars}/3 bars — Tap for stats"
  >
    <!-- Signal bars SVG -->
    <svg width="18" height="15" viewBox="0 0 18 15" class="flex-shrink-0">
      <rect x="0" y="10" width="4" height="5" rx="0.7" fill={barFill1} />
      <rect x="5" y="6" width="4" height="9" rx="0.7" fill={barFill2} />
      <rect x="10" y="1" width="4" height="14" rx="0.7" fill={barFill3} />
    </svg>
    {#if isTrailing && totalTrailPoints > 0}
      <span class="font-mono text-[10px] font-bold text-blue-400">{totalTrailPoints}</span>
    {/if}
    {#if hasUnsyncedChanges}
      <span class="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
    {/if}
  </button>

  <!-- ── Backdrop to close menu ── -->
  {#if menuOpen || vehiclePickerOpen || broadcastPickerOpen}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="fixed inset-0 z-[-1]" on:click={() => { menuOpen = false; vehiclePickerOpen = false; broadcastPickerOpen = false; }} />
  {/if}
</div>

<!-- ══════════════════════════════════════ -->
<!-- CONNECTION STATUS MODAL                -->
<!-- ══════════════════════════════════════ -->
{#if showStatsModal}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="conn-modal-overlay" on:click={closeStatsModal}>
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="conn-modal" on:click|stopPropagation>
      <!-- Header -->
      <div
        class="conn-modal-header {isTrailing ? 'recording' : 'stopped'}"
      >
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <h3 class="text-base font-semibold text-white">Connection Status</h3>
            <div class="status-dot {isTrailing ? 'recording' : 'stopped'}"></div>
          </div>
          <button
            class="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-white/10 active:bg-white/20"
            on:click={closeStatsModal}
            aria-label="Close connection status"
          >
            <X size={16} class="text-white/70" />
          </button>
        </div>
      </div>

      <!-- Body -->
      <div class="conn-modal-body">
        <!-- Connection Level Banner -->
        <div class="connection-banner">
          <div class="connection-banner-row">
            {#if signalBars >= 1}
              <Wifi size={14} class="text-blue-400" />
            {:else}
              <WifiOff size={14} class="text-red-400" />
            {/if}
            <div class="connection-banner-content">
              <span class="connection-banner-label">Connection Level</span>
              <div class="flex items-center gap-2">
                <div class="flex items-end gap-0.5">
                  {#each [0, 1, 2] as idx}
                    <div
                      class="rounded-sm transition-colors"
                      style="width: 5px; height: {(idx + 1) * 5 + 3}px; background: {modalBarFills[idx]};"
                    />
                  {/each}
                </div>
                <span class="connection-banner-value">{connectionLabel}</span>
              </div>
            </div>
          </div>
          <div class="connection-banner-row">
            <Database size={14} class={isTrailing ? 'text-green-400' : 'text-white/40'} />
            <div class="connection-banner-content">
              <span class="connection-banner-label">Trail Recording</span>
              <span class="connection-banner-value">
                {isTrailing ? 'Active' : 'Not Recording'}
              </span>
            </div>
          </div>
        </div>

        <!-- Operation Info -->
        {#if operationName !== "No operation"}
          <div class="operation-banner">
            <div class="operation-label">Operation</div>
            <div class="operation-name">{operationName}</div>
          </div>
        {/if}

        <!-- Vehicle Info -->
        <div class="trail-properties">
          <div class="property-item">
            <span class="property-label">Vehicle Color</span>
            <span class="property-value">{bodyColor}</span>
          </div>
          <div class="property-item">
            <span class="property-label">Swath</span>
            <span class="property-value">{swathWidth}m</span>
          </div>
        </div>

        <!-- Trail Points: Synced / Queued -->
        <div class="compact-stats-section">
          <div class="section-label">
            <Database size={12} class="text-blue-400" />
            <span>Trail Points</span>
          </div>
          <div class="compact-stats-row">
            <div class="stat-compact">
              <Wifi size={14} class="text-green-400" />
              <div class="stat-compact-content">
                <span class="stat-compact-label">Synced</span>
                <span class="stat-compact-value">{syncedPoints}</span>
              </div>
            </div>
            <div class="stat-compact {hasUnsyncedTrailChanges ? 'warning' : ''}">
              <WifiOff
                size={14}
                class={hasUnsyncedTrailChanges ? 'text-amber-400' : 'text-white/40'}
              />
              <div class="stat-compact-content">
                <span class="stat-compact-label">Queued</span>
                <span class="stat-compact-value">{unsyncedPoints}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Markers: Synced / Queued -->
        <div class="compact-stats-section">
          <div class="section-label">
            <MapPinned size={12} class="text-purple-400" />
            <span>Markers</span>
          </div>
          <div class="compact-stats-row">
            <div class="stat-compact {unsyncedMarkerChanges ? 'warning' : ''}">
              <Wifi
                size={14}
                class={unsyncedMarkerChanges ? 'text-amber-400' : 'text-green-400'}
              />
              <div class="stat-compact-content">
                <span class="stat-compact-label">Changes</span>
                <span class="stat-compact-value">{unsyncedMarkerChanges}</span>
              </div>
            </div>
            <div class="stat-compact {unsyncedMarkerDeletions ? 'warning' : ''}">
              <WifiOff
                size={14}
                class={unsyncedMarkerDeletions ? 'text-amber-400' : 'text-white/40'}
              />
              <div class="stat-compact-content">
                <span class="stat-compact-label">Deletions</span>
                <span class="stat-compact-value">{unsyncedMarkerDeletions}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Warning Banner for Unsynced Data -->
        {#if hasUnsyncedChanges}
          <div class="warning-banner">
            <AlertTriangle size={16} class="flex-shrink-0 text-amber-400" />
            <div class="text-xs">
              {#if hasUnsyncedTrailChanges}
                <strong>{unsyncedPoints} trail point{unsyncedPoints !== 1 ? 's' : ''}</strong>
                {#if $pendingClosuresStore.length}
                  and <strong>{$pendingClosuresStore.length} closure{$pendingClosuresStore.length !== 1 ? 's' : ''}</strong>
                {/if}
              {/if}
              {#if hasUnsyncedTrailChanges && hasUnsyncedMarkerChanges}
                {' + '}
              {/if}
              {#if hasUnsyncedMarkerChanges}
                <strong>{totalUnsyncedMarkers} marker change{totalUnsyncedMarkers !== 1 ? 's' : ''}</strong>
              {/if}
              waiting to sync
            </div>
          </div>
        {/if}
      </div>

      <!-- Footer -->
      <div class="conn-modal-footer">
        <button
          class="modal-btn danger"
          disabled={purging}
          on:click={purgeAllData}
          title="Clear all queued data and reset trail state"
        >
          <Trash2 size={14} />
          {purging ? 'Clearing...' : 'Purge Data'}
        </button>
        <button class="modal-btn primary" on:click={closeStatsModal}>
          Close
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .hub-action {
    z-index: -1;
  }
  .hub-action-open {
    z-index: 1;
  }

  /* Vehicle Picker - no longer needed, uses bubble style now */

  /* Compass ring & ticks */
  .compass-ring {
    z-index: 0;
  }
  .compass-tick {
    position: absolute;
    font-size: 9px;
    font-weight: 800;
    color: rgba(255, 255, 255, 0.55);
    text-shadow: 0 1px 4px rgba(0, 0, 0, 0.9), 0 0 6px rgba(0, 0, 0, 0.5);
    letter-spacing: -0.3px;
  }
  .compass-tick-minor {
    position: absolute;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.2);
    box-shadow: 0 0 3px rgba(255, 255, 255, 0.1);
  }

  /* Spinning trail ring */
  .trail-ring-spinner {
    background: conic-gradient(
      #ef4444 0deg,
      #eab308 90deg,
      #ef4444 180deg,
      #eab308 270deg,
      #ef4444 360deg
    );
    -webkit-mask: radial-gradient(
      circle,
      transparent 60%,
      black 62%,
      black 100%
    );
    mask: radial-gradient(
      circle,
      transparent 60%,
      black 62%,
      black 100%
    );
    animation: trailSpin 2s linear infinite;
  }
  @keyframes trailSpin {
    0% { transform: translate(-50%, -50%) rotate(0deg); }
    100% { transform: translate(-50%, -50%) rotate(360deg); }
  }

  .trail-glow {
    animation: trailGlow 1.5s ease-in-out infinite;
  }
  @keyframes trailGlow {
    0%, 100% { box-shadow: 0 0 12px rgba(234, 179, 8, 0.25); }
    50% { box-shadow: 0 0 20px rgba(239, 68, 68, 0.5); }
  }

  /* ══════════════════════════════════ */
  /* Connection Status Modal (mirrors TrailModals) */
  /* ══════════════════════════════════ */

  .conn-modal-overlay {
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
    z-index: 60;
    animation: connFadeIn 0.2s ease-out;
  }

  .conn-modal {
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
    animation: connSlideIn 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
    overflow: hidden;
  }

  /* Header */
  .conn-modal-header {
    padding: 16px 18px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }
  .conn-modal-header.recording {
    background: linear-gradient(
      135deg,
      rgba(34, 197, 94, 0.15) 0%,
      rgba(22, 163, 74, 0.1) 100%
    );
  }
  .conn-modal-header.stopped {
    background: linear-gradient(
      135deg,
      rgba(107, 114, 128, 0.15) 0%,
      rgba(75, 85, 99, 0.1) 100%
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
    animation: pulseDot 2s ease-in-out infinite;
  }
  .status-dot.stopped {
    background: #6b7280;
  }
  @keyframes pulseDot {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.6; transform: scale(0.8); }
  }

  /* Body */
  .conn-modal-body {
    padding: 16px 18px;
    overflow-y: auto;
    flex: 1;
  }
  .conn-modal-body::-webkit-scrollbar {
    width: 4px;
  }
  .conn-modal-body::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 2px;
  }

  /* Connection Banner (like time-banner) */
  .connection-banner {
    background: linear-gradient(
      135deg,
      rgba(59, 130, 246, 0.15) 0%,
      rgba(37, 99, 235, 0.1) 100%
    );
    border: 1px solid rgba(59, 130, 246, 0.25);
    border-radius: 10px;
    padding: 12px;
    margin-bottom: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .connection-banner-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .connection-banner-content {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
  }
  .connection-banner-label {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.5);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .connection-banner-value {
    font-size: 14px;
    color: rgba(255, 255, 255, 0.95);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  /* Section label */
  .compact-stats-section {
    margin-bottom: 12px;
  }
  .section-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 10px;
    color: rgba(255, 255, 255, 0.5);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 6px;
  }

  /* Compact Stats Row */
  .compact-stats-row {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
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

  /* Footer */
  .conn-modal-footer {
    padding: 14px 18px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    gap: 10px;
    background: rgba(0, 0, 0, 0.3);
  }
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
    background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
    color: white;
  }
  .modal-btn.primary:hover {
    background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
    transform: translateY(-1px);
  }
  .modal-btn.danger {
    background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
    color: white;
  }
  .modal-btn.danger:hover {
    background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
    transform: translateY(-1px);
  }
  .modal-btn.danger:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }

  /* Animations */
  @keyframes connFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes connSlideIn {
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
    .conn-modal {
      width: 95%;
      max-height: 90vh;
      max-width: 380px;
    }
    .compact-stats-row {
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
    .connection-banner-value {
      font-size: 13px;
    }
  }
</style>
