<script lang="ts">
  /**
   * A trail, picked out. Who drove it and when sit in one quiet line; under
   * that is a strip of every trail it can be stepped through (the job's, or
   * just those through one paddock), in the order they were driven, a block
   * each, as wide as the trail was long, grouped by day. Then the replay,
   * and one row of buttons for everything else.
   */
  import { createEventDispatcher, tick } from "svelte"
  import {
    ChevronLeft,
    ChevronRight,
    LoaderCircle,
    Navigation,
    Pause,
    Play,
    RotateCcw,
    Route,
    Trash2,
    Tv,
    X,
  } from "lucide-svelte"
  import { drawColour } from "$lib/components/mapnext/palette"
  import type { ReplayState } from "./liveEngine"
  import type { TrailInfo } from "./liveData"

  export let trail: TrailInfo
  /** The trails the arrows step through, this one among them. */
  export let list: TrailInfo[] = []
  /** The paddock they all go through, when it is only those. */
  export let scope = ""
  /** Width, hectares, distance, how long: short figures. */
  export let facts: string[] = []
  /** Who drove it, and what. */
  export let who = ""
  export let replay: ReplayState | null = null
  export let marks: { centre: boolean; arrows: boolean }
  /** The guide is still getting this trail's path. */
  export let busy = false
  export let guest = false

  const dispatch = createEventDispatcher<{
    close: void
    pick: string
    step: number
    play: void
    pause: void
    seek: number
    rate: void
    mark: "centre" | "arrows"
    follow: boolean
    remove: void
  }>()

  const clock = (t: number) =>
    new Date(t).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    })
  const day = (t: number) =>
    new Date(t).toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
    })
  const shortDay = (t: number) =>
    new Date(t).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
    })

  let asking = false
  let last = trail.id
  let strip: HTMLDivElement | null = null
  $: if (trail.id !== last) {
    last = trail.id
    asking = false
  }

  // The strip: oldest on the left, a block per trail, a label per day.
  $: ordered = [...list].sort((a, b) => a.start - b.start)
  $: longest = Math.max(1, ...ordered.map((t) => (t.end ?? t.start) - t.start))
  $: days = ordered.reduce<{ label: string; trails: TrailInfo[] }[]>(
    (groups, t) => {
      const label = shortDay(t.start)
      const group = groups[groups.length - 1]
      if (group?.label === label) group.trails.push(t)
      else groups.push({ label, trails: [t] })
      return groups
    },
    [],
  )
  $: index = ordered.findIndex((t) => t.id === trail.id)
  const blockWidth = (t: TrailInfo, most: number) =>
    Math.round(12 + 44 * Math.sqrt(((t.end ?? t.start) - t.start) / most))

  // The picked block is kept in view as the trails are stepped through.
  $: if (strip && trail.id)
    tick().then(() =>
      strip
        ?.querySelector<HTMLElement>("[aria-pressed='true']")
        ?.scrollIntoView({ block: "nearest", inline: "center" }),
    )
</script>

<div class="mn-card mn-menu mn-trail">
  <div class="head">
    <span class="dot" style="background: {drawColour(trail.colour)}"></span>
    <div class="about">
      <h2>{who || "Trail"}</h2>
      <p>
        {day(trail.start)} · {clock(trail.start)}{trail.end
          ? ` to ${clock(trail.end)}`
          : ""}
      </p>
    </div>
    <button
      type="button"
      class="mn-icon-button"
      aria-label="Close"
      on:click={() => dispatch("close")}
    >
      <X size={22} />
    </button>
  </div>

  {#if facts.length}
    <div class="figures">
      {#each facts as fact}<span>{fact}</span>{/each}
    </div>
  {/if}

  {#if ordered.length > 1}
    <!-- ── Where it sits among the others ── -->
    <div class="among">
      <p class="lp-eyebrow">
        Trail {index + 1} of {ordered.length}{scope ? ` through ${scope}` : ""}
      </p>
      <div class="strip-row">
        <button
          type="button"
          class="step"
          aria-label="Older trail"
          on:click={() => dispatch("step", 1)}
        >
          <ChevronLeft size={20} />
        </button>
        <div class="strip" bind:this={strip}>
          {#each days as group (group.label)}
            <div class="day">
              <span>{group.label}</span>
              <div>
                {#each group.trails as t (t.id)}
                  <button
                    type="button"
                    aria-pressed={t.id === trail.id}
                    aria-label="{t.operator || 'Trail'}, {clock(t.start)}"
                    title="{t.operator || 'Trail'} · {clock(t.start)}"
                    style="width: {blockWidth(t, longest)}px; --c: {drawColour(
                      t.colour,
                    )}"
                    on:click={() => t.id !== trail.id && dispatch("pick", t.id)}
                  ></button>
                {/each}
              </div>
            </div>
          {/each}
        </div>
        <button
          type="button"
          class="step"
          aria-label="Newer trail"
          on:click={() => dispatch("step", -1)}
        >
          <ChevronRight size={20} />
        </button>
      </div>
    </div>
  {/if}

  <!-- ── Watching it being laid ── -->
  <div class="replay">
    <button
      type="button"
      class="play"
      aria-label={replay?.phase === "playing"
        ? "Pause the replay"
        : replay?.phase === "done"
          ? "Replay again"
          : "Replay this trail"}
      disabled={replay?.phase === "loading"}
      on:click={() =>
        replay?.phase === "playing" ? dispatch("pause") : dispatch("play")}
    >
      {#if replay?.phase === "loading"}
        <span class="mn-spin"><LoaderCircle size={22} /></span>
      {:else if replay?.phase === "playing"}
        <Pause size={22} fill="currentColor" />
      {:else if replay?.phase === "done"}
        <RotateCcw size={22} />
      {:else}
        <Play size={22} fill="currentColor" />
      {/if}
    </button>
    {#if replay && replay.phase !== "loading"}
      <input
        class="mn-scrub"
        type="range"
        min="0"
        max="1"
        step="0.001"
        value={replay.progress}
        aria-label="Position in the replay"
        style="--done: {(replay.progress * 100).toFixed(1)}%"
        on:input={(e) => dispatch("seek", Number(e.currentTarget.value))}
      />
      <span class="at">{clock(replay.time)}</span>
      <button
        type="button"
        class="rate"
        aria-label="Replay speed: {replay.rate} times"
        on:click={() => dispatch("rate")}
      >
        {replay.rate}×
      </button>
    {:else}
      <span class="idle">Replay: watch it being laid</span>
    {/if}
  </div>

  {#if asking}
    <p class="mn-warning">
      Delete this trail for good? It comes off the map and out of the farm's
      records, and can't be brought back.
    </p>
    <div class="mn-card-actions">
      <button
        type="button"
        class="lp-btn lp-btn-ghost"
        on:click={() => (asking = false)}
      >
        Keep it
      </button>
      <button
        type="button"
        class="mn-remove solid"
        on:click={() => dispatch("remove")}
      >
        <Trash2 size={17} /> Delete
      </button>
    </div>
  {:else}
    <!-- ── Everything else, one row ── -->
    <div class="tiles">
      <button
        type="button"
        aria-pressed={marks.centre}
        on:click={() => dispatch("mark", "centre")}
      >
        <span class="line" aria-hidden="true"></span>
        Centre line
      </button>
      <button
        type="button"
        aria-pressed={marks.arrows}
        on:click={() => dispatch("mark", "arrows")}
      >
        <Navigation size={19} fill="currentColor" />
        Arrows
      </button>
      <button
        type="button"
        class="main"
        disabled={busy}
        on:click={() => dispatch("follow", false)}
      >
        <Route size={19} />
        Follow it
      </button>
      <button
        type="button"
        disabled={busy}
        on:click={() => dispatch("follow", true)}
      >
        <Tv size={19} />
        Demo run
      </button>
      {#if !guest}
        <button type="button" class="danger" on:click={() => (asking = true)}>
          <Trash2 size={19} />
          Delete
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .mn-trail .dot {
    flex-shrink: 0;
    width: 22px;
    height: 22px;
    border-radius: 7px;
    box-shadow: 0 0 0 1.5px var(--lp-ink);
  }
  .mn-trail h2 {
    font-size: 1.08rem;
  }
  .figures {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  .figures span {
    padding: 3px 9px;
    border-radius: 99px;
    background: var(--lp-paper-2);
    font-family: var(--lp-mono);
    font-size: 0.76rem;
    font-weight: 600;
    color: var(--lp-ink);
  }
  .among {
    display: grid;
    gap: 5px;
  }
  .strip-row {
    display: flex;
    align-items: stretch;
    gap: 4px;
  }
  .step {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 34px;
    border: 1.5px solid var(--lp-line);
    border-radius: 11px;
    color: var(--lp-ink);
  }
  .strip {
    display: flex;
    flex: 1;
    gap: 9px;
    min-width: 0;
    padding: 5px 8px 7px;
    overflow-x: auto;
    border: 1.5px solid var(--lp-line);
    border-radius: 11px;
    scrollbar-width: none;
  }
  .strip::-webkit-scrollbar {
    display: none;
  }
  .day {
    display: grid;
    flex-shrink: 0;
    gap: 3px;
  }
  .day + .day {
    padding-left: 9px;
    border-left: 1.5px dashed var(--lp-line);
  }
  .day > span {
    font-family: var(--lp-mono);
    font-size: 0.66rem;
    font-weight: 700;
    color: var(--lp-ink-soft);
    white-space: nowrap;
  }
  .day > div {
    display: flex;
    gap: 3px;
  }
  .day button {
    flex-shrink: 0;
    height: 24px;
    border-radius: 5px;
    background: var(--c);
    box-shadow: inset 0 0 0 1px rgba(21, 38, 28, 0.35);
    opacity: 0.45;
  }
  .day button:hover {
    opacity: 0.75;
  }
  .day button[aria-pressed="true"] {
    box-shadow:
      0 0 0 2px var(--lp-card),
      0 0 0 4px var(--lp-ink);
    opacity: 1;
  }
  .replay {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .replay .play {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 46px;
    height: 46px;
    border-radius: 50%;
    background: var(--lp-ink);
    color: var(--lp-paper);
  }
  .replay .mn-scrub {
    flex: 1;
    min-width: 0;
  }
  .replay .at {
    font-family: var(--lp-mono);
    font-size: 0.82rem;
    font-weight: 700;
    white-space: nowrap;
  }
  .replay .idle {
    flex: 1;
    font-size: 0.9rem;
    color: var(--lp-ink-soft);
  }
  .replay .rate {
    flex-shrink: 0;
    min-width: 44px;
    height: 36px;
    border: 1.5px solid var(--lp-line);
    border-radius: 99px;
    font-family: var(--lp-mono);
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--lp-ink);
  }
  .tiles {
    display: grid;
    grid-auto-columns: 1fr;
    grid-auto-flow: column;
    gap: 5px;
  }
  .tiles button {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    min-height: 58px;
    padding: 6px 2px;
    border: 1.5px solid var(--lp-line);
    border-radius: 13px;
    font-size: 0.72rem;
    font-weight: 700;
    line-height: 1.1;
    color: var(--lp-ink);
    text-align: center;
  }
  .tiles button[aria-pressed="true"] {
    border-color: var(--lp-ink);
    background: var(--lp-ink);
    color: var(--lp-paper);
  }
  .tiles .main {
    border-color: var(--lp-ink);
    background: var(--lp-yellow);
    color: #15261c;
  }
  .tiles .danger {
    color: var(--lp-rust);
  }
  .tiles button:disabled {
    opacity: 0.55;
  }
  .tiles .line {
    width: 22px;
    height: 0;
    margin: 8px 0;
    border-top: 3px solid currentColor;
    border-radius: 2px;
  }
</style>
