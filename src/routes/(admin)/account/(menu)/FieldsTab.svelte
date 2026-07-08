<script lang="ts">
  import { onMount, onDestroy } from "svelte"
  import { browser } from "$app/environment"
  import { goto } from "$app/navigation"
  import { toast } from "svelte-sonner"

  import { fileApi } from "$lib/api/fileApi"
  import { farmApi } from "$lib/api/farmApi"
  import { fieldStore } from "$lib/stores/fieldStore"
  import { farmsStore } from "$lib/stores/farmsStore"
  import { connectedMapStore } from "$lib/stores/connectedMapStore"
  import { userFilesStore } from "./fieldview/userFilesStore"

  import FieldsOverview from "./fieldview/FieldsOverview.svelte"
  import DuplicateFieldCleaner from "./fieldview/DuplicateFieldCleaner.svelte"

  import {
    LandPlot,
    Upload,
    Ruler,
    Layers,
    HelpCircle,
    Download,
    File as FileIcon,
    X,
    CheckCircle,
    AlertCircle,
    Cloud,
    Play,
    Trash2,
  } from "lucide-svelte"

  $: fields = $fieldStore || []
  $: hasFields = fields.length > 0
  $: totalArea = fields.reduce((sum, f: any) => sum + Number(f.area || 0), 0)
  $: farmCount = ($farmsStore || []).length
  $: userFiles = $userFilesStore || []

  // ========================================
  // DATA LOADING
  // ========================================
  let loading = true
  let loadError: string | null = null

  async function loadFieldData() {
    if (!browser) return
    loading = true
    loadError = null

    try {
      try {
        const filesData = await fileApi.getUserFiles()
        userFilesStore.set(filesData)
      } catch (e) {
        console.error("Error fetching files:", e)
      }

      const fieldsResult = await fileApi.loadFields()
      if (fieldsResult.error) {
        loadError = fieldsResult.error
      } else {
        const fieldsData = fieldsResult.fields || []
        fieldStore.set(fieldsData)

        const mapId = fieldsData[0]?.map_id || $connectedMapStore?.id
        if (mapId) {
          const farmsResult = await farmApi.loadFarms(mapId)
          if (!farmsResult.error) {
            farmsStore.set(farmsResult.farms)
          }
        }
      }
    } catch (e: any) {
      console.error("Error loading field data:", e)
      loadError = e?.message || "Failed to load field data"
    } finally {
      loading = false
    }
  }

  onMount(() => {
    loadFieldData()
  })

  // ========================================
  // NAVIGATION TO PROCESS WIZARD
  // ========================================
  function navigateToProcess(fileId: string, fileName: string) {
    const params = new URLSearchParams({
      fileId,
      fileName,
      returnUrl: "/account?tab=fields",
    })
    goto(`/account/fieldview/process?${params.toString()}`)
  }

  // ========================================
  // UPLOAD MODAL STATE
  // ========================================
  let showUploadModal = false
  let uploadDialogEl: HTMLDialogElement
  let showHelpModal = false
  let helpDialogEl: HTMLDialogElement

  $: if (showHelpModal && helpDialogEl && !helpDialogEl.open) {
    helpDialogEl.showModal()
  } else if (!showHelpModal && helpDialogEl?.open) {
    helpDialogEl.close()
  }

  function openHelpModal() {
    showHelpModal = true
  }

  function closeHelpModal() {
    showHelpModal = false
  }

  $: if (showUploadModal && uploadDialogEl && !uploadDialogEl.open) {
    uploadDialogEl.showModal()
  } else if (!showUploadModal && uploadDialogEl?.open) {
    uploadDialogEl.close()
  }

  function openUploadModal() {
    showUploadModal = true
  }

  function closeUploadModal() {
    showUploadModal = false
    resetUploadState()
  }

  // ========================================
  // FILE HELPERS
  // ========================================
  function formatDate(dateString: string): string {
    if (!dateString) return "Unknown date"
    return new Date(dateString).toLocaleDateString()
  }

  let deletingFileId: string | null = null

  async function deleteFile(fileId: string, fileName: string) {
    deletingFileId = fileId
    try {
      const result = await fileApi.deleteFile(fileName)
      if (result.success) {
        userFilesStore.update((files: any) =>
          files.filter((f: any) => f.id !== fileId),
        )
        toast.success(`Deleted "${fileName}"`)
      } else {
        throw new Error(result.message || "Failed to delete file")
      }
    } catch (e) {
      toast.error(`Failed to delete "${fileName}". Please try again.`)
    } finally {
      deletingFileId = null
    }
  }

  // ========================================
  // UPLOAD STATE + LOGIC
  // ========================================
  let fileInput: HTMLInputElement
  let isDragging = false
  let uploadedFile: File | null = null
  let uploadError: string | null = null
  let uploadStatus:
    | "loading"
    | "success"
    | "error"
    | "processing"
    | "validating"
    | null = null
  let fileInfo = ""
  let uploadStartTime = 0

  const MIN_ANIMATION_TIME = 2000
  const SUCCESS_DISPLAY_TIME = 2500
  const MAX_FILE_SIZE = 50 * 1024 * 1024
  const ACCEPTED_EXTENSIONS = [
    ".zip",
    ".kml",
    ".kmz",
    ".geojson",
    ".xml",
    ".isoxml",
  ]

  $: isProcessing =
    uploadStatus === "validating" ||
    uploadStatus === "processing" ||
    uploadStatus === "loading"
  $: hasError = uploadStatus === "error"
  $: hasSuccess = uploadStatus === "success"

  function geoJsonHasPolygonGeometry(geometry: any): boolean {
    if (!geometry || typeof geometry !== "object") return false
    if (geometry.type === "Polygon" || geometry.type === "MultiPolygon") {
      return true
    }
    if (geometry.type === "GeometryCollection") {
      return (
        Array.isArray(geometry.geometries) &&
        geometry.geometries.some(geoJsonHasPolygonGeometry)
      )
    }
    return false
  }

  function geoJsonHasBoundaryFeature(geojson: any): boolean {
    if (!geojson || typeof geojson !== "object") return false
    if (geojson.type === "FeatureCollection") {
      return (
        Array.isArray(geojson.features) &&
        geojson.features.some((feature: any) =>
          geoJsonHasPolygonGeometry(feature?.geometry),
        )
      )
    }
    if (geojson.type === "Feature") {
      return geoJsonHasPolygonGeometry(geojson.geometry)
    }
    return geoJsonHasPolygonGeometry(geojson)
  }

  function validateBasicFile(file: File): {
    isValid: boolean
    error?: string
  } {
    if (file.size > MAX_FILE_SIZE) {
      return {
        isValid: false,
        error: `File is too large (${(file.size / (1024 * 1024)).toFixed(
          1,
        )}MB). Maximum size is 50MB.`,
      }
    }
    if (file.size === 0) {
      return {
        isValid: false,
        error: "File appears to be empty. Please select a valid file.",
      }
    }
    const fileName = file.name.toLowerCase()
    const hasValidExtension = ACCEPTED_EXTENSIONS.some((ext) =>
      fileName.endsWith(ext),
    )
    if (!hasValidExtension) {
      return {
        isValid: false,
        error: `Invalid file type "${fileName
          .split(".")
          .pop()
          ?.toUpperCase()}". Please upload ZIP, KML, GeoJSON, KMZ, or ISOXML files.`,
      }
    }
    return { isValid: true }
  }

  async function validateFileStructure(
    file: File,
  ): Promise<{ isValid: boolean; error?: string; info?: string }> {
    const fileName = file.name.toLowerCase()
    if (fileName.endsWith(".zip")) return await validateZipFile(file)
    if (fileName.endsWith(".kml") || fileName.endsWith(".kmz"))
      return await validateKmlFile(file)
    if (fileName.endsWith(".geojson")) return await validateGeoJsonFile(file)
    if (fileName.endsWith(".xml") || fileName.endsWith(".isoxml"))
      return await validateXmlFile(file)
    return { isValid: true, info: "File appears to be valid" }
  }

  async function validateZipFile(
    file: File,
  ): Promise<{ isValid: boolean; error?: string; info?: string }> {
    try {
      const JSZip = (await import("jszip")).default
      const zip = new JSZip()
      const zipContents = await zip.loadAsync(file)
      const fileNames = Object.keys(zipContents.files)

      if (fileNames.length === 0) {
        return { isValid: false, error: "ZIP file is empty" }
      }

      const hasShp = fileNames.some((n) => n.toLowerCase().endsWith(".shp"))
      const hasDbf = fileNames.some((n) => n.toLowerCase().endsWith(".dbf"))
      const hasShx = fileNames.some((n) => n.toLowerCase().endsWith(".shx"))
      const hasKml = fileNames.some((n) => n.toLowerCase().endsWith(".kml"))
      const hasGeoJson = fileNames.some((n) =>
        n.toLowerCase().endsWith(".geojson"),
      )
      const hasIsoxml = fileNames.some(
        (n) =>
          n.toLowerCase().endsWith(".xml") ||
          n.toLowerCase().endsWith(".isoxml"),
      )
      const hasNestedZip = fileNames.some((n) =>
        n.toLowerCase().endsWith(".zip"),
      )

      if (hasShp) {
        if (!hasDbf || !hasShx) {
          const missing = []
          if (!hasDbf) missing.push(".dbf")
          if (!hasShx) missing.push(".shx")
          return {
            isValid: false,
            error: `Shapefile is missing required components: ${missing.join(
              ", ",
            )}. Please ensure your ZIP contains .shp, .dbf, and .shx files.`,
          }
        }
        const shapefiles = fileNames.filter((n) =>
          n.toLowerCase().endsWith(".shp"),
        )
        return {
          isValid: true,
          info: `Valid shapefile ZIP containing ${shapefiles.length} shapefile(s)`,
        }
      } else if (hasKml) {
        const kmlFiles = fileNames.filter((n) =>
          n.toLowerCase().endsWith(".kml"),
        )
        return {
          isValid: true,
          info: `Valid KML ZIP containing ${kmlFiles.length} KML file(s)`,
        }
      } else if (hasGeoJson) {
        const geoJsonFiles = fileNames.filter((n) =>
          n.toLowerCase().endsWith(".geojson"),
        )
        return {
          isValid: true,
          info: `Valid GeoJSON ZIP containing ${geoJsonFiles.length} GeoJSON file(s)`,
        }
      } else if (hasIsoxml) {
        const xmlFiles = fileNames.filter(
          (n) =>
            n.toLowerCase().endsWith(".xml") ||
            n.toLowerCase().endsWith(".isoxml"),
        )
        return {
          isValid: true,
          info: `Valid ISOXML ZIP containing ${xmlFiles.length} XML file(s)`,
        }
      } else if (hasNestedZip) {
        return {
          isValid: true,
          info: "ZIP contains nested ZIP files - these will be processed individually",
        }
      } else {
        return {
          isValid: false,
          error:
            "ZIP file does not contain recognized boundary files (.shp, .kml, .geojson, or .xml files)",
        }
      }
    } catch (error) {
      console.error("ZIP validation error:", error)
      return {
        isValid: false,
        error:
          "Invalid or corrupted ZIP file. Please check your file and try again.",
      }
    }
  }

  async function validateKmlFile(
    file: File,
  ): Promise<{ isValid: boolean; error?: string; info?: string }> {
    try {
      const text = await file.text()
      if (!text.includes("<kml") && !text.includes("<KML")) {
        return {
          isValid: false,
          error: "File does not appear to be a valid KML file",
        }
      }
      const hasPolygon = text.includes("<Polygon") || text.includes("<polygon")
      const hasMultiGeometry =
        text.includes("<MultiGeometry") || text.includes("<multigeometry")
      if (!hasPolygon && !hasMultiGeometry) {
        return {
          isValid: false,
          error:
            "KML file does not contain polygon geometries required for boundary processing",
        }
      }
      return {
        isValid: true,
        info: "Valid KML file with polygon geometries detected",
      }
    } catch (error) {
      return {
        isValid: false,
        error: "Unable to read KML file. Please check the file format.",
      }
    }
  }

  async function validateGeoJsonFile(
    file: File,
  ): Promise<{ isValid: boolean; error?: string; info?: string }> {
    try {
      const geojson = JSON.parse(await file.text())
      if (!geoJsonHasBoundaryFeature(geojson)) {
        return {
          isValid: false,
          error:
            "GeoJSON file does not contain polygon geometries required for boundary processing",
        }
      }
      return {
        isValid: true,
        info: "Valid GeoJSON file with polygon geometries detected",
      }
    } catch (error) {
      return {
        isValid: false,
        error: "Unable to read GeoJSON file. Please check the file format.",
      }
    }
  }

  async function validateXmlFile(
    file: File,
  ): Promise<{ isValid: boolean; error?: string; info?: string }> {
    try {
      const text = await file.text()
      const isIsoxml =
        text.includes("ISO11783") ||
        text.includes("<Task") ||
        text.includes("<Field") ||
        text.includes("<Partfield")
      if (!isIsoxml) {
        return {
          isValid: false,
          error: "XML file does not appear to be a valid ISOXML format",
        }
      }
      return { isValid: true, info: "Valid ISOXML file detected" }
    } catch (error) {
      return {
        isValid: false,
        error: "Unable to read XML file. Please check the file format.",
      }
    }
  }

  async function processFile(file: File) {
    uploadError = null
    fileInfo = ""
    uploadStatus = "validating"
    uploadedFile = file

    const basicValidation = validateBasicFile(file)
    if (!basicValidation.isValid) {
      uploadError = basicValidation.error || "Invalid file"
      uploadStatus = "error"
      return
    }

    try {
      uploadStatus = "processing"
      const structureValidation = await validateFileStructure(file)
      if (!structureValidation.isValid) {
        uploadError = structureValidation.error || "Invalid file"
        uploadStatus = "error"
        return
      }
      fileInfo = structureValidation.info || ""
      await startUpload()
    } catch (error) {
      console.error("File validation error:", error)
      uploadError = "Failed to validate file structure. Please try again."
      uploadStatus = "error"
    }
  }

  async function startUpload() {
    if (!uploadedFile) return
    uploadStartTime = Date.now()
    uploadStatus = "loading"

    try {
      const result = await fileApi.uploadFile(uploadedFile)
      const elapsed = Date.now() - uploadStartTime
      const remaining = Math.max(0, MIN_ANIMATION_TIME - elapsed)
      if (remaining > 0) await new Promise((r) => setTimeout(r, remaining))

      if (result.success) {
        uploadStatus = "success"
        toast.success("File uploaded successfully!")

        const normalizedFile = {
          id: result.file.file_id,
          name: result.file.file_name,
          path: result.file.file_path,
          uploadedDate: result.file.created_at,
          status: "Uploaded",
          message: "File uploaded successfully",
          userId: result.file.user_id,
        }
        userFilesStore.update((files: any) => [...files, normalizedFile])

        setTimeout(() => {
          navigateToProcess(result.file.file_id, result.file.file_name)
        }, SUCCESS_DISPLAY_TIME)
      } else {
        await handleUploadError(result)
      }
    } catch (error) {
      console.error("Upload error:", error)
      const elapsed = Date.now() - uploadStartTime
      const remaining = Math.max(0, MIN_ANIMATION_TIME - elapsed)
      if (remaining > 0) await new Promise((r) => setTimeout(r, remaining))
      uploadError =
        "An unexpected error occurred while uploading the file. Please try again."
      uploadStatus = "error"
      toast.error(uploadError)
    }
  }

  async function handleUploadError(result: any) {
    const errorMessage = result.message?.toLowerCase() || ""
    const isFileExistsError =
      errorMessage.includes("already exists") ||
      errorMessage.includes("duplicate") ||
      errorMessage.includes("file exists") ||
      errorMessage.includes("unique constraint") ||
      errorMessage.includes("violates unique")

    if (isFileExistsError) {
      try {
        const existingFiles = await fileApi.getUserFiles()
        const existingFile = existingFiles.find(
          (f: any) => f.name === uploadedFile?.name,
        )
        if (existingFile) {
          uploadStatus = "success"
          toast.success("Using existing file!")
          setTimeout(() => {
            navigateToProcess(existingFile.id, existingFile.name)
          }, SUCCESS_DISPLAY_TIME)
          return
        }
      } catch (findError) {
        console.warn("Could not find existing file in user files:", findError)
      }
      toast.info("File already exists.")
      resetUploadState()
    } else {
      uploadError =
        result.message ||
        "An error occurred while uploading the file. Please try again."
      uploadStatus = "error"
      toast.error(uploadError)
    }
  }

  function resetUploadState() {
    uploadedFile = null
    uploadStatus = null
    uploadError = null
    fileInfo = ""
    if (fileInput) fileInput.value = ""
  }

  // Drag and drop handlers
  function handleDragOver(e: DragEvent) {
    e.preventDefault()
    isDragging = true
  }
  function handleDragLeave(e: DragEvent) {
    e.preventDefault()
    isDragging = false
  }
  function handleDrop(e: DragEvent) {
    e.preventDefault()
    isDragging = false
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0])
    }
  }
  function handleFileChange(e: Event) {
    const target = e.target as HTMLInputElement
    if (target.files && target.files.length > 0) {
      processFile(target.files[0])
    }
  }
  function handleDropZoneClick() {
    if (!uploadedFile && uploadStatus !== "success") {
      fileInput?.click()
    }
  }

  function downloadExample() {
    const link = document.createElement("a")
    link.href = "/docs/skan_sample_shapefile.zip"
    link.download = "example_paddock_boundaries.zip"
    link.click()
  }
</script>

<div class="space-y-4">
  {#if loading}
    <div class="flex h-48 w-full items-center justify-center">
      <div class="loading loading-spinner loading-lg"></div>
      <span class="ml-4 text-sm text-contrast-content"
        >Loading field data...</span
      >
    </div>
  {:else if loadError}
    <div
      class="flex items-center gap-3 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700"
    >
      <AlertCircle class="h-5 w-5 flex-shrink-0" />
      <span>Failed to load field data: {loadError}</span>
    </div>
  {:else if hasFields}
    <!-- Top component: title + upload + stat chips -->
    <div>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <div
            class="flex h-9 w-9 items-center justify-center rounded-full bg-green-600/20 sm:h-10 sm:w-10"
          >
            <LandPlot class="h-4 w-4 text-green-600 sm:h-5 sm:w-5" />
          </div>
          <div>
            <h2 class="text-base font-bold text-contrast-content sm:text-lg">
              Fields
            </h2>
            <p class="text-xs text-contrast-content/60 sm:text-sm">
              Your uploaded field boundaries
            </p>
          </div>
        </div>

        <button
          on:click={openUploadModal}
          class="flex items-center gap-1.5 rounded-lg bg-base-content px-3 py-2 text-xs font-medium text-base-100 shadow-sm transition-all duration-300 hover:bg-base-content/90 sm:text-sm"
        >
          <Upload class="h-3.5 w-3.5" />
          Upload Fields
        </button>
      </div>

      <!-- Summary stat chips -->
      <div class="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
        <div
          class="flex flex-col items-center justify-center rounded-lg bg-base-200 p-2.5 text-center sm:p-3"
        >
          <div class="flex items-center gap-1 text-green-600">
            <Layers class="h-3.5 w-3.5" />
            <span class="text-base font-bold sm:text-lg">{fields.length}</span>
          </div>
          <span class="text-[10px] text-contrast-content/60 sm:text-xs"
            >Fields</span
          >
        </div>
        <div
          class="flex flex-col items-center justify-center rounded-lg bg-base-200 p-2.5 text-center sm:p-3"
        >
          <div class="flex items-center gap-1 text-blue-600">
            <Ruler class="h-3.5 w-3.5" />
            <span class="text-base font-bold sm:text-lg"
              >{totalArea.toFixed(1)}</span
            >
          </div>
          <span class="text-[10px] text-contrast-content/60 sm:text-xs"
            >Hectares</span
          >
        </div>
        <div
          class="flex flex-col items-center justify-center rounded-lg bg-base-200 p-2.5 text-center sm:p-3"
        >
          <div class="flex items-center gap-1 text-purple-600">
            <LandPlot class="h-3.5 w-3.5" />
            <span class="text-base font-bold sm:text-lg">{farmCount}</span>
          </div>
          <span class="text-[10px] text-contrast-content/60 sm:text-xs"
            >Farms</span
          >
        </div>
      </div>
    </div>

    <!-- Fields list -->
    <div class="rounded-xl border border-base-300 bg-base-100">
      <FieldsOverview {navigateToProcess} />
    </div>

    <!-- Duplicate field cleaner -->
    <div class="mt-4">
      <DuplicateFieldCleaner />
    </div>
  {:else}
    <!-- No fields: the whole component is the upload dropzone -->
    <input
      bind:this={fileInput}
      type="file"
      accept=".zip,.kml,.kmz,.geojson,.xml,.isoxml"
      class="hidden"
      on:change={handleFileChange}
      disabled={isProcessing || hasSuccess}
    />

    <div
      role="button"
      tabindex="0"
      on:click={handleDropZoneClick}
      on:keydown={(e) =>
        (e.key === "Enter" || e.key === " ") && handleDropZoneClick()}
      on:dragover={handleDragOver}
      on:dragleave={handleDragLeave}
      on:drop={handleDrop}
      class="group relative flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed p-10 text-center transition-all
        {isDragging
        ? 'scale-[0.99] border-base-content bg-base-content/10 shadow-inner'
        : hasError
          ? 'border-error/30 bg-error/5'
          : hasSuccess
            ? 'border-success/30 bg-success/5 shadow-md shadow-success/10'
            : uploadedFile
              ? 'border-info/30 bg-info/5'
              : 'border-base-300 bg-base-200/40 hover:border-base-content/40 hover:bg-base-200 hover:shadow-md'}"
      class:cursor-not-allowed={isProcessing}
      class:cursor-default={hasSuccess}
    >
      <div
        class="absolute inset-0 bg-gradient-to-tr from-base-content/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100"
      ></div>

      {#if hasSuccess}
        <div
          class="animate-scaleIn relative z-10 flex flex-col items-center gap-4"
        >
          <div
            class="animate-successPulse flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20 shadow-lg shadow-green-500/10"
          >
            <div
              class="flex h-14 w-14 items-center justify-center rounded-full bg-green-500"
            >
              <CheckCircle size={28} class="stroke-[2.5] text-white" />
            </div>
          </div>
          <h3 class="text-lg font-bold text-contrast-content">
            File Uploaded Successfully!
          </h3>
          <p
            class="rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1 text-sm text-green-500"
          >
            {uploadedFile?.name}
          </p>
          <p class="animate-delayedFadeIn text-sm text-contrast-content/60">
            Opening the field processing wizard...
          </p>
        </div>
      {:else if isProcessing}
        <div
          class="animate-scaleIn relative z-10 flex flex-col items-center gap-4"
        >
          {#if uploadStatus === "loading"}
            <div
              class="relative mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-500/20"
            >
              <div
                class="animate-upload-spin absolute inset-1 rounded-full border-2 border-transparent border-t-blue-400"
              ></div>
              <Cloud
                size={28}
                class="animate-upload-pulse relative z-10 text-blue-400"
              />
            </div>
            <p class="text-base font-medium text-contrast-content">
              Uploading file...
            </p>
          {:else}
            <div
              class="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-info/20"
            >
              <div class="loading loading-spinner loading-md text-info"></div>
            </div>
            <p class="text-base font-medium text-contrast-content">
              {uploadStatus === "validating"
                ? "Validating file..."
                : "Checking file structure..."}
            </p>
          {/if}
          {#if uploadedFile}
            <p
              class="rounded-full bg-base-200 px-3 py-1 text-sm text-contrast-content/60"
            >
              {uploadedFile.name}
            </p>
          {/if}
        </div>
      {:else if hasError}
        <div
          class="animate-scaleIn relative z-10 flex max-w-md flex-col items-center"
        >
          <div
            class="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-error/20"
          >
            <AlertCircle size={32} class="text-error" />
          </div>
          <p class="mb-2 text-base font-medium text-error">
            File Not Compatible
          </p>
          <p class="mb-5 text-center text-sm text-error">{uploadError}</p>
          <button
            on:click|stopPropagation={resetUploadState}
            class="flex items-center gap-2 rounded-lg bg-base-200 px-4 py-2 text-sm text-contrast-content transition-all hover:bg-base-300"
          >
            <X size={14} />
            <span>Try a different file</span>
          </button>
        </div>
      {:else}
        <div class="relative z-10 flex flex-col items-center">
          <div
            class="relative mb-6 transition-transform duration-300 group-hover:scale-110"
          >
            <div class="flex items-center justify-center space-x-6">
              <Cloud class="animate-upload-pulse h-8 w-8 text-info" />
              <div class="relative">
                <FileIcon
                  class="h-12 w-12 text-base-content transition-all group-hover:rotate-6"
                />
                <div
                  class="absolute inset-0 bg-base-content/20 opacity-0 blur-sm transition-opacity group-hover:opacity-100"
                ></div>
              </div>
              <Cloud class="animate-upload-pulse h-8 w-8 text-info" />
            </div>
            <div
              class="animate-upload-spin-slow absolute -inset-8 rounded-full border border-dashed border-info/30 opacity-50"
            ></div>
          </div>
          <p class="mb-3 text-lg font-semibold text-contrast-content">
            Click to upload or drag and drop
          </p>
          <p class="mb-2 text-center text-sm text-contrast-content/60">
            Zipped shapefiles, KML, GeoJSON or ISOXML files (Max 50mb)
          </p>
          <div
            class="mt-1 flex items-center gap-2 rounded-full bg-info/10 px-3 py-1.5 text-xs text-info/70"
          >
            <CheckCircle class="h-3 w-3" />
            Files are processed securely
          </div>
        </div>
      {/if}
    </div>

    <!-- Helpers -->
    <div
      class="flex flex-wrap items-center justify-between gap-3 text-xs text-contrast-content/60"
    >
      <button
        on:click={downloadExample}
        class="flex items-center gap-1.5 transition-colors hover:text-contrast-content"
      >
        <Download class="h-3.5 w-3.5" />
        Download example file
      </button>
      <button
        on:click={openHelpModal}
        class="flex items-center gap-1.5 transition-colors hover:text-contrast-content"
      >
        <HelpCircle class="h-3.5 w-3.5" />
        Need help?
      </button>
    </div>

    <!-- Previously uploaded (but not yet processed) files -->
    {#if userFiles.length > 0}
      <div class="border-t border-base-300 pt-4">
        <h4
          class="mb-2 text-xs font-semibold uppercase tracking-wide text-contrast-content/50"
        >
          Uploaded files
        </h4>
        <div class="space-y-1.5">
          {#each userFiles as file (file.id)}
            <div
              class="flex items-center gap-2 rounded-lg border border-base-300 bg-base-200/50 p-2"
            >
              <div
                class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-base-100"
              >
                <FileIcon class="h-4 w-4 text-contrast-content/70" />
              </div>
              <div class="min-w-0 flex-1">
                <div class="truncate text-sm font-medium text-contrast-content">
                  {file.name}
                </div>
                <div class="text-xs text-contrast-content/50">
                  {formatDate(file.uploadedDate)}
                </div>
              </div>
              <button
                on:click={() => navigateToProcess(file.id, file.name)}
                class="flex items-center gap-1 rounded-lg bg-base-content px-2.5 py-1.5 text-xs font-medium text-base-100 transition-colors hover:bg-base-content/90"
                title="Use this file"
              >
                <Play class="h-3 w-3" />
                <span class="hidden sm:inline">Use</span>
              </button>
              <button
                on:click={() => deleteFile(file.id, file.name)}
                disabled={deletingFileId === file.id}
                class="flex h-7 w-7 items-center justify-center rounded-lg border border-base-300 bg-base-100 text-contrast-content/60 transition-colors hover:bg-red-500/10 hover:text-red-600 disabled:opacity-50"
                title="Delete file"
                aria-label="Delete file"
              >
                <Trash2 class="h-3.5 w-3.5" />
              </button>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</div>

<!-- Upload Modal -->
<dialog
  bind:this={uploadDialogEl}
  class="modal modal-middle"
  on:close={closeUploadModal}
>
  <div class="modal-box max-h-[90vh] w-full max-w-lg overflow-y-auto">
    <!-- Modal header -->
    <div
      class="mb-4 flex items-start justify-between gap-3 border-b border-base-300 pb-3"
    >
      <div class="flex items-center gap-3">
        <div
          class="flex h-10 w-10 items-center justify-center rounded-full bg-green-600/20"
        >
          <Upload class="h-5 w-5 text-green-600" />
        </div>
        <div>
          <h3 class="text-lg font-bold text-contrast-content">Upload Fields</h3>
          <p class="text-sm text-contrast-content/60">
            Add field boundaries to your map
          </p>
        </div>
      </div>
      <button
        on:click={closeUploadModal}
        class="flex h-8 w-8 items-center justify-center rounded-lg bg-base-200 transition-colors hover:bg-base-300"
        aria-label="Close"
      >
        <X class="h-4 w-4 text-contrast-content/60" />
      </button>
    </div>

    <!-- Drop zone -->
    <input
      bind:this={fileInput}
      type="file"
      accept=".zip,.kml,.kmz,.geojson,.xml,.isoxml"
      class="hidden"
      on:change={handleFileChange}
    />

    <div
      role="button"
      tabindex="0"
      on:click={handleDropZoneClick}
      on:keydown={(e) =>
        (e.key === "Enter" || e.key === " ") && handleDropZoneClick()}
      on:dragover={handleDragOver}
      on:dragleave={handleDragLeave}
      on:drop={handleDrop}
      class="group relative flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed p-10 text-center transition-all
          {isDragging
        ? 'scale-[0.99] border-base-content bg-base-content/10 shadow-inner'
        : hasError
          ? 'border-error/30 bg-error/5'
          : hasSuccess
            ? 'border-success/30 bg-success/5 shadow-md shadow-success/10'
            : uploadedFile
              ? 'border-info/30 bg-info/5'
              : 'border-base-300 bg-base-200/40 hover:border-base-content/40 hover:bg-base-200 hover:shadow-md'}"
      class:cursor-not-allowed={isProcessing}
      class:cursor-default={hasSuccess}
    >
      <div
        class="absolute inset-0 bg-gradient-to-tr from-base-content/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100"
      ></div>

      {#if hasSuccess}
        <div
          class="animate-scaleIn relative z-10 flex flex-col items-center gap-4"
        >
          <div
            class="animate-successPulse flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20 shadow-lg shadow-green-500/10"
          >
            <div
              class="flex h-14 w-14 items-center justify-center rounded-full bg-green-500"
            >
              <CheckCircle size={28} class="stroke-[2.5] text-white" />
            </div>
          </div>
          <h3 class="text-lg font-bold text-contrast-content">
            File Uploaded Successfully!
          </h3>
          <p
            class="rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1 text-sm text-green-500"
          >
            {uploadedFile?.name}
          </p>
          <p class="animate-delayedFadeIn text-sm text-contrast-content/60">
            Opening the field processing wizard...
          </p>
        </div>
      {:else if isProcessing}
        <div
          class="animate-scaleIn relative z-10 flex flex-col items-center gap-4"
        >
          {#if uploadStatus === "loading"}
            <div
              class="relative mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-500/20"
            >
              <div
                class="animate-upload-spin absolute inset-1 rounded-full border-2 border-transparent border-t-blue-400"
              ></div>
              <Cloud
                size={28}
                class="animate-upload-pulse relative z-10 text-blue-400"
              />
            </div>
            <p class="text-base font-medium text-contrast-content">
              Uploading file...
            </p>
          {:else}
            <div
              class="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-info/20"
            >
              <div class="loading loading-spinner loading-md text-info"></div>
            </div>
            <p class="text-base font-medium text-contrast-content">
              {uploadStatus === "validating"
                ? "Validating file..."
                : "Checking file structure..."}
            </p>
          {/if}
          {#if uploadedFile}
            <p
              class="rounded-full bg-base-200 px-3 py-1 text-sm text-contrast-content/60"
            >
              {uploadedFile.name}
            </p>
          {/if}
        </div>
      {:else if hasError}
        <div
          class="animate-scaleIn relative z-10 flex max-w-md flex-col items-center"
        >
          <div
            class="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-error/20"
          >
            <AlertCircle size={32} class="text-error" />
          </div>
          <p class="mb-2 text-base font-medium text-error">
            File Not Compatible
          </p>
          <p class="mb-5 text-center text-sm text-error">{uploadError}</p>
          <button
            on:click|stopPropagation={resetUploadState}
            class="flex items-center gap-2 rounded-lg bg-base-200 px-4 py-2 text-sm text-contrast-content transition-all hover:bg-base-300"
          >
            <X size={14} />
            <span>Try a different file</span>
          </button>
        </div>
      {:else}
        <div class="relative z-10 flex flex-col items-center">
          <div
            class="relative mb-6 transition-transform duration-300 group-hover:scale-110"
          >
            <div class="flex items-center justify-center space-x-6">
              <Cloud class="animate-upload-pulse h-8 w-8 text-info" />
              <div class="relative">
                <FileIcon
                  class="h-12 w-12 text-base-content transition-all group-hover:rotate-6"
                />
                <div
                  class="absolute inset-0 bg-base-content/20 opacity-0 blur-sm transition-opacity group-hover:opacity-100"
                ></div>
              </div>
              <Cloud class="animate-upload-pulse h-8 w-8 text-info" />
            </div>
            <div
              class="animate-upload-spin-slow absolute -inset-8 rounded-full border border-dashed border-info/30 opacity-50"
            ></div>
          </div>
          <p class="mb-3 text-lg font-semibold text-contrast-content">
            Click to upload or drag and drop
          </p>
          <p class="mb-2 text-center text-sm text-contrast-content/60">
            Zipped shapefiles, KML, GeoJSON or ISOXML files (Max 50mb)
          </p>
          <div
            class="mt-1 flex items-center gap-2 rounded-full bg-info/10 px-3 py-1.5 text-xs text-info/70"
          >
            <CheckCircle class="h-3 w-3" />
            Files are processed securely
          </div>
        </div>
      {/if}
    </div>

    <!-- Helpers -->
    <div
      class="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-contrast-content/60"
    >
      <button
        on:click={downloadExample}
        class="flex items-center gap-1.5 transition-colors hover:text-contrast-content"
      >
        <Download class="h-3.5 w-3.5" />
        Download example file
      </button>
      <button
        on:click={openHelpModal}
        class="flex items-center gap-1.5 transition-colors hover:text-contrast-content"
      >
        <HelpCircle class="h-3.5 w-3.5" />
        Need help?
      </button>
    </div>

    <!-- Previously uploaded files (minimized) -->
    {#if userFiles.length > 0}
      <div class="mt-5 border-t border-base-300 pt-4">
        <h4
          class="mb-2 text-xs font-semibold uppercase tracking-wide text-contrast-content/50"
        >
          Uploaded files
        </h4>
        <div class="space-y-1.5">
          {#each userFiles as file (file.id)}
            <div
              class="flex items-center gap-2 rounded-lg border border-base-300 bg-base-200/50 p-2"
            >
              <div
                class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-base-100"
              >
                <FileIcon class="h-4 w-4 text-contrast-content/70" />
              </div>
              <div class="min-w-0 flex-1">
                <div class="truncate text-sm font-medium text-contrast-content">
                  {file.name}
                </div>
                <div class="text-xs text-contrast-content/50">
                  {formatDate(file.uploadedDate)}
                </div>
              </div>
              <button
                on:click={() => navigateToProcess(file.id, file.name)}
                class="flex items-center gap-1 rounded-lg bg-base-content px-2.5 py-1.5 text-xs font-medium text-base-100 transition-colors hover:bg-base-content/90"
                title="Use this file"
              >
                <Play class="h-3 w-3" />
                <span class="hidden sm:inline">Use</span>
              </button>
              <button
                on:click={() => deleteFile(file.id, file.name)}
                disabled={deletingFileId === file.id}
                class="flex h-7 w-7 items-center justify-center rounded-lg border border-base-300 bg-base-100 text-contrast-content/60 transition-colors hover:bg-red-500/10 hover:text-red-600 disabled:opacity-50"
                title="Delete file"
                aria-label="Delete file"
              >
                <Trash2 class="h-3.5 w-3.5" />
              </button>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>
  <form method="dialog" class="modal-backdrop">
    <button>close</button>
  </form>
</dialog>

<!-- Help Modal -->
<dialog
  bind:this={helpDialogEl}
  class="modal modal-middle"
  on:close={closeHelpModal}
>
  <div class="modal-box w-full max-w-md">
    <div
      class="mb-4 flex items-start justify-between gap-3 border-b border-base-300 pb-3"
    >
      <div class="flex items-center gap-3">
        <div
          class="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600/20"
        >
          <HelpCircle class="h-5 w-5 text-blue-600" />
        </div>
        <div>
          <h3 class="text-base font-bold text-contrast-content">
            Need Help Getting Your Fields?
          </h3>
          <p class="text-xs text-contrast-content/60">
            Upload boundaries from your farm software
          </p>
        </div>
      </div>
      <button on:click={closeHelpModal} class="btn btn-circle btn-ghost btn-sm">
        <X class="h-4 w-4" />
      </button>
    </div>

    <div class="space-y-4 text-sm text-contrast-content/80">
      <div>
        <h4 class="mb-1.5 font-semibold text-contrast-content">
          Download from your farm software
        </h4>
        <ul class="ml-4 list-disc space-y-1 text-xs text-contrast-content/70">
          <li>
            <strong>Agworld:</strong> Export field boundaries as KML or Shapefile
            from your Agworld account
          </li>
          <li>
            <strong>John Deere Operations Center:</strong> Export boundaries as Shapefile
            or ISOXML from the Operations Center
          </li>
          <li>
            <strong>Climate FieldView:</strong> Export field boundaries as Shapefile
            from FieldView
          </li>
          <li>
            <strong>Google Earth:</strong> Draw paddocks and export as KML
          </li>
        </ul>
      </div>

      <div class="rounded-lg bg-base-200 p-3">
        <p class="text-xs text-contrast-content/70">
          Supported file formats: <strong
            >.zip, .kml, .kmz, .geojson, .xml, .isoxml</strong
          >
        </p>
      </div>

      <div class="border-t border-base-300 pt-3">
        <h4 class="mb-1.5 font-semibold text-contrast-content">
          We can do it for you
        </h4>
        <p class="text-xs text-contrast-content/70">
          Email your field boundary files to <a
            href="mailto:service@agskan.com"
            class="font-semibold text-blue-600 underline">service@agskan.com</a
          > and we'll upload them for you right away.
        </p>
        <p class="mt-1.5 text-xs text-contrast-content/70">
          Or call us at <a
            href="tel:+61800000000"
            class="font-semibold text-blue-600 underline">(08) 0000 0000</a
          >
        </p>
      </div>
    </div>

    <div class="mt-5 flex justify-end">
      <button on:click={closeHelpModal} class="btn btn-primary btn-sm"
        >Got it</button
      >
    </div>
  </div>
  <form method="dialog" class="modal-backdrop">
    <button>close</button>
  </form>
</dialog>

<style>
  @keyframes fieldsSlideDown {
    from {
      opacity: 0;
      transform: translateY(-12px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .dashboard-slide-down {
    animation: fieldsSlideDown 0.2s ease-out;
  }

  @keyframes fieldsScaleIn {
    from {
      opacity: 0;
      transform: scale(0.9);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  .animate-scaleIn {
    animation: fieldsScaleIn 0.2s ease-out;
  }

  @keyframes fieldsDelayedFadeIn {
    0%,
    60% {
      opacity: 0;
      transform: translateY(10px);
    }
    100% {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .animate-delayedFadeIn {
    animation: fieldsDelayedFadeIn 1s ease-out;
  }

  @keyframes upload-spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  .animate-upload-spin {
    animation: upload-spin 1s linear infinite;
  }

  @keyframes upload-spin-slow {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  .animate-upload-spin-slow {
    animation: upload-spin-slow 8s linear infinite;
  }

  @keyframes upload-pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  .animate-upload-pulse {
    animation: upload-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }

  @keyframes fieldsSuccessPulse {
    0%,
    100% {
      transform: scale(1);
      box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.3);
    }
    50% {
      transform: scale(1.05);
      box-shadow: 0 0 0 10px rgba(34, 197, 94, 0);
    }
  }

  .animate-successPulse {
    animation: fieldsSuccessPulse 2s ease-in-out infinite;
  }
</style>
