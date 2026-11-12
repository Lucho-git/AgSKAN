<script lang="ts">
  /**
   * A machine on the real map: the app's own top-down drawing, turned to its
   * heading, with an upright name chip. Mounted inside a Mapbox marker.
   */
  import vehicles from "$lib/vehicles"

  type VehicleName = keyof typeof vehicles

  export let art: VehicleName
  export let colour = "#2F62D6"
  /** Longest side of the drawing, in pixels. */
  export let size = 44
  /** Degrees clockwise from the top of the screen. */
  export let heading = 0
  export let label = ""
  /** The viewer's own machine: ringed, pulsing, and tagged in yellow. */
  export let me = false

  // A cream machine needs a dark halo to show against pale ground.
  $: halo = colour.toLowerCase() === "#f4f1e6" ? "#15261C" : colour
</script>

<div class="mv-vehicle" class:me style="--size: {size}px; --halo: {halo}">
  {#if me}
    <span class="pulse" aria-hidden="true"></span>
    <span class="ring" aria-hidden="true"></span>
  {/if}
  <div class="art" style="transform: rotate({heading}deg)">
    <svelte:component
      this={vehicles[art]}
      size="{size}px"
      bodyColor={colour}
      outlineColor="#ffffff"
      wheelColor="#15261C"
      loadColor="#F7DB5C"
    />
  </div>
  {#if label}
    <span class="tag">{label}</span>
  {/if}
</div>

<style>
  .mv-vehicle {
    position: relative;
    width: var(--size);
    height: var(--size);
    pointer-events: none;
  }
  .art {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    filter: drop-shadow(0 2px 3px rgba(10, 25, 15, 0.45));
    will-change: transform;
  }
  .pulse,
  .ring {
    position: absolute;
    top: 50%;
    left: 50%;
    width: calc(var(--size) * 0.9);
    height: calc(var(--size) * 0.9);
    min-width: 44px;
    min-height: 44px;
    border-radius: 50%;
    transform: translate(-50%, -50%);
  }
  .ring {
    border: 2px solid rgba(255, 255, 255, 0.9);
    background: color-mix(in srgb, var(--halo) 22%, transparent);
  }
  .pulse {
    background: var(--halo);
    opacity: 0.35;
    animation: mv-pulse 2.4s ease-out infinite;
  }
  @keyframes mv-pulse {
    0% {
      transform: translate(-50%, -50%) scale(0.8);
      opacity: 0.4;
    }
    100% {
      transform: translate(-50%, -50%) scale(2.1);
      opacity: 0;
    }
  }
  .tag {
    position: absolute;
    bottom: calc(100% + 3px);
    left: 50%;
    padding: 4px 9px;
    border-radius: 99px;
    background: #15261c;
    color: #f4f1e6;
    font-family: var(--lp-mono, ui-monospace, monospace);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    line-height: 1;
    white-space: nowrap;
    transform: translateX(-50%);
    box-shadow: 0 2px 6px rgba(10, 25, 15, 0.35);
  }
  .me .tag {
    background: #f7db5c;
    color: #15261c;
  }
  @media (prefers-reduced-motion: reduce) {
    .pulse {
      animation: none;
      opacity: 0;
    }
  }
</style>
