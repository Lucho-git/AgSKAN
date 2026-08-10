<!-- src/lib/components/map/markers/SiloMarkerPanel.svelte -->
<!-- Map-anchored silo editor: appears above the selected silo marker, with
     the silo symbol, grain type, and a big fill slider. -->
<script>
  import { onMount, onDestroy } from "svelte"
  import IconSVG from "$lib/components/general/IconSVG.svelte"
  import { X, Trash2, Move, Hand, Check } from "lucide-svelte"
  import { mapInteractionsSuppressed } from "$lib/stores/controlStore"
  import { mapAttentionStore } from "$lib/stores/mapAttentionStore"

  export let map
  export let marker
  export let confirmedMarkersStore
  export let updateSiloBarLive = () => {}
  export let moveSiloLive = () => {}
  export let commitSiloMove = () => {}
  export let showMoveRipple = () => {}
  export let removeMarker = () => {}
  export let deselectMarker = () => {}

  const GRAIN_TYPES = [
    "Wheat",
    "Barley",
    "Canola",
    "Oats",
    "Lupins",
    "Chickpeas",
    "Other",
  ]

  let left = -9999
  let top = -9999
  let visible = false
  let fill = 0
  let grain = "Wheat"
  let lastMarkerId = null

  // ── Move mode: drag the silo to a new location ──
  let moving = false
  let dragging = false
  let liveCoords = null
  let offscreen = false
  let attentionActive = false
  let confirmDelete = false
  let originalCoords = null
  let originX = -9999
  let originY = -9999

  // Half-size (px) of the hit square around the icon that starts a move.
  const ICON_DRAG_HALF = 26

  $: markerName = marker?.notes?.trim() || "Silo"

  // Sync local state when the marker changes (NOT while dragging — that's
  // what made the old slider stick at its stored value).
  $: {
    const id = marker?.id
    if (id !== lastMarkerId) {
      lastMarkerId = id
      fill = marker?.siloFill ?? 0
      grain = marker?.grainType || "Wheat"
      confirmDelete = false
    }
  }

  function position() {
    if (!map) return
    const coords = liveCoords || marker?.coordinates
    if (!coords) return
    try {
      const container = map.getContainer()
      const rect = container.getBoundingClientRect()
      const p = map.project(coords)
      // Centre the panel horizontally, sit its bottom just above the icon.
      left = Math.min(
        Math.max(rect.left + p.x, rect.left + 8),
        rect.left + rect.width - 8,
      )
      top = Math.max(rect.top + p.y - 44, 8)
      visible =
        p.x > -40 && p.x < rect.width + 40 && p.y > 60 && p.y < rect.height + 40
      offscreen =
        p.x < -4 || p.x > rect.width + 4 || p.y < -4 || p.y > rect.height + 4
      // Project the original position for the grey "moved from" ring.
      if (moving && originalCoords) {
        const op = map.project(originalCoords)
        originX = rect.left + op.x
        originY = rect.top + op.y
      } else {
        originX = -9999
        originY = -9999
      }
    } catch {
      visible = false
      offscreen = false
      originX = -9999
      originY = -9999
    }
    updateAttention()
  }

  // Dragging updates the map gauge live (no store write per tick).
  function handleFillInput() {
    if (marker) updateSiloBarLive(marker.id, fill)
  }

  // On release / grain change, commit to the store so the sync/realtime
  // pipeline persists it (other users see the change too).
  function commit() {
    if (!marker) return
    confirmedMarkersStore.update((markers) =>
      markers.map((m) =>
        m.id === marker.id ? { ...m, siloFill: fill, grainType: grain } : m,
      ),
    )
  }

  // ── Move mode ──
  function toggleMove() {
    if (!map) return
    moving = !moving
    dragging = false
    liveCoords = null
    confirmDelete = false
    originalCoords = moving && marker ? [...marker.coordinates] : null
    const container = map.getContainer()
    if (moving) {
      mapInteractionsSuppressed.set(true)
      // Only presses on the icon (or the panel) move the silo — everywhere
      // else keeps normal panning so you can pan around to reach a spot.
      container.addEventListener("mousedown", onCanvasDragStart, true)
      container.addEventListener("touchstart", onCanvasDragStart, {
        capture: true,
        passive: false,
      })
      window.addEventListener("mousemove", onDragMove)
      window.addEventListener("touchmove", onDragMove, { passive: false })
      window.addEventListener("mouseup", onDragEnd)
      window.addEventListener("touchend", onDragEnd)
    } else {
      mapInteractionsSuppressed.set(false)
      clearAttention()
      container.removeEventListener("mousedown", onCanvasDragStart, true)
      container.removeEventListener("touchstart", onCanvasDragStart, true)
      window.removeEventListener("mousemove", onDragMove)
      window.removeEventListener("touchmove", onDragMove)
      window.removeEventListener("mouseup", onDragEnd)
      window.removeEventListener("touchend", onDragEnd)
    }
  }

  // Press on the silo icon (within its hit square) → drag the silo. The
  // capture phase stops mapbox from starting a pan for that press.
  function onCanvasDragStart(e) {
    if (!marker || !isWithinIconArea(e)) return
    e.preventDefault()
    e.stopPropagation()
    dragging = true
  }

  // Press on the panel (non-interactive area) also starts a move.
  function onPanelDragStart(e) {
    if (!moving) return
    if (e.target.closest("button, select, input, label")) return
    e.preventDefault()
    dragging = true
  }

  function isWithinIconArea(e) {
    if (!map || !marker?.coordinates) return false
    const rect = map.getContainer().getBoundingClientRect()
    const p = map.project(marker.coordinates)
    const clientX = e.touches?.[0]?.clientX ?? e.clientX
    const clientY = e.touches?.[0]?.clientY ?? e.clientY
    if (clientX == null || clientY == null) return false
    return (
      Math.abs(clientX - rect.left - p.x) <= ICON_DRAG_HALF &&
      Math.abs(clientY - rect.top - p.y) <= ICON_DRAG_HALF
    )
  }

  // Edge indicator: when the silo is dragged off-screen during move mode,
  // register an attention badge so the user is called back to it.
  function updateAttention() {
    if (moving && marker && offscreen) {
      mapAttentionStore.add({
        id: `silo-move-${marker.id}`,
        coordinates: liveCoords || marker.coordinates,
        icon: Move,
        color: "#f59e0b",
        label: markerName,
      })
      attentionActive = true
    } else if (attentionActive) {
      mapAttentionStore.remove(`silo-move-${marker?.id}`)
      attentionActive = false
    }
  }

  function clearAttention() {
    if (attentionActive) {
      mapAttentionStore.remove(`silo-move-${marker?.id}`)
      attentionActive = false
    }
  }

  function onDragMove(e) {
    if (!dragging || !marker) return
    const container = map.getContainer()
    const rect = container.getBoundingClientRect()
    const clientX = e.touches?.[0]?.clientX ?? e.clientX
    const clientY = e.touches?.[0]?.clientY ?? e.clientY
    if (clientX == null || clientY == null) return
    const ll = map.unproject([clientX - rect.left, clientY - rect.top])
    liveCoords = [ll.lng, ll.lat]
    moveSiloLive(marker.id, liveCoords)
    position()
  }

  function onDragEnd() {
    if (!dragging) return
    dragging = false
    // Stay in move mode — the silo stays where it's been dragged until the
    // user clicks Place. Only then do we commit + exit.
  }

  // Place the silo: commit its position, show a "moved" ripple, and close.
  function placeSilo() {
    if (!marker) return
    if (liveCoords) {
      commitSiloMove(marker.id, liveCoords)
      showMoveRipple(liveCoords, markerName)
    }
    toggleMove() // exit move mode (re-enables pan, removes listeners)
    deselectMarker() // close the menu/panel too
  }

  // Close the panel. In move mode the top-right X IS the cancel button — it
  // snaps the silo back to where it came from, then closes (nothing was
  // committed to the store, so the revert is instant).
  function handleClose() {
    if (moving) {
      if (marker && originalCoords) {
        moveSiloLive(marker.id, originalCoords)
      }
      liveCoords = null
      toggleMove() // exit move mode (clears origin ring + attention + listeners)
    }
    deselectMarker()
  }

  // Has the silo been dragged out of the origin ring? When it has, darken
  // the ring's interior so the "moved from" spot stands out.
  $: movedFromOrigin = (() => {
    if (!moving || !originalCoords || !liveCoords || !map) return false
    try {
      const p = map.project(originalCoords)
      const q = map.project(liveCoords)
      return Math.hypot(q.x - p.x, q.y - p.y) > 22
    } catch {
      return false
    }
  })()

  onMount(() => {
    position()
    if (!map) return
    map.on("move", position)
    map.on("zoom", position)
    map.on("rotate", position)
    map.on("pitch", position)
    map.on("resize", position)
  })

  onDestroy(() => {
    clearAttention()
    if (!map) return
    map.off("move", position)
    map.off("zoom", position)
    map.off("rotate", position)
    map.off("pitch", position)
    map.off("resize", position)
    if (moving) {
      mapInteractionsSuppressed.set(false)
      const container = map.getContainer?.()
      container?.removeEventListener("mousedown", onCanvasDragStart, true)
      container?.removeEventListener("touchstart", onCanvasDragStart, true)
      window.removeEventListener("mousemove", onDragMove)
      window.removeEventListener("touchmove", onDragMove)
      window.removeEventListener("mouseup", onDragEnd)
      window.removeEventListener("touchend", onDragEnd)
    }
  })

  // Reposition when a different marker is selected.
  $: if (marker) position()
</script>

{#if visible && marker}
  <div
    class="silo-pop"
    class:moving={moving}
    on:mousedown={onPanelDragStart}
    on:touchstart={onPanelDragStart}
    style="left:{left}px; top:{top}px;"
  >
    <div class="silo-pop-head">
      <div class="silo-pop-icon">
        <IconSVG icon="silo2" size="26px" />
      </div>
      <span class="silo-pop-title" title={markerName}>{markerName}</span>
      <button
        class="silo-pop-close"
        on:click={handleClose}
        aria-label="Close silo panel"
      >
        <X size={16} />
      </button>
    </div>

    {#if moving}
      <div class="silo-pop-move-body">
        <div class="silo-pop-hint">
          <Hand size={16} />
          <span>Click and drag to move</span>
        </div>
      </div>
      <button class="silo-pop-place" on:click={placeSilo}>
        <Check size={16} />
        <span>Place</span>
      </button>
    {:else}
      <label class="silo-pop-field">
        <span class="silo-pop-label">Grain type</span>
        <select bind:value={grain} on:change={commit}>
          {#each GRAIN_TYPES as g (g)}
            <option value={g}>{g}</option>
          {/each}
        </select>
      </label>

      <div class="silo-pop-field">
        <span class="silo-pop-label">Fill level</span>
        <div class="silo-pop-slider">
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            bind:value={fill}
            on:input={handleFillInput}
            on:change={commit}
            aria-label="Silo fill level"
            style="background: linear-gradient(to right, #f59e0b 0%, #f59e0b {fill}%, rgba(255,255,255,0.14) {fill}%);"
          />
          <span class="silo-pop-pct">{Math.round(fill)}%</span>
        </div>
      </div>

      {#if confirmDelete}
        <div class="silo-pop-confirm">
          <span class="silo-pop-confirm-text">Delete this silo?</span>
          <div class="silo-pop-confirm-actions">
            <button
              class="silo-pop-confirm-yes"
              on:click={() => {
                confirmDelete = false
                removeMarker()
              }}
            >
              Delete
            </button>
            <button
              class="silo-pop-confirm-no"
              on:click={() => (confirmDelete = false)}
            >
              Cancel
            </button>
          </div>
        </div>
      {:else}
        <div class="silo-pop-actions">
          <button
            class="silo-pop-move"
            on:click={toggleMove}
            aria-label="Move silo"
          >
            <Move size={15} />
            <span>Move</span>
          </button>
          <button
            class="silo-pop-delete"
            on:click={() => (confirmDelete = true)}
            aria-label="Delete silo"
          >
            <Trash2 size={15} />
          </button>
        </div>
      {/if}
    {/if}

    </div>
{/if}

{#if moving && originalCoords}
  <div
    class="silo-origin"
    class:moved={movedFromOrigin}
    style="left:{originX}px; top:{originY}px;"
    aria-hidden="true"
  ></div>
{/if}

<style>
  .silo-pop {
    position: fixed;
    transform: translate(-50%, -100%);
    width: 256px;
    min-height: 232px;
    z-index: 1001;
    background: rgba(8, 12, 24, 0.97);
    backdrop-filter: blur(14px);
    border: 1px solid rgba(245, 158, 11, 0.4);
    border-radius: 14px;
    padding: 12px 14px 18px;
    box-shadow: 0 14px 36px rgba(0, 0, 0, 0.6);
    display: flex;
    flex-direction: column;
    gap: 10px;
    color: rgba(255, 255, 255, 0.92);
  }
  .silo-pop-head {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .silo-pop-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 8px;
    background: rgba(245, 158, 11, 0.14);
  }
  .silo-pop-title {
    flex: 1;
    min-width: 0;
    font-size: 14px;
    font-weight: 800;
    color: #fbbf24;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .silo-pop-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 7px;
    border: none;
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.7);
    cursor: pointer;
  }
  .silo-pop-close:hover {
    background: rgba(255, 255, 255, 0.16);
    color: #fff;
  }
  .silo-pop-field {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .silo-pop-label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: rgba(255, 255, 255, 0.55);
  }
  .silo-pop-field select {
    width: 100%;
    padding: 9px 10px;
    border-radius: 9px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(255, 255, 255, 0.07);
    color: #fff;
    font-size: 13px;
    font-weight: 600;
  }
  .silo-pop-field select option {
    background: #0f172a;
    color: #fff;
  }
  .silo-pop-slider {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .silo-pop-slider input[type="range"] {
    flex: 1;
    -webkit-appearance: none;
    appearance: none;
    height: 14px;
    border-radius: 7px;
    outline: none;
    border: 1px solid rgba(255, 255, 255, 0.12);
    cursor: pointer;
  }
  .silo-pop-slider input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: #fbbf24;
    border: 3px solid #fff7ed;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
    cursor: grab;
  }
  .silo-pop-slider input[type="range"]::-moz-range-thumb {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: #fbbf24;
    border: 3px solid #fff7ed;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
    cursor: grab;
  }
  .silo-pop-pct {
    font-size: 16px;
    font-weight: 800;
    color: #fbbf24;
    min-width: 44px;
    text-align: right;
  }
  .silo-pop-move-body {
    flex: 1;
    min-height: 0;
    display: flex;
  }
  .silo-pop-hint {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border: 1px dashed rgba(245, 158, 11, 0.5);
    background: rgba(245, 158, 11, 0.08);
    border-radius: 10px;
    color: #fbbf24;
    font-size: 12px;
    font-weight: 700;
  }
  .silo-pop.moving {
    border-style: dashed;
    border-width: 2px;
    border-color: rgba(245, 158, 11, 0.9);
    cursor: grab;
    user-select: none;
  }
  .silo-pop.moving:active {
    cursor: grabbing;
  }
  .silo-pop-place {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 11px;
    border-radius: 9px;
    border: none;
    background: #fbbf24;
    color: #0f172a;
    font-size: 14px;
    font-weight: 800;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .silo-pop-place:hover {
    background: #fcd34d;
  }
  .silo-origin {
    position: fixed;
    transform: translate(-50%, -50%);
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: 2px dashed rgba(255, 255, 255, 0.55);
    background: rgba(255, 255, 255, 0.08);
    pointer-events: none;
    z-index: 1001;
    transition: background 0.2s ease, border-color 0.2s ease;
  }
  .silo-origin.moved {
    background: rgba(0, 0, 0, 0.55);
    border-color: rgba(255, 255, 255, 0.75);
    box-shadow: inset 0 0 0 2px rgba(0, 0, 0, 0.35),
      0 0 0 5px rgba(0, 0, 0, 0.18);
  }
  .silo-pop-confirm {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    border-radius: 9px;
    border: 1px solid rgba(239, 68, 68, 0.4);
    background: rgba(239, 68, 68, 0.1);
  }
  .silo-pop-confirm-text {
    font-size: 12px;
    font-weight: 700;
    color: #fecaca;
    text-align: center;
  }
  .silo-pop-confirm-actions {
    display: flex;
    gap: 8px;
  }
  .silo-pop-confirm-yes {
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
  .silo-pop-confirm-yes:hover {
    background: #dc2626;
  }
  .silo-pop-confirm-no {
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
  .silo-pop-confirm-no:hover {
    background: rgba(255, 255, 255, 0.14);
  }
  .silo-pop-actions {
    display: flex;
    align-items: stretch;
    gap: 8px;
  }
  .silo-pop-move {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 10px;
    border-radius: 9px;
    border: 1px solid rgba(245, 158, 11, 0.35);
    background: rgba(245, 158, 11, 0.14);
    color: #fbbf24;
    font-size: 13px;
    font-weight: 800;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .silo-pop-move:hover {
    background: rgba(245, 158, 11, 0.24);
  }
  .silo-pop-move.active {
    background: #fbbf24;
    border-color: #fbbf24;
    color: #0f172a;
  }
  .silo-pop-delete {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 42px;
    flex-shrink: 0;
    border-radius: 9px;
    border: 1px solid rgba(239, 68, 68, 0.35);
    background: rgba(239, 68, 68, 0.12);
    color: #fca5a5;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .silo-pop-delete:hover {
    background: rgba(239, 68, 68, 0.22);
    color: #fecaca;
  }
  .silo-pop-tip {
    position: absolute;
    bottom: -8px;
    left: 50%;
    transform: translateX(-50%);
    width: 0;
    height: 0;
    border-left: 8px solid transparent;
    border-right: 8px solid transparent;
    border-top: 8px solid rgba(245, 158, 11, 0.4);
  }
</style>
