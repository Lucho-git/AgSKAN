<!-- src/lib/components/map/vehicles/VehicleDetailsPanel.svelte -->

<script>
  import {
    Edit3,
    Eye,
    Navigation,
    Clock,
    Zap,
    Truck,
    Palette,
    Ruler,
    User,
  } from "lucide-svelte"
  import { onDestroy } from "svelte"
  import * as turf from "@turf/turf"
  import SVGComponents from "$lib/vehicles/index.js"
  import { getVehicleTypeName } from "$lib/utils/vehicleDisplayName"
  import { currentTrailStore } from "$lib/stores/currentTrailStore"
  import {
    otherActiveTrailStore,
    visibleOperationIdsStore,
  } from "$lib/stores/otherTrailStore"
  import {
    userVehicleStore,
    otherVehiclesStore,
  } from "$lib/stores/vehicleStore"
  import { vehiclePresetStore } from "$lib/stores/vehiclePresetStore"
  import { profileStore } from "$lib/stores/profileStore"
  import { calculateZoomDependentWidth } from "$lib/utils/trailGeometry"
  import { trailsApi } from "$lib/api/trailsApi"

  export let selectedVehicleId
  export let getVehicleById
  export let map
  export let centerCameraOnVehicle = null
  export let startTrackingVehicle = null
  export let zoomToVehicle = null
  export let onOpenVehicleControls = null

  let showInfoPanel = false
  let isExpanded = false
  let trailStatsLoading = false

  const STALE_THRESHOLD_MS = 30000 // 30 seconds

  // 🆕 FIXED: React directly to store changes, not derived objects
  $: currentVehicle = (() => {
    if (!selectedVehicleId) return null

    // Check if it's the current user
    if (selectedVehicleId === $userVehicleStore.vehicle_id) {
      // Return fresh data from store every time store updates
      return {
        id: $userVehicleStore.vehicle_id,
        full_name: "You",
        vehicle_marker: $userVehicleStore.vehicle_marker,
        coordinates: $userVehicleStore.coordinates,
        heading: $userVehicleStore.heading,
        speed: $userVehicleStore.speed, // 🔥 This will now update reactively!
        is_trailing: $userVehicleStore.is_trailing,
        last_update: $userVehicleStore.last_update,
        isCurrentUser: true,
        active_preset_id: $userVehicleStore.active_preset_id,
        selected_operation_id: $userVehicleStore.selected_operation_id,
        current_operation: $userVehicleStore.current_operation,
        operation_name: $userVehicleStore.operation_name,
        operation_id: $userVehicleStore.operation_id,
      }
    }

    // Find in other vehicles store
    const otherVehicle = $otherVehiclesStore.find(
      (v) => v.vehicle_id === selectedVehicleId,
    )

    if (otherVehicle) {
      return {
        ...otherVehicle,
        id: otherVehicle.vehicle_id,
        isCurrentUser: false,
      }
    }

    return null
  })()

  $: isCurrentUser = currentVehicle?.isCurrentUser || false

  // 🆕 Now this will update reactively because currentVehicle updates
  $: currentSpeed = (() => {
    if (!currentVehicle) return "- -"

    const now = Date.now()
    const lastUpdate = new Date(currentVehicle.last_update).getTime()
    const timeSinceUpdate = now - lastUpdate

    if (timeSinceUpdate > STALE_THRESHOLD_MS) {
      return "- -"
    }

    const speed = currentVehicle.speed

    if (speed === null || speed === undefined) {
      return "- -"
    }

    if (speed < 0.5) {
      return "0 km/h"
    }

    return `${speed.toFixed(1)} km/h`
  })()

  $: speedStatus = (() => {
    if (!currentVehicle) return "unknown"

    const now = Date.now()
    const lastUpdate = new Date(currentVehicle.last_update).getTime()
    const timeSinceUpdate = now - lastUpdate

    if (timeSinceUpdate > STALE_THRESHOLD_MS) {
      return "stale"
    }

    const speed = currentVehicle.speed

    if (speed === null || speed === undefined) {
      return "unknown"
    }

    if (speed < 0.5) {
      return "stationary"
    }

    return "moving"
  })()

  $: speedColor = (() => {
    switch (speedStatus) {
      case "moving":
        return "#22c55e"
      case "stationary":
        return "#f59e0b"
      case "stale":
        return "#6b7280"
      default:
        return "#6b7280"
    }
  })()

  let VehicleIcon
  $: {
    if (isCurrentUser && $userVehicleStore?.vehicle_marker?.type) {
      VehicleIcon =
        SVGComponents[$userVehicleStore.vehicle_marker.type] ||
        SVGComponents.Pointer
    } else if (currentVehicle?.vehicle_marker?.type) {
      VehicleIcon =
        SVGComponents[currentVehicle.vehicle_marker.type] ||
        SVGComponents.Pointer
    } else {
      VehicleIcon = null
    }
  }

  $: vehicleBodyColor = isCurrentUser
    ? $userVehicleStore?.vehicle_marker?.bodyColor || "Green"
    : currentVehicle?.vehicle_marker?.bodyColor || "Green"

  $: vehicleSwath = isCurrentUser
    ? $userVehicleStore?.vehicle_marker?.swath || 12
    : currentVehicle?.vehicle_marker?.swath || 12

  $: vehicleType = isCurrentUser
    ? $userVehicleStore?.vehicle_marker?.type || "Tractor"
    : currentVehicle?.vehicle_marker?.type || "Tractor"

  $: vehicleMarkerData = isCurrentUser
    ? $userVehicleStore?.vehicle_marker
    : currentVehicle?.vehicle_marker

  $: displayName = (() => {
    if (!currentVehicle) return "Unknown Vehicle"

    const marker = isCurrentUser
      ? $userVehicleStore?.vehicle_marker
      : currentVehicle?.vehicle_marker

    if (marker) {
      const matchingPreset = $vehiclePresetStore.find(
        (p) =>
          p.type === marker.type &&
          p.body_color === marker.bodyColor &&
          p.swath === marker.swath,
      )

      if (matchingPreset) {
        return matchingPreset.name
      }
    }

    const fallbackName = getVehicleTypeName(marker?.type || "Vehicle")
    return fallbackName
  })()

  $: if (!selectedVehicleId) {
    showInfoPanel = false
    isExpanded = false
  }

  // 🆕 Debug logging to verify reactivity
  $: if (currentVehicle) {
    console.log("🔄 Vehicle data updated:", {
      id: currentVehicle.id,
      speed: currentVehicle.speed,
      last_update: currentVehicle.last_update,
      isCurrentUser: currentVehicle.isCurrentUser,
    })
  }

  $: {
    console.log("⚡ Speed display updated:", currentSpeed)
  }

  function formatLastSeen(timestamp) {
    if (!timestamp) return "Unknown"
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMins < 1) return "Just now"
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
  }

  function calculateDurationFromPath(path) {
    if (!path || path.length === 0) return "- -"

    const firstPoint = path[0]
    const lastPoint = path[path.length - 1]

    if (!firstPoint?.timestamp || !lastPoint?.timestamp) return "- -"

    const startTime =
      typeof firstPoint.timestamp === "string"
        ? new Date(firstPoint.timestamp).getTime()
        : firstPoint.timestamp
    const endTime =
      typeof lastPoint.timestamp === "string"
        ? new Date(lastPoint.timestamp).getTime()
        : lastPoint.timestamp

    const diffMs = endTime - startTime
    const totalMinutes = Math.floor(diffMs / 60000)
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60

    if (hours === 0) return `${minutes}m`
    if (hours < 24) return `${hours}h ${minutes}m`

    const days = Math.floor(hours / 24)
    const remainingHours = hours % 24
    return `${days}d ${remainingHours}h`
  }

  function formatTrailingDuration(vehicle) {
    if (!vehicle?.is_trailing) return "Not trailing"

    if (vehicle.isCurrentUser) {
      if ($currentTrailStore?.path?.length > 0) {
        return calculateDurationFromPath($currentTrailStore.path)
      }
    } else {
      const otherTrail = $otherActiveTrailStore?.find(
        (t) => t.vehicle_id === vehicle.id,
      )
      if (otherTrail?.path?.length > 0) {
        return calculateDurationFromPath(otherTrail.path)
      }
    }

    return "- -"
  }

  function getTrailSwath() {
    if (!vehicleMarkerData?.swath) return "N/A"
    return `${vehicleMarkerData.swath}m`
  }

  function getTrailColor() {
    if (!vehicleMarkerData?.bodyColor) return "Default"

    const color = vehicleMarkerData.bodyColor

    const colorMap = {
      HotPink: "Hot Pink",
      LightGreen: "Light Green",
      DarkBlue: "Dark Blue",
      LightBlue: "Light Blue",
      DarkRed: "Dark Red",
      LightRed: "Light Red",
      DarkGreen: "Dark Green",
      Yellow: "Yellow",
      Orange: "Orange",
      Purple: "Purple",
      Brown: "Brown",
      Black: "Black",
      White: "White",
      Gray: "Gray",
      Grey: "Gray",
      Red: "Red",
      Green: "Green",
      Blue: "Blue",
    }

    return colorMap[color] || color
  }

  function getTrailColorValue() {
    if (!vehicleMarkerData?.bodyColor) return "#6b7280"

    const color = vehicleMarkerData.bodyColor

    const colorValues = {
      HotPink: "#ff69b4",
      LightGreen: "#90ee90",
      DarkBlue: "#00008b",
      LightBlue: "#add8e6",
      DarkRed: "#8b0000",
      LightRed: "#ffcccb",
      DarkGreen: "#006400",
      Yellow: "#ffff00",
      Orange: "#ffa500",
      Purple: "#800080",
      Brown: "#a52a2a",
      Black: "#000000",
      White: "#ffffff",
      Gray: "#808080",
      Grey: "#808080",
      Red: "#ff0000",
      Green: "#008000",
      Blue: "#0000ff",
    }

    return colorValues[color] || color
  }

  function getVehicleStatus(vehicle) {
    if (!vehicle) return "Unknown"

    const lastUpdate = new Date(vehicle.last_update)
    const now = new Date()
    const diffMins = Math.floor((now - lastUpdate) / 60000)

    if (diffMins < 5) return "Online"
    if (diffMins < 30) return "Recently active"

    return formatLastSeen(vehicle.last_update)
  }

  function getStatusColor(status) {
    switch (status) {
      case "Online":
        return "#22c55e"
      case "Recently active":
        return "#f59e0b"
      case "Unknown":
        return "#6b7280"
      default:
        return "#ef4444"
    }
  }

  function getCurrentOperation(vehicle) {
    if (!vehicle) return "No operation"
    return vehicle.operation_name || "No operation"
  }

  function handleIconClick() {
    if (isCurrentUser && onOpenVehicleControls) {
      onOpenVehicleControls()
    }
  }

  function handleInfoClick() {
    showInfoPanel = !showInfoPanel
    isExpanded = showInfoPanel
    if (isTrailing) {
      if (showInfoPanel) addTrailHighlight()
      else removeTrailHighlight()
    }
  }

  function handleStartTracking() {
    if (currentVehicle && startTrackingVehicle) {
      startTrackingVehicle(currentVehicle.id)
    }
  }

  $: isTrailing = currentVehicle?.is_trailing || false
  $: trailDur = currentVehicle ? formatTrailingDuration(currentVehicle) : "- -"
  $: opName = currentVehicle?.operation_name || ""
  $: isDifferentOperation =
    !isCurrentUser &&
    currentVehicle?.operation_id &&
    currentVehicle.operation_id !== $userVehicleStore.operation_id
  $: diffOpName = currentVehicle?.operation_name || "this operation"
  $: isDiffOpVisible = $visibleOperationIdsStore.has(
    currentVehicle?.operation_id || "",
  )

  async function toggleViewOperation() {
    const opId = currentVehicle?.operation_id
    if (!opId) return

    // Reveal the operation immediately so map layers + toast fire in parallel
    visibleOperationIdsStore.update((ids) => {
      const next = new Set(ids)
      next.add(opId)
      return next
    })

    trailStatsLoading = true
    try {
      const currentUserId = $profileStore?.id
      if (!currentUserId) { trailStatsLoading = false; return }
      const data = await trailsApi.checkOtherActiveTrails(opId, currentUserId)
      if (data.activeTrails?.length) {
        const formatted = data.activeTrails.map((trail) => ({
          id: trail.id,
          vehicle_id: trail.vehicle_id,
          operation_id: trail.operation_id,
          trail_color: trail.trail_color,
          trail_width: trail.trail_width,
          path: (trail.trailData || []).map((coord) => ({
            coordinates: {
              latitude: coord.coordinates?.latitude ?? coord.latitude,
              longitude: coord.coordinates?.longitude ?? coord.longitude,
            },
            timestamp: typeof coord.timestamp === "string"
              ? new Date(coord.timestamp).getTime()
              : coord.timestamp,
          })).sort((a, b) => a.timestamp - b.timestamp),
        }))
        otherActiveTrailStore.update((trails) => {
          const existing = new Map(trails.map((t) => [t.vehicle_id, t]))
          for (const ft of formatted) existing.set(ft.vehicle_id, ft)
          return [...existing.values()]
        })
      }
    } catch (e) {
      console.error("[VDP] Failed to fetch active trails for op:", opId, e)
    } finally {
      trailStatsLoading = false
    }
  }

  $: vehicleOnlineStatus = currentVehicle
    ? getVehicleStatus(currentVehicle)
    : "Unknown"
  $: vehicleStatusColor = getStatusColor(vehicleOnlineStatus)

  function formatDurHMM(ms) {
    if (!ms || ms <= 0) return null
    const totalMinutes = Math.floor(ms / 60000)
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    return `${hours}:${String(minutes).padStart(2, "0")}`
  }

  $: trailHMM = (() => {
    if (!isTrailing || !currentVehicle) return null
    let path = null
    if (currentVehicle.isCurrentUser) {
      path = $currentTrailStore?.path
    } else {
      const t = $otherActiveTrailStore?.find(
        (t) => t.vehicle_id === currentVehicle.id,
      )
      path = t?.path
    }
    if (!path?.length) return null
    const first = path[0]
    const last = path[path.length - 1]
    if (!first?.timestamp || !last?.timestamp) return null
    const start =
      typeof first.timestamp === "string"
        ? new Date(first.timestamp).getTime()
        : first.timestamp
    const end =
      typeof last.timestamp === "string"
        ? new Date(last.timestamp).getTime()
        : last.timestamp
    return formatDurHMM(end - start)
  })()

  // Normalise a path point to flat {longitude, latitude} regardless of store format
  function normCoord(p) {
    if (p.longitude != null) return [p.longitude, p.latitude]
    if (p.coordinates?.longitude != null)
      return [p.coordinates.longitude, p.coordinates.latitude]
    return null
  }

  // Active trail data — works for own vehicle or other vehicles
  $: activeTrailData = (() => {
    if (!isTrailing || !currentVehicle) return null
    if (currentVehicle.isCurrentUser) return $currentTrailStore
    return (
      $otherActiveTrailStore?.find((t) => t.vehicle_id === currentVehicle.id) ??
      null
    )
  })()

  // ── Trail highlight (map layers) ──────────────────────────────
  const HL_SOURCE = "vdp-hl-source"
  const HL_LAYERS = ["vdp-hl-glow", "vdp-hl-line", "vdp-hl-inner"]

  function addTrailHighlight() {
    if (!map) return
    const trail = activeTrailData
    const path = trail?.path
    if (!path?.length) {
      console.warn("[VDP] addTrailHighlight: no path in activeTrailData", trail)
      return
    }
    removeTrailHighlight()
    const coords = path.map(normCoord).filter(Boolean)
    if (coords.length < 2) {
      console.warn("[VDP] addTrailHighlight: not enough coords", coords.length)
      return
    }
    const color = trail.trail_color || "#22c55e"
    const w = trail.trail_width || vehicleSwath || 3
    console.log(
      "[VDP] addTrailHighlight: adding",
      coords.length,
      "points, color",
      color,
      "width",
      w,
    )
    try {
      map.addSource(HL_SOURCE, {
        type: "geojson",
        data: {
          type: "Feature",
          geometry: { type: "LineString", coordinates: coords },
          properties: {},
        },
      })
      map.addLayer({
        id: "vdp-hl-glow",
        type: "line",
        source: HL_SOURCE,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#ffffff",
          "line-width": calculateZoomDependentWidth(w, 3.0),
          "line-blur": 8,
          "line-opacity": 0.3,
        },
      })
      map.addLayer({
        id: "vdp-hl-line",
        type: "line",
        source: HL_SOURCE,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#ffffff",
          "line-width": calculateZoomDependentWidth(w, 2.0),
          "line-opacity": 0.9,
        },
      })
      map.addLayer({
        id: "vdp-hl-inner",
        type: "line",
        source: HL_SOURCE,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": color,
          "line-width": calculateZoomDependentWidth(w, 1.5),
          "line-opacity": 1.0,
        },
      })
    } catch (e) {
      console.error("[VDP] addTrailHighlight error:", e)
    }
  }

  function removeTrailHighlight() {
    if (!map) return
    for (const id of HL_LAYERS) {
      try {
        if (map.getLayer(id)) map.removeLayer(id)
      } catch {}
    }
    try {
      if (map.getSource(HL_SOURCE)) map.removeSource(HL_SOURCE)
    } catch {}
  }

  // Live-update highlight source as trail grows.
  // Watching the raw stores directly (rather than the derived activeTrailData)
  // ensures Svelte picks up every path mutation pushed by the realtime sync.
  $: if (showInfoPanel && isTrailing && currentVehicle) {
    const trail = currentVehicle.isCurrentUser
      ? $currentTrailStore
      : $otherActiveTrailStore?.find((t) => t.vehicle_id === currentVehicle.id)
    if (trail?.path?.length >= 2) {
      const src = map?.getSource(HL_SOURCE)
      if (src) {
        const coords = trail.path.map(normCoord).filter(Boolean)
        if (coords.length >= 2)
          src.setData({
            type: "Feature",
            geometry: { type: "LineString", coordinates: coords },
            properties: {},
          })
      }
    }
  }

  // Remove highlight when trailing stops
  $: if (!isTrailing) removeTrailHighlight()

  onDestroy(() => removeTrailHighlight())

  // ── Trail stats ───────────────────────────────────────────────
  $: trailStats = (() => {
    const trail = activeTrailData
    if (!trail?.path?.length) return null
    const path = trail.path
    if (path.length < 2) return null
    try {
      const coords = path.map(normCoord).filter(Boolean)
      if (coords.length < 2) return null
      const line = turf.lineString(coords)
      const distKm = turf.length(line, { units: "kilometers" })
      const swathM = trail.trail_width || vehicleSwath || 3
      const coverageHa = (distKm * 1000 * swathM) / 10000
      const distStr =
        distKm < 1
          ? `${(distKm * 1000).toFixed(0)} m`
          : `${distKm.toFixed(2)} km`
      return {
        distStr,
        coverageHa: coverageHa.toFixed(2),
        swathM,
        points: path.length,
        trailColor: trail.trail_color,
      }
    } catch {
      return null
    }
  })()
</script>

{#if currentVehicle}
  <div class="vehicle-panel" class:expanded={isExpanded}>
    {#if isExpanded && showInfoPanel}
      {#if isTrailing}
        <!-- ── Trail stats panel ── -->
        <div class="trail-stats-section">
          <div class="ts-header">
            <div class="ts-header-left">
              <svg
                class="ts-trail-icon"
                viewBox="0 0 32 32"
                width="16"
                height="16"
                xmlns="http://www.w3.org/2000/svg"
                style="--trail-icon-color: {trailStats?.trailColor ??
                  '#4ade80'}"
              >
                <path
                  d="M30.165 30.887c-1.604 0.076-21.522-0.043-21.522-0.043-12.101-12.151 18.219-16.173-0.521-26.154l-1.311 1.383-1.746-4.582 5.635 0.439-1.128 1.267c23.438 6.83-3.151 19.631 20.594 27.69v0z"
                />
              </svg>
              <span class="ts-title">Active Trail</span>
            </div>
            <span class="ts-swath">{vehicleSwath}m swath</span>
          </div>

          <div class="ts-grid">
            <div class="ts-stat">
              <span class="ts-value">{trailHMM ?? trailDur}</span>
              <span class="ts-label">Duration</span>
            </div>
            <div class="ts-stat">
              <span class="ts-value">{trailStats?.distStr ?? "—"}</span>
              <span class="ts-label">Distance</span>
            </div>
            <div class="ts-stat ts-stat--green">
              <span class="ts-value"
                >~{trailStats?.coverageHa ?? "—"}
                <span class="ts-unit">ha</span></span
              >
              <span class="ts-label">Est. coverage</span>
            </div>
          </div>
        </div>
      {:else}
        <!-- ── Generic info panel (other vehicles / not trailing) ── -->
        {#key `${vehicleType}-${vehicleBodyColor}-${vehicleSwath}`}
          <div class="info-section">
            <div class="vehicle-header">
              <div class="vehicle-title">
                <span class="vehicle-label"
                  >{currentVehicle.full_name || "Unknown Operator"}</span
                >
                <span class="vehicle-type">{displayName}</span>
              </div>
              <div
                class="vehicle-status"
                style="color: {getStatusColor(
                  getVehicleStatus(currentVehicle),
                )}"
              >
                {getVehicleStatus(currentVehicle)}
              </div>
            </div>

            <div class="status-grid">
              <!-- Speed display - now fully reactive -->
              <div class="status-item" data-speed-status={speedStatus}>
                <div class="status-icon" style="color: {speedColor}">
                  <Zap size={16} />
                </div>
                <div class="status-content">
                  <span class="status-label">Speed</span>
                  <span class="status-value" style="color: {speedColor}"
                    >{currentSpeed}</span
                  >
                </div>
              </div>

              <div class="status-item">
                <div class="status-icon">
                  <Truck size={16} />
                </div>
                <div class="status-content">
                  <span class="status-label">Operation</span>
                  <span class="status-value"
                    >{getCurrentOperation(currentVehicle)}</span
                  >
                </div>
              </div>

              <div class="status-item">
                <div class="status-icon">
                  <Ruler size={16} />
                </div>
                <div class="status-content">
                  <span class="status-label">Trail Swath</span>
                  <span class="status-value">{getTrailSwath()}</span>
                </div>
              </div>

              <div class="status-item">
                <div class="status-icon">
                  <Palette size={16} />
                </div>
                <div class="status-content">
                  <span class="status-label">Trail Color</span>
                  <div class="trail-color-display">
                    <div
                      class="color-swatch"
                      style="background-color: {getTrailColorValue()}"
                    ></div>
                    <span class="status-value">{getTrailColor()}</span>
                  </div>
                </div>
              </div>

              {#if currentVehicle.is_trailing}
                <div class="status-item">
                  <div class="status-icon">
                    <Clock size={16} />
                  </div>
                  <div class="status-content">
                    <span class="status-label">Trailing for</span>
                    <span class="status-value"
                      >{formatTrailingDuration(currentVehicle)}</span
                    >
                  </div>
                </div>
              {/if}
            </div>

            {#if currentVehicle.is_trailing}
              <div class="trailing-section">
                <div class="trailing-indicator">
                  <Navigation size={14} />
                  <span>Currently trailing</span>
                </div>
              </div>
            {/if}
          </div>
        {/key}
      {/if}
    {/if}

    <div class="control-bar">
      <button
        class="vehicle-icon-display"
        class:clickable={isCurrentUser}
        on:click={handleIconClick}
        disabled={!isCurrentUser}
      >
        {#if VehicleIcon}
          {#key `${vehicleBodyColor}-${vehicleSwath}`}
            <svelte:component
              this={VehicleIcon}
              bodyColor={vehicleBodyColor}
              size="24px"
              swath={vehicleSwath}
            />
          {/key}
        {:else}
          <User size={20} />
        {/if}
        {#if isCurrentUser}
          <div class="edit-badge"><Edit3 size={12} /></div>
        {/if}
      </button>

      <div class="vehicle-text-info">
        <div class="vstack">
          <span class="vs-name"
            >{isCurrentUser
              ? "You"
              : currentVehicle.full_name || "Unknown"}</span
          >
          <span class="vs-sub"
            >{displayName}{#if opName}
              · {opName}{/if}</span
          >
        </div>
      </div>

      <div class="action-controls">
        {#if isTrailing && isDifferentOperation}
          {#if trailStatsLoading}
            <button class="trail-badge-animated trail-badge-loading" disabled>
              <svg class="tbadge-trail-svg" viewBox="0 0 32 32" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
                <path d="M30.165 30.887c-1.604 0.076-21.522-0.043-21.522-0.043-12.101-12.151 18.219-16.173-0.521-26.154l-1.311 1.383-1.746-4.582 5.635 0.439-1.128 1.267c23.438 6.83-3.151 19.631 20.594 27.69v0z" />
              </svg>
              <span class="tbadge-loading-text">Loading trails...</span>
            </button>
          {:else if !isDiffOpVisible}
            <button
              class="trail-badge-animated trail-badge-v2-reveal"
              on:click={toggleViewOperation}
              title="View trails on {diffOpName}"
            >
              <svg class="tbadge-trail-svg" viewBox="0 0 32 32" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
                <path d="M30.165 30.887c-1.604 0.076-21.522-0.043-21.522-0.043-12.101-12.151 18.219-16.173-0.521-26.154l-1.311 1.383-1.746-4.582 5.635 0.439-1.128 1.267c23.438 6.83-3.151 19.631 20.594 27.69v0z" />
              </svg>
              <Eye size={17} class="tbadge-v2-eye" />
            </button>
          {:else}
            <button class="trail-badge-animated" class:active={showInfoPanel && isExpanded} on:click={handleInfoClick} title="Vehicle details">
              <svg class="tbadge-trail-svg" viewBox="0 0 32 32" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
                <path d="M30.165 30.887c-1.604 0.076-21.522-0.043-21.522-0.043-12.101-12.151 18.219-16.173-0.521-26.154l-1.311 1.383-1.746-4.582 5.635 0.439-1.128 1.267c23.438 6.83-3.151 19.631 20.594 27.69v0z" />
              </svg>
              <span class="tbadge-time">{trailHMM ?? trailDur}</span>
            </button>
          {/if}
          <button class="control-btn track-btn" on:click={handleStartTracking} title="Track"><Navigation size={20} /></button>
        {:else if isTrailing}
          <button
            class="trail-badge-animated"
            class:active={showInfoPanel && isExpanded}
            on:click={handleInfoClick}
            title="Vehicle details"
          >
            <svg class="tbadge-trail-svg" viewBox="0 0 32 32" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
              <path d="M30.165 30.887c-1.604 0.076-21.522-0.043-21.522-0.043-12.101-12.151 18.219-16.173-0.521-26.154l-1.311 1.383-1.746-4.582 5.635 0.439-1.128 1.267c23.438 6.83-3.151 19.631 20.594 27.69v0z" />
            </svg>
            <span class="tbadge-time">{trailHMM ?? trailDur}</span>
          </button>
          <button class="control-btn track-btn" on:click={handleStartTracking} title="Track"><Navigation size={20} /></button>
        {:else}
          <button class="control-btn track-btn" on:click={handleStartTracking} title="Track"><Navigation size={20} /></button>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .vehicle-panel {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: rgba(0, 0, 0, 0.9);
    backdrop-filter: blur(16px);
    color: white;
    z-index: 1000;
    transition: all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
    border-top: 1px solid rgba(255, 255, 255, 0.1);
  }

  /* ── Trail stats section ── */
  .trail-stats-section {
    padding: 14px 20px 12px;
    background: linear-gradient(
      to bottom,
      rgba(0, 0, 0, 0.93),
      rgba(0, 0, 0, 0.87)
    );
    border-bottom: 1px solid rgba(34, 197, 94, 0.2);
  }

  .ts-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }

  .ts-header-left {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .ts-trail-icon {
    flex-shrink: 0;
    fill: var(--trail-icon-color, #4ade80);
    stroke: none;
    filter: drop-shadow(
      0 0 3px
        color-mix(in srgb, var(--trail-icon-color, #4ade80) 80%, transparent)
    );
    animation: trailPulseFill 1.6s ease-in-out infinite;
  }

  .ts-title {
    font-size: 13px;
    font-weight: 600;
    color: white;
  }

  .ts-swath {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.35);
    font-weight: 500;
  }

  .ts-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }

  .ts-stat {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .ts-value {
    font-size: 17px;
    font-weight: 700;
    color: white;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    letter-spacing: -0.01em;
  }

  .ts-unit {
    font-size: 11px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.45);
  }

  .ts-label {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.4);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 500;
  }

  .ts-stat--green .ts-value {
    color: #4ade80;
  }

  .ts-footer {
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.07);
    font-size: 10px;
    color: rgba(255, 255, 255, 0.28);
    line-height: 1.4;
  }

  .info-section {
    padding: 16px 20px 0;
    max-height: 40vh;
    overflow-y: auto;
    background: linear-gradient(
      to bottom,
      rgba(0, 0, 0, 0.9),
      rgba(0, 0, 0, 0.8)
    );
    opacity: 0;
    transform: translateY(-20px);
    transition: all 0.3s ease;
  }

  .vehicle-panel.expanded .info-section {
    opacity: 1;
    transform: translateY(0);
  }

  .vehicle-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .vehicle-title {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .vehicle-label {
    font-size: 16px;
    font-weight: 600;
    color: white;
  }

  .vehicle-type {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.6);
  }

  .vehicle-status {
    font-size: 12px;
    font-weight: 500;
    padding: 4px 8px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.1);
  }

  .status-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-bottom: 16px;
  }

  .status-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    border-left: 3px solid #60a5fa;
  }

  .status-icon {
    color: #60a5fa;
    flex-shrink: 0;
  }

  .status-content {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }

  .status-label {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.6);
    font-weight: 500;
  }

  .status-value {
    font-size: 13px;
    font-weight: 600;
    color: white;
    text-overflow: ellipsis;
    overflow: hidden;
    white-space: nowrap;
  }

  .trail-color-display {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .color-swatch {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.3);
    flex-shrink: 0;
  }

  .trailing-section {
    margin-bottom: 12px;
    padding: 12px;
    background: rgba(34, 197, 94, 0.1);
    border-radius: 8px;
    border-left: 3px solid #22c55e;
  }

  .trailing-indicator {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #22c55e;
    font-size: 13px;
    font-weight: 500;
  }

  .control-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 14px;
    padding: 18px 24px;
    background: rgba(0, 0, 0, 0.95);
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(20px);
    min-height: 72px;
  }

  .vehicle-icon-display {
    position: relative;
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.9);
    border-radius: 50%;
    border: 3px solid #60a5fa;
    flex-shrink: 0;
    transition: all 0.3s ease;
    touch-action: manipulation;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
    box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.2);
  }

  .vehicle-icon-display.clickable {
    cursor: pointer;
  }

  .vehicle-icon-display.clickable:hover {
    transform: scale(1.05);
    border-color: #93c5fd;
    box-shadow: 0 0 0 4px rgba(96, 165, 250, 0.3);
  }

  .vehicle-icon-display:disabled {
    cursor: default;
  }

  .edit-badge {
    position: absolute;
    bottom: -4px;
    right: -4px;
    width: 22px;
    height: 22px;
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    border: 2px solid rgba(0, 0, 0, 0.9);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    transition: all 0.2s ease;
    box-shadow: 0 2px 8px rgba(16, 185, 129, 0.5);
  }

  .vehicle-icon-display.clickable:hover .edit-badge {
    transform: scale(1.2) rotate(-12deg);
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.7);
  }

  .vehicle-text-info {
    display: flex;
    flex: 1;
    min-width: 0;
  }

  .vehicle-name {
    font-size: 18px;
    font-weight: 600;
    color: white;
    text-overflow: ellipsis;
    overflow: hidden;
    white-space: nowrap;
    line-height: 1.2;
    flex: 1;
    min-width: 0;
  }

  .vehicle-type-preview {
    font-size: 14px;
    font-weight: 400;
    color: rgba(255, 255, 255, 0.6);
    font-style: italic;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex-shrink: 1;
    min-width: 0;
  }

  .action-controls {
    display: flex;
    gap: 12px;
    align-items: center;
  }

  .control-btn {
    background: rgba(255, 255, 255, 0.1);
    border: none;
    border-radius: 50%;
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(255, 255, 255, 0.8);
    cursor: pointer;
    transition: all 0.2s ease;
    touch-action: manipulation;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
  }

  .control-btn:hover {
    background: rgba(255, 255, 255, 0.2);
    color: white;
    transform: scale(1.05);
  }

  .control-btn:active {
    transform: scale(0.95);
    transition: transform 0.1s ease;
  }

  .vstack {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    flex: 1;
  }

  .vs-name {
    font-size: 17px;
    font-weight: 600;
    color: white;
    text-overflow: ellipsis;
    overflow: hidden;
    white-space: nowrap;
    line-height: 1.2;
  }

  .vs-sub {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.55);
    text-overflow: ellipsis;
    overflow: hidden;
    white-space: nowrap;
  }

  /* ── Trail badge (clickable) ── */
  .trail-badge-animated {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
    background: rgba(34, 197, 94, 0.1);
    border: 1px solid rgba(34, 197, 94, 0.3);
    border-radius: 8px;
    padding: 7px 12px;
    cursor: pointer;
    transition:
      background 0.2s ease,
      border-color 0.2s ease;
    touch-action: manipulation;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
  }

  .trail-badge-animated:hover,
  .trail-badge-animated.active {
    background: rgba(34, 197, 94, 0.22);
    border-color: rgba(34, 197, 94, 0.6);
  }

  .trail-badge-animated:active {
    transform: scale(0.97);
    transition: transform 0.1s ease;
  }

  .tbadge-trail-svg {
    flex-shrink: 0;
    fill: #4ade80;
    stroke: none;
    animation: trailPulseFill 1.6s ease-in-out infinite;
    filter: drop-shadow(0 0 3px rgba(74, 222, 128, 0.8));
  }

  .tbadge-time {
    font-size: 17px;
    font-weight: 700;
    color: #4ade80;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.02em;
  }

  /* V2: one-click reveal badge — eye icon inline with time */
  .trail-badge-v2-reveal {
    gap: 6px;
    padding: 6px 14px;
    background: rgba(59, 130, 246, 0.12);
  }

  .trail-badge-v2-reveal:hover {
    background: rgba(59, 130, 246, 0.22);
  }

  .tbadge-v2-eye {
    color: #60a5fa;
    flex-shrink: 0;
  }

  .trail-badge-loading {
    gap: 6px;
    opacity: 0.7;
    cursor: default;
  }

  .tbadge-loading-text {
    font-size: 11px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.5);
  }

  @keyframes trailPulseFill {
    0%,
    100% {
      fill-opacity: 1;
      filter: drop-shadow(0 0 4px rgba(74, 222, 128, 0.9));
    }
    50% {
      fill-opacity: 0.1;
      filter: drop-shadow(0 0 1px rgba(74, 222, 128, 0.2));
    }
  }

  .info-btn {
    background: rgba(34, 197, 94, 0.2);
    color: #22c55e;
  }

  .info-btn:hover,
  .info-btn.active {
    background: rgba(34, 197, 94, 0.3);
    color: white;
  }

  .track-btn {
    background: rgba(168, 85, 247, 0.2);
    color: #a855f7;
  }

  .track-btn:hover {
    background: rgba(168, 85, 247, 0.3);
    color: white;
  }

  .status-item[data-speed-status="moving"] {
    border-left-color: #22c55e;
  }

  .status-item[data-speed-status="stationary"] {
    border-left-color: #f59e0b;
  }

  .status-item[data-speed-status="stale"] {
    border-left-color: #6b7280;
  }

  @media (max-width: 768px) {
    .info-section {
      max-height: 35vh;
      padding: 12px 16px 0;
    }

    .control-bar {
      padding: 16px 20px;
      min-height: 68px;
    }

    .control-btn {
      width: 44px;
      height: 44px;
    }

    .vehicle-icon-display {
      width: 44px;
      height: 44px;
      border-width: 2px;
    }

    .edit-badge {
      width: 20px;
      height: 20px;
    }

    .vehicle-info {
      gap: 12px;
    }

    .vehicle-name {
      font-size: 16px;
    }

    .vehicle-type-preview {
      font-size: 11px;
    }

    .status-grid {
      grid-template-columns: 1fr;
      gap: 8px;
    }
  }

  @media (max-width: 360px) {
    .vehicle-name {
      font-size: 14px;
    }

    .vehicle-type-preview {
      font-size: 10px;
    }
  }

  .info-section::-webkit-scrollbar {
    width: 4px;
  }

  .info-section::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2px;
  }

  .info-section::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.3);
    border-radius: 2px;
  }
</style>
