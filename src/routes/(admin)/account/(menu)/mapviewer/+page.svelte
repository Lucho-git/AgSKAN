<!--src\routes\(admin)\account\(menu)\mapviewer\+page.svelte-->
<script lang="ts">
  import { getContext, onMount, onDestroy } from "svelte"
  import type { Writable } from "svelte/store"
  import { goto } from "$app/navigation"
  import { toast } from "svelte-sonner"
  import { browser } from "$app/environment"
  import MapViewer from "$lib/components/map/MapViewer.svelte"
  import type { PageData } from "./$types"
  import { selectedOperationStore } from "$lib/stores/operationStore"
  import { mapFieldsStore } from "$lib/stores/mapFieldsStore"
  import { farmsStore } from "$lib/stores/farmsStore"
  import { connectedMapStore } from "$lib/stores/connectedMapStore"
  import { session } from "$lib/stores/sessionStore"
  import { fileApi } from "$lib/api/fileApi" // Import the fileApi
  import { farmApi } from "$lib/api/farmApi"
  import { profileStore } from "$lib/stores/profileStore"
  import GuestMapBar from "$lib/components/map/GuestMapBar.svelte"
  import {
    classifyLoadError,
    type LoadFailure,
  } from "$lib/utils/networkErrors"
  import {
    networkStore,
    refreshNetworkNow,
  } from "$lib/stores/networkStore"

  import { locationApi } from "$lib/api/locationApi" // Import the locationApi
  export let data: PageData

  // Client-side state
  let loading = true
  let error = null
  let loadFailure: LoadFailure | null = null
  let fields = []
  let objectLocation = null
  let initialLocation = null

  let adminSection: Writable<string> = getContext("adminSection")
  adminSection.set("mapviewer")

  let wakeLock: WakeLockSentinel | null = null

  let selectedOperation = $selectedOperationStore

  selectedOperationStore.subscribe((value) => {
    selectedOperation = value
  })

  // Guest / view-only sessions get the simplified map shell.
  $: isGuest = $profileStore?.user_type === "viewer"

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

      const mapId = $connectedMapStore?.id || fields[0]?.map_id
      if (mapId) {
        const farmsResult = await farmApi.loadFarms(mapId)
        if (!farmsResult.error) {
          farmsStore.set(farmsResult.farms)
        }
      }

      return fields
    } catch (err) {
      console.error("Error loading fields:", err)
      loadFailure = classifyLoadError(err, {
        browserOnline: $networkStore.browserOnline,
      })
      error = loadFailure.detail || "Failed to load fields"
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

  $: if (browser) {
    if (!$session) {
      goto("/login")
    }
  }

  onMount(async () => {
    if (browser) {
      if (!$session) {
        goto("/login")
        return
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
      window.addEventListener("online", handleBackOnline)
    }
  })

  onDestroy(() => {
    if (browser) {
      releaseWakeLock()
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      window.removeEventListener("online", handleBackOnline)
    }
  })

  // A map that couldn't load because the device has no signal should come
  // back by itself rather than waiting for the user to notice.
  function handleBackOnline() {
    if (loadFailure && browser) window.location.reload()
  }

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
    // Guests don't have a dashboard — they get their own guest home.
    if (isGuest) {
      goto("/guest/home")
      return
    }
    goto("/account")
  }

  let retrying = false

  async function handleRetry() {
    if (retrying) return
    retrying = true
    try {
      const state = await refreshNetworkNow(true)
      if (state.status === "online") {
        window.location.reload()
        return
      }
      toast.error(
        state.status === "offline"
          ? "Still offline — reconnect and we'll load the map automatically."
          : "Still can't reach AgSKAN. We'll keep trying.",
      )
    } finally {
      retrying = false
    }
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
      <div
        class="max-w-md rounded-lg p-6 text-center shadow-lg"
        class:bg-amber-50={loadFailure?.kind === "offline" ||
          loadFailure?.kind === "timeout"}
        class:bg-red-50={loadFailure?.kind !== "offline" &&
          loadFailure?.kind !== "timeout"}
      >
        {#if loadFailure?.kind === "offline" || loadFailure?.kind === "timeout"}
          <h2 class="text-2xl font-bold text-amber-800">
            {loadFailure.title}
          </h2>
          <p class="mt-2 text-amber-700">{loadFailure.detail}</p>
          <p class="mt-3 text-sm text-amber-700/80">
            We'll load the map automatically as soon as you're back online.
          </p>
        {:else}
          <h2 class="text-2xl font-bold text-red-700">
            {loadFailure?.title ?? "Error Loading Map"}
          </h2>
          <p class="mt-2 text-red-600">{loadFailure?.detail ?? error}</p>
        {/if}
        <div class="mt-6 flex justify-center space-x-4">
          <button
            class="rounded bg-primary px-4 py-2 text-white disabled:opacity-60"
            on:click={handleRetry}
            disabled={retrying}
          >
            {retrying ? "Checking..." : "Try Again"}
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
          viewerMode={isGuest}
        />
      {/key}
    </div>

    {#if isGuest}
      <GuestMapBar />
    {/if}
  {/if}
{/if}
