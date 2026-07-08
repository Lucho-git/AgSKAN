<script lang="ts">
  import { onMount } from "svelte"
  import Icon from "@iconify/svelte"
  import { toast } from "svelte-sonner"
  import {
    adminApi,
    type AdminMapEntry,
    type AdminMapActivity,
    type MapDailyRow,
  } from "$lib/api/adminApi"
  import { userSettingsStore } from "$lib/stores/userSettingsStore"
  import { mapSettingsApi } from "$lib/api/mapSettingsApi"
  import { adminUserSettingsApi, type UserSettingsRow } from "$lib/api/adminUserSettingsApi"
  import { goto } from "$app/navigation"
  import SendSmsModal from "$lib/components/admin/SendSmsModal.svelte"

  // Imagery sources (mirrors SatelliteControls.svelte)
  const IMAGERY_SOURCES: Record<string, { name: string; canBeDefault?: boolean }> = {
    mapbox:            { name: "Mapbox Satellite", canBeDefault: true },
    google_satellite:  { name: "Google Satellite", canBeDefault: true },
    bing_aerial:       { name: "Microsoft Bing Aerial", canBeDefault: true },
    esri_standard:     { name: "Esri World Imagery", canBeDefault: true },
    ndvi:              { name: "NDVI Vegetation Index" },
  }

  // Default settings values (mirrors userSettingsStore defaults + DB defaults)
  const SETTING_DEFAULTS: Record<string, any> = {
    devToolsEnabled: false,
    autoConfirmMarkers: false,
    zoomToLocationMarkers: false,
    zoomToPlacedMarkers: true,
    enableFull1Hz: false,
    showGpsPopups: false,
    showGpsAcceptedPopups: false,
    showGpsRejectedPopups: false,
    satelliteDropdownEnabled: true,
    defaultImagerySource: "mapbox",
    gpsIntervalSeconds: 2,
    defaultMarker: { id: "default", name: "Default Marker", class: "default" },
    extraMarkers: [],
    layerVisibility: {},
    sprayConfirmEnabled: true,
  }

  let loading = false
  let entries: AdminMapEntry[] = []
  let activityMap: Map<string, AdminMapActivity> = new Map()
  let errorMessage = ""
  let expandedMapId: string | null = null
  let heatmapMapId: string | null = null
  let searchQuery = ""
  let filterStatus: "all" | "exceeding" | "at_limit" | "ok" = "all"
  let filterPlan: "all" | "paid" | "free" = "all"
  let sortBy: "default" | "latest" = "latest"
  let lastRefreshed: Date | null = null

  // Heatmap state
  let heatmapData: MapDailyRow[] = []
  let heatmapLoading = false
  let heatmapProfiles: string[] = []
  let heatmapProfileIndex = -1 // -1 = all, 0+ = specific profile
  let heatmapCalendarCells: { date: string; dayOfWeek: number }[] = []
  let heatmapMonthLabels: { label: string; col: number }[] = []

  $: heatmapActiveProfile =
    heatmapProfileIndex < 0
      ? "all"
      : (heatmapProfiles[heatmapProfileIndex] ?? "all")

  // Member management state
  let editingMember: { mapId: string; memberId: string } | null = null
  let editingName = ""
  let savingMemberName = false

  // SMS state
  let smsModalShow = false
  let smsPhone = ""
  let smsOwnerName = ""

  // Limits modal state
  let showLimitsModal = false
  let limitsMap: Map<string, boolean> = new Map()
  let togglingMapId: string | null = null
  let limitsDialogEl: HTMLDialogElement

  $: if (showLimitsModal && limitsDialogEl && !limitsDialogEl.open) {
    limitsDialogEl.showModal()
  } else if (!showLimitsModal && limitsDialogEl?.open) {
    limitsDialogEl.close()
  }

  async function openLimitsModal() {
    if (entries.length === 0) return
    const ids = entries.map((e) => e.master_map_id)
    limitsMap = await mapSettingsApi.getBulkEnforceLimits(ids)
    showLimitsModal = true
  }

  async function toggleMapLimits(mapId: string, enabled: boolean) {
    togglingMapId = mapId
    const result = await mapSettingsApi.setEnforceLimits(mapId, enabled)
    if (result.success) {
      limitsMap.set(mapId, enabled)
      limitsMap = limitsMap // trigger reactivity
      toast.success(enabled ? "Limits enabled" : "Limits disabled")
    } else {
      toast.error(result.error || "Failed to update")
    }
    togglingMapId = null
  }

  // User settings modal state
  let showUserSettingsModal = false
  let settingsTargetUser: { id: string; name: string } | null = null
  let settingsData: UserSettingsRow | null = null
  let settingsLoading = false
  let settingsSaving: string | null = null // field being saved
  let userSettingsDialogEl: HTMLDialogElement

  $: if (showUserSettingsModal && userSettingsDialogEl && !userSettingsDialogEl.open) {
    userSettingsDialogEl.showModal()
  } else if (!showUserSettingsModal && userSettingsDialogEl?.open) {
    userSettingsDialogEl.close()
  }

  async function openUserSettingsModal(member: { id: string; full_name: string | null }) {
    settingsTargetUser = { id: member.id, name: member.full_name || "Unknown" }
    settingsLoading = true
    showUserSettingsModal = true
    const result = await adminUserSettingsApi.getUserSettings(member.id)
    settingsData = result.success ? (result.data ?? null) : null
    settingsLoading = false
  }

  async function toggleUserSetting(field: string, value: any) {
    if (!settingsTargetUser) return
    settingsSaving = field
    const result = await adminUserSettingsApi.setUserSetting(settingsTargetUser.id, field, value)
    if (result.success) {
      // Update local state optimistically
      settingsData = { ...(settingsData || {}), [field]: value } as UserSettingsRow
      toast.success("Setting updated")
    } else {
      toast.error(result.error || "Failed to update setting")
    }
    settingsSaving = null
  }

  async function resetUserSettings() {
    if (!settingsTargetUser) return
    if (!confirm(`Reset ALL settings for ${settingsTargetUser.name} to defaults?`)) return
    settingsSaving = "__reset__"
    const result = await adminUserSettingsApi.resetUserSettings(settingsTargetUser.id)
    if (result.success) {
      settingsData = null
      toast.success("Settings reset to defaults")
    } else {
      toast.error(result.error || "Failed to reset settings")
    }
    settingsSaving = null
  }

  function openSmsModal(phone: string, name: string) {
    smsPhone = phone
    smsOwnerName = name
    smsModalShow = true
  }

  function getSettingVal(col: string, def: any): any {
    return (settingsData as any)?.[col] ?? def
  }

  // Reactive snapshot so Svelte can track individual property reads in templates
  $: s = (settingsData as Record<string, any>) ?? {}

  function isDefault(col: string): boolean {
    const val = getSettingVal(col, SETTING_DEFAULTS[col])
    const def = SETTING_DEFAULTS[col]
    return JSON.stringify(val) === JSON.stringify(def)
  }

  function diffDot(col: string): string {
    return isDefault(col) ? "" : "● "
  }

  $: diffFields = settingsData
    ? Object.keys(SETTING_DEFAULTS).filter((k) => !isDefault(k))
    : []

  $: diffCount = diffFields.length

  $: diffTooltip = diffFields.length
    ? "Different: " + diffFields.join(", ")
    : "All settings at defaults"

  // Simple boolean toggle fields (miscellaneous)
  const MISC_BOOL_FIELDS = [
    { col: "devToolsEnabled",         label: "Dev tools" },
    { col: "satelliteDropdownEnabled",label: "Satellite dropdown" },
    { col: "sprayConfirmEnabled",     label: "Spray confirm popup" },
  ]

  // Marker-related settings
  const MARKER_BOOL_FIELDS = [
    { col: "zoomToLocationMarkers",   label: "Zoom to location markers" },
    { col: "zoomToPlacedMarkers",     label: "Zoom to placed markers" },
    { col: "autoConfirmMarkers",      label: "Auto-confirm markers" },
  ]

  // GPS-related settings
  const GPS_BOOL_FIELDS = [
    { col: "enableFull1Hz",           label: "Full 1Hz GPS" },
    { col: "showGpsPopups",           label: "GPS popups (legacy)" },
    { col: "showGpsAcceptedPopups",   label: "GPS accepted popups" },
    { col: "showGpsRejectedPopups",   label: "GPS rejected popups" },
  ]

  function autofocus(node: HTMLInputElement) {
    node.focus()
    node.select()
  }

  async function startEditMember(
    mapId: string,
    member: { id: string; full_name: string | null },
  ) {
    editingMember = { mapId, memberId: member.id }
    editingName = member.full_name || ""
  }

  function cancelEditMember() {
    editingMember = null
    editingName = ""
  }

  async function saveMemberName() {
    if (!editingMember || !editingName.trim()) return
    savingMemberName = true
    const result = await adminApi.updateMemberName(
      editingMember.memberId,
      editingName.trim(),
    )
    if (result.success) {
      entries = entries.map((e) =>
        e.master_map_id === editingMember!.mapId
          ? {
              ...e,
              members: e.members.map((m) =>
                m.id === editingMember!.memberId
                  ? { ...m, full_name: editingName.trim() }
                  : m,
              ),
            }
          : e,
      )
      toast.success("Name updated")
    } else {
      toast.error(result.error || "Failed to update name")
    }
    editingMember = null
    editingName = ""
    savingMemberName = false
  }

  async function handleTransferOwnership(
    mapId: string,
    memberId: string,
    memberName: string,
  ) {
    if (
      !confirm(
        `Transfer ownership of this map to "${memberName}"? This cannot be undone from the dashboard.`,
      )
    )
      return
    const result = await adminApi.transferOwnership(mapId, memberId)
    if (result.success) {
      toast.success(`Ownership transferred to ${memberName}`)
      loadData()
    } else {
      toast.error(result.error || "Failed to transfer ownership")
    }
  }

  // Guard: redirect if not dev mode
  $: if (!$userSettingsStore.devToolsEnabled) {
    goto("/account")
  }

  const ACTIVITY_BUCKETS: { value: string; label: string; ms: number }[] = [
    { value: "5m", label: "Last 5 min", ms: 5 * 60 * 1000 },
    { value: "1h", label: "Last hour", ms: 60 * 60 * 1000 },
    { value: "1d", label: "Last day", ms: 24 * 60 * 60 * 1000 },
    { value: "3d", label: "Last 3 days", ms: 3 * 24 * 60 * 60 * 1000 },
    { value: "7d", label: "Last week", ms: 7 * 24 * 60 * 60 * 1000 },
    { value: "30d", label: "Last month", ms: 30 * 24 * 60 * 60 * 1000 },
    { value: "90d", label: "Last 3 months", ms: 90 * 24 * 60 * 60 * 1000 },
    { value: "180d", label: "Last 6 months", ms: 180 * 24 * 60 * 60 * 1000 },
    { value: "365d", label: "Last year", ms: 365 * 24 * 60 * 60 * 1000 },
  ]

  function getActivityAgeMs(e: AdminMapEntry): number {
    const ts = new Date(e.latest_vehicle_update || 0).getTime()
    return ts > 0 ? Date.now() - ts : Infinity
  }

  // Filtered & searched entries
  $: filteredEntries = entries
    .filter((e) => {
      if (filterStatus === "exceeding") return e.seat_status === "EXCEEDING"
      if (filterStatus === "at_limit") return e.seat_status === "AT_LIMIT"
      if (filterStatus === "ok") return e.seat_status === "OK"
      return true
    })
    .filter((e) => {
      if (filterPlan === "free")
        return e.subscription === "FREE" || e.subscription_status === "free"
      if (filterPlan === "paid")
        return e.subscription !== "FREE" && e.subscription_status !== "free"
      return true
    })
    .filter((e) => {
      if (!searchQuery.trim()) return true
      const q = searchQuery.toLowerCase()
      const memberMatch = (e.members || []).some(
        (m) =>
          (m.full_name || "").toLowerCase().includes(q) ||
          (m.email || "").toLowerCase().includes(q),
      )
      return (
        memberMatch ||
        (e.owner_name || "").toLowerCase().includes(q) ||
        (e.owner_email || "").toLowerCase().includes(q) ||
        (e.company_name || "").toLowerCase().includes(q) ||
        (e.map_name || "").toLowerCase().includes(q)
      )
    })
    .sort((a, b) => {
      if (sortBy === "latest") {
        const aAge = getActivityAgeMs(a)
        const bAge = getActivityAgeMs(b)
        const aBucket = ACTIVITY_BUCKETS.findIndex((bkt) => aAge <= bkt.ms)
        const bBucket = ACTIVITY_BUCKETS.findIndex((bkt) => bAge <= bkt.ms)
        // Never-active (Infinity) goes to the end
        const aBucketIdx = aBucket === -1 ? ACTIVITY_BUCKETS.length : aBucket
        const bBucketIdx = bBucket === -1 ? ACTIVITY_BUCKETS.length : bBucket
        if (aBucketIdx !== bBucketIdx) return aBucketIdx - bBucketIdx
        // Within same bucket: exceeding first, then vehicles desc, then members desc
        if (a.seat_status !== b.seat_status) {
          return a.seat_status === "EXCEEDING" ? -1 : 1
        }
        if (a.connected_vehicles !== b.connected_vehicles) {
          return b.connected_vehicles - a.connected_vehicles
        }
        return b.total_members - a.total_members
      }
      // Default: exceeding first, vehicles desc, members desc
      if (a.seat_status !== b.seat_status) {
        return a.seat_status === "EXCEEDING" ? -1 : 1
      }
      if (a.connected_vehicles !== b.connected_vehicles) {
        return b.connected_vehicles - a.connected_vehicles
      }
      return b.total_members - a.total_members
    })

  // Stats
  $: totalMaps = entries.length
  $: totalUsers = entries.reduce((sum, e) => sum + e.total_members, 0)
  $: exceedingCount = entries.filter(
    (e) => e.seat_status === "EXCEEDING",
  ).length
  $: activeToday = entries.filter((e) => e.vehicles_active_24h > 0).length
  $: proCount = entries.filter(
    (e) => e.subscription !== "FREE" && e.subscription_status !== "free",
  ).length
  $: freeCount = entries.filter(
    (e) => e.subscription === "FREE" || e.subscription_status === "free",
  ).length
  $: paidSeats = entries
    .filter(
      (e) => e.subscription !== "FREE" && e.subscription_status !== "free",
    )
    .reduce((sum, e) => sum + e.allowed_seats, 0)
  $: headlessCount = entries.filter((e) => !e.owner_connected).length

  $: activeUsers30d = entries
    .map((e) => activityMap.get(e.master_map_id)?.active_profiles ?? 0)
    .reduce((a, b) => a + b, 0)

  function getActivityFor(mapId: string): AdminMapActivity | undefined {
    return activityMap.get(mapId)
  }

  async function loadData() {
    loading = true
    errorMessage = ""
    const result = await adminApi.fetchDashboardData()
    if (result.success) {
      entries = result.data
      lastRefreshed = new Date()
      // Fetch activity stats in parallel
      const activityResult = await adminApi.fetchActivityStats()
      if (activityResult.success) {
        activityMap = new Map(
          activityResult.data.map((a) => [a.master_map_id, a]),
        )
      }
    } else {
      errorMessage = result.error || "Failed to load data"
      toast.error(errorMessage)
    }
    loading = false
  }

  function toggleExpand(mapId: string) {
    if (expandedMapId === mapId) {
      expandedMapId = null
      return
    }
    expandedMapId = mapId
    loadHeatmap(mapId)
  }

  async function loadHeatmap(mapId: string) {
    if (heatmapMapId === mapId) return
    heatmapMapId = mapId
    heatmapLoading = true
    heatmapProfileIndex = -1
    heatmapCalendarCells = generateCalendarDays(30)
    heatmapMonthLabels = calendarMonthLabels(heatmapCalendarCells)
    const result = await adminApi.fetchDailyActivity(mapId)
    if (result.success) {
      heatmapData = result.data
      heatmapProfiles = [...new Set(result.data.map((r) => r.profile_id))]
    } else {
      heatmapData = []
      heatmapProfiles = []
    }
    heatmapLoading = false
  }

  function getProfileName(profileId: string, mapEntry: AdminMapEntry): string {
    const member = mapEntry.members?.find((m) => m.id === profileId)
    return member?.full_name || profileId.slice(0, 8)
  }

  function generateCalendarDays(
    daysBack: number,
  ): { date: string; dayOfWeek: number }[] {
    const cells: { date: string; dayOfWeek: number }[] = []
    const today = new Date()
    const start = new Date(today)
    start.setDate(start.getDate() - daysBack)
    while (start.getDay() !== 1) start.setDate(start.getDate() - 1)
    while (start <= today) {
      cells.push({
        date: start.toISOString().slice(0, 10),
        dayOfWeek: start.getDay() === 0 ? 6 : start.getDay() - 1,
      })
      start.setDate(start.getDate() + 1)
    }
    return cells
  }

  function calendarMonthLabels(
    cells: { date: string }[],
  ): { label: string; col: number }[] {
    const labels: { label: string; col: number }[] = []
    let lastMonth = ""
    cells.forEach((c, i) => {
      const m = c.date.slice(5, 7)
      if (m !== lastMonth) {
        const monthNames = [
          "Jan",
          "Feb",
          "Mar",
          "Apr",
          "May",
          "Jun",
          "Jul",
          "Aug",
          "Sep",
          "Oct",
          "Nov",
          "Dec",
        ]
        labels.push({
          label: monthNames[parseInt(m) - 1],
          col: Math.floor(i / 7),
        })
        lastMonth = m
      }
    })
    return labels
  }

  function getHeatmapColor(count: number): string {
    if (count === 0) return "bg-base-300"
    if (count <= 1) return "bg-green-400"
    if (count <= 3) return "bg-green-500"
    if (count <= 6) return "bg-green-600"
    return "bg-green-700"
  }

  function getDayActivity(date: string, profileId: string | "all"): number {
    if (profileId === "all") {
      return heatmapData
        .filter((r) => r.activity_date === date)
        .reduce((sum, r) => sum + r.profile_count, 0)
    }
    const row = heatmapData.find(
      (r) => r.activity_date === date && r.profile_id === profileId,
    )
    return row?.profile_count ?? 0
  }

  function timeAgo(dateStr: string | null): string {
    if (!dateStr) return "Never"
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 5) return "Just now"
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    if (days < 30) return `${days}d ago`
    const months = Math.floor(days / 30)
    return `${months}mo ago`
  }

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return "—"
    return new Date(dateStr).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    })
  }

  function seatStatusBadge(status: string): string {
    if (status === "EXCEEDING") return "badge-error"
    if (status === "AT_LIMIT") return "badge-warning"
    return "badge-success"
  }

  function seatStatusLabel(status: string): string {
    if (status === "EXCEEDING") return "Exceeding"
    if (status === "AT_LIMIT") return "At Limit"
    return "OK"
  }

  function subBadge(sub: string): string {
    if (sub === "FREE") return "badge-ghost"
    return "badge-primary"
  }

  // Load on mount
  onMount(() => {
    loadData()
  })

  function copyToClipboard(text: string) {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        toast.success("Copied to clipboard")
      })
      .catch(() => {
        toast.error("Failed to copy")
      })
  }
</script>

<svelte:head>
  <title>Admin Dashboard</title>
</svelte:head>

<!-- Header -->
<div
  class="flex items-center justify-between border-b border-base-300 bg-base-100 p-5"
>
  <h2
    class="flex items-center gap-2 text-xl font-semibold text-contrast-content"
  >
    <div class="rounded-lg bg-warning/20 p-1.5">
      <Icon
        icon="solar:shield-keyhole-bold-duotone"
        width="18"
        height="18"
        class="text-warning"
      />
    </div>
    Admin Dashboard
  </h2>
  <div class="flex items-center gap-2">
    <button
      class="btn btn-outline btn-sm gap-1"
      on:click={openLimitsModal}
      title="Manage limit warnings per map"
    >
      <Icon
        icon="solar:shield-warning-bold-duotone"
        width="16"
        height="16"
        class="text-warning"
      />
      Limits
    </button>
    <button
      class="btn btn-outline btn-sm gap-1"
      on:click={loadData}
      disabled={loading}
    >
      <Icon
        icon="solar:refresh-bold-duotone"
        width="16"
        height="16"
        class={loading ? "animate-spin" : ""}
      />
      Refresh
    </button>
  </div>
</div>

<div class="space-y-6 p-6">
  {#if loading && entries.length === 0}
    <!-- Loading skeleton -->
    <div class="flex items-center justify-center py-20">
      <div class="text-center">
        <span class="loading loading-spinner loading-lg text-warning"></span>
        <p class="mt-3 text-sm text-contrast-content/60">
          Loading admin data...
        </p>
      </div>
    </div>
  {:else if errorMessage && entries.length === 0}
    <!-- Error state -->
    <div class="rounded-lg border border-error/20 bg-error/5 p-8 text-center">
      <Icon
        icon="solar:danger-triangle-bold-duotone"
        width="40"
        height="40"
        class="mx-auto text-error"
      />
      <p class="mt-3 font-medium text-error">{errorMessage}</p>
      <button class="btn btn-outline btn-sm mt-4" on:click={loadData}>
        Try Again
      </button>
    </div>
  {:else}
    <!-- Summary Stats -->
    <div
      class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9"
    >
      <div class="rounded-lg border border-base-300 bg-base-200/30 p-3">
        <p class="text-xs text-contrast-content/60">Total Maps</p>
        <p class="text-2xl font-bold text-contrast-content">{totalMaps}</p>
      </div>
      <div class="rounded-lg border border-base-300 bg-base-200/30 p-3">
        <p class="text-xs text-contrast-content/60">Total Users</p>
        <p class="text-2xl font-bold text-contrast-content">{totalUsers}</p>
      </div>
      <div class="rounded-lg border border-base-300 bg-base-200/30 p-3">
        <p class="text-xs text-contrast-content/60">Active Today</p>
        <p class="text-2xl font-bold text-success">{activeToday}</p>
      </div>
      <div class="rounded-lg border border-base-300 bg-base-200/30 p-3">
        <p class="text-xs text-contrast-content/60">Exceeding</p>
        <p class="text-2xl font-bold text-error">{exceedingCount}</p>
      </div>
      <div class="rounded-lg border border-base-300 bg-base-200/30 p-3">
        <p class="text-xs text-contrast-content/60">Pro Plans</p>
        <p class="text-2xl font-bold text-primary">{proCount}</p>
      </div>
      <div class="rounded-lg border border-base-300 bg-base-200/30 p-3">
        <p class="text-xs text-contrast-content/60">Paid Seats</p>
        <p class="text-2xl font-bold text-primary">{paidSeats}</p>
      </div>
      <div class="rounded-lg border border-base-300 bg-base-200/30 p-3">
        <p class="text-xs text-contrast-content/60">Free Plans</p>
        <p class="text-2xl font-bold text-contrast-content/60">{freeCount}</p>
      </div>
      <div class="rounded-lg border border-base-300 bg-base-200/30 p-3">
        <p class="text-xs text-contrast-content/60">Headless</p>
        <p class="text-2xl font-bold text-info">{headlessCount}</p>
      </div>
      <div class="rounded-lg border border-base-300 bg-base-200/30 p-3">
        <p class="text-xs text-contrast-content/60">Active Users 30d</p>
        <p class="text-2xl font-bold text-accent">{activeUsers30d}</p>
      </div>
    </div>

    <!-- Search & Filter Bar -->
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div class="relative flex-1">
        <Icon
          icon="solar:magnifer-bold-duotone"
          width="16"
          height="16"
          class="absolute left-3 top-1/2 -translate-y-1/2 text-contrast-content/40"
        />
        <input
          type="text"
          placeholder="Search by name, email, map, or member..."
          class="input input-sm input-bordered w-full pl-9"
          bind:value={searchQuery}
        />
      </div>
      <div class="flex items-center gap-2">
        <!-- Plan filter -->
        <div class="flex gap-0.5 rounded-lg bg-base-200/50 p-0.5">
          <button
            class="btn btn-xs {filterPlan === 'all'
              ? 'btn-neutral'
              : 'btn-ghost'}"
            on:click={() => (filterPlan = "all")}>All</button
          >
          <button
            class="btn btn-xs {filterPlan === 'paid'
              ? 'btn-neutral'
              : 'btn-ghost'}"
            on:click={() => (filterPlan = "paid")}>Paid</button
          >
          <button
            class="btn btn-xs {filterPlan === 'free'
              ? 'btn-neutral'
              : 'btn-ghost'}"
            on:click={() => (filterPlan = "free")}>Free</button
          >
        </div>
        <div class="h-4 w-px bg-base-300"></div>
        <!-- Status filter -->
        <div class="flex gap-1">
          <button
            class="btn btn-xs {filterStatus === 'all'
              ? 'btn-neutral'
              : 'btn-ghost'}"
            on:click={() => (filterStatus = "all")}
          >
            All
          </button>
          <button
            class="btn btn-xs {filterStatus === 'exceeding'
              ? 'btn-error'
              : 'btn-ghost'}"
            on:click={() => (filterStatus = "exceeding")}
          >
            Exceeding
          </button>
          <button
            class="btn btn-xs {filterStatus === 'at_limit'
              ? 'btn-warning'
              : 'btn-ghost'}"
            on:click={() => (filterStatus = "at_limit")}
          >
            At Limit
          </button>
          <button
            class="btn btn-xs {filterStatus === 'ok'
              ? 'btn-success'
              : 'btn-ghost'}"
            on:click={() => (filterStatus = "ok")}
          >
            OK
          </button>
        </div>
        <div class="h-4 w-px bg-base-300"></div>
        <!-- Sort -->
        <select
          bind:value={sortBy}
          class="select select-bordered select-xs w-28"
        >
          <option value="default">Default</option>
          <option value="latest">Latest Activity</option>
        </select>
      </div>
    </div>
    <div
      class="flex items-center justify-between text-xs text-contrast-content/50"
    >
      <span>{filteredEntries.length} of {totalMaps} maps</span>
      {#if lastRefreshed}
        <span>Last refreshed: {lastRefreshed.toLocaleTimeString()}</span>
      {/if}
    </div>

    <!-- Table -->
    <div class="overflow-x-auto rounded-lg border border-base-300">
      <table class="table w-full text-xs">
        <thead>
          <tr
            class="border-b-2 border-base-300 bg-base-200/60 text-contrast-content/60"
          >
            <th class="w-8 border-r border-base-300"></th>
            <th class="border-r border-base-300">Owner</th>
            <th class="border-r border-base-300">Map</th>
            <th class="border-r border-base-300">Plan</th>
            <th class="border-r border-base-300 text-center">Users</th>
            <th class="border-r border-base-300 text-center">Active 24h</th>
            <th class="border-r border-base-300">Last GPS</th>
            <th class="border-r border-base-300">Last Sign-In</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {#each filteredEntries as entry, i (entry.master_map_id)}
            <tr
              class="cursor-pointer border-b border-base-300 transition-colors hover:bg-base-content/5
                {entry.seat_status === 'EXCEEDING' ? 'bg-error/5' : ''}
                {entry.seat_status === 'AT_LIMIT' ? 'bg-warning/5' : ''}"
              on:click={() => toggleExpand(entry.master_map_id)}
            >
              <td class="w-8 border-r border-base-300">
                <Icon
                  icon={expandedMapId === entry.master_map_id
                    ? "solar:alt-arrow-down-bold"
                    : "solar:alt-arrow-right-bold"}
                  width="12"
                  height="12"
                  class="text-contrast-content/40"
                />
              </td>
              <td class="border-r border-base-300">
                <div class="font-medium text-contrast-content">
                  {entry.owner_name || "Unknown"}
                </div>
                <div class="text-contrast-content/50">
                  {entry.owner_email || "—"}
                </div>
                {#if entry.owner_phone}
                  <div class="flex items-center gap-1 text-contrast-content/40">
                    {entry.owner_phone}
                    <button
                      type="button"
                      class="btn btn-ghost btn-xs text-primary hover:bg-primary/10"
                      title="Send SMS"
                      on:click|stopPropagation={() =>
                        openSmsModal(
                          entry.owner_phone || "",
                          entry.owner_name || "",
                        )}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-3.5 w-3.5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        ><path
                          d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
                        /></svg
                      >
                    </button>
                  </div>
                {/if}
              </td>
              <td class="border-r border-base-300">
                <div class="text-contrast-content">
                  {entry.map_name || "Unnamed"}
                </div>
                {#if entry.company_name}
                  <div class="text-contrast-content/50">
                    {entry.company_name}
                  </div>
                {/if}
              </td>
              <td class="border-r border-base-300">
                <span class="badge badge-xs {subBadge(entry.subscription)}">
                  {entry.subscription}
                </span>
                {#if entry.founder}
                  <span class="badge badge-secondary badge-xs ml-0.5">F</span>
                {/if}
                {#if !entry.owner_connected}
                  <span class="badge badge-info badge-xs ml-0.5">Headless</span>
                {/if}
              </td>
              <td class="border-r border-base-300 text-center">
                <span
                  class="font-semibold"
                  class:text-error={entry.seat_status === "EXCEEDING"}
                  class:text-warning={entry.seat_status === "AT_LIMIT"}
                >
                  {entry.connected_vehicles}/{entry.allowed_seats}
                </span>
              </td>
              <td class="border-r border-base-300 text-center">
                <span class="text-contrast-content/70">
                  {entry.vehicles_active_24h}
                </span>
              </td>
              <td class="border-r border-base-300">
                <span class="text-contrast-content/70">
                  {timeAgo(entry.latest_vehicle_update)}
                </span>
              </td>
              <td class="border-r border-base-300">
                <span class="text-contrast-content/70">
                  {timeAgo(entry.latest_member_sign_in)}
                </span>
              </td>
              <td>
                <span
                  class="badge badge-xs {seatStatusBadge(entry.seat_status)}"
                >
                  {seatStatusLabel(entry.seat_status)}
                </span>
              </td>
            </tr>

            <!-- Expanded detail row -->
            {#if expandedMapId === entry.master_map_id}
              <tr>
                <td colspan="9" class="bg-base-200/10 p-0">
                  <div class="px-4 pb-4 pt-3">
                    <!-- Map ID row -->
                    <div
                      class="mb-3 flex items-center gap-2 rounded bg-base-200/40 px-3 py-1.5"
                    >
                      <span class="text-xs font-medium text-contrast-content/50"
                        >Map ID:</span
                      >
                      <code
                        class="flex-1 select-all truncate font-mono text-xs text-contrast-content/70"
                      >
                        {entry.master_map_id}
                      </code>
                      <button
                        class="btn btn-ghost btn-xs"
                        on:click|stopPropagation={() =>
                          copyToClipboard(entry.master_map_id)}
                        title="Copy Map ID"
                      >
                        <Icon
                          icon="solar:copy-bold-duotone"
                          width="14"
                          height="14"
                        />
                      </button>
                    </div>

                    <!-- Detail grid -->
                    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      <!-- Owner Card -->
                      <div class="rounded-lg bg-base-200/30 p-3">
                        <h4
                          class="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-contrast-content/50"
                        >
                          <Icon
                            icon="solar:user-bold-duotone"
                            width="12"
                            height="12"
                          />
                          Owner
                        </h4>
                        <p class="text-sm font-medium text-contrast-content">
                          {entry.owner_name || "—"}
                        </p>
                        <p class="text-xs text-contrast-content/60">
                          {entry.owner_email || "—"}
                        </p>
                        {#if entry.owner_phone}
                          <p class="text-xs text-contrast-content/50">
                            {entry.owner_phone}
                          </p>
                        {/if}
                        {#if entry.company_name}
                          <p class="text-xs text-contrast-content/50">
                            {entry.company_name}
                          </p>
                        {/if}
                        <div
                          class="mt-2 space-y-0.5 text-xs text-contrast-content/50"
                        >
                          <p>
                            Last sign-in: {timeAgo(entry.owner_last_sign_in)}
                          </p>
                          <p>Joined: {formatDate(entry.owner_created_at)}</p>
                        </div>
                      </div>

                      <!-- Map & Subscription Card -->
                      <div class="rounded-lg bg-base-200/30 p-3">
                        <h4
                          class="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-contrast-content/50"
                        >
                          <Icon
                            icon="solar:map-bold-duotone"
                            width="12"
                            height="12"
                          />
                          Map & Plan
                        </h4>
                        <p class="text-sm font-medium text-contrast-content">
                          {entry.map_name || "Unnamed"}
                        </p>
                        <p class="text-xs text-contrast-content/50">
                          Created: {formatDate(entry.map_created_at)}
                        </p>
                        <div class="mt-2 flex flex-wrap items-center gap-1">
                          <span
                            class="badge badge-sm {subBadge(
                              entry.subscription,
                            )}">{entry.subscription}</span
                          >
                          <span class="badge badge-outline badge-sm"
                            >{entry.subscription_status}</span
                          >
                          {#if entry.payment_interval}
                            <span class="badge badge-ghost badge-sm"
                              >{entry.payment_interval}</span
                            >
                          {/if}
                          {#if entry.founder}
                            <span class="badge badge-secondary badge-sm"
                              >Founder</span
                            >
                          {/if}
                        </div>
                        {#if entry.next_billing_date}
                          <p class="mt-1 text-xs text-contrast-content/50">
                            Next billing: {formatDate(entry.next_billing_date)}
                          </p>
                        {/if}
                      </div>

                      <!-- Activity Card -->
                      <div class="rounded-lg bg-base-200/30 p-3">
                        <h4
                          class="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-contrast-content/50"
                        >
                          <Icon
                            icon="solar:chart-bold-duotone"
                            width="12"
                            height="12"
                          />
                          Activity
                        </h4>
                        <div class="flex flex-col gap-3 lg:flex-row">
                          <!-- Stats -->
                          <div
                            class="min-w-0 space-y-0.5 text-xs lg:w-52 lg:flex-shrink-0"
                          >
                            <div class="flex justify-between gap-2">
                              <span class="text-contrast-content/60"
                                >Vehicles 24h</span
                              >
                              <span class="font-medium text-contrast-content"
                                >{entry.vehicles_active_24h}</span
                              >
                            </div>
                            <div class="flex justify-between gap-2">
                              <span class="text-contrast-content/60"
                                >Vehicles 7d</span
                              >
                              <span class="font-medium text-contrast-content"
                                >{entry.vehicles_active_7d}</span
                              >
                            </div>
                            <div class="flex justify-between gap-2">
                              <span class="text-contrast-content/60"
                                >Vehicles 30d</span
                              >
                              <span class="font-medium text-contrast-content"
                                >{entry.vehicles_active_30d}</span
                              >
                            </div>
                            <div class="flex justify-between gap-2">
                              <span class="text-contrast-content/60"
                                >Members 7d</span
                              >
                              <span class="font-medium text-contrast-content"
                                >{entry.members_active_7d}</span
                              >
                            </div>
                            <div class="flex justify-between gap-2">
                              <span class="text-contrast-content/60"
                                >Members 30d</span
                              >
                              <span class="font-medium text-contrast-content"
                                >{entry.members_active_30d}</span
                              >
                            </div>
                            <div class="flex justify-between gap-2">
                              <span class="text-contrast-content/60"
                                >Active profiles</span
                              >
                              <span class="font-medium text-accent"
                                >{getActivityFor(entry.master_map_id)
                                  ?.active_profiles ?? 0}</span
                              >
                            </div>
                            <div class="flex justify-between gap-2">
                              <span class="text-contrast-content/60"
                                >Active days</span
                              >
                              <span class="font-medium text-accent"
                                >{getActivityFor(entry.master_map_id)
                                  ?.active_days ?? 0}</span
                              >
                            </div>
                          </div>

                          <!-- Divider + Heatmap -->
                          <div
                            class="hidden border-l border-base-300 lg:block"
                          ></div>
                          <div
                            class="min-w-0 flex-1 border-t border-base-300 pt-3 lg:border-t-0 lg:pt-0"
                          >
                            {#if heatmapLoading && heatmapMapId === entry.master_map_id}
                              <div
                                class="flex items-center justify-center py-4"
                              >
                                <span class="loading loading-spinner loading-sm"
                                ></span>
                              </div>
                            {:else}
                              {#if heatmapProfiles.length > 1 && heatmapMapId === entry.master_map_id}
                                <div
                                  class="mb-2 flex items-center justify-center gap-1"
                                >
                                  <button
                                    type="button"
                                    class="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-contrast-content/40 hover:bg-base-300 hover:text-contrast-content disabled:opacity-20"
                                    disabled={heatmapProfileIndex <= -1}
                                    on:click={() =>
                                      (heatmapProfileIndex =
                                        heatmapProfileIndex - 1)}
                                  >
                                    <Icon
                                      icon="solar:alt-arrow-left-bold-duotone"
                                      width="12"
                                      height="12"
                                    />
                                  </button>
                                  <select
                                    bind:value={heatmapProfileIndex}
                                    class="w-36 rounded border border-base-300 bg-base-100 px-2 py-0.5 text-center text-xs text-contrast-content"
                                  >
                                    <option value={-1}>All profiles</option>
                                    {#each heatmapProfiles as pid, i}
                                      <option value={i}
                                        >{getProfileName(pid, entry)}</option
                                      >
                                    {/each}
                                  </select>
                                  <button
                                    type="button"
                                    class="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-contrast-content/40 hover:bg-base-300 hover:text-contrast-content disabled:opacity-20"
                                    disabled={heatmapProfileIndex >=
                                      heatmapProfiles.length - 1}
                                    on:click={() =>
                                      (heatmapProfileIndex =
                                        heatmapProfileIndex + 1)}
                                  >
                                    <Icon
                                      icon="solar:alt-arrow-right-bold-duotone"
                                      width="12"
                                      height="12"
                                    />
                                  </button>
                                </div>
                              {/if}

                              {#if heatmapCalendarCells.length > 0}
                                <div>
                                  <div
                                    class="mb-1 ml-6 flex text-[9px] text-contrast-content/40"
                                  >
                                    {#each heatmapMonthLabels as ml}
                                      <span class="block">{ml.label}</span>
                                    {/each}
                                  </div>
                                  <div class="flex">
                                    <div
                                      class="mr-1 flex flex-col"
                                      style="gap: 3px"
                                    >
                                      {#each ["M", "", "W", "", "F", "", ""] as lbl}
                                        <span
                                          class="flex h-3 w-5 items-center text-[9px] text-contrast-content/40"
                                          >{lbl}</span
                                        >
                                      {/each}
                                    </div>
                                    <div
                                      class="grid"
                                      style="gap: 3px; grid-template-columns: repeat({Math.ceil(
                                        heatmapCalendarCells.length / 7,
                                      )}, 12px); grid-template-rows: repeat(7, 12px); grid-auto-flow: column;"
                                    >
                                      {#each heatmapCalendarCells as cell}
                                        <div
                                          class="rounded-sm {getHeatmapColor(
                                            getDayActivity(
                                              cell.date,
                                              heatmapActiveProfile,
                                            ),
                                          )}"
                                          title="{cell.date}: {getDayActivity(
                                            cell.date,
                                            heatmapActiveProfile,
                                          )} events"
                                        ></div>
                                      {/each}
                                    </div>
                                  </div>
                                  <div
                                    class="mt-2 flex items-center gap-2 text-[10px] text-contrast-content/50"
                                  >
                                    <span>Less</span>
                                    <div
                                      class="h-2.5 w-2.5 rounded-sm bg-base-300"
                                    ></div>
                                    <div
                                      class="h-2.5 w-2.5 rounded-sm bg-green-400"
                                    ></div>
                                    <div
                                      class="h-2.5 w-2.5 rounded-sm bg-green-500"
                                    ></div>
                                    <div
                                      class="h-2.5 w-2.5 rounded-sm bg-green-600"
                                    ></div>
                                    <div
                                      class="h-2.5 w-2.5 rounded-sm bg-green-700"
                                    ></div>
                                    <span>More</span>
                                  </div>
                                </div>
                              {:else}
                                <div
                                  class="py-2 text-center text-xs text-contrast-content/50"
                                >
                                  Expand row to load activity calendar
                                </div>
                              {/if}
                            {/if}
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- Seat usage bar -->
                    <div class="mt-3">
                      <div
                        class="mb-1 flex items-center justify-between text-xs"
                      >
                        <span class="text-contrast-content/60">
                          Seat Usage: {entry.connected_vehicles} / {entry.allowed_seats}
                          {#if entry.seats_over_limit > 0}
                            <span class="text-error"
                              >(+{entry.seats_over_limit} over)</span
                            >
                          {/if}
                        </span>
                        <span
                          class="badge badge-xs {seatStatusBadge(
                            entry.seat_status,
                          )}"
                        >
                          {seatStatusLabel(entry.seat_status)}
                        </span>
                      </div>
                      <div
                        class="h-2 w-full overflow-hidden rounded-full bg-base-300"
                      >
                        <div
                          class="h-full rounded-full transition-all {entry.seat_status ===
                          'EXCEEDING'
                            ? 'bg-error'
                            : entry.seat_status === 'AT_LIMIT'
                              ? 'bg-warning'
                              : 'bg-success'}"
                          style="width: {Math.min(
                            (entry.connected_vehicles /
                              Math.max(entry.allowed_seats, 1)) *
                              100,
                            100,
                          )}%"
                        ></div>
                      </div>
                    </div>

                    <!-- Members list -->
                    {#if entry.members && entry.members.length > 0}
                      <div class="mt-4">
                        <h4
                          class="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-contrast-content/50"
                        >
                          <Icon
                            icon="solar:users-group-rounded-bold-duotone"
                            width="12"
                            height="12"
                          />
                          Connected Members ({entry.members.length})
                        </h4>
                        <div
                          class="overflow-x-auto rounded border border-base-300"
                        >
                          <table class="table-compact table w-full text-xs">
                            <thead>
                              <tr
                                class="bg-base-200/30 text-contrast-content/50"
                              >
                                <th>Name</th>
                                <th>Email</th>
                                <th>Last Sign-In</th>
                                <th>Last Location</th>
                                <th>Role</th>
                                <th class="w-16">Settings</th>
                              </tr>
                            </thead>
                            <tbody>
                              {#each entry.members as member}
                                <tr>
                                  <td class="text-contrast-content">
                                    {#if editingMember?.mapId === entry.master_map_id && editingMember?.memberId === member.id}
                                      <div class="flex items-center gap-1">
                                        <input
                                          type="text"
                                          bind:value={editingName}
                                          use:autofocus
                                          on:keydown={(e) =>
                                            e.key === "Enter" &&
                                            saveMemberName()}
                                          on:keydown={(e) =>
                                            e.key === "Escape" &&
                                            cancelEditMember()}
                                          class="w-32 rounded border border-base-300 bg-base-100 px-2 py-1 text-xs text-contrast-content"
                                        />
                                        <button
                                          class="rounded bg-base-content px-2 py-1 text-[10px] font-medium text-base-100 hover:bg-base-content/90 disabled:opacity-50"
                                          disabled={savingMemberName}
                                          on:click={saveMemberName}>Save</button
                                        >
                                        <button
                                          class="rounded border border-base-300 px-2 py-1 text-[10px] text-contrast-content/60 hover:bg-base-200"
                                          on:click={cancelEditMember}
                                          >Cancel</button
                                        >
                                      </div>
                                    {:else}
                                      <span
                                        class="inline-flex items-center gap-2"
                                      >
                                        {member.full_name || "\u2014"}
                                        <button
                                          type="button"
                                          class="rounded border border-base-300 px-1.5 py-0.5 text-[10px] text-contrast-content/50 transition-colors hover:bg-base-300 hover:text-contrast-content"
                                          on:click={() =>
                                            startEditMember(
                                              entry.master_map_id,
                                              member,
                                            )}
                                        >
                                          Edit
                                        </button>
                                      </span>
                                    {/if}
                                  </td>
                                  <td class="text-contrast-content/60"
                                    >{member.email || "—"}</td
                                  >
                                  <td class="text-contrast-content/60"
                                    >{timeAgo(member.last_sign_in)}</td
                                  >
                                  <td class="text-contrast-content/60"
                                    >{timeAgo(member.last_location_update)}</td
                                  >
                                  <td>
                                    {#if member.is_owner}
                                      <span class="badge badge-primary badge-xs"
                                        >Owner</span
                                      >
                                    {:else}
                                      <span
                                        class="inline-flex items-center gap-2"
                                      >
                                        <span class="badge badge-ghost badge-xs"
                                          >Member</span
                                        >
                                        <button
                                          type="button"
                                          class="rounded border border-base-300 px-1.5 py-0.5 text-[10px] text-contrast-content/50 transition-colors hover:bg-warning/10 hover:text-warning"
                                          on:click={() =>
                                            handleTransferOwnership(
                                              entry.master_map_id,
                                              member.id,
                                              member.full_name || "Member",
                                            )}
                                        >
                                          Make Owner
                                        </button>
                                      </span>
                                    {/if}
                                  </td>
                                  <td>
                                    <button
                                      type="button"
                                      class="rounded border border-base-300 px-1.5 py-0.5 text-[10px] text-contrast-content/50 transition-colors hover:bg-base-300 hover:text-contrast-content"
                                      on:click={() => openUserSettingsModal(member)}
                                      title="View/edit user settings"
                                    >
                                      <Icon icon="solar:settings-bold-duotone" width="12" height="12" />
                                    </button>
                                  </td>
                                </tr>
                              {/each}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    {:else}
                      <p class="mt-3 text-xs text-contrast-content/40">
                        No members connected to this map.
                      </p>
                    {/if}
                  </div>
                </td>
              </tr>
            {/if}
          {:else}
            <tr>
              <td
                colspan="9"
                class="py-8 text-center text-sm text-contrast-content/50"
              >
                No maps match your search criteria.
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<!-- Limits modal -->
<dialog
  bind:this={limitsDialogEl}
  class="modal modal-middle"
  on:close={() => (showLimitsModal = false)}
>
  <div class="modal-box w-full max-w-lg">
    <div class="mb-4 flex items-center justify-between border-b border-base-300 pb-3">
      <div class="flex items-center gap-3">
        <div
          class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-warning/20"
        >
          <Icon
            icon="solar:shield-warning-bold-duotone"
            width="18"
            height="18"
            class="text-warning"
          />
        </div>
        <div>
          <h4 class="text-base font-semibold text-contrast-content">
            Limit Warnings
          </h4>
          <p class="text-xs text-contrast-content/60">
            Toggle upgrade/seat-limit warnings per map
          </p>
        </div>
      </div>
      <button
        class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-base-200 transition-colors hover:bg-base-300"
        on:click={() => (showLimitsModal = false)}
        title="Close"
      >
        <Icon
          icon="solar:close-circle-bold-duotone"
          width="20"
          height="20"
          class="text-contrast-content/60"
        />
      </button>
    </div>

    <p class="mb-4 text-xs text-contrast-content/50">
      When a map has limit warnings <strong>ON</strong>, its members see alerts
      about exceeding or approaching their seat limit. When
      <strong>OFF</strong>, no upgrade warnings appear.
    </p>

    <div class="max-h-96 overflow-y-auto rounded-lg border border-base-300">
      {#if entries.length === 0}
        <div class="px-4 py-8 text-center text-sm text-contrast-content/50">
          No maps loaded yet.
        </div>
      {:else}
        {#each entries as entry (entry.master_map_id)}
          {@const mapId = entry.master_map_id}
          {@const enabled = limitsMap.get(mapId) ?? false}
          {@const isExceeding = entry.seat_status === "EXCEEDING"}
          <div
            class="flex items-center justify-between border-b border-base-300 px-4 py-3 transition-colors last:border-b-0 hover:bg-base-200/30"
          >
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium text-contrast-content">
                {entry.map_name || "Unnamed Map"}
              </p>
              <p class="truncate text-xs text-contrast-content/50">
                {entry.owner_name || entry.owner_email || "—"}
                <span class="mx-1.5">·</span>
                {entry.connected_vehicles}/{entry.allowed_seats} seats
                {#if isExceeding}
                  <span class="badge badge-error badge-xs ml-1">Exceeding</span>
                {/if}
              </p>
            </div>
            <button
              type="button"
              class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none {enabled
                ? 'bg-warning'
                : 'bg-base-300'}"
              disabled={togglingMapId === mapId}
              on:click={() => toggleMapLimits(mapId, !enabled)}
              title={enabled
                ? "Warnings ON — click to disable"
                : "Warnings OFF — click to enable"}
            >
              <span
                class="inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ease-in-out {enabled
                  ? 'translate-x-5'
                  : 'translate-x-0.5'}"
              ></span>
            </button>
          </div>
        {/each}
      {/if}
    </div>

    <div class="modal-action mt-4">
      <button
        class="btn btn-outline btn-sm"
        on:click={() => (showLimitsModal = false)}
      >
        Close
      </button>
    </div>
  </div>
</dialog>

<!-- User Settings modal -->
<dialog
  bind:this={userSettingsDialogEl}
  class="modal modal-middle"
  on:close={() => (showUserSettingsModal = false)}
>
  <div class="modal-box w-full max-w-lg">
    <div class="mb-4 flex items-center justify-between border-b border-base-300 pb-3">
      <div class="flex items-center gap-3">
        <div class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary/20">
          <Icon icon="solar:settings-bold-duotone" width="18" height="18" class="text-primary" />
        </div>
        <div>
          <h4 class="text-base font-semibold text-contrast-content">User Settings</h4>
          <p class="text-xs text-contrast-content/60">{settingsTargetUser?.name || "—"}</p>
        </div>
      </div>
      <button
        class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-base-200 transition-colors hover:bg-base-300"
        on:click={() => (showUserSettingsModal = false)}
        title="Close"
      >
        <Icon icon="solar:close-circle-bold-duotone" width="20" height="20" class="text-contrast-content/60" />
      </button>
    </div>

    {#if settingsLoading}
      <div class="flex items-center justify-center py-8">
        <span class="loading loading-spinner loading-md text-primary"></span>
      </div>
    {:else}
      <div class="max-h-96 overflow-y-auto space-y-4">
        <!-- Diff summary -->
        <div class="rounded-lg bg-base-200/50 px-3 py-2 text-center text-xs" title={diffTooltip}>
          {#if diffCount > 0}
            <span class="font-semibold text-warning">{diffCount}</span>
            <span class="text-contrast-content/60"> of {Object.keys(SETTING_DEFAULTS).length} settings differ from defaults</span>
          {:else}
            <span class="text-contrast-content/60">All settings at defaults</span>
          {/if}
        </div>

        <!-- Section: Misc toggles -->
        <div class="space-y-1">
          <h5 class="text-xs font-semibold uppercase tracking-wider text-contrast-content/40">General</h5>
          {#each MISC_BOOL_FIELDS as field}
            {@const val = s[field.col] ?? false}
            <div class="flex items-center justify-between rounded px-2 py-1.5 hover:bg-base-200/30">
              <span class="text-xs text-contrast-content">{diffDot(field.col)}{field.label}</span>
              <button type="button"
                class="relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 {val ? 'bg-primary' : 'bg-base-300'}"
                disabled={settingsSaving === field.col}
                on:click={() => toggleUserSetting(field.col, !val)}>
                <span class="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200 {val ? 'translate-x-4' : 'translate-x-0.5'}"></span>
              </button>
            </div>
          {/each}
        </div>

        <!-- Section: Markers -->
        <div class="space-y-1">
          <h5 class="text-xs font-semibold uppercase tracking-wider text-contrast-content/40">Markers</h5>
          {#each MARKER_BOOL_FIELDS as field}
            {@const val = s[field.col] ?? false}
            <div class="flex items-center justify-between rounded px-2 py-1.5 hover:bg-base-200/30">
              <span class="text-xs text-contrast-content">{diffDot(field.col)}{field.label}</span>
              <button type="button"
                class="relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 {val ? 'bg-primary' : 'bg-base-300'}"
                disabled={settingsSaving === field.col}
                on:click={() => toggleUserSetting(field.col, !val)}>
                <span class="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200 {val ? 'translate-x-4' : 'translate-x-0.5'}"></span>
              </button>
            </div>
          {/each}
          <div class="rounded px-2 py-1.5 text-xs text-contrast-content/60">
            {diffDot("defaultMarker")}Default: <span class="text-contrast-content">{(s.defaultMarker ?? SETTING_DEFAULTS.defaultMarker)?.name || "Default Marker"}</span>
          </div>
          <div class="flex items-center justify-between rounded px-2 py-1.5 hover:bg-base-200/30">
            <span class="text-xs text-contrast-content">
              {diffDot("extraMarkers")}Extra markers ({((s.extraMarkers ?? []) || []).length})
            </span>
            <button type="button"
              class="relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 {((s.extraMarkers ?? []) || []).length ? 'bg-primary' : 'bg-base-300'}"
              disabled={settingsSaving === "extraMarkers"}
              on:click={() => toggleUserSetting("extraMarkers", ((s.extraMarkers ?? []) || []).length ? [] : [{ id: "custom", class: "default", name: "Custom" }])}>
              <span class="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200 {((s.extraMarkers ?? []) || []).length ? 'translate-x-4' : 'translate-x-0.5'}"></span>
            </button>
          </div>
        </div>

        <!-- Section: GPS -->
        <div class="space-y-1">
          <h5 class="text-xs font-semibold uppercase tracking-wider text-contrast-content/40">GPS</h5>
          {#each GPS_BOOL_FIELDS as field}
            {@const val = s[field.col] ?? false}
            <div class="flex items-center justify-between rounded px-2 py-1.5 hover:bg-base-200/30">
              <span class="text-xs text-contrast-content">{diffDot(field.col)}{field.label}</span>
              <button type="button"
                class="relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 {val ? 'bg-primary' : 'bg-base-300'}"
                disabled={settingsSaving === field.col}
                on:click={() => toggleUserSetting(field.col, !val)}>
                <span class="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200 {val ? 'translate-x-4' : 'translate-x-0.5'}"></span>
              </button>
            </div>
          {/each}
          <div class="flex items-center justify-between rounded px-2 py-1.5 hover:bg-base-200/30">
            <span class="text-xs text-contrast-content">{diffDot("gpsIntervalSeconds")}GPS interval (s)</span>
            <div class="flex items-center gap-1">
              <button class="flex h-5 w-5 items-center justify-center rounded text-xs text-contrast-content/50 hover:bg-base-300 disabled:opacity-30"
                disabled={settingsSaving === "gpsIntervalSeconds" || getSettingVal('gpsIntervalSeconds', 2) <= 1}
                on:click={() => toggleUserSetting("gpsIntervalSeconds", getSettingVal('gpsIntervalSeconds', 2) - 1)}>−</button>
              <span class="w-6 text-center text-xs font-medium text-contrast-content">{getSettingVal('gpsIntervalSeconds', 2)}</span>
              <button class="flex h-5 w-5 items-center justify-center rounded text-xs text-contrast-content/50 hover:bg-base-300 disabled:opacity-30"
                disabled={settingsSaving === "gpsIntervalSeconds" || getSettingVal('gpsIntervalSeconds', 2) >= 10}
                on:click={() => toggleUserSetting("gpsIntervalSeconds", getSettingVal('gpsIntervalSeconds', 2) + 1)}>+</button>
            </div>
          </div>
        </div>

        <!-- Section: Satellite -->
        <div class="space-y-1">
          <h5 class="text-xs font-semibold uppercase tracking-wider text-contrast-content/40">Satellite Imagery</h5>
          <div class="rounded px-2 py-1.5">
            <span class="text-xs text-contrast-content">{diffDot("defaultImagerySource")}Default source: <span class="text-contrast-content/60">{s.defaultImagerySource ?? "mapbox"}</span></span>
          </div>
          {#each Object.entries(IMAGERY_SOURCES).filter(([, src]) => src.canBeDefault) as [key, src]}
            <div class="flex items-center justify-between rounded px-2 py-1.5 hover:bg-base-200/30">
              <span class="text-xs text-contrast-content">{src.name}</span>
              <button type="button"
                class="rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors {(s.defaultImagerySource ?? 'mapbox') === key ? 'bg-primary/20 text-primary' : 'text-contrast-content/40 hover:bg-base-300'}"
                disabled={settingsSaving === "defaultImagerySource"}
                on:click={() => toggleUserSetting("defaultImagerySource", key)}>
                {(s.defaultImagerySource ?? 'mapbox') === key ? "Default" : "Set default"}
              </button>
            </div>
          {/each}
        </div>

        <!-- Section: Layer visibility -->
        <div class="space-y-1">
          <h5 class="text-xs font-semibold uppercase tracking-wider text-contrast-content/40">Layer Visibility</h5>
          {#if true}
            {@const lv = s.layerVisibility ?? {}}
            <div class="flex items-center justify-between rounded px-2 py-1.5 hover:bg-base-200/30">
              <span class="text-xs text-contrast-content">
                {diffDot("layerVisibility")}Custom visibility ({Object.keys(lv || {}).length} layers)
              </span>
              <button type="button"
                class="relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 {Object.keys(lv || {}).length > 0 ? 'bg-primary' : 'bg-base-300'}"
                disabled={settingsSaving === "layerVisibility"}
                on:click={() => toggleUserSetting("layerVisibility", Object.keys(lv || {}).length > 0 ? {} : { historicalTrails: false })}>
                <span class="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200 {Object.keys(lv || {}).length > 0 ? 'translate-x-4' : 'translate-x-0.5'}"></span>
              </button>
            </div>
          {/if}
        </div>
      </div>

      <div class="modal-action mt-4 flex items-center justify-between">
        <button class="btn btn-outline btn-sm text-error" disabled={settingsSaving === "__reset__"}
          on:click={resetUserSettings}>
          {settingsSaving === "__reset__" ? "Resetting..." : "Reset to defaults"}
        </button>
        <button class="btn btn-outline btn-sm" on:click={() => (showUserSettingsModal = false)}>Close</button>
      </div>
    {/if}
  </div>
</dialog>

<SendSmsModal
  bind:show={smsModalShow}
  phone={smsPhone}
  ownerName={smsOwnerName}
  onClose={() => (smsModalShow = false)}
/>
