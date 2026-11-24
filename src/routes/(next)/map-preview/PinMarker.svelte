<script lang="ts">
  /** A tappable pin on the map. Mounted inside a Mapbox marker. */
  import { createEventDispatcher } from "svelte"
  import PinGlyph from "./PinGlyph.svelte"
  import { pinGlyphs, type PinKind } from "./glyphs"

  export let kind: PinKind
  export let selected = false
  /** Just dropped: play the drop-in. */
  export let fresh = false
  export let note = ""

  const dispatch = createEventDispatcher<{ tap: void }>()
</script>

<button
  type="button"
  class="mv-pin"
  class:selected
  class:fresh
  aria-label="{pinGlyphs[kind].label} pin"
  on:click|stopPropagation={() => dispatch("tap")}
>
  <span class="disc"><PinGlyph {kind} size={30} shadow /></span>
  {#if note}<span class="note">{note}</span>{/if}
</button>

<style>
  .mv-pin {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    /* A finger-sized target around a smaller disc. */
    width: 44px;
    height: 44px;
    cursor: pointer;
  }
  .disc {
    display: block;
    transform: scale(var(--mv-pin-scale, 1));
    transform-origin: 50% 50%;
    transition: transform 0.2s ease;
  }
  .selected .disc {
    transform: scale(calc(var(--mv-pin-scale, 1) * 1.35));
    filter: drop-shadow(0 0 0 #f7db5c) drop-shadow(0 0 6px #f7db5c);
  }
  .fresh .disc {
    animation: mv-drop 0.55s cubic-bezier(0.34, 1.7, 0.5, 1) both;
  }
  @keyframes mv-drop {
    0% {
      transform: translateY(-26px) scale(0.4);
      opacity: 0;
    }
    100% {
      transform: scale(var(--mv-pin-scale, 1));
      opacity: 1;
    }
  }
  .note {
    position: absolute;
    top: calc(50% + 15px * var(--mv-pin-scale, 1) + 3px);
    left: 50%;
    padding: 2px 6px;
    border-radius: 6px;
    background: rgba(251, 249, 242, 0.92);
    color: #15261c;
    font-family: var(--lp-mono, ui-monospace, monospace);
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.02em;
    line-height: 1.2;
    white-space: nowrap;
    opacity: var(--mv-note-opacity, 1);
    transform: translateX(-50%);
    pointer-events: none;
  }
  .mv-pin:focus-visible {
    outline: 2px solid #f7db5c;
    outline-offset: 2px;
    border-radius: 50%;
  }
  @media (prefers-reduced-motion: reduce) {
    .fresh .disc {
      animation: none;
    }
    .disc {
      transition: none;
    }
  }
</style>
