<script lang="ts">
  import { v4 as uuidv4 } from "uuid"
  import { menuStore } from "../../../../stores/menuStore"
  import { toast } from "svelte-sonner"
  import { Map } from "lucide-svelte"
  import { mapApi } from "$lib/api/mapApi"
  import { connectedMapStore } from "$lib/stores/connectedMapStore"
  import { profileStore } from "$lib/stores/profileStore"

  let newMapName = ""
  let generatedMapId = uuidv4()
  let isLoading = false

  function cancelGenerateMap() {
    menuStore.update((store) => ({ ...store, showGenerateModal: false }))
  }

  async function handleCreateMap() {
    if (!newMapName.trim()) {
      toast.error("Please enter a map name")
      return
    }

    isLoading = true

    try {
      const result = await mapApi.createAndJoinMap(newMapName, generatedMapId)

      if (result.success) {
        // Update the connected map store directly with the new map information
        connectedMapStore.set({
          id: generatedMapId,
          map_name: newMapName,
          master_user_id: $profileStore?.id,
          owner: $profileStore?.full_name,
          is_owner: true,
          masterSubscription: $profileStore?.subscription,
          is_connected: true,
        })

        toast.success("Map created successfully", {
          description: "You have been connected to your new map",
        })

        // Close the modal
        menuStore.update((store) => ({ ...store, showGenerateModal: false }))
      } else {
        toast.error("Failed to create map", {
          description: result.message,
        })
      }
    } catch (error) {
      toast.error("An error occurred", {
        description: error.message,
      })
    } finally {
      isLoading = false
    }
  }
</script>

<div class="modal modal-open">
  <div class="modal-box mx-auto w-11/12 max-w-xl px-6 py-4">
    <h3 class="mb-6 text-center text-2xl font-bold text-primary">
      Generate New Map
    </h3>

    <div
      class="mb-6 rounded-lg bg-info/20 p-4 text-base-content shadow-inner dark:bg-info/40"
    >
      <div class="mb-4 flex items-center justify-center">
        <Map class="h-12 w-12 text-primary" />
      </div>
      <div class="text-center">
        <p class="text-lg font-semibold">{newMapName || "New Map"}</p>
        <div class="mt-2 flex justify-center">
          <span class="badge badge-info badge-lg text-xs font-bold">
            {generatedMapId}
          </span>
        </div>
      </div>
    </div>

    <div class="form-control">
      <label for="mapName" class="label">
        <span class="label-text">Map Name</span>
      </label>
      <input
        id="mapName"
        type="text"
        name="mapName"
        placeholder="Enter map name"
        class="input input-bordered w-full"
        bind:value={newMapName}
      />
    </div>

    <div class="mt-6 flex justify-center space-x-4">
      <button
        type="button"
        class="btn btn-primary"
        on:click={handleCreateMap}
        disabled={isLoading}
      >
        {#if isLoading}
          <span class="loading loading-spinner loading-sm mr-2"></span>
        {/if}
        Create Map
      </button>
      <button
        type="button"
        class="btn btn-ghost"
        on:click={cancelGenerateMap}
        disabled={isLoading}
      >
        Cancel
      </button>
    </div>
  </div>
</div>
