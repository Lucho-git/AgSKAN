<!-- src/lib/components/map/toolbox/MyMarkers.svelte -->
<script>
  // @ts-nocheck
  import { createEventDispatcher, onMount, onDestroy } from "svelte"
  import { confirmedMarkersStore } from "$lib/stores/markerStore"
  import { markerApi } from "$lib/api/markerApi"
  import { selectedMarkerStore } from "$lib/stores/markerStore"
  import { controlStore } from "$lib/stores/controlStore"
  import { profileStore } from "$lib/stores/profileStore"
  import { supabase } from "$lib/supabaseClient"
  import {
    findMarkerByIconClass,
    getAllMarkers,
  } from "$lib/data/markerDefinitions"
  import { toast } from "svelte-sonner"
  import IconSVG from "$lib/components/general/IconSVG.svelte"
  import {
    ChevronDown,
    ChevronRight,
    MapPin,
    Trash2,
    StickyNote,
    Navigation,
    Search,
    Filter,
  } from "lucide-svelte"

  const dispatch = createEventDispatcher()

  // Track collapsed state per marker type group
  let collapsedGroups = {}
  let collapsedInitialized = false
  let searchQuery = ""
  let controlsEl
  let activeTab = "recent" // 'recent' or 'groups'
  let filterHasNotesOrDrawing = false
  let markerIdsWithDrawings = new Set()

  // Lazy load state for Recent tab
  const PAGE_SIZE = 20
  let recentLimit = PAGE_SIZE
  let markerListEl // bind to the .marker-list div for scroll detection

  // Load marker IDs that have drawings (lightweight query)
  onMount(async () => {
    try {
      const masterMapId = $profileStore?.master_map_id
      if (!masterMapId) return
      const { data, error } = await supabase
        .from("marker_drawings")
        .select("marker_id")
        .eq("master_map_id", masterMapId)
        .or("deleted.is.null,deleted.eq.false")
      if (!error && data) {
        markerIdsWithDrawings = new Set(data.map((d) => d.marker_id))
      }
    } catch (e) {
      console.warn("Could not load marker drawing IDs:", e)
    }
  })

  // Reset lazy load limit when store or filter changes
  $: if ($confirmedMarkersStore || filterHasNotesOrDrawing) {
    recentLimit = PAGE_SIZE
  }

  // All recent markers sorted newest first (full list, for lazy slicing)
  $: allRecentSorted = (() => {
    const markers = $confirmedMarkersStore || []
    let filtered = [...markers]
    if (filterHasNotesOrDrawing) {
      filtered = filtered.filter(
        (m) => (m.notes && m.notes.trim()) || markerIdsWithDrawings.has(m.id),
      )
    }
    return filtered
      .sort(
        (a, b) =>
          new Date(b.created_at || 0).getTime() -
          new Date(a.created_at || 0).getTime(),
      )
      .map((m) => ({
        ...m,
        def: findMarkerByIconClass(m.iconClass),
      }))
  })()

  // Visible slice for Recent tab (lazy loaded)
  $: recentMarkers = allRecentSorted.slice(0, recentLimit)
  $: hasMoreRecent = recentLimit < allRecentSorted.length

  function handleRecentScroll(e) {
    const el = e.target
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 60) {
      if (hasMoreRecent) {
        recentLimit += PAGE_SIZE
      }
    }
  }

  // Group markers by icon type (like farms group fields)
  $: groupedMarkers = (() => {
    const markers = $confirmedMarkersStore || []
    const groups = new Map()

    let filteredMarkers = markers
    if (filterHasNotesOrDrawing) {
      filteredMarkers = markers.filter(
        (m) => (m.notes && m.notes.trim()) || markerIdsWithDrawings.has(m.id),
      )
    }

    filteredMarkers.forEach((marker) => {
      const def = findMarkerByIconClass(marker.iconClass)
      const groupKey = marker.iconClass || "default"
      const groupName = def?.name || "Unknown"

      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          key: groupKey,
          name: groupName,
          iconClass: marker.iconClass,
          markerDef: def,
          markers: [],
        })
      }
      groups.get(groupKey).markers.push(marker)
    })

    // Sort markers within each group by date (newest first)
    groups.forEach((group) => {
      group.markers.sort(
        (a, b) =>
          new Date(b.created_at || 0).getTime() -
          new Date(a.created_at || 0).getTime(),
      )
    })

    // Sort groups by number of markers descending
    let entries = Array.from(groups.values()).sort(
      (a, b) => b.markers.length - a.markers.length,
    )

    // Apply search filter
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      entries = entries
        .map((group) => ({
          ...group,
          markers: group.markers.filter(
            (m) =>
              group.name.toLowerCase().includes(q) ||
              (m.notes && m.notes.toLowerCase().includes(q)),
          ),
        }))
        .filter((group) => group.markers.length > 0)
    }

    // Initialize collapsed state: ALL groups collapsed by default
    if (!collapsedInitialized && entries.length > 0) {
      collapsedInitialized = true
      const newState = {}
      entries.forEach((entry) => {
        newState[entry.key] = true
      })
      collapsedGroups = newState
    }

    return entries
  })()

  $: totalMarkers = ($confirmedMarkersStore || []).length
  $: totalGroups = groupedMarkers.length

  function toggleGroup(key) {
    collapsedGroups = { ...collapsedGroups, [key]: !collapsedGroups[key] }
  }

  function selectMarker(marker) {
    // Set selected marker store so the map highlights it
    selectedMarkerStore.set({
      id: marker.id,
      coordinates: marker.coordinates,
    })
    // Tell the map to fly to this marker (but don't close the menu)
    dispatch("selectMarker", marker)
  }

  function formatDate(dateStr) {
    if (!dateStr) return ""
    const d = new Date(dateStr)
    const now = new Date()
    const diffMs = now - d
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)
    const diffWeeks = Math.floor(diffDays / 7)
    const diffMonths = Math.floor(diffDays / 30)

    if (diffMins < 1) return "Just now"
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    if (diffWeeks < 4) return `${diffWeeks}w ago`
    if (diffMonths < 3) return `${diffMonths}mo ago`
    return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
  }

  function truncateNotes(notes, maxLen = 30) {
    if (!notes) return null
    return notes.length > maxLen ? notes.slice(0, maxLen) + "\u2026" : notes
  }

  async function handleDeleteMarker(marker) {
    const def = findMarkerByIconClass(marker.iconClass)
    const name = def?.name || "Marker"

    const result = await markerApi.deleteMarker(marker.id)
    if (result.success) {
      confirmedMarkersStore.update((ms) =>
        ms.filter((m) => m.id !== marker.id),
      )
      toast.success(`${name} deleted`)
    } else {
      toast.error(result.message || "Failed to delete marker")
    }
  }

  function renderMarkerIcon(marker, size = "20px") {
    const def = findMarkerByIconClass(marker.iconClass)
    return def
  }
</script>

<div class="my-markers" bind:this={controlsEl}>
  {#if totalMarkers === 0}
    <div class="empty-state">
      <MapPin size={32} strokeWidth={1.5} />
      <p>No markers placed yet</p>
    </div>
  {:else}
    <!-- Search bar + filter -->
    <div class="search-section">
      <div class="search-row">
        <Search size={16} />
        <input
          class="search-input"
          bind:value={searchQuery}
          placeholder="Search markers or notes\u2026"
        />
        <label class="filter-toggle" title="Show only markers with notes or drawings">
          <input
            type="checkbox"
            bind:checked={filterHasNotesOrDrawing}
            class="filter-checkbox"
          />
          <StickyNote size={14} />
        </label>
      </div>
    </div>

    <!-- Tab bar -->
    <div class="tab-bar">
      <button
        class="tab-btn"
        class:active={activeTab === "recent"}
        on:click={() => (activeTab = "recent")}
      >
        Recent
      </button>
      <button
        class="tab-btn"
        class:active={activeTab === "groups"}
        on:click={() => (activeTab = "groups")}
      >
        By Type ({totalGroups})
      </button>
    </div>

    {#if activeTab === "recent"}
      <!-- Recent Markers -->
      <div class="marker-list" bind:this={markerListEl} on:scroll={handleRecentScroll}>
        {#if recentMarkers.length === 0}
          <div class="empty-state">
            <p>No recent markers</p>
          </div>
        {:else}
          {#each recentMarkers as marker (marker.id)}
            <div class="marker-row-wrapper">
              <button
                class="marker-row"
                class:selected={$selectedMarkerStore?.id === marker.id}
                on:click={() => selectMarker(marker)}
              >
                <span class="marker-icon-mini">
                  {#if marker.def}
                    {#if marker.def.id === "default"}
                      <IconSVG icon="mapbox-marker" size="22px" />
                    {:else if marker.def.class === "custom-svg"}
                      <IconSVG icon={marker.def.id} size="22px" />
                    {:else if marker.def.class?.startsWith("ionic-")}
                      <ion-icon
                        name={marker.def.id}
                        style="font-size: 22px;"
                      ></ion-icon>
                    {:else if marker.def.class?.startsWith("at-")}
                      <i
                        class={`${marker.def.class}`}
                        style="font-size: 22px;"
                      ></i>
                    {:else}
                      <MapPin size={22} />
                    {/if}
                  {:else}
                    <MapPin size={22} />
                  {/if}
                </span>

                <span class="marker-info">
                  {#if marker.notes}
                    <span class="marker-note"
                      >{truncateNotes(marker.notes)}</span
                    >
                  {:else}
                    <span class="marker-label">{marker.def?.name || "Marker"}</span>
                  {/if}
                  <span class="marker-time"
                    >{formatDate(marker.created_at)}</span
                  >
                </span>

                {#if marker.notes || markerIdsWithDrawings.has(marker.id)}
                  <span class="has-notes-badge" title={marker.notes ? "Has notes" : "Has drawing"}>
                    <StickyNote size={12} />
                  </span>
                {/if}

                <button
                  class="icon-btn delete"
                  title="Delete marker"
                  on:click|stopPropagation={() => handleDeleteMarker(marker)}
                >
                  <Trash2 size={16} />
                </button>
              </button>
            </div>
          {/each}
          {#if hasMoreRecent}
            <div class="load-more-hint">
              <span>Scroll for more…</span>
            </div>
          {/if}
        {/if}
      </div>
    {:else}
      <!-- Grouped by Type -->
      <!-- Summary -->
      <div class="summary-bar">
        <span class="summary-text"
          >{totalMarkers} marker{totalMarkers !== 1 ? "s" : ""} in {totalGroups} group{totalGroups !==
          1
            ? "s"
            : ""}</span
        >
      </div>

      <div class="marker-list">
        {#each groupedMarkers as group}
          <div class="group-section">
            <div class="group-header-row">
              <button
                class="group-header"
                on:click={() => toggleGroup(group.key)}
              >
              <span class="group-chevron">
                {#if collapsedGroups[group.key]}
                  <ChevronRight size={18} />
                {:else}
                  <ChevronDown size={18} />
                {/if}
              </span>

              <span class="group-icon">
                {#if group.markerDef}
                  {#if group.markerDef.id === "default"}
                    <IconSVG icon="mapbox-marker" size="20px" />
                  {:else if group.markerDef.class === "custom-svg"}
                    <IconSVG icon={group.markerDef.id} size="20px" />
                  {:else if group.markerDef.class?.startsWith("ionic-")}
                    <ion-icon
                      name={group.markerDef.id}
                      style="font-size: 20px;"
                    ></ion-icon>
                  {:else if group.markerDef.class?.startsWith("at-")}
                    <i
                      class={`${group.markerDef.class}`}
                      style="font-size: 20px;"
                    ></i>
                  {:else}
                    <MapPin size={20} />
                  {/if}
                {:else}
                  <MapPin size={20} />
                {/if}
              </span>

              <span class="group-name">{group.name}</span>
              <span class="group-count">{group.markers.length}</span>
            </button>
          </div>

          {#if !collapsedGroups[group.key]}
            {#each group.markers as marker (marker.id)}
              <div class="marker-row-wrapper">
                <button
                  class="marker-row"
                  class:selected={$selectedMarkerStore?.id === marker.id}
                  on:click={() => selectMarker(marker)}
                >
                  <span class="marker-icon-mini">
                    {#if group.markerDef}
                      {#if group.markerDef.id === "default"}
                        <IconSVG icon="mapbox-marker" size="22px" />
                      {:else if group.markerDef.class === "custom-svg"}
                        <IconSVG icon={group.markerDef.id} size="22px" />
                      {:else if group.markerDef.class?.startsWith("ionic-")}
                        <ion-icon
                          name={group.markerDef.id}
                          style="font-size: 22px;"
                        ></ion-icon>
                      {:else if group.markerDef.class?.startsWith("at-")}
                        <i
                          class={`${group.markerDef.class}`}
                          style="font-size: 22px;"
                        ></i>
                      {:else}
                        <MapPin size={22} />
                      {/if}
                    {:else}
                      <MapPin size={22} />
                    {/if}
                  </span>

                  <span class="marker-info">
                    {#if marker.notes}
                      <span class="marker-note"
                        >{truncateNotes(marker.notes)}</span
                      >
                    {:else}
                      <span class="marker-label">{group.name}</span>
                    {/if}
                    <span class="marker-time"
                      >{formatDate(marker.created_at)}</span
                    >
                  </span>

                  {#if marker.notes || markerIdsWithDrawings.has(marker.id)}
                    <span class="has-notes-badge" title={marker.notes ? "Has notes" : "Has drawing"}>
                      <StickyNote size={12} />
                    </span>
                  {/if}

                  <button
                    class="icon-btn delete"
                    title="Delete marker"
                    on:click|stopPropagation={() => handleDeleteMarker(marker)}
                  >
                    <Trash2 size={16} />
                  </button>
                </button>
              </div>
            {/each}
          {/if}
        </div>
      {/each}
    </div>
    {/if}
  {/if}
</div>

<style>
  .my-markers {
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

  /* Search */
  .search-section {
    padding: 10px 14px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    flex-shrink: 0;
  }

  .search-row {
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 8px 12px;
    color: rgba(255, 255, 255, 0.4);
  }

  .search-input {
    flex: 1;
    min-width: 0;
    background: none;
    border: none;
    color: white;
    font-size: 14px;
    outline: none;
  }

  .search-input::placeholder {
    color: rgba(255, 255, 255, 0.35);
  }

  /* Filter checkbox (inline with search) */
  .filter-toggle {
    display: flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
    flex-shrink: 0;
    padding: 2px;
    border-radius: 4px;
    opacity: 0.4;
    transition: opacity 0.15s;
  }

  .filter-toggle:has(.filter-checkbox:checked) {
    opacity: 1;
  }

  .filter-toggle:hover {
    opacity: 0.7;
  }

  .filter-checkbox {
    width: 13px;
    height: 13px;
    accent-color: #a0c8e8;
    cursor: pointer;
    flex-shrink: 0;
    opacity: 0.5;
  }

  .filter-checkbox:checked {
    opacity: 1;
  }

  .filter-toggle :global(svg) {
    color: rgba(250, 204, 21, 0.45);
    flex-shrink: 0;
  }

  .filter-toggle:has(.filter-checkbox:checked) :global(svg) {
    color: rgba(250, 204, 21, 0.8);
  }

  /* Tab Bar */
  .tab-bar {
    display: flex;
    gap: 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    flex-shrink: 0;
  }

  .tab-btn {
    flex: 1;
    padding: 10px 12px;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: rgba(255, 255, 255, 0.45);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
    min-height: 42px;
  }

  .tab-btn.active {
    color: #a0c8e8;
    border-bottom-color: #a0c8e8;
  }

  .tab-btn:hover:not(.active) {
    color: rgba(255, 255, 255, 0.7);
    background: rgba(255, 255, 255, 0.03);
  }

  /* Summary Bar */
  .summary-bar {
    padding: 6px 14px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    flex-shrink: 0;
  }

  .summary-text {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.4);
  }

  /* Marker List */
  .marker-list {
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow-y: auto;
    min-height: 0;
  }

  .group-section {
    margin-bottom: 4px;
  }

  .group-header-row {
    display: flex;
    position: sticky;
    top: 0;
    z-index: 10;
  }

  .group-header {
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

  .group-header:hover {
    background: #151a22;
  }

  .group-chevron {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .group-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    opacity: 0.85;
  }

  .group-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .group-count {
    background: rgba(255, 255, 255, 0.12);
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.7);
    flex-shrink: 0;
  }

  /* Marker Rows */
  .marker-row-wrapper {
    position: relative;
  }

  .marker-row {
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

  .marker-row:hover {
    background: rgba(255, 255, 255, 0.08);
  }

  .marker-icon-mini {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    opacity: 0.8;
  }

  .marker-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    overflow: hidden;
  }

  .marker-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: rgba(255, 255, 255, 0.7);
  }

  .marker-note {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: rgba(255, 255, 255, 0.9);
    font-size: 13px;
  }

  .marker-time {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.35);
  }

  .has-notes-badge {
    display: flex;
    align-items: center;
    color: rgba(250, 204, 21, 0.6);
    flex-shrink: 0;
  }

  /* Icon buttons */
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

  .icon-btn.delete {
    color: rgba(255, 100, 100, 0.6);
  }

  .marker-row:hover .icon-btn.delete {
    color: rgba(255, 100, 100, 0.8);
  }

  .icon-btn.delete:hover {
    color: rgba(255, 80, 80, 1);
    background: rgba(255, 80, 80, 0.15);
  }

  /* Selected marker row */
  .marker-row.selected {
    background: rgba(96, 165, 250, 0.12);
    border-left: 3px solid #60a5fa;
    padding-left: 17px;
  }

  /* Load more hint */
  .load-more-hint {
    display: flex;
    justify-content: center;
    padding: 12px;
    color: rgba(255, 255, 255, 0.3);
    font-size: 12px;
  }
</style>
