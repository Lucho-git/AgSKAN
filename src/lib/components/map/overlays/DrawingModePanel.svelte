<!-- src/lib/components/map/overlays/DrawingModePanel.svelte -->
<script>
  import { markerDrawingStore } from "$lib/stores/markerDrawingStore"
  import { supabase } from "$lib/supabaseClient"
  import { profileStore } from "$lib/stores/profileStore"
  import { Square, Pen, X, Check } from "lucide-svelte"
  import DrawingStyleEditor from "./DrawingStyleEditor.svelte"
  import { pendingDrawingSelection } from "$lib/stores/markerDrawingSelectionStore"

  export let map
  export let onComplete = () => {}
  export let onCancel = () => {}

  $: isActive = $markerDrawingStore.isActive
  $: mode = $markerDrawingStore.mode
  $: markerName = $markerDrawingStore.markerName || "Marker"
  $: points = $markerDrawingStore.points
  $: minPoints = mode === "area" ? 3 : 2
  $: canSave = points.length >= minPoints

  // Style editor state
  let showStyleEditor = false
  let pendingDrawing = null

  function handleCancel() {
    const markerId = $markerDrawingStore.markerId
    markerDrawingStore.cancel()
    showStyleEditor = false
    pendingDrawing = null
    dispatchDrawingFlowComplete(markerId, false)
    onCancel()
  }

  async function handleComplete() {
    if (!canSave) return

    const finalState = markerDrawingStore.complete()

    // Build geometry
    let geometry
    if (finalState.mode === "area") {
      const closedPoints = [...finalState.points, finalState.points[0]]
      geometry = {
        type: "Polygon",
        coordinates: [closedPoints],
      }
    } else {
      geometry = {
        type: "LineString",
        coordinates: finalState.points,
      }
    }

    // Store pending drawing data with CORRECT defaults
    pendingDrawing = {
      id: crypto.randomUUID(), // Temporary ID for preview
      marker_id: finalState.markerId,
      master_map_id: finalState.masterMapId,
      drawing_type: finalState.mode === "area" ? "polygon" : "line",
      geometry: geometry,
      style: {
        fillColor: finalState.color,
        strokeColor: finalState.color,
        fillOpacity: 0.5,
        strokeWidth: 3,
        strokeStyle: "solid",
      },
    }

    // Show style editor instead of saving immediately
    showStyleEditor = true
  }

  async function handleStyleSave(styleData) {
    if (!pendingDrawing) return

    // Update style with user choices
    const finalStyle = {
      ...pendingDrawing.style,
      ...(styleData.detail || styleData),
    }

    console.log("💾 Saving drawing with style:", finalStyle)

    // Convert GeoJSON to WKT for PostGIS
    const geometryWKT = convertGeoJSONToWKT(pendingDrawing.geometry)

    console.log("🗺️ Geometry WKT:", geometryWKT)

    const { data, error } = await supabase.rpc("insert_marker_drawing", {
      p_marker_id: pendingDrawing.marker_id,
      p_master_map_id: pendingDrawing.master_map_id,
      p_drawing_type: pendingDrawing.drawing_type,
      p_geometry_wkt: geometryWKT,
      p_style: finalStyle,
      p_user_id: $profileStore.id,
    })

    if (error) {
      console.error("Error saving drawing:", error)
    } else {
      console.log("✅ Drawing saved with custom style:", data)

      window.dispatchEvent(
        new CustomEvent("marker-drawing-created", {
          detail: {
            markerId: pendingDrawing.marker_id,
            drawingId: data,
          },
        }),
      )

      // Auto-select the fresh drawing so the marker menu highlights it
      // (DrawingPanel consumes this once its list includes the drawing).
      pendingDrawingSelection.set({
        markerId: pendingDrawing.marker_id,
        drawingId: data,
      })
    }

    // Reset state
    const markerId = pendingDrawing.marker_id
    showStyleEditor = false
    pendingDrawing = null
    dispatchDrawingFlowComplete(markerId, true)
    onComplete()
  }

  function handleStyleCancel() {
    const markerId = pendingDrawing?.marker_id
    showStyleEditor = false
    pendingDrawing = null
    dispatchDrawingFlowComplete(markerId, false)
    onCancel()
  }

  function dispatchDrawingFlowComplete(markerId, saved) {
    if (!markerId) return

    window.dispatchEvent(
      new CustomEvent("marker-drawing-flow-complete", {
        detail: { markerId, saved },
      }),
    )
  }

  function convertGeoJSONToWKT(geometry) {
    if (geometry.type === "Polygon") {
      const coords = geometry.coordinates[0]
        .map((coord) => `${coord[0]} ${coord[1]}`)
        .join(", ")
      return `POLYGON((${coords}))`
    } else if (geometry.type === "LineString") {
      const coords = geometry.coordinates
        .map((coord) => `${coord[0]} ${coord[1]}`)
        .join(", ")
      return `LINESTRING(${coords})`
    }
    return null
  }
</script>

{#if showStyleEditor && pendingDrawing}
  <DrawingStyleEditor
    {map}
    drawing={pendingDrawing}
    onSave={handleStyleSave}
    onCancel={handleStyleCancel}
  />
{:else if isActive}
  <div class="drawing-mode-panel">
    <div class="drawing-mode-header">
      <div class="drawing-mode-info">
        <div class="drawing-icon">
          {#if mode === "area"}
            <Square size={24} />
          {:else}
            <Pen size={24} />
          {/if}
        </div>
        <div class="drawing-text">
          <span class="drawing-title"
            >Drawing {mode === "area" ? "Area" : "Line"}</span
          >
          <span class="drawing-marker">for {markerName}</span>
        </div>
      </div>

      <div class="drawing-actions">
        <button class="cancel-btn" on:click={handleCancel}>
          <X size={18} />
          <span class="btn-text">Cancel</span>
        </button>

        <button
          class="confirm-btn"
          class:disabled={!canSave}
          on:click={handleComplete}
          disabled={!canSave}
        >
          <Check size={18} />
          <span class="btn-text">Next</span>
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .drawing-mode-panel {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: rgba(0, 0, 0, 0.95);
    backdrop-filter: blur(16px);
    color: white;
    z-index: 1000;
    border-top: 1px solid rgba(168, 85, 247, 0.5);
    animation: agskan-slideUp 0.3s ease-out;
  }

  @keyframes agskan-slideUp {
    from {
      transform: translateY(100%);
    }
    to {
      transform: translateY(0);
    }
  }

  .drawing-mode-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 20px;
    min-height: 64px;
  }

  .drawing-mode-info {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .drawing-icon {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(168, 85, 247, 0.2);
    border-radius: 50%;
    color: #a855f7;
  }

  .drawing-text {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .drawing-title {
    font-size: 16px;
    font-weight: 600;
    color: white;
  }

  .drawing-marker {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.6);
  }

  .drawing-actions {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .cancel-btn,
  .confirm-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    border: none;
    border-radius: 999px;
    min-height: 44px;
    padding: 10px 16px;
    cursor: pointer;
    transition:
      background 0.15s ease,
      border-color 0.15s ease,
      transform 0.06s ease;
    font-size: 13px;
    font-weight: 700;
    touch-action: manipulation;
    white-space: nowrap;
  }

  .cancel-btn {
    background: rgba(239, 68, 68, 0.16);
    border: 1.5px solid rgba(248, 113, 113, 0.85);
    color: #fecaca;
  }

  .cancel-btn:hover {
    background: rgba(239, 68, 68, 0.3);
    color: #fff;
  }

  /* Primary action — solid fill so it reads clearly in sunlight. */
  .confirm-btn {
    background: #16a34a;
    border: 1.5px solid #86efac;
    color: #fff;
  }

  .confirm-btn:hover:not(.disabled) {
    background: #15803d;
  }

  .cancel-btn:active,
  .confirm-btn:active:not(.disabled) {
    transform: scale(0.98);
  }

  .confirm-btn.disabled {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.18);
    color: rgba(255, 255, 255, 0.4);
    cursor: not-allowed;
  }

  @media (max-width: 768px) {
    .drawing-mode-panel {
      padding-bottom: env(safe-area-inset-bottom);
    }

    .drawing-mode-header {
      flex-direction: column;
      align-items: stretch;
      gap: 10px;
      padding: 12px 14px;
      min-height: 0;
    }

    .drawing-icon {
      width: 38px;
      height: 38px;
    }

    .drawing-title {
      font-size: 16px;
    }

    .drawing-marker {
      font-size: 13px;
    }

    .drawing-actions {
      gap: 10px;
    }

    /* Big, labelled, thumb-sized buttons — the labels stay visible so the
       actions are never a guess. */
    .cancel-btn,
    .confirm-btn {
      flex: 1;
      min-height: 52px;
      padding: 12px 16px;
      font-size: 15px;
      gap: 9px;
    }
  }

  @media (max-width: 480px) {
    .cancel-btn,
    .confirm-btn {
      min-height: 56px;
      font-size: 16px;
    }
  }
</style>
