<script lang="ts">
  import { menuStore } from "../../../../stores/menuStore"
  import { connectedMapStore } from "$lib/stores/connectedMapStore"
  import { mapActivityStore } from "$lib/stores/mapActivityStore"
  import { profileStore } from "$lib/stores/profileStore"
  import { toast } from "svelte-sonner"
  import { goto } from "$app/navigation"
  import {
    X,
    LogOut,
    Trash2,
    PenLine,
    Check,
    X as Cancel,
    Map,
    User,
    Calendar,
  } from "lucide-svelte"
  import { mapApi } from "$lib/api/mapApi"
  import { onMount } from "svelte"

  let isRenaming = false
  let newMapNameInput = $connectedMapStore.map_name
  let isLoading = false
  let nameInputRef
  let actionType = null

  function cancelSettingsModal() {
    menuStore.update((store) => ({ ...store, showSettingsModal: false }))
  }

  function startRenaming() {
    isRenaming = true
    newMapNameInput = $connectedMapStore.map_name

    // Focus the input after the DOM updates
    setTimeout(() => {
      if (nameInputRef) {
        nameInputRef.focus()
        nameInputRef.select()
      }
    }, 50)
  }

  function cancelRenameMap() {
    isRenaming = false
    newMapNameInput = $connectedMapStore.map_name
  }

  function openDeleteConfirmationModal() {
    menuStore.update((store) => ({
      ...store,
      showDeleteConfirmationModal: true,
      showSettingsModal: false, // Close the settings modal
    }))
  }

  function updateStores() {
    console.log("updating stores")

    // Update connectedMapStore
    connectedMapStore.set({
      id: null,
      map_name: null,
      master_user_id: null,
      owner: null,
      is_owner: false,
      masterSubscription: null,
      is_connected: false,
    })

    // Also reset mapActivityStore with default values
    mapActivityStore.set({
      marker_count: 0,
      trail_count: 0,
      connected_profiles: [],
      vehicle_states: [],
    })

    console.log($connectedMapStore)
    console.log($mapActivityStore)
    console.log($profileStore)
  }

  async function handleRenameMap() {
    if (!newMapNameInput.trim()) {
      toast.error("Map name cannot be empty")
      return
    }

    isLoading = true
    actionType = "rename"
    try {
      const result = await mapApi.renameMap(
        $connectedMapStore.id,
        newMapNameInput.trim(),
      )

      if (result.success) {
        isRenaming = false
        // Update the connected map store
        connectedMapStore.update((store) => ({
          ...store,
          map_name: newMapNameInput.trim(),
        }))
        toast.success("Map renamed successfully")
      } else {
        toast.error(`Failed to rename map: ${result.message}`)
      }
    } catch (error) {
      toast.error(`An error occurred: ${error.message}`)
    } finally {
      isLoading = false
      actionType = null
    }
  }

  async function handleDisconnectFromMap() {
    isLoading = true
    actionType = "disconnect"
    try {
      const result = await mapApi.disconnectFromMap()

      if (result.success) {
        updateStores()
        menuStore.update((store) => ({
          ...store,
          showSettingsModal: false,
        }))
        toast.success("Disconnected from map", {
          description: "You have successfully left the map",
        })
        goto("/account")
      } else {
        toast.error(`Failed to disconnect: ${result.message}`)
      }
    } catch (error) {
      toast.error(`An error occurred: ${error.message}`)
    } finally {
      isLoading = false
      actionType = null
    }
  }

  // Handle keyboard events when editing
  function handleKeyDown(event) {
    if (event.key === "Enter") {
      handleRenameMap()
    } else if (event.key === "Escape") {
      cancelRenameMap()
    }
  }

  // Get the creation date from the ID
  function getCreationDateFromId(id) {
    if (!id) return null

    // Extract the timestamp portion from the UUID
    // This is a simplified version - actual implementation might need adjustment
    // based on your UUID structure
    try {
      // Assuming the first part of the UUID contains a timestamp
      const timestampHex = id.split("-")[0]
      const timestamp = parseInt(timestampHex, 16)
      return new Date(timestamp)
    } catch (e) {
      return null
    }
  }

  $: creationDate = getCreationDateFromId($connectedMapStore.id)
  $: formattedDate = creationDate
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(creationDate)
    : "Unknown date"
</script>

<div
  class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
>
  <div
    class="modal-box relative w-full max-w-md rounded-xl bg-base-100 p-0 shadow-2xl"
  >
    <!-- Header with gradient background -->
    <div
      class="relative rounded-t-xl bg-gradient-to-r from-primary/80 to-primary p-5"
    >
      <button
        class="btn btn-circle btn-sm absolute right-2 top-2 border-0 bg-base-100/20 text-base-100 hover:bg-base-100/40"
        on:click={cancelSettingsModal}
        disabled={isLoading}
      >
        <X class="h-4 w-4" />
      </button>

      <h3 class="text-center text-2xl font-bold text-base-100">Map Settings</h3>
    </div>

    <div class="p-6">
      {#if $connectedMapStore.id}
        <!-- Map Info Card -->
        <div
          class="bg-base-50 dark:bg-base-800/30 mb-6 overflow-hidden rounded-xl border border-base-200 shadow-sm"
        >
          <!-- Map Name Section with Edit -->
          <div class="border-b border-base-200 p-4">
            <div class="mb-1 flex items-center">
              <Map class="mr-2 h-5 w-5 text-primary" />
              <h4 class="font-medium text-base-content/80">Map Name</h4>
            </div>

            {#if isRenaming}
              <div class="mt-2 flex items-center">
                <div class="flex-grow">
                  <input
                    type="text"
                    class="input input-bordered w-full bg-base-100 focus:border-primary"
                    bind:value={newMapNameInput}
                    bind:this={nameInputRef}
                    on:keydown={handleKeyDown}
                    disabled={isLoading}
                    placeholder="Enter map name"
                  />
                </div>
                <div class="ml-2 flex">
                  <button
                    class="btn btn-circle btn-success btn-sm mr-1"
                    on:click={handleRenameMap}
                    disabled={isLoading}
                    aria-label="Save map name"
                  >
                    {#if isLoading && actionType === "rename"}
                      <span class="loading loading-spinner loading-xs"></span>
                    {:else}
                      <Check class="h-4 w-4" />
                    {/if}
                  </button>
                  <button
                    class="btn btn-circle btn-error btn-sm"
                    on:click={cancelRenameMap}
                    disabled={isLoading}
                    aria-label="Cancel rename"
                  >
                    <Cancel class="h-4 w-4" />
                  </button>
                </div>
              </div>
            {:else}
              <div class="mt-2 flex items-center">
                <p class="flex-grow text-xl font-semibold text-primary">
                  {$connectedMapStore.map_name}
                </p>
                {#if $connectedMapStore.is_owner}
                  <button
                    class="btn btn-circle btn-ghost btn-sm text-base-content/60 hover:bg-primary/10 hover:text-primary"
                    on:click={startRenaming}
                    aria-label="Edit map name"
                    disabled={isLoading}
                  >
                    <PenLine class="h-4 w-4" />
                  </button>
                {/if}
              </div>
            {/if}
          </div>

          <!-- Owner Info -->
          <div class="border-b border-base-200 p-4">
            <div class="mb-1 flex items-center">
              <User class="mr-2 h-5 w-5 text-secondary" />
              <h4 class="font-medium text-base-content/80">Owner</h4>
            </div>
            <p class="mt-2 text-lg font-medium">{$connectedMapStore.owner}</p>
          </div>

          <!-- Creation Date -->
          <div class="p-4">
            <div class="mb-1 flex items-center">
              <Calendar class="mr-2 h-5 w-5 text-accent" />
              <h4 class="font-medium text-base-content/80">Created</h4>
            </div>
            <p class="mt-2 text-base text-base-content/70">{formattedDate}</p>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="grid grid-cols-2 gap-3">
          <button
            type="button"
            class="btn btn-outline btn-warning"
            on:click={handleDisconnectFromMap}
            disabled={isLoading}
          >
            {#if isLoading && actionType === "disconnect"}
              <span class="loading loading-spinner loading-sm"></span>
            {:else}
              <LogOut class="mr-2 h-4 w-4" />
              Switch Map
            {/if}
          </button>
          <button
            type="button"
            class="btn btn-outline btn-error"
            disabled={!$connectedMapStore.is_owner || isLoading}
            on:click={openDeleteConfirmationModal}
          >
            <Trash2 class="mr-2 h-4 w-4" />
            Delete Map
          </button>
        </div>

        {#if $connectedMapStore.is_owner}
          <div class="mt-4 text-center text-xs text-base-content/50">
            As the owner, you have full control over this map.
          </div>
        {:else}
          <div class="mt-4 text-center text-xs text-base-content/50">
            Contact the owner for additional map settings.
          </div>
        {/if}
      {:else}
        <div class="py-10 text-center">
          <div class="mb-4 flex justify-center">
            <Map class="h-12 w-12 text-base-content/30" />
          </div>
          <p class="text-lg text-base-content/70">No map connected</p>
          <p class="mt-2 text-sm text-base-content/50">
            Connect to a map to see settings
          </p>
        </div>
      {/if}
    </div>
  </div>
</div>
