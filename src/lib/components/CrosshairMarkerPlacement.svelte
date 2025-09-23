<!-- src/lib/components/CrosshairMarkerPlacement.svelte -->
<script>
  import { onMount, onDestroy } from "svelte"
  import { markerPlacementModeEnabled } from "$lib/stores/controlStore"
  import { Plus, X } from "lucide-svelte"

  export let map
  export let markerManagerRef = null

  function placeMarkerAtCrosshair() {
    if (!map || !$markerPlacementModeEnabled || !markerManagerRef) return

    console.log("🎯 Placing marker at crosshair location")

    // Get the center of the screen (where crosshair is positioned)
    const center = map.getCenter()
    const lngLat = { lng: center.lng, lat: center.lat }

    console.log("📍 Crosshair coordinates:", lngLat)

    // Use the existing marker placement function from MarkerManager
    if (markerManagerRef.handleMarkerPlacement) {
      markerManagerRef.handleMarkerPlacement(lngLat)
    }

    // Exit placement mode after placing marker
    $markerPlacementModeEnabled = false
  }

  function cancelPlacement() {
    console.log("❌ Cancelled crosshair marker placement")
    $markerPlacementModeEnabled = false
  }
</script>

{#if $markerPlacementModeEnabled}
  <!-- Crosshair overlay -->
  <div class="crosshair-overlay">
    <div class="crosshair">
      <!-- Horizontal line -->
      <div class="crosshair-line horizontal"></div>
      <!-- Vertical line -->
      <div class="crosshair-line vertical"></div>
      <!-- Center dot -->
      <div class="crosshair-center"></div>
    </div>
  </div>

  <!-- Status display -->
  <div class="status-indicator">
    <div class="status-text">Position crosshair to place marker</div>
  </div>

  <!-- Control buttons - bottom center -->
  <div class="button-container">
    <div class="button-group">
      <!-- Main place marker button -->
      <button class="place-marker-btn" on:click={placeMarkerAtCrosshair}>
        <Plus class="h-6 w-6" />
        <span class="btn-label">Place</span>
      </button>

      <!-- Cancel button (always available) -->
      <button class="cancel-btn" on:click={cancelPlacement}>
        <X class="h-5 w-5" />
      </button>
    </div>
  </div>

  <!-- Bottom instructions -->
  <div class="bottom-instructions">
    Move map to position crosshair, then tap + to place marker
  </div>
{/if}

<style>
  /* Crosshair overlay */
  .crosshair-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 20;
    pointer-events: none;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .crosshair {
    position: relative;
    width: 2rem;
    height: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .crosshair-line {
    position: absolute;
    background: white;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  }

  .crosshair-line.horizontal {
    width: 2rem;
    height: 2px;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
  }

  .crosshair-line.vertical {
    width: 2px;
    height: 2rem;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
  }

  .crosshair-center {
    position: absolute;
    width: 8px;
    height: 8px;
    background: white;
    border-radius: 50%;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  }

  /* Status indicator */
  .status-indicator {
    position: fixed;
    top: 1rem;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.8);
    color: white;
    padding: 10px 16px;
    border-radius: 16px;
    text-align: center;
    z-index: 10;
    backdrop-filter: blur(8px);
  }

  .status-text {
    font-size: 11px;
    opacity: 0.9;
    font-weight: 500;
  }

  /* Button container - bottom center */
  .button-container {
    position: fixed;
    bottom: 5rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 10;
  }

  .button-group {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .place-marker-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    background: #0ea5e9;
    color: white;
    border: none;
    border-radius: 20px;
    padding: 16px 24px;
    box-shadow: 0 6px 20px rgba(14, 165, 233, 0.4);
    transition: all 0.2s ease;
    min-width: 80px;
    cursor: pointer;
  }

  .place-marker-btn:hover {
    background: #0284c7;
    box-shadow: 0 8px 24px rgba(14, 165, 233, 0.5);
    transform: translateY(-2px);
  }

  .place-marker-btn:active {
    transform: translateY(0) scale(0.95);
    box-shadow: 0 4px 12px rgba(14, 165, 233, 0.6);
  }

  .btn-label {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .cancel-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(239, 68, 68, 0.9);
    color: white;
    border: none;
    border-radius: 50%;
    width: 48px;
    height: 48px;
    box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
    transition: all 0.2s ease;
    cursor: pointer;
  }

  .cancel-btn:hover {
    background: #dc2626;
    box-shadow: 0 6px 16px rgba(239, 68, 68, 0.4);
  }

  .cancel-btn:active {
    transform: scale(0.95);
  }

  /* Bottom instructions */
  .bottom-instructions {
    position: fixed;
    bottom: 1rem;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.75);
    color: white;
    padding: 6px 12px;
    border-radius: 12px;
    font-size: 12px;
    text-align: center;
    z-index: 10;
    max-width: 90%;
    backdrop-filter: blur(4px);
  }

  /* Mobile responsive adjustments */
  @media (max-width: 768px) {
    .button-container {
      bottom: 4rem;
    }

    .place-marker-btn {
      padding: 14px 20px;
      min-width: 70px;
    }

    .place-marker-btn .h-6 {
      width: 1.25rem;
      height: 1.25rem;
    }

    .btn-label {
      font-size: 9px;
    }

    .cancel-btn {
      width: 44px;
      height: 44px;
    }

    .status-text {
      font-size: 10px;
    }

    .bottom-instructions {
      font-size: 11px;
      padding: 5px 10px;
    }
  }

  @media (max-width: 480px) {
    .button-container {
      bottom: 3.5rem;
    }

    .place-marker-btn {
      padding: 12px 18px;
      min-width: 60px;
      border-radius: 16px;
    }

    .btn-label {
      font-size: 8px;
    }

    .cancel-btn {
      width: 40px;
      height: 40px;
    }

    .status-indicator {
      padding: 8px 12px;
    }

    .status-text {
      font-size: 9px;
    }

    .bottom-instructions {
      font-size: 10px;
      padding: 4px 8px;
      bottom: 0.75rem;
    }
  }

  /* Very small screens */
  @media (max-width: 360px) {
    .crosshair {
      width: 1.5rem;
      height: 1.5rem;
    }

    .crosshair-line.horizontal {
      width: 1.5rem;
    }

    .crosshair-line.vertical {
      height: 1.5rem;
    }

    .crosshair-center {
      width: 6px;
      height: 6px;
    }

    .button-container {
      bottom: 3rem;
    }

    .place-marker-btn {
      padding: 10px 16px;
      min-width: 55px;
    }
  }

  /* Landscape mobile optimization */
  @media (max-height: 500px) and (orientation: landscape) {
    .button-container {
      bottom: 2rem;
    }

    .bottom-instructions {
      bottom: 0.5rem;
    }

    .status-indicator {
      top: 0.5rem;
    }
  }

  /* Handle safe areas for modern mobile devices */
  @supports (padding: max(0px)) {
    .button-container {
      bottom: max(5rem, env(safe-area-inset-bottom) + 3rem);
    }

    .bottom-instructions {
      bottom: max(1rem, env(safe-area-inset-bottom) + 0.5rem);
    }
  }
</style>
