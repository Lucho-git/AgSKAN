<script lang="ts">
  import { createEventDispatcher } from "svelte"
  import { mapFieldsStore } from "$lib/stores/mapFieldsStore"
  import { fieldStore } from "$lib/stores/fieldStore"
  import { fileApi } from "$lib/api/fileApi"
  import {
    Info,
    ChevronDown,
    ChevronUp,
    Edit3,
    Save,
    XCircle,
  } from "lucide-svelte"

  export let selectedField: any
  export let selectedFieldId: number
  export let showInfoPanel: boolean = false

  const dispatch = createEventDispatcher()

  // Edit mode state
  let editMode = false
  let editedFieldName = ""
  let editedTotalArea = 0
  let editedSubAreas: number[] = []
  let isSaving = false

  function handleInfoButtonClick() {
    showInfoPanel = true
  }

  function handleCollapseButtonClick() {
    showInfoPanel = false
    dispatch("deselect")
  }

  function closeInfoPanel() {
    showInfoPanel = false
    editMode = false
    dispatch("deselect")
  }

  function deselectField() {
    dispatch("deselect")
  }

  function startEdit() {
    if (selectedField) {
      editMode = true
      editedFieldName = selectedField.name
      editedTotalArea = selectedField.area
      editedSubAreas = selectedField.polygon_areas?.individual_areas
        ? [...selectedField.polygon_areas.individual_areas]
        : []
    }
  }

  function cancelEdit() {
    editMode = false
    editedFieldName = ""
    editedTotalArea = 0
    editedSubAreas = []
  }

  async function saveEdit() {
    if (selectedFieldId !== null && selectedField && !isSaving) {
      isSaving = true

      try {
        const fieldToUpdate = selectedField
        const newName = editedFieldName.trim()
        const newTotalArea = parseFloat(editedTotalArea.toString())

        let result

        if (editedSubAreas.length > 0) {
          const newSubAreas = editedSubAreas.map((area) =>
            parseFloat(area.toString()),
          )
          const calculatedTotal = newSubAreas.reduce(
            (sum, area) => sum + area,
            0,
          )

          const polygonAreas = {
            individual_areas: newSubAreas,
            total_area: calculatedTotal,
          }

          result = await fileApi.updateField(
            fieldToUpdate.field_id,
            newName,
            undefined,
            polygonAreas,
          )
        } else {
          result = await fileApi.updateField(
            fieldToUpdate.field_id,
            newName,
            newTotalArea,
          )
        }

        if (result.success) {
          const updateData = {
            name: newName,
            area:
              editedSubAreas.length > 0
                ? editedSubAreas.reduce(
                    (sum, area) => sum + parseFloat(area.toString()),
                    0,
                  )
                : newTotalArea,
            polygon_areas:
              editedSubAreas.length > 0
                ? {
                    individual_areas: editedSubAreas.map((area) =>
                      parseFloat(area.toString()),
                    ),
                    total_area: editedSubAreas.reduce(
                      (sum, area) => sum + parseFloat(area.toString()),
                      0,
                    ),
                  }
                : selectedField.polygon_areas,
          }

          mapFieldsStore.update((fields) => {
            const updatedFields = [...fields]
            const fieldToUpdate = updatedFields[selectedFieldId]

            if (fieldToUpdate) {
              Object.assign(fieldToUpdate, updateData)
            }

            return updatedFields
          })

          if (fieldToUpdate.field_id) {
            fieldStore.update((fields) =>
              fields.map((field) =>
                field.field_id === fieldToUpdate.field_id
                  ? { ...field, ...updateData }
                  : field,
              ),
            )
          }

          dispatch("fieldUpdated")
          editMode = false
          console.log("Field updated successfully")
        } else {
          console.error("Failed to update field:", result.message)
          alert("Failed to update field: " + result.message)
        }
      } catch (error) {
        console.error("Error updating field:", error)
        alert("An error occurred while updating the field")
      } finally {
        isSaving = false
      }
    }
  }
</script>

<!-- Info Button Container with Up/Down Controls -->
<div class="info-button-container">
  <button class="info-button" on:click={handleInfoButtonClick}>
    <Info size={18} class="info-icon" />
    <span class="info-text">{selectedField.name}</span>
    <ChevronUp size={16} class="expand-icon" />
  </button>

  <button
    class="collapse-button"
    on:click={handleCollapseButtonClick}
    aria-label="Collapse menu"
  >
    <ChevronDown size={16} />
  </button>
</div>

<!-- Info Panel (dark themed slide-up panel) -->
{#if showInfoPanel}
  <div class="info-panel-overlay" on:click={closeInfoPanel}>
    <div class="info-panel" on:click|stopPropagation>
      <!-- Header -->
      <div class="info-panel-header">
        <div class="header-content">
          {#if editMode}
            <input
              type="text"
              class="field-name-input"
              bind:value={editedFieldName}
              placeholder="Enter field name"
            />
          {:else}
            <div class="field-info-header">
              <Info size={18} class="header-icon" />
              <h3 class="field-title">{selectedField.name}</h3>
            </div>
          {/if}
        </div>
        <button
          class="close-button"
          on:click={closeInfoPanel}
          aria-label="Close field info"
        >
          <ChevronDown size={16} class="text-white/70" />
        </button>
      </div>

      <!-- Content -->
      <div class="info-panel-content">
        <!-- Total Area Section -->
        <div class="info-section">
          <h4 class="section-title">Total Area</h4>
          {#if editMode}
            <div class="edit-area-container">
              <input
                type="number"
                step="0.1"
                class="area-input"
                bind:value={editedTotalArea}
                placeholder="Area in hectares"
                disabled={editedSubAreas.length > 0}
              />
              <span class="area-unit">ha</span>
            </div>
            {#if editedSubAreas.length > 0}
              <p class="area-note">Calculated from sub-areas</p>
            {/if}
          {:else}
            <div class="area-display">
              <span class="area-value">{selectedField.area}</span>
              <span class="area-unit">ha</span>
            </div>
          {/if}
        </div>

        <!-- Sub Areas Section -->
        {#if selectedField.polygon_areas?.individual_areas && selectedField.polygon_areas.individual_areas.length > 1}
          <div class="info-section">
            <h4 class="section-title">Sub Areas</h4>
            <div class="sub-areas">
              {#if editMode}
                {#each editedSubAreas as area, index}
                  <div class="sub-area-item">
                    <span class="sub-area-label">Area {index + 1}</span>
                    <div class="edit-area-container">
                      <input
                        type="number"
                        step="0.1"
                        class="sub-area-input"
                        bind:value={editedSubAreas[index]}
                        placeholder="Sub area value"
                      />
                      <span class="area-unit-small">ha</span>
                    </div>
                  </div>
                {/each}
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

        <!-- Geometry Type Section -->
        <div class="info-section">
          <h4 class="section-title">Geometry Type</h4>
          <div class="geometry-badge">
            {selectedField.boundary.type}
          </div>
        </div>
      </div>

      <!-- Footer with Action Buttons -->
      <div class="info-panel-footer">
        {#if editMode}
          <div class="edit-actions">
            <button
              class="cancel-button"
              on:click={cancelEdit}
              disabled={isSaving}
            >
              <XCircle size={16} />
              <span class="button-text">Cancel</span>
            </button>
            <button class="save-button" on:click={saveEdit} disabled={isSaving}>
              {#if isSaving}
                <div class="loading-spinner"></div>
                <span class="button-text">Saving...</span>
              {:else}
                <Save size={16} />
                <span class="button-text">Save</span>
              {/if}
            </button>
          </div>
        {:else}
          <div class="action-container">
            <p class="footer-text">Tap edit to modify field details</p>
            <button class="edit-action-button" on:click={startEdit}>
              <Edit3 size={16} />
              <span class="button-text">Edit</span>
            </button>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .info-button-container {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 1000;
    pointer-events: none;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .info-button {
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(0, 0, 0, 0.7);
    color: white;
    border: none;
    border-radius: 24px;
    padding: 12px 16px;
    font-size: 16px;
    font-weight: 600;
    backdrop-filter: blur(10px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    cursor: pointer;
    transition: all 0.2s ease;
    pointer-events: auto;
    user-select: none;
  }

  .info-button:hover {
    transform: translateY(-2px);
    background: rgba(0, 0, 0, 0.8);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4);
  }

  .info-button:active {
    transform: translateY(0);
  }

  .info-icon {
    color: #60a5fa;
  }

  .info-text {
    font-weight: 600;
    max-width: 200px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .expand-icon {
    color: rgba(255, 255, 255, 0.7);
    margin-left: 4px;
  }

  .collapse-button {
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.7);
    border: none;
    border-radius: 50%;
    width: 40px;
    height: 40px;
    color: rgba(255, 255, 255, 0.7);
    cursor: pointer;
    transition: all 0.2s ease;
    pointer-events: auto;
    backdrop-filter: blur(10px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  }

  .collapse-button:hover {
    background: rgba(0, 0, 0, 0.8);
    transform: translateY(-2px) scale(1.05);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4);
    color: white;
  }

  .info-panel-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 2000;
    display: flex;
    align-items: flex-end;
    animation: fadeIn 0.2s ease;
  }

  .info-panel {
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(16px);
    color: white;
    width: 100%;
    max-height: 75vh;
    border-radius: 20px 20px 0 0;
    box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.3);
    animation: slideUp 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
    overflow: hidden;
  }

  .info-panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 24px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.2);
  }

  .header-content {
    flex: 1;
    margin-right: 12px;
  }

  .field-info-header {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .header-icon {
    color: #60a5fa;
  }

  .field-title {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: white;
  }

  .field-name-input {
    font-size: 16px;
    font-weight: 600;
    color: white;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 8px;
    padding: 8px 12px;
    outline: none;
    transition: border-color 0.2s ease;
    width: 100%;
    backdrop-filter: blur(10px);
  }

  .field-name-input:focus {
    border-color: #60a5fa;
    box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.2);
  }

  .field-name-input::placeholder {
    color: rgba(255, 255, 255, 0.6);
  }

  .close-button {
    background: rgba(255, 255, 255, 0.1);
    border: none;
    border-radius: 50%;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .close-button:hover {
    background: rgba(255, 255, 255, 0.2);
  }

  .info-panel-content {
    padding: 20px 24px;
    max-height: calc(75vh - 160px);
    overflow-y: auto;
  }

  .info-section {
    margin-bottom: 20px;
  }

  .info-section:last-child {
    margin-bottom: 0;
  }

  .section-title {
    margin: 0 0 10px 0;
    font-size: 12px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.7);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .area-display {
    display: flex;
    align-items: baseline;
    gap: 6px;
  }

  .area-value {
    font-size: 28px;
    font-weight: 700;
    color: #60a5fa;
  }

  .area-unit {
    font-size: 14px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.7);
  }

  .area-unit-small {
    font-size: 12px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.6);
    white-space: nowrap;
  }

  .edit-area-container {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .area-input {
    font-size: 18px;
    font-weight: 600;
    color: #60a5fa;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 6px;
    padding: 8px 12px;
    outline: none;
    transition: border-color 0.2s ease;
    flex: 1;
    min-width: 120px;
    max-width: 200px;
    backdrop-filter: blur(10px);
  }

  .area-input:focus {
    border-color: #60a5fa;
    box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.2);
  }

  .area-input:disabled {
    background: rgba(255, 255, 255, 0.05);
    color: rgba(255, 255, 255, 0.5);
    cursor: not-allowed;
  }

  .area-note {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.6);
    margin-top: 6px;
    font-style: italic;
  }

  .sub-areas {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .sub-area-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: rgba(255, 255, 255, 0.1);
    padding: 8px 12px;
    border-radius: 6px;
    border-left: 3px solid #60a5fa;
  }

  .sub-area-label {
    font-weight: 500;
    color: rgba(255, 255, 255, 0.8);
    font-size: 13px;
    flex-shrink: 0;
  }

  .sub-area-value {
    display: flex;
    align-items: baseline;
    gap: 4px;
    font-weight: 600;
    color: #60a5fa;
    font-size: 14px;
  }

  .sub-area-input {
    font-size: 14px;
    font-weight: 600;
    color: #60a5fa;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 4px;
    padding: 4px 8px;
    outline: none;
    transition: border-color 0.2s ease;
    flex: 1;
    min-width: 80px;
    max-width: 120px;
    backdrop-filter: blur(10px);
  }

  .sub-area-input:focus {
    border-color: #60a5fa;
    box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.2);
  }

  .geometry-badge {
    display: inline-block;
    background: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.8);
    padding: 6px 10px;
    border-radius: 4px;
    font-family: monospace;
    font-size: 12px;
    font-weight: 500;
  }

  .info-panel-footer {
    padding: 16px 24px;
    border-top: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(0, 0, 0, 0.3);
  }

  .action-container {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .footer-text {
    margin: 0;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.6);
  }

  .edit-action-button {
    display: flex;
    align-items: center;
    gap: 6px;
    background: rgba(96, 165, 250, 0.2);
    color: #60a5fa;
    border: none;
    border-radius: 6px;
    padding: 8px 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    font-size: 13px;
    margin-left: auto;
  }

  .edit-action-button:hover {
    background: rgba(96, 165, 250, 0.3);
    transform: scale(1.02);
  }

  .edit-actions {
    display: flex;
    gap: 10px;
    align-items: center;
  }

  .cancel-button {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    background: rgba(255, 255, 255, 0.1);
    color: white;
    border: none;
    border-radius: 6px;
    padding: 10px 16px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    font-size: 13px;
  }

  .cancel-button:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.2);
  }

  .cancel-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .save-button {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    background: rgba(96, 165, 250, 0.2);
    color: #60a5fa;
    border: none;
    border-radius: 6px;
    padding: 10px 16px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    font-size: 13px;
  }

  .save-button:hover:not(:disabled) {
    background: rgba(96, 165, 250, 0.3);
  }

  .save-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .button-text {
    font-size: 13px;
  }

  .loading-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(96, 165, 250, 0.3);
    border-top: 2px solid #60a5fa;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes slideUp {
    0% {
      opacity: 0;
      transform: translateY(100%);
    }
    60% {
      opacity: 0.8;
      transform: translateY(-10px);
    }
    100% {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .info-panel-content::-webkit-scrollbar {
    width: 3px;
  }

  .info-panel-content::-webkit-scrollbar-track {
    background: transparent;
  }

  .info-panel-content::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.3);
    border-radius: 2px;
  }

  .info-panel-content::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.5);
  }

  @media (max-width: 768px) {
    .info-panel {
      max-height: 80vh;
    }

    .info-panel-content {
      max-height: calc(80vh - 160px);
      padding: 16px 20px;
    }

    .area-value {
      font-size: 24px;
    }

    .area-input {
      min-width: 100px;
      max-width: 150px;
    }

    .sub-area-input {
      min-width: 70px;
      max-width: 100px;
    }

    .info-text {
      max-width: 140px;
    }

    .footer-text {
      font-size: 11px;
    }
  }

  @media (max-width: 480px) {
    .area-input {
      min-width: 80px;
      max-width: 120px;
    }

    .sub-area-input {
      min-width: 60px;
      max-width: 80px;
    }

    .edit-area-container {
      gap: 4px;
    }

    .info-text {
      max-width: 100px;
    }
  }
</style>
