<script lang="ts">
  import { onMount, onDestroy, getContext } from "svelte"
  import { supabase } from "$lib/supabaseClient"
  import { profileStore } from "$lib/stores/profileStore"
  import { markerVisibilityStore } from "$lib/stores/markerVisibilityStore"
  import * as mapboxgl from "mapbox-gl"

  export let map: mapboxgl.Map
  export let currentMarkerId: string | null = null

  const mapContext = getContext("map")

  let isDestroyed = false
  let drawings = []
  let unsubscribe = null

  interface MarkerDrawing {
    id: string
    marker_id: string
    drawing_type: "polygon" | "line"
    geometry: any
    style: {
      fillColor: string
      strokeColor: string
      fillOpacity: number
      strokeWidth: number
      strokeStyle?: string
    }
    map_markers?: {
      deleted: boolean
    }
  }

  function canUseMap(): boolean {
    return !isDestroyed && map && map.getLayer && map.getSource
  }

  function createDrawingsGeoJSON(drawings: MarkerDrawing[]) {
    return {
      type: "FeatureCollection",
      features: drawings.map((drawing) => ({
        type: "Feature",
        id: drawing.id,
        geometry: drawing.geometry,
        properties: {
          id: drawing.id,
          marker_id: drawing.marker_id,
          drawing_type: drawing.drawing_type,
          fillColor: drawing.style.fillColor,
          strokeColor: drawing.style.strokeColor,
          fillOpacity: drawing.style.fillOpacity,
          strokeWidth: drawing.style.strokeWidth,
          strokeStyle: drawing.style.strokeStyle || "solid",
        },
      })),
    }
  }

  function addDrawingLayers() {
    if (!map || !mapContext?.addLayerOrdered) {
      console.warn("Map or layer ordering context not available")
      return
    }

    try {
      // Fill layer for polygons
      mapContext.addLayerOrdered({
        id: "marker-drawings-fill",
        type: "fill",
        source: "marker-drawings",
        filter: ["==", ["get", "drawing_type"], "polygon"],
        paint: {
          "fill-color": ["get", "fillColor"],
          "fill-opacity": ["get", "fillOpacity"],
        },
      })

      // Solid line layer - with zoom-dependent width
      mapContext.addLayerOrdered({
        id: "marker-drawings-line-solid",
        type: "line",
        source: "marker-drawings",
        filter: ["==", ["get", "strokeStyle"], "solid"],
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-color": ["get", "strokeColor"],
          "line-width": [
            "interpolate",
            ["exponential", 2],
            ["zoom"],
            10,
            ["*", ["get", "strokeWidth"], ["^", 2, -6]],
            24,
            ["*", ["get", "strokeWidth"], ["^", 2, 8]],
          ],
          "line-opacity": 1.0,
        },
      })

      // Dashed line layer - with zoom-dependent width
      mapContext.addLayerOrdered({
        id: "marker-drawings-line-dashed",
        type: "line",
        source: "marker-drawings",
        filter: ["==", ["get", "strokeStyle"], "dashed"],
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-color": ["get", "strokeColor"],
          "line-width": [
            "interpolate",
            ["exponential", 2],
            ["zoom"],
            10,
            ["*", ["get", "strokeWidth"], ["^", 2, -6]],
            24,
            ["*", ["get", "strokeWidth"], ["^", 2, 8]],
          ],
          "line-opacity": 1.0,
          "line-dasharray": [2, 2],
        },
      })
    } catch (error) {
      console.error("Error adding drawing layers:", error)
    }
  }

  function getVisibleDrawings(allDrawings: MarkerDrawing[]) {
    return allDrawings.filter((drawing) => {
      const visibility = $markerVisibilityStore[drawing.marker_id] || "always"
      if (visibility === "always") return true
      return drawing.marker_id === currentMarkerId
    })
  }

  function updateMapDrawings() {
    if (!canUseMap()) return

    try {
      const visibleDrawings = getVisibleDrawings(drawings)
      const drawingsGeojson = createDrawingsGeoJSON(visibleDrawings)
      const drawingsSource = map.getSource(
        "marker-drawings",
      ) as mapboxgl.GeoJSONSource

      if (drawingsSource) {
        drawingsSource.setData(drawingsGeojson)
      }
    } catch (error) {
      console.error("Error updating map drawings:", error)
    }
  }

  async function loadDrawings() {
    if (!map || !mapContext?.addLayerOrdered) {
      console.warn("Map or layer ordering context not available")
      return
    }

    try {
      const masterMapId = $profileStore.master_map_id
      if (!masterMapId) {
        console.warn("No master_map_id available")
        return
      }

      const { data, error } = await supabase
        .from("marker_drawings")
        .select(
          `
          *,
          geometry:geometry_geojson,
          map_markers(deleted)
        `,
        )
        .eq("master_map_id", masterMapId)
        .or("deleted.is.null,deleted.eq.false")
        .order("created_at", { ascending: true })

      if (error) {
        console.error("Error loading marker drawings:", error)
        return
      }

      // Filter out drawings where drawing.deleted=true OR marker.deleted=true
      drawings = (data || [])
        .filter((d) => d.map_markers && !d.map_markers.deleted)
        .map((d) => {
          let parsedGeometry = d.geometry
          if (typeof d.geometry === "string") {
            try {
              parsedGeometry = JSON.parse(d.geometry)
            } catch (e) {
              console.error("Failed to parse geometry for drawing:", d.id, e)
              return null
            }
          }
          return { ...d, geometry: parsedGeometry }
        })
        .filter((d) => d !== null)

      const visibleDrawings = getVisibleDrawings(drawings)
      const drawingsGeojson = createDrawingsGeoJSON(visibleDrawings)

      if (!map.getSource("marker-drawings")) {
        map.addSource("marker-drawings", {
          type: "geojson",
          data: drawingsGeojson,
        })
        addDrawingLayers()
      } else {
        const drawingsSource = map.getSource(
          "marker-drawings",
        ) as mapboxgl.GeoJSONSource
        drawingsSource.setData(drawingsGeojson)
      }

      if (!unsubscribe) {
        subscribeToDrawingUpdates()
      }
    } catch (error) {
      console.error("Error loading marker drawings:", error)
    }
  }

  function subscribeToDrawingUpdates() {
    const masterMapId = $profileStore.master_map_id
    if (!masterMapId) return

    // Subscribe to drawing changes
    const drawingsChannel = supabase
      .channel("marker-drawings-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "marker_drawings",
          filter: `master_map_id=eq.${masterMapId}`,
        },
        () => refreshDrawings(),
      )
      .subscribe()

    // Subscribe to marker changes (to catch deletions instantly)
    const markersChannel = supabase
      .channel("markers-changes-for-drawings")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "map_markers",
          filter: `master_map_id=eq.${masterMapId}`,
        },
        () => refreshDrawings(),
      )
      .subscribe()

    unsubscribe = () => {
      supabase.removeChannel(drawingsChannel)
      supabase.removeChannel(markersChannel)
    }
  }

  async function refreshDrawings() {
    if (!canUseMap()) return

    try {
      const masterMapId = $profileStore.master_map_id
      if (!masterMapId) return

      const { data, error } = await supabase
        .from("marker_drawings")
        .select(
          `
          *,
          geometry:geometry_geojson,
          map_markers(deleted)
        `,
        )
        .eq("master_map_id", masterMapId)
        .or("deleted.is.null,deleted.eq.false")
        .order("created_at", { ascending: true })

      if (error) {
        console.error("Error refreshing marker drawings:", error)
        return
      }

      // Filter out drawings where drawing.deleted=true OR marker.deleted=true
      drawings = (data || [])
        .filter((d) => d.map_markers && !d.map_markers.deleted)
        .map((d) => {
          let parsedGeometry = d.geometry
          if (typeof d.geometry === "string") {
            try {
              parsedGeometry = JSON.parse(d.geometry)
            } catch (e) {
              console.error("Failed to parse geometry for drawing:", d.id, e)
              return null
            }
          }
          return { ...d, geometry: parsedGeometry }
        })
        .filter((d) => d !== null)

      updateMapDrawings()
    } catch (error) {
      console.error("Error refreshing marker drawings:", error)
    }
  }

  $: if (currentMarkerId !== undefined || $markerVisibilityStore) {
    updateMapDrawings()
  }

  function cleanup() {
    isDestroyed = true
    if (unsubscribe) {
      unsubscribe()
      unsubscribe = null
    }
  }

  onMount(() => {
    if (!map) {
      console.error("Map is not available")
      return
    }

    const handleDrawingCreated = () => refreshDrawings()
    window.addEventListener("marker-drawing-created", handleDrawingCreated)

    if (map.loaded()) {
      loadDrawings()
    } else {
      map.on("load", loadDrawings)
    }

    return () => {
      if (map) {
        map.off("load", loadDrawings)
      }
      window.removeEventListener("marker-drawing-created", handleDrawingCreated)
    }
  })

  onDestroy(() => {
    cleanup()
  })
</script>
