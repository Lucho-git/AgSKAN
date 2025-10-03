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
  export let isSelected = false

  $: vehicle = SVGComponents[userVehicle] || SVGComponents.tractor
</script>

<div class="fm-vehicle-marker-container" class:fm-vehicle-selected={isSelected}>
  <div
    class="fm-user-marker"
    style="position: relative; display: inline-block;"
  >
    <svelte:component
      this={vehicle}
      bodyColor={vehicleColor}
      size={vehicleSize}
      swath={vehicleSwath}
    />
    {#if showPulse}
      <div
        class="fm-pulse-circle fm-animate-pulse"
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
  .fm-vehicle-marker-container {
    position: relative;
    transition: all 0.3s ease;
    border-radius: 50%;
  }

  /* Selection border styling */
  .fm-vehicle-marker-container.fm-vehicle-selected {
    border: 3px solid #ffffff;
    box-shadow:
      0 0 0 2px #007bff,
      0 0 15px rgba(0, 123, 255, 0.6),
      0 0 25px rgba(0, 123, 255, 0.3);
    background: rgba(0, 123, 255, 0.1);
    padding: 6px;
    animation: fmVehicleSelectedPulse 2s infinite ease-in-out;
  }

  .fm-vehicle-marker-container.fm-vehicle-selected::before {
    content: "";
    position: absolute;
    top: -8px;
    left: -8px;
    right: -8px;
    bottom: -8px;
    border: 2px solid #007bff;
    border-radius: 50%;
    opacity: 0.8;
    animation: fmVehicleSelectionRingPulse 2s infinite;
    z-index: -1;
  }

  /* Selection animations */
  @keyframes fmVehicleSelectedPulse {
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

  @keyframes fmVehicleSelectionRingPulse {
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

  .fm-user-marker {
    position: relative;
    z-index: 1;
  }

  /* Ensure the pulse animation doesn't interfere with selection */
  .fm-vehicle-marker-container.fm-vehicle-selected .fm-pulse-circle {
    z-index: -1;
  }

  @keyframes fmVehicleBasicPulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  .fm-animate-pulse {
    animation: fmVehicleBasicPulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }
</style>
