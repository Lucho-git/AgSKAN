<!-- src/lib/components/map/overlays/FieldCandidateOverlay.svelte -->
<script>
  import { onDestroy } from "svelte"

  export let map
  export let candidates = null
  export let visible = false

  const sourceId = "field-candidates-source"
  const layerIds = {
    fill: "field-candidates-fill",
    lineCasing: "field-candidates-line-casing",
    line: "field-candidates-line",
  }
  let listeningForStyleData = false

  function canUseMap() {
    return !!(
      map &&
      map.getSource &&
      map.getLayer &&
      map.addSource &&
      map.addLayer
    )
  }

  function getBeforeId() {
    try {
      if (map.getLayer("fields-outline-selected"))
        return "fields-outline-selected"
      if (map.getLayer("fields-outline")) return "fields-outline"
    } catch (_) {}
    return undefined
  }

  function emptyCollection() {
    return { type: "FeatureCollection", features: [] }
  }

  function getCandidateData() {
    if (!visible || !candidates?.features?.length) return emptyCollection()
    return candidates
  }

  function initializeLayers() {
    if (!canUseMap()) return false

    try {
      if (!map.getSource(sourceId)) {
        map.addSource(sourceId, {
          type: "geojson",
          data: emptyCollection(),
        })
      }

      const beforeId = getBeforeId()

      if (!map.getLayer(layerIds.fill)) {
        map.addLayer(
          {
            id: layerIds.fill,
            type: "fill",
            source: sourceId,
            filter: ["==", "$type", "Polygon"],
            paint: {
              "fill-color": "#22d3ee",
              "fill-opacity": 0.32,
            },
          },
          beforeId,
        )
      }

      if (!map.getLayer(layerIds.lineCasing)) {
        map.addLayer(
          {
            id: layerIds.lineCasing,
            type: "line",
            source: sourceId,
            filter: ["==", "$type", "Polygon"],
            layout: {
              "line-cap": "round",
              "line-join": "round",
            },
            paint: {
              "line-color": "#0f172a",
              "line-width": 6,
              "line-opacity": 0.85,
            },
          },
          beforeId,
        )
      }

      if (!map.getLayer(layerIds.line)) {
        map.addLayer(
          {
            id: layerIds.line,
            type: "line",
            source: sourceId,
            filter: ["==", "$type", "Polygon"],
            layout: {
              "line-cap": "round",
              "line-join": "round",
            },
            paint: {
              "line-color": "#ffffff",
              "line-width": 3.2,
              "line-opacity": 1,
            },
          },
          beforeId,
        )
      }

      return true
    } catch (error) {
      console.error("Error initializing field candidate overlay:", error)
      return false
    }
  }

  function renderCandidates() {
    if (!visible) {
      cleanupLayers()
      return
    }
    if (!initializeLayers()) return

    try {
      map.getSource(sourceId).setData(getCandidateData())
    } catch (error) {
      console.error("Error rendering field candidates:", error)
    }
  }

  function handleStyleData() {
    renderCandidates()
  }

  function attachStyleListener() {
    if (listeningForStyleData) return
    map?.on?.("styledata", handleStyleData)
    listeningForStyleData = true
  }

  function detachStyleListener() {
    if (!listeningForStyleData) return
    map?.off?.("styledata", handleStyleData)
    listeningForStyleData = false
  }

  function cleanupLayers() {
    if (!map?.getLayer || !map?.getSource) return

    Object.values(layerIds).forEach((layerId) => {
      try {
        if (map.getLayer(layerId)) map.removeLayer(layerId)
      } catch (error) {
        console.warn(
          `Error removing field candidate overlay layer ${layerId}:`,
          error,
        )
      }
    })

    try {
      if (map.getSource(sourceId)) map.removeSource(sourceId)
    } catch (error) {
      console.warn("Error removing field candidate overlay source:", error)
    }
  }

  $: if (map && visible !== undefined && candidates !== undefined) {
    attachStyleListener()
    renderCandidates()
  }

  onDestroy(() => {
    detachStyleListener()
    cleanupLayers()
  })
</script>
