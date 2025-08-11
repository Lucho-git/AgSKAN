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
  import {
    Map,
    Plus,
    Search,
    Settings,
    LogOut,
    Trash2,
    User,
    Calendar,
    Copy,
    Check,
    Edit3,
    Save,
    X,
    Clock,
    Link2,
    Globe,
    MapPin,
    Zap,
    ChevronDown,
    ChevronRight,
    ArrowLeft,
    ChevronLeft,
    FileText,
    Pencil,
    UserPlus,
    Share2,
    Phone,
    Mail,
    Link,
    Home,
    Cloud,
    BarChart3,
    Info,
    Layers,
    AlertTriangle,
  } from "lucide-svelte"

  // ========================================
  // NAVIGATION & STATE MANAGEMENT
  // ========================================

  // Navigation state - tracks the current menu path
  let navigationStack = ["main"]
  let isLoading = false
  let loadingAction = null

  // Reactive values
  $: isConnected = $connectedMapStore?.id
  $: isOwner = $connectedMapStore?.is_owner
  $: currentView = navigationStack[navigationStack.length - 1]
  $: currentYear = new Date().getFullYear()
  $: yearOptions = Array.from({ length: 10 }, (_, i) => currentYear - 5 + i)
  $: isOnlyOperation = $operationStore.length <= 1

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

  function navigateToPath(index) {
    if (index === 0) {
      navigationStack = ["main"]
    } else {
      navigationStack = navigationStack.slice(0, index + 1)
    }
  }

  // Get breadcrumb data
  function getBreadcrumbs() {
    const breadcrumbMap = {
      main: { label: "Map Manager", icon: Map },
      create: { label: "Create Map", icon: Plus },
      connect: { label: "Connect", icon: Search },
      "switch-map": { label: "Switch Map", icon: Link2 },
      settings: { label: "Settings", icon: Settings },
      operations: { label: "Operations", icon: MapPin },
      "create-operation": { label: "Create Operation", icon: Plus },
      "edit-operation": { label: "Edit Operation", icon: Pencil },
      invite: { label: "Invite Team", icon: UserPlus },
      "delete-confirm": { label: "Delete Map", icon: Trash2 },
    }

    return navigationStack.map((view, index) => ({
      ...breadcrumbMap[view],
      view,
      index,
      isLast: index === navigationStack.length - 1,
    }))
  }

  // ========================================
  // CREATE MAP STATE & FUNCTIONS
  // ========================================

  let newMapName = ""
  let generatedMapId = uuidv4()

  async function handleCreateMap() {
    if (!newMapName.trim()) {
      toast.error("Please enter a map name")
      return
    }

    operationStartTime = Date.now()
    isLoading = true
    loadingAction = "create"
    createMapStatus = "loading"

    try {
      const result = await mapApi.createAndJoinMap(newMapName, generatedMapId)

      const elapsedTime = Date.now() - operationStartTime
      const remainingTime = Math.max(0, MIN_ANIMATION_TIME - elapsedTime)

      if (remainingTime > 0) {
        await new Promise((resolve) => setTimeout(resolve, remainingTime))
      }

      if (result.success && result.data) {
        const { mapId, mapName, connectedMap, mapActivity, operation } =
          result.data

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

        // Show success animation
        createMapStatus = "success"
        toast.success("Map created successfully")

        // Navigate after success animation
        setTimeout(() => {
          resetToMain()
          newMapName = ""
          generatedMapId = uuidv4()
          createMapStatus = null
        }, SUCCESS_DISPLAY_TIME)
      } else {
        createMapStatus = null
        toast.error(`Failed to create map: ${result.message}`)
      }
    } catch (error) {
      createMapStatus = null
      toast.error(`Error: ${error.message}`)
    } finally {
      isLoading = false
      loadingAction = null
    }
  }

  // ========================================
  // CONNECT TO MAP STATE & FUNCTIONS
  // ========================================

  let enteredMapId = ""
  let isValidMapId = false
  let userMaps = []
  let recentMaps = []

  // Map ID validation
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

  // Animation timing and status for create map
  let createMapStatus = null // 'loading' | 'success' | null
  let operationStartTime = 0
  const MIN_ANIMATION_TIME = 2000 // 2 seconds minimum
  const SUCCESS_DISPLAY_TIME = 2500 // 2.5 seconds for success state

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

  // Connect to map
  async function connectToMap(mapId) {
    const trimmedMapId = mapId.trim()
    if (!trimmedMapId) {
      toast.error("Please enter a valid map ID")
      return
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
        enteredMapId = ""
        await fetchUserMaps()
        await fetchRecentMaps()
      } else {
        toast.error(`Failed to connect to map: ${result.message}`)
      }
    } catch (error) {
      toast.error(`Error: ${error.message}`)
    } finally {
      isLoading = false
      loadingAction = null
    }
  }

  // ========================================
  // MAP SETTINGS STATE & FUNCTIONS
  // ========================================

  let isRenaming = false
  let newMapNameInput = ""
  let copied = false

  // Disconnect from map
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

  // Copy map ID
  function copyMapId() {
    if ($connectedMapStore?.id) {
      navigator.clipboard.writeText($connectedMapStore.id)
      copied = true
      setTimeout(() => (copied = false), 2000)
    }
  }

  // Rename map
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

  // ========================================
  // DELETE MAP FUNCTIONALITY
  // ========================================

  let confirmationInput = ""
  let deleteLoadingStage = null // 'confirming' | 'deleting' | null
  let deleteCountdown = 0
  let countdownInterval = null

  $: mapName = $connectedMapStore?.map_name || "Unnamed Map"
  $: mapId = $connectedMapStore?.id || ""
  $: isConfirmationValid =
    confirmationInput.toLowerCase() === mapId.slice(0, 8).toLowerCase()

  function updateStoresAfterDelete() {
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
  }

  function startDeleteCountdown() {
    deleteLoadingStage = "confirming"
    deleteCountdown = 5

    countdownInterval = setInterval(() => {
      deleteCountdown -= 1
      if (deleteCountdown <= 0) {
        clearInterval(countdownInterval)
        executeDelete()
      }
    }, 1000)
  }

  function cancelDelete() {
    if (countdownInterval) {
      clearInterval(countdownInterval)
      countdownInterval = null
    }
    deleteLoadingStage = null
    deleteCountdown = 0
    confirmationInput = ""
  }

  async function executeDelete() {
    deleteLoadingStage = "deleting"

    try {
      const result = await mapApi.deleteMap(mapId)

      if (result.success) {
        updateStoresAfterDelete()
        toast.success("Map deleted successfully")
        resetToMain()

        // Reset delete state
        deleteLoadingStage = null
        confirmationInput = ""
      } else {
        toast.error(`Failed to delete map: ${result.message}`)
        deleteLoadingStage = null
      }
    } catch (error) {
      toast.error(`An error occurred: ${error.message}`)
      deleteLoadingStage = null
    }
  }

  function handleDeleteMap() {
    if (!isConfirmationValid || deleteLoadingStage) return
    startDeleteCountdown()
  }

  // ========================================
  // OPERATIONS STATE & FUNCTIONS
  // ========================================

  let newOperationName = ""
  let newOperationYear = new Date().getFullYear()
  let newOperationDescription = ""
  let editOperationName = ""
  let editOperationYear = new Date().getFullYear()
  let editOperationDescription = ""
  let deleteOperationCountdown = 0
  let deleteOperationInterval = null
  let isConfirmingOperationDelete = false

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

        goBack()
        toast.success("Operation created successfully")
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

        toast.success("Operation switched successfully")
      } catch (error) {
        toast.error("Failed to update selected operation")
      } finally {
        isLoading = false
        loadingAction = null
      }
    }
  }

  function prepareEditOperation() {
    if ($selectedOperationStore) {
      editOperationName = $selectedOperationStore.name
      editOperationYear = $selectedOperationStore.year
      editOperationDescription = $selectedOperationStore.description || ""
      navigateTo("edit-operation")
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
        goBack()
        toast.success("Operation updated successfully")
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

  function startOperationDeleteCountdown() {
    isConfirmingOperationDelete = true
    deleteOperationCountdown = 5 // 3 seconds for operations (less critical)

    deleteOperationInterval = setInterval(() => {
      deleteOperationCountdown -= 1
      if (deleteOperationCountdown <= 0) {
        clearInterval(deleteOperationInterval)
        executeOperationDelete()
      }
    }, 1000)
  }

  function cancelOperationDelete() {
    if (deleteOperationInterval) {
      clearInterval(deleteOperationInterval)
      deleteOperationInterval = null
    }
    isConfirmingOperationDelete = false
    deleteOperationCountdown = 0
  }

  async function executeOperationDelete() {
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

        // Reset delete state
        isConfirmingOperationDelete = false
        deleteOperationCountdown = 0

        goBack()
        toast.success("Operation deleted successfully")
      } else {
        toast.error(`Failed to delete operation: ${result.message}`)
        isConfirmingOperationDelete = false
      }
    } catch (error) {
      toast.error(`Error: ${error.message}`)
      isConfirmingOperationDelete = false
    } finally {
      isLoading = false
      loadingAction = null
    }
  }

  function handleDeleteOperation() {
    if (isOnlyOperation || isConfirmingOperationDelete || isLoading) return
    startOperationDeleteCountdown()
  }

  // ========================================
  // INVITE TEAM MEMBERS STATE & FUNCTIONS
  // ========================================

  let mapIdCopied = false
  let linkCopied = false

  function copyInviteMapId() {
    if ($connectedMapStore?.id) {
      navigator.clipboard.writeText($connectedMapStore.id)
      mapIdCopied = true
      setTimeout(() => (mapIdCopied = false), 2000)
      toast.success("Map ID copied to clipboard")
    }
  }

  function copyInviteLink() {
    const shareUrl = `https://www.skanfarming.com.au/login?map_id=${$connectedMapStore.id}`
    navigator.clipboard.writeText(shareUrl)
    linkCopied = true
    setTimeout(() => (linkCopied = false), 2000)
    toast.success("Link copied to clipboard")
  }

  function shareViaSMS() {
    const shareUrl = `https://www.skanfarming.com.au/login?map_id=${$connectedMapStore.id}`
    const messageText = `Join my SKAN farming map using this link: ${shareUrl}`
    const encodedMessage = encodeURIComponent(messageText)
    window.location.href = `sms:?&body=${encodedMessage}`
  }

  function shareViaEmail() {
    const shareUrl = `https://www.skanfarming.com.au/login?map_id=${$connectedMapStore.id}`
    const emailSubject = "Join my SKAN farming map"
    const messageText = `Join my SKAN farming map using this link: ${shareUrl}`
    const encodedSubject = encodeURIComponent(emailSubject)
    const encodedBody = encodeURIComponent(messageText)
    window.location.href = `mailto:?subject=${encodedSubject}&body=${encodedBody}`
  }

  // ========================================
  // LIFECYCLE
  // ========================================

  onMount(async () => {
    await fetchUserMaps()
    await fetchRecentMaps()
  })
</script>

<!-- ========================================
     MAIN COMPONENT TEMPLATE
     ======================================== -->

<!-- Map Manager Component -->
<div class="mb-8">
  <!-- Main Content - Two separate components -->
  <div class="relative grid grid-cols-1 gap-8 lg:grid-cols-2">
    <!-- ========================================
         LEFT COMPONENT - Map Settings & Actions
         ======================================== -->
    <div
      class="rounded-xl border border-base-300 bg-base-100 shadow-lg transition-all duration-300 hover:shadow-xl"
    >
      <!-- Left Section Header with Breadcrumbs -->
      <div
        class="mx-6 grid min-h-[5rem] grid-cols-[auto_1fr_auto] items-center gap-4 border-b border-base-300 px-0 py-4"
      >
        <div
          class="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/20 shadow-sm"
        >
          <Map size={20} className="text-green-500" />
        </div>
        <div class="min-w-0 flex-1">
          <!-- Breadcrumb Navigation -->
          <div class="flex min-w-0 flex-1 items-center gap-1">
            <!-- Always show main breadcrumb -->
            <div class="flex h-6 items-center">
              <button
                class="flex items-center gap-2 rounded px-1 py-0.5 text-contrast-content transition-colors hover:text-contrast-content/80 {currentView ===
                'main'
                  ? 'cursor-default'
                  : 'hover:bg-base-200'}"
                on:click={() => navigateToPath(0)}
                disabled={currentView === "main"}
              >
                <span
                  class="text-lg font-semibold {currentView === 'main'
                    ? 'inline'
                    : 'hidden sm:inline'}">Map Manager</span
                >
              </button>
            </div>

            <!-- Show additional breadcrumbs if not on main -->
            {#if currentView !== "main"}
              <ChevronRight
                class="h-4 w-4 flex-shrink-0 text-contrast-content/40"
              />

              <!-- For multi-level navigation, show intermediate steps -->
              {#if navigationStack.length > 2}
                {#each navigationStack.slice(1, -1) as view, index}
                  <div class="flex h-6 items-center">
                    <button
                      class="flex items-center gap-1 rounded px-1 py-0.5 text-sm font-medium text-contrast-content/70 transition-colors hover:bg-base-200 hover:text-contrast-content"
                      on:click={() => navigateToPath(index + 1)}
                    >
                      {#if view === "create"}
                        <Plus class="h-3 w-3 flex-shrink-0" />
                        <span class="hidden truncate sm:inline">Create</span>
                      {:else if view === "connect"}
                        <Search class="h-3 w-3 flex-shrink-0" />
                        <span class="hidden truncate sm:inline">Connect</span>
                      {:else if view === "switch-map"}
                        <Link2 class="h-3 w-3 flex-shrink-0" />
                        <span class="hidden truncate sm:inline">Switch</span>
                      {:else if view === "settings"}
                        <Settings class="h-3 w-3 flex-shrink-0" />
                        <span class="hidden truncate sm:inline">Settings</span>
                      {:else if view === "operations"}
                        <MapPin class="h-3 w-3 flex-shrink-0" />
                        <span class="hidden truncate sm:inline">Operations</span
                        >
                      {:else if view === "create-operation"}
                        <Plus class="h-3 w-3 flex-shrink-0" />
                        <span class="hidden truncate sm:inline">Create Op</span>
                      {:else if view === "edit-operation"}
                        <Pencil class="h-3 w-3 flex-shrink-0" />
                        <span class="hidden truncate sm:inline">Edit Op</span>
                      {:else if view === "invite"}
                        <UserPlus class="h-3 w-3 flex-shrink-0" />
                        <span class="hidden truncate sm:inline">Invite</span>
                      {:else if view === "delete-confirm"}
                        <Trash2 class="h-3 w-3 flex-shrink-0" />
                        <span class="hidden truncate sm:inline">Delete</span>
                      {:else}
                        <span class="hidden truncate sm:inline">{view}</span>
                      {/if}
                    </button>
                  </div>
                  <ChevronRight
                    class="h-4 w-4 flex-shrink-0 text-contrast-content/40"
                  />
                {/each}
              {/if}

              <!-- Current page breadcrumb (always highlighted) -->
              <div class="flex h-6 items-center">
                <div
                  class="flex cursor-default items-center gap-1 rounded bg-base-200 px-2 py-1 text-sm font-medium text-contrast-content"
                >
                  {#if currentView === "create"}
                    <Plus class="h-3 w-3 flex-shrink-0" />
                    <span class="truncate">Create</span>
                  {:else if currentView === "connect"}
                    <Search class="h-3 w-3 flex-shrink-0" />
                    <span class="truncate">Connect</span>
                  {:else if currentView === "switch-map"}
                    <Link2 class="h-3 w-3 flex-shrink-0" />
                    <span class="truncate">Switch</span>
                  {:else if currentView === "settings"}
                    <Settings class="h-3 w-3 flex-shrink-0" />
                    <span class="truncate">Settings</span>
                  {:else if currentView === "operations"}
                    <MapPin class="h-3 w-3 flex-shrink-0" />
                    <span class="truncate">Operations</span>
                  {:else if currentView === "create-operation"}
                    <Plus class="h-3 w-3 flex-shrink-0" />
                    <span class="truncate">Create Op</span>
                  {:else if currentView === "edit-operation"}
                    <Pencil class="h-3 w-3 flex-shrink-0" />
                    <span class="truncate">Edit Op</span>
                  {:else if currentView === "invite"}
                    <UserPlus class="h-3 w-3 flex-shrink-0" />
                    <span class="truncate">Invite</span>
                  {:else if currentView === "delete-confirm"}
                    <Trash2 class="h-3 w-3 flex-shrink-0" />
                    <span class="truncate">Delete</span>
                  {:else}
                    <span class="truncate">{currentView}</span>
                  {/if}
                </div>
              </div>
            {/if}
          </div>
        </div>

        <!-- Back Button - Mobile only -->
        {#if navigationStack.length > 1}
          <button
            class="ml-2 flex h-8 items-center gap-1 rounded bg-base-200 px-2 py-1 text-sm font-medium text-contrast-content transition-colors hover:bg-base-300 lg:hidden"
            on:click={goBack}
          >
            <ChevronLeft class="h-4 w-4" />
            <span class="hidden sm:inline">Back</span>
          </button>
        {/if}
      </div>

      <!-- Mobile Back Button - Below header bar -->
      {#if navigationStack.length > 1}
        <div class="px-6 pt-4 lg:hidden">
          <button
            class="flex items-center gap-2 rounded-lg bg-base-200 px-3 py-2 text-sm font-medium text-contrast-content transition-colors hover:bg-base-300"
            on:click={goBack}
          >
            <ArrowLeft class="h-4 w-4" />
            Back to Main Menu
          </button>
        </div>
      {/if}

      <!-- Content based on current view -->
      <div class="space-y-6 p-6">
        {#if currentView === "main"}
          <!-- Main Menu Actions -->
          <div class="space-y-3">
            {#if !isConnected}
              <!-- Disconnected State Main Menu -->
              <div class="mb-6 text-center">
                <p class="text-sm text-contrast-content/60">
                  Get started with map management
                </p>
              </div>

              <button
                class="group flex w-full items-center justify-between rounded-lg bg-base-content px-4 py-3 text-base-100 transition-colors hover:bg-base-content/90"
                on:click={() => navigateTo("create")}
              >
                <div class="flex items-center gap-3">
                  <div
                    class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded bg-base-100/20"
                  >
                    <Plus class="h-5 w-5 text-base-100" />
                  </div>
                  <div class="text-left">
                    <div class="text-sm font-bold">Create New Map</div>
                    <div class="text-xs font-medium text-base-100/70">
                      Start a new farm map
                    </div>
                  </div>
                </div>
                <ChevronRight
                  class="h-4 w-4 transition-transform group-hover:translate-x-1"
                />
              </button>

              <button
                class="group flex w-full items-center justify-between rounded-lg bg-base-200 px-4 py-3 text-contrast-content transition-colors hover:bg-base-300"
                on:click={() => navigateTo("connect")}
              >
                <div class="flex items-center gap-3">
                  <div
                    class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded bg-base-100"
                  >
                    <Search class="h-5 w-5 text-contrast-content/60" />
                  </div>
                  <div class="text-left">
                    <div class="text-sm font-bold text-contrast-content">
                      Connect to Map
                    </div>
                    <div class="text-xs font-medium text-contrast-content/60">
                      Join an existing map
                    </div>
                  </div>
                </div>
                <ChevronRight
                  class="h-4 w-4 transition-transform group-hover:translate-x-1"
                />
              </button>
            {:else}
              <!-- Connected State Main Menu -->
              <button
                class="group flex w-full items-center justify-between rounded-lg bg-base-content px-4 py-4 text-base-100 transition-colors hover:bg-base-content/90"
                on:click={() => (window.location.href = "/account/mapviewer")}
              >
                <div class="flex items-center gap-3">
                  <div
                    class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded bg-base-100/20"
                  >
                    <Globe class="h-5 w-5 text-base-100" />
                  </div>
                  <div class="text-left">
                    <div class="text-sm font-bold">Launch Map</div>
                    <div class="text-xs font-medium text-base-100/70">
                      View your interactive map
                    </div>
                  </div>
                </div>
                <ChevronRight
                  class="h-4 w-4 transition-transform group-hover:translate-x-1"
                />
              </button>

              <button
                class="group flex w-full items-center justify-between rounded-lg bg-base-200 px-4 py-4 text-contrast-content transition-colors hover:bg-base-300"
                on:click={() => navigateTo("settings")}
              >
                <div class="flex items-center gap-3">
                  <div
                    class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded bg-base-100"
                  >
                    <Settings class="h-5 w-5 text-contrast-content/60" />
                  </div>
                  <div class="text-left">
                    <div class="text-sm font-bold text-contrast-content">
                      Map Settings
                    </div>
                    <div class="text-xs font-medium text-contrast-content/60">
                      Configure map preferences
                    </div>
                  </div>
                </div>
                <ChevronRight
                  class="h-4 w-4 transition-transform group-hover:translate-x-1"
                />
              </button>

              <button
                class="group flex w-full items-center justify-between rounded-lg bg-base-200 px-4 py-4 text-contrast-content transition-colors hover:bg-base-300"
                on:click={() => navigateTo("operations")}
              >
                <div class="flex items-center gap-3">
                  <div
                    class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded bg-base-100"
                  >
                    <MapPin class="h-5 w-5 text-contrast-content/60" />
                  </div>
                  <div class="text-left">
                    <div class="text-sm font-bold text-contrast-content">
                      Manage Operations
                    </div>
                    <div class="text-xs font-medium text-contrast-content/60">
                      Add, edit, and organize operations
                    </div>
                  </div>
                </div>
                <ChevronRight
                  class="h-4 w-4 transition-transform group-hover:translate-x-1"
                />
              </button>

              <button
                class="group flex w-full items-center justify-between rounded-lg bg-base-200 px-4 py-4 text-contrast-content transition-colors hover:bg-base-300"
                on:click={() => navigateTo("invite")}
              >
                <div class="flex items-center gap-3">
                  <div
                    class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded bg-base-100"
                  >
                    <UserPlus class="h-5 w-5 text-contrast-content/60" />
                  </div>
                  <div class="text-left">
                    <div class="text-sm font-bold text-contrast-content">
                      Invite Team Members
                    </div>
                    <div class="text-xs font-medium text-contrast-content/60">
                      Share map access with others
                    </div>
                  </div>
                </div>
                <ChevronRight
                  class="h-4 w-4 transition-transform group-hover:translate-x-1"
                />
              </button>
            {/if}
          </div>

          <!-- Mobile View - Include Right Component Content -->
          <div class="mt-8 border-t border-base-300 pt-6 lg:hidden">
            {#if isConnected}
              <!-- Connected Map Display for Mobile -->
              <div class="space-y-3">
                <!-- Connected Map Info Card -->
                <div class="flex items-center gap-3 rounded-lg bg-base-200 p-4">
                  <div
                    class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded bg-green-600/20"
                  >
                    <Map class="h-5 w-5 text-green-600" />
                  </div>
                  <div class="min-w-0 flex-1">
                    <div
                      class="truncate text-sm font-semibold text-contrast-content"
                    >
                      {$connectedMapStore.map_name}
                    </div>
                    <div class="text-xs text-contrast-content/60">
                      Owned by {$connectedMapStore.owner}
                    </div>
                  </div>
                </div>

                <!-- Current Operation Display -->
                <div class="rounded-lg bg-base-200 p-4">
                  <div class="mb-3 flex items-center gap-3">
                    <div
                      class="flex h-8 w-8 items-center justify-center rounded bg-primary/20"
                    >
                      <div class="h-3 w-3 rounded-full bg-primary"></div>
                    </div>
                    <span class="text-sm font-medium text-contrast-content"
                      >Active Operation</span
                    >
                  </div>

                  <div class="relative mb-3">
                    <select
                      class="w-full appearance-none rounded-lg border border-base-300 bg-base-100 p-2.5 pr-10 text-sm text-contrast-content outline-none transition-colors focus:border-base-content"
                      value={$selectedOperationStore?.id}
                      on:change={(e) => handleOperationSelect(e.target.value)}
                      disabled={isLoading &&
                        loadingAction.startsWith("select-")}
                    >
                      {#each $operationStore as operation}
                        <option value={operation.id}>
                          {operation.name} ({operation.year})
                        </option>
                      {/each}
                    </select>
                    <ChevronDown
                      class="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-contrast-content/60"
                    />
                  </div>

                  {#if $selectedOperationStore?.description}
                    <div class="text-xs text-contrast-content/60">
                      {$selectedOperationStore.description}
                    </div>
                  {/if}
                </div>

                <!-- Map ID Display -->
                <div class="flex items-center gap-3 rounded-lg bg-base-200 p-4">
                  <div
                    class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded bg-blue-600/20"
                  >
                    <Copy class="h-5 w-5 text-blue-600" />
                  </div>
                  <div class="min-w-0 flex-1">
                    <div class="text-sm font-bold text-contrast-content">
                      Map ID
                    </div>
                    <code
                      class="block truncate font-mono text-xs text-contrast-content/60"
                    >
                      {$connectedMapStore.id}
                    </code>
                  </div>
                  <button
                    class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-base-300"
                    on:click={copyMapId}
                    title="Copy Map ID"
                  >
                    {#if copied}
                      <Check class="h-4 w-4 text-green-500" />
                    {:else}
                      <Copy class="h-4 w-4 text-contrast-content/60" />
                    {/if}
                  </button>
                </div>
              </div>
            {:else}
              <!-- Not Connected Display for Mobile -->
              <div class="rounded-lg bg-base-200 p-8 text-center">
                <div
                  class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-base-300"
                >
                  <Map class="h-6 w-6 text-base-content/60" />
                </div>
                <h3 class="mb-2 font-semibold text-contrast-content">
                  Get Started
                </h3>
                <p class="text-sm text-contrast-content/60">
                  Create a new map or connect to an existing one to begin
                  tracking your farm operations.
                </p>
              </div>
            {/if}
          </div>
        {:else if currentView === "create"}
          <!-- Create Map Form -->
          <div class="space-y-6">
            <!-- Desktop Back Button -->
            <div class="hidden lg:block">
              <button
                class="flex items-center gap-2 rounded-lg bg-base-200 px-3 py-2 text-sm font-medium text-contrast-content transition-colors hover:bg-base-300"
                on:click={goBack}
              >
                <ArrowLeft class="h-4 w-4" />
                Back to Main Menu
              </button>
            </div>

            <div class="mb-6 text-center">
              <h4 class="mb-2 text-xl font-semibold text-contrast-content">
                Create New Map
              </h4>
              <p class="text-sm text-contrast-content/60">
                Set up a new farm map to start tracking your operations
              </p>
            </div>

            {#if createMapStatus === "loading"}
              <div class="rounded-lg border border-base-300 bg-blue-600/10 p-4">
                <div class="mb-1 text-sm font-semibold text-blue-600">
                  Creating Map...
                </div>
                <div class="text-xs text-contrast-content/70">
                  Setting up your farm map
                </div>
              </div>
            {:else if createMapStatus === "success"}
              <div
                class="rounded-lg border border-base-300 bg-green-600/10 p-4"
              >
                <div class="mb-1 text-sm font-semibold text-green-600">
                  Map Created!
                </div>
                <div class="text-xs text-contrast-content/70">
                  Your map is ready to use
                </div>
              </div>
            {:else if createMapStatus === "success"}
              <!-- Success State -->
              <div
                class="animate-map-scaleIn flex flex-col items-center gap-4 py-8"
              >
                <div
                  class="animate-map-successPulse flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20 shadow-lg shadow-green-500/10"
                >
                  <div
                    class="animate-map-checkScale flex h-14 w-14 items-center justify-center rounded-full bg-green-500"
                  >
                    <Check
                      size={28}
                      className="animate-map-checkDraw stroke-[3] text-white"
                    />
                  </div>
                </div>
                <p class="text-lg font-medium text-contrast-content">
                  Map Created Successfully!
                </p>
                <p
                  class="rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1 text-sm text-green-400"
                >
                  {newMapName || "New Map"}
                </p>
                <p
                  class="animate-map-delayedFadeIn mt-2 text-sm text-contrast-content/60"
                >
                  Map setup complete!
                </p>
              </div>
            {:else}
              <!-- Form State -->
              <div class="space-y-6">
                <!-- Map Code Display -->
                <div class="rounded-xl border border-base-300 bg-base-200 p-4">
                  <div class="mb-2 flex items-center justify-between">
                    <h5 class="text-sm font-medium text-contrast-content">
                      Map ID
                    </h5>
                    <button
                      class="rounded-lg p-1.5 text-contrast-content/60 transition-colors hover:bg-base-300 hover:text-base-content"
                      title="Copy to clipboard"
                      on:click={() => {
                        navigator.clipboard.writeText(generatedMapId)
                        toast.success("Map ID copied to clipboard")
                      }}
                    >
                      <Copy size={14} />
                    </button>
                  </div>
                  <code
                    class="block break-all rounded-lg bg-blue-600/10 px-3 py-2 font-mono text-sm text-blue-600"
                  >
                    {generatedMapId}
                  </code>
                  <p class="mt-2 text-xs text-contrast-content/60">
                    This is your unique map identifier
                  </p>
                </div>

                <form
                  on:submit|preventDefault={handleCreateMap}
                  class="space-y-6"
                >
                  <div class="space-y-2">
                    <label
                      class="mb-2 flex items-center gap-2 text-sm font-medium text-contrast-content"
                    >
                      <div class="rounded-full bg-base-content/20 p-1.5">
                        <Map size={14} className="text-base-content" />
                      </div>
                      Map Name<span class="text-base-content">*</span>
                    </label>
                    <input
                      type="text"
                      bind:value={newMapName}
                      placeholder="e.g. North Field Operations"
                      class="w-full rounded-xl border border-base-300 bg-base-200 p-3.5 text-contrast-content transition-colors placeholder:text-contrast-content/60 focus:border-base-content focus:outline-none focus:ring-1 focus:ring-base-content"
                      required
                    />
                  </div>

                  <div class="flex gap-3 pt-4">
                    <button
                      type="button"
                      on:click={goBack}
                      class="flex flex-1 items-center justify-center gap-2 rounded-xl border border-base-300 bg-base-200 py-3.5 font-medium text-contrast-content/60 transition-all hover:bg-base-300 hover:text-contrast-content"
                    >
                      <ArrowLeft size={16} />
                      Cancel
                    </button>

                    <button
                      type="submit"
                      disabled={isLoading}
                      class="flex flex-1 items-center justify-center gap-2 rounded-xl py-3.5 font-semibold transition-all {isLoading
                        ? 'cursor-not-allowed bg-base-content/70 text-base-100/70'
                        : 'bg-base-content text-base-100 hover:bg-base-content/90'} shadow-lg shadow-base-content/10 hover:shadow-base-content/20"
                    >
                      <span>Create Map</span>
                      <Plus size={16} />
                    </button>
                  </div>
                </form>
              </div>
            {/if}
          </div>
        {:else if currentView === "connect" || currentView === "switch-map"}
          <!-- Connect/Switch Map Content -->
          <div class="space-y-6">
            <!-- Desktop Back Button -->
            <div class="hidden lg:block">
              <button
                class="flex items-center gap-2 rounded-lg bg-base-200 px-3 py-2 text-sm font-medium text-contrast-content transition-colors hover:bg-base-300"
                on:click={goBack}
              >
                <ArrowLeft class="h-4 w-4" />
                Back to Main Menu
              </button>
            </div>

            <!-- Manual Connect -->
            <div>
              <label
                for="mapId"
                class="mb-2 block text-sm text-contrast-content/60"
              >
                Enter Map ID
              </label>
              <p class="mb-3 text-sm text-contrast-content/60">
                {currentView === "switch-map"
                  ? "Enter a Map ID to switch to a different map."
                  : "Paste the Map ID here to connect to an existing map."}
              </p>
              <div class="flex gap-2">
                <input
                  id="mapId"
                  type="text"
                  bind:value={enteredMapId}
                  on:input={checkMapIdValidity}
                  class="flex-1 rounded-lg border border-base-300 bg-base-200 p-2.5 text-contrast-content outline-none transition-colors focus:border-base-content"
                  placeholder="Map ID"
                />
                <button
                  type="button"
                  disabled={!isValidMapId || isLoading}
                  class="flex items-center gap-2 rounded-lg bg-base-content px-5 py-2.5 font-medium text-base-100 transition-colors hover:bg-base-content/90 {!isValidMapId ||
                  isLoading
                    ? 'cursor-not-allowed opacity-50'
                    : ''}"
                  on:click={() => connectToMap(enteredMapId)}
                >
                  {#if isLoading && loadingAction === `connect-${enteredMapId}`}
                    <div
                      class="animate-map-spin h-4 w-4 rounded-full border-2 border-current border-t-transparent"
                    ></div>
                  {:else}
                    <Link2 class="h-4 w-4" />
                  {/if}
                  {currentView === "switch-map" ? "Switch" : "Connect"}
                </button>
              </div>
            </div>

            <!-- Quick Connect Lists -->
            {#if recentMaps.length > 0 || userMaps.length > 0}
              <div class="space-y-4">
                {#if recentMaps.length > 0}
                  <div>
                    <h4
                      class="mb-3 flex items-center gap-2 font-medium text-contrast-content"
                    >
                      <Clock class="h-4 w-4" />
                      Recent Maps
                    </h4>
                    <div class="space-y-2">
                      {#each recentMaps.slice(0, 5) as map}
                        <button
                          class="group flex w-full items-center justify-between rounded-lg border border-base-300 bg-base-200 p-3 transition-colors hover:bg-base-300"
                          on:click={() => connectToMap(map.id)}
                          disabled={isLoading}
                        >
                          <div class="text-left">
                            <div
                              class="text-sm font-medium text-contrast-content"
                            >
                              {map.map_name}
                            </div>
                            <div class="text-xs text-contrast-content/60">
                              Owned by <strong>{map.owner_name}</strong>
                            </div>
                          </div>
                          {#if isLoading && loadingAction === `connect-${map.id}`}
                            <div
                              class="animate-map-spin h-4 w-4 rounded-full border-2 border-current border-t-transparent"
                            ></div>
                          {:else}
                            <ChevronRight
                              class="h-4 w-4 transition-transform group-hover:translate-x-1"
                            />
                          {/if}
                        </button>
                      {/each}
                    </div>
                  </div>
                {/if}

                {#if userMaps.length > 0}
                  <div>
                    <h4
                      class="mb-3 flex items-center gap-2 font-medium text-contrast-content"
                    >
                      <User class="h-4 w-4" />
                      Your Maps
                    </h4>
                    <div class="space-y-2">
                      {#each userMaps.slice(0, 5) as map}
                        <button
                          class="group flex w-full items-center justify-between rounded-lg border border-base-300 bg-base-200 p-3 transition-colors hover:bg-base-300"
                          on:click={() => connectToMap(map.id)}
                          disabled={isLoading}
                        >
                          <div class="text-left">
                            <div
                              class="text-sm font-medium text-contrast-content"
                            >
                              {map.map_name}
                            </div>
                            <div class="text-xs text-contrast-content/60">
                              You own this map
                            </div>
                          </div>
                          {#if isLoading && loadingAction === `connect-${map.id}`}
                            <div
                              class="animate-map-spin h-4 w-4 rounded-full border-2 border-current border-t-transparent"
                            ></div>
                          {:else}
                            <ChevronRight
                              class="h-4 w-4 transition-transform group-hover:translate-x-1"
                            />
                          {/if}
                        </button>
                      {/each}
                    </div>
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        {:else if currentView === "settings"}
          <!-- Map Settings Content -->
          <div class="space-y-6">
            <!-- Desktop Back Button -->
            <div class="hidden lg:block">
              <button
                class="flex items-center gap-2 rounded-lg bg-base-200 px-3 py-2 text-sm font-medium text-contrast-content transition-colors hover:bg-base-300"
                on:click={goBack}
              >
                <ArrowLeft class="h-4 w-4" />
                Back to Main Menu
              </button>
            </div>

            {#if isConnected}
              <!-- Map Name Edit -->
              <div>
                <label class="mb-2 block text-sm text-contrast-content/60"
                  >Map Name</label
                >
                {#if isRenaming}
                  <div class="flex gap-2">
                    <input
                      type="text"
                      bind:value={newMapNameInput}
                      class="flex-1 rounded-lg border border-base-300 bg-base-200 p-3 text-contrast-content outline-none transition-colors focus:border-base-content"
                    />
                    <button
                      class="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-white transition-colors hover:bg-green-700"
                      on:click={handleRenameMap}
                      disabled={isLoading}
                    >
                      {#if isLoading && loadingAction === "rename"}
                        <div
                          class="animate-map-spin h-4 w-4 rounded-full border-2 border-current border-t-transparent"
                        ></div>
                      {:else}
                        <Save class="h-4 w-4" />
                      {/if}
                    </button>
                    <button
                      class="rounded-lg bg-gray-500 px-4 py-2 text-white transition-colors hover:bg-gray-600"
                      on:click={() => (isRenaming = false)}
                    >
                      <X class="h-4 w-4" />
                    </button>
                  </div>
                {:else}
                  <div class="flex gap-2">
                    <input
                      type="text"
                      value={$connectedMapStore.map_name}
                      readonly
                      class="flex-1 cursor-not-allowed rounded-lg border border-base-300 bg-base-200 p-3 text-contrast-content"
                    />
                    {#if isOwner}
                      <button
                        class="flex items-center gap-2 rounded-lg border border-base-300 bg-base-200 px-4 py-2 transition-colors hover:bg-base-300"
                        on:click={() => {
                          isRenaming = true
                          newMapNameInput = $connectedMapStore.map_name
                        }}
                      >
                        <Edit3 class="h-4 w-4" />
                      </button>
                    {/if}
                  </div>
                {/if}
              </div>

              <!-- Settings Actions -->
              <div class="space-y-2">
                <!-- Create New Map Option -->
                <button
                  class="group flex w-full items-center justify-between rounded-lg bg-base-content px-4 py-2.5 text-base-100 transition-colors hover:bg-base-content/90"
                  on:click={() => navigateTo("create")}
                >
                  <div class="flex items-center gap-3">
                    <div
                      class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded bg-base-100/20"
                    >
                      <Plus class="h-5 w-5 text-base-100" />
                    </div>
                    <div class="text-left">
                      <div class="text-sm font-bold">Create New Map</div>
                      <div class="text-xs font-medium text-base-100/70">
                        Start a fresh map project
                      </div>
                    </div>
                  </div>
                  <ChevronRight
                    class="h-4 w-4 transition-transform group-hover:translate-x-1"
                  />
                </button>

                <!-- Switch Map Option -->
                <button
                  class="group flex w-full items-center justify-between rounded-lg bg-base-200 px-4 py-2.5 text-contrast-content transition-colors hover:bg-base-300"
                  on:click={() => navigateTo("switch-map")}
                >
                  <div class="flex items-center gap-3">
                    <div
                      class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded bg-base-100"
                    >
                      <Link2 class="h-5 w-5 text-contrast-content/60" />
                    </div>
                    <div class="text-left">
                      <div class="text-sm font-bold text-contrast-content">
                        Switch to Different Map
                      </div>
                      <div class="text-xs font-medium text-contrast-content/60">
                        Connect to another map
                      </div>
                    </div>
                  </div>
                  <ChevronRight
                    class="h-4 w-4 transition-transform group-hover:translate-x-1"
                  />
                </button>

                <!-- Leave Map Option -->
                <button
                  class="group flex w-full items-center justify-between rounded-lg bg-base-200 px-4 py-2.5 text-contrast-content transition-colors hover:bg-base-300"
                  on:click={handleDisconnectFromMap}
                  disabled={isLoading}
                >
                  <div class="flex items-center gap-3">
                    <div
                      class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded bg-base-100"
                    >
                      {#if isLoading && loadingAction === "disconnect"}
                        <div
                          class="animate-map-spin h-5 w-5 rounded-full border-2 border-contrast-content/60 border-t-transparent"
                        ></div>
                      {:else}
                        <LogOut class="h-5 w-5 text-contrast-content/60" />
                      {/if}
                    </div>
                    <div class="text-left">
                      <div class="text-sm font-bold text-contrast-content">
                        Leave Map
                      </div>
                      <div class="text-xs font-medium text-contrast-content/60">
                        Disconnect without switching
                      </div>
                    </div>
                  </div>
                  <ChevronRight
                    class="h-4 w-4 transition-transform group-hover:translate-x-1"
                  />
                </button>

                {#if isOwner}
                  <button
                    class="group flex w-full items-center justify-between rounded-lg bg-base-200 px-4 py-2.5 text-contrast-content transition-colors hover:bg-base-300"
                    on:click={() => navigateTo("delete-confirm")}
                  >
                    <div class="flex items-center gap-3">
                      <div
                        class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded bg-base-100"
                      >
                        <Trash2 class="h-5 w-5 text-red-600" />
                      </div>
                      <div class="text-left">
                        <div class="text-sm font-bold text-contrast-content">
                          Delete Map
                        </div>
                        <div
                          class="text-xs font-medium text-contrast-content/60"
                        >
                          Permanently remove this map
                        </div>
                      </div>
                    </div>
                    <ChevronRight
                      class="h-4 w-4 transition-transform group-hover:translate-x-1"
                    />
                  </button>
                {/if}
              </div>
            {:else}
              <div class="py-12 text-center">
                <p class="text-contrast-content/60">
                  Connect to a map to access settings
                </p>
              </div>
            {/if}
          </div>
        {:else if currentView === "operations"}
          <!-- Operations Management Content -->
          <div class="space-y-6">
            <!-- Desktop Back Button -->
            <div class="hidden lg:block">
              <button
                class="flex items-center gap-2 rounded-lg bg-base-200 px-3 py-2 text-sm font-medium text-contrast-content transition-colors hover:bg-base-300"
                on:click={goBack}
              >
                <ArrowLeft class="h-4 w-4" />
                Back to Main Menu
              </button>
            </div>

            {#if $operationStore && $operationStore.length > 0}
              <!-- Operation Selector -->
              <div class="rounded-lg bg-base-200 p-4">
                <div class="mb-3 flex items-center gap-3">
                  <div
                    class="flex h-8 w-8 items-center justify-center rounded bg-primary/20"
                  >
                    <div class="h-3 w-3 rounded-full bg-primary"></div>
                  </div>
                  <span class="text-sm font-medium text-contrast-content"
                    >Current Operation</span
                  >
                </div>

                <div class="relative mb-3">
                  <select
                    class="w-full appearance-none rounded-lg border border-base-300 bg-base-100 p-2.5 pr-10 text-sm text-contrast-content outline-none transition-colors focus:border-base-content"
                    value={$selectedOperationStore?.id}
                    on:change={(e) => handleOperationSelect(e.target.value)}
                    disabled={isLoading}
                  >
                    {#each $operationStore as operation}
                      <option value={operation.id}>
                        {operation.name} ({operation.year})
                      </option>
                    {/each}
                  </select>
                  <ChevronDown
                    class="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-contrast-content/60"
                  />
                </div>

                {#if $selectedOperationStore?.description}
                  <div class="text-xs text-contrast-content/60">
                    {$selectedOperationStore.description}
                  </div>
                {/if}
              </div>

              <!-- Operation Actions -->
              <div class="space-y-2">
                <button
                  class="group flex w-full items-center justify-between rounded-lg bg-base-200 px-4 py-2.5 text-contrast-content transition-colors hover:bg-base-300"
                  on:click={() => navigateTo("create-operation")}
                >
                  <div class="flex items-center gap-3">
                    <div
                      class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded bg-base-100"
                    >
                      <Plus class="h-5 w-5 text-contrast-content/60" />
                    </div>
                    <div class="text-left">
                      <div class="text-sm font-bold text-contrast-content">
                        Create New Operation
                      </div>
                      <div class="text-xs font-medium text-contrast-content/60">
                        Add a new operation to this map
                      </div>
                    </div>
                  </div>
                  <ChevronRight
                    class="h-4 w-4 transition-transform group-hover:translate-x-1"
                  />
                </button>

                {#if $selectedOperationStore}
                  <button
                    class="group flex w-full items-center justify-between rounded-lg bg-base-200 px-4 py-2.5 text-contrast-content transition-colors hover:bg-base-300"
                    on:click={prepareEditOperation}
                  >
                    <div class="flex items-center gap-3">
                      <div
                        class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded bg-base-100"
                      >
                        <Pencil class="h-5 w-5 text-contrast-content/60" />
                      </div>
                      <div class="text-left">
                        <div class="text-sm font-bold text-contrast-content">
                          Edit Operation
                        </div>
                        <div
                          class="text-xs font-medium text-contrast-content/60"
                        >
                          Modify operation details
                        </div>
                      </div>
                    </div>
                    <ChevronRight
                      class="h-4 w-4 transition-transform group-hover:translate-x-1"
                    />
                  </button>
                {/if}
              </div>
            {:else}
              <div class="py-8 text-center">
                <div
                  class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-base-200"
                >
                  <MapPin class="h-6 w-6 text-base-content/60" />
                </div>
                <h3 class="mb-2 font-semibold text-contrast-content">
                  No Operations
                </h3>
                <p class="mb-4 text-sm text-contrast-content/60">
                  Create your first operation to get started.
                </p>
                <button
                  class="mx-auto flex items-center gap-2 rounded-lg bg-base-content px-4 py-2 font-medium text-base-100 transition-colors hover:bg-base-content/90"
                  on:click={() => navigateTo("create-operation")}
                >
                  <Plus class="h-4 w-4" />
                  Create Operation
                </button>
              </div>
            {/if}
          </div>
        {:else if currentView === "create-operation"}
          <!-- Create Operation Form -->
          <div class="space-y-6">
            <!-- Desktop Back Button -->
            <div class="hidden lg:block">
              <button
                class="flex items-center gap-2 rounded-lg bg-base-200 px-3 py-2 text-sm font-medium text-contrast-content transition-colors hover:bg-base-300"
                on:click={goBack}
              >
                <ArrowLeft class="h-4 w-4" />
                Back to Operations
              </button>
            </div>

            <form
              on:submit|preventDefault={handleCreateOperation}
              class="space-y-6"
            >
              <div>
                <label
                  for="operationName"
                  class="mb-1.5 block text-sm text-contrast-content/60"
                >
                  Operation Name
                </label>
                <input
                  id="operationName"
                  type="text"
                  bind:value={newOperationName}
                  class="w-full rounded-lg border border-base-300 bg-base-200 p-3 text-contrast-content outline-none transition-colors focus:border-base-content"
                  placeholder="Enter operation name"
                  required
                />
              </div>

              <div>
                <label
                  for="operationYear"
                  class="mb-1.5 block text-sm text-contrast-content/60"
                >
                  Year
                </label>
                <div class="relative">
                  <select
                    id="operationYear"
                    bind:value={newOperationYear}
                    class="w-full appearance-none rounded-lg border border-base-300 bg-base-200 p-3 pr-10 text-contrast-content outline-none transition-colors focus:border-base-content"
                    required
                  >
                    {#each yearOptions as year}
                      <option value={year}>{year}</option>
                    {/each}
                  </select>
                  <ChevronDown
                    class="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-contrast-content/60"
                  />
                </div>
              </div>

              <div>
                <label
                  for="operationDescription"
                  class="mb-1.5 block text-sm text-contrast-content/60"
                >
                  Description (Optional)
                </label>
                <textarea
                  id="operationDescription"
                  bind:value={newOperationDescription}
                  rows="4"
                  class="w-full resize-none rounded-lg border border-base-300 bg-base-200 p-3 text-contrast-content outline-none transition-colors focus:border-base-content"
                  placeholder="Describe this operation"
                ></textarea>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                class="flex w-full items-center justify-center gap-2 rounded-lg bg-base-content px-6 py-3 font-medium text-base-100 transition-colors hover:bg-base-content/90 {isLoading
                  ? 'cursor-not-allowed opacity-50'
                  : ''}"
              >
                {#if isLoading && loadingAction === "create-operation"}
                  <div
                    class="animate-map-spin h-4 w-4 rounded-full border-2 border-current border-t-transparent"
                  ></div>
                {:else}
                  <Save class="h-4 w-4" />
                {/if}
                {isLoading && loadingAction === "create-operation"
                  ? "Creating..."
                  : "Create Operation"}
              </button>
            </form>
          </div>
        {:else if currentView === "edit-operation"}
          <!-- Edit Operation Form -->
          <div class="space-y-6">
            <!-- Desktop Back Button -->
            <div class="hidden lg:block">
              <button
                class="flex items-center gap-2 rounded-lg bg-base-200 px-3 py-2 text-sm font-medium text-contrast-content transition-colors hover:bg-base-300"
                on:click={goBack}
              >
                <ArrowLeft class="h-4 w-4" />
                Back to Operations
              </button>
            </div>

            <form
              on:submit|preventDefault={handleUpdateOperation}
              class="space-y-6"
            >
              <div>
                <label
                  for="editOperationName"
                  class="mb-1.5 block text-sm text-contrast-content/60"
                >
                  Operation Name
                </label>
                <input
                  id="editOperationName"
                  type="text"
                  bind:value={editOperationName}
                  class="w-full rounded-lg border border-base-300 bg-base-200 p-3 text-contrast-content outline-none transition-colors focus:border-base-content"
                  placeholder="Enter operation name"
                  required
                />
              </div>

              <div>
                <label
                  for="editOperationYear"
                  class="mb-1.5 block text-sm text-contrast-content/60"
                >
                  Year
                </label>
                <div class="relative">
                  <select
                    id="editOperationYear"
                    bind:value={editOperationYear}
                    class="w-full appearance-none rounded-lg border border-base-300 bg-base-200 p-3 pr-10 text-contrast-content outline-none transition-colors focus:border-base-content"
                    required
                  >
                    {#each yearOptions as year}
                      <option value={year}>{year}</option>
                    {/each}
                  </select>
                  <ChevronDown
                    class="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-contrast-content/60"
                  />
                </div>
              </div>

              <div>
                <label
                  for="editOperationDescription"
                  class="mb-1.5 block text-sm text-contrast-content/60"
                >
                  Description (Optional)
                </label>
                <textarea
                  id="editOperationDescription"
                  bind:value={editOperationDescription}
                  rows="4"
                  class="w-full resize-none rounded-lg border border-base-300 bg-base-200 p-3 text-contrast-content outline-none transition-colors focus:border-base-content"
                  placeholder="Describe this operation"
                ></textarea>
              </div>

              <div class="flex gap-2">
                <button
                  type="submit"
                  disabled={isLoading}
                  class="flex flex-1 items-center justify-center gap-2 rounded-lg bg-base-content px-6 py-3 font-medium text-base-100 transition-colors hover:bg-base-content/90"
                >
                  {#if isLoading && loadingAction === "update-operation"}
                    <div
                      class="animate-map-spin h-4 w-4 rounded-full border-2 border-current border-t-transparent"
                    ></div>
                  {:else}
                    <Save class="h-4 w-4" />
                  {/if}
                  {isLoading && loadingAction === "update-operation"
                    ? "Updating..."
                    : "Save"}
                </button>

                {#if isConfirmingOperationDelete}
                  <!-- Countdown State -->
                  <div
                    class="flex flex-1 items-center justify-center gap-2 rounded-lg border border-base-300 bg-orange-600/10 px-6 py-3"
                  >
                    <div
                      class="animate-map-spin h-4 w-4 rounded-full border-2 border-orange-600 border-t-transparent"
                    ></div>
                    <span class="text-sm font-semibold text-orange-600">
                      Deleting in {deleteOperationCountdown}...
                    </span>
                    <button
                      type="button"
                      class="ml-2 rounded px-2 py-1 text-xs font-medium text-contrast-content hover:bg-base-200"
                      on:click={cancelOperationDelete}
                    >
                      Cancel
                    </button>
                  </div>
                {:else}
                  <button
                    type="button"
                    disabled={isOnlyOperation || isLoading}
                    class="flex items-center justify-center gap-2 rounded-lg bg-red-600 px-6 py-3 font-medium text-white transition-colors hover:bg-red-700 {isOnlyOperation ||
                    isLoading
                      ? 'cursor-not-allowed opacity-50'
                      : ''}"
                    on:click={handleDeleteOperation}
                  >
                    {#if isLoading && loadingAction === "delete-operation"}
                      <div
                        class="animate-map-spin h-4 w-4 rounded-full border-2 border-current border-t-transparent"
                      ></div>
                    {:else}
                      <Trash2 class="h-4 w-4" />
                    {/if}
                    Delete
                  </button>
                {/if}
              </div>
            </form>
          </div>
        {:else if currentView === "invite"}
          <!-- Invite Team Members -->
          <div class="space-y-6">
            <!-- Desktop Back Button -->
            <div class="hidden lg:block">
              <button
                class="flex items-center gap-2 rounded-lg bg-base-200 px-3 py-2 text-sm font-medium text-contrast-content transition-colors hover:bg-base-300"
                on:click={goBack}
              >
                <ArrowLeft class="h-4 w-4" />
                Back to Main Menu
              </button>
            </div>

            <div class="mb-6 text-center">
              <h3 class="mb-2 text-lg font-semibold text-contrast-content">
                Share Map Access
              </h3>
              <p class="text-sm text-contrast-content/60">
                Share your map with team members using the options below
              </p>
            </div>

            <!-- Map ID Section -->
            <div class="rounded-lg border border-base-300 bg-base-200 p-4">
              <h4
                class="mb-2 flex items-center gap-2 font-medium text-contrast-content"
              >
                <Copy class="h-4 w-4" />
                Map ID
              </h4>
              <div class="flex gap-2">
                <input
                  type="text"
                  value={$connectedMapStore.id}
                  readonly
                  class="flex-1 rounded-lg border border-base-300 bg-base-100 p-2.5 font-mono text-sm text-contrast-content"
                />
                <button
                  class="flex items-center gap-2 rounded-lg bg-base-content px-4 py-2.5 text-base-100 transition-colors hover:bg-base-content/90"
                  on:click={copyInviteMapId}
                >
                  {#if mapIdCopied}
                    <Check class="h-4 w-4" />
                  {:else}
                    <Copy class="h-4 w-4" />
                  {/if}
                </button>
              </div>
              <p class="mt-2 text-xs text-contrast-content/60">
                Share this ID with other users to join your map
              </p>
            </div>

            <!-- Share Link Section -->
            <div class="rounded-lg border border-base-300 bg-base-200 p-4">
              <h4
                class="mb-2 flex items-center gap-2 font-medium text-contrast-content"
              >
                <Link class="h-4 w-4" />
                Share Link
              </h4>
              <div class="flex gap-2">
                <input
                  type="text"
                  value={`https://www.skanfarming.com.au/login?map_id=${$connectedMapStore.id}`}
                  readonly
                  class="flex-1 rounded-lg border border-base-300 bg-base-100 p-2.5 text-sm text-contrast-content"
                />
                <button
                  class="flex items-center gap-2 rounded-lg bg-base-content px-4 py-2.5 text-base-100 transition-colors hover:bg-base-content/90"
                  on:click={copyInviteLink}
                >
                  {#if linkCopied}
                    <Check class="h-4 w-4" />
                  {:else}
                    <Link class="h-4 w-4" />
                  {/if}
                </button>
              </div>
              <p class="mt-2 text-xs text-contrast-content/60">
                Share this link for direct access to your map
              </p>
            </div>

            <!-- Share Options -->
            <div class="space-y-2">
              <h4
                class="mb-3 flex items-center gap-2 font-medium text-contrast-content"
              >
                <Share2 class="h-4 w-4" />
                Quick Share
              </h4>

              <button
                class="group flex w-full items-center justify-between rounded-lg bg-base-200 px-4 py-2.5 text-contrast-content transition-colors hover:bg-base-300"
                on:click={shareViaSMS}
              >
                <div class="flex items-center gap-3">
                  <div
                    class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded bg-base-100"
                  >
                    <Phone class="h-5 w-5 text-contrast-content/60" />
                  </div>
                  <div class="text-left">
                    <div class="text-sm font-bold text-contrast-content">
                      Share via SMS
                    </div>
                    <div class="text-xs font-medium text-contrast-content/60">
                      Send link through your messaging app
                    </div>
                  </div>
                </div>
                <ChevronRight
                  class="h-4 w-4 transition-transform group-hover:translate-x-1"
                />
              </button>

              <button
                class="group flex w-full items-center justify-between rounded-lg bg-base-200 px-4 py-2.5 text-contrast-content transition-colors hover:bg-base-300"
                on:click={shareViaEmail}
              >
                <div class="flex items-center gap-3">
                  <div
                    class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded bg-base-100"
                  >
                    <Mail class="h-5 w-5 text-contrast-content/60" />
                  </div>
                  <div class="text-left">
                    <div class="text-sm font-bold text-contrast-content">
                      Share via Email
                    </div>
                    <div class="text-xs font-medium text-contrast-content/60">
                      Send link through your email app
                    </div>
                  </div>
                </div>
                <ChevronRight
                  class="h-4 w-4 transition-transform group-hover:translate-x-1"
                />
              </button>
            </div>
          </div>
        {:else if currentView === "delete-confirm"}
          <!-- Delete Confirmation -->
          <div class="space-y-6">
            <!-- Desktop Back Button -->
            <div class="hidden lg:block">
              <button
                class="flex items-center gap-2 rounded-lg bg-base-200 px-3 py-2 text-sm font-medium text-contrast-content transition-colors hover:bg-base-300"
                on:click={goBack}
                disabled={deleteLoadingStage === "confirming" ||
                  deleteLoadingStage === "deleting"}
              >
                <ArrowLeft class="h-4 w-4" />
                Back to Settings
              </button>
            </div>

            <!-- Warning Section -->
            <div class="rounded-lg border border-base-300 bg-red-600/10 p-6">
              <div class="mb-4 flex items-center gap-3">
                <div
                  class="flex h-12 w-12 items-center justify-center rounded-full bg-red-600/20"
                >
                  <AlertTriangle class="h-6 w-6 text-red-600" />
                </div>
                <div>
                  <h3 class="text-lg font-bold text-red-600">Delete Map</h3>
                  <p class="text-sm font-medium text-contrast-content/70">
                    This action cannot be undone
                  </p>
                </div>
              </div>

              <div class="rounded-lg border border-base-300 bg-base-200 p-4">
                <p class="mb-2 font-semibold text-contrast-content">
                  You are about to permanently delete:
                </p>
                <p class="mb-3 text-xl font-bold text-red-600">{mapName}</p>
                <div
                  class="space-y-1 text-sm font-medium text-contrast-content/80"
                >
                  <p>• All map data will be permanently deleted</p>
                  <p>• This action cannot be undone</p>
                  <p>• All collaborators will lose access</p>
                </div>
              </div>
            </div>

            <!-- Confirmation Input -->
            <div>
              <label
                class="mb-2 block text-sm font-medium text-contrast-content"
              >
                For security, please type the first 8 characters of the map ID
                to confirm:
              </label>
              <div
                class="mb-3 rounded-lg border border-base-300 bg-base-200 p-3 font-mono text-sm"
              >
                <span class="font-bold text-red-600">{mapId.slice(0, 8)}</span>
                <span class="text-contrast-content/40">{mapId.slice(8)}</span>
              </div>
              <input
                type="text"
                bind:value={confirmationInput}
                placeholder="Type the first 8 characters"
                disabled={deleteLoadingStage === "confirming" ||
                  deleteLoadingStage === "deleting"}
                class="w-full rounded-lg border border-base-300 bg-base-200 p-3 text-contrast-content outline-none transition-colors focus:border-red-600 {deleteLoadingStage
                  ? 'cursor-not-allowed opacity-50'
                  : ''}"
              />
            </div>

            <!-- Action Buttons -->
            <div class="space-y-3">
              {#if deleteLoadingStage === "confirming"}
                <!-- Countdown State -->
                <div
                  class="rounded-lg border border-base-300 bg-orange-600/10 p-4 text-center"
                >
                  <div class="mb-2 flex items-center justify-center gap-2">
                    <div
                      class="animate-map-spin h-4 w-4 rounded-full border-2 border-orange-600 border-t-transparent"
                    ></div>
                    <span class="font-bold text-orange-600"
                      >Deleting in {deleteCountdown} seconds...</span
                    >
                  </div>
                  <button
                    class="rounded-lg bg-base-content px-4 py-2 text-sm font-medium text-base-100 transition-colors hover:bg-base-content/90"
                    on:click={cancelDelete}
                  >
                    Cancel Deletion
                  </button>
                </div>
              {:else if deleteLoadingStage === "deleting"}
                <!-- Deleting State -->
                <div
                  class="rounded-lg border border-base-300 bg-red-600/10 p-4 text-center"
                >
                  <div class="flex items-center justify-center gap-2">
                    <div
                      class="animate-map-spin h-4 w-4 rounded-full border-2 border-red-600 border-t-transparent"
                    ></div>
                    <span class="font-bold text-red-600">Deleting map...</span>
                  </div>
                </div>
              {:else}
                <!-- Normal State -->
                <button
                  class="w-full rounded-lg bg-error px-4 py-3 font-medium text-white transition-colors hover:bg-error/90 {!isConfirmationValid
                    ? 'cursor-not-allowed opacity-50'
                    : ''}"
                  disabled={!isConfirmationValid}
                  on:click={handleDeleteMap}
                >
                  <div class="flex items-center justify-center gap-2">
                    <Trash2 class="h-4 w-4" />
                    Yes, Delete Map Permanently
                  </div>
                </button>
              {/if}
            </div>

            <!-- Footer Warning -->
            <div class="text-center text-xs text-contrast-content/50">
              Deleted maps cannot be recovered. Make sure you have any needed
              data backed up.
            </div>
          </div>
        {/if}
      </div>
    </div>

    <!-- Vertical Divider - Only visible on desktop, aligned with content -->
    <div
      class="absolute hidden w-px bg-gradient-to-b from-transparent via-base-content/20 via-base-content/30 to-transparent lg:block"
      style="left: calc(50% - 0.5px); top: 0; bottom: 0;"
    ></div>

    <!-- ========================================
         RIGHT COMPONENT - Map Information & Stats (Dynamic)
         ======================================== -->
    <div
      class="hidden rounded-xl border border-base-300 bg-base-100 shadow-lg transition-all duration-300 hover:shadow-xl lg:block"
    >
      <!-- Mobile divider -->
      <div
        class="mb-6 h-px w-full bg-gradient-to-r from-base-content/30 via-base-content/20 to-transparent lg:hidden"
      ></div>

      <!-- Dynamic Section Header based on current view -->
      <div
        class="mx-6 grid min-h-[5rem] grid-cols-[auto_1fr_auto] items-center gap-4 border-b border-base-300 px-0 py-4"
      >
        {#if currentView === "main"}
          <div
            class="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600/20 shadow-sm"
          >
            <BarChart3 size={20} className="text-blue-600" />
          </div>
          <div>
            <h4 class="text-lg font-semibold text-contrast-content">
              Map Information & Stats
            </h4>
            <p class="mt-0.5 text-xs text-contrast-content/60">
              View your map details and status
            </p>
          </div>
        {:else if currentView === "create"}
          <div
            class="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600/20 shadow-sm"
          >
            <Layers size={20} className="text-blue-600" />
          </div>
          <div>
            <h4 class="text-lg font-semibold text-contrast-content">
              {newMapName || "New Map Preview"}
            </h4>
            <p class="mt-0.5 text-xs text-contrast-content/60">
              Set up your new farming map
            </p>
          </div>
        {:else if currentView === "connect" || currentView === "switch-map"}
          <div
            class="flex h-10 w-10 items-center justify-center rounded-full bg-green-600/20 shadow-sm"
          >
            <Search size={20} className="text-green-600" />
          </div>
          <div>
            <h4 class="text-lg font-semibold text-contrast-content">
              {currentView === "switch-map" ? "Switch Map" : "Connect to Map"}
            </h4>
            <p class="mt-0.5 text-xs text-contrast-content/60">
              {recentMaps.length + userMaps.length} maps available to connect to
            </p>
          </div>
        {:else if currentView === "settings"}
          <div
            class="flex h-10 w-10 items-center justify-center rounded-full bg-orange-600/20 shadow-sm"
          >
            <Settings size={20} className="text-orange-600" />
          </div>
          <div>
            <h4 class="text-lg font-semibold text-contrast-content">
              {isConnected ? $connectedMapStore.map_name : "Map Settings"}
            </h4>
            <p class="mt-0.5 text-xs text-contrast-content/60">
              {isConnected
                ? "Configure your map preferences"
                : "Connect to a map to access settings"}
            </p>
          </div>
        {:else if currentView === "operations"}
          <div
            class="flex h-10 w-10 items-center justify-center rounded-full bg-purple-600/20 shadow-sm"
          >
            <MapPin size={20} className="text-purple-600" />
          </div>
          <div>
            <h4 class="text-lg font-semibold text-contrast-content">
              Operations Management
            </h4>
            <p class="mt-0.5 text-xs text-contrast-content/60">
              {$operationStore?.length || 0} operations available
            </p>
          </div>
        {:else if currentView === "create-operation"}
          <div
            class="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600/20 shadow-sm"
          >
            <Plus size={20} className="text-blue-600" />
          </div>
          <div>
            <h4 class="text-lg font-semibold text-contrast-content">
              {newOperationName || "New Operation"}
            </h4>
            <p class="mt-0.5 text-xs text-contrast-content/60">
              Year: {newOperationYear}
            </p>
          </div>
        {:else if currentView === "edit-operation"}
          <div
            class="flex h-10 w-10 items-center justify-center rounded-full bg-yellow-600/20 shadow-sm"
          >
            <Pencil size={20} className="text-yellow-600" />
          </div>
          <div>
            <h4 class="text-lg font-semibold text-contrast-content">
              {editOperationName ||
                $selectedOperationStore?.name ||
                "Edit Operation"}
            </h4>
            <p class="mt-0.5 text-xs text-contrast-content/60">
              Year: {editOperationYear || $selectedOperationStore?.year}
            </p>
          </div>
        {:else if currentView === "invite"}
          <div
            class="flex h-10 w-10 items-center justify-center rounded-full bg-green-600/20 shadow-sm"
          >
            <UserPlus size={20} className="text-green-600" />
          </div>
          <div>
            <h4 class="text-lg font-semibold text-contrast-content">
              Invite Team Members
            </h4>
            <p class="mt-0.5 text-xs text-contrast-content/60">
              Share access to {$connectedMapStore?.map_name}
            </p>
          </div>
        {:else if currentView === "delete-confirm"}
          <div
            class="flex h-10 w-10 items-center justify-center rounded-full bg-red-600/20 shadow-sm"
          >
            <Trash2 size={20} className="text-red-600" />
          </div>
          <div>
            <h4 class="text-lg font-semibold text-contrast-content">
              Delete Map
            </h4>
            <p class="mt-0.5 text-xs text-contrast-content/60">
              Permanent deletion warning
            </p>
          </div>
        {/if}
      </div>

      <div class="space-y-4 p-6">
        {#if currentView === "main"}
          {#if isConnected}
            <!-- Main Menu - Connected Map Display -->
            <div class="space-y-3">
              <!-- Connected Map Info Card -->
              <div class="flex items-center gap-3 rounded-lg bg-base-200 p-4">
                <div
                  class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded bg-green-600/20"
                >
                  <Map class="h-5 w-5 text-green-600" />
                </div>
                <div class="min-w-0 flex-1">
                  <div
                    class="truncate text-sm font-semibold text-contrast-content"
                  >
                    {$connectedMapStore.map_name}
                  </div>
                  <div class="text-xs text-contrast-content/60">
                    Owned by {$connectedMapStore.owner}
                  </div>
                </div>
              </div>

              <!-- Current Operation Selector -->
              <div class="rounded-lg bg-base-200 p-4">
                <div class="mb-3 flex items-center gap-3">
                  <div
                    class="flex h-8 w-8 items-center justify-center rounded bg-primary/20"
                  >
                    <div class="h-3 w-3 rounded-full bg-primary"></div>
                  </div>
                  <span class="text-sm font-medium text-contrast-content"
                    >Active Operation</span
                  >
                </div>

                <div class="relative mb-3">
                  <select
                    class="w-full appearance-none rounded-lg border border-base-300 bg-base-100 p-2.5 pr-10 text-sm text-contrast-content outline-none transition-colors focus:border-base-content"
                    value={$selectedOperationStore?.id}
                    on:change={(e) => handleOperationSelect(e.target.value)}
                    disabled={isLoading && loadingAction.startsWith("select-")}
                  >
                    {#each $operationStore as operation}
                      <option value={operation.id}>
                        {operation.name} ({operation.year})
                      </option>
                    {/each}
                  </select>
                  <ChevronDown
                    class="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-contrast-content/60"
                  />
                </div>

                {#if $selectedOperationStore?.description}
                  <div class="text-xs text-contrast-content/60">
                    {$selectedOperationStore.description}
                  </div>
                {/if}
              </div>

              <!-- Map ID Display -->
              <div class="flex items-center gap-3 rounded-lg bg-base-200 p-4">
                <div
                  class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded bg-blue-600/20"
                >
                  <Copy class="h-5 w-5 text-blue-600" />
                </div>
                <div class="min-w-0 flex-1">
                  <div class="text-sm font-bold text-contrast-content">
                    Map ID
                  </div>
                  <code
                    class="block truncate font-mono text-xs text-contrast-content/60"
                  >
                    {$connectedMapStore.id}
                  </code>
                </div>
                <button
                  class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-base-300"
                  on:click={copyMapId}
                  title="Copy Map ID"
                >
                  {#if copied}
                    <Check class="h-4 w-4 text-green-500" />
                  {:else}
                    <Copy class="h-4 w-4 text-contrast-content/60" />
                  {/if}
                </button>
              </div>
            </div>
          {:else}
            <!-- Main Menu - No Map Connected Display -->
            <div class="space-y-4">
              <div class="mb-6 text-center">
                <div
                  class="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full border-2 border-dashed border-blue-600/30 bg-gradient-to-br from-blue-600/10 to-blue-600/5 shadow-sm"
                >
                  <Map size={36} className="text-blue-600/60" />
                </div>

                <h3 class="mb-3 text-lg font-semibold text-contrast-content">
                  No Map Connected
                </h3>
                <p
                  class="mb-6 text-sm leading-relaxed text-contrast-content/60"
                >
                  Connect to a map to view information, stats, and operational
                  data.
                </p>
              </div>

              <!-- Info Card -->
              <div class="rounded-lg bg-base-200 p-4">
                <div class="flex items-center gap-3">
                  <div
                    class="flex h-6 w-6 items-center justify-center rounded bg-blue-600/20"
                  >
                    <Info class="h-4 w-4 text-blue-600" />
                  </div>
                  <div class="flex-1">
                    <div class="mb-1 text-sm font-medium text-contrast-content">
                      Getting Started
                    </div>
                    <div class="text-xs text-contrast-content/60">
                      Use the options on the left to create your first map
                    </div>
                  </div>
                </div>
              </div>
            </div>
          {/if}
        {:else if currentView === "create"}
          <!-- Create Map Preview -->
          <div class="space-y-4">
            <!-- Map Preview Card -->
            <div class="rounded-lg bg-base-200 p-4">
              <div class="mb-2 flex items-center gap-3">
                <div
                  class="flex h-6 w-6 items-center justify-center rounded bg-blue-600/20"
                >
                  <Layers class="h-4 w-4 text-blue-600" />
                </div>
                <span class="text-sm font-medium text-contrast-content"
                  >Generated Map ID</span
                >
              </div>
              <code
                class="break-all font-mono text-xs text-contrast-content/80"
              >
                {generatedMapId}
              </code>
            </div>

            {#if newMapName}
              <!-- Map Name Preview -->
              <div class="rounded-lg bg-base-200 p-4">
                <div class="mb-2 flex items-center gap-3">
                  <div
                    class="flex h-6 w-6 items-center justify-center rounded bg-green-600/20"
                  >
                    <Map class="h-4 w-4 text-green-600" />
                  </div>
                  <span class="text-sm font-medium text-contrast-content"
                    >Map Name</span
                  >
                </div>
                <div class="text-sm text-contrast-content">{newMapName}</div>
              </div>
            {/if}

            <!-- Creation Status -->
            {#if createMapStatus === "loading"}
              <div class="rounded-lg border border-base-300 bg-blue-600/10 p-4">
                <div class="mb-1 text-sm font-semibold text-blue-600">
                  Creating Map...
                </div>
                <div class="text-xs text-contrast-content/70">
                  Setting up your farm map
                </div>
              </div>
            {:else if createMapStatus === "success"}
              <div
                class="rounded-lg border border-base-300 bg-green-600/10 p-4"
              >
                <div class="mb-1 text-sm font-semibold text-green-600">
                  Map Created!
                </div>
                <div class="text-xs text-contrast-content/70">
                  Your map is ready to use
                </div>
              </div>
            {:else}
              <div class="rounded-lg bg-base-200 p-4">
                <div class="flex items-center gap-3">
                  <div
                    class="flex h-6 w-6 items-center justify-center rounded bg-gray-600/20"
                  >
                    <Info class="h-4 w-4 text-gray-600" />
                  </div>
                  <div class="flex-1">
                    <div class="mb-1 text-sm font-medium text-contrast-content">
                      Ready to Create
                    </div>
                    <div class="text-xs text-contrast-content/60">
                      Enter a map name to continue
                    </div>
                  </div>
                </div>
              </div>
            {/if}
          </div>
        {:else if currentView === "connect" || currentView === "switch-map"}
          <!-- Connect/Switch Map Info -->
          <div class="space-y-4">
            <!-- Available Maps Summary -->
            <div class="rounded-lg bg-base-200 p-4">
              <div class="mb-2 flex items-center gap-3">
                <div
                  class="flex h-6 w-6 items-center justify-center rounded bg-green-600/20"
                >
                  <BarChart3 class="h-4 w-4 text-green-600" />
                </div>
                <span class="text-sm font-medium text-contrast-content"
                  >Available Maps</span
                >
              </div>
              <div class="text-sm text-contrast-content">
                {recentMaps.length + userMaps.length} maps available to connect
              </div>
            </div>

            {#if userMaps.length > 0}
              <div class="rounded-lg bg-base-200 p-4">
                <div class="mb-2 flex items-center gap-3">
                  <div
                    class="flex h-6 w-6 items-center justify-center rounded bg-blue-600/20"
                  >
                    <User class="h-4 w-4 text-blue-600" />
                  </div>
                  <span class="text-sm font-medium text-contrast-content"
                    >Your Maps</span
                  >
                </div>
                <div class="text-sm text-contrast-content">
                  {userMaps.length} maps owned by you
                </div>
              </div>
            {/if}

            {#if recentMaps.length > 0}
              <div class="rounded-lg bg-base-200 p-4">
                <div class="mb-2 flex items-center gap-3">
                  <div
                    class="flex h-6 w-6 items-center justify-center rounded bg-purple-600/20"
                  >
                    <Clock class="h-4 w-4 text-purple-600" />
                  </div>
                  <span class="text-sm font-medium text-contrast-content"
                    >Recent Maps</span
                  >
                </div>
                <div class="text-sm text-contrast-content">
                  {recentMaps.length} recently accessed maps
                </div>
              </div>
            {/if}
          </div>
        {:else if currentView === "settings"}
          <!-- Settings Information -->
          <div class="space-y-4">
            {#if isConnected}
              <!-- Map ID -->
              <div class="flex items-center gap-3 rounded-lg bg-base-200 p-4">
                <div
                  class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded bg-blue-600/20"
                >
                  <Copy class="h-5 w-5 text-blue-600" />
                </div>
                <div class="min-w-0 flex-1">
                  <div class="text-sm font-bold text-contrast-content">
                    Map ID
                  </div>
                  <code
                    class="block truncate font-mono text-xs text-contrast-content/60"
                  >
                    {$connectedMapStore.id}
                  </code>
                </div>
                <button
                  class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-base-300"
                  on:click={copyMapId}
                  title="Copy Map ID"
                >
                  {#if copied}
                    <Check class="h-4 w-4 text-green-500" />
                  {:else}
                    <Copy class="h-4 w-4 text-contrast-content/60" />
                  {/if}
                </button>
              </div>

              <!-- Ownership Status -->
              <div class="rounded-lg bg-base-200 p-4">
                <div class="flex items-center gap-3">
                  <div
                    class="flex h-6 w-6 items-center justify-center rounded bg-{isOwner
                      ? 'green'
                      : 'blue'}-600/20"
                  >
                    <User
                      class="h-4 w-4 text-{isOwner ? 'green' : 'blue'}-600"
                    />
                  </div>
                  <div class="flex-1">
                    <div class="text-sm font-medium text-contrast-content">
                      {isOwner ? "Map Owner" : "Map Member"}
                    </div>
                    <div class="text-xs text-contrast-content/60">
                      {isOwner
                        ? "You have full control over this map"
                        : "You have access to this map"}
                    </div>
                  </div>
                </div>
              </div>
            {:else}
              <!-- No Map Connected -->
              <div class="rounded-lg bg-base-200 p-4 text-center">
                <div class="text-sm text-contrast-content/60">
                  Connect to a map to access settings
                </div>
              </div>
            {/if}
          </div>
        {:else if currentView === "operations"}
          <!-- Operations Information -->
          <div class="space-y-4">
            <!-- Current Operation -->
            {#if $selectedOperationStore}
              <div class="rounded-lg bg-base-200 p-4">
                <div class="mb-2 flex items-center gap-3">
                  <div
                    class="flex h-6 w-6 items-center justify-center rounded bg-purple-600/20"
                  >
                    <MapPin class="h-4 w-4 text-purple-600" />
                  </div>
                  <span class="text-sm font-medium text-contrast-content"
                    >Current Operation</span
                  >
                </div>
                <div class="text-sm text-contrast-content">
                  {$selectedOperationStore.name} ({$selectedOperationStore.year})
                </div>
                {#if $selectedOperationStore.description}
                  <div class="mt-1 text-xs text-contrast-content/60">
                    {$selectedOperationStore.description}
                  </div>
                {/if}
              </div>
            {/if}

            <!-- Operations Count -->
            <div class="rounded-lg bg-base-200 p-4">
              <div class="mb-2 flex items-center gap-3">
                <div
                  class="flex h-6 w-6 items-center justify-center rounded bg-blue-600/20"
                >
                  <BarChart3 class="h-4 w-4 text-blue-600" />
                </div>
                <span class="text-sm font-medium text-contrast-content"
                  >Total Operations</span
                >
              </div>
              <div class="text-sm text-contrast-content">
                {$operationStore?.length || 0} operations available
              </div>
            </div>

            <!-- Map Context -->
            {#if isConnected}
              <div class="rounded-lg bg-base-200 p-4">
                <div class="mb-2 flex items-center gap-3">
                  <div
                    class="flex h-6 w-6 items-center justify-center rounded bg-green-600/20"
                  >
                    <Map class="h-4 w-4 text-green-600" />
                  </div>
                  <span class="text-sm font-medium text-contrast-content"
                    >Map Context</span
                  >
                </div>
                <div class="text-sm text-contrast-content">
                  {$connectedMapStore.map_name}
                </div>
              </div>
            {/if}
          </div>
        {:else if currentView === "create-operation"}
          <!-- Create Operation Preview -->
          <div class="space-y-4">
            {#if newOperationName}
              <div class="rounded-lg bg-base-200 p-4">
                <div class="mb-2 flex items-center gap-3">
                  <div
                    class="flex h-6 w-6 items-center justify-center rounded bg-blue-600/20"
                  >
                    <FileText class="h-4 w-4 text-blue-600" />
                  </div>
                  <span class="text-sm font-medium text-contrast-content"
                    >Operation Name</span
                  >
                </div>
                <div class="text-sm text-contrast-content">
                  {newOperationName}
                </div>
              </div>
            {/if}

            <div class="rounded-lg bg-base-200 p-4">
              <div class="mb-2 flex items-center gap-3">
                <div
                  class="flex h-6 w-6 items-center justify-center rounded bg-purple-600/20"
                >
                  <Calendar class="h-4 w-4 text-purple-600" />
                </div>
                <span class="text-sm font-medium text-contrast-content"
                  >Year</span
                >
              </div>
              <div class="text-sm text-contrast-content">
                {newOperationYear}
              </div>
            </div>

            {#if newOperationDescription}
              <div class="rounded-lg bg-base-200 p-4">
                <div class="mb-2 flex items-center gap-3">
                  <div
                    class="flex h-6 w-6 items-center justify-center rounded bg-orange-600/20"
                  >
                    <FileText class="h-4 w-4 text-orange-600" />
                  </div>
                  <span class="text-sm font-medium text-contrast-content"
                    >Description</span
                  >
                </div>
                <div class="text-sm text-contrast-content">
                  {newOperationDescription}
                </div>
              </div>
            {/if}

            <!-- Map Context -->
            <div class="rounded-lg bg-base-200 p-4">
              <div class="mb-2 flex items-center gap-3">
                <div
                  class="flex h-6 w-6 items-center justify-center rounded bg-green-600/20"
                >
                  <Map class="h-4 w-4 text-green-600" />
                </div>
                <span class="text-sm font-medium text-contrast-content"
                  >Target Map</span
                >
              </div>
              <div class="text-sm text-contrast-content">
                {$connectedMapStore?.map_name || "No map selected"}
              </div>
            </div>
          </div>
        {:else if currentView === "edit-operation"}
          <!-- Edit Operation Preview -->
          <div class="space-y-4">
            <div class="rounded-lg bg-base-200 p-4">
              <div class="mb-2 flex items-center gap-3">
                <div
                  class="flex h-6 w-6 items-center justify-center rounded bg-yellow-600/20"
                >
                  <FileText class="h-4 w-4 text-yellow-600" />
                </div>
                <span class="text-sm font-medium text-contrast-content"
                  >Operation Name</span
                >
              </div>
              <div class="text-sm text-contrast-content">
                {editOperationName || $selectedOperationStore?.name}
              </div>
            </div>

            <div class="rounded-lg bg-base-200 p-4">
              <div class="mb-2 flex items-center gap-3">
                <div
                  class="flex h-6 w-6 items-center justify-center rounded bg-purple-600/20"
                >
                  <Calendar class="h-4 w-4 text-purple-600" />
                </div>
                <span class="text-sm font-medium text-contrast-content"
                  >Year</span
                >
              </div>
              <div class="text-sm text-contrast-content">
                {editOperationYear || $selectedOperationStore?.year}
              </div>
            </div>

            {#if editOperationDescription || $selectedOperationStore?.description}
              <div class="rounded-lg bg-base-200 p-4">
                <div class="mb-2 flex items-center gap-3">
                  <div
                    class="flex h-6 w-6 items-center justify-center rounded bg-orange-600/20"
                  >
                    <FileText class="h-4 w-4 text-orange-600" />
                  </div>
                  <span class="text-sm font-medium text-contrast-content"
                    >Description</span
                  >
                </div>
                <div class="text-sm text-contrast-content">
                  {editOperationDescription ||
                    $selectedOperationStore?.description}
                </div>
              </div>
            {/if}

            <!-- Warning for only operation -->
            {#if isOnlyOperation}
              <div
                class="rounded-lg border border-base-300 bg-orange-600/10 p-4"
              >
                <div class="mb-1 text-sm font-semibold text-orange-600">
                  Only Operation
                </div>
                <div class="text-xs text-contrast-content/70">
                  This is the only operation and cannot be deleted
                </div>
              </div>
            {/if}
          </div>
        {:else if currentView === "invite"}
          <!-- Invite Information -->
          <div class="space-y-4">
            <!-- Share URL -->
            <div class="rounded-lg bg-base-200 p-4">
              <div class="mb-2 flex items-center gap-3">
                <div
                  class="flex h-6 w-6 items-center justify-center rounded bg-green-600/20"
                >
                  <Link class="h-4 w-4 text-green-600" />
                </div>
                <span class="text-sm font-medium text-contrast-content"
                  >Share URL</span
                >
              </div>
              <code class="break-all text-xs text-contrast-content/80">
                https://www.skanfarming.com.au/login?map_id={$connectedMapStore?.id}
              </code>
            </div>

            <!-- Map ID -->
            <div class="flex items-center gap-3 rounded-lg bg-base-200 p-4">
              <div
                class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded bg-blue-600/20"
              >
                <Copy class="h-5 w-5 text-blue-600" />
              </div>
              <div class="min-w-0 flex-1">
                <div class="text-sm font-bold text-contrast-content">
                  Map ID
                </div>
                <code
                  class="block truncate font-mono text-xs text-contrast-content/60"
                >
                  {$connectedMapStore?.id}
                </code>
              </div>
              <button
                class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-base-300"
                on:click={copyMapId}
                title="Copy Map ID"
              >
                {#if copied}
                  <Check class="h-4 w-4 text-green-500" />
                {:else}
                  <Copy class="h-4 w-4 text-contrast-content/60" />
                {/if}
              </button>
            </div>

            <!-- Share Instructions -->
            <div class="rounded-lg bg-base-200 p-4">
              <div class="flex items-center gap-3">
                <div
                  class="flex h-6 w-6 items-center justify-center rounded bg-blue-600/20"
                >
                  <Info class="h-4 w-4 text-blue-600" />
                </div>
                <div class="flex-1">
                  <div class="mb-1 text-sm font-medium text-contrast-content">
                    How to Share
                  </div>
                  <div class="text-xs text-contrast-content/60">
                    Copy the Map ID or share link to invite team members
                  </div>
                </div>
              </div>
            </div>
          </div>
        {:else if currentView === "delete-confirm"}
          <!-- Delete Confirmation Info -->
          <div class="space-y-4">
            <!-- Map to Delete -->
            <div class="rounded-lg border border-base-300 bg-red-600/10 p-4">
              <div class="mb-2 flex items-center gap-3">
                <div
                  class="flex h-6 w-6 items-center justify-center rounded bg-red-600/20"
                >
                  <Map class="h-4 w-4 text-red-600" />
                </div>
                <span class="text-sm font-semibold text-red-600"
                  >Map to Delete</span
                >
              </div>
              <div class="text-sm font-bold text-contrast-content">
                {$connectedMapStore?.map_name}
              </div>
              <div class="mt-1 text-xs text-contrast-content/60">
                Owned by {$connectedMapStore?.owner}
              </div>
            </div>

            <!-- Warning -->
            <div class="rounded-lg border border-base-300 bg-orange-600/10 p-4">
              <div class="flex items-center gap-3">
                <div
                  class="flex h-6 w-6 items-center justify-center rounded bg-orange-600/20"
                >
                  <Trash2 class="h-4 w-4 text-orange-600" />
                </div>
                <div class="flex-1">
                  <div class="mb-1 text-sm font-semibold text-orange-600">
                    Warning
                  </div>
                  <div class="text-xs text-contrast-content/70">
                    This action cannot be undone and will remove all associated
                    data
                  </div>
                </div>
              </div>
            </div>

            <!-- Deletion Status -->
            {#if deleteLoadingStage === "confirming"}
              <div
                class="rounded-lg border border-base-300 bg-orange-600/10 p-4 text-center"
              >
                <div class="mb-1 text-sm font-bold text-orange-600">
                  Deleting in {deleteCountdown}...
                </div>
                <div class="text-xs text-contrast-content/70">
                  Click cancel to stop deletion
                </div>
              </div>
            {:else if deleteLoadingStage === "deleting"}
              <div
                class="rounded-lg border border-base-300 bg-red-600/10 p-4 text-center"
              >
                <div class="mb-1 text-sm font-bold text-red-600">
                  Deleting Map...
                </div>
                <div class="text-xs text-contrast-content/70">Please wait</div>
              </div>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes map-scaleIn {
    from {
      opacity: 0;
      transform: scale(0.9);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  @keyframes map-delayedFadeIn {
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

  /* Unique map animations to avoid conflicts */
  @keyframes map-spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  .animate-map-spin {
    animation: map-spin 1s linear infinite;
  }

  @keyframes map-pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  .animate-map-pulse {
    animation: map-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }

  /* Enhanced success animations */
  @keyframes map-successPulse {
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

  .animate-map-successPulse {
    animation: map-successPulse 2s ease-in-out infinite;
  }

  @keyframes map-checkScale {
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

  .animate-map-checkScale {
    animation: map-checkScale 0.6s ease-out 0.3s both;
  }

  @keyframes map-checkDraw {
    0% {
      stroke-dasharray: 50;
      stroke-dashoffset: 50;
    }
    100% {
      stroke-dasharray: 50;
      stroke-dashoffset: 0;
    }
  }

  .animate-map-checkDraw {
    animation: map-checkDraw 0.5s ease-out 0.5s both;
  }

  .animate-fadeIn {
    animation: fadeIn 0.3s ease-out;
  }

  .animate-map-scaleIn {
    animation: map-scaleIn 0.2s ease-out;
  }

  .animate-map-delayedFadeIn {
    animation: map-delayedFadeIn 1s ease-out;
  }
</style>
