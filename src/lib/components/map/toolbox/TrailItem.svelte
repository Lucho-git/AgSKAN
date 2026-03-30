<!-- TrailItem — Dot Bar style trail row -->
<script>
  // @ts-nocheck
  import { createEventDispatcher } from "svelte"
  import { Play, Layers } from "lucide-svelte"

  const dispatch = createEventDispatcher()

  export let trail
  export let isSelected = false
  export let maxDistance = 1

  function formatTime(dateStr) {
    if (!dateStr) return ""
    return new Date(dateStr).toLocaleTimeString("en-AU", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
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

  function formatDuration(startStr, endStr) {
    if (!startStr || !endStr) return "—"
    const ms = new Date(endStr).getTime() - new Date(startStr).getTime()
    if (!ms || ms <= 0) return "—"
    const hours = Math.floor(ms / 3600000)
    const minutes = Math.floor((ms % 3600000) / 60000)
    if (hours > 0) return `${hours}h`
    return `${minutes}m`
  }

  function formatOverlap(t) {
    if (t.trail_percentage_overlap != null) {
      return `${Math.round(t.trail_percentage_overlap)}%`
    }
    return "—"
  }

  $: duration = formatDuration(trail.start_time, trail.end_time)
  $: distPct = Math.min(((trail.trail_distance || 0) / maxDistance) * 100, 100)
</script>

<button
  class="db-row"
  class:selected={isSelected}
  on:click={() => dispatch("select")}
>
  <span class="db-dot" style="background-color: {trail.trail_color || '#888'}"
  ></span>
  <div class="db-body">
    <div class="db-top">
      <span class="db-time"
        >{formatTime(trail.start_time)} – {formatTime(trail.end_time)}</span
      >
      <span class="db-dur">{duration}</span>
    </div>
    <div class="db-track">
      <div
        class="db-fill"
        style="width: {distPct}%; background-color: {trail.trail_color ||
          '#60a5fa'}"
      ></div>
    </div>
    <div class="db-stats">
      <span class="db-stat">{formatDistance(trail.trail_distance)}</span>
      {#if trail.trail_hectares}
        <span class="db-sep">·</span>
        <span class="db-stat">{formatHectares(trail.trail_hectares)}</span>
      {/if}
      {#if trail.trail_percentage_overlap != null}
        <span class="db-sep">·</span>
        <span class="db-stat overlap"
          ><Layers size={10} />{formatOverlap(trail)}</span
        >
      {/if}
    </div>
  </div>
  <button
    class="icon-btn replay"
    title="Replay"
    on:click|stopPropagation={() => dispatch("replay")}
  >
    <Play size={14} />
  </button>
</button>

<style>
  .db-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px 8px 14px;
    border: none;
    background: transparent;
    color: white;
    cursor: pointer;
    width: 100%;
    text-align: left;
    transition: background 0.15s;
    min-height: 48px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  }
  .db-row:hover {
    background: rgba(255, 255, 255, 0.06);
  }
  .db-row:hover .icon-btn.replay {
    color: rgba(96, 165, 250, 0.8);
  }
  .db-row.selected {
    background: rgba(96, 165, 250, 0.1);
    border-left: 3px solid #60a5fa;
    padding-left: 11px;
  }
  .db-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
    border: 2px solid rgba(255, 255, 255, 0.15);
  }
  .db-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }
  .db-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .db-time {
    font-size: 13px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.9);
    white-space: nowrap;
  }
  .db-dur {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.35);
    white-space: nowrap;
  }
  .db-track {
    height: 3px;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.06);
    overflow: hidden;
  }
  .db-fill {
    height: 100%;
    border-radius: 2px;
    opacity: 0.65;
    transition: width 0.3s ease;
    min-width: 2px;
  }
  .db-stats {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .db-stat {
    font-size: 11px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.5);
    white-space: nowrap;
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .db-stat.overlap {
    color: rgba(250, 204, 21, 0.55);
  }
  .db-sep {
    color: rgba(255, 255, 255, 0.2);
    font-size: 9px;
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
    min-width: 32px;
    min-height: 32px;
  }
  .icon-btn.replay {
    color: rgba(96, 165, 250, 0.5);
  }
  .icon-btn.replay:hover {
    color: #60a5fa;
    background: rgba(96, 165, 250, 0.15);
  }
</style>
