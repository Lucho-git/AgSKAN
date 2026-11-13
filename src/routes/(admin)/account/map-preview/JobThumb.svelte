<script lang="ts">
  /**
   * A small picture of where a job is: the paddocks it names drawn to
   * shape, the pins as dots, anything drawn on those pins, and plain spots
   * as rings. Drawn from the farm this screen already has, so nothing but
   * the names and places travels with the message.
   */
  import type { LngLat } from "$lib/components/mapnext/geo"
  import type { JobItem, Paddock, PinDrawing } from "./liveData"

  export let items: JobItem[] = []
  export let paddocks: Paddock[] = []
  export let drawings: PinDrawing[] = []
  export let width = 120
  export let height = 90

  const PAD = 9

  $: fields = items
    .filter((item) => item.type === "field")
    .map((item) => paddocks.find((paddock) => paddock.id === item.id))
    .filter((paddock): paddock is Paddock => !!paddock)
  $: pinIds = new Set(
    items.filter((item) => item.type === "marker").map((item) => item.id),
  )
  $: drawn = drawings.filter((drawing) => pinIds.has(drawing.pinId))
  $: view = frame(items, fields, drawn)

  // Everything the picture has to fit, and how a place becomes a point in it.
  function frame(list: JobItem[], around: Paddock[], extra: PinDrawing[]) {
    const points: LngLat[] = list.map((item) => item.at)
    for (const paddock of around)
      points.push(
        [paddock.bbox[0], paddock.bbox[1]],
        [paddock.bbox[2], paddock.bbox[3]],
      )
    for (const drawing of extra)
      for (const point of flat(drawing.geometry.coordinates)) points.push(point)
    for (const item of list)
      for (const point of item.points ?? []) points.push(point)
    if (!points.length) return null
    let w = Math.min(...points.map((p) => p[0]))
    let e = Math.max(...points.map((p) => p[0]))
    let s = Math.min(...points.map((p) => p[1]))
    let n = Math.max(...points.map((p) => p[1]))
    // A lone pin or spot still gets some ground around it.
    const least = 0.0025
    if (e - w < least) {
      const mid = (e + w) / 2
      w = mid - least / 2
      e = mid + least / 2
    }
    if (n - s < least) {
      const mid = (n + s) / 2
      s = mid - least / 2
      n = mid + least / 2
    }
    const squash = Math.cos(((n + s) / 2) * (Math.PI / 180))
    const scale = Math.min(
      (width - 2 * PAD) / ((e - w) * squash),
      (height - 2 * PAD) / (n - s),
    )
    const left = (width - (e - w) * squash * scale) / 2
    const top = (height - (n - s) * scale) / 2
    return (at: LngLat): [number, number] => [
      left + (at[0] - w) * squash * scale,
      top + (n - at[1]) * scale,
    ]
  }

  function flat(coordinates: unknown): LngLat[] {
    if (!Array.isArray(coordinates)) return []
    if (typeof coordinates[0] === "number") return [coordinates as LngLat]
    return coordinates.flatMap(flat)
  }

  const lineOf = (drawing: PinDrawing) => [
    drawing.geometry.coordinates as LngLat[],
  ]
  const ringsOf = (drawing: PinDrawing) =>
    drawing.geometry.coordinates as LngLat[][]

  const path = (
    rings: LngLat[][],
    to: (at: LngLat) => [number, number],
    close = true,
  ) =>
    rings
      .map(
        (ring) =>
          ring
            .map((at, i) => {
              const [x, y] = to(at)
              return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`
            })
            .join("") + (close ? "Z" : ""),
      )
      .join("")
</script>

<svg
  class="mn-job-thumb"
  viewBox="0 0 {width} {height}"
  {width}
  {height}
  role="img"
  aria-label="Where the job is"
>
  <rect {width} {height} rx="10" fill="#d8cfae" />
  {#if view}
    {#each fields as paddock (paddock.id)}
      <path
        d={paddock.polygons.map((rings) => path(rings, view)).join("")}
        fill={paddock.colour ?? "#a9be7a"}
        fill-opacity="0.75"
        fill-rule="evenodd"
        stroke="#15261c"
        stroke-width="1.4"
        stroke-linejoin="round"
      />
    {/each}
    {#each drawn as drawing (drawing.id)}
      {#if drawing.kind === "line"}
        <path
          d={path(lineOf(drawing), view, false)}
          fill="none"
          stroke={drawing.colour}
          stroke-width="2.2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      {:else}
        <path
          d={path(ringsOf(drawing), view)}
          fill={drawing.colour}
          fill-opacity="0.55"
          stroke={drawing.colour}
          stroke-width="1.4"
        />
      {/if}
    {/each}
    {#each items as item}
      {#if item.points && item.type === "area"}
        <path
          d={path([item.points], view)}
          fill="#f7db5c"
          fill-opacity="0.6"
          stroke="#15261c"
          stroke-width="1.5"
          stroke-linejoin="round"
        />
      {:else if item.points}
        <path
          d={path([item.points], view, false)}
          fill="none"
          stroke="#15261c"
          stroke-width="4.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <path
          d={path([item.points], view, false)}
          fill="none"
          stroke="#f7db5c"
          stroke-width="2.4"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      {:else if item.type !== "field"}
        {@const [x, y] = view(item.at)}
        {#if item.type === "marker"}
          <circle
            cx={x}
            cy={y}
            r="5.5"
            fill="#38bdf8"
            stroke="#15261c"
            stroke-width="1.6"
          />
        {:else}
          <circle
            cx={x}
            cy={y}
            r="6"
            fill="none"
            stroke="#15261c"
            stroke-width="2"
          />
          <circle cx={x} cy={y} r="2" fill="#15261c" />
        {/if}
      {/if}
    {/each}
  {/if}
</svg>

<style>
  .mn-job-thumb {
    display: block;
    flex-shrink: 0;
    border-radius: 10px;
  }
</style>
