<script lang="ts">
  /**
   * The menu for a picked pin: what it is, and what the current viewer lets
   * you do with one. Change its type or colour, write its note and choose
   * whether the note shows on the map, open or close a gate, mark a rock as
   * picked, set how full a bin is, move it, or remove it.
   */
  import { createEventDispatcher } from "svelte"
  import { Check, Move, Shapes, Trash2, X } from "lucide-svelte"
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
  import { formatAgo, formatDistance } from "$lib/components/mapnext/format"
  import type { LivePin, PinPatch } from "./liveData"

  export let pin: LivePin
  /** How the pin is drawn for this person (their colour settings applied). */
  export let look: PinLook
  /** Metres from the viewer, when they are on the map. */
  export let distance: number | null = null
  export let guest = false
  export let choices: PinChoice[] = []
  export let choiceLook: (iconClass: string) => PinLook
  /** Waiting for a tap on the map to say where it goes. */
  export let moving = false

  const dispatch = createEventDispatcher<{
    close: void
    change: PinPatch & { note?: string }
    move: boolean
    remove: void
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
  let note = pin.note
  let lastPin = pin.id
  let armed = false
  let armedTimer: ReturnType<typeof setTimeout>
  // A different pin: start from its own note, not the last one's draft.
  $: if (pin.id !== lastPin) {
    lastPin = pin.id
    note = pin.note
    picking = false
    armed = false
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
    <p class="mn-warning">Tap the map where this pin should go.</p>
    <button
      type="button"
      class="lp-btn lp-btn-ghost"
      on:click={() => dispatch("move", false)}
    >
      Leave it where it is
    </button>
  {:else if picking}
    <p class="lp-eyebrow">Change it to</p>
    <div class="mn-kinds all" style="margin: 0; padding: 0">
      {#each choices as choice (choice.iconClass)}
        <button
          type="button"
          class="mn-kind"
          class:selected={pin.iconClass === choice.iconClass}
          on:click={() => {
            picking = false
            if (choice.iconClass !== pin.iconClass)
              dispatch("change", { iconClass: choice.iconClass })
          }}
        >
          <PinArt look={choiceLook(choice.iconClass)} size={34} />
          {choice.label}
        </button>
      {/each}
    </div>
    <button
      type="button"
      class="lp-btn lp-btn-ghost"
      on:click={() => (picking = false)}
    >
      Keep it as it is
    </button>
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
    {:else}
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
      {/if}
    </div>
    {#if pin.note}
      <button
        type="button"
        class="mn-switch"
        role="switch"
        aria-checked={pin.noteVisible}
        on:click={() => dispatch("change", { noteVisible: !pin.noteVisible })}
      >
        <span>Show the note on the map</span>
        <i></i>
      </button>
    {/if}

    <div class="mn-menu-actions">
      <button type="button" on:click={() => (picking = true)}>
        <Shapes size={18} /> Change type
      </button>
      <button type="button" on:click={() => dispatch("move", true)}>
        <Move size={18} /> Move
      </button>
      <button type="button" class="danger" class:armed on:click={remove}>
        <Trash2 size={18} />
        {armed ? "Tap again" : "Remove"}
      </button>
    </div>
  {/if}
</div>
