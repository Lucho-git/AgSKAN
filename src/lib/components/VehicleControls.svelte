<!-- src/lib/components/VehicleControls.svelte -->
<script>
  import { createEventDispatcher } from "svelte"
  import {
    ChevronRight,
    Check,
    Minus,
    Plus,
    ChevronsLeftRight,
  } from "lucide-svelte"
  import SVGComponents from "$lib/vehicles/index.js"

  // Import the vehicle store directly
  import { userVehicleStore } from "../../stores/vehicleStore"
  import { toast } from "svelte-sonner"

  const dispatch = createEventDispatcher()

  // Get current values from store instead of props
  $: currentVehicleType = $userVehicleStore.vehicle_marker?.type || "Tractor"
  $: currentVehicleColor =
    $userVehicleStore.vehicle_marker?.bodyColor || "Green"
  $: currentVehicleSwath = $userVehicleStore.vehicle_marker?.swath || 12

  // Active sub-panel state
  let activeSubPanel = null // null, 'vehicles', 'colors', 'swath'

  // Complete vehicle data with PROPER default sizes
  const vehicles = [
    { type: "FourWheelDriveTractor", bodyColor: "green", size: 35, swath: 4 },
    { type: "TowBetweenSeeder", bodyColor: "red", size: 80, swath: 12 },
    { type: "TowBehindSeeder", bodyColor: "red", size: 80, swath: 12 },
    { type: "TowBehindSeederTracks", bodyColor: "red", size: 80, swath: 12 },
    { type: "TowBehindBoomspray", bodyColor: "red", size: 80, swath: 36 },
    { type: "SelfPropelledBoomspray", bodyColor: "red", size: 45, swath: 36 },
    { type: "ThreePointBoomspray", bodyColor: "red", size: 45, swath: 36 },
    { type: "FarmUte", bodyColor: "red", size: 40, swath: 4 },
    { type: "FrontWheelChaserBin", bodyColor: "red", size: 70, swath: 12 },
    { type: "FourWheelDriveChaserBin", bodyColor: "red", size: 70, swath: 12 },
    { type: "HeaderDuals", bodyColor: "red", size: 50, swath: 12 },
    { type: "HeaderSingles", bodyColor: "red", size: 50, swath: 12 },
    { type: "HeaderTracks", bodyColor: "red", size: 50, swath: 12 },
    { type: "SelfPropelledSwather", bodyColor: "red", size: 50, swath: 12 },
    { type: "Spreader", bodyColor: "red", size: 80, swath: 12 },
    { type: "Truck", bodyColor: "red", size: 60, swath: 4 },
    { type: "CabOverTruck", bodyColor: "red", size: 60, swath: 4 },
    { type: "CabOverRoadTrain", bodyColor: "red", size: 100, swath: 4 },
    { type: "Baler", bodyColor: "red", size: 80, swath: 12 },
    { type: "Mower", bodyColor: "red", size: 60, swath: 12 },
    { type: "SelfPropelledMower", bodyColor: "red", size: 60, swath: 12 },
    { type: "Telehandler", bodyColor: "red", size: 70, swath: 12 },
    { type: "Loader", bodyColor: "red", size: 50, swath: 4 },
    { type: "SimpleTractor", bodyColor: "red", size: 45, swath: 4 },
    { type: "Pointer", bodyColor: "green", size: 45, swath: 4 },
    { type: "CombineHarvester", bodyColor: "yellow", size: 60, swath: 12 },
    { type: "Excavator", bodyColor: "orange", size: 70, swath: 4 },
    { type: "Tractor", bodyColor: "green", size: 45, swath: 4 },
    { type: "WheelLoader", bodyColor: "yellow", size: 60, swath: 4 },
    { type: "WorkCar", bodyColor: "red", size: 45, swath: 4 },
    { type: "Airplane", bodyColor: "blue", size: 85, swath: 50 },
  ]

  // Use the exact same color array as your original component - simple strings
  const colors = [
    "Red",
    "Blue",
    "Green",
    "Yellow",
    "Orange",
    "Purple",
    "SkyBlue",
    "LightGreen",
    "HotPink",
  ]

  // Initialize selections from store values
  let selectedVehicle = currentVehicleType
  let selectedColor = currentVehicleColor
  let selectedSwath = currentVehicleSwath
  let tempSwath = currentVehicleSwath // For slider

  // Update selections when store changes
  $: {
    selectedVehicle = currentVehicleType
    selectedColor = currentVehicleColor
    selectedSwath = currentVehicleSwath
    tempSwath = currentVehicleSwath
  }

  // Track if any changes have been made
  $: hasChanges =
    selectedVehicle !== currentVehicleType ||
    selectedColor !== currentVehicleColor ||
    selectedSwath !== currentVehicleSwath

  function showSubPanel(panel) {
    if (panel === "swath") {
      tempSwath = selectedSwath
    }
    activeSubPanel = panel
  }

  function hideSubPanel() {
    activeSubPanel = null
  }

  function selectVehicle(vehicleType) {
    selectedVehicle = vehicleType
    const vehicle = vehicles.find((v) => v.type === vehicleType)
    if (vehicle) {
      selectedSwath = vehicle.swath
      tempSwath = vehicle.swath
    }
    hideSubPanel()
  }

  function selectColor(colorName) {
    selectedColor = colorName
    hideSubPanel()
  }

  function confirmSwath() {
    selectedSwath = tempSwath
    hideSubPanel()
  }

  function updateTempSwath(delta) {
    tempSwath = Math.max(2, Math.min(60, tempSwath + delta))
  }

  function setTempSwath(value) {
    tempSwath = value
  }

  // FIXED: Get proper default size for vehicle type
  function getDefaultSizeForVehicle(vehicleType) {
    const vehicle = vehicles.find((v) => v.type === vehicleType)
    return vehicle ? vehicle.size : 120 // Fallback to reasonable default
  }

  // Main confirm function that updates the store and closes menu
  function confirmVehicleSelection() {
    const defaultSize = getDefaultSizeForVehicle(selectedVehicle)

    // ALWAYS use vehicle-specific default size (ignore existing size)
    const finalSize = defaultSize

    console.log(`🚜 Vehicle size logic:`)
    console.log(`  - Selected vehicle: ${selectedVehicle}`)
    console.log(`  - Default size for vehicle: ${defaultSize}`)
    console.log(`  - Final size (always default): ${finalSize}`)

    // Update the vehicle store
    userVehicleStore.update((vehicle) => ({
      ...vehicle,
      vehicle_marker: {
        ...vehicle.vehicle_marker,
        type: selectedVehicle,
        bodyColor: selectedColor,
        swath: selectedSwath,
        size: finalSize, // Always uses the vehicle-specific default
      },
    }))

    // Show success message
    toast.success(
      `Vehicle updated: ${getShortName(selectedVehicle)} • ${selectedColor} • ${selectedSwath}m • ${finalSize}px`,
    )

    // Close the toolbox by dispatching close event to parent
    dispatch("close")
  }

  function getShortName(vehicleType) {
    const shortNames = {
      FourWheelDriveTractor: "FWDTractor",
      TowBetweenSeeder: "TBSeeder",
      TowBehindSeeder: "TBSeeder",
      TowBehindSeederTracks: "TBSeederT",
      TowBehindBoomspray: "TBBoom",
      SelfPropelledBoomspray: "SPBoom",
      ThreePointBoomspray: "3PBoom",
      FarmUte: "FarmUte",
      FrontWheelChaserBin: "FWChaser",
      FourWheelDriveChaserBin: "FWDChaser",
      HeaderDuals: "HeaderD",
      HeaderSingles: "HeaderS",
      HeaderTracks: "HeaderT",
      SelfPropelledSwather: "SPSwather",
      Spreader: "Spreader",
      Truck: "Truck",
      CabOverTruck: "COTruck",
      CabOverRoadTrain: "CORoad",
      Baler: "Baler",
      Mower: "Mower",
      SelfPropelledMower: "SPMower",
      Telehandler: "Telehand",
      Loader: "Loader",
      SimpleTractor: "STractor",
      Pointer: "Pointer",
      CombineHarvester: "Combine",
      Excavator: "Excavator",
      Tractor: "Tractor",
      WheelLoader: "WLoader",
      WorkCar: "WorkCar",
      Airplane: "Airplane",
    }
    return shortNames[vehicleType] || vehicleType
  }

  // Function to get the exact color value that SVG components expect (just the string)
  function getColorValue(colorName) {
    return colorName // SVG components expect the string directly like "Blue", "Red", etc.
  }

  // Function to get display color for UI elements (CSS-compatible colors)
  function getDisplayColor(colorName) {
    const colorMap = {
      Red: "#ff0000",
      Blue: "#0000ff",
      Green: "#008000",
      Yellow: "#ffff00",
      Orange: "#ffa500",
      Purple: "#800080",
      SkyBlue: "#87ceeb",
      LightGreen: "#90ee90",
      HotPink: "#ff69b4",
    }
    return colorMap[colorName] || colorName.toLowerCase()
  }
</script>

<!-- Rest of the component remains exactly the same -->
<div class="vehicle-controls">
  {#if activeSubPanel === null}
    <!-- Main Vehicle Panel -->
    <div class="main-panel">
      <!-- Current Vehicle Display -->
      <div class="current-vehicle">
        <div class="vehicle-preview">
          <div class="vehicle-icon">
            {#if SVGComponents[selectedVehicle]}
              <svelte:component
                this={SVGComponents[selectedVehicle]}
                bodyColor={getColorValue(selectedColor)}
                size="60px"
              />
            {:else}
              <div class="fallback-icon">🚜</div>
            {/if}
          </div>
        </div>
        <div class="vehicle-details">
          <div class="vehicle-name">{getShortName(selectedVehicle)}</div>
          <div class="vehicle-specs">{selectedColor} • {selectedSwath}m</div>
        </div>
      </div>

      <!-- Quick Actions -->
      <div class="quick-actions">
        <button class="action-button" on:click={() => showSubPanel("vehicles")}>
          <div class="action-icon vehicle-icon-action">
            {#if SVGComponents[selectedVehicle]}
              <svelte:component
                this={SVGComponents[selectedVehicle]}
                bodyColor={getColorValue(selectedColor)}
                size="20px"
              />
            {:else}
              <div class="fallback-mini">🚜</div>
            {/if}
          </div>
          <div class="action-info">
            <div class="action-name">Vehicle Type</div>
            <div class="action-value">{getShortName(selectedVehicle)}</div>
          </div>
          <ChevronRight size={16} class="chevron" />
        </button>

        <button class="action-button" on:click={() => showSubPanel("colors")}>
          <div
            class="action-icon color-icon-action"
            style="background-color: {getDisplayColor(selectedColor)};"
          ></div>
          <div class="action-info">
            <div class="action-name">Color</div>
            <div class="action-value">{selectedColor}</div>
          </div>
          <ChevronRight size={16} class="chevron" />
        </button>

        <button class="action-button" on:click={() => showSubPanel("swath")}>
          <div class="action-icon">
            <ChevronsLeftRight size={20} />
          </div>
          <div class="action-info">
            <div class="action-name">Trail Width</div>
            <div class="action-value">{selectedSwath}m</div>
          </div>
          <ChevronRight size={16} class="chevron" />
        </button>
      </div>

      <!-- Confirm Button - Only show if there are changes -->
      {#if hasChanges}
        <div class="confirm-section">
          <button class="main-confirm-btn" on:click={confirmVehicleSelection}>
            <Check size={18} class="confirm-icon" />
            <span class="confirm-text">Confirm Selection</span>
          </button>
        </div>
      {/if}
    </div>
  {:else if activeSubPanel === "vehicles"}
    <!-- Vehicle Selection -->
    <div class="sub-panel">
      <div class="sub-header">
        <button class="back-btn" on:click={hideSubPanel}>←</button>
        <h4>Select Vehicle</h4>
      </div>
      <div class="scrollable-content">
        <div class="vehicle-grid">
          {#each vehicles as vehicle}
            <button
              class="vehicle-option"
              class:selected={selectedVehicle === vehicle.type}
              on:click={() => selectVehicle(vehicle.type)}
            >
              <div class="vehicle-icon-small">
                {#if SVGComponents[vehicle.type]}
                  <svelte:component
                    this={SVGComponents[vehicle.type]}
                    bodyColor={getColorValue(selectedColor)}
                    size="40px"
                  />
                {:else}
                  <div class="fallback-icon-small">🚜</div>
                {/if}
              </div>
              <div class="vehicle-label">{getShortName(vehicle.type)}</div>
            </button>
          {/each}
        </div>
      </div>
    </div>
  {:else if activeSubPanel === "colors"}
    <!-- Color Selection -->
    <div class="sub-panel">
      <div class="sub-header">
        <button class="back-btn" on:click={hideSubPanel}>←</button>
        <h4>Select Color</h4>
      </div>
      <div class="scrollable-content">
        <div class="color-grid">
          {#each colors as colorName}
            <button
              class="color-option"
              class:selected={selectedColor === colorName}
              style="background-color: {getDisplayColor(colorName)};"
              on:click={() => selectColor(colorName)}
            >
              <div class="color-label">{colorName}</div>
            </button>
          {/each}
        </div>
      </div>
    </div>
  {:else if activeSubPanel === "swath"}
    <!-- Swath Selection with Slider -->
    <div class="sub-panel">
      <div class="sub-header">
        <button class="back-btn" on:click={hideSubPanel}>←</button>
        <h4>Trail Width</h4>
      </div>
      <div class="swath-controls">
        <div class="swath-display">
          <div class="swath-value-large">{tempSwath}m</div>
          <div class="swath-category">
            {#if tempSwath <= 4}Small
            {:else if tempSwath <= 12}Medium
            {:else if tempSwath <= 24}Large
            {:else}X-Large{/if}
          </div>
        </div>

        <div class="slider-section">
          <button class="slider-btn" on:click={() => updateTempSwath(-1)}>
            <Minus size={16} />
          </button>
          <div class="slider-container">
            <input
              type="range"
              min="2"
              max="60"
              bind:value={tempSwath}
              class="custom-slider"
            />
          </div>
          <button class="slider-btn" on:click={() => updateTempSwath(1)}>
            <Plus size={16} />
          </button>
        </div>

        <div class="preset-buttons">
          {#each [4, 8, 12, 18, 24, 36, 50] as preset}
            <button
              class="preset-btn"
              class:active={tempSwath === preset}
              on:click={() => setTempSwath(preset)}
            >
              {preset}m
            </button>
          {/each}
        </div>

        <button class="confirm-btn" on:click={confirmSwath}>
          <Check size={16} />
          Confirm Width
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .vehicle-controls {
    padding: 16px;
    height: 100%;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .main-panel {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .current-vehicle {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    padding: 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
  }

  .vehicle-preview {
    background: linear-gradient(
      135deg,
      rgba(96, 165, 250, 0.2),
      rgba(96, 165, 250, 0.1)
    );
    border: 2px solid rgba(96, 165, 250, 0.4);
    border-radius: 12px;
    padding: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 8px 16px rgba(96, 165, 250, 0.3);
  }

  .vehicle-icon {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .fallback-icon {
    font-size: 48px;
  }

  .vehicle-details {
    text-align: center;
  }

  .vehicle-name {
    font-size: 16px;
    font-weight: 600;
    color: white;
    margin-bottom: 4px;
  }

  .vehicle-specs {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.6);
  }

  .quick-actions {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .action-button {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 16px;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
  }

  .action-button:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.2);
    transform: translateY(-1px);
  }

  .action-icon {
    border-radius: 8px;
    padding: 8px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
  }

  .vehicle-icon-action {
    background: rgba(255, 255, 255, 0.1);
  }

  .color-icon-action {
    border: 2px solid rgba(255, 255, 255, 0.3);
  }

  .action-icon:not(.color-icon-action) {
    background: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.8);
  }

  .fallback-mini {
    font-size: 16px;
  }

  .action-info {
    flex: 1;
    text-align: left;
  }

  .action-name {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.6);
    margin-bottom: 2px;
  }

  .action-value {
    font-size: 14px;
    font-weight: 500;
    color: white;
  }

  .chevron {
    color: rgba(255, 255, 255, 0.4);
    transition: all 0.2s ease;
    flex-shrink: 0;
  }

  .action-button:hover .chevron {
    color: rgba(255, 255, 255, 0.8);
    transform: translateX(2px);
  }

  /* Main confirm button styling - Improved for mobile */
  .confirm-section {
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    padding-top: 16px;
    margin-top: auto;
  }

  .main-confirm-btn {
    background: rgba(34, 197, 94, 0.2);
    border: 1px solid rgba(34, 197, 94, 0.4);
    border-radius: 12px;
    padding: 14px 16px;
    color: #22c55e;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    min-height: 48px;
  }

  .main-confirm-btn:hover {
    background: rgba(34, 197, 94, 0.3);
    border-color: rgba(34, 197, 94, 0.5);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(34, 197, 94, 0.3);
  }

  .confirm-icon {
    flex-shrink: 0;
  }

  .confirm-text {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sub-panel {
    display: flex;
    flex-direction: column;
    gap: 16px;
    height: 100%;
    overflow: hidden;
  }

  .sub-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    flex-shrink: 0;
  }

  .back-btn {
    background: rgba(255, 255, 255, 0.1);
    border: none;
    border-radius: 8px;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(255, 255, 255, 0.8);
    cursor: pointer;
    transition: all 0.2s ease;
    font-size: 16px;
    font-weight: bold;
  }

  .back-btn:hover {
    background: rgba(255, 255, 255, 0.2);
    color: white;
  }

  .sub-header h4 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: white;
  }

  .scrollable-content {
    flex: 1;
    overflow-y: auto;
  }

  .vehicle-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
    padding-bottom: 20px;
  }

  .vehicle-option {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 12px;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }

  .vehicle-option:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.2);
  }

  .vehicle-option.selected {
    background: rgba(96, 165, 250, 0.2);
    border-color: rgba(96, 165, 250, 0.4);
  }

  .vehicle-icon-small {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 40px;
  }

  .fallback-icon-small {
    font-size: 24px;
  }

  .vehicle-label {
    font-size: 11px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.8);
    text-align: center;
    line-height: 1.2;
  }

  .color-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
    padding-bottom: 20px;
  }

  .color-option {
    border: 2px solid rgba(255, 255, 255, 0.2);
    border-radius: 12px;
    padding: 16px;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 60px;
    position: relative;
  }

  .color-option:hover {
    transform: scale(1.05);
    border-color: rgba(255, 255, 255, 0.4);
  }

  .color-option.selected {
    border-color: white;
    box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.5);
  }

  .color-label {
    background: rgba(0, 0, 0, 0.7);
    color: white;
    padding: 4px 8px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 500;
  }

  .swath-controls {
    display: flex;
    flex-direction: column;
    gap: 24px;
    padding: 20px 0;
  }

  .swath-display {
    text-align: center;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 16px;
    padding: 20px;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .swath-value-large {
    font-size: 32px;
    font-weight: 700;
    color: #60a5fa;
    margin-bottom: 8px;
  }

  .swath-category {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.6);
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .slider-section {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .slider-btn {
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 8px;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(255, 255, 255, 0.8);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .slider-btn:hover {
    background: rgba(255, 255, 255, 0.2);
    color: white;
  }

  .slider-container {
    flex: 1;
  }

  .custom-slider {
    width: 100%;
    height: 6px;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.2);
    outline: none;
    -webkit-appearance: none;
  }

  .custom-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #60a5fa;
    cursor: pointer;
    border: 2px solid white;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }

  .custom-slider::-moz-range-thumb {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #60a5fa;
    cursor: pointer;
    border: 2px solid white;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }

  .preset-buttons {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }

  .preset-btn {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 8px 4px;
    color: rgba(255, 255, 255, 0.8);
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .preset-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: white;
  }

  .preset-btn.active {
    background: rgba(96, 165, 250, 0.3);
    border-color: rgba(96, 165, 250, 0.5);
    color: #60a5fa;
  }

  .confirm-btn {
    background: rgba(96, 165, 250, 0.2);
    border: 1px solid rgba(96, 165, 250, 0.4);
    border-radius: 12px;
    padding: 16px;
    color: #60a5fa;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  .confirm-btn:hover {
    background: rgba(96, 165, 250, 0.3);
    border-color: rgba(96, 165, 250, 0.5);
    transform: translateY(-1px);
  }

  /* Mobile Responsive */
  @media (max-width: 768px) {
    .vehicle-controls {
      padding: 12px;
    }

    .main-panel {
      gap: 16px;
    }

    .current-vehicle {
      padding: 16px;
    }

    .vehicle-preview {
      padding: 12px;
    }

    .vehicle-grid,
    .color-grid {
      gap: 10px;
    }

    .vehicle-option,
    .color-option {
      padding: 10px;
    }

    .preset-buttons {
      grid-template-columns: repeat(3, 1fr);
    }

    /* Mobile confirm button improvements */
    .confirm-section {
      padding-top: 12px;
      margin-top: 8px;
    }

    .main-confirm-btn {
      padding: 12px 14px;
      font-size: 14px;
      min-height: 44px;
      gap: 6px;
    }

    .confirm-icon {
      width: 16px;
      height: 16px;
    }

    .confirm-text {
      font-size: 14px;
    }
  }

  @media (max-width: 480px) {
    .vehicle-controls {
      padding: 10px;
    }

    .main-panel {
      gap: 14px;
    }

    .current-vehicle {
      padding: 14px;
      gap: 12px;
    }

    .vehicle-preview {
      padding: 10px;
    }

    .action-button {
      padding: 12px;
    }

    .quick-actions {
      gap: 10px;
    }

    /* Extra small mobile confirm button */
    .main-confirm-btn {
      padding: 10px 12px;
      font-size: 13px;
      min-height: 40px;
      gap: 4px;
    }

    .confirm-text {
      font-size: 13px;
    }
  }

  /* Scrollbar styling */
  .scrollable-content::-webkit-scrollbar {
    width: 4px;
  }

  .scrollable-content::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2px;
  }

  .scrollable-content::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.3);
    border-radius: 2px;
  }
</style>
