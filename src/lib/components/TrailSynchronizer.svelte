<!-- src/components/TrailSynchronizer.svelte -->
<script>
  import { onMount, onDestroy } from "svelte"
  import { supabase } from "$lib/supabaseClient"
  import { toast } from "svelte-sonner"
  import { get } from "svelte/store"
  import { trailsApi } from "$lib/api/trailsApi"

  import {
    userVehicleStore,
    userVehicleTrailing,
  } from "../../stores/vehicleStore"
  import { trailingButtonPressed } from "$lib/stores/controlStore"
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

  import EndTrailModal from "$lib/components/EndTrailModal.svelte"
  import TrailView from "$lib/components/TrailView.svelte"

  export let selectedOperation
  export let map

  let supabaseChannel
  let triggerEndTrail
  let areTrailsLoaded = false

  // Retry mechanism for failed coordinates
  let retryIntervalId = null
  const RETRY_INTERVAL = 10000 // Retry failed coordinates every 10 seconds

  // Track connection issues to avoid spamming user
  let consecutiveFailures = 0
  let hasShownConnectionWarning = false
  let lastSuccessfulSync = Date.now()

  let cleanup = {
    trailingUnsubscribe: null,
    coordinateBufferUnsubscribe: null,
    unsavedCoordinatesUnsubscribe: null,
  }

  onMount(async () => {
    console.log("🚀 TrailSynchronizer: Initializing")

    await initializeSession()
    await checkOpenTrails()
    await checkOtherActiveTrails()
    await fetchOperationTrails()

    cleanup.trailingUnsubscribe = (() => {
      let initial = true

      return trailingButtonPressed.subscribe(async (isPressed) => {
        if (initial) {
          initial = false
          return
        }

        if (!$userVehicleTrailing) {
          await handleTrailCreation()
        } else if ($userVehicleTrailing) {
          triggerEndTrail()
        }
      })
    })()

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

          // Send coordinate to database immediately
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
    if (cleanup.trailingUnsubscribe) cleanup.trailingUnsubscribe()
    if (cleanup.coordinateBufferUnsubscribe)
      cleanup.coordinateBufferUnsubscribe()
    if (cleanup.unsavedCoordinatesUnsubscribe)
      cleanup.unsavedCoordinatesUnsubscribe()

    if (supabaseChannel) {
      supabaseChannel.unsubscribe()
    }

    stopRetryInterval()
    userVehicleTrailing.set(false)
  })

  // ============================================
  // INSTANT COORDINATE SENDING
  // ============================================

  /**
   * Send a single coordinate immediately to the database
   */
  async function sendCoordinateImmediately(coordinateData) {
    const coordinateWithTimestamp = {
      coordinates: coordinateData.coordinates,
      timestamp: coordinateData.timestamp,
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
    } catch (error) {
      consecutiveFailures++

      // Add to unsaved coordinates for retry
      unsavedCoordinatesStore.update((coords) => [
        ...coords,
        coordinateWithTimestamp,
      ])

      // Only show warning after multiple failures and if not already shown
      // This prevents spam in areas with intermittent connectivity
      if (consecutiveFailures >= 5 && !hasShownConnectionWarning) {
        hasShownConnectionWarning = true
        const unsavedCount = $unsavedCoordinatesStore.length

        toast.warning("Poor connectivity detected", {
          description: `${unsavedCount} trail points queued. Trail continues locally and will sync when connection improves.`,
          duration: 5000,
        })
      }
    }
  }

  // ============================================
  // RETRY MECHANISM FOR FAILED COORDINATES
  // ============================================

  function startRetryInterval() {
    if (retryIntervalId) return

    retryIntervalId = setInterval(() => {
      retryFailedCoordinates()
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
      // Don't spam user with retry failures - they already know about connectivity issues
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

      // Filter out our own vehicle's trails
      if (trailData.vehicle_id === currentVehicleId) return

      // Safety check for undefined or empty store
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

      // Filter out our own vehicle's trails
      if (trailData.vehicle_id === currentVehicleId) return

      // Safety check for undefined or empty store
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

        // Convert the path data to GeoJSON LineString format
        const lineStringPath = {
          type: "LineString",
          coordinates: existingTrail.path.map((point) => [
            point.coordinates.longitude,
            point.coordinates.latitude,
          ]),
        }

        // Create the historical trail object
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

        // Add to historical trail store
        historicalTrailStore.update((historicalTrails) => [
          ...historicalTrails,
          historicalTrail,
        ])

        // Remove from active trails
        return trails.filter((trail) => trail.id !== trailData.id)
      })
    }

    function handleTrailDelete(payload) {
      if (!payload.old) return

      const trailData = payload.old

      // Filter out our own vehicle's trails
      if (trailData.vehicle_id === currentVehicleId) return

      // Add toast notification with more details
      toast.info(`Trail deleted by another user`, {
        description: `${trailData.trail_width}m ${trailData.trail_color.toLowerCase()} trail`,
      })

      // Check and remove from otherActiveTrailStore if present
      if ($otherActiveTrailStore?.length) {
        otherActiveTrailStore.update((trails = []) => {
          return trails.filter((trail) => trail.id !== trailData.id)
        })
      }

      // Check and remove from historicalTrailStore if present
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

          // Safety check for undefined or empty store
          if (!$otherActiveTrailStore?.length) {
            return
          }

          // Check if trail_id exists in otherActiveTrailStore
          const isActiveTrail = $otherActiveTrailStore.some(
            (trail) => trail.id === trail_id,
          )
          if (!isActiveTrail) {
            return
          }

          otherActiveTrailStore.update((trails) => {
            return trails.map((trail) => {
              if (trail.id === trail_id) {
                // Normalize timestamp format
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

                // Sort with consistent format
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
      // Get trails without paths first
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

      // Fetch path data for each trail using our RPC function
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

        // Automatically continue the trail
        userVehicleTrailing.set(true)

        // Calculate time since trail started
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

        // Handle any errors returned from the API
        if (data.errors) {
          data.errors.forEach((error) => {
            toast.error(error, { duration: 6000 })
          })
        }

        const { activeTrails } = data

        if (activeTrails && activeTrails.length > 0) {
          // Normalize initial trail data timestamps
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

          // Get connected profiles from mapActivityStore
          const connectedProfiles = $mapActivityStore?.connected_profiles || []

          // Match active trails with connected profiles
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

  // ============================================
  // TRAIL CREATION
  // ============================================

  async function handleTrailCreation() {
    const vehicleId = $userVehicleStore.vehicle_id

    try {
      await createNewTrail(vehicleId)
    } catch (error) {
      console.error("Error creating trail:", error)
      toast.error(`Error creating trail: ${error.message}`)
    }
  }

  async function createNewTrail(vehicleId) {
    try {
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
    } catch (error) {
      console.error("Error creating trail:", error)
      toast.error(`Error creating trail: ${error.message}`)
      throw error
    }
  }
</script>

<EndTrailModal bind:triggerEndTrail />

{#if areTrailsLoaded}
  <TrailView {map} />
{/if}
