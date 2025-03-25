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

  // Import necessary stores
  import { profileStore } from "$lib/stores/profileStore"
  import { subscriptionStore } from "$lib/stores/subscriptionStore"
  import { connectedMapStore } from "$lib/stores/connectedMapStore"
  import { mapActivityStore } from "$lib/stores/mapActivityStore"
  import {
    operationStore,
    selectedOperationStore,
  } from "$lib/stores/operationStore"

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
      const [profileResult, subscriptionResult] = await Promise.all([
        supabase.from("profiles").select(`*`).eq("id", userId).single(),
        supabase
          .from("user_subscriptions")
          .select("*")
          .eq("user_id", userId)
          .single(),
      ])

      const profile = profileResult.data
      const subscription = subscriptionResult.data

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

      // If user has no map connected, we're done
      if (!profile?.master_map_id) {
        return { profile, subscription, connected_map: null }
      }

      // Load map data if user has a connected map
      const [masterMapResult, mapActivityResult, operationsResult] =
        await Promise.all([
          supabase
            .from("master_maps")
            .select("*")
            .eq("id", profile.master_map_id)
            .single(),
          Promise.all([
            supabase
              .from("map_markers")
              .select("id", { count: "exact" })
              .eq("master_map_id", profile.master_map_id),
            supabase
              .from("trail_data")
              .select("id", { count: "exact" })
              .eq("master_map_id", profile.master_map_id),
            supabase
              .from("profiles")
              .select("id, full_name")
              .eq("master_map_id", profile.master_map_id),
          ]),
          supabase
            .from("operations")
            .select("*")
            .eq("master_map_id", profile.master_map_id),
        ])

      const masterMap = masterMapResult.data
      const [markerCount, trailCount, connectedProfiles] = mapActivityResult
      const operations = operationsResult.data

      console.log("Map data loaded:", masterMap?.id)

      if (!masterMap) {
        return { profile, subscription, connected_map: null }
      }

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
            connectedProfiles.data?.map((profile) => profile.id) || [],
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

      // Create map activity object
      const map_activity = {
        marker_count: markerCount.count || 0,
        trail_count: trailCount.count || 0,
        connected_profiles: connectedProfiles.data || [],
        vehicle_states: vehicleStatesResult.data || [],
      }

      const master_subscription = masterSubscriptionResult.data

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

      // Update map activity store
      mapActivityStore.set({
        marker_count: map_activity.marker_count,
        trail_count: map_activity.trail_count,
        connected_profiles: map_activity.connected_profiles,
        vehicle_states: map_activity.vehicle_states,
      })

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
      }
    } catch (e) {
      console.error("Error loading user data:", e)
      error = e
      return null
    }
  }

  async function checkOnboardingStatus(profile, connected_map, subscription) {
    if (!profile || !browser) return

    const onboarding = {
      select_role: "/account/select_role",
      join_map: "/account/join_map",
      onboard_manager: "/account/onboard_manager",
      payment_plans: "/account/payment_plans",
      user_survey: "/account/user_survey",
      select_plan: "/account/select_plan",
    }

    const isOnboardingPath = Object.values(onboarding).some(
      (path) =>
        $page.url.pathname === path || $page.url.pathname.startsWith(path),
    )

    // Skip billing routes and consider native users as already having a subscription
    if (isNative) {
      // If on a payment-related path, redirect to account
      if (
        $page.url.pathname.includes("/payment") ||
        $page.url.pathname.includes("/select_plan") ||
        $page.url.pathname === onboarding.payment_plans
      ) {
        goto("/account")
        return
      }
    }

    if (!isOnboardingPath) {
      if (!profile.role) {
        goto(onboarding.select_role)
        return
      }

      if (!profile.onboarded) {
        if (profile.role === "operator") {
          if (!connected_map) {
            goto(onboarding.join_map)
            return
          }
        } else if (profile.role === "manager") {
          if (!subscription && !isNative) {
            goto(onboarding.payment_plans)
            return
          }
          goto(onboarding.onboard_manager)
          return
        }
      }
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
    <div class="flex h-screen w-full items-center justify-center">
      <div class="flex flex-col items-center">
        <div
          class="h-16 w-16 animate-spin rounded-full border-4 border-primary border-t-transparent"
        ></div>
        <p class="mt-4 text-xl font-medium">Loading your account...</p>
      </div>
    </div>
  {:else if error}
    <div class="flex h-screen w-full items-center justify-center">
      <div class="max-w-md rounded-lg bg-red-50 p-6 text-center shadow-lg">
        <h2 class="text-2xl font-bold text-red-700">Error Loading Account</h2>
        <p class="mt-2 text-red-600">
          {error.message || "Unknown error occurred"}
        </p>
        <div class="mt-6 flex justify-center space-x-4">
          <button
            class="rounded bg-primary px-4 py-2 text-white"
            on:click={() => window.location.reload()}
          >
            Try Again
          </button>
          <a
            href="/login"
            class="rounded border border-gray-300 bg-white px-4 py-2 text-gray-700"
          >
            Back to Login
          </a>
        </div>
      </div>
    </div>
  {:else}
    <slot />
  {/if}
{/if}
