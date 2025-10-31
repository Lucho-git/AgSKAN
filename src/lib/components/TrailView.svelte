<!-- src/lib/components/TrailView.svelte -->
<svelte:options accessors={true} />

<script lang="ts">
  import type { Map } from "mapbox-gl"
  import HistoricalTrailManager from "$lib/components/HistoricalTrailManager.svelte"
  import ActiveTrailManager from "$lib/components/ActiveTrailManager.svelte"
  import TrailHighlighter from "$lib/components/TrailHighlighter.svelte"

  export let map: Map

  let historicalTrailAPI
  let activeTrailAPI
  let highlighterAPI

  // Export the highlighter API for parent components
  export { highlighterAPI }
</script>

<HistoricalTrailManager {map} bind:historicalTrailAPI let:deleteTrail>
  <ActiveTrailManager {map} bind:activeTrailAPI>
    <TrailHighlighter
      {map}
      {deleteTrail}
      {historicalTrailAPI}
      {activeTrailAPI}
      bind:highlighterAPI
    />
  </ActiveTrailManager>
</HistoricalTrailManager>
