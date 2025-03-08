<!-- src/routes/(admin)/account/join_map/+page.svelte -->
<script lang="ts">
  import { goto } from "$app/navigation"
  import { Map, User } from "lucide-svelte"
  import { supabase } from "$lib/stores/sessionStore"

  import { profileStore } from "$lib/stores/profileStore"
  import { subscriptionStore } from "$lib/stores/subscriptionStore"
  import { connectedMapStore } from "$lib/stores/connectedMapStore"
  import { mapActivityStore } from "$lib/stores/mapActivityStore"

  import {
    operationStore,
    selectedOperationStore,
  } from "$lib/stores/operationStore.js"
  import { toast } from "svelte-sonner"
  // Import mapApi
  import { mapApi } from "$lib/api/mapApi"

  let formError: string | null = null
  let skipMapId = false
  let joinMapId = ""
  let isValidMapId = false
  let connectedMap: { id: string; map_name: string; owner: string } | null =
    null
  let isLoading = false
  let isJoiningMap = false
  let fullName = ""

  // Check if already connected to a map
  $: hasConnectedMap = $connectedMapStore?.id || connectedMap

  // Computed property for form validation
  $: isFormValid =
    fullName.trim().length > 0 && // Name must not be empty
    (skipMapId || hasConnectedMap) // Either skip map ID or have a connected map

  async function checkMapIdValidity() {
    if (!joinMapId) {
      isValidMapId = false
      return
    }

    const { data: map, error } = await supabase
      .from("master_maps")
      .select("id")
      .eq("id", joinMapId)
      .single()

    isValidMapId = !error && map !== null
  }

  async function handleJoinMap() {
    isJoiningMap = true
    formError = null

    try {
      // Use mapApi instead of direct Supabase calls
      const result = await mapApi.connectToMap(joinMapId)

      if (!result.success) {
        throw new Error(result.message || "Failed to join map")
      }

      // Update local stores using the response data
      connectedMap = {
        id: result.data.connectedMap.id,
        map_name: result.data.connectedMap.map_name,
        owner: result.data.connectedMap.owner,
      }

      // Update the stores with the data from the API response
      connectedMapStore.set(result.data.connectedMap)
      mapActivityStore.set(result.data.mapActivity)

      // Update operation stores if operations are included
      if (result.data.operations && result.data.operations.length > 0) {
        operationStore.set(result.data.operations)

        if (result.data.operation) {
          selectedOperationStore.set(result.data.operation)
        }
      }

      toast.success("Successfully joined map")
    } catch (error) {
      formError = error.message || "Failed to join map"
      toast.error(formError)
    } finally {
      isJoiningMap = false
    }
  }

  async function handleCompleteSetup() {
    isLoading = true
    formError = null

    try {
      const updates = {
        full_name: fullName,
        role: "operator",
        onboarded: true,
        updated_at: new Date().toISOString(),
      }

      if (hasConnectedMap) {
        // Get the first operation for this master map
        const mapId = connectedMap?.id || $connectedMapStore.id

        const { data: operationData, error: operationError } = await supabase
          .from("operations")
          .select("id")
          .eq("master_map_id", mapId)
          .limit(1)
          .single()

        if (!operationError && operationData) {
          updates["selected_operation_id"] = operationData.id

          // Update selected operation in store
          const { data: fullOperation } = await supabase
            .from("operations")
            .select("*")
            .eq("id", operationData.id)
            .single()

          if (fullOperation) {
            operationStore.set([fullOperation])
            selectedOperationStore.set(fullOperation)
          }
        }

        updates["master_map_id"] = mapId
      }

      // Update profile with final settings
      const { error: updateError } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", $profileStore.id)

      if (updateError) {
        throw new Error("Failed to update profile")
      }

      // Update profile store
      profileStore.update((profile) => ({
        ...profile,
        full_name: fullName,
        user_type: "operator",
        master_map_id: hasConnectedMap
          ? connectedMap?.id || $connectedMapStore.id
          : null,
        selected_operation_id: updates["selected_operation_id"] || null,
      }))

      // Update the user's name in the mapActivityStore if connected to a map
      if (hasConnectedMap) {
        mapActivityStore.update((store) => {
          // Find and update the current user's profile in connected_profiles
          const updatedProfiles = store.connected_profiles.map((profile) => {
            if (profile.id === $profileStore.id) {
              return {
                ...profile,
                full_name: fullName,
              }
            }
            return profile
          })

          return {
            ...store,
            connected_profiles: updatedProfiles,
          }
        })
      }

      // Navigate to account homepage
      toast.success("Setup completed successfully!")
      goto("/account")
    } catch (error) {
      formError = error.message || "Failed to complete setup"
      toast.error(formError)
    } finally {
      isLoading = false
    }
  }

  $: {
    if (joinMapId) {
      checkMapIdValidity()
    }
  }
</script>

<div class="min-h-screen bg-base-200 px-4 py-12">
  <div class="mx-auto max-w-xl">
    <div class="mb-16 text-center">
      <h1 class="mb-4 text-5xl font-bold text-base-content">Join Map</h1>
      <p class="text-xl text-base-content/70">Connect to your farm's map</p>
    </div>

    {#if hasConnectedMap}
      <div class="card bg-base-100 shadow-xl">
        <div class="card-body">
          <div class="mb-6 rounded-lg bg-base-200 p-4">
            <h2 class="mb-2 text-lg font-semibold">Connected Map</h2>
            <p class="text-base-content">
              {$connectedMapStore?.map_name || connectedMap?.map_name}
            </p>
            <p class="text-sm opacity-70">
              Owned by {$connectedMapStore?.owner || connectedMap?.owner}
            </p>
          </div>

          <div class="form-control mb-6">
            <label class="label items-center gap-2">
              <User size={18} class="text-base-content/70" />
              <span class="label-text">Full Name</span>
            </label>
            <input
              type="text"
              bind:value={fullName}
              placeholder="Enter your full name"
              class="input input-bordered w-full"
              required
            />
          </div>

          <button
            on:click={handleCompleteSetup}
            class="btn btn-primary w-full"
            disabled={!fullName.trim() || isLoading}
          >
            {#if isLoading}
              <span class="loading loading-spinner"></span>
            {/if}
            Continue
          </button>
        </div>
      </div>
    {:else}
      {#if formError}
        <div class="alert alert-error mb-6">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-6 w-6 shrink-0 stroke-current"
            fill="none"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span>{formError}</span>
        </div>
      {/if}

      <div class="card bg-base-100 shadow-xl">
        <div class="card-body">
          <div class="form-control mb-6">
            <label class="label items-center gap-2">
              <User size={18} class="text-base-content/70" />
              <span class="label-text">Full Name</span>
            </label>
            <input
              type="text"
              bind:value={fullName}
              placeholder="Enter your full name"
              class="input input-bordered w-full"
              required
            />
          </div>

          {#if !skipMapId}
            <div class="form-control mb-6">
              <label class="label items-center gap-2">
                <Map size={18} class="text-base-content/70" />
                <span class="label-text">Map ID</span>
              </label>
              <div class="flex gap-2">
                <input
                  type="text"
                  bind:value={joinMapId}
                  placeholder="Enter map ID"
                  class="input input-bordered flex-1"
                  required={!skipMapId}
                  on:input={checkMapIdValidity}
                />
                <button
                  type="button"
                  class="btn btn-primary"
                  disabled={!isValidMapId || isJoiningMap}
                  on:click={handleJoinMap}
                >
                  {#if isJoiningMap}
                    <span class="loading loading-spinner" />
                  {/if}
                  Join
                </button>
              </div>
              {#if joinMapId && !isValidMapId}
                <label class="label">
                  <span class="label-text-alt text-error">Invalid Map ID</span>
                </label>
              {/if}
            </div>
          {/if}

          <div class="form-control mb-6">
            <label class="label cursor-pointer justify-start gap-2">
              <input
                type="checkbox"
                bind:checked={skipMapId}
                class="checkbox checkbox-sm"
              />
              <span class="label-text">I'll add my map ID later</span>
            </label>
          </div>

          <button
            on:click={handleCompleteSetup}
            class="btn btn-primary w-full"
            disabled={!isFormValid || isLoading}
          >
            {#if isLoading}
              <span class="loading loading-spinner"></span>
            {/if}
            {skipMapId ? "Continue Setup" : "Complete Setup"}
          </button>
        </div>
      </div>
    {/if}
  </div>
</div>
