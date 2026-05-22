<!-- src/lib/components/map/overlays/FieldCandidateOverlay.svelte -->
<script>
  import { onDestroy } from "svelte"

  export let map
  export let candidates = null
  export let unionPreview = null
  export let visible = false

  const sourceId = "field-candidates-source"
  const previewSourceId = "field-candidates-union-preview-source"
  const layerIds = {
    fill: "field-candidates-fill",
    lineCasing: "field-candidates-line-casing",
    line: "field-candidates-line",
  }
  const previewLayerIds = {
    fill: "field-candidates-union-preview-fill",
    lineCasing: "field-candidates-union-preview-line-casing",
    line: "field-candidates-union-preview-line",
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

  function getUnionPreviewData() {
    if (!visible || !unionPreview?.features?.length) return emptyCollection()
    return unionPreview
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

      if (!map.getSource(previewSourceId)) {
        map.addSource(previewSourceId, {
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
              "fill-color": [
                "case",
                ["==", ["get", "resolving_boundary"], true],
                "#f59e0b",
                "#22d3ee",
              ],
              "fill-opacity": [
                "case",
                ["==", ["get", "resolving_boundary"], true],
                0.24,
                0.16,
              ],
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
              "line-width": 4,
              "line-opacity": 0.6,
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
              "line-color": [
                "case",
                ["==", ["get", "resolving_boundary"], true],
                "#fde68a",
                "#67e8f9",
              ],
              "line-width": 2.4,
              "line-opacity": 0.85,
              "line-dasharray": [2, 1.25],
            },
          },
          beforeId,
        )
      }

      if (!map.getLayer(previewLayerIds.fill)) {
        map.addLayer(
          {
            id: previewLayerIds.fill,
            type: "fill",
            source: previewSourceId,
            filter: ["==", "$type", "Polygon"],
            paint: {
              "fill-color": "#22c55e",
              "fill-opacity": 0.22,
            },
          },
          beforeId,
        )
      }

      if (!map.getLayer(previewLayerIds.lineCasing)) {
        map.addLayer(
          {
            id: previewLayerIds.lineCasing,
            type: "line",
            source: previewSourceId,
            filter: ["==", "$type", "Polygon"],
            layout: {
              "line-cap": "round",
              "line-join": "round",
            },
            paint: {
              "line-color": "#052e16",
              "line-width": 7,
              "line-opacity": 0.9,
            },
          },
          beforeId,
        )
      }

      if (!map.getLayer(previewLayerIds.line)) {
        map.addLayer(
          {
            id: previewLayerIds.line,
            type: "line",
            source: previewSourceId,
            filter: ["==", "$type", "Polygon"],
            layout: {
              "line-cap": "round",
              "line-join": "round",
            },
            paint: {
              "line-color": "#f0fdf4",
              "line-width": 3.6,
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
      map.getSource(previewSourceId).setData(getUnionPreviewData())
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
    ;[...Object.values(layerIds), ...Object.values(previewLayerIds)].forEach(
      (layerId) => {
        try {
          if (map.getLayer(layerId)) map.removeLayer(layerId)
        } catch (error) {
          console.warn(
            `Error removing field candidate overlay layer ${layerId}:`,
            error,
          )
        }
      },
    )

    try {
      if (map.getSource(sourceId)) map.removeSource(sourceId)
      if (map.getSource(previewSourceId)) map.removeSource(previewSourceId)
    } catch (error) {
      console.warn("Error removing field candidate overlay source:", error)
    }
  }

  $: if (map && visible !== undefined && candidates !== undefined) {
    attachStyleListener()
    renderCandidates()
  }

  $: if (map && visible && unionPreview !== undefined) {
    renderCandidates()
  }

  onDestroy(() => {
    detachStyleListener()
    cleanupLayers()
  })
</script>
