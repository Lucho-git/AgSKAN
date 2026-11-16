<script lang="ts">
  /**
   * Changing a paddock's boundary. On the map every corner has a handle to
   * drag, and a small dot sits between corners to drag out into a new one.
   * From here ground can be cut out (a hole, or a bite off the edge) or
   * added (joined on, or as a separate piece of the same paddock).
   *
   * Nothing changes on the farm until Save, every step can be stepped back,
   * and a saved change can be put back afterwards.
   */
  import { createEventDispatcher } from "svelte"
  import {
    Check,
    Hand,
    History,
    Minus,
    Plus,
    RotateCcw,
    Trash2,
    Undo2,
    X,
  } from "lucide-svelte"
  import ShapeArt from "$lib/components/mapnext/ShapeArt.svelte"
  import { formatHa } from "$lib/components/mapnext/format"
  import type { BoundaryEdit } from "./liveEngine"

  export let edit: BoundaryEdit
  /** The paddock's colour, for the picture of it. */
  export let colour: string | null = null
  /** When its boundary was last changed, if there is one to bring back. */
  export let priorAt: number | null = null

  const dispatch = createEventDispatcher<{
    add: "hole" | "piece"
    undoPoint: void
    cancelAdd: void
    doneAdd: void
    removeCorner: void
    removeRing: void
    undo: void
    reset: void
    prior: void
    cancel: void
    save: void
  }>()

  const when = (t: number) =>
    new Date(t).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
    })

  $: change = edit.ha - edit.was
  $: facts = [
    `${formatHa(edit.ha)} ha`,
    ...(Math.abs(change) >= 0.05
      ? [`${formatHa(Math.abs(change))} ha ${change > 0 ? "more" : "less"}`]
      : []),
    ...(edit.pieces > 1 ? [`${edit.pieces} pieces`] : []),
    ...(edit.holes
      ? [`${edit.holes} ${edit.holes === 1 ? "hole" : "holes"}`]
      : []),
  ]
</script>

<div class="mn-card mn-menu mn-boundary">
  <div class="head">
    <span class="art">
      <ShapeArt polygons={edit.polygons} {colour} size={44} />
    </span>
    <div class="about">
      <p class="lp-eyebrow">Changing the boundary</p>
      <h2>{edit.name}</h2>
      <p>{facts.join(" · ")}</p>
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

  {#if edit.adding}
    <p class="mn-move-hint">
      <Hand size={17} />
      {edit.adding.kind === "hole"
        ? "Tap round the ground to take out"
        : "Tap round the ground to add"}
    </p>
    <p class="mn-note">
      {edit.adding.kind === "hole"
        ? "Inside the paddock it becomes a hole. Across the edge, it takes a bite out of it."
        : "Touching the paddock, it joins on. Apart from it, it becomes another piece of the same paddock."}
    </p>
    <div class="mn-card-actions three">
      <button
        type="button"
        class="lp-btn lp-btn-ghost"
        disabled={!edit.adding.points}
        on:click={() => dispatch("undoPoint")}
      >
        Undo
      </button>
      <button
        type="button"
        class="lp-btn lp-btn-ghost"
        on:click={() => dispatch("cancelAdd")}
      >
        Cancel
      </button>
      <button
        type="button"
        class="lp-btn lp-btn-primary"
        disabled={edit.adding.points < 3}
        on:click={() => dispatch("doneAdd")}
      >
        {edit.adding.kind === "hole" ? "Cut it" : "Add it"}
      </button>
    </div>
  {:else}
    <p class="mn-move-hint">
      <Hand size={17} /> Drag a corner to move it. Drag a small dot to make a new
      corner.
    </p>

    {#if edit.picked}
      <div class="mn-menu-actions">
        <button
          type="button"
          disabled={!edit.picked.canRemoveCorner}
          on:click={() => dispatch("removeCorner")}
        >
          <Trash2 size={18} /> Remove corner
        </button>
        {#if edit.picked.canRemoveRing}
          <button
            type="button"
            class="danger"
            on:click={() => dispatch("removeRing")}
          >
            <Trash2 size={18} />
            {edit.picked.hole ? "Fill this hole in" : "Remove this piece"}
          </button>
        {/if}
      </div>
    {/if}
    <div class="mn-keep">
      <button type="button" on:click={() => dispatch("add", "hole")}>
        <strong><Minus size={16} strokeWidth={3} /> Cut ground out</strong>
        <span>A dam, rocks, ground that is never worked.</span>
      </button>
      <button type="button" on:click={() => dispatch("add", "piece")}>
        <strong><Plus size={16} strokeWidth={3} /> Add ground</strong>
        <span>Push it out, or give it a second piece.</span>
      </button>
    </div>

    <div class="mn-menu-actions">
      <button
        type="button"
        disabled={!edit.steps}
        on:click={() => dispatch("undo")}
      >
        <Undo2 size={18} /> Undo
      </button>
      <button
        type="button"
        disabled={!edit.changed}
        on:click={() => dispatch("reset")}
      >
        <RotateCcw size={18} /> Start again
      </button>
      {#if priorAt}
        <button type="button" on:click={() => dispatch("prior")}>
          <History size={18} /> As before {when(priorAt)}
        </button>
      {/if}
    </div>

    <div class="mn-card-actions">
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
        {edit.saving ? "Saving…" : "Save boundary"}
      </button>
    </div>
  {/if}
</div>
