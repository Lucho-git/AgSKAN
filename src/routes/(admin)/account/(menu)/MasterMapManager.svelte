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

    isLoading = true
    loadingAction = "create"

    try {
      const result = await mapApi.createAndJoinMap(newMapName, generatedMapId)

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

        toast.success("Map created successfully")
        resetToMain()
        newMapName = ""
        generatedMapId = uuidv4()
        await fetchUserMaps()
        await fetchRecentMaps()
      } else {
        toast.error(`Failed to create map: ${result.message}`)
      }
    } catch (error) {
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

  // Delete map - stub for now
  async function handleDeleteMap() {
    toast.success("Delete functionality - stubbed for now")
    resetToMain()
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

        goBack()
        toast.success("Operation deleted successfully")
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
<div
  class="mb-6 overflow-hidden rounded-xl border border-base-300 bg-base-100 shadow-lg"
>
  <!-- Header with accent line -->
  <div class="relative">
    <div class="h-1 w-full bg-base-content"></div>
    <div class="flex items-center justify-between border-b border-base-300 p-4">
      <!-- Breadcrumb Navigation -->
      <div class="flex min-w-0 flex-1 items-center gap-1">
        <!-- Always show main breadcrumb with fixed height -->
        <div class="flex h-8 items-center">
          <button
            class="flex items-center gap-1 rounded px-1 py-0.5 text-contrast-content transition-colors hover:text-contrast-content/80 {currentView ===
            'main'
              ? 'cursor-default'
              : 'hover:bg-base-200'}"
            on:click={() => navigateToPath(0)}
            disabled={currentView === "main"}
          >
            <Map class="h-4 w-4 sm:h-5 sm:w-5" />
            <span
              class="text-sm font-semibold sm:text-sm {currentView === 'main'
                ? 'inline'
                : 'hidden'}">Map Manager</span
            >
          </button>
        </div>

        <!-- Show additional breadcrumbs if not on main -->
        {#if currentView !== "main"}
          <ChevronRight
            class="h-3 w-3 flex-shrink-0 text-contrast-content/40"
          />

          <!-- For multi-level navigation, show intermediate steps -->
          {#if navigationStack.length > 2}
            {#each navigationStack.slice(1, -1) as view, index}
              <div class="flex h-8 items-center">
                <button
                  class="flex items-center gap-1 rounded px-1 py-0.5 text-xs font-medium text-contrast-content/70 transition-colors hover:bg-base-200 hover:text-contrast-content sm:text-sm"
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
                    <span class="hidden truncate sm:inline">Operations</span>
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
                class="h-3 w-3 flex-shrink-0 text-contrast-content/40"
              />
            {/each}
          {/if}

          <!-- Current page breadcrumb (always highlighted) -->
          <div class="flex h-8 items-center">
            <div
              class="flex cursor-default items-center gap-1 rounded bg-base-200 px-1 py-0.5 text-xs font-medium text-contrast-content sm:text-sm"
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

      <!-- Back Button - Larger on mobile -->
      {#if navigationStack.length > 1}
        <button
          class="ml-4 flex h-8 items-center gap-1 rounded bg-base-200 px-2 py-1 text-sm font-medium text-contrast-content transition-colors hover:bg-base-300 sm:gap-2"
          on:click={goBack}
        >
          <ChevronLeft class="h-4 w-4" />
          <span class="hidden sm:inline">Back</span>
        </button>
      {/if}
    </div>
  </div>

  <!-- Main Content -->
  <div class="flex min-h-[400px] flex-col md:flex-row">
    <!-- ========================================
         DISPLAY INFO SECTION (RIGHT PANEL)
         ======================================== -->
    <div
      class="w-full border-b border-base-300 md:order-2 md:w-1/3 md:border-b-0 md:border-l"
    >
      {#if isConnected}
        {#if currentView === "main"}
          <!-- Main Menu Display - Show Map + Operation -->
          <!-- Mobile Compact View -->
          <div class="md:hidden">
            <div class="bg-base-200/50 p-4">
              <div class="space-y-3">
                <!-- Map Section -->
                <div class="flex items-center gap-2">
                  <div
                    class="flex min-w-0 items-center gap-3"
                    style="flex: 1 1 50%;"
                  >
                    <div
                      class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-green-100"
                    >
                      <Map class="h-4 w-4 text-green-600" />
                    </div>
                    <div class="min-w-0">
                      <h3
                        class="truncate text-sm font-bold text-contrast-content"
                      >
                        {$connectedMapStore.map_name}
                      </h3>
                      <div
                        class="flex items-center gap-1 text-xs text-green-600"
                      >
                        <div
                          class="h-1.5 w-1.5 rounded-full bg-green-500"
                        ></div>
                        <span>Connected</span>
                      </div>
                    </div>
                  </div>
                  <div class="flex items-center gap-1" style="flex: 0 0 50%;">
                    <MapPin
                      class="h-4 w-4 flex-shrink-0 text-contrast-content/60"
                    />
                    <select
                      class="w-full rounded-lg border border-base-300 bg-base-100 p-2 text-sm text-contrast-content outline-none transition-colors focus:border-base-content"
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
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Desktop Full View -->
          <div class="hidden space-y-4 p-6 md:block">
            <!-- Map Section -->
            <div class="text-center">
              <div
                class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100"
              >
                <Map class="h-6 w-6 text-green-600" />
              </div>
              <h3 class="font-bold text-contrast-content">
                {$connectedMapStore.map_name}
              </h3>
              <p class="text-sm text-contrast-content/60">
                Owner: {$connectedMapStore.owner}
              </p>
            </div>

            <!-- Current Operation with Dropdown -->
            {#if $operationStore && $operationStore.length > 0}
              <div class="rounded-lg bg-base-200 p-3">
                <div class="mb-2 flex items-center gap-2">
                  <MapPin class="h-4 w-4 text-contrast-content/60" />
                  <span class="text-xs text-contrast-content/60"
                    >Current Operation</span
                  >
                </div>
                <select
                  class="w-full rounded-lg border border-base-300 bg-base-100 p-2 text-sm text-contrast-content outline-none transition-colors focus:border-base-content"
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
                {#if $selectedOperationStore?.description}
                  <div class="mt-2 text-xs text-contrast-content/60">
                    {$selectedOperationStore.description}
                  </div>
                {/if}
              </div>
            {/if}

            <!-- Map ID -->
            <div class="rounded-lg bg-base-200 p-3">
              <div class="mb-1 flex items-center justify-between">
                <span class="text-xs text-contrast-content/60">Map ID</span>
                <button
                  class="text-xs transition-colors hover:text-contrast-content"
                  on:click={copyMapId}
                >
                  {#if copied}
                    <Check class="h-3 w-3 text-green-500" />
                  {:else}
                    <Copy class="h-3 w-3" />
                  {/if}
                </button>
              </div>
              <code class="break-all font-mono text-xs text-contrast-content/80"
                >{$connectedMapStore.id}</code
              >
            </div>

            <!-- Status Indicators -->
            <div class="space-y-2">
              <div class="flex items-center justify-between text-sm">
                <span class="text-contrast-content/60">Status</span>
                <div class="flex items-center gap-1">
                  <div class="h-2 w-2 rounded-full bg-green-500"></div>
                  <span class="font-medium text-green-600">Connected</span>
                </div>
              </div>

              <div class="flex items-center justify-between text-sm">
                <span class="text-contrast-content/60">Role</span>
                <span class="font-medium text-contrast-content"
                  >{isOwner ? "Owner" : "Member"}</span
                >
              </div>
            </div>
          </div>
        {:else if currentView === "operations"}
          <!-- Operations Management Display -->
          <!-- Mobile Compact View -->
          <div class="md:hidden">
            <div class="bg-base-200/50 p-4">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <div
                    class="flex h-8 w-8 items-center justify-center rounded-full bg-orange-100"
                  >
                    <MapPin class="h-4 w-4 text-orange-600" />
                  </div>
                  <div>
                    <h3 class="text-sm font-bold text-contrast-content">
                      Operations
                    </h3>
                    <div class="text-xs text-contrast-content/60">
                      {$selectedOperationStore?.name || "No operation selected"}
                      ({$selectedOperationStore?.year || ""})
                    </div>
                  </div>
                </div>
                <span
                  class="rounded bg-base-content/10 px-2 py-1 text-xs text-contrast-content/60"
                >
                  {$operationStore?.length || 0} Total
                </span>
              </div>
            </div>
          </div>

          <!-- Desktop Full View -->
          <div class="hidden space-y-4 p-6 md:block">
            <div class="text-center">
              <div
                class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-orange-100"
              >
                <MapPin class="h-6 w-6 text-orange-600" />
              </div>
              <h3 class="font-bold text-contrast-content">
                Operations Management
              </h3>
              <p class="text-sm text-contrast-content/60">
                {$connectedMapStore.map_name}
              </p>
            </div>

            <!-- Current Operation Info -->
            {#if $selectedOperationStore}
              <div class="rounded-lg bg-base-200 p-3">
                <div class="mb-1 text-xs text-contrast-content/60">
                  Current Operation
                </div>
                <div class="font-medium text-contrast-content">
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
            <div class="rounded-lg bg-base-200 p-3">
              <div class="mb-1 text-xs text-contrast-content/60">
                Total Operations
              </div>
              <div class="font-medium text-contrast-content">
                {$operationStore?.length || 0}
              </div>
            </div>
          </div>
        {:else if currentView === "settings"}
          <!-- Map Settings Display -->
          <!-- Mobile Compact View -->
          <div class="md:hidden">
            <div class="bg-base-200/50 p-4">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <div
                    class="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100"
                  >
                    <Settings class="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <h3 class="text-sm font-bold text-contrast-content">
                      {$connectedMapStore.map_name}
                    </h3>
                    <div class="text-xs text-contrast-content/60">
                      Map Settings
                    </div>
                  </div>
                </div>
                <span
                  class="rounded bg-base-content/10 px-2 py-1 text-xs text-contrast-content/60"
                >
                  {isOwner ? "Owner" : "Member"}
                </span>
              </div>
            </div>
          </div>

          <!-- Desktop Full View -->
          <div class="hidden space-y-4 p-6 md:block">
            <div class="text-center">
              <div
                class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100"
              >
                <Settings class="h-6 w-6 text-blue-600" />
              </div>
              <h3 class="font-bold text-contrast-content">
                {$connectedMapStore.map_name}
              </h3>
              <p class="text-sm text-contrast-content/60">
                Owner: {$connectedMapStore.owner}
              </p>
            </div>

            <div class="rounded-lg bg-base-200 p-3">
              <div class="mb-1 flex items-center justify-between">
                <span class="text-xs text-contrast-content/60">Map ID</span>
                <button
                  class="text-xs transition-colors hover:text-contrast-content"
                  on:click={copyMapId}
                >
                  {#if copied}
                    <Check class="h-3 w-3 text-green-500" />
                  {:else}
                    <Copy class="h-3 w-3" />
                  {/if}
                </button>
              </div>
              <code class="break-all font-mono text-xs text-contrast-content/80"
                >{$connectedMapStore.id}</code
              >
            </div>

            <div class="space-y-2">
              <div class="flex items-center justify-between text-sm">
                <span class="text-contrast-content/60">Role</span>
                <span class="font-medium text-contrast-content"
                  >{isOwner ? "Owner" : "Member"}</span
                >
              </div>
            </div>
          </div>
        {:else if currentView === "create-operation"}
          <!-- Create Operation Display -->
          <div class="md:hidden">
            <div class="bg-base-200/50 p-4">
              <div class="flex items-center gap-3">
                <div
                  class="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100"
                >
                  <Plus class="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <h3 class="text-sm font-bold text-contrast-content">
                    {newOperationName || "New Operation"}
                  </h3>
                  <div class="text-xs text-contrast-content/60">
                    {newOperationYear}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="hidden space-y-4 p-6 md:block">
            <div class="text-center">
              <div
                class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100"
              >
                <Plus class="h-6 w-6 text-blue-600" />
              </div>
              <h3 class="font-bold text-contrast-content">
                {newOperationName || "New Operation"}
              </h3>
              <p class="text-sm text-contrast-content/60">
                Year: {newOperationYear}
              </p>
              {#if newOperationDescription}
                <p class="mt-2 text-xs text-contrast-content/60">
                  {newOperationDescription}
                </p>
              {/if}
            </div>

            <div class="rounded-lg bg-base-200 p-3">
              <div class="mb-1 text-xs text-contrast-content/60">Map</div>
              <div class="font-medium text-contrast-content">
                {$connectedMapStore.map_name}
              </div>
            </div>
          </div>
        {:else if currentView === "edit-operation"}
          <!-- Edit Operation Display -->
          <div class="md:hidden">
            <div class="bg-base-200/50 p-4">
              <div class="flex items-center gap-3">
                <div
                  class="flex h-8 w-8 items-center justify-center rounded-full bg-yellow-100"
                >
                  <Pencil class="h-4 w-4 text-yellow-600" />
                </div>
                <div>
                  <h3 class="text-sm font-bold text-contrast-content">
                    {editOperationName || "Edit Operation"}
                  </h3>
                  <div class="text-xs text-contrast-content/60">
                    {editOperationYear}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="hidden space-y-4 p-6 md:block">
            <div class="text-center">
              <div
                class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-yellow-100"
              >
                <Pencil class="h-6 w-6 text-yellow-600" />
              </div>
              <h3 class="font-bold text-contrast-content">
                {editOperationName || "Edit Operation"}
              </h3>
              <p class="text-sm text-contrast-content/60">
                Year: {editOperationYear}
              </p>
              {#if editOperationDescription}
                <p class="mt-2 text-xs text-contrast-content/60">
                  {editOperationDescription}
                </p>
              {/if}
            </div>

            <div class="rounded-lg bg-base-200 p-3">
              <div class="mb-1 text-xs text-contrast-content/60">Map</div>
              <div class="font-medium text-contrast-content">
                {$connectedMapStore.map_name}
              </div>
            </div>
          </div>
        {:else if currentView === "invite"}
          <!-- Invite Team Members Display -->
          <div class="md:hidden">
            <div class="bg-base-200/50 p-4">
              <div class="flex items-center gap-3">
                <div
                  class="flex h-8 w-8 items-center justify-center rounded-full bg-purple-100"
                >
                  <UserPlus class="h-4 w-4 text-purple-600" />
                </div>
                <div>
                  <h3 class="text-sm font-bold text-contrast-content">
                    Invite Team
                  </h3>
                  <div class="text-xs text-contrast-content/60">
                    {$connectedMapStore.map_name}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="hidden space-y-4 p-6 md:block">
            <div class="text-center">
              <div
                class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-purple-100"
              >
                <UserPlus class="h-6 w-6 text-purple-600" />
              </div>
              <h3 class="font-bold text-contrast-content">
                Invite Team Members
              </h3>
              <p class="text-sm text-contrast-content/60">
                Share access to {$connectedMapStore.map_name}
              </p>
            </div>

            <div class="rounded-lg bg-base-200 p-3">
              <div class="mb-1 text-xs text-contrast-content/60">Map ID</div>
              <code class="break-all font-mono text-xs text-contrast-content"
                >{$connectedMapStore.id}</code
              >
            </div>
          </div>
        {/if}
      {:else}
        <!-- Not Connected Display -->
        <div class="bg-base-200/30 p-4 md:hidden">
          <div class="flex items-center justify-center gap-2">
            <div
              class="flex h-6 w-6 items-center justify-center rounded-full bg-base-300"
            >
              <Map class="h-3 w-3 text-base-content/60" />
            </div>
            <span class="text-sm font-medium text-contrast-content/70"
              >No Map Connected</span
            >
          </div>
        </div>

        <div class="hidden px-6 py-8 text-center md:block">
          <div
            class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-base-200"
          >
            <Map class="h-6 w-6 text-base-content/60" />
          </div>
          <h3 class="mb-2 font-semibold text-contrast-content">
            No Map Connected
          </h3>
          <p class="text-sm text-contrast-content/60">
            Create or connect to a map to begin tracking your farm operations.
          </p>
        </div>
      {/if}
    </div>

    <!-- ========================================
         INTERACTIVE MENU SECTION (LEFT PANEL)
         ======================================== -->
    <div class="w-full md:order-1 md:w-2/3">
      <div class="p-6">
        {#if currentView === "main"}
          <!-- ========================================
               MAIN MENU
               ======================================== -->
          <div class="space-y-3">
            {#if isConnected}
              <!-- Connected State Main Menu -->
              <button
                class="group flex w-full items-center justify-between rounded-lg bg-base-content px-4 py-4 font-medium text-base-100 transition-colors hover:bg-base-content/90"
                on:click={() => (window.location.href = "/account/mapviewer")}
              >
                <div class="flex items-center gap-3">
                  <Globe class="h-5 w-5" />
                  <div class="text-left">
                    <div class="font-medium">Launch Map</div>
                    <div class="text-sm text-base-100/70">
                      View your interactive map
                    </div>
                  </div>
                </div>
                <ChevronRight
                  class="h-4 w-4 transition-transform group-hover:translate-x-1"
                />
              </button>

              <button
                class="flex w-full items-center gap-3 rounded-lg bg-base-200 px-4 py-3 text-contrast-content transition-colors hover:bg-base-300"
                on:click={() => navigateTo("settings")}
              >
                <Settings class="h-4 w-4" />
                <div class="text-left">
                  <div class="text-sm font-medium">Map Settings</div>
                  <div class="text-xs text-contrast-content/60">
                    Configure map preferences
                  </div>
                </div>
              </button>

              <button
                class="flex w-full items-center gap-3 rounded-lg bg-base-200 px-4 py-3 text-contrast-content transition-colors hover:bg-base-300"
                on:click={() => navigateTo("operations")}
              >
                <MapPin class="h-4 w-4" />
                <div class="text-left">
                  <div class="text-sm font-medium">Manage Operations</div>
                  <div class="text-xs text-contrast-content/60">
                    Add, edit, and organize operations
                  </div>
                </div>
              </button>

              <button
                class="flex w-full items-center gap-3 rounded-lg bg-base-200 px-4 py-3 text-contrast-content transition-colors hover:bg-base-300"
                on:click={() => navigateTo("invite")}
              >
                <UserPlus class="h-4 w-4" />
                <div class="text-left">
                  <div class="text-sm font-medium">Invite Team Members</div>
                  <div class="text-xs text-contrast-content/60">
                    Share map access with others
                  </div>
                </div>
              </button>
            {:else}
              <!-- Disconnected State Main Menu -->
              <div class="mb-6 text-center">
                <p class="text-contrast-content/60">
                  Get started with map management
                </p>
              </div>

              <button
                class="flex w-full items-center gap-3 rounded-lg bg-base-content px-4 py-3 font-medium text-base-100 transition-colors hover:bg-base-content/90"
                on:click={() => navigateTo("create")}
              >
                <Plus class="h-4 w-4" />
                <div class="text-left">
                  <div class="text-sm font-medium">Create New Map</div>
                  <div class="text-xs text-base-100/70">
                    Start a new farm map
                  </div>
                </div>
              </button>

              <button
                class="flex w-full items-center gap-3 rounded-lg bg-base-200 px-4 py-3 text-contrast-content transition-colors hover:bg-base-300"
                on:click={() => navigateTo("connect")}
              >
                <Search class="h-4 w-4" />
                <div class="text-left">
                  <div class="text-sm font-medium">Connect to Map</div>
                  <div class="text-xs text-contrast-content/60">
                    Join an existing map
                  </div>
                </div>
              </button>
            {/if}
          </div>
        {:else if currentView === "create"}
          <!-- ========================================
               CREATE MAP FORM
               ======================================== -->
          <form on:submit|preventDefault={handleCreateMap} class="space-y-6">
            <div class="rounded-lg border border-base-300 bg-base-200 p-6">
              <div class="mb-4 flex items-center justify-center">
                <div
                  class="flex h-16 w-16 items-center justify-center rounded-full bg-yellow-400/20"
                >
                  <Map class="h-8 w-8 text-yellow-600" />
                </div>
              </div>
              <div class="text-center">
                <h4 class="text-lg font-semibold text-contrast-content">
                  {newMapName || "New Map"}
                </h4>
                <div
                  class="mt-2 inline-block rounded bg-base-300 px-2 py-1 font-mono text-xs text-contrast-content/60"
                >
                  {generatedMapId}
                </div>
              </div>
            </div>

            <div>
              <label
                for="mapName"
                class="mb-1.5 block text-sm text-contrast-content/60"
              >
                Map Name
              </label>
              <input
                id="mapName"
                type="text"
                bind:value={newMapName}
                class="w-full rounded-lg border border-base-300 bg-base-200 p-3 text-contrast-content outline-none transition-colors focus:border-base-content"
                placeholder="Enter map name"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              class="flex w-full items-center justify-center gap-2 rounded-lg bg-base-content px-6 py-3 font-medium text-base-100 transition-colors hover:bg-base-content/90 {isLoading
                ? 'cursor-not-allowed opacity-50'
                : ''}"
            >
              {#if isLoading && loadingAction === "create"}
                <div
                  class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                ></div>
              {:else}
                <Plus class="h-4 w-4" />
              {/if}
              {isLoading && loadingAction === "create"
                ? "Creating Map..."
                : "Create Map"}
            </button>
          </form>
        {:else if currentView === "connect" || currentView === "switch-map"}
          <!-- ========================================
               CONNECT/SWITCH MAP
               ======================================== -->
          <div class="space-y-6">
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
                      class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
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
                              Owner: {map.owner_name}
                            </div>
                          </div>
                          {#if isLoading && loadingAction === `connect-${map.id}`}
                            <div
                              class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
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
                              class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
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
          <!-- ========================================
               MAP SETTINGS
               ======================================== -->
          <div class="space-y-4">
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
                          class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
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
                  class="flex w-full items-center gap-3 rounded-lg bg-base-content px-4 py-2.5 font-medium text-base-100 transition-colors hover:bg-base-content/90"
                  on:click={() => navigateTo("create")}
                >
                  <Plus class="h-4 w-4" />
                  <div class="text-left">
                    <div class="text-sm font-medium">Create New Map</div>
                    <div class="text-xs text-base-100/70">
                      Start a fresh map project
                    </div>
                  </div>
                </button>

                <!-- Switch Map Option -->
                <button
                  class="flex w-full items-center gap-3 rounded-lg bg-base-200 px-4 py-2.5 font-medium text-contrast-content transition-colors hover:bg-base-300"
                  on:click={() => navigateTo("switch-map")}
                >
                  <Link2 class="h-4 w-4" />
                  <div class="text-left">
                    <div class="text-sm font-medium">
                      Switch to Different Map
                    </div>
                    <div class="text-xs text-contrast-content/60">
                      Connect to another map
                    </div>
                  </div>
                </button>

                <!-- Leave Map Option -->
                <button
                  class="flex w-full items-center gap-3 rounded-lg bg-base-200 px-4 py-2.5 font-medium text-contrast-content transition-colors hover:bg-base-300"
                  on:click={handleDisconnectFromMap}
                  disabled={isLoading}
                >
                  {#if isLoading && loadingAction === "disconnect"}
                    <div
                      class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                    ></div>
                  {:else}
                    <LogOut class="h-4 w-4" />
                  {/if}
                  <div class="text-left">
                    <div class="text-sm font-medium">Leave Map</div>
                    <div class="text-xs text-contrast-content/60">
                      Disconnect without switching
                    </div>
                  </div>
                </button>

                {#if isOwner}
                  <button
                    class="flex w-full items-center gap-3 rounded-lg bg-base-200 px-4 py-2.5 font-medium text-contrast-content transition-colors hover:bg-base-300"
                    on:click={() => navigateTo("delete-confirm")}
                  >
                    <Trash2 class="h-4 w-4 text-red-600" />
                    <div class="text-left">
                      <div class="text-sm font-medium">Delete Map</div>
                      <div class="text-xs text-contrast-content/60">
                        Permanently remove this map
                      </div>
                    </div>
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
          <!-- ========================================
               OPERATIONS MANAGEMENT
               ======================================== -->
          <div class="space-y-4">
            {#if $operationStore && $operationStore.length > 0}
              <!-- Operation Selector -->
              <div>
                <label class="mb-2 block text-sm text-contrast-content/60"
                  >Current Operation</label
                >
                <select
                  class="w-full rounded-lg border border-base-300 bg-base-200 p-3 text-contrast-content outline-none transition-colors focus:border-base-content"
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
              </div>

              <!-- Operation Actions -->
              <div class="space-y-2">
                <button
                  class="flex w-full items-center gap-3 rounded-lg bg-base-200 px-4 py-2.5 font-medium text-contrast-content transition-colors hover:bg-base-300"
                  on:click={() => navigateTo("create-operation")}
                >
                  <Plus class="h-4 w-4" />
                  <div class="text-left">
                    <div class="text-sm font-medium">Create New Operation</div>
                    <div class="text-xs text-contrast-content/60">
                      Add a new operation to this map
                    </div>
                  </div>
                </button>

                {#if $selectedOperationStore}
                  <button
                    class="flex w-full items-center gap-3 rounded-lg bg-base-200 px-4 py-2.5 text-contrast-content transition-colors hover:bg-base-300"
                    on:click={prepareEditOperation}
                  >
                    <Pencil class="h-4 w-4" />
                    <div class="text-left">
                      <div class="text-sm font-medium">Edit Operation</div>
                      <div class="text-xs text-contrast-content/60">
                        Modify operation details
                      </div>
                    </div>
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
          <!-- ========================================
               CREATE OPERATION FORM
               ======================================== -->
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
              <select
                id="operationYear"
                bind:value={newOperationYear}
                class="w-full rounded-lg border border-base-300 bg-base-200 p-3 text-contrast-content outline-none transition-colors focus:border-base-content"
                required
              >
                {#each yearOptions as year}
                  <option value={year}>{year}</option>
                {/each}
              </select>
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
                  class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                ></div>
              {:else}
                <Save class="h-4 w-4" />
              {/if}
              {isLoading && loadingAction === "create-operation"
                ? "Creating..."
                : "Create Operation"}
            </button>
          </form>
        {:else if currentView === "edit-operation"}
          <!-- ========================================
               EDIT OPERATION FORM
               ======================================== -->
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
              <select
                id="editOperationYear"
                bind:value={editOperationYear}
                class="w-full rounded-lg border border-base-300 bg-base-200 p-3 text-contrast-content outline-none transition-colors focus:border-base-content"
                required
              >
                {#each yearOptions as year}
                  <option value={year}>{year}</option>
                {/each}
              </select>
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
                    class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                  ></div>
                {:else}
                  <Save class="h-4 w-4" />
                {/if}
                {isLoading && loadingAction === "update-operation"
                  ? "Updating..."
                  : "Save"}
              </button>
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
                    class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                  ></div>
                {:else}
                  <Trash2 class="h-4 w-4" />
                {/if}
                Delete
              </button>
            </div>
          </form>
        {:else if currentView === "invite"}
          <!-- ========================================
               INVITE TEAM MEMBERS
               ======================================== -->
          <div class="space-y-6">
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
                class="flex w-full items-center gap-3 rounded-lg bg-base-200 px-4 py-2.5 text-contrast-content transition-colors hover:bg-base-300"
                on:click={shareViaSMS}
              >
                <Phone class="h-4 w-4" />
                <div class="text-left">
                  <div class="text-sm font-medium">Share via SMS</div>
                  <div class="text-xs text-contrast-content/60">
                    Send link through your messaging app
                  </div>
                </div>
              </button>

              <button
                class="flex w-full items-center gap-3 rounded-lg bg-base-200 px-4 py-2.5 text-contrast-content transition-colors hover:bg-base-300"
                on:click={shareViaEmail}
              >
                <Mail class="h-4 w-4" />
                <div class="text-left">
                  <div class="text-sm font-medium">Share via Email</div>
                  <div class="text-xs text-contrast-content/60">
                    Send link through your email app
                  </div>
                </div>
              </button>
            </div>
          </div>
        {:else if currentView === "delete-confirm"}
          <!-- ========================================
               DELETE CONFIRMATION
               ======================================== -->
          <div class="space-y-6">
            <div
              class="rounded-lg border border-red-200 bg-red-50 p-6 text-center"
            >
              <div
                class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100"
              >
                <Trash2 class="h-8 w-8 text-red-600" />
              </div>
              <h3 class="mb-2 text-lg font-semibold text-red-900">
                Delete Map
              </h3>
              <p class="mb-4 text-red-800">
                Are you sure you want to permanently delete "{$connectedMapStore.map_name}"?
                This action cannot be undone and will remove all associated
                data.
              </p>
            </div>

            <div class="space-y-3">
              <button
                class="w-full rounded-lg bg-red-600 px-4 py-3 font-medium text-white transition-colors hover:bg-red-700"
                on:click={handleDeleteMap}
              >
                Yes, Delete Map Permanently
              </button>
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>
