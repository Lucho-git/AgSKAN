<script>
  import { onMount } from "svelte"
  import { getContext } from "svelte"
  import { browser } from "$app/environment"
  import * as mapboxgl from "mapbox-gl"

  let map

  const { getMap } = getContext("map")

  onMount(async () => {
    if (!browser) return

    try {
      map = await getMap()

      const nav = new mapboxgl.NavigationControl({
        showZoom: false,
        showCompass: false,
        visualizePitch: false,
      })

      map.addControl(nav, "bottom-right")
    } catch (err) {
      console.warn("Map initialization error:", err)
    }
  })
</script>

<style>
  /* Increase size of all mapbox controls */
  :global(.mapboxgl-ctrl-group > button) {
    width: 60px !important;
    height: 60px !important;
  }

  :global(.mapboxgl-ctrl-geolocate .mapboxgl-ctrl-icon) {
    background-size: 44px !important;
  }
</style>
