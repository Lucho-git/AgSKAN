<script lang="ts">
  /**
   * Changing a line or an area that is drawn on a pin or kept on a paddock.
   * It works the way drawing it did: a tap on the map adds a point to the
   * end, Undo takes the last change back, and a corner can be dragged to
   * move it. Its colour is changed here too. Nothing changes until Save.
   */
  import { createEventDispatcher } from "svelte"
  import { Check, Hand, Undo2, X } from "lucide-svelte"
  import ShapeArt from "$lib/components/mapnext/ShapeArt.svelte"
  import { formatDistance, formatHa } from "$lib/components/mapnext/format"
  import type { BoundaryEdit } from "./liveEngine"
  import { DRAWING_COLOURS } from "./liveData"

  export let edit: BoundaryEdit

  const dispatch = createEventDispatcher<{
    colour: string
    undo: void
    cancel: void
    save: void
  }>()

  $: line = edit.shape?.kind === "line"
  $: colour = edit.shape?.colour ?? DRAWING_COLOURS[0]
  $: ring = edit.polygons[0]?.[0] ?? []
  // Its own colour is offered even if it isn't one of the usual six.
  $: colours = DRAWING_COLOURS.includes(colour)
    ? DRAWING_COLOURS
    : [colour, ...DRAWING_COLOURS]
</script>

<div class="mn-card mn-menu mn-boundary">
  <div class="head">
    <span class="art">
      {#if line}
        <ShapeArt line={ring.slice(0, -1)} {colour} size={44} />
      {:else}
        <ShapeArt polygons={edit.polygons} {colour} size={44} />
      {/if}
    </span>
    <div class="about">
      <p class="lp-eyebrow">Changing the {line ? "line" : "area"}</p>
      <h2>
        {line
          ? formatDistance(edit.shape?.metres ?? 0)
          : `${formatHa(edit.ha)} ha`}
      </h2>
      <p>{edit.shape?.corners ?? 0} points</p>
    </div>
    <button
      type="button"
      class="mn-icon-button"
      aria-label="Leave without saving"
      on:click={() => dispatch("cancel")}
    >
      <X size={22} />
    </button>
  </div>

  <p class="mn-move-hint">
    <Hand size={17} /> Tap the map to add a point, or drag one to move it.
  </p>

  <div
    class="mn-swatches"
    style="--across: {colours.length}"
    role="group"
    aria-label="Colour"
  >
    {#each colours as option}
      <button
        type="button"
        class:selected={colour.toLowerCase() === option.toLowerCase()}
        style="--swatch: {option}"
        aria-label="Colour {option}"
        aria-pressed={colour.toLowerCase() === option.toLowerCase()}
        on:click={() => dispatch("colour", option)}
      ></button>
    {/each}
  </div>

  <div class="mn-card-actions three">
    <button
      type="button"
      class="lp-btn lp-btn-ghost"
      disabled={!edit.steps}
      on:click={() => dispatch("undo")}
    >
      <Undo2 size={17} /> Undo
    </button>
    <button
      type="button"
      class="lp-btn lp-btn-ghost"
      on:click={() => dispatch("cancel")}
    >
      Cancel
    </button>
    <button
      type="button"
      class="lp-btn lp-btn-primary"
      disabled={!edit.changed || edit.saving}
      on:click={() => dispatch("save")}
    >
      <Check size={18} strokeWidth={3} />
      {edit.saving ? "Saving…" : "Save"}
    </button>
  </div>
</div>
