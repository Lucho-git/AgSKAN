<script lang="ts">
  /**
   * The menu for a picked pin: what it is, and what the current viewer lets
   * you do with one. Change its type or colour, write its note and choose
   * whether the note shows on the map, open or close a gate, mark a rock as
   * picked, set how full a bin is, move it, or remove it; and what is
   * attached to it: photos, and areas and lines drawn on the map.
   */
  import { createEventDispatcher } from "svelte"
  import {
    ArrowLeft,
    Camera,
    Check,
    Eye,
    EyeOff,
    Hand,
    LoaderCircle,
    Move,
    Paperclip,
    Pencil,
    Spline,
    Trash2,
    Pentagon,
    X,
  } from "lucide-svelte"
  import PinArt from "$lib/components/mapnext/PinArt.svelte"
  import {
    isGrainBinIcon,
    markerColor,
  } from "$lib/components/map/markers/markerPalette"
  import {
    PIN_DEFAULT,
    pinLabel,
    type PinChoice,
    type PinLook,
  } from "$lib/components/mapnext/pins"
  import {
    formatAgo,
    formatDistance,
    formatHa,
  } from "$lib/components/mapnext/format"
  import {
    distanceM,
    projector,
    type LngLat,
  } from "$lib/components/mapnext/geo"
  import type { LivePin, PinDrawing, PinPatch, PinPhoto } from "./liveData"

  export let pin: LivePin
  /** How the pin is drawn for this person (their colour settings applied). */
  export let look: PinLook
  /** Metres from the viewer, when they are on the map. */
  export let distance: number | null = null
  export let guest = false
  export let choices: PinChoice[] = []
  export let choiceLook: (iconClass: string) => PinLook
  /** Being dragged to a new place on the map. */
  export let moving = false
  /** The areas and lines attached to this pin. */
  export let drawings: PinDrawing[] = []
  /** Links to this pin's photos, by photo id, as they arrive. */
  export let photoLinks: Record<string, string> = {}
  /** A photo is on its way up. */
  export let uploading = false

  const dispatch = createEventDispatcher<{
    close: void
    change: PinPatch & { note?: string }
    move: boolean
    /** Put the pin down where it has been dragged to. */
    place: void
    remove: void
    draw: "polygon" | "line"
    removeDrawing: string
    photo: File
    removePhoto: PinPhoto
  }>()

  // The colours the current viewer's pin menu offers. "default" is no colour
  // of its own: the pin takes this person's default, which is sky blue
  // unless their marker settings say otherwise.
  const COLOURS = [
    "default",
    "red",
    "orange",
    "yellow",
    "green",
    "skyblue",
    "blue",
    "purple",
    "pink",
    "black",
  ]
  const swatch = (key: string) =>
    key === "default"
      ? PIN_DEFAULT
      : key === "black"
        ? "#15261C"
        : markerColor(key, "circle-fill").dark

  let picking = false
  /** Looking at what is attached to it. */
  let attaching = false
  /** The photo opened to fill the screen. */
  let viewing: PinPhoto | null = null
  let fileInput: HTMLInputElement
  let note = pin.note
  let lastPin = pin.id
  let armed = false
  let armedTimer: ReturnType<typeof setTimeout>
  // A different pin: start from its own note, not the last one's draft.
  $: if (pin.id !== lastPin) {
    lastPin = pin.id
    note = pin.note
    picking = false
    attaching = false
    viewing = null
    armed = false
  }
  $: if (viewing && !pin.photos.some((photo) => photo.id === viewing?.id))
    viewing = null
  $: attached = pin.photos.length + drawings.length

  // How big a drawing is: hectares inside an area, metres along a line.
  function size(drawing: PinDrawing) {
    const rings = drawing.geometry.coordinates as LngLat[] | LngLat[][]
    if (drawing.kind === "line") {
      const line = rings as LngLat[]
      let metres = 0
      for (let i = 1; i < line.length; i++)
        metres += distanceM(line[i - 1], line[i])
      return `Line · ${formatDistance(metres)}`
    }
    const ring = (rings as LngLat[][])[0] ?? []
    if (ring.length < 3) return "Area"
    const flat = projector(ring[0])
    const xy = ring.map((point) => flat.toXY(point))
    let twice = 0
    for (let i = 0, j = xy.length - 1; i < xy.length; j = i++)
      twice += xy[j][0] * xy[i][1] - xy[i][0] * xy[j][1]
    return `Area · ${formatHa(Math.abs(twice) / 2 / 10000)} ha`
  }

  function chosen() {
    const file = fileInput.files?.[0]
    fileInput.value = ""
    if (file) dispatch("photo", file)
  }

  $: bin = isGrainBinIcon(pin.iconClass)
  $: gate = pin.iconClass === "custom-svg-gate"
  $: rock =
    pin.iconClass === "custom-svg-rock" ||
    pin.iconClass === "custom-svg-rock_pile"
  $: noteChanged = note.trim() !== pin.note
  $: facts = [
    ...(pin.note ? [pinLabel(pin.iconClass)] : []),
    `Dropped ${formatAgo(pin.t)}`,
    ...(distance !== null ? [`${formatDistance(distance)} away`] : []),
  ]

  function remove() {
    if (!armed) {
      // The current viewer asks for a second tap too.
      armed = true
      clearTimeout(armedTimer)
      armedTimer = setTimeout(() => (armed = false), 2500)
      return
    }
    dispatch("remove")
  }
</script>

<div class="mn-card mn-menu">
  <div class="head">
    <PinArt {look} size={48} />
    <div class="about">
      <h2>{pin.note || pinLabel(pin.iconClass)}</h2>
      <p>{facts.join(" · ")}</p>
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

  {#if moving}
    <p class="mn-move-hint"><Hand size={18} /> Drag the pin to move it</p>
    <div class="mn-card-actions">
      <button
        type="button"
        class="lp-btn lp-btn-ghost"
        on:click={() => dispatch("move", false)}
      >
        Put it back
      </button>
      <button
        type="button"
        class="lp-btn lp-btn-primary"
        on:click={() => dispatch("place")}
      >
        <Check size={18} strokeWidth={3} /> Place
      </button>
    </div>
  {:else if attaching}
    <button
      type="button"
      class="mn-text-button"
      on:click={() => (attaching = false)}
    >
      <ArrowLeft size={16} /> Back to the pin
    </button>

    {#if pin.photos.length}
      <div class="mn-photos">
        {#each pin.photos as photo (photo.id)}
          <button
            type="button"
            aria-label="Open this photo"
            style={photoLinks[photo.id]
              ? `background-image: url("${photoLinks[photo.id]}")`
              : ""}
            on:click={() => (viewing = photo)}
          ></button>
        {/each}
      </div>
    {/if}

    {#if drawings.length}
      <ul class="mn-drawn">
        {#each drawings as drawing (drawing.id)}
          <li>
            <span class="swatch" style="background: {drawing.colour}"></span>
            <span class="what">{size(drawing)}</span>
            {#if !guest}
              <button
                type="button"
                aria-label="Remove this drawing"
                on:click={() => dispatch("removeDrawing", drawing.id)}
              >
                <Trash2 size={17} />
              </button>
            {/if}
          </li>
        {/each}
      </ul>
      {#if !guest}
        <button
          type="button"
          class="mn-switch"
          role="switch"
          aria-checked={pin.drawingsAlways}
          on:click={() =>
            dispatch("change", { drawingsAlways: !pin.drawingsAlways })}
        >
          <span>Always show its drawings</span>
          <i></i>
        </button>
      {/if}
    {/if}

    {#if !attached}
      <p class="mn-note">
        Nothing attached yet. Add a photo, or draw an area or a line on the map
        that belongs to this pin.
      </p>
    {/if}

    {#if !guest}
      <input
        bind:this={fileInput}
        type="file"
        accept="image/*"
        hidden
        on:change={chosen}
      />
      <div class="mn-menu-actions">
        <button
          type="button"
          disabled={uploading}
          on:click={() => fileInput.click()}
        >
          {#if uploading}
            <span class="mn-spin"><LoaderCircle size={18} /></span> Sending
          {:else}
            <Camera size={18} /> Photo
          {/if}
        </button>
        <button type="button" on:click={() => dispatch("draw", "polygon")}>
          <Pentagon size={18} /> Area
        </button>
        <button type="button" on:click={() => dispatch("draw", "line")}>
          <Spline size={18} /> Line
        </button>
      </div>
    {/if}
  {:else if picking}
    <!-- ── Editing the pin: its colour, and what kind it is ── -->
    <button
      type="button"
      class="mn-text-button"
      on:click={() => (picking = false)}
    >
      <ArrowLeft size={16} /> Back to the pin
    </button>
    {#if !bin}
      <p class="lp-eyebrow">Colour</p>
      <div class="mn-swatches" role="group" aria-label="Pin colour">
        {#each COLOURS as key}
          <button
            type="button"
            class:selected={(pin.colour || "default") === key}
            style="--swatch: {swatch(key)}"
            aria-label={key === "default" ? "Default colour" : key}
            aria-pressed={(pin.colour || "default") === key}
            on:click={() =>
              (pin.colour || "default") !== key &&
              dispatch("change", { colour: key })}
          ></button>
        {/each}
      </div>
    {/if}
    <p class="lp-eyebrow">Kind of pin</p>
    <div class="mn-kinds all" style="margin: 0; padding: 0">
      {#each choices as choice (choice.iconClass)}
        <button
          type="button"
          class="mn-kind"
          class:selected={pin.iconClass === choice.iconClass}
          on:click={() =>
            choice.iconClass !== pin.iconClass &&
            dispatch("change", { iconClass: choice.iconClass })}
        >
          <PinArt look={choiceLook(choice.iconClass)} size={34} />
          {choice.label}
        </button>
      {/each}
    </div>
  {:else if !guest}
    {#if gate}
      <div class="mn-pair" role="group" aria-label="Gate">
        <button
          type="button"
          aria-pressed={!pin.gateOpen}
          on:click={() =>
            pin.gateOpen && dispatch("change", { gateOpen: false })}
          >Closed</button
        >
        <button
          type="button"
          aria-pressed={pin.gateOpen}
          on:click={() =>
            !pin.gateOpen && dispatch("change", { gateOpen: true })}
          >Open</button
        >
      </div>
    {/if}
    {#if rock}
      <div class="mn-pair" role="group" aria-label="Rock">
        <button
          type="button"
          aria-pressed={!pin.rockPicked}
          on:click={() =>
            pin.rockPicked && dispatch("change", { rockPicked: false })}
          >Not picked</button
        >
        <button
          type="button"
          aria-pressed={pin.rockPicked}
          on:click={() =>
            !pin.rockPicked && dispatch("change", { rockPicked: true })}
          >Picked</button
        >
      </div>
    {/if}
    {#if bin}
      <label class="mn-slider">
        <span class="lp-eyebrow">How full · {Math.round(pin.fill)}%</span>
        <input
          class="mn-scrub"
          type="range"
          min="0"
          max="100"
          step="5"
          value={pin.fill}
          style="--done: {pin.fill}%"
          on:change={(e) =>
            dispatch("change", { fill: Number(e.currentTarget.value) })}
        />
      </label>
    {/if}

    <div class="mn-note-field">
      <textarea
        bind:value={note}
        rows="2"
        maxlength="500"
        placeholder={bin ? "What's in it, or a note" : "Add a note"}
      ></textarea>
      {#if noteChanged}
        <button
          type="button"
          class="save"
          aria-label="Save the note"
          on:click={() => dispatch("change", { note })}
        >
          <Check size={20} strokeWidth={3} />
        </button>
      {:else if pin.note}
        <!-- Whether the note shows on the map: one small button. -->
        <button
          type="button"
          class="eye"
          class:off={!pin.noteVisible}
          role="switch"
          aria-checked={pin.noteVisible}
          aria-label="Show the note on the map"
          title={pin.noteVisible
            ? "The note shows on the map"
            : "The note is hidden on the map"}
          on:click={() => dispatch("change", { noteVisible: !pin.noteVisible })}
        >
          {#if pin.noteVisible}<Eye size={19} />{:else}<EyeOff size={19} />{/if}
        </button>
      {/if}
    </div>

    <button type="button" class="mn-attach" on:click={() => (attaching = true)}>
      <Paperclip size={18} />
      <span>Photos and drawings</span>
      <b>{attached || "Add"}</b>
    </button>

    <div class="mn-menu-actions">
      <button type="button" on:click={() => (picking = true)}>
        <Pencil size={18} /> Edit
      </button>
      <button type="button" on:click={() => dispatch("move", true)}>
        <Move size={18} /> Move
      </button>
      <button type="button" class="danger" class:armed on:click={remove}>
        <Trash2 size={18} />
        {armed ? "Tap again" : "Remove"}
      </button>
    </div>
  {:else if attached}
    <!-- Someone looking on can still see what is attached. -->
    <button type="button" class="mn-attach" on:click={() => (attaching = true)}>
      <Paperclip size={18} />
      <span>Photos and drawings</span>
      <b>{attached}</b>
    </button>
  {/if}
</div>

{#if viewing}
  <!-- A photo, filling the screen. -->
  <div class="mn-lightbox" role="dialog" aria-label="Photo">
    {#if photoLinks[viewing.id]}
      <img src={photoLinks[viewing.id]} alt="Attached to this pin" />
    {:else}
      <span class="mn-spin"><LoaderCircle size={32} /></span>
    {/if}
    <div class="bar">
      {#if !guest}
        <button
          type="button"
          class="danger"
          on:click={() => viewing && dispatch("removePhoto", viewing)}
        >
          <Trash2 size={18} /> Remove
        </button>
      {/if}
      <button type="button" on:click={() => (viewing = null)}>
        <X size={18} /> Close
      </button>
    </div>
  </div>
{/if}
