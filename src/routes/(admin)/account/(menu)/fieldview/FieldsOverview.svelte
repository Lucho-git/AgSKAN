<script lang="ts">
  import { goto } from "$app/navigation"
  import { onMount } from "svelte"

  import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
  } from "$lib/components/ui/table"
  import { Button } from "$lib/components/ui/button"
  import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardFooter,
  } from "$lib/components/ui/card"
  import { Input } from "$lib/components/ui/input"
  import { Label } from "$lib/components/ui/label"

  import {
    MapPinned,
    Trash2,
    ChevronDown,
    ChevronUp,
    LandPlot,
    SquarePen,
    AlertTriangle,
    MoreHorizontal,
    Info,
    Eye,
    Upload,
    Download,
    Settings,
    Search,
    ArrowUp,
    ArrowRightLeft,
    Check,
  } from "lucide-svelte"

  import { connectedMapStore } from "$lib/stores/connectedMapStore"
  import { fieldStore } from "$lib/stores/fieldStore"
  import { farmsStore } from "$lib/stores/farmsStore"
  import { session } from "$lib/stores/sessionStore"
  import { userFilesStore } from "./userFilesStore"
  import { get } from "svelte/store"
  import FieldIcon from "$lib/components/map/overlays/FieldIcon.svelte"
  import { toast } from "svelte-sonner"
  import { fileApi } from "$lib/api/fileApi"
  import { FARM_NAME_MAX_LENGTH, farmApi } from "$lib/api/farmApi"

  type ExportFormat = "geojson" | "kml" | "shapefile"

  // Accept the navigation function as a prop
  export let navigateToProcess: (fileId: string, fileName: string) => void

  $: fields = $fieldStore
  $: connectedMap = $connectedMapStore
  $: farmName = connectedMap.is_connected ? connectedMap.map_name : null
  $: authToken = $session?.access_token
  $: userFiles = $userFilesStore

  // Group fields by farm_id using farmsStore
  $: farmGroups = (() => {
    const farms = $farmsStore || []
    const farmById = new Map(farms.map((f) => [f.id, f]))
    const fieldsByFarmId = new Map<string, any[]>()
    const unassigned: any[] = []
    for (const field of sortedFields) {
      if (field.farm_id && farmById.has(field.farm_id)) {
        if (!fieldsByFarmId.has(field.farm_id))
          fieldsByFarmId.set(field.farm_id, [])
        fieldsByFarmId.get(field.farm_id)!.push(field)
      } else {
        unassigned.push(field)
      }
    }
    // Build entries: [displayName, fields[], farmId]
    const entries: [string, any[], string | null][] = farms.map((farm) => [
      farm.name,
      fieldsByFarmId.get(farm.id) || [],
      farm.id,
    ])
    if (unassigned.length > 0) {
      entries.push(["Unassigned", unassigned, null])
    }
    return entries
  })()
  $: hasMultipleFarms = farmGroups.length > 1

  // Search filtering — narrow each farm group's fields by name and drop empties.
  let searchTerm = ""
  $: searchLower = searchTerm.trim().toLowerCase()
  $: displayGroups = farmGroups
    .map(
      ([name, groupFields, farmId]) =>
        [
          name,
          searchLower
            ? groupFields.filter((f) =>
                (f.name || "").toLowerCase().includes(searchLower),
              )
            : groupFields,
          farmId,
        ] as [string, any[], string | null],
    )
    .filter(([, groupFields]) => groupFields.length > 0)

  let isExpanded = true
  let editModalId = "edit-field-modal"
  let deleteModalId = "delete-field-modal"
  let deleteAllModalId = "delete-all-fields-modal"
  let currentEditingField: {
    field_id: string
    name: string
    area: number
  } | null = null
  let fieldToDelete: {
    field_id: string
    name: string
  } | null = null
  let newFieldName = ""
  let newFieldArea = 0
  let deletingAllFields = false
  let deleteFarmModalId = "delete-farm-fields-modal"
  let farmToDelete: string | null = null
  let deletingFarmFields = false

  // Field export state
  let exportModalId = "export-fields-modal"
  let exportFieldIds = new Set<string>()
  let exportFormat: ExportFormat = "geojson"
  let exportingFields = false

  // Farm migration state
  let migrationModalId = "migrate-fields-modal"
  let migrationMode = false
  let selectedFieldIds = new Set<string>()
  let migrationTargetFarm = ""
  let migrationNewFarmName = ""
  let migratingFields = false
  let migrationSourceFarm: string | null = null

  // New state variables for responsive design
  let isMobile = false
  let displayMode = "table" // "table" or "list"
  let expandedDetails = new Set()
  let collapsedFarms = new Set<string>() // Track collapsed farm sections
  let sortField = "name"
  let sortDirection = "asc"

  // Sort fields based on current sort settings
  $: sortedFields = [...fields].sort((a, b) => {
    let comparison = 0

    if (sortField === "name") {
      comparison = a.name.localeCompare(b.name)
    } else if (sortField === "area") {
      comparison = a.area - b.area
    }

    return sortDirection === "desc" ? -comparison : comparison
  })

  $: exportableFields = sortedFields.filter(hasExportableBoundary)
  $: selectedExportCount = exportableFields.filter((field) =>
    exportFieldIds.has(field.field_id),
  ).length
  $: selectedExportArea = exportableFields
    .filter((field) => exportFieldIds.has(field.field_id))
    .reduce((sum, field) => sum + Number(field.area || 0), 0)
  $: canExportFields = selectedExportCount > 0 && !exportingFields

  onMount(() => {
    checkScreenSize()
    window.addEventListener("resize", checkScreenSize)

    return () => {
      window.removeEventListener("resize", checkScreenSize)
    }
  })

  function checkScreenSize() {
    isMobile = window.innerWidth < 768
    displayMode = isMobile ? "list" : "table"
  }

  function toggleExpand() {
    isExpanded = !isExpanded
  }

  function toggleSorting(field) {
    if (sortField === field) {
      sortDirection = sortDirection === "asc" ? "desc" : "asc"
    } else {
      sortField = field
      sortDirection = "asc"
    }
  }

  function toggleDetails(fieldId) {
    if (expandedDetails.has(fieldId)) {
      expandedDetails.delete(fieldId)
    } else {
      expandedDetails.add(fieldId)
    }
    expandedDetails = expandedDetails // Trigger reactivity
  }

  function toggleFarm(farmName: string) {
    if (collapsedFarms.has(farmName)) {
      collapsedFarms.delete(farmName)
    } else {
      collapsedFarms.add(farmName)
    }
    collapsedFarms = collapsedFarms // Trigger reactivity
  }

  function createGeoJSON(boundary) {
    return {
      type: "Feature",
      geometry: boundary,
      properties: {},
    }
  }

  function hasExportableBoundary(field: any) {
    return Boolean(field?.boundary?.type && field?.boundary?.coordinates)
  }

  function getFieldFarmName(field: any) {
    if (!field?.farm_id) return ""
    return ($farmsStore || []).find((farm) => farm.id === field.farm_id)?.name || ""
  }

  function isExportablePropertyValue(value: unknown) {
    return (
      value === null ||
      value === undefined ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    )
  }

  function getSourceExportProperties(field: any) {
    const sourceProperties =
      field.properties && typeof field.properties === "object"
        ? field.properties
        : {}
    const reservedKeys = new Set([
      "label",
      "Label",
      "LABEL",
      "name",
      "Name",
      "NAME",
      "field_name",
      "FIELD_NAME",
      "farm",
      "Farm",
      "FARM",
      "farm_name",
      "FARM_NAME",
      "area",
      "AREA",
      "area_ha",
      "AREA_HA",
    ])

    return Object.fromEntries(
      Object.entries(sourceProperties).filter(
        ([key, value]) =>
          !reservedKeys.has(key) && isExportablePropertyValue(value),
      ),
    )
  }

  function getRoundedArea(area: any) {
    const numericArea = Number(area)
    return Number.isFinite(numericArea)
      ? Math.round(numericArea * 100) / 100
      : null
  }

  function getFieldExportProperties(field: any) {
    const fieldName = field?.name || "Field"
    const fieldFarmName = getFieldFarmName(field)

    return {
      label: fieldName,
      name: fieldName,
      field_name: fieldName,
      area_ha: getRoundedArea(field.area),
      farm_name: fieldFarmName,
      field_id: field.field_id,
      farm_id: field.farm_id || null,
      map_id: field.map_id || null,
      ...getSourceExportProperties(field),
    }
  }

  function getFieldsFeatureCollection(fieldsToExport = fields) {
    return {
      type: "FeatureCollection",
      features: fieldsToExport
        .filter(hasExportableBoundary)
        .map((field) => ({
          type: "Feature",
          geometry: stripGeometryDimensions(field.boundary),
          properties: getFieldExportProperties(field),
        })),
    }
  }

  function escapeXml(value: unknown) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;")
  }

  function getKmlPropertyValue(value: unknown) {
    if (value === null || value === undefined) return ""
    if (typeof value === "object") return JSON.stringify(value)
    return String(value)
  }

  function coordinatesMatch(a: any, b: any) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      Number(a[0]) === Number(b[0]) &&
      Number(a[1]) === Number(b[1])
    )
  }

  function ringToKmlCoordinates(ring: any[]) {
    if (!Array.isArray(ring) || ring.length === 0) return ""
    const coordinates = coordinatesMatch(ring[0], ring[ring.length - 1])
      ? ring
      : [...ring, ring[0]]

    return coordinates
      .filter(
        (coordinate) =>
          Array.isArray(coordinate) &&
          Number.isFinite(Number(coordinate[0])) &&
          Number.isFinite(Number(coordinate[1])),
      )
      .map((coordinate) => {
        const lng = Number(coordinate[0])
        const lat = Number(coordinate[1])
        return `${lng},${lat}`
      })
      .join(" ")
  }

  function polygonToKml(coordinates: any[]) {
    if (!Array.isArray(coordinates) || coordinates.length === 0) return ""
    const [outerRing, ...innerRings] = coordinates

    return `<Polygon><outerBoundaryIs><LinearRing><coordinates>${ringToKmlCoordinates(
      outerRing,
    )}</coordinates></LinearRing></outerBoundaryIs>${innerRings
      .map(
        (ring) =>
          `<innerBoundaryIs><LinearRing><coordinates>${ringToKmlCoordinates(
            ring,
          )}</coordinates></LinearRing></innerBoundaryIs>`,
      )
      .join("")}</Polygon>`
  }

  function geometryToKml(geometry: any) {
    if (!geometry?.type || !geometry?.coordinates) return ""
    if (geometry.type === "Polygon") return polygonToKml(geometry.coordinates)
    if (geometry.type === "MultiPolygon") {
      return `<MultiGeometry>${geometry.coordinates
        .map((polygon) => polygonToKml(polygon))
        .join("")}</MultiGeometry>`
    }
    return ""
  }

  function propertiesToKml(properties: Record<string, unknown>) {
    const entries = Object.entries(properties || {})
    if (entries.length === 0) return ""

    return `<ExtendedData>${entries
      .map(
        ([key, value]) =>
          `<Data name="${escapeXml(key)}"><value>${escapeXml(
            getKmlPropertyValue(value),
          )}</value></Data>`,
      )
      .join("")}</ExtendedData>`
  }

  function featureToKmlPlacemark(feature: any) {
    const geometry = geometryToKml(feature.geometry)
    if (!geometry) return ""
    const properties = feature.properties || {}

    return `<Placemark><name>${escapeXml(
      properties.name || "Field",
    )}</name>${propertiesToKml(properties)}${geometry}</Placemark>`
  }

  function fieldsToKml(featureCollection: any) {
    const placemarks = featureCollection.features
      .map(featureToKmlPlacemark)
      .filter(Boolean)
      .join("\n")

    return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">\n<Document>\n<name>${escapeXml(
      farmName || "AgSKAN Fields",
    )}</name>\n${placemarks}\n</Document>\n</kml>\n`
  }

  function downloadTextFile(content: string, fileName: string, mimeType: string) {
    const blob = new Blob([content], { type: mimeType })
    downloadBlobFile(blob, fileName)
  }

  function downloadBlobFile(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  function getExportFileName(extension: "geojson" | "kml" | "zip") {
    const date = new Date().toISOString().slice(0, 10)
    return `agskan-fields-${date}.${extension}`
  }

  function getDbfString(value: unknown, maxLength = 250) {
    const text = String(value ?? "").trim()
    return text.length > maxLength ? text.slice(0, maxLength) : text
  }

  function getShapefileProperties(field: any, polygonCount = 1) {
    return {
      name: getDbfString(field?.name || "Field"),
      field_name: getDbfString(field?.name || "Field"),
      area_ha: getRoundedArea(field.area) || 0,
      farm: getDbfString(getFieldFarmName(field)),
      field_id: getDbfString(field.field_id, 80),
      farm_id: getDbfString(field.farm_id, 80),
      geom_type: polygonCount > 1 ? "MultiPolygon" : "Polygon",
      polygons: polygonCount,
    }
  }

  function stripCoordinateDimensions(coordinate: any) {
    if (!Array.isArray(coordinate)) return coordinate
    return [Number(coordinate[0]), Number(coordinate[1])]
  }

  function isValidCoordinate(coordinate: any) {
    return (
      Array.isArray(coordinate) &&
      Number.isFinite(Number(coordinate[0])) &&
      Number.isFinite(Number(coordinate[1]))
    )
  }

  function closeRing(ring: any[]) {
    const coordinates = ring.filter(isValidCoordinate).map(stripCoordinateDimensions)
    if (coordinates.length === 0) return []
    if (!coordinatesMatch(coordinates[0], coordinates[coordinates.length - 1])) {
      coordinates.push([...coordinates[0]])
    }
    return coordinates
  }

  function getRingSignedArea(ring: any[]) {
    return ring.reduce((sum, coordinate, index) => {
      const nextCoordinate = ring[(index + 1) % ring.length]
      return (
        sum +
        Number(coordinate[0]) * Number(nextCoordinate[1]) -
        Number(nextCoordinate[0]) * Number(coordinate[1])
      )
    }, 0)
  }

  function isClockwiseRing(ring: any[]) {
    return getRingSignedArea(ring) < 0
  }

  function orientRing(ring: any[], clockwise: boolean) {
    const closedRing = closeRing(ring)
    if (closedRing.length < 4) return closedRing
    return isClockwiseRing(closedRing) === clockwise
      ? closedRing
      : [...closedRing].reverse()
  }

  function stripPolygonDimensions(coordinates: any[]) {
    return coordinates.map((ring) => ring.map(stripCoordinateDimensions))
  }

  function getShapefilePolygonCoordinates(coordinates: any[]) {
    if (!Array.isArray(coordinates) || coordinates.length === 0) return []
    const [outerRing, ...innerRings] = coordinates
    return [
      orientRing(outerRing, true),
      ...innerRings.map((ring) => orientRing(ring, false)),
    ].filter((ring) => ring.length >= 4)
  }

  function stripGeometryDimensions(geometry: any) {
    if (!geometry?.type || !geometry?.coordinates) return geometry

    if (geometry.type === "Polygon") {
      return {
        type: "Polygon",
        coordinates: stripPolygonDimensions(geometry.coordinates),
      }
    }

    if (geometry.type === "MultiPolygon") {
      return {
        type: "MultiPolygon",
        coordinates: geometry.coordinates.map(stripPolygonDimensions),
      }
    }

    return geometry
  }

  function getShapefileFeatureCollection(fieldsToExport: any[]) {
    return {
      type: "FeatureCollection",
      features: fieldsToExport.flatMap((field) => {
        const geometry = field?.boundary
        if (!geometry?.type || !geometry?.coordinates) return []

        if (geometry.type === "Polygon") {
          return [
            {
              type: "Feature",
              geometry: {
                type: "MultiPolygon",
                coordinates: [getShapefilePolygonCoordinates(geometry.coordinates)],
              },
              properties: getShapefileProperties(field, 1),
            },
          ]
        }

        if (geometry.type === "MultiPolygon") {
          const polygons = geometry.coordinates || []
          return [
            {
              type: "Feature",
              geometry: {
                type: "MultiPolygon",
                coordinates: polygons
                  .map(getShapefilePolygonCoordinates)
                  .filter((polygon) => polygon.length > 0),
              },
              properties: getShapefileProperties(field, polygons.length),
            },
          ]
        }

        return []
      }),
    }
  }

  function getSelectedExportFields() {
    return exportableFields.filter((field) => exportFieldIds.has(field.field_id))
  }

  function toggleExportFieldSelection(fieldId: string) {
    if (exportFieldIds.has(fieldId)) {
      exportFieldIds.delete(fieldId)
    } else {
      exportFieldIds.add(fieldId)
    }
    exportFieldIds = exportFieldIds
  }

  function toggleAllExportFields() {
    const allSelected = exportableFields.every((field) =>
      exportFieldIds.has(field.field_id),
    )

    exportFieldIds = allSelected
      ? new Set()
      : new Set(exportableFields.map((field) => field.field_id))
  }

  function openExportModal() {
    exportFieldIds = new Set(exportableFields.map((field) => field.field_id))
    exportFormat = "geojson"
    const modal = document.getElementById(exportModalId) as HTMLDialogElement
    if (modal) modal.showModal()
  }

  function closeExportModal() {
    const modal = document.getElementById(exportModalId) as HTMLDialogElement
    if (modal) modal.close()
  }

  async function exportShapefile(fieldsToExport: any[]) {
    const shpwriteModule = (await import("@mapbox/shp-write")) as any
    const zip = shpwriteModule.zip || shpwriteModule.default?.zip
    if (!zip) throw new Error("Shapefile exporter did not load")

    const featureCollection = getShapefileFeatureCollection(fieldsToExport)
    if (featureCollection.features.length === 0) {
      throw new Error("No polygon boundaries available for shapefile export")
    }

    const zipBlob = await zip(featureCollection, {
      compression: "DEFLATE",
      outputType: "blob",
      folder: "agskan-fields",
      filename: "fields",
      types: {
        polygon: "fields",
      },
    })
    downloadBlobFile(zipBlob, getExportFileName("zip"))
  }

  async function exportFields() {
    const selectedFields = getSelectedExportFields()
    const featureCollection = getFieldsFeatureCollection(selectedFields)

    if (featureCollection.features.length === 0) {
      toast.error("No field boundaries available to export")
      return
    }

    exportingFields = true

    try {
      if (exportFormat === "geojson") {
        downloadTextFile(
          JSON.stringify(featureCollection, null, 2),
          getExportFileName("geojson"),
          "application/geo+json;charset=utf-8",
        )
      } else if (exportFormat === "kml") {
        downloadTextFile(
          fieldsToKml(featureCollection),
          getExportFileName("kml"),
          "application/vnd.google-earth.kml+xml;charset=utf-8",
        )
      } else {
        await exportShapefile(selectedFields)
      }

      toast.success(
        `Exported ${featureCollection.features.length} ${
          featureCollection.features.length === 1 ? "field" : "fields"
        } as ${exportFormat === "shapefile" ? "shapefile" : `.${exportFormat}`}`,
      )
      closeExportModal()
    } catch (error) {
      console.error("Field export failed:", error)
      toast.error("Failed to export fields. Please try again.")
    } finally {
      exportingFields = false
    }
  }

  function openEditModal(field: any) {
    currentEditingField = field
    newFieldName = field.name
    newFieldArea = field.area
    const modal = document.getElementById(editModalId) as HTMLDialogElement
    if (modal) modal.showModal()
  }

  function openDeleteModal(field: any) {
    fieldToDelete = {
      field_id: field.field_id,
      name: field.name,
    }
    const modal = document.getElementById(deleteModalId) as HTMLDialogElement
    if (modal) modal.showModal()
  }

  function openDeleteAllModal() {
    const modal = document.getElementById(deleteAllModalId) as HTMLDialogElement
    if (modal) modal.showModal()
  }

  function closeEditModal() {
    const modal = document.getElementById(editModalId) as HTMLDialogElement
    if (modal) modal.close()
  }

  function closeDeleteModal() {
    const modal = document.getElementById(deleteModalId) as HTMLDialogElement
    if (modal) modal.close()
  }

  function closeDeleteAllModal() {
    const modal = document.getElementById(deleteAllModalId) as HTMLDialogElement
    if (modal) modal.close()
  }

  function openDeleteFarmModal(farm: string) {
    farmToDelete = farm
    const modal = document.getElementById(
      deleteFarmModalId,
    ) as HTMLDialogElement
    if (modal) modal.showModal()
  }

  function closeDeleteFarmModal() {
    const modal = document.getElementById(
      deleteFarmModalId,
    ) as HTMLDialogElement
    if (modal) modal.close()
  }

  // ─── Farm Migration ─────────────────────────────────

  function openMigrationModal(sourceFarm: string) {
    migrationSourceFarm = sourceFarm
    // Find the farm entry to get its farmId
    const entry = farmGroups.find(([name]) => name === sourceFarm)
    const farmId = entry?.[2] || null
    // Pre-select all fields in this farm
    const farmFields = farmId
      ? fields.filter((f) => f.farm_id === farmId)
      : fields.filter((f) => !f.farm_id)
    selectedFieldIds = new Set(farmFields.map((f) => f.field_id))
    migrationTargetFarm = ""
    migrationNewFarmName = ""
    const modal = document.getElementById(migrationModalId) as HTMLDialogElement
    if (modal) modal.showModal()
  }

  function closeMigrationModal() {
    const modal = document.getElementById(migrationModalId) as HTMLDialogElement
    if (modal) modal.close()
    selectedFieldIds = new Set()
    migrationSourceFarm = null
    migrationTargetFarm = ""
    migrationNewFarmName = ""
  }

  function toggleFieldSelection(fieldId: string) {
    if (selectedFieldIds.has(fieldId)) {
      selectedFieldIds.delete(fieldId)
    } else {
      selectedFieldIds.add(fieldId)
    }
    selectedFieldIds = selectedFieldIds // reactivity
  }

  function selectAllInFarm(farm: string) {
    const entry = farmGroups.find(([name]) => name === farm)
    const farmId = entry?.[2] || null
    const farmFields = farmId
      ? fields.filter((f) => f.farm_id === farmId)
      : fields.filter((f) => !f.farm_id)
    const allSelected = farmFields.every((f) =>
      selectedFieldIds.has(f.field_id),
    )
    if (allSelected) {
      farmFields.forEach((f) => selectedFieldIds.delete(f.field_id))
    } else {
      farmFields.forEach((f) => selectedFieldIds.add(f.field_id))
    }
    selectedFieldIds = selectedFieldIds
  }

  $: resolvedTargetFarm =
    migrationTargetFarm === "__new__"
      ? migrationNewFarmName.trim()
      : migrationTargetFarm

  $: canMigrate = selectedFieldIds.size > 0 && resolvedTargetFarm.length > 0

  async function handleMigrateFields() {
    if (!canMigrate) return
    migratingFields = true

    let successCount = 0
    let errorCount = 0

    try {
      // Resolve target farm name to a farm_id
      const mapId = $connectedMapStore.id
      let targetFarmId: string | null = null

      if (migrationTargetFarm === "__new__") {
        // Create new farm
        const createResult = await farmApi.createFarm(mapId, resolvedTargetFarm)
        if (createResult.success && createResult.farm) {
          targetFarmId = createResult.farm.id
          farmsStore.update((farms) => [...farms, createResult.farm!])
        } else {
          toast.error(createResult.message || "Failed to create farm")
          migratingFields = false
          return
        }
      } else {
        // Find the existing farm_id from the name
        const farm = ($farmsStore || []).find(
          (f) => f.name === resolvedTargetFarm,
        )
        targetFarmId = farm?.id || null
      }

      if (!targetFarmId) {
        toast.error("Could not resolve target farm")
        migratingFields = false
        return
      }

      const promises = Array.from(selectedFieldIds).map(async (fieldId) => {
        try {
          const result = await fileApi.updateField(fieldId, {
            farm_id: targetFarmId!,
          })
          if (result.success) {
            successCount++
          } else {
            errorCount++
          }
        } catch {
          errorCount++
        }
      })

      await Promise.all(promises)

      // Update local store
      fieldStore.update((all) =>
        all.map((f) =>
          selectedFieldIds.has(f.field_id)
            ? { ...f, farm_id: targetFarmId }
            : f,
        ),
      )

      if (errorCount === 0) {
        toast.success(`Moved ${successCount} fields to "${resolvedTargetFarm}"`)
      } else {
        toast.success(`${successCount} moved, ${errorCount} failed`)
      }

      closeMigrationModal()
    } catch {
      toast.error("An error occurred while moving fields.")
    } finally {
      migratingFields = false
    }
  }

  async function handleDeleteFarmFields() {
    if (!farmToDelete) return

    const entry = farmGroups.find(([name]) => name === farmToDelete)
    const farmId = entry?.[2] || null
    const farmFields = farmId
      ? fields.filter((f) => f.farm_id === farmId)
      : fields.filter((f) => !f.farm_id)
    if (farmFields.length === 0) return

    deletingFarmFields = true
    let successCount = 0
    let errorCount = 0

    try {
      const deletePromises = farmFields.map(async (field) => {
        try {
          const result = await fileApi.deleteField(field.field_id)
          if (result.success) {
            successCount++
          } else {
            errorCount++
          }
        } catch (error) {
          errorCount++
        }
      })

      await Promise.all(deletePromises)

      // Remove deleted fields from the store
      const deletedIds = new Set(farmFields.map((f) => f.field_id))
      fieldStore.update((all) => all.filter((f) => !deletedIds.has(f.field_id)))

      if (errorCount === 0) {
        toast.success(
          `All ${successCount} fields from "${farmToDelete}" deleted`,
        )
      } else if (successCount > 0) {
        toast.success(`${successCount} fields deleted, ${errorCount} failed`)
      } else {
        toast.error("Failed to delete fields. Please try again.")
      }

      closeDeleteFarmModal()
    } catch (error) {
      toast.error("An error occurred while deleting fields.")
    } finally {
      deletingFarmFields = false
    }
  }

  async function handleEditField() {
    if (!currentEditingField || !newFieldName.trim()) return

    try {
      const area = parseFloat(newFieldArea.toString())
      const result = await fileApi.updateField(
        currentEditingField.field_id,
        newFieldName.trim(),
        area,
      )

      if (result.success) {
        fieldStore.update((fields) =>
          fields.map((field) =>
            field.field_id === currentEditingField?.field_id
              ? {
                  ...field,
                  name: newFieldName.trim(),
                  area: area,
                }
              : field,
          ),
        )
        toast.success("Field updated")
        closeEditModal()
      } else {
        throw new Error(result.message || "Failed to update field")
      }
    } catch (error) {
      toast.error("Failed to update field. Please try again.")
    }
  }

  function handleLocateField(fieldId: string) {
    goto(`/account/mapviewer?field=${fieldId}`)
  }

  async function handleDeleteField() {
    if (!fieldToDelete) return

    try {
      const result = await fileApi.deleteField(fieldToDelete.field_id)

      if (result.success) {
        fieldStore.update((fields) =>
          fields.filter((field) => field.field_id !== fieldToDelete.field_id),
        )
        toast.success(`Field "${fieldToDelete.name}" deleted`)
        closeDeleteModal()
      } else {
        throw new Error(result.message || "Failed to delete field")
      }
    } catch (error) {
      toast.error(
        `Failed to delete field "${fieldToDelete.name}". Please try again.`,
      )
    }
  }

  async function handleDeleteAllFields() {
    if (fields.length === 0) return

    deletingAllFields = true
    let successCount = 0
    let errorCount = 0

    try {
      // Delete all fields in parallel
      const deletePromises = fields.map(async (field) => {
        try {
          const result = await fileApi.deleteField(field.field_id)
          if (result.success) {
            successCount++
          } else {
            errorCount++
          }
        } catch (error) {
          errorCount++
        }
      })

      await Promise.all(deletePromises)

      // Update the store to remove all fields
      fieldStore.set([])

      if (errorCount === 0) {
        toast.success(`All ${successCount} fields deleted successfully`)
      } else if (successCount > 0) {
        toast.success(`${successCount} fields deleted, ${errorCount} failed`)
      } else {
        toast.error("Failed to delete fields. Please try again.")
      }

      closeDeleteAllModal()
    } catch (error) {
      toast.error("An error occurred while deleting fields. Please try again.")
    } finally {
      deletingAllFields = false
    }
  }
</script>

<!-- Edit Field Modal -->
<dialog id={editModalId} class="modal modal-bottom sm:modal-middle">
  <div class="modal-box">
    <div class="flex items-center gap-3">
      <div
        class="flex h-10 w-10 items-center justify-center rounded-full bg-base-200"
      >
        <SquarePen class="h-5 w-5 text-contrast-content" />
      </div>
      <div>
        <h3 class="text-lg font-bold text-contrast-content">Edit Field</h3>
        <p class="text-sm text-contrast-content/60">Change field information</p>
      </div>
    </div>

    <div class="space-y-4 p-4">
      <div class="grid gap-2">
        <Label for="name">Field Name</Label>
        <Input
          id="name"
          bind:value={newFieldName}
          placeholder="Enter field name"
          class="w-full"
        />
      </div>

      <div class="grid gap-2">
        <Label for="area">Area (ha)</Label>
        <Input
          id="area"
          type="number"
          step="0.1"
          bind:value={newFieldArea}
          placeholder="Enter area in hectares"
          class="w-full"
        />
      </div>
    </div>

    <div class="modal-action">
      <form method="dialog" class="flex w-full gap-2 sm:w-auto">
        <button
          class="btn btn-outline flex-1 sm:flex-none"
          on:click={closeEditModal}
        >
          Cancel
        </button>
        <button
          class="btn flex-1 bg-base-content text-base-100 hover:bg-base-content/90 sm:flex-none"
          on:click={handleEditField}
        >
          Save changes
        </button>
      </form>
    </div>
  </div>
  <form method="dialog" class="modal-backdrop">
    <button>close</button>
  </form>
</dialog>

<!-- Delete Field Modal -->
<dialog id={deleteModalId} class="modal modal-bottom sm:modal-middle">
  <div class="modal-box">
    <div class="flex items-center gap-3">
      <div
        class="flex h-10 w-10 items-center justify-center rounded-full bg-error/20"
      >
        <AlertTriangle class="h-5 w-5 text-error" />
      </div>
      <div>
        <h3 class="text-lg font-bold text-contrast-content">Delete Field</h3>
        <p class="text-sm text-contrast-content/60">
          This action cannot be undone
        </p>
      </div>
    </div>

    <div class="p-4">
      {#if fieldToDelete}
        <p class="text-contrast-content">
          Are you sure you want to delete the field "{fieldToDelete.name}"?
        </p>
      {/if}
    </div>

    <div class="modal-action">
      <form method="dialog" class="flex w-full gap-2 sm:w-auto">
        <button
          class="btn btn-outline flex-1 sm:flex-none"
          on:click={closeDeleteModal}
        >
          Cancel
        </button>
        <button
          class="btn flex-1 bg-error text-white hover:bg-error/80 sm:flex-none"
          on:click={handleDeleteField}
        >
          Delete
        </button>
      </form>
    </div>
  </div>
  <form method="dialog" class="modal-backdrop">
    <button>close</button>
  </form>
</dialog>

<!-- Delete All Fields Modal -->
<dialog id={deleteAllModalId} class="modal modal-bottom sm:modal-middle">
  <div class="modal-box">
    <div class="flex items-center gap-3">
      <div
        class="flex h-10 w-10 items-center justify-center rounded-full bg-error/20"
      >
        <AlertTriangle class="h-5 w-5 text-error" />
      </div>
      <div>
        <h3 class="text-lg font-bold text-contrast-content">
          Delete All Fields
        </h3>
        <p class="text-sm text-contrast-content/60">
          This action cannot be undone
        </p>
      </div>
    </div>

    <div class="p-4">
      <p class="mb-4 text-contrast-content">
        Are you sure you want to delete all {fields.length} fields? This will permanently
        remove all field data from your account. However your trail data and operational
        data will remain intact.
      </p>
      <div class="rounded-lg border border-error/30 bg-error/10 p-3">
        <p class="text-sm text-error">
          <strong>Warning:</strong> This action will delete all fields and cannot
          be undone.
        </p>
      </div>
    </div>

    <div class="modal-action">
      <form method="dialog" class="flex w-full gap-2 sm:w-auto">
        <button
          class="btn btn-outline flex-1 sm:flex-none"
          on:click={closeDeleteAllModal}
          disabled={deletingAllFields}
        >
          Cancel
        </button>
        <button
          class="btn flex-1 bg-error text-white hover:bg-error/80 sm:flex-none"
          on:click={handleDeleteAllFields}
          disabled={deletingAllFields}
        >
          {#if deletingAllFields}
            <span class="loading loading-spinner loading-sm"></span>
            Deleting...
          {:else}
            Delete All Fields
          {/if}
        </button>
      </form>
    </div>
  </div>
  <form method="dialog" class="modal-backdrop">
    <button>close</button>
  </form>
</dialog>

<!-- Delete Farm Fields Modal -->
<dialog id={deleteFarmModalId} class="modal modal-bottom sm:modal-middle">
  <div class="modal-box">
    <div class="flex items-center gap-3">
      <div
        class="flex h-10 w-10 items-center justify-center rounded-full bg-error/20"
      >
        <AlertTriangle class="h-5 w-5 text-error" />
      </div>
      <div>
        <h3 class="text-lg font-bold text-contrast-content">
          Delete Farm Fields
        </h3>
        <p class="text-sm text-contrast-content/60">
          This action cannot be undone
        </p>
      </div>
    </div>

    <div class="p-4">
      {#if farmToDelete}
        {@const farmEntry = farmGroups.find(([name]) => name === farmToDelete)}
        {@const farmFieldCount = farmEntry ? farmEntry[1].length : 0}
        <p class="mb-4 text-contrast-content">
          Are you sure you want to delete all <strong>{farmFieldCount}</strong>
          {farmFieldCount === 1 ? "field" : "fields"} from
          <strong>"{farmToDelete}"</strong>? Your trail and operational data
          will remain intact.
        </p>
        <div class="rounded-lg border border-error/30 bg-error/10 p-3">
          <p class="text-sm text-error">
            <strong>Warning:</strong> This will permanently delete all fields belonging
            to this farm.
          </p>
        </div>
      {/if}
    </div>

    <div class="modal-action">
      <form method="dialog" class="flex w-full gap-2 sm:w-auto">
        <button
          class="btn btn-outline flex-1 sm:flex-none"
          on:click={closeDeleteFarmModal}
          disabled={deletingFarmFields}
        >
          Cancel
        </button>
        <button
          class="btn flex-1 bg-error text-white hover:bg-error/80 sm:flex-none"
          on:click={handleDeleteFarmFields}
          disabled={deletingFarmFields}
        >
          {#if deletingFarmFields}
            <span class="loading loading-spinner loading-sm"></span>
            Deleting...
          {:else}
            Delete Farm Fields
          {/if}
        </button>
      </form>
    </div>
  </div>
  <form method="dialog" class="modal-backdrop">
    <button>close</button>
  </form>
</dialog>

<!-- Migrate Fields Modal -->
<dialog id={migrationModalId} class="modal modal-middle">
  <div
    class="modal-box max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-lg overflow-y-auto sm:w-full"
  >
    <div class="flex items-center gap-3">
      <div
        class="flex h-10 w-10 items-center justify-center rounded-full bg-info/20"
      >
        <ArrowRightLeft class="h-5 w-5 text-info" />
      </div>
      <div>
        <h3 class="text-lg font-bold text-contrast-content">Move Fields</h3>
        <p class="text-sm text-contrast-content/60">
          {#if migrationSourceFarm}
            Moving from "{migrationSourceFarm}"
          {:else}
            Select fields and choose a destination farm
          {/if}
        </p>
      </div>
    </div>

    <div class="mt-4 space-y-4">
      <!-- Field selection list -->
      <div>
        <div class="mb-2 flex items-center justify-between">
          <span class="text-sm font-medium text-contrast-content">
            Select fields to move ({selectedFieldIds.size} selected)
          </span>
          {#if migrationSourceFarm}
            <button
              class="text-xs text-info hover:underline"
              on:click={() =>
                migrationSourceFarm && selectAllInFarm(migrationSourceFarm)}
            >
              Toggle all
            </button>
          {/if}
        </div>
        <div class="max-h-48 overflow-y-auto rounded-lg border border-base-300">
          {#each fields.filter((f) => {
            if (!migrationSourceFarm) return true
            const entry = farmGroups.find(([name]) => name === migrationSourceFarm)
            const farmId = entry?.[2] || null
            return farmId ? f.farm_id === farmId : !f.farm_id
          }) as field (field.field_id)}
            <label
              class="flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors hover:bg-base-200"
              style={selectedFieldIds.has(field.field_id)
                ? "background: oklch(var(--in) / 0.05)"
                : ""}
            >
              <input
                type="checkbox"
                class="checkbox-info checkbox checkbox-sm"
                checked={selectedFieldIds.has(field.field_id)}
                on:change={() => toggleFieldSelection(field.field_id)}
              />
              <FieldIcon geojson={createGeoJSON(field.boundary)} size={24} />
              <span class="flex-1 text-sm text-contrast-content"
                >{field.name}</span
              >
              <span class="text-xs text-contrast-content/50"
                >{field.area.toFixed(1)} ha</span
              >
            </label>
          {/each}
        </div>
      </div>

      <!-- Target farm picker -->
      <div>
        <span class="mb-2 block text-sm font-medium text-contrast-content">
          Destination farm
        </span>
        <div class="space-y-2">
          {#each farmGroups as [groupName, , groupFarmId] (groupName)}
            {#if groupName !== migrationSourceFarm}
              <button
                class="flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors
                  {migrationTargetFarm === groupName
                  ? 'border-info bg-info/10 text-info'
                  : 'border-base-300 text-contrast-content hover:bg-base-200'}"
                on:click={() => {
                  migrationTargetFarm = groupName
                  migrationNewFarmName = ""
                }}
              >
                {#if migrationTargetFarm === groupName}
                  <Check class="h-4 w-4" />
                {:else}
                  <LandPlot class="h-4 w-4 opacity-50" />
                {/if}
                {groupName}
              </button>
            {/if}
          {/each}
          <!-- New farm option -->
          <button
            class="flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors
              {migrationTargetFarm === '__new__'
              ? 'border-info bg-info/10 text-info'
              : 'border-base-300 text-contrast-content hover:bg-base-200'}"
            on:click={() => (migrationTargetFarm = "__new__")}
          >
            {#if migrationTargetFarm === "__new__"}
              <Check class="h-4 w-4" />
            {:else}
              <span class="ml-0.5 text-base opacity-50">+</span>
            {/if}
            New farm name
          </button>
          {#if migrationTargetFarm === "__new__"}
            <Input
              bind:value={migrationNewFarmName}
              placeholder="Enter new farm name"
              maxlength={FARM_NAME_MAX_LENGTH}
              class="w-full"
            />
          {/if}
        </div>
      </div>
    </div>

    <div class="modal-action">
      <form method="dialog" class="flex w-full gap-2 sm:w-auto">
        <button
          class="btn btn-outline flex-1 sm:flex-none"
          on:click={closeMigrationModal}
          disabled={migratingFields}
        >
          Cancel
        </button>
        <button
          class="btn flex-1 bg-info text-white hover:bg-info/80 sm:flex-none"
          on:click={handleMigrateFields}
          disabled={!canMigrate || migratingFields}
        >
          {#if migratingFields}
            <span class="loading loading-spinner loading-sm"></span>
            Moving...
          {:else}
            Move {selectedFieldIds.size}
            {selectedFieldIds.size === 1 ? "field" : "fields"}
          {/if}
        </button>
      </form>
    </div>
  </div>
  <form method="dialog" class="modal-backdrop">
    <button>close</button>
  </form>
</dialog>

<!-- Export Fields Modal -->
<dialog id={exportModalId} class="modal modal-middle">
  <div
    class="modal-box max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-lg overflow-y-auto sm:w-full"
  >
    <div class="flex items-center gap-3">
      <div
        class="flex h-10 w-10 items-center justify-center rounded-full bg-info/20"
      >
        <Download class="h-5 w-5 text-info" />
      </div>
      <div>
        <h3 class="text-lg font-bold text-contrast-content">Export Fields</h3>
        <p class="text-sm text-contrast-content/60">
          Choose fields and an export format
        </p>
      </div>
    </div>

    <div class="mt-4 space-y-4">
      <div>
        <span class="mb-2 block text-sm font-medium text-contrast-content">
          Format
        </span>
        <div class="grid grid-cols-3 gap-2">
          <button
            class="flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors
              {exportFormat === 'geojson'
              ? 'border-info bg-info/10 text-info'
              : 'border-base-300 text-contrast-content hover:bg-base-200'}"
            on:click={() => (exportFormat = "geojson")}
          >
            {#if exportFormat === "geojson"}<Check class="h-4 w-4" />{/if}
            GeoJSON
          </button>
          <button
            class="flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors
              {exportFormat === 'kml'
              ? 'border-info bg-info/10 text-info'
              : 'border-base-300 text-contrast-content hover:bg-base-200'}"
            on:click={() => (exportFormat = "kml")}
          >
            {#if exportFormat === "kml"}<Check class="h-4 w-4" />{/if}
            KML
          </button>
          <button
            class="flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors
              {exportFormat === 'shapefile'
              ? 'border-info bg-info/10 text-info'
              : 'border-base-300 text-contrast-content hover:bg-base-200'}"
            on:click={() => (exportFormat = "shapefile")}
          >
            {#if exportFormat === "shapefile"}<Check class="h-4 w-4" />{/if}
            Shapefile
          </button>
        </div>
      </div>

      <div>
        <div class="mb-2 flex items-center justify-between gap-3">
          <span class="text-sm font-medium text-contrast-content">
            Select fields ({selectedExportCount} selected)
          </span>
          <button
            class="text-xs text-info hover:underline"
            on:click={toggleAllExportFields}
          >
            Toggle all
          </button>
        </div>
        <div class="max-h-56 overflow-y-auto rounded-lg border border-base-300">
          {#each exportableFields as field (field.field_id)}
            <label
              class="flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors hover:bg-base-200"
              style={exportFieldIds.has(field.field_id)
                ? "background: oklch(var(--in) / 0.05)"
                : ""}
            >
              <input
                type="checkbox"
                class="checkbox-info checkbox checkbox-sm"
                checked={exportFieldIds.has(field.field_id)}
                on:change={() => toggleExportFieldSelection(field.field_id)}
              />
              <FieldIcon geojson={createGeoJSON(field.boundary)} size={24} />
              <span class="min-w-0 flex-1 text-sm text-contrast-content">
                <span class="block truncate">{field.name}</span>
                {#if getFieldFarmName(field)}
                  <span class="block truncate text-xs text-contrast-content/50">
                    {getFieldFarmName(field)}
                  </span>
                {/if}
              </span>
              <span class="text-xs text-contrast-content/50">
                {Number(field.area || 0).toFixed(1)} ha
              </span>
            </label>
          {/each}
        </div>
        <div class="mt-2 flex items-center justify-between text-xs text-contrast-content/60">
          <span>{exportableFields.length} fields available</span>
          <span>{selectedExportArea.toFixed(1)} ha selected</span>
        </div>
      </div>
    </div>

    <div class="modal-action">
      <div class="flex w-full gap-2 sm:w-auto">
        <button
          type="button"
          class="btn btn-outline flex-1 sm:flex-none"
          on:click={closeExportModal}
          disabled={exportingFields}
        >
          Cancel
        </button>
        <button
          type="button"
          class="btn flex-1 bg-info text-white hover:bg-info/80 sm:flex-none"
          on:click={exportFields}
          disabled={!canExportFields}
        >
          {#if exportingFields}
            <span class="loading loading-spinner loading-sm"></span>
            Exporting...
          {:else}
            Export {selectedExportCount}
            {selectedExportCount === 1 ? "field" : "fields"}
          {/if}
        </button>
      </div>
    </div>
  </div>
  <form method="dialog" class="modal-backdrop">
    <button>close</button>
  </form>
</dialog>

<!-- Fields Overview -->
<div>
  <!-- Header: title + search + settings -->
  <div class="flex items-center gap-3 border-b border-base-300 p-4">
    <div class="flex flex-shrink-0 items-center gap-2">
      <div
        class="flex h-8 w-8 items-center justify-center rounded-full bg-base-content/10"
      >
        <LandPlot class="h-4 w-4 text-base-content" />
      </div>
      <h3 class="text-base font-bold text-contrast-content">Fields</h3>
      {#if fields.length > 0}
        <span
          class="rounded-full border border-base-content/20 bg-base-content/10 px-2 py-0.5 text-xs font-medium text-base-content"
        >
          {fields.length}
        </span>
      {/if}
    </div>

    {#if fields.length > 0}
      <div class="hidden h-6 w-px flex-shrink-0 bg-base-300 sm:block"></div>

      <div class="flex flex-1 items-center gap-2">
        <div class="relative min-w-0 flex-1">
          <Search
            class="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-contrast-content/40"
          />
          <input
            type="text"
            bind:value={searchTerm}
            placeholder="Search fields..."
            class="w-full rounded-lg border border-base-300 bg-base-100 py-1.5 pl-8 pr-3 text-sm text-contrast-content placeholder:text-contrast-content/40 focus:border-base-content/40 focus:outline-none"
          />
        </div>
        <div class="dropdown dropdown-end flex-shrink-0">
          <label
            tabindex="0"
            class="btn btn-ghost btn-sm"
            aria-label="Field options"
          >
            <Settings class="h-4 w-4 text-contrast-content" />
          </label>
          <ul
            tabindex="0"
            class="menu dropdown-content z-[1] w-48 rounded-lg border border-base-300 bg-base-100 p-2 shadow-lg"
          >
            <li>
              <button on:click={openExportModal}>
                <Download class="h-4 w-4" /> Export Fields
              </button>
            </li>
            <li>
              <button
                on:click={openDeleteAllModal}
                class="text-error hover:bg-error/10"
              >
                <Trash2 class="h-4 w-4" /> Delete All Fields
              </button>
            </li>
          </ul>
        </div>
      </div>
    {/if}
  </div>

  <!-- Card Content -->
  {#if fields.length === 0}
    <!-- No fields available -->
    <div class="py-12 text-center">
      <div
        class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-base-200"
      >
        <LandPlot class="h-6 w-6 text-contrast-content/60" />
      </div>
      <p class="mb-4 text-sm text-contrast-content/70">No fields available</p>
      <p class="text-xs text-contrast-content/60">
        Upload boundary files to create and manage your fields
      </p>
    </div>
  {:else}
    {#each displayGroups as [groupFarmName, groupFields] (groupFarmName)}
      <!-- Farm separator header (collapsible) -->
      <div class="flex items-center border-b border-base-300 bg-base-content/5">
        <button
          class="flex flex-1 items-center gap-2 px-4 py-2 text-left transition-colors hover:bg-base-content/10"
          on:click={() => toggleFarm(groupFarmName)}
        >
          {#if collapsedFarms.has(groupFarmName)}
            <ChevronDown class="h-4 w-4 text-contrast-content/60" />
          {:else}
            <ChevronUp class="h-4 w-4 text-contrast-content/60" />
          {/if}
          <LandPlot class="h-3.5 w-3.5 text-base-content" />
          <span class="text-sm font-semibold text-contrast-content"
            >{groupFarmName}</span
          >
          <span
            class="rounded-full border border-base-content/20 bg-base-content/10 px-2 py-0.5 text-xs font-medium text-base-content"
          >
            {groupFields.length}
          </span>
          <span class="ml-auto text-xs text-contrast-content/50">
            {groupFields.reduce((sum, f) => sum + f.area, 0).toFixed(1)} ha
          </span>
        </button>
        <button
          class="mr-2 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-contrast-content/40 transition-colors hover:bg-info/10 hover:text-info"
          title="Move fields from {groupFarmName}"
          aria-label="Move fields from {groupFarmName}"
          on:click={() => openMigrationModal(groupFarmName)}
        >
          <ArrowRightLeft class="h-4 w-4" />
        </button>
      </div>

      <!-- Field rows (narrow) -->
      {#if !collapsedFarms.has(groupFarmName)}
        <div class="divide-y divide-base-300/50">
          {#each groupFields as field (field.field_id)}
            <div
              class="group flex items-center gap-2.5 px-4 py-1.5 transition-colors hover:bg-base-200/50"
            >
              <div class="flex-shrink-0">
                <FieldIcon geojson={createGeoJSON(field.boundary)} size={28} />
              </div>
              <span
                class="min-w-0 flex-1 truncate text-sm font-medium text-contrast-content"
                >{field.name}</span
              >
              <span class="flex-shrink-0 text-xs text-contrast-content/60">
                {field.area.toFixed(1)} ha
              </span>
              <div class="dropdown dropdown-end flex-shrink-0">
                <label
                  tabindex="0"
                  class="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-contrast-content/60 transition-colors hover:bg-base-300 hover:text-contrast-content"
                  aria-label="Field actions"
                >
                  <MoreHorizontal class="h-4 w-4" />
                </label>
                <ul
                  tabindex="0"
                  class="menu dropdown-content z-[1] w-40 rounded-lg border border-base-300 bg-base-100 p-2 shadow-lg"
                >
                  <li>
                    <button on:click={() => openEditModal(field)}>
                      <SquarePen class="h-4 w-4" /> Edit
                    </button>
                  </li>
                  <li>
                    <button on:click={() => handleLocateField(field.field_id)}>
                      <MapPinned class="h-4 w-4" /> View on map
                    </button>
                  </li>
                  <li>
                    <button
                      on:click={() => openDeleteModal(field)}
                      class="text-error hover:bg-error/10"
                    >
                      <Trash2 class="h-4 w-4" /> Delete
                    </button>
                  </li>
                </ul>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    {/each}

    {#if displayGroups.length === 0}
      <div class="px-4 py-10 text-center text-sm text-contrast-content/60">
        No fields match "{searchTerm}"
      </div>
    {/if}
  {/if}
</div>

<style>
  /* Improved hover effects for table rows */
  :global(.table tbody tr) {
    transition: background-color 0.2s;
  }

  /* Custom styles for different view modes */
  @media (max-width: 640px) {
    .group .opacity-70 {
      opacity: 1;
    }
  }
</style>
