<!-- src/lib/components/map/trails/TrailView.svelte -->
<svelte:options accessors={true} />

<script lang="ts">
  import type { Map } from "mapbox-gl"
  import HistoricalTrailManager from "./HistoricalTrailManager.svelte"
  import ActiveTrailManager from "./ActiveTrailManager.svelte"
  import TrailHighlighter from "./TrailHighlighter.svelte"

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
