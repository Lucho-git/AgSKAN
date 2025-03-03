<!-- src/routes/admin/fieldview/FileUploadDashboard.svelte -->
<script lang="ts">
  import { onMount, afterUpdate } from "svelte" // Added afterUpdate
  import { goto } from "$app/navigation"
  import { userFilesStore } from "../../../../../stores/userFilesStore" // Adjust path if necessary
  import { menuStore } from "../../../../../stores/menuStore"
  import { session } from "$lib/stores/sessionStore" // Import session store

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

  // State for delete modal
  let deleteModalId = "delete-file-modal"
  let fileToDelete: FileUpload | null = null

  onMount(() => {
    const mediaQuery = window.matchMedia("(max-width: 768px)")
    isMobile = mediaQuery.matches
    isExpanded = !isMobile

    mediaQuery.addEventListener("change", (e) => {
      isMobile = e.matches
      isExpanded = !isMobile
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
    isExpanded = !isExpanded
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
      // Include Authorization header with the token
      const headers = new Headers()
      if ($session?.access_token) {
        headers.append("Authorization", `Bearer ${$session.access_token}`)
      }

      const response = await fetch(
        `/api/files/download?fileName=${encodeURIComponent(file.name)}`,
        { headers },
      )

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || "Failed to download file")
      }

      const blob = await response.blob()
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
      // Include Authorization header with the token
      const headers = new Headers({
        "Content-Type": "application/json",
      })
      if ($session?.access_token) {
        headers.append("Authorization", `Bearer ${$session.access_token}`)
      }

      const response = await fetch("/api/files/delete", {
        method: "POST",
        headers,
        body: JSON.stringify({ fileName: fileToDelete.name }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(
          result.error || `HTTP error! status: ${response.status}`,
        )
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

<div class="width-auto py-6" class:expanded-mobile={isMobile && isExpanded}>
  <Card>
    <CardHeader class="px-2 sm:px-4">
      <div class="flex items-center justify-between">
        <CardTitle class="flex items-center text-2xl font-bold">
          <FileUp class="mr-2 h-6 w-6" />
          File Upload Dashboard
        </CardTitle>
        <Button variant="outline" size="sm" on:click={toggleView}>
          {#if isExpanded}
            <Minimize class="h-4 w-4" />
          {:else}
            <Maximize2 class="h-4 w-4" />
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
      {:else}
        <div class="overflow-x-auto">
          <Table>
            <TableCaption>A list of your uploaded files</TableCaption>

            <TableHeader>
              <TableRow>
                <TableHead class="whitespace-nowrap">File Name</TableHead>
                {#if isExpanded}
                  <TableHead class="whitespace-nowrap">Uploaded Date</TableHead>
                {/if}
                <TableHead class="whitespace-nowrap">Status</TableHead>
                {#if isExpanded}
                  <TableHead class="whitespace-nowrap">Message</TableHead>
                {/if}
                <TableHead class="whitespace-nowrap text-right"
                  >Actions</TableHead
                >
              </TableRow>
            </TableHeader>

            <TableBody>
              {#each files as file (file.id)}
                <TableRow>
                  <TableCell
                    class="whitespace-nowrap font-medium"
                    style="max-width: 35vw"
                  >
                    {truncateFileName(file.name, isExpanded ? 30 : 20)}
                  </TableCell>
                  {#if isExpanded}
                    <TableCell class="whitespace-nowrap">
                      {formatDate(file.uploadedDate)}
                    </TableCell>
                  {/if}
                  <TableCell class="whitespace-nowrap" style="max-width: 10vw">
                    <span
                      class={`rounded-full px-2 py-1 text-xs font-semibold ${
                        file.status === "Processed"
                          ? "bg-green-100 text-green-800"
                          : file.status === "Pending"
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-red-100 text-red-800"
                      }`}
                    >
                      {file.status}
                    </span>
                  </TableCell>
                  {#if isExpanded}
                    <TableCell>
                      {#if file.status === "Processed"}
                        {file.message}
                      {:else}
                        {file.message || ""}
                      {/if}
                    </TableCell>
                  {/if}
                  <TableCell class="whitespace-nowrap text-right">
                    <div class="flex justify-end space-x-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        on:click={() => handleProcess(file)}
                        class="h-8 w-8"
                        aria-label={`Process ${file.name}`}
                      >
                        <Play class="h-4 w-4" />
                        <span class="sr-only">Process {file.name}</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        on:click={() => handleDownload(file)}
                        class="h-8 w-8"
                        aria-label={`Download ${file.name}`}
                      >
                        <Download class="h-4 w-4" />
                        <span class="sr-only">Download {file.name}</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        on:click={() => openDeleteModal(file)}
                        class="h-8 w-8 text-red-600"
                        aria-label={`Delete ${file.name}`}
                      >
                        <Trash class="h-4 w-4" />
                        <span class="sr-only">Delete {file.name}</span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              {/each}
            </TableBody>
          </Table>
        </div>
      {/if}

      {#if errorMessage}
        <p class="text-red-500">{errorMessage}</p>
      {/if}
    </CardContent>
  </Card>
</div>

<style>
  .expanded-mobile {
    max-width: 77vw;
  }
</style>
