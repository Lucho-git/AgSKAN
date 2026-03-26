<!-- src/lib/components/map/toolbox/FieldControls.svelte -->
<script>
  // @ts-nocheck
  import { createEventDispatcher, onMount, onDestroy } from "svelte"
  import { mapFieldsStore } from "$lib/stores/mapFieldsStore"
  import { farmsStore } from "$lib/stores/farmsStore"
  import { farmApi } from "$lib/api/farmApi"
  import { fileApi } from "$lib/api/fileApi"
  import { connectedMapStore } from "$lib/stores/connectedMapStore"
  import { toast } from "svelte-sonner"
  import FieldIcon from "$lib/components/map/overlays/FieldIcon.svelte"
  import {
    ChevronDown,
    ChevronRight,
    LandPlot,
    Plus,
    Pencil,
    Check,
    X,
    ArrowRightLeft,
  } from "lucide-svelte"

  const dispatch = createEventDispatcher()

  // Track collapsed state as a plain object for reactivity
  let collapsedFarms = {}
  let collapsedInitialized = false
  let highlightedIndex = null
  let addingFarm = false
  let newFarmName = ""
  let renamingFarmId = null
  let renameValue = ""
  let reassignFieldId = null // field_id of the field whose menu is open
  let controlsEl // root element ref for click-outside detection

  function createGeoJSON(boundary) {
    return { type: "Feature", geometry: boundary, properties: {} }
  }

  // Close reassign menu when clicking outside
  function handleWindowClick(e) {
    if (
      reassignFieldId &&
      controlsEl &&
      !controlsEl.querySelector(".reassign-menu")?.contains(e.target)
    ) {
      // Check if click was on a move button (toggle handled separately)
      if (!e.target.closest(".icon-btn.move")) {
        reassignFieldId = null
      }
    }
  }

  onMount(() => {
    window.addEventListener("click", handleWindowClick, true)
  })

  onDestroy(() => {
    window.removeEventListener("click", handleWindowClick, true)
  })

  // Build farm-grouped field list from farmsStore + mapFieldsStore
  $: farmEntries = (() => {
    const farms = $farmsStore || []
    const fields = $mapFieldsStore || []

    // Build a lookup: farm_id → farm
    const farmById = new Map(farms.map((f) => [f.id, f]))

    // Group fields by farm_id
    const fieldsByFarmId = new Map()
    const unassigned = []
    fields.forEach((field, index) => {
      const entry = { ...field, _index: index }
      if (field.farm_id && farmById.has(field.farm_id)) {
        if (!fieldsByFarmId.has(field.farm_id))
          fieldsByFarmId.set(field.farm_id, [])
        fieldsByFarmId.get(field.farm_id).push(entry)
      } else {
        unassigned.push(entry)
      }
    })

    // Build entries: each farm (with or without fields)
    const entries = farms.map((farm) => ({
      farmId: farm.id,
      farmName: farm.name,
      fields: fieldsByFarmId.get(farm.id) || [],
    }))

    // Append unassigned fields if any
    if (unassigned.length > 0) {
      entries.push({
        farmId: null,
        farmName: "Unassigned",
        fields: unassigned,
      })
    }

    // Initialize collapsed state: first farm expanded, rest collapsed
    if (!collapsedInitialized && entries.length > 0) {
      collapsedInitialized = true
      const newState = {}
      entries.forEach((entry, i) => {
        const key = entry.farmId || "__unassigned"
        newState[key] = i > 0 // first farm expanded (false), rest collapsed (true)
      })
      collapsedFarms = newState
    }

    return entries
  })()

  $: totalFields = ($mapFieldsStore || []).length
  $: totalFarms = ($farmsStore || []).length

  function toggleFarm(farmId) {
    const key = farmId || "__unassigned"
    collapsedFarms = { ...collapsedFarms, [key]: !collapsedFarms[key] }
  }

  function selectField(field) {
    reassignFieldId = null
    highlightedIndex = field._index
    dispatch("selectField", {
      index: field._index,
      boundary: field.boundary,
      name: field.name,
    })
  }

  function formatArea(area) {
    if (!area && area !== 0) return ""
    return `${Math.round(area * 10) / 10} ha`
  }

  async function handleAddFarm() {
    const name = newFarmName.trim()
    if (!name) return

    const mapId = $connectedMapStore?.id
    if (!mapId) {
      toast.error("No map connected")
      return
    }

    const result = await farmApi.createFarm(mapId, name)
    if (result.success && result.farm) {
      farmsStore.update((farms) => [...farms, result.farm])
      toast.success(`Farm "${name}" created`)
      newFarmName = ""
      addingFarm = false
    } else {
      toast.error(result.message || "Failed to create farm")
    }
  }

  function startRename(farmId, currentName) {
    renamingFarmId = farmId
    renameValue = currentName
  }

  async function confirmRename(farmId) {
    const name = renameValue.trim()
    if (!name || !farmId) {
      renamingFarmId = null
      return
    }

    const result = await farmApi.renameFarm(farmId, name)
    if (result.success) {
      farmsStore.update((farms) =>
        farms.map((f) => (f.id === farmId ? { ...f, name } : f)),
      )
      toast.success("Farm renamed")
    } else {
      toast.error(result.message || "Failed to rename")
    }
    renamingFarmId = null
  }

  function cancelRename() {
    renamingFarmId = null
  }

  function toggleReassignMenu(fieldId) {
    reassignFieldId = reassignFieldId === fieldId ? null : fieldId
  }

  async function reassignField(field, targetFarmId) {
    reassignFieldId = null
    if (field.farm_id === targetFarmId) return

    const result = await fileApi.updateField(field.field_id, {
      farm_id: targetFarmId || undefined,
    })
    if (result.success) {
      // Update the field in mapFieldsStore
      mapFieldsStore.update((fields) =>
        fields.map((f) =>
          f.field_id === field.field_id ? { ...f, farm_id: targetFarmId } : f,
        ),
      )
      const targetName =
        ($farmsStore || []).find((f) => f.id === targetFarmId)?.name ||
        "Unassigned"
      toast.success(`Moved "${field.name}" to ${targetName}`)
    } else {
      toast.error("Failed to move field")
    }
  }
</script>

<div class="field-controls" bind:this={controlsEl}>
  {#if totalFarms === 0 && totalFields === 0}
    <div class="empty-state">
      <LandPlot size={32} strokeWidth={1.5} />
      <p>No farms or fields yet</p>
    </div>
  {:else}
    <div class="field-list">
      {#each farmEntries as entry}
        {@const farmKey = entry.farmId || "__unassigned"}
        <div class="farm-section">
          <div class="farm-header-row">
            <button
              class="farm-header"
              on:click={() => toggleFarm(entry.farmId)}
            >
              <span class="farm-chevron">
                {#if collapsedFarms[farmKey]}
                  <ChevronRight size={14} />
                {:else}
                  <ChevronDown size={14} />
                {/if}
              </span>

              {#if renamingFarmId === entry.farmId}
                <!-- svelte-ignore a11y-autofocus -->
                <input
                  class="rename-input"
                  bind:value={renameValue}
                  autofocus
                  on:click|stopPropagation
                  on:keydown|stopPropagation={(e) => {
                    if (e.key === "Enter") confirmRename(entry.farmId)
                    if (e.key === "Escape") cancelRename()
                  }}
                />
                <button
                  class="icon-btn confirm"
                  on:click|stopPropagation={() => confirmRename(entry.farmId)}
                >
                  <Check size={12} />
                </button>
                <button
                  class="icon-btn cancel"
                  on:click|stopPropagation={cancelRename}
                >
                  <X size={12} />
                </button>
              {:else}
                <span class="farm-name">{entry.farmName}</span>
                <span class="farm-count">{entry.fields.length}</span>
                {#if entry.farmId}
                  <button
                    class="icon-btn edit"
                    on:click|stopPropagation={() =>
                      startRename(entry.farmId, entry.farmName)}
                  >
                    <Pencil size={11} />
                  </button>
                {/if}
              {/if}
            </button>
          </div>

          {#if !collapsedFarms[farmKey]}
            {#if entry.fields.length === 0}
              <div class="empty-farm">No fields</div>
            {:else}
              {#each entry.fields as field (field.field_id)}
                <div class="field-row-wrapper">
                  <button
                    class="field-row"
                    class:active={highlightedIndex === field._index}
                    on:click={() => selectField(field)}
                  >
                    {#if field.boundary}
                      <span class="field-icon-mini">
                        <FieldIcon
                          geojson={createGeoJSON(field.boundary)}
                          size={18}
                        />
                      </span>
                    {/if}
                    <span class="field-name">{field.name}</span>
                    {#if field.area}
                      <span class="field-area">{formatArea(field.area)}</span>
                    {/if}
                    {#if farmEntries.length > 1}
                      <button
                        class="icon-btn move"
                        title="Move to another farm"
                        on:click|stopPropagation={() =>
                          toggleReassignMenu(field.field_id)}
                      >
                        <ArrowRightLeft size={12} />
                      </button>
                    {/if}
                  </button>

                  {#if reassignFieldId === field.field_id}
                    <div class="reassign-menu">
                      {#each farmEntries as target}
                        {#if target.farmId !== entry.farmId}
                          <button
                            class="reassign-option"
                            on:click={() => reassignField(field, target.farmId)}
                          >
                            {target.farmName}
                          </button>
                        {/if}
                      {/each}
                    </div>
                  {/if}
                </div>
              {/each}
            {/if}
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  <!-- Add farm button -->
  <div class="add-farm-section">
    {#if addingFarm}
      <div class="add-farm-input-row">
        <!-- svelte-ignore a11y-autofocus -->
        <input
          class="add-farm-input"
          bind:value={newFarmName}
          placeholder="Farm name"
          autofocus
          on:keydown={(e) => {
            if (e.key === "Enter") handleAddFarm()
            if (e.key === "Escape") {
              addingFarm = false
              newFarmName = ""
            }
          }}
        />
        <button class="icon-btn confirm" on:click={handleAddFarm}>
          <Check size={14} />
        </button>
        <button
          class="icon-btn cancel"
          on:click={() => {
            addingFarm = false
            newFarmName = ""
          }}
        >
          <X size={14} />
        </button>
      </div>
    {:else}
      <button class="add-farm-btn" on:click={() => (addingFarm = true)}>
        <Plus size={14} />
        <span>Add Farm</span>
      </button>
    {/if}
  </div>
</div>

<style>
  .field-controls {
    padding: 8px 0;
    overflow-y: auto;
    max-height: calc(100vh - 120px);
    display: flex;
    flex-direction: column;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 32px 16px;
    color: rgba(255, 255, 255, 0.4);
  }

  .empty-state p {
    margin: 0;
    font-size: 13px;
  }

  .field-list {
    display: flex;
    flex-direction: column;
    flex: 1;
  }

  .farm-section {
    margin-bottom: 2px;
  }

  .farm-header-row {
    display: flex;
  }

  .farm-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    background: rgba(255, 255, 255, 0.05);
    border: none;
    color: #a0c8e8;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    cursor: pointer;
    width: 100%;
    text-align: left;
  }

  .farm-header:hover {
    background: rgba(255, 255, 255, 0.08);
  }

  .farm-chevron {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .farm-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .farm-count {
    background: rgba(255, 255, 255, 0.1);
    padding: 1px 6px;
    border-radius: 8px;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.5);
    flex-shrink: 0;
  }

  .empty-farm {
    padding: 6px 16px;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.3);
    font-style: italic;
  }

  .field-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 12px 7px 16px;
    border: none;
    background: transparent;
    color: rgba(255, 255, 255, 0.85);
    font-size: 13px;
    cursor: pointer;
    width: 100%;
    text-align: left;
    transition: background 0.15s;
  }

  .field-row:hover {
    background: rgba(255, 255, 255, 0.08);
  }

  .field-row.active {
    background: rgba(0, 128, 255, 0.2);
    border-left: 2px solid #0080ff;
    padding-left: 14px;
  }

  .field-row-wrapper {
    position: relative;
  }

  .field-icon-mini {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 18px;
    height: 18px;
    opacity: 0.7;
  }

  .field-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .field-area {
    font-size: 11px;
    color: rgba(192, 255, 192, 0.6);
    flex-shrink: 0;
  }

  .icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    padding: 2px;
    cursor: pointer;
    border-radius: 4px;
    flex-shrink: 0;
  }

  .icon-btn.edit {
    color: rgba(255, 255, 255, 0.3);
    opacity: 0;
    transition: opacity 0.15s;
  }

  .farm-header:hover .icon-btn.edit {
    opacity: 1;
  }

  .icon-btn.edit:hover {
    color: rgba(255, 255, 255, 0.7);
  }

  .icon-btn.move {
    color: rgba(255, 255, 255, 0.25);
    opacity: 0;
    transition: opacity 0.15s;
    padding: 3px;
  }

  .field-row:hover .icon-btn.move {
    opacity: 1;
  }

  .icon-btn.move:hover {
    color: #a0c8e8;
  }

  .reassign-menu {
    background: rgba(30, 35, 45, 0.97);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 6px;
    padding: 4px 0;
    margin: 0 12px 4px 24px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    overflow: hidden;
  }

  .reassign-option {
    display: block;
    width: 100%;
    text-align: left;
    padding: 6px 12px;
    border: none;
    background: none;
    color: rgba(255, 255, 255, 0.8);
    font-size: 12px;
    cursor: pointer;
    transition: background 0.1s;
  }

  .reassign-option:hover {
    background: rgba(160, 200, 232, 0.15);
    color: #a0c8e8;
  }

  .icon-btn.confirm {
    color: #34d399;
  }

  .icon-btn.cancel {
    color: #f87171;
  }

  .rename-input {
    flex: 1;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(160, 200, 232, 0.4);
    border-radius: 4px;
    color: white;
    font-size: 12px;
    padding: 2px 6px;
    outline: none;
    min-width: 0;
  }

  .add-farm-section {
    padding: 8px 12px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  .add-farm-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    background: none;
    border: 1px dashed rgba(255, 255, 255, 0.15);
    border-radius: 6px;
    color: rgba(255, 255, 255, 0.4);
    font-size: 12px;
    cursor: pointer;
    width: 100%;
    transition: all 0.15s;
  }

  .add-farm-btn:hover {
    border-color: rgba(160, 200, 232, 0.4);
    color: #a0c8e8;
  }

  .add-farm-input-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .add-farm-input {
    flex: 1;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(160, 200, 232, 0.4);
    border-radius: 4px;
    color: white;
    font-size: 12px;
    padding: 4px 8px;
    outline: none;
  }
</style>
