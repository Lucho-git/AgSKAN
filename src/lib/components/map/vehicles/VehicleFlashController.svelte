<!-- src/lib/components/map/vehicles/VehicleFlashController.svelte -->

<!-- Module-level: shared across all instances, survives destroy/recreate -->
<script context="module">
  import { toast } from "svelte-sonner"
  import { get } from "svelte/store"

  const FLASH_DURATION_MS = 5 * 60 * 1000 // 5 minutes
  const FLASH_TOAST_ID = "flash-toast"

  /** @type {ReturnType<typeof setTimeout> | null} */
  let autoStopTimeoutId = null
  /** @type {ReturnType<typeof setInterval> | null} */
  let toastIntervalId = null
  let flashToastActive = false

  function clearAllFlashTimers() {
    flashToastActive = false
    if (toastIntervalId) {
      clearInterval(toastIntervalId)
      toastIntervalId = null
    }
    if (autoStopTimeoutId) {
      clearTimeout(autoStopTimeoutId)
      autoStopTimeoutId = null
    }
    toast.dismiss(FLASH_TOAST_ID)
  }
</script>

<script>
  import { createEventDispatcher } from "svelte"
  import { userVehicleStore } from "$lib/stores/vehicleStore"
  import { onMount, onDestroy } from "svelte"
  import { connectedMapStore } from "$lib/stores/connectedMapStore"
  import { profileStore } from "$lib/stores/profileStore"
  import { listMapBroadcasts, createMapBroadcast } from "$lib/api/broadcastApi"

  const dispatch = createEventDispatcher()

  // Default broadcasts — everyone gets these. `default: true` means the wire
  // value is the id ("full" / "help") so older app builds still render the
  // right label + colour; custom broadcasts send their label instead.
  const DEFAULT_BROADCASTS = [
    { id: "full", label: "Full", color: "#f59e0b", default: true },
    { id: "help", label: "Help", color: "#ef4444", default: true },
  ]

  // Colours offered when creating a custom broadcast.
  const BROADCAST_COLORS = [
    "#f59e0b",
    "#ef4444",
    "#8b5cf6",
    "#3b82f6",
    "#22c55e",
    "#ec4899",
    "#06b6d4",
    "#f97316",
  ]

  let selectedId = "full"
  let customBroadcasts = []
  let newLabel = ""
  let newColor = BROADCAST_COLORS[3]
  let addingBroadcast = false

  $: isFlashing = $userVehicleStore.is_flashing
  $: flashReason = $userVehicleStore.flash_reason
  $: flashColor = $userVehicleStore.flash_color || "#f59e0b"
  $: broadcasts = [...DEFAULT_BROADCASTS, ...customBroadcasts]
  $: selectedBroadcast =
    broadcasts.find((b) => b.id === selectedId) || broadcasts[0]

  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  // Friendly label for a wire reason value (id or label).
  function broadcastLabelFor(reason) {
    if (!reason) return "Broadcast"
    const key = String(reason).toLowerCase()
    const match = broadcasts.find(
      (b) =>
        b.id.toLowerCase() === key || b.label.toLowerCase() === key,
    )
    return match ? match.label : String(reason)
  }

  function getRemainingSeconds() {
    const store = get(userVehicleStore)
    if (!store.flash_started_at) return 0
    const startTime = new Date(store.flash_started_at).getTime()
    const elapsed = Date.now() - startTime
    return Math.max(0, Math.ceil((FLASH_DURATION_MS - elapsed) / 1000))
  }

  function showFlashToast() {
    // Kill any existing toast/interval first
    clearAllFlashTimers()

    const store = get(userVehicleStore)
    const reasonLabel = broadcastLabelFor(store.flash_reason)
    const reasonColor = store.flash_color || "#f59e0b"

    flashToastActive = true

    const updateToast = () => {
      // Guard: don't re-create toast if flashing was stopped
      if (!flashToastActive) return

      const remaining = getRemainingSeconds()
      toast.info(`Broadcasting: ${reasonLabel}`, {
        id: FLASH_TOAST_ID,
        description: `Time remaining: ${formatTime(remaining)}`,
        duration: Infinity,
        style: `border-left: 4px solid ${reasonColor};`,
        action: {
          label: "Stop",
          onClick: () => stopFlashing(false),
        },
      })
    }

    updateToast()
    toastIntervalId = setInterval(updateToast, 1000)
  }

  async function loadCustomBroadcasts() {
    const mapId = $connectedMapStore?.id || $profileStore?.master_map_id
    if (!mapId) return

    customBroadcasts = await listMapBroadcasts(mapId)

    // Resume: highlight whatever broadcast label is currently active.
    const current = $userVehicleStore.flash_reason
    if (current) {
      const key = String(current).toLowerCase()
      const match = [...DEFAULT_BROADCASTS, ...customBroadcasts].find(
        (b) => b.label.toLowerCase() === key || b.id.toLowerCase() === key,
      )
      if (match) selectedId = match.id
    }
  }

  async function addBroadcast() {
    const label = newLabel.trim()
    if (!label) {
      toast.error("Enter a message for your broadcast")
      return
    }

    const mapId = $connectedMapStore?.id || $profileStore?.master_map_id
    if (!mapId) {
      toast.error("Join a map before adding broadcasts")
      return
    }

    addingBroadcast = true
    const created = await createMapBroadcast(
      mapId,
      label,
      newColor,
      $profileStore?.id,
    )
    addingBroadcast = false

    if (!created) {
      toast.error("Could not save the broadcast")
      return
    }

    if (!customBroadcasts.some((b) => b.id === created.id)) {
      customBroadcasts = [...customBroadcasts, created]
    }
    selectedId = created.id
    newLabel = ""
    toast.success(`"${created.label}" added to the broadcast menu`)
  }

  async function startFlashing() {
    const now = new Date().toISOString()

    userVehicleStore.update((vehicle) => ({
      ...vehicle,
      is_flashing: true,
      flash_started_at: now,
      flash_reason: selectedBroadcast?.default
        ? selectedBroadcast.id
        : selectedBroadcast?.label || "full",
      flash_color: selectedBroadcast?.color || "#f59e0b",
    }))

    clearAllFlashTimers()
    autoStopTimeoutId = setTimeout(() => {
      stopFlashing(true)
    }, FLASH_DURATION_MS)

    showFlashToast()
    dispatch("closeToolbox")
  }

  async function stopFlashing(autoStopped = false) {
    // Clear ALL timers first, before any store update or toast call
    clearAllFlashTimers()

    userVehicleStore.update((vehicle) => ({
      ...vehicle,
      is_flashing: false,
      flash_started_at: null,
      flash_reason: null,
      flash_color: null,
    }))

    if (autoStopped) {
      toast.info("Broadcast ended", {
        description: "5 minute broadcast period finished",
      })
    }
  }

  onMount(() => {
    loadCustomBroadcasts()

    if ($userVehicleStore.is_flashing && $userVehicleStore.flash_started_at) {
      const startTime = new Date($userVehicleStore.flash_started_at).getTime()
      const elapsed = Date.now() - startTime

      if (elapsed >= FLASH_DURATION_MS) {
        stopFlashing(true)
      } else {
        const remaining = FLASH_DURATION_MS - elapsed

        if (autoStopTimeoutId) clearTimeout(autoStopTimeoutId)
        autoStopTimeoutId = setTimeout(() => {
          stopFlashing(true)
        }, remaining)

        // Only start toast updates if one isn't already running
        if (!flashToastActive) {
          showFlashToast()
        }
      }
    }
  })

  onDestroy(() => {
    // Timers are module-level — they survive component destroy intentionally.
    // stopFlashing() and the reactive block handle cleanup.
  })

  // ── React to flash-stop from any source ──
  $: if (!isFlashing && flashToastActive) {
    clearAllFlashTimers()
  }
</script>

<div class="flash-controller">
  {#if isFlashing}
    <div class="currently-flashing">
      <div class="flash-status">
        <div
          class="status-indicator"
          style="background-color: {flashColor}"
        ></div>
        <span class="status-text"
          >Broadcasting: {broadcastLabelFor(flashReason).toUpperCase()}</span
        >
      </div>

      <button class="stop-button" on:click={() => stopFlashing()}>
        Stop Broadcasting
      </button>
    </div>
  {:else}
    <div class="flash-options">
      <div class="option-label">Choose a broadcast</div>

      <div class="reason-grid">
        {#each broadcasts as reason (reason.id)}
          <button
            class="reason-option"
            class:selected={selectedId === reason.id}
            style="--reason-color: {reason.color}"
            on:click={() => (selectedId = reason.id)}
          >
            <div class="reason-indicator"></div>
            <span>{reason.label}</span>
          </button>
        {/each}
      </div>

      <button class="start-button" on:click={startFlashing}>
        Start Broadcasting
      </button>

      <!-- Your own broadcasts — saved to this map for everyone -->
      <div class="custom-section">
        <div class="custom-title">Your own broadcasts</div>
        <p class="custom-desc">
          Add a message — everyone on this map gets it in their broadcast menu.
        </p>

        <input
          class="custom-input"
          type="text"
          maxlength="24"
          placeholder="e.g. Empty"
          bind:value={newLabel}
          on:keydown={(e) => {
            if (e.key === "Enter") addBroadcast()
          }}
        />

        <div class="color-row">
          {#each BROADCAST_COLORS as c}
            <button
              class="color-swatch"
              class:active={newColor === c}
              style="background: {c}"
              aria-label="Broadcast colour"
              on:click={() => (newColor = c)}
            ></button>
          {/each}
        </div>

        <button
          class="add-button"
          on:click={addBroadcast}
          disabled={addingBroadcast}
        >
          {addingBroadcast ? "Adding…" : "Add broadcast"}
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .flash-controller {
    padding: 4px 0;
  }

  .currently-flashing {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .flash-status {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
  }

  .status-indicator {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    animation: agskan-pulse 1s ease-in-out infinite;
  }

  @keyframes agskan-pulse {
    0%,
    100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.6;
      transform: scale(1.2);
    }
  }

  .status-text {
    font-size: 13px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.9);
  }

  .flash-options {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .option-label {
    font-size: 13px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.7);
  }

  .reason-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }

  .reason-option {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 12px 8px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s ease;
    color: rgba(255, 255, 255, 0.7);
    font-size: 12px;
  }

  .reason-option:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.2);
  }

  .reason-option.selected {
    background: rgba(255, 255, 255, 0.1);
    border-color: var(--reason-color);
    color: white;
  }

  .reason-indicator {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--reason-color);
    opacity: 0.6;
    transition: all 0.2s ease;
  }

  .reason-option.selected .reason-indicator {
    opacity: 1;
    box-shadow: 0 0 12px var(--reason-color);
  }

  .start-button,
  .stop-button {
    width: 100%;
    padding: 12px;
    border-radius: 8px;
    border: none;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .start-button {
    background: rgba(34, 197, 94, 0.2);
    border: 1px solid rgba(34, 197, 94, 0.4);
    color: #22c55e;
  }

  .start-button:hover {
    background: rgba(34, 197, 94, 0.3);
    border-color: rgba(34, 197, 94, 0.5);
  }

  /* ── Your own broadcasts (saved to this map) ── */
  .custom-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 6px;
    padding-top: 14px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
  }
  .custom-title {
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: rgba(255, 255, 255, 0.6);
  }
  .custom-desc {
    margin: 0;
    font-size: 11px;
    line-height: 1.4;
    color: rgba(255, 255, 255, 0.45);
  }
  .custom-input {
    width: 100%;
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    background: rgba(255, 255, 255, 0.06);
    color: #fff;
    font-size: 13px;
    outline: none;
  }
  .custom-input::placeholder {
    color: rgba(255, 255, 255, 0.35);
  }
  .custom-input:focus {
    border-color: rgba(96, 165, 250, 0.6);
  }
  .color-row {
    display: flex;
    gap: 8px;
  }
  .color-swatch {
    flex: 1;
    height: 26px;
    border-radius: 8px;
    border: 2px solid transparent;
    cursor: pointer;
    padding: 0;
    transition: all 0.15s ease;
  }
  .color-swatch:hover {
    transform: scale(1.08);
  }
  .color-swatch.active {
    border-color: #fff;
    box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.6);
  }
  .add-button {
    width: 100%;
    padding: 11px;
    border-radius: 8px;
    border: 1px solid rgba(96, 165, 250, 0.45);
    background: rgba(96, 165, 250, 0.14);
    color: #93c5fd;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .add-button:hover:not(:disabled) {
    background: rgba(96, 165, 250, 0.26);
  }
  .add-button:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .stop-button {
    background: rgba(239, 68, 68, 0.2);
    border: 1px solid rgba(239, 68, 68, 0.4);
    color: #ef4444;
  }

  .stop-button:hover {
    background: rgba(239, 68, 68, 0.3);
    border-color: rgba(239, 68, 68, 0.5);
  }

  @media (max-width: 768px) {
    .reason-grid {
      gap: 8px;
    }

    .reason-option {
      padding: 10px 6px;
      font-size: 11px;
    }

    .reason-indicator {
      width: 20px;
      height: 20px;
    }
  }
</style>
