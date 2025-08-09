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
  import mapboxgl from "mapbox-gl"
  import { v4 as uuidv4 } from "uuid"
  import IconSVG from "../components/IconSVG.svelte"
  import { toast } from "svelte-sonner"

  export let map
  export let mapLoaded = false
  export let markerPlacementEvent = null
  export let markerClickEvent = null

  let markerActionsUnsubscribe
  let locationMarkerUnsubscribe
  let confirmedMarkersUnsubscribe
  let markersInitialized = false
  let selectedMarkerPopup = null
  let iconsLoaded = false

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

  $: if (markerPlacementEvent) {
    handleMarkerPlacement(markerPlacementEvent)
  }

  $: if (markerClickEvent) {
    handleMarkerSelection(markerClickEvent)
  }

  $: if (mapLoaded && map && !markersInitialized) {
    initializeMarkerLayers()
  }

  async function loadCustomSvgIcon(iconId) {
    const iconKey = `custom-svg-${iconId}`

    if (map.hasImage(iconKey)) {
      return
    }

    // Create a temporary container to render the SVG component
    const container = document.createElement("div")
    container.style.position = "absolute"
    container.style.left = "-9999px"
    container.style.width = "35px"
    container.style.height = "35px"
    document.body.appendChild(container)

    // Create wrapper for background
    const wrapper = document.createElement("div")
    wrapper.style.width = "35px"
    wrapper.style.height = "35px"
    wrapper.style.backgroundColor = "rgba(211, 211, 211, 0.9)"
    wrapper.style.borderRadius = "50%"
    wrapper.style.display = "flex"
    wrapper.style.alignItems = "center"
    wrapper.style.justifyContent = "center"
    container.appendChild(wrapper)

    // Render the IconSVG component
    const svgComponent = new IconSVG({
      target: wrapper,
      props: {
        icon: iconId,
        size: "25px",
        color: "black",
      },
    })

    // Wait for the SVG to render
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Use html2canvas or DOM to image conversion
    const canvas = document.createElement("canvas")
    canvas.width = 35
    canvas.height = 35
    const ctx = canvas.getContext("2d")

    // Draw background circle
    ctx.fillStyle = "rgba(211, 211, 211, 0.9)"
    ctx.beginPath()
    ctx.arc(17.5, 17.5, 17.5, 0, 2 * Math.PI)
    ctx.fill()

    // Get the SVG element and convert to image
    const svgElement = wrapper.querySelector("svg")
    if (svgElement) {
      // Clone the SVG and set attributes
      const clonedSvg = svgElement.cloneNode(true)
      clonedSvg.setAttribute("width", "25")
      clonedSvg.setAttribute("height", "25")

      const svgData = new XMLSerializer().serializeToString(clonedSvg)
      const svgBlob = new Blob([svgData], {
        type: "image/svg+xml;charset=utf-8",
      })
      const url = URL.createObjectURL(svgBlob)

      const img = new Image()
      await new Promise((resolve, reject) => {
        img.onload = () => {
          ctx.drawImage(img, 5, 5, 25, 25)
          URL.revokeObjectURL(url)

          // Get ImageData and add to map
          const imageData = ctx.getImageData(0, 0, 35, 35)
          map.addImage(iconKey, {
            width: 35,
            height: 35,
            data: imageData.data,
          })

          resolve()
        }
        img.onerror = () => {
          console.error(`Failed to load custom icon: ${iconId}`)
          resolve() // Continue even if one icon fails
        }
        img.src = url
      })
    }

    // Clean up
    svgComponent.$destroy()
    document.body.removeChild(container)
  }

  async function loadIonicIcon(iconId) {
    const iconKey = `ionic-${iconId}`

    if (map.hasImage(iconKey)) {
      return
    }

    // Create canvas for ionic icon
    const canvas = document.createElement("canvas")
    canvas.width = 35
    canvas.height = 35
    const ctx = canvas.getContext("2d")

    // Draw background circle
    ctx.fillStyle = "rgba(211, 211, 211, 0.9)"
    ctx.beginPath()
    ctx.arc(17.5, 17.5, 17.5, 0, 2 * Math.PI)
    ctx.fill()

    // Create the ionic SVG directly (ionicons are available as SVGs)
    const ionicSvg = `
      <svg width="25" height="25" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
        <style>
          .ionicon-fill-none{fill:none}
          .ionicon-stroke-width{stroke-width:32px}
        </style>
      </svg>
    `

    // For ionic icons, we'll use the ion-icon web component approach
    const tempDiv = document.createElement("div")
    tempDiv.style.position = "absolute"
    tempDiv.style.left = "-9999px"
    tempDiv.innerHTML = `<ion-icon name="${iconId}" style="font-size: 25px; color: black;"></ion-icon>`
    document.body.appendChild(tempDiv)

    // Wait for the icon to load
    await new Promise((resolve) => setTimeout(resolve, 200))

    const ionIcon = tempDiv.querySelector("ion-icon")
    if (ionIcon && ionIcon.shadowRoot) {
      const svg = ionIcon.shadowRoot.querySelector("svg")
      if (svg) {
        svg.setAttribute("width", "25")
        svg.setAttribute("height", "25")
        svg.setAttribute("fill", "black")

        const svgData = new XMLSerializer().serializeToString(svg)
        const svgBlob = new Blob([svgData], {
          type: "image/svg+xml;charset=utf-8",
        })
        const url = URL.createObjectURL(svgBlob)

        const img = new Image()
        await new Promise((resolve) => {
          img.onload = () => {
            ctx.drawImage(img, 5, 5, 25, 25)
            URL.revokeObjectURL(url)

            // Get ImageData and add to map
            const imageData = ctx.getImageData(0, 0, 35, 35)
            map.addImage(iconKey, {
              width: 35,
              height: 35,
              data: imageData.data,
            })

            resolve()
          }
          img.onerror = () => {
            // Fallback - just use the circle
            const imageData = ctx.getImageData(0, 0, 35, 35)
            map.addImage(iconKey, {
              width: 35,
              height: 35,
              data: imageData.data,
            })
            resolve()
          }
          img.src = url
        })
      }
    } else {
      // Fallback if shadow DOM not available
      const imageData = ctx.getImageData(0, 0, 35, 35)
      map.addImage(iconKey, {
        width: 35,
        height: 35,
        data: imageData.data,
      })
    }

    // Clean up
    document.body.removeChild(tempDiv)
  }

  async function loadAtlasIcon(iconId, iconClass) {
    const iconKey = iconClass

    if (map.hasImage(iconKey)) {
      return
    }

    // Create canvas for atlas icon
    const canvas = document.createElement("canvas")
    canvas.width = 35
    canvas.height = 35
    const ctx = canvas.getContext("2d")

    // Draw background circle
    ctx.fillStyle = "rgba(211, 211, 211, 0.9)"
    ctx.beginPath()
    ctx.arc(17.5, 17.5, 17.5, 0, 2 * Math.PI)
    ctx.fill()

    // Create a temporary element with the atlas icon class
    const tempDiv = document.createElement("div")
    tempDiv.style.position = "absolute"
    tempDiv.style.left = "-9999px"
    tempDiv.innerHTML = `<i class="${iconClass}" style="font-size: 20px; color: black;"></i>`
    document.body.appendChild(tempDiv)

    // Wait a moment for font to load
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Try to render the font icon
    ctx.fillStyle = "black"
    ctx.font = "20px atlas-icons" // Or whatever the font family is
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"

    // Get the computed style to see if font loaded
    const iconElement = tempDiv.querySelector("i")
    if (iconElement) {
      const computedStyle = window.getComputedStyle(iconElement)
      const fontFamily = computedStyle.fontFamily

      if (fontFamily && fontFamily !== "atlas-icons") {
        ctx.font = `20px ${fontFamily}`
      }

      // Try to get the actual character/content
      const beforeContent = window.getComputedStyle(
        iconElement,
        "::before",
      ).content
      if (beforeContent && beforeContent !== "none") {
        const char = beforeContent.replace(/['"]/g, "")
        ctx.fillText(char, 17.5, 17.5)
      } else {
        // Fallback to a generic symbol
        ctx.fillText("◆", 17.5, 17.5)
      }
    }

    // Get ImageData and add to map
    const imageData = ctx.getImageData(0, 0, 35, 35)
    map.addImage(iconKey, {
      width: 35,
      height: 35,
      data: imageData.data,
    })

    // Clean up
    document.body.removeChild(tempDiv)
  }

  async function loadAllIcons() {
    if (!map || iconsLoaded) return

    console.log("Loading icon images...")

    // Load default marker first
    const defaultCanvas = document.createElement("canvas")
    defaultCanvas.width = 35
    defaultCanvas.height = 35
    const defaultCtx = defaultCanvas.getContext("2d")

    // Draw default blue marker
    defaultCtx.fillStyle = "#3b82f6"
    defaultCtx.beginPath()
    defaultCtx.arc(17.5, 17.5, 14, 0, 2 * Math.PI)
    defaultCtx.fill()
    defaultCtx.strokeStyle = "white"
    defaultCtx.lineWidth = 2
    defaultCtx.stroke()

    defaultCtx.fillStyle = "white"
    defaultCtx.beginPath()
    defaultCtx.arc(17.5, 17.5, 4, 0, 2 * Math.PI)
    defaultCtx.fill()

    const defaultImageData = defaultCtx.getImageData(0, 0, 35, 35)
    map.addImage("default", {
      width: 35,
      height: 35,
      data: defaultImageData.data,
    })

    // Load all custom SVG icons
    const customIcons = markerIcons.filter((icon) =>
      icon.class.startsWith("custom-svg"),
    )
    for (const icon of customIcons) {
      await loadCustomSvgIcon(icon.id)
    }

    // Load all ionic icons
    const ionicIcons = markerIcons.filter((icon) =>
      icon.class.startsWith("ionic-"),
    )
    for (const icon of ionicIcons) {
      await loadIonicIcon(icon.id)
    }

    // Load all atlas icons
    const atlasIcons = markerIcons.filter((icon) =>
      icon.class.startsWith("at-"),
    )
    for (const icon of atlasIcons) {
      await loadAtlasIcon(icon.id, icon.class)
    }

    iconsLoaded = true
    console.log("All icon images loaded successfully")
  }

  function getIconImageName(iconClass) {
    if (!iconClass || iconClass === "default") {
      return "default"
    }

    // Handle different icon class formats
    if (iconClass.startsWith("custom-svg-")) {
      return iconClass
    } else if (iconClass.startsWith("ionic-")) {
      return iconClass
    } else if (iconClass.startsWith("at-")) {
      return iconClass
    }

    return "default"
  }

  async function initializeMarkerLayers() {
    if (!map || markersInitialized) return

    console.log("Initializing marker layers...")

    // Load all icons
    await loadAllIcons()

    // Initialize empty GeoJSON source for markers
    if (!map.getSource("markers")) {
      map.addSource("markers", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [],
        },
      })
      console.log("Markers source added")
    }

    // Add marker layer
    if (!map.getLayer("markers-layer")) {
      map.addLayer({
        id: "markers-layer",
        type: "symbol",
        source: "markers",
        layout: {
          "icon-image": ["get", "icon"],
          "icon-size": 1,
          "icon-allow-overlap": true,
          "text-allow-overlap": true,
          "icon-anchor": "center",
        },
      })
      console.log("Markers layer added")
    }

    // Add selection highlight layer
    if (!map.getLayer("marker-selection")) {
      map.addLayer({
        id: "marker-selection",
        type: "circle",
        source: "markers",
        paint: {
          "circle-radius": 20,
          "circle-color": "transparent",
          "circle-stroke-color": "#3b82f6",
          "circle-stroke-width": 3,
          "circle-opacity": ["case", ["==", ["get", "selected"], true], 1, 0],
        },
      })
      console.log("Marker selection layer added")
    }

    // Add click handler for markers
    map.on("click", "markers-layer", (e) => {
      if (e.features.length > 0) {
        const feature = e.features[0]
        handleMarkerSelection({
          id: feature.properties.id,
          lngLat: feature.geometry.coordinates,
        })
      }
    })

    // Change cursor on hover
    map.on("mouseenter", "markers-layer", () => {
      map.getCanvas().style.cursor = "pointer"
    })

    map.on("mouseleave", "markers-layer", () => {
      map.getCanvas().style.cursor = ""
    })

    markersInitialized = true
    console.log("Marker layers initialization complete")

    // Load any existing markers from the store
    refreshMapMarkers()
  }

  function refreshMapMarkers() {
    if (!map || !map.getSource("markers")) return

    const markers = $confirmedMarkersStore
    console.log("Refreshing map with", markers.length, "markers from store")

    const features = markers.map((marker) => {
      const iconName = getIconImageName(marker.iconClass)
      return {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: marker.coordinates,
        },
        properties: {
          id: marker.id,
          icon: iconName,
          iconClass: marker.iconClass || "default",
          selected: false,
        },
      }
    })

    const source = map.getSource("markers")
    source.setData({
      type: "FeatureCollection",
      features: features,
    })

    console.log("Map refreshed with", features.length, "features")
  }

  onMount(() => {
    markerActionsUnsubscribe = markerActionsStore.subscribe(applyMarkerActions)

    locationMarkerUnsubscribe = locationMarkerStore.subscribe((timestamp) => {
      if (timestamp) {
        placeMarkerAtCurrentLocation()
      }
    })

    // Subscribe to confirmedMarkersStore to update map when it changes
    confirmedMarkersUnsubscribe = confirmedMarkersStore.subscribe((markers) => {
      if (markersInitialized && map) {
        console.log(
          "ConfirmedMarkersStore updated with",
          markers.length,
          "markers",
        )
        refreshMapMarkers()
      }
    })
  })

  onDestroy(() => {
    console.log("Destroying MarkerManager")

    if (markerActionsUnsubscribe) {
      markerActionsUnsubscribe()
    }
    if (locationMarkerUnsubscribe) {
      locationMarkerUnsubscribe()
    }
    if (confirmedMarkersUnsubscribe) {
      confirmedMarkersUnsubscribe()
    }

    if (selectedMarkerPopup) {
      selectedMarkerPopup.remove()
      selectedMarkerPopup = null
    }

    // Clear map layers and source
    if (map) {
      if (map.getLayer("marker-selection")) map.removeLayer("marker-selection")
      if (map.getLayer("markers-layer")) map.removeLayer("markers-layer")
      if (map.getSource("markers")) map.removeSource("markers")
    }

    // Clear stores
    confirmedMarkersStore.set([])
    removeMarkerStore.set([])
    markerActionsStore.set([])
  })

  async function placeMarkerAtCurrentLocation() {
    if (!map) return

    const coordinates = $locationMarkerStore

    if (coordinates) {
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

      console.log("Marker placed at current location:", coordinates)
    } else {
      console.error("Unable to get current location")
    }
  }

  function addMarkerToLayer(feature) {
    if (!map || !map.getSource("markers")) {
      console.warn("Map or markers source not ready")
      return
    }

    const source = map.getSource("markers")
    const data = source._data

    // Check if marker already exists and update it
    const existingIndex = data.features.findIndex(
      (f) => f.properties.id === feature.properties.id,
    )
    if (existingIndex >= 0) {
      data.features[existingIndex] = feature
    } else {
      data.features.push(feature)
    }

    source.setData(data)
    console.log(
      "Added/updated marker in layer:",
      feature.properties.id,
      "with icon:",
      feature.properties.icon,
    )
  }

  function removeMarkerFromLayer(markerId) {
    if (!map || !map.getSource("markers")) return

    const source = map.getSource("markers")
    const data = source._data
    data.features = data.features.filter((f) => f.properties.id !== markerId)
    source.setData(data)
    console.log("Removed marker from layer:", markerId)
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

  async function handleMarkerPlacement(event) {
    if (!map) return

    const { lngLat } = event

    if (lngLat) {
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

      console.log("Marker ID Placed:", id)
    }
  }

  function confirmMarker() {
    if ($selectedMarkerStore) {
      const { id, coordinates } = $selectedMarkerStore
      const currentTimestamp = new Date().toISOString()

      // Get the current icon from the layer
      const source = map.getSource("markers")
      const data = source._data
      const feature = data.features.find((f) => f.properties.id === id)
      const iconClass = feature?.properties.iconClass || "default"

      const markerData = {
        id,
        last_confirmed: currentTimestamp,
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

      removeMarkerFromLayer(id)
      selectedMarkerStore.set(null)

      const deletedBy = $profileStore.id
      const existingMarker = $confirmedMarkersStore.find((m) => m.id === id)

      if (existingMarker) {
        confirmedMarkersStore.update((markers) => {
          const updatedMarkers = markers.filter((m) => m.id !== id)
          removeMarkerStore.update((removedMarkers) => [
            ...removedMarkers,
            { id, deletedBy, last_confirmed: existingMarker.last_confirmed },
          ])
          return updatedMarkers
        })
        console.log("Marker removed:", id)
      }
    }

    controlStore.update((controls) => ({
      ...controls,
      showMarkerMenu: false,
    }))
  }

  async function handleMarkerSelection(event) {
    if (!map) return

    const { id, lngLat } = event

    updateMarkerSelection(id, true)
    selectedMarkerStore.set({ id, coordinates: lngLat })

    console.log(`Marker selected with ID: ${id}`)

    map.flyTo({
      center: lngLat,
      zoom: 15,
      duration: 1000,
    })

    controlStore.update((controls) => ({
      ...controls,
      showMarkerMenu: true,
    }))
  }

  async function handleIconSelection(icon) {
    if (!map || !$selectedMarkerStore) return

    const { id, coordinates } = $selectedMarkerStore

    // Update the icon in the layer
    const source = map.getSource("markers")
    const data = source._data
    const feature = data.features.find((f) => f.properties.id === id)

    if (feature) {
      const newIconClass = icon.class.startsWith("custom-svg")
        ? `custom-svg-${icon.id}`
        : icon.class

      const newIconName = getIconImageName(newIconClass)

      feature.properties.icon = newIconName
      feature.properties.iconClass = newIconClass

      source.setData(data)
      console.log("Updated marker icon to:", newIconName, newIconClass)
    }
  }

  async function applyMarkerActions(actions) {
    if (!map) return

    console.log("Applying", actions.length, "marker actions")
    const completedActions = []

    actions.forEach((action, index) => {
      const { markerData } = action
      const { id, marker_data, last_confirmed, iconClass } = markerData

      if (action.action === "add" || action.action === "update") {
        const { geometry, properties } = marker_data
        const { coordinates } = geometry
        const icon = iconClass || properties.icon || "default"
        const iconImageName = getIconImageName(icon)

        const feature = {
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates,
          },
          properties: {
            id,
            icon: iconImageName,
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

        completedActions.push(index)
      } else if (action.action === "delete") {
        removeMarkerFromLayer(id)

        confirmedMarkersStore.update((markers) =>
          markers.filter((marker) => marker.id !== id),
        )

        console.log("Marker removed:", markerData)
        completedActions.push(index)
      }
    })

    if (completedActions.length > 0) {
      markerActionsStore.update((currentActions) =>
        currentActions.filter((_, index) => !completedActions.includes(index)),
      )
    }

    console.log("Completed", completedActions.length, "marker actions")
  }
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
