<!-- src/lib/components/LayerControls.svelte -->
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
  } from "lucide-svelte"
  import { layerVisibilityStore } from "$lib/stores/layerVisibilityStore"

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
  }

  function handleShowAll() {
    layerVisibilityStore.showAll()
  }

  function handleHideAll() {
    layerVisibilityStore.hideAll()
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
    {/each}
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

<style>
  .layer-controls {
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    box-sizing: border-box;
    width: 100%;
    overflow: hidden;
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
</style>
