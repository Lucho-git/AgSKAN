<!--
  NorthResetToast.svelte
  A toast near the top-centre of the map that appears for a few seconds after
  the map finishes rotating, offering to snap back to true north (mirrors the
  compass hub's "Align North" action). It shows only when the map is actually
  rotated away from north and the rotation has STOPPED (debounced), and is
  suppressed while first-person mode is auto-rotating the camera to follow
  the vehicle heading.
-->
<script>
  import { onDestroy } from "svelte"
  import { Navigation } from "lucide-svelte"

  /** Current map bearing in degrees (0 = north), from the map's rotate event */
  export let mapBearing = 0
  /** Suppress while the camera is auto-rotating (first-person mode) */
  export let suppress = false
  /** Callback to reset the map bearing to true north */
  export let onTrueNorth = null

  // A rotation needs to exceed this before the toast bothers the user.
  const BEARING_THRESHOLD = 1.5 // °
  // Wait this long after the last rotate before deciding the map has stopped.
  const STOP_DEBOUNCE_MS = 900
  // How long the toast stays visible before auto-hiding.
  const SHOW_MS = 4000

  let visible = false
  let stoppedTimer = null
  let hideTimer = null
  let lastBearing = 0

  // Every bearing change = the user is (still) twisting — re-arm the debounce.
  $: if (mapBearing !== lastBearing) {
    lastBearing = mapBearing
    onBearingChanged(mapBearing)
  }

  // If first-person mode turns on mid-toast, hide it.
  $: if (suppress) hideToast()

  function onBearingChanged(bearing) {
    // Hide while actively rotating.
    hideToast()
    if (stoppedTimer) clearTimeout(stoppedTimer)
    stoppedTimer = setTimeout(() => {
      stoppedTimer = null
      if (suppress) return
      if (Math.abs(normalize(bearing)) > BEARING_THRESHOLD) showToast()
    }, STOP_DEBOUNCE_MS)
  }

  function showToast() {
    visible = true
    if (hideTimer) clearTimeout(hideTimer)
    hideTimer = setTimeout(hideToast, SHOW_MS)
  }

  function hideToast() {
    visible = false
    if (hideTimer) {
      clearTimeout(hideTimer)
      hideTimer = null
    }
  }

  function handleAlignNorth() {
    hideToast()
    if (onTrueNorth) onTrueNorth()
  }

  // Normalise a bearing into [-180, 180] so ±0.5° still counts as "north".
  function normalize(b) {
    let x = (b || 0) % 360
    if (x > 180) x -= 360
    if (x < -180) x += 360
    return x
  }

  onDestroy(() => {
    if (stoppedTimer) clearTimeout(stoppedTimer)
    if (hideTimer) clearTimeout(hideTimer)
  })
</script>

{#if visible}
  <div class="north-toast" role="status">
    <Navigation size={14} class="north-toast-icon" />
    <span class="north-toast-text">Map rotated</span>
    <button class="north-toast-action" on:click={handleAlignNorth}>
      Align north
    </button>
    <button
      class="north-toast-close"
      on:click={hideToast}
      aria-label="Dismiss"
    >
      ✕
    </button>
  </div>
{/if}

<style>
  .north-toast {
    position: fixed;
    top: 24px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 2000;
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 8px 8px 8px 14px;
    border-radius: 999px;
    background: rgba(2, 6, 23, 0.88);
    border: 1px solid rgba(255, 255, 255, 0.12);
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(12px);
    font-size: 12px;
    color: #e2e8f0;
    animation: northToastIn 0.25s ease-out;
    user-select: none;
  }

  .north-toast-icon {
    color: #60a5fa;
    flex-shrink: 0;
  }

  .north-toast-text {
    white-space: nowrap;
  }

  .north-toast-action {
    border: 1px solid rgba(245, 158, 11, 0.5);
    background: rgba(245, 158, 11, 0.14);
    color: #fcd34d;
    font-size: 12px;
    font-weight: 700;
    padding: 5px 12px;
    border-radius: 999px;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s ease, border-color 0.15s ease;
  }

  .north-toast-action:hover {
    background: rgba(245, 158, 11, 0.26);
    border-color: rgba(245, 158, 11, 0.75);
  }

  .north-toast-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 999px;
    border: none;
    background: transparent;
    color: #94a3b8;
    font-size: 12px;
    line-height: 1;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.15s ease, color 0.15s ease;
  }

  .north-toast-close:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #f1f5f9;
  }

  @keyframes northToastIn {
    from {
      opacity: 0;
      transform: translate(-50%, -8px);
    }
    to {
      opacity: 1;
      transform: translate(-50%, 0);
    }
  }
</style>
