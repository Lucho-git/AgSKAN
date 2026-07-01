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
  } from "lucide-svelte"
  import { getRecordSnapshotUrl } from "$lib/utils/fieldSnapshot"
  import FieldTrailOverlay from "$lib/components/map/trails/FieldTrailOverlay.svelte"

  export let data

  let adminSection: Writable<string> = getContext("adminSection")
  adminSection.set("records")

  // State
  let records = data.records || []
  let fields = data.fields || []
  let operations = data.operations || []
  let loading = data.loading
  let pageError = data.error

  // Filters
  let searchQuery = ""
  let selectedFieldId = ""
  let selectedOperationId = ""
  let sortBy = "start_time" // start_time | field_name | area_hectares | distance_km | operation_name
  let sortDir = "desc" // asc | desc

  // Track expanded records (for showing intervals)
  let expandedRecords = new Set()

  // Snapshot URL cache (per record ID)
  let snapshotCache: Record<string, string> = {}

  // Field trail overlay state
  let showFieldOverlay = false
  let overlayFieldBoundary = null
  let overlayFieldName = ""
  let overlayRecords: any[] = []

  function openFieldOverlay(fieldId: string) {
    const field = fields.find(f => f.field_id === fieldId)
    if (!field?.boundary) return
    overlayFieldBoundary = field.boundary
    overlayFieldName = field.name
    overlayRecords = filteredRecords.filter(r => r.field_id === fieldId)
    showFieldOverlay = true
  }

  // Build snapshot URL for a record (cached)
  function getSnapshot(record) {
    if (snapshotCache[record.id]) return snapshotCache[record.id]
    if (!record.field_boundary) return ""
    try {
      const url = getRecordSnapshotUrl(record.field_boundary, record, {
        width: 120,
        height: 90,
        trailColor: "#ef4444",
      })
      snapshotCache[record.id] = url
      return url
    } catch (e) {
      console.warn("Failed to build snapshot URL:", e)
      return ""
    }
  }

  // Filtered + sorted records
  $: filteredRecords = records
    .filter((r) => {
      // Field filter
      if (selectedFieldId && r.field_id !== selectedFieldId) return false
      // Operation filter
      if (selectedOperationId && r.operation_id !== selectedOperationId) return false
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
        cmp = new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      } else if (sortBy === "field_name") {
        cmp = (a.field_name || "").localeCompare(b.field_name || "")
      } else if (sortBy === "area_hectares") {
        cmp = parseFloat(a.area_hectares) - parseFloat(b.area_hectares)
      } else if (sortBy === "distance_km") {
        cmp = parseFloat(a.distance_km) - parseFloat(b.distance_km)
      } else if (sortBy === "operation_name") {
        cmp = (a.operation_name || "").localeCompare(b.operation_name || "")
      }
      return sortDir === "asc" ? cmp : -cmp
    })

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
      a[1].field_name.localeCompare(b[1].field_name)
    )
  })()

  // View mode: "list" (chronological) or "fields" (grouped by field)
  let viewMode = "list"

  // Format helpers
  function formatDate(ts) {
    if (!ts) return ""
    return new Date(ts).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })
  }
  function formatTime(ts) {
    if (!ts) return ""
    return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
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
  $: totalArea = filteredRecords.reduce((sum, r) => sum + parseFloat(r.area_hectares || 0), 0)
  $: totalDistance = filteredRecords.reduce((sum, r) => sum + parseFloat(r.distance_km || 0), 0)
  $: confirmedCount = filteredRecords.filter(r => r.operator_confirmed).length
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
            {filteredRecords.length} record{filteredRecords.length !== 1 ? "s" : ""}
            · {formatHa(totalArea)} total
            · {formatKm(totalDistance)} traveled
          </p>
        </div>
      </div>
      <div class="header-right">
        <div class="confirm-badge">
          <CheckCircle2 size={14} class="text-green-400" />
          <span>{confirmedCount}/{filteredRecords.length} confirmed</span>
        </div>
      </div>
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

      <select bind:value={selectedFieldId} class="field-select">
        <option value="">All Fields</option>
        {#each fields as field}
          <option value={field.field_id}>{field.name}</option>
        {/each}
      </select>

      <select bind:value={selectedOperationId} class="field-select">
        <option value="">All Operations</option>
        {#each operations as op}
          <option value={op.id}>{op.name}</option>
        {/each}
      </select>

      <div class="view-toggle">
        <button
          class:active={viewMode === "list"}
          on:click={() => (viewMode = "list")}
        >
          Chronological
        </button>
        <button
          class:active={viewMode === "fields"}
          on:click={() => (viewMode = "fields")}
        >
          By Field
        </button>
      </div>
    </div>

    <!-- Sort Bar (list view only) -->
    {#if viewMode === "list"}
      <div class="sort-bar">
        <button class="sort-btn" on:click={() => toggleSort("start_time")} class:active={sortBy === "start_time"}>
          <Calendar size={12} />
          Date
          {#if sortBy === "start_time"}{sortDir === "asc" ? "↑" : "↓"}{/if}
        </button>
        <button class="sort-btn" on:click={() => toggleSort("field_name")} class:active={sortBy === "field_name"}>
          <MapPin size={12} />
          Field
          {#if sortBy === "field_name"}{sortDir === "asc" ? "↑" : "↓"}{/if}
        </button>
        <button class="sort-btn" on:click={() => toggleSort("area_hectares")} class:active={sortBy === "area_hectares"}>
          <Ruler size={12} />
          Area
          {#if sortBy === "area_hectares"}{sortDir === "asc" ? "↑" : "↓"}{/if}
        </button>
        <button class="sort-btn" on:click={() => toggleSort("distance_km")} class:active={sortBy === "distance_km"}>
          <Ruler size={12} />
          Distance
          {#if sortBy === "distance_km"}{sortDir === "asc" ? "↑" : "↓"}{/if}
        </button>
        <button class="sort-btn" on:click={() => toggleSort("operation_name")} class:active={sortBy === "operation_name"}>
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
          {searchQuery || selectedFieldId ? "Try adjusting your filters" : "Records are created automatically when you close a trail"}
        </p>
      </div>
    {:else if viewMode === "list"}
      <!-- Chronological List -->
      <div class="records-list">
        {#each filteredRecords as record}
          <div
            class="record-card"
            class:expandable={hasMultipleIntervals(record)}
            class:confirmed={record.operator_confirmed}
          >
            <div
              class="record-card-header"
              class:clickable={hasMultipleIntervals(record)}
              on:click={() => hasMultipleIntervals(record) && toggleExpand(record.id)}
            >
              <!-- Snapshot thumbnail -->
              {#if getSnapshot(record)}
                <img
                  src={getSnapshot(record)}
                  alt="Field snapshot"
                  class="record-snapshot"
                  loading="lazy"
                />
              {:else}
                <div class="record-snapshot-placeholder">
                  <MapPin size={20} class="text-white/20" />
                </div>
              {/if}

              <div class="record-date">
                <span class="date-day">{formatDate(record.start_time)}</span>
                <span class="date-time">{formatTime(record.start_time)}</span>
              </div>
              <div class="record-field">
                <MapPin size={14} class="text-green-400" />
                <span>{record.field_name}</span>
                {#if hasMultipleIntervals(record)}
                  <span class="visit-badge">{record.intervals.length} visits</span>
                  <span class="expand-icon">
                    {#if expandedRecords.has(record.id)}
                      <ChevronDown size={14} />
                    {:else}
                      <ChevronRight size={14} />
                    {/if}
                  </span>
                {/if}
              </div>
              <div class="record-stats">
                <span class="stat">{formatKm(record.distance_km)}</span>
                <span class="stat stat-area">{formatHa(record.area_hectares)}</span>
              </div>
              <div class="record-meta">
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
              </div>
              <div class="record-status">
                {#if record.operator_confirmed}
                  <CheckCircle2 size={16} class="text-green-400" />
                {/if}
              </div>
            </div>

            <!-- Expandable intervals -->
            {#if hasMultipleIntervals(record) && expandedRecords.has(record.id)}
              <div class="intervals-section">
                {#each record.intervals as interval, j}
                  <div class="interval-row">
                    <span class="interval-label">Visit {j + 1}</span>
                    <span class="interval-time">
                      {formatTime(interval.entry_time)} – {formatTime(interval.exit_time)}
                    </span>
                    <span class="interval-duration">{formatDuration(interval.duration_seconds)}</span>
                    <span class="interval-distance">{formatKm(interval.distance_km)}</span>
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
    {:else}
      <!-- Grouped by Field -->
      <div class="fields-grouped">
        {#each recordsByField as [fieldId, group]}
          <div class="field-group">
            <div class="field-group-header" on:click={() => toggleExpand(`field-${fieldId}`)}>
              <MapPin size={16} class="text-green-400" />
              <span class="field-group-name">{group.field_name}</span>
              <span class="field-group-count">{group.records.length} record{group.records.length !== 1 ? "s" : ""}</span>
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
                    <span class="record-row-date">{formatDate(record.start_time)} {formatTime(record.start_time)}</span>
                    <span class="record-row-operator">{record.operator_name || "Unknown"}</span>
                    <span class="record-row-vehicle">{formatVehicleType(record.vehicle_type)}</span>
                    <span class="record-row-operation">{record.operation_name || "Unknown"}</span>
                    <span class="record-row-area">{formatHa(record.area_hectares)}</span>
                    <span class="record-row-distance">{formatKm(record.distance_km)}</span>
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

{#if showFieldOverlay}
  <FieldTrailOverlay
    fieldBoundary={overlayFieldBoundary}
    records={overlayRecords}
    fieldName={overlayFieldName}
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

  .view-toggle {
    display: flex;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    overflow: hidden;
  }

  .view-toggle button {
    padding: 8px 14px;
    background: rgba(255, 255, 255, 0.03);
    border: none;
    color: rgba(255, 255, 255, 0.5);
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .view-toggle button.active {
    background: rgba(59, 130, 246, 0.2);
    color: #60a5fa;
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
    align-items: center;
    gap: 16px;
    padding: 12px 16px;
  }

  .record-snapshot {
    width: 120px;
    height: 90px;
    border-radius: 8px;
    object-fit: cover;
    flex-shrink: 0;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .record-snapshot-placeholder {
    width: 120px;
    height: 90px;
    border-radius: 8px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
  }

  .record-card-header.clickable {
    cursor: pointer;
  }

  .record-date {
    display: flex;
    flex-direction: column;
    min-width: 80px;
  }

  .date-day {
    font-size: 13px;
    font-weight: 500;
  }

  .date-time {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.4);
  }

  .record-field {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    font-size: 14px;
    font-weight: 500;
  }

  .visit-badge {
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 6px;
    background: rgba(59, 130, 246, 0.2);
    color: #60a5fa;
    font-weight: 500;
  }

  .expand-icon {
    display: flex;
    align-items: center;
    color: rgba(255, 255, 255, 0.4);
  }

  .record-stats {
    display: flex;
    gap: 12px;
    min-width: 120px;
    justify-content: flex-end;
  }

  .stat {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.5);
  }

  .stat-area {
    color: #4ade80;
    font-weight: 600;
  }

  .record-meta {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 100px;
  }

  .meta-row {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.4);
  }

  .record-status {
    width: 20px;
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
    gap: 8px;
    padding: 14px 16px;
    cursor: pointer;
  }

  .field-group-name {
    font-size: 15px;
    font-weight: 600;
    flex: 1;
  }

  .field-group-count {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.4);
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

  /* States */
  .loading-state, .error-state, .empty-state {
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
</style>