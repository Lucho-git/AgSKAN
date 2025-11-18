<!-- src/components/TrailSynchronizer.svelte -->
<script>
  import { onMount, onDestroy } from "svelte"
  import { supabase } from "$lib/supabaseClient"
  import { toast } from "svelte-sonner"
  import { trailsApi } from "$lib/api/trailsApi"
  import { get } from "svelte/store"

  import {
    userVehicleStore,
    userVehicleTrailing,
  } from "$lib/stores/vehicleStore"

  import {
    currentTrailStore,
    coordinateBufferStore,
    pendingCoordinatesStore,
    pendingClosuresStore,
  } from "$lib/stores/currentTrailStore"

  import {
    historicalTrailStore,
    otherActiveTrailStore,
  } from "$lib/stores/otherTrailStore"

  import { mapActivityStore } from "$lib/stores/mapActivityStore"
  import { profileStore } from "$lib/stores/profileStore"
  import { session, initializeSession } from "$lib/stores/sessionStore"

  import { commandStore, COMMANDS } from "$lib/stores/commandStore"

  import TrailView from "$lib/components/TrailView.svelte"

  export let selectedOperation
  export let map

  let supabaseChannel
  let areTrailsLoaded = false

  // Retry mechanism for failed coordinates
  let retryIntervalId = null
  const RETRY_INTERVAL = 10000 // 10 seconds

  // Track connection issues to avoid spamming user
  let hasShownConnectionWarning = false
  let consecutiveFailures = 0

  // Prevent infinite sync loop
  let isSyncing = false

  let cleanup = {
    coordinateBufferUnsubscribe: null,
    pendingCoordinatesUnsubscribe: null,
    commandStoreUnsubscribe: null,
    onlineListener: null,
    offlineListener: null,
  }

  onMount(async () => {
    console.log("🚀 TrailSynchronizer: Initializing")

    // Set up online/offline listeners
    cleanup.onlineListener = () => {
      console.log("🌐 Browser says online - attempting sync...")
      syncPendingChanges()
    }
    cleanup.offlineListener = () => {
      console.log("📴 Browser says offline")
    }

    window.addEventListener("online", cleanup.onlineListener)
    window.addEventListener("offline", cleanup.offlineListener)

    // Subscribe to command store
    cleanup.commandStoreUnsubscribe = commandStore.subscribe(
      async (command) => {
        if (!command) return

        console.log("🎯 TrailSynchronizer received command:", command)

        switch (command.type) {
          case COMMANDS.TRAIL_START:
            await startTrail()
            break
          case COMMANDS.TRAIL_STOP:
            await stopTrail()
            break
          case COMMANDS.TRAIL_TOGGLE:
            if ($userVehicleTrailing) {
              await stopTrail()
            } else {
              await startTrail()
            }
            break
          case COMMANDS.SYNC_TRIGGER:
            await syncPendingChanges()
            break
          default:
            console.warn("Unknown command:", command.type)
        }
      },
    )

    await initializeSession()
    await checkOpenTrails()
    await checkOtherActiveTrails()
    await fetchOperationTrails()

    // Instant coordinate sending
    cleanup.coordinateBufferUnsubscribe = coordinateBufferStore.subscribe(
      async (newCoordinateBuffer) => {
        if (
          newCoordinateBuffer &&
          newCoordinateBuffer.coordinates &&
          $userVehicleTrailing
        ) {
          // Update local trail path immediately for instant visual feedback
          updateTrailPath(newCoordinateBuffer)

          // Send coordinate to database immediately (or queue if fails)
          await sendCoordinateImmediately(newCoordinateBuffer)

          // Clear the buffer
          coordinateBufferStore.set(null)
        }
      },
    )

    // Retry mechanism - Start retry interval for failed coordinates
    cleanup.pendingCoordinatesUnsubscribe = pendingCoordinatesStore.subscribe(
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
    if (cleanup.pendingCoordinatesUnsubscribe)
      cleanup.pendingCoordinatesUnsubscribe()
    if (cleanup.commandStoreUnsubscribe) cleanup.commandStoreUnsubscribe()

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
  // TRAIL CONTROL - CALLED VIA COMMAND STORE
  // ============================================

  async function startTrail() {
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

  async function stopTrail() {
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

    console.log(
      "🛑 Stopping trail:",
      trailId,
      "with",
      pathData.length,
      "points",
    )

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
        resetTrailState()
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

    // Check if we have pending coordinates for this trail
    const pendingCoords = get(pendingCoordinatesStore).filter(
      (c) => c.trail_id === trailId,
    )

    console.log(
      `📊 Trail closure - Pending coordinates: ${pendingCoords.length}`,
    )

    // Use toast.promise for better UX
    const closurePromise = (async () => {
      try {
        // If we have pending coordinates, sync them FIRST and AWAIT
        if (pendingCoords.length > 0) {
          console.log(
            `📤 Syncing ${pendingCoords.length} pending coordinates before closure...`,
          )

          const syncResult = await trailsApi.saveCoordinates(
            selectedOperation.id,
            trailId,
            pendingCoords,
          )

          if (syncResult.error) {
            throw new Error(`Failed to sync coordinates: ${syncResult.message}`)
          }

          // Remove synced coordinates from pending store
          pendingCoordinatesStore.update((pending) =>
            pending.filter((c) => c.trail_id !== trailId),
          )

          console.log(
            `✅ Synced ${pendingCoords.length} coordinates before closure`,
          )

          // Small delay to ensure DB has processed
          await new Promise((resolve) => setTimeout(resolve, 500))
        }

        // Now close the trail and AWAIT
        console.log(`🔒 Closing trail ${trailId}...`)

        const result = await trailsApi.closeTrail(trailData)

        if (result.error) {
          throw new Error(result.message || "Failed to close trail")
        }

        console.log("✅ Trail closed successfully:", trailId)

        // Convert to GeoJSON and add to historical
        const lineStringPath = {
          type: "LineString",
          coordinates: pathData.map((coord) => [
            coord.longitude,
            coord.latitude,
          ]),
        }

        const historicalTrail = {
          ...result.trail,
          path: lineStringPath,
        }

        historicalTrailStore.update((trails) => [...trails, historicalTrail])

        // Clear everything
        resetTrailState()

        return {
          success: true,
          pointCount: pathData.length,
        }
      } catch (error) {
        // Only log if it's NOT a network error
        if (
          !error.message?.includes("Failed to fetch") &&
          !error.message?.includes("ERR_INTERNET_DISCONNECTED")
        ) {
          console.error("❌ Trail closure error:", error)
        }

        // If ANY error, queue the entire closure for retry
        console.log("📴 Queueing trail closure (failed):", trailId)

        pendingClosuresStore.add({
          trailId,
          trailData,
          pathData,
          pendingCoordinates: pendingCoords,
        })

        resetTrailState()

        throw new Error("QUEUED")
      }
    })()

    // Show toast promise
    toast.promise(
      closurePromise,
      {
        loading:
          pendingCoords.length > 0
            ? `Syncing ${pendingCoords.length} points and closing trail...`
            : "Closing trail...",
        success: (result) => {
          return `Trail saved (${result.pointCount} points)`
        },
        error: (error) => {
          if (error.message === "QUEUED") {
            return `Trail queued for sync (${pathData.length} points) - will save when connection improves`
          }
          return `Failed to save trail: ${error.message}`
        },
      },
      {
        duration: (error) => (error?.message === "QUEUED" ? 5000 : 4000),
      },
    )
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
      trail_id: $currentTrailStore?.id,
    }

    try {
      const result = await trailsApi.saveCoordinates(
        selectedOperation.id,
        $currentTrailStore.id,
        [coordinateWithTimestamp],
      )

      if (result.error) {
        throw new Error(result.message || "Failed to save coordinate")
      }

      // Success - reset failure counter
      consecutiveFailures = 0

      if (hasShownConnectionWarning) {
        hasShownConnectionWarning = false
        toast.success("Connection restored", {
          description: "Trail syncing resumed",
          duration: 2000,
        })
      }

      console.log("✅ Coordinate saved immediately")
    } catch (error) {
      // Only log if it's NOT a network error
      if (
        !error.message?.includes("Failed to fetch") &&
        !error.message?.includes("ERR_INTERNET_DISCONNECTED")
      ) {
        console.warn("❌ Failed to save coordinate, queuing:", error)
      }

      // Queue the coordinate
      pendingCoordinatesStore.add(coordinateWithTimestamp)

      // Update failure counter
      consecutiveFailures++

      // Show warning after multiple failures
      if (consecutiveFailures >= 5 && !hasShownConnectionWarning) {
        hasShownConnectionWarning = true
        const unsavedCount = get(pendingCoordinatesStore).length

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
    // Prevent infinite loop
    if (isSyncing) {
      console.log("⏸️ Sync already in progress, skipping...")
      return
    }

    const coords = get(pendingCoordinatesStore)
    const closures = get(pendingClosuresStore)

    if (coords.length === 0 && closures.length === 0) {
      return
    }

    console.log("🔄 Syncing pending changes:", {
      coordinates: coords.length,
      closures: closures.length,
    })

    isSyncing = true

    try {
      let syncedCoords = 0
      let syncedClosures = 0

      // Sync coordinates first
      if (coords.length > 0) {
        const coordsByTrail = coords.reduce((acc, coord) => {
          const trailId = coord.trail_id
          if (!trailId) {
            console.warn("⚠️ Coordinate missing trail_id:", coord)
            return acc
          }
          if (!acc[trailId]) {
            acc[trailId] = []
          }
          acc[trailId].push(coord)
          return acc
        }, {})

        for (const [trailId, trailCoords] of Object.entries(coordsByTrail)) {
          try {
            const result = await trailsApi.saveCoordinates(
              selectedOperation.id,
              trailId,
              trailCoords,
            )

            if (result.error) {
              throw new Error(result.message)
            }

            // Only remove if successful
            pendingCoordinatesStore.update((pending) =>
              pending.filter((c) => c.trail_id !== trailId),
            )

            syncedCoords += trailCoords.length
            console.log(
              `✅ Synced ${trailCoords.length} coordinates for trail ${trailId}`,
            )
          } catch (error) {
            // Only log unexpected errors
            if (!error.message?.includes("Failed to fetch")) {
              console.error(
                `❌ Failed to sync coordinates for trail ${trailId}:`,
                error,
              )
            }
            // Don't throw - continue with other trails
          }
        }

        // Small delay before closures
        if (syncedCoords > 0) {
          await new Promise((resolve) => setTimeout(resolve, 500))
        }
      }

      // Sync closures after coordinates
      if (closures.length > 0) {
        for (const closure of closures) {
          try {
            // If closure has pending coordinates, sync them first
            if (closure.pendingCoordinates?.length > 0) {
              console.log(
                `📤 Syncing ${closure.pendingCoordinates.length} pending coordinates for closure ${closure.trailId}`,
              )

              const coordResult = await trailsApi.saveCoordinates(
                selectedOperation.id,
                closure.trailId,
                closure.pendingCoordinates,
              )

              if (coordResult.error) {
                throw new Error(
                  `Failed to sync pending coordinates: ${coordResult.message}`,
                )
              }

              await new Promise((resolve) => setTimeout(resolve, 500))
            }

            const result = await trailsApi.closeTrail(closure.trailData)

            if (result.error) {
              throw new Error(result.message)
            }

            // Only remove if successful
            pendingClosuresStore.remove(closure.trailId)
            syncedClosures++

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

            historicalTrailStore.update((trails) => [
              ...trails,
              historicalTrail,
            ])

            console.log(`✅ Synced trail closure: ${closure.trailId}`)
          } catch (error) {
            // Only log unexpected errors
            if (!error.message?.includes("Failed to fetch")) {
              console.error(
                `❌ Failed to sync trail closure ${closure.trailId}:`,
                error,
              )
            }
            // Don't throw - continue with other closures
          }
        }
      }

      // Show success toast if anything was synced
      if (syncedCoords > 0 || syncedClosures > 0) {
        const parts = []
        if (syncedCoords > 0) parts.push(`${syncedCoords} points`)
        if (syncedClosures > 0)
          parts.push(`${syncedClosures} trail${syncedClosures > 1 ? "s" : ""}`)

        toast.success(`Synced ${parts.join(" and ")}`, { duration: 3000 })
      }
    } finally {
      isSyncing = false
    }
  }

  // ============================================
  // RETRY MECHANISM FOR FAILED COORDINATES
  // ============================================

  function startRetryInterval() {
    if (retryIntervalId) return

    retryIntervalId = setInterval(async () => {
      await retryFailedCoordinates()
    }, RETRY_INTERVAL)
  }

  function stopRetryInterval() {
    if (retryIntervalId) {
      clearInterval(retryIntervalId)
      retryIntervalId = null
    }
  }

  async function retryFailedCoordinates() {
    const pendingCoordinates = $pendingCoordinatesStore
    const pendingClosures = $pendingClosuresStore

    if (pendingCoordinates.length === 0 && pendingClosures.length === 0) {
      return
    }

    console.log("🔄 Retrying failed operations...")
    await syncPendingChanges()
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

      if (trailData.vehicle_id === currentVehicleId) {
        return
      }

      if (!trailData.end_time || !trailData.path) {
        return
      }

      fetchTrailAsGeoJSON(trailData.id)
        .then((geoJsonPath) => {
          if (
            !geoJsonPath ||
            !geoJsonPath.coordinates ||
            geoJsonPath.coordinates.length === 0
          ) {
            console.error(`  ❌ Invalid path data for trail ${trailData.id}`)
            return
          }

          const historicalTrail = {
            id: trailData.id,
            vehicle_id: trailData.vehicle_id,
            operation_id: trailData.operation_id,
            start_time: trailData.start_time,
            end_time: trailData.end_time,
            trail_color: trailData.trail_color,
            trail_width: trailData.trail_width,
            path: geoJsonPath,
            detailed_path: trailData.detailed_path,
            trail_distance: trailData.trail_distance,
            trail_hectares: trailData.trail_hectares,
            trail_hectares_overlap: trailData.trail_hectares_overlap,
            trail_percentage_overlap: trailData.trail_percentage_overlap,
            metrics_calculated: trailData.metrics_calculated,
          }

          historicalTrailStore.update((historicalTrails) => {
            return [...historicalTrails, historicalTrail]
          })

          otherActiveTrailStore.update((trails = []) => {
            return trails.filter((trail) => trail.id !== trailData.id)
          })
        })
        .catch((error) => {
          console.error(
            `  ❌ Failed to fetch GeoJSON for trail ${trailData.id}:`,
            error,
          )
        })
    }

    async function fetchTrailAsGeoJSON(trailId) {
      const { data: pathData, error: pathError } = await supabase.rpc(
        "get_trail_path_as_geojson",
        { trail_id_param: trailId },
      )

      if (pathError || !pathData) {
        throw new Error("Failed to fetch path")
      }

      return pathData
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
