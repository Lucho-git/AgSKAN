<script lang="ts">
  /**
   * Pins, inside the toolbox. The page is built round the pin buttons on the
   * map (each drops its pin with one tap): they sit in a strip that stays at
   * the top however far the kinds under it are scrolled. Pick a button in
   * the strip (or "Add"), then tap a kind below: a line under the strip asks
   * to change that button to it, and the button changes on the yes. So the
   * controls are always in reach, and a stray tap while scrolling changes
   * nothing.
   *
   * Under the strip: every pin on the farm (and its bins), rounding pins up
   * to delete, and the colour new pins of the kind in hand get.
   */
  import { createEventDispatcher } from "svelte"
  import { ArrowLeft, List, Plus, Search, Trash2, X } from "lucide-svelte"
  import PinArt from "$lib/components/mapnext/PinArt.svelte"
  import {
    grainBinDefaultCapacity,
    grainBinName,
    isGrainBinIcon,
    markerColor,
  } from "$lib/components/map/markers/markerPalette"
  import {
    PIN_DEFAULT,
    pinLabel,
    type PinChoice,
    type PinLook,
  } from "$lib/components/mapnext/pins"
  import { formatAgo } from "$lib/components/mapnext/format"
  import type { LivePin } from "./liveData"

  export let pinChoices: PinChoice[] = []
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
  /** The kinds with a button on the map, the default first. */
  export let quick: string[] = []

  const MOST = 5

  const dispatch = createEventDispatcher<{
    /** The pin buttons on the map, in order: the first is the default. */
    quickKinds: string[]
    colour: { iconClass: string; colour: string }
    lookPin: string
    lasso: void
    /** Open a bin's card: its level and its settings. */
    bin: string
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
    "red",
    "blue",
    "green",
    "orange",
    "yellow",
    "purple",
    "pink",
    "skyblue",
    "random",
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

  $: nameOf = (iconClass: string) =>
    pinChoices.find((choice) => choice.iconClass === iconClass)?.label ?? "Pin"

  // ── The buttons, and changing one ──
  /** The button in hand: its place in `quick`, or one past the end to add. */
  let slot = 0
  /** A kind tapped below, waiting for the yes. */
  let pick: string | null = null
  let kindSearch = ""
  $: if (slot > quick.length) slot = 0
  $: adding = slot >= quick.length
  $: slotKind = adding ? null : quick[slot]
  /** The kind the colour row (and the line about it) is for. */
  $: inHand = pick ?? slotKind ?? quick[0] ?? "default"
  $: inHandColour = typeColours[inHand] ?? "default"
  // "rock pins", "gate pins", and for the plain one just "pins".
  $: kindWords =
    nameOf(inHand) === "Pin" ? "pins" : `${nameOf(inHand).toLowerCase()} pins`

  function choose(index: number) {
    slot = index
    pick = null
  }
  function tapKind(iconClass: string) {
    pick = iconClass === slotKind ? null : iconClass
  }
  function confirm() {
    if (!pick) return
    let next: string[]
    if (adding) {
      if (quick.includes(pick)) return
      next = [...quick, pick].slice(0, MOST)
    } else {
      next = [...quick]
      // Two buttons never drop the same pin: one that has it swaps with
      // this one.
      const other = quick.indexOf(pick)
      if (other >= 0) next[other] = quick[slot]
      next[slot] = pick
    }
    dispatch("quickKinds", next)
    if (adding) slot = Math.min(next.length - 1, slot)
    pick = null
  }
  function removeSlot() {
    if (adding || quick.length < 2) return
    dispatch(
      "quickKinds",
      quick.filter((_, index) => index !== slot),
    )
    slot = 0
    pick = null
  }
  function makeDefault() {
    if (adding || !slotKind) return
    dispatch("quickKinds", [
      slotKind,
      ...quick.filter((kind) => kind !== slotKind),
    ])
    slot = 0
    pick = null
  }

  $: wantedKind = kindSearch.trim().toLowerCase()
  $: kinds = wantedKind
    ? pinChoices.filter((choice) =>
        choice.label.toLowerCase().includes(wantedKind),
      )
    : pinChoices
  $: special = kinds.filter((choice) => SPECIAL[choice.iconClass])
  $: ordinary = kinds.filter((choice) => !SPECIAL[choice.iconClass])

  // ── Every pin on the farm ──
  let listing = false
  let search = ""
  let showing = 40

  // The farm's grain bins, by name, with what is in each.
  $: bins = pins
    .filter((pin) => isGrainBinIcon(pin.iconClass))
    .map((pin) => {
      const size =
        pin.capacity && pin.capacity > 0
          ? pin.capacity
          : grainBinDefaultCapacity(pin.iconClass)
      return {
        pin,
        name: pin.note || grainBinName(pin.iconClass),
        size,
        tonnes: Math.round((size * Math.max(0, Math.min(100, pin.fill))) / 100),
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
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
  <!-- ── Every pin on the farm, its bins first ── -->
  <button
    type="button"
    class="mn-text-button mn-back"
    on:click={() => (listing = false)}
  >
    <ArrowLeft size={16} /> Back to pins
  </button>
  {#if bins.length && !wanted}
    <section class="mn-quickset">
      <p class="lp-eyebrow">Bins</p>
      <ul class="rows">
        {#each bins as bin (bin.pin.id)}
          <li>
            <PinArt look={pinLook(bin.pin)} size={30} />
            <strong>
              {bin.name}
              <small>
                {bin.tonnes} of {bin.size} t{bin.pin.grainType
                  ? ` · ${bin.pin.grainType}`
                  : ""}
              </small>
            </strong>
            <button
              type="button"
              class="make"
              on:click={() => dispatch("bin", bin.pin.id)}
            >
              {guest ? "Open" : "Level, settings"}
            </button>
          </li>
        {/each}
      </ul>
    </section>
  {/if}
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
    <!-- ── The pin buttons on the map: always at the top ── -->
    <div class="top">
      <div class="strip" role="tablist" aria-label="Pin buttons on the map">
        {#each quick as iconClass, index (iconClass)}
          <button
            type="button"
            role="tab"
            class="slot"
            class:on={slot === index}
            aria-selected={slot === index}
            title="{nameOf(iconClass)} button"
            on:click={() => choose(index)}
          >
            <PinArt look={choiceLook(iconClass)} size={32} />
            <span>{nameOf(iconClass)}</span>
            {#if index === 0}<em>Default</em>{/if}
          </button>
        {/each}
        {#if quick.length < MOST}
          <button
            type="button"
            role="tab"
            class="slot new"
            class:on={adding}
            aria-selected={adding}
            on:click={() => choose(quick.length)}
          >
            <i><Plus size={18} strokeWidth={3} /></i>
            <span>Add</span>
          </button>
        {/if}
      </div>

      <!-- What a tap below will do, and the yes that does it. -->
      <div class="ask" class:picked={!!pick}>
        {#if pick}
          <PinArt look={choiceLook(pick)} size={32} />
          <p>
            <b>{nameOf(pick)}</b>
            {#if adding}
              {quick.includes(pick)
                ? "already has a button"
                : "as a new button"}
            {:else}
              in place of {nameOf(slotKind ?? "")}
            {/if}
          </p>
          <button type="button" class="no" on:click={() => (pick = null)}>
            Cancel
          </button>
          <button
            type="button"
            class="yes"
            disabled={adding && quick.includes(pick)}
            on:click={confirm}
          >
            {adding ? "Add" : "Change"}
          </button>
        {:else if adding}
          <p>Tap a pin below to give it a button on the map.</p>
        {:else}
          <p>
            {#if slot === 0}
              Tap a pin below to change the default. A long press on the map
              drops it too.
            {:else}
              Tap a pin below to change this button.
            {/if}
          </p>
          {#if slot > 0}
            <button type="button" class="no" on:click={makeDefault}>
              Make default
            </button>
            <button
              type="button"
              class="no off"
              aria-label="Take the {nameOf(slotKind ?? '')} button off the map"
              title="Take this button off the map"
              on:click={removeSlot}
            >
              <X size={16} />
            </button>
          {/if}
        {/if}
      </div>

      <label class="mn-search find">
        <Search size={17} />
        <input
          type="search"
          bind:value={kindSearch}
          placeholder="Find a kind of pin"
          autocomplete="off"
        />
      </label>
    </div>
  {/if}

  <div class="mn-menu-actions">
    <button type="button" on:click={() => (listing = true)}>
      <List size={18} /> My pins{bins.length ? " and bins" : ""}
    </button>
    {#if !guest}
      <button
        type="button"
        class="danger"
        disabled={!pins.length}
        on:click={() => dispatch("lasso")}
      >
        <Trash2 size={18} /> Delete pins
      </button>
    {/if}
  </div>

  {#if !guest}
    {#if !wantedKind}
      <!-- The kind in hand: what it does, and the colour its pins get. -->
      <section class="mn-pin-kind">
        <div class="top-line">
          <PinArt look={choiceLook(inHand)} size={40} />
          <div>
            <strong>{nameOf(inHand)}</strong>
            <span>
              {SPECIAL[inHand] ??
                "Marks a spot. Add a note, photos or a drawing once it is down."}
            </span>
          </div>
        </div>
        <p class="lp-eyebrow">
          Colour for new {kindWords} ·
          <b>{colourName(inHandColour)}</b>
        </p>
        <div class="mn-swatches" style="--across: 10" role="group">
          {#each COLOURS as key}
            <button
              type="button"
              class:selected={inHandColour === key}
              style="--swatch: {swatch(key)}"
              aria-label={colourName(key)}
              aria-pressed={inHandColour === key}
              on:click={() =>
                inHandColour !== key &&
                dispatch("colour", { iconClass: inHand, colour: key })}
            ></button>
          {/each}
        </div>
      </section>
    {/if}

    {#if special.length}
      <p class="lp-eyebrow">Pins that do more</p>
      <div class="mn-kinds all" style="margin: 0; padding: 0">
        {#each special as choice (choice.iconClass)}
          <button
            type="button"
            class="mn-kind"
            class:selected={(pick ?? slotKind) === choice.iconClass}
            class:has={quick.includes(choice.iconClass)}
            aria-pressed={(pick ?? slotKind) === choice.iconClass}
            on:click={() => tapKind(choice.iconClass)}
          >
            <PinArt look={choiceLook(choice.iconClass)} size={36} />
            {choice.label}
          </button>
        {/each}
      </div>
    {/if}
    {#if ordinary.length}
      <p class="lp-eyebrow">
        {wantedKind ? "Kinds of pin" : "Every kind of pin"}
      </p>
      <div class="mn-kinds all" style="margin: 0; padding: 0">
        {#each ordinary as choice (choice.iconClass)}
          <button
            type="button"
            class="mn-kind"
            class:selected={(pick ?? slotKind) === choice.iconClass}
            class:has={quick.includes(choice.iconClass)}
            aria-pressed={(pick ?? slotKind) === choice.iconClass}
            on:click={() => tapKind(choice.iconClass)}
          >
            <PinArt look={choiceLook(choice.iconClass)} size={36} />
            {choice.label}
          </button>
        {/each}
      </div>
    {/if}
    {#if wantedKind && !kinds.length}
      <p class="mn-empty">No kind of pin by that name.</p>
    {/if}
  {/if}
{/if}

<style>
  /* The strip of buttons, the line under it and the search: one band that
     stays under the toolbox's heading (which is 65px tall and sits 14px
     up, so its foot is at 51px) while the kinds scroll beneath. */
  .top {
    position: sticky;
    top: 51px;
    z-index: 5;
    display: grid;
    flex-shrink: 0;
    gap: 8px;
    margin: -14px calc(-1 * var(--pad)) 0;
    padding: 10px var(--pad);
    background: var(--mn-ground-2);
    box-shadow: inset 0 -1px 0 var(--mn-hair);
  }
  :global(.mn.wide) .top {
    margin-top: -12px;
  }
  .strip {
    display: flex;
    gap: 5px;
  }
  .slot {
    position: relative;
    display: grid;
    flex: 1 1 0;
    justify-items: center;
    gap: 2px;
    min-width: 0;
    max-width: 96px;
    padding: 7px 3px 5px;
    border: 2px solid transparent;
    border-radius: 14px;
    background: var(--mn-block);
    box-shadow: 0 0 0 1px var(--mn-hair);
    color: var(--lp-ink);
  }
  .slot span {
    max-width: 100%;
    overflow: hidden;
    font-size: 0.7rem;
    font-weight: 700;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .slot em {
    position: absolute;
    top: -6px;
    left: 50%;
    padding: 0 5px;
    border-radius: 99px;
    background: var(--lp-ink);
    font-family: var(--lp-mono);
    font-size: 0.5rem;
    font-style: normal;
    font-weight: 700;
    letter-spacing: 0.06em;
    line-height: 1.6;
    color: var(--lp-paper);
    text-transform: uppercase;
    transform: translateX(-50%);
  }
  .slot.on {
    border-color: var(--lp-ink);
    background: var(--mn-pick);
    box-shadow: none;
  }
  .slot.new {
    border-style: dashed;
    border-color: var(--lp-ink-faint);
    background: none;
    box-shadow: none;
  }
  .slot.new.on {
    border-style: solid;
    border-color: var(--lp-ink);
    background: var(--mn-pick);
  }
  .slot.new i {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
  }

  .ask {
    display: flex;
    align-items: center;
    gap: 7px;
    min-height: 40px;
  }
  .ask p {
    flex: 1;
    min-width: 0;
    margin: 0;
    font-size: 0.8rem;
    line-height: 1.3;
    color: var(--lp-ink-soft);
  }
  .ask.picked p {
    font-size: 0.86rem;
    color: var(--lp-ink);
  }
  .ask b {
    display: block;
    overflow: hidden;
    font-weight: 800;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ask button {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    min-height: 40px;
    padding: 0 13px;
    border: 1.5px solid var(--lp-line);
    border-radius: 99px;
    background: var(--mn-block);
    font-size: 0.82rem;
    font-weight: 700;
    color: var(--lp-ink);
    white-space: nowrap;
  }
  .ask .off {
    width: 40px;
    padding: 0;
    color: var(--lp-rust);
  }
  .ask .yes {
    border-color: #15261c;
    background: #f7db5c;
    font-weight: 800;
    color: #15261c;
  }
  .ask .yes:disabled {
    opacity: 0.45;
  }
  .find {
    min-height: 2.6rem;
    border-color: transparent;
    background: var(--mn-block);
    box-shadow: 0 0 0 1px var(--mn-hair);
  }

  .top-line {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .top-line div {
    display: grid;
    min-width: 0;
  }
  .top-line strong {
    font-size: 1rem;
    font-weight: 800;
    line-height: 1.2;
  }
  .top-line span {
    font-size: 0.8rem;
    line-height: 1.3;
    color: var(--lp-ink-soft);
  }

  /* A kind that already has a button on the map carries a dot. */
  .mn-kind {
    position: relative;
  }
  .mn-kind.has::after {
    position: absolute;
    top: 5px;
    right: 5px;
    width: 9px;
    height: 9px;
    border: 1.5px solid var(--mn-block);
    border-radius: 50%;
    background: #1f8a4c;
    content: "";
  }
</style>
