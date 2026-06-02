<!-- src/lib/components/map/toolbox/FieldControls.svelte -->
<script>
  // @ts-nocheck
  import { createEventDispatcher, onMount, onDestroy } from "svelte"
  import { mapFieldsStore } from "$lib/stores/mapFieldsStore"
  import { farmsStore } from "$lib/stores/farmsStore"
  import { FARM_NAME_MAX_LENGTH, farmApi } from "$lib/api/farmApi"
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
    Search,
    Check,
    X,
    ArrowRightLeft,
    Trash2,
    EllipsisVertical,
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
  let openSettingsFarmId = null // farmId whose 3-dot settings menu is open
  let settingsMenuStyle = "" // inline style for fixed-position dropdown
  let fieldSearch = ""
  let controlsEl // root element ref for click-outside detection

  // Move fields modal state
  let showMoveFieldsModal = false
  let moveSourceFarmId = null
  let moveSourceFarmName = ""
  let selectedMoveFieldIds = new Set()
  let moveTargetFarmId = ""
  let moveNewFarmName = ""
  let movingFields = false
  let creatingFarm = false

  function createGeoJSON(boundary) {
    return { type: "Feature", geometry: boundary, properties: {} }
  }

  // Close reassign menu and settings menu when clicking outside
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
    if (
      openSettingsFarmId &&
      controlsEl &&
      !controlsEl.querySelector(".farm-settings-menu")?.contains(e.target)
    ) {
      if (!e.target.closest(".icon-btn.settings")) {
        openSettingsFarmId = null
        settingsMenuStyle = ""
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
    const entries = farms
      .map((farm) => ({
        farmId: farm.id,
        farmName: farm.name,
        fields: fieldsByFarmId.get(farm.id) || [],
      }))
      .sort((a, b) => {
        // Sort by field count descending
        if (a.fields.length !== b.fields.length) {
          return b.fields.length - a.fields.length
        }
        // Then alphabetically
        return a.farmName.localeCompare(b.farmName)
      })

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
  $: searchTerm = fieldSearch.trim().toLowerCase()
  $: isSearching = searchTerm.length > 0
  $: visibleFarmEntries = isSearching
    ? farmEntries
        .map((entry) => ({
          ...entry,
          totalFieldCount: entry.fields.length,
          fields: entry.fields.filter((field) =>
            (field.name || "").toLowerCase().includes(searchTerm),
          ),
        }))
        .filter((entry) => entry.fields.length > 0)
    : farmEntries.map((entry) => ({
        ...entry,
        totalFieldCount: entry.fields.length,
      }))
  $: visibleFieldCount = visibleFarmEntries.reduce(
    (total, entry) => total + entry.fields.length,
    0,
  )

  function toggleFarm(farmId) {
    if (isSearching) return
    const key = farmId || "__unassigned"
    collapsedFarms = { ...collapsedFarms, [key]: !collapsedFarms[key] }
  }

  function clearFieldSearch() {
    fieldSearch = ""
    reassignFieldId = null
    openSettingsFarmId = null
    settingsMenuStyle = ""
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
    openSettingsFarmId = null
    settingsMenuStyle = ""
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

  function toggleFarmSettings(farmId, e) {
    if (openSettingsFarmId === farmId) {
      openSettingsFarmId = null
      settingsMenuStyle = ""
      return
    }
    openSettingsFarmId = farmId
    const btn = e.currentTarget
    const rect = btn.getBoundingClientRect()
    settingsMenuStyle = `top: ${rect.bottom + 4}px; right: ${window.innerWidth - rect.right}px;`
  }

  async function handleDeleteFarm(farmId, farmName) {
    if (!farmId) return
    openSettingsFarmId = null
    settingsMenuStyle = ""
    const result = await farmApi.deleteFarm(farmId)
    if (result.success) {
      farmsStore.update((farms) => farms.filter((f) => f.id !== farmId))
      toast.success(`Farm "${farmName}" deleted`)
    } else {
      toast.error(result.message || "Failed to delete farm")
    }
  }

  function handleDeleteFarmAttempt(farmId, farmName, fieldCount) {
    if (fieldCount > 0) {
      openSettingsFarmId = null
      settingsMenuStyle = ""
      toast.error(`"${farmName}" with fields cannot be deleted`)
      return
    }
    handleDeleteFarm(farmId, farmName)
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
    openSettingsFarmId = null
    settingsMenuStyle = ""
    toast.info("Field selection mode", { duration: 1200 })
    dispatch("addField", {
      farmId: entry.farmId,
      farmName: entry.farmName,
    })
  }

  function handleEditField(field) {
    reassignFieldId = null
    dispatch("editField", { field })
  }

  // ─── Move Fields Modal ───────────────────────────

  function openMoveFieldsModal(farmId, farmName) {
    openSettingsFarmId = null
    settingsMenuStyle = ""
    moveSourceFarmId = farmId
    moveSourceFarmName = farmName
    // Pre-select all fields under this farm
    const farmFields = ($mapFieldsStore || []).filter(
      (f) => (f.farm_id || null) === farmId,
    )
    selectedMoveFieldIds = new Set(farmFields.map((f) => f.field_id))
    moveTargetFarmId = ""
    moveNewFarmName = ""
    showMoveFieldsModal = true
  }

  function closeMoveFieldsModal() {
    showMoveFieldsModal = false
    selectedMoveFieldIds = new Set()
    moveSourceFarmId = null
    moveSourceFarmName = ""
    moveTargetFarmId = ""
    moveNewFarmName = ""
  }

  function toggleMoveField(fieldId) {
    if (selectedMoveFieldIds.has(fieldId)) {
      selectedMoveFieldIds.delete(fieldId)
    } else {
      selectedMoveFieldIds.add(fieldId)
    }
    selectedMoveFieldIds = selectedMoveFieldIds
  }

  function toggleAllMoveFields() {
    const farmFields = ($mapFieldsStore || []).filter(
      (f) => (f.farm_id || null) === moveSourceFarmId,
    )
    const allSelected = farmFields.every((f) =>
      selectedMoveFieldIds.has(f.field_id),
    )
    if (allSelected) {
      farmFields.forEach((f) => selectedMoveFieldIds.delete(f.field_id))
    } else {
      farmFields.forEach((f) => selectedMoveFieldIds.add(f.field_id))
    }
    selectedMoveFieldIds = selectedMoveFieldIds
  }

  $: moveSourceFields = ($mapFieldsStore || []).filter(
    (f) => (f.farm_id || null) === moveSourceFarmId,
  )

  $: resolvedMoveTarget =
    moveTargetFarmId === "__new__"
      ? moveNewFarmName.trim()
      : (($farmsStore || []).find((f) => f.id === moveTargetFarmId)?.name || "")

  $: canMoveFields =
    selectedMoveFieldIds.size > 0 && resolvedMoveTarget.length > 0

  $: moveTargetFarms = ($farmsStore || []).filter(
    (f) => (f.id || null) !== moveSourceFarmId,
  )

  async function handleCreateFarm() {
    const name = moveNewFarmName.trim()
    if (!name || creatingFarm) return
    creatingFarm = true
    const mapId = $connectedMapStore?.id
    if (!mapId) {
      toast.error("No map connected")
      creatingFarm = false
      return
    }
    const result = await farmApi.createFarm(mapId, name)
    if (result.success && result.farm) {
      farmsStore.update((farms) => [...farms, result.farm])
      moveTargetFarmId = result.farm.id
      moveNewFarmName = ""
      toast.success(`Farm "${name}" created`)
    } else {
      toast.error(result.message || "Failed to create farm")
    }
    creatingFarm = false
  }

  async function handleMoveFields() {
    if (!canMoveFields) return
    movingFields = true

    try {
      const farm = ($farmsStore || []).find((f) => f.id === moveTargetFarmId)
      const targetFarmId = farm?.id || null

      if (!targetFarmId) {
        toast.error("Could not resolve target farm")
        movingFields = false
        return
      }

      let successCount = 0
      let errorCount = 0

      const promises = Array.from(selectedMoveFieldIds).map(
        async (fieldId) => {
          try {
            const result = await fileApi.updateField(fieldId, {
              farm_id: targetFarmId,
            })
            if (result.success) successCount++
            else errorCount++
          } catch {
            errorCount++
          }
        },
      )

      await Promise.all(promises)

      // Update local store
      mapFieldsStore.update((all) =>
        all.map((f) =>
          selectedMoveFieldIds.has(f.field_id)
            ? { ...f, farm_id: targetFarmId }
            : f,
        ),
      )

      const targetName =
        ($farmsStore || []).find((f) => f.id === targetFarmId)?.name ||
          "Unassigned"

      if (errorCount === 0) {
        toast.success(`Moved ${successCount} fields to "${targetName}"`)
      } else {
        toast.success(`${successCount} moved, ${errorCount} failed`)
      }

      closeMoveFieldsModal()
    } catch {
      toast.error("An error occurred while moving fields")
    } finally {
      movingFields = false
    }
  }
</script>

<div class="field-controls" bind:this={controlsEl}>
  <div class="field-search-row">
    <Search size={16} />
    <input
      class="field-search-input"
      bind:value={fieldSearch}
      placeholder="Search fields"
      aria-label="Search fields"
      autocomplete="off"
    />
    {#if isSearching}
      <button
        class="field-search-clear"
        on:click={clearFieldSearch}
        title="Clear search"
        aria-label="Clear field search"
      >
        <X size={16} />
      </button>
    {/if}
  </div>

  {#if totalFarms === 0 && totalFields === 0}
    <div class="empty-state">
      <LandPlot size={32} strokeWidth={1.5} />
      <p>No farms or fields yet</p>
    </div>
  {:else}
    <div class="field-list">
      {#if isSearching && visibleFieldCount === 0}
        <div class="empty-state compact">
          <Search size={28} strokeWidth={1.5} />
          <p>No matching fields</p>
        </div>
      {/if}

      {#each visibleFarmEntries as entry}
        {@const farmKey = entry.farmId || "__unassigned"}
        {@const farmCollapsed = isSearching ? false : collapsedFarms[farmKey]}
        <div class="farm-section">
          <div class="farm-header-row">
            <button
              class="farm-header"
              class:searching={isSearching}
              on:click={() => toggleFarm(entry.farmId)}
            >
              <span class="farm-chevron">
                {#if farmCollapsed}
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
                  maxlength={FARM_NAME_MAX_LENGTH}
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
              {:else}
                <span class="farm-name">{entry.farmName}</span>
                <span class="farm-count">
                  {#if isSearching}
                    {entry.fields.length}/{entry.totalFieldCount}
                  {:else}
                    {entry.fields.length}
                  {/if}
                </span>
                {#if entry.farmId && !isSearching}
                  <button
                    class="icon-btn settings"
                    title="Farm settings"
                    on:click|stopPropagation={(e) =>
                      toggleFarmSettings(entry.farmId, e)}
                  >
                    <EllipsisVertical size={16} />
                  </button>
                {/if}
              {/if}
            </button>
          </div>

          {#if !farmCollapsed}
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
                    <button
                      class="icon-btn field-edit"
                      title="Edit field"
                      on:click|stopPropagation={() => handleEditField(field)}
                    >
                      <Pencil size={16} />
                    </button>
                  </button>
                </div>
              {/each}
            {/if}

          {/if}
        </div>
      {/each}
    </div>
  {/if}

  <!-- Farm settings dropdown (rendered outside scrollable list as fixed overlay) -->
  {#if openSettingsFarmId}
    {@const entry = farmEntries.find(e => (e.farmId || "__unassigned") === openSettingsFarmId)}
    {#if entry}
      <div class="farm-settings-menu" style={settingsMenuStyle}>
        <button
          class="settings-option"
          on:click|stopPropagation={() => handleAddField(entry)}
        >
          <Plus size={15} />
          <span>Add field</span>
        </button>
        <button
          class="settings-option"
          on:click|stopPropagation={() =>
            startRename(entry.farmId, entry.farmName)}
        >
          <Pencil size={15} />
          <span>Rename farm</span>
        </button>
        {#if entry.fields.length > 0}
          <button
            class="settings-option"
            on:click|stopPropagation={() =>
              openMoveFieldsModal(entry.farmId, entry.farmName)}
          >
            <ArrowRightLeft size={15} />
            <span>Transfer fields</span>
          </button>
        {/if}
        <button
          class="settings-option"
          class:disabled={entry.fields.length > 0}
          on:click|stopPropagation={() =>
            handleDeleteFarmAttempt(entry.farmId, entry.farmName, entry.fields.length)}
        >
          <Trash2 size={15} />
          <span>Delete farm</span>
        </button>
      </div>
    {/if}
  {/if}

  <!-- Add farm button -->
  <div class="add-farm-section" class:searching={isSearching}>
    {#if addingFarm}
      <div class="add-farm-input-row">
        <!-- svelte-ignore a11y-autofocus -->
        <input
          class="add-farm-input"
          bind:value={newFarmName}
          placeholder="Farm name"
          maxlength={FARM_NAME_MAX_LENGTH}
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
      </div>
    {:else}
      <button class="add-farm-btn" on:click={() => (addingFarm = true)}>
        <Plus size={18} />
        <span>Add Farm</span>
      </button>
    {/if}
  </div>
</div>

<!-- Move Fields Modal -->
{#if showMoveFieldsModal}
  <div class="move-modal-overlay" role="presentation" on:click={closeMoveFieldsModal} on:keydown={(e) => e.key === 'Escape' && closeMoveFieldsModal()}>
    <div class="move-modal" role="dialog" aria-modal="true" aria-label="Move fields" on:click|stopPropagation on:keydown|stopPropagation>
      <!-- Header -->
      <div class="move-modal-header">
        <div class="move-header-left">
          <h3>Move Fields</h3>
          <p>From "{moveSourceFarmName}"</p>
        </div>
        <div class="move-header-icon">
          <ArrowRightLeft size={20} />
        </div>
        <div class="move-header-right">
          {#if resolvedMoveTarget}
            <span class="move-to-label">to</span>
            <span class="move-to-name">{resolvedMoveTarget}</span>
          {:else}
            <span class="move-to-placeholder">Select destination</span>
          {/if}
        </div>
      </div>

      <!-- Body -->
      <div class="move-modal-body">
        <!-- Field selection -->
        <div class="move-section">
          <div class="move-section-top">
            <span class="move-section-label">
              Select fields ({selectedMoveFieldIds.size} selected)
            </span>
            <button class="move-toggle-all" on:click={toggleAllMoveFields}>
              {moveSourceFields.every(f => selectedMoveFieldIds.has(f.field_id)) ? 'Deselect all' : 'Select all'}
            </button>
          </div>
          <div class="move-field-list">
            {#each moveSourceFields as field (field.field_id)}
              <label
                class="move-field-row"
                class:move-field-selected={selectedMoveFieldIds.has(field.field_id)}
              >
                <input
                  type="checkbox"
                  checked={selectedMoveFieldIds.has(field.field_id)}
                  on:change={() => toggleMoveField(field.field_id)}
                />
                {#if field.boundary}
                  <span class="move-field-icon">
                    <FieldIcon geojson={createGeoJSON(field.boundary)} size={22} />
                  </span>
                {/if}
                <span class="move-field-name">{field.name}</span>
                {#if field.area}
                  <span class="move-field-area">{Math.round(field.area * 10) / 10} ha</span>
                {/if}
              </label>
            {/each}
          </div>
        </div>

        <!-- Destination farm picker -->
        <div class="move-section">
          <span class="move-section-label">Destination farm</span>
          <div class="move-dest-list">
            {#each moveTargetFarms as farm (farm.id)}
              <button
                class="move-dest-btn"
                class:move-dest-selected={moveTargetFarmId === farm.id}
                on:click={() => {
                  moveTargetFarmId = farm.id
                  moveNewFarmName = ""
                }}
              >
                {#if moveTargetFarmId === farm.id}
                  <Check size={15} />
                {:else}
                  <LandPlot size={15} />
                {/if}
                <span>{farm.name}</span>
              </button>
            {/each}
            <!-- New farm button -->
            <button
              class="move-dest-btn"
              class:move-dest-selected={moveTargetFarmId === "__new__"}
              on:click={() => (moveTargetFarmId = "__new__")}
            >
              {#if moveTargetFarmId === "__new__"}
                <Check size={15} />
              {:else}
                <Plus size={15} />
              {/if}
              <span>New farm name</span>
            </button>
          </div>
          {#if moveTargetFarmId === "__new__"}
            <div class="move-new-farm-row">
              <input
                class="move-new-farm-input"
                bind:value={moveNewFarmName}
                placeholder="Enter new farm name"
                maxlength={FARM_NAME_MAX_LENGTH}
                on:keydown={(e) => e.key === 'Enter' && handleCreateFarm()}
              />
              <button
                class="move-new-farm-confirm"
                disabled={!moveNewFarmName.trim() || creatingFarm}
                on:click={handleCreateFarm}
              >
                {#if creatingFarm}
                  <span class="move-spinner" />
                {:else}
                  <Check size={16} />
                {/if}
              </button>
            </div>
          {/if}
        </div>
      </div>

      <!-- Footer -->
      <div class="move-modal-footer">
        <button
          class="move-btn cancel"
          on:click={closeMoveFieldsModal}
          disabled={movingFields}
        >
          Cancel
        </button>
        <button
          class="move-btn confirm"
          disabled={!canMoveFields || movingFields}
          on:click={handleMoveFields}
        >
          {#if movingFields}
            Moving...
          {:else}
            Move {selectedMoveFieldIds.size} field{selectedMoveFieldIds.size !== 1 ? 's' : ''}
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}

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

  .empty-state.compact {
    padding: 24px 16px;
  }

  .field-search-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    background: #0b0e13;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.48);
    flex-shrink: 0;
  }

  .field-search-input {
    min-width: 0;
    flex: 1;
    min-height: 36px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.07);
    color: white;
    padding: 0 10px;
    font-size: 14px;
    outline: none;
  }

  .field-search-input:focus {
    border-color: rgba(160, 200, 232, 0.55);
    box-shadow: 0 0 0 3px rgba(160, 200, 232, 0.12);
  }

  .field-search-input::placeholder {
    color: rgba(255, 255, 255, 0.38);
  }

  .field-search-clear {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border: none;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.7);
    cursor: pointer;
    flex-shrink: 0;
  }

  .field-search-clear:hover {
    background: rgba(255, 255, 255, 0.14);
    color: white;
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
    gap: 4px;
    padding: 10px 4px 10px 14px;
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

  .farm-header.searching {
    cursor: default;
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

  .farm-header .icon-btn {
    min-width: 28px;
    min-height: 28px;
    padding: 4px;
  }

  /* 3-dot settings button */
  .icon-btn.settings {
    color: rgba(255, 255, 255, 0.45);
    position: relative;
    min-width: 34px;
    min-height: 34px;
    padding: 6px;
    margin-left: 4px;
  }

  .farm-header:hover .icon-btn.settings {
    color: rgba(255, 255, 255, 0.75);
  }

  .icon-btn.settings:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.12);
  }

  /* Farm settings dropdown menu */
  .farm-settings-menu {
    position: fixed;
    background: rgba(24, 28, 36, 0.98);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 10px;
    padding: 4px;
    min-width: 180px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
    z-index: 100;
    overflow: hidden;
    animation: settingsSlideIn 0.15s ease-out;
  }

  @keyframes settingsSlideIn {
    from {
      opacity: 0;
      transform: translateY(-6px) scale(0.96);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .settings-option {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    text-align: left;
    padding: 10px 12px;
    border: none;
    background: transparent;
    color: rgba(255, 255, 255, 0.85);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    border-radius: 6px;
    transition: background 0.12s ease, color 0.12s ease;
  }

  .settings-option:hover {
    background: rgba(255, 255, 255, 0.08);
    color: #fff;
  }

  .settings-option:last-child {
    color: rgba(255, 100, 100, 0.8);
  }

  .settings-option:last-child:hover {
    background: rgba(255, 80, 80, 0.12);
    color: #ff5050;
  }

  .settings-option.disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .settings-option.disabled:hover {
    background: transparent;
    color: rgba(255, 100, 100, 0.8);
  }

  .icon-btn.field-edit {
    color: rgba(255, 255, 255, 0.42);
    padding: 8px;
  }

  .field-row:hover .icon-btn.field-edit {
    color: rgba(255, 255, 255, 0.6);
  }

  .icon-btn.field-edit:hover {
    color: #a0c8e8;
    background: rgba(160, 200, 232, 0.12);
  }

  .icon-btn.confirm {
    color: #34d399;
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

  .add-farm-section.searching {
    display: none;
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

  /* ─── Move Fields Modal ─────────────────────────── */

  .move-modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2000;
    padding: 16px;
    animation: moveFadeIn 0.2s ease-out;
  }

  @keyframes moveFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .move-modal {
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    width: min(420px, 94vw);
    max-height: min(600px, 85vh);
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    animation: moveSlideIn 0.25s cubic-bezier(0.68, -0.55, 0.265, 1.55);
    overflow: hidden;
  }

  @keyframes moveSlideIn {
    from {
      transform: translateY(-20px) scale(0.95);
      opacity: 0;
    }
    to {
      transform: translateY(0) scale(1);
      opacity: 1;
    }
  }

  /* Header — clean split layout: from → icon → to */
  .move-modal-header {
    padding: 16px 18px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .move-header-left {
    flex: 1;
    min-width: 0;
  }

  .move-header-left h3 {
    margin: 0;
    color: #fff;
    font-size: 15px;
    font-weight: 700;
  }

  .move-header-left p {
    margin: 2px 0 0;
    color: rgba(255, 255, 255, 0.5);
    font-size: 11px;
    font-weight: 500;
  }

  .move-header-icon {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: rgba(160, 200, 232, 0.12);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #a0c8e8;
    flex-shrink: 0;
  }

  .move-header-right {
    flex: 1;
    min-width: 0;
    text-align: right;
  }

  .move-to-label {
    display: block;
    font-size: 10px;
    color: rgba(255, 255, 255, 0.4);
    text-transform: uppercase;
    letter-spacing: 0.4px;
    margin-bottom: 1px;
  }

  .move-to-name {
    color: #a0c8e8;
    font-size: 13px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: block;
  }

  .move-to-placeholder {
    color: rgba(255, 255, 255, 0.3);
    font-size: 11px;
    font-style: italic;
  }

  .move-modal-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 16px 18px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .move-modal-body::-webkit-scrollbar {
    width: 4px;
  }

  .move-modal-body::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 2px;
  }

  /* Sections */
  .move-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .move-section-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .move-section-label {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.6);
    font-weight: 500;
  }

  .move-toggle-all {
    background: none;
    border: none;
    color: #a0c8e8;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 4px;
    transition: color 0.15s, background 0.15s;
  }

  .move-toggle-all:hover {
    color: #fff;
    background: rgba(160, 200, 232, 0.12);
  }

  /* Field checkboxes list */
  .move-field-list {
    display: flex;
    flex-direction: column;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    overflow: hidden;
    max-height: 200px;
    overflow-y: auto;
  }

  .move-field-list::-webkit-scrollbar {
    width: 4px;
  }

  .move-field-list::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.15);
    border-radius: 2px;
  }

  .move-field-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    background: transparent;
    cursor: pointer;
    transition: background 0.12s;
    min-height: 42px;
  }

  .move-field-row:last-child {
    border-bottom: none;
  }

  .move-field-row:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  .move-field-row.move-field-selected {
    background: rgba(160, 200, 232, 0.08);
  }

  .move-field-row input[type="checkbox"] {
    width: 15px;
    height: 15px;
    accent-color: #a0c8e8;
    cursor: pointer;
    flex-shrink: 0;
  }

  .move-field-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    opacity: 0.8;
  }

  .move-field-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: rgba(255, 255, 255, 0.9);
    font-size: 13px;
    font-weight: 500;
  }

  .move-field-area {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.4);
    flex-shrink: 0;
    font-weight: 500;
  }

  /* Destination farm buttons */
  .move-dest-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .move-dest-btn {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    text-align: left;
    padding: 10px 12px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.04);
    color: rgba(255, 255, 255, 0.85);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }

  .move-dest-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.2);
  }

  .move-dest-btn.move-dest-selected {
    background: rgba(160, 200, 232, 0.12);
    border-color: rgba(160, 200, 232, 0.4);
    color: #a0c8e8;
  }

  .move-dest-btn.move-dest-selected:hover {
    background: rgba(160, 200, 232, 0.18);
    border-color: rgba(160, 200, 232, 0.55);
  }

  .move-new-farm-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .move-new-farm-input {
    flex: 1;
    min-width: 0;
    min-height: 40px;
    padding: 8px 12px;
    border: 1px solid rgba(160, 200, 232, 0.35);
    border-radius: 8px;
    background: rgba(0, 0, 0, 0.3);
    color: #fff;
    font-size: 13px;
    outline: none;
  }

  .move-new-farm-input:focus {
    border-color: rgba(160, 200, 232, 0.55);
    box-shadow: 0 0 0 3px rgba(160, 200, 232, 0.12);
  }

  .move-new-farm-input::placeholder {
    color: rgba(255, 255, 255, 0.35);
  }

  .move-new-farm-confirm {
    width: 40px;
    height: 40px;
    border-radius: 8px;
    border: 1px solid rgba(34, 197, 94, 0.4);
    background: rgba(34, 197, 94, 0.15);
    color: #22c55e;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: all 0.15s;
  }

  .move-new-farm-confirm:hover:not(:disabled) {
    background: rgba(34, 197, 94, 0.28);
    border-color: rgba(34, 197, 94, 0.6);
    transform: scale(1.05);
  }

  .move-new-farm-confirm:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .move-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(34, 197, 94, 0.2);
    border-top: 2px solid #22c55e;
    border-radius: 50%;
    animation: moveSpin 0.8s linear infinite;
  }

  @keyframes moveSpin {
    to { transform: rotate(360deg); }
  }

  /* Footer */
  .move-modal-footer {
    padding: 14px 18px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    gap: 10px;
    background: rgba(0, 0, 0, 0.3);
  }

  .move-btn {
    flex: 1;
    padding: 11px 12px;
    border-radius: 10px;
    font-weight: 600;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }

  .move-btn.cancel {
    background: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.8);
  }

  .move-btn.cancel:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.18);
    color: #fff;
  }

  .move-btn.confirm {
    background: linear-gradient(135deg, #2563eb, #1d4ed8);
    color: #fff;
  }

  .move-btn.confirm:hover:not(:disabled) {
    background: linear-gradient(135deg, #1d4ed8, #1e40af);
    transform: translateY(-1px);
  }

  .move-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  @media (max-width: 640px) {
    .move-modal {
      width: 95vw;
      max-height: 90vh;
    }
    .move-modal-body {
      padding: 14px;
    }
    .move-btn {
      font-size: 12px;
      padding: 10px 8px;
    }
  }
</style>
