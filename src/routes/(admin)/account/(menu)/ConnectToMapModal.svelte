<script lang="ts">
  import { menuStore } from "$lib/stores/menuStore"
  import { connectedMapStore } from "$lib/stores/connectedMapStore"
  import { mapActivityStore } from "$lib/stores/mapActivityStore"
  import { profileStore } from "$lib/stores/profileStore"
  import {
    operationStore,
    selectedOperationStore,
  } from "$lib/stores/operationStore"
  import { supabase } from "$lib/supabaseClient"
  import { toast } from "svelte-sonner"
  import { Link2, Map, Clock, X } from "lucide-svelte"
  import { mapApi } from "$lib/api/mapApi"

  let enteredMapId = ""
  let isValidMapId = false
  let userMaps = []
  let recentMaps = []
  let isLoading = false
  let loadingMapId = null

  async function checkMapIdValidity() {
    if (!enteredMapId.trim()) {
      isValidMapId = false
      return
    }

    const { data: map, error } = await supabase
      .from("master_maps")
      .select("id")
      .eq("id", enteredMapId.trim())
      .single()

    isValidMapId = !error && map !== null
  }

  function closeModal() {
    menuStore.update((store) => ({ ...store, showConnectModal: false }))
  }

  async function fetchRecentMaps() {
    if ($profileStore.recent_maps && $profileStore.recent_maps.length > 0) {
      const { data, error } = await supabase
        .from("master_maps")
        .select(
          `
                id, 
                map_name, 
                master_user_id,
                profiles:master_user_id(full_name)
              `,
        )
        .in("id", $profileStore.recent_maps)

      if (!error && data) {
        recentMaps = $profileStore.recent_maps
          .map((id) => {
            const map = data.find((m) => m.id === id)
            return map
              ? {
                  ...map,
                  owner_name:
                    map.master_user_id === $profileStore.id
                      ? "You"
                      : map.profiles.full_name,
                }
              : undefined
          })
          .filter((map) => map !== undefined)
      } else {
        console.error("Error fetching recent maps:", error)
      }
    }
  }

  $: {
    if ($menuStore.showConnectModal) {
      supabase
        .from("master_maps")
        .select(
          `
                id, 
                map_name, 
                master_user_id,
                profiles:master_user_id(full_name)
              `,
        )
        .eq("master_user_id", $profileStore.id)
        .then(({ data, error }) => {
          if (error) {
            console.error("Error fetching user maps:", error)
          } else {
            userMaps = (data || []).map((map) => ({
              ...map,
              owner_name: "You",
            }))
          }
        })

      fetchRecentMaps()
    }
  }

  async function connectToMap(mapId) {
    // Trim the mapId before using it
    const trimmedMapId = mapId.trim()

    if (!trimmedMapId) {
      toast.error("Please enter a valid map ID")
      return
    }

    isLoading = true
    loadingMapId = mapId

    try {
      const result = await mapApi.connectToMap(trimmedMapId)

      if (result.success && result.data) {
        // Directly use the data from the API response
        const { connectedMap, mapActivity, operations, operation } = result.data

        // Update stores
        connectedMapStore.set(connectedMap)
        mapActivityStore.set(mapActivity)

        if (operations && operations.length > 0) {
          operationStore.set(operations)
          selectedOperationStore.set(operation || operations[0])
        }

        // Update profile store to stay in sync
        profileStore.update((profile) => ({
          ...profile,
          master_map_id: trimmedMapId,
        }))

        // Close modal
        menuStore.update((store) => ({
          ...store,
          showConnectModal: false,
        }))

        toast.success("Connected to map")
      } else {
        toast.error(`Failed to connect to map: ${result.message}`)
      }
    } catch (error) {
      toast.error(`Error: ${error.message}`)
    } finally {
      isLoading = false
      loadingMapId = null
    }
  }
</script>

<div class="modal modal-open">
  <div class="modal-box relative mx-auto w-11/12 max-w-xl px-6 py-6">
    <button
      class="btn btn-circle btn-sm absolute right-2 top-2"
      on:click={closeModal}
      disabled={isLoading}
    >
      <X class="h-4 w-4" />
    </button>

    <h2 class="mb-6 text-center text-3xl font-bold text-primary">
      Connect to Map
    </h2>

    <div class="form-control mb-4">
      <label class="label" for="enteredMapId">
        <span class="label-text text-lg font-semibold">Enter Map ID:</span>
      </label>
      <p class="mb-2 text-sm text-gray-600">
        Paste the Map ID here to connect to an existing map.
      </p>
      <div class="flex">
        <input
          type="text"
          id="enteredMapId"
          placeholder="Map ID"
          class="input input-bordered flex-grow"
          bind:value={enteredMapId}
          on:input={checkMapIdValidity}
          disabled={isLoading}
        />
        <button
          type="button"
          class="btn btn-primary ml-2"
          class:btn-success={isValidMapId}
          disabled={!isValidMapId || isLoading}
          on:click={() => connectToMap(enteredMapId)}
        >
          {#if isLoading && loadingMapId === enteredMapId}
            <span class="loading loading-spinner loading-sm"></span>
          {:else}
            Connect
          {/if}
        </button>
      </div>
    </div>

    {#if recentMaps.length > 0}
      <div class="divider my-6">
        <span class="text-xl font-bold text-primary">Recent Maps</span>
      </div>
      <p class="mb-4 text-sm text-gray-600">
        Select a map you've recently connected to:
      </p>
      <ul class="space-y-2">
        {#each recentMaps as map, index}
          <li
            class={`rounded-xl ${index % 2 === 0 ? "bg-base-200" : "bg-base-300"}`}
          >
            <button
              type="button"
              class="flex w-full items-center justify-between p-4 transition-colors hover:bg-base-100"
              on:click={() => connectToMap(map.id)}
              disabled={isLoading}
            >
              <span class="flex flex-col items-start">
                <span class="flex items-center font-medium">
                  <Map class="mr-2 h-4 w-4" />
                  {map.map_name}
                </span>
                <span class="text-sm text-gray-500"
                  >Owner: {map.owner_name}</span
                >
              </span>
              {#if isLoading && loadingMapId === map.id}
                <span class="loading loading-spinner loading-md text-primary"
                ></span>
              {:else}
                <Link2 class="h-8 w-8 text-primary" />
              {/if}
            </button>
          </li>
        {/each}
      </ul>
    {/if}

    {#if userMaps.length > 0}
      <div class="divider my-6">
        <span class="text-xl font-bold text-primary">Your Maps</span>
      </div>
      <p class="mb-4 text-sm text-gray-600">
        Select one of your own maps to connect:
      </p>
      <ul class="space-y-2">
        {#each userMaps as map, index}
          <li
            class={`rounded-xl ${index % 2 === 0 ? "bg-base-200" : "bg-base-300"}`}
          >
            <button
              type="button"
              class="flex w-full items-center justify-between p-4 transition-colors hover:bg-base-100"
              on:click={() => connectToMap(map.id)}
              disabled={isLoading}
            >
              <span class="flex flex-col items-start">
                <span class="flex items-center font-medium">
                  <Map class="mr-2 h-4 w-4" />
                  {map.map_name}
                </span>
              </span>
              {#if isLoading && loadingMapId === map.id}
                <span class="loading loading-spinner loading-md text-primary"
                ></span>
              {:else}
                <Link2 class="h-8 w-8 text-primary" />
              {/if}
            </button>
          </li>
        {/each}
      </ul>
    {:else if !isLoading && userMaps.length === 0}
      <p class="mt-4 text-center text-gray-600">You don't have any maps yet.</p>
    {/if}
  </div>
</div>
