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
  import { unsavedTrailStore } from "../stores/trailDataStore"
  import { toast } from "svelte-sonner"
  import "../styles/global.css"
  import { Capacitor } from "@capacitor/core"
  import backgroundService from "$lib/services/backgroundService"

  export let map
  export let disableAutoZoom = false

  // 🆕 NEW: Get global selection context
  let globalSelectionContext = null
  let globalSelectionState = null

  // Try to get global selection context
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
  let userMarker
  let lastRecordedTime = 0
  let otherVehicleMarkers = []
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

  // 🆕 NEW: Vehicle selection state
  let selectedVehicleId = null

  // 🆕 NEW: Periodically check for global selection context and sync
  let contextCheckInterval = null

  function syncWithGlobalSelection() {
    checkGlobalSelectionContext()

    if (globalSelectionContext) {
      const currentState = globalSelectionContext.getState()

      if (currentState.selectedType === "vehicle") {
        // Vehicle is selected via unified system
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
        // Something else is selected, clear vehicle selection
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

  // 🆕 UPDATED: Public method for vehicle selection (called by MapEventManager)
  export function handleVehicleSelection(vehicleId) {
    console.log(
      "🚗 VehicleTracker: Vehicle selection called with ID:",
      vehicleId,
      "current selectedVehicleId:",
      selectedVehicleId,
    )

    if (vehicleId === null) {
      // Explicit deselection
      selectedVehicleId = null
      console.log("🚗 VehicleTracker: Vehicle explicitly deselected")
    } else if (selectedVehicleId === vehicleId) {
      // Clicking same vehicle deselects it (this should be handled by MapEventManager reselection logic)
      selectedVehicleId = null
      console.log("🚗 VehicleTracker: Vehicle deselected (same vehicle)")
    } else {
      // Select new vehicle
      selectedVehicleId = vehicleId
      console.log("🚗 VehicleTracker: Selected vehicle ID:", selectedVehicleId)
    }

    // Update all vehicle markers to reflect selection state
    updateAllVehicleSelectionStates()
  }

  // 🆕 UPDATED: Update all vehicle markers selection states
  function updateAllVehicleSelectionStates() {
    console.log(
      "🚗 VehicleTracker: Updating all vehicle selection states, selectedVehicleId:",
      selectedVehicleId,
    )

    // Update user marker if it exists
    if (userMarker) {
      const isSelected = selectedVehicleId === $userVehicleStore.vehicle_id
      updateMarkerSelection(userMarker, isSelected)
      console.log("🚗 Updated user marker selection:", isSelected)
    }

    // Update other vehicle markers
    otherVehicleMarkers.forEach((marker) => {
      const vehicleId = marker.getElement().getAttribute("data-vehicle-id")
      const isSelected = selectedVehicleId === vehicleId
      updateMarkerSelection(marker, isSelected)
      console.log(`🚗 Updated vehicle ${vehicleId} selection:`, isSelected)
    })
  }

  // 🆕 UPDATED: Update individual marker selection state
  function updateMarkerSelection(marker, isSelected) {
    const element = marker.getElement()
    const markerContainer = element.querySelector(".vehicle-marker-container")

    if (markerContainer) {
      if (isSelected) {
        markerContainer.classList.add("selected")
        console.log("🚗 Added selected class to marker")
      } else {
        markerContainer.classList.remove("selected")
        console.log("🚗 Removed selected class from marker")
      }
    } else {
      console.warn("🚗 Marker container not found for selection update")
    }
  }

  // Helper function to parse coordinates
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

  // Function to get current vehicle data by ID
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

  // Function to toggle first-person view mode
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

      // Update camera if we have a tracked vehicle with valid position
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

  // Function to start tracking a vehicle
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

      // Initial camera update if vehicle has valid position
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

  // Function to stop tracking
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

  // Real-time camera update with change detection
  function updateCameraForTrackedVehicle(
    vehicleId,
    longitude,
    latitude,
    heading,
  ) {
    if (!isTrackingVehicle || trackedVehicleId !== vehicleId) return

    // Check if position actually changed
    const positionChanged =
      !lastTrackedPosition ||
      lastTrackedPosition.latitude !== latitude ||
      lastTrackedPosition.longitude !== longitude

    // Check if heading actually changed (for first-person mode)
    const headingChanged =
      isFirstPersonMode &&
      heading !== null &&
      heading !== undefined &&
      heading !== lastTrackedHeading

    // Only update camera if something actually changed
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

    // Update tracking state only if values actually changed
    if (positionChanged) {
      lastTrackedPosition = { latitude, longitude }
    }
    if (headingChanged) {
      lastTrackedHeading = heading
    }
  }

  // Zoom to vehicle function
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

    const vehicleInfo = vehicle.isCurrentUser
      ? "your location"
      : `${vehicle.full_name}'s ${getVehicleDisplayName(vehicle)}`

    toast.success(`Zooming to ${vehicleInfo}`)
  }

  function getVehicleDisplayName(vehicle) {
    const vehicleType = vehicle.vehicle_marker?.type || "Vehicle"

    const shortNames = {
      FourWheelDriveTractor: "FWD Tractor",
      TowBetweenSeeder: "TB Seeder",
      TowBehindSeeder: "TB Seeder",
      TowBehindSeederTracks: "TB Seeder Tracks",
      TowBehindBoomspray: "TB Boomspray",
      SelfPropelledBoomspray: "SP Boomspray",
      ThreePointBoomspray: "3P Boomspray",
      FarmUte: "Farm Ute",
      FrontWheelChaserBin: "FW Chaser",
      FourWheelDriveChaserBin: "FWD Chaser",
      HeaderDuals: "Header Duals",
      HeaderSingles: "Header Singles",
      HeaderTracks: "Header Tracks",
      SelfPropelledSwather: "SP Swather",
      Spreader: "Spreader",
      Truck: "Truck",
      CabOverTruck: "Cab Over Truck",
      CabOverRoadTrain: "Road Train",
      Baler: "Baler",
      Mower: "Mower",
      SelfPropelledMower: "SP Mower",
      Telehandler: "Telehandler",
      Loader: "Loader",
      SimpleTractor: "Simple Tractor",
      Pointer: "Pointer",
      CombineHarvester: "Combine",
      Excavator: "Excavator",
      Tractor: "Tractor",
      WheelLoader: "Wheel Loader",
      WorkCar: "Work Car",
      Airplane: "Airplane",
      simpleTractor: "Simple Tractor",
    }

    return shortNames[vehicleType] || vehicleType
  }

  // Function to detect if running as a mobile app
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

  // Setup background service
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

  // Handle visibility changes for web browsers
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

  // 🆕 NEW: Cleanup function
  function cleanup() {
    // Clear context check interval
    if (contextCheckInterval) {
      clearInterval(contextCheckInterval)
      contextCheckInterval = null
    }

    console.log("🚗 VehicleTracker cleanup completed")
  }

  onMount(() => {
    detectPlatform()

    // 🆕 NEW: Set up periodic sync with global selection context
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

    if (userMarker) {
      userMarker.remove()
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

    // 🆕 NEW: Call cleanup function
    cleanup()
  })

  // Process real-time vehicle changes
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

      const existingMarkerIndex = otherVehicleMarkers.findIndex((marker) => {
        const vehicleId = marker.getElement().getAttribute("data-vehicle-id")
        return vehicleId === vehicle_id
      })

      if (existingMarkerIndex !== -1) {
        const existingMarker = otherVehicleMarkers[existingMarkerIndex]

        if (update_types.includes("vehicle_marker_changed")) {
          existingMarker.remove()

          const newMarker = new mapboxgl.Marker({
            element: createMarkerElement(vehicle_marker, false, vehicle_id),
            pitchAlignment: "map",
            rotationAlignment: "map",
          })

          newMarker
            .setLngLat([longitude, latitude])
            .setRotation(heading)
            .addTo(map)
          otherVehicleMarkers[existingMarkerIndex] = newMarker

          // 🆕 UPDATED: Update selection state for new marker
          const isSelected = selectedVehicleId === vehicle_id
          updateMarkerSelection(newMarker, isSelected)
        }

        if (
          update_types.includes("position_changed") ||
          update_types.includes("heading_changed")
        ) {
          animateMarker(existingMarker, longitude, latitude, heading)
        }
      } else {
        const marker = new mapboxgl.Marker({
          element: createMarkerElement(vehicle_marker, false, vehicle_id),
          pitchAlignment: "map",
          rotationAlignment: "map",
        })

        marker.setLngLat([longitude, latitude]).setRotation(heading).addTo(map)
        otherVehicleMarkers.push(marker)

        // 🆕 UPDATED: Update selection state for new marker
        const isSelected = selectedVehicleId === vehicle_id
        updateMarkerSelection(marker, isSelected)
      }

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

  // Smooth marker animation
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

  function updateUserMarker(vehicleMarker) {
    if (userMarker && previousVehicleMarker) {
      if (
        vehicleMarker.type === previousVehicleMarker.type &&
        vehicleMarker.bodyColor === previousVehicleMarker.bodyColor &&
        vehicleMarker.size === previousVehicleMarker.size &&
        vehicleMarker.swath === previousVehicleMarker.swath
      ) {
        return
      }
    }

    if (userMarker) {
      userMarker.remove()
    }

    userMarker = new mapboxgl.Marker({
      element: createMarkerElement(
        vehicleMarker,
        true,
        $userVehicleStore.vehicle_id,
      ),
      pitchAlignment: "map",
      rotationAlignment: "map",
    })

    if ($userVehicleStore.coordinates) {
      const { latitude, longitude } = $userVehicleStore.coordinates
      userMarker.setLngLat([longitude, latitude]).addTo(map)
      previousVehicleMarker = { ...vehicleMarker }

      // 🆕 UPDATED: Update selection state for user marker
      const isSelected = selectedVehicleId === $userVehicleStore.vehicle_id
      updateMarkerSelection(userMarker, isSelected)
    }
  }

  // 🆕 UPDATED: Create marker element WITHOUT click handler (handled by MapEventManager)
  function createMarkerElement(
    vehicleMarker,
    isUserVehicle = false,
    vehicleId = null,
  ) {
    const el = document.createElement("div")
    el.setAttribute("data-vehicle-id", vehicleId)

    // 🆕 REMOVED: Click handler - now handled by MapEventManager
    // The MapEventManager will detect touches/clicks on elements with data-vehicle-id

    new UserMarker({
      target: el,
      props: {
        pulseColor: "rgba(172, 172, 230, 0.8)",
        pulseSize: "40px",
        vehicleSize: vehicleMarker.size,
        userVehicle: vehicleMarker.type,
        vehicleColor: vehicleMarker.bodyColor,
        vehicleSwath: vehicleMarker.swath,
        showPulse: isUserVehicle,
        isSelected: selectedVehicleId === vehicleId, // 🆕 UPDATED: Pass selection state
      },
    })

    return el
  }

  // Stream marker position with change detection
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

    // Update camera if tracking current user and position/heading changed
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

        if (userMarker && userMarker.getLngLat()) {
          animateMarker(userMarker, longitude, latitude, updatedHeading)
        }

        lastClientCoordinates = { latitude, longitude }
        lastClientHeading = updatedHeading
      }

      lastRecordedTime = currentTime
    }
  }

  // Event handlers for VehicleControls
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
    // Immediate zoom without animation interference
    if (vehicle.coordinates) {
      const coords = parseCoordinates(vehicle.coordinates)
      if (coords) {
        map.setCenter([coords.longitude, coords.latitude])
        map.setZoom(15)
      }
    }
  }

  // 🆕 NEW: Export selected vehicle ID for external access
  export { selectedVehicleId }
</script>

<!-- Vehicle Controls Component -->
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
