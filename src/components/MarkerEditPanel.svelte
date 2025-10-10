<script>
  import IconSVG from "./IconSVG.svelte"
  import {
    Edit3,
    Trash2,
    Check,
    Info,
    FileText,
    Copy,
    Plus,
    Pen,
  } from "lucide-svelte"
  import { markerApi } from "$lib/api/markerApi"
  import {
    getAllMarkers,
    findMarkerByIconClass,
  } from "$lib/data/markerDefinitions"
  import DrawingPanel from "$lib/components/DrawingPanel.svelte"
  import { markerDrawingStore } from "$lib/stores/markerDrawingStore"

  export let map
  export let getCurrentIconClass
  export let confirmMarker
  export let removeMarker
  export let centerCameraOnMarker
  export let confirmedMarkersStore
  export let selectedMarkerStore
  export let getIconImageName

  // UI State
  let showEditMenu = false
  let showInfoPanel = false
  let showDrawingPanel = false
  let isExpanded = false
  let selectedMarkerIsNew = false
  let lastMarkerId = null

  // Track if we should re-open after drawing
  let shouldReopenAfterDrawing = false
  let previousMarkerId = null

  // Unified notes state
  let markerNotes = ""
  let showNotesSection = false
  let originalNotes = ""

  // Notes editing in info panel
  let editingNotesInInfo = false
  let infoNotesValue = ""

  // Icon selection state
  let selectedIconForEdit = null
  let pendingIconChange = false
  let originalIconClass = null

  // Preview icon state for bottom bar
  let previewIconClass = null

  // Reference to DrawingPanel
  let drawingPanelRef

  // Get current marker data
  $: currentMarker = $selectedMarkerStore
    ? $confirmedMarkersStore.find((m) => m.id === $selectedMarkerStore.id)
    : null
  $: selectedMarkerIsNew = $selectedMarkerStore && !currentMarker

  // Auto-open edit menu for new markers
  $: if (selectedMarkerIsNew && !showEditMenu) {
    showEditMenu = true
    showInfoPanel = false
    showDrawingPanel = false
    isExpanded = true
    markerNotes = ""
    originalNotes = ""
    showNotesSection = false
    previewIconClass = null
  }

  // Update notes when switching markers
  $: {
    const currentMarkerId = currentMarker?.id
    if (currentMarkerId !== lastMarkerId) {
      markerNotes = currentMarker?.notes || ""
      originalNotes = currentMarker?.notes || ""
      infoNotesValue = currentMarker?.notes || ""
      editingNotesInInfo = false
      lastMarkerId = currentMarkerId
    }
  }

  // Watch for drawing completion and re-open panel
  $: {
    const isDrawing = $markerDrawingStore.isActive

    // If drawing just finished for our marker, re-open the drawing panel
    if (
      !isDrawing &&
      shouldReopenAfterDrawing &&
      previousMarkerId === currentMarker?.id
    ) {
      shouldReopenAfterDrawing = false
      previousMarkerId = null

      // Re-open the drawing panel
      setTimeout(() => {
        showDrawingPanel = true
        showEditMenu = false
        showInfoPanel = false
        isExpanded = true
      }, 100)
    }
  }

  // Check if there are pending changes (icon OR notes)
  $: hasChanges =
    pendingIconChange || markerNotes.trim() !== originalNotes.trim()

  // Get the icon class to display (preview or current)
  $: displayIconClass =
    previewIconClass || getCurrentIconClass($selectedMarkerStore?.id)

  // Reactive function for icon selection
  $: getIsIconSelected = (icon) => {
    if (selectedIconForEdit) {
      return (
        selectedIconForEdit.id === icon.id &&
        selectedIconForEdit.class === icon.class
      )
    }

    const currentIconClass = getCurrentIconClass($selectedMarkerStore?.id)

    if (!currentIconClass || currentIconClass === "default") {
      return icon.id === "default" && icon.class === "default"
    }

    if (currentIconClass.startsWith("custom-svg-")) {
      return (
        icon.class === "custom-svg" &&
        icon.id === currentIconClass.replace("custom-svg-", "")
      )
    }

    return icon.class === currentIconClass
  }

  // Use unified marker definitions
  const allMarkerIcons = getAllMarkers()
  $: selectableMarkers = allMarkerIcons.filter((m) => m.active)

  // Get marker name
  function getMarkerName(iconClass) {
    const marker = findMarkerByIconClass(iconClass)
    return marker?.name || "Marker"
  }

  // Handle drawing start - close this panel
  function handleDrawingStart() {
    shouldReopenAfterDrawing = true
    previousMarkerId = currentMarker?.id

    // Close this panel
    showDrawingPanel = false
    showEditMenu = false
    showInfoPanel = false
    isExpanded = false
  }

  // Handle drawing complete - re-open and refresh
  function handleDrawingComplete() {
    isExpanded = true
    showDrawingPanel = true
    showEditMenu = false
    showInfoPanel = false

    // Refresh the drawings list
    if (drawingPanelRef) {
      drawingPanelRef.refreshDrawings()
    }
  }

  // Close all panels
  function closeAllPanels() {
    if (pendingIconChange && originalIconClass && $selectedMarkerStore) {
      revertIconChange()
    }

    showEditMenu = false
    showInfoPanel = false
    showDrawingPanel = false
    isExpanded = false
    selectedIconForEdit = null
    pendingIconChange = false
    originalIconClass = null
    markerNotes = ""
    originalNotes = ""
    showNotesSection = false
    previewIconClass = null
    editingNotesInInfo = false
    infoNotesValue = ""
  }

  // Format creation date
  function formatCreationDate(dateString) {
    if (!dateString) return "Unknown"
    const date = new Date(dateString)
    return date.toLocaleString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })
  }

  // Format coordinates
  function formatCoordinates(coordinates) {
    if (!coordinates || coordinates.length !== 2) return "N/A"
    const [lng, lat] = coordinates
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`
  }

  // Copy coordinates to clipboard
  async function copyCoordinates() {
    if (!$selectedMarkerStore?.coordinates) return

    const [lng, lat] = $selectedMarkerStore.coordinates
    const coordText = `${lat.toFixed(6)}, ${lng.toFixed(6)}`

    try {
      await navigator.clipboard.writeText(coordText)
      console.log("Coordinates copied:", coordText)
    } catch (err) {
      console.error("Failed to copy coordinates:", err)
    }
  }

  // Start editing notes in info panel
  function startEditingInfoNotes() {
    infoNotesValue = currentMarker?.notes || ""
    editingNotesInInfo = true
  }

  // Save notes from info panel
  async function saveInfoNotes() {
    if (!currentMarker) return

    try {
      const result = await markerApi.updateMarkerNotes(
        currentMarker.id,
        infoNotesValue,
      )

      if (!result.success) {
        throw new Error(result.message)
      }

      confirmedMarkersStore.update((markers) => {
        const existingIndex = markers.findIndex(
          (m) => m.id === currentMarker.id,
        )
        if (existingIndex >= 0) {
          markers[existingIndex] = {
            ...markers[existingIndex],
            notes: infoNotesValue.trim() || undefined,
            updated_at: new Date().toISOString(),
          }
        }
        return markers
      })

      editingNotesInInfo = false
      originalNotes = infoNotesValue.trim()
    } catch (error) {
      console.error("Error saving notes:", error)
      alert(`Failed to save notes: ${error.message}`)
    }
  }

  // Cancel editing notes in info panel
  function cancelEditingInfoNotes() {
    editingNotesInInfo = false
    infoNotesValue = currentMarker?.notes || ""
  }

  // Handle icon selection with preview
  function handleIconPreview(icon) {
    if (!$selectedMarkerStore) return

    if (!pendingIconChange) {
      originalIconClass = getCurrentIconClass($selectedMarkerStore.id)
      pendingIconChange = true
    }

    selectedIconForEdit = icon

    previewIconClass =
      icon.id === "default"
        ? "default"
        : icon.class.startsWith("custom-svg")
          ? `custom-svg-${icon.id}`
          : icon.class

    const { id } = $selectedMarkerStore
    const source = map.getSource("markers")
    const data = source._data
    const feature = data.features.find((f) => f.properties.id === id)

    if (feature) {
      const newIconClass =
        icon.id === "default"
          ? "default"
          : icon.class.startsWith("custom-svg")
            ? `custom-svg-${icon.id}`
            : icon.class

      feature.properties.icon = getIconImageName(newIconClass)
      feature.properties.iconClass = newIconClass
      source.setData(data)
    }
  }

  // Confirm changes
  function handleConfirmMarker() {
    if (selectedMarkerIsNew) {
      confirmNewMarker()
    } else {
      confirmChanges()
    }
  }

  // Confirm new marker with notes
  function confirmNewMarker() {
    if (!$selectedMarkerStore) return

    const { id, coordinates } = $selectedMarkerStore
    const iconClass = getCurrentIconClass(id)

    const markerData = {
      id,
      coordinates,
      iconClass,
      notes: markerNotes.trim() || undefined,
      created_at: new Date().toISOString(),
    }

    confirmedMarkersStore.update((markers) => {
      const existingIndex = markers.findIndex((m) => m.id === id)
      if (existingIndex >= 0) {
        markers[existingIndex] = markerData
        return markers
      }
      return [...markers, markerData]
    })

    if (map && map.getSource("markers")) {
      const source = map.getSource("markers")
      const data = source._data
      const feature = data.features.find((f) => f.properties.id === id)

      if (feature) {
        feature.properties.selected = false
        feature.properties.confirmed = true
        source.setData(data)
      }
    }

    markerNotes = ""
    originalNotes = ""
    showNotesSection = false
    selectedMarkerStore.set(null)
    showEditMenu = false
    isExpanded = false
    previewIconClass = null
  }

  // Confirm changes to existing marker
  async function confirmChanges() {
    if (!$selectedMarkerStore || !currentMarker) return

    const newIconClass = selectedIconForEdit
      ? selectedIconForEdit.id === "default"
        ? "default"
        : selectedIconForEdit.class.startsWith("custom-svg")
          ? `custom-svg-${selectedIconForEdit.id}`
          : selectedIconForEdit.class
      : currentMarker.iconClass

    const notesChanged = markerNotes.trim() !== originalNotes.trim()

    if (notesChanged) {
      try {
        const result = await markerApi.updateMarkerNotes(
          currentMarker.id,
          markerNotes,
        )

        if (!result.success) {
          throw new Error(result.message)
        }
      } catch (error) {
        console.error("Error saving notes:", error)
        alert(`Failed to save notes: ${error.message}`)
        return
      }
    }

    confirmedMarkersStore.update((markers) => {
      const existingIndex = markers.findIndex(
        (m) => m.id === $selectedMarkerStore.id,
      )
      if (existingIndex >= 0) {
        markers[existingIndex] = {
          ...markers[existingIndex],
          iconClass: newIconClass,
          notes: markerNotes.trim() || undefined,
          updated_at: new Date().toISOString(),
        }
      }
      return markers
    })

    selectedIconForEdit = null
    pendingIconChange = false
    originalIconClass = null
    originalNotes = markerNotes.trim()
    showEditMenu = false
    isExpanded = false
    showNotesSection = false
    previewIconClass = null
  }

  // Revert icon change
  function revertIconChange() {
    if (!originalIconClass || !$selectedMarkerStore) return

    const { id } = $selectedMarkerStore
    const source = map.getSource("markers")
    const data = source._data
    const feature = data.features.find((f) => f.properties.id === id)

    if (feature) {
      feature.properties.icon = getIconImageName(originalIconClass)
      feature.properties.iconClass = originalIconClass
      source.setData(data)
    }

    previewIconClass = null
  }

  // Handle icon circle click to open edit menu
  function handleIconClick() {
    if ($selectedMarkerStore?.coordinates) {
      centerCameraOnMarker($selectedMarkerStore.coordinates)
    }

    if (!selectedMarkerIsNew) {
      markerNotes = currentMarker?.notes || ""
      originalNotes = currentMarker?.notes || ""
    }

    showEditMenu = !showEditMenu
    showInfoPanel = false
    showDrawingPanel = false
    isExpanded = showEditMenu
    showNotesSection = false
  }

  // Handle info button click
  function handleInfoClick() {
    if ($selectedMarkerStore?.coordinates) {
      centerCameraOnMarker($selectedMarkerStore.coordinates)
    }

    showInfoPanel = !showInfoPanel
    showEditMenu = false
    showDrawingPanel = false
    isExpanded = showInfoPanel
    editingNotesInInfo = false
  }

  // Handle drawing button click
  function handleDrawingClick() {
    if ($selectedMarkerStore?.coordinates) {
      centerCameraOnMarker($selectedMarkerStore.coordinates)
    }

    showDrawingPanel = !showDrawingPanel
    showInfoPanel = false
    showEditMenu = false
    isExpanded = showDrawingPanel
  }

  // Toggle notes section
  function toggleNotesSection() {
    showNotesSection = !showNotesSection
  }
</script>

<!-- Marker Panel -->
<div class="marker-panel" class:expanded={isExpanded}>
  <!-- Info Section -->
  {#if isExpanded && showInfoPanel && !selectedMarkerIsNew}
    <div class="info-section">
      <div class="marker-header">
        <div class="marker-title">
          <span class="marker-label"
            >{getMarkerName(getCurrentIconClass($selectedMarkerStore.id))}</span
          >
          <span class="marker-date"
            >{formatCreationDate(currentMarker?.created_at)}</span
          >
        </div>
      </div>

      {#if editingNotesInInfo}
        <div class="notes-edit-section-info">
          <div class="notes-header-info">
            <span class="notes-label">📝 Edit Notes</span>
            <div class="notes-actions">
              <button class="notes-action-btn save" on:click={saveInfoNotes}>
                <Check size={14} />
              </button>
              <button
                class="notes-action-btn cancel"
                on:click={cancelEditingInfoNotes}
              >
                ✕
              </button>
            </div>
          </div>
          <textarea
            bind:value={infoNotesValue}
            placeholder="Add notes about this marker..."
            class="notes-input-info"
            rows="3"
            maxlength="500"
          ></textarea>
        </div>
      {:else if currentMarker?.notes}
        <div class="notes-display-section">
          <div class="notes-display-header">
            <span class="notes-label">📝 Notes</span>
            <button class="edit-notes-btn" on:click={startEditingInfoNotes}>
              <Edit3 size={14} />
            </button>
          </div>
          <div class="notes-display-content">
            {currentMarker.notes}
          </div>
        </div>
      {:else}
        <div class="add-notes-section">
          <button class="add-notes-btn" on:click={startEditingInfoNotes}>
            <Plus size={16} />
            <FileText size={16} />
            <span>Add Notes</span>
          </button>
        </div>
      {/if}

      <div class="coordinates-section">
        <div class="coord-item">
          <div class="coord-header">
            <span class="coord-label">📍 Location</span>
            <button
              class="copy-btn"
              on:click={copyCoordinates}
              title="Copy coordinates"
            >
              <Copy size={14} />
            </button>
          </div>
          <span class="coord-value"
            >{formatCoordinates($selectedMarkerStore?.coordinates)}</span
          >
        </div>
      </div>
    </div>
  {/if}

  <!-- Edit Section -->
  {#if isExpanded && showEditMenu}
    <div class="icon-section">
      <div class="icon-section-header">
        <span class="section-title">
          {selectedMarkerIsNew ? "Choose Icon for New Marker" : "Edit Marker"}
        </span>
        <div class="icon-actions">
          <button
            class="notes-toggle-btn"
            class:active={showNotesSection}
            on:click={toggleNotesSection}
          >
            <FileText size={16} />
            <span class="btn-text">Notes</span>
          </button>

          {#if hasChanges || selectedMarkerIsNew}
            <button class="confirm-icon-btn" on:click={handleConfirmMarker}>
              <Check size={16} />
              <span class="btn-text">Confirm</span>
            </button>
          {/if}
        </div>
      </div>

      {#if showNotesSection}
        <div class="notes-edit-section">
          <textarea
            bind:value={markerNotes}
            placeholder="Add notes about this marker..."
            class="notes-input"
            rows="3"
            maxlength="500"
          ></textarea>
        </div>
      {/if}

      <div class="icon-grid-container">
        <div class="icon-grid">
          {#each selectableMarkers as icon}
            <button
              class="icon-option"
              class:selected={getIsIconSelected(icon)}
              on:click={() => handleIconPreview(icon)}
            >
              {#if icon.id === "default"}
                <IconSVG icon="mapbox-marker" size="28px" />
              {:else if icon.class.startsWith("custom-svg")}
                <IconSVG icon={icon.id} size="28px" />
              {:else if icon.class.startsWith("ionic-")}
                <ion-icon name={icon.id} style="font-size: 28px;"></ion-icon>
              {:else}
                <i class={`${icon.class} text-2xl`}></i>
              {/if}
            </button>
          {/each}
        </div>
      </div>
    </div>
  {/if}

  <!-- Drawing Section -->
  {#if isExpanded && showDrawingPanel && !selectedMarkerIsNew}
    <DrawingPanel
      bind:this={drawingPanelRef}
      {map}
      {currentMarker}
      {getCurrentIconClass}
      onStartDrawing={handleDrawingStart}
    />
  {/if}

  <!-- Control Bar -->
  <div class="control-bar">
    <div class="marker-info">
      <button
        class="marker-icon-display"
        class:active={showEditMenu && isExpanded}
        on:click={handleIconClick}
      >
        {#if displayIconClass === "default"}
          <IconSVG icon="mapbox-marker" size="28px" />
        {:else if displayIconClass?.startsWith("custom-svg")}
          <IconSVG
            icon={displayIconClass?.replace("custom-svg-", "")}
            size="28px"
          />
        {:else if displayIconClass?.startsWith("ionic-")}
          <ion-icon
            name={displayIconClass?.replace("ionic-", "")}
            style="font-size: 28px;"
          ></ion-icon>
        {:else}
          <IconSVG icon="mapbox-marker" size="28px" />
        {/if}

        {#if !selectedMarkerIsNew}
          <div class="edit-badge">
            <Edit3 size={12} />
          </div>
        {/if}
      </button>

      <div class="marker-text-info">
        <span class="marker-name">
          {getMarkerName(displayIconClass)}
        </span>
        {#if markerNotes && showEditMenu}
          <span class="marker-notes-preview marker-notes-desktop">
            - {markerNotes}</span
          >
          <span class="marker-notes-preview marker-notes-mobile"
            >{markerNotes}</span
          >
        {:else if currentMarker?.notes && !showEditMenu}
          <span class="marker-notes-preview marker-notes-desktop">
            - {currentMarker.notes}</span
          >
          <span class="marker-notes-preview marker-notes-mobile"
            >{currentMarker.notes}</span
          >
        {/if}
      </div>
    </div>

    <div class="action-controls">
      {#if selectedMarkerIsNew}
        <button class="control-btn confirm-btn" on:click={handleConfirmMarker}>
          <Check size={20} />
        </button>
      {:else}
        <button
          class="control-btn info-btn"
          class:active={showInfoPanel && isExpanded}
          on:click={handleInfoClick}
        >
          <Info size={20} />
        </button>

        <button
          class="control-btn drawing-btn"
          class:active={showDrawingPanel && isExpanded}
          on:click={handleDrawingClick}
        >
          <Pen size={20} />
        </button>
      {/if}

      <button class="control-btn delete-btn" on:click={removeMarker}>
        <Trash2 size={20} />
      </button>
    </div>
  </div>
</div>

<style>
  /* Main Marker Panel */
  .marker-panel {
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

  /* Info Section & Icon Section */
  .info-section,
  .icon-section {
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
  }

  .marker-panel.expanded .info-section,
  .marker-panel.expanded .icon-section {
    opacity: 1;
    transform: translateY(0);
  }

  .info-section {
    padding: 16px 20px 0;
    overflow-y: auto;
  }

  .icon-section {
    padding: 16px 20px 0;
    overflow: hidden;
  }

  /* Marker Header */
  .marker-header {
    flex-shrink: 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .marker-title {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .marker-label {
    font-size: 16px;
    font-weight: 600;
    color: white;
  }

  .marker-date {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.6);
  }

  /* Add Notes Button */
  .add-notes-section {
    flex-shrink: 0;
    margin-bottom: 12px;
  }

  .add-notes-btn {
    width: 100%;
    background: rgba(34, 197, 94, 0.1);
    border: 1px dashed rgba(34, 197, 94, 0.4);
    border-radius: 8px;
    padding: 10px 12px;
    color: #22c55e;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-size: 14px;
    font-weight: 500;
  }

  .add-notes-btn:hover {
    background: rgba(34, 197, 94, 0.2);
    border-color: #22c55e;
    transform: scale(1.01);
  }

  /* Notes Display Section */
  .notes-display-section {
    flex-shrink: 0;
    margin-bottom: 12px;
    padding: 12px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    border-left: 3px solid #22c55e;
  }

  .notes-display-header {
    margin-bottom: 8px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .notes-label {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.6);
    font-weight: 500;
  }

  .edit-notes-btn {
    background: rgba(96, 165, 250, 0.2);
    border: none;
    border-radius: 4px;
    padding: 4px 6px;
    color: #60a5fa;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .edit-notes-btn:hover {
    background: rgba(96, 165, 250, 0.3);
    transform: scale(1.05);
  }

  .notes-display-content {
    font-size: 14px;
    color: rgba(255, 255, 255, 0.8);
    line-height: 1.4;
    white-space: pre-wrap;
  }

  /* Notes Edit Section in Info Panel */
  .notes-edit-section-info {
    flex-shrink: 0;
    margin-bottom: 12px;
    padding: 12px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    border-left: 3px solid #22c55e;
  }

  .notes-header-info {
    margin-bottom: 8px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .notes-actions {
    display: flex;
    gap: 6px;
  }

  .notes-action-btn {
    background: rgba(96, 165, 250, 0.2);
    border: none;
    border-radius: 4px;
    padding: 4px 6px;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
  }

  .notes-action-btn.save {
    background: rgba(34, 197, 94, 0.2);
    color: #22c55e;
  }

  .notes-action-btn.save:hover {
    background: rgba(34, 197, 94, 0.3);
  }

  .notes-action-btn.cancel {
    background: rgba(239, 68, 68, 0.2);
    color: #ef4444;
  }

  .notes-action-btn.cancel:hover {
    background: rgba(239, 68, 68, 0.3);
  }

  .notes-input-info {
    width: 100%;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 6px;
    padding: 8px 10px;
    color: white;
    font-size: 13px;
    resize: vertical;
    min-height: 50px;
    line-height: 1.4;
  }

  .notes-input-info:focus {
    outline: none;
    border-color: #22c55e;
    background: rgba(255, 255, 255, 0.15);
  }

  .notes-input-info::placeholder {
    color: rgba(255, 255, 255, 0.4);
  }

  /* Coordinates Section */
  .coordinates-section {
    flex-shrink: 0;
    margin-bottom: 12px;
    padding: 12px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    border-left: 3px solid #60a5fa;
  }

  .coord-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .coord-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .coord-label {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.6);
    font-weight: 500;
  }

  .copy-btn {
    background: rgba(96, 165, 250, 0.2);
    border: none;
    border-radius: 4px;
    padding: 4px 6px;
    color: #60a5fa;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .copy-btn:hover {
    background: rgba(96, 165, 250, 0.3);
    transform: scale(1.05);
  }

  .copy-btn:active {
    transform: scale(0.95);
  }

  .coord-value {
    font-size: 13px;
    font-weight: 600;
    color: #60a5fa;
    font-family: monospace;
  }

  /* Notes Edit Section (Edit tab) */
  .notes-edit-section {
    flex-shrink: 0;
    margin-bottom: 12px;
    padding: 8px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    border-left: 3px solid #22c55e;
  }

  .notes-input {
    width: 100%;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 6px;
    padding: 8px 10px;
    color: white;
    font-size: 13px;
    resize: vertical;
    min-height: 50px;
    line-height: 1.4;
  }

  .notes-input:focus {
    outline: none;
    border-color: #22c55e;
    background: rgba(255, 255, 255, 0.15);
  }

  .notes-input::placeholder {
    color: rgba(255, 255, 255, 0.4);
  }

  /* Icon Section Header */
  .icon-section-header {
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

  .icon-actions {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .notes-toggle-btn {
    background: rgba(96, 165, 250, 0.2);
    border: 1px solid rgba(96, 165, 250, 0.4);
    border-radius: 6px;
    padding: 6px 12px;
    color: #60a5fa;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 13px;
    font-weight: 500;
  }

  .notes-toggle-btn:hover,
  .notes-toggle-btn.active {
    background: rgba(96, 165, 250, 0.3);
    color: white;
    transform: scale(1.05);
  }

  .confirm-icon-btn {
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

  .confirm-icon-btn:hover {
    background: rgba(34, 197, 94, 0.3);
    color: white;
    transform: scale(1.05);
  }

  /* Icon Grid Container */
  .icon-grid-container {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 8px 2px 0 2px;
  }

  .icon-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
    gap: 12px;
    padding-bottom: 16px;
  }

  .icon-option {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 80px;
    height: 80px;
    background: rgba(255, 255, 255, 0.05);
    border: 2px solid transparent;
    border-radius: 12px;
    color: rgba(255, 255, 255, 0.8);
    cursor: pointer;
    transition: all 0.2s ease;
    position: relative;
  }

  .icon-option:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.1);
    transform: scale(1.02);
  }

  .icon-option.selected {
    background: rgba(96, 165, 250, 0.2);
    border-color: #60a5fa;
    color: #60a5fa;
    transform: scale(1.05);
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

  .marker-info {
    display: flex;
    align-items: center;
    gap: 16px;
    flex: 1;
    min-width: 0;
  }

  .marker-icon-display {
    position: relative;
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 50%;
    border: 2px solid transparent;
    background-image:
      linear-gradient(rgba(0, 0, 0, 0.9), rgba(0, 0, 0, 0.9)),
      linear-gradient(135deg, #60a5fa 0%, #3b82f6 50%, #2563eb 100%);
    background-origin: border-box;
    background-clip: padding-box, border-box;
    color: #60a5fa;
    flex-shrink: 0;
    cursor: pointer;
    transition: all 0.3s ease;
    touch-action: manipulation;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
  }

  .marker-icon-display:hover {
    background-image:
      linear-gradient(rgba(96, 165, 250, 0.2), rgba(96, 165, 250, 0.2)),
      linear-gradient(135deg, #60a5fa 0%, #3b82f6 50%, #2563eb 100%);
    transform: scale(1.05);
    filter: brightness(1.2);
  }

  .marker-icon-display.active {
    background-image:
      linear-gradient(rgba(96, 165, 250, 0.3), rgba(96, 165, 250, 0.3)),
      linear-gradient(135deg, #60a5fa 0%, #3b82f6 50%, #2563eb 100%);
    color: white;
  }

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

  .marker-icon-display:hover .edit-badge {
    transform: scale(1.2) rotate(-12deg);
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.7);
  }

  .marker-text-info {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    gap: 2px;
  }

  .marker-name {
    font-size: 18px;
    font-weight: 600;
    color: white;
    text-overflow: ellipsis;
    overflow: hidden;
    white-space: nowrap;
    line-height: 1.2;
  }

  .marker-notes-preview {
    font-size: 14px;
    font-weight: 400;
    color: rgba(255, 255, 255, 0.6);
    font-style: italic;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .marker-notes-mobile {
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

  .confirm-btn {
    background: rgba(34, 197, 94, 0.2);
    color: #22c55e;
  }

  .confirm-btn:hover {
    background: rgba(34, 197, 94, 0.3);
    color: white;
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

  .drawing-btn {
    background: rgba(168, 85, 247, 0.2);
    color: #a855f7;
  }

  .drawing-btn:hover,
  .drawing-btn.active {
    background: rgba(168, 85, 247, 0.3);
    color: white;
  }

  .delete-btn {
    background: rgba(239, 68, 68, 0.2);
    color: #ef4444;
  }

  .delete-btn:hover {
    background: rgba(239, 68, 68, 0.3);
    color: white;
  }

  /* Mobile */
  @media (max-width: 768px) {
    .info-section,
    .icon-section {
      max-height: 35.5vh;
      min-height: 35.5vh;
    }

    .control-bar {
      padding: 16px 20px;
      min-height: 68px;
    }

    .control-btn {
      width: 44px;
      height: 44px;
    }

    .marker-icon-display {
      width: 44px;
      height: 44px;
    }

    .edit-badge {
      width: 20px;
      height: 20px;
    }

    .marker-info {
      gap: 12px;
    }

    .marker-name {
      font-size: 16px;
    }

    .marker-notes-desktop {
      display: none;
    }

    .marker-notes-mobile {
      display: block;
      font-size: 11px;
      line-height: 1.3;
      margin-top: 2px;
    }

    .icon-grid {
      grid-template-columns: repeat(auto-fit, minmax(70px, 1fr));
      gap: 10px;
    }

    .icon-option {
      width: 70px;
      height: 70px;
    }

    .section-title {
      font-size: 14px;
    }

    .btn-text {
      display: none;
    }

    .notes-toggle-btn,
    .confirm-icon-btn {
      padding: 6px 8px;
      gap: 0;
    }
  }

  @media (max-width: 360px) {
    .marker-name {
      font-size: 14px;
    }

    .marker-notes-mobile {
      font-size: 10px;
    }

    .section-title {
      font-size: 12px;
    }

    .marker-info {
      gap: 8px;
    }

    .action-controls {
      gap: 8px;
    }
  }

  /* Scrollbar Styling */
  .info-section::-webkit-scrollbar,
  .icon-grid-container::-webkit-scrollbar {
    width: 4px;
  }

  .info-section::-webkit-scrollbar-track,
  .icon-grid-container::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2px;
  }

  .info-section::-webkit-scrollbar-thumb,
  .icon-grid-container::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.3);
    border-radius: 2px;
  }
</style>
