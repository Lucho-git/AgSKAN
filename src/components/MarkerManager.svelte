<!-- src/lib/components/Toolbox.svelte -->
<script>
  import { createEventDispatcher } from "svelte"
  import {
    MapPin,
    Route,
    Truck,
    Ruler,
    Satellite,
    Layers,
    Zap,
  } from "lucide-svelte"
  import { drawingModeEnabled } from "$lib/stores/controlStore"

  // Import vehicle store and components
  import { userVehicleStore } from "$lib/stores/vehicleStore"
  import { userSettingsStore } from "$lib/stores/userSettingsStore"
  import SVGComponents from "$lib/vehicles/index.js"
  import IconSVG from "../../components/IconSVG.svelte"

  // Import toolbox control components
  import SatelliteControls from "$lib/components/SatelliteControls.svelte"
  import MarkerControls from "$lib/components/MarkerControls.svelte"
  import VehicleControls from "$lib/components/VehicleControls.svelte"
  import TrailControls from "$lib/components/TrailControls.svelte"
  import LayerControls from "$lib/components/LayerControls.svelte"
  import VehicleFlashController from "./VehicleFlashController.svelte"

  export let isOpen = false
  export let satelliteManager = null
  export let trailReplayAPI = null

  const dispatch = createEventDispatcher()

  let activePanel = null

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

  // Check if vehicle is currently flashing
  $: isFlashing = $userVehicleStore.is_flashing || false

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

  function handleFlashClose() {
    closeToolbox()
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

  export function switchToVehiclePanel() {
    console.log("🔧 Toolbox: Switching to vehicle panel")
    activePanel = "vehicle"
  }

  function showTrailPanel() {
    activePanel = "trail"
  }

  function showLayersPanel() {
    activePanel = "layers"
  }

  function showFlashPanel() {
    activePanel = "flash"
  }

  function handleMeasurement() {
    $drawingModeEnabled = !$drawingModeEnabled
    closeToolbox()
  }

  function handleSwitchToVehicle() {
    showVehiclePanel()
  }

  function handleVehicleControls() {
    showVehiclePanel()
  }

  function handleTrailControls() {
    showTrailPanel()
  }
</script>

{#if isOpen}
  <div
    class="toolbox-backdrop"
    on:click={closeToolbox}
    on:keydown={(e) => e.key === "Escape" && closeToolbox()}
  ></div>

  <div class="toolbox-panel">
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
        {:else if activePanel === "trail"}
          <button class="back-button" on:click={showMainPanel}> ← </button>
          <h3>Trail Recording</h3>
        {:else if activePanel === "layers"}
          <button class="back-button" on:click={showMainPanel}> ← </button>
          <h3>Map Layers</h3>
        {:else if activePanel === "flash"}
          <button class="back-button" on:click={showMainPanel}> ← </button>
          <h3>Flash Signals</h3>
        {:else}
          <h3>Toolbox</h3>
        {/if}
      </div>
    </div>

    <div class="toolbox-content">
      {#if activePanel === "satellite"}
        <SatelliteControls {satelliteManager} />
      {:else if activePanel === "marker"}
        <MarkerControls on:close={closeToolbox} />
      {:else if activePanel === "vehicle"}
        <VehicleControls on:close={closeToolbox} />
      {:else if activePanel === "trail"}
        <TrailControls
          {trailReplayAPI}
          on:openTrailViewer={() => dispatch("openTrailViewer")}
          on:switchToVehicle={handleSwitchToVehicle}
          on:close={closeToolbox}
        />
      {:else if activePanel === "layers"}
        <LayerControls />
      {:else if activePanel === "flash"}
        <div class="flash-panel-container">
          <VehicleFlashController on:closeToolbox={handleFlashClose} />
        </div>
      {:else}
        <div class="tool-grid">
          <button class="tool-button" on:click={showVehiclePanel}>
            <div class="vehicle-icon-container">
              {#if VehicleIcon}
                <svelte:component
                  this={VehicleIcon}
                  bodyColor={$userVehicleStore.vehicle_marker.bodyColor}
                  size="32px"
                />
              {:else}
                <Truck size={32} />
              {/if}
            </div>
            <span>Select Vehicle</span>
          </button>

          <button class="tool-button" on:click={showMarkerPanel}>
            <div class="marker-icon-container">
              {#if defaultMarker.id === "default"}
                <IconSVG icon="mapbox-marker" size="32px" />
              {:else if defaultMarker.class === "custom-svg"}
                <IconSVG icon={defaultMarker.id} size="32px" />
              {:else if defaultMarker.class?.startsWith("ionic-")}
                <ion-icon name={defaultMarker.id} style="font-size: 32px;"
                ></ion-icon>
              {:else if defaultMarker.class?.startsWith("at-")}
                <i class={`${defaultMarker.class}`} style="font-size: 32px;"
                ></i>
              {:else}
                <MapPin size={32} />
              {/if}
            </div>
            <span>Marker</span>
          </button>

          <button
            class="tool-button"
            class:tool-active={$drawingModeEnabled}
            on:click={handleMeasurement}
          >
            <Ruler size={26} />
            <span>Measure</span>
          </button>

          <button class="tool-button" on:click={handleTrailControls}>
            <Route size={26} />
            <span>Trails</span>
          </button>

          <button class="tool-button" on:click={showSatellitePanel}>
            <Satellite size={26} />
            <span>Satellite</span>
          </button>

          <button class="tool-button" on:click={showLayersPanel}>
            <Layers size={26} />
            <span>Layers</span>
          </button>

          <button
            class="tool-button flash-tool"
            class:tool-active={isFlashing}
            on:click={showFlashPanel}
          >
            <Zap size={26} class={isFlashing ? "flashing-icon" : ""} />
            <span>{isFlashing ? "Flashing..." : "Flash Signal"}</span>
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .tool-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    padding: 16px 12px;
    align-content: start;
  }

  .toolbox-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.6);
    z-index: 1000;
    animation: fadeIn 0.2s ease-out;
  }

  .toolbox-panel {
    position: fixed;
    top: 0;
    left: 0;
    width: 280px;
    height: 100%;
    background: #0a0a0a;
    border-right: 1px solid rgba(255, 255, 255, 0.15);
    z-index: 1001;
    display: flex;
    flex-direction: column;
    animation: slideInLeft 0.3s ease-out;
    color: rgba(255, 255, 255, 0.95);
  }

  .toolbox-header {
    padding: 20px 16px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.15);
    background: #0d0d0d;
  }

  .header-content {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .back-button {
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 50%;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(255, 255, 255, 0.9);
    cursor: pointer;
    transition: all 0.2s ease;
    font-size: 18px;
    font-weight: bold;
  }

  .back-button:hover {
    background: rgba(255, 255, 255, 0.2);
    color: #ffffff;
  }

  .toolbox-header h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: #ffffff;
    flex: 1;
  }

  .toolbox-content {
    flex: 1;
    overflow-y: auto;
    background: #0a0a0a;
  }

  .tool-button {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    height: 100px;
    padding: 14px 8px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.2s ease;
    color: rgba(255, 255, 255, 0.9);
    overflow: visible;
  }

  .tool-button:hover {
    background: rgba(255, 255, 255, 0.15);
    border-color: rgba(255, 255, 255, 0.3);
    color: #ffffff;
    transform: translateY(-2px);
  }

  .tool-button:active {
    transform: translateY(0);
  }

  .tool-button.tool-active {
    background: rgba(96, 165, 250, 0.2);
    border-color: rgba(96, 165, 250, 0.5);
    color: #93c5fd;
  }

  .tool-button.tool-active:hover {
    background: rgba(96, 165, 250, 0.3);
    border-color: rgba(96, 165, 250, 0.6);
  }

  .flash-tool.tool-active {
    background: rgba(251, 191, 36, 0.2);
    border-color: rgba(251, 191, 36, 0.5);
    color: #fcd34d;
  }

  .flash-tool.tool-active:hover {
    background: rgba(251, 191, 36, 0.3);
    border-color: rgba(251, 191, 36, 0.6);
  }

  .flashing-icon {
    animation: flashPulse 1s ease-in-out infinite;
  }

  @keyframes flashPulse {
    0%,
    100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.6;
      transform: scale(1.1);
    }
  }

  .flash-panel-container {
    padding: 12px;
  }

  .tool-button span {
    font-size: 13px;
    font-weight: 600;
    text-align: center;
    line-height: 1.2;
    margin-top: 2px;
  }

  .vehicle-icon-container,
  .marker-icon-container {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    overflow: visible;
  }

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

  .toolbox-content::-webkit-scrollbar {
    width: 4px;
  }

  .toolbox-content::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 2px;
  }

  .toolbox-content::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.25);
    border-radius: 2px;
  }
</style>
