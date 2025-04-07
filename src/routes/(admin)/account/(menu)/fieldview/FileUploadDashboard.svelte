<!-- src/routes/admin/fieldview/FileUploadDashboard.svelte -->
<script lang="ts">
  import { onMount, afterUpdate } from "svelte" // Added afterUpdate
  import { goto } from "$app/navigation"
  import { userFilesStore } from "./userFilesStore" // Adjust path if necessary
  import { menuStore } from "../../../../../stores/menuStore"
  import { session } from "$lib/stores/sessionStore" // Import session store
  import { fileApi } from "$lib/api/fileApi"

  import type { FileUpload } from "$lib/types"

  import {
    Table,
    TableBody,
    TableCaption,
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
  } from "$lib/components/ui/card"
  import {
    Download,
    Trash,
    FileUp,
    Minimize,
    Maximize2,
    Play,
    AlertTriangle,
    ChevronDown,
    ChevronUp,
    Info,
  } from "lucide-svelte"

  import { toast } from "svelte-sonner"

  // Read the files once from the store
  $: files = $userFilesStore

  // Track previous files to detect new additions
  let previousFiles: FileUpload[] = []
  let isFirstLoad = true
  let autoProcessingFile = false

  // Local state for handling errors
  let errorMessage = ""

  // State for expanded/condensed view
  let isExpanded = true
  let isMobile = false

  // Track which rows are expanded in mobile view
  let expandedRows = new Set()

  // State for delete modal
  let deleteModalId = "delete-file-modal"
  let fileToDelete: FileUpload | null = null

  onMount(() => {
    const mediaQuery = window.matchMedia("(max-width: 768px)")
    isMobile = mediaQuery.matches
    isExpanded = !isMobile

    mediaQuery.addEventListener("change", (e) => {
      isMobile = e.matches
      if (isMobile) {
        isExpanded = false
        expandedRows.clear()
      } else {
        isExpanded = true
      }
    })

    // Initialize previous files
    previousFiles = [...files]
    isFirstLoad = false
  })

  // Watch for changes to detect newly uploaded files
  afterUpdate(() => {
    if (isFirstLoad || autoProcessingFile) return

    // Check if a new file was added
    if (files.length > previousFiles.length) {
      const newFiles = files.filter(
        (current) => !previousFiles.some((prev) => prev.id === current.id),
      )

      // If we have new files, process the first one
      if (newFiles.length > 0) {
        autoProcessingFile = true
        const newFile = newFiles[0]

        toast.info(`Processing newly uploaded file: ${newFile.name}`, {
          duration: 3000,
        })

        // Use a slight delay to ensure the store is updated and toast is shown
        setTimeout(() => {
          handleProcess(newFile)
        }, 800)
      }
    }

    // Update previous files for next comparison
    previousFiles = [...files]
  })

  function toggleView() {
    if (isMobile) {
      // In mobile mode, this toggles between list and card views
      isExpanded = !isExpanded
      expandedRows.clear()
    } else {
      // In desktop mode, this toggles between full and compact table
      isExpanded = !isExpanded
    }
  }

  function toggleRowExpand(fileId: string) {
    if (expandedRows.has(fileId)) {
      expandedRows.delete(fileId)
    } else {
      expandedRows.add(fileId)
    }
    expandedRows = expandedRows // Trigger reactivity
  }

  function formatDate(date: string): string {
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  }

  async function handleDownload(file: FileUpload) {
    try {
      const result = await fileApi.downloadFile(file.name)

      if (!result.success || !result.data) {
        throw new Error(result.message || "Failed to download file")
      }

      const blob = result.data
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = file.name
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      errorMessage = `Error downloading file: ${error.message}`
      toast.error(errorMessage)
    }
  }

  function openDeleteModal(file: FileUpload) {
    fileToDelete = file
    const modal = document.getElementById(deleteModalId) as HTMLDialogElement
    if (modal) modal.showModal()
  }

  function closeDeleteModal() {
    const modal = document.getElementById(deleteModalId) as HTMLDialogElement
    if (modal) modal.close()
    fileToDelete = null
  }

  async function deleteFile() {
    if (!fileToDelete) return

    try {
      const result = await fileApi.deleteFile(fileToDelete.name)

      if (!result.success) {
        throw new Error(result.message)
      }

      // Update the store by removing the deleted file
      userFilesStore.update((files) => {
        return files.filter((f) => f.name !== fileToDelete.name)
      })

      toast.success(`File "${fileToDelete.name}" deleted successfully`)

      // Close the modal
      closeDeleteModal()
    } catch (error) {
      errorMessage = `Error deleting file ${fileToDelete.name}: ${error.message}`
      toast.error(`Failed to delete file: ${error.message}`)
    }
  }

  function truncateFileName(name: string, maxLength: number = 20): string {
    if (name.length <= maxLength) return name
    const half = Math.floor((maxLength - 3) / 2)
    return `${name.slice(0, half)}...${name.slice(-half)}`
  }

  async function handleProcess(file: FileUpload) {
    try {
      // Encode the file name to ensure it's URL-safe
      const encodedFileName = encodeURIComponent(file.name)
      const encodedFileId = encodeURIComponent(file.id)

      // Navigate to the new page with file information in the URL
      await goto(
        `/account/fieldview/landwizard?fileName=${encodedFileName}&fileId=${encodedFileId}`,
      )
    } catch (error) {
      autoProcessingFile = false // Reset flag if there's an error
      toast.error(`Error initiating process for ${file.name}: ${error.message}`)
    }
  }

  function getStatusBadgeClass(status: string): string {
    switch (status) {
      case "Processed":
        return "bg-green-100 text-green-800"
      case "Pending":
        return "bg-yellow-100 text-yellow-800"
      default:
        return "bg-red-100 text-red-800"
    }
  }
</script>

<!-- Delete File Modal -->
<dialog id={deleteModalId} class="modal modal-bottom sm:modal-middle">
  <div class="modal-box">
    <div class="flex items-center gap-2">
      <div class="rounded-lg bg-destructive/10 p-2">
        <AlertTriangle class="h-5 w-5 text-destructive" />
      </div>
      <div>
        <h3 class="text-lg font-bold">Delete File</h3>
        <p class="text-sm text-muted-foreground">
          This action cannot be undone
        </p>
      </div>
    </div>

    <div class="p-4">
      {#if fileToDelete}
        <p>
          Are you sure you want to delete the file "{fileToDelete.name}"?
        </p>
      {/if}
    </div>

    <div class="modal-action">
      <form method="dialog" class="flex w-full gap-2 sm:w-auto">
        <Button
          variant="outline"
          class="flex-1 sm:flex-none"
          on:click={closeDeleteModal}
        >
          Cancel
        </Button>
        <Button
          variant="destructive"
          class="flex-1 sm:flex-none"
          on:click={deleteFile}
        >
          Delete
        </Button>
      </form>
    </div>
  </div>
  <form method="dialog" class="modal-backdrop">
    <button>close</button>
  </form>
</dialog>

<div class="width-auto py-6">
  <Card>
    <CardHeader class="px-2 sm:px-4">
      <div class="flex items-center justify-between">
        <CardTitle class="flex items-center text-2xl font-bold">
          <FileUp class="mr-2 h-6 w-6" />
          File Upload Dashboard
        </CardTitle>
        <Button variant="outline" size="sm" on:click={toggleView}>
          {#if isExpanded}
            <Minimize class="mr-1 h-4 w-4" />
            {#if isMobile}Card View{:else}Compact{/if}
          {:else}
            <Maximize2 class="mr-1 h-4 w-4" />
            {#if isMobile}List View{:else}Full{/if}
          {/if}
        </Button>
      </div>
    </CardHeader>

    <CardContent class="px-2 sm:px-4">
      {#if !files || files.length === 0}
        <div class="flex flex-col items-center justify-center text-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="mb-4 h-12 w-12 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 4v16m8-8H4"
            />
          </svg>
          <p class="text-gray-500">No files uploaded yet.</p>
        </div>
      {:else if isMobile && !isExpanded}
        <!-- Mobile Card View -->
        <div class="grid grid-cols-1 gap-4">
          {#each files as file (file.id)}
            <div class="card border bg-base-100 shadow-sm">
              <div class="card-body p-4">
                <div class="flex items-center justify-between">
                  <h3 class="card-title text-base">
                    {truncateFileName(file.name, 24)}
                  </h3>
                  <span
                    class={`rounded-full px-2 py-1 text-xs font-semibold ${getStatusBadgeClass(file.status)}`}
                  >
                    {file.status}
                  </span>
                </div>

                <div class="mt-1 text-xs text-gray-500">
                  {formatDate(file.uploadedDate)}
                </div>

                {#if file.message}
                  <div class="mt-2 flex items-start text-sm">
                    <Info class="mr-1 mt-0.5 h-4 w-4 flex-shrink-0" />
                    <span>{file.message}</span>
                  </div>
                {/if}

                <div class="card-actions mt-3 justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    on:click={() => handleProcess(file)}
                    class="px-2"
                  >
                    <Play class="mr-1 h-4 w-4" /> Process
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    on:click={() => handleDownload(file)}
                    class="px-2"
                  >
                    <Download class="mr-1 h-4 w-4" /> Download
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    on:click={() => openDeleteModal(file)}
                    class="px-2 text-red-600"
                  >
                    <Trash class="mr-1 h-4 w-4" /> Delete
                  </Button>
                </div>
              </div>
            </div>
          {/each}
        </div>
      {:else}
        <!-- Desktop Table View or Mobile List View -->
        <div class="overflow-x-auto">
          <Table>
            <TableCaption>A list of your uploaded files</TableCaption>

            <TableHeader>
              <TableRow>
                {#if isMobile}
                  <!-- Toggle expand column for mobile -->
                  <TableHead class="w-10"></TableHead>
                {/if}
                <TableHead class="whitespace-nowrap">File Name</TableHead>
                {#if !isMobile && isExpanded}
                  <TableHead class="whitespace-nowrap">Uploaded Date</TableHead>
                {/if}
                <TableHead class="whitespace-nowrap">Status</TableHead>
                {#if !isMobile && isExpanded}
                  <TableHead class="whitespace-nowrap">Message</TableHead>
                {/if}
                <TableHead class="whitespace-nowrap text-right"
                  >Actions</TableHead
                >
              </TableRow>
            </TableHeader>

            <TableBody>
              {#each files as file (file.id)}
                <TableRow class="group">
                  {#if isMobile}
                    <!-- Expand/collapse button for mobile -->
                    <TableCell class="w-10 p-0 pl-2">
                      <button
                        class="btn btn-ghost btn-xs p-1"
                        on:click={() => toggleRowExpand(file.id)}
                        aria-label={expandedRows.has(file.id)
                          ? "Collapse row"
                          : "Expand row"}
                      >
                        {#if expandedRows.has(file.id)}
                          <ChevronUp class="h-4 w-4" />
                        {:else}
                          <ChevronDown class="h-4 w-4" />
                        {/if}
                      </button>
                    </TableCell>
                  {/if}

                  <TableCell
                    class="max-w-[35vw] truncate whitespace-nowrap font-medium"
                  >
                    {truncateFileName(
                      file.name,
                      isMobile ? 20 : isExpanded ? 30 : 20,
                    )}
                  </TableCell>

                  {#if !isMobile && isExpanded}
                    <TableCell class="whitespace-nowrap">
                      {formatDate(file.uploadedDate)}
                    </TableCell>
                  {/if}

                  <TableCell class="max-w-[10vw] whitespace-nowrap">
                    <span
                      class={`rounded-full px-2 py-1 text-xs font-semibold ${getStatusBadgeClass(file.status)}`}
                    >
                      {file.status}
                    </span>
                  </TableCell>

                  {#if !isMobile && isExpanded}
                    <TableCell>
                      {file.message || ""}
                    </TableCell>
                  {/if}

                  <TableCell class="whitespace-nowrap text-right">
                    <div
                      class="hidden justify-end space-x-2 transition-opacity group-hover:opacity-100 sm:flex"
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        on:click={() => handleProcess(file)}
                        class="h-8 w-8"
                        aria-label={`Process ${file.name}`}
                      >
                        <Play class="h-4 w-4" />
                        <span class="sr-only">Process</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        on:click={() => handleDownload(file)}
                        class="h-8 w-8"
                        aria-label={`Download ${file.name}`}
                      >
                        <Download class="h-4 w-4" />
                        <span class="sr-only">Download</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        on:click={() => openDeleteModal(file)}
                        class="h-8 w-8 text-red-600"
                        aria-label={`Delete ${file.name}`}
                      >
                        <Trash class="h-4 w-4" />
                        <span class="sr-only">Delete</span>
                      </Button>
                    </div>

                    <!-- Mobile actions dropdown -->
                    <div class="sm:hidden">
                      <div class="dropdown dropdown-end">
                        <label tabindex="0" class="btn btn-ghost btn-xs"
                          >Actions</label
                        >
                        <ul
                          tabindex="0"
                          class="menu dropdown-content z-[1] w-52 rounded-box bg-base-100 p-2 shadow"
                        >
                          <li>
                            <button on:click={() => handleProcess(file)}>
                              <Play class="h-4 w-4" /> Process
                            </button>
                          </li>
                          <li>
                            <button on:click={() => handleDownload(file)}>
                              <Download class="h-4 w-4" /> Download
                            </button>
                          </li>
                          <li>
                            <button
                              on:click={() => openDeleteModal(file)}
                              class="text-red-600"
                            >
                              <Trash class="h-4 w-4" /> Delete
                            </button>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>

                {#if isMobile && expandedRows.has(file.id)}
                  <!-- Expanded mobile row with additional details -->
                  <TableRow class="bg-base-200">
                    <TableCell colspan="4" class="px-4 py-3">
                      <div class="space-y-2">
                        <div class="flex justify-between text-sm">
                          <span class="font-semibold">Uploaded:</span>
                          <span>{formatDate(file.uploadedDate)}</span>
                        </div>
                        {#if file.message}
                          <div class="flex justify-between text-sm">
                            <span class="font-semibold">Message:</span>
                            <span class="text-right">{file.message}</span>
                          </div>
                        {/if}
                        <div class="flex justify-between text-sm">
                          <span class="font-semibold">Full Name:</span>
                          <span class="max-w-[220px] break-all text-right"
                            >{file.name}</span
                          >
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                {/if}
              {/each}
            </TableBody>
          </Table>
        </div>
      {/if}

      {#if errorMessage}
        <div class="alert alert-error mt-4">
          <p>{errorMessage}</p>
        </div>
      {/if}
    </CardContent>
  </Card>
</div>

<style>
  /* Improved hover effect for table rows */
  :global(.table tbody tr) {
    transition: background-color 0.2s;
  }

  :global(.table tbody tr:hover) {
    background-color: rgba(var(--primary-rgb), 0.05);
  }

  /* Hide action buttons on mobile until hovered/focused */
  @media (min-width: 640px) {
    .group .group-hover\:opacity-100 {
      opacity: 0.4;
    }
  }
</style>
