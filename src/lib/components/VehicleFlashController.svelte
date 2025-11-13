<!-- src/lib/components/VehicleFlashController.svelte -->
<script>
  import { createEventDispatcher } from "svelte"
  import { userVehicleStore } from "../../stores/vehicleStore"
  import { toast } from "svelte-sonner"
  import { onMount, onDestroy } from "svelte"

  const dispatch = createEventDispatcher()

  const FLASH_DURATION_MS = 5 * 60 * 1000 // 5 minutes

  let timeoutId = null
  let selectedReason = "full"

  $: isFlashing = $userVehicleStore.is_flashing
  $: flashReason = $userVehicleStore.flash_reason

  const flashReasons = [
    { id: "full", label: "Full", color: "#f59e0b", emoji: "🟠" },
    { id: "empty", label: "Empty", color: "#8b5cf6", emoji: "🟣" },
    { id: "help", label: "Help", color: "#ef4444", emoji: "🔴" },
  ]

  async function startFlashing() {
    const now = new Date().toISOString()

    userVehicleStore.update((vehicle) => ({
      ...vehicle,
      is_flashing: true,
      flash_started_at: now,
      flash_reason: selectedReason,
    }))

    // Auto-stop after 5 minutes
    if (timeoutId) clearTimeout(timeoutId)
    timeoutId = setTimeout(() => {
      stopFlashing(true)
    }, FLASH_DURATION_MS)

    const reasonData = flashReasons.find((r) => r.id === selectedReason)
    const reasonText = reasonData ? reasonData.label : "Unknown"

    // Close the toolbox after starting flash
    dispatch("closeToolbox")
  }

  async function stopFlashing(autoStopped = false) {
    userVehicleStore.update((vehicle) => ({
      ...vehicle,
      is_flashing: false,
      flash_started_at: null,
      flash_reason: null,
    }))

    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
    }

    if (autoStopped) {
      toast.info("Flash Auto-Stopped", {
        description: "5 minute flash period ended",
      })
    }
  }

  // Check for expired flash on mount
  onMount(() => {
    if ($userVehicleStore.is_flashing && $userVehicleStore.flash_started_at) {
      const startTime = new Date($userVehicleStore.flash_started_at).getTime()
      const elapsed = Date.now() - startTime

      if (elapsed >= FLASH_DURATION_MS) {
        // Flash has expired
        stopFlashing(true)
      } else {
        // Resume countdown
        const remaining = FLASH_DURATION_MS - elapsed

        timeoutId = setTimeout(() => {
          stopFlashing(true)
        }, remaining)
      }
    }
  })

  onDestroy(() => {
    if (timeoutId) clearTimeout(timeoutId)
  })
</script>

<div class="flash-controller">
  {#if isFlashing}
    <div class="currently-flashing">
      <div class="flash-status">
        <div
          class="status-indicator"
          style="background-color: {flashReasons.find(
            (r) => r.id === flashReason,
          )?.color || '#f59e0b'}"
        ></div>
        <span class="status-text"
          >Currently Flashing: {(flashReason || "full").toUpperCase()}</span
        >
      </div>

      <button class="stop-button" on:click={() => stopFlashing()}>
        Stop Flashing
      </button>
    </div>
  {:else}
    <div class="flash-options">
      <div class="option-label">Select Signal:</div>

      <div class="reason-grid">
        {#each flashReasons as reason}
          <button
            class="reason-option"
            class:selected={selectedReason === reason.id}
            style="--reason-color: {reason.color}"
            on:click={() => (selectedReason = reason.id)}
          >
            <div class="reason-indicator"></div>
            <span>{reason.label}</span>
          </button>
        {/each}
      </div>

      <button class="start-button" on:click={startFlashing}>
        Start Flashing
      </button>
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
    animation: pulse 1s ease-in-out infinite;
  }

  @keyframes pulse {
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
    grid-template-columns: repeat(3, 1fr);
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
