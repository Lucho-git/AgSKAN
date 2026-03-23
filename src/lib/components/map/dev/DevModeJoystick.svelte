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
  let moveInterval = null

  const MAX_RADIUS = 40
  const UPDATE_RATE = 50

  // Exponential slider: 0–100 → 2 m/s – 200,000 m/s
  const SPEED_MIN = 2
  const SPEED_MAX = 200000
  let sliderValue = 30 // initial position (~30 → ~26 m/s)

  // Map slider 0–100 to exponential speed
  function sliderToSpeed(v) {
    return Math.round(SPEED_MIN * Math.pow(SPEED_MAX / SPEED_MIN, v / 100))
  }

  // Human-readable speed label
  function formatSpeed(ms) {
    if (ms >= 1000) return `${(ms / 1000).toFixed(ms >= 10000 ? 0 : 1)} km/s`
    return `${ms} m/s`
  }

  $: {
    const spd = sliderToSpeed(sliderValue)
    devSpeedMultiplier.set(spd)
  }

  $: speedLabel = formatSpeed($devSpeedMultiplier)

  function exitDevMode() {
    devModeEnabled.set(false)
    stopMovement()
  }

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

  function getDirectionFromKnob() {
    const distance = Math.sqrt(knobX * knobX + knobY * knobY)
    if (distance < 5) return { heading: 0, magnitude: 0 }
    const angleRad = Math.atan2(knobX, -knobY)
    let heading = (angleRad * 180) / Math.PI
    if (heading < 0) heading += 360
    const magnitude = Math.min(distance / MAX_RADIUS, 1)
    return { heading, magnitude }
  }

  function tickMovement() {
    const { heading, magnitude } = getDirectionFromKnob()
    if (magnitude < 0.05) {
      devPositionStore.update((p) => ({ ...p, speed: 0 }))
      return
    }

    const speed = $devSpeedMultiplier * magnitude
    const distanceMeters = speed * (UPDATE_RATE / 1000)
    const headingRad = (heading * Math.PI) / 180
    const latOffset = (distanceMeters * Math.cos(headingRad)) / 111320
    const lngOffset =
      (distanceMeters * Math.sin(headingRad)) /
      (111320 * Math.cos(($devPositionStore.latitude * Math.PI) / 180))

    devPositionStore.update((p) => ({
      latitude: p.latitude + latOffset,
      longitude: p.longitude + lngOffset,
      heading: Math.round(heading),
      speed: Math.round(speed * 3.6),
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
  <div class="dev-overlay">
    <!-- Compact card -->
    <div class="dev-card">
      <!-- Top row: badge + stats + exit -->
      <div class="dev-top">
        <span class="dev-badge">DEV</span>
        <span class="dev-stat">{$devPositionStore.heading}°</span>
        <span class="dev-stat">{$devPositionStore.speed} km/h</span>
        <button class="dev-exit" on:click={exitDevMode}>
          <X size={14} />
        </button>
      </div>

      <!-- Joystick -->
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div
        class="joy-ring"
        bind:this={joystickContainer}
        on:pointerdown={handlePointerDown}
        on:pointermove={handlePointerMove}
        on:pointerup={handlePointerUp}
        on:pointercancel={handlePointerUp}
      >
        <span class="c n">N</span>
        <span class="c s">S</span>
        <span class="c e">E</span>
        <span class="c w">W</span>
        <div
          class="joy-knob"
          style="transform: translate({knobX}px, {knobY}px)"
        >
          <Navigation
            size={16}
            style="transform: rotate({$devPositionStore.heading}deg)"
          />
        </div>
      </div>

      <!-- Speed slider -->
      <div class="slider-row">
        <span class="slider-label">{speedLabel}</span>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          bind:value={sliderValue}
          class="speed-slider"
        />
      </div>
    </div>
  </div>
{/if}

<style>
  .dev-overlay {
    position: fixed;
    bottom: 24px;
    left: 75%;
    transform: translateX(-50%);
    z-index: 900;
    pointer-events: auto;
  }

  .dev-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    background: rgba(10, 10, 10, 0.88);
    border: 1px solid rgba(239, 68, 68, 0.45);
    border-radius: 14px;
    padding: 8px 14px 10px;
    backdrop-filter: blur(10px);
    min-width: 0;
  }

  /* Top row */
  .dev-top {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
  }

  .dev-badge {
    background: rgba(239, 68, 68, 0.25);
    color: rgba(239, 68, 68, 1);
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.8px;
    padding: 1px 6px;
    border-radius: 3px;
  }

  .dev-stat {
    font-size: 11px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.7);
    font-family: monospace;
  }

  .dev-exit {
    margin-left: auto;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 5px;
    border: 1px solid rgba(239, 68, 68, 0.35);
    background: rgba(239, 68, 68, 0.12);
    color: rgba(239, 68, 68, 0.85);
    cursor: pointer;
    transition: background 0.15s;
  }
  .dev-exit:hover {
    background: rgba(239, 68, 68, 0.3);
  }

  /* Joystick */
  .joy-ring {
    position: relative;
    width: 100px;
    height: 100px;
    border-radius: 50%;
    border: 2px solid rgba(255, 255, 255, 0.18);
    background: rgba(255, 255, 255, 0.04);
    touch-action: none;
    user-select: none;
    flex-shrink: 0;
  }

  .c {
    position: absolute;
    font-size: 9px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.25);
    pointer-events: none;
  }
  .c.n {
    top: 3px;
    left: 50%;
    transform: translateX(-50%);
  }
  .c.s {
    bottom: 3px;
    left: 50%;
    transform: translateX(-50%);
  }
  .c.e {
    right: 5px;
    top: 50%;
    transform: translateY(-50%);
  }
  .c.w {
    left: 5px;
    top: 50%;
    transform: translateY(-50%);
  }

  .joy-knob {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 34px;
    height: 34px;
    margin-left: -17px;
    margin-top: -17px;
    border-radius: 50%;
    background: rgba(59, 130, 246, 0.35);
    border: 2px solid rgba(59, 130, 246, 0.75);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    transition: transform 0.05s linear;
    box-shadow: 0 0 10px rgba(59, 130, 246, 0.25);
  }

  /* Speed slider */
  .slider-row {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
  }

  .slider-label {
    font-size: 10px;
    font-weight: 700;
    color: rgba(59, 130, 246, 0.9);
    font-family: monospace;
    min-width: 54px;
    text-align: right;
    white-space: nowrap;
  }

  .speed-slider {
    -webkit-appearance: none;
    appearance: none;
    flex: 1;
    height: 4px;
    border-radius: 2px;
    background: linear-gradient(
      to right,
      rgba(59, 130, 246, 0.3),
      rgba(239, 68, 68, 0.5)
    );
    outline: none;
  }

  .speed-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: rgba(59, 130, 246, 0.9);
    border: 2px solid rgba(255, 255, 255, 0.6);
    cursor: pointer;
    box-shadow: 0 0 6px rgba(59, 130, 246, 0.4);
  }

  .speed-slider::-moz-range-thumb {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: rgba(59, 130, 246, 0.9);
    border: 2px solid rgba(255, 255, 255, 0.6);
    cursor: pointer;
    box-shadow: 0 0 6px rgba(59, 130, 246, 0.4);
  }
</style>
