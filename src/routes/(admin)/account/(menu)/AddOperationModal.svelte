<script>
  import {
    operationStore,
    selectedOperationStore,
  } from "$lib/stores/operationStore"
  import { menuStore } from "../../../../stores/menuStore"
  import { toast } from "svelte-sonner"
  import { operationApi } from "$lib/api/operationApi"
  import { profileStore } from "$lib/stores/profileStore"

  let newOperationName = ""
  let newOperationYear = new Date().getFullYear()
  let newOperationDescription = ""
  let isLoading = false

  let currentYear = new Date().getFullYear()
  let yearOptions = Array.from({ length: 21 }, (_, i) => currentYear - 10 + i)

  async function addOperation() {
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

    try {
      const result = await operationApi.addOperation(
        master_map_id,
        newOperationName.trim(),
        Number(newOperationYear),
        newOperationDescription.trim(),
      )

      if (result.success && result.operation) {
        // Add the new operation to the operations store
        operationStore.update((ops) => [...ops, result.operation])

        // Set the new operation as the selected operation
        selectedOperationStore.set(result.operation)

        // Update the profile store to reflect the selected operation
        if ($profileStore) {
          profileStore.update((profile) => ({
            ...profile,
            selected_operation_id: result.operation.id,
          }))

          // Also update the selected operation in the database
          await operationApi.updateSelectedOperation(
            $profileStore.id,
            result.operation.id,
          )
        }

        // Reset form values
        newOperationName = ""
        newOperationYear = new Date().getFullYear()
        newOperationDescription = ""

        // Close the modal
        menuStore.update((m) => ({ ...m, showAddOperationModal: false }))

        toast.success("Operation added successfully")
      } else {
        toast.error(`Failed to add operation: ${result.message}`)
      }
    } catch (error) {
      toast.error(`Error: ${error.message}`)
    } finally {
      isLoading = false
    }
  }
</script>

<div class="modal modal-open">
  <div class="modal-box bg-base-200">
    <h3 class="mb-4 text-lg font-bold">Add New Operation</h3>

    <div class="form-control mb-4">
      <label for="new-operation-name" class="label">
        <span class="label-text">Operation Name</span>
      </label>
      <input
        id="new-operation-name"
        type="text"
        placeholder="Enter name"
        class="input input-bordered w-full bg-base-100"
        bind:value={newOperationName}
      />
    </div>

    <div class="form-control mb-4">
      <label for="new-operation-year" class="label">
        <span class="label-text">Year</span>
      </label>
      <select
        id="new-operation-year"
        class="select select-bordered w-full bg-base-100"
        bind:value={newOperationYear}
      >
        {#each yearOptions as year}
          <option value={year}>{year}</option>
        {/each}
      </select>
    </div>

    <div class="form-control mb-4">
      <label for="new-operation-description" class="label">
        <span class="label-text">Description</span>
      </label>
      <textarea
        id="new-operation-description"
        class="textarea textarea-bordered w-full bg-base-100"
        placeholder="Enter description"
        bind:value={newOperationDescription}
      ></textarea>
    </div>

    <div class="modal-action">
      <button
        class="btn btn-primary"
        on:click={addOperation}
        disabled={isLoading}
      >
        {#if isLoading}
          <span class="loading loading-spinner loading-sm mr-2"></span>
        {/if}
        Add Operation
      </button>
      <button
        class="btn"
        on:click={() =>
          menuStore.update((m) => ({ ...m, showAddOperationModal: false }))}
        disabled={isLoading}
      >
        Close
      </button>
    </div>
  </div>
</div>
