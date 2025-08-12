<!-- src/components/MarkerManager.svelte -->
<script>
  import {
    selectedMarkerStore,
    confirmedMarkersStore,
    removeMarkerStore,
    markerActionsStore,
    locationMarkerStore,
  } from "../stores/mapStore"

  import { userSettingsStore } from "$lib/stores/userSettingsStore"
  import { controlStore } from "$lib/stores/controlStore"
  import { profileStore } from "$lib/stores/profileStore"

  import { onMount, onDestroy } from "svelte"
  import { v4 as uuidv4 } from "uuid"
  import IconSVG from "./IconSVG.svelte"

  export let map
  export let mapLoaded = false

  let markerActionsUnsubscribe
  let locationMarkerUnsubscribe
  let confirmedMarkersUnsubscribe
  let markersInitialized = false
  let iconsLoaded = false
  let iconPaths = null

  // Long press variables
  let longPressTimer = null
  let longPressStartPosition = null
  const longPressThreshold = 850
  const longPressMoveThreshold = 5
  let isLongPressing = false

  // Touch tracking variables for markers
  let touchStartPosition = null
  let hasTouchMoved = false
  const touchMoveThreshold = 10 // pixels

  const markerIcons = [
    { id: "rock", class: "custom-svg" },
    { id: "tree13", class: "custom-svg" },
    { id: "watertank2", class: "custom-svg" },
    { id: "wheat2", class: "custom-svg" },
    { id: "kangaroo", class: "custom-svg" },
    { id: "electric_tower", class: "custom-svg" },
    { id: "gate", class: "custom-svg" },
    { id: "machine_pump", class: "custom-svg" },
    { id: "recharge_icon", class: "custom-svg" },
    { id: "repair_shop", class: "custom-svg" },
    { id: "tractor", class: "custom-svg" },
    { id: "silo2", class: "custom-svg" },
    { id: "tree_stump", class: "custom-svg" },
    { id: "workshop_icon", class: "custom-svg" },
    { id: "pin", class: "ionic-pin" },
    { id: "arrow-up-circle", class: "ionic-arrow-up-circle" },
    { id: "arrow-down-circle", class: "ionic-arrow-down-circle" },
    { id: "arrow-back-circle", class: "ionic-arrow-back-circle" },
    { id: "arrow-forward-circle", class: "ionic-arrow-forward-circle" },
    { id: "thumbs-down", class: "ionic-thumbs-down" },
    { id: "thumbs-up", class: "ionic-thumbs-up" },
    { id: "accessibility", class: "ionic-accessibility" },
    { id: "people", class: "ionic-people" },
    { id: "settings", class: "ionic-settings" },
    { id: "home", class: "ionic-home" },
    { id: "checkmark-circle", class: "ionic-checkmark-circle" },
    { id: "close-circle", class: "ionic-close-circle" },
    { id: "information-circle", class: "ionic-information-circle" },
    { id: "warning", class: "ionic-warning" },
    { id: "help-circle", class: "ionic-help-circle" },
    { id: "ban", class: "ionic-ban" },
    { id: "location", class: "ionic-location" },
    { id: "lock-closed", class: "ionic-lock-closed" },
    { id: "lock-open", class: "ionic-lock-open" },
    { id: "trash", class: "ionic-trash" },
    { id: "cart", class: "ionic-cart" },
    { id: "locate", class: "ionic-locate" },
    { id: "leaf", class: "ionic-leaf" },
    { id: "call", class: "ionic-call" },
    { id: "wifi", class: "ionic-wifi" },
    { id: "radio", class: "ionic-radio" },
    { id: "cloud-offline", class: "ionic-cloud-offline" },
    { id: "battery-charging", class: "ionic-battery-charging" },
    { id: "thermometer", class: "ionic-thermometer" },
    { id: "sunny", class: "ionic-sunny" },
    { id: "cloud", class: "ionic-cloud" },
    { id: "thunderstorm", class: "ionic-thunderstorm" },
    { id: "rainy", class: "ionic-rainy" },
    { id: "water", class: "ionic-water" },
    { id: "fast-food", class: "ionic-fast-food" },
    { id: "restaurant", class: "ionic-restaurant" },
    { id: "airplane", class: "ionic-airplane" },
    { id: "trail-sign", class: "ionic-trail-sign" },
    { id: "car", class: "ionic-car" },
    { id: "beer", class: "ionic-beer" },
    { id: "bonfire", class: "ionic-bonfire" },
    { id: "boat", class: "ionic-boat" },
    { id: "bed", class: "ionic-bed" },
    { id: "bicycle", class: "ionic-bicycle" },
    { id: "build", class: "ionic-build" },
    { id: "desktop", class: "ionic-desktop" },
    { id: "earth", class: "ionic-earth" },
    { id: "camera", class: "ionic-camera" },
    { id: "fish", class: "ionic-fish" },
    { id: "flame", class: "ionic-flame" },
    { id: "footsteps", class: "ionic-footsteps" },
    { id: "key", class: "ionic-key" },
    { id: "man", class: "ionic-man" },
    { id: "paw", class: "ionic-paw" },
    { id: "skull", class: "ionic-skull" },
    { id: "construct", class: "ionic-construct" },
    { id: "bus", class: "ionic-bus" },
    { id: "subway", class: "ionic-subway" },
    { id: "telescope", class: "ionic-telescope" },
    { id: "construction-truck", class: "at-construction-truck" },
    { id: "electric-car", class: "at-electric-car" },
    { id: "gasoline", class: "at-gasoline" },
    { id: "kg-weight", class: "at-kg-weight" },
    { id: "carrot", class: "at-carrot" },
    { id: "middle-finger", class: "at-middle-finger" },
    { id: "toilet-bathroom", class: "at-toilet-bathroom" },
    { id: "car-garage", class: "at-car-garage" },
    { id: "electricity-home", class: "at-electricity-home" },
    { id: "carrot-turnip-vegetable", class: "at-carrot-turnip-vegetable" },
    { id: "wheat-harvest", class: "at-wheat-harvest" },
    { id: "helicopter-travel", class: "at-helicopter-travel" },
    { id: "camper-vehicle", class: "at-camper-vehicle" },
    { id: "cargo-transport", class: "at-cargo-transport" },
    { id: "bulldozer", class: "at-bulldozer" },
    { id: "construction-transport", class: "at-construction-transport" },
    { id: "crane-truck", class: "at-crane-truck" },
    { id: "delivery-truck", class: "at-delivery-truck" },
    { id: "liquid-transportation", class: "at-liquid-transportation" },
    { id: "transport-truck", class: "at-transport-truck" },
    { id: "ladder-truck", class: "at-ladder-truck" },
  ]

  $: if (mapLoaded && map && !markersInitialized) {
    initializeMarkerLayers()
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
      console.log("🎯 All high-DPI PNG icons loaded successfully!")
    } catch (error) {
      console.error("❌ Error loading high-DPI icons:", error)
      await loadFallbackIcons()
    }
  }

  // Simplified fallback icon generation
  async function loadFallbackIcons() {
    if (!map || iconsLoaded) return

    console.log("Loading fallback icons...")

    // Load default marker
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

    // Generate simple fallbacks for other icons
    const iconTypes = [
      { filter: (icon) => icon.class.startsWith("ionic-"), symbol: "I" },
      { filter: (icon) => icon.class.startsWith("at-"), symbol: "◆" },
    ]

    for (const iconType of iconTypes) {
      const icons = markerIcons.filter(iconType.filter)
      for (const icon of icons) {
        await generateFallbackIcon(icon.class, iconType.symbol)
      }
    }

    iconsLoaded = true
    console.log("Fallback icon loading completed")
  }

  async function generateFallbackIcon(iconKey, symbol) {
    if (map.hasImage(iconKey)) return

    const canvas = document.createElement("canvas")
    canvas.width = 35
    canvas.height = 35
    const ctx = canvas.getContext("2d")

    ctx.fillStyle = "rgba(211, 211, 211, 0.9)"
    ctx.beginPath()
    ctx.arc(17.5, 17.5, 17.5, 0, 2 * Math.PI)
    ctx.fill()

    ctx.fillStyle = "black"
    ctx.font = "bold 16px Arial"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText(symbol, 17.5, 17.5)

    const imageData = ctx.getImageData(0, 0, 35, 35)
    map.addImage(iconKey, { width: 35, height: 35, data: imageData.data })
  }

  function getIconImageName(iconClass) {
    if (!iconClass || iconClass === "default") return "default"

    if (
      iconClass.startsWith("custom-svg-") ||
      iconClass.startsWith("ionic-") ||
      iconClass.startsWith("at-")
    ) {
      return iconClass
    }

    return "default"
  }

  // Unified event handlers
  function handleMapMouseDown(e) {
    startLongPress(e)
  }

  function handleMapTouchStart(e) {
    if (e.originalEvent.touches.length > 1) return // Ignore multi-touch
    startLongPress(e)
  }

  function startLongPress(e) {
    isLongPressing = true
    longPressStartPosition = {
      x: e.originalEvent.clientX || e.originalEvent.touches[0].clientX,
      y: e.originalEvent.clientY || e.originalEvent.touches[0].clientY,
      lngLat: e.lngLat,
    }

    longPressTimer = setTimeout(() => {
      if (isLongPressing) {
        handleMarkerPlacement(longPressStartPosition.lngLat)
      }
    }, longPressThreshold)
  }

  function checkLongPressMovement(e) {
    if (!isLongPressing || !longPressStartPosition) return

    const currentX =
      e.originalEvent.clientX || e.originalEvent.touches[0].clientX
    const currentY =
      e.originalEvent.clientY || e.originalEvent.touches[0].clientY

    const dx = currentX - longPressStartPosition.x
    const dy = currentY - longPressStartPosition.y
    const distance = Math.sqrt(dx * dx + dy * dy)

    if (distance > longPressMoveThreshold) {
      cancelLongPress()
    }
  }

  function cancelLongPress() {
    isLongPressing = false
    clearTimeout(longPressTimer)
    longPressTimer = null
    longPressStartPosition = null
  }

  // Marker touch tracking functions
  function handleMarkerTouchStart(e) {
    touchStartPosition = {
      x: e.originalEvent.touches[0].clientX,
      y: e.originalEvent.touches[0].clientY,
    }
    hasTouchMoved = false
  }

  function handleMarkerTouchMove(e) {
    if (!touchStartPosition) return

    const currentX = e.originalEvent.touches[0].clientX
    const currentY = e.originalEvent.touches[0].clientY

    const dx = currentX - touchStartPosition.x
    const dy = currentY - touchStartPosition.y
    const distance = Math.sqrt(dx * dx + dy * dy)

    if (distance > touchMoveThreshold) {
      hasTouchMoved = true
    }
  }

  function handleMarkerTouchEnd(e) {
    // Reset touch tracking after a delay
    setTimeout(() => {
      touchStartPosition = null
      hasTouchMoved = false
    }, 100)
  }

  // Unified marker selection handler
  function handleMarkerLayerSelection(e) {
    if (e.features.length > 0) {
      // For click events, always proceed
      if (e.type === "click") {
        cancelLongPress()
        const feature = e.features[0]
        handleMarkerSelection({
          id: feature.properties.id,
          lngLat: feature.geometry.coordinates,
        })
        return
      }

      // For touchend events, only proceed if there was minimal movement
      if (e.type === "touchend" && !hasTouchMoved) {
        cancelLongPress()
        const feature = e.features[0]
        handleMarkerSelection({
          id: feature.properties.id,
          lngLat: feature.geometry.coordinates,
        })
      }
    }
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

    if (!map.getLayer("markers-layer")) {
      map.addLayer({
        id: "markers-layer",
        type: "symbol",
        source: "markers",
        layout: {
          "icon-image": ["get", "icon"],
          "icon-size": 0.35,
          "icon-allow-overlap": true,
          "text-allow-overlap": true,
          "icon-anchor": [
            "case",
            ["==", ["get", "icon"], "default"],
            "bottom",
            "center",
          ],
        },
      })
    }

    // Add marker interaction handlers
    map.on("click", "markers-layer", handleMarkerLayerSelection)
    map.on("touchstart", "markers-layer", handleMarkerTouchStart)
    map.on("touchmove", "markers-layer", handleMarkerTouchMove)
    map.on("touchend", "markers-layer", handleMarkerLayerSelection)

    // Add hover effects
    map.on("mouseenter", "markers-layer", () => {
      map.getCanvas().style.cursor = "pointer"
    })
    map.on("mouseleave", "markers-layer", () => {
      map.getCanvas().style.cursor = ""
    })

    // Add long press handlers for map
    map.on("mousedown", handleMapMouseDown)
    map.on("touchstart", handleMapTouchStart)
    map.on("mousemove", checkLongPressMovement)
    map.on("touchmove", checkLongPressMovement)
    map.on("mouseup", cancelLongPress)
    map.on("touchend", cancelLongPress)

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
        selected: false,
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

  async function handleMarkerPlacement(lngLat) {
    if (!map) return

    // Remove previous temporary marker
    if ($selectedMarkerStore) {
      removeMarkerFromLayer($selectedMarkerStore.id)
    }

    const id = uuidv4()
    const feature = {
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [lngLat.lng, lngLat.lat],
      },
      properties: {
        id,
        icon: "default",
        iconClass: "default",
        selected: true,
      },
    }

    addMarkerToLayer(feature)
    selectedMarkerStore.set({ id, coordinates: [lngLat.lng, lngLat.lat] })

    if ($userSettingsStore?.zoomToPlacedMarkers) {
      map.flyTo({
        center: [lngLat.lng, lngLat.lat],
        duration: 1000,
      })
    }

    controlStore.update((controls) => ({
      ...controls,
      showMarkerMenu: true,
    }))
  }

  function handleMarkerSelection(event) {
    if (!map) return

    const { id, lngLat } = event
    const coordinates = Array.isArray(lngLat)
      ? { lng: lngLat[0], lat: lngLat[1] }
      : lngLat

    updateMarkerSelection(id, true)
    selectedMarkerStore.set({
      id,
      coordinates: [coordinates.lng, coordinates.lat],
    })

    map.flyTo({
      center: [coordinates.lng, coordinates.lat],
      zoom: 15,
      duration: 1000,
    })

    controlStore.update((controls) => ({
      ...controls,
      showMarkerMenu: true,
    }))
  }

  function confirmMarker() {
    if ($selectedMarkerStore) {
      const { id, coordinates } = $selectedMarkerStore
      const source = map.getSource("markers")
      const data = source._data
      const feature = data.features.find((f) => f.properties.id === id)
      const iconClass = feature?.properties.iconClass || "default"

      const markerData = {
        id,
        last_confirmed: new Date().toISOString(),
        iconClass,
        coordinates,
      }

      const existingMarker = $confirmedMarkersStore.find((m) => m.id === id)

      if (!existingMarker) {
        confirmedMarkersStore.update((markers) => [...markers, markerData])
      } else {
        confirmedMarkersStore.update((markers) =>
          markers.map((m) => (m.id === id ? markerData : m)),
        )
      }

      updateMarkerSelection(id, false)
      selectedMarkerStore.set(null)
    }

    controlStore.update((controls) => ({
      ...controls,
      showMarkerMenu: false,
    }))
  }

  function removeMarker() {
    if ($selectedMarkerStore) {
      const { id } = $selectedMarkerStore
      const existingMarker = $confirmedMarkersStore.find((m) => m.id === id)

      removeMarkerFromLayer(id)
      selectedMarkerStore.set(null)

      if (existingMarker) {
        confirmedMarkersStore.update((markers) => {
          const updatedMarkers = markers.filter((m) => m.id !== id)
          removeMarkerStore.update((removedMarkers) => [
            ...removedMarkers,
            {
              id,
              deletedBy: $profileStore.id,
              last_confirmed: existingMarker.last_confirmed,
            },
          ])
          return updatedMarkers
        })
      }
    }

    controlStore.update((controls) => ({
      ...controls,
      showMarkerMenu: false,
    }))
  }

  async function handleIconSelection(icon) {
    if (!map || !$selectedMarkerStore) return

    const { id } = $selectedMarkerStore
    const source = map.getSource("markers")
    const data = source._data
    const feature = data.features.find((f) => f.properties.id === id)

    if (feature) {
      const newIconClass = icon.class.startsWith("custom-svg")
        ? `custom-svg-${icon.id}`
        : icon.class

      feature.properties.icon = getIconImageName(newIconClass)
      feature.properties.iconClass = newIconClass
      source.setData(data)
    }
  }

  async function placeMarkerAtCurrentLocation() {
    if (!map) return

    const coordinates = $locationMarkerStore
    if (!coordinates) return

    const id = uuidv4()
    const feature = {
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [coordinates.longitude, coordinates.latitude],
      },
      properties: {
        id,
        icon: "default",
        iconClass: "default",
      },
    }

    addMarkerToLayer(feature)

    confirmedMarkersStore.update((markers) => [
      ...markers,
      {
        id,
        last_confirmed: new Date().toISOString(),
        iconClass: "default",
        coordinates: [coordinates.longitude, coordinates.latitude],
      },
    ])

    if ($userSettingsStore?.zoomToLocationMarkers) {
      map.flyTo({
        center: [coordinates.longitude, coordinates.latitude],
        zoom: 15,
        duration: 1000,
      })
    }
  }

  async function applyMarkerActions(actions) {
    if (!map || actions.length === 0) return

    console.log("Applying", actions.length, "marker actions")
    const completedActions = []

    actions.forEach((action, index) => {
      const { markerData } = action
      const { id, marker_data, last_confirmed, iconClass } = markerData

      if (action.action === "add" || action.action === "update") {
        const { geometry } = marker_data
        const { coordinates } = geometry
        const icon = iconClass || "default"

        const feature = {
          type: "Feature",
          geometry: { type: "Point", coordinates },
          properties: {
            id,
            icon: getIconImageName(icon),
            iconClass: icon,
          },
        }

        addMarkerToLayer(feature)

        if (action.action === "add") {
          confirmedMarkersStore.update((markers) => [
            ...markers,
            { id, last_confirmed, iconClass: icon, coordinates },
          ])
        } else {
          confirmedMarkersStore.update((markers) =>
            markers.map((marker) =>
              marker.id === id
                ? { id, last_confirmed, iconClass: icon, coordinates }
                : marker,
            ),
          )
        }
      } else if (action.action === "delete") {
        removeMarkerFromLayer(id)
        confirmedMarkersStore.update((markers) =>
          markers.filter((marker) => marker.id !== id),
        )
      }

      completedActions.push(index)
    })

    if (completedActions.length > 0) {
      markerActionsStore.update((currentActions) =>
        currentActions.filter((_, index) => !completedActions.includes(index)),
      )
    }
  }

  onMount(() => {
    markerActionsUnsubscribe = markerActionsStore.subscribe(applyMarkerActions)
    locationMarkerUnsubscribe = locationMarkerStore.subscribe((timestamp) => {
      if (timestamp) placeMarkerAtCurrentLocation()
    })
    confirmedMarkersUnsubscribe = confirmedMarkersStore.subscribe((markers) => {
      if (markersInitialized && map) refreshMapMarkers()
    })
  })

  onDestroy(() => {
    if (markerActionsUnsubscribe) markerActionsUnsubscribe()
    if (locationMarkerUnsubscribe) locationMarkerUnsubscribe()
    if (confirmedMarkersUnsubscribe) confirmedMarkersUnsubscribe()

    cancelLongPress()

    if (map && map.off) {
      // Remove marker event handlers
      map.off("click", "markers-layer", handleMarkerLayerSelection)
      map.off("touchstart", "markers-layer", handleMarkerTouchStart)
      map.off("touchmove", "markers-layer", handleMarkerTouchMove)
      map.off("touchend", "markers-layer", handleMarkerLayerSelection)
      map.off("mouseenter", "markers-layer")
      map.off("mouseleave", "markers-layer")

      // Remove long press handlers
      map.off("mousedown", handleMapMouseDown)
      map.off("touchstart", handleMapTouchStart)
      map.off("mousemove", checkLongPressMovement)
      map.off("touchmove", checkLongPressMovement)
      map.off("mouseup", cancelLongPress)
      map.off("touchend", cancelLongPress)
    }

    // Clear map layers and source
    if (map && map.getStyle && typeof map.getLayer === "function") {
      try {
        if (map.getLayer("markers-layer")) map.removeLayer("markers-layer")
        if (map.getSource("markers")) map.removeSource("markers")
      } catch (error) {
        console.warn("Error cleaning up map layers:", error)
      }
    }

    // Clear stores
    confirmedMarkersStore.set([])
    removeMarkerStore.set([])
    markerActionsStore.set([])
  })
</script>

<!-- Marker Menu -->
{#if $controlStore.showMarkerMenu}
  <div class="fixed bottom-0 left-0 right-0 z-10 mb-8 flex justify-center">
    <div
      class="w-11/12 overflow-hidden rounded-lg border-2 border-gray-300 bg-white bg-opacity-90 text-black shadow-lg sm:w-1/2"
    >
      <div class="grid grid-cols-2 bg-gray-200">
        <button
          class="flex items-center justify-center border-r border-gray-300 p-4 transition duration-200 hover:bg-green-300"
          on:click={confirmMarker}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-10 w-10 text-green-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M5 13l4 4L19 7"
            />
          </svg>
        </button>
        <button
          class="flex items-center justify-center p-4 transition duration-200 hover:bg-red-300"
          on:click={removeMarker}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-10 w-10"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M20 12H4"
            />
          </svg>
        </button>
      </div>
      <div class="max-h-64 overflow-auto p-2">
        <div class="grid-auto-flow grid-auto-columns grid gap-2">
          {#each markerIcons as icon}
            <button
              class="marker-icon focus:outline-none"
              on:click={() => handleIconSelection(icon)}
            >
              <div
                class="flex transform items-center justify-center rounded-lg bg-gray-200 p-3 transition duration-200 hover:scale-125 hover:bg-gray-300"
                style="width: 50px; height: 45px;"
              >
                {#if icon.class.startsWith("custom-svg")}
                  <IconSVG icon={icon.id} size="42px" />
                {:else if icon.class.startsWith("ionic-")}
                  <ion-icon name={icon.id} style="font-size: 32px;"></ion-icon>
                {:else}
                  <i class={`${icon.class} text-3xl text-gray-700`}></i>
                {/if}
              </div>
            </button>
          {/each}
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .marker-icon {
    margin: 0 5px;
    cursor: pointer;
  }

  .grid-auto-flow {
    grid-auto-flow: row;
    grid-template-columns: repeat(auto-fit, minmax(60px, 1fr));
  }
</style>
