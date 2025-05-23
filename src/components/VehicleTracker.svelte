<!-- VehicleTracker.svelte -->
<script>
  import { onMount, onDestroy } from "svelte"
  import { goto } from "$app/navigation"

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
  import { Gauge, X } from "lucide-svelte"
  import { Capacitor } from "@capacitor/core"
  import backgroundService from "$lib/services/backgroundService"

  export let map
  export let disableAutoZoom = false

  let userVehicleId
  let geolocateControl
  let userMarker
  let lastRecordedTime = 0
  let lastClientTime = 0
  let otherVehicleMarkers = []
  let currentSpeed = 0
  let showSpeedometer = false
  let isMobileApp = false
  let isBackground = false
  let appState = "web" // Can be "web", "mobile-foreground", or "mobile-background"
  let removeBackgroundListener = null

  const LOCATION_TRACKING_INTERVAL_MIN = 30
  const REJOIN_THRESHOLD = 5 * 60 * 1000

  let otherVehiclesUnsubscribe
  let userVehicleUnsubscribe
  let unsubscribeOtherVehiclesDataChanges
  let userCoordinates = null
  let lastClientCoordinates = null
  let lastClientHeading = null
  let previousVehicleMarker = null

  function toggleSpeedometer() {
    showSpeedometer = !showSpeedometer
  }

  // Function to detect if running as a mobile app via Capacitor
  function detectPlatform() {
    try {
      // Log environment information silently (no toast)
      console.log({
        capacitorExists: typeof Capacitor !== "undefined",
        isNative: Capacitor.isNativePlatform(),
        platform: Capacitor.getPlatform(),
        webviewExists: typeof Capacitor.WebView !== "undefined",
        pluginsExist: typeof Capacitor.Plugins !== "undefined",
      })

      const isNativePlatform = Capacitor.isNativePlatform()
      const platform = Capacitor.getPlatform()

      if (isNativePlatform) {
        isMobileApp = true
        appState = "mobile-foreground"
        // Removed toast notification about platform
        console.log(`App running natively on ${platform}`)
      } else {
        isMobileApp = false
        appState = "web"
        console.log("App running in web browser")
      }

      return isNativePlatform
    } catch (error) {
      console.error("Error in Capacitor detection:", error)
      isMobileApp = false
      appState = "web"
      return false
    }
  }

  // Setup background service handlers
  async function setupBackgroundService() {
    if (!isMobileApp) return

    try {
      console.log("Setting up background service...")

      // Initialize the background service and get the permission status
      const backgroundPermissionGranted = await backgroundService.init()
      console.log("Background permission status:", backgroundPermissionGranted)

      // Show appropriate toast based on background permission status
      if (backgroundPermissionGranted) {
        toast.success("Background location is enabled", {
          description:
            "Your location will continue to be tracked when the app is in the background",
          duration: 5000,
        })
      } else {
        // No toast for missing background permission
        console.log("Background location is not enabled")
      }

      // Add a listener for background events
      removeBackgroundListener = backgroundService.addListener(
        (event, data) => {
          console.log("Background event:", event, data)

          if (event === "background") {
            isBackground = true
            appState = "mobile-background"

            // No toast when going to background
            console.log("App moved to background")
          } else if (event === "foreground") {
            isBackground = false
            appState = "mobile-foreground"

            // Show toast ONLY if we recorded 2+ updates in background
            if (data.duration && data.locationUpdateCount >= 2) {
              toast.info(`App returned to foreground`, {
                description: `Recorded ${data.locationUpdateCount} location updates in ${data.duration.formatted}`,
                duration: 5000,
              })
            } else {
              // Log without toast for 0-1 updates
              console.log(
                `App returned to foreground after ${data.duration?.formatted || "unknown time"} with ${data.locationUpdateCount || 0} location updates`,
              )
            }
          } else if (event === "location" && isBackground) {
            // Process background location updates
            streamMarkerPosition(data.coords)
          } else if (event === "permissionChange") {
            // Handle permission status changes
            if (data.backgroundPermissionGranted) {
              toast.success("Background location enabled", {
                description:
                  "Your location will now be tracked when the app is in the background",
              })
            } else {
              // No toast for permission being disabled
              console.log("Background location permission was disabled")
            }
          }
        },
      )
    } catch (error) {
      console.error("Error in setupBackgroundService:", error)
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
      console.log("Web page is now hidden (background)")

      // For web, we can still use the old method since JS doesn't fully suspend
      const now = Date.now()
      localStorage.setItem("webBackgroundStartTime", now.toString())

      // No toast here since user won't see it when tab is hidden
    } else {
      isBackground = false
      appState = "web"
      console.log("Web page is now visible (foreground)")

      // Calculate duration for web
      const startTimeStr = localStorage.getItem("webBackgroundStartTime")
      if (startTimeStr) {
        const startTime = parseInt(startTimeStr, 10)
        const duration = Date.now() - startTime

        // Format duration
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

        // Clean up storage
        localStorage.removeItem("webBackgroundStartTime")

        toast.info("Tab returned to foreground", {
          description: `Background duration: ${durationText}`,
        })
      }
    }
  }

  onMount(() => {
    console.log("Mounting VehicleTracker")

    // Detect platform (web vs mobile)
    detectPlatform()

    // Set up the background service for native apps
    if (isMobileApp) {
      setupBackgroundService()
    }

    const session = $page.data.session
    if (session) {
      userVehicleId = session.user.id
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
      console.log("Received geolocate event:", e)
      const { coords } = e
      streamMarkerPosition(coords)
    })

    userVehicleUnsubscribe = userVehicleStore.subscribe((value) => {
      userCoordinates = value.coordinates
      updateUserMarker(value.vehicle_marker)
    })

    unsubscribeOtherVehiclesDataChanges =
      otherVehiclesDataChanges.subscribe(processChanges)

    // Set up visibility change detection for web browsers
    if (!isMobileApp && typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange)
      console.log("Set up document visibility listener for web")
    }
  })

  onDestroy(() => {
    console.log("Unmounting VehicleTracker")
    if (userMarker) {
      userMarker.remove()
    }
    if (userVehicleUnsubscribe) {
      userVehicleUnsubscribe()
    }
    if (otherVehiclesUnsubscribe) {
      otherVehiclesUnsubscribe()
    }
    if (unsubscribeOtherVehiclesDataChanges) {
      unsubscribeOtherVehiclesDataChanges()
    }

    // Remove web visibility listener if it was set
    if (!isMobileApp && typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }

    // Clean up background service
    if (removeBackgroundListener) {
      removeBackgroundListener()
    }

    if (isMobileApp) {
      backgroundService.cleanup()
    }
  })

  function processChanges(changes) {
    // console.log("Received changes from otherVehiclesDataChanges:", changes)

    const REJOIN_THRESHOLD = 5 * 60 * 1000 // 5 minutes in milliseconds

    changes.forEach((change) => {
      const {
        coordinates,
        heading,
        vehicle_marker,
        vehicle_id,
        update_types,
        is_trailing,
        last_update,
        full_name,
      } = change

      // Parse the coordinates string into an array of numbers
      const [longitude, latitude] = coordinates
        .slice(1, -1)
        .split(",")
        .map(parseFloat)

      // Find the existing marker for the vehicle
      const existingMarkerIndex = otherVehicleMarkers.findIndex((marker) => {
        const vehicleId = marker.getElement().getAttribute("data-vehicle-id")
        return vehicleId === vehicle_id
      })

      if (existingMarkerIndex !== -1) {
        const existingMarker = otherVehicleMarkers[existingMarkerIndex]

        if (update_types.includes("vehicle_marker_changed")) {
          // Remove the existing marker
          existingMarker.remove()

          // Create a new marker with the updated vehicle marker
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

          // Add toast for vehicle type change
          //   toast.info(`Vehicle Type Changed`, {
          //     description: `${full_name} changed their vehicle to ${vehicle_marker.type}`,
          //     action: {
          //       label: "Locate",
          //       onClick: () => {
          //         map.flyTo({
          //           center: [longitude, latitude],
          //           zoom: 15,
          //           duration: 1000,
          //         })
          //       },
          //     },
          //   })
        }

        if (
          update_types.includes("position_changed") ||
          update_types.includes("heading_changed")
        ) {
          // Animate the marker to the new position and heading
          animateMarker(existingMarker, longitude, latitude, heading)
        }
      } else {
        // Create a new marker for the vehicle
        const marker = new mapboxgl.Marker({
          element: createMarkerElement(vehicle_marker, false, vehicle_id),
          pitchAlignment: "map",
          rotationAlignment: "map",
        })

        marker.setLngLat([longitude, latitude]).setRotation(heading).addTo(map)
        otherVehicleMarkers.push(marker)
      }

      // Update the otherVehiclesStore with the change
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

    // Clear the otherVehicleDataChanges store after processing the changes
  }

  function animateMarker(marker, targetLng, targetLat, targetRotation) {
    const currentLngLat = marker.getLngLat()
    const currentRotation = marker.getRotation() // Rotation is already in degrees

    const lngDiff = targetLng - currentLngLat.lng
    const latDiff = targetLat - currentLngLat.lat
    let rotationDiff = targetRotation - currentRotation

    // Ensure the rotation difference is within -180 to 180 degrees
    if (rotationDiff > 180) {
      rotationDiff -= 360
    } else if (rotationDiff < -180) {
      rotationDiff += 360
    }

    const duration = 1000 // Animation duration in milliseconds
    const start = performance.now()

    function animate(timestamp) {
      const elapsed = timestamp - start
      const t = Math.min(elapsed / duration, 1) // Normalize time between 0 and 1

      // Use an easing function for smoother animation
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
      // Compare the current vehicle marker with the previous one
      if (
        vehicleMarker.type === previousVehicleMarker.type &&
        vehicleMarker.bodyColor === previousVehicleMarker.bodyColor &&
        vehicleMarker.size === previousVehicleMarker.size &&
        vehicleMarker.swath === previousVehicleMarker.swath
      ) {
        // Vehicle marker hasn't changed, no need to update the marker
        // console.log("Vehicle marker hasn't changed")
        return
      }
    }

    // Vehicle marker has changed or user marker hasn't been placed yet
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
      // Update the previous vehicle marker
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
    currentSpeed = speed ? Math.round(speed * 3.6) : 0 // Convert m/s to km/h

    // console.log("Client-side heading before processing:", heading);

    const currentTime = Date.now()

    // Record all the necessary data
    const vehicleData = {
      coordinates: { latitude, longitude },
      last_update: currentTime,
      vehicle_marker: $userVehicleStore.vehicle_marker,
    }

    const updatedHeading = heading !== null ? Math.round(heading) : heading
    // console.log("Server-side heading before adding to store:", updatedHeading);

    // Log the current app state with each position update
    console.log(`Updating position in app state: ${appState}`)

    updateUserVehicleData(currentTime, vehicleData, updatedHeading)
  }

  function updateUserVehicleData(currentTime, vehicleData, updatedHeading) {
    // Check if the time interval condition is met
    if (currentTime - lastRecordedTime >= LOCATION_TRACKING_INTERVAL_MIN) {
      const { coordinates } = vehicleData
      const { bodyColor, swath } = vehicleData.vehicle_marker
      const { latitude, longitude } = coordinates

      // Store the location data locally only if isTrailingFunction is on
      if ($userVehicleTrailing) {
        const locationData = {
          coordinates: { latitude, longitude },
          timestamp: currentTime,
          color: bodyColor,
          swath: swath,
        }
        console.log(`Saving location data in ${appState} mode:`, locationData)
        unsavedTrailStore.update((markers) => [...markers, locationData])

        // Update the coordinateBufferStore with just coordinates and timestamp
        coordinateBufferStore.set({
          coordinates: { latitude, longitude },
          timestamp: currentTime,
        })
      }

      // Check if the coordinates or heading have changed
      if (
        !lastClientCoordinates ||
        lastClientCoordinates.latitude !== latitude ||
        lastClientCoordinates.longitude !== longitude ||
        lastClientHeading !== updatedHeading
      ) {
        let changeLog = ""

        if (!lastClientCoordinates) {
          changeLog += "Initial coordinates. "
        } else {
          if (lastClientCoordinates.latitude !== latitude) {
            const latitudeDiff = latitude - lastClientCoordinates.latitude
            changeLog += `Latitude changed by ${latitudeDiff.toFixed(6)}. `
          }
          if (lastClientCoordinates.longitude !== longitude) {
            const longitudeDiff = longitude - lastClientCoordinates.longitude
            changeLog += `Longitude changed by ${longitudeDiff.toFixed(6)}. `
          }
        }

        if (lastClientHeading !== updatedHeading) {
          const headingDiff = updatedHeading - lastClientHeading
          changeLog += `Heading changed by ${headingDiff.toFixed(2)}°.`
        }

        console.log(`Changes detected in ${appState} mode:`, changeLog)

        userVehicleStore.update((vehicle) => {
          return {
            ...vehicle,
            coordinates: vehicleData.coordinates,
            last_update: vehicleData.last_update,
            vehicle_marker: vehicleData.vehicle_marker,
            heading: updatedHeading,
          }
        })

        // Animate the user marker with the new position and heading
        if (userMarker && userMarker.getLngLat()) {
          animateMarker(userMarker, longitude, latitude, updatedHeading)
        }

        // Update the last coordinates and heading
        lastClientCoordinates = { latitude, longitude }
        lastClientHeading = updatedHeading
      } else {
        // console.log("No changes detected.");
      }

      lastRecordedTime = currentTime
    }
  }
</script>

<button
  class="btn btn-circle fixed bottom-20 left-6 z-50 flex h-10 w-10 items-center justify-center border-none bg-black/70 text-white backdrop-blur transition-all hover:scale-110 hover:bg-black/90"
  style="background: {showSpeedometer ? 'rgba(255, 255, 255, 0.9)' : ''}"
  class:text-black={showSpeedometer}
  on:click={toggleSpeedometer}
  aria-label={showSpeedometer ? "Hide speed" : "Show speed"}
>
  {#if showSpeedometer}
    <X size={20} color="black" />
  {:else}
    <Gauge size={20} />
  {/if}
</button>

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
</style>
