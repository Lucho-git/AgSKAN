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
  import { userVehicleStore } from "../stores/vehicleStore"
  import { vehiclePresetStore } from "$lib/stores/vehiclePresetStore"
  import SVGComponents from "$lib/vehicles/index.js"
  import { getVehicleTypeName } from "$lib/utils/vehicleDisplayName"
  import { onMount, onDestroy } from "svelte"

  export let selectedVehicleId
  export let getVehicleById
  export let map
  export let centerCameraOnVehicle = null
  export let startTrackingVehicle = null
  export let zoomToVehicle = null
  export let onOpenVehicleControls = null

  // UI State
  let showInfoPanel = false
  let isExpanded = false

  // 🆕 Speed calculation state
  let vehicleSpeedData = new Map() // vehicleId -> { positions: [], speeds: [] }
  let speedUpdateInterval = null

  // Constants for speed calculation
  const MAX_POSITION_HISTORY = 5 // Keep last 5 positions
  const STALE_THRESHOLD_MS = 30000 // 30 seconds = stale
  const MIN_MOVEMENT_THRESHOLD_M = 2 // Minimum 2 meters to count as movement
  const SPEED_SMOOTHING_FACTOR = 0.3 // Smooth speed changes

  // Get current vehicle data
  $: currentVehicle = selectedVehicleId
    ? getVehicleById(selectedVehicleId)
    : null
  $: isCurrentUser = currentVehicle?.isCurrentUser || false

  // Reactive vehicle icon component
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

  // 🆕 Track vehicle position changes for speed calculation
  $: if (currentVehicle?.coordinates && currentVehicle?.id) {
    updateVehiclePosition(currentVehicle)
  }

  // 🆕 CORE SPEED CALCULATION LOGIC
  function parseCoordinates(coords) {
    if (!coords) return null

    if (typeof coords === "object" && coords.latitude && coords.longitude) {
      return coords
    }

    if (typeof coords === "string") {
      const cleanedCoords = coords.slice(1, -1)
      const [longitude, latitude] = cleanedCoords.split(",").map(parseFloat)
      return { latitude, longitude }
    }

    return null
  }

  // Calculate distance between two coordinates (Haversine formula)
  function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000 // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180
    const φ2 = (lat2 * Math.PI) / 180
    const Δφ = ((lat2 - lat1) * Math.PI) / 180
    const Δλ = ((lon2 - lon1) * Math.PI) / 180

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

    return R * c // Distance in meters
  }

  // Update vehicle position for speed tracking
  function updateVehiclePosition(vehicle) {
    if (!vehicle?.id || !vehicle?.coordinates || !vehicle?.last_update) return

    const coords = parseCoordinates(vehicle.coordinates)
    if (!coords) return

    const vehicleId = vehicle.id
    const timestamp = new Date(vehicle.last_update).getTime()

    // Initialize tracking for this vehicle if needed
    if (!vehicleSpeedData.has(vehicleId)) {
      vehicleSpeedData.set(vehicleId, {
        positions: [],
        speeds: [],
        lastCalculatedSpeed: 0,
      })
    }

    const data = vehicleSpeedData.get(vehicleId)

    // Add new position
    data.positions.push({
      lat: coords.latitude,
      lon: coords.longitude,
      timestamp,
    })

    // Keep only recent positions
    if (data.positions.length > MAX_POSITION_HISTORY) {
      data.positions.shift()
    }

    // Calculate speed if we have at least 2 positions
    if (data.positions.length >= 2) {
      const recent = data.positions[data.positions.length - 1]
      const previous = data.positions[data.positions.length - 2]

      const distance = calculateDistance(
        previous.lat,
        previous.lon,
        recent.lat,
        recent.lon,
      )

      const timeDiff = (recent.timestamp - previous.timestamp) / 1000 // seconds

      if (timeDiff > 0) {
        // Calculate speed in km/h
        let speedKmh = (distance / timeDiff) * 3.6

        // Filter out unrealistic speeds (e.g., >200 km/h for farm equipment)
        if (speedKmh > 200) {
          speedKmh = data.lastCalculatedSpeed // Keep previous speed
        }

        // Ignore tiny movements (GPS noise)
        if (distance < MIN_MOVEMENT_THRESHOLD_M) {
          speedKmh = 0
        }

        // Smooth the speed using exponential moving average
        const smoothedSpeed =
          data.lastCalculatedSpeed * (1 - SPEED_SMOOTHING_FACTOR) +
          speedKmh * SPEED_SMOOTHING_FACTOR

        data.speeds.push(smoothedSpeed)
        data.lastCalculatedSpeed = smoothedSpeed

        // Keep speed history limited
        if (data.speeds.length > MAX_POSITION_HISTORY) {
          data.speeds.shift()
        }
      }
    }

    vehicleSpeedData.set(vehicleId, data)
  }

  // 🆕 Calculate and format speed for display
  function calculateSpeed(vehicle) {
    if (!vehicle?.id) return "- -"

    const now = Date.now()
    const lastUpdate = new Date(vehicle.last_update).getTime()
    const timeSinceUpdate = now - lastUpdate

    // Check if vehicle data is stale
    if (timeSinceUpdate > STALE_THRESHOLD_MS) {
      return "- -" // Vehicle is offline/stale
    }

    // Get speed data for this vehicle
    const data = vehicleSpeedData.get(vehicle.id)

    if (!data || data.speeds.length === 0) {
      // No calculated speed yet - check if vehicle is moving recently
      if (timeSinceUpdate < 5000) {
        return "0 km/h" // Recently updated but no speed data = stationary
      }
      return "- -"
    }

    // Get average of recent speeds for stability
    const avgSpeed =
      data.speeds.reduce((sum, s) => sum + s, 0) / data.speeds.length

    // Round to 1 decimal place
    const roundedSpeed = Math.round(avgSpeed * 10) / 10

    // Format speed
    if (roundedSpeed < 0.5) {
      return "0 km/h" // Effectively stationary
    }

    return `${roundedSpeed.toFixed(1)} km/h`
  }

  // 🆕 Get speed status indicator (for styling/color)
  function getSpeedStatus(vehicle) {
    if (!vehicle?.id) return "unknown"

    const now = Date.now()
    const lastUpdate = new Date(vehicle.last_update).getTime()
    const timeSinceUpdate = now - lastUpdate

    if (timeSinceUpdate > STALE_THRESHOLD_MS) {
      return "stale" // Gray/offline
    }

    const data = vehicleSpeedData.get(vehicle.id)
    if (!data || data.speeds.length === 0) {
      return "stationary" // Yellow/waiting for data
    }

    const avgSpeed =
      data.speeds.reduce((sum, s) => sum + s, 0) / data.speeds.length

    if (avgSpeed < 0.5) {
      return "stationary" // Yellow/stopped
    }

    return "moving" // Green/active
  }

  // 🆕 Periodic cleanup of stale vehicle data
  function cleanupStaleData() {
    const now = Date.now()
    const staleCutoff = now - STALE_THRESHOLD_MS * 2 // Double the threshold for cleanup

    for (const [vehicleId, data] of vehicleSpeedData.entries()) {
      if (data.positions.length > 0) {
        const lastPosition = data.positions[data.positions.length - 1]
        if (now - lastPosition.timestamp > staleCutoff) {
          vehicleSpeedData.delete(vehicleId)
        }
      }
    }
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

  // 🆕 Get speed indicator color
  function getSpeedColor(status) {
    switch (status) {
      case "moving":
        return "#22c55e" // Green
      case "stationary":
        return "#f59e0b" // Yellow
      case "stale":
        return "#6b7280" // Gray
      default:
        return "#6b7280"
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

  // 🆕 Lifecycle management
  onMount(() => {
    // Periodic cleanup of stale vehicle data every minute
    speedUpdateInterval = setInterval(cleanupStaleData, 60000)
  })

  onDestroy(() => {
    if (speedUpdateInterval) {
      clearInterval(speedUpdateInterval)
    }
    // Clear all speed data on unmount
    vehicleSpeedData.clear()
  })
</script>

{#if currentVehicle}
  <!-- Vehicle Panel -->
  <div class="vehicle-panel" class:expanded={isExpanded}>
    <!-- Info Section (Only visible when expanded) -->
    {#if isExpanded && showInfoPanel}
      {#key `${vehicleType}-${vehicleBodyColor}-${vehicleSwath}`}
        <div class="info-section">
          <!-- Vehicle Header -->
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

          <!-- Status Grid -->
          <div class="status-grid">
            <!-- 🆕 UPDATED: Speed with status color -->
            <div
              class="status-item"
              data-speed-status={getSpeedStatus(currentVehicle)}
            >
              <div
                class="status-icon"
                style="color: {getSpeedColor(getSpeedStatus(currentVehicle))}"
              >
                <Zap size={16} />
              </div>
              <div class="status-content">
                <span class="status-label">Speed</span>
                <span
                  class="status-value"
                  style="color: {getSpeedColor(getSpeedStatus(currentVehicle))}"
                  >{calculateSpeed(currentVehicle)}</span
                >
              </div>
            </div>

            <!-- Operation -->
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

            <!-- Trail Swath -->
            <div class="status-item">
              <div class="status-icon">
                <Ruler size={16} />
              </div>
              <div class="status-content">
                <span class="status-label">Trail Swath</span>
                <span class="status-value">{getTrailSwath()}</span>
              </div>
            </div>

            <!-- Trail Color -->
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

            <!-- Trailing duration (if trailing) -->
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

          <!-- Trailing Status (if applicable) -->
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

    <!-- Control Bar (Always Visible) -->
    <div class="control-bar">
      <!-- Vehicle Info -->
      <div class="vehicle-info">
        <!-- Clickable Vehicle Icon Display -->
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

          <!-- Edit Badge (only show for current user) -->
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

      <!-- Action Controls -->
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
  /* Main Vehicle Panel */
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

  /* Info Section (Only visible when expanded) */
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

  /* Status Grid */
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

  /* Trail Color Display */
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

  /* Trailing Section */
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

  /* Control Bar (Always Visible) */
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

  /* Blue circle border around vehicle icon */
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

  /* Edit Badge */
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

  /* 🆕 Speed status-specific border colors */
  .status-item[data-speed-status="moving"] {
    border-left-color: #22c55e;
  }

  .status-item[data-speed-status="stationary"] {
    border-left-color: #f59e0b;
  }

  .status-item[data-speed-status="stale"] {
    border-left-color: #6b7280;
  }

  /* Mobile Responsiveness */
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

  /* Scrollbar Styling */
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
