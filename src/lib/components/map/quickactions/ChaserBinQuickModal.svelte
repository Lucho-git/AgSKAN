<!-- src/lib/components/map/quickactions/ChaserBinQuickModal.svelte -->
<!-- Chaser bin modal — opened from a chaser's rail button, the vehicle HUD's
     bottom-bar action, or by selecting your chaser on the map.
       Load    slider (tonnes) + Add/Take — the everyday screen
       Empty   one tap per field/mother bin: tips the chaser into it
       Setup   tank size, "show chaser button" + the grain record
     Any operator can open this for ANY chaser on the map (the load lives in
     the shared chaser_loads table, so teammates see the change live); visitors
     get a read-only view.
     The body has a FIXED height so nothing jumps between tabs or when the
     empty shortcut appears/disappears. -->
<script>
  import { createEventDispatcher, onDestroy, onMount } from "svelte"
  import { ArrowRightLeft, Minus, Plus, X } from "lucide-svelte"
  import { toast } from "svelte-sonner"
  import { userSettingsStore } from "$lib/stores/userSettingsStore"
  import { userSettingsApi } from "$lib/api/userSettingsApi"
  import { chaserLoadsStore, loadChaserLoads, setChaserLoad } from "$lib/stores/chaserLoadsStore"
  import { confirmedMarkersStore } from "$lib/stores/markerStore"
  import { profileStore } from "$lib/stores/profileStore"
  import {
    grainBinDefaultCapacity,
    grainBinName,
    isGrainBinIcon,
    markerColor,
    siloColorKey,
  } from "$lib/components/map/markers/markerPalette"
  import {
    CHASER_BIN_LOAD_STEP,
    binFreeTonnes,
    binStoredTonnes,
    chaserCapacity,
    chaserLoad,
    formatTonnes,
    planTransfer,
    roundTonnes,
  } from "$lib/utils/grainLoad"
  import { logGrainEvent } from "$lib/api/grainLogApi"
  import { grainBinGlyphsStore, grainBinGlyphSvg } from "./fieldBinGlyph"
  import { getVehicleDisplayName } from "$lib/utils/vehicleDisplayName"
  import vehicleComponents from "$lib/vehicles/index.js"
  import GrainLogList from "./GrainLogList.svelte"

  /**
   * The chaser being edited:
   *   { id, own, marker, ownerName }  — id is that operator's profiles.id.
   * @type {any}
   */
  export let chaser = null
  /** Every marker on the map — the bins we can empty into. @type {any[]} */
  export let markers = []
  /** MarkerManager ref — repaints the receiving bin's gauge immediately. @type {any} */
  export let markerManagerRef = null
  /** Bin glyphs for the empty-into list. @type {any} */
  export let glyphs = null

  const dispatch = createEventDispatcher()

  // Machine colour names (VEHICLE_COLORS) → marker palette keys, so the disc
  // and accents wear the machine's own colour.
  /** @type {Record<string, string>} */
  const BODY_COLOR_TO_PALETTE = {
    red: "red",
    blue: "blue",
    green: "green",
    yellow: "yellow",
    orange: "orange",
    purple: "purple",
    skyblue: "skyblue",
    lightgreen: "green",
    hotpink: "pink",
  }

  /** @param {string | null | undefined} color */
  function paletteKeyForBodyColor(color) {
    const key = String(color || "").replace(/\s+/g, "").toLowerCase()
    return BODY_COLOR_TO_PALETTE[key] || "blue"
  }

  /** The machine glyph for a vehicle type (falls back to the pointer). @param {string} type */
  function machineComponent(type) {
    const registry = /** @type {Record<string, any>} */ (vehicleComponents)
    return registry[type] || vehicleComponents.Pointer
  }

  $: isViewer = $profileStore?.user_type === "viewer"
  $: masterMapId = $profileStore?.master_map_id || null
  $: marker = chaser?.marker || null
  // Shared per-chaser state; falls back to "empty" until the first read lands.
  $: chaserState = (chaser?.id && $chaserLoadsStore?.[chaser.id]) || null
  $: capacity = chaserCapacity(chaserState)
  $: machineName = getVehicleDisplayName({ vehicle_marker: marker })
  $: title = chaser?.own
    ? `Your ${machineName}`
    : `${chaser?.ownerName || "Teammate"} · ${machineName}`
  $: MachineIcon = machineComponent(marker?.type || "Pointer")
  $: bodyColor = marker?.bodyColor || "red"
  $: accent = markerColor(paletteKeyForBodyColor(bodyColor), "original")
  // Per-viewer: has THIS user switched this chaser's rail button on?
  $: showRailButton = $userSettingsStore?.chaserRailVisibility?.[chaser?.id] === true

  // Bins with their free space + what an empty would actually move.
  $: binRows = (markers || [])
    .filter((m) => isGrainBinIcon(m.iconClass))
    .map((m) => {
      const binCapacity =
        Number(m.capacityTonnes) || grainBinDefaultCapacity(m.iconClass)
      const fill = Math.max(0, Math.min(100, Number(m.siloFill) || 0))
      const room = binFreeTonnes(binCapacity, fill)
      const plan = planTransfer({
        loadTonnes: load,
        binFill: fill,
        binCapacity,
      })
      return {
        marker: m,
        name: m.notes?.trim() || grainBinName(m.iconClass),
        capacity: binCapacity,
        fill,
        room,
        plan,
      }
    })
    .sort((a, b) => b.room - a.room)

  let tab = "load" // 'load' | 'empty' | 'setup'
  let load = 0
  let capacityInput = ""
  let tonnesDelta = ""
  let deltaHint = false
  let deltaHintTimer = null
  let recordKey = 0
  // Which chaser our local slider state belongs to (reset when it changes).
  let lastChaserKey = null
  // True while the slider is being dragged — remote realtime updates must not
  // yank the thumb out from under the finger.
  let dragging = false

  /** Push our local load into the shared record (optimistic + persisted).
   * @param {number} nextLoad
   * @param {number | null} [nextCapacity]
   */
  function saveLoad(nextLoad, nextCapacity = null) {
    return setChaserLoad({
      masterMapId,
      vehicleId: chaser?.id ?? null,
      load: nextLoad,
      capacity: nextCapacity,
      actorId: $profileStore?.id ?? null,
    })
  }

  // Adopt the shared value when it changes underneath us (first load, or a
  // teammate adjusting the same chaser) — except mid-drag.
  let syncedLoad = null
  $: if (!dragging) {
    const stored = chaserLoad(chaserState)
    if (stored !== syncedLoad) {
      syncedLoad = stored
      load = stored
    }
  }

  // Reset per-chaser bits when a different chaser opens.
  $: if (chaser?.id !== lastChaserKey) {
    lastChaserKey = chaser?.id ?? null
    tab = "load"
    capacityInput = String(capacity)
    tonnesDelta = ""
    deltaHint = false
    dragging = false
    syncedLoad = chaserLoad(chaserState)
    load = syncedLoad
  } else if (!dragging) {
    // Keep the tank-size field in step while nothing is being typed.
    const asText = String(capacity)
    if (document.activeElement?.id !== "cb-capacity") capacityInput = asText
  }

  onDestroy(() => clearTimeout(deltaHintTimer))

  // Pull the latest shared value when the modal opens, so the slider starts
  // from what the team actually has rather than a stale read.
  onMount(() => {
    if (masterMapId) void loadChaserLoads(masterMapId)
  })

  function close() {
    dispatch("close")
  }

  function onKeydown(event) {
    if (event.key === "Escape") close()
  }

  // Slider release: persist the load and record the change.
  function commitLoad() {
    dragging = false
    if (isViewer) return
    const before = chaserLoad(chaserState)
    const next = roundTonnes(Math.max(0, Math.min(capacity, Number(load) || 0)))
    load = next
    syncedLoad = next
    if (next === before) return
    void saveLoad(next)
    void logGrainEvent({
      action: "chaser.level",
      vehicleId: chaser?.id ?? null,
      vehicleName: chaser?.own ? machineName : `${chaser?.ownerName} · ${machineName}`,
      tonnesBefore: before,
      tonnesAfter: next,
    })
    recordKey++
  }

  // Add (dir = 1) / take (dir = -1) the entered tonnes.
  function applyTonnesDelta(dir) {
    if (isViewer) return
    const delta = Math.round(Number(tonnesDelta) || 0)
    if (delta <= 0) {
      deltaHint = true
      clearTimeout(deltaHintTimer)
      deltaHintTimer = setTimeout(() => (deltaHint = false), 1800)
      return
    }
    load = roundTonnes(Math.max(0, Math.min(capacity, load + dir * delta)))
    tonnesDelta = ""
    commitLoad()
  }

  // One tap: tip the chaser into this bin — as much as fits, the rest stays.
  function emptyInto(row) {
    if (isViewer || !row) return
    const plan = row.plan
    if (plan.moved <= 0) return

    const before = chaserLoad(chaserState)
    const binId = row.marker.id
    const binFillBefore = row.fill

    confirmedMarkersStore.update((list) =>
      list.map((m) =>
        m.id === binId ? { ...m, siloFill: plan.binFillAfter } : m,
      ),
    )
    markerManagerRef?.updateSiloBarLive?.(
      binId,
      plan.binFillAfter,
      siloColorKey(row.marker.grainColor),
    )
    load = plan.loadAfter
    syncedLoad = plan.loadAfter
    void saveLoad(plan.loadAfter)

    void logGrainEvent({
      action: "chaser.empty",
      binId,
      binName: row.name,
      vehicleId: chaser?.id ?? null,
      vehicleName: chaser?.own ? machineName : `${chaser?.ownerName} · ${machineName}`,
      tonnesBefore: before,
      tonnesAfter: plan.loadAfter,
      binFillBefore,
      binFillAfter: plan.binFillAfter,
    })
    recordKey++

    toast.success(
      `Moved ${formatTonnes(plan.moved)} into ${row.name}` +
        (plan.overflows ? ` · ${formatTonnes(plan.loadAfter)} left` : ""),
    )
  }

  // Tank size — shrinking it clamps the load so the chaser can't hold more
  // than it physically can.
  function commitCapacity() {
    if (isViewer) return
    const parsed = Math.max(0, Math.round(Number(capacityInput) || 0))
    const next = parsed > 0 ? parsed : null
    capacityInput = next ? String(next) : ""
    if (next) load = roundTonnes(Math.min(load, next))
    syncedLoad = load
    void saveLoad(load, next)
  }

  // Show/hide this chaser's rail shortcut. It's a per-viewer preference (the
  // toggle appears for every chaser, not just your own), stored in user
  // settings — so it syncs across your devices without touching anyone else's
  // rail. The HUD's bottom-bar action and picking the chaser on the map always
  // open this modal, so hiding the button never locks you out.
  function toggleRailButton(event) {
    if (isViewer) {
      if (event?.currentTarget) event.currentTarget.checked = showRailButton
      return
    }
    if (!chaser?.id) return
    void userSettingsApi.updateChaserRailVisibility(
      chaser.id,
      !showRailButton,
    )
  }
</script>

<svelte:window on:keydown={onKeydown} />

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
<div
  class="fixed inset-0 z-[96] flex items-end justify-center bg-black/50 p-3 sm:items-center sm:p-4"
  on:click={close}
>
  <div
    class="cb-card flex max-h-[88vh] w-full max-w-sm flex-col rounded-2xl bg-[#101013]/95 p-4 text-white shadow-2xl backdrop-blur-md"
    style="--cb-accent: {accent.dark}; --cb-accent-faint: {accent.dark}26; --cb-accent-soft: {accent.dark}59;"
    on:click|stopPropagation
  >
    <!-- Header -->
    <div class="flex flex-shrink-0 items-start gap-3">
      <div
        class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full"
        style="background: {accent.light}; border: 2px solid {accent.dark};"
      >
        <svelte:component this={MachineIcon} bodyColor={bodyColor} size="26px" />
      </div>
      <div class="min-w-0 flex-1">
        <h4 class="truncate text-sm font-semibold text-white">{title}</h4>
        <p class="truncate text-xs text-white/50">
          {formatTonnes(load)} of {capacity} t on board
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

    <div class="cb-tabs mt-3 flex-shrink-0">
      <button
        class="cb-tab"
        class:active={tab === "load"}
        on:click={() => (tab = "load")}
      >
        Load
      </button>
      <button
        class="cb-tab"
        class:active={tab === "empty"}
        on:click={() => (tab = "empty")}
      >
        Empty
      </button>
      <button
        class="cb-tab"
        class:active={tab === "setup"}
        on:click={() => (tab = "setup")}
      >
        Setup
      </button>
    </div>

    <!-- Fixed-height body: every tab gets the same footprint, so adding or
         removing a button never resizes the modal. -->
    <div class="cb-body mt-3">
      {#if tab === "load"}
        <div>
          <span class="cb-label">Grain in chaser (t)</span>
          <div class="flex items-center gap-2.5">
            <input
              type="range"
              class="cb-range"
              min="0"
              max={capacity}
              step={CHASER_BIN_LOAD_STEP}
              bind:value={load}
              disabled={isViewer}
              on:pointerdown={() => (dragging = true)}
              on:keydown={() => (dragging = true)}
              on:change={commitLoad}
              aria-label="Chaser bin load in tonnes"
              style="--cb-thumb: {accent.dark}; background: linear-gradient(to right, {accent.dark} 0%, {accent.dark} {capacity > 0 ? (load / capacity) * 100 : 0}%, rgba(255,255,255,0.14) {capacity > 0 ? (load / capacity) * 100 : 0}%);"
            />
            <span
              class="min-w-[70px] text-right text-2xl font-extrabold leading-none"
              style="color: {accent.dark};"
            >
              {load.toFixed(1)}<span class="text-sm font-bold"> t</span>
            </span>
          </div>
          <span class="mt-1.5 block text-sm font-bold text-white/60">
            <b class="text-lg font-extrabold text-white"
              >{formatTonnes(capacity - load)}</b
            >
            free of {capacity} t
          </span>
        </div>

        <div class="mt-3">
          <span class="cb-label">Add / take (t)</span>
          <div class="flex items-center gap-1.5">
            <input
              type="number"
              class="cb-num"
              min="0"
              step="1"
              bind:value={tonnesDelta}
              placeholder="t"
              disabled={isViewer}
              on:keydown={(e) => {
                if (e.key === "Enter") applyTonnesDelta(1)
              }}
            />
            <button
              class="cb-delta add"
              disabled={isViewer}
              on:click={() => applyTonnesDelta(1)}
              title="Enter tonnes to add"
              aria-label="Add tonnes"
            >
              <Plus size={14} />
              <span>Add</span>
            </button>
            <button
              class="cb-delta take"
              disabled={isViewer}
              on:click={() => applyTonnesDelta(-1)}
              title="Enter tonnes to take"
              aria-label="Take tonnes"
            >
              <Minus size={14} />
              <span>Take</span>
            </button>
          </div>
          {#if deltaHint}
            <span
              class="mt-1 block text-[10.5px] font-bold"
              style="color: {accent.dark};"
            >
              Enter a value first
            </span>
          {/if}
        </div>

        <!-- Always present (disabled when empty) so the layout never jumps. -->
        <button
          class="cb-jump mt-3"
          disabled={isViewer || load <= 0}
          on:click={() => (tab = "empty")}
          title={load > 0 ? "Tip the chaser into a bin" : "Nothing loaded to tip out"}
        >
          <ArrowRightLeft size={15} class="cb-jump-ico" />
          <span class="cb-jump-label">Empty into a bin</span>
          <span class="cb-jump-amount">{formatTonnes(load)}</span>
        </button>
      {:else if tab === "empty"}
        {#if load <= 0}
          <p class="cb-note">The chaser is empty — nothing to tip out.</p>
        {:else}
          <p class="cb-note">Tap a bin to empty into it.</p>
        {/if}
        <div class="cb-bins">
          {#each binRows as row (row.marker.id)}
            {@const def = markerColor(
              siloColorKey(row.marker.grainColor),
              "original",
            )}
            <button
              class="cb-bin"
              disabled={isViewer || row.room <= 0 || row.plan.moved <= 0}
              on:click={() => emptyInto(row)}
              title={row.room <= 0
                ? `${row.name} is full`
                : `Move ${formatTonnes(row.plan.moved)} into ${row.name}`}
            >
              <span
                class="cb-bin-disc"
                style="background: {def.light}; border: 2px solid {def.dark};"
              >
                <span class="cb-glyph"
                  >{@html grainBinGlyphSvg(
                    row.marker.iconClass,
                    "#111827",
                    18,
                    glyphs ?? $grainBinGlyphsStore,
                  )}</span
                >
              </span>
              <span class="cb-bin-body">
                <span class="cb-bin-name">{row.name}</span>
                <span class="cb-bin-meta">
                  {Math.round(row.fill)}% · {formatTonnes(
                    binStoredTonnes(row.capacity, row.fill),
                  )} / {row.capacity} t
                  {#if row.room <= 0}· full{:else}· {formatTonnes(row.room)} free{/if}
                </span>
              </span>
              <span class="cb-bin-move">
                {row.room <= 0 ? "—" : `+${formatTonnes(row.plan.moved)}`}
              </span>
            </button>
          {:else}
            <p class="cb-note">No bins on this map yet.</p>
          {/each}
        </div>
      {:else}
        <div>
          <label class="cb-label" for="cb-capacity">Tank size (t)</label>
          <input
            id="cb-capacity"
            type="number"
            class="cb-text"
            min="0"
            step="1"
            bind:value={capacityInput}
            placeholder="e.g. 40"
            disabled={isViewer}
            on:change={commitCapacity}
            on:keydown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur()
            }}
          />
        </div>

        <label class="cb-toggle-row mt-3">
          <span class="cb-toggle-text">
            <span class="cb-label">Show on side rail</span>
            <span class="cb-toggle-note">
              {chaser?.own
                ? "Keep this chaser's shortcut on your rail"
                : "Add this chaser's shortcut to your rail"}
            </span>
          </span>
          <input
            type="checkbox"
            class="cb-toggle-input"
            checked={showRailButton}
            disabled={isViewer}
            on:change={toggleRailButton}
          />
          <span class="cb-toggle-track"
            ><span class="cb-toggle-thumb"></span></span
          >
        </label>

        <div class="mt-4">
          <span class="cb-label">Grain record</span>
          <GrainLogList {masterMapId} refreshKey={recordKey} selfScroll={false} />
        </div>
      {/if}
    </div>

    {#if isViewer}
      <p
        class="mt-3 flex-shrink-0 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[10.5px] text-white/50"
      >
        View only — visitors can't change loads.
      </p>
    {/if}
  </div>
</div>

<style>
  .cb-label {
    display: block;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: rgba(255, 255, 255, 0.55);
    margin-bottom: 4px;
  }

  /* One fixed footprint for every tab — the modal never resizes as buttons
     appear/disappear or a tab's content changes length. */
  .cb-body {
    height: clamp(244px, 40vh, 322px);
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: none;
  }
  .cb-body::-webkit-scrollbar {
    display: none;
  }

  .cb-range {
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
  .cb-range::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--cb-thumb, #60a5fa);
    border: 3px solid #eff6ff;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
    cursor: grab;
  }
  .cb-range::-moz-range-thumb {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--cb-thumb, #60a5fa);
    border: 3px solid #eff6ff;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
    cursor: grab;
  }
  .cb-range:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .cb-num,
  .cb-text {
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
    appearance: none;
  }
  .cb-num::placeholder,
  .cb-text::placeholder {
    color: rgba(255, 255, 255, 0.35);
    font-weight: 500;
  }
  .cb-num::-webkit-inner-spin-button,
  .cb-num::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .cb-delta {
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
  .cb-delta.add {
    border-color: rgba(34, 197, 94, 0.45);
    background: rgba(34, 197, 94, 0.14);
    color: #86efac;
  }
  .cb-delta.add:hover:not(:disabled) {
    background: rgba(34, 197, 94, 0.28);
  }
  .cb-delta.take {
    border-color: rgba(239, 68, 68, 0.45);
    background: rgba(239, 68, 68, 0.14);
    color: #fca5a5;
  }
  .cb-delta.take:hover:not(:disabled) {
    background: rgba(239, 68, 68, 0.28);
  }
  .cb-delta:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .cb-tabs {
    display: flex;
    gap: 4px;
    padding: 3px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.06);
  }
  .cb-tab {
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
  .cb-tab:hover {
    color: var(--cb-accent);
  }
  .cb-tab.active {
    background: var(--cb-accent-faint);
    color: var(--cb-accent);
  }

  .cb-jump {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 11px 12px;
    border-radius: 10px;
    border: 1px solid var(--cb-accent);
    background: var(--cb-accent-faint);
    color: #fff;
    font-size: 13px;
    font-weight: 800;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .cb-jump:hover:not(:disabled) {
    background: var(--cb-accent-soft);
  }
  .cb-jump:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .cb-jump :global(.cb-jump-ico) {
    flex: 0 0 auto;
    color: var(--cb-accent);
  }
  .cb-jump-label {
    flex: 1;
    min-width: 0;
    text-align: left;
  }
  .cb-jump-amount {
    flex: 0 0 auto;
    font-size: 12px;
    font-weight: 800;
    color: var(--cb-accent);
  }

  .cb-note {
    margin: 0 0 8px;
    font-size: 11px;
    font-style: italic;
    color: rgba(255, 255, 255, 0.45);
  }

  .cb-bins {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .cb-bin {
    display: flex;
    align-items: center;
    gap: 9px;
    width: 100%;
    padding: 8px 9px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.06);
    color: #fff;
    text-align: left;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .cb-bin:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.12);
  }
  .cb-bin:disabled {
    opacity: 0.42;
    cursor: default;
  }

  .cb-bin-disc {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border-radius: 50%;
  }
  .cb-glyph {
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }
  .cb-glyph :global(svg) {
    display: block;
  }

  .cb-bin-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .cb-bin-name {
    font-size: 12px;
    font-weight: 800;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cb-bin-meta {
    font-size: 10px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.55);
  }
  .cb-bin-move {
    flex: 0 0 auto;
    font-size: 11.5px;
    font-weight: 800;
    color: var(--cb-accent);
  }

  /* "Show chaser button" toggle (same look as the bin modal's). */
  .cb-toggle-row {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  }
  .cb-toggle-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .cb-toggle-text .cb-label {
    margin-bottom: 0;
  }
  .cb-toggle-note {
    font-size: 10.5px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.4);
    font-style: italic;
  }
  .cb-toggle-input {
    display: none;
  }
  .cb-toggle-track {
    flex-shrink: 0;
    position: relative;
    width: 36px;
    height: 20px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.16);
    transition: background 0.2s ease;
  }
  .cb-toggle-thumb {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.75);
    transition: transform 0.2s ease;
  }
  .cb-toggle-input:checked + .cb-toggle-track {
    background: var(--cb-accent);
  }
  .cb-toggle-input:checked + .cb-toggle-track .cb-toggle-thumb {
    transform: translateX(16px);
    background: #fff;
  }
</style>
