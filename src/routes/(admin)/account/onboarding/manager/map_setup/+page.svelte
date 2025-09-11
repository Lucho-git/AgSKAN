<script lang="ts">
  import { goto } from "$app/navigation"
  import {
    ArrowRight,
    Map,
    Layers,
    Settings,
    CheckCircle,
    Link2,
    Check,
    Cloud,
    X,
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
  import { onMount, onDestroy } from "svelte"

  let isCreatingMap = false
  let mapName = ""
  let error = ""
  let mapCode = ""
  let isLoading = false
  let dataLoaded = false
  let userMaps = []
  let loadingMapId = null
  let createMapStatus = null // 'loading' | 'success' | null
  let connectMapStatus = {} // { [mapId]: 'loading' | 'success' }
  let isDisconnecting = false

  // Animation timing
  let operationStartTime = 0
  const MIN_ANIMATION_TIME = 2000 // 2 seconds minimum
  const SUCCESS_DISPLAY_TIME = 2500 // 2.5 seconds for success state

  // Prevent reactive switching during animations
  let isInActiveFlow = false

  // Check if already connected to a map - BUT NOT during active flows
  $: hasConnectedMap = $connectedMapStore?.id && !isInActiveFlow

  onMount(async () => {
    await loadUserMaps()
    dataLoaded = true
  })

  async function loadUserMaps() {
    if (!$profileStore?.id) return

    try {
      const { data, error } = await supabase
        .from("master_maps")
        .select(`id, map_name, master_user_id, created_at`)
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

  async function handleDisconnectMap() {
    isDisconnecting = true

    try {
      // Clear connected map from stores
      connectedMapStore.set(null)
      mapActivityStore.set(null)
      operationStore.set([])
      selectedOperationStore.set(null)

      // Update profile store to remove map connection
      if ($profileStore) {
        profileStore.update((profile) => ({
          ...profile,
          master_map_id: null,
          selected_operation_id: null,
        }))
      }

      toast.success("Disconnected from map", {
        description: "You can now connect to a different map",
      })

      // Reload user maps to show available options
      await loadUserMaps()
    } catch (error) {
      console.error("Error disconnecting from map:", error)
      toast.error("Failed to disconnect from map")
    } finally {
      isDisconnecting = false
    }
  }

  async function connectToExistingMap(mapId) {
    // Prevent reactive switching
    isInActiveFlow = true

    operationStartTime = Date.now()
    isLoading = true
    loadingMapId = mapId
    connectMapStatus[mapId] = "loading"

    try {
      const result = await mapApi.connectToMap(mapId)

      const elapsedTime = Date.now() - operationStartTime
      const remainingTime = Math.max(0, MIN_ANIMATION_TIME - elapsedTime)

      if (remainingTime > 0) {
        await new Promise((resolve) => setTimeout(resolve, remainingTime))
      }

      if (result.success && result.data) {
        const { connectedMap, mapActivity, operations, operation } = result.data

        // Update stores
        connectedMapStore.set(connectedMap)
        mapActivityStore.set(mapActivity)

        if (operations && operations.length > 0) {
          operationStore.set(operations)
          selectedOperationStore.set(operation || operations[0])
        }

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

        // Show success animation in the SAME component
        connectMapStatus[mapId] = "success"
        toast.success("Connected to existing map successfully")

        // Navigate after success animation
        setTimeout(() => {
          goto("/account/onboarding/manager/boundary_upload")
        }, SUCCESS_DISPLAY_TIME)
      } else {
        connectMapStatus[mapId] = null
        isInActiveFlow = false
        toast.error("Failed to connect to map", {
          description: result.message,
        })
      }
    } catch (error) {
      console.error("Error connecting to map:", error)
      connectMapStatus[mapId] = null
      isInActiveFlow = false
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

    // Prevent reactive switching
    isInActiveFlow = true

    operationStartTime = Date.now()
    isLoading = true
    createMapStatus = "loading"

    try {
      const result = await mapApi.createAndJoinMap(mapName, mapCode)

      const elapsedTime = Date.now() - operationStartTime
      const remainingTime = Math.max(0, MIN_ANIMATION_TIME - elapsedTime)

      if (remainingTime > 0) {
        await new Promise((resolve) => setTimeout(resolve, remainingTime))
      }

      if (result.success && result.data) {
        const {
          mapId,
          mapName: createdMapName,
          connectedMap,
          mapActivity,
          operation,
        } = result.data

        // Update stores
        connectedMapStore.set(connectedMap)
        mapActivityStore.set(mapActivity)
        operationStore.set([operation])
        selectedOperationStore.set(operation)

        if ($profileStore) {
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

        // Show success animation in the SAME component
        createMapStatus = "success"
        toast.success("Map created successfully")

        // Navigate after success animation
        setTimeout(() => {
          goto("/account/onboarding/manager/boundary_upload")
        }, SUCCESS_DISPLAY_TIME)
      } else {
        createMapStatus = null
        isInActiveFlow = false
        toast.error("Failed to create map", {
          description: result.message,
        })
        error = result.message || "Failed to create map"
      }
    } catch (error) {
      console.error("Error creating map:", error)
      createMapStatus = null
      isInActiveFlow = false
      toast.error("An error occurred", {
        description: error.message,
      })
      error = error.message || "An error occurred while creating the map"
    } finally {
      isLoading = false
    }
  }

  function handleContinueNow() {
    goto("/account/onboarding/manager/boundary_upload")
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

<!-- Header - compact for single page view -->
<div class="mb-4 px-4 text-center md:mb-6">
  <h2 class="mb-2 text-2xl font-bold text-contrast-content md:text-3xl">
    Farm <span class="text-base-content">Map Setup</span>
  </h2>
  <p class="mx-auto max-w-md px-2 text-sm text-contrast-content/60">
    {hasConnectedMap
      ? "You're already connected to a map"
      : "Set up your interactive farm map to manage field operations"}
  </p>
</div>

{#if !dataLoaded}
  <div class="flex justify-center py-6">
    <div class="flex items-center gap-3 text-contrast-content/60">
      <span class="loading loading-spinner loading-sm"></span>
      <span class="text-sm">Loading your maps...</span>
    </div>
  </div>
{:else if hasConnectedMap}
  <!-- Already connected - with disconnect option -->
  <div
    class="animate-setup-fadeIn relative mx-4 mx-auto max-w-sm overflow-hidden rounded-xl border border-base-300 bg-base-100 shadow-xl md:max-w-lg"
  >
    <div class="h-1 w-full bg-base-content"></div>
    <div class="p-4 md:p-6">
      <div class="mb-4 flex flex-col items-center text-center md:mb-5">
        <div
          class="animate-setup-successPulse mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-500/20 shadow-lg shadow-green-500/10 md:h-16 md:w-16"
        >
          <div
            class="animate-setup-checkScale flex h-10 w-10 items-center justify-center rounded-full bg-green-500 md:h-14 md:w-14"
          >
            <Check
              size={20}
              class="animate-setup-checkDraw stroke-[3] text-white md:h-6 md:w-6"
            />
          </div>
        </div>
        <h3 class="mb-2 text-lg font-bold text-contrast-content md:text-xl">
          Map Setup Complete
        </h3>
        <p class="mb-3 text-xs text-contrast-content/60 md:text-sm">
          You're connected to your farm map
        </p>

        <!-- Connected Map Info with Disconnect Button -->
        <div class="relative mb-4 w-full rounded-lg bg-base-200 p-3">
          <div class="mb-2 flex items-center gap-2">
            <div class="rounded-md bg-base-content/20 p-1.5 text-base-content">
              <Map size={14} />
            </div>
            <span class="pr-6 text-sm font-semibold text-contrast-content">
              {$connectedMapStore.map_name}
            </span>
          </div>
          <p class="text-xs text-contrast-content/60">
            <span class="hidden sm:inline"
              >Map ID:
            </span>{$connectedMapStore.id}
          </p>

          <!-- Disconnect Button -->
          <button
            on:click={handleDisconnectMap}
            disabled={isDisconnecting}
            class="absolute right-2 top-2 rounded-full bg-base-content/10 p-1 text-base-content/60 transition-all duration-200 hover:bg-base-content/20 hover:text-base-content disabled:opacity-50"
            title="Disconnect from this map"
          >
            {#if isDisconnecting}
              <span class="loading loading-spinner loading-xs"></span>
            {:else}
              <X size={12} />
            {/if}
          </button>
        </div>
      </div>

      <button
        on:click={handleContinueNow}
        disabled={isDisconnecting}
        class="flex w-full transform items-center justify-center gap-2 rounded-lg bg-base-content py-2.5 text-sm font-semibold text-base-100 shadow-lg shadow-base-content/20 transition-all hover:-translate-y-0.5 hover:bg-base-content/90 disabled:opacity-50 disabled:hover:translate-y-0"
      >
        <span class="hidden sm:inline">Continue to Boundary Upload</span>
        <span class="sm:hidden">Continue</span>
        <ArrowRight size={16} />
      </button>
    </div>
  </div>
{:else if userMaps.length > 0}
  <!-- Existing Maps - Success animations play HERE -->
  <div
    class="animate-setup-fadeIn relative mx-4 mx-auto max-w-sm overflow-hidden rounded-xl border border-base-300 bg-base-100 shadow-xl md:max-w-lg"
  >
    <div class="h-1 w-full bg-base-content"></div>
    <div class="p-4 md:p-6">
      <div class="mb-4 flex flex-col items-center text-center md:mb-5">
        <div class="mb-3 rounded-full bg-base-content/20 p-3 text-base-content">
          <Map size={24} class="md:h-7 md:w-7" />
        </div>
        <h3 class="mb-2 text-lg font-bold text-contrast-content md:text-xl">
          Your Existing Maps
        </h3>
        <p class="text-xs text-contrast-content/60 md:text-sm">
          Select one of your existing maps to continue
        </p>
      </div>

      <div class="space-y-2 md:space-y-3">
        {#each userMaps as map, index}
          <div
            class="flex w-full items-center justify-between rounded-lg border-2 p-3 transition-all {connectMapStatus[
              map.id
            ] === 'success'
              ? 'border-success/30 bg-success/5 shadow-md shadow-success/10'
              : connectMapStatus[map.id] === 'loading'
                ? 'border-info/30 bg-info/5'
                : index % 2 === 0
                  ? 'border-transparent bg-base-200 hover:bg-base-content/10'
                  : 'border-transparent bg-base-300 hover:bg-base-content/10'} {connectMapStatus[
              map.id
            ]
              ? 'cursor-default'
              : 'cursor-pointer'}"
            on:click={() => {
              if (!connectMapStatus[map.id]) {
                connectToExistingMap(map.id)
              }
            }}
            role="button"
            tabindex="0"
          >
            {#if connectMapStatus[map.id] === "success"}
              <div class="animate-setup-scaleIn flex flex-col items-start">
                <div class="flex items-center gap-2">
                  <div
                    class="animate-setup-successPulse flex h-3 w-3 items-center justify-center rounded-full bg-green-500/20 md:h-4 md:w-4"
                  >
                    <div
                      class="animate-setup-checkScale flex h-2 w-2 items-center justify-center rounded-full bg-green-500 md:h-3 md:w-3"
                    >
                      <Check
                        size={8}
                        class="animate-setup-checkDraw stroke-[3] text-white md:h-2.5 md:w-2.5"
                      />
                    </div>
                  </div>
                  <span class="text-sm font-medium text-contrast-content">
                    {map.map_name}
                  </span>
                </div>
                <span
                  class="animate-setup-delayedFadeIn ml-5 text-xs text-green-600"
                  >Connected successfully!</span
                >
              </div>
              <span class="text-xs text-green-600">
                <span class="hidden sm:inline">Redirecting...</span>
                <span class="sm:hidden">✓</span>
              </span>
            {:else if connectMapStatus[map.id] === "loading"}
              <div class="animate-setup-scaleIn flex flex-col items-start">
                <div class="flex items-center gap-2">
                  <div
                    class="relative flex h-3 w-3 items-center justify-center rounded-full bg-blue-500/20 md:h-4 md:w-4"
                  >
                    <div
                      class="animate-setup-spin absolute inset-0 rounded-full border border-blue-400/30 border-t-blue-400"
                    ></div>
                    <Cloud
                      size={6}
                      class="animate-setup-pulse text-blue-400 md:h-2 md:w-2"
                    />
                  </div>
                  <span class="text-sm font-medium text-contrast-content">
                    {map.map_name}
                  </span>
                </div>
                <span
                  class="animate-setup-delayedFadeIn ml-5 text-xs text-info"
                >
                  Connecting...
                </span>
              </div>
              <span class="loading loading-spinner loading-sm"></span>
            {:else}
              <div class="flex flex-col items-start">
                <div class="flex items-center gap-2">
                  <Map size={14} class="text-base-content" />
                  <span class="text-sm font-medium text-contrast-content">
                    {map.map_name}
                  </span>
                </div>
                <span class="text-xs text-contrast-content/60">
                  <span class="hidden sm:inline">Created </span>{new Date(
                    map.created_at,
                  ).toLocaleDateString()}
                </span>
              </div>
              <Link2 size={16} class="text-base-content" />
            {/if}
          </div>
        {/each}
      </div>
    </div>
  </div>
{:else}
  <!-- Create Map - Success animations play HERE -->
  <div
    class="animate-setup-fadeIn relative mx-4 mx-auto max-w-sm overflow-hidden rounded-xl border border-base-300 bg-base-100 shadow-xl md:max-w-lg"
  >
    <div class="h-1 w-full bg-base-content"></div>
    <div class="p-4 transition-all duration-500 ease-in-out md:p-6">
      {#if createMapStatus === "success"}
        <!-- SUCCESS IN THIS COMPONENT -->
        <div
          class="animate-setup-scaleIn flex flex-col items-center gap-3 md:gap-4"
        >
          <div
            class="animate-setup-successPulse flex h-12 w-12 items-center justify-center rounded-full bg-green-500/20 shadow-lg shadow-green-500/10 md:h-16 md:w-16"
          >
            <div
              class="animate-setup-checkScale flex h-10 w-10 items-center justify-center rounded-full bg-green-500 md:h-14 md:w-14"
            >
              <Check
                size={20}
                class="animate-setup-checkDraw stroke-[3] text-white md:h-6 md:w-6"
              />
            </div>
          </div>
          <h3 class="text-lg font-bold text-contrast-content md:text-xl">
            Map Created Successfully!
          </h3>
          <p
            class="rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1 text-xs text-green-400 md:text-sm"
          >
            {mapName}
          </p>
          <p
            class="animate-setup-delayedFadeIn text-xs text-contrast-content/60 md:text-sm"
          >
            <span class="hidden sm:inline"
              >Redirecting to boundary upload...</span
            >
            <span class="sm:hidden">Redirecting...</span>
          </p>
        </div>
      {:else if createMapStatus === "loading"}
        <!-- LOADING IN THIS COMPONENT -->
        <div
          class="animate-setup-scaleIn flex flex-col items-center gap-3 md:gap-4"
        >
          <div
            class="relative mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-500/20 md:h-16 md:w-16"
          >
            <div
              class="animate-setup-spin absolute inset-0 rounded-full border-2 border-blue-400/30 border-t-blue-400"
            ></div>
            <Cloud
              size={20}
              class="animate-setup-pulse text-blue-400 md:h-6 md:w-6"
            />
          </div>
          <p class="text-base font-medium text-contrast-content md:text-lg">
            Creating map...
          </p>
          <p
            class="rounded-full bg-base-200 px-3 py-1 text-xs text-contrast-content/60 md:text-sm"
          >
            Setting up {mapName}
          </p>
        </div>
      {:else if isCreatingMap}
        <!-- FORM STATE -->
        <div class="animate-setup-expandUp space-y-4 md:space-y-5">
          <div class="flex flex-col items-center">
            <div class="mb-3 flex items-center gap-2">
              <div class="rounded-md bg-base-200 p-1.5 text-base-content">
                <Map size={16} />
              </div>
              <h3 class="text-lg font-bold text-contrast-content md:text-xl">
                Create New Map
              </h3>
            </div>
            <div class="mx-auto mb-3 w-full max-w-xs">
              <div
                class="animate-setup-slideIn rounded-full bg-info/20 px-3 py-1.5 text-center font-mono text-xs text-info"
              >
                {mapCode}
              </div>
            </div>
          </div>

          <form on:submit={handleSubmitMap} class="space-y-4">
            <div class="space-y-2">
              <label
                class="flex items-center gap-2 text-sm font-medium text-contrast-content/80"
              >
                <div class="rounded-md bg-base-200 p-1 text-base-content">
                  <Layers size={14} />
                </div>
                Map Name
              </label>
              <div
                class="relative transition-all duration-300 {error
                  ? 'animate-setup-shake'
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
                    : 'border-base-300 focus:border-base-content'} rounded-lg p-2.5 text-sm text-contrast-content transition-colors placeholder:text-contrast-content/50 focus:outline-none focus:ring-1 focus:ring-base-content disabled:opacity-50"
                  autofocus
                />
                {#if error}
                  <p
                    class="ml-1 mt-1 flex items-center gap-1.5 text-xs text-error"
                  >
                    <span class="inline-block h-1 w-1 rounded-full bg-error"
                    ></span>
                    {error}
                  </p>
                {/if}
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              class="flex w-full transform items-center justify-center gap-2 rounded-lg bg-base-content py-2.5 text-sm font-semibold text-base-100 shadow-lg shadow-base-content/20 transition-all hover:-translate-y-0.5 hover:bg-base-content/90 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
            >
              <span>Create Map</span>
              <ArrowRight size={14} />
            </button>
          </form>

          <div
            class="flex items-center justify-center gap-2 border-t border-base-300 pt-3 text-xs text-contrast-content/60"
          >
            <Settings size={10} />
            <span class="hidden sm:inline"
              >Advanced settings available after creation</span
            >
            <span class="sm:hidden">Advanced settings available later</span>
          </div>
        </div>
      {:else}
        <!-- INITIAL BUTTON STATE -->
        <div class="flex flex-col items-center text-center">
          <div
            class="mb-3 rounded-full bg-base-content/20 p-3 text-base-content transition-all duration-300 hover:scale-110"
          >
            <Map size={24} class="md:h-7 md:w-7" />
          </div>
          <h3 class="mb-2 text-lg font-bold text-contrast-content md:text-xl">
            Create Your First Map
          </h3>
          <p class="mb-4 px-2 text-xs text-contrast-content/60 md:text-sm">
            Start by creating a map for your farm operations
          </p>
          <button
            on:click={handleCreateMap}
            class="group flex w-full transform items-center justify-center gap-2 rounded-lg bg-base-content py-2.5 text-sm font-semibold text-base-100 shadow-lg shadow-base-content/20 transition-all hover:-translate-y-0.5 hover:bg-base-content/90"
          >
            <Map size={16} class="transition-transform group-hover:scale-110" />
            <span>Create New Map</span>
            <ArrowRight
              size={14}
              class="transition-transform group-hover:translate-x-1"
            />
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  /* Unique setup animations to avoid conflicts */
  @keyframes setup-shake {
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
  .animate-setup-shake {
    animation: setup-shake 0.3s ease-in-out;
  }

  @keyframes setup-fadeIn {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
  .animate-setup-fadeIn {
    animation: setup-fadeIn 0.2s ease-out;
  }

  @keyframes setup-scaleIn {
    from {
      opacity: 0;
      transform: scale(0.9);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
  .animate-setup-scaleIn {
    animation: setup-scaleIn 0.2s ease-out;
  }

  @keyframes setup-delayedFadeIn {
    0%,
    60% {
      opacity: 0;
      transform: translateY(10px);
    }
    100% {
      opacity: 1;
      transform: translateY(0);
    }
  }
  .animate-setup-delayedFadeIn {
    animation: setup-delayedFadeIn 1s ease-out;
  }

  @keyframes setup-expandUp {
    from {
      opacity: 0;
      transform: translateY(20px);
      max-height: 200px;
    }
    to {
      opacity: 1;
      transform: translateY(0);
      max-height: 600px;
    }
  }
  .animate-setup-expandUp {
    animation: setup-expandUp 0.5s ease-out;
  }

  @keyframes setup-slideIn {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  .animate-setup-slideIn {
    animation: setup-slideIn 0.3s ease-out 0.2s both;
  }

  @keyframes setup-spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
  .animate-setup-spin {
    animation: setup-spin 1s linear infinite;
  }

  @keyframes setup-pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }
  .animate-setup-pulse {
    animation: setup-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }

  @keyframes setup-successPulse {
    0%,
    100% {
      transform: scale(1);
      box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.3);
    }
    50% {
      transform: scale(1.05);
      box-shadow: 0 0 0 10px rgba(34, 197, 94, 0);
    }
  }
  .animate-setup-successPulse {
    animation: setup-successPulse 2s ease-in-out infinite;
  }

  @keyframes setup-checkScale {
    0% {
      transform: scale(0);
    }
    50% {
      transform: scale(1.1);
    }
    100% {
      transform: scale(1);
    }
  }
  .animate-setup-checkScale {
    animation: setup-checkScale 0.6s ease-out 0.3s both;
  }

  @keyframes setup-checkDraw {
    0% {
      stroke-dasharray: 50;
      stroke-dashoffset: 50;
    }
    100% {
      stroke-dasharray: 50;
      stroke-dashoffset: 0;
    }
  }
  .animate-setup-checkDraw {
    animation: setup-checkDraw 0.5s ease-out 0.5s both;
  }
</style>
