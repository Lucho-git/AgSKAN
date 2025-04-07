<script>
  import {
    operationStore,
    selectedOperationStore,
  } from "$lib/stores/operationStore"
  import { menuStore } from "../../../../stores/menuStore"
  import { toast } from "svelte-sonner"
  import { operationApi } from "$lib/api/operationApi"
  import { Trash2, X } from "lucide-svelte"
  import { profileStore } from "$lib/stores/profileStore"

  let editOperationId = $selectedOperationStore?.id
  let editOperationName = $selectedOperationStore?.name
  let editOperationYear = $selectedOperationStore?.year
  let editOperationDescription = $selectedOperationStore?.description

  let currentYear = new Date().getFullYear()
  let yearOptions = Array.from({ length: 21 }, (_, i) => currentYear - 10 + i)
  let isLoading = false
  let showDeleteConfirmation = false

  // Calculate if this is the only operation
  $: isOnlyOperation = $operationStore.length <= 1

  function closeModal() {
    menuStore.update((m) => ({ ...m, showEditOperationModal: false }))
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
</script>

<div class="modal modal-open">
  <div class="modal-box relative bg-base-200">
    <!-- Close button in the top right corner -->
    <button
      class="btn btn-circle btn-sm absolute right-2 top-2"
      on:click={closeModal}
      disabled={isLoading}
    >
      <X class="h-4 w-4" />
    </button>

    {#if showDeleteConfirmation}
      <div class="flex flex-col gap-4 pt-4">
        <h3 class="text-lg font-bold text-error">Delete Operation</h3>

        <div class="alert alert-warning">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-6 w-6 shrink-0 stroke-current"
            fill="none"
            viewBox="0 0 24 24"
            ><path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            /></svg
          >
          <div>
            <h3 class="font-bold">Warning!</h3>
            <p class="text-sm">
              Deleting this operation will permanently remove it and all
              associated trails. This action cannot be undone.
            </p>
          </div>
        </div>

        <div class="modal-action">
          <button
            class="btn btn-error"
            on:click={deleteOperation}
            disabled={isLoading}
          >
            {#if isLoading}
              <span class="loading loading-spinner loading-sm mr-2"></span>
            {/if}
            Delete Operation
          </button>
          <button
            class="btn"
            on:click={() => (showDeleteConfirmation = false)}
            disabled={isLoading}
          >
            Cancel
          </button>
        </div>
      </div>
    {:else}
      <h3 class="mb-4 pr-8 text-lg font-bold">Edit Operation</h3>

      <div class="form-control mb-4">
        <label for="edit-operation-name" class="label">
          <span class="label-text">Operation Name</span>
        </label>
        <input
          id="edit-operation-name"
          type="text"
          placeholder="Enter name"
          class="input input-bordered w-full bg-base-100"
          bind:value={editOperationName}
        />
      </div>

      <div class="form-control mb-4">
        <label for="edit-operation-year" class="label">
          <span class="label-text">Year</span>
        </label>
        <select
          id="edit-operation-year"
          class="select select-bordered w-full bg-base-100"
          bind:value={editOperationYear}
        >
          {#each yearOptions as year}
            <option value={year}>{year}</option>
          {/each}
        </select>
      </div>

      <div class="form-control mb-4">
        <label for="edit-operation-description" class="label">
          <span class="label-text">Description</span>
        </label>
        <textarea
          id="edit-operation-description"
          class="textarea textarea-bordered w-full bg-base-100"
          placeholder="Enter description"
          bind:value={editOperationDescription}
        ></textarea>
      </div>

      <div class="modal-action">
        <button
          class="btn btn-error mr-auto"
          disabled={isOnlyOperation || isLoading}
          on:click={() => (showDeleteConfirmation = true)}
        >
          <Trash2 class="mr-1 h-5 w-5" />
          Delete
        </button>
        <button
          class="btn btn-primary"
          on:click={updateOperation}
          disabled={isLoading}
        >
          {#if isLoading}
            <span class="loading loading-spinner loading-sm mr-2"></span>
          {/if}
          Update Operation
        </button>
      </div>
    {/if}
  </div>
</div>
