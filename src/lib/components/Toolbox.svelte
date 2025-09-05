<!-- src/lib/components/Toolbox.svelte -->
<script>
  import { createEventDispatcher } from "svelte"
  import {
    MapPin,
    PencilRuler,
    Navigation,
    Truck,
    Ruler,
    Satellite,
  } from "lucide-svelte"
  import { drawingModeEnabled } from "$lib/stores/controlStore"

  // Import vehicle store and components
  import { userVehicleStore } from "../../stores/vehicleStore"
  import { userSettingsStore } from "$lib/stores/userSettingsStore"
  import SVGComponents from "$lib/vehicles/index.js"
  import IconSVG from "../../components/IconSVG.svelte"

  // Import toolbox control components
  import SatelliteControls from "$lib/components/SatelliteControls.svelte"
  import MarkerControls from "$lib/components/MarkerControls.svelte"
  import VehicleControls from "$lib/components/VehicleControls.svelte"

  export let isOpen = false
  export let satelliteManager = null
  export let currentVehicleType = "Tractor"
  export let currentVehicleColor = "Green"
  export let currentVehicleSwath = 12

  const dispatch = createEventDispatcher()

  // State for different tool panels
  let activePanel = null // 'main', 'satellite', 'marker', 'vehicle', etc.

  // Get vehicle icon component from store
  let VehicleIcon
  $: {
    if (
      $userVehicleStore.vehicle_marker &&
      $userVehicleStore.vehicle_marker.type
    ) {
      VehicleIcon =
        SVGComponents[$userVehicleStore.vehicle_marker.type] ||
        SVGComponents.Pointer
    }
  }

  // Get default marker from userSettingsStore
  function getDefaultMarker() {
    return (
      $userSettingsStore?.defaultMarker || {
        id: "default",
        class: "default",
        name: "Default Marker",
      }
    )
  }

  $: defaultMarker = getDefaultMarker()

  function closeToolbox() {
    dispatch("close")
  }

  function showMainPanel() {
    activePanel = null
  }

  function showSatellitePanel() {
    activePanel = "satellite"
  }

  function showMarkerPanel() {
    activePanel = "marker"
  }

  function showVehiclePanel() {
    activePanel = "vehicle"
  }

  // Tool functions
  function handleMeasurement() {
    // Toggle drawing mode for measurements
    $drawingModeEnabled = !$drawingModeEnabled
    closeToolbox()
  }

  function handleVehicleControls() {
    showVehiclePanel()
  }

  function handleTrailRecording() {
    dispatch("tool", { type: "trail-recording" })
    closeToolbox()
  }
</script>

{#if isOpen}
  <!-- Backdrop -->
  <div
    class="toolbox-backdrop"
    on:click={closeToolbox}
    on:keydown={(e) => e.key === "Escape" && closeToolbox()}
  ></div>

  <!-- Panel -->
  <div class="toolbox-panel">
    <!-- Header -->
    <div class="toolbox-header">
      <div class="header-content">
        {#if activePanel === "satellite"}
          <button class="back-button" on:click={showMainPanel}> ← </button>
          <h3>Satellite Options</h3>
        {:else if activePanel === "marker"}
          <button class="back-button" on:click={showMainPanel}> ← </button>
          <h3>Marker Tools</h3>
        {:else if activePanel === "vehicle"}
          <button class="back-button" on:click={showMainPanel}> ← </button>
          <h3>Vehicle Setup</h3>
        {:else}
          <h3>Toolbox</h3>
        {/if}
      </div>
    </div>

    <!-- Dynamic Content -->
    <div class="toolbox-content">
      {#if activePanel === "satellite"}
        <!-- Satellite Options Panel -->
        <SatelliteControls {satelliteManager} />
      {:else if activePanel === "marker"}
        <!-- Marker Panel -->
        <MarkerControls on:close={closeToolbox} />
      {:else if activePanel === "vehicle"}
        <!-- Vehicle Panel -->
        <VehicleControls
          on:vehicleUpdated={(e) => dispatch("vehicleUpdated", e.detail)}
          on:close={closeToolbox}
          {currentVehicleType}
          {currentVehicleColor}
          {currentVehicleSwath}
        />
      {:else}
        <!-- Main Tool Grid -->
        <div class="tool-grid">
          <button class="tool-button" on:click={showVehiclePanel}>
            <div class="vehicle-icon-container">
              {#if VehicleIcon}
                <svelte:component
                  this={VehicleIcon}
                  bodyColor={$userVehicleStore.vehicle_marker.bodyColor}
                  size="52px"
                  swath={$userVehicleStore.vehicle_marker.swath}
                />
              {:else}
                <Truck size={52} />
              {/if}
            </div>
            <span>Select Vehicle</span>
          </button>

          <!-- Marker Button with actual default marker icon -->
          <button class="tool-button" on:click={showMarkerPanel}>
            <div class="marker-icon-container">
              {#if defaultMarker.id === "default"}
                <IconSVG icon="mapbox-marker" size="52px" />
              {:else if defaultMarker.class === "custom-svg"}
                <IconSVG icon={defaultMarker.id} size="52px" />
              {:else if defaultMarker.class?.startsWith("ionic-")}
                <ion-icon name={defaultMarker.id} style="font-size: 52px;"
                ></ion-icon>
              {:else if defaultMarker.class?.startsWith("at-")}
                <i class={`${defaultMarker.class}`} style="font-size: 52px;"
                ></i>
              {:else}
                <MapPin size={52} />
              {/if}
            </div>
            <span>Marker</span>
          </button>

          <!-- Row 2 -->
          <button
            class="tool-button"
            class:tool-active={$drawingModeEnabled}
            on:click={handleMeasurement}
          >
            <Ruler size={40} />
            <span>Measure</span>
          </button>

          <button class="tool-button" on:click={handleTrailRecording}>
            <Navigation size={40} />
            <span>Trails</span>
          </button>

          <!-- Row 3 -->
          <button class="tool-button" on:click={showSatellitePanel}>
            <Satellite size={40} />
            <span>Satellite</span>
          </button>

          <!-- Empty slot to maintain grid layout -->
          <div class="tool-placeholder"></div>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .toolbox-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.4);
    z-index: 1000;
    animation: fadeIn 0.2s ease-out;
  }

  .toolbox-panel {
    position: fixed;
    top: 0;
    left: 0;
    width: 280px;
    height: 100%;
    background: rgba(0, 0, 0, 0.95);
    backdrop-filter: blur(16px);
    border-right: 1px solid rgba(255, 255, 255, 0.1);
    z-index: 1001;
    display: flex;
    flex-direction: column;
    animation: slideInLeft 0.3s ease-out;
    color: white;
  }

  .toolbox-header {
    padding: 20px 16px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    background: linear-gradient(
      to bottom,
      rgba(0, 0, 0, 0.9),
      rgba(0, 0, 0, 0.8)
    );
  }

  .header-content {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .back-button {
    background: rgba(255, 255, 255, 0.1);
    border: none;
    border-radius: 50%;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(255, 255, 255, 0.8);
    cursor: pointer;
    transition: all 0.2s ease;
    font-size: 18px;
    font-weight: bold;
  }

  .back-button:hover {
    background: rgba(255, 255, 255, 0.2);
    color: white;
  }

  .toolbox-header h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: white;
    flex: 1;
  }

  .toolbox-content {
    flex: 1;
    overflow-y: auto;
  }

  .tool-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    padding: 20px 16px;
    align-content: start;
  }

  .tool-button {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    width: 100%;
    height: 120px; /* Even taller to accommodate big icons */
    padding: 20px 12px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.2s ease;
    color: rgba(255, 255, 255, 0.8);
    overflow: visible; /* Allow icons to extend beyond button bounds */
  }

  .tool-button:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.2);
    color: white;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  }

  .tool-button:active {
    transform: translateY(0);
  }

  /* Active state for measure button */
  .tool-button.tool-active {
    background: rgba(96, 165, 250, 0.2);
    border-color: rgba(96, 165, 250, 0.4);
    color: #60a5fa;
  }

  .tool-button.tool-active:hover {
    background: rgba(96, 165, 250, 0.3);
    border-color: rgba(96, 165, 250, 0.5);
    color: #60a5fa;
  }

  .tool-button span {
    font-size: 12px;
    font-weight: 500;
    text-align: center;
    line-height: 1.2;
    margin-top: 4px; /* Extra space from large icons */
  }

  /* Icon containers - smaller than actual icons to allow overflow */
  .vehicle-icon-container,
  .marker-icon-container {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px; /* Container smaller than 52px icon */
    height: 40px;
    overflow: visible; /* Allow icons to spill out */
  }

  /* Empty placeholder to maintain grid alignment */
  .tool-placeholder {
    height: 120px;
    background: transparent;
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

  @keyframes slideInLeft {
    from {
      transform: translateX(-100%);
    }
    to {
      transform: translateX(0);
    }
  }

  /* Mobile Responsive */
  @media (max-width: 768px) {
    .toolbox-panel {
      width: 260px;
    }

    .tool-grid {
      gap: 14px;
      padding: 16px 12px;
    }

    .tool-button {
      height: 105px;
      padding: 18px 10px;
      gap: 10px;
    }

    .tool-button span {
      font-size: 11px;
      margin-top: 2px;
    }

    .vehicle-icon-container,
    .marker-icon-container {
      width: 32px; /* Container smaller than 42px icon */
      height: 32px;
    }

    /* Update vehicle/marker icons for tablet */
    .vehicle-icon-container :global(svg),
    .vehicle-icon-container :global(ion-icon),
    .vehicle-icon-container :global(i),
    .marker-icon-container :global(svg),
    .marker-icon-container :global(ion-icon),
    .marker-icon-container :global(i) {
      width: 42px !important;
      height: 42px !important;
      font-size: 42px !important;
    }

    /* Adjust other Lucide icon sizes for mobile */
    .tool-button
      :global(
        svg:not(.vehicle-icon-container svg):not(.marker-icon-container svg)
      ) {
      width: 32px !important;
      height: 32px !important;
    }
  }

  @media (max-width: 480px) {
    .toolbox-panel {
      width: 240px;
    }

    .tool-grid {
      gap: 12px;
      padding: 14px 10px;
    }

    .tool-button {
      height: 95px;
      padding: 16px 8px;
      gap: 8px;
    }

    .tool-button span {
      font-size: 10px;
      margin-top: 2px;
    }

    .vehicle-icon-container,
    .marker-icon-container {
      width: 28px; /* Container smaller than 36px icon */
      height: 28px;
    }

    /* Update vehicle/marker icons for mobile */
    .vehicle-icon-container :global(svg),
    .vehicle-icon-container :global(ion-icon),
    .vehicle-icon-container :global(i),
    .marker-icon-container :global(svg),
    .marker-icon-container :global(ion-icon),
    .marker-icon-container :global(i) {
      width: 36px !important;
      height: 36px !important;
      font-size: 36px !important;
    }

    /* Adjust other Lucide icon sizes for small mobile */
    .tool-button
      :global(
        svg:not(.vehicle-icon-container svg):not(.marker-icon-container svg)
      ) {
      width: 28px !important;
      height: 28px !important;
    }
  }

  /* Scrollbar styling for content area */
  .toolbox-content::-webkit-scrollbar {
    width: 4px;
  }

  .toolbox-content::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2px;
  }

  .toolbox-content::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.3);
    border-radius: 2px;
  }
</style>
