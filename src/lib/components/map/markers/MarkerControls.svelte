<!-- src/lib/components/map/markers/MarkerControls.svelte -->
<script lang="ts">
  import { createEventDispatcher } from "svelte"
  import { Target, ChevronRight } from "lucide-svelte"
  import { toast } from "svelte-sonner"
  import IconSVG from "$lib/components/general/IconSVG.svelte"
  import { userSettingsStore } from "$lib/stores/userSettingsStore"
  import { userSettingsApi } from "$lib/api/userSettingsApi"
  import { markerPlacementModeEnabled } from "$lib/stores/controlStore"
  import { getActiveMarkers, getAllMarkers } from "$lib/data/markerDefinitions"

  const dispatch = createEventDispatcher()

  // Active sub-panel state
  let activeSubPanel = null // null, 'markers', 'extra-markers'
  let editingExtraIndex = -1 // -1 = adding new, 0+ = editing existing

  // Marker placement state - now reactive to store
  $: markerPlacementMode = $markerPlacementModeEnabled

  // Use unified marker definitions - ONLY ACTIVE markers for selection
  const allMarkerIcons = getActiveMarkers()

  // Lazy loading state
  let visibleMarkers = allMarkerIcons.slice(0, 20)
  let loadingMore = false
  let scrollContainer

  // Default marker selection - get from userSettingsStore or fallback to default
  // Need to check against ALL markers (including deprecated) for backward compatibility
  $: selectedMarker = $userSettingsStore?.defaultMarker
    ? (() => {
        const storeMarker = $userSettingsStore.defaultMarker
        // First try to find in ALL markers (includes deprecated)
        const allMarkers = getAllMarkers()
        return (
          allMarkers.find(
            (icon) =>
              icon.id === storeMarker.id && icon.class === storeMarker.class,
          ) || allMarkerIcons.find((icon) => icon.id === "default")
        )
      })()
    : allMarkerIcons.find((icon) => icon.id === "default") || allMarkerIcons[0]

  // Extra markers - resolved from store to full marker objects
  $: resolvedExtraMarkers = ($userSettingsStore?.extraMarkers || []).map(
    (storeMarker) => {
      const allMarkers = getAllMarkers()
      return (
        allMarkers.find(
          (icon) =>
            icon.id === storeMarker.id && icon.class === storeMarker.class,
        ) || storeMarker
      )
    },
  )

  function showSubPanel(panel) {
    activeSubPanel = panel
    // Reset visible markers when opening
    if (panel === "markers" || panel === "extra-markers") {
      visibleMarkers = allMarkerIcons.slice(0, 20)
    }
  }

  function hideSubPanel() {
    activeSubPanel = null
  }

  async function selectMarker(marker) {
    selectedMarker = marker

    console.log("📊 Current userSettingsStore:", $userSettingsStore)

    try {
      // FIRST: Update the store immediately for instant reactivity
      userSettingsStore.update((settings) => ({
        ...settings,
        defaultMarker: {
          id: marker.id,
          class: marker.class,
          name: marker.name,
        },
      }))

      console.log("🎯 Store updated immediately!")
      console.log("Selected marker:", marker)
      console.log("Updated userSettingsStore:", $userSettingsStore)

      // THEN: Persist to database
      const result = await userSettingsApi.updateDefaultMarker({
        id: marker.id,
        class: marker.class,
        name: marker.name,
      })

      if (result.success) {
        console.log("✅ Default marker persisted to database!")
        // Show success toast
        toast.success(`Default marker set: ${marker.name}`)
      } else {
        console.error("❌ API Error updating default marker:", result.message)
        toast.error("Failed to save default marker")

        // Revert the store update if database save failed
        userSettingsStore.update((settings) => ({
          ...settings,
          defaultMarker: selectedMarker,
        }))
      }
    } catch (error) {
      console.error("❌ Error updating default marker:", error)
      toast.error("Failed to save default marker")

      // Revert the store update if there was an error
      userSettingsStore.update((settings) => ({
        ...settings,
        defaultMarker: selectedMarker,
      }))
    }

    // Just go back to previous menu instead of closing everything
    hideSubPanel()
  }

  async function addExtraMarker(marker) {
    const currentExtras = $userSettingsStore?.extraMarkers || []
    const newMarker = { id: marker.id, class: marker.class, name: marker.name }
    let updatedExtras

    if (editingExtraIndex >= 0 && editingExtraIndex < currentExtras.length) {
      // Replacing an existing extra marker
      updatedExtras = [...currentExtras]
      updatedExtras[editingExtraIndex] = newMarker
    } else {
      // Adding a new one
      updatedExtras = [...currentExtras, newMarker]
    }

    try {
      userSettingsStore.update((settings) => ({
        ...settings,
        extraMarkers: updatedExtras,
      }))

      const result = await userSettingsApi.updateExtraMarkers(updatedExtras)

      if (result.success) {
        toast.success(
          editingExtraIndex >= 0
            ? `Marker updated: ${marker.name}`
            : `Marker added: ${marker.name}`,
        )
      } else {
        toast.error("Failed to save marker")
        userSettingsStore.update((settings) => ({
          ...settings,
          extraMarkers: currentExtras,
        }))
      }
    } catch (error) {
      console.error("Error updating extra markers:", error)
      toast.error("Failed to save marker")
      userSettingsStore.update((settings) => ({
        ...settings,
        extraMarkers: currentExtras,
      }))
    }

    editingExtraIndex = -1
    hideSubPanel()
  }

  async function removeExtraMarker(index) {
    const currentExtras = $userSettingsStore?.extraMarkers || []
    const removedName = currentExtras[index]?.name || "Marker"
    const updatedExtras = currentExtras.filter((_, i) => i !== index)

    try {
      userSettingsStore.update((settings) => ({
        ...settings,
        extraMarkers: updatedExtras,
      }))

      const result = await userSettingsApi.updateExtraMarkers(updatedExtras)

      if (result.success) {
        toast.success(`Removed: ${removedName}`)
      } else {
        toast.error("Failed to remove marker")
        userSettingsStore.update((settings) => ({
          ...settings,
          extraMarkers: currentExtras,
        }))
      }
    } catch (error) {
      console.error("Error removing extra marker:", error)
      toast.error("Failed to remove marker")
      userSettingsStore.update((settings) => ({
        ...settings,
        extraMarkers: currentExtras,
      }))
    }
  }

  function openExtraMarkerSelector(index = -1) {
    editingExtraIndex = index
    showSubPanel("extra-markers")
  }

  function activateMarkerPlacement() {
    // Toggle the store state
    markerPlacementModeEnabled.set(!$markerPlacementModeEnabled)

    if ($markerPlacementModeEnabled) {
      dispatch("close") // Close the toolbox
    }
  }

  // Lazy loading on scroll
  function handleScroll(e) {
    if (loadingMore || visibleMarkers.length >= allMarkerIcons.length) return

    const { scrollTop, scrollHeight, clientHeight } = e.target

    // Load more when near bottom (within 100px)
    if (scrollTop + clientHeight >= scrollHeight - 100) {
      loadMoreMarkers()
    }
  }

  function loadMoreMarkers() {
    if (loadingMore || visibleMarkers.length >= allMarkerIcons.length) return

    loadingMore = true

    // Simulate a slight delay for smooth loading
    setTimeout(() => {
      const nextBatch = allMarkerIcons.slice(
        visibleMarkers.length,
        visibleMarkers.length + 20,
      )
      visibleMarkers = [...visibleMarkers, ...nextBatch]
      loadingMore = false
    }, 100)
  }
</script>

<div class="marker-controls">
  {#if activeSubPanel === null}
    <!-- Main Marker Panel -->
    <div class="main-panel">
      <!-- Instructions -->
      <div class="quick-instructions">
        <div class="instruction-item">
          <span class="instruction-number">1</span>
          <span class="instruction-text">
            <strong>Quick:</strong> Press and hold on map
          </span>
        </div>
        <div class="instruction-item">
          <span class="instruction-number">2</span>
          <span class="instruction-text">
            <strong>Precise:</strong> Use crosshair tool below
          </span>
        </div>
      </div>

      <!-- Precise Placement Tool -->
      <button
        class="crosshair-button"
        class:active={markerPlacementMode}
        on:click={activateMarkerPlacement}
      >
        <div class="crosshair-icon">
          <Target size={32} />
        </div>
        <div class="crosshair-status">
          {#if markerPlacementMode}
            <span class="status-active">Active</span>
          {:else}
            <span class="status-inactive">Place Marker</span>
          {/if}
        </div>
      </button>

      <!-- Default Marker Button -->
      <div class="default-section">
        <h5>Default Marker</h5>
        <button
          class="default-marker-button"
          on:click={() => showSubPanel("markers")}
        >
          <div class="marker-icon-display">
            {#if selectedMarker.id === "default"}
              <IconSVG icon="mapbox-marker" size="36px" />
            {:else if selectedMarker.class.startsWith("custom-svg")}
              <IconSVG icon={selectedMarker.id} size="36px" />
            {:else if selectedMarker.class.startsWith("ionic-")}
              <ion-icon name={selectedMarker.id} style="font-size: 36px;"
              ></ion-icon>
            {:else}
              <i class={`${selectedMarker.class}`} style="font-size: 36px;"></i>
            {/if}
          </div>
          <div class="marker-info">
            <div class="marker-name">{selectedMarker.name}</div>
            <div class="change-hint">Tap to change</div>
          </div>
          <ChevronRight size={20} class="chevron" />
        </button>
      </div>

      <!-- Extra Markers -->
      <div class="default-section">
        <h5>Quick-Drop Markers</h5>
        {#each resolvedExtraMarkers as extraMarker, i}
          <div class="extra-marker-row">
            <button
              class="default-marker-button secondary"
              on:click={() => openExtraMarkerSelector(i)}
            >
              <div class="marker-icon-display secondary">
                {#if extraMarker.class === "custom-svg" || extraMarker.class?.startsWith("custom-svg")}
                  <IconSVG icon={extraMarker.id} size="28px" />
                {:else if extraMarker.class?.startsWith("ionic-")}
                  <ion-icon name={extraMarker.id} style="font-size: 28px;"
                  ></ion-icon>
                {:else if extraMarker.class?.startsWith("at-")}
                  <i class={`${extraMarker.class}`} style="font-size: 28px;"
                  ></i>
                {:else if extraMarker.id === "default"}
                  <IconSVG icon="mapbox-marker" size="28px" />
                {:else}
                  <IconSVG icon="mapbox-marker" size="28px" />
                {/if}
              </div>
              <div class="marker-info">
                <div class="marker-name extra-name">{extraMarker.name}</div>
              </div>
              <ChevronRight size={16} class="chevron" />
            </button>
            <button
              class="remove-extra-btn"
              on:click={() => removeExtraMarker(i)}
              title="Remove this marker"
            >
              ✕
            </button>
          </div>
        {/each}
        <button
          class="add-secondary-button"
          on:click={() => openExtraMarkerSelector(-1)}
        >
          <span class="plus-icon">+</span>
          <span>Add another quick-drop marker</span>
        </button>
      </div>
    </div>
  {:else if activeSubPanel === "markers"}
    <!-- Marker Selection -->
    <div class="sub-panel">
      <div class="sub-header">
        <button class="back-btn" on:click={hideSubPanel}>←</button>
        <h4>Select Marker</h4>
      </div>
      <div
        class="scrollable-content"
        bind:this={scrollContainer}
        on:scroll={handleScroll}
      >
        <div class="marker-grid">
          {#each visibleMarkers as marker}
            <button
              class="marker-option"
              class:selected={selectedMarker?.id === marker.id &&
                selectedMarker?.class === marker.class}
              on:click={() => selectMarker(marker)}
            >
              <div class="marker-icon-small">
                {#if marker.id === "default"}
                  <IconSVG icon="mapbox-marker" size="40px" />
                {:else if marker.class.startsWith("custom-svg")}
                  <IconSVG icon={marker.id} size="40px" />
                {:else if marker.class.startsWith("ionic-")}
                  <ion-icon name={marker.id} style="font-size: 40px;"
                  ></ion-icon>
                {:else}
                  <i class={`${marker.class}`} style="font-size: 40px;"></i>
                {/if}
              </div>
              <div class="marker-label">{marker.name}</div>
            </button>
          {/each}
        </div>

        <!-- Loading indicator -->
        {#if loadingMore}
          <div class="loading-indicator">
            <div class="loading-spinner"></div>
            <span>Loading more...</span>
          </div>
        {/if}

        <!-- End indicator -->
        {#if visibleMarkers.length >= allMarkerIcons.length}
          <div class="end-indicator">
            <span>All markers loaded ({allMarkerIcons.length} total)</span>
          </div>
        {/if}
      </div>
    </div>
  {:else if activeSubPanel === "extra-markers"}
    <!-- Extra Marker Selection -->
    <div class="sub-panel">
      <div class="sub-header">
        <button class="back-btn" on:click={hideSubPanel}>←</button>
        <h4>{editingExtraIndex >= 0 ? "Change Marker" : "Add Marker"}</h4>
      </div>
      <div
        class="scrollable-content"
        bind:this={scrollContainer}
        on:scroll={handleScroll}
      >
        <div class="marker-grid">
          {#each visibleMarkers as marker}
            <button
              class="marker-option"
              on:click={() => addExtraMarker(marker)}
            >
              <div class="marker-icon-small">
                {#if marker.id === "default"}
                  <IconSVG icon="mapbox-marker" size="40px" />
                {:else if marker.class.startsWith("custom-svg")}
                  <IconSVG icon={marker.id} size="40px" />
                {:else if marker.class.startsWith("ionic-")}
                  <ion-icon name={marker.id} style="font-size: 40px;"
                  ></ion-icon>
                {:else}
                  <i class={`${marker.class}`} style="font-size: 40px;"></i>
                {/if}
              </div>
              <div class="marker-label">{marker.name}</div>
            </button>
          {/each}
        </div>

        {#if loadingMore}
          <div class="loading-indicator">
            <div class="loading-spinner"></div>
            <span>Loading more...</span>
          </div>
        {/if}

        {#if visibleMarkers.length >= allMarkerIcons.length}
          <div class="end-indicator">
            <span>All markers loaded ({allMarkerIcons.length} total)</span>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .marker-controls {
    padding: 0;
    height: 100%;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .main-panel {
    display: flex;
    flex-direction: column;
    gap: 16px;
    flex: 1;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
    padding: 12px;
  }

  .quick-instructions {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .instruction-item {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .instruction-number {
    background: rgba(96, 165, 250, 0.2);
    color: #60a5fa;
    border: 1px solid rgba(96, 165, 250, 0.3);
    border-radius: 50%;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 600;
    flex-shrink: 0;
  }

  .instruction-text {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.8);
    line-height: 1.2;
  }

  .instruction-text strong {
    color: white;
  }

  .crosshair-button {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 14px;
    cursor: pointer;
    transition: all 0.3s ease;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    width: 100%;
  }

  .crosshair-button:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.2);
    transform: translateY(-2px);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.3);
  }

  .crosshair-button.active {
    background: rgba(96, 165, 250, 0.2);
    border-color: rgba(96, 165, 250, 0.4);
    box-shadow: 0 0 20px rgba(96, 165, 250, 0.3);
  }

  .crosshair-icon {
    color: rgba(255, 255, 255, 0.8);
    transition: all 0.3s ease;
  }

  .crosshair-button.active .crosshair-icon {
    color: #60a5fa;
    transform: scale(1.1);
  }

  .crosshair-status {
    font-size: 13px;
    font-weight: 500;
  }

  .status-active {
    color: #22c55e;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-size: 11px;
    font-weight: 600;
  }

  .status-inactive {
    color: rgba(255, 255, 255, 0.6);
  }

  .default-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .default-section h5 {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    color: white;
  }

  .default-marker-button {
    background: linear-gradient(
      135deg,
      rgba(96, 165, 250, 0.2),
      rgba(96, 165, 250, 0.1)
    );
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 12px;
    padding: 10px 12px;
    cursor: pointer;
    transition: all 0.3s ease;
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
  }

  .default-marker-button:hover {
    background: linear-gradient(
      135deg,
      rgba(96, 165, 250, 0.3),
      rgba(96, 165, 250, 0.15)
    );
    border-color: rgba(255, 255, 255, 0.3);
    transform: translateY(-2px);
  }

  .default-marker-button:hover .marker-icon-display {
    box-shadow: 0 6px 16px rgba(96, 165, 250, 0.4);
  }

  .marker-icon-display {
    background: rgba(255, 255, 255, 0.1);
    border: 2px solid rgba(96, 165, 250, 0.4);
    border-radius: 10px;
    padding: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    flex-shrink: 0;
    color: rgba(255, 255, 255, 0.9);
    box-shadow: 0 4px 12px rgba(96, 165, 250, 0.3);
    transition: all 0.3s ease;
  }

  .mapbox-default-marker {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .marker-info {
    flex: 1;
    text-align: left;
  }

  .marker-name {
    font-size: 14px;
    font-weight: 600;
    color: white;
    margin-bottom: 4px;
  }

  .change-hint {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.6);
    font-style: italic;
  }

  .chevron {
    color: rgba(255, 255, 255, 0.4);
    transition: all 0.2s ease;
    flex-shrink: 0;
  }

  .default-marker-button:hover .chevron {
    color: rgba(255, 255, 255, 0.8);
    transform: translateX(4px);
  }

  /* Secondary marker variant */
  .default-marker-button.secondary {
    background: linear-gradient(
      135deg,
      rgba(168, 85, 247, 0.2),
      rgba(168, 85, 247, 0.1)
    );
    padding: 8px 12px;
    border-radius: 12px;
  }

  .default-marker-button.secondary:hover {
    background: linear-gradient(
      135deg,
      rgba(168, 85, 247, 0.3),
      rgba(168, 85, 247, 0.15)
    );
  }

  .marker-icon-display.secondary {
    width: 44px;
    height: 44px;
    border-color: rgba(168, 85, 247, 0.4);
    box-shadow: 0 2px 8px rgba(168, 85, 247, 0.3);
  }

  .marker-name.extra-name {
    font-size: 12px;
  }

  .add-secondary-button {
    background: rgba(255, 255, 255, 0.05);
    border: 1px dashed rgba(255, 255, 255, 0.2);
    border-radius: 12px;
    padding: 10px 12px;
    cursor: pointer;
    transition: all 0.3s ease;
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    color: rgba(255, 255, 255, 0.5);
    font-size: 12px;
  }

  .add-secondary-button:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(168, 85, 247, 0.4);
    color: rgba(255, 255, 255, 0.8);
  }

  .plus-icon {
    font-size: 22px;
    font-weight: 300;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
    background: rgba(168, 85, 247, 0.15);
    color: rgba(168, 85, 247, 0.8);
    flex-shrink: 0;
  }

  .extra-marker-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .extra-marker-row .default-marker-button {
    flex: 1;
    min-width: 0;
  }

  .remove-extra-btn {
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.35);
    color: #ef4444;
    font-size: 16px;
    font-weight: 600;
    width: 40px;
    height: 40px;
    min-width: 40px;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: all 0.2s ease;
    padding: 0;
  }

  .remove-extra-btn:hover {
    color: #fff;
    background: rgba(239, 68, 68, 0.3);
    border-color: rgba(239, 68, 68, 0.6);
    transform: scale(1.1);
  }

  .sub-panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
    height: 100%;
    overflow: hidden;
    padding: 12px;
  }

  .sub-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding-bottom: 6px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    flex-shrink: 0;
  }

  .back-btn {
    background: rgba(255, 255, 255, 0.1);
    border: none;
    border-radius: 8px;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(255, 255, 255, 0.8);
    cursor: pointer;
    transition: all 0.2s ease;
    font-size: 16px;
    font-weight: bold;
  }

  .back-btn:hover {
    background: rgba(255, 255, 255, 0.2);
    color: white;
  }

  .sub-header h4 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: white;
  }

  .scrollable-content {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
  }

  .marker-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
    padding-bottom: 20px;
  }

  .marker-option {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 12px;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }

  .marker-option:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.2);
    transform: translateY(-1px);
  }

  .marker-option.selected {
    background: rgba(96, 165, 250, 0.2);
    border-color: rgba(96, 165, 250, 0.4);
    transform: scale(1.02);
  }

  .marker-icon-small {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 40px;
    color: rgba(255, 255, 255, 0.9);
  }

  .marker-label {
    font-size: 11px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.8);
    text-align: center;
    line-height: 1.2;
  }

  .loading-indicator,
  .end-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 16px;
    color: rgba(255, 255, 255, 0.6);
    font-size: 12px;
  }

  .loading-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255, 255, 255, 0.2);
    border-top: 2px solid rgba(96, 165, 250, 0.8);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }

  /* Mobile Responsive */
  @media (max-width: 768px) {
    .marker-grid {
      gap: 8px;
    }

    .marker-option {
      padding: 8px;
    }
  }

  /* Scrollbar styling */
  .scrollable-content::-webkit-scrollbar,
  .main-panel::-webkit-scrollbar {
    width: 4px;
  }

  .scrollable-content::-webkit-scrollbar-track,
  .main-panel::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2px;
  }

  .scrollable-content::-webkit-scrollbar-thumb,
  .main-panel::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.3);
    border-radius: 2px;
  }
</style>
