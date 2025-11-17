<!-- src/lib/components/TrailControls.svelte -->
<script>
  import { createEventDispatcher } from "svelte"
  import { historicalTrailStore } from "$lib/stores/otherTrailStore"
  import {
    userVehicleStore,
    userVehicleTrailing,
  } from "$lib/stores/vehicleStore"
  import { trailingButtonPressed } from "$lib/stores/controlStore"
  import { toast } from "svelte-sonner"
  import SVGComponents from "$lib/vehicles/index.js"
  import { Play, Route, ChevronRight } from "lucide-svelte"

  export let trailReplayAPI = null
  export let currentVehicleType = "Tractor"
  export let currentVehicleColor = "Green"
  export let currentVehicleSwath = 12

  const dispatch = createEventDispatcher()

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

  function toggleTrailing() {
    const wasTrailing = $userVehicleTrailing

    trailingButtonPressed.update((value) => !value)

    if (!wasTrailing) {
      toast.info("Initiating trail recording...")
      // Auto-close toolbox when starting trail recording
      dispatch("close")
    } else {
    }
  }

  function openTrailViewer() {
    dispatch("openTrailViewer")
    dispatch("close")
  }

  function openVehicleSettings() {
    dispatch("switchToVehicle")
  }

  function getVehicleColorName(color) {
    const colorMap = {
      "#22c55e": "Green",
      "#ef4444": "Red",
      "#3b82f6": "Blue",
      "#f59e0b": "Yellow",
      "#8b5cf6": "Purple",
      "#06b6d4": "Cyan",
      "#f97316": "Orange",
      "#84cc16": "Lime",
    }
    return colorMap[color] || color
  }

  function getOperationName() {
    const operationMap = {
      Tractor: "Field Work",
      Harvester: "Harvesting",
      SelfPropelledBoomspray: "Spraying",
      TowBehindSeeder: "Seeding",
      TowBetweenSeeder: "Seeding",
      Baler: "Baling",
      Mower: "Mowing",
      Spreader: "Spreading",
    }
    return operationMap[currentVehicleType] || "Field Work"
  }
</script>

<div class="trail-controls">
  <!-- Brief Introduction -->
  <div class="trail-intro">
    <div class="intro-header">
      <Route size={20} />
      <h4>Trail Recording</h4>
    </div>
    <p class="intro-text">
      Records field coverage using vehicle settings. Track paths to see your
      coverage patterns, efficiency and overlap.
    </p>
  </div>

  <!-- Start/Stop Trail Recording Button -->
  <div class="trail-recording-section">
    <button
      class="trail-recording-btn"
      class:recording={$userVehicleTrailing}
      on:click={toggleTrailing}
    >
      <div class="trail-icon">
        <svg
          class={$userVehicleTrailing ? "animate-trail" : ""}
          fill="currentColor"
          width="24px"
          height="24px"
          viewBox="0 0 32 32"
          version="1.1"
          xmlns="http://www.w3.org/2000/svg"
        >
          <title>trail</title>
          <path
            d="M30.165 30.887c-1.604 0.076-21.522-0.043-21.522-0.043-12.101-12.151 18.219-16.173-0.521-26.154l-1.311 1.383-1.746-4.582 5.635 0.439-1.128 1.267c23.438 6.83-3.151 19.631 20.594 27.69v0z"
          ></path>
        </svg>
      </div>
      <div class="btn-content">
        <span class="btn-title">
          {$userVehicleTrailing ? "Stop Recording" : "Start Recording"}
        </span>
        <span class="btn-subtitle">
          {$userVehicleTrailing
            ? "Recording active..."
            : "Begin trail recording"}
        </span>
      </div>
    </button>
  </div>

  <!-- Trail Viewer Button -->
  <div class="trail-viewer-section">
    <button class="trail-viewer-btn" on:click={openTrailViewer}>
      <Play size={18} />
      <div class="btn-content">
        <span class="btn-title">View & Replay Trails</span>
        <span class="btn-subtitle">
          {$historicalTrailStore.length} trail{$historicalTrailStore.length !==
          1
            ? "s"
            : ""} recorded
        </span>
      </div>
    </button>
  </div>

  <!-- Vehicle Settings Button -->
  <button class="vehicle-settings-btn" on:click={openVehicleSettings}>
    <div class="settings-content">
      <div class="settings-header">
        <h5 class="settings-title">Recording Settings</h5>
        <ChevronRight size={16} class="chevron" />
      </div>

      <div class="settings-list">
        <!-- Vehicle Type -->
        <div class="setting-item">
          <div class="setting-label">Vehicle</div>
          <div class="setting-value vehicle-value">
            <div class="vehicle-icon-small">
              {#if VehicleIcon}
                <svelte:component
                  this={VehicleIcon}
                  bodyColor={$userVehicleStore.vehicle_marker.bodyColor}
                  size="18px"
                  swath={$userVehicleStore.vehicle_marker.swath}
                />
              {:else}
                <Route size={18} />
              {/if}
            </div>
            <span>{currentVehicleType}</span>
          </div>
        </div>

        <!-- Vehicle Color -->
        <div class="setting-item">
          <div class="setting-label">Trail Color</div>
          <div class="setting-value color-value">
            <div
              class="color-indicator"
              style="background-color: {currentVehicleColor}"
            ></div>
            <span>{getVehicleColorName(currentVehicleColor)}</span>
          </div>
        </div>

        <!-- Trail Width -->
        <div class="setting-item">
          <div class="setting-label">Trail Width</div>
          <div class="setting-value">
            <span class="width-value">{currentVehicleSwath}m</span>
          </div>
        </div>

        <!-- Operation Type -->
        <div class="setting-item">
          <div class="setting-label">Operation</div>
          <div class="setting-value">
            <span>{getOperationName()}</span>
          </div>
        </div>
      </div>
    </div>
  </button>
</div>

<style>
  .trail-controls {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    max-width: 100%;
    overflow: hidden;
  }

  /* Introduction Section */
  .trail-intro {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    padding: 12px;
    border-left: 3px solid #22c55e;
  }

  .intro-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
    color: #22c55e;
  }

  .intro-header h4 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
  }

  .intro-text {
    margin: 0;
    font-size: 12px;
    line-height: 1.4;
    color: rgba(255, 255, 255, 0.7);
  }

  /* Trail Recording Button */
  .trail-recording-section {
    display: flex;
    flex-direction: column;
  }

  .trail-recording-btn {
    background: rgba(34, 197, 94, 0.1);
    border: 1px solid rgba(34, 197, 94, 0.3);
    border-radius: 8px;
    padding: 14px;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    gap: 12px;
    color: white;
    width: 100%;
    border-left: 3px solid #22c55e;
  }

  .trail-recording-btn:hover {
    background: rgba(34, 197, 94, 0.2);
    border-color: rgba(34, 197, 94, 0.4);
    transform: translateY(-1px);
  }

  .trail-recording-btn.recording {
    background: rgba(239, 68, 68, 0.1);
    border-color: rgba(239, 68, 68, 0.3);
    border-left-color: #ef4444;
  }

  .trail-recording-btn.recording:hover {
    background: rgba(239, 68, 68, 0.2);
    border-color: rgba(239, 68, 68, 0.4);
  }

  .trail-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .trail-recording-btn.recording .trail-icon {
    color: #ef4444;
  }

  .trail-recording-btn:not(.recording) .trail-icon {
    color: #22c55e;
  }

  /* Trail Viewer Button */
  .trail-viewer-section {
    display: flex;
    flex-direction: column;
  }

  .trail-viewer-btn {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 12px 14px;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    gap: 10px;
    color: white;
    width: 100%;
  }

  .trail-viewer-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.2);
    transform: translateY(-1px);
  }

  .btn-content {
    display: flex;
    flex-direction: column;
    text-align: left;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }

  .btn-title {
    font-size: 14px;
    font-weight: 600;
    color: white;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .btn-subtitle {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.6);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Vehicle Settings Button */
  .vehicle-settings-btn {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 14px;
    cursor: pointer;
    transition: all 0.2s ease;
    width: 100%;
    border-left: 3px solid #60a5fa;
  }

  .vehicle-settings-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.2);
    transform: translateY(-1px);
  }

  .settings-content {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .settings-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .settings-title {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: #60a5fa;
  }

  .chevron {
    color: rgba(255, 255, 255, 0.4);
    transition: all 0.2s ease;
    flex-shrink: 0;
  }

  .vehicle-settings-btn:hover .chevron {
    color: rgba(255, 255, 255, 0.8);
    transform: translateX(2px);
  }

  /* Settings List - Mobile-first vertical layout */
  .settings-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .setting-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }

  .setting-label {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.6);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-weight: 500;
    flex-shrink: 0;
  }

  .setting-value {
    font-size: 11px;
    font-weight: 600;
    color: white;
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .vehicle-value {
    color: #60a5fa;
  }

  .vehicle-icon-small {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    flex-shrink: 0;
  }

  .color-value {
    color: #60a5fa;
  }

  .color-indicator {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.3);
    flex-shrink: 0;
  }

  .width-value {
    color: #60a5fa;
    font-family: monospace;
  }

  /* Trail Animation */
  @keyframes draw {
    0% {
      stroke-dashoffset: 1000;
    }
    100% {
      stroke-dashoffset: 0;
    }
  }

  @keyframes fillUnfill {
    0%,
    100% {
      fill-opacity: 0;
    }
    50%,
    51% {
      fill-opacity: 1;
    }
  }

  .animate-trail path {
    stroke: currentColor;
    stroke-width: 1;
    fill: currentColor;
    stroke-dasharray: 105;
    animation:
      draw 10s linear infinite,
      fillUnfill 3s linear infinite;
  }

  /* Mobile Responsive - All sizes use same layout */
  @media (max-width: 768px) {
    .trail-controls {
      padding: 14px;
      gap: 14px;
    }

    .trail-intro {
      padding: 10px;
    }

    .intro-text {
      font-size: 11px;
    }

    .trail-recording-btn,
    .trail-viewer-btn {
      padding: 12px;
    }

    .vehicle-settings-btn {
      padding: 12px;
    }

    .settings-list {
      gap: 6px;
    }

    .setting-value {
      font-size: 10px;
    }
  }

  @media (max-width: 480px) {
    .trail-controls {
      padding: 12px;
      gap: 12px;
    }

    .btn-title {
      font-size: 13px;
    }

    .btn-subtitle {
      font-size: 10px;
    }
  }
</style>
