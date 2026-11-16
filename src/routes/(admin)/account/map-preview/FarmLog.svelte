<script lang="ts">
  /**
   * What has been happening on the farm: the same feed the current viewer's
   * Map Log tab reads (`map_log`, written by the database as things
   * happen): pins dropped, moved and removed, trails started and finished,
   * machines and drivers changed, people joining. Newest first, by day. A
   * row that has a place on the map goes there when tapped.
   */
  import { onDestroy, onMount } from "svelte"
  import { createEventDispatcher } from "svelte"
  import {
    Activity,
    Check,
    ChevronDown,
    Clock,
    LoaderCircle,
    MapPin,
  } from "lucide-svelte"
  import vehicles from "$lib/vehicles"
  import PinArt from "$lib/components/mapnext/PinArt.svelte"
  import { drawColour } from "$lib/components/mapnext/palette"
  import { machineFor } from "$lib/components/mapnext/machines"
  import {
    MAP_LOG_PAGE_SIZE,
    fetchMapLogPage,
    type MapLogEntry,
  } from "$lib/api/mapLogApi"
  import type { LngLat } from "$lib/components/mapnext/geo"

  export let mapId: string

  const dispatch = createEventDispatcher<{ look: LngLat }>()

  const KINDS = [
    { key: "all", label: "Everything", actions: null },
    {
      key: "pins",
      label: "Pins",
      actions: [
        "marker.placed",
        "marker.edited",
        "marker.moved",
        "marker.deleted",
        "marker.restored",
      ],
    },
    {
      key: "trails",
      label: "Trails",
      actions: ["trail.started", "trail.closed", "trail.deleted"],
    },
  ]
  let kind = "all"
  let entries: MapLogEntry[] = []
  let loading = true
  let more = false
  let failed = false
  let timer: ReturnType<typeof setInterval>

  const actionsNow = () =>
    KINDS.find((option) => option.key === kind)?.actions ?? null

  async function load(older = false) {
    if (!older) loading = true
    failed = false
    try {
      const page = await fetchMapLogPage(mapId, {
        limit: MAP_LOG_PAGE_SIZE,
        beforeId: older ? entries[entries.length - 1]?.id : undefined,
        actions: actionsNow(),
      })
      entries = older ? [...entries, ...page] : page
      more = page.length === MAP_LOG_PAGE_SIZE
    } catch {
      failed = true
    }
    loading = false
  }

  // While it is open, anything new is slipped in at the top.
  async function refresh() {
    if (loading || document.hidden) return
    try {
      const page = await fetchMapLogPage(mapId, {
        limit: MAP_LOG_PAGE_SIZE,
        actions: actionsNow(),
      })
      const have = new Set(entries.map((entry) => entry.id))
      const fresh = page.filter((entry) => !have.has(entry.id))
      if (fresh.length) entries = [...fresh, ...entries]
    } catch {
      // The next round tries again.
    }
  }

  onMount(() => {
    load()
    timer = setInterval(refresh, 30_000)
  })
  onDestroy(() => clearInterval(timer))

  // A trail that has finished (or been deleted) is one row, not two: its
  // "started" row gives way to the later one.
  $: over = new Set(
    entries
      .filter(
        (entry) =>
          entry.action === "trail.closed" || entry.action === "trail.deleted",
      )
      .map((entry) => entry.entity_id),
  )
  $: shown = entries.filter(
    (entry) => !(entry.action === "trail.started" && over.has(entry.entity_id)),
  )

  const dayOf = (iso: string) => {
    const then = new Date(iso)
    const today = new Date()
    const days = Math.round(
      (new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
      ).getTime() -
        new Date(
          then.getFullYear(),
          then.getMonth(),
          then.getDate(),
        ).getTime()) /
        86_400_000,
    )
    if (days === 0) return "Today"
    if (days === 1) return "Yesterday"
    return then.toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
    })
  }
  const clock = (iso: string) =>
    new Date(iso).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    })
  $: days = shown.reduce<{ day: string; entries: MapLogEntry[] }[]>(
    (groups, entry) => {
      const day = dayOf(entry.occurred_at)
      const group = groups[groups.length - 1]
      if (group?.day === day) group.entries.push(entry)
      else groups.push({ day, entries: [entry] })
      return groups
    },
    [],
  )

  const placeOf = (entry: MapLogEntry): LngLat | null => {
    const d = entry.details
    return d && d.lng != null && d.lat != null
      ? [Number(d.lng), Number(d.lat)]
      : null
  }
  const tone = (action: string) =>
    action.endsWith(".deleted") || action === "team.removed"
      ? "gone"
      : action === "trail.started"
        ? "live"
        : ""
</script>

<div class="mn-log">
  <label class="mn-drop">
    <span class="lp-eyebrow">Show</span>
    <strong>{KINDS.find((option) => option.key === kind)?.label}</strong>
    <ChevronDown size={18} />
    <select
      aria-label="What to show in the log"
      bind:value={kind}
      on:change={() => load()}
    >
      {#each KINDS as option (option.key)}
        <option value={option.key}>{option.label}</option>
      {/each}
    </select>
  </label>

  {#if loading && !entries.length}
    <p class="mn-empty">
      <span class="mn-spin"><LoaderCircle size={18} /></span> Loading the log…
    </p>
  {:else if failed && !entries.length}
    <p class="mn-empty">
      The log couldn't be loaded.
      <button type="button" class="mn-text-button" on:click={() => load()}>
        Try again
      </button>
    </p>
  {:else if !shown.length}
    <p class="mn-empty">
      Nothing here yet. Pins, trails and machine changes show up as they happen.
    </p>
  {:else}
    {#each days as group (group.day)}
      <p class="lp-eyebrow day">{group.day}</p>
      <ul>
        {#each group.entries as entry (entry.id)}
          {@const place = placeOf(entry)}
          {@const machine = entry.details?.vehicle_type
            ? machineFor(entry.details.vehicle_type)
            : null}
          <li>
            <button
              type="button"
              class={tone(entry.action)}
              disabled={!place}
              on:click={() => place && dispatch("look", place)}
            >
              <span class="art">
                {#if entry.action.startsWith("marker.") && entry.details?.icon}
                  <PinArt
                    look={{
                      iconClass: entry.details.icon,
                      colour: entry.details.marker_color ?? null,
                    }}
                    size={32}
                  />
                {:else if machine}
                  <svelte:component
                    this={vehicles[machine.type]}
                    size="32px"
                    bodyColor={drawColour(entry.details?.vehicle_body_color)}
                    outlineColor="#ffffff"
                    wheelColor="#15261C"
                    loadColor="#F7DB5C"
                  />
                {:else}
                  <Activity size={20} />
                {/if}
              </span>
              <span class="text">
                <span class="who">
                  <strong>{entry.actor_name || "Someone"}</strong>
                  <small>{clock(entry.occurred_at)}</small>
                </span>
                <span class="what">
                  {entry.summary}
                  {#if entry.details?.completed}
                    <em>
                      {#if entry.details?.auto_closed}
                        <Clock size={11} /> Closed itself
                      {:else}
                        <Check size={11} strokeWidth={3} /> Finished
                      {/if}
                    </em>
                  {/if}
                </span>
              </span>
              {#if place}<span class="go"><MapPin size={16} /></span>{/if}
            </button>
          </li>
        {/each}
      </ul>
    {/each}
    {#if more}
      <button type="button" class="mn-text-button" on:click={() => load(true)}>
        Show older
      </button>
    {/if}
  {/if}
</div>

<style>
  .mn-log {
    display: grid;
    gap: 8px;
  }
  .day {
    margin-top: 4px;
  }
  ul {
    display: grid;
    gap: 0;
    border: 1.5px solid var(--lp-line);
    border-radius: 16px;
    overflow: hidden;
    background: var(--lp-card);
  }
  li + li {
    border-top: 1.5px solid var(--lp-line);
  }
  li button {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 8px 10px;
    color: var(--lp-ink);
    text-align: left;
  }
  li button:not(:disabled):hover {
    background: var(--lp-paper);
  }
  .art {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: 11px;
    background: #cdbd92;
    color: #15261c;
  }
  .gone .art {
    opacity: 0.55;
  }
  .text {
    display: grid;
    flex: 1;
    gap: 1px;
    min-width: 0;
  }
  .who {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }
  .who strong {
    overflow: hidden;
    font-size: 0.9rem;
    font-weight: 800;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .who small {
    flex-shrink: 0;
    font-family: var(--lp-mono);
    font-size: 0.7rem;
    color: var(--lp-ink-soft);
  }
  .what {
    font-size: 0.84rem;
    line-height: 1.3;
    color: var(--lp-ink-soft);
  }
  .live .what {
    font-weight: 700;
    color: var(--lp-green);
  }
  .what em {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    margin-left: 4px;
    padding: 1px 7px;
    border-radius: 99px;
    background: var(--lp-paper-2);
    font-size: 0.7rem;
    font-style: normal;
    font-weight: 700;
    color: var(--lp-ink);
    white-space: nowrap;
  }
  .go {
    display: flex;
    flex-shrink: 0;
    color: var(--lp-ink-soft);
  }
</style>
