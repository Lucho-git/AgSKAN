<!-- src/lib/components/map/markers/MarkerPlacementPanel.svelte -->
<!-- Overlay-style placement menu for NEW (unconfirmed) markers, modelled on
     the on-map MarkerOverlayPanel (same .marker-pop look): a floating panel
     anchored to the marker with the icon grid + colour box + a Place button.
     Used when the "Placement menu style" setting is set to "On Map Panel". -->
<script>
  import { onMount, onDestroy } from "svelte"
  import IconSVG from "$lib/components/general/IconSVG.svelte"
  import { X, Check, MapPin } from "lucide-svelte"
  import {
    getAllMarkers,
    findMarkerByIconClass,
  } from "$lib/data/markerDefinitions"
  import { userSettingsStore } from "$lib/stores/userSettingsStore"
  import { mapAttentionStore } from "$lib/stores/mapAttentionStore"
  import {
    PICKABLE_MARKER_COLORS,
    MARKER_COLOR_DEFAULT,
    markerColor,
    styleSwatchBg,
    swatchText,
    markerDefaultColorKey,
    randomColorForId,
    RANDOM_COLOR_KEY,
    TINT_MODE_DEFAULT,
  } from "./markerPalette"

  export let map
  /** @type {import("svelte/store").Writable<any[]>} */
  export let confirmedMarkersStore
  export let selectedMarkerStore
  export let getCurrentIconClass = () => "default"
  export let getIconImageName = (iconClass) => iconClass
  export let previewTintName = (iconClass, colorKey, markerId) =>
    getIconImageName(iconClass)
  export let showPlacementRipple = () => {}
  export let deselectMarker = () => {}

  // ── Marker state (the unconfirmed new marker) ──
  $: marker = $selectedMarkerStore
  $: markerName = marker
    ? findMarkerByIconClass(
        previewIconClass || getCurrentIconClass(marker.id),
      )?.name || "Marker"
    : "Marker"
  // The icon shown in the header thumb (preview wins over the current one).
  $: displayIconClass =
    previewIconClass || getCurrentIconClass(marker?.id) || "default"

  // ── Colour selection ──
  let pickerColorKey = MARKER_COLOR_DEFAULT
  // Always-open note field (saved with the marker on confirm).
  let markerNotes = ""
  $: markerStyle = $userSettingsStore?.markerStyle || TINT_MODE_DEFAULT
  // The colour the box/header shows: the picked colour, or the effective
  // default colour for the current icon when set to Default.
  $: headerColorKey = (() => {
    if (
      pickerColorKey !== MARKER_COLOR_DEFAULT &&
      pickerColorKey !== RANDOM_COLOR_KEY
    ) {
      return pickerColorKey
    }
    const iconClass =
      previewIconClass || getCurrentIconClass(marker?.id)
    let key = markerDefaultColorKey(iconClass, $userSettingsStore || {})
    if (key === RANDOM_COLOR_KEY) {
      key = randomColorForId(marker?.id || "preview")
    }
    return key
  })()
  $: headerColorDef = markerColor(headerColorKey)
  $: menuTriggerColorKey =
    pickerColorKey === MARKER_COLOR_DEFAULT ? headerColorKey : pickerColorKey

  let colorBoxOpen = false
  function toggleColorBox() {
    colorBoxOpen = !colorBoxOpen
  }

  // ── Icon selection + live preview ──
  let previewIconClass = null
  $: selectableMarkers = getAllMarkers().filter((m) => m.active)

  // Live-preview the picked colour/icon on the map for the brand-new marker
  // (rendered via the selected symbol layer) before it's confirmed.
  function updatePreview(/** @type {string} */ iconClass) {
    if (!map || !marker) return
    const id = marker.id
    const source = map.getSource("markers")
    const data = source?._data
    const feature = data?.features?.find((f) => f.properties.id === id)
    if (feature) {
      feature.properties.icon = previewTintName(iconClass, pickerColorKey, id)
      feature.properties.iconClass = iconClass
      source.setData(data)
    }
    selectedMarkerStore.update((m) =>
      m?.id === id ? { ...m, iconClass } : m,
    )
  }

  function previewIcon(icon) {
    const newIconClass =
      icon.id === "default"
        ? "default"
        : icon.class.startsWith("custom-svg")
          ? `custom-svg-${icon.id}`
          : icon.class
    previewIconClass = newIconClass
    updatePreview(newIconClass)
  }

  function setPickerColor(/** @type {string} */ key) {
    colorBoxOpen = false
    pickerColorKey = key
    const iconClass =
      previewIconClass || getCurrentIconClass(marker?.id) || "default"
    updatePreview(iconClass)
  }

  function getIsIconSelected(icon) {
    if (previewIconClass) {
      const previewKey =
        icon.id === "default"
          ? "default"
          : icon.class.startsWith("custom-svg")
            ? `custom-svg-${icon.id}`
            : icon.class
      return previewKey === previewIconClass
    }
    const currentIconClass = getCurrentIconClass(marker?.id)
    if (!currentIconClass || currentIconClass === "default") {
      return icon.id === "default" && icon.class === "default"
    }
    if (currentIconClass.startsWith("custom-svg-")) {
      return (
        icon.class === "custom-svg" &&
        icon.id === currentIconClass.replace("custom-svg-", "")
      )
    }
    return icon.class === currentIconClass
  }

  // ── Panel positioning (anchored to the marker, same as the overlay menu) ──
  let left = -9999
  let top = -9999
  let visible = false
  let offscreen = false
  let openUp = true
  let smoothReposition = false
  // True while an edge badge points at the (off-screen) new marker so the
  // placement target stays visible while the panel is open.
  let attentionActive = false
  /** @type {ReturnType<typeof setTimeout> | null} */
  let smoothRepositionTimer = null
  /** @type {ResizeObserver | null} */
  let resizeObserver = null
  /** @type {number} */
  let lastMenuHeight = 0
  /** @type {HTMLElement | null} */
  let markerPopEl = null
  const SLIDE_BUFFER = 56
  const MENU_W = 250

  function position() {
    if (!map || !marker) return
    try {
      const container = map.getContainer()
      const rect = container.getBoundingClientRect()
      const coords = marker.coordinates
      if (!coords) return
      const p = map.project(coords)
      const px = p.x
      const py = p.y
      const menuH =
        markerPopEl?.offsetHeight || Math.min(360, rect.height - 70)

      visible =
        px > -40 && px < rect.width + 40 && py > 60 && py < rect.height + 40
      offscreen =
        px < -4 || px > rect.width + 4 || py < -4 || py > rect.height + 4

      const topMargin = 8
      const bottomMargin = 8
      const fitsVertically = menuH <= rect.height - topMargin - bottomMargin
      const idealUpAnchor = py - 44
      const idealDownAnchor = py + 44
      const upSlide = Math.max(0, menuH + topMargin - idealUpAnchor)
      const downSlide = Math.max(
        0,
        idealDownAnchor - (rect.height - bottomMargin - menuH),
      )
      if (fitsVertically) {
        if (openUp && upSlide > SLIDE_BUFFER && upSlide > downSlide) {
          openUp = false
        } else if (
          !openUp &&
          downSlide > SLIDE_BUFFER &&
          downSlide > upSlide
        ) {
          openUp = true
        }
      }
      let anchorY = openUp ? idealUpAnchor : idealDownAnchor
      if (openUp) {
        anchorY = Math.max(anchorY, menuH + topMargin)
        anchorY = Math.min(anchorY, rect.height - bottomMargin)
      } else {
        anchorY = Math.max(anchorY, topMargin)
        anchorY = Math.min(anchorY, rect.height - menuH - bottomMargin)
      }
      const hx = Math.min(
        Math.max(px, MENU_W / 2 + 8),
        rect.width - MENU_W / 2 - 8,
      )
      left = rect.left + hx
      top = rect.top + anchorY
    } catch {
      visible = false
      offscreen = false
    }
    updateAttention()
  }

  function positionSmooth() {
    smoothReposition = true
    position()
    clearTimeout(smoothRepositionTimer)
    smoothRepositionTimer = setTimeout(() => (smoothReposition = false), 350)
  }

  // Off-screen tracking: while the placement menu is open, register an edge
  // badge pointing at the (off-screen) new marker so you can find it again
  // (same behaviour as the silo/marker move state).
  function updateAttention() {
    if (marker && offscreen) {
      mapAttentionStore.add({
        id: `marker-place-${marker.id}`,
        coordinates: marker.coordinates,
        icon: MapPin,
        color: "#60a5fa",
        label: markerName,
        onClick: () => {
          if (map && marker?.coordinates) {
            map.easeTo({ center: marker.coordinates, duration: 600 })
          }
        },
      })
      attentionActive = true
    } else if (attentionActive) {
      mapAttentionStore.remove(`marker-place-${marker?.id}`)
      attentionActive = false
    }
  }

  function clearAttention() {
    if (attentionActive) {
      mapAttentionStore.remove(`marker-place-${marker?.id}`)
      attentionActive = false
    }
  }

  // ── Confirm / cancel ──
  function confirmPlacement() {
    if (!marker) return
    const { id, coordinates } = marker
    const iconClass = getCurrentIconClass(id) || "default"

    const markerData = {
      id,
      coordinates,
      iconClass,
      markerColor: pickerColorKey,
      notes: markerNotes.trim() || undefined,
      noteLabelVisible: true,
      created_at: new Date().toISOString(),
    }

    confirmedMarkersStore.update((markers) => {
      const existingIndex = markers.findIndex((m) => m.id === id)
      if (existingIndex >= 0) {
        markers[existingIndex] = markerData
        return markers
      }
      return [...markers, markerData]
    })

    // Green ripple on confirmation
    const markerDef = findMarkerByIconClass(iconClass)
    showPlacementRipple(
      coordinates,
      "rgba(34, 197, 94",
      markerDef?.name || "Marker",
    )

    if (map && map.getSource("markers")) {
      const source = map.getSource("markers")
      const data = source._data
      const feature = data.features.find((f) => f.properties.id === id)
      if (feature) {
        feature.properties.selected = false
        feature.properties.confirmed = true
        source.setData(data)
      }
    }

    deselectMarker()
  }

  // Close (X): cancel placement AND remove the unconfirmed marker entirely.
  function handleClose() {
    colorBoxOpen = false
    if (map && map.getSource("markers")) {
      const source = map.getSource("markers")
      const data = source._data
      data.features = data.features.filter(
        (f) => f.properties.id !== marker?.id,
      )
      source.setData(data)
    }
    deselectMarker()
  }

  // ── Map events ──
  onMount(() => {
    position()
    lastMenuHeight = markerPopEl?.offsetHeight || 0
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        const h = markerPopEl?.offsetHeight || 0
        if (h && Math.abs(h - lastMenuHeight) > 2) {
          lastMenuHeight = h
          positionSmooth()
        } else if (h) {
          lastMenuHeight = h
        }
      })
      if (markerPopEl) resizeObserver.observe(markerPopEl)
    }
    if (!map) return
    map.on("move", position)
    map.on("zoom", position)
    map.on("rotate", position)
    map.on("pitch", position)
    map.on("resize", position)
  })

  onDestroy(() => {
    resizeObserver?.disconnect()
    clearTimeout(smoothRepositionTimer)
    clearAttention()
    if (!map) return
    map.off("move", position)
    map.off("zoom", position)
    map.off("rotate", position)
    map.off("pitch", position)
    map.off("resize", position)
  })

  $: if (marker) position()
</script>

{#if marker}
  <div
    class="marker-pop"
    class:down={!openUp}
    class:smooth={smoothReposition}
    class:hidden={!visible}
    style="left: {left}px; top: {top}px;"
    bind:this={markerPopEl}
  >
    <div class="marker-pop-head">
      <div class="marker-pop-icon">
        {#if displayIconClass === "default"}
          <IconSVG icon="mapbox-marker" size="18px" />
        {:else if displayIconClass?.startsWith("custom-svg")}
          <IconSVG icon={displayIconClass.replace("custom-svg-", "")} size="18px" />
        {:else if displayIconClass?.startsWith("ionic-")}
          <ion-icon name={displayIconClass.replace("ionic-", "")} style="font-size: 18px;"></ion-icon>
        {:else if displayIconClass?.startsWith("at-")}
          <i class={`${displayIconClass} text-base`}></i>
        {:else}
          <IconSVG icon="mapbox-marker" size="18px" />
        {/if}
      </div>
      <div class="marker-pop-titles">
        <div class="marker-pop-title-row">
          <span class="marker-pop-title" title={markerName}>{markerName}</span>
          <span
            class="marker-pop-color-name"
            style="color: {swatchText(headerColorDef)}; border-color: {headerColorDef.dark}66; background: {headerColorDef.dark}1a;"
          >{headerColorDef.label}</span>
        </div>
        <span class="marker-pop-sub">New marker</span>
      </div>
      <button
        type="button"
        class="marker-pop-close"
        title="Cancel"
        aria-label="Cancel placing marker"
        on:click={handleClose}
      >
        <X size={14} />
      </button>
    </div>

    <div class="marker-pop-body">
      <div class="mp-section mp-icon-color-section">
        <button
          type="button"
          class="mp-color-bar"
          class:open={colorBoxOpen}
          class:color-active={pickerColorKey !== MARKER_COLOR_DEFAULT}
          title="Change colour"
          aria-label="Change colour"
          on:click={toggleColorBox}
        >
          <span class="mp-color-bar-title">Color</span>
          <span
            class="mp-color-trigger"
            class:mp-color-trigger-default={pickerColorKey === MARKER_COLOR_DEFAULT}
            style="background: {pickerColorKey === MARKER_COLOR_DEFAULT
              ? "transparent"
              : styleSwatchBg(markerColor(menuTriggerColorKey, markerStyle), markerStyle)};"
          >{#if pickerColorKey === MARKER_COLOR_DEFAULT}D{/if}</span>
        </button>
          {#if colorBoxOpen}
            <button
              type="button"
              class="mp-color-pop-overlay"
              aria-label="Close colour picker"
              on:click={() => (colorBoxOpen = false)}
            ></button>
            <div class="mp-color-pop">
              <button
                type="button"
                class="mp-color-cell mp-color-cell-special"
                class:active={pickerColorKey === MARKER_COLOR_DEFAULT}
                title="Default — follows the marker default colour"
                aria-label="Marker colour: Default"
                on:click={() => setPickerColor(MARKER_COLOR_DEFAULT)}
              >D</button>
              {#each PICKABLE_MARKER_COLORS.filter(
                (c) => c.key !== MARKER_COLOR_DEFAULT,
              ) as c}
                <button
                  type="button"
                  class="mp-color-cell"
                  class:active={pickerColorKey === c.key}
                  style="background: {styleSwatchBg(markerColor(c.key, markerStyle), markerStyle)};"
                  title={c.label}
                  aria-label={`Marker colour ${c.label}`}
                  on:click={() => setPickerColor(c.key)}
                ></button>
              {/each}
            </div>
          {/if}
      </div>

      <div class="mp-icon-grid">
        {#each selectableMarkers as icon}
          <button
            class="mp-icon-option"
            class:selected={getIsIconSelected(icon)}
            on:click={() => previewIcon(icon)}
            title={icon.name}
          >
            {#if icon.id === "default"}
              <IconSVG icon="mapbox-marker" size="22px" />
            {:else if icon.class.startsWith("custom-svg")}
              <IconSVG icon={icon.id} size="22px" />
            {:else if icon.class.startsWith("ionic-")}
              <ion-icon name={icon.id} style="font-size: 22px;"></ion-icon>
            {:else}
              <i class={`${icon.class} text-lg`}></i>
            {/if}
          </button>
        {/each}
      </div>
    </div>

    <input
      type="text"
      class="mp-notes-input"
      bind:value={markerNotes}
      placeholder="Add a note..."
      maxlength="500"
      aria-label="Add a note"
    />

    <button
      type="button"
      class="mp-place-confirm"
      on:click={confirmPlacement}
    >
      <Check size={14} />
      <span>Place Marker</span>
    </button>
  </div>
{/if}

<style>
  .marker-pop {
    --pop-y: -100%;
    position: fixed;
    transform: translate(-50%, var(--pop-y));
    width: 250px;
    height: 360px;
    max-height: calc(100vh - 70px);
    z-index: 1001;
    animation: mp-pop-in 0.28s cubic-bezier(0.16, 1, 0.3, 1);
    background: rgba(8, 12, 24, 0.97);
    backdrop-filter: blur(14px);
    border: 1px solid rgba(96, 165, 250, 0.4);
    border-radius: 14px;
    padding: 10px 12px 12px;
    box-shadow: 0 14px 36px rgba(0, 0, 0, 0.6);
    display: flex;
    flex-direction: column;
    gap: 8px;
    color: rgba(255, 255, 255, 0.92);
  }
  .marker-pop.down {
    --pop-y: 0%;
  }
  .marker-pop.smooth {
    transition:
      transform 0.3s cubic-bezier(0.16, 1, 0.3, 1),
      top 0.3s cubic-bezier(0.16, 1, 0.3, 1),
      left 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .marker-pop.hidden {
    opacity: 0;
    pointer-events: none;
  }
  @keyframes mp-pop-in {
    from {
      opacity: 0;
      transform: translate(-50%, var(--pop-y)) scale(0.94);
    }
    to {
      opacity: 1;
      transform: translate(-50%, var(--pop-y)) scale(1);
    }
  }

  .marker-pop-head {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    padding-bottom: 8px;
  }
  .marker-pop-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border-radius: 8px;
    background: rgba(96, 165, 250, 0.14);
    color: #93c5fd;
    flex-shrink: 0;
  }
  .marker-pop-titles {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0;
  }
  .marker-pop-title-row {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .marker-pop-title {
    min-width: 0;
    font-size: 13px;
    font-weight: 800;
    color: #93c5fd;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .marker-pop-sub {
    min-width: 0;
    font-size: 9px;
    font-weight: 600;
    line-height: 1.2;
    color: rgba(255, 255, 255, 0.45);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .marker-pop-color-name {
    flex-shrink: 0;
    align-self: center;
    font-size: 8px;
    font-weight: 800;
    line-height: 1.3;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    padding: 1px 5px;
    border-radius: 999px;
    border: 1px solid;
    white-space: nowrap;
    max-width: 72px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .marker-pop-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 7px;
    border: none;
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.7);
    cursor: pointer;
    flex-shrink: 0;
  }
  .marker-pop-close:hover {
    background: rgba(255, 255, 255, 0.16);
    color: #fff;
  }

  .marker-pop-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    padding-bottom: 8px;
  }
  .mp-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  /* The colour card IS the button — the whole card (incl. its padding) is
     the clickable target for the colour popover. */
  .mp-icon-color-section {
    position: relative;
    margin-bottom: 10px;
  }
  .mp-color-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    padding: 10px;
    border-radius: 9px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.04);
    color: rgba(255, 255, 255, 0.55);
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
  }
  .mp-color-bar:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(96, 165, 250, 0.35);
  }
  /* A colour is picked → slight border highlight around the card. */
  .mp-color-bar.color-active {
    border-color: rgba(96, 165, 250, 0.55);
    box-shadow: 0 0 0 1px rgba(96, 165, 250, 0.22);
  }
  .mp-color-bar-title {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .mp-color-bar.open .mp-color-trigger {
    transform: scale(1.1);
  }

  .mp-color-trigger {
    width: 26px;
    height: 26px;
    border-radius: 6px;
    border: 2px solid rgba(255, 255, 255, 0.4);
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.35);
    cursor: pointer;
    padding: 0;
    transition: transform 0.15s ease;
  }
  .mp-color-trigger:hover {
    transform: scale(1.1);
  }
  .mp-color-trigger-default {
    border-style: dashed !important;
    border-color: rgba(255, 255, 255, 0.55) !important;
    background: rgba(255, 255, 255, 0.06) !important;
    color: rgba(255, 255, 255, 0.85);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: 700;
  }
  .mp-color-pop-overlay {
    position: fixed;
    inset: 0;
    z-index: 30;
    border: none;
    background: transparent;
    padding: 0;
    cursor: default;
  }
  .mp-color-pop {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 31;
    width: 112px;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
    padding: 8px;
    background: #1e293b;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 10px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  }
  .mp-color-cell {
    width: 28px;
    height: 28px;
    border-radius: 6px;
    border: 2px solid rgba(255, 255, 255, 0.2);
    cursor: pointer;
    padding: 0;
    transition: transform 0.12s ease;
  }
  .mp-color-cell:hover {
    transform: scale(1.12);
  }
  .mp-color-cell.active {
    border-color: #fff !important;
    box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.6);
  }
  .mp-color-cell-special {
    border: 2px dashed rgba(255, 255, 255, 0.55);
    background: rgba(255, 255, 255, 0.06);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.85);
  }
  .mp-color-cell-special.active {
    border-style: solid;
    border-color: #fff;
    box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.6);
  }

  .mp-icon-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 6px;
  }
  .mp-icon-option {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 40px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.05);
    color: rgba(255, 255, 255, 0.85);
    cursor: pointer;
    transition: all 0.12s ease;
  }
  .mp-icon-option:hover {
    background: rgba(255, 255, 255, 0.12);
  }
  .mp-icon-option.selected {
    border-color: rgba(96, 165, 250, 0.8);
    background: rgba(96, 165, 250, 0.18);
    box-shadow: 0 0 0 1px rgba(96, 165, 250, 0.4);
  }

  /* Always-open single-line note field above the Place button. */
  .mp-notes-input {
    width: 100%;
    flex-shrink: 0;
    padding: 8px 10px;
    border-radius: 9px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(255, 255, 255, 0.07);
    color: #fff;
    font-size: 12px;
    font-family: inherit;
    outline: none;
  }
  .mp-notes-input::placeholder {
    color: rgba(255, 255, 255, 0.4);
  }
  .mp-notes-input:focus {
    border-color: rgba(96, 165, 250, 0.6);
  }

  /* Compact full-width confirm button for placing the marker. */
  .mp-place-confirm {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    flex-shrink: 0;
    padding: 9px 10px;
    border-radius: 8px;
    border: 1px solid rgba(245, 158, 11, 0.5);
    background: rgba(245, 158, 11, 0.14);
    color: #fcd34d;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .mp-place-confirm:hover {
    background: rgba(245, 158, 11, 0.28);
  }
</style>
