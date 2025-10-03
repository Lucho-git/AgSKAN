<script lang="ts">
  import { onMount, onDestroy, getContext } from "svelte"
  import { get } from "svelte/store"
  import { mapFieldsStore } from "$lib/stores/mapFieldsStore"
  import { fieldBoundaryStore } from "$lib/stores/homeBoundaryStore"
  import { fieldStore } from "$lib/stores/fieldStore"
  import * as mapboxgl from "mapbox-gl"
  import * as turf from "@turf/turf"
  import InfoPanel from "./InfoPanel.svelte"

  export let map: mapboxgl.Map
  export let coordinatedEvents = false

  const mapContext = getContext("map")

  let globalSelectionContext = null
  let globalSelectionState = null

  // 🆕 Helper function to get fill and outline colors based on field color
  function getFieldColors(fieldColor: string | null | undefined) {
    // If color is null, undefined, or explicitly "default", use the classic two-color scheme
    if (!fieldColor || fieldColor === "default") {
      return {
        fillColor: "#0080ff",
        outlineColor: "#bfffbf",
      }
    }
    // Otherwise, use the same color for both fill and outline
    return {
      fillColor: fieldColor,
      outlineColor: fieldColor,
    }
  }

  function checkGlobalSelectionContext() {
    try {
      globalSelectionContext = getContext("globalSelection")
      if (globalSelectionContext) {
        globalSelectionState = globalSelectionContext.getState()
        console.log("🎯 MapFields: Connected to global selection context")
      }
    } catch (error) {
      // Context not available yet, that's ok
    }
  }

  interface Field {
    field_id?: string
    area: number
    boundary: {
      type: "Polygon" | "MultiPolygon"
      coordinates: number[][][] | number[][][][]
    }
    name: string
    icon?: string
    color?: string
    field_type?: string
    polygon_areas?: {
      individual_areas: number[]
      total_area: number
    }
  }

  let selectedFieldId: number | null = null
  let showInfoPanel = false
  let isDestroyed = false

  let contextCheckInterval = null

  function syncWithGlobalSelection() {
    checkGlobalSelectionContext()

    if (globalSelectionContext) {
      const currentState = globalSelectionContext.getState()

      if (currentState.selectedType === "field") {
        if (selectedFieldId !== currentState.selectedId) {
          selectedFieldId = currentState.selectedId
          showInfoPanel = false
          updateFieldSelection()
          console.log(
            "🎯 MapFields: Synced with global selection:",
            selectedFieldId,
          )
        }
      } else if (
        currentState.selectedType !== "field" &&
        selectedFieldId !== null
      ) {
        selectedFieldId = null
        showInfoPanel = false
        updateFieldSelection()
        console.log("🎯 MapFields: Cleared selection due to other selection")
      }
    }
  }

  function canUseMap(): boolean {
    return !isDestroyed && map && map.getLayer && map.getSource
  }

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
                    icon: field.icon || "🌾",
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
                      icon: field.icon || "🌾",
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
    if (!map || !mapContext?.addLayerOrdered) {
      console.warn("Map or layer ordering context not available")
      return
    }

    try {
      mapContext.addLayerOrdered({
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
          "text-allow-overlap": false,
          "text-ignore-placement": false,
        },
        paint: {
          "text-color": "#c0ffc0",
          "text-halo-color": "#000000",
          "text-halo-width": 2,
          "text-opacity": 0.9,
        },
      })

      mapContext.addLayerOrdered({
        id: "fields-labels",
        type: "symbol",
        source: "label-points",
        layout: {
          "text-field": ["get", "name"],
          "text-anchor": "center",
          "symbol-sort-key": 10,
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

      console.log("✅ Added field label layers with proper ordering")
    } catch (error) {
      console.error("Error adding label layers:", error)
    }
  }

  function updateMapLabels() {
    console.log("Updating map labels with latest field data")

    if (!map || !map.getSource("label-points")) {
      console.warn("Map or label points source not found")
      return
    }

    try {
      const fields: Field[] = get(mapFieldsStore)
      const labelPointsGeojson = createLabelPoints(fields)

      const labelPointsSource = map.getSource(
        "label-points",
      ) as mapboxgl.GeoJSONSource
      if (labelPointsSource) {
        labelPointsSource.setData(labelPointsGeojson)
        console.log("Updated label points source with new data")
      }
    } catch (error) {
      console.error("Error updating map labels:", error)
    }
  }

  function updateMapColors() {
    console.log("Updating map colors with latest field data")

    if (!canUseMap()) return

    try {
      const fields: Field[] = get(mapFieldsStore)

      // 🆕 Update the GeoJSON data with separate fill and outline colors
      const fieldsGeojson = {
        type: "FeatureCollection",
        features: fields.map((field, index) => {
          const colors = getFieldColors(field.color)
          return {
            type: "Feature",
            geometry: field.boundary,
            properties: {
              id: index,
              area: Math.round(field.area * 10) / 10,
              name: field.name,
              fillColor: colors.fillColor,
              outlineColor: colors.outlineColor,
            },
          }
        }),
      }

      const fieldsSource = map.getSource("fields") as mapboxgl.GeoJSONSource
      if (fieldsSource) {
        fieldsSource.setData(fieldsGeojson)
        console.log("✅ Updated field colors on map")
      }
    } catch (error) {
      console.error("Error updating map colors:", error)
    }
  }

  export function handleFieldSelection(fieldId) {
    console.log(
      "🎯 MapFields: Field selection called with ID:",
      fieldId,
      "current selectedFieldId:",
      selectedFieldId,
    )

    if (fieldId === null) {
      selectedFieldId = null
      showInfoPanel = false
      console.log("🎯 MapFields: Field explicitly deselected")
    } else if (selectedFieldId === fieldId) {
      console.log("🎯 MapFields: Same field clicked, deselecting")
      selectedFieldId = null
      showInfoPanel = false
      console.log("🎯 MapFields: Field deselected (same field clicked)")
    } else {
      console.log("🎯 MapFields: New field selected:", fieldId)
      selectedFieldId = fieldId
      showInfoPanel = false
      console.log(
        "🎯 MapFields: Selected field ID:",
        selectedFieldId,
        "showing hover state only",
      )
    }

    updateFieldSelection()
  }

  function updateFieldSelection() {
    if (!canUseMap()) return

    try {
      if (selectedFieldId !== null) {
        map.setFilter("fields-fill-selected", ["==", "id", selectedFieldId])
        map.setFilter("fields-outline-selected", ["==", "id", selectedFieldId])
        map.setFilter("fields-fill", ["!=", "id", selectedFieldId])
        map.setFilter("fields-outline", ["!=", "id", selectedFieldId])
        console.log(
          "🎯 MapFields: Updated visual selection for field:",
          selectedFieldId,
        )
      } else {
        map.setFilter("fields-fill-selected", ["==", "id", -1])
        map.setFilter("fields-outline-selected", ["==", "id", -1])
        map.setFilter("fields-fill", null)
        map.setFilter("fields-outline", null)
        console.log("🎯 MapFields: Cleared visual selection")
      }
    } catch (error) {
      if (!isDestroyed) {
        console.error("Error updating field selection:", error)
      }
    }
  }

  function loadFields() {
    if (!map || !mapContext?.addLayerOrdered) {
      console.warn("Map or layer ordering context not available")
      return
    }

    try {
      const fields: Field[] = get(mapFieldsStore)
      console.log("Loading fields from", $mapFieldsStore)

      if (fields.length > 0) {
        // 🆕 Create GeoJSON with separate fill and outline colors
        const fieldsGeojson = {
          type: "FeatureCollection",
          features: fields.map((field, index) => {
            const colors = getFieldColors(field.color)
            return {
              type: "Feature",
              geometry: field.boundary,
              properties: {
                id: index,
                area: Math.round(field.area * 10) / 10,
                name: field.name,
                fillColor: colors.fillColor,
                outlineColor: colors.outlineColor,
              },
            }
          }),
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

        // 🆕 Field fill - normal state (uses fillColor from properties)
        mapContext.addLayerOrdered({
          id: "fields-fill",
          type: "fill",
          source: "fields",
          paint: {
            "fill-color": ["get", "fillColor"],
            "fill-opacity": 0.1,
          },
        })

        // 🆕 Field fill - selected state (uses fillColor from properties, higher opacity)
        mapContext.addLayerOrdered({
          id: "fields-fill-selected",
          type: "fill",
          source: "fields",
          filter: ["==", "id", -1],
          paint: {
            "fill-color": ["get", "fillColor"],
            "fill-opacity": 0.3,
          },
        })

        // 🆕 Field outline - normal state (uses outlineColor from properties)
        mapContext.addLayerOrdered({
          id: "fields-outline",
          type: "line",
          source: "fields",
          paint: {
            "line-color": ["get", "outlineColor"],
            "line-opacity": 0.95,
            "line-width": 2,
          },
        })

        // Field outline - selected state (always white)
        mapContext.addLayerOrdered({
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

        const bounds = calculateBoundingBox(fields)
        if (bounds) {
          fieldBoundaryStore.set(bounds.toArray())
          console.log("Stored field bounding box")
        } else {
          console.warn("Unable to calculate valid bounding box")
        }

        console.log("✅ Fields loaded and layers created with proper ordering")
      }
    } catch (error) {
      console.error("Error loading fields:", error)
    }
  }

  function handleFieldDeselect() {
    selectedFieldId = null
    showInfoPanel = false
    updateFieldSelection()
  }

  function handleFieldUpdate() {
    updateMapLabels()
    updateMapColors()
  }

  function cleanup() {
    isDestroyed = true

    if (contextCheckInterval) {
      clearInterval(contextCheckInterval)
      contextCheckInterval = null
    }

    console.log("MapFields cleanup completed")
  }

  onMount(() => {
    if (!map) {
      console.error("Map is not available")
      return
    }

    console.log(
      "🎯 MapFields component mounted with coordinatedEvents:",
      coordinatedEvents,
    )

    contextCheckInterval = setInterval(syncWithGlobalSelection, 500)

    if (map.loaded()) {
      loadFields()
    } else {
      map.on("load", loadFields)
    }

    return () => {
      if (map) {
        map.off("load", loadFields)
      }
    }
  })

  onDestroy(() => {
    console.log("MapFields component destroying")
    cleanup()
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
