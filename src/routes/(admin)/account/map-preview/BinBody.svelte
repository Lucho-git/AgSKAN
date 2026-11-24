<script lang="ts">
  /**
   * What a grain bin's menu holds, laid out as the current viewer's bin
   * panel is: two tabs. Fill is one bar that shows how full it is and is
   * dragged to change it, with the tonnes under it, and a box to add or
   * take a number of tonnes. Settings
   * is what it is storing, its size, its colour, whether it has a button on
   * the map, and removing it. Everything is saved as it is changed.
   */
  import { createEventDispatcher } from "svelte"
  import { Minus, Move, Plus, Trash2 } from "lucide-svelte"
  import {
    grainBinDefaultCapacity,
    markerColor,
    siloColorKey,
  } from "$lib/components/map/markers/markerPalette"
  import type { LivePin, PinPatch } from "./liveData"

  export let pin: LivePin
  /** Someone looking on sees the level, and changes nothing. */
  export let guest = false
  /** Offer to move it (when its menu sits beside it on the map). */
  export let canMove = false
  /** What the farm's other bins store, offered as the box is typed in. */
  export let grains: string[] = []

  const dispatch = createEventDispatcher<{
    change: PinPatch
    move: void
    remove: void
  }>()

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
  const MOST = 5000

  let tab: "fill" | "settings" = "fill"

  $: capacity =
    pin.capacity && pin.capacity > 0
      ? pin.capacity
      : grainBinDefaultCapacity(pin.iconClass)
  $: tint = markerColor(siloColorKey(pin.grainColour), "circle-fill").dark

  // The bar is the slider: it follows a finger (or the mouse) anywhere
  // along it, and saves when it is let go. It is drawn and dragged here
  // rather than left to the browser's own slider, which could be seen but
  // not moved on some screens.
  let bar: HTMLDivElement
  let dragging = false
  const along = (e: PointerEvent) => {
    const box = bar.getBoundingClientRect()
    const part = (e.clientX - box.left) / Math.max(1, box.width)
    return Math.round(Math.max(0, Math.min(1, part)) * 100)
  }
  function grab(e: PointerEvent) {
    if (guest) return
    e.preventDefault()
    dragging = true
    bar.setPointerCapture?.(e.pointerId)
    fill = along(e)
  }
  function drag(e: PointerEvent) {
    if (dragging) fill = along(e)
  }
  function drop() {
    if (!dragging) return
    dragging = false
    if (fill !== pin.fill) dispatch("change", { fill })
  }
  function nudge(e: KeyboardEvent) {
    if (guest) return
    const by = e.shiftKey ? 10 : 1
    const next =
      e.key === "ArrowLeft" || e.key === "ArrowDown"
        ? fill - by
        : e.key === "ArrowRight" || e.key === "ArrowUp"
          ? fill + by
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? 100
              : null
    if (next === null) return
    e.preventDefault()
    fill = Math.round(Math.max(0, Math.min(100, next)))
    if (fill !== pin.fill) dispatch("change", { fill })
  }

  let fill = pin.fill
  let saved = pin.fill
  $: if (pin.fill !== saved) {
    saved = pin.fill
    fill = pin.fill
  }
  $: tonnes = (capacity * Math.max(0, Math.min(100, fill))) / 100

  // Add or take a number of tonnes.
  let delta: number | null = null
  let hint = false
  function applyDelta(sign: 1 | -1) {
    const t = Number(delta)
    if (delta === null || !(t > 0)) {
      hint = true
      return
    }
    hint = false
    const next = Math.max(0, Math.min(capacity, tonnes + sign * t))
    dispatch("change", { fill: (next / capacity) * 100 })
    delta = null
  }

  // Settings: each box follows the bin and saves when it is left.
  let storing = pin.grainType
  let size: number | null = capacity
  let shownFor = `${pin.id}|${pin.grainType}|${capacity}`
  $: if (shownFor !== `${pin.id}|${pin.grainType}|${capacity}`) {
    shownFor = `${pin.id}|${pin.grainType}|${capacity}`
    storing = pin.grainType
    size = capacity
  }
  function saveStoring() {
    const next = storing.trim().slice(0, 40)
    storing = next
    if (next !== pin.grainType) dispatch("change", { grainType: next })
  }
  // A new size keeps the tonnes that are in it (as far as they fit).
  function saveSize() {
    const wanted = Math.round(Number(size))
    if (!Number.isFinite(wanted) || wanted < 1) {
      size = capacity
      return
    }
    const next = Math.min(MOST, wanted)
    size = next
    if (next === capacity) return
    dispatch("change", {
      capacity: next,
      fill: Math.min(100, ((capacity * pin.fill) / 100 / next) * 100),
    })
  }
  let confirming = false
</script>

<div class="bin" style="--c: {tint}">
  {#if !guest}
    <div class="tabs" role="tablist">
      <button
        type="button"
        role="tab"
        aria-selected={tab === "fill"}
        on:click={() => (tab = "fill")}
      >
        Fill
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

  {#if tab === "fill" || guest}
    <div class="field">
      <span class="label">Fill level</span>
      <div
        class="fillbar"
        class:dragging
        class:locked={guest}
        bind:this={bar}
        role="slider"
        tabindex={guest ? -1 : 0}
        aria-label="How full the bin is"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(fill)}
        aria-valuetext="{Math.round(fill)}%, {tonnes.toFixed(1)} tonnes"
        on:pointerdown={grab}
        on:pointermove={drag}
        on:pointerup={drop}
        on:pointercancel={drop}
        on:keydown={nudge}
      >
        <i style="width: {fill}%"></i>
        {#if !guest}<span class="grip" style="left: {fill}%"></span>{/if}
        <b>{Math.round(fill)}%</b>
      </div>
      <span class="tonnes"><b>{tonnes.toFixed(1)}</b> / {capacity} t</span>
    </div>

    {#if !guest}
      <div class="field">
        <span class="label">Add / take (t)</span>
        <div class="delta">
          <input
            type="number"
            inputmode="decimal"
            min="0"
            step="1"
            bind:value={delta}
            placeholder="t"
            aria-label="Tonnes to add or take"
            on:input={() => (hint = false)}
            on:keydown={(e) => e.key === "Enter" && applyDelta(1)}
          />
          <button type="button" class="add" on:click={() => applyDelta(1)}>
            <Plus size={15} strokeWidth={3} /> Add
          </button>
          <button type="button" on:click={() => applyDelta(-1)}>
            <Minus size={15} strokeWidth={3} /> Take
          </button>
        </div>
        {#if hint}<span class="note">Enter a value first</span>{/if}
      </div>

      {#if canMove}
        <button type="button" class="wide" on:click={() => dispatch("move")}>
          <Move size={16} /> Move
        </button>
      {/if}
    {/if}
  {:else}
    <label class="field">
      <span class="label">Storing</span>
      <input
        type="text"
        list="mn-bin-grains"
        bind:value={storing}
        placeholder="e.g. Wheat, canola, fuel…"
        maxlength="40"
        autocomplete="off"
        on:change={saveStoring}
        on:keydown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
      <datalist id="mn-bin-grains">
        {#each grains as grain}<option value={grain}></option>{/each}
      </datalist>
    </label>

    <label class="field">
      <span class="label">Bin size (t)</span>
      <input
        type="number"
        inputmode="numeric"
        min="1"
        max={MOST}
        step="1"
        bind:value={size}
        placeholder="e.g. 200"
        on:change={saveSize}
        on:keydown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
    </label>

    <div class="field">
      <span class="label">Colour</span>
      <div class="swatches">
        {#each COLOURS as key}
          <button
            type="button"
            class:active={siloColorKey(pin.grainColour) === key}
            style="background: {markerColor(key, 'circle-fill').dark}"
            aria-label={key}
            aria-pressed={siloColorKey(pin.grainColour) === key}
            on:click={() =>
              siloColorKey(pin.grainColour) !== key &&
              dispatch("change", { grainColour: key })}
          ></button>
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
      <span>Show a button for it on the map</span>
      <i></i>
    </button>

    <!-- (Stays at the foot of the menu while the settings scroll.) -->
    <div class="foot">
      {#if confirming}
        <div class="confirm">
          <span>Delete this bin?</span>
          <button type="button" class="yes" on:click={() => dispatch("remove")}>
            Delete
          </button>
          <button type="button" on:click={() => (confirming = false)}>
            Cancel
          </button>
        </div>
      {:else}
        <button
          type="button"
          class="wide danger"
          on:click={() => (confirming = true)}
        >
          <Trash2 size={16} /> Delete bin
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .bin {
    display: grid;
    gap: 10px;
    min-width: 0;
  }
  .tabs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 3px;
    padding: 3px;
    border-radius: 12px;
    background: var(--lp-paper);
    box-shadow: inset 0 0 0 1.5px var(--lp-line);
  }
  .tabs button {
    min-height: 34px;
    border-radius: 9px;
    font-size: 0.86rem;
    font-weight: 700;
    color: var(--lp-ink-soft);
  }
  .tabs button[aria-selected="true"] {
    background: var(--lp-ink);
    color: var(--lp-paper);
  }
  .field {
    display: grid;
    gap: 5px;
    min-width: 0;
  }
  .label {
    font-family: var(--lp-mono);
    font-size: 0.64rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--lp-ink-soft);
    text-transform: uppercase;
  }
  /* How full it is, and the handle on it: drag anywhere along the bar. */
  .fillbar {
    position: relative;
    height: 40px;
    border: 1.5px solid var(--lp-ink);
    border-radius: 12px;
    background: var(--lp-paper);
    cursor: ew-resize;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
  }
  .fillbar.locked {
    cursor: default;
  }
  .fillbar:focus-visible {
    outline: 3px solid var(--lp-yellow);
    outline-offset: 2px;
  }
  .fillbar i {
    position: absolute;
    inset: 0 auto 0 0;
    border-radius: 10px 0 0 10px;
    background: var(--c);
  }
  .fillbar:not(.dragging) i {
    transition: width 0.2s ease;
  }
  .fillbar b {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--lp-display);
    font-size: 1.15rem;
    font-weight: 800;
    color: var(--lp-ink);
    text-shadow:
      0 0 3px var(--lp-paper),
      0 0 3px var(--lp-paper);
    pointer-events: none;
    font-variant-numeric: tabular-nums;
  }
  .fillbar .grip {
    position: absolute;
    top: -4px;
    bottom: -4px;
    width: 14px;
    margin-left: -7px;
    border: 2px solid var(--lp-card);
    border-radius: 8px;
    background: var(--lp-ink);
    box-shadow: 0 2px 6px -1px rgba(10, 25, 15, 0.6);
    pointer-events: none;
  }
  .fillbar:not(.dragging) .grip {
    transition: left 0.2s ease;
  }
  .fillbar.dragging .grip {
    background: var(--lp-yellow);
    box-shadow:
      0 0 0 1.5px var(--lp-ink),
      0 2px 6px -1px rgba(10, 25, 15, 0.6);
  }
  .tonnes {
    font-size: 0.86rem;
    font-weight: 600;
    color: var(--lp-ink-soft);
  }
  .tonnes b {
    font-size: 1.05rem;
    font-weight: 800;
    color: var(--lp-ink);
  }
  .delta {
    display: flex;
    gap: 6px;
  }
  input[type="number"],
  input[type="text"] {
    width: 100%;
    min-width: 0;
    min-height: 2.6rem;
    padding: 0 12px;
    border: 1.5px solid var(--lp-line);
    border-radius: 12px;
    background: var(--lp-paper);
    font-size: 1rem;
    font-weight: 600;
    color: var(--lp-ink);
  }
  input[type="number"]:focus,
  input[type="text"]:focus {
    border-color: var(--lp-ink);
    outline: none;
  }
  .delta input {
    flex: 1;
  }
  .delta button,
  .wide,
  .confirm button {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    gap: 5px;
    min-height: 2.6rem;
    padding: 0 12px;
    border: 1.5px solid var(--lp-line);
    border-radius: 12px;
    font-size: 0.88rem;
    font-weight: 700;
    color: var(--lp-ink);
  }
  .delta button:hover,
  .wide:hover {
    border-color: var(--lp-ink);
  }
  .delta .add {
    border-color: var(--lp-ink);
    background: var(--lp-yellow);
    color: #15261c;
  }
  .note {
    font-size: 0.74rem;
    font-weight: 700;
    color: var(--lp-rust);
  }
  .swatches {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
  }
  .swatches button {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    box-shadow: inset 0 0 0 1.5px rgba(21, 38, 28, 0.35);
  }
  .swatches button.active {
    box-shadow:
      0 0 0 2px var(--lp-card),
      0 0 0 4px var(--lp-ink);
  }
  /* Delete, held at the foot of whatever the settings scroll in (which
     says how much padding it has, so the band reaches its edges). */
  .foot {
    position: sticky;
    bottom: calc(-1 * var(--bin-pad, 0px));
    z-index: 1;
    display: grid;
    margin: 0 calc(-1 * var(--bin-pad, 0px)) calc(-1 * var(--bin-pad, 0px));
    padding: 8px var(--bin-pad, 0px) max(var(--bin-pad, 0px), 2px);
    background: var(--bin-ground, var(--lp-card));
    box-shadow: 0 -1px 0 var(--lp-line);
  }
  .danger {
    border-color: color-mix(in srgb, var(--lp-rust) 50%, var(--lp-line));
    color: var(--lp-rust);
  }
  .confirm {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .confirm span {
    flex: 1;
    font-size: 0.88rem;
    font-weight: 700;
  }
  .confirm .yes {
    border-color: var(--lp-rust);
    background: var(--lp-rust);
    color: #fff;
  }
</style>
