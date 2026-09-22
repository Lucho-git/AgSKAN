<!-- src/lib/components/map/vehicles/VehicleStateSynchronizer.svelte -->

<script lang="ts">
  import { onMount, onDestroy } from "svelte"
  import { supabase } from "$lib/supabaseClient"
  import {
    userVehicleStore,
    otherVehiclesStore,
    serverOtherVehiclesData,
    otherVehiclesDataChanges,
    userVehicleTrailing,
  } from "$lib/stores/vehicleStore"
  import { vehiclePresetStore } from "$lib/stores/vehiclePresetStore"
  import { mapActivityStore } from "$lib/stores/mapActivityStore"
  import { mapPresenceStore } from "$lib/stores/mapPresenceStore"
  import { profileStore } from "$lib/stores/profileStore"
  import { broadcastSilenceRequest } from "$lib/stores/broadcastSilenceStore"
  import { selectedOperationStore } from "$lib/stores/operationStore"
  import { vehicleDataLoaded } from "$lib/stores/loadedStore"
  import { page } from "$app/stores"
  import { toast } from "svelte-sonner"
  import MapActivityToast from "$lib/components/map/toasts/MapActivityToast.svelte"
  import { getVehicleDisplayName } from "$lib/utils/vehicleDisplayName"
  import { App } from "@capacitor/app"
  import { Capacitor } from "@capacitor/core"

  let channel = null
  let appStateListener = null
  let unsubscribe
  let unsubscribeOtherVehicles
  let unsubscribeSilenceRequest
  let lastDatabaseUpdate = 0
  let previousVehicleData = null
  let lastBroadcastFlashState = null // Track last broadcast flash state
  const DATABASE_UPDATE_INTERVAL = 10000 // 10 seconds
  const POLL_INTERVAL_MS = 60000 // 60 seconds – safety-net only (prefer postgres_changes)
  let pollInterval = null

  function parseUpdateTime(value) {
    if (!value) return 0
    const timestamp =
      typeof value === "string" ? new Date(value).getTime() : value
    return Number.isFinite(timestamp) ? timestamp : 0
  }

  function isOlderVehicleUpdate(incoming, existing) {
    if (!incoming || !existing) return false
    const incomingTime = parseUpdateTime(incoming.last_update)
    const existingTime = parseUpdateTime(existing.last_update)
    return incomingTime > 0 && existingTime > 0 && incomingTime < existingTime
  }

  // ── Connected-profile helpers ────────────────────────────────────────────
  // `connected_profiles` (profiles whose master_map_id is this map) is the
  // source of truth for who is actually ON the map right now. The
  // vehicle_state table keeps a row per user forever and is never cleaned up
  // when someone disconnects, so every live/real-time/poll path MUST filter
  // against this list — otherwise dead accounts show up as "Unknown
  // Operator" (name lives on profiles, not vehicle_state).
  function getConnectedProfileMap() {
    const map = new Map()
    for (const p of $mapActivityStore.connected_profiles || []) {
      map.set(p.id, p)
    }
    return map
  }

  function isConnectedUser(profileMap, vehicleId) {
    return vehicleId && profileMap.has(vehicleId)
  }

  // ── "Joined the map" announcements ─────────────────────────────────────
  // Presence is the live roster of who has the map open. We remember the
  // previous snapshot and announce every user who APPEARS after the initial
  // settle — a first-ever join or someone coming back after leaving (incl.
  // app resume). Mirrors the map log's "joined the map" entries. The first
  // seconds count as the initial roster (presence snapshots arrive staggered
  // right after subscribing — no toasting the whole team on startup).
  let presenceInitialized = false
  let presenceSettledAt = 0
  let knownPresence = new Set()

  function announcePresenceJoins(ids) {
    if (!presenceInitialized) {
      presenceInitialized = true
      presenceSettledAt = Date.now()
      knownPresence = new Set(ids)
      return
    }
    if (Date.now() - presenceSettledAt < 5000) {
      knownPresence = new Set(ids)
      return
    }
    const joined = []
    for (const id of ids) {
      // $profileStore.id, not the onMount-local userId (that scope isn't
      // visible here — referencing it threw a ReferenceError and killed the
      // join toast before it could render).
      if (id === $profileStore.id || knownPresence.has(id)) continue
      joined.push(id)
    }
    // Mark everyone as known right away so a staggered presence sync can't
    // double-announce while the data lookups below are in flight.
    knownPresence = new Set(ids)
    for (const id of joined) void announceJoin(id)
  }

  // Say hello to someone who just opened the map. Their profile + machine
  // normally arrive via realtime a beat after the presence event — pull both
  // directly when our caches don't have them yet. This is what used to show
  // "Someone joined" with no vehicle icon, and it seeds the people menu +
  // map markers immediately instead of on the next 60s poll.
  async function announceJoin(id) {
    let profile = getConnectedProfileMap().get(id)
    let vehicle = $serverOtherVehiclesData.find((v) => v.vehicle_id === id)
    try {
      if (!profile?.full_name) {
        const { data, error } = await supabase
          .from("profiles")
          .select(
            "id, full_name, map_role, selected_operation_id, master_map_id",
          )
          .eq("id", id)
          .maybeSingle()
        if (!error && data) {
          // Already retired (removed / signed up out of guest mode) by the
          // time we looked — nobody to announce.
          if (!data.master_map_id) return
          mergeConnectedProfile(data)
          profile = getConnectedProfileMap().get(id) || data
        }
      }
      if (!vehicle) {
        const { data, error } = await supabase
          .from("vehicle_state")
          .select("*")
          .eq("vehicle_id", id)
          .maybeSingle()
        if (!error && data) {
          const profileMap = getConnectedProfileMap()
          serverOtherVehiclesData.update((vehicles) =>
            vehicles.some((v) => v.vehicle_id === id)
              ? vehicles
              : [...vehicles, enrichWithProfile(data, profileMap)],
          )
          const changes = compareData(
            $serverOtherVehiclesData,
            $otherVehiclesStore,
          )
          otherVehiclesDataChanges.set(changes)
          vehicle = data
        }
      }
    } catch (e) {
      console.warn("Join lookup failed (announcing anyway):", e)
    }

    toast.custom(MapActivityToast, {
      id: `join-${id}`,
      class: "toast-dark-heavy-border",
      style: "width: var(--width, 356px);",
      // Joins are worth watching (and tapping Locate on later), so give
      // them twice the default on-screen time.
      duration: 10000,
      componentProps: {
        title: profile?.full_name || "Someone",
        subtitle:
          profile?.map_role === "viewer"
            ? "Joined the map - view only"
            : "Joined the map",
        kind: "vehicle",
        vehicleType: vehicle?.vehicle_marker?.type || null,
        bodyColor:
          vehicle?.vehicle_marker?.bodyColor ||
          vehicle?.vehicle_marker?.color ||
          null,
      },
    })
  }

  // ── "Changed vehicle" announcements ─────────────────────────────────────
  // People can swap their machine while they're on the map. Remember the
  // last known type + colour per vehicle and toast when the TYPE changes —
  // first sighting per vehicle is silent (the join toast covers arrivals),
  // and colour/size-only tweaks stay quiet. Old → new vehicle icons render
  // in the toast's action slot.
  let knownVehicleTypes = new Map()

  function announceVehicleTypeChanges(vehicles) {
    const seen = new Set()
    for (const vehicle of vehicles || []) {
      const id = vehicle.vehicle_id
      const marker = vehicle.vehicle_marker || {}
      const type = marker.type || null
      if (!id || !type) continue
      seen.add(id)

      const prev = knownVehicleTypes.get(id)
      knownVehicleTypes.set(id, {
        type,
        bodyColor: marker.bodyColor || null,
      })
      if (!prev || prev.type === type) continue

      const name = vehicle.full_name || "Someone"
      const oldName = getVehicleDisplayName({
        vehicle_marker: { type: prev.type },
      })
      const newName = getVehicleDisplayName({ vehicle_marker: { type } })
      toast.custom(MapActivityToast, {
        id: `vehicle-change-${id}`,
        class: "toast-dark-heavy-border",
        style: "width: var(--width, 356px);",
        componentProps: {
          title: name,
          subtitle: `Changed vehicle - ${oldName} → ${newName}`,
          kind: "vehicle",
          vehicleType: prev.type,
          bodyColor: prev.bodyColor,
          secondaryVehicleType: type,
          secondaryBodyColor: marker.bodyColor || null,
        },
      })
    }
    // Forget vehicles that left the map — a future return is an arrival,
    // not a type change.
    for (const id of [...knownVehicleTypes.keys()]) {
      if (!seen.has(id)) knownVehicleTypes.delete(id)
    }
  }

  // Merge a changed profile into connected_profiles so isConnectedUser()
  // starts passing for them immediately — no page refresh needed when a
  // guest joins or renames themselves.
  function mergeConnectedProfile(profileRow) {
    mapActivityStore.update((state) => {
      const list = [...(state.connected_profiles || [])]
      const idx = list.findIndex((p) => p.id === profileRow.id)
      const patch = {
        id: profileRow.id,
        full_name: profileRow.full_name,
        map_role: profileRow.map_role || null,
      }
      if (idx === -1) {
        list.push({
          selected_operation_id: profileRow.selected_operation_id || null,
          current_operation: null,
          operation_name: "No operation",
          operation_id: null,
          ...patch,
        })
      } else {
        list[idx] = { ...list[idx], ...patch }
      }
      return { ...state, connected_profiles: list }
    })
  }

  // A profile on this map changed (joined / renamed / re-roled). Track them,
  // then push their vehicle row through the normal change pipeline so the
  // people/vehicles menu updates live instead of after a reload.
  async function handleProfileChanged(profileRow) {
    mergeConnectedProfile(profileRow)
    try {
      const { data, error } = await supabase
        .from("vehicle_state")
        .select("*")
        .eq("vehicle_id", profileRow.id)
        .maybeSingle()
      if (error || !data) return

      const profileMap = getConnectedProfileMap()
      serverOtherVehiclesData.update((vehicles) => {
        const idx = vehicles.findIndex((v) => v.vehicle_id === profileRow.id)
        if (idx === -1) {
          return [...vehicles, enrichWithProfile(data, profileMap)]
        }
        if (isOlderVehicleUpdate(data, vehicles[idx])) {
          // Keep the newer position, but refresh profile-derived fields.
          return vehicles.map((v, i) =>
            i === idx ? { ...v, ...enrichWithProfile(v, profileMap) } : v,
          )
        }
        return vehicles.map((v, i) =>
          i === idx ? { ...v, ...enrichWithProfile(data, profileMap) } : v,
        )
      })

      const changes = compareData($serverOtherVehiclesData, $otherVehiclesStore)
      otherVehiclesDataChanges.set(changes)
    } catch (e) {
      console.warn("Profile refresh failed:", e)
    }
  }

  // Re-read the map's profile list (used by the poll so stale entries —
  // removed or expired guests — drop out of every filter within a minute).
  async function refreshConnectedProfiles() {
    const mapId = $profileStore.master_map_id
    if (!mapId) return
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, map_role, selected_operation_id")
        .eq("master_map_id", mapId)
      if (error || !data) return
      mapActivityStore.update((state) => {
        const existing = state.connected_profiles || []
        const list = data.map((p) => {
          const prev = existing.find((c) => c.id === p.id)
          return prev
            ? { ...prev, ...p }
            : {
                selected_operation_id: p.selected_operation_id || null,
                current_operation: null,
                operation_name: "No operation",
                operation_id: null,
                ...p,
              }
        })
        return { ...state, connected_profiles: list }
      })
    } catch (e) {
      /* best effort */
    }
  }

  // Merge profile data (name + operation) onto a raw vehicle_state row.
  function enrichWithProfile(row, profileMap) {
    const profile = profileMap.get(row.vehicle_id)
    if (!profile) return row
    return {
      ...row,
      full_name:
        profile.full_name ||
        (profile.map_role === "viewer" ? "Visitor" : null) ||
        row.full_name ||
        "Unknown User",
      map_role: profile.map_role ?? row.map_role ?? null,
      selected_operation_id:
        row.selected_operation_id ?? profile.selected_operation_id ?? null,
      current_operation:
        row.current_operation ?? profile.current_operation ?? null,
      operation_name:
        row.operation_name || profile.operation_name || "No operation",
      operation_id: row.operation_id || profile.operation_id || null,
    }
  }

  async function fetchUserVehicleData(userId) {
    const { data, error } = await supabase
      .from("vehicle_state")
      .select("*")
      .eq("vehicle_id", userId)
      .single()

    if (error) {
      console.error("Error fetching user vehicle data:", error)
      return null
    }

    return data
  }

  async function fetchInitialVehicleData(masterMapId, userId) {
    console.log("🔍 mapActivityStore vehicle_states:", $mapActivityStore)
    console.log(
      "🔍 mapActivityStore connected_profiles:",
      $mapActivityStore.connected_profiles,
    )

    const vehicles = $mapActivityStore.vehicle_states || []
    const profileMap = getConnectedProfileMap()

    const vehiclesWithProfiles = vehicles
      // Only include vehicles whose owner is still connected to THIS map —
      // prevents historical/dead vehicle_state rows from resurrecting.
      .filter((vehicle) => isConnectedUser(profileMap, vehicle.vehicle_id))
      .map((vehicle) => enrichWithProfile(vehicle, profileMap))

    return vehiclesWithProfiles.filter(
      (vehicle) => vehicle.vehicle_id !== userId,
    )
  }

  function compareData(serverData, clientData) {
    const changes = serverData.map((serverItem) => {
      const clientItem = clientData.find(
        (item) => item.vehicle_id === serverItem.vehicle_id,
      )

      const change = {
        vehicle_id: serverItem.vehicle_id,
        coordinates: serverItem.coordinates,
        heading: serverItem.heading,
        vehicle_marker: serverItem.vehicle_marker,
        is_trailing: serverItem.is_trailing,
        last_update: serverItem.last_update,
        speed: serverItem.speed,
        is_flashing: serverItem.is_flashing || false,
        flash_started_at: serverItem.flash_started_at || null,
        flash_reason: serverItem.flash_reason || null,
        flash_color: serverItem.flash_color || null,
        full_name: serverItem.full_name || clientItem?.full_name,
        map_role: serverItem.map_role || clientItem?.map_role || null,
        selected_operation_id:
          serverItem.selected_operation_id || clientItem?.selected_operation_id,
        current_operation:
          serverItem.current_operation || clientItem?.current_operation,
        operation_name: serverItem.operation_name || clientItem?.operation_name,
        operation_id: serverItem.operation_id || clientItem?.operation_id,
        update_types: [],
      }

      if (!clientItem) {
        change.update_types.push("new_vehicle")
      } else {
        const sm = serverItem.vehicle_marker || {}
        const cm = clientItem.vehicle_marker || {}
        const vehicleMarkerChanged =
          sm.size !== cm.size ||
          sm.type !== cm.type ||
          sm.bodyColor !== cm.bodyColor ||
          sm.swath !== cm.swath
        const coordinatesChanged =
          serverItem.coordinates !== clientItem.coordinates
        const headingChanged = serverItem.heading !== clientItem.heading
        const isTrailingChanged =
          serverItem.is_trailing !== clientItem.is_trailing
        const lastUpdateChanged =
          serverItem.last_update !== clientItem.last_update
        const operationChanged =
          serverItem.operation_name !== clientItem.operation_name
        const speedChanged = serverItem.speed !== clientItem.speed
        const flashChanged =
          serverItem.is_flashing !== clientItem.is_flashing ||
          serverItem.flash_reason !== clientItem.flash_reason ||
          serverItem.flash_color !== clientItem.flash_color

        if (vehicleMarkerChanged)
          change.update_types.push("vehicle_marker_changed")
        if (coordinatesChanged) change.update_types.push("position_changed")
        if (headingChanged) change.update_types.push("heading_changed")
        if (isTrailingChanged)
          change.update_types.push("trailing_status_changed")
        if (lastUpdateChanged) change.update_types.push("last_update_changed")
        if (operationChanged) change.update_types.push("operation_changed")
        if (speedChanged) change.update_types.push("speed_changed")
        if (flashChanged) change.update_types.push("flash_state_changed")
      }

      return change
    })

    // Vehicles that exist on the client but are no longer in the server set
    // (owner disconnected / removed from map) → emit removal changes so the
    // list and markers don't keep stale/dead entries.
    const serverIds = new Set(serverData.map((v) => v.vehicle_id))
    const removed = (clientData || [])
      .filter((v) => !serverIds.has(v.vehicle_id))
      .map((v) => ({
        vehicle_id: v.vehicle_id,
        update_types: ["vehicle_removed"],
      }))

    return [...changes, ...removed].filter(
      (change) => change.update_types.length > 0,
    )
  }

  /**
   * Polling fallback: periodically query vehicle_state so observers
   * always see recent positions even when broadcast (JS-only) and
   * postgres_changes (requires Realtime publication) both fail.
   * Critical for background-sync scenarios where the native HTTP
   * engine writes directly to the DB.
   */
  async function pollVehicleStates() {
    const userId = $profileStore.id
    const masterMapId = $profileStore.master_map_id

    if (!masterMapId || !userId) return

    try {
      // Pick up anyone who joined/left since the last cycle first — the
      // connected filter below depends on it (removed guests get pruned).
      await refreshConnectedProfiles()

      const { data, error } = await supabase
        .from("vehicle_state")
        .select("*")
        .eq("master_map_id", masterMapId)
        .neq("vehicle_id", userId)

      if (error) {
        console.warn("⚠️ Poll vehicle_state error:", error)
        return
      }

      if (!data || data.length === 0) return

      // Only keep rows whose owner is still connected to THIS map. Without
      // this, the poll resurrects every historical vehicle_state row ever
      // written for the map (dead accounts) with no name.
      const profileMap = getConnectedProfileMap()
      const connectedData = data.filter((row) =>
        isConnectedUser(profileMap, row.vehicle_id),
      )

      let hasUpdate = false
      serverOtherVehiclesData.update((vehicles) => {
        // Prune vehicles whose owner is no longer connected to this map.
        const pruned = vehicles.filter((v) =>
          isConnectedUser(profileMap, v.vehicle_id),
        )
        for (const rawRow of connectedData) {
          const row = enrichWithProfile(rawRow, profileMap)
          const idx = pruned.findIndex((v) => v.vehicle_id === row.vehicle_id)
          if (idx !== -1) {
            const existing = pruned[idx]
            // Only update if polled data is newer
            const existingTs =
              typeof existing.last_update === "string"
                ? new Date(existing.last_update).getTime()
                : existing.last_update || 0
            const newTs =
              typeof row.last_update === "string"
                ? new Date(row.last_update).getTime()
                : row.last_update || 0

            if (newTs > existingTs) {
              pruned[idx] = { ...existing, ...row }
              hasUpdate = true
            }
          } else {
            pruned.push(row)
            hasUpdate = true
          }
        }
        return pruned
      })

      if (hasUpdate) {
        console.log(`🔄 [POLL] vehicle_state poll found newer data`)
        const changes = compareData(
          $serverOtherVehiclesData,
          $otherVehiclesStore,
        )
        otherVehiclesDataChanges.set(changes)
      }
    } catch (e) {
      console.warn("⚠️ Poll vehicle_state exception:", e)
    }
  }

  // Clear a vehicle's broadcast state in every local list (used when a
  // teammate silences someone's broadcast).
  function clearVehicleBroadcast(vehicleId) {
    const clear = (v) =>
      v.vehicle_id === vehicleId
        ? { ...v, is_flashing: false, flash_reason: null, flash_color: null }
        : v
    otherVehiclesStore.update((list) => (list || []).map(clear))
    serverOtherVehiclesData.update((list) => (list || []).map(clear))
  }

  async function broadcastVehicleState(vehicleData) {
    const userId = $profileStore.id
    const masterMapId = $profileStore.master_map_id

    const {
      coordinates,
      last_update,
      heading,
      vehicle_marker,
      speed,
      is_flashing,
      flash_started_at,
      flash_reason,
      flash_color,
    } = vehicleData

    if (!coordinates) {
      console.warn("Coordinates not available. Skipping vehicle state update.")
      return
    }

    const currentOp = $selectedOperationStore

    const vehicleStateData = {
      vehicle_id: userId,
      master_map_id: masterMapId,
      coordinates: `(${coordinates.longitude},${coordinates.latitude})`,
      last_update: new Date(last_update).toISOString(),
      is_trailing: $userVehicleTrailing,
      vehicle_marker,
      heading: heading !== null ? heading : null,
      speed: speed !== null && speed !== undefined ? speed : 0,
      selected_operation_id: currentOp?.id ?? null,
      operation_id: currentOp?.id ?? null,
      operation_name: currentOp?.name ?? "No operation",
    }

    // Only include flash data if it has changed
    const currentFlashState = {
      is_flashing: is_flashing || false,
      flash_reason: flash_reason || null,
      flash_color: flash_color || null,
    }

    const flashStateChanged =
      !lastBroadcastFlashState ||
      lastBroadcastFlashState.is_flashing !== currentFlashState.is_flashing ||
      lastBroadcastFlashState.flash_reason !== currentFlashState.flash_reason ||
      lastBroadcastFlashState.flash_color !== currentFlashState.flash_color

    if (flashStateChanged) {
      vehicleStateData.is_flashing = currentFlashState.is_flashing
      vehicleStateData.flash_started_at = flash_started_at
        ? new Date(flash_started_at).toISOString()
        : null
      vehicleStateData.flash_reason = currentFlashState.flash_reason
      vehicleStateData.flash_color = currentFlashState.flash_color

      console.log("⚡ Flash state changed, broadcasting:", {
        vehicle_id: userId,
        is_flashing: vehicleStateData.is_flashing,
        flash_reason: vehicleStateData.flash_reason,
      })

      lastBroadcastFlashState = currentFlashState
    }

    try {
      await channel.send({
        type: "broadcast",
        event: "vehicle_update",
        payload: vehicleStateData,
      })
    } catch (error) {
      console.error("Error broadcasting vehicle state:", error)
    }
  }

  async function updateDatabaseVehicleState(vehicleData, forceUpdate = false) {
    const userId = $profileStore.id
    const masterMapId = $profileStore.master_map_id

    const {
      coordinates,
      last_update,
      heading,
      vehicle_marker,
      speed,
      is_flashing,
      flash_started_at,
      flash_reason,
      flash_color,
    } = vehicleData

    if (!coordinates) {
      console.warn("Coordinates not available. Skipping database update.")
      return
    }

    const hasNonMovementChanges =
      previousVehicleData &&
      (JSON.stringify(vehicleData.vehicle_marker) !==
        JSON.stringify(previousVehicleData.vehicle_marker) ||
        vehicleData.is_trailing !== previousVehicleData.is_trailing ||
        vehicleData.is_flashing !== previousVehicleData.is_flashing ||
        vehicleData.flash_reason !== previousVehicleData.flash_reason ||
        vehicleData.flash_color !== previousVehicleData.flash_color)

    const currentTime = Date.now()
    const shouldUpdate =
      forceUpdate ||
      hasNonMovementChanges ||
      lastDatabaseUpdate === 0 ||
      currentTime - lastDatabaseUpdate >= DATABASE_UPDATE_INTERVAL

    if (!shouldUpdate) {
      return
    }

    const vehicleStateData = {
      vehicle_id: userId,
      master_map_id: masterMapId,
      coordinates: `(${coordinates.longitude},${coordinates.latitude})`,
      last_update: new Date(last_update).toISOString(),
      is_trailing: $userVehicleTrailing,
      vehicle_marker,
      heading: heading !== null ? heading : null,
      speed: speed !== null && speed !== undefined ? speed : 0,
      is_flashing: is_flashing || false,
      flash_started_at: flash_started_at
        ? new Date(flash_started_at).toISOString()
        : null,
      flash_reason: flash_reason || null,
      flash_color: flash_color || null,
    }

    const { data, error } = await supabase
      .from("vehicle_state")
      .upsert(vehicleStateData)
      .single()

    if (error) {
      console.error("Error updating vehicle state in database:", error)
    } else {
      lastDatabaseUpdate = currentTime
    }

    previousVehicleData = { ...vehicleData }
  }

  onMount(async () => {
    console.log("Initializing VehicleStateSynchronizer")
    const userId = $profileStore.id
    const masterMapId = $profileStore.master_map_id

    console.log("📦 Loading vehicle presets for map:", masterMapId)
    await vehiclePresetStore.loadPresetsForMap(masterMapId)
    console.log("📦 Presets loaded:", $vehiclePresetStore)

    const userVehicle = await fetchUserVehicleData(userId)

    let parsedCoordinates = null
    let vehicleData = null

    if (userVehicle) {
      if (userVehicle.coordinates) {
        const [longitude, latitude] = userVehicle.coordinates
          .slice(1, -1)
          .split(",")
          .map(parseFloat)
        parsedCoordinates = { latitude, longitude }
      }
      vehicleData = userVehicle

      // Initialize last broadcast flash state
      lastBroadcastFlashState = {
        is_flashing: userVehicle.is_flashing || false,
        flash_reason: userVehicle.flash_reason || null,
        flash_color: userVehicle.flash_color || null,
      }
    } else {
      vehicleData = {
        vehicle_id: userId,
        coordinates: null,
        last_update: null,
        heading: null,
        is_trailing: false,
        speed: 0,
        is_flashing: false,
        flash_started_at: null,
        flash_reason: null,
        flash_color: null,
        vehicle_marker: {
          type: "Pointer",
          bodyColor: "Yellow",
          size: 45,
          swath: 4,
        },
        master_map_id: masterMapId,
      }

      lastBroadcastFlashState = {
        is_flashing: false,
        flash_reason: null,
        flash_color: null,
      }
    }

    const currentUserProfile = $mapActivityStore.connected_profiles.find(
      (p) => p.id === userId,
    )

    console.log(
      "🔍 Current user profile with operation data:",
      currentUserProfile,
    )

    userVehicleStore.update((vehicle) => {
      return {
        ...vehicle,
        ...vehicleData,
        coordinates: parsedCoordinates,
        selected_operation_id:
          currentUserProfile?.selected_operation_id || null,
        current_operation: currentUserProfile?.current_operation || null,
        operation_name: currentUserProfile?.operation_name || "No operation",
        operation_id: currentUserProfile?.operation_id || null,
      }
    })

    const initialVehicles = await fetchInitialVehicleData(masterMapId, userId)
    console.log("Initial vehicle data:", initialVehicles)
    serverOtherVehiclesData.set(initialVehicles)

    const changes = compareData($serverOtherVehiclesData, $otherVehiclesStore)
    otherVehiclesDataChanges.set(changes)

    channel = supabase
      .channel(`vehicle_updates_${masterMapId}`, {
        config: { presence: { key: userId } },
      })
      .on("presence", { event: "sync" }, () => {
        // Who has the app open right now (used by messaging: online → popup,
        // offline → phone notification).
        const presenceIds = new Set(Object.keys(channel.presenceState()))
        mapPresenceStore.set(presenceIds)
        // Let the team know when someone joins / returns to the map.
        announcePresenceJoins(presenceIds)
      })
      .on("broadcast", { event: "vehicle_update" }, (payload) => {
        const profileMap = getConnectedProfileMap()
        if (
          payload.payload.vehicle_id !== userId &&
          isConnectedUser(profileMap, payload.payload.vehicle_id)
        ) {
          serverOtherVehiclesData.update((vehicles) => {
            // Prune any vehicle whose owner is no longer connected.
            const pruned = vehicles.filter((v) =>
              isConnectedUser(profileMap, v.vehicle_id),
            )
            const existingVehicleIndex = pruned.findIndex(
              (vehicle) => vehicle.vehicle_id === payload.payload.vehicle_id,
            )
            if (existingVehicleIndex !== -1) {
              const existingVehicle = pruned[existingVehicleIndex]

              if (isOlderVehicleUpdate(payload.payload, existingVehicle)) {
                console.warn(
                  `⏳ Ignoring older broadcast vehicle_update from ${payload.payload.vehicle_id?.slice(0, 8)}`,
                  {
                    incoming: payload.payload.last_update,
                    existing: existingVehicle.last_update,
                  },
                )
                return pruned
              }

              // Only update flash state if it's included in the payload
              const updatedVehicle = {
                ...existingVehicle,
                ...enrichWithProfile(payload.payload, profileMap),
              }

              // If flash data is in payload, update it; otherwise keep existing
              if ("is_flashing" in payload.payload) {
                updatedVehicle.is_flashing =
                  payload.payload.is_flashing || false
                updatedVehicle.flash_started_at =
                  payload.payload.flash_started_at || null
                updatedVehicle.flash_reason =
                  payload.payload.flash_reason || null
                updatedVehicle.flash_color = payload.payload.flash_color || null
              }

              pruned[existingVehicleIndex] = updatedVehicle
            } else {
              console.log("pushing new vehicle", payload.payload)
              pruned.push(enrichWithProfile(payload.payload, profileMap))
            }
            return pruned
          })

          const changes = compareData(
            $serverOtherVehiclesData,
            $otherVehiclesStore,
          )
          otherVehiclesDataChanges.set(changes)
        }
      })
      .on("broadcast", { event: "broadcast_silence" }, (payload) => {
        const targetId = payload.payload?.vehicle_id
        if (!targetId) return

        // It's MY broadcast — stop it locally so my client stops re-asserting
        // the flashing state on its next vehicle-state write, and tell me
        // who did it.
        if (targetId === userId) {
          userVehicleStore.update((vehicle) => ({
            ...vehicle,
            is_flashing: false,
            flash_started_at: null,
            flash_reason: null,
            flash_color: null,
          }))
          toast.info("Broadcast silenced", {
            description: `${payload.payload?.by_name || "A teammate"} stopped your broadcast.`,
          })
        }

        clearVehicleBroadcast(targetId)
      })
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "vehicle_state",
          filter: `master_map_id=eq.${masterMapId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const removedId = payload.old?.vehicle_id
            if (removedId && removedId !== userId) {
              // Their vehicle row was removed outright (guest signed up and
              // left / removed by a team member / expiry cron) — drop them
              // from the live roster too, so they vanish from the people
              // menu and markers now, not once the 60s poll catches up.
              const profiles = $mapActivityStore.connected_profiles || []
              if (profiles.some((p) => p.id === removedId)) {
                mapActivityStore.update((state) => ({
                  ...state,
                  connected_profiles: (state.connected_profiles || []).filter(
                    (p) => p.id !== removedId,
                  ),
                }))
              }
              serverOtherVehiclesData.update((vehicles) =>
                vehicles.filter((v) => v.vehicle_id !== removedId),
              )
              const changes = compareData(
                $serverOtherVehiclesData,
                $otherVehiclesStore,
              )
              otherVehiclesDataChanges.set(changes)
            }
            return
          }

          const profileMap = getConnectedProfileMap()
          if (
            payload.new.vehicle_id !== userId &&
            isConnectedUser(profileMap, payload.new.vehicle_id)
          ) {
            serverOtherVehiclesData.update((vehicles) => {
              // Prune any vehicle whose owner is no longer connected.
              const pruned = vehicles.filter((v) =>
                isConnectedUser(profileMap, v.vehicle_id),
              )
              const existingVehicleIndex = pruned.findIndex(
                (vehicle) => vehicle.vehicle_id === payload.new.vehicle_id,
              )
              if (existingVehicleIndex !== -1) {
                if (
                  isOlderVehicleUpdate(
                    payload.new,
                    pruned[existingVehicleIndex],
                  )
                ) {
                  console.warn(
                    `⏳ Ignoring older CDC vehicle_state from ${payload.new.vehicle_id?.slice(0, 8)}`,
                    {
                      incoming: payload.new.last_update,
                      existing: pruned[existingVehicleIndex].last_update,
                    },
                  )
                  return pruned
                }

                pruned[existingVehicleIndex] = {
                  ...pruned[existingVehicleIndex],
                  ...enrichWithProfile(payload.new, profileMap),
                  // Explicitly include flash data from postgres update
                  is_flashing: payload.new.is_flashing || false,
                  flash_started_at: payload.new.flash_started_at || null,
                  flash_reason: payload.new.flash_reason || null,
                  flash_color: payload.new.flash_color || null,
                }
              } else {
                console.log("pushing new vehicle", payload.new)
                pruned.push(enrichWithProfile(payload.new, profileMap))
              }
              return pruned
            })

            const changes = compareData(
              $serverOtherVehiclesData,
              $otherVehiclesStore,
            )
            otherVehiclesDataChanges.set(changes)
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "profiles",
          filter: `master_map_id=eq.${masterMapId}`,
        },
        (payload) => {
          // Someone joined / renamed themselves on this map — surface them
          // immediately instead of waiting for the next reload or poll.
          if (!payload.new?.id || payload.new.id === userId) return
          handleProfileChanged(payload.new)
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          channel.track({
            user_id: userId,
            online_at: new Date().toISOString(),
          })
        }
      })

    // Messaging presence: when the app goes to the background, drop out of
    // the online set so senders know to push a phone notification instead of
    // relying on an in-app popup nobody can see. Re-join on return.
    try {
      if (Capacitor.isNativePlatform()) {
        App.addListener("appStateChange", ({ isActive }) => {
          if (!channel) return
          try {
            if (isActive) {
              channel.track({
                user_id: userId,
                online_at: new Date().toISOString(),
              })
            } else {
              channel.untrack()
            }
          } catch (error) {
            console.warn("Presence app-state update failed:", error)
          }
        }).then((listener) => {
          appStateListener = listener
        })
      }
    } catch (error) {
      console.warn("Could not register appStateChange for presence:", error)
    }

    // Reliable polling fallback — catches background-sync DB writes
    // even when broadcast + postgres_changes both miss
    pollInterval = setInterval(pollVehicleStates, POLL_INTERVAL_MS)

    unsubscribe = userVehicleStore.subscribe(async (vehicleData) => {
      await broadcastVehicleState(vehicleData)
      await updateDatabaseVehicleState(vehicleData)
    })

    // Watch the other machines for vehicle-type swaps ("Changed vehicle").
    unsubscribeOtherVehicles = otherVehiclesStore.subscribe(
      announceVehicleTypeChanges,
    )

    // Silence requests raised from the UI (tapping a broadcasting teammate
    // vehicle). Relay the signal to every connected client AND clear the
    // vehicle's row so the silence sticks for anyone offline too.
    unsubscribeSilenceRequest = broadcastSilenceRequest.subscribe(
      async (request) => {
        if (!request?.vehicleId || !channel) return
        const payload = {
          vehicle_id: request.vehicleId,
          by_id: userId,
          by_name: $profileStore.full_name || "A teammate",
        }
        channel
          .send({ type: "broadcast", event: "broadcast_silence", payload })
          .catch((error) => {
            console.warn("Could not send broadcast silence:", error)
          })
        const { error } = await supabase
          .from("vehicle_state")
          .update({
            is_flashing: false,
            flash_reason: null,
            flash_color: null,
          })
          .eq("vehicle_id", request.vehicleId)
        if (error) {
          console.warn("Could not clear silenced broadcast row:", error)
        }
        clearVehicleBroadcast(request.vehicleId)
        broadcastSilenceRequest.set(null)
      },
    )

    vehicleDataLoaded.set(true)
  })

  onDestroy(() => {
    mapPresenceStore.set(new Set())
    if (appStateListener) {
      appStateListener.remove()
      appStateListener = null
    }
    if (pollInterval) {
      clearInterval(pollInterval)
      pollInterval = null
    }
    if (channel) {
      supabase.removeChannel(channel)
    }
    if (unsubscribe) {
      unsubscribe()
    }
    if (unsubscribeOtherVehicles) {
      unsubscribeOtherVehicles()
      unsubscribeOtherVehicles = null
    }
    if (unsubscribeSilenceRequest) {
      unsubscribeSilenceRequest()
      unsubscribeSilenceRequest = null
    }
  })
</script>
