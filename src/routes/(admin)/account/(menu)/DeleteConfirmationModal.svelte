<script lang="ts">
  import { menuStore } from "../../../../stores/menuStore"
  import { connectedMapStore } from "$lib/stores/connectedMapStore"
  import { enhance, applyAction } from "$app/forms"
  import { toast } from "svelte-sonner"
  import { goto } from "$app/navigation"
  import { AlertTriangle, X, Trash2, ArrowLeft } from "lucide-svelte"
  import { mapApi } from "$lib/api/mapApi"

  export let onClose = () => {}

  let confirmationInput = ""
  let isLoading = false

  $: mapName = $connectedMapStore.map_name || "Unnamed Map"
  $: mapId = $connectedMapStore.id || ""
  $: isConfirmationValid =
    confirmationInput.toLowerCase() === mapId.slice(0, 8).toLowerCase()

  function updateStores() {
    connectedMapStore.set({
      id: null,
      map_name: null,
      master_user_id: null,
      owner: null,
      is_owner: false,
      masterSubscription: null,
      is_connected: false,
    })
  }

  function closeModals() {
    menuStore.update((store) => ({
      ...store,
      showDeleteConfirmationModal: false,
      showSettingsModal: false,
    }))
  }

  function goBackToSettings() {
    menuStore.update((store) => ({
      ...store,
      showDeleteConfirmationModal: false,
      showSettingsModal: true,
    }))
    onClose()
  }

  // Modern approach using the API instead of form submission
  async function handleDeleteMap() {
    if (!isConfirmationValid) return

    isLoading = true
    try {
      const result = await mapApi.deleteMap(mapId)

      if (result.success) {
        updateStores()
        closeModals()
        toast.success("Map deleted successfully")
        goto("/account")
      } else {
        toast.error(`Failed to delete map: ${result.message}`)
      }
    } catch (error) {
      toast.error(`An error occurred: ${error.message}`)
    } finally {
      isLoading = false
    }
  }
</script>

<div
  class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
>
  <div
    class="modal-box relative w-full max-w-md rounded-xl bg-base-100 p-0 shadow-2xl"
  >
    <!-- Header with warning gradient -->
    <div
      class="relative rounded-t-xl bg-gradient-to-r from-red-500/90 to-red-600 p-5"
    >
      <button
        class="btn btn-circle btn-sm absolute right-2 top-2 border-0 bg-base-100/20 text-base-100 hover:bg-base-100/40"
        on:click={closeModals}
        disabled={isLoading}
      >
        <X class="h-4 w-4" />
      </button>

      <div class="flex flex-col items-center justify-center">
        <AlertTriangle class="mb-2 h-10 w-10 text-white" />
        <h3 class="text-center text-2xl font-bold text-white">Delete Map</h3>
      </div>
    </div>

    <div class="p-6">
      <div class="mb-6">
        <div
          class="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800/50 dark:bg-red-900/20"
        >
          <p
            class="mb-2 text-center font-medium text-red-800 dark:text-red-300"
          >
            You are about to permanently delete:
          </p>
          <p
            class="mb-3 text-center text-xl font-bold text-red-700 dark:text-red-400"
          >
            {mapName}
          </p>
          <div class="text-sm text-red-700/80 dark:text-red-300/80">
            <p>• All map data will be permanently deleted</p>
            <p>• This action cannot be undone</p>
            <p>• All collaborators will lose access</p>
          </div>
        </div>
      </div>

      <div class="mb-6">
        <label class="mb-2 block text-sm font-medium text-base-content">
          For security, please type the first 8 characters of the map ID to
          confirm:
        </label>
        <div
          class="mb-3 overflow-hidden overflow-ellipsis whitespace-nowrap rounded-md bg-base-200 p-2 font-mono text-sm"
        >
          <span class="font-bold text-red-500">{mapId.slice(0, 8)}</span>
          <span class="text-base-content/40">{mapId.slice(8)}</span>
        </div>
        <input
          type="text"
          class="input input-bordered w-full focus:border-red-500"
          bind:value={confirmationInput}
          placeholder="Type the first 8 characters"
          disabled={isLoading}
        />
      </div>

      <div class="flex space-x-3">
        <button
          type="button"
          class="btn btn-outline flex-1"
          on:click={goBackToSettings}
          disabled={isLoading}
        >
          <ArrowLeft class="mr-2 h-4 w-4" />
          Go Back
        </button>
        <button
          type="button"
          class="btn btn-error flex-1"
          disabled={!isConfirmationValid || isLoading}
          on:click={handleDeleteMap}
        >
          {#if isLoading}
            <span class="loading loading-spinner loading-sm mr-2"></span>
          {:else}
            <Trash2 class="mr-2 h-4 w-4" />
          {/if}
          Delete
        </button>
      </div>

      <div class="mt-4 text-center text-xs text-base-content/50">
        Deleted maps cannot be recovered. Make sure you have any needed data
        backed up.
      </div>
    </div>
  </div>
</div>
