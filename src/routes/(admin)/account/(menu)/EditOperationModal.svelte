<script>
  import {
    operationStore,
    selectedOperationStore,
  } from "$lib/stores/operationStore"
  import { menuStore } from "../../../../stores/menuStore"
  import { toast } from "svelte-sonner"
  import { operationApi } from "$lib/api/operationApi"
  import { Trash2, X, Save, FileText } from "lucide-svelte"
  import { profileStore } from "$lib/stores/profileStore"
  import { onMount } from "svelte"

  let editOperationId = $selectedOperationStore?.id
  let editOperationName = $selectedOperationStore?.name
  let editOperationYear = $selectedOperationStore?.year
  let editOperationDescription = $selectedOperationStore?.description

  let currentYear = new Date().getFullYear()
  let yearOptions = Array.from({ length: 10 }, (_, i) => currentYear - 5 + i)
  let isLoading = false
  let showDeleteConfirmation = false
  let modalRef

  // Calculate if this is the only operation
  $: isOnlyOperation = $operationStore.length <= 1

  // Focus the first input when modal opens
  onMount(() => {
    const timer = setTimeout(() => {
      const nameInput = document.getElementById("edit-operation-name")
      if (nameInput) {
        nameInput.focus()
      }
    }, 100)

    return () => clearTimeout(timer)
  })

  function closeModal() {
    menuStore.update((m) => ({ ...m, showEditOperationModal: false }))
  }

  function handleClickOutside(event) {
    if (modalRef && !modalRef.contains(event.target)) {
      closeModal()
    }
  }

  function handleKeydown(event) {
    if (event.key === "Escape") {
      closeModal()
    }
  }

  async function updateOperation() {
    if (!editOperationName.trim()) {
      toast.error("Operation name is required")
      return
    }

    isLoading = true

    const updatedOperation = {
      id: editOperationId,
      name: editOperationName.trim(),
      year: Number(editOperationYear),
      description: editOperationDescription.trim(),
      master_map_id: $selectedOperationStore.master_map_id,
    }

    try {
      const result = await operationApi.updateOperation(editOperationId, {
        name: editOperationName.trim(),
        year: Number(editOperationYear),
        description: editOperationDescription.trim(),
      })

      if (result.success) {
        // Update the operation store with the updated operation
        operationStore.update((ops) =>
          ops.map((op) => (op.id === editOperationId ? updatedOperation : op)),
        )

        // If the updated operation is currently selected, update the selected operation store
        if ($selectedOperationStore.id === editOperationId) {
          selectedOperationStore.set(updatedOperation)
        }

        // Close the modal
        closeModal()

        toast.success("Operation updated successfully")
      } else {
        toast.error(`Failed to update operation: ${result.message}`)
      }
    } catch (error) {
      toast.error(`Error: ${error.message}`)
    } finally {
      isLoading = false
    }
  }

  async function deleteOperation() {
    isLoading = true

    try {
      const result = await operationApi.deleteOperation(editOperationId)

      if (result.success) {
        // Remove the operation from the store
        operationStore.update((ops) =>
          ops.filter((op) => op.id !== editOperationId),
        )

        // If this was the selected operation, select another one
        if ($selectedOperationStore.id === editOperationId) {
          const newSelectedOperation = $operationStore.find(
            (op) => op.id !== editOperationId,
          )

          if (newSelectedOperation) {
            selectedOperationStore.set(newSelectedOperation)

            // Update the selected operation in profile
            if ($profileStore) {
              await operationApi.updateSelectedOperation(
                $profileStore.id,
                newSelectedOperation.id,
              )

              // Update profile store
              profileStore.update((profile) => ({
                ...profile,
                selected_operation_id: newSelectedOperation.id,
              }))
            }
          }
        }

        // Close the modal
        closeModal()
        showDeleteConfirmation = false

        toast.success("Operation deleted successfully")
      } else {
        toast.error(`Failed to delete operation: ${result.message}`)
      }
    } catch (error) {
      toast.error(`Error: ${error.message}`)
    } finally {
      isLoading = false
    }
  }

  function handleDelete() {
    if (showDeleteConfirmation) {
      deleteOperation()
    } else {
      showDeleteConfirmation = true
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
  class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
  on:click={handleClickOutside}
>
  <div
    bind:this={modalRef}
    class="w-full max-w-md overflow-hidden rounded-xl border border-base-300 bg-base-100 shadow-2xl"
    on:click|stopPropagation
  >
    <!-- Header with accent line -->
    <div class="relative">
      <div class="h-1 w-full bg-base-content"></div>
      <div
        class="flex items-center justify-between border-b border-base-300 p-5"
      >
        <h2 class="text-xl font-bold text-contrast-content">Edit Operation</h2>
        <button
          on:click={closeModal}
          disabled={isLoading}
          class="rounded-full p-1.5 text-base-content/60 transition-colors hover:bg-base-200 hover:text-contrast-content"
          aria-label="Close"
        >
          <X class="h-4 w-4" />
        </button>
      </div>
    </div>

    <!-- Form content -->
    <form on:submit|preventDefault={updateOperation} class="space-y-5 p-6">
      <!-- Operation Name -->
      <div>
        <label
          for="edit-operation-name"
          class="mb-1.5 block text-sm text-contrast-content/60"
        >
          Operation Name
        </label>
        <div class="relative">
          <input
            type="text"
            id="edit-operation-name"
            bind:value={editOperationName}
            class="w-full rounded-lg border border-base-300 bg-base-200 p-3 text-contrast-content outline-none transition-colors focus:border-base-content"
            placeholder="Enter operation name"
            required
          />
        </div>
      </div>

      <!-- Year -->
      <div>
        <label
          for="edit-operation-year"
          class="mb-1.5 block text-sm text-contrast-content/60"
        >
          Year
        </label>
        <div class="relative">
          <select
            id="edit-operation-year"
            bind:value={editOperationYear}
            class="w-full rounded-lg border border-base-300 bg-base-200 p-3 text-contrast-content outline-none transition-colors focus:border-base-content"
            required
          >
            {#each yearOptions as year}
              <option value={year}>{year}</option>
            {/each}
          </select>
        </div>
      </div>

      <!-- Description -->
      <div>
        <label
          for="edit-operation-description"
          class="mb-1.5 block text-sm text-contrast-content/60"
        >
          Description
        </label>
        <div class="relative">
          <textarea
            id="edit-operation-description"
            bind:value={editOperationDescription}
            rows="4"
            class="w-full resize-none rounded-lg border border-base-300 bg-base-200 p-3 text-contrast-content outline-none transition-colors focus:border-base-content"
            placeholder="Describe this operation"
          ></textarea>
          <div class="absolute right-3 top-3 text-contrast-content/60">
            <FileText class="h-4 w-4" />
          </div>
        </div>
      </div>

      <!-- Action buttons -->
      <div class="mt-6 flex justify-between border-t border-base-300 pt-4">
        <button
          type="button"
          on:click={handleDelete}
          disabled={isOnlyOperation || isLoading}
          class="flex items-center gap-2 rounded-lg px-4 py-2.5 transition-all {showDeleteConfirmation
            ? 'bg-red-600 text-white hover:bg-red-700'
            : 'bg-base-200 text-contrast-content/60 hover:bg-base-300 hover:text-red-600'} {isLoading ||
          isOnlyOperation
            ? 'cursor-not-allowed opacity-50'
            : ''}"
        >
          <Trash2 class="h-4 w-4" />
          {showDeleteConfirmation ? "Confirm Delete" : "Delete"}
        </button>

        <button
          type="submit"
          disabled={isLoading}
          class="flex items-center gap-2 rounded-lg bg-base-content px-6 py-2.5 font-medium text-base-100 transition-colors hover:bg-base-content/90 {isLoading
            ? 'cursor-not-allowed opacity-50'
            : ''}"
        >
          <Save class="h-4 w-4" />
          {isLoading ? "Updating..." : "Update Operation"}
        </button>
      </div>
    </form>
  </div>
</div>

<style>
  /* Prevent dropdown from overflowing */
  select {
    position: relative;
    z-index: 10;
  }

  /* Ensure modal stays above dropdown */
  .fixed {
    z-index: 50;
  }
</style>
