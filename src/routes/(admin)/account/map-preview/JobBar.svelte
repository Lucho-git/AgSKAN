<script lang="ts">
  /**
   * Across the top of the map while a job is being put together: one line
   * saying what a tap on the map does right now (and to which step), and
   * one button that opens the other things a step can point at: a line to
   * follow, an area, where you are, where someone on the crew is.
   */
  import { createEventDispatcher } from "svelte"
  import Dropdown from "$lib/components/mapnext/Dropdown.svelte"
  import {
    ChevronDown,
    LocateFixed,
    Pentagon,
    Plus,
    Pointer,
    Spline,
    Users,
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
  let open = false
  function pick(what: "line" | "area" | "me") {
    open = false
    dispatch(what)
  }
</script>

<svelte:window
  on:keydown={(e) => e.key === "Escape" && (open = false)}
  on:click={() => (open = false)}
/>

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
<div class="mn-jobbar" on:click|stopPropagation>
  <span class="tap"><Pointer size={18} /></span>
  <p>
    <b>Tap a paddock or a pin</b>
    to add it{steps > 1 ? ` to step ${step}` : ""}{count
      ? ` · ${count} added`
      : ""}
  </p>
  <button
    type="button"
    class="other"
    aria-haspopup="menu"
    aria-expanded={open}
    on:click={() => (open = !open)}
  >
    <Plus size={16} strokeWidth={3} /> Other <ChevronDown size={15} />
  </button>
  {#if open}
    <div class="menu" role="menu">
      <button type="button" role="menuitem" on:click={() => pick("line")}>
        <Spline size={18} /> A line to follow
      </button>
      <button type="button" role="menuitem" on:click={() => pick("area")}>
        <Pentagon size={18} /> An area
      </button>
      {#if hasFix}
        <button type="button" role="menuitem" on:click={() => pick("me")}>
          <LocateFixed size={18} /> Where I am
        </button>
      {/if}
      {#if crew.length}
        <Dropdown
          look="item"
          title="Whose spot?"
          options={crew.map((person) => ({
            value: person.id,
            label: person.name,
          }))}
          on:change={(e) => {
            open = false
            dispatch("crew", e.detail)
          }}
        >
          <Users size={18} /> Where someone is
        </Dropdown>
      {/if}
    </div>
  {/if}
</div>

<style>
  .mn-jobbar {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    max-width: min(34rem, calc(100vw - 2 * var(--mn-gap, 12px)));
    padding: 7px 8px 7px 9px;
    border-radius: 99px;
    background: #15261c;
    box-shadow:
      0 0 0 2px #f7db5c,
      0 14px 30px -14px rgba(0, 0, 0, 0.7);
    color: #f4f1e6;
  }
  p {
    flex: 1;
    min-width: 0;
    font-size: 0.92rem;
    line-height: 1.25;
  }
  p b {
    font-weight: 800;
    color: #f7db5c;
  }
  .tap {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
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
      box-shadow: 0 0 0 8px rgba(247, 219, 92, 0);
      transform: scale(0.92);
    }
  }
  .other {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    gap: 5px;
    min-height: 38px;
    padding: 0 11px;
    border: 1.5px solid rgba(244, 241, 230, 0.4);
    border-radius: 99px;
    font-size: 0.86rem;
    font-weight: 700;
    color: #f4f1e6;
  }
  .other[aria-expanded="true"],
  .other:hover {
    border-color: #f7db5c;
    color: #f7db5c;
  }
  .menu {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    z-index: 2;
    display: grid;
    min-width: 230px;
    padding: 6px;
    border-radius: 16px;
    background: #15261c;
    box-shadow:
      0 0 0 1.5px rgba(244, 241, 230, 0.25),
      0 18px 34px -12px rgba(0, 0, 0, 0.75);
  }
  .menu button {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 46px;
    padding: 0 12px;
    border-radius: 11px;
    font-size: 0.95rem;
    font-weight: 700;
    color: #f4f1e6;
    text-align: left;
    cursor: pointer;
  }
  .menu button:hover {
    background: rgba(244, 241, 230, 0.1);
  }
  @media (prefers-reduced-motion: reduce) {
    .tap {
      animation: none;
    }
  }
</style>
