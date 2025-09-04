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
  function handleDrawingMode() {
    dispatch("tool", { type: "drawing-mode" })
    closeToolbox()
  }

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
          <!-- Row 1 -->
          <button class="tool-button" on:click={showMarkerPanel}>
            <MapPin size={24} />
            <span>Marker</span>
          </button>

          <button class="tool-button" on:click={handleDrawingMode}>
            <PencilRuler size={24} />
            <span>Draw</span>
          </button>

          <!-- Row 2 -->
          <button
            class="tool-button"
            class:tool-active={$drawingModeEnabled}
            on:click={handleMeasurement}
          >
            <Ruler size={24} />
            <span>Measure</span>
          </button>

          <button class="tool-button" on:click={showVehiclePanel}>
            <Truck size={24} />
            <span>Vehicle</span>
          </button>

          <!-- Row 3 -->
          <button class="tool-button" on:click={handleTrailRecording}>
            <Navigation size={24} />
            <span>Trails</span>
          </button>

          <button class="tool-button" on:click={showSatellitePanel}>
            <Satellite size={24} />
            <span>Satellite</span>
          </button>
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
    gap: 12px;
    padding: 20px 16px;
    align-content: start;
  }

  .tool-button {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    height: 80px;
    padding: 12px 8px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.2s ease;
    color: rgba(255, 255, 255, 0.8);
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
      gap: 10px;
      padding: 16px 12px;
    }

    .tool-button {
      height: 70px;
      padding: 10px 6px;
    }

    .tool-button span {
      font-size: 11px;
    }
  }

  @media (max-width: 480px) {
    .toolbox-panel {
      width: 240px;
    }

    .tool-grid {
      gap: 8px;
      padding: 14px 10px;
    }

    .tool-button {
      height: 65px;
      padding: 8px 4px;
    }

    .tool-button span {
      font-size: 10px;
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
