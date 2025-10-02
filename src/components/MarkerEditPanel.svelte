<script>
  import IconSVG from "./IconSVG.svelte"
  import { Edit3, Trash2, Check, Info, FileText } from "lucide-svelte"
  import { markerApi } from "$lib/api/markerApi"
  import {
    getAllMarkers,
    findMarkerByIconClass,
  } from "$lib/data/markerDefinitions"

  export let map
  export let getCurrentIconClass
  export let confirmMarker
  export let removeMarker
  export let centerCameraOnMarker
  export let confirmedMarkersStore
  export let selectedMarkerStore
  export let getIconImageName

  // UI State - matching trail highlighter pattern
  let showEditMenu = false
  let showInfoPanel = false
  let isExpanded = false
  let selectedMarkerIsNew = false
  let editingNotes = false
  let markerNotes = ""
  let lastMarkerId = null // Track marker changes

  // New marker notes state
  let newMarkerNotes = "" // Notes for new markers before confirmation
  let showNotesForNewMarker = false

  // Icon selection state
  let selectedIconForEdit = null
  let pendingIconChange = false
  let originalIconClass = null

  // Get current marker data - check if it exists in confirmed store
  $: currentMarker = $selectedMarkerStore
    ? $confirmedMarkersStore.find((m) => m.id === $selectedMarkerStore.id)
    : null
  $: selectedMarkerIsNew = $selectedMarkerStore && !currentMarker

  // Auto-open edit menu for new markers and reset new marker notes
  $: if (selectedMarkerIsNew && !showEditMenu) {
    showEditMenu = true
    showInfoPanel = false
    isExpanded = true
    newMarkerNotes = "" // Reset notes for new marker
    showNotesForNewMarker = false // Start with notes section collapsed
  }

  // FIXED: Only update notes when marker changes, not on every reactive cycle
  $: {
    const currentMarkerId = currentMarker?.id
    if (currentMarkerId !== lastMarkerId) {
      markerNotes = currentMarker?.notes || ""
      editingNotes = false // Reset editing state when switching markers
      lastMarkerId = currentMarkerId
    }
  }

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

  // Use unified marker definitions - ALL markers for backward compatibility
  const allMarkerIcons = getAllMarkers()

  // Filter to only show active markers in the selection UI
  $: selectableMarkers = allMarkerIcons.filter((m) => m.active)

  // Get marker name using the unified system
  function getMarkerName(iconClass) {
    const marker = findMarkerByIconClass(iconClass)
    return marker?.name || "Marker"
  }

  // Close all panels
  function closeAllPanels() {
    // If there are pending changes, revert them
    if (pendingIconChange && originalIconClass && $selectedMarkerStore) {
      revertIconChange()
    }

    showEditMenu = false
    showInfoPanel = false
    isExpanded = false
    editingNotes = false
    selectedIconForEdit = null
    pendingIconChange = false
    originalIconClass = null
    newMarkerNotes = ""
    showNotesForNewMarker = false
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

  // Format coordinates for display
  function formatCoordinates(coordinates) {
    if (!coordinates || coordinates.length !== 2) return "N/A"
    const [lng, lat] = coordinates
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`
  }

  // Save marker notes to database
  async function saveMarkerNotes() {
    if (!currentMarker) return

    try {
      const result = await markerApi.updateMarkerNotes(
        currentMarker.id,
        markerNotes,
      )

      if (!result.success) {
        throw new Error(result.message)
      }

      // Update the confirmed store with the new notes
      confirmedMarkersStore.update((markers) => {
        const existingIndex = markers.findIndex(
          (m) => m.id === currentMarker.id,
        )
        if (existingIndex >= 0) {
          markers[existingIndex] = {
            ...markers[existingIndex],
            notes: markerNotes.trim(),
            updated_at: new Date().toISOString(),
          }
        }
        return markers
      })

      editingNotes = false
      console.log("Notes saved")
    } catch (error) {
      console.error("Error saving notes:", error)
      alert(`Failed to save notes: ${error.message}`)
    }
  }

  // Handle icon selection with immediate visual feedback
  function handleIconPreview(icon) {
    if (!$selectedMarkerStore) return

    // Store original icon class if this is the first change
    if (!pendingIconChange) {
      originalIconClass = getCurrentIconClass($selectedMarkerStore.id)
      pendingIconChange = true
    }

    selectedIconForEdit = icon

    // Immediately update the icon on the map for preview
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

  // Confirm marker (handles both new markers and icon changes) - Updated to include notes
  function handleConfirmMarker() {
    if (selectedMarkerIsNew) {
      // For new markers, confirm the marker itself with notes
      confirmMarkerWithNotes()
    } else if (pendingIconChange && selectedIconForEdit) {
      // For existing markers, just confirm the icon change
      confirmIconChange()
    }
  }

  // New function to confirm marker with notes - FIXED: Clear selection properly
  function confirmMarkerWithNotes() {
    if (!$selectedMarkerStore) return

    const { id, coordinates } = $selectedMarkerStore
    const iconClass = getCurrentIconClass(id)

    const markerData = {
      id,
      coordinates,
      iconClass,
      notes: newMarkerNotes.trim() || undefined, // Only include notes if they exist
      created_at: new Date().toISOString(),
    }

    console.log("Confirming new marker with notes:", markerData)

    // Update the confirmed store
    confirmedMarkersStore.update((markers) => {
      const existingIndex = markers.findIndex((m) => m.id === id)
      if (existingIndex >= 0) {
        markers[existingIndex] = markerData
        return markers
      }
      return [...markers, markerData]
    })

    // FIXED: Update the map marker to remove selection state immediately
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

    // Reset states
    newMarkerNotes = ""
    showNotesForNewMarker = false
    selectedMarkerStore.set(null)
    showEditMenu = false
    isExpanded = false
  }

  // Confirm icon change and sync to server
  function confirmIconChange() {
    if (!selectedIconForEdit || !$selectedMarkerStore) return

    const newIconClass =
      selectedIconForEdit.id === "default"
        ? "default"
        : selectedIconForEdit.class.startsWith("custom-svg")
          ? `custom-svg-${selectedIconForEdit.id}`
          : selectedIconForEdit.class

    // Update the confirmed store to sync to server
    confirmedMarkersStore.update((markers) => {
      const existingIndex = markers.findIndex(
        (m) => m.id === $selectedMarkerStore.id,
      )
      if (existingIndex >= 0) {
        markers[existingIndex] = {
          ...markers[existingIndex],
          iconClass: newIconClass,
        }
      }
      return markers
    })

    console.log("Confirmed icon change and synced to server:", newIconClass)

    // Reset selection state
    selectedIconForEdit = null
    pendingIconChange = false
    originalIconClass = null
    showEditMenu = false
    isExpanded = false
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
  }

  // Handle edit button click - only center camera, don't zoom
  function handleEditClick() {
    if ($selectedMarkerStore?.coordinates) {
      centerCameraOnMarker($selectedMarkerStore.coordinates)
    }

    showEditMenu = !showEditMenu
    showInfoPanel = false
    isExpanded = showEditMenu
  }

  // Handle info button click - RESTORED: Center camera on info click
  function handleInfoClick() {
    if ($selectedMarkerStore?.coordinates) {
      centerCameraOnMarker($selectedMarkerStore.coordinates)
    }

    showInfoPanel = !showInfoPanel
    showEditMenu = false
    isExpanded = showInfoPanel
  }

  // Toggle notes section for new markers
  function toggleNotesForNewMarker() {
    showNotesForNewMarker = !showNotesForNewMarker
  }
</script>

<!-- Marker Panel - Trail Highlighter Style -->
<div class="marker-panel" class:expanded={isExpanded}>
  <!-- Info Section (Only visible when expanded) -->
  {#if isExpanded && showInfoPanel && !selectedMarkerIsNew}
    <div class="info-section">
      <!-- Marker Header -->
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

      <!-- Notes Section - MOVED UP -->
      <div class="notes-section">
        <div class="notes-header">
          <span class="notes-label">📝 Notes</span>
          {#if !editingNotes}
            <button
              class="edit-notes-btn"
              on:click={() => (editingNotes = true)}
            >
              <Edit3 size={16} />
              <span class="btn-text">Edit</span>
            </button>
          {:else}
            <button class="save-notes-btn" on:click={saveMarkerNotes}>
              <Check size={16} />
              <span class="btn-text">Save</span>
            </button>
          {/if}
        </div>

        {#if editingNotes}
          <textarea
            bind:value={markerNotes}
            placeholder="Add notes about this marker..."
            class="notes-input"
            rows="4"
            maxlength="500"
          ></textarea>
          <div class="char-count">{markerNotes.length}/500</div>
        {:else}
          <div class="notes-display">
            {markerNotes || "No notes added yet. Click edit to add notes."}
          </div>
        {/if}
      </div>

      <!-- Coordinates Section - MOVED BELOW NOTES -->
      <div class="coordinates-section">
        <div class="coord-item">
          <span class="coord-label">📍 Location</span>
          <span class="coord-value"
            >{formatCoordinates($selectedMarkerStore?.coordinates)}</span
          >
        </div>
      </div>
    </div>
  {/if}

  <!-- Icon Selection Section (Visible when expanded and editing OR when marker is new) -->
  {#if isExpanded && (showEditMenu || selectedMarkerIsNew)}
    <div class="icon-section">
      <div class="icon-section-header">
        <span class="section-title">
          {selectedMarkerIsNew ? "Choose Icon for New Marker" : "Choose Icon"}
        </span>
        <div class="icon-actions">
          {#if selectedMarkerIsNew}
            <!-- Notes button for new markers -->
            <button
              class="notes-toggle-btn"
              class:active={showNotesForNewMarker}
              on:click={toggleNotesForNewMarker}
            >
              <FileText size={16} />
              <span class="btn-text">Notes</span>
            </button>
          {/if}
          {#if pendingIconChange || selectedMarkerIsNew}
            <button class="confirm-icon-btn" on:click={handleConfirmMarker}>
              <Check size={16} />
              <span class="btn-text"
                >{selectedMarkerIsNew ? "Confirm" : "Confirm"}</span
              >
            </button>
          {/if}
        </div>
      </div>

      <!-- Notes Section for New Markers -->
      {#if selectedMarkerIsNew && showNotesForNewMarker}
        <div class="new-marker-notes-section">
          <div class="notes-header">
            <span class="notes-label">📝 Add Notes (Optional)</span>
          </div>
          <textarea
            bind:value={newMarkerNotes}
            placeholder="Add notes about this marker..."
            class="notes-input"
            rows="4"
            maxlength="500"
          ></textarea>
          <div class="char-count">{newMarkerNotes.length}/500</div>
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

  <!-- Control Bar (Always Visible) -->
  <div class="control-bar">
    <!-- Marker Info -->
    <div class="marker-info">
      <div class="marker-icon-display">
        {#if getCurrentIconClass($selectedMarkerStore.id) === "default"}
          <IconSVG icon="mapbox-marker" size="28px" />
        {:else if getCurrentIconClass($selectedMarkerStore.id)?.startsWith("custom-svg")}
          <IconSVG
            icon={getCurrentIconClass($selectedMarkerStore.id)?.replace(
              "custom-svg-",
              "",
            )}
            size="28px"
          />
        {:else if getCurrentIconClass($selectedMarkerStore.id)?.startsWith("ionic-")}
          <ion-icon
            name={getCurrentIconClass($selectedMarkerStore.id)?.replace(
              "ionic-",
              "",
            )}
            style="font-size: 28px;"
          ></ion-icon>
        {:else}
          <IconSVG icon="mapbox-marker" size="28px" />
        {/if}
      </div>
      <div class="marker-text-info">
        <span class="marker-name"
          >{getMarkerName(getCurrentIconClass($selectedMarkerStore.id))}
          {#if selectedMarkerIsNew && newMarkerNotes}
            <span class="marker-notes-preview"> - {newMarkerNotes}</span>
          {:else if currentMarker?.notes && !selectedMarkerIsNew}
            <span class="marker-notes-preview"> - {currentMarker.notes}</span>
          {/if}
        </span>
      </div>
    </div>

    <!-- Action Controls -->
    <div class="action-controls">
      {#if selectedMarkerIsNew}
        <!-- New marker - show confirm button -->
        <button class="control-btn confirm-btn" on:click={handleConfirmMarker}>
          <Check size={20} />
        </button>
      {:else}
        <!-- Existing marker - show edit, info, delete buttons -->
        <button
          class="control-btn edit-btn"
          class:active={showEditMenu && isExpanded}
          on:click={handleEditClick}
        >
          <Edit3 size={20} />
        </button>

        <button
          class="control-btn info-btn"
          class:active={showInfoPanel && isExpanded}
          on:click={handleInfoClick}
        >
          <Info size={20} />
        </button>
      {/if}

      <button class="control-btn delete-btn" on:click={removeMarker}>
        <Trash2 size={20} />
      </button>
    </div>
  </div>
</div>

<style>
  /* Main Marker Panel - Trail Highlighter Style */
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

  /* Info Section (Only visible when expanded) - NORMALIZED heights across all sections */
  .info-section,
  .icon-section {
    padding: 16px 20px 0;
    max-height: 35vh; /* Desktop height */
    min-height: 35vh; /* Force consistent height between tabs */
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

  .marker-panel.expanded .info-section,
  .marker-panel.expanded .icon-section {
    opacity: 1;
    transform: translateY(0);
  }

  .marker-header {
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

  /* Coordinates Section - MOVED BELOW NOTES */
  .coordinates-section {
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

  .coord-label {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.6);
    font-weight: 500;
  }

  .coord-value {
    font-size: 13px;
    font-weight: 600;
    color: #60a5fa;
    font-family: monospace;
  }

  /* Notes Section - KEPT Enhanced buttons but reverted spacing */
  .notes-section,
  .new-marker-notes-section {
    margin-bottom: 16px;
    padding: 12px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    border-left: 3px solid #22c55e;
  }

  .notes-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .notes-label {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.6);
    font-weight: 500;
  }

  /* Enhanced notes buttons - KEPT the improvements */
  .edit-notes-btn,
  .save-notes-btn {
    background: rgba(34, 197, 94, 0.2);
    border: none;
    border-radius: 6px;
    padding: 8px 12px;
    color: #22c55e;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 500;
    touch-action: manipulation;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
  }

  .edit-notes-btn:hover,
  .save-notes-btn:hover {
    background: rgba(34, 197, 94, 0.3);
    transform: scale(1.05);
  }

  .edit-notes-btn:active,
  .save-notes-btn:active {
    transform: scale(0.95);
    transition: transform 0.1s ease;
  }

  .notes-input {
    width: 100%;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 6px;
    padding: 8px 12px;
    color: white;
    font-size: 14px;
    resize: vertical;
    min-height: 60px;
  }

  .notes-input:focus {
    outline: none;
    border-color: #22c55e;
    background: rgba(255, 255, 255, 0.15);
  }

  .notes-input::placeholder {
    color: rgba(255, 255, 255, 0.4);
  }

  .char-count {
    text-align: right;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.4);
    margin-top: 4px;
  }

  .notes-display {
    font-size: 14px;
    color: rgba(255, 255, 255, 0.8);
    line-height: 1.4;
    min-height: 20px;
    font-style: italic;
  }

  /* Icon Section */
  .icon-section-header {
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

  .icon-grid-container {
    max-height: 27.2vh; /* Desktop height - works perfectly */
    overflow-y: auto;
    padding-top: 2px; /* ADDED: Padding to prevent cutoff at top */
  }

  .icon-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
    gap: 12px;
    margin-bottom: 16px;
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

  /* Control Bar (Always Visible) - Desktop */
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
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 50%;
    border: 2px solid rgba(255, 255, 255, 0.2);
    color: #60a5fa;
    flex-shrink: 0;
  }

  /* Text info wrapper */
  .marker-text-info {
    display: flex;
    flex: 1;
    min-width: 0;
  }

  .marker-name {
    font-size: 18px;
    font-weight: 600;
    color: white;
    text-overflow: ellipsis;
    overflow: hidden;
    white-space: nowrap;
    line-height: 1.2;
    flex: 1;
    min-width: 0;
  }

  /* Notes preview styling - inline with marker name */
  .marker-notes-preview {
    font-size: 14px;
    font-weight: 400;
    color: rgba(255, 255, 255, 0.6);
    font-style: italic;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex-shrink: 1;
    min-width: 0;
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

  /* Enhanced touch feedback */
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

  .edit-btn {
    background: rgba(96, 165, 250, 0.2);
    color: #60a5fa;
  }

  .edit-btn:hover,
  .edit-btn.active {
    background: rgba(96, 165, 250, 0.3);
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

  .delete-btn {
    background: rgba(239, 68, 68, 0.2);
    color: #ef4444;
  }

  .delete-btn:hover {
    background: rgba(239, 68, 68, 0.3);
    color: white;
  }

  /* Mobile View - Single breakpoint at 768px */
  @media (max-width: 768px) {
    .info-section,
    .icon-section {
      max-height: 35.4vh; /* Mobile height - adjust this value as needed */
      min-height: 35.4vh; /* Force consistent height between tabs */
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

    .marker-icon-display {
      width: 44px;
      height: 44px;
    }

    .marker-info {
      gap: 12px;
    }

    .marker-name {
      font-size: 16px;
    }

    .marker-notes-preview {
      font-size: 12px;
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

    .icon-grid-container {
      max-height: 26.8vh; /* Mobile icon grid height - adjust this value as needed */
    }

    /* Hide button text on mobile */
    .btn-text {
      display: none;
    }

    .notes-toggle-btn,
    .confirm-icon-btn {
      padding: 6px 8px;
      gap: 0;
    }
  }

  /* Very small screens - minor adjustments */
  @media (max-width: 360px) {
    .marker-name {
      font-size: 14px;
    }

    .marker-notes-preview {
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
  .icon-section::-webkit-scrollbar,
  .icon-grid-container::-webkit-scrollbar {
    width: 4px;
  }

  .info-section::-webkit-scrollbar-track,
  .icon-section::-webkit-scrollbar-track,
  .icon-grid-container::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2px;
  }

  .info-section::-webkit-scrollbar-thumb,
  .icon-section::-webkit-scrollbar-thumb,
  .icon-grid-container::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.3);
    border-radius: 2px;
  }
</style>
