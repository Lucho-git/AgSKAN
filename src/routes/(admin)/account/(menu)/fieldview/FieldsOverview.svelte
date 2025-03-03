<script lang="ts">
  import { goto } from "$app/navigation"

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
  } from "lucide-svelte"

  import { connectedMapStore } from "$lib/stores/connectedMapStore"
  import { fieldStore } from "../../../../../stores/fieldStore"
  import { session } from "$lib/stores/sessionStore" // Import session
  import { get } from "svelte/store"
  import FieldIcon from "$lib/components/FieldIcon.svelte"
  import { toast } from "svelte-sonner"

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

  function toggleExpand() {
    isExpanded = !isExpanded
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
    if (!currentEditingField || !newFieldName.trim() || !authToken) return

    try {
      const response = await fetch("/api/files/update_field", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          fieldId: currentEditingField.field_id,
          name: newFieldName.trim(),
          area: parseFloat(newFieldArea.toString()),
        }),
      })

      const result = await response.json()

      if (response.ok) {
        fieldStore.update((fields: any) =>
          fields.map((field: any) =>
            field.field_id === currentEditingField?.field_id
              ? {
                  ...field,
                  name: newFieldName.trim(),
                  area: parseFloat(newFieldArea.toString()),
                }
              : field,
          ),
        )
        toast.success("Field updated successfully")
        closeEditModal()
      } else {
        throw new Error(result.error || "Failed to update field")
      }
    } catch (error) {
      toast.error("Failed to update field. Please try again.")
    }
  }

  function handleLocateField(fieldId: string) {
    goto(`/account/mapviewer?field=${fieldId}`)
  }

  async function handleDeleteField() {
    if (!authToken || !fieldToDelete) return

    try {
      const response = await fetch("/api/files/delete_fields", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ fieldId: fieldToDelete.field_id }),
      })

      const result = await response.json()

      if (response.ok) {
        fieldStore.update((fields) =>
          fields.filter((field) => field.field_id !== fieldToDelete.field_id),
        )
        toast.success(`Field "${fieldToDelete.name}" deleted successfully`)
        closeDeleteModal()
      } else {
        throw new Error(result.error || "Failed to delete field")
      }
    } catch (error) {
      toast.error(
        `Failed to delete field "${fieldToDelete.name}". Please try again.`,
      )
    }
  }

  let fieldNameStyle = "min-width: 20vw; max-width: 30vw;"
  let areaCellStyle = "width: 15%; min-width: 80px;"
  let actionsCellStyle = "width: 20%; min-width: 20vw;"
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
    </div>
    <Button variant="ghost" size="sm" on:click={toggleExpand}>
      {#if isExpanded}
        <ChevronUp class="h-4 w-4" />
      {:else}
        <ChevronDown class="h-4 w-4" />
      {/if}
    </Button>
  </CardHeader>
  <CardContent class="p-0">
    {#if farmName}
      <p class="px-4 py-2 text-sm text-muted-foreground">{farmName}</p>
    {/if}
    {#if farmName && fields.length > 0}
      {#if isExpanded}
        <div class="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead style={fieldNameStyle}>Field</TableHead>
                <TableHead style={areaCellStyle}>Area (ha)</TableHead>
                <TableHead style={actionsCellStyle}>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {#each fields as field}
                <TableRow>
                  <TableCell style={fieldNameStyle}>
                    <div class="flex max-w-full items-center space-x-2">
                      <FieldIcon
                        geojson={createGeoJSON(field.boundary)}
                        size={36}
                      />
                      <span class="truncate text-xs font-bold"
                        >{field.name}</span
                      >
                    </div>
                  </TableCell>
                  <TableCell style={areaCellStyle}
                    >{field.area.toFixed(1)}</TableCell
                  >
                  <TableCell style={actionsCellStyle}>
                    <div class="flex space-x-1">
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
      {/if}
    {:else}
      <div class="py-10 text-center">
        <p class="text-muted-foreground">
          {farmName ? "No fields available" : "No map connected"}
        </p>
      </div>
    {/if}
  </CardContent>
</Card>
