<!-- src/lib/components/map/markers/SiloMarkerPanel.svelte -->
<!-- Map-anchored silo editor: appears above the selected silo marker, with
     the silo symbol, a free-text "what's stored" field, and a fill slider. -->
<script>
  import { onMount, onDestroy } from "svelte"
  import IconSVG from "$lib/components/general/IconSVG.svelte"
  import { X, Trash2, Move, Hand, Check, Plus, Minus } from "lucide-svelte"
  import {
    SILO_GRAIN_COLORS,
    SILO_GRAIN_DEFAULT,
    siloGrainColor,
  } from "./siloPalette"
  import { mapInteractionsSuppressed } from "$lib/stores/controlStore"
  import { mapAttentionStore } from "$lib/stores/mapAttentionStore"
  import { userSettingsStore } from "$lib/stores/userSettingsStore"
  import { userSettingsApi } from "$lib/api/userSettingsApi"

  export let map
  export let marker
  export let confirmedMarkersStore
  export let updateSiloBarLive = () => {}
  export let moveSiloLive = () => {}
  export let commitSiloMove = () => {}
  export let showMoveRipple = () => {}
  export let removeMarker = () => {}
  export let deselectMarker = () => {}

  let left = -9999
  let top = -9999
  let visible = false
  let fill = 0
  let contents = ""
  let capacityTonnes = 0 // bin size in tonnes (0 = not set)
  let capacityInput = "" // text for the bin-size number field
  let tonnesDelta = "" // text for the add/take number field
  let grainColor = SILO_GRAIN_DEFAULT // tint for the on-map fill gauge
  let tab = "fill" // 'fill' | 'settings'
  // Transient "enter a value first" hint when Add/Take is clicked empty.
  let deltaHint = false
  let deltaHintTimer = null
  let lastMarkerId = null

  $: grainColorDef = siloGrainColor(grainColor)
  // Per-user "show bins always" — offscreen tracking circles for every bin.
  $: showBinsAlways = $userSettingsStore?.showBinsAlways ?? false

  // Toggle the per-user show-bins-always setting (persisted to the DB).
  async function toggleShowBinsAlways() {
    const next = !showBinsAlways
    userSettingsStore.update((s) => ({ ...s, showBinsAlways: next }))
    try {
      const result = await userSettingsApi.updateShowBinsAlways(next)
      if (!result?.success) {
        userSettingsStore.update((s) => ({ ...s, showBinsAlways: !next }))
      }
    } catch {
      userSettingsStore.update((s) => ({ ...s, showBinsAlways: !next }))
    }
  }
  // True while the panel opens upward; flips to downward near the top of the
  // screen so the whole panel stays on screen in every state.
  let openUp = true
  let siloPopEl = null

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
  // Smooth lerp follow: the silo eases toward the cursor's position each
  // frame so it glides (snap-to-cursor without the jarring teleport).
  const LERP_FACTOR = 0.35
  let dragTargetX = null
  let dragTargetY = null
  let dragRafId = null
  let lastDragFrame = 0

  $: markerName = marker?.notes?.trim() || "Silo"
  $: currentTonnes = capacityTonnes > 0 ? (capacityTonnes * fill) / 100 : 0

  // Sync local state when the marker changes (NOT while dragging — that's
  // what made the old slider stick at its stored value).
  $: {
    const id = marker?.id
    if (id !== lastMarkerId) {
      lastMarkerId = id
      fill = marker?.siloFill ?? 0
      contents = marker?.grainType || ""
      capacityTonnes = marker?.capacityTonnes ?? 0
      capacityInput = capacityTonnes ? String(capacityTonnes) : ""
      tonnesDelta = ""
      grainColor = marker?.grainColor || SILO_GRAIN_DEFAULT
      tab = "fill"
      deltaHint = false
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

      // Menu box dimensions (matches .silo-pop; measured once rendered).
      const menuW = 256
      const menuH = siloPopEl?.offsetHeight || 264

      // Keep the on/off-screen tests on the raw marker point.
      visible =
        p.x > -40 && p.x < rect.width + 40 && p.y > 60 && p.y < rect.height + 40
      offscreen =
        p.x < -4 || p.x > rect.width + 4 || p.y < -4 || p.y > rect.height + 4

      // While moving: no flip, no clamp — the panel tracks the silo freely
      // (even off-screen) so you can see exactly where it sits relative to the
      // viewport edges and pick the spot to lock in. Keep whichever
      // orientation it opened with so the silo sits just OUTSIDE the panel's
      // near edge: below an up panel, above a down panel.
      if (moving) {
        left = rect.left + p.x
        top = rect.top + (openUp ? p.y - 44 : p.y + 44)
      } else {
        // Vertically: open upward (panel sits above the silo) by default, but
        // flip to open downward when there isn't enough room above, so the
        // whole panel stays on screen.
        openUp = p.y - 44 - menuH >= 8
        let anchorY = openUp ? p.y - 44 : p.y + 44
        if (openUp) {
          anchorY = Math.max(anchorY, menuH + 8)
          anchorY = Math.min(anchorY, rect.height - 8)
        } else {
          anchorY = Math.max(anchorY, 8)
          anchorY = Math.min(anchorY, rect.height - menuH - 8)
        }
        // Horizontally: keep the panel centered on the silo, but shift it so
        // the panel never leaves the screen edges.
        let px = Math.min(
          Math.max(p.x, menuW / 2 + 8),
          rect.width - menuW / 2 - 8,
        )

        left = rect.left + px
        top = rect.top + anchorY
      }
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
    if (marker) updateSiloBarLive(marker.id, fill, grainColor)
  }

  // On release / contents change, commit to the store so the sync/realtime
  // pipeline persists it (other users see the change too).
  function commit() {
    if (!marker) return
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
  // grain.
  function commitCapacity() {
    if (!marker) return
    const parsed = Math.max(0, Math.round(Number(capacityInput) || 0))
    const prevCap = capacityTonnes
    const prevTonnes = prevCap > 0 ? (prevCap * fill) / 100 : 0
    capacityTonnes = parsed
    capacityInput = parsed ? String(parsed) : ""
    if (parsed > 0 && prevCap > 0) {
      fill = Math.min(100, Math.max(0, Math.round((prevTonnes / parsed) * 100)))
      updateSiloBarLive(marker.id, fill, grainColor)
    }
    commit()
  }

  // Pick a grain colour for the on-map fill gauge.
  function setGrainColor(key) {
    grainColor = key
    if (marker) updateSiloBarLive(marker.id, fill, key)
    commit()
  }

  // Add (dir = 1) or take (dir = -1) the entered tonnes. Clamps to 0..capacity.
  function applyTonnesDelta(dir) {
    if (!marker || capacityTonnes <= 0) return
    const delta = Math.round(Number(tonnesDelta) || 0)
    if (delta <= 0) {
      // Nothing entered — prompt the user instead of silently doing nothing.
      deltaHint = true
      clearTimeout(deltaHintTimer)
      deltaHintTimer = setTimeout(() => (deltaHint = false), 1800)
      return
    }
    const current = (capacityTonnes * fill) / 100
    const next = Math.max(0, Math.min(capacityTonnes, current + dir * delta))
    // Keep fill as a precise float — rounding to an integer % quantizes the
    // tonnes (e.g. +1t on a 300t bin is 0.33%, which rounded down to nothing;
    // +2t rounded up to 1% = 3t). The readout rounds only for display.
    fill = (next / capacityTonnes) * 100
    updateSiloBarLive(marker.id, fill, grainColor)
    commit()
    tonnesDelta = ""
  }

  // ── Move mode ──
  function toggleMove() {
    if (!map) return
    moving = !moving
    dragging = false
    liveCoords = null
    dragTargetX = null
    dragTargetY = null
    if (dragRafId != null) {
      cancelAnimationFrame(dragRafId)
      dragRafId = null
    }
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
    // Target = the cursor's position (screen px); the rAF loop eases the silo
    // toward it so it glides instead of teleporting.
    dragTargetX = clientX - rect.left
    dragTargetY = clientY - rect.top
    startDragLoop()
  }

  // Frame-rate-independent exponential ease toward the drag target.
  function startDragLoop() {
    if (dragRafId != null) return
    lastDragFrame = performance.now()
    const tick = (now) => {
      dragRafId = null
      if (
        !dragging ||
        !map ||
        !marker ||
        dragTargetX == null ||
        dragTargetY == null
      ) {
        return
      }
      const dt = Math.min(50, now - lastDragFrame)
      lastDragFrame = now
      const alpha = 1 - Math.pow(1 - LERP_FACTOR, dt / 16.7)
      const from = liveCoords || marker.coordinates
      const cur = map.project(from)
      const nx = cur.x + (dragTargetX - cur.x) * alpha
      const ny = cur.y + (dragTargetY - cur.y) * alpha
      const settled = Math.hypot(dragTargetX - nx, dragTargetY - ny) < 0.5
      const ll = map.unproject(settled ? [dragTargetX, dragTargetY] : [nx, ny])
      liveCoords = [ll.lng, ll.lat]
      moveSiloLive(marker.id, liveCoords)
      position()
      if (!settled) dragRafId = requestAnimationFrame(tick)
    }
    dragRafId = requestAnimationFrame(tick)
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
    if (dragRafId != null) {
      cancelAnimationFrame(dragRafId)
      dragRafId = null
    }
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
    class:down={!openUp}
    on:mousedown={onPanelDragStart}
    on:touchstart={onPanelDragStart}
    style="left:{left}px; top:{top}px;"
    bind:this={siloPopEl}
  >
    <div class="silo-pop-head">
      <div
        class="silo-pop-icon"
        style="background: {grainColorDef.dark}26;"
      >
        <IconSVG icon="silo2" size="26px" />
      </div>
      <span class="silo-pop-title" title={markerName}>{markerName}</span>
      <span
        class="silo-pop-color-name"
        style="color: {grainColorDef.dark}; border-color: {grainColorDef.dark}66; background: {grainColorDef.dark}1a;"
        title={`Bin colour: ${grainColorDef.label}`}
      >
        {grainColorDef.label}
      </span>
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
      <div class="silo-pop-tabs">
        <button
          class="silo-pop-tab"
          class:active={tab === "fill"}
          on:click={() => (tab = "fill")}
        >
          Fill
        </button>
        <button
          class="silo-pop-tab"
          class:active={tab === "settings"}
          on:click={() => (tab = "settings")}
        >
          Settings
        </button>
      </div>

      {#if tab === "fill"}
        <div class="silo-pop-field">
          <span class="silo-pop-label">Fill level</span>
          <div class="silo-pop-slider">
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              bind:value={fill}
              on:input={handleFillInput}
              on:change={commit}
              aria-label="Silo fill level"
              style="background: linear-gradient(to right, {grainColorDef.dark} 0%, {grainColorDef.dark} {fill}%, rgba(255,255,255,0.14) {fill}%);"
            />
            <span class="silo-pop-pct">{Math.round(fill)}%</span>
          </div>
          {#if capacityTonnes > 0}
            <span class="silo-pop-tonnes">
              {currentTonnes.toFixed(1)} / {capacityTonnes} t
            </span>
          {/if}
        </div>

        <div class="silo-pop-field">
          <span class="silo-pop-label">Add / take (t)</span>
          <div class="silo-pop-delta">
            <input
              type="number"
              min="0"
              step="1"
              bind:value={tonnesDelta}
              placeholder="t"
              disabled={capacityTonnes <= 0}
              on:keydown={(e) => {
                if (e.key === "Enter") {
                  applyTonnesDelta(1)
                }
              }}
            />
            <button
              class="silo-pop-delta-btn add"
              disabled={capacityTonnes <= 0}
              title="Enter tonnes to add"
              on:click={() => applyTonnesDelta(1)}
              aria-label="Add tonnes"
            >
              <Plus size={14} />
              <span>Add</span>
            </button>
            <button
              class="silo-pop-delta-btn take"
              disabled={capacityTonnes <= 0}
              title="Enter tonnes to take"
              on:click={() => applyTonnesDelta(-1)}
              aria-label="Take tonnes"
            >
              <Minus size={14} />
              <span>Take</span>
            </button>
          </div>
          {#if capacityTonnes <= 0}
            <span class="silo-pop-note">Set a bin size to use tonnes</span>
          {:else if deltaHint}
            <span class="silo-pop-delta-hint">Enter a value first</span>
          {/if}
        </div>

        <button
          class="silo-pop-move"
          on:click={toggleMove}
          aria-label="Move silo"
        >
          <Move size={15} />
          <span>Move</span>
        </button>
      {:else}
        <label class="silo-pop-field">
          <span class="silo-pop-label">Storing</span>
          <input
            type="text"
            bind:value={contents}
            placeholder="e.g. Wheat, canola, fuel…"
            maxlength="40"
            on:change={commit}
            on:keydown={(e) => {
              if (e.key === "Enter") {
                e.target.blur()
              }
            }}
          />
        </label>

        <label class="silo-pop-field">
          <span class="silo-pop-label">Bin size (t)</span>
          <input
            type="number"
            min="0"
            step="1"
            bind:value={capacityInput}
            placeholder="e.g. 200"
            on:change={commitCapacity}
            on:keydown={(e) => {
              if (e.key === "Enter") {
                e.target.blur()
              }
            }}
          />
        </label>

        <div class="silo-pop-field">
          <span class="silo-pop-label">Color</span>
          <div class="silo-pop-swatches">
            {#each SILO_GRAIN_COLORS as c}
              <button
                class="silo-pop-swatch"
                class:active={grainColor === c.key}
                style="background: {c.dark};"
                title={c.label}
                aria-label={c.label}
                on:click={() => setGrainColor(c.key)}
              ></button>
            {/each}
          </div>
        </div>

        <label class="silo-pop-field silo-pop-toggle-row">
          <span class="silo-pop-toggle-text">
            <span class="silo-pop-label">Show bins always</span>
            <span class="silo-pop-note">
              Track off-screen bins at the map edge
            </span>
          </span>
          <input
            type="checkbox"
            class="silo-pop-toggle-input"
            checked={showBinsAlways}
            on:change={toggleShowBinsAlways}
          />
          <span class="silo-pop-toggle-track"
            ><span class="silo-pop-toggle-thumb"></span
          ></span>
        </label>

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
          <button
            class="silo-pop-delete"
            on:click={() => (confirmDelete = true)}
            aria-label="Delete silo"
          >
            <Trash2 size={15} />
            <span>Delete silo</span>
          </button>
        {/if}
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
    --pop-y: -100%;
    position: fixed;
    transform: translate(-50%, var(--pop-y));
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
  /* Near the top of the screen the panel flips to open downward. */
  .silo-pop.down {
    --pop-y: 0%;
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
  .silo-pop-color-name {
    flex-shrink: 0;
    font-size: 9.5px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 2px 7px;
    border-radius: 999px;
    border: 1px solid;
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
  .silo-pop-field input[type="text"],
  .silo-pop-field input[type="number"] {
    width: 100%;
    padding: 9px 10px;
    border-radius: 9px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(255, 255, 255, 0.07);
    color: #fff;
    font-size: 13px;
    font-weight: 600;
    outline: none;
  }
  .silo-pop-field input[type="text"]::placeholder,
  .silo-pop-field input[type="number"]::placeholder {
    color: rgba(255, 255, 255, 0.35);
    font-weight: 500;
  }
  .silo-pop-field input[type="text"]:focus,
  .silo-pop-field input[type="number"]:focus {
    border-color: rgba(245, 158, 11, 0.7);
  }
  .silo-pop-field input[type="number"]::-webkit-inner-spin-button,
  .silo-pop-field input[type="number"]::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  .silo-pop-field input[type="number"] {
    -moz-appearance: textfield;
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
  .silo-pop-tonnes {
    font-size: 11px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.55);
  }
  .silo-pop-delta {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .silo-pop-delta input[type="number"] {
    flex: 1;
    min-width: 0;
  }
  .silo-pop-delta-btn {
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
  .silo-pop-delta-btn.add {
    border-color: rgba(34, 197, 94, 0.45);
    background: rgba(34, 197, 94, 0.14);
    color: #86efac;
  }
  .silo-pop-delta-btn.add:hover:not(:disabled) {
    background: rgba(34, 197, 94, 0.28);
  }
  .silo-pop-delta-btn.take {
    border-color: rgba(239, 68, 68, 0.45);
    background: rgba(239, 68, 68, 0.14);
    color: #fca5a5;
  }
  .silo-pop-delta-btn.take:hover:not(:disabled) {
    background: rgba(239, 68, 68, 0.28);
  }
  .silo-pop-delta-btn:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .silo-pop-note {
    font-size: 10.5px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.4);
    font-style: italic;
  }
  .silo-pop-delta-hint {
    font-size: 10.5px;
    font-weight: 700;
    color: #fbbf24;
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
  .silo-pop-tabs {
    display: flex;
    gap: 4px;
    padding: 3px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.06);
  }
  .silo-pop-tab {
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
  .silo-pop-tab:hover {
    color: #fbbf24;
  }
  .silo-pop-tab.active {
    background: rgba(245, 158, 11, 0.25);
    color: #fbbf24;
  }
  .silo-pop-move {
    width: 100%;
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
  .silo-pop-swatches {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .silo-pop-swatch {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 2px solid rgba(255, 255, 255, 0.2);
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .silo-pop-swatch:hover {
    transform: scale(1.12);
  }
  .silo-pop-swatch.active {
    border-color: #fff;
    box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.6);
  }
  .silo-pop-toggle-row {
    flex-direction: row;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  }
  .silo-pop-toggle-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .silo-pop-toggle-input {
    display: none;
  }
  .silo-pop-toggle-track {
    flex-shrink: 0;
    position: relative;
    width: 36px;
    height: 20px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.16);
    transition: background 0.2s ease;
  }
  .silo-pop-toggle-thumb {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.75);
    transition: transform 0.2s ease;
  }
  .silo-pop-toggle-input:checked + .silo-pop-toggle-track {
    background: #fbbf24;
  }
  .silo-pop-toggle-input:checked + .silo-pop-toggle-track
    .silo-pop-toggle-thumb {
    transform: translateX(16px);
    background: #fff7ed;
  }
  .silo-pop-delete {
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
