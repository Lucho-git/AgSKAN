<!-- FileUpload.svelte -->
<script lang="ts">
  import { createEventDispatcher } from "svelte"
  import { userFilesStore } from "./userFilesStore"
  import FileInspector from "../../../../../components/FileInspector.svelte"
  import { session } from "$lib/stores/sessionStore"
  import { browser } from "$app/environment"
  import { onMount } from "svelte"
  import { toast } from "svelte-sonner"
  import { fileApi } from "$lib/api/fileApi"
  import LottieAnimation from "$lib/components/LottieAnimation.svelte"

  // Lottie animations
  import OneFileMovement from "$lib/animations/OneFileMovement.json"
  import Error2 from "$lib/animations/Error2.json"
  import IdleFile from "$lib/animations/IdleFile.json"

  export let isPopoverOpen = false

  let file: File | null = null
  let isFileValid = false
  let uploading = false
  let errorMessage = ""
  let successMessage = ""
  let fileInfo = ""
  let dragOver = false
  let modalId = "file-upload-modal"
  let processingFile = false // Added to track file processing state

  const dispatch = createEventDispatcher()

  const handleFileChange = (event: Event) => {
    const target = event.target as HTMLInputElement
    file = target.files?.[0] || null
    isFileValid = false
    processingFile = true // Set processing state to true
    errorMessage = ""
    successMessage = ""
    fileInfo = ""
    if (file) {
      const inspector = new FileInspector({
        target: document.createElement("div"),
        props: { file },
      })
    }
  }

  const handleValidFile = async (event: CustomEvent) => {
    isFileValid = true
    errorMessage = ""
    fileInfo = event.detail.info

    // Auto-upload when file is validated
    if (file && isFileValid && processingFile) {
      processingFile = false // Reset processing state
      await handleFileUpload()
    }
  }

  const handleInvalidFile = () => {
    isFileValid = false
    errorMessage = "Invalid file format. Please select a Valid file."
    fileInfo = ""
    processingFile = false // Reset processing state
  }

  const handleFileUpload = async () => {
    if (file && isFileValid) {
      uploading = true
      errorMessage = ""
      successMessage = ""

      try {
        const result = await fileApi.uploadFile(file)

        if (result.success) {
          // Normalize the new file data
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

          file = null
          isFileValid = false
          successMessage = "File uploaded successfully"
          toast.success("File uploaded successfully")

          // Auto-close the modal after successful upload
          setTimeout(() => {
            closePopover()
          }, 1500) // Give the user 1.5 seconds to see the success message
        } else {
          errorMessage =
            result.message ||
            "An error occurred while uploading the file. Please try again."
          isFileValid = false
          toast.error(errorMessage)
        }
      } catch (error) {
        errorMessage =
          "An unexpected error occurred while uploading the file. Please try again."
        isFileValid = false
        toast.error(errorMessage)
      } finally {
        uploading = false
      }
    }
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault()
    dragOver = true
  }

  function handleDragLeave(event: DragEvent) {
    event.preventDefault()
    dragOver = false
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault()
    dragOver = false
    const droppedFile = event.dataTransfer?.files[0]
    if (droppedFile) {
      file = droppedFile
      isFileValid = false
      processingFile = true // Set processing state to true for dropped files
      errorMessage = ""
      successMessage = ""
      fileInfo = ""
      const inspector = new FileInspector({
        target: document.createElement("div"),
        props: { file },
      })
    }
  }

  function closePopover() {
    errorMessage = ""
    successMessage = ""
    fileInfo = ""
    isFileValid = false
    file = null
    processingFile = false
    const modal = document.getElementById(modalId) as HTMLDialogElement
    if (modal) modal.close()
    dispatch("close")
  }

  $: if (isPopoverOpen) {
    const modal = document.getElementById(modalId) as HTMLDialogElement
    if (modal) modal.showModal()
  }
</script>

<!-- File Upload Modal using Daisy UI -->
<dialog
  id={modalId}
  class="upload-modal-custom modal modal-bottom sm:modal-middle"
>
  <div class="desktop-wider mobile-fix modal-box max-w-3xl">
    <form method="dialog">
      <button
        class="btn btn-circle btn-ghost btn-sm absolute right-2 top-2"
        on:click={closePopover}>✕</button
      >
    </form>

    <h3 class="text-xl font-bold">Upload Paddock Boundaries</h3>
    <p class="mb-4 mt-1 text-sm opacity-70">
      Upload your farm paddock boundary files for processing
    </p>

    <div class="mx-auto flex flex-col items-center justify-center">
      <div
        class={`flex h-64 w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed ${dragOver ? "border-primary bg-base-200" : "border-base-300 bg-base-100"} transition-colors`}
        on:dragover={handleDragOver}
        on:dragleave={handleDragLeave}
        on:drop={handleDrop}
      >
        <label
          for="dropzone-file"
          class="flex h-full w-full cursor-pointer flex-col items-center justify-center"
        >
          {#if uploading}
            <div class="flex flex-col items-center justify-center pb-6 pt-5">
              {#if browser}
                <LottieAnimation
                  animationData={OneFileMovement}
                  width="200px"
                  height="150px"
                />
              {/if}
              <p class="mt-2 font-semibold">Uploading file...</p>
              <div class="mt-2">
                <span class="loading loading-dots loading-md"></span>
              </div>
            </div>
          {:else if file && !errorMessage}
            <div class="flex flex-col items-center justify-center pb-6 pt-5">
              {#if browser}
                <LottieAnimation
                  animationData={OneFileMovement}
                  width="200px"
                  height="150px"
                />
              {/if}
              <p class="font-semibold">
                {file.name}
              </p>
              <p class="mt-1 text-xs opacity-70">
                {(file.size / 1024).toFixed(1)} KB
              </p>
              {#if processingFile}
                <p class="mt-2 text-sm">Processing file...</p>
                <div class="mt-2">
                  <span class="loading loading-spinner loading-sm"></span>
                </div>
              {/if}
            </div>
          {:else if errorMessage}
            <div class="flex flex-col items-center justify-center pb-6 pt-5">
              {#if browser}
                <LottieAnimation
                  animationData={Error2}
                  width="150px"
                  height="150px"
                />
              {/if}
              <p class="mt-2 text-sm text-error">{errorMessage}</p>
              <p class="mt-2 text-sm">Try uploading a different file</p>
            </div>
          {:else}
            <div class="flex flex-col items-center justify-center pb-6 pt-5">
              {#if browser}
                <LottieAnimation
                  animationData={IdleFile}
                  width="150px"
                  height="150px"
                />
              {/if}
              <p class="font-semibold">
                <span>Click to upload</span> or drag and drop
              </p>
              <p class="mt-1 text-xs opacity-70">
                ZIP, ISOXML or .KML files (Max: 50mb)
              </p>
            </div>
          {/if}
          <input
            id="dropzone-file"
            type="file"
            accept=".zip,.shp,.shx,.dbf,.prj,.kml,.kmz,.xml"
            class="hidden"
            on:change={handleFileChange}
            disabled={uploading || processingFile}
          />
        </label>
      </div>

      {#if successMessage}
        <div class="alert alert-success mt-4 w-full">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-6 w-6 shrink-0 stroke-current"
            fill="none"
            viewBox="0 0 24 24"
            ><path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            /></svg
          >
          <span>{successMessage}</span>
        </div>
      {/if}

      {#if fileInfo}
        <p class="mt-2 text-sm opacity-70">File Info: {fileInfo}</p>
      {/if}
    </div>

    <div class="divider my-6"></div>

    <div class="space-y-4">
      <div>
        <h3 class="mb-2 font-bold">File Upload Requirements</h3>
        <ul class="space-y-2">
          <li class="flex items-start">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="mr-2 mt-0.5 h-5 w-5 shrink-0 text-primary"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              ><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
              ></path></svg
            >
            <span
              >Zipped Shapefiles, .KML files and ISOXML files are all accepted</span
            >
          </li>
          <li class="flex items-start">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="mr-2 mt-0.5 h-5 w-5 shrink-0 text-primary"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              ><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
              ></path></svg
            >
            <span>Shapefile ZIP must contain .dbf, .shx and .shp files</span>
          </li>
          <li class="flex items-start">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="mr-2 mt-0.5 h-5 w-5 shrink-0 text-primary"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              ><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
              ></path></svg
            >
            <span
              >Multiple ZIP files or an ISOXML can be contained in a single ZIP
              file</span
            >
          </li>
          <li class="flex items-start">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="mr-2 mt-0.5 h-5 w-5 shrink-0 text-primary"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              ><polyline points="8 17 12 21 16 17"></polyline><line
                x1="12"
                y1="12"
                x2="12"
                y2="21"
              ></line><path
                d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29"
              ></path></svg
            >
            <a
              href="/docs/skan_sample_shapefile.zip"
              class="text-primary hover:underline"
              download
            >
              Download Example Paddock File
            </a>
          </li>
        </ul>
      </div>

      <div>
        <h3 class="mb-2 font-bold">Supported Polygon Types</h3>
        <ul class="space-y-2">
          <li class="flex items-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="mr-2 h-5 w-5 text-primary"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              ><polyline points="20 6 9 17 4 12"></polyline></svg
            >
            <span>Polygon</span>
          </li>
          <li class="flex items-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="mr-2 h-5 w-5 text-primary"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              ><polyline points="20 6 9 17 4 12"></polyline></svg
            >
            <span>Multipolygon</span>
          </li>
        </ul>
      </div>
    </div>

    <FileInspector
      {file}
      on:validFile={handleValidFile}
      on:invalidFile={handleInvalidFile}
    />

    <div class="modal-action">
      <button class="btn" on:click={closePopover} disabled={uploading}>
        {#if successMessage}
          Done
        {:else}
          Cancel
        {/if}
      </button>
    </div>
  </div>

  <form method="dialog" class="modal-backdrop">
    <button on:click={closePopover} disabled={uploading}>close</button>
  </form>
</dialog>

<style>
  /* Desktop-only width enhancement */
  @media (min-width: 768px) {
    .desktop-wider {
      width: 800px;
      max-width: 90%;
    }
  }

  /* Mobile bottom spacing fix without changing horizontal alignment */
  @media (max-width: 640px) {
    /* Add padding at the bottom of modal content to prevent button cutoff */
    .mobile-fix {
      padding-bottom: 5rem;
    }

    /* Adjust modal container positioning */
    .modal.modal-bottom {
      padding-bottom: 2rem;
    }
  }
</style>
