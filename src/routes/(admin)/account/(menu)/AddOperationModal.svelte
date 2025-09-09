<script>
  import {
    operationStore,
    selectedOperationStore,
  } from "$lib/stores/operationStore"
  import { menuStore } from "../../../../stores/menuStore"
  import { toast } from "svelte-sonner"
  import { operationApi } from "$lib/api/operationApi"
  import { profileStore } from "$lib/stores/profileStore"
  import { X, Save, FileText } from "lucide-svelte"
  import { onMount } from "svelte"

  let newOperationName = ""
  let newOperationYear = new Date().getFullYear()
  let newOperationDescription = ""
  let isLoading = false
  let modalRef

  let currentYear = new Date().getFullYear()
  let yearOptions = Array.from({ length: 10 }, (_, i) => currentYear - 5 + i)

  // Focus the first input when modal opens
  onMount(() => {
    const timer = setTimeout(() => {
      const nameInput = document.getElementById("new-operation-name")
      if (nameInput) {
        nameInput.focus()
      }
    }, 100)

    return () => clearTimeout(timer)
  })

  function closeModal() {
    menuStore.update((m) => ({ ...m, showAddOperationModal: false }))
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
        closeModal()

        toast.success("Operation added")
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
        <h2 class="text-xl font-bold text-contrast-content">
          Add New Operation
        </h2>
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
    <form on:submit|preventDefault={addOperation} class="space-y-5 p-6">
      <!-- Operation Name -->
      <div>
        <label
          for="new-operation-name"
          class="mb-1.5 block text-sm text-contrast-content/60"
        >
          Operation Name
        </label>
        <div class="relative">
          <input
            type="text"
            id="new-operation-name"
            bind:value={newOperationName}
            class="w-full rounded-lg border border-base-300 bg-base-200 p-3 text-contrast-content outline-none transition-colors focus:border-base-content"
            placeholder="Enter operation name"
            required
          />
        </div>
      </div>

      <!-- Year -->
      <div>
        <label
          for="new-operation-year"
          class="mb-1.5 block text-sm text-contrast-content/60"
        >
          Year
        </label>
        <div class="relative">
          <select
            id="new-operation-year"
            bind:value={newOperationYear}
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
          for="new-operation-description"
          class="mb-1.5 block text-sm text-contrast-content/60"
        >
          Description
        </label>
        <div class="relative">
          <textarea
            id="new-operation-description"
            bind:value={newOperationDescription}
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
          on:click={closeModal}
          class="rounded-lg border border-base-300 px-4 py-2.5 text-contrast-content/60 transition-colors hover:bg-base-200"
        >
          Close
        </button>

        <button
          type="submit"
          disabled={isLoading}
          class="flex items-center gap-2 rounded-lg bg-base-content px-6 py-2.5 font-medium text-base-100 transition-colors hover:bg-base-content/90 {isLoading
            ? 'cursor-not-allowed opacity-50'
            : ''}"
        >
          <Save class="h-4 w-4" />
          {isLoading ? "Adding..." : "Add Operation"}
        </button>
      </div>
    </form>
  </div>
</div>
