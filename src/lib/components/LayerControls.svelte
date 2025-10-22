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
  } from "lucide-svelte"
  import { layerVisibilityStore } from "$lib/stores/layerVisibilityStore"

  // Layer definitions with metadata
  const layers = [
    {
      id: "markers",
      name: "Markers",
      icon: MapPin,
      description: "Show/hide map markers",
      color: "#60a5fa",
    },
    {
      id: "markerDrawings",
      name: "Marker Drawings",
      icon: Pen,
      description: "Show/hide marker annotations",
      color: "#60a5fa",
      indent: true,
    },
    {
      id: "fields",
      name: "Fields",
      icon: Square,
      description: "Show/hide field boundaries",
      color: "#34d399",
    },
    {
      id: "fieldLabels",
      name: "Field Labels",
      icon: Square,
      description: "Show/hide field names",
      color: "#34d399",
      indent: true,
    },
    {
      id: "vehicles",
      name: "Vehicles",
      icon: Truck,
      description: "Show/hide vehicle icons",
      color: "#f97316",
    },
    {
      id: "vehicleLabels",
      name: "Vehicle Labels",
      icon: Truck,
      description: "Show/hide initials above vehicles",
      color: "#f97316",
      indent: true,
    },
    {
      id: "historicalTrails",
      name: "Historical Trails",
      icon: History,
      description: "Show/hide completed trail paths",
      color: "#8b5cf6",
    },
    {
      id: "activeTrails",
      name: "Active Trails",
      icon: Activity,
      description: "Show/hide currently recording trails",
      color: "#ec4899",
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
      <button
        class="layer-item"
        class:indent={layer.indent}
        class:active={$layerVisibilityStore[layer.id]}
        on:click={() => toggleLayer(layer.id)}
      >
        <div class="layer-left">
          <div class="layer-icon" style="color: {layer.color}">
            <svelte:component this={layer.icon} size={20} />
          </div>
          <div class="layer-info">
            <div class="layer-name">{layer.name}</div>
            <div class="layer-description">{layer.description}</div>
          </div>
        </div>

        <div class="layer-toggle">
          <div class="toggle-switch" class:on={$layerVisibilityStore[layer.id]}>
            <div class="toggle-slider"></div>
          </div>
        </div>
      </button>
    {/each}
  </div>

  <!-- Info Section -->
  <div class="info-section">
    <div class="info-icon">
      <Layers size={16} />
    </div>
    <div class="info-text">
      Toggle layers on/off to customize your map view. Changes are instant.
    </div>
  </div>
</div>

<style>
  .layer-controls {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  /* Quick Actions */
  .quick-actions {
    display: flex;
    gap: 10px;
  }

  .quick-action-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 10px 12px;
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
    gap: 8px;
  }

  .layer-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 12px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.2s ease;
    width: 100%;
    text-align: left;
  }

  .layer-item.indent {
    margin-left: 20px;
    background: rgba(255, 255, 255, 0.02);
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
    gap: 12px;
    flex: 1;
  }

  .layer-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 8px;
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
    margin-bottom: 2px;
  }

  .layer-description {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.5);
    line-height: 1.2;
  }

  /* Toggle Switch */
  .layer-toggle {
    flex-shrink: 0;
  }

  .toggle-switch {
    position: relative;
    width: 40px;
    height: 22px;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 11px;
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
    width: 16px;
    height: 16px;
    background: rgba(255, 255, 255, 0.8);
    border-radius: 50%;
    transition: all 0.3s ease;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  .toggle-switch.on .toggle-slider {
    transform: translateX(18px);
    background: #22c55e;
  }

  /* Info Section */
  .info-section {
    display: flex;
    gap: 10px;
    padding: 12px;
    background: rgba(96, 165, 250, 0.1);
    border: 1px solid rgba(96, 165, 250, 0.2);
    border-radius: 8px;
    margin-top: 4px;
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

  /* Mobile Responsive */
  @media (max-width: 768px) {
    .layer-controls {
      padding: 12px;
    }

    .layer-item {
      padding: 12px 10px;
    }

    .layer-name {
      font-size: 12px;
    }

    .layer-description {
      font-size: 10px;
    }
  }

  @media (max-width: 480px) {
    .layer-controls {
      padding: 10px;
      gap: 16px;
    }

    .layer-item {
      padding: 10px 8px;
    }

    .layer-icon {
      width: 28px;
      height: 28px;
    }

    .quick-action-btn {
      font-size: 11px;
      padding: 8px 10px;
    }
  }
</style>
