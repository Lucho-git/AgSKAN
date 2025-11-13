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

  // Flash colors and labels based on reason - HELP is now red and bigger
  $: flashColor =
    {
      full: "#f59e0b", // amber
      empty: "#ef4444", // red
      help: "#ef4444", // red (changed from purple)
    }[flashReason] || "#f59e0b"

  $: flashLabel =
    {
      full: "FULL",
      empty: "EMPTY",
      help: "HELP",
    }[flashReason] || "FLASHING"

  // Determine if this is a help signal (keeps big size)
  $: isHelpSignal = flashReason === "help"
</script>

<div
  class="fm-vehicle-marker-container"
  class:fm-vehicle-selected={isSelected && !isFlashing}
  class:fm-vehicle-flashing={isFlashing}
  class:fm-vehicle-flashing-help={isFlashing && isHelpSignal}
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

    {#if showPulse && !isFlashing}
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
    <div
      class="fm-flash-label"
      class:fm-flash-label-help={isHelpSignal}
      style="--flash-color: {flashColor}"
    >
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

  /* Flash label below vehicle - MEDIUM size for full/empty */
  .fm-flash-label {
    position: absolute;
    bottom: -32px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--flash-color);
    color: white;
    padding: 6px 16px;
    border-radius: 14px;
    font-size: 13px;
    font-weight: 800;
    letter-spacing: 1px;
    white-space: nowrap;
    box-shadow:
      0 0 15px var(--flash-color),
      0 0 30px var(--flash-color),
      0 3px 12px rgba(0, 0, 0, 0.4);
    animation: fmFlashLabelPulse 0.9s infinite ease-in-out;
    z-index: 10;
  }

  /* BIG label for HELP signal */
  .fm-flash-label.fm-flash-label-help {
    bottom: -35px;
    padding: 8px 20px;
    border-radius: 16px;
    font-size: 15px;
    font-weight: 900;
    letter-spacing: 1.5px;
    box-shadow:
      0 0 20px var(--flash-color),
      0 0 40px var(--flash-color),
      0 4px 16px rgba(0, 0, 0, 0.5);
    animation: fmFlashLabelPulseHelp 0.8s infinite ease-in-out;
  }

  .fm-flash-label::before {
    content: "";
    position: absolute;
    top: -5px;
    left: 50%;
    transform: translateX(-50%);
    width: 0;
    height: 0;
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-bottom: 6px solid var(--flash-color);
    filter: drop-shadow(0 0 6px var(--flash-color));
  }

  .fm-flash-label-help::before {
    top: -6px;
    border-left: 8px solid transparent;
    border-right: 8px solid transparent;
    border-bottom: 8px solid var(--flash-color);
    filter: drop-shadow(0 0 8px var(--flash-color));
  }

  @keyframes fmFlashLabelPulse {
    0%,
    100% {
      opacity: 1;
      transform: translateX(-50%) scale(1);
      box-shadow:
        0 0 15px var(--flash-color),
        0 0 30px var(--flash-color),
        0 3px 12px rgba(0, 0, 0, 0.4);
    }
    50% {
      opacity: 1;
      transform: translateX(-50%) scale(1.1);
      box-shadow:
        0 0 25px var(--flash-color),
        0 0 45px var(--flash-color),
        0 3px 16px rgba(0, 0, 0, 0.5);
    }
  }

  @keyframes fmFlashLabelPulseHelp {
    0%,
    100% {
      opacity: 1;
      transform: translateX(-50%) scale(1);
      box-shadow:
        0 0 20px var(--flash-color),
        0 0 40px var(--flash-color),
        0 4px 16px rgba(0, 0, 0, 0.5);
    }
    50% {
      opacity: 1;
      transform: translateX(-50%) scale(1.15);
      box-shadow:
        0 0 35px var(--flash-color),
        0 0 60px var(--flash-color),
        0 4px 20px rgba(0, 0, 0, 0.6);
    }
  }

  /* MEDIUM flashing state for full/empty */
  .fm-vehicle-marker-container.fm-vehicle-flashing {
    border: 4px solid var(--flash-color);
    box-shadow:
      0 0 0 2px var(--flash-color),
      0 0 20px var(--flash-color),
      0 0 35px var(--flash-color),
      0 0 50px var(--flash-color);
    background: rgba(0, 0, 0, 0.12);
    padding: 8px;
    animation: fmFlashPulse 0.9s infinite ease-in-out;
  }

  /* BIG flashing state for HELP */
  .fm-vehicle-marker-container.fm-vehicle-flashing-help {
    border: 5px solid var(--flash-color);
    box-shadow:
      0 0 0 3px var(--flash-color),
      0 0 30px var(--flash-color),
      0 0 50px var(--flash-color),
      0 0 70px var(--flash-color);
    padding: 10px;
    animation: fmFlashPulseHelp 0.8s infinite ease-in-out;
  }

  .fm-vehicle-marker-container.fm-vehicle-flashing::before {
    content: "";
    position: absolute;
    top: -12px;
    left: -12px;
    right: -12px;
    bottom: -12px;
    border: 3px solid var(--flash-color);
    border-radius: 50%;
    opacity: 0.85;
    animation: fmFlashRingPulse 0.9s infinite;
    z-index: -1;
    box-shadow:
      0 0 18px var(--flash-color),
      0 0 32px var(--flash-color);
  }

  .fm-vehicle-marker-container.fm-vehicle-flashing-help::before {
    top: -15px;
    left: -15px;
    right: -15px;
    bottom: -15px;
    border: 4px solid var(--flash-color);
    opacity: 0.9;
    animation: fmFlashRingPulseHelp 0.8s infinite;
    box-shadow:
      0 0 25px var(--flash-color),
      0 0 45px var(--flash-color),
      inset 0 0 25px var(--flash-color);
  }

  /* Outer ring - medium for full/empty */
  .fm-vehicle-marker-container.fm-vehicle-flashing::after {
    content: "";
    position: absolute;
    top: -20px;
    left: -20px;
    right: -20px;
    bottom: -20px;
    border: 2px solid var(--flash-color);
    border-radius: 50%;
    opacity: 0.5;
    animation: fmFlashOuterRingPulse 0.9s infinite;
    z-index: -2;
    box-shadow:
      0 0 25px var(--flash-color),
      0 0 45px var(--flash-color);
  }

  /* Outer ring - BIG for help */
  .fm-vehicle-marker-container.fm-vehicle-flashing-help::after {
    top: -25px;
    left: -25px;
    right: -25px;
    bottom: -25px;
    border: 3px solid var(--flash-color);
    opacity: 0.6;
    animation: fmFlashOuterRingPulseHelp 0.8s infinite;
    box-shadow:
      0 0 35px var(--flash-color),
      0 0 60px var(--flash-color);
  }

  @keyframes fmFlashPulse {
    0%,
    100% {
      box-shadow:
        0 0 0 2px var(--flash-color),
        0 0 20px var(--flash-color),
        0 0 35px var(--flash-color),
        0 0 50px var(--flash-color);
      transform: scale(1);
    }
    50% {
      box-shadow:
        0 0 0 2px var(--flash-color),
        0 0 30px var(--flash-color),
        0 0 50px var(--flash-color),
        0 0 65px var(--flash-color);
      transform: scale(1.03);
    }
  }

  @keyframes fmFlashPulseHelp {
    0%,
    100% {
      box-shadow:
        0 0 0 3px var(--flash-color),
        0 0 30px var(--flash-color),
        0 0 50px var(--flash-color),
        0 0 70px var(--flash-color);
      transform: scale(1);
    }
    50% {
      box-shadow:
        0 0 0 3px var(--flash-color),
        0 0 45px var(--flash-color),
        0 0 70px var(--flash-color),
        0 0 95px var(--flash-color);
      transform: scale(1.05);
    }
  }

  @keyframes fmFlashRingPulse {
    0% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.65;
      transform: scale(1.2);
    }
    100% {
      opacity: 1;
      transform: scale(1);
    }
  }

  @keyframes fmFlashRingPulseHelp {
    0% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.7;
      transform: scale(1.25);
    }
    100% {
      opacity: 1;
      transform: scale(1);
    }
  }

  @keyframes fmFlashOuterRingPulse {
    0% {
      opacity: 0.7;
      transform: scale(1);
    }
    50% {
      opacity: 0.35;
      transform: scale(1.3);
    }
    100% {
      opacity: 0.7;
      transform: scale(1);
    }
  }

  @keyframes fmFlashOuterRingPulseHelp {
    0% {
      opacity: 0.8;
      transform: scale(1);
    }
    50% {
      opacity: 0.4;
      transform: scale(1.4);
    }
    100% {
      opacity: 0.8;
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
