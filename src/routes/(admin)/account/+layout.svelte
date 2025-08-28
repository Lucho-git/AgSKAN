<script lang="ts">
  // routes/(admin)/account/+layout.svelte
  import { onMount, onDestroy } from "svelte"
  import { goto } from "$app/navigation"
  import {
    session,
    supabase,
    getPendingMapId,
    clearPendingMapId,
  } from "$lib/stores/sessionStore"
  import { browser } from "$app/environment"
  import { page } from "$app/stores"
  import { fly } from "svelte/transition"
  import { toast } from "svelte-sonner"
  import { Capacitor } from "@capacitor/core"
  import { Cloud, AlertCircle, RotateCcw, ArrowLeft } from "lucide-svelte"

  // Import necessary stores
  import { profileStore } from "$lib/stores/profileStore"
  import { subscriptionStore } from "$lib/stores/subscriptionStore"
  import { connectedMapStore } from "$lib/stores/connectedMapStore"
  import { mapActivityStore } from "$lib/stores/mapActivityStore"
  import {
    operationStore,
    selectedOperationStore,
  } from "$lib/stores/operationStore"
  import { userSettingsStore } from "$lib/stores/userSettingsStore"
  import { trailsMetaDataStore } from "$lib/stores/trailsMetaDataStore" // 🆕 NEW

  // Import map API
  import { mapApi } from "$lib/api/mapApi"

  // Accept data from load function
  export let data

  let loading =
    data.sessionStatus === "loading" || data.sessionStatus === "initializing"
  let error = data.error || null
  let redirecting = false
  let authStateUnsubscribe = null
  let userDataLoaded = false
  let pendingMapProcessed = false
  let isNative = false

  // Animation timing
  let operationStartTime = 0
  const MIN_ANIMATION_TIME = 1200 // 2 seconds minimum

  console.log("Account layout initializing")
  console.log("Current session status:", data.sessionStatus)
  console.log("Current session state:", $session)

  async function checkForPendingMap() {
    if (!browser || !$session?.user?.id || pendingMapProcessed) return false

    try {
      pendingMapProcessed = true
      const pendingMapId = getPendingMapId()

      if (!pendingMapId) return false

      console.log(`Found pending map ID: ${pendingMapId}`)

      // Connect to the map using existing API
      const result = await mapApi.connectToMap(pendingMapId)

      if (result.success) {
        console.log("Successfully connected to map:", result.data)

        // Update stores with the map data
        connectedMapStore.set(result.data.connectedMap)
        mapActivityStore.set(result.data.mapActivity)
        operationStore.set(result.data.operations || [])

        if (result.data.operation) {
          selectedOperationStore.set(result.data.operation)
        }

        // Clear the pending map ID from storage
        clearPendingMapId()

        // Show success message
        toast.success(`You've been connected to map: ${result.data.mapName}`)

        // Reload page to reflect changes
        window.location.reload()
        return true
      } else {
        console.error("Failed to connect to map:", result.message)
        toast.error(`Failed to connect to map: ${result.message}`)

        // Clear the pending map ID since it didn't work
        clearPendingMapId()

        return false
      }
    } catch (error) {
      console.error("Error processing pending map connection:", error)
      clearPendingMapId()
      return false
    }
  }

  async function loadUserData() {
    if (!$session?.user?.id) return null

    const userId = $session.user.id
    console.log("Loading user data for:", userId)

    // Check for pending maps first - allow this to work even if user has a map already
    if (browser && !pendingMapProcessed) {
      const mapSwitched = await checkForPendingMap()
      if (mapSwitched) {
        // If we switched maps, we'll reload the page, so no need to continue
        return { pendingMapProcessing: true }
      }
    }

    try {
      // Load profile data
      const [profileResult, subscriptionResult, user_settingsResult] =
        await Promise.all([
          supabase.from("profiles").select(`*`).eq("id", userId).single(),
          supabase
            .from("user_subscriptions")
            .select("*")
            .eq("user_id", userId)
            .single(),
          supabase
            .from("user_settings")
            .select("*")
            .eq("user_id", userId)
            .single(),
        ])

      const profile = profileResult.data
      const subscription = subscriptionResult.data
      const user_settings = user_settingsResult.data

      console.log("Profile loaded:", profile?.id)

      // Update profile store
      if (profile) {
        profileStore.set({
          id: profile.id,
          full_name: profile.full_name,
          email: profile.email,
          company_name: profile.company_name,
          website: profile.website,
          user_type: profile.role,
          master_map_id: profile.master_map_id,
          recent_maps: profile.recent_maps,
          selected_operation_id: profile.selected_operation_id,
          mobile: profile.mobile,
        })
      }

      // Update subscription store
      if (subscription) {
        subscriptionStore.set({
          subscription: subscription.subscription,
          marker_limit: subscription.marker_limit,
          trail_limit: subscription.trail_limit,
          lingering_seats: subscription.lingering_seats,
          current_seats: subscription.current_seats,
          next_billing_date: subscription.next_billing_date,
        })
      }

      // Update user settings store
      if (user_settings) {
        const currentDate = new Date()
        currentDate.setDate(
          currentDate.getDate() - user_settings.limit_markers_days,
        )

        userSettingsStore.set({
          limitMarkersOn: user_settings.limit_markers,
          limitMarkersDays: user_settings.limit_markers_days,
          limitMarkersDate: currentDate.toISOString(),
          backgroundGeolocationEnabled:
            user_settings.background_geolocation_enabled ?? false,
          zoomToLocationMarkers: user_settings.zoom_to_location_markers ?? true,
          zoomToPlacedMarkers: user_settings.zoom_to_placed_markers ?? true,
          satelliteDropdownEnabled:
            user_settings.satellite_dropdown_enabled ?? false,
          enabledImageryProviders:
            user_settings.enabled_imagery_providers ?? [],
          defaultImagerySource:
            user_settings.default_imagery_source ?? "mapbox",
        })
      } else {
        // If no user settings exist, use defaults
        userSettingsStore.set({
          limitMarkersOn: false,
          limitMarkersDays: 7,
          limitMarkersDate: new Date(
            Date.now() - 7 * 24 * 60 * 60 * 1000,
          ).toISOString(),
          backgroundGeolocationEnabled: false,
          zoomToLocationMarkers: true,
          zoomToPlacedMarkers: true,
          satelliteDropdownEnabled: false,
          enabledImageryProviders: [],
          defaultImagerySource: "mapbox",
        })
      }

      // If user has no map connected, we're done
      if (!profile?.master_map_id) {
        return { profile, subscription, connected_map: null, user_settings }
      }

      // 🆕 UPDATED: Load map data with trail hectares, field boundaries, and trail metadata
      const [masterMapResult, mapActivityResult, operationsResult] =
        await Promise.all([
          supabase
            .from("master_maps")
            .select("*")
            .eq("id", profile.master_map_id)
            .single(),
          Promise.all([
            // Map markers count
            supabase
              .from("map_markers")
              .select("id", { count: "exact" })
              .eq("master_map_id", profile.master_map_id),
            // Trail hectares via operations join (for summary data)
            supabase
              .from("trails")
              .select(
                `
                trail_hectares,
                operations!inner(master_map_id)
              `,
              )
              .eq("operations.master_map_id", profile.master_map_id),
            // 🆕 NEW: Detailed trail metadata (excluding heavy geometry)
            supabase
              .from("trails")
              .select(
                `
                id,
                vehicle_id,
                operation_id,
                start_time,
                end_time,
                trail_color,
                trail_width,
                trail_distance,
                trail_hectares,
                trail_hectares_overlap,
                trail_percentage_overlap,
                operations!inner(
                  id,
                  name,
                  year,
                  master_map_id
                )
              `,
              )
              .eq("operations.master_map_id", profile.master_map_id)
              .order("start_time", { ascending: false }), // Most recent first
            // Field boundaries count
            supabase
              .from("fields")
              .select("field_id", { count: "exact" })
              .eq("map_id", profile.master_map_id),
            // Enhanced profiles query with operation data
            supabase
              .from("profiles")
              .select(
                `
                id, 
                full_name, 
                selected_operation_id,
                operations!profiles_selected_operation_id_fkey (
                  id,
                  name,
                  description,
                  year
                )
              `,
              )
              .eq("master_map_id", profile.master_map_id),
          ]),
          supabase
            .from("operations")
            .select("*")
            .eq("master_map_id", profile.master_map_id),
        ])

      const masterMap = masterMapResult.data
      const [
        markerCount,
        trailHectaresResult,
        trailDetailsResult, // 🆕 NEW
        fieldCount,
        connectedProfilesResult,
      ] = mapActivityResult
      const operations = operationsResult.data

      console.log("Map data loaded:", masterMap?.id)

      if (!masterMap) {
        return { profile, subscription, connected_map: null, user_settings }
      }

      // Calculate total trail hectares (for summary)
      const totalTrailHectares =
        trailHectaresResult.data?.reduce((sum, trail) => {
          return sum + (parseFloat(trail.trail_hectares) || 0)
        }, 0) || 0

      // 🆕 NEW: Process trail details with operation info
      const trailsWithOperations =
        trailDetailsResult.data?.map((trail) => ({
          id: trail.id,
          vehicle_id: trail.vehicle_id,
          operation_id: trail.operation_id,
          start_time: trail.start_time,
          end_time: trail.end_time,
          trail_color: trail.trail_color || "white",
          trail_width: trail.trail_width,
          trail_distance: trail.trail_distance,
          trail_hectares: trail.trail_hectares,
          trail_hectares_overlap: trail.trail_hectares_overlap,
          trail_percentage_overlap: trail.trail_percentage_overlap,
          // Add operation info for easy display
          operation_name: trail.operations?.name || "Unknown Operation",
          operation_year: trail.operations?.year || new Date().getFullYear(),
        })) || []

      console.log("🆕 Trail hectares data:", trailHectaresResult.data)
      console.log("🆕 Total trail hectares:", totalTrailHectares)
      console.log("🆕 Trail details:", trailsWithOperations)
      console.log("🆕 Field count:", fieldCount.count)

      // Process connected profiles with operation data
      const connectedProfiles = connectedProfilesResult.data || []

      // Create enhanced connected profiles with operation info
      const connectedProfilesWithOperations = connectedProfiles.map(
        (profile) => ({
          id: profile.id,
          full_name: profile.full_name,
          selected_operation_id: profile.selected_operation_id,
          current_operation: profile.operations
            ? {
                id: profile.operations.id,
                name: profile.operations.name,
                description: profile.operations.description,
                year: profile.operations.year,
              }
            : null,
          // For backward compatibility and easy access
          operation_name: profile.operations?.name || "No operation",
          operation_id: profile.operations?.id || null,
        }),
      )

      console.log(
        "🔍 Connected profiles with operations:",
        connectedProfilesWithOperations,
      )

      // Load additional map-related data
      const [
        ownerProfileResult,
        masterSubscriptionResult,
        vehicleStatesResult,
      ] = await Promise.all([
        supabase
          .from("profiles")
          .select("full_name")
          .eq("id", masterMap.master_user_id)
          .single(),
        supabase
          .from("user_subscriptions")
          .select("*")
          .eq("user_id", masterMap.master_user_id)
          .single(),
        supabase
          .from("vehicle_state")
          .select("*")
          .eq("master_map_id", profile.master_map_id)
          .in(
            "vehicle_id",
            connectedProfilesWithOperations.map((profile) => profile.id) || [],
          ),
      ])

      // Create connected map object
      const connected_map = {
        id: masterMap.id,
        map_name: masterMap.map_name,
        master_user_id: masterMap.master_user_id,
        owner: ownerProfileResult.data?.full_name || "Unknown",
        is_owner: userId === masterMap.master_user_id,
      }

      // Create map activity object with metrics
      const map_activity = {
        marker_count: markerCount.count || 0,
        trail_hectares: totalTrailHectares,
        field_count: fieldCount.count || 0,
        connected_profiles: connectedProfilesWithOperations,
        vehicle_states: vehicleStatesResult.data || [],
      }

      const master_subscription = masterSubscriptionResult.data

      console.log("🔍 Map activity with new metrics:", map_activity)

      // Update connected map store
      connectedMapStore.set({
        id: connected_map.id,
        map_name: connected_map.map_name,
        master_user_id: connected_map.master_user_id,
        owner: connected_map.owner,
        is_owner: connected_map.is_owner,
        masterSubscription: master_subscription || null,
        is_connected: true,
      })

      // Update map activity store with metrics
      mapActivityStore.set({
        marker_count: map_activity.marker_count,
        trail_hectares: map_activity.trail_hectares,
        field_count: map_activity.field_count,
        connected_profiles: map_activity.connected_profiles,
        vehicle_states: map_activity.vehicle_states,
      })

      // 🆕 NEW: Update trails metadata store
      trailsMetaDataStore.set(trailsWithOperations)

      // Update operations stores
      if (operations?.length) {
        operationStore.set(operations)

        const selectedOp = operations.find(
          (op) => op.id === profile.selected_operation_id,
        )
        if (selectedOp) {
          selectedOperationStore.set(selectedOp)
        }
      }

      return {
        profile,
        subscription,
        connected_map,
        map_activity,
        master_subscription,
        operations,
        trails_metadata: trailsWithOperations, // 🆕 NEW
        user_settings,
      }
    } catch (e) {
      console.error("Error loading user data:", e)
      error = e
      return null
    }
  }

  async function checkOnboardingStatus(profile, connected_map, subscription) {
    if (!profile || !browser) return

    // Check if user is currently on any onboarding route
    const isOnboardingPath = $page.url.pathname.startsWith(
      "/account/onboarding",
    )

    // Skip billing routes and consider native users as already having a subscription
    if (isNative) {
      // If on a payment-related path, redirect to account
      if (
        $page.url.pathname.includes("/payment") ||
        $page.url.pathname.includes("/select_plan")
      ) {
        goto("/account")
        return
      }
    }

    // If not on an onboarding route and user is not onboarded, send to onboarding
    if (!isOnboardingPath && !profile.onboarded) {
      goto("/account/onboarding")
      return
    }
  }

  function handleAuthStateChange(event, newSession) {
    console.log("Auth State Change:", {
      event,
      hasSession: !!newSession,
      userId: newSession?.user?.id,
    })

    // When signed out, just redirect to login without showing session expired message
    if (event === "SIGNED_OUT" && !redirecting) {
      redirecting = true
      goto("/login")
    }
  }

  // Complete data loading after session is ready
  async function completeDataLoading() {
    // Start timing for minimum animation duration
    operationStartTime = Date.now()

    try {
      if (!$session?.user?.id) {
        console.log("No valid session, redirecting to login")
        redirecting = true
        goto("/login")
        return
      }

      // Load all user data
      const userData = await loadUserData()
      userDataLoaded = true

      console.log("Loaded User Data:", userData)

      // Calculate elapsed time and ensure minimum animation time
      const elapsedTime = Date.now() - operationStartTime
      const remainingTime = Math.max(0, MIN_ANIMATION_TIME - elapsedTime)

      if (remainingTime > 0) {
        await new Promise((resolve) => setTimeout(resolve, remainingTime))
      }

      // If we're processing a pending map, stop here as we'll reload
      if (userData && userData.pendingMapProcessing) {
        return
      }

      // Check onboarding status and redirect if needed
      if (userData) {
        await checkOnboardingStatus(
          userData.profile,
          userData.connected_map,
          userData.subscription,
        )
      }

      console.log("Data loading complete")
    } catch (e) {
      console.error("Data loading error:", e)
      error = e
    } finally {
      loading = false
    }
  }

  // Process the session promise from the load function
  async function processSessionPromise() {
    if (data.sessionPromise) {
      try {
        const sessionData = await data.sessionPromise

        if (!sessionData.isAuthenticated) {
          console.log("Session not authenticated, redirecting to login")
          redirecting = true
          goto("/login")
          return
        }

        // Continue with data loading once session is ready
        await completeDataLoading()
      } catch (e) {
        console.error("Error processing session:", e)
        error = e
        loading = false
      }
    } else if (data.sessionStatus === "error") {
      // Already have error from load function
      loading = false
    }
  }

  // Initialize the component
  onMount(() => {
    console.log("Account layout mounted")

    // Check if running in Capacitor native environment
    if (browser) {
      try {
        isNative = Capacitor.isNativePlatform()
        console.log("Running in native environment:", isNative)
      } catch (error) {
        console.error("Error checking native platform:", error)
        isNative = false
      }
    }

    // Process session if we have a promise
    if (data.sessionPromise) {
      processSessionPromise()
    }
    // If no promise but session exists, complete data loading
    else if ($session?.user?.id) {
      completeDataLoading()
    }
    // No session, no promise - redirect
    else if (!loading) {
      redirecting = true
      goto("/login")
    }

    // Set up auth state subscription
    const { data: authSubscription } = supabase.auth.onAuthStateChange(
      handleAuthStateChange,
    )
    authStateUnsubscribe = authSubscription.subscription.unsubscribe

    return () => {
      console.log("Account layout unmounting")
      if (authStateUnsubscribe) {
        authStateUnsubscribe()
      }
    }
  })

  // Handle route navigation for native apps
  $: if (browser && isNative && $page) {
    // Check if we're on a billing route and redirect if necessary
    const currentPath = $page.url.pathname
    const isBillingRoute =
      currentPath.includes("/payment") ||
      currentPath.includes("/select_plan") ||
      currentPath === "/account/payment_plans"

    if (isBillingRoute) {
      console.log("Skipping billing route in native app:", currentPath)
      goto("/account")
    }
  }
</script>

{#if browser}
  {#if loading}
    <!-- Loading State with Spinning Cloud Animation -->
    <div class="flex h-screen w-full items-center justify-center bg-base-100">
      <div class="flex flex-col items-center gap-6">
        <div
          class="relative flex h-16 w-16 items-center justify-center rounded-full bg-blue-500/20"
        >
          <div
            class="animate-account-layout-spin absolute inset-0 rounded-full border-2 border-blue-400/30 border-t-blue-400"
          ></div>
          <Cloud size={32} class="animate-account-layout-pulse text-blue-400" />
        </div>
        <div class="text-center">
          <h2 class="text-xl font-medium text-contrast-content">
            Loading your account...
          </h2>
          <p class="mt-2 text-sm text-contrast-content/60">
            Please wait while we set up your dashboard
          </p>
        </div>
      </div>
    </div>
  {:else if error}
    <!-- Error State -->
    <div class="flex h-screen w-full items-center justify-center bg-base-100">
      <div
        class="mx-4 max-w-md rounded-2xl border border-red-200 bg-red-50 p-8 shadow-xl"
      >
        <div class="text-center">
          <div
            class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100"
          >
            <AlertCircle class="h-8 w-8 text-red-600" />
          </div>
          <h2 class="mb-2 text-xl font-bold text-red-900">
            Error Loading Account
          </h2>
          <p class="mb-6 text-red-700">
            {error.message || "Unknown error occurred"}
          </p>
          <div class="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <button
              class="flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 font-medium text-white transition-colors hover:bg-red-700"
              on:click={() => window.location.reload()}
            >
              <RotateCcw class="h-4 w-4" />
              Try Again
            </button>
            <a
              href="/login"
              class="flex items-center justify-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2.5 font-medium text-red-700 transition-colors hover:bg-red-50"
            >
              <ArrowLeft class="h-4 w-4" />
              Back to Login
            </a>
          </div>
        </div>
      </div>
    </div>
  {:else}
    <slot />
  {/if}
{/if}

<style>
  @keyframes account-layout-spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  .animate-account-layout-spin {
    animation: account-layout-spin 1s linear infinite;
  }

  @keyframes account-layout-pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  .animate-account-layout-pulse {
    animation: account-layout-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }
</style>
