<!-- InfoPanel.svelte - Improved with separate tabs, field type, and live preview -->
<script lang="ts">
  import { createEventDispatcher } from "svelte"
  import { mapFieldsStore } from "$lib/stores/mapFieldsStore"
  import { fieldStore } from "$lib/stores/fieldStore"
  import { fileApi } from "$lib/api/fileApi"
  import {
    Info,
    Check,
    X,
    Edit3,
    Settings,
    Palette,
    Maximize2,
    Sparkles,
  } from "lucide-svelte"

  export let selectedField: any
  export let selectedFieldId: number
  export let showInfoPanel: boolean = false

  const dispatch = createEventDispatcher()

  // UI State
  let showDetails = false
  let showEditMenu = false
  let isExpanded = false
  let lastFieldId = null
  let activeTab = "details" // details, icon, color, area

  // Edit state - all fields
  let editedName = ""
  let editedFieldType = ""
  let editedIcon = ""
  let editedColor = ""
  let editedTotalArea = 0
  let editedSubAreas: number[] = []

  // Original values for change detection
  let originalName = ""
  let originalFieldType = ""
  let originalIcon = ""
  let originalColor = ""
  let originalTotalArea = 0
  let originalSubAreas: number[] = []

  // Saving state
  let isSaving = false

  // Available icons for fields (only plant emojis)
  const fieldIcons = [
    { emoji: "🌾", name: "Wheat" },
    { emoji: "🌱", name: "Seedling" },
    { emoji: "🌻", name: "Sunflower" },
    { emoji: "🌽", name: "Corn" },
    { emoji: "🥕", name: "Carrot" },
    { emoji: "🍅", name: "Tomato" },
    { emoji: "🌳", name: "Tree" },
    { emoji: "🌲", name: "Pine" },
  ]

  // Available colors for fields (reduced to 8)
  const fieldColors = [
    {
      hex: "#0080ff",
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

  // Check if field has multiple areas
  $: hasMultipleAreas =
    selectedField?.polygon_areas?.individual_areas &&
    selectedField.polygon_areas.individual_areas.length > 1

  // Check for changes in each category
  $: hasNameChanges = editedName !== originalName
  $: hasFieldTypeChanges = editedFieldType !== originalFieldType
  $: hasIconChanges = editedIcon !== originalIcon
  $: hasColorChanges = editedColor !== originalColor
  $: hasAreaChanges = hasMultipleAreas
    ? JSON.stringify(editedSubAreas) !== JSON.stringify(originalSubAreas)
    : editedTotalArea !== originalTotalArea

  // Check which tabs have changes (for visual indicators)
  $: detailsHasChanges = hasNameChanges || hasFieldTypeChanges
  $: iconHasChanges = hasIconChanges
  $: colorHasChanges = hasColorChanges
  $: areaHasChanges = hasAreaChanges

  // Overall changes check
  $: hasAnyChanges =
    hasNameChanges ||
    hasFieldTypeChanges ||
    hasIconChanges ||
    hasColorChanges ||
    hasAreaChanges

  // Reset state when field changes
  $: {
    const currentFieldId = selectedField?.field_id
    if (currentFieldId !== lastFieldId) {
      resetEditState()
      lastFieldId = currentFieldId
    }
  }

  function resetEditState() {
    showDetails = false
    showEditMenu = false
    isExpanded = false
    activeTab = "details"

    // Reset all edited values to current field values
    editedName = selectedField?.name || ""
    editedFieldType = selectedField?.field_type || ""
    editedIcon = selectedField?.icon || "🌾"
    editedColor = selectedField?.color || "#22c55e"
    editedTotalArea = selectedField?.area || 0
    editedSubAreas = selectedField?.polygon_areas?.individual_areas
      ? [...selectedField.polygon_areas.individual_areas]
      : []

    // Save originals
    originalName = editedName
    originalFieldType = editedFieldType
    originalIcon = editedIcon
    originalColor = editedColor
    originalTotalArea = editedTotalArea
    originalSubAreas = [...editedSubAreas]
  }

  // Handle icon click to open edit menu
  function handleIconClick() {
    showEditMenu = !showEditMenu
    showDetails = false
    isExpanded = showEditMenu

    if (showEditMenu) {
      activeTab = "details"
    }
  }

  // Handle info button click
  function handleInfoClick() {
    showDetails = !showDetails
    showEditMenu = false
    isExpanded = showDetails
  }

  // Switch tabs
  function switchTab(tab: string) {
    activeTab = tab
  }

  // Cancel all changes
  function cancelAllChanges() {
    editedName = originalName
    editedFieldType = originalFieldType
    editedIcon = originalIcon
    editedColor = originalColor
    editedTotalArea = originalTotalArea
    editedSubAreas = [...originalSubAreas]
  }

  // Save all changes (local only for now)
  async function saveAllChanges() {
    if (!selectedField || isSaving) return

    isSaving = true

    try {
      // Prepare update data
      const updates: any = {}

      if (hasNameChanges) updates.name = editedName
      if (hasFieldTypeChanges) updates.field_type = editedFieldType
      if (hasIconChanges) updates.icon = editedIcon
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

      // 🆕 Save to database if field has field_id
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
      originalIcon = editedIcon
      originalColor = editedColor
      originalTotalArea = editedTotalArea
      originalSubAreas = [...editedSubAreas]

      dispatch("fieldUpdated")
      console.log("✅ Field updated successfully")

      showEditMenu = false
      isExpanded = false
    } catch (error) {
      console.error("Error saving changes:", error)
      alert("Failed to save changes: " + error.message)
    } finally {
      isSaving = false
    }
  }

  // Select icon
  function selectIcon(emoji: string) {
    editedIcon = emoji
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
  <!-- Info Section -->
  {#if isExpanded && showDetails}
    <div class="info-section">
      <!-- Field Header -->
      <div class="field-header">
        <div class="field-title">
          <span class="field-label">{selectedField.name}</span>
          <span class="field-date">Field Details</span>
        </div>
      </div>

      <!-- Total Area Display (moved above appearance) -->
      <div class="area-display-section">
        <div class="area-display-header">
          <span class="area-display-label">🌾 Total Area</span>
          {#if hasMultipleAreas}
            <span class="calculated-note">Calculated from sub areas</span>
          {/if}
        </div>
        <div class="area-display-value">
          <span class="area-number"
            >{Math.round(selectedField.area * 10) / 10}</span
          >
          <span class="area-unit">ha</span>
        </div>
      </div>

      <!-- Field Icon & Color Display -->
      <div class="appearance-display-section">
        <div class="appearance-display-header">
          <span class="appearance-label">🎨 Appearance</span>
        </div>
        <div class="appearance-display-content">
          <div class="icon-color-display">
            <div
              class="field-icon-preview"
              style="background: {selectedField.color ||
                '#22c55e'}20; border-color: {selectedField.color || '#22c55e'};"
            >
              <span class="icon-preview-emoji"
                >{selectedField.icon || "🌾"}</span
              >
            </div>
            <div class="color-info">
              <span class="color-label">Field Color</span>
              <div class="color-swatch-display">
                <div
                  class="color-swatch-small"
                  style="background: {selectedField.color || '#22c55e'};"
                ></div>
                <span class="color-hex">{selectedField.color || "#22c55e"}</span
                >
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Field Type Display -->
      {#if selectedField.field_type}
        <div class="field-type-display-section">
          <div class="field-type-display-header">
            <span class="field-type-label">🏷️ Field Type</span>
          </div>
          <div class="field-type-display-content">
            {selectedField.field_type}
          </div>
        </div>
      {/if}

      <!-- Sub Areas Display (if exists) -->
      {#if hasMultipleAreas}
        <div class="sub-areas-display-section">
          <div class="sub-areas-display-header">
            <span class="sub-areas-label">📐 Sub Areas</span>
          </div>
          <div class="sub-areas-list">
            {#each selectedField.polygon_areas.individual_areas as area, index}
              <div class="sub-area-display-item">
                <span class="sub-area-label">Area {index + 1}</span>
                <div class="sub-area-value">
                  <span>{Math.round(area * 10) / 10}</span>
                  <span class="area-unit-small">ha</span>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/if}

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

      <!-- Tab Bar -->
      <div class="tab-bar">
        <button
          class="tab-button"
          class:active={activeTab === "details"}
          class:has-changes={detailsHasChanges}
          on:click={() => switchTab("details")}
        >
          <Settings size={16} />
          <span class="tab-text">Details</span>
          {#if detailsHasChanges}
            <span class="change-indicator">•</span>
          {/if}
        </button>
        <button
          class="tab-button"
          class:active={activeTab === "icon"}
          class:has-changes={iconHasChanges}
          on:click={() => switchTab("icon")}
        >
          <Sparkles size={16} />
          <span class="tab-text">Icon</span>
          {#if iconHasChanges}
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
        <button
          class="tab-button"
          class:active={activeTab === "area"}
          class:has-changes={areaHasChanges}
          on:click={() => switchTab("area")}
        >
          <Maximize2 size={16} />
          <span class="tab-text">Area</span>
          {#if areaHasChanges}
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
              <label class="edit-field-label">Field Name</label>
              <input
                type="text"
                class="text-input"
                bind:value={editedName}
                placeholder="Enter field name..."
                on:keydown={handleKeydown}
              />
            </div>

            <!-- Field Type Edit -->
            <div class="edit-field-section">
              <label class="edit-field-label">Field Type</label>
              <input
                type="text"
                class="text-input"
                bind:value={editedFieldType}
                placeholder="e.g. Cropland, Pasture, Orchard..."
                on:keydown={handleKeydown}
              />
            </div>

            {#if hasNameChanges || hasFieldTypeChanges}
              <p class="edit-hint">Ctrl+Enter to save, Esc to cancel</p>
            {/if}
          </div>
        {/if}

        <!-- Icon Tab -->
        {#if activeTab === "icon"}
          <div class="tab-panel icon-tab">
            <!-- Icon Selection -->
            <div class="selection-section">
              <label class="selection-label">Select Icon</label>
              <div class="icon-grid">
                {#each fieldIcons as icon}
                  <button
                    class="icon-option"
                    class:selected={editedIcon === icon.emoji}
                    on:click={() => selectIcon(icon.emoji)}
                    title={icon.name}
                  >
                    <span class="icon-emoji">{icon.emoji}</span>
                    <span class="icon-name">{icon.name}</span>
                  </button>
                {/each}
              </div>
            </div>
          </div>
        {/if}

        <!-- Color Tab -->
        {#if activeTab === "color"}
          <div class="tab-panel color-tab">
            <!-- Color Selection -->
            <div class="selection-section">
              <label class="selection-label">Select Color</label>
              <div class="color-grid">
                {#each fieldColors as color}
                  <button
                    class="color-option"
                    class:selected={editedColor === color.hex}
                    on:click={() => selectColor(color.hex)}
                    title={color.name}
                  >
                    <div
                      class="color-swatch"
                      style="background: {color.hex};"
                    ></div>
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

        <!-- Area Tab -->
        {#if activeTab === "area"}
          <div class="tab-panel area-tab">
            {#if hasMultipleAreas}
              <!-- Edit Sub Areas -->
              <div class="area-edit-section">
                <label class="area-edit-label">Edit Sub Areas</label>
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
                <label class="area-edit-label">Total Area (hectares)</label>
                <div class="total-area-edit-wrapper">
                  <input
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

            {#if hasAreaChanges}
              <p class="edit-hint">Ctrl+Enter to save, Esc to cancel</p>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Control Bar -->
  <div class="control-bar">
    <!-- Field Info -->
    <div class="field-info">
      <!-- Clickable Icon Display - updates in real-time -->
      <button
        class="field-icon-display"
        class:active={showEditMenu && isExpanded}
        on:click={handleIconClick}
        style="background-image: 
          linear-gradient(rgba(0, 0, 0, 0.9), rgba(0, 0, 0, 0.9)),
          linear-gradient(135deg, {showEditMenu
          ? editedColor
          : selectedField.color || '#22c55e'} 0%, {showEditMenu
          ? editedColor
          : selectedField.color || '#22c55e'}dd 50%, {showEditMenu
          ? editedColor
          : selectedField.color || '#22c55e'}aa 100%);"
      >
        <span class="field-icon"
          >{showEditMenu ? editedIcon : selectedField.icon || "🌾"}</span
        >

        <!-- Edit Badge (always show) -->
        <div class="edit-badge">
          <Edit3 size={12} />
        </div>
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
        class="control-btn info-btn"
        class:active={showDetails && isExpanded}
        on:click={handleInfoClick}
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

  /* Info Section & Edit Section */
  .info-section,
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

  .field-panel.expanded .info-section,
  .field-panel.expanded .edit-section {
    opacity: 1;
    transform: translateY(0);
  }

  /* Info section - scrollable */
  .info-section {
    padding: 16px 20px 0;
    overflow-y: auto;
  }

  /* Edit section - flex managed with tabs */
  .edit-section {
    padding: 0;
    overflow: hidden;
  }

  /* Field Header */
  .field-header {
    flex-shrink: 0;
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

  .field-date {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.6);
  }

  /* Appearance Display Section */
  .appearance-display-section {
    flex-shrink: 0;
    margin-bottom: 12px;
    padding: 12px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    border-left: 3px solid #a855f7;
  }

  .appearance-display-header {
    margin-bottom: 12px;
  }

  .appearance-label {
    font-size: 12px;
    color: #a855f7;
    font-weight: 600;
  }

  .appearance-display-content {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .icon-color-display {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .field-icon-preview {
    width: 56px;
    height: 56px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid;
  }

  .icon-preview-emoji {
    font-size: 32px;
  }

  .color-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .color-label {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.6);
  }

  .color-swatch-display {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .color-swatch-small {
    width: 20px;
    height: 20px;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.2);
  }

  .color-hex {
    font-size: 12px;
    font-family: monospace;
    color: rgba(255, 255, 255, 0.8);
  }

  /* Field Type Display Section */
  .field-type-display-section {
    flex-shrink: 0;
    margin-bottom: 12px;
    padding: 12px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    border-left: 3px solid #3b82f6;
  }

  .field-type-display-header {
    margin-bottom: 8px;
  }

  .field-type-label {
    font-size: 12px;
    color: #3b82f6;
    font-weight: 600;
  }

  .field-type-display-content {
    font-size: 14px;
    color: rgba(255, 255, 255, 0.8);
    line-height: 1.4;
  }

  /* Area Display Section */
  .area-display-section {
    flex-shrink: 0;
    margin-bottom: 12px;
    padding: 12px;
    background: rgba(34, 197, 94, 0.1);
    border-radius: 8px;
    border-left: 3px solid #22c55e;
  }

  .area-display-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .area-display-label {
    font-size: 12px;
    color: #22c55e;
    font-weight: 600;
  }

  .calculated-note {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.5);
    font-style: italic;
  }

  .area-display-value {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  .area-number {
    font-size: 28px;
    font-weight: 700;
    color: #22c55e;
  }

  .area-unit {
    font-size: 16px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.7);
  }

  /* Sub Areas Display */
  .sub-areas-display-section {
    flex-shrink: 0;
    margin-bottom: 12px;
    padding: 12px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    border-left: 3px solid #60a5fa;
  }

  .sub-areas-display-header {
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

  .sub-area-display-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: rgba(255, 255, 255, 0.05);
    padding: 8px 10px;
    border-radius: 4px;
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

  .icon-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
    gap: 10px;
  }

  .icon-option {
    background: rgba(255, 255, 255, 0.05);
    border: 2px solid transparent;
    border-radius: 8px;
    padding: 12px 8px;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }

  .icon-option:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.2);
    transform: scale(1.05);
  }

  .icon-option.selected {
    background: rgba(34, 197, 94, 0.2);
    border-color: #22c55e;
    transform: scale(1.05);
  }

  .icon-emoji {
    font-size: 32px;
  }

  .icon-name {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.7);
    text-align: center;
    font-weight: 500;
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

  /* Clickable Icon Display with Dynamic Gradient Border */
  .field-icon-display {
    position: relative;
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 50%;
    border: 2px solid transparent;
    background-origin: border-box;
    background-clip: padding-box, border-box;
    flex-shrink: 0;
    cursor: pointer;
    transition: all 0.3s ease;
    touch-action: manipulation;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
  }

  .field-icon {
    font-size: 24px;
  }

  .field-icon-display:hover {
    transform: scale(1.05);
    filter: brightness(1.2);
  }

  .field-icon-display.active {
    filter: brightness(1.3);
  }

  /* Edit Badge - Emerald green with pencil */
  .edit-badge {
    position: absolute;
    bottom: -4px;
    right: -4px;
    width: 22px;
    height: 22px;
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    border: 2px solid rgba(0, 0, 0, 0.9);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    transition: all 0.2s ease;
    box-shadow: 0 2px 8px rgba(16, 185, 129, 0.5);
  }

  .field-icon-display:hover .edit-badge {
    transform: scale(1.2) rotate(-12deg);
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.7);
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

  .info-btn {
    background: rgba(34, 197, 94, 0.2);
    color: #22c55e;
  }

  .info-btn:hover,
  .info-btn.active {
    background: rgba(34, 197, 94, 0.3);
    color: white;
  }

  /* Mobile */
  @media (max-width: 768px) {
    .info-section,
    .edit-section {
      max-height: 50vh;
      min-height: 50vh;
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
    }

    .field-icon {
      font-size: 20px;
    }

    .edit-badge {
      width: 20px;
      height: 20px;
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

    .icon-grid {
      grid-template-columns: repeat(auto-fill, minmax(70px, 1fr));
    }

    .color-grid {
      grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
    }

    .icon-emoji {
      font-size: 28px;
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
      gap: 8px;
    }

    .tab-button {
      padding: 10px 6px;
      font-size: 11px;
    }
  }

  /* Scrollbar Styling */
  .info-section::-webkit-scrollbar,
  .tab-content::-webkit-scrollbar {
    width: 4px;
  }

  .info-section::-webkit-scrollbar-track,
  .tab-content::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2px;
  }

  .info-section::-webkit-scrollbar-thumb,
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
