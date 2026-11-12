<script lang="ts">
  /**
   * Choose what you're driving: the machine, its colour and, for machines
   * that work a paddock, how wide they work. Used when joining a map and
   * from the toolbox.
   */
  import { createEventDispatcher } from "svelte"
  import { Minus, Plus } from "lucide-svelte"
  import vehicles from "$lib/vehicles"
  import {
    MACHINE_CATALOGUE,
    MACHINE_GROUPS,
    machineFor,
    type VehicleType,
  } from "./machines"
  import { VEHICLE_PALETTE, drawColour, findColour } from "./palette"

  /** Saved machine type (`vehicle_marker.type`). */
  export let type: string
  /** Saved colour name (`vehicle_marker.bodyColor`). */
  export let colour: string
  /** Working width in metres. */
  export let swath: number
  /** Show every machine, or just the current group with a way to see more. */
  export let compact = false

  const dispatch = createEventDispatcher<{
    change: { type: VehicleType; colour: string; swath: number }
  }>()

  $: current = machineFor(type)
  $: paint = drawColour(colour)
  $: selectedColour = findColour(colour)?.id ?? null
  $: selectedLabel = findColour(colour)?.label ?? ""
  let showAll = false
  $: groups = MACHINE_GROUPS.filter(
    (group) => !compact || showAll || group === current.group,
  ).map((group) => ({
    group,
    machines: MACHINE_CATALOGUE.filter((m) => m.group === group),
  }))

  function chooseType(next: VehicleType) {
    if (next === current.type) return
    // A different machine starts from its own usual working width.
    dispatch("change", { type: next, colour, swath: machineFor(next).swath })
  }
  function chooseColour(id: string) {
    dispatch("change", { type: current.type, colour: id, swath })
  }
  function nudge(by: number) {
    const next = Math.min(60, Math.max(2, Math.round(swath + by)))
    if (next !== swath)
      dispatch("change", { type: current.type, colour, swath: next })
  }
</script>

<div class="mn-machine-picker">
  <div class="colours">
    <span class="lp-eyebrow">
      Colour{#if selectedLabel}<b>{selectedLabel}</b>{/if}
    </span>
    <div class="swatches">
      {#each VEHICLE_PALETTE as option}
        <button
          type="button"
          class="swatch"
          class:selected={selectedColour === option.id}
          style="--swatch: {option.value}"
          aria-label={option.label}
          aria-pressed={selectedColour === option.id}
          on:click={() => chooseColour(option.id)}
        ></button>
      {/each}
    </div>
  </div>

  {#each groups as { group, machines } (group)}
    <div class="group">
      <span class="lp-eyebrow">{group}</span>
      <div class="machines">
        {#each machines as option (option.type)}
          <button
            type="button"
            class="machine"
            class:selected={current.type === option.type}
            aria-pressed={current.type === option.type}
            on:click={() => chooseType(option.type)}
          >
            <span class="art">
              <svelte:component
                this={vehicles[option.type]}
                size="46px"
                bodyColor={current.type === option.type ? paint : "#9AA39B"}
                outlineColor="#ffffff"
                wheelColor="#15261C"
                loadColor="#F7DB5C"
              />
            </span>
            <span class="name">{option.label}</span>
          </button>
        {/each}
      </div>
    </div>
  {/each}
  {#if compact && !showAll}
    <button type="button" class="more" on:click={() => (showAll = true)}>
      Something else? Show every machine
    </button>
  {/if}

  <div class="width">
    <span class="about">
      <span class="lp-eyebrow">Working width</span>
      <span class="note">
        {current.paints
          ? "How wide a trail it paints"
          : "Only if you start a trail in it"}
      </span>
    </span>
    <span class="stepper">
      <button
        type="button"
        aria-label="Narrower"
        disabled={swath <= 2}
        on:click={() => nudge(-1)}><Minus size={20} /></button
      >
      <b>{swath}<small>m</small></b>
      <button
        type="button"
        aria-label="Wider"
        disabled={swath >= 60}
        on:click={() => nudge(1)}><Plus size={20} /></button
      >
    </span>
  </div>
</div>

<style>
  .mn-machine-picker {
    display: grid;
    gap: 0.9rem;
  }
  /* The name of the colour that is picked, beside the heading. */
  .colours .lp-eyebrow b {
    margin-left: 0.6em;
    padding: 0.15em 0.6em;
    border-radius: 99px;
    background: var(--lp-ink);
    color: var(--lp-paper);
    font-weight: 700;
  }
  .colours,
  .group {
    display: grid;
    gap: 0.45rem;
  }
  /* Nine across, whatever the width: they share the row. */
  .swatches {
    display: grid;
    grid-template-columns: repeat(9, minmax(0, 1fr));
    gap: 0.25rem;
    max-width: 25.4rem;
  }
  .swatch {
    width: 100%;
    aspect-ratio: 1;
    border: 3px solid var(--lp-card);
    border-radius: 50%;
    background: var(--swatch);
    box-shadow: 0 0 0 1.5px var(--lp-line);
  }
  .swatch.selected {
    box-shadow: 0 0 0 2.5px var(--lp-ink);
  }
  .machines {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.4rem;
  }
  .machine {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.1rem;
    padding: 0.4rem 0.25rem 0.5rem;
    border: 1.5px solid var(--lp-line);
    border-radius: 1rem;
    background: var(--lp-card);
    color: var(--lp-ink);
  }
  .machine.selected {
    border-color: var(--lp-ink);
    box-shadow: inset 0 0 0 1.5px var(--lp-ink);
  }
  .art {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 50px;
  }
  .name {
    font-size: 0.78rem;
    font-weight: 600;
    line-height: 1.15;
    text-align: center;
    text-wrap: balance;
  }
  .more {
    min-height: 2.75rem;
    font-size: 0.9rem;
    font-weight: 700;
    color: var(--lp-ink);
    text-align: left;
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .width {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
    padding: 0.5rem 0.5rem 0.5rem 0.8rem;
    border-radius: 1rem;
    background: var(--lp-paper);
    box-shadow: 0 0 0 1px var(--lp-line);
  }
  .about {
    display: grid;
    gap: 0.1rem;
  }
  .note {
    font-size: 0.85rem;
    line-height: 1.35;
    color: var(--lp-ink-soft);
  }
  .stepper {
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }
  .stepper button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 46px;
    height: 46px;
    border-radius: 50%;
    background: var(--lp-card);
    color: var(--lp-ink);
    box-shadow: 0 0 0 1.5px var(--lp-line);
  }
  .stepper button:disabled {
    opacity: 0.4;
  }
  .stepper b {
    min-width: 3.4rem;
    font-family: var(--lp-display);
    font-size: 1.7rem;
    font-weight: 800;
    letter-spacing: -0.02em;
    line-height: 1;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .stepper small {
    margin-left: 2px;
    font-family: var(--lp-mono);
    font-size: 0.7rem;
    font-weight: 500;
    color: var(--lp-ink-faint);
  }
  button:focus-visible {
    outline: 2px solid var(--lp-accent-text);
    outline-offset: 2px;
  }
</style>
