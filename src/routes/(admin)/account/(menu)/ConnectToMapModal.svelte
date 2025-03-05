<script lang="ts">
  import { menuStore } from "../../../../stores/menuStore"
  import { connectedMapStore } from "$lib/stores/connectedMapStore"
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
    if (!mapId.trim()) {
      toast.error("Please enter a valid map ID")
      return
    }

    isLoading = true
    loadingMapId = mapId

    try {
      const result = await mapApi.connectToMap(mapId)

      if (result.success) {
        // Fetch map data to update the connectedMapStore
        const { data: mapData, error: mapError } = await supabase
          .from("master_maps")
          .select(
            `
              id,
              map_name,
              master_user_id,
              profiles:master_user_id(full_name)
            `,
          )
          .eq("id", mapId)
          .single()

        if (mapError || !mapData) {
          throw new Error("Failed to fetch map data")
        }

        // Fetch operations
        const { data: operations, error: operationsError } = await supabase
          .from("operations")
          .select("*")
          .eq("master_map_id", mapId)
          .order("year", { ascending: false })

        if (operationsError) {
          throw new Error("Failed to fetch operations")
        }

        // Update stores
        connectedMapStore.set({
          id: mapData.id,
          map_name: mapData.map_name,
          master_user_id: mapData.master_user_id,
          owner: mapData.profiles.full_name,
          is_owner: mapData.master_user_id === $profileStore.id,
          masterSubscription: null, // This would need to be fetched separately
          is_connected: true,
        })

        if (operations && operations.length > 0) {
          operationStore.set(operations)

          // Find the selected operation based on profile
          const selectedOperation =
            operations.find(
              (op) => op.id === $profileStore.selected_operation_id,
            ) || operations[0]

          selectedOperationStore.set(selectedOperation)
        }

        // Update profile
        profileStore.update((profile) => ({
          ...profile,
          master_map_id: mapId,
        }))

        // Close modal
        menuStore.update((store) => ({
          ...store,
          showConnectModal: false,
        }))

        toast.success("Connected to map successfully")
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
