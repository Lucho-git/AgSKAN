<script>
  import {
    selectedMarkerStore,
    confirmedMarkersStore,
    locationMarkerStore,
  } from "../stores/mapStore"

  import { userSettingsStore } from "$lib/stores/userSettingsStore"
  import { controlStore } from "$lib/stores/controlStore"
  import { markerVisibilityStore } from "$lib/stores/markerVisibilityStore"

  import { onMount, onDestroy, getContext } from "svelte"
  import { v4 as uuidv4 } from "uuid"
  import MarkerEditPanel from "./MarkerEditPanel.svelte"
  import { getIconImageName as getIconImageNameUtil } from "$lib/data/markerDefinitions"

  export let map
  export let mapLoaded = false
  export let coordinatedEvents = false

  // Get the layer management context
  const mapContext = getContext("map")

  // Get global selection context for unified event system
  let globalSelectionContext = null
  let globalSelectionState = null

  // Helper function to get default marker from store
  function getDefaultMarker() {
    return (
      $userSettingsStore?.defaultMarker || {
        id: "default",
        class: "default",
        name: "Default Marker",
      }
    )
  }

  // Try to get global selection context
  function checkGlobalSelectionContext() {
    try {
      globalSelectionContext = getContext("globalSelection")
      if (globalSelectionContext) {
        globalSelectionState = globalSelectionContext.getState()
        console.log("🎯 MarkerManager: Connected to global selection context")
      }
    } catch (error) {
      // Context not available yet, that's ok
    }
  }

  let locationMarkerUnsubscribe
  let confirmedMarkersUnsubscribe
  let markersInitialized = false
  let iconsLoaded = false
  let iconPaths = null

  // Periodically check for global selection context and sync
  let contextCheckInterval = null

  function syncWithGlobalSelection() {
    checkGlobalSelectionContext()

    if (globalSelectionContext) {
      const currentState = globalSelectionContext.getState()

      if (currentState.selectedType === "marker") {
        // Marker is selected via unified system
        if (
          !$selectedMarkerStore ||
          $selectedMarkerStore.id !== currentState.selectedId
        ) {
          // Find the marker data
          const marker = $confirmedMarkersStore.find(
            (m) => m.id === currentState.selectedId,
          )
          if (marker) {
            selectedMarkerStore.set({
              id: marker.id,
              coordinates: marker.coordinates,
            })
            updateMarkerSelection(marker.id, true)
            console.log(
              "🎯 MarkerManager: Synced with global selection:",
              marker.id,
            )
          }
        }
      } else if (
        currentState.selectedType !== "marker" &&
        $selectedMarkerStore
      ) {
        // Something else is selected, clear marker selection
        if ($selectedMarkerStore) {
          updateMarkerSelection($selectedMarkerStore.id, false)
        }
        selectedMarkerStore.set(null)
        controlStore.update((controls) => ({
          ...controls,
          showMarkerMenu: false,
        }))
        console.log(
          "🎯 MarkerManager: Cleared selection due to other selection",
        )
      }
    }
  }

  $: if (mapLoaded && map && !markersInitialized) {
    initializeMarkerLayers()
  }

  // Fixed: Center camera without zooming
  function centerCameraOnMarker(coordinates) {
    if (!map || !coordinates || coordinates.length !== 2) return

    map.flyTo({
      center: coordinates,
      duration: 1000,
    })
  }

  // Quick camera center for new marker placement
  function quickCenterOnMarker(coordinates) {
    if (!map || !coordinates || coordinates.length !== 2) return

    map.flyTo({
      center: coordinates,
      duration: 800,
    })
  }

  // Load high-DPI PNG icons
  async function loadHighDpiIcons() {
    if (!map || iconsLoaded || iconPaths) return

    console.log("🚀 Loading high-DPI PNG icons...")

    try {
      const response = await fetch("/icon-paths.json")
      if (!response.ok)
        throw new Error(`Failed to load icon paths: ${response.status}`)

      iconPaths = await response.json()
      console.log(`📋 Loaded ${Object.keys(iconPaths).length} icon paths`)

      const loadPromises = Object.entries(iconPaths).map(
        async ([iconKey, iconPath]) => {
          return new Promise((resolve, reject) => {
            map.loadImage(`/${iconPath}`, (error, image) => {
              if (error) {
                console.error(`❌ Failed to load ${iconKey}:`, error)
                reject(error)
                return
              }
              if (!map.hasImage(iconKey)) {
                map.addImage(iconKey, image)
              }
              resolve()
            })
          })
        },
      )

      await Promise.allSettled(loadPromises)
      iconsLoaded = true
      console.log("🎯 All high-DPI PNG icons loaded!")
    } catch (error) {
      console.error("❌ Error loading high-DPI icons:", error)
      await loadFallbackIcons()
    }
  }

  async function loadFallbackIcons() {
    if (!map || iconsLoaded) return

    console.log("Loading fallback icons...")

    if (!map.hasImage("default")) {
      const canvas = document.createElement("canvas")
      canvas.width = 35
      canvas.height = 35
      const ctx = canvas.getContext("2d")

      ctx.fillStyle = "#3b82f6"
      ctx.beginPath()
      ctx.arc(17.5, 17.5, 14, 0, 2 * Math.PI)
      ctx.fill()
      ctx.strokeStyle = "white"
      ctx.lineWidth = 2
      ctx.stroke()

      ctx.fillStyle = "white"
      ctx.beginPath()
      ctx.arc(17.5, 17.5, 4, 0, 2 * Math.PI)
      ctx.fill()

      const imageData = ctx.getImageData(0, 0, 35, 35)
      map.addImage("default", { width: 35, height: 35, data: imageData.data })
    }

    iconsLoaded = true
    console.log("Fallback icon loading completed")
  }

  // Use the unified getIconImageName function
  function getIconImageName(iconClass) {
    return getIconImageNameUtil(iconClass)
  }

  async function initializeMarkerLayers() {
    if (!map || markersInitialized) return

    console.log("🏁 Initializing marker layers...")
    await loadHighDpiIcons()

    if (!map.getSource("markers")) {
      map.addSource("markers", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      })
    }

    // Main marker layer - exclude selected markers
    if (!map.getLayer("markers-layer")) {
      const layerConfig = {
        id: "markers-layer",
        type: "symbol",
        source: "markers",
        filter: ["!=", ["get", "selected"], true], // 👈 NEW: Hide selected markers from this layer
        layout: {
          "icon-image": ["get", "icon"],
          "icon-size": 0.35,
          "icon-allow-overlap": true,
          "text-allow-overlap": true,
          "icon-anchor": [
            "case",
            ["==", ["get", "icon"], "default"],
            "center",
            "center",
          ],
        },
      }

      if (mapContext?.addLayerOrdered) {
        mapContext.addLayerOrdered(layerConfig)
        console.log("✅ Added markers-layer with proper ordering")
      } else {
        map.addLayer(layerConfig)
        console.log("⚠️ Added markers-layer without ordering (fallback)")
      }
    }

    // Blue selection circle - exclude new/unconfirmed markers
    if (!map.getLayer("markers-selection-circle")) {
      const selectionLayerConfig = {
        id: "markers-selection-circle",
        type: "circle",
        source: "markers",
        filter: [
          "all",
          ["==", ["get", "selected"], true],
          ["==", ["get", "confirmed"], true],
        ],
        paint: {
          "circle-radius": 18,
          "circle-color": "transparent",
          "circle-stroke-color": "#60a5fa",
          "circle-stroke-width": 3,
          "circle-stroke-opacity": 0.8,
        },
      }

      if (mapContext?.addLayerOrdered) {
        mapContext.addLayerOrdered(selectionLayerConfig)
        console.log("✅ Added markers selection circle layer")
      } else {
        map.addLayer(selectionLayerConfig)
        console.log("⚠️ Added markers selection circle layer without ordering")
      }
    }

    // 🆕 NEW: Selected marker layer - shows ONLY the selected marker on top
    if (!map.getLayer("markers-selected-layer")) {
      const selectedLayerConfig = {
        id: "markers-selected-layer",
        type: "symbol",
        source: "markers",
        filter: ["==", ["get", "selected"], true], // 👈 Only show selected markers
        layout: {
          "icon-image": ["get", "icon"],
          "icon-size": 0.35,
          "icon-allow-overlap": true,
          "text-allow-overlap": true,
          "icon-anchor": [
            "case",
            ["==", ["get", "icon"], "default"],
            "center",
            "center",
          ],
        },
      }

      if (mapContext?.addLayerOrdered) {
        mapContext.addLayerOrdered(selectedLayerConfig)
        console.log("✅ Added markers-selected-layer with proper ordering")
      } else {
        map.addLayer(selectedLayerConfig)
        console.log(
          "⚠️ Added markers-selected-layer without ordering (fallback)",
        )
      }
    }

    markersInitialized = true
    console.log("✅ Marker layers initialization complete")

    refreshMapMarkers()
  }

  function refreshMapMarkers() {
    if (!map || !map.getSource("markers")) return

    const features = $confirmedMarkersStore.map((marker) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: marker.coordinates,
      },
      properties: {
        id: marker.id,
        icon: getIconImageName(marker.iconClass),
        iconClass: marker.iconClass || "default",
        selected: $selectedMarkerStore?.id === marker.id,
        confirmed: true,
      },
    }))

    map.getSource("markers").setData({
      type: "FeatureCollection",
      features: features,
    })
  }

  function addMarkerToLayer(feature) {
    if (!map || !map.getSource("markers")) return

    const source = map.getSource("markers")
    const data = source._data

    const existingIndex = data.features.findIndex(
      (f) => f.properties.id === feature.properties.id,
    )

    if (existingIndex >= 0) {
      data.features[existingIndex] = feature
    } else {
      data.features.push(feature)
    }

    source.setData(data)
  }

  function removeMarkerFromLayer(markerId) {
    if (!map || !map.getSource("markers")) return

    const source = map.getSource("markers")
    const data = source._data
    data.features = data.features.filter((f) => f.properties.id !== markerId)
    source.setData(data)
  }

  function updateMarkerSelection(markerId, selected) {
    if (!map || !map.getSource("markers")) return

    const source = map.getSource("markers")
    const data = source._data

    data.features = data.features.map((f) => ({
      ...f,
      properties: {
        ...f.properties,
        selected: f.properties.id === markerId ? selected : false,
      },
    }))

    source.setData(data)
  }

  function getCurrentIconClass(markerId) {
    if (!map || !map.getSource("markers")) return "default"

    const source = map.getSource("markers")
    const data = source._data
    const feature = data.features.find((f) => f.properties.id === markerId)
    return feature?.properties.iconClass || "default"
  }

  // Public method called by MapViewer's layer interaction system for marker placement (long press)
  export function handleMarkerPlacement(lngLat) {
    if (!map) return

    console.log("Placing marker at:", lngLat)

    if ($selectedMarkerStore) {
      removeMarkerFromLayer($selectedMarkerStore.id)
    }

    // Get default marker from userSettingsStore
    const defaultMarker = getDefaultMarker()
    console.log("🎯 Using default marker:", defaultMarker)

    // Convert the default marker to proper iconClass format for storage
    let iconClass, iconImageName

    if (defaultMarker.class === "default") {
      iconClass = "default"
      iconImageName = "default"
    } else if (defaultMarker.class === "custom-svg") {
      iconClass = `custom-svg-${defaultMarker.id}`
      iconImageName = `custom-svg-${defaultMarker.id}`
    } else {
      iconClass = defaultMarker.class
      iconImageName = defaultMarker.class
    }

    console.log(
      "🔧 Converted iconClass:",
      iconClass,
      "iconImageName:",
      iconImageName,
    )

    const id = uuidv4()
    const feature = {
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [lngLat.lng, lngLat.lat],
      },
      properties: {
        id,
        icon: iconImageName,
        iconClass: iconClass,
        selected: true,
        confirmed: false,
      },
    }

    console.log("📍 Feature being added:", feature)

    addMarkerToLayer(feature)
    selectedMarkerStore.set({ id, coordinates: [lngLat.lng, lngLat.lat] })

    // Set default visibility to 'always' for new markers
    markerVisibilityStore.setMarkerVisibility(id, "always")

    quickCenterOnMarker([lngLat.lng, lngLat.lat])

    controlStore.update((controls) => ({
      ...controls,
      showMarkerMenu: true,
    }))
  }

  // Remove camera zoom on selection
  export function handleMarkerSelection(event) {
    if (!map) return

    console.log("🎯 MarkerManager: Marker selection called with event:", event)

    // Handle deselection (empty features array)
    if (!event.features || event.features.length === 0) {
      console.log("🎯 MarkerManager: Deselecting marker")
      if ($selectedMarkerStore) {
        updateMarkerSelection($selectedMarkerStore.id, false)
        selectedMarkerStore.set(null)
      }
      controlStore.update((controls) => ({
        ...controls,
        showMarkerMenu: false,
      }))
      return
    }

    // Extract marker ID from the event
    const feature = event.features[0]
    const markerId = feature.properties.id
    const coordinates = feature.geometry.coordinates

    console.log("🎯 MarkerManager: Selecting marker:", markerId)

    updateMarkerSelection(markerId, true)
    selectedMarkerStore.set({
      id: markerId,
      coordinates: coordinates,
    })

    controlStore.update((controls) => ({
      ...controls,
      showMarkerMenu: true,
    }))
  }

  // Confirm marker - mark as confirmed so circle will show on future selections
  function confirmMarker() {
    if ($selectedMarkerStore) {
      const { id, coordinates } = $selectedMarkerStore
      const iconClass = getCurrentIconClass(id)

      const markerData = {
        id,
        coordinates,
        iconClass,
        created_at: new Date().toISOString(),
      }

      console.log("Confirming marker:", markerData)

      confirmedMarkersStore.update((markers) => {
        const existingIndex = markers.findIndex((m) => m.id === id)
        if (existingIndex >= 0) {
          markers[existingIndex] = markerData
          return markers
        }
        return [...markers, markerData]
      })

      updateMarkerSelection(id, false)
      selectedMarkerStore.set(null)
    }

    controlStore.update((controls) => ({
      ...controls,
      showMarkerMenu: false,
    }))
  }

  // Remove marker
  function removeMarker() {
    if ($selectedMarkerStore) {
      const { id } = $selectedMarkerStore

      confirmedMarkersStore.update((markers) =>
        markers.filter((m) => m.id !== id),
      )

      // Remove from visibility store
      markerVisibilityStore.update((settings) => {
        const { [id]: removed, ...rest } = settings
        return rest
      })

      removeMarkerFromLayer(id)
      selectedMarkerStore.set(null)
    }

    controlStore.update((controls) => ({
      ...controls,
      showMarkerMenu: false,
    }))
  }

  async function placeMarkerAtCurrentLocation() {
    if (!map) return

    const coordinates = $locationMarkerStore
    if (!coordinates) return

    const defaultMarker = getDefaultMarker()
    console.log(
      "🎯 Using default marker for location placement:",
      defaultMarker,
    )

    let iconClass

    if (defaultMarker.class === "default") {
      iconClass = "default"
    } else if (defaultMarker.class === "custom-svg") {
      iconClass = `custom-svg-${defaultMarker.id}`
    } else {
      iconClass = defaultMarker.class
    }

    const id = uuidv4()
    const markerData = {
      id,
      coordinates: [coordinates.longitude, coordinates.latitude],
      iconClass: iconClass,
      created_at: new Date().toISOString(),
    }

    confirmedMarkersStore.update((markers) => [...markers, markerData])

    // Set default visibility to 'always' for new markers
    markerVisibilityStore.setMarkerVisibility(id, "always")

    if ($userSettingsStore?.zoomToLocationMarkers) {
      map.flyTo({
        center: [coordinates.longitude, coordinates.latitude],
        zoom: 15,
        duration: 1000,
      })
    }
  }

  // Cleanup function
  function cleanup() {
    if (contextCheckInterval) {
      clearInterval(contextCheckInterval)
      contextCheckInterval = null
    }

    console.log("🎯 MarkerManager cleanup completed")
  }

  onMount(() => {
    console.log(
      "MarkerManager mounted with coordinatedEvents:",
      coordinatedEvents,
    )

    contextCheckInterval = setInterval(syncWithGlobalSelection, 500)

    locationMarkerUnsubscribe = locationMarkerStore.subscribe((timestamp) => {
      if (timestamp) placeMarkerAtCurrentLocation()
    })

    confirmedMarkersUnsubscribe = confirmedMarkersStore.subscribe((markers) => {
      if (markersInitialized && map) refreshMapMarkers()
    })
  })

  onDestroy(() => {
    if (locationMarkerUnsubscribe) locationMarkerUnsubscribe()
    if (confirmedMarkersUnsubscribe) confirmedMarkersUnsubscribe()

    if (map && map.getStyle && typeof map.getLayer === "function") {
      try {
        if (map.getLayer("markers-layer")) map.removeLayer("markers-layer")
        if (map.getLayer("markers-selection-circle"))
          map.removeLayer("markers-selection-circle")
        if (map.getLayer("markers-selected-layer"))
          map.removeLayer("markers-selected-layer")
        if (map.getSource("markers")) map.removeSource("markers")
      } catch (error) {
        console.warn("Error cleaning up map layers:", error)
      }
    }

    cleanup()
  })
</script>

{#if $controlStore.showMarkerMenu && $selectedMarkerStore}
  <MarkerEditPanel
    {map}
    {getCurrentIconClass}
    {confirmMarker}
    {removeMarker}
    {centerCameraOnMarker}
    {confirmedMarkersStore}
    {selectedMarkerStore}
    {getIconImageName}
  />
{/if}
