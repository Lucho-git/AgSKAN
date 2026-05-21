<!-- src/lib/components/map/overlays/DrawingPanel.svelte -->
<script>
  import { onMount } from "svelte"
  import { Square, Trash2, Spline, Edit2 } from "lucide-svelte"
  import area from "@turf/area"
  import length from "@turf/length"
  import { supabase } from "$lib/supabaseClient"
  import { profileStore } from "$lib/stores/profileStore"
  import { markerDrawingStore } from "$lib/stores/markerDrawingStore"
  import { markerVisibilityStore } from "$lib/stores/markerVisibilityStore"
  import { findMarkerByIconClass } from "$lib/data/markerDefinitions"
  import * as mapboxgl from "mapbox-gl"
  import DrawingStyleEditor from "./DrawingStyleEditor.svelte"

  export let map
  export let currentMarker
  export let getCurrentIconClass
  export let onStartDrawing = () => {}

  let savedDrawings = []
  let selectedDrawingId = null
  let drawingVisibility = "always"
  let showStyleEditor = false
  let editingDrawing = null

  $: isDrawingActive = $markerDrawingStore.isActive

  $: if (currentMarker?.id && $markerVisibilityStore) {
    drawingVisibility = $markerVisibilityStore[currentMarker.id] || "always"
    console.log(
      `👁️ Loaded visibility from store for marker ${currentMarker.id}: ${drawingVisibility}`,
    )
  }

  $: if (currentMarker?.id) {
    loadDrawingsForMarker()
  }

  export function refreshDrawings() {
    loadDrawingsForMarker()
  }

  export function triggerDrawing(mode) {
    startDrawing(mode)
  }

  export function getSavedCount() {
    return savedDrawings.length
  }

  onMount(() => {
    const handleDrawingCreated = (event) => {
      if (event.detail?.markerId === currentMarker?.id) {
        loadDrawingsForMarker()
      }
    }

    window.addEventListener("marker-drawing-created", handleDrawingCreated)

    return () => {
      window.removeEventListener("marker-drawing-created", handleDrawingCreated)
    }
  })

  async function loadDrawingsForMarker() {
    if (!currentMarker?.id) return

    const { data, error } = await supabase
      .from("marker_drawings")
      .select("*, geometry:geometry_geojson")
      .eq("marker_id", currentMarker.id)
      .or("deleted.is.null,deleted.eq.false")
      .order("created_at", { ascending: false })

    if (!error && data) {
      // 👇 Parse geometry_geojson if it's a string
      savedDrawings = data
        .map((d) => {
          let parsedGeometry = d.geometry

          // If geometry is a string, parse it
          if (typeof d.geometry === "string") {
            try {
              parsedGeometry = JSON.parse(d.geometry)
            } catch (e) {
              console.error("Failed to parse geometry for drawing:", d.id, e)
              return null
            }
          }

          return {
            ...d,
            geometry: parsedGeometry,
          }
        })
        .filter((d) => d !== null)

      console.log(
        `📐 Loaded ${savedDrawings.length} drawings for marker ${currentMarker.id}`,
      )
      console.log(
        "📐 Sample saved drawing geometry:",
        savedDrawings[0]?.geometry,
      )
    } else if (error) {
      console.error("Error loading drawings:", error)
    }
  }

  function startDrawing(mode) {
    const iconClass = getCurrentIconClass(currentMarker.id)
    const marker = findMarkerByIconClass(iconClass)
    const markerName = marker?.name || "Marker"

    markerDrawingStore.startDrawing(
      currentMarker.id,
      $profileStore.master_map_id,
      mode,
      $markerDrawingStore.color,
      markerName,
    )

    onStartDrawing()
  }

  function selectDrawing(drawingId) {
    const wasSelected = selectedDrawingId === drawingId
    selectedDrawingId = wasSelected ? null : drawingId

    // Zoom to drawing when selected
    if (!wasSelected) {
      const drawing = savedDrawings.find((d) => d.id === drawingId)
      if (drawing) {
        zoomToDrawing(drawing)
      }
    }
  }

  function zoomToDrawing(drawing) {
    if (!map || !drawing.geometry) return

    try {
      const bounds = new mapboxgl.LngLatBounds()

      if (drawing.geometry.type === "Polygon") {
        drawing.geometry.coordinates[0].forEach((coord) => {
          bounds.extend(coord)
        })
      } else if (drawing.geometry.type === "LineString") {
        drawing.geometry.coordinates.forEach((coord) => {
          bounds.extend(coord)
        })
      }

      map.fitBounds(bounds, {
        padding: { top: 100, bottom: 400, left: 50, right: 50 },
        duration: 800,
      })

      console.log("📍 Zoomed to drawing:", drawing.id)
    } catch (error) {
      console.error("Error zooming to drawing:", error)
    }
  }

  function editDrawing(drawingId, event) {
    event.stopPropagation()
    const drawing = savedDrawings.find((d) => d.id === drawingId)
    if (drawing) {
      editingDrawing = drawing
      showStyleEditor = true
      zoomToDrawing(drawing)
    }
  }

  async function handleStyleEditorSave(styleData) {
    if (!editingDrawing) return

    const updatedStyle = {
      ...editingDrawing.style,
      ...(styleData.detail || styleData),
    }

    const { error } = await supabase
      .from("marker_drawings")
      .update({
        style: updatedStyle,
        updated_at: new Date().toISOString(),
        update_user_id: $profileStore.id,
      })
      .eq("id", editingDrawing.id)

    if (!error) {
      console.log("✅ Drawing style updated:", editingDrawing.id)

      // Refresh drawings
      await loadDrawingsForMarker()

      // Trigger map refresh
      window.dispatchEvent(
        new CustomEvent("marker-drawing-created", {
          detail: {
            markerId: editingDrawing.marker_id,
            drawingId: editingDrawing.id,
          },
        }),
      )
    } else {
      console.error("Error updating drawing style:", error)
    }

    showStyleEditor = false
    editingDrawing = null
  }

  function handleStyleEditorCancel() {
    showStyleEditor = false
    editingDrawing = null
  }

  async function deleteDrawing(drawingId, event) {
    event.stopPropagation()

    const { error } = await supabase
      .from("marker_drawings")
      .update({
        deleted: true,
        deleted_at: new Date().toISOString(),
        update_user_id: $profileStore.id,
      })
      .eq("id", drawingId)

    if (!error) {
      savedDrawings = savedDrawings.filter((d) => d.id !== drawingId)
      if (selectedDrawingId === drawingId) {
        selectedDrawingId = null
      }
      console.log("🗑️ Drawing deleted:", drawingId)
    }
  }

  async function toggleVisibility(mode) {
    const previousVisibility = drawingVisibility
    drawingVisibility = mode

    markerVisibilityStore.setMarkerVisibility(currentMarker.id, mode)

    try {
      const { data: currentData, error: fetchError } = await supabase
        .from("map_markers")
        .select("marker_data")
        .eq("id", currentMarker.id)
        .single()

      if (fetchError) {
        console.error("Error fetching marker data:", fetchError)
        markerVisibilityStore.setMarkerVisibility(
          currentMarker.id,
          previousVisibility,
        )
        return
      }

      const updatedMarkerData = {
        ...currentData.marker_data,
        properties: {
          ...(currentData.marker_data?.properties || {}),
          drawings_visibility: mode,
        },
      }

      const { error } = await supabase
        .from("map_markers")
        .update({
          marker_data: updatedMarkerData,
          updated_at: new Date().toISOString(),
        })
        .eq("id", currentMarker.id)

      if (error) {
        console.error("Error updating marker visibility:", error)
        markerVisibilityStore.setMarkerVisibility(
          currentMarker.id,
          previousVisibility,
        )
      } else {
        console.log(`✅ Saved visibility setting: ${mode}`)
      }
    } catch (error) {
      console.error("Error in toggleVisibility:", error)
      markerVisibilityStore.setMarkerVisibility(
        currentMarker.id,
        previousVisibility,
      )
    }
  }

  function getDrawingTypeLabel(type) {
    return type === "polygon" ? "Area" : "Line"
  }

  function getDrawingHectares(drawing) {
    if (drawing.drawing_type !== "polygon" || !drawing.geometry) return null
    try {
      const sqMeters = area(drawing.geometry)
      return (sqMeters / 10000).toFixed(2)
    } catch {
      return null
    }
  }

  function getDrawingLength(drawing) {
    if (drawing.drawing_type === "polygon" || !drawing.geometry) return null
    try {
      const km = length(drawing.geometry, { units: "kilometers" })
      if (km < 1) {
        return `${Math.round(km * 1000)} m`
      }
      return `${km.toFixed(2)} km`
    } catch {
      return null
    }
  }
</script>

{#if showStyleEditor && editingDrawing}
  <DrawingStyleEditor
    {map}
    drawing={editingDrawing}
    onSave={handleStyleEditorSave}
    onCancel={handleStyleEditorCancel}
  />
{:else}
  <div class="drawing-section">
    <div class="drawing-header">
      <span class="section-title">Drawings</span>
      <label class="visibility-switch" title="Always show drawings on map">
        <span class="visibility-label">Always Show</span>
        <input
          type="checkbox"
          checked={drawingVisibility === "always"}
          on:change={(e) =>
            toggleVisibility(e.currentTarget.checked ? "always" : "selected")}
        />
        <span class="switch-track">
          <span class="switch-thumb"></span>
        </span>
      </label>
    </div>

    <div class="drawing-type-section">
      <button
        class="drawing-type-btn area"
        on:click={() => startDrawing("area")}
      >
        <Square size={18} />
        <span>Draw Area</span>
      </button>
      <button
        class="drawing-type-btn line"
        on:click={() => startDrawing("line")}
      >
        <Spline size={18} />
        <span>Draw Line</span>
      </button>
    </div>

    {#if savedDrawings.length > 0}
      <div class="drawings-list-container">
        <div class="drawings-list">
          {#each savedDrawings as drawing}
            <button
              class="drawing-item"
              class:selected={selectedDrawingId === drawing.id}
              on:click={() => selectDrawing(drawing.id)}
            >
              <div class="drawing-preview">
                {#if drawing.drawing_type === "polygon"}
                  <div
                    class="drawing-glyph drawing-glyph-area"
                    style="background-color: {drawing.style?.fillColor ||
                      '#0ea5e9'}; border-color: {drawing.style?.strokeColor ||
                      drawing.style?.fillColor ||
                      '#0ea5e9'};"
                  ></div>
                {:else}
                  <svg
                    class="drawing-glyph drawing-glyph-line"
                    viewBox="0 0 20 20"
                    aria-hidden="true"
                  >
                    <path
                      d="M2 16 Q 7 4 10 10 T 18 4"
                      fill="none"
                      stroke={drawing.style?.strokeColor ||
                        drawing.style?.fillColor ||
                        "#0ea5e9"}
                      stroke-width="2.5"
                      stroke-linecap="round"
                    />
                  </svg>
                {/if}
                <div class="drawing-info">
                  <span class="drawing-line-1">
                    <span class="drawing-type"
                      >{getDrawingTypeLabel(drawing.drawing_type)}</span
                    >
                    {#if getDrawingHectares(drawing) !== null}
                      <span class="drawing-meta-sep">•</span>
                      <span class="drawing-hectares"
                        >{getDrawingHectares(drawing)} ha</span
                      >
                    {/if}
                    {#if getDrawingLength(drawing) !== null}
                      <span class="drawing-meta-sep">•</span>
                      <span class="drawing-hectares"
                        >{getDrawingLength(drawing)}</span
                      >
                    {/if}
                  </span>
                  <span class="drawing-date">
                    {new Date(drawing.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
              {#if selectedDrawingId === drawing.id}
                <div class="drawing-actions">
                  <button
                    class="edit-drawing-btn"
                    on:click={(e) => editDrawing(drawing.id, e)}
                    title="Edit style"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    class="delete-drawing-btn"
                    on:click={(e) => deleteDrawing(drawing.id, e)}
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              {/if}
            </button>
          {/each}
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .drawing-section {
    display: flex;
    flex-direction: column;
    max-height: 35vh;
    min-height: 35vh;
    background: linear-gradient(
      to bottom,
      rgba(0, 0, 0, 0.9),
      rgba(0, 0, 0, 0.8)
    );
    opacity: 0;
    transform: translateY(-20px);
    transition: all 0.3s ease;
    padding: 16px 20px 0;
    overflow: hidden;
  }

  :global(.marker-panel.expanded) .drawing-section {
    opacity: 1;
    transform: translateY(0);
  }

  .drawing-header {
    flex-shrink: 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .section-title {
    font-size: 16px;
    font-weight: 600;
    color: white;
  }

  .visibility-switch {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    user-select: none;
  }

  .visibility-label {
    font-size: 12px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.7);
  }

  .visibility-switch input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .switch-track {
    position: relative;
    display: inline-block;
    width: 32px;
    height: 18px;
    background: rgba(255, 255, 255, 0.15);
    border-radius: 999px;
    transition: background 0.2s ease;
    flex-shrink: 0;
  }

  .switch-thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 14px;
    height: 14px;
    background: #fff;
    border-radius: 50%;
    transition: transform 0.2s ease;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  }

  .visibility-switch input:checked + .switch-track {
    background: #60a5fa;
  }

  .visibility-switch input:checked + .switch-track .switch-thumb {
    transform: translateX(14px);
  }

  .visibility-switch input:focus-visible + .switch-track {
    outline: 2px solid rgba(96, 165, 250, 0.5);
    outline-offset: 2px;
  }

  .drawing-type-section {
    flex-shrink: 0;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-bottom: 16px;
  }

  .drawing-type-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 12px 16px;
    color: rgba(255, 255, 255, 0.8);
    cursor: pointer;
    transition: all 0.2s ease;
    font-size: 14px;
    font-weight: 500;
  }

  .drawing-type-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.2);
    color: white;
    transform: scale(1.02);
  }

  .drawing-type-btn.area:hover {
    border-color: rgba(14, 165, 233, 0.4);
    background: rgba(14, 165, 233, 0.1);
    color: #0ea5e9;
  }

  .drawing-type-btn.line:hover {
    border-color: rgba(168, 85, 247, 0.4);
    background: rgba(168, 85, 247, 0.1);
    color: #a855f7;
  }

  .drawings-list-container {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    margin-top: 6px;
    padding-top: 10px;
    border-top: 1px solid rgba(255, 255, 255, 0.07);
  }

  .drawings-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-bottom: 8px;
  }

  .drawing-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 6px;
    padding: 6px 8px;
    transition: all 0.15s ease;
    cursor: pointer;
    width: 100%;
    text-align: left;
  }

  .drawing-item:hover {
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(255, 255, 255, 0.15);
  }

  .drawing-item.selected {
    background: rgba(168, 85, 247, 0.12);
    border-color: rgba(168, 85, 247, 0.35);
  }

  .drawing-preview {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;
    min-width: 0;
  }

  .drawing-glyph {
    width: 22px;
    height: 22px;
    flex-shrink: 0;
  }

  .drawing-glyph-area {
    border-radius: 4px;
    border: 1.5px solid rgba(255, 255, 255, 0.25);
  }

  .drawing-glyph-line {
    display: block;
  }

  .drawing-info {
    display: flex;
    flex-direction: column;
    gap: 0;
    min-width: 0;
    flex: 1;
  }

  .drawing-line-1 {
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
    line-height: 1.2;
  }

  .drawing-type {
    font-size: 13px;
    font-weight: 600;
    color: white;
  }

  .drawing-meta-sep {
    color: rgba(255, 255, 255, 0.3);
    font-size: 10px;
  }

  .drawing-hectares {
    font-size: 11px;
    font-weight: 500;
    color: rgba(14, 165, 233, 0.95);
  }

  .drawing-date {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.45);
    line-height: 1.2;
  }

  .drawing-actions {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }

  .edit-drawing-btn,
  .delete-drawing-btn {
    border: none;
    border-radius: 5px;
    padding: 5px;
    cursor: pointer;
    transition: all 0.15s ease;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .edit-drawing-btn {
    background: rgba(168, 85, 247, 0.2);
    color: #a855f7;
  }

  .edit-drawing-btn:hover {
    background: rgba(168, 85, 247, 0.3);
  }

  .delete-drawing-btn {
    background: rgba(239, 68, 68, 0.2);
    color: #ef4444;
  }

  .delete-drawing-btn:hover {
    background: rgba(239, 68, 68, 0.3);
  }

  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 40px 20px;
    color: rgba(255, 255, 255, 0.4);
  }

  .empty-icon {
    opacity: 0.3;
  }

  .empty-text {
    font-size: 14px;
    font-weight: 500;
  }

  .empty-hint {
    font-size: 12px;
    font-style: italic;
  }

  @media (max-width: 768px) {
    .drawing-section {
      max-height: 35.5vh;
      min-height: 35.5vh;
    }

    .section-title {
      font-size: 14px;
    }

    .drawing-type-btn {
      padding: 10px 12px;
      font-size: 13px;
    }

    .drawing-color-indicator {
      width: 28px;
      height: 28px;
    }
  }

  .drawings-list-container::-webkit-scrollbar {
    width: 4px;
  }

  .drawings-list-container::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2px;
  }

  .drawings-list-container::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.3);
    border-radius: 2px;
  }
</style>
