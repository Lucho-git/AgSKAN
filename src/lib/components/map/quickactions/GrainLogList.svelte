<!-- src/lib/components/map/quickactions/GrainLogList.svelte -->
<!-- The grain record: one row per bin level change, chaser load change or
     chaser→bin empty. Shared by the chaser modal (whole-map record) and the
     field bin modal (that bin's record).
     Reads are best-effort: if the grain_log migration hasn't been applied
     yet the list says so instead of breaking the modal. -->
<script>
  import { History } from "lucide-svelte"
  import { fetchGrainLog, GRAIN_LOG_PAGE_SIZE } from "$lib/api/grainLogApi"
  import { grainLogSummary } from "$lib/utils/grainLogSummary"

  /** Map whose record to show (profiles.master_map_id). @type {string | null} */
  export let masterMapId = null
  /** Only this bin's entries (map_markers.id) — omit for everything. @type {string | null} */
  export let binId = null
  /** Only this chaser's entries (profiles.id) — omit for everything. @type {string | null} */
  export let vehicleId = null
  /** @type {number} */
  export let limit = GRAIN_LOG_PAGE_SIZE
  /** Bump to reload (the modal bumps it after every write). @type {number} */
  export let refreshKey = 0
  /** False when the surrounding modal already scrolls (avoids nested scroll). @type {boolean} */
  export let selfScroll = true

  /** @type {import("$lib/api/grainLogApi").GrainLogEntry[]} */
  let entries = []
  let loading = false
  let failed = false

  // Re-read whenever the query changes (or a write bumps refreshKey); the
  // list only lives on a Record tab, so nothing is fetched until it's shown.
  /** @type {string | null} */
  let lastQueryKey = null
  $: queryKey = [
    masterMapId || "",
    binId || "",
    vehicleId || "",
    limit,
    refreshKey,
  ].join("|")
  $: if (queryKey !== lastQueryKey) {
    lastQueryKey = queryKey
    void load()
  }

  async function load() {
    if (!masterMapId) return
    loading = true
    try {
      entries = await fetchGrainLog(masterMapId, { limit, binId, vehicleId })
      failed = false
    } catch (error) {
      console.warn("Grain record unavailable:", error)
      entries = []
      failed = true
    } finally {
      loading = false
    }
  }

  /** @param {string} iso */
  function formatWhen(iso) {
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return ""
    const now = new Date()
    const sameDay = date.toDateString() === now.toDateString()
    const time = date.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    })
    if (sameDay) return time
    const day = date.toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
    })
    return `${day} ${time}`
  }
</script>

{#if failed}
  <p class="gl-note">
    Record unavailable — the grain log table hasn't been set up on this map yet.
  </p>
{:else if loading && !entries.length}
  <p class="gl-note">Loading…</p>
{:else if !entries.length}
  <p class="gl-note">No grain records yet.</p>
{:else}
  <ul class="gl-list" class:gl-list-self-scroll={selfScroll}>
    {#each entries as entry (entry.id)}
      {@const summary = grainLogSummary(entry)}
      <li class="gl-row">
        <span class="gl-ico"><History size={13} /></span>
        <span class="gl-body">
          <span class="gl-title">{summary.title}</span>
          <span class="gl-detail">{summary.detail}</span>
        </span>
        <span class="gl-meta">
          <span class="gl-time">{formatWhen(entry.occurred_at)}</span>
          <span class="gl-actor">{entry.actor_name}</span>
        </span>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .gl-note {
    margin: 0;
    padding: 10px 2px;
    font-size: 11.5px;
    font-style: italic;
    color: rgba(255, 255, 255, 0.45);
  }

  .gl-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .gl-list-self-scroll {
    max-height: 260px;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .gl-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 7px 8px;
    border-radius: 9px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.07);
  }

  .gl-ico {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-top: 1px;
    color: var(--qb-accent, #93c5fd);
  }

  .gl-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .gl-title {
    font-size: 11.5px;
    font-weight: 800;
    color: rgba(255, 255, 255, 0.92);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .gl-detail {
    font-size: 10.5px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.6);
  }

  .gl-meta {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 1px;
  }
  .gl-time {
    font-size: 10px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.55);
    white-space: nowrap;
  }
  .gl-actor {
    max-width: 76px;
    font-size: 9.5px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.35);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
