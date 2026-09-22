<!-- src/lib/components/map/vehicles/BroadcastToast.svelte -->
<!-- Always-mounted owner of the broadcast toast. Shows the live countdown
     toast with a Stop action whenever the user is broadcasting — including
     after a refresh, when the broadcast state is restored from the server.
     Also auto-stops the broadcast once the 5 minute window expires. -->
<script>
  import { onDestroy } from "svelte"
  import { get } from "svelte/store"
  import { toast } from "svelte-sonner"
  import { userVehicleStore } from "$lib/stores/vehicleStore"

  const BROADCAST_DURATION_MS = 5 * 60 * 1000 // 5 minutes
  const TOAST_ID = "broadcast-toast"

  // Friendly labels for legacy id values sent by older builds.
  const LEGACY_LABELS = { full: "Full", empty: "Empty", help: "Help" }

  let activeStart = null
  let toastActive = false
  let tickIntervalId = null
  let autoStopTimeoutId = null

  function broadcastLabel(reason) {
    if (!reason) return "Broadcast"
    return LEGACY_LABELS[String(reason).toLowerCase()] || String(reason)
  }

  function remainingSeconds() {
    const store = get(userVehicleStore)
    if (!store.flash_started_at) return 0
    const elapsed = Date.now() - new Date(store.flash_started_at).getTime()
    return Math.max(0, Math.ceil((BROADCAST_DURATION_MS - elapsed) / 1000))
  }

  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  function clearTimers() {
    toastActive = false
    if (tickIntervalId) {
      clearInterval(tickIntervalId)
      tickIntervalId = null
    }
    if (autoStopTimeoutId) {
      clearTimeout(autoStopTimeoutId)
      autoStopTimeoutId = null
    }
    toast.dismiss(TOAST_ID)
  }

  function stopBroadcast(autoStopped = false) {
    clearTimers()
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

  function startToast() {
    clearTimers()
    toastActive = true

    const update = () => {
      if (!toastActive) return
      const store = get(userVehicleStore)
      const label = broadcastLabel(store.flash_reason)
      const color = store.flash_color || "#f59e0b"
      toast.info(`Broadcasting: ${label}`, {
        id: TOAST_ID,
        description: `Time remaining: ${formatTime(remainingSeconds())}`,
        duration: Infinity,
        style: `border-left: 4px solid ${color};`,
        action: {
          label: "Stop",
          onClick: () => stopBroadcast(false),
        },
      })
    }

    update()
    tickIntervalId = setInterval(update, 1000)
  }

  function scheduleAutoStop() {
    const store = get(userVehicleStore)
    if (!store.flash_started_at) return
    const elapsed = Date.now() - new Date(store.flash_started_at).getTime()
    const remaining = Math.max(0, BROADCAST_DURATION_MS - elapsed)
    if (autoStopTimeoutId) clearTimeout(autoStopTimeoutId)
    autoStopTimeoutId = setTimeout(() => stopBroadcast(true), remaining)
  }

  // Resync whenever the broadcast state (re)appears — a fresh start from the
  // broadcast panel, or restored from the server after a refresh. GPS updates
  // bump the store constantly, so only re-arm when the start time changes.
  $: if ($userVehicleStore.is_flashing && $userVehicleStore.flash_started_at) {
    const start = $userVehicleStore.flash_started_at
    if (start !== activeStart) {
      activeStart = start
      startToast()
      scheduleAutoStop()
    }
  } else if (activeStart !== null) {
    // Broadcast stopped from any source (panel, toast action, silenced by a
    // teammate, or expired) — tear the toast down.
    activeStart = null
    clearTimers()
  }

  onDestroy(() => {
    clearTimers()
  })
</script>
