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

  async function handleDeleteFile(fileId: string, fileName: string) {
    try {
      const result = await fileApi.deleteFile(fileId)
      if (result.success) {
        userFilesStore.update((files) => files.filter((f) => f.id !== fileId))
        toast.success(`File "${fileName}" deleted successfully`)
      } else {
        throw new Error(result.message || "Failed to delete file")
      }
    } catch (error) {
      toast.error(`Failed to delete file "${fileName}". Please try again.`)
    }
  }

  function handleProcessFile(fileId: string, fileName: string) {
    navigateToProcess(fileId, fileName)
  }
</script>

<!-- Files Overview Card - Updated styling to match other components -->
<div class="p-6">
  <!-- Card Header -->
  <div class="flex flex-row items-center justify-between space-y-0 pb-4">
    <div class="flex items-center space-x-2">
      <Upload class="h-6 w-6 text-base-content" />
      <h3 class="text-2xl font-bold text-base-content">Uploaded Files</h3>
      {#if userFiles.length > 0}
        <span
          class="ml-2 rounded-full bg-base-content/10 px-2 py-0.5 text-xs font-medium text-base-content"
        >
          {userFiles.length}
        </span>
      {/if}
    </div>

    <button class="btn btn-ghost btn-sm" on:click={toggleExpand}>
      {#if isExpanded}
        <ChevronUp class="h-4 w-4" />
      {:else}
        <ChevronDown class="h-4 w-4" />
      {/if}
    </button>
  </div>

  <!-- Card Content -->
  <div class="p-0">
    {#if userFiles.length > 0 && isExpanded}
      <!-- Desktop view -->
      <div class="hidden md:block">
        <div class="overflow-x-auto">
          <table class="table w-full">
            <thead>
              <tr>
                <th class="w-1/3 min-w-[200px]">File</th>
                <th class="w-1/5">Uploaded</th>
                <th class="w-1/5">Status</th>
                <th class="w-1/4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {#each userFiles as file (file.id)}
                <tr class="group transition-colors hover:bg-base-content/5">
                  <td>
                    <div class="flex items-center space-x-3">
                      <div
                        class="flex h-10 w-10 items-center justify-center rounded-lg bg-base-content/10"
                      >
                        <File class="h-5 w-5 text-contrast-content" />
                      </div>
                      <div>
                        <div class="font-bold text-contrast-content">
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
                  <td>
                    <div class="text-sm text-contrast-content">
                      {formatDate(file.uploadedDate)}
                    </div>
                  </td>
                  <td>
                    <div class="flex items-center gap-1">
                      {#if file.status === "Uploaded"}
                        <CheckCircle class="h-4 w-4 text-success" />
                        <span class="text-sm text-success">Ready</span>
                      {:else}
                        <AlertCircle class="h-4 w-4 text-warning" />
                        <span class="text-sm text-warning">{file.status}</span>
                      {/if}
                    </div>
                  </td>
                  <td class="text-right">
                    <div
                      class="flex justify-end space-x-1 opacity-70 transition-opacity group-hover:opacity-100"
                    >
                      <button
                        class="btn btn-ghost btn-sm h-8 w-8 p-0"
                        aria-label="Process file"
                        on:click={() => handleProcessFile(file.id, file.name)}
                      >
                        <Play class="h-4 w-4" />
                      </button>
                      <button
                        class="btn btn-ghost btn-sm h-8 w-8 p-0"
                        aria-label="Delete file"
                        on:click={() => handleDeleteFile(file.id, file.name)}
                      >
                        <Trash2 class="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Mobile view -->
      <div class="divide-y divide-base-300 md:hidden">
        {#each userFiles as file (file.id)}
          <div class="px-0 py-3">
            <div class="flex items-center justify-between">
              <div class="flex items-center space-x-3">
                <div
                  class="flex h-10 w-10 items-center justify-center rounded-lg bg-base-content/10"
                >
                  <File class="h-5 w-5 text-contrast-content" />
                </div>
                <div>
                  <div class="font-medium text-contrast-content">
                    {file.name}
                  </div>
                  <div class="text-xs text-contrast-content/60">
                    {formatDate(file.uploadedDate)}
                  </div>
                  <div class="mt-1 flex items-center gap-1">
                    {#if file.status === "Uploaded"}
                      <CheckCircle class="h-3 w-3 text-success" />
                      <span class="text-xs text-success">Ready</span>
                    {:else}
                      <AlertCircle class="h-3 w-3 text-warning" />
                      <span class="text-xs text-warning">{file.status}</span>
                    {/if}
                  </div>
                </div>
              </div>

              <div class="flex items-center">
                <button
                  class="btn btn-ghost btn-sm h-8 w-8 p-0"
                  on:click={() => handleProcessFile(file.id, file.name)}
                  aria-label="Process file"
                >
                  <Play class="h-4 w-4" />
                </button>

                <div class="dropdown dropdown-end">
                  <label
                    tabindex="0"
                    class="btn btn-ghost btn-sm m-1 h-8 w-8 p-0"
                  >
                    <MoreHorizontal class="h-4 w-4" />
                  </label>
                  <ul
                    tabindex="0"
                    class="menu dropdown-content z-[1] w-40 rounded-box border border-base-300 bg-base-100 p-2 shadow"
                  >
                    <li>
                      <button
                        on:click={() => handleProcessFile(file.id, file.name)}
                      >
                        <Play class="h-4 w-4" /> Process
                      </button>
                    </li>
                    <li>
                      <button
                        on:click={() => handleDeleteFile(file.id, file.name)}
                        class="text-red-600"
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
      <div class="p-4">
        <div class="flex items-center justify-between">
          <div>
            <span class="text-sm font-medium text-base-content"
              >{userFiles.length} files</span
            >
            <span class="ml-2 text-sm text-contrast-content/60">
              uploaded and ready to process
            </span>
          </div>
          <button
            class="btn btn-outline btn-sm text-xs"
            on:click={toggleExpand}
          >
            <Eye class="mr-1 h-3 w-3" /> View all
          </button>
        </div>
      </div>
    {:else}
      <!-- No files state -->
      <div class="py-10 text-center">
        <Upload class="mx-auto mb-4 h-12 w-12 text-contrast-content/40" />
        <p class="mb-2 text-contrast-content/60">No files uploaded yet</p>
        <p class="text-xs text-contrast-content/40">
          Upload boundary files to get started with field processing
        </p>
      </div>
    {/if}
  </div>

  <!-- Card Footer -->
  {#if userFiles.length > 0}
    <div
      class="flex justify-between border-t border-base-300 px-0 pb-0 pt-4 text-xs text-contrast-content/60"
    >
      <div>
        Total files: <span class="font-semibold text-base-content"
          >{userFiles.length}</span
        >
      </div>
      <div>
        Ready to process: <span class="font-semibold text-base-content"
          >{userFiles.filter((f) => f.status === "Uploaded").length}</span
        >
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
