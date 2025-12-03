<!-- src/lib/components/FlashingToast.svelte -->
<script>
  import { onMount, onDestroy } from "svelte"
  import { Zap } from "lucide-svelte"

  export let flashReason = "full"
  export let flashStartedAt = null
  export let onStop = () => {}
  export let toastId = null

  const FLASH_DURATION_MS = 5 * 60 * 1000 // 5 minutes

  let remainingSeconds = 300 // 5 minutes in seconds
  let intervalId = null

  const flashReasons = {
    full: { label: "Full", color: "#f59e0b" },
    empty: { label: "Empty", color: "#8b5cf6" },
    help: { label: "Help", color: "#ef4444" },
  }

  $: reasonData = flashReasons[flashReason] || flashReasons.full

  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  function updateRemaining() {
    if (!flashStartedAt) return

    const startTime = new Date(flashStartedAt).getTime()
    const elapsed = Date.now() - startTime
    const remaining = Math.max(0, FLASH_DURATION_MS - elapsed)
    remainingSeconds = Math.ceil(remaining / 1000)

    if (remainingSeconds <= 0) {
      clearInterval(intervalId)
    }
  }

  onMount(() => {
    updateRemaining()
    intervalId = setInterval(updateRemaining, 1000)
  })

  onDestroy(() => {
    if (intervalId) clearInterval(intervalId)
  })
</script>

<div class="flash-toast">
  <div class="toast-content">
    <div class="toast-icon" style="color: {reasonData.color}">
      <Zap size={20} />
    </div>
    <div class="toast-info">
      <div class="toast-title">
        Flashing: {reasonData.label}
      </div>
      <div class="toast-timer">
        Time remaining: {formatTime(remainingSeconds)}
      </div>
    </div>
  </div>
  <button class="stop-btn" on:click={onStop}> Stop </button>
</div>

<style>
  .flash-toast {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
  }

  .toast-content {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .toast-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    animation: pulse 1s ease-in-out infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  .toast-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .toast-title {
    font-size: 14px;
    font-weight: 600;
    color: #1f2937;
  }

  .toast-timer {
    font-size: 13px;
    color: #6b7280;
    font-variant-numeric: tabular-nums;
  }

  .stop-btn {
    padding: 6px 12px;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 6px;
    color: #ef4444;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
  }

  .stop-btn:hover {
    background: rgba(239, 68, 68, 0.2);
    border-color: rgba(239, 68, 68, 0.5);
  }
</style>
