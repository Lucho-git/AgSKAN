<script lang="ts">
  /**
   * One of the app's own pin drawings on a white disc, as on the landing
   * page's illustrated map. Used for pins on the map and in the pin picker.
   */
  import { pinGlyphs, type PinKind } from "./glyphs"

  export let kind: PinKind
  /** Diameter of the disc in pixels. */
  export let size = 32
  /** Draw a soft ground shadow under the disc (for pins on the map). */
  export let shadow = false

  $: glyph = pinGlyphs[kind]
</script>

<svg
  class="mv-glyph"
  width={size}
  height={shadow ? size * 1.12 : size}
  viewBox="-15 -15 30 {shadow ? 33.6 : 30}"
  aria-hidden="true"
>
  {#if shadow}
    <ellipse cx="0" cy="15.4" rx="8.5" ry="2.6" fill="#15261C" opacity="0.28" />
  {/if}
  <circle r="13.6" fill="#fff" stroke="#15261C" stroke-width="2.2" />
  <svg x="-9" y="-9" width="18" height="18" viewBox={glyph.viewBox}>
    <!-- The app's own pin art, generated into glyphs.ts: not user input. -->
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    {@html glyph.content}
  </svg>
</svg>

<style>
  .mv-glyph {
    display: block;
    overflow: visible;
  }
</style>
