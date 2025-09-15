<script lang="ts">
  import { onMount } from "svelte"
  import {
    operationStore,
    selectedOperationStore,
  } from "$lib/stores/operationStore"
  import { connectedMapStore } from "$lib/stores/connectedMapStore"
  import { mapActivityStore } from "$lib/stores/mapActivityStore"
  import { trailsMetaDataStore } from "$lib/stores/trailsMetaDataStore"
  import { DateTime } from "luxon"
  import {
    Car,
    MapPin,
    Route,
    Search,
    SortAsc,
    SortDesc,
    Trash2,
    X,
    Calendar,
    RefreshCw,
    Clock,
    Activity,
    BarChart3,
  } from "lucide-svelte"
  import {
    getPinsFromMapId,
    deletePins,
    type MapMarker,
  } from "$lib/utils/pinsFromMapId"
  import IconSVG from "../../../../components/IconSVG.svelte"

  // Map Objects sub-menu
  let mapObjectsView = "vehicles"

  // Pin management state
  let loading = false
  let error = null
  let markers: MapMarker[] = []
  let searchQuery = ""
  let sortDirection: "asc" | "desc" = "desc"
  let selectedPins = new Set<number>()
  let hasLoadedOnce = false

  // Trail management state
  let trailSearchQuery = ""
  let trailSortDirection: "asc" | "desc" = "desc"
  let selectedOperation = "all"

  // Custom dropdown state
  let showOperationDropdown = false
  let operationDropdownRef = null

  // Pagination variables
  let itemsPerPage = 20
  let currentPage = 1

  // Trail pagination variables
  let trailItemsPerPage = 15
  let trailCurrentPage = 1

  // Computed variables for pins
  $: filteredMarkers = markers
    .filter((marker) =>
      marker.marker_data.properties.icon
        .toLowerCase()
        .includes(searchQuery.toLowerCase()),
    )
    .sort((a, b) => {
      const dateA = new Date(a.updated_at).getTime()
      const dateB = new Date(b.updated_at).getTime()
      return sortDirection === "asc" ? dateA - dateB : dateB - dateA
    })

  $: paginatedMarkers = filteredMarkers.slice(0, currentPage * itemsPerPage)
  $: hasMorePages = filteredMarkers.length > currentPage * itemsPerPage

  // Computed trail counts per operation
  $: trailCountsByOperation = $trailsMetaDataStore.reduce((counts, trail) => {
    const operationId = trail.operation_id
    if (operationId) {
      counts[operationId] = (counts[operationId] || 0) + 1
    }
    return counts
  }, {})

  // Helper function to get trail count for an operation
  function getTrailCountForOperation(operationId: string): number {
    return trailCountsByOperation[operationId] || 0
  }

  // Get selected operation name for display
  $: selectedOperationName =
    selectedOperation === "all"
      ? "All Operations"
      : $operationStore.find((op) => op.id === selectedOperation)?.name +
          " (" +
          $operationStore.find((op) => op.id === selectedOperation)?.year +
          ")" || "Unknown Operation"

  // Function to select an operation
  function selectOperation(operationId: string) {
    selectedOperation = operationId
    showOperationDropdown = false
    trailCurrentPage = 1
  }

  // Click outside to close dropdown
  function handleClickOutside(event) {
    if (operationDropdownRef && !operationDropdownRef.contains(event.target)) {
      showOperationDropdown = false
    }
  }

  // Computed variables for trails
  $: filteredTrails = $trailsMetaDataStore
    .filter((trail) => {
      const matchesSearch =
        trail.operation_name
          ?.toLowerCase()
          .includes(trailSearchQuery.toLowerCase()) || false
      const matchesOperation =
        selectedOperation === "all" || trail.operation_id === selectedOperation
      return matchesSearch && matchesOperation
    })
    .sort((a, b) => {
      const dateA = new Date(a.start_time).getTime()
      const dateB = new Date(b.start_time).getTime()
      return trailSortDirection === "asc" ? dateA - dateB : dateB - dateA
    })

  $: paginatedTrails = filteredTrails.slice(
    0,
    trailCurrentPage * trailItemsPerPage,
  )
  $: hasMoreTrailPages =
    filteredTrails.length > trailCurrentPage * trailItemsPerPage

  // Counts for tabs (using real data from stores)
  $: vehicleCount = $mapActivityStore?.vehicle_states?.length || 0
  $: pinCount = $mapActivityStore?.marker_count || 0
  $: trailCount = $trailsMetaDataStore?.length || 0

  // Helper functions for trails
  function formatHectares(hectares: number | null): string {
    if (!hectares) return "N/A"
    if (hectares >= 1000) {
      return (hectares / 1000).toFixed(1) + "K ha"
    } else if (hectares >= 100) {
      return Math.round(hectares) + " ha"
    } else if (hectares >= 10) {
      return hectares.toFixed(1) + " ha"
    } else {
      return hectares.toFixed(2) + " ha"
    }
  }

  function formatDistance(distance: number | null): string {
    if (!distance) return "N/A"
    if (distance >= 1000) {
      return (distance / 1000).toFixed(1) + " km"
    } else {
      return Math.round(distance) + " m"
    }
  }

  function formatPercentage(percentage: number | null): string {
    if (!percentage) return "N/A"
    return percentage.toFixed(1) + "%"
  }

  function formatTrailDate(dateString: string): string {
    return DateTime.fromISO(dateString).toFormat("MMM dd, HH:mm")
  }

  function formatTrailDateMobile(dateString: string): string {
    return DateTime.fromISO(dateString).toFormat("MM/dd HH:mm")
  }

  function getTrailDuration(startTime: string, endTime: string | null): string {
    if (!endTime) return "Active"

    const start = DateTime.fromISO(startTime)
    const end = DateTime.fromISO(endTime)
    const duration = end.diff(start, ["hours", "minutes"])

    if (duration.hours > 0) {
      return `${Math.floor(duration.hours)}h ${Math.floor(duration.minutes)}m`
    } else {
      return `${Math.floor(duration.minutes)}m`
    }
  }

  function getTrailDurationMobile(
    startTime: string,
    endTime: string | null,
  ): string {
    if (!endTime) return "Active"

    const start = DateTime.fromISO(startTime)
    const end = DateTime.fromISO(endTime)
    const duration = end.diff(start, ["hours", "minutes"])

    if (duration.hours > 0) {
      return `${Math.floor(duration.hours)}h${Math.floor(duration.minutes)}m`
    } else {
      return `${Math.floor(duration.minutes)}m`
    }
  }

  function toggleTrailSort() {
    trailSortDirection = trailSortDirection === "asc" ? "desc" : "asc"
    trailCurrentPage = 1
  }

  function loadMoreTrails() {
    if (hasMoreTrailPages) {
      trailCurrentPage++
    }
  }

  // Icon processing functions
  function getMarkerIcon(iconName: string) {
    const cleanIconName = iconName.replace("custom-svg-", "")

    if (iconName.startsWith("custom-svg-")) {
      return { type: "svg", name: cleanIconName }
    } else if (iconName.startsWith("ionic-")) {
      return { type: "ionic", name: iconName.replace("ionic-", "") }
    } else {
      return { type: "default", name: "📍" }
    }
  }

  // Updated bubble colors for better mobile contrast
  const pinColorMap = {
    access: "rgba(219, 234, 254, 0.7)", // Light blue
    entrance: "rgba(219, 234, 254, 0.7)",
    equipment: "rgba(220, 252, 231, 0.7)", // Light green
    machinery: "rgba(220, 252, 231, 0.7)",
    sample: "rgba(254, 243, 199, 0.7)", // Light amber
    soil: "rgba(254, 243, 199, 0.7)",
    issue: "rgba(254, 226, 226, 0.7)", // Light red
    problem: "rgba(254, 226, 226, 0.7)",
    storage: "rgba(237, 233, 254, 0.7)", // Light purple
    barn: "rgba(237, 233, 254, 0.7)",
    default: "rgba(243, 244, 246, 0.7)", // Light gray
  }

  const iconColorMap = {
    access: "rgba(0, 0, 0, 0.8)", // Black for mobile contrast
    entrance: "rgba(0, 0, 0, 0.8)",
    equipment: "rgba(0, 0, 0, 0.8)",
    machinery: "rgba(0, 0, 0, 0.8)",
    sample: "rgba(0, 0, 0, 0.8)",
    soil: "rgba(0, 0, 0, 0.8)",
    issue: "rgba(0, 0, 0, 0.8)",
    problem: "rgba(0, 0, 0, 0.8)",
    storage: "rgba(0, 0, 0, 0.8)",
    barn: "rgba(0, 0, 0, 0.8)",
    default: "rgba(0, 0, 0, 0.8)",
  }

  function getPinColor(iconName: string) {
    const key = Object.keys(pinColorMap).find((k) => iconName.includes(k))
    return pinColorMap[key] || pinColorMap.default
  }

  function getIconColor(iconName: string) {
    const key = Object.keys(iconColorMap).find((k) => iconName.includes(k))
    return iconColorMap[key] || iconColorMap.default
  }

  // Pin management functions
  async function loadPins() {
    if (!$connectedMapStore?.id) return

    loading = true
    error = null

    try {
      const { data, error: pinError } = await getPinsFromMapId(
        $connectedMapStore.id,
      )

      if (pinError) {
        error = pinError
        return
      }

      markers = data || []
      hasLoadedOnce = true
      currentPage = 1
    } catch (err) {
      error = err
    } finally {
      loading = false
    }
  }

  async function handleBulkDelete() {
    if (selectedPins.size === 0) return

    try {
      const pinIdsToDelete = Array.from(selectedPins)
      const deleteError = await deletePins(pinIdsToDelete)

      if (deleteError) {
        console.error("Error deleting pins:", deleteError)
        return
      }

      await loadPins()
      clearSelection()
    } catch (err) {
      console.error("Error in handleBulkDelete:", err)
    }
  }

  function togglePin(id: number) {
    if (selectedPins.has(id)) {
      selectedPins.delete(id)
    } else {
      selectedPins.add(id)
    }
    selectedPins = selectedPins
  }

  function clearSelection() {
    selectedPins.clear()
    selectedPins = selectedPins
  }

  function toggleSort() {
    sortDirection = sortDirection === "asc" ? "desc" : "asc"
    currentPage = 1
  }

  function loadMore() {
    if (hasMorePages) {
      currentPage++
    }
  }

  function formatDate(dateString: string) {
    return DateTime.fromISO(dateString).toRelative()
  }

  // Load pins when switching to pins tab
  $: if (
    mapObjectsView === "pins" &&
    !hasLoadedOnce &&
    $connectedMapStore?.id
  ) {
    loadPins()
  }

  // Reset search when changing tabs
  $: if (mapObjectsView !== "pins") {
    searchQuery = ""
    clearSelection()
  }

  // Reset trail search when changing tabs
  $: if (mapObjectsView !== "trails") {
    trailSearchQuery = ""
    selectedOperation = "all"
    trailCurrentPage = 1
  }

  onMount(() => {
    document.addEventListener("click", handleClickOutside)
    return () => {
      document.removeEventListener("click", handleClickOutside)
    }
  })
</script>

<!-- Main container with mobile-first design -->
<div
  class="flex h-full max-h-[67vh] flex-col space-y-3 overflow-hidden sm:space-y-4"
>
  <!-- Sub-navigation with mobile-first sizing -->
  <div class="grid flex-shrink-0 grid-cols-3 border-b border-base-300">
    <button
      class="flex flex-col items-center gap-1 border-b-2 px-2 py-2 text-xs font-medium transition-colors sm:px-3 sm:text-sm {mapObjectsView ===
      'vehicles'
        ? 'border-primary text-primary'
        : 'border-transparent text-contrast-content/60 hover:text-contrast-content'}"
      on:click={() => (mapObjectsView = "vehicles")}
    >
      <span
        class="rounded bg-base-300 px-1.5 py-0.5 text-xs font-semibold leading-none text-base-content sm:px-2 sm:py-1 sm:text-sm"
        >{vehicleCount}</span
      >
      <div class="flex items-center gap-1.5 sm:gap-2">
        <div
          class="flex h-4 w-4 items-center justify-center rounded-full sm:h-5 sm:w-5 {mapObjectsView ===
          'vehicles'
            ? 'bg-primary/20'
            : 'bg-base-300'}"
        >
          <Car
            class="h-2.5 w-2.5 sm:h-3 sm:w-3 {mapObjectsView === 'vehicles'
              ? 'text-primary'
              : 'text-contrast-content/60'}"
          />
        </div>
        <span class="hidden sm:inline">Vehicles</span>
        <span class="sm:hidden">Cars</span>
      </div>
    </button>

    <button
      class="flex flex-col items-center gap-1 border-b-2 px-2 py-2 text-xs font-medium transition-colors sm:px-3 sm:text-sm {mapObjectsView ===
      'pins'
        ? 'border-primary text-primary'
        : 'border-transparent text-contrast-content/60 hover:text-contrast-content'}"
      on:click={() => (mapObjectsView = "pins")}
    >
      <span
        class="rounded bg-base-300 px-1.5 py-0.5 text-xs font-semibold leading-none text-base-content sm:px-2 sm:py-1 sm:text-sm"
        >{pinCount}</span
      >
      <div class="flex items-center gap-1.5 sm:gap-2">
        <div
          class="flex h-4 w-4 items-center justify-center rounded-full sm:h-5 sm:w-5 {mapObjectsView ===
          'pins'
            ? 'bg-primary/20'
            : 'bg-base-300'}"
        >
          <MapPin
            class="h-2.5 w-2.5 sm:h-3 sm:w-3 {mapObjectsView === 'pins'
              ? 'text-primary'
              : 'text-contrast-content/60'}"
          />
        </div>
        <span>Pins</span>
      </div>
    </button>

    <button
      class="flex flex-col items-center gap-1 border-b-2 px-2 py-2 text-xs font-medium transition-colors sm:px-3 sm:text-sm {mapObjectsView ===
      'trails'
        ? 'border-primary text-primary'
        : 'border-transparent text-contrast-content/60 hover:text-contrast-content'}"
      on:click={() => (mapObjectsView = "trails")}
    >
      <span
        class="rounded bg-base-300 px-1.5 py-0.5 text-xs font-semibold leading-none text-base-content sm:px-2 sm:py-1 sm:text-sm"
        >{trailCount}</span
      >
      <div class="flex items-center gap-1.5 sm:gap-2">
        <div
          class="flex h-4 w-4 items-center justify-center rounded-full sm:h-5 sm:w-5 {mapObjectsView ===
          'trails'
            ? 'bg-primary/20'
            : 'bg-base-300'}"
        >
          <Route
            class="h-2.5 w-2.5 sm:h-3 sm:w-3 {mapObjectsView === 'trails'
              ? 'text-primary'
              : 'text-contrast-content/60'}"
          />
        </div>
        <span>Trails</span>
      </div>
    </button>
  </div>

  <!-- Content based on selected sub-menu -->
  {#if mapObjectsView === "vehicles"}
    <div class="flex-1 overflow-hidden">
      <div class="py-3 text-center sm:py-4">
        <div
          class="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-base-300 sm:mb-3 sm:h-12 sm:w-12"
        >
          <Car class="h-5 w-5 text-contrast-content/70 sm:h-6 sm:w-6" />
        </div>
        <h3
          class="mb-1 text-sm font-semibold text-contrast-content sm:text-base"
        >
          Vehicles
        </h3>
        <p class="text-xs text-contrast-content/60 sm:text-sm">
          Vehicle management coming soon
        </p>
      </div>
    </div>
  {:else if mapObjectsView === "pins"}
    <!-- Pin Management Section with mobile-first layout -->
    <div class="relative flex flex-1 flex-col overflow-hidden">
      <!-- Header and controls - mobile-first spacing -->
      <div class="flex-shrink-0 space-y-2 pb-2 sm:space-y-3 sm:pb-3">
        <!-- Header with refresh button -->
        <div class="flex items-center justify-between">
          <div>
            <h3
              class="text-sm font-semibold text-contrast-content sm:text-base"
            >
              Map Pins
            </h3>
            <p class="text-xs text-contrast-content/60 sm:text-sm">
              View and manage pins
            </p>
          </div>
          <button
            class="flex items-center gap-1.5 rounded-lg bg-base-200 px-2.5 py-1.5 text-xs font-medium text-contrast-content transition-colors hover:bg-base-300 sm:gap-2 sm:px-3 sm:py-2 sm:text-sm"
            on:click={loadPins}
            disabled={loading}
          >
            <RefreshCw
              class="h-3 w-3 sm:h-4 sm:w-4 {loading ? 'animate-spin' : ''}"
            />
            <span class="hidden sm:inline">Refresh</span>
          </button>
        </div>

        <!-- Search and filter section -->
        <div class="flex gap-2 sm:gap-3">
          <div class="relative flex-1">
            <div
              class="absolute left-2 top-1/2 -translate-y-1/2 text-contrast-content/60 sm:left-3"
            >
              <Search class="h-3 w-3 sm:h-4 sm:w-4" />
            </div>
            <input
              type="text"
              placeholder="Search pins..."
              bind:value={searchQuery}
              class="w-full rounded-lg border border-base-300 bg-base-200 py-1.5 pl-7 pr-3 text-xs text-contrast-content outline-none transition-colors focus:border-base-content sm:py-2 sm:pl-10 sm:pr-4 sm:text-sm"
            />
          </div>
          <button
            class="flex items-center gap-1.5 rounded-lg border border-base-300 bg-base-200 px-2.5 py-1.5 text-xs text-contrast-content transition-colors hover:bg-base-300 sm:gap-2 sm:px-3 sm:py-2 sm:text-sm"
            on:click={toggleSort}
          >
            {#if sortDirection === "asc"}
              <SortAsc class="h-3 w-3 sm:h-4 sm:w-4" />
            {:else}
              <SortDesc class="h-3 w-3 sm:h-4 sm:w-4" />
            {/if}
            <span class="hidden sm:inline">Date</span>
          </button>
        </div>

        <!-- Pins count -->
        <div>
          <p class="text-xs text-contrast-content/60 sm:text-sm">
            {filteredMarkers.length} pins found
          </p>
        </div>
      </div>

      <!-- Scrollable pins list -->
      <div
        class="flex-1 overflow-y-auto {selectedPins.size > 0
          ? 'pb-14 sm:pb-16'
          : ''}"
      >
        <div
          class="space-y-1.5 px-0.5 pr-1 pt-0.5 sm:space-y-2 sm:px-1 sm:pr-2 sm:pt-1"
        >
          {#if loading}
            <div
              class="flex items-center justify-center rounded-lg bg-base-200 py-6 sm:py-8"
            >
              <div class="flex items-center gap-2 sm:gap-3">
                <RefreshCw
                  class="h-4 w-4 animate-spin text-contrast-content/60 sm:h-5 sm:w-5"
                />
                <span class="text-xs text-contrast-content/60 sm:text-sm"
                  >Loading...</span
                >
              </div>
            </div>
          {:else if error}
            <div
              class="flex flex-col items-center justify-center rounded-lg bg-base-200 py-6 text-center sm:py-8"
            >
              <div class="mb-2 rounded-full bg-base-300 p-2 sm:mb-3 sm:p-3">
                <X class="h-4 w-4 text-red-500 sm:h-5 sm:w-5" />
              </div>
              <p class="mb-1 text-xs font-medium text-red-600 sm:text-sm">
                Failed to load
              </p>
              <p class="text-xs text-contrast-content/60 sm:text-sm">
                Try again
              </p>
            </div>
          {:else if filteredMarkers.length === 0}
            <div
              class="flex flex-col items-center justify-center rounded-lg bg-base-200 py-6 text-center sm:py-8"
            >
              <div class="mb-2 rounded-full bg-base-300 p-2 sm:mb-3 sm:p-3">
                <MapPin
                  class="h-4 w-4 text-contrast-content/60 sm:h-5 sm:w-5"
                />
              </div>
              <p
                class="mb-1 text-xs font-medium text-contrast-content sm:text-sm"
              >
                No pins found
              </p>
              <p class="text-xs text-contrast-content/60 sm:text-sm">
                Add pins to your map
              </p>
            </div>
          {:else}
            <div class="space-y-1.5 sm:space-y-2">
              {#each paginatedMarkers as marker (marker.id)}
                {@const pinColor = getPinColor(
                  marker.marker_data.properties.icon,
                )}
                {@const iconColor = getIconColor(
                  marker.marker_data.properties.icon,
                )}
                {@const isSelected = selectedPins.has(marker.id)}

                <!-- svelte-ignore a11y-click-events-have-key-events -->
                <!-- svelte-ignore a11y-no-static-element-interactions -->
                <div
                  class="flex cursor-pointer items-center gap-2.5 rounded-lg bg-base-200 p-2.5 transition-colors sm:gap-3 sm:p-3 {isSelected
                    ? 'ring-1 ring-primary ring-opacity-50'
                    : 'hover:bg-base-300'}"
                  on:click={() => togglePin(marker.id)}
                >
                  <!-- Icon -->
                  <div
                    class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full sm:h-9 sm:w-9"
                    style="background-color: {pinColor};"
                  >
                    {#if getMarkerIcon(marker.marker_data.properties.icon).type === "svg"}
                      <div style="color: {iconColor};">
                        <IconSVG
                          icon={getMarkerIcon(
                            marker.marker_data.properties.icon,
                          ).name}
                          size="16px"
                          class="sm:text-lg"
                        />
                      </div>
                    {:else if getMarkerIcon(marker.marker_data.properties.icon).type === "ionic"}
                      <ion-icon
                        name={getMarkerIcon(marker.marker_data.properties.icon)
                          .name}
                        style="font-size: 16px; color: {iconColor};"
                        class="sm:text-lg"
                      />
                    {:else}
                      <MapPin
                        size={16}
                        style="color: {iconColor};"
                        class="sm:size-5"
                      />
                    {/if}
                  </div>

                  <!-- Content -->
                  <div class="min-w-0 flex-1">
                    <h4
                      class="truncate text-xs font-medium text-contrast-content sm:text-sm"
                    >
                      {marker.marker_data.properties.icon}
                    </h4>
                    <div
                      class="mt-0.5 flex items-center gap-1 text-xs text-contrast-content/60 sm:mt-1"
                    >
                      <Calendar class="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                      {formatDate(marker.updated_at)}
                    </div>
                  </div>

                  <!-- Checkbox - Fixed width container -->
                  <div class="flex w-5 justify-end sm:w-6">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      class="checkbox-primary checkbox pointer-events-none h-4 w-4 sm:h-5 sm:w-5"
                      tabindex="-1"
                    />
                  </div>
                </div>
              {/each}

              {#if hasMorePages}
                <div class="flex justify-center pt-3 sm:pt-4">
                  <button
                    class="rounded-lg border border-base-300 bg-base-200 px-3 py-1.5 text-xs text-contrast-content transition-colors hover:bg-base-300 sm:px-4 sm:py-2 sm:text-sm"
                    on:click={loadMore}
                  >
                    Load More ({filteredMarkers.length -
                      paginatedMarkers.length})
                  </button>
                </div>
              {/if}
            </div>
          {/if}
        </div>
      </div>

      <!-- Container-bottom sticky menu for bulk actions -->
      {#if selectedPins.size > 0}
        <div
          class="absolute bottom-0 left-0 right-0 border-t border-base-300 bg-base-100 p-2.5 shadow-lg sm:p-3"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span
                class="text-xs font-medium text-contrast-content sm:text-sm"
              >
                {selectedPins.size} selected
              </span>
            </div>
            <div class="flex items-center gap-2 sm:gap-3">
              <button
                class="hover:bg-base-400 flex items-center gap-1.5 rounded-lg bg-base-300 px-2.5 py-1.5 text-xs text-contrast-content transition-colors sm:gap-2 sm:px-3 sm:py-2 sm:text-sm"
                on:click={clearSelection}
              >
                <X class="h-3 w-3 sm:h-4 sm:w-4" />
                Clear
              </button>
              <button
                class="flex items-center gap-1.5 rounded-lg bg-red-500 px-2.5 py-1.5 text-xs text-white transition-colors hover:bg-red-600 sm:gap-2 sm:px-3 sm:py-2 sm:text-sm"
                on:click={handleBulkDelete}
              >
                <Trash2 class="h-3 w-3 sm:h-4 sm:w-4" />
                Delete
              </button>
            </div>
          </div>
        </div>
      {/if}
    </div>
  {:else if mapObjectsView === "trails"}
    <!-- Trail Management Section -->
    <div class="flex flex-1 flex-col overflow-hidden">
      <!-- Header - mobile-first responsive sizing -->
      <div class="flex-shrink-0 space-y-2 pb-2 sm:space-y-3 sm:pb-3">
        <div class="flex items-center justify-between">
          <div>
            <h3
              class="text-sm font-semibold text-contrast-content sm:text-base"
            >
              Trail Records
            </h3>
            <p
              class="hidden text-xs text-contrast-content/60 sm:block sm:text-sm"
            >
              View trail history and data
            </p>
          </div>
        </div>

        <!-- Controls layout -->
        <div class="space-y-2 sm:space-y-3">
          <div class="flex gap-2 sm:gap-3">
            <div class="relative flex-1">
              <Search
                class="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-contrast-content/60 sm:left-3 sm:h-4 sm:w-4"
              />
              <input
                type="text"
                placeholder="Search trails..."
                bind:value={trailSearchQuery}
                class="w-full rounded-lg border border-base-300 bg-base-200 py-1.5 pl-7 pr-3 text-xs text-contrast-content outline-none focus:border-base-content sm:py-2 sm:pl-10 sm:pr-4 sm:text-sm"
              />
            </div>

            <button
              class="flex items-center gap-1 rounded-lg border border-base-300 bg-base-200 px-2 py-1.5 text-xs text-contrast-content transition-colors hover:bg-base-300 sm:gap-2 sm:px-3 sm:py-2 sm:text-sm"
              on:click={toggleTrailSort}
            >
              {#if trailSortDirection === "asc"}
                <SortAsc class="h-3 w-3 sm:h-4 sm:w-4" />
              {:else}
                <SortDesc class="h-3 w-3 sm:h-4 sm:w-4" />
              {/if}
              <span class="hidden sm:inline">Date</span>
            </button>
          </div>

          <!-- Operations Dropdown -->
          <div class="relative" bind:this={operationDropdownRef}>
            <button
              class="hover:bg-base-50 flex w-full items-center justify-between rounded-lg border border-base-300 bg-base-100 px-2.5 py-2.5 text-xs outline-none transition-colors focus:border-base-content disabled:cursor-not-allowed disabled:opacity-50 sm:px-3 sm:py-3 sm:text-sm"
              on:click={() => (showOperationDropdown = !showOperationDropdown)}
            >
              <span class="truncate text-left text-contrast-content">
                {#if selectedOperation === "all"}
                  All Operations
                  <span
                    class="ml-1.5 inline-flex items-center gap-1 rounded-full bg-base-200 px-1.5 py-0.5 text-xs text-base-content sm:ml-2 sm:px-2"
                  >
                    <Route class="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                    {$trailsMetaDataStore.length}
                  </span>
                {:else}
                  {selectedOperationName.replace(/\s*\([^)]*\)$/, "")}
                  <span
                    class="ml-1.5 inline-flex items-center gap-1 rounded-full bg-base-200 px-1.5 py-0.5 text-xs text-base-content sm:ml-2 sm:px-2"
                  >
                    <Route class="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                    {getTrailCountForOperation(selectedOperation)}
                  </span>
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
                <!-- All Operations option -->
                <button
                  class="group flex w-full items-center justify-between px-2.5 py-2 text-left transition-colors hover:bg-base-200 sm:px-3 {selectedOperation ===
                  'all'
                    ? 'bg-primary/10 text-primary'
                    : ''}"
                  on:click={() => selectOperation("all")}
                >
                  <div class="min-w-0 flex-1">
                    <div
                      class="truncate text-xs font-medium text-contrast-content sm:text-sm"
                    >
                      All Operations
                    </div>
                  </div>
                  <div class="ml-2 flex shrink-0 items-center gap-1">
                    <div
                      class="group-hover:bg-base-400 flex items-center gap-1 rounded-full bg-base-300 px-1.5 py-1 text-xs {selectedOperation ===
                      'all'
                        ? 'bg-primary/20 text-primary'
                        : 'text-base-content'} sm:px-2"
                    >
                      <Route class="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                      <span>{$trailsMetaDataStore.length}</span>
                    </div>
                  </div>
                </button>

                <!-- Individual operations -->
                {#each $operationStore as operation (operation.id)}
                  {@const trailCount = getTrailCountForOperation(operation.id)}
                  <button
                    class="group flex w-full items-center justify-between px-2.5 py-2 text-left transition-colors hover:bg-base-200 sm:px-3 {selectedOperation ===
                    operation.id
                      ? 'bg-primary/10 text-primary'
                      : ''}"
                    on:click={() => selectOperation(operation.id)}
                  >
                    <div class="min-w-0 flex-1">
                      <div
                        class="truncate text-xs font-medium text-contrast-content sm:text-sm"
                      >
                        {operation.name} ({operation.year})
                      </div>
                    </div>
                    <div class="ml-2 flex shrink-0 items-center gap-1">
                      <div
                        class="group-hover:bg-base-400 flex items-center gap-1 rounded-full bg-base-300 px-1.5 py-1 text-xs {selectedOperation ===
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
        </div>

        <p class="text-xs text-contrast-content/60 sm:text-sm">
          {filteredTrails.length} trails found
        </p>
      </div>

      <!-- Trails List -->
      <div class="flex-1 overflow-y-auto">
        <div class="space-y-1.5 px-0.5 pr-1 sm:space-y-2 sm:px-1 sm:pr-2">
          {#if filteredTrails.length === 0}
            <div
              class="flex flex-col items-center justify-center rounded-lg bg-base-200 py-6 text-center sm:py-8"
            >
              <Route
                class="mb-2 h-5 w-5 text-contrast-content/60 sm:mb-3 sm:h-8 sm:w-8"
              />
              <p class="text-xs font-medium text-contrast-content sm:text-sm">
                No trails found
              </p>
              <p
                class="hidden text-xs text-contrast-content/60 sm:block sm:text-sm"
              >
                Try a different search or operation
              </p>
            </div>
          {:else}
            {#each paginatedTrails as trail (trail.id)}
              <div
                class="rounded-lg bg-base-200 p-2.5 transition-colors hover:bg-base-300 sm:p-3"
              >
                <!-- Header with colored dot and operation name -->
                <div
                  class="mb-2 flex items-start justify-between gap-2 sm:mb-3"
                >
                  <div class="min-w-0 flex-1">
                    <!-- Operation name with colored dot on the left -->
                    <div class="flex items-center gap-1.5 sm:gap-2">
                      <div
                        class="h-2 w-2 shrink-0 rounded-full border border-gray-300 sm:h-3 sm:w-3"
                        style="background-color: {trail.trail_color}"
                        title="Trail color: {trail.trail_color}"
                      ></div>
                      <h4
                        class="truncate text-xs font-medium text-contrast-content sm:text-sm"
                      >
                        {trail.operation_name} ({trail.operation_year})
                      </h4>
                    </div>
                  </div>
                  <div class="text-right text-xs text-contrast-content/60">
                    <!-- Responsive date format -->
                    <div class="hidden sm:block">
                      <Calendar class="mr-1 inline h-3 w-3" />
                      {formatTrailDate(trail.start_time)}
                    </div>
                    <div class="block sm:hidden">
                      {formatTrailDateMobile(trail.start_time)}
                    </div>
                  </div>
                </div>

                <!-- Responsive metrics grid -->
                <div class="grid grid-cols-2 gap-2 text-xs sm:gap-3 sm:text-sm">
                  <div class="space-y-1 sm:space-y-2">
                    <div
                      class="flex items-center gap-1.5 text-contrast-content/70 sm:gap-2"
                    >
                      <Activity class="h-3 w-3 shrink-0 sm:h-4 sm:w-4" />
                      <span class="font-medium">Distance:</span>
                      <span>{formatDistance(trail.trail_distance)}</span>
                    </div>
                    <div
                      class="flex items-center gap-1.5 text-contrast-content/70 sm:gap-2"
                    >
                      <BarChart3 class="h-3 w-3 shrink-0 sm:h-4 sm:w-4" />
                      <span class="font-medium">Area:</span>
                      <span>{formatHectares(trail.trail_hectares)}</span>
                    </div>
                  </div>
                  <div class="space-y-1 sm:space-y-2">
                    <div
                      class="flex items-center gap-1.5 text-contrast-content/70 sm:gap-2"
                    >
                      <Clock class="h-3 w-3 shrink-0 sm:h-4 sm:w-4" />
                      <span class="font-medium">Duration:</span>
                      <!-- Responsive duration format -->
                      <span class="hidden sm:inline"
                        >{getTrailDuration(
                          trail.start_time,
                          trail.end_time,
                        )}</span
                      >
                      <span class="inline sm:hidden"
                        >{getTrailDurationMobile(
                          trail.start_time,
                          trail.end_time,
                        )}</span
                      >
                    </div>
                    <div
                      class="flex items-center gap-1.5 text-contrast-content/70 sm:gap-2"
                    >
                      <Route class="h-3 w-3 shrink-0 sm:h-4 sm:w-4" />
                      <span class="font-medium">Overlap:</span>
                      <span
                        >{formatPercentage(
                          trail.trail_percentage_overlap,
                        )}</span
                      >
                    </div>
                  </div>
                </div>

                <!-- Overlap details with better responsive behavior -->
                {#if trail.trail_hectares_overlap && trail.trail_hectares_overlap > 0}
                  <div class="mt-2 border-t border-base-300 pt-1 sm:pt-2">
                    <div class="text-xs text-contrast-content/60">
                      <span class="hidden sm:inline">Overlap area: </span>
                      <span class="inline sm:hidden">Overlap: </span>
                      {formatHectares(trail.trail_hectares_overlap)}
                    </div>
                  </div>
                {/if}
              </div>
            {/each}

            {#if hasMoreTrailPages}
              <div class="flex justify-center pt-2 sm:pt-4">
                <button
                  class="rounded-lg border border-base-300 bg-base-200 px-3 py-1.5 text-xs text-contrast-content transition-colors hover:bg-base-300 sm:px-4 sm:py-2 sm:text-sm"
                  on:click={loadMoreTrails}
                >
                  Load More ({filteredTrails.length - paginatedTrails.length})
                </button>
              </div>
            {/if}
          {/if}
        </div>
      </div>
    </div>
  {/if}
</div>
