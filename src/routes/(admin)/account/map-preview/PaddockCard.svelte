<script lang="ts">
  /**
   * The menu for a picked paddock, with what the current viewer's field
   * panel offers short of redrawing the boundary: its name, what is in it,
   * its colour, which farm it belongs to, and deleting it.
   */
  import { createEventDispatcher } from "svelte"
  import { Check, LandPlot, LocateFixed, Trash2, X } from "lucide-svelte"
  import { formatHa } from "$lib/components/mapnext/format"
  import type { FarmName, Paddock, PaddockPatch } from "./liveData"

  export let paddock: Paddock
  export let farms: FarmName[] = []
  export let guest = false
  /** The viewer is standing in it. */
  export let here = false

  const dispatch = createEventDispatcher<{
    close: void
    change: PaddockPatch
    look: void
    remove: void
  }>()

  // The colours the current viewer's field panel offers; null is its default.
  const COLOURS: (string | null)[] = [
    null,
    "#22c55e",
    "#3b82f6",
    "#FFFF00",
    "#FF0000",
    "#a855f7",
    "#ec4899",
    "#c27219",
  ]

  let name = paddock.name
  let crop = paddock.crop
  let last = paddock.id
  let deleting = false
  $: if (paddock.id !== last) {
    last = paddock.id
    name = paddock.name
    crop = paddock.crop
    deleting = false
  }
  $: changed =
    (name.trim() && name.trim() !== paddock.name) ||
    crop.trim() !== paddock.crop

  function save() {
    const change: PaddockPatch = {}
    if (name.trim() && name.trim() !== paddock.name) change.name = name.trim()
    if (crop.trim() !== paddock.crop) change.crop = crop.trim()
    if (Object.keys(change).length) dispatch("change", change)
  }
</script>

<div class="mn-card mn-menu">
  <div class="head">
    <span class="art"><LandPlot size={28} /></span>
    <div class="about">
      <h2>{paddock.name}</h2>
      <p>
        {[
          ...(paddock.ha > 0 ? [`${formatHa(paddock.ha)} ha`] : []),
          ...(paddock.crop ? [paddock.crop] : []),
          ...(paddock.farm ? [paddock.farm] : []),
          ...(here ? ["You're in it"] : []),
        ].join(" · ") || "Paddock"}
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

  {#if deleting}
    <p class="mn-warning">
      Delete {paddock.name} for good? Its boundary goes with it and can't be brought
      back; you'd have to draw it again.
    </p>
    <div class="mn-card-actions">
      <button
        type="button"
        class="lp-btn lp-btn-ghost"
        on:click={() => (deleting = false)}
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
    {#if !guest}
      <div
        class="mn-swatches"
        style="--across: 8"
        role="group"
        aria-label="Paddock colour"
      >
        {#each COLOURS as colour}
          <button
            type="button"
            class:selected={(paddock.colour ?? "").toLowerCase() ===
              (colour ?? "").toLowerCase()}
            class:none={!colour}
            style="--swatch: {colour ?? '#ffffff'}"
            aria-label={colour ? `Colour ${colour}` : "No colour"}
            on:click={() => dispatch("change", { colour })}
          ></button>
        {/each}
      </div>

      <div class="mn-fields">
        <label>
          <span class="lp-eyebrow">Name</span>
          <input type="text" bind:value={name} maxlength="60" />
        </label>
        <label>
          <span class="lp-eyebrow">What's in it</span>
          <input
            type="text"
            bind:value={crop}
            maxlength="60"
            placeholder="Wheat, canola, hay…"
          />
        </label>
        {#if farms.length > 1}
          <label>
            <span class="lp-eyebrow">Farm</span>
            <select
              value={paddock.farmId ?? ""}
              on:change={(e) =>
                e.currentTarget.value &&
                dispatch("change", { farmId: e.currentTarget.value })}
            >
              {#if !paddock.farmId}<option value="">No farm</option>{/if}
              {#each farms as farm (farm.id)}
                <option value={farm.id}>{farm.name}</option>
              {/each}
            </select>
          </label>
        {/if}
      </div>
      {#if changed}
        <button type="button" class="lp-btn lp-btn-primary" on:click={save}>
          <Check size={18} strokeWidth={3} /> Save
        </button>
      {/if}
    {/if}

    <div class="mn-menu-actions">
      <button type="button" on:click={() => dispatch("look")}>
        <LocateFixed size={18} /> Show it all
      </button>
      {#if !guest}
        <button type="button" class="danger" on:click={() => (deleting = true)}>
          <Trash2 size={18} /> Delete
        </button>
      {/if}
    </div>
  {/if}
</div>
