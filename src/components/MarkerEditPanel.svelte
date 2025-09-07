<script>
  import IconSVG from "./IconSVG.svelte"
  import { Edit3, Trash2, Check, Info, FileText } from "lucide-svelte"
  import { markerApi } from "$lib/api/markerApi"

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

  // Marker icons data
  const markerIcons = [
    { id: "default", class: "default", name: "Default Marker" },
    { id: "rock", class: "custom-svg", name: "Rock" },
    { id: "tree13", class: "custom-svg", name: "Tree" },
    { id: "watertank2", class: "custom-svg", name: "Water Tank" },
    { id: "wheat2", class: "custom-svg", name: "Wheat" },
    { id: "kangaroo", class: "custom-svg", name: "Kangaroo" },
    { id: "electric_tower", class: "custom-svg", name: "Power Tower" },
    { id: "gate", class: "custom-svg", name: "Gate" },
    { id: "machine_pump", class: "custom-svg", name: "Pump" },
    { id: "recharge_icon", class: "custom-svg", name: "Charging" },
    { id: "repair_shop", class: "custom-svg", name: "Repair Shop" },
    { id: "tractor", class: "custom-svg", name: "Tractor" },
    { id: "silo2", class: "custom-svg", name: "Silo" },
    { id: "tree_stump", class: "custom-svg", name: "Tree Stump" },
    { id: "workshop_icon", class: "custom-svg", name: "Workshop" },
    { id: "pin", class: "ionic-pin", name: "Pin" },
    { id: "arrow-up-circle", class: "ionic-arrow-up-circle", name: "Arrow Up" },
    {
      id: "arrow-down-circle",
      class: "ionic-arrow-down-circle",
      name: "Arrow Down",
    },
    {
      id: "arrow-back-circle",
      class: "ionic-arrow-back-circle",
      name: "Arrow Back",
    },
    {
      id: "arrow-forward-circle",
      class: "ionic-arrow-forward-circle",
      name: "Arrow Forward",
    },
    { id: "thumbs-down", class: "ionic-thumbs-down", name: "Thumbs Down" },
    { id: "thumbs-up", class: "ionic-thumbs-up", name: "Thumbs Up" },
    {
      id: "accessibility",
      class: "ionic-accessibility",
      name: "Accessibility",
    },
    { id: "people", class: "ionic-people", name: "People" },
    { id: "settings", class: "ionic-settings", name: "Settings" },
    { id: "home", class: "ionic-home", name: "Home" },
    {
      id: "checkmark-circle",
      class: "ionic-checkmark-circle",
      name: "Success",
    },
    { id: "close-circle", class: "ionic-close-circle", name: "Error" },
    {
      id: "information-circle",
      class: "ionic-information-circle",
      name: "Info",
    },
    { id: "warning", class: "ionic-warning", name: "Warning" },
    { id: "help-circle", class: "ionic-help-circle", name: "Help" },
    { id: "ban", class: "ionic-ban", name: "Ban" },
    { id: "location", class: "ionic-location", name: "Location" },
    { id: "lock-closed", class: "ionic-lock-closed", name: "Locked" },
    { id: "lock-open", class: "ionic-lock-open", name: "Unlocked" },
    { id: "trash", class: "ionic-trash", name: "Trash" },
    { id: "cart", class: "ionic-cart", name: "Cart" },
    { id: "locate", class: "ionic-locate", name: "GPS" },
    { id: "leaf", class: "ionic-leaf", name: "Leaf" },
    { id: "call", class: "ionic-call", name: "Phone" },
    { id: "wifi", class: "ionic-wifi", name: "WiFi" },
    { id: "radio", class: "ionic-radio", name: "Radio" },
    { id: "cloud-offline", class: "ionic-cloud-offline", name: "Offline" },
    {
      id: "battery-charging",
      class: "ionic-battery-charging",
      name: "Charging",
    },
    { id: "thermometer", class: "ionic-thermometer", name: "Temperature" },
    { id: "sunny", class: "ionic-sunny", name: "Sunny" },
    { id: "cloud", class: "ionic-cloud", name: "Cloud" },
    { id: "thunderstorm", class: "ionic-thunderstorm", name: "Storm" },
    { id: "rainy", class: "ionic-rainy", name: "Rain" },
    { id: "water", class: "ionic-water", name: "Water" },
    { id: "fast-food", class: "ionic-fast-food", name: "Food" },
    { id: "restaurant", class: "ionic-restaurant", name: "Restaurant" },
    { id: "airplane", class: "ionic-airplane", name: "Airplane" },
    { id: "trail-sign", class: "ionic-trail-sign", name: "Trail" },
    { id: "car", class: "ionic-car", name: "Car" },
    { id: "beer", class: "ionic-beer", name: "Beer" },
    { id: "bonfire", class: "ionic-bonfire", name: "Fire" },
    { id: "boat", class: "ionic-boat", name: "Boat" },
    { id: "bed", class: "ionic-bed", name: "Bed" },
    { id: "bicycle", class: "ionic-bicycle", name: "Bicycle" },
    { id: "build", class: "ionic-build", name: "Build" },
    { id: "desktop", class: "ionic-desktop", name: "Computer" },
    { id: "earth", class: "ionic-earth", name: "Earth" },
    { id: "camera", class: "ionic-camera", name: "Camera" },
    { id: "fish", class: "ionic-fish", name: "Fish" },
    { id: "flame", class: "ionic-flame", name: "Flame" },
    { id: "footsteps", class: "ionic-footsteps", name: "Footsteps" },
    { id: "key", class: "ionic-key", name: "Key" },
    { id: "man", class: "ionic-man", name: "Person" },
    { id: "paw", class: "ionic-paw", name: "Animal" },
    { id: "skull", class: "ionic-skull", name: "Danger" },
    { id: "construct", class: "ionic-construct", name: "Construction" },
    { id: "bus", class: "ionic-bus", name: "Bus" },
    { id: "subway", class: "ionic-subway", name: "Subway" },
    { id: "telescope", class: "ionic-telescope", name: "Telescope" },
    {
      id: "construction-truck",
      class: "at-construction-truck",
      name: "Construction",
    },
    { id: "electric-car", class: "at-electric-car", name: "Electric Car" },
    { id: "gasoline", class: "at-gasoline", name: "Fuel" },
    { id: "kg-weight", class: "at-kg-weight", name: "Weight" },
    { id: "carrot", class: "at-carrot", name: "Carrot" },
    { id: "middle-finger", class: "at-middle-finger", name: "Rude" },
    { id: "toilet-bathroom", class: "at-toilet-bathroom", name: "Toilet" },
    { id: "car-garage", class: "at-car-garage", name: "Garage" },
    { id: "electricity-home", class: "at-electricity-home", name: "Power" },
    {
      id: "carrot-turnip-vegetable",
      class: "at-carrot-turnip-vegetable",
      name: "Vegetables",
    },
    { id: "wheat-harvest", class: "at-wheat-harvest", name: "Harvest" },
    {
      id: "helicopter-travel",
      class: "at-helicopter-travel",
      name: "Helicopter",
    },
    { id: "camper-vehicle", class: "at-camper-vehicle", name: "Camper" },
    { id: "cargo-transport", class: "at-cargo-transport", name: "Cargo" },
    { id: "bulldozer", class: "at-bulldozer", name: "Bulldozer" },
    {
      id: "construction-transport",
      class: "at-construction-transport",
      name: "Transport",
    },
    { id: "crane-truck", class: "at-crane-truck", name: "Crane" },
    { id: "delivery-truck", class: "at-delivery-truck", name: "Delivery" },
    {
      id: "liquid-transportation",
      class: "at-liquid-transportation",
      name: "Liquid",
    },
    { id: "transport-truck", class: "at-transport-truck", name: "Truck" },
    { id: "ladder-truck", class: "at-ladder-truck", name: "Ladder Truck" },
  ]

  // Get marker name from icon class with proper default handling
  function getMarkerName(iconClass) {
    if (!iconClass || iconClass === "default") return "Default Marker"

    const icon = markerIcons.find((i) => {
      if (iconClass.startsWith("custom-svg-")) {
        return (
          i.class === "custom-svg" &&
          i.id === iconClass.replace("custom-svg-", "")
        )
      }
      return i.class === iconClass
    })

    return icon?.name || "Marker"
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
      console.log("Notes saved successfully")
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

      <!-- Coordinates Section -->
      <div class="coordinates-section">
        <div class="coord-item">
          <span class="coord-label">📍 Location</span>
          <span class="coord-value"
            >{formatCoordinates($selectedMarkerStore?.coordinates)}</span
          >
        </div>
      </div>

      <!-- Notes Section -->
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
          {#each markerIcons as icon}
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

  /* Info Section (Only visible when expanded) - REVERTED Desktop sizes, BIGGER Mobile */
  .info-section,
  .icon-section {
    padding: 16px 20px 0; /* Reverted to original desktop padding */
    max-height: 35vh; /* SMALLER than original 40vh to avoid blocking markers */
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
    margin-bottom: 16px; /* Reverted */
    padding-bottom: 12px; /* Reverted */
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .marker-title {
    display: flex;
    flex-direction: column;
    gap: 2px; /* Reverted */
  }

  .marker-label {
    font-size: 16px; /* Reverted */
    font-weight: 600;
    color: white;
  }

  .marker-date {
    font-size: 12px; /* Reverted */
    color: rgba(255, 255, 255, 0.6);
  }

  /* Coordinates Section */
  .coordinates-section {
    margin-bottom: 16px; /* Reverted */
    padding: 12px; /* Reverted */
    background: rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    border-left: 3px solid #60a5fa;
  }

  .coord-item {
    display: flex;
    flex-direction: column;
    gap: 4px; /* Reverted */
  }

  .coord-label {
    font-size: 12px; /* Reverted */
    color: rgba(255, 255, 255, 0.6);
    font-weight: 500;
  }

  .coord-value {
    font-size: 13px; /* Reverted */
    font-weight: 600;
    color: #60a5fa;
    font-family: monospace;
  }

  /* Notes Section - KEPT Enhanced buttons but reverted spacing */
  .notes-section,
  .new-marker-notes-section {
    margin-bottom: 16px; /* Reverted */
    padding: 12px; /* Reverted */
    background: rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    border-left: 3px solid #22c55e;
  }

  .notes-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px; /* Reverted */
  }

  .notes-label {
    font-size: 12px; /* Reverted */
    color: rgba(255, 255, 255, 0.6);
    font-weight: 500;
  }

  /* Enhanced notes buttons - KEPT the improvements */
  .edit-notes-btn,
  .save-notes-btn {
    background: rgba(34, 197, 94, 0.2);
    border: none;
    border-radius: 6px;
    padding: 8px 12px; /* KEPT bigger padding */
    color: #22c55e;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 500;
    /* Enhanced touch targets */
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
    border-radius: 6px; /* Reverted */
    padding: 8px 12px; /* Reverted */
    color: white;
    font-size: 14px; /* Reverted */
    resize: vertical;
    min-height: 60px; /* Reverted */
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
    font-size: 11px; /* Reverted */
    color: rgba(255, 255, 255, 0.4);
    margin-top: 4px; /* Reverted */
  }

  .notes-display {
    font-size: 14px; /* Reverted */
    color: rgba(255, 255, 255, 0.8);
    line-height: 1.4; /* Reverted */
    min-height: 20px; /* Reverted */
    font-style: italic;
  }

  /* Icon Section */
  .icon-section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px; /* Reverted */
    padding-bottom: 12px; /* Reverted */
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
    max-height: 30vh; /* Reverted */
    overflow-y: auto;
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

  /* Control Bar (Always Visible) - KEPT Mobile improvements */
  .control-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 18px 24px; /* KEPT bigger padding */
    background: rgba(0, 0, 0, 0.95);
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(20px);
    min-height: 72px; /* KEPT minimum height */
  }

  .marker-info {
    display: flex;
    align-items: center;
    gap: 16px; /* KEPT bigger gap */
    flex: 1;
    min-width: 0; /* Allow shrinking */
  }

  .marker-icon-display {
    width: 48px; /* KEPT bigger size */
    height: 48px; /* KEPT bigger size */
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
    min-width: 0; /* Allow shrinking */
  }

  .marker-name {
    font-size: 18px; /* KEPT bigger font */
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
    font-size: 14px; /* KEPT bigger font */
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
    gap: 12px; /* KEPT bigger gap */
    align-items: center;
  }

  .control-btn {
    background: rgba(255, 255, 255, 0.1);
    border: none;
    border-radius: 50%;
    width: 48px; /* KEPT bigger buttons */
    height: 48px; /* KEPT bigger buttons */
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(255, 255, 255, 0.8);
    cursor: pointer;
    transition: all 0.2s ease;
    /* Enhanced touch targets */
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

  /* Mobile Responsiveness - ENHANCED for mobile while keeping desktop compact */
  @media (max-width: 768px) {
    .info-section,
    .icon-section {
      max-height: 50vh; /* BIGGER on mobile */
      padding: 16px 20px 0; /* KEPT mobile padding */
    }

    .control-bar {
      padding: 16px 20px; /* Still larger than before */
      min-height: 68px;
    }

    .control-btn {
      width: 44px; /* Slightly smaller but still bigger than original */
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
      max-height: 35vh; /* BIGGER on mobile */
    }
  }

  @media (max-width: 640px) {
    .marker-notes-preview {
      font-size: 11px;
    }
  }

  @media (max-width: 520px) {
    .marker-notes-preview {
      font-size: 10px;
    }

    /* Hide button text on smaller screens except notes buttons */
    .btn-text {
      display: none;
    }

    .edit-notes-btn .btn-text,
    .save-notes-btn .btn-text {
      display: inline; /* Keep text for notes buttons */
    }

    .notes-toggle-btn,
    .confirm-icon-btn {
      padding: 6px 8px;
      gap: 0;
    }

    .section-title {
      font-size: 13px;
    }

    .control-bar {
      padding: 14px 16px;
      min-height: 64px;
    }

    .control-btn {
      width: 40px; /* Minimum comfortable touch size */
      height: 40px;
    }

    .marker-icon-display {
      width: 40px;
      height: 40px;
    }

    .action-controls {
      gap: 10px;
    }

    .info-section,
    .icon-section {
      max-height: 45vh; /* BIGGER on smaller mobile */
    }
  }

  @media (max-width: 480px) {
    .info-section,
    .icon-section {
      max-height: 40vh; /* BIGGER on small mobile */
    }

    .marker-info {
      gap: 10px;
    }

    .marker-name {
      font-size: 15px;
    }

    .marker-notes-preview {
      font-size: 9px;
    }

    .icon-grid {
      grid-template-columns: repeat(auto-fit, minmax(60px, 1fr));
      gap: 8px;
    }

    .icon-option {
      width: 60px;
      height: 60px;
    }

    .section-title {
      font-size: 12px;
    }

    .control-bar {
      padding: 12px 14px;
      min-height: 60px;
    }

    /* Hide button text for notes buttons too on very small screens */
    .edit-notes-btn .btn-text,
    .save-notes-btn .btn-text {
      display: none;
    }

    .edit-notes-btn,
    .save-notes-btn {
      padding: 6px 8px;
      gap: 0;
    }
  }

  /* Very small screens */
  @media (max-width: 360px) {
    .marker-name {
      font-size: 14px;
    }

    .marker-notes-preview {
      font-size: 8px;
    }

    .section-title {
      font-size: 11px;
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
