<!-- MyTrails — Trail History header + grouped trail list (Dot Bar style) -->
<script>
  // @ts-nocheck
  import { createEventDispatcher, onMount, tick } from "svelte"
  import { historicalTrailStore } from "$lib/stores/otherTrailStore"
  import { selectedTrailIdStore } from "$lib/stores/otherTrailStore"
  import { userVehicleTrailing } from "$lib/stores/vehicleStore"
  import {
    Route,
    ChevronDown,
    ChevronRight,
    Ruler,
    LandPlot,
    Timer,
  } from "lucide-svelte"
  import TrailItem from "./TrailItem.svelte"

  const dispatch = createEventDispatcher()

  // Use store so selection persists across toolbox open/close
  $: selectedTrailId = $selectedTrailIdStore

  // All trails sorted newest first
  $: allTrailsSorted = (() => {
    const trails = $historicalTrailStore || []
    return [...trails]
      .filter((t) => t.end_time)
      .sort(
        (a, b) =>
          new Date(b.start_time || 0).getTime() -
          new Date(a.start_time || 0).getTime(),
      )
  })()

  // Grouped by day
  $: groupedByDay = (() => {
    const groups = new Map()
    allTrailsSorted.forEach((trail) => {
      const d = new Date(trail.start_time)
      const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
      if (!groups.has(dayKey)) {
        groups.set(dayKey, {
          key: dayKey,
          label: formatDayLabel(d),
          date: d,
          trails: [],
          totalDistance: 0,
          totalHectares: 0,
          totalDurationMs: 0,
        })
      }
      const group = groups.get(dayKey)
      group.trails.push(trail)
      group.totalDistance += trail.trail_distance || 0
      group.totalHectares += trail.trail_hectares || 0
      if (trail.start_time && trail.end_time) {
        group.totalDurationMs +=
          new Date(trail.end_time).getTime() -
          new Date(trail.start_time).getTime()
      }
    })
    return Array.from(groups.values())
  })()

  let collapsedDays = {}
  let collapsedInitialized = false

  // Find which day group key contains a given trail id
  function findDayKeyForTrail(trailId) {
    for (const group of groupedByDay) {
      if (group.trails.some((t) => t.id === trailId)) return group.key
    }
    return null
  }

  $: if (!collapsedInitialized && groupedByDay.length > 0) {
    collapsedInitialized = true
    const storedId = $selectedTrailIdStore
    const selectedDayKey = storedId ? findDayKeyForTrail(storedId) : null
    const newState = {}
    groupedByDay.forEach((g, i) => {
      // Expand the day containing the selected trail, or the first day if none selected
      if (selectedDayKey) {
        newState[g.key] = g.key !== selectedDayKey
      } else {
        newState[g.key] = i > 0
      }
    })
    collapsedDays = newState
  }

  // Auto-scroll to the selected trail on mount
  onMount(async () => {
    const storedId = $selectedTrailIdStore
    if (storedId) {
      await tick()
      // Small delay to let DOM render the expanded group
      setTimeout(() => {
        const el = document.querySelector(`[data-trail-id="${storedId}"]`)
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }, 50)
    }
  })

  $: totalTrails = allTrailsSorted.length

  $: totalStats = (() => {
    let distance = 0
    let hectares = 0
    let durationMs = 0
    allTrailsSorted.forEach((t) => {
      distance += t.trail_distance || 0
      hectares += t.trail_hectares || 0
      if (t.start_time && t.end_time) {
        durationMs +=
          new Date(t.end_time).getTime() - new Date(t.start_time).getTime()
      }
    })
    return { distance, hectares, durationMs }
  })()

  $: maxDistance = Math.max(
    ...allTrailsSorted.map((t) => t.trail_distance || 0),
    1,
  )

  function toggleDay(key) {
    collapsedDays = { ...collapsedDays, [key]: !collapsedDays[key] }
  }

  function selectTrail(trail, index) {
    selectedTrailIdStore.set(trail.id)
    dispatch("selectTrail", { trail, index })
  }

  function replayTrail(trail, index) {
    selectedTrailIdStore.set(trail.id)
    dispatch("replayTrail", { trail, index })
  }

  // ── Formatters ──

  function formatDayLabel(d) {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const target = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    const diffDays = Math.floor((today.getTime() - target.getTime()) / 86400000)
    if (diffDays === 0) return "Today"
    if (diffDays === 1) return "Yesterday"
    if (diffDays < 7) return d.toLocaleDateString("en-AU", { weekday: "long" })
    return d.toLocaleDateString("en-AU", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    })
  }

  function formatDistance(meters) {
    if (!meters) return "0 km"
    const km = meters / 1000
    if (km < 0.1) return `${Math.round(meters)}m`
    return `${Math.round(km)} km`
  }

  function formatHectares(ha) {
    if (!ha) return "0 ha"
    return `${Math.round(ha)} ha`
  }

  function formatDurationMs(ms) {
    if (!ms || ms <= 0) return "—"
    const hours = Math.floor(ms / 3600000)
    const minutes = Math.floor((ms % 3600000) / 60000)
    if (hours > 0) return `${hours}h`
    return `${minutes}m`
  }

  function getStoreIndex(trail) {
    return ($historicalTrailStore || []).findIndex((t) => t.id === trail.id)
  }
</script>

<div class="my-trails">
  <!-- Active recording banner -->
  {#if $userVehicleTrailing}
    <div class="active-banner">
      <div class="active-dot"></div>
      <span>Recording in progress</span>
    </div>
  {/if}

  <!-- Trail History Header -->
  {#if totalTrails > 0}
    <div class="hdr-timeline">
      <div class="hdr-tl-top">
        <Route size={14} class="hdr-tl-icon" />
        <span class="hdr-tl-title">Trail History</span>
        <span class="hdr-tl-count"
          >{totalTrails} trail{totalTrails !== 1 ? "s" : ""}</span
        >
      </div>
      <div class="hdr-tl-grid">
        <div class="hdr-tl-stat">
          <Ruler size={11} /><span class="hdr-tl-stat-val"
            >{formatDistance(totalStats.distance)}</span
          >
        </div>
        <div class="hdr-tl-stat">
          <LandPlot size={11} /><span class="hdr-tl-stat-val"
            >{formatHectares(totalStats.hectares)}</span
          >
        </div>
        <div class="hdr-tl-stat">
          <Timer size={11} /><span class="hdr-tl-stat-val"
            >{formatDurationMs(totalStats.durationMs)}</span
          >
        </div>
      </div>
    </div>
  {/if}

  <!-- Trail list grouped by day -->
  <div class="trail-list">
    {#if groupedByDay.length === 0}
      <div class="empty-state small"><p>No trails yet</p></div>
    {:else}
      {#each groupedByDay as group}
        <div class="group-section">
          <div class="group-header-row">
            <button class="group-header" on:click={() => toggleDay(group.key)}>
              <span class="group-chevron">
                {#if collapsedDays[group.key]}<ChevronRight
                    size={18}
                  />{:else}<ChevronDown size={18} />{/if}
              </span>
              <span class="group-label">{group.label}</span>
              <span class="group-stats">
                <span class="group-stat-text"
                  >{group.trails.length} trail{group.trails.length !== 1
                    ? "s"
                    : ""}</span
                >
                <span class="group-stat-sep">·</span>
                <span class="group-stat-text"
                  >{formatDistance(group.totalDistance)}</span
                >
                {#if group.totalHectares > 0}
                  <span class="group-stat-sep">·</span>
                  <span class="group-stat-text"
                    >{formatHectares(group.totalHectares)}</span
                  >
                {/if}
              </span>
            </button>
          </div>
          {#if !collapsedDays[group.key]}
            {#each group.trails as trail (trail.id)}
              <div data-trail-id={trail.id}>
                <TrailItem
                  {trail}
                  isSelected={selectedTrailId === trail.id}
                  {maxDistance}
                  on:select={() => selectTrail(trail, getStoreIndex(trail))}
                  on:replay={() => replayTrail(trail, getStoreIndex(trail))}
                />
              </div>
            {/each}
          {/if}
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .my-trails {
    display: flex;
    flex-direction: column;
    position: relative;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 20px 16px;
    color: rgba(255, 255, 255, 0.4);
  }
  .empty-state p {
    margin: 0;
    font-size: 13px;
  }

  /* Active recording banner */
  .active-banner {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    background: rgba(34, 197, 94, 0.12);
    border-bottom: 1px solid rgba(34, 197, 94, 0.2);
    color: #4ade80;
    font-size: 13px;
    font-weight: 600;
    flex-shrink: 0;
  }
  .active-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #22c55e;
    animation: pulse-dot 1.5s ease-in-out infinite;
    flex-shrink: 0;
  }
  @keyframes pulse-dot {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.3;
    }
  }

  /* Trail History Header */
  .hdr-timeline {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 14px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    flex-shrink: 0;
  }
  :global(.hdr-tl-icon) {
    color: #60a5fa;
    flex-shrink: 0;
  }
  .hdr-tl-top {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .hdr-tl-title {
    font-size: 14px;
    font-weight: 700;
    color: #a0c8e8;
  }
  .hdr-tl-count {
    margin-left: auto;
    background: rgba(96, 165, 250, 0.15);
    color: #60a5fa;
    font-size: 11px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 10px;
  }
  .hdr-tl-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 4px;
  }
  .hdr-tl-stat {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.45);
  }
  .hdr-tl-stat :global(svg) {
    opacity: 0.45;
    flex-shrink: 0;
  }
  .hdr-tl-stat-val {
    font-weight: 700;
    color: rgba(255, 255, 255, 0.8);
  }

  /* Trail List */
  .trail-list {
    display: flex;
    flex-direction: column;
  }

  /* Group / Day sections */
  .group-section {
    margin-bottom: 2px;
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
    gap: 8px;
    padding: 10px 14px;
    background: #0f1218;
    border: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    color: #a0c8e8;
    font-size: 13px;
    font-weight: 600;
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
  .group-label {
    flex-shrink: 0;
    white-space: nowrap;
  }
  .group-stats {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-left: auto;
    overflow: hidden;
  }
  .group-stat-text {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.4);
    font-weight: 500;
    white-space: nowrap;
  }
  .group-stat-sep {
    color: rgba(255, 255, 255, 0.2);
    font-size: 10px;
  }
</style>
