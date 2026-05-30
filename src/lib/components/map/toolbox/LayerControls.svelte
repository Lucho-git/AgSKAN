<!-- src/lib/components/map/toolbox/LayerControls.svelte -->
<script>
  import {
    MapPin,
    Square,
    Pen,
    Eye,
    EyeOff,
    Layers,
    Truck,
    History,
    Activity,
    Navigation,
    MessageSquare,
    Ruler,
    Home,
    Save,
    SlidersHorizontal,
  } from "lucide-svelte"
  import { layerVisibilityStore } from "$lib/stores/layerVisibilityStore"
  import { markerVisibilityStore } from "$lib/stores/markerVisibilityStore"
  import { confirmedMarkersStore } from "$lib/stores/markerStore"
  import { userSettingsApi } from "$lib/api/userSettingsApi"
  import { markerApi } from "$lib/api/markerApi"
  import { toast } from "svelte-sonner"
  import MarkerVisibilityModal from "./MarkerVisibilityModal.svelte"

  let showMarkerVisibilityModal = false
  let hasUnsavedVisibilityChanges = false
  let isSavingVisibilitySettings = false
  let changedMarkerVisibilityIds = new Set()

  $: hiddenMarkerCount = ($confirmedMarkersStore || []).filter(
    (marker) => $markerVisibilityStore[marker.id] === "hidden",
  ).length

  // Layer definitions with metadata
  const layers = [
    {
      id: "markers",
      name: "Markers",
      icon: MapPin,
      color: "#60a5fa",
    },
    {
      id: "markerLabels",
      name: "Marker Labels",
      icon: MessageSquare,
      color: "#ffee8c",
      indent: true,
    },
    {
      id: "markerDrawings",
      name: "Marker Drawings",
      icon: Pen,
      color: "#60a5fa",
      indent: true,
    },
    {
      id: "fields",
      name: "Fields",
      icon: Square,
      color: "#34d399",
    },
    {
      id: "fieldLabels",
      name: "Field Labels",
      icon: Square,
      color: "#34d399",
      indent: true,
    },
    {
      id: "fieldHectares",
      name: "Hectares",
      icon: Ruler,
      color: "#34d399",
      indent: true,
    },
    {
      id: "fieldFarmNames",
      name: "Farm Names",
      icon: Home,
      color: "#34d399",
      indent: true,
    },
    {
      id: "vehicles",
      name: "Vehicles",
      icon: Truck,
      color: "#f97316",
    },
    {
      id: "vehicleLabels",
      name: "Vehicle Labels",
      icon: Truck,
      color: "#f97316",
      indent: true,
    },
    {
      id: "historicalTrails",
      name: "Historical Trails",
      icon: History,
      color: "#8b5cf6",
    },
    {
      id: "activeTrails",
      name: "Active Trails",
      icon: Activity,
      color: "#ec4899",
    },
    {
      id: "trailArrows",
      name: "Trail Arrows",
      icon: Navigation,
      color: "#a78bfa",
      indent: true,
    },
  ]

  function toggleLayer(layerId) {
    layerVisibilityStore.toggle(layerId)
    hasUnsavedVisibilityChanges = true
  }

  function handleShowAll() {
    layerVisibilityStore.showAll()
    hasUnsavedVisibilityChanges = true
  }

  function handleHideAll() {
    layerVisibilityStore.hideAll()
    hasUnsavedVisibilityChanges = true
  }

  function handleMarkerVisibilityChange(event) {
    const markerIds = event?.detail?.markerIds || []
    if (markerIds.length > 0) {
      changedMarkerVisibilityIds = new Set([
        ...changedMarkerVisibilityIds,
        ...markerIds,
      ])
    }
    hasUnsavedVisibilityChanges = true
  }

  async function handleSaveVisibilitySettings() {
    if (!hasUnsavedVisibilityChanges || isSavingVisibilitySettings) return

    isSavingVisibilitySettings = true

    try {
      const layerResult = await userSettingsApi.updateLayerVisibilitySettings({
        ...$layerVisibilityStore,
      })

      if (!layerResult.success) {
        throw new Error(layerResult.error || "Could not save layer visibility settings")
      }

      const changedMarkerVisibility = Array.from(changedMarkerVisibilityIds).reduce(
        (settings, markerId) => {
          settings[markerId] = $markerVisibilityStore[markerId] || "always"
          return settings
        },
        {},
      )

      const markerResult = await markerApi.updateMarkerVisibilitySettings(changedMarkerVisibility)

      if (!markerResult.success) {
        throw new Error(markerResult.error || "Could not save marker visibility settings")
      }

      hasUnsavedVisibilityChanges = false
      changedMarkerVisibilityIds = new Set()
      toast.success("Layer visibility settings saved")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save layer visibility settings"
      toast.error(message)
    } finally {
      isSavingVisibilitySettings = false
    }
  }
</script>

<div class="layer-controls">
  <!-- Quick Actions -->
  <div class="quick-actions">
    <button class="quick-action-btn" on:click={handleShowAll}>
      <Eye size={16} />
      <span>Show All</span>
    </button>
    <button class="quick-action-btn" on:click={handleHideAll}>
      <EyeOff size={16} />
      <span>Hide All</span>
    </button>
  </div>

  <!-- Layer List -->
  <div class="layer-list">
    {#each layers as layer}
      <div class="layer-row" class:indent={layer.indent}>
        <button
          class="layer-item"
          class:active={$layerVisibilityStore[layer.id]}
          on:click={() => toggleLayer(layer.id)}
        >
          <div class="layer-left">
            <div class="layer-icon" style="color: {layer.color}">
              <svelte:component this={layer.icon} size={18} />
            </div>
            <div class="layer-info">
              <div class="layer-name">{layer.name}</div>
            </div>
          </div>

          <div class="layer-toggle">
            <div
              class="toggle-switch"
              class:on={$layerVisibilityStore[layer.id]}
            >
              <div class="toggle-slider"></div>
            </div>
          </div>
        </button>
      </div>

      {#if layer.id === "markers"}
        <div class="marker-settings-row">
          <button class="marker-settings-btn" on:click={() => (showMarkerVisibilityModal = true)}>
            <span class="marker-settings-left">
              <SlidersHorizontal size={16} />
              <span>Marker Types</span>
            </span>
            <span class="marker-settings-count">
              {hiddenMarkerCount > 0 ? `${hiddenMarkerCount} hidden` : "All visible"}
            </span>
          </button>
        </div>
      {/if}
    {/each}
  </div>

  <div class="sticky-layer-footer">
    <div class="save-section">
      <button
        class="save-settings-btn"
        class:dirty={hasUnsavedVisibilityChanges}
        disabled={!hasUnsavedVisibilityChanges || isSavingVisibilitySettings}
        on:click={handleSaveVisibilitySettings}
      >
        <Save size={16} />
        <span>{isSavingVisibilitySettings ? "Saving..." : "Save Settings"}</span>
      </button>
    </div>

    <!-- Info Section -->
    <div class="info-section">
      <div class="info-icon">
        <Layers size={16} />
      </div>
      <div class="info-text">
        Toggle layers on/off to customize your map view.
      </div>
    </div>
  </div>
</div>

{#if showMarkerVisibilityModal}
  <MarkerVisibilityModal
    on:close={() => (showMarkerVisibilityModal = false)}
    on:change={handleMarkerVisibilityChange}
  />
{/if}

<style>
  .layer-controls {
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    box-sizing: border-box;
    width: 100%;
    min-height: 100%;
    overflow: visible;
  }

  /* Quick Actions */
  .quick-actions {
    display: flex;
    gap: 8px;
  }

  .quick-action-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px 10px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    color: rgba(255, 255, 255, 0.8);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .quick-action-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.2);
    color: white;
  }

  /* Layer List */
  .layer-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .layer-row {
    display: flex;
    width: 100%;
  }

  .layer-row.indent {
    padding-left: 20px;
  }

  .marker-settings-row {
    padding-left: 20px;
    width: 100%;
  }

  .marker-settings-btn {
    width: 100%;
    min-height: 36px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 10px;
    background: rgba(96, 165, 250, 0.08);
    border: 1px solid rgba(96, 165, 250, 0.18);
    border-radius: 8px;
    color: rgba(255, 255, 255, 0.82);
    cursor: pointer;
    box-sizing: border-box;
    transition: all 0.2s ease;
  }

  .marker-settings-btn:hover {
    background: rgba(96, 165, 250, 0.14);
    border-color: rgba(96, 165, 250, 0.32);
    color: white;
  }

  .marker-settings-left {
    min-width: 0;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    font-weight: 600;
  }

  .marker-settings-count {
    flex-shrink: 0;
    font-size: 11px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.58);
  }

  .layer-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s ease;
    flex: 1;
    text-align: left;
    box-sizing: border-box;
    min-width: 0;
  }

  .layer-row.indent .layer-item {
    background: rgba(255, 255, 255, 0.02);
    border-color: rgba(255, 255, 255, 0.06);
  }

  .layer-item:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.15);
  }

  .layer-item.active {
    background: rgba(255, 255, 255, 0.05);
  }

  .layer-left {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;
    min-width: 0;
  }

  .layer-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 6px;
    flex-shrink: 0;
  }

  .layer-info {
    flex: 1;
    min-width: 0;
  }

  .layer-name {
    font-size: 13px;
    font-weight: 500;
    color: white;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Toggle Switch */
  .layer-toggle {
    flex-shrink: 0;
    margin-left: 8px;
  }

  .toggle-switch {
    position: relative;
    width: 36px;
    height: 20px;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 10px;
    transition: all 0.3s ease;
  }

  .toggle-switch.on {
    background: rgba(34, 197, 94, 0.3);
    border-color: rgba(34, 197, 94, 0.5);
  }

  .toggle-slider {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 14px;
    height: 14px;
    background: rgba(255, 255, 255, 0.8);
    border-radius: 50%;
    transition: all 0.3s ease;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  .toggle-switch.on .toggle-slider {
    transform: translateX(16px);
    background: #22c55e;
  }

  /* Info Section */
  .info-section {
    display: flex;
    gap: 8px;
    padding: 10px;
    background: rgba(96, 165, 250, 0.1);
    border: 1px solid rgba(96, 165, 250, 0.2);
    border-radius: 8px;
  }

  .sticky-layer-footer {
    position: sticky;
    bottom: 0;
    z-index: 5;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 10px 12px 12px;
    margin: 0 -12px -12px;
    margin-top: auto;
    background: #0a0a0a;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  .info-icon {
    color: #60a5fa;
    flex-shrink: 0;
    margin-top: 1px;
  }

  .info-text {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.7);
    line-height: 1.4;
  }

  .save-section {
    display: flex;
    flex-direction: column;
    gap: 7px;
  }

  .save-settings-btn {
    width: 100%;
    min-height: 38px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.05);
    color: rgba(255, 255, 255, 0.55);
    font-size: 13px;
    font-weight: 700;
    cursor: not-allowed;
    transition: all 0.2s ease;
  }

  .save-settings-btn.dirty {
    background: rgba(34, 197, 94, 0.18);
    border-color: rgba(34, 197, 94, 0.38);
    color: #dcfce7;
    cursor: pointer;
  }

  .save-settings-btn.dirty:hover:not(:disabled) {
    background: rgba(34, 197, 94, 0.26);
    border-color: rgba(34, 197, 94, 0.52);
  }

  .save-settings-btn:disabled {
    opacity: 0.7;
  }

</style>
