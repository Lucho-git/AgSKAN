<!-- src/routes/(admin)/account/(menu)/admin/global-map/+page.svelte -->
<!-- Admin global farm map: every client farm on one map. Zoomed out, each farm
     is a bubble (sized by mapped hectares, coloured by recent activity) that
     clusters with its neighbours; zoomed in, the field boundaries take over on
     satellite imagery. Test maps and copies of other maps are hidden unless
     asked for — see admin_global_map_farms() for how they're picked out. -->
<script lang="ts">
  import { onMount, onDestroy, tick } from "svelte"
  import mapboxgl from "mapbox-gl"
  import "mapbox-gl/dist/mapbox-gl.css"
  import { PUBLIC_MAPBOX_ACCESS_TOKEN } from "$env/static/public"
  import Icon from "@iconify/svelte"
  import { toast } from "svelte-sonner"
  import {
    adminApi,
    type GlobalFarm,
    type GlobalFarmVehicle,
    type GlobalMapField,
  } from "$lib/api/adminApi"
  import GlobalFarmDetail from "$lib/components/admin/GlobalFarmDetail.svelte"
  import { timeAgo } from "$lib/utils/adminFormat"
  import {
    STATUS_META,
    STATUS_ORDER,
    farmColor,
    farmStatus,
    formatHa,
    spreadKm,
    type FarmStatus,
  } from "$lib/utils/globalFarmMap"

  type SortKey = "area" | "recent" | "team"

  const DAY_MS = 24 * 60 * 60 * 1000
  const glass =
    "border border-white/10 bg-black/75 shadow-xl backdrop-blur-xl"

  let mapContainer: HTMLDivElement
  let map: mapboxgl.Map | null = null
  let mapReady = false
  let hoverPopup: mapboxgl.Popup | null = null
  let resizeObserver: ResizeObserver | null = null

  let farms: GlobalFarm[] = []
  let fieldsRaw: GlobalMapField[] = []
  let loading = true
  let loadingFields = false
  let errorMessage = ""
  let initialViewDone = false

  let showTest = false
  let statusFilter: FarmStatus | null = null
  let searchQuery = ""
  let sortBy: SortKey = "area"
  let listOpen = true
  let selectedId: string | null = null
  let savingFlag = false

  // ── Derived data ──────────────────────────────────────────────────────────
  $: farmsById = new Map(farms.map((f) => [f.id, f]))
  $: testCount = farms.filter((f) => f.is_test).length
  // Everything the totals describe: real clients, plus test maps when shown.
  $: baseFarms = farms.filter((f) => showTest || !f.is_test)
  // What the map and list draw: the above, narrowed by the activity filter.
  $: mapFarms = statusFilter
    ? baseFarms.filter((f) => farmStatus(f) === statusFilter)
    : baseFarms
  $: selectedFarm = selectedId ? (farmsById.get(selectedId) ?? null) : null

  $: statusCounts = STATUS_ORDER.map((status) => ({
    status,
    count: baseFarms.filter((f) => farmStatus(f) === status).length,
  }))

  $: listFarms = mapFarms
    .filter((f) => {
      const q = searchQuery.trim().toLowerCase()
      if (!q) return true
      return (
        (f.map_name || "").toLowerCase().includes(q) ||
        (f.owner_name || "").toLowerCase().includes(q) ||
        (f.owner_email || "").toLowerCase().includes(q) ||
        (f.company_name || "").toLowerCase().includes(q) ||
        f.members.some((m) => (m.name || "").toLowerCase().includes(q))
      )
    })
    .sort((a, b) => {
      if (sortBy === "recent") {
        return (
          new Date(b.last_activity || 0).getTime() -
          new Date(a.last_activity || 0).getTime()
        )
      }
      if (sortBy === "team") return b.member_count - a.member_count
      return b.hectares - a.hectares || b.member_count - a.member_count
    })

  $: totals = {
    farms: baseFarms.length,
    located: baseFarms.filter((f) => f.located_by).length,
    mapped: baseFarms.filter((f) => f.field_count > 0).length,
    hectares: baseFarms.reduce((sum, f) => sum + Number(f.hectares || 0), 0),
    fields: baseFarms.reduce((sum, f) => sum + f.field_count, 0),
    people: baseFarms.reduce((sum, f) => sum + f.member_count, 0),
    vehicles: baseFarms.reduce((sum, f) => sum + f.vehicles.length, 0),
    active24h: baseFarms.reduce((sum, f) => sum + f.vehicles_active_24h, 0),
    recording: baseFarms.reduce(
      (sum, f) => sum + f.vehicles.filter((v) => v.recording).length,
      0,
    ),
    spread: spreadKm(baseFarms),
  }

  $: headlineStats = [
    {
      label: "Farms",
      value: totals.farms.toLocaleString("en-AU"),
      note: `${totals.mapped} with fields mapped`,
    },
    {
      label: "Mapped",
      value: formatHa(totals.hectares),
      note: `${totals.fields.toLocaleString("en-AU")} fields`,
    },
    {
      label: "People",
      value: totals.people.toLocaleString("en-AU"),
      note: `${totals.vehicles.toLocaleString("en-AU")} vehicles`,
    },
    {
      label: "Active 24h",
      value: totals.active24h.toLocaleString("en-AU"),
      note: totals.recording
        ? `${totals.recording} recording now`
        : "vehicles reporting",
    },
    {
      label: "Spread",
      value: `${Math.round(totals.spread).toLocaleString("en-AU")} km`,
      note: "between furthest farms",
    },
  ]

  // ── Map data sync ─────────────────────────────────────────────────────────
  $: if (mapReady) syncFarmSources(mapFarms)
  $: if (mapReady) syncFieldFilters(showTest, statusFilter, selectedId)
  $: if (mapReady && !initialViewDone && baseFarms.length) fitAll(false)

  function farmName(farm: GlobalFarm): string {
    return farm.map_name?.trim() || "Unnamed map"
  }

  function syncFarmSources(shown: GlobalFarm[]) {
    if (!map) return
    const now = Date.now()

    const farmFeatures = shown
      .filter((f) => f.lng != null && f.lat != null)
      .map((f) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [f.lng!, f.lat!] },
        properties: {
          id: f.id,
          name: farmName(f),
          ha: Number(f.hectares) || 0,
          s: farmStatus(f, now),
          lb: f.located_by,
          v24: f.vehicles_active_24h,
        },
      }))

    // Vehicle last-known positions (a month back at most), as plain dots.
    const vehicleFeatures = shown.flatMap((f) =>
      f.vehicles
        .filter(
          (v) =>
            v.lng != null &&
            v.lat != null &&
            v.last_update &&
            now - new Date(v.last_update).getTime() < 30 * DAY_MS,
        )
        .map((v) => ({
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [v.lng!, v.lat!] },
          properties: {
            id: v.id,
            farmId: f.id,
            farm: farmName(f),
            name: v.name || "Unnamed",
            ago: v.recording ? "Recording now" : timeAgo(v.last_update),
            s: v.recording
              ? "rec"
              : now - new Date(v.last_update!).getTime() < DAY_MS
                ? "day"
                : "old",
          },
        })),
    )

    setSourceData("farms", farmFeatures)
    setSourceData("vehicles", vehicleFeatures)
  }

  function syncFieldSource() {
    const now = Date.now()
    const features = fieldsRaw.flatMap((f) => {
      const farm = farmsById.get(f.m)
      if (!farm || !f.g) return []
      return [
        {
          type: "Feature" as const,
          geometry: f.g,
          properties: {
            m: f.m,
            n: f.n || "",
            a: Number(f.a) || 0,
            c: farmColor(f.m),
            t: farm.is_test ? 1 : 0,
            s: farmStatus(farm, now),
          },
        },
      ]
    })
    setSourceData("fields", features)
  }

  function setSourceData(id: string, features: any[]) {
    const source = map?.getSource(id) as mapboxgl.GeoJSONSource | undefined
    source?.setData({ type: "FeatureCollection", features } as any)
  }

  function syncFieldFilters(
    withTest: boolean,
    status: FarmStatus | null,
    selected: string | null,
  ) {
    if (!map) return
    const filter: any[] = ["all"]
    if (!withTest) filter.push(["==", ["get", "t"], 0])
    if (status) filter.push(["==", ["get", "s"], status])
    for (const layer of ["fields-fill", "fields-line", "fields-label"]) {
      map.setFilter(layer, filter)
    }
    map.setFilter("fields-selected", ["==", ["get", "m"], selected ?? ""])
    map.setFilter("farm-selected", ["==", ["get", "id"], selected ?? ""])
  }

  // ── Map setup ─────────────────────────────────────────────────────────────
  const statusColorExpr: any = [
    "match",
    ["get", "s"],
    ...STATUS_ORDER.flatMap((s) => [s, STATUS_META[s].color]),
    STATUS_META.dormant.color,
  ]
  const hasFields: any = ["==", ["get", "lb"], "fields"]
  const farmRadius: any = [
    "interpolate",
    ["linear"],
    ["sqrt", ["get", "ha"]],
    0, 6,
    60, 10,
    200, 22,
  ]
  const emptyCollection: any = { type: "FeatureCollection", features: [] }

  function addLayers() {
    if (!map) return
    const firstLabel = map
      .getStyle()
      .layers?.find((layer) => layer.type === "symbol")?.id

    // Satellite fades in as you zoom towards paddock level, under the labels.
    map.addSource("satellite", {
      type: "raster",
      url: "mapbox://mapbox.satellite",
      tileSize: 256,
    })
    map.addLayer(
      {
        id: "satellite",
        type: "raster",
        source: "satellite",
        minzoom: 8,
        paint: {
          "raster-opacity": ["interpolate", ["linear"], ["zoom"], 8, 0, 10.5, 1],
        },
      },
      firstLabel,
    )

    map.addSource("fields", { type: "geojson", data: emptyCollection })
    map.addLayer({
      id: "fields-fill",
      type: "fill",
      source: "fields",
      paint: {
        "fill-color": ["get", "c"],
        "fill-opacity": ["interpolate", ["linear"], ["zoom"], 6, 0.6, 12, 0.3],
      },
    })
    map.addLayer({
      id: "fields-line",
      type: "line",
      source: "fields",
      minzoom: 8,
      paint: {
        "line-color": ["get", "c"],
        "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.4, 13, 1.8],
      },
    })
    map.addLayer({
      id: "fields-selected",
      type: "line",
      source: "fields",
      filter: ["==", ["get", "m"], ""],
      paint: {
        "line-color": "#ffffff",
        "line-width": ["interpolate", ["linear"], ["zoom"], 6, 1, 13, 2.6],
      },
    })
    map.addLayer({
      id: "fields-label",
      type: "symbol",
      source: "fields",
      minzoom: 12.5,
      layout: {
        "text-field": ["get", "n"],
        "text-size": 11,
        "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
        "text-max-width": 7,
      },
      paint: {
        "text-color": "#ffffff",
        "text-halo-color": "rgba(0,0,0,0.8)",
        "text-halo-width": 1.4,
      },
    })

    map.addSource("vehicles", { type: "geojson", data: emptyCollection })
    map.addLayer({
      id: "vehicles",
      type: "circle",
      source: "vehicles",
      minzoom: 8.5,
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 8.5, 2.5, 13, 6],
        "circle-color": [
          "match",
          ["get", "s"],
          "rec", "#22c55e",
          "day", "#fde047",
          "#cbd5e1",
        ],
        "circle-stroke-color": "#0b0f14",
        "circle-stroke-width": 1.5,
      },
    })

    map.addSource("farms", {
      type: "geojson",
      data: emptyCollection,
      cluster: true,
      clusterMaxZoom: 7,
      clusterRadius: 46,
      clusterProperties: { ha: ["+", ["get", "ha"]] },
    })
    map.addLayer({
      id: "clusters",
      type: "circle",
      source: "farms",
      filter: ["has", "point_count"],
      paint: {
        "circle-color": "#17a34a",
        "circle-opacity": 0.4,
        "circle-stroke-color": "#4ade80",
        "circle-stroke-width": 1.5,
        "circle-radius": ["step", ["get", "point_count"], 20, 10, 27, 40, 36, 120, 46],
      },
    })
    map.addLayer({
      id: "cluster-label",
      type: "symbol",
      source: "farms",
      filter: ["has", "point_count"],
      layout: {
        "text-field": [
          "format",
          ["to-string", ["get", "point_count"]],
          { "font-scale": 1.25 },
          "\n",
          {},
          [
            "case",
            [">=", ["get", "ha"], 1000],
            ["concat", ["to-string", ["round", ["/", ["get", "ha"], 1000]]], "k ha"],
            "farms",
          ],
          { "font-scale": 0.75 },
        ],
        "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
        "text-size": 13,
        "text-line-height": 1.1,
        "text-allow-overlap": true,
      },
      paint: { "text-color": "#ffffff" },
    })
    // Farms with fields hand over to their boundaries once you're close;
    // farms known only from vehicle positions stay as hollow rings.
    map.addLayer({
      id: "farm-dot",
      type: "circle",
      source: "farms",
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-radius": farmRadius,
        "circle-color": statusColorExpr,
        "circle-opacity": [
          "interpolate", ["linear"], ["zoom"],
          9, ["case", hasFields, 0.8, 0.2],
          11.5, ["case", hasFields, 0, 0.2],
        ],
        "circle-stroke-color": statusColorExpr,
        "circle-stroke-width": 1.5,
        "circle-stroke-opacity": [
          "interpolate", ["linear"], ["zoom"],
          9, 1,
          11.5, ["case", hasFields, 0, 1],
        ],
      },
    })
    map.addLayer({
      id: "farm-selected",
      type: "circle",
      source: "farms",
      filter: ["==", ["get", "id"], ""],
      paint: {
        "circle-radius": ["+", farmRadius, 4],
        "circle-color": "rgba(0,0,0,0)",
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
        "circle-stroke-opacity": [
          "interpolate", ["linear"], ["zoom"],
          9, 1,
          11.5, ["case", hasFields, 0, 1],
        ],
      },
    })
    map.addLayer({
      id: "farm-label",
      type: "symbol",
      source: "farms",
      filter: ["!", ["has", "point_count"]],
      minzoom: 5.5,
      layout: {
        "text-field": ["get", "name"],
        "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 6, 10, 11, 13],
        "text-variable-anchor": ["top", "bottom", "left", "right"],
        "text-radial-offset": ["interpolate", ["linear"], ["zoom"], 6, 1.3, 11.5, 0.2],
        "text-max-width": 9,
        "symbol-sort-key": ["-", ["get", "ha"]],
      },
      paint: {
        "text-color": "#ffffff",
        "text-halo-color": "rgba(0,0,0,0.85)",
        "text-halo-width": 1.5,
      },
    })
  }

  // Popup content is built with textContent — names come from users.
  function popupNode(title: string, lines: string[]): HTMLElement {
    const node = document.createElement("div")
    const heading = document.createElement("div")
    heading.className = "gfm-popup-title"
    heading.textContent = title
    node.appendChild(heading)
    for (const line of lines) {
      const row = document.createElement("div")
      row.className = "gfm-popup-line"
      row.textContent = line
      node.appendChild(row)
    }
    return node
  }

  function showHover(lngLat: mapboxgl.LngLatLike, title: string, lines: string[]) {
    if (!map) return
    if (!hoverPopup) {
      hoverPopup = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
        className: "gfm-popup",
        offset: 12,
        maxWidth: "260px",
      })
    }
    hoverPopup.setLngLat(lngLat).setDOMContent(popupNode(title, lines)).addTo(map)
  }

  function hideHover() {
    hoverPopup?.remove()
    if (map) map.getCanvas().style.cursor = ""
  }

  function addInteractions() {
    if (!map) return
    const m = map

    m.on("click", "clusters", (e) => {
      const feature = e.features?.[0]
      const clusterId = feature?.properties?.cluster_id
      if (clusterId == null) return
      const source = m.getSource("farms") as mapboxgl.GeoJSONSource
      source.getClusterExpansionZoom(clusterId, (err, zoom) => {
        if (err) return
        m.easeTo({
          center: (feature!.geometry as any).coordinates,
          zoom: zoom + 0.5,
          duration: 700,
        })
      })
    })

    for (const layer of ["farm-dot", "farm-label"]) {
      m.on("click", layer, (e) => {
        const id = e.features?.[0]?.properties?.id
        if (id) selectFarm(id)
      })
    }
    m.on("click", "fields-fill", (e) => {
      // Farm bubbles and vehicles sit on top — let them win the click.
      const above = m.queryRenderedFeatures(e.point, {
        layers: ["farm-dot", "farm-label", "clusters", "vehicles"],
      })
      if (above.length) return
      const id = e.features?.[0]?.properties?.m
      if (id) selectFarm(id, false)
    })
    m.on("click", "vehicles", (e) => {
      const id = e.features?.[0]?.properties?.farmId
      if (id) selectFarm(id, false)
    })

    m.on("mousemove", "farm-dot", (e) => {
      const p = e.features?.[0]?.properties
      const farm = p ? farmsById.get(p.id) : null
      if (!farm) return
      m.getCanvas().style.cursor = "pointer"
      showHover((e.features![0].geometry as any).coordinates, farmName(farm), [
        farm.owner_name || farm.owner_email || "Unknown owner",
        farm.field_count
          ? `${formatHa(farm.hectares)} · ${farm.field_count} fields`
          : "No fields mapped",
        `${farm.member_count} people · ${farm.vehicles.length} vehicles`,
        STATUS_META[farmStatus(farm)].label,
      ])
    })
    m.on("mousemove", "clusters", (e) => {
      const p = e.features?.[0]?.properties
      if (!p) return
      m.getCanvas().style.cursor = "pointer"
      showHover((e.features![0].geometry as any).coordinates, `${p.point_count} farms`, [
        p.ha > 0 ? `${formatHa(p.ha)} mapped` : "No fields mapped",
        "Click to zoom in",
      ])
    })
    m.on("mousemove", "vehicles", (e) => {
      const p = e.features?.[0]?.properties
      if (!p) return
      m.getCanvas().style.cursor = "pointer"
      showHover((e.features![0].geometry as any).coordinates, p.name, [p.farm, p.ago])
    })
    m.on("mousemove", "fields-fill", (e) => {
      const p = e.features?.[0]?.properties
      if (!p) return
      const above = m.queryRenderedFeatures(e.point, {
        layers: ["farm-dot", "clusters", "vehicles"],
      })
      if (above.length) return
      m.getCanvas().style.cursor = "pointer"
      const farm = farmsById.get(p.m)
      showHover(e.lngLat, p.n || "Unnamed field", [
        `${Math.round(p.a).toLocaleString("en-AU")} ha`,
        farm ? farmName(farm) : "",
      ])
    })
    for (const layer of ["farm-dot", "clusters", "vehicles", "fields-fill"]) {
      m.on("mouseleave", layer, hideHover)
    }
  }

  // ── Camera ────────────────────────────────────────────────────────────────
  function cameraPadding() {
    const desktop = window.innerWidth >= 1024
    if (!desktop) {
      return {
        top: 150,
        bottom: selectedId ? Math.round(window.innerHeight * 0.55) : 40,
        left: 30,
        right: 30,
      }
    }
    return {
      top: 110,
      bottom: 50,
      left: listOpen ? 360 : 50,
      right: selectedId ? 430 : 50,
    }
  }

  function fitAll(animate = true) {
    if (!map) return
    const located = baseFarms.filter((f) => f.lng != null && f.lat != null)
    if (!located.length) return
    const bounds = new mapboxgl.LngLatBounds()
    for (const f of located) bounds.extend([f.lng!, f.lat!])
    initialViewDone = true
    map.fitBounds(bounds, {
      padding: cameraPadding(),
      maxZoom: 9,
      duration: animate ? 1200 : 0,
    })
  }

  function focusFarm(farm: GlobalFarm) {
    if (!map) return
    if (farm.bbox) {
      const [x0, y0, x1, y1] = farm.bbox
      map.fitBounds(
        [
          [x0, y0],
          [x1, y1],
        ],
        { padding: cameraPadding(), maxZoom: 14, duration: 1400 },
      )
    } else if (farm.lng != null && farm.lat != null) {
      map.fitBounds(
        [
          [farm.lng, farm.lat],
          [farm.lng, farm.lat],
        ],
        { padding: cameraPadding(), maxZoom: 10.5, duration: 1400 },
      )
    }
  }

  function selectFarm(id: string, fly = true) {
    const farm = farmsById.get(id)
    if (!farm) return
    selectedId = id
    // A farm picked from a "copy of" link may be filtered out — show it.
    if (farm.is_test && !showTest) showTest = true
    if (statusFilter && farmStatus(farm) !== statusFilter) statusFilter = null
    if (window.innerWidth < 1024) listOpen = false
    if (fly) focusFarm(farm)
  }

  function locateVehicle(vehicle: GlobalFarmVehicle) {
    if (!map || vehicle.lng == null || vehicle.lat == null) return
    map.fitBounds(
      [
        [vehicle.lng, vehicle.lat],
        [vehicle.lng, vehicle.lat],
      ],
      { padding: cameraPadding(), maxZoom: 15, duration: 1200 },
    )
  }

  // ── Data loading ──────────────────────────────────────────────────────────
  async function loadFarms(): Promise<boolean> {
    const result = await adminApi.fetchGlobalMapFarms()
    if (!result.success) {
      errorMessage = result.error || "Failed to load farms"
      return false
    }
    errorMessage = ""
    farms = result.data
    return true
  }

  async function loadFields() {
    loadingFields = true
    const total = farms.reduce((sum, f) => sum + f.field_count, 0)
    const result = await adminApi.fetchGlobalMapFields(total)
    loadingFields = false
    if (!result.success) {
      toast.error("Couldn't load field boundaries")
      return
    }
    fieldsRaw = result.data
    await tick()
    whenMapReady(syncFieldSource)
  }

  async function loadAll() {
    loading = true
    const ok = await loadFarms()
    loading = false
    if (ok) await loadFields()
  }

  async function setTestFlag(isTest: boolean | null) {
    if (!selectedFarm) return
    savingFlag = true
    const result = await adminApi.setMapTestFlag(selectedFarm.id, isTest)
    if (result.success && (await loadFarms())) {
      // Flagging one map can change which of its copies count as duplicates.
      await tick()
      syncFieldSource()
      toast.success(
        isTest === null
          ? "Back to automatic"
          : isTest
            ? "Marked as test map"
            : "Marked as real client",
      )
    } else {
      toast.error(result.error || "Failed to update")
    }
    savingFlag = false
  }

  let readyQueue: (() => void)[] = []
  function whenMapReady(fn: () => void) {
    if (mapReady) fn()
    else readyQueue.push(fn)
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && selectedId) selectedId = null
  }

  onMount(() => {
    // On a phone the list would cover the whole map — start with it closed.
    listOpen = window.innerWidth >= 1024

    mapboxgl.accessToken = PUBLIC_MAPBOX_ACCESS_TOKEN
    map = new mapboxgl.Map({
      container: mapContainer,
      style: "mapbox://styles/mapbox/dark-v10",
      center: [134, -27],
      zoom: 3.2,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
    })
    map.touchZoomRotate.disableRotation()
    map.addControl(
      new mapboxgl.NavigationControl({ showCompass: false }),
      "bottom-right",
    )
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right")

    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => map?.resize())
      resizeObserver.observe(mapContainer)
    }

    map.on("load", () => {
      addLayers()
      addInteractions()
      mapReady = true
      readyQueue.forEach((fn) => fn())
      readyQueue = []
    })

    loadAll()
  })

  onDestroy(() => {
    resizeObserver?.disconnect()
    hoverPopup?.remove()
    map?.remove()
    map = null
  })
</script>

<svelte:head>
  <title>Global Farm Map</title>
</svelte:head>

<svelte:window on:keydown={handleKeydown} />

<!-- Full-screen, above the account shell's sidebar and mobile bars. -->
<div class="fixed inset-0 z-[60] overflow-hidden bg-[#0b0f14] font-inter text-white">
  <!-- Mapbox's stylesheet makes its container position:relative, so size it
       from a positioned wrapper rather than with inset-0 on the map itself. -->
  <div class="absolute inset-0">
    <div bind:this={mapContainer} class="h-full w-full"></div>
  </div>

  <!-- Top bar: back + headline stats -->
  <div class="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start gap-2 p-2 sm:p-3">
    <a
      href="/account/admin"
      class="pointer-events-auto flex h-[52px] flex-shrink-0 items-center gap-2 rounded-xl px-3 transition-colors hover:bg-black/90 {glass}"
      title="Back to the admin dashboard"
    >
      <Icon icon="solar:alt-arrow-left-bold-duotone" width="18" height="18" class="text-white/70" />
      <span class="hidden sm:block">
        <span class="block text-sm font-semibold leading-tight">Global Farm Map</span>
        <span class="block text-[10px] leading-tight text-white/50">Admin</span>
      </span>
    </a>

    <div class="pointer-events-auto flex h-[52px] min-w-0 items-stretch overflow-x-auto rounded-xl {glass}">
      {#each headlineStats as stat, i}
        <div class="flex flex-shrink-0 flex-col justify-center px-3 sm:px-4 {i > 0 ? 'border-l border-white/10' : ''}">
          <p class="flex items-baseline gap-1.5">
            <span class="text-base font-semibold leading-none tabular-nums">
              {loading ? "–" : stat.value}
            </span>
            <span class="text-[10px] font-medium uppercase tracking-wider text-white/50">
              {stat.label}
            </span>
          </p>
          <p class="mt-1 whitespace-nowrap text-[10px] leading-none text-white/45">
            {loading ? "Loading…" : stat.note}
          </p>
        </div>
      {/each}
    </div>

    <div class="pointer-events-auto ml-auto flex flex-shrink-0 items-center gap-2">
      {#if loadingFields}
        <span class="hidden items-center gap-2 rounded-xl px-3 py-2 text-xs text-white/70 md:flex {glass}">
          <span class="loading loading-spinner loading-xs"></span>
          Loading field boundaries…
        </span>
      {/if}
      <button
        type="button"
        class="flex h-[52px] w-[52px] items-center justify-center rounded-xl transition-colors hover:bg-black/90 {glass}"
        title="Show every farm"
        on:click={() => fitAll()}
      >
        <Icon icon="solar:earth-bold-duotone" width="20" height="20" class="text-white/80" />
      </button>
    </div>
  </div>

  <!-- Farm list -->
  {#if listOpen}
    <aside
      class="absolute bottom-2 left-2 top-[68px] z-10 flex w-[min(320px,calc(100vw-1rem))] flex-col overflow-hidden rounded-2xl sm:bottom-3 sm:left-3 sm:top-[76px] {glass}"
    >
      <div class="space-y-2 border-b border-white/10 p-3">
        <div class="flex items-center gap-2">
          <div class="relative flex-1">
            <Icon
              icon="solar:magnifer-bold-duotone"
              width="14"
              height="14"
              class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-white/40"
            />
            <input
              type="text"
              placeholder="Search farm, owner or worker…"
              class="w-full rounded-lg border border-white/10 bg-white/5 py-1.5 pl-8 pr-2 text-xs text-white placeholder-white/35 focus:border-white/30 focus:outline-none"
              bind:value={searchQuery}
            />
          </div>
          <button
            type="button"
            class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-white/10"
            title="Hide the farm list"
            on:click={() => (listOpen = false)}
          >
            <Icon icon="solar:sidebar-minimalistic-bold-duotone" width="16" height="16" class="text-white/60" />
          </button>
        </div>

        <!-- Activity legend, doubling as a filter -->
        <div class="flex flex-wrap gap-1">
          {#each statusCounts as { status, count } (status)}
            <button
              type="button"
              aria-pressed={statusFilter === status}
              title="Show only: {STATUS_META[status].label.toLowerCase()}"
              class="flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] transition-colors {statusFilter === status
                ? 'border-white/40 bg-white/15 text-white'
                : 'border-transparent bg-white/5 text-white/65 hover:bg-white/10'}"
              on:click={() => (statusFilter = statusFilter === status ? null : status)}
            >
              <span class="h-2 w-2 rounded-full" style="background: {STATUS_META[status].color}"></span>
              {STATUS_META[status].label}
              <span class="font-semibold tabular-nums text-white/90">{count}</span>
            </button>
          {/each}
        </div>

        <div class="flex items-center justify-between gap-2">
          <label class="flex cursor-pointer items-center gap-2 text-[11px] text-white/65" title="Test maps and copies of other maps are left out of the map and totals unless switched on">
            <input type="checkbox" class="toggle toggle-xs" bind:checked={showTest} />
            Test &amp; duplicate maps
            <span class="font-semibold tabular-nums text-white/85">{testCount}</span>
          </label>
          <select
            bind:value={sortBy}
            class="rounded-md border border-white/10 bg-black/60 px-1.5 py-1 text-[11px] text-white/80 focus:outline-none"
            aria-label="Sort farms"
          >
            <option value="area">Largest</option>
            <option value="recent">Most recent</option>
            <option value="team">Biggest team</option>
          </select>
        </div>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto">
        {#if loading}
          <div class="flex items-center justify-center py-10">
            <span class="loading loading-spinner loading-md text-white/60"></span>
          </div>
        {:else if errorMessage}
          <div class="p-4 text-center">
            <p class="text-xs text-red-300">{errorMessage}</p>
            <button
              type="button"
              class="mt-3 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium hover:bg-white/20"
              on:click={loadAll}
            >
              Try again
            </button>
          </div>
        {:else if listFarms.length === 0}
          <p class="p-6 text-center text-xs text-white/50">No farms match.</p>
        {:else}
          <ul>
            {#each listFarms as farm (farm.id)}
              {@const status = farmStatus(farm)}
              <li>
                <button
                  type="button"
                  class="flex w-full items-center gap-2.5 border-b border-white/5 px-3 py-2 text-left transition-colors hover:bg-white/10 {selectedId === farm.id ? 'bg-white/10' : ''}"
                  on:click={() => selectFarm(farm.id)}
                >
                  <span
                    class="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                    style="background: {STATUS_META[status].color}"
                    title={STATUS_META[status].label}
                  ></span>
                  <span class="min-w-0 flex-1">
                    <span class="flex items-center gap-1.5">
                      <span class="truncate text-xs font-medium">{farmName(farm)}</span>
                      {#if farm.is_test}
                        <span class="flex-shrink-0 rounded bg-amber-400/20 px-1 text-[9px] font-medium uppercase text-amber-300">Test</span>
                      {/if}
                    </span>
                    <span class="block truncate text-[10px] text-white/50">
                      {farm.owner_name || farm.owner_email || "Unknown owner"}
                      · {farm.member_count} {farm.member_count === 1 ? "person" : "people"}
                    </span>
                  </span>
                  <span class="flex-shrink-0 text-right">
                    <span class="block text-xs font-medium tabular-nums {farm.field_count ? '' : 'text-white/35'}">
                      {farm.field_count ? formatHa(farm.hectares) : farm.located_by ? "No fields" : "Not located"}
                    </span>
                    <span class="block text-[10px] tabular-nums text-white/45">
                      {timeAgo(farm.last_activity)}
                    </span>
                  </span>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>

      <p class="border-t border-white/10 px-3 py-2 text-[10px] leading-snug text-white/40">
        {listFarms.length} of {baseFarms.length} farms · bubble size = mapped hectares, hollow = no fields yet
      </p>
    </aside>
  {:else}
    <button
      type="button"
      class="absolute left-2 top-[68px] z-10 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition-colors hover:bg-black/90 sm:left-3 sm:top-[76px] {glass}"
      on:click={() => (listOpen = true)}
    >
      <Icon icon="solar:list-bold-duotone" width="16" height="16" class="text-white/70" />
      Farms
      <span class="tabular-nums text-white/60">{mapFarms.length}</span>
    </button>
  {/if}

  <!-- Farm card -->
  {#if selectedFarm}
    <div
      class="absolute inset-x-2 bottom-2 z-20 flex max-h-[58%] flex-col lg:inset-x-auto lg:bottom-28 lg:right-3 lg:top-[76px] lg:max-h-none lg:w-[380px]"
    >
      <GlobalFarmDetail
        farm={selectedFarm}
        color={farmColor(selectedFarm.id)}
        {savingFlag}
        onClose={() => (selectedId = null)}
        onSelectFarm={(id) => selectFarm(id)}
        onLocateVehicle={locateVehicle}
        onSetTestFlag={setTestFlag}
      />
    </div>
  {/if}
</div>

<style>
  :global(.gfm-popup .mapboxgl-popup-content) {
    background: rgba(0, 0, 0, 0.88);
    color: #fff;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 10px;
    padding: 8px 10px;
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
    pointer-events: none;
  }
  :global(.gfm-popup .mapboxgl-popup-tip) {
    display: none;
  }
  :global(.gfm-popup) {
    pointer-events: none;
  }
  :global(.gfm-popup-title) {
    font-size: 12px;
    font-weight: 600;
  }
  :global(.gfm-popup-line) {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.65);
  }
  :global(.gfm-popup-line:empty) {
    display: none;
  }
</style>
