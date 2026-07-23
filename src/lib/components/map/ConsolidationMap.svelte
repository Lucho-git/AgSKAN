<!-- src/lib/components/map/ConsolidationMap.svelte -->
<!-- Visual map for AgSKAN ↔ Agworld field consolidation (view-only, no click interactions) -->
<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from "svelte"
  import mapboxgl from "mapbox-gl"
  import { PUBLIC_MAPBOX_ACCESS_TOKEN } from "$env/static/public"

  export let agskanFields: any[] = []
  export let agworldBoundaries: any[] = []
  export let focusField: { id: string; source: "agskan" | "agworld" } | null = null
  export let highlightFieldId: string | null = null
  export let selectedFieldIds: string[] = []
  export let dominantFieldIds: string[] = []  // multiple fields that should appear as dominant (split scenario)
  export let inspectorMode = false
  export let interactive = false  // enables click-to-select for consolidated preview
  export let selectedConsolidatedId: string | null = null  // highlighted field in consolidated preview
  export let fadedFocus = false  // when true (split mode), the focused field is faded (being deleted), not dominant
  export let height: string | number = 500

  const dispatch = createEventDispatcher()

  let mapContainer: HTMLDivElement
  let map: mapboxgl.Map | null = null
  let mapReady = false
  let resizeObserver: ResizeObserver | null = null

  // --- Color schemes ---
  // Review (merge/split): cyan/orange
  // Preview (consolidated): blue/white matching MapFields defaults
  const REVIEW_SCHEME = {
    dominant: { fill: "#06b6d4", line: "#ffffff", opacity: 0.7, lineOpacity: 1 },
    // Candidate (non-dominant) selected → bright orange fill, very visible.
    // Candidate unselected → barely-there dark fill, dim outline.
    nonDomSel: { fill: "#f97316", line: "#f97316", opacity: 0.45, lineOpacity: 1 },
    nonDomDim: { fill: "#1a0800", line: "#5a3a20", opacity: 0.05, lineOpacity: 0.2 },
    bg: { fill: "#1a1a1a", line: "#222222", opacity: 0.03 },
    labelColor: "#ffffff", labelHalo: "#000000",
    skanFill: "#06b6d4", skanOutline: "#ffffff", awFill: "#f97316", awOutline: "#ffffff",
  }
  const PREVIEW_SCHEME = {
    dominant: { fill: "#0080ff", line: "#bfffbf", opacity: 0.1, lineOpacity: 0.95 },
    nonDomSel: { fill: "#94a3b8", line: "#cbd5e1", opacity: 0.25, lineOpacity: 1 },
    nonDomDim: { fill: "#94a3b8", line: "#cbd5e1", opacity: 0.12, lineOpacity: 0.5 },
    bg: { fill: "#1a1a1a", line: "#222222", opacity: 0.03 },
    labelColor: "#ffffff", labelHalo: "#000000",
    skanFill: "#0080ff", skanOutline: "#bfffbf", awFill: "#0080ff", awOutline: "#bfffbf",
  }
  $: scheme = interactive ? PREVIEW_SCHEME : REVIEW_SCHEME
  const bgDim = 0.5  // fixed background dim — always applied, no user control

  export let overlapCandidates: Array<{
    id: string; name: string; source: "agskan" | "agworld"
    overlapPct: number; areaHa: number; selected: boolean
  }> = []

  $: if (mapReady) { agskanFields.length; agworldBoundaries.length; focusField; highlightFieldId; selectedFieldIds; dominantFieldIds; selectedConsolidatedId; fadedFocus; updateAllLayers() }

  // React to external focusField prop changes (from parent clicking table)
  let lastExternalFocus = ""
  let settingFromProp = false
  $: if (mapReady && focusField && !settingFromProp) {
    const key = focusField.id + focusField.source
    if (key !== lastExternalFocus) {
      lastExternalFocus = key
      settingFromProp = true
      setFocus(focusField.id, focusField.source)
      settingFromProp = false
    }
  }
  $: if (mapReady && !focusField && lastExternalFocus && !settingFromProp) {
    lastExternalFocus = ""
    clearFocus()
  }
  // Zoom to selected consolidated field
  let overviewDone = false
  $: if (mapReady && selectedConsolidatedId && map) {
    const field = agskanFields.find(f => f.field_id === selectedConsolidatedId)
    if (field?.boundary) {
      import("@turf/turf").then(turf => {
        try {
          const feat = { type: "Feature", geometry: field.boundary, properties: {} }
          const bbox = turf.bbox(feat)
          const pad = Math.min(100, Math.floor(Math.min(mapContainer.clientWidth, mapContainer.clientHeight) * 0.15))
          map!.fitBounds(bbox as [number, number, number, number], { padding: pad, maxZoom: 17, duration: 300 })
        } catch { /* skip */ }
      })
    }
  }

  async function computeOverlaps(focusGeom: any, focusSource: "agskan" | "agworld", focusId: string) {
    const turf = await import("@turf/turf")
    const candidates: typeof overlapCandidates = []
    const otherFields = focusSource === "agskan" ? agworldBoundaries : agskanFields
    const focusFeat = { type: "Feature", geometry: focusGeom, properties: {} }
    const focusArea = turf.area(focusFeat)

    for (const f of otherFields) {
      if (!f.boundary?.type) continue
      const fid = f.field_id || f.id
      const fname = f.name || f.attributes?.name || fid
      const fArea = f._turfAreaHa ? f._turfAreaHa * 10000 : turf.area({ type: "Feature", geometry: f.boundary, properties: {} })

      let overlapPct = 0
      try {
        const fc = { type: "FeatureCollection", features: [focusFeat, { type: "Feature", geometry: f.boundary, properties: {} }] }
        const inter = turf.intersect(fc)
        if (inter) {
          overlapPct = Math.min(turf.area(inter) / focusArea, turf.area(inter) / fArea) * 100
        }
      } catch { /* no overlap */ }

      const fSource = focusSource === "agskan" ? "agworld" : "agskan"
      const key = fid + fSource

      // Deduplicate: if same field has multiple boundaries, keep highest overlap
      const existing = candidates.find(c => (c.id + c.source) === key)
      if (existing) {
        if (overlapPct > existing.overlapPct) {
          existing.overlapPct = Math.round(overlapPct)
          existing.areaHa = Math.round(fArea / 10000 * 10) / 10
        }
        continue
      }

      // Only include if overlap > 1% (tiny overlap threshold)
      if (overlapPct > 1) {
        candidates.push({
          id: fid, name: fname, source: fSource,
          overlapPct: Math.round(overlapPct),
          areaHa: Math.round(fArea / 10000 * 10) / 10,
          selected: false,
        })
      }
    }
    candidates.sort((a, b) => b.overlapPct - a.overlapPct)
    return candidates
  }

  function getGeometry(source: "agskan" | "agworld", id: string): any {
    if (source === "agskan") return agskanFields.find(f => f.field_id === id)?.boundary
    return agworldBoundaries.find(b => (b.field_id || b.id) === id)?.boundary
  }

  async function setFocus(id: string | null, source: "agskan" | "agworld" | null) {
    if (!id || !source) {
      focusField = null
      overlapCandidates = []
      if (!settingFromProp) dispatch("focusChange", { focus: null, candidates: [] })
      updateAllLayers(); return
    }
    if (!settingFromProp) focusField = { id, source }
    const geom = getGeometry(source, id)
    overlapCandidates = geom ? await computeOverlaps(geom, source, id) : []
    if (!settingFromProp) dispatch("focusChange", { focus: focusField, candidates: overlapCandidates })
    updateAllLayers()
    if (geom && map) {
      try {
        const turf = await import("@turf/turf")
        // Collect all relevant geometries for bbox (focused + overlap candidates + selected fields)
        const allGeoms: any[] = [{ type: "Feature", geometry: geom, properties: {} }]
        for (const c of overlapCandidates) {
          const cGeom = getGeometry(c.source, c.id)
          if (cGeom) allGeoms.push({ type: "Feature", geometry: cGeom, properties: {} })
        }
        for (const sf of agskanFields) {
          if (selectedFieldIds.includes(sf.field_id) && sf.boundary) {
            allGeoms.push({ type: "Feature", geometry: sf.boundary, properties: {} })
          }
        }
        for (const aw of agworldBoundaries) {
          const fid = aw.field_id || aw.id
          if (selectedFieldIds.includes(fid) && aw.boundary) {
            allGeoms.push({ type: "Feature", geometry: aw.boundary, properties: {} })
          }
        }
        const fc = turf.featureCollection(allGeoms)
        const bbox = turf.bbox(fc)
        const pad = Math.min(80, Math.floor(Math.min(mapContainer.clientWidth, mapContainer.clientHeight) * 0.12))
        map.fitBounds(bbox as [number, number, number, number], { padding: pad, maxZoom: 17, duration: 300 })
      } catch { /* skip */ }
    }
  }

  function clearFocus() { setFocus(null, null) }

  function updateAllLayers() {
    if (!map) return
    const focused = focusField

    // When focused, show the focused field + all selected fields + overlap candidates.
    // If overlapCandidates is empty (computeOverlaps hasn't resolved yet), don't
    // filter — show everything so the initial render isn't blank.
    const relevantSkanIds = new Set<string>()
    const relevantAwIds = new Set<string>()
    let hasRelevanceFilter = false
    if (focused) {
      if (focused.source === "agskan") relevantSkanIds.add(focused.id)
      else relevantAwIds.add(focused.id)
      for (const c of overlapCandidates) {
        if (c.source === "agskan") relevantSkanIds.add(c.id)
        else relevantAwIds.add(c.id)
      }
      // Also include all selectedFieldIds and dominantFieldIds
      for (const sf of agskanFields) {
        if (selectedFieldIds.includes(sf.field_id) || dominantFieldIds.includes(sf.field_id)) relevantSkanIds.add(sf.field_id)
      }
      for (const aw of agworldBoundaries) {
        const fid = aw.field_id || aw.id
        if (selectedFieldIds.includes(fid) || dominantFieldIds.includes(fid)) relevantAwIds.add(fid)
      }
      // Only apply the relevance filter if we actually have overlap data
      hasRelevanceFilter = overlapCandidates.length > 0
    }

    // Dim the satellite background using a background layer (inserted at bottom, before any field layers)
    const dimOpacity = bgDim
    if (!map.getLayer('bg-dim')) {
      // Insert before 'bg-skan-fill' if it exists, otherwise just add (will be at bottom)
      const beforeLayer = map.getLayer('bg-skan-fill') ? 'bg-skan-fill' : undefined
      map.addLayer({ id: 'bg-dim', type: 'background', paint: { 'background-color': '#000000', 'background-opacity': dimOpacity } }, beforeLayer)
    } else {
      map.setPaintProperty('bg-dim', 'background-opacity', dimOpacity)
    }

    // Background fields (not involved in selection) — rendered first (bottom layer)
    const bgSkanFeatures = agskanFields.filter(f => f.boundary?.type && hasRelevanceFilter && !relevantSkanIds.has(f.field_id)).map(f => ({
      type: "Feature", geometry: f.boundary, properties: {
        id: f.field_id, name: f.name, source: "agskan",
        opacity: scheme.bg.opacity, fillColor: scheme.bg.fill, lineColor: scheme.bg.line, lineWidth: 1,
      }
    }))
    const bgAwFeatures = agworldBoundaries.filter(b => b.boundary?.type && hasRelevanceFilter && !relevantAwIds.has(b.field_id || b.id)).map(b => ({
      type: "Feature", geometry: b.boundary, properties: {
        id: b.field_id || b.id, name: b.name, source: "agworld",
        opacity: scheme.bg.opacity, fillColor: scheme.bg.fill, lineColor: scheme.bg.line, lineWidth: 1,
      }
    }))

    // When fadedFocus is true (split mode), the focused field is being deleted —
    // don't render it as dominant; it'll appear in the non-dominant layer instead.
    const focusIsDominant = focused && !fadedFocus
    // In interactive/preview mode with no explicit selection, treat ALL fields as dominant.
    const showAllAsDominant = interactive && !focused && dominantFieldIds.length === 0

    // Foreground non-dominant fields — split into selected (bright orange) and dimmed (near-invisible)
    const fgSkanNonDom = agskanFields.filter(f => f.boundary?.type && !showAllAsDominant && (!hasRelevanceFilter || relevantSkanIds.has(f.field_id)) && !(focusIsDominant && focused?.source === "agskan" && focused.id === f.field_id) && !dominantFieldIds.includes(f.field_id)).map(f => {
      const isSel = selectedFieldIds.includes(f.field_id)
      const s = isSel ? scheme.nonDomSel : scheme.nonDomDim
      return { type: "Feature", geometry: f.boundary, properties: {
        id: f.field_id, name: f.name, source: "agskan",
        opacity: s.opacity, lineOpacity: s.lineOpacity,
        fillColor: s.fill, lineColor: s.line, lineWidth: isSel ? 3 : 1,
      }}
    })
    const fgAwNonDom = agworldBoundaries.filter(b => b.boundary?.type && !showAllAsDominant && (!hasRelevanceFilter || relevantAwIds.has(b.field_id || b.id)) && !(focusIsDominant && focused?.source === "agworld" && focused.id === (b.field_id || b.id)) && !dominantFieldIds.includes(b.field_id || b.id)).map(b => {
      const fid = b.field_id || b.id
      const isSel = selectedFieldIds.includes(fid)
      const s = isSel ? scheme.nonDomSel : scheme.nonDomDim
      return { type: "Feature", geometry: b.boundary, properties: {
        id: fid, name: b.name, source: "agworld",
        opacity: s.opacity, lineOpacity: s.lineOpacity,
        fillColor: s.fill, lineColor: s.line, lineWidth: isSel ? 3 : 1,
      }}
    })

    const fgSelected = [...fgSkanNonDom.filter(f => selectedFieldIds.includes(f.properties.id)),
      ...fgAwNonDom.filter(b => selectedFieldIds.includes(b.properties.id))]
    const fgDimmed = [...fgSkanNonDom.filter(f => !selectedFieldIds.includes(f.properties.id)),
      ...fgAwNonDom.filter(b => !selectedFieldIds.includes(b.properties.id))]

    // Dominant field(s) — rendered last (top layer).
    const domSkanFeatures = agskanFields.filter(f => f.boundary?.type &&
      (showAllAsDominant || (focusIsDominant && focused?.source === "agskan" && focused.id === f.field_id) || dominantFieldIds.includes(f.field_id))
    ).map(f => ({
      type: "Feature", geometry: f.boundary, properties: {
        id: f.field_id, name: f.name, source: "agskan",
        opacity: scheme.dominant.opacity, lineOpacity: scheme.dominant.lineOpacity,
        fillColor: scheme.dominant.fill, lineColor: scheme.dominant.line, lineWidth: 4,
      }
    }))
    const domAwFeatures = agworldBoundaries.filter(b => b.boundary?.type &&
      (showAllAsDominant || (focusIsDominant && focused?.source === "agworld" && focused.id === (b.field_id || b.id)) || dominantFieldIds.includes(b.field_id || b.id))
    ).map(b => ({
      type: "Feature", geometry: b.boundary, properties: {
        id: b.field_id || b.id, name: b.name, source: "agworld",
        opacity: scheme.dominant.opacity, lineOpacity: scheme.dominant.lineOpacity,
        fillColor: scheme.dominant.fill, lineColor: scheme.dominant.line, lineWidth: 4,
      }
    }))

    // Highlighted consolidated field (for preview mode) — white outline highlight
    const highlightSkanFeatures = agskanFields.filter(f => f.boundary?.type && selectedConsolidatedId && f.field_id === selectedConsolidatedId).map(f => ({
      type: "Feature", geometry: f.boundary, properties: {
        id: f.field_id, name: f.name, source: "agskan",
        opacity: 0.3, lineOpacity: 1, fillColor: "#0080ff", lineColor: "#ffffff", lineWidth: 4,
      }
    }))

    // Background layers (bottom) — line-opacity tied to fill opacity so borders don't pop
    ensureLayer("bg-skan", "bg-skan-fill", "fill",
      { "fill-color": ["get", "fillColor"], "fill-opacity": ["get", "opacity"] }, {}, bgSkanFeatures)
    ensureLayer("bg-skan", "bg-skan-outline", "line",
      { "line-color": ["get", "lineColor"], "line-width": ["get", "lineWidth"], "line-opacity": ["get", "opacity"] }, {}, bgSkanFeatures)
    ensureLayer("bg-aw", "bg-aw-fill", "fill",
      { "fill-color": ["get", "fillColor"], "fill-opacity": ["get", "opacity"] }, {}, bgAwFeatures)
    ensureLayer("bg-aw", "bg-aw-outline", "line",
      { "line-color": ["get", "lineColor"], "line-width": ["get", "lineWidth"], "line-opacity": ["get", "opacity"] }, {}, bgAwFeatures)

    // Foreground non-dominant: selected (bright orange) on top, dimmed underneath
    ensureLayer("fg-sel", "fg-sel-fill", "fill",
      { "fill-color": ["get", "fillColor"], "fill-opacity": ["get", "opacity"] }, {}, fgSelected)
    ensureLayer("fg-sel", "fg-sel-outline", "line",
      { "line-color": ["get", "lineColor"], "line-width": ["get", "lineWidth"], "line-opacity": ["get", "lineOpacity"] }, {}, fgSelected)
    ensureLayer("fg-dim", "fg-dim-fill", "fill",
      { "fill-color": ["get", "fillColor"], "fill-opacity": ["get", "opacity"] }, {}, fgDimmed)
    ensureLayer("fg-dim", "fg-dim-outline", "line",
      { "line-color": ["get", "lineColor"], "line-width": ["get", "lineWidth"], "line-opacity": ["get", "lineOpacity"] }, {}, fgDimmed)

    // Dominant field layers (top) — border uses lineOpacity (full) not fill opacity
    ensureLayer("dom-skan", "dom-skan-fill", "fill",
      { "fill-color": ["get", "fillColor"], "fill-opacity": ["get", "opacity"] }, {}, domSkanFeatures)
    ensureLayer("dom-skan", "dom-skan-outline", "line",
      { "line-color": ["get", "lineColor"], "line-width": ["get", "lineWidth"], "line-opacity": ["get", "lineOpacity"] }, {}, domSkanFeatures)
    ensureLayer("dom-aw", "dom-aw-fill", "fill",
      { "fill-color": ["get", "fillColor"], "fill-opacity": ["get", "opacity"] }, {}, domAwFeatures)
    ensureLayer("dom-aw", "dom-aw-outline", "line",
      { "line-color": ["get", "lineColor"], "line-width": ["get", "lineWidth"], "line-opacity": ["get", "lineOpacity"] }, {}, domAwFeatures)

    // Labels: MapViewer-style — name + hectares, zoom-interpolated
    // Create label points from field centroids
    if (interactive && agskanFields.length > 0) {
      createAndShowLabels()
    }
    if (!interactive) {
      // Review mode: simpler labels
      const labelTextSize = ["interpolate", ["linear"], ["zoom"], 10, 0, 11, 9, 13, 14, 15, 22]
      ensureLayer("fg-sel-labels", "fg-sel-labels", "symbol",
        { "text-color": "#fff", "text-halo-color": "#000", "text-halo-width": 1.5 },
        { "text-field": ["get", "name"], "text-anchor": "center", "text-size": labelTextSize }, fgSelected)
      ensureLayer("dom-labels", "dom-labels", "symbol",
        { "text-color": "#fff", "text-halo-color": "#000", "text-halo-width": 2 },
        { "text-field": ["get", "name"], "text-anchor": "center", "text-size": labelTextSize }, [...domSkanFeatures, ...domAwFeatures])
    }

    // Highlight layer for consolidated preview
    ensureLayer("hl", "hl-fill", "fill",
      { "fill-color": ["get", "fillColor"], "fill-opacity": ["get", "opacity"] }, {}, highlightSkanFeatures)
    ensureLayer("hl", "hl-outline", "line",
      { "line-color": ["get", "lineColor"], "line-width": ["get", "lineWidth"], "line-opacity": ["get", "lineOpacity"] }, {}, highlightSkanFeatures)
  }

  async function createAndShowLabels() {
    if (!map) return
    const turf = await import("@turf/turf")
    const features = agskanFields.filter(f => f.boundary?.type).map((f, i) => {
      try {
        let poly: any
        if (f.boundary.type === "Polygon") {
          poly = turf.polygon(f.boundary.coordinates)
        } else if (f.boundary.type === "MultiPolygon") {
          poly = turf.multiPolygon(f.boundary.coordinates)
        } else return null
        const center = turf.center(poly)
        const inside = turf.booleanPointInPolygon(center.geometry.coordinates, poly)
        const pt = inside ? center : turf.pointOnFeature(poly)
        return {
          type: "Feature", geometry: pt.geometry, properties: {
            id: f.field_id, name: f.name,
            area: Math.round((f._turfAreaHa || 0) * 10) / 10,
          }
        }
      } catch { return null }
    }).filter(Boolean)

    const labelFC = { type: "FeatureCollection", features }

    // Update or create source and layers
    if (map.getSource("label-points")) {
      (map.getSource("label-points") as mapboxgl.GeoJSONSource).setData(labelFC)
    } else {
      map.addSource("label-points", { type: "geojson", data: labelFC })
    }
    if (!map.getLayer("fields-labels")) {
      map.addLayer({
        id: "fields-labels", type: "symbol", source: "label-points",
        layout: {
          "text-field": ["get", "name"], "text-anchor": "center",
          "text-font": ["DIN Pro Bold", "Arial Unicode MS Bold"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 10, 0, 11, 8, 13, 12, 15, 28, 17, 48, 19, 96],
          "text-allow-overlap": true, "text-ignore-placement": false,
        },
        paint: { "text-color": "#ffffff", "text-halo-color": "#000000", "text-halo-width": 2 },
      })
    }
    if (!map.getLayer("fields-labels-area")) {
      map.addLayer({
        id: "fields-labels-area", type: "symbol", source: "label-points",
        layout: {
          "text-field": ["concat", ["get", "area"], " ha"],
          "text-anchor": "top", "text-offset": [0, 1.2],
          "text-font": ["DIN Pro Regular", "Arial Unicode MS Regular"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 10, 0, 11, 6, 13, 9, 15, 21, 17, 36, 19, 72],
          "text-allow-overlap": false, "text-ignore-placement": false,
        },
        paint: { "text-color": "#c0ffc0", "text-halo-color": "#000000", "text-halo-width": 2, "text-opacity": 0.9 },
      })
    }
  }

  function ensureLayer(srcId: string, layerId: string, type: string, paint: any, layout: any, data: any[]) {
    if (!map) return
    if (map.getSource(srcId)) {
      (map.getSource(srcId) as mapboxgl.GeoJSONSource).setData({ type: "FeatureCollection", features: data })
    } else {
      map.addSource(srcId, { type: "geojson", data: { type: "FeatureCollection", features: data } })
    }
    if (!map.getLayer(layerId)) {
      map.addLayer({ id: layerId, type, source: srcId, paint, layout })
    }
  }

  onMount(() => {
    mapboxgl.accessToken = PUBLIC_MAPBOX_ACCESS_TOKEN
    map = new mapboxgl.Map({
      container: mapContainer,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [116.2, -30.7], zoom: 12,
      attributionControl: false,
    })
    // Keep Mapbox's internal canvas size in sync with the container.
    // Without this, layout changes (e.g. sidebar width changing) leave the map
    // using a stale size, which throws off fitBounds calculations badly
    // (fields can appear tiny/panned far away because the projection math
    // is based on the wrong viewport dimensions).
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        map?.resize()
      })
      resizeObserver.observe(mapContainer)
    }
    // Click handlers for interactive consolidated preview
    if (interactive) {
      ["dom-skan-fill", "fg-sel-fill", "agskan-fill"].forEach(l => {
        map!.on("click", l, (e) => {
          const id = e.features?.[0]?.properties?.id
          if (id) dispatch("selectField", { id })
        })
        map!.on("mouseenter", l, () => { map!.getCanvas().style.cursor = "pointer" })
        map!.on("mouseleave", l, () => { map!.getCanvas().style.cursor = "" })
      })
    }
    map.on("load", () => {
      mapReady = true
      updateAllLayers()
      if (interactive && !overviewDone) {
        overviewDone = true
        setTimeout(async () => {
          if (!map || agskanFields.length === 0) return
          const turf = await import("@turf/turf")
          const bounds = new mapboxgl.LngLatBounds()
          for (const f of agskanFields) {
            if (f.boundary?.type) {
              try {
                const feat = { type: "Feature", geometry: f.boundary, properties: {} }
                const bbox = turf.bbox(feat)
                bounds.extend([bbox[0], bbox[1]])
                bounds.extend([bbox[2], bbox[3]])
              } catch {}
            }
          }
          if (!bounds.isEmpty()) {
            const pad = Math.min(80, Math.floor(Math.min(mapContainer.clientWidth, mapContainer.clientHeight) * 0.12))
            map.fitBounds(bounds, { padding: pad, maxZoom: 15, duration: 500 })
          }
        }, 300)
      }
    })
  })

  onDestroy(() => {
    resizeObserver?.disconnect()
    map?.remove()
  })
</script>

<div class="relative" style="height:{height}">
  <div bind:this={mapContainer} class="consolidation-map" style="height:100%"></div>
</div>

<style>
  .consolidation-map { border-radius: 12px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1); width: 100%; }
  :global(.consolidation-map .mapboxgl-ctrl-top-right) { top: 8px; right: 8px; }
</style>
