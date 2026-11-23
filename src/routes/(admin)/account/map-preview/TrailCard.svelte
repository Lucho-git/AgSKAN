<script context="module" lang="ts">
  // Folded down on one trail, it stays folded for the next.
  let keptShort = false
</script>

<script lang="ts">
  /**
   * A trail, picked out. The head says it is a trail (in its own colour),
   * who drove it and when, and which one of the set it is. Under that its
   * figures sit side by side, then a strip of every trail it can be stepped
   * through (the job's, or just those through one paddock): a block each in
   * the order they were driven, grouped by day, squeezed to fit the card
   * however many there are, with the step buttons fixed at either end.
   * Then the replay (beside the way back to all of the set together), and
   * one row of buttons for everything else.
   *
   * On a phone the card can be folded down, by dragging its heading down
   * (or tapping the bar on it), to leave that last row off and more of the
   * map showing while a replay runs. Dragging up brings it back.
   */
  import { createEventDispatcher, tick } from "svelte"
  import {
    ChevronLeft,
    ChevronRight,
    Layers,
    LoaderCircle,
    Navigation,
    Pause,
    Play,
    RotateCcw,
    Route,
    Trash2,
    TriangleAlert,
    Tv,
    X,
  } from "lucide-svelte"
  import { trailColour } from "$lib/components/mapnext/palette"
  import type { ReplayState, TrailSuspect } from "./liveEngine"
  import type { TrailInfo } from "./liveData"

  export let trail: TrailInfo
  /** The trails the arrows step through, this one among them. */
  export let list: TrailInfo[] = []
  /** The paddock they all go through, when it is only those. */
  export let scope = ""
  /** Its figures: hectares, distance, how long, how wide. */
  export let facts: { value: string; label: string }[] = []
  /** Who drove it, and what. */
  export let who = ""
  export let replay: ReplayState | null = null
  export let marks: { centre: boolean; arrows: boolean }
  /** The guide is still getting this trail's path. */
  export let busy = false
  export let guest = false
  /** What looks wrong with its GPS, if anything does. */
  export let suspect: TrailSuspect | null = null

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
    /** Back to all of the set together. */
    all: void
    /** Hide its stray GPS on this device (true), or show it again. */
    fix: boolean
  }>()

  const km = (metres: number) =>
    metres >= 1000
      ? `${(metres / 1000).toFixed(1)} km`
      : `${Math.round(metres)} m`
  const took = (seconds: number) =>
    seconds < 90
      ? `${Math.max(1, Math.round(seconds))} second${Math.round(seconds) === 1 ? "" : "s"}`
      : `${Math.round(seconds / 60)} minutes`

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
  // The day of the month first, so a squeezed label still says which day.
  const shortDay = (t: number) => {
    const date = new Date(t)
    return `${date.getDate()} ${date.toLocaleDateString(undefined, { month: "short" })}`
  }

  // ── Folding the card down (a phone) ──
  let short = keptShort
  $: keptShort = short
  let grab: { y: number; id: number; bar: boolean } | null = null
  function gripDown(e: PointerEvent) {
    const target = e.target as Element
    const bar = !!target.closest(".grip")
    // (The heading's own buttons are left to be buttons.)
    if (!bar && target.closest("button")) return
    grab = { y: e.clientY, id: e.pointerId, bar }
    try {
      ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    } catch {
      // (A pointer that can't be held still gets its up and down.)
    }
  }
  function gripUp(e: PointerEvent) {
    if (!grab || grab.id !== e.pointerId) return
    const moved = e.clientY - grab.y
    if (moved > 18) short = true
    else if (moved < -18) short = false
    else if (grab.bar) short = !short
    grab = null
  }

  // Deleting asks for a second tap, as a pin's menu does.
  let armed = false
  let armedTimer: ReturnType<typeof setTimeout>
  let last = trail.id
  $: if (trail.id !== last) {
    last = trail.id
    armed = false
  }
  function remove() {
    if (!armed) {
      armed = true
      clearTimeout(armedTimer)
      armedTimer = setTimeout(() => (armed = false), 2500)
      return
    }
    armed = false
    dispatch("remove")
  }

  /** Ink or white, whichever reads on the trail's colour. */
  function onColour(hex: string) {
    const n = parseInt(hex.replace("#", "").slice(0, 6), 16)
    if (Number.isNaN(n)) return "#15261c"
    const bright =
      (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
    return bright > 0.6 ? "#15261c" : "#ffffff"
  }
  $: colour = trailColour(trail.colour, trail.id)

  // ── The strip: oldest on the left, a block per trail, a label per day ──
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

  // Each block is as wide as its trail was long, then the lot is squeezed
  // to fit the room there is: many trails make thin blocks, not a wide card.
  let room = 0
  const GAP = 2
  const BETWEEN = 13
  const natural = (t: TrailInfo, most: number) =>
    12 + 40 * Math.sqrt(((t.end ?? t.start) - t.start) / most)
  $: wanted = ordered.reduce((sum, t) => sum + natural(t, longest), 0)
  $: spare =
    room -
    16 -
    Math.max(0, days.length - 1) * BETWEEN -
    Math.max(0, ordered.length - days.length) * GAP
  $: squeeze = room && wanted > spare ? Math.max(0.05, spare / wanted) : 1
  $: widthOf = (t: TrailInfo) =>
    Math.max(4, Math.floor(natural(t, longest) * squeeze))

  // Should even the thinnest blocks not fit, the strip scrolls inside
  // itself; the picked block is kept in view.
  let strip: HTMLDivElement | null = null
  // (The element is scrolled through a local name: in Svelte 4, setting a
  // property on `strip` itself would count as changing it and run this
  // again, for ever.)
  function centre(el: HTMLDivElement) {
    const picked = el.querySelector<HTMLElement>("[aria-pressed='true']")
    if (picked && el.scrollWidth > el.clientWidth + 1)
      el.scrollLeft = picked.offsetLeft - el.clientWidth / 2
  }
  $: if (strip && trail.id && squeeze) {
    const el = strip
    tick().then(() => centre(el))
  }
</script>

<div class="mn-card mn-menu mn-trail" class:short style="--accent: {colour}">
  <div
    class="head"
    on:pointerdown={gripDown}
    on:pointerup={gripUp}
    on:pointercancel={() => (grab = null)}
  >
    <button
      type="button"
      class="grip"
      aria-label={short ? "Show the rest of the trail's menu" : "Show less"}
      aria-expanded={!short}
    >
      <i></i>
    </button>
    <span class="mark" style="background: {colour}; color: {onColour(colour)}">
      <Route size={24} />
    </span>
    <div class="about">
      <h2>{who || "Trail"}</h2>
      <p>
        {day(trail.start)} · {clock(trail.start)}{trail.end
          ? ` to ${clock(trail.end)}`
          : ""}
      </p>
    </div>
    {#if ordered.length > 1}
      <span class="count" title="Which trail of the set this is">
        <b>{index + 1}</b> of {ordered.length}
      </span>
    {/if}
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
    <div class="mn-stats">
      {#each facts as fact}
        <div>
          <strong>{fact.value}</strong>
          <span>{fact.label}</span>
        </div>
      {/each}
    </div>
  {/if}

  {#if suspect}
    <!-- ── Its GPS doesn't add up: say so, and offer to hide the worst ── -->
    <div class="sus" class:hidden-strays={suspect.fixed}>
      <p>
        <b><TriangleAlert size={13} /> Suspect GPS</b>
        {#if suspect.fixed}
          The jumps are hidden on this device. Without them it is
          {km(suspect.keptM)} driven, not {km(suspect.totalM)}. Its hectares
          still count them.
        {:else}
          {#if suspect.worst}
            At {clock(suspect.worst.at)} it jumps {km(suspect.worst.metres)} in
            {took(suspect.worst.seconds)}{suspect.strays.length
              ? " and comes back"
              : ""}.
          {/if}
          {km(suspect.jumpM)} of its {km(suspect.totalM)} is jumps, not driving.
        {/if}
      </p>
      <button type="button" on:click={() => dispatch("fix", !suspect?.fixed)}>
        {suspect.fixed ? "Show them" : "Hide the jumps"}
      </button>
    </div>
  {/if}

  {#if ordered.length > 1}
    <!-- ── Where it sits among the others ── -->
    <div class="among">
      <div class="strip-row">
        <button
          type="button"
          class="step"
          aria-label="Older trail"
          on:click={() => dispatch("step", 1)}
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
                    aria-pressed={t.id === trail.id}
                    aria-label="{t.operator || 'Trail'}, {clock(t.start)}"
                    title="{t.operator || 'Trail'} · {clock(t.start)}"
                    style="width: {widthOf(t)}px; --c: {trailColour(
                      t.colour,
                      t.id,
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
          <ChevronRight size={22} />
        </button>
      </div>
    </div>
  {/if}

  <!-- ── Watching it being laid; and the way back to all of them ── -->
  <div class="replay">
    {#if replay && replay.phase !== "loading"}
      <button
        type="button"
        class="play"
        aria-label={replay.phase === "playing"
          ? "Pause the replay"
          : replay.phase === "done"
            ? "Replay again"
            : "Carry on with the replay"}
        on:click={() =>
          replay?.phase === "playing" ? dispatch("pause") : dispatch("play")}
      >
        {#if replay.phase === "playing"}
          <Pause size={22} fill="currentColor" />
        {:else if replay.phase === "done"}
          <RotateCcw size={22} />
        {:else}
          <Play size={22} fill="currentColor" />
        {/if}
      </button>
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
      {#if ordered.length > 1}
        <button
          type="button"
          class="rate all"
          aria-label="All {ordered.length} together{scope
            ? `, through ${scope}`
            : ''}"
          title="All {ordered.length} together"
          on:click={() => dispatch("all")}
        >
          <Layers size={17} />
        </button>
      {/if}
    {:else}
      <button
        type="button"
        class="start"
        disabled={replay?.phase === "loading"}
        on:click={() => dispatch("play")}
      >
        {#if replay?.phase === "loading"}
          <span class="mn-spin"><LoaderCircle size={19} /></span>
        {:else}
          <Play size={18} fill="currentColor" />
        {/if}
        Replay
      </button>
      {#if ordered.length > 1}
        <button
          type="button"
          class="set"
          title={scope ? `Every trail through ${scope}` : null}
          on:click={() => dispatch("all")}
        >
          <Layers size={16} />
          All {ordered.length} together
        </button>
      {/if}
    {/if}
  </div>

  <!-- ── Everything else, one row ── -->
  <div class="tiles">
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
      <button type="button" class="danger" class:armed on:click={remove}>
        <Trash2 size={19} />
        {armed ? "Tap again" : "Delete"}
      </button>
    {/if}
  </div>
</div>

<style>
  .mn-trail .mark {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 46px;
    height: 46px;
    border-radius: 13px;
    box-shadow: 0 0 0 1.5px var(--mn-band-soft);
  }
  .mn-trail h2 {
    font-size: 1.1rem;
  }
  /* Who and when: a line each, cut short before either wraps. */
  .mn-trail .about {
    min-width: 0;
  }
  .mn-trail .about h2,
  .mn-trail .about p {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* The bar to fold the card down by: a phone only. */
  .grip {
    display: none;
  }
  :global(.mn:not(.wide)) .mn-trail .head {
    position: relative;
    touch-action: none;
  }
  :global(.mn:not(.wide)) .mn-trail .grip {
    position: absolute;
    top: -12px;
    left: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 76px;
    height: 22px;
    transform: translateX(-50%);
  }
  .grip i {
    width: 38px;
    height: 4px;
    border-radius: 99px;
    background: var(--mn-band-soft, rgba(244, 241, 230, 0.6));
  }
  :global(.mn:not(.wide)) .mn-trail.short .tiles {
    display: none;
  }
  /* (Which of the set it is: left off a phone, where the date needs the
     room. The strip under it shows the same.) */
  :global(.mn:not(.wide)) .mn-trail .count {
    display: none;
  }
  .count {
    flex-shrink: 0;
    padding: 5px 11px;
    border-radius: 99px;
    background: var(--mn-band-wash);
    font-family: var(--lp-mono);
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--mn-band-text);
    white-space: nowrap;
  }
  /* GPS that doesn't add up: an amber note, and the button that hides it. */
  .sus {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    padding: 9px 10px 9px 12px;
    border-radius: 14px;
    background: rgba(245, 158, 11, 0.16);
    box-shadow: inset 0 0 0 1.5px rgba(217, 119, 6, 0.55);
  }
  .sus p {
    flex: 1;
    min-width: 0;
    margin: 0;
    font-size: 0.84rem;
    line-height: 1.35;
  }
  .sus b {
    display: flex;
    align-items: center;
    gap: 5px;
    font-family: var(--lp-mono);
    font-size: 0.66rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: #d97706;
    text-transform: uppercase;
  }
  .sus button {
    flex-shrink: 0;
    min-height: 40px;
    padding: 0 14px;
    border: 1.5px solid #15261c;
    border-radius: 99px;
    background: #f7db5c;
    font-size: 0.86rem;
    font-weight: 700;
    color: #15261c;
    white-space: nowrap;
  }
  .sus.hidden-strays {
    background: var(--lp-paper);
    box-shadow: inset 0 0 0 1.5px var(--lp-line);
  }
  .sus.hidden-strays button {
    border-color: var(--lp-line);
    background: var(--mn-block, var(--lp-card));
    color: var(--lp-ink);
  }
  .count b {
    font-weight: 800;
    color: var(--mn-band-accent);
  }
  .among {
    display: grid;
    gap: 4px;
    min-width: 0;
  }
  /* Before a replay: Replay, and all of the set together, side by side. */
  .start,
  .set {
    display: inline-flex;
    flex: 1 1 0;
    align-items: center;
    justify-content: center;
    gap: 7px;
    min-width: 0;
    min-height: 44px;
    padding: 0 10px;
    border: 1.5px solid var(--lp-line);
    border-radius: 99px;
    font-size: 0.86rem;
    font-weight: 700;
    color: var(--lp-ink);
    white-space: nowrap;
  }
  .start {
    border-color: var(--lp-ink);
    background: var(--lp-ink);
    font-weight: 800;
    color: var(--lp-paper);
  }
  .start:disabled {
    opacity: 0.7;
  }
  .set:hover {
    border-color: var(--lp-ink);
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
    border: 1.5px solid var(--lp-ink);
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
  /* The label never makes its day wider than its blocks. */
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
  .day button {
    flex-shrink: 0;
    height: 26px;
    border-radius: 4px;
    background: var(--c);
    box-shadow: inset 0 0 0 1px rgba(21, 38, 28, 0.35);
    opacity: 0.4;
  }
  .day button:hover {
    opacity: 0.75;
  }
  .day button[aria-pressed="true"] {
    box-shadow:
      0 0 0 1.5px var(--lp-card),
      0 0 0 3.5px var(--lp-ink);
    opacity: 1;
  }
  .replay {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
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
  .replay .rate.all {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 38px;
    width: 38px;
  }
  .replay {
    gap: 8px;
  }
  .tiles {
    display: grid;
    grid-auto-columns: minmax(0, 1fr);
    grid-auto-flow: column;
    gap: 5px;
  }
  .tiles button {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    min-width: 0;
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
  .tiles .danger.armed {
    border-color: var(--lp-rust);
    background: var(--lp-rust);
    color: #fff;
  }
  .tiles button:disabled {
    opacity: 0.55;
  }
</style>
