<script lang="ts">
  import { onMount } from "svelte"
  import { get } from "svelte/store"
  import { mapFieldsStore } from "$lib/stores/mapFieldsStore"
  import { fieldBoundaryStore } from "$lib/stores/homeBoundaryStore"
  import * as mapboxgl from "mapbox-gl"
  import * as turf from "@turf/turf"

  export let map: mapboxgl.Map

  interface Field {
    area: number
    boundary: {
      type: "Polygon" | "MultiPolygon"
      coordinates: number[][][] | number[][][][]
    }
    name: string
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

  function readdLabels() {
    console.log("ReadingLABELS!!", $mapFieldsStore)
    if (map.getLayer("fields-labels")) {
      const currentZoom = map.getZoom()

      // Remove both label layers
      if (map.getLayer("fields-labels-area")) {
        map.removeLayer("fields-labels-area")
      }
      map.removeLayer("fields-labels")

      // Re-add field name labels
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

      // Re-add area labels
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
          "text-color": "#cccccc",
          "text-halo-color": "#000000",
          "text-halo-width": 1,
          "text-opacity": 0.8,
        },
      })

      map.setZoom(currentZoom)
    }
  }

  function loadFields() {
    const fields: Field[] = get(mapFieldsStore)
    console.log("Loading fields from", $mapFieldsStore)
    if (fields.length > 0) {
      // Create polygons GeoJSON
      const fieldsGeojson = {
        type: "FeatureCollection",
        features: fields.map((field, index) => ({
          type: "Feature",
          geometry: field.boundary,
          properties: {
            id: index,
            area: Math.round(field.area * 10) / 10, // Round to 1 decimal place
            name: field.name,
          },
        })),
      }

      // Create label points GeoJSON
      const labelPointsGeojson = {
        type: "FeatureCollection",
        features: fields
          .flatMap((field, index) => {
            try {
              if (field.boundary.type === "Polygon") {
                const feature = turf.polygon(field.boundary.coordinates)
                const centerPoint = turf.center(feature)

                // Check if center point is inside polygon
                const isInside = turf.booleanPointInPolygon(
                  centerPoint.geometry.coordinates,
                  feature,
                )

                // Use pointOnFeature if center is outside
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
                      area: Math.round(field.area * 10) / 10, // Round to 1 decimal place
                    },
                  },
                ]
              } else if (field.boundary.type === "MultiPolygon") {
                // Create a center point for each polygon in the MultiPolygon
                return field.boundary.coordinates.map((polygonCoords) => {
                  const polygonFeature = turf.polygon(polygonCoords)
                  const centerPoint = turf.center(polygonFeature)

                  // Check if center point is inside polygon
                  const isInside = turf.booleanPointInPolygon(
                    centerPoint.geometry.coordinates,
                    polygonFeature,
                  )

                  // Use pointOnFeature if center is outside
                  const labelPoint = isInside
                    ? centerPoint
                    : turf.pointOnFeature(polygonFeature)

                  return {
                    type: "Feature",
                    geometry: labelPoint.geometry,
                    properties: {
                      id: index,
                      name: field.name,
                      area: Math.round(field.area * 10) / 10, // Round to 1 decimal place
                    },
                  }
                })
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

      // Add the fields source
      map.addSource("fields", {
        type: "geojson",
        data: fieldsGeojson,
      })

      // Add the label points source
      map.addSource("label-points", {
        type: "geojson",
        data: labelPointsGeojson,
      })

      // Add filled polygons
      map.addLayer({
        id: "fields-fill",
        type: "fill",
        source: "fields",
        paint: {
          "fill-color": "#0080ff",
          "fill-opacity": 0.2,
        },
      })

      // Add field outlines
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
          "text-offset": [0, 1.2], // Position below the field name
          "text-font": ["DIN Pro Regular", "Arial Unicode MS Regular"], // Lighter font weight
          "text-size": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            0,
            11,
            6, // Smaller than main text
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
          "text-color": "#cccccc", // Lighter color
          "text-halo-color": "#000000",
          "text-halo-width": 1, // Thinner halo
          "text-opacity": 0.8, // Slightly transparent
        },
      })

      // Re-add labels at 10 seconds
      setTimeout(() => {
        readdLabels()
      }, 10000)

      // Re-add labels at 20 seconds
      setTimeout(() => {
        readdLabels()
      }, 20000)

      // Calculate bounding box and store it
      const bounds = calculateBoundingBox(fields)
      if (bounds) {
        fieldBoundaryStore.set(bounds.toArray())
        console.log("Stored field bounding box")
      } else {
        console.warn("Unable to calculate valid bounding box")
      }
    }
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
      map.off("load", loadFields)
    }
  })
</script>
