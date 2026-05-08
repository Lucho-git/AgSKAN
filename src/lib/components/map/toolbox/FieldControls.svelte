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
    Trash2,
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

  async function handleDeleteFarm(farmId, farmName) {
    if (!farmId) return
    const result = await farmApi.deleteFarm(farmId)
    if (result.success) {
      farmsStore.update((farms) => farms.filter((f) => f.id !== farmId))
      toast.success(`Farm "${farmName}" deleted`)
    } else {
      toast.error(result.message || "Failed to delete farm")
    }
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

  function handleAddField(entry) {
    reassignFieldId = null
    dispatch("addField", {
      farmId: entry.farmId,
      farmName: entry.farmName,
    })
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
                  <ChevronRight size={18} />
                {:else}
                  <ChevronDown size={18} />
                {/if}
              </span>

              {#if renamingFarmId === entry.farmId}
                <!-- svelte-ignore a11y-autofocus -->
                <input
                  class="rename-input"
                  bind:value={renameValue}
                  maxlength="20"
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
                  <Check size={16} />
                </button>
                <button
                  class="icon-btn cancel"
                  on:click|stopPropagation={cancelRename}
                >
                  <X size={16} />
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
                    <Pencil size={16} />
                  </button>
                  {#if entry.fields.length === 0}
                    <button
                      class="icon-btn delete"
                      title="Delete empty farm"
                      on:click|stopPropagation={() =>
                        handleDeleteFarm(entry.farmId, entry.farmName)}
                    >
                      <Trash2 size={16} />
                    </button>
                  {/if}
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
                          size={24}
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
                        <ArrowRightLeft size={16} />
                      </button>
                    {/if}
                  </button>

                  {#if reassignFieldId === field.field_id}
                    <div class="reassign-menu">
                      <div class="reassign-header">Move "{field.name}" to:</div>
                      {#each farmEntries as target}
                        {#if target.farmId !== entry.farmId}
                          <button
                            class="reassign-option"
                            on:click={() => reassignField(field, target.farmId)}
                          >
                            <ArrowRightLeft size={14} />
                            {target.farmName.length > 20
                              ? target.farmName.slice(0, 20) + "…"
                              : target.farmName}
                          </button>
                        {/if}
                      {/each}
                    </div>
                  {/if}
                </div>
              {/each}
            {/if}

            {#if entry.farmId}
              <button
                class="add-field-btn"
                on:click={() => handleAddField(entry)}
              >
                <Plus size={16} />
                <span>Add New Field</span>
              </button>
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
          maxlength="20"
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
          <Check size={18} />
        </button>
        <button
          class="icon-btn cancel"
          on:click={() => {
            addingFarm = false
            newFarmName = ""
          }}
        >
          <X size={18} />
        </button>
      </div>
    {:else}
      <button class="add-farm-btn" on:click={() => (addingFarm = true)}>
        <Plus size={18} />
        <span>Add Farm</span>
      </button>
    {/if}
  </div>
</div>

<style>
  .field-controls {
    padding: 0;
    max-height: calc(100vh - 120px);
    display: flex;
    flex-direction: column;
    position: relative;
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
    font-size: 15px;
  }

  .field-list {
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow-y: auto;
    min-height: 0;
  }

  .farm-section {
    margin-bottom: 4px;
  }

  .farm-header-row {
    display: flex;
    position: sticky;
    top: 0;
    z-index: 10;
  }

  .farm-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    background: #0f1218;
    border: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    color: #a0c8e8;
    font-size: 13px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    cursor: pointer;
    width: 100%;
    text-align: left;
    min-height: 44px;
  }

  .farm-header:hover {
    background: #151a22;
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
    background: rgba(255, 255, 255, 0.12);
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.7);
    flex-shrink: 0;
  }

  .empty-farm {
    padding: 8px 20px;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.45);
    font-style: italic;
  }

  .field-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 14px 8px 20px;
    border: none;
    background: transparent;
    color: rgba(255, 255, 255, 0.95);
    font-size: 14px;
    cursor: pointer;
    width: 100%;
    text-align: left;
    transition: background 0.15s;
    min-height: 44px;
  }

  .field-row:hover {
    background: rgba(255, 255, 255, 0.08);
  }

  .field-row.active {
    background: rgba(0, 128, 255, 0.2);
    border-left: 3px solid #0080ff;
    padding-left: 17px;
  }

  .field-row-wrapper {
    position: relative;
  }

  .add-field-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    width: calc(100% - 28px);
    margin: 6px 14px 10px;
    min-height: 40px;
    padding: 8px 12px;
    border: 1px dashed rgba(34, 197, 94, 0.42);
    border-radius: 8px;
    background: rgba(34, 197, 94, 0.08);
    color: #86efac;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    transition:
      background 0.15s,
      border-color 0.15s,
      color 0.15s;
  }

  .add-field-btn:hover {
    background: rgba(34, 197, 94, 0.15);
    border-color: rgba(34, 197, 94, 0.7);
    color: #bbf7d0;
  }

  .field-icon-mini {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    opacity: 0.8;
  }

  .field-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .field-area {
    font-size: 13px;
    color: rgba(192, 255, 192, 0.8);
    flex-shrink: 0;
  }

  .icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    padding: 8px;
    cursor: pointer;
    border-radius: 6px;
    flex-shrink: 0;
    min-width: 36px;
    min-height: 36px;
  }

  .icon-btn.edit {
    color: rgba(255, 255, 255, 0.5);
  }

  .farm-header:hover .icon-btn.edit {
    color: rgba(255, 255, 255, 0.7);
  }

  .icon-btn.edit:hover {
    color: rgba(255, 255, 255, 0.9);
    background: rgba(255, 255, 255, 0.1);
  }

  .icon-btn.delete {
    color: rgba(255, 100, 100, 0.6);
  }

  .farm-header:hover .icon-btn.delete {
    color: rgba(255, 100, 100, 0.8);
  }

  .icon-btn.delete:hover {
    color: rgba(255, 80, 80, 1);
    background: rgba(255, 80, 80, 0.15);
  }

  .icon-btn.move {
    color: rgba(255, 255, 255, 0.4);
    padding: 8px;
  }

  .field-row:hover .icon-btn.move {
    color: rgba(255, 255, 255, 0.6);
  }

  .icon-btn.move:hover {
    color: #a0c8e8;
    background: rgba(160, 200, 232, 0.12);
  }

  .reassign-menu {
    background: rgba(30, 35, 45, 0.97);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 8px;
    padding: 4px 0;
    margin: 2px 14px 6px 28px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    overflow: hidden;
  }

  .reassign-header {
    padding: 8px 16px 6px;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.45);
    font-weight: 500;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    margin-bottom: 2px;
  }

  .reassign-option {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    text-align: left;
    padding: 10px 16px;
    border: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    background: none;
    color: rgba(255, 255, 255, 0.9);
    font-size: 14px;
    cursor: pointer;
    transition: background 0.1s;
    min-height: 44px;
  }

  .reassign-option:last-child {
    border-bottom: none;
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
    border-radius: 6px;
    color: white;
    font-size: 15px;
    padding: 6px 10px;
    outline: none;
    min-width: 0;
    min-height: 36px;
  }

  .add-farm-section {
    padding: 12px 14px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    overflow: hidden;
    flex-shrink: 0;
  }

  .add-farm-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    background: none;
    border: 1px dashed rgba(255, 255, 255, 0.2);
    border-radius: 8px;
    color: rgba(255, 255, 255, 0.6);
    font-size: 14px;
    cursor: pointer;
    width: 100%;
    min-height: 44px;
    transition: all 0.15s;
  }

  .add-farm-btn:hover {
    border-color: rgba(160, 200, 232, 0.4);
    color: #a0c8e8;
  }

  .add-farm-input-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .add-farm-input {
    flex: 1;
    min-width: 0;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(160, 200, 232, 0.4);
    border-radius: 6px;
    color: white;
    font-size: 14px;
    padding: 6px 10px;
    outline: none;
    min-height: 36px;
  }
</style>
