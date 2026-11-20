<script lang="ts">
  /**
   * A set of trails taken together (every trail through one paddock, or a
   * whole job's): the trail card with all of them picked. Its figures are
   * for the set, with how much ground more than one trail went over.
   *
   * Replay runs them on one clock, in the order they happened: machines
   * that were working at the same time are on the map at the same time,
   * and the bar can be dragged to any moment. Stepping left or right, or
   * tapping a block, goes into that one trail as usual.
   */
  import { createEventDispatcher } from "svelte"
  import {
    ChevronLeft,
    ChevronRight,
    Layers,
    LoaderCircle,
    Pause,
    Play,
    RotateCcw,
    X,
  } from "lucide-svelte"
  import { formatHa } from "$lib/components/mapnext/format"
  import { trailColour } from "$lib/components/mapnext/palette"
  import type { SetReplayState, ThroughStats } from "./liveEngine"
  import type { TrailInfo } from "./liveData"

  /** Where they all are: "through Dam", "in Harvest 26". */
  export let where = ""
  export let trails: TrailInfo[] = []
  export let stats: ThroughStats | null = null
  export let replay: SetReplayState | null = null

  const dispatch = createEventDispatcher<{
    close: void
    pick: string
    play: void
    pause: void
    seek: number
    rate: void
  }>()

  const clock = (t: number) =>
    new Date(t).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    })
  const shortDay = (t: number) => {
    const date = new Date(t)
    return `${date.getDate()} ${date.toLocaleDateString(undefined, { month: "short" })}`
  }

  $: ordered = [...trails].sort((a, b) => a.start - b.start)
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
  // While it replays, a block is lit once the clock has reached its trail.
  $: going = !!replay && replay.phase !== "loading"
  $: overlap =
    stats && stats.ha > 0 ? Math.round((stats.twice / stats.ha) * 100) : 0

  // The blocks are squeezed to fit, as on a single trail's card.
  let room = 0
  const natural = (t: TrailInfo, most: number) =>
    12 + 40 * Math.sqrt(((t.end ?? t.start) - t.start) / most)
  $: wanted = ordered.reduce((sum, t) => sum + natural(t, longest), 0)
  $: spare =
    room -
    16 -
    Math.max(0, days.length - 1) * 13 -
    Math.max(0, ordered.length - days.length) * 2
  $: squeeze = room && wanted > spare ? Math.max(0.05, spare / wanted) : 1
  $: widthOf = (t: TrailInfo) =>
    Math.max(4, Math.floor(natural(t, longest) * squeeze))
</script>

<div class="mn-card mn-menu mn-trailset">
  <div class="head">
    <span class="mark"><Layers size={24} /></span>
    <div class="about">
      <h2>All {ordered.length} trails</h2>
      <p>
        {where}{stats
          ? ` · ${shortDay(stats.from)}${
              shortDay(stats.to) !== shortDay(stats.from)
                ? ` to ${shortDay(stats.to)}`
                : ""
            }`
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

  {#if stats}
    <div class="mn-stats">
      <div>
        <strong>{formatHa(stats.ha)} ha</strong>
        <span>
          covered{stats.of > 0
            ? ` · ${Math.min(100, Math.round((stats.ha / stats.of) * 100))}%`
            : ""}
        </span>
      </div>
      <div>
        <strong>{stats.km.toFixed(stats.km < 10 ? 1 : 0)} km</strong>
        <span>driven</span>
      </div>
      <div>
        <strong>{overlap}%</strong>
        <span>gone over twice · {formatHa(stats.twice)} ha</span>
      </div>
    </div>
  {/if}

  <div class="strip-row">
    <button
      type="button"
      class="step"
      aria-label="The newest trail on its own"
      disabled={!ordered.length}
      on:click={() => dispatch("pick", ordered[ordered.length - 1].id)}
    >
      <ChevronLeft size={22} />
    </button>
    <div class="strip" bind:clientWidth={room}>
      {#each days as group (group.label)}
        <div class="day">
          <span>{group.label}</span>
          <div>
            {#each group.trails as t (t.id)}
              <button
                type="button"
                class:waiting={going && !!replay && t.start > replay.time}
                aria-label="{t.operator || 'Trail'}, {clock(t.start)}"
                title="{t.operator || 'Trail'} · {clock(t.start)}"
                style="width: {widthOf(t)}px; --c: {trailColour(
                  t.colour,
                  t.id,
                )}"
                on:click={() => dispatch("pick", t.id)}
              ></button>
            {/each}
          </div>
        </div>
      {/each}
    </div>
    <button
      type="button"
      class="step"
      aria-label="The oldest trail on its own"
      disabled={!ordered.length}
      on:click={() => dispatch("pick", ordered[0].id)}
    >
      <ChevronRight size={22} />
    </button>
  </div>

  <!-- ── All of them replayed on one clock ── -->
  <div class="replay">
    <button
      type="button"
      class="play"
      aria-label={replay?.phase === "playing"
        ? "Pause the replay"
        : replay?.phase === "done"
          ? "Replay again"
          : "Replay them all"}
      disabled={replay?.phase === "loading"}
      on:click={() => dispatch(replay?.phase === "playing" ? "pause" : "play")}
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
    {#if replay?.phase === "loading"}
      <span class="idle">
        Getting the trails ready · {replay.loaded} of {replay.total}
      </span>
    {:else if replay}
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
      <span class="at">
        <b>{clock(replay.time)}</b>
        <small>{shortDay(replay.time)}</small>
      </span>
      <button
        type="button"
        class="rate"
        aria-label="Replay speed: {replay.rate} times"
        on:click={() => dispatch("rate")}
      >
        {replay.rate}×
      </button>
    {:else}
      <span class="idle">Replay: watch them all being laid, together</span>
    {/if}
  </div>
  <p class="set">
    {#if replay && replay.phase !== "loading"}
      {replay.active.length
        ? `${replay.active.join(", ")} working`
        : "Nobody working at this moment"}
    {:else}
      Tap a block, or an arrow, to open one trail on its own.
    {/if}
  </p>
</div>

<style>
  .mark {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 46px;
    height: 46px;
    border-radius: 13px;
    background: var(--lp-yellow);
    color: #15261c;
  }
  .mn-trailset h2 {
    font-size: 1.1rem;
  }
  .strip-row {
    display: flex;
    align-items: stretch;
    gap: 4px;
    min-width: 0;
  }
  .step {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 42px;
    border-radius: 11px;
    background: var(--lp-ink);
    color: var(--lp-paper);
  }
  .strip {
    display: flex;
    flex: 1;
    gap: 6px;
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
    padding-left: 6px;
    border-left: 1.5px dashed var(--lp-line);
  }
  .day > span {
    width: 0;
    min-width: 100%;
    overflow: hidden;
    font-family: var(--lp-mono);
    font-size: 0.66rem;
    font-weight: 700;
    color: var(--lp-ink-soft);
    white-space: nowrap;
  }
  .day > div {
    display: flex;
    gap: 2px;
  }
  /* Every block is picked: all at full strength. */
  .day button {
    flex-shrink: 0;
    height: 26px;
    border-radius: 4px;
    background: var(--c);
    box-shadow: inset 0 0 0 1px rgba(21, 38, 28, 0.35);
    transition: opacity 0.2s;
  }
  .day button.waiting {
    opacity: 0.3;
  }
  .replay {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .play {
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
  .idle {
    flex: 1;
    font-size: 0.9rem;
    color: var(--lp-ink-soft);
  }
  .at {
    display: grid;
    flex-shrink: 0;
    justify-items: end;
    font-family: var(--lp-mono);
    line-height: 1.15;
    white-space: nowrap;
  }
  .at b {
    font-size: 0.82rem;
    font-weight: 700;
  }
  .at small {
    font-size: 0.66rem;
    color: var(--lp-ink-soft);
  }
  .rate {
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
  .set {
    font-size: 0.76rem;
    color: var(--lp-ink-soft);
    text-align: center;
  }
</style>
