<script>
  import { Plus, Pencil, Tractor } from "lucide-svelte"
  import Icon from "@iconify/svelte"
  import {
    operationStore,
    selectedOperationStore,
  } from "$lib/stores/operationStore"
  import { menuStore } from "../../../../stores/menuStore"
  import { profileStore } from "$lib/stores/profileStore"
  import { onMount } from "svelte"
  import { toast } from "svelte-sonner"
  import { operationApi } from "$lib/api/operationApi"

  onMount(() => {
    console.log("Initial Operation Store:", $operationStore)
  })

  function editOperation() {
    const operation = $selectedOperationStore
    if (operation) {
      menuStore.update((m) => ({ ...m, showEditOperationModal: true }))
    }
  }

  async function handleOperationSelect(event) {
    const selectedId = event.target.value
    console.log("1. Select Event - Selected ID:", selectedId)
    console.log("2. Current Operation Store:", $operationStore)

    const selectedOperation = $operationStore.find((op) => op.id === selectedId)
    console.log("3. Found Selected Operation:", selectedOperation)

    if (selectedOperation && $profileStore?.id) {
      try {
        console.log("4. Starting API Call...")

        // Use the operationApi.updateSelectedOperation function
        const result = await operationApi.updateSelectedOperation(
          $profileStore.id,
          selectedId,
        )

        console.log("5. API Response:", result)

        if (!result.success) {
          console.error("Failed to update selected operation:", result.message)
          toast.error(`Failed to update selected operation: ${result.message}`)
          return
        }

        console.log(
          "6. Before Store Update - Current Store:",
          $selectedOperationStore,
        )

        // Update both the selected operation store and the profile store
        selectedOperationStore.set(selectedOperation)
        profileStore.update((profile) => ({
          ...profile,
          selected_operation_id: selectedId,
        }))

        console.log(
          "7. After Store Update - New Store:",
          $selectedOperationStore,
        )

        toast.success("Successfully updated selected operation")
      } catch (error) {
        console.error("Error updating selected operation:", error)
        toast.error("Failed to update selected operation")
      }
    }
  }
</script>

<div class="card bg-base-200 p-4 shadow-sm">
  <h2
    class="mb-4 flex items-center justify-center text-center text-xl font-bold"
  >
    <Icon class="mr-2" icon="ph:tractor-fill" /> Operation
  </h2>

  <div class="flex flex-col items-center gap-4 sm:flex-row">
    <select
      class="select select-bordered flex-grow bg-base-100"
      value={$selectedOperationStore?.id}
      on:change={handleOperationSelect}
    >
      {#each $operationStore as operation}
        <option value={operation.id}>
          {operation.name} ({operation.year})
        </option>
      {/each}
    </select>

    <div class="flex gap-2">
      <button
        class="btn btn-square btn-outline bg-base-100"
        on:click={editOperation}
      >
        <Pencil class="h-5 w-5" />
      </button>

      <button
        class="btn btn-secondary"
        on:click={() =>
          menuStore.update((m) => ({ ...m, showAddOperationModal: true }))}
      >
        <Plus class="h-5 w-5" />Operation
      </button>
    </div>
  </div>
</div>
