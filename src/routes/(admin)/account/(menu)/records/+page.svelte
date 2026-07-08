<!-- src/routes/(admin)/account/(menu)/records/+page.svelte -->
<script lang="ts">
  import { getContext } from "svelte"
  import type { Writable } from "svelte/store"
  import { supabase } from "$lib/supabaseClient"
  import { toast } from "svelte-sonner"
  import {
    Search,
    MapPin,
    Clock,
    Ruler,
    User,
    Tractor,
    CheckCircle2,
    ChevronDown,
    ChevronRight,
    Calendar,
    Filter,
    Loader2,
    FileText,
    Layers,
    X,
    Trash2,
  } from "lucide-svelte"
  import FieldTrailOverlay from "$lib/components/map/trails/FieldTrailOverlay.svelte"
  import SprayRecordThumbnail from "$lib/components/map/trails/SprayRecordThumbnail.svelte"
  import { clearThumbnailCache } from "$lib/utils/thumbnailRenderer"
  import { RefreshCw } from "lucide-svelte"
  import { userSettingsStore } from "$lib/stores/userSettingsStore"

  export let data

  let adminSection: Writable<string> = getContext("adminSection")
  adminSection.set("records")

  // Force fresh thumbnails on every page visit
  clearThumbnailCache()

  // State
  let records = data.records || []
  let fields = data.fields || []
  let operations = data.operations || []
  let loading = data.loading
  let pageError = data.error
  let masterMapId = data.masterMapId

  // Backfill state
  let backfilling = false
  let backfillDays = 10
  let backfillResult = null as any

  async function runBackfill() {
    backfilling = true
    backfillResult = null
    let generated = 0
    try {
      // 1. Get list of trail IDs that need backfill
      const { data: candidates, error: listErr } = await supabase.rpc(
        "get_backfill_candidates",
        {
          p_count: backfillDays,
          p_master_map_id: masterMapId,
        },
      )
      if (listErr) throw listErr
      if (!candidates || candidates.length === 0) {
        backfillResult = {
          message:
            "No trails to backfill — all recent trails already have records",
        }
        return
      }

      // 2. Process each trail one at a time to avoid timeouts
      for (const row of candidates) {
        const { data: res, error: trailErr } = await supabase.rpc(
          "backfill_one_trail",
          {
            p_trail_id: row.trail_id,
          },
        )
        if (trailErr) {
          console.warn(`Backfill failed for trail ${row.trail_id}:`, trailErr)
          continue
        }
        if (res?.success) generated++
      }

      backfillResult = {
        success: true,
        trails_checked: candidates.length,
        records_generated: generated,
      }
      toast.success(
        `Backfilled ${generated} records from ${candidates.length} trails`,
      )
      window.location.reload()
    } catch (e: any) {
      backfillResult = { error: e.message }
      toast.error(e.message || "Backfill failed")
    } finally {
      backfilling = false
    }
  }

  // Delete spray record
  async function deleteRecord(recordId: string) {
    if (!confirm("Delete this spray record? This cannot be undone.")) return
    try {
      const { error } = await supabase.rpc("delete_spray_record", {
        p_record_id: recordId,
      })
      if (error) throw error
      records = records.filter((r) => r.id !== recordId)
      toast.success("Record deleted")
    } catch (e: any) {
      toast.error(e.message || "Failed to delete record")
    }
  }

  // Filters
  let searchQuery = ""
  let selectedFieldId = ""
  let selectedOperationId = ""
  let sortBy = "start_time" // start_time | operator_name | operation_name
  let sortDir = "desc" // asc | desc

  // Pagination
  const PAGE_SIZE = 50
  let currentPage = 1

  // Track expanded records (for showing intervals)
  let expandedRecords = new Set()

  // Fullscreen snapshot state — now uses locked interactive map
  let fullscreenSnapshot = false
  let fullscreenRecord = null as any

  // Field trail overlay state
  let showFieldOverlay = false
  let overlayFieldBoundary = null
  let overlayFieldName = ""
  let overlayFieldArea = 0
  let overlayRecords: any[] = []

  function openFieldOverlay(fieldId: string) {
    const field = fields.find((f) => f.field_id === fieldId)
    if (!field?.boundary) return
    overlayFieldBoundary = field.boundary
    overlayFieldName = field.name
    overlayFieldArea = field.area || 0
    overlayRecords = filteredRecords.filter((r) => r.field_id === fieldId)
    showFieldOverlay = true
  }

  function openSnapshotFullscreen(record) {
    const b = record.field_boundary
    const firstRing =
      b?.type === "MultiPolygon" ? b.coordinates[0][0] : b?.coordinates?.[0]
    const fp = (firstRing as any)?.[0]
    console.log(
      `[RecordsPage] openSnapshotFullscreen record=${record.id?.slice(0, 8)} field=${record.field_name} type=${b?.type || "none"} firstCoord=[${fp?.[0] || "?"},${fp?.[1] || "?"}]`,
    )
    fullscreenRecord = record
    fullscreenSnapshot = true
  }

  // Filtered + sorted records
  $: filteredRecords = records
    .filter((r) => {
      // Field filter
      if (selectedFieldId && r.field_id !== selectedFieldId) return false
      // Operation filter
      if (selectedOperationId && r.operation_id !== selectedOperationId)
        return false
      // Search filter (field name, operator name, vehicle type, operation name)
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        const matches =
          r.field_name?.toLowerCase().includes(q) ||
          r.operator_name?.toLowerCase().includes(q) ||
          r.vehicle_type?.toLowerCase().includes(q) ||
          r.operation_name?.toLowerCase().includes(q)
        if (!matches) return false
      }
      return true
    })
    .sort((a, b) => {
      let cmp = 0
      if (sortBy === "start_time") {
        cmp =
          new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      } else if (sortBy === "operator_name") {
        cmp = (a.operator_name || "").localeCompare(b.operator_name || "")
      } else if (sortBy === "operation_name") {
        cmp = (a.operation_name || "").localeCompare(b.operation_name || "")
      }
      return sortDir === "asc" ? cmp : -cmp
    })

  // Reset to page 1 when filters/sort change
  $: (searchQuery,
    selectedFieldId,
    selectedOperationId,
    sortBy,
    sortDir,
    (currentPage = 1))

  // Paginated records for chronological view
  $: totalPages = Math.ceil(filteredRecords.length / PAGE_SIZE)
  $: paginatedRecords = filteredRecords.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  )

  // Group by field for the "field history" view
  $: recordsByField = (() => {
    const groups: Record<string, { field_name: string; records: any[] }> = {}
    for (const r of filteredRecords) {
      if (!groups[r.field_id]) {
        groups[r.field_id] = { field_name: r.field_name, records: [] }
      }
      groups[r.field_id].records.push(r)
    }
    return Object.entries(groups).sort((a, b) =>
      a[1].field_name.localeCompare(b[1].field_name),
    )
  })()

  // View mode: "list" (chronological) or "fields" (grouped by field)
  let viewMode = "fields"

  // Format helpers
  function formatDate(ts) {
    if (!ts) return ""
    return new Date(ts).toLocaleDateString([], {
      day: "numeric",
      month: "short",
      year: "numeric",
    })
  }
  function formatTime(ts) {
    if (!ts) return ""
    return new Date(ts).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    })
  }
  function formatDuration(seconds) {
    if (!seconds) return "0s"
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    if (h > 0) return `${h}h ${m}m`
    if (m > 0) return `${m}m ${s}s`
    return `${s}s`
  }
  function formatHa(ha) {
    if (!ha) return "0 ha"
    return `${parseFloat(ha).toFixed(2)} ha`
  }
  function formatKm(km) {
    if (!km) return "0 km"
    return `${parseFloat(km).toFixed(2)} km`
  }
  function formatVehicleType(type) {
    if (!type) return "Unknown"
    return type.replace(/([A-Z])/g, " $1").trim()
  }

  function toggleExpand(id) {
    if (expandedRecords.has(id)) {
      expandedRecords.delete(id)
    } else {
      expandedRecords.add(id)
    }
    expandedRecords = new Set(expandedRecords)
  }

  function hasMultipleIntervals(record) {
    return (record.intervals?.length || 0) > 1
  }

  function toggleSort(field) {
    if (sortBy === field) {
      sortDir = sortDir === "asc" ? "desc" : "asc"
    } else {
      sortBy = field
      sortDir = "desc"
    }
  }

  // Stats
  $: totalArea = filteredRecords.reduce(
    (sum, r) => sum + parseFloat(r.area_hectares || 0),
    0,
  )
  $: totalDistance = filteredRecords.reduce(
    (sum, r) => sum + parseFloat(r.distance_km || 0),
    0,
  )
  $: confirmedCount = filteredRecords.filter((r) => r.operator_confirmed).length
</script>

<div class="records-page">
  {#if loading}
    <div class="loading-state">
      <Loader2 size={32} class="animate-spin text-blue-400" />
      <p>Loading records...</p>
    </div>
  {:else if pageError}
    <div class="error-state">
      <p>Error: {pageError}</p>
    </div>
  {:else}
    <!-- Header -->
    <div class="page-header">
      <div class="header-left">
        <FileText size={24} class="text-blue-400" />
        <div>
          <h1>Spray Records</h1>
          <p class="header-subtitle">
            {filteredRecords.length} record{filteredRecords.length !== 1
              ? "s"
              : ""}
            · {formatHa(totalArea)} total · {formatKm(totalDistance)} traveled
          </p>
        </div>
      </div>
      <div class="header-right">
        {#if $userSettingsStore?.devToolsEnabled}
          <div class="backfill-section">
            <input
              type="number"
              class="backfill-days"
              bind:value={backfillDays}
              min="1"
              max="500"
              title="Number of recent trails to backfill"
            />
            <button
              class="backfill-btn"
              on:click={runBackfill}
              disabled={backfilling}
              title="Generate spray records from recent closed trails"
            >
              {#if backfilling}
                <Loader2 size={14} class="animate-spin" />
              {:else}
                <RefreshCw size={14} />
              {/if}
              <span>Backfill</span>
            </button>
          </div>
        {/if}
        <div class="confirm-badge">
          <CheckCircle2 size={14} class="text-green-400" />
          <span>{confirmedCount}/{filteredRecords.length} confirmed</span>
        </div>
      </div>
    </div>

    <!-- View Toggle — prominent segmented control -->
    <div class="view-toggle-container">
      <button
        class="view-toggle-btn"
        class:active={viewMode === "fields"}
        on:click={() => (viewMode = "fields")}
      >
        <span>By Field</span>
      </button>
      <button
        class="view-toggle-btn"
        class:active={viewMode === "list"}
        on:click={() => (viewMode = "list")}
      >
        <span>Chronological</span>
      </button>
    </div>

    <!-- Filters Bar -->
    <div class="filters-bar">
      <div class="search-box">
        <Search size={16} class="text-white/40" />
        <input
          type="text"
          placeholder="Search fields, operators, vehicles..."
          bind:value={searchQuery}
        />
      </div>

      <select bind:value={selectedOperationId} class="field-select">
        <option value="">All Operations</option>
        {#each operations as op}
          <option value={op.id}>{op.name}</option>
        {/each}
      </select>

      {#if viewMode === "fields"}
        <select bind:value={selectedFieldId} class="field-select">
          <option value="">All Fields</option>
          {#each fields as field}
            <option value={field.field_id}>{field.name}</option>
          {/each}
        </select>
      {/if}
    </div>

    <!-- Sort Bar (list view only) -->
    {#if viewMode === "list"}
      <div class="sort-bar">
        <button
          class="sort-btn"
          on:click={() => toggleSort("start_time")}
          class:active={sortBy === "start_time"}
        >
          <Calendar size={12} />
          Date
          {#if sortBy === "start_time"}{sortDir === "asc" ? "↑" : "↓"}{/if}
        </button>
        <button
          class="sort-btn"
          on:click={() => toggleSort("operator_name")}
          class:active={sortBy === "operator_name"}
        >
          <User size={12} />
          Operator
          {#if sortBy === "operator_name"}{sortDir === "asc" ? "↑" : "↓"}{/if}
        </button>
        <button
          class="sort-btn"
          on:click={() => toggleSort("operation_name")}
          class:active={sortBy === "operation_name"}
        >
          <Layers size={12} />
          Operation
          {#if sortBy === "operation_name"}{sortDir === "asc" ? "↑" : "↓"}{/if}
        </button>
      </div>
    {/if}

    <!-- Records List -->
    {#if filteredRecords.length === 0}
      <div class="empty-state">
        <FileText size={48} class="text-white/20" />
        <p>No spray records found</p>
        <p class="empty-subtitle">
          {searchQuery || selectedFieldId
            ? "Try adjusting your filters"
            : "Records are created automatically when you close a trail"}
        </p>
      </div>
    {:else if viewMode === "list"}
      <!-- Chronological List -->
      <div class="records-list">
        {#each paginatedRecords as record (record.id)}
          <div
            class="record-card"
            class:expandable={hasMultipleIntervals(record)}
            class:confirmed={record.operator_confirmed}
          >
            <div
              class="record-card-header"
              class:clickable={hasMultipleIntervals(record)}
              on:click={() =>
                hasMultipleIntervals(record) && toggleExpand(record.id)}
            >
              <!-- Row 1: Thumbnail + Field name + Date + Stats -->
              <div class="card-top-row">
                <div
                  class="thumbnail-wrapper"
                  on:click={() => openSnapshotFullscreen(record)}
                  on:keydown={(e) =>
                    e.key === "Enter" && openSnapshotFullscreen(record)}
                  role="button"
                  tabindex="0"
                  title="Click to view fullscreen"
                >
                  <SprayRecordThumbnail
                    fieldBoundary={record.field_boundary}
                    {record}
                    width={120}
                    height={90}
                  />
                </div>

                <div class="card-info">
                  <div class="card-field-name">
                    <MapPin size={14} class="text-green-400" />
                    <span>{record.field_name}</span>
                    {#if hasMultipleIntervals(record)}
                      <span class="visit-badge"
                        >{record.intervals.length} visits</span
                      >
                    {/if}
                  </div>
                  <div class="card-date-row">
                    <span class="date-day">{formatDate(record.start_time)}</span
                    >
                    <span class="date-time"
                      >{formatTime(record.start_time)}</span
                    >
                  </div>
                  <div class="card-stats">
                    <span class="stat-area stat"
                      >{formatHa(record.area_hectares)}</span
                    >
                    <span class="stat">{formatKm(record.distance_km)}</span>
                  </div>
                </div>

                {#if hasMultipleIntervals(record)}
                  <span class="expand-icon">
                    {#if expandedRecords.has(record.id)}
                      <ChevronDown size={16} />
                    {:else}
                      <ChevronRight size={16} />
                    {/if}
                  </span>
                {/if}
              </div>

              <!-- Row 2: Meta details (operator, vehicle, operation) -->
              <div class="card-meta-row">
                <div class="meta-row">
                  <User size={11} class="text-white/30" />
                  <span>{record.operator_name || "Unknown"}</span>
                </div>
                <div class="meta-row">
                  <Tractor size={11} class="text-white/30" />
                  <span>{formatVehicleType(record.vehicle_type)}</span>
                </div>
                <div class="meta-row">
                  <Layers size={11} class="text-white/30" />
                  <span>{record.operation_name || "Unknown"}</span>
                </div>
                {#if record.operator_confirmed}
                  <CheckCircle2
                    size={14}
                    class="card-confirmed text-green-400"
                  />
                {/if}
                <button
                  class="delete-record-btn"
                  on:click|stopPropagation={() => deleteRecord(record.id)}
                  title="Delete record"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>

            <!-- Expandable intervals -->
            {#if hasMultipleIntervals(record) && expandedRecords.has(record.id)}
              <div class="intervals-section">
                {#each record.intervals as interval, j}
                  <div class="interval-row">
                    <span class="interval-label">Visit {j + 1}</span>
                    <span class="interval-time">
                      {formatTime(interval.entry_time)} – {formatTime(
                        interval.exit_time,
                      )}
                    </span>
                    <span class="interval-duration"
                      >{formatDuration(interval.duration_seconds)}</span
                    >
                    <span class="interval-distance"
                      >{formatKm(interval.distance_km)}</span
                    >
                  </div>
                  {#if j < record.intervals.length - 1}
                    <div class="interval-gap">
                      <span>Exit → Re-entry</span>
                    </div>
                  {/if}
                {/each}
              </div>
            {/if}
          </div>
        {/each}
      </div>

      <!-- Pagination -->
      {#if totalPages > 1}
        <div class="pagination">
          <button
            class="page-btn"
            disabled={currentPage === 1}
            on:click={() => currentPage--}
          >
            ← Prev
          </button>
          <span class="page-info">
            Page {currentPage} of {totalPages}
            <span class="page-range"
              >({(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(
                currentPage * PAGE_SIZE,
                filteredRecords.length,
              )} of {filteredRecords.length})</span
            >
          </span>
          <button
            class="page-btn"
            disabled={currentPage === totalPages}
            on:click={() => currentPage++}
          >
            Next →
          </button>
        </div>
      {/if}
    {:else}
      <!-- Grouped by Field -->
      <div class="fields-grouped">
        {#each recordsByField as [fieldId, group]}
          <div class="field-group">
            <div
              class="field-group-header"
              on:click={() => toggleExpand(`field-${fieldId}`)}
            >
              <div
                class="field-thumb-wrapper"
                on:click|stopPropagation={() => openFieldOverlay(fieldId)}
                on:keydown={(e) =>
                  e.key === "Enter" && openFieldOverlay(fieldId)}
                role="button"
                tabindex="0"
                title="View on map"
              >
                <SprayRecordThumbnail
                  fieldBoundary={fields.find((f) => f.field_id === fieldId)
                    ?.boundary}
                  record={{ id: `field-thumb-${fieldId}` }}
                  width={80}
                  height={60}
                />
              </div>
              <div class="field-group-info">
                <div class="field-group-name-row">
                  <MapPin size={16} class="text-green-400" />
                  <span class="field-group-name">{group.field_name}</span>
                </div>
                <span class="field-group-count"
                  ><span class="visit-badge"
                    >{group.records.length} record{group.records.length !== 1
                      ? "s"
                      : ""}</span
                  ></span
                >
              </div>
              <button
                class="view-map-btn"
                on:click|stopPropagation={() => openFieldOverlay(fieldId)}
                title="View on map"
              >
                <MapPin size={12} />
                Map
              </button>
              <span class="expand-icon">
                {#if expandedRecords.has(`field-${fieldId}`)}
                  <ChevronDown size={16} />
                {:else}
                  <ChevronRight size={16} />
                {/if}
              </span>
            </div>

            {#if expandedRecords.has(`field-${fieldId}`)}
              <div class="field-group-records">
                {#each group.records as record}
                  <div class="record-row">
                    <span class="record-row-date"
                      >{formatDate(record.start_time)}
                      {formatTime(record.start_time)}</span
                    >
                    <span class="record-row-operator"
                      >{record.operator_name || "Unknown"}</span
                    >
                    <span class="record-row-vehicle"
                      >{formatVehicleType(record.vehicle_type)}</span
                    >
                    <span class="record-row-operation"
                      >{record.operation_name || "Unknown"}</span
                    >
                    <span class="record-row-area"
                      >{formatHa(record.area_hectares)}</span
                    >
                    <span class="record-row-distance"
                      >{formatKm(record.distance_km)}</span
                    >
                    {#if record.operator_confirmed}
                      <CheckCircle2 size={14} class="text-green-400" />
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>

{#if fullscreenSnapshot && fullscreenRecord}
  <FieldTrailOverlay
    fieldBoundary={fullscreenRecord.field_boundary}
    records={[fullscreenRecord]}
    fieldName={fullscreenRecord.field_name}
    fieldAreaHa={fullscreenRecord.field_area || 0}
    lockedMode={true}
    on:close={() => {
      fullscreenSnapshot = false
      fullscreenRecord = null
    }}
  />
{/if}

{#if showFieldOverlay}
  <FieldTrailOverlay
    fieldBoundary={overlayFieldBoundary}
    records={overlayRecords}
    fieldName={overlayFieldName}
    fieldAreaHa={overlayFieldArea || 0}
    on:close={() => (showFieldOverlay = false)}
  />
{/if}

<style>
  .records-page {
    padding: 24px;
    max-width: 1000px;
    margin: 0 auto;
    color: rgba(255, 255, 255, 0.9);
  }

  /* Header */
  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .header-left h1 {
    font-size: 22px;
    font-weight: 600;
    margin: 0;
  }

  .header-subtitle {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.5);
    margin: 2px 0 0 0;
  }

  .confirm-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: rgba(34, 197, 94, 0.1);
    border: 1px solid rgba(34, 197, 94, 0.2);
    border-radius: 8px;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.7);
  }

  .backfill-section {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-right: 12px;
  }
  .backfill-days {
    width: 42px;
    padding: 5px 6px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    color: white;
    font-size: 12px;
    text-align: center;
    outline: none;
  }
  .backfill-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 6px 12px;
    background: rgba(59, 130, 246, 0.15);
    border: 1px solid rgba(59, 130, 246, 0.25);
    border-radius: 8px;
    color: #60a5fa;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
  }
  .backfill-btn:hover:not(:disabled) {
    background: rgba(59, 130, 246, 0.25);
  }
  .backfill-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Prominent view toggle — segmented control */
  .view-toggle-container {
    display: flex;
    gap: 0;
    margin-bottom: 16px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 4px;
  }

  .view-toggle-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 10px 16px;
    background: none;
    border: none;
    border-radius: 8px;
    color: rgba(255, 255, 255, 0.5);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .view-toggle-btn.active {
    background: rgba(59, 130, 246, 0.2);
    color: #60a5fa;
  }

  .view-toggle-btn:hover:not(.active) {
    color: rgba(255, 255, 255, 0.7);
  }

  /* Filters */
  .filters-bar {
    display: flex;
    gap: 12px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }

  .search-box {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 200px;
    padding: 8px 12px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
  }

  .search-box input {
    background: none;
    border: none;
    outline: none;
    color: white;
    font-size: 14px;
    width: 100%;
  }

  .search-box input::placeholder {
    color: rgba(255, 255, 255, 0.3);
  }

  .field-select {
    padding: 8px 12px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    color: white;
    font-size: 14px;
    outline: none;
    cursor: pointer;
  }

  .field-select option {
    background: #1a1a1a;
  }

  /* Sort bar */
  .sort-bar {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }

  .sort-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 12px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    color: rgba(255, 255, 255, 0.5);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .sort-btn.active {
    background: rgba(59, 130, 246, 0.15);
    border-color: rgba(59, 130, 246, 0.3);
    color: #60a5fa;
  }

  /* Records list */
  .records-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .record-card {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    overflow: hidden;
    transition: border-color 0.2s;
  }

  .record-card.expandable {
    border-color: rgba(59, 130, 246, 0.15);
  }

  .record-card.confirmed {
    border-left: 3px solid rgba(34, 197, 94, 0.4);
  }

  .record-card-header {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px 16px;
  }

  .card-top-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .thumbnail-wrapper {
    flex-shrink: 0;
  }

  .card-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .card-field-name {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .card-date-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .card-stats {
    display: flex;
    gap: 12px;
  }

  .card-meta-row {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
  }

  .card-confirmed {
    margin-left: auto;
  }

  .delete-record-btn {
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.2);
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
    border-radius: 4px;
    transition: all 0.15s;
    flex-shrink: 0;
  }
  .delete-record-btn:hover {
    color: #ef4444;
    background: rgba(239, 68, 68, 0.1);
  }

  /* Snapshot thumbnails handled by SprayRecordThumbnail component */

  .record-card-header.clickable {
    cursor: pointer;
  }

  .date-day {
    font-size: 13px;
    font-weight: 500;
  }

  .date-time {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.4);
  }

  .visit-badge {
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 6px;
    background: rgba(59, 130, 246, 0.2);
    color: #60a5fa;
    font-weight: 500;
    flex-shrink: 0;
  }

  .expand-icon {
    display: flex;
    align-items: center;
    color: rgba(255, 255, 255, 0.4);
    flex-shrink: 0;
  }

  .stat {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.5);
  }

  .stat-area {
    color: #4ade80;
    font-weight: 600;
  }

  .meta-row {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.4);
  }

  /* Intervals (expandable) */
  .intervals-section {
    padding: 8px 16px 12px 96px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }

  .interval-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 4px 0;
    font-size: 12px;
  }

  .interval-label {
    color: #60a5fa;
    font-weight: 500;
    min-width: 60px;
  }

  .interval-time {
    color: rgba(255, 255, 255, 0.6);
  }

  .interval-duration {
    color: rgba(255, 255, 255, 0.4);
    margin-left: auto;
  }

  .interval-distance {
    color: rgba(255, 255, 255, 0.4);
    min-width: 60px;
    text-align: right;
  }

  .interval-gap {
    padding: 2px 0 2px 60px;
    font-size: 10px;
    color: rgba(251, 191, 36, 0.5);
    font-style: italic;
  }

  /* Field grouped view */
  .fields-grouped {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .field-group {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    overflow: hidden;
  }

  .field-group-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    cursor: pointer;
  }

  .field-group-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }

  .field-group-name-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .field-group-name {
    font-size: 15px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .field-group-count {
    padding-left: 4px;
  }

  .field-thumb-wrapper {
    flex-shrink: 0;
    cursor: pointer;
  }

  .view-map-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    background: rgba(59, 130, 246, 0.15);
    border: 1px solid rgba(59, 130, 246, 0.2);
    border-radius: 6px;
    color: #60a5fa;
    font-size: 11px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .view-map-btn:hover {
    background: rgba(59, 130, 246, 0.25);
  }

  .field-group-records {
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    padding: 4px 0;
  }

  .record-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 16px 8px 40px;
    font-size: 13px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.03);
  }

  .record-row:last-child {
    border-bottom: none;
  }

  .record-row-date {
    min-width: 140px;
    color: rgba(255, 255, 255, 0.7);
  }

  .record-row-operator {
    min-width: 100px;
    color: rgba(255, 255, 255, 0.5);
  }

  .record-row-vehicle {
    min-width: 100px;
    color: rgba(255, 255, 255, 0.4);
    font-size: 12px;
  }

  .record-row-operation {
    flex: 1;
    color: rgba(255, 255, 255, 0.4);
    font-size: 12px;
  }

  .record-row-area {
    color: #4ade80;
    font-weight: 500;
    min-width: 60px;
    text-align: right;
  }

  .record-row-distance {
    color: rgba(255, 255, 255, 0.4);
    min-width: 60px;
    text-align: right;
  }

  /* Pagination */
  .pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    margin-top: 20px;
    padding: 12px;
  }

  .page-btn {
    padding: 8px 16px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    color: white;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .page-btn:hover:not(:disabled) {
    background: rgba(59, 130, 246, 0.15);
    border-color: rgba(59, 130, 246, 0.3);
  }

  .page-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .page-info {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.6);
    text-align: center;
  }

  .page-range {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.4);
    display: block;
    margin-top: 2px;
  }

  /* States */
  .loading-state,
  .error-state,
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 20px;
    text-align: center;
    color: rgba(255, 255, 255, 0.5);
  }

  .empty-state p {
    margin: 12px 0 4px 0;
    font-size: 16px;
  }

  .empty-subtitle {
    font-size: 13px !important;
    color: rgba(255, 255, 255, 0.3) !important;
  }

  /* Mobile responsive */
  @media (max-width: 640px) {
    .records-page {
      padding: 16px 12px;
    }

    .page-header {
      flex-direction: row;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .header-left {
      gap: 8px;
      flex: 1;
    }

    .header-left h1 {
      font-size: 18px;
    }

    .header-subtitle {
      font-size: 12px;
    }

    .view-toggle-btn {
      padding: 8px 12px;
      font-size: 13px;
    }

    .filters-bar {
      flex-direction: column;
      gap: 8px;
    }

    .search-box {
      min-width: 0;
    }

    .field-select {
      width: 100%;
    }

    .sort-bar {
      gap: 6px;
    }

    .sort-btn {
      padding: 5px 10px;
      font-size: 11px;
    }

    .record-card {
      border-radius: 10px;
    }

    .record-card-header {
      padding: 10px 12px;
      gap: 8px;
    }

    .card-top-row {
      gap: 10px;
    }

    .card-meta-row {
      gap: 12px;
      padding-left: 2px;
    }

    .intervals-section {
      padding: 8px 12px 10px 12px;
    }
  }
</style>
