<!-- src/lib/components/map/toolbox/CollectionControls.svelte -->
<script>
  import { createEventDispatcher } from "svelte"
  import { Magnet, MapPin, Route, Trash2 } from "lucide-svelte"
  import IconSVG from "$lib/components/general/IconSVG.svelte"
  import {
    collectionModeStore,
    collectionRouteStore,
  } from "$lib/stores/markerStore"
  import { getActiveMarkers } from "$lib/data/markerDefinitions"

  const dispatch = createEventDispatcher()

  // All non-default active markers as collection targets
  $: availableTargets = getActiveMarkers().filter((m) => m.id !== "default")

  // Count how many targets are selected
  $: selectedCount = $collectionModeStore.targetIconClasses.size

  // Route planner state
  $: routePhase = $collectionRouteStore.phase
  $: routeMarkerCount = $collectionRouteStore.selectedMarkers.length
  $: routeDistanceM = $collectionRouteStore.routeDistanceM

  function startRoutePlanning() {
    collectionRouteStore.startDrawing()
    dispatch("close") // close the toolbox so user can draw on the map
  }

  function clearRoute() {
    collectionRouteStore.clearRoute()
  }

  function formatDistance(metres) {
    if (metres >= 1000) return `${(metres / 1000).toFixed(1)} km`
    return `${metres} m`
  }
</script>

<div class="collection-controls">
  <!-- Toggle ON/OFF -->
  <div class="toggle-section">
    <button
      class="power-button"
      class:power-active={$collectionModeStore.enabled}
      on:click={() => collectionModeStore.toggle()}
    >
      <Magnet size={28} />
      <span>{$collectionModeStore.enabled ? "Active" : "Off"}</span>
    </button>
    <p class="toggle-description">
      {#if $collectionModeStore.enabled}
        Markers within <strong>{$collectionModeStore.radius}m</strong> will be
        auto-collected as you move.
        <span class="target-count"
          >{selectedCount} type{selectedCount !== 1 ? "s" : ""} targeted</span
        >
      {:else}
        Drive near markers to automatically collect and remove them.
      {/if}
    </p>
  </div>

  <!-- Radius -->
  <div class="control-group">
    <span class="group-label">Collection Radius</span>
    <div class="chip-row">
      {#each [5, 10, 15, 25, 50] as r}
        <button
          class="chip"
          class:chip-active={$collectionModeStore.radius === r}
          on:click={() => collectionModeStore.setRadius(r)}>{r}m</button
        >
      {/each}
    </div>
  </div>

  <!-- Animation Style -->
  <div class="control-group">
    <span class="group-label">Collection Effect</span>
    <div class="chip-row">
      <button
        class="chip effect-chip"
        class:chip-active={$collectionModeStore.animationStyle === "green"}
        on:click={() => collectionModeStore.setAnimationStyle("green")}
      >
        ✨ Collect
      </button>
      <button
        class="chip effect-chip"
        class:chip-active={$collectionModeStore.animationStyle === "red"}
        on:click={() => collectionModeStore.setAnimationStyle("red")}
      >
        💥 Destroy
      </button>
    </div>
  </div>

  <!-- ── Route Planner ── -->
  <div class="control-group route-section">
    <span class="group-label">Route Planner</span>
    <p class="group-hint">
      Draw a boundary around markers to calculate the shortest collection route.
    </p>

    {#if routePhase === "drawing"}
      <div class="route-status drawing-status">
        <div class="status-dot drawing-dot"></div>
        <span>Drawing… drag on the map to lasso an area</span>
      </div>
    {:else if routePhase === "selected"}
      <div class="route-result">
        <div class="route-stat">
          <span class="stat-value">{routeMarkerCount}</span>
          <span class="stat-label"
            >marker{routeMarkerCount !== 1 ? "s" : ""}</span
          >
        </div>
      </div>
      <p class="group-hint" style="text-align:center;">
        Use the overlay on the map to start or cancel.
      </p>
    {:else if routePhase === "navigating"}
      <div class="route-result">
        <div class="route-stat">
          <span class="stat-value">{routeMarkerCount}</span>
          <span class="stat-label">stop{routeMarkerCount !== 1 ? "s" : ""}</span
          >
        </div>
        <div class="route-stat">
          <span class="stat-value">{formatDistance(routeDistanceM)}</span>
          <span class="stat-label">remaining</span>
        </div>
      </div>
      <button class="route-clear-btn" on:click={clearRoute}>
        <Trash2 size={14} />
        <span>Stop Navigation</span>
      </button>
    {:else}
      <button class="route-plan-btn" on:click={startRoutePlanning}>
        <Route size={20} />
        <span>Plan Route</span>
      </button>
    {/if}
  </div>

  <!-- Target Markers -->
  <div class="control-group">
    <span class="group-label">Target Markers</span>
    <p class="group-hint">Select which marker types to auto-collect</p>
    <div class="target-grid">
      {#each availableTargets as marker}
        {@const iconClass =
          marker.class === "custom-svg"
            ? `custom-svg-${marker.id}`
            : marker.class}
        <button
          class="target-btn"
          class:target-active={$collectionModeStore.targetIconClasses.has(
            iconClass,
          )}
          on:click={() => collectionModeStore.toggleTarget(iconClass)}
          title={marker.name}
        >
          <div class="target-icon">
            {#if marker.class === "custom-svg"}
              <IconSVG icon={marker.id} size="28px" />
            {:else if marker.class?.startsWith("ionic-")}
              <ion-icon name={marker.id} style="font-size: 28px;"></ion-icon>
            {:else if marker.class?.startsWith("at-")}
              <i class={marker.class} style="font-size: 28px;"></i>
            {:else}
              <MapPin size={24} />
            {/if}
          </div>
          <span class="target-name">{marker.name}</span>
        </button>
      {/each}
    </div>
  </div>
</div>

<style>
  .collection-controls {
    padding: 16px 12px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  /* ── Toggle Section ── */
  .toggle-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
  }

  .power-button {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100px;
    height: 100px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.08);
    border: 2px solid rgba(255, 255, 255, 0.15);
    color: rgba(255, 255, 255, 0.7);
    cursor: pointer;
    transition: all 0.25s ease;
    font-size: 12px;
    font-weight: 600;
  }
  .power-button:hover {
    background: rgba(255, 255, 255, 0.14);
    border-color: rgba(255, 255, 255, 0.3);
    color: #fff;
    transform: scale(1.05);
  }
  .power-button.power-active {
    background: rgba(168, 85, 247, 0.25);
    border-color: #a855f7;
    color: #e9d5ff;
    box-shadow: 0 0 20px rgba(168, 85, 247, 0.4);
    animation: power-glow 2s ease-in-out infinite;
  }
  .power-button.power-active:hover {
    background: rgba(168, 85, 247, 0.35);
  }

  @keyframes power-glow {
    0%,
    100% {
      box-shadow: 0 0 14px rgba(168, 85, 247, 0.35);
    }
    50% {
      box-shadow: 0 0 24px rgba(168, 85, 247, 0.6);
    }
  }

  .toggle-description {
    margin: 0;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.55);
    text-align: center;
    line-height: 1.5;
    max-width: 220px;
  }
  .toggle-description strong {
    color: #e9d5ff;
  }
  .target-count {
    display: block;
    margin-top: 2px;
    color: #c084fc;
    font-weight: 600;
  }

  /* ── Control Groups ── */
  .control-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .group-label {
    font-size: 11px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.7);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .group-hint {
    margin: 0;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.4);
  }

  /* ── Chips ── */
  .chip-row {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .chip {
    font-size: 12px;
    padding: 6px 12px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: rgba(255, 255, 255, 0.7);
    cursor: pointer;
    transition: all 0.15s ease;
    font-weight: 500;
  }
  .chip:hover {
    background: rgba(255, 255, 255, 0.15);
    color: #fff;
  }
  .chip.chip-active {
    background: rgba(168, 85, 247, 0.25);
    border-color: #a855f7;
    color: #e9d5ff;
    font-weight: 600;
  }

  .effect-chip {
    flex: 1;
    text-align: center;
  }

  /* ── Target Marker Grid ── */
  .target-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    margin-top: 2px;
  }

  .target-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 10px 4px 8px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.06);
    border: 1.5px solid rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.55);
    cursor: pointer;
    transition: all 0.15s ease;
    min-height: 70px;
  }
  .target-btn:hover {
    background: rgba(255, 255, 255, 0.12);
    color: #fff;
    border-color: rgba(255, 255, 255, 0.25);
  }
  .target-btn.target-active {
    background: rgba(168, 85, 247, 0.2);
    border-color: #a855f7;
    color: #e9d5ff;
    box-shadow: 0 0 8px rgba(168, 85, 247, 0.25);
  }

  .target-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
  }

  .target-name {
    font-size: 9px;
    font-weight: 500;
    text-align: center;
    line-height: 1.2;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
    white-space: nowrap;
  }

  /* ── Route Planner ── */
  .route-section {
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    padding-top: 16px;
  }

  .route-plan-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    padding: 12px;
    border-radius: 10px;
    background: rgba(168, 85, 247, 0.15);
    border: 1.5px solid rgba(168, 85, 247, 0.4);
    color: #c084fc;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  .route-plan-btn:hover {
    background: rgba(168, 85, 247, 0.25);
    border-color: #a855f7;
    color: #e9d5ff;
  }

  .route-status {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-radius: 8px;
    background: rgba(168, 85, 247, 0.1);
    border: 1px solid rgba(168, 85, 247, 0.25);
    color: rgba(255, 255, 255, 0.75);
    font-size: 12px;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .drawing-dot {
    background: #a855f7;
    animation: dot-pulse 1s ease-in-out infinite;
  }
  @keyframes dot-pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.3;
    }
  }

  .route-result {
    display: flex;
    gap: 12px;
    justify-content: center;
  }

  .route-stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 10px 16px;
    border-radius: 10px;
    background: rgba(168, 85, 247, 0.12);
    border: 1px solid rgba(168, 85, 247, 0.25);
    flex: 1;
  }
  .stat-value {
    font-size: 18px;
    font-weight: 700;
    color: #c084fc;
  }
  .stat-label {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.5);
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .route-clear-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    padding: 8px;
    margin-top: 6px;
    border-radius: 8px;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.25);
    color: #f87171;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .route-clear-btn:hover {
    background: rgba(239, 68, 68, 0.2);
    border-color: rgba(239, 68, 68, 0.4);
  }
</style>
