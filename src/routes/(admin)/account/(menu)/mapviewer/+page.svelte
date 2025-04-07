<script lang="ts">
  import { getContext, onMount, onDestroy } from "svelte"
  import type { Writable } from "svelte/store"
  import { goto } from "$app/navigation"
  import { toast } from "svelte-sonner"
  import { browser } from "$app/environment"
  import MapViewer from "../../../../../components/MapViewer.svelte"
  import type { PageData } from "./$types"
  import { selectedOperationStore } from "$lib/stores/operationStore"
  import { mapFieldsStore } from "$lib/stores/mapFieldsStore"
  import { session } from "$lib/stores/sessionStore"
  import { fileApi } from "$lib/api/fileApi" // Import the fileApi

  import { locationApi } from "$lib/api/locationApi" // Import the locationApi
  export let data: PageData

  // Client-side state
  let loading = true
  let error = null
  let fields = []
  let objectLocation = null
  let initialLocation = null

  console.log("1. MapViewer Page Load - Initial data:", data)
  let adminSection: Writable<string> = getContext("adminSection")
  adminSection.set("mapviewer")

  let wakeLock: WakeLockSentinel | null = null

  // Add logging for store value
  console.log(
    "2. Current selectedOperationStore value:",
    $selectedOperationStore,
  )
  let selectedOperation = $selectedOperationStore
  console.log("3. Local selectedOperation variable set to:", selectedOperation)

  // Subscribe to store changes
  selectedOperationStore.subscribe((value) => {
    console.log("4. selectedOperationStore changed to:", value)
    selectedOperation = value
    console.log("5. Local selectedOperation updated to:", selectedOperation)
  })

  function isAndroid() {
    return browser && /Android/.test(navigator.userAgent)
  }

  async function requestWakeLock() {
    if (browser && isAndroid() && "wakeLock" in navigator) {
      try {
        wakeLock = await navigator.wakeLock.request("screen")
      } catch (err) {
        if (err.name !== "NotAllowedError") {
          toast.error(`Couldn't keep screen awake: ${err.message}`)
        }
      }
    }
  }

  function releaseWakeLock() {
    if (wakeLock) {
      wakeLock
        .release()
        .then(() => {
          wakeLock = null
        })
        .catch((err) => {
          console.error(`Error releasing wake lock: ${err.message}`)
        })
    }
  }

  // Updated function to load fields using fileApi
  async function loadFields() {
    if (!browser) return

    try {
      console.log("Attempting to fetch fields using fileApi...")

      // Ensure we have a session
      if (!$session?.user?.id) {
        console.error("No authenticated user")
        throw new Error("Authentication required")
      }

      const result = await fileApi.loadFields()

      if (result.error) {
        console.error("Fields API error:", result.error)
        throw new Error(`Failed to fetch fields: ${result.error}`)
      }

      fields = result.fields || []
      mapFieldsStore.set(fields)
      console.log("Fields loaded successfully:", fields)
      return fields
    } catch (err) {
      console.error("Error loading fields:", err)
      error = err.message || "Failed to load fields"
      toast.error("Failed to load field data")
      throw err
    }
  }

  // Replace the loadObjectLocation function in your page component
  async function loadObjectLocation() {
    if (!browser || !data.type || !data.id) return null

    try {
      // Use the new client-side API
      const result = await locationApi.getLocation(data.type, data.id)

      if (!result.success) {
        console.error(`Error fetching ${data.type} location:`, result.error)
        toast.error(`Failed to load ${data.type} location`)
        return null
      }

      objectLocation = result.location
      initialLocation = objectLocation
      console.log(`Fetched ${data.type} location:`, objectLocation)
      return objectLocation
    } catch (err) {
      console.error(`Error fetching ${data.type} location:`, err)
      toast.error(`Failed to load ${data.type} location`)
      return null
    }
  }

  // Check session status - with more detailed logging
  $: if (browser) {
    if (!$session) {
      console.log("No session found, redirecting to login")
      goto("/login")
    } else {
      console.log("Session found:", $session.user?.email)
    }
  }

  onMount(async () => {
    console.log(
      "6. MapViewer Page Mount - selectedOperation:",
      selectedOperation,
    )
    console.log(
      "7. MapViewer Page Mount - store value:",
      $selectedOperationStore,
    )

    if (browser) {
      // First check session with enhanced logging
      if (!$session) {
        console.log("No session on mount, redirecting to login")
        goto("/login")
        return
      } else {
        console.log("Session available on mount:", {
          userId: $session.user?.id,
          hasToken: !!$session.access_token,
        })
      }

      loading = true

      try {
        // Load data in sequence to ensure clearer error messages
        await loadFields()
        await loadObjectLocation()
        loading = false
      } catch (err) {
        console.error("Error loading map data:", err)
        loading = false
      }

      // Set up device-specific features
      requestWakeLock()
      document.addEventListener("visibilitychange", handleVisibilityChange)
    }
  })

  onDestroy(() => {
    if (browser) {
      releaseWakeLock()
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  })

  function handleVisibilityChange() {
    if (browser) {
      if (document.visibilityState === "visible") {
        requestWakeLock()
      } else {
        releaseWakeLock()
      }
    }
  }

  function handleBackToDashboard() {
    if (browser) {
      releaseWakeLock()
    }
    goto("/account")
  }
</script>

{#if browser}
  {#if loading}
    <!-- Loading state -->
    <div
      class="fixed left-0 top-0 flex h-full w-full items-center justify-center"
    >
      <div class="flex flex-col items-center">
        <div class="skeleton mb-4 h-12 w-12 rounded-full"></div>

        <p class="mt-4 text-xl font-medium">Loading map data...</p>
      </div>
    </div>
  {:else if error}
    <!-- Error state -->
    <div
      class="fixed left-0 top-0 flex h-full w-full items-center justify-center"
    >
      <div class="max-w-md rounded-lg bg-red-50 p-6 text-center shadow-lg">
        <h2 class="text-2xl font-bold text-red-700">Error Loading Map</h2>
        <p class="mt-2 text-red-600">{error}</p>
        <div class="mt-6 flex justify-center space-x-4">
          <button
            class="rounded bg-primary px-4 py-2 text-white"
            on:click={() => window.location.reload()}
          >
            Try Again
          </button>
          <button
            class="rounded border border-gray-300 bg-white px-4 py-2 text-gray-700"
            on:click={handleBackToDashboard}
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  {:else}
    <!-- Map viewer -->
    <div class="fixed left-0 top-0 h-full w-full overflow-hidden">
      {#key selectedOperation}
        <MapViewer
          {handleBackToDashboard}
          {initialLocation}
          {selectedOperation}
        />
      {/key}
    </div>
  {/if}
{/if}
