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
  /** Not heard from in days: drawn faded, so it reads as "was here". */
  export let away = false
  /** Can be tapped (the live map opens that person's card). */
  export let tappable = false
  /** km/h, shown beside the name while the machine is moving. */
  export let speed = 0
  /** Picked out on the map: a turning ring, and it sits a little larger. */
  export let selected = false

  // A cream machine needs a dark halo to show against pale ground.
  $: halo = colour.toLowerCase() === "#f4f1e6" ? "#15261C" : colour
</script>

<div
  class="mv-vehicle"
  class:me
  class:away
  class:tappable
  class:selected
  style="--size: {size}px; --halo: {halo}"
>
  {#if me}
    <span class="pulse" aria-hidden="true"></span>
    <span class="ring" aria-hidden="true"></span>
  {/if}
  {#if selected}
    <span class="pick" aria-hidden="true"></span>
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
    <span class="tag">
      {label}{#if speed >= 1}<b>{Math.round(speed)}<small>km/h</small></b>{/if}
    </span>
  {/if}
</div>

<style>
  .mv-vehicle {
    position: relative;
    width: var(--size);
    height: var(--size);
    pointer-events: none;
  }
  .tappable {
    pointer-events: auto;
    cursor: pointer;
  }
  /* Selected: a dashed yellow ring turns slowly round the machine. */
  .pick {
    position: absolute;
    top: 50%;
    left: 50%;
    width: calc(var(--size) * 1.25);
    height: calc(var(--size) * 1.25);
    min-width: 58px;
    min-height: 58px;
    border: 3px dashed #f7db5c;
    border-radius: 50%;
    background: rgba(247, 219, 92, 0.16);
    box-shadow: 0 0 0 1.5px rgba(21, 38, 28, 0.55);
    transform: translate(-50%, -50%);
    animation:
      mv-pick-in 0.32s cubic-bezier(0.3, 1.6, 0.5, 1) both,
      mv-pick-turn 9s linear 0.32s infinite;
  }
  @keyframes mv-pick-in {
    from {
      opacity: 0;
      transform: translate(-50%, -50%) scale(1.7);
    }
  }
  @keyframes mv-pick-turn {
    to {
      transform: translate(-50%, -50%) rotate(360deg);
    }
  }
  .selected .tag {
    background: #f7db5c;
    color: #15261c;
  }
  .away .art {
    filter: grayscale(0.85) drop-shadow(0 2px 3px rgba(10, 25, 15, 0.45));
    opacity: 0.62;
  }
  .away .tag {
    background: rgba(21, 38, 28, 0.72);
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
  .tag b {
    margin-left: 7px;
    padding-left: 7px;
    border-left: 1px solid currentColor;
    font-weight: 700;
  }
  .tag small {
    margin-left: 2px;
    font-size: 8.5px;
    font-weight: 500;
    letter-spacing: 0.04em;
    opacity: 0.8;
  }
  .me .tag {
    background: #f7db5c;
    color: #15261c;
  }
  @media (prefers-reduced-motion: reduce) {
    .pick {
      animation: none;
    }
    .pulse {
      animation: none;
      opacity: 0;
    }
  }
</style>
