<script lang="ts">
  // routes/(admin)/account/+layout.svelte
  import { onMount, onDestroy } from "svelte"
  import { get } from "svelte/store"
  import { goto } from "$app/navigation"
  import {
    session,
    supabase,
    getPendingMapId,
    clearPendingMapId,
  } from "$lib/stores/sessionStore"
  import { browser } from "$app/environment"
  import { page } from "$app/stores"
  import { fly, fade } from "svelte/transition"
  import { toast } from "svelte-sonner"
  import { Capacitor } from "@capacitor/core"
  import {
    Cloud,
    AlertCircle,
    RotateCcw,
    ArrowLeft,
    WifiOff,
    Loader2,
  } from "lucide-svelte"

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
  import { TINT_MODE_DEFAULT } from "$lib/components/map/markers/markerPalette"
  import { layerVisibilityStore } from "$lib/stores/layerVisibilityStore"
  import { resolveDefaultMarkerPreference } from "$lib/utils/defaultMarkerPreference"
  import { trailsMetaDataStore } from "$lib/stores/trailsMetaDataStore" // 🆕 NEW
  import { resetMapStores } from "$lib/stores/resetMapStores"
  import { operatorApi } from "$lib/api/operatorApi"
  import { operatorStore } from "$lib/stores/operatorStore"
  import OperatorPicker from "$lib/components/map/trails/OperatorPicker.svelte"
  import {
    classifyLoadError,
    describeLoadError,
    isRetryableFailure,
    type LoadFailure,
  } from "$lib/utils/networkErrors"
  import {
    networkStore,
    refreshNetworkNow,
  } from "$lib/stores/networkStore"
  import {
    registerDomainRetry,
    reportOk,
    reportResult,
    unregisterDomainRetry,
    type DataDomain,
  } from "$lib/stores/dataStatusStore"
  import {
    createSubscriptionIfNeeded,
    createUserSettingsIfNeeded,
  } from "$lib/helpers/authHelpers"

  // Native push (OneSignal) — links this device to the signed-in user
  import { initNativePush, syncNativePushUser } from "$lib/nativePush"

  // Import map API
  import { mapApi } from "$lib/api/mapApi"

  // Accept data from load function
  export let data

  let loading =
    data.sessionStatus === "loading" || data.sessionStatus === "initializing"
  let error = data.error || null
  let redirecting = false

  // Set when the identity queries fail for a reason we can act on. Kept
  // separate from `error` (thrown exceptions) so the UI can tell "we couldn't
  // reach the server" apart from "this account genuinely has no map".
  let loadFailure: LoadFailure | null = null
  /** Outcome of the load attempt currently running (not shown until it ends). */
  let attemptFailure: LoadFailure | null = null
  let retrying = false
  let autoRetryCount = 0
  /** @type {ReturnType<typeof setTimeout> | null} */
  let retryTimer = null
  let lastFailureDetail = ""

  const MAX_AUTO_RETRIES = 8

  let authStateUnsubscribe = null
  let showMapLoadOperatorPicker = false
  let operatorRealtimeChannel = null
  let visibilityListenerSet = false
  let userDataLoaded = false
  let pendingMapProcessed = false
  let isNative = false

  // Animation timing
  let operationStartTime = 0
  const MIN_ANIMATION_TIME = 1200

  async function checkForPendingMap() {
    if (!browser || !$session?.user?.id || pendingMapProcessed) return false

    try {
      pendingMapProcessed = true
      const pendingMapId = getPendingMapId()

      if (!pendingMapId) return false

      console.log(`Found pending map ID: ${pendingMapId}`)

      // Clear stale map data before connecting
      resetMapStores()

      // Connect to the map using existing API
      const result = await mapApi.connectToMap(pendingMapId)

      if (result.success) {
        console.log("Successfully connected to map:", result.data)

        // Update stores with the map data
        connectedMapStore.set(result.data.connectedMap)
        mapActivityStore.set(result.data.mapActivity)

        // Clear the pending map ID from storage
        clearPendingMapId()

        // Flag for join animation on the dashboard
        if (browser) {
          sessionStorage.setItem(
            "show_join_animation",
            result.data.mapName || result.data.connectedMap?.map_name || "",
          )
        }

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

    // Check for pending maps first
    if (browser && !pendingMapProcessed) {
      await checkForPendingMap()
    }

    try {
      // Load profile data
      const [profileResult, subscriptionResult, user_settingsResult] =
        await Promise.all([
          supabase.from("profiles").select(`*`).eq("id", userId).single(),
          // maybeSingle on purpose: these rows are created by the client (there
          // is no DB trigger), so a brand-new account legitimately has none yet.
          // `.single()` turns "no rows" into a PGRST116 *error*, which the data
          // status store reported as a dropped connection — the banner then
          // claimed the plan and settings "didn't arrive" on a perfectly good
          // connection, and the missing subscription left the sidebar profile
          // block stuck on its placeholder.
          supabase
            .from("user_subscriptions")
            .select("*")
            .eq("user_id", userId)
            .maybeSingle(),
          supabase
            .from("user_settings")
            .select("*")
            .eq("user_id", userId)
            .maybeSingle(),
        ])

      const profile = profileResult.data
      let subscription = subscriptionResult.data
      let user_settings = user_settingsResult.data

      const netOpts = { browserOnline: $networkStore.browserOnline }

      // A transport failure is NOT "you have no map". Supabase resolves with
      // `{ data: null, error }` rather than throwing, so without this check a
      // dropped connection used to fall through to `!profile?.master_map_id`,
      // wipe the connected-map store and render the Create/Join Map screen.
      if (profileResult.error) {
        attemptFailure = classifyLoadError(profileResult.error, netOpts)
        lastFailureDetail = describeLoadError(profileResult.error)
        console.warn("[account] profile load failed:", lastFailureDetail)
        return null
      }
      reportOk("profile")

      // These are not fatal — the dashboard still renders — but silently
      // dropping them is what made a half-loaded account look healthy.
      reportResult("subscription", subscriptionResult.error, netOpts)
      reportResult("settings", user_settingsResult.error, netOpts)

      // A row that simply doesn't exist yet is not a load failure: provision it
      // and read it back, so new accounts show real values immediately instead
      // of waiting for the next page load. Both helpers are idempotent.
      if (!subscription && !subscriptionResult.error) {
        await createSubscriptionIfNeeded(userId)
        subscription = (
          await supabase
            .from("user_subscriptions")
            .select("*")
            .eq("user_id", userId)
            .maybeSingle()
        ).data
      }

      if (!user_settings && !user_settingsResult.error) {
        await createUserSettingsIfNeeded(userId)
        user_settings = (
          await supabase
            .from("user_settings")
            .select("*")
            .eq("user_id", userId)
            .maybeSingle()
        ).data
      }

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

        // Guest accounts (anonymous viewer sessions) live on the map only —
        // every other account route bounces straight back to it.
        if (
          profile.role === "viewer" &&
          profile.onboarded &&
          ($session?.user as any)?.is_anonymous &&
          browser &&
          !window.location.pathname.startsWith("/account/mapviewer")
        ) {
          goto("/account/mapviewer")
        }
      }

      // Update subscription store
      if (subscription) {
        subscriptionStore.set({
          subscription: subscription.subscription,
          subscription_status: subscription.subscription_status,
          stripe_subscription_id: subscription.stripe_subscription_id,
          marker_limit: subscription.marker_limit,
          trail_limit: subscription.trail_limit,
          lingering_seats: subscription.lingering_seats,
          current_seats: subscription.current_seats,
          next_billing_date: subscription.next_billing_date,
        })
      } else if (!subscriptionResult.error) {
        // The row is absent and couldn't be created (offline, or a temporary
        // permissions problem). Carry on with the free-plan defaults instead of
        // leaving the store empty — an empty store keeps the sidebar profile
        // block on its skeleton for the rest of the session.
        subscriptionStore.set({
          subscription: "FREE",
          subscription_status: "active",
          stripe_subscription_id: null,
          marker_limit: 100,
          trail_limit: 100000,
          lingering_seats: 0,
          current_seats: 1,
          next_billing_date: null,
        })
      }

      // Update user settings store
      if (user_settings) {
        const currentSettings = get(userSettingsStore)

        userSettingsStore.set({
          markerStyle: user_settings.marker_style ?? TINT_MODE_DEFAULT,
          markerDefaultColorMode:
            user_settings.marker_default_color_mode ?? "single",
          markerDefaultColor: user_settings.marker_default_color ?? "default",
          markerTypeDefaultColors:
            user_settings.marker_type_default_colors ?? {},
          markerUsageCounts: user_settings.marker_usage_counts ?? {},
          markerUsageOrder: user_settings.marker_usage_order ?? [],
          iconGlassOpacity: user_settings.icon_glass_opacity ?? 0.3,
          zoomToLocationMarkers:
            user_settings.zoom_to_location_markers ?? false,
          zoomToPlacedMarkers: user_settings.zoom_to_placed_markers ?? false,
          autoConfirmMarkers: user_settings.auto_confirm_markers ?? false,
          showVehiclesAlways: user_settings.show_vehicles_always ?? true,
          satelliteDropdownEnabled:
            user_settings.satellite_dropdown_enabled ?? false,
          enabledImageryProviders:
            user_settings.enabled_imagery_providers ?? [],
          defaultImagerySource:
            user_settings.default_imagery_source ?? "mapbox",
          defaultMarker:
            user_settings.default_marker ??
            resolveDefaultMarkerPreference(currentSettings.defaultMarker),
          extraMarkers: user_settings.extra_markers ?? [],
          devToolsEnabled: user_settings.dev_tools_enabled ?? false,
          isAdmin: user_settings.is_admin ?? false,
          // New GPS settings
          enableFull1Hz: user_settings.enable_full_1hz ?? false,
          showGpsPopups: user_settings.show_gps_popups ?? false,
          gpsIntervalSeconds: user_settings.gps_interval_seconds ?? 2,
          showGpsAcceptedPopups:
            user_settings.show_gps_accepted_popups ?? false,
          showGpsRejectedPopups:
            user_settings.show_gps_rejected_popups ?? false,
          layerVisibility: user_settings.layer_visibility ?? {},
          sprayConfirmEnabled: user_settings.spray_confirm_enabled ?? true,
          autoTrailEnabled: user_settings.auto_trail_enabled ?? false,
          roadOverlaysEnabled: user_settings.road_overlays_enabled ?? false,
          satelliteMenuEnabled: user_settings.satellite_menu_enabled ?? true,
          measureMenuEnabled: user_settings.measure_menu_enabled ?? true,
          flashMenuEnabled: user_settings.flash_menu_enabled ?? true,
          rockPickingMenuEnabled:
            user_settings.rock_picking_menu_enabled ?? true,
          weatherMenuEnabled: user_settings.weather_menu_enabled ?? true,
          weatherSource: user_settings.weather_source ?? null,
          chaserRailVisibility: user_settings.chaser_rail_visibility ?? {},
        })

        layerVisibilityStore.applySavedState(
          user_settings.layer_visibility ?? {},
        )
      } else {
        // If no user settings exist, use defaults
        userSettingsStore.set({
          markerStyle: TINT_MODE_DEFAULT,
          markerDefaultColorMode: "single",
          markerDefaultColor: "default",
          markerTypeDefaultColors: {},
          markerUsageCounts: {},
          markerUsageOrder: [],
          iconGlassOpacity: 0.3,
          zoomToLocationMarkers: false,
          zoomToPlacedMarkers: false,
          autoConfirmMarkers: false,
          showVehiclesAlways: true,
          satelliteDropdownEnabled: false,
          enabledImageryProviders: [],
          defaultImagerySource: "mapbox",
          defaultMarker: {
            id: "default",
            class: "default",
            name: "Default Marker",
          },
          extraMarkers: [],
          devToolsEnabled: false,
          isAdmin: false,
          // New GPS defaults
          enableFull1Hz: false,
          showGpsPopups: false,
          gpsIntervalSeconds: 2,
          showGpsAcceptedPopups: false,
          showGpsRejectedPopups: false,
          layerVisibility: {},
          roadOverlaysEnabled: false,
          satelliteMenuEnabled: true,
          measureMenuEnabled: true,
          flashMenuEnabled: true,
          rockPickingMenuEnabled: true,
          weatherMenuEnabled: true,
          weatherSource: null,
          chaserRailVisibility: {},
        })

        layerVisibilityStore.reset()
      }

      // If user has no map connected, we're done. Clear the map-scoped
      // stores first: they are module-level singletons, so after an account
      // switch in the same tab (guest signs up, sign out then sign in as
      // someone else) they still hold the PREVIOUS account's map — which
      // made onboarding "join" flows silently attach the new account to it.
      if (!profile?.master_map_id) {
        resetMapStores()
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
              .eq("operations.master_map_id", profile.master_map_id)
              .neq("source", "auto_travel"),
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
                operator_name,
                vehicle_marker,
                operations!inner(
                  id,
                  name,
                  year,
                  master_map_id
                )
              `,
              )
              .eq("operations.master_map_id", profile.master_map_id)
              .neq("source", "auto_travel")
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
                map_role,
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
            .eq("master_map_id", profile.master_map_id)
            .order("year", { ascending: false })
            .order("created_at", { ascending: false }),
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

      // Same trap as the profile query: a failed master_maps fetch leaves
      // `data` null, and the old code then reported "no connected map".
      if (masterMapResult.error) {
        attemptFailure = classifyLoadError(masterMapResult.error, {
          browserOnline: $networkStore.browserOnline,
        })
        lastFailureDetail = describeLoadError(masterMapResult.error)
        console.warn("[account] map load failed:", lastFailureDetail)
        return null
      }
      reportOk("map")

      // Non-fatal, but each one silently degrades a visible part of the
      // dashboard if it drops: no operations means the map can't pick one and
      // trails never sync; no totals means zeroed stats; no team query means
      // an empty member list.
      reportResult("operations", operationsResult.error, {
        browserOnline: $networkStore.browserOnline,
      })
      reportResult(
        "stats",
        markerCount.error ??
          trailHectaresResult.error ??
          trailDetailsResult.error ??
          fieldCount.error,
        { browserOnline: $networkStore.browserOnline },
      )

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

      // Process connected profiles with operation data
      const connectedProfiles = connectedProfilesResult.data || []

      // Create enhanced connected profiles with operation info
      const connectedProfilesWithOperations = connectedProfiles.map(
        (profile) => ({
          id: profile.id,
          full_name: profile.full_name,
          selected_operation_id: profile.selected_operation_id,
          map_role: profile.map_role || null,
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

      // Team members need BOTH the profile rows and their vehicle state — the
      // vehicle icons and online dots come from vehicle_states, which is
      // exactly what went missing in the half-loaded dashboard.
      reportResult(
        "team",
        connectedProfilesResult.error ?? vehicleStatesResult.error,
        { browserOnline: $networkStore.browserOnline },
      )

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

      // Update connected map store
      connectedMapStore.set({
        id: connected_map.id,
        map_name: connected_map.map_name,
        master_user_id: connected_map.master_user_id,
        owner: connected_map.owner,
        is_owner: connected_map.is_owner,
        masterSubscription: master_subscription || null,
        is_connected: true,
        join_code: masterMap.join_code || null,
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

      // Update operations stores (always set, even if empty)
      operationStore.set(operations?.length ? [...operations] : [])
      if (operations?.length) {
        const selectedOp = operations.find(
          (op) => op.id === profile.selected_operation_id,
        )
        if (selectedOp) {
          selectedOperationStore.set(selectedOp)
        } else {
          selectedOperationStore.set(operations[0])
        }
      } else {
        selectedOperationStore.set(null)
      }

      // 🆕 Check operator status for this map
      if (profile.master_map_id) {
        // Update operator store — does NOT force picker on map load.
        // Users are prompted when they press trail start or get realtime-kicked.
        await operatorApi.checkOperatorStatus(profile.master_map_id)
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
    // When signed out, show loading before redirecting to avoid flash of content
    if (event === "SIGNED_OUT" && !redirecting) {
      // If the sign-out page is performing a hard reload, let it own the redirect
      // and keep showing its own animation — don't swap in the account loading screen.
      if (browser && sessionStorage.getItem("signout_in_progress")) {
        return
      }
      redirecting = true
      loading = true
      error = null
      goto("/login")
      return
    }

    // Block stale SIGNED_IN / TOKEN_REFRESHED while a sign-out is in progress
    if (
      (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") &&
      browser &&
      sessionStorage.getItem("signout_in_progress")
    ) {
      return
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
      attemptFailure = null
      const userData = await loadUserData()

      // A classified failure means "we don't know", not "there's nothing".
      // Skip the onboarding redirect and the animation delay, and let the
      // retry loop take over.
      if (attemptFailure) {
        loadFailure = attemptFailure
        if (isRetryableFailure(loadFailure)) scheduleAutoRetry()
        return
      }

      // Only now is it safe to drop the failure screen — retries keep it up
      // (with a "retrying" state) so the empty dashboard never flashes.
      loadFailure = null
      userDataLoaded = true
      autoRetryCount = 0

      // Calculate elapsed time and ensure minimum animation time
      const elapsedTime = Date.now() - operationStartTime
      const remainingTime = Math.max(0, MIN_ANIMATION_TIME - elapsedTime)

      if (remainingTime > 0) {
        await new Promise((resolve) => setTimeout(resolve, remainingTime))
      }

      // Check onboarding status and redirect if needed
      if (userData) {
        await checkOnboardingStatus(
          userData.profile,
          userData.connected_map,
          userData.subscription,
        )
      }
    } catch (e) {
      console.error("Data loading error:", e)
      error = e
    } finally {
      loading = false
    }
  }

  // ── Recovery from a bad load ───────────────────────────────────────────
  // Everything here is bounded: a capped number of automatic attempts with
  // exponential backoff, plus an immediate attempt whenever the device
  // reports it is back online or the tab regains focus.

  function scheduleAutoRetry() {
    if (retryTimer || autoRetryCount >= MAX_AUTO_RETRIES) return

    const delay = Math.min(30_000, 2_000 * 2 ** autoRetryCount)
    retryTimer = setTimeout(() => {
      retryTimer = null
      autoRetryCount += 1
      void retryLoad(false)
    }, delay)
  }

  function cancelAutoRetry() {
    if (retryTimer) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
  }

  /**
   * @param showLoading Show the full-screen loader (manual retry). Automatic
   *   retries keep the failure panel up instead of flashing the half-built
   *   dashboard.
   */
  async function retryLoad(showLoading = true) {
    if (retrying) return
    cancelAutoRetry()

    retrying = true
    error = null
    if (showLoading) loading = true

    try {
      await refreshNetworkNow(true)
      await completeDataLoading()
    } catch (e) {
      console.error("[account] retry failed:", e)
    } finally {
      retrying = false
    }
  }

  function handleBackOnline() {
    console.log("[account] back online, retrying load")
    autoRetryCount = 0
    if (loadFailure) void retryLoad(false)
  }

  function handleRetryVisibility() {
    if (document.visibilityState === "visible" && loadFailure) {
      void refreshNetworkNow().then((state) => {
        if (state.status === "online") {
          autoRetryCount = 0
          void retryLoad(false)
        }
      })
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

  // ── Native push (OneSignal) — keep this device linked to the signed-in user ──
  $: if (browser && isNative) {
    void syncNativePushUser($session?.user?.id ?? null)
  }

  // Initialize the component
  onMount(() => {
    if (browser) {
      try {
        isNative = Capacitor.isNativePlatform()
      } catch (error) {
        isNative = false
      }
    }

    if (isNative) {
      // Initialise on this route too (idempotent) in case the root layout
      // call was skipped or this area is entered directly.
      void initNativePush()
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

    // Recover automatically once the device is usable again.
    window.addEventListener("online", handleBackOnline)
    document.addEventListener("visibilitychange", handleRetryVisibility)

    // Every account-level domain recovers by re-running the load in place —
    // no page reload, so whatever is already on screen stays put.
    const accountDomains: DataDomain[] = [
      "profile",
      "subscription",
      "settings",
      "map",
      "operations",
      "team",
      "stats",
    ]
    for (const domain of accountDomains) {
      registerDomainRetry(domain, () => retryLoad(false))
    }

    return () => {
      console.log("Account layout unmounting")
      if (authStateUnsubscribe) authStateUnsubscribe()
      if (operatorRealtimeChannel)
        supabase.removeChannel(operatorRealtimeChannel)
      window.removeEventListener("online", handleBackOnline)
      document.removeEventListener("visibilitychange", handleRetryVisibility)
      for (const domain of accountDomains) unregisterDomainRetry(domain)
      cancelAutoRetry()
    }
  })

  // ── Operator kick detection: check on tab focus + realtime ──
  // Tab-focus check covers the common "switch tab to kick, switch back" flow
  function handleVisibilityChange() {
    if (
      document.visibilityState === "visible" &&
      $profileStore?.master_map_id
    ) {
      // Only re-check if user had an operator selected (skip if they never picked one)
      if ($operatorStore?.operator) {
        console.log("[op-kick] Tab focused — re-checking operator")
        operatorApi
          .checkOperatorStatus($profileStore.master_map_id)
          .then((check) => {
            if (!check.operator) showMapLoadOperatorPicker = true
          })
      }
    }
  }

  $: {
    const mapId = $profileStore?.master_map_id
    const userId = $session?.user?.id

    if (mapId && userId) {
      // Set up visibility listener (tab focus)
      if (!visibilityListenerSet) {
        visibilityListenerSet = true
        document.addEventListener("visibilitychange", handleVisibilityChange)
      }

      // Set up realtime channel (best-effort, may not deliver in all cases)
      if (!operatorRealtimeChannel) {
        console.log("[op-realtime] Creating channel")
        operatorRealtimeChannel = supabase
          .channel(`op-kicks-${userId.slice(0, 8)}`)
          .on(
            "postgres_changes",
            { event: "UPDATE", schema: "public", table: "operator_sessions" },
            (payload) => {
              if (
                payload.old?.account_id === userId &&
                payload.old?.ended_at === null &&
                payload.new?.ended_at !== null &&
                payload.old?.map_id === mapId
              ) {
                console.log("[op-realtime] KICKED!")
                operatorApi.checkOperatorStatus(mapId).then((check) => {
                  if (!check.operator) showMapLoadOperatorPicker = true
                })
              }
            },
          )
          .subscribe()
      }
    }
  }

  // Cleanup on destroy
  onDestroy(() => {
    if (visibilityListenerSet) {
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
    if (operatorRealtimeChannel) {
      supabase.removeChannel(operatorRealtimeChannel)
    }
  })

  // Handle route navigation for native apps
  $: if (browser && isNative && $page) {
    // Check if we're on a billing route and redirect if necessary
    const currentPath = $page.url.pathname
    const isBillingRoute =
      currentPath.includes("/payment") || currentPath.includes("/select_plan")

    if (isBillingRoute) {
      console.log("Skipping billing route in native app:", currentPath)
      goto("/account")
    }
  }
</script>

{#if browser}
  {#if loading}
    <!-- Loading State with Spinning Cloud Animation -->
    <div
      class="flex h-screen w-full items-center justify-center bg-base-100"
      out:fade={{ duration: 300 }}
    >
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
  {:else if loadFailure}
    <!-- Couldn't load the account: say why, and keep trying -->
    <div class="flex h-screen w-full items-center justify-center bg-base-100">
      <div
        class="mx-4 w-full max-w-md rounded-2xl border p-8 shadow-xl"
        class:border-amber-200={loadFailure.kind === "offline" ||
          loadFailure.kind === "timeout"}
        class:bg-amber-50={loadFailure.kind === "offline" ||
          loadFailure.kind === "timeout"}
        class:border-red-200={loadFailure.kind !== "offline" &&
          loadFailure.kind !== "timeout"}
        class:bg-red-50={loadFailure.kind !== "offline" &&
          loadFailure.kind !== "timeout"}
      >
        <div class="text-center">
          <div
            class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full"
            class:bg-amber-100={loadFailure.kind === "offline" ||
              loadFailure.kind === "timeout"}
            class:bg-red-100={loadFailure.kind !== "offline" &&
              loadFailure.kind !== "timeout"}
          >
            {#if loadFailure.kind === "offline" || loadFailure.kind === "timeout"}
              <WifiOff class="h-8 w-8 text-amber-700" />
            {:else}
              <AlertCircle class="h-8 w-8 text-red-600" />
            {/if}
          </div>

          <h2
            class="mb-2 text-xl font-bold"
            class:text-amber-900={loadFailure.kind === "offline" ||
              loadFailure.kind === "timeout"}
            class:text-red-900={loadFailure.kind !== "offline" &&
              loadFailure.kind !== "timeout"}
          >
            {loadFailure.title}
          </h2>

          <p
            class="mb-5 text-sm"
            class:text-amber-800={loadFailure.kind === "offline" ||
              loadFailure.kind === "timeout"}
            class:text-red-700={loadFailure.kind !== "offline" &&
              loadFailure.kind !== "timeout"}
          >
            {loadFailure.detail}
          </p>

          <p class="mb-5 text-xs text-contrast-content/60" aria-live="polite">
            {#if retrying || $networkStore.status === "unknown"}
              Checking the connection...
            {:else if loadFailure.retryable && autoRetryCount > 0}
              Retry {autoRetryCount} of {MAX_AUTO_RETRIES}. We'll try again
              automatically.
            {:else if loadFailure.retryable}
              We'll retry automatically as soon as the connection returns.
            {/if}
          </p>

          <div class="flex flex-col gap-3 sm:flex-row sm:justify-center">
            {#if loadFailure.retryable}
              <button
                class="flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                on:click={() => retryLoad()}
                disabled={retrying}
              >
                {#if retrying}
                  <Loader2 class="h-4 w-4 animate-spin" />
                  Retrying...
                {:else}
                  <RotateCcw class="h-4 w-4" />
                  Try Again
                {/if}
              </button>
            {:else}
              <a
                href="/login"
                class="flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 font-medium text-white transition-opacity hover:opacity-90"
              >
                <ArrowLeft class="h-4 w-4" />
                Sign in again
              </a>
            {/if}

            <button
              class="flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 font-medium text-gray-700 transition-colors hover:bg-gray-50"
              on:click={() => window.location.reload()}
            >
              Reload app
            </button>
          </div>

          {#if lastFailureDetail}
            <details class="mt-5 text-left">
              <summary
                class="cursor-pointer text-xs text-contrast-content/50 hover:text-contrast-content/80"
              >
                Technical details
              </summary>
              <p
                class="mt-2 break-words rounded-lg bg-black/5 p-3 font-mono text-[11px] text-contrast-content/70"
              >
                {lastFailureDetail}
              </p>
            </details>
          {/if}
        </div>
      </div>
    </div>
  {:else}
    <div in:fade={{ duration: 300 }}>
      <slot />
    </div>
  {/if}
{/if}

{#if showMapLoadOperatorPicker && $profileStore?.master_map_id}
  <OperatorPicker
    mapId={$profileStore.master_map_id}
    context="start"
    on:selected={() => (showMapLoadOperatorPicker = false)}
    on:close={() => (showMapLoadOperatorPicker = false)}
  />
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
