<script>
  import { markerDrawingStore } from "$lib/stores/markerDrawingStore"
  import { supabase } from "$lib/supabaseClient"
  import { Square, Pen, X, Check } from "lucide-svelte"

  export let map
  export let onComplete = () => {}
  export let onCancel = () => {}

  // Subscribe to drawing store
  $: isActive = $markerDrawingStore.isActive
  $: mode = $markerDrawingStore.mode
  $: markerName = $markerDrawingStore.markerName || "Marker"
  $: points = $markerDrawingStore.points
  $: minPoints = mode === "area" ? 3 : 2
  $: canSave = points.length >= minPoints

  function handleCancel() {
    markerDrawingStore.cancel()
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

    // Save to database
    const drawingData = {
      marker_id: finalState.markerId,
      master_map_id: finalState.masterMapId,
      drawing_type: finalState.mode === "area" ? "polygon" : "line",
      geometry: geometry,
      style: {
        fillColor: finalState.color,
        strokeColor: finalState.color,
        fillOpacity: 0.3,
        strokeWidth: 2,
      },
      created_at: new Date().toISOString(),
    }

    const { data, error } = await supabase
      .from("marker_drawings")
      .insert([drawingData])
      .select() // 👈 Get the inserted drawing back

    if (error) {
      console.error("Error saving drawing:", error)
    } else {
      console.log("✅ Drawing saved successfully:", data)
      // The realtime subscription in MarkerDrawings component will pick this up
    }

    onComplete() // 👈 This triggers the DrawingPanel to reload
  }
</script>

{#if isActive}
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
          <span class="btn-text">Confirm</span>
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

  /* Mobile - Icons only */
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

  /* Small mobile */
  @media (max-width: 480px) {
    .cancel-btn,
    .confirm-btn {
      width: 40px;
      height: 40px;
      padding: 8px;
    }
  }
</style>
