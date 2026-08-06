<!-- src/lib/components/map/toolbox/KmzOverlayControls.svelte -->
<script>
  import { onMount } from "svelte"
  import {
    CloudUpload,
    Eye,
    EyeOff,
    Trash2,
    Loader2,
    FileUp,
    ChevronDown,
    ChevronRight,
    Paintbrush,
    X,
    RotateCcw,
    Check,
  } from "lucide-svelte"
  import { toast } from "svelte-sonner"
  import { kmzOverlayApi, fileToGeoJSON } from "$lib/api/kmzOverlayApi"
  import { kmzOverlaysStore } from "$lib/stores/kmzOverlaysStore"
  import RoadIcon from "$lib/components/general/RoadIcon.svelte"

  const ACCEPTED = [".kmz", ".kml", ".geojson", ".json"]

  // Curated palette — no full colour picker
  const COLOR_PRESETS = [
    { name: "Amber", value: "#fbbf24" },
    { name: "Red", value: "#ef4444" },
    { name: "Orange", value: "#f97316" },
    { name: "Yellow", value: "#eab308" },
    { name: "Green", value: "#22c55e" },
    { name: "Cyan", value: "#06b6d4" },
    { name: "Blue", value: "#3b82f6" },
    { name: "Purple", value: "#a855f7" },
    { name: "Pink", value: "#ec4899" },
    { name: "White", value: "#ffffff" },
    { name: "Grey", value: "#9ca3af" },
    { name: "Black", value: "#111827" },
  ]

  // Preset line thicknesses (px)
  const SIZE_PRESETS = [
    { label: "2px", value: 2 },
    { label: "4px", value: 4 },
    { label: "6px", value: 6 },
    { label: "8px", value: 8 },
  ]

  let fileInput
  let selectedFile = null
  let preview = null // { features, lines, polys, points } after local parse
  let uploading = false
  let loadingList = false
  let expandedOverlayId = null

  $: overlays = $kmzOverlaysStore.overlays || []
  $: hiddenIds = $kmzOverlaysStore.hiddenIds || new Set()
  $: selectedOverlayId = $kmzOverlaysStore.selectedOverlayId
  $: selectedRoadIndex = $kmzOverlaysStore.selectedRoadIndex

  // The overlay currently being edited (the expanded card)
  $: editingOverlay = overlays.find((o) => o.id === expandedOverlayId) || null

  // Selected road (only counts if it belongs to the overlay being edited)
  $: selectedFeature = (() => {
    if (!editingOverlay || typeof selectedRoadIndex !== "number") return null
    if (selectedOverlayId !== editingOverlay.id) return null
    return editingOverlay.geojson?.features?.[selectedRoadIndex] || null
  })()

  // Editing target: the selected road if one is picked, otherwise the cluster
  // defaults. Changing settings applies to that target only.
  $: hasSelection = !!selectedFeature
  $: editingName =
    selectedFeature?.properties?.name ||
    (selectedFeature ? `Road ${selectedRoadIndex + 1}` : "")

  // Values shown in the editor
  $: displayColor = hasSelection
    ? resolvedColor(editingOverlay, selectedRoadIndex)
    : defaultColor(editingOverlay)
  $: displayWidth = hasSelection
    ? resolvedWidth(editingOverlay, selectedRoadIndex)
    : defaultWidth(editingOverlay)
  $: displayDashed = hasSelection
    ? resolvedDashed(editingOverlay, selectedRoadIndex)
    : defaultDashed(editingOverlay)

  // ── Resolution helpers (mirror the renderer's enrich logic) ──────────
  function defaultColor(overlay) {
    return overlay?.style?.color || "#fbbf24"
  }
  function defaultDashed(overlay) {
    return overlay?.style?.dashed === true
  }
  function defaultWidth(overlay) {
    return overlay?.style?.width || 2
  }
  function resolvedColor(overlay, index) {
    const p = overlay?.geojson?.features?.[index]?.properties
    return p?.color || defaultColor(overlay)
  }
  function resolvedDashed(overlay, index) {
    const p = overlay?.geojson?.features?.[index]?.properties
    if (p && (p.dashed === true || p.dashed === false)) return p.dashed
    return defaultDashed(overlay)
  }
  function resolvedWidth(overlay, index) {
    const p = overlay?.geojson?.features?.[index]?.properties
    if (p && typeof p.width === "number") return p.width
    return defaultWidth(overlay)
  }
  function roadName(overlay, index) {
    return overlay.geojson?.features?.[index]?.properties?.name || `Road ${index + 1}`
  }
  function previewStyle(color, dashed, width) {
    const height = Math.min(2 + width, 11)
    if (dashed) {
      return `width:26px; height:${height}px; background-color:transparent; background-image:repeating-linear-gradient(90deg, ${color} 0 4px, transparent 4px 8px);`
    }
    return `width:26px; height:${height}px; background-color:${color};`
  }

  // ── Upload ───────────────────────────────────────────────────────────
  function countGeometryTypes(features) {
    return (features || []).reduce(
      (acc, f) => {
        const t = f?.geometry?.type
        if (t === "LineString" || t === "MultiLineString") acc.lines++
        else if (t === "Polygon" || t === "MultiPolygon") acc.polys++
        else if (t === "Point" || t === "MultiPoint") acc.points++
        return acc
      },
      { lines: 0, polys: 0, points: 0 },
    )
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0]
    if (!file) return
    selectedFile = null
    preview = null

    const ext = `.${file.name.split(".").pop()?.toLowerCase()}`
    if (!ACCEPTED.includes(ext)) {
      toast.error(`Please select a .kmz, .kml, or .geojson file`)
      return
    }

    selectedFile = file

    try {
      const geojson = await fileToGeoJSON(file)
      preview = {
        features: geojson.features?.length || 0,
        ...countGeometryTypes(geojson.features),
      }
      toast.success(
        `Parsed ${preview.features} feature${preview.features !== 1 ? "s" : ""}`,
      )
    } catch (err) {
      console.error("KMZ preview parse error:", err)
      preview = null
      toast.error(`Could not parse file: ${err.message}`)
    }
  }

  function triggerFilePick() {
    fileInput?.click()
  }

  function clearUpload() {
    selectedFile = null
    preview = null
    if (fileInput) fileInput.value = ""
  }

  async function handleUpload() {
    if (!selectedFile || uploading) return

    uploading = true
    try {
      const result = await kmzOverlayApi.uploadOverlay(selectedFile)
      if (result.success) {
        toast.success(`Added overlay "${result.overlay.name}"`)
        if (result.overlay) kmzOverlaysStore.addOverlay(result.overlay)
        expandedOverlayId = result.overlay?.id || expandedOverlayId
        clearUpload()
      } else {
        toast.error(result.message || "Failed to add overlay")
      }
    } catch (err) {
      toast.error(err.message || "Failed to add overlay")
    } finally {
      uploading = false
    }
  }

  async function loadOverlays() {
    loadingList = true
    try {
      const result = await kmzOverlayApi.loadOverlays()
      if (result.success) {
        kmzOverlaysStore.setOverlays(result.overlays)
      }
    } finally {
      loadingList = false
    }
  }

  // ── Overlay CRUD ─────────────────────────────────────────────────────
  function toggleExpanded(overlayId) {
    expandedOverlayId = expandedOverlayId === overlayId ? null : overlayId
  }

  function toggleOverlay(overlay) {
    kmzOverlaysStore.toggleVisibility(overlay.id)
  }

  async function handleDelete(overlay) {
    if (!confirm(`Delete overlay "${overlay.name}"?`)) return
    const result = await kmzOverlayApi.deleteOverlay(overlay.id)
    if (result.success) {
      kmzOverlaysStore.removeOverlay(overlay.id)
      if (expandedOverlayId === overlay.id) expandedOverlayId = null
      toast.success(`Deleted "${overlay.name}"`)
    } else {
      toast.error(result.message || "Failed to delete overlay")
    }
  }

  async function saveOverlay(overlay) {
    // Optimistic: reflect the change locally immediately so the map + UI
    // update without waiting for the round trip.
    kmzOverlaysStore.updateOverlay(overlay)

    const result = await kmzOverlayApi.updateOverlay(overlay.id, {
      geojson: overlay.geojson,
      style: overlay.style,
    })
    if (result.success) {
      kmzOverlaysStore.updateOverlay(result.overlay)
      console.log("[kmz-overlay] saved OK overlay", overlay.id)
    } else {
      console.error("[kmz-overlay] save FAILED:", result.message)
      toast.error(result.message || "Failed to save changes")
    }
  }

  // ── Selection / zoom ────────────────────────────────────────────────
  function selectRoad(overlay, index) {
    kmzOverlaysStore.setSelection(overlay.id, index)
    kmzOverlaysStore.requestFocus() // tell the renderer to zoom to it
  }

  function clearRoadSelection() {
    kmzOverlaysStore.clearSelection()
  }

  // ── Editing ──────────────────────────────────────────────────────────
  // Resolve the edit target explicitly: a selected road (within the expanded
  // overlay) gets the edit, otherwise the cluster defaults are edited.
  // Logged so we can see exactly which branch runs.
  function resolveTarget() {
    const overlay = editingOverlay
    if (!overlay) return null
    const index =
      selectedOverlayId === overlay.id && typeof selectedRoadIndex === "number"
        ? selectedRoadIndex
        : null
    if (index === null) return { overlay, index: null, feature: null }
    const feature = overlay.geojson?.features?.[index] || null
    return { overlay, index, feature }
  }

  function setFeatureProps(feature, patch, deleteKeys = []) {
    if (!feature) return
    if (!feature.properties) feature.properties = {}
    Object.assign(feature.properties, patch)
    for (const k of deleteKeys) delete feature.properties[k]
  }

  function applyStylePatch(patch) {
    const t = resolveTarget()
    if (!t) return
    if (t.feature && t.index !== null) {
      // Set the new value on the road. NOTE: do NOT pass deleteKeys here —
      // setFeatureProps would assign the value then delete it (the old bug).
      setFeatureProps(t.feature, patch)
      console.log("[kmz-overlay] individual edit → road", t.index, patch, "in overlay", t.overlay.id)
    } else {
      t.overlay.style = { ...(t.overlay.style || {}), ...patch }
      console.log("[kmz-overlay] cluster edit →", patch, "in overlay", t.overlay.id)
    }
    saveOverlay(t.overlay)
  }

  function setColor(value) {
    if (!editingOverlay) return
    applyStylePatch({ color: value })
  }
  function setDashed(value) {
    if (!editingOverlay) return
    applyStylePatch({ dashed: value })
  }
  function setWidth(value) {
    if (!editingOverlay) return
    applyStylePatch({ width: value })
  }
  function setName(value) {
    const t = resolveTarget()
    if (!t || !t.feature || t.index === null) return
    setFeatureProps(t.feature, { name: value })
    console.log("[kmz-overlay] rename road", t.index, "→", value)
    saveOverlay(t.overlay)
  }

  // Push the current editor settings to every road in the cluster.
  // Sets the cluster default and clears per-road overrides so all follow.
  function applyToAll() {
    const t = resolveTarget()
    if (!t) return
    const values = {
      color: displayColor,
      width: displayWidth,
      dashed: displayDashed,
    }
    t.overlay.style = { ...(t.overlay.style || {}), ...values }
    for (const feature of t.overlay.geojson?.features || []) {
      if (!feature.properties) continue
      delete feature.properties.color
      delete feature.properties.dashed
      delete feature.properties.width
    }
    console.log("[kmz-overlay] apply to all →", values, "in overlay", t.overlay.id)
    saveOverlay(t.overlay)
    toast.success(`Applied ${values.width}px ${values.dashed ? "dashed" : "solid"} to all roads`)
  }

  function resetThisRoad() {
    const t = resolveTarget()
    if (!t || !t.feature || t.index === null) return
    setFeatureProps(t.feature, {}, ["color", "dashed", "width"])
    saveOverlay(t.overlay)
    toast.success("Road reset to cluster defaults")
  }

  onMount(() => {
    loadOverlays()
  })
</script>

<div class="kmz-controls">
  <!-- Upload -->
  <div class="control-group">
    <span class="group-label">Add Road Overlay</span>
    <p class="group-hint">
      Upload a KMZ (or KML/GeoJSON) with roads drawn in Google Earth. Click a
      road to select and zoom to it — settings below apply to that road. Use
      "Apply to all" to push the current settings across the whole cluster.
    </p>

    <button class="upload-zone" on:click={triggerFilePick}>
      <CloudUpload size={22} />
      <span>{selectedFile ? selectedFile.name : "Choose KMZ / KML / GeoJSON"}</span>
      <span class="upload-hint">.kmz .kml .geojson</span>
    </button>
    <input
      bind:this={fileInput}
      type="file"
      accept=".kmz,.kml,.geojson,.json"
      class="hidden-input"
      on:change={handleFileChange}
    />

    {#if preview}
      <div class="preview-box">
        <div class="preview-row">
          <span class="preview-label">Features</span>
          <span class="preview-value">{preview.features}</span>
        </div>
        <div class="preview-row">
          <span class="preview-label">Lines</span>
          <span class="preview-value">{preview.lines}</span>
        </div>
        <div class="preview-row">
          <span class="preview-label">Polygons</span>
          <span class="preview-value">{preview.polys}</span>
        </div>
        {#if preview.lines === 0 && preview.polys > 0}
          <p class="preview-warn">
            No line features found — this looks like a polygon file. It will
            still be added.
          </p>
        {/if}
      </div>
    {/if}

    <div class="upload-actions">
      {#if selectedFile}
        <button
          class="primary-btn"
          on:click={handleUpload}
          disabled={uploading || preview === null}
        >
          {#if uploading}
            <Loader2 size={16} class="spin" />
            <span>Adding…</span>
          {:else}
            <FileUp size={16} />
            <span>Add Overlay</span>
          {/if}
        </button>
        <button class="ghost-btn" on:click={clearUpload}>Cancel</button>
      {/if}
    </div>
  </div>

  <!-- Overlay list -->
  <div class="control-group">
    <span class="group-label">
      Overlays
      {#if loadingList}
        <Loader2 size={12} class="spin inline-loader" />
      {/if}
    </span>

    {#if overlays.length === 0}
      <p class="group-hint">No overlays yet — add a KMZ above to get started.</p>
    {:else}
      <div class="overlay-list">
        {#each overlays as overlay (overlay.id)}
          {@const isHidden = hiddenIds.has(overlay.id)}
          {@const isExpanded = expandedOverlayId === overlay.id}
          {@const roadCount = overlay.geojson?.features?.length || 0}

          <div class="overlay-card" class:card-hidden={isHidden}>
            <div class="overlay-row">
              <button
                class="icon-btn chevron"
                on:click={() => toggleExpanded(overlay.id)}
                title={isExpanded ? "Collapse" : "Expand"}
              >
                {#if isExpanded}
                  <ChevronDown size={15} />
                {:else}
                  <ChevronRight size={15} />
                {/if}
              </button>
              <button class="overlay-main" on:click={() => toggleExpanded(overlay.id)}>
                <RoadIcon size={14} style="color: {defaultColor(overlay)}" />
                <span class="overlay-name">{overlay.name}</span>
                <span class="overlay-count">{roadCount}</span>
              </button>
              <button
                class="icon-btn"
                class:btn-active={!isHidden}
                on:click={() => toggleOverlay(overlay)}
                title={isHidden ? "Show" : "Hide"}
              >
                {#if isHidden}
                  <EyeOff size={15} />
                {:else}
                  <Eye size={15} />
                {/if}
              </button>
              <button
                class="icon-btn danger"
                on:click={() => handleDelete(overlay)}
                title="Delete"
              >
                <Trash2 size={15} />
              </button>
            </div>

            {#if isExpanded}
              <div class="overlay-detail">
                <!-- Single style editor -->
                <div class="detail-group">
                  <span class="detail-label">
                    <Paintbrush size={12} />
                    {#if hasSelection}
                      Editing: {editingName}
                    {:else}
                      Cluster Style
                    {/if}
                    {#if hasSelection}
                      <button class="clear-btn" on:click={clearRoadSelection}>
                        <X size={11} /> Clear
                      </button>
                    {/if}
                  </span>

                  {#if hasSelection}
                    <input
                      class="name-input"
                      type="text"
                      value={editingName}
                      placeholder="Road name"
                      maxlength="40"
                      on:change={(e) => setName(e.currentTarget.value)}
                    />
                  {/if}

                  <span class="sub-label">Colour</span>
                  <div class="swatch-row">
                    {#each COLOR_PRESETS as preset}
                      <button
                        class="swatch"
                        style="background: {preset.value}"
                        class:swatch-active={displayColor === preset.value}
                        on:click={() => setColor(preset.value)}
                        title={preset.name}
                      ></button>
                    {/each}
                  </div>

                  <span class="sub-label">Thickness</span>
                  <div class="chip-row">
                    {#each SIZE_PRESETS as size}
                      <button
                        class="chip"
                        class:chip-active={displayWidth === size.value}
                        on:click={() => setWidth(size.value)}
                      >{size.label}</button>
                    {/each}
                  </div>

                  <span class="sub-label">Style</span>
                  <div class="chip-row">
                    <button
                      class="chip"
                      class:chip-active={!displayDashed}
                      on:click={() => setDashed(false)}
                    >Solid</button>
                    <button
                      class="chip"
                      class:chip-active={displayDashed}
                      on:click={() => setDashed(true)}
                    >Dashed</button>
                  </div>

                  <div class="editor-footer">
                    <button class="apply-btn" on:click={applyToAll}>
                      <Check size={12} /> Apply to all
                    </button>
                    {#if hasSelection}
                      <button class="reset-btn" on:click={resetThisRoad}>
                        <RotateCcw size={11} /> Reset this road
                      </button>
                    {/if}
                  </div>

                  <p class="group-hint">
                    {#if hasSelection}
                      Applies to this road only.
                    {:else}
                      Applies to the whole cluster.
                    {/if}
                  </p>
                </div>

                <!-- Roads -->
                <div class="detail-group">
                  <span class="detail-label">
                    <RoadIcon size={12} /> Roads ({roadCount})
                  </span>
                  <div class="roads-list">
                    {#each Array.from({ length: roadCount }) as _, index (index)}
                      {@const selected =
                        selectedOverlayId === overlay.id &&
                        selectedRoadIndex === index}
                      {@const color = resolvedColor(overlay, index)}
                      {@const dashed = resolvedDashed(overlay, index)}
                      {@const width = resolvedWidth(overlay, index)}
                      <div
                        class="road-row"
                        class:road-selected={selected}
                        on:click={() => selectRoad(overlay, index)}
                      >
                        <span
                          class="road-preview"
                          style={previewStyle(color, dashed, width)}
                        ></span>
                        <span class="road-name">{roadName(overlay, index)}</span>
                        <span class="road-size">{width}px</span>
                        <span class="road-dash">{dashed ? "dashed" : "solid"}</span>
                      </div>
                    {/each}
                  </div>
                </div>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .kmz-controls {
    padding: 16px 12px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .control-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .group-label {
    font-size: 11px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.7);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .group-hint {
    margin: 0;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.4);
    line-height: 1.5;
  }

  .inline-loader {
    color: #fbbf24;
  }

  /* ── Upload Zone ── */
  .upload-zone {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 18px 12px;
    border-radius: 10px;
    border: 1.5px dashed rgba(251, 191, 36, 0.4);
    background: rgba(251, 191, 36, 0.06);
    color: rgba(255, 255, 255, 0.85);
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    transition: all 0.15s ease;
    text-align: center;
  }
  .upload-zone:hover {
    border-color: #fbbf24;
    background: rgba(251, 191, 36, 0.12);
  }
  .upload-hint {
    font-size: 10px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.35);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .hidden-input {
    display: none;
  }

  /* ── Preview ── */
  .preview-box {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 10px 12px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }
  .preview-row {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
  }
  .preview-label {
    color: rgba(255, 255, 255, 0.5);
  }
  .preview-value {
    color: #fbbf24;
    font-weight: 700;
  }
  .preview-warn {
    margin: 4px 0 0;
    font-size: 10px;
    color: #fbbf24;
    line-height: 1.4;
  }

  /* ── Actions ── */
  .upload-actions {
    display: flex;
    gap: 8px;
    margin-top: 2px;
  }
  .primary-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px 12px;
    border-radius: 8px;
    border: none;
    background: #fbbf24;
    color: #1a1206;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .primary-btn:hover:not(:disabled) {
    background: #fcd34d;
  }
  .primary-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .ghost-btn {
    padding: 8px 12px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: rgba(255, 255, 255, 0.7);
    font-size: 12px;
    cursor: pointer;
  }
  .ghost-btn:hover {
    background: rgba(255, 255, 255, 0.15);
    color: #fff;
  }

  /* ── Overlay Cards ── */
  .overlay-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .overlay-card {
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    overflow: hidden;
    transition: opacity 0.15s ease;
  }
  .overlay-card.card-hidden {
    opacity: 0.55;
  }
  .overlay-row {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 6px 8px;
  }
  .overlay-main {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.85);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    text-align: left;
    padding: 4px 2px;
  }
  .overlay-name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .overlay-count {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.4);
    background: rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    padding: 1px 6px;
  }

  /* ── Detail ── */
  .overlay-detail {
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    padding: 10px 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .detail-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .detail-label {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 10px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.55);
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }
  .sub-label {
    font-size: 10px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.4);
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }

  /* ── Swatches ── */
  .swatch-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .swatch {
    width: 22px;
    height: 22px;
    border-radius: 6px;
    border: 2px solid rgba(255, 255, 255, 0.15);
    cursor: pointer;
    transition: all 0.12s ease;
    padding: 0;
  }
  .swatch:hover {
    transform: scale(1.12);
    border-color: rgba(255, 255, 255, 0.5);
  }
  .swatch.swatch-active {
    border-color: #ffffff;
    box-shadow: 0 0 0 2px rgba(251, 191, 36, 0.7);
  }

  /* ── Chips ── */
  .chip-row {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .chip {
    font-size: 11px;
    padding: 5px 10px;
    border-radius: 7px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: rgba(255, 255, 255, 0.7);
    cursor: pointer;
    transition: all 0.15s ease;
    font-weight: 500;
  }
  .chip:hover {
    background: rgba(255, 255, 255, 0.15);
    color: #fff;
  }
  .chip.chip-active {
    background: rgba(251, 191, 36, 0.22);
    border-color: #fbbf24;
    color: #fde68a;
    font-weight: 600;
  }

  /* ── Editor footer ── */
  .editor-footer {
    display: flex;
    gap: 8px;
    margin-top: 2px;
  }
  .apply-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 10px;
    border-radius: 6px;
    border: none;
    background: rgba(251, 191, 36, 0.2);
    border: 1px solid rgba(251, 191, 36, 0.5);
    color: #fde68a;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .apply-btn:hover {
    background: rgba(251, 191, 36, 0.32);
    color: #fff;
  }
  .reset-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 9px;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.07);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: rgba(255, 255, 255, 0.6);
    font-size: 10px;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .reset-btn:hover {
    background: rgba(255, 255, 255, 0.14);
    color: #fff;
  }
  .clear-btn {
    display: flex;
    align-items: center;
    gap: 3px;
    margin-left: auto;
    padding: 3px 7px;
    border-radius: 5px;
    background: rgba(255, 255, 255, 0.07);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: rgba(255, 255, 255, 0.55);
    font-size: 10px;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .clear-btn:hover {
    background: rgba(239, 68, 68, 0.15);
    border-color: rgba(239, 68, 68, 0.4);
    color: #f87171;
  }

  .name-input {
    width: 100%;
    padding: 7px 9px;
    border-radius: 7px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.14);
    color: rgba(255, 255, 255, 0.9);
    font-size: 12px;
    outline: none;
  }
  .name-input:focus {
    border-color: rgba(251, 191, 36, 0.6);
  }

  /* ── Roads list ── */
  .roads-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 260px;
    overflow-y: auto;
    padding-right: 2px;
  }
  .road-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 7px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid transparent;
    cursor: pointer;
    transition: all 0.12s ease;
  }
  .road-row:hover {
    background: rgba(255, 255, 255, 0.1);
  }
  .road-row.road-selected {
    border-color: #fbbf24;
    background: rgba(251, 191, 36, 0.12);
  }
  .road-preview {
    flex-shrink: 0;
    border-radius: 2px;
  }
  .road-name {
    flex: 1;
    min-width: 0;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.85);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .road-size {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.4);
    flex-shrink: 0;
  }
  .road-dash {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.35);
    flex-shrink: 0;
  }

  .icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 6px;
    border: none;
    background: transparent;
    color: rgba(255, 255, 255, 0.5);
    cursor: pointer;
    transition: all 0.15s ease;
    flex-shrink: 0;
  }
  .icon-btn:hover {
    background: rgba(255, 255, 255, 0.12);
    color: #fff;
  }
  .icon-btn.btn-active {
    color: #fbbf24;
  }
  .icon-btn.danger:hover {
    background: rgba(239, 68, 68, 0.2);
    color: #f87171;
  }
  .icon-btn.chevron {
    color: rgba(255, 255, 255, 0.45);
  }

  .spin {
    animation: kmz-spin 1s linear infinite;
  }

  @keyframes kmz-spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
</style>
