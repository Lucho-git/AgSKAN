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
  import GlobalFarmEditModal from "$lib/components/admin/GlobalFarmEditModal.svelte"
  import GlobalFarmFieldsModal from "$lib/components/admin/GlobalFarmFieldsModal.svelte"
  import { mapApi } from "$lib/api/mapApi"
  import vehicleIcons from "$lib/vehicles/index.js"
  import { timeAgo } from "$lib/utils/adminFormat"
  import {
    STATUS_META,
    STATUS_ORDER,
    farmColor,
    farmStatus,
    formatHa,
    vehicleIconKey,
    type FarmStatus,
  } from "$lib/utils/globalFarmMap"

  type SortKey = "area" | "recent" | "team"
  /** Collated = farms as clustering bubbles; individual = every field, no clusters. */
  type ViewMode = "collated" | "individual"
  /** What a bubble's size stands for: mapped hectares, or people on the map. */
  type SizeBy = "ha" | "seats"

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
  // Activity bands to show; empty = all of them.
  let statusFilter: FarmStatus[] = []
  let paidOnly = false
  let viewMode: ViewMode = "collated"
  let sizeBy: SizeBy = "ha"
  let searchQuery = ""
  let sortBy: SortKey = "area"
  let listOpen = true
  let selectedId: string | null = null
  let savingFlag = false
  // Edit modal for the selected farm: one of its people, or the map itself.
  let modal: { kind: "person"; id: string } | { kind: "map" } | null = null
  let joining = false
  let fieldsOpen = false

  // ── Derived data ──────────────────────────────────────────────────────────
  $: farmsById = new Map(farms.map((f) => [f.id, f]))
  $: testCount = farms.filter((f) => f.is_test).length
  // Everything the totals describe: real clients, plus test maps when shown.
  $: visibleFarms = farms.filter((f) => showTest || !f.is_test)
  $: paidCount = visibleFarms.filter((f) => f.paid).length
  $: baseFarms = paidOnly ? visibleFarms.filter((f) => f.paid) : visibleFarms
  // What the map and list draw: the above, narrowed by the activity filter.
  $: mapFarms = statusFilter.length
    ? baseFarms.filter((f) => statusFilter.includes(farmStatus(f)))
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
        (f.owner_phone || "").replace(/\s/g, "").includes(q.replace(/\s/g, "")) ||
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
    paying: baseFarms.filter((f) => f.paid).length,
    hectares: baseFarms.reduce((sum, f) => sum + Number(f.hectares || 0), 0),
    fields: baseFarms.reduce((sum, f) => sum + f.field_count, 0),
    people: baseFarms.reduce((sum, f) => sum + f.member_count, 0),
    paidSeats: baseFarms.reduce((sum, f) => sum + (f.paid_seats || 0), 0),
    vehicles: baseFarms.reduce((sum, f) => sum + f.vehicles.length, 0),
    active24h: baseFarms.reduce((sum, f) => sum + f.vehicles_active_24h, 0),
    recording: baseFarms.reduce(
      (sum, f) => sum + f.vehicles.filter((v) => v.recording).length,
      0,
    ),
  }

  $: headlineStats = [
    {
      label: "Farms",
      value: totals.farms.toLocaleString("en-AU"),
      note: `${totals.paying} paying · ${totals.mapped} with fields`,
    },
    {
      label: "Mapped",
      value: formatHa(totals.hectares),
      note: `${totals.fields.toLocaleString("en-AU")} fields`,
    },
    {
      label: "Seats",
      value: totals.people.toLocaleString("en-AU"),
      note: `${totals.paidSeats.toLocaleString("en-AU")} paid for · ${totals.vehicles.toLocaleString("en-AU")} vehicles`,
    },
    {
      label: "Active 24h",
      value: totals.active24h.toLocaleString("en-AU"),
      note: totals.recording
        ? `${totals.recording} recording now`
        : "vehicles reporting",
    },
  ]

  // ── Map data sync ─────────────────────────────────────────────────────────
  $: if (mapReady) rebuildFarmLayers(viewMode, sizeBy)
  $: if (mapReady) syncFarmSources(mapFarms)
  $: if (mapReady) syncFieldFilters(showTest, statusFilter, paidOnly, selectedId)
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
          seats: f.member_count,
          paid: f.paid_seats || 0,
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
            vt: vehicleIconKey(v.type, ICON_KEYS),
            vc: v.color || "Yellow",
            icon: `veh:${vehicleIconKey(v.type, ICON_KEYS)}:${v.color || "Yellow"}`,
            h: Number(v.heading) || 0,
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
    syncVehicleSource(vehicleFeatures)
  }

  // ── Vehicle icons ─────────────────────────────────────────────────────────
  const ICON_KEYS = Object.keys(vehicleIcons)
  const iconRequests = new Map<string, Promise<void>>()
  let vehicleSyncToken = 0

  // Draw a vehicle's Svelte icon into a map image, once per type + colour.
  function ensureVehicleIcon(type: string, color: string): Promise<void> {
    const id = `veh:${type}:${color}`
    let request = iconRequests.get(id)
    if (request) return request
    request = new Promise<void>((resolve) => {
      const host = document.createElement("div")
      host.style.cssText = "position:absolute;left:-9999px;top:0;visibility:hidden"
      document.body.appendChild(host)
      const component = new (vehicleIcons as Record<string, any>)[type]({
        target: host,
        props: { bodyColor: color, size: "128px" },
      })
      const svg = host.querySelector("svg")
      let markup = ""
      if (svg) {
        // The icons are partly styled by component CSS, which an image can't
        // see — copy what the browser resolved onto each shape.
        // Read every shape before writing any: the colours hang off CSS
        // variables on the root, which the first write would wipe.
        const shapes = [svg, ...svg.querySelectorAll("*")]
        const resolved = shapes.map((el) => {
          const cs = getComputedStyle(el)
          return `fill:${cs.fill};stroke:${cs.stroke};stroke-width:${cs.strokeWidth};opacity:${cs.opacity};fill-opacity:${cs.fillOpacity}`
        })
        shapes.forEach((el, i) => el.setAttribute("style", resolved[i]))
        svg.setAttribute("xmlns", "http://www.w3.org/2000/svg")
        svg.removeAttribute("class")
        markup = svg.outerHTML
      }
      component.$destroy()
      host.remove()
      if (!markup) return resolve()
      const image = new Image(128, 128)
      image.onload = () => {
        if (map && !map.hasImage(id)) map.addImage(id, image, { pixelRatio: 2 })
        resolve()
      }
      image.onerror = () => resolve()
      image.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(markup)
    })
    iconRequests.set(id, request)
    return request
  }

  // The icon images have to exist before the layer asks for them.
  async function syncVehicleSource(features: any[]) {
    const token = ++vehicleSyncToken
    const combos = new Map<string, [string, string]>()
    for (const f of features) combos.set(f.properties.icon, [f.properties.vt, f.properties.vc])
    await Promise.all([...combos.values()].map(([type, color]) => ensureVehicleIcon(type, color)))
    if (token === vehicleSyncToken) setSourceData("vehicles", features)
  }

  // Centre of a field's bounding box — where its far-away dot is drawn.
  function fieldCentre(geometry: GlobalMapField["g"]): [number, number] | null {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    const walk = (coords: any) => {
      if (typeof coords[0] === "number") {
        if (coords[0] < x0) x0 = coords[0]
        if (coords[0] > x1) x1 = coords[0]
        if (coords[1] < y0) y0 = coords[1]
        if (coords[1] > y1) y1 = coords[1]
      } else {
        for (const c of coords) walk(c)
      }
    }
    walk(geometry.coordinates || [])
    return Number.isFinite(x0) ? [(x0 + x1) / 2, (y0 + y1) / 2] : null
  }

  function syncFieldSource() {
    const now = Date.now()
    const features: any[] = []
    const dots: any[] = []
    for (const f of fieldsRaw) {
      const farm = farmsById.get(f.m)
      if (!farm || !f.g) continue
      const properties = {
        m: f.m,
        n: f.n || "",
        a: Number(f.a) || 0,
        c: farmColor(f.m),
        t: farm.is_test ? 1 : 0,
        p: farm.paid ? 1 : 0,
        s: farmStatus(farm, now),
      }
      features.push({ type: "Feature", geometry: f.g, properties })
      const centre = fieldCentre(f.g)
      if (centre) {
        dots.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: centre },
          properties,
        })
      }
    }
    setSourceData("fields", features)
    setSourceData("field-dots", dots)
  }

  function setSourceData(id: string, features: any[]) {
    const source = map?.getSource(id) as mapboxgl.GeoJSONSource | undefined
    source?.setData({ type: "FeatureCollection", features } as any)
  }

  function syncFieldFilters(
    withTest: boolean,
    status: FarmStatus[],
    paid: boolean,
    selected: string | null,
  ) {
    if (!map) return
    const filter: any[] = ["all"]
    if (!withTest) filter.push(["==", ["get", "t"], 0])
    if (paid) filter.push(["==", ["get", "p"], 1])
    if (status.length) filter.push(["in", ["get", "s"], ["literal", status]])
    for (const layer of ["fields-fill", "fields-line", "fields-label", "field-dots"]) {
      map.setFilter(layer, filter)
    }
    map.setFilter("fields-selected", ["==", ["get", "m"], selected ?? ""])
    if (map.getLayer("farm-selected")) {
      map.setFilter("farm-selected", ["==", ["get", "id"], selected ?? ""])
    }
  }

  // ── Map setup ─────────────────────────────────────────────────────────────
  const statusColorExpr: any = [
    "match",
    ["get", "s"],
    ...STATUS_ORDER.flatMap((s) => [s, STATUS_META[s].color]),
    STATUS_META.dormant.color,
  ]
  const hasFields: any = ["==", ["get", "lb"], "fields"]
  const FARM_LAYERS = [
    "farm-label", "farm-selected", "farm-paid", "farm-dot",
    "cluster-label", "clusters-paid", "clusters",
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
        // Up close the dot hands over to the vehicle's own icon.
        "circle-opacity": ["interpolate", ["linear"], ["zoom"], 14, 1, 15, 0],
        "circle-stroke-opacity": ["interpolate", ["linear"], ["zoom"], 14, 1, 15, 0],
      },
    })
    // Vehicle icons are pinned to the ground: they halve in size with every
    // zoom level out (drawn about 4x life size so a tractor is still findable),
    // which keeps them from blanketing the map from far away.
    map.addLayer({
      id: "vehicle-icons",
      type: "symbol",
      source: "vehicles",
      minzoom: 13,
      layout: {
        "icon-image": ["get", "icon"],
        "icon-size": ["interpolate", ["exponential", 2], ["zoom"], 12.5, 0.03125, 17.5, 1],
        "icon-rotate": ["get", "h"],
        "icon-rotation-alignment": "map",
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
      paint: {
        "icon-opacity": ["interpolate", ["linear"], ["zoom"], 13.5, 0, 14.5, 1],
      },
    })

    // Far-away stand-in for the boundaries (individual view): one dot per
    // field in its farm's colour, never smaller than a couple of pixels, so a
    // farm reads as a cloud of fields long before the shapes are visible.
    map.addSource("field-dots", { type: "geojson", data: emptyCollection })
    map.addLayer({
      id: "field-dots",
      type: "circle",
      source: "field-dots",
      maxzoom: 11,
      layout: { visibility: "none" },
      paint: {
        "circle-color": ["get", "c"],
        "circle-radius": [
          "interpolate", ["exponential", 2], ["zoom"],
          4, 1.6,
          7, ["max", 1.6, ["*", 0.054, ["sqrt", ["get", "a"]]]],
          10, ["max", 1.6, ["*", 0.434, ["sqrt", ["get", "a"]]]],
        ],
        "circle-opacity": ["interpolate", ["linear"], ["zoom"], 8.5, 0.85, 10.5, 0],
      },
    })
  }

  // The farm bubbles are rebuilt when the view or the size measure changes:
  // clustering is fixed when a source is created, so it can't just be toggled.
  function rebuildFarmLayers(view: ViewMode, size: SizeBy) {
    if (!map) return
    for (const id of FARM_LAYERS) if (map.getLayer(id)) map.removeLayer(id)
    if (map.getSource("farms")) map.removeSource("farms")

    const collated = view === "collated"
    const bySeats = size === "seats"
    // Seats use one scale for farms and merged bubbles alike (area = seats),
    // so the filled disc (seats used) and white ring (seats paid for) compare.
    const seatRadius = (prop: string, min: number): any => [
      "max", min, ["min", 60, ["*", 4.5, ["sqrt", ["get", prop]]]],
    ]
    const farmRadius: any = bySeats
      ? seatRadius("seats", 5)
      : ["interpolate", ["linear"], ["sqrt", ["get", "ha"]], 0, 6, 60, 10, 200, 22]
    const fadeNearFields: any = [
      "interpolate", ["linear"], ["zoom"],
      9, 1,
      11.5, ["case", hasFields, 0, 1],
    ]
    // Individual view leaves farms with fields to their fields — unless the
    // bubbles are showing seats, which the fields can't.
    const dotFilter: any =
      collated || bySeats ? ["!", ["has", "point_count"]] : ["!", hasFields]

    map.addSource("farms", {
      type: "geojson",
      data: emptyCollection,
      cluster: collated,
      clusterMaxZoom: 7,
      clusterRadius: 46,
      clusterProperties: {
        ha: ["+", ["get", "ha"]],
        seats: ["+", ["get", "seats"]],
        paid: ["+", ["get", "paid"]],
      },
    })
    map.setLayoutProperty("field-dots", "visibility", collated ? "none" : "visible")

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
        "circle-radius": bySeats
          ? seatRadius("seats", 16)
          : ["step", ["get", "point_count"], 20, 10, 27, 40, 36, 120, 46],
      },
    })
    if (bySeats) {
      map.addLayer({
        id: "clusters-paid",
        type: "circle",
        source: "farms",
        filter: ["all", ["has", "point_count"], [">", ["get", "paid"], 0]],
        paint: {
          "circle-radius": seatRadius("paid", 0),
          "circle-color": "rgba(0,0,0,0)",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.5,
        },
      })
    }
    map.addLayer({
      id: "cluster-label",
      type: "symbol",
      source: "farms",
      filter: ["has", "point_count"],
      layout: {
        "text-field": bySeats
          ? [
              "format",
              ["to-string", ["get", "seats"]],
              { "font-scale": 1.25 },
              "\n",
              {},
              ["concat", ["to-string", ["get", "paid"]], " paid"],
              { "font-scale": 0.75 },
            ]
          : [
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
      filter: dotFilter,
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
    if (bySeats) {
      map.addLayer({
        id: "farm-paid",
        type: "circle",
        source: "farms",
        filter: ["all", dotFilter, [">", ["get", "paid"], 0]],
        paint: {
          "circle-radius": seatRadius("paid", 0),
          "circle-color": "rgba(0,0,0,0)",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.5,
          "circle-stroke-opacity": fadeNearFields,
        },
      })
    }
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
        "text-field": bySeats
          ? [
              "format",
              ["get", "name"],
              {},
              "\n",
              {},
              [
                "concat",
                ["to-string", ["get", "seats"]],
                " used · ",
                ["to-string", ["get", "paid"]],
                " paid",
              ],
              { "font-scale": 0.8 },
            ]
          : ["get", "name"],
        "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 6, 10, 11, 13],
        "text-variable-anchor": ["top", "bottom", "left", "right"],
        "text-radial-offset": ["interpolate", ["linear"], ["zoom"], 6, 1.3, 11.5, 0.2],
        "text-max-width": 9,
        "symbol-sort-key": ["-", ["get", bySeats ? "seats" : "ha"]],
      },
      paint: {
        "text-color": "#ffffff",
        "text-halo-color": "rgba(0,0,0,0.85)",
        "text-halo-width": 1.5,
      },
    })

    syncFarmSources(mapFarms)
    map.setFilter("farm-selected", ["==", ["get", "id"], selectedId ?? ""])
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
        layers: ["farm-dot", "farm-label", "clusters", "vehicles", "vehicle-icons"],
      })
      if (above.length) return
      const id = e.features?.[0]?.properties?.m
      if (id) selectFarm(id, false)
    })
    for (const layer of ["vehicles", "vehicle-icons"]) {
      m.on("click", layer, (e) => {
        const id = e.features?.[0]?.properties?.farmId
        if (id) selectFarm(id, false)
      })
      m.on("mousemove", layer, (e) => {
        const p = e.features?.[0]?.properties
        if (!p) return
        m.getCanvas().style.cursor = "pointer"
        showHover((e.features![0].geometry as any).coordinates, p.name, [p.farm, p.ago])
      })
    }
    m.on("click", "field-dots", (e) => {
      const above = m.queryRenderedFeatures(e.point, {
        layers: ["farm-dot", "farm-label", "clusters", "vehicles", "vehicle-icons"],
      })
      if (above.length) return
      const id = e.features?.[0]?.properties?.m
      if (id) selectFarm(id, false)
    })
    m.on("mousemove", "field-dots", (e) => {
      const p = e.features?.[0]?.properties
      const farm = p ? farmsById.get(p.m) : null
      if (!farm) return
      m.getCanvas().style.cursor = "pointer"
      showHover(e.lngLat, farmName(farm), [
        `${formatHa(farm.hectares)} · ${farm.field_count} fields`,
        `${farm.member_count} people · ${farm.vehicles.length} vehicles`,
      ])
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
        `${farm.member_count} seats used · ${farm.paid_seats} paid · ${farm.vehicles.length} vehicles`,
        STATUS_META[farmStatus(farm)].label,
      ])
    })
    m.on("mousemove", "clusters", (e) => {
      const p = e.features?.[0]?.properties
      if (!p) return
      m.getCanvas().style.cursor = "pointer"
      showHover((e.features![0].geometry as any).coordinates, `${p.point_count} farms`, [
        p.ha > 0 ? `${formatHa(p.ha)} mapped` : "No fields mapped",
        `${p.seats} seats used · ${p.paid} paid`,
        "Click to zoom in",
      ])
    })
    m.on("mousemove", "fields-fill", (e) => {
      const p = e.features?.[0]?.properties
      if (!p) return
      const above = m.queryRenderedFeatures(e.point, {
        layers: ["farm-dot", "clusters", "vehicles", "vehicle-icons"],
      })
      if (above.length) return
      m.getCanvas().style.cursor = "pointer"
      const farm = farmsById.get(p.m)
      showHover(e.lngLat, p.n || "Unnamed field", [
        `${Math.round(p.a).toLocaleString("en-AU")} ha`,
        farm ? farmName(farm) : "",
      ])
    })
    for (const layer of ["farm-dot", "clusters", "vehicles", "vehicle-icons", "fields-fill", "field-dots"]) {
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
    if (id !== selectedId) {
      modal = null
      fieldsOpen = false
    }
    selectedId = id
    // A farm picked from a "copy of" link may be filtered out — show it.
    if (farm.is_test && !showTest) showTest = true
    if (paidOnly && !farm.paid) paidOnly = false
    if (statusFilter.length && !statusFilter.includes(farmStatus(farm))) statusFilter = []
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
      { padding: cameraPadding(), maxZoom: 16.5, duration: 1200 },
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

  async function renameMap(name: string): Promise<boolean> {
    if (!selectedFarm) return false
    const result = await adminApi.updateMapName(selectedFarm.id, name)
    if (!result.success) {
      toast.error(result.error || "Failed to rename the map")
      return false
    }
    await loadFarms()
    toast.success("Map renamed")
    return true
  }

  async function saveMember(change: {
    id: string
    name?: string
    role?: string
    vehicle?: { type: string; bodyColor: string }
  }): Promise<boolean> {
    if (!selectedFarm) return false
    const mapId = selectedFarm.id
    const failures: string[] = []
    if (change.name) {
      const r = await adminApi.updateMemberName(change.id, change.name)
      if (!r.success) failures.push(r.error || "name")
    }
    if (change.role) {
      const r = await adminApi.updateMemberRole(change.id, change.role)
      if (!r.success) failures.push(r.error || "account type")
    }
    if (change.vehicle) {
      const r = await adminApi.updateVehicleMarker(mapId, change.id, change.vehicle)
      if (!r.success) failures.push(r.error || "vehicle")
    }
    await loadFarms()
    if (failures.length) {
      toast.error(`Couldn't save: ${failures.join(", ")}`)
      return false
    }
    toast.success("Saved")
    return true
  }

  async function makeOwner(memberId: string): Promise<boolean> {
    if (!selectedFarm) return false
    const result = await adminApi.transferOwnership(selectedFarm.id, memberId)
    if (!result.success) {
      toast.error(result.error || "Failed to transfer ownership")
      return false
    }
    await loadFarms()
    toast.success("Ownership transferred")
    return true
  }

  // Put the admin's own account on this farm's map and open it in the viewer.
  // A full page load lets the account layout set everything up for the new map.
  async function joinMap() {
    if (!selectedFarm || joining) return
    joining = true
    const result: any = await mapApi.connectToMap(selectedFarm.id)
    if (result?.success) {
      window.location.href = "/account/mapviewer"
      return
    }
    joining = false
    toast.error(result?.error || result?.message || "Couldn't join this map")
  }

  // The field editor changed this farm's fields: refresh its numbers and
  // redraw the boundaries.
  async function closeFields(changed: boolean) {
    fieldsOpen = false
    if (!changed) return
    if (await loadFarms()) await loadFields()
  }

  let readyQueue: (() => void)[] = []
  function whenMapReady(fn: () => void) {
    if (mapReady) fn()
    else readyQueue.push(fn)
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key !== "Escape") return
    if (fieldsOpen) return // the field editor closes itself
    if (modal) modal = null
    else if (selectedId) selectedId = null
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
              aria-pressed={statusFilter.includes(status)}
              title="{STATUS_META[status].hint} — pick any number to show together"
              class="flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] transition-colors {statusFilter.includes(status)
                ? 'border-white/40 bg-white/15 text-white'
                : 'border-transparent bg-white/5 text-white/65 hover:bg-white/10'}"
              on:click={() =>
                (statusFilter = statusFilter.includes(status)
                  ? statusFilter.filter((s) => s !== status)
                  : [...statusFilter, status])}
            >
              <span class="h-2 w-2 rounded-full" style="background: {STATUS_META[status].color}"></span>
              {STATUS_META[status].label}
              <span class="font-semibold tabular-nums text-white/90">{count}</span>
            </button>
          {/each}
          <button
            type="button"
            aria-pressed={paidOnly}
            title="Show only farms on a paid plan"
            class="flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] transition-colors {paidOnly
              ? 'border-emerald-300/60 bg-emerald-400/20 text-white'
              : 'border-transparent bg-white/5 text-white/65 hover:bg-white/10'}"
            on:click={() => (paidOnly = !paidOnly)}
          >
            <Icon icon="solar:dollar-minimalistic-bold-duotone" width="11" height="11" class="text-emerald-300" />
            Paying
            <span class="font-semibold tabular-nums text-white/90">{paidCount}</span>
          </button>
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
        {listFarms.length} of {baseFarms.length} farms · {sizeBy === "seats" ? "bubble = seats used, white ring = seats paid for" : "bubble size = mapped hectares, hollow = no fields yet"}
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

  <!-- View switches: collated bubbles vs individual fields, and what bubble size means -->
  <div class="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center px-14">
    <div class="pointer-events-auto flex flex-wrap items-center justify-center gap-2">
      <div class="flex rounded-xl p-1 text-xs font-medium {glass}" role="group" aria-label="Map view">
        {#each [{ id: "collated", label: "Collated", icon: "solar:record-circle-bold-duotone", tip: "Farms as bubbles that merge with their neighbours" }, { id: "individual", label: "Individual", icon: "solar:widget-4-bold-duotone", tip: "Every field from far away, no merging" }] as option (option.id)}
          <button
            type="button"
            aria-pressed={viewMode === option.id}
            title={option.tip}
            class="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 transition-colors {viewMode === option.id
              ? 'bg-white/20 text-white'
              : 'text-white/60 hover:bg-white/10'}"
            on:click={() => (viewMode = option.id === "individual" ? "individual" : "collated")}
          >
            <Icon icon={option.icon} width="14" height="14" />
            {option.label}
          </button>
        {/each}
      </div>
      <div class="flex rounded-xl p-1 text-xs font-medium {glass}" role="group" aria-label="Bubble size">
        {#each [{ id: "ha", label: "Hectares", tip: "Size bubbles by mapped hectares" }, { id: "seats", label: "Seats", tip: "Bubbles show seats used (people on the map) with a white ring for seats paid for" }] as option (option.id)}
          <button
            type="button"
            aria-pressed={sizeBy === option.id}
            title={option.tip}
            class="rounded-lg px-2.5 py-1.5 transition-colors {sizeBy === option.id
              ? 'bg-white/20 text-white'
              : 'text-white/60 hover:bg-white/10'}"
            on:click={() => (sizeBy = option.id === "seats" ? "seats" : "ha")}
          >
            {option.label}
          </button>
        {/each}
      </div>
    </div>
  </div>

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
        onSetTestFlag={setTestFlag}
        onEditMap={() => (modal = { kind: "map" })}
        onEditPerson={(id) => (modal = { kind: "person", id })}
        onJoinMap={joinMap}
        {joining}
        onEditFields={() => (fieldsOpen = true)}
      />
    </div>
  {/if}

  {#if selectedFarm && fieldsOpen}
    <GlobalFarmFieldsModal farm={selectedFarm} onClose={closeFields} />
  {/if}

  {#if selectedFarm && modal}
    <GlobalFarmEditModal
      farm={selectedFarm}
      mode={modal}
      onClose={() => (modal = null)}
      onLocateVehicle={locateVehicle}
      onRenameMap={renameMap}
      onSaveMember={saveMember}
      onMakeOwner={makeOwner}
    />
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
