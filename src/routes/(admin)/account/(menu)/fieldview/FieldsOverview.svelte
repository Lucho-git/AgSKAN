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
  } from "lucide-svelte"

  import { connectedMapStore } from "$lib/stores/connectedMapStore"
  import { fieldStore } from "../../../../../stores/fieldStore"
  import { session } from "$lib/stores/sessionStore" // Import session
  import { get } from "svelte/store"
  import FieldIcon from "$lib/components/FieldIcon.svelte"
  import { toast } from "svelte-sonner"
  import { fileApi } from "$lib/api/fileApi"

  $: fields = $fieldStore
  $: connectedMap = $connectedMapStore
  $: farmName = connectedMap.is_connected ? connectedMap.map_name : null
  $: authToken = $session?.access_token

  let isExpanded = true
  let editModalId = "edit-field-modal"
  let deleteModalId = "delete-field-modal"
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

  function closeEditModal() {
    const modal = document.getElementById(editModalId) as HTMLDialogElement
    if (modal) modal.close()
  }

  function closeDeleteModal() {
    const modal = document.getElementById(deleteModalId) as HTMLDialogElement
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
</script>

<!-- Edit Field Modal -->
<dialog id={editModalId} class="modal modal-bottom sm:modal-middle">
  <div class="modal-box">
    <div class="flex items-center gap-2">
      <div class="rounded-lg bg-primary/10 p-2">
        <SquarePen class="h-5 w-5 text-primary" />
      </div>
      <div>
        <h3 class="text-lg font-bold">Edit Field</h3>
        <p class="text-sm text-muted-foreground">Change field information</p>
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
        <Button
          variant="outline"
          class="flex-1 sm:flex-none"
          on:click={closeEditModal}
        >
          Cancel
        </Button>
        <Button class="flex-1 sm:flex-none" on:click={handleEditField}>
          Save changes
        </Button>
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
    <div class="flex items-center gap-2">
      <div class="rounded-lg bg-destructive/10 p-2">
        <AlertTriangle class="h-5 w-5 text-destructive" />
      </div>
      <div>
        <h3 class="text-lg font-bold">Delete Field</h3>
        <p class="text-sm text-muted-foreground">
          This action cannot be undone
        </p>
      </div>
    </div>

    <div class="p-4">
      {#if fieldToDelete}
        <p>
          Are you sure you want to delete the field "{fieldToDelete.name}"?
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
          on:click={handleDeleteField}
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

<Card>
  <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
    <div class="flex items-center space-x-2">
      <LandPlot class="h-6 w-6" />
      <CardTitle class="text-2xl font-bold">Fields</CardTitle>
      {#if fields.length > 0}
        <span
          class="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
        >
          {fields.length}
        </span>
      {/if}
    </div>

    <Button variant="ghost" size="sm" on:click={toggleExpand}>
      {#if isExpanded}
        <ChevronUp class="h-4 w-4" />
      {:else}
        <ChevronDown class="h-4 w-4" />
      {/if}
    </Button>
  </CardHeader>

  {#if farmName}
    <div class="flex items-center justify-between px-4 py-2">
      <p class="text-sm text-muted-foreground">
        <span class="font-medium">Farm:</span>
        {farmName}
      </p>

      {#if fields.length > 0}
        <div class="flex items-center gap-1 text-xs text-muted-foreground">
          <button
            class="flex items-center gap-1 hover:text-primary"
            on:click={() => toggleSorting("name")}
          >
            Name
            {#if sortField === "name"}
              {#if sortDirection === "asc"}
                <ChevronUp class="h-3 w-3" />
              {:else}
                <ChevronDown class="h-3 w-3" />
              {/if}
            {/if}
          </button>
          <span class="mx-1">|</span>
          <button
            class="flex items-center gap-1 hover:text-primary"
            on:click={() => toggleSorting("area")}
          >
            Area
            {#if sortField === "area"}
              {#if sortDirection === "asc"}
                <ChevronUp class="h-3 w-3" />
              {:else}
                <ChevronDown class="h-3 w-3" />
              {/if}
            {/if}
          </button>
        </div>
      {/if}
    </div>
  {/if}

  <CardContent class="p-0">
    {#if farmName && fields.length > 0 && isExpanded}
      <!-- Table View (Desktop) -->
      {#if !isMobile}
        <div class="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead class="w-1/3 min-w-[200px]">Field</TableHead>
                <TableHead class="w-1/5">Area (ha)</TableHead>
                <TableHead class="w-1/4 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {#each sortedFields as field (field.field_id)}
                <TableRow class="group">
                  <TableCell>
                    <div class="flex items-center space-x-3">
                      <div class="relative">
                        <FieldIcon
                          geojson={createGeoJSON(field.boundary)}
                          size={40}
                        />
                      </div>
                      <div>
                        <div class="font-bold">{field.name}</div>
                        {#if field.createdAt}
                          <div class="text-xs opacity-70">
                            Added {new Date(
                              field.createdAt,
                            ).toLocaleDateString()}
                          </div>
                        {/if}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div class="text-md font-semibold">
                      {field.area.toFixed(1)}
                    </div>
                  </TableCell>
                  <TableCell class="text-right">
                    <div
                      class="flex justify-end space-x-1 opacity-70 group-hover:opacity-100"
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        class="h-8 w-8"
                        aria-label="Edit field"
                        on:click={() => openEditModal(field)}
                      >
                        <SquarePen class="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        class="h-8 w-8"
                        aria-label="Go to field"
                        on:click={() => handleLocateField(field.field_id)}
                      >
                        <MapPinned class="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        class="h-8 w-8"
                        aria-label="Delete field"
                        on:click={() => openDeleteModal(field)}
                      >
                        <Trash2 class="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              {/each}
            </TableBody>
          </Table>
        </div>

        <!-- List View (Mobile) -->
      {:else}
        <div class="divide-y">
          {#each sortedFields as field (field.field_id)}
            <div class="px-4 py-3">
              <div class="flex items-center justify-between">
                <div class="flex items-center space-x-3">
                  <FieldIcon
                    geojson={createGeoJSON(field.boundary)}
                    size={36}
                  />
                  <div>
                    <div class="font-medium">{field.name}</div>
                    <div class="text-xs text-gray-500">
                      {field.area.toFixed(1)} ha
                    </div>
                  </div>
                </div>

                <div class="flex items-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    on:click={() => handleLocateField(field.field_id)}
                    class="h-8 w-8 p-0"
                    aria-label="View field"
                  >
                    <Eye class="h-4 w-4" />
                  </Button>

                  <div class="dropdown dropdown-end">
                    <label
                      tabindex="0"
                      class="btn btn-ghost btn-sm m-1 h-8 w-8 p-0"
                    >
                      <MoreHorizontal class="h-4 w-4" />
                    </label>
                    <ul
                      tabindex="0"
                      class="menu dropdown-content z-[1] w-40 rounded-box bg-base-100 p-2 shadow"
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
                          class="text-red-600"
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
                    <span class="text-muted-foreground">Area:</span>
                    <span>{field.area.toFixed(1)} ha</span>
                  </div>
                  {#if field.createdAt}
                    <div class="flex justify-between">
                      <span class="text-muted-foreground">Created:</span>
                      <span
                        >{new Date(field.createdAt).toLocaleDateString()}</span
                      >
                    </div>
                  {/if}
                  <div class="flex justify-between pt-2">
                    <Button
                      variant="outline"
                      size="xs"
                      on:click={() => openEditModal(field)}
                      class="h-7 px-2 text-xs"
                    >
                      <SquarePen class="mr-1 h-3 w-3" /> Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="xs"
                      on:click={() => handleLocateField(field.field_id)}
                      class="h-7 px-2 text-xs"
                    >
                      <MapPinned class="mr-1 h-3 w-3" /> View on map
                    </Button>
                  </div>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    {:else if farmName && fields.length > 0 && !isExpanded}
      <!-- Collapsed summary view -->
      <div class="p-4">
        <div class="flex items-center justify-between">
          <div>
            <span class="text-sm font-medium">{fields.length} fields</span>
            <span class="ml-2 text-sm text-muted-foreground">
              ({fields.reduce((sum, field) => sum + field.area, 0).toFixed(1)} ha
              total)
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            on:click={toggleExpand}
            class="text-xs"
          >
            <Eye class="mr-1 h-3 w-3" /> View all
          </Button>
        </div>
      </div>
    {:else}
      <div class="py-10 text-center">
        <p class="text-muted-foreground">
          {farmName ? "No fields available" : "No map connected"}
        </p>
      </div>
    {/if}
  </CardContent>

  {#if farmName && fields.length > 0}
    <CardFooter
      class="flex justify-between px-4 pb-4 pt-2 text-xs text-muted-foreground"
    >
      <div>
        Total area: <span class="font-semibold"
          >{fields.reduce((sum, field) => sum + field.area, 0).toFixed(1)} ha</span
        >
      </div>
      <div>
        Avg field size: <span class="font-semibold"
          >{(
            fields.reduce((sum, field) => sum + field.area, 0) / fields.length
          ).toFixed(1)} ha</span
        >
      </div>
    </CardFooter>
  {/if}
</Card>

<style>
  /* Improved hover effects for table rows */
  :global(.table tbody tr) {
    transition: background-color 0.2s;
  }

  :global(.table tbody tr:hover) {
    background-color: rgba(var(--primary-rgb), 0.05);
  }

  /* Custom styles for different view modes */
  @media (max-width: 640px) {
    .group .opacity-70 {
      opacity: 1;
    }
  }
</style>
