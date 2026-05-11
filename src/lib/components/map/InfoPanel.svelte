<!-- src/lib/components/map/InfoPanel.svelte -->
<script lang="ts">
  import { createEventDispatcher } from "svelte"
  import { mapFieldsStore } from "$lib/stores/mapFieldsStore"
  import { fieldStore } from "$lib/stores/fieldStore"
  import { fileApi } from "$lib/api/fileApi"
  import { Check, X, Settings, Palette } from "lucide-svelte"

  export let selectedField: any
  export let selectedFieldId: number
  export let showInfoPanel: boolean = false

  const dispatch = createEventDispatcher()

  // UI State
  let showEditMenu = false
  let isExpanded = false
  let lastFieldId = null
  let activeTab = "details" // details, color

  // Edit state - all fields
  let editedName = ""
  let editedFieldType = ""
  let editedColor = ""
  let editedTotalArea = 0
  let editedSubAreas: number[] = []

  // Original values for change detection
  let originalName = ""
  let originalFieldType = ""
  let originalColor = ""
  let originalTotalArea = 0
  let originalSubAreas: number[] = []

  // Saving state
  let isSaving = false

  // 🆕 Fixed default wheat emoji
  const DEFAULT_FIELD_ICON = "🌾"

  // Available colors for fields (reduced to 8)
  const fieldColors = [
    {
      hex: "default",
      name: "Default",
      isDefault: true,
      fillColor: "#0080ff",
      outlineColor: "#bfffbf",
    },
    { hex: "#22c55e", name: "Emerald" },
    { hex: "#3b82f6", name: "Blue" },
    { hex: "#FFFF00", name: "Yellow" },
    { hex: "#FF0000", name: "Red" },
    { hex: "#a855f7", name: "Purple" },
    { hex: "#ec4899", name: "Pink" },
    { hex: "#c27219", name: "Brown" },
  ]

  // 🆕 Helper function to get fill color
  function getFillColor(hex: string): string {
    if (hex === "default") {
      return "#0080ff"
    }
    return hex
  }

  function getSwatchBackground(hex: string): string {
    const color = fieldColors.find((fieldColor) => fieldColor.hex === hex)

    if (color?.isDefault) {
      return `linear-gradient(135deg, ${color.fillColor} 0%, ${color.outlineColor} 100%)`
    }

    return getFillColor(hex)
  }

  // Check if field has multiple areas
  $: hasMultipleAreas =
    selectedField?.polygon_areas?.individual_areas &&
    selectedField.polygon_areas.individual_areas.length > 1

  // Check for changes in each category
  $: hasNameChanges = editedName !== originalName
  $: hasFieldTypeChanges = editedFieldType !== originalFieldType
  $: hasColorChanges = editedColor !== originalColor
  $: hasAreaChanges = hasMultipleAreas
    ? JSON.stringify(editedSubAreas) !== JSON.stringify(originalSubAreas)
    : editedTotalArea !== originalTotalArea

  // Check which tabs have changes (for visual indicators)
  $: detailsHasChanges = hasNameChanges || hasFieldTypeChanges || hasAreaChanges
  $: colorHasChanges = hasColorChanges

  // Overall changes check
  $: hasAnyChanges =
    hasNameChanges || hasFieldTypeChanges || hasColorChanges || hasAreaChanges

  // Reset state when field changes
  $: {
    const currentFieldId = selectedField?.field_id
    if (currentFieldId !== lastFieldId) {
      resetEditState()
      lastFieldId = currentFieldId
    }
  }

  function resetEditState() {
    showEditMenu = false
    isExpanded = false
    showInfoPanel = false
    activeTab = "details"

    // Reset all edited values to current field values
    editedName = selectedField?.name || ""
    editedFieldType = selectedField?.field_type || ""
    editedColor = selectedField?.color || "default"
    editedTotalArea = selectedField?.area || 0
    editedSubAreas = selectedField?.polygon_areas?.individual_areas
      ? [...selectedField.polygon_areas.individual_areas]
      : []

    // Save originals
    originalName = editedName
    originalFieldType = editedFieldType
    originalColor = editedColor
    originalTotalArea = editedTotalArea
    originalSubAreas = [...editedSubAreas]
  }

  function toggleEditMenu(tab: "details" | "color") {
    if (showEditMenu && activeTab === tab) {
      showEditMenu = false
      isExpanded = false
      showInfoPanel = false
      return
    }

    showEditMenu = true
    isExpanded = true
    showInfoPanel = true
    activeTab = tab
  }

  // Switch tabs
  function switchTab(tab: "details" | "color") {
    activeTab = tab
  }

  // Cancel all changes
  function cancelAllChanges() {
    editedName = originalName
    editedFieldType = originalFieldType
    editedColor = originalColor
    editedTotalArea = originalTotalArea
    editedSubAreas = [...originalSubAreas]
  }

  // Save all changes
  async function saveAllChanges() {
    if (!selectedField || isSaving) return

    isSaving = true

    try {
      // Prepare update data
      const updates: any = {}

      if (hasNameChanges) updates.name = editedName
      if (hasFieldTypeChanges) updates.field_type = editedFieldType
      if (hasColorChanges) updates.color = editedColor

      if (hasAreaChanges) {
        if (hasMultipleAreas) {
          const newSubAreas = editedSubAreas.map((area) =>
            parseFloat(area.toString()),
          )
          updates.polygonAreas = {
            individual_areas: newSubAreas,
            total_area: newSubAreas.reduce((sum, area) => sum + area, 0),
          }
        } else {
          updates.area = parseFloat(editedTotalArea.toString())
        }
      }

      // Save to database if field has field_id
      if (selectedField.field_id) {
        const result = await fileApi.updateField(
          selectedField.field_id,
          updates,
        )

        if (!result.success) {
          throw new Error(result.message)
        }

        console.log("✅ Field saved to database:", result.data)
      }

      // Update local stores
      mapFieldsStore.update((fields) => {
        const updatedFields = [...fields]
        const fieldToUpdate = updatedFields[selectedFieldId]
        if (fieldToUpdate) {
          Object.assign(fieldToUpdate, updates)
          // Handle polygon areas special case
          if (updates.polygonAreas) {
            fieldToUpdate.area = updates.polygonAreas.total_area
            fieldToUpdate.polygon_areas = updates.polygonAreas
          }
        }
        return updatedFields
      })

      if (selectedField.field_id) {
        fieldStore.update((fields) =>
          fields.map((field) =>
            field.field_id === selectedField.field_id
              ? { ...field, ...updates }
              : field,
          ),
        )
      }

      // Update originals
      originalName = editedName
      originalFieldType = editedFieldType
      originalColor = editedColor
      originalTotalArea = editedTotalArea
      originalSubAreas = [...editedSubAreas]

      dispatch("fieldUpdated")
      console.log("✅ Field updated successfully")

      showEditMenu = false
      isExpanded = false
      showInfoPanel = false
    } catch (error) {
      console.error("Error saving changes:", error)
      alert("Failed to save changes: " + error.message)
    } finally {
      isSaving = false
    }
  }

  // Select color
  function selectColor(hex: string) {
    editedColor = hex
  }

  // Handle keyboard shortcuts
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" && event.ctrlKey) {
      event.preventDefault()
      saveAllChanges()
    } else if (event.key === "Escape") {
      event.preventDefault()
      cancelAllChanges()
    }
  }
</script>

<!-- Field Panel -->
<div class="field-panel" class:expanded={isExpanded}>
  <!-- Edit Section with Tabs -->
  {#if isExpanded && showEditMenu}
    <div class="edit-section">
      <!-- Edit Header with Save/Cancel -->
      <div class="edit-section-header">
        <span class="section-title">Edit Field</span>
        <div class="edit-header-actions">
          {#if hasAnyChanges}
            <button
              class="cancel-all-btn"
              on:click={cancelAllChanges}
              disabled={isSaving}
            >
              <X size={16} />
            </button>
            <button
              class="save-all-btn"
              on:click={saveAllChanges}
              disabled={isSaving}
            >
              {#if isSaving}
                <div class="loading-spinner"></div>
              {:else}
                <Check size={16} />
              {/if}
              <span class="btn-text">Save</span>
            </button>
          {/if}
        </div>
      </div>

      <!-- 🆕 Tab Bar (removed Icon tab) -->
      <div class="tab-bar">
        <button
          class="tab-button"
          class:active={activeTab === "details"}
          class:has-changes={detailsHasChanges}
          on:click={() => switchTab("details")}
        >
          <Settings size={16} />
          <span class="tab-text">Field Settings</span>
          {#if detailsHasChanges}
            <span class="change-indicator">•</span>
          {/if}
        </button>
        <button
          class="tab-button"
          class:active={activeTab === "color"}
          class:has-changes={colorHasChanges}
          on:click={() => switchTab("color")}
        >
          <Palette size={16} />
          <span class="tab-text">Color</span>
          {#if colorHasChanges}
            <span class="change-indicator">•</span>
          {/if}
        </button>
      </div>

      <!-- Tab Content - Scrollable -->
      <div class="tab-content">
        <!-- Details Tab -->
        {#if activeTab === "details"}
          <div class="tab-panel details-tab">
            <!-- Name Edit -->
            <div class="edit-field-section">
              <label class="edit-field-label" for="field-name-input">
                Field Name
              </label>
              <input
                id="field-name-input"
                type="text"
                class="text-input"
                bind:value={editedName}
                placeholder="Enter field name..."
                on:keydown={handleKeydown}
              />
            </div>

            <!-- Field Type Edit -->
            <div class="edit-field-section">
              <label class="edit-field-label" for="field-type-input">
                Field Type
              </label>
              <input
                id="field-type-input"
                type="text"
                class="text-input"
                bind:value={editedFieldType}
                placeholder="e.g. Wheat, hay, canola..."
                on:keydown={handleKeydown}
              />
            </div>

            {#if hasMultipleAreas}
              <!-- Edit Sub Areas -->
              <div class="area-edit-section">
                <span class="area-edit-label">Edit Sub Areas</span>
                <div class="sub-areas-edit-list">
                  {#each editedSubAreas as area, index}
                    <div class="sub-area-edit-item">
                      <span class="sub-area-edit-label">Area {index + 1}</span>
                      <div class="sub-area-edit-input-wrapper">
                        <input
                          type="number"
                          step="0.1"
                          class="sub-area-edit-input"
                          bind:value={editedSubAreas[index]}
                          on:keydown={handleKeydown}
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
                </div>
              </div>
            {:else}
              <!-- Edit Total Area -->
              <div class="area-edit-section">
                <label class="area-edit-label" for="total-area-input">
                  Total Area (hectares)
                </label>
                <div class="total-area-edit-wrapper">
                  <input
                    id="total-area-input"
                    type="number"
                    step="0.1"
                    class="total-area-edit-input"
                    bind:value={editedTotalArea}
                    on:keydown={handleKeydown}
                  />
                  <span class="area-unit">ha</span>
                </div>
              </div>
            {/if}

            {#if detailsHasChanges}
              <p class="edit-hint">Ctrl+Enter to save, Esc to cancel</p>
            {/if}
          </div>
        {/if}

        <!-- Color Tab -->
        {#if activeTab === "color"}
          <div class="tab-panel color-tab">
            <!-- Color Selection -->
            <div class="selection-section">
              <span class="selection-label">Select Color</span>
              <div class="color-grid">
                {#each fieldColors as color}
                  <button
                    class="color-option"
                    class:selected={editedColor === color.hex}
                    on:click={() => selectColor(color.hex)}
                    title={color.name}
                  >
                    {#if color.isDefault}
                      <div
                        class="color-swatch"
                        style="background: linear-gradient(135deg, {color.fillColor} 0%, {color.outlineColor} 100%);"
                      ></div>
                    {:else}
                      <div
                        class="color-swatch"
                        style="background: {color.hex};"
                      ></div>
                    {/if}
                    <span class="color-name">{color.name}</span>
                    {#if editedColor === color.hex}
                      <div class="color-check">
                        <Check size={16} />
                      </div>
                    {/if}
                  </button>
                {/each}
              </div>
            </div>
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Control Bar -->
  <div class="control-bar">
    <!-- Field Info -->
    <div class="field-info">
      <!-- 🆕 Clickable Icon Display - filled circle with wheat emoji -->
      <button
        class="field-icon-display"
        title="Field icon"
        style="background: {getFillColor(
          showEditMenu ? editedColor : selectedField.color || 'default',
        )};"
      >
        <span class="field-icon">{DEFAULT_FIELD_ICON}</span>
      </button>

      <div class="field-text-info">
        <span class="field-name">{selectedField.name}</span>
        <span class="field-area-preview field-area-desktop">
          {Math.round(selectedField.area * 10) / 10} ha
        </span>
        <span class="field-area-preview field-area-mobile">
          {Math.round(selectedField.area * 10) / 10} ha
        </span>
      </div>
    </div>

    <!-- Action Controls -->
    <div class="action-controls">
      <button
        class="control-btn settings-btn"
        class:active={showEditMenu && isExpanded && activeTab === "details"}
        on:click={() => toggleEditMenu("details")}
        title="Edit field settings"
      >
        <Settings size={22} />
      </button>
      <button
        class="control-btn color-swatch-btn"
        class:active={showEditMenu && isExpanded && activeTab === "color"}
        on:click={() => toggleEditMenu("color")}
        title="Edit field color"
      >
        <span
          class="current-color-swatch"
          style="background: {getSwatchBackground(
            showEditMenu ? editedColor : selectedField.color || 'default',
          )};"
        ></span>
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

  /* Edit Section */
  .edit-section {
    display: flex;
    flex-direction: column;
    max-height: 50vh;
    min-height: 50vh;
    background: linear-gradient(
      to bottom,
      rgba(0, 0, 0, 0.9),
      rgba(0, 0, 0, 0.8)
    );
    opacity: 0;
    transform: translateY(-20px);
    transition: all 0.3s ease;
  }

  .field-panel.expanded .edit-section {
    opacity: 1;
    transform: translateY(0);
  }

  /* Edit section - flex managed with tabs */
  .edit-section {
    padding: 0;
    overflow: hidden;
  }

  .area-unit-small {
    font-size: 11px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.6);
  }

  /* Edit Section Header */
  .edit-section-header {
    flex-shrink: 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .section-title {
    font-size: 16px;
    font-weight: 600;
    color: white;
  }

  .edit-header-actions {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .cancel-all-btn {
    background: rgba(239, 68, 68, 0.2);
    border: 1px solid rgba(239, 68, 68, 0.4);
    border-radius: 6px;
    padding: 6px 8px;
    color: #ef4444;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .cancel-all-btn:hover:not(:disabled) {
    background: rgba(239, 68, 68, 0.3);
    transform: scale(1.05);
  }

  .save-all-btn {
    background: rgba(34, 197, 94, 0.2);
    border: 1px solid rgba(34, 197, 94, 0.4);
    border-radius: 6px;
    padding: 6px 12px;
    color: #22c55e;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 13px;
    font-weight: 500;
  }

  .save-all-btn:hover:not(:disabled) {
    background: rgba(34, 197, 94, 0.3);
    color: white;
    transform: scale(1.05);
  }

  .cancel-all-btn:disabled,
  .save-all-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }

  /* Tab Bar */
  .tab-bar {
    flex-shrink: 0;
    display: flex;
    background: rgba(0, 0, 0, 0.5);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    overflow-x: auto;
  }

  .tab-button {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    padding: 12px 8px;
    color: rgba(255, 255, 255, 0.6);
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 500;
    position: relative;
    touch-action: manipulation;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
  }

  .tab-button:hover {
    color: rgba(255, 255, 255, 0.9);
    background: rgba(255, 255, 255, 0.05);
  }

  .tab-button.active {
    color: #22c55e;
    border-bottom-color: #22c55e;
    background: rgba(34, 197, 94, 0.1);
  }

  .tab-text {
    white-space: nowrap;
  }

  .change-indicator {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 6px;
    height: 6px;
    background: #22c55e;
    border-radius: 50%;
    animation: pulse 2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  /* Tab Content */
  .tab-content {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 16px 20px;
    display: block;
  }

  .tab-panel {
    display: block !important;
    width: 100%;
    min-height: min-content;
  }

  /* Details Tab */
  .edit-field-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 16px;
  }

  .edit-field-label {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.8);
    font-weight: 600;
  }

  .text-input {
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 6px;
    padding: 10px 12px;
    color: white;
    font-size: 14px;
    font-weight: 500;
    width: 100%;
  }

  .text-input:focus {
    outline: none;
    border-color: #22c55e;
    background: rgba(255, 255, 255, 0.15);
  }

  .text-input::placeholder {
    color: rgba(255, 255, 255, 0.4);
  }

  /* Selection Section */
  .selection-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .selection-label {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.8);
    font-weight: 600;
  }

  .color-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    gap: 10px;
  }

  .color-option {
    position: relative;
    background: rgba(255, 255, 255, 0.05);
    border: 2px solid transparent;
    border-radius: 8px;
    padding: 12px;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }

  .color-option:hover {
    border-color: rgba(255, 255, 255, 0.3);
    transform: scale(1.05);
  }

  .color-option.selected {
    border-color: white;
    transform: scale(1.05);
  }

  .color-swatch {
    width: 100%;
    height: 50px;
    border-radius: 6px;
  }

  .color-name {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.8);
    font-weight: 500;
    text-align: center;
  }

  .color-check {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -80%);
    color: white;
    background: rgba(0, 0, 0, 0.7);
    border-radius: 50%;
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Area Tab */
  .area-edit-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .area-edit-label {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.8);
    font-weight: 600;
  }

  .total-area-edit-wrapper {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .total-area-edit-input {
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(34, 197, 94, 0.4);
    border-radius: 6px;
    padding: 10px 14px;
    color: #22c55e;
    font-size: 20px;
    font-weight: 600;
    flex: 1;
    max-width: 200px;
  }

  .total-area-edit-input:focus {
    outline: none;
    border-color: #22c55e;
    background: rgba(255, 255, 255, 0.15);
  }

  .sub-areas-edit-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .sub-area-edit-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: rgba(96, 165, 250, 0.1);
    padding: 10px 12px;
    border-radius: 6px;
  }

  .sub-area-edit-label {
    font-weight: 500;
    color: rgba(255, 255, 255, 0.8);
    font-size: 13px;
  }

  .sub-area-edit-input-wrapper {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .sub-area-edit-input {
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(96, 165, 250, 0.4);
    border-radius: 4px;
    padding: 6px 10px;
    color: #60a5fa;
    font-size: 14px;
    font-weight: 600;
    width: 90px;
  }

  .sub-area-edit-input:focus {
    outline: none;
    border-color: #60a5fa;
    background: rgba(255, 255, 255, 0.15);
  }

  .calculated-total {
    font-size: 13px;
    color: #60a5fa;
    font-weight: 600;
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    text-align: center;
  }

  .edit-hint {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.5);
    margin: 16px 0 0 0;
    font-style: italic;
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
    padding: 20px 26px;
    background: rgba(0, 0, 0, 0.95);
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(20px);
    min-height: 82px;
  }

  .field-info {
    display: flex;
    align-items: center;
    gap: 16px;
    flex: 1;
    min-width: 0;
  }

  /* 🆕 Clickable Icon Display with filled circle background */
  .field-icon-display {
    position: relative;
    width: 52px;
    height: 52px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    border: none;
    flex-shrink: 0;
    cursor: pointer;
    transition: all 0.3s ease;
    touch-action: manipulation;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }

  .field-icon {
    font-size: 24px;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
  }

  .field-icon-display:hover {
    transform: scale(1.05);
    filter: brightness(1.1);
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
    line-height: 1.2;
  }

  .field-area-preview {
    font-size: 14px;
    font-weight: 500;
    color: #22c55e;
  }

  /* Desktop: area inline */
  .field-area-mobile {
    display: none;
  }

  .action-controls {
    display: flex;
    gap: 16px;
    align-items: center;
  }

  .control-btn {
    background: rgba(255, 255, 255, 0.1);
    border: none;
    border-radius: 50%;
    width: 54px;
    height: 54px;
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

  .settings-btn {
    background: rgba(34, 197, 94, 0.2);
    color: #22c55e;
  }

  .settings-btn:hover,
  .settings-btn.active {
    background: rgba(34, 197, 94, 0.3);
    color: white;
  }

  .color-swatch-btn {
    background: rgba(255, 255, 255, 0.08);
  }

  .color-swatch-btn:hover,
  .color-swatch-btn.active {
    background: rgba(255, 255, 255, 0.18);
  }

  .current-color-swatch {
    width: 28px;
    height: 28px;
    border-radius: 6px;
    border: 2px solid rgba(255, 255, 255, 0.75);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
  }

  /* Mobile */
  @media (max-width: 768px) {
    .edit-section {
      max-height: 50vh;
      min-height: 50vh;
    }

    .control-bar {
      padding: 18px 22px;
      min-height: 76px;
    }

    .control-btn {
      width: 48px;
      height: 48px;
    }

    .current-color-swatch {
      width: 24px;
      height: 24px;
    }

    .field-icon-display {
      width: 48px;
      height: 48px;
    }

    .field-icon {
      font-size: 20px;
    }

    .field-info {
      gap: 12px;
    }

    .field-name {
      font-size: 16px;
    }

    /* Mobile: show area underneath on separate line */
    .field-area-desktop {
      display: none;
    }

    .field-area-mobile {
      display: block;
      font-size: 11px;
      margin-top: 2px;
    }

    .btn-text {
      display: none;
    }

    .save-all-btn {
      padding: 6px 8px;
      gap: 0;
    }

    .tab-text {
      font-size: 11px;
    }

    .color-grid {
      grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
    }
  }

  @media (max-width: 360px) {
    .field-name {
      font-size: 14px;
    }

    .field-area-mobile {
      font-size: 10px;
    }

    .section-title {
      font-size: 14px;
    }

    .field-info {
      gap: 8px;
    }

    .action-controls {
      gap: 10px;
    }

    .tab-button {
      padding: 10px 6px;
      font-size: 11px;
    }
  }

  /* Scrollbar Styling */
  .tab-content::-webkit-scrollbar {
    width: 4px;
  }

  .tab-content::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2px;
  }

  .tab-content::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.3);
    border-radius: 2px;
  }

  /* Tab bar scrollbar */
  .tab-bar::-webkit-scrollbar {
    height: 2px;
  }

  .tab-bar::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.05);
  }

  .tab-bar::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
  }
</style>
