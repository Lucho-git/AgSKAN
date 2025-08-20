<script>
  import { onMount } from "svelte"
  import { connectedMapStore } from "$lib/stores/connectedMapStore"
  import { mapActivityStore } from "$lib/stores/mapActivityStore"
  import { profileStore } from "$lib/stores/profileStore"
  import {
    operationStore,
    selectedOperationStore,
  } from "$lib/stores/operationStore"
  import { toast } from "svelte-sonner"
  import { mapApi } from "$lib/api/mapApi"
  import { operationApi } from "$lib/api/operationApi"
  import {
    Map,
    Plus,
    Globe,
    MapPin,
    Navigation,
    Car,
    Route,
    ChevronDown,
    ChevronUp,
    MoreVertical,
    Copy,
    Link,
    Link2,
    LogOut,
    Clock,
    User,
    Pencil,
    Trash2,
  } from "lucide-svelte"

  import MapManagementTab from "./MapManagementTab.svelte"
  import OperationsTab from "./OperationsTab.svelte"
  import ObjectsTab from "./ObjectsTab.svelte"

  // ========================================
  // TAB MANAGEMENT
  // ========================================
  let activeTab = "dashboard"
  let isLoading = false
  let loadingAction = null

  // Reactive values
  $: isConnected = $connectedMapStore?.id
  $: isOwner = $connectedMapStore?.is_owner

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
  let newOperationName = ""
  let newOperationYear = new Date().getFullYear()
  let newOperationDescription = ""
  let editOperationName = ""
  let editOperationYear = new Date().getFullYear()
  let editOperationDescription = ""

  // Reactive values for dashboard
  $: currentYear = new Date().getFullYear()
  $: yearOptions = Array.from({ length: 10 }, (_, i) => currentYear - 5 + i)
  $: isOnlyOperation = $operationStore.length <= 1
  $: isMapMenuOpen =
    showMapOptions ||
    showLaunchMapConfirm ||
    showSwitchMapConfirm ||
    showLeaveMapConfirm
  $: isOperationMenuOpen =
    showOperationOptions ||
    showCreateOperation ||
    showEditOperation ||
    showDeleteOperationConfirm

  // Helper function to close all dashboard menus
  function closeAllDashboardMenus() {
    showMapOptions = false
    showLaunchMapConfirm = false
    showSwitchMapConfirm = false
    showLeaveMapConfirm = false
    showOperationOptions = false
    showCreateOperation = false
    showEditOperation = false
    showDeleteOperationConfirm = false
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

  function handleMapOptionsClick() {
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

  function handleLaunchMap() {
    window.location.href = "/account/mapviewer"
    showLaunchMapConfirm = false
  }

  function copyMapId() {
    if ($connectedMapStore?.id) {
      navigator.clipboard.writeText($connectedMapStore.id)
      closeAllDashboardMenus()
      toast.success("Map ID copied")
    }
  }

  function copyMapLink() {
    if ($connectedMapStore?.id) {
      const shareUrl = `https://www.skanfarming.com.au/login?map_id=${$connectedMapStore.id}`
      navigator.clipboard.writeText(shareUrl)
      closeAllDashboardMenus()
      toast.success("Map link copied")
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
        closeAllDashboardMenus()
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

  function handleOperationOptionsClick() {
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

        toast.success("Operation switched successfully")
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

        showDeleteOperationConfirm = false
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
      <!-- Dashboard Tab Content -->
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
                    on:click={() => closeAllDashboardMenus()}
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

                <div class="flex gap-2">
                  <button
                    class="flex-1 rounded-lg border border-base-300 bg-base-100 py-2 text-sm font-medium text-contrast-content transition-colors hover:bg-base-300"
                    on:click={() => {
                      closeAllDashboardMenus()
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
                    on:click={() => closeAllDashboardMenus()}
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
                      closeAllDashboardMenus()
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
                    on:click={() => closeAllDashboardMenus()}
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
                    on:click={() => closeAllDashboardMenus()}
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
      <MapManagementTab bind:activeTab />
    {:else if activeTab === "operations" && isConnected}
      <OperationsTab />
    {:else if activeTab === "objects" && isConnected}
      <ObjectsTab />
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
