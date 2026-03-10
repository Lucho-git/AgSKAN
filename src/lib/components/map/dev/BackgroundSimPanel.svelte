<!-- src/lib/components/map/dev/BackgroundSimPanel.svelte -->
<script>
  import { onDestroy } from "svelte"
  import { Radio, Play, Square, MapPin, RotateCw, ArrowLeft, ArrowRight } from "lucide-svelte"
  import {
    devBackgroundSimEnabled,
    devPositionStore,
  } from "$lib/stores/devModeStore"
  import { userVehicleStore } from "$lib/stores/vehicleStore"
  import backgroundService from "$lib/services/backgroundService"

  export let map = null

  // Simulation state
  let isRunning = false
  let tickInterval = null
  let tickCount = 0
  let elapsedSeconds = 0
  let elapsedTimer = null

  // Route pattern
  let pattern = "circle" // circle | backforth | random | straight
  const PATTERNS = [
    { value: "circle", label: "Circle" },
    { value: "backforth", label: "Back & Forth" },
    { value: "random", label: "Random Walk" },
    { value: "straight", label: "Straight" },
  ]

  // Config
  let intervalMs = 3000 // Simulated GPS update interval (ms)
  let speed = 8 // Simulated speed m/s (typical farming = 3-12 m/s)
  let radiusMeters = 200 // Circle radius

  const INTERVAL_OPTIONS = [
    { value: 1000, label: "1s" },
    { value: 3000, label: "3s" },
    { value: 5000, label: "5s" },
    { value: 10000, label: "10s" },
    { value: 30000, label: "30s" },
  ]

  const SPEED_OPTIONS = [
    { value: 2, label: "Crawl (2 m/s)" },
    { value: 5, label: "Walk (5 m/s)" },
    { value: 8, label: "Tractor (8 m/s)" },
    { value: 15, label: "Ute (15 m/s)" },
    { value: 30, label: "Drive (30 m/s)" },
  ]

  // Track origin point for patterns
  let originLat = null
  let originLng = null
  let angle = 0 // For circle pattern (radians)
  let direction = 1 // For back-and-forth (+1 or -1)
  let heading = 0 // Current heading degrees
  let distanceTravelled = 0 // For back-and-forth

  function getOrigin() {
    // Use current vehicle position, dev position, or map center
    const veh = $userVehicleStore
    if (veh?.coordinates?.latitude && veh?.coordinates?.longitude) {
      return { lat: veh.coordinates.latitude, lng: veh.coordinates.longitude }
    }
    const dev = $devPositionStore
    if (dev?.latitude && dev?.longitude) {
      return { lat: dev.latitude, lng: dev.longitude }
    }
    if (map) {
      const c = map.getCenter()
      return { lat: c.lat, lng: c.lng }
    }
    return { lat: -33.8688, lng: 151.2093 } // Sydney fallback
  }

  function startSimulation() {
    if (isRunning) return

    const origin = getOrigin()
    originLat = origin.lat
    originLng = origin.lng
    angle = 0
    direction = 1
    heading = 0
    distanceTravelled = 0
    tickCount = 0
    elapsedSeconds = 0
    isRunning = true

    // Fire background lifecycle through real backgroundService
    backgroundService.simulateBackground()

    // Start the elapsed timer
    elapsedTimer = setInterval(() => {
      elapsedSeconds++
    }, 1000)

    // Immediately fire the first location
    generateAndSendLocation()

    // Then schedule periodic updates
    tickInterval = setInterval(() => {
      generateAndSendLocation()
    }, intervalMs)
  }

  function stopSimulation() {
    if (!isRunning) return
    isRunning = false

    if (tickInterval) {
      clearInterval(tickInterval)
      tickInterval = null
    }
    if (elapsedTimer) {
      clearInterval(elapsedTimer)
      elapsedTimer = null
    }

    // Fire foreground lifecycle through real backgroundService
    backgroundService.simulateForeground()
  }

  function generateAndSendLocation() {
    tickCount++

    // Distance moved this tick (meters)
    const distPerTick = speed * (intervalMs / 1000)

    let lat, lng

    if (pattern === "circle") {
      // Move along a circle around origin
      // angular increment based on speed and radius
      const circumference = 2 * Math.PI * radiusMeters
      const angularDist = distPerTick / circumference * 2 * Math.PI
      angle += angularDist

      const dLat = radiusMeters * Math.cos(angle) / 111320
      const dLng = radiusMeters * Math.sin(angle) / (111320 * Math.cos(originLat * Math.PI / 180))
      lat = originLat + dLat
      lng = originLng + dLng

      // Heading is tangent to circle
      heading = ((angle * 180 / Math.PI) + 90) % 360

    } else if (pattern === "backforth") {
      // Move north, then south, then north...
      distanceTravelled += distPerTick * direction
      if (Math.abs(distanceTravelled) > radiusMeters) {
        direction *= -1
      }
      heading = direction > 0 ? 0 : 180
      lat = originLat + distanceTravelled / 111320
      lng = originLng

    } else if (pattern === "random") {
      // Random walk: pick a random heading change, move forward
      heading += (Math.random() - 0.5) * 60 // ±30° change
      heading = ((heading % 360) + 360) % 360
      const headingRad = heading * Math.PI / 180
      const dLat = distPerTick * Math.cos(headingRad) / 111320
      const dLng = distPerTick * Math.sin(headingRad) / (111320 * Math.cos(originLat * Math.PI / 180))
      // accumulate from last position
      const last = getLastPosition()
      lat = last.lat + dLat
      lng = last.lng + dLng

    } else if (pattern === "straight") {
      // Straight line heading north
      heading = 0
      const totalDist = distPerTick * tickCount
      lat = originLat + totalDist / 111320
      lng = originLng
    }

    // Add tiny GPS noise (±2m)
    const noise = () => (Math.random() - 0.5) * 2 / 111320
    lat += noise()
    lng += noise()

    // Send through backgroundService's real pipeline
    backgroundService.simulateLocationUpdate(
      lat,
      lng,
      heading,
      speed,
      5 + Math.random() * 10 // accuracy 5-15m
    )

    // Update last known position for random walk
    lastLat = lat
    lastLng = lng
  }

  let lastLat = null
  let lastLng = null

  function getLastPosition() {
    if (lastLat != null && lastLng != null) {
      return { lat: lastLat, lng: lastLng }
    }
    return { lat: originLat, lng: originLng }
  }

  function formatElapsed(s) {
    const m = Math.floor(s / 60)
    const sec = s % 60
    if (m > 0) return `${m}m ${sec}s`
    return `${sec}s`
  }

  onDestroy(() => {
    if (isRunning) stopSimulation()
  })
</script>

{#if $devBackgroundSimEnabled}
  <div class="bgsim-overlay">
    <!-- Header -->
    <div class="bgsim-header">
      <div class="bgsim-badge">
        <Radio size={12} />
        BG SIM
      </div>
      {#if isRunning}
        <span class="bgsim-status running">RUNNING</span>
        <span class="bgsim-elapsed">{formatElapsed(elapsedSeconds)}</span>
        <span class="bgsim-count">{tickCount} pts</span>
      {:else}
        <span class="bgsim-status idle">IDLE</span>
      {/if}
    </div>

    <!-- Pattern selector -->
    <div class="bgsim-row">
      {#each PATTERNS as p}
        <button
          class="bgsim-btn"
          class:active={pattern === p.value}
          disabled={isRunning}
          on:click={() => pattern = p.value}
        >
          {p.label}
        </button>
      {/each}
    </div>

    <!-- Interval selector -->
    <div class="bgsim-row">
      <span class="bgsim-label">Interval</span>
      {#each INTERVAL_OPTIONS as opt}
        <button
          class="bgsim-btn small"
          class:active={intervalMs === opt.value}
          disabled={isRunning}
          on:click={() => intervalMs = opt.value}
        >
          {opt.label}
        </button>
      {/each}
    </div>

    <!-- Speed selector -->
    <div class="bgsim-row">
      <span class="bgsim-label">Speed</span>
      {#each SPEED_OPTIONS as opt}
        <button
          class="bgsim-btn small"
          class:active={speed === opt.value}
          disabled={isRunning}
          on:click={() => speed = opt.value}
        >
          {opt.label}
        </button>
      {/each}
    </div>

    <!-- Start / Stop -->
    <div class="bgsim-actions">
      {#if !isRunning}
        <button class="bgsim-action start" on:click={startSimulation}>
          <Play size={16} />
          Start Background Sim
        </button>
      {:else}
        <button class="bgsim-action stop" on:click={stopSimulation}>
          <Square size={16} />
          Stop & Return to Foreground
        </button>
      {/if}
    </div>
  </div>
{/if}

<style>
  .bgsim-overlay {
    position: fixed;
    bottom: 20px;
    left: 12px;
    z-index: 900;
    display: flex;
    flex-direction: column;
    gap: 4px;
    pointer-events: auto;
    max-width: 320px;
  }

  .bgsim-header {
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(10, 10, 10, 0.9);
    border: 1px solid rgba(168, 85, 247, 0.5);
    border-radius: 8px;
    padding: 6px 10px;
    backdrop-filter: blur(8px);
  }

  .bgsim-badge {
    display: flex;
    align-items: center;
    gap: 4px;
    background: rgba(168, 85, 247, 0.25);
    color: rgba(168, 85, 247, 1);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.5px;
    padding: 2px 8px;
    border-radius: 4px;
    white-space: nowrap;
  }

  .bgsim-status {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.5px;
    padding: 1px 6px;
    border-radius: 3px;
  }
  .bgsim-status.running {
    background: rgba(34, 197, 94, 0.2);
    color: rgba(34, 197, 94, 1);
    animation: pulse-bg 1.5s ease-in-out infinite;
  }
  .bgsim-status.idle {
    background: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.5);
  }

  .bgsim-elapsed {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.6);
    font-family: monospace;
  }

  .bgsim-count {
    font-size: 11px;
    color: rgba(168, 85, 247, 0.8);
    font-family: monospace;
    margin-left: auto;
  }

  .bgsim-row {
    display: flex;
    align-items: center;
    gap: 4px;
    background: rgba(10, 10, 10, 0.9);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 8px;
    padding: 4px 8px;
    backdrop-filter: blur(8px);
    flex-wrap: wrap;
  }

  .bgsim-label {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.4);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    min-width: 42px;
  }

  .bgsim-btn {
    font-size: 11px;
    padding: 3px 8px;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    background: transparent;
    color: rgba(255, 255, 255, 0.6);
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }
  .bgsim-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .bgsim-btn.active {
    background: rgba(168, 85, 247, 0.3);
    border-color: rgba(168, 85, 247, 0.6);
    color: rgba(168, 85, 247, 1);
  }
  .bgsim-btn.small {
    font-size: 10px;
    padding: 2px 6px;
  }

  .bgsim-actions {
    display: flex;
    gap: 6px;
  }

  .bgsim-action {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
    border: none;
  }
  .bgsim-action.start {
    background: rgba(34, 197, 94, 0.2);
    border: 1px solid rgba(34, 197, 94, 0.5);
    color: rgba(34, 197, 94, 1);
  }
  .bgsim-action.start:hover {
    background: rgba(34, 197, 94, 0.35);
  }
  .bgsim-action.stop {
    background: rgba(239, 68, 68, 0.2);
    border: 1px solid rgba(239, 68, 68, 0.5);
    color: rgba(239, 68, 68, 1);
  }
  .bgsim-action.stop:hover {
    background: rgba(239, 68, 68, 0.35);
  }

  @keyframes pulse-bg {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }
</style>
