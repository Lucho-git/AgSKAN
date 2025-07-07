<script lang="ts">
  import { page } from "$app/stores"
  import { goto } from "$app/navigation"
  import { onMount, createEventDispatcher, tick } from "svelte"
  import {
    Check,
    X,
    ChevronLeft,
    ChevronRight,
    Pencil,
    Save,
    Loader,
    ArrowUp,
    ArrowRight,
    AlertTriangle,
  } from "lucide-svelte"
  import { toast } from "svelte-sonner"
  import { fieldStore } from "$lib/stores/fieldStore"
  import { fileApi } from "$lib/api/fileApi"
  import { processBoundariesApi } from "$lib/api/processBoundariesApi"
  import GeoJSONMap from "$lib/components/GeoJsonMap.svelte"
  import { connectedMapStore } from "$lib/stores/connectedMapStore"

  const dispatch = createEventDispatcher()

  // Get params from URL
  $: fileId = $page.url.searchParams.get("fileId")
  $: fileName = $page.url.searchParams.get("fileName")
  $: returnUrl = $page.url.searchParams.get("returnUrl") || "/admin/fieldview"

  $: connectedMap = $connectedMapStore

  interface Paddock {
    name: string
    boundary: GeoJSON.Polygon | GeoJSON.MultiPolygon
    properties: Record<string, any>
    status: null | "accepted" | "rejected" | "warning"
    area?: number
    isMultiPolygon: boolean
  }

  let paddocks: Paddock[] = []
  let currentIndex = 0
  let isEditing = false
  let editingName = "" // Separate editing variable
  let processingAction: string | null = null
  let loading = true
  let error: string | null = null

  // Pre-render all maps to avoid recreation
  let mapRefs: GeoJSONMap[] = []

  // Input field reference
  let editInput: HTMLInputElement

  // Redirect back if missing required params
  onMount(async () => {
    if (!fileId) {
      toast.error("No file selected for processing")
      goto(returnUrl)
      return
    }

    try {
      console.log("🔄 Processing file:", fileName)
      const result = await processBoundariesApi.processFile(fileName)

      if (result.error) {
        throw new Error(result.message || "Failed to process file")
      }

      if (result.paddocks) {
        paddocks = result.paddocks.map((paddock: any) => {
          const isMultiPolygon = paddock.boundary.type === "MultiPolygon"
          return {
            ...paddock,
            status: isMultiPolygon ? "warning" : null,
            area: undefined,
            isMultiPolygon,
          }
        })
      }

      console.log("✅ Processed paddocks:", paddocks.length)
    } catch (err) {
      console.error("❌ Error processing file:", err)
      error = err.message || "Failed to process boundary file"
    } finally {
      loading = false
    }
  })

  // Current paddock name for display
  $: currentPaddockName = paddocks[currentIndex]?.name || ""

  // Computed values - optimized to avoid unnecessary recalculations
  $: allPaddocksReviewed = paddocks.every(
    (paddock) => paddock.status === "accepted" || paddock.status === "rejected",
  )

  $: progressPercentage =
    paddocks.length > 0
      ? (paddocks.filter(
          (p) => p.status === "accepted" || p.status === "rejected",
        ).length /
          paddocks.length) *
        100
      : 0

  // Calculate dots per row for wrapping - mobile responsive
  $: dotsPerRow = getDotsPerRow(paddocks.length)

  function getDotsPerRow(totalDots: number) {
    // Mobile-first responsive dots per row
    if (typeof window !== "undefined" && window.innerWidth < 640) {
      // Mobile: fewer dots per row
      if (totalDots <= 6) return totalDots
      if (totalDots <= 12) return 6
      if (totalDots <= 24) return 8
      return 10
    } else {
      // Desktop: more dots per row
      if (totalDots <= 10) return totalDots
      if (totalDots <= 20) return 10
      if (totalDots <= 40) return 15
      return 20
    }
  }

  function handleNext() {
    if (currentIndex < paddocks.length - 1) {
      currentIndex++
      cancelEditing()
    }
  }

  function handlePrevious() {
    if (currentIndex > 0) {
      currentIndex--
      cancelEditing()
    }
  }

  // Optimized approve function - with proper reactivity
  function handleApprove() {
    // Force reactivity by creating new array
    paddocks = paddocks.map((paddock, index) =>
      index === currentIndex ? { ...paddock, status: "accepted" } : paddock,
    )

    // Move to next immediately
    if (currentIndex < paddocks.length - 1) {
      currentIndex++
    }

    cancelEditing()
  }

  // Optimized reject function - with proper reactivity
  function handleReject() {
    // Force reactivity by creating new array
    paddocks = paddocks.map((paddock, index) =>
      index === currentIndex ? { ...paddock, status: "rejected" } : paddock,
    )

    // Move to next immediately (same as approve)
    if (currentIndex < paddocks.length - 1) {
      currentIndex++
    }

    cancelEditing()
  }

  // Completely new approach for editing
  async function startEditing() {
    if (!paddocks[currentIndex]) return

    editingName = paddocks[currentIndex].name
    isEditing = true

    // Wait for DOM update, then focus
    await tick()
    if (editInput) {
      editInput.focus()
      editInput.select()
    }
  }

  function saveEdit() {
    if (!paddocks[currentIndex]) return

    paddocks[currentIndex].name =
      editingName.trim() || paddocks[currentIndex].name
    paddocks = [...paddocks] // Trigger reactivity
    isEditing = false
    toast.success("Field name saved successfully")
  }

  function cancelEditing() {
    isEditing = false
    editingName = ""
  }

  function handleAcceptAll() {
    processingAction = "acceptAll"

    // Batch update all statuses with proper reactivity
    paddocks = paddocks.map((paddock) => ({
      ...paddock,
      status: "accepted",
    }))

    processingAction = null
    toast.success("All fields approved successfully")
  }

  // Save fields and return to main page
  async function handleLoadPaddocks() {
    processingAction = "load"

    try {
      // Filter only accepted paddocks
      const acceptedPaddocks = paddocks.filter((p) => p.status === "accepted")

      if (acceptedPaddocks.length === 0) {
        toast.error("No fields approved for loading")
        return
      }

      // Get the map ID from the connected map store
      const map_id = $connectedMapStore.id
      if (!map_id) {
        toast.error("No map connected. Please connect to a map first.")
        return
      }

      // Use the real API call
      const promise = fileApi
        .uploadFields(map_id, acceptedPaddocks)
        .then((result) => {
          if (!result.success) {
            throw new Error(result.message)
          }
          return result
        })

      // Show toast with promise states
      toast.promise(promise, {
        loading: "Submitting fields...",
        success: (result) => {
          const successCount = result.insertedFields.length
          return successCount === 1
            ? `Field "${result.insertedFields[0].name}" was uploaded.`
            : `${successCount} fields were uploaded.`
        },
        error: (err) => err.message,
      })

      // Wait for the result
      const result = await promise

      // Handle partial rejections
      if (result.rejectedFields && result.rejectedFields.length > 0) {
        const rejectionReasons = result.rejectedFields.reduce((acc, field) => {
          acc[field.reason] = (acc[field.reason] || 0) + 1
          return acc
        }, {})

        let rejectionMessage = `${result.rejectedFields.length} field(s) were rejected:`
        for (const [reason, count] of Object.entries(rejectionReasons)) {
          rejectionMessage += `\n${count} ${count === 1 ? "field" : "fields"} rejected for ${reason}`
        }
        toast.error(rejectionMessage, { duration: 7000 })
      }

      // Update the field store with successfully inserted fields
      if (result.insertedFields && result.insertedFields.length > 0) {
        fieldStore.update((existingFields) => [
          ...existingFields,
          ...result.insertedFields,
        ])
      }

      // Navigate back after short delay
      setTimeout(() => {
        goto(returnUrl)
      }, 500)
    } catch (error) {
      console.error("Error loading fields:", error)
      // Error toast is already handled by toast.promise
    } finally {
      processingAction = null
    }
  }

  // Fixed dot class function - with forced reactivity
  function getPaddockDotClass(
    index: number,
    currentIdx: number,
    paddockList: Paddock[],
  ) {
    const paddock = paddockList[index]
    const isCurrentDot = index === currentIdx

    if (paddock.status === "accepted") {
      return isCurrentDot
        ? "bg-green-500 border-2 border-green-300 ring-4 ring-green-200"
        : "bg-green-500 hover:bg-green-600"
    }
    if (paddock.status === "rejected") {
      return isCurrentDot
        ? "bg-red-500 border-2 border-red-300 ring-4 ring-red-200"
        : "bg-red-500 hover:bg-red-600"
    }
    if (paddock.status === "warning") {
      return isCurrentDot
        ? "bg-yellow-500 border-2 border-yellow-300 ring-4 ring-yellow-200"
        : "bg-yellow-500 hover:bg-yellow-600"
    }

    // Default/current states - blue for current, gray for pending
    return isCurrentDot
      ? "bg-blue-500 border-2 border-blue-300 ring-4 ring-blue-200"
      : "bg-gray-400 hover:bg-gray-500"
  }

  function handleBackToUpload() {
    goto(returnUrl)
  }

  // Handle keyboard navigation - completely isolated from editing
  function handleGlobalKeydown(event: KeyboardEvent) {
    // Never interfere when editing
    if (isEditing) return

    // Don't interfere when focused on any input element
    const target = event.target as HTMLElement
    if (
      target?.tagName === "INPUT" ||
      target?.tagName === "TEXTAREA" ||
      target?.tagName === "SELECT"
    ) {
      return
    }

    if (event.key === "ArrowLeft" && currentIndex > 0) {
      event.preventDefault()
      handlePrevious()
    } else if (
      event.key === "ArrowRight" &&
      currentIndex < paddocks.length - 1
    ) {
      event.preventDefault()
      handleNext()
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      handleApprove()
    } else if (
      event.key === "Escape" ||
      event.key === "r" ||
      event.key === "R"
    ) {
      event.preventDefault()
      handleReject()
    }
  }

  // Dedicated edit input handler
  function handleEditKeydown(event: KeyboardEvent) {
    if (event.key === "Enter") {
      event.preventDefault()
      saveEdit()
    } else if (event.key === "Escape") {
      event.preventDefault()
      cancelEditing()
    }
    // All other keys pass through normally for typing
  }

  // Handle dot click navigation - fixed to properly update currentIndex
  function handleDotClick(index: number) {
    if (processingAction !== null) return
    currentIndex = index
    cancelEditing()
  }
</script>

<svelte:head>
  <title>Process Field Boundaries - Field Management</title>
</svelte:head>

<svelte:window on:keydown={handleGlobalKeydown} />

<div class="relative min-h-screen overflow-hidden bg-base-100">
  <div class="relative z-10">
    {#if loading}
      <!-- Loading State -->
      <div class="animate-slideInLeft">
        <!-- Header - No subtitle -->
        <div class="mb-4 text-center">
          <h2 class="mb-2 text-2xl font-bold md:text-3xl">
            <span class="text-base-content">Processing</span> Field Boundaries
          </h2>
        </div>

        <!-- Processing Card -->
        <div
          class="animate-fadeIn relative mx-auto max-w-3xl overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-xl"
        >
          <div class="p-4 md:p-6">
            <div class="flex flex-col items-center justify-center py-12">
              <div class="text-center">
                <div class="loading loading-spinner loading-lg mb-4"></div>
                <h3 class="mb-2 text-lg font-semibold">
                  Processing Boundary File
                </h3>
                <p class="text-sm text-contrast-content/60">
                  Analyzing {fileName}...
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    {:else if error}
      <!-- Error State -->
      <div class="animate-slideInLeft">
        <!-- Header - No subtitle -->
        <div class="mb-4 text-center">
          <h2 class="mb-2 text-2xl font-bold md:text-3xl">
            <span class="text-base-content">Processing</span> Failed
          </h2>
        </div>

        <!-- Error Card -->
        <div
          class="animate-fadeIn relative mx-auto max-w-3xl overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-xl"
        >
          <div class="p-4 md:p-6">
            <div class="flex flex-col items-center justify-center py-12">
              <div class="max-w-md text-center">
                <div class="mb-4 text-error">
                  <X size={40} class="mx-auto" />
                </div>
                <h3 class="mb-2 text-lg font-semibold">Processing Failed</h3>
                <p class="mb-6 text-sm text-contrast-content/60">{error}</p>
                <button
                  on:click={handleBackToUpload}
                  class="btn"
                  style="background-color: hsl(var(--bc)); color: hsl(var(--b1));"
                >
                  Back to Upload
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    {:else}
      <!-- Boundary Wizard Content -->
      <div class="animate-slideInLeft">
        <!-- Header - No subtitle -->
        <div class="mb-4 text-center">
          <h2 class="mb-2 text-2xl font-bold md:text-3xl">
            Review <span class="text-base-content">Field Boundaries</span>
          </h2>
        </div>

        <div class="space-y-4 md:space-y-5">
          <!-- Back Button - Above progress bar -->
          <div class="mx-auto max-w-4xl">
            <button
              on:click={handleBackToUpload}
              class="flex items-center gap-2 rounded-xl border border-transparent bg-transparent px-4 py-2 text-sm font-medium text-contrast-content/60 transition-all hover:border-base-content/20 hover:bg-base-content/5 hover:text-base-content"
            >
              <ArrowRight
                size={16}
                class="rotate-180 transition-transform hover:-translate-x-0.5"
              />
              <span>Back to Field Management</span>
            </button>
          </div>

          <!-- Overall Progress - Same width as review component -->
          <div class="mx-auto mb-4 max-w-4xl md:mb-6">
            <div class="mb-1 flex items-center justify-between">
              <span class="text-xs font-medium text-contrast-content md:text-sm"
                >Review Progress</span
              >
              <span class="text-xs font-medium text-contrast-content md:text-sm"
                >{Math.round(progressPercentage)}%</span
              >
            </div>
            <div class="h-1.5 w-full overflow-hidden rounded-full bg-base-200">
              <div
                class="h-full bg-base-content transition-all duration-500 ease-out"
                style="width: {progressPercentage}%"
              ></div>
            </div>
          </div>

          <!-- Enhanced Field Card -->
          <div
            class="animate-fadeIn relative mx-auto max-w-4xl overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-xl"
          >
            <div class="p-3 md:p-5">
              <!-- Field Name Section with Field Counter -->
              <div class="mb-4 md:mb-5">
                {#if isEditing}
                  <!-- Edit Mode -->
                  <div class="mb-2 flex items-center gap-2">
                    <input
                      bind:this={editInput}
                      bind:value={editingName}
                      type="text"
                      class="flex-1 rounded-lg border border-base-content bg-base-200 px-3 py-1.5 text-sm text-contrast-content transition-all focus:outline-none focus:ring-2 focus:ring-base-content/50 md:px-3 md:py-2 md:text-base"
                      placeholder="Enter field name"
                      on:keydown={handleEditKeydown}
                    />
                    <button
                      on:click={saveEdit}
                      class="flex items-center justify-center rounded-lg bg-base-content p-1.5 text-base-100 shadow-md transition-colors hover:bg-base-content/80 md:p-2"
                      title="Save name"
                    >
                      <Save size={16} class="md:hidden" />
                      <Save size={18} class="hidden md:block" />
                    </button>
                    <button
                      on:click={cancelEditing}
                      class="flex items-center justify-center rounded-lg bg-base-200 p-1.5 text-contrast-content transition-colors hover:bg-base-300 md:p-2"
                      title="Cancel"
                    >
                      <X size={16} class="md:hidden" />
                      <X size={18} class="hidden md:block" />
                    </button>
                  </div>
                  <!-- Field counter during edit -->
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-1.5">
                      <div
                        class="flex items-center justify-center rounded-full bg-base-content/10 px-2 py-1 md:px-3 md:py-1.5"
                      >
                        <span class="text-xs font-medium md:text-sm">
                          <span class="font-bold text-base-content"
                            >Field {currentIndex + 1}</span
                          >
                          <span class="mx-1 text-contrast-content/60">/</span>
                          <span class="text-contrast-content/60"
                            >{paddocks.length}</span
                          >
                        </span>
                      </div>
                    </div>
                  </div>
                {:else}
                  <!-- Display Mode -->
                  <div class="flex items-start justify-between gap-4">
                    <!-- Left side: Field name and edit button -->
                    <div
                      class="group flex flex-1 cursor-pointer items-center gap-2"
                      on:click={startEditing}
                      on:keydown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault()
                          startEditing()
                        }
                      }}
                      role="button"
                      tabindex="0"
                      title="Click to edit field name"
                    >
                      <h3
                        class="text-lg font-bold text-contrast-content md:text-xl"
                      >
                        {currentPaddockName}
                      </h3>
                      <div class="flex items-center gap-1.5">
                        <button
                          class="rounded-md bg-base-200 p-1 opacity-40 transition-all hover:bg-base-300 group-hover:opacity-100"
                        >
                          <Pencil
                            size={12}
                            class="text-contrast-content/60 group-hover:text-base-content md:hidden"
                          />
                          <Pencil
                            size={14}
                            class="hidden text-contrast-content/60 group-hover:text-base-content md:block"
                          />
                        </button>
                        <span
                          class="hidden text-xs text-contrast-content/60 transition-colors group-hover:text-base-content sm:inline"
                          >Edit name</span
                        >
                      </div>
                    </div>

                    <!-- Right side: Field counter and status badges -->
                    <div class="flex items-center gap-2">
                      <!-- Field Counter -->
                      <div
                        class="flex items-center justify-center rounded-full bg-base-content/10 px-2 py-1 md:px-3 md:py-1.5"
                      >
                        <span class="text-xs font-medium md:text-sm">
                          <span class="font-bold text-base-content"
                            >Field {currentIndex + 1}</span
                          >
                          <span class="mx-1 text-contrast-content/60">/</span>
                          <span class="text-contrast-content/60"
                            >{paddocks.length}</span
                          >
                        </span>
                      </div>

                      <!-- Status Badge -->
                      {#if paddocks[currentIndex]?.status === "accepted" || paddocks[currentIndex]?.status === "rejected"}
                        <div
                          class="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium md:gap-1 md:px-2.5 md:text-sm {paddocks[
                            currentIndex
                          ]?.status === 'accepted'
                            ? 'bg-green-500/10 text-green-600'
                            : 'bg-red-500/10 text-red-600'}"
                        >
                          {#if paddocks[currentIndex]?.status === "accepted"}
                            <Check size={10} class="md:hidden" />
                            <Check size={12} class="hidden md:block" />
                            <span>Approved</span>
                          {:else}
                            <X size={10} class="md:hidden" />
                            <X size={12} class="hidden md:block" />
                            <span>Rejected</span>
                          {/if}
                        </div>
                      {/if}

                      <!-- MultiPolygon Badge -->
                      {#if paddocks[currentIndex]?.isMultiPolygon}
                        <div
                          class="flex items-center gap-1 rounded-full bg-yellow-500/10 px-2 py-0.5 text-xs text-yellow-600"
                          title="This field contains multiple separated areas"
                        >
                          <AlertTriangle size={10} />
                          <span class="hidden sm:inline">Multi</span>
                        </div>
                      {/if}
                    </div>
                  </div>
                {/if}
              </div>

              <!-- Map Container -->
              <div
                class="mb-4 overflow-hidden rounded-xl border border-base-300 p-1 md:mb-5 md:p-2"
              >
                <div class="relative overflow-hidden rounded-lg">
                  <!-- Map Container with adjusted height and padding for labels -->
                  <div
                    class="relative flex h-64 items-center justify-center overflow-hidden bg-transparent sm:h-72 md:h-80"
                    style="padding-top: 2.5rem; padding-bottom: 2.5rem;"
                  >
                    {#each paddocks as paddock, index}
                      <div
                        class="absolute transition-opacity duration-200"
                        style="opacity: {index === currentIndex
                          ? 1
                          : 0}; z-index: {index === currentIndex ? 10 : 1}; 
                          top: 2.5rem; bottom: 2.5rem; left: 0; right: 0;
                          display: flex; justify-content: center; align-items: center;"
                      >
                        <div
                          style="width: 100%; height: 100%; display: flex; justify-content: center; align-items: center;"
                        >
                          <GeoJSONMap
                            bind:this={mapRefs[index]}
                            geojson={paddock.boundary}
                            width={700}
                            height={280}
                            bind:areaHectares={paddock.area}
                          />
                        </div>
                      </div>
                    {/each}
                  </div>

                  <!-- Field Name Display - Top Section (outside map area) -->
                  <div
                    class="absolute left-1/2 top-1 -translate-x-1/2 rounded-full border border-white/10 bg-black/80 px-3 py-1 text-xs text-white shadow-lg backdrop-blur-sm md:top-2 md:px-4 md:py-1.5 md:text-sm"
                  >
                    <span class="font-medium">
                      {currentPaddockName}
                    </span>
                  </div>

                  <!-- Hectares Display - Bottom Section (outside map area) -->
                  <div
                    class="absolute bottom-1 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-black/80 px-3 py-1 text-xs text-white shadow-lg backdrop-blur-sm md:bottom-2 md:px-4 md:py-1.5 md:text-sm"
                  >
                    <span class="font-medium">
                      {paddocks[currentIndex]?.area?.toFixed(2) ??
                        "Calculating..."} hectares
                    </span>
                  </div>
                </div>
              </div>

              <!-- Navigation and Action Controls -->
              <div class="space-y-4 md:space-y-5">
                <!-- Previous/Next Buttons -->
                <div class="flex items-center justify-between">
                  <button
                    on:click={handlePrevious}
                    disabled={currentIndex === 0}
                    class="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs transition-all md:gap-2 md:px-4 md:py-2 md:text-sm {currentIndex ===
                    0
                      ? 'cursor-not-allowed bg-base-200 text-contrast-content/40'
                      : 'bg-base-200 text-contrast-content hover:bg-base-300'}"
                  >
                    <ChevronLeft size={14} class="md:hidden" />
                    <ChevronLeft size={16} class="hidden md:block" />
                    <span class="hidden sm:inline">Previous</span>
                    <span class="sm:hidden">Prev</span>
                  </button>

                  <div class="text-center">
                    <span class="text-xs text-contrast-content/60 md:text-sm">
                      {currentIndex + 1} of {paddocks.length}
                    </span>
                    <!-- Hide keyboard instructions on mobile -->
                    <div
                      class="mt-0.5 hidden text-xs text-contrast-content/40 md:block"
                    >
                      ← → arrows, Enter=approve, R=reject
                    </div>
                  </div>

                  <button
                    on:click={handleNext}
                    disabled={currentIndex === paddocks.length - 1}
                    class="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs transition-all md:gap-2 md:px-4 md:py-2 md:text-sm {currentIndex ===
                    paddocks.length - 1
                      ? 'cursor-not-allowed bg-base-200 text-contrast-content/40'
                      : 'bg-base-200 text-contrast-content hover:bg-base-300'}"
                  >
                    <span class="hidden sm:inline">Next</span>
                    <span class="sm:hidden">Next</span>
                    <ChevronRight size={14} class="md:hidden" />
                    <ChevronRight size={16} class="hidden md:block" />
                  </button>
                </div>

                <!-- Approve/Reject Buttons -->
                <div class="flex items-center justify-center gap-3 md:gap-4">
                  <button
                    on:click={handleReject}
                    class="flex max-w-xs flex-1 items-center justify-center gap-2 rounded-lg border-2 border-red-500 py-2 text-sm font-medium text-red-500 transition-all hover:bg-red-500/10 md:py-2.5 md:text-base"
                  >
                    <X size={16} class="md:hidden" />
                    <X size={18} class="hidden md:block" />
                    <span>Reject</span>
                  </button>

                  <button
                    on:click={handleApprove}
                    class="flex max-w-xs flex-1 items-center justify-center gap-2 rounded-lg border-2 border-green-500 py-2 text-sm font-medium text-green-500 transition-all hover:bg-green-500/10 md:py-2.5 md:text-base"
                  >
                    <Check size={16} class="md:hidden" />
                    <Check size={18} class="hidden md:block" />
                    <span>Approve</span>
                  </button>
                </div>

                <!-- Enhanced Dots -->
                <div class="flex justify-center">
                  <div
                    class="grid gap-1.5 md:gap-2"
                    style="grid-template-columns: repeat({dotsPerRow}, 1fr); max-width: 100%;"
                  >
                    {#each paddocks as _, index (index)}
                      <button
                        on:click={() => handleDotClick(index)}
                        class="h-2 w-2 rounded-full transition-all md:h-2.5 md:w-2.5 {getPaddockDotClass(
                          index,
                          currentIndex,
                          paddocks,
                        )} {processingAction !== null
                          ? 'cursor-not-allowed'
                          : 'cursor-pointer hover:scale-110'}"
                        disabled={processingAction !== null}
                        title="Field {index + 1} - {paddocks[index].status ===
                        'accepted'
                          ? 'Approved'
                          : paddocks[index].status === 'rejected'
                            ? 'Rejected'
                            : paddocks[index].status === 'warning'
                              ? 'MultiPolygon'
                              : 'Pending'}"
                      />
                    {/each}
                  </div>
                </div>

                <!-- Final Actions -->
                <div
                  class="flex flex-col items-center justify-center gap-3 border-t border-base-300 pt-4 sm:flex-row md:gap-4 md:pt-5"
                >
                  <button
                    on:click={handleAcceptAll}
                    disabled={processingAction !== null}
                    class="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-medium transition-all sm:w-auto md:px-6 md:py-2.5 md:text-sm {processingAction ===
                    'acceptAll'
                      ? 'bg-base-content/80 text-base-100 shadow-lg'
                      : 'bg-base-content text-base-100 shadow-lg hover:bg-base-content/80'}"
                  >
                    {#if processingAction === "acceptAll"}
                      <span class="loading loading-spinner loading-sm"></span>
                    {:else}
                      <Check size={14} class="md:hidden" />
                      <Check size={16} class="hidden md:block" />
                    {/if}
                    <span>Accept All</span>
                  </button>

                  <button
                    on:click={handleLoadPaddocks}
                    disabled={!allPaddocksReviewed || processingAction !== null}
                    class="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-medium transition-all sm:w-auto md:px-6 md:py-2.5 md:text-sm {allPaddocksReviewed &&
                    processingAction === null
                      ? 'bg-green-500 text-white shadow-lg hover:bg-green-600'
                      : 'cursor-not-allowed bg-base-200 text-contrast-content/40'}"
                  >
                    {#if processingAction === "load"}
                      <span class="loading loading-spinner loading-sm"></span>
                    {:else}
                      <ArrowUp size={14} class="md:hidden" />
                      <ArrowUp size={16} class="hidden md:block" />
                    {/if}
                    <span>Load Fields</span>
                  </button>
                </div>

                {#if !allPaddocksReviewed}
                  <div class="text-center text-xs text-red-500">
                    Please approve or reject all fields before loading
                  </div>
                {/if}
              </div>
            </div>
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  .animate-fadeIn {
    animation: fadeIn 0.2s ease-out;
  }

  @keyframes slideInLeft {
    from {
      opacity: 0;
      transform: translateX(-20px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  .animate-slideInLeft {
    animation: slideInLeft 0.3s ease-out;
  }
</style>
