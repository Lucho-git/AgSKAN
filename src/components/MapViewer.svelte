<script>
  import { onMount, onDestroy, setContext } from "svelte"
  import mapboxgl from "mapbox-gl"
  import "mapbox-gl/dist/mapbox-gl.css"
  import { mapStore } from "../stores/mapStore"
  import {
    fieldBoundaryStore,
    markerBoundaryStore,
  } from "$lib/stores/homeBoundaryStore"
  import { trailDataLoaded, vehicleDataLoaded } from "../stores/loadedStore"
  import { selectedOperationStore } from "$lib/stores/operationStore"
  import { toast } from "svelte-sonner"
  import { browser } from "$app/environment"
  import { PUBLIC_MAPBOX_ACCESS_TOKEN } from "$env/static/public"

  import MarkerManager from "./MarkerManager.svelte"
  import ButtonSection from "./ButtonSection.svelte"
  import MapStateSaver from "./MapStateSaver.svelte"
  import VehicleTracker from "./VehicleTracker.svelte"
  import VehicleStateSynchronizer from "./VehicleStateSynchronizer.svelte"
  import TrailTracker from "./TrailTracker.svelte"
  import MapFields from "./MapFields.svelte"
  import MapSatelliteOptions from "./MapSatelliteOptions.svelte"

  import TrailSynchronizer from "$lib/components/TrailSynchronizer.svelte"
  import TrailView from "$lib/components/TrailView.svelte"
  import DrawingHectares from "$lib/components/DrawingHectares.svelte"
  import NavigationControl from "$lib/components/NavigationControl.svelte"

  import { db } from "./db.js"

  export let handleBackToDashboard
  export let initialLocation
  export let selectedOperation

  let dbInstance

  const DEFAULT_SATELLITE_STYLE = "mapbox://styles/mapbox/satellite-streets-v12"

  let mapLoaded = false
  let mapContainer
  let map

  let mapInitialized = false
  let mapboxInitError = null

  setContext("map", {
    getMap: () => Promise.resolve(map),
  })

  const mapOptions = {
    container: null,
    style: DEFAULT_SATELLITE_STYLE,
    center: [133.7751, -25.2744], // Center on Australia
    zoom: 4,
  }

  function initializeMapLocation() {
    if (!map || !initialLocation || !Array.isArray(initialLocation)) return

    try {
      if (initialLocation.length === 4) {
        const bounds = [
          [initialLocation[0], initialLocation[1]],
          [initialLocation[2], initialLocation[3]],
        ]
        map.fitBounds(bounds, {
          padding: 50,
          maxZoom: 15,
        })
      } else if (initialLocation.length === 2) {
        map.flyTo({
          center: initialLocation,
          zoom: 15,
          duration: 4000,
        })
      }
    } catch (error) {
      console.error("Error initializing map location:", error)
    }
  }

  onMount(async () => {
    if (!browser) return

    try {
      mapboxgl.accessToken = PUBLIC_MAPBOX_ACCESS_TOKEN

      mapOptions.container = mapContainer
      map = new mapboxgl.Map({
        ...mapOptions,
        accessToken: PUBLIC_MAPBOX_ACCESS_TOKEN,
        fadeDuration: 300,
        refreshExpiredTiles: false,
        maxTileCacheSize: 100,
        attributionControl: false, // Disable default attribution
      })

      map.setMaxPitch(0)
      map.setMinPitch(0)

      mapStore.set(map)
      mapInitialized = true

      if (map.loaded()) {
        mapLoaded = true
        initializeMapLocation()
      } else {
        map.on("load", () => {
          mapLoaded = true
          initializeMapLocation()
        })
      }

      // Suppress non-critical errors
      map.on("error", (e) => {
        // Only log critical errors, suppress tile 404s and other expected errors
        if (
          e.error &&
          !e.error.message?.includes("404") &&
          !e.error.message?.includes("tile")
        ) {
          console.error("Map error:", e.error)
        }
      })

      try {
        await db.open()
        dbInstance = db
      } catch (error) {
        console.error("Error opening IndexedDB database:", error)
      }
    } catch (error) {
      console.error("Error initializing Mapbox:", error)
      mapboxInitError = error.message
      toast.error(`Failed to initialize map: ${error.message}`)
    }
  })

  onDestroy(() => {
    if (map) {
      map.off()
      map.remove()
      map = null
      mapStore.set(null)
    }
  })

  let markerPlacementEvent = null
  let markerClickEvent = null

  function handleMarkerPlacement(event) {
    markerPlacementEvent = event.detail
  }

  function handleMarkerClick(event) {
    markerClickEvent = event.detail
  }

  function handleLocateHome() {
    if (!map) return

    if ($fieldBoundaryStore) {
      map.fitBounds($fieldBoundaryStore, {
        padding: 50,
        maxZoom: 15,
      })
    } else if ($markerBoundaryStore) {
      map.fitBounds($markerBoundaryStore, {
        padding: 50,
        maxZoom: 15,
      })
    } else {
      toast.error(
        "Please place markers or upload field boundaries to set a home location",
        {
          duration: 4000,
        },
      )
    }
  }
</script>

<div class="map-container" bind:this={mapContainer}>
  {#if mapboxInitError}
    <div class="error-container">
      <h2>Map Initialization Error</h2>
      <p>{mapboxInitError}</p>
      <button on:click={() => window.location.reload()}>Retry</button>
      <button on:click={handleBackToDashboard}>Back to Dashboard</button>
    </div>
  {:else if mapInitialized}
    <!-- Satellite Options Component -->
    <MapSatelliteOptions {map} {mapLoaded} />

    <ButtonSection
      on:backToDashboard={handleBackToDashboard}
      on:locateHome={handleLocateHome}
    />
    <NavigationControl />

    <MarkerManager
      {map}
      {mapLoaded}
      {markerPlacementEvent}
      {markerClickEvent}
    />
    <MapStateSaver {map} />

    <VehicleStateSynchronizer />
    <VehicleTracker {map} disableAutoZoom={initialLocation} />
    <MapFields {map} />
    <DrawingHectares {map} />
    {#if selectedOperation}
      <TrailSynchronizer {selectedOperation} {map} />
    {/if}
  {/if}
</div>

<style>
  .map-container {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: 100%;
    height: 100%;
  }

  .error-container {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background-color: white;
    padding: 20px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    text-align: center;
    max-width: 90%;
  }

  .error-container h2 {
    color: #e53e3e;
    margin-bottom: 10px;
  }

  .error-container button {
    margin: 10px 5px 0;
    padding: 8px 16px;
    background-color: #4299e1;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }

  .error-container button:hover {
    background-color: #3182ce;
  }

  /* Hide the Mapbox logo in bottom left */
  :global(.mapboxgl-ctrl-logo) {
    display: none !important;
  }
</style>
