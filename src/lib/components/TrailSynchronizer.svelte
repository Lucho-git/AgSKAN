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
  let syncIntervalId = null
  let areTrailsLoaded = false
  const SYNC_INTERVAL = 5000

  let cleanup = {
    trailingUnsubscribe: null,
    coordinateBufferUnsubscribe: null,
    unsavedCoordinatesUnsubscribe: null,
  }

  // Helper function to make authenticated API calls
  async function authenticatedFetch(url, method = "POST", body = {}) {
    // Get the current session
    const currentSession = get(session)

    if (!currentSession?.user?.id) {
      // If no session available, try to initialize it
      await initializeSession()
      const refreshedSession = get(session)

      if (!refreshedSession?.user?.id) {
        throw new Error("Authentication required")
      }
    }

    // Re-get the session to ensure we have the most up-to-date token
    const activeSession = get(session)

    return fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${activeSession.access_token}`,
      },
      body: method !== "GET" ? JSON.stringify(body) : undefined,
    })
  }

  onMount(async () => {
    console.log("🚀 TrailSynchronizer: Initializing...")

    // Make sure session is initialized
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

        console.log(
          "Pressed trailing button",
          isPressed,
          "Trailing State:",
          $userVehicleTrailing,
        )

        if (!$userVehicleTrailing) {
          console.log("Handling trail creation")
          await handleTrailCreation()
        } else if ($userVehicleTrailing) {
          console.log("Triggering end trail")
          triggerEndTrail()
        }
      })
    })()

    cleanup.coordinateBufferUnsubscribe = coordinateBufferStore.subscribe(
      (newCoordinateBuffer) => {
        if (
          newCoordinateBuffer &&
          newCoordinateBuffer.coordinates &&
          $userVehicleTrailing
        ) {
          processNewCoordinate(newCoordinateBuffer)
        }
      },
    )

    cleanup.unsavedCoordinatesUnsubscribe = unsavedCoordinatesStore.subscribe(
      (coordinates) => {
        if (coordinates.length > 0 && !syncIntervalId) {
          startPeriodicSync()
        } else if (coordinates.length === 0 && syncIntervalId) {
          stopPeriodicSync()
        }
      },
    )

    console.log("active trials", $otherActiveTrailStore)
    await subscribeToTrailChanges()

    await subscribeToTrailStreams()
    console.log("✅ TrailSynchronizer: Setup completed")
  })

  onDestroy(() => {
    console.log("🧹 TrailSynchronizer: Cleaning up resources")
    if (cleanup.trailingUnsubscribe) cleanup.trailingUnsubscribe()
    if (cleanup.coordinateBufferUnsubscribe)
      cleanup.coordinateBufferUnsubscribe()
    if (cleanup.unsavedCoordinatesUnsubscribe)
      cleanup.unsavedCoordinatesUnsubscribe()

    if (supabaseChannel) {
      supabaseChannel.unsubscribe()
    }

    stopPeriodicSync()
    userVehicleTrailing.set(false)
  })

  async function subscribeToTrailChanges() {
    const currentVehicleId = $profileStore.id
    console.log(
      "📡 TrailSynchronizer: Subscribing to trail changes of operation",
      selectedOperation.id,
      "and not vehicle:",
      currentVehicleId,
    )
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
      console.log("🆕 New trail detected:", trailData.id)

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
      console.log("active trails", $otherActiveTrailStore)
    }

    function handleTrailUpdate(payload) {
      console.log("🔄 Trail update detected:", payload)
      if (!payload.new) return
      const trailData = payload.new

      // Filter out our own vehicle's trails
      if (trailData.vehicle_id === currentVehicleId) return

      console.log("🔄 Trail update detected:", trailData.id)

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
        console.log("Updating existing trail:", trailData.id)

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
      console.log("active trails", $otherActiveTrailStore)
    }

    function handleTrailDelete(payload) {
      console.log("🗑️ Trail deletion detected:", payload)
      if (!payload.old) return

      const trailData = payload.old

      // Filter out our own vehicle's trails
      console.log(trailData.vehicle_id === currentVehicleId)
      if (trailData.vehicle_id === currentVehicleId) return

      console.log("🗑️ Trail deletion detected:", trailData.id)

      // Calculate duration in seconds
      const startTime = new Date(trailData.start_time)
      const endTime = new Date(trailData.end_time)
      const durationSeconds = Math.round((endTime - startTime) / 1000)

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

      console.log("active trails", $otherActiveTrailStore)
    }
  }

  async function subscribeToTrailStreams() {
    console.log("📡 TrailSynchronizer: Subscribing to trail streams")
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
                return {
                  ...trail,
                  path: [
                    ...trail.path,
                    {
                      coordinates: {
                        latitude: coordinate.coordinates[1],
                        longitude: coordinate.coordinates[0],
                      },
                      timestamp,
                    },
                  ],
                }
              }
              return trail
            })
          })
        },
      )
      .subscribe()
  }

  function processNewCoordinate(coordinateData) {
    updateTrailPath(coordinateData)

    const coordinateWithTimestamp = {
      coordinates: coordinateData.coordinates,
      timestamp: coordinateData.timestamp,
    }

    unsavedCoordinatesStore.update((coords) => [
      ...coords,
      coordinateWithTimestamp,
    ])
    coordinateBufferStore.set(null)
  }

  function startPeriodicSync() {
    if (syncIntervalId) return

    console.log("🔄 TrailSynchronizer: Starting periodic sync")
    syncIntervalId = setInterval(() => {
      syncUnsavedCoordinates()
    }, SYNC_INTERVAL)
  }

  async function syncUnsavedCoordinates() {
    await sendBatch()
  }

  async function sendBatch() {
    const unsavedCoordinates = $unsavedCoordinatesStore

    if (unsavedCoordinates.length === 0) {
      return
    }

    const coordinatesToSend = [...unsavedCoordinates]
    unsavedCoordinatesStore.set([])

    try {
      console.log(
        `📤 TrailSynchronizer: Sending batch of ${coordinatesToSend.length} coordinates`,
      )

      const result = await trailsApi.saveCoordinates(
        selectedOperation.id,
        $currentTrailStore.id,
        coordinatesToSend.map((coord) => ({
          coordinates: coord.coordinates,
          timestamp: coord.timestamp,
        })),
      )

      if (result.error) {
        throw new Error(result.message || "Failed to save coordinates")
      }

      console.log(
        `✅ TrailSynchronizer: Successfully synced ${coordinatesToSend.length} coordinates`,
      )
    } catch (error) {
      console.log("❌ TrailSynchronizer: Failed to sync coordinates:", error)
      unsavedCoordinatesStore.update((coords) => [
        ...coordinatesToSend,
        ...coords,
      ])
    }
  }

  function stopPeriodicSync() {
    if (syncIntervalId) {
      console.log("⏹️ TrailSynchronizer: Stopping periodic sync")
      clearInterval(syncIntervalId)
      syncIntervalId = null
    }
  }

  async function getOperationTrails(operation_id) {
    try {
      console.log(`Fetching trails for operation ${operation_id}`)

      // Get trails without paths first
      const { data: trails, error: trailsError } = await supabase
        .from("trails")
        .select(
          `
        id,
        vehicle_id,
        operation_id,
        start_time,
        end_time,
        trail_color,
        trail_width
        `,
        )
        .eq("operation_id", operation_id)
        .not("end_time", "is", null)
        .order("start_time", { ascending: true })

      if (trailsError) {
        console.error("Error fetching trails:", trailsError)
        throw new Error(`Failed to fetch trails: ${trailsError.message}`)
      }

      if (!trails || trails.length === 0) {
        console.log("No trails found for this operation")
        return []
      }

      console.log(`Found ${trails.length} trails, fetching path data...`)

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
    console.log("📥 TrailSynchronizer: Fetching operation trails")

    toast.promise(
      (async () => {
        const trails = await getOperationTrails(selectedOperation.id)

        historicalTrailStore.set([])
        historicalTrailStore.update((currentTrails) => [
          ...currentTrails,
          ...trails,
        ])

        areTrailsLoaded = true
        console.log(
          `✅ TrailSynchronizer: Loaded ${trails.length} historical trails`,
        )
        console.log("Operation", selectedOperation)
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
        duration: 4000, // Optional: Adjust the toast duration as needed
      },
    )
  }

  async function checkOpenTrails() {
    try {
      // Using our client-side API instead of authenticatedFetch
      const result = await trailsApi.checkOpenTrails($profileStore.id)

      if (result.error) {
        throw new Error(result.message || "Failed to check for open trails")
      }

      const { openTrail, trailData } = result
      console.log("Opentrail", openTrail, "data", trailData)

      if (openTrail) {
        console.log("🔄 TrailSynchronizer: Found existing open trail")
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
        ) // in minutes

        toast.info(
          `Found existing ${openTrail.trail_width}m ${openTrail.trail_color.toLowerCase()} trail`,
          {
            description: `Started ${timeElapsed} minutes ago. Trailing will continue automatically.`,
            duration: 5000,
          },
        )
      }
    } catch (error) {
      console.error("❌ TrailSynchronizer: Failed to check open trails:", error)
      toast.error("Failed to check for open trails")
    }
  }

  async function checkOtherActiveTrails() {
    const toastPromise = toast.promise(
      (async () => {
        console.log(
          "Getting other active trails... from operation:",
          selectedOperation.id,
          "and profile:",
          $profileStore.id,
        )

        // Using our client-side API instead of authenticatedFetch
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
          console.log(
            `📍 TrailSynchronizer: Found ${activeTrails.length} other active trails`,
            activeTrails,
          )
          const formattedTrails = activeTrails.map((trail) => ({
            id: trail.id,
            vehicle_id: trail.vehicle_id,
            operation_id: trail.operation_id,
            task_id: trail.task_id || null,
            start_time: trail.start_time,
            end_time: trail.end_time,
            trail_color: trail.trail_color,
            trail_width: trail.trail_width,
            path: trail.trailData || [],
            detailed_path: null,
          }))

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
      console.error(
        "❌ TrailSynchronizer: Failed to check other active trails:",
        error,
      )
    }
  }

  async function handleTrailCreation() {
    const vehicleId = $userVehicleStore.vehicle_id

    try {
      await createNewTrail(vehicleId)
    } catch (error) {
      console.error("❌ TrailSynchronizer: Error creating trail:", error)
      toast.error(`Error creating trail: ${error.message}`)
    }
  }

  async function createNewTrail(vehicleId) {
    console.log("🆕 TrailSynchronizer: Creating new trail")

    try {
      const result = await trailsApi.openNewTrail(
        vehicleId,
        selectedOperation.id,
        $userVehicleStore,
      )

      if (result.error) {
        throw new Error(result.message || "Failed to create trail")
      }

      console.log("✅ TrailSynchronizer: New trail created successfully")
      toast.success("New trail created successfully")
      currentTrailStore.set({
        ...result.trail,
        start_time: result.trail.start_time,
        trail_color: result.trail.trail_color,
        trail_width: result.trail.trail_width,
        path: [],
      })
      userVehicleTrailing.set(true)
    } catch (error) {
      console.error("❌ TrailSynchronizer: Error creating trail:", error)
      toast.error(`Error creating trail: ${error.message}`)
      throw error // Re-throw to be handled by the caller
    }
  }

  function updateTrailPath(newCoordinateData) {
    currentTrailStore.update((trail) => {
      if (trail) {
        const updatedPath = [...(trail.path || []), newCoordinateData]
        return { ...trail, path: updatedPath }
      }
      return trail
    })
  }
</script>

<EndTrailModal bind:triggerEndTrail />

{#if areTrailsLoaded}
  <TrailView {map} />
{/if}
