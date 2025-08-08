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

  // Imagery source configurations - Optimized for Australian farming
  const IMAGERY_SOURCES = {
    mapbox: {
      name: "Mapbox Satellite",
      url: null, // Uses default Mapbox style
      description: "Best offline support and caching",
      attribution: "© Mapbox © OpenStreetMap",
    },
    esri_clarity: {
      name: "Esri Clarity+ ⭐",
      url: `https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?token=${ARCGIS_API_KEY}`,
      description: "Enhanced clarity processing for field detail",
      attribution: "Esri Clarity, Maxar, Earthstar",
    },
    esri_standard: {
      name: "Esri World Imagery",
      url: `https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?token=${ARCGIS_API_KEY}`,
      description: "Standard high-resolution imagery",
      attribution: "Esri, Maxar, Earthstar Geographics",
    },
    esri_vivid: {
      name: "Esri Vivid Basemap",
      url: `https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?blendMode=vivid&token=${ARCGIS_API_KEY}`,
      description: "Enhanced colors for vegetation analysis",
      attribution: "Esri Vivid Imagery",
    },
    google_hybrid: {
      name: "Google Hybrid",
      url: `https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}`,
      description: "Satellite imagery with road labels",
      attribution: "Google Maps",
    },
    bing_aerial: {
      name: "Microsoft Bing Aerial",
      url: `https://t0.tiles.virtualearth.net/tiles/a{q}.jpeg?g=12574`,
      description: "High-resolution aerial photography",
      attribution: "Microsoft Bing",
      isBing: true,
    },
    ndvi: {
      name: "NDVI Vegetation Index",
      url: null,
      description: "Agricultural vegetation health analysis",
      attribution: "Copernicus Data Space / ESA",
      isNDVI: true,
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
        toast.success(
          "Agricultural NDVI loaded! (Gray = bare soil, Green/Blue/Red = increasing vegetation)",
        )
      }
    } catch (error) {
      console.error("Error adding NDVI layer:", error)
      toast.error(`Failed to load NDVI: ${error.message}`)
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
      toast.success("NDVI layer disabled")
    } catch (error) {
      console.error("Error removing NDVI layer:", error)
    }
  }

  function updateImagerySource() {
    if (!map || !mapLoaded) return

    const source = IMAGERY_SOURCES[selectedImagerySource]

    // Remove existing layer if it exists
    if (map.getLayer(ESRI_LAYER_ID)) {
      map.removeLayer(ESRI_LAYER_ID)
    }
    if (map.getSource(ESRI_SOURCE_ID)) {
      map.removeSource(ESRI_SOURCE_ID)
    }

    // Handle NDVI selection
    if (selectedImagerySource === "ndvi") {
      if (!showNDVI) {
        showNDVI = true
        addNDVILayer()
      }
      return
    }

    // If switching to Mapbox, just remove the overlay and we're done
    if (selectedImagerySource === "mapbox") {
      toast.success("Switched to Mapbox imagery")
      return
    }

    // Add the new imagery source
    try {
      let sourceConfig = {
        type: "raster",
        tileSize: 256,
        attribution: source.attribution,
        maxzoom: 20,
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
          maxzoom: 20,
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
        // Standard tile source
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

      toast.success(`Switched to ${source.name}`)
    } catch (error) {
      console.error("Error updating imagery source:", error)
      toast.error(`Failed to load ${source.name}`)
      selectedImagerySource = previousSource
    }
  }

  function selectImagerySource(sourceKey) {
    previousSource = selectedImagerySource
    selectedImagerySource = sourceKey
    dropdownOpen = false

    // If switching away from NDVI, remove it
    if (previousSource === "ndvi" && sourceKey !== "ndvi") {
      showNDVI = false
      removeNDVILayer()
    }

    updateImagerySource()
  }

  // Handle map style changes
  function handleMapStyleChange() {
    if (
      selectedImagerySource !== "mapbox" &&
      selectedImagerySource !== "ndvi" &&
      mapLoaded
    ) {
      setTimeout(() => {
        updateImagerySource()
      }, 100)
    }
    // Re-add NDVI if it was active
    if (showNDVI && selectedImagerySource === "ndvi") {
      setTimeout(() => {
        addNDVILayer()
      }, 100)
    }
  }

  // Click outside to close dropdown
  function handleClickOutside(event) {
    if (!event.target.closest(".imagery-selector-container")) {
      dropdownOpen = false
    }
  }

  // Filter sources based on NDVI permission
  $: availableSources = Object.entries(IMAGERY_SOURCES).filter(
    ([key, source]) => {
      if (source.isNDVI) {
        return $userSettingsStore.NDVI
      }
      return true
    },
  )

  onMount(() => {
    if (map) {
      map.on("style.load", handleMapStyleChange)
    }
    document.addEventListener("click", handleClickOutside)
  })

  onDestroy(() => {
    if (map) {
      map.off("style.load", handleMapStyleChange)
    }
    document.removeEventListener("click", handleClickOutside)
  })
</script>

<!-- Only show if user has NDVI permission or is using non-NDVI sources -->
{#if $userSettingsStore.NDVI || availableSources.length > 1}
  <div class="imagery-selector-container">
    <button
      class="imagery-selector-button"
      class:dropdown-open={dropdownOpen}
      on:click|stopPropagation={() => (dropdownOpen = !dropdownOpen)}
    >
      <span class="selector-icon">🛰️</span>
      <span class="selector-text">
        {IMAGERY_SOURCES[selectedImagerySource].name}
      </span>
      <span class="selector-arrow">▼</span>
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
    top: 20px;
    left: 300px;
    z-index: 1000;
  }

  .imagery-selector-button {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    background-color: white;
    border: 2px solid #e2e8f0;
    border-radius: 25px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 600;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    transition: all 0.3s ease;
    min-width: 200px;
    justify-content: space-between;
  }

  .imagery-selector-button:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    background-color: #f7fafc;
  }

  .imagery-selector-button.dropdown-open {
    border-color: #4299e1;
    background-color: #ebf8ff;
  }

  .selector-icon {
    font-size: 18px;
  }

  .selector-text {
    flex-grow: 1;
    text-align: left;
  }

  .selector-arrow {
    font-size: 10px;
    transition: transform 0.3s ease;
  }

  .dropdown-open .selector-arrow {
    transform: rotate(180deg);
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
  }

  .dropdown-item-description {
    font-size: 12px;
    color: #718096;
    line-height: 1.3;
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

  @media (max-width: 640px) {
    .imagery-selector-container {
      top: 10px;
      left: 10px;
    }

    .imagery-selector-button {
      padding: 8px 16px;
      font-size: 13px;
      min-width: 180px;
    }

    .selector-icon {
      font-size: 16px;
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
  }
</style>
