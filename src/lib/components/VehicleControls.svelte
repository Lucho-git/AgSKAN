<!-- src/lib/components/VehicleControls.svelte -->
<script>
  import { createEventDispatcher } from "svelte"
  import {
    ChevronRight,
    Check,
    Minus,
    Plus,
    ChevronsLeftRight,
    Star,
    Bookmark,
    Truck,
    Trash2,
  } from "lucide-svelte"
  import SVGComponents from "$lib/vehicles/index.js"
  import { userVehicleStore } from "$lib/stores/vehicleStore"
  import { vehiclePresetStore } from "$lib/stores/vehiclePresetStore"
  import { profileStore } from "$lib/stores/profileStore"
  import { toast } from "svelte-sonner"
  import PresetNameDialog from "./PresetNameDialog.svelte"

  const dispatch = createEventDispatcher()

  // Get current values directly from store
  $: currentVehicleType = $userVehicleStore.vehicle_marker?.type || "Pointer"
  $: currentVehicleColor =
    $userVehicleStore.vehicle_marker?.bodyColor || "Yellow"
  $: currentVehicleSwath = $userVehicleStore.vehicle_marker?.swath || 12

  // Active sub-panel state
  let activeSubPanel = null // null, 'vehicles', 'colors', 'swath', 'presets'

  // Dialog state
  let showPresetDialog = false

  // Check if current config is saved as preset
  $: currentPreset = $vehiclePresetStore.find(
    (p) =>
      p.type === selectedVehicle &&
      p.body_color === selectedColor &&
      p.swath === selectedSwath,
  )
  $: isCurrentConfigSaved = !!currentPreset

  // Complete vehicle data with proper default sizes
  const vehicles = [
    { type: "FourWheelDriveTractor", color: "green", size: 35, swath: 4 },
    { type: "TowBetweenSeeder", color: "red", size: 80, swath: 12 },
    { type: "TowBehindSeeder", color: "red", size: 80, swath: 12 },
    { type: "TowBehindSeederTracks", color: "red", size: 80, swath: 12 },
    { type: "TowBehindBoomspray", color: "red", size: 80, swath: 36 },
    { type: "SelfPropelledBoomspray", color: "red", size: 45, swath: 36 },
    { type: "ThreePointBoomspray", color: "red", size: 45, swath: 36 },
    { type: "FarmUte", color: "red", size: 40, swath: 4 },
    { type: "FrontWheelChaserBin", color: "red", size: 70, swath: 12 },
    { type: "FourWheelDriveChaserBin", color: "red", size: 70, swath: 12 },
    { type: "HeaderDuals", color: "red", size: 50, swath: 12 },
    { type: "HeaderSingles", color: "red", size: 50, swath: 12 },
    { type: "HeaderTracks", color: "red", size: 50, swath: 12 },
    { type: "SelfPropelledSwather", color: "red", size: 50, swath: 12 },
    { type: "Spreader", color: "red", size: 80, swath: 12 },
    { type: "Truck", color: "red", size: 60, swath: 4 },
    { type: "CabOverTruck", color: "red", size: 60, swath: 4 },
    { type: "CabOverRoadTrain", color: "red", size: 100, swath: 4 },
    { type: "Baler", color: "red", size: 80, swath: 12 },
    { type: "Mower", color: "red", size: 60, swath: 12 },
    { type: "SelfPropelledMower", color: "red", size: 60, swath: 12 },
    { type: "Telehandler", color: "red", size: 70, swath: 12 },
    { type: "Loader", color: "red", size: 50, swath: 4 },
    { type: "SimpleTractor", color: "red", size: 45, swath: 4 },
    { type: "Pointer", color: "green", size: 45, swath: 4 },
    { type: "CombineHarvester", color: "yellow", size: 60, swath: 12 },
    { type: "Excavator", color: "orange", size: 70, swath: 4 },
    { type: "Tractor", color: "green", size: 45, swath: 4 },
    { type: "WheelLoader", color: "yellow", size: 60, swath: 4 },
    { type: "WorkCar", color: "red", size: 45, swath: 4 },
    { type: "Airplane", color: "blue", size: 85, swath: 50 },
  ]

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
  let tempSwath = currentVehicleSwath

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

  function getDefaultSizeForVehicle(vehicleType) {
    const vehicle = vehicles.find((v) => v.type === vehicleType)
    return vehicle ? vehicle.size : 45
  }

  function confirmVehicleSelection() {
    const defaultSize = getDefaultSizeForVehicle(selectedVehicle)

    console.log(`🚜 Vehicle updated:`, {
      type: selectedVehicle,
      bodyColor: selectedColor,
      swath: selectedSwath,
      size: defaultSize,
    })

    userVehicleStore.updateVehicleMarker({
      type: selectedVehicle,
      bodyColor: selectedColor,
      swath: selectedSwath,
      size: defaultSize,
    })

    const matchingPreset = $vehiclePresetStore.find(
      (p) =>
        p.type === selectedVehicle &&
        p.body_color === selectedColor &&
        p.swath === selectedSwath,
    )

    const displayName = matchingPreset
      ? matchingPreset.name
      : `${getShortName(selectedVehicle)} • ${selectedColor} • ${selectedSwath}m`

    toast.success(`Vehicle updated: ${displayName}`)

    dispatch("close")
  }

  function openSavePresetDialog() {
    showPresetDialog = true
  }

  // 🆕 NEW: Star button handler - Save OR Delete
  async function handleStarButtonClick() {
    if (isCurrentConfigSaved && currentPreset) {
      // Store the preset name BEFORE deleting (so we can use it in the toast)
      const presetNameToDelete = currentPreset.name
      const presetIdToDelete = currentPreset.id

      // Configuration is already saved - offer to delete
      if (confirm(`Delete preset "${presetNameToDelete}"?`)) {
        try {
          await vehiclePresetStore.deletePreset(presetIdToDelete)
          toast.success(`Preset "${presetNameToDelete}" deleted`)
        } catch (error) {
          console.error("Delete preset error:", error)
          toast.error("Failed to delete preset")
        }
      }
    } else {
      // Configuration is not saved - offer to save
      openSavePresetDialog()
    }
  }

  async function handleSavePreset(event) {
    const { name } = event.detail
    const defaultSize = getDefaultSizeForVehicle(selectedVehicle)

    try {
      await vehiclePresetStore.addPreset(
        $profileStore.master_map_id,
        $profileStore.id,
        {
          name,
          type: selectedVehicle,
          bodyColor: selectedColor,
          swath: selectedSwath,
          size: defaultSize,
        },
      )

      showPresetDialog = false
      toast.success(`Preset "${name}" saved!`)
    } catch (error) {
      toast.error(error.message || "Failed to save preset")
    }
  }

  function handleCancelPresetDialog() {
    showPresetDialog = false
  }

  function loadPreset(preset) {
    selectedVehicle = preset.type
    selectedColor = preset.body_color
    selectedSwath = preset.swath
    tempSwath = preset.swath

    hideSubPanel()
    toast.success(`Loaded preset: ${preset.name}`)
  }

  async function deletePreset(event, presetId, presetName) {
    event.stopPropagation() // Prevent card click

    if (confirm(`Delete preset "${presetName}"?`)) {
      try {
        await vehiclePresetStore.deletePreset(presetId)
        toast.success(`Preset "${presetName}" deleted`)
      } catch (error) {
        toast.error("Failed to delete preset")
      }
    }
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

  function getColorValue(colorName) {
    return colorName
  }

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

        <!-- Star button moved below vehicle icon -->
        <div class="vehicle-details">
          <div class="vehicle-name-row">
            <div class="vehicle-name">
              {#if currentPreset}
                {currentPreset.name}
              {:else}
                {getShortName(selectedVehicle)}
              {/if}
            </div>
            <!-- 🆕 UPDATED: Star button now calls handleStarButtonClick -->
            <button
              class="star-button-inline"
              class:saved={isCurrentConfigSaved}
              on:click={handleStarButtonClick}
              title={isCurrentConfigSaved
                ? `Delete preset "${currentPreset?.name}"`
                : "Save as preset"}
            >
              <Star
                size={18}
                fill={isCurrentConfigSaved ? "currentColor" : "none"}
              />
            </button>
          </div>
          <div class="vehicle-specs">{selectedColor} • {selectedSwath}m</div>
        </div>
      </div>

      <!-- Rest of your component stays exactly the same... -->
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

        <button
          class="action-button preset-action"
          on:click={() => showSubPanel("presets")}
        >
          <div class="action-icon">
            <Bookmark size={20} />
          </div>
          <div class="action-info">
            <div class="action-name">My Presets</div>
            <div class="action-value">{$vehiclePresetStore.length} saved</div>
          </div>
          <ChevronRight size={16} class="chevron" />
        </button>
      </div>

      {#if hasChanges}
        <div class="confirm-section">
          <button class="main-confirm-btn" on:click={confirmVehicleSelection}>
            <Check size={18} class="confirm-icon" />
            <span class="confirm-text">Confirm Selection</span>
          </button>
        </div>
      {/if}
    </div>
  {:else if activeSubPanel === "presets"}
    <!-- Presets Sub-Panel -->
    <div class="sub-panel">
      <div class="sub-header">
        <button class="back-btn" on:click={hideSubPanel}>←</button>
        <h4>My Presets</h4>
      </div>
      <div class="scrollable-content">
        {#if $vehiclePresetStore.length === 0}
          <div class="empty-state">
            <Bookmark size={48} class="empty-icon" />
            <p class="empty-title">No presets saved yet</p>
            <p class="empty-description">
              Configure your vehicle, then tap the star icon to save it as a
              preset.
            </p>
          </div>
        {:else}
          <div class="preset-grid">
            {#each $vehiclePresetStore as preset (preset.id)}
              <button class="preset-card" on:click={() => loadPreset(preset)}>
                <div class="preset-header">
                  <div class="preset-icon">
                    {#if SVGComponents[preset.type]}
                      <svelte:component
                        this={SVGComponents[preset.type]}
                        bodyColor={preset.body_color}
                        size="40px"
                      />
                    {:else}
                      <div class="fallback-icon-small">🚜</div>
                    {/if}
                  </div>
                  <!-- 🆕 Delete button -->
                  <button
                    class="preset-delete"
                    on:click={(e) => deletePreset(e, preset.id, preset.name)}
                    title="Delete preset"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div class="preset-info">
                  <div class="preset-name">{preset.name}</div>
                  <div class="preset-specs">
                    {preset.body_color} • {preset.swath}m
                  </div>
                </div>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  {:else if activeSubPanel === "vehicles"}
    <!-- Vehicle Selection with Presets at Top -->
    <div class="sub-panel">
      <div class="sub-header">
        <button class="back-btn" on:click={hideSubPanel}>←</button>
        <h4>Select Vehicle</h4>
      </div>
      <div class="scrollable-content">
        <!-- My Presets Section (shown at top if presets exist) -->
        {#if $vehiclePresetStore.length > 0}
          <div class="presets-in-vehicles-section">
            <div class="section-header">
              <Bookmark size={14} />
              <span>MY PRESETS</span>
            </div>
            <div class="preset-quick-grid">
              {#each $vehiclePresetStore as preset (preset.id)}
                <button
                  class="preset-quick-card"
                  class:selected={selectedVehicle === preset.type &&
                    selectedColor === preset.body_color &&
                    selectedSwath === preset.swath}
                  on:click={() => loadPreset(preset)}
                >
                  <!-- 🆕 Delete button in quick preset -->
                  <button
                    class="preset-quick-delete"
                    on:click={(e) => deletePreset(e, preset.id, preset.name)}
                    title="Delete preset"
                  >
                    <Trash2 size={12} />
                  </button>

                  <div class="preset-quick-icon">
                    {#if SVGComponents[preset.type]}
                      <svelte:component
                        this={SVGComponents[preset.type]}
                        bodyColor={preset.body_color}
                        size="32px"
                      />
                    {:else}
                      <div class="fallback-icon-small">🚜</div>
                    {/if}
                  </div>
                  <div class="preset-quick-name">{preset.name}</div>
                  <div class="preset-quick-specs">
                    {preset.body_color} • {preset.swath}m
                  </div>
                </button>
              {/each}
            </div>
            <div class="section-divider"></div>
          </div>
        {/if}

        <!-- All Vehicles Section -->
        <div class="all-vehicles-section">
          {#if $vehiclePresetStore.length > 0}
            <div class="section-header">
              <Truck size={14} />
              <span>ALL VEHICLES</span>
            </div>
          {/if}
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
    <!-- Swath Selection -->
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

<!-- Preset Name Dialog -->
<PresetNameDialog
  isOpen={showPresetDialog}
  on:save={handleSavePreset}
  on:cancel={handleCancelPresetDialog}
/>

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
    position: relative;
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
    width: 100%;
  }

  /* 🆕 NEW: Vehicle name row with inline star button */
  .vehicle-name-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin-bottom: 4px;
  }

  .vehicle-name {
    font-size: 16px;
    font-weight: 600;
    color: white;
  }

  /* 🆕 NEW: Inline star button styling */
  .star-button-inline {
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 50%;
    width: 32px;
    height: 32px;
    min-width: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s ease;
    color: rgba(255, 255, 255, 0.6);
    padding: 0;
  }

  .star-button-inline:hover {
    background: rgba(0, 0, 0, 0.5);
    border-color: rgba(255, 255, 255, 0.4);
    color: white;
    transform: scale(1.15);
  }

  .star-button-inline.saved {
    color: #fbbf24;
    background: rgba(251, 191, 36, 0.2);
    border-color: rgba(251, 191, 36, 0.4);
  }

  .star-button-inline.saved:hover {
    background: rgba(251, 191, 36, 0.3);
    border-color: rgba(251, 191, 36, 0.6);
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

  .preset-action {
    border-color: rgba(251, 191, 36, 0.3);
  }

  .preset-action:hover {
    border-color: rgba(251, 191, 36, 0.5);
    background: rgba(251, 191, 36, 0.1);
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

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px 20px;
    text-align: center;
  }

  .empty-icon {
    color: rgba(255, 255, 255, 0.3);
    margin-bottom: 16px;
  }

  .empty-title {
    font-size: 16px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.8);
    margin: 0 0 8px;
  }

  .empty-description {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.5);
    margin: 0;
    max-width: 280px;
    line-height: 1.5;
  }

  .preset-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 12px;
    padding-bottom: 20px;
  }

  .preset-card {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 16px;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .preset-card:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.2);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  }

  .preset-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .preset-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 40px;
  }

  .preset-delete {
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 6px;
    width: 28px;
    height: 28px;
    min-width: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #ef4444;
    cursor: pointer;
    transition: all 0.2s ease;
    padding: 0;
  }

  .preset-delete:hover {
    background: rgba(239, 68, 68, 0.2);
    border-color: rgba(239, 68, 68, 0.5);
    transform: scale(1.1);
  }

  .preset-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .preset-name {
    font-size: 14px;
    font-weight: 600;
    color: white;
    text-align: left;
  }

  .preset-specs {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.6);
    text-align: left;
  }

  .presets-in-vehicles-section {
    margin-bottom: 20px;
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 0 12px;
    color: rgba(255, 255, 255, 0.6);
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .preset-quick-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
    margin-bottom: 16px;
  }

  .preset-quick-card {
    background: linear-gradient(
      135deg,
      rgba(251, 191, 36, 0.1),
      rgba(251, 191, 36, 0.05)
    );
    border: 1px solid rgba(251, 191, 36, 0.3);
    border-radius: 12px;
    padding: 12px;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    position: relative;
  }

  .preset-quick-card:hover {
    background: linear-gradient(
      135deg,
      rgba(251, 191, 36, 0.2),
      rgba(251, 191, 36, 0.1)
    );
    border-color: rgba(251, 191, 36, 0.5);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(251, 191, 36, 0.3);
  }

  .preset-quick-card.selected {
    background: linear-gradient(
      135deg,
      rgba(251, 191, 36, 0.3),
      rgba(251, 191, 36, 0.2)
    );
    border-color: rgba(251, 191, 36, 0.6);
    box-shadow: 0 0 0 2px rgba(251, 191, 36, 0.3);
  }

  /* 🆕 NEW: Delete button for quick presets */
  .preset-quick-delete {
    position: absolute;
    top: 4px;
    right: 4px;
    background: rgba(239, 68, 68, 0.2);
    border: 1px solid rgba(239, 68, 68, 0.4);
    border-radius: 50%;
    width: 24px;
    height: 24px;
    min-width: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #ef4444;
    cursor: pointer;
    transition: all 0.2s ease;
    padding: 0;
    z-index: 10;
  }

  .preset-quick-delete:hover {
    background: rgba(239, 68, 68, 0.3);
    border-color: rgba(239, 68, 68, 0.6);
    transform: scale(1.15);
  }

  .preset-quick-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 32px;
    margin-bottom: 4px;
  }

  .preset-quick-name {
    font-size: 12px;
    font-weight: 600;
    color: white;
    text-align: center;
    line-height: 1.2;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .preset-quick-specs {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.6);
    text-align: center;
  }

  .section-divider {
    height: 1px;
    background: linear-gradient(
      to right,
      transparent,
      rgba(255, 255, 255, 0.1),
      transparent
    );
    margin: 16px 0;
  }

  .all-vehicles-section {
    /* Container for all vehicles */
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

  @media (max-width: 768px) {
    .vehicle-controls {
      padding: 12px;
    }

    .preset-grid,
    .preset-quick-grid {
      gap: 10px;
    }
  }

  @media (max-width: 480px) {
    .vehicle-controls {
      padding: 10px;
    }

    .preset-card {
      padding: 14px;
    }

    .preset-name {
      font-size: 13px;
    }

    .preset-specs {
      font-size: 11px;
    }
  }

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
