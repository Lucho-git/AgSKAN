<script lang="ts">
  import { getContext } from "svelte"
  import { goto } from "$app/navigation"

  import type { Writable } from "svelte/store"
  import FieldsOverview from "./FieldsOverview.svelte"
  import FileUpload from "./FileUpload.svelte"
  import {
    Info,
    HelpCircle,
    ExternalLink,
    ArrowRight,
    Cloud,
    Download,
    File,
    X,
    CheckCircle,
    AlertCircle,
    Mail,
    Check,
    Upload,
    Plus,
    Sparkles,
    MapPin,
    Folder,
    Settings,
    LandPlot, // Add this line
  } from "lucide-svelte"
  import { userFilesStore } from "./userFilesStore"
  import { fieldStore } from "$lib/stores/fieldStore"
  import { session } from "$lib/stores/sessionStore"
  import { browser } from "$app/environment"
  import { toast } from "svelte-sonner"
  import { fileApi } from "$lib/api/fileApi"

  // Import shadcn-svelte components
  import { Alert, AlertDescription, AlertTitle } from "$lib/components/ui/alert"
  import { Separator } from "$lib/components/ui/separator"

  // Get page data
  export let data

  // Retrieve and set the admin section context
  let adminSection: Writable<string> = getContext("adminSection")
  adminSection.set("fieldview")

  // Set up loading state
  let loading = data.loading
  let error = data.error

  // Main state management
  let showUploadInterface = false // New state for showing upload interface

  // Upload state
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
  let fileInfo: string = ""

  // Animation timing
  let uploadStartTime = 0
  const MIN_ANIMATION_TIME = 2000 // 2 seconds minimum
  const SUCCESS_DISPLAY_TIME = 2500 // 2.5 seconds for success state

  // File validation constants
  const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB
  const ACCEPTED_EXTENSIONS = [".zip", ".kml", ".kmz", ".xml", ".isoxml"]

  // Help modal state
  let infoModalId = "boundary-help-modal"

  function openInfoModal() {
    const modal = document.getElementById(infoModalId) as HTMLDialogElement
    if (modal) modal.showModal()
  }

  function closeInfoModal() {
    const modal = document.getElementById(infoModalId) as HTMLDialogElement
    if (modal) modal.close()
  }

  // Function to show upload interface
  function startUploading() {
    showUploadInterface = true
  }

  // Update stores when data changes
  $: if (data.files && !loading) {
    userFilesStore.set(data.files)
  }

  $: if (data.fields && !loading) {
    fieldStore.set(data.fields)
  }

  // File upload handlers
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

  async function processFile(file: File) {
    uploadError = null
    fileInfo = ""
    uploadStatus = "validating"
    uploadedFile = file

    console.log("🔍 Starting file validation for:", file.name)

    // Basic validation first
    const basicValidation = validateBasicFile(file)
    if (!basicValidation.isValid) {
      uploadError = basicValidation.error
      uploadStatus = "error"
      return
    }

    // Advanced validation for file structure
    try {
      uploadStatus = "processing"
      const structureValidation = await validateFileStructure(file)

      if (!structureValidation.isValid) {
        uploadError = structureValidation.error
        uploadStatus = "error"
        return
      }

      fileInfo = structureValidation.info || ""
      console.log("✅ File validation passed, starting upload:", file.name)

      // Automatically start upload for valid files
      await startUpload()
    } catch (error) {
      console.error("❌ File validation error:", error)
      uploadError = "Failed to validate file structure. Please try again."
      uploadStatus = "error"
    }
  }

  function validateBasicFile(file: File): { isValid: boolean; error?: string } {
    console.log("🔍 Validating file:", file.name, "Size:", file.size)

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      return {
        isValid: false,
        error: `File is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Maximum size is 50MB.`,
      }
    }

    if (file.size === 0) {
      return {
        isValid: false,
        error: "File appears to be empty. Please select a valid file.",
      }
    }

    // Check file extension
    const fileName = file.name.toLowerCase()
    const hasValidExtension = ACCEPTED_EXTENSIONS.some((ext) =>
      fileName.endsWith(ext),
    )

    if (!hasValidExtension) {
      return {
        isValid: false,
        error: `Invalid file type "${fileName.split(".").pop()?.toUpperCase()}". Please upload ZIP, KML, KMZ, or ISOXML files.`,
      }
    }

    return { isValid: true }
  }

  async function validateFileStructure(
    file: File,
  ): Promise<{ isValid: boolean; error?: string; info?: string }> {
    const fileName = file.name.toLowerCase()

    if (fileName.endsWith(".zip")) {
      return await validateZipFile(file)
    } else if (fileName.endsWith(".kml") || fileName.endsWith(".kmz")) {
      return await validateKmlFile(file)
    } else if (fileName.endsWith(".xml") || fileName.endsWith(".isoxml")) {
      return await validateXmlFile(file)
    }

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
      console.log("📁 ZIP contents:", fileNames)

      if (fileNames.length === 0) {
        return { isValid: false, error: "ZIP file is empty" }
      }

      // Check for shapefile components
      const hasShp = fileNames.some((name) =>
        name.toLowerCase().endsWith(".shp"),
      )
      const hasDbf = fileNames.some((name) =>
        name.toLowerCase().endsWith(".dbf"),
      )
      const hasShx = fileNames.some((name) =>
        name.toLowerCase().endsWith(".shx"),
      )

      // Check for KML files
      const hasKml = fileNames.some((name) =>
        name.toLowerCase().endsWith(".kml"),
      )

      // Check for ISOXML files
      const hasIsoxml = fileNames.some(
        (name) =>
          name.toLowerCase().endsWith(".xml") ||
          name.toLowerCase().endsWith(".isoxml"),
      )

      // Check for nested ZIP files
      const hasNestedZip = fileNames.some((name) =>
        name.toLowerCase().endsWith(".zip"),
      )

      if (hasShp) {
        if (!hasDbf || !hasShx) {
          const missing = []
          if (!hasDbf) missing.push(".dbf")
          if (!hasShx) missing.push(".shx")
          return {
            isValid: false,
            error: `Shapefile is missing required components: ${missing.join(", ")}. Please ensure your ZIP contains .shp, .dbf, and .shx files.`,
          }
        }

        const shapefiles = fileNames.filter((name) =>
          name.toLowerCase().endsWith(".shp"),
        )
        return {
          isValid: true,
          info: `Valid shapefile ZIP containing ${shapefiles.length} shapefile(s)`,
        }
      } else if (hasKml) {
        const kmlFiles = fileNames.filter((name) =>
          name.toLowerCase().endsWith(".kml"),
        )
        return {
          isValid: true,
          info: `Valid KML ZIP containing ${kmlFiles.length} KML file(s)`,
        }
      } else if (hasIsoxml) {
        const xmlFiles = fileNames.filter(
          (name) =>
            name.toLowerCase().endsWith(".xml") ||
            name.toLowerCase().endsWith(".isoxml"),
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
            "ZIP file does not contain recognized boundary files (.shp, .kml, or .xml files)",
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

      return {
        isValid: true,
        info: "Valid ISOXML file detected",
      }
    } catch (error) {
      return {
        isValid: false,
        error: "Unable to read XML file. Please check the file format.",
      }
    }
  }

  async function startUpload() {
    if (!uploadedFile) return

    uploadStartTime = Date.now()
    uploadStatus = "loading"

    try {
      console.log("🚀 Starting upload for:", uploadedFile.name)
      const result = await fileApi.uploadFile(uploadedFile)

      const elapsedTime = Date.now() - uploadStartTime
      const remainingTime = Math.max(0, MIN_ANIMATION_TIME - elapsedTime)

      if (remainingTime > 0) {
        await new Promise((resolve) => setTimeout(resolve, remainingTime))
      }

      if (result.success) {
        uploadStatus = "success"
        toast.success("File uploaded successfully!")

        // Update userFilesStore
        const normalizedFile = {
          id: result.file.file_id,
          name: result.file.file_name,
          path: result.file.file_path,
          uploadedDate: result.file.created_at,
          status: "Uploaded",
          message: "File uploaded successfully",
          userId: result.file.user_id,
        }

        userFilesStore.update((files) => {
          return [...files, normalizedFile]
        })

        // Show success animation, then redirect to wizard
        setTimeout(() => {
          const params = new URLSearchParams({
            fileId: result.file.file_id,
            fileName: result.file.file_name,
            returnUrl: "/account/fieldview",
          })
          goto(`/account/fieldview/process?${params.toString()}`)
        }, SUCCESS_DISPLAY_TIME)
      } else {
        await handleUploadError(result)
      }
    } catch (error) {
      console.error("Upload error:", error)
      const elapsedTime = Date.now() - uploadStartTime
      const remainingTime = Math.max(0, MIN_ANIMATION_TIME - elapsedTime)

      if (remainingTime > 0) {
        await new Promise((resolve) => setTimeout(resolve, remainingTime))
      }

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
      console.log("📁 File already exists, proceeding with existing file")

      try {
        const userFiles = await fileApi.getUserFiles()
        const existingFile = userFiles.find(
          (f) => f.name === uploadedFile?.name,
        )

        if (existingFile) {
          uploadStatus = "success"
          toast.success("Using existing file!")

          setTimeout(() => {
            const params = new URLSearchParams({
              fileId: existingFile.id,
              fileName: existingFile.name,
              returnUrl: "/account/fieldview",
            })
            goto(`/account/fieldview/process?${params.toString()}`)
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
    showUploadInterface = false
    uploadedFile = null
    uploadStatus = null
    uploadError = null
    fileInfo = ""
    if (fileInput) {
      fileInput.value = ""
    }
  }

  function handleUploadClick() {
    if (!uploadedFile && uploadStatus !== "success") {
      fileInput?.click()
    }
  }

  function handleRemoveFile() {
    uploadedFile = null
    uploadError = null
    fileInfo = ""
    uploadStatus = null
    if (fileInput) {
      fileInput.value = ""
    }
  }

  function downloadExample() {
    const link = document.createElement("a")
    link.href = "/docs/skan_sample_shapefile.zip"
    link.download = "example_paddock_boundaries.zip"
    link.click()
  }

  function contactSupport() {
    window.open(
      "mailto:support@agskan.com?subject=Help with boundary file upload",
      "_blank",
    )
  }

  // Navigate to process page with file info
  function navigateToProcess(fileId: string, fileName: string) {
    const params = new URLSearchParams({
      fileId: fileId,
      fileName: fileName,
      returnUrl: "/account/fieldview",
    })
    goto(`/account/fieldview/process?${params.toString()}`)
  }

  // Computed values
  $: isProcessing =
    uploadStatus === "validating" ||
    uploadStatus === "processing" ||
    uploadStatus === "loading"
  $: hasError = uploadStatus === "error"
  $: hasSuccess = uploadStatus === "success"
</script>

{#if browser}
  <div class="relative min-h-screen bg-base-100">
    <!-- Fixed mobile padding issue - removed container class and added proper padding -->
    <div class="relative z-10 px-4 py-6 sm:px-6 lg:px-8">
      <div class="mx-auto max-w-7xl space-y-8">
        <div
          class="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"
        >
          <div class="flex items-center gap-4">
            <div
              class="flex h-8 w-8 items-center justify-center rounded-full bg-base-content/10"
            >
              <LandPlot class="h-5 w-5 text-base-content" />
            </div>
            <div>
              <h2
                class="text-lg font-bold tracking-tight text-contrast-content"
              >
                Field Management
              </h2>
              <p class="text-sm text-contrast-content/70">
                Upload field boundaries, manage your fields, and view field data
                all in one place.
              </p>
            </div>
          </div>

          <!-- Help button moved to page header -->
          <button
            class="btn btn-outline gap-2 self-start text-contrast-content"
            on:click={openInfoModal}
            aria-label="Help with field boundaries"
          >
            <HelpCircle class="h-4 w-4" />
            <span class="whitespace-nowrap">Help with field boundaries</span>
          </button>
        </div>

        <Separator class="my-6" />

        {#if loading}
          <div class="flex h-64 w-full items-center justify-center">
            <div class="loading loading-spinner loading-lg"></div>
            <span class="ml-4 text-lg text-contrast-content"
              >Loading field data...</span
            >
          </div>
        {:else if error}
          <Alert variant="destructive">
            <Info class="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>Failed to load data: {error}</AlertDescription>
          </Alert>
        {:else if !$session?.user?.id}
          <Alert variant="warning">
            <Info class="h-4 w-4" />
            <AlertTitle>Session Expired</AlertTitle>
            <AlertDescription
              >Your session has expired. Please <a
                href="/login"
                class="font-medium underline underline-offset-4">log in</a
              > again.</AlertDescription
            >
          </Alert>
        {:else}
          {#if showUploadInterface}
            <!-- Full Upload Interface with slide transition -->
            <div class="animate-slideInLeft">
              <!-- Upload Card -->
              <div
                class="animate-fadeIn relative mx-auto overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-xl"
              >
                <div class="p-6 md:p-8">
                  <!-- Back Button -->
                  <button
                    on:click={() => (showUploadInterface = false)}
                    class="mb-4 flex items-center gap-2 rounded-xl border border-transparent bg-transparent px-4 py-2 text-sm font-medium text-contrast-content/60 transition-all hover:border-base-content/20 hover:bg-base-content/5 hover:text-base-content"
                  >
                    <ArrowRight
                      size={16}
                      class="rotate-180 transition-transform hover:-translate-x-0.5"
                    />
                    Back to Overview
                  </button>

                  <!-- File Drop Area - All states embedded here -->
                  <div
                    class="group relative mb-8 flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed p-10 transition-all
                      {isDragging
                      ? 'scale-[0.99] border-base-content bg-base-content/10 shadow-inner'
                      : hasError
                        ? 'border-error/30 bg-error/5'
                        : hasSuccess
                          ? 'border-success/30 bg-success/5 shadow-md shadow-success/10'
                          : uploadedFile
                            ? 'border-info/30 bg-info/5'
                            : 'border-base-300 bg-base-200/50 hover:border-base-content/40 hover:bg-base-200 hover:shadow-md'}"
                    on:dragover={handleDragOver}
                    on:dragleave={handleDragLeave}
                    on:drop={handleDrop}
                    on:click={!isProcessing && !hasSuccess
                      ? handleUploadClick
                      : undefined}
                    on:keydown={(e) => {
                      if (
                        !isProcessing &&
                        !hasSuccess &&
                        (e.key === "Enter" || e.key === " ")
                      ) {
                        handleUploadClick()
                      }
                    }}
                    role="button"
                    tabindex="0"
                    class:cursor-not-allowed={isProcessing}
                    class:cursor-default={hasSuccess}
                  >
                    <!-- Subtle background effect -->
                    <div
                      class="absolute inset-0 bg-gradient-to-tr from-base-content/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100"
                    ></div>

                    <input
                      bind:this={fileInput}
                      type="file"
                      class="hidden"
                      on:change={handleFileChange}
                      accept=".zip,.kml,.kmz,.xml,.isoxml"
                      disabled={isProcessing || hasSuccess}
                    />

                    {#if hasSuccess}
                      <!-- SUCCESS STATE - Embedded in upload area -->
                      <div
                        class="animate-scaleIn relative z-10 flex flex-col items-center gap-4"
                      >
                        <div
                          class="animate-successPulse flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20 shadow-lg shadow-green-500/10"
                        >
                          <div
                            class="animate-checkScale flex h-14 w-14 items-center justify-center rounded-full bg-green-500"
                          >
                            <Check
                              size={28}
                              class="animate-checkDraw stroke-[3] text-white"
                            />
                          </div>
                        </div>
                        <h3 class="text-lg font-bold text-contrast-content">
                          File Uploaded Successfully!
                        </h3>
                        <p
                          class="rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1 text-sm text-green-400"
                        >
                          {uploadedFile?.name}
                        </p>
                        <p
                          class="animate-delayedFadeIn text-sm text-contrast-content/60"
                        >
                          File has been saved to your library.
                        </p>
                      </div>
                    {:else if isProcessing}
                      <!-- LOADING STATE - Embedded in upload area -->
                      <div
                        class="animate-scaleIn relative z-10 flex flex-col items-center gap-4"
                      >
                        {#if uploadStatus === "loading"}
                          <div
                            class="relative mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-500/20"
                          >
                            <div
                              class="absolute inset-1 animate-spin rounded-full border-2 border-transparent border-t-blue-400"
                            ></div>
                            <Cloud
                              size={28}
                              class="relative z-10 animate-pulse text-blue-400"
                            />
                          </div>
                          <p
                            class="text-base font-medium text-contrast-content"
                          >
                            Uploading file...
                          </p>
                        {:else}
                          <div
                            class="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-info/20"
                          >
                            <div
                              class="loading loading-spinner loading-md text-info"
                            ></div>
                          </div>
                          <p
                            class="text-base font-medium text-contrast-content"
                          >
                            {uploadStatus === "validating"
                              ? "Validating file..."
                              : "Processing file..."}
                          </p>
                        {/if}
                        <p
                          class="rounded-full bg-base-200 px-3 py-1 text-sm text-contrast-content/60"
                        >
                          Processing {uploadedFile?.name}
                        </p>
                        {#if fileInfo && uploadStatus === "processing"}
                          <p class="animate-delayedFadeIn text-sm text-success">
                            ✓ {fileInfo}
                          </p>
                        {/if}
                      </div>
                    {:else if hasError}
                      <!-- ERROR STATE - Embedded in upload area -->
                      <div
                        class="animate-scaleIn relative z-10 flex max-w-lg flex-col items-center"
                      >
                        <div
                          class="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-error/20"
                        >
                          <AlertCircle size={32} class="text-error" />
                        </div>
                        <p class="mb-2 text-base font-medium text-error">
                          File Not Compatible
                        </p>
                        <p class="mb-6 text-center text-sm text-error">
                          {uploadError}
                        </p>

                        <div class="flex w-full flex-col gap-3">
                          <button
                            on:click={(e) => {
                              e.stopPropagation()
                              handleRemoveFile()
                            }}
                            class="flex items-center justify-center gap-2 rounded-lg bg-base-200 px-4 py-2 text-sm text-contrast-content transition-all hover:bg-base-300 hover:shadow-md"
                          >
                            <X size={14} />
                            <span>Try Different File</span>
                          </button>

                          <div class="flex gap-2">
                            <button
                              on:click={(e) => {
                                e.stopPropagation()
                                contactSupport()
                              }}
                              class="flex flex-1 items-center justify-center gap-2 rounded-lg bg-info/10 px-3 py-2 text-sm text-info transition-all hover:bg-info/20"
                            >
                              <Mail size={14} />
                              <span>Contact Support</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    {:else}
                      <!-- DEFAULT UPLOAD STATE - Embedded in upload area -->
                      <div class="relative z-10 flex flex-col items-center">
                        <div
                          class="relative mb-6 transition-transform duration-300 group-hover:scale-110"
                        >
                          <div
                            class="flex items-center justify-center space-x-6"
                          >
                            <Cloud class="h-8 w-8 animate-pulse text-info" />
                            <div class="relative">
                              <File
                                class="h-12 w-12 text-base-content transition-all group-hover:rotate-6"
                              />
                              <div
                                class="absolute inset-0 bg-base-content/20 opacity-0 blur-sm transition-opacity group-hover:opacity-100"
                              ></div>
                            </div>
                            <Cloud class="h-8 w-8 animate-pulse text-info" />
                          </div>
                          <div
                            class="animate-spin-slow absolute -inset-8 rounded-full border border-dashed border-info/30 opacity-50"
                          ></div>
                        </div>
                        <p
                          class="mb-3 text-lg font-semibold text-contrast-content"
                        >
                          Click to upload or drag and drop
                        </p>
                        <p
                          class="mb-2 text-center text-sm text-contrast-content/60"
                        >
                          ZIP, ISOXML or KML files (Max 50mb)
                        </p>
                        <div
                          class="mt-1 flex items-center gap-2 rounded-full bg-info/10 px-3 py-1.5 text-xs text-info/70"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                          >
                            <circle cx="12" cy="12" r="10" />
                            <path d="M12 16v-4" />
                            <path d="M12 8h.01" />
                          </svg>
                          Files are processed securely
                        </div>
                      </div>
                    {/if}
                  </div>

                  <!-- Requirements Section -->
                  <div
                    class="-mx-4 mb-8 rounded-lg bg-gradient-to-r from-base-200/80 to-transparent p-6"
                  >
                    <h3
                      class="mb-5 flex items-center gap-2 font-bold text-contrast-content"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        class="text-base-content"
                      >
                        <path
                          d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"
                        />
                        <path d="m9 12 2 2 4-4" />
                      </svg>
                      File Upload Requirements
                    </h3>
                    <ul class="space-y-4">
                      <li class="flex items-start gap-3">
                        <div
                          class="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border border-base-300 bg-base-200 text-base-content"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                          >
                            <path d="M20 6 9 17l-5-5" />
                          </svg>
                        </div>
                        <span class="text-sm text-contrast-content/80">
                          Zipped Shapefiles, KML files and ISOXML files are all
                          accepted
                        </span>
                      </li>
                      <li class="flex items-start gap-3">
                        <div
                          class="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border border-base-300 bg-base-200 text-base-content"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                          >
                            <path d="M20 6 9 17l-5-5" />
                          </svg>
                        </div>
                        <span class="text-sm text-contrast-content/80">
                          Shapefile ZIP must contain .dbf, .shx and .shp files
                        </span>
                      </li>
                      <li class="flex items-start gap-3">
                        <div
                          class="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border border-base-300 bg-base-200 text-base-content"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                          >
                            <path d="M20 6 9 17l-5-5" />
                          </svg>
                        </div>
                        <span class="text-sm text-contrast-content/80">
                          Multiple ZIP files or an ISOXML can be contained in a
                          single ZIP file
                        </span>
                      </li>
                      <li
                        class="flex cursor-pointer items-start gap-3 text-info transition-colors hover:text-info/80"
                        on:click={downloadExample}
                        on:keydown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            downloadExample()
                          }
                        }}
                        role="button"
                        tabindex="0"
                      >
                        <div
                          class="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-info/20 text-info"
                        >
                          <Download size={12} />
                        </div>
                        <span class="text-sm"
                          >Download Example Paddock File</span
                        >
                      </li>
                    </ul>
                  </div>

                  <!-- Supported Types Section -->
                  <div class="mb-8">
                    <h3 class="mb-4 font-bold text-contrast-content">
                      Supported Polygon Types
                    </h3>
                    <ul class="space-y-3">
                      <li class="flex items-start gap-3">
                        <div
                          class="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-success/20 text-success"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                          >
                            <path d="M20 6 9 17l-5-5" />
                          </svg>
                        </div>
                        <span class="text-sm text-contrast-content/80"
                          >Polygon</span
                        >
                      </li>
                      <li class="flex items-start gap-3">
                        <div
                          class="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-success/20 text-success"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                          >
                            <path d="M20 6 9 17l-5-5" />
                          </svg>
                        </div>
                        <span class="text-sm text-contrast-content/80"
                          >Multipolygon</span
                        >
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          {:else}
            <!-- Inviting Start Upload Button -->
            <div class="animate-slideInLeft">
              <div
                class="relative mx-auto overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-xl"
              >
                <div class="relative p-8 text-center">
                  <div class="mb-6">
                    <div
                      class="relative mx-auto mb-4 flex h-20 w-20 items-center justify-center"
                    >
                      <!-- Animated background circles - simplified without extra elements -->
                      <div
                        class="animate-heartbeat absolute inset-0 rounded-full bg-base-content/20"
                      ></div>
                      <div
                        class="absolute inset-2 animate-pulse rounded-full bg-base-content/10"
                      ></div>

                      <!-- Main icon -->
                      <div
                        class="relative flex h-12 w-12 items-center justify-center rounded-full bg-base-content/20"
                      >
                        <Upload class="h-6 w-6 text-base-content" />
                      </div>
                    </div>

                    <h3
                      class="mb-2 flex items-center justify-center gap-2 text-lg font-bold text-contrast-content"
                    >
                      Upload Field Boundaries
                    </h3>
                    <p
                      class="mx-auto max-w-md text-sm text-contrast-content/70"
                    >
                      Ready to import your field boundaries? Upload your
                      shapefile, KML, or ISOXML files to get started.
                    </p>
                  </div>

                  <!-- Quick stats or info - moved above button -->
                  <div
                    class="mb-6 flex flex-col items-center gap-2 sm:flex-row sm:justify-center sm:gap-4"
                  >
                    <div
                      class="flex items-center gap-2 rounded-full border border-success/30 bg-success/10 px-3 py-1.5 text-xs text-contrast-content/60"
                    >
                      <div
                        class="h-2 w-2 flex-shrink-0 rounded-full bg-success"
                      ></div>
                      <span class="whitespace-nowrap">Secure Upload</span>
                    </div>
                    <div
                      class="flex items-center gap-2 rounded-full border border-info/30 bg-info/10 px-3 py-1.5 text-xs text-contrast-content/60"
                    >
                      <div
                        class="h-2 w-2 flex-shrink-0 rounded-full bg-info"
                      ></div>
                      <span class="whitespace-nowrap">Multiple Formats</span>
                    </div>
                    <div
                      class="flex items-center gap-2 rounded-full border border-warning/30 bg-warning/10 px-3 py-1.5 text-xs text-contrast-content/60"
                    >
                      <div
                        class="h-2 w-2 flex-shrink-0 rounded-full bg-warning"
                      ></div>
                      <span class="whitespace-nowrap">Instant Processing</span>
                    </div>
                  </div>

                  <!-- Main CTA Button -->
                  <button
                    on:click={startUploading}
                    class="text- group relative mx-auto flex items-center gap-3 overflow-hidden rounded-xl bg-gradient-to-r from-base-content to-base-content/90 px-6 py-3 font-semibold text-base-100 shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-xl active:scale-95"
                  >
                    <!-- Button background animation -->
                    <div
                      class="absolute inset-0 bg-gradient-to-r from-base-content/80 to-base-content/60 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                    ></div>

                    <!-- Button content -->
                    <div class="relative flex items-center gap-3">
                      <span>Start Uploading</span>
                      <ArrowRight
                        class="h-4 w-4 transition-transform group-hover:translate-x-1"
                      />
                    </div>
                  </button>
                </div>
              </div>
            </div>
          {/if}

          <!-- FileUpload component (uploaded files overview) - Always shown below upload interface -->
          <div class="animate-slideInUp">
            <div
              class="relative mx-auto overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-xl"
            >
              <!-- Pass the navigation function to FileUpload -->
              <FileUpload {navigateToProcess} />
            </div>
          </div>

          <!-- Fields Overview - Always shown below with updated styling -->
          <div class="animate-slideInUp">
            <!-- Updated FieldsOverview with matching styling -->
            <div
              class="relative mx-auto overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-xl"
            >
              <!-- Pass the navigation function to FieldsOverview -->
              <FieldsOverview {navigateToProcess} />
            </div>
          </div>

          <!-- Stubbed Help Modal -->
          <dialog id={infoModalId} class="modal modal-bottom sm:modal-middle">
            <div class="modal-box">
              <h3 class="mb-4 text-xl font-bold text-base-content">
                Field Boundary Help
              </h3>

              <div class="mb-6 p-8 text-center">
                <HelpCircle class="mx-auto mb-4 h-16 w-16 text-base-content" />
                <p class="text-contrast-content/70">
                  Help content coming soon! This section will contain detailed
                  guidance on:
                </p>

                <ul
                  class="mt-4 space-y-2 text-left text-sm text-contrast-content/60"
                >
                  <li>
                    • How to export boundaries from John Deere Operations Center
                  </li>
                  <li>• How to export boundaries from Climate FieldView</li>
                  <li>• Working with KML files from Google Earth</li>
                  <li>• Understanding ISOXML format</li>
                  <li>• Troubleshooting common upload issues</li>
                </ul>
              </div>

              <div class="modal-action">
                <button class="btn" on:click={closeInfoModal}>Close</button>
              </div>
            </div>

            <!-- Modal backdrop -->
            <form method="dialog" class="modal-backdrop">
              <button>close</button>
            </form>
          </dialog>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  @keyframes scaleIn {
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
    animation: scaleIn 0.2s ease-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  .animate-fadeIn {
    animation: fadeIn 0.2s ease-out;
  }

  @keyframes delayedFadeIn {
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
    animation: delayedFadeIn 1s ease-out;
  }

  @keyframes spin-slow {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  .animate-spin-slow {
    animation: spin-slow 8s linear infinite;
  }

  @keyframes heartbeat {
    0%,
    100% {
      transform: scale(1);
      opacity: 0.8;
    }
    50% {
      transform: scale(1.05);
      opacity: 0.4;
    }
  }

  .animate-heartbeat {
    animation: heartbeat 2s ease-in-out infinite;
  }

  /* Enhanced success animations */
  @keyframes successPulse {
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
    animation: successPulse 2s ease-in-out infinite;
  }

  @keyframes checkScale {
    0% {
      transform: scale(0);
    }
    50% {
      transform: scale(1.1);
    }
    100% {
      transform: scale(1);
    }
  }

  .animate-checkScale {
    animation: checkScale 0.6s ease-out 0.3s both;
  }

  @keyframes checkDraw {
    0% {
      stroke-dasharray: 50;
      stroke-dashoffset: 50;
    }
    100% {
      stroke-dasharray: 50;
      stroke-dashoffset: 0;
    }
  }

  .animate-checkDraw {
    animation: checkDraw 0.5s ease-out 0.5s both;
  }

  @keyframes slideInLeft {
    from {
      opacity: 0;
      transform: translateX(-20px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  .animate-slideInLeft {
    animation: slideInLeft 0.3s ease-out;
  }

  @keyframes slideInUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .animate-slideInUp {
    animation: slideInUp 0.4s ease-out 0.2s both;
  }
</style>
