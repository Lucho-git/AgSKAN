<script lang="ts">
  /**
   * Changing a paddock's boundary. On the map every corner has a handle to
   * drag, and a small dot sits between corners to drag out into a new one.
   * From here ground can be cut out (a hole, or a bite off the edge) or
   * added (joined on, or as a separate piece of the same paddock); the
   * paddock can be split in two along a line, or have the paddock next
   * door joined onto it.
   *
   * Nothing changes on the farm until Save, every step can be stepped back,
   * and a saved change can be put back afterwards.
   */
  import { createEventDispatcher } from "svelte"
  import {
    Check,
    Hand,
    History,
    Merge,
    Minus,
    Plus,
    Scissors,
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
  /** The name being given to a new paddock. */
  export let name = ""

  const dispatch = createEventDispatcher<{
    add: "hole" | "piece" | "split"
    join: void
    cancelJoin: void
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
    ...(edit.creating && !edit.polygons.length
      ? ["Nothing drawn yet"]
      : [`${formatHa(edit.ha)} ha`]),
    ...(!edit.creating && Math.abs(change) >= 0.05
      ? [`${formatHa(Math.abs(change))} ha ${change > 0 ? "more" : "less"}`]
      : []),
    ...(edit.pieces > 1 && !edit.apart ? [`${edit.pieces} pieces`] : []),
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
      {#if edit.creating}
        <p class="lp-eyebrow">New paddock</p>
        <input
          class="name"
          type="text"
          bind:value={name}
          maxlength="60"
          placeholder="Name it"
          aria-label="Name of the new paddock"
          autocomplete="off"
        />
      {:else}
        <p class="lp-eyebrow">Changing the boundary</p>
        <h2>{edit.name}</h2>
      {/if}
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

  {#if edit.joining}
    <p class="mn-move-hint">
      <Hand size={17} /> Tap the paddock to join onto this one
    </p>
    <p class="mn-note">
      Its ground is added to {edit.name} and the line between them goes. It stops
      being a paddock of its own when you save.
    </p>
    <div class="mn-card-actions one">
      <button
        type="button"
        class="lp-btn lp-btn-ghost"
        on:click={() => dispatch("cancelJoin")}
      >
        Cancel
      </button>
    </div>
  {:else if edit.adding}
    <p class="mn-move-hint">
      <Hand size={17} />
      {edit.adding.kind === "split"
        ? "Tap a line across the paddock, fence to fence"
        : edit.adding.kind === "hole"
          ? "Tap round the ground to take out"
          : edit.creating && !edit.polygons.length
            ? "Tap each corner of the paddock, right round it"
            : "Tap round the ground to add"}
    </p>
    <p class="mn-note">
      {edit.adding.kind === "split"
        ? "Two taps make a straight cut; more make it bend. Each side becomes a paddock of its own when you save."
        : edit.adding.kind === "hole"
          ? "Inside the paddock it becomes a hole. Across the edge, it takes a bite out of it."
          : edit.creating && !edit.polygons.length
            ? "Rough is fine: every corner can be moved afterwards, and holes, extra pieces and splits are added from here once it is round."
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
        disabled={edit.adding.points < (edit.adding.kind === "split" ? 2 : 3)}
        on:click={() => dispatch("doneAdd")}
      >
        {edit.adding.kind === "split"
          ? "Split here"
          : edit.adding.kind === "hole"
            ? "Cut it"
            : "Add it"}
      </button>
    </div>
  {:else}
    <p class="mn-move-hint">
      <Hand size={17} /> Drag a corner to move it, or a dot to add one.
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
      <button type="button" on:click={() => dispatch("add", "split")}>
        <strong><Scissors size={16} /> Split it</strong>
        <span>Draw a line across; each side becomes a paddock.</span>
      </button>
      <button type="button" on:click={() => dispatch("join")}>
        <strong><Merge size={16} /> Join a neighbour</strong>
        <span>Tap the paddock next door; the line between goes.</span>
      </button>
    </div>
    {#if edit.apart}
      <p class="mn-trailing">
        <i></i>Splits into {edit.apart.length} paddocks: {edit.apart
          .map((ha) => `${formatHa(ha)} ha`)
          .join(" and ")}. The biggest keeps the name.
      </p>
    {/if}
    {#if edit.joined.length}
      <p class="mn-trailing">
        <i></i>{edit.joined.join(" and ")} joined on. {edit.joined.length === 1
          ? "It stops"
          : "They stop"} being {edit.joined.length === 1
          ? "a paddock of its own"
          : "paddocks of their own"} when you save.
      </p>
    {/if}

    <div class="mn-menu-actions">
      <button
        type="button"
        disabled={!edit.steps}
        on:click={() => dispatch("undo")}
      >
        <Undo2 size={18} /> Undo
      </button>
      {#if !edit.creating}
        <button
          type="button"
          disabled={!edit.changed}
          on:click={() => dispatch("reset")}
        >
          <RotateCcw size={18} /> Start again
        </button>
      {/if}
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
        disabled={!edit.changed ||
          edit.saving ||
          (edit.creating && !name.trim())}
        on:click={() => dispatch("save")}
      >
        <Check size={18} strokeWidth={3} />
        {edit.saving
          ? "Saving…"
          : edit.creating && !name.trim()
            ? "Name it to save"
            : edit.apart
              ? `Save as ${edit.apart.length} paddocks`
              : edit.creating
                ? "Create paddock"
                : edit.joined.length
                  ? "Save as one paddock"
                  : "Save boundary"}
      </button>
    </div>
  {/if}
</div>

<style>
  .name {
    width: 100%;
    min-height: 38px;
    padding: 0 2px;
    border-bottom: 2px solid var(--lp-line);
    background: none;
    font-family: var(--lp-display);
    font-size: 1.2rem;
    font-weight: 800;
    color: var(--lp-ink);
    outline: none;
  }
  .name:focus {
    border-color: var(--lp-ink);
  }
</style>
