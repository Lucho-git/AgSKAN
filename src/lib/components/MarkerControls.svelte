<!-- src/lib/components/MarkerControls.svelte -->
<script lang="ts">
  import { createEventDispatcher } from "svelte"
  import { Target, ChevronRight } from "lucide-svelte"
  import { toast } from "svelte-sonner"
  import IconSVG from "../../components/IconSVG.svelte"
  import { userSettingsStore } from "$lib/stores/userSettingsStore"
  import { userSettingsApi } from "$lib/api/userSettingsApi"
  import { markerPlacementModeEnabled } from "$lib/stores/controlStore" // ADD THIS IMPORT

  const dispatch = createEventDispatcher()

  // Active sub-panel state
  let activeSubPanel = null // null, 'markers'

  // Marker placement state - now reactive to store
  $: markerPlacementMode = $markerPlacementModeEnabled // CHANGE THIS LINE

  // All marker icons data
  const allMarkerIcons = [
    { id: "default", class: "default", name: "Default Marker" },

    { id: "rock", class: "custom-svg", name: "Rock" },
    { id: "tree13", class: "custom-svg", name: "Tree" },
    { id: "watertank2", class: "custom-svg", name: "Water Tank" },
    { id: "wheat2", class: "custom-svg", name: "Wheat" },
    { id: "kangaroo", class: "custom-svg", name: "Kangaroo" },
    { id: "electric_tower", class: "custom-svg", name: "Power Tower" },
    { id: "gate", class: "custom-svg", name: "Gate" },
    { id: "machine_pump", class: "custom-svg", name: "Pump" },
    { id: "recharge_icon", class: "custom-svg", name: "Charging" },
    { id: "repair_shop", class: "custom-svg", name: "Repair Shop" },
    { id: "tractor", class: "custom-svg", name: "Tractor" },
    { id: "silo2", class: "custom-svg", name: "Silo" },
    { id: "tree_stump", class: "custom-svg", name: "Tree Stump" },
    { id: "workshop_icon", class: "custom-svg", name: "Workshop" },
    { id: "pin", class: "ionic-pin", name: "Pin" },
    { id: "arrow-up-circle", class: "ionic-arrow-up-circle", name: "Arrow Up" },
    {
      id: "arrow-down-circle",
      class: "ionic-arrow-down-circle",
      name: "Arrow Down",
    },
    {
      id: "arrow-back-circle",
      class: "ionic-arrow-back-circle",
      name: "Arrow Back",
    },
    {
      id: "arrow-forward-circle",
      class: "ionic-arrow-forward-circle",
      name: "Arrow Forward",
    },
    { id: "thumbs-down", class: "ionic-thumbs-down", name: "Thumbs Down" },
    { id: "thumbs-up", class: "ionic-thumbs-up", name: "Thumbs Up" },
    {
      id: "accessibility",
      class: "ionic-accessibility",
      name: "Accessibility",
    },
    { id: "people", class: "ionic-people", name: "People" },
    { id: "settings", class: "ionic-settings", name: "Settings" },
    { id: "home", class: "ionic-home", name: "Home" },
    {
      id: "checkmark-circle",
      class: "ionic-checkmark-circle",
      name: "Success",
    },
    { id: "close-circle", class: "ionic-close-circle", name: "Error" },
    {
      id: "information-circle",
      class: "ionic-information-circle",
      name: "Info",
    },
    { id: "warning", class: "ionic-warning", name: "Warning" },
    { id: "help-circle", class: "ionic-help-circle", name: "Help" },
    { id: "ban", class: "ionic-ban", name: "Ban" },
    { id: "location", class: "ionic-location", name: "Location" },
    { id: "lock-closed", class: "ionic-lock-closed", name: "Locked" },
    { id: "lock-open", class: "ionic-lock-open", name: "Unlocked" },
    { id: "trash", class: "ionic-trash", name: "Trash" },
    { id: "cart", class: "ionic-cart", name: "Cart" },
    { id: "locate", class: "ionic-locate", name: "GPS" },
    { id: "leaf", class: "ionic-leaf", name: "Leaf" },
    { id: "call", class: "ionic-call", name: "Phone" },
    { id: "wifi", class: "ionic-wifi", name: "WiFi" },
    { id: "radio", class: "ionic-radio", name: "Radio" },
    { id: "cloud-offline", class: "ionic-cloud-offline", name: "Offline" },
    {
      id: "battery-charging",
      class: "ionic-battery-charging",
      name: "Charging",
    },
    { id: "thermometer", class: "ionic-thermometer", name: "Temperature" },
    { id: "sunny", class: "ionic-sunny", name: "Sunny" },
    { id: "cloud", class: "ionic-cloud", name: "Cloud" },
    { id: "thunderstorm", class: "ionic-thunderstorm", name: "Storm" },
    { id: "rainy", class: "ionic-rainy", name: "Rain" },
    { id: "water", class: "ionic-water", name: "Water" },
    { id: "fast-food", class: "ionic-fast-food", name: "Food" },
    { id: "restaurant", class: "ionic-restaurant", name: "Restaurant" },
    { id: "airplane", class: "ionic-airplane", name: "Airplane" },
    { id: "trail-sign", class: "ionic-trail-sign", name: "Trail" },
    { id: "car", class: "ionic-car", name: "Car" },
    { id: "beer", class: "ionic-beer", name: "Beer" },
    { id: "bonfire", class: "ionic-bonfire", name: "Fire" },
    { id: "boat", class: "ionic-boat", name: "Boat" },
    { id: "bed", class: "ionic-bed", name: "Bed" },
    { id: "bicycle", class: "ionic-bicycle", name: "Bicycle" },
    { id: "build", class: "ionic-build", name: "Build" },
    { id: "desktop", class: "ionic-desktop", name: "Computer" },
    { id: "earth", class: "ionic-earth", name: "Earth" },
    { id: "camera", class: "ionic-camera", name: "Camera" },
    { id: "fish", class: "ionic-fish", name: "Fish" },
    { id: "flame", class: "ionic-flame", name: "Flame" },
    { id: "footsteps", class: "ionic-footsteps", name: "Footsteps" },
    { id: "key", class: "ionic-key", name: "Key" },
    { id: "man", class: "ionic-man", name: "Person" },
    { id: "paw", class: "ionic-paw", name: "Animal" },
    { id: "skull", class: "ionic-skull", name: "Danger" },
    { id: "construct", class: "ionic-construct", name: "Construction" },
    { id: "bus", class: "ionic-bus", name: "Bus" },
    { id: "subway", class: "ionic-subway", name: "Subway" },
    { id: "telescope", class: "ionic-telescope", name: "Telescope" },
    {
      id: "construction-truck",
      class: "at-construction-truck",
      name: "Construction",
    },
    { id: "electric-car", class: "at-electric-car", name: "Electric Car" },
    { id: "gasoline", class: "at-gasoline", name: "Fuel" },
    { id: "kg-weight", class: "at-kg-weight", name: "Weight" },
    { id: "carrot", class: "at-carrot", name: "Carrot" },
    { id: "middle-finger", class: "at-middle-finger", name: "Rude" },
    { id: "toilet-bathroom", class: "at-toilet-bathroom", name: "Toilet" },
    { id: "car-garage", class: "at-car-garage", name: "Garage" },
    { id: "electricity-home", class: "at-electricity-home", name: "Power" },
    {
      id: "carrot-turnip-vegetable",
      class: "at-carrot-turnip-vegetable",
      name: "Vegetables",
    },
    { id: "wheat-harvest", class: "at-wheat-harvest", name: "Harvest" },
    {
      id: "helicopter-travel",
      class: "at-helicopter-travel",
      name: "Helicopter",
    },
    { id: "camper-vehicle", class: "at-camper-vehicle", name: "Camper" },
    { id: "cargo-transport", class: "at-cargo-transport", name: "Cargo" },
    { id: "bulldozer", class: "at-bulldozer", name: "Bulldozer" },
    {
      id: "construction-transport",
      class: "at-construction-transport",
      name: "Transport",
    },
    { id: "crane-truck", class: "at-crane-truck", name: "Crane" },
    { id: "delivery-truck", class: "at-delivery-truck", name: "Delivery" },
    {
      id: "liquid-transportation",
      class: "at-liquid-transportation",
      name: "Liquid",
    },
    { id: "transport-truck", class: "at-transport-truck", name: "Truck" },
    { id: "ladder-truck", class: "at-ladder-truck", name: "Ladder Truck" },
  ]

  // Lazy loading state
  let visibleMarkers = allMarkerIcons.slice(0, 20)
  let loadingMore = false
  let scrollContainer

  // Default marker selection - get from userSettingsStore or fallback to default
  $: selectedMarker = $userSettingsStore?.defaultMarker // Use camelCase
    ? (() => {
        const storeMarker = $userSettingsStore.defaultMarker
        return (
          allMarkerIcons.find(
            (icon) =>
              icon.id === storeMarker.id && icon.class === storeMarker.class,
          ) || allMarkerIcons.find((icon) => icon.id === "default")
        )
      })()
    : allMarkerIcons.find((icon) => icon.id === "default") || allMarkerIcons[0]

  function showSubPanel(panel) {
    activeSubPanel = panel
    // Reset visible markers when opening
    if (panel === "markers") {
      visibleMarkers = allMarkerIcons.slice(0, 20)
    }
  }

  function hideSubPanel() {
    activeSubPanel = null
  }

  async function selectMarker(marker) {
    selectedMarker = marker

    // Log the current store state first
    console.log("📊 Current userSettingsStore:", $userSettingsStore)

    try {
      // Update both the local store and database
      const result = await userSettingsApi.updateDefaultMarker({
        id: marker.id,
        class: marker.class,
        name: marker.name,
      })

      if (result.success) {
        console.log("🎯 Default marker updated!")
        console.log("Selected marker:", marker)
        console.log("Updated userSettingsStore:", $userSettingsStore)

        // Show success toast
        toast.success(`Default marker set: ${marker.name}`)
      } else {
        console.error("❌ API Error updating default marker:", result.message)
        toast.error("Failed to save default marker")
      }
    } catch (error) {
      console.error("❌ Error updating default marker:", error)
      toast.error("Failed to save default marker")
    }

    // Just go back to previous menu instead of closing everything
    hideSubPanel()
  }

  // REPLACE THE ENTIRE activateMarkerPlacement FUNCTION
  function activateMarkerPlacement() {
    // Toggle the store state
    markerPlacementModeEnabled.set(!$markerPlacementModeEnabled)

    if ($markerPlacementModeEnabled) {
      dispatch("close") // Close the toolbox
    }
  }

  // Lazy loading on scroll
  function handleScroll(e) {
    if (loadingMore || visibleMarkers.length >= allMarkerIcons.length) return

    const { scrollTop, scrollHeight, clientHeight } = e.target

    // Load more when near bottom (within 100px)
    if (scrollTop + clientHeight >= scrollHeight - 100) {
      loadMoreMarkers()
    }
  }

  function loadMoreMarkers() {
    if (loadingMore || visibleMarkers.length >= allMarkerIcons.length) return

    loadingMore = true

    // Simulate a slight delay for smooth loading
    setTimeout(() => {
      const nextBatch = allMarkerIcons.slice(
        visibleMarkers.length,
        visibleMarkers.length + 20,
      )
      visibleMarkers = [...visibleMarkers, ...nextBatch]
      loadingMore = false
    }, 100)
  }
</script>

<div class="marker-controls">
  {#if activeSubPanel === null}
    <!-- Main Marker Panel -->
    <div class="main-panel">
      <!-- Instructions -->
      <div class="quick-instructions">
        <div class="instruction-item">
          <span class="instruction-number">1</span>
          <span class="instruction-text">
            <strong>Quick:</strong> Press and hold on map
          </span>
        </div>
        <div class="instruction-item">
          <span class="instruction-number">2</span>
          <span class="instruction-text">
            <strong>Precise:</strong> Use crosshair tool below
          </span>
        </div>
      </div>

      <!-- Precise Placement Tool -->
      <button
        class="crosshair-button"
        class:active={markerPlacementMode}
        on:click={activateMarkerPlacement}
      >
        <div class="crosshair-icon">
          <Target size={32} />
        </div>
        <div class="crosshair-status">
          {#if markerPlacementMode}
            <span class="status-active">Active</span>
          {:else}
            <span class="status-inactive">Place Marker</span>
          {/if}
        </div>
      </button>

      <!-- Default Marker Button -->
      <div class="default-section">
        <h5>Default Marker</h5>
        <button
          class="default-marker-button"
          on:click={() => showSubPanel("markers")}
        >
          <div class="marker-icon-display">
            {#if selectedMarker.id === "default"}
              <IconSVG icon="mapbox-marker" size="36px" />
            {:else if selectedMarker.class.startsWith("custom-svg")}
              <IconSVG icon={selectedMarker.id} size="36px" />
            {:else if selectedMarker.class.startsWith("ionic-")}
              <ion-icon name={selectedMarker.id} style="font-size: 36px;"
              ></ion-icon>
            {:else}
              <i class={`${selectedMarker.class}`} style="font-size: 36px;"></i>
            {/if}
          </div>
          <div class="marker-info">
            <div class="marker-name">{selectedMarker.name}</div>
            <div class="change-hint">Tap to change</div>
          </div>
          <ChevronRight size={20} class="chevron" />
        </button>
      </div>
    </div>
  {:else if activeSubPanel === "markers"}
    <!-- Marker Selection -->
    <div class="sub-panel">
      <div class="sub-header">
        <button class="back-btn" on:click={hideSubPanel}>←</button>
        <h4>Select Marker</h4>
      </div>
      <div
        class="scrollable-content"
        bind:this={scrollContainer}
        on:scroll={handleScroll}
      >
        <div class="marker-grid">
          {#each visibleMarkers as marker}
            <button
              class="marker-option"
              class:selected={selectedMarker?.id === marker.id}
              on:click={() => selectMarker(marker)}
            >
              <div class="marker-icon-small">
                {#if marker.id === "default"}
                  <IconSVG icon="mapbox-marker" size="40px" />
                {:else if marker.class.startsWith("custom-svg")}
                  <IconSVG icon={marker.id} size="40px" />
                {:else if marker.class.startsWith("ionic-")}
                  <ion-icon name={marker.id} style="font-size: 40px;"
                  ></ion-icon>
                {:else}
                  <i class={`${marker.class}`} style="font-size: 40px;"></i>
                {/if}
              </div>
              <div class="marker-label">{marker.name}</div>
            </button>
          {/each}
        </div>

        <!-- Loading indicator -->
        {#if loadingMore}
          <div class="loading-indicator">
            <div class="loading-spinner"></div>
            <span>Loading more...</span>
          </div>
        {/if}

        <!-- End indicator -->
        {#if visibleMarkers.length >= allMarkerIcons.length}
          <div class="end-indicator">
            <span>All markers loaded ({allMarkerIcons.length} total)</span>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<!-- Keep all your existing styles exactly the same -->
<style>
  .marker-controls {
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

  .quick-instructions {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .instruction-item {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .instruction-number {
    background: rgba(96, 165, 250, 0.2);
    color: #60a5fa;
    border: 1px solid rgba(96, 165, 250, 0.3);
    border-radius: 50%;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 600;
    flex-shrink: 0;
  }

  .instruction-text {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.8);
    line-height: 1.2;
  }

  .instruction-text strong {
    color: white;
  }

  .crosshair-button {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    padding: 20px;
    cursor: pointer;
    transition: all 0.3s ease;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    width: 100%;
  }

  .crosshair-button:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.2);
    transform: translateY(-2px);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.3);
  }

  .crosshair-button.active {
    background: rgba(96, 165, 250, 0.2);
    border-color: rgba(96, 165, 250, 0.4);
    box-shadow: 0 0 20px rgba(96, 165, 250, 0.3);
  }

  .crosshair-icon {
    color: rgba(255, 255, 255, 0.8);
    transition: all 0.3s ease;
  }

  .crosshair-button.active .crosshair-icon {
    color: #60a5fa;
    transform: scale(1.1);
  }

  .crosshair-status {
    font-size: 13px;
    font-weight: 500;
  }

  .status-active {
    color: #22c55e;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-size: 11px;
    font-weight: 600;
  }

  .status-inactive {
    color: rgba(255, 255, 255, 0.6);
  }

  .default-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .default-section h5 {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: white;
  }

  .default-marker-button {
    background: linear-gradient(
      135deg,
      rgba(96, 165, 250, 0.2),
      rgba(96, 165, 250, 0.1)
    );
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 16px;
    padding: 16px;
    cursor: pointer;
    transition: all 0.3s ease;
    display: flex;
    align-items: center;
    gap: 14px;
    width: 100%;
  }

  .default-marker-button:hover {
    background: linear-gradient(
      135deg,
      rgba(96, 165, 250, 0.3),
      rgba(96, 165, 250, 0.15)
    );
    border-color: rgba(255, 255, 255, 0.3);
    transform: translateY(-2px);
  }

  .default-marker-button:hover .marker-icon-display {
    box-shadow: 0 6px 16px rgba(96, 165, 250, 0.4);
  }

  .marker-icon-display {
    background: rgba(255, 255, 255, 0.1);
    border: 2px solid rgba(96, 165, 250, 0.4);
    border-radius: 12px;
    padding: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 60px;
    height: 60px;
    flex-shrink: 0;
    color: rgba(255, 255, 255, 0.9);
    box-shadow: 0 4px 12px rgba(96, 165, 250, 0.3);
    transition: all 0.3s ease;
  }

  .mapbox-default-marker {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .marker-info {
    flex: 1;
    text-align: left;
  }

  .marker-name {
    font-size: 14px;
    font-weight: 600;
    color: white;
    margin-bottom: 4px;
  }

  .change-hint {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.6);
    font-style: italic;
  }

  .chevron {
    color: rgba(255, 255, 255, 0.4);
    transition: all 0.2s ease;
    flex-shrink: 0;
  }

  .default-marker-button:hover .chevron {
    color: rgba(255, 255, 255, 0.8);
    transform: translateX(4px);
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

  .marker-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
    padding-bottom: 20px;
  }

  .marker-option {
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

  .marker-option:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.2);
    transform: translateY(-1px);
  }

  .marker-option.selected {
    background: rgba(96, 165, 250, 0.2);
    border-color: rgba(96, 165, 250, 0.4);
    transform: scale(1.02);
  }

  .marker-icon-small {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 40px;
    color: rgba(255, 255, 255, 0.9);
  }

  .marker-label {
    font-size: 11px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.8);
    text-align: center;
    line-height: 1.2;
  }

  .loading-indicator,
  .end-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 16px;
    color: rgba(255, 255, 255, 0.6);
    font-size: 12px;
  }

  .loading-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255, 255, 255, 0.2);
    border-top: 2px solid rgba(96, 165, 250, 0.8);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }

  /* Mobile Responsive */
  @media (max-width: 768px) {
    .marker-controls {
      padding: 12px;
    }

    .main-panel {
      gap: 16px;
    }

    .default-marker-button {
      padding: 14px;
      gap: 12px;
    }

    .marker-icon-display {
      width: 52px;
      height: 52px;
      padding: 8px;
    }

    .marker-grid {
      gap: 10px;
    }

    .marker-option {
      padding: 10px;
    }
  }

  @media (max-width: 480px) {
    .marker-controls {
      padding: 10px;
    }

    .main-panel {
      gap: 14px;
    }

    .default-marker-button {
      padding: 12px;
      gap: 10px;
    }

    .marker-icon-display {
      width: 48px;
      height: 48px;
      padding: 6px;
    }

    .marker-name {
      font-size: 13px;
    }

    .change-hint {
      font-size: 10px;
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
