<!--
  MarkerStylePreviewModal.svelte
  "?" help for the Marker style setting. Mirrors the public marker-survey
  page: a live Mapbox map over a real farm with EVERY active marker icon
  placed in a grid, so the user can judge each style against the actual
  farming background without placing markers. Each icon gets one stable
  random palette colour. Big left/right arrows + dots switch between the 6
  styles.
-->
<script>
  import { onMount, onDestroy } from "svelte"
  import { ChevronLeft, ChevronRight, X } from "lucide-svelte"
  // mapbox-gl ships no types; the rest of the app imports it untyped too.
  // @ts-ignore
  import * as mapboxgl from "mapbox-gl"
  import "mapbox-gl/dist/mapbox-gl.css"
  import { PUBLIC_MAPBOX_ACCESS_TOKEN } from "$env/static/public"
  import { getActiveMarkers } from "$lib/data/markerDefinitions"
  import {
    TINT_MODES,
    markerColor,
    randomColorForId,
  } from "$lib/components/map/markers/markerPalette"
  import {
    isSvgRenderedIcon,
    renderSvgMarkerImageData,
  } from "$lib/components/map/markers/markerSvgRenderer"
  import {
    getIconBaseCanvas,
    tintMarkerCanvas,
  } from "$lib/components/map/markers/markerTint"

  /** Callback to close the modal. */
  export let onClose = null
  /** Callback to apply a chosen style key (ProfileControls.setMarkerStyle). */
  export let onApplyStyle = null

  // Same farm as the marker-survey page. Zoomed out slightly so the whole
  // icon grid stays inside the modal's map area.
  const CENTER = [118.257866, -32.238795]
  const INITIAL_ZOOM = 15.0
  const SATELLITE_STYLE = "mapbox://styles/mapbox/satellite-streets-v12"
  // 9 per row × 60px keeps the 54-marker grid compact enough to fit the
  // taller modal map on smaller screens.
  const PER_ROW = 9
  const SPACING = 60

  const styles = TINT_MODES

  /** @type {HTMLDivElement | undefined} */
  let mapContainer
  /** @type {any} */
  let map = null
  let mapReady = false
  let mapError = null
  let gridCount = 0
  let setupStarted = false
  /** @type {any} */
  let setupPoll = null

  let styleIndex = 0
  $: activeStyleLabel = styles[styleIndex]?.label || ""

  /** @type {Array<{ key: string, colorKey: string }>} */
  let renderableIcons = []
  /** @type {Map<string, Map<string, string>>} */
  const styleImages = new Map()
  /** @type {Array<any>} */
  let gridFeatures = []

  /** @param {{ id: string, class?: string }} def @returns {string} */
  function iconClassFor(def) {
    if (def.class === "custom-svg") return `custom-svg-${def.id}`
    return def.class || "default"
  }

  // Every active icon that can actually render (SVG-rendered or the default
  // pin), each with ONE stable random palette colour so style switches are a
  // fair comparison.
  function collectIcons() {
    renderableIcons = getActiveMarkers()
      .map((def) => {
        const key = iconClassFor(def)
        if (key !== "default" && !isSvgRenderedIcon(key)) return null
        return { key, colorKey: randomColorForId(key) }
      })
      .filter(Boolean)
  }

  // Register (and cache) the map images for one style — every grid icon
  // tinted in that style. The default pin uses the dedicated "default-pin"
  // tint (registered once per colour; it doesn't change with the style).
  /** @param {string} styleKey @returns {Promise<Map<string, string>>} */
  async function prepareStyleImages(styleKey) {
    if (styleImages.has(styleKey)) {
      return /** @type {Map<string, string>} */ (styleImages.get(styleKey))
    }
    /** @type {Map<string, string>} */
    const images = new Map()
    for (const item of renderableIcons) {
      const { key, colorKey } = item
      const name = `msp-${key}-${styleKey}-${colorKey}`
      try {
        if (!map.hasImage(name)) {
          if (key === "default") {
            const base = await getIconBaseCanvas("default")
            if (!base) continue
            const copy = document.createElement("canvas")
            copy.width = base.width
            copy.height = base.height
            const cctx = copy.getContext("2d")
            if (!cctx) continue
            cctx.drawImage(base, 0, 0)
            tintMarkerCanvas(
              copy,
              markerColor(colorKey, "default-pin"),
              "default-pin",
            )
            const d = cctx.getImageData(0, 0, copy.width, copy.height)
            map.addImage(name, {
              width: copy.width,
              height: copy.height,
              data: d.data,
            })
          } else {
            const image = await renderSvgMarkerImageData(
              key,
              colorKey,
              styleKey,
              0.3,
            )
            map.addImage(name, image)
          }
        }
        images.set(key, name)
      } catch (e) {
        console.warn(`msp: could not prepare icon ${key}:`, e)
      }
    }
    styleImages.set(styleKey, images)
    return images
  }

  // Build the grid of point features anchored around the farm centre.
  function buildGridFeatures() {
    const centerPx = map.project(CENTER)
    return renderableIcons.map((item, i) => {
      const col = i % PER_ROW
      const row = Math.floor(i / PER_ROW)
      const px = {
        x: centerPx.x + (col - (PER_ROW - 1) / 2) * SPACING,
        y:
          centerPx.y +
          (row - Math.ceil(renderableIcons.length / PER_ROW) / 2 + 0.5) *
            SPACING,
      }
      const ll = map.unproject(px)
      return {
        type: "Feature",
        geometry: { type: "Point", coordinates: [ll.lng, ll.lat] },
        properties: { iconKey: item.key, "icon-image": "" },
      }
    })
  }

  /** @param {string} styleKey */
  async function applyStyle(styleKey) {
    if (!mapReady || !map || !map.getSource("msp-markers")) return
    try {
      const images = await prepareStyleImages(styleKey)
      const features = gridFeatures.map((f) => {
        const iconName = images.get(f.properties.iconKey) || "msp-default"
        return {
          type: "Feature",
          geometry: f.geometry,
          properties: {
            iconKey: f.properties.iconKey,
            "icon-image": iconName,
          },
        }
      })
      map
        .getSource("msp-markers")
        .setData({ type: "FeatureCollection", features })
    } catch (e) {
      console.warn("msp: applyStyle failed:", e)
    }
  }

  function nextStyle() {
    styleIndex = (styleIndex + 1) % styles.length
    applyStyle(styles[styleIndex].key)
  }
  function prevStyle() {
    styleIndex = (styleIndex - 1 + styles.length) % styles.length
    applyStyle(styles[styleIndex].key)
  }
  function goToStyle(i) {
    styleIndex = i
    applyStyle(styles[i].key)
  }

  // "Use this style" — apply the currently viewed style. The parent decides
  // what happens next (close the modal, or advance to the colour step in the
  // first-run onboarding flow) via onApplyStyle; onClose is only for ✕ /
  // backdrop dismissal.
  function handleApplyStyle() {
    if (onApplyStyle) onApplyStyle(styles[styleIndex].key)
  }

  async function runSetup() {
    if (setupStarted) return
    setupStarted = true
    if (setupPoll) {
      clearInterval(setupPoll)
      setupPoll = null
    }
    try {
      collectIcons()
      if (renderableIcons.length === 0) {
        mapError = "No marker icons could be loaded."
        return
      }
      mapReady = true
      map.addSource("msp-markers", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      })
      map.addLayer({
        id: "msp-markers-layer",
        type: "symbol",
        source: "msp-markers",
        layout: {
          "icon-image": ["get", "icon-image"],
          "icon-size": 0.35,
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
        },
      })
      gridFeatures = buildGridFeatures()
      gridCount = gridFeatures.length
      await applyStyle(styles[0].key)
    } catch (e) {
      console.error("msp: map setup failed", e)
      mapError = "The map failed to load. Please close and reopen."
    }
  }

  // Run setup when the style is usable (load event, with a poll fallback).
  function setupWhenReady() {
    if (map.isStyleLoaded()) {
      runSetup()
      return
    }
    map.once("load", runSetup)
    setupPoll = setInterval(() => {
      if (map.isStyleLoaded()) runSetup()
    }, 300)
  }

  onMount(() => {
    mapboxgl.accessToken = PUBLIC_MAPBOX_ACCESS_TOKEN
    map = new mapboxgl.Map({
      container: mapContainer,
      style: SATELLITE_STYLE,
      center: CENTER,
      zoom: INITIAL_ZOOM,
      accessToken: PUBLIC_MAPBOX_ACCESS_TOKEN,
      attributionControl: true,
    })
    map.setMinZoom(3)
    setupWhenReady()
  })

  onDestroy(() => {
    if (setupPoll) {
      clearInterval(setupPoll)
      setupPoll = null
    }
    if (map) {
      try {
        map.remove()
      } catch (e) {
        /* noop */
      }
      map = null
    }
  })
</script>

<div class="msp-overlay" on:click={onClose} role="presentation">
  <div
    class="msp-modal"
    role="dialog"
    aria-modal="true"
    aria-label="Marker style preview"
    on:click|stopPropagation
  >
    <div class="msp-head">
      <button
        type="button"
        class="msp-arrow msp-arrow-left"
        aria-label="Previous style"
        on:click={prevStyle}
        disabled={!mapReady}
      >
        <ChevronLeft size={26} />
      </button>
      <div class="msp-head-text">
        <div class="msp-title">{activeStyleLabel || "Marker style preview"}</div>
        <div class="msp-sub">
          Style {styleIndex + 1} of {styles.length} — every marker on a real
          farm.
        </div>
      </div>
      <button
        type="button"
        class="msp-arrow msp-arrow-right"
        aria-label="Next style"
        on:click={nextStyle}
        disabled={!mapReady}
      >
        <ChevronRight size={26} />
      </button>
      <button
        type="button"
        class="msp-close"
        aria-label="Close"
        on:click={onClose}
      >
        <X size={18} />
      </button>
    </div>

    <div class="msp-map" bind:this={mapContainer}>
      {#if mapError}
        <div class="msp-map-overlay error">{mapError}</div>
      {:else if !mapReady}
        <div class="msp-map-overlay">Loading map…</div>
      {:else}
        <div class="msp-map-chip">
          Showing {gridCount} markers · {activeStyleLabel}
        </div>
      {/if}
    </div>

    <div class="msp-foot">
      <button
        type="button"
        class="msp-apply"
        on:click={handleApplyStyle}
        disabled={!mapReady}
      >
        Use this style
      </button>
      <div class="msp-dots">
        {#each styles as s, i}
          <button
            type="button"
            class="msp-dot"
            class:active={i === styleIndex}
            title={s.label}
            aria-label={`Style: ${s.label}`}
            on:click={() => goToStyle(i)}
            disabled={!mapReady}
          ></button>
        {/each}
      </div>
      <p class="msp-hint">Scroll to zoom · drag to pan · arrows to change style</p>
    </div>
  </div>
</div>

<style>
  .msp-overlay {
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

  .msp-modal {
    background: rgba(2, 6, 23, 0.96);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 16px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    width: min(94vw, 900px);
    max-height: 96vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: mspIn 0.2s ease-out;
  }

  .msp-head {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .msp-head-text {
    flex: 1;
    min-width: 0;
    text-align: center;
  }

  .msp-title {
    font-size: 15px;
    font-weight: 700;
    color: #f1f5f9;
  }

  .msp-sub {
    font-size: 12px;
    color: #94a3b8;
    margin-top: 2px;
    line-height: 1.4;
  }

  /* Big side-to-side carousel arrows for switching styles */
  .msp-arrow {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: 999px;
    border: 1px solid rgba(96, 165, 250, 0.45);
    background: rgba(15, 23, 42, 0.7);
    color: #93c5fd;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.15s ease, color 0.15s ease,
      border-color 0.15s ease, opacity 0.15s ease;
  }

  .msp-arrow:hover:not(:disabled) {
    background: rgba(96, 165, 250, 0.22);
    border-color: rgba(96, 165, 250, 0.8);
    color: #dbeafe;
  }

  .msp-arrow:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .msp-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: transparent;
    color: #cbd5e1;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.15s ease, color 0.15s ease;
  }

  .msp-close:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #f1f5f9;
  }

  .msp-map {
    position: relative;
    flex: 1;
    /* Room for the 54-marker grid (9/row × 60px = 300px tall), but shrink
       on short screens instead of clipping the modal. */
    min-height: min(460px, 52vh);
    background: #0b1220;
  }

  .msp-map-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #94a3b8;
    font-size: 13px;
    background: #0b1220;
    z-index: 1;
  }

  .msp-map-overlay.error {
    color: #fca5a5;
  }

  .msp-map-chip {
    position: absolute;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 2;
    background: rgba(2, 6, 23, 0.8);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: #e2e8f0;
    font-size: 11px;
    padding: 4px 12px;
    border-radius: 999px;
    pointer-events: none;
    white-space: nowrap;
  }

  .msp-foot {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  /* "Use this style" — amber confirm like the app's marker buttons */
  .msp-apply {
    border: 1px solid rgba(245, 158, 11, 0.5);
    background: rgba(245, 158, 11, 0.14);
    color: #fcd34d;
    font-size: 13px;
    font-weight: 700;
    padding: 8px 22px;
    border-radius: 999px;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease;
  }

  .msp-apply:hover:not(:disabled) {
    background: rgba(245, 158, 11, 0.26);
    border-color: rgba(245, 158, 11, 0.75);
  }

  .msp-apply:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .msp-dots {
    display: flex;
    gap: 7px;
  }

  .msp-dot {
    width: 9px;
    height: 9px;
    border-radius: 999px;
    border: none;
    background: rgba(148, 163, 184, 0.4);
    cursor: pointer;
    padding: 0;
    transition: background 0.15s ease, transform 0.15s ease;
  }

  .msp-dot.active {
    background: #60a5fa;
    transform: scale(1.25);
  }

  .msp-dot:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .msp-hint {
    margin: 0;
    font-size: 11px;
    color: #64748b;
  }

  /* ── Mobile ── */
  @media (max-width: 560px) {
    .msp-overlay {
      padding: 8px;
    }

    .msp-modal {
      width: 100%;
      max-height: 94vh;
      border-radius: 12px;
    }

    /* Tighter header so the arrows + close don't squeeze the title */
    .msp-head {
      gap: 8px;
      padding: 10px 10px;
    }
    .msp-arrow {
      width: 36px;
      height: 36px;
    }
    .msp-arrow :global(svg) {
      width: 22px;
      height: 22px;
    }
    .msp-close {
      width: 32px;
      height: 32px;
    }
    .msp-title {
      font-size: 13px;
    }
    .msp-sub {
      font-size: 11px;
    }

    /* Shorter map so the modal fits a phone screen */
    .msp-map {
      min-height: min(340px, 44vh);
    }

    /* Full-width apply button + bigger dots for touch */
    .msp-apply {
      width: 100%;
      padding: 10px 22px;
    }
    .msp-dot {
      width: 12px;
      height: 12px;
    }
    .msp-hint {
      font-size: 10px;
    }
  }

  @keyframes mspIn {
    from {
      opacity: 0;
      transform: translateY(8px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
</style>
