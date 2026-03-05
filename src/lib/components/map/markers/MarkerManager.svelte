<!-- src/lib/components/map/markers/MarkerManager.svelte -->
<script>
  import {
    selectedMarkerStore,
    confirmedMarkersStore,
    locationMarkerStore,
    extraLocationMarkerStore,
    remoteMarkerRippleStore,
    remoteMarkerEditStore,
    remoteMarkerDeleteStore,
    collectionModeStore,
    collectionRouteStore,
  } from "$lib/stores/markerStore"

  import { userSettingsStore } from "$lib/stores/userSettingsStore"
  import { controlStore } from "$lib/stores/controlStore"
  import { markerVisibilityStore } from "$lib/stores/markerVisibilityStore"
  import { layerVisibilityStore } from "$lib/stores/layerVisibilityStore"
  import { userVehicleStore } from "$lib/stores/vehicleStore"

  import { onMount, onDestroy, getContext } from "svelte"
  import { v4 as uuidv4 } from "uuid"
  import * as mapboxgl from "mapbox-gl"
  import MarkerEditPanel from "./MarkerEditPanel.svelte"
  import { getIconImageName as getIconImageNameUtil } from "$lib/data/markerDefinitions"

  export let map
  export let mapLoaded = false
  export let coordinatedEvents = false

  /**
   * Show a temporary ripple animation at the given [lng, lat] coordinates.
   * Uses a short-lived DOM marker that self-removes after the animation.
   */
  function showPlacementRipple(lngLat, color = 'rgba(247, 219, 92') {
    if (!map) return
    console.log('🫧 Ripple at', lngLat, 'color:', color)
    const el = document.createElement('div')
    el.className = 'marker-ripple-container'

    const isConfirm = color.includes('34, 197, 94')

    if (isConfirm) {
      // Soft gather — thin ring contracts inward, sharp dot snap + outward pulse
      const ring = document.createElement('div')
      ring.className = 'marker-confirm-gather'
      ring.style.borderColor = `${color}, 0.5)`
      ring.style.boxShadow = `0 0 12px ${color}, 0.2)`
      const dot = document.createElement('div')
      dot.className = 'marker-confirm-gather-dot'
      dot.style.background = `${color}, 0.95)`
      dot.style.boxShadow = `0 0 14px ${color}, 0.9), 0 0 35px ${color}, 0.5)`
      const pulse = document.createElement('div')
      pulse.className = 'marker-confirm-gather-pulse'
      pulse.style.borderColor = `${color}, 0.6)`
      el.appendChild(ring)
      el.appendChild(dot)
      el.appendChild(pulse)
      const ripple = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat(lngLat).addTo(map)
      pulse.addEventListener('animationend', () => ripple.remove())
    } else {
      // Gold placement: two expanding rings
      const ring1 = document.createElement('div')
      ring1.className = 'marker-ripple-ring'
      ring1.style.borderColor = `${color}, 0.9)`
      ring1.style.background = `${color}, 0.18)`
      const ring2 = document.createElement('div')
      ring2.className = 'marker-ripple-ring marker-ripple-ring--delayed'
      ring2.style.borderColor = `${color}, 0.6)`
      ring2.style.background = `${color}, 0.08)`
      el.appendChild(ring1)
      el.appendChild(ring2)

      const ripple = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat(lngLat)
        .addTo(map)

      ring2.addEventListener('animationend', () => ripple.remove())
    }
  }

  function showRemovalAnimation(lngLat) {
    if (!map) return
    const el = document.createElement('div')
    el.className = 'marker-ripple-container'

    const puff = document.createElement('div')
    puff.className = 'marker-removal-puff'
    el.appendChild(puff)
    const ripple = new mapboxgl.Marker({ element: el, anchor: 'center' })
      .setLngLat(lngLat)
      .addTo(map)
    puff.addEventListener('animationend', () => ripple.remove())
  }

  function showCollectAnimation(lngLat) {
    if (!map) return
    const el = document.createElement('div')
    el.className = 'marker-ripple-container'

    const gather = document.createElement('div')
    gather.className = 'marker-collect-gather'
    el.appendChild(gather)

    const dot = document.createElement('div')
    dot.className = 'marker-collect-dot'
    el.appendChild(dot)

    const ripple = new mapboxgl.Marker({ element: el, anchor: 'center' })
      .setLngLat(lngLat)
      .addTo(map)
    dot.addEventListener('animationend', () => ripple.remove())
  }

  function showEditRipple(lngLat) {
    if (!map) return
    const el = document.createElement('div')
    el.className = 'marker-ripple-container'
    const ring = document.createElement('div')
    ring.className = 'marker-edit-pulse'
    el.appendChild(ring)
    const m = new mapboxgl.Marker({ element: el, anchor: 'center' })
      .setLngLat(lngLat).addTo(map)
    ring.addEventListener('animationend', () => m.remove())
  }

  const mapContext = getContext("map")

  // Get global selection context for unified event system
  let globalSelectionContext = null
  let globalSelectionState = null

  // Configuration for note labels
  const NOTE_LABEL_MAX_LENGTH = 25

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

  // Helper function to get secondary marker from store
  // (kept for compatibility but now unused — extras come via store payload)

  // Truncate note text for display on map
  function truncateNote(note, maxLength = NOTE_LABEL_MAX_LENGTH) {
    if (!note) return null
    const trimmed = note.trim()
    if (!trimmed) return null
    const displayText =
      trimmed.length <= maxLength
        ? trimmed
        : trimmed.substring(0, maxLength) + "..."
    return "• " + displayText // ← current active option
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
  let extraLocationMarkerUnsubscribe
  let confirmedMarkersUnsubscribe
  let remoteRippleUnsubscribe
  let remoteEditUnsubscribe
  let remoteDeleteUnsubscribe
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

  // Reactive statement to update marker layer visibility
  $: if (markersInitialized && map && $layerVisibilityStore) {
    updateMarkerLayerVisibility()
  }

  function updateMarkerLayerVisibility() {
    if (!map || !map.getLayer) return

    try {
      const markersVisible = $layerVisibilityStore.markers
      const markerLabelsVisible = $layerVisibilityStore.markerLabels !== false // Default to true if not set

      // Toggle all marker-related layers
      if (map.getLayer("markers-layer")) {
        map.setLayoutProperty(
          "markers-layer",
          "visibility",
          markersVisible ? "visible" : "none",
        )
      }
      if (map.getLayer("markers-selected-layer")) {
        map.setLayoutProperty(
          "markers-selected-layer",
          "visibility",
          markersVisible ? "visible" : "none",
        )
      }
      if (map.getLayer("markers-selection-circle")) {
        map.setLayoutProperty(
          "markers-selection-circle",
          "visibility",
          markersVisible ? "visible" : "none",
        )
      }

      // Toggle marker note labels - only visible if both markers AND labels are enabled
      if (map.getLayer("markers-note-labels")) {
        map.setLayoutProperty(
          "markers-note-labels",
          "visibility",
          markersVisible && markerLabelsVisible ? "visible" : "none",
        )
      }

      console.log("✅ Updated marker layer visibility:", {
        markers: markersVisible,
        markerLabels: markerLabelsVisible,
      })
    } catch (error) {
      console.error("Error updating marker layer visibility:", error)
    }
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
        filter: ["!=", ["get", "selected"], true],
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

    // Selected marker layer - shows ONLY the selected marker on top
    if (!map.getLayer("markers-selected-layer")) {
      const selectedLayerConfig = {
        id: "markers-selected-layer",
        type: "symbol",
        source: "markers",
        filter: ["==", ["get", "selected"], true],
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

    // Note labels layer - displays truncated notes above markers
    if (!map.getLayer("markers-note-labels")) {
      const noteLabelsConfig = {
        id: "markers-note-labels",
        type: "symbol",
        source: "markers",
        minzoom: 12,
        filter: [
          "all",
          ["has", "noteLabel"],
          ["!=", ["get", "noteLabel"], ""],
          ["==", ["get", "confirmed"], true],
        ],
        layout: {
          "text-field": ["get", "noteLabel"],
          "text-size": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            11,
            12,
            13,
            14,
            15,
            16,
            17,
            18,
            19,
          ],
          "text-anchor": "bottom",
          "text-offset": [0, -1.8],
          "text-max-width": 14,
          "text-allow-overlap": false,
          "text-optional": true,
          "text-font": ["DIN Pro Medium", "Arial Unicode MS Regular"],
          "text-letter-spacing": 0.02,
        },
        paint: {
          "text-color": "#ffee8c",
          "text-halo-color": "#000000",
          "text-halo-width": 2,
          "text-halo-blur": 0,
        },
      }

      if (mapContext?.addLayerOrdered) {
        mapContext.addLayerOrdered(noteLabelsConfig)
        console.log("✅ Added markers-note-labels layer with proper ordering")
      } else {
        map.addLayer(noteLabelsConfig)
        console.log(
          "⚠️ Added markers-note-labels layer without ordering (fallback)",
        )
      }
    }

    markersInitialized = true
    console.log("✅ Marker layers initialization complete")

    // Apply initial visibility state after layers are created
    updateMarkerLayerVisibility()

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
        // Add truncated note label for display
        noteLabel: truncateNote(marker.notes),
        // Store full notes for reference (not displayed directly)
        hasNotes: !!marker.notes,
      },
    }))

    map.getSource("markers").setData({
      type: "FeatureCollection",
      features: features,
    })

    console.log(
      `📍 Refreshed ${features.length} markers, ${features.filter((f) => f.properties.noteLabel).length} with notes`,
    )
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

  // Update a marker's note label on the map
  function updateMarkerNoteLabel(markerId, notes) {
    if (!map || !map.getSource("markers")) return

    const source = map.getSource("markers")
    const data = source._data

    const featureIndex = data.features.findIndex(
      (f) => f.properties.id === markerId,
    )

    if (featureIndex >= 0) {
      data.features[featureIndex].properties.noteLabel = truncateNote(notes)
      data.features[featureIndex].properties.hasNotes = !!notes
      source.setData(data)
      console.log(`📝 Updated note label for marker ${markerId}`)
    }
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
        noteLabel: null,
        hasNotes: false,
      },
    }

    console.log("📍 Feature being added:", feature)

    addMarkerToLayer(feature)
    selectedMarkerStore.set({ id, coordinates: [lngLat.lng, lngLat.lat] })

    // Gold ripple on initial placement
    showPlacementRipple([lngLat.lng, lngLat.lat])

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

      // Green ripple on confirmation
      showPlacementRipple(coordinates, 'rgba(34, 197, 94')

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
      const { id, coordinates } = $selectedMarkerStore

      // Play removal animation before removing
      if (coordinates) {
        showRemovalAnimation(coordinates)
      }

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

  // ═══════════════════════════════════════════════════════
  //  Collection Mode — auto-delete markers by proximity
  // ═══════════════════════════════════════════════════════

  /** Delete a marker by ID without requiring it to be selected first */
  export function collectMarkerById(markerId, animStyle = 'red') {
    const markers = /** @type {any[]} */ ([])
    const unsub = confirmedMarkersStore.subscribe(m => markers.push(...m))
    unsub()

    const marker = markers.find(m => m.id === markerId)
    if (!marker) return

    // Play animation
    if (marker.coordinates) {
      if (animStyle === 'green') {
        showCollectAnimation(marker.coordinates)
      } else {
        showRemovalAnimation(marker.coordinates)
      }
    }

    confirmedMarkersStore.update(ms => ms.filter(m => m.id !== markerId))
    markerVisibilityStore.update(settings => {
      const { [markerId]: removed, ...rest } = settings
      return rest
    })
    removeMarkerFromLayer(markerId)

    // Deselect if this was the selected marker
    if ($selectedMarkerStore?.id === markerId) {
      selectedMarkerStore.set(null)
      controlStore.update(c => ({ ...c, showMarkerMenu: false }))
    }
  }

  // Haversine distance (meters) between two [lng, lat] and {latitude, longitude}
  function haversineDistanceLngLat(lngLat, coords) {
    const toRad = (deg) => (deg * Math.PI) / 180
    const R = 6371000
    const dLat = toRad(coords.latitude - lngLat[1])
    const dLon = toRad(coords.longitude - lngLat[0])
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lngLat[1])) * Math.cos(toRad(coords.latitude)) * Math.sin(dLon / 2) ** 2
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  }

  // Track recently-collected IDs to avoid double-triggers
  const recentlyCollected = new Set()

  let collectionModeUnsubscribe = null
  let vehicleUnsubscribe = null

  function startCollectionWatcher() {
    if (vehicleUnsubscribe) return // already watching

    vehicleUnsubscribe = userVehicleStore.subscribe(vehicle => {
      if (!vehicle?.coordinates?.latitude) return

      let collectionState
      const unsub = collectionModeStore.subscribe(s => collectionState = s)
      unsub()

      if (!collectionState?.enabled) return

      const { radius, targetIconClasses, animationStyle } = collectionState
      const userCoords = vehicle.coordinates

      let currentMarkers = []
      const munsub = confirmedMarkersStore.subscribe(m => currentMarkers = m)
      munsub()

      for (const m of currentMarkers) {
        if (recentlyCollected.has(m.id)) continue
        if (!m.coordinates) continue

        // Check if marker type matches targets
        const iconClass = m.iconClass || 'default'
        if (!targetIconClasses.has(iconClass)) continue

        const dist = haversineDistanceLngLat(m.coordinates, userCoords)
        if (dist <= radius) {
          recentlyCollected.add(m.id)
          collectMarkerById(m.id, animationStyle)
          // Mark dot green on the route planner
          collectionRouteStore.markCollected(m.id)

          // Clean up the set after a delay
          setTimeout(() => recentlyCollected.delete(m.id), 5000)
        }
      }
    })
  }

  function stopCollectionWatcher() {
    if (vehicleUnsubscribe) {
      vehicleUnsubscribe()
      vehicleUnsubscribe = null
    }
    recentlyCollected.clear()
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

    // Green ripple - quick-drop is auto-confirmed
    showPlacementRipple([coordinates.longitude, coordinates.latitude], 'rgba(34, 197, 94')

    if ($userSettingsStore?.zoomToLocationMarkers) {
      map.flyTo({
        center: [coordinates.longitude, coordinates.latitude],
        zoom: 15,
        duration: 1000,
      })
    }
  }

  async function placeExtraMarkerAtCurrentLocation() {
    if (!map) return

    const payload = $extraLocationMarkerStore
    if (!payload || !payload.coordinates || !payload.marker) return

    const { coordinates, marker: extraMarker } = payload

    console.log("🎯 Using extra marker for location placement:", extraMarker)

    let iconClass

    if (extraMarker.class === "default") {
      iconClass = "default"
    } else if (extraMarker.class === "custom-svg") {
      iconClass = `custom-svg-${extraMarker.id}`
    } else {
      iconClass = extraMarker.class
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

    // Green ripple - quick-drop is auto-confirmed
    showPlacementRipple([coordinates.longitude, coordinates.latitude], 'rgba(34, 197, 94')

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

    extraLocationMarkerUnsubscribe = extraLocationMarkerStore.subscribe(
      (payload) => {
        if (payload && payload.timestamp) placeExtraMarkerAtCurrentLocation()
      },
    )

    confirmedMarkersUnsubscribe = confirmedMarkersStore.subscribe((markers) => {
      if (markersInitialized && map) refreshMapMarkers()
    })

    remoteRippleUnsubscribe = remoteMarkerRippleStore.subscribe((event) => {
      if (event && event.coordinates) {
        showPlacementRipple(event.coordinates, 'rgba(34, 197, 94')
      }
    })

    remoteEditUnsubscribe = remoteMarkerEditStore.subscribe((event) => {
      if (event && event.coordinates) {
        showEditRipple(event.coordinates)
      }
    })

    remoteDeleteUnsubscribe = remoteMarkerDeleteStore.subscribe((event) => {
      if (event && event.coordinates) {
        showRemovalAnimation(event.coordinates)
      }
    })

    // Watch collection mode toggle to start/stop watcher
    collectionModeUnsubscribe = collectionModeStore.subscribe((state) => {
      if (state.enabled) {
        startCollectionWatcher()
      } else {
        stopCollectionWatcher()
      }
    })
  })

  onDestroy(() => {
    if (locationMarkerUnsubscribe) locationMarkerUnsubscribe()
    if (extraLocationMarkerUnsubscribe) extraLocationMarkerUnsubscribe()
    if (confirmedMarkersUnsubscribe) confirmedMarkersUnsubscribe()
    if (remoteRippleUnsubscribe) remoteRippleUnsubscribe()
    if (remoteEditUnsubscribe) remoteEditUnsubscribe()
    if (remoteDeleteUnsubscribe) remoteDeleteUnsubscribe()
    if (collectionModeUnsubscribe) collectionModeUnsubscribe()
    stopCollectionWatcher()

    if (map && map.getStyle && typeof map.getLayer === "function") {
      try {
        if (map.getLayer("markers-layer")) map.removeLayer("markers-layer")
        if (map.getLayer("markers-selection-circle"))
          map.removeLayer("markers-selection-circle")
        if (map.getLayer("markers-selected-layer"))
          map.removeLayer("markers-selected-layer")
        if (map.getLayer("markers-note-labels"))
          map.removeLayer("markers-note-labels")
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
    {updateMarkerNoteLabel}
    {showPlacementRipple}
    {showEditRipple}
  />
{/if}

<style>
  :global(.marker-ripple-container) {
    pointer-events: none;
    width: 0;
    height: 0;
    position: relative;
  }

  :global(.marker-ripple-ring) {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) scale(0);
    width: 100px;
    height: 100px;
    border-radius: 50%;
    border: 2.5px solid rgba(247, 219, 92, 0.7);
    background: rgba(247, 219, 92, 0.1);
    animation: marker-ripple 1.0s ease-out forwards;
  }

  :global(.marker-ripple-ring--delayed) {
    animation: marker-ripple 1.2s ease-out 0.15s forwards;
    opacity: 0;
    border-width: 2px;
    border-color: rgba(247, 219, 92, 0.45);
    background: rgba(247, 219, 92, 0.05);
  }

  @keyframes -global-marker-ripple {
    0% {
      transform: translate(-50%, -50%) scale(0);
      opacity: 0.9;
    }
    50% {
      opacity: 0.5;
    }
    100% {
      transform: translate(-50%, -50%) scale(2.2);
      opacity: 0;
    }
  }

  /* ===== CONFIRM: Soft gather — ring contracts, dot snap + outward pulse ===== */
  :global(.marker-confirm-gather) {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) scale(1.2);
    width: 120px;
    height: 120px;
    border-radius: 50%;
    border: 2px solid rgba(34, 197, 94, 0.5);
    background: transparent;
    box-shadow: 0 0 12px rgba(34, 197, 94, 0.2);
    animation: marker-gather-ring 1.0s ease-in forwards;
  }

  :global(.marker-confirm-gather-dot) {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) scale(0);
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: rgba(34, 197, 94, 0.95);
    box-shadow: 0 0 14px rgba(34, 197, 94, 0.9), 0 0 35px rgba(34, 197, 94, 0.5);
    animation: marker-gather-dot 1.1s ease-out forwards;
  }

  :global(.marker-confirm-gather-pulse) {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) scale(0);
    width: 100px;
    height: 100px;
    border-radius: 50%;
    border: 2px solid rgba(34, 197, 94, 0.6);
    background: transparent;
    animation: marker-gather-pulse 0.6s ease-out 0.75s forwards;
  }

  @keyframes -global-marker-gather-ring {
    0% { transform: translate(-50%, -50%) scale(1.2); opacity: 0; }
    20% { transform: translate(-50%, -50%) scale(1.2); opacity: 0.5; border-width: 2px; }
    70% { transform: translate(-50%, -50%) scale(0.2); opacity: 0.7; border-width: 3px; }
    85% { transform: translate(-50%, -50%) scale(0); opacity: 0; }
    100% { transform: translate(-50%, -50%) scale(0); opacity: 0; }
  }

  @keyframes -global-marker-gather-dot {
    0% { transform: translate(-50%, -50%) scale(0); opacity: 0; }
    65% { transform: translate(-50%, -50%) scale(0); opacity: 0; }
    72% { transform: translate(-50%, -50%) scale(3); opacity: 1; box-shadow: 0 0 20px rgba(34, 197, 94, 1), 0 0 50px rgba(34, 197, 94, 0.6); }
    82% { transform: translate(-50%, -50%) scale(2); opacity: 0.9; }
    90% { transform: translate(-50%, -50%) scale(2.4); opacity: 0.7; }
    100% { transform: translate(-50%, -50%) scale(0); opacity: 0; }
  }

  @keyframes -global-marker-gather-pulse {
    0% { transform: translate(-50%, -50%) scale(0); opacity: 0.8; }
    100% { transform: translate(-50%, -50%) scale(2.5); opacity: 0; }
  }

  /* ===== EDIT: Blue gentle pulse ===== */

  :global(.marker-edit-pulse) {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) scale(0.4);
    width: 100px;
    height: 100px;
    border-radius: 50%;
    border: 2.5px solid rgba(59, 130, 246, 0.6);
    background: rgba(59, 130, 246, 0.06);
    box-shadow: 0 0 12px rgba(59, 130, 246, 0.25);
    animation: marker-edit-pulse 0.9s ease-out forwards;
  }

  @keyframes -global-marker-edit-pulse {
    0% { transform: translate(-50%, -50%) scale(0.4); opacity: 0; }
    15% { transform: translate(-50%, -50%) scale(0.6); opacity: 0.8; }
    45% { transform: translate(-50%, -50%) scale(1.5); opacity: 0.6; box-shadow: 0 0 18px rgba(59, 130, 246, 0.35); }
    100% { transform: translate(-50%, -50%) scale(2.2); opacity: 0; }
  }

  /* Removal: Smoke puff — expands and dissipates */
  :global(.marker-removal-puff) {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) scale(0);
    width: 200px;
    height: 200px;
    border-radius: 50%;
    background: radial-gradient(
      circle,
      rgba(239, 68, 68, 0.55) 0%,
      rgba(220, 60, 60, 0.35) 30%,
      rgba(180, 70, 70, 0.18) 60%,
      transparent 100%
    );
    box-shadow: 0 0 40px rgba(239, 68, 68, 0.5);
    animation: marker-puff 1.2s ease-out forwards;
  }

  @keyframes -global-marker-puff {
    0% {
      transform: translate(-50%, -50%) scale(0.2);
      opacity: 1;
    }
    15% {
      transform: translate(-50%, -50%) scale(1.2);
      opacity: 0.95;
      box-shadow: 0 0 50px rgba(239, 68, 68, 0.7);
    }
    40% {
      transform: translate(-50%, -50%) scale(2.2);
      opacity: 0.7;
    }
    70% {
      transform: translate(-50%, -50%) scale(3);
      opacity: 0.35;
      filter: blur(4px);
    }
    100% {
      transform: translate(-50%, -50%) scale(3.8);
      opacity: 0;
      filter: blur(10px);
    }
  }

  /* ═══════════════════════════════════════════════════════ */
  /*  Collection Mode — green gather animation              */
  /* ═══════════════════════════════════════════════════════ */
  :global(.marker-collect-gather) {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) scale(2);
    width: 100px;
    height: 100px;
    border-radius: 50%;
    border: 2.5px solid rgba(34, 197, 94, 0.6);
    background: radial-gradient(
      circle,
      rgba(34, 197, 94, 0.15) 0%,
      transparent 70%
    );
    animation: marker-collect-ring 0.8s ease-in forwards;
  }

  :global(.marker-collect-dot) {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) scale(0);
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: rgba(34, 197, 94, 0.95);
    box-shadow: 0 0 16px rgba(34, 197, 94, 0.9), 0 0 40px rgba(34, 197, 94, 0.4);
    animation: marker-collect-snap 0.9s ease-out forwards;
  }

  @keyframes -global-marker-collect-ring {
    0%   { transform: translate(-50%, -50%) scale(2); opacity: 0.8; }
    60%  { transform: translate(-50%, -50%) scale(0.4); opacity: 1; border-color: rgba(34, 197, 94, 0.9); }
    80%  { transform: translate(-50%, -50%) scale(0.1); opacity: 0.6; }
    100% { transform: translate(-50%, -50%) scale(0); opacity: 0; }
  }

  @keyframes -global-marker-collect-snap {
    0%   { transform: translate(-50%, -50%) scale(0); opacity: 0; }
    55%  { transform: translate(-50%, -50%) scale(0); opacity: 0; }
    65%  { transform: translate(-50%, -50%) scale(1.3); opacity: 1; }
    75%  { transform: translate(-50%, -50%) scale(0.9); opacity: 1; }
    85%  { transform: translate(-50%, -50%) scale(1.1); opacity: 0.8; }
    100% { transform: translate(-50%, -50%) scale(2.5); opacity: 0; }
  }
</style>
