<!-- src/components/VehicleDetailsPanel.svelte -->

<script>
  import {
    Edit3,
    Info,
    Navigation,
    Clock,
    Zap,
    Truck,
    Locate,
    Palette,
    Ruler,
    User,
  } from "lucide-svelte"
  import { currentTrailStore } from "$lib/stores/currentTrailStore"
  import { otherActiveTrailStore } from "$lib/stores/otherTrailStore"
  import {
    userVehicleStore,
    otherVehiclesStore,
  } from "$lib/stores/vehicleStore"
  import { vehiclePresetStore } from "$lib/stores/vehiclePresetStore"
  import SVGComponents from "$lib/vehicles/index.js"
  import { getVehicleTypeName } from "$lib/utils/vehicleDisplayName"

  export let selectedVehicleId
  export let getVehicleById
  export let map
  export let centerCameraOnVehicle = null
  export let startTrackingVehicle = null
  export let zoomToVehicle = null
  export let onOpenVehicleControls = null

  let showInfoPanel = false
  let isExpanded = false

  const STALE_THRESHOLD_MS = 30000 // 30 seconds

  // 🆕 FIXED: React directly to store changes, not derived objects
  $: currentVehicle = (() => {
    if (!selectedVehicleId) return null

    // Check if it's the current user
    if (selectedVehicleId === $userVehicleStore.vehicle_id) {
      // Return fresh data from store every time store updates
      return {
        id: $userVehicleStore.vehicle_id,
        full_name: "You",
        vehicle_marker: $userVehicleStore.vehicle_marker,
        coordinates: $userVehicleStore.coordinates,
        heading: $userVehicleStore.heading,
        speed: $userVehicleStore.speed, // 🔥 This will now update reactively!
        is_trailing: $userVehicleStore.is_trailing,
        last_update: $userVehicleStore.last_update,
        isCurrentUser: true,
        active_preset_id: $userVehicleStore.active_preset_id,
        selected_operation_id: $userVehicleStore.selected_operation_id,
        current_operation: $userVehicleStore.current_operation,
        operation_name: $userVehicleStore.operation_name,
        operation_id: $userVehicleStore.operation_id,
      }
    }

    // Find in other vehicles store
    const otherVehicle = $otherVehiclesStore.find(
      (v) => v.vehicle_id === selectedVehicleId,
    )

    if (otherVehicle) {
      return {
        ...otherVehicle,
        id: otherVehicle.vehicle_id,
        isCurrentUser: false,
      }
    }

    return null
  })()

  $: isCurrentUser = currentVehicle?.isCurrentUser || false

  // 🆕 Now this will update reactively because currentVehicle updates
  $: currentSpeed = (() => {
    if (!currentVehicle) return "- -"

    const now = Date.now()
    const lastUpdate = new Date(currentVehicle.last_update).getTime()
    const timeSinceUpdate = now - lastUpdate

    if (timeSinceUpdate > STALE_THRESHOLD_MS) {
      return "- -"
    }

    const speed = currentVehicle.speed

    if (speed === null || speed === undefined) {
      return "- -"
    }

    if (speed < 0.5) {
      return "0 km/h"
    }

    return `${speed.toFixed(1)} km/h`
  })()

  $: speedStatus = (() => {
    if (!currentVehicle) return "unknown"

    const now = Date.now()
    const lastUpdate = new Date(currentVehicle.last_update).getTime()
    const timeSinceUpdate = now - lastUpdate

    if (timeSinceUpdate > STALE_THRESHOLD_MS) {
      return "stale"
    }

    const speed = currentVehicle.speed

    if (speed === null || speed === undefined) {
      return "unknown"
    }

    if (speed < 0.5) {
      return "stationary"
    }

    return "moving"
  })()

  $: speedColor = (() => {
    switch (speedStatus) {
      case "moving":
        return "#22c55e"
      case "stationary":
        return "#f59e0b"
      case "stale":
        return "#6b7280"
      default:
        return "#6b7280"
    }
  })()

  let VehicleIcon
  $: {
    if (isCurrentUser && $userVehicleStore?.vehicle_marker?.type) {
      VehicleIcon =
        SVGComponents[$userVehicleStore.vehicle_marker.type] ||
        SVGComponents.Pointer
    } else if (currentVehicle?.vehicle_marker?.type) {
      VehicleIcon =
        SVGComponents[currentVehicle.vehicle_marker.type] ||
        SVGComponents.Pointer
    } else {
      VehicleIcon = null
    }
  }

  $: vehicleBodyColor = isCurrentUser
    ? $userVehicleStore?.vehicle_marker?.bodyColor || "Green"
    : currentVehicle?.vehicle_marker?.bodyColor || "Green"

  $: vehicleSwath = isCurrentUser
    ? $userVehicleStore?.vehicle_marker?.swath || 12
    : currentVehicle?.vehicle_marker?.swath || 12

  $: vehicleType = isCurrentUser
    ? $userVehicleStore?.vehicle_marker?.type || "Tractor"
    : currentVehicle?.vehicle_marker?.type || "Tractor"

  $: vehicleMarkerData = isCurrentUser
    ? $userVehicleStore?.vehicle_marker
    : currentVehicle?.vehicle_marker

  $: displayName = (() => {
    if (!currentVehicle) return "Unknown Vehicle"

    const marker = isCurrentUser
      ? $userVehicleStore?.vehicle_marker
      : currentVehicle?.vehicle_marker

    if (marker) {
      const matchingPreset = $vehiclePresetStore.find(
        (p) =>
          p.type === marker.type &&
          p.body_color === marker.bodyColor &&
          p.swath === marker.swath,
      )

      if (matchingPreset) {
        return matchingPreset.name
      }
    }

    const fallbackName = getVehicleTypeName(marker?.type || "Vehicle")
    return fallbackName
  })()

  $: if (!selectedVehicleId) {
    showInfoPanel = false
    isExpanded = false
  }

  // 🆕 Debug logging to verify reactivity
  $: if (currentVehicle) {
    console.log("🔄 Vehicle data updated:", {
      id: currentVehicle.id,
      speed: currentVehicle.speed,
      last_update: currentVehicle.last_update,
      isCurrentUser: currentVehicle.isCurrentUser,
    })
  }

  $: {
    console.log("⚡ Speed display updated:", currentSpeed)
  }

  function formatLastSeen(timestamp) {
    if (!timestamp) return "Unknown"
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMins < 1) return "Just now"
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
  }

  function calculateDurationFromPath(path) {
    if (!path || path.length === 0) return "- -"

    const firstPoint = path[0]
    const lastPoint = path[path.length - 1]

    if (!firstPoint?.timestamp || !lastPoint?.timestamp) return "- -"

    const startTime =
      typeof firstPoint.timestamp === "string"
        ? new Date(firstPoint.timestamp).getTime()
        : firstPoint.timestamp
    const endTime =
      typeof lastPoint.timestamp === "string"
        ? new Date(lastPoint.timestamp).getTime()
        : lastPoint.timestamp

    const diffMs = endTime - startTime
    const totalMinutes = Math.floor(diffMs / 60000)
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60

    if (hours === 0) return `${minutes}m`
    if (hours < 24) return `${hours}h ${minutes}m`

    const days = Math.floor(hours / 24)
    const remainingHours = hours % 24
    return `${days}d ${remainingHours}h`
  }

  function formatTrailingDuration(vehicle) {
    if (!vehicle?.is_trailing) return "Not trailing"

    if (vehicle.isCurrentUser) {
      if ($currentTrailStore?.path?.length > 0) {
        return calculateDurationFromPath($currentTrailStore.path)
      }
    } else {
      const otherTrail = $otherActiveTrailStore?.find(
        (t) => t.vehicle_id === vehicle.id,
      )
      if (otherTrail?.path?.length > 0) {
        return calculateDurationFromPath(otherTrail.path)
      }
    }

    return "- -"
  }

  function getTrailSwath() {
    if (!vehicleMarkerData?.swath) return "N/A"
    return `${vehicleMarkerData.swath}m`
  }

  function getTrailColor() {
    if (!vehicleMarkerData?.bodyColor) return "Default"

    const color = vehicleMarkerData.bodyColor

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

    return colorMap[color] || color
  }

  function getTrailColorValue() {
    if (!vehicleMarkerData?.bodyColor) return "#6b7280"

    const color = vehicleMarkerData.bodyColor

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

    return colorValues[color] || color
  }

  function getVehicleStatus(vehicle) {
    if (!vehicle) return "Unknown"

    const lastUpdate = new Date(vehicle.last_update)
    const now = new Date()
    const diffMins = Math.floor((now - lastUpdate) / 60000)

    if (diffMins < 5) return "Online"
    if (diffMins < 30) return "Recently active"

    return formatLastSeen(vehicle.last_update)
  }

  function getStatusColor(status) {
    switch (status) {
      case "Online":
        return "#22c55e"
      case "Recently active":
        return "#f59e0b"
      case "Unknown":
        return "#6b7280"
      default:
        return "#ef4444"
    }
  }

  function getCurrentOperation(vehicle) {
    if (!vehicle) return "No operation"
    return vehicle.operation_name || "No operation"
  }

  function handleIconClick() {
    if (isCurrentUser && onOpenVehicleControls) {
      onOpenVehicleControls()
    }
  }

  function handleInfoClick() {
    showInfoPanel = !showInfoPanel
    isExpanded = showInfoPanel
  }

  function handleLocateAndZoom() {
    if (currentVehicle && zoomToVehicle) {
      zoomToVehicle(currentVehicle)
    }
  }

  function handleStartTracking() {
    if (currentVehicle && startTrackingVehicle) {
      startTrackingVehicle(currentVehicle.id)
    }
  }
</script>

{#if currentVehicle}
  <div class="vehicle-panel" class:expanded={isExpanded}>
    {#if isExpanded && showInfoPanel}
      {#key `${vehicleType}-${vehicleBodyColor}-${vehicleSwath}`}
        <div class="info-section">
          <div class="vehicle-header">
            <div class="vehicle-title">
              <span class="vehicle-label"
                >{currentVehicle.full_name || "Unknown Operator"}</span
              >
              <span class="vehicle-type">{displayName}</span>
            </div>
            <div
              class="vehicle-status"
              style="color: {getStatusColor(getVehicleStatus(currentVehicle))}"
            >
              {getVehicleStatus(currentVehicle)}
            </div>
          </div>

          <div class="status-grid">
            <!-- Speed display - now fully reactive -->
            <div class="status-item" data-speed-status={speedStatus}>
              <div class="status-icon" style="color: {speedColor}">
                <Zap size={16} />
              </div>
              <div class="status-content">
                <span class="status-label">Speed</span>
                <span class="status-value" style="color: {speedColor}"
                  >{currentSpeed}</span
                >
              </div>
            </div>

            <div class="status-item">
              <div class="status-icon">
                <Truck size={16} />
              </div>
              <div class="status-content">
                <span class="status-label">Operation</span>
                <span class="status-value"
                  >{getCurrentOperation(currentVehicle)}</span
                >
              </div>
            </div>

            <div class="status-item">
              <div class="status-icon">
                <Ruler size={16} />
              </div>
              <div class="status-content">
                <span class="status-label">Trail Swath</span>
                <span class="status-value">{getTrailSwath()}</span>
              </div>
            </div>

            <div class="status-item">
              <div class="status-icon">
                <Palette size={16} />
              </div>
              <div class="status-content">
                <span class="status-label">Trail Color</span>
                <div class="trail-color-display">
                  <div
                    class="color-swatch"
                    style="background-color: {getTrailColorValue()}"
                  ></div>
                  <span class="status-value">{getTrailColor()}</span>
                </div>
              </div>
            </div>

            {#if currentVehicle.is_trailing}
              <div class="status-item">
                <div class="status-icon">
                  <Clock size={16} />
                </div>
                <div class="status-content">
                  <span class="status-label">Trailing for</span>
                  <span class="status-value"
                    >{formatTrailingDuration(currentVehicle)}</span
                  >
                </div>
              </div>
            {/if}
          </div>

          {#if currentVehicle.is_trailing}
            <div class="trailing-section">
              <div class="trailing-indicator">
                <Navigation size={14} />
                <span>Currently trailing</span>
              </div>
            </div>
          {/if}
        </div>
      {/key}
    {/if}

    <div class="control-bar">
      <div class="vehicle-info">
        <button
          class="vehicle-icon-display"
          class:clickable={isCurrentUser}
          on:click={handleIconClick}
          disabled={!isCurrentUser}
        >
          {#if VehicleIcon}
            {#key `${vehicleBodyColor}-${vehicleSwath}`}
              <svelte:component
                this={VehicleIcon}
                bodyColor={vehicleBodyColor}
                size="24px"
                swath={vehicleSwath}
              />
            {/key}
          {:else}
            <User size={20} />
          {/if}

          {#if isCurrentUser}
            <div class="edit-badge">
              <Edit3 size={12} />
            </div>
          {/if}
        </button>

        <div class="vehicle-text-info">
          <span class="vehicle-name">
            {isCurrentUser
              ? "You"
              : currentVehicle.full_name || "Unknown Operator"}
            <span class="vehicle-type-preview"> - {displayName}</span>
          </span>
        </div>
      </div>

      <div class="action-controls">
        <button
          class="control-btn info-btn"
          class:active={showInfoPanel && isExpanded}
          on:click={handleInfoClick}
          title="Toggle vehicle details"
        >
          <Info size={20} />
        </button>

        <button
          class="control-btn locate-btn"
          on:click={handleLocateAndZoom}
          title="Locate and zoom to vehicle"
        >
          <Locate size={20} />
        </button>

        <button
          class="control-btn track-btn"
          on:click={handleStartTracking}
          title="Start tracking vehicle"
        >
          <Navigation size={20} />
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .vehicle-panel {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: rgba(0, 0, 0, 0.9);
    backdrop-filter: blur(16px);
    color: white;
    z-index: 1000;
    transition: all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
    border-top: 1px solid rgba(255, 255, 255, 0.1);
  }

  .info-section {
    padding: 16px 20px 0;
    max-height: 40vh;
    overflow-y: auto;
    background: linear-gradient(
      to bottom,
      rgba(0, 0, 0, 0.9),
      rgba(0, 0, 0, 0.8)
    );
    opacity: 0;
    transform: translateY(-20px);
    transition: all 0.3s ease;
  }

  .vehicle-panel.expanded .info-section {
    opacity: 1;
    transform: translateY(0);
  }

  .vehicle-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .vehicle-title {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .vehicle-label {
    font-size: 16px;
    font-weight: 600;
    color: white;
  }

  .vehicle-type {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.6);
  }

  .vehicle-status {
    font-size: 12px;
    font-weight: 500;
    padding: 4px 8px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.1);
  }

  .status-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-bottom: 16px;
  }

  .status-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    border-left: 3px solid #60a5fa;
  }

  .status-icon {
    color: #60a5fa;
    flex-shrink: 0;
  }

  .status-content {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }

  .status-label {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.6);
    font-weight: 500;
  }

  .status-value {
    font-size: 13px;
    font-weight: 600;
    color: white;
    text-overflow: ellipsis;
    overflow: hidden;
    white-space: nowrap;
  }

  .trail-color-display {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .color-swatch {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.3);
    flex-shrink: 0;
  }

  .trailing-section {
    margin-bottom: 12px;
    padding: 12px;
    background: rgba(34, 197, 94, 0.1);
    border-radius: 8px;
    border-left: 3px solid #22c55e;
  }

  .trailing-indicator {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #22c55e;
    font-size: 13px;
    font-weight: 500;
  }

  .control-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 18px 24px;
    background: rgba(0, 0, 0, 0.95);
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(20px);
    min-height: 72px;
  }

  .vehicle-info {
    display: flex;
    align-items: center;
    gap: 16px;
    flex: 1;
    min-width: 0;
  }

  .vehicle-icon-display {
    position: relative;
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.9);
    border-radius: 50%;
    border: 3px solid #60a5fa;
    flex-shrink: 0;
    transition: all 0.3s ease;
    touch-action: manipulation;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
    box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.2);
  }

  .vehicle-icon-display.clickable {
    cursor: pointer;
  }

  .vehicle-icon-display.clickable:hover {
    transform: scale(1.05);
    border-color: #93c5fd;
    box-shadow: 0 0 0 4px rgba(96, 165, 250, 0.3);
  }

  .vehicle-icon-display:disabled {
    cursor: default;
  }

  .edit-badge {
    position: absolute;
    bottom: -4px;
    right: -4px;
    width: 22px;
    height: 22px;
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    border: 2px solid rgba(0, 0, 0, 0.9);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    transition: all 0.2s ease;
    box-shadow: 0 2px 8px rgba(16, 185, 129, 0.5);
  }

  .vehicle-icon-display.clickable:hover .edit-badge {
    transform: scale(1.2) rotate(-12deg);
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.7);
  }

  .vehicle-text-info {
    display: flex;
    flex: 1;
    min-width: 0;
  }

  .vehicle-name {
    font-size: 18px;
    font-weight: 600;
    color: white;
    text-overflow: ellipsis;
    overflow: hidden;
    white-space: nowrap;
    line-height: 1.2;
    flex: 1;
    min-width: 0;
  }

  .vehicle-type-preview {
    font-size: 14px;
    font-weight: 400;
    color: rgba(255, 255, 255, 0.6);
    font-style: italic;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex-shrink: 1;
    min-width: 0;
  }

  .action-controls {
    display: flex;
    gap: 12px;
    align-items: center;
  }

  .control-btn {
    background: rgba(255, 255, 255, 0.1);
    border: none;
    border-radius: 50%;
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(255, 255, 255, 0.8);
    cursor: pointer;
    transition: all 0.2s ease;
    touch-action: manipulation;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
  }

  .control-btn:hover {
    background: rgba(255, 255, 255, 0.2);
    color: white;
    transform: scale(1.05);
  }

  .control-btn:active {
    transform: scale(0.95);
    transition: transform 0.1s ease;
  }

  .info-btn {
    background: rgba(34, 197, 94, 0.2);
    color: #22c55e;
  }

  .info-btn:hover,
  .info-btn.active {
    background: rgba(34, 197, 94, 0.3);
    color: white;
  }

  .locate-btn {
    background: rgba(96, 165, 250, 0.2);
    color: #60a5fa;
  }

  .locate-btn:hover {
    background: rgba(96, 165, 250, 0.3);
    color: white;
  }

  .track-btn {
    background: rgba(168, 85, 247, 0.2);
    color: #a855f7;
  }

  .track-btn:hover {
    background: rgba(168, 85, 247, 0.3);
    color: white;
  }

  .status-item[data-speed-status="moving"] {
    border-left-color: #22c55e;
  }

  .status-item[data-speed-status="stationary"] {
    border-left-color: #f59e0b;
  }

  .status-item[data-speed-status="stale"] {
    border-left-color: #6b7280;
  }

  @media (max-width: 768px) {
    .info-section {
      max-height: 35vh;
      padding: 12px 16px 0;
    }

    .control-bar {
      padding: 16px 20px;
      min-height: 68px;
    }

    .control-btn {
      width: 44px;
      height: 44px;
    }

    .vehicle-icon-display {
      width: 44px;
      height: 44px;
      border-width: 2px;
    }

    .edit-badge {
      width: 20px;
      height: 20px;
    }

    .vehicle-info {
      gap: 12px;
    }

    .vehicle-name {
      font-size: 16px;
    }

    .vehicle-type-preview {
      font-size: 11px;
    }

    .status-grid {
      grid-template-columns: 1fr;
      gap: 8px;
    }
  }

  @media (max-width: 360px) {
    .vehicle-name {
      font-size: 14px;
    }

    .vehicle-type-preview {
      font-size: 10px;
    }
  }

  .info-section::-webkit-scrollbar {
    width: 4px;
  }

  .info-section::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2px;
  }

  .info-section::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.3);
    border-radius: 2px;
  }
</style>
