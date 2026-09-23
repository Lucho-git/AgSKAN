<!-- TintedIconPreview.svelte
     Renders a single marker icon exactly as the live map draws it — the same
     SVG glyph renderer and style/colour resolution as MarkerManager. Used by
     the people/log menu for its marker thumbnails. -->
<script>
  import {
    MARKER_COLORS,
    MARKER_COLOR_DEFAULT,
    RANDOM_COLOR_KEY,
    TINT_MODE_DEFAULT,
    effectiveColorKey,
    isNoBackgroundIcon,
    markerColor,
    markerDefaultColorKey,
    randomColorForId,
  } from "./markerPalette"
  import { getIconBaseCanvas, tintMarkerCanvas } from "./markerTint"
  import { isSvgRenderedIcon, renderSvgMarkerCanvas } from "./markerSvgRenderer"
  import { userSettingsStore } from "$lib/stores/userSettingsStore"

  // Marker definition { id, class, name, active } — same shape as the
  // entries in markerDefinitions.
  /** @type {{ id: string, class: string, name?: string, active?: boolean } | null | undefined} */
  export let icon = null
  export let colorKey = MARKER_COLOR_DEFAULT
  export let size = 60

  // Back the canvas with device pixels — a canvas sized only in CSS pixels
  // gets upscaled by the browser on high-DPI screens (phones, retina), which
  // is what made the little log marker icons look pixelated.
  const dpr =
    typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 3) : 1
  $: renderSize = Math.round(size * dpr)

  /** @type {HTMLCanvasElement} */
  let canvasEl

  /** @param {{ id: string, class: string } | null | undefined} def */
  function iconKeyFor(def) {
    if (!def) return "default"
    if (def.id === "default") return "default"
    if (def.class?.startsWith("custom-svg")) return `custom-svg-${def.id}`
    if (def.class?.startsWith("ionic-")) return `ionic-${def.id}`
    return def.class || "default"
  }

  $: styleKey = $userSettingsStore?.markerStyle || TINT_MODE_DEFAULT

  /**
   * Mirror MarkerManager's colour resolution: an explicit colour wins
   * (style-adjusted), otherwise the per-type / base default, otherwise the
   * style's neutral; "random" resolves to a stable colour for this icon.
   * @param {string} key
   * @param {string} cKey
   * @returns {string}
   */
  function resolveColorKey(key, cKey) {
    const settings = $userSettingsStore || {}
    let resolved = effectiveColorKey(cKey, styleKey, {
      [styleKey]: markerDefaultColorKey(key, settings),
    })
    if (
      resolved === RANDOM_COLOR_KEY ||
      !MARKER_COLORS.some((c) => c.key === resolved)
    ) {
      resolved = randomColorForId(key)
    }
    return resolved
  }

  /**
   * @param {HTMLCanvasElement} src
   * @returns {HTMLCanvasElement | null}
   */
  function cloneCanvas(src) {
    const copy = document.createElement("canvas")
    copy.width = src.width
    copy.height = src.height
    const cctx = copy.getContext("2d", { willReadFrequently: true })
    if (!cctx) return null
    cctx.drawImage(src, 0, 0)
    return copy
  }

  // Re-run when the canvas element binds (the first invocation happens
  // before mount) and whenever the icon / colour / user style settings
  // change — same re-render trigger as the live map.
  $: canvasEl, renderSize, icon, colorKey, $userSettingsStore, draw(icon, colorKey)

  /**
   * @param {{ id: string, class: string } | null | undefined} def
   * @param {string} cKey
   */
  async function draw(def, cKey) {
    if (!canvasEl) return
    const ctx = canvasEl.getContext("2d")
    if (!ctx) return
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = "high"

    const key = iconKeyFor(def)
    const settings = $userSettingsStore || {}
    const glassAlpha = settings.iconGlassOpacity ?? 0.3

    // The default pin keeps its baked art (tinted only when given an
    // explicit colour) — exactly like the map.
    if (key === "default") {
      const base = await getIconBaseCanvas(key)
      if (!base) return
      if (cKey && cKey !== MARKER_COLOR_DEFAULT) {
        const copy = cloneCanvas(base)
        if (!copy) return
        tintMarkerCanvas(copy, markerColor(cKey), "default-pin")
        ctx.drawImage(copy, 0, 0, canvasEl.width, canvasEl.height)
      } else {
        ctx.drawImage(base, 0, 0, canvasEl.width, canvasEl.height)
      }
      return
    }

    const resolved = resolveColorKey(key, cKey)
    const mode = isNoBackgroundIcon(key) ? "icon-only" : styleKey

    // Glyph icons rasterize from their SVG art (the same renderer the map
    // uses) — vector-sharp at any size instead of a low-res PNG.
    if (isSvgRenderedIcon(key)) {
      try {
        const rendered = await renderSvgMarkerCanvas(
          key,
          resolved,
          mode,
          glassAlpha,
        )
        ctx.drawImage(rendered, 0, 0, canvasEl.width, canvasEl.height)
        return
      } catch (e) {
        // No glyph for this key — fall back to the baked PNG below.
      }
    }

    // Baked-PNG fallback (mapbox-marker variants etc.).
    const base = await getIconBaseCanvas(key)
    if (!base) return
    const copy = cloneCanvas(base)
    if (!copy) return
    tintMarkerCanvas(copy, markerColor(resolved, mode), mode, { glassAlpha })
    ctx.drawImage(copy, 0, 0, canvasEl.width, canvasEl.height)
  }
</script>

<canvas
  bind:this={canvasEl}
  width={renderSize}
  height={renderSize}
  style="width:{size}px; height:{size}px;"
></canvas>
