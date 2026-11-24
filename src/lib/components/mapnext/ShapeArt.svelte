<script lang="ts">
  /**
   * A paddock (or anything drawn on the map) as a small picture of its own
   * shape: the outline it really has, holes and separate pieces included,
   * north up. A line is drawn as a line.
   */
  import type { LngLat } from "./geo"

  /** Polygon rings, outer first; several polygons for several pieces. */
  export let polygons: LngLat[][][] = []
  /** Instead of an area: a line. */
  export let line: LngLat[] | null = null
  /** What it is filled with (or, for a line, drawn in). */
  export let colour: string | null = null
  /** Width and height in pixels. */
  export let size = 40

  const PAD = 3
  /** A picture this small can't show more corners than this per ring. */
  const MOST = 90

  const thin = (ring: LngLat[]) => {
    if (ring.length <= MOST) return ring
    const step = Math.ceil(ring.length / MOST)
    return ring.filter((_, i) => i % step === 0)
  }

  function draw(shapes: LngLat[][][], path: LngLat[] | null, box: number) {
    const all = path ?? shapes.flatMap((polygon) => polygon[0] ?? [])
    if (all.length < 2) return ""
    let w = Infinity
    let e = -Infinity
    let s = Infinity
    let n = -Infinity
    for (const [lng, lat] of all) {
      if (lng < w) w = lng
      if (lng > e) e = lng
      if (lat < s) s = lat
      if (lat > n) n = lat
    }
    // A degree of longitude is shorter than one of latitude away from the
    // equator; without this a square paddock would come out tall.
    const squash = Math.cos((((n + s) / 2) * Math.PI) / 180)
    const wide = Math.max((e - w) * squash, 1e-9)
    const tall = Math.max(n - s, 1e-9)
    const scale = (box - 2 * PAD) / Math.max(wide, tall)
    const left = (box - wide * scale) / 2
    const top = (box - tall * scale) / 2
    const at = ([lng, lat]: LngLat) =>
      `${(left + (lng - w) * squash * scale).toFixed(1)},${(
        top +
        (n - lat) * scale
      ).toFixed(1)}`
    if (path) return `M${path.map(at).join("L")}`
    return shapes
      .flatMap((polygon) =>
        polygon.map((ring) => `M${thin(ring).map(at).join("L")}Z`),
      )
      .join("")
  }

  $: d = draw(polygons, line, size)
</script>

<svg
  class="mn-shape"
  width={size}
  height={size}
  viewBox="0 0 {size} {size}"
  aria-hidden="true"
>
  {#if d && line}
    <path
      {d}
      fill="none"
      stroke="#15261c"
      stroke-width="4.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <path
      {d}
      fill="none"
      stroke={colour ?? "#F7DB5C"}
      stroke-width="2.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  {:else if d}
    <path
      {d}
      fill={colour ?? "#F4F1E6"}
      fill-rule="evenodd"
      stroke="#15261c"
      stroke-width="1.6"
      stroke-linejoin="round"
    />
  {/if}
</svg>

<style>
  .mn-shape {
    display: block;
    flex-shrink: 0;
  }
</style>
