<script>
  import {
    operationStore,
    selectedOperationStore,
  } from "$lib/stores/operationStore"
  import { profileStore } from "$lib/stores/profileStore"
  import { toast } from "svelte-sonner"
  import { operationApi } from "$lib/api/operationApi"
  import {
    MapPin,
    Plus,
    ChevronDown,
    ChevronUp,
    Pencil,
    Trash2,
    AlertTriangle,
    Check,
  } from "lucide-svelte"

  // State
  let isLoading = false
  let loadingAction = null
  let showCreateOperation = false
  let showEditOperation = false
  let showDeleteOperationConfirm = false
  let expandedOperationId = null
  let editingOperationId = null
  let deletingOperationId = null
  let newOperationName = ""
  let newOperationYear = new Date().getFullYear()
  let newOperationDescription = ""
  let editOperationName = ""
  let editOperationYear = new Date().getFullYear()
  let editOperationDescription = ""

  // Reactive values
  $: currentYear = new Date().getFullYear()
  $: yearOptions = Array.from({ length: 10 }, (_, i) => currentYear - 5 + i)
  $: isOnlyOperation = $operationStore.length <= 1

  // Helper function to close all operation submenus
  function closeAllOperationMenus() {
    showCreateOperation = false
    showEditOperation = false
    showDeleteOperationConfirm = false
    expandedOperationId = null
    editingOperationId = null
    deletingOperationId = null
  }

  async function handleCreateOperation() {
    if (!newOperationName.trim()) {
      toast.error("Operation name is required")
      return
    }

    const master_map_id = $operationStore[0]?.master_map_id
    if (!master_map_id) {
      toast.error("No map is currently selected")
      return
    }

    isLoading = true
    loadingAction = "create-operation"

    try {
      const result = await operationApi.addOperation(
        master_map_id,
        newOperationName.trim(),
        Number(newOperationYear),
        newOperationDescription.trim(),
      )

      if (result.success && result.operation) {
        operationStore.update((ops) => [...ops, result.operation])
        selectedOperationStore.set(result.operation)

        if ($profileStore) {
          profileStore.update((profile) => ({
            ...profile,
            selected_operation_id: result.operation.id,
          }))

          await operationApi.updateSelectedOperation(
            $profileStore.id,
            result.operation.id,
          )
        }

        newOperationName = ""
        newOperationYear = new Date().getFullYear()
        newOperationDescription = ""
        showCreateOperation = false

        toast.success("Operation created")
      } else {
        toast.error(`Failed to create operation: ${result.message}`)
      }
    } catch (error) {
      toast.error(`Error: ${error.message}`)
    } finally {
      isLoading = false
      loadingAction = null
    }
  }

  async function handleOperationSelect(operationId) {
    const selectedOperation = $operationStore.find(
      (op) => op.id === operationId,
    )

    if (selectedOperation && $profileStore?.id) {
      isLoading = true
      loadingAction = `select-${operationId}`

      try {
        const result = await operationApi.updateSelectedOperation(
          $profileStore.id,
          operationId,
        )

        if (!result.success) {
          toast.error(`Failed to update selected operation: ${result.message}`)
          return
        }

        selectedOperationStore.set(selectedOperation)
        profileStore.update((profile) => ({
          ...profile,
          selected_operation_id: operationId,
        }))

        // Close the menu after successful selection
        closeAllOperationMenus()

        toast.success("Operation switched")
      } catch (error) {
        toast.error("Failed to update selected operation")
      } finally {
        isLoading = false
        loadingAction = null
      }
    }
  }

  async function handleUpdateOperation() {
    if (!editOperationName.trim()) {
      toast.error("Operation name is required")
      return
    }

    isLoading = true
    loadingAction = "update-operation"

    const updatedOperation = {
      id: editingOperationId,
      name: editOperationName.trim(),
      year: Number(editOperationYear),
      description: editOperationDescription.trim(),
      master_map_id: $operationStore.find((op) => op.id === editingOperationId)
        ?.master_map_id,
    }

    try {
      const result = await operationApi.updateOperation(editingOperationId, {
        name: editOperationName.trim(),
        year: Number(editOperationYear),
        description: editOperationDescription.trim(),
      })

      if (result.success) {
        operationStore.update((ops) =>
          ops.map((op) =>
            op.id === editingOperationId ? updatedOperation : op,
          ),
        )

        if ($selectedOperationStore?.id === editingOperationId) {
          selectedOperationStore.set(updatedOperation)
        }

        closeAllOperationMenus()
        toast.success("Operation updated")
      } else {
        toast.error(`Failed to update operation: ${result.message}`)
      }
    } catch (error) {
      toast.error(`Error: ${error.message}`)
    } finally {
      isLoading = false
      loadingAction = null
    }
  }

  async function handleDeleteOperation(operationId) {
    if (isOnlyOperation) {
      toast.error("Cannot delete the only operation")
      return
    }

    isLoading = true
    loadingAction = "delete-operation"

    try {
      const result = await operationApi.deleteOperation(operationId)

      if (result.success) {
        operationStore.update((ops) =>
          ops.filter((op) => op.id !== operationId),
        )

        const newSelectedOperation = $operationStore.find(
          (op) => op.id !== operationId,
        )

        if (newSelectedOperation) {
          selectedOperationStore.set(newSelectedOperation)

          if ($profileStore) {
            await operationApi.updateSelectedOperation(
              $profileStore.id,
              newSelectedOperation.id,
            )

            profileStore.update((profile) => ({
              ...profile,
              selected_operation_id: newSelectedOperation.id,
            }))
          }
        }

        closeAllOperationMenus()
        toast.success("Operation deleted")
      } else {
        toast.error(`Failed to delete operation: ${result.message}`)
      }
    } catch (error) {
      toast.error(`Error: ${error.message}`)
    } finally {
      isLoading = false
      loadingAction = null
    }
  }
</script>

<div class="space-y-4 sm:space-y-6">
  {#if $operationStore && $operationStore.length > 0}
    <!-- Operations List -->
    <div class="space-y-1">
      <div class="mb-3 flex items-center justify-between">
        <h3 class="text-sm font-semibold text-contrast-content sm:text-base">
          Operations
        </h3>
        <button
          class="flex items-center gap-2 rounded-lg bg-base-content px-2.5 py-1.5 text-xs font-medium text-base-100 transition-colors hover:bg-base-content/90 sm:px-3 sm:text-sm"
          on:click={() => {
            closeAllOperationMenus()
            showCreateOperation = true
          }}
        >
          <Plus class="h-3 w-3" />
          Create
        </button>
      </div>

      <!-- Create Operation Form - Appears at top after header -->
      {#if showCreateOperation}
        <div
          class="animate-slideDown bg-base-50 mb-3 rounded-lg border border-base-300 p-3 sm:mb-4 sm:p-4"
        >
          <h4
            class="mb-3 text-sm font-semibold text-contrast-content sm:mb-4 sm:text-base"
          >
            Create Operation
          </h4>
          <div class="space-y-3">
            <div>
              <label
                class="mb-1 block text-xs text-contrast-content/60 sm:text-sm"
                >Name</label
              >
              <input
                type="text"
                bind:value={newOperationName}
                placeholder="Operation name"
                class="w-full rounded-lg border border-base-300 bg-base-100 p-2 text-xs text-contrast-content outline-none transition-colors focus:border-base-content sm:p-2.5 sm:text-sm"
              />
            </div>
            <div>
              <label
                class="mb-1 block text-xs text-contrast-content/60 sm:text-sm"
                >Year</label
              >
              <select
                bind:value={newOperationYear}
                class="w-full rounded-lg border border-base-300 bg-base-100 p-2 text-xs text-contrast-content outline-none transition-colors focus:border-base-content sm:p-2.5 sm:text-sm"
              >
                {#each yearOptions as year}
                  <option value={year}>{year}</option>
                {/each}
              </select>
            </div>
            <div>
              <label
                class="mb-1 block text-xs text-contrast-content/60 sm:text-sm"
                >Description</label
              >
              <textarea
                bind:value={newOperationDescription}
                placeholder="Optional description"
                rows="2"
                class="w-full resize-none rounded-lg border border-base-300 bg-base-100 p-2 text-xs text-contrast-content outline-none transition-colors focus:border-base-content sm:p-2.5 sm:text-sm"
              ></textarea>
            </div>
            <div class="flex gap-2">
              <button
                class="flex-1 rounded-lg border border-base-300 bg-base-100 py-2 text-xs font-medium text-contrast-content transition-colors hover:bg-base-300 sm:text-sm"
                on:click={() => {
                  closeAllOperationMenus()
                  newOperationName = ""
                  newOperationDescription = ""
                }}
              >
                Cancel
              </button>
              <button
                class="flex-1 rounded-lg bg-base-content py-2 text-xs font-medium text-base-100 transition-colors hover:bg-base-content/90 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
                on:click={handleCreateOperation}
                disabled={isLoading || !newOperationName.trim()}
              >
                {isLoading ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      {/if}

      {#each $operationStore as operation, index}
        <div
          class="relative rounded-lg transition-colors {operation.id ===
          $selectedOperationStore?.id
            ? 'border border-primary/30 bg-primary/10'
            : 'bg-base-200'}"
        >
          <!-- Operation Row - One Line -->
          <button
            class="flex w-full items-center gap-3 p-2.5 text-left transition-colors hover:bg-base-300 sm:p-3"
            on:click={() => {
              if (showEditOperation && editingOperationId === operation.id) {
                closeAllOperationMenus()
              } else if (
                showDeleteOperationConfirm &&
                deletingOperationId === operation.id
              ) {
                closeAllOperationMenus()
              } else if (expandedOperationId === operation.id) {
                closeAllOperationMenus()
              } else {
                closeAllOperationMenus()
                expandedOperationId = operation.id
                // Remove automatic selection - just expand the dropdown
              }
            }}
          >
            {#if operation.id === $selectedOperationStore?.id}
              <div
                class="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-primary/20 sm:h-5 sm:w-5"
              >
                <div
                  class="h-1.5 w-1.5 rounded-full bg-primary sm:h-2 sm:w-2"
                ></div>
              </div>
            {/if}
            <div class="min-w-0 flex-1">
              <span
                class="truncate text-xs font-medium sm:text-sm {operation.id ===
                $selectedOperationStore?.id
                  ? 'text-primary'
                  : 'text-contrast-content'}"
              >
                {operation.name}
              </span>
              <span
                class="ml-1 text-xs {operation.id ===
                $selectedOperationStore?.id
                  ? 'text-primary/70'
                  : 'text-contrast-content/60'}"
              >
                ({operation.year})
              </span>
            </div>

            <!-- Fixed width container for chevron -->
            <div class="flex w-5 justify-end sm:w-6">
              {#if expandedOperationId === operation.id}
                <ChevronUp
                  class="h-3 w-3 text-contrast-content/60 sm:h-4 sm:w-4"
                />
              {:else}
                <ChevronDown
                  class="h-3 w-3 text-contrast-content/60 sm:h-4 sm:w-4"
                />
              {/if}
            </div>
          </button>

          <!-- Expanded Operation Details -->
          {#if expandedOperationId === operation.id}
            <div
              class="animate-slideDown border-t border-base-300 p-2.5 sm:p-3"
            >
              <div class="space-y-3" on:click|stopPropagation>
                <!-- Description -->
                {#if operation.description}
                  <div>
                    <p class="text-xs text-contrast-content/60 sm:text-sm">
                      {operation.description}
                    </p>
                  </div>
                {:else}
                  <div>
                    <p
                      class="text-xs italic text-contrast-content/40 sm:text-sm"
                    >
                      No description
                    </p>
                  </div>
                {/if}

                <!-- Action Buttons -->
                <div class="flex flex-wrap gap-2">
                  <!-- Select Operation Button (only show if not selected) -->
                  {#if operation.id !== $selectedOperationStore?.id}
                    <button
                      class="flex items-center gap-1.5 rounded-lg bg-base-content px-2 py-1.5 text-xs font-medium text-base-100 transition-colors hover:bg-base-content/90 disabled:cursor-not-allowed disabled:opacity-50 sm:gap-2 sm:px-2.5"
                      on:click|stopPropagation={() =>
                        handleOperationSelect(operation.id)}
                      disabled={isLoading &&
                        loadingAction === `select-${operation.id}`}
                    >
                      <Check class="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                      {isLoading && loadingAction === `select-${operation.id}`
                        ? "..."
                        : "Select"}
                    </button>
                  {/if}

                  <button
                    class="flex items-center gap-1.5 rounded-lg bg-base-100 px-2 py-1.5 text-xs font-medium text-contrast-content transition-colors hover:bg-base-300 sm:gap-2 sm:px-2.5"
                    on:click|stopPropagation={() => {
                      closeAllOperationMenus()
                      editingOperationId = operation.id
                      editOperationName = operation.name
                      editOperationYear = operation.year
                      editOperationDescription = operation.description || ""
                      showEditOperation = true
                    }}
                  >
                    <Pencil class="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                    Edit
                  </button>

                  {#if !isOnlyOperation}
                    <button
                      class="flex items-center gap-1.5 rounded-lg bg-red-500/10 px-2 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-500/20 sm:gap-2 sm:px-2.5"
                      on:click|stopPropagation={() => {
                        closeAllOperationMenus()
                        deletingOperationId = operation.id
                        showDeleteOperationConfirm = true
                      }}
                    >
                      <Trash2 class="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                      Delete
                    </button>
                  {/if}
                </div>
              </div>
            </div>
          {/if}

          <!-- Inline Edit Form -->
          {#if showEditOperation && editingOperationId === operation.id}
            <div
              class="animate-slideDown border-t border-base-300 p-2.5 sm:p-3"
            >
              <div class="space-y-3" on:click|stopPropagation>
                <h4
                  class="text-sm font-semibold text-contrast-content sm:text-base"
                >
                  Edit Operation
                </h4>
                <div>
                  <label
                    class="mb-1 block text-xs text-contrast-content/60 sm:text-sm"
                    >Name</label
                  >
                  <input
                    type="text"
                    bind:value={editOperationName}
                    class="w-full rounded-lg border border-base-300 bg-base-100 p-2 text-xs text-contrast-content outline-none transition-colors focus:border-base-content sm:p-2.5 sm:text-sm"
                  />
                </div>
                <div>
                  <label
                    class="mb-1 block text-xs text-contrast-content/60 sm:text-sm"
                    >Year</label
                  >
                  <select
                    bind:value={editOperationYear}
                    class="w-full rounded-lg border border-base-300 bg-base-100 p-2 text-xs text-contrast-content outline-none transition-colors focus:border-base-content sm:p-2.5 sm:text-sm"
                  >
                    {#each yearOptions as year}
                      <option value={year}>{year}</option>
                    {/each}
                  </select>
                </div>
                <div>
                  <label
                    class="mb-1 block text-xs text-contrast-content/60 sm:text-sm"
                    >Description</label
                  >
                  <textarea
                    bind:value={editOperationDescription}
                    rows="2"
                    class="w-full resize-none rounded-lg border border-base-300 bg-base-100 p-2 text-xs text-contrast-content outline-none transition-colors focus:border-base-content sm:p-2.5 sm:text-sm"
                  ></textarea>
                </div>
                <div class="flex gap-2">
                  <button
                    class="flex-1 rounded-lg border border-base-300 bg-base-100 py-2 text-xs font-medium text-contrast-content transition-colors hover:bg-base-300 sm:text-sm"
                    on:click={() => closeAllOperationMenus()}
                  >
                    Cancel
                  </button>
                  <button
                    class="flex-1 rounded-lg bg-base-content py-2 text-xs font-medium text-base-100 transition-colors hover:bg-base-content/90 sm:text-sm"
                    on:click={handleUpdateOperation}
                    disabled={isLoading}
                  >
                    {isLoading ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            </div>
          {/if}

          <!-- Inline Delete Confirmation -->
          {#if showDeleteOperationConfirm && deletingOperationId === operation.id}
            <div class="animate-slideDown border-t border-red-300 p-2.5 sm:p-3">
              <div
                class="rounded-lg bg-red-50 p-2.5 sm:p-3"
                on:click|stopPropagation
              >
                <div class="mb-2 flex items-center gap-2 sm:mb-3">
                  <AlertTriangle class="h-3 w-3 text-red-500 sm:h-4 sm:w-4" />
                  <h4 class="text-xs font-semibold text-red-700 sm:text-sm">
                    Delete Operation
                  </h4>
                </div>
                <p class="mb-2 text-xs text-red-600 sm:mb-3 sm:text-sm">
                  Are you sure you want to delete "{operation.name}"? This
                  action cannot be undone.
                </p>
                <div class="flex gap-2">
                  <button
                    class="flex-1 rounded bg-gray-200 py-1.5 text-xs font-medium transition-colors hover:bg-gray-300 sm:text-sm"
                    on:click={() => closeAllOperationMenus()}
                  >
                    Cancel
                  </button>
                  <button
                    class="flex-1 rounded bg-red-500 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
                    on:click={() => handleDeleteOperation(operation.id)}
                    disabled={isLoading}
                  >
                    {isLoading && loadingAction === "delete-operation"
                      ? "Deleting..."
                      : "Delete"}
                  </button>
                </div>
              </div>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {:else}
    <!-- No Operations -->
    <div class="text-center">
      <div
        class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-purple-500/10 sm:mb-4 sm:h-16 sm:w-16"
      >
        <MapPin class="h-6 w-6 text-purple-500 sm:h-8 sm:w-8" />
      </div>
      <h3 class="mb-2 text-base font-semibold text-contrast-content sm:text-lg">
        No Operations
      </h3>
      <p class="mb-3 text-xs text-contrast-content/60 sm:mb-4 sm:text-sm">
        Create your first operation to get started
      </p>
      <button
        class="mx-auto flex items-center gap-2 rounded-lg bg-base-content px-3 py-2 text-sm font-medium text-base-100 transition-colors hover:bg-base-content/90 sm:px-4"
        on:click={() => (showCreateOperation = true)}
      >
        <Plus class="h-3 w-3 sm:h-4 sm:w-4" />
        Create Operation
      </button>
    </div>
  {/if}
</div>

<style>
  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .animate-slideDown {
    animation: slideDown 0.2s ease-out;
  }
</style>
