<script lang="ts">
  /**
   * Every trail through one paddock, taken together: the trail card with
   * all of them picked. Its figures are for inside the paddock's fence
   * only. Replay runs them one after another, quickly, in the order they
   * were driven: the paddock being worked. Stepping left or right, or
   * tapping a block, goes into that one trail as usual.
   */
  import { createEventDispatcher, tick } from "svelte"
  import {
    ChevronLeft,
    ChevronRight,
    Layers,
    Play,
    Square,
    X,
  } from "lucide-svelte"
  import { formatHa } from "$lib/components/mapnext/format"
  import { drawColour } from "$lib/components/mapnext/palette"
  import type { ReplayState, ThroughStats } from "./liveEngine"
  import type { TrailInfo } from "./liveData"

  /** The paddock they all go through. */
  export let name = ""
  export let trails: TrailInfo[] = []
  export let stats: ThroughStats | null = null
  /** Which one is being replayed (counting from the oldest), if any is. */
  export let playing: number | null = null
  export let replay: ReplayState | null = null

  const dispatch = createEventDispatcher<{
    close: void
    pick: string
    play: void
    stop: void
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
  $: now = playing !== null ? (ordered[playing] ?? null) : null
  $: done =
    playing !== null && ordered.length
      ? (playing +
          (replay && replay.trailId === now?.id ? replay.progress : 0)) /
        ordered.length
      : 0

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

  let strip: HTMLDivElement | null = null
  function centre(el: HTMLDivElement) {
    const at = el.querySelector<HTMLElement>(".now")
    if (at && el.scrollWidth > el.clientWidth + 1)
      el.scrollLeft = at.offsetLeft - el.clientWidth / 2
  }
  $: if (strip && now && squeeze) {
    const el = strip
    tick().then(() => centre(el))
  }
</script>

<div class="mn-card mn-menu mn-trailset">
  <div class="head">
    <span class="mark"><Layers size={24} /></span>
    <div class="about">
      <h2>All {ordered.length} trails</h2>
      <p>through {name}</p>
    </div>
    <button
      type="button"
      class="mn-icon-button"
      aria-label="Back to the paddock"
      on:click={() => dispatch("close")}
    >
      <X size={22} />
    </button>
  </div>

  {#if stats}
    <!-- What they add up to, inside the fence only. -->
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
        <span>driven in here</span>
      </div>
      <div>
        <strong>
          {shortDay(stats.from)}{shortDay(stats.to) !== shortDay(stats.from)
            ? ` to ${shortDay(stats.to)}`
            : ""}
        </strong>
        <span>{stats.drivers.join(", ") || "No operator"}</span>
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
    <div class="strip" bind:this={strip} bind:clientWidth={room}>
      {#each days as group (group.label)}
        <div class="day">
          <span>{group.label}</span>
          <div>
            {#each group.trails as t (t.id)}
              <button
                type="button"
                class:now={now?.id === t.id}
                class:waiting={playing !== null && ordered.indexOf(t) > playing}
                aria-label="{t.operator || 'Trail'}, {clock(t.start)}"
                title="{t.operator || 'Trail'} · {clock(t.start)}"
                style="width: {widthOf(t)}px; --c: {drawColour(t.colour)}"
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

  <!-- ── The paddock being worked, one trail after another ── -->
  <div class="replay">
    <button
      type="button"
      class="play"
      aria-label={playing !== null ? "Stop the replay" : "Replay them all"}
      on:click={() => dispatch(playing !== null ? "stop" : "play")}
    >
      {#if playing !== null}
        <Square size={18} fill="currentColor" />
      {:else}
        <Play size={22} fill="currentColor" />
      {/if}
    </button>
    {#if playing !== null && now}
      <div class="going">
        <strong>
          {playing + 1} of {ordered.length} · {(now.operator || "No operator")
            .trim()
            .split(/\s+/)[0]}
        </strong>
        <span>{shortDay(now.start)} · {clock(now.start)}</span>
        <i style="--done: {(done * 100).toFixed(1)}%"></i>
      </div>
    {:else}
      <span class="idle">
        Replay: watch {name} being worked, a trail at a time
      </span>
    {/if}
  </div>
  <p class="set">Tap a block, or an arrow, to open one trail on its own.</p>
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
    background: var(--lp-ink);
    color: var(--lp-yellow);
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
  }
  .day button.waiting {
    opacity: 0.35;
  }
  .day button.now {
    box-shadow:
      0 0 0 1.5px var(--lp-card),
      0 0 0 3.5px var(--lp-ink);
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
  .idle {
    flex: 1;
    font-size: 0.9rem;
    color: var(--lp-ink-soft);
  }
  .going {
    display: grid;
    flex: 1;
    gap: 1px;
    min-width: 0;
  }
  .going strong {
    font-size: 0.95rem;
    font-weight: 800;
  }
  .going span {
    font-family: var(--lp-mono);
    font-size: 0.74rem;
    color: var(--lp-ink-soft);
  }
  .going i {
    height: 5px;
    margin-top: 4px;
    border-radius: 99px;
    background: linear-gradient(
      to right,
      var(--lp-ink) var(--done),
      var(--lp-line) var(--done)
    );
  }
  .set {
    font-size: 0.74rem;
    color: var(--lp-ink-soft);
    text-align: center;
  }
</style>
