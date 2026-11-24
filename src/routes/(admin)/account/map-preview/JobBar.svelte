<script lang="ts">
  /**
   * The feed at the top centre of the map while a job is being put
   * together: what a tap on the map does right now, to match the tab that
   * is chosen on the step in the job's card below. Tapping places, it says
   * so; drawing an area or a line, it counts the points and offers Undo
   * and Add.
   */
  import { createEventDispatcher } from "svelte"
  import { Check, Pentagon, Pointer, Spline, Undo2 } from "lucide-svelte"

  /** The step being added to (from 1), and how many there are. */
  export let step = 1
  export let steps = 1
  /** What a tap does: adds a place, or a corner of an area or a line. */
  export let mode: "place" | "area" | "line" = "place"
  /** While drawing: how many points are down, and how big it is so far. */
  export let points = 0
  export let size = ""
  /** There is enough drawn to add. */
  export let ready = false

  const dispatch = createEventDispatcher<{ undo: void; add: void }>()

  $: target = steps > 1 ? `step ${step}` : "the job"
</script>

<div class="mn-feed" role="status">
  <span class="tap">
    {#if mode === "area"}
      <Pentagon size={18} />
    {:else if mode === "line"}
      <Spline size={18} />
    {:else}
      <Pointer size={18} />
    {/if}
  </span>
  <p>
    {#if mode === "place"}
      <b>Tap a paddock or a pin</b>
      <small>It is added to {target}</small>
    {:else}
      <b>
        {mode === "area" ? "Tap round the area" : "Tap along the line"}
      </b>
      <small>
        {points
          ? `${points} ${points === 1 ? "point" : "points"}${size ? ` · ${size}` : ""}`
          : `For ${target}`}
      </small>
    {/if}
  </p>
  {#if mode !== "place"}
    <button
      type="button"
      aria-label="Take the last point back"
      disabled={!points}
      on:click={() => dispatch("undo")}
    >
      <Undo2 size={17} />
    </button>
    <button
      type="button"
      class="go"
      disabled={!ready}
      on:click={() => dispatch("add")}
    >
      <Check size={17} strokeWidth={3} /> Add
    </button>
  {/if}
</div>

<style>
  /* Drawn like the job's card below it, so the two read as one thing. */
  .mn-feed {
    display: flex;
    align-items: center;
    gap: 10px;
    max-width: calc(100vw - 24px);
    padding: 7px 8px;
    border-radius: 99px;
    background: var(--lp-card);
    box-shadow:
      0 0 0 1.5px var(--lp-ink),
      0 12px 26px -12px rgba(10, 25, 15, 0.7);
    color: var(--lp-ink);
  }
  .tap {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--lp-yellow);
    color: #15261c;
    animation: tap 1.6s ease-in-out infinite;
  }
  @keyframes tap {
    0%,
    100% {
      box-shadow: 0 0 0 0 rgba(247, 219, 92, 0.7);
    }
    50% {
      box-shadow: 0 0 0 8px rgba(247, 219, 92, 0);
      transform: scale(0.93);
    }
  }
  p {
    display: grid;
    min-width: 0;
    padding-right: 8px;
    line-height: 1.2;
  }
  p b {
    font-size: 0.95rem;
    font-weight: 800;
    white-space: nowrap;
  }
  p small {
    font-size: 0.74rem;
    color: var(--lp-ink-soft);
    white-space: nowrap;
  }
  button {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    gap: 5px;
    min-width: 40px;
    height: 40px;
    padding: 0 10px;
    border: 1.5px solid var(--lp-line);
    border-radius: 99px;
    font-size: 0.88rem;
    font-weight: 800;
    color: var(--lp-ink);
  }
  button.go {
    padding: 0 14px;
    border-color: var(--lp-ink);
    background: var(--lp-yellow);
    color: #15261c;
  }
  button:disabled {
    opacity: 0.45;
  }
  @media (prefers-reduced-motion: reduce) {
    .tap {
      animation: none;
    }
  }
</style>
