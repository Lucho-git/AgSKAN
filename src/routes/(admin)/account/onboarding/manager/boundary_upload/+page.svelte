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
    toast.success(`${paddocks.length} field(s) loaded successfully!`)

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
  <!-- Decorative Background Elements -->
  <div
    class="pointer-events-none absolute -right-20 top-20 h-64 w-64 rounded-full bg-base-content/5 blur-3xl"
  ></div>
  <div
    class="pointer-events-none absolute -left-20 bottom-20 h-80 w-80 rounded-full bg-base-content/5 blur-3xl"
  ></div>

  <div class="relative z-10">
    {#if showWizard}
      <!-- Embedded Boundary Wizard with slide transition -->
      <div class="animate-slideInRight">
        <BoundaryWizard
          fileId={wizardFileId}
          fileName={wizardFileName}
          on:fieldsLoaded={handleFieldsLoaded}
          on:backToUpload={handleBackToUpload}
        />
      </div>
    {:else}
      <!-- Upload Interface with slide transition -->
      <div class="animate-slideInLeft">
        <!-- Header -->
        <div class="mb-8 text-center">
          <h2 class="mb-3 text-3xl font-bold md:text-4xl">
            <span class="text-base-content">Upload</span> Paddock Boundaries
          </h2>
          <p class="mx-auto max-w-3xl text-contrast-content/60">
            Upload your paddock boundary files for processing. No files yet?
            Skip this step and return to upload later when available.
          </p>
        </div>

        <!-- Skip Button - Moved to Top -->
        <div class="mb-6 flex justify-center">
          <button
            on:click={handleSkip}
            class="group flex items-center gap-2 rounded-md border border-base-content/10 bg-base-200 px-4 py-2 text-sm text-contrast-content/60 shadow-sm transition-all duration-300 hover:border-base-content/50 hover:bg-base-content/5 hover:text-base-content hover:shadow"
          >
            <span>Skip for now</span>
            <ArrowRight
              size={14}
              class="text-base-content/40 transition-all group-hover:translate-x-0.5 group-hover:text-base-content"
            />
          </button>
        </div>

        <!-- Upload Card -->
        <div
          class="animate-fadeIn relative mx-auto max-w-3xl overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-xl"
        >
          <!-- Decorative accent -->
          <div class="absolute left-0 top-0 h-1 w-full bg-base-content"></div>

          <div class="p-6 md:p-8">
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
                  <h3 class="text-xl font-bold text-contrast-content">
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
                    Loading boundary review wizard...
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
                        class="absolute inset-0 animate-spin rounded-full border-2 border-blue-400/30 border-t-blue-400"
                      ></div>
                      <Cloud size={28} class="animate-pulse text-blue-400" />
                    </div>
                    <p class="text-lg font-medium text-contrast-content">
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
                    <p class="text-lg font-medium text-contrast-content">
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
                  <p class="mb-2 text-lg font-medium text-error">
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

                      <button
                        on:click={(e) => {
                          e.stopPropagation()
                          handleSkip()
                        }}
                        class="flex flex-1 items-center justify-center gap-2 rounded-lg bg-base-content/10 px-3 py-2 text-sm text-contrast-content transition-all hover:bg-base-content/20"
                      >
                        <ArrowRight size={14} />
                        <span>Skip for Now</span>
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
                    <div class="flex items-center justify-center space-x-6">
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
                  <p class="mb-3 text-xl font-semibold text-contrast-content">
                    Click to upload or drag and drop
                  </p>
                  <p class="mb-2 text-center text-sm text-contrast-content/60">
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
                    Multiple ZIP files or an ISOXML can be contained in a single
                    ZIP file
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
                  <span class="text-sm">Download Example Paddock File</span>
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
                  <span class="text-sm text-contrast-content/80">Polygon</span>
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
    {/if}
  </div>
</div>

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

  /* Slide transitions for wizard */
  @keyframes slideInRight {
    from {
      opacity: 0;
      transform: translateX(100%);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  .animate-slideInRight {
    animation: slideInRight 0.5s ease-out;
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
</style>
