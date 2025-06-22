<script>
  import {
    Plus,
    Link2,
    LogOut,
    Trash2,
    Edit3,
    Save,
    X,
    ChevronLeft,
  } from "lucide-svelte"

  export let currentView
  export let isConnected
  export let isOwner
  export let isLoading
  export let loadingAction
  export let connectedMap
  export let goBack
  export let navigateTo
  export let handleRenameMap
  export let handleDeleteMap
  export let handleDisconnectFromMap

  let isRenaming = false
  let newMapNameInput = ""

  async function onRenameMap() {
    const result = await handleRenameMap(newMapNameInput)
    if (result.success) {
      isRenaming = false
    }
  }

  function startRenaming() {
    isRenaming = true
    newMapNameInput = connectedMap.map_name
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

  {#if currentView === "settings"}
    {#if isConnected}
      <!-- Map Name Edit -->
      <div>
        <label class="mb-2 block text-sm text-contrast-content/60"
          >Map Name</label
        >
        {#if isRenaming}
          <div class="flex gap-2">
            <input
              type="text"
              bind:value={newMapNameInput}
              class="flex-1 rounded-lg border border-base-300 bg-base-200 p-3 text-contrast-content outline-none transition-colors focus:border-base-content"
            />
            <button
              class="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-white transition-colors hover:bg-green-700"
              on:click={onRenameMap}
              disabled={isLoading}
            >
              {#if isLoading && loadingAction === "rename"}
                <div
                  class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                ></div>
              {:else}
                <Save class="h-4 w-4" />
              {/if}
            </button>
            <button
              class="rounded-lg bg-gray-500 px-4 py-2 text-white transition-colors hover:bg-gray-600"
              on:click={() => (isRenaming = false)}
            >
              <X class="h-4 w-4" />
            </button>
          </div>
        {:else}
          <div class="flex gap-2">
            <input
              type="text"
              value={connectedMap.map_name}
              readonly
              class="flex-1 cursor-not-allowed rounded-lg border border-base-300 bg-base-200 p-3 text-contrast-content"
            />
            {#if isOwner}
              <button
                class="flex items-center gap-2 rounded-lg border border-base-300 bg-base-200 px-4 py-2 transition-colors hover:bg-base-300"
                on:click={startRenaming}
              >
                <Edit3 class="h-4 w-4" />
              </button>
            {/if}
          </div>
        {/if}
      </div>

      <!-- Settings Actions -->
      <div class="space-y-2">
        <!-- Create New Map Option -->
        <button
          class="flex w-full items-center gap-3 rounded-lg bg-base-content px-4 py-2.5 font-medium text-base-100 transition-colors hover:bg-base-content/90"
          on:click={() => navigateTo("create")}
        >
          <Plus class="h-4 w-4" />
          <div class="text-left">
            <div class="text-sm font-medium">Create New Map</div>
            <div class="text-xs text-base-100/70">
              Start a fresh map project
            </div>
          </div>
        </button>

        <!-- Switch Map Option -->
        <button
          class="flex w-full items-center gap-3 rounded-lg bg-base-200 px-4 py-2.5 font-medium text-contrast-content transition-colors hover:bg-base-300"
          on:click={() => navigateTo("switch-map")}
        >
          <Link2 class="h-4 w-4" />
          <div class="text-left">
            <div class="text-sm font-medium">Switch to Different Map</div>
            <div class="text-xs text-contrast-content/60">
              Connect to another map
            </div>
          </div>
        </button>

        <!-- Leave Map Option -->
        <button
          class="flex w-full items-center gap-3 rounded-lg bg-base-200 px-4 py-2.5 font-medium text-contrast-content transition-colors hover:bg-base-300"
          on:click={handleDisconnectFromMap}
          disabled={isLoading}
        >
          {#if isLoading && loadingAction === "disconnect"}
            <div
              class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
            ></div>
          {:else}
            <LogOut class="h-4 w-4" />
          {/if}
          <div class="text-left">
            <div class="text-sm font-medium">Leave Map</div>
            <div class="text-xs text-contrast-content/60">
              Disconnect without switching
            </div>
          </div>
        </button>

        {#if isOwner}
          <button
            class="flex w-full items-center gap-3 rounded-lg bg-base-200 px-4 py-2.5 font-medium text-contrast-content transition-colors hover:bg-base-300"
            on:click={() => navigateTo("delete-confirm")}
          >
            <Trash2 class="h-4 w-4 text-red-600" />
            <div class="text-left">
              <div class="text-sm font-medium">Delete Map</div>
              <div class="text-xs text-contrast-content/60">
                Permanently remove this map
              </div>
            </div>
          </button>
        {/if}
      </div>
    {:else}
      <div class="py-12 text-center">
        <p class="text-contrast-content/60">
          Connect to a map to access settings
        </p>
      </div>
    {/if}
  {:else if currentView === "delete-confirm"}
    <!-- Delete Confirmation -->
    <div class="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
      <div
        class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100"
      >
        <Trash2 class="h-8 w-8 text-red-600" />
      </div>
      <h3 class="mb-2 text-lg font-semibold text-red-900">Delete Map</h3>
      <p class="mb-4 text-red-800">
        Are you sure you want to permanently delete "{connectedMap.map_name}"?
        This action cannot be undone and will remove all associated data.
      </p>
    </div>

    <div class="space-y-3">
      <button
        class="w-full rounded-lg bg-red-600 px-4 py-3 font-medium text-white transition-colors hover:bg-red-700"
        on:click={handleDeleteMap}
      >
        Yes, Delete Map Permanently
      </button>
    </div>
  {/if}
</div>
