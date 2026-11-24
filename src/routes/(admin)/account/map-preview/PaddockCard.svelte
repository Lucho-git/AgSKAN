<script lang="ts">
  /**
   * The menu for a picked paddock, with what the current viewer's field
   * panel offers: its name, what is in it, its colour, which farm it belongs
   * to, changing its boundary and deleting it. What is known about it sits
   * in blocks; tapping a block changes it. It also lists what has been kept
   * on it (areas and lines with a name) and the trails of the job on show
   * that have been through it.
   *
   * On a phone (`compact`) a picked paddock is only a bar along the bottom
   * to begin with: its picture, name and size, so the map stays in view.
   * "More" on the bar (or a tap on the name) pulls the rest of the menu up.
   */
  import { createEventDispatcher, tick } from "svelte"
  import {
    ArrowLeft,
    Check,
    ChevronDown,
    ChevronUp,
    History,
    Layers,
    Pencil,
    PencilRuler,
    Trash2,
    X,
  } from "lucide-svelte"
  import ShapeArt from "$lib/components/mapnext/ShapeArt.svelte"
  import Dropdown from "$lib/components/mapnext/Dropdown.svelte"
  import { machineFor } from "$lib/components/mapnext/machines"
  import { drawColour } from "$lib/components/mapnext/palette"
  import { formatHa } from "$lib/components/mapnext/format"
  import { sizeOf, type ThroughStats } from "./liveEngine"
  import type { FarmName, Paddock, PaddockPatch, TrailInfo } from "./liveData"

  export let paddock: Paddock
  export let farms: FarmName[] = []
  export let guest = false
  /** The viewer is standing in it. */
  export let here = false
  /** A phone: it opens as a bar, and the rest is pulled up from it. */
  export let compact = false
  /** Finished trails of the job on show that have been through it. */
  export let trails: TrailInfo[] = []
  /** The name of that job. */
  export let operation = ""
  /** The thing kept on it that is picked out, if one is. */
  export let pickedFeature: string | null = null
  /** All of its trails are being shown at once. */
  export let allTrails = false
  /** What they add up to inside its fence, once they are showing. */
  export let stats: ThroughStats | null = null
  /**
   * What has been written in for other paddocks on this map: each crop, and
   * the varieties entered with it, the most used first.
   */
  export let crops: { crop: string; varieties: string[] }[] = []

  const dispatch = createEventDispatcher<{
    close: void
    change: PaddockPatch
    remove: void
    /** Start drawing something to keep on it. */
    draw: void
    /** Open the editor that changes its boundary. */
    boundary: void
    /** Put its boundary back to what it was before the last change. */
    putBack: void
    /** Pick out (or let go of) something kept on it. */
    feature: string | null
    removeFeature: string
    /** Change the shape or colour of something kept on it. */
    editFeature: string
    /** Pick one of its trails out. */
    trail: string
    /** Show all of its trails at once, or stop. */
    allTrails: boolean
  }>()

  const when = (t: number) =>
    new Date(t).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
    })

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

  type Block = "name" | "crop" | "variety"
  /** The block being written in, and what has been typed. */
  let editing: Block | null = null
  let draft = ""
  let field: HTMLInputElement | null = null
  let last = paddock.id
  let deleting = false
  /** Asked to draw: something on it, or its own boundary? */
  let drawAsk = false
  /** The rest of the menu has been pulled up (a phone). */
  let more = false
  $: if (paddock.id !== last) {
    last = paddock.id
    editing = null
    deleting = false
    drawAsk = false
    more = false
  }
  // (With all its trails showing, their figures are in the menu: it opens.)
  $: bar = compact && !more && !allTrails

  // (Reactive, so the blocks follow the paddock when another is picked.)
  $: value = (block: Block) =>
    block === "name"
      ? paddock.name
      : block === "crop"
        ? paddock.crop
        : paddock.variety

  async function edit(block: Block) {
    if (guest) return
    if (editing) save()
    editing = block
    draft = value(block)
    await tick()
    field?.focus()
    field?.select()
  }

  function save(next: Block | null = null) {
    const block = editing
    if (!block) return
    const typed = draft.trim()
    editing = null
    if (typed !== value(block) && (block !== "name" || typed))
      dispatch("change", { [block]: typed })
    if (next) edit(next)
  }

  const starts = (option: string, typed: string) =>
    option.toLowerCase().startsWith(typed.trim().toLowerCase()) &&
    option.toLowerCase() !== typed.trim().toLowerCase()
  // Crops already used on this map that match what has been typed so far.
  $: cropIdeas =
    editing === "crop"
      ? crops
          .map((entry) => entry.crop)
          .filter((option) => starts(option, draft))
          .slice(0, 6)
      : []
  // Varieties already entered with this crop.
  $: varietyIdeas =
    editing === "variety"
      ? (
          crops.find(
            (entry) =>
              entry.crop.toLowerCase() === paddock.crop.trim().toLowerCase(),
          )?.varieties ?? []
        )
          .filter((option) => starts(option, draft))
          .slice(0, 6)
      : []

  const BLOCKS: { key: Block; label: string; empty: string; max: number }[] = [
    { key: "name", label: "Name", empty: "Name it", max: 60 },
    { key: "crop", label: "What's in it", empty: "Add a crop", max: 40 },
    { key: "variety", label: "Variety", empty: "Add variety", max: 40 },
  ]
</script>

<div
  class="mn-card mn-menu mn-paddock"
  class:bar
  style={paddock.colour ? `--accent: ${paddock.colour}` : ""}
>
  <div class="head">
    <span class="art">
      <ShapeArt polygons={paddock.polygons} colour={paddock.colour} size={46} />
    </span>
    <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
    <div class="about" on:click={() => compact && (more = true)}>
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
    {#if compact && !allTrails}
      <button
        type="button"
        class="pull"
        aria-expanded={more}
        on:click={() => (more = !more)}
      >
        {#if more}
          <ChevronDown size={18} /> Less
        {:else}
          <ChevronUp size={18} /> More
        {/if}
      </button>
    {/if}
    <button
      type="button"
      class="mn-icon-button"
      aria-label="Close"
      on:click={() => dispatch("close")}
    >
      <X size={22} />
    </button>
  </div>

  {#if bar}
    <!-- (Only the bar: the rest waits to be pulled up.) -->
  {:else if deleting}
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
  {:else if drawAsk}
    <!-- ── Draw: something on the paddock, or the paddock itself ── -->
    <button
      type="button"
      class="mn-text-button"
      on:click={() => (drawAsk = false)}
    >
      <ArrowLeft size={16} /> Back to the paddock
    </button>
    <div class="mn-keep">
      <button type="button" on:click={() => dispatch("draw")}>
        <strong>Draw something on it</strong>
        <span>
          A wet patch, a drain, a rock heap. It is kept on the paddock, or on a
          pin you drop with it.
        </span>
      </button>
      <button type="button" on:click={() => dispatch("boundary")}>
        <strong>Change its boundary</strong>
        <span>
          Move its corners, cut ground out, add a piece, split it in two or join
          the paddock next door onto it.
        </span>
      </button>
    </div>
    {#if paddock.prior}
      <button
        type="button"
        class="mn-text-button"
        on:click={() => dispatch("putBack")}
      >
        <History size={16} /> Put back the boundary from before
        {when(paddock.prior.t)}
      </button>
    {/if}
  {:else}
    <!-- ── What is known about it: tap a block to change it ── -->
    <div class="mn-info">
      {#each BLOCKS as block (block.key)}
        {#if editing === block.key}
          <form
            class="editing block"
            class:whole={block.key === "name"}
            on:submit|preventDefault={() => save()}
          >
            <span class="lp-eyebrow">{block.label}</span>
            <input
              bind:this={field}
              type="text"
              bind:value={draft}
              maxlength={block.max}
              autocomplete="off"
              enterkeyhint="done"
              on:blur={() => save()}
              on:keydown={(e) => e.key === "Escape" && (editing = null)}
            />
            <button type="submit" class="go" aria-label="Save">
              <Check size={18} strokeWidth={3} />
            </button>
          </form>
        {:else}
          <button
            type="button"
            class="block"
            class:whole={block.key === "name"}
            class:empty={!value(block.key)}
            disabled={guest ||
              (block.key === "variety" && !paddock.crop && !paddock.variety)}
            on:click={() => edit(block.key)}
          >
            <span class="lp-eyebrow">{block.label}</span>
            <strong>
              {value(block.key) ||
                (guest
                  ? "—"
                  : block.key === "variety" && !paddock.crop
                    ? "—"
                    : block.empty)}
            </strong>
            {#if !guest}<i><Pencil size={14} /></i>{/if}
          </button>
        {/if}
      {/each}
      {#if farms.length > 1 && !guest}
        <Dropdown
          look="block"
          label="Farm"
          placeholder="No farm"
          value={paddock.farmId ?? ""}
          options={farms.map((farm) => ({ value: farm.id, label: farm.name }))}
          on:change={(e) => dispatch("change", { farmId: e.detail })}
        />
      {/if}
      <div class="still block">
        <span class="lp-eyebrow">Area</span>
        <strong>{paddock.ha > 0 ? `${formatHa(paddock.ha)} ha` : "—"}</strong>
      </div>
    </div>
    <!-- What has been used on this map before, a tap away. -->
    {#if cropIdeas.length || varietyIdeas.length}
      <div
        class="mn-chips mn-ideas"
        role="group"
        aria-label={editing === "crop"
          ? "Crops used here"
          : "Varieties used here"}
      >
        {#each editing === "crop" ? cropIdeas : varietyIdeas as option}
          <!-- (mousedown, so the tap lands before the field's blur saves.) -->
          <button
            type="button"
            on:mousedown|preventDefault={() => {
              draft = option
              save(editing === "crop" && !paddock.variety ? "variety" : null)
            }}>{option}</button
          >
        {/each}
      </div>
    {/if}

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
    {/if}

    {#if paddock.features.length}
      <p class="lp-eyebrow">Kept on this paddock</p>
      <ul class="mn-drawn">
        {#each paddock.features as feature (feature.id)}
          <li class:picked={pickedFeature === feature.id}>
            <button
              type="button"
              class="pick"
              aria-pressed={pickedFeature === feature.id}
              on:click={() =>
                dispatch(
                  "feature",
                  pickedFeature === feature.id ? null : feature.id,
                )}
            >
              {#if feature.kind === "line"}
                <ShapeArt
                  line={feature.coordinates}
                  colour={feature.colour}
                  size={30}
                />
              {:else}
                <ShapeArt
                  polygons={[
                    [[...feature.coordinates, feature.coordinates[0]]],
                  ]}
                  colour={feature.colour}
                  size={30}
                />
              {/if}
              <span class="what">
                {feature.label || (feature.kind === "line" ? "Line" : "Area")}
                <small>{sizeOf(feature.kind, feature.coordinates)}</small>
              </span>
            </button>
            {#if !guest}
              <button
                type="button"
                class="pen"
                aria-label="Change {feature.label || 'this'}"
                on:click={() => dispatch("editFeature", feature.id)}
              >
                <Pencil size={16} />
              </button>
              <button
                type="button"
                aria-label="Remove {feature.label || 'this'}"
                on:click={() => dispatch("removeFeature", feature.id)}
              >
                <Trash2 size={17} />
              </button>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}

    {#if trails.length}
      <!-- ── Its trails: all at once, or one picked from a list ── -->
      <!-- (One row and no more: all of them is the button, one of them is
           the list beside it.) -->
      <div
        class="mn-ptrails"
        title={operation ? `Trails through here in ${operation}` : null}
      >
        {#if trails.length === 1}
          <!-- Only one: it is simply offered. -->
          <div class="row">
            <button
              type="button"
              class="all"
              on:click={() => dispatch("trail", trails[0].id)}
            >
              <i style="background: {drawColour(trails[0].colour)}"></i>
              Open its trail · {when(trails[0].start)}{trails[0].operator
                ? ` · ${trails[0].operator.split(/\s+/)[0]}`
                : ""}
            </button>
          </div>
        {:else}
          <div class="row">
            <button
              type="button"
              class="all"
              on:click={() => dispatch("allTrails", true)}
            >
              <Layers size={17} /> Show all {trails.length} trails
            </button>
            <Dropdown
              look="pill"
              title="Open a trail"
              options={trails.map((trail) => ({
                value: trail.id,
                label:
                  when(trail.start) +
                  (trail.operator
                    ? ` · ${trail.operator.split(/\s+/)[0]}`
                    : ""),
                note: [
                  ...(trail.machine ? [machineFor(trail.machine).label] : []),
                  ...(trail.ha !== null ? [`${formatHa(trail.ha)} ha`] : []),
                ].join(" · "),
                // (The machine that laid it, in the trail's own colour; an arrow
                // when it wasn't recorded.)
                machine: trail.machine || "Pointer",
                colour: drawColour(trail.colour),
              }))}
              on:change={(e) => dispatch("trail", e.detail)}
            >
              Pick one
            </Dropdown>
          </div>
        {/if}
        {#if allTrails && stats}
          <!-- What they add up to, inside the fence only. -->
          <div class="mn-stats">
            <div>
              <strong>{formatHa(stats.ha)} ha</strong>
              <span>
                covered{stats.of > 0
                  ? ` · ${Math.min(100, Math.round((stats.ha / stats.of) * 100))}%`
                  : ""}
              </span>
            </div>
            <div>
              <strong>{stats.km.toFixed(stats.km < 10 ? 1 : 0)} km</strong>
              <span>driven in here</span>
            </div>
            <div>
              <strong>
                {when(stats.from)}{when(stats.to) !== when(stats.from)
                  ? ` to ${when(stats.to)}`
                  : ""}
              </strong>
              <span>{stats.drivers.join(", ") || "No operator"}</span>
            </div>
          </div>
        {/if}
      </div>
    {/if}

    {#if !guest}
      <div class="mn-menu-actions">
        <button type="button" on:click={() => (drawAsk = true)}>
          <PencilRuler size={18} /> Draw
        </button>
        <button type="button" class="danger" on:click={() => (deleting = true)}>
          <Trash2 size={18} /> Delete
        </button>
      </div>
    {/if}
  {/if}
</div>

<style>
  /* The bar a phone shows first: the heading and nothing under it. */
  .mn-paddock.bar {
    padding-bottom: 0;
  }
  .mn-paddock.bar > .head {
    box-shadow: none;
  }
  .mn-paddock .about {
    min-width: 0;
  }
  .mn-paddock .about h2,
  .mn-paddock .about p {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pull {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    gap: 4px;
    min-height: 40px;
    padding: 0 12px 0 9px;
    border: 1.5px solid var(--mn-band-soft, rgba(244, 241, 230, 0.6));
    border-radius: 99px;
    font-size: 0.86rem;
    font-weight: 700;
    color: var(--mn-band-text, #f4f1e6);
    white-space: nowrap;
  }
  .mn-paddock.bar .pull {
    border-color: var(--lp-yellow);
    background: var(--lp-yellow);
    color: #15261c;
  }
</style>
