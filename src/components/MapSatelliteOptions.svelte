<script>
  import { toast } from "svelte-sonner"
  import { onMount, onDestroy } from "svelte"
  import { PUBLIC_MAPBOX_ACCESS_TOKEN } from "$env/static/public"
  import { userSettingsStore } from "$lib/stores/userSettingsStore"

  export let map
  export let mapLoaded

  // ArcGIS API Key
  const ARCGIS_API_KEY =
    "AAPTxy8BH1VEsoebNVZXo8HurKFGIfEn2218ZoJgi7vZUQ09BshLsx-eazA5OGqrl0g9FQt9u2l4ExUbrgAsRkYWuvDsM-7udJtdpu0kdYEx1XmzCOaoD6i6Pdek8XADeBGKACnuBxEWcz2V6Beyh3dR3eyMhYGSWVosXZpcsXG1yGEgHrhwcAv9L6eEmv9-TEeYOYabhKBOL6jpzt_x06094ltHBorRtrtH-T7ZEYEvSgg.AT1_GaB7S7PA"

  // NDVI configuration
  const NDVI_DATA_SOURCE = "copernicus"
  const NDVI_SOURCE_ID = "ndvi-source"
  const NDVI_LAYER_ID = "ndvi-layer"

  // Zoom limits for different providers
  const ZOOM_LIMITS = {
    esri: 17.5,
    bing: 18.5,
    ndvi: { min: 8.5, max: 20 }, // NDVI needs to be zoomed in enough to see detail
  }

  // Imagery source configurations - Reordered: Mapbox, Google, Bing, Esris, NDVI
  const IMAGERY_SOURCES = {
    mapbox: {
      name: "Mapbox Satellite",
      url: null, // Uses default Mapbox style
      description: "Best offline support and caching",
      attribution: "© Mapbox © OpenStreetMap",
      provider: "mapbox",
    },
    google_satellite: {
      name: "Google Satellite",
      url: `https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}`,
      description: "Google satellite imagery",
      attribution: "Google Maps",
      provider: "google",
    },
    bing_aerial: {
      name: "Microsoft Bing Aerial",
      url: `https://t0.tiles.virtualearth.net/tiles/a{q}.jpeg?g=12574`,
      description: "High-resolution aerial photography",
      attribution: "Microsoft Bing",
      isBing: true,
      provider: "bing",
    },
    esri_clarity: {
      name: "Esri Clarity+ ⭐",
      url: `https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?token=${ARCGIS_API_KEY}`,
      description: "Enhanced clarity processing, may use older imagery",
      attribution: "Esri Clarity, Maxar, Earthstar",
      provider: "esri",
    },
    esri_standard: {
      name: "Esri World Imagery",
      url: `https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?token=${ARCGIS_API_KEY}`,
      description: "Standard high-resolution imagery",
      attribution: "Esri, Maxar, Earthstar Geographics",
      provider: "esri",
    },
    esri_vivid: {
      name: "Esri Vivid Basemap",
      url: `https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?blendMode=vivid&token=${ARCGIS_API_KEY}`,
      description: "Enhanced colors for vegetation analysis",
      attribution: "Esri Vivid Imagery",
      provider: "esri",
    },
    ndvi: {
      name: "NDVI Vegetation Index",
      url: null,
      description: "Agricultural vegetation health analysis",
      attribution: "Copernicus Data Space / ESA",
      isNDVI: true,
      provider: "ndvi",
    },
  }

  // Layer configuration
  const ESRI_SOURCE_ID = "esri-satellite"
  const ESRI_LAYER_ID = "esri-imagery"

  // State
  let selectedImagerySource = "mapbox"
  let dropdownOpen = false
  let previousSource = "mapbox"
  let showNDVI = false
  let ndviLayerAdded = false
  let isInitialized = false // Track if we've set the initial source

  // Filter sources based on user preferences
  $: availableSources = Object.entries(IMAGERY_SOURCES).filter(
    ([key, source]) => {
      // Always show Mapbox
      if (key === "mapbox") return true

      // Check if this provider is enabled by the user
      return $userSettingsStore.enabledImageryProviders?.includes(key) || false
    },
  )

  // Watch for when map becomes loaded and apply default source
  $: if (
    mapLoaded &&
    map &&
    !isInitialized &&
    $userSettingsStore.defaultImagerySource
  ) {
    initializeDefaultSource()
  }

  function initializeDefaultSource() {
    const defaultSource = $userSettingsStore.defaultImagerySource

    // Check if the default source is available
    const isAvailable = availableSources.some(([key]) => key === defaultSource)

    if (isAvailable && defaultSource !== "mapbox") {
      console.log("Setting initial imagery source to:", defaultSource)
      selectedImagerySource = defaultSource
      setTimeout(() => {
        updateImagerySource()
        isInitialized = true
      }, 200) // Give map time to fully initialize
    } else {
      // Default to mapbox if source not available
      selectedImagerySource = "mapbox"
      isInitialized = true
    }
  }

  // Helper function to convert tile coordinates to Bing quadkey
  function tileToQuadkey(x, y, z) {
    let quadkey = ""
    for (let i = z; i > 0; i--) {
      let digit = 0
      const mask = 1 << (i - 1)
      if ((x & mask) !== 0) digit++
      if ((y & mask) !== 0) digit += 2
      quadkey += digit
    }
    return quadkey
  }

  // Get effective max zoom for a provider
  function getMaxZoom(provider) {
    if (ZOOM_LIMITS[provider]) {
      if (typeof ZOOM_LIMITS[provider] === "object") {
        return Math.floor(ZOOM_LIMITS[provider].max)
      }
      return Math.floor(ZOOM_LIMITS[provider])
    }
    return 20 // Default max zoom
  }

  // Check if current zoom is valid for NDVI
  function isValidZoomForNDVI() {
    if (!map) return true
    const currentZoom = map.getZoom()
    return currentZoom >= ZOOM_LIMITS.ndvi.min
  }

  async function getAccessToken() {
    const response = await fetch(
      "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: "sh-836e4f9a-e66f-43d4-8490-3fd21d812b86",
          client_secret: "cf70kUdpk9SPhBKraYUseiwuBCjX4fKt",
        }),
      },
    )

    const data = await response.json()
    return data.access_token
  }

  async function addNDVILayer() {
    if (!map || !mapLoaded || ndviLayerAdded) return

    // Check zoom level first
    if (!isValidZoomForNDVI()) {
      toast.error(
        `NDVI requires zoom level ${ZOOM_LIMITS.ndvi.min} or higher to see vegetation detail`,
      )
      // Switch back to previous source
      selectedImagerySource = previousSource
      return
    }

    // Show loading toast
    const loadingToast = toast.loading("Loading NDVI vegetation data...")

    try {
      let sourceConfig

      if (NDVI_DATA_SOURCE === "copernicus") {
        const accessToken = await getAccessToken()

        sourceConfig = {
          type: "raster",
          tiles: [
            `https://sh.dataspace.copernicus.eu/ogc/wms/2cd4524e-fbeb-46fb-a3ab-34a3ca27d2cb?SERVICE=WMS&REQUEST=GetMap&LAYERS=NDVI&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&SRS=EPSG:3857&FORMAT=image/png&ACCESS_TOKEN=${accessToken}`,
          ],
          tileSize: 256,
          attribution: "Copernicus Data Space / ESA",
        }

        map.addSource(NDVI_SOURCE_ID, sourceConfig)

        map.addLayer({
          id: NDVI_LAYER_ID,
          type: "raster",
          source: NDVI_SOURCE_ID,
          paint: {
            "raster-opacity": 0.8,
          },
        })

        ndviLayerAdded = true

        // Dismiss loading toast and show success
        toast.dismiss(loadingToast)
        toast.success(
          "NDVI loaded! Gray = bare soil, Green/Blue/Red = increasing vegetation",
        )
      }
    } catch (error) {
      console.error("Error adding NDVI layer:", error)

      // Dismiss loading toast and show error
      toast.dismiss(loadingToast)
      toast.error(`Failed to load NDVI: ${error.message}`)

      // Switch back to previous source
      selectedImagerySource = previousSource
    }
  }

  function removeNDVILayer() {
    if (!map || !ndviLayerAdded) return

    try {
      if (map.getLayer(NDVI_LAYER_ID)) {
        map.removeLayer(NDVI_LAYER_ID)
      }
      if (map.getSource(NDVI_SOURCE_ID)) {
        map.removeSource(NDVI_SOURCE_ID)
      }
      ndviLayerAdded = false
    } catch (error) {
      console.error("Error removing NDVI layer:", error)
    }
  }

  function cleanupExistingLayers() {
    if (!map) return

    try {
      // Remove NDVI layer if it exists
      if (map.getLayer(NDVI_LAYER_ID)) {
        map.removeLayer(NDVI_LAYER_ID)
      }
      if (map.getSource(NDVI_SOURCE_ID)) {
        map.removeSource(NDVI_SOURCE_ID)
      }
      ndviLayerAdded = false
      showNDVI = false

      // Remove imagery layer if it exists
      if (map.getLayer(ESRI_LAYER_ID)) {
        map.removeLayer(ESRI_LAYER_ID)
      }
      if (map.getSource(ESRI_SOURCE_ID)) {
        map.removeSource(ESRI_SOURCE_ID)
      }
    } catch (error) {
      console.error("Error cleaning up layers:", error)
    }
  }

  function updateImagerySource() {
    if (!map || !mapLoaded) return

    console.log("Updating imagery source to:", selectedImagerySource)

    const source = IMAGERY_SOURCES[selectedImagerySource]

    // Clean up all existing overlays first
    cleanupExistingLayers()

    // Handle NDVI selection
    if (selectedImagerySource === "ndvi") {
      showNDVI = true
      addNDVILayer()
      return
    }

    // If switching to Mapbox, we're done (just cleaned up overlays)
    if (selectedImagerySource === "mapbox") {
      return
    }

    // Add the new imagery source
    try {
      const maxZoom = getMaxZoom(source.provider)

      let sourceConfig = {
        type: "raster",
        tileSize: 256,
        attribution: source.attribution,
        maxzoom: maxZoom,
        minzoom: 0,
      }

      // Handle Bing tiles specially
      if (source.isBing) {
        map.addSource(ESRI_SOURCE_ID, {
          type: "raster",
          tiles: [
            "https://ecn.t0.tiles.virtualearth.net/tiles/a{quadkey}.jpeg?g=12574",
            "https://ecn.t1.tiles.virtualearth.net/tiles/a{quadkey}.jpeg?g=12574",
            "https://ecn.t2.tiles.virtualearth.net/tiles/a{quadkey}.jpeg?g=12574",
            "https://ecn.t3.tiles.virtualearth.net/tiles/a{quadkey}.jpeg?g=12574",
          ],
          tileSize: 256,
          bounds: [-180, -85.0511, 180, 85.0511],
          minzoom: 0,
          maxzoom: maxZoom,
          attribution: source.attribution,
          transformRequest: (url, resourceType) => {
            if (resourceType === "Tile" && url.includes("virtualearth")) {
              const xyzPattern = /(\d+)\/(\d+)\/(\d+)/
              const xyzMatch = url.match(xyzPattern)
              if (xyzMatch) {
                const [, z, x, y] = xyzMatch
                const quadkey = tileToQuadkey(
                  parseInt(x),
                  parseInt(y),
                  parseInt(z),
                )
                return {
                  url: `https://ecn.t${Math.floor(Math.random() * 4)}.tiles.virtualearth.net/tiles/a${quadkey}.jpeg?g=12574`,
                  headers: {},
                }
              }
            }
            return { url }
          },
        })
      } else {
        // Standard tile source with zoom limit
        sourceConfig.tiles = [source.url]
        map.addSource(ESRI_SOURCE_ID, sourceConfig)
      }

      // Find the first label layer
      const layers = map.getStyle().layers
      let firstLabelLayerId
      for (const layer of layers) {
        if (
          layer.type === "symbol" &&
          layer.layout &&
          layer.layout["text-field"]
        ) {
          firstLabelLayerId = layer.id
          break
        }
      }

      // Add the raster layer
      map.addLayer(
        {
          id: ESRI_LAYER_ID,
          type: "raster",
          source: ESRI_SOURCE_ID,
          paint: {
            "raster-opacity": 1,
            "raster-fade-duration": 300,
            "raster-contrast": selectedImagerySource === "esri_vivid" ? 0.2 : 0,
            "raster-saturation":
              selectedImagerySource === "esri_vivid" ? 0.2 : 0,
          },
        },
        firstLabelLayerId,
      )
    } catch (error) {
      console.error("Error updating imagery source:", error)
      toast.error(`Failed to load ${source.name}, switching back to Mapbox`)
      // Fallback to Mapbox on error
      selectedImagerySource = "mapbox"
    }
  }

  function selectImagerySource(sourceKey) {
    console.log("User selected imagery source:", sourceKey)
    previousSource = selectedImagerySource
    selectedImagerySource = sourceKey
    dropdownOpen = false

    updateImagerySource()
  }

  // Handle map style changes
  function handleMapStyleChange() {
    console.log(
      "Map style changed, reapplying imagery source:",
      selectedImagerySource,
    )

    // Small delay to let the map style fully load
    setTimeout(() => {
      if (selectedImagerySource === "ndvi" && showNDVI) {
        addNDVILayer()
      } else if (selectedImagerySource !== "mapbox") {
        updateImagerySource()
      }
    }, 100)
  }

  // Click outside to close dropdown
  function handleClickOutside(event) {
    if (!event.target.closest(".imagery-selector-container")) {
      dropdownOpen = false
    }
  }

  // Monitor zoom changes for NDVI
  function handleZoomChange() {
    if (selectedImagerySource === "ndvi" && showNDVI && ndviLayerAdded) {
      if (!isValidZoomForNDVI()) {
        // Remove NDVI if zoom is too low
        removeNDVILayer()
        toast.warning(
          `NDVI hidden - zoom to ${ZOOM_LIMITS.ndvi.min}+ to see vegetation detail`,
        )
      }
    } else if (
      selectedImagerySource === "ndvi" &&
      showNDVI &&
      !ndviLayerAdded
    ) {
      if (isValidZoomForNDVI()) {
        // Re-add NDVI if zoom is now sufficient
        addNDVILayer()
      }
    }
  }

  onMount(() => {
    if (map) {
      map.on("style.load", handleMapStyleChange)
      map.on("zoomend", handleZoomChange)
    }
    document.addEventListener("click", handleClickOutside)
  })

  onDestroy(() => {
    if (map) {
      map.off("style.load", handleMapStyleChange)
      map.off("zoomend", handleZoomChange)
    }
    document.removeEventListener("click", handleClickOutside)

    // Reset initialization flag for next time
    isInitialized = false
  })
</script>

<!-- Only show if satellite dropdown is enabled -->
{#if $userSettingsStore.satelliteDropdownEnabled}
  <div class="imagery-selector-container">
    <button
      class="imagery-selector-button"
      class:dropdown-open={dropdownOpen}
      on:click|stopPropagation={() => (dropdownOpen = !dropdownOpen)}
    >
      <span class="selector-icon">🛰️</span>
    </button>

    {#if dropdownOpen}
      <div class="imagery-dropdown">
        {#each availableSources as [key, source]}
          <button
            class="dropdown-item"
            class:selected={selectedImagerySource === key}
            class:ndvi-item={source.isNDVI}
            on:click={() => selectImagerySource(key)}
          >
            <div class="dropdown-item-name">
              {source.name}
              {#if ZOOM_LIMITS[source.provider]}
                {#if typeof ZOOM_LIMITS[source.provider] === "object"}
                  <span class="zoom-limit-badge"
                    >Min: {ZOOM_LIMITS[source.provider].min}</span
                  >
                {:else}
                  <span class="zoom-limit-badge"
                    >Max: {ZOOM_LIMITS[source.provider]}</span
                  >
                {/if}
              {/if}
            </div>
            <div class="dropdown-item-description">{source.description}</div>
          </button>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .imagery-selector-container {
    position: absolute;
    top: 92px; /* Moved down below the back button */
    left: 16px; /* Same left margin as back button */
    z-index: 10;
  }

  /* Same size as back button (btn-lg) */
  .imagery-selector-button {
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: rgba(255, 255, 255, 0.5);
    border: 2px solid #000000;
    border-radius: 50%;
    cursor: pointer;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    transition: all 0.2s ease;
    width: 64px; /* Same as btn-lg */
    height: 64px; /* Same as btn-lg */
  }

  .imagery-selector-button:hover {
    background-color: rgba(255, 255, 255, 1);
    box-shadow: 0 3px 6px rgba(0, 0, 0, 0.15);
    transform: translateY(-1px);
  }

  .imagery-selector-button.dropdown-open {
    background-color: #f7db5c;
    border-color: #000000;
    box-shadow: 0 3px 6px rgba(0, 0, 0, 0.2);
  }

  .selector-icon {
    font-size: 20px;
    line-height: 1;
  }

  .imagery-dropdown {
    position: absolute;
    top: calc(100% + 8px);
    left: 0;
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
    overflow: hidden;
    min-width: 320px;
    max-height: 400px;
    overflow-y: auto;
  }

  .dropdown-item {
    display: block;
    width: 100%;
    padding: 12px 16px;
    text-align: left;
    background: white;
    border: none;
    cursor: pointer;
    transition: background-color 0.2s ease;
    border-bottom: 1px solid #f0f0f0;
  }

  .dropdown-item:last-child {
    border-bottom: none;
  }

  .dropdown-item:hover {
    background-color: #f7fafc;
  }

  .dropdown-item.selected {
    background-color: #ebf8ff;
    position: relative;
  }

  .dropdown-item.selected::before {
    content: "✓";
    position: absolute;
    left: 8px;
    top: 50%;
    transform: translateY(-50%);
    color: #4299e1;
    font-weight: bold;
  }

  .dropdown-item.selected .dropdown-item-name {
    margin-left: 20px;
  }

  .dropdown-item.selected .dropdown-item-description {
    margin-left: 20px;
  }

  .dropdown-item-name {
    font-weight: 600;
    font-size: 14px;
    color: #2d3748;
    margin-bottom: 3px;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
  }

  .dropdown-item-description {
    font-size: 12px;
    color: #718096;
    line-height: 1.3;
  }

  .zoom-limit-badge {
    background-color: #fed7aa;
    color: #9a3412;
    font-size: 10px;
    font-weight: 500;
    padding: 2px 6px;
    border-radius: 8px;
    margin-left: 6px;
  }

  /* Special styling for NDVI option */
  .ndvi-item {
    background-color: #f0fff4;
    border-left: 4px solid #22c55e;
  }

  .ndvi-item:hover {
    background-color: #dcfce7;
  }

  .ndvi-item.selected {
    background-color: #bbf7d0;
  }

  .ndvi-item .zoom-limit-badge {
    background-color: #bbf7d0;
    color: #166534;
  }

  @media (max-width: 640px) {
    .imagery-selector-container {
      top: 92px;
      left: 16px;
    }

    .imagery-selector-button {
      width: 64px; /* Slightly smaller on mobile */
      height: 64px;
    }

    .selector-icon {
      font-size: 18px;
    }

    .imagery-dropdown {
      min-width: 280px;
      max-height: 300px;
    }

    .dropdown-item {
      padding: 10px 14px;
    }

    .dropdown-item-name {
      font-size: 13px;
    }

    .dropdown-item-description {
      font-size: 11px;
    }

    .zoom-limit-badge {
      font-size: 9px;
      padding: 1px 4px;
    }
  }
</style>
