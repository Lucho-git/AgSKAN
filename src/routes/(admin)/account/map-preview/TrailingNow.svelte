<script lang="ts">
  /**
   * What a trail being laid has done so far, on the card of the machine
   * laying it. One strip in the colour the trail is being laid in, running
   * the full width of the card straight under its heading, and the trail's
   * figures in a plain row under that: no box round them, no lines between.
   * The strip is a switch: tapping it takes the trail's highlight off the
   * map, and puts it back.
   *
   * The speed given is the average over the trail so far (the machine's
   * speed right now is on the map).
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
  /** The operation it is being laid for ("Harvest"), if any. */
  export let operation = ""

  const dispatch = createEventDispatcher<{ light: boolean }>()

  /** Ink or white, whichever reads on a colour. */
  function onColour(hex: string) {
    const n = parseInt(hex.replace("#", "").slice(0, 6), 16)
    if (Number.isNaN(n)) return "#ffffff"
    const bright =
      (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
    return bright > 0.6 ? "#15261c" : "#ffffff"
  }

  $: elapsed = Math.max(0, now - trail.since)
  $: minutes = Math.max(1, Math.round(elapsed / 60000))
  $: going =
    minutes < 60
      ? `${minutes} min`
      : `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`
  $: driven =
    trail.metres >= 1000
      ? `${(trail.metres / 1000).toFixed(1)} km`
      : `${Math.round(trail.metres)} m`
  // Average speed over the trail so far. (Left out for the first half
  // minute, when it would be a guess.)
  $: kmh = elapsed >= 30000 ? trail.metres / 1000 / (elapsed / 3600000) : null
  $: average =
    kmh === null ? "" : kmh < 10 ? kmh.toFixed(1) : String(Math.round(kmh))
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
  <dl>
    <div>
      <dd>{going}</dd>
      <dt>going</dt>
    </div>
    <div>
      <dd>{formatHa(trail.ha)} ha</dd>
      <dt>covered</dt>
    </div>
    <div>
      <dd>{driven}</dd>
      <dt>driven</dt>
    </div>
    {#if average}
      <div>
        <dd>{average} km/h</dd>
        <dt>average</dt>
      </div>
    {/if}
  </dl>
</div>

<style>
  /* (The card's own padding is 14px and its rows are 10px apart: the strip
     reaches both edges and sits against the heading.) */
  .laying {
    display: grid;
    margin: -10px -14px 0;
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 40px;
    padding: 0 14px;
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
  /* The highlight taken off: the strip goes quiet, its colour kept as a
     dot. */
  .laying.off .bar {
    background: var(--lp-paper-2);
    color: var(--lp-ink);
  }
  .laying.off .bar i {
    background: var(--c);
    box-shadow: 0 0 0 1px rgba(21, 38, 28, 0.4);
    animation: none;
  }
  dl {
    display: grid;
    grid-auto-columns: minmax(0, 1fr);
    grid-auto-flow: column;
    gap: 10px;
    margin: 0;
    padding: 11px 14px 1px;
  }
  dl div {
    display: grid;
    gap: 1px;
    min-width: 0;
  }
  dd {
    margin: 0;
    font-family: var(--lp-display);
    font-size: 1.05rem;
    font-weight: 800;
    line-height: 1.15;
    white-space: nowrap;
  }
  dt {
    font-family: var(--lp-mono);
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--lp-ink-soft);
    text-transform: uppercase;
  }
  @media (prefers-reduced-motion: reduce) {
    .bar i {
      animation: none;
    }
  }
</style>
