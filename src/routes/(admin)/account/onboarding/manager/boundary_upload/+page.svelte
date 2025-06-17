<!-- src/routes/(admin)/account/onboarding/manager/boundary_upload/+page.svelte -->
<script lang="ts">
  import { goto } from "$app/navigation"
  import {
    ArrowRight,
    Cloud,
    Download,
    File,
    X,
    CheckCircle,
  } from "lucide-svelte"

  let fileInput: HTMLInputElement
  let isDragging = false
  let uploadedFile: File | null = null
  let uploadError: string | null = null
  let uploadStatus: "loading" | "success" | "error" | null = null
  let showSuccess = false

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
      validateAndSetFile(e.dataTransfer.files[0])
    }
  }

  function handleFileChange(e: Event) {
    const target = e.target as HTMLInputElement
    if (target.files && target.files.length > 0) {
      validateAndSetFile(target.files[0])
    }
  }

  function validateAndSetFile(file: File) {
    uploadError = null

    // Check file type
    const fileName = file.name.toLowerCase()
    const validExtensions = [".zip", ".kml", ".xml", ".isoxml"]
    const isValidType = validExtensions.some((ext) => fileName.endsWith(ext))

    if (!isValidType) {
      uploadError =
        "Invalid file type. Please upload ZIP, KML, or ISOXML files."
      return
    }

    // Check file size (50MB max)
    const maxSize = 50 * 1024 * 1024 // 50MB in bytes
    if (file.size > maxSize) {
      uploadError = "File is too large. Maximum size is 50MB."
      return
    }

    uploadedFile = file
  }

  function handleUploadClick() {
    if (!uploadedFile) {
      fileInput?.click()
    }
  }

  function handleRemoveFile() {
    uploadedFile = null
    if (fileInput) {
      fileInput.value = ""
    }
  }

  function handleSkip() {
    goto("/account/onboarding/manager/team_invite")
  }

  function handleContinue() {
    // Process the file and continue to the next step
    uploadStatus = "loading"

    // Simulate processing time
    setTimeout(() => {
      uploadStatus = "success"
      showSuccess = true

      // Navigate to team invite after successful upload
      setTimeout(() => {
        goto("/account/onboarding/manager/team_invite")
      }, 2000)
    }, 2000)
  }

  function downloadExample() {
    // Stub for downloading example file
    console.log("Download example file")
  }
</script>

<svelte:head>
  <title>Boundary Upload - AgSKAN</title>
  <meta name="description" content="Upload your farm paddock boundary files" />
</svelte:head>

<!-- Header -->
<div class="mb-12 text-center">
  <h2 class="mb-3 text-4xl font-bold text-contrast-content">
    Upload <span class="text-base-content">Boundaries</span>
  </h2>
  <p class="mx-auto max-w-md text-contrast-content/60">
    Upload your farm paddock boundary files for processing
  </p>
</div>

{#if showSuccess}
  <!-- Success Message -->
  <div
    class="animate-fadeIn relative mx-auto max-w-md overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-xl"
  >
    <!-- Card header decoration -->
    <div
      class="h-1.5 w-full bg-gradient-to-r from-base-content/80 via-base-content to-base-content/80"
    ></div>

    <div class="p-8">
      <div class="flex flex-col items-center text-center">
        <div class="mb-4 rounded-full bg-success/20 p-4 text-success">
          <CheckCircle size={32} />
        </div>
        <h3 class="mb-2 text-xl font-bold text-contrast-content">
          Boundaries Uploaded Successfully!
        </h3>
        <p class="text-sm text-contrast-content/60">
          Processing your boundary files...
        </p>
      </div>
    </div>
  </div>
{:else}
  <!-- Upload Card -->
  <div
    class="relative mx-auto max-w-2xl overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-xl"
  >
    <!-- Card header decoration -->
    <div
      class="h-1.5 w-full bg-gradient-to-r from-base-content/80 via-base-content to-base-content/80"
    ></div>

    <div class="p-8">
      <!-- File Drop Area -->
      <div
        class="group relative mb-8 flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed p-10 transition-all
          {isDragging
          ? 'scale-[0.99] border-base-content bg-base-content/10'
          : uploadedFile
            ? 'border-success/30 bg-success/5'
            : 'border-base-300 bg-base-200/50 hover:border-base-content/40 hover:bg-base-content/5'}"
        on:dragover={handleDragOver}
        on:dragleave={handleDragLeave}
        on:drop={handleDrop}
        on:click={handleUploadClick}
        on:keydown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            handleUploadClick()
          }
        }}
        role="button"
        tabindex="0"
      >
        <!-- Background effect -->
        <div
          class="absolute inset-0 bg-gradient-to-tr from-base-content/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100"
        ></div>

        <input
          bind:this={fileInput}
          type="file"
          class="hidden"
          on:change={handleFileChange}
          accept=".zip,.kml,.xml,.isoxml"
        />

        {#if uploadedFile}
          <div class="animate-scaleIn relative z-10 flex flex-col items-center">
            <div
              class="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success/20 shadow-lg transition-transform group-hover:scale-105"
            >
              <File size={32} class="text-success" />
            </div>
            <p class="mb-1 text-lg font-medium text-contrast-content">
              {uploadedFile.name}
            </p>
            <p
              class="mb-5 rounded-full bg-base-200 px-3 py-1 text-sm text-contrast-content/60"
            >
              {(uploadedFile.size / (1024 * 1024)).toFixed(2)} MB
            </p>
            <button
              on:click={(e) => {
                e.stopPropagation()
                handleRemoveFile()
              }}
              class="flex items-center gap-2 rounded-lg bg-base-200 px-4 py-2 text-sm text-contrast-content transition-all hover:bg-base-300 hover:shadow-md"
            >
              <X size={14} />
              <span>Remove File</span>
            </button>
          </div>
        {:else}
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
                </div>
                <Cloud class="h-8 w-8 animate-pulse text-info" />
              </div>
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

        {#if uploadError}
          <div
            class="mt-4 rounded-lg border border-error/20 bg-error/10 px-4 py-2 text-sm text-error"
          >
            {uploadError}
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
              Zipped Shapefiles, KML files and ISOXML files are all accepted
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
              Multiple ZIP files or an ISOXML can be contained in a single ZIP
              file
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
            <span class="text-sm text-contrast-content/80">Multipolygon</span>
          </li>
        </ul>
      </div>

      <!-- Actions -->
      <div class="flex items-center justify-between">
        <div>
          {#if !uploadedFile}
            <button
              on:click={handleSkip}
              class="group flex items-center gap-2 rounded-xl border border-base-content/10 bg-base-200 px-4 py-2 text-sm text-contrast-content/60 shadow-sm transition-all duration-300 hover:border-base-content/50 hover:bg-base-content/5 hover:text-base-content hover:shadow"
            >
              <span>Skip for now</span>
              <ArrowRight
                size={14}
                class="text-base-content/40 transition-all group-hover:translate-x-0.5 group-hover:text-base-content"
              />
            </button>
            <div class="ml-1 mt-2 text-xs text-contrast-content/40">
              You can upload boundaries later
            </div>
          {/if}
        </div>
        {#if uploadedFile}
          <button
            on:click={handleContinue}
            disabled={uploadStatus === "loading"}
            class="ml-auto flex transform items-center gap-2 rounded-xl bg-base-content px-6 py-3 font-medium text-base-100 shadow-lg shadow-base-content/20 transition-all hover:-translate-y-0.5 hover:bg-base-content/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {#if uploadStatus === "loading"}
              <span class="loading loading-spinner loading-sm"></span>
              Processing...
            {:else}
              Continue
              <ArrowRight size={16} />
            {/if}
          </button>
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
</style>
