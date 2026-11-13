<script lang="ts">
  /**
   * Pins, inside the toolbox: choose what you drop and the colour that kind
   * of pin gets, look through every pin on the farm, or round up a lot of
   * them to remove.
   */
  import { createEventDispatcher } from "svelte"
  import { ArrowLeft, Lasso, List, Search } from "lucide-svelte"
  import PinArt from "$lib/components/mapnext/PinArt.svelte"
  import { markerColor } from "$lib/components/map/markers/markerPalette"
  import {
    PIN_DEFAULT,
    pinLabel,
    type PinChoice,
    type PinLook,
  } from "$lib/components/mapnext/pins"
  import { formatAgo } from "$lib/components/mapnext/format"
  import type { LivePin } from "./liveData"

  export let pinChoices: PinChoice[] = []
  export let pinKind = "default"
  /** How a pin of a kind looks when this person drops one (their colours). */
  export let choiceLook: (iconClass: string) => PinLook
  /** How a pin on the map is drawn for this person. */
  export let pinLook: (pin: LivePin) => PinLook
  /** Every pin on the farm, the newest first. */
  export let pins: LivePin[] = []
  /** The colour this person has set for each kind of pin, by icon class. */
  export let typeColours: Record<string, string> = {}
  /** People's names by id, for who last changed a pin. */
  export let names: Record<string, string> = {}
  export let guest = false

  const dispatch = createEventDispatcher<{
    pinKind: string
    dropPins: void
    colour: { iconClass: string; colour: string }
    lookPin: string
    lasso: void
  }>()

  // Pins that do something more than mark a spot, and what that is.
  const SPECIAL: Record<string, string> = {
    "custom-svg-gate":
      "A gate can be marked open or closed, and the pin shows which.",
    "custom-svg-fiver_field_bin_v4":
      "A field bin holds grain: say what is in it and how full it is, and the pin shows the level.",
    "custom-svg-fiver2_mother_bin":
      "A mother bin works like a field bin, with more room in it.",
    "custom-svg-rock":
      "A rock can be ticked as picked once it has been dealt with.",
    "custom-svg-rock_pile":
      "A rock pile can be ticked as picked once it has been cleared.",
  }

  // "default" follows the colour all your pins get; then the current
  // viewer's choices, in its order.
  const COLOURS = [
    "default",
    "random",
    "red",
    "blue",
    "green",
    "orange",
    "yellow",
    "purple",
    "pink",
    "skyblue",
  ]
  const swatch = (key: string) =>
    key === "default"
      ? PIN_DEFAULT
      : key === "random"
        ? "conic-gradient(#ef4444, #f59e0b, #facc15, #22c55e, #38bdf8, #a855f7, #ef4444)"
        : markerColor(key, "circle-fill").dark
  const colourName = (key: string) =>
    key === "default"
      ? "Default"
      : key === "random"
        ? "A different one each"
        : key

  let listing = false
  let search = ""
  let showing = 40

  $: special = pinChoices.filter((choice) => SPECIAL[choice.iconClass])
  $: ordinary = pinChoices.filter((choice) => !SPECIAL[choice.iconClass])
  $: chosen = pinChoices.find((choice) => choice.iconClass === pinKind)
  $: chosenColour = typeColours[pinKind] ?? "default"
  // "rock pins", "gate pins", and for the plain one just "pins".
  $: kindWords =
    !chosen || chosen.label === "Pin"
      ? "pins"
      : `${chosen.label.toLowerCase()} pins`
  $: wanted = search.trim().toLowerCase()
  $: found = wanted
    ? pins.filter(
        (pin) =>
          pin.note.toLowerCase().includes(wanted) ||
          pinLabel(pin.iconClass).toLowerCase().includes(wanted),
      )
    : pins
</script>

{#if listing}
  <!-- ── Every pin on the farm ── -->
  <button
    type="button"
    class="mn-text-button mn-back"
    on:click={() => (listing = false)}
  >
    <ArrowLeft size={16} /> Back to pins
  </button>
  <label class="mn-search">
    <Search size={18} />
    <input
      type="search"
      bind:value={search}
      placeholder="Find a pin by its note or kind"
      autocomplete="off"
    />
  </label>
  <p class="lp-eyebrow">
    {found.length}
    {found.length === 1 ? "pin" : "pins"} · newest first
  </p>
  {#if found.length}
    <div class="mn-tools">
      {#each found.slice(0, showing) as pin (pin.id)}
        <button
          type="button"
          class="mn-tool"
          on:click={() => dispatch("lookPin", pin.id)}
        >
          <PinArt look={pinLook(pin)} size={34} />
          <span class="text">
            <strong>{pin.note || pinLabel(pin.iconClass)}</strong>
            <span>
              {[
                ...(pin.note ? [pinLabel(pin.iconClass)] : []),
                `Dropped ${formatAgo(pin.t)}`,
                ...(pin.by && names[pin.by]
                  ? [`last changed by ${names[pin.by]}`]
                  : []),
              ].join(" · ")}
            </span>
          </span>
        </button>
      {/each}
    </div>
    {#if found.length > showing}
      <button
        type="button"
        class="lp-btn lp-btn-ghost"
        on:click={() => (showing += 40)}
      >
        Show more
      </button>
    {/if}
  {:else}
    <p class="mn-empty">
      {pins.length ? "No pin matches that." : "No pins on this farm yet."}
    </p>
  {/if}
{:else}
  {#if !guest}
    <button
      type="button"
      class="lp-btn lp-btn-primary"
      on:click={() => dispatch("dropPins")}
    >
      Drop {kindWords}
    </button>

    <!-- The kind chosen: what it does, and the colour its pins get. -->
    <section class="mn-pin-kind">
      <div class="top">
        <PinArt look={choiceLook(pinKind)} size={44} />
        <div>
          <strong>{chosen?.label ?? "Pin"}</strong>
          <span>
            {SPECIAL[pinKind] ??
              "Marks a spot. Add a note, photos or a drawing once it is down."}
          </span>
        </div>
      </div>
      <p class="lp-eyebrow">
        Colour for new {kindWords} ·
        <b>{colourName(chosenColour)}</b>
      </p>
      <div class="mn-swatches" style="--across: 10" role="group">
        {#each COLOURS as key}
          <button
            type="button"
            class:selected={chosenColour === key}
            style="--swatch: {swatch(key)}"
            aria-label={colourName(key)}
            aria-pressed={chosenColour === key}
            on:click={() =>
              chosenColour !== key &&
              dispatch("colour", { iconClass: pinKind, colour: key })}
          ></button>
        {/each}
      </div>
    </section>
  {/if}

  <div class="mn-menu-actions">
    <button type="button" on:click={() => (listing = true)}>
      <List size={18} /> All {pins.length} pins
    </button>
    {#if !guest}
      <button
        type="button"
        disabled={!pins.length}
        on:click={() => dispatch("lasso")}
      >
        <Lasso size={18} /> Remove several
      </button>
    {/if}
  </div>

  {#if !guest}
    {#if special.length}
      <p class="lp-eyebrow">Pins that do more</p>
      <div class="mn-kinds all" style="margin: 0; padding: 0">
        {#each special as choice (choice.iconClass)}
          <button
            type="button"
            class="mn-kind"
            class:selected={pinKind === choice.iconClass}
            aria-pressed={pinKind === choice.iconClass}
            on:click={() => dispatch("pinKind", choice.iconClass)}
          >
            <PinArt look={choiceLook(choice.iconClass)} size={36} />
            {choice.label}
          </button>
        {/each}
      </div>
    {/if}
    <p class="lp-eyebrow">Every kind of pin</p>
    <div class="mn-kinds all" style="margin: 0; padding: 0">
      {#each ordinary as choice (choice.iconClass)}
        <button
          type="button"
          class="mn-kind"
          class:selected={pinKind === choice.iconClass}
          aria-pressed={pinKind === choice.iconClass}
          on:click={() => dispatch("pinKind", choice.iconClass)}
        >
          <PinArt look={choiceLook(choice.iconClass)} size={36} />
          {choice.label}
        </button>
      {/each}
    </div>
  {/if}
{/if}
