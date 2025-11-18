<script>
  import { onMount, onDestroy } from "svelte"
  import { confirmedMarkersStore, syncStore } from "$lib/stores/markerStore"
  import { userSettingsStore } from "$lib/stores/userSettingsStore"
  import { mapActivityStore } from "$lib/stores/mapActivityStore"
  import { profileStore } from "$lib/stores/profileStore"
  import { markerVisibilityStore } from "$lib/stores/markerVisibilityStore"
  import mapboxgl from "mapbox-gl"
  const { LngLatBounds } = mapboxgl
  import { markerBoundaryStore } from "$lib/stores/homeBoundaryStore"
  import { supabase } from "$lib/supabaseClient"
  import { toast } from "svelte-sonner"
  import { browser } from "$app/environment"
  import { debounce } from "lodash-es"

  export let map

  let channel
  let masterMapId
  let userId
  let userSettings
  let isOnline = true
  let pendingChanges = new Set()
  let pendingDeletions = new Set()
  let lastKnownState = new Map()
  let isSyncing = false
  let isInitialized = false
  let debouncedSync
  let markersUnsubscribe

  onMount(() => {
    masterMapId = $profileStore.master_map_id
    userId = $profileStore.id
    debouncedSync = debounce(syncLocalChanges, 1000)

    // Subscribe to user settings
    const userSettingsUnsubscribe = userSettingsStore.subscribe((settings) => {
      userSettings = settings
    })

    // Check if online
    if (browser) {
      isOnline = navigator.onLine
      window.addEventListener("online", handleOnline)
      window.addEventListener("offline", handleOffline)
    }

    // Subscribe to real-time changes - FILTER OUT OUR OWN CHANGES
    channel = supabase
      .channel("map_markers_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "map_markers",
          filter: `master_map_id=eq.${masterMapId}`,
        },
        async (payload) => {
          // Double-check: Skip if it's our own change
          if (payload.new?.update_user_id === userId) {
            console.log("⏭️ Skipping own change - user ID match")
            return
          }

          // Also skip if old data has our user ID (for updates)
          if (
            payload.old?.update_user_id === userId &&
            payload.eventType === "UPDATE"
          ) {
            console.log("⏭️ Skipping own update - old user ID match")
            return
          }

          console.log(
            "🔄 Received real-time change from another user:",
            payload.eventType,
            "User ID:",
            payload.new?.update_user_id,
          )

          // Handle the change immediately using payload data
          handleRealtimeMarkerChange(payload)

          // Show notification ONLY for other users' changes
          await showChangeNotification(payload)
        },
      )
      .subscribe()

    // Initial load - MUST happen before setting up change tracking
    loadMarkersFromServer().then(() => {
      // Only start tracking changes AFTER initial load
      setupChangeTracking()
    })

    // Add sync method to store for manual triggers
    syncStore.update((store) => ({
      ...store,
      synchronizeMarkers: () => loadMarkersFromServer(),
    }))

    return () => {
      userSettingsUnsubscribe()
      if (markersUnsubscribe) markersUnsubscribe()
    }
  })

  // Handle real-time marker changes directly from payload
  function handleRealtimeMarkerChange(payload) {
    const { eventType, new: newData, old: oldData } = payload

    if (eventType === "DELETE" || newData?.deleted === true) {
      // Remove marker
      confirmedMarkersStore.update((markers) =>
        markers.filter((m) => m.id !== (newData?.id || oldData?.id)),
      )

      // Remove from tracking
      const markerId = newData?.id || oldData?.id
      if (markerId) {
        lastKnownState.delete(markerId)

        // Remove from visibility store
        markerVisibilityStore.update((settings) => {
          const { [markerId]: removed, ...rest } = settings
          return rest
        })
      }

      console.log("🗑️ Removed marker from realtime event")
      return
    }

    if (eventType === "INSERT" || eventType === "UPDATE") {
      const coordinates = newData.marker_data?.geometry?.coordinates
      const iconClass = newData.marker_data?.properties?.icon || "default"

      if (!coordinates) {
        console.warn("⚠️ Realtime marker missing coordinates")
        return
      }

      const processedMarker = {
        id: newData.id,
        coordinates: coordinates,
        iconClass: iconClass,
        notes: newData.notes,
        created_at: newData.last_confirmed || newData.created_at,
        updated_at: newData.updated_at,
      }

      // 🔥 KEY FIX: Temporarily disable change tracking while updating from realtime
      const wasSyncing = isSyncing
      isSyncing = true // This prevents trackChangedMarkers from running

      confirmedMarkersStore.update((markers) => {
        const existingIndex = markers.findIndex((m) => m.id === newData.id)

        if (existingIndex >= 0) {
          // Update existing marker
          markers[existingIndex] = processedMarker
          console.log("✏️ Updated marker from realtime event:", newData.id)
        } else {
          // Add new marker
          markers.push(processedMarker)
          console.log("➕ Added marker from realtime event:", newData.id)
        }

        return markers
      })

      // 🔥 KEY FIX: Update lastKnownState IMMEDIATELY to prevent re-syncing
      lastKnownState.set(newData.id, {
        iconClass: processedMarker.iconClass,
        coordinates: [...processedMarker.coordinates],
        notes: processedMarker.notes,
        created_at: processedMarker.created_at,
      })

      // Re-enable change tracking
      isSyncing = wasSyncing

      // Update visibility in store
      const visibility =
        newData.marker_data?.properties?.drawings_visibility || "selected"
      markerVisibilityStore.setMarkerVisibility(newData.id, visibility)

      // Recalculate bounding box
      calculateAndStoreBoundingBox($confirmedMarkersStore)

      console.log(
        "🔒 Real-time marker locked in lastKnownState to prevent re-sync",
      )
    }
  }

  // Separate function to setup change tracking after initialization
  function setupChangeTracking() {
    console.log("🎯 Setting up change tracking after initialization")

    markersUnsubscribe = confirmedMarkersStore.subscribe((markers) => {
      if (!isSyncing && isInitialized) {
        console.log("📊 Tracking changes for", markers.length, "markers")
        trackChangedMarkers(markers)

        if (
          isOnline &&
          (pendingChanges.size > 0 || pendingDeletions.size > 0)
        ) {
          console.log("🚀 Debouncing sync due to changes")
          debouncedSync()
        }
      }
    })
  }

  onDestroy(() => {
    console.log("🧹 MapStateSaver cleanup - preserving markers")

    if (browser) {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
    if (channel) supabase.removeChannel(channel)
    if (debouncedSync) debouncedSync.cancel()
    if (markersUnsubscribe) markersUnsubscribe()
  })

  function trackChangedMarkers(currentMarkers) {
    // Don't track changes until we're initialized
    if (!isInitialized) {
      console.log("⏸️ Skipping change tracking - not initialized yet")
      return
    }

    console.log("🔍 Tracking changes:", {
      current: currentMarkers.length,
      lastKnown: lastKnownState.size,
      pendingChanges: pendingChanges.size,
      pendingDeletions: pendingDeletions.size,
    })

    const currentMap = new Map(currentMarkers.map((m) => [m.id, m]))

    // Check for new or modified markers
    for (const [id, marker] of currentMap) {
      const lastKnown = lastKnownState.get(id)

      if (
        !lastKnown ||
        lastKnown.iconClass !== marker.iconClass ||
        lastKnown.coordinates[0] !== marker.coordinates[0] ||
        lastKnown.coordinates[1] !== marker.coordinates[1] ||
        lastKnown.notes !== marker.notes
      ) {
        pendingChanges.add(id)
        console.log(`✏️ Tracked change for marker ${id}`)
      }
    }

    // Only check for deletions if we have a baseline
    if (lastKnownState.size > 0) {
      for (const [id] of lastKnownState) {
        if (!currentMap.has(id)) {
          pendingDeletions.add(id)
          console.log(`🗑️ Tracked deletion for marker ${id}`)
        }
      }
    }
  }

  function updateLastKnownState(markers) {
    lastKnownState.clear()
    markers.forEach((marker) => {
      lastKnownState.set(marker.id, {
        iconClass: marker.iconClass,
        coordinates: [...marker.coordinates],
        created_at: marker.created_at,
        notes: marker.notes,
      })
    })
    pendingChanges.clear()
    pendingDeletions.clear()

    // Mark as initialized after first successful load
    if (!isInitialized) {
      isInitialized = true
      console.log(
        "✅ MapStateSaver initialized with",
        markers.length,
        "markers",
      )
    }

    console.log(`📝 Updated known state with ${markers.length} markers`)
  }

  function handleOnline() {
    isOnline = true
    console.log("🌐 Back online - syncing pending changes")
    syncPendingChanges()
  }

  function handleOffline() {
    isOnline = false
    console.log("📴 Gone offline - will queue changes")
    toast.info("Gone offline - changes will be saved when reconnected")
  }

  async function loadMarkersFromServer() {
    if (isSyncing) {
      console.log("⏸️ Skipping load - already syncing")
      return
    }

    console.log("📥 Loading markers from server...")
    syncStore.update((store) => ({ ...store, spinning: true }))
    isSyncing = true

    try {
      let query = supabase
        .from("map_markers")
        .select(
          "id, marker_data, notes, last_confirmed, created_at, updated_at, deleted",
        )
        .eq("master_map_id", masterMapId)
        .or("deleted.is.null,deleted.eq.false")

      // Apply date filtering if enabled
      if (userSettings?.limitMarkersOn && userSettings?.limitMarkersDays) {
        const cutoffDate = new Date()
        cutoffDate.setDate(cutoffDate.getDate() - userSettings.limitMarkersDays)
        query = query.gte("created_at", cutoffDate.toISOString())
      }

      const { data: markers, error } = await query

      if (error) throw error

      // Load visibility settings into store
      const visibilitySettings = {}
      markers?.forEach((marker) => {
        const visibility =
          marker.marker_data?.properties?.drawings_visibility || "selected"
        visibilitySettings[marker.id] = visibility
      })
      markerVisibilityStore.set(visibilitySettings)
      console.log(
        "✅ Loaded visibility settings into store:",
        Object.keys(visibilitySettings).length,
        "markers",
      )

      // Process markers
      const processedMarkers = (markers || [])
        .map((marker) => {
          const coordinates = marker.marker_data?.geometry?.coordinates
          const iconClass = marker.marker_data?.properties?.icon || "default"

          if (!coordinates) {
            console.warn("⚠️ Marker missing coordinates:", marker)
            return null
          }

          return {
            id: marker.id,
            coordinates: coordinates,
            iconClass: iconClass,
            notes: marker.notes,
            created_at:
              marker.last_confirmed ||
              marker.created_at ||
              new Date().toISOString(),
            updated_at: marker.updated_at,
          }
        })
        .filter(Boolean)

      // Update local store
      confirmedMarkersStore.set(processedMarkers)
      updateLastKnownState(processedMarkers)
      calculateAndStoreBoundingBox(processedMarkers)

      console.log(`✅ Loaded ${processedMarkers.length} markers from server`)
    } catch (error) {
      console.error("❌ Error loading markers:", error)
      toast.error(`Failed to load markers: ${error.message}`)
    } finally {
      isSyncing = false
      syncStore.update((store) => ({ ...store, spinning: false }))
    }
  }

  async function syncLocalChanges() {
    if (
      !isOnline ||
      isSyncing ||
      !isInitialized ||
      (pendingChanges.size === 0 && pendingDeletions.size === 0)
    ) {
      return
    }

    try {
      await syncOnlyChangedMarkers()
      console.log("✅ Synced local changes to server")
    } catch (error) {
      console.error("❌ Sync failed:", error)
      toast.error(
        "Failed to sync changes - will retry when connection improves",
      )
    }
  }

  async function syncPendingChanges() {
    if (pendingChanges.size === 0 && pendingDeletions.size === 0) return

    try {
      await syncOnlyChangedMarkers()
      toast.success(
        `Synced ${pendingChanges.size + pendingDeletions.size} offline changes`,
      )
    } catch (error) {
      console.error("❌ Failed to sync pending changes:", error)
      toast.error("Failed to sync offline changes")
    }
  }

  async function syncOnlyChangedMarkers() {
    if (
      !masterMapId ||
      (pendingChanges.size === 0 && pendingDeletions.size === 0)
    )
      return

    const currentMarkers = $confirmedMarkersStore

    // Handle marker updates/additions
    const changedMarkers = currentMarkers.filter((marker) =>
      pendingChanges.has(marker.id),
    )

    console.log(
      `🔄 Syncing ${changedMarkers.length} changed markers and ${pendingDeletions.size} deletions for user ${userId}`,
    )

    // Sync marker updates/additions
    if (changedMarkers.length > 0) {
      const markerData = changedMarkers.map((marker) => {
        // Include visibility from store in marker_data
        const visibility = $markerVisibilityStore[marker.id] || "selected"

        return {
          master_map_id: masterMapId,
          id: marker.id,
          marker_data: {
            type: "Feature",
            geometry: {
              type: "Point",
              coordinates: marker.coordinates,
            },
            properties: {
              icon: marker.iconClass || "default",
              id: marker.id,
              drawings_visibility: visibility,
            },
          },
          notes: marker.notes || null,
          last_confirmed: marker.created_at || new Date().toISOString(),
          created_at: marker.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
          update_user_id: userId, // Set the user ID
          deleted: null,
        }
      })

      console.log("💾 Upserting markers with user ID:", userId)

      const { error } = await supabase
        .from("map_markers")
        .upsert(markerData, { onConflict: "id" })

      if (error) throw error

      console.log("✅ Successfully upserted", changedMarkers.length, "markers")
    }

    // Sync deletions
    if (pendingDeletions.size > 0) {
      const deletionData = Array.from(pendingDeletions).map((markerId) => ({
        id: markerId,
        deleted: true,
        deleted_at: new Date().toISOString(),
        update_user_id: userId,
      }))

      const { error: deleteError } = await supabase
        .from("map_markers")
        .upsert(deletionData, { onConflict: "id" })

      if (deleteError) throw deleteError
    }

    // Update our tracking after successful sync
    updateLastKnownState($confirmedMarkersStore)

    console.log(
      `✅ Synced ${changedMarkers.length} markers and ${pendingDeletions.size} deletions`,
    )
  }

  async function showChangeNotification(payload) {
    const changeType = payload.eventType
    const iconClass = payload.new?.marker_data?.properties?.icon || "unknown"
    const coordinates = payload.new?.marker_data?.geometry?.coordinates
    const isDeleted = payload.new?.deleted === true

    console.log("🔍 DEBUG Notification:", {
      updateUserId: payload.new?.update_user_id,
      currentUserId: userId,
      match: payload.new?.update_user_id === userId,
    })

    // Get username
    let username = "Another user"
    const connectedUser = $mapActivityStore.connected_profiles?.find(
      (profile) => profile.id === payload.new?.update_user_id,
    )

    if (connectedUser) {
      username = connectedUser.full_name
      console.log("👤 Found connected user:", username, connectedUser.id)
    } else if (payload.new?.update_user_id) {
      const { data: user } = await supabase
        .from("profiles")
        .select("full_name, id")
        .eq("id", payload.new.update_user_id)
        .single()

      if (user) {
        username = user.full_name
        console.log("👤 Fetched user from DB:", username, user.id)
      }
    }
    // Show appropriate notification
    let title, description
    switch (changeType) {
      case "INSERT":
        title = "Marker Added"
        description = `${username} added a ${iconClass} marker`
        break
      case "UPDATE":
        if (isDeleted) {
          title = "Marker Removed"
          description = `${username} removed a ${iconClass} marker`
        } else {
          title = "Marker Updated"
          description = `${username} updated a marker to ${iconClass}`
        }
        break
    }

    toast.info(title, {
      description,
      action:
        coordinates && !isDeleted
          ? {
              label: "Locate",
              onClick: () => {
                map?.flyTo({
                  center: coordinates,
                  zoom: 15,
                  duration: 1000,
                })
              },
            }
          : undefined,
    })
  }

  function calculateAndStoreBoundingBox(markers) {
    if (markers.length > 0) {
      const bounds = new LngLatBounds()
      markers.forEach(({ coordinates }) => {
        if (coordinates) {
          bounds.extend(coordinates)
        }
      })
      markerBoundaryStore.set(bounds)
    } else {
      markerBoundaryStore.set(null)
    }
  }
</script>
