<!-- src/lib/components/map/toolbox/Toolbox.svelte -->
<script>
  import { createEventDispatcher } from "svelte"
  import {
    MapPin,
    Route,
    Truck,
    Ruler,
    Satellite,
    Layers,
    Zap,
    Gamepad2,
    Magnet,
    Radio,
    LandPlot,
  } from "lucide-svelte"
  import { drawingModeEnabled } from "$lib/stores/controlStore"
  import {
    devModeEnabled,
    devBackgroundSimEnabled,
  } from "$lib/stores/devModeStore"
  import {
    collectionModeStore,
    confirmedMarkersStore,
  } from "$lib/stores/markerStore"
  import {
    historicalTrailStore,
    trailsLoadingStore,
    visibleOperationIdsStore,
  } from "$lib/stores/otherTrailStore"
  import { trailsMetaDataStore } from "$lib/stores/trailsMetaDataStore"
  import { mapFieldsStore } from "$lib/stores/mapFieldsStore"
  import {
    operationStore,
    selectedOperationStore,
  } from "$lib/stores/operationStore"
  import { profileStore } from "$lib/stores/profileStore"
  import {
    userVehicleTrailing,
    userVehicleStore,
    otherVehiclesStore,
  } from "$lib/stores/vehicleStore"
  import { operationApi } from "$lib/api/operationApi"
  import { commandStore, COMMANDS } from "$lib/stores/commandStore"
  import { toast } from "svelte-sonner"
  import {
    ChevronDown,
    AlertTriangle,
    Eye,
    EyeOff,
    Loader2,
  } from "lucide-svelte"

  // Import vehicle components
  import { userSettingsStore } from "$lib/stores/userSettingsStore"
  import SVGComponents from "$lib/vehicles/index.js"
  import IconSVG from "$lib/components/general/IconSVG.svelte"

  // Import toolbox control components
  import SatelliteControls from "./SatelliteControls.svelte"
  import MarkerControls from "$lib/components/map/markers/MarkerControls.svelte"
  import VehicleControls from "$lib/components/map/vehicles/VehicleControls_lib.svelte"
  import TrailControls from "$lib/components/map/trails/TrailControls.svelte"
  import LayerControls from "./LayerControls.svelte"
  import CollectionControls from "./CollectionControls.svelte"
  import FieldControls from "./FieldControls.svelte"
  import VehicleFlashController from "$lib/components/map/vehicles/VehicleFlashController.svelte"

  export let isOpen = false
  export let satelliteManager = null
  export let trailReplayAPI = null

  const dispatch = createEventDispatcher()

  let activePanel = null

  // Get vehicle icon component from store
  let VehicleIcon
  $: {
    if (
      $userVehicleStore.vehicle_marker &&
      $userVehicleStore.vehicle_marker.type
    ) {
      VehicleIcon =
        SVGComponents[$userVehicleStore.vehicle_marker.type] ||
        SVGComponents.Pointer
    }
  }

  // Check if vehicle is currently flashing
  $: isFlashing = $userVehicleStore.is_flashing || false

  // Trail count for badge
  $: trailCount = ($historicalTrailStore || []).filter((t) => t.end_time).length

  // Marker count for badge
  $: markerCount = ($confirmedMarkersStore || []).length

  // Field count for badge
  $: fieldCount = ($mapFieldsStore || []).length

  // Trail counts per operation (from metadata store)
  $: trailCountsByOperation = $trailsMetaDataStore.reduce((counts, trail) => {
    const opId = trail.operation_id
    if (opId) {
      counts[opId] = (counts[opId] || 0) + 1
    }
    return counts
  }, /** @type {Record<string, number>} */ ({}))

  function getOpTrailCount(operationId) {
    return trailCountsByOperation[operationId] || 0
  }

  // Trailing vehicle counts per operation
  $: trailingVehiclesByOperation = (() => {
    const counts = /** @type {Record<string, number>} */ ({})
    // Count the current user if trailing
    if ($userVehicleTrailing && $selectedOperationStore?.id) {
      counts[$selectedOperationStore.id] =
        (counts[$selectedOperationStore.id] || 0) + 1
    }
    // Count other vehicles that are trailing
    for (const v of $otherVehiclesStore) {
      if (v.is_trailing) {
        const opId = v.operation_id || v.selected_operation_id
        if (opId) {
          counts[opId] = (counts[opId] || 0) + 1
        }
      }
    }
    return counts
  })()

  function getOpVehicleCount(operationId) {
    return trailingVehiclesByOperation[operationId] || 0
  }

  function getDefaultMarker() {
    return (
      $userSettingsStore?.defaultMarker || {
        id: "default",
        class: "default",
        name: "Default Marker",
      }
    )
  }

  $: defaultMarker = getDefaultMarker()

  function closeToolbox() {
    operationDropdownOpen = false
    dispatch("close")
  }

  function handleFlashClose() {
    closeToolbox()
  }

  function showMainPanel() {
    activePanel = null
    operationDropdownOpen = false
  }

  function showSatellitePanel() {
    activePanel = "satellite"
  }

  function showMarkerPanel() {
    activePanel = "marker"
  }

  function showVehiclePanel() {
    activePanel = "vehicle"
  }

  export function switchToVehiclePanel() {
    console.log("🔧 Toolbox: Switching to vehicle panel")
    activePanel = "vehicle"
  }

  export function switchToMarkerPanel() {
    console.log("🔧 Toolbox: Switching to marker panel")
    activePanel = "marker"
  }

  export function switchToFlashPanel() {
    console.log("🔧 Toolbox: Switching to flash panel")
    activePanel = "flash"
  }

  function showTrailPanel() {
    activePanel = "trail"
  }

  function showLayersPanel() {
    activePanel = "layers"
  }

  function showFlashPanel() {
    activePanel = "flash"
  }

  function showCollectionPanel() {
    activePanel = "collection"
  }

  function toggleDevMode() {
    devModeEnabled.update((v) => !v)
    closeToolbox()
  }

  function toggleBgSim() {
    devBackgroundSimEnabled.update((v) => !v)
    closeToolbox()
  }

  function handleMeasurement() {
    $drawingModeEnabled = !$drawingModeEnabled
    closeToolbox()
  }

  function handleAddField(event) {
    dispatch("addField", event.detail)
    closeToolbox()
  }

  function handleSwitchToVehicle() {
    showVehiclePanel()
  }

  function handleVehicleControls() {
    showVehiclePanel()
  }

  function handleTrailControls() {
    showTrailPanel()
  }

  // Trail overlay visibility for other operations
  function toggleVisibleOperation(opId) {
    visibleOperationIdsStore.update((ids) => {
      const next = new Set(ids)
      if (next.has(opId)) {
        next.delete(opId)
      } else {
        next.add(opId)
      }
      return next
    })
  }

  // ── Operation Switching ──────────────────────────────
  let operationDropdownOpen = false
  let switchingOperation = false
  let showOperationConfirmModal = false
  let pendingOperationId = null

  function toggleOperationDropdown() {
    operationDropdownOpen = !operationDropdownOpen
  }

  function closeOperationDropdown() {
    operationDropdownOpen = false
  }

  async function handleOperationSwitch(operationId) {
    if (operationId === $selectedOperationStore?.id) {
      operationDropdownOpen = false
      return
    }

    // If currently trailing, show confirmation modal instead of switching immediately
    if ($userVehicleTrailing) {
      pendingOperationId = operationId
      operationDropdownOpen = false
      showOperationConfirmModal = true
      return
    }

    switchingOperation = true
    await completeOperationSwitch(operationId)
    switchingOperation = false
  }

  async function confirmOperationSwitch() {
    showOperationConfirmModal = false
    switchingOperation = true

    // Stop the active trail
    commandStore.dispatch(COMMANDS.TRAIL_STOP)

    // Wait for trailing to stop
    await new Promise((resolve) => {
      let initial = true
      const unsub = userVehicleTrailing.subscribe((isTrailing) => {
        if (initial) {
          initial = false
          return
        }
        if (!isTrailing) {
          unsub()
          resolve(undefined)
        }
      })
    })

    await completeOperationSwitch(pendingOperationId)
    pendingOperationId = null
    switchingOperation = false
  }

  function cancelOperationSwitch() {
    showOperationConfirmModal = false
    pendingOperationId = null
  }

  async function completeOperationSwitch(operationId) {
    const operation = $operationStore.find((op) => op.id === operationId)
    if (!operation || !$profileStore?.id) return

    try {
      const result = await operationApi.updateSelectedOperation(
        $profileStore.id,
        operationId,
      )

      if (!result.success) {
        toast.error(`Failed to switch operation: ${result.message}`)
        return
      }

      selectedOperationStore.set(operation)
      profileStore.update((p) => ({
        ...p,
        selected_operation_id: operationId,
      }))

      operationDropdownOpen = false
      toast.success(`Switched to ${operation.name}`)
    } catch (err) {
      toast.error(`Failed to switch operation`)
    }
  }
</script>

{#if isOpen}
  <div
    class="toolbox-backdrop"
    on:click={closeToolbox}
    on:keydown={(e) => e.key === "Escape" && closeToolbox()}
  ></div>

  <div class="toolbox-panel">
    <div class="toolbox-header">
      <div class="header-content">
        {#if activePanel === "satellite"}
          <button class="back-button" on:click={showMainPanel}> ← </button>
          <h3>Satellite Options</h3>
        {:else if activePanel === "marker"}
          <button class="back-button" on:click={showMainPanel}> ← </button>
          <h3>Marker Tools</h3>
        {:else if activePanel === "vehicle"}
          <button class="back-button" on:click={showMainPanel}> ← </button>
          <h3>Vehicle Setup</h3>
        {:else if activePanel === "trail"}
          <button class="back-button" on:click={showMainPanel}> ← </button>
          <h3>Trail Recording</h3>
        {:else if activePanel === "layers"}
          <button class="back-button" on:click={showMainPanel}> ← </button>
          <h3>Map Layers</h3>
        {:else if activePanel === "flash"}
          <button class="back-button" on:click={showMainPanel}> ← </button>
          <h3>Flash Signals</h3>
        {:else if activePanel === "collection"}
          <button class="back-button" on:click={showMainPanel}> ← </button>
          <h3>Collection Mode</h3>
        {:else if activePanel === "fields"}
          <button class="back-button" on:click={showMainPanel}> ← </button>
          <h3>Fields</h3>
        {:else}
          <h3>Toolbox</h3>
          {#if $operationStore.length > 0}
            <div class="operation-selector">
              <button
                class="operation-toggle op-toggle-floating"
                class:open={operationDropdownOpen}
                disabled={switchingOperation}
                on:click|stopPropagation={toggleOperationDropdown}
              >
                <span class="op-float-badge">Operation</span>
                <span class="operation-current-name">
                  {switchingOperation
                    ? "Switching..."
                    : $selectedOperationStore?.name || "No Operation"}
                </span>
                <ChevronDown
                  size={12}
                  class={operationDropdownOpen ? "chevron-open" : ""}
                />
              </button>
            </div>
          {/if}
        {/if}
      </div>
      {#if operationDropdownOpen}
        <div class="operation-dropdown">
          {#each $operationStore as op (op.id)}
            <div class="operation-option-row">
              <button
                class="operation-option flex-1"
                class:active={op.id === $selectedOperationStore?.id}
                disabled={switchingOperation}
                on:click={() => handleOperationSwitch(op.id)}
              >
                {#if op.id === $selectedOperationStore?.id}
                  <div class="active-indicator"></div>
                {:else}
                  <div class="inactive-indicator"></div>
                {/if}
                <span class="op-name">{op.name}</span>
                <span class="op-badges">
                  {#if getOpVehicleCount(op.id) > 0}
                    <span class="op-vehicle-count"
                      >{getOpVehicleCount(op.id)} <Truck size={10} /></span
                    >
                  {/if}
                  {#if getOpTrailCount(op.id) > 0}
                    <span class="op-trail-count"
                      >{getOpTrailCount(op.id)} <Route size={10} /></span
                    >
                  {/if}
                </span>
                <span class="op-year">{op.year}</span>
              </button>
              {#if op.id !== $selectedOperationStore?.id}
                <button
                  class="eye-toggle"
                  class:visible={$visibleOperationIdsStore.has(op.id)}
                  on:click|stopPropagation={() => toggleVisibleOperation(op.id)}
                  title={$visibleOperationIdsStore.has(op.id)
                    ? "Hide trails"
                    : "Show trails"}
                >
                  {#if $visibleOperationIdsStore.has(op.id)}
                    <Eye size={15} />
                  {:else}
                    <EyeOff size={15} />
                  {/if}
                </button>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <div class="toolbox-content">
      {#if activePanel === "satellite"}
        <SatelliteControls {satelliteManager} />
      {:else if activePanel === "marker"}
        <MarkerControls on:close={closeToolbox} on:selectMarker />
      {:else if activePanel === "vehicle"}
        <VehicleControls on:close={closeToolbox} />
      {:else if activePanel === "trail"}
        <TrailControls
          on:openTrailViewer={() => dispatch("openTrailViewer")}
          on:switchToVehicle={handleSwitchToVehicle}
          on:close={closeToolbox}
          on:selectTrail
          on:replayTrail
        />
      {:else if activePanel === "layers"}
        <LayerControls />
      {:else if activePanel === "flash"}
        <div class="flash-panel-container">
          <VehicleFlashController on:closeToolbox={handleFlashClose} />
        </div>
      {:else if activePanel === "collection"}
        <CollectionControls on:close={closeToolbox} />
      {:else if activePanel === "fields"}
        <FieldControls on:selectField on:addField={handleAddField} />
      {:else}
        <div class="tool-grid">
          <button class="tool-button" on:click={showVehiclePanel}>
            <div class="vehicle-icon-container">
              {#if VehicleIcon}
                <svelte:component
                  this={VehicleIcon}
                  bodyColor={$userVehicleStore.vehicle_marker.bodyColor}
                  size="32px"
                />
              {:else}
                <Truck size={32} />
              {/if}
            </div>
            <span>Vehicle</span>
          </button>

          <button class="tool-button" on:click={showMarkerPanel}>
            <div class="marker-icon-container">
              {#if defaultMarker.id === "default"}
                <IconSVG icon="mapbox-marker" size="32px" />
              {:else if defaultMarker.class === "custom-svg"}
                <IconSVG icon={defaultMarker.id} size="32px" />
              {:else if defaultMarker.class?.startsWith("ionic-")}
                <ion-icon name={defaultMarker.id} style="font-size: 32px;"
                ></ion-icon>
              {:else if defaultMarker.class?.startsWith("at-")}
                <i class={`${defaultMarker.class}`} style="font-size: 32px;"
                ></i>
              {:else}
                <MapPin size={32} />
              {/if}
            </div>
            <span>Markers</span>
            {#if markerCount > 0}
              <span class="tool-badge marker-badge">{markerCount}</span>
            {/if}
          </button>

          <button class="tool-button" on:click={handleTrailControls}>
            <Route size={26} />
            <span>Trails</span>
            {#if $trailsLoadingStore}
              <span class="tool-badge trail-badge trail-badge-loading"
                ><Loader2 size={12} class="spin" /></span
              >
            {:else if trailCount > 0}
              <span class="tool-badge trail-badge">{trailCount}</span>
            {/if}
          </button>

          <button class="tool-button" on:click={() => (activePanel = "fields")}>
            <LandPlot size={26} />
            <span>Fields</span>
            {#if fieldCount > 0}
              <span class="tool-badge field-badge">{fieldCount}</span>
            {/if}
          </button>

          <div class="tool-grid-separator"></div>

          <button
            class="tool-button"
            class:tool-active={$drawingModeEnabled}
            on:click={handleMeasurement}
          >
            <Ruler size={26} />
            <span>Measure</span>
          </button>

          <button class="tool-button" on:click={showSatellitePanel}>
            <Satellite size={26} />
            <span>Satellite</span>
          </button>

          <button class="tool-button" on:click={showLayersPanel}>
            <Layers size={26} />
            <span>Layers</span>
          </button>

          <button
            class="tool-button flash-tool"
            class:tool-active={isFlashing}
            on:click={showFlashPanel}
          >
            <Zap size={26} class={isFlashing ? "flashing-icon" : ""} />
            <span>{isFlashing ? "Flashing..." : "Flash Signal"}</span>
          </button>

          <button
            class="tool-button collection-tool"
            class:tool-active={$collectionModeStore.enabled}
            on:click={showCollectionPanel}
          >
            <Magnet size={26} />
            <span>Rock Picking</span>
          </button>

          {#if $userSettingsStore.devToolsEnabled}
            <button
              class="tool-button"
              class:tool-active={$devModeEnabled}
              on:click={toggleDevMode}
            >
              <Gamepad2 size={26} />
              <span>{$devModeEnabled ? "Exit Dev Mode" : "Dev Mode"}</span>
            </button>

            <button
              class="tool-button"
              class:tool-active={$devBackgroundSimEnabled}
              on:click={toggleBgSim}
            >
              <Radio size={26} />
              <span>{$devBackgroundSimEnabled ? "Exit BG Sim" : "BG Sim"}</span>
            </button>
          {/if}
        </div>
      {/if}
    </div>
  </div>
{/if}

<!-- Operation Switch Confirmation Modal -->
{#if showOperationConfirmModal}
  <div
    class="confirm-overlay"
    on:click={cancelOperationSwitch}
    on:keydown={(e) => e.key === "Escape" && cancelOperationSwitch()}
  >
    <div class="confirm-modal" on:click|stopPropagation>
      <div class="confirm-header">
        <AlertTriangle size={20} class="text-amber-400" />
        <h3>Switch Operation?</h3>
      </div>
      <div class="confirm-body">
        <p>You are currently recording a trail.</p>
        <p>
          Switching operations will <strong>stop and save</strong> your current trail,
          then switch to the new operation.
        </p>
      </div>
      <div class="confirm-footer">
        <button class="confirm-btn cancel" on:click={cancelOperationSwitch}
          >Cancel</button
        >
        <button class="confirm-btn proceed" on:click={confirmOperationSwitch}
          >Stop Trail & Switch</button
        >
      </div>
    </div>
  </div>
{/if}

<style>
  .tool-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    padding: 16px 12px;
    align-content: start;
  }

  .toolbox-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.6);
    z-index: 1000;
    animation: fadeIn 0.2s ease-out;
  }

  .toolbox-panel {
    position: fixed;
    top: 0;
    left: 0;
    width: 280px;
    height: 100%;
    background: #0a0a0a;
    border-right: 1px solid rgba(255, 255, 255, 0.15);
    z-index: 1001;
    display: flex;
    flex-direction: column;
    animation: slideInLeft 0.3s ease-out;
    color: rgba(255, 255, 255, 0.95);
  }

  .toolbox-header {
    padding: 20px 16px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.15);
    background: #0d0d0d;
    position: relative;
    z-index: 2;
  }

  .header-content {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .back-button {
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 50%;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(255, 255, 255, 0.9);
    cursor: pointer;
    transition: all 0.2s ease;
    font-size: 18px;
    font-weight: bold;
  }

  .back-button:hover {
    background: rgba(255, 255, 255, 0.2);
    color: #ffffff;
  }

  .toolbox-header h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: #ffffff;
    flex: 1;
  }

  /* Operation Selector */
  .operation-selector {
    position: relative;
  }

  .operation-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 8px;
    color: rgba(255, 255, 255, 0.85);
    cursor: pointer;
    transition: all 0.2s ease;
    font-size: 12px;
    font-weight: 500;
    max-width: 150px;
    white-space: nowrap;
  }

  .operation-toggle:hover {
    background: rgba(255, 255, 255, 0.15);
    border-color: rgba(255, 255, 255, 0.25);
  }

  .operation-toggle.open {
    background: rgba(96, 165, 250, 0.15);
    border-color: rgba(96, 165, 250, 0.4);
  }

  .operation-toggle:disabled {
    opacity: 0.5;
    cursor: wait;
  }

  .operation-current-name {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .operation-toggle :global(.chevron-open) {
    transform: rotate(180deg);
  }

  .operation-toggle :global(svg) {
    flex-shrink: 0;
    transition: transform 0.2s ease;
  }

  .operation-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: #1a1a1a;
    border-bottom: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 0 0 14px 14px;
    padding: 6px 10px 10px;
    max-height: calc(100vh - 80px);
    overflow-y: auto;
    animation: fadeIn 0.15s ease-out;
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.4);
    z-index: 1;
  }

  .operation-dropdown::-webkit-scrollbar {
    width: 4px;
  }

  .operation-dropdown::-webkit-scrollbar-track {
    background: transparent;
  }

  .operation-dropdown::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 2px;
  }

  .operation-option {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 10px 8px;
    background: transparent;
    border: none;
    border-radius: 8px;
    color: rgba(255, 255, 255, 0.8);
    cursor: pointer;
    font-size: 12px;
    text-align: left;
    transition: background 0.15s ease;
  }

  .operation-option:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .operation-option.active {
    background: rgba(96, 165, 250, 0.15);
    color: #93c5fd;
  }

  .operation-option:disabled {
    opacity: 0.5;
    cursor: wait;
  }

  .op-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }

  .operation-option :global(.op-icon) {
    flex-shrink: 0;
    opacity: 0.5;
  }

  .operation-option.active :global(.op-icon) {
    opacity: 1;
    color: #93c5fd;
  }

  .op-year {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.35);
    flex-shrink: 0;
  }

  .toolbox-content {
    flex: 1;
    overflow-y: auto;
    background: #0a0a0a;
  }

  .tool-button {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    height: 100px;
    padding: 14px 8px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.2s ease;
    color: rgba(255, 255, 255, 0.9);
    overflow: visible;
  }

  .tool-button:hover {
    background: rgba(255, 255, 255, 0.15);
    border-color: rgba(255, 255, 255, 0.3);
    color: #ffffff;
    transform: translateY(-2px);
  }

  .tool-button:active {
    transform: translateY(0);
  }

  .tool-button.tool-active {
    background: rgba(96, 165, 250, 0.2);
    border-color: rgba(96, 165, 250, 0.5);
    color: #93c5fd;
  }

  .tool-button.tool-active:hover {
    background: rgba(96, 165, 250, 0.3);
    border-color: rgba(96, 165, 250, 0.6);
  }

  .flash-tool.tool-active {
    background: rgba(251, 191, 36, 0.2);
    border-color: rgba(251, 191, 36, 0.5);
    color: #fcd34d;
  }

  .flash-tool.tool-active:hover {
    background: rgba(251, 191, 36, 0.3);
    border-color: rgba(251, 191, 36, 0.6);
  }

  .collection-tool.tool-active {
    background: rgba(168, 85, 247, 0.2);
    border-color: rgba(168, 85, 247, 0.5);
    color: #c084fc;
  }

  .collection-tool.tool-active:hover {
    background: rgba(168, 85, 247, 0.3);
    border-color: rgba(168, 85, 247, 0.6);
  }

  .flashing-icon {
    animation: flashPulse 1s ease-in-out infinite;
  }

  @keyframes flashPulse {
    0%,
    100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.6;
      transform: scale(1.1);
    }
  }

  .flash-panel-container {
    padding: 12px;
  }

  .tool-button span {
    font-size: 13px;
    font-weight: 600;
    text-align: center;
    line-height: 1.2;
    margin-top: 2px;
  }

  /* Badge on tool buttons */
  .tool-badge {
    position: absolute;
    top: 6px;
    right: 6px;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 9px;
    font-size: 10px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
    margin: 0;
  }

  .trail-badge {
    background: rgba(96, 165, 250, 0.2);
    color: #60a5fa;
    border: 1px solid rgba(96, 165, 250, 0.3);
  }

  .trail-badge-loading {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .trail-badge-loading :global(.spin) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  .marker-badge {
    background: rgba(167, 139, 250, 0.2);
    color: #a78bfa;
    border: 1px solid rgba(167, 139, 250, 0.3);
  }

  .field-badge {
    background: rgba(74, 222, 128, 0.2);
    color: #4ade80;
    border: 1px solid rgba(74, 222, 128, 0.3);
  }

  /* Separator between primary and secondary tools */
  .tool-grid-separator {
    grid-column: 1 / -1;
    height: 1px;
    background: rgba(255, 255, 255, 0.08);
    margin: 4px 0;
  }

  .vehicle-icon-container,
  .marker-icon-container {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    overflow: visible;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes slideInLeft {
    from {
      transform: translateX(-100%);
    }
    to {
      transform: translateX(0);
    }
  }

  .toolbox-content::-webkit-scrollbar {
    width: 4px;
  }

  .toolbox-content::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 2px;
  }

  .toolbox-content::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.25);
    border-radius: 2px;
  }

  /* Confirmation Modal */
  .confirm-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.7);
    z-index: 1100;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fadeIn 0.15s ease-out;
  }

  .confirm-modal {
    background: #1a1a1a;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 14px;
    width: 320px;
    max-width: 90vw;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.6);
    animation: slideUp 0.2s ease-out;
  }

  .confirm-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 16px 18px 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .confirm-header h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: #ffffff;
  }

  .confirm-body {
    padding: 14px 18px;
  }

  .confirm-body p {
    margin: 0 0 8px;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.7);
    line-height: 1.5;
  }

  .confirm-body p:last-child {
    margin-bottom: 0;
  }

  .confirm-body strong {
    color: rgba(255, 255, 255, 0.9);
  }

  .confirm-footer {
    display: flex;
    gap: 8px;
    padding: 12px 18px 16px;
    justify-content: flex-end;
  }

  .confirm-btn {
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    border: none;
    transition: all 0.15s ease;
  }

  .confirm-btn.cancel {
    background: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.8);
    border: 1px solid rgba(255, 255, 255, 0.15);
  }

  .confirm-btn.cancel:hover {
    background: rgba(255, 255, 255, 0.15);
  }

  .confirm-btn.proceed {
    background: rgba(251, 191, 36, 0.2);
    color: #fcd34d;
    border: 1px solid rgba(251, 191, 36, 0.4);
  }

  .confirm-btn.proceed:hover {
    background: rgba(251, 191, 36, 0.3);
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* ── Eye toggle + row styles ── */
  .operation-option-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .operation-option-row + .operation-option-row {
    margin-top: 4px;
  }

  .operation-option-row .operation-option {
    flex: 1;
    min-width: 0;
  }

  /* Active row has no eye toggle — add right margin to match the eye toggle width */
  .operation-option-row:not(:has(.eye-toggle)) {
    padding-right: 48px;
  }

  .eye-toggle {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.04);
    color: rgba(255, 255, 255, 0.3);
    cursor: pointer;
    transition: all 0.15s ease;
    flex-shrink: 0;
  }

  .eye-toggle:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.25);
    color: rgba(255, 255, 255, 0.7);
  }

  .eye-toggle.visible {
    color: #60a5fa;
    background: rgba(96, 165, 250, 0.12);
    border-color: rgba(96, 165, 250, 0.35);
  }

  .eye-toggle.visible:hover {
    background: rgba(96, 165, 250, 0.2);
    border-color: rgba(96, 165, 250, 0.5);
  }

  .active-indicator {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #60a5fa;
    flex-shrink: 0;
    box-shadow: 0 0 6px rgba(96, 165, 250, 0.5);
  }

  .inactive-indicator {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.15);
    flex-shrink: 0;
  }

  /* ── Badges row in dropdown ── */
  .op-badges {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .op-trail-count {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    font-size: 10px;
    color: rgba(96, 165, 250, 0.8);
    background: rgba(96, 165, 250, 0.1);
    padding: 2px 6px;
    border-radius: 8px;
    flex-shrink: 0;
    font-weight: 600;
  }

  .op-vehicle-count {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    font-size: 10px;
    color: rgba(52, 211, 153, 0.9);
    background: rgba(52, 211, 153, 0.1);
    padding: 2px 6px;
    border-radius: 8px;
    flex-shrink: 0;
    font-weight: 600;
  }

  /* ── Operation header: Floating badge ── */
  .op-toggle-floating {
    position: relative;
    padding: 4px 10px 4px 10px;
    gap: 5px;
    border-radius: 8px;
    font-size: 12px;
    margin-top: 6px;
  }

  .op-float-badge {
    position: absolute;
    top: -7px;
    left: 8px;
    font-size: 8px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: #60a5fa;
    background: #0d0d0d;
    padding: 0 4px;
    line-height: 1.2;
  }

  .op-toggle-floating.open .op-float-badge {
    color: #93c5fd;
  }
</style>
