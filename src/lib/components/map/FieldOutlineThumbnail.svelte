<!-- src/lib/components/map/FieldOutlineThumbnail.svelte -->
<!-- Lightweight SVG field outline thumbnail - no Mapbox needed -->
<script lang="ts">
  export let boundary: any = null
  export let width = 80
  export let height = 56
  export let fillColor = "#0080ff"
  export let outlineColor = "#bfffbf"

  $: pathData = boundary ? geoJsonToSvgPath(boundary, width, height) : ""

  function geoJsonToSvgPath(geom: any, w: number, h: number): string {
    if (!geom || !geom.type) return ""

    // Collect all coordinate rings
    let rings: number[][][] = []
    if (geom.type === "Polygon") {
      rings = geom.coordinates
    } else if (geom.type === "MultiPolygon") {
      rings = geom.coordinates.flat()
    } else {
      return ""
    }

    // Compute bounding box of all rings
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const ring of rings) {
      for (const [x, y] of ring) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }

    const pad = 4
    const scaleX = (w - pad * 2) / (maxX - minX || 1)
    const scaleY = (h - pad * 2) / (maxY - minY || 1)
    const scale = Math.min(scaleX, scaleY)

    // Center in viewBox
    const geoW = (maxX - minX) * scale
    const geoH = (maxY - minY) * scale
    const offX = pad + (w - pad * 2 - geoW) / 2
    const offY = pad + (h - pad * 2 - geoH) / 2

    const project = (x: number, y: number) =>
      `${(x - minX) * scale + offX},${(-(y - maxY)) * scale + offY}` // flip Y for SVG

    return rings
      .map((ring) => {
        const pts = ring.map(([x, y]) => project(x, y)).join(" ")
        return "M" + pts + "Z"
      })
      .join(" ")
  }
</script>

{#if pathData}
  <svg width={width} height={height} viewBox="0 0 {width} {height}" class="field-outline-thumb">
    <path d={pathData} fill={fillColor} fill-opacity="0.25" stroke={outlineColor} stroke-width="1" />
  </svg>
{:else}
  <div class="field-outline-empty" style="width:{width}px;height:{height}px">
    <span class="text-xs opacity-20">no shape</span>
  </div>
{/if}

<style>
  .field-outline-thumb {
    border-radius: 6px;
    border: 1px solid oklch(var(--base-300) / 0.3);
    background: oklch(var(--base-200) / 0.5);
    flex-shrink: 0;
  }
  .field-outline-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(0, 0, 0, 0.2);
    flex-shrink: 0;
    color: rgba(255, 255, 255, 0.4);
  }
</style>
