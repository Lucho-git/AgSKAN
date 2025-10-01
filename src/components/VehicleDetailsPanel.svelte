<script>
  import {
    Edit3,
    Trash2,
    Check,
    Info,
    Navigation,
    Clock,
    Zap,
    MapPin,
    User,
    Truck,
    Locate,
    Palette,
    Ruler,
  } from "lucide-svelte"
  import { currentTrailStore } from "$lib/stores/currentTrailStore"
  import { otherActiveTrailStore } from "$lib/stores/otherTrailStore"

  export let selectedVehicleId
  export let getVehicleById
  export let map
  export let centerCameraOnVehicle = null
  export let startTrackingVehicle = null
  export let zoomToVehicle = null

  // UI State
  let showInfoPanel = false
  let isExpanded = false

  // Get current vehicle data
  $: currentVehicle = selectedVehicleId
    ? getVehicleById(selectedVehicleId)
    : null
  $: isCurrentUser = currentVehicle?.isCurrentUser || false

  // 🆕 NEW: Print vehicle data when selected
  $: if (currentVehicle) {
    console.log("🚗 Selected Vehicle Data:", currentVehicle)
  }

  // Close panel when no vehicle selected
  $: if (!selectedVehicleId) {
    showInfoPanel = false
    isExpanded = false
  }

  // Format last seen time
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

  // Helper function to calculate duration from a path
  function calculateDurationFromPath(path) {
    console.log("📊 calculateDurationFromPath called with path:", path)

    if (!path || path.length === 0) {
      console.log("❌ Path is null or empty")
      return "- -"
    }

    console.log(`📊 Path has ${path.length} points`)

    const firstPoint = path[0]
    const lastPoint = path[path.length - 1]

    console.log("📊 First point:", firstPoint)
    console.log("📊 Last point:", lastPoint)

    if (!firstPoint?.timestamp || !lastPoint?.timestamp) {
      console.log("❌ Missing timestamp in first or last point")
      return "- -"
    }

    const startTime =
      typeof firstPoint.timestamp === "string"
        ? new Date(firstPoint.timestamp).getTime()
        : firstPoint.timestamp
    const endTime =
      typeof lastPoint.timestamp === "string"
        ? new Date(lastPoint.timestamp).getTime()
        : lastPoint.timestamp

    console.log("📊 Start time (ms):", startTime, "End time (ms):", endTime)

    const diffMs = endTime - startTime
    console.log("📊 Duration (ms):", diffMs)

    const totalMinutes = Math.floor(diffMs / 60000)
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60

    console.log(`📊 Calculated duration: ${hours}h ${minutes}m`)

    if (hours === 0) return `${minutes}m`
    if (hours < 24) return `${hours}h ${minutes}m`

    const days = Math.floor(hours / 24)
    const remainingHours = hours % 24
    return `${days}d ${remainingHours}h`
  }

  // Format trailing duration - calculate from active trail's first and last point
  function formatTrailingDuration(vehicle) {
    console.log("🕐 formatTrailingDuration called for vehicle:", vehicle)

    if (!vehicle?.is_trailing) {
      console.log("❌ Vehicle is not trailing")
      return "Not trailing"
    }

    console.log("✅ Vehicle is trailing, checking trail data...")

    // For current user, get duration from their active trail
    if (vehicle.isCurrentUser) {
      console.log("👤 This is the current user")
      console.log("📊 Current trail store value:", $currentTrailStore)

      if ($currentTrailStore?.path?.length > 0) {
        console.log(
          `✅ Found current user trail with ${$currentTrailStore.path.length} points`,
        )
        return calculateDurationFromPath($currentTrailStore.path)
      } else {
        console.log("❌ No path data in currentTrailStore")
        console.log("currentTrailStore.path:", $currentTrailStore?.path)
      }
    } else {
      // For other vehicles, check otherActiveTrailStore
      console.log("👥 This is another vehicle, vehicle.id:", vehicle.id)
      console.log("📊 Other active trail store:", $otherActiveTrailStore)

      const otherTrail = $otherActiveTrailStore?.find((t) => {
        console.log(
          `🔍 Checking trail ${t.id} with vehicle_id ${t.vehicle_id} against ${vehicle.id}`,
        )
        return t.vehicle_id === vehicle.id
      })

      if (otherTrail) {
        console.log("✅ Found matching trail:", otherTrail)
        console.log(`Trail has ${otherTrail.path?.length || 0} points`)

        if (otherTrail.path?.length > 0) {
          return calculateDurationFromPath(otherTrail.path)
        } else {
          console.log("❌ Trail found but no path data")
        }
      } else {
        console.log("❌ No matching trail found in otherActiveTrailStore")
      }
    }

    console.log("⚠️ Returning '- -' (no valid trail data found)")
    return "- -"
  }

  // Calculate speed with empty dashes fallback
  function calculateSpeed(vehicle) {
    // TODO: Calculate from coordinate history
    // For now, return empty dashes if no speed data available
    return "- -" // Show dashes when speed is unavailable
  }

  // Get trail swath
  function getTrailSwath(vehicle) {
    if (!vehicle?.vehicle_marker?.swath) return "N/A"
    return `${vehicle.vehicle_marker.swath}m`
  }

  // Get trail color with display name
  function getTrailColor(vehicle) {
    if (!vehicle?.vehicle_marker?.bodyColor) return "Default"

    const color = vehicle.vehicle_marker.bodyColor

    // Map common color names to more readable versions
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

  // Get actual color value for display
  function getTrailColorValue(vehicle) {
    if (!vehicle?.vehicle_marker?.bodyColor) return "#6b7280"

    const color = vehicle.vehicle_marker.bodyColor

    // Map color names to hex values for visual display
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

  // 🆕 UPDATED: Get vehicle status with last seen integrated
  function getVehicleStatus(vehicle) {
    if (!vehicle) return "Unknown"

    const lastUpdate = new Date(vehicle.last_update)
    const now = new Date()
    const diffMins = Math.floor((now - lastUpdate) / 60000)

    if (diffMins < 5) return "Online"
    if (diffMins < 30) return "Recently active"

    // 🆕 NEW: Return last seen time instead of "Offline"
    return formatLastSeen(vehicle.last_update)
  }

  // 🆕 UPDATED: Get status color (now handles last seen times)
  function getStatusColor(status) {
    switch (status) {
      case "Online":
        return "#22c55e"
      case "Recently active":
        return "#f59e0b"
      case "Unknown":
        return "#6b7280"
      default:
        // 🆕 NEW: All other statuses (last seen times) get offline color
        return "#ef4444"
    }
  }

  // Get operation name
  function getCurrentOperation(vehicle) {
    if (!vehicle) return "No operation"
    return vehicle.operation_name || "No operation"
  }

  // Get vehicle display name
  function getVehicleDisplayName(vehicle) {
    if (!vehicle?.vehicle_marker) return "Unknown Vehicle"

    const vehicleType = vehicle.vehicle_marker.type || "Vehicle"

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

  // Handle info button click - toggle expanded panel
  function handleInfoClick() {
    showInfoPanel = !showInfoPanel
    isExpanded = showInfoPanel
  }

  // Combined locate and zoom function
  function handleLocateAndZoom() {
    if (currentVehicle && zoomToVehicle) {
      zoomToVehicle(currentVehicle)
    }
  }

  // Handle start tracking
  function handleStartTracking() {
    if (currentVehicle && startTrackingVehicle) {
      startTrackingVehicle(currentVehicle.id)
    }
  }
</script>

{#if currentVehicle}
  <!-- Vehicle Panel -->
  <div class="vehicle-panel" class:expanded={isExpanded}>
    <!-- Info Section (Only visible when expanded) -->
    {#if isExpanded && showInfoPanel}
      <div class="info-section">
        <!-- Vehicle Header -->
        <div class="vehicle-header">
          <div class="vehicle-title">
            <span class="vehicle-label"
              >{currentVehicle.full_name || "Unknown Operator"}</span
            >
            <span class="vehicle-type"
              >{getVehicleDisplayName(currentVehicle)}</span
            >
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
          <!-- Speed -->
          <div class="status-item">
            <div class="status-icon">
              <Zap size={16} />
            </div>
            <div class="status-content">
              <span class="status-label">Speed</span>
              <span class="status-value">{calculateSpeed(currentVehicle)}</span>
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
              <span class="status-value">{getTrailSwath(currentVehicle)}</span>
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
                  style="background-color: {getTrailColorValue(currentVehicle)}"
                ></div>
                <span class="status-value">{getTrailColor(currentVehicle)}</span
                >
              </div>
            </div>
          </div>

          <!-- 🆕 UPDATED: Only show trailing duration if currently trailing -->
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
    {/if}

    <!-- Control Bar (Always Visible) -->
    <div class="control-bar">
      <!-- Vehicle Info -->
      <div class="vehicle-info">
        <div class="vehicle-icon-display">
          <User size={20} />
        </div>
        <div class="vehicle-text-info">
          <span class="vehicle-name">
            {isCurrentUser
              ? "You"
              : currentVehicle.full_name || "Unknown Operator"}
            <span class="vehicle-type-preview">
              - {getVehicleDisplayName(currentVehicle)}</span
            >
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
          <Info size={18} />
        </button>

        <button
          class="control-btn locate-btn"
          on:click={handleLocateAndZoom}
          title="Locate and zoom to vehicle"
        >
          <Locate size={18} />
        </button>

        {#if !isCurrentUser}
          <button
            class="control-btn track-btn"
            on:click={handleStartTracking}
            title="Start tracking vehicle"
          >
            <Navigation size={18} />
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  /* All the existing styles remain the same */
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
    padding: 12px 20px;
    background: rgba(0, 0, 0, 0.95);
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(20px);
  }

  .vehicle-info {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1;
    min-width: 0;
  }

  .vehicle-icon-display {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 50%;
    border: 2px solid rgba(255, 255, 255, 0.2);
    color: #60a5fa;
    flex-shrink: 0;
  }

  .vehicle-text-info {
    display: flex;
    flex: 1;
    min-width: 0;
  }

  .vehicle-name {
    font-size: 16px;
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
    font-size: 12px;
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
    gap: 8px;
    align-items: center;
  }

  .control-btn {
    background: rgba(255, 255, 255, 0.1);
    border: none;
    border-radius: 50%;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(255, 255, 255, 0.8);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .control-btn:hover {
    background: rgba(255, 255, 255, 0.2);
    color: white;
    transform: scale(1.05);
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

  /* Mobile Responsiveness */
  @media (max-width: 768px) {
    .info-section {
      max-height: 35vh;
      padding: 12px 16px 0;
    }

    .control-bar {
      padding: 10px 16px;
    }

    .control-btn {
      width: 32px;
      height: 32px;
    }

    .vehicle-icon-display {
      width: 32px;
      height: 32px;
    }

    .vehicle-info {
      gap: 8px;
    }

    .vehicle-name {
      font-size: 14px;
    }

    .vehicle-type-preview {
      font-size: 10px;
    }

    .status-grid {
      grid-template-columns: 1fr;
      gap: 8px;
    }
  }

  @media (max-width: 640px) {
    .vehicle-type-preview {
      font-size: 9px;
    }
  }

  @media (max-width: 480px) {
    .info-section {
      max-height: 30vh;
    }

    .vehicle-info {
      gap: 6px;
    }

    .action-controls {
      gap: 6px;
    }

    .control-btn {
      width: 30px;
      height: 30px;
    }

    .vehicle-icon-display {
      width: 28px;
      height: 28px;
    }

    .vehicle-name {
      font-size: 13px;
    }

    .vehicle-type-preview {
      font-size: 8px;
    }
  }

  /* Very small screens */
  @media (max-width: 360px) {
    .vehicle-name {
      font-size: 12px;
    }

    .vehicle-type-preview {
      font-size: 7px;
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
