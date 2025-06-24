<script lang="ts">
  import { onMount } from "svelte"
  import {
    MapPin,
    Search,
    SortAsc,
    SortDesc,
    Trash2,
    X,
    Calendar,
  } from "lucide-svelte"
  import { DateTime } from "luxon"
  import {
    getPinsFromMapId,
    deletePins,
    type MapMarker,
  } from "$lib/utils/pinsFromMapId"
  import IconSVG from "../../../../components/IconSVG.svelte"

  export let open = false
  export let mapMarkers: number
  export let isPaidSubscription: boolean
  export let markerLimit: number
  export let mapId: string

  let loading = true
  let error: any = null
  let markers: MapMarker[] = []
  let searchQuery = ""
  let sortDirection: "asc" | "desc" = "desc"
  let selectedPins = new Set<number>()
  let hasLoadedOnce = false

  // Pagination variables
  let itemsPerPage = 40
  let currentPage = 1

  function closeDialog() {
    open = false
  }

  // Prevent background scroll when modal is open
  $: if (open) {
    document.body.style.overflow = "hidden"
  } else {
    document.body.style.overflow = ""
  }

  function getMarkerIcon(iconName: string) {
    const cleanIconName = iconName.replace("custom-svg-", "")

    if (iconName.startsWith("custom-svg-")) {
      return {
        type: "svg",
        name: cleanIconName,
      }
    } else if (iconName.startsWith("ionic-")) {
      return {
        type: "ionic",
        name: iconName.replace("ionic-", ""),
      }
    } else {
      return {
        type: "default",
        name: "📍",
      }
    }
  }

  // Get pin color based on category/type - more subtle colors
  function getPinColor(iconName: string) {
    if (iconName.includes("access") || iconName.includes("entrance"))
      return "rgba(74, 135, 224, 0.15)"
    if (iconName.includes("equipment") || iconName.includes("machinery"))
      return "rgba(76, 177, 113, 0.15)"
    if (iconName.includes("sample") || iconName.includes("soil"))
      return "rgba(254, 221, 100, 0.15)"
    if (iconName.includes("issue") || iconName.includes("problem"))
      return "rgba(231, 76, 60, 0.15)"
    if (iconName.includes("storage") || iconName.includes("barn"))
      return "rgba(155, 89, 182, 0.15)"
    return "rgba(74, 135, 224, 0.15)"
  }

  // Get icon color - slightly more saturated than background
  function getIconColor(iconName: string) {
    if (iconName.includes("access") || iconName.includes("entrance"))
      return "rgba(74, 135, 224, 0.7)"
    if (iconName.includes("equipment") || iconName.includes("machinery"))
      return "rgba(76, 177, 113, 0.7)"
    if (iconName.includes("sample") || iconName.includes("soil"))
      return "rgba(254, 221, 100, 0.8)"
    if (iconName.includes("issue") || iconName.includes("problem"))
      return "rgba(231, 76, 60, 0.7)"
    if (iconName.includes("storage") || iconName.includes("barn"))
      return "rgba(155, 89, 182, 0.7)"
    return "rgba(74, 135, 224, 0.7)"
  }

  async function loadPins() {
    loading = true
    const { data, error: pinError } = await getPinsFromMapId(mapId)
    console.log("Pins Data", data)

    if (pinError) {
      error = pinError
      loading = false
      return
    }

    markers = data || []
    loading = false
    hasLoadedOnce = true
  }

  async function handleBulkDelete() {
    try {
      const pinIdsToDelete = Array.from(selectedPins)
      const error = await deletePins(pinIdsToDelete)

      if (error) {
        console.error("Error deleting pins:", error)
        return
      }

      await loadPins()
      clearSelection()
    } catch (err) {
      console.error("Error in handleBulkDelete:", err)
    }
  }

  // Load pins when dialog opens (only if not loaded before)
  $: if (open && !hasLoadedOnce && mapId) {
    loadPins()
  }

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

  function loadMore() {
    if (hasMorePages) {
      currentPage++
    }
  }

  function handleScroll(e: Event) {
    const target = e.target as HTMLElement
    if (
      target.scrollHeight - target.scrollTop <= target.clientHeight + 100 &&
      hasMorePages
    ) {
      loadMore()
    }
  }

  function toggleSort() {
    sortDirection = sortDirection === "asc" ? "desc" : "asc"
  }

  function formatDate(dateString: string) {
    return DateTime.fromISO(dateString).toRelative()
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

  function handleBackdropClick(event) {
    if (event.target === event.currentTarget) {
      closeDialog()
    }
  }

  function handleCardClick(markerId: number) {
    togglePin(markerId)
  }

  function handleCardKeydown(event, markerId: number) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      togglePin(markerId)
    }
  }
</script>

{#if open}
  <!-- High z-index backdrop to ensure it's above everything -->
  <div
    class="fixed inset-0 flex items-start justify-center bg-black bg-opacity-60 p-0 sm:items-center sm:p-4"
    style="z-index: 9999;"
    on:click={handleBackdropClick}
  >
    <!-- Modal Content - Better responsive behavior -->
    <div
      class="flex h-screen w-full flex-col overflow-hidden rounded-none border-0 bg-base-100 shadow-2xl sm:h-auto sm:max-h-[90vh]
             sm:min-h-[600px] sm:max-w-md sm:rounded-xl sm:border sm:border-base-300"
      on:click|stopPropagation
    >
      <!-- Header with accent -->
      <div class="relative shrink-0">
        <div class="h-1 w-full bg-primary"></div>
        <div
          class="flex items-center justify-between border-b border-base-300 p-5"
        >
          <h2
            class="flex items-center gap-2 text-xl font-bold text-base-content"
          >
            <MapPin size={20} class="text-primary" />
            Map Pins
          </h2>
          <button
            on:click={closeDialog}
            class="rounded-full p-1.5 text-contrast-content transition-colors hover:bg-base-200 hover:text-base-content"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <!-- Subtitle -->
      <div class="shrink-0 px-6 pb-2 pt-4">
        <p class="text-sm text-contrast-content">
          View and manage your map pins
        </p>
      </div>

      <!-- Search and filter section -->
      <div class="shrink-0 px-6 pb-4">
        <div class="flex gap-3">
          <div class="relative flex-1">
            <div
              class="absolute left-3 top-1/2 -translate-y-1/2 text-contrast-content"
            >
              <Search size={18} />
            </div>
            <input
              type="text"
              placeholder="Search pins..."
              bind:value={searchQuery}
              class="w-full rounded-lg border border-base-300 bg-base-200 py-3 pl-10 pr-4 text-contrast-content outline-none transition-colors focus:border-primary"
            />
          </div>
          <button
            class="flex items-center gap-2 rounded-lg border border-base-300 bg-base-200 px-4 py-2 text-primary transition-colors hover:bg-base-300"
            on:click={toggleSort}
          >
            {#if sortDirection === "asc"}
              <SortAsc size={16} />
            {:else}
              <SortDesc size={16} />
            {/if}
            <span>Date</span>
          </button>
        </div>
      </div>

      <!-- Pins count -->
      <div class="shrink-0 px-6 pb-4">
        <p class="text-sm text-contrast-content">
          {filteredMarkers.length} pins found
        </p>
      </div>

      <!-- Pins list container - Flexible height -->
      <div class="flex-1 overflow-y-auto px-6" on:scroll={handleScroll}>
        {#if loading}
          <div
            class="flex flex-col items-center justify-center py-10 text-center"
          >
            <div
              class="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-base-200 text-primary"
            >
              <div class="animate-spin">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
                </svg>
              </div>
            </div>
            <p class="mb-1 text-contrast-content">Loading pins...</p>
          </div>
        {:else if error}
          <div
            class="flex flex-col items-center justify-center py-10 text-center"
          >
            <div
              class="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-base-200 text-red-500"
            >
              <X size={24} />
            </div>
            <p class="mb-1 text-red-500">Failed to load pins</p>
            <p class="text-sm text-contrast-content">Please try again</p>
          </div>
        {:else if filteredMarkers.length === 0}
          <div
            class="flex flex-col items-center justify-center py-10 text-center"
          >
            <div
              class="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-base-200 text-contrast-content"
            >
              <MapPin size={24} />
            </div>
            <p class="mb-1 text-base-content">No pins found</p>
            <p class="max-w-xs text-sm text-contrast-content">
              Pins will appear here when you add them to your map
            </p>
          </div>
        {:else}
          <div class="space-y-3 pb-4">
            {#each paginatedMarkers as marker (marker.id)}
              {@const pinColor = getPinColor(
                marker.marker_data.properties.icon,
              )}
              {@const iconColor = getIconColor(
                marker.marker_data.properties.icon,
              )}
              {@const isSelected = selectedPins.has(marker.id)}
              <!-- svelte-ignore a11y-no-static-element-interactions -->
              <!-- svelte-ignore a11y-click-events-have-key-events -->
              <div
                class="cursor-pointer select-none rounded-lg bg-base-200 p-4 transition-all {isSelected
                  ? 'border border-base-content bg-primary/10'
                  : 'border border-transparent hover:border-contrast-content hover:bg-base-300/50'}"
                on:click={() => handleCardClick(marker.id)}
                on:keydown={(e) => handleCardKeydown(e, marker.id)}
                role="checkbox"
                aria-checked={isSelected}
                tabindex="0"
              >
                <div class="flex items-center">
                  <!-- Icon Circle - Centered with faded background -->
                  <div
                    class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                    style="background-color: {pinColor};"
                  >
                    {#if getMarkerIcon(marker.marker_data.properties.icon).type === "svg"}
                      <div style="color: {iconColor};">
                        <IconSVG
                          icon={getMarkerIcon(
                            marker.marker_data.properties.icon,
                          ).name}
                          size="24px"
                        />
                      </div>
                    {:else if getMarkerIcon(marker.marker_data.properties.icon).type === "ionic"}
                      <ion-icon
                        name={getMarkerIcon(marker.marker_data.properties.icon)
                          .name}
                        style="font-size: 24px; color: {iconColor};"
                      />
                    {:else}
                      <MapPin size={24} style="color: {iconColor};" />
                    {/if}
                  </div>

                  <!-- Content - Centered -->
                  <div class="ml-4 flex flex-1 flex-col justify-center">
                    <h3 class="font-medium text-contrast-content">
                      {marker.marker_data.properties.icon}
                    </h3>
                    <p class="mt-0.5 text-sm text-contrast-content">
                      Pin marker on map
                    </p>
                    <div class="mt-2 flex items-center gap-3">
                      <span
                        class="flex items-center text-xs text-contrast-content"
                      >
                        <Calendar size={12} class="mr-1" />
                        {formatDate(marker.updated_at)}
                      </span>
                      <span
                        class="flex items-center text-xs text-contrast-content"
                      >
                        <MapPin size={12} class="mr-1" />
                        {marker.marker_data.geometry.coordinates[1].toFixed(4)}, {marker.marker_data.geometry.coordinates[0].toFixed(
                          4,
                        )}
                      </span>
                    </div>
                  </div>

                  <!-- DaisyUI Checkbox - Centered -->
                  <div class="ml-4 flex shrink-0 items-center justify-center">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      class="checkbox-primary checkbox checkbox-sm"
                      on:click|stopPropagation={() => togglePin(marker.id)}
                      tabindex="-1"
                    />
                  </div>
                </div>
              </div>
            {/each}

            {#if hasMorePages}
              <div class="flex justify-center py-4">
                <button
                  class="rounded-lg border border-base-300 bg-base-200 px-4 py-2 text-sm text-primary transition-colors hover:bg-base-300"
                  on:click={loadMore}
                >
                  Load More ({filteredMarkers.length - paginatedMarkers.length} remaining)
                </button>
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <!-- Footer with bulk actions and close button -->
      <div class="mt-2 shrink-0 border-t border-base-300 p-4">
        {#if selectedPins.size > 0}
          <div class="mb-3 flex items-center justify-between">
            <div class="flex items-center gap-2 text-sm">
              <button
                class="rounded-full p-1.5 text-contrast-content transition-colors hover:bg-base-200 hover:text-base-content"
                on:click={clearSelection}
              >
                <X size={16} />
              </button>
              <span class="font-medium text-base-content"
                >{selectedPins.size} selected</span
              >
            </div>
            <button
              class="flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm text-white shadow-sm transition-colors hover:bg-red-700"
              on:click={handleBulkDelete}
            >
              <Trash2 size={16} />
              Delete
            </button>
          </div>
        {/if}
        <button
          on:click={closeDialog}
          class="w-full rounded-lg bg-base-200 px-4 py-3 text-contrast-content transition-colors hover:bg-base-300"
        >
          Close
        </button>
      </div>
    </div>
  </div>
{/if}
