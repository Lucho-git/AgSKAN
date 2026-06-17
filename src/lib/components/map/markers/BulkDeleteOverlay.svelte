<!-- src/lib/components/map/markers/BulkDeleteOverlay.svelte
     Lasso draw → select markers → confirm bulk delete
-->
<script>
  import { onMount, onDestroy } from "svelte"
  import * as turf from "@turf/turf"
  import { bulkDeleteStore, confirmedMarkersStore } from "$lib/stores/markerStore"
  import { markerApi } from "$lib/api/markerApi"
  import { toast } from "svelte-sonner"
  import { Trash2, X } from "lucide-svelte"

  export let map

  const LASSO_SRC = "bulk-delete-lasso-source"
  const LASSO_FILL = "bulk-delete-lasso-fill"
  const LASSO_LINE = "bulk-delete-lasso-line"
  const DOTS_SRC = "bulk-delete-dots-source"
  const DOTS_LAYER = "bulk-delete-dots-layer"
  const DOTS_LABEL = "bulk-delete-dots-label"

  let drawing = false
  let touchPoints = []
  let mapListenersAttached = false
  let deleting = false

  $: phase = $bulkDeleteStore.phase
  $: selectedCount = $bulkDeleteStore.selectedMarkers.length

  function ensureSources() {
    if (!map) return
    if (!map.getSource(LASSO_SRC)) {
      map.addSource(LASSO_SRC, { type: "geojson", data: { type: "FeatureCollection", features: [] } })
    }
    if (!map.getSource(DOTS_SRC)) {
      map.addSource(DOTS_SRC, { type: "geojson", data: { type: "FeatureCollection", features: [] } })
    }
    if (!map.getLayer(LASSO_FILL)) {
      map.addLayer({ id: LASSO_FILL, type: "fill", source: LASSO_SRC, filter: ["==", "$type", "Polygon"], paint: { "fill-color": "#ef4444", "fill-opacity": 0.15 } })
    }
    if (!map.getLayer(LASSO_LINE)) {
      map.addLayer({ id: LASSO_LINE, type: "line", source: LASSO_SRC, paint: { "line-color": "#ef4444", "line-width": 2.5, "line-dasharray": [4, 3] } })
    }
    if (!map.getLayer(DOTS_LAYER)) {
      map.addLayer({ id: DOTS_LAYER, type: "circle", source: DOTS_SRC, paint: { "circle-radius": 8, "circle-color": "#ef4444", "circle-stroke-color": "#fff", "circle-stroke-width": 2 } })
    }
    if (!map.getLayer(DOTS_LABEL)) {
      map.addLayer({ id: DOTS_LABEL, type: "symbol", source: DOTS_SRC, layout: { "text-field": "✕", "text-size": 12, "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"], "text-offset": [0, 0] }, paint: { "text-color": "#fff" } })
    }
  }

  function cleanup() {
    drawing = false
    touchPoints = []
    detachMapListeners()
    try {
      if (map?.getSource(LASSO_SRC)) map.getSource(LASSO_SRC).setData({ type: "FeatureCollection", features: [] })
      if (map?.getSource(DOTS_SRC)) map.getSource(DOTS_SRC).setData({ type: "FeatureCollection", features: [] })
    } catch (e) { /* ignore */ }
    if (map) {
      map.dragPan?.enable()
      map.dragRotate?.enable()
    }
  }

  function attachMapListeners() {
    if (!map || mapListenersAttached) return
    map.on("mousedown", onPointerDown)
    map.on("touchstart", onPointerDown)
    mapListenersAttached = true
  }

  function detachMapListeners() {
    if (!map) return
    map.off("mousedown", onPointerDown)
    map.off("mousemove", onPointerMove)
    map.off("mouseup", onPointerUp)
    map.off("touchstart", onPointerDown)
    map.off("touchmove", onPointerMove)
    map.off("touchend", onPointerUp)
    mapListenersAttached = false
  }

  function onPointerDown(e) {
    if (!drawing) return
    e.preventDefault()
    map.dragPan.disable()
    map.dragRotate.disable()

    const lngLat = e.lngLat || (e.touches?.[0] && map.unproject([e.touches[0].clientX, e.touches[0].clientY]))
    if (!lngLat) return

    touchPoints = [[lngLat.lng, lngLat.lat]]
    updateLassoDisplay()
    map.on("mousemove", onPointerMove)
    map.on("touchmove", onPointerMove)
    map.on("mouseup", onPointerUp)
    map.on("touchend", onPointerUp)
  }

  function onPointerMove(e) {
    if (!drawing) return
    const lngLat = e.lngLat || (e.touches?.[0] && map.unproject([e.touches[0].clientX, e.touches[0].clientY]))
    if (!lngLat) return
    touchPoints = [...touchPoints, [lngLat.lng, lngLat.lat]]
    updateLassoDisplay()
  }

  function onPointerUp() {
    if (!drawing) return
    drawing = false
    map.dragPan.enable()
    map.dragRotate.enable()
    detachMapListeners()

    if (touchPoints.length >= 3) {
      const closed = [...touchPoints, touchPoints[0]]
      updateLassoFill(closed)
      processLasso(closed)
    } else {
      bulkDeleteStore.cancel()
    }
  }

  function updateLassoDisplay() {
    if (!map?.getSource(LASSO_SRC)) return
    map.getSource(LASSO_SRC).setData({
      type: "FeatureCollection",
      features: touchPoints.length >= 2 ? [{ type: "Feature", geometry: { type: "LineString", coordinates: touchPoints }, properties: {} }] : [],
    })
  }

  function updateLassoFill(closedRing) {
    if (!map?.getSource(LASSO_SRC)) return
    map.getSource(LASSO_SRC).setData({
      type: "FeatureCollection",
      features: [{ type: "Feature", geometry: { type: "Polygon", coordinates: [closedRing] }, properties: {} }],
    })
  }

  function processLasso(closedRing) {
    let polygon
    try { polygon = turf.polygon([closedRing]) } catch { bulkDeleteStore.cancel(); return }

    let allMarkers = []
    const mUnsub = confirmedMarkersStore.subscribe((m) => (allMarkers = m))
    mUnsub()

    const matching = (allMarkers || []).filter((m) => {
      if (!m.coordinates || m.coordinates.length !== 2) return false
      return turf.booleanPointInPolygon(turf.point(m.coordinates), polygon)
    })

    if (matching.length === 0) {
      bulkDeleteStore.cancel()
      return
    }

    showPreviewDots(matching)
    bulkDeleteStore.finishSelection(matching)
  }

  function showPreviewDots(markers) {
    ensureSources()
    const features = markers.map((m) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: m.coordinates },
      properties: {},
    }))
    map.getSource(DOTS_SRC).setData({ type: "FeatureCollection", features })
  }

  async function handleConfirmDelete() {
    deleting = true
    const markers = $bulkDeleteStore.selectedMarkers
    try {
      for (const m of markers) {
        await markerApi.deleteMarker(m.id)
      }
      // Remove from store
      confirmedMarkersStore.update((existing) => existing.filter((em) => !markers.some((dm) => dm.id === em.id)))
      toast.success(`Deleted ${markers.length} marker${markers.length !== 1 ? "s" : ""}`)
    } catch (e) {
      toast.error("Some markers could not be deleted")
    } finally {
      deleting = false
      bulkDeleteStore.reset()
      cleanup()
    }
  }

  function handleCancel() {
    bulkDeleteStore.reset()
    cleanup()
  }

  // Watch phase changes
  $: if (phase === "drawing") {
    ensureSources()
    drawing = true
    touchPoints = []
    attachMapListeners()
  } else if (phase === "idle") {
    cleanup()
  }

  // ── Cursor management (crosshair while drawing) ──
  $: if (map) {
    const canvas = map.getCanvas?.()
    if (canvas) {
      canvas.style.cursor = phase === "drawing" ? "crosshair" : ""
    }
  }

  onDestroy(() => {
    bulkDeleteStore.reset()
    cleanup()
  })
</script>

{#if phase === "drawing"}
  <div class="bd-overlay">
    <div class="bd-card drawing">
      <span class="bd-icon">✏️</span>
      <p class="bd-text">Draw around the markers you want to delete</p>
      <p class="bd-hint">Drag on the map to lasso an area</p>
      <button class="bd-btn cancel" on:click={handleCancel}>Cancel</button>
    </div>
  </div>
{/if}

{#if phase === "confirm"}
  <div class="bd-overlay">
    <div class="bd-card confirm">
      <span class="bd-icon"><Trash2 size={28} /></span>
      <p class="bd-text"><strong>{selectedCount}</strong> marker{selectedCount !== 1 ? "s" : ""} selected for deletion</p>
      <p class="bd-hint">This cannot be undone</p>
      <div class="bd-actions">
        <button class="bd-btn cancel" on:click={handleCancel}>Cancel</button>
        <button class="bd-btn danger" on:click={handleConfirmDelete} disabled={deleting}>
          {deleting ? "Deleting..." : `Delete ${selectedCount}`}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .bd-overlay {
    position: fixed;
    bottom: 100px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 30;
    pointer-events: auto;
  }
  .bd-card {
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(12px);
    border-radius: 16px;
    padding: 16px 24px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    min-width: 240px;
    color: #fff;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  }
  .bd-card.drawing { border: 1px solid rgba(255, 255, 255, 0.15); }
  .bd-card.confirm { border: 1px solid rgba(239, 68, 68, 0.4); }
  .bd-icon { font-size: 28px; line-height: 1; color: #ef4444; }
  .bd-text { font-size: 14px; font-weight: 500; }
  .bd-hint { font-size: 12px; color: rgba(255, 255, 255, 0.5); }
  .bd-actions { display: flex; gap: 10px; justify-content: center; }
  .bd-btn {
    border: none;
    border-radius: 10px;
    padding: 8px 18px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
  }
  .bd-btn.cancel { background: rgba(255, 255, 255, 0.15); color: #fff; }
  .bd-btn.cancel:hover { background: rgba(255, 255, 255, 0.25); }
  .bd-btn.danger { background: #ef4444; color: #fff; }
  .bd-btn.danger:hover { background: #dc2626; }
  .bd-btn:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
