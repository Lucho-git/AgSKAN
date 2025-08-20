<script lang="ts">
  import { onMount } from "svelte"
  import {
    operationStore,
    selectedOperationStore,
  } from "$lib/stores/operationStore"
  import { connectedMapStore } from "$lib/stores/connectedMapStore"
  import { mapActivityStore } from "$lib/stores/mapActivityStore"
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

  // Pagination variables
  let itemsPerPage = 20
  let currentPage = 1

  // Computed variables
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

  // Counts for tabs (using real data from mapActivityStore like MapInfo does)
  $: vehicleCount = $mapActivityStore?.vehicle_states?.length || 3 // Stubbed
  $: pinCount = $mapActivityStore?.marker_count || 0 // Real data from store like MapInfo
  $: trailCount = $mapActivityStore?.trail_count || 15 // Real data from store

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

  // Color maps for pins - updated with black as default
  const pinColorMap = {
    access: "rgba(74, 135, 224, 0.15)",
    entrance: "rgba(74, 135, 224, 0.15)",
    equipment: "rgba(76, 177, 113, 0.15)",
    machinery: "rgba(76, 177, 113, 0.15)",
    sample: "rgba(254, 221, 100, 0.15)",
    soil: "rgba(254, 221, 100, 0.15)",
    issue: "rgba(231, 76, 60, 0.15)",
    problem: "rgba(231, 76, 60, 0.15)",
    storage: "rgba(155, 89, 182, 0.15)",
    barn: "rgba(155, 89, 182, 0.15)",
    default: "rgba(0, 0, 0, 0.08)", // Light black background
  }

  const iconColorMap = {
    access: "rgba(74, 135, 224, 0.9)",
    entrance: "rgba(74, 135, 224, 0.9)",
    equipment: "rgba(76, 177, 113, 0.9)",
    machinery: "rgba(76, 177, 113, 0.9)",
    sample: "rgba(254, 221, 100, 0.9)",
    soil: "rgba(254, 221, 100, 0.9)",
    issue: "rgba(231, 76, 60, 0.9)",
    problem: "rgba(231, 76, 60, 0.9)",
    storage: "rgba(155, 89, 182, 0.9)",
    barn: "rgba(155, 89, 182, 0.9)",
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
      currentPage = 1 // Reset pagination
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
    currentPage = 1 // Reset pagination when sorting changes
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
          class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-orange-500/10"
        >
          <Car class="h-6 w-6 text-orange-500" />
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
              <div class="mb-3 rounded-full bg-red-100 p-3">
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
    <div class="flex-1 space-y-4 overflow-hidden">
      <!-- Trails Header -->
      <div class="py-4 text-center">
        <div
          class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-orange-500/10"
        >
          <Route class="h-6 w-6 text-orange-500" />
        </div>
        <h3 class="mb-1 text-base font-semibold text-contrast-content">
          Trails
        </h3>
        <p class="text-sm text-contrast-content/60">
          Trail management coming soon
        </p>
      </div>

      <!-- Operations List in Trails Tab -->
      <div class="rounded-lg bg-base-200 p-4">
        <h4 class="mb-3 text-sm font-medium text-contrast-content">
          Available Operations
        </h4>
        <div class="space-y-2">
          {#each $operationStore as operation}
            <div
              class="flex items-center justify-between rounded bg-base-100 p-3 text-sm {operation.id ===
              $selectedOperationStore?.id
                ? 'ring-1 ring-primary'
                : ''}"
            >
              <span class="text-contrast-content"
                >{operation.name} ({operation.year})</span
              >
              {#if operation.id === $selectedOperationStore?.id}
                <span
                  class="rounded bg-primary/20 px-2 py-1 text-xs text-primary"
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
