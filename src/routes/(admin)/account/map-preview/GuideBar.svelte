<script lang="ts">
  /**
   * Following a trail that has already been driven. One glance says which
   * way the line is and how far, what the path does next, and how much is
   * left. Tapping the words opens the few choices there are: follow it the
   * other way round, and begin at its start or at the nearest point.
   *
   * A phone knows where it is to a few metres. This keeps a machine on a
   * path; it does not steer it to the centimetre, and it says so.
   */
  import { createEventDispatcher } from "svelte"
  import {
    ArrowUp,
    ChevronDown,
    CornerUpLeft,
    CornerUpRight,
    Flag,
    Repeat,
    X,
  } from "lucide-svelte"
  import { formatDistance } from "$lib/components/mapnext/format"
  import type { Guide } from "./liveEngine"

  export let guide: Guide
  /** Which trail: its day and who drove it. */
  export let label = ""

  const dispatch = createEventDispatcher<{
    stop: void
    round: void
    start: boolean
  }>()

  /** Within this of the line counts as on it: a phone can't say better. */
  const ON = 2
  /** The marker reaches the end of the bar this far off. */
  const FULL = 12

  let open = false

  $: off = Math.abs(guide.offset)
  $: side = guide.offset < 0 ? "left" : "right"
  $: tone =
    guide.phase === "done" || (guide.phase === "on" && off < ON)
      ? "good"
      : guide.phase === "on" && off < 6
        ? "near"
        : guide.phase === "on" || guide.phase === "away"
          ? "far"
          : "idle"
  $: headline =
    guide.phase === "loading"
      ? "Getting the path…"
      : guide.phase === "waiting"
        ? "Waiting for your position"
        : guide.phase === "done"
          ? "End of the trail"
          : guide.phase === "away" && guide.away
            ? `${formatDistance(guide.away.metres)} to ${
                guide.toStart ? "the start" : "the line"
              }`
            : off < ON
              ? "On the line"
              : `Steer ${side} ${Math.round(off)} m`
  $: turning = guide.turn
    ? guide.turn.metres < 15
      ? `${guide.turn.back ? "Turn round" : "Turn"} ${guide.turn.side} now`
      : `${guide.turn.back ? "Turn round" : "Turn"} ${guide.turn.side} in ${formatDistance(guide.turn.metres)}`
    : "Straight on"
  $: toGo =
    guide.total > 0
      ? `${formatDistance(guide.left)} to go · ${Math.round(
          (1 - guide.left / guide.total) * 100,
        )}%`
      : ""
  // Where the line sits on the bar: the middle is the machine.
  $: mark = 50 + (Math.max(-FULL, Math.min(FULL, guide.offset)) / FULL) * 46
  // The choices show without asking while there is something to decide.
  $: choices =
    open ||
    guide.against ||
    guide.phase === "away" ||
    guide.phase === "waiting" ||
    guide.phase === "done"
</script>

<div class="mn-guide {tone}" role="status" aria-live="off">
  <div class="top">
    <button
      type="button"
      class="say"
      aria-expanded={choices}
      on:click={() => (open = !open)}
    >
      <span class="lp-eyebrow">
        Following{label ? ` · ${label}` : ""}{guide.reversed
          ? " · other way"
          : ""}
      </span>
      <span class="head">
        {#if guide.phase === "away" && guide.away}
          <span
            class="point"
            style="transform: rotate({guide.away.screen.toFixed(0)}deg)"
            aria-hidden="true"
          >
            <ArrowUp size={24} strokeWidth={3} />
          </span>
        {/if}
        <strong>{headline}</strong>
        <span class="more" class:open={choices}><ChevronDown size={18} /></span>
      </span>
    </button>
    <button
      type="button"
      class="mn-icon-button"
      aria-label="Stop following this trail"
      on:click={() => dispatch("stop")}
    >
      <X size={22} />
    </button>
  </div>

  {#if guide.phase === "on"}
    <!-- The middle is the machine; the mark is the line. -->
    <div class="bar" aria-hidden="true">
      <i class="me"></i>
      <i class="line" style="left: {mark.toFixed(1)}%"></i>
    </div>
    <p class="next">
      {#if guide.turn}
        {#if guide.turn.side === "left"}
          <CornerUpLeft size={18} strokeWidth={2.6} />
        {:else}
          <CornerUpRight size={18} strokeWidth={2.6} />
        {/if}
      {/if}
      <b>{turning}</b>
      <span>{toGo}</span>
    </p>
  {:else if guide.phase === "away" && toGo}
    <p class="next"><span>{toGo}</span></p>
  {/if}

  {#if guide.against}
    <p class="warn">You're going the other way to this guide.</p>
  {/if}

  {#if choices && guide.phase !== "loading"}
    <div class="moves">
      <button
        type="button"
        class:strong={guide.against}
        on:click={() => dispatch("round")}
      >
        <Repeat size={16} /> Other way
      </button>
      <button type="button" on:click={() => dispatch("start", !guide.toStart)}>
        <Flag size={16} />
        {guide.toStart ? "From the nearest point" : "From the start"}
      </button>
    </div>
    <p class="fine">
      {guide.accuracy !== null
        ? `Position good to about ${Math.max(1, Math.round(guide.accuracy))} m. `
        : ""}A guide for keeping to the path, not for steering to the
      centimetre.
    </p>
  {/if}
</div>
