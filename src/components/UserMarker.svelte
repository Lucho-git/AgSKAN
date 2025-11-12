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
  export let isFlashing = false
  export let flashReason = null

  $: vehicle = SVGComponents[userVehicle] || SVGComponents.tractor

  // Flash colors and labels based on reason
  $: flashColor =
    {
      full: "#f59e0b", // amber
      empty: "#ef4444", // red
      help: "#8b5cf6", // purple
    }[flashReason] || "#f59e0b"

  $: flashLabel =
    {
      full: "FULL",
      empty: "EMPTY",
      help: "HELP",
    }[flashReason] || "FLASHING"
</script>

<div
  class="fm-vehicle-marker-container"
  class:fm-vehicle-selected={isSelected && !isFlashing}
  class:fm-vehicle-flashing={isFlashing}
  style="--flash-color: {flashColor}"
>
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

  {#if isFlashing}
    <div class="fm-flash-label" style="--flash-color: {flashColor}">
      {flashLabel}
    </div>
  {/if}
</div>

<style>
  .fm-vehicle-marker-container {
    position: relative;
    transition: all 0.3s ease;
    border-radius: 50%;
  }

  /* Flash label below vehicle */
  .fm-flash-label {
    position: absolute;
    bottom: -28px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--flash-color);
    color: white;
    padding: 4px 12px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.5px;
    white-space: nowrap;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    animation: fmFlashLabelPulse 1s infinite ease-in-out;
    z-index: 10;
  }

  .fm-flash-label::before {
    content: "";
    position: absolute;
    top: -4px;
    left: 50%;
    transform: translateX(-50%);
    width: 0;
    height: 0;
    border-left: 5px solid transparent;
    border-right: 5px solid transparent;
    border-bottom: 5px solid var(--flash-color);
  }

  @keyframes fmFlashLabelPulse {
    0%,
    100% {
      opacity: 1;
      transform: translateX(-50%) scale(1);
    }
    50% {
      opacity: 0.85;
      transform: translateX(-50%) scale(1.05);
    }
  }

  /* Flashing state - replaces selection when active */
  .fm-vehicle-marker-container.fm-vehicle-flashing {
    border: 3px solid var(--flash-color);
    box-shadow:
      0 0 0 2px var(--flash-color),
      0 0 15px var(--flash-color),
      0 0 25px var(--flash-color);
    background: rgba(0, 0, 0, 0.1);
    padding: 6px;
    animation: fmFlashPulse 1s infinite ease-in-out;
  }

  .fm-vehicle-marker-container.fm-vehicle-flashing::before {
    content: "";
    position: absolute;
    top: -8px;
    left: -8px;
    right: -8px;
    bottom: -8px;
    border: 2px solid var(--flash-color);
    border-radius: 50%;
    opacity: 0.8;
    animation: fmFlashRingPulse 1s infinite;
    z-index: -1;
  }

  @keyframes fmFlashPulse {
    0%,
    100% {
      box-shadow:
        0 0 0 2px var(--flash-color),
        0 0 15px var(--flash-color),
        0 0 25px var(--flash-color);
    }
    50% {
      box-shadow:
        0 0 0 2px var(--flash-color),
        0 0 20px var(--flash-color),
        0 0 35px var(--flash-color);
    }
  }

  @keyframes fmFlashRingPulse {
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

  /* Selection border styling - only when not flashing */
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

  /* Ensure the pulse animation doesn't interfere with selection or flashing */
  .fm-vehicle-marker-container.fm-vehicle-selected .fm-pulse-circle,
  .fm-vehicle-marker-container.fm-vehicle-flashing .fm-pulse-circle {
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
