<!-- src/lib/components/map/ConsolidationMap.svelte -->
<!-- Interactive map for AgSKAN ↔ Agworld field consolidation -->
<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from "svelte"
  import mapboxgl from "mapbox-gl"
  import { PUBLIC_MAPBOX_ACCESS_TOKEN } from "$env/static/public"

  export let agskanFields: any[] = []
  export let agworldBoundaries: any[] = []
  export let linkedFields: Map<string, string> = new Map()
  export let focusField: { id: string; source: "agskan" | "agworld" } | null = null
  export let highlightFieldId: string | null = null
  export let selectedFieldIds: string[] = []
  export let inspectorMode = false
  export let height = 500

  const dispatch = createEventDispatcher()

  let mapContainer: HTMLDivElement
  let map: mapboxgl.Map | null = null
  let mapReady = false

  export let overlapCandidates: Array<{
    id: string; name: string; source: "agskan" | "agworld"
    overlapPct: number; areaHa: number; selected: boolean
  }> = []

  $: if (mapReady) { agskanFields.length; agworldBoundaries.length; linkedFields.size; focusField; highlightFieldId; selectedFieldIds; updateAllLayers() }

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
          existing.areaHa = Math.round(fArea / 100) / 10
        }
        continue
      }

      const alreadyLinked =
        focusSource === "agskan"
          ? linkedFields.get(focusId) === fid
          : Array.from(linkedFields.entries()).some(([k, v]) => v === focusId && k === fid)

      // Only include if overlap > 1% OR it is the linked counterpart
      if (overlapPct > 1 || alreadyLinked) {
        candidates.push({
          id: fid, name: fname, source: fSource,
          overlapPct: Math.round(overlapPct),
          areaHa: Math.round(fArea / 100) / 10,
          selected: !!alreadyLinked,
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
        const bbox = turf.bbox({ type: "Feature", geometry: geom, properties: {} })
        map.fitBounds(bbox as [number, number, number, number], { padding: 80, maxZoom: 17 })
      } catch { /* skip */ }
    }
  }

  function clearFocus() { setFocus(null, null) }

  function updateAllLayers() {
    if (!map) return
    const focused = focusField

    // When focused, only show relevant fields
    const relevantSkanIds = new Set<string>()
    const relevantAwIds = new Set<string>()
    if (focused) {
      if (focused.source === "agskan") relevantSkanIds.add(focused.id)
      else relevantAwIds.add(focused.id)
      for (const c of overlapCandidates) {
        if (c.source === "agskan") relevantSkanIds.add(c.id)
        else relevantAwIds.add(c.id)
      }
    }

    const skanFeatures = agskanFields.filter(f => f.boundary?.type && (!focused || relevantSkanIds.has(f.field_id))).map(f => {
      const isFocused = focused?.source === "agskan" && focused.id === f.field_id
      const isLinked = linkedFields.has(f.field_id)
      const isHighlighted = highlightFieldId === f.field_id || selectedFieldIds.includes(f.field_id)
      return { type: "Feature", geometry: f.boundary, properties: {
        id: f.field_id, name: f.name, source: "agskan",
        opacity: isFocused ? 1 : isHighlighted ? 0.7 : isLinked ? 0.5 : 0.15,
        fillColor: isFocused ? "#00ff88" : isHighlighted ? "#ffcc00" : "#0080ff",
        lineColor: isFocused ? "#00ff88" : isHighlighted ? "#ffcc00" : isLinked ? "#bfffbf" : "#4466aa",
        lineWidth: isFocused ? 4 : isHighlighted ? 3 : isLinked ? 2 : 1,
        olPct: 0,
      }}
    })

    const awFeatures = agworldBoundaries.filter(b => b.boundary?.type && (!focused || relevantAwIds.has(b.field_id || b.id))).map(b => {
      const fid = b.field_id || b.id
      const isFocused = focused?.source === "agworld" && focused.id === fid
      const isLinked = Array.from(linkedFields.values()).includes(fid)
      const isHighlighted = highlightFieldId === fid || selectedFieldIds.includes(fid)
      return { type: "Feature", geometry: b.boundary, properties: {
        id: fid, name: b.name, source: "agworld",
        opacity: isFocused ? 1 : isHighlighted ? 0.7 : isLinked ? 0.5 : 0.15,
        fillColor: isFocused ? "#00ff88" : isHighlighted ? "#ffcc00" : "#ff8040",
        lineColor: isFocused ? "#00ff88" : isHighlighted ? "#ffcc00" : isLinked ? "#ffb080" : "#886644",
        lineWidth: isFocused ? 4 : isHighlighted ? 3 : isLinked ? 2 : 1,
        olPct: 0,
      }}
    })

    ensureLayer("agskan-fields", "agskan-fill", "fill",
      { "fill-color": ["get", "fillColor"], "fill-opacity": ["get", "opacity"] }, {}, skanFeatures)
    ensureLayer("agskan-fields", "agskan-outline", "line",
      { "line-color": ["get", "lineColor"], "line-width": ["get", "lineWidth"] },
      {}, skanFeatures) // line-dasharray can't use data expressions, so skip it
    ensureLayer("agskan-fields", "agskan-labels", "symbol",
      { "text-color": "#ccddff", "text-halo-color": "#000000", "text-halo-width": 1.5 },
      { "text-field": ["get", "name"], "text-size": 10, "text-anchor": "center" }, skanFeatures)

    ensureLayer("agworld-fields", "agworld-fill", "fill",
      { "fill-color": ["get", "fillColor"], "fill-opacity": ["get", "opacity"] }, {}, awFeatures)
    ensureLayer("agworld-fields", "agworld-outline", "line",
      { "line-color": ["get", "lineColor"], "line-width": ["get", "lineWidth"] },
      {}, awFeatures)
    ensureLayer("agworld-fields", "agworld-labels", "symbol",
      { "text-color": "#ffaa66", "text-halo-color": "#000000", "text-halo-width": 1.5 },
      { "text-field": ["get", "name"], "text-size": 10, "text-anchor": "center" }, awFeatures)

    // Overlap % labels
    if (focused && overlapCandidates.length > 0) {
      const olFeats = [...skanFeatures, ...awFeatures].filter((f: any) => f.properties.olPct > 0)
      if (map.getLayer("overlap-pct-labels")) map.removeLayer("overlap-pct-labels")
      if (map.getSource("overlap-pct-src")) (map.getSource("overlap-pct-src") as mapboxgl.GeoJSONSource).setData({ type: "FeatureCollection", features: olFeats })
      else map.addSource("overlap-pct-src", { type: "geojson", data: { type: "FeatureCollection", features: olFeats } })
      map.addLayer({
        id: "overlap-pct-labels", type: "symbol", source: "overlap-pct-src",
        layout: { "text-field": ["to-string", ["get", "olPct"]], "text-size": 12, "text-anchor": "top", "text-offset": [0, 0.4] },
        paint: { "text-color": "#ffcc00", "text-halo-color": "#000000", "text-halo-width": 2 },
      })
    } else {
      if (map.getLayer("overlap-pct-labels")) map.removeLayer("overlap-pct-labels")
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
    map.addControl(new mapboxgl.NavigationControl(), "top-right")

    map.on("click", "agskan-fill", (e) => {
      const id = e.features?.[0]?.properties?.id
      if (id) {
        if (inspectorMode) dispatch("toggleCandidate", { id, source: "agskan" })
        else { setFocus(id, "agskan"); dispatch("selectField", { id, source: "agskan" }) }
      }
    })
    map.on("click", "agworld-fill", (e) => {
      const id = e.features?.[0]?.properties?.id
      if (id) {
        if (inspectorMode) dispatch("toggleCandidate", { id, source: "agworld" })
        else { setFocus(id, "agworld"); dispatch("selectField", { id, source: "agworld" }) }
      }
    })
    ;["agskan-fill", "agworld-fill"].forEach(l => {
      map!.on("mouseenter", l, () => { map!.getCanvas().style.cursor = "pointer" })
      map!.on("mouseleave", l, () => { map!.getCanvas().style.cursor = "" })
    })
    map.on("click", (e) => {
      const feats = map!.queryRenderedFeatures(e.point, { layers: ["agskan-fill", "agworld-fill"] })
      if (feats.length === 0) { clearFocus(); dispatch("selectField", { id: null, source: null }) }
    })
    map.on("load", () => { mapReady = true; updateAllLayers() })
  })

  onDestroy(() => { map?.remove() })
</script>

<div bind:this={mapContainer} class="consolidation-map" style="height:{height}px"></div>

<style>
  .consolidation-map { border-radius: 12px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1); }
  :global(.consolidation-map .mapboxgl-ctrl-top-right) { top: 8px; right: 8px; }
</style>
