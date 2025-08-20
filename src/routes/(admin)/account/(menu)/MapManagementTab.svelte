<script>
  import { onMount } from "svelte"
  import { v4 as uuidv4 } from "uuid"
  import { connectedMapStore } from "$lib/stores/connectedMapStore"
  import { mapActivityStore } from "$lib/stores/mapActivityStore"
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

        const { mapId, mapName, connectedMap, mapActivity, operation } =
          result.data

        connectedMapStore.set(connectedMap)
        mapActivityStore.set(mapActivity)
        operationStore.set([operation])
        selectedOperationStore.set(operation)

        if ($profileStore) {
          profileStore.update((profile) => ({
            ...profile,
            master_map_id: mapId,
            recent_maps: [mapId, ...(profile.recent_maps || [])].slice(0, 10),
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

        toast.success("Map created successfully")
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

        const { connectedMap, mapActivity, operations, operation } = result.data

        connectedMapStore.set(connectedMap)
        mapActivityStore.set(mapActivity)

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

        toast.success("Connected to map successfully")
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
        toast.success("Map renamed successfully")
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

        toast.success("Map deleted successfully")
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

<div class="space-y-6">
  {#if isLoading}
    <!-- Loading State with Animation -->
    <div
      in:fade={{ duration: 300 }}
      class="flex h-96 w-full items-center justify-center"
    >
      <div class="flex flex-col items-center gap-6">
        <div
          class="relative flex h-16 w-16 items-center justify-center rounded-full bg-blue-500/20"
        >
          <div
            class="absolute inset-0 animate-spin rounded-full border-2 border-blue-400/30 border-t-blue-400"
          ></div>
          <Cloud size={32} class="animate-pulse text-blue-400" />
        </div>
        <div class="text-center">
          <h2 class="text-xl font-medium text-contrast-content">
            {loadingMessage || "Processing..."}
          </h2>
          <p class="mt-2 text-sm text-contrast-content/60">
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
            class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-500/10"
          >
            <Map class="h-8 w-8 text-blue-500" />
          </div>
          <h3 class="mb-2 text-lg font-semibold text-contrast-content">
            Get Started with Maps
          </h3>
          <p class="mb-6 text-sm text-contrast-content/60">
            Create a new map or join an existing one
          </p>

          <div class="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <button
              class="group flex items-center justify-center gap-3 rounded-lg bg-base-content px-6 py-4 text-base-100 transition-colors hover:bg-base-content/90"
              on:click={goToCreateView}
            >
              <div
                class="flex h-8 w-8 items-center justify-center rounded-full bg-base-100/20"
              >
                <Plus class="h-5 w-5" />
              </div>
              <div class="text-left">
                <div class="font-semibold">Create Map</div>
                <div class="text-sm opacity-80">Start a new farm map</div>
              </div>
            </button>
            <button
              class="group flex items-center justify-center gap-3 rounded-lg bg-base-200 px-6 py-4 text-contrast-content transition-colors hover:bg-base-300"
              on:click={goToJoinView}
            >
              <div
                class="flex h-8 w-8 items-center justify-center rounded-full bg-base-100"
              >
                <Search class="h-5 w-5 text-contrast-content/60" />
              </div>
              <div class="text-left">
                <div class="font-semibold">Join Map</div>
                <div class="text-sm text-contrast-content/60">
                  Connect to existing map
                </div>
              </div>
            </button>
          </div>
        </div>
      {:else}
        <!-- Connected - Show Map Options -->
        <div class="space-y-4">
          <!-- Map Info Card -->
          <div class="rounded-lg bg-base-200 p-4">
            <div class="mb-3 flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div
                  class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-green-500/20"
                >
                  <Map class="h-5 w-5 text-green-500" />
                </div>
                <div class="min-w-0 flex-1">
                  <h2 class="truncate font-semibold text-contrast-content">
                    {$connectedMapStore.map_name}
                  </h2>
                  <p class="truncate text-sm text-contrast-content/60">
                    Owned by {$connectedMapStore.owner}
                  </p>
                </div>
              </div>
              {#if isRenaming}
                <div class="flex gap-2">
                  <input
                    type="text"
                    bind:value={newMapNameInput}
                    class="rounded border border-base-300 bg-base-100 px-2 py-1 text-sm outline-none focus:border-base-content"
                  />
                  <button
                    class="rounded bg-green-500 p-1.5 text-white hover:bg-green-600"
                    on:click={handleRenameMap}
                  >
                    <Save class="h-3 w-3" />
                  </button>
                  <button
                    class="hover:bg-base-400 rounded bg-base-300 p-1.5"
                    on:click={() => (isRenaming = false)}
                  >
                    <X class="h-3 w-3" />
                  </button>
                </div>
              {:else if isOwner}
                <button
                  class="rounded-lg bg-base-100 p-1.5 transition-colors hover:bg-base-300"
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

          <!-- Map Actions -->
          <div class="space-y-3">
            <!-- Create New Map Button -->
            <button
              class="flex w-full items-center gap-3 rounded-lg bg-base-200 p-4 text-left transition-colors hover:bg-base-300"
              on:click={goToCreateView}
            >
              <div
                class="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500/20"
              >
                <Plus class="h-4 w-4 text-blue-500" />
              </div>
              <div>
                <div class="text-sm font-medium text-contrast-content">
                  Create New Map
                </div>
                <div class="text-xs text-contrast-content/60">
                  Start a fresh map
                </div>
              </div>
            </button>

            <!-- Switch Map Button -->
            <button
              class="flex w-full items-center gap-3 rounded-lg bg-base-200 p-4 text-left transition-colors hover:bg-base-300"
              on:click={goToJoinView}
            >
              <div
                class="flex h-8 w-8 items-center justify-center rounded-full bg-purple-500/20"
              >
                <Link2 class="h-4 w-4 text-purple-500" />
              </div>
              <div>
                <div class="text-sm font-medium text-contrast-content">
                  Switch Map
                </div>
                <div class="text-xs text-contrast-content/60">
                  Connect to another map
                </div>
              </div>
            </button>

            <!-- Leave Map Button -->
            <button
              class="flex w-full items-center gap-3 rounded-lg bg-base-200 p-4 text-left transition-colors hover:bg-base-300"
              on:click={handleDisconnectFromMap}
              disabled={isLoading}
            >
              <div
                class="flex h-8 w-8 items-center justify-center rounded-full bg-orange-500/20"
              >
                <LogOut class="h-4 w-4 text-orange-500" />
              </div>
              <div>
                <div class="text-sm font-medium text-contrast-content">
                  Leave Map
                </div>
                <div class="text-xs text-contrast-content/60">
                  Disconnect from this map
                </div>
              </div>
            </button>

            <!-- Delete Map Button -->
            {#if isOwner}
              <div class="rounded-lg bg-base-200 p-4 transition-colors">
                <button
                  class="flex w-full items-center justify-between text-left"
                  on:click={() => (showDeleteConfirm = !showDeleteConfirm)}
                >
                  <div class="flex items-center gap-3">
                    <div
                      class="flex h-8 w-8 items-center justify-center rounded-full bg-red-500/20"
                    >
                      <Trash2 class="h-4 w-4 text-red-500" />
                    </div>
                    <div>
                      <div class="text-sm font-medium text-contrast-content">
                        Delete Map
                      </div>
                      <div class="text-xs text-contrast-content/60">
                        Permanently remove
                      </div>
                    </div>
                  </div>
                  <div class="flex items-center">
                    {#if showDeleteConfirm}
                      <ChevronUp class="h-4 w-4 text-contrast-content/60" />
                    {:else}
                      <ChevronDown class="h-4 w-4 text-contrast-content/60" />
                    {/if}
                  </div>
                </button>

                <!-- Delete Confirmation -->
                {#if showDeleteConfirm}
                  <div
                    class="animate-slideDown mt-4 border-t border-red-300 pt-4"
                  >
                    <div class="rounded-lg bg-red-50 p-4">
                      <div class="mb-3 flex items-center gap-2">
                        <AlertTriangle class="h-5 w-5 text-red-500" />
                        <h4 class="font-semibold text-red-700">
                          Delete Map Permanently
                        </h4>
                      </div>
                      <p class="mb-3 text-sm text-red-600">
                        This will permanently delete <strong
                          >{$connectedMapStore.map_name}</strong
                        > and all associated data.
                      </p>
                      <div class="mb-3">
                        <label class="mb-1 block text-sm text-red-600">
                          Type the first 8 characters of the Map ID to confirm:
                        </label>
                        <code class="mb-2 block font-mono text-xs text-red-500">
                          {$connectedMapStore.id.slice(0, 8)}
                        </code>
                        <input
                          type="text"
                          bind:value={confirmationInput}
                          placeholder="Enter confirmation code"
                          class="w-full rounded border border-red-300 bg-white p-2 text-sm outline-none focus:border-red-500"
                        />
                      </div>
                      <div class="flex gap-2">
                        <button
                          class="flex-1 rounded bg-gray-200 py-2 text-sm font-medium transition-colors hover:bg-gray-300"
                          on:click={() => {
                            showDeleteConfirm = false
                            confirmationInput = ""
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          class="flex-1 rounded bg-red-500 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
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
      <div class="space-y-6">
        <!-- Header with Back Button -->
        <div class="flex items-center gap-3">
          <button
            class="flex h-10 w-10 items-center justify-center rounded-lg bg-base-200 transition-colors hover:bg-base-300"
            on:click={goToMainView}
          >
            <ArrowLeft class="h-4 w-4 text-contrast-content" />
          </button>
          <div>
            <h3 class="text-lg font-semibold text-contrast-content">
              Create New Map
            </h3>
            <p class="text-sm text-contrast-content/60">
              Set up a new farm operations map
            </p>
          </div>
        </div>

        <!-- Create Form -->
        <div class="rounded-lg bg-base-200 p-6">
          <div class="space-y-6">
            <div>
              <label
                class="mb-2 block text-sm font-medium text-contrast-content"
              >
                Map Name
              </label>
              <input
                type="text"
                bind:value={newMapName}
                placeholder="e.g. North Field Operations"
                class="w-full rounded-lg border border-base-300 bg-base-100 p-3 text-contrast-content outline-none transition-colors focus:border-base-content"
                autofocus
              />
            </div>

            <div>
              <label
                class="mb-2 block text-sm font-medium text-contrast-content"
              >
                Map ID (Auto-generated)
              </label>
              <div class="rounded-lg border border-base-300 bg-base-100 p-3">
                <code class="font-mono text-sm text-contrast-content/80">
                  {generatedMapId}
                </code>
              </div>
              <p class="mt-1 text-xs text-contrast-content/60">
                Share this ID with team members to let them join your map
              </p>
            </div>

            <div class="flex gap-3">
              <button
                class="flex-1 rounded-lg border border-base-300 bg-base-100 py-3 text-sm font-medium text-contrast-content transition-colors hover:bg-base-300"
                on:click={goToMainView}
              >
                Cancel
              </button>
              <button
                class="flex-1 rounded-lg bg-base-content py-3 text-sm font-medium text-base-100 transition-colors hover:bg-base-content/90 disabled:cursor-not-allowed disabled:opacity-50"
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
      <div class="space-y-6">
        <!-- Header with Back Button -->
        <div class="flex items-center gap-3">
          <button
            class="flex h-10 w-10 items-center justify-center rounded-lg bg-base-200 transition-colors hover:bg-base-300"
            on:click={goToMainView}
          >
            <ArrowLeft class="h-4 w-4 text-contrast-content" />
          </button>
          <div>
            <h3 class="text-lg font-semibold text-contrast-content">
              Join Map
            </h3>
            <p class="text-sm text-contrast-content/60">
              Connect to an existing map
            </p>
          </div>
        </div>

        <!-- Join Form -->
        <div class="rounded-lg bg-base-200 p-6">
          <div class="space-y-6">
            <div>
              <label
                class="mb-2 block text-sm font-medium text-contrast-content"
              >
                Map ID
              </label>
              <input
                type="text"
                bind:value={enteredMapId}
                placeholder="Enter the map ID you want to join"
                class="w-full rounded-lg border border-base-300 bg-base-100 p-3 text-contrast-content outline-none transition-colors focus:border-base-content"
                autofocus
              />
            </div>

            <div class="flex gap-3">
              <button
                class="flex-1 rounded-lg border border-base-300 bg-base-100 py-3 text-sm font-medium text-contrast-content transition-colors hover:bg-base-300"
                on:click={goToMainView}
              >
                Cancel
              </button>
              <button
                class="flex-1 rounded-lg bg-base-content py-3 text-sm font-medium text-base-100 transition-colors hover:bg-base-content/90 disabled:cursor-not-allowed disabled:opacity-50"
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
          <div class="space-y-4">
            {#if recentMaps.length > 0}
              <div>
                <h4
                  class="mb-3 flex items-center gap-2 text-sm font-medium text-contrast-content"
                >
                  <div
                    class="flex h-4 w-4 items-center justify-center rounded-full bg-purple-600/20"
                  >
                    <Clock class="h-2.5 w-2.5 text-purple-600" />
                  </div>
                  Recent Maps
                </h4>
                <div class="space-y-2">
                  {#each recentMaps.slice(0, 3) as map}
                    <button
                      class="group flex w-full items-center gap-3 rounded-lg border border-base-300 bg-base-100 p-4 text-left transition-colors hover:bg-base-300"
                      on:click={() => connectToMap(map.id)}
                    >
                      <div
                        class="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600/20"
                      >
                        <Map class="h-4 w-4 text-blue-600" />
                      </div>
                      <div class="min-w-0 flex-1">
                        <div class="truncate font-medium text-contrast-content">
                          {map.map_name}
                        </div>
                        <div class="text-sm text-contrast-content/60">
                          by {map.owner_name}
                        </div>
                      </div>
                      <Link2
                        class="h-4 w-4 text-contrast-content/60 transition-transform group-hover:translate-x-1"
                      />
                    </button>
                  {/each}
                </div>
              </div>
            {/if}

            {#if userMaps.length > 0}
              <div>
                <h4
                  class="mb-3 flex items-center gap-2 text-sm font-medium text-contrast-content"
                >
                  <div
                    class="flex h-4 w-4 items-center justify-center rounded-full bg-green-600/20"
                  >
                    <User class="h-2.5 w-2.5 text-green-600" />
                  </div>
                  Your Maps
                </h4>
                <div class="space-y-2">
                  {#each userMaps.slice(0, 3) as map}
                    <button
                      class="group flex w-full items-center gap-3 rounded-lg border border-base-300 bg-base-100 p-4 text-left transition-colors hover:bg-base-300"
                      on:click={() => connectToMap(map.id)}
                    >
                      <div
                        class="flex h-8 w-8 items-center justify-center rounded-full bg-green-600/20"
                      >
                        <Map class="h-4 w-4 text-green-600" />
                      </div>
                      <div class="min-w-0 flex-1">
                        <div class="truncate font-medium text-contrast-content">
                          {map.map_name}
                        </div>
                        <div class="text-sm text-contrast-content/60">
                          You own this map
                        </div>
                      </div>
                      <Link2
                        class="h-4 w-4 text-contrast-content/60 transition-transform group-hover:translate-x-1"
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
