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

  // 🆕 UPDATED: Shorter date format for mobile
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

  // 🆕 NEW: Shorter duration format for mobile
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

  // Updated bubble colors that provide good contrast for black icons in both light and dark themes
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
    access: "rgba(0, 0, 0, 0.8)", // Black as on map
    entrance: "rgba(0, 0, 0, 0.8)",
    equipment: "rgba(0, 0, 0, 0.8)",
    machinery: "rgba(0, 0, 0, 0.8)",
    sample: "rgba(0, 0, 0, 0.8)",
    soil: "rgba(0, 0, 0, 0.8)",
    issue: "rgba(0, 0, 0, 0.8)",
    problem: "rgba(0, 0, 0, 0.8)",
    storage: "rgba(0, 0, 0, 0.8)",
    barn: "rgba(0, 0, 0, 0.8)",
    default: "rgba(0, 0, 0, 0.8)", // Black as default
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
</script>

<!-- Main container with screen height constraints -->
<div class="flex h-full max-h-[67vh] flex-col space-y-4 overflow-hidden">
  <!-- Sub-navigation with numbers on top and reduced spacing -->
  <div class="grid flex-shrink-0 grid-cols-3 border-b border-base-300">
    <button
      class="flex flex-col items-center gap-1 border-b-2 px-3 py-2 text-sm font-medium transition-colors {mapObjectsView ===
      'vehicles'
        ? 'border-primary text-primary'
        : 'border-transparent text-contrast-content/60 hover:text-contrast-content'}"
      on:click={() => (mapObjectsView = "vehicles")}
    >
      <span
        class="rounded bg-base-300 px-2 py-1 text-sm font-semibold leading-none"
        >{vehicleCount}</span
      >
      <div class="flex items-center gap-2">
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
        <span class="hidden sm:inline">Vehicles</span>
        <span class="sm:hidden">Cars</span>
      </div>
    </button>

    <button
      class="flex flex-col items-center gap-1 border-b-2 px-3 py-2 text-sm font-medium transition-colors {mapObjectsView ===
      'pins'
        ? 'border-primary text-primary'
        : 'border-transparent text-contrast-content/60 hover:text-contrast-content'}"
      on:click={() => (mapObjectsView = "pins")}
    >
      <span
        class="rounded bg-base-300 px-2 py-1 text-sm font-semibold leading-none"
        >{pinCount}</span
      >
      <div class="flex items-center gap-2">
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
        <span>Pins</span>
      </div>
    </button>

    <button
      class="flex flex-col items-center gap-1 border-b-2 px-3 py-2 text-sm font-medium transition-colors {mapObjectsView ===
      'trails'
        ? 'border-primary text-primary'
        : 'border-transparent text-contrast-content/60 hover:text-contrast-content'}"
      on:click={() => (mapObjectsView = "trails")}
    >
      <span
        class="rounded bg-base-300 px-2 py-1 text-sm font-semibold leading-none"
        >{trailCount}</span
      >
      <div class="flex items-center gap-2">
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
        <span>Trails</span>
      </div>
    </button>
  </div>

  <!-- Content based on selected sub-menu -->
  {#if mapObjectsView === "vehicles"}
    <div class="flex-1 overflow-hidden">
      <div class="py-4 text-center">
        <div
          class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-base-300"
        >
          <Car class="h-6 w-6 text-contrast-content/70" />
        </div>
        <h3 class="mb-1 text-base font-semibold text-contrast-content">
          Vehicles
        </h3>
        <p class="text-sm text-contrast-content/60">
          Vehicle management coming soon
        </p>
      </div>
    </div>
  {:else if mapObjectsView === "pins"}
    <!-- Pin Management Section with container-relative sticky menu -->
    <div class="relative flex flex-1 flex-col overflow-hidden">
      <!-- Header and controls - fixed at top -->
      <div class="flex-shrink-0 space-y-3 pb-3">
        <!-- Header with refresh button -->
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-base font-semibold text-contrast-content">
              Map Pins
            </h3>
            <p class="text-sm text-contrast-content/60">View and manage pins</p>
          </div>
          <button
            class="flex items-center gap-2 rounded-lg bg-base-200 px-3 py-2 text-sm font-medium text-contrast-content transition-colors hover:bg-base-300"
            on:click={loadPins}
            disabled={loading}
          >
            <RefreshCw class="h-4 w-4 {loading ? 'animate-spin' : ''}" />
            <span class="hidden sm:inline">Refresh</span>
          </button>
        </div>

        <!-- Search and filter section -->
        <div class="flex gap-3">
          <div class="relative flex-1">
            <div
              class="absolute left-3 top-1/2 -translate-y-1/2 text-contrast-content/60"
            >
              <Search class="h-4 w-4" />
            </div>
            <input
              type="text"
              placeholder="Search pins..."
              bind:value={searchQuery}
              class="w-full rounded-lg border border-base-300 bg-base-200 py-2 pl-10 pr-4 text-sm text-contrast-content outline-none transition-colors focus:border-base-content"
            />
          </div>
          <button
            class="flex items-center gap-2 rounded-lg border border-base-300 bg-base-200 px-3 py-2 text-sm text-contrast-content transition-colors hover:bg-base-300"
            on:click={toggleSort}
          >
            {#if sortDirection === "asc"}
              <SortAsc class="h-4 w-4" />
            {:else}
              <SortDesc class="h-4 w-4" />
            {/if}
            <span class="hidden sm:inline">Date</span>
          </button>
        </div>

        <!-- Pins count -->
        <div>
          <p class="text-sm text-contrast-content/60">
            {filteredMarkers.length} pins found
          </p>
        </div>
      </div>

      <!-- Scrollable pins list -->
      <div
        class="flex-1 overflow-y-auto {selectedPins.size > 0 ? 'pb-16' : ''}"
      >
        <div class="space-y-2 px-1 pr-2 pt-1">
          {#if loading}
            <div
              class="flex items-center justify-center rounded-lg bg-base-200 py-8"
            >
              <div class="flex items-center gap-3">
                <RefreshCw
                  class="h-5 w-5 animate-spin text-contrast-content/60"
                />
                <span class="text-sm text-contrast-content/60">Loading...</span>
              </div>
            </div>
          {:else if error}
            <div
              class="flex flex-col items-center justify-center rounded-lg bg-base-200 py-8 text-center"
            >
              <div class="mb-3 rounded-full bg-base-300 p-3">
                <X class="h-5 w-5 text-red-500" />
              </div>
              <p class="mb-1 text-sm font-medium text-red-600">
                Failed to load
              </p>
              <p class="text-sm text-contrast-content/60">Try again</p>
            </div>
          {:else if filteredMarkers.length === 0}
            <div
              class="flex flex-col items-center justify-center rounded-lg bg-base-200 py-8 text-center"
            >
              <div class="mb-3 rounded-full bg-base-300 p-3">
                <MapPin class="h-5 w-5 text-contrast-content/60" />
              </div>
              <p class="mb-1 text-sm font-medium text-contrast-content">
                No pins found
              </p>
              <p class="text-sm text-contrast-content/60">
                Add pins to your map
              </p>
            </div>
          {:else}
            <div class="space-y-2">
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
                  class="flex cursor-pointer items-center gap-3 rounded-lg bg-base-200 p-3 transition-colors {isSelected
                    ? 'ring-1 ring-primary ring-opacity-50'
                    : 'hover:bg-base-300'}"
                  on:click={() => togglePin(marker.id)}
                >
                  <!-- Icon -->
                  <div
                    class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                    style="background-color: {pinColor};"
                  >
                    {#if getMarkerIcon(marker.marker_data.properties.icon).type === "svg"}
                      <div style="color: {iconColor};">
                        <IconSVG
                          icon={getMarkerIcon(
                            marker.marker_data.properties.icon,
                          ).name}
                          size="18px"
                        />
                      </div>
                    {:else if getMarkerIcon(marker.marker_data.properties.icon).type === "ionic"}
                      <ion-icon
                        name={getMarkerIcon(marker.marker_data.properties.icon)
                          .name}
                        style="font-size: 18px; color: {iconColor};"
                      />
                    {:else}
                      <MapPin size={18} style="color: {iconColor};" />
                    {/if}
                  </div>

                  <!-- Content -->
                  <div class="min-w-0 flex-1">
                    <h4
                      class="truncate text-sm font-medium text-contrast-content"
                    >
                      {marker.marker_data.properties.icon}
                    </h4>
                    <div
                      class="mt-1 flex items-center gap-1 text-xs text-contrast-content/60"
                    >
                      <Calendar class="h-3 w-3" />
                      {formatDate(marker.updated_at)}
                    </div>
                  </div>

                  <!-- Checkbox -->
                  <input
                    type="checkbox"
                    checked={isSelected}
                    class="checkbox-primary checkbox checkbox-sm pointer-events-none"
                    tabindex="-1"
                  />
                </div>
              {/each}

              {#if hasMorePages}
                <div class="flex justify-center pt-4">
                  <button
                    class="rounded-lg border border-base-300 bg-base-200 px-4 py-2 text-sm text-contrast-content transition-colors hover:bg-base-300"
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
          class="absolute bottom-0 left-0 right-0 border-t border-base-300 bg-base-100 p-3 shadow-lg"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="text-sm font-medium text-contrast-content">
                {selectedPins.size} selected
              </span>
            </div>
            <div class="flex items-center gap-3">
              <button
                class="hover:bg-base-400 flex items-center gap-2 rounded-lg bg-base-300 px-3 py-2 text-sm text-contrast-content transition-colors"
                on:click={clearSelection}
              >
                <X class="h-4 w-4" />
                Clear
              </button>
              <button
                class="flex items-center gap-2 rounded-lg bg-red-500 px-3 py-2 text-sm text-white transition-colors hover:bg-red-600"
                on:click={handleBulkDelete}
              >
                <Trash2 class="h-4 w-4" />
                Delete
              </button>
            </div>
          </div>
        </div>
      {/if}
    </div>
  {:else if mapObjectsView === "trails"}
    svelte Copy
    <!-- Trail Management Section -->
    <div class="flex flex-1 flex-col overflow-hidden">
      <!-- Header - responsive sizing -->
      <div class="flex-shrink-0 space-y-3 pb-3">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-base font-semibold text-contrast-content">
              Trail Records
            </h3>
            <p class="max-xs:hidden text-sm text-contrast-content/60">
              View trail history and data
            </p>
          </div>
        </div>

        <!-- Responsive controls layout -->
        <div class="max-xs:space-y-2 space-y-3">
          <div class="max-xs:gap-2 flex gap-3">
            <div class="relative flex-1">
              <Search
                class="max-xs:h-3 max-xs:w-3 max-xs:left-2 absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-contrast-content/60"
              />
              <input
                type="text"
                placeholder="Search trails..."
                bind:value={trailSearchQuery}
                class="max-xs:py-1.5 max-xs:pl-7 max-xs:text-xs w-full rounded-lg border border-base-300 bg-base-200 py-2 pl-10 pr-4 text-sm outline-none focus:border-base-content"
              />
            </div>

            <button
              class="max-xs:gap-1 max-xs:px-2 max-xs:py-1.5 flex items-center gap-2 rounded-lg border border-base-300 bg-base-200 px-3 py-2 text-sm text-contrast-content transition-colors hover:bg-base-300"
              on:click={toggleTrailSort}
            >
              {#if trailSortDirection === "asc"}
                <SortAsc class="max-xs:h-3 max-xs:w-3 h-4 w-4" />
              {:else}
                <SortDesc class="max-xs:h-3 max-xs:w-3 h-4 w-4" />
              {/if}
              <span class="max-xs:hidden">Date</span>
            </button>
          </div>

          <select
            bind:value={selectedOperation}
            class="max-xs:px-2 max-xs:py-1.5 max-xs:text-xs w-full rounded-lg border border-base-300 bg-base-200 px-3 py-2 text-sm outline-none focus:border-base-content"
          >
            <option value="all">All Operations</option>
            {#each $operationStore as operation}
              <option value={operation.id}
                >{operation.name} ({operation.year})</option
              >
            {/each}
          </select>
        </div>

        <p class="max-xs:text-xs text-sm text-contrast-content/60">
          {filteredTrails.length} trails found
        </p>
      </div>

      <!-- Trails List -->
      <div class="flex-1 overflow-y-auto">
        <div class="max-xs:space-y-2 max-xs:pr-1 space-y-3 px-1 pr-2">
          {#if filteredTrails.length === 0}
            <div
              class="max-xs:py-6 flex flex-col items-center justify-center rounded-lg bg-base-200 py-8 text-center"
            >
              <Route
                class="max-xs:mb-2 max-xs:h-6 max-xs:w-6 mb-3 h-8 w-8 text-contrast-content/60"
              />
              <p
                class="max-xs:text-xs text-sm font-medium text-contrast-content"
              >
                No trails found
              </p>
              <p class="max-xs:hidden text-sm text-contrast-content/60">
                Try a different search or operation
              </p>
            </div>
          {:else}
            {#each paginatedTrails as trail (trail.id)}
              <div
                class="max-xs:p-3 rounded-lg bg-base-200 p-4 transition-colors hover:bg-base-300"
              >
                <!-- 🆕 UPDATED: Header with colored dot to the left of operation name -->
                <div
                  class="max-xs:mb-2 mb-3 flex items-start justify-between gap-2"
                >
                  <div class="min-w-0 flex-1">
                    <!-- 🆕 UPDATED: Operation name with colored dot on the left -->
                    <div class="flex items-center gap-2">
                      <div
                        class="max-xs:h-2 max-xs:w-2 h-3 w-3 shrink-0 rounded-full border border-gray-300"
                        style="background-color: {trail.trail_color}"
                        title="Trail color: {trail.trail_color}"
                      ></div>
                      <h4
                        class="truncate text-sm font-medium text-contrast-content"
                      >
                        {trail.operation_name} ({trail.operation_year})
                      </h4>
                    </div>
                  </div>
                  <div class="text-right text-xs text-contrast-content/60">
                    <!-- Responsive date format -->
                    <div class="max-xs:hidden">
                      <Calendar class="mr-1 inline h-3 w-3" />
                      {formatTrailDate(trail.start_time)}
                    </div>
                    <div class="max-xs:block hidden">
                      {formatTrailDateMobile(trail.start_time)}
                    </div>
                  </div>
                </div>

                <!-- Responsive metrics grid -->
                <div
                  class="max-xs:gap-2 max-xs:text-xs grid grid-cols-2 gap-4 text-sm"
                >
                  <div class="max-xs:space-y-1 space-y-2">
                    <div
                      class="flex items-center gap-2 text-contrast-content/70"
                    >
                      <Activity
                        class="max-xs:h-3 max-xs:w-3 h-4 w-4 shrink-0"
                      />
                      <span class="font-medium">Distance:</span>
                      <span>{formatDistance(trail.trail_distance)}</span>
                    </div>
                    <div
                      class="flex items-center gap-2 text-contrast-content/70"
                    >
                      <BarChart3
                        class="max-xs:h-3 max-xs:w-3 h-4 w-4 shrink-0"
                      />
                      <span class="font-medium">Area:</span>
                      <span>{formatHectares(trail.trail_hectares)}</span>
                    </div>
                  </div>
                  <div class="max-xs:space-y-1 space-y-2">
                    <div
                      class="flex items-center gap-2 text-contrast-content/70"
                    >
                      <Clock class="max-xs:h-3 max-xs:w-3 h-4 w-4 shrink-0" />
                      <span class="font-medium">Duration:</span>
                      <!-- Responsive duration format -->
                      <span class="max-xs:hidden"
                        >{getTrailDuration(
                          trail.start_time,
                          trail.end_time,
                        )}</span
                      >
                      <span class="max-xs:inline hidden"
                        >{getTrailDurationMobile(
                          trail.start_time,
                          trail.end_time,
                        )}</span
                      >
                    </div>
                    <div
                      class="flex items-center gap-2 text-contrast-content/70"
                    >
                      <Route class="max-xs:h-3 max-xs:w-3 h-4 w-4 shrink-0" />
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
                  <div
                    class="max-xs:mt-2 max-xs:pt-1 mt-3 border-t border-base-300 pt-2"
                  >
                    <div class="text-xs text-contrast-content/60">
                      <span class="max-xs:hidden">Overlap area: </span>
                      <span class="max-xs:inline hidden">Overlap: </span>
                      {formatHectares(trail.trail_hectares_overlap)}
                    </div>
                  </div>
                {/if}
              </div>
            {/each}

            {#if hasMoreTrailPages}
              <div class="max-xs:pt-2 flex justify-center pt-4">
                <button
                  class="max-xs:px-3 max-xs:py-1.5 max-xs:text-xs rounded-lg border border-base-300 bg-base-200 px-4 py-2 text-sm text-contrast-content transition-colors hover:bg-base-300"
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

<style>
  /* 🆕 BALANCED: Custom breakpoint for very small screens only */
  @media (max-width: 449px) {
    .max-xs\:hidden {
      display: none;
    }
    .max-xs\:block {
      display: block;
    }
    .max-xs\:inline {
      display: inline;
    }
    .max-xs\:space-y-1 > :not([hidden]) ~ :not([hidden]) {
      margin-top: 0.25rem;
    }
    .max-xs\:space-y-2 > :not([hidden]) ~ :not([hidden]) {
      margin-top: 0.5rem;
    }
    .max-xs\:gap-1 {
      gap: 0.25rem;
    }
    .max-xs\:gap-2 {
      gap: 0.5rem;
    }
    .max-xs\:h-2 {
      height: 0.5rem;
    }
    .max-xs\:w-2 {
      width: 0.5rem;
    }
    .max-xs\:h-3 {
      height: 0.75rem;
    }
    .max-xs\:w-3 {
      width: 0.75rem;
    }
    .max-xs\:h-6 {
      height: 1.5rem;
    }
    .max-xs\:w-6 {
      width: 1.5rem;
    }
    .max-xs\:p-3 {
      padding: 0.75rem;
    }
    .max-xs\:px-2 {
      padding-left: 0.5rem;
      padding-right: 0.5rem;
    }
    .max-xs\:px-3 {
      padding-left: 0.75rem;
      padding-right: 0.75rem;
    }
    .max-xs\:py-1\.5 {
      padding-top: 0.375rem;
      padding-bottom: 0.375rem;
    }
    .max-xs\:pl-7 {
      padding-left: 1.75rem;
    }
    .max-xs\:left-2 {
      left: 0.5rem;
    }
    .max-xs\:text-xs {
      font-size: 0.75rem;
    }
    .max-xs\:mb-2 {
      margin-bottom: 0.5rem;
    }
    .max-xs\:mt-0\.5 {
      margin-top: 0.125rem;
    }
    .max-xs\:mt-2 {
      margin-top: 0.5rem;
    }
    .max-xs\:pt-1 {
      padding-top: 0.25rem;
    }
    .max-xs\:pt-2 {
      padding-top: 0.5rem;
    }
    .max-xs\:py-6 {
      padding-top: 1.5rem;
      padding-bottom: 1.5rem;
    }
    .max-xs\:pr-1 {
      padding-right: 0.25rem;
    }
  }
</style>
