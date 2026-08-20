<!--
  MarkerDefaultColorModal.svelte
  "?" help for the "Default colour" setting: explains how the default-colour
  system works and lets the user set a custom default colour PER MARKER TYPE
  visually — a grid of every marker rendered in the CURRENT marker style
  (each shown with its effective default colour), and a ONE-CLICK on any
  marker opens a colour box to set that type's default (or "D" to clear back
  to the built-in neutral default).
-->
<script>
  import { X } from "lucide-svelte"
  import { toast } from "svelte-sonner"
  import { getActiveMarkers } from "$lib/data/markerDefinitions"
  import { userSettingsStore } from "$lib/stores/userSettingsStore"
  import { userSettingsApi } from "$lib/api/userSettingsApi"
  import {
    MARKER_COLOR_DEFAULT,
    markerColor,
    pickableColorsForStyle,
    randomColorForId,
    RANDOM_COLOR_KEY,
    styleDefaultColor,
    styleSwatchBg,
    TINT_MODES,
  } from "$lib/components/map/markers/markerPalette"
  import {
    isSvgRenderedIcon,
    renderSvgMarkerCanvas,
  } from "$lib/components/map/markers/markerSvgRenderer"

  /** Callback to close the modal. */
  export let onClose = null

  // The "Default" (D) state is shown as a neutral gradient (not black) so
  // it reads as "auto / original default" and stays distinct from the Black
  // colour option.
  const DEFAULT_GRADIENT = "linear-gradient(135deg, #475569 0%, #94a3b8 100%)"

  const styles = TINT_MODES
  $: markerStyle = $userSettingsStore?.markerStyle || "circle-fill"
  $: styleLabel = styles.find((s) => s.key === markerStyle)?.label || markerStyle
  $: perType = $userSettingsStore?.markerTypeDefaultColors || {}
  $: styleNeutral = styleDefaultColor(markerStyle)
  // The "All markers" base colour: a specific colour, "random", or
  // "default" (the original neutral of the style). Per-type overrides in
  // `perType` always win over the base. (The old single/custom mode toggle
  // is gone — there is just a base colour + per-type overrides.)
  $: singleColor =
    $userSettingsStore?.markerDefaultColor || MARKER_COLOR_DEFAULT

  let tiles = [] // { iconClass, name, url, override }
  let loading = true
  let saving = false
  let picker = null // { iconClass, x, y }
  let globalPicker = null // { x, y }
  let builtForStyle = null

  /** @param {{ id: string, class?: string }} def @returns {string} */
  function iconClassFor(def) {
    if (def.class === "custom-svg") return `custom-svg-${def.id}`
    return def.class || "default"
  }

  // The colour a type actually renders with by default: its own override
  // wins, otherwise the "All markers" base colour (a specific colour, a
  // random colour, or the style's original neutral when the base is
  // "default"). "random" resolves to a stable per-icon colour.
  function effectiveDefault(iconClass) {
    const override = perType[iconClass]
    if (override) {
      return override === RANDOM_COLOR_KEY
        ? randomColorForId(iconClass)
        : override
    }
    if (singleColor === RANDOM_COLOR_KEY) return randomColorForId(iconClass)
    if (singleColor === MARKER_COLOR_DEFAULT) return styleNeutral
    return singleColor
  }

  /** @param {string} iconClass @returns {Promise<string>} */
  async function renderTile(iconClass) {
    try {
      const canvas = await renderSvgMarkerCanvas(
        iconClass,
        effectiveDefault(iconClass),
        markerStyle,
        0.3,
      )
      return canvas.toDataURL()
    } catch (e) {
      return ""
    }
  }

  async function build() {
    loading = true
    const icons = getActiveMarkers().filter(
      (/** @type {{ id: string }} */ def) => def.id !== "default",
    )
    const out = []
    for (const def of icons) {
      const iconClass = iconClassFor(def)
      if (!isSvgRenderedIcon(iconClass)) continue
      out.push({
        iconClass,
        name: def.name || iconClass,
        url: await renderTile(iconClass),
        override: perType[iconClass] || null,
      })
    }
    tiles = out
    loading = false
  }

  // Build on open + rebuild when the chosen style changes. When only the
  // base colour changes (the "All markers" swatch) re-render just the tiles
  // WITHOUT their own override — those are the ones that follow the base.
  let lastBaseKey = null
  $: baseKey = `${markerStyle}|${singleColor}`
  $: if (
    markerStyle &&
    (builtForStyle !== markerStyle || lastBaseKey !== baseKey)
  ) {
    const styleChanged = builtForStyle !== markerStyle
    const baseChanged = lastBaseKey !== baseKey
    builtForStyle = markerStyle
    lastBaseKey = baseKey
    if (styleChanged || tiles.length === 0) build()
    else if (baseChanged) refreshBaseTiles()
  }

  async function refreshBaseTiles() {
    for (const tile of tiles) {
      if (!tile.override) tile.url = await renderTile(tile.iconClass)
    }
    tiles = tiles
  }

  /** @param {string} iconClass @param {MouseEvent} event */
  function openPicker(iconClass, event) {
    if (saving) return
    const rect = event.currentTarget.getBoundingClientRect()
    picker = {
      iconClass,
      x: Math.max(8, Math.min(rect.left, window.innerWidth - 118)),
      y: Math.max(8, rect.top),
    }
  }
  function closePicker() {
    picker = null
    globalPicker = null
  }

  // ── Saving (mode + single colour + per-type map) ──
  /** @param {string} modeToSave @param {string} color @param {Record<string, string>} perTypeMap @returns {Promise<any>} */
  async function saveDefaults(modeToSave, color, perTypeMap) {
    saving = true
    try {
      const result = await userSettingsApi.updateMarkerDefaultColors(
        modeToSave,
        color,
        perTypeMap,
      )
      if (result?.success) toast.success("Default colour updated")
      else toast.error(result?.message || "Failed to update setting")
      return result
    } catch (e) {
      toast.error(e?.message || "Error saving setting")
      return null
    } finally {
      saving = false
    }
  }

  /** @param {string} key */
  function pickGlobalColor(key) {
    globalPicker = null
    saveDefaults("single", key, perType)
  }

  /** Reset every marker back to the original default colour. */
  async function resetAll() {
    if (saving) return
    const result = await saveDefaults("single", MARKER_COLOR_DEFAULT, {})
    if (result?.success) {
      toast.success("Marker colours reset to default")
      await build()
    }
  }

  /** @param {MouseEvent} event */
  function openGlobalPicker(event) {
    if (saving) return
    const rect = event.currentTarget.getBoundingClientRect()
    globalPicker = {
      x: Math.max(8, Math.min(rect.left, window.innerWidth - 118)),
      y: Math.max(8, rect.bottom + 6),
    }
  }

  /** @param {string} iconClass @param {string} key */
  async function pickColor(iconClass, key) {
    const next = { ...perType }
    if (key === "builtin" || key === MARKER_COLOR_DEFAULT) delete next[iconClass]
    else next[iconClass] = key
    picker = null
    const result = await saveDefaults("single", singleColor, next)
    if (result?.success) {
      // Re-render just the changed tile (the store already refreshed).
      const tile = tiles.find((t) => t.iconClass === iconClass)
      if (tile) {
        tile.url = await renderTile(iconClass)
        tile.override = perType[iconClass] || null
        tiles = tiles
      }
    }
  }

  /** @param {string} key @returns {string} */
  function overrideLabel(key) {
    return key === RANDOM_COLOR_KEY ? "Random" : markerColor(key).label
  }

  /** @param {string} key @returns {string} */
  function overrideSwatch(key) {
    if (key === RANDOM_COLOR_KEY)
      return "conic-gradient(from 0deg, #ef4444, #f97316, #eab308, #22c55e, #3b82f6, #a855f7, #ef4444)"
    if (key === MARKER_COLOR_DEFAULT) return DEFAULT_GRADIENT
    return styleSwatchBg(markerColor(key, markerStyle), markerStyle)
  }

  $: globalColorTitle =
    singleColor === RANDOM_COLOR_KEY
      ? "Random — every marker with no colour set gets a random palette colour"
      : singleColor === MARKER_COLOR_DEFAULT
        ? "Original default — the style's natural neutral colour"
        : markerColor(singleColor).label
</script>

<div class="mdc-overlay" on:click={onClose} role="presentation">
  <div
    class="mdc-modal"
    role="dialog"
    aria-modal="true"
    aria-label="Marker default colours"
    on:click|stopPropagation
  >
    <div class="mdc-head">
      <div class="mdc-head-text">
        <div class="mdc-title">Marker default colours</div>
        <div class="mdc-sub">
          New markers without a colour use the <b>"All markers"</b> colour
          above. Tap any marker below to give that type its own colour. Style:
          <b>{styleLabel}</b>.
        </div>
      </div>
      <button
        type="button"
        class="mdc-close"
        aria-label="Close"
        on:click={onClose}
      >
        <X size={18} />
      </button>
    </div>

    <!-- "All markers" base colour — every marker without its own colour
         follows this (the original default unless changed) -->
    <div class="mdc-global-row">
      <span class="mdc-global-label">All markers:</span>
      <button
        type="button"
        class="mdc-swatch"
        class:is-default={singleColor === MARKER_COLOR_DEFAULT}
        style="background:{overrideSwatch(singleColor)};"
        title={globalColorTitle}
        aria-label="Change the colour for all markers"
        disabled={saving}
        on:click={(e) => openGlobalPicker(e)}
      ></button>
      {#if singleColor === MARKER_COLOR_DEFAULT}
        <span class="mdc-global-r">default</span>
      {:else if singleColor === RANDOM_COLOR_KEY}
        <span class="mdc-global-r">Random</span>
      {/if}
      <span class="mdc-global-hint"
        >Markers set individually keep their own colour.</span
      >
    </div>

    {#if loading}
      <div class="mdc-loading">Rendering markers…</div>
    {:else}
      <div class="mdc-grid">
        {#each tiles as tile}
          <button
            type="button"
            class="mdc-tile"
            class:has-override={!!tile.override}
            title="{tile.name} — {tile.override
              ? overrideLabel(tile.override)
              : 'Follows the all-markers colour'}"
            aria-label="Set default colour for {tile.name}"
            on:click={(e) => openPicker(tile.iconClass, e)}
            disabled={saving}
          >
            {#if tile.url}
              <img class="mdc-marker" src={tile.url} alt={tile.name} />
            {/if}
            <span class="mdc-badge">
              {#if tile.override}
                <span
                  class="mdc-dot"
                  style="background:{overrideSwatch(tile.override)};"
                ></span>
              {:else}
                <span class="mdc-d">D</span>
              {/if}
            </span>
          </button>
        {/each}
      </div>
    {/if}

    {#if picker}
      <div
        class="mdc-pop-overlay"
        on:click={closePicker}
        on:contextmenu|preventDefault={closePicker}
      ></div>
      <div class="mdc-pop" style="left: {picker.x}px; top: {picker.y}px;">
        <button
          type="button"
          class="mdc-cell mdc-cell-special"
          class:active={!perType[picker.iconClass]}
          title="Follow the all-markers colour"
          on:click={() => pickColor(picker.iconClass, "builtin")}
        >D</button>
        <button
          type="button"
          class="mdc-cell mdc-cell-special"
          class:active={perType[picker.iconClass] === RANDOM_COLOR_KEY}
          style="background: conic-gradient(from 0deg, #ef4444, #f97316, #eab308, #22c55e, #3b82f6, #a855f7, #ef4444);"
          title="Random — this marker type gets a random palette colour"
          on:click={() => pickColor(picker.iconClass, RANDOM_COLOR_KEY)}
        >R</button>
        {#each pickableColorsForStyle(markerStyle) as c}
          <button
            type="button"
            class="mdc-cell"
            class:active={perType[picker.iconClass] === c.key}
            style="background: {styleSwatchBg(markerColor(c.key, markerStyle), markerStyle)};"
            title={c.label}
            on:click={() => pickColor(picker.iconClass, c.key)}
          ></button>
        {/each}
      </div>
    {/if}

    {#if globalPicker}
      <div
        class="mdc-pop-overlay"
        on:click={closePicker}
        on:contextmenu|preventDefault={closePicker}
      ></div>
      <div
        class="mdc-pop"
        style="left: {globalPicker.x}px; top: {globalPicker.y}px;"
      >
        <button
          type="button"
          class="mdc-cell mdc-cell-special"
          class:active={singleColor === MARKER_COLOR_DEFAULT}
          title="Original default — the style's natural neutral colour"
          on:click={() => pickGlobalColor(MARKER_COLOR_DEFAULT)}
        >D</button>
        <button
          type="button"
          class="mdc-cell mdc-cell-special"
          class:active={singleColor === RANDOM_COLOR_KEY}
          style="background: conic-gradient(from 0deg, #ef4444, #f97316, #eab308, #22c55e, #3b82f6, #a855f7, #ef4444);"
          title="Random — every marker with no colour set gets a random palette colour"
          on:click={() => pickGlobalColor(RANDOM_COLOR_KEY)}
        >R</button>
        {#each pickableColorsForStyle(markerStyle) as c}
          <button
            type="button"
            class="mdc-cell"
            class:active={singleColor === c.key}
            style="background: {styleSwatchBg(markerColor(c.key, markerStyle), markerStyle)};"
            title={c.label}
            on:click={() => pickGlobalColor(c.key)}
          ></button>
        {/each}
      </div>
    {/if}

    <div class="mdc-footer">
      <button
        type="button"
        class="mdc-reset"
        disabled={saving}
        on:click={resetAll}
        title="Reset every marker back to the original default colour"
      >
        Reset all
      </button>
      <button type="button" class="mdc-ok" on:click={onClose}>OK</button>
    </div>
  </div>
</div>

<style>
  .mdc-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 80;
    padding: 16px;
  }

  .mdc-modal {
    background: rgba(2, 6, 23, 0.96);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 16px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    width: min(94vw, 760px);
    max-height: 88vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: mdcIn 0.2s ease-out;
  }

  .mdc-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 16px 18px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .mdc-head-text {
    min-width: 0;
  }

  .mdc-title {
    font-size: 15px;
    font-weight: 700;
    color: #f1f5f9;
  }

  .mdc-sub {
    font-size: 12px;
    color: #94a3b8;
    margin-top: 4px;
    line-height: 1.5;
  }

  .mdc-sub b {
    color: #cbd5e1;
  }

  .mdc-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: transparent;
    color: #cbd5e1;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.15s ease, color 0.15s ease;
  }

  .mdc-close:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #f1f5f9;
  }

  .mdc-loading {
    padding: 48px 18px;
    text-align: center;
    color: #94a3b8;
    font-size: 13px;
  }

  /* Global "all markers" colour */
  .mdc-global-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 16px 18px;
  }

  .mdc-global-label {
    font-size: 13px;
    color: #cbd5e1;
  }

  .mdc-swatch {
    width: 30px;
    height: 30px;
    border-radius: 8px;
    border: 2px solid rgba(255, 255, 255, 0.4);
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.35);
    cursor: pointer;
    padding: 0;
    transition: transform 0.15s ease;
  }

  .mdc-swatch:hover:not(:disabled) {
    transform: scale(1.1);
  }

  .mdc-swatch.is-default {
    border-style: dashed;
  }

  .mdc-swatch:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .mdc-global-r {
    font-size: 11px;
    color: #94a3b8;
  }

  .mdc-global-hint {
    margin-left: auto;
    font-size: 11px;
    color: #64748b;
  }

  .mdc-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(64px, 1fr));
    gap: 8px;
    padding: 14px 16px 18px;
    overflow: auto;
  }

  .mdc-tile {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    aspect-ratio: 1;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    background: rgba(15, 23, 42, 0.45);
    cursor: pointer;
    padding: 2px;
    transition: border-color 0.15s ease, background 0.15s ease,
      transform 0.15s ease;
  }

  .mdc-tile:hover:not(:disabled) {
    border-color: rgba(96, 165, 250, 0.6);
    background: rgba(30, 41, 59, 0.8);
    transform: translateY(-1px);
  }

  .mdc-tile.has-override {
    border-color: rgba(245, 158, 11, 0.45);
  }

  .mdc-tile:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .mdc-marker {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .mdc-badge {
    position: absolute;
    bottom: 3px;
    right: 3px;
    display: flex;
  }

  .mdc-dot {
    width: 12px;
    height: 12px;
    border-radius: 999px;
    border: 2px solid rgba(15, 23, 42, 0.9);
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.35);
  }

  .mdc-d {
    width: 14px;
    height: 14px;
    border-radius: 999px;
    border: 1.5px dashed rgba(255, 255, 255, 0.7);
    background: linear-gradient(135deg, #475569 0%, #94a3b8 100%);
    color: #e2e8f0;
    font-size: 9px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Colour-box popover */
  .mdc-pop-overlay {
    position: fixed;
    inset: 0;
    z-index: 60;
  }

  .mdc-pop {
    position: fixed;
    z-index: 61;
    width: 120px;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
    padding: 8px;
    background: #1e293b;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 10px;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
  }

  .mdc-cell {
    width: 100%;
    aspect-ratio: 1;
    border-radius: 6px;
    border: 2px solid transparent;
    cursor: pointer;
    padding: 0;
    transition: transform 0.15s ease, border-color 0.15s ease;
  }

  .mdc-cell:hover {
    transform: scale(1.08);
  }

  .mdc-cell.active {
    border-color: #fff;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.5);
  }

  .mdc-cell-special {
    border: 1.5px dashed rgba(255, 255, 255, 0.65);
    background: linear-gradient(135deg, #475569 0%, #94a3b8 100%);
    color: #e2e8f0;
    font-size: 11px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Footer — Reset all (left) + OK confirm (right, amber like the app's
     other confirm buttons) */
  .mdc-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 18px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(2, 6, 23, 0.6);
    flex-shrink: 0;
  }

  .mdc-reset {
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.06);
    color: #cbd5e1;
    font-size: 13px;
    font-weight: 600;
    padding: 8px 18px;
    border-radius: 999px;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease;
  }

  .mdc-reset:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(255, 255, 255, 0.35);
  }

  .mdc-reset:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .mdc-ok {
    border: 1px solid rgba(245, 158, 11, 0.5);
    background: rgba(245, 158, 11, 0.14);
    color: #fcd34d;
    font-size: 13px;
    font-weight: 700;
    padding: 8px 26px;
    border-radius: 999px;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease;
  }

  .mdc-ok:hover:not(:disabled) {
    background: rgba(245, 158, 11, 0.26);
    border-color: rgba(245, 158, 11, 0.75);
  }

  .mdc-ok:disabled {
    opacity: 0.5;
    cursor: default;
  }

  @keyframes mdcIn {
    from {
      opacity: 0;
      transform: translateY(8px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  /* Mobile — tighter and less verbose */
  @media (max-width: 560px) {
    .mdc-overlay {
      padding: 8px;
    }

    .mdc-modal {
      width: 100%;
      max-height: 94vh;
      border-radius: 12px;
    }

    .mdc-head {
      padding: 12px 14px;
      gap: 10px;
    }

    .mdc-sub {
      font-size: 11px;
    }

    /* Let the All-markers row breathe instead of squashing beside the long
       hint — the hint is the verbose bit, so drop it on small screens. */
    .mdc-global-row {
      flex-wrap: wrap;
      gap: 8px;
      padding: 12px 14px 14px;
    }

    .mdc-global-hint {
      display: none;
    }

    .mdc-grid {
      grid-template-columns: repeat(auto-fill, minmax(54px, 1fr));
      gap: 6px;
      padding: 12px 14px 14px;
    }

    .mdc-footer {
      padding: 10px 14px;
    }
  }
</style>
