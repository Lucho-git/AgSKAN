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
    Plus,
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

  // Search filtering — narrow each farm group's fields by name. When searching,
  // drop non-matching groups; when not searching, keep empty farms visible
  // (sorted to the bottom).
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
    .filter(([, groupFields]) => !searchLower || groupFields.length > 0)
    .sort(([, a], [, b]) => {
      const aEmpty = a.length === 0 ? 1 : 0
      const bEmpty = b.length === 0 ? 1 : 0
      return aEmpty - bEmpty
    })

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
  let deletingFarmId: string | null = null
  let renamingFarmId: string | null = null
  let renameFarmName = ""

  // Add-farm (bottom of list) state
  let addingFarm = false
  let newFarmName = ""
  let creatingFarm = false

  // Field export state
  let exportModalId = "export-fields-modal"
  let exportFieldIds = new Set<string>()
  let exportFormat: ExportFormat = "geojson"
  let exportingFields = false

  // Farm migration state
  let migrationModalId = "migrate-fields-modal"
  let migrationMode = false
  let selectedFieldIds = new Set<string>()
  /// "From" farm — "__all__" means all farms, otherwise a specific farm name.
  let migrationSourceFarm = "__all__"
  /// "To" farm — an existing farm name, or "__new__" to create one.
  let migrationTargetFarm = ""
  let migrationNewFarmName = ""
  let migratingFields = false
  /// Track which farm we pre-fill in the "To" dropdown (from clicking an empty farm).
  let _migrationPresetTo: string | null = null

  // New state variables for responsive design
  let isMobile = false
  let displayMode = "table" // "table" or "list"
  let expandedDetails = new Set()
  let collapsedFarms = new Set<string>() // Track collapsed farm sections
  let collapsedExportFarms = new Set<string>() // Collapsed farms in export modal
  let collapsedMigrationFarms = new Set<string>() // Collapsed farms in migrate-in modal
  let sortField = "name"
  let sortDirection = "asc"
  let showSettingsMenu = false
  let openFarmMenu: string | null = null
  let openFieldMenu: string | null = null

  function closeAllDropdowns() {
    openFarmMenu = null
    openFieldMenu = null
    showSettingsMenu = false
  }

  function toggleFarmDropdown(farmId: string, e: MouseEvent) {
    e.stopPropagation()
    openFarmMenu = openFarmMenu === farmId ? null : farmId
  }

  function toggleFieldDropdown(fieldId: string, e: MouseEvent) {
    e.stopPropagation()
    openFieldMenu = openFieldMenu === fieldId ? null : fieldId
  }

  // Collapse all farm sections by default on first load when there are
  // multiple farms, so the list starts tidy.
  let didInitCollapse = false
  $: if (!didInitCollapse && farmGroups.length > 1) {
    collapsedFarms = new Set(farmGroups.map(([name]) => name))
    didInitCollapse = true
  }

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
  // Group exportable fields by farm for the export modal
  $: exportGroups = farmGroups
    .map(
      ([name, groupFields, farmId]) =>
        [name, groupFields.filter(hasExportableBoundary), farmId] as [
          string,
          any[],
          string | null,
        ],
    )
    .filter(([, groupFields]) => groupFields.length > 0)
  $: selectedExportCount = exportableFields.filter((field) =>
    exportFieldIds.has(field.field_id),
  ).length
  $: selectedExportArea = exportableFields
    .filter((field) => exportFieldIds.has(field.field_id))
    .reduce((sum, field) => sum + Number(field.area || 0), 0)
  $: canExportFields = selectedExportCount > 0 && !exportingFields
  $: allExportSelected =
    exportableFields.length > 0 &&
    exportableFields.every((field) => exportFieldIds.has(field.field_id))

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
    return (
      ($farmsStore || []).find((farm) => farm.id === field.farm_id)?.name || ""
    )
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
      features: fieldsToExport.filter(hasExportableBoundary).map((field) => ({
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

  function downloadTextFile(
    content: string,
    fileName: string,
    mimeType: string,
  ) {
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
    const coordinates = ring
      .filter(isValidCoordinate)
      .map(stripCoordinateDimensions)
    if (coordinates.length === 0) return []
    if (
      !coordinatesMatch(coordinates[0], coordinates[coordinates.length - 1])
    ) {
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
                coordinates: [
                  getShapefilePolygonCoordinates(geometry.coordinates),
                ],
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
    return exportableFields.filter((field) =>
      exportFieldIds.has(field.field_id),
    )
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

  function toggleExportFarm(groupFields: any[]) {
    const allSelected = groupFields.every((field) =>
      exportFieldIds.has(field.field_id),
    )
    if (allSelected) {
      groupFields.forEach((field) => exportFieldIds.delete(field.field_id))
    } else {
      groupFields.forEach((field) => exportFieldIds.add(field.field_id))
    }
    exportFieldIds = exportFieldIds
  }

  function toggleExportFarmCollapse(farmName: string) {
    if (collapsedExportFarms.has(farmName)) {
      collapsedExportFarms.delete(farmName)
    } else {
      collapsedExportFarms.add(farmName)
    }
    collapsedExportFarms = collapsedExportFarms
  }

  function openExportModal() {
    exportFieldIds = new Set(exportableFields.map((field) => field.field_id))
    exportFormat = "geojson"
    // Auto-collapse all farm groups by default when there's more than one.
    collapsedExportFarms =
      exportGroups.length > 1
        ? new Set(exportGroups.map(([name]) => name))
        : new Set()
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

  function openMigrationModal(farmName?: string) {
    if (farmName) {
      const entry = farmGroups.find(([name]) => name === farmName)
      const hasFields = entry ? entry[1].length > 0 : false
      if (hasFields) {
        // Farm has fields → select as source
        migrationSourceFarm = farmName
        migrationTargetFarm = ""
      } else {
        // Farm is empty → select as destination, source = all
        migrationSourceFarm = "__all__"
        _migrationPresetTo = farmName
        migrationTargetFarm = farmName
      }
    } else {
      migrationSourceFarm = "__all__"
      migrationTargetFarm = ""
    }
    // Pre-select all visible fields
    selectedFieldIds = new Set(
      migrationSourceFarm === "__all__"
        ? fields.map((f) => f.field_id)
        : fields
            .filter((f) => {
              const farmId = farmGroups.find(
                ([name]) => name === migrationSourceFarm,
              )?.[2]
              return farmId ? f.farm_id === farmId : !f.farm_id
            })
            .map((f) => f.field_id),
    )
    migrationNewFarmName = ""
    // Auto-collapse groups when showing all farms
    const srcGroups = farmGroups.filter(
      ([name, g]) => name !== migrationTargetFarm && g.length > 0,
    )
    collapsedMigrationFarms =
      srcGroups.length > 1
        ? new Set(srcGroups.map(([name]) => name))
        : new Set()
    const modal = document.getElementById(migrationModalId) as HTMLDialogElement
    if (modal) modal.showModal()
  }

  function closeMigrationModal() {
    const modal = document.getElementById(migrationModalId) as HTMLDialogElement
    if (modal) modal.close()
    selectedFieldIds = new Set()
    migrationSourceFarm = "__all__"
    migrationTargetFarm = ""
    migrationNewFarmName = ""
    _migrationPresetTo = null
  }

  function toggleFieldSelection(fieldId: string) {
    if (selectedFieldIds.has(fieldId)) {
      selectedFieldIds.delete(fieldId)
    } else {
      selectedFieldIds.add(fieldId)
    }
    selectedFieldIds = selectedFieldIds // reactivity
  }

  // Source farm id (null for "__all__" or when not found)
  $: _migrationSourceFarmId = (() => {
    if (migrationSourceFarm === "__all__") return null
    const entry = farmGroups.find(([name]) => name === migrationSourceFarm)
    return entry?.[2] ?? null
  })()

  // Fields selectable based on the "From" dropdown
  $: migrationFieldList =
    migrationSourceFarm === "__all__"
      ? fields
      : _migrationSourceFarmId
        ? fields.filter((f) => f.farm_id === _migrationSourceFarmId)
        : fields.filter((f) => !f.farm_id)

  $: allMigrationSelected =
    migrationFieldList.length > 0 &&
    migrationFieldList.every((f) => selectedFieldIds.has(f.field_id))

  // Farms eligible for the "From" dropdown — only those with fields.
  $: fromFarmOptions = farmGroups.filter(([, g]) => g.length > 0)

  // Farms eligible for the "To" dropdown — all farms except the source
  // when a specific source is selected.
  $: toFarmOptions = farmGroups.filter(
    ([name]) =>
      migrationSourceFarm === "__all__" || name !== migrationSourceFarm,
  )

  // Grouped view when "All farms" is selected (same UX as export).
  $: migrationInGroups =
    migrationSourceFarm === "__all__"
      ? farmGroups.filter(
          ([name, g]) => name !== migrationTargetFarm && g.length > 0,
        )
      : []

  function toggleAllMigrationFields() {
    const allSelected = migrationFieldList.every((f) =>
      selectedFieldIds.has(f.field_id),
    )
    if (allSelected) {
      migrationFieldList.forEach((f) => selectedFieldIds.delete(f.field_id))
    } else {
      migrationFieldList.forEach((f) => selectedFieldIds.add(f.field_id))
    }
    selectedFieldIds = selectedFieldIds
  }

  function toggleMigrationFarm(groupFields: any[]) {
    const allSelected = groupFields.every((f) =>
      selectedFieldIds.has(f.field_id),
    )
    if (allSelected) {
      groupFields.forEach((f) => selectedFieldIds.delete(f.field_id))
    } else {
      groupFields.forEach((f) => selectedFieldIds.add(f.field_id))
    }
    selectedFieldIds = selectedFieldIds
  }

  function toggleMigrationFarmCollapse(farmName: string) {
    if (collapsedMigrationFarms.has(farmName)) {
      collapsedMigrationFarms.delete(farmName)
    } else {
      collapsedMigrationFarms.add(farmName)
    }
    collapsedMigrationFarms = collapsedMigrationFarms
  }

  $: resolvedTargetFarm =
    migrationTargetFarm === "__new__"
      ? migrationNewFarmName.trim()
      : migrationTargetFarm

  $: canMigrate =
    selectedFieldIds.size > 0 &&
    resolvedTargetFarm.length > 0 &&
    resolvedTargetFarm !== migrationSourceFarm

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

  async function handleDeleteEmptyFarm(farmId: string, farmName: string) {
    deletingFarmId = farmId
    try {
      const result = await farmApi.deleteFarm(farmId)
      if (result.success) {
        farmsStore.update((farms) => farms.filter((f) => f.id !== farmId))
        toast.success(`Farm "${farmName}" deleted`)
      } else {
        throw new Error(result.message || "Failed to delete farm")
      }
    } catch (error) {
      toast.error(`Failed to delete farm "${farmName}". Please try again.`)
    } finally {
      deletingFarmId = null
    }
  }

  function startRenameFarm(farmId: string, currentName: string) {
    renamingFarmId = farmId
    renameFarmName = currentName
    openFarmMenu = null
  }

  function cancelRenameFarm() {
    renamingFarmId = null
    renameFarmName = ""
  }

  async function handleRenameFarm(farmId: string) {
    const name = renameFarmName.trim()
    if (!name || !farmId) return
    try {
      const result = await farmApi.renameFarm(farmId, name)
      if (result.success) {
        farmsStore.update((farms) =>
          farms.map((f) => (f.id === farmId ? { ...f, name } : f)),
        )
        toast.success(`Farm renamed to "${name}"`)
        renamingFarmId = null
        renameFarmName = ""
        closeFarmMenu()
      } else {
        throw new Error(result.message || "Failed to rename farm")
      }
    } catch (error) {
      toast.error("Failed to rename farm. Please try again.")
    }
  }

  function startAddFarm() {
    addingFarm = true
    newFarmName = ""
  }

  // Svelte action: focus an element as soon as it's mounted
  function autofocus(node: HTMLElement) {
    node.focus()
  }

  function cancelAddFarm() {
    addingFarm = false
    newFarmName = ""
  }

  async function handleAddFarm() {
    const name = newFarmName.trim()
    if (!name || creatingFarm) return
    creatingFarm = true
    try {
      const mapId = $connectedMapStore.id
      const result = await farmApi.createFarm(mapId, name)
      if (result.success && result.farm) {
        farmsStore.update((farms) => [...farms, result.farm!])
        toast.success(`Farm "${result.farm.name}" added`)
        addingFarm = false
        newFarmName = ""
      } else {
        throw new Error(result.message || "Failed to add farm")
      }
    } catch (error) {
      toast.error("Failed to add farm. Please try again.")
    } finally {
      creatingFarm = false
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
          Choose source and destination farms
        </p>
      </div>
    </div>

    <div class="mt-4 grid grid-cols-2 gap-3">
      <!-- From dropdown -->
      <div>
        <span
          class="mb-1 block text-[10px] font-medium uppercase tracking-wide text-contrast-content/50"
        >
          From
        </span>
        <select
          bind:value={migrationSourceFarm}
          on:change={() => (selectedFieldIds = new Set())}
          class="w-full rounded-lg border border-base-300 bg-base-100 p-2 text-xs text-contrast-content outline-none transition-colors focus:border-base-content sm:text-sm"
        >
          <option value="__all__">All farms</option>
          {#each fromFarmOptions as [name, g] (name)}
            <option value={name}>{name} ({g.length})</option>
          {/each}
        </select>
      </div>
      <!-- To dropdown -->
      <div>
        <span
          class="mb-1 block text-[10px] font-medium uppercase tracking-wide text-contrast-content/50"
        >
          To
        </span>
        <select
          bind:value={migrationTargetFarm}
          class="w-full rounded-lg border border-base-300 bg-base-100 p-2 text-xs text-contrast-content outline-none transition-colors focus:border-base-content sm:text-sm"
        >
          <option value="">Choose farm</option>
          {#each toFarmOptions as [name, g] (name)}
            <option value={name}>{name}</option>
          {/each}
          <option value="__new__">+ New farm</option>
        </select>
        {#if migrationTargetFarm === "__new__"}
          <input
            type="text"
            bind:value={migrationNewFarmName}
            placeholder="Enter new farm name"
            maxlength={FARM_NAME_MAX_LENGTH}
            class="mt-2 w-full rounded-lg border border-base-300 bg-base-100 p-2 text-xs text-contrast-content outline-none transition-colors focus:border-base-content sm:text-sm"
          />
        {/if}
      </div>
    </div>

    <!-- Field selection list -->
    <div class="mt-4">
      <div class="mb-2 flex items-center justify-between">
        <span class="text-xs font-medium text-contrast-content sm:text-sm">
          Select fields ({selectedFieldIds.size} selected)
        </span>
        {#if migrationFieldList.length > 0}
          <button
            class="text-xs text-contrast-content/60 hover:text-contrast-content hover:underline"
            on:click={toggleAllMigrationFields}
          >
            {allMigrationSelected ? "Deselect all" : "Select all"}
          </button>
        {/if}
      </div>
      <div class="overflow-hidden rounded-lg border border-base-300">
        <div class="max-h-48 overflow-y-auto">
          {#if migrationSourceFarm === "__all__"}
            {#each migrationInGroups as [groupName, groupFields, groupFarmId] (groupName)}
              <div
                class="sticky top-0 z-[1] flex items-center justify-between gap-2 border-b border-base-300 bg-base-200 px-3 py-1.5"
              >
                <button
                  type="button"
                  class="flex min-w-0 flex-1 items-center gap-2 text-left"
                  on:click={() => toggleMigrationFarmCollapse(groupName)}
                >
                  {#if collapsedMigrationFarms.has(groupName)}
                    <ChevronDown class="h-3.5 w-3.5 flex-shrink-0 text-contrast-content/50" />
                  {:else}
                    <ChevronUp class="h-3.5 w-3.5 flex-shrink-0 text-contrast-content/50" />
                  {/if}
                  <LandPlot class="h-3.5 w-3.5 flex-shrink-0 text-base-content" />
                  <span class="truncate text-xs font-semibold text-contrast-content">
                    {groupName}
                  </span>
                  <span class="text-xs text-contrast-content/50">
                    ({groupFields.length})
                  </span>
                </button>
                <input
                  type="checkbox"
                  class="checkbox checkbox-xs flex-shrink-0"
                  checked={groupFields.every((f) =>
                    selectedFieldIds.has(f.field_id),
                  )}
                  on:change={() => toggleMigrationFarm(groupFields)}
                />
              </div>
              {#if !collapsedMigrationFarms.has(groupName)}
                {#each groupFields as field (field.field_id)}
                  <label
                    class="flex cursor-pointer items-center gap-4 px-3 py-2 transition-colors hover:bg-base-200"
                    style={selectedFieldIds.has(field.field_id)
                      ? "background: oklch(var(--bc) / 0.05)"
                      : ""}
                  >
                    <FieldIcon geojson={createGeoJSON(field.boundary)} size={20} />
                    <span class="min-w-0 flex-1 truncate text-xs text-contrast-content sm:text-sm">
                      {field.name}
                    </span>
                    <span class="text-xs text-contrast-content/50"
                      >{field.area.toFixed(1)} ha</span
                    >
                    <input
                      type="checkbox"
                      class="checkbox checkbox-xs"
                      checked={selectedFieldIds.has(field.field_id)}
                      on:change={() => toggleFieldSelection(field.field_id)}
                    />
                  </label>
                {/each}
              {/if}
            {/each}
          {:else}
            {#each migrationFieldList as field (field.field_id)}
              <label
                class="flex cursor-pointer items-center gap-4 px-3 py-2 transition-colors hover:bg-base-200"
                style={selectedFieldIds.has(field.field_id)
                  ? "background: oklch(var(--bc) / 0.05)"
                  : ""}
              >
                <FieldIcon geojson={createGeoJSON(field.boundary)} size={20} />
                <span class="min-w-0 flex-1 truncate text-xs text-contrast-content sm:text-sm">
                  {field.name}
                </span>
                <span class="text-xs text-contrast-content/50"
                  >{field.area.toFixed(1)} ha</span
                >
                <input
                  type="checkbox"
                  class="checkbox checkbox-xs"
                  checked={selectedFieldIds.has(field.field_id)}
                  on:change={() => toggleFieldSelection(field.field_id)}
                />
              </label>
            {/each}
          {/if}
          {#if migrationFieldList.length === 0}
            <div class="px-3 py-6 text-center text-xs text-contrast-content/50">
              No fields available to move.
            </div>
          {/if}
        </div>
      </div>
    </div>

    <div class="modal-action">
      <form method="dialog" class="flex w-full gap-2">
        <button
          class="flex-1 rounded-lg border border-base-300 bg-base-100 py-2 text-xs font-medium text-contrast-content transition-colors hover:bg-base-300 sm:text-sm"
          on:click={closeMigrationModal}
          disabled={migratingFields}
        >
          Cancel
        </button>
        <button
          class="flex flex-1 items-center justify-center gap-2 rounded-lg bg-base-content py-2 text-xs font-medium text-base-100 transition-colors hover:bg-base-content/90 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
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
        <span
          class="mb-2 block text-xs font-medium text-contrast-content sm:text-sm"
        >
          Format
        </span>
        <div class="grid grid-cols-3 gap-2">
          <button
            class="flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors sm:text-sm
              {exportFormat === 'geojson'
              ? 'border-base-content bg-base-content/10 text-contrast-content'
              : 'border-base-300 text-contrast-content hover:bg-base-200'}"
            on:click={() => (exportFormat = "geojson")}
          >
            {#if exportFormat === "geojson"}<Check class="h-4 w-4" />{/if}
            GeoJSON
          </button>
          <button
            class="flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors sm:text-sm
              {exportFormat === 'kml'
              ? 'border-base-content bg-base-content/10 text-contrast-content'
              : 'border-base-300 text-contrast-content hover:bg-base-200'}"
            on:click={() => (exportFormat = "kml")}
          >
            {#if exportFormat === "kml"}<Check class="h-4 w-4" />{/if}
            KML
          </button>
          <button
            class="flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors sm:text-sm
              {exportFormat === 'shapefile'
              ? 'border-base-content bg-base-content/10 text-contrast-content'
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
          <span class="text-xs font-medium text-contrast-content sm:text-sm">
            Select fields ({selectedExportCount} selected)
          </span>
          <button
            class="text-xs text-contrast-content/60 hover:text-contrast-content hover:underline"
            on:click={toggleAllExportFields}
          >
            {allExportSelected ? "Deselect all" : "Select all"}
          </button>
        </div>
        <div class="overflow-hidden rounded-lg border border-base-300">
          <div class="max-h-56 overflow-y-auto">
            {#each exportGroups as [groupName, groupFields, groupFarmId] (groupName)}
              <!-- Farm group header -->
              <div
                class="sticky top-0 z-[1] flex items-center justify-between gap-2 border-b border-base-300 bg-base-200 px-3 py-1.5"
              >
                <button
                  type="button"
                  class="flex min-w-0 flex-1 items-center gap-2 text-left"
                  on:click={() => toggleExportFarmCollapse(groupName)}
                >
                  {#if collapsedExportFarms.has(groupName)}
                    <ChevronDown
                      class="h-3.5 w-3.5 flex-shrink-0 text-contrast-content/50"
                    />
                  {:else}
                    <ChevronUp
                      class="h-3.5 w-3.5 flex-shrink-0 text-contrast-content/50"
                    />
                  {/if}
                  <LandPlot
                    class="h-3.5 w-3.5 flex-shrink-0 text-base-content"
                  />
                  <span
                    class="truncate text-xs font-semibold text-contrast-content"
                  >
                    {groupName}
                  </span>
                  <span class="text-xs text-contrast-content/50">
                    ({groupFields.length})
                  </span>
                </button>
                <input
                  type="checkbox"
                  class="checkbox checkbox-xs flex-shrink-0"
                  title="Select all in {groupName}"
                  aria-label="Select all in {groupName}"
                  checked={groupFields.every((f) =>
                    exportFieldIds.has(f.field_id),
                  )}
                  on:change={() => toggleExportFarm(groupFields)}
                />
              </div>
              {#if !collapsedExportFarms.has(groupName)}
                {#each groupFields as field (field.field_id)}
                  <label
                    class="flex cursor-pointer items-center gap-4 px-3 py-2 transition-colors hover:bg-base-200"
                    style={exportFieldIds.has(field.field_id)
                      ? "background: oklch(var(--bc) / 0.05)"
                      : ""}
                  >
                    <FieldIcon
                      geojson={createGeoJSON(field.boundary)}
                      size={20}
                    />
                    <span
                      class="min-w-0 flex-1 truncate text-xs text-contrast-content sm:text-sm"
                    >
                      {field.name}
                    </span>
                    <span class="text-xs text-contrast-content/50">
                      {Number(field.area || 0).toFixed(1)} ha
                    </span>
                    <input
                      type="checkbox"
                      class="checkbox checkbox-xs"
                      checked={exportFieldIds.has(field.field_id)}
                      on:change={() =>
                        toggleExportFieldSelection(field.field_id)}
                    />
                  </label>
                {/each}
              {/if}
            {/each}
          </div>
        </div>
        <div
          class="mt-2 flex items-center justify-between text-xs text-contrast-content/60"
        >
          <span>{exportableFields.length} fields available</span>
          <span>{selectedExportArea.toFixed(1)} ha selected</span>
        </div>
      </div>
    </div>

    <div class="modal-action">
      <div class="flex w-full gap-2">
        <button
          type="button"
          class="flex-1 rounded-lg border border-base-300 bg-base-100 py-2 text-xs font-medium text-contrast-content transition-colors hover:bg-base-300 sm:text-sm"
          on:click={closeExportModal}
          disabled={exportingFields}
        >
          Cancel
        </button>
        <button
          type="button"
          class="flex flex-1 items-center justify-center gap-2 rounded-lg bg-base-content py-2 text-xs font-medium text-base-100 transition-colors hover:bg-base-content/90 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
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
<svelte:window on:click={closeAllDropdowns} />
<div>
  <!-- Header: search + settings -->
  {#if fields.length > 0}
    <div class="flex items-center gap-2 border-b border-base-300 p-4">
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
      <div class="dropdown dropdown-end flex-shrink-0" on:click|stopPropagation>
        <button
          type="button"
          class="btn btn-ghost btn-sm"
          aria-label="Field options"
          on:click={() => (showSettingsMenu = !showSettingsMenu)}
        >
          <Settings class="h-4 w-4 text-contrast-content" />
        </button>
        {#if showSettingsMenu}
          <ul
            class="menu dropdown-content z-[1] w-48 rounded-lg border border-base-300 bg-base-100 p-1 shadow-lg"
          >
            <li>
              <button
                on:click={() => {
                  showSettingsMenu = false
                  openExportModal()
                }}
                class="flex w-full items-center gap-3 px-3 py-2 text-xs text-contrast-content transition-colors hover:bg-base-200 sm:px-4 sm:text-sm"
              >
                <div
                  class="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600/20 sm:h-6 sm:w-6"
                >
                  <Download class="h-2.5 w-2.5 text-blue-600 sm:h-3 sm:w-3" />
                </div>
                Export Fields
              </button>
            </li>
            <li>
              <button
                on:click={() => {
                  showSettingsMenu = false
                  openDeleteAllModal()
                }}
                class="flex w-full items-center gap-3 px-3 py-2 text-xs text-red-600 transition-colors hover:bg-base-200 sm:px-4 sm:text-sm"
              >
                <div
                  class="flex h-5 w-5 items-center justify-center rounded-full bg-red-600/20 sm:h-6 sm:w-6"
                >
                  <Trash2 class="h-2.5 w-2.5 text-red-600 sm:h-3 sm:w-3" />
                </div>
                Delete All Fields
              </button>
            </li>
          </ul>
        {/if}
      </div>
    </div>
  {/if}

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
    {#each displayGroups as [groupFarmName, groupFields, groupFarmId] (groupFarmName)}
      <!-- Farm separator header (collapsible) -->
      <div
        class="relative flex items-center border-b border-base-300 bg-base-content/5"
      >
        <button
          class="flex flex-1 items-center gap-2 px-4 py-2 text-left transition-colors hover:bg-base-content/10"
          on:click={() => toggleFarm(groupFarmName)}
        >
          {#if groupFields.length === 0}
            <span class="h-4 w-4 flex-shrink-0"></span>
          {:else if collapsedFarms.has(groupFarmName)}
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
        {#if groupFarmId}
          <button
            type="button"
            class="mr-2 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-contrast-content/40 transition-colors hover:bg-base-300 hover:text-contrast-content"
            aria-label="Farm actions"
            on:click={(e) => toggleFarmDropdown(groupFarmId, e)}
          >
            <MoreHorizontal class="h-4 w-4" />
          </button>
          {#if openFarmMenu === groupFarmId}
            <ul
              class="absolute right-2 top-full z-50 mt-1 w-48 rounded-lg border border-base-300 bg-base-100 py-1 shadow-lg"
              on:click|stopPropagation
            >
              {#if groupFields.length > 0}
                <li>
                  <button
                    on:click={() => {
                      openFarmMenu = null
                      openMigrationModal(groupFarmName)
                    }}
                    class="flex w-full items-center gap-3 px-3 py-2 text-xs text-contrast-content transition-colors hover:bg-base-200 sm:px-4 sm:text-sm"
                  >
                    <div
                      class="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600/20 sm:h-6 sm:w-6"
                    >
                      <ArrowRightLeft
                        class="h-2.5 w-2.5 text-blue-600 sm:h-3 sm:w-3"
                      />
                    </div>
                    Transfer fields
                  </button>
                </li>
              {:else}
                <li>
                  <button
                    on:click={() => {
                      openFarmMenu = null
                      openMigrationModal(groupFarmName)
                    }}
                    class="flex w-full items-center gap-3 px-3 py-2 text-xs text-contrast-content transition-colors hover:bg-base-200 sm:px-4 sm:text-sm"
                  >
                    <div
                      class="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600/20 sm:h-6 sm:w-6"
                    >
                      <ArrowRightLeft
                        class="h-2.5 w-2.5 text-blue-600 sm:h-3 sm:w-3"
                      />
                    </div>
                    Transfer fields
                  </button>
                </li>
              {/if}
              <li>
                <button
                  on:click={() => startRenameFarm(groupFarmId, groupFarmName)}
                  class="flex w-full items-center gap-3 px-3 py-2 text-xs text-contrast-content transition-colors hover:bg-base-200 sm:px-4 sm:text-sm"
                >
                  <div
                    class="flex h-5 w-5 items-center justify-center rounded-full bg-yellow-600/20 sm:h-6 sm:w-6"
                  >
                    <SquarePen
                      class="h-2.5 w-2.5 text-yellow-600 sm:h-3 sm:w-3"
                    />
                  </div>
                  Rename farm
                </button>
              </li>
              {#if groupFields.length === 0}
                <li>
                  <button
                    disabled={deletingFarmId === groupFarmId}
                    on:click={() => {
                      openFarmMenu = null
                      handleDeleteEmptyFarm(groupFarmId, groupFarmName)
                    }}
                    class="flex w-full items-center gap-3 px-3 py-2 text-xs text-red-600 transition-colors hover:bg-base-200 disabled:opacity-50 sm:px-4 sm:text-sm"
                  >
                    <div
                      class="flex h-5 w-5 items-center justify-center rounded-full bg-red-600/20 sm:h-6 sm:w-6"
                    >
                      <Trash2 class="h-2.5 w-2.5 text-red-600 sm:h-3 sm:w-3" />
                    </div>
                    Delete
                  </button>
                </li>
              {/if}
            </ul>
          {/if}
        {/if}
      </div>

      <!-- Rename farm inline (rendered below the farm header) -->
      {#if renamingFarmId === groupFarmId}
        <div class="flex items-center gap-2 border-b border-base-300 px-4 py-2">
          <input
            type="text"
            bind:value={renameFarmName}
            use:autofocus
            maxlength={FARM_NAME_MAX_LENGTH}
            on:keydown={(e) => {
              if (e.key === "Enter") handleRenameFarm(groupFarmId)
              if (e.key === "Escape") cancelRenameFarm()
            }}
            class="min-w-0 flex-1 rounded-lg border border-base-300 bg-base-100 p-2 text-xs text-contrast-content outline-none transition-colors focus:border-base-content sm:text-sm"
          />
          <button
            class="rounded-lg border border-base-300 bg-base-100 px-3 py-2 text-xs font-medium text-contrast-content transition-colors hover:bg-base-300 sm:text-sm"
            on:click={cancelRenameFarm}
          >
            Cancel
          </button>
          <button
            class="rounded-lg bg-base-content px-3 py-2 text-xs font-medium text-base-100 transition-colors hover:bg-base-content/90 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
            on:click={() => handleRenameFarm(groupFarmId)}
            disabled={!renameFarmName.trim()}
          >
            Rename
          </button>
        </div>
      {/if}

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
              <div class="relative flex-shrink-0">
                <button
                  type="button"
                  class="flex h-7 w-7 items-center justify-center rounded-lg text-contrast-content/60 transition-colors hover:bg-base-300 hover:text-contrast-content"
                  aria-label="Field actions"
                  on:click={(e) => toggleFieldDropdown(field.field_id, e)}
                >
                  <MoreHorizontal class="h-4 w-4" />
                </button>
                {#if openFieldMenu === field.field_id}
                  <div
                    class="absolute right-0 top-full z-50 mt-1 w-44 rounded-lg border border-base-300 bg-base-100 py-1 shadow-lg"
                    on:click|stopPropagation
                  >
                    <button
                      type="button"
                      on:click={() => {
                        openFieldMenu = null
                        openEditModal(field)
                      }}
                      class="flex w-full items-center gap-3 px-3 py-2 text-xs text-contrast-content transition-colors hover:bg-base-200 sm:px-4 sm:text-sm"
                    >
                      <div
                        class="flex h-5 w-5 items-center justify-center rounded-full bg-yellow-600/20 sm:h-6 sm:w-6"
                      >
                        <SquarePen
                          class="h-2.5 w-2.5 text-yellow-600 sm:h-3 sm:w-3"
                        />
                      </div>
                      Edit
                    </button>
                    <button
                      type="button"
                      on:click={() => {
                        openFieldMenu = null
                        handleLocateField(field.field_id)
                      }}
                      class="flex w-full items-center gap-3 px-3 py-2 text-xs text-contrast-content transition-colors hover:bg-base-200 sm:px-4 sm:text-sm"
                    >
                      <div
                        class="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600/20 sm:h-6 sm:w-6"
                      >
                        <MapPinned
                          class="h-2.5 w-2.5 text-blue-600 sm:h-3 sm:w-3"
                        />
                      </div>
                      View on map
                    </button>
                    <button
                      type="button"
                      on:click={() => {
                        openFieldMenu = null
                        openDeleteModal(field)
                      }}
                      class="flex w-full items-center gap-3 px-3 py-2 text-xs text-red-600 transition-colors hover:bg-base-200 sm:px-4 sm:text-sm"
                    >
                      <div
                        class="flex h-5 w-5 items-center justify-center rounded-full bg-red-600/20 sm:h-6 sm:w-6"
                      >
                        <Trash2
                          class="h-2.5 w-2.5 text-red-600 sm:h-3 sm:w-3"
                        />
                      </div>
                      Delete
                    </button>
                  </div>
                {/if}
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

    <!-- Add farm (bottom) -->
    {#if !searchLower}
      <div class="border-t border-base-300 p-3">
        {#if addingFarm}
          <div class="flex items-center gap-2">
            <input
              type="text"
              bind:value={newFarmName}
              use:autofocus
              placeholder="New farm name"
              maxlength={FARM_NAME_MAX_LENGTH}
              on:keydown={(e) => {
                if (e.key === "Enter") handleAddFarm()
                if (e.key === "Escape") cancelAddFarm()
              }}
              class="min-w-0 flex-1 rounded-lg border border-base-300 bg-base-100 p-2 text-xs text-contrast-content outline-none transition-colors focus:border-base-content sm:text-sm"
            />
            <button
              class="rounded-lg border border-base-300 bg-base-100 px-3 py-2 text-xs font-medium text-contrast-content transition-colors hover:bg-base-300 sm:text-sm"
              on:click={cancelAddFarm}
              disabled={creatingFarm}
            >
              Cancel
            </button>
            <button
              class="rounded-lg bg-base-content px-3 py-2 text-xs font-medium text-base-100 transition-colors hover:bg-base-content/90 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
              on:click={handleAddFarm}
              disabled={creatingFarm || !newFarmName.trim()}
            >
              {creatingFarm ? "Adding..." : "Add"}
            </button>
          </div>
        {:else}
          <button
            class="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-base-300 py-2 text-xs font-medium text-contrast-content/70 transition-colors hover:border-base-content/40 hover:bg-base-200 hover:text-contrast-content sm:text-sm"
            on:click={startAddFarm}
          >
            <Plus class="h-4 w-4" />
            Add farm
          </button>
        {/if}
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
