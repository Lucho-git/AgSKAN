<script lang="ts">
  /**
   * Pins, inside the toolbox.
   *
   * At the very top, the two things that aren't about choosing a pin: the
   * list of every pin (and bin) on the farm, and rounding pins up to delete.
   *
   * Then the pin buttons that are on the map, in a strip that stays put
   * while the kinds scroll under it. Nothing is picked to begin with. Tap
   * any pin, in the strip or in the kinds below, and it is "in hand": it is
   * outlined, and the strip grows a row for it with what can be done with
   * that pin: make it the default, give it a button or take its button
   * away, set the colour its new pins get. Each of those shows at once in
   * the strip. The cross puts the pin down again.
   *
   * A search for a kind appears only once the kinds have been scrolled
   * into, where it is wanted, and floats over them without moving them.
   */
  import { createEventDispatcher, onMount } from "svelte"
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

  // Pins that do something more than mark a spot.
  const SPECIAL = new Set([
    "custom-svg-gate",
    "custom-svg-fiver_field_bin_v4",
    "custom-svg-fiver2_mother_bin",
    "custom-svg-rock",
    "custom-svg-rock_pile",
  ])

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

  // ── The pin in hand, and what can be done with it ──
  let inHand: string | null = null
  /** "Add" was tapped: the next pin picked is wanted as a button. */
  let adding = false
  let colouring = false
  $: isDefault = !!inHand && quick[0] === inHand
  $: hasButton = !!inHand && quick.includes(inHand)
  $: handColour = inHand ? (typeColours[inHand] ?? "default") : "default"

  /** The pin whose button has only just been added (its tag says so). */
  let justAdded: string | null = null
  let addedTimer: ReturnType<typeof setTimeout> | undefined
  function pickUp(iconClass: string, fromStrip = false) {
    // "Add" was tapped first: this pin gets a button straight away, and is
    // left in hand for its colour, or to be made the default.
    if (adding && !fromStrip) {
      adding = false
      colouring = false
      inHand = iconClass
      if (!quick.includes(iconClass) && quick.length < MOST) {
        dispatch("quickKinds", [...quick, iconClass])
        justAdded = iconClass
        clearTimeout(addedTimer)
        addedTimer = setTimeout(() => (justAdded = null), 2600)
      }
      return
    }
    if (inHand === iconClass && !adding) {
      putDown()
      return
    }
    inHand = iconClass
    colouring = false
    if (fromStrip) adding = false
  }
  function putDown() {
    inHand = null
    adding = false
    colouring = false
  }
  function wantToAdd() {
    adding = !adding
    inHand = null
    colouring = false
  }
  // The default takes this pin. One that had no button takes the default's
  // place; one that had moves to the front and the old default keeps a
  // button.
  function makeDefault() {
    if (!inHand || isDefault) return
    dispatch(
      "quickKinds",
      hasButton
        ? [inHand, ...quick.filter((kind) => kind !== inHand)]
        : [inHand, ...quick.slice(1)],
    )
    adding = false
  }
  function addButton() {
    if (!inHand || hasButton || quick.length >= MOST) return
    dispatch("quickKinds", [...quick, inHand])
    adding = false
  }
  function removeButton() {
    if (!inHand || !hasButton || quick.length < 2) return
    dispatch(
      "quickKinds",
      quick.filter((kind) => kind !== inHand),
    )
  }

  // ── Finding a kind: offered once the kinds have been scrolled into ──
  let kindSearch = ""
  let band: HTMLElement | undefined
  let mark: HTMLElement | undefined
  let deep = false
  onMount(() => {
    const scroller = document.querySelector(".mn-panel")
    const check = () => {
      if (!band || !mark) return
      deep =
        mark.getBoundingClientRect().top <
        band.getBoundingClientRect().bottom - 60
    }
    scroller?.addEventListener("scroll", check, { passive: true })
    return () => scroller?.removeEventListener("scroll", check)
  })
  $: wantedKind = kindSearch.trim().toLowerCase()
  $: kinds = wantedKind
    ? pinChoices.filter((choice) =>
        choice.label.toLowerCase().includes(wantedKind),
      )
    : pinChoices
  $: special = kinds.filter((choice) => SPECIAL.has(choice.iconClass))
  $: ordinary = kinds.filter((choice) => !SPECIAL.has(choice.iconClass))

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
  <!-- ── Not about choosing a pin: first, out of the way ── -->
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
    <!-- ── The pin buttons on the map, and the pin in hand ── -->
    <div
      class="band"
      bind:this={band}
      role="group"
      aria-label="Pin buttons on the map"
    >
      <div class="strip">
        {#each quick as iconClass, index (iconClass)}
          <button
            type="button"
            class="slot"
            class:on={inHand === iconClass}
            aria-pressed={inHand === iconClass}
            title="{nameOf(iconClass)} button"
            on:click={() => pickUp(iconClass, true)}
          >
            <PinArt look={choiceLook(iconClass)} size={32} />
            <span>{nameOf(iconClass)}</span>
            {#if index === 0}<em>Default</em>{/if}
          </button>
        {/each}
        {#if quick.length < MOST}
          <button
            type="button"
            class="slot new"
            class:on={adding}
            aria-pressed={adding}
            on:click={wantToAdd}
          >
            <i><Plus size={18} strokeWidth={3} /></i>
            <span>Add</span>
          </button>
        {/if}
      </div>

      {#if inHand}
        <!-- The pin in hand: what can be done with it. -->
        <div class="hand">
          <div class="who">
            <PinArt look={choiceLook(inHand)} size={34} />
            <strong>{nameOf(inHand)}</strong>
            {#if justAdded === inHand}
              <em class="added">Button added</em>
            {:else if isDefault}
              <em>Default</em>
            {:else if hasButton}
              <em class="quiet">Has a button</em>
            {/if}
            <button
              type="button"
              class="x"
              aria-label="Put {nameOf(inHand)} down"
              on:click={putDown}
            >
              <X size={18} />
            </button>
          </div>
          <div class="acts">
            {#if !hasButton && quick.length < MOST}
              <button type="button" class="go" on:click={addButton}>
                <Plus size={15} strokeWidth={3} /> Add button
              </button>
            {/if}
            {#if !isDefault}
              <button type="button" class:go={hasButton} on:click={makeDefault}>
                Make default
              </button>
            {/if}
            {#if hasButton && quick.length > 1}
              <button type="button" class="off" on:click={removeButton}>
                Remove button
              </button>
            {/if}
            {#if !hasButton}
              <button
                type="button"
                aria-expanded={colouring}
                on:click={() => (colouring = !colouring)}
              >
                <i class="dot" style="background: {swatch(handColour)}"></i> Colour
              </button>
            {/if}
          </div>
          <!-- (A pin with a button shows its colours straight away.) -->
          {#if hasButton || colouring}
            <div
              class="mn-swatches"
              style="--across: 10"
              role="group"
              aria-label="Colour for new {nameOf(inHand)} pins"
            >
              {#each COLOURS as key}
                <button
                  type="button"
                  class:selected={handColour === key}
                  style="--swatch: {swatch(key)}"
                  aria-label={colourName(key)}
                  title={colourName(key)}
                  aria-pressed={handColour === key}
                  on:click={() =>
                    inHand &&
                    handColour !== key &&
                    dispatch("colour", { iconClass: inHand, colour: key })}
                ></button>
              {/each}
            </div>
          {/if}
        </div>
      {/if}

      {#if deep || wantedKind}
        <!-- (Floats under the band, over the kinds: it moves nothing.) -->
        <label class="mn-search find">
          <Search size={17} />
          <input
            type="search"
            bind:value={kindSearch}
            placeholder="Find a kind of pin"
            autocomplete="off"
          />
        </label>
      {/if}
    </div>

    <span class="mark" bind:this={mark}></span>
    {#if special.length}
      <p class="lp-eyebrow">
        {adding && !inHand ? "Pick a pin to add" : "Pins that do more"}
      </p>
      <div class="mn-kinds all" style="margin: 0; padding: 0">
        {#each special as choice (choice.iconClass)}
          <button
            type="button"
            class="mn-kind"
            class:selected={inHand === choice.iconClass}
            class:has={quick.includes(choice.iconClass)}
            aria-pressed={inHand === choice.iconClass}
            on:click={() => pickUp(choice.iconClass)}
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
            class:selected={inHand === choice.iconClass}
            class:has={quick.includes(choice.iconClass)}
            aria-pressed={inHand === choice.iconClass}
            on:click={() => pickUp(choice.iconClass)}
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
  /* The strip of buttons (and the pin in hand, when there is one): a band
     that stays under the toolbox's heading (which is 65px tall and sits
     14px up, so its foot is at 51px) while the kinds scroll beneath. */
  .band {
    position: sticky;
    top: 51px;
    z-index: 5;
    display: grid;
    flex-shrink: 0;
    gap: 8px;
    margin: 0 calc(-1 * var(--pad));
    padding: 9px var(--pad) 10px;
    background: var(--mn-ground-2);
    box-shadow:
      inset 0 1px 0 var(--mn-hair),
      inset 0 -1px 0 var(--mn-hair);
  }
  .strip {
    display: flex;
    gap: 5px;
    padding-top: 5px;
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

  /* The pin in hand: a block of its own in the band. */
  .hand {
    display: grid;
    gap: 8px;
    padding: 8px 8px 9px 10px;
    border: 2px solid var(--lp-ink);
    border-radius: 14px;
    background: var(--mn-block);
  }
  .who {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .who strong {
    min-width: 0;
    overflow: hidden;
    font-size: 1rem;
    font-weight: 800;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .who em {
    flex-shrink: 0;
    padding: 1px 7px;
    border-radius: 99px;
    background: var(--lp-ink);
    font-family: var(--lp-mono);
    font-size: 0.58rem;
    font-style: normal;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--lp-paper);
    text-transform: uppercase;
  }
  /* Just given a button: the tag says so, and pops. */
  .who em.added {
    background: #1f8a4c;
    color: #fff;
    animation: added 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }
  @keyframes added {
    from {
      opacity: 0;
      transform: scale(0.5);
    }
  }
  .who em.quiet {
    background: var(--lp-paper-2);
    color: var(--lp-ink);
  }
  .who .x {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    margin-left: auto;
    border-radius: 50%;
    color: var(--lp-ink-soft);
  }
  .who .x:hover {
    background: var(--lp-paper-2);
  }
  .acts {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .acts button {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-height: 40px;
    padding: 0 12px;
    border: 1.5px solid var(--lp-line);
    border-radius: 99px;
    background: var(--lp-paper);
    font-size: 0.82rem;
    font-weight: 700;
    color: var(--lp-ink);
    white-space: nowrap;
  }
  .acts button:hover {
    border-color: var(--lp-ink);
  }
  .acts .go {
    --lp-ink: #15261c;
    border-color: #15261c;
    background: #f7db5c;
    font-weight: 800;
    color: #15261c;
  }
  .acts .off {
    color: var(--lp-rust);
  }
  .acts .dot {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    box-shadow: 0 0 0 1.5px var(--lp-line);
  }

  /* Finding a kind: hangs under the band, over the kinds. */
  .find {
    position: absolute;
    top: calc(100% + 6px);
    right: var(--pad);
    left: var(--pad);
    min-height: 2.6rem;
    border-color: var(--lp-ink);
    background: var(--mn-block);
    box-shadow: 0 10px 22px -10px rgba(10, 25, 15, 0.7);
  }
  .mark {
    display: block;
    height: 0;
    margin: -7px 0;
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
