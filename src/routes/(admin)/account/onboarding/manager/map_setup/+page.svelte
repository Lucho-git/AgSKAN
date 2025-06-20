<!-- src/routes/(admin)/account/onboarding/manager/map_setup/+page.svelte -->
<script lang="ts">
  import { goto } from "$app/navigation"
  import {
    ArrowRight,
    Map,
    Layers,
    Settings,
    CheckCircle,
    Link2,
  } from "lucide-svelte"
  import { v4 as uuidv4 } from "uuid"
  import { toast } from "svelte-sonner"
  import { mapApi } from "$lib/api/mapApi"
  import { mapActivityStore } from "$lib/stores/mapActivityStore"
  import { connectedMapStore } from "$lib/stores/connectedMapStore"
  import { profileStore } from "$lib/stores/profileStore"
  import {
    operationStore,
    selectedOperationStore,
  } from "$lib/stores/operationStore"
  import { supabase } from "$lib/stores/sessionStore"
  import { onMount } from "svelte"

  let isCreatingMap = false
  let mapName = ""
  let error = ""
  let mapCode = ""
  let showSuccess = false
  let isLoading = false
  let dataLoaded = false
  let userMaps = []
  let loadingMapId = null

  // Check if already connected to a map
  $: hasConnectedMap = $connectedMapStore?.id

  onMount(async () => {
    // Load user's owned maps
    await loadUserMaps()
    dataLoaded = true
  })

  async function loadUserMaps() {
    if (!$profileStore?.id) return

    try {
      const { data, error } = await supabase
        .from("master_maps")
        .select(
          `
          id, 
          map_name, 
          master_user_id,
          created_at
        `,
        )
        .eq("master_user_id", $profileStore.id)
        .order("created_at", { ascending: false })

      if (error) {
        console.error("Error fetching user maps:", error)
      } else {
        userMaps = data || []
      }
    } catch (error) {
      console.error("Error loading user maps:", error)
    }
  }

  async function connectToExistingMap(mapId) {
    isLoading = true
    loadingMapId = mapId

    try {
      const result = await mapApi.connectToMap(mapId)

      if (result.success && result.data) {
        const { connectedMap, mapActivity, operations, operation } = result.data

        // Update all stores
        connectedMapStore.set(connectedMap)
        mapActivityStore.set(mapActivity)

        if (operations && operations.length > 0) {
          operationStore.set(operations)
          selectedOperationStore.set(operation || operations[0])
        }

        // Update profile store
        if ($profileStore) {
          let recentMaps = $profileStore.recent_maps || []
          recentMaps = recentMaps.filter((id) => id !== mapId)
          recentMaps.unshift(mapId)
          recentMaps = recentMaps.slice(0, 10)

          profileStore.update((profile) => ({
            ...profile,
            master_map_id: mapId,
            recent_maps: recentMaps,
            selected_operation_id: operation?.id || null,
          }))
        }

        toast.success("Connected to existing map successfully")
        goto("/account/onboarding/manager/boundary_upload")
      } else {
        toast.error("Failed to connect to map", {
          description: result.message,
        })
      }
    } catch (error) {
      console.error("Error connecting to map:", error)
      toast.error("An error occurred", {
        description: error.message,
      })
    } finally {
      isLoading = false
      loadingMapId = null
    }
  }

  function handleCreateMap() {
    isCreatingMap = true
    mapCode = uuidv4()
  }

  async function handleSubmitMap(e: Event) {
    e.preventDefault()

    if (!mapName.trim()) {
      error = "Please enter a map name"
      return
    }

    isLoading = true

    try {
      const result = await mapApi.createAndJoinMap(mapName, mapCode)

      if (result.success && result.data) {
        const {
          mapId,
          mapName: createdMapName,
          connectedMap,
          mapActivity,
          operation,
        } = result.data

        // Update all stores using the data structures from the API
        connectedMapStore.set(connectedMap)
        mapActivityStore.set(mapActivity)
        operationStore.set([operation])
        selectedOperationStore.set(operation)

        // Update the profile store with the new map connection
        if ($profileStore) {
          // Update recent maps in the profile store
          let recentMaps = $profileStore.recent_maps || []
          recentMaps = recentMaps.filter((id) => id !== mapId)
          recentMaps.unshift(mapId)
          recentMaps = recentMaps.slice(0, 10)

          profileStore.update((profile) => ({
            ...profile,
            master_map_id: mapId,
            recent_maps: recentMaps,
            selected_operation_id: operation.id,
          }))
        }

        toast.success("Map created successfully", {
          description: "You have been connected to your new map",
        })

        // Show success message briefly
        showSuccess = true

        // Navigate to next step after 2 seconds
        setTimeout(() => {
          goto("/account/onboarding/manager/boundary_upload")
        }, 2000)
      } else {
        toast.error("Failed to create map", {
          description: result.message,
        })
        error = result.message || "Failed to create map"
      }
    } catch (error) {
      console.error("Error creating map:", error)
      toast.error("An error occurred", {
        description: error.message,
      })
      error = error.message || "An error occurred while creating the map"
    } finally {
      isLoading = false
    }
  }

  function handleSkip() {
    // Skip map creation and go to team invite
    goto("/account/onboarding/manager/team_invite")
  }

  function handleInputChange(value: string) {
    mapName = value
    if (error) error = ""
  }
</script>

<svelte:head>
  <title>Map Setup - AgSKAN</title>
  <meta name="description" content="Set up your farm mapping interface" />
</svelte:head>

<!-- Header -->
<div class="mb-12 text-center">
  <h2 class="mb-3 text-4xl font-bold text-contrast-content">
    Farm <span class="text-base-content">Map Setup</span>
  </h2>
  <p class="mx-auto max-w-md text-contrast-content/60">
    {hasConnectedMap
      ? "You're already connected to a map"
      : "Set up your interactive farm map to visualize and manage field operations"}
  </p>

  <!-- Skip option -->
  <button
    on:click={handleSkip}
    class="group mx-auto mt-4 flex items-center gap-2 rounded-md border border-base-content/10 bg-base-200 px-4 py-2 text-sm text-contrast-content/60 shadow-sm transition-all duration-300 hover:border-base-content/50 hover:bg-base-content/5 hover:text-base-content hover:shadow"
    disabled={isLoading}
  >
    <span>Skip for now</span>
    <ArrowRight
      size={14}
      class="text-base-content/40 transition-all group-hover:translate-x-0.5 group-hover:text-base-content"
    />
  </button>
</div>

<!-- Loading state -->
{#if !dataLoaded}
  <div class="flex justify-center py-8">
    <div class="flex items-center gap-3 text-contrast-content/60">
      <span class="loading loading-spinner loading-sm"></span>
      <span>Loading your maps...</span>
    </div>
  </div>
{:else if showSuccess}
  <!-- Success Message -->
  <div
    class="animate-fadeIn relative mx-auto max-w-md overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-xl"
  >
    <!-- Card header decoration -->
    <div
      class="h-1.5 w-full bg-gradient-to-r from-base-content/80 via-base-content to-base-content/80"
    ></div>

    <div class="p-8">
      <div class="flex flex-col items-center text-center">
        <div class="mb-4 rounded-full bg-success/20 p-4 text-success">
          <CheckCircle size={32} />
        </div>
        <h3 class="mb-2 text-xl font-bold text-contrast-content">
          Map Created Successfully!
        </h3>
        <p class="text-sm text-contrast-content/60">
          Taking you to boundary upload...
        </p>
      </div>
    </div>
  </div>
{:else if hasConnectedMap}
  <!-- Already Connected Map -->
  <div
    class="relative mx-auto max-w-md overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-xl"
  >
    <!-- Card header decoration -->
    <div
      class="h-1.5 w-full bg-gradient-to-r from-success/80 via-success to-success/80"
    ></div>

    <div class="p-8">
      <div class="mb-6 flex flex-col items-center text-center">
        <div class="mb-4 rounded-full bg-success/20 p-4 text-success">
          <CheckCircle size={32} />
        </div>
        <h3 class="mb-2 text-xl font-bold text-contrast-content">
          Already Connected to Map
        </h3>
        <p class="mb-4 text-sm text-contrast-content/60">
          You're currently connected to your map
        </p>

        <!-- Connected Map Info -->
        <div class="w-full rounded-xl bg-base-200 p-4">
          <div class="mb-2 flex items-center gap-3">
            <div class="rounded-md bg-base-content/20 p-2 text-base-content">
              <Map size={16} />
            </div>
            <span class="font-semibold text-contrast-content">
              {$connectedMapStore.map_name}
            </span>
          </div>
          <p class="text-sm text-contrast-content/60">
            Map ID: {$connectedMapStore.id}
          </p>
        </div>
      </div>

      <button
        on:click={() => goto("/account/onboarding/manager/boundary_upload")}
        class="flex w-full transform items-center justify-center gap-2 rounded-xl bg-success py-3 font-semibold text-base-100 shadow-lg shadow-success/20 transition-all hover:-translate-y-0.5 hover:bg-success/90"
      >
        <span>Continue to Boundary Upload</span>
        <ArrowRight size={18} />
      </button>
    </div>
  </div>
{:else if userMaps.length > 0}
  <!-- Existing Maps List -->
  <div
    class="relative mx-auto max-w-md overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-xl"
  >
    <!-- Card header decoration -->
    <div
      class="h-1.5 w-full bg-gradient-to-r from-base-content/80 via-base-content to-base-content/80"
    ></div>

    <div class="p-8">
      <div class="mb-6 flex flex-col items-center text-center">
        <div class="mb-4 rounded-full bg-base-content/20 p-4 text-base-content">
          <Map size={32} />
        </div>
        <h3 class="mb-2 text-xl font-bold text-contrast-content">
          Your Existing Maps
        </h3>
        <p class="text-sm text-contrast-content/60">
          Select one of your existing maps to continue
        </p>
      </div>

      <!-- Existing Maps List -->
      <div class="space-y-3">
        {#each userMaps as map, index}
          <button
            on:click={() => connectToExistingMap(map.id)}
            disabled={isLoading}
            class="flex w-full items-center justify-between rounded-xl p-4 transition-all {index %
              2 ===
            0
              ? 'bg-base-200'
              : 'bg-base-300'} hover:bg-base-content/10 disabled:opacity-50"
          >
            <div class="flex flex-col items-start">
              <div class="flex items-center gap-2">
                <Map size={16} class="text-base-content" />
                <span class="font-medium text-contrast-content">
                  {map.map_name}
                </span>
              </div>
              <span class="text-xs text-contrast-content/60">
                Created {new Date(map.created_at).toLocaleDateString()}
              </span>
            </div>
            {#if isLoading && loadingMapId === map.id}
              <span class="loading loading-spinner loading-sm"></span>
            {:else}
              <Link2 size={18} class="text-base-content" />
            {/if}
          </button>
        {/each}
      </div>
    </div>
  </div>
{:else if !isCreatingMap}
  <!-- Create Map Card (No existing maps) -->
  <div
    class="relative mx-auto max-w-md overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-xl"
  >
    <!-- Card header decoration -->
    <div
      class="h-1.5 w-full bg-gradient-to-r from-base-content/80 via-base-content to-base-content/80"
    ></div>

    <div class="p-8">
      <div class="mb-6 flex flex-col items-center text-center">
        <div class="mb-4 rounded-full bg-base-content/20 p-4 text-base-content">
          <Map size={32} />
        </div>
        <h3 class="mb-2 text-xl font-bold text-contrast-content">
          Create Your First Map
        </h3>
        <p class="text-sm text-contrast-content/60">
          Start by creating a map for your farm operations
        </p>
      </div>

      <button
        on:click={handleCreateMap}
        class="flex w-full transform items-center justify-center gap-2 rounded-xl bg-base-content py-3 font-semibold text-base-100 shadow-lg shadow-base-content/20 transition-all hover:-translate-y-0.5 hover:bg-base-content/90"
        disabled={isLoading}
      >
        <Map size={18} />
        <span>Create New Map</span>
      </button>
    </div>
  </div>
{:else}
  <!-- Create Map Form -->
  <div
    class="animate-fadeIn relative mx-auto max-w-md overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-xl"
  >
    <!-- Card header decoration -->
    <div
      class="h-1.5 w-full bg-gradient-to-r from-base-content/80 via-base-content to-base-content/80"
    ></div>

    <div class="p-8">
      <div class="mb-6 flex flex-col items-center">
        <div class="mb-4 flex items-center gap-3">
          <div class="rounded-md bg-base-200 p-2 text-base-content">
            <Map size={20} />
          </div>
          <h3 class="text-xl font-bold text-contrast-content">
            Create New Map
          </h3>
        </div>

        <!-- Map Code Display -->
        <div class="mx-auto mb-2 w-full max-w-xs">
          <div
            class="rounded-full bg-info/20 px-4 py-2 text-center font-mono text-sm text-info"
          >
            {mapCode}
          </div>
        </div>
      </div>

      <form on:submit={handleSubmitMap} class="space-y-6">
        <div class="space-y-2">
          <label
            class="mb-2 flex items-center gap-2 text-sm font-medium text-contrast-content/80"
          >
            <div class="rounded-md bg-base-200 p-1.5 text-base-content">
              <Layers size={14} />
            </div>
            Map Name
          </label>
          <div
            class="relative transition-all duration-300 {error
              ? 'animate-shake'
              : ''}"
          >
            <input
              type="text"
              bind:value={mapName}
              on:input={(e) => handleInputChange(e.target.value)}
              placeholder="e.g. North Field Operations"
              disabled={isLoading}
              class="w-full border bg-base-200 {error
                ? 'border-error'
                : 'border-base-300 focus:border-base-content'} rounded-xl p-4 text-contrast-content transition-colors placeholder:text-contrast-content/50 focus:outline-none focus:ring-1 focus:ring-base-content disabled:opacity-50"
            />
            {#if error}
              <p
                class="ml-1 mt-1.5 flex items-center gap-1.5 text-xs text-error"
              >
                <span class="inline-block h-1 w-1 rounded-full bg-error"></span>
                {error}
              </p>
            {/if}
          </div>
        </div>

        <div class="pt-4">
          <button
            type="submit"
            disabled={isLoading}
            class="flex w-full transform items-center justify-center gap-2 rounded-xl bg-base-content py-3 font-semibold text-base-100 shadow-lg shadow-base-content/20 transition-all hover:-translate-y-0.5 hover:bg-base-content/90 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
          >
            {#if isLoading}
              <div
                class="h-4 w-4 animate-spin rounded-full border-2 border-base-100 border-t-transparent"
              ></div>
            {/if}
            <span>{isLoading ? "Creating Map..." : "Create Map"}</span>
          </button>
        </div>
      </form>

      <div
        class="mt-6 flex items-center justify-center gap-2 border-t border-base-300 pt-4 text-xs text-contrast-content/60"
      >
        <Settings size={12} />
        <span>Advanced settings available after creation</span>
      </div>
    </div>
  </div>
{/if}

<style>
  @keyframes shake {
    0%,
    100% {
      transform: translateX(0);
    }
    25% {
      transform: translateX(-5px);
    }
    75% {
      transform: translateX(5px);
    }
  }

  .animate-shake {
    animation: shake 0.3s ease-in-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  .animate-fadeIn {
    animation: fadeIn 0.2s ease-out;
  }
</style>
