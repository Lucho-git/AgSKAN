<!-- TintedIconPreview.svelte
     Renders a single marker icon as it would appear on the map, given the
     icon definition ({id, class}), a colour key and a tint mode. Used by the
     new-marker picker in test mode so the user can preview every icon in a
     chosen style against the live map behind the translucent panel.
     Uses the SAME tint logic as MarkerManager (markerTint.js) so previews
     match the real map exactly. -->
<script>
  import {
    MARKER_COLOR_DEFAULT,
    markerColor,
  } from "./markerPalette"
  import {
    getIconBaseCanvas,
    tintMarkerCanvas,
  } from "./markerTint"

  // Marker definition { id, class, name, active } — same shape as the
  // entries in markerDefinitions.
  /** @type {{ id: string, class: string, name?: string, active?: boolean } | null | undefined} */
  export let icon = null
  export let colorKey = MARKER_COLOR_DEFAULT
  export let mode = "original"
  export let size = 60

  /** @type {HTMLCanvasElement} */
  let canvasEl

  // Resolve the image key used in /icon-paths.json for this definition.
  /** @param {{ id: string, class: string } | null | undefined} def */
  function iconKeyFor(def) {
    if (!def) return "default"
    if (def.id === "default") return "default"
    if (def.class?.startsWith("custom-svg")) return `custom-svg-${def.id}`
    if (def.class?.startsWith("ionic-")) return `ionic-${def.id}`
    return def.class || "default"
  }

  $: colorDef = markerColor(colorKey)
  $: draw(icon, colorKey, mode, size)

  /**
   * @param {{ id: string, class: string } | null | undefined} def
   * @param {string} cKey
   * @param {string} tintMode
   * @param {number} px
   */
  async function draw(def, cKey, tintMode, px) {
    if (!canvasEl) return
    const ctx = canvasEl.getContext("2d")
    if (!ctx) return
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height)

    const base = await getIconBaseCanvas(iconKeyFor(def))
    if (!base) return

    const useTint =
      cKey !== MARKER_COLOR_DEFAULT && iconKeyFor(def) !== "default"

    if (useTint) {
      const copy = document.createElement("canvas")
      copy.width = base.width
      copy.height = base.height
      const cctx = copy.getContext("2d")
      if (cctx) cctx.drawImage(base, 0, 0)
      tintMarkerCanvas(copy, markerColor(cKey), tintMode)
      ctx.drawImage(copy, 0, 0, canvasEl.width, canvasEl.height)
    } else {
      ctx.drawImage(base, 0, 0, canvasEl.width, canvasEl.height)
    }
  }
</script>

<canvas
  bind:this={canvasEl}
  width={size}
  height={size}
  style="width:{size}px; height:{size}px;"
></canvas>
