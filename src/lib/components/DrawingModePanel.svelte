<script>
  import { markerDrawingStore } from "$lib/stores/markerDrawingStore"
  import { supabase } from "$lib/supabaseClient"
  import { profileStore } from "$lib/stores/profileStore"
  import { Square, Pen, X, Check } from "lucide-svelte"
  import DrawingStyleEditor from "./DrawingStyleEditor.svelte"

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
    markerDrawingStore.cancel()
    showStyleEditor = false
    pendingDrawing = null
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
        fillOpacity: 0.3,
        strokeWidth: 3,
        strokeStyle: "dashed",
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
    }

    // Reset state
    showStyleEditor = false
    pendingDrawing = null
    onComplete()
  }

  function handleStyleCancel() {
    showStyleEditor = false
    pendingDrawing = null
    // Don't call onComplete - go back to drawing mode
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
    animation: slideUp 0.3s ease-out;
  }

  @keyframes slideUp {
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
    padding: 20px 24px;
    min-height: 80px;
  }

  .drawing-mode-info {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .drawing-icon {
    width: 48px;
    height: 48px;
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
    font-size: 18px;
    font-weight: 600;
    color: white;
  }

  .drawing-marker {
    font-size: 14px;
    color: rgba(255, 255, 255, 0.6);
  }

  .drawing-actions {
    display: flex;
    gap: 10px;
    align-items: center;
  }

  .cancel-btn,
  .confirm-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    border: none;
    border-radius: 8px;
    padding: 10px 16px;
    cursor: pointer;
    transition: all 0.2s ease;
    font-size: 14px;
    font-weight: 500;
  }

  .cancel-btn {
    background: rgba(239, 68, 68, 0.2);
    border: 1px solid rgba(239, 68, 68, 0.4);
    color: #ef4444;
  }

  .cancel-btn:hover {
    background: rgba(239, 68, 68, 0.3);
    color: white;
    transform: scale(1.05);
  }

  .confirm-btn {
    background: rgba(34, 197, 94, 0.2);
    border: 1px solid rgba(34, 197, 94, 0.4);
    color: #22c55e;
  }

  .confirm-btn:hover:not(.disabled) {
    background: rgba(34, 197, 94, 0.3);
    color: white;
    transform: scale(1.05);
  }

  .confirm-btn.disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  @media (max-width: 768px) {
    .drawing-mode-header {
      padding: 16px 20px;
      min-height: 72px;
    }

    .drawing-icon {
      width: 44px;
      height: 44px;
    }

    .drawing-title {
      font-size: 16px;
    }

    .drawing-marker {
      font-size: 13px;
    }

    .drawing-actions {
      gap: 8px;
    }

    .btn-text {
      display: none;
    }

    .cancel-btn,
    .confirm-btn {
      padding: 10px;
      width: 44px;
      height: 44px;
      justify-content: center;
    }
  }

  @media (max-width: 480px) {
    .cancel-btn,
    .confirm-btn {
      width: 40px;
      height: 40px;
      padding: 8px;
    }
  }
</style>
