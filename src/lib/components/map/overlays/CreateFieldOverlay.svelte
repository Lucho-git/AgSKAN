<!-- src/lib/components/map/overlays/CreateFieldOverlay.svelte -->
<script>
  // @ts-nocheck
  import { onMount, onDestroy, createEventDispatcher } from "svelte"
  import * as turf from "@turf/turf"
  import {
    ArrowRight,
    Pencil,
    Plus,
    Search,
    Undo,
    X,
  } from "lucide-svelte"

  export let map
  export let farmName = ""
  /** Number of fields currently selected on the map (driven by parent). */
  export let selectionCount = 0
  /** Total hectares of the currently selected fields (driven by parent). */
  export let selectionHectares = 0
  /** Hectares after the selected geometries are merged into the saved boundary. */
  export let unifiedSelectionHectares = 0
  /** Hectares hidden by overlap between selected geometries. */
  export let overlapHectares = 0
  /** True when area/dissolve is deferred for a complex grouped selection. */
  export let selectionAreaPending = false
  /** True while a clicked FTW boundary is being resolved in the background. */
  export let selectionResolving = false
  /** Number of polygon parts in the live merged preview. */
  export let unifiedPartCount = 0
  /** When true, this overlay was opened from the review panel (Add Area). */
  export let returnsToReview = false
  /** Initial tab to open on. Allows the parent to remember the last tab. */
  export let initialTab = "select"

  const dispatch = createEventDispatcher()

  const sourceId = "create-field-draft-source"
  const layerIds = {
    fill: "create-field-draft-fill",
    lineCasing: "create-field-draft-line-casing",
    line: "create-field-draft-line",
    latestPreview: "create-field-draft-latest-preview",
    startPreview: "create-field-draft-start-preview",
    points: "create-field-draft-points",
  }

  let tab = initialTab === "draw" ? "draw" : "select"
  let points = []

  $: hasEnoughPoints = points.length >= 3
  $: canConfirmSelect =
    tab === "select" && selectionCount > 0 && !selectionResolving
  $: canConfirmDraw = tab === "draw" && hasEnoughPoints
  $: formattedTotalHa = formatArea(selectionHectares)
  $: formattedUnifiedHa = formatArea(
    unifiedSelectionHectares || selectionHectares,
  )
  $: formattedOverlapHa = formatArea(overlapHectares)
  $: hasSelectionOverlap = selectionCount > 1 && overlapHectares > 0.01
  // Reactive area: recomputes synchronously as soon as `points` or `tab` change.
  $: currentArea =
    tab === "draw" && points.length >= 3
      ? getPolygonArea(buildPolygonBoundary())
      : { hectares: 0, squareMeters: 0 }
  $: formattedDrawHa = formatArea(currentArea.hectares)

  function formatArea(hectares) {
    return `${Math.round((hectares || 0) * 100) / 100} ha`
  }

  function closeRing(coords) {
    if (!coords?.length) return []
    const ring = [...coords]
    const first = ring[0]
    const last = ring[ring.length - 1]
    if (first[0] !== last[0] || first[1] !== last[1]) ring.push(first)
    return ring
  }

  function buildPolygonBoundary() {
    return {
      type: "Polygon",
      coordinates: [closeRing(points)],
    }
  }

  function getPolygonArea(boundary) {
    try {
      const squareMeters = turf.area(boundary)
      return {
        squareMeters: Math.round(squareMeters),
        hectares: Math.round((squareMeters / 10000) * 100) / 100,
      }
    } catch (error) {
      return { hectares: 0, squareMeters: 0 }
    }
  }

  function canUseMap() {
    return !!(
      map &&
      map.getSource &&
      map.addSource &&
      map.getLayer &&
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

  function initializeLayers() {
    if (!canUseMap()) return false

    try {
      if (!map.getSource(sourceId)) {
        map.addSource(sourceId, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
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
              "fill-color": "#0ea5e9",
              "fill-opacity": 0.22,
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
            filter: [
              "all",
              ["==", "$type", "LineString"],
              ["==", "draftRole", "main"],
            ],
            layout: { "line-cap": "round", "line-join": "round" },
            paint: {
              "line-color": "#0f172a",
              "line-width": 7,
              "line-opacity": 0.55,
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
            filter: [
              "all",
              ["==", "$type", "LineString"],
              ["==", "draftRole", "main"],
            ],
            layout: { "line-cap": "round", "line-join": "round" },
            paint: {
              "line-color": "#0ea5e9",
              "line-width": 4,
            },
          },
          beforeId,
        )
      }

      if (!map.getLayer(layerIds.latestPreview)) {
        map.addLayer(
          {
            id: layerIds.latestPreview,
            type: "line",
            source: sourceId,
            filter: [
              "all",
              ["==", "$type", "LineString"],
              ["==", "draftRole", "latestPreview"],
            ],
            layout: { "line-cap": "round", "line-join": "round" },
            paint: {
              "line-color": "#f8fafc",
              "line-width": 4.5,
              "line-opacity": 0.6,
            },
          },
          beforeId,
        )
      }

      if (!map.getLayer(layerIds.startPreview)) {
        map.addLayer(
          {
            id: layerIds.startPreview,
            type: "line",
            source: sourceId,
            filter: [
              "all",
              ["==", "$type", "LineString"],
              ["==", "draftRole", "startPreview"],
            ],
            layout: { "line-cap": "round", "line-join": "round" },
            paint: {
              "line-color": "#ffffff",
              "line-width": 4,
              "line-opacity": 0.55,
              "line-dasharray": [2, 2],
            },
          },
          beforeId,
        )
      }

      if (!map.getLayer(layerIds.points)) {
        map.addLayer(
          {
            id: layerIds.points,
            type: "circle",
            source: sourceId,
            filter: ["==", "$type", "Point"],
            paint: {
              "circle-radius": 5,
              "circle-color": "#0ea5e9",
              "circle-stroke-color": "#fff",
              "circle-stroke-width": 2,
            },
          },
          beforeId,
        )
      }

      return true
    } catch (error) {
      console.error("Error initializing create-field overlay layers:", error)
      return false
    }
  }

  function updateDisplay() {
    if (!map || !map.getSource(sourceId)) return

    const features = []
    const center = map.getCenter()

    points.forEach((point, index) => {
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: point },
        properties: { index },
      })
    })

    if (tab === "draw" && points.length >= 2) {
      features.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: points },
        properties: { draftRole: "main" },
      })
    }

    if (tab === "draw" && points.length >= 1) {
      features.push({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [points[points.length - 1], [center.lng, center.lat]],
        },
        properties: { draftRole: "latestPreview" },
      })
    }

    if (tab === "draw" && points.length >= 2) {
      features.push({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [points[0], [center.lng, center.lat]],
        },
        properties: { draftRole: "startPreview" },
      })
    }

    if (tab === "draw" && points.length >= 3) {
      const boundary = buildPolygonBoundary()
      features.push({
        type: "Feature",
        geometry: boundary,
        properties: { draftRole: "fill" },
      })
    }

    try {
      map.getSource(sourceId).setData({
        type: "FeatureCollection",
        features,
      })
    } catch (error) {
      console.warn("Error updating create-field overlay data:", error)
    }
  }

  function renderDraft() {
    if (initializeLayers()) updateDisplay()
  }

  function cleanupLayers() {
    if (!map?.getLayer || !map?.getSource) return

    Object.values(layerIds).forEach((id) => {
      try {
        if (map.getLayer(id)) map.removeLayer(id)
      } catch (error) {
        console.warn(`Error removing create-field layer ${id}:`, error)
      }
    })

    try {
      if (map.getSource(sourceId)) map.removeSource(sourceId)
    } catch (error) {
      console.warn("Error removing create-field source:", error)
    }
  }

  function handleStyleData() {
    renderDraft()
  }

  function handleMapMove() {
    if (tab === "draw" && points.length > 0) renderDraft()
  }

  function setTab(nextTab) {
    if (nextTab === tab) return
    const previousTab = tab
    if (previousTab === "draw") {
      // leaving draw → clear in-progress points
      points = []
    }
    if (previousTab === "select") {
      // leaving select → clear current selection state in parent
      dispatch("clearSelection")
    }
    tab = nextTab
    console.log("[CreateField] tab change", { from: previousTab, to: nextTab })
    dispatch("tabChange", { tab: nextTab, previous: previousTab })
    renderDraft()
  }

  function addPoint() {
    if (!map || tab !== "draw") return
    const center = map.getCenter()
    points = [...points, [center.lng, center.lat]]
  }

  function undoPoint() {
    if (tab !== "draw" || points.length === 0) return
    points = points.slice(0, -1)
  }

  function handleCancel() {
    dispatch("cancel")
  }

  function handleClearSelection() {
    if (selectionCount <= 0) return
    dispatch("clearSelection")
  }

  function handleConfirm() {
    if (tab === "select") {
      if (!canConfirmSelect) return
      dispatch("confirmSelect")
      return
    }
    if (tab === "draw") {
      if (!canConfirmDraw) return
      const boundary = buildPolygonBoundary()
      const area = getPolygonArea(boundary)
      dispatch("confirmDraw", { boundary, area })
    }
  }

  onMount(() => {
    if (!map) return
    console.log("[CreateField] mount", {
      farmName,
      tab,
      returnsToReview,
    })
    if (map.isStyleLoaded?.()) renderDraft()
    map.on("styledata", handleStyleData)
    map.on("move", handleMapMove)
    // Announce the initial tab so the parent can configure tile visibility.
    dispatch("tabChange", { tab, previous: null })
  })

  onDestroy(() => {
    if (map?.off) {
      map.off("styledata", handleStyleData)
      map.off("move", handleMapMove)
    }
    cleanupLayers()
  })

  $: if (map && (tab || points)) renderDraft()
</script>

<!-- Top mode bar -->
<div class="mode-bar">
  <button
    class="mode-bar-btn cancel"
    on:click={handleCancel}
    title={returnsToReview ? "Back to review" : "Cancel"}
    aria-label="Cancel"
  >
    <X size={18} />
  </button>

  <div class="mode-bar-divider"></div>

  <button
    class="mode-bar-btn tab"
    class:active={tab === "select"}
    on:click={() => setTab("select")}
    title="Select existing fields"
    aria-label="Select existing fields"
  >
    <Search size={18} />
    <span>Select</span>
  </button>

  <button
    class="mode-bar-btn tab"
    class:active={tab === "draw"}
    on:click={() => setTab("draw")}
    title="Draw a new field"
    aria-label="Draw a new field"
  >
    <Pencil size={18} />
    <span>Draw</span>
  </button>
</div>

{#if tab === "draw"}
  <div class="crosshair-overlay" aria-hidden="true">
    <div class="crosshair">
      <div class="crosshair-line horizontal"></div>
      <div class="crosshair-line vertical"></div>
      <div class="crosshair-center"></div>
    </div>
  </div>

  <div class="draw-controls">
    <button
      class="point-btn secondary"
      class:disabled={points.length === 0}
      on:click={undoPoint}
      disabled={points.length === 0}
      title="Remove last point"
    >
      <Undo size={18} />
      <span>Undo</span>
    </button>
    <button
      class="point-btn primary"
      on:click={addPoint}
      title={points.length === 0 ? "Place starting point" : "Add point"}
    >
      <Plus size={20} />
      <span>{points.length === 0 ? "Start" : "Add"}</span>
    </button>
  </div>
{/if}

<!-- Bottom action bar -->
<div class="action-bar">
  {#if tab === "select"}
    <div class="action-bar-copy">
      <strong>
        Continue with {selectionCount} selected field{selectionCount === 1
          ? ""
          : "s"}
      </strong>
      {#if selectionCount > 0 && selectionResolving}
        <span>Resolving boundary...</span>
      {:else if selectionCount > 0 && selectionAreaPending}
        <span>Area calculated on continue</span>
      {:else if selectionCount > 0}
        <span>
          Unified area: {formattedUnifiedHa}{hasSelectionOverlap
            ? ` (${formattedOverlapHa} overlap removed)`
            : unifiedPartCount > 1
              ? ` (${unifiedPartCount} parts)`
              : ""}
        </span>
      {:else}
        <span>Total area: {formattedTotalHa}</span>
      {/if}
    </div>
    {#if selectionCount > 0}
      <button
        class="action-bar-clear"
        on:click={handleClearSelection}
        title="Clear selected fields"
        aria-label="Clear selected fields"
      >
        <X size={18} />
      </button>
    {/if}
    <button
      class="action-bar-confirm"
      class:disabled={!canConfirmSelect}
      on:click={handleConfirm}
      disabled={!canConfirmSelect}
      title={canConfirmSelect
        ? "Continue"
        : selectionResolving
          ? "Boundary is still resolving"
          : "Tap a field on the map to select it"}
    >
      <ArrowRight size={20} />
    </button>
  {:else}
    <div class="action-bar-copy">
      <strong>
        {hasEnoughPoints ? "Finish field boundary" : "Place at least 3 points"}
      </strong>
      <span>Area: {formattedDrawHa}</span>
    </div>
    <button
      class="action-bar-confirm"
      class:disabled={!canConfirmDraw}
      on:click={handleConfirm}
      disabled={!canConfirmDraw}
      title={canConfirmDraw ? "Finish boundary" : "Place at least 3 points"}
    >
      <ArrowRight size={20} />
    </button>
  {/if}
</div>

<style>
  .mode-bar {
    position: fixed;
    top: max(env(safe-area-inset-top), 1rem);
    left: 50%;
    transform: translateX(-50%);
    z-index: 1002;
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.4rem 0.5rem;
    background: rgba(15, 23, 42, 0.92);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 9999px;
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.35);
    backdrop-filter: blur(10px);
  }

  .mode-bar-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.5rem 0.85rem;
    border-radius: 9999px;
    background: transparent;
    color: rgba(241, 245, 249, 0.85);
    border: none;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition:
      background 120ms ease,
      color 120ms ease;
  }

  .mode-bar-btn span {
    line-height: 1;
  }

  .mode-bar-btn.cancel {
    padding: 0.5rem;
    color: rgba(241, 245, 249, 0.85);
  }

  .mode-bar-btn.cancel:hover {
    background: rgba(248, 113, 113, 0.18);
    color: #fecaca;
  }

  .mode-bar-btn.tab.active {
    background: #0ea5e9;
    color: #0f172a;
  }

  .mode-bar-btn.tab:not(.active):hover {
    background: rgba(255, 255, 255, 0.08);
    color: #ffffff;
  }

  .mode-bar-divider {
    width: 1px;
    height: 1.6rem;
    background: rgba(255, 255, 255, 0.12);
    margin: 0 0.15rem;
  }

  /* On narrow viewports (typical phone widths) hide the tab text labels and
     keep just the search/draw icons, so the bar always fits on one line. */
  @media (max-width: 480px) {
    .mode-bar-btn.tab span {
      display: none;
    }
    .mode-bar-btn.tab {
      padding: 0.5rem;
    }
  }
  .mode-context {
    position: fixed;
    top: calc(max(env(safe-area-inset-top), 1rem) + 3.4rem);
    left: 50%;
    transform: translateX(-50%);
    z-index: 1001;
    padding: 0.3rem 0.7rem;
    background: rgba(15, 23, 42, 0.78);
    color: #e2e8f0;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 500;
    letter-spacing: 0.01em;
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.25);
  }

  .crosshair-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    pointer-events: none;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .crosshair {
    position: relative;
    width: 2rem;
    height: 2rem;
  }

  .crosshair-line {
    position: absolute;
    background: #ffffff;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.4);
  }

  .crosshair-line.horizontal {
    top: 50%;
    left: 0;
    right: 0;
    height: 2px;
    transform: translateY(-50%);
  }

  .crosshair-line.vertical {
    top: 0;
    bottom: 0;
    left: 50%;
    width: 2px;
    transform: translateX(-50%);
  }

  .crosshair-center {
    position: absolute;
    inset: 50% 50%;
    transform: translate(-50%, -50%);
    width: 0.55rem;
    height: 0.55rem;
    border-radius: 50%;
    background: #0ea5e9;
    box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.85);
  }

  .draw-controls {
    position: fixed;
    bottom: calc(env(safe-area-inset-bottom) + 6.5rem);
    left: 50%;
    transform: translateX(-50%);
    z-index: 1001;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem;
    background: rgba(15, 23, 42, 0.9);
    border-radius: 9999px;
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.35);
    backdrop-filter: blur(10px);
  }

  .point-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.55rem 1rem;
    border-radius: 9999px;
    border: none;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    color: #f8fafc;
    background: rgba(255, 255, 255, 0.08);
    transition:
      background 120ms ease,
      color 120ms ease,
      opacity 120ms ease;
  }

  .point-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.16);
  }

  .point-btn.primary {
    background: #0ea5e9;
    color: #0f172a;
  }

  .point-btn.primary:hover:not(:disabled) {
    background: #38bdf8;
  }

  .point-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .action-bar {
    position: fixed;
    left: 50%;
    transform: translateX(-50%);
    bottom: calc(env(safe-area-inset-bottom) + 1.25rem);
    z-index: 1001;
    width: min(92vw, 26rem);
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem 0.75rem 1.1rem;
    background: rgba(15, 23, 42, 0.92);
    color: #f8fafc;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 1.1rem;
    box-shadow: 0 18px 42px rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(10px);
  }

  .action-bar-copy {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
  }

  .action-bar-copy strong {
    font-size: 0.95rem;
    font-weight: 600;
    color: #f8fafc;
    line-height: 1.2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .action-bar-copy span {
    font-size: 0.8rem;
    color: rgba(241, 245, 249, 0.7);
  }

  .action-bar-confirm {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.75rem;
    height: 2.75rem;
    border-radius: 9999px;
    background: #0ea5e9;
    color: #0f172a;
    border: none;
    cursor: pointer;
    transition:
      background 120ms ease,
      transform 120ms ease,
      opacity 120ms ease;
  }

  .action-bar-clear {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.4rem;
    height: 2.4rem;
    flex: 0 0 2.4rem;
    border-radius: 9999px;
    background: rgba(248, 250, 252, 0.08);
    color: rgba(248, 250, 252, 0.86);
    border: 1px solid rgba(248, 250, 252, 0.12);
    cursor: pointer;
    transition:
      background 120ms ease,
      color 120ms ease,
      transform 120ms ease;
  }

  .action-bar-clear:hover {
    background: rgba(248, 113, 113, 0.18);
    color: #fecaca;
    transform: translateY(-1px);
  }

  .action-bar-confirm:hover:not(:disabled) {
    background: #38bdf8;
    transform: translateY(-1px);
  }

  .action-bar-confirm:disabled,
  .action-bar-confirm.disabled {
    background: rgba(148, 163, 184, 0.35);
    color: rgba(15, 23, 42, 0.5);
    cursor: not-allowed;
  }
</style>
