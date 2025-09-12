<!-- src/routes/(admin)/account/onboarding/manager/boundary_upload/+page.svelte -->
<script lang="ts">
  import { goto } from "$app/navigation"
  import { page } from "$app/stores"
  import {
    ArrowRight,
    Cloud,
    Download,
    File,
    X,
    CheckCircle,
    AlertCircle,
    Mail,
    Check,
  } from "lucide-svelte"
  import { toast } from "svelte-sonner"
  import { fileApi } from "$lib/api/fileApi"
  import BoundaryWizard from "$lib/components/BoundaryWizard.svelte"

  // State management for wizard
  let showWizard = false
  let wizardFileId = ""
  let wizardFileName = ""

  // Check if we should show wizard from URL params (for direct navigation)
  const urlFileId = $page.url.searchParams.get("fileId")
  const urlFileName = $page.url.searchParams.get("fileName")

  if (urlFileId && urlFileName) {
    showWizard = true
    wizardFileId = urlFileId
    wizardFileName = urlFileName
  }

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

    // Record start time for minimum animation duration
    uploadStartTime = Date.now()
    uploadStatus = "loading"

    try {
      console.log("🚀 Starting upload for:", uploadedFile.name)
      const result = await fileApi.uploadFile(uploadedFile)

      // Calculate elapsed time and wait for minimum if needed
      const elapsedTime = Date.now() - uploadStartTime
      const remainingTime = Math.max(0, MIN_ANIMATION_TIME - elapsedTime)

      if (remainingTime > 0) {
        await new Promise((resolve) => setTimeout(resolve, remainingTime))
      }

      if (result.success) {
        uploadStatus = "success"
        toast.success("File uploaded successfully!")

        // Show success animation for extended time, then show wizard
        setTimeout(() => {
          showWizard = true
          wizardFileId = result.file.file_id
          wizardFileName = result.file.file_name
        }, SUCCESS_DISPLAY_TIME)
      } else {
        // Handle errors with minimum time consideration
        await handleUploadError(result)
      }
    } catch (error) {
      console.error("Upload error:", error)
      // Ensure minimum time for error handling too
      const elapsedTime = Date.now() - uploadStartTime
      const remainingTime = Math.max(0, MIN_ANIMATION_TIME - elapsedTime)

      if (remainingTime > 0) {
        await new Promise((resolve) => setTimeout(resolve, remainingTime))
      }

      toast.info("Skipping boundary upload. You can add boundaries later.")
      setTimeout(() => {
        goto("/account/onboarding/manager/team_invite")
      }, 1500)
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
            showWizard = true
            wizardFileId = existingFile.id
            wizardFileName = existingFile.name
          }, SUCCESS_DISPLAY_TIME)
          return
        }
      } catch (findError) {
        console.warn("Could not find existing file in user files:", findError)
      }

      toast.info("File already exists. Proceeding to next step.")
      setTimeout(() => {
        goto("/account/onboarding/manager/team_invite")
      }, 1500)
    } else {
      console.warn("Upload failed, proceeding to next step:", result.message)
      toast.info("Skipping boundary upload. You can add boundaries later.")
      setTimeout(() => {
        goto("/account/onboarding/manager/team_invite")
      }, 1500)
    }
  }

  // Wizard event handlers
  function handleFieldsLoaded(event) {
    const { paddocks } = event.detail

    // Navigate to next step after delay
    setTimeout(() => {
      goto("/account/onboarding/manager/team_invite")
    }, 2000)
  }

  function handleBackToUpload() {
    showWizard = false
    wizardFileId = ""
    wizardFileName = ""
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

  function handleSkip() {
    goto("/account/onboarding/manager/team_invite")
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

  // Computed values
  $: isProcessing =
    uploadStatus === "validating" ||
    uploadStatus === "processing" ||
    uploadStatus === "loading"
  $: hasError = uploadStatus === "error"
  $: hasSuccess = uploadStatus === "success"
</script>

<svelte:head>
  <title>Boundary Upload - AgSKAN</title>
  <meta name="description" content="Upload your farm paddock boundary files" />
</svelte:head>

<div class="relative min-h-screen overflow-hidden bg-base-100">
  <div class="relative z-10">
    {#if showWizard}
      <!-- Embedded Boundary Wizard with slide transition -->
      <div class="animate-boundary-slideInRight">
        <BoundaryWizard
          fileId={wizardFileId}
          fileName={wizardFileName}
          on:fieldsLoaded={handleFieldsLoaded}
          on:backToUpload={handleBackToUpload}
        />
      </div>
    {:else}
      <!-- Upload Interface with slide transition -->
      <div class="animate-boundary-slideInLeft px-4 py-4 md:px-6 md:py-6">
        <!-- Header - compact for single page view -->
        <div class="mb-4 text-center md:mb-6">
          <h2 class="mb-2 text-xl font-bold md:text-2xl lg:text-3xl">
            <span class="text-base-content">Upload</span> Paddock Boundaries
          </h2>
          <p class="mx-auto max-w-2xl px-2 text-sm text-contrast-content/60">
            Upload your paddock boundary files for processing.
          </p>
        </div>

        <!-- Skip Button - compact -->
        <div class="mb-3 flex justify-center md:mb-4">
          <button
            on:click={handleSkip}
            class="group flex items-center gap-2 rounded-md border border-base-content/10 bg-base-200 px-3 py-1.5 text-xs text-contrast-content/60 shadow-sm transition-all duration-300 hover:border-base-content/50 hover:bg-base-content/5 hover:text-base-content hover:shadow md:px-4 md:py-2 md:text-sm"
          >
            <span class="hidden sm:inline">Skip for now</span>
            <span class="sm:hidden">Skip</span>
            <ArrowRight
              size={12}
              class="text-base-content/40 transition-all group-hover:translate-x-0.5 group-hover:text-base-content"
            />
          </button>
        </div>

        <!-- Upload Card - compact -->
        <div
          class="animate-boundary-fadeIn relative mx-auto max-w-2xl overflow-hidden rounded-xl border border-base-300 bg-base-100 shadow-xl"
        >
          <!-- Decorative accent -->
          <div
            class="absolute left-0 top-0 h-0.5 w-full bg-base-content md:h-1"
          ></div>

          <div class="p-4 md:p-6">
            <!-- File Drop Area - compact all states -->
            <div
              class="group relative mb-4 flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-lg border-2 border-dashed p-4 transition-all md:mb-6 md:p-6
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
                class="absolute inset-0 bg-base-content/5 opacity-0 transition-opacity group-hover:opacity-100"
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
                <!-- SUCCESS STATE - compact -->
                <div
                  class="animate-boundary-scaleIn relative z-10 flex flex-col items-center gap-3"
                >
                  <div
                    class="animate-boundary-successPulse flex h-12 w-12 items-center justify-center rounded-full bg-green-500/20 shadow-lg shadow-green-500/10 md:h-16 md:w-16"
                  >
                    <div
                      class="animate-boundary-checkScale flex h-10 w-10 items-center justify-center rounded-full bg-green-500 md:h-14 md:w-14"
                    >
                      <Check
                        size={20}
                        class="animate-boundary-checkDraw stroke-[3] text-white md:h-6 md:w-6"
                      />
                    </div>
                  </div>
                  <h3
                    class="text-lg font-bold text-contrast-content md:text-xl"
                  >
                    File Uploaded
                  </h3>
                  <p
                    class="max-w-xs truncate rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1 text-center text-xs text-green-400 md:text-sm"
                  >
                    {uploadedFile?.name}
                  </p>
                  <p
                    class="animate-boundary-delayedFadeIn text-center text-xs text-contrast-content/60 md:text-sm"
                  >
                    <span class="hidden sm:inline"
                      >Loading boundary review wizard...</span
                    >
                    <span class="sm:hidden">Loading wizard...</span>
                  </p>
                </div>
              {:else if isProcessing}
                <!-- LOADING STATE - compact -->
                <div
                  class="animate-boundary-scaleIn relative z-10 flex flex-col items-center gap-3"
                >
                  {#if uploadStatus === "loading"}
                    <div
                      class="relative mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-blue-500/20 md:h-16 md:w-16"
                    >
                      <div
                        class="animate-boundary-spin absolute inset-0 rounded-full border-2 border-blue-400/30 border-t-blue-400"
                      ></div>
                      <Cloud
                        size={20}
                        class="animate-boundary-pulse text-blue-400 md:h-6 md:w-6"
                      />
                    </div>
                    <p
                      class="text-base font-medium text-contrast-content md:text-lg"
                    >
                      Uploading file...
                    </p>
                  {:else}
                    <div
                      class="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-info/20 md:h-16 md:w-16"
                    >
                      <div
                        class="loading loading-spinner loading-md text-info"
                      ></div>
                    </div>
                    <p
                      class="text-base font-medium text-contrast-content md:text-lg"
                    >
                      {uploadStatus === "validating"
                        ? "Validating file..."
                        : "Processing file..."}
                    </p>
                  {/if}
                  <p
                    class="max-w-xs truncate rounded-full bg-base-200 px-3 py-1 text-center text-xs text-contrast-content/60 md:text-sm"
                  >
                    Processing {uploadedFile?.name}
                  </p>
                  {#if fileInfo && uploadStatus === "processing"}
                    <p
                      class="animate-boundary-delayedFadeIn px-2 text-center text-xs text-success md:text-sm"
                    >
                      ✓ {fileInfo}
                    </p>
                  {/if}
                </div>
              {:else if hasError}
                <!-- ERROR STATE - compact -->
                <div
                  class="animate-boundary-scaleIn relative z-10 flex max-w-sm flex-col items-center px-2"
                >
                  <div
                    class="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-error/20 md:h-16 md:w-16"
                  >
                    <AlertCircle size={20} class="text-error md:h-6 md:w-6" />
                  </div>
                  <p
                    class="mb-2 text-center text-base font-medium text-error md:text-lg"
                  >
                    File Not Compatible
                  </p>
                  <p
                    class="mb-4 px-2 text-center text-xs text-error md:text-sm"
                  >
                    {uploadError}
                  </p>

                  <div class="flex w-full flex-col gap-2">
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
                        class="flex flex-1 items-center justify-center gap-2 rounded-lg bg-info/10 px-2 py-2 text-xs text-info transition-all hover:bg-info/20"
                      >
                        <Mail size={12} />
                        <span class="hidden sm:inline">Contact Support</span>
                        <span class="sm:hidden">Support</span>
                      </button>

                      <button
                        on:click={(e) => {
                          e.stopPropagation()
                          handleSkip()
                        }}
                        class="flex flex-1 items-center justify-center gap-2 rounded-lg bg-base-content/10 px-2 py-2 text-xs text-contrast-content transition-all hover:bg-base-content/20"
                      >
                        <ArrowRight size={12} />
                        <span class="hidden sm:inline">Skip for Now</span>
                        <span class="sm:hidden">Skip</span>
                      </button>
                    </div>
                  </div>
                </div>
              {:else}
                <!-- DEFAULT UPLOAD STATE - compact -->
                <div class="relative z-10 flex flex-col items-center">
                  <div
                    class="relative mb-3 transition-transform duration-300 group-hover:scale-110 md:mb-4"
                  >
                    <div class="flex items-center justify-center space-x-4">
                      <Cloud
                        class="animate-boundary-pulse h-6 w-6 text-info md:h-8 md:w-8"
                      />
                      <div class="relative">
                        <File
                          class="h-8 w-8 text-base-content transition-all group-hover:rotate-6 md:h-12 md:w-12"
                        />
                        <div
                          class="absolute inset-0 bg-base-content/20 opacity-0 blur-sm transition-opacity group-hover:opacity-100"
                        ></div>
                      </div>
                      <Cloud
                        class="animate-boundary-pulse h-6 w-6 text-info md:h-8 md:w-8"
                      />
                    </div>
                    <div
                      class="animate-boundary-spin-slow absolute -inset-6 rounded-full border border-dashed border-info/30 opacity-50 md:-inset-8"
                    ></div>
                  </div>
                  <p
                    class="mb-2 px-2 text-center text-base font-semibold text-contrast-content md:text-lg"
                  >
                    <span class="hidden sm:inline"
                      >Click to upload or drag and drop</span
                    >
                    <span class="sm:hidden">Tap to upload files</span>
                  </p>
                  <p
                    class="mb-2 px-2 text-center text-xs text-contrast-content/60 md:text-sm"
                  >
                    ZIP, ISOXML or KML files (Max 50mb)
                  </p>
                  <div
                    class="mt-1 flex items-center gap-2 rounded-full bg-info/10 px-2 py-1 text-xs text-info/70"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="10"
                      height="10"
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

            <!-- Requirements Section - compact -->
            <div
              class="-mx-2 mb-4 rounded-lg bg-base-200/80 p-3 md:mb-6 md:p-4"
            >
              <h3
                class="mb-2 flex items-center gap-2 text-sm font-bold text-contrast-content md:mb-3"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
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
              <ul class="space-y-2 md:space-y-3">
                <li class="flex items-start gap-2">
                  <div
                    class="mt-0.5 flex h-4 w-4 items-center justify-center rounded-full border border-base-300 bg-base-200 text-base-content"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="10"
                      height="10"
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
                  <span class="text-xs text-contrast-content/80">
                    <span class="hidden sm:inline"
                      >Zipped Shapefiles, KML files and ISOXML files are all
                      accepted</span
                    >
                    <span class="sm:hidden"
                      >ZIP, KML and ISOXML files accepted</span
                    >
                  </span>
                </li>
                <li class="flex items-start gap-2">
                  <div
                    class="mt-0.5 flex h-4 w-4 items-center justify-center rounded-full border border-base-300 bg-base-200 text-base-content"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="10"
                      height="10"
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
                  <span class="text-xs text-contrast-content/80">
                    <span class="hidden sm:inline"
                      >Shapefile ZIP must contain .dbf, .shx and .shp files</span
                    >
                    <span class="sm:hidden"
                      >Shapefile ZIP needs .dbf, .shx, .shp files</span
                    >
                  </span>
                </li>
                <li
                  class="flex cursor-pointer items-start gap-2 text-info transition-colors hover:text-info/80"
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
                    class="mt-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-info/20 text-info"
                  >
                    <Download size={10} />
                  </div>
                  <span class="text-xs">
                    <span class="hidden sm:inline"
                      >Download Example Paddock File</span
                    >
                    <span class="sm:hidden">Download Example File</span>
                  </span>
                </li>
              </ul>
            </div>

            <!-- Supported Types Section - compact -->
            <div class="mb-4">
              <h3 class="mb-2 text-sm font-bold text-contrast-content">
                Supported Polygon Types
              </h3>
              <ul class="space-y-2">
                <li class="flex items-start gap-2">
                  <div
                    class="mt-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-success/20 text-success"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="10"
                      height="10"
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
                  <span class="text-xs text-contrast-content/80">Polygon</span>
                </li>
                <li class="flex items-start gap-2">
                  <div
                    class="mt-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-success/20 text-success"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="10"
                      height="10"
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
                  <span class="text-xs text-contrast-content/80"
                    >Multipolygon</span
                  >
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  /* Unique boundary animations to avoid conflicts */
  @keyframes boundary-scaleIn {
    from {
      opacity: 0;
      transform: scale(0.9);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  .animate-boundary-scaleIn {
    animation: boundary-scaleIn 0.2s ease-out;
  }

  @keyframes boundary-fadeIn {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  .animate-boundary-fadeIn {
    animation: boundary-fadeIn 0.2s ease-out;
  }

  @keyframes boundary-delayedFadeIn {
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

  .animate-boundary-delayedFadeIn {
    animation: boundary-delayedFadeIn 1s ease-out;
  }

  @keyframes boundary-spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  .animate-boundary-spin {
    animation: boundary-spin 1s linear infinite;
  }

  @keyframes boundary-spin-slow {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  .animate-boundary-spin-slow {
    animation: boundary-spin-slow 8s linear infinite;
  }

  @keyframes boundary-pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  .animate-boundary-pulse {
    animation: boundary-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }

  /* Enhanced success animations */
  @keyframes boundary-successPulse {
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

  .animate-boundary-successPulse {
    animation: boundary-successPulse 2s ease-in-out infinite;
  }

  @keyframes boundary-checkScale {
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

  .animate-boundary-checkScale {
    animation: boundary-checkScale 0.6s ease-out 0.3s both;
  }

  @keyframes boundary-checkDraw {
    0% {
      stroke-dasharray: 50;
      stroke-dashoffset: 50;
    }
    100% {
      stroke-dasharray: 50;
      stroke-dashoffset: 0;
    }
  }

  .animate-boundary-checkDraw {
    animation: boundary-checkDraw 0.5s ease-out 0.5s both;
  }

  /* Slide transitions for wizard */
  @keyframes boundary-slideInRight {
    from {
      opacity: 0;
      transform: translateX(100%);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  .animate-boundary-slideInRight {
    animation: boundary-slideInRight 0.5s ease-out;
  }

  @keyframes boundary-slideInLeft {
    from {
      opacity: 0;
      transform: translateX(-20px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  .animate-boundary-slideInLeft {
    animation: boundary-slideInLeft 0.3s ease-out;
  }
</style>
