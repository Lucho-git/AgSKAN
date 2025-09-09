<script lang="ts">
  import { createEventDispatcher } from "svelte"
  import { mapFieldsStore } from "$lib/stores/mapFieldsStore"
  import { fieldStore } from "$lib/stores/fieldStore"
  import { fileApi } from "$lib/api/fileApi"
  import { Info, Check, X, Edit3 } from "lucide-svelte"

  export let selectedField: any
  export let selectedFieldId: number
  export let showInfoPanel: boolean = false

  const dispatch = createEventDispatcher()

  // UI State
  let showDetails = false
  let isExpanded = false

  // Edit state - only for areas
  let editingTotalArea = false
  let editingSubAreas = false
  let editedTotalArea = 0
  let editedSubAreas: number[] = []
  let isSaving = false
  let lastFieldId = null // Track field changes

  // Check if field has multiple areas
  $: hasMultipleAreas =
    selectedField?.polygon_areas?.individual_areas &&
    selectedField.polygon_areas.individual_areas.length > 1

  // FIXED: Only reset state when field actually changes, not on every reactive cycle
  $: {
    const currentFieldId = selectedField?.field_id
    if (currentFieldId !== lastFieldId) {
      editingTotalArea = false
      editingSubAreas = false
      editedTotalArea = selectedField?.area || 0
      editedSubAreas = selectedField?.polygon_areas?.individual_areas
        ? [...selectedField.polygon_areas.individual_areas]
        : []
      lastFieldId = currentFieldId
    }
  }

  function handleDetailsClick() {
    showDetails = !showDetails
    isExpanded = showDetails
  }

  function startEditTotalArea() {
    // Don't allow editing total area if it has multiple areas (calculated)
    if (hasMultipleAreas) return

    editingTotalArea = true
    editedTotalArea = selectedField.area
  }

  function startEditSubAreas() {
    editingSubAreas = true
    editedSubAreas = selectedField.polygon_areas?.individual_areas
      ? [...selectedField.polygon_areas.individual_areas]
      : []
  }

  function cancelEditTotalArea() {
    editingTotalArea = false
    editedTotalArea = selectedField.area
  }

  function cancelEditSubAreas() {
    editingSubAreas = false
    editedSubAreas = selectedField.polygon_areas?.individual_areas
      ? [...selectedField.polygon_areas.individual_areas]
      : []
  }

  async function saveTotalArea() {
    if (!selectedField || isSaving || hasMultipleAreas) return

    isSaving = true
    try {
      const result = await fileApi.updateField(
        selectedField.field_id,
        selectedField.name,
        parseFloat(editedTotalArea.toString()),
      )

      if (result.success) {
        // Update stores
        const updateData = { area: parseFloat(editedTotalArea.toString()) }

        mapFieldsStore.update((fields) => {
          const updatedFields = [...fields]
          const fieldToUpdate = updatedFields[selectedFieldId]
          if (fieldToUpdate) {
            Object.assign(fieldToUpdate, updateData)
          }
          return updatedFields
        })

        if (selectedField.field_id) {
          fieldStore.update((fields) =>
            fields.map((field) =>
              field.field_id === selectedField.field_id
                ? { ...field, ...updateData }
                : field,
            ),
          )
        }

        dispatch("fieldUpdated")
        editingTotalArea = false
        console.log("Total area updated")
      } else {
        console.error("Failed to update area:", result.message)
        alert("Failed to update area: " + result.message)
      }
    } catch (error) {
      console.error("Error updating area:", error)
      alert("An error occurred while updating the area")
    } finally {
      isSaving = false
    }
  }

  async function saveSubAreas() {
    if (!selectedField || isSaving) return

    isSaving = true
    try {
      const newSubAreas = editedSubAreas.map((area) =>
        parseFloat(area.toString()),
      )
      const calculatedTotal = newSubAreas.reduce((sum, area) => sum + area, 0)

      const polygonAreas = {
        individual_areas: newSubAreas,
        total_area: calculatedTotal,
      }

      const result = await fileApi.updateField(
        selectedField.field_id,
        selectedField.name,
        undefined,
        polygonAreas,
      )

      if (result.success) {
        // Update stores
        const updateData = {
          area: calculatedTotal,
          polygon_areas: polygonAreas,
        }

        mapFieldsStore.update((fields) => {
          const updatedFields = [...fields]
          const fieldToUpdate = updatedFields[selectedFieldId]
          if (fieldToUpdate) {
            Object.assign(fieldToUpdate, updateData)
          }
          return updatedFields
        })

        if (selectedField.field_id) {
          fieldStore.update((fields) =>
            fields.map((field) =>
              field.field_id === selectedField.field_id
                ? { ...field, ...updateData }
                : field,
            ),
          )
        }

        dispatch("fieldUpdated")
        editingSubAreas = false
        console.log("Sub areas updated")
      } else {
        console.error("Failed to update sub areas:", result.message)
        alert("Failed to update sub areas: " + result.message)
      }
    } catch (error) {
      console.error("Error updating sub areas:", error)
      alert("An error occurred while updating the sub areas")
    } finally {
      isSaving = false
    }
  }

  // Handle Enter key to save, Escape to cancel
  function handleKeydown(event, type) {
    if (event.key === "Enter") {
      event.preventDefault()
      if (type === "total") {
        saveTotalArea()
      } else if (type === "sub") {
        saveSubAreas()
      }
    } else if (event.key === "Escape") {
      event.preventDefault()
      if (type === "total") {
        cancelEditTotalArea()
      } else if (type === "sub") {
        cancelEditSubAreas()
      }
    }
  }
</script>

<!-- Field Panel -->
<div class="field-panel" class:expanded={isExpanded}>
  <!-- Details Section (Only visible when expanded) -->
  {#if isExpanded && showDetails}
    <div class="details-section">
      <!-- Field Header -->
      <div class="field-header">
        <div class="field-title">
          <span class="field-label">{selectedField.name}</span>
          <span class="field-type">Field Details</span>
        </div>
      </div>

      <!-- Total Area Section -->
      <div class="area-section">
        <div class="area-header">
          <span class="area-label">🌾 Total Area</span>
          {#if !hasMultipleAreas && !editingTotalArea}
            <button class="edit-area-btn" on:click={startEditTotalArea}>
              <Edit3 size={16} />
              <span class="btn-text">Edit</span>
            </button>
          {:else if !hasMultipleAreas && editingTotalArea}
            <div class="area-actions">
              <button
                class="cancel-area-btn"
                on:click={cancelEditTotalArea}
                disabled={isSaving}
              >
                <X size={18} />
                <span class="btn-text">Cancel</span>
              </button>
              <button
                class="save-area-btn"
                on:click={saveTotalArea}
                disabled={isSaving}
              >
                {#if isSaving}
                  <div class="loading-spinner"></div>
                {:else}
                  <Check size={18} />
                {/if}
                <span class="btn-text">Save</span>
              </button>
            </div>
          {:else if hasMultipleAreas}
            <span class="calculated-note">Calculated from sub areas</span>
          {/if}
        </div>

        {#if !hasMultipleAreas && editingTotalArea}
          <div class="area-edit">
            <input
              type="number"
              step="0.1"
              class="area-input"
              bind:value={editedTotalArea}
              placeholder="Hectares"
              on:keydown={(e) => handleKeydown(e, "total")}
              autofocus
            />
            <span class="area-unit">ha</span>
          </div>
          <p class="edit-hint">Press Enter to save, Esc to cancel</p>
        {:else}
          <div class="area-display">
            <span class="area-value"
              >{Math.round(selectedField.area * 10) / 10}</span
            >
            <span class="area-unit">ha</span>
          </div>
        {/if}
      </div>

      <!-- Sub Areas Section (if exists) -->
      {#if hasMultipleAreas}
        <div class="sub-areas-section">
          <div class="sub-areas-header">
            <span class="sub-areas-label">📐 Sub Areas</span>
            {#if !editingSubAreas}
              <button class="edit-area-btn" on:click={startEditSubAreas}>
                <Edit3 size={16} />
                <span class="btn-text">Edit</span>
              </button>
            {:else}
              <div class="area-actions">
                <button
                  class="cancel-area-btn"
                  on:click={cancelEditSubAreas}
                  disabled={isSaving}
                >
                  <X size={18} />
                  <span class="btn-text">Cancel</span>
                </button>
                <button
                  class="save-area-btn"
                  on:click={saveSubAreas}
                  disabled={isSaving}
                >
                  {#if isSaving}
                    <div class="loading-spinner"></div>
                  {:else}
                    <Check size={18} />
                  {/if}
                  <span class="btn-text">Save</span>
                </button>
              </div>
            {/if}
          </div>

          <div class="sub-areas-list">
            {#if editingSubAreas}
              {#each editedSubAreas as area, index}
                <div class="sub-area-item editing">
                  <span class="sub-area-label">Area {index + 1}</span>
                  <div class="sub-area-edit">
                    <input
                      type="number"
                      step="0.1"
                      class="sub-area-input"
                      bind:value={editedSubAreas[index]}
                      placeholder="Hectares"
                      on:keydown={(e) => handleKeydown(e, "sub")}
                    />
                    <span class="area-unit-small">ha</span>
                  </div>
                </div>
              {/each}
              <div class="calculated-total">
                Total: {Math.round(
                  editedSubAreas.reduce(
                    (sum, area) => sum + parseFloat(area.toString() || "0"),
                    0,
                  ) * 10,
                ) / 10} ha
              </div>
              <p class="edit-hint">Press Enter to save, Esc to cancel</p>
            {:else}
              {#each selectedField.polygon_areas.individual_areas as area, index}
                <div class="sub-area-item">
                  <span class="sub-area-label">Area {index + 1}</span>
                  <div class="sub-area-value">
                    <span>{Math.round(area * 10) / 10}</span>
                    <span class="area-unit-small">ha</span>
                  </div>
                </div>
              {/each}
            {/if}
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Control Bar (Always Visible) -->
  <div class="control-bar">
    <!-- Field Info -->
    <div class="field-info">
      <div class="field-icon-display">🌾</div>
      <div class="field-text-info">
        <span class="field-name">{selectedField.name}</span>
        <span class="field-area-preview"
          >{Math.round(selectedField.area * 10) / 10} ha</span
        >
      </div>
    </div>

    <!-- Action Controls -->
    <div class="action-controls">
      <button
        class="control-btn details-btn"
        class:active={showDetails && isExpanded}
        on:click={handleDetailsClick}
      >
        <Info size={20} />
      </button>
    </div>
  </div>
</div>

<style>
  /* Main Field Panel */
  .field-panel {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: rgba(0, 0, 0, 0.9);
    backdrop-filter: blur(16px);
    color: white;
    z-index: 1000;
    transition: all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
    border-top: 1px solid rgba(255, 255, 255, 0.1);
  }

  /* Details Section */
  .details-section {
    padding: 16px 20px 0;
    max-height: 35vh;
    overflow-y: auto;
    background: linear-gradient(
      to bottom,
      rgba(0, 0, 0, 0.9),
      rgba(0, 0, 0, 0.8)
    );
    opacity: 0;
    transform: translateY(-20px);
    transition: all 0.3s ease;
  }

  .field-panel.expanded .details-section {
    opacity: 1;
    transform: translateY(0);
  }

  /* Field Header */
  .field-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .field-title {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .field-label {
    font-size: 16px;
    font-weight: 600;
    color: white;
  }

  .field-type {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.6);
  }

  /* Area Section */
  .area-section {
    margin-bottom: 16px;
    padding: 16px;
    background: rgba(34, 197, 94, 0.1);
    border-radius: 8px;
    border-left: 3px solid #22c55e;
  }

  .area-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .area-label {
    font-size: 13px;
    color: #22c55e;
    font-weight: 600;
  }

  .calculated-note {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.5);
    font-style: italic;
  }

  /* IMPROVED: Much bigger, easier to tap buttons */
  .edit-area-btn {
    background: rgba(34, 197, 94, 0.2);
    border: none;
    border-radius: 8px;
    padding: 12px 16px;
    color: #22c55e;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    font-weight: 600;
    min-height: 44px;
    touch-action: manipulation;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
  }

  .edit-area-btn:hover {
    background: rgba(34, 197, 94, 0.3);
    transform: scale(1.02);
  }

  .edit-area-btn:active {
    transform: scale(0.98);
    transition: transform 0.1s ease;
  }

  /* IMPROVED: Bigger action buttons in a better layout */
  .area-actions {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .cancel-area-btn,
  .save-area-btn {
    border: none;
    border-radius: 8px;
    padding: 10px 14px;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
    min-height: 40px;
    touch-action: manipulation;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
  }

  .cancel-area-btn {
    background: rgba(239, 68, 68, 0.2);
    color: #ef4444;
    border: 1px solid rgba(239, 68, 68, 0.3);
  }

  .save-area-btn {
    background: rgba(34, 197, 94, 0.2);
    color: #22c55e;
    border: 1px solid rgba(34, 197, 94, 0.3);
  }

  .cancel-area-btn:hover {
    background: rgba(239, 68, 68, 0.3);
    transform: scale(1.02);
  }

  .save-area-btn:hover {
    background: rgba(34, 197, 94, 0.3);
    transform: scale(1.02);
  }

  .cancel-area-btn:active,
  .save-area-btn:active {
    transform: scale(0.98);
    transition: transform 0.1s ease;
  }

  .cancel-area-btn:disabled,
  .save-area-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }

  .area-display {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  .area-value {
    font-size: 28px;
    font-weight: 700;
    color: #22c55e;
  }

  .area-unit {
    font-size: 16px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.7);
  }

  .area-edit {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }

  .area-input {
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(34, 197, 94, 0.4);
    border-radius: 6px;
    padding: 8px 12px;
    color: #22c55e;
    font-size: 18px;
    font-weight: 600;
    flex: 1;
    max-width: 150px;
  }

  .area-input:focus {
    outline: none;
    border-color: #22c55e;
    background: rgba(255, 255, 255, 0.15);
  }

  /* ADDED: Helpful hint text */
  .edit-hint {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.5);
    margin: 0;
    font-style: italic;
  }

  /* Sub Areas Section */
  .sub-areas-section {
    margin-bottom: 16px;
    padding: 12px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    border-left: 3px solid #60a5fa;
  }

  .sub-areas-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
  }

  .sub-areas-label {
    font-size: 12px;
    color: #60a5fa;
    font-weight: 600;
  }

  .sub-areas-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .sub-area-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: rgba(255, 255, 255, 0.05);
    padding: 8px 10px;
    border-radius: 4px;
  }

  .sub-area-item.editing {
    background: rgba(96, 165, 250, 0.1);
  }

  .sub-area-label {
    font-weight: 500;
    color: rgba(255, 255, 255, 0.8);
    font-size: 12px;
  }

  .sub-area-value {
    display: flex;
    align-items: baseline;
    gap: 4px;
    font-weight: 600;
    color: #60a5fa;
    font-size: 13px;
  }

  .sub-area-edit {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .sub-area-input {
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(96, 165, 250, 0.4);
    border-radius: 4px;
    padding: 4px 8px;
    color: #60a5fa;
    font-size: 12px;
    font-weight: 600;
    width: 70px;
  }

  .sub-area-input:focus {
    outline: none;
    border-color: #60a5fa;
  }

  .area-unit-small {
    font-size: 11px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.6);
  }

  .calculated-total {
    font-size: 12px;
    color: #60a5fa;
    font-weight: 600;
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    text-align: center;
  }

  .loading-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(34, 197, 94, 0.3);
    border-top: 2px solid #22c55e;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* Control Bar */
  .control-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 18px 24px;
    background: rgba(0, 0, 0, 0.95);
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(20px);
    min-height: 72px;
  }

  .field-info {
    display: flex;
    align-items: center;
    gap: 16px;
    flex: 1;
    min-width: 0;
  }

  .field-icon-display {
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(34, 197, 94, 0.2);
    border-radius: 50%;
    border: 2px solid rgba(34, 197, 94, 0.3);
    font-size: 24px;
    flex-shrink: 0;
  }

  .field-text-info {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    gap: 2px;
  }

  .field-name {
    font-size: 18px;
    font-weight: 600;
    color: white;
    text-overflow: ellipsis;
    overflow: hidden;
    white-space: nowrap;
  }

  .field-area-preview {
    font-size: 14px;
    font-weight: 500;
    color: #22c55e;
  }

  .action-controls {
    display: flex;
    gap: 12px;
    align-items: center;
  }

  .control-btn {
    background: rgba(255, 255, 255, 0.1);
    border: none;
    border-radius: 50%;
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(255, 255, 255, 0.8);
    cursor: pointer;
    transition: all 0.2s ease;
    touch-action: manipulation;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
  }

  .control-btn:hover {
    background: rgba(255, 255, 255, 0.2);
    color: white;
    transform: scale(1.05);
  }

  .control-btn:active {
    transform: scale(0.95);
    transition: transform 0.1s ease;
  }

  .details-btn {
    background: rgba(34, 197, 94, 0.2);
    color: #22c55e;
  }

  .details-btn:hover,
  .details-btn.active {
    background: rgba(34, 197, 94, 0.3);
    color: white;
  }

  /* Mobile Responsiveness */
  @media (max-width: 768px) {
    .details-section {
      max-height: 50vh;
      padding: 16px 20px 0;
    }

    .control-bar {
      padding: 16px 20px;
      min-height: 68px;
    }

    .control-btn {
      width: 44px;
      height: 44px;
    }

    .field-icon-display {
      width: 44px;
      height: 44px;
      font-size: 20px;
    }

    .field-info {
      gap: 12px;
    }

    .field-name {
      font-size: 16px;
    }

    .field-area-preview {
      font-size: 12px;
    }

    /* Keep button text on mobile for these bigger buttons */
    .btn-text {
      display: inline;
    }

    /* Make buttons even more mobile-friendly */
    .edit-area-btn {
      min-height: 48px;
      padding: 14px 18px;
    }

    .cancel-area-btn,
    .save-area-btn {
      min-height: 44px;
      padding: 12px 16px;
    }
  }

  @media (max-width: 520px) {
    .control-bar {
      padding: 14px 16px;
      min-height: 64px;
    }

    .control-btn {
      width: 40px;
      height: 40px;
    }

    .field-icon-display {
      width: 40px;
      height: 40px;
      font-size: 18px;
    }

    .action-controls {
      gap: 10px;
    }

    .details-section {
      max-height: 45vh;
    }

    /* Ensure buttons stay tappable on small screens */
    .area-actions {
      flex-direction: column;
      gap: 6px;
      width: 100%;
    }

    .cancel-area-btn,
    .save-area-btn {
      width: 100%;
      justify-content: center;
    }
  }

  @media (max-width: 480px) {
    .details-section {
      max-height: 40vh;
    }

    .field-info {
      gap: 10px;
    }

    .field-name {
      font-size: 15px;
    }

    .field-area-preview {
      font-size: 11px;
    }

    .control-bar {
      padding: 12px 14px;
      min-height: 60px;
    }
  }

  @media (max-width: 360px) {
    .field-name {
      font-size: 14px;
    }

    .field-area-preview {
      font-size: 10px;
    }

    .field-info {
      gap: 8px;
    }

    .action-controls {
      gap: 8px;
    }
  }

  /* Scrollbar Styling */
  .details-section::-webkit-scrollbar {
    width: 4px;
  }

  .details-section::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2px;
  }

  .details-section::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.3);
    border-radius: 2px;
  }
</style>
