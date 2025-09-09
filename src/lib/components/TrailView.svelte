<!-- src/lib/components/TrailView.svelte -->
<svelte:options accessors={true} />

<script lang="ts">
  import type { Map } from "mapbox-gl"
  import TrailManager from "$lib/components/TrailManager.svelte"
  import TrailHighlighter from "$lib/components/TrailHighlighter.svelte"

  export let map: Map

  let trailManagerAPI
  let highlighterAPI

  // Simple export - no need for complex renaming
  export { highlighterAPI }
</script>

<TrailManager
  {map}
  bind:trailManagerAPI
  let:calculateZoomDependentWidth
  let:generateTrailIds
  let:deleteTrail
>
  <TrailHighlighter
    {map}
    {calculateZoomDependentWidth}
    {generateTrailIds}
    {deleteTrail}
    bind:highlighterAPI
  />
</TrailManager>
