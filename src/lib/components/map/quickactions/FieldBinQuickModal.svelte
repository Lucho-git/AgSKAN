<!-- src/lib/components/map/quickactions/FieldBinQuickModal.svelte -->
<!-- Quick grain-bin modal (field bin + mother bin), opened from the
     quick-action rail's bin buttons. Emulates the on-map bin panel: Fill tab
     (slider + add/take tonnes) and Settings tab (storing, bin size, colour,
     show-bins-always, delete), plus Locate — which hands off to the full
     on-map panel for moving. -->
<script>
  import { createEventDispatcher, onDestroy, onMount } from "svelte"
  import { Crosshair, Minus, Plus, Trash2, X } from "lucide-svelte"
  import { confirmedMarkersStore } from "$lib/stores/markerStore"
  import { profileStore } from "$lib/stores/profileStore"
  import {
    MARKER_COLOR_DEFAULT,
    PICKABLE_MARKER_COLORS,
    SILO_COLOR_DEFAULT,
    grainBinName,
    markerColor,
    siloColorKey,
  } from "$lib/components/map/markers/markerPalette"
  import {
    grainBinGlyphsStore,
    grainBinGlyphSvg,
    loadGrainBinGlyphs,
  } from "./fieldBinGlyph"

  /** The bin marker row (live from confirmedMarkersStore). */
  export let marker = null
  /** MarkerManager ref — live map-gauge updates while dragging the slider. */
  export let markerManagerRef = null

  const dispatch = createEventDispatcher()

  $: isViewer = $profileStore?.user_type === "viewer"
  // Per-bin "show bins always" — keeps this bin's shortcut on the rail.
  $: showBinsAlways = marker?.binShowAlways !== false
  $: colorDef = markerColor(grainColor, "original")
  $: name = marker?.notes?.trim() || grainBinName(marker?.iconClass)
  $: currentTonnes = capacityTonnes > 0 ? (capacityTonnes * fill) / 100 : 0
  $: binIcon = grainBinGlyphSvg(
    marker?.iconClass,
    colorDef.dark,
    24,
    $grainBinGlyphsStore,
  )

  let tab = "fill" // 'fill' | 'settings'
  let fill = 0
  let contents = ""
  let capacityTonnes = 200 // bin size in tonnes
  let capacityInput = ""
  let grainColor = SILO_COLOR_DEFAULT // palette key of the bin colour
  let tonnesDelta = ""
  let deltaHint = false
  let deltaHintTimer = null
  let confirmDelete = false
  let contentsInput = null
  let lastMarkerId = null

  // Reset local state when a DIFFERENT bin opens — commits from our own
  // edits must not fight the fields (same pattern as SiloMarkerPanel).
  $: if (marker?.id !== lastMarkerId) {
    lastMarkerId = marker?.id ?? null
    tab = "fill"
    fill = Math.max(0, Math.min(100, Number(marker?.siloFill) || 0))
    contents = marker?.grainType || ""
    capacityTonnes = marker?.capacityTonnes ?? 200
    capacityInput = capacityTonnes ? String(capacityTonnes) : ""
    grainColor = siloColorKey(marker?.grainColor)
    tonnesDelta = ""
    deltaHint = false
    confirmDelete = false
  }

  onMount(() => void loadGrainBinGlyphs())

  onDestroy(() => clearTimeout(deltaHintTimer))

  function close() {
    dispatch("close")
  }

  function onKeydown(event) {
    if (event.key === "Escape") close()
  }

  // Dragging the slider repaints the on-map gauge live; the store write
  // (and therefore persistence via the sync pipeline) happens on release.
  function onFillInput() {
    if (isViewer || !marker) return
    markerManagerRef?.updateSiloBarLive?.(marker.id, fill, grainColor)
  }

  // Commit every editable field (like the map panel's commit) — the sync
  // pipeline persists the change and every user sees it.
  function commit() {
    if (isViewer || !marker) return
    confirmedMarkersStore.update((markers) =>
      markers.map((m) =>
        m.id === marker.id
          ? {
              ...m,
              siloFill: fill,
              grainType: contents.trim(),
              capacityTonnes,
              grainColor,
            }
          : m,
      ),
    )
  }

  // Set the bin size. Changing it preserves the stored tonnes — the fill
  // percentage recalculates so the bin change doesn't magically add/remove
  // grain (same maths as the panel).
  function commitCapacity() {
    if (isViewer || !marker) return
    const parsed = Math.max(0, Math.round(Number(capacityInput) || 0))
    const prevCap = capacityTonnes
    const prevTonnes = prevCap > 0 ? (prevCap * fill) / 100 : 0
    capacityTonnes = parsed
    capacityInput = parsed ? String(parsed) : ""
    if (parsed > 0 && prevCap > 0) {
      fill = Math.min(100, Math.max(0, Math.round((prevTonnes / parsed) * 100)))
      markerManagerRef?.updateSiloBarLive?.(marker.id, fill, grainColor)
    }
    commit()
  }

  // Pick a grain colour for the bin (map gauge + rail button accent).
  function setGrainColor(key) {
    if (isViewer) return
    grainColor = key
    if (marker) markerManagerRef?.updateSiloBarLive?.(marker.id, fill, key)
    commit()
  }

  // Toggle this bin's rail shortcut (team-shared marker data, not a user
  // setting) — turning it off removes the bin's button from the side view.
  function toggleShowBinsAlways(event) {
    if (isViewer) {
      if (event?.currentTarget) event.currentTarget.checked = showBinsAlways
      return
    }
    if (!marker) return
    const next = !showBinsAlways
    confirmedMarkersStore.update((markers) =>
      markers.map((m) =>
        m.id === marker.id ? { ...m, binShowAlways: next } : m,
      ),
    )
  }

  // Delete via MarkerManager's by-id collector (works without the bin being
  // selected). The store update closes this modal automatically.
  function deleteBin() {
    if (isViewer || !marker) return
    confirmDelete = false
    markerManagerRef?.collectMarkerById?.(marker.id, "red")
  }

  // Add (dir = 1) / take (dir = -1) the entered tonnes, clamped to 0..capacity.
  function applyTonnesDelta(dir) {
    if (isViewer || !marker || capacityTonnes <= 0) return
    const delta = Math.round(Number(tonnesDelta) || 0)
    if (delta <= 0) {
      deltaHint = true
      clearTimeout(deltaHintTimer)
      deltaHintTimer = setTimeout(() => (deltaHint = false), 1800)
      return
    }
    const current = (capacityTonnes * fill) / 100
    const next = Math.max(0, Math.min(capacityTonnes, current + dir * delta))
    // Precise float — rounding to whole % quantizes small tonne steps
    // (e.g. +1t on a 300t bin must not round to 0).
    fill = (next / capacityTonnes) * 100
    markerManagerRef?.updateSiloBarLive?.(marker.id, fill, grainColor)
    commit()
    tonnesDelta = ""
  }
</script>

<svelte:window on:keydown={onKeydown} />

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
<div
  class="fixed inset-0 z-[96] flex items-end justify-center bg-black/50 p-3 sm:items-center sm:p-4"
  on:click={close}
>
  <div
    class="qb-card max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-[#101013]/95 p-4 text-white shadow-2xl backdrop-blur-md"
    style="--qb-accent: {colorDef.dark}; --qb-accent-faint: {colorDef.dark}26; --qb-accent-soft: {colorDef.dark}59;"
    on:click|stopPropagation
  >
    <!-- Header: bin icon (grain-tinted disc), name + contents, close -->
    <div class="flex items-start gap-3">
      <div
        class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full"
        style="background: {colorDef.light}; border: 2px solid {colorDef.dark};"
      >
        <span class="qb-glyph">{@html binIcon}</span>
      </div>
      <div class="min-w-0 flex-1">
        <h4 class="truncate text-sm font-semibold text-white">{name}</h4>
        <p class="truncate text-xs text-white/50">
          {contents ? `Storing: ${contents}` : "No contents set"}
        </p>
      </div>
      <button
        class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full transition-colors hover:bg-white/10"
        on:click={close}
        aria-label="Close"
        title="Close"
      >
        <X size={15} class="text-white/60" />
      </button>
    </div>

    <!-- Tabs: Fill | Settings — same structure as the on-map bin panel. -->
    <div class="qb-tabs mt-3">
      <button
        class="qb-tab"
        class:active={tab === "fill"}
        on:click={() => (tab = "fill")}
      >
        Fill
      </button>
      <button
        class="qb-tab"
        class:active={tab === "settings"}
        on:click={() => (tab = "settings")}
      >
        Settings
      </button>
    </div>

    {#if tab === "fill"}
      <!-- Fill slider (the slider itself is the level indicator) -->
      <div class="mt-3">
        <span class="qb-label">Fill level</span>
        <div class="flex items-center gap-2.5">
          <input
            type="range"
            class="qb-range"
            min="0"
            max="100"
            step="1"
            bind:value={fill}
            disabled={isViewer}
            on:input={onFillInput}
            on:change={commit}
            aria-label="Field bin fill level"
            style="--qb-thumb: {colorDef.dark}; background: linear-gradient(to right, {colorDef.dark} 0%, {colorDef.dark} {fill}%, rgba(255,255,255,0.14) {fill}%);"
          />
          <span
            class="min-w-[44px] text-right text-base font-extrabold"
            style="color: {colorDef.dark};"
          >
            {Math.round(fill)}%
          </span>
        </div>
        {#if capacityTonnes > 0}
          <span class="mt-1 block text-[10.5px] font-bold text-white/55">
            {currentTonnes.toFixed(1)} / {capacityTonnes} t
          </span>
        {/if}
      </div>

      <!-- Add / take tonnes -->
      <div class="mt-3">
        <span class="qb-label">Add / take (t)</span>
        <div class="flex items-center gap-1.5">
          <input
            type="number"
            class="qb-num"
            min="0"
            step="1"
            bind:value={tonnesDelta}
            placeholder="t"
            disabled={isViewer || capacityTonnes <= 0}
            on:keydown={(e) => {
              if (e.key === "Enter") applyTonnesDelta(1)
            }}
          />
          <button
            class="qb-delta add"
            disabled={isViewer || capacityTonnes <= 0}
            on:click={() => applyTonnesDelta(1)}
            title="Enter tonnes to add"
            aria-label="Add tonnes"
          >
            <Plus size={14} />
            <span>Add</span>
          </button>
          <button
            class="qb-delta take"
            disabled={isViewer || capacityTonnes <= 0}
            on:click={() => applyTonnesDelta(-1)}
            title="Enter tonnes to take"
            aria-label="Take tonnes"
          >
            <Minus size={14} />
            <span>Take</span>
          </button>
        </div>
        {#if capacityTonnes <= 0}
          <span class="mt-1 block text-[10.5px] italic text-white/40">
            Set a bin size to use tonnes
          </span>
        {:else if deltaHint}
          <span
            class="mt-1 block text-[10.5px] font-bold"
            style="color: {colorDef.dark};"
          >
            Enter a value first
          </span>
        {/if}
      </div>
    {:else}
      <!-- Settings tab — mirrors the on-map bin panel's settings. -->
      <div class="mt-3">
        <label class="qb-label" for="qb-storing">Storing</label>
        <input
          id="qb-storing"
          type="text"
          class="qb-text"
          bind:this={contentsInput}
          bind:value={contents}
          placeholder="e.g. Wheat, canola, fuel…"
          maxlength="40"
          disabled={isViewer}
          on:change={commit}
          on:keydown={(e) => {
            if (e.key === "Enter") e.target.blur()
          }}
        />
      </div>

      <div class="mt-3">
        <label class="qb-label" for="qb-capacity">Bin size (t)</label>
        <input
          id="qb-capacity"
          type="number"
          class="qb-text"
          min="0"
          step="1"
          bind:value={capacityInput}
          placeholder="e.g. 200"
          disabled={isViewer}
          on:change={commitCapacity}
          on:keydown={(e) => {
            if (e.key === "Enter") e.target.blur()
          }}
        />
      </div>

      <div class="mt-3">
        <span class="qb-label">Color</span>
        <div class="qb-swatches">
          <!-- Silos use the grain colours — black and white aren't grain
               colours, so they stay out of this picker (same as the panel). -->
          {#each PICKABLE_MARKER_COLORS.filter((c) => c.key !== MARKER_COLOR_DEFAULT && c.key !== "black" && c.key !== "white") as c}
            <button
              class="qb-swatch"
              class:active={grainColor === c.key}
              style="background: {markerColor(c.key, 'original').dark};"
              title={c.label}
              aria-label={c.label}
              disabled={isViewer}
              on:click={() => setGrainColor(c.key)}
            ></button>
          {/each}
        </div>
      </div>

      <label class="qb-toggle-row mt-3">
        <span class="qb-toggle-text">
          <span class="qb-label">Show bins always</span>
          <span class="qb-toggle-note"
            >Keep a shortcut above the people menu</span
          >
        </span>
        <input
          type="checkbox"
          class="qb-toggle-input"
          checked={showBinsAlways}
          disabled={isViewer}
          on:change={toggleShowBinsAlways}
        />
        <span class="qb-toggle-track"
          ><span class="qb-toggle-thumb"></span></span
        >
      </label>

      {#if confirmDelete}
        <div class="qb-confirm mt-3">
          <span class="qb-confirm-text">Delete this bin?</span>
          <div class="qb-confirm-actions">
            <button class="qb-confirm-yes" on:click={deleteBin}>Delete</button>
            <button
              class="qb-confirm-no"
              on:click={() => (confirmDelete = false)}
            >
              Cancel
            </button>
          </div>
        </div>
      {:else}
        <button
          class="qb-delete mt-3"
          disabled={isViewer}
          on:click={() => (confirmDelete = true)}
        >
          <Trash2 size={14} />
          <span>Delete bin</span>
        </button>
      {/if}
    {/if}

    {#if isViewer}
      <p
        class="mt-3 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[10.5px] text-white/50"
      >
        View only — guests can't change bin levels.
      </p>
    {/if}

    <!-- Locate: fly to the bin, select it and open its full on-map panel. -->
    <button
      class="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-white/10 py-2 text-xs font-semibold text-white/85 transition-colors hover:bg-white/15"
      on:click={() => dispatch("locate", marker)}
    >
      <Crosshair size={14} class="text-white/60" />
      <span>Locate on map</span>
    </button>
  </div>
</div>

<style>
  .qb-label {
    display: block;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: rgba(255, 255, 255, 0.55);
    margin-bottom: 4px;
  }
  .qb-glyph {
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }
  .qb-glyph :global(svg) {
    display: block;
  }

  .qb-range {
    flex: 1;
    min-width: 0;
    -webkit-appearance: none;
    appearance: none;
    height: 14px;
    border-radius: 7px;
    outline: none;
    border: 1px solid rgba(255, 255, 255, 0.12);
    cursor: pointer;
  }
  .qb-range::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--qb-thumb, #fbbf24);
    border: 3px solid #fff7ed;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
    cursor: grab;
  }
  .qb-range::-moz-range-thumb {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--qb-thumb, #fbbf24);
    border: 3px solid #fff7ed;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
    cursor: grab;
  }
  .qb-range:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .qb-num,
  .qb-text {
    flex: 1;
    min-width: 0;
    width: 100%;
    padding: 9px 10px;
    border-radius: 9px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(255, 255, 255, 0.07);
    color: #fff;
    font-size: 13px;
    font-weight: 600;
    outline: none;
    -moz-appearance: textfield;
  }
  .qb-num::placeholder,
  .qb-text::placeholder {
    color: rgba(255, 255, 255, 0.35);
    font-weight: 500;
  }
  .qb-num:focus,
  .qb-text:focus {
    border-color: rgba(245, 158, 11, 0.7);
  }
  .qb-num::-webkit-inner-spin-button,
  .qb-num::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .qb-delta {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 9px 10px;
    border-radius: 9px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.85);
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .qb-delta.add {
    border-color: rgba(34, 197, 94, 0.45);
    background: rgba(34, 197, 94, 0.14);
    color: #86efac;
  }
  .qb-delta.add:hover:not(:disabled) {
    background: rgba(34, 197, 94, 0.28);
  }
  .qb-delta.take {
    border-color: rgba(239, 68, 68, 0.45);
    background: rgba(239, 68, 68, 0.14);
    color: #fca5a5;
  }
  .qb-delta.take:hover:not(:disabled) {
    background: rgba(239, 68, 68, 0.28);
  }
  .qb-delta:disabled {
    opacity: 0.45;
    cursor: default;
  }

  /* Tabs — Fill | Settings, mirroring the on-map bin panel. */
  .qb-tabs {
    display: flex;
    gap: 4px;
    padding: 3px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.06);
  }
  .qb-tab {
    flex: 1;
    padding: 7px 10px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: rgba(255, 255, 255, 0.55);
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .qb-tab:hover {
    color: var(--qb-accent);
  }
  .qb-tab.active {
    background: var(--qb-accent-faint);
    color: var(--qb-accent);
  }

  /* Grain-colour swatches */
  .qb-swatches {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .qb-swatch {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 2px solid rgba(255, 255, 255, 0.2);
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .qb-swatch:hover:not(:disabled) {
    transform: scale(1.12);
  }
  .qb-swatch.active {
    border-color: #fff;
    box-shadow: 0 0 0 2px var(--qb-accent-soft);
  }
  .qb-swatch:disabled {
    opacity: 0.5;
    cursor: default;
  }

  /* "Show bins always" toggle */
  .qb-toggle-row {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  }
  .qb-toggle-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .qb-toggle-text .qb-label {
    margin-bottom: 0;
  }
  .qb-toggle-note {
    font-size: 10.5px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.4);
    font-style: italic;
  }
  .qb-toggle-input {
    display: none;
  }
  .qb-toggle-track {
    flex-shrink: 0;
    position: relative;
    width: 36px;
    height: 20px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.16);
    transition: background 0.2s ease;
  }
  .qb-toggle-thumb {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.75);
    transition: transform 0.2s ease;
  }
  .qb-toggle-input:checked + .qb-toggle-track {
    background: var(--qb-accent);
  }
  .qb-toggle-input:checked + .qb-toggle-track .qb-toggle-thumb {
    transform: translateX(16px);
    background: #fff7ed;
  }

  /* Delete (two-step confirm, like the panel) */
  .qb-confirm {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    border-radius: 9px;
    border: 1px solid rgba(239, 68, 68, 0.4);
    background: rgba(239, 68, 68, 0.1);
  }
  .qb-confirm-text {
    font-size: 12px;
    font-weight: 700;
    color: #fecaca;
    text-align: center;
  }
  .qb-confirm-actions {
    display: flex;
    gap: 8px;
  }
  .qb-confirm-yes {
    flex: 1;
    padding: 8px;
    border-radius: 8px;
    border: none;
    background: #ef4444;
    color: #fff;
    font-size: 12px;
    font-weight: 800;
    cursor: pointer;
  }
  .qb-confirm-yes:hover {
    background: #dc2626;
  }
  .qb-confirm-no {
    flex: 1;
    padding: 8px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.8);
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
  }
  .qb-confirm-no:hover {
    background: rgba(255, 255, 255, 0.14);
  }
  .qb-delete {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 10px;
    border-radius: 9px;
    border: 1px solid rgba(239, 68, 68, 0.35);
    background: rgba(239, 68, 68, 0.12);
    color: #fca5a5;
    font-size: 13px;
    font-weight: 800;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .qb-delete:hover:not(:disabled) {
    background: rgba(239, 68, 68, 0.22);
    color: #fecaca;
  }
  .qb-delete:disabled {
    opacity: 0.45;
    cursor: default;
  }
</style>
