<script lang="ts">
  /**
   * A map pin using the app's own pin art (see pinGlyphs.ts): a white disc
   * with the real rock / gate / field bin glyph inside. Must be rendered
   * inside an <svg>.
   */
  import { pinGlyphs, type PinKind } from "./pinGlyphs"

  export let kind: PinKind
  /** Centre position in the parent SVG's units. */
  export let x = 0
  export let y = 0
  /** Disc radius. */
  export let r = 11
  /** Optional caption under the pin. */
  export let label = ""

  $: glyph = pinGlyphs[kind]
  $: box = r * 1.36
</script>

<g transform="translate({x} {y})">
  <ellipse
    cx="0"
    cy={r + 1}
    rx={r * 0.64}
    ry={r * 0.2}
    fill="#15261C"
    opacity="0.22"
  />
  <circle {r} fill="#fff" stroke="#15261C" stroke-width={r * 0.17} />
  <svg
    x={-box / 2}
    y={-box / 2}
    width={box}
    height={box}
    viewBox={glyph.viewBox}
  >
    {@html glyph.content}
  </svg>
  {#if label}
    <text y={r + 12} text-anchor="middle">{label}</text>
  {/if}
</g>

<style>
  text {
    font-family: var(--lp-mono, ui-monospace, monospace);
    font-size: 7.5px;
    font-weight: 500;
    letter-spacing: 0.02em;
    fill: #15261c;
  }
</style>
