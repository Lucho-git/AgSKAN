<script lang="ts">
  import { onMount, onDestroy, getContext } from "svelte"
  import { get } from "svelte/store"
  import { supabase } from "$lib/supabaseClient"
  import { profileStore } from "$lib/stores/profileStore"
  import * as mapboxgl from "mapbox-gl"

  export let map: mapboxgl.Map

  const mapContext = getContext("map")

  let isDestroyed = false
  let drawings = []
  let unsubscribe = null

  interface MarkerDrawing {
    id: string
    marker_id: string
    drawing_type: "polygon" | "line"
    geometry: {
      type: string
      coordinates: number[][] | number[][][]
    }
    style: {
      fillColor: string
      strokeColor: string
      fillOpacity: number
      strokeWidth: number
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
        geometry: drawing.geometry, // 👈 Direct use, just like fields!
        properties: {
          id: drawing.id,
          marker_id: drawing.marker_id,
          drawing_type: drawing.drawing_type,
          fillColor: drawing.style.fillColor,
          strokeColor: drawing.style.strokeColor,
          fillOpacity: drawing.style.fillOpacity,
          strokeWidth: drawing.style.strokeWidth,
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
      // Polygon fill layer
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

      // Line/Polygon stroke layer
      mapContext.addLayerOrdered({
        id: "marker-drawings-line",
        type: "line",
        source: "marker-drawings",
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-color": ["get", "strokeColor"],
          "line-width": ["get", "strokeWidth"],
          "line-opacity": 0.8,
        },
      })

      console.log("✅ Added marker drawing layers with proper ordering")
    } catch (error) {
      console.error("Error adding drawing layers:", error)
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

      // Fetch drawings from database
      const { data, error } = await supabase
        .from("marker_drawings")
        .select("*")
        .eq("master_map_id", masterMapId)
        .is("deleted", null)
        .order("created_at", { ascending: true })

      if (error) {
        console.error("Error loading marker drawings:", error)
        return
      }

      drawings = data || []
      console.log(`Loading ${drawings.length} marker drawings`)

      const drawingsGeojson = createDrawingsGeoJSON(drawings)

      // Add source
      if (!map.getSource("marker-drawings")) {
        map.addSource("marker-drawings", {
          type: "geojson",
          data: drawingsGeojson,
        })

        // Add layers after source
        addDrawingLayers()
      } else {
        // Update existing source
        const drawingsSource = map.getSource(
          "marker-drawings",
        ) as mapboxgl.GeoJSONSource
        drawingsSource.setData(drawingsGeojson)
      }

      // Subscribe to realtime updates
      if (!unsubscribe) {
        subscribeToDrawingUpdates()
      }

      console.log("✅ Marker drawings loaded and layers created")
    } catch (error) {
      console.error("Error loading marker drawings:", error)
    }
  }

  function subscribeToDrawingUpdates() {
    const masterMapId = $profileStore.master_map_id
    if (!masterMapId) return

    // Subscribe to changes in marker_drawings table
    const channel = supabase
      .channel("marker-drawings-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "marker_drawings",
          filter: `master_map_id=eq.${masterMapId}`,
        },
        (payload) => {
          console.log("Marker drawing change detected:", payload)
          refreshDrawings()
        },
      )
      .subscribe()

    unsubscribe = () => {
      supabase.removeChannel(channel)
    }
  }

  async function refreshDrawings() {
    if (!canUseMap()) return

    try {
      const masterMapId = $profileStore.master_map_id
      if (!masterMapId) return

      const { data, error } = await supabase
        .from("marker_drawings")
        .select("*")
        .eq("master_map_id", masterMapId)
        .is("deleted", null)
        .order("created_at", { ascending: true })

      if (error) {
        console.error("Error refreshing marker drawings:", error)
        return
      }

      drawings = data || []

      const drawingsGeojson = createDrawingsGeoJSON(drawings)

      const drawingsSource = map.getSource(
        "marker-drawings",
      ) as mapboxgl.GeoJSONSource
      if (drawingsSource) {
        drawingsSource.setData(drawingsGeojson)
        console.log("✅ Refreshed marker drawings on map")
      }
    } catch (error) {
      console.error("Error refreshing marker drawings:", error)
    }
  }

  function cleanup() {
    isDestroyed = true

    if (unsubscribe) {
      unsubscribe()
      unsubscribe = null
    }

    console.log("MarkerDrawings cleanup completed")
  }

  onMount(() => {
    if (!map) {
      console.error("Map is not available")
      return
    }

    console.log("MarkerDrawings component mounted")

    if (map.loaded()) {
      loadDrawings()
    } else {
      map.on("load", loadDrawings)
    }

    return () => {
      if (map) {
        map.off("load", loadDrawings)
      }
    }
  })

  onDestroy(() => {
    console.log("MarkerDrawings component destroying")
    cleanup()
  })
</script>
