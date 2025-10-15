<!-- src/components/VehicleTracker.svelte -->

<script>
  import { onMount, onDestroy, getContext } from "svelte"
  import * as mapboxgl from "mapbox-gl"
  import {
    userVehicleStore,
    userVehicleTrailing,
    otherVehiclesStore,
    otherVehiclesDataChanges,
  } from "../stores/vehicleStore"
  import { coordinateBufferStore } from "$lib/stores/currentTrailStore"
  import UserMarker from "./UserMarker.svelte"
  import VehicleControls from "./VehicleControls.svelte"
  import VehicleDetailsPanel from "./VehicleDetailsPanel.svelte"
  import { unsavedTrailStore } from "../stores/trailDataStore"
  import { toast } from "svelte-sonner"
  import "../styles/global.css"
  import { Capacitor } from "@capacitor/core"
  import backgroundService from "$lib/services/backgroundService"
  import { getVehicleDisplayName } from "$lib/utils/vehicleDisplayName"

  export let map
  export let disableAutoZoom = false
  export let onOpenVehicleControls = null

  // Get global selection context
  let globalSelectionContext = null
  let globalSelectionState = null

  function checkGlobalSelectionContext() {
    try {
      globalSelectionContext = getContext("globalSelection")
      if (globalSelectionContext) {
        globalSelectionState = globalSelectionContext.getState()
        console.log("🚗 VehicleTracker: Connected to global selection context")
      }
    } catch (error) {
      // Context not available yet, that's ok
    }
  }

  let geolocateControl
  // 🆕 CHANGED: Store user marker data (marker + component)
  let userMarkerData = null
  let lastRecordedTime = 0
  // 🆕 CHANGED: Store other vehicle data (marker + component + vehicleId)
  let otherVehicleMarkers = [] // Array of { marker, component, vehicleId }
  let currentSpeed = 0
  let isMobileApp = false
  let isBackground = false
  let appState = "web"
  let removeBackgroundListener = null

  // Vehicle tracking state
  let trackedVehicleId = null
  let isTrackingVehicle = false
  let lastTrackedPosition = null

  // First-person view state
  let isFirstPersonMode = false
  let lastTrackedHeading = null

  // Vehicle selection state
  let selectedVehicleId = null

  // Periodically check for global selection context and sync
  let contextCheckInterval = null

  function syncWithGlobalSelection() {
    checkGlobalSelectionContext()

    if (globalSelectionContext) {
      const currentState = globalSelectionContext.getState()

      if (currentState.selectedType === "vehicle") {
        if (selectedVehicleId !== currentState.selectedId) {
          selectedVehicleId = currentState.selectedId
          updateAllVehicleSelectionStates()
          console.log(
            "🚗 VehicleTracker: Synced with global selection:",
            selectedVehicleId,
          )
        }
      } else if (
        currentState.selectedType !== "vehicle" &&
        selectedVehicleId !== null
      ) {
        selectedVehicleId = null
        updateAllVehicleSelectionStates()
        console.log(
          "🚗 VehicleTracker: Cleared selection due to other selection",
        )
      }
    }
  }

  const LOCATION_TRACKING_INTERVAL_MIN = 30

  let userVehicleUnsubscribe
  let unsubscribeOtherVehiclesDataChanges
  let lastClientCoordinates = null
  let lastClientHeading = null
  let previousVehicleMarker = null

  export function handleVehicleSelection(vehicleId) {
    console.log(
      "🚗 VehicleTracker: Vehicle selection called with ID:",
      vehicleId,
      "current selectedVehicleId:",
      selectedVehicleId,
    )
    console.log("Other vehicle data", $otherVehiclesStore)
    if (vehicleId === null) {
      selectedVehicleId = null
      console.log("🚗 VehicleTracker: Vehicle explicitly deselected")
    } else if (selectedVehicleId === vehicleId) {
      selectedVehicleId = null
      console.log("🚗 VehicleTracker: Vehicle deselected (same vehicle)")
    } else {
      selectedVehicleId = vehicleId
      console.log("🚗 VehicleTracker: Selected vehicle ID:", selectedVehicleId)
    }

    updateAllVehicleSelectionStates()
  }

  // 🆕 UPDATED: Use component $set for selection updates
  function updateAllVehicleSelectionStates() {
    console.log(
      "🚗 VehicleTracker: Updating all vehicle selection states, selectedVehicleId:",
      selectedVehicleId,
    )

    // Update user marker if it exists
    if (userMarkerData?.component) {
      const isSelected = selectedVehicleId === $userVehicleStore.vehicle_id
      userMarkerData.component.$set({ isSelected })
      console.log("🚗 Updated user marker selection:", isSelected)
    }

    // Update other vehicle markers
    otherVehicleMarkers.forEach(({ component, vehicleId }) => {
      const isSelected = selectedVehicleId === vehicleId
      component.$set({ isSelected })
      console.log(`🚗 Updated vehicle ${vehicleId} selection:`, isSelected)
    })
  }

  // 🆕 REMOVED: updateMarkerSelection function no longer needed

  function parseCoordinates(coords) {
    if (!coords) return null

    if (typeof coords === "object" && coords.latitude && coords.longitude) {
      return {
        latitude: coords.latitude,
        longitude: coords.longitude,
      }
    }

    if (typeof coords === "string") {
      const cleanedCoords = coords.slice(1, -1)
      const [longitude, latitude] = cleanedCoords.split(",").map(parseFloat)
      return {
        latitude: latitude,
        longitude: longitude,
      }
    }

    return null
  }

  function getVehicleById(vehicleId) {
    if (vehicleId === $userVehicleStore.vehicle_id) {
      return {
        id: $userVehicleStore.vehicle_id,
        full_name: "You",
        vehicle_marker: $userVehicleStore.vehicle_marker,
        coordinates: $userVehicleStore.coordinates,
        heading: $userVehicleStore.heading,
        is_trailing: $userVehicleTrailing,
        last_update: $userVehicleStore.last_update,
        isCurrentUser: true,
        active_preset_id: $userVehicleStore.active_preset_id,
        selected_operation_id: $userVehicleStore.selected_operation_id,
        current_operation: $userVehicleStore.current_operation,
        operation_name: $userVehicleStore.operation_name,
        operation_id: $userVehicleStore.operation_id,
      }
    }

    const otherVehicle = $otherVehiclesStore.find(
      (v) => v.vehicle_id === vehicleId,
    )
    if (otherVehicle) {
      return {
        ...otherVehicle,
        id: otherVehicle.vehicle_id,
        isCurrentUser: false,
      }
    }

    return null
  }

  function toggleFirstPersonMode() {
    isFirstPersonMode = !isFirstPersonMode
    lastTrackedHeading = null

    if (isFirstPersonMode && !isTrackingVehicle) {
      toast.info("Start tracking a vehicle to use first-person view", {
        description:
          "First-person mode follows a vehicle and rotates the camera based on their heading",
        duration: 4000,
      })
      isFirstPersonMode = false
      return
    }

    if (isFirstPersonMode) {
      toast.success("First-person mode enabled", {
        description: "Camera will rotate with vehicle heading",
        action: {
          label: "Disable",
          onClick: () => {
            isFirstPersonMode = false
            map.easeTo({
              bearing: 0,
              duration: 1000,
            })
            toast.info("First-person mode disabled")
          },
        },
      })

      if (isTrackingVehicle) {
        const vehicle = getVehicleById(trackedVehicleId)
        if (vehicle) {
          const parsedCoords = parseCoordinates(vehicle.coordinates)
          if (parsedCoords) {
            updateCameraForTrackedVehicle(
              trackedVehicleId,
              parsedCoords.longitude,
              parsedCoords.latitude,
              vehicle.heading,
            )
          }
        }
      }
    } else {
      toast.info("First-person mode disabled")
      map.easeTo({
        bearing: 0,
        duration: 1000,
      })
    }
  }

  function startTrackingVehicle(vehicleId) {
    stopTrackingVehicle()

    trackedVehicleId = vehicleId
    isTrackingVehicle = true
    lastTrackedPosition = null
    lastTrackedHeading = null

    const vehicle = getVehicleById(vehicleId)
    if (vehicle) {
      const vehicleName = vehicle.isCurrentUser ? "yourself" : vehicle.full_name
      toast.success(`Now tracking ${vehicleName}`, {
        description: "Camera will follow this vehicle's movements",
        action: {
          label: "Stop",
          onClick: stopTrackingVehicle,
        },
      })

      const parsedCoords = parseCoordinates(vehicle.coordinates)
      if (parsedCoords) {
        updateCameraForTrackedVehicle(
          vehicleId,
          parsedCoords.longitude,
          parsedCoords.latitude,
          vehicle.heading,
        )
      }
    }
  }

  function stopTrackingVehicle() {
    if (isTrackingVehicle) {
      const vehicle = getVehicleById(trackedVehicleId)
      const vehicleName = vehicle?.isCurrentUser
        ? "yourself"
        : vehicle?.full_name || "vehicle"

      toast.info(`Stopped tracking ${vehicleName}`)
    }

    trackedVehicleId = null
    isTrackingVehicle = false
    lastTrackedPosition = null
    lastTrackedHeading = null

    if (isFirstPersonMode) {
      isFirstPersonMode = false
      map.easeTo({
        bearing: 0,
        duration: 1000,
      })
    }
  }

  function updateCameraForTrackedVehicle(
    vehicleId,
    longitude,
    latitude,
    heading,
  ) {
    if (!isTrackingVehicle || trackedVehicleId !== vehicleId) return

    const positionChanged =
      !lastTrackedPosition ||
      lastTrackedPosition.latitude !== latitude ||
      lastTrackedPosition.longitude !== longitude

    const headingChanged =
      isFirstPersonMode &&
      heading !== null &&
      heading !== undefined &&
      heading !== lastTrackedHeading

    if (!positionChanged && !headingChanged) {
      return
    }

    const cameraOptions = {
      center: [longitude, latitude],
      duration: 600,
      essential: true,
      easing: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
    }

    if (isFirstPersonMode && heading !== null && heading !== undefined) {
      cameraOptions.bearing = heading
    }

    map.easeTo(cameraOptions)

    if (positionChanged) {
      lastTrackedPosition = { latitude, longitude }
    }
    if (headingChanged) {
      lastTrackedHeading = heading
    }
  }

  function zoomToVehicle(vehicle) {
    const parsedCoords = parseCoordinates(vehicle.coordinates)
    if (!parsedCoords) {
      toast.error("Unable to get vehicle location")
      return
    }

    const { latitude, longitude } = parsedCoords

    if (isTrackingVehicle && vehicle.id !== trackedVehicleId) {
      stopTrackingVehicle()
    }

    map.flyTo({
      center: [longitude, latitude],
      zoom: 15,
      duration: 1500,
    })

    const vehicleDisplayName = getVehicleDisplayName(vehicle)
    const vehicleInfo = vehicle.isCurrentUser
      ? "your location"
      : `${vehicle.full_name}'s ${vehicleDisplayName}`

    toast.success(`Zooming to ${vehicleInfo}`)
  }

  function centerCameraOnVehicle(vehicle) {
    const parsedCoords = parseCoordinates(vehicle.coordinates)
    if (!parsedCoords) {
      toast.error("Unable to get vehicle location")
      return
    }

    map.easeTo({
      center: [parsedCoords.longitude, parsedCoords.latitude],
      duration: 1000,
    })

    const vehicleInfo = vehicle.isCurrentUser
      ? "your location"
      : `${vehicle.full_name}'s location`

    toast.success(`Centered on ${vehicleInfo}`)
  }

  function detectPlatform() {
    try {
      const isNativePlatform = Capacitor.isNativePlatform()

      if (isNativePlatform) {
        isMobileApp = true
        appState = "mobile-foreground"
      } else {
        isMobileApp = false
        appState = "web"
      }

      return isNativePlatform
    } catch (error) {
      isMobileApp = false
      appState = "web"
      return false
    }
  }

  async function setupBackgroundService() {
    if (!isMobileApp) return

    try {
      const backgroundPermissionGranted = await backgroundService.init()

      if (backgroundPermissionGranted) {
        toast.success("Background location is enabled", {
          description:
            "Your location will continue to be tracked when the app is in the background",
          duration: 5000,
        })
      }

      removeBackgroundListener = backgroundService.addListener(
        (event, data) => {
          if (event === "background") {
            isBackground = true
            appState = "mobile-background"
          } else if (event === "foreground") {
            isBackground = false
            appState = "mobile-foreground"

            if (data.duration && data.locationUpdateCount >= 2) {
              toast.info(`App returned to foreground`, {
                description: `Recorded ${data.locationUpdateCount} location updates in ${data.duration.formatted}`,
                duration: 5000,
              })
            }
          } else if (event === "location" && isBackground) {
            streamMarkerPosition(data.coords)
          } else if (event === "permissionChange") {
            if (data.backgroundPermissionGranted) {
              toast.success("Background location enabled", {
                description:
                  "Your location will now be tracked when the app is in the background",
              })
            }
          }
        },
      )
    } catch (error) {
      toast.error("Error setting up background tracking", {
        description: error.message || "Please check app permissions",
      })
    }
  }

  function handleVisibilityChange() {
    if (document.visibilityState === "hidden") {
      isBackground = true
      appState = "web-background"
      const now = Date.now()
      localStorage.setItem("webBackgroundStartTime", now.toString())
    } else {
      isBackground = false
      appState = "web"

      const startTimeStr = localStorage.getItem("webBackgroundStartTime")
      if (startTimeStr) {
        const startTime = parseInt(startTimeStr, 10)
        const duration = Date.now() - startTime

        const seconds = Math.floor(duration / 1000)
        const minutes = Math.floor(seconds / 60)
        const hours = Math.floor(minutes / 60)

        let durationText = ""
        if (hours > 0) {
          durationText = `${hours}h ${minutes % 60}m ${seconds % 60}s`
        } else if (minutes > 0) {
          durationText = `${minutes}m ${seconds % 60}s`
        } else {
          durationText = `${seconds}s`
        }

        localStorage.removeItem("webBackgroundStartTime")

        toast.info("Tab returned to foreground", {
          description: `Background duration: ${durationText}`,
        })
      }
    }
  }

  function cleanup() {
    if (contextCheckInterval) {
      clearInterval(contextCheckInterval)
      contextCheckInterval = null
    }

    console.log("🚗 VehicleTracker cleanup completed")
  }

  onMount(() => {
    detectPlatform()

    contextCheckInterval = setInterval(syncWithGlobalSelection, 500)

    if (isMobileApp) {
      setupBackgroundService()
    }

    geolocateControl = new mapboxgl.GeolocateControl({
      positionOptions: {
        enableHighAccuracy: true,
      },
      trackUserLocation: true,
      showUserHeading: true,
      showAccuracyCircle: true,
      showUserLocation: false,
      className: "custom-geolocate-control",
      fitBoundsOptions: {
        maxZoom: 16,
      },
    })

    map.addControl(geolocateControl, "bottom-right")
    map.on("load", () => {
      if (!disableAutoZoom) {
        geolocateControl.trigger()
      }
    })

    geolocateControl.on("geolocate", (e) => {
      const { coords } = e
      streamMarkerPosition(coords)
    })

    userVehicleUnsubscribe = userVehicleStore.subscribe((value) => {
      updateUserMarker(value.vehicle_marker)
    })

    unsubscribeOtherVehiclesDataChanges =
      otherVehiclesDataChanges.subscribe(processChanges)

    if (!isMobileApp && typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange)
    }
  })

  onDestroy(() => {
    stopTrackingVehicle()

    // 🆕 UPDATED: Clean up user marker with component
    if (userMarkerData) {
      userMarkerData.marker.remove()
      userMarkerData.component.$destroy()
      userMarkerData = null
    }

    if (userVehicleUnsubscribe) {
      userVehicleUnsubscribe()
    }
    if (unsubscribeOtherVehiclesDataChanges) {
      unsubscribeOtherVehiclesDataChanges()
    }

    if (!isMobileApp && typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }

    if (removeBackgroundListener) {
      removeBackgroundListener()
    }

    if (isMobileApp) {
      backgroundService.cleanup()
    }

    // 🆕 UPDATED: Clean up other vehicle markers with components
    otherVehicleMarkers.forEach(({ marker, component }) => {
      marker.remove()
      component.$destroy()
    })
    otherVehicleMarkers = []

    cleanup()
  })

  // 🆕 COMPLETELY REWRITTEN: Process changes with component updates
  function processChanges(changes) {
    changes.forEach((change) => {
      const {
        coordinates,
        heading,
        vehicle_marker,
        vehicle_id,
        update_types,
        is_trailing,
        full_name,
      } = change

      const [longitude, latitude] = coordinates
        .slice(1, -1)
        .split(",")
        .map(parseFloat)

      // Update camera for tracked vehicle when it moves
      if (isTrackingVehicle && vehicle_id === trackedVehicleId) {
        if (
          update_types.includes("position_changed") ||
          update_types.includes("heading_changed") ||
          update_types.includes("new_vehicle")
        ) {
          updateCameraForTrackedVehicle(
            vehicle_id,
            longitude,
            latitude,
            heading,
          )
        }
      }

      // Find existing vehicle marker data
      const existingIndex = otherVehicleMarkers.findIndex(
        (item) => item.vehicleId === vehicle_id,
      )

      if (existingIndex !== -1) {
        // EXISTING VEHICLE - update in place
        const existingData = otherVehicleMarkers[existingIndex]
        const { marker, component } = existingData

        // ✅ UPDATE PROPS: Just update the component props instead of recreating!
        if (update_types.includes("vehicle_marker_changed")) {
          console.log(
            `🎨 Updating vehicle ${vehicle_id} marker props:`,
            vehicle_marker,
          )
          component.$set({
            vehicleSize: vehicle_marker.size,
            userVehicle: vehicle_marker.type,
            vehicleColor: vehicle_marker.bodyColor,
            vehicleSwath: vehicle_marker.swath,
          })
          // No need to remove/recreate marker! 🎉
        }

        // Update position/rotation as before
        if (
          update_types.includes("position_changed") ||
          update_types.includes("heading_changed")
        ) {
          animateMarker(marker, longitude, latitude, heading)
        }

        // Update selection state
        const isSelected = selectedVehicleId === vehicle_id
        component.$set({ isSelected })
      } else {
        // NEW VEHICLE - create marker + component
        console.log(`🆕 Creating new vehicle marker for ${vehicle_id}`)
        const { element, component } = createMarkerElement(
          vehicle_marker,
          false,
          vehicle_id,
        )

        const marker = new mapboxgl.Marker({
          element: element,
          pitchAlignment: "map",
          rotationAlignment: "map",
        })

        marker.setLngLat([longitude, latitude]).setRotation(heading).addTo(map)

        const isSelected = selectedVehicleId === vehicle_id
        component.$set({ isSelected })

        otherVehicleMarkers.push({
          marker,
          component,
          vehicleId: vehicle_id,
        })
      }

      // Update store
      otherVehiclesStore.update((vehicles) => {
        const index = vehicles.findIndex(
          (vehicle) => vehicle.vehicle_id === vehicle_id,
        )
        if (index !== -1) {
          const oldVehicle = vehicles[index]

          if (
            update_types.includes("trailing_status_changed") &&
            !update_types.includes("new_vehicle")
          ) {
            toast.info(`Trailing Status Changed`, {
              description: `${full_name}'s ${vehicle_marker.type} has ${is_trailing ? "started" : "stopped"} trailing`,
              action: {
                label: "Locate",
                onClick: () => {
                  map.flyTo({
                    center: [longitude, latitude],
                    zoom: 15,
                    duration: 1000,
                  })
                },
              },
            })
          }

          vehicles[index] = { ...oldVehicle, ...change }
        } else {
          vehicles.push(change)
        }
        return vehicles
      })
    })
  }

  function animateMarker(marker, targetLng, targetLat, targetRotation) {
    const currentLngLat = marker.getLngLat()
    const currentRotation = marker.getRotation()

    const lngDiff = targetLng - currentLngLat.lng
    const latDiff = targetLat - currentLngLat.lat
    let rotationDiff = targetRotation - currentRotation

    if (rotationDiff > 180) {
      rotationDiff -= 360
    } else if (rotationDiff < -180) {
      rotationDiff += 360
    }

    const duration = 600
    const start = performance.now()

    function animate(timestamp) {
      const elapsed = timestamp - start
      const t = Math.min(elapsed / duration, 1)

      const easing = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t

      const lng = currentLngLat.lng + lngDiff * easing
      const lat = currentLngLat.lat + latDiff * easing
      const rotation = currentRotation + rotationDiff * easing

      marker.setLngLat([lng, lat]).setRotation(rotation)

      if (elapsed < duration) {
        requestAnimationFrame(animate)
      }
    }

    requestAnimationFrame(animate)
  }

  // 🆕 COMPLETELY REWRITTEN: Update user marker with component updates
  function updateUserMarker(vehicleMarker) {
    // Check if we can just update props instead of recreating
    if (userMarkerData && previousVehicleMarker) {
      // Type is the same - we can update props
      if (vehicleMarker.type === previousVehicleMarker.type) {
        const propsChanged =
          vehicleMarker.bodyColor !== previousVehicleMarker.bodyColor ||
          vehicleMarker.size !== previousVehicleMarker.size ||
          vehicleMarker.swath !== previousVehicleMarker.swath

        if (propsChanged) {
          console.log("🎨 Updating user marker props:", vehicleMarker)
          userMarkerData.component.$set({
            vehicleSize: vehicleMarker.size,
            vehicleColor: vehicleMarker.bodyColor,
            vehicleSwath: vehicleMarker.swath,
          })
          previousVehicleMarker = { ...vehicleMarker }
        }
        return // No need to recreate
      }

      // Type changed - need to recreate
      console.log("🔄 User marker type changed, recreating...")
      userMarkerData.marker.remove()
      userMarkerData.component.$destroy()
      userMarkerData = null
    }

    // Create new marker (first time or type changed)
    console.log("🆕 Creating new user marker")
    const { element, component } = createMarkerElement(
      vehicleMarker,
      true,
      $userVehicleStore.vehicle_id,
    )

    const marker = new mapboxgl.Marker({
      element: element,
      pitchAlignment: "map",
      rotationAlignment: "map",
    })

    if ($userVehicleStore.coordinates) {
      const { latitude, longitude } = $userVehicleStore.coordinates
      marker.setLngLat([longitude, latitude]).addTo(map)
    }

    const isSelected = selectedVehicleId === $userVehicleStore.vehicle_id
    component.$set({ isSelected })

    userMarkerData = { marker, component }
    previousVehicleMarker = { ...vehicleMarker }
  }

  // 🆕 UPDATED: Return both element and component
  function createMarkerElement(
    vehicleMarker,
    isUserVehicle = false,
    vehicleId = null,
  ) {
    const el = document.createElement("div")
    el.setAttribute("data-vehicle-id", vehicleId)

    const component = new UserMarker({
      target: el,
      props: {
        pulseColor: "rgba(172, 172, 230, 0.8)",
        pulseSize: "40px",
        vehicleSize: vehicleMarker.size,
        userVehicle: vehicleMarker.type,
        vehicleColor: vehicleMarker.bodyColor,
        vehicleSwath: vehicleMarker.swath,
        showPulse: isUserVehicle,
        isSelected: false,
      },
    })

    return { element: el, component }
  }

  function streamMarkerPosition(coords) {
    const { latitude, longitude, heading, speed } = coords
    currentSpeed = speed ? Math.round(speed * 3.6) : 0

    const currentTime = Date.now()

    const vehicleData = {
      coordinates: { latitude, longitude },
      last_update: currentTime,
      vehicle_marker: $userVehicleStore.vehicle_marker,
    }

    const updatedHeading = heading !== null ? Math.round(heading) : heading

    if (
      isTrackingVehicle &&
      trackedVehicleId === $userVehicleStore.vehicle_id
    ) {
      const positionChanged =
        !lastClientCoordinates ||
        lastClientCoordinates.latitude !== latitude ||
        lastClientCoordinates.longitude !== longitude

      const headingChanged = lastClientHeading !== updatedHeading

      if (positionChanged || headingChanged) {
        updateCameraForTrackedVehicle(
          $userVehicleStore.vehicle_id,
          longitude,
          latitude,
          updatedHeading,
        )
      }
    }

    updateUserVehicleData(currentTime, vehicleData, updatedHeading)
  }

  function updateUserVehicleData(currentTime, vehicleData, updatedHeading) {
    if (currentTime - lastRecordedTime >= LOCATION_TRACKING_INTERVAL_MIN) {
      const { coordinates } = vehicleData
      const { bodyColor, swath } = vehicleData.vehicle_marker
      const { latitude, longitude } = coordinates

      if ($userVehicleTrailing) {
        const locationData = {
          coordinates: { latitude, longitude },
          timestamp: currentTime,
          color: bodyColor,
          swath: swath,
        }
        unsavedTrailStore.update((markers) => [...markers, locationData])

        coordinateBufferStore.set({
          coordinates: { latitude, longitude },
          timestamp: currentTime,
        })
      }

      if (
        !lastClientCoordinates ||
        lastClientCoordinates.latitude !== latitude ||
        lastClientCoordinates.longitude !== longitude ||
        lastClientHeading !== updatedHeading
      ) {
        userVehicleStore.update((vehicle) => {
          return {
            ...vehicle,
            coordinates: vehicleData.coordinates,
            last_update: vehicleData.last_update,
            vehicle_marker: vehicleData.vehicle_marker,
            heading: updatedHeading,
          }
        })

        // 🆕 UPDATED: Use userMarkerData instead of userMarker
        if (userMarkerData?.marker && userMarkerData.marker.getLngLat()) {
          animateMarker(
            userMarkerData.marker,
            longitude,
            latitude,
            updatedHeading,
          )
        }

        lastClientCoordinates = { latitude, longitude }
        lastClientHeading = updatedHeading
      }

      lastRecordedTime = currentTime
    }
  }

  function handleStartTracking(event) {
    startTrackingVehicle(event.detail.vehicleId)
  }

  function handleStopTracking() {
    stopTrackingVehicle()
  }

  function handleToggleFirstPerson() {
    toggleFirstPersonMode()
  }

  function handleZoomToVehicle(event) {
    zoomToVehicle(event.detail.vehicle)
  }

  function handleInstantZoomToVehicle(event) {
    const { vehicle } = event.detail
    if (vehicle.coordinates) {
      const coords = parseCoordinates(vehicle.coordinates)
      if (coords) {
        map.setCenter([coords.longitude, coords.latitude])
        map.setZoom(15)
      }
    }
  }

  export { selectedVehicleId }
</script>

<VehicleControls
  {map}
  {currentSpeed}
  {trackedVehicleId}
  {isTrackingVehicle}
  {isFirstPersonMode}
  on:startTracking={handleStartTracking}
  on:stopTracking={handleStopTracking}
  on:toggleFirstPerson={handleToggleFirstPerson}
  on:zoomToVehicle={handleZoomToVehicle}
  on:instantZoomToVehicle={handleInstantZoomToVehicle}
/>

<VehicleDetailsPanel
  {selectedVehicleId}
  {getVehicleById}
  {map}
  {centerCameraOnVehicle}
  {startTrackingVehicle}
  {zoomToVehicle}
  {onOpenVehicleControls}
/>
