<script>
  import { onMount, onDestroy, setContext } from "svelte"
  import * as mapboxgl from "mapbox-gl"
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
  import MapControls from "./MapControls.svelte"
  import MapStateSaver from "./MapStateSaver.svelte"
  import VehicleTracker from "./VehicleTracker.svelte"
  import VehicleStateSynchronizer from "./VehicleStateSynchronizer.svelte"
  import TrailTracker from "./TrailTracker.svelte"
  import MapFields from "./MapFields.svelte"

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
  const DEFAULT_OUTDOORS_STYLE = "mapbox://styles/mapbox/outdoors-v12"

  let isSatelliteStyle = true
  let currentMapStyle = DEFAULT_SATELLITE_STYLE
  let mapLoaded = false

  let mapContainer
  let map

  let mapControls
  let mapInitialized = false
  let mapboxInitError = null

  setContext("map", {
    getMap: () => Promise.resolve(map),
  })

  const mapOptions = {
    container: null,
    style: DEFAULT_SATELLITE_STYLE,
    center: [90, -40],
    zoom: 2,
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
      // Set the access token from environment variable
      mapboxgl.accessToken = PUBLIC_MAPBOX_ACCESS_TOKEN

      // One key change: explicitly pass the token to the map constructor
      mapOptions.container = mapContainer
      map = new mapboxgl.Map({
        ...mapOptions,
        accessToken: PUBLIC_MAPBOX_ACCESS_TOKEN,
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

      // Handle map load errors
      map.on("error", (e) => {
        console.error("Mapbox error:", e.error)
        toast.error(`Map error: ${e.error?.message || "Unknown map error"}`)
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
    if (mapControls) {
      mapControls.$destroy()
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

  function toggleMapStyle() {
    if (!map) return

    mapLoaded = false
    if (isSatelliteStyle) {
      currentMapStyle = DEFAULT_OUTDOORS_STYLE
    } else {
      currentMapStyle = DEFAULT_SATELLITE_STYLE
    }
    map.setStyle(currentMapStyle)
    map.once("load", () => {
      mapLoaded = true
      initializeMapLocation()
    })
    isSatelliteStyle = !isSatelliteStyle
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
    <ButtonSection
      on:toggleMapStyleDispatcher={toggleMapStyle}
      on:backToDashboard={handleBackToDashboard}
      on:locateHome={handleLocateHome}
    />
    <NavigationControl />

    <MarkerManager {markerPlacementEvent} {markerClickEvent} />
    <MapStateSaver {map} />

    <MapControls
      bind:this={mapControls}
      {map}
      on:markerPlacement={handleMarkerPlacement}
      on:markerClick={handleMarkerClick}
    />

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
</style>
