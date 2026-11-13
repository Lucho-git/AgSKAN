<script lang="ts">
  /**
   * The menu for your own machine, picked on the map: its colour and how
   * wide it works, changed in place, with the way through to the full
   * machine list.
   */
  import { createEventDispatcher } from "svelte"
  import { Minus, Plus, X } from "lucide-svelte"
  import vehicles from "$lib/vehicles"
  import { machineFor } from "$lib/components/mapnext/machines"
  import {
    VEHICLE_PALETTE,
    drawColour,
    findColour,
  } from "$lib/components/mapnext/palette"
  import type { VehicleMarkerData } from "./liveData"

  export let marker: VehicleMarkerData
  /** A trail is running: it keeps the colour and width it started with. */
  export let locked = false
  /** What the trail being laid has done so far, in words. */
  export let trailing = ""

  const dispatch = createEventDispatcher<{
    close: void
    change: { type: string; colour: string; swath: number }
    machine: void
  }>()

  // The widths the current viewer offers as one-tap choices.
  const WIDTHS = [4, 8, 12, 18, 24, 36, 50]

  $: machine = machineFor(marker.type)
  $: picked = findColour(marker.bodyColor)

  const set = (patch: { colour?: string; swath?: number }) =>
    dispatch("change", {
      type: marker.type,
      colour: patch.colour ?? marker.bodyColor,
      swath: Math.min(60, Math.max(2, patch.swath ?? marker.swath)),
    })
</script>

<div class="mn-card mn-menu">
  <div class="head">
    <span class="art">
      <svelte:component
        this={vehicles[machine.type]}
        size="44px"
        bodyColor={drawColour(marker.bodyColor)}
        outlineColor="#ffffff"
        wheelColor="#15261C"
        loadColor="#F7DB5C"
      />
    </span>
    <div class="about">
      <h2>You</h2>
      <p>
        {machine.label} · {picked?.label ?? "Custom colour"} · {marker.swath} m wide
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

  {#if trailing}
    <p class="mn-trailing"><i></i>{trailing}</p>
  {/if}
  {#if locked}
    <p class="mn-warning">
      A trail keeps the machine, colour and width it started with. Stop the
      trail to change them.
    </p>
  {:else}
    <div
      class="mn-swatches"
      style="--across: 9"
      role="group"
      aria-label="Machine colour"
    >
      {#each VEHICLE_PALETTE as option}
        <button
          type="button"
          class:selected={picked?.id === option.id}
          style="--swatch: {option.value}"
          aria-label={option.label}
          aria-pressed={picked?.id === option.id}
          on:click={() =>
            picked?.id !== option.id && set({ colour: option.id })}
        ></button>
      {/each}
    </div>

    <div class="mn-width">
      <span class="lp-eyebrow">Working width</span>
      <span class="stepper">
        <button
          type="button"
          aria-label="Narrower"
          disabled={marker.swath <= 2}
          on:click={() => set({ swath: marker.swath - 1 })}
          ><Minus size={20} /></button
        >
        <b>{marker.swath}<small>m</small></b>
        <button
          type="button"
          aria-label="Wider"
          disabled={marker.swath >= 60}
          on:click={() => set({ swath: marker.swath + 1 })}
          ><Plus size={20} /></button
        >
      </span>
    </div>
    <div class="mn-chips" role="group" aria-label="Common widths">
      {#each WIDTHS as width}
        <button
          type="button"
          aria-pressed={marker.swath === width}
          on:click={() => marker.swath !== width && set({ swath: width })}
          >{width} m</button
        >
      {/each}
    </div>

    <button
      type="button"
      class="lp-btn lp-btn-ghost"
      on:click={() => dispatch("machine")}
    >
      Change machine
    </button>
  {/if}
</div>
