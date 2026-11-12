<script lang="ts">
  /**
   * One of the app's pins as a picture: its own art on a white disc, the
   * same image the map layer draws. Used in the pin picker and the pin card.
   */
  import { onMount } from "svelte"
  import { loadPinGlyphs, pinDataUrl, pinImageKey, type PinLook } from "./pins"

  export let look: PinLook
  /** Diameter in pixels. */
  export let size = 36

  // The art arrives in one small download; until then the disc is empty.
  let loaded = false
  onMount(() => {
    loadPinGlyphs().then(() => (loaded = true))
  })

  $: key = pinImageKey(look)
  $: src = loaded ? pinDataUrl(key, size * 2) : ""
</script>

{#if src}
  <img class="mn-pin-art" {src} width={size} height={size} alt="" />
{:else}
  <span class="mn-pin-art blank" style="width: {size}px; height: {size}px"
  ></span>
{/if}

<style>
  .mn-pin-art {
    display: block;
    flex-shrink: 0;
  }
  .blank {
    border-radius: 50%;
    background: #fff;
    box-shadow: inset 0 0 0 2px #15261c;
    transform: scale(0.85);
  }
</style>
