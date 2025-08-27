<!-- src/components/UserMarker.svelte -->
<script>
  import { userVehicleStore } from "../stores/vehicleStore"
  import SVGComponents from "$lib/vehicles/index.js"

  export let pulseColor = "rgba(172, 172, 230, 0.8)"
  export let pulseSize = "40px"
  export let vehicleSize = "60px"
  export let userVehicle = "tractor"
  export let vehicleColor = "yellow"
  export let vehicleSwath = 12
  export let showPulse = true
  export let isSelected = false // 🆕 NEW: Selection state prop

  $: vehicle = SVGComponents[userVehicle] || SVGComponents.tractor
</script>

<div class="vehicle-marker-container" class:selected={isSelected}>
  <div class="user-marker" style="position: relative; display: inline-block;">
    <svelte:component
      this={vehicle}
      bodyColor={vehicleColor}
      size={vehicleSize}
      swath={vehicleSwath}
    />
    {#if showPulse}
      <div
        class="pulse-circle animate-pulse"
        style="
            width: {pulseSize};
            height: {pulseSize};
            border-radius: 50%;
            background-color: {pulseColor};
            box-shadow: 0 0 0 10px {pulseColor};
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            z-index: 0;
          "
      ></div>
    {/if}
  </div>
</div>

<style>
  .vehicle-marker-container {
    position: relative;
    transition: all 0.3s ease;
    border-radius: 50%;
  }

  /* 🆕 NEW: Selection border styling */
  .vehicle-marker-container.selected {
    border: 3px solid #ffffff;
    box-shadow:
      0 0 0 2px #007bff,
      0 0 15px rgba(0, 123, 255, 0.6),
      0 0 25px rgba(0, 123, 255, 0.3);
    background: rgba(0, 123, 255, 0.1);
    padding: 6px;
    animation: selected-pulse 2s infinite ease-in-out;
  }

  .vehicle-marker-container.selected::before {
    content: "";
    position: absolute;
    top: -8px;
    left: -8px;
    right: -8px;
    bottom: -8px;
    border: 2px solid #007bff;
    border-radius: 50%;
    opacity: 0.8;
    animation: selection-ring-pulse 2s infinite;
    z-index: -1;
  }

  /* 🆕 NEW: Selection animations */
  @keyframes selected-pulse {
    0% {
      box-shadow:
        0 0 0 2px #007bff,
        0 0 15px rgba(0, 123, 255, 0.6),
        0 0 25px rgba(0, 123, 255, 0.3);
    }
    50% {
      box-shadow:
        0 0 0 2px #0056b3,
        0 0 20px rgba(0, 123, 255, 0.8),
        0 0 35px rgba(0, 123, 255, 0.5);
    }
    100% {
      box-shadow:
        0 0 0 2px #007bff,
        0 0 15px rgba(0, 123, 255, 0.6),
        0 0 25px rgba(0, 123, 255, 0.3);
    }
  }

  @keyframes selection-ring-pulse {
    0% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.6;
      transform: scale(1.15);
    }
    100% {
      opacity: 1;
      transform: scale(1);
    }
  }

  .user-marker {
    /* Your existing styles */
    position: relative;
    z-index: 1;
  }

  /* Ensure the pulse animation doesn't interfere with selection */
  .vehicle-marker-container.selected .pulse-circle {
    z-index: -1;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  .animate-pulse {
    animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }
</style>
