<script lang="ts">
  import { onMount } from "svelte"
  import { get } from "svelte/store"
  import { mapFieldsStore } from "$lib/stores/mapFieldsStore"
  import { fieldBoundaryStore } from "$lib/stores/homeBoundaryStore"
  import { fieldStore } from "$lib/stores/fieldStore"
  import * as mapboxgl from "mapbox-gl"
  import * as turf from "@turf/turf"
  import InfoPanel from "./InfoPanel.svelte"

  export let map: mapboxgl.Map

  interface Field {
    field_id?: string
    area: number
    boundary: {
      type: "Polygon" | "MultiPolygon"
      coordinates: number[][][] | number[][][][]
    }
    name: string
    polygon_areas?: {
      individual_areas: number[]
      total_area: number
    }
  }

  // Track selected field and info panel state
  let selectedFieldId: number | null = null
  let showInfoPanel = false

  function createLabelPoints(fields: Field[]) {
    return {
      type: "FeatureCollection",
      features: fields
        .flatMap((field, index) => {
          try {
            if (field.boundary.type === "Polygon") {
              const feature = turf.polygon(field.boundary.coordinates)
              const centerPoint = turf.center(feature)

              const isInside = turf.booleanPointInPolygon(
                centerPoint.geometry.coordinates,
                feature,
              )

              const labelPoint = isInside
                ? centerPoint
                : turf.pointOnFeature(feature)

              return [
                {
                  type: "Feature",
                  geometry: labelPoint.geometry,
                  properties: {
                    id: index,
                    name: field.name,
                    area: Math.round(field.area * 10) / 10,
                  },
                },
              ]
            } else if (field.boundary.type === "MultiPolygon") {
              return field.boundary.coordinates.map(
                (polygonCoords, polygonIndex) => {
                  const polygonFeature = turf.polygon(polygonCoords)
                  const centerPoint = turf.center(polygonFeature)

                  const isInside = turf.booleanPointInPolygon(
                    centerPoint.geometry.coordinates,
                    polygonFeature,
                  )

                  const labelPoint = isInside
                    ? centerPoint
                    : turf.pointOnFeature(polygonFeature)

                  const polygonArea =
                    field.polygon_areas?.individual_areas?.[polygonIndex] ??
                    Math.round(field.area * 10) / 10

                  return {
                    type: "Feature",
                    geometry: labelPoint.geometry,
                    properties: {
                      id: index,
                      name: field.name,
                      area: Math.round(polygonArea * 10) / 10,
                    },
                  }
                },
              )
            } else {
              console.warn(
                `Invalid geometry type for field ${index}: ${field.boundary.type}`,
              )
              return []
            }
          } catch (error) {
            console.warn(`Error processing field ${index}:`, error)
            return []
          }
        })
        .filter((feature) => feature !== null),
    }
  }

  function calculateBoundingBox(fields: Field[]): mapboxgl.LngLatBounds | null {
    console.log("Calculating bounding box for", fields.length, "fields")

    if (fields.length === 0) {
      console.warn("No fields to calculate bounding box")
      return null
    }

    const bounds = new mapboxgl.LngLatBounds()

    fields.forEach((field, index) => {
      const coordinates =
        field.boundary.type === "Polygon"
          ? field.boundary.coordinates[0]
          : field.boundary.coordinates.flat(1)

      coordinates.forEach(([lng, lat], coordIndex) => {
        if (isNaN(lng) || isNaN(lat)) {
          console.warn(
            `Invalid coordinate at field ${index}, coordinate ${coordIndex}: [${lng}, ${lat}]`,
          )
          return
        }
        bounds.extend(new mapboxgl.LngLat(lng, lat))
      })
    })

    if (!bounds.isEmpty()) {
      console.log("Calculated bounding box:", bounds.toArray())
      return bounds
    } else {
      console.warn("Unable to calculate valid bounding box")
      return null
    }
  }

  function addLabelLayers() {
    if (!map) return

    // Add field name labels layer
    map.addLayer({
      id: "fields-labels",
      type: "symbol",
      source: "label-points",
      layout: {
        "text-field": ["get", "name"],
        "text-anchor": "center",
        "symbol-sort-key": -1,
        "text-font": ["DIN Pro Bold", "Arial Unicode MS Bold"],
        "text-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          10,
          0,
          11,
          8,
          13,
          12,
          15,
          28,
          17,
          48,
          19,
          96,
          20,
          120,
        ],
        "text-allow-overlap": true,
        "text-ignore-placement": false,
      },
      paint: {
        "text-color": "#ffffff",
        "text-halo-color": "#000000",
        "text-halo-width": 2,
      },
    })

    // Add area labels layer (smaller, lighter)
    map.addLayer({
      id: "fields-labels-area",
      type: "symbol",
      source: "label-points",
      layout: {
        "text-field": ["concat", ["get", "area"], " ha"],
        "text-anchor": "top",
        "text-offset": [0, 1.2],
        "text-font": ["DIN Pro Regular", "Arial Unicode MS Regular"],
        "text-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          10,
          0,
          11,
          6,
          13,
          9,
          15,
          21,
          17,
          36,
          19,
          72,
          20,
          90,
        ],
        "text-allow-overlap": true,
        "text-ignore-placement": false,
      },
      paint: {
        "text-color": "#c0ffc0",
        "text-halo-color": "#000000",
        "text-halo-width": 2,
        "text-opacity": 0.9,
      },
    })
  }

  function updateMapLabels() {
    console.log("Updating map labels with latest field data")

    if (!map || !map.getSource("label-points")) {
      console.warn("Map or label points source not found")
      return
    }

    const fields: Field[] = get(mapFieldsStore)
    const labelPointsGeojson = createLabelPoints(fields)

    const labelPointsSource = map.getSource(
      "label-points",
    ) as mapboxgl.GeoJSONSource
    if (labelPointsSource) {
      labelPointsSource.setData(labelPointsGeojson)
      console.log("Updated label points source with new data")
    }
  }

  function readdLabels() {
    console.log("ReadingLABELS!!", $mapFieldsStore)
    if (!map || !map.getLayer("fields-labels")) return

    const currentZoom = map.getZoom()

    if (map.getLayer("fields-labels-area")) {
      map.removeLayer("fields-labels-area")
    }
    map.removeLayer("fields-labels")

    addLabelLayers()
    map.setZoom(currentZoom)
  }

  function handleFieldClick(
    e: mapboxgl.MapMouseEvent | mapboxgl.MapTouchEvent,
  ) {
    if (!map) return

    if (e.originalEvent) {
      e.originalEvent.stopPropagation()
    }

    const features = map.queryRenderedFeatures(e.point, {
      layers: ["fields-fill", "fields-fill-selected"],
    })

    if (features.length > 0) {
      const clickedFieldId = features[0].properties?.id

      if (selectedFieldId === clickedFieldId) {
        selectedFieldId = null
        showInfoPanel = false
        console.log("Field deselected")
      } else {
        selectedFieldId = clickedFieldId
        showInfoPanel = false
        console.log("Selected field ID:", selectedFieldId)
      }

      updateFieldSelection()
    }
  }

  function updateFieldSelection() {
    if (!map) return

    if (selectedFieldId !== null) {
      map.setFilter("fields-fill-selected", ["==", "id", selectedFieldId])
      map.setFilter("fields-outline-selected", ["==", "id", selectedFieldId])
      map.setFilter("fields-fill", ["!=", "id", selectedFieldId])
      map.setFilter("fields-outline", ["!=", "id", selectedFieldId])
    } else {
      map.setFilter("fields-fill-selected", ["==", "id", -1])
      map.setFilter("fields-outline-selected", ["==", "id", -1])
      map.setFilter("fields-fill", null)
      map.setFilter("fields-outline", null)
    }
  }

  function addClickHandlers() {
    if (!map) return

    map.on("click", "fields-fill", handleFieldClick)
    map.on("click", "fields-fill-selected", handleFieldClick)

    map.on("mouseenter", "fields-fill", () => {
      if (!map) return
      map.getCanvas().style.cursor = "pointer"
    })

    map.on("mouseleave", "fields-fill", () => {
      if (!map) return
      map.getCanvas().style.cursor = ""
    })

    map.on("mouseenter", "fields-fill-selected", () => {
      if (!map) return
      map.getCanvas().style.cursor = "pointer"
    })

    map.on("mouseleave", "fields-fill-selected", () => {
      if (!map) return
      map.getCanvas().style.cursor = ""
    })
  }

  function removeClickHandlers() {
    if (!map) return

    map.off("click", "fields-fill", handleFieldClick)
    map.off("click", "fields-fill-selected", handleFieldClick)
    map.off("mouseenter", "fields-fill")
    map.off("mouseleave", "fields-fill")
    map.off("mouseenter", "fields-fill-selected")
    map.off("mouseleave", "fields-fill-selected")
  }

  function loadFields() {
    if (!map) return

    const fields: Field[] = get(mapFieldsStore)
    console.log("Loading fields from", $mapFieldsStore)

    if (fields.length > 0) {
      const fieldsGeojson = {
        type: "FeatureCollection",
        features: fields.map((field, index) => ({
          type: "Feature",
          geometry: field.boundary,
          properties: {
            id: index,
            area: Math.round(field.area * 10) / 10,
            name: field.name,
          },
        })),
      }

      const labelPointsGeojson = createLabelPoints(fields)

      map.addSource("fields", {
        type: "geojson",
        data: fieldsGeojson,
      })

      map.addSource("label-points", {
        type: "geojson",
        data: labelPointsGeojson,
      })

      // Add layers
      map.addLayer({
        id: "fields-fill",
        type: "fill",
        source: "fields",
        paint: {
          "fill-color": "#0080ff",
          "fill-opacity": 0.2,
        },
      })

      map.addLayer({
        id: "fields-outline",
        type: "line",
        source: "fields",
        paint: {
          "line-color": "#bfffbf",
          "line-opacity": 0.5,
          "line-width": 2,
        },
      })

      map.addLayer({
        id: "fields-fill-selected",
        type: "fill",
        source: "fields",
        filter: ["==", "id", -1],
        paint: {
          "fill-color": "#0056b3",
          "fill-opacity": 0.5,
        },
      })

      map.addLayer({
        id: "fields-outline-selected",
        type: "line",
        source: "fields",
        filter: ["==", "id", -1],
        paint: {
          "line-color": "#ffffff",
          "line-opacity": 1.0,
          "line-width": 3,
        },
      })

      addLabelLayers()
      addClickHandlers()

      setTimeout(() => readdLabels(), 10000)
      setTimeout(() => readdLabels(), 20000)

      const bounds = calculateBoundingBox(fields)
      if (bounds) {
        fieldBoundaryStore.set(bounds.toArray())
        console.log("Stored field bounding box")
      } else {
        console.warn("Unable to calculate valid bounding box")
      }
    }
  }

  function handleFieldDeselect() {
    selectedFieldId = null
    showInfoPanel = false
    updateFieldSelection()
  }

  function handleFieldUpdate() {
    updateMapLabels()
  }

  onMount(() => {
    if (!map) {
      console.error("Map is not available")
      return
    }

    console.log("MapFields component mounted")

    if (map.loaded()) {
      loadFields()
    } else {
      map.on("load", loadFields)
    }

    return () => {
      // Add null checks to prevent errors during cleanup
      if (map) {
        map.off("load", loadFields)

        // Only try to remove click handlers if map and layers still exist
        try {
          if (map.getLayer && map.getLayer("fields-fill")) {
            removeClickHandlers()
          }
        } catch (error) {
          console.warn("Error during cleanup:", error)
        }
      }
    }
  })

  export { selectedFieldId }
  $: selectedField =
    selectedFieldId !== null ? $mapFieldsStore[selectedFieldId] : null
</script>

{#if selectedFieldId !== null && selectedField}
  <InfoPanel
    {selectedField}
    {selectedFieldId}
    bind:showInfoPanel
    on:deselect={handleFieldDeselect}
    on:fieldUpdated={handleFieldUpdate}
  />
{/if}
