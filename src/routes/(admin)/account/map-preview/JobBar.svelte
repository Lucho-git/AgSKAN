<script lang="ts">
  /**
   * Across the top of the map while a job is being put together: what a tap
   * on the map does right now (and to which step), and the other things a
   * step can point at, a button each: a line to follow, an area, where you
   * are, where someone on the crew is.
   */
  import { createEventDispatcher } from "svelte"
  import {
    LocateFixed,
    Pentagon,
    Pointer,
    Spline,
    Users,
    X,
  } from "lucide-svelte"

  /** The step being added to (from 1), and how many there are. */
  export let step = 1
  export let steps = 1
  /** How many places that step has so far. */
  export let count = 0
  /** The viewer has a position. */
  export let hasFix = false
  /** Crew whose position is known. */
  export let crew: { id: string; name: string }[] = []

  const dispatch = createEventDispatcher<{
    line: void
    area: void
    me: void
    crew: string
  }>()
  let choosing = false
</script>

<div class="mn-jobbar">
  <p>
    <span class="tap"><Pointer size={20} /></span>
    <span>
      <b>Tap a paddock or a pin</b>
      to add it{steps > 1 ? ` to step ${step}` : " to the job"}.
      <small
        >{count
          ? `${count} added. Tap one again to take it off.`
          : "Tap it again to take it off."}</small
      >
    </span>
  </p>
  {#if choosing}
    <div class="adds">
      <span>Whose spot?</span>
      {#each crew as person (person.id)}
        <button
          type="button"
          on:click={() => {
            choosing = false
            dispatch("crew", person.id)
          }}
        >
          {person.name}
        </button>
      {/each}
      <button
        type="button"
        class="quiet"
        aria-label="Back"
        on:click={() => (choosing = false)}
      >
        <X size={16} />
      </button>
    </div>
  {:else}
    <div class="adds">
      <span>Or add</span>
      <button type="button" on:click={() => dispatch("line")}>
        <Spline size={16} /> A line to follow
      </button>
      <button type="button" on:click={() => dispatch("area")}>
        <Pentagon size={16} /> An area
      </button>
      {#if hasFix}
        <button type="button" on:click={() => dispatch("me")}>
          <LocateFixed size={16} /> Where I am
        </button>
      {/if}
      {#if crew.length}
        <button type="button" on:click={() => (choosing = true)}>
          <Users size={16} /> Where someone is
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .mn-jobbar {
    display: grid;
    gap: 8px;
    max-width: min(36rem, calc(100vw - 2 * var(--mn-gap, 12px)));
    padding: 10px 12px;
    border-radius: 18px;
    background: #15261c;
    box-shadow:
      0 0 0 2px #f7db5c,
      0 14px 30px -14px rgba(0, 0, 0, 0.7);
    color: #f4f1e6;
  }
  p {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 0.98rem;
    line-height: 1.3;
  }
  p b {
    font-weight: 800;
    color: #f7db5c;
  }
  p small {
    display: block;
    font-size: 0.78rem;
    color: rgba(244, 241, 230, 0.7);
  }
  .tap {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    border-radius: 50%;
    background: #f7db5c;
    color: #15261c;
    animation: tap 1.6s ease-in-out infinite;
  }
  @keyframes tap {
    0%,
    100% {
      box-shadow: 0 0 0 0 rgba(247, 219, 92, 0.6);
    }
    50% {
      box-shadow: 0 0 0 9px rgba(247, 219, 92, 0);
      transform: scale(0.92);
    }
  }
  .adds {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .adds > span {
    font-family: var(--lp-mono);
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: rgba(244, 241, 230, 0.6);
    text-transform: uppercase;
  }
  .adds button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 38px;
    padding: 0 12px;
    border: 1.5px solid rgba(244, 241, 230, 0.35);
    border-radius: 99px;
    font-size: 0.86rem;
    font-weight: 700;
    color: #f4f1e6;
  }
  .adds button:hover {
    border-color: #f7db5c;
    color: #f7db5c;
  }
  .adds .quiet {
    padding: 0 10px;
  }
  @media (prefers-reduced-motion: reduce) {
    .tap {
      animation: none;
    }
  }
</style>
