<!-- src/components/TrailSynchronizer.svelte -->
<script>
  import { onMount, onDestroy } from "svelte"
  import { supabase } from "$lib/supabaseClient"
  import { toast } from "svelte-sonner"
  import { trailsApi } from "$lib/api/trailsApi"
  import { writable, get } from "svelte/store"

  import {
    userVehicleStore,
    userVehicleTrailing,
  } from "../../stores/vehicleStore"

  import {
    currentTrailStore,
    coordinateBufferStore,
    unsavedCoordinatesStore,
  } from "$lib/stores/currentTrailStore"

  import {
    historicalTrailStore,
    otherActiveTrailStore,
  } from "$lib/stores/otherTrailStore"

  import { mapActivityStore } from "$lib/stores/mapActivityStore"
  import { profileStore } from "$lib/stores/profileStore"
  import { session, initializeSession } from "$lib/stores/sessionStore"

  import TrailView from "$lib/components/TrailView.svelte"

  export let selectedOperation
  export let map

  let supabaseChannel
  let areTrailsLoaded = false

  // Offline queue management
  let isOnline = navigator.onLine
  let pendingCoordinates = writable([])
  let pendingClosures = writable([])

  // Retry mechanism for failed coordinates
  let retryIntervalId = null
  const RETRY_INTERVAL = 10000 // 10 seconds

  // Track connection issues to avoid spamming user
  let consecutiveFailures = 0
  let hasShownConnectionWarning = false
  let lastSuccessfulSync = Date.now()

  let cleanup = {
    coordinateBufferUnsubscribe: null,
    unsavedCoordinatesUnsubscribe: null,
    onlineListener: null,
    offlineListener: null,
  }

  onMount(async () => {
    console.log("🚀 TrailSynchronizer: Initializing")

    // Set up online/offline listeners
    cleanup.onlineListener = () => {
      console.log("🌐 Back online - syncing pending changes")
      isOnline = true
      syncPendingChanges()
    }
    cleanup.offlineListener = () => {
      console.log("📴 Gone offline - will queue changes")
      isOnline = false
    }

    window.addEventListener("online", cleanup.onlineListener)
    window.addEventListener("offline", cleanup.offlineListener)

    await initializeSession()
    await checkOpenTrails()
    await checkOtherActiveTrails()
    await fetchOperationTrails()

    // ✅ INSTANT COORDINATE SENDING - No batching
    cleanup.coordinateBufferUnsubscribe = coordinateBufferStore.subscribe(
      async (newCoordinateBuffer) => {
        if (
          newCoordinateBuffer &&
          newCoordinateBuffer.coordinates &&
          $userVehicleTrailing
        ) {
          // Update local trail path immediately for instant visual feedback
          updateTrailPath(newCoordinateBuffer)

          // Send coordinate to database immediately (or queue if offline)
          await sendCoordinateImmediately(newCoordinateBuffer)

          // Clear the buffer
          coordinateBufferStore.set(null)
        }
      },
    )

    // ✅ RETRY MECHANISM - Start retry interval for failed coordinates
    cleanup.unsavedCoordinatesUnsubscribe = unsavedCoordinatesStore.subscribe(
      (coordinates) => {
        if (coordinates.length > 0 && !retryIntervalId) {
          startRetryInterval()
        } else if (coordinates.length === 0 && retryIntervalId) {
          stopRetryInterval()
        }
      },
    )

    await subscribeToTrailChanges()
    await subscribeToTrailStreams()
    console.log("✅ TrailSynchronizer: Ready")
  })

  onDestroy(() => {
    if (cleanup.coordinateBufferUnsubscribe)
      cleanup.coordinateBufferUnsubscribe()
    if (cleanup.unsavedCoordinatesUnsubscribe)
      cleanup.unsavedCoordinatesUnsubscribe()

    if (cleanup.onlineListener) {
      window.removeEventListener("online", cleanup.onlineListener)
    }
    if (cleanup.offlineListener) {
      window.removeEventListener("offline", cleanup.offlineListener)
    }

    if (supabaseChannel) {
      supabaseChannel.unsubscribe()
    }

    stopRetryInterval()
    userVehicleTrailing.set(false)
  })

  // ============================================
  // PUBLIC API - Called by parent via events
  // ============================================

  export async function startTrail() {
    if ($userVehicleTrailing) {
      toast.warning("Trail recording already active")
      return
    }

    try {
      const vehicleId = $userVehicleStore.vehicle_id
      const result = await trailsApi.openNewTrail(
        vehicleId,
        selectedOperation.id,
        $userVehicleStore,
      )

      if (result.error) {
        throw new Error(result.message || "Failed to create trail")
      }

      currentTrailStore.set({
        ...result.trail,
        start_time: result.trail.start_time,
        trail_color: result.trail.trail_color,
        trail_width: result.trail.trail_width,
        path: [],
      })

      userVehicleTrailing.set(true)

      toast.success("Trail recording started", {
        description: `${result.trail.trail_width}m ${result.trail.trail_color.toLowerCase()} trail`,
      })
    } catch (error) {
      console.error("Error creating trail:", error)
      toast.error(`Failed to start trail: ${error.message}`)
    }
  }

  export async function stopTrail() {
    if (!$userVehicleTrailing) {
      console.warn("⚠️ No active trail to stop")
      toast.warning("No active trail to stop")
      return
    }

    if (!$currentTrailStore) {
      toast.error("No trail data found")
      userVehicleTrailing.set(false)
      return
    }

    const pathData = $currentTrailStore.path.map((point) => ({
      latitude: point.coordinates.latitude,
      longitude: point.coordinates.longitude,
      timestamp: point.timestamp,
    }))

    const trailId = $currentTrailStore.id

    console.log("🛑 Stopping trail:", trailId)

    // Check for insufficient data
    if (pathData.length < 2) {
      toast.info(
        `Deleting trail with insufficient data (${pathData.length} points)`,
      )

      try {
        const deleteResult = await trailsApi.deleteTrail(trailId)

        if (deleteResult.error) {
          throw new Error(deleteResult.message || "Failed to delete trail")
        }

        resetTrailState()
        toast.success("Empty trail deleted")
      } catch (error) {
        console.error("Error deleting trail:", error)
        resetTrailState() // Reset anyway
        toast.error("Failed to delete trail, but state reset")
      }
      return
    }

    const trailData = {
      trail_id: trailId,
      vehicle_id: $currentTrailStore.vehicle_id,
      operation_id: $currentTrailStore.operation_id,
      path: pathData,
      trail_color: $currentTrailStore.trail_color,
      trail_width: $currentTrailStore.trail_width,
    }

    // If offline, queue the closure
    if (!isOnline) {
      console.log("📴 Trail closure queued (offline):", trailId)
      pendingClosures.update((closures) => [
        ...closures,
        { trailId, trailData, pathData },
      ])

      // Clear active trail locally
      resetTrailState()

      toast.info("Trail stopped - will sync when online", {
        description: `${pathData.length} points queued`,
        duration: 4000,
      })
      return
    }

    // Show immediate feedback
    toast.loading("Saving trail...", { id: "stop-trail" })

    try {
      const result = await trailsApi.closeTrail(trailData)

      if (result.error) {
        throw new Error(result.message || "Failed to close trail")
      }

      console.log("✅ Trail stopped and closed:", trailId)

      // Convert to GeoJSON LineString
      const lineStringPath = {
        type: "LineString",
        coordinates: pathData.map((coord) => [coord.longitude, coord.latitude]),
      }

      const historicalTrail = {
        ...result.trail,
        path: lineStringPath,
      }

      historicalTrailStore.update((trails) => [...trails, historicalTrail])

      // Clear everything
      unsavedCoordinatesStore.clear()
      resetTrailState()

      toast.success("Trail saved successfully", {
        id: "stop-trail",
        description: `${pathData.length} points recorded`,
      })
    } catch (error) {
      console.error("Error closing trail:", error)

      // Check if it's a network error and queue for retry
      const isNetworkError =
        error.message?.includes("Failed to fetch") ||
        error.message?.includes("NetworkError") ||
        error.message?.includes("ERR_INTERNET_DISCONNECTED")

      if (isNetworkError) {
        console.log("📴 Trail closure queued (network error):", trailId)
        pendingClosures.update((closures) => [
          ...closures,
          { trailId, trailData, pathData },
        ])

        isOnline = false
        resetTrailState()

        toast.info("Device offline - trail will sync when online", {
          id: "stop-trail",
          description: `${pathData.length} points queued`,
          duration: 5000,
        })
      } else {
        toast.error(`Failed to save trail: ${error.message}`, {
          id: "stop-trail",
        })
        resetTrailState()
      }
    }
  }

  function resetTrailState() {
    currentTrailStore.set(null)
    userVehicleTrailing.set(false)
  }

  // ============================================
  // INSTANT COORDINATE SENDING
  // ============================================

  async function sendCoordinateImmediately(coordinateData) {
    const coordinateWithTimestamp = {
      coordinates: coordinateData.coordinates,
      timestamp: coordinateData.timestamp,
    }

    // If offline, queue immediately
    if (!isOnline) {
      pendingCoordinates.update((pending) => [
        ...pending,
        coordinateWithTimestamp,
      ])
      console.log("📴 Coordinate queued (offline):", coordinateWithTimestamp)
      return
    }

    try {
      const result = await trailsApi.saveCoordinates(
        selectedOperation.id,
        $currentTrailStore.id,
        [coordinateWithTimestamp],
      )

      // Check if result indicates an error
      if (result.error) {
        throw new Error(result.message || "Failed to save coordinate")
      }

      // Reset failure tracking on success
      consecutiveFailures = 0
      lastSuccessfulSync = Date.now()

      // If we had shown a warning and now recovered, let user know
      if (hasShownConnectionWarning) {
        hasShownConnectionWarning = false
        toast.success("Connection restored", {
          description: "Trail syncing resumed",
          duration: 2000,
        })
      }

      console.log("✅ Coordinate saved immediately:", coordinateWithTimestamp)
    } catch (error) {
      console.warn("❌ Failed to save coordinate, queueing:", error)
      consecutiveFailures++

      // Add to pending queue
      pendingCoordinates.update((pending) => [
        ...pending,
        coordinateWithTimestamp,
      ])

      // Update online status if it was a network error
      if (
        error.message?.includes("Failed to fetch") ||
        error.message?.includes("NetworkError") ||
        error.message?.includes("ERR_INTERNET_DISCONNECTED")
      ) {
        isOnline = false
      }

      // Only show warning after multiple failures and if not already shown
      if (consecutiveFailures >= 5 && !hasShownConnectionWarning) {
        hasShownConnectionWarning = true
        const unsavedCount = get(pendingCoordinates).length

        toast.warning("Poor connectivity detected", {
          description: `${unsavedCount} trail points queued. Trail continues locally and will sync when connection improves.`,
          duration: 5000,
        })
      }
    }
  }

  // ============================================
  // OFFLINE SYNC MECHANISM
  // ============================================

  async function syncPendingChanges() {
    const coords = get(pendingCoordinates)
    const closures = get(pendingClosures)

    if (coords.length === 0 && closures.length === 0) return

    console.log("🔄 Syncing pending changes:", {
      coordinates: coords.length,
      closures: closures.length,
    })

    // Sync coordinates first
    if (coords.length > 0) {
      try {
        const result = await trailsApi.saveCoordinates(
          selectedOperation.id,
          $currentTrailStore?.id,
          coords,
        )

        if (result.error) {
          throw new Error(result.message || "Failed to sync coordinates")
        }

        pendingCoordinates.set([])
        console.log("✅ Synced coordinates:", coords.length)

        toast.success(`Synced ${coords.length} trail points`, {
          duration: 2000,
        })
      } catch (error) {
        console.error("Failed to sync coordinates:", error)
      }
    }

    // Then sync closures
    if (closures.length > 0) {
      for (const closure of closures) {
        try {
          const result = await trailsApi.closeTrail(closure.trailData)

          if (result.error) {
            throw new Error(result.message || "Failed to sync trail closure")
          }

          pendingClosures.update((list) =>
            list.filter((c) => c.trailId !== closure.trailId),
          )

          console.log("✅ Synced trail closure:", closure.trailId)

          // Add to historical trails
          const lineStringPath = {
            type: "LineString",
            coordinates: closure.pathData.map((coord) => [
              coord.longitude,
              coord.latitude,
            ]),
          }

          const historicalTrail = {
            ...result.trail,
            path: lineStringPath,
          }

          historicalTrailStore.update((trails) => [...trails, historicalTrail])

          toast.success("Trail saved successfully", {
            description: `${closure.pathData.length} points recorded`,
            duration: 3000,
          })
        } catch (error) {
          console.error("Failed to sync trail closure:", closure.trailId, error)
        }
      }
    }
  }

  // ============================================
  // RETRY MECHANISM FOR FAILED COORDINATES
  // ============================================

  function startRetryInterval() {
    if (retryIntervalId) return

    retryIntervalId = setInterval(() => {
      if (isOnline) {
        retryFailedCoordinates()
      }
    }, RETRY_INTERVAL)
  }

  function stopRetryInterval() {
    if (retryIntervalId) {
      clearInterval(retryIntervalId)
      retryIntervalId = null
    }
  }

  async function retryFailedCoordinates() {
    const unsavedCoordinates = $unsavedCoordinatesStore

    if (unsavedCoordinates.length === 0) {
      return
    }

    const coordinatesToRetry = [...unsavedCoordinates]

    // Optimistically clear the store
    unsavedCoordinatesStore.set([])

    try {
      const result = await trailsApi.saveCoordinates(
        selectedOperation.id,
        $currentTrailStore.id,
        coordinatesToRetry.map((coord) => ({
          coordinates: coord.coordinates,
          timestamp: coord.timestamp,
        })),
      )

      if (result.error) {
        throw new Error(result.message || "Failed to retry coordinates")
      }

      // Reset failure tracking
      consecutiveFailures = 0
      lastSuccessfulSync = Date.now()

      // Only notify user if we had a warning shown and recovered a significant amount
      if (hasShownConnectionWarning && coordinatesToRetry.length >= 10) {
        hasShownConnectionWarning = false
        toast.success(`Connection restored`, {
          description: `Synced ${coordinatesToRetry.length} queued trail points`,
          duration: 3000,
        })
      }
    } catch (error) {
      // Silently add back to unsaved coordinates
      unsavedCoordinatesStore.update((coords) => [
        ...coordinatesToRetry,
        ...coords,
      ])
    }
  }

  // ============================================
  // TRAIL SUBSCRIPTION HANDLERS
  // ============================================

  async function subscribeToTrailChanges() {
    const currentVehicleId = $profileStore.id

    supabaseChannel = supabase
      .channel("trail_changes")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "trails",
          filter: `operation_id=eq.${selectedOperation.id}`,
        },
        handleTrailInsert,
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "trails",
          filter: `operation_id=eq.${selectedOperation.id}`,
        },
        handleTrailUpdate,
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "trails",
          filter: `operation_id=eq.${selectedOperation.id}`,
        },
        handleTrailDelete,
      )
      .subscribe()

    function handleTrailInsert(payload) {
      if (!payload.new) return
      const trailData = payload.new

      if (trailData.vehicle_id === currentVehicleId) return

      if (!$otherActiveTrailStore?.length) {
        otherActiveTrailStore.set([])
      }

      otherActiveTrailStore.update((trails = []) => {
        return [
          ...trails,
          {
            id: trailData.id,
            vehicle_id: trailData.vehicle_id,
            operation_id: trailData.operation_id,
            start_time: trailData.start_time,
            end_time: trailData.end_time,
            task_id: trailData.task_id,
            trail_color: trailData.trail_color,
            trail_width: trailData.trail_width,
            path: [],
            detailed_path: trailData.detailed_path,
          },
        ]
      })
    }

    function handleTrailUpdate(payload) {
      if (!payload.new) return
      const trailData = payload.new

      if (trailData.vehicle_id === currentVehicleId) return

      if (!$otherActiveTrailStore?.length) {
        otherActiveTrailStore.set([])
      }

      otherActiveTrailStore.update((trails = []) => {
        const existingTrailIndex = trails.findIndex(
          (t) => t.id === trailData.id,
        )
        if (existingTrailIndex === -1) {
          return trails
        }

        const existingTrail = trails[existingTrailIndex]

        const lineStringPath = {
          type: "LineString",
          coordinates: existingTrail.path.map((point) => [
            point.coordinates.longitude,
            point.coordinates.latitude,
          ]),
        }

        const historicalTrail = {
          id: trailData.id,
          vehicle_id: trailData.vehicle_id,
          operation_id: trailData.operation_id,
          start_time: trailData.start_time,
          end_time: trailData.end_time,
          trail_color: trailData.trail_color,
          trail_width: trailData.trail_width,
          path: lineStringPath,
          detailed_path: trailData.detailed_path,
        }

        historicalTrailStore.update((historicalTrails) => [
          ...historicalTrails,
          historicalTrail,
        ])

        return trails.filter((trail) => trail.id !== trailData.id)
      })
    }

    function handleTrailDelete(payload) {
      if (!payload.old) return

      const trailData = payload.old

      if (trailData.vehicle_id === currentVehicleId) return

      toast.info(`Trail deleted by another user`, {
        description: `${trailData.trail_width}m ${trailData.trail_color.toLowerCase()} trail`,
      })

      if ($otherActiveTrailStore?.length) {
        otherActiveTrailStore.update((trails = []) => {
          return trails.filter((trail) => trail.id !== trailData.id)
        })
      }

      if ($historicalTrailStore?.length) {
        const isInHistorical = $historicalTrailStore.some(
          (trail) => trail.id === trailData.id,
        )

        if (isInHistorical) {
          historicalTrailStore.update((trails) =>
            trails.filter((trail) => trail.id !== trailData.id),
          )
        }
      }
    }
  }

  async function subscribeToTrailStreams() {
    supabaseChannel = supabase
      .channel("trail_stream_changes")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "trail_stream",
          filter: `operation_id=eq.${selectedOperation.id}`,
        },
        (payload) => {
          if (!payload.new) {
            return
          }

          const { trail_id, coordinate, timestamp } = payload.new

          if (!$otherActiveTrailStore?.length) {
            return
          }

          const isActiveTrail = $otherActiveTrailStore.some(
            (trail) => trail.id === trail_id,
          )
          if (!isActiveTrail) {
            return
          }

          otherActiveTrailStore.update((trails) => {
            return trails.map((trail) => {
              if (trail.id === trail_id) {
                const normalizedTimestamp =
                  typeof timestamp === "string"
                    ? new Date(timestamp).getTime()
                    : timestamp

                const newCoordinate = {
                  coordinates: {
                    latitude: coordinate.coordinates[1],
                    longitude: coordinate.coordinates[0],
                  },
                  timestamp: normalizedTimestamp,
                }

                const updatedPath = [...trail.path, newCoordinate].sort(
                  (a, b) => {
                    const aTime =
                      typeof a.timestamp === "string"
                        ? new Date(a.timestamp).getTime()
                        : a.timestamp
                    const bTime =
                      typeof b.timestamp === "string"
                        ? new Date(b.timestamp).getTime()
                        : b.timestamp
                    return aTime - bTime
                  },
                )

                return {
                  ...trail,
                  path: updatedPath,
                }
              }
              return trail
            })
          })
        },
      )
      .subscribe()
  }

  // ============================================
  // TRAIL PATH MANAGEMENT
  // ============================================

  function updateTrailPath(newCoordinateData) {
    currentTrailStore.update((trail) => {
      if (trail) {
        const updatedPath = [...(trail.path || []), newCoordinateData]
        return { ...trail, path: updatedPath }
      }
      return trail
    })
  }

  // ============================================
  // TRAIL DATA LOADING
  // ============================================

  async function getOperationTrails(operation_id) {
    try {
      const { data: trails, error: trailsError } = await supabase
        .from("trails")
        .select("*")
        .eq("operation_id", operation_id)
        .not("end_time", "is", null)
        .order("start_time", { ascending: true })

      if (trailsError) {
        throw new Error(`Failed to fetch trails: ${trailsError.message}`)
      }

      if (!trails || trails.length === 0) {
        return []
      }

      const trailsWithPaths = await Promise.all(
        trails.map(async (trail) => {
          try {
            const { data: pathData, error: pathError } = await supabase.rpc(
              "get_trail_path_as_geojson",
              { trail_id_param: trail.id },
            )

            if (pathError) {
              console.error(
                `Error fetching path for trail ${trail.id}:`,
                pathError,
              )
              return { ...trail, path: null }
            }

            return { ...trail, path: pathData }
          } catch (error) {
            console.error(`Error processing path for trail ${trail.id}:`, error)
            return { ...trail, path: null }
          }
        }),
      )

      return trailsWithPaths
    } catch (error) {
      console.error("Error in getOperationTrails:", error)
      throw error
    }
  }

  async function fetchOperationTrails() {
    toast.promise(
      (async () => {
        const trails = await getOperationTrails(selectedOperation.id)

        historicalTrailStore.set([])
        historicalTrailStore.update((currentTrails) => [
          ...currentTrails,
          ...trails,
        ])

        areTrailsLoaded = true
        return trails
      })(),
      {
        loading: `Loading trails from ${selectedOperation.name} (${selectedOperation.year})...`,
        success: (trails) =>
          `Loaded ${trails.length} trails from ${selectedOperation.name} (${selectedOperation.year})`,
        error: (error) =>
          `Failed to fetch trails from ${selectedOperation.name}: ${error.message}`,
      },
      {
        duration: 4000,
      },
    )
  }

  async function checkOpenTrails() {
    try {
      const result = await trailsApi.checkOpenTrails($profileStore.id)

      if (result.error) {
        throw new Error(result.message || "Failed to check for open trails")
      }

      const { openTrail, trailData } = result

      if (openTrail) {
        currentTrailStore.set({
          ...openTrail,
          start_time: openTrail.start_time,
          trail_color: openTrail.trail_color,
          trail_width: openTrail.trail_width,
          path: trailData || [],
        })

        userVehicleTrailing.set(true)

        const startTime = new Date(openTrail.start_time)
        const timeElapsed = Math.round(
          (Date.now() - startTime.getTime()) / (1000 * 60),
        )

        toast.info(
          `Found existing ${openTrail.trail_width}m ${openTrail.trail_color.toLowerCase()} trail`,
          {
            description: `Started ${timeElapsed} minutes ago. Trailing will continue automatically.`,
            duration: 5000,
          },
        )
      }
    } catch (error) {
      console.error("Failed to check open trails:", error)
      toast.error("Failed to check for open trails")
    }
  }

  async function checkOtherActiveTrails() {
    const toastPromise = toast.promise(
      (async () => {
        const data = await trailsApi.checkOtherActiveTrails(
          selectedOperation.id,
          $profileStore.id,
        )

        if (data.error) {
          throw new Error(
            data.message || "Failed to check for other active trails",
          )
        }

        if (data.errors) {
          data.errors.forEach((error) => {
            toast.error(error, { duration: 6000 })
          })
        }

        const { activeTrails } = data

        if (activeTrails && activeTrails.length > 0) {
          const formattedTrails = activeTrails.map((trail) => {
            const trailData = trail.trailData || []

            const normalizedTrailData = trailData.map((coord) => ({
              ...coord,
              timestamp:
                typeof coord.timestamp === "string"
                  ? new Date(coord.timestamp).getTime()
                  : coord.timestamp,
            }))

            return {
              id: trail.id,
              vehicle_id: trail.vehicle_id,
              operation_id: trail.operation_id,
              task_id: trail.task_id || null,
              start_time: trail.start_time,
              end_time: trail.end_time,
              trail_color: trail.trail_color,
              trail_width: trail.trail_width,
              path: normalizedTrailData.sort(
                (a, b) => a.timestamp - b.timestamp,
              ),
              detailed_path: null,
            }
          })

          const connectedProfiles = $mapActivityStore?.connected_profiles || []

          const activeUsers = activeTrails
            .map((trail) => {
              const profile = connectedProfiles.find(
                (p) => p.id === trail.vehicle_id,
              )
              return profile ? profile.full_name : null
            })
            .filter((name) => name !== null)

          otherActiveTrailStore.set(formattedTrails)

          if (activeUsers.length > 0) {
            const userList = activeUsers.join(", ")
            return `Active trails from: ${userList}`
          } else {
            return `Found ${activeTrails.length} active ${
              activeTrails.length === 1 ? "trail" : "trails"
            } from unknown vehicles`
          }
        } else {
          otherActiveTrailStore.set([])
          return "No active trails found"
        }
      })(),
      {
        loading: "Checking for active trails...",
        success: (message) => message,
        error: (error) =>
          error instanceof Error
            ? error.message
            : "Failed to check for other active trails",
      },
      {
        duration: 6000,
      },
    )

    try {
      await toastPromise
    } catch (error) {
      console.error("Failed to check other active trails:", error)
    }
  }
</script>

{#if areTrailsLoaded}
  <TrailView {map} />
{/if}
