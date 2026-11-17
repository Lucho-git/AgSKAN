<script lang="ts">
  /**
   * A grain bin (a field bin or a mother bin), opened from its button on the
   * map, from its pin, or from the Pins tool. Two sides: how much is in it,
   * changed in tonnes; and its settings, which are what it holds, the colour
   * it is drawn in, how much it takes, and whether it has a button on the
   * map. Everything is saved as it is changed.
   */
  import { createEventDispatcher } from "svelte"
  import { LocateFixed, Minus, Plus, X } from "lucide-svelte"
  import PinArt from "$lib/components/mapnext/PinArt.svelte"
  import {
    grainBinDefaultCapacity,
    grainBinName,
    markerColor,
    siloColorKey,
  } from "$lib/components/map/markers/markerPalette"
  import type { PinLook } from "$lib/components/mapnext/pins"
  import type { LivePin, PinPatch } from "./liveData"

  export let pin: LivePin
  export let look: PinLook
  /** Someone looking on sees the level, and changes nothing. */
  export let guest = false
  /** What the farm's other bins hold, to offer again. */
  export let known: string[] = []

  const dispatch = createEventDispatcher<{
    close: void
    /** Go to it on the map. */
    find: void
    change: PinPatch
  }>()

  let tab: "level" | "settings" = "level"

  const GRAINS = ["Wheat", "Barley", "Canola", "Oats", "Lupins", "Peas"]
  const COLOURS = [
    "yellow",
    "orange",
    "red",
    "green",
    "blue",
    "skyblue",
    "purple",
    "pink",
  ]
  const SIZES = [30, 60, 100, 150, 300]
  const MOST = 5000

  const round = (t: number) => Math.round(t * 100) / 100
  /** "62", "7.5": whole tonnes once there are ten of them. */
  const show = (t: number) =>
    t >= 10 ? String(Math.round(t)) : String(Math.round(t * 10) / 10)

  $: capacity =
    pin.capacity && pin.capacity > 0
      ? pin.capacity
      : grainBinDefaultCapacity(pin.iconClass)
  $: fill = Math.max(0, Math.min(100, pin.fill || 0))
  $: tonnes = round((capacity * fill) / 100)
  $: free = round(capacity - tonnes)
  $: name = pin.note || grainBinName(pin.iconClass)
  $: tint = markerColor(siloColorKey(pin.grainColour), "circle-fill").dark
  $: step = capacity <= 60 ? 0.5 : 1
  $: holding = pin.grainType.trim()
  $: offers = [...new Set([...known, ...GRAINS])]
    .filter((grain) => grain.toLowerCase() !== holding.toLowerCase())
    .slice(0, 8)

  // The box for what it holds follows the bin, and is saved when left.
  let grain = pin.grainType
  let grainOf = pin.id
  let grainSaved = pin.grainType
  $: if (pin.id !== grainOf || pin.grainType !== grainSaved) {
    grainOf = pin.id
    grainSaved = pin.grainType
    grain = pin.grainType
  }
  function saveGrain(value = grain) {
    const next = value.trim().slice(0, 40)
    grain = next
    if (next !== pin.grainType) dispatch("change", { grainType: next })
  }

  function setTonnes(next: number) {
    const t = Math.max(0, Math.min(capacity, next))
    if (t !== tonnes) dispatch("change", { fill: (t / capacity) * 100 })
  }
  // A new size keeps the tonnes that are in it (as far as they fit).
  function setCapacity(next: number) {
    const size = Math.max(1, Math.min(MOST, Math.round(next)))
    if (size === capacity) return
    dispatch("change", {
      capacity: size,
      fill: Math.min(100, (tonnes / size) * 100),
    })
  }
</script>

<div class="mn-card mn-menu mn-bin" style="--c: {tint}">
  <div class="head">
    <span class="art"><PinArt {look} size={46} /></span>
    <div class="about">
      <h2>{name}</h2>
      <p>{holding || "Nothing said to be in it"} · holds {show(capacity)} t</p>
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

  {#if !guest}
    <div class="mn-tabs" role="tablist" aria-label="Level and settings">
      <button
        type="button"
        role="tab"
        aria-selected={tab === "level"}
        on:click={() => (tab = "level")}
      >
        Level
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={tab === "settings"}
        on:click={() => (tab = "settings")}
      >
        Settings
      </button>
    </div>
  {/if}

  {#if tab === "level" || guest}
    <!-- ── How much is in it ── -->
    <div class="gauge">
      <p>
        <b>{show(tonnes)} t</b>
        <span>{Math.round(fill)}% full · room for {show(free)} t</span>
      </p>
      <div class="bar" aria-hidden="true"><i style="width: {fill}%"></i></div>
    </div>
    {#if !guest}
      <input
        class="mn-scrub"
        type="range"
        min="0"
        max={capacity}
        {step}
        value={tonnes}
        aria-label="Tonnes in the bin"
        style="--done: {fill}%"
        on:change={(e) => setTonnes(Number(e.currentTarget.value))}
      />
      <div class="steps" role="group" aria-label="Add or take grain">
        <button
          type="button"
          disabled={tonnes <= 0}
          on:click={() => setTonnes(tonnes - 10)}
        >
          <Minus size={14} strokeWidth={3} />10 t
        </button>
        <button
          type="button"
          disabled={tonnes <= 0}
          on:click={() => setTonnes(tonnes - 1)}
        >
          <Minus size={14} strokeWidth={3} />1 t
        </button>
        <button
          type="button"
          disabled={free <= 0}
          on:click={() => setTonnes(tonnes + 1)}
        >
          <Plus size={14} strokeWidth={3} />1 t
        </button>
        <button
          type="button"
          disabled={free <= 0}
          on:click={() => setTonnes(tonnes + 10)}
        >
          <Plus size={14} strokeWidth={3} />10 t
        </button>
      </div>
    {/if}
    <div class="mn-menu-actions">
      {#if !guest}
        <button
          type="button"
          disabled={tonnes <= 0}
          on:click={() => setTonnes(0)}
        >
          Empty
        </button>
        <button
          type="button"
          disabled={free <= 0}
          on:click={() => setTonnes(capacity)}
        >
          Full
        </button>
      {/if}
      <button type="button" on:click={() => dispatch("find")}>
        <LocateFixed size={17} /> Find it
      </button>
    </div>
  {:else}
    <!-- ── What it holds, how much it takes, its button ── -->
    <div class="set">
      <p class="lp-eyebrow">What goes in it</p>
      <input
        type="text"
        bind:value={grain}
        placeholder="Wheat, barley, canola…"
        aria-label="What the bin holds"
        maxlength="40"
        autocomplete="off"
        on:blur={() => saveGrain()}
        on:keydown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
      <div class="mn-chips" role="group" aria-label="Common grains">
        {#each offers as offer}
          <button type="button" on:click={() => saveGrain(offer)}>
            {offer}
          </button>
        {/each}
      </div>
    </div>

    <div class="set">
      <p class="lp-eyebrow">Its colour on the map</p>
      <div class="mn-swatches" style="--across: {COLOURS.length}" role="group">
        {#each COLOURS as key}
          <button
            type="button"
            class:selected={siloColorKey(pin.grainColour) === key}
            style="--swatch: {markerColor(key, 'circle-fill').dark}"
            aria-label={key}
            aria-pressed={siloColorKey(pin.grainColour) === key}
            on:click={() =>
              siloColorKey(pin.grainColour) !== key &&
              dispatch("change", { grainColour: key })}
          ></button>
        {/each}
      </div>
    </div>

    <div class="set">
      <div class="mn-width">
        <span class="lp-eyebrow">How much it takes</span>
        <span class="stepper">
          <button
            type="button"
            aria-label="Smaller"
            disabled={capacity <= 1}
            on:click={() => setCapacity(capacity - (capacity > 100 ? 10 : 5))}
            ><Minus size={20} /></button
          >
          <b>{show(capacity)}<small>t</small></b>
          <button
            type="button"
            aria-label="Bigger"
            disabled={capacity >= MOST}
            on:click={() => setCapacity(capacity + (capacity >= 100 ? 10 : 5))}
            ><Plus size={20} /></button
          >
        </span>
      </div>
      <div class="mn-chips" role="group" aria-label="Common sizes">
        {#each SIZES as size}
          <button
            type="button"
            aria-pressed={capacity === size}
            on:click={() => setCapacity(size)}>{size} t</button
          >
        {/each}
      </div>
    </div>

    <button
      type="button"
      class="mn-switch"
      role="switch"
      aria-checked={pin.binButton}
      on:click={() => dispatch("change", { binButton: !pin.binButton })}
    >
      <span>A button for it on the map</span>
      <i></i>
    </button>
  {/if}
</div>

<style>
  .mn-bin {
    display: grid;
    gap: 10px;
  }
  .mn-bin .head .art {
    background: none;
  }
  .mn-bin .mn-tabs {
    justify-self: start;
  }
  .gauge {
    display: grid;
    gap: 6px;
  }
  .gauge p {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
  }
  .gauge b {
    font-family: var(--lp-display);
    font-size: 1.9rem;
    font-weight: 800;
    letter-spacing: -0.02em;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .gauge span {
    font-size: 0.82rem;
    color: var(--lp-ink-soft);
    text-align: right;
  }
  .bar {
    height: 14px;
    overflow: hidden;
    border: 1.5px solid var(--lp-ink);
    border-radius: 99px;
    background: var(--lp-paper);
  }
  .bar i {
    display: block;
    height: 100%;
    background: var(--c);
    transition: width 0.25s ease;
  }
  .steps {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
  }
  .steps button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 3px;
    min-height: 42px;
    border: 1.5px solid var(--lp-line);
    border-radius: 13px;
    background: var(--lp-paper);
    font-family: var(--lp-mono);
    font-size: 0.82rem;
    font-weight: 700;
    color: var(--lp-ink);
  }
  .steps button:hover:not(:disabled) {
    border-color: var(--lp-ink);
  }
  .steps button:disabled,
  .mn-menu-actions button:disabled {
    opacity: 0.4;
  }
  .set {
    display: grid;
    gap: 6px;
  }
  .set input[type="text"] {
    min-height: 2.8rem;
    padding: 0 14px;
    border: 1.5px solid var(--lp-line);
    border-radius: 13px;
    background: var(--lp-paper);
    font-size: 1rem;
    color: var(--lp-ink);
  }
  .set input[type="text"]:focus {
    border-color: var(--lp-ink);
    outline: none;
  }
</style>
