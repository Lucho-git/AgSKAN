<script lang="ts">
  /**
   * One of the app's pins as a picture: its own art on a white disc, the
   * same image the map layer draws. Used in the pin picker and the pin card.
   */
  import { onMount } from "svelte"
  import {
    loadPinGlyphs,
    pinGlyphsLoaded,
    pinDataUrl,
    pinImageKey,
    pinStyle,
    type PinLook,
    type PinStyle,
  } from "./pins"

  export let look: PinLook
  /** Drawn in this style rather than the one the map is set to. */
  export let style: PinStyle | null = null
  /** Diameter in pixels. */
  export let size = 36

  // The art arrives in one small download; until then the disc is empty.
  // (Once it is in, a pin is drawn from its first frame: no blank flash
  // each time one is put on the page.)
  let loaded = pinGlyphsLoaded()
  onMount(() => {
    if (!loaded) loadPinGlyphs().then(() => (loaded = true))
  })

  $: key = pinImageKey(look, style ?? $pinStyle)
  $: src = loaded ? pinDataUrl(key, size * 2) : ""
</script>

{#if src}
  <!-- (Not draggable: a browser's own image drag would take over a press
       on a pin button, and the button's own drag would never start.) -->
  <img
    class="mn-pin-art"
    {src}
    width={size}
    height={size}
    alt=""
    draggable="false"
  />
{:else}
  <span class="mn-pin-art blank" style="width: {size}px; height: {size}px"
  ></span>
{/if}

<style>
  .mn-pin-art {
    display: block;
    flex-shrink: 0;
    -webkit-user-drag: none;
    user-select: none;
    -webkit-touch-callout: none;
  }
  .blank {
    border-radius: 50%;
    background: #fff;
    box-shadow: inset 0 0 0 2px #15261c;
    transform: scale(0.85);
  }
</style>
