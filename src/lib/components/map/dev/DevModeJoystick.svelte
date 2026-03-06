<!-- src/lib/components/map/dev/DevModeJoystick.svelte -->
<script>
  import { onMount, onDestroy } from "svelte"
  import {
    devModeEnabled,
    devPositionStore,
    devSpeedMultiplier,
  } from "$lib/stores/devModeStore"
  import { userVehicleStore } from "$lib/stores/vehicleStore"
  import { X, Navigation } from "lucide-svelte"

  export let map = null

  // Joystick state
  let joystickContainer
  let isDragging = false
  let knobX = 0
  let knobY = 0
  let animationFrame = null
  let moveInterval = null

  // Max distance the knob can travel from center (px)
  const MAX_RADIUS = 50
  // Update rate in ms
  const UPDATE_RATE = 50

  // Speed options (m/s → approx km/h display)
  const SPEED_OPTIONS = [
    { value: 5, label: "Walk (5 m/s)" },
    { value: 15, label: "Slow (15 m/s)" },
    { value: 30, label: "Drive (30 m/s)" },
    { value: 80, label: "Fast (80 m/s)" },
    { value: 200, label: "Fly (200 m/s)" },
    { value: 1000, label: "Warp (1 km/s)" },
    { value: 5000, label: "Hyper (5 km/s)" },
    { value: 10000, label: "Ludicrous (10 km/s)" },
    { value: 50000, label: "Absurd (50 km/s)" },
    { value: 200000, label: "Plaid (200 km/s)" },
  ]

  $: currentSpeedLabel =
    SPEED_OPTIONS.find((o) => o.value === $devSpeedMultiplier)?.label || ""

  function exitDevMode() {
    devModeEnabled.set(false)
    stopMovement()
  }

  // Initialize dev position from current vehicle position or map center
  function initPosition() {
    const coords = $userVehicleStore?.coordinates
    if (coords?.latitude && coords?.longitude) {
      devPositionStore.set({
        latitude: coords.latitude,
        longitude: coords.longitude,
        heading: $userVehicleStore.heading || 0,
        speed: 0,
      })
    } else if (map) {
      const center = map.getCenter()
      devPositionStore.set({
        latitude: center.lat,
        longitude: center.lng,
        heading: 0,
        speed: 0,
      })
    }
  }

  // Convert knob displacement to heading (degrees) and magnitude (0-1)
  function getDirectionFromKnob() {
    const distance = Math.sqrt(knobX * knobX + knobY * knobY)
    if (distance < 5) return { heading: 0, magnitude: 0 }

    // atan2 gives angle from positive X axis, we want heading from north
    // knobY is inverted (negative = up = north)
    const angleRad = Math.atan2(knobX, -knobY)
    let heading = (angleRad * 180) / Math.PI
    if (heading < 0) heading += 360

    const magnitude = Math.min(distance / MAX_RADIUS, 1)
    return { heading, magnitude }
  }

  // Move the simulated position based on current joystick state
  function tickMovement() {
    const { heading, magnitude } = getDirectionFromKnob()
    if (magnitude < 0.05) {
      devPositionStore.update((p) => ({ ...p, speed: 0 }))
      return
    }

    const speed = $devSpeedMultiplier * magnitude
    const distanceMeters = speed * (UPDATE_RATE / 1000)

    // Convert to lat/lng offset
    const headingRad = (heading * Math.PI) / 180
    const latOffset = (distanceMeters * Math.cos(headingRad)) / 111320
    const lngOffset =
      (distanceMeters * Math.sin(headingRad)) /
      (111320 * Math.cos(($devPositionStore.latitude * Math.PI) / 180))

    devPositionStore.update((p) => ({
      latitude: p.latitude + latOffset,
      longitude: p.longitude + lngOffset,
      heading: Math.round(heading),
      speed: Math.round(speed * 3.6), // m/s to km/h
    }))
  }

  function startMovement() {
    if (moveInterval) return
    moveInterval = setInterval(tickMovement, UPDATE_RATE)
  }

  function stopMovement() {
    if (moveInterval) {
      clearInterval(moveInterval)
      moveInterval = null
    }
    knobX = 0
    knobY = 0
    devPositionStore.update((p) => ({ ...p, speed: 0 }))
  }

  // --- Pointer / Touch handling ---
  function handlePointerDown(e) {
    isDragging = true
    updateKnob(e)
    startMovement()
    e.target.setPointerCapture(e.pointerId)
  }

  function handlePointerMove(e) {
    if (!isDragging) return
    updateKnob(e)
  }

  function handlePointerUp() {
    isDragging = false
    knobX = 0
    knobY = 0
    stopMovement()
  }

  function updateKnob(e) {
    if (!joystickContainer) return
    const rect = joystickContainer.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2

    let dx = e.clientX - centerX
    let dy = e.clientY - centerY

    // Clamp to max radius
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist > MAX_RADIUS) {
      dx = (dx / dist) * MAX_RADIUS
      dy = (dy / dist) * MAX_RADIUS
    }

    knobX = dx
    knobY = dy
  }

  onMount(() => {
    initPosition()
  })

  onDestroy(() => {
    stopMovement()
  })
</script>

{#if $devModeEnabled}
  <div class="dev-mode-overlay">
    <!-- Header bar -->
    <div class="dev-header">
      <div class="dev-badge">
        <Navigation size={14} />
        <span>DEV MODE</span>
      </div>
      <div class="dev-coords">
        {#if $devPositionStore.latitude}
          {$devPositionStore.latitude.toFixed(6)}, {$devPositionStore.longitude.toFixed(
            6,
          )}
        {/if}
      </div>
      <button class="dev-exit" on:click={exitDevMode}>
        <X size={18} />
      </button>
    </div>

    <!-- Speed selector -->
    <div class="dev-speed-bar">
      {#each SPEED_OPTIONS as option}
        <button
          class="speed-btn"
          class:active={$devSpeedMultiplier === option.value}
          on:click={() => devSpeedMultiplier.set(option.value)}
        >
          {option.value}
        </button>
      {/each}
      <span class="speed-label">{currentSpeedLabel}</span>
    </div>

    <!-- Joystick -->
    <div class="joystick-area">
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div
        class="joystick-ring"
        bind:this={joystickContainer}
        on:pointerdown={handlePointerDown}
        on:pointermove={handlePointerMove}
        on:pointerup={handlePointerUp}
        on:pointercancel={handlePointerUp}
      >
        <!-- Cardinal labels -->
        <span class="cardinal north">N</span>
        <span class="cardinal south">S</span>
        <span class="cardinal east">E</span>
        <span class="cardinal west">W</span>

        <!-- Knob -->
        <div
          class="joystick-knob"
          style="transform: translate({knobX}px, {knobY}px)"
        >
          <Navigation
            size={20}
            style="transform: rotate({$devPositionStore.heading}deg)"
          />
        </div>
      </div>

      <!-- Info -->
      <div class="joystick-info">
        <div class="info-row">
          <span class="info-label">Heading</span>
          <span class="info-value">{$devPositionStore.heading}°</span>
        </div>
        <div class="info-row">
          <span class="info-label">Speed</span>
          <span class="info-value">{$devPositionStore.speed} km/h</span>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .dev-mode-overlay {
    position: fixed;
    bottom: 20px;
    right: 12px;
    z-index: 900;
    display: flex;
    flex-direction: column;
    gap: 6px;
    pointer-events: auto;
  }

  .dev-header {
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(10, 10, 10, 0.9);
    border: 1px solid rgba(239, 68, 68, 0.5);
    border-radius: 8px;
    padding: 6px 10px;
    backdrop-filter: blur(8px);
  }

  .dev-badge {
    display: flex;
    align-items: center;
    gap: 4px;
    background: rgba(239, 68, 68, 0.25);
    color: rgba(239, 68, 68, 1);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.5px;
    padding: 2px 8px;
    border-radius: 4px;
    white-space: nowrap;
  }

  .dev-coords {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.6);
    font-family: monospace;
    flex: 1;
    text-align: center;
  }

  .dev-exit {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 6px;
    border: 1px solid rgba(239, 68, 68, 0.4);
    background: rgba(239, 68, 68, 0.15);
    color: rgba(239, 68, 68, 0.9);
    cursor: pointer;
    transition: all 0.15s;
  }
  .dev-exit:hover {
    background: rgba(239, 68, 68, 0.3);
  }

  .dev-speed-bar {
    display: flex;
    align-items: center;
    gap: 4px;
    background: rgba(10, 10, 10, 0.9);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 8px;
    padding: 4px 8px;
    backdrop-filter: blur(8px);
  }

  .speed-btn {
    font-size: 11px;
    padding: 3px 8px;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    background: transparent;
    color: rgba(255, 255, 255, 0.6);
    cursor: pointer;
    transition: all 0.15s;
  }
  .speed-btn.active {
    background: rgba(59, 130, 246, 0.3);
    border-color: rgba(59, 130, 246, 0.6);
    color: rgba(59, 130, 246, 1);
  }

  .speed-label {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.4);
    margin-left: auto;
  }

  .joystick-area {
    display: flex;
    align-items: center;
    gap: 12px;
    background: rgba(10, 10, 10, 0.9);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 12px;
    padding: 12px;
    backdrop-filter: blur(8px);
  }

  .joystick-ring {
    position: relative;
    width: 120px;
    height: 120px;
    border-radius: 50%;
    border: 2px solid rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.04);
    flex-shrink: 0;
    touch-action: none;
    user-select: none;
  }

  .cardinal {
    position: absolute;
    font-size: 10px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.3);
    pointer-events: none;
  }
  .cardinal.north {
    top: 4px;
    left: 50%;
    transform: translateX(-50%);
  }
  .cardinal.south {
    bottom: 4px;
    left: 50%;
    transform: translateX(-50%);
  }
  .cardinal.east {
    right: 6px;
    top: 50%;
    transform: translateY(-50%);
  }
  .cardinal.west {
    left: 6px;
    top: 50%;
    transform: translateY(-50%);
  }

  .joystick-knob {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 40px;
    height: 40px;
    margin-left: -20px;
    margin-top: -20px;
    border-radius: 50%;
    background: rgba(59, 130, 246, 0.4);
    border: 2px solid rgba(59, 130, 246, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    transition: transform 0.05s linear;
    box-shadow: 0 0 12px rgba(59, 130, 246, 0.3);
  }

  .joystick-info {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 80px;
  }

  .info-row {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .info-label {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.4);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .info-value {
    font-size: 16px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.9);
    font-family: monospace;
  }
</style>
