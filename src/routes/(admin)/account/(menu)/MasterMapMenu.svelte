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
  import { operationApi } from "$lib/api/operationApi"
  import { Map, ChevronLeft } from "lucide-svelte"

  import MapManager from "./MapManager.svelte" // Combined component
  import OperationsManager from "./OperationsManager.svelte"
  import InviteManager from "./InviteManager.svelte"
  import DisplayPanel from "./DisplayPanel.svelte"
  import MainMenu from "./MainMenu.svelte"

  // Navigation state
  let navigationStack = ["main"]
  let isLoading = false
  let loadingAction = null

  // State for child components
  let userMaps = []
  let recentMaps = []

  $: isConnected = $connectedMapStore?.id
  $: isOwner = $connectedMapStore?.is_owner
  $: currentView = navigationStack[navigationStack.length - 1]

  onMount(async () => {
    await fetchUserMaps()
    await fetchRecentMaps()
  })

  // Navigation functions
  function navigateTo(view) {
    navigationStack = [...navigationStack, view]
    if (view === "connect" || view === "switch-map") {
      fetchUserMaps()
      fetchRecentMaps()
    }
  }

  function goBack() {
    if (navigationStack.length > 1) {
      navigationStack = navigationStack.slice(0, -1)
    }
  }

  function resetToMain() {
    navigationStack = ["main"]
  }

  // Fetch user's own maps
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

  // Fetch recent maps
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

  // Map connection handlers
  async function handleCreateMap(mapName, mapId) {
    isLoading = true
    loadingAction = "create"

    try {
      const result = await mapApi.createAndJoinMap(mapName, mapId)

      if (result.success && result.data) {
        const {
          mapId: createdMapId,
          mapName: createdMapName,
          connectedMap,
          mapActivity,
          operation,
        } = result.data

        connectedMapStore.set(connectedMap)
        mapActivityStore.set(mapActivity)
        operationStore.set([operation])
        selectedOperationStore.set(operation)

        if ($profileStore) {
          let recentMaps = $profileStore.recent_maps || []
          recentMaps = recentMaps.filter((id) => id !== createdMapId)
          recentMaps.unshift(createdMapId)
          recentMaps = recentMaps.slice(0, 10)

          profileStore.update((profile) => ({
            ...profile,
            master_map_id: createdMapId,
            recent_maps: recentMaps,
            selected_operation_id: operation.id,
          }))
        }

        toast.success("Map created successfully")
        resetToMain()
        await fetchUserMaps()
        await fetchRecentMaps()
        return { success: true }
      } else {
        toast.error(`Failed to create map: ${result.message}`)
        return { success: false, message: result.message }
      }
    } catch (error) {
      toast.error(`Error: ${error.message}`)
      return { success: false, message: error.message }
    } finally {
      isLoading = false
      loadingAction = null
    }
  }

  async function handleConnectToMap(mapId) {
    const trimmedMapId = mapId.trim()
    if (!trimmedMapId) {
      toast.error("Please enter a valid map ID")
      return { success: false }
    }

    isLoading = true
    loadingAction = `connect-${mapId}`

    try {
      const result = await mapApi.connectToMap(trimmedMapId)

      if (result.success && result.data) {
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

        toast.success("Connected to map successfully")
        resetToMain()
        await fetchUserMaps()
        await fetchRecentMaps()
        return { success: true }
      } else {
        toast.error(`Failed to connect to map: ${result.message}`)
        return { success: false, message: result.message }
      }
    } catch (error) {
      toast.error(`Error: ${error.message}`)
      return { success: false, message: error.message }
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
        resetToMain()
        await fetchUserMaps()
        await fetchRecentMaps()
        return { success: true }
      } else {
        toast.error(`Failed to disconnect: ${result.message}`)
        return { success: false, message: result.message }
      }
    } catch (error) {
      toast.error(`Error: ${error.message}`)
      return { success: false, message: error.message }
    } finally {
      isLoading = false
      loadingAction = null
    }
  }

  // Map settings handlers
  async function handleRenameMap(newName) {
    if (!newName.trim()) {
      toast.error("Map name cannot be empty")
      return { success: false }
    }

    isLoading = true
    loadingAction = "rename"

    try {
      const result = await mapApi.renameMap(
        $connectedMapStore.id,
        newName.trim(),
      )

      if (result.success) {
        connectedMapStore.update((store) => ({
          ...store,
          map_name: newName.trim(),
        }))
        toast.success("Map renamed successfully")
        return { success: true }
      } else {
        toast.error(`Failed to rename map: ${result.message}`)
        return { success: false, message: result.message }
      }
    } catch (error) {
      toast.error(`Error: ${error.message}`)
      return { success: false, message: error.message }
    } finally {
      isLoading = false
      loadingAction = null
    }
  }

  async function handleDeleteMap() {
    toast.success("Delete functionality - stubbed for now")
    resetToMain()
    return { success: true }
  }

  // Operation handlers
  async function handleCreateOperation(name, year, description) {
    if (!name.trim()) {
      toast.error("Operation name is required")
      return { success: false }
    }

    const master_map_id = $operationStore[0]?.master_map_id
    if (!master_map_id) {
      toast.error("No map is currently selected")
      return { success: false }
    }

    isLoading = true
    loadingAction = "create-operation"

    try {
      const result = await operationApi.addOperation(
        master_map_id,
        name.trim(),
        Number(year),
        description.trim(),
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

        goBack()
        toast.success("Operation created successfully")
        return { success: true }
      } else {
        toast.error(`Failed to create operation: ${result.message}`)
        return { success: false, message: result.message }
      }
    } catch (error) {
      toast.error(`Error: ${error.message}`)
      return { success: false, message: error.message }
    } finally {
      isLoading = false
      loadingAction = null
    }
  }

  async function handleUpdateOperation(operationId, name, year, description) {
    if (!name.trim()) {
      toast.error("Operation name is required")
      return { success: false }
    }

    isLoading = true
    loadingAction = "update-operation"

    const updatedOperation = {
      id: operationId,
      name: name.trim(),
      year: Number(year),
      description: description.trim(),
      master_map_id: $selectedOperationStore.master_map_id,
    }

    try {
      const result = await operationApi.updateOperation(operationId, {
        name: name.trim(),
        year: Number(year),
        description: description.trim(),
      })

      if (result.success) {
        operationStore.update((ops) =>
          ops.map((op) => (op.id === operationId ? updatedOperation : op)),
        )
        selectedOperationStore.set(updatedOperation)
        goBack()
        toast.success("Operation updated successfully")
        return { success: true }
      } else {
        toast.error(`Failed to update operation: ${result.message}`)
        return { success: false, message: result.message }
      }
    } catch (error) {
      toast.error(`Error: ${error.message}`)
      return { success: false, message: error.message }
    } finally {
      isLoading = false
      loadingAction = null
    }
  }

  async function handleDeleteOperation(operationId) {
    if ($operationStore.length <= 1) {
      toast.error("Cannot delete the only operation")
      return { success: false }
    }

    isLoading = true
    loadingAction = "delete-operation"

    try {
      const result = await operationApi.deleteOperation(operationId)

      if (result.success) {
        operationStore.update((ops) =>
          ops.filter((op) => op.id !== operationId),
        )

        const newSelectedOperation = $operationStore.find(
          (op) => op.id !== operationId,
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

        goBack()
        toast.success("Operation deleted successfully")
        return { success: true }
      } else {
        toast.error(`Failed to delete operation: ${result.message}`)
        return { success: false, message: result.message }
      }
    } catch (error) {
      toast.error(`Error: ${error.message}`)
      return { success: false, message: error.message }
    } finally {
      isLoading = false
      loadingAction = null
    }
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
          return { success: false }
        }

        selectedOperationStore.set(selectedOperation)
        profileStore.update((profile) => ({
          ...profile,
          selected_operation_id: operationId,
        }))

        toast.success("Operation switched successfully")
        return { success: true }
      } catch (error) {
        toast.error("Failed to update selected operation")
        return { success: false }
      } finally {
        isLoading = false
        loadingAction = null
      }
    }
  }

  // Get page title
  function getPageTitle() {
    const titles = {
      main: "Map Manager",
      create: "Create New Map",
      connect: "Connect to Map",
      "switch-map": "Switch Map",
      settings: "Map Settings",
      operations: "Operations",
      "create-operation": "Create Operation",
      "edit-operation": "Edit Operation",
      invite: "Invite Team Members",
      "delete-confirm": "Delete Map",
    }
    return titles[currentView] || "Map Manager"
  }
</script>

<!-- Map Manager Component -->
<div
  class="mb-6 overflow-hidden rounded-xl border border-base-300 bg-base-100 shadow-lg"
>
  <!-- Header with accent line -->
  <div class="relative">
    <div class="h-1 w-full bg-base-content"></div>
    <div class="flex items-center justify-between border-b border-base-300 p-4">
      <h2
        class="flex items-center gap-2 text-lg font-bold text-contrast-content"
      >
        <Map class="h-5 w-5" />
        {getPageTitle()}
      </h2>
    </div>
  </div>

  <!-- Main Content -->
  <div class="flex min-h-[400px] flex-col md:flex-row">
    <!-- Display Info Section -->
    <div
      class="w-full border-b border-base-300 md:order-2 md:w-1/3 md:border-b-0 md:border-l"
    >
      <DisplayPanel
        {currentView}
        {isConnected}
        {isOwner}
        connectedMap={$connectedMapStore}
        operations={$operationStore}
        selectedOperation={$selectedOperationStore}
        {handleOperationSelect}
        {isLoading}
        {loadingAction}
      />
    </div>

    <!-- Interactive Menu Section -->
    <div class="w-full md:order-1 md:w-2/3">
      <div class="p-6">
        {#if currentView === "main"}
          <MainMenu {isConnected} {navigateTo} />
        {:else if ["create", "connect", "switch-map", "settings", "delete-confirm"].includes(currentView)}
          <MapManager
            {currentView}
            {isLoading}
            {loadingAction}
            {userMaps}
            {recentMaps}
            {isConnected}
            {isOwner}
            connectedMap={$connectedMapStore}
            {goBack}
            {navigateTo}
            {handleCreateMap}
            {handleConnectToMap}
            {handleRenameMap}
            {handleDeleteMap}
            {handleDisconnectFromMap}
          />
        {:else if ["operations", "create-operation", "edit-operation"].includes(currentView)}
          <OperationsManager
            {currentView}
            {isLoading}
            {loadingAction}
            operations={$operationStore}
            selectedOperation={$selectedOperationStore}
            {goBack}
            {navigateTo}
            {handleCreateOperation}
            {handleUpdateOperation}
            {handleDeleteOperation}
            {handleOperationSelect}
          />
        {:else if currentView === "invite"}
          <InviteManager connectedMap={$connectedMapStore} {goBack} />
        {/if}
      </div>
    </div>
  </div>
</div>
