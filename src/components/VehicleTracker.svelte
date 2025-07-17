<!-- VehicleTracker.svelte -->
<script>
  import { onMount, onDestroy } from "svelte"
  import * as mapboxgl from "mapbox-gl"
  import {
    userVehicleStore,
    userVehicleTrailing,
    otherVehiclesStore,
    otherVehiclesDataChanges,
  } from "../stores/vehicleStore"
  import { coordinateBufferStore } from "$lib/stores/currentTrailStore"
  import UserMarker from "./UserMarker.svelte"
  import { unsavedTrailStore } from "../stores/trailDataStore"
  import { toast } from "svelte-sonner"
  import { page } from "$app/stores"
  import "../styles/global.css"
  import {
    Gauge,
    Users,
    Crosshair,
    Target,
    ChevronDown,
    X,
  } from "lucide-svelte"
  import { Capacitor } from "@capacitor/core"
  import backgroundService from "$lib/services/backgroundService"
  import SVGComponents from "$lib/vehicles/index.js"

  export let map
  export let disableAutoZoom = false

  let geolocateControl
  let userMarker
  let lastRecordedTime = 0
  let otherVehicleMarkers = []
  let currentSpeed = 0
  let showSpeedometer = false
  let showVehicleList = false
  let isMobileApp = false
  let isBackground = false
  let appState = "web"
  let removeBackgroundListener = null

  // Vehicle tracking state
  let trackedVehicleId = null
  let isTrackingVehicle = false
  let trackingUpdateInterval = null
  let lastTrackedPosition = null

  // Static vehicle list that only updates when menu opens
  let sortedVehicles = []

  const LOCATION_TRACKING_INTERVAL_MIN = 30
  const TRACKING_UPDATE_INTERVAL = 2000
  const TRACKING_MOVEMENT_THRESHOLD = 0.00005

  let userVehicleUnsubscribe
  let unsubscribeOtherVehiclesDataChanges
  let lastClientCoordinates = null
  let lastClientHeading = null
  let previousVehicleMarker = null

  // Helper function to truncate long names on mobile
  function truncateName(name, maxLength = 15) {
    if (typeof window !== "undefined" && window.innerWidth < 640) {
      if (name.length > maxLength) {
        return name.substring(0, maxLength - 3) + "..."
      }
    }
    return name
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

  // Helper function to determine if vehicle is online/recent
  function isVehicleOnline(vehicle) {
    if (!vehicle.last_update) return false

    let timestampMs
    if (typeof vehicle.last_update === "string") {
      timestampMs = new Date(vehicle.last_update).getTime()
    } else {
      timestampMs = vehicle.last_update
    }

    const now = Date.now()
    const diff = now - timestampMs
    const fiveMinutes = 5 * 60 * 1000

    return diff < fiveMinutes
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

  // Function to start tracking a vehicle
  function startTrackingVehicle(vehicleId) {
    stopTrackingVehicle()

    trackedVehicleId = vehicleId
    isTrackingVehicle = true
    lastTrackedPosition = null

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

      updateCameraToTrackedVehicle()
      trackingUpdateInterval = setInterval(
        updateCameraToTrackedVehicle,
        TRACKING_UPDATE_INTERVAL,
      )
    }

    // Auto-close vehicle list when tracking starts
    if (showVehicleList) {
      showVehicleList = false
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

    if (trackingUpdateInterval) {
      clearInterval(trackingUpdateInterval)
      trackingUpdateInterval = null
    }

    // Auto-close vehicle list when tracking stops
    if (showVehicleList) {
      showVehicleList = false
    }
  }

  // Function to update camera to tracked vehicle position
  function updateCameraToTrackedVehicle() {
    if (!isTrackingVehicle || !trackedVehicleId) return

    const vehicle = getVehicleById(trackedVehicleId)
    if (!vehicle) {
      stopTrackingVehicle()
      return
    }

    const parsedCoords = parseCoordinates(vehicle.coordinates)
    if (!parsedCoords) return

    const { latitude, longitude } = parsedCoords

    if (!lastTrackedPosition) {
      lastTrackedPosition = { latitude, longitude }
      map.easeTo({
        center: [longitude, latitude],
        duration: 1500,
        essential: true,
      })
      return
    }

    const latDiff = latitude - lastTrackedPosition.latitude
    const lngDiff = longitude - lastTrackedPosition.longitude
    const distance = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff)

    if (distance > TRACKING_MOVEMENT_THRESHOLD) {
      map.easeTo({
        center: [longitude, latitude],
        duration: 1500,
        essential: true,
      })

      lastTrackedPosition = { latitude, longitude }
    }
  }

  // Function to handle clicking the tracking indicator
  function handleTrackingIndicatorClick() {
    if (!showVehicleList) {
      toggleVehicleList()
    }
  }

  // Function to calculate and sort vehicles
  function calculateSortedVehicles() {
    const allVehicles = [
      {
        id: $userVehicleStore.vehicle_id,
        full_name: "You",
        vehicle_marker: $userVehicleStore.vehicle_marker,
        coordinates: $userVehicleStore.coordinates,
        heading: $userVehicleStore.heading,
        is_trailing: $userVehicleTrailing,
        last_update: $userVehicleStore.last_update,
        isCurrentUser: true,
      },
      ...$otherVehiclesStore.map((vehicle) => ({
        ...vehicle,
        id: vehicle.vehicle_id,
        isCurrentUser: false,
      })),
    ]
      .filter((vehicle) => {
        const parsedCoords = parseCoordinates(vehicle.coordinates)
        return parsedCoords !== null
      })
      .sort((a, b) => {
        if (a.id === trackedVehicleId) return -1
        if (b.id === trackedVehicleId) return 1

        if (a.isCurrentUser) return -1
        if (b.isCurrentUser) return 1

        if (a.is_trailing && !b.is_trailing) return -1
        if (b.is_trailing && !a.is_trailing) return 1

        const aOnline = isVehicleOnline(a)
        const bOnline = isVehicleOnline(b)
        if (aOnline && !bOnline) return -1
        if (bOnline && !aOnline) return 1

        const aTime =
          typeof a.last_update === "string"
            ? new Date(a.last_update).getTime()
            : a.last_update || 0
        const bTime =
          typeof b.last_update === "string"
            ? new Date(b.last_update).getTime()
            : b.last_update || 0
        return bTime - aTime
      })

    return allVehicles
  }

  function toggleSpeedometer() {
    showSpeedometer = !showSpeedometer
  }

  function toggleVehicleList() {
    showVehicleList = !showVehicleList

    if (showVehicleList) {
      sortedVehicles = calculateSortedVehicles()
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
      zoom: 16,
      duration: 1500,
    })

    const vehicleInfo = vehicle.isCurrentUser
      ? "your location"
      : `${vehicle.full_name}'s ${getVehicleDisplayName(vehicle)}`

    toast.success(`Zooming to ${vehicleInfo}`)

    // Auto-close vehicle list when zooming to a vehicle
    showVehicleList = false
  }

  function formatLastUpdate(timestamp) {
    if (!timestamp) return "Unknown"

    let timestampMs
    if (typeof timestamp === "string") {
      timestampMs = new Date(timestamp).getTime()
    } else {
      timestampMs = timestamp
    }

    const now = Date.now()
    const diff = now - timestampMs
    const minutes = Math.floor(diff / (1000 * 60))
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (days > 0) return `${days}d ago`
    if (hours > 0) return `${hours}h ago`
    if (minutes > 0) return `${minutes}m ago`
    return "Just now"
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

  function getVehicleIcon(vehicle) {
    const vehicleType = vehicle.vehicle_marker?.type
    if (!vehicleType) return null

    return SVGComponents[vehicleType] || SVGComponents.SimpleTractor || null
  }

  function getVehicleColor(vehicle) {
    return (
      vehicle.vehicle_marker?.bodyColor ||
      vehicle.vehicle_marker?.color ||
      "red"
    )
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

  onMount(() => {
    detectPlatform()

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
  })

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

    const duration = 1000
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
      element: createMarkerElement(vehicleMarker, true),
      pitchAlignment: "map",
      rotationAlignment: "map",
    })

    if ($userVehicleStore.coordinates) {
      const { latitude, longitude } = $userVehicleStore.coordinates
      userMarker.setLngLat([longitude, latitude]).addTo(map)
      previousVehicleMarker = { ...vehicleMarker }
    }
  }

  function createMarkerElement(
    vehicleMarker,
    isUserVehicle = false,
    vehicleId = null,
  ) {
    const el = document.createElement("div")
    el.setAttribute("data-vehicle-id", vehicleId)

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
      },
    })

    return el
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

  function getTrackedVehicleName(vehicle) {
    if (!vehicle) return "Unknown"

    if (vehicle.isCurrentUser) {
      return "You"
    }

    return truncateName(vehicle.full_name || "Unknown", 10)
  }
</script>

<!-- Vehicle List Button -->
<button
  class="btn btn-circle fixed bottom-32 left-6 z-50 flex h-10 w-10 items-center justify-center border-none bg-black/70 text-white backdrop-blur transition-all hover:scale-110 hover:bg-black/90"
  style="background: {showVehicleList ? 'rgba(255, 255, 255, 0.9)' : ''}"
  class:text-black={showVehicleList}
  on:click={toggleVehicleList}
  aria-label={showVehicleList ? "Hide vehicle list" : "Show vehicle list"}
>
  {#if showVehicleList}
    <ChevronDown size={20} color="black" />
  {:else}
    <Users size={20} />
  {/if}
</button>

<!-- Speedometer Button -->
<button
  class="btn btn-circle fixed bottom-20 left-6 z-50 flex h-10 w-10 items-center justify-center border-none bg-black/70 text-white backdrop-blur transition-all hover:scale-110 hover:bg-black/90"
  style="background: {showSpeedometer ? 'rgba(255, 255, 255, 0.9)' : ''}"
  class:text-black={showSpeedometer}
  on:click={toggleSpeedometer}
  aria-label={showSpeedometer ? "Hide speed" : "Show speed"}
>
  {#if showSpeedometer}
    <ChevronDown size={20} color="black" />
  {:else}
    <Gauge size={20} />
  {/if}
</button>

<!-- Tracking Status Indicator -->
{#if isTrackingVehicle && trackedVehicleId}
  {@const vehicle = getVehicleById(trackedVehicleId)}
  {#if vehicle}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div
      class="tracking-indicator btn fixed z-50 flex h-10 cursor-pointer items-center gap-2 rounded-full border-none bg-black/70 px-3 text-white shadow-lg backdrop-blur transition-all hover:scale-105"
      style="bottom: 8rem; left: 4.5rem; transform-origin: left center;"
      on:click={handleTrackingIndicatorClick}
    >
      <!-- Vehicle Icon -->
      <div
        class="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-green-500/20 p-0.5"
      >
        {#if getVehicleIcon(vehicle)}
          <svelte:component
            this={getVehicleIcon(vehicle)}
            bodyColor={getVehicleColor(vehicle)}
            size="14px"
          />
        {:else}
          <div class="h-2.5 w-2.5 rounded bg-green-300/60"></div>
        {/if}
      </div>

      <!-- Vehicle Name -->
      <span class="min-w-0 truncate text-sm font-medium text-green-300">
        {getTrackedVehicleName(vehicle)}
      </span>

      <!-- Tracking Icon -->
      <Target size={14} class="flex-shrink-0 animate-pulse text-green-300" />

      <!-- Improved Stop Button - larger and more distinct -->
      <button
        on:click|stopPropagation={stopTrackingVehicle}
        class="ml-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-red-500/20 transition-all hover:scale-110 hover:bg-red-500/40 active:bg-red-500/60"
        aria-label="Stop tracking"
        title="Stop tracking"
      >
        <X size={14} class="text-red-300 hover:text-red-200" />
      </button>
    </div>
  {/if}
{/if}

<!-- Vehicle List Modal -->
{#if showVehicleList}
  <div
    class="vehicle-list-modal wider-screen fixed z-40 overflow-hidden rounded-xl bg-black/70 text-white shadow-2xl backdrop-blur-md"
    style="bottom: 11rem; left: 1.5rem; width: 320px; max-width: calc(100vw - 3rem); max-height: 60vh; transform-origin: bottom left;"
  >
    <!-- Header -->
    <div class="flex items-center justify-between border-b border-white/20 p-4">
      <div class="flex items-center gap-2">
        <Users size={18} class="flex-shrink-0 text-white" />
        <h3 class="text-base font-semibold text-white">Vehicles</h3>
        <span
          class="flex-shrink-0 rounded-full bg-white/20 px-2 py-0.5 text-xs font-medium text-white"
        >
          {sortedVehicles.length}
        </span>
      </div>
      <button
        class="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-white/10 active:bg-white/20"
        on:click={toggleVehicleList}
        aria-label="Close vehicle list"
      >
        <ChevronDown size={16} class="text-white/70" />
      </button>
    </div>

    <!-- Vehicle List -->
    <div class="max-h-80 overflow-y-auto">
      {#if sortedVehicles.length === 0}
        <div
          class="flex flex-col items-center justify-center p-6 text-white/70"
        >
          <Users size={32} class="mb-2 opacity-50" />
          <p class="text-sm">No vehicles on map</p>
        </div>
      {:else}
        <div class="divide-y divide-white/10">
          {#each sortedVehicles as vehicle (vehicle.id)}
            <div class="flex items-stretch">
              <!-- Main vehicle button -->
              <button
                class="min-w-0 flex-1 p-3 text-left transition-colors hover:bg-white/10 active:bg-white/20"
                on:click={() => zoomToVehicle(vehicle)}
              >
                <div class="flex items-center gap-3">
                  <!-- Vehicle Icon -->
                  <div
                    class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white/20 p-1"
                  >
                    {#if getVehicleIcon(vehicle)}
                      <svelte:component
                        this={getVehicleIcon(vehicle)}
                        bodyColor={getVehicleColor(vehicle)}
                        size="24px"
                      />
                    {:else}
                      <div class="h-4 w-4 rounded bg-white/40"></div>
                    {/if}
                  </div>

                  <!-- Vehicle Info -->
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2">
                      <p
                        class="truncate text-sm font-medium text-white"
                        title={vehicle.full_name}
                      >
                        {truncateName(vehicle.full_name)}
                        {#if vehicle.isCurrentUser}
                          <span class="text-xs font-normal text-blue-300"
                            >(You)</span
                          >
                        {/if}
                        {#if vehicle.id === trackedVehicleId}
                          <span class="text-xs font-normal text-green-300"
                            >(Tracking)</span
                          >
                        {/if}
                      </p>
                      <div class="flex flex-shrink-0 items-center gap-1">
                        {#if vehicle.is_trailing}
                          <span
                            class="inline-flex items-center rounded-full bg-green-500/20 px-1.5 py-0.5 text-xs font-medium text-green-300"
                          >
                            •
                          </span>
                        {/if}
                        {#if isVehicleOnline(vehicle) && !vehicle.isCurrentUser}
                          <span
                            class="inline-flex items-center rounded-full bg-blue-500/20 px-1.5 py-0.5 text-xs font-medium text-blue-300"
                          >
                            Online
                          </span>
                        {/if}
                      </div>
                    </div>
                    <div class="mt-0.5 flex items-center gap-2">
                      <p class="truncate text-xs text-white/70">
                        {getVehicleDisplayName(vehicle)}
                      </p>
                      <div
                        class="h-2 w-2 flex-shrink-0 rounded-full border border-white/30"
                        style="background-color: {getVehicleColor(vehicle)}"
                        title="Vehicle color"
                      ></div>
                    </div>
                    <p class="mt-0.5 truncate text-xs text-white/50">
                      {formatLastUpdate(vehicle.last_update)}
                    </p>
                  </div>

                  <!-- Status Indicator -->
                  <div class="relative flex-shrink-0">
                    <div
                      class="h-2 w-2 rounded-full {vehicle.isCurrentUser
                        ? 'bg-blue-400'
                        : vehicle.is_trailing
                          ? 'bg-green-400'
                          : isVehicleOnline(vehicle)
                            ? 'bg-blue-400'
                            : 'bg-white/40'}"
                    ></div>
                    {#if vehicle.is_trailing && !vehicle.isCurrentUser}
                      <div
                        class="absolute -inset-1 animate-ping rounded-full bg-green-400 opacity-30"
                      ></div>
                    {/if}
                    {#if vehicle.isCurrentUser}
                      <div
                        class="absolute -inset-1 animate-ping rounded-full bg-blue-400 opacity-30"
                      ></div>
                    {/if}
                  </div>
                </div>
              </button>

              <!-- Track button -->
              <button
                class="flex h-auto w-12 flex-shrink-0 items-center justify-center border-l border-white/10 transition-colors hover:bg-white/10 active:bg-white/20 {vehicle.id ===
                trackedVehicleId
                  ? 'bg-green-500/20'
                  : ''}"
                on:click={() =>
                  vehicle.id === trackedVehicleId
                    ? stopTrackingVehicle()
                    : startTrackingVehicle(vehicle.id)}
                aria-label={vehicle.id === trackedVehicleId
                  ? "Stop tracking"
                  : "Track vehicle"}
                title={vehicle.id === trackedVehicleId
                  ? "Stop tracking"
                  : "Track this vehicle"}
              >
                {#if vehicle.id === trackedVehicleId}
                  <X size={16} class="text-red-300" />
                {:else}
                  <Crosshair size={16} class="text-white/60" />
                {/if}
              </button>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Footer -->
    <div class="border-t border-white/20 p-3">
      <p class="text-center text-xs text-white/60">
        Tap vehicle to zoom • Tap crosshair to track
      </p>
    </div>
  </div>
{/if}

<!-- Speedometer Display -->
{#if showSpeedometer}
  <div
    class="speed-fade-in fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center rounded-lg bg-black/70 px-5 py-2.5 text-white backdrop-blur"
    style="min-width: min-content"
  >
    <div class="text-2xl font-bold">{currentSpeed}</div>
    <div class="text-xs opacity-80">km/h</div>
  </div>
{/if}

<style>
  .speed-fade-in {
    animation: fadeIn 0.3s ease-in-out;
  }

  .vehicle-list-modal {
    animation: bubbleExpand 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
  }

  .tracking-indicator {
    animation: expandFromLeft 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
  }

  @media (min-width: 640px) {
    .vehicle-list-modal.wider-screen {
      width: 400px !important;
    }
  }

  @media (min-width: 1024px) {
    .vehicle-list-modal.wider-screen {
      width: 450px !important;
    }
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translate(-50%, 20px);
    }
    to {
      opacity: 1;
      transform: translate(-50%, 0);
    }
  }

  @keyframes bubbleExpand {
    0% {
      opacity: 0;
      transform: scale(0.1) translateY(20px);
    }
    60% {
      opacity: 0.8;
      transform: scale(1.05) translateY(-5px);
    }
    100% {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }

  @keyframes expandFromLeft {
    0% {
      opacity: 0;
      transform: scaleX(0.1) translateX(-20px);
    }
    60% {
      opacity: 0.8;
      transform: scaleX(1.05) translateX(5px);
    }
    100% {
      opacity: 1;
      transform: scaleX(1) translateX(0);
    }
  }

  .vehicle-list-modal ::-webkit-scrollbar {
    width: 3px;
  }

  .vehicle-list-modal ::-webkit-scrollbar-track {
    background: transparent;
  }

  .vehicle-list-modal ::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.3);
    border-radius: 2px;
  }

  .vehicle-list-modal ::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.5);
  }
</style>
