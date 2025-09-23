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

  <!-- Control buttons - bottom center as allocated -->
  <div class="button-container">
    <div class="mobile-button-container">
      <!-- Single main button -->
      <button class="main-action-btn" on:click={placeMarkerAtCrosshair}>
        <Plus class="h-6 w-6" />
        <span class="btn-label">Place</span>
      </button>
    </div>
  </div>

  <!-- Instructions at very bottom -->
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

  /* Button container - bottom center */
  .button-container {
    position: fixed;
    bottom: 5rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 10;
  }

  .mobile-button-container {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .main-action-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    background: #22c55e;
    color: white;
    border: none;
    border-radius: 20px;
    padding: 16px 24px;
    box-shadow: 0 6px 20px rgba(34, 197, 94, 0.4);
    transition: all 0.2s ease;
    min-width: 80px;
    cursor: pointer;
  }

  .main-action-btn:hover {
    background: #16a34a;
    box-shadow: 0 8px 24px rgba(34, 197, 94, 0.5);
    transform: translateY(-2px);
  }

  .main-action-btn:active {
    transform: translateY(0) scale(0.95);
    box-shadow: 0 4px 12px rgba(34, 197, 94, 0.6);
  }

  .btn-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-top: 2px;
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

    .main-action-btn {
      padding: 14px 20px;
      min-width: 70px;
    }

    .main-action-btn .h-6 {
      width: 1.25rem;
      height: 1.25rem;
    }

    .btn-label {
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

    .main-action-btn {
      padding: 12px 18px;
      min-width: 60px;
      border-radius: 16px;
    }

    .main-action-btn .h-6 {
      width: 1rem;
      height: 1rem;
    }

    .btn-label {
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

    .main-action-btn {
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
