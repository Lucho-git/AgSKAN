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
    ChevronDown,
    ChevronUp,
    ArrowLeft,
    FileText,
    Pencil,
    UserPlus,
    Share2,
    Phone,
    Mail,
    Link,
    AlertTriangle,
    Car,
    Navigation,
    Route,
    MoreVertical,
    Minus,
  } from "lucide-svelte"

  // ========================================
  // TAB MANAGEMENT
  // ========================================
  let activeTab = "dashboard"
  let isLoading = false
  let loadingAction = null

  // Reactive values
  $: isConnected = $connectedMapStore?.id
  $: isOwner = $connectedMapStore?.is_owner
  $: currentYear = new Date().getFullYear()
  $: yearOptions = Array.from({ length: 10 }, (_, i) => currentYear - 5 + i)
  $: isOnlyOperation = $operationStore.length <= 1

  // ========================================
  // SHARED STATE
  // ========================================
  let userMaps = []
  let recentMaps = []
  let copied = false

  // Map Objects sub-menu
  let mapObjectsView = "vehicles"

  // ========================================
  // CREATE MAP STATE & FUNCTIONS
  // ========================================
  let newMapName = ""
  let generatedMapId = uuidv4()
  let showCreateForm = false
  let showJoinForm = false

  // Helper function to close all map submenus
  function closeAllMapMenus() {
    showCreateForm = false
    showJoinForm = false
    showDeleteConfirm = false
    showLeaveMapConfirm = false
    showSwitchMapConfirm = false
    showLaunchMapConfirm = false
    showMapOptions = false
  }

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
          profileStore.update((profile) => ({
            ...profile,
            master_map_id: mapId,
            recent_maps: [mapId, ...(profile.recent_maps || [])].slice(0, 10),
            selected_operation_id: operation.id,
          }))
        }

        toast.success("Map created successfully")
        activeTab = "dashboard"
        newMapName = ""
        generatedMapId = uuidv4()
        showCreateForm = false
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
  // CONNECT TO MAP FUNCTIONS
  // ========================================
  let enteredMapId = ""

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
        activeTab = "dashboard"
        enteredMapId = ""
        showJoinForm = false
        showSwitchMapConfirm = false
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
  // MAP SETTINGS FUNCTIONS
  // ========================================
  let isRenaming = false
  let newMapNameInput = ""
  let showDeleteConfirm = false
  let showLeaveMapConfirm = false
  let showSwitchMapConfirm = false
  let showLaunchMapConfirm = false
  let showMapOptions = false
  let confirmationInput = ""

  // Check if any map menu is open
  $: isMapMenuOpen =
    showMapOptions ||
    showLaunchMapConfirm ||
    showSwitchMapConfirm ||
    showLeaveMapConfirm

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
        activeTab = "map"
        showLeaveMapConfirm = false
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

  function copyMapId() {
    if ($connectedMapStore?.id) {
      navigator.clipboard.writeText($connectedMapStore.id)
      copied = true
      closeAllMapMenus() // Close dropdown after copy
      setTimeout(() => (copied = false), 2000)
      toast.success("Map ID copied")
    }
  }

  function copyMapLink() {
    if ($connectedMapStore?.id) {
      const shareUrl = `https://www.skanfarming.com.au/login?map_id=${$connectedMapStore.id}`
      navigator.clipboard.writeText(shareUrl)
      closeAllMapMenus() // Close dropdown after copy
      toast.success("Map link copied")
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
        activeTab = "map"
        showDeleteConfirm = false
        confirmationInput = ""
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

  function handleLaunchMap() {
    window.location.href = "/account/mapviewer"
    showLaunchMapConfirm = false
  }

  function handleMapPanelClick() {
    if (isMapMenuOpen) {
      // If any menu is open, close all
      closeAllMapMenus()
      closeAllOperationMenus()
    } else {
      // If no menu is open, open options dropdown
      closeAllOperationMenus()
      showMapOptions = true
    }
  }

  function handleMapOptionsClick() {
    if (isMapMenuOpen) {
      // If any menu is open, close all
      closeAllMapMenus()
    } else {
      // If no menu is open, open options
      closeAllOperationMenus()
      showMapOptions = true
    }
  }

  function openLeaveMapConfirm() {
    closeAllMapMenus()
    closeAllOperationMenus()
    showLeaveMapConfirm = true
  }

  function openSwitchMapConfirm() {
    closeAllMapMenus()
    closeAllOperationMenus()
    showSwitchMapConfirm = true
  }

  function openLaunchMapConfirm() {
    closeAllMapMenus()
    closeAllOperationMenus()
    showLaunchMapConfirm = true
  }

  // ========================================
  // OPERATIONS FUNCTIONS
  // ========================================
  let showCreateOperation = false
  let showEditOperation = false
  let showDeleteOperationConfirm = false
  let showOperationOptions = false
  let expandedOperationId = null
  let editingOperationId = null
  let deletingOperationId = null
  let newOperationName = ""
  let newOperationYear = new Date().getFullYear()
  let newOperationDescription = ""
  let editOperationName = ""
  let editOperationYear = new Date().getFullYear()
  let editOperationDescription = ""

  // Check if any operation menu is open
  $: isOperationMenuOpen =
    showOperationOptions ||
    showCreateOperation ||
    showEditOperation ||
    showDeleteOperationConfirm

  // Helper function to close all operation submenus
  function closeAllOperationMenus() {
    showCreateOperation = false
    showEditOperation = false
    showDeleteOperationConfirm = false
    showOperationOptions = false
    expandedOperationId = null
    editingOperationId = null
    deletingOperationId = null
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
      closeAllOperationMenus()
      closeAllMapMenus()
      showEditOperation = true
    }
  }

  function handleOperationPanelClick() {
    if (isOperationMenuOpen) {
      // If any menu is open, close all
      closeAllOperationMenus()
      closeAllMapMenus()
    } else {
      // If no menu is open, open options dropdown
      closeAllMapMenus()
      showOperationOptions = true
    }
  }

  function handleOperationOptionsClick() {
    if (isOperationMenuOpen) {
      // If any menu is open, close all
      closeAllOperationMenus()
    } else {
      // If no menu is open, open options
      closeAllMapMenus()
      showOperationOptions = true
    }
  }

  function openCreateOperationFromOptions() {
    closeAllOperationMenus()
    closeAllMapMenus()
    showCreateOperation = true
  }

  function openCreateMapForm() {
    closeAllMapMenus()
    showCreateForm = true
  }

  function openJoinMapForm() {
    closeAllMapMenus()
    showJoinForm = true
  }

  function openDeleteConfirmation() {
    closeAllMapMenus()
    showDeleteConfirm = true
  }

  function openDeleteOperationConfirm() {
    closeAllOperationMenus()
    closeAllMapMenus()
    showDeleteOperationConfirm = true
  }

  async function handleUpdateOperation() {
    if (!editOperationName.trim()) {
      toast.error("Operation name is required")
      return
    }

    isLoading = true
    loadingAction = "update-operation"

    const updatedOperation = {
      id: editingOperationId,
      name: editOperationName.trim(),
      year: Number(editOperationYear),
      description: editOperationDescription.trim(),
      master_map_id: $operationStore.find((op) => op.id === editingOperationId)
        ?.master_map_id,
    }

    try {
      const result = await operationApi.updateOperation(editingOperationId, {
        name: editOperationName.trim(),
        year: Number(editOperationYear),
        description: editOperationDescription.trim(),
      })

      if (result.success) {
        operationStore.update((ops) =>
          ops.map((op) =>
            op.id === editingOperationId ? updatedOperation : op,
          ),
        )

        if ($selectedOperationStore?.id === editingOperationId) {
          selectedOperationStore.set(updatedOperation)
        }

        closeAllOperationMenus()
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

  async function handleDeleteOperation(operationId) {
    if (isOnlyOperation) {
      toast.error("Cannot delete the only operation")
      return
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

        closeAllOperationMenus()
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
  // LIFECYCLE
  // ========================================
  onMount(async () => {
    await fetchUserMaps()
    await fetchRecentMaps()
    if (!isConnected) {
      activeTab = "map"
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
            <Globe
              class="h-3 w-3 {activeTab === 'dashboard'
                ? 'text-green-500'
                : 'text-contrast-content/60'}"
            />
          </div>
          <span class="xs:inline hidden sm:hidden lg:inline">Dashboard</span>
          <span class="xs:hidden sm:inline lg:hidden">Dash</span>
        </button>
      {/if}

      <button
        class="flex flex-1 items-center gap-2 whitespace-nowrap rounded-t-lg px-2 py-3 text-xs font-medium transition-colors sm:px-4 sm:text-sm {activeTab ===
        'map'
          ? 'bg-base-200 text-contrast-content'
          : 'text-contrast-content/60 hover:bg-base-100 hover:text-contrast-content'}"
        on:click={() => (activeTab = "map")}
      >
        <div
          class="flex h-5 w-5 items-center justify-center rounded-full {activeTab ===
          'map'
            ? 'bg-blue-500/20'
            : 'bg-base-300'}"
        >
          <Map
            class="h-3 w-3 {activeTab === 'map'
              ? 'text-blue-500'
              : 'text-contrast-content/60'}"
          />
        </div>
        Map
      </button>

      {#if isConnected}
        <button
          class="flex flex-1 items-center gap-2 whitespace-nowrap rounded-t-lg px-2 py-3 text-xs font-medium transition-colors sm:px-4 sm:text-sm {activeTab ===
          'operations'
            ? 'bg-base-200 text-contrast-content'
            : 'text-contrast-content/60 hover:bg-base-100 hover:text-contrast-content'}"
          on:click={() => (activeTab = "operations")}
        >
          <div
            class="flex h-5 w-5 items-center justify-center rounded-full {activeTab ===
            'operations'
              ? 'bg-purple-500/20'
              : 'bg-base-300'}"
          >
            <MapPin
              class="h-3 w-3 {activeTab === 'operations'
                ? 'text-purple-500'
                : 'text-contrast-content/60'}"
            />
          </div>
          <span class="xs:inline hidden sm:hidden lg:inline">Operations</span>
          <span class="xs:hidden sm:inline lg:hidden">Ops</span>
        </button>

        <button
          class="flex flex-1 items-center gap-2 whitespace-nowrap rounded-t-lg px-2 py-3 text-xs font-medium transition-colors sm:px-4 sm:text-sm {activeTab ===
          'objects'
            ? 'bg-base-200 text-contrast-content'
            : 'text-contrast-content/60 hover:bg-base-100 hover:text-contrast-content'}"
          on:click={() => (activeTab = "objects")}
        >
          <div
            class="flex h-5 w-5 items-center justify-center rounded-full {activeTab ===
            'objects'
              ? 'bg-orange-500/20'
              : 'bg-base-300'}"
          >
            <Navigation
              class="h-3 w-3 {activeTab === 'objects'
                ? 'text-orange-500'
                : 'text-contrast-content/60'}"
            />
          </div>
          <span class="xs:inline hidden sm:hidden lg:inline">Objects</span>
          <span class="xs:hidden sm:inline lg:hidden">Obj</span>
          <span
            class="ml-1 hidden rounded bg-base-300 px-1.5 py-0.5 text-xs sm:inline"
            >Loading</span
          >
        </button>
      {/if}
    </div>
  </div>

  <!-- Tab Content -->
  <div
    class="mb-6 min-h-[32rem] rounded-xl border border-base-300 bg-base-100 p-6 shadow-lg"
  >
    {#if activeTab === "dashboard" && isConnected}
      <!-- Dashboard Tab - Condensed -->
      <div class="space-y-6">
        <!-- Map Info Header - Full Width -->
        <div class="relative rounded-lg bg-base-200 p-4 transition-colors">
          <button
            class="flex w-full items-center justify-between text-left"
            on:click={handleMapPanelClick}
          >
            <div class="flex items-center gap-3">
              <div
                class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-green-600/20"
              >
                <Map class="h-5 w-5 text-green-600" />
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

            <!-- Options Button -->
            <div class="flex gap-2">
              <button
                class="flex h-8 w-8 items-center justify-center rounded-lg bg-base-100/60 transition-colors hover:bg-base-100"
                on:click|stopPropagation={handleMapOptionsClick}
                title="Map options"
              >
                {#if isMapMenuOpen}
                  <ChevronUp class="h-4 w-4 text-contrast-content/60" />
                {:else}
                  <MoreVertical class="h-4 w-4 text-contrast-content/60" />
                {/if}
              </button>
            </div>
          </button>

          <!-- Options Menu Dropdown -->
          {#if showMapOptions}
            <div
              class="absolute right-0 top-full z-50 mt-2 w-48 rounded-lg border border-base-300 bg-base-100 py-1 shadow-lg"
            >
              <button
                class="flex w-full items-center gap-3 px-4 py-2 text-sm text-contrast-content transition-colors hover:bg-base-200"
                on:click|stopPropagation={openLaunchMapConfirm}
              >
                <div
                  class="flex h-6 w-6 items-center justify-center rounded-full bg-green-600/20"
                >
                  <Globe class="h-3 w-3 text-green-600" />
                </div>
                Launch Map
              </button>
              <button
                class="flex w-full items-center gap-3 px-4 py-2 text-sm text-contrast-content transition-colors hover:bg-base-200"
                on:click|stopPropagation={copyMapId}
              >
                <div
                  class="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600/20"
                >
                  <Copy class="h-3 w-3 text-blue-600" />
                </div>
                Copy Map ID
              </button>
              <button
                class="flex w-full items-center gap-3 px-4 py-2 text-sm text-contrast-content transition-colors hover:bg-base-200"
                on:click|stopPropagation={copyMapLink}
              >
                <div
                  class="flex h-6 w-6 items-center justify-center rounded-full bg-green-600/20"
                >
                  <Link class="h-3 w-3 text-green-600" />
                </div>
                Copy Map Link
              </button>
              <button
                class="flex w-full items-center gap-3 px-4 py-2 text-sm text-contrast-content transition-colors hover:bg-base-200"
                on:click|stopPropagation={openSwitchMapConfirm}
              >
                <div
                  class="flex h-6 w-6 items-center justify-center rounded-full bg-purple-600/20"
                >
                  <Link2 class="h-3 w-3 text-purple-600" />
                </div>
                Switch Map
              </button>
              <button
                class="flex w-full items-center gap-3 px-4 py-2 text-sm text-contrast-content transition-colors hover:bg-base-200"
                on:click|stopPropagation={openLeaveMapConfirm}
              >
                <div
                  class="flex h-6 w-6 items-center justify-center rounded-full bg-orange-600/20"
                >
                  <LogOut class="h-3 w-3 text-orange-600" />
                </div>
                Leave Map
              </button>
            </div>
          {/if}

          <!-- Expandable Launch Map Confirmation -->
          {#if showLaunchMapConfirm}
            <div class="animate-slideDown mt-4 border-t border-base-300 pt-4">
              <div class="space-y-4" on:click|stopPropagation>
                <div>
                  <h4 class="mb-2 font-semibold text-contrast-content">
                    Launch Interactive Map
                  </h4>
                  <p class="text-sm text-contrast-content/60">
                    This will open the interactive map viewer in a new window
                    where you can view and edit map data.
                  </p>
                </div>
                <div class="flex gap-2">
                  <button
                    class="flex-1 rounded-lg border border-base-300 bg-base-100 py-2 text-sm font-medium text-contrast-content transition-colors hover:bg-base-300"
                    on:click={() => closeAllMapMenus()}
                  >
                    Cancel
                  </button>
                  <button
                    class="flex-1 rounded-lg bg-base-content py-2 text-sm font-medium text-base-100 transition-colors hover:bg-base-content/90"
                    on:click={handleLaunchMap}
                  >
                    Launch Map
                  </button>
                </div>
              </div>
            </div>
          {/if}

          <!-- Expandable Switch Map - Full Form -->
          {#if showSwitchMapConfirm}
            <div class="animate-slideDown mt-4 border-t border-base-300 pt-4">
              <div class="space-y-4" on:click|stopPropagation>
                <div>
                  <h4 class="mb-2 font-semibold text-contrast-content">
                    Switch to Another Map
                  </h4>
                  <label class="mb-1 block text-sm text-contrast-content/60"
                    >Map ID</label
                  >
                  <input
                    type="text"
                    bind:value={enteredMapId}
                    placeholder="Enter Map ID"
                    class="w-full rounded-lg border border-base-300 bg-base-100 p-3 text-sm text-contrast-content outline-none transition-colors focus:border-base-content"
                  />
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

                <div class="flex gap-2">
                  <button
                    class="flex-1 rounded-lg border border-base-300 bg-base-100 py-2 text-sm font-medium text-contrast-content transition-colors hover:bg-base-300"
                    on:click={() => {
                      closeAllMapMenus()
                      enteredMapId = ""
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    class="flex-1 rounded-lg bg-base-content py-2 text-sm font-medium text-base-100 transition-colors hover:bg-base-content/90 disabled:cursor-not-allowed disabled:opacity-50"
                    on:click={() => connectToMap(enteredMapId)}
                    disabled={isLoading || !enteredMapId.trim()}
                  >
                    {isLoading && loadingAction === `connect-${enteredMapId}`
                      ? "Switching..."
                      : "Switch Map"}
                  </button>
                </div>
              </div>
            </div>
          {/if}

          <!-- Expandable Leave Map Confirmation -->
          {#if showLeaveMapConfirm}
            <div class="animate-slideDown mt-4 border-t border-base-300 pt-4">
              <div class="space-y-4" on:click|stopPropagation>
                <div>
                  <h4 class="mb-2 font-semibold text-contrast-content">
                    Leave Map
                  </h4>
                  <p class="text-sm text-contrast-content/60">
                    Are you sure you want to disconnect from "{$connectedMapStore.map_name}"?
                    You can reconnect later using the Map ID.
                  </p>
                </div>
                <div class="flex gap-2">
                  <button
                    class="flex-1 rounded-lg border border-base-300 bg-base-100 py-2 text-sm font-medium text-contrast-content transition-colors hover:bg-base-300"
                    on:click={() => closeAllMapMenus()}
                  >
                    Cancel
                  </button>
                  <button
                    class="flex-1 rounded-lg bg-orange-500 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
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

        <!-- Operation Selector with Header and Dropdown -->
        <div class="relative rounded-lg bg-base-200 p-4 transition-colors">
          <button
            class="mb-3 flex w-full items-center justify-between text-left"
            on:click={handleOperationPanelClick}
          >
            <div class="flex items-center gap-3">
              <div
                class="flex h-10 w-10 items-center justify-center rounded-full bg-purple-600/20"
              >
                <MapPin class="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <h3 class="font-semibold text-contrast-content">Operation</h3>
                <p class="text-sm text-contrast-content/60">
                  Select active operation
                </p>
              </div>
            </div>

            <!-- Options Button -->
            <div class="flex gap-2">
              <button
                class="flex h-8 w-8 items-center justify-center rounded-lg bg-base-100/60 transition-colors hover:bg-base-100"
                on:click|stopPropagation={handleOperationOptionsClick}
                title="Operation options"
              >
                {#if isOperationMenuOpen}
                  <ChevronUp class="h-4 w-4 text-contrast-content/60" />
                {:else}
                  <MoreVertical class="h-4 w-4 text-contrast-content/60" />
                {/if}
              </button>
            </div>
          </button>

          <!-- Operation selector -->
          <div class="relative">
            <select
              class="w-full appearance-none rounded-lg border border-base-300 bg-base-100 p-3 pr-10 text-sm text-contrast-content outline-none transition-colors focus:border-base-content"
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
            <p class="mt-2 text-xs text-contrast-content/60">
              {$selectedOperationStore.description}
            </p>
          {/if}

          <!-- Options Menu Dropdown -->
          {#if showOperationOptions}
            <div
              class="absolute right-0 top-full z-50 mt-2 w-48 rounded-lg border border-base-300 bg-base-100 py-1 shadow-lg"
            >
              <button
                class="flex w-full items-center gap-3 px-4 py-2 text-sm text-contrast-content transition-colors hover:bg-base-200"
                on:click|stopPropagation={openCreateOperationFromOptions}
              >
                <div
                  class="flex h-6 w-6 items-center justify-center rounded-full bg-green-600/20"
                >
                  <Plus class="h-3 w-3 text-green-600" />
                </div>
                Add Operation
              </button>
              <button
                class="flex w-full items-center gap-3 px-4 py-2 text-sm text-contrast-content transition-colors hover:bg-base-200"
                on:click|stopPropagation={prepareEditOperation}
              >
                <div
                  class="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600/20"
                >
                  <Pencil class="h-3 w-3 text-blue-600" />
                </div>
                Edit Operation
              </button>
              {#if !isOnlyOperation}
                <button
                  class="flex w-full items-center gap-3 px-4 py-2 text-sm text-contrast-content transition-colors hover:bg-base-200"
                  on:click|stopPropagation={openDeleteOperationConfirm}
                >
                  <div
                    class="flex h-6 w-6 items-center justify-center rounded-full bg-red-600/20"
                  >
                    <Trash2 class="h-3 w-3 text-red-600" />
                  </div>
                  Delete Operation
                </button>
              {/if}
            </div>
          {/if}

          <!-- Expandable Create Operation Section -->
          {#if showCreateOperation}
            <div class="animate-slideDown mt-4 border-t border-base-300 pt-4">
              <div class="mb-4 flex items-center justify-between">
                <h4 class="font-semibold text-contrast-content">
                  Create Operation
                </h4>
              </div>
              <div class="space-y-3" on:click|stopPropagation>
                <div>
                  <label class="mb-1 block text-sm text-contrast-content/60"
                    >Name</label
                  >
                  <input
                    type="text"
                    bind:value={newOperationName}
                    placeholder="Operation name"
                    class="w-full rounded-lg border border-base-300 bg-base-100 p-2.5 text-sm text-contrast-content outline-none transition-colors focus:border-base-content"
                  />
                </div>
                <div>
                  <label class="mb-1 block text-sm text-contrast-content/60"
                    >Year</label
                  >
                  <select
                    bind:value={newOperationYear}
                    class="w-full rounded-lg border border-base-300 bg-base-100 p-2.5 text-sm text-contrast-content outline-none transition-colors focus:border-base-content"
                  >
                    {#each yearOptions as year}
                      <option value={year}>{year}</option>
                    {/each}
                  </select>
                </div>
                <div>
                  <label class="mb-1 block text-sm text-contrast-content/60"
                    >Description</label
                  >
                  <textarea
                    bind:value={newOperationDescription}
                    placeholder="Optional description"
                    rows="2"
                    class="w-full resize-none rounded-lg border border-base-300 bg-base-100 p-2.5 text-sm text-contrast-content outline-none transition-colors focus:border-base-content"
                  ></textarea>
                </div>
                <div class="flex gap-2 pt-2">
                  <button
                    class="flex-1 rounded-lg border border-base-300 bg-base-100 py-2 text-sm font-medium text-contrast-content transition-colors hover:bg-base-300"
                    on:click={() => {
                      closeAllOperationMenus()
                      newOperationName = ""
                      newOperationDescription = ""
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    class="flex-1 rounded-lg bg-base-content py-2 text-sm font-medium text-base-100 transition-colors hover:bg-base-content/90 disabled:cursor-not-allowed disabled:opacity-50"
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
            <div class="animate-slideDown mt-4 border-t border-base-300 pt-4">
              <div class="mb-4 flex items-center justify-between">
                <h4 class="font-semibold text-contrast-content">
                  Edit Operation
                </h4>
              </div>
              <div class="space-y-3" on:click|stopPropagation>
                <div>
                  <label class="mb-1 block text-sm text-contrast-content/60"
                    >Name</label
                  >
                  <input
                    type="text"
                    bind:value={editOperationName}
                    class="w-full rounded-lg border border-base-300 bg-base-100 p-2.5 text-sm text-contrast-content outline-none transition-colors focus:border-base-content"
                  />
                </div>
                <div>
                  <label class="mb-1 block text-sm text-contrast-content/60"
                    >Year</label
                  >
                  <select
                    bind:value={editOperationYear}
                    class="w-full rounded-lg border border-base-300 bg-base-100 p-2.5 text-sm text-contrast-content outline-none transition-colors focus:border-base-content"
                  >
                    {#each yearOptions as year}
                      <option value={year}>{year}</option>
                    {/each}
                  </select>
                </div>
                <div>
                  <label class="mb-1 block text-sm text-contrast-content/60"
                    >Description</label
                  >
                  <textarea
                    bind:value={editOperationDescription}
                    rows="2"
                    class="w-full resize-none rounded-lg border border-base-300 bg-base-100 p-2.5 text-sm text-contrast-content outline-none transition-colors focus:border-base-content"
                  ></textarea>
                </div>
                <div class="flex gap-2 pt-2">
                  <button
                    class="flex-1 rounded-lg border border-base-300 bg-base-100 py-2 text-sm font-medium text-contrast-content transition-colors hover:bg-base-300"
                    on:click={() => closeAllOperationMenus()}
                  >
                    Cancel
                  </button>
                  <button
                    class="flex-1 rounded-lg bg-base-content py-2 text-sm font-medium text-base-100 transition-colors hover:bg-base-content/90"
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
            <div class="animate-slideDown mt-4 border-t border-red-300 pt-4">
              <div class="rounded-lg bg-red-50 p-4" on:click|stopPropagation>
                <div class="mb-3 flex items-center gap-2">
                  <AlertTriangle class="h-5 w-5 text-red-500" />
                  <h4 class="font-semibold text-red-700">Delete Operation</h4>
                </div>
                <p class="mb-3 text-sm text-red-600">
                  Are you sure you want to delete "{$selectedOperationStore.name}"?
                  This action cannot be undone.
                </p>
                <div class="flex gap-2">
                  <button
                    class="flex-1 rounded bg-gray-200 py-2 text-sm font-medium transition-colors hover:bg-gray-300"
                    on:click={() => closeAllOperationMenus()}
                  >
                    Cancel
                  </button>
                  <button
                    class="flex-1 rounded bg-red-500 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
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
      </div>
    {:else if activeTab === "map"}
      <!-- Map Tab -->
      <div class="space-y-6">
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
                <div>
                  <label class="mb-1 block text-sm text-contrast-content/60"
                    >Map ID (Generated)</label
                  >
                  <code
                    class="block rounded-lg border border-base-300 bg-base-100 p-3 font-mono text-xs text-contrast-content/80"
                  >
                    {generatedMapId}
                  </code>
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
                    >Map ID</label
                  >
                  <input
                    type="text"
                    bind:value={enteredMapId}
                    placeholder="Enter Map ID"
                    class="w-full rounded-lg border border-base-300 bg-base-100 p-3 text-sm text-contrast-content outline-none transition-colors focus:border-base-content"
                  />
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

                <div class="flex gap-2">
                  <button
                    class="flex-1 rounded-lg border border-base-300 bg-base-100 py-2 text-sm font-medium text-contrast-content transition-colors hover:bg-base-300"
                    on:click={() => {
                      showJoinForm = false
                      enteredMapId = ""
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    class="flex-1 rounded-lg bg-base-content py-2 text-sm font-medium text-base-100 transition-colors hover:bg-base-content/90 disabled:cursor-not-allowed disabled:opacity-50"
                    on:click={() => connectToMap(enteredMapId)}
                    disabled={isLoading || !enteredMapId.trim()}
                  >
                    {isLoading && loadingAction === `connect-${enteredMapId}`
                      ? "Connecting..."
                      : "Join Map"}
                  </button>
                </div>
              </div>
            </div>
          {/if}
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

            <!-- Map Actions in Line Format -->
            <div class="space-y-3">
              <!-- Create New Map Button -->
              <div class="rounded-lg bg-base-200 p-4 transition-colors">
                <button
                  class="flex w-full items-center justify-between text-left"
                  on:click={() => (showCreateForm = !showCreateForm)}
                >
                  <div class="flex items-center gap-3">
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
                  </div>
                  <div class="flex items-center">
                    {#if showCreateForm}
                      <ChevronUp class="h-4 w-4 text-contrast-content/60" />
                    {:else}
                      <ChevronDown class="h-4 w-4 text-contrast-content/60" />
                    {/if}
                  </div>
                </button>

                <!-- Expandable Create Map Form -->
                {#if showCreateForm}
                  <div
                    class="animate-slideDown mt-4 border-t border-base-300 pt-4"
                  >
                    <div class="space-y-4">
                      <div>
                        <label
                          class="mb-1 block text-sm text-contrast-content/60"
                          >Map Name</label
                        >
                        <input
                          type="text"
                          bind:value={newMapName}
                          placeholder="e.g. North Field Operations"
                          class="w-full rounded-lg border border-base-300 bg-base-100 p-3 text-sm text-contrast-content outline-none transition-colors focus:border-base-content"
                        />
                      </div>
                      <div>
                        <label
                          class="mb-1 block text-sm text-contrast-content/60"
                          >Map ID (Generated)</label
                        >
                        <code
                          class="block rounded-lg border border-base-300 bg-base-100 p-3 font-mono text-xs text-contrast-content/80"
                        >
                          {generatedMapId}
                        </code>
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
              </div>

              <!-- Switch Map Button -->
              <div class="rounded-lg bg-base-200 p-4 transition-colors">
                <button
                  class="flex w-full items-center justify-between text-left"
                  on:click={() => (showJoinForm = !showJoinForm)}
                >
                  <div class="flex items-center gap-3">
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
                  </div>
                  <div class="flex items-center">
                    {#if showJoinForm}
                      <ChevronUp class="h-4 w-4 text-contrast-content/60" />
                    {:else}
                      <ChevronDown class="h-4 w-4 text-contrast-content/60" />
                    {/if}
                  </div>
                </button>

                <!-- Expandable Join Map Form -->
                {#if showJoinForm}
                  <div
                    class="animate-slideDown mt-4 border-t border-base-300 pt-4"
                  >
                    <div class="space-y-4">
                      <div>
                        <label
                          class="mb-1 block text-sm text-contrast-content/60"
                          >Map ID</label
                        >
                        <input
                          type="text"
                          bind:value={enteredMapId}
                          placeholder="Enter Map ID"
                          class="w-full rounded-lg border border-base-300 bg-base-100 p-3 text-sm text-contrast-content outline-none transition-colors focus:border-base-content"
                        />
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
                                      <div
                                        class="text-sm text-contrast-content/60"
                                      >
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
                                      <div
                                        class="text-sm text-contrast-content/60"
                                      >
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

                      <div class="flex gap-2">
                        <button
                          class="flex-1 rounded-lg border border-base-300 bg-base-100 py-2 text-sm font-medium text-contrast-content transition-colors hover:bg-base-300"
                          on:click={() => {
                            showJoinForm = false
                            enteredMapId = ""
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          class="flex-1 rounded-lg bg-base-content py-2 text-sm font-medium text-base-100 transition-colors hover:bg-base-content/90 disabled:cursor-not-allowed disabled:opacity-50"
                          on:click={() => connectToMap(enteredMapId)}
                          disabled={isLoading || !enteredMapId.trim()}
                        >
                          {isLoading &&
                          loadingAction === `connect-${enteredMapId}`
                            ? "Connecting..."
                            : "Switch Map"}
                        </button>
                      </div>
                    </div>
                  </div>
                {/if}
              </div>

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

                  <!-- Expandable Delete Confirmation -->
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
                            Type the first 8 characters of the Map ID to
                            confirm:
                          </label>
                          <code
                            class="mb-2 block font-mono text-xs text-red-500"
                          >
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
    {:else if activeTab === "operations" && isConnected}
      <!-- Operations Tab -->
      <div class="space-y-6">
        {#if $operationStore && $operationStore.length > 0}
          <!-- Operations List -->
          <div class="space-y-1">
            <div class="mb-3 flex items-center justify-between">
              <h3 class="font-semibold text-contrast-content">Operations</h3>
              <button
                class="flex items-center gap-2 rounded-lg bg-base-content px-3 py-1.5 text-sm font-medium text-base-100 transition-colors hover:bg-base-content/90"
                on:click={() => {
                  closeAllOperationMenus()
                  showCreateOperation = true
                }}
              >
                <Plus class="h-3 w-3" />
                Create
              </button>
            </div>

            <!-- Create Operation Form - Appears at top after header -->
            {#if showCreateOperation}
              <div
                class="animate-slideDown bg-base-50 mb-4 rounded-lg border border-base-300 p-4"
              >
                <h4 class="mb-4 font-semibold text-contrast-content">
                  Create Operation
                </h4>
                <div class="space-y-3">
                  <div>
                    <label class="mb-1 block text-sm text-contrast-content/60"
                      >Name</label
                    >
                    <input
                      type="text"
                      bind:value={newOperationName}
                      placeholder="Operation name"
                      class="w-full rounded-lg border border-base-300 bg-base-100 p-2.5 text-sm text-contrast-content outline-none transition-colors focus:border-base-content"
                    />
                  </div>
                  <div>
                    <label class="mb-1 block text-sm text-contrast-content/60"
                      >Year</label
                    >
                    <select
                      bind:value={newOperationYear}
                      class="w-full rounded-lg border border-base-300 bg-base-100 p-2.5 text-sm text-contrast-content outline-none transition-colors focus:border-base-content"
                    >
                      {#each yearOptions as year}
                        <option value={year}>{year}</option>
                      {/each}
                    </select>
                  </div>
                  <div>
                    <label class="mb-1 block text-sm text-contrast-content/60"
                      >Description</label
                    >
                    <textarea
                      bind:value={newOperationDescription}
                      placeholder="Optional description"
                      rows="2"
                      class="w-full resize-none rounded-lg border border-base-300 bg-base-100 p-2.5 text-sm text-contrast-content outline-none transition-colors focus:border-base-content"
                    ></textarea>
                  </div>
                  <div class="flex gap-2">
                    <button
                      class="flex-1 rounded-lg border border-base-300 bg-base-100 py-2 text-sm font-medium text-contrast-content transition-colors hover:bg-base-300"
                      on:click={() => {
                        closeAllOperationMenus()
                        newOperationName = ""
                        newOperationDescription = ""
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      class="flex-1 rounded-lg bg-base-content py-2 text-sm font-medium text-base-100 transition-colors hover:bg-base-content/90 disabled:cursor-not-allowed disabled:opacity-50"
                      on:click={handleCreateOperation}
                      disabled={isLoading || !newOperationName.trim()}
                    >
                      {isLoading ? "Creating..." : "Create"}
                    </button>
                  </div>
                </div>
              </div>
            {/if}

            {#each $operationStore as operation, index}
              <div class="relative rounded-lg bg-base-200 transition-colors">
                <!-- Operation Row - One Line -->
                <button
                  class="flex w-full items-center justify-between p-3 text-left transition-colors hover:bg-base-300"
                  on:click={() => {
                    if (
                      showEditOperation &&
                      editingOperationId === operation.id
                    ) {
                      closeAllOperationMenus()
                    } else if (
                      showDeleteOperationConfirm &&
                      deletingOperationId === operation.id
                    ) {
                      closeAllOperationMenus()
                    } else if (expandedOperationId === operation.id) {
                      closeAllOperationMenus()
                    } else {
                      closeAllOperationMenus()
                      expandedOperationId = operation.id
                      if (operation.id !== $selectedOperationStore?.id) {
                        handleOperationSelect(operation.id)
                      }
                    }
                  }}
                >
                  <div class="flex min-w-0 flex-1 items-center gap-3">
                    <div
                      class="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full {operation.id ===
                      $selectedOperationStore?.id
                        ? 'bg-primary/20'
                        : 'bg-base-300'}"
                    >
                      {#if operation.id === $selectedOperationStore?.id}
                        <div class="h-2 w-2 rounded-full bg-primary"></div>
                      {:else}
                        <MapPin class="h-3 w-3 text-contrast-content/60" />
                      {/if}
                    </div>
                    <div class="min-w-0 flex-1">
                      <span class="truncate font-medium text-contrast-content">
                        {operation.name}
                      </span>
                      <span class="ml-2 text-sm text-contrast-content/60">
                        ({operation.year})
                      </span>
                    </div>
                  </div>

                  <div class="flex flex-shrink-0 items-center gap-2">
                    {#if operation.id === $selectedOperationStore?.id}
                      <span
                        class="rounded bg-primary/20 px-2 py-0.5 text-xs text-primary"
                      >
                        Active
                      </span>
                    {/if}
                    {#if expandedOperationId === operation.id}
                      <ChevronUp class="h-4 w-4 text-contrast-content/60" />
                    {:else}
                      <ChevronDown class="h-4 w-4 text-contrast-content/60" />
                    {/if}
                  </div>
                </button>

                <!-- Expanded Operation Details -->
                {#if expandedOperationId === operation.id}
                  <div class="animate-slideDown border-t border-base-300 p-3">
                    <div class="space-y-3" on:click|stopPropagation>
                      <!-- Description -->
                      {#if operation.description}
                        <div>
                          <p class="text-sm text-contrast-content/60">
                            {operation.description}
                          </p>
                        </div>
                      {:else}
                        <div>
                          <p class="text-sm italic text-contrast-content/40">
                            No description
                          </p>
                        </div>
                      {/if}

                      <!-- Action Buttons -->
                      <div class="flex gap-2">
                        <button
                          class="flex items-center gap-2 rounded-lg bg-base-100 px-3 py-1.5 text-sm font-medium text-contrast-content transition-colors hover:bg-base-300"
                          on:click|stopPropagation={() => {
                            closeAllOperationMenus()
                            editingOperationId = operation.id
                            editOperationName = operation.name
                            editOperationYear = operation.year
                            editOperationDescription =
                              operation.description || ""
                            showEditOperation = true
                          }}
                        >
                          <Pencil class="h-3 w-3" />
                          Edit
                        </button>

                        {#if !isOnlyOperation}
                          <button
                            class="flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-500/20"
                            on:click|stopPropagation={() => {
                              closeAllOperationMenus()
                              deletingOperationId = operation.id
                              showDeleteOperationConfirm = true
                            }}
                          >
                            <Trash2 class="h-3 w-3" />
                            Delete
                          </button>
                        {/if}
                      </div>
                    </div>
                  </div>
                {/if}

                <!-- Inline Edit Form -->
                {#if showEditOperation && editingOperationId === operation.id}
                  <div class="animate-slideDown border-t border-base-300 p-3">
                    <div class="space-y-3" on:click|stopPropagation>
                      <h4 class="font-semibold text-contrast-content">
                        Edit Operation
                      </h4>
                      <div>
                        <label
                          class="mb-1 block text-sm text-contrast-content/60"
                          >Name</label
                        >
                        <input
                          type="text"
                          bind:value={editOperationName}
                          class="w-full rounded-lg border border-base-300 bg-base-100 p-2.5 text-sm text-contrast-content outline-none transition-colors focus:border-base-content"
                        />
                      </div>
                      <div>
                        <label
                          class="mb-1 block text-sm text-contrast-content/60"
                          >Year</label
                        >
                        <select
                          bind:value={editOperationYear}
                          class="w-full rounded-lg border border-base-300 bg-base-100 p-2.5 text-sm text-contrast-content outline-none transition-colors focus:border-base-content"
                        >
                          {#each yearOptions as year}
                            <option value={year}>{year}</option>
                          {/each}
                        </select>
                      </div>
                      <div>
                        <label
                          class="mb-1 block text-sm text-contrast-content/60"
                          >Description</label
                        >
                        <textarea
                          bind:value={editOperationDescription}
                          rows="2"
                          class="w-full resize-none rounded-lg border border-base-300 bg-base-100 p-2.5 text-sm text-contrast-content outline-none transition-colors focus:border-base-content"
                        ></textarea>
                      </div>
                      <div class="flex gap-2">
                        <button
                          class="flex-1 rounded-lg border border-base-300 bg-base-100 py-2 text-sm font-medium text-contrast-content transition-colors hover:bg-base-300"
                          on:click={() => closeAllOperationMenus()}
                        >
                          Cancel
                        </button>
                        <button
                          class="flex-1 rounded-lg bg-base-content py-2 text-sm font-medium text-base-100 transition-colors hover:bg-base-content/90"
                          on:click={handleUpdateOperation}
                          disabled={isLoading}
                        >
                          {isLoading ? "Saving..." : "Save"}
                        </button>
                      </div>
                    </div>
                  </div>
                {/if}

                <!-- Inline Delete Confirmation -->
                {#if showDeleteOperationConfirm && deletingOperationId === operation.id}
                  <div class="animate-slideDown border-t border-red-300 p-3">
                    <div
                      class="rounded-lg bg-red-50 p-3"
                      on:click|stopPropagation
                    >
                      <div class="mb-3 flex items-center gap-2">
                        <AlertTriangle class="h-4 w-4 text-red-500" />
                        <h4 class="text-sm font-semibold text-red-700">
                          Delete Operation
                        </h4>
                      </div>
                      <p class="mb-3 text-sm text-red-600">
                        Are you sure you want to delete "{operation.name}"? This
                        action cannot be undone.
                      </p>
                      <div class="flex gap-2">
                        <button
                          class="flex-1 rounded bg-gray-200 py-1.5 text-sm font-medium transition-colors hover:bg-gray-300"
                          on:click={() => closeAllOperationMenus()}
                        >
                          Cancel
                        </button>
                        <button
                          class="flex-1 rounded bg-red-500 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                          on:click={() => handleDeleteOperation(operation.id)}
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
            {/each}
          </div>
        {:else}
          <!-- No Operations -->
          <div class="text-center">
            <div
              class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-purple-500/10"
            >
              <MapPin class="h-8 w-8 text-purple-500" />
            </div>
            <h3 class="mb-2 text-lg font-semibold text-contrast-content">
              No Operations
            </h3>
            <p class="mb-4 text-sm text-contrast-content/60">
              Create your first operation to get started
            </p>
            <button
              class="mx-auto flex items-center gap-2 rounded-lg bg-base-content px-4 py-2 font-medium text-base-100 transition-colors hover:bg-base-content/90"
              on:click={() => (showCreateOperation = true)}
            >
              <Plus class="h-4 w-4" />
              Create Operation
            </button>
          </div>
        {/if}
      </div>
    {:else if activeTab === "objects" && isConnected}
      <!-- Map Objects Tab -->
      <div class="space-y-6">
        <!-- Sub-navigation -->
        <div class="flex gap-2 border-b border-base-300">
          <button
            class="flex items-center gap-2 border-b-2 px-3 pb-2 text-sm font-medium transition-colors {mapObjectsView ===
            'vehicles'
              ? 'border-primary text-primary'
              : 'border-transparent text-contrast-content/60 hover:text-contrast-content'}"
            on:click={() => (mapObjectsView = "vehicles")}
          >
            <div
              class="flex h-5 w-5 items-center justify-center rounded-full {mapObjectsView ===
              'vehicles'
                ? 'bg-primary/20'
                : 'bg-base-300'}"
            >
              <Car
                class="h-3 w-3 {mapObjectsView === 'vehicles'
                  ? 'text-primary'
                  : 'text-contrast-content/60'}"
              />
            </div>
            Vehicles
          </button>
          <button
            class="flex items-center gap-2 border-b-2 px-3 pb-2 text-sm font-medium transition-colors {mapObjectsView ===
            'pins'
              ? 'border-primary text-primary'
              : 'border-transparent text-contrast-content/60 hover:text-contrast-content'}"
            on:click={() => (mapObjectsView = "pins")}
          >
            <div
              class="flex h-5 w-5 items-center justify-center rounded-full {mapObjectsView ===
              'pins'
                ? 'bg-primary/20'
                : 'bg-base-300'}"
            >
              <MapPin
                class="h-3 w-3 {mapObjectsView === 'pins'
                  ? 'text-primary'
                  : 'text-contrast-content/60'}"
              />
            </div>
            Pins
          </button>
          <button
            class="flex items-center gap-2 border-b-2 px-3 pb-2 text-sm font-medium transition-colors {mapObjectsView ===
            'trails'
              ? 'border-primary text-primary'
              : 'border-transparent text-contrast-content/60 hover:text-contrast-content'}"
            on:click={() => (mapObjectsView = "trails")}
          >
            <div
              class="flex h-5 w-5 items-center justify-center rounded-full {mapObjectsView ===
              'trails'
                ? 'bg-primary/20'
                : 'bg-base-300'}"
            >
              <Route
                class="h-3 w-3 {mapObjectsView === 'trails'
                  ? 'text-primary'
                  : 'text-contrast-content/60'}"
              />
            </div>
            Trails
          </button>
        </div>

        <!-- Content based on selected sub-menu -->
        {#if mapObjectsView === "vehicles"}
          <div class="text-center">
            <div
              class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange-500/10"
            >
              <Car class="h-8 w-8 text-orange-500" />
            </div>
            <h3 class="mb-2 text-lg font-semibold text-contrast-content">
              Vehicles
            </h3>
            <p class="text-sm text-contrast-content/60">
              Vehicle management coming soon
            </p>
          </div>
        {:else if mapObjectsView === "pins"}
          <div class="text-center">
            <div
              class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange-500/10"
            >
              <MapPin class="h-8 w-8 text-orange-500" />
            </div>
            <h3 class="mb-2 text-lg font-semibold text-contrast-content">
              Map Pins
            </h3>
            <p class="text-sm text-contrast-content/60">
              Pin management coming soon
            </p>
          </div>
        {:else if mapObjectsView === "trails"}
          <div class="text-center">
            <div
              class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange-500/10"
            >
              <Route class="h-8 w-8 text-orange-500" />
            </div>
            <h3 class="mb-2 text-lg font-semibold text-contrast-content">
              Trails
            </h3>
            <p class="text-sm text-contrast-content/60">
              Trail management coming soon
            </p>
          </div>
        {/if}

        <!-- Operations List in Map Objects -->
        <div class="rounded-lg bg-base-200 p-4">
          <h4 class="mb-3 text-sm font-medium text-contrast-content">
            Available Operations
          </h4>
          <div class="space-y-2">
            {#each $operationStore as operation}
              <div
                class="flex items-center justify-between rounded bg-base-100 p-2 text-sm {operation.id ===
                $selectedOperationStore?.id
                  ? 'ring-1 ring-primary'
                  : ''}"
              >
                <span class="text-contrast-content"
                  >{operation.name} ({operation.year})</span
                >
                {#if operation.id === $selectedOperationStore?.id}
                  <span
                    class="rounded bg-primary/20 px-2 py-0.5 text-xs text-primary"
                    >Active</span
                  >
                {/if}
              </div>
            {/each}
          </div>
        </div>
      </div>
    {/if}
  </div>
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
