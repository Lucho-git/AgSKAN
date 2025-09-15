<script>
  import { onMount } from "svelte"
  import { v4 as uuidv4 } from "uuid"
  import { connectedMapStore } from "$lib/stores/connectedMapStore"
  import { mapActivityStore } from "$lib/stores/mapActivityStore"
  import { trailsMetaDataStore } from "$lib/stores/trailsMetaDataStore"

  import { profileStore } from "$lib/stores/profileStore"
  import {
    operationStore,
    selectedOperationStore,
  } from "$lib/stores/operationStore"
  import { supabase } from "$lib/supabaseClient"
  import { toast } from "svelte-sonner"
  import { mapApi } from "$lib/api/mapApi"
  import { fade } from "svelte/transition"
  import {
    Map,
    Plus,
    Search,
    Edit3,
    Save,
    X,
    Link2,
    LogOut,
    Trash2,
    ChevronDown,
    ChevronUp,
    Clock,
    User,
    AlertTriangle,
    ArrowLeft,
    Cloud,
  } from "lucide-svelte"

  // Accept activeTab as a prop so we can control it from the parent
  export let activeTab

  // Reactive values
  $: isConnected = $connectedMapStore?.id
  $: isOwner = $connectedMapStore?.is_owner

  // State
  let currentView = "main" // 'main', 'create', 'join'
  let isLoading = false
  let loadingAction = null
  let loadingMessage = ""
  let operationStartTime = 0
  const MIN_ANIMATION_TIME = 1500 // 1.5 seconds minimum for loading

  let userMaps = []
  let recentMaps = []
  let newMapName = ""
  let generatedMapId = uuidv4()
  let enteredMapId = ""
  let isRenaming = false
  let newMapNameInput = ""
  let showDeleteConfirm = false
  let confirmationInput = ""

  // Navigation functions
  function goToCreateView() {
    currentView = "create"
    newMapName = ""
    generatedMapId = uuidv4()
  }

  function goToJoinView() {
    currentView = "join"
    enteredMapId = ""
  }

  function goToMainView() {
    currentView = "main"
    showDeleteConfirm = false
    confirmationInput = ""
  }

  async function fetchUserMaps() {
    if (!$profileStore?.id) return

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
      .eq("master_user_id", $profileStore.id)

    if (!error && data) {
      userMaps = data.map((map) => ({
        ...map,
        owner_name: "You",
      }))
    }
  }

  async function fetchRecentMaps() {
    if (!$profileStore?.recent_maps || $profileStore.recent_maps.length === 0)
      return

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
    }
  }

  async function handleCreateMap() {
    if (!newMapName.trim()) {
      toast.error("Please enter a map name")
      return
    }

    isLoading = true
    loadingAction = "create"
    loadingMessage = "Creating your new map..."
    operationStartTime = Date.now()

    try {
      const result = await mapApi.createAndJoinMap(newMapName, generatedMapId)

      if (result.success && result.data) {
        loadingMessage = "Setting up your workspace..."

        const {
          mapId,
          mapName,
          connectedMap,
          mapActivity,
          operation,
          trailsMetadata,
        } = result.data

        connectedMapStore.set(connectedMap)
        mapActivityStore.set(mapActivity)
        operationStore.set([operation])
        selectedOperationStore.set(operation)

        if (trailsMetadata !== undefined) {
          trailsMetaDataStore.set(trailsMetadata)
        }

        if ($profileStore) {
          profileStore.update((profile) => ({
            ...profile,
            master_map_id: mapId,
            recent_maps: [mapId, ...(profile.recent_maps || [])].slice(0, 20),
            selected_operation_id: operation.id,
          }))
        }

        // Ensure minimum animation time
        const elapsedTime = Date.now() - operationStartTime
        const remainingTime = Math.max(0, MIN_ANIMATION_TIME - elapsedTime)

        if (remainingTime > 0) {
          loadingMessage = "Finalizing setup..."
          await new Promise((resolve) => setTimeout(resolve, remainingTime))
        }

        toast.success("Map created ")
        await fetchUserMaps()
        await fetchRecentMaps()

        // Switch to dashboard tab
        activeTab = "dashboard"
        currentView = "main"
      } else {
        toast.error(`Failed to create map: ${result.message}`)
      }
    } catch (error) {
      toast.error(`Error: ${error.message}`)
    } finally {
      isLoading = false
      loadingAction = null
      loadingMessage = ""
    }
  }

  async function connectToMap(mapId) {
    const trimmedMapId = mapId.trim()
    if (!trimmedMapId) {
      toast.error("Please enter a valid map ID")
      return
    }

    isLoading = true
    loadingAction = `connect-${mapId}`
    loadingMessage = "Connecting to map..."
    operationStartTime = Date.now()

    try {
      const result = await mapApi.connectToMap(trimmedMapId)

      if (result.success && result.data) {
        loadingMessage = "Loading map data..."

        const {
          connectedMap,
          mapActivity,
          operations,
          operation,
          trailsMetadata,
        } = result.data

        connectedMapStore.set(connectedMap)
        mapActivityStore.set(mapActivity)

        if (trailsMetadata) {
          trailsMetaDataStore.set(trailsMetadata)
        }

        if (operations && operations.length > 0) {
          operationStore.set(operations)
          selectedOperationStore.set(operation || operations[0])
        }

        profileStore.update((profile) => ({
          ...profile,
          master_map_id: trimmedMapId,
        }))

        // Ensure minimum animation time
        const elapsedTime = Date.now() - operationStartTime
        const remainingTime = Math.max(0, MIN_ANIMATION_TIME - elapsedTime)

        if (remainingTime > 0) {
          loadingMessage = "Almost ready..."
          await new Promise((resolve) => setTimeout(resolve, remainingTime))
        }

        toast.success("Connected to map")
        await fetchUserMaps()
        await fetchRecentMaps()

        // Switch to dashboard tab
        activeTab = "dashboard"
        currentView = "main"
      } else {
        toast.error(`Failed to connect to map: ${result.message}`)
      }
    } catch (error) {
      toast.error(`Error: ${error.message}`)
    } finally {
      isLoading = false
      loadingAction = null
      loadingMessage = ""
    }
  }

  async function handleRenameMap() {
    if (!newMapNameInput.trim()) {
      toast.error("Map name cannot be empty")
      return
    }

    isLoading = true
    loadingAction = "rename"

    try {
      const result = await mapApi.renameMap(
        $connectedMapStore.id,
        newMapNameInput.trim(),
      )

      if (result.success) {
        connectedMapStore.update((store) => ({
          ...store,
          map_name: newMapNameInput.trim(),
        }))
        isRenaming = false
        toast.success("Map renamed")
      } else {
        toast.error(`Failed to rename map: ${result.message}`)
      }
    } catch (error) {
      toast.error(`Error: ${error.message}`)
    } finally {
      isLoading = false
      loadingAction = null
    }
  }

  async function handleDeleteMap() {
    const mapId = $connectedMapStore?.id
    if (
      !mapId ||
      confirmationInput.toLowerCase() !== mapId.slice(0, 8).toLowerCase()
    ) {
      toast.error("Please enter the correct confirmation code")
      return
    }

    isLoading = true
    loadingAction = "delete"

    try {
      const result = await mapApi.deleteMap(mapId)

      if (result.success) {
        connectedMapStore.set({
          id: null,
          map_name: null,
          master_user_id: null,
          owner: null,
          is_owner: false,
          masterSubscription: null,
          is_connected: false,
        })

        mapActivityStore.set({
          marker_count: 0,
          trail_count: 0,
          connected_profiles: [],
          vehicle_states: [],
        })

        operationStore.set([])
        selectedOperationStore.set(null)

        toast.success("Map deleted")
        showDeleteConfirm = false
        confirmationInput = ""
        await fetchUserMaps()
        await fetchRecentMaps()
      } else {
        toast.error(`Failed to delete map: ${result.message}`)
      }
    } catch (error) {
      toast.error(`Error: ${error.message}`)
    } finally {
      isLoading = false
      loadingAction = null
    }
  }

  async function handleDisconnectFromMap() {
    isLoading = true
    loadingAction = "disconnect"

    try {
      const result = await mapApi.disconnectFromMap()

      if (result.success) {
        connectedMapStore.set({
          id: null,
          map_name: null,
          master_user_id: null,
          owner: null,
          is_owner: false,
          masterSubscription: null,
          is_connected: false,
        })

        mapActivityStore.set({
          marker_count: 0,
          trail_count: 0,
          connected_profiles: [],
          vehicle_states: [],
        })

        toast.success("Disconnected from map")
        await fetchUserMaps()
        await fetchRecentMaps()
      } else {
        toast.error(`Failed to disconnect: ${result.message}`)
      }
    } catch (error) {
      toast.error(`Error: ${error.message}`)
    } finally {
      isLoading = false
      loadingAction = null
    }
  }

  onMount(async () => {
    await fetchUserMaps()
    await fetchRecentMaps()
  })
</script>

<div class="space-y-4 sm:space-y-6">
  {#if isLoading}
    <!-- Loading State with Animation -->
    <div
      in:fade={{ duration: 300 }}
      class="flex h-80 w-full items-center justify-center sm:h-96"
    >
      <div class="flex flex-col items-center gap-4 sm:gap-6">
        <div
          class="relative flex h-12 w-12 items-center justify-center rounded-full bg-blue-500/20 sm:h-16 sm:w-16"
        >
          <div
            class="absolute inset-0 animate-spin rounded-full border-2 border-blue-400/30 border-t-blue-400"
          ></div>
          <Cloud size={24} class="animate-pulse text-blue-400 sm:size-8" />
        </div>
        <div class="text-center">
          <h2 class="text-lg font-medium text-contrast-content sm:text-xl">
            {loadingMessage || "Processing..."}
          </h2>
          <p class="mt-1 text-xs text-contrast-content/60 sm:mt-2 sm:text-sm">
            Please wait while we set things up
          </p>
        </div>
      </div>
    </div>
  {:else if currentView === "main"}
    <!-- Main View -->
    <div>
      {#if !isConnected}
        <!-- Not Connected - Show Join/Create Options -->
        <div class="text-center">
          <div
            class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-500/10 sm:mb-4 sm:h-16 sm:w-16"
          >
            <Map class="h-6 w-6 text-blue-500 sm:h-8 sm:w-8" />
          </div>
          <h3
            class="mb-2 text-base font-semibold text-contrast-content sm:text-lg"
          >
            Get Started with Maps
          </h3>
          <p class="mb-4 text-xs text-contrast-content/60 sm:mb-6 sm:text-sm">
            Create a new map or join an existing one
          </p>

          <div class="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <button
              class="group flex items-center justify-center gap-3 rounded-lg bg-base-content px-4 py-3 text-base-100 transition-colors hover:bg-base-content/90 sm:px-6 sm:py-4"
              on:click={goToCreateView}
            >
              <div
                class="flex h-6 w-6 items-center justify-center rounded-full bg-base-100/20 sm:h-8 sm:w-8"
              >
                <Plus class="h-4 w-4 sm:h-5 sm:w-5" />
              </div>
              <div class="text-left">
                <div class="text-sm font-semibold sm:text-base">Create Map</div>
                <div class="text-xs opacity-80 sm:text-sm">
                  Start a new farm map
                </div>
              </div>
            </button>
            <button
              class="group flex items-center justify-center gap-3 rounded-lg bg-base-200 px-4 py-3 text-contrast-content transition-colors hover:bg-base-300 sm:px-6 sm:py-4"
              on:click={goToJoinView}
            >
              <div
                class="flex h-6 w-6 items-center justify-center rounded-full bg-base-100 sm:h-8 sm:w-8"
              >
                <Search
                  class="h-4 w-4 text-contrast-content/60 sm:h-5 sm:w-5"
                />
              </div>
              <div class="text-left">
                <div class="text-sm font-semibold sm:text-base">Join Map</div>
                <div class="text-xs text-contrast-content/60 sm:text-sm">
                  Connect to existing map
                </div>
              </div>
            </button>
          </div>
        </div>
      {:else}
        <!-- Connected - Show Map Options -->
        <div class="space-y-3 sm:space-y-4">
          <!-- Map Info Card -->
          <div class="rounded-lg bg-base-200 p-3 sm:p-4">
            <div class="flex items-center gap-3">
              <div
                class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-green-500/20 sm:h-10 sm:w-10"
              >
                <Map class="h-4 w-4 text-green-500 sm:h-5 sm:w-5" />
              </div>
              <div class="min-w-0 flex-1">
                <h2
                  class="truncate text-sm font-semibold text-contrast-content sm:text-base"
                >
                  {$connectedMapStore.map_name}
                </h2>
                <p class="truncate text-xs text-contrast-content/60 sm:text-sm">
                  Owned by {$connectedMapStore.owner}
                </p>
              </div>
              <!-- Fixed width container for settings button -->
              <div class="flex w-8 justify-end sm:w-10">
                {#if isRenaming}
                  <div class="flex gap-1 sm:gap-2">
                    <input
                      type="text"
                      bind:value={newMapNameInput}
                      class="w-20 rounded border border-base-300 bg-base-100 px-2 py-1 text-xs outline-none focus:border-base-content sm:w-24 sm:text-sm"
                    />
                    <button
                      class="rounded bg-green-500 p-1 text-white hover:bg-green-600 sm:p-1.5"
                      on:click={handleRenameMap}
                    >
                      <Save class="h-3 w-3" />
                    </button>
                    <button
                      class="hover:bg-base-400 rounded bg-base-300 p-1 sm:p-1.5"
                      on:click={() => (isRenaming = false)}
                    >
                      <X class="h-3 w-3" />
                    </button>
                  </div>
                {:else if isOwner}
                  <button
                    class="flex h-7 w-7 items-center justify-center rounded-lg bg-base-100 transition-colors hover:bg-base-300 sm:h-8 sm:w-8"
                    on:click={() => {
                      isRenaming = true
                      newMapNameInput = $connectedMapStore.map_name
                    }}
                  >
                    <Edit3 class="h-3 w-3" />
                  </button>
                {/if}
              </div>
            </div>
          </div>

          <!-- Map Actions -->
          <div class="space-y-2 sm:space-y-3">
            <!-- Create New Map Button -->
            <button
              class="flex w-full items-center gap-3 rounded-lg bg-base-200 p-3 text-left transition-colors hover:bg-base-300 sm:p-4"
              on:click={goToCreateView}
            >
              <div
                class="flex h-7 w-7 items-center justify-center rounded-full bg-blue-500/20 sm:h-8 sm:w-8"
              >
                <Plus class="h-3 w-3 text-blue-500 sm:h-4 sm:w-4" />
              </div>
              <div>
                <div
                  class="text-xs font-medium text-contrast-content sm:text-sm"
                >
                  Create New Map
                </div>
                <div class="text-xs text-contrast-content/60">
                  Start a fresh map
                </div>
              </div>
            </button>

            <!-- Switch Map Button -->
            <button
              class="flex w-full items-center gap-3 rounded-lg bg-base-200 p-3 text-left transition-colors hover:bg-base-300 sm:p-4"
              on:click={goToJoinView}
            >
              <div
                class="flex h-7 w-7 items-center justify-center rounded-full bg-purple-500/20 sm:h-8 sm:w-8"
              >
                <Link2 class="h-3 w-3 text-purple-500 sm:h-4 sm:w-4" />
              </div>
              <div>
                <div
                  class="text-xs font-medium text-contrast-content sm:text-sm"
                >
                  Switch Map
                </div>
                <div class="text-xs text-contrast-content/60">
                  Connect to another map
                </div>
              </div>
            </button>

            <!-- Leave Map Button -->
            <button
              class="flex w-full items-center gap-3 rounded-lg bg-base-200 p-3 text-left transition-colors hover:bg-base-300 sm:p-4"
              on:click={handleDisconnectFromMap}
              disabled={isLoading}
            >
              <div
                class="flex h-7 w-7 items-center justify-center rounded-full bg-orange-500/20 sm:h-8 sm:w-8"
              >
                <LogOut class="h-3 w-3 text-orange-500 sm:h-4 sm:w-4" />
              </div>
              <div>
                <div
                  class="text-xs font-medium text-contrast-content sm:text-sm"
                >
                  Leave Map
                </div>
                <div class="text-xs text-contrast-content/60">
                  Disconnect from this map
                </div>
              </div>
            </button>

            <!-- Delete Map Button -->
            {#if isOwner}
              <div class="rounded-lg bg-base-200 p-3 transition-colors sm:p-4">
                <button
                  class="flex w-full items-center gap-3 text-left"
                  on:click={() => (showDeleteConfirm = !showDeleteConfirm)}
                >
                  <div
                    class="flex h-7 w-7 items-center justify-center rounded-full bg-red-500/20 sm:h-8 sm:w-8"
                  >
                    <Trash2 class="h-3 w-3 text-red-500 sm:h-4 sm:w-4" />
                  </div>
                  <div class="min-w-0 flex-1">
                    <div
                      class="text-xs font-medium text-contrast-content sm:text-sm"
                    >
                      Delete Map
                    </div>
                    <div class="text-xs text-contrast-content/60">
                      Permanently remove
                    </div>
                  </div>
                  <!-- Fixed width container for chevron -->
                  <div class="flex w-6 justify-end">
                    {#if showDeleteConfirm}
                      <ChevronUp
                        class="h-3 w-3 text-contrast-content/60 sm:h-4 sm:w-4"
                      />
                    {:else}
                      <ChevronDown
                        class="h-3 w-3 text-contrast-content/60 sm:h-4 sm:w-4"
                      />
                    {/if}
                  </div>
                </button>

                <!-- Delete Confirmation -->
                {#if showDeleteConfirm}
                  <div
                    class="animate-slideDown mt-3 border-t border-red-300 pt-3 sm:mt-4 sm:pt-4"
                  >
                    <div class="rounded-lg bg-red-50 p-3 sm:p-4">
                      <div class="mb-2 flex items-center gap-2 sm:mb-3">
                        <AlertTriangle
                          class="h-4 w-4 text-red-500 sm:h-5 sm:w-5"
                        />
                        <h4
                          class="text-sm font-semibold text-red-700 sm:text-base"
                        >
                          Delete Map Permanently
                        </h4>
                      </div>
                      <p class="mb-2 text-xs text-red-600 sm:mb-3 sm:text-sm">
                        This will permanently delete <strong
                          >{$connectedMapStore.map_name}</strong
                        > and all associated data.
                      </p>
                      <div class="mb-2 sm:mb-3">
                        <label
                          class="mb-1 block text-xs text-red-600 sm:text-sm"
                        >
                          Type the first 8 characters of the Map ID to confirm:
                        </label>
                        <code
                          class="mb-1 block font-mono text-xs text-red-500 sm:mb-2"
                        >
                          {$connectedMapStore.id.slice(0, 8)}
                        </code>
                        <input
                          type="text"
                          bind:value={confirmationInput}
                          placeholder="Enter confirmation code"
                          class="w-full rounded border border-red-300 bg-white p-2 text-xs outline-none focus:border-red-500 sm:text-sm"
                        />
                      </div>
                      <div class="flex gap-2">
                        <button
                          class="flex-1 rounded bg-gray-200 py-2 text-xs font-medium transition-colors hover:bg-gray-300 sm:text-sm"
                          on:click={() => {
                            showDeleteConfirm = false
                            confirmationInput = ""
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          class="flex-1 rounded bg-red-500 py-2 text-xs font-medium text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
                          on:click={handleDeleteMap}
                          disabled={isLoading ||
                            confirmationInput.toLowerCase() !==
                              $connectedMapStore.id.slice(0, 8).toLowerCase()}
                        >
                          {isLoading && loadingAction === "delete"
                            ? "Deleting..."
                            : "Delete Map"}
                        </button>
                      </div>
                    </div>
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        </div>
      {/if}
    </div>
  {:else if currentView === "create"}
    <!-- Create Map View -->
    <div>
      <div class="space-y-4 sm:space-y-6">
        <!-- Header with Back Button -->
        <div class="flex items-center gap-3">
          <button
            class="flex h-8 w-8 items-center justify-center rounded-lg bg-base-200 transition-colors hover:bg-base-300 sm:h-10 sm:w-10"
            on:click={goToMainView}
          >
            <ArrowLeft class="h-3 w-3 text-contrast-content sm:h-4 sm:w-4" />
          </button>
          <div>
            <h3
              class="text-base font-semibold text-contrast-content sm:text-lg"
            >
              Create New Map
            </h3>
            <p class="text-xs text-contrast-content/60 sm:text-sm">
              Set up a new farm operations map
            </p>
          </div>
        </div>

        <!-- Create Form -->
        <div class="rounded-lg bg-base-200 p-4 sm:p-6">
          <div class="space-y-4 sm:space-y-6">
            <div>
              <label
                class="mb-2 block text-xs font-medium text-contrast-content sm:text-sm"
              >
                Map Name
              </label>
              <input
                type="text"
                bind:value={newMapName}
                placeholder="e.g. North Field Operations"
                class="w-full rounded-lg border border-base-300 bg-base-100 p-2.5 text-xs text-contrast-content outline-none transition-colors focus:border-base-content sm:p-3 sm:text-sm"
                autofocus
              />
            </div>

            <div>
              <label
                class="mb-2 block text-xs font-medium text-contrast-content sm:text-sm"
              >
                Map ID (Auto-generated)
              </label>
              <div
                class="rounded-lg border border-base-300 bg-base-100 p-2.5 sm:p-3"
              >
                <code
                  class="font-mono text-xs text-contrast-content/80 sm:text-sm"
                >
                  {generatedMapId}
                </code>
              </div>
              <p class="mt-1 text-xs text-contrast-content/60">
                Share this ID with team members to let them join your map
              </p>
            </div>

            <div class="flex flex-col gap-2 sm:flex-row sm:gap-3">
              <button
                class="flex-1 rounded-lg border border-base-300 bg-base-100 py-2.5 text-xs font-medium text-contrast-content transition-colors hover:bg-base-300 sm:py-3 sm:text-sm"
                on:click={goToMainView}
              >
                Cancel
              </button>
              <button
                class="flex-1 rounded-lg bg-base-content py-2.5 text-xs font-medium text-base-100 transition-colors hover:bg-base-content/90 disabled:cursor-not-allowed disabled:opacity-50 sm:py-3 sm:text-sm"
                on:click={handleCreateMap}
                disabled={!newMapName.trim()}
              >
                Create Map
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  {:else if currentView === "join"}
    <!-- Join Map View -->
    <div>
      <div class="space-y-4 sm:space-y-6">
        <!-- Header with Back Button -->
        <div class="flex items-center gap-3">
          <button
            class="flex h-8 w-8 items-center justify-center rounded-lg bg-base-200 transition-colors hover:bg-base-300 sm:h-10 sm:w-10"
            on:click={goToMainView}
          >
            <ArrowLeft class="h-3 w-3 text-contrast-content sm:h-4 sm:w-4" />
          </button>
          <div>
            <h3
              class="text-base font-semibold text-contrast-content sm:text-lg"
            >
              Join Map
            </h3>
            <p class="text-xs text-contrast-content/60 sm:text-sm">
              Connect to an existing map
            </p>
          </div>
        </div>

        <!-- Join Form -->
        <div class="rounded-lg bg-base-200 p-4 sm:p-6">
          <div class="space-y-4 sm:space-y-6">
            <div>
              <label
                class="mb-2 block text-xs font-medium text-contrast-content sm:text-sm"
              >
                Map ID
              </label>
              <input
                type="text"
                bind:value={enteredMapId}
                placeholder="Enter the map ID you want to join"
                class="w-full rounded-lg border border-base-300 bg-base-100 p-2.5 text-xs text-contrast-content outline-none transition-colors focus:border-base-content sm:p-3 sm:text-sm"
                autofocus
              />
            </div>

            <div class="flex flex-col gap-2 sm:flex-row sm:gap-3">
              <button
                class="flex-1 rounded-lg border border-base-300 bg-base-100 py-2.5 text-xs font-medium text-contrast-content transition-colors hover:bg-base-300 sm:py-3 sm:text-sm"
                on:click={goToMainView}
              >
                Cancel
              </button>
              <button
                class="flex-1 rounded-lg bg-base-content py-2.5 text-xs font-medium text-base-100 transition-colors hover:bg-base-content/90 disabled:cursor-not-allowed disabled:opacity-50 sm:py-3 sm:text-sm"
                on:click={() => connectToMap(enteredMapId)}
                disabled={!enteredMapId.trim()}
              >
                Join Map
              </button>
            </div>
          </div>
        </div>

        <!-- Quick Access Lists -->
        {#if recentMaps.length > 0 || userMaps.length > 0}
          <div class="space-y-3 sm:space-y-4">
            {#if recentMaps.length > 0}
              <div>
                <h4
                  class="mb-2 flex items-center gap-2 text-xs font-medium text-contrast-content sm:mb-3 sm:text-sm"
                >
                  <div
                    class="flex h-3 w-3 items-center justify-center rounded-full bg-purple-600/20 sm:h-4 sm:w-4"
                  >
                    <Clock class="h-2 w-2 text-purple-600 sm:h-2.5 sm:w-2.5" />
                  </div>
                  Recent Maps
                </h4>
                <div class="space-y-1 sm:space-y-2">
                  {#each recentMaps as map}
                    <button
                      class="group flex w-full items-center gap-2 rounded-lg border border-base-300 bg-base-100 p-3 text-left transition-colors hover:bg-base-300 sm:gap-3 sm:p-4"
                      on:click={() => connectToMap(map.id)}
                    >
                      <div
                        class="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600/20 sm:h-8 sm:w-8"
                      >
                        <Map class="h-3 w-3 text-blue-600 sm:h-4 sm:w-4" />
                      </div>
                      <div class="min-w-0 flex-1">
                        <div
                          class="truncate text-xs font-medium text-contrast-content sm:text-sm"
                        >
                          {map.map_name}
                        </div>
                        <div class="text-xs text-contrast-content/60">
                          by {map.owner_name}
                        </div>
                      </div>
                      <Link2
                        class="h-3 w-3 text-contrast-content/60 transition-transform group-hover:translate-x-1 sm:h-4 sm:w-4"
                      />
                    </button>
                  {/each}
                </div>
              </div>
            {/if}

            {#if userMaps.length > 0}
              <div>
                <h4
                  class="mb-2 flex items-center gap-2 text-xs font-medium text-contrast-content sm:mb-3 sm:text-sm"
                >
                  <div
                    class="flex h-3 w-3 items-center justify-center rounded-full bg-green-600/20 sm:h-4 sm:w-4"
                  >
                    <User class="h-2 w-2 text-green-600 sm:h-2.5 sm:w-2.5" />
                  </div>
                  Your Maps
                </h4>
                <div class="space-y-1 sm:space-y-2">
                  {#each userMaps as map}
                    <button
                      class="group flex w-full items-center gap-2 rounded-lg border border-base-300 bg-base-100 p-3 text-left transition-colors hover:bg-base-300 sm:gap-3 sm:p-4"
                      on:click={() => connectToMap(map.id)}
                    >
                      <div
                        class="flex h-6 w-6 items-center justify-center rounded-full bg-green-600/20 sm:h-8 sm:w-8"
                      >
                        <Map class="h-3 w-3 text-green-600 sm:h-4 sm:w-4" />
                      </div>
                      <div class="min-w-0 flex-1">
                        <div
                          class="truncate text-xs font-medium text-contrast-content sm:text-sm"
                        >
                          {map.map_name}
                        </div>
                        <div class="text-xs text-contrast-content/60">
                          You own this map
                        </div>
                      </div>
                      <Link2
                        class="h-3 w-3 text-contrast-content/60 transition-transform group-hover:translate-x-1 sm:h-4 sm:w-4"
                      />
                    </button>
                  {/each}
                </div>
              </div>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .animate-slideDown {
    animation: slideDown 0.2s ease-out;
  }
</style>
