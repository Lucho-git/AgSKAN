<!-- src/lib/components/map/toolbox/MarkerTestControls.svelte
     "Marker Test" toolbox panel: places a full grid of every active marker
     icon onto the map at once — each icon in the chosen tint style with a
     random rainbow colour — so the real on-map look can be judged against
     the actual farm background. Test markers live in markerTestStore and are
     NOT persisted (MarkerManager merges them into the marker source). -->
<script>
  import { getContext } from "svelte"
  import { Grid3x3, Trash2, Sparkles } from "lucide-svelte"
  import { toast } from "svelte-sonner"
  import { getActiveMarkers } from "$lib/data/markerDefinitions"
  import {
    MARKER_COLORS,
    MARKER_COLOR_DEFAULT,
    TINT_MODES,
    TINT_MODE_DEFAULT,
  } from "$lib/components/map/markers/markerPalette"
  import { markerTestStore } from "$lib/stores/markerTestStore"
  import { loadIconPaths } from "$lib/components/map/markers/markerTint"

  // Random grid colours come from the 7 normal colours only — black/white
  // would make low-contrast test samples.
  const TEST_GRID_COLORS = MARKER_COLORS.filter(
    (c) =>
      c.key !== MARKER_COLOR_DEFAULT &&
      c.key !== "black" &&
      c.key !== "white" &&
      c.key !== "rainbow",
  )

  // Generate a unique id without the uuid dependency (keeps this file free of
  // the pre-existing missing-@types/uuid error that the rest of the codebase has).
  function newId() {
    return typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  }

  const { getMap } = getContext("map")

  let styleMode = TINT_MODE_DEFAULT
  let placing = false

  $: testMarkerCount = $markerTestStore.length

  // Resolve the iconClass string for a marker definition.
  /**
   * @param {{id: string, class?: string}} def
   * @returns {string}
   */
  function iconClassFor(def) {
    if (def.id === "default") return "default"
    if (def.class === "custom-svg") return `custom-svg-${def.id}`
    return def.class || "default" // "ionic-…" / "at-…"
  }

  // Place a grid of every active icon around the current map centre.
  async function placeGrid() {
    if (placing) return
    const map = await getMap()
    if (!map) {
      toast.error("Map not ready yet")
      return
    }

    const icons = getActiveMarkers()
    if (icons.length === 0) {
      toast.error("No marker icons available")
      return
    }

    // Only place icons that have a registered map image (an entry in
    // /icon-paths.json). Icons without one — e.g. several atlas icons with
    // no exported PNG — never render on the map, so skip them to avoid
    // gaps in the grid.
    /** @type {Record<string, string>} */
    let iconPaths = {}
    try {
      iconPaths = await loadIconPaths()
    } catch (e) {
      console.warn("Marker Test: could not load icon-paths.json", e)
    }
    const renderableIcons = icons.filter((def) => {
      const cls = iconClassFor(def)
      return cls === "default" || !!iconPaths[cls]
    })
    if (renderableIcons.length === 0) {
      toast.error("No renderable marker icons available")
      return
    }

    placing = true
    try {
      const center = map.getCenter()
      const centerPx = map.project(center)
      // Grid layout: square-ish, ~8 per row, 70px spacing at the current zoom.
      const perRow = 8
      const spacing = 70
      const markers = renderableIcons.map((def, i) => {
        const col = i % perRow
        const row = Math.floor(i / perRow)
        const px = {
          x: centerPx.x + (col - (perRow - 1) / 2) * spacing,
          y: centerPx.y + (row - Math.ceil(renderableIcons.length / perRow) / 2 + 0.5) * spacing,
        }
        const lngLat = map.unproject(px)

        // Random rainbow colour from the normal colours (never default,
        // black or white).
        const colorDef =
          TEST_GRID_COLORS[
            Math.floor(Math.random() * TEST_GRID_COLORS.length)
          ]

        return {
          id: `test-${newId()}`,
          coordinates: [lngLat.lng, lngLat.lat],
          iconClass: iconClassFor(def),
          markerColor: colorDef?.key || MARKER_COLOR_DEFAULT,
          tintMode: styleMode,
          noteLabelVisible: true,
          testMarker: true,
          created_at: new Date().toISOString(),
        }
      })

      markerTestStore.set(markers)
      toast.success(
        `Placed ${markers.length} test markers (${styleMode}, random colours)`,
      )
    } finally {
      placing = false
    }
  }

  function clearGrid() {
    markerTestStore.clear()
    toast.success("Test markers cleared")
  }
</script>

<div class="marker-test-controls">
  <div class="mtc-header">
    <Grid3x3 size={16} />
    <span>Marker Test</span>
  </div>
  <p class="mtc-desc">
    Places every icon on the map at once in the chosen style with random
    rainbow colours — perfect for judging the real on-map look. Test markers
    are not saved.
  </p>

  <div class="mtc-row">
    <span class="mtc-label">Style</span>
    <div class="mtc-modes">
      {#each TINT_MODES as m}
        <button
          class="mtc-mode"
          class:active={styleMode === m.key}
          on:click={() => (styleMode = m.key)}
          title={m.label}
        >
          {m.label}
        </button>
      {/each}
    </div>
  </div>

  <div class="mtc-actions">
    <button
      class="mtc-btn primary"
      on:click={placeGrid}
      disabled={placing}
    >
      <Sparkles size={15} />
      <span>{placing ? "Placing…" : "Place grid"}</span>
    </button>
    <button
      class="mtc-btn danger"
      on:click={clearGrid}
      disabled={testMarkerCount === 0}
    >
      <Trash2 size={15} />
      <span>Clear ({testMarkerCount})</span>
    </button>
  </div>
</div>

<style>
  .marker-test-controls {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 4px 2px;
  }
  .mtc-header {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    font-weight: 600;
  }
  .mtc-desc {
    margin: 0;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.6);
    line-height: 1.5;
  }
  .mtc-row {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .mtc-label {
    font-size: 11px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.55);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .mtc-modes {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  .mtc-mode {
    flex: 1;
    min-width: 74px;
    padding: 7px 6px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(255, 255, 255, 0.05);
    color: #cbd5e1;
    font-size: 11px;
    line-height: 1;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
  }
  .mtc-mode:hover {
    background: rgba(255, 255, 255, 0.1);
  }
  .mtc-mode.active {
    border-color: rgba(96, 165, 250, 0.7);
    background: rgba(96, 165, 250, 0.18);
    color: #fff;
  }
  .mtc-actions {
    display: flex;
    gap: 8px;
  }
  .mtc-btn {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 9px 10px;
    border-radius: 9px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .mtc-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .mtc-btn.primary {
    background: rgba(96, 165, 250, 0.18);
    border-color: rgba(96, 165, 250, 0.5);
    color: #93c5fd;
  }
  .mtc-btn.primary:hover:not(:disabled) {
    background: rgba(96, 165, 250, 0.3);
  }
  .mtc-btn.danger {
    background: rgba(239, 68, 68, 0.14);
    border-color: rgba(239, 68, 68, 0.4);
    color: #fca5a5;
  }
  .mtc-btn.danger:hover:not(:disabled) {
    background: rgba(239, 68, 68, 0.26);
  }
</style>
