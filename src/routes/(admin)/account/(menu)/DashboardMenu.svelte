<script lang="ts">
  import { onMount } from "svelte"
  import { browser } from "$app/environment"
  import { connectedMapStore } from "$lib/stores/connectedMapStore"
  import { mapActivityStore } from "$lib/stores/mapActivityStore"
  import { profileStore } from "$lib/stores/profileStore"
  import { trailsMetaDataStore } from "$lib/stores/trailsMetaDataStore"
  import {
    operationStore,
    selectedOperationStore,
  } from "$lib/stores/operationStore"
  import { resetMapStores } from "$lib/stores/resetMapStores"
  import { toast } from "svelte-sonner"
  import { mapApi } from "$lib/api/mapApi"
  import { operationApi } from "$lib/api/operationApi"
  import { supabase } from "$lib/supabaseClient"
  import {
    Map,
    Plus,
    Home,
    Globe,
    LandPlot,
    MapPin,
    Car,
    Route,
    ChevronUp,
    MoreVertical,
    Link2,
    LogOut,
    Clock,
    User,
    Pencil,
    Trash2,
    AlertTriangle,
    Search,
    X,
    Cloud,
    Check,
    Truck,
  } from "lucide-svelte"

  import { v4 as uuidv4 } from "uuid"
  import FieldsTab from "./FieldsTab.svelte"
  import VehicleList from "./VehicleList.svelte"

  // ========================================
  // TAB MANAGEMENT
  // ========================================
  let activeTab = "dashboard"
  let isLoading = false
  let loadingAction = null

  // Reactive values
  $: isConnected = $connectedMapStore?.id
  $: isOwner = $connectedMapStore?.is_owner

  // Map transition animation state
  // Read the deep-link join flag synchronously during init so the overlay is
  // present on the very first paint (prevents a flash of the dashboard).
  const pendingJoinAnimation =
    browser && $connectedMapStore?.id
      ? sessionStorage.getItem("show_join_animation")
      : null
  let mapTransition: "connecting" | "connected" | null = pendingJoinAnimation
    ? "connected"
    : null
  let transitionMapName = pendingJoinAnimation
    ? $connectedMapStore?.map_name || pendingJoinAnimation
    : ""
  const MIN_ANIMATION_TIME = 1500
  const SUCCESS_DISPLAY_TIME = 3500

  // ========================================
  // DASHBOARD TAB STATE & FUNCTIONS
  // ========================================
  let showMapOptions = false
  let showLaunchMapConfirm = false
  let showSwitchMapConfirm = false
  let showLeaveMapConfirm = false
  let showOperationOptions = false
  let showCreateOperation = false
  let showEditOperation = false
  let showDeleteOperationConfirm = false
  let enteredMapId = ""

  // Rename map state
  let showRenameMap = false
  let newMapNameInput = ""

  // Get Started state (non-connected)
  let showCreateForm = false
  let showJoinForm = false
  let newMapName = ""
  let generatedMapId = uuidv4()

  let newOperationName = ""
  let newOperationYear = new Date().getFullYear()
  let newOperationDescription = ""
  let editOperationName = ""
  let editOperationYear = new Date().getFullYear()
  let editOperationDescription = ""

  // 🆕 NEW: Recent maps state
  let userMaps = []
  let recentMaps = []

  // 🆕 NEW: Custom operation dropdown state
  let showOperationDropdown = false
  let operationDropdownRef = null

  // Refs for the map / operation cards so we can close their option menus when
  // the user taps anywhere outside them.
  let mapCardRef = null
  let operationCardRef = null

  // Reactive values for dashboard
  $: currentYear = new Date().getFullYear()
  $: yearOptions = Array.from({ length: 10 }, (_, i) => currentYear - 5 + i)
  $: isOnlyOperation = $operationStore.length <= 1
  $: isMapMenuOpen =
    showMapOptions ||
    showLaunchMapConfirm ||
    showSwitchMapConfirm ||
    showLeaveMapConfirm ||
    showRenameMap
  $: isOperationMenuOpen =
    showOperationOptions ||
    showCreateOperation ||
    showEditOperation ||
    showDeleteOperationConfirm

  // 🆕 NEW: Trail count calculations
  $: trailCountsByOperation = $trailsMetaDataStore.reduce((counts, trail) => {
    const operationId = trail.operation_id
    if (operationId) {
      counts[operationId] = (counts[operationId] || 0) + 1
    }
    return counts
  }, {})

  // 🆕 NEW: Helper function to get trail count for an operation
  function getTrailCountForOperation(operationId: string): number {
    return trailCountsByOperation[operationId] || 0
  }

  // 🆕 Trailing vehicle count per operation — join vehicle_states (vehicle_id) → connected_profiles (id → operation_id)
  $: opIdByVehicleId = $mapActivityStore.connected_profiles.reduce((map, p) => {
    if (p.operation_id) map[p.id] = p.operation_id
    return map
  }, {} as Record<string, string>)

  $: trailingVehiclesByOperation = $mapActivityStore.vehicle_states.reduce((counts, v) => {
    if (v.is_trailing) {
      const opId = opIdByVehicleId[v.vehicle_id]
      if (opId) counts[opId] = (counts[opId] || 0) + 1
    }
    return counts
  }, {} as Record<string, number>)

  function getOpTrailingCount(operationId: string): number {
    return trailingVehiclesByOperation[operationId] || 0
  }

  // 🆕 NEW: Click outside to close dropdown
  function handleClickOutside(event) {
    if (operationDropdownRef && !operationDropdownRef.contains(event.target)) {
      showOperationDropdown = false
    }
    // Close the map options menu when tapping outside the map card.
    if (showMapOptions && mapCardRef && !mapCardRef.contains(event.target)) {
      showMapOptions = false
    }
    // Close the operation options menu when tapping outside the operation card.
    if (
      showOperationOptions &&
      operationCardRef &&
      !operationCardRef.contains(event.target)
    ) {
      showOperationOptions = false
    }
  }

  // 🆕 NEW: Fetch recent maps functions
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

  // Helper function to close all dashboard menus
  function closeAllDashboardMenus() {
    showMapOptions = false
    showLaunchMapConfirm = false
    showSwitchMapConfirm = false
    showLeaveMapConfirm = false
    showRenameMap = false
    showOperationOptions = false
    showCreateOperation = false
    showEditOperation = false
    showDeleteOperationConfirm = false
    showOperationDropdown = false
  }

  // Dashboard map functions
  function handleMapPanelClick() {
    if (isMapMenuOpen) {
      closeAllDashboardMenus()
    } else {
      closeAllDashboardMenus()
      showMapOptions = true
    }
  }

  function handleMapOptionsClick(event) {
    event.stopPropagation()
    if (isMapMenuOpen) {
      closeAllDashboardMenus()
    } else {
      closeAllDashboardMenus()
      showMapOptions = true
    }
  }

  function openLaunchMapConfirm() {
    closeAllDashboardMenus()
    showLaunchMapConfirm = true
  }

  function openSwitchMapConfirm() {
    closeAllDashboardMenus()
    showSwitchMapConfirm = true
  }

  function openLeaveMapConfirm() {
    closeAllDashboardMenus()
    showLeaveMapConfirm = true
  }

  function openCreateMapForm() {
    closeAllDashboardMenus()
    showJoinForm = false
    showCreateForm = true
  }

  function openJoinMapForm() {
    closeAllDashboardMenus()
    showCreateForm = false
    showJoinForm = true
  }

  async function handleCreateMap() {
    if (!newMapName.trim()) {
      toast.error("Please enter a map name")
      return
    }

    isLoading = true
    loadingAction = "create"
    mapTransition = "connecting"

    const startTime = Date.now()

    try {
      const result = await mapApi.createAndJoinMap(
        newMapName.trim(),
        generatedMapId,
      )

      if (result.success && result.data) {
        const { mapId, connectedMap, mapActivity, operation } = result.data

        resetMapStores()
        connectedMapStore.set(connectedMap)
        mapActivityStore.set(mapActivity)
        operationStore.set([operation])
        selectedOperationStore.set(operation)

        transitionMapName = connectedMap.map_name

        if ($profileStore) {
          profileStore.update((profile) => ({
            ...profile,
            master_map_id: mapId,
            recent_maps: [mapId, ...(profile.recent_maps || [])].slice(0, 10),
            selected_operation_id: operation.id,
          }))
        }

        const elapsed = Date.now() - startTime
        if (elapsed < MIN_ANIMATION_TIME) {
          await new Promise((r) => setTimeout(r, MIN_ANIMATION_TIME - elapsed))
        }

        mapTransition = "connected"

        setTimeout(() => {
          mapTransition = null
        }, SUCCESS_DISPLAY_TIME)

        activeTab = "dashboard"
        newMapName = ""
        generatedMapId = uuidv4()
        showCreateForm = false
      } else {
        mapTransition = null
        toast.error(`Failed to create map: ${result.message}`)
      }
    } catch (error) {
      mapTransition = null
      toast.error(`Error: ${error.message}`)
    } finally {
      isLoading = false
      loadingAction = null
    }
  }

  function openRenameMap() {
    closeAllDashboardMenus()
    newMapNameInput = $connectedMapStore?.map_name || ""
    showRenameMap = true
  }

  async function handleRenameMap() {
    if (!newMapNameInput.trim()) {
      toast.error("Map name is required")
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
        connectedMapStore.update((map) => ({
          ...map,
          map_name: newMapNameInput.trim(),
        }))
        toast.success("Map renamed")
        closeAllDashboardMenus()
      } else {
        toast.error(`Failed to rename: ${result.message}`)
      }
    } catch (error) {
      toast.error(`Error: ${error.message}`)
    } finally {
      isLoading = false
      loadingAction = null
    }
  }

  function handleLaunchMap() {
    window.location.href = "/account/mapviewer"
    showLaunchMapConfirm = false
  }

  async function connectToMap(mapId) {
    const trimmedMapId = mapId.trim()
    if (!trimmedMapId) {
      toast.error("Please enter a valid map code")
      return
    }

    isLoading = true
    loadingAction = `connect-${mapId}`
    mapTransition = "connecting"

    const startTime = Date.now()

    try {
      const result = await mapApi.connectToMap(trimmedMapId)

      if (result.success && result.data) {
        const {
          connectedMap,
          mapActivity,
          operations,
          operation,
          trailsMetadata,
        } = result.data

        // Clear old stores and set new ones
        resetMapStores()
        connectedMapStore.set(connectedMap)
        mapActivityStore.set(mapActivity)
        trailsMetaDataStore.set(trailsMetadata || [])
        operationStore.set(operations || [])
        selectedOperationStore.set(operation || (operations?.[0] ?? null))

        transitionMapName = connectedMap.map_name

        if ($profileStore) {
          profileStore.update((profile) => ({
            ...profile,
            master_map_id: trimmedMapId,
            recent_maps: [
              trimmedMapId,
              ...(profile.recent_maps || []).filter(
                (id) => id !== trimmedMapId,
              ),
            ].slice(0, 10),
          }))
        }

        // Ensure minimum animation time
        const elapsed = Date.now() - startTime
        if (elapsed < MIN_ANIMATION_TIME) {
          await new Promise((r) => setTimeout(r, MIN_ANIMATION_TIME - elapsed))
        }

        mapTransition = "connected"

        // Show success briefly then clear
        setTimeout(() => {
          mapTransition = null
        }, SUCCESS_DISPLAY_TIME)

        activeTab = "dashboard"
        enteredMapId = ""
        closeAllDashboardMenus()

        await fetchUserMaps()
        await fetchRecentMaps()
      } else {
        mapTransition = null
        toast.error(`Failed to connect to map: ${result.message}`)
      }
    } catch (error) {
      mapTransition = null
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
        // Clear ALL map-scoped stores (operations, vehicles, trails, etc.)
        resetMapStores()

        toast.success("Disconnected from map")
        closeAllDashboardMenus()
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

  // Dashboard operation functions
  function handleOperationPanelClick() {
    if (isOperationMenuOpen) {
      closeAllDashboardMenus()
    } else {
      closeAllDashboardMenus()
      showOperationOptions = true
    }
  }

  function handleOperationOptionsClick(event) {
    event.stopPropagation()
    if (isOperationMenuOpen) {
      closeAllDashboardMenus()
    } else {
      closeAllDashboardMenus()
      showOperationOptions = true
    }
  }

  function openCreateOperationFromOptions() {
    closeAllDashboardMenus()
    showCreateOperation = true
  }

  function prepareEditOperation() {
    if ($selectedOperationStore) {
      editOperationName = $selectedOperationStore.name
      editOperationYear = $selectedOperationStore.year
      editOperationDescription = $selectedOperationStore.description || ""
      closeAllDashboardMenus()
      showEditOperation = true
    }
  }

  function openDeleteOperationConfirm() {
    closeAllDashboardMenus()
    showDeleteOperationConfirm = true
  }

  async function handleOperationSelect(operationId) {
    const selectedOperation = $operationStore.find(
      (op) => op.id === operationId,
    )

    if (selectedOperation && $profileStore?.id) {
      isLoading = true
      loadingAction = `select-${operationId}`

      try {
        const result = await operationApi.updateSelectedOperation(
          $profileStore.id,
          operationId,
        )

        if (!result.success) {
          toast.error(`Failed to update selected operation: ${result.message}`)
          return
        }

        selectedOperationStore.set(selectedOperation)
        profileStore.update((profile) => ({
          ...profile,
          selected_operation_id: operationId,
        }))

        showOperationDropdown = false // 🆕 NEW: Close dropdown after selection
        toast.success("Operation switched")
      } catch (error) {
        toast.error("Failed to update selected operation")
      } finally {
        isLoading = false
        loadingAction = null
      }
    }
  }

  async function handleCreateOperation() {
    if (!newOperationName.trim()) {
      toast.error("Operation name is required")
      return
    }

    const master_map_id = $operationStore[0]?.master_map_id
    if (!master_map_id) {
      toast.error("No map is currently selected")
      return
    }

    isLoading = true
    loadingAction = "create-operation"

    try {
      const result = await operationApi.addOperation(
        master_map_id,
        newOperationName.trim(),
        Number(newOperationYear),
        newOperationDescription.trim(),
      )

      if (result.success && result.operation) {
        operationStore.update((ops) => [...ops, result.operation])
        selectedOperationStore.set(result.operation)

        if ($profileStore) {
          profileStore.update((profile) => ({
            ...profile,
            selected_operation_id: result.operation.id,
          }))

          await operationApi.updateSelectedOperation(
            $profileStore.id,
            result.operation.id,
          )
        }

        newOperationName = ""
        newOperationYear = new Date().getFullYear()
        newOperationDescription = ""
        showCreateOperation = false

        toast.success("Operation created")
      } else {
        toast.error(`Failed to create operation: ${result.message}`)
      }
    } catch (error) {
      toast.error(`Error: ${error.message}`)
    } finally {
      isLoading = false
      loadingAction = null
    }
  }

  async function handleUpdateOperation() {
    if (!editOperationName.trim()) {
      toast.error("Operation name is required")
      return
    }

    isLoading = true
    loadingAction = "update-operation"

    const updatedOperation = {
      id: $selectedOperationStore.id,
      name: editOperationName.trim(),
      year: Number(editOperationYear),
      description: editOperationDescription.trim(),
      master_map_id: $selectedOperationStore.master_map_id,
    }

    try {
      const result = await operationApi.updateOperation(
        $selectedOperationStore.id,
        {
          name: editOperationName.trim(),
          year: Number(editOperationYear),
          description: editOperationDescription.trim(),
        },
      )

      if (result.success) {
        operationStore.update((ops) =>
          ops.map((op) =>
            op.id === $selectedOperationStore.id ? updatedOperation : op,
          ),
        )
        selectedOperationStore.set(updatedOperation)
        showEditOperation = false
        toast.success("Operation updated")
      } else {
        toast.error(`Failed to update operation: ${result.message}`)
      }
    } catch (error) {
      toast.error(`Error: ${error.message}`)
    } finally {
      isLoading = false
      loadingAction = null
    }
  }

  async function handleDeleteOperation() {
    if (isOnlyOperation) {
      toast.error("Cannot delete the only operation")
      return
    }

    isLoading = true
    loadingAction = "delete-operation"

    try {
      const result = await operationApi.deleteOperation(
        $selectedOperationStore.id,
      )

      if (result.success) {
        operationStore.update((ops) =>
          ops.filter((op) => op.id !== $selectedOperationStore.id),
        )

        const newSelectedOperation = $operationStore.find(
          (op) => op.id !== $selectedOperationStore.id,
        )

        if (newSelectedOperation) {
          selectedOperationStore.set(newSelectedOperation)

          if ($profileStore) {
            await operationApi.updateSelectedOperation(
              $profileStore.id,
              newSelectedOperation.id,
            )

            profileStore.update((profile) => ({
              ...profile,
              selected_operation_id: newSelectedOperation.id,
            }))
          }
        }

        showDeleteOperationConfirm = false
        toast.success("Operation deleted")
      } else {
        toast.error(`Failed to delete operation: ${result.message}`)
      }
    } catch (error) {
      toast.error(`Error: ${error.message}`)
    } finally {
      isLoading = false
      loadingAction = null
    }
  }

  // ========================================
  // LIFECYCLE
  // ========================================
  onMount(async () => {
    // If we've returned from the field-processing wizard, jump straight to the
    // Fields tab so the user sees the result.
    if (browser) {
      const tabParam = new URLSearchParams(window.location.search).get("tab")
      if (tabParam === "fields" && $connectedMapStore?.id) {
        activeTab = "fields"
      }
    }

    await fetchUserMaps()
    await fetchRecentMaps()

    // Deep-link join animation: state was set synchronously during init to avoid
    // a flash. Here we just clear the flag and schedule it to hide.
    if (browser && pendingJoinAnimation) {
      sessionStorage.removeItem("show_join_animation")
      setTimeout(() => {
        mapTransition = null
      }, SUCCESS_DISPLAY_TIME)
    }

    // Add click outside listener
    document.addEventListener("click", handleClickOutside)
    return () => {
      document.removeEventListener("click", handleClickOutside)
    }
  })
</script>

<!-- Main Dashboard Container -->
<div class="w-full">
  <!-- Tab Navigation -->
  <div class="mb-6 border-b border-base-300">
    <div class="flex gap-1 overflow-x-auto">
      {#if isConnected}
        <button
          class="flex flex-1 items-center gap-2 whitespace-nowrap rounded-t-lg px-2 py-3 text-xs font-medium transition-colors sm:px-4 sm:text-sm {activeTab ===
          'dashboard'
            ? 'bg-base-200 text-contrast-content'
            : 'text-contrast-content/60 hover:bg-base-100 hover:text-contrast-content'}"
          on:click={() => (activeTab = "dashboard")}
        >
          <div
            class="flex h-5 w-5 items-center justify-center rounded-full {activeTab ===
            'dashboard'
              ? 'bg-green-500/20'
              : 'bg-base-300'}"
          >
            <Home
              class="h-3 w-3 {activeTab === 'dashboard'
                ? 'text-green-500'
                : 'text-contrast-content/60'}"
            />
          </div>
          <span class="xs:inline hidden sm:hidden lg:inline">Dashboard</span>
          <span class="xs:hidden sm:inline lg:hidden">Dash</span>
        </button>
      {/if}

      {#if isConnected}
        <button
          class="flex flex-1 items-center gap-2 whitespace-nowrap rounded-t-lg px-2 py-3 text-xs font-medium transition-colors sm:px-4 sm:text-sm {activeTab ===
          'fields'
            ? 'bg-base-200 text-contrast-content'
            : 'text-contrast-content/60 hover:bg-base-100 hover:text-contrast-content'}"
          on:click={() => (activeTab = "fields")}
        >
          <div
            class="flex h-5 w-5 items-center justify-center rounded-full {activeTab ===
            'fields'
              ? 'bg-orange-500/20'
              : 'bg-base-300'}"
          >
            <LandPlot
              class="h-3 w-3 {activeTab === 'fields'
                ? 'text-orange-500'
                : 'text-contrast-content/60'}"
            />
          </div>
          <span class="xs:inline hidden sm:hidden lg:inline">Fields</span>
          <span class="xs:hidden sm:inline lg:hidden">Fields</span>
        </button>
      {/if}
    </div>
  </div>

  <!-- Tab Content -->
  <div
    class="mb-6 min-h-[32rem] rounded-xl border border-base-300 bg-base-100 p-4 shadow-lg sm:p-6"
  >
    {#if mapTransition}
      <!-- Map Transition Overlay -->
      <div
        class="flex min-h-[28rem] flex-col items-center justify-center py-16"
      >
        {#if mapTransition === "connecting"}
          <div class="animate-scaleIn flex flex-col items-center gap-4">
            <div
              class="relative flex h-20 w-20 items-center justify-center rounded-full bg-blue-500/20"
            >
              <div
                class="absolute inset-0 animate-spin rounded-full border-2 border-blue-400/30 border-t-blue-400"
              ></div>
              <Cloud class="animate-cloudPulse h-9 w-9 text-blue-400" />
            </div>
            <div class="text-center">
              <p class="text-lg font-medium text-contrast-content">
                Connecting to map...
              </p>
              <p
                class="rounded-full bg-base-200 px-3 py-1.5 text-xs text-contrast-content/60"
              >
                Loading your farm data
              </p>
            </div>
          </div>
        {:else if mapTransition === "connected"}
          <div class="animate-scaleIn flex flex-col items-center gap-4">
            <div
              class="animate-successPulse flex h-20 w-20 items-center justify-center rounded-full bg-green-500/20 shadow-lg shadow-green-500/10"
            >
              <div
                class="animate-checkScale flex h-14 w-14 items-center justify-center rounded-full bg-green-500"
              >
                <Check
                  class="animate-checkDraw h-7 w-7 stroke-[3] text-white"
                />
              </div>
            </div>
            <div class="text-center">
              <p class="text-lg font-bold text-contrast-content">
                Connected to {transitionMapName}
              </p>
              <p
                class="rounded-full bg-base-200 px-3 py-1.5 text-xs text-contrast-content/60"
              >
                Your farm operations are ready
              </p>
            </div>
            <p class="animate-delayedFadeIn text-xs text-contrast-content/60">
              Loading dashboard...
            </p>
          </div>
        {/if}
      </div>
    {:else if activeTab === "dashboard" && isConnected}
      <!-- Dashboard Tab Content -->
      <div class="space-y-4 sm:space-y-6">
        <!-- Map Info Header - Fixed Width for Settings Button -->
        <div
          bind:this={mapCardRef}
          class="relative rounded-lg bg-base-200 p-3 transition-colors sm:p-4"
        >
          <div class="flex w-full items-center gap-3">
            <button
              class="flex min-w-0 flex-1 items-center gap-3 text-left"
              on:click={handleMapPanelClick}
            >
              <div
                class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-green-600/20 sm:h-10 sm:w-10"
              >
                <Map class="h-4 w-4 text-green-600 sm:h-5 sm:w-5" />
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
            </button>
            <!-- Fixed width container for settings button -->
            <div class="relative flex w-8 justify-end sm:w-10">
              <button
                class="flex h-7 w-7 items-center justify-center rounded-lg bg-base-100/60 transition-colors hover:bg-base-100 sm:h-8 sm:w-8"
                on:click={handleMapOptionsClick}
                title="Map options"
              >
                {#if isMapMenuOpen}
                  <ChevronUp
                    class="h-3 w-3 text-contrast-content/60 sm:h-4 sm:w-4"
                  />
                {:else}
                  <MoreVertical
                    class="h-3 w-3 text-contrast-content/60 sm:h-4 sm:w-4"
                  />
                {/if}
              </button>

              <!-- Options Menu Dropdown -->
              {#if showMapOptions}
                <div
                  class="absolute right-0 top-full z-50 mt-2 w-44 rounded-lg border border-base-300 bg-base-100 py-1 shadow-lg sm:w-48"
                >
                  <button
                    class="flex w-full items-center gap-3 px-3 py-2 text-xs text-contrast-content transition-colors hover:bg-base-200 sm:px-4 sm:text-sm"
                    on:click|stopPropagation={openLaunchMapConfirm}
                  >
                    <div
                      class="flex h-5 w-5 items-center justify-center rounded-full bg-green-600/20 sm:h-6 sm:w-6"
                    >
                      <Globe class="h-2.5 w-2.5 text-green-600 sm:h-3 sm:w-3" />
                    </div>
                    Launch Map
                  </button>
                  <button
                    class="flex w-full items-center gap-3 px-3 py-2 text-xs text-contrast-content transition-colors hover:bg-base-200 sm:px-4 sm:text-sm"
                    on:click|stopPropagation={openRenameMap}
                  >
                    <div
                      class="flex h-5 w-5 items-center justify-center rounded-full bg-yellow-600/20 sm:h-6 sm:w-6"
                    >
                      <Pencil
                        class="h-2.5 w-2.5 text-yellow-600 sm:h-3 sm:w-3"
                      />
                    </div>
                    Rename Map
                  </button>
                  <button
                    class="flex w-full items-center gap-3 px-3 py-2 text-xs text-contrast-content transition-colors hover:bg-base-200 sm:px-4 sm:text-sm"
                    on:click|stopPropagation={openSwitchMapConfirm}
                  >
                    <div
                      class="flex h-5 w-5 items-center justify-center rounded-full bg-purple-600/20 sm:h-6 sm:w-6"
                    >
                      <Link2
                        class="h-2.5 w-2.5 text-purple-600 sm:h-3 sm:w-3"
                      />
                    </div>
                    Switch Map
                  </button>
                  <button
                    class="flex w-full items-center gap-3 px-3 py-2 text-xs text-contrast-content transition-colors hover:bg-base-200 sm:px-4 sm:text-sm"
                    on:click|stopPropagation={openLeaveMapConfirm}
                  >
                    <div
                      class="flex h-5 w-5 items-center justify-center rounded-full bg-orange-600/20 sm:h-6 sm:w-6"
                    >
                      <LogOut
                        class="h-2.5 w-2.5 text-orange-600 sm:h-3 sm:w-3"
                      />
                    </div>
                    Leave Map
                  </button>
                </div>
              {/if}
            </div>
          </div>

          <!-- Expandable Launch Map Confirmation -->
          {#if showLaunchMapConfirm}
            <div
              class="dashboard-slide-down mt-3 border-t border-base-300 pt-3 sm:mt-4 sm:pt-4"
            >
              <div class="space-y-3 sm:space-y-4" on:click|stopPropagation>
                <div>
                  <h4
                    class="mb-2 text-sm font-semibold text-contrast-content sm:text-base"
                  >
                    Launch Interactive Map
                  </h4>
                  <p class="text-xs text-contrast-content/60 sm:text-sm">
                    This will open the interactive map viewer in a new window
                    where you can view and edit map data.
                  </p>
                </div>
                <div class="flex gap-2">
                  <button
                    class="flex-1 rounded-lg border border-base-300 bg-base-100 py-2 text-xs font-medium text-contrast-content transition-colors hover:bg-base-300 sm:text-sm"
                    on:click={() => closeAllDashboardMenus()}
                  >
                    Cancel
                  </button>
                  <button
                    class="flex-1 rounded-lg bg-base-content py-2 text-xs font-medium text-base-100 transition-colors hover:bg-base-content/90 sm:text-sm"
                    on:click={handleLaunchMap}
                  >
                    Launch Map
                  </button>
                </div>
              </div>
            </div>
          {/if}

          <!-- Expandable Rename Map -->
          {#if showRenameMap}
            <div
              class="dashboard-slide-down mt-3 border-t border-base-300 pt-3 sm:mt-4 sm:pt-4"
            >
              <div class="space-y-3 sm:space-y-4" on:click|stopPropagation>
                <div>
                  <h4
                    class="mb-2 text-sm font-semibold text-contrast-content sm:text-base"
                  >
                    Rename Map
                  </h4>
                  <input
                    type="text"
                    bind:value={newMapNameInput}
                    placeholder="New map name"
                    class="w-full rounded-lg border border-base-300 bg-base-100 p-2.5 text-xs text-contrast-content outline-none transition-colors focus:border-base-content sm:p-3 sm:text-sm"
                  />
                </div>
                <div class="flex gap-2">
                  <button
                    class="flex-1 rounded-lg border border-base-300 bg-base-100 py-2 text-xs font-medium text-contrast-content transition-colors hover:bg-base-300 sm:text-sm"
                    on:click={() => closeAllDashboardMenus()}
                  >
                    Cancel
                  </button>
                  <button
                    class="flex-1 rounded-lg bg-base-content py-2 text-xs font-medium text-base-100 transition-colors hover:bg-base-content/90 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
                    on:click={handleRenameMap}
                    disabled={isLoading || !newMapNameInput.trim()}
                  >
                    {isLoading && loadingAction === "rename"
                      ? "Saving..."
                      : "Save"}
                  </button>
                </div>
              </div>
            </div>
          {/if}

          <!-- Expandable Switch Map with Inline Join Button -->
          {#if showSwitchMapConfirm}
            <div
              class="dashboard-slide-down mt-3 border-t border-base-300 pt-3 sm:mt-4 sm:pt-4"
            >
              <div class="space-y-3 sm:space-y-4" on:click|stopPropagation>
                <div>
                  <h4
                    class="mb-2 text-sm font-semibold text-contrast-content sm:text-base"
                  >
                    Switch to Another Map
                  </h4>
                  <label
                    class="mb-1 block text-xs text-contrast-content/60 sm:text-sm"
                    >Map Code</label
                  >
                  <!-- Inline input and button - Stack on mobile -->
                  <div class="flex flex-col gap-2 sm:flex-row">
                    <input
                      type="text"
                      bind:value={enteredMapId}
                      placeholder="Enter 4-digit map code"
                      class="flex-1 rounded-lg border border-base-300 bg-base-100 p-2.5 text-xs text-contrast-content outline-none transition-colors focus:border-base-content sm:p-3 sm:text-sm"
                    />
                    <button
                      class="rounded-lg bg-base-content px-4 py-2.5 text-xs font-medium text-base-100 transition-colors hover:bg-base-content/90 disabled:cursor-not-allowed disabled:opacity-50 sm:px-4 sm:py-3 sm:text-sm"
                      on:click={() => connectToMap(enteredMapId)}
                      disabled={isLoading || !enteredMapId.trim()}
                    >
                      {isLoading && loadingAction === `connect-${enteredMapId}`
                        ? "Joining..."
                        : "Join"}
                    </button>
                  </div>
                </div>

                <!-- Recent Maps Quick Access -->
                {#if recentMaps.length > 0 || userMaps.length > 0}
                  <div class="space-y-3">
                    {#if recentMaps.length > 0}
                      <div>
                        <h5
                          class="mb-2 flex items-center gap-2 text-xs font-medium text-contrast-content sm:text-sm"
                        >
                          <div
                            class="flex h-3 w-3 items-center justify-center rounded-full bg-purple-600/20 sm:h-4 sm:w-4"
                          >
                            <Clock
                              class="h-2 w-2 text-purple-600 sm:h-2.5 sm:w-2.5"
                            />
                          </div>
                          Recent Maps
                        </h5>
                        <div class="space-y-1">
                          {#each recentMaps.slice(0, 10) as map}
                            <button
                              class="group flex w-full items-center gap-2 rounded-lg border border-base-300 bg-base-100 p-2 text-left transition-colors hover:bg-base-300 sm:gap-3 sm:p-2.5"
                              on:click={() => connectToMap(map.id)}
                              disabled={isLoading}
                            >
                              <div
                                class="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600/20 sm:h-6 sm:w-6"
                              >
                                <Map
                                  class="h-2.5 w-2.5 text-blue-600 sm:h-3 sm:w-3"
                                />
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
                                class="h-3 w-3 text-contrast-content/60 transition-transform group-hover:translate-x-1"
                              />
                            </button>
                          {/each}
                        </div>
                      </div>
                    {/if}

                    {#if userMaps.length > 0}
                      <div>
                        <h5
                          class="mb-2 flex items-center gap-2 text-xs font-medium text-contrast-content sm:text-sm"
                        >
                          <div
                            class="flex h-3 w-3 items-center justify-center rounded-full bg-green-600/20 sm:h-4 sm:w-4"
                          >
                            <User
                              class="h-2 w-2 text-green-600 sm:h-2.5 sm:w-2.5"
                            />
                          </div>
                          Your Maps
                        </h5>
                        <div class="space-y-1">
                          {#each userMaps.slice(0, 5) as map}
                            <button
                              class="group flex w-full items-center gap-2 rounded-lg border border-base-300 bg-base-100 p-2 text-left transition-colors hover:bg-base-300 sm:gap-3 sm:p-2.5"
                              on:click={() => connectToMap(map.id)}
                              disabled={isLoading}
                            >
                              <div
                                class="flex h-5 w-5 items-center justify-center rounded-full bg-green-600/20 sm:h-6 sm:w-6"
                              >
                                <Map
                                  class="h-2.5 w-2.5 text-green-600 sm:h-3 sm:w-3"
                                />
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
                                class="h-3 w-3 text-contrast-content/60 transition-transform group-hover:translate-x-1"
                              />
                            </button>
                          {/each}
                        </div>
                      </div>
                    {/if}
                  </div>
                {/if}

                <!-- Cancel button only -->
                <div class="flex pt-2">
                  <button
                    class="rounded-lg border border-base-300 bg-base-100 px-4 py-2 text-xs font-medium text-contrast-content transition-colors hover:bg-base-300 sm:text-sm"
                    on:click={() => {
                      closeAllDashboardMenus()
                      enteredMapId = ""
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          {/if}

          <!-- Expandable Leave Map Confirmation -->
          {#if showLeaveMapConfirm}
            <div
              class="dashboard-slide-down mt-3 border-t border-base-300 pt-3 sm:mt-4 sm:pt-4"
            >
              <div class="space-y-3 sm:space-y-4" on:click|stopPropagation>
                <div>
                  <h4
                    class="mb-2 text-sm font-semibold text-contrast-content sm:text-base"
                  >
                    Leave Map
                  </h4>
                  <p class="text-xs text-contrast-content/60 sm:text-sm">
                    Are you sure you want to disconnect from "{$connectedMapStore.map_name}"?
                    You can reconnect later using the Map Code.
                  </p>
                </div>
                <div class="flex gap-2">
                  <button
                    class="flex-1 rounded-lg border border-base-300 bg-base-100 py-2 text-xs font-medium text-contrast-content transition-colors hover:bg-base-300 sm:text-sm"
                    on:click={() => closeAllDashboardMenus()}
                  >
                    Cancel
                  </button>
                  <button
                    class="flex-1 rounded-lg bg-orange-500 py-2 text-xs font-medium text-white transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
                    on:click={handleDisconnectFromMap}
                    disabled={isLoading}
                  >
                    {isLoading && loadingAction === "disconnect"
                      ? "Leaving..."
                      : "Leave Map"}
                  </button>
                </div>
              </div>
            </div>
          {/if}
        </div>

        <!-- Operation Selector with Fixed Width for Settings Button -->
        <div
          bind:this={operationCardRef}
          class="relative rounded-lg bg-base-200 p-3 transition-colors sm:p-4"
        >
          <div class="mb-3 flex items-center gap-3">
            <div
              class="flex h-8 w-8 items-center justify-center rounded-full bg-purple-600/20 sm:h-10 sm:w-10"
            >
              <MapPin class="h-4 w-4 text-purple-600 sm:h-5 sm:w-5" />
            </div>
            <div class="min-w-0 flex-1">
              <h3
                class="text-sm font-semibold text-contrast-content sm:text-base"
              >
                Operation
              </h3>
              <p class="text-xs text-contrast-content/60 sm:text-sm">
                Select active operation
              </p>
            </div>
            <!-- Fixed width container for settings button -->
            <div class="relative flex w-8 justify-end sm:w-10">
              <button
                class="flex h-7 w-7 items-center justify-center rounded-lg bg-base-100/60 transition-colors hover:bg-base-100 sm:h-8 sm:w-8"
                on:click={handleOperationOptionsClick}
                title="Operation options"
              >
                {#if isOperationMenuOpen}
                  <ChevronUp
                    class="h-3 w-3 text-contrast-content/60 sm:h-4 sm:w-4"
                  />
                {:else}
                  <MoreVertical
                    class="h-3 w-3 text-contrast-content/60 sm:h-4 sm:w-4"
                  />
                {/if}
              </button>

              <!-- Options Menu Dropdown -->
              {#if showOperationOptions}
                <div
                  class="absolute right-0 top-full z-50 mt-2 w-44 rounded-lg border border-base-300 bg-base-100 py-1 shadow-lg sm:w-48"
                >
                  <button
                    class="flex w-full items-center gap-3 px-3 py-2 text-xs text-contrast-content transition-colors hover:bg-base-200 sm:px-4 sm:text-sm"
                    on:click|stopPropagation={openCreateOperationFromOptions}
                  >
                    <div
                      class="flex h-5 w-5 items-center justify-center rounded-full bg-green-600/20 sm:h-6 sm:w-6"
                    >
                      <Plus class="h-2.5 w-2.5 text-green-600 sm:h-3 sm:w-3" />
                    </div>
                    Add Operation
                  </button>
                  <button
                    class="flex w-full items-center gap-3 px-3 py-2 text-xs text-contrast-content transition-colors hover:bg-base-200 sm:px-4 sm:text-sm"
                    on:click|stopPropagation={prepareEditOperation}
                  >
                    <div
                      class="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600/20 sm:h-6 sm:w-6"
                    >
                      <Pencil class="h-2.5 w-2.5 text-blue-600 sm:h-3 sm:w-3" />
                    </div>
                    Edit Operation
                  </button>
                  {#if !isOnlyOperation}
                    <button
                      class="flex w-full items-center gap-3 px-3 py-2 text-xs text-contrast-content transition-colors hover:bg-base-200 sm:px-4 sm:text-sm"
                      on:click|stopPropagation={openDeleteOperationConfirm}
                    >
                      <div
                        class="flex h-5 w-5 items-center justify-center rounded-full bg-red-600/20 sm:h-6 sm:w-6"
                      >
                        <Trash2
                          class="h-2.5 w-2.5 text-red-600 sm:h-3 sm:w-3"
                        />
                      </div>
                      Delete Operation
                    </button>
                  {/if}
                </div>
              {/if}
            </div>
          </div>

          <!-- Custom Operation Dropdown -->
          <div class="relative" bind:this={operationDropdownRef}>
            <button
              class="hover:bg-base-50 flex w-full items-center justify-between rounded-lg border border-base-300 bg-base-100 px-3 py-2.5 text-xs outline-none transition-colors focus:border-base-content disabled:cursor-not-allowed disabled:opacity-50 sm:py-3 sm:text-sm"
              on:click={() =>
                !isLoading && (showOperationDropdown = !showOperationDropdown)}
              disabled={isLoading}
            >
              <span class="truncate text-left text-contrast-content">
                {#if $selectedOperationStore}
                  {$selectedOperationStore.name} ({$selectedOperationStore.year})
                  <span
                    class="ml-1 inline-flex items-center gap-1 rounded-full bg-base-200 px-1.5 py-0.5 text-xs text-base-content sm:ml-2 sm:px-2"
                  >
                    <Route class="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                    {getTrailCountForOperation($selectedOperationStore.id)}
                  </span>
                {:else}
                  Select Operation
                {/if}
              </span>
              <svg
                class="h-3 w-3 text-contrast-content/60 transition-transform sm:h-4 sm:w-4 {showOperationDropdown
                  ? 'rotate-180'
                  : ''}"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M19 9l-7 7-7-7"
                ></path>
              </svg>
            </button>

            {#if showOperationDropdown}
              <div
                class="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-base-300 bg-base-100 shadow-lg sm:max-h-60"
              >
                {#each $operationStore as operation (operation.id)}
                  {@const trailCount = getTrailCountForOperation(operation.id)}
                  {@const trailingCount = getOpTrailingCount(operation.id)}
                  <button
                    class="group flex w-full items-center justify-between px-3 py-2 text-left transition-colors hover:bg-base-200 {$selectedOperationStore?.id ===
                    operation.id
                      ? 'bg-primary/10 text-primary'
                      : ''}"
                    on:click={() => handleOperationSelect(operation.id)}
                  >
                    <div class="min-w-0 flex-1">
                      <div
                        class="truncate text-xs font-medium text-contrast-content sm:text-sm"
                      >
                        {operation.name} ({operation.year})
                      </div>
                    </div>
                    <div class="ml-2 flex shrink-0 items-center gap-1">
                      {#if trailingCount > 0}
                        <div
                          class="flex items-center gap-1 rounded-full bg-green-500/20 px-1.5 py-1 text-xs text-green-600 sm:px-2"
                        >
                          <Truck class="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                          <span>{trailingCount}</span>
                        </div>
                      {/if}
                      <div
                        class="group-hover:bg-base-400 flex items-center gap-1 rounded-full bg-base-300 px-1.5 py-1 text-xs {$selectedOperationStore?.id ===
                        operation.id
                          ? 'bg-primary/20 text-primary'
                          : 'text-base-content'} sm:px-2"
                      >
                        <Route class="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                        <span>{trailCount}</span>
                      </div>
                    </div>
                  </button>
                {/each}
              </div>
            {/if}
          </div>

          {#if $selectedOperationStore?.description}
            <p class="mt-2 text-xs text-contrast-content/60 sm:text-sm">
              {$selectedOperationStore.description}
            </p>
          {/if}

          <!-- Expandable Create Operation Section -->
          {#if showCreateOperation}
            <div
              class="dashboard-slide-down mt-3 border-t border-base-300 pt-3 sm:mt-4 sm:pt-4"
            >
              <div class="mb-3 flex items-center justify-between sm:mb-4">
                <h4
                  class="text-sm font-semibold text-contrast-content sm:text-base"
                >
                  Create Operation
                </h4>
              </div>
              <div class="space-y-3" on:click|stopPropagation>
                <div>
                  <label
                    class="mb-1 block text-xs text-contrast-content/60 sm:text-sm"
                    >Name</label
                  >
                  <input
                    type="text"
                    bind:value={newOperationName}
                    placeholder="Operation name"
                    class="w-full rounded-lg border border-base-300 bg-base-100 p-2 text-xs text-contrast-content outline-none transition-colors focus:border-base-content sm:p-2.5 sm:text-sm"
                  />
                </div>
                <div>
                  <label
                    class="mb-1 block text-xs text-contrast-content/60 sm:text-sm"
                    >Year</label
                  >
                  <select
                    bind:value={newOperationYear}
                    class="w-full rounded-lg border border-base-300 bg-base-100 p-2 text-xs text-contrast-content outline-none transition-colors focus:border-base-content sm:p-2.5 sm:text-sm"
                  >
                    {#each yearOptions as year}
                      <option value={year}>{year}</option>
                    {/each}
                  </select>
                </div>
                <div>
                  <label
                    class="mb-1 block text-xs text-contrast-content/60 sm:text-sm"
                    >Description</label
                  >
                  <textarea
                    bind:value={newOperationDescription}
                    placeholder="Optional description"
                    rows="2"
                    class="w-full resize-none rounded-lg border border-base-300 bg-base-100 p-2 text-xs text-contrast-content outline-none transition-colors focus:border-base-content sm:p-2.5 sm:text-sm"
                  ></textarea>
                </div>
                <div class="flex gap-2 pt-2">
                  <button
                    class="flex-1 rounded-lg border border-base-300 bg-base-100 py-2 text-xs font-medium text-contrast-content transition-colors hover:bg-base-300 sm:text-sm"
                    on:click={() => {
                      closeAllDashboardMenus()
                      newOperationName = ""
                      newOperationDescription = ""
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    class="flex-1 rounded-lg bg-base-content py-2 text-xs font-medium text-base-100 transition-colors hover:bg-base-content/90 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
                    on:click={handleCreateOperation}
                    disabled={isLoading || !newOperationName.trim()}
                  >
                    {isLoading ? "Creating..." : "Create"}
                  </button>
                </div>
              </div>
            </div>
          {/if}

          <!-- Expandable Edit Operation Section -->
          {#if showEditOperation}
            <div
              class="dashboard-slide-down mt-3 border-t border-base-300 pt-3 sm:mt-4 sm:pt-4"
            >
              <div class="mb-3 flex items-center justify-between sm:mb-4">
                <h4
                  class="text-sm font-semibold text-contrast-content sm:text-base"
                >
                  Edit Operation
                </h4>
              </div>
              <div class="space-y-3" on:click|stopPropagation>
                <div>
                  <label
                    class="mb-1 block text-xs text-contrast-content/60 sm:text-sm"
                    >Name</label
                  >
                  <input
                    type="text"
                    bind:value={editOperationName}
                    class="w-full rounded-lg border border-base-300 bg-base-100 p-2 text-xs text-contrast-content outline-none transition-colors focus:border-base-content sm:p-2.5 sm:text-sm"
                  />
                </div>
                <div>
                  <label
                    class="mb-1 block text-xs text-contrast-content/60 sm:text-sm"
                    >Year</label
                  >
                  <select
                    bind:value={editOperationYear}
                    class="w-full rounded-lg border border-base-300 bg-base-100 p-2 text-xs text-contrast-content outline-none transition-colors focus:border-base-content sm:p-2.5 sm:text-sm"
                  >
                    {#each yearOptions as year}
                      <option value={year}>{year}</option>
                    {/each}
                  </select>
                </div>
                <div>
                  <label
                    class="mb-1 block text-xs text-contrast-content/60 sm:text-sm"
                    >Description</label
                  >
                  <textarea
                    bind:value={editOperationDescription}
                    rows="2"
                    class="w-full resize-none rounded-lg border border-base-300 bg-base-100 p-2 text-xs text-contrast-content outline-none transition-colors focus:border-base-content sm:p-2.5 sm:text-sm"
                  ></textarea>
                </div>
                <div class="flex gap-2 pt-2">
                  <button
                    class="flex-1 rounded-lg border border-base-300 bg-base-100 py-2 text-xs font-medium text-contrast-content transition-colors hover:bg-base-300 sm:text-sm"
                    on:click={() => closeAllDashboardMenus()}
                  >
                    Cancel
                  </button>
                  <button
                    class="flex-1 rounded-lg bg-base-content py-2 text-xs font-medium text-base-100 transition-colors hover:bg-base-content/90 sm:text-sm"
                    on:click={handleUpdateOperation}
                    disabled={isLoading}
                  >
                    {isLoading ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            </div>
          {/if}

          <!-- Expandable Delete Operation Confirmation -->
          {#if showDeleteOperationConfirm}
            <div
              class="dashboard-slide-down mt-3 border-t border-red-300 pt-3 sm:mt-4 sm:pt-4"
            >
              <div
                class="rounded-lg bg-red-50 p-3 sm:p-4"
                on:click|stopPropagation
              >
                <div class="mb-3 flex items-center gap-2">
                  <AlertTriangle class="h-4 w-4 text-red-500 sm:h-5 sm:w-5" />
                  <h4 class="text-sm font-semibold text-red-700 sm:text-base">
                    Delete Operation
                  </h4>
                </div>
                <p class="mb-3 text-xs text-red-600 sm:text-sm">
                  Are you sure you want to delete "{$selectedOperationStore.name}"?
                  This action cannot be undone.
                </p>
                <div class="flex gap-2">
                  <button
                    class="flex-1 rounded bg-gray-200 py-2 text-xs font-medium transition-colors hover:bg-gray-300 sm:text-sm"
                    on:click={() => closeAllDashboardMenus()}
                  >
                    Cancel
                  </button>
                  <button
                    class="flex-1 rounded bg-red-500 py-2 text-xs font-medium text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
                    on:click={handleDeleteOperation}
                    disabled={isLoading}
                  >
                    {isLoading && loadingAction === "delete-operation"
                      ? "Deleting..."
                      : "Delete"}
                  </button>
                </div>
              </div>
            </div>
          {/if}
        </div>

        <!-- Team Members -->
        <VehicleList />
      </div>
    {:else if activeTab === "dashboard" && !isConnected}
      <!-- Dashboard Tab - Not Connected: Get Started -->
      <div class="space-y-4 sm:space-y-6">
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
              on:click={openCreateMapForm}
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
              on:click={openJoinMapForm}
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

        <!-- Expandable Create Map Form -->
        {#if showCreateForm}
          <div class="animate-slideDown rounded-lg bg-base-200 p-4">
            <div class="mb-4 flex items-center justify-between">
              <h4 class="font-semibold text-contrast-content">
                Create New Map
              </h4>
              <button
                class="flex h-6 w-6 items-center justify-center rounded-lg bg-base-100/60 transition-colors hover:bg-base-100"
                on:click={() => (showCreateForm = false)}
                title="Close"
              >
                <X class="h-3 w-3 text-contrast-content/60" />
              </button>
            </div>
            <div class="space-y-4">
              <div>
                <label class="mb-1 block text-sm text-contrast-content/60"
                  >Map Name</label
                >
                <input
                  type="text"
                  bind:value={newMapName}
                  placeholder="e.g. North Field Operations"
                  class="w-full rounded-lg border border-base-300 bg-base-100 p-3 text-sm text-contrast-content outline-none transition-colors focus:border-base-content"
                />
              </div>
              <div class="flex gap-2">
                <button
                  class="flex-1 rounded-lg border border-base-300 bg-base-100 py-2 text-sm font-medium text-contrast-content transition-colors hover:bg-base-300"
                  on:click={() => {
                    showCreateForm = false
                    newMapName = ""
                  }}
                >
                  Cancel
                </button>
                <button
                  class="flex-1 rounded-lg bg-base-content py-2 text-sm font-medium text-base-100 transition-colors hover:bg-base-content/90 disabled:cursor-not-allowed disabled:opacity-50"
                  on:click={handleCreateMap}
                  disabled={isLoading || !newMapName.trim()}
                >
                  {isLoading && loadingAction === "create"
                    ? "Creating..."
                    : "Create Map"}
                </button>
              </div>
            </div>
          </div>
        {/if}

        <!-- Expandable Join Map Form -->
        {#if showJoinForm}
          <div class="animate-slideDown rounded-lg bg-base-200 p-4">
            <div class="mb-4 flex items-center justify-between">
              <h4 class="font-semibold text-contrast-content">Join Map</h4>
              <button
                class="flex h-6 w-6 items-center justify-center rounded-lg bg-base-100/60 transition-colors hover:bg-base-100"
                on:click={() => (showJoinForm = false)}
                title="Close"
              >
                <X class="h-3 w-3 text-contrast-content/60" />
              </button>
            </div>
            <div class="space-y-4">
              <div>
                <label class="mb-1 block text-sm text-contrast-content/60"
                  >Map Code</label
                >
                <div class="flex gap-2">
                  <input
                    type="text"
                    bind:value={enteredMapId}
                    placeholder="Enter 4-digit map code"
                    class="flex-1 rounded-lg border border-base-300 bg-base-100 p-3 text-sm text-contrast-content outline-none transition-colors focus:border-base-content"
                  />
                  <button
                    class="rounded-lg bg-base-content px-4 py-3 text-sm font-medium text-base-100 transition-colors hover:bg-base-content/90 disabled:cursor-not-allowed disabled:opacity-50"
                    on:click={() => connectToMap(enteredMapId)}
                    disabled={isLoading || !enteredMapId.trim()}
                  >
                    {isLoading && loadingAction === `connect-${enteredMapId}`
                      ? "Joining..."
                      : "Join"}
                  </button>
                </div>
              </div>

              {#if recentMaps.length > 0 || userMaps.length > 0}
                <div class="space-y-3">
                  {#if recentMaps.length > 0}
                    <div>
                      <h5
                        class="mb-2 flex items-center gap-2 text-sm font-medium text-contrast-content"
                      >
                        <div
                          class="flex h-4 w-4 items-center justify-center rounded-full bg-purple-600/20"
                        >
                          <Clock class="h-2.5 w-2.5 text-purple-600" />
                        </div>
                        Recent Maps
                      </h5>
                      <div class="space-y-1">
                        {#each recentMaps.slice(0, 3) as map}
                          <button
                            class="group flex w-full items-center gap-3 rounded-lg border border-base-300 bg-base-100 p-3 text-left transition-colors hover:bg-base-300"
                            on:click={() => connectToMap(map.id)}
                            disabled={isLoading}
                          >
                            <div
                              class="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600/20"
                            >
                              <Map class="h-4 w-4 text-blue-600" />
                            </div>
                            <div class="min-w-0 flex-1">
                              <div
                                class="truncate font-medium text-contrast-content"
                              >
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
                      <h5
                        class="mb-2 flex items-center gap-2 text-sm font-medium text-contrast-content"
                      >
                        <div
                          class="flex h-4 w-4 items-center justify-center rounded-full bg-green-600/20"
                        >
                          <User class="h-2.5 w-2.5 text-green-600" />
                        </div>
                        Your Maps
                      </h5>
                      <div class="space-y-1">
                        {#each userMaps.slice(0, 3) as map}
                          <button
                            class="group flex w-full items-center gap-3 rounded-lg border border-base-300 bg-base-100 p-3 text-left transition-colors hover:bg-base-300"
                            on:click={() => connectToMap(map.id)}
                            disabled={isLoading}
                          >
                            <div
                              class="flex h-8 w-8 items-center justify-center rounded-full bg-green-600/20"
                            >
                              <Map class="h-4 w-4 text-green-600" />
                            </div>
                            <div class="min-w-0 flex-1">
                              <div
                                class="truncate font-medium text-contrast-content"
                              >
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

              <div class="mt-4">
                <button
                  class="w-full rounded-lg border border-base-300 bg-base-100 py-2 text-sm font-medium text-contrast-content transition-colors hover:bg-base-300"
                  on:click={() => {
                    showJoinForm = false
                    enteredMapId = ""
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        {/if}
      </div>
    {:else if activeTab === "fields" && isConnected}
      <FieldsTab />
    {/if}
  </div>
</div>

<style>
  @keyframes dashboardSlideDown {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .dashboard-slide-down {
    animation: dashboardSlideDown 0.2s ease-out;
  }

  @keyframes scaleIn {
    from {
      opacity: 0;
      transform: scale(0.9);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
  .animate-scaleIn {
    animation: scaleIn 0.3s ease-out;
  }

  @keyframes cloudPulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }
  .animate-cloudPulse {
    animation: cloudPulse 2s ease-in-out infinite;
  }

  @keyframes delayedFadeIn {
    0% {
      opacity: 0;
    }
    50% {
      opacity: 0;
    }
    100% {
      opacity: 1;
    }
  }
  .animate-delayedFadeIn {
    animation: delayedFadeIn 1.2s ease-out;
  }

  @keyframes successPulse {
    0%,
    100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.05);
    }
  }
  .animate-successPulse {
    animation: successPulse 2s ease-in-out infinite;
  }

  @keyframes checkScale {
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
  .animate-checkScale {
    animation: checkScale 0.6s ease-out 0.3s both;
  }

  @keyframes checkDraw {
    0% {
      stroke-dasharray: 80;
      stroke-dashoffset: 80;
    }
    100% {
      stroke-dasharray: 80;
      stroke-dashoffset: 0;
    }
  }
  .animate-checkDraw {
    animation: checkDraw 0.4s ease-out 0.6s both;
  }
</style>
