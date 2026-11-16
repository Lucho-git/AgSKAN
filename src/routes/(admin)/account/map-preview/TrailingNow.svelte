<script lang="ts">
  /**
   * What a trail being laid has done so far, on the card of the machine
   * laying it: a bar in the colour the trail is being laid in, and its
   * figures under it. The bar is a switch: tapping it takes the trail's
   * highlight off the map, and puts it back.
   */
  import { createEventDispatcher } from "svelte"
  import { Eye, EyeOff } from "lucide-svelte"
  import { formatHa } from "$lib/components/mapnext/format"

  export let trail: {
    since: number
    metres: number
    ha: number
    /** The colour it is drawn in. */
    colour: string
    /** Picked out on the map. */
    lit: boolean
  }
  export let now = Date.now()
  /** The job it is being laid for ("Harvest"), if any. */
  export let operation = ""
  /** km/h right now; left out when stopped. */
  export let speed = 0

  const dispatch = createEventDispatcher<{ light: boolean }>()

  /** Ink or white, whichever reads on a colour. */
  function onColour(hex: string) {
    const n = parseInt(hex.replace("#", "").slice(0, 6), 16)
    if (Number.isNaN(n)) return "#ffffff"
    const bright =
      (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
    return bright > 0.6 ? "#15261c" : "#ffffff"
  }

  $: minutes = Math.max(1, Math.round((now - trail.since) / 60000))
  $: going =
    minutes < 60
      ? `${minutes} min`
      : `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`
  $: driven =
    trail.metres >= 1000
      ? `${(trail.metres / 1000).toFixed(1)} km`
      : `${Math.round(trail.metres)} m`
</script>

<div
  class="laying"
  class:off={!trail.lit}
  style="--c: {trail.colour}; --on: {onColour(trail.colour)}"
>
  <button
    type="button"
    class="bar"
    aria-pressed={trail.lit}
    aria-label={trail.lit
      ? "The trail is highlighted on the map. Tap to take the highlight off"
      : "Tap to highlight the trail on the map"}
    on:click={() => dispatch("light", !trail.lit)}
  >
    <i></i>
    <b>Trailing{operation ? ` · ${operation}` : ""}</b>
    <span>
      {#if trail.lit}
        <Eye size={15} /> Highlighted
      {:else}
        <EyeOff size={15} /> Highlight off
      {/if}
    </span>
  </button>
  <div class="mn-stats">
    <div>
      <strong>{going}</strong>
      <span>going</span>
    </div>
    <div>
      <strong>{formatHa(trail.ha)} ha</strong>
      <span>covered</span>
    </div>
    <div>
      <strong>{driven}</strong>
      <span>driven</span>
    </div>
    {#if speed > 0}
      <div>
        <strong>{speed} km/h</strong>
        <span>now</span>
      </div>
    {/if}
  </div>
</div>

<style>
  .laying {
    display: grid;
    overflow: hidden;
    border: 1.5px solid color-mix(in srgb, var(--c) 70%, #15261c);
    border-radius: 14px;
    background: var(--lp-paper);
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 38px;
    padding: 0 12px 0 11px;
    background: var(--c);
    color: var(--on);
    text-align: left;
  }
  .bar i {
    flex-shrink: 0;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: currentColor;
    animation: laying 1.2s ease-in-out infinite;
  }
  @keyframes laying {
    50% {
      opacity: 0.25;
    }
  }
  .bar b {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    font-family: var(--lp-mono);
    font-size: 0.74rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-overflow: ellipsis;
    text-transform: uppercase;
    white-space: nowrap;
  }
  .bar span {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    gap: 5px;
    font-size: 0.74rem;
    font-weight: 700;
    opacity: 0.9;
  }
  /* The highlight taken off: the bar goes quiet, its colour kept as a dot. */
  .laying.off {
    border-color: var(--lp-line);
  }
  .laying.off .bar {
    background: var(--lp-card);
    color: var(--lp-ink);
  }
  .laying.off .bar i {
    background: var(--c);
    box-shadow: 0 0 0 1px rgba(21, 38, 28, 0.4);
    animation: none;
  }
  .laying :global(.mn-stats) {
    border: 0;
    border-top: 1.5px solid color-mix(in srgb, var(--c) 45%, var(--lp-line));
    border-radius: 0;
    background: none;
  }
  .laying.off :global(.mn-stats) {
    border-top-color: var(--lp-line);
  }
  @media (prefers-reduced-motion: reduce) {
    .bar i {
      animation: none;
    }
  }
</style>
