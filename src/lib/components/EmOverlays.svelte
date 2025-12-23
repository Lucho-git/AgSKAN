<!-- EmOverlays.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from "svelte"
  import { supabase } from "$lib/supabaseClient"
  import { connectedMapStore } from "$lib/stores/connectedMapStore"

  export let map: mapboxgl.Map

  let isDestroyed = false
  let overlays = []
  let menuOpen = false
  let showLabels = false
  let showLegend = true
  let overlayOpacity = 70

  // Hardcoded for this client
  const TARGET_MAP_ID = "f4f55f0e-8340-4748-a0ca-eb9f7ffb3123"

  // Check if this is the correct map reactively
  $: isTargetMap = $connectedMapStore.id === TARGET_MAP_ID

  // Possible property names for the value
  const VALUE_PROPERTIES = ["Ripper", "Reefinate"]

  const COLOUR_STOPS = [
    { value: 2, colour: "#d73027" },
    { value: 4, colour: "#f46d43" },
    { value: 6, colour: "#fdae61" },
    { value: 8, colour: "#fee08b" },
    { value: 10, colour: "#d9ef8b" },
    { value: 12, colour: "#a6d96a" },
    { value: 14, colour: "#1a9850" },
  ]

  function getValuePropertyName(geojson): string {
    const firstFeature = geojson.features?.[0]
    if (!firstFeature?.properties) return "Ripper"

    for (const prop of VALUE_PROPERTIES) {
      if (firstFeature.properties[prop] !== undefined) {
        return prop
      }
    }
    return "Ripper"
  }

  function getColourStops(propertyName: string) {
    return [
      "interpolate",
      ["linear"],
      ["get", propertyName],
      2,
      "#d73027",
      4,
      "#f46d43",
      6,
      "#fdae61",
      8,
      "#fee08b",
      10,
      "#d9ef8b",
      12,
      "#a6d96a",
      14,
      "#1a9850",
    ]
  }

  function toggleMenu() {
    menuOpen = !menuOpen
  }

  function toggleLabels() {
    showLabels = !showLabels
    updateLabelVisibility()
  }

  function toggleLegend() {
    showLegend = !showLegend
  }

  function handleOpacityChange(event: Event) {
    overlayOpacity = parseInt((event.target as HTMLInputElement).value)
    updateLayerOpacity()
  }

  function updateLayerOpacity() {
    if (!map) return

    const opacity = overlayOpacity / 100

    for (const overlay of overlays) {
      const fillLayerId = `em-overlay-fill-${overlay.id}`
      const outlineLayerId = `em-overlay-outline-${overlay.id}`

      if (map.getLayer(fillLayerId)) {
        map.setPaintProperty(fillLayerId, "fill-opacity", opacity)
      }
      if (map.getLayer(outlineLayerId)) {
        map.setPaintProperty(outlineLayerId, "line-opacity", opacity * 0.7)
      }
    }
  }

  function updateLabelVisibility() {
    if (!map) return

    for (const overlay of overlays) {
      const labelLayerId = `em-overlay-label-${overlay.id}`

      if (map.getLayer(labelLayerId)) {
        map.setLayoutProperty(
          labelLayerId,
          "visibility",
          showLabels ? "visible" : "none",
        )
      }
    }
  }

  function getBeforeLayerId(): string | undefined {
    // Insert below markers and fields - find the first available layer to insert before
    const layersToInsertBefore = [
      "fields-fill",
      "fields-fill-selected",
      "markers-layer",
      "markers-selection-circle",
      "markers-selected-layer",
    ]

    for (const layerId of layersToInsertBefore) {
      if (map.getLayer(layerId)) {
        return layerId
      }
    }

    return undefined
  }

  async function loadOverlays() {
    // Early exit if not the target map
    if (!isTargetMap) {
      console.log("🗺️ EmOverlays: Not target map, skipping overlay load")
      return
    }

    console.log("🗺️ EmOverlays: loadOverlays called for target map")

    try {
      const result = await supabase
        .from("em_overlays")
        .select("*")
        .eq("map_id", TARGET_MAP_ID)

      const { data, error } = result

      if (error) {
        console.error("🗺️ EmOverlays: Supabase error:", error)
        return
      }

      overlays = data || []
      console.log(`🗺️ EmOverlays: Loaded ${overlays.length} overlay(s)`)

      if (overlays.length === 0) {
        console.warn("🗺️ EmOverlays: No overlays found")
        return
      }

      if (!map) {
        console.error("🗺️ EmOverlays: Map is null")
        return
      }

      const waitForMap = () => {
        return new Promise((resolve) => {
          if (map.loaded() && map.isStyleLoaded()) {
            resolve(true)
          } else {
            map.once("idle", () => resolve(true))
          }
        })
      }

      await waitForMap()

      for (const overlay of overlays) {
        addOverlayToMap(overlay)
      }
    } catch (error) {
      console.error("🗺️ EmOverlays: Exception:", error)
    }
  }

  function addOverlayToMap(overlay) {
    if (!map || isDestroyed) return

    const sourceId = `em-overlay-${overlay.id}`
    const fillLayerId = `em-overlay-fill-${overlay.id}`
    const outlineLayerId = `em-overlay-outline-${overlay.id}`
    const labelLayerId = `em-overlay-label-${overlay.id}`

    try {
      const propertyName = getValuePropertyName(overlay.geojson)
      const beforeLayerId = getBeforeLayerId()

      if (!map.getSource(sourceId)) {
        map.addSource(sourceId, {
          type: "geojson",
          data: overlay.geojson,
        })
      }

      if (!map.getLayer(fillLayerId)) {
        map.addLayer(
          {
            id: fillLayerId,
            type: "fill",
            source: sourceId,
            paint: {
              "fill-color": getColourStops(propertyName),
              "fill-opacity": overlayOpacity / 100,
            },
          },
          beforeLayerId,
        )
      }

      if (!map.getLayer(outlineLayerId)) {
        map.addLayer(
          {
            id: outlineLayerId,
            type: "line",
            source: sourceId,
            paint: {
              "line-color": "#000",
              "line-width": 1,
              "line-opacity": (overlayOpacity / 100) * 0.7,
            },
          },
          beforeLayerId,
        )
      }

      if (!map.getLayer(labelLayerId)) {
        map.addLayer(
          {
            id: labelLayerId,
            type: "symbol",
            source: sourceId,
            layout: {
              "text-field": ["to-string", ["get", propertyName]],
              "text-size": 11,
              "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
              "text-allow-overlap": true,
              visibility: showLabels ? "visible" : "none",
            },
            paint: {
              "text-color": "#ffffff",
              "text-halo-color": "#000000",
              "text-halo-width": 1,
            },
          },
          beforeLayerId,
        )
      }

      console.log(`🗺️ EmOverlays: ✅ Added: ${overlay.name}`)
    } catch (error) {
      console.error(`🗺️ EmOverlays: Error adding ${overlay.name}:`, error)
    }
  }

  function cleanup() {
    isDestroyed = true

    if (!map) return

    for (const overlay of overlays) {
      const sourceId = `em-overlay-${overlay.id}`
      const fillLayerId = `em-overlay-fill-${overlay.id}`
      const outlineLayerId = `em-overlay-outline-${overlay.id}`
      const labelLayerId = `em-overlay-label-${overlay.id}`

      try {
        if (map.getLayer(labelLayerId)) map.removeLayer(labelLayerId)
        if (map.getLayer(outlineLayerId)) map.removeLayer(outlineLayerId)
        if (map.getLayer(fillLayerId)) map.removeLayer(fillLayerId)
        if (map.getSource(sourceId)) map.removeSource(sourceId)
      } catch (e) {
        // Ignore
      }
    }
  }

  onMount(() => {
    if (!map) return

    // Only load if this is the target map
    if (isTargetMap) {
      loadOverlays()
    }

    return () => {
      map?.off("load", loadOverlays)
      map?.off("idle", loadOverlays)
    }
  })

  onDestroy(() => {
    cleanup()
  })
</script>

{#if isTargetMap && overlays.length > 0}
  <!-- Menu Button -->
  <div class="fixed bottom-16 left-3 z-50">
    <button
      on:click={toggleMenu}
      class="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-md transition-colors hover:bg-gray-50"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <circle cx="12" cy="12" r="3" />
        <path
          d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
        />
      </svg>
      EM Options
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="h-4 w-4 transition-transform {menuOpen ? 'rotate-180' : ''}"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>

    <!-- Dropdown Menu -->
    {#if menuOpen}
      <div
        class="absolute bottom-full left-0 mb-2 w-64 rounded-lg bg-white shadow-lg"
      >
        <div class="p-3">
          <!-- Opacity Slider -->
          <div class="mb-3">
            <div class="mb-2 flex items-center justify-between">
              <span class="text-sm text-gray-700">Overlay Opacity</span>
              <span class="text-sm font-medium text-gray-900"
                >{overlayOpacity}%</span
              >
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={overlayOpacity}
              on:input={handleOpacityChange}
              class="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 accent-blue-500"
            />
          </div>

          <div class="border-t border-gray-100 pt-2">
            <button
              on:click={toggleLabels}
              class="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
            >
              <div
                class="flex h-5 w-5 items-center justify-center rounded border {showLabels
                  ? 'border-blue-500 bg-blue-500'
                  : 'border-gray-300'}"
              >
                {#if showLabels}
                  <svg
                    class="h-3 w-3 text-white"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="3"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                {/if}
              </div>
              Show Value Labels
            </button>

            <button
              on:click={toggleLegend}
              class="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
            >
              <div
                class="flex h-5 w-5 items-center justify-center rounded border {showLegend
                  ? 'border-blue-500 bg-blue-500'
                  : 'border-gray-300'}"
              >
                {#if showLegend}
                  <svg
                    class="h-3 w-3 text-white"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="3"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                {/if}
              </div>
              Show Colour Legend
            </button>
          </div>
        </div>
      </div>
    {/if}
  </div>

  <!-- Colour Legend -->
  {#if showLegend}
    <div
      class="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 transform rounded-lg bg-white px-4 py-3 shadow-md"
    >
      <div class="mb-2 text-center text-xs font-medium text-gray-600">
        EM Value
      </div>
      <div class="flex items-center gap-1">
        <span class="text-xs text-gray-500">2</span>
        <div class="flex h-4 overflow-hidden rounded">
          {#each COLOUR_STOPS as stop}
            <div class="w-8" style="background-color: {stop.colour}" />
          {/each}
        </div>
        <span class="text-xs text-gray-500">14</span>
      </div>
    </div>
  {/if}
{/if}
