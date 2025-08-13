<!-- MapStateSaver.svelte -->
<script>
  import { onMount, onDestroy } from "svelte"
  import { confirmedMarkersStore, syncStore } from "../stores/mapStore"
  import { userSettingsStore } from "$lib/stores/userSettingsStore"
  import { mapActivityStore } from "$lib/stores/mapActivityStore"
  import { profileStore } from "$lib/stores/profileStore"
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
  let pendingChanges = new Set() // Track IDs of changed markers only
  let pendingDeletions = new Set() // Track IDs of deleted markers
  let lastKnownState = new Map() // Track last synced state
  let isSyncing = false
  let debouncedSync

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

    // Subscribe to real-time changes from other users
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
          // Skip if it's our own change
          if (payload.new.update_user_id === userId) return

          // Show notification
          await showChangeNotification(payload)

          // Reload markers from server
          if (!isSyncing) {
            loadMarkersFromServer()
          }
        },
      )
      .subscribe()

    // Initial load
    loadMarkersFromServer()

    // Watch for local changes and track what actually changed
    const markersUnsubscribe = confirmedMarkersStore.subscribe((markers) => {
      if (!isSyncing) {
        trackChangedMarkers(markers)

        if (isOnline) {
          debouncedSync()
        }
      }
    })

    // Add sync method to store for manual triggers
    syncStore.update((store) => ({
      ...store,
      synchronizeMarkers: () => loadMarkersFromServer(),
    }))

    return () => {
      userSettingsUnsubscribe()
      markersUnsubscribe()
    }
  })

  onDestroy(() => {
    if (browser) {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
    if (channel) supabase.removeChannel(channel)
    if (debouncedSync) debouncedSync.cancel()

    // Clear stores
    confirmedMarkersStore.set([])
  })

  function trackChangedMarkers(currentMarkers) {
    // Compare current state with last known state to detect changes
    const currentMap = new Map(currentMarkers.map((m) => [m.id, m]))

    // Check for new or modified markers
    for (const [id, marker] of currentMap) {
      const lastKnown = lastKnownState.get(id)

      if (
        !lastKnown ||
        lastKnown.iconClass !== marker.iconClass ||
        lastKnown.coordinates[0] !== marker.coordinates[0] ||
        lastKnown.coordinates[1] !== marker.coordinates[1]
      ) {
        pendingChanges.add(id)
        console.log(`Tracked change for marker ${id}`)
      }
    }

    // Check for deleted markers
    for (const [id] of lastKnownState) {
      if (!currentMap.has(id)) {
        pendingDeletions.add(id)
        console.log(`Tracked deletion for marker ${id}`)
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
      })
    })
    pendingChanges.clear()
    pendingDeletions.clear()
    console.log(`Updated known state with ${markers.length} markers`)
  }

  function handleOnline() {
    isOnline = true
    console.log("Back online - syncing pending changes")
    syncPendingChanges()
  }

  function handleOffline() {
    isOnline = false
    console.log("Gone offline - will queue changes")
    toast.info("Gone offline - changes will be saved when reconnected")
  }

  async function loadMarkersFromServer() {
    if (isSyncing) return

    syncStore.update((store) => ({ ...store, spinning: true }))

    try {
      // Build query - keep original field selection for compatibility
      let query = supabase
        .from("map_markers")
        .select("id, marker_data, last_confirmed, created_at, deleted")
        .eq("master_map_id", masterMapId)
        .eq("deleted", false)

      // Apply date filtering if enabled
      if (userSettings?.limitMarkersOn && userSettings?.limitMarkersDays) {
        const cutoffDate = new Date()
        cutoffDate.setDate(cutoffDate.getDate() - userSettings.limitMarkersDays)
        query = query.gte("created_at", cutoffDate.toISOString())
      }

      const { data: markers, error } = await query

      if (error) throw error

      // Process markers - handle both old and new data structures
      const processedMarkers = (markers || [])
        .map((marker) => {
          const coordinates = marker.marker_data?.geometry?.coordinates
          const iconClass = marker.marker_data?.properties?.icon || "default"

          if (!coordinates) {
            console.warn("Marker missing coordinates:", marker)
            return null
          }

          return {
            id: marker.id,
            coordinates: coordinates,
            iconClass: iconClass,
            created_at:
              marker.last_confirmed ||
              marker.created_at ||
              new Date().toISOString(),
          }
        })
        .filter(Boolean)

      // Update local store
      isSyncing = true
      confirmedMarkersStore.set(processedMarkers)
      updateLastKnownState(processedMarkers) // Update our tracking
      calculateAndStoreBoundingBox(processedMarkers)
      isSyncing = false

      console.log(`Loaded ${processedMarkers.length} markers from server`)
    } catch (error) {
      console.error("Error loading markers:", error)
      toast.error(`Failed to load markers: ${error.message}`)
    } finally {
      syncStore.update((store) => ({ ...store, spinning: false }))
    }
  }

  async function syncLocalChanges() {
    if (
      !isOnline ||
      isSyncing ||
      (pendingChanges.size === 0 && pendingDeletions.size === 0)
    )
      return

    try {
      await syncOnlyChangedMarkers()
      console.log("Synced local changes to server")
    } catch (error) {
      console.error("Sync failed:", error)
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
      console.error("Failed to sync pending changes:", error)
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
      `Syncing ${changedMarkers.length} changed markers and ${pendingDeletions.size} deletions`,
      {
        changes: Array.from(pendingChanges),
        deletions: Array.from(pendingDeletions),
      },
    )

    // Sync marker updates/additions
    if (changedMarkers.length > 0) {
      const markerData = changedMarkers.map((marker) => ({
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
          },
        },
        last_confirmed: marker.created_at || new Date().toISOString(),
        created_at: marker.created_at || new Date().toISOString(),
        update_user_id: userId,
        deleted: false,
      }))

      const { error } = await supabase
        .from("map_markers")
        .upsert(markerData, { onConflict: "id" })

      if (error) throw error
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
    updateLastKnownState(currentMarkers)

    console.log(
      `Successfully synced ${changedMarkers.length} markers and ${pendingDeletions.size} deletions`,
    )
  }

  async function showChangeNotification(payload) {
    const changeType = payload.eventType
    const iconClass = payload.new.marker_data?.properties?.icon || "unknown"
    const coordinates = payload.new.marker_data?.geometry?.coordinates
    const isDeleted = payload.new.deleted === true

    // Get username
    let username = "Another user"
    const connectedUser = $mapActivityStore.connected_profiles.find(
      (profile) => profile.id === payload.new.update_user_id,
    )

    if (connectedUser) {
      username = connectedUser.full_name
    } else {
      const { data: user } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", payload.new.update_user_id)
        .single()

      if (user) username = user.full_name
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
                map.flyTo({
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
