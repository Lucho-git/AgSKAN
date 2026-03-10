<!-- src/lib/components/map/vehicles/VehicleTracker.svelte -->
<script>
  import { onMount, onDestroy, getContext } from "svelte"
  import * as mapboxgl from "mapbox-gl"
  import {
    userVehicleStore,
    userVehicleTrailing,
    otherVehiclesStore,
    otherVehiclesDataChanges,
    broadcastMessageEvent,
  } from "$lib/stores/vehicleStore"
  import { coordinateBufferStore } from "$lib/stores/currentTrailStore"
  import { trailPausedStore } from "$lib/stores/currentTrailStore"
  import { layerVisibilityStore } from "$lib/stores/layerVisibilityStore"

  // ✅ IMPORT COMMAND STORE
  import { commands } from "$lib/stores/commandStore"

  import UserMarker from "./UserMarker.svelte"
  import VehicleControls from "./VehicleControls.svelte"
  import VehicleCompassButton from "./VehicleCompassButton.svelte"
  import VehicleDetailsPanel from "./VehicleDetailsPanel.svelte"
  import { toast } from "svelte-sonner"
  import "$lib/../styles/global.css"
  import { Capacitor } from "@capacitor/core"
  import backgroundService from "$lib/services/backgroundService"
  import { getVehicleDisplayName } from "$lib/utils/vehicleDisplayName"
  import { profileStore } from "$lib/stores/profileStore"
  import { supabase } from "$lib/supabaseClient"
  import { devModeEnabled, devPositionStore } from "$lib/stores/devModeStore"

  export let map
  export let disableAutoZoom = false
  export let onOpenVehicleControls = null
  export let onOpenFlashPanel = null

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
  let userMarkerData = null
  let userInitialsMarker = null
  let lastRecordedTime = 0
  let lastBroadcastTime = 0
  let otherVehicleMarkers = []
  let currentSpeed = 0

  const tagStyle = 7
  let isMobileApp = false
  let isBackground = false
  let appState = "web"
  let removeBackgroundListener = null

  let trackedVehicleId = null
  let isTrackingVehicle = false
  let lastTrackedPosition = null

  let isFirstPersonMode = false
  let lastTrackedHeading = null

  let selectedVehicleId = null

  let mapBearing = 0

  let userBroadcastMarker = null
  let broadcastDismissTimer = null
  let otherBroadcastMarkers = {} // { vehicleId: { marker, timer } }

  let contextCheckInterval = null

  let lastSpeedCalcPosition = null
  let lastSpeedCalcTime = null
  let speedHistory = []
  const MIN_SPEED_CALC_INTERVAL_MS = 1000
  const MIN_MOVEMENT_THRESHOLD_M = 0.8
  const SPEED_HISTORY_SIZE = 5
  const SPEED_SMOOTHING_ALPHA = 0.6
  const STALE_SPEED_THRESHOLD_MS = 30000 // 30s — treat speed as 0 if no update since

  // ── GPS glitch filter thresholds ──
  const GPS_MAX_ACCURACY_M = 200 // Reject if reported accuracy > 200m (WiFi/cell)
  const GPS_MAX_SPEED_KMH = 250 // Reject if implied speed > 250 km/h
  const GPS_SPEED_GATE_MAX_GAP_S = 60 // Only apply speed gate if time gap < 60s
  const GPS_SNAP_BACK_THRESHOLD = 3 // Consecutive rejections before snap-back kicks in
  const GPS_SNAP_BACK_DISTANCE_M = 500 // Min jump distance to trigger snap-back check
  let lastAcceptedCoords = null
  let lastAcceptedTime = null
  let priorAcceptedCoords = null // The accepted point BEFORE lastAccepted (for snap-back)
  let priorAcceptedTime = null
  let consecutiveRejectionsFromLast = 0 // Track consecutive rejections from current lastAccepted

  let previousVisibility = { vehicles: true, vehicleLabels: true }

  const LOCATION_TRACKING_INTERVAL_MIN = 30
  const MINIMUM_BROADCAST_INTERVAL = 15000 // 15 seconds

  let userVehicleUnsubscribe
  let unsubscribeOtherVehiclesDataChanges
  let unsubscribeBroadcastMessages
  let lastClientCoordinates = null
  let lastClientHeading = null

  // Track running animation frames per marker so we can cancel on new update
  const markerAnimFrames = new WeakMap()
  let previousVehicleMarker = null

  $: {
    if (map && $layerVisibilityStore) {
      const vehiclesChanged =
        $layerVisibilityStore.vehicles !== previousVisibility.vehicles
      const labelsChanged =
        $layerVisibilityStore.vehicleLabels !== previousVisibility.vehicleLabels

      if (vehiclesChanged || labelsChanged) {
        updateVehicleVisibility()
        previousVisibility = {
          vehicles: $layerVisibilityStore.vehicles,
          vehicleLabels: $layerVisibilityStore.vehicleLabels,
        }
      }
    }
  }

  function updateVehicleVisibility() {
    if (!map) return

    try {
      const vehiclesVisible = $layerVisibilityStore.vehicles
      const labelsVisible = $layerVisibilityStore.vehicleLabels

      // Update vehicle marker visibility
      if (userMarkerData?.marker) {
        const userElement = userMarkerData.marker.getElement()
        if (userElement) {
          userElement.style.display = vehiclesVisible ? "block" : "none"
        }
      }

      otherVehicleMarkers.forEach(({ marker }) => {
        const element = marker?.getElement()
        if (element) {
          element.style.display = vehiclesVisible ? "block" : "none"
        }
      })

      // Update label visibility - only if they exist
      if (userInitialsMarker) {
        const element = userInitialsMarker.getElement()
        if (element) {
          element.style.display =
            vehiclesVisible && labelsVisible ? "block" : "none"
        }
      }

      otherVehicleMarkers.forEach(({ initialsMarker }) => {
        if (initialsMarker) {
          const element = initialsMarker.getElement()
          if (element) {
            element.style.display =
              vehiclesVisible && labelsVisible ? "block" : "none"
          }
        }
      })

      console.log("✅ Updated vehicle visibility:", {
        vehicles: vehiclesVisible,
        labels: labelsVisible,
        userMarkerExists: !!userMarkerData,
        userInitialsExists: !!userInitialsMarker,
        otherVehicleCount: otherVehicleMarkers.length,
      })
    } catch (error) {
      console.error("Error updating vehicle visibility:", error)
    }
  }

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

  function updateAllVehicleSelectionStates() {
    console.log(
      "🚗 VehicleTracker: Updating all vehicle selection states, selectedVehicleId:",
      selectedVehicleId,
    )

    if (userMarkerData?.component) {
      const isSelected = selectedVehicleId === $userVehicleStore.vehicle_id
      userMarkerData.component.$set({ isSelected })
      console.log("🚗 Updated user marker selection:", isSelected)
    }

    otherVehicleMarkers.forEach(({ component, vehicleId }) => {
      const isSelected = selectedVehicleId === vehicleId
      component.$set({ isSelected })
      console.log(`🚗 Updated vehicle ${vehicleId} selection:`, isSelected)
    })
  }

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

  function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000
    const φ1 = (lat1 * Math.PI) / 180
    const φ2 = (lat2 * Math.PI) / 180
    const Δφ = ((lat2 - lat1) * Math.PI) / 180
    const Δλ = ((lon2 - lon1) * Math.PI) / 180

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

    return R * c
  }

  function calculateSpeedFromGPS(latitude, longitude, timestamp) {
    if (!lastSpeedCalcPosition || !lastSpeedCalcTime) {
      lastSpeedCalcPosition = { latitude, longitude }
      lastSpeedCalcTime = timestamp
      return currentSpeed || 0
    }

    const timeDiff = timestamp - lastSpeedCalcTime

    if (timeDiff < MIN_SPEED_CALC_INTERVAL_MS) {
      return currentSpeed
    }

    const distance = calculateDistance(
      lastSpeedCalcPosition.latitude,
      lastSpeedCalcPosition.longitude,
      latitude,
      longitude,
    )

    const timeInSeconds = timeDiff / 1000
    let speedKmh = (distance / timeInSeconds) * 3.6

    if (speedKmh > 200) {
      return currentSpeed
    }

    lastSpeedCalcPosition = { latitude, longitude }
    lastSpeedCalcTime = timestamp

    if (distance < MIN_MOVEMENT_THRESHOLD_M) {
      speedHistory.push(Math.min(speedKmh, 0.5))
    } else {
      speedHistory.push(speedKmh)
    }

    if (speedHistory.length > SPEED_HISTORY_SIZE) {
      speedHistory.shift()
    }

    if (speedHistory.length > 0) {
      let smoothedSpeed = speedHistory[0]
      for (let i = 1; i < speedHistory.length; i++) {
        smoothedSpeed =
          SPEED_SMOOTHING_ALPHA * speedHistory[i] +
          (1 - SPEED_SMOOTHING_ALPHA) * smoothedSpeed
      }

      const finalSpeed =
        SPEED_SMOOTHING_ALPHA * smoothedSpeed +
        (1 - SPEED_SMOOTHING_ALPHA) * currentSpeed

      const roundedSpeed = Math.round(finalSpeed * 10) / 10

      return roundedSpeed
    }

    return currentSpeed
  }

  function getUserInitials(fullName) {
    if (!fullName || typeof fullName !== "string") return ""

    const trimmed = fullName.trim()
    if (!trimmed) return ""

    const names = trimmed.split(/\s+/)

    if (names.length === 1) {
      return names[0].substring(0, 2).toUpperCase()
    }

    return (names[0][0] + names[names.length - 1][0]).toUpperCase()
  }

  // 3-day inactivity threshold (ms)
  const INACTIVE_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000

  function isVehicleInactive(lastUpdate) {
    if (!lastUpdate) return true
    const ts =
      typeof lastUpdate === "string"
        ? new Date(lastUpdate).getTime()
        : lastUpdate
    return Date.now() - ts > INACTIVE_THRESHOLD_MS
  }

  /** Return the number of days since last update */
  function getAwayDays(lastUpdate) {
    if (!lastUpdate) return 0
    const ts =
      typeof lastUpdate === "string"
        ? new Date(lastUpdate).getTime()
        : lastUpdate
    return Math.floor((Date.now() - ts) / (24 * 60 * 60 * 1000))
  }

  /** Check if a vehicle's speed data is stale (no update in 30s) */
  function isSpeedStale(lastUpdate) {
    if (!lastUpdate) return true
    const ts = typeof lastUpdate === 'string' ? new Date(lastUpdate).getTime() : lastUpdate
    return Date.now() - ts > STALE_SPEED_THRESHOLD_MS
  }

  /**
   * Build the active-vehicle tag content into EL based on tagStyle.
   * If lastUpdate is stale (>30s), speed is forced to 0.
   */
  function renderActiveTag(el, initials, speed, lastUpdate = null) {
    const effectiveSpeed = isSpeedStale(lastUpdate) ? 0 : (speed || 0)
    const s = effectiveSpeed.toFixed(1)
    el.innerHTML = ''

    switch (tagStyle) {
      case 1: // mid-dot
        el.textContent = `${initials} \u00B7 ${s}`
        break

      case 2: // pipe
        el.textContent = `${initials} | ${s}`
        break

      case 3: // km suffix
        el.textContent = `${initials} ${s}km`
        break

      case 4: { // two-line
        const nameLine = document.createElement('div')
        nameLine.textContent = initials
        nameLine.style.cssText = 'font-weight: 700; font-size: 11px; line-height: 1.1;'
        el.appendChild(nameLine)
        const speedLine = document.createElement('div')
        speedLine.textContent = `${s} km/h`
        speedLine.style.cssText = 'font-weight: 600; font-size: 9px; line-height: 1.1; opacity: 0.85;'
        el.appendChild(speedLine)
        break
      }

      case 5: { // pill badge — two segments
        const left = document.createElement('span')
        left.textContent = initials
        left.style.cssText = 'padding: 1px 5px; border-radius: 6px; background: rgba(255,255,255,0.2);'
        el.appendChild(left)
        const gap = document.createTextNode(' ')
        el.appendChild(gap)
        const right = document.createElement('span')
        right.textContent = s
        right.style.cssText = 'padding: 1px 5px; border-radius: 6px; background: rgba(0,0,0,0.25);'
        el.appendChild(right)
        break
      }

      case 6: // speed only when moving (single line)
        el.textContent = parseFloat(s) > 0 ? `${initials} \u00B7 ${s}` : initials
        break

      case 7: { // smart two-line: two-line when moving, initials only when stopped
        if (parseFloat(s) > 0) {
          const nameLine = document.createElement('div')
          nameLine.textContent = initials
          nameLine.style.cssText = 'font-weight: 700; font-size: 11px; line-height: 1.1;'
          el.appendChild(nameLine)
          const speedLine = document.createElement('div')
          speedLine.textContent = `${s} km/h`
          speedLine.style.cssText = 'font-weight: 600; font-size: 9px; line-height: 1.1; opacity: 0.85;'
          el.appendChild(speedLine)
        } else {
          el.textContent = initials
        }
        break
      }

      default:
        el.textContent = `${initials} \u00B7 ${s}`
    }
  }

  function createInitialsMarkerElement(
    initials,
    vehicleColor = null,
    inactive = false,
    lastUpdate = null,
    speed = 0,
  ) {
    const el = document.createElement("div")
    el.className = "fm-initials-marker"

    let backgroundColor = "rgba(0, 0, 0, 0.85)"

    if (vehicleColor) {
      const colorMap = {
        Yellow: "rgba(234, 179, 8, 0.95)",
        Orange: "rgba(249, 115, 22, 0.95)",
        Red: "rgba(239, 68, 68, 0.95)",
        Green: "rgba(34, 197, 94, 0.95)",
        Blue: "rgba(59, 130, 246, 0.95)",
        Purple: "rgba(168, 85, 247, 0.95)",
        HotPink: "rgba(236, 72, 153, 0.95)",
      }
      backgroundColor = colorMap[vehicleColor] || backgroundColor
    }

    // If inactive, desaturate the tag background
    const bgColor = inactive ? "rgba(120, 120, 120, 0.85)" : backgroundColor

    if (inactive) {
      // Two-line layout: initials on top, Away (XD) below
      const days = getAwayDays(lastUpdate)

      el.innerHTML = ""
      const nameLine = document.createElement("div")
      nameLine.textContent = initials
      nameLine.style.cssText =
        "font-weight: 700; font-size: 11px; line-height: 1.1;"

      const awayLine = document.createElement("div")
      awayLine.textContent = days > 0 ? `Away (${days}D)` : "Away"
      awayLine.style.cssText =
        "font-weight: 600; font-size: 9px; line-height: 1.1; opacity: 0.8;"

      el.appendChild(nameLine)
      el.appendChild(awayLine)
    } else {
      renderActiveTag(el, initials, speed, lastUpdate)
    }

    el.style.cssText = `
      background: ${bgColor};
      color: white;
      font-size: 11px;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 10px;
      border: 2px solid white;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
      white-space: nowrap;
      pointer-events: none;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
      user-select: none;
      line-height: 1;
      text-align: center;
      ${inactive ? "opacity: 0.75;" : ""}
    `

    return el
  }

  function updateInitialsMarkerColor(marker, vehicleColor, inactive = false) {
    if (!marker) return

    const el = marker.getElement()
    if (!el) return

    const colorMap = {
      Yellow: "rgba(234, 179, 8, 0.95)",
      Orange: "rgba(249, 115, 22, 0.95)",
      Red: "rgba(239, 68, 68, 0.95)",
      Green: "rgba(34, 197, 94, 0.95)",
      Blue: "rgba(59, 130, 246, 0.95)",
      Purple: "rgba(168, 85, 247, 0.95)",
      HotPink: "rgba(236, 72, 153, 0.95)",
    }

    el.style.background = inactive
      ? "rgba(120, 120, 120, 0.85)"
      : colorMap[vehicleColor] || "rgba(0, 0, 0, 0.85)"
    el.style.opacity = inactive ? "0.75" : "1"
  }

  function updateInitialsMarkerText(
    marker,
    initials,
    inactive = false,
    lastUpdate = null,
    speed = 0,
  ) {
    if (!marker) return
    const el = marker.getElement()
    if (!el) return

    if (inactive) {
      const days = getAwayDays(lastUpdate)

      el.innerHTML = ""
      const nameLine = document.createElement("div")
      nameLine.textContent = initials
      nameLine.style.cssText =
        "font-weight: 700; font-size: 11px; line-height: 1.1;"

      const awayLine = document.createElement("div")
      awayLine.textContent = days > 0 ? `Away (${days}D)` : "Away"
      awayLine.style.cssText =
        "font-weight: 600; font-size: 9px; line-height: 1.1; opacity: 0.8;"

      el.appendChild(nameLine)
      el.appendChild(awayLine)
    } else {
      renderActiveTag(el, initials, speed, lastUpdate)
    }
  }

  function getVehicleById(vehicleId) {
    if (vehicleId === $userVehicleStore.vehicle_id) {
      return {
        id: $userVehicleStore.vehicle_id,
        full_name: "You",
        vehicle_marker: $userVehicleStore.vehicle_marker,
        coordinates: $userVehicleStore.coordinates,
        heading: $userVehicleStore.heading,
        speed: $userVehicleStore.speed,
        is_trailing: $userVehicleTrailing,
        last_update: $userVehicleStore.last_update,
        isCurrentUser: true,
        active_preset_id: $userVehicleStore.active_preset_id,
        selected_operation_id: $userVehicleStore.selected_operation_id,
        current_operation: $userVehicleStore.current_operation,
        operation_name: $userVehicleStore.operation_name,
        operation_id: $userVehicleStore.operation_id,
        is_flashing: $userVehicleStore.is_flashing,
        flash_started_at: $userVehicleStore.flash_started_at,
        flash_reason: $userVehicleStore.flash_reason,
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
      duration: $devModeEnabled ? 60 : 600,
      essential: true,
      easing: $devModeEnabled
        ? (t) => t // linear for dev mode
        : (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
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
            if ($devModeEnabled) return // Dev mode overrides real GPS
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

    // Track map bearing for HUD compass indicator
    map.on('rotate', () => {
      mapBearing = map.getBearing()
    })

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
      if ($devModeEnabled) return // Dev mode overrides real GPS
      const { coords } = e
      // Pass accuracy through so the GPS filter can use it
      streamMarkerPosition({
        latitude: coords.latitude,
        longitude: coords.longitude,
        heading: coords.heading,
        speed: coords.speed,
        accuracy: coords.accuracy,
      })
    })

    userVehicleUnsubscribe = userVehicleStore.subscribe((value) => {
      updateUserMarker(value.vehicle_marker)
    })

    unsubscribeOtherVehiclesDataChanges =
      otherVehiclesDataChanges.subscribe(processChanges)

    unsubscribeBroadcastMessages = broadcastMessageEvent.subscribe((evt) => {
      if (evt) showOtherVehicleBroadcast(evt)
    })

    if (!isMobileApp && typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange)
    }
  })

  onDestroy(() => {
    stopTrackingVehicle()

    if (userMarkerData) {
      userMarkerData.marker.remove()
      userMarkerData.component.$destroy()
      userMarkerData = null
    }

    if (userInitialsMarker) {
      userInitialsMarker.remove()
      userInitialsMarker = null
    }

    if (userBroadcastMarker) {
      userBroadcastMarker.remove()
      userBroadcastMarker = null
    }
    if (broadcastDismissTimer) {
      clearTimeout(broadcastDismissTimer)
      broadcastDismissTimer = null
    }

    if (userVehicleUnsubscribe) {
      userVehicleUnsubscribe()
    }
    if (unsubscribeOtherVehiclesDataChanges) {
      unsubscribeOtherVehiclesDataChanges()
    }
    if (unsubscribeBroadcastMessages) {
      unsubscribeBroadcastMessages()
    }

    // Clean up other vehicle broadcast bubbles
    Object.values(otherBroadcastMarkers).forEach(({ marker, timer }) => {
      if (timer) clearTimeout(timer)
      if (marker) marker.remove()
    })
    otherBroadcastMarkers = {}

    if (!isMobileApp && typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }

    if (removeBackgroundListener) {
      removeBackgroundListener()
    }

    if (isMobileApp) {
      backgroundService.cleanup()
    }

    otherVehicleMarkers.forEach(({ marker, component, initialsMarker }) => {
      marker.remove()
      component.$destroy()
      if (initialsMarker) {
        initialsMarker.remove()
      }
    })
    otherVehicleMarkers = []

    cleanup()
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
        speed,
        is_flashing,
        flash_started_at,
        flash_reason,
        last_update,
      } = change

      const [longitude, latitude] = coordinates
        .slice(1, -1)
        .split(",")
        .map(parseFloat)

      // Handle flash state changes with toasts
      if (update_types.includes("flash_state_changed")) {
        const existingVehicle = $otherVehiclesStore.find(
          (v) => v.vehicle_id === vehicle_id,
        )

        // Flash just started
        if (is_flashing && existingVehicle && !existingVehicle.is_flashing) {
          const reasonLabels = {
            full: "FULL",
            empty: "EMPTY",
            help: "HELP",
          }
          const reasonColors = {
            full: "#f59e0b",
            empty: "#8b5cf6",
            help: "#ef4444",
          }

          const reasonLabel = reasonLabels[flash_reason] || "FLASHING"
          const reasonColor = reasonColors[flash_reason] || "#f59e0b"
          const isHelpSignal = flash_reason === "help"

          const toastOptions = {
            description: isHelpSignal
              ? `${full_name} needs assistance!`
              : `${full_name} is signaling ${reasonLabel}`,
            duration: isHelpSignal ? 45000 : 8000,
            action: {
              label: "Locate",
              onClick: () => {
                map.flyTo({
                  center: [longitude, latitude],
                  zoom: 16,
                  duration: 1500,
                })
              },
            },
            style: `border-left: 4px solid ${reasonColor};`,
          }

          if (isHelpSignal) {
            toast.error(`🆘 ${reasonLabel} Signal`, toastOptions)
          } else if (flash_reason === "empty") {
            toast.info(`🟣 ${reasonLabel} Signal`, toastOptions)
          } else {
            toast.warning(`🟠 ${reasonLabel} Signal`, toastOptions)
          }

          console.log(`⚡ Flash started for ${full_name}:`, flash_reason)
        }
        // Flash just stopped
        else if (
          !is_flashing &&
          existingVehicle &&
          existingVehicle.is_flashing
        ) {
          console.log(`⚡ Flash stopped for ${full_name}`)
        }
      }

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

      const existingIndex = otherVehicleMarkers.findIndex(
        (item) => item.vehicleId === vehicle_id,
      )

      if (existingIndex !== -1) {
        const existingData = otherVehicleMarkers[existingIndex]
        const { marker, component, initialsMarker } = existingData

        // Determine inactive state for this vehicle
        const inactive = isVehicleInactive(last_update)

        if (
          update_types.includes("vehicle_marker_changed") ||
          update_types.includes("flash_state_changed")
        ) {
          console.log(
            `🎨 Updating vehicle ${vehicle_id} marker props:`,
            vehicle_marker,
            "flash state:",
            is_flashing,
            flash_reason,
          )
          component.$set({
            vehicleSize: vehicle_marker.size,
            userVehicle: vehicle_marker.type,
            vehicleColor: vehicle_marker.bodyColor,
            vehicleSwath: vehicle_marker.swath,
            isFlashing: is_flashing || false,
            flashReason: flash_reason || null,
            isInactive: inactive,
          })

          if (initialsMarker) {
            updateInitialsMarkerColor(
              initialsMarker,
              vehicle_marker.bodyColor,
              inactive,
            )
            const initials = getUserInitials(full_name)
            if (initials)
              updateInitialsMarkerText(
                initialsMarker,
                initials,
                inactive,
                last_update,
                speed,
              )
          }
        }

        // Always update inactive state even on position-only changes
        component.$set({ isInactive: inactive })

        if (
          update_types.includes("position_changed") ||
          update_types.includes("heading_changed")
        ) {
          animateMarker(marker, longitude, latitude, heading)

          if (initialsMarker) {
            animateMarker(initialsMarker, longitude, latitude, 0)
            // Update speed in the tag
            const initials = getUserInitials(full_name)
            if (initials)
              updateInitialsMarkerText(
                initialsMarker,
                initials,
                inactive,
                last_update,
                speed,
              )
          }

          // Move broadcast bubble if one exists for this vehicle
          if (otherBroadcastMarkers[vehicle_id]?.marker) {
            otherBroadcastMarkers[vehicle_id].marker.setLngLat([longitude, latitude])
          }
        }

        const isSelected = selectedVehicleId === vehicle_id
        component.$set({ isSelected })
      } else {
        console.log(`🆕 Creating new vehicle marker for ${vehicle_id}`)

        const inactive = isVehicleInactive(last_update)

        const { element, component } = createMarkerElement(
          vehicle_marker,
          false,
          vehicle_id,
          { is_flashing, flash_started_at, flash_reason },
        )

        const marker = new mapboxgl.Marker({
          element: element,
          pitchAlignment: "map",
          rotationAlignment: "map",
        })

        marker.setLngLat([longitude, latitude]).setRotation(heading).addTo(map)

        const isSelected = selectedVehicleId === vehicle_id
        component.$set({ isSelected, isInactive: inactive })

        const vehiclesVisible = $layerVisibilityStore.vehicles
        element.style.display = vehiclesVisible ? "block" : "none"

        let initialsMarker = null
        if (full_name) {
          const initials = getUserInitials(full_name)
          if (initials) {
            const initialsEl = createInitialsMarkerElement(
              initials,
              vehicle_marker.bodyColor,
              inactive,
              last_update,
              speed,
            )
            initialsMarker = new mapboxgl.Marker({
              element: initialsEl,
              anchor: "bottom",
              offset: [0, -40],
            })
              .setLngLat([longitude, latitude])
              .addTo(map)

            const labelsVisible = $layerVisibilityStore.vehicleLabels
            initialsEl.style.display =
              vehiclesVisible && labelsVisible ? "block" : "none"

            console.log(
              `✅ Created initials marker "${initials}" for ${full_name}`,
            )
          }
        }

        otherVehicleMarkers.push({
          marker,
          component,
          vehicleId: vehicle_id,
          initialsMarker,
        })
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

          vehicles[index] = { ...oldVehicle, ...change, speed }
        } else {
          vehicles.push({ ...change, speed })
        }
        return vehicles
      })
    })
  }

  function animateMarker(marker, targetLng, targetLat, targetRotation) {
    // Cancel any running animation for this marker
    const prevFrame = markerAnimFrames.get(marker)
    if (prevFrame) cancelAnimationFrame(prevFrame)

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

    // Dev mode: short linear lerp matching joystick rate; GPS: smooth 600ms ease
    const isDevMode = $devModeEnabled
    const duration = isDevMode ? 60 : 600
    const start = performance.now()

    function animate(timestamp) {
      const elapsed = timestamp - start
      const t = Math.min(elapsed / duration, 1)

      // Linear for dev (smooth at high update rate), eased for GPS
      const progress = isDevMode
        ? t
        : t < 0.5
          ? 2 * t * t
          : -1 + (4 - 2 * t) * t

      const lng = currentLngLat.lng + lngDiff * progress
      const lat = currentLngLat.lat + latDiff * progress
      const rotation = currentRotation + rotationDiff * progress

      marker.setLngLat([lng, lat]).setRotation(rotation)

      if (elapsed < duration) {
        const id = requestAnimationFrame(animate)
        markerAnimFrames.set(marker, id)
      } else {
        markerAnimFrames.delete(marker)
      }
    }

    const id = requestAnimationFrame(animate)
    markerAnimFrames.set(marker, id)
  }

  function updateUserMarker(vehicleMarker) {
    if (userMarkerData && previousVehicleMarker) {
      if (vehicleMarker.type === previousVehicleMarker.type) {
        const propsChanged =
          vehicleMarker.bodyColor !== previousVehicleMarker.bodyColor ||
          vehicleMarker.size !== previousVehicleMarker.size ||
          vehicleMarker.swath !== previousVehicleMarker.swath

        const flashChanged =
          $userVehicleStore.is_flashing !== previousVehicleMarker.is_flashing ||
          $userVehicleStore.flash_reason !== previousVehicleMarker.flash_reason

        if (propsChanged || flashChanged) {
          console.log(
            "🎨 Updating user marker props:",
            vehicleMarker,
            "flash:",
            $userVehicleStore.is_flashing,
            $userVehicleStore.flash_reason,
          )
          userMarkerData.component.$set({
            vehicleSize: vehicleMarker.size,
            vehicleColor: vehicleMarker.bodyColor,
            vehicleSwath: vehicleMarker.swath,
            isFlashing: $userVehicleStore.is_flashing || false,
            flashReason: $userVehicleStore.flash_reason || null,
          })

          if (userInitialsMarker) {
            updateInitialsMarkerColor(
              userInitialsMarker,
              vehicleMarker.bodyColor,
            )
          }

          previousVehicleMarker = {
            ...vehicleMarker,
            is_flashing: $userVehicleStore.is_flashing,
            flash_reason: $userVehicleStore.flash_reason,
          }
        }
        return
      }

      console.log("🔄 User marker type changed, recreating...")
      userMarkerData.marker.remove()
      userMarkerData.component.$destroy()
      userMarkerData = null

      if (userInitialsMarker) {
        userInitialsMarker.remove()
        userInitialsMarker = null
      }
    }

    console.log("🆕 Creating new user marker")
    const { element, component } = createMarkerElement(
      vehicleMarker,
      true,
      $userVehicleStore.vehicle_id,
      {
        is_flashing: $userVehicleStore.is_flashing,
        flash_started_at: $userVehicleStore.flash_started_at,
        flash_reason: $userVehicleStore.flash_reason,
      },
    )

    const marker = new mapboxgl.Marker({
      element: element,
      pitchAlignment: "map",
      rotationAlignment: "map",
    })

    if ($userVehicleStore.coordinates) {
      const { latitude, longitude } = $userVehicleStore.coordinates
      marker.setLngLat([longitude, latitude]).addTo(map)

      // Set initial visibility for user vehicle marker
      const vehiclesVisible = $layerVisibilityStore.vehicles
      element.style.display = vehiclesVisible ? "block" : "none"

      if ($profileStore?.full_name) {
        const initials = getUserInitials($profileStore.full_name)
        if (initials) {
          const initialsEl = createInitialsMarkerElement(
            initials,
            vehicleMarker.bodyColor,
          )
          userInitialsMarker = new mapboxgl.Marker({
            element: initialsEl,
            anchor: "bottom",
            offset: [0, -40],
          })
            .setLngLat([longitude, latitude])
            .addTo(map)

          // Set initial visibility for user label
          const labelsVisible = $layerVisibilityStore.vehicleLabels
          initialsEl.style.display =
            vehiclesVisible && labelsVisible ? "block" : "none"

          console.log(
            `✅ Created initials marker "${initials}" for current user`,
          )
        }
      }
    }

    const isSelected = selectedVehicleId === $userVehicleStore.vehicle_id
    component.$set({ isSelected })

    userMarkerData = { marker, component }
    previousVehicleMarker = {
      ...vehicleMarker,
      is_flashing: $userVehicleStore.is_flashing,
      flash_reason: $userVehicleStore.flash_reason,
    }
  }

  function createMarkerElement(
    vehicleMarker,
    isUserVehicle = false,
    vehicleId = null,
    flashState = {
      is_flashing: false,
      flash_started_at: null,
      flash_reason: null,
    },
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
        isFlashing: flashState.is_flashing || false,
        flashReason: flashState.flash_reason || null,
      },
    })

    return { element: el, component }
  }

  // ✅ Dev mode: pipe synthetic position into the normal GPS pipeline
  $: if ($devModeEnabled && $devPositionStore.latitude != null) {
    streamMarkerPosition($devPositionStore)
  }

  /**
   * Show a red floating "GPS Rejected" label at the given coordinates on the map.
   * Mirrors the marker-floating-label pattern but uses a dedicated red variant.
   */
  function showGpsRejectedLabel(longitude, latitude, reason) {
    if (!map) return
    const el = document.createElement("div")
    el.style.pointerEvents = "none"
    el.style.width = "0"
    el.style.height = "0"
    el.style.position = "relative"

    const label = document.createElement("div")
    label.className = "gps-rejected-label"
    label.textContent = "GPS Rejected"
    label.title = reason
    el.appendChild(label)

    const marker = new mapboxgl.Marker({ element: el })
      .setLngLat([longitude, latitude])
      .addTo(map)

    setTimeout(() => marker.remove(), 2200)
  }

  /**
   * Hybrid GPS glitch filter.
   * Returns { accepted: true } or { accepted: false, reason: string }.
   *
   * Rules:
   *  1. If accuracy > GPS_MAX_ACCURACY_M → reject (WiFi/cell tower fix)
   *  2. If implied speed > GPS_MAX_SPEED_KMH AND time gap < GPS_SPEED_GATE_MAX_GAP_S → reject
   *  3. Snap-back detection: if we've been rejecting GPS_SNAP_BACK_THRESHOLD
   *     consecutive points from the current anchor, the anchor itself was a
   *     glitch — roll back to the prior anchor and re-evaluate this point.
   *  4. Otherwise → accept
   */
  function filterGpsCoordinate(latitude, longitude, accuracy, timestamp) {
    // Gate 1: Accuracy (skip for dev mode which has no accuracy)
    if (accuracy != null && accuracy > GPS_MAX_ACCURACY_M) {
      return {
        accepted: false,
        reason: `Accuracy too low: ${Math.round(accuracy)}m (max ${GPS_MAX_ACCURACY_M}m)`,
      }
    }

    // Gate 2: Speed (only when we have a previous accepted point)
    if (lastAcceptedCoords && lastAcceptedTime) {
      const gapSeconds = (timestamp - lastAcceptedTime) / 1000

      if (gapSeconds > 0 && gapSeconds < GPS_SPEED_GATE_MAX_GAP_S) {
        const distance = calculateDistance(
          lastAcceptedCoords.latitude,
          lastAcceptedCoords.longitude,
          latitude,
          longitude,
        )
        const impliedSpeedKmh = (distance / gapSeconds) * 3.6

        if (impliedSpeedKmh > GPS_MAX_SPEED_KMH) {
          consecutiveRejectionsFromLast++

          // Gate 3: Snap-back detection
          // If we've rejected N points in a row from the current anchor,
          // the anchor was the glitch. Roll back to prior anchor.
          if (
            consecutiveRejectionsFromLast >= GPS_SNAP_BACK_THRESHOLD &&
            priorAcceptedCoords &&
            priorAcceptedTime
          ) {
            // Check if this point is valid from the PRIOR anchor
            const priorGap = (timestamp - priorAcceptedTime) / 1000
            const priorDist = calculateDistance(
              priorAcceptedCoords.latitude,
              priorAcceptedCoords.longitude,
              latitude,
              longitude,
            )
            const priorSpeed = priorGap > 0 ? (priorDist / priorGap) * 3.6 : 0

            // If valid from prior anchor, OR it's been a long gap, snap back
            if (
              priorSpeed <= GPS_MAX_SPEED_KMH ||
              priorGap >= GPS_SPEED_GATE_MAX_GAP_S
            ) {
              console.warn(
                `🔄 GPS snap-back: rolling back anchor (${consecutiveRejectionsFromLast} consecutive rejections). Prior anchor was the glitch.`,
              )
              // Roll back — the lastAccepted was the glitch
              lastAcceptedCoords = priorAcceptedCoords
              lastAcceptedTime = priorAcceptedTime
              consecutiveRejectionsFromLast = 0
              // Accept this point
              return { accepted: true }
            }
          }

          return {
            accepted: false,
            reason: `Implied speed ${Math.round(impliedSpeedKmh)} km/h over ${gapSeconds.toFixed(1)}s gap (max ${GPS_MAX_SPEED_KMH} km/h). Distance: ${Math.round(distance)}m`,
          }
        }
      }
      // If gap >= GPS_SPEED_GATE_MAX_GAP_S, skip speed check — but apply snap-back distance check
      else if (gapSeconds >= GPS_SPEED_GATE_MAX_GAP_S) {
        const distance = calculateDistance(
          lastAcceptedCoords.latitude,
          lastAcceptedCoords.longitude,
          latitude,
          longitude,
        )
        // For long-gap points that jump far, we can't reject yet —
        // but mark it as suspicious so snap-back can catch it if
        // the next points all reject from this new position
      }
    }

    // Reset rejection counter on acceptance
    consecutiveRejectionsFromLast = 0
    return { accepted: true }
  }

  function streamMarkerPosition(coords) {
    const { latitude, longitude, heading, speed, accuracy } = coords

    const currentTime = Date.now()

    // ── GPS glitch filter (skip in dev mode) ──
    if (!$devModeEnabled) {
      const filterResult = filterGpsCoordinate(
        latitude,
        longitude,
        accuracy,
        currentTime,
      )
      if (!filterResult.accepted) {
        console.warn(`🚫 GPS coordinate rejected: ${filterResult.reason}`, {
          lat: latitude,
          lng: longitude,
          accuracy,
          lastAccepted: lastAcceptedCoords,
          timeSinceLastMs: lastAcceptedTime
            ? currentTime - lastAcceptedTime
            : null,
        })
        showGpsRejectedLabel(longitude, latitude, filterResult.reason)
        return // Drop this coordinate entirely
      }
    }

    // Coordinate accepted — update tracking state
    priorAcceptedCoords = lastAcceptedCoords
    priorAcceptedTime = lastAcceptedTime
    lastAcceptedCoords = { latitude, longitude }
    lastAcceptedTime = currentTime

    const calculatedSpeed = calculateSpeedFromGPS(
      latitude,
      longitude,
      currentTime,
    )

    currentSpeed = Math.round(calculatedSpeed)

    const vehicleData = {
      coordinates: { latitude, longitude },
      last_update: currentTime,
      vehicle_marker: $userVehicleStore.vehicle_marker,
      speed: calculatedSpeed,
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
      const { coordinates, speed } = vehicleData
      const { latitude, longitude } = coordinates

      // ✅ Check if coordinates or heading have changed
      const coordinatesChanged =
        !lastClientCoordinates ||
        lastClientCoordinates.latitude !== latitude ||
        lastClientCoordinates.longitude !== longitude

      const headingChanged = lastClientHeading !== updatedHeading

      // ✅ Check if 15 seconds have elapsed since last broadcast
      const timeElapsed =
        currentTime - lastBroadcastTime >= MINIMUM_BROADCAST_INTERVAL

      // ✅ Only proceed if coordinates changed, heading changed, OR 15 seconds passed
      if (coordinatesChanged || headingChanged || timeElapsed) {
        if ($userVehicleTrailing && !$trailPausedStore) {
          coordinateBufferStore.set({
            coordinates: { latitude, longitude },
            timestamp: currentTime,
          })
        }

        userVehicleStore.update((vehicle) => {
          return {
            ...vehicle,
            coordinates: vehicleData.coordinates,
            last_update: vehicleData.last_update,
            vehicle_marker: vehicleData.vehicle_marker,
            heading: updatedHeading,
            speed: speed,
          }
        })

        if (userMarkerData?.marker) {
          if (userMarkerData.marker.getLngLat()) {
            // Marker already on the map — animate to new position
            animateMarker(
              userMarkerData.marker,
              longitude,
              latitude,
              updatedHeading,
            )

            if (userInitialsMarker) {
              animateMarker(userInitialsMarker, longitude, latitude, 0)
              // Update speed in the user's tag
              if ($profileStore?.full_name) {
                const initials = getUserInitials($profileStore.full_name)
                if (initials)
                  updateInitialsMarkerText(
                    userInitialsMarker,
                    initials,
                    false,
                    Date.now(),
                    currentSpeed,
                  )
              }
            }

            // Keep broadcast bubble following the user
            if (userBroadcastMarker) {
              userBroadcastMarker.setLngLat([longitude, latitude])
            }
          } else {
            // Marker was created without coordinates (new user, first visit).
            // Now that geolocation has provided coordinates, place it on the map.
            console.log(
              "📍 Placing user marker on map for first time (new account)",
            )
            userMarkerData.marker
              .setLngLat([longitude, latitude])
              .setRotation(updatedHeading || 0)
              .addTo(map)

            const vehiclesVisible = $layerVisibilityStore.vehicles
            const element = userMarkerData.marker.getElement()
            if (element) {
              element.style.display = vehiclesVisible ? "block" : "none"
            }

            // Create initials marker if it doesn't exist yet
            if (!userInitialsMarker && $profileStore?.full_name) {
              const initials = getUserInitials($profileStore.full_name)
              if (initials) {
                const initialsEl = createInitialsMarkerElement(
                  initials,
                  $userVehicleStore.vehicle_marker.bodyColor,
                )
                userInitialsMarker = new mapboxgl.Marker({
                  element: initialsEl,
                  anchor: "bottom",
                  offset: [0, -40],
                })
                  .setLngLat([longitude, latitude])
                  .addTo(map)

                const labelsVisible = $layerVisibilityStore.vehicleLabels
                initialsEl.style.display =
                  vehiclesVisible && labelsVisible ? "block" : "none"
              }
            }
          }
        }

        lastClientCoordinates = { latitude, longitude }
        lastClientHeading = updatedHeading
        lastRecordedTime = currentTime
        lastBroadcastTime = currentTime
      }
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

  function handleResetNorth() {
    if (map) {
      map.easeTo({ bearing: 0, duration: 500 })
    }
  }

  function handleOpenFlashPanel() {
    if (onOpenFlashPanel) onOpenFlashPanel()
  }

  function createBroadcastBubbleElement(message, onClose) {
    const el = document.createElement('div')
    el.style.cssText = `
      pointer-events: auto;
      user-select: none;
      animation: broadcastFadeIn 0.3s ease-out;
      display: flex;
      flex-direction: column;
      align-items: center;
    `

    const wrapper = document.createElement('div')
    wrapper.style.cssText = `position: relative;`

    const bubble = document.createElement('div')
    bubble.style.cssText = `
      background: rgba(255, 255, 255, 0.95);
      color: #1a1a1a;
      font-size: 13px;
      font-weight: 600;
      font-style: italic;
      padding: 8px 14px;
      border-radius: 14px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
      white-space: nowrap;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
      text-align: center;
    `
    bubble.textContent = `\u201c${message}\u201d`

    const closeBtn = document.createElement('button')
    closeBtn.textContent = '\u00d7'
    closeBtn.style.cssText = `
      position: absolute;
      top: -10px;
      right: -10px;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: rgba(0, 0, 0, 0.6);
      border: 2px solid rgba(255, 255, 255, 0.8);
      color: #fff;
      font-size: 18px;
      font-weight: 700;
      cursor: pointer;
      line-height: 24px;
      padding: 0;
      text-align: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
      touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;
      z-index: 10;
    `
    closeBtn.addEventListener('click', onClose)
    closeBtn.addEventListener('touchend', (e) => {
      e.preventDefault()
      e.stopPropagation()
      onClose()
    })

    wrapper.appendChild(bubble)
    wrapper.appendChild(closeBtn)

    const tail = document.createElement('div')
    tail.style.cssText = `
      width: 0;
      height: 0;
      border-left: 8px solid transparent;
      border-right: 8px solid transparent;
      border-bottom: 10px solid rgba(255, 255, 255, 0.95);
      position: absolute;
      top: -10px;
      left: 50%;
      transform: translateX(-50%);
    `
    el.appendChild(tail)
    el.appendChild(wrapper)

    // Add fade-in keyframe globally (once)
    if (!document.getElementById('broadcast-anim-style')) {
      const styleSheet = document.createElement('style')
      styleSheet.id = 'broadcast-anim-style'
      styleSheet.textContent = `@keyframes broadcastFadeIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }`
      document.head.appendChild(styleSheet)
    }

    return el
  }

  function showOtherVehicleBroadcast({ sender_id, sender_name, message }) {
    // Find the marker for this vehicle
    const vehicleData = otherVehicleMarkers.find((v) => v.vehicleId === sender_id)
    if (!vehicleData) return

    const lngLat = vehicleData.marker.getLngLat()
    if (!lngLat) return

    // Remove existing broadcast bubble for this vehicle
    if (otherBroadcastMarkers[sender_id]) {
      if (otherBroadcastMarkers[sender_id].timer) {
        clearTimeout(otherBroadcastMarkers[sender_id].timer)
      }
      if (otherBroadcastMarkers[sender_id].marker) {
        otherBroadcastMarkers[sender_id].marker.remove()
      }
      delete otherBroadcastMarkers[sender_id]
    }

    const el = createBroadcastBubbleElement(message, () => {
      if (otherBroadcastMarkers[sender_id]) {
        if (otherBroadcastMarkers[sender_id].timer) {
          clearTimeout(otherBroadcastMarkers[sender_id].timer)
        }
        otherBroadcastMarkers[sender_id].marker.remove()
        delete otherBroadcastMarkers[sender_id]
      }
    })

    const broadcastMarker = new mapboxgl.Marker({
      element: el,
      anchor: 'top',
      offset: [0, 24],
    })
      .setLngLat(lngLat)
      .addTo(map)

    // Auto-dismiss after 5 minutes
    const timer = setTimeout(() => {
      if (otherBroadcastMarkers[sender_id]) {
        el.style.transition = 'opacity 0.5s ease-out'
        el.style.opacity = '0'
        setTimeout(() => {
          if (otherBroadcastMarkers[sender_id]) {
            otherBroadcastMarkers[sender_id].marker.remove()
            delete otherBroadcastMarkers[sender_id]
          }
        }, 500)
      }
    }, 300000)

    otherBroadcastMarkers[sender_id] = { marker: broadcastMarker, timer }
  }

  function handleBroadcast(message) {
    if (!userMarkerData?.marker) return
    const lngLat = userMarkerData.marker.getLngLat()
    if (!lngLat) return

    // Remove existing broadcast bubble if present
    if (userBroadcastMarker) {
      userBroadcastMarker.remove()
      userBroadcastMarker = null
    }
    if (broadcastDismissTimer) {
      clearTimeout(broadcastDismissTimer)
      broadcastDismissTimer = null
    }

    const el = createBroadcastBubbleElement(message, () => {
      if (broadcastDismissTimer) {
        clearTimeout(broadcastDismissTimer)
        broadcastDismissTimer = null
      }
      if (userBroadcastMarker) {
        userBroadcastMarker.remove()
        userBroadcastMarker = null
      }
    })

    userBroadcastMarker = new mapboxgl.Marker({
      element: el,
      anchor: 'top',
      offset: [0, 24],
    })
      .setLngLat(lngLat)
      .addTo(map)

    // Auto-dismiss after 5 minutes
    broadcastDismissTimer = setTimeout(() => {
      if (userBroadcastMarker) {
        el.style.transition = 'opacity 0.5s ease-out'
        el.style.opacity = '0'
        setTimeout(() => {
          if (userBroadcastMarker) {
            userBroadcastMarker.remove()
            userBroadcastMarker = null
          }
        }, 500)
      }
      broadcastDismissTimer = null
    }, 300000)

    // Broadcast to other users via realtime channel
    try {
      const masterMapId = $profileStore?.master_map_id
      if (masterMapId) {
        const broadcastChannel = supabase.channel(`vehicle_updates_${masterMapId}`)
        broadcastChannel.send({
          type: 'broadcast',
          event: 'broadcast_message',
          payload: {
            sender_name: $profileStore?.full_name || 'Someone',
            message: message,
            sender_id: $profileStore?.id,
          },
        })
      }
    } catch (err) {
      console.error('Failed to broadcast message:', err)
    }
  }

  function handleFirstPersonVehicle(vehicleId) {
    // Start tracking the selected vehicle, then enable first person
    startTrackingVehicle(vehicleId)
    if (!isFirstPersonMode) {
      isFirstPersonMode = true
      lastTrackedHeading = null

      const vehicle = getVehicleById(vehicleId)
      if (vehicle) {
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

      toast.success("First-person mode enabled", {
        description: "Camera will rotate with vehicle heading",
        action: {
          label: "Disable",
          onClick: () => {
            isFirstPersonMode = false
            map.easeTo({ bearing: 0, duration: 1000 })
            toast.info("First-person mode disabled")
          },
        },
      })
    }
  }

  // Build vehicle list for the HUD vehicle picker
  function buildVehicleList() {
    const allVehicles = [
      {
        id: $userVehicleStore.vehicle_id,
        name: "You",
        isCurrentUser: true,
        coordinates: $userVehicleStore.coordinates,
        last_update: $userVehicleStore.last_update,
        vehicleType: $userVehicleStore.vehicle_marker?.type || "SimpleTractor",
        bodyColor: $userVehicleStore.vehicle_marker?.bodyColor || "red",
      },
      ...$otherVehiclesStore.map((v) => ({
        id: v.vehicle_id,
        name: v.full_name || getVehicleDisplayName(v),
        isCurrentUser: false,
        coordinates: v.coordinates,
        last_update: v.last_update,
        vehicleType: v.vehicle_marker?.type || "SimpleTractor",
        bodyColor: v.vehicle_marker?.bodyColor || "red",
      })),
    ].filter((v) => parseCoordinates(v.coordinates) !== null)

    return allVehicles
  }

  $: vehicleList = buildVehicleList()
  // Re-trigger when stores change
  $: if ($otherVehiclesStore || $userVehicleStore) {
    vehicleList = buildVehicleList()
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
  // Re-render every visible initials tag when tagStyle changes
  function refreshAllTags() {
    // User's own tag
    if (userInitialsMarker && $profileStore?.full_name) {
      const initials = getUserInitials($profileStore.full_name)
      if (initials) updateInitialsMarkerText(userInitialsMarker, initials, false, $userVehicleStore.last_update, currentSpeed)
    }
    // Other vehicles' tags
    otherVehicleMarkers.forEach(({ initialsMarker, vehicleId }) => {
      if (!initialsMarker) return
      const v = $otherVehiclesStore.find(v => v.vehicle_id === vehicleId)
      if (!v) return
      const initials = getUserInitials(v.full_name)
      if (!initials) return
      const inactive = isVehicleInactive(v.last_update)
      updateInitialsMarkerText(initialsMarker, initials, inactive, v.last_update, v.speed || 0)
    })
  }

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

<VehicleCompassButton
  {onOpenVehicleControls}
  {currentSpeed}
  {mapBearing}
  vehicles={vehicleList}
  onTrueNorth={handleResetNorth}
  onFirstPersonVehicle={handleFirstPersonVehicle}
  onFlashMe={handleOpenFlashPanel}
  onBroadcast={handleBroadcast}
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
