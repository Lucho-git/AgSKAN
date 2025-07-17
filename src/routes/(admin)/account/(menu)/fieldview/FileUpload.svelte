<script lang="ts">
  import { createEventDispatcher } from "svelte"
  import { userFilesStore } from "./userFilesStore"
  import { session } from "$lib/stores/sessionStore"
  import { browser } from "$app/environment"
  import { onMount } from "svelte"
  import { toast } from "svelte-sonner"
  import { fileApi } from "$lib/api/fileApi"
  import {
    File,
    Calendar,
    CheckCircle,
    AlertCircle,
    Play,
    Trash2,
    MoreHorizontal,
    Eye,
    ChevronDown,
    ChevronUp,
    Upload,
  } from "lucide-svelte"

  // Accept the navigation function as a prop
  export let navigateToProcess: (fileId: string, fileName: string) => void

  $: userFiles = $userFilesStore
  let isExpanded = true

  // Modal state
  let deleteModalId = "delete-file-modal"
  let fileToDelete: {
    id: string
    name: string
  } | null = null

  function toggleExpand() {
    isExpanded = !isExpanded
  }

  function formatFileSize(bytes: number): string {
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  }

  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString()
  }

  function openDeleteModal(fileId: string, fileName: string) {
    fileToDelete = {
      id: fileId,
      name: fileName,
    }
    const modal = document.getElementById(deleteModalId) as HTMLDialogElement
    if (modal) modal.showModal()
  }

  function closeDeleteModal() {
    const modal = document.getElementById(deleteModalId) as HTMLDialogElement
    if (modal) modal.close()
    fileToDelete = null
  }

  async function handleDeleteFile() {
    if (!fileToDelete) return

    try {
      const result = await fileApi.deleteFile(fileToDelete.name)
      if (result.success) {
        userFilesStore.update((files) =>
          files.filter((f) => f.id !== fileToDelete.id),
        )
        toast.success(`File "${fileToDelete.name}" deleted successfully`)
        closeDeleteModal()
      } else {
        throw new Error(result.message || "Failed to delete file")
      }
    } catch (error) {
      toast.error(
        `Failed to delete file "${fileToDelete.name}". Please try again.`,
      )
    }
  }

  function handleProcessFile(fileId: string, fileName: string) {
    navigateToProcess(fileId, fileName)
  }
</script>

<!-- Delete File Modal -->
<dialog id={deleteModalId} class="modal modal-bottom sm:modal-middle">
  <div class="modal-box">
    <div class="flex items-center gap-3">
      <div
        class="flex h-10 w-10 items-center justify-center rounded-full bg-error/20"
      >
        <AlertCircle class="h-5 w-5 text-error" />
      </div>
      <div>
        <h3 class="text-lg font-bold text-contrast-content">Delete File</h3>
        <p class="text-sm text-contrast-content/60">
          This action cannot be undone
        </p>
      </div>
    </div>

    <div class="p-4">
      {#if fileToDelete}
        <p class="mb-4 text-contrast-content">
          Are you sure you want to delete the file "{fileToDelete.name}"?
        </p>
        <div class="rounded-lg border border-error/30 bg-error/10 p-3">
          <p class="text-sm text-error">
            <strong>Warning:</strong> This will permanently remove the file from
            storage. Any fields created from this file will remain but the original
            boundary data will be lost.
          </p>
        </div>
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
          on:click={handleDeleteFile}
        >
          Delete File
        </button>
      </form>
    </div>
  </div>
  <form method="dialog" class="modal-backdrop">
    <button>close</button>
  </form>
</dialog>

<!-- Files Overview Card -->
<div class="rounded-lg border border-base-300">
  <!-- Card Header with bubble icon styling -->
  <div class="flex items-center justify-between border-b border-base-300 p-6">
    <!-- Make only the left side clickable for expand/collapse -->
    <div
      class="flex flex-1 cursor-pointer items-center gap-3"
      on:click={toggleExpand}
      on:keydown={(e) => e.key === "Enter" && toggleExpand()}
      role="button"
      tabindex="0"
    >
      <!-- Keep base-content for main icon -->
      <div
        class="flex h-8 w-8 items-center justify-center rounded-full bg-base-content/10"
      >
        <Upload class="h-4 w-4 text-base-content" />
      </div>
      <div>
        <div class="flex items-center gap-2">
          <h3 class="text-lg font-bold text-contrast-content">
            File Upload Dashboard
          </h3>
          {#if userFiles.length > 0}
            <!-- Keep base-content for file count -->
            <span
              class="rounded-full border border-base-content/20 bg-base-content/10 px-2.5 py-1 text-xs font-medium text-base-content"
            >
              {userFiles.length}
            </span>
          {/if}
        </div>
        <p class="text-sm text-contrast-content/70">
          Monitor your uploaded boundary files and their processing status
        </p>
      </div>
    </div>

    <!-- Buttons area - separate from clickable header -->
    <div class="flex items-center gap-2">
      <button class="btn btn-ghost btn-sm" on:click={toggleExpand}>
        {#if isExpanded}
          <ChevronUp class="h-5 w-5 text-contrast-content" />
        {:else}
          <ChevronDown class="h-5 w-5 text-contrast-content" />
        {/if}
      </button>
    </div>
  </div>

  <!-- Card Content -->
  {#if userFiles.length > 0 && isExpanded}
    <!-- Desktop view - Table extends to edges -->
    <div class="hidden md:block">
      <table class="w-full">
        <thead>
          <!-- Use neutral colors for table header -->
          <tr class="border-b border-base-300 bg-base-200">
            <th
              class="px-6 py-4 text-left text-sm font-medium text-contrast-content/70"
              >File Name</th
            >
            <th
              class="px-6 py-4 text-left text-sm font-medium text-contrast-content/70"
              >Uploaded Date</th
            >
            <th
              class="px-6 py-4 text-left text-sm font-medium text-contrast-content/70"
              >Status</th
            >
            <th
              class="px-6 py-4 text-left text-sm font-medium text-contrast-content/70"
              >Message</th
            >
            <th
              class="px-6 py-4 text-right text-sm font-medium text-contrast-content/70"
              >Actions</th
            >
          </tr>
        </thead>
        <tbody>
          {#each userFiles as file (file.id)}
            <tr
              class="group border-b border-base-300/50 transition-colors hover:bg-base-200/50"
            >
              <td class="px-6 py-4">
                <div class="flex items-center space-x-3">
                  <!-- Use neutral colors for file icons -->
                  <div
                    class="flex h-10 w-10 items-center justify-center rounded-lg border border-base-300 bg-base-200"
                  >
                    <File class="h-5 w-5 text-contrast-content" />
                  </div>
                  <div>
                    <div class="font-medium text-contrast-content">
                      {file.name}
                    </div>
                    <div class="text-xs text-contrast-content/60">
                      {file.path
                        ? formatFileSize(file.path.length * 100)
                        : "Unknown size"}
                    </div>
                  </div>
                </div>
              </td>
              <td class="px-6 py-4">
                <div class="text-sm text-contrast-content/80">
                  {formatDate(file.uploadedDate)}
                </div>
              </td>
              <td class="px-6 py-4">
                {#if file.status === "Uploaded"}
                  <!-- Keep success color for processed status -->
                  <span
                    class="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-3 py-1 text-xs font-medium text-success"
                  >
                    <div class="h-1.5 w-1.5 rounded-full bg-success"></div>
                    Processed
                  </span>
                {:else}
                  <span
                    class="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-3 py-1 text-xs font-medium text-warning"
                  >
                    <div class="h-1.5 w-1.5 rounded-full bg-warning"></div>
                    {file.status}
                  </span>
                {/if}
              </td>
              <td class="px-6 py-4">
                <div class="text-sm text-contrast-content/70">
                  {file.message || "File uploaded successfully"}
                </div>
              </td>
              <td class="px-6 py-4">
                <div class="flex justify-end gap-2">
                  <!-- Use neutral colors for action buttons -->
                  <button
                    class="rounded-lg border border-base-300 bg-base-200 p-2 transition-colors hover:bg-base-300"
                    aria-label="Process file"
                    on:click={() => handleProcessFile(file.id, file.name)}
                  >
                    <Play class="h-4 w-4 text-contrast-content" />
                  </button>
                  <button
                    class="rounded-lg border border-base-300 bg-base-200 p-2 transition-colors hover:bg-error/20 hover:text-error"
                    aria-label="Delete file"
                    on:click={() => openDeleteModal(file.id, file.name)}
                  >
                    <Trash2 class="h-4 w-4 text-contrast-content" />
                  </button>
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <!-- Mobile view -->
    <div class="divide-y divide-base-300 md:hidden">
      {#each userFiles as file (file.id)}
        <div class="px-6 py-4">
          <div class="flex items-start justify-between gap-3">
            <div class="flex min-w-0 flex-1 items-start space-x-3">
              <!-- Use neutral colors for mobile file icons -->
              <div
                class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-base-300 bg-base-200"
              >
                <File class="h-5 w-5 text-contrast-content" />
              </div>
              <div class="min-w-0 flex-1">
                <div class="truncate font-medium text-contrast-content">
                  {file.name}
                </div>
                <div class="text-xs text-contrast-content/60">
                  {formatDate(file.uploadedDate)}
                </div>
                <div class="mt-1">
                  {#if file.status === "Uploaded"}
                    <span
                      class="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-xs font-medium text-success"
                    >
                      <div class="h-1 w-1 rounded-full bg-success"></div>
                      Processed
                    </span>
                  {:else}
                    <span
                      class="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning"
                    >
                      <div class="h-1 w-1 rounded-full bg-warning"></div>
                      {file.status}
                    </span>
                  {/if}
                </div>
              </div>
            </div>

            <div class="flex flex-shrink-0 items-center gap-2">
              <!-- Use neutral colors for mobile action buttons -->
              <button
                class="rounded-lg border border-base-300 bg-base-200 p-2 transition-colors hover:bg-base-300"
                on:click={() => handleProcessFile(file.id, file.name)}
                aria-label="Process file"
              >
                <Play class="h-4 w-4 text-contrast-content" />
              </button>

              <div class="dropdown dropdown-end">
                <label
                  tabindex="0"
                  class="btn btn-ghost btn-sm"
                  on:click|stopPropagation
                >
                  <MoreHorizontal class="h-4 w-4 text-contrast-content" />
                </label>
                <ul
                  tabindex="0"
                  class="menu dropdown-content z-[1] w-40 rounded-lg border border-base-300 bg-base-100 p-2 shadow-lg"
                >
                  <li>
                    <button
                      class="flex items-center gap-2 text-sm"
                      on:click={() => handleProcessFile(file.id, file.name)}
                    >
                      <Play class="h-4 w-4" /> Process
                    </button>
                  </li>
                  <li>
                    <button
                      class="flex items-center gap-2 text-sm text-error hover:bg-error/10"
                      on:click={() => openDeleteModal(file.id, file.name)}
                    >
                      <Trash2 class="h-4 w-4" /> Delete
                    </button>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {:else if userFiles.length > 0 && !isExpanded}
    <!-- Collapsed summary view -->
    <div class="p-6">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <!-- Keep base-content for collapsed file count -->
          <span
            class="rounded-full border border-base-content/20 bg-base-content/10 px-3 py-1 text-sm font-medium text-base-content"
          >
            {userFiles.length} files
          </span>
          <span class="text-sm text-contrast-content/70">
            uploaded and ready to process
          </span>
        </div>
        <!-- Use neutral colors for view all button -->
        <button
          class="rounded-lg border border-base-300 bg-base-200 px-3 py-1.5 text-xs font-medium text-contrast-content transition-colors hover:bg-base-300"
          on:click={toggleExpand}
        >
          <Eye class="mr-1 h-3 w-3" /> View all
        </button>
      </div>
    </div>
  {:else}
    <!-- No files state -->
    <div class="py-12 text-center">
      <!-- Use neutral colors for empty state -->
      <div
        class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-base-200"
      >
        <Upload class="h-6 w-6 text-contrast-content/60" />
      </div>
      <p class="mb-2 text-sm text-contrast-content/70">
        No files have been uploaded yet
      </p>
      <p class="text-xs text-contrast-content/60">
        Upload your first boundary file to get started
      </p>
    </div>
  {/if}

  <!-- Card Footer with statistics bubbles -->
  {#if userFiles.length > 0 && isExpanded}
    <div
      class="flex flex-col gap-4 border-t border-base-300 p-6 sm:flex-row sm:items-center sm:justify-between"
    >
      <div class="text-sm text-contrast-content/70">File Upload Statistics</div>
      <div class="flex flex-col gap-3 sm:flex-row">
        <div
          class="rounded-lg border border-base-300 bg-base-200 px-4 py-2 text-sm"
        >
          <span class="text-contrast-content/70">Total Files:</span>
          <span class="ml-2 font-semibold text-base-content"
            >{userFiles.length}</span
          >
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  /* Improved hover effects for table rows */
  :global(.table tbody tr) {
    transition: background-color 0.2s;
  }
</style>
