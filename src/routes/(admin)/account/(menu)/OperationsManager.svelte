<script>
  import {
    Plus,
    Pencil,
    Save,
    Trash2,
    ChevronLeft,
    MapPin,
  } from "lucide-svelte"

  export let currentView
  export let isLoading
  export let loadingAction
  export let operations
  export let selectedOperation
  export let goBack
  export let navigateTo
  export let handleCreateOperation
  export let handleUpdateOperation
  export let handleDeleteOperation
  export let handleOperationSelect

  // Form state
  let newOperationName = ""
  let newOperationYear = new Date().getFullYear()
  let newOperationDescription = ""
  let editOperationName = ""
  let editOperationYear = new Date().getFullYear()
  let editOperationDescription = ""

  $: currentYear = new Date().getFullYear()
  $: yearOptions = Array.from({ length: 10 }, (_, i) => currentYear - 5 + i)
  $: isOnlyOperation = operations.length <= 1

  function prepareEditOperation() {
    if (selectedOperation) {
      editOperationName = selectedOperation.name
      editOperationYear = selectedOperation.year
      editOperationDescription = selectedOperation.description || ""
      navigateTo("edit-operation")
    }
  }

  async function onCreateOperation() {
    const result = await handleCreateOperation(
      newOperationName,
      newOperationYear,
      newOperationDescription,
    )
    if (result.success) {
      newOperationName = ""
      newOperationYear = new Date().getFullYear()
      newOperationDescription = ""
    }
  }

  async function onUpdateOperation() {
    await handleUpdateOperation(
      selectedOperation.id,
      editOperationName,
      editOperationYear,
      editOperationDescription,
    )
  }

  async function onDeleteOperation() {
    await handleDeleteOperation(selectedOperation.id)
  }
</script>

<div class="space-y-4">
  <!-- Back Button -->
  <button
    class="flex items-center gap-2 text-contrast-content/60 transition-colors hover:text-contrast-content"
    on:click={goBack}
  >
    <ChevronLeft class="h-4 w-4" />
    <span class="text-sm">Back</span>
  </button>

  {#if currentView === "operations"}
    {#if operations && operations.length > 0}
      <!-- Operation Selector -->
      <div>
        <label class="mb-2 block text-sm text-contrast-content/60"
          >Current Operation</label
        >
        <select
          class="w-full rounded-lg border border-base-300 bg-base-200 p-3 text-contrast-content outline-none transition-colors focus:border-base-content"
          value={selectedOperation?.id}
          on:change={(e) => handleOperationSelect(e.target.value)}
          disabled={isLoading}
        >
          {#each operations as operation}
            <option value={operation.id}>
              {operation.name} ({operation.year})
            </option>
          {/each}
        </select>
      </div>

      <!-- Operation Actions -->
      <div class="space-y-2">
        <button
          class="flex w-full items-center gap-3 rounded-lg bg-base-200 px-4 py-2.5 font-medium text-contrast-content transition-colors hover:bg-base-300"
          on:click={() => navigateTo("create-operation")}
        >
          <Plus class="h-4 w-4" />
          <div class="text-left">
            <div class="text-sm font-medium">Create New Operation</div>
            <div class="text-xs text-contrast-content/60">
              Add a new operation to this map
            </div>
          </div>
        </button>

        {#if selectedOperation}
          <button
            class="flex w-full items-center gap-3 rounded-lg bg-base-200 px-4 py-2.5 text-contrast-content transition-colors hover:bg-base-300"
            on:click={prepareEditOperation}
          >
            <Pencil class="h-4 w-4" />
            <div class="text-left">
              <div class="text-sm font-medium">Edit Operation</div>
              <div class="text-xs text-contrast-content/60">
                Modify operation details
              </div>
            </div>
          </button>
        {/if}
      </div>
    {:else}
      <div class="py-8 text-center">
        <div
          class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-base-200"
        >
          <MapPin class="h-6 w-6 text-base-content/60" />
        </div>
        <h3 class="mb-2 font-semibold text-contrast-content">No Operations</h3>
        <p class="mb-4 text-sm text-contrast-content/60">
          Create your first operation to get started.
        </p>
        <button
          class="mx-auto flex items-center gap-2 rounded-lg bg-base-content px-4 py-2 font-medium text-base-100 transition-colors hover:bg-base-content/90"
          on:click={() => navigateTo("create-operation")}
        >
          <Plus class="h-4 w-4" />
          Create Operation
        </button>
      </div>
    {/if}
  {:else if currentView === "create-operation"}
    <!-- Create Operation Form -->
    <form on:submit|preventDefault={onCreateOperation} class="space-y-6">
      <div>
        <label
          for="operationName"
          class="mb-1.5 block text-sm text-contrast-content/60"
        >
          Operation Name
        </label>
        <input
          id="operationName"
          type="text"
          bind:value={newOperationName}
          class="w-full rounded-lg border border-base-300 bg-base-200 p-3 text-contrast-content outline-none transition-colors focus:border-base-content"
          placeholder="Enter operation name"
          required
        />
      </div>

      <div>
        <label
          for="operationYear"
          class="mb-1.5 block text-sm text-contrast-content/60"
        >
          Year
        </label>
        <select
          id="operationYear"
          bind:value={newOperationYear}
          class="w-full rounded-lg border border-base-300 bg-base-200 p-3 text-contrast-content outline-none transition-colors focus:border-base-content"
          required
        >
          {#each yearOptions as year}
            <option value={year}>{year}</option>
          {/each}
        </select>
      </div>

      <div>
        <label
          for="operationDescription"
          class="mb-1.5 block text-sm text-contrast-content/60"
        >
          Description (Optional)
        </label>
        <textarea
          id="operationDescription"
          bind:value={newOperationDescription}
          rows="4"
          class="w-full resize-none rounded-lg border border-base-300 bg-base-200 p-3 text-contrast-content outline-none transition-colors focus:border-base-content"
          placeholder="Describe this operation"
        ></textarea>
      </div>

      <button
        type="submit"
        disabled={isLoading}
        class="flex w-full items-center justify-center gap-2 rounded-lg bg-base-content px-6 py-3 font-medium text-base-100 transition-colors hover:bg-base-content/90 {isLoading
          ? 'cursor-not-allowed opacity-50'
          : ''}"
      >
        {#if isLoading && loadingAction === "create-operation"}
          <div
            class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          ></div>
        {:else}
          <Save class="h-4 w-4" />
        {/if}
        {isLoading && loadingAction === "create-operation"
          ? "Creating..."
          : "Create Operation"}
      </button>
    </form>
  {:else if currentView === "edit-operation"}
    <!-- Edit Operation Form -->
    <form on:submit|preventDefault={onUpdateOperation} class="space-y-6">
      <div>
        <label
          for="editOperationName"
          class="mb-1.5 block text-sm text-contrast-content/60"
        >
          Operation Name
        </label>
        <input
          id="editOperationName"
          type="text"
          bind:value={editOperationName}
          class="w-full rounded-lg border border-base-300 bg-base-200 p-3 text-contrast-content outline-none transition-colors focus:border-base-content"
          placeholder="Enter operation name"
          required
        />
      </div>

      <div>
        <label
          for="editOperationYear"
          class="mb-1.5 block text-sm text-contrast-content/60"
        >
          Year
        </label>
        <select
          id="editOperationYear"
          bind:value={editOperationYear}
          class="w-full rounded-lg border border-base-300 bg-base-200 p-3 text-contrast-content outline-none transition-colors focus:border-base-content"
          required
        >
          {#each yearOptions as year}
            <option value={year}>{year}</option>
          {/each}
        </select>
      </div>

      <div>
        <label
          for="editOperationDescription"
          class="mb-1.5 block text-sm text-contrast-content/60"
        >
          Description (Optional)
        </label>
        <textarea
          id="editOperationDescription"
          bind:value={editOperationDescription}
          rows="4"
          class="w-full resize-none rounded-lg border border-base-300 bg-base-200 p-3 text-contrast-content outline-none transition-colors focus:border-base-content"
          placeholder="Describe this operation"
        ></textarea>
      </div>

      <div class="flex gap-2">
        <button
          type="submit"
          disabled={isLoading}
          class="flex flex-1 items-center justify-center gap-2 rounded-lg bg-base-content px-6 py-3 font-medium text-base-100 transition-colors hover:bg-base-content/90"
        >
          {#if isLoading && loadingAction === "update-operation"}
            <div
              class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
            ></div>
          {:else}
            <Save class="h-4 w-4" />
          {/if}
          {isLoading && loadingAction === "update-operation"
            ? "Updating..."
            : "Save Changes"}
        </button>
        <button
          type="button"
          disabled={isOnlyOperation || isLoading}
          class="flex items-center justify-center gap-2 rounded-lg bg-red-600 px-6 py-3 font-medium text-white transition-colors hover:bg-red-700 {isOnlyOperation ||
          isLoading
            ? 'cursor-not-allowed opacity-50'
            : ''}"
          on:click={onDeleteOperation}
        >
          {#if isLoading && loadingAction === "delete-operation"}
            <div
              class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
            ></div>
          {:else}
            <Trash2 class="h-4 w-4" />
          {/if}
          Delete
        </button>
      </div>
    </form>
  {/if}
</div>
