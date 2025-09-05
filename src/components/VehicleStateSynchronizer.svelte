<!-- VehicleStateSynchronizer.svelte -->
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
  import { mapActivityStore } from "$lib/stores/mapActivityStore"
  import { profileStore } from "$lib/stores/profileStore"
  import { vehicleDataLoaded } from "../stores/loadedStore"
  import { page } from "$app/stores"

  let channel = null
  let unsubscribe
  let lastDatabaseUpdate = 0
  let previousVehicleData = null
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

    // Get profile information for each vehicle INCLUDING operation data
    const vehiclesWithProfiles = await Promise.all(
      vehicles.map(async (vehicle) => {
        // Find the profile with operation data
        const profile = $mapActivityStore.connected_profiles.find(
          (p) => p.id === vehicle.vehicle_id,
        )

        return {
          ...vehicle,
          full_name: profile?.full_name || "Unknown User",
          // 🆕 Add operation information
          selected_operation_id: profile?.selected_operation_id || null,
          current_operation: profile?.current_operation || null,
          operation_name: profile?.operation_name || "No operation",
          operation_id: profile?.operation_id || null,
        }
      }),
    )

    // Filter out the current user and return
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
        full_name: serverItem.full_name || clientItem?.full_name,
        // 🆕 ADD OPERATION DATA
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
        // 🆕 ADD OPERATION CHANGE DETECTION
        const operationChanged =
          serverItem.operation_name !== clientItem.operation_name

        if (vehicleMarkerChanged)
          change.update_types.push("vehicle_marker_changed")
        if (coordinatesChanged) change.update_types.push("position_changed")
        if (headingChanged) change.update_types.push("heading_changed")
        if (isTrailingChanged)
          change.update_types.push("trailing_status_changed")
        if (lastUpdateChanged) change.update_types.push("last_update_changed")
        if (operationChanged) change.update_types.push("operation_changed")
      }

      return change
    })

    return changes.filter((change) => change.update_types.length > 0)
  }

  async function broadcastVehicleState(vehicleData) {
    const userId = $profileStore.id
    const masterMapId = $profileStore.master_map_id

    const { coordinates, last_update, heading, vehicle_marker } = vehicleData

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

    const { coordinates, last_update, heading, vehicle_marker } = vehicleData

    if (!coordinates) {
      console.warn("Coordinates not available. Skipping database update.")
      return
    }

    // Check if any non-movement properties have changed
    const hasNonMovementChanges =
      previousVehicleData &&
      (JSON.stringify(vehicleData.vehicle_marker) !==
        JSON.stringify(previousVehicleData.vehicle_marker) ||
        vehicleData.is_trailing !== previousVehicleData.is_trailing)
    // Add any other properties that should trigger immediate updates

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
    }

    const { data, error } = await supabase
      .from("vehicle_state")
      .upsert(vehicleStateData)
      .single()

    if (error) {
      console.error("Error updating vehicle state in database:", error)
    } else {
      console.log("Database updated successfully")
      lastDatabaseUpdate = currentTime
    }

    // Update previous vehicle data after successful update
    previousVehicleData = { ...vehicleData }
  }

  onMount(async () => {
    console.log("Initializing VehicleStateSynchronizer")
    const userId = $profileStore.id
    const masterMapId = $profileStore.master_map_id

    // First fetch the user's own vehicle data
    const userVehicle = await fetchUserVehicleData(userId)

    // ✅ ALWAYS update the store, even for new users
    let parsedCoordinates = null
    let vehicleData = null

    if (userVehicle) {
      // Existing user - parse their coordinates
      if (userVehicle.coordinates) {
        const [longitude, latitude] = userVehicle.coordinates
          .slice(1, -1)
          .split(",")
          .map(parseFloat)
        parsedCoordinates = { latitude, longitude }
      }
      vehicleData = userVehicle
    } else {
      // ✅ New user - create default vehicle data
      vehicleData = {
        vehicle_id: userId,
        coordinates: null,
        last_update: null,
        heading: null,
        is_trailing: false,
        vehicle_marker: {
          type: "Pointer",
          bodyColor: "Yellow",
          size: 45,
          swath: 4,
        },
        master_map_id: masterMapId,
      }
    }

    // 🆕 Get operation data for current user from mapActivityStore
    const currentUserProfile = $mapActivityStore.connected_profiles.find(
      (p) => p.id === userId,
    )

    console.log(
      "🔍 Current user profile with operation data:",
      currentUserProfile,
    )

    // ✅ ALWAYS update the userVehicleStore
    userVehicleStore.update((vehicle) => {
      return {
        ...vehicle,
        ...vehicleData,
        coordinates: parsedCoordinates, // null for new users, parsed for existing
        // 🆕 Add operation data to current user's vehicle
        selected_operation_id:
          currentUserProfile?.selected_operation_id || null,
        current_operation: currentUserProfile?.current_operation || null,
        operation_name: currentUserProfile?.operation_name || "No operation",
        operation_id: currentUserProfile?.operation_id || null,
      }
    })

    // Then fetch initial vehicle data from the server
    const initialVehicles = await fetchInitialVehicleData(masterMapId, userId)
    console.log("Initial vehicle data:", initialVehicles)
    serverOtherVehiclesData.set(initialVehicles)

    const changes = compareData($serverOtherVehiclesData, $otherVehiclesStore)
    otherVehiclesDataChanges.set(changes)

    // Subscribe to realtime updates from other vehicles (broadcast)
    channel = supabase
      .channel(`vehicle_updates_${masterMapId}`)
      .on("broadcast", { event: "vehicle_update" }, (payload) => {
        if (payload.payload.vehicle_id !== userId) {
          // Update was made by another vehicle
          //   console.log("Received vehicle update from another vehicle:", payload)
          serverOtherVehiclesData.update((vehicles) => {
            const existingVehicleIndex = vehicles.findIndex(
              (vehicle) => vehicle.vehicle_id === payload.payload.vehicle_id,
            )
            if (existingVehicleIndex !== -1) {
              // Vehicle already exists, update its data while preserving operation data
              vehicles[existingVehicleIndex] = {
                ...vehicles[existingVehicleIndex],
                ...payload.payload,
                full_name: vehicles[existingVehicleIndex].full_name,
                // 🆕 PRESERVE OPERATION DATA
                selected_operation_id:
                  vehicles[existingVehicleIndex].selected_operation_id,
                current_operation:
                  vehicles[existingVehicleIndex].current_operation,
                operation_name: vehicles[existingVehicleIndex].operation_name,
                operation_id: vehicles[existingVehicleIndex].operation_id,
              }
            } else {
              // Vehicle doesn't exist, add it - but it won't have operation data
              console.log("pushing new vehicle", payload.payload)
              vehicles.push(payload.payload)
            }
            return vehicles
          })

          // Compare the serverOtherVehiclesData with the otherVehiclesStore and store the changes
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
          event: "*", // Listen to all changes (INSERT, UPDATE, DELETE)
          schema: "public",
          table: "vehicle_state",
          filter: `master_map_id=eq.${masterMapId}`, // Filter for your master map id
        },
        (payload) => {
          // Check if the update is from another vehicle
          if (payload.new.vehicle_id !== userId) {
            // console.log(
            //   "Received vehicle update from another vehicle direct from server:",
            //   payload,
            // )
            serverOtherVehiclesData.update((vehicles) => {
              const existingVehicleIndex = vehicles.findIndex(
                (vehicle) => vehicle.vehicle_id === payload.new.vehicle_id, // ✅ Fixed: use payload.new
              )
              if (existingVehicleIndex !== -1) {
                // Vehicle already exists, update its data while preserving operation data
                vehicles[existingVehicleIndex] = {
                  ...vehicles[existingVehicleIndex],
                  ...payload.new, // ✅ Fixed: use payload.new instead of payload.payload
                  full_name: vehicles[existingVehicleIndex].full_name,
                  selected_operation_id:
                    vehicles[existingVehicleIndex].selected_operation_id,
                  current_operation:
                    vehicles[existingVehicleIndex].current_operation,
                  operation_name: vehicles[existingVehicleIndex].operation_name,
                  operation_id: vehicles[existingVehicleIndex].operation_id,
                }
              } else {
                // Vehicle doesn't exist, add it - but it won't have operation data
                console.log("pushing new vehicle", payload.new) // ✅ Fixed: use payload.new
                vehicles.push(payload.new) // ✅ Fixed: use payload.new
              }
              return vehicles
            })

            // Compare the serverOtherVehiclesData with the otherVehiclesStore and store the changes
            const changes = compareData(
              $serverOtherVehiclesData,
              $otherVehiclesStore,
            )
            otherVehiclesDataChanges.set(changes)
          }
        },
      )
      .subscribe()

    // Subscribe to changes in the userVehicleStore
    unsubscribe = userVehicleStore.subscribe(async (vehicleData) => {
      // Always broadcast the update
      console.log("Broadcasting vehicle state:", vehicleData)
      await broadcastVehicleState(vehicleData)

      // Update database with new logic
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
