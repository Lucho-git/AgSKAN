<script lang="ts">
  import { goto } from "$app/navigation"
  import { onMount } from "svelte"

  import {
    Table,
    TableBody,
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
    CardFooter,
  } from "$lib/components/ui/card"
  import { Input } from "$lib/components/ui/input"
  import { Label } from "$lib/components/ui/label"

  import {
    MapPinned,
    Trash2,
    ChevronDown,
    ChevronUp,
    LandPlot,
    SquarePen,
    AlertTriangle,
    MoreHorizontal,
    Info,
    Eye,
    Upload,
    Settings,
    ArrowUp,
  } from "lucide-svelte"

  import { connectedMapStore } from "$lib/stores/connectedMapStore"
  import { fieldStore } from "$lib/stores/fieldStore"
  import { session } from "$lib/stores/sessionStore"
  import { userFilesStore } from "./userFilesStore"
  import { get } from "svelte/store"
  import FieldIcon from "$lib/components/FieldIcon.svelte"
  import { toast } from "svelte-sonner"
  import { fileApi } from "$lib/api/fileApi"

  // Accept the navigation function as a prop
  export let navigateToProcess: (fileId: string, fileName: string) => void

  $: fields = $fieldStore
  $: connectedMap = $connectedMapStore
  $: farmName = connectedMap.is_connected ? connectedMap.map_name : null
  $: authToken = $session?.access_token
  $: userFiles = $userFilesStore

  let isExpanded = true
  let editModalId = "edit-field-modal"
  let deleteModalId = "delete-field-modal"
  let deleteAllModalId = "delete-all-fields-modal"
  let currentEditingField: {
    field_id: string
    name: string
    area: number
  } | null = null
  let fieldToDelete: {
    field_id: string
    name: string
  } | null = null
  let newFieldName = ""
  let newFieldArea = 0
  let deletingAllFields = false

  // New state variables for responsive design
  let isMobile = false
  let displayMode = "table" // "table" or "list"
  let expandedDetails = new Set()
  let sortField = "name"
  let sortDirection = "asc"

  // Sort fields based on current sort settings
  $: sortedFields = [...fields].sort((a, b) => {
    let comparison = 0

    if (sortField === "name") {
      comparison = a.name.localeCompare(b.name)
    } else if (sortField === "area") {
      comparison = a.area - b.area
    }

    return sortDirection === "desc" ? -comparison : comparison
  })

  onMount(() => {
    checkScreenSize()
    window.addEventListener("resize", checkScreenSize)

    return () => {
      window.removeEventListener("resize", checkScreenSize)
    }
  })

  function checkScreenSize() {
    isMobile = window.innerWidth < 768
    displayMode = isMobile ? "list" : "table"
  }

  function toggleExpand() {
    isExpanded = !isExpanded
  }

  function toggleSorting(field) {
    if (sortField === field) {
      sortDirection = sortDirection === "asc" ? "desc" : "asc"
    } else {
      sortField = field
      sortDirection = "asc"
    }
  }

  function toggleDetails(fieldId) {
    if (expandedDetails.has(fieldId)) {
      expandedDetails.delete(fieldId)
    } else {
      expandedDetails.add(fieldId)
    }
    expandedDetails = expandedDetails // Trigger reactivity
  }

  function createGeoJSON(boundary) {
    return {
      type: "Feature",
      geometry: boundary,
      properties: {},
    }
  }

  function openEditModal(field: any) {
    currentEditingField = field
    newFieldName = field.name
    newFieldArea = field.area
    const modal = document.getElementById(editModalId) as HTMLDialogElement
    if (modal) modal.showModal()
  }

  function openDeleteModal(field: any) {
    fieldToDelete = {
      field_id: field.field_id,
      name: field.name,
    }
    const modal = document.getElementById(deleteModalId) as HTMLDialogElement
    if (modal) modal.showModal()
  }

  function openDeleteAllModal() {
    const modal = document.getElementById(deleteAllModalId) as HTMLDialogElement
    if (modal) modal.showModal()
  }

  function closeEditModal() {
    const modal = document.getElementById(editModalId) as HTMLDialogElement
    if (modal) modal.close()
  }

  function closeDeleteModal() {
    const modal = document.getElementById(deleteModalId) as HTMLDialogElement
    if (modal) modal.close()
  }

  function closeDeleteAllModal() {
    const modal = document.getElementById(deleteAllModalId) as HTMLDialogElement
    if (modal) modal.close()
  }

  async function handleEditField() {
    if (!currentEditingField || !newFieldName.trim()) return

    try {
      const area = parseFloat(newFieldArea.toString())
      const result = await fileApi.updateField(
        currentEditingField.field_id,
        newFieldName.trim(),
        area,
      )

      if (result.success) {
        fieldStore.update((fields) =>
          fields.map((field) =>
            field.field_id === currentEditingField?.field_id
              ? {
                  ...field,
                  name: newFieldName.trim(),
                  area: area,
                }
              : field,
          ),
        )
        toast.success("Field updated successfully")
        closeEditModal()
      } else {
        throw new Error(result.message || "Failed to update field")
      }
    } catch (error) {
      toast.error("Failed to update field. Please try again.")
    }
  }

  function handleLocateField(fieldId: string) {
    goto(`/account/mapviewer?field=${fieldId}`)
  }

  async function handleDeleteField() {
    if (!fieldToDelete) return

    try {
      const result = await fileApi.deleteField(fieldToDelete.field_id)

      if (result.success) {
        fieldStore.update((fields) =>
          fields.filter((field) => field.field_id !== fieldToDelete.field_id),
        )
        toast.success(`Field "${fieldToDelete.name}" deleted successfully`)
        closeDeleteModal()
      } else {
        throw new Error(result.message || "Failed to delete field")
      }
    } catch (error) {
      toast.error(
        `Failed to delete field "${fieldToDelete.name}". Please try again.`,
      )
    }
  }

  async function handleDeleteAllFields() {
    if (fields.length === 0) return

    deletingAllFields = true
    let successCount = 0
    let errorCount = 0

    try {
      // Delete all fields in parallel
      const deletePromises = fields.map(async (field) => {
        try {
          const result = await fileApi.deleteField(field.field_id)
          if (result.success) {
            successCount++
          } else {
            errorCount++
          }
        } catch (error) {
          errorCount++
        }
      })

      await Promise.all(deletePromises)

      // Update the store to remove all fields
      fieldStore.set([])

      if (errorCount === 0) {
        toast.success(`All ${successCount} fields deleted successfully`)
      } else if (successCount > 0) {
        toast.success(`${successCount} fields deleted, ${errorCount} failed`)
      } else {
        toast.error("Failed to delete fields. Please try again.")
      }

      closeDeleteAllModal()
    } catch (error) {
      toast.error("An error occurred while deleting fields. Please try again.")
    } finally {
      deletingAllFields = false
    }
  }
</script>

<!-- Edit Field Modal -->
<dialog id={editModalId} class="modal modal-bottom sm:modal-middle">
  <div class="modal-box">
    <div class="flex items-center gap-3">
      <div
        class="flex h-10 w-10 items-center justify-center rounded-full bg-base-200"
      >
        <SquarePen class="h-5 w-5 text-contrast-content" />
      </div>
      <div>
        <h3 class="text-lg font-bold text-contrast-content">Edit Field</h3>
        <p class="text-sm text-contrast-content/60">Change field information</p>
      </div>
    </div>

    <div class="space-y-4 p-4">
      <div class="grid gap-2">
        <Label for="name">Field Name</Label>
        <Input
          id="name"
          bind:value={newFieldName}
          placeholder="Enter field name"
          class="w-full"
        />
      </div>

      <div class="grid gap-2">
        <Label for="area">Area (ha)</Label>
        <Input
          id="area"
          type="number"
          step="0.1"
          bind:value={newFieldArea}
          placeholder="Enter area in hectares"
          class="w-full"
        />
      </div>
    </div>

    <div class="modal-action">
      <form method="dialog" class="flex w-full gap-2 sm:w-auto">
        <button
          class="btn btn-outline flex-1 sm:flex-none"
          on:click={closeEditModal}
        >
          Cancel
        </button>
        <button
          class="btn flex-1 bg-base-content text-base-100 hover:bg-base-content/90 sm:flex-none"
          on:click={handleEditField}
        >
          Save changes
        </button>
      </form>
    </div>
  </div>
  <form method="dialog" class="modal-backdrop">
    <button>close</button>
  </form>
</dialog>

<!-- Delete Field Modal -->
<dialog id={deleteModalId} class="modal modal-bottom sm:modal-middle">
  <div class="modal-box">
    <div class="flex items-center gap-3">
      <div
        class="flex h-10 w-10 items-center justify-center rounded-full bg-error/20"
      >
        <AlertTriangle class="h-5 w-5 text-error" />
      </div>
      <div>
        <h3 class="text-lg font-bold text-contrast-content">Delete Field</h3>
        <p class="text-sm text-contrast-content/60">
          This action cannot be undone
        </p>
      </div>
    </div>

    <div class="p-4">
      {#if fieldToDelete}
        <p class="text-contrast-content">
          Are you sure you want to delete the field "{fieldToDelete.name}"?
        </p>
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
          on:click={handleDeleteField}
        >
          Delete
        </button>
      </form>
    </div>
  </div>
  <form method="dialog" class="modal-backdrop">
    <button>close</button>
  </form>
</dialog>

<!-- Delete All Fields Modal -->
<dialog id={deleteAllModalId} class="modal modal-bottom sm:modal-middle">
  <div class="modal-box">
    <div class="flex items-center gap-3">
      <div
        class="flex h-10 w-10 items-center justify-center rounded-full bg-error/20"
      >
        <AlertTriangle class="h-5 w-5 text-error" />
      </div>
      <div>
        <h3 class="text-lg font-bold text-contrast-content">
          Delete All Fields
        </h3>
        <p class="text-sm text-contrast-content/60">
          This action cannot be undone
        </p>
      </div>
    </div>

    <div class="p-4">
      <p class="mb-4 text-contrast-content">
        Are you sure you want to delete all {fields.length} fields? This will permanently
        remove all field data from your account. However your trail data and operational
        data will remain intact.
      </p>
      <div class="rounded-lg border border-error/30 bg-error/10 p-3">
        <p class="text-sm text-error">
          <strong>Warning:</strong> This action will delete all fields and cannot
          be undone.
        </p>
      </div>
    </div>

    <div class="modal-action">
      <form method="dialog" class="flex w-full gap-2 sm:w-auto">
        <button
          class="btn btn-outline flex-1 sm:flex-none"
          on:click={closeDeleteAllModal}
          disabled={deletingAllFields}
        >
          Cancel
        </button>
        <button
          class="btn flex-1 bg-error text-white hover:bg-error/80 sm:flex-none"
          on:click={handleDeleteAllFields}
          disabled={deletingAllFields}
        >
          {#if deletingAllFields}
            <span class="loading loading-spinner loading-sm"></span>
            Deleting...
          {:else}
            Delete All Fields
          {/if}
        </button>
      </form>
    </div>
  </div>
  <form method="dialog" class="modal-backdrop">
    <button>close</button>
  </form>
</dialog>

<!-- Fields Overview Card -->
<div>
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
        <LandPlot class="h-4 w-4 text-base-content" />
      </div>
      <div>
        <div class="flex items-center gap-2">
          <h3 class="text-lg font-bold text-contrast-content">Fields</h3>
          {#if fields.length > 0}
            <!-- Keep base-content for field count -->
            <span
              class="rounded-full border border-base-content/20 bg-base-content/10 px-2.5 py-1 text-xs font-medium text-base-content"
            >
              {fields.length}
            </span>
          {/if}
        </div>
        <p class="text-sm text-contrast-content/70">
          Manage your farm fields and view detailed information
        </p>
      </div>
    </div>

    <!-- Buttons area - separate from clickable header -->
    <div class="flex items-center gap-2">
      {#if fields.length > 0}
        <div class="dropdown dropdown-end">
          <label
            tabindex="0"
            class="btn btn-ghost btn-sm"
            on:click|stopPropagation
          >
            <Settings class="h-4 w-4 text-contrast-content" />
          </label>
          <ul
            tabindex="0"
            class="menu dropdown-content z-[1] w-48 rounded-lg border border-base-300 bg-base-100 p-2 shadow-lg"
          >
            <li>
              <button
                on:click={openDeleteAllModal}
                class="text-error hover:bg-error/10"
              >
                <Trash2 class="h-4 w-4" /> Delete All Fields
              </button>
            </li>
          </ul>
        </div>
      {/if}

      <button class="btn btn-ghost btn-sm" on:click={toggleExpand}>
        {#if isExpanded}
          <ChevronUp class="h-5 w-5 text-contrast-content" />
        {:else}
          <ChevronDown class="h-5 w-5 text-contrast-content" />
        {/if}
      </button>
    </div>
  </div>

  {#if farmName}
    <div
      class="flex items-center justify-between border-b border-base-300 bg-base-200 px-6 py-4"
    >
      <p class="text-sm text-contrast-content/70">
        <span class="font-medium">Farm:</span>
        {farmName}
      </p>

      {#if fields.length > 0}
        <div class="flex items-center gap-4">
          <button
            class="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-contrast-content transition-colors hover:bg-base-300"
            on:click={() => toggleSorting("name")}
          >
            Name
            {#if sortField === "name"}
              {#if sortDirection === "asc"}
                <ArrowUp class="h-3 w-3" />
              {:else}
                <ChevronDown class="h-3 w-3" />
              {/if}
            {/if}
          </button>
          <div class="h-4 w-px bg-base-300"></div>
          <button
            class="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-contrast-content transition-colors hover:bg-base-300"
            on:click={() => toggleSorting("area")}
          >
            Area
            {#if sortField === "area"}
              {#if sortDirection === "asc"}
                <ArrowUp class="h-3 w-3" />
              {:else}
                <ChevronDown class="h-3 w-3" />
              {/if}
            {/if}
          </button>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Card Content -->
  {#if farmName && fields.length > 0 && isExpanded}
    <!-- Table View (Desktop) -->
    {#if !isMobile}
      <table class="w-full">
        <thead>
          <tr class="border-b border-base-300 bg-base-200">
            <th
              class="px-6 py-4 text-left text-sm font-medium text-contrast-content/70"
              >Field</th
            >
            <th
              class="px-6 py-4 text-center text-sm font-medium text-contrast-content/70"
              >Area (ha)</th
            >
            <th
              class="px-6 py-4 text-right text-sm font-medium text-contrast-content/70"
              >Actions</th
            >
          </tr>
        </thead>
        <tbody>
          {#each sortedFields as field (field.field_id)}
            <tr
              class="group border-b border-base-300/50 transition-colors hover:bg-base-200/50"
            >
              <td class="px-6 py-4">
                <div class="flex items-center space-x-3">
                  <div class="relative">
                    <FieldIcon
                      geojson={createGeoJSON(field.boundary)}
                      size={40}
                    />
                  </div>
                  <div>
                    <div class="font-medium text-contrast-content">
                      {field.name}
                    </div>
                    {#if field.createdAt}
                      <div class="text-xs text-contrast-content/60">
                        Added {new Date(field.createdAt).toLocaleDateString()}
                      </div>
                    {/if}
                  </div>
                </div>
              </td>
              <td class="px-6 py-4 text-center">
                <span class="text-lg font-semibold text-base-content"
                  >{field.area.toFixed(1)}</span
                >
                <span class="ml-1 text-xs text-contrast-content/60">ha</span>
              </td>
              <td class="px-6 py-4">
                <div class="flex justify-end gap-2">
                  <button
                    class="rounded-lg border border-base-300 bg-base-200 p-2 transition-colors hover:bg-base-300"
                    aria-label="Edit field"
                    on:click={() => openEditModal(field)}
                  >
                    <SquarePen class="h-4 w-4 text-contrast-content" />
                  </button>
                  <button
                    class="rounded-lg border border-base-300 bg-base-200 p-2 transition-colors hover:bg-base-300"
                    aria-label="Go to field"
                    on:click={() => handleLocateField(field.field_id)}
                  >
                    <MapPinned class="h-4 w-4 text-contrast-content" />
                  </button>
                  <button
                    class="rounded-lg border border-base-300 bg-base-200 p-2 transition-colors hover:bg-error/20 hover:text-error"
                    aria-label="Delete field"
                    on:click={() => openDeleteModal(field)}
                  >
                    <Trash2 class="h-4 w-4 text-contrast-content" />
                  </button>
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>

      <!-- List View (Mobile) -->
    {:else}
      <div class="divide-y divide-base-300">
        {#each sortedFields as field (field.field_id)}
          <div class="px-6 py-4">
            <div class="flex items-center justify-between">
              <div class="flex items-center space-x-3">
                <FieldIcon geojson={createGeoJSON(field.boundary)} size={36} />
                <div>
                  <div class="font-medium text-contrast-content">
                    {field.name}
                  </div>
                  <div class="text-xs text-contrast-content/60">
                    {field.area.toFixed(1)} ha
                  </div>
                </div>
              </div>

              <div class="flex items-center gap-2">
                <button
                  class="rounded-lg border border-base-300 bg-base-200 p-2 transition-colors hover:bg-base-300"
                  on:click={() => handleLocateField(field.field_id)}
                  aria-label="View field"
                >
                  <Eye class="h-4 w-4 text-contrast-content" />
                </button>

                <div class="dropdown dropdown-end">
                  <label tabindex="0" class="btn btn-ghost btn-sm">
                    <MoreHorizontal class="h-4 w-4 text-contrast-content" />
                  </label>
                  <ul
                    tabindex="0"
                    class="menu dropdown-content z-[1] w-40 rounded-lg border border-base-300 bg-base-100 p-2 shadow-lg"
                  >
                    <li>
                      <button on:click={() => toggleDetails(field.field_id)}>
                        <Info class="h-4 w-4" /> Details
                      </button>
                    </li>
                    <li>
                      <button on:click={() => openEditModal(field)}>
                        <SquarePen class="h-4 w-4" /> Edit
                      </button>
                    </li>
                    <li>
                      <button
                        on:click={() => handleLocateField(field.field_id)}
                      >
                        <MapPinned class="h-4 w-4" /> View on map
                      </button>
                    </li>
                    <li>
                      <button
                        on:click={() => openDeleteModal(field)}
                        class="text-error hover:bg-error/10"
                      >
                        <Trash2 class="h-4 w-4" /> Delete
                      </button>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            <!-- Expandable details section -->
            {#if expandedDetails.has(field.field_id)}
              <div
                class="ml-12 mt-3 space-y-2 border-l-2 border-base-300 pl-4 text-sm"
              >
                <div class="flex justify-between">
                  <span class="text-contrast-content/60">Area:</span>
                  <span class="text-contrast-content"
                    >{field.area.toFixed(1)} ha</span
                  >
                </div>
                {#if field.createdAt}
                  <div class="flex justify-between">
                    <span class="text-contrast-content/60">Created:</span>
                    <span class="text-contrast-content"
                      >{new Date(field.createdAt).toLocaleDateString()}</span
                    >
                  </div>
                {/if}
                <div class="flex justify-between pt-2">
                  <button
                    class="btn btn-outline btn-xs h-7 px-2 text-xs"
                    on:click={() => openEditModal(field)}
                  >
                    <SquarePen class="mr-1 h-3 w-3" /> Edit
                  </button>
                  <button
                    class="btn btn-outline btn-xs h-7 px-2 text-xs"
                    on:click={() => handleLocateField(field.field_id)}
                  >
                    <MapPinned class="mr-1 h-3 w-3" /> View on map
                  </button>
                </div>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  {:else if farmName && fields.length > 0 && !isExpanded}
    <!-- Collapsed summary view -->
    <div class="p-6">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <span
            class="rounded-full border border-base-content/20 bg-base-content/10 px-3 py-1 text-sm font-medium text-base-content"
          >
            {fields.length} fields
          </span>
          <span class="text-sm text-contrast-content/70">
            ({fields.reduce((sum, field) => sum + field.area, 0).toFixed(1)} ha total)
          </span>
        </div>
        <button
          class="rounded-lg border border-base-300 bg-base-200 px-3 py-1.5 text-xs font-medium text-contrast-content transition-colors hover:bg-base-300"
          on:click={toggleExpand}
        >
          <Eye class="mr-1 h-3 w-3" /> View all
        </button>
      </div>
    </div>
  {:else if !farmName}
    <!-- No map connected state -->
    <div class="py-12 text-center">
      <div
        class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-base-200"
      >
        <LandPlot class="h-6 w-6 text-contrast-content/60" />
      </div>
      <p class="mb-4 text-sm text-contrast-content/70">No fields available</p>
      <p class="text-xs text-contrast-content/60">
        Upload boundary files to create and manage your fields
      </p>
    </div>
  {:else}
    <!-- No fields available -->
    <div class="py-12 text-center">
      <div
        class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-base-200"
      >
        <LandPlot class="h-6 w-6 text-contrast-content/60" />
      </div>
      <p class="mb-4 text-sm text-contrast-content/70">No fields available</p>
      <p class="text-xs text-contrast-content/60">
        Upload boundary files to create and manage your fields
      </p>
    </div>
  {/if}

  <!-- Card Footer with statistics bubbles -->
  {#if farmName && fields.length > 0 && isExpanded}
    <div
      class="flex flex-col gap-4 border-t border-base-300 p-6 sm:flex-row sm:items-center sm:justify-between"
    >
      <div class="text-sm text-contrast-content/70">Field Statistics</div>
      <div class="flex flex-col gap-3 sm:flex-row">
        <div
          class="rounded-lg border border-base-300 bg-base-200 px-4 py-2 text-sm"
        >
          <span class="text-contrast-content/70">Total Area:</span>
          <span class="ml-2 font-semibold text-base-content"
            >{fields.reduce((sum, field) => sum + field.area, 0).toFixed(1)} ha</span
          >
        </div>
        <div
          class="rounded-lg border border-base-300 bg-base-200 px-4 py-2 text-sm"
        >
          <span class="text-contrast-content/70">Average Field Area:</span>
          <span class="ml-2 font-semibold text-base-content"
            >{(
              fields.reduce((sum, field) => sum + field.area, 0) / fields.length
            ).toFixed(1)} ha</span
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

  /* Custom styles for different view modes */
  @media (max-width: 640px) {
    .group .opacity-70 {
      opacity: 1;
    }
  }
</style>
