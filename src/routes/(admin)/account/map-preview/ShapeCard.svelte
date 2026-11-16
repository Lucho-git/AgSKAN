<script lang="ts">
  /**
   * Changing the shape of a line or an area that is drawn on a pin. On the
   * map every corner has a handle to drag, and a small dot sits between
   * corners to drag out into a new one; a tapped corner can be taken away.
   * Nothing changes until Save.
   */
  import { createEventDispatcher } from "svelte"
  import { Check, Hand, Trash2, Undo2, X } from "lucide-svelte"
  import ShapeArt from "$lib/components/mapnext/ShapeArt.svelte"
  import { formatDistance, formatHa } from "$lib/components/mapnext/format"
  import type { BoundaryEdit } from "./liveEngine"

  export let edit: BoundaryEdit
  export let colour: string | null = null

  const dispatch = createEventDispatcher<{
    removeCorner: void
    undo: void
    cancel: void
    save: void
  }>()

  $: line = edit.shape?.kind === "line"
  $: ring = edit.polygons[0]?.[0] ?? []
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
      <p>{edit.shape?.corners ?? 0} corners</p>
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
    <Hand size={17} /> Drag a corner to move it. Drag a small dot to make a new corner.
  </p>

  <div class="mn-menu-actions">
    <button
      type="button"
      disabled={!edit.picked?.canRemoveCorner}
      on:click={() => dispatch("removeCorner")}
    >
      <Trash2 size={18} />
      {edit.picked ? "Remove corner" : "Tap a corner to remove it"}
    </button>
    <button
      type="button"
      disabled={!edit.steps}
      on:click={() => dispatch("undo")}
    >
      <Undo2 size={18} /> Undo
    </button>
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
      disabled={!edit.steps || edit.saving}
      on:click={() => dispatch("save")}
    >
      <Check size={18} strokeWidth={3} />
      {edit.saving ? "Saving…" : "Save"}
    </button>
  </div>
</div>
