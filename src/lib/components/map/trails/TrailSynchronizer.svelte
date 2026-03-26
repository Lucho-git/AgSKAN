<!-- src/lib/components/map/trails/TrailSynchronizer.svelte -->
<script>
  import { onMount, onDestroy } from "svelte"
  import { supabase } from "$lib/supabaseClient"
  import { toast } from "svelte-sonner"
  import { trailsApi } from "$lib/api/trailsApi"
  import { get } from "svelte/store"
  import * as mapboxgl from "mapbox-gl"

  import {
    userVehicleStore,
    userVehicleTrailing,
  } from "$lib/stores/vehicleStore"

  import {
    currentTrailStore,
    coordinateBufferStore,
    pendingCoordinatesStore,
    pendingClosuresStore,
    trailPausedStore,
    trailPausePointStore,
  } from "$lib/stores/currentTrailStore"

  import {
    historicalTrailStore,
    otherActiveTrailStore,
  } from "$lib/stores/otherTrailStore"

  import { mapActivityStore } from "$lib/stores/mapActivityStore"
  import { profileStore } from "$lib/stores/profileStore"
  import { session, initializeSession } from "$lib/stores/sessionStore"

  import { commandStore, COMMANDS } from "$lib/stores/commandStore"
  import {
    persistPendingCoordinate,
    deletePersistedCoordinate,
    clearPersistedCoordinates,
    loadPersistedCoordinates,
    persistPendingClosure,
    clearPersistedClosure,
    loadPersistedClosures,
  } from "$lib/services/db"

  import TrailView from "./TrailView.svelte"

  export let selectedOperation
  export let map

  let supabaseChannel
  let areTrailsLoaded = false
  let channelStatus = "CLOSED" // Track Realtime channel status

  // Retry mechanism for failed coordinates
  let retryIntervalId = null
  const RETRY_INTERVAL = 10000 // 10 seconds

  // Track connection issues to avoid spamming user
  let hasShownConnectionWarning = false
  let consecutiveFailures = 0

  // Prevent infinite sync loop
  let isSyncing = false

  // Pause marker on the map
  let pauseMarker = null

  /** Remove the pause marker from the map if it exists */
  function removePauseMarker() {
    if (pauseMarker) {
      pauseMarker.remove()
      pauseMarker = null
    }
  }

  let cleanup = {
    coordinateBufferUnsubscribe: null,
    pendingCoordinatesUnsubscribe: null,
    commandStoreUnsubscribe: null,
    onlineListener: null,
    offlineListener: null,
    pagehideListener: null,
    beforeunloadListener: null,
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

    // Flush pending data to IndexedDB on page hide / unload (crash safety)
    cleanup.pagehideListener = () => flushPendingToIndexedDB()
    cleanup.beforeunloadListener = () => flushPendingToIndexedDB()
    window.addEventListener("pagehide", cleanup.pagehideListener)
    window.addEventListener("beforeunload", cleanup.beforeunloadListener)

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
          case COMMANDS.TRAIL_PAUSE:
            pauseTrail()
            break
          case COMMANDS.TRAIL_RESUME:
            resumeTrail()
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

    // Recover any pending data that survived a previous crash.
    // Must run AFTER checkOpenTrails so currentTrailStore exists and we can
    // merge recovered coordinates into the visible trail path.
    await recoverPersistedData()

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

    await subscribeToTrailObservation()
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
    if (cleanup.pagehideListener) {
      window.removeEventListener("pagehide", cleanup.pagehideListener)
    }
    if (cleanup.beforeunloadListener) {
      window.removeEventListener("beforeunload", cleanup.beforeunloadListener)
    }

    // Flush on destroy too (normal navigation away)
    flushPendingToIndexedDB()

    if (supabaseChannel) {
      supabase.removeChannel(supabaseChannel)
    }

    stopRetryInterval()
    removePauseMarker()
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

  // ============================================
  // TRAIL PAUSE / RESUME
  // ============================================

  function pauseTrail() {
    if (!$userVehicleTrailing || $trailPausedStore) return

    // Record where we paused
    const coords = $userVehicleStore.coordinates
    if (coords?.latitude && coords?.longitude) {
      trailPausePointStore.set({
        latitude: coords.latitude,
        longitude: coords.longitude,
        timestamp: Date.now(),
      })
    }

    trailPausedStore.set(true)
    toast.info("Trail paused", {
      description: "Recording paused — resume when ready",
      duration: 3000,
    })
  }

  function resumeTrail() {
    if (!$userVehicleTrailing || !$trailPausedStore) return

    // Distance check is now handled by the UI layer (ButtonSection)
    // which shows a confirmation modal before dispatching TRAIL_RESUME

    trailPausedStore.set(false)
    trailPausePointStore.set(null)
    toast.success("Trail resumed", { duration: 2000 })
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

    const trailId = $currentTrailStore.id

    // ── Merge background-synced trail_stream points from the DB ─────────
    // The native HTTP engine may have POSTed coordinates directly to
    // trail_stream (via background_sync RPC) while JS was frozen.
    // The local $currentTrailStore.path only has the JS-collected points.
    // Fetch ALL trail_stream rows from the DB and merge them so the
    // close_trail_fast RPC receives the complete path.
    let pathData = $currentTrailStore.path.map((point) => ({
      latitude: point.coordinates.latitude,
      longitude: point.coordinates.longitude,
      timestamp: point.timestamp,
    }))

    try {
      const { data: dbPoints, error: dbErr } = await supabase
        .from("trail_stream")
        .select("coordinate, timestamp")
        .eq("trail_id", trailId)
        .order("timestamp", { ascending: true })

      if (!dbErr && dbPoints && dbPoints.length > 0) {
        const existingTimestamps = new Set(pathData.map((p) => p.timestamp))

        const extraPoints = dbPoints
          .filter((row) => {
            const ts =
              typeof row.timestamp === "string"
                ? new Date(row.timestamp).getTime()
                : row.timestamp
            return !existingTimestamps.has(ts)
          })
          .map((row) => ({
            latitude: row.coordinate.coordinates[1],
            longitude: row.coordinate.coordinates[0],
            timestamp:
              typeof row.timestamp === "string"
                ? new Date(row.timestamp).getTime()
                : row.timestamp,
          }))

        if (extraPoints.length > 0) {
          console.log(
            `📡 Merged ${extraPoints.length} background-synced trail_stream points (JS had ${pathData.length})`,
          )
          pathData = [...pathData, ...extraPoints].sort(
            (a, b) => a.timestamp - b.timestamp,
          )
        } else {
          console.log(
            `📡 trail_stream had ${dbPoints.length} points, all already in JS store`,
          )
        }
      }
    } catch (fetchErr) {
      console.warn(
        "⚠️ Could not fetch trail_stream points, using JS-only path:",
        fetchErr,
      )
    }

    console.log(
      "🛑 Stopping trail:",
      trailId,
      "with",
      pathData.length,
      "points (after merge)",
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

          // Remove synced coordinates from pending store AND IndexedDB
          pendingCoordinatesStore.update((pending) =>
            pending.filter((c) => c.trail_id !== trailId),
          )
          clearPersistedCoordinates(trailId)

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

        const closurePayload = {
          trailId,
          trailData,
          pathData,
          pendingCoordinates: pendingCoords,
        }
        pendingClosuresStore.add(closurePayload)
        persistPendingClosure(closurePayload)

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
    removePauseMarker()
    currentTrailStore.set(null)
    userVehicleTrailing.set(false)
    trailPausedStore.set(false)
    trailPausePointStore.set(null)
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

    // ── Write-ahead log: persist to IndexedDB BEFORE network send ──
    // This guarantees the data survives even if the fetch hangs forever
    // and the user closes/refreshes the page before the catch block runs.
    const dbRowId = await persistPendingCoordinate(coordinateWithTimestamp)

    try {
      const result = await trailsApi.saveCoordinates(
        selectedOperation.id,
        $currentTrailStore.id,
        [coordinateWithTimestamp],
      )

      if (result.error) {
        throw new Error(result.message || "Failed to save coordinate")
      }

      // Success — remove from write-ahead log
      if (dbRowId != null) {
        deletePersistedCoordinate(dbRowId)
      }

      // Reset failure counter
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

      // Add to in-memory retry queue (already persisted by write-ahead above)
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

            // Only remove if successful — from memory AND IndexedDB
            pendingCoordinatesStore.update((pending) =>
              pending.filter((c) => c.trail_id !== trailId),
            )
            clearPersistedCoordinates(trailId)

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

            // Only remove if successful — from memory AND IndexedDB
            pendingClosuresStore.remove(closure.trailId)
            clearPersistedClosure(closure.trailId)
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
  // INDEXEDDB RECOVERY & FLUSH
  // ============================================

  /**
   * On mount (AFTER checkOpenTrails), load any pending coordinates / closures
   * that were persisted to IndexedDB during a previous session (crash, tab
   * close, etc.) and:
   *  1. Seed the in-memory retry stores so the retry loop syncs them to server.
   *  2. Merge them into currentTrailStore.path so the trail renders immediately.
   */
  async function recoverPersistedData() {
    try {
      const [savedCoords, savedClosures] = await Promise.all([
        loadPersistedCoordinates(),
        loadPersistedClosures(),
      ])

      if (savedCoords.length > 0) {
        console.log(
          `🔄 Recovered ${savedCoords.length} pending coordinates from IndexedDB`,
        )

        // 1. Add to retry queue for server sync
        pendingCoordinatesStore.update((existing) => {
          const existingKeys = new Set(
            existing.map((c) => `${c.trail_id}_${c.timestamp}`),
          )
          const newOnes = savedCoords.filter(
            (c) => !existingKeys.has(`${c.trail_id}_${c.timestamp}`),
          )
          return [...existing, ...newOnes]
        })

        // 2. Merge into the visible trail path so the trail renders on the map
        const currentTrail = get(currentTrailStore)
        if (currentTrail) {
          const trailId = currentTrail.id
          const coordsForThisTrail = savedCoords.filter(
            (c) => c.trail_id === trailId,
          )

          if (coordsForThisTrail.length > 0) {
            // Build a set of existing timestamps to avoid duplicates
            const existingTimestamps = new Set(
              (currentTrail.path || []).map((p) => p.timestamp),
            )

            const newPathPoints = coordsForThisTrail
              .filter((c) => !existingTimestamps.has(c.timestamp))
              .map((c) => ({
                coordinates: c.coordinates,
                timestamp: c.timestamp,
              }))

            if (newPathPoints.length > 0) {
              currentTrailStore.update((trail) => {
                if (!trail) return trail
                const merged = [...(trail.path || []), ...newPathPoints].sort(
                  (a, b) => a.timestamp - b.timestamp,
                )
                return { ...trail, path: merged }
              })

              console.log(
                `🗺️ Merged ${newPathPoints.length} recovered points into visible trail`,
              )
            }
          }
        }
      }

      if (savedClosures.length > 0) {
        console.log(
          `🔄 Recovered ${savedClosures.length} pending closures from IndexedDB`,
        )
        pendingClosuresStore.update((existing) => {
          const existingIds = new Set(existing.map((c) => c.trailId))
          const newOnes = savedClosures.filter(
            (c) => !existingIds.has(c.trailId),
          )
          return [...existing, ...newOnes]
        })
      }

      if (savedCoords.length > 0 || savedClosures.length > 0) {
        toast.info("Recovered unsaved trail data", {
          description: `${savedCoords.length} coordinates and ${savedClosures.length} trail closures from previous session`,
          duration: 5000,
        })

        // Sync immediately — don't wait for the 10s retry interval
        console.log("⚡ Triggering immediate sync for recovered data")
        syncPendingChanges()
      }
    } catch (e) {
      console.warn("⚠️ Failed to recover persisted trail data:", e)
    }
  }

  /**
   * Synchronously-safe flush: write the current in-memory pending stores into
   * IndexedDB.  Called on pagehide / beforeunload / onDestroy so the data
   * survives even if the network request hasn't completed yet.
   *
   * Note: IndexedDB writes are async but browsers guarantee that writes
   * initiated during pagehide will complete before the page is discarded.
   */
  function flushPendingToIndexedDB() {
    try {
      const coords = get(pendingCoordinatesStore)
      const closures = get(pendingClosuresStore)

      // Persist each pending coordinate (idempotent — add() auto-increments so
      // duplicates are possible, but recoverPersistedData de-dupes on load)
      for (const coord of coords) {
        persistPendingCoordinate(coord)
      }
      for (const closure of closures) {
        persistPendingClosure(closure)
      }

      if (coords.length > 0 || closures.length > 0) {
        console.log(
          `💾 Flushed ${coords.length} coordinates + ${closures.length} closures to IndexedDB`,
        )
      }
    } catch (e) {
      console.warn("⚠️ Failed to flush pending data to IndexedDB:", e)
    }
  }

  // ============================================
  // TRAIL SUBSCRIPTION HANDLERS
  // ============================================

  /**
   * Single Supabase Realtime channel for ALL trail observation.
   * Combines both `trails` table CDC (open/close/delete) and
   * `trail_stream` table CDC (live coordinates) into ONE channel.
   *
   * Previously these were two separate channels that overwrote the
   * same `supabaseChannel` variable, causing a leak.  More critically,
   * Supabase Realtime WebSocket connections can silently drop, and
   * there was no monitoring or recovery.  Now we:
   *  1. Use ONE channel with multiple `.on()` handlers
   *  2. Monitor subscription status via the `.subscribe()` callback
   *  3. On reconnection, do a one-time catch-up fetch so no CDC
   *     events are missed during the disconnect window
   */
  async function subscribeToTrailObservation() {
    const currentVehicleId = $profileStore.id
    const opId = selectedOperation.id

    // Clean up any existing channel
    if (supabaseChannel) {
      try {
        supabase.removeChannel(supabaseChannel)
      } catch (_) { /* ignore */ }
    }

    supabaseChannel = supabase
      .channel(`trail_observation_${opId}`)
      // ── trails table: detect new/closed/deleted trails ──
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "trails",
          filter: `operation_id=eq.${opId}`,
        },
        (payload) => handleTrailInsert(payload, currentVehicleId),
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "trails",
          filter: `operation_id=eq.${opId}`,
        },
        (payload) => handleTrailUpdate(payload, currentVehicleId),
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "trails",
          filter: `operation_id=eq.${opId}`,
        },
        (payload) => handleTrailDelete(payload, currentVehicleId),
      )
      // ── trail_stream table: live coordinate stream ──
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "trail_stream",
          filter: `operation_id=eq.${opId}`,
        },
        handleTrailStreamInsert,
      )
      .subscribe((status, err) => {
        channelStatus = status
        if (status === "SUBSCRIBED") {
          console.log(`🟢 [TRAIL-RT] Realtime channel subscribed for operation ${opId.slice(0,8)}`)
        } else if (status === "CHANNEL_ERROR") {
          console.warn(`🔴 [TRAIL-RT] Channel error — will auto-reconnect`, err)
        } else if (status === "TIMED_OUT") {
          console.warn(`🟡 [TRAIL-RT] Channel timed out — will auto-reconnect`)
        } else if (status === "CLOSED") {
          console.log(`⚪ [TRAIL-RT] Channel closed`)
        }

        // Supabase auto-reconnects after CHANNEL_ERROR. When it succeeds,
        // the status goes back to SUBSCRIBED. At that point, fetch any
        // trail data that might have been missed during the disconnect.
        if (status === "SUBSCRIBED" && channelStatus === "SUBSCRIBED") {
          catchUpMissedTrailData(opId, currentVehicleId)
        }
      })
  }

  /**
   * One-time catch-up fetch after a (re)connection to fill any gaps.
   * Only fetches trail_stream rows from the last 5 minutes to keep it light.
   */
  async function catchUpMissedTrailData(opId, currentVehicleId) {
    try {
      // Refresh the list of active trails from the DB
      const { data: activeTrails, error: trailsErr } = await supabase
        .from("trails")
        .select("id, vehicle_id, operation_id, start_time, end_time, trail_color, trail_width, task_id")
        .eq("operation_id", opId)
        .is("end_time", null)
        .neq("vehicle_id", currentVehicleId)

      if (trailsErr) {
        console.warn("[TRAIL-RT] Catch-up: failed to fetch active trails:", trailsErr.message)
        return
      }

      if (!activeTrails || activeTrails.length === 0) return

      // Get trail IDs we know about
      const currentIds = new Set(($otherActiveTrailStore || []).map(t => t.id))

      // Add any newly discovered trails
      for (const t of activeTrails) {
        if (!currentIds.has(t.id)) {
          otherActiveTrailStore.update((trails = []) => [
            ...trails,
            {
              id: t.id,
              vehicle_id: t.vehicle_id,
              operation_id: t.operation_id,
              start_time: t.start_time,
              end_time: t.end_time,
              trail_color: t.trail_color,
              trail_width: t.trail_width,
              task_id: t.task_id,
              path: [],
            },
          ])
          console.log(`[TRAIL-RT] Catch-up: discovered trail ${t.id.slice(0,8)} from ${t.vehicle_id.slice(0,8)}`)
        }
      }

      // Fetch recent trail_stream coordinates (last 5 min) for all active trails
      const trailIds = activeTrails.map(t => t.id)
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()

      const { data: recentPoints, error: pointsErr } = await supabase
        .from("trail_stream")
        .select("trail_id, coordinate, timestamp")
        .in("trail_id", trailIds)
        .gte("timestamp", fiveMinAgo)
        .order("timestamp", { ascending: true })

      if (pointsErr || !recentPoints || recentPoints.length === 0) return

      // Merge into otherActiveTrailStore, deduplicating by timestamp
      otherActiveTrailStore.update((trails) => {
        return trails.map((trail) => {
          const newPoints = recentPoints.filter(p => p.trail_id === trail.id)
          if (newPoints.length === 0) return trail

          const existingTimestamps = new Set(
            (trail.path || []).map(p => {
              const t = typeof p.timestamp === "string" ? new Date(p.timestamp).getTime() : p.timestamp
              return t
            })
          )

          let merged = 0
          const additions = newPoints
            .filter(p => {
              const ts = typeof p.timestamp === "string" ? new Date(p.timestamp).getTime() : p.timestamp
              return !existingTimestamps.has(ts)
            })
            .map(p => ({
              coordinates: {
                latitude: p.coordinate.coordinates[1],
                longitude: p.coordinate.coordinates[0],
              },
              timestamp: typeof p.timestamp === "string" ? new Date(p.timestamp).getTime() : p.timestamp,
            }))

          if (additions.length === 0) return trail
          merged = additions.length

          const updatedPath = [...(trail.path || []), ...additions].sort(
            (a, b) => {
              const aT = typeof a.timestamp === "string" ? new Date(a.timestamp).getTime() : a.timestamp
              const bT = typeof b.timestamp === "string" ? new Date(b.timestamp).getTime() : b.timestamp
              return aT - bT
            }
          )

          console.log(`[TRAIL-RT] Catch-up: merged ${merged} points into trail ${trail.id.slice(0,8)} (total=${updatedPath.length})`)
          return { ...trail, path: updatedPath }
        })
      })
    } catch (e) {
      console.warn("[TRAIL-RT] Catch-up fetch failed:", e)
    }
  }

  function handleTrailInsert(payload, currentVehicleId) {
      if (!payload.new) return
      const trailData = payload.new

      if (trailData.vehicle_id === currentVehicleId) return

      console.log(`🟢 [TRAIL-RT] New trail detected: ${trailData.id?.slice(0,8)} from vehicle ${trailData.vehicle_id?.slice(0,8)}`)

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
          },
        ]
      })
  }

  function handleTrailUpdate(payload, currentVehicleId) {
      if (!payload.new) return
      const trailData = payload.new

      if (trailData.vehicle_id === currentVehicleId) {
        return
      }

      if (!trailData.end_time || !trailData.path) {
        return
      }

      console.log(`🟡 [TRAIL-RT] Trail closed: ${trailData.id?.slice(0,8)}`)

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

  function handleTrailDelete(payload, currentVehicleId) {
      if (!payload.old) return

      const trailData = payload.old

      if (trailData.vehicle_id === currentVehicleId) return

      console.log(`🔴 [TRAIL-RT] Trail deleted: ${trailData.id?.slice(0,8)}`)

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

  function handleTrailStreamInsert(payload) {
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
        const pathLen = trailData ? trailData.length : 0
        console.log(
          `📡 checkOpenTrails: Found open trail ${openTrail.id}, pathLen=${pathLen}, color=${openTrail.trail_color}, width=${openTrail.trail_width}`,
        )
        console.log(`📡 checkOpenTrails: Setting currentTrailStore NOW`)
        currentTrailStore.set({
          ...openTrail,
          start_time: openTrail.start_time,
          trail_color: openTrail.trail_color,
          trail_width: openTrail.trail_width,
          path: trailData || [],
        })
        console.log(
          `📡 checkOpenTrails: currentTrailStore SET, map.isStyleLoaded=${map?.isStyleLoaded?.() ?? "no map"}`,
        )

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
            console.log("Unknown vehilces", activeUsers)

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
