<!-- src/components/VehicleStateSynchronizer.svelte -->

<script lang="ts">
  import { onMount, onDestroy } from "svelte"
  import { supabase } from "../lib/supabaseClient"
  import {
    userVehicleStore,
    otherVehiclesStore,
    serverOtherVehiclesData,
    otherVehiclesDataChanges,
    userVehicleTrailing,
  } from "../stores/vehicleStore"
  import { vehiclePresetStore } from "$lib/stores/vehiclePresetStore"
  import { mapActivityStore } from "$lib/stores/mapActivityStore"
  import { profileStore } from "$lib/stores/profileStore"
  import { vehicleDataLoaded } from "../stores/loadedStore"
  import { page } from "$app/stores"

  let channel = null
  let unsubscribe
  let lastDatabaseUpdate = 0
  let previousVehicleData = null
  let lastBroadcastFlashState = null // Track last broadcast flash state
  const DATABASE_UPDATE_INTERVAL = 10000 // 10 seconds

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

    const vehiclesWithProfiles = await Promise.all(
      vehicles.map(async (vehicle) => {
        const profile = $mapActivityStore.connected_profiles.find(
          (p) => p.id === vehicle.vehicle_id,
        )

        return {
          ...vehicle,
          full_name: profile?.full_name || "Unknown User",
          selected_operation_id: profile?.selected_operation_id || null,
          current_operation: profile?.current_operation || null,
          operation_name: profile?.operation_name || "No operation",
          operation_id: profile?.operation_id || null,
        }
      }),
    )

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
        full_name: serverItem.full_name || clientItem?.full_name,
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
        const vehicleMarkerChanged =
          JSON.stringify(serverItem.vehicle_marker) !==
          JSON.stringify(clientItem.vehicle_marker)
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
          serverItem.flash_reason !== clientItem.flash_reason

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

    return changes.filter((change) => change.update_types.length > 0)
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
    } = vehicleData

    if (!coordinates) {
      console.warn("Coordinates not available. Skipping vehicle state update.")
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
    }

    // Only include flash data if it has changed
    const currentFlashState = {
      is_flashing: is_flashing || false,
      flash_reason: flash_reason || null,
    }

    const flashStateChanged =
      !lastBroadcastFlashState ||
      lastBroadcastFlashState.is_flashing !== currentFlashState.is_flashing ||
      lastBroadcastFlashState.flash_reason !== currentFlashState.flash_reason

    if (flashStateChanged) {
      vehicleStateData.is_flashing = currentFlashState.is_flashing
      vehicleStateData.flash_started_at = flash_started_at
        ? new Date(flash_started_at).toISOString()
        : null
      vehicleStateData.flash_reason = currentFlashState.flash_reason

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
        vehicleData.flash_reason !== previousVehicleData.flash_reason)

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
      .channel(`vehicle_updates_${masterMapId}`)
      .on("broadcast", { event: "vehicle_update" }, (payload) => {
        if (payload.payload.vehicle_id !== userId) {
          serverOtherVehiclesData.update((vehicles) => {
            const existingVehicleIndex = vehicles.findIndex(
              (vehicle) => vehicle.vehicle_id === payload.payload.vehicle_id,
            )
            if (existingVehicleIndex !== -1) {
              const existingVehicle = vehicles[existingVehicleIndex]

              // Only update flash state if it's included in the payload
              const updatedVehicle = {
                ...existingVehicle,
                ...payload.payload,
                // Preserve profile data
                full_name: existingVehicle.full_name,
                selected_operation_id: existingVehicle.selected_operation_id,
                current_operation: existingVehicle.current_operation,
                operation_name: existingVehicle.operation_name,
                operation_id: existingVehicle.operation_id,
              }

              // If flash data is in payload, update it; otherwise keep existing
              if ("is_flashing" in payload.payload) {
                updatedVehicle.is_flashing =
                  payload.payload.is_flashing || false
                updatedVehicle.flash_started_at =
                  payload.payload.flash_started_at || null
                updatedVehicle.flash_reason =
                  payload.payload.flash_reason || null
              }

              vehicles[existingVehicleIndex] = updatedVehicle
            } else {
              console.log("pushing new vehicle", payload.payload)
              vehicles.push(payload.payload)
            }
            return vehicles
          })

          const changes = compareData(
            $serverOtherVehiclesData,
            $otherVehiclesStore,
          )
          otherVehiclesDataChanges.set(changes)
        }
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
          if (payload.new.vehicle_id !== userId) {
            serverOtherVehiclesData.update((vehicles) => {
              const existingVehicleIndex = vehicles.findIndex(
                (vehicle) => vehicle.vehicle_id === payload.new.vehicle_id,
              )
              if (existingVehicleIndex !== -1) {
                vehicles[existingVehicleIndex] = {
                  ...vehicles[existingVehicleIndex],
                  ...payload.new,
                  // Preserve profile data
                  full_name: vehicles[existingVehicleIndex].full_name,
                  selected_operation_id:
                    vehicles[existingVehicleIndex].selected_operation_id,
                  current_operation:
                    vehicles[existingVehicleIndex].current_operation,
                  operation_name: vehicles[existingVehicleIndex].operation_name,
                  operation_id: vehicles[existingVehicleIndex].operation_id,
                  // Explicitly include flash data from postgres update
                  is_flashing: payload.new.is_flashing || false,
                  flash_started_at: payload.new.flash_started_at || null,
                  flash_reason: payload.new.flash_reason || null,
                }
              } else {
                console.log("pushing new vehicle", payload.new)
                vehicles.push(payload.new)
              }
              return vehicles
            })

            const changes = compareData(
              $serverOtherVehiclesData,
              $otherVehiclesStore,
            )
            otherVehiclesDataChanges.set(changes)
          }
        },
      )
      .subscribe()

    unsubscribe = userVehicleStore.subscribe(async (vehicleData) => {
      await broadcastVehicleState(vehicleData)
      await updateDatabaseVehicleState(vehicleData)
    })

    vehicleDataLoaded.set(true)
  })

  onDestroy(() => {
    if (channel) {
      supabase.removeChannel(channel)
    }
    if (unsubscribe) {
      unsubscribe()
    }
  })
</script>
