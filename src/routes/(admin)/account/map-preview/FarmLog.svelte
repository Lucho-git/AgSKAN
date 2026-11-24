<script context="module" lang="ts">
  import type { LngLat } from "$lib/components/mapnext/geo"

  /** Something in the log put back the way it was. */
  export type LogUndo =
    | { kind: "restore"; id: string }
    | { kind: "remove"; id: string }
    | { kind: "edit"; id: string; iconClass: string; colour: string }
    | { kind: "move"; id: string; at: LngLat }

  /**
   * What this person has undone from the log, with what would do each over
   * again, and the rows those undos and redos wrote to the log themselves
   * (left out, so undoing something isn't one more thing in the list). Kept
   * for the visit, so they outlast the list being closed and opened.
   */
  const undoneRows = new Map<number, LogUndo>()
  const hiddenRows = new Set<number>()
</script>

<script lang="ts">
  /**
   * What has been happening on the farm: the same feed the current viewer's
   * Map Log tab reads (`map_log`, written by the database as things
   * happen). Newest first, by day, each row told mostly in pictures the way
   * the current viewer tells it: a pin as it was and as it became, a
   * machine with the trail it laid, one machine swapped for another.
   *
   * A row that has a place on the map goes there when tapped. A trail
   * still being laid picks the machine laying it; a finished one opens that
   * trail. What a pin row did can be undone from the row, and then done
   * over again from the strip at the top.
   */
  import { onDestroy, onMount } from "svelte"
  import { createEventDispatcher } from "svelte"
  import {
    Activity,
    ArrowRight,
    Check,
    LoaderCircle,
    MapPin,
    Move,
    Plus,
    Redo2,
    Route,
    Trash2,
    Undo2,
    UserMinus,
    UserPlus,
    UserRound,
  } from "lucide-svelte"
  import vehicles from "$lib/vehicles"
  import PinArt from "$lib/components/mapnext/PinArt.svelte"
  import Dropdown from "$lib/components/mapnext/Dropdown.svelte"
  import { drawColour } from "$lib/components/mapnext/palette"
  import { machineFor } from "$lib/components/mapnext/machines"
  import {
    MAP_LOG_PAGE_SIZE,
    fetchMapLogPage,
    type MapLogEntry,
  } from "$lib/api/mapLogApi"

  export let mapId: string
  /** Someone looking on can't undo anything. */
  export let guest = false
  /** Undo one row; resolves true when it worked. */
  export let undo: (what: LogUndo) => Promise<boolean> = async () => false

  const dispatch = createEventDispatcher<{
    look: LngLat
    /** The machine (by account) laying a trail that has just started. */
    crew: string
    /** A finished trail, and the job it was laid for. */
    trail: { id: string; operation: string }
  }>()

  const PINS = [
    "marker.placed",
    "marker.edited",
    "marker.moved",
    "marker.deleted",
    "marker.restored",
  ]
  const TRAILS = ["trail.started", "trail.closed", "trail.deleted"]
  const OTHER = [
    "vehicle.changed",
    "operator.changed",
    "team.joined",
    "team.removed",
    "team.left",
  ]
  const KINDS: { key: string; label: string; actions: string[] | null }[] = [
    { key: "all", label: "Everything", actions: null },
    { key: "pins", label: "Pins", actions: PINS },
    { key: "trails", label: "Trails", actions: TRAILS },
    { key: "other", label: "Other", actions: OTHER },
  ]
  let kind = "all"
  let entries: MapLogEntry[] = []
  let loading = true
  let more = false
  let failed = false
  let timer: ReturnType<typeof setInterval>
  /** Rows being undone, and rows that have been. */
  let undoing: number | null = null
  let undone = new Map(undoneRows)
  let hidden = new Set(hiddenRows)

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
    (entry) =>
      !hidden.has(entry.id) &&
      !(entry.action === "trail.started" && over.has(entry.entity_id)),
  )
  $: undoneShown = guest
    ? []
    : entries.filter((entry) => undone.has(entry.id)).slice(0, 3)

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
  /** "5m ago", "3h ago", "2d ago". */
  function ago(iso: string) {
    const gap = Date.now() - new Date(iso).getTime()
    if (gap < 60_000) return "now"
    if (gap < 3_600_000) return `${Math.floor(gap / 60_000)}m ago`
    if (gap < 86_400_000) return `${Math.floor(gap / 3_600_000)}h ago`
    if (gap < 30 * 86_400_000) return `${Math.floor(gap / 86_400_000)}d ago`
    return new Date(iso).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
    })
  }
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
  /** Whose machine a trail row is about. */
  const machineId = (entry: MapLogEntry) =>
    String(entry.details?.vehicle_id ?? entry.actor_id ?? "")
  /** Where tapping a row leads, if anywhere. */
  function leadsTo(entry: MapLogEntry) {
    if (entry.action === "trail.started")
      return machineId(entry) ? ("crew" as const) : null
    if (entry.action === "trail.closed")
      return entry.entity_id ? ("trail" as const) : null
    return placeOf(entry) ? ("place" as const) : null
  }
  function follow(entry: MapLogEntry) {
    const to = leadsTo(entry)
    const place = placeOf(entry)
    if (to === "crew") dispatch("crew", machineId(entry))
    else if (to === "trail")
      dispatch("trail", {
        id: entry.entity_id,
        operation: String(entry.details?.operation_name ?? ""),
      })
    else if (place) dispatch("look", place)
  }
  const pinLook = (icon: unknown, colour: unknown) => ({
    iconClass: String(icon || "default"),
    colour: colour ? String(colour) : null,
  })
  const machineOf = (type: unknown) => (type ? machineFor(String(type)) : null)

  /** What undoing a row would do, if it can be undone at all. */
  function undoFor(entry: MapLogEntry): LogUndo | null {
    const d = entry.details ?? {}
    const id = entry.entity_id
    if (!id) return null
    if (entry.action === "marker.deleted") return { kind: "restore", id }
    if (entry.action === "marker.placed" || entry.action === "marker.restored")
      return { kind: "remove", id }
    if (entry.action === "marker.edited" && d.from_icon)
      return {
        kind: "edit",
        id,
        iconClass: String(d.from_icon),
        colour: String(d.from_marker_color || "default"),
      }
    if (
      entry.action === "marker.moved" &&
      d.from_lng != null &&
      d.from_lat != null
    )
      return { kind: "move", id, at: [Number(d.from_lng), Number(d.from_lat)] }
    return null
  }
  // Only the latest thing done to a pin can be undone: undoing an older
  // row would trample what came after it.
  $: latest = entries
    .filter((entry) => !hidden.has(entry.id))
    .reduce((map, entry) => {
      if (entry.action.startsWith("marker.") && !map.has(entry.entity_id))
        map.set(entry.entity_id, entry.id)
      return map
    }, new Map<string, number>())

  /** What doing a row over again would be, once it has been undone. */
  function redoFor(entry: MapLogEntry): LogUndo | null {
    const d = entry.details ?? {}
    const id = entry.entity_id
    if (!id) return null
    if (entry.action === "marker.deleted") return { kind: "remove", id }
    if (entry.action === "marker.placed" || entry.action === "marker.restored")
      return { kind: "restore", id }
    if (entry.action === "marker.edited" && d.icon)
      return {
        kind: "edit",
        id,
        iconClass: String(d.icon),
        colour: String(d.marker_color || "default"),
      }
    if (entry.action === "marker.moved" && d.lng != null && d.lat != null)
      return { kind: "move", id, at: [Number(d.lng), Number(d.lat)] }
    return null
  }

  // An undo (or a redo) is itself written to the log by the database. Those
  // rows are found once they arrive, and left out.
  async function swallow(entity: string, after: number) {
    for (const wait of [900, 2500]) {
      await new Promise((done) => setTimeout(done, wait))
      try {
        const page = await fetchMapLogPage(mapId, { limit: 20 })
        const made = page.filter(
          (row) =>
            row.id > after &&
            row.entity_id === entity &&
            row.action.startsWith("marker."),
        )
        if (made.length) {
          for (const row of made) hiddenRows.add(row.id)
          hidden = new Set(hiddenRows)
          break
        }
      } catch {
        // The next round looks again.
      }
    }
    refresh()
  }

  /** Undo a row, or do an undone row over again. */
  async function act(entry: MapLogEntry, redo: boolean) {
    const what = redo ? undone.get(entry.id) : undoFor(entry)
    if (!what || undoing !== null) return
    undoing = entry.id
    const newest = entries.reduce((most, row) => Math.max(most, row.id), 0)
    if (await undo(what)) {
      const again = redo ? null : redoFor(entry)
      if (again) undoneRows.set(entry.id, again)
      else undoneRows.delete(entry.id)
      undone = new Map(undoneRows)
      swallow(entry.entity_id, newest)
    }
    undoing = null
  }
</script>

<div class="mn-log">
  <Dropdown
    label="Show"
    value={kind}
    options={KINDS.map((option) => ({
      value: option.key,
      label: option.label,
    }))}
    on:change={(e) => {
      kind = e.detail
      load()
    }}
  />

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
    {#if undoneShown.length}
      <!-- What has been undone, and can be done over again. -->
      <div class="redo">
        <p><Undo2 size={12} /> Undone</p>
        {#each undoneShown as entry (entry.id)}
          <button
            type="button"
            disabled={undoing !== null}
            on:click={() => act(entry, true)}
          >
            <span>{entry.summary}</span>
            <b>
              {#if undoing === entry.id}
                <span class="mn-spin"><LoaderCircle size={12} /></span>
              {:else}
                <Redo2 size={12} />
              {/if}
              Redo
            </b>
          </button>
        {/each}
      </div>
    {/if}
    <div class="rows">
      {#each days as group (group.day)}
        <p class="day">{group.day}</p>
        {#each group.entries as entry (entry.id)}
          {@const to = leadsTo(entry)}
          {@const d = entry.details ?? {}}
          {@const machine = machineOf(d.vehicle_type)}
          {@const before = machineOf(d.from_vehicle_type)}
          {@const back = guest ? null : undoFor(entry)}
          <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
          <div
            class="row"
            class:goes={!!to}
            class:undone={undone.has(entry.id)}
            title={to === "crew"
              ? "Show this machine"
              : to === "trail"
                ? "Open this trail"
                : to
                  ? "Show where"
                  : undefined}
            on:click={() => follow(entry)}
          >
            <!-- What happened, in pictures. -->
            <span class="art">
              {#if entry.action === "marker.edited" && d.from_icon}
                <span class="was">
                  <PinArt
                    look={pinLook(d.from_icon, d.from_marker_color)}
                    size={24}
                  />
                </span>
                <ArrowRight size={11} />
                <PinArt look={pinLook(d.icon, d.marker_color)} size={26} />
              {:else if entry.action.startsWith("marker.")}
                <span class:was={entry.action === "marker.deleted"}>
                  <PinArt look={pinLook(d.icon, d.marker_color)} size={28} />
                </span>
                <span
                  class="stamp"
                  class:bad={entry.action === "marker.deleted"}
                  class:good={entry.action === "marker.placed" ||
                    entry.action === "marker.restored"}
                >
                  {#if entry.action === "marker.deleted"}
                    <Trash2 size={11} />
                  {:else if entry.action === "marker.moved"}
                    <Move size={11} />
                  {:else if entry.action === "marker.restored"}
                    <Undo2 size={11} />
                  {:else}
                    <Plus size={12} strokeWidth={3} />
                  {/if}
                </span>
              {:else if entry.action === "vehicle.changed" && machine}
                {#if before}
                  <span class="was">
                    <svelte:component
                      this={vehicles[before.type]}
                      size="24px"
                      bodyColor={drawColour(d.from_vehicle_body_color)}
                      outlineColor="#ffffff"
                      wheelColor="#15261C"
                      loadColor="#F7DB5C"
                    />
                  </span>
                  <ArrowRight size={11} />
                {/if}
                <svelte:component
                  this={vehicles[machine.type]}
                  size="28px"
                  bodyColor={drawColour(d.vehicle_body_color)}
                  outlineColor="#ffffff"
                  wheelColor="#15261C"
                  loadColor="#F7DB5C"
                />
              {:else if entry.action.startsWith("trail.")}
                {#if machine}
                  <svelte:component
                    this={vehicles[machine.type]}
                    size="28px"
                    bodyColor={drawColour(d.vehicle_body_color)}
                    outlineColor="#ffffff"
                    wheelColor="#15261C"
                    loadColor="#F7DB5C"
                  />
                {/if}
                <span
                  class="trail"
                  class:live={entry.action === "trail.started"}
                  class:bad={entry.action === "trail.deleted"}
                  style={machine && entry.action !== "trail.deleted"
                    ? `color: ${drawColour(d.vehicle_body_color)}`
                    : ""}
                >
                  {#if entry.action === "trail.deleted"}
                    <Trash2 size={15} />
                  {:else}
                    <Route size={17} />
                  {/if}
                </span>
                {#if entry.action === "trail.closed"}
                  <span class="stamp good">
                    <Check size={11} strokeWidth={3} />
                  </span>
                {/if}
              {:else if entry.action === "team.joined"}
                <UserPlus size={20} />
              {:else if entry.action === "team.removed" || entry.action === "team.left"}
                <UserMinus size={20} />
              {:else if entry.action === "operator.changed"}
                <UserRound size={20} />
              {:else}
                <Activity size={20} />
              {/if}
            </span>
            <span class="text">
              <span class="top">
                <strong>{entry.actor_name || "Someone"}</strong>
                <small>
                  {#if to === "place"}
                    <MapPin size={11} />
                  {:else if to}
                    <Route size={11} />
                  {/if}
                  {ago(entry.occurred_at)}
                </small>
              </span>
              <span class="what">
                <span>{entry.summary}</span>
                {#if undone.has(entry.id)}
                  <em>Undone</em>
                {:else if back && latest.get(entry.entity_id) === entry.id}
                  <button
                    type="button"
                    class="undo"
                    disabled={undoing !== null}
                    on:click|stopPropagation={() => act(entry, false)}
                  >
                    {#if undoing === entry.id}
                      <span class="mn-spin"><LoaderCircle size={12} /></span>
                    {:else}
                      <Undo2 size={12} />
                    {/if}
                    Undo
                  </button>
                {/if}
              </span>
            </span>
          </div>
        {/each}
      {/each}
    </div>
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
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
  }
  /* The rows run right to the panel's edges: no box round them. */
  .rows {
    margin-inline: calc(-1 * var(--pad, 14px));
    border-top: 1px solid var(--lp-line);
  }
  .day {
    padding: 6px var(--pad, 14px) 4px;
    background: var(--lp-paper);
    font-family: var(--lp-mono);
    font-size: 0.64rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--lp-ink-soft);
    text-transform: uppercase;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px var(--pad, 14px) 7px 8px;
    border-bottom: 1px solid var(--lp-line);
    color: var(--lp-ink);
  }
  .row.goes {
    cursor: pointer;
  }
  .row.goes:hover {
    background: var(--lp-paper);
  }
  /* The picture: a fixed column, so the words all start on one line. */
  .art {
    position: relative;
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    gap: 1px;
    width: 66px;
    min-height: 34px;
    color: var(--lp-ink-soft);
  }
  .was {
    display: flex;
    filter: grayscale(0.5);
    opacity: 0.55;
  }
  .stamp {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    margin-left: -7px;
    align-self: flex-end;
    border: 1.5px solid var(--lp-card);
    border-radius: 50%;
    background: #f59e0b;
    color: #fff;
  }
  .stamp.good {
    background: #1f8a4c;
  }
  .stamp.bad {
    background: var(--lp-rust);
  }
  .trail {
    display: flex;
    margin-left: 1px;
    filter: drop-shadow(0 0 0.6px #15261c) drop-shadow(0 0 0.6px #15261c);
  }
  .trail.bad {
    color: var(--lp-rust);
    filter: none;
  }
  .trail.live {
    animation: laying 1.4s ease-in-out infinite;
  }
  @keyframes laying {
    50% {
      opacity: 0.4;
    }
  }
  .text {
    display: grid;
    flex: 1;
    grid-template-columns: minmax(0, 1fr);
    gap: 1px;
    min-width: 0;
  }
  .top {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }
  .top strong {
    min-width: 0;
    overflow: hidden;
    font-size: 0.8rem;
    font-weight: 700;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .top small {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    gap: 3px;
    font-size: 0.68rem;
    color: var(--lp-ink-soft);
    white-space: nowrap;
  }
  .what {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
    font-size: 0.76rem;
    line-height: 1.3;
    color: var(--lp-ink-soft);
  }
  .what > span {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .what em {
    flex-shrink: 0;
    font-size: 0.68rem;
    font-style: normal;
    font-weight: 700;
    color: var(--lp-ink-soft);
  }
  .undo {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    gap: 4px;
    min-height: 26px;
    padding: 0 9px;
    border: 1px solid var(--lp-line);
    border-radius: 99px;
    background: var(--lp-card);
    font-size: 0.7rem;
    font-weight: 700;
    color: var(--lp-ink);
  }
  .undo:hover:not(:disabled) {
    border-color: var(--lp-ink);
  }
  .undo:disabled {
    opacity: 0.5;
  }
  /* A row that has been undone: still there, but struck out. */
  .row.undone .art {
    filter: grayscale(0.7);
    opacity: 0.5;
  }
  .row.undone .what > span {
    text-decoration: line-through;
    opacity: 0.7;
  }
  /* What can be done over again, at the top of the list. */
  .redo {
    display: grid;
    gap: 4px;
    padding: 8px 10px;
    border: 1.5px dashed var(--lp-line);
    border-radius: 14px;
    background: var(--lp-paper);
  }
  .redo p {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-family: var(--lp-mono);
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--lp-ink-soft);
    text-transform: uppercase;
  }
  .redo button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: 32px;
    color: var(--lp-ink);
    text-align: left;
  }
  .redo button span {
    min-width: 0;
    overflow: hidden;
    font-size: 0.78rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .redo button b {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    gap: 4px;
    min-height: 26px;
    padding: 0 10px;
    border-radius: 99px;
    background: var(--lp-ink);
    font-size: 0.7rem;
    font-weight: 700;
    color: var(--lp-paper);
  }
  .redo button:disabled {
    opacity: 0.5;
  }
  @media (prefers-reduced-motion: reduce) {
    .trail.live {
      animation: none;
    }
  }
</style>
