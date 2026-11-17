<script lang="ts">
  /**
   * A grain bin (a field bin or a mother bin): the one menu a bin has,
   * whether it is opened by tapping the bin, from its button on the map, or
   * from the Pins tool. It is kept small, after the current viewer's bin
   * panel: how much is in it, and one line to change that (add, take or set
   * a number of tonnes). The cog swaps that line for the bin's settings:
   * what goes in it and how much it takes, with suggestions that only show
   * while a box is being typed in, and the rest folded under "More".
   * Everything is saved as it is changed.
   */
  import { createEventDispatcher } from "svelte"
  import { Check, LocateFixed, Settings, X } from "lucide-svelte"
  import PinArt from "$lib/components/mapnext/PinArt.svelte"
  import Dropdown from "$lib/components/mapnext/Dropdown.svelte"
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
    /** Open it as an ordinary pin: its note, photos, moving and removing. */
    pin: void
  }>()

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
  const MODES = [
    { value: "add", label: "Add" },
    { value: "take", label: "Take" },
    { value: "set", label: "Set to" },
  ]

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
  $: name = pin.note || grainBinName(pin.iconClass)
  $: tint = markerColor(siloColorKey(pin.grainColour), "circle-fill").dark
  $: holding = pin.grainType.trim()

  // ── The level: add, take or set a number of tonnes ──
  let settings = false
  let mode = "add"
  let amount: number | null = null
  /** What happened, when it wasn't quite what was typed. */
  let said = ""
  function apply() {
    const t = Number(amount)
    if (amount === null || !Number.isFinite(t) || t < 0) return
    if (t === 0 && mode !== "set") return
    const want = mode === "add" ? tonnes + t : mode === "take" ? tonnes - t : t
    const next = Math.max(0, Math.min(capacity, want))
    said =
      want > capacity
        ? `It only takes ${show(capacity)} t, so it is full.`
        : want < 0
          ? `There were only ${show(tonnes)} t in it, so it is empty.`
          : ""
    if (next !== tonnes) dispatch("change", { fill: (next / capacity) * 100 })
    amount = null
  }

  // ── Settings ──
  /** The box being typed in: its suggestions show only meanwhile. */
  let typing: "grain" | "size" | null = null
  let leaving: ReturnType<typeof setTimeout>
  const enter = (box: "grain" | "size") => {
    clearTimeout(leaving)
    typing = box
  }
  // (A moment's grace, so a tap on a suggestion lands before they go.)
  const leave = () => {
    clearTimeout(leaving)
    leaving = setTimeout(() => (typing = null), 160)
  }
  let more = false

  // The boxes follow the bin, and are saved when left.
  let grain = pin.grainType
  let size: number | null = capacity
  let shownFor = `${pin.id}|${pin.grainType}|${capacity}`
  $: if (shownFor !== `${pin.id}|${pin.grainType}|${capacity}`) {
    shownFor = `${pin.id}|${pin.grainType}|${capacity}`
    grain = pin.grainType
    size = capacity
  }
  $: offers = [...new Set([...known, ...GRAINS])]
    .filter((offer) => offer.toLowerCase() !== grain.trim().toLowerCase())
    .slice(0, 6)
  function saveGrain(value = grain) {
    const next = value.trim().slice(0, 40)
    grain = next
    if (next !== pin.grainType) dispatch("change", { grainType: next })
  }
  // A new size keeps the tonnes that are in it (as far as they fit).
  function saveSize(value: number | null = size) {
    const wanted = Math.round(Number(value))
    if (!Number.isFinite(wanted) || wanted < 1) {
      size = capacity
      return
    }
    const next = Math.min(MOST, wanted)
    size = next
    if (next === capacity) return
    dispatch("change", {
      capacity: next,
      fill: Math.min(100, (tonnes / next) * 100),
    })
  }
</script>

<div class="mn-card mn-menu mn-bin" style="--c: {tint}">
  <div class="head">
    <span class="art"><PinArt {look} size={44} /></span>
    <div class="about">
      <h2>{name}</h2>
      <p>
        {holding || "Nothing said to be in it"} ·
        <b>{show(tonnes)}</b> of {show(capacity)} t
      </p>
    </div>
    {#if !guest}
      <button
        type="button"
        class="mn-icon-button"
        class:on={settings}
        aria-label="Bin settings"
        aria-pressed={settings}
        on:click={() => (settings = !settings)}
      >
        <Settings size={20} />
      </button>
    {/if}
    <button
      type="button"
      class="mn-icon-button"
      aria-label="Find it on the map"
      on:click={() => dispatch("find")}
    >
      <LocateFixed size={20} />
    </button>
    <button
      type="button"
      class="mn-icon-button"
      aria-label="Close"
      on:click={() => dispatch("close")}
    >
      <X size={22} />
    </button>
  </div>

  <div class="bar" aria-label="{Math.round(fill)}% full">
    <i style="width: {fill}%"></i>
    <span>{Math.round(fill)}%</span>
  </div>

  {#if !guest && !settings}
    <!-- ── Add, take or set tonnes ── -->
    <form class="move" on:submit|preventDefault={apply}>
      <div class="how">
        <Dropdown
          look="row"
          value={mode}
          options={MODES}
          on:change={(e) => (mode = e.detail)}
        />
      </div>
      <label class="amount">
        <input
          type="number"
          inputmode="decimal"
          min="0"
          step="any"
          bind:value={amount}
          placeholder="0"
          aria-label="Tonnes"
          on:input={() => (said = "")}
        />
        <span>t</span>
      </label>
      <button
        type="submit"
        class="lp-btn lp-btn-primary"
        aria-label="Do it"
        disabled={amount === null}
      >
        <Check size={20} strokeWidth={3} />
      </button>
    </form>
    {#if said}<p class="mn-note">{said}</p>{/if}
  {:else if !guest}
    <!-- ── Settings: what goes in it, how much it takes ── -->
    <label class="box">
      <span>What goes in it</span>
      <input
        type="text"
        bind:value={grain}
        placeholder="Wheat, barley, canola…"
        maxlength="40"
        autocomplete="off"
        on:focus={() => enter("grain")}
        on:blur={() => {
          saveGrain()
          leave()
        }}
        on:keydown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
    </label>
    {#if typing === "grain" && offers.length}
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div class="mn-chips" on:mousedown|preventDefault>
        {#each offers as offer}
          <button type="button" on:click={() => saveGrain(offer)}>
            {offer}
          </button>
        {/each}
      </div>
    {/if}
    <label class="box">
      <span>Holds, in tonnes</span>
      <input
        type="number"
        inputmode="numeric"
        min="1"
        max={MOST}
        step="1"
        bind:value={size}
        on:focus={() => enter("size")}
        on:blur={() => {
          saveSize()
          leave()
        }}
        on:keydown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
    </label>
    {#if typing === "size"}
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div class="mn-chips" on:mousedown|preventDefault>
        {#each SIZES as option}
          <button
            type="button"
            aria-pressed={capacity === option}
            on:click={() => saveSize(option)}>{option} t</button
          >
        {/each}
      </div>
    {/if}
    <button
      type="button"
      class="mn-text-button"
      aria-expanded={more}
      on:click={() => (more = !more)}
    >
      {more ? "Less" : "More: colour, map button, pin"}
    </button>
    {#if more}
      <div class="mn-swatches" style="--across: {COLOURS.length}" role="group">
        {#each COLOURS as key}
          <button
            type="button"
            class:selected={siloColorKey(pin.grainColour) === key}
            style="--swatch: {markerColor(key, 'circle-fill').dark}"
            aria-label="Colour: {key}"
            aria-pressed={siloColorKey(pin.grainColour) === key}
            on:click={() =>
              siloColorKey(pin.grainColour) !== key &&
              dispatch("change", { grainColour: key })}
          ></button>
        {/each}
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
      <button
        type="button"
        class="lp-btn lp-btn-ghost"
        on:click={() => dispatch("pin")}
      >
        Its note, photos, moving or removing it
      </button>
    {/if}
  {/if}
</div>

<style>
  .mn-bin {
    display: grid;
    gap: 9px;
  }
  .mn-bin .head {
    gap: 6px;
  }
  .mn-bin .head .art {
    width: 46px;
    height: 46px;
    margin-right: 4px;
    background: none;
  }
  .mn-bin .about b {
    color: var(--lp-ink);
  }
  .mn-bin .head .mn-icon-button {
    width: 38px;
    height: 38px;
    color: var(--lp-ink);
  }
  .mn-bin .head .mn-icon-button.on {
    border-radius: 12px;
    background: var(--lp-ink);
    color: var(--lp-paper);
  }
  /* The level, as a bar in the grain's colour. */
  .bar {
    position: relative;
    height: 22px;
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
  .bar span {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--lp-mono);
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--lp-ink);
  }
  /* One line: what to do, how many tonnes, do it. */
  .move {
    display: flex;
    align-items: stretch;
    gap: 6px;
  }
  .how {
    flex: 0 0 7.2rem;
    min-width: 0;
  }
  .amount {
    display: flex;
    flex: 1;
    align-items: center;
    min-width: 0;
    padding-right: 12px;
    border: 1.5px solid var(--lp-line);
    border-radius: 13px;
    background: var(--lp-paper);
  }
  .amount:focus-within,
  .box:focus-within {
    border-color: var(--lp-ink);
  }
  .amount input {
    flex: 1;
    width: 100%;
    min-width: 0;
    min-height: 2.9rem;
    padding: 0 6px 0 14px;
    background: none;
    font-family: var(--lp-display);
    font-size: 1.25rem;
    font-weight: 800;
    color: var(--lp-ink);
    outline: none;
  }
  .amount span {
    font-family: var(--lp-mono);
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--lp-ink-soft);
  }
  .move .lp-btn {
    min-width: 3.2rem;
    min-height: 2.9rem;
    padding-inline: 0;
  }
  /* A settings box: its name on the left, what was typed on the right. */
  .box {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 12px;
    border: 1.5px solid var(--lp-line);
    border-radius: 13px;
    background: var(--lp-paper);
  }
  .box span {
    flex-shrink: 0;
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--lp-ink-soft);
  }
  .box input {
    flex: 1;
    width: 100%;
    min-width: 0;
    min-height: 2.6rem;
    background: none;
    font-size: 0.98rem;
    font-weight: 700;
    color: var(--lp-ink);
    text-align: right;
    outline: none;
  }
  .mn-bin .mn-text-button {
    justify-self: start;
  }
</style>
