<script lang="ts">
  import { onMount } from "svelte"
  import Icon from "@iconify/svelte"
  import { toast } from "svelte-sonner"
  import {
    adminApi,
    type AdminMapEntry,
    type AdminMapActivity,
    type AdminMapContentStats,
    type AdminMapNote,
  } from "$lib/api/adminApi"
  import { userSettingsStore } from "$lib/stores/userSettingsStore"
  import { mapSettingsApi } from "$lib/api/mapSettingsApi"
  import {
    adminUserSettingsApi,
    type UserSettingsRow,
  } from "$lib/api/adminUserSettingsApi"
  import { goto } from "$app/navigation"
  import SendSmsModal from "$lib/components/admin/SendSmsModal.svelte"
  import AdminClientTable from "$lib/components/admin/AdminClientTable.svelte"
  import AdminClientDetail from "$lib/components/admin/AdminClientDetail.svelte"
  import { NotepadText, X } from "lucide-svelte"
  import { noteIsDirty, timeAgo } from "$lib/utils/adminFormat"

  type QuickFilter = "all" | "exceeding" | "no_mapping" | "dormant"
  type AttentionTone = "error" | "warning" | "info"

  interface AttentionFilter {
    key: Exclude<QuickFilter, "all">
    label: string
    count: number
    icon: string
    tone: AttentionTone
    title: string
    disabled: boolean
  }

  // Written out in full so Tailwind keeps the classes.
  const ATTENTION_TONE: Record<AttentionTone, { active: string }> = {
    error: {
      active:
        "border-error/35 bg-error/10 text-error ring-1 ring-inset ring-error/20",
    },
    warning: {
      active:
        "border-warning/35 bg-warning/10 text-warning ring-1 ring-inset ring-warning/20",
    },
    info: {
      active:
        "border-info/35 bg-info/10 text-info ring-1 ring-inset ring-info/20",
    },
  }

  const statCard = "rounded-xl border border-base-300 bg-base-100 p-3"
  const statLabel =
    "text-[11px] font-medium uppercase tracking-wider text-contrast-content/50"
  const statValue =
    "mt-2 text-2xl font-semibold leading-none tabular-nums text-contrast-content"
  const statNote = "mt-2 text-[11px] leading-snug text-contrast-content/55"

  function formatHectares(ha: number): string {
    if (!Number.isFinite(ha) || ha <= 0) return "—"
    if (ha >= 1_000_000) return `${(ha / 1_000_000).toFixed(1)}M ha`
    if (ha >= 1_000) return `${Math.round(ha / 1_000)}k ha`
    return `${Math.round(ha)} ha`
  }

  // Imagery sources (mirrors SatelliteControls.svelte)
  const IMAGERY_SOURCES: Record<
    string,
    { name: string; canBeDefault?: boolean }
  > = {
    mapbox: { name: "Mapbox Satellite", canBeDefault: true },
    google_satellite: { name: "Google Satellite", canBeDefault: true },
    bing_aerial: { name: "Microsoft Bing Aerial", canBeDefault: true },
    esri_standard: { name: "Esri World Imagery", canBeDefault: true },
    ndvi: { name: "NDVI Vegetation Index" },
  }

  // Default settings values (mirrors userSettingsStore defaults + DB defaults)
  const SETTING_DEFAULTS: Record<string, any> = {
    isAdmin: false,
    devToolsEnabled: false,
    autoConfirmMarkers: false,
    showVehiclesAlways: true,
    zoomToLocationMarkers: false,
    zoomToPlacedMarkers: false,
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
  let contentStatsMap: Map<string, AdminMapContentStats> = new Map()
  let errorMessage = ""
  let selectedMapId: string | null = null
  let searchQuery = ""
  let quickFilter: QuickFilter = "all"
  let filterPlan: "all" | "paid" | "free" = "all"
  let sortBy: "default" | "latest" = "latest"
  let lastRefreshed: Date | null = null

  // SMS state
  let smsModalShow = false
  let smsPhone = ""
  let smsOwnerName = ""

  // Note editor modal — opened from the notepad on each client card
  let noteModalEntry: AdminMapEntry | null = null

  // Admin map notes, keyed by master_map_id
  let mapNotes: Record<string, AdminMapNote> = {}
  let noteDrafts: Record<string, string> = {}
  let savingNoteId: string | null = null

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

  $: if (
    showUserSettingsModal &&
    userSettingsDialogEl &&
    !userSettingsDialogEl.open
  ) {
    userSettingsDialogEl.showModal()
  } else if (!showUserSettingsModal && userSettingsDialogEl?.open) {
    userSettingsDialogEl.close()
  }

  async function openUserSettingsModal(member: {
    id: string
    full_name: string | null
  }) {
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
    const result = await adminUserSettingsApi.setUserSetting(
      settingsTargetUser.id,
      field,
      value,
    )
    if (result.success) {
      // Update local state optimistically
      settingsData = {
        ...(settingsData || {}),
        [field]: value,
      } as UserSettingsRow
      toast.success("Setting updated")
    } else {
      toast.error(result.error || "Failed to update setting")
    }
    settingsSaving = null
  }

  async function resetUserSettings() {
    if (!settingsTargetUser) return
    if (
      !confirm(`Reset ALL settings for ${settingsTargetUser.name} to defaults?`)
    )
      return
    settingsSaving = "__reset__"
    const result = await adminUserSettingsApi.resetUserSettings(
      settingsTargetUser.id,
    )
    if (result.success) {
      settingsData = null
      toast.success("Settings reset to defaults")
    } else {
      toast.error(result.error || "Failed to reset settings")
    }
    settingsSaving = null
  }

  // ── SMS + notes ───────────────────────────────────────────────────────────
  function openSmsModal(phone: string, name: string) {
    smsPhone = phone
    smsOwnerName = name
    smsModalShow = true
  }

  // Row / card click toggles the inline detail expansion.
  function toggleEntry(entry: AdminMapEntry) {
    selectedMapId =
      selectedMapId === entry.master_map_id ? null : entry.master_map_id
  }

  function openNoteModal(entry: AdminMapEntry) {
    noteModalEntry = entry
  }

  async function saveNoteFromModal() {
    if (!noteModalEntry) return
    if (await saveMapNote(noteModalEntry.master_map_id)) {
      noteModalEntry = null
    }
  }

  async function saveMapNote(mapId: string) {
    savingNoteId = mapId
    const note = noteDrafts[mapId] ?? ""
    const result = await adminApi.saveMapNote(mapId, note)
    if (result.success) {
      mapNotes = {
        ...mapNotes,
        [mapId]: {
          note,
          updated_at: result.data?.updated_at ?? new Date().toISOString(),
        },
      }
      toast.success(note.trim() ? "Note saved" : "Note cleared")
    } else {
      toast.error(result.error || "Failed to save note")
    }
    savingNoteId = null
    return result.success
  }

  // ── User settings helpers ─────────────────────────────────────────────────
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
    { col: "isAdmin", label: "Admin (records tools)" },
    { col: "devToolsEnabled", label: "Dev tools" },
    { col: "satelliteDropdownEnabled", label: "Satellite dropdown" },
    { col: "sprayConfirmEnabled", label: "Record confirm popup" },
  ]

  // Marker-related settings
  const MARKER_BOOL_FIELDS = [
    {
      col: "showVehiclesAlways",
      label: "Show vehicles always (offscreen tracking)",
    },
    { col: "zoomToLocationMarkers", label: "Zoom to location markers" },
    { col: "zoomToPlacedMarkers", label: "Zoom to placed markers" },
    { col: "autoConfirmMarkers", label: "Auto-confirm markers" },
  ]

  // GPS-related settings
  const GPS_BOOL_FIELDS = [
    { col: "enableFull1Hz", label: "Full 1Hz GPS" },
    { col: "showGpsPopups", label: "GPS popups (legacy)" },
    { col: "showGpsAcceptedPopups", label: "GPS accepted popups" },
    { col: "showGpsRejectedPopups", label: "GPS rejected popups" },
  ]

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

  // ── Attention queue ───────────────────────────────────────────────────────
  $: contentStatsLoaded = contentStatsMap.size > 0

  $: noMappingCount = entries.filter((e) => {
    const s = contentStatsMap.get(e.master_map_id)
    return !!s && s.field_count === 0
  }).length

  $: dormantCount = entries.filter(
    (e) => e.vehicles_active_30d === 0 && e.members_active_30d === 0,
  ).length

  // Filter chips: neutral until selected, so they read as filters rather than
  // as a permanent wall of alerts.
  $: attentionFilters = [
    {
      key: "exceeding",
      label: "over seats",
      count: exceedingCount,
      icon: "solar:shield-warning-bold-duotone",
      tone: "error",
      title: "Clients over their seat limit",
      disabled: false,
    },
    {
      key: "no_mapping",
      label: "no mapping",
      count: noMappingCount,
      icon: "solar:map-bold-duotone",
      tone: "warning",
      title: contentStatsLoaded
        ? "Clients with no fields mapped yet"
        : "Mapping stats unavailable",
      disabled: !contentStatsLoaded,
    },
    {
      key: "dormant",
      label: "dormant",
      count: dormantCount,
      icon: "solar:clock-circle-bold-duotone",
      tone: "info",
      title: "No vehicle or member activity in the last 30 days",
      disabled: false,
    },
  ] as AttentionFilter[]

  // Filtered & searched entries
  $: filteredEntries = entries
    .filter((e) => {
      if (quickFilter === "exceeding") return e.seat_status === "EXCEEDING"
      if (quickFilter === "no_mapping") {
        const s = contentStatsMap.get(e.master_map_id)
        return !!s && s.field_count === 0
      }
      if (quickFilter === "dormant")
        return e.vehicles_active_30d === 0 && e.members_active_30d === 0
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

  // ── Summary stats ─────────────────────────────────────────────────────────
  $: totalMaps = entries.length
  $: totalUsers = entries.reduce((sum, e) => sum + e.total_members, 0)
  $: exceedingCount = entries.filter(
    (e) => e.seat_status === "EXCEEDING",
  ).length
  // Clients (farms) with at least one member reporting GPS in the last 24h.
  $: activeClients = entries.filter((e) => e.vehicles_active_24h > 0).length
  // Members (not farms) with a GPS ping in the last 24h — this is the sum of
  // the per-client "active 24h" badges, so it is much larger than activeClients.
  $: activeUsers24h = entries.reduce((sum, e) => sum + e.vehicles_active_24h, 0)
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

  $: activeClients7d = entries.filter((e) => e.vehicles_active_7d > 0).length
  $: paidSeatsUsed = entries
    .filter((e) => e.subscription !== "FREE" && e.subscription_status !== "free")
    .reduce((sum, e) => sum + e.connected_vehicles, 0)
  $: seatsOverLimit = entries.reduce((sum, e) => sum + e.seats_over_limit, 0)
  $: seatUsagePct = paidSeats
    ? Math.min(100, Math.round((paidSeatsUsed / paidSeats) * 100))
    : 0
  $: mappedHectares = entries.reduce(
    (sum, e) => sum + (contentStatsMap.get(e.master_map_id)?.field_hectares ?? 0),
    0,
  )
  $: mappedFields = entries.reduce(
    (sum, e) => sum + (contentStatsMap.get(e.master_map_id)?.field_count ?? 0),
    0,
  )

  // ── Data loading ──────────────────────────────────────────────────────────
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

      // Per-farm content stats — mapped hectarage, trails recorded, markers
      // placed — a failure here shouldn't blank the dashboard either.
      const contentStatsResult = await adminApi.fetchContentStats()
      if (contentStatsResult.success) {
        contentStatsMap = new Map(
          contentStatsResult.data.map((c) => [c.master_map_id, c]),
        )
      }

      // Notes load separately — a failure here shouldn't blank the dashboard.
      const notesResult = await adminApi.fetchMapNotes()
      if (notesResult.success) {
        mapNotes = notesResult.data
        noteDrafts = Object.fromEntries(
          Object.entries(notesResult.data).map(([id, n]) => [id, n.note]),
        )
      }
    } else {
      errorMessage = result.error || "Failed to load data"
      toast.error(errorMessage)
    }
    loading = false
  }

  function clearFilters() {
    searchQuery = ""
    quickFilter = "all"
    filterPlan = "all"
  }

  // Load on mount
  onMount(() => {
    loadData()
  })
</script>

<svelte:head>
  <title>Admin Dashboard</title>
</svelte:head>

<!-- Header -->
<header class="border-b border-base-300 bg-base-100 font-inter">
  <div
    class="flex flex-wrap items-center justify-between gap-3 px-4 py-3 lg:px-6"
  >
    <div class="flex min-w-0 items-center gap-3">
      <div
        class="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-warning/15 ring-1 ring-inset ring-warning/25"
      >
        <Icon
          icon="solar:shield-keyhole-bold-duotone"
          width="20"
          height="20"
          class="text-warning"
        />
      </div>
      <div class="min-w-0">
        <h1
          class="truncate text-lg font-semibold leading-tight text-contrast-content"
        >
          Admin Dashboard
        </h1>
        <p
          class="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-contrast-content/55"
        >
          <span class="tabular-nums">{totalMaps} clients</span>
          <span class="text-contrast-content/20">·</span>
          <span class="tabular-nums">{totalUsers} users</span>
          {#if lastRefreshed}
            <span class="text-contrast-content/20">·</span>
            <span class="tabular-nums"
              >updated {lastRefreshed.toLocaleTimeString()}</span
            >
          {/if}
        </p>
      </div>
    </div>

    <div class="flex items-center gap-1.5">
      <button
        class="btn btn-ghost btn-sm gap-1.5 text-contrast-content/70 hover:text-contrast-content"
        on:click={openLimitsModal}
        title="Manage limit warnings per map"
      >
        <Icon icon="solar:shield-warning-bold-duotone" width="16" height="16" />
        <span class="hidden sm:inline">Limits</span>
      </button>
      <button
        class="btn btn-sm gap-1.5 border-base-300 bg-base-100 hover:bg-base-200"
        on:click={loadData}
        disabled={loading}
        aria-busy={loading}
        title="Reload dashboard data"
      >
        <Icon
          icon="solar:refresh-bold-duotone"
          width="16"
          height="16"
          class={loading ? "animate-spin" : ""}
        />
        {loading ? "Refreshing…" : "Refresh"}
      </button>
    </div>
  </div>
</header>

<div class="space-y-3 p-3 font-inter sm:space-y-4 sm:p-4 lg:space-y-5 lg:p-6">
  {#if loading && entries.length === 0}
    <!-- Loading skeleton -->
    <div class="flex items-center justify-center py-20">
      <div class="text-center">
        <span class="loading loading-spinner loading-lg text-warning"></span>
        <p class="mt-3 text-sm text-contrast-content/60">
          Loading admin data…
        </p>
      </div>
    </div>
  {:else if errorMessage && entries.length === 0}
    <!-- Error state -->
    <div class="rounded-xl border border-error/20 bg-error/5 p-8 text-center">
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
    <!-- KPI cards -->
    <section
      class="grid grid-cols-2 gap-2.5 sm:grid-cols-3 2xl:grid-cols-6"
      aria-label="Dashboard summary"
    >
      <article class={statCard} title="Farms with at least one member reporting GPS">
        <div class="flex items-start justify-between gap-2">
          <p class={statLabel}>Clients</p>
          <Icon
            icon="solar:users-group-rounded-bold-duotone"
            width="15"
            height="15"
            class="shrink-0 text-contrast-content/25"
          />
        </div>
        <p class={statValue}>{totalMaps}</p>
        <p class={statNote}>
          <span class="font-semibold text-success">{activeClients}</span>
          active 24h
          <span class="mx-1 text-contrast-content/20">·</span>
          <span class="font-medium text-contrast-content/70">{activeClients7d}</span>
          in 7d
        </p>
      </article>

      <article class={statCard} title="Members across every client">
        <div class="flex items-start justify-between gap-2">
          <p class={statLabel}>Users</p>
          <Icon
            icon="solar:user-check-rounded-bold-duotone"
            width="15"
            height="15"
            class="shrink-0 text-contrast-content/25"
          />
        </div>
        <p class={statValue}>{totalUsers}</p>
        <p class={statNote}>
          <span class="font-semibold text-success">{activeUsers24h}</span>
          active 24h
          <span class="mx-1 text-contrast-content/20">·</span>
          <span class="font-medium text-contrast-content/70">{activeUsers30d}</span>
          in 30d
        </p>
      </article>

      <article class={statCard} title="Clients on a paid plan, and seats in use">
        <div class="flex items-start justify-between gap-2">
          <p class={statLabel}>Paid plans</p>
          <Icon
            icon="solar:card-recive-bold-duotone"
            width="15"
            height="15"
            class="shrink-0 text-contrast-content/25"
          />
        </div>
        <p class="{statValue} text-primary">{proCount}</p>
        <p class={statNote}>
          <span class="font-medium text-contrast-content/70">{paidSeatsUsed}</span>
          of {paidSeats} seats in use
        </p>
        <div class="mt-2 h-1 w-full overflow-hidden rounded-full bg-base-300">
          <div
            class="h-full rounded-full bg-primary transition-[width]"
            style="width: {seatUsagePct}%"
          ></div>
        </div>
      </article>

      <article class={statCard} title="Clients on the free plan; headless = owner has no device reporting">
        <div class="flex items-start justify-between gap-2">
          <p class={statLabel}>Free plans</p>
          <Icon
            icon="solar:gift-bold-duotone"
            width="15"
            height="15"
            class="shrink-0 text-contrast-content/25"
          />
        </div>
        <p class="{statValue} text-contrast-content/80">{freeCount}</p>
        <p class={statNote}>
          <span class="font-medium text-contrast-content/70">{headlessCount}</span>
          headless
        </p>
      </article>

      <article class={statCard} title="Clients whose connected devices exceed their seat allowance">
        <div class="flex items-start justify-between gap-2">
          <p class={statLabel}>Over seats</p>
          <Icon
            icon="solar:shield-warning-bold-duotone"
            width="15"
            height="15"
            class="shrink-0 text-contrast-content/25"
          />
        </div>
        <p class="{statValue} {exceedingCount > 0 ? 'text-error' : ''}">
          {exceedingCount}
        </p>
        <p class={statNote}>
          <span class="font-medium text-contrast-content/70">{seatsOverLimit}</span>
          seats over limit
        </p>
      </article>

      <article class={statCard} title="Total area across mapped fields">
        <div class="flex items-start justify-between gap-2">
          <p class={statLabel}>Mapped</p>
          <Icon
            icon="solar:map-bold-duotone"
            width="15"
            height="15"
            class="shrink-0 text-contrast-content/25"
          />
        </div>
        <p class="{statValue} text-accent">{formatHectares(mappedHectares)}</p>
        <p class={statNote}>
          <span class="font-medium text-contrast-content/70">{mappedFields}</span>
          fields mapped
        </p>
      </article>
    </section>

    <!-- Filters: attention chips + search + plan/sort -->
    <section class="overflow-hidden rounded-xl border border-base-300 bg-base-100">
      <div class="flex flex-wrap items-center gap-1.5 border-b border-base-300 px-3 py-2">
        <span
          class="mr-1 text-[11px] font-semibold uppercase tracking-wider text-contrast-content/45"
          >Needs attention</span
        >
        {#each attentionFilters as filter (filter.key)}
          <button
            type="button"
            aria-pressed={quickFilter === filter.key}
            disabled={filter.disabled}
            title={filter.title}
            class="flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 {quickFilter ===
            filter.key
              ? ATTENTION_TONE[filter.tone].active
              : 'border-transparent bg-base-200/40 text-contrast-content/65 hover:bg-base-200 hover:text-contrast-content'}"
            on:click={() =>
              (quickFilter = quickFilter === filter.key ? "all" : filter.key)}
          >
            <Icon
              icon={filter.icon}
              width="13"
              height="13"
              class={quickFilter === filter.key
                ? ""
                : "text-contrast-content/40"}
            />
            <span class="font-semibold tabular-nums">{filter.count}</span>
            <span>{filter.label}</span>
          </button>
        {/each}
        {#if quickFilter !== "all"}
          <button
            type="button"
            class="ml-auto flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-contrast-content/60 hover:bg-base-200 hover:text-contrast-content"
            on:click={() => (quickFilter = "all")}
          >
            <Icon icon="solar:close-circle-bold-duotone" width="13" height="13" />
            Clear filter
          </button>
        {/if}
      </div>

      <div class="flex flex-col gap-2 px-3 py-2.5 lg:flex-row lg:items-center lg:gap-3">
        <div class="relative flex-1">
          <Icon
            icon="solar:magnifer-bold-duotone"
            width="15"
            height="15"
            class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-contrast-content/35"
          />
          <input
            type="text"
            placeholder="Search name, email, farm or member…"
            class="input input-sm w-full border-base-300 bg-base-100 pl-9 pr-8 text-sm placeholder:text-contrast-content/35"
            bind:value={searchQuery}
          />
          {#if searchQuery}
            <button
              type="button"
              class="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-contrast-content/40 hover:text-contrast-content"
              on:click={() => (searchQuery = "")}
              title="Clear search"
            >
              <Icon
                icon="solar:close-circle-bold-duotone"
                width="14"
                height="14"
              />
            </button>
          {/if}
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <div
            class="flex rounded-lg bg-base-200/70 p-0.5 ring-1 ring-inset ring-base-300/70"
            role="group"
            aria-label="Plan filter"
          >
            <button
              class="rounded-md px-2.5 py-1 text-xs font-medium transition-colors {filterPlan ===
              'all'
                ? 'bg-base-100 text-contrast-content shadow-sm'
                : 'text-contrast-content/60 hover:text-contrast-content'}"
              on:click={() => (filterPlan = "all")} aria-pressed={filterPlan === "all"}>All</button
            >
            <button
              class="rounded-md px-2.5 py-1 text-xs font-medium transition-colors {filterPlan ===
              'paid'
                ? 'bg-base-100 text-contrast-content shadow-sm'
                : 'text-contrast-content/60 hover:text-contrast-content'}"
              on:click={() => (filterPlan = "paid")} aria-pressed={filterPlan === "paid"}>Paid</button
            >
            <button
              class="rounded-md px-2.5 py-1 text-xs font-medium transition-colors {filterPlan ===
              'free'
                ? 'bg-base-100 text-contrast-content shadow-sm'
                : 'text-contrast-content/60 hover:text-contrast-content'}"
              on:click={() => (filterPlan = "free")} aria-pressed={filterPlan === "free"}>Free</button
            >
          </div>

          <select
            bind:value={sortBy}
            class="select select-xs w-36 border-base-300 bg-base-100"
            aria-label="Sort clients"
            title="Sort clients"
          >
            <option value="latest">Latest activity</option>
            <option value="default">Default order</option>
          </select>

          <span class="text-xs tabular-nums text-contrast-content/55">
            <span class="font-semibold text-contrast-content/80"
              >{filteredEntries.length}</span
            >
            of {totalMaps}
          </span>

          {#if searchQuery || quickFilter !== "all" || filterPlan !== "all"}
            <button
              class="text-xs font-medium text-primary hover:underline"
              on:click={clearFilters}>Reset</button
            >
          {/if}
        </div>
      </div>
    </section>

    <!-- Client list — responsive table (columns collapse on smaller screens) -->
    {#if filteredEntries.length === 0}
      <div
        class="rounded-xl border border-base-300 bg-base-200/20 p-10 text-center"
      >
        <p class="text-sm text-contrast-content/60">
          No clients match your filters.
        </p>
        <button class="btn btn-outline btn-xs mt-3" on:click={clearFilters}>
          Clear filters
        </button>
      </div>
    {:else}
      <AdminClientTable
        entries={filteredEntries}
        {contentStatsMap}
        {mapNotes}
        {selectedMapId}
        statsLoaded={contentStatsLoaded}
        onOpen={toggleEntry}
        onOpenSms={openSmsModal}
        onOpenNote={openNoteModal}
      >
        <svelte:fragment slot="rowDetail" let:entry>
          <AdminClientDetail
            {entry}
            {contentStatsMap}
            {activityMap}
            {mapNotes}
            {noteDrafts}
            {savingNoteId}
            onClose={() => (selectedMapId = null)}
            onSaveNote={saveMapNote}
            onOpenSms={openSmsModal}
            onOpenUserSettings={openUserSettingsModal}
            onEntryUpdated={() => (entries = [...entries])}
            onReload={loadData}
          />
        </svelte:fragment>
      </AdminClientTable>
    {/if}
  {/if}
</div>

<!-- Limits modal -->
<dialog
  bind:this={limitsDialogEl}
  class="modal modal-middle"
  on:close={() => (showLimitsModal = false)}
>
  <div class="modal-box w-full max-w-lg font-inter">
    <div
      class="mb-4 flex items-center justify-between border-b border-base-300 pb-3"
    >
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
  <div class="modal-box w-full max-w-lg font-inter">
    <div
      class="mb-4 flex items-center justify-between border-b border-base-300 pb-3"
    >
      <div class="flex items-center gap-3">
        <div
          class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary/20"
        >
          <Icon
            icon="solar:settings-bold-duotone"
            width="18"
            height="18"
            class="text-primary"
          />
        </div>
        <div>
          <h4 class="text-base font-semibold text-contrast-content">
            User Settings
          </h4>
          <p class="text-xs text-contrast-content/60">
            {settingsTargetUser?.name || "—"}
          </p>
        </div>
      </div>
      <button
        class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-base-200 transition-colors hover:bg-base-300"
        on:click={() => (showUserSettingsModal = false)}
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

    {#if settingsLoading}
      <div class="flex items-center justify-center py-8">
        <span class="loading loading-spinner loading-md text-primary"></span>
      </div>
    {:else}
      <div class="max-h-96 space-y-4 overflow-y-auto">
        <!-- Diff summary -->
        <div
          class="rounded-lg bg-base-200/50 px-3 py-2 text-center text-xs"
          title={diffTooltip}
        >
          {#if diffCount > 0}
            <span class="font-semibold text-warning">{diffCount}</span>
            <span class="text-contrast-content/60">
              of {Object.keys(SETTING_DEFAULTS).length} settings differ from
              defaults</span
            >
          {:else}
            <span class="text-contrast-content/60"
              >All settings at defaults</span
            >
          {/if}
        </div>

        <!-- Section: Misc toggles -->
        <div class="space-y-1">
          <h5
            class="text-xs font-semibold uppercase tracking-wider text-contrast-content/40"
          >
            General
          </h5>
          {#each MISC_BOOL_FIELDS as field}
            {@const val = s[field.col] ?? false}
            <div
              class="flex items-center justify-between rounded px-2 py-1.5 hover:bg-base-200/30"
            >
              <span class="text-xs text-contrast-content"
                >{diffDot(field.col)}{field.label}</span
              >
              <button
                type="button"
                class="relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 {val
                  ? 'bg-primary'
                  : 'bg-base-300'}"
                disabled={settingsSaving === field.col}
                on:click={() => toggleUserSetting(field.col, !val)}
              >
                <span
                  class="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200 {val
                    ? 'translate-x-4'
                    : 'translate-x-0.5'}"
                ></span>
              </button>
            </div>
          {/each}
        </div>

        <!-- Section: Markers -->
        <div class="space-y-1">
          <h5
            class="text-xs font-semibold uppercase tracking-wider text-contrast-content/40"
          >
            Markers
          </h5>
          {#each MARKER_BOOL_FIELDS as field}
            {@const val = s[field.col] ?? false}
            <div
              class="flex items-center justify-between rounded px-2 py-1.5 hover:bg-base-200/30"
            >
              <span class="text-xs text-contrast-content"
                >{diffDot(field.col)}{field.label}</span
              >
              <button
                type="button"
                class="relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 {val
                  ? 'bg-primary'
                  : 'bg-base-300'}"
                disabled={settingsSaving === field.col}
                on:click={() => toggleUserSetting(field.col, !val)}
              >
                <span
                  class="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200 {val
                    ? 'translate-x-4'
                    : 'translate-x-0.5'}"
                ></span>
              </button>
            </div>
          {/each}
          <div class="rounded px-2 py-1.5 text-xs text-contrast-content/60">
            {diffDot("defaultMarker")}Default:
            <span class="text-contrast-content"
              >{(s.defaultMarker ?? SETTING_DEFAULTS.defaultMarker)?.name ||
                "Default Marker"}</span
            >
          </div>
          <div
            class="flex items-center justify-between rounded px-2 py-1.5 hover:bg-base-200/30"
          >
            <span class="text-xs text-contrast-content">
              {diffDot("extraMarkers")}Extra markers ({((
                s.extraMarkers ??
                []
              ) || []).length})
            </span>
            <button
              type="button"
              class="relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 {(
                (s.extraMarkers ?? []) ||
                []
              ).length
                ? 'bg-primary'
                : 'bg-base-300'}"
              disabled={settingsSaving === "extraMarkers"}
              on:click={() =>
                toggleUserSetting(
                  "extraMarkers",
                  ((s.extraMarkers ?? []) || []).length
                    ? []
                    : [{ id: "custom", class: "default", name: "Custom" }],
                )}
            >
              <span
                class="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200 {(
                  (s.extraMarkers ?? []) ||
                  []
                ).length
                  ? 'translate-x-4'
                  : 'translate-x-0.5'}"
              ></span>
            </button>
          </div>
        </div>

        <!-- Section: GPS -->
        <div class="space-y-1">
          <h5
            class="text-xs font-semibold uppercase tracking-wider text-contrast-content/40"
          >
            GPS
          </h5>
          {#each GPS_BOOL_FIELDS as field}
            {@const val = s[field.col] ?? false}
            <div
              class="flex items-center justify-between rounded px-2 py-1.5 hover:bg-base-200/30"
            >
              <span class="text-xs text-contrast-content"
                >{diffDot(field.col)}{field.label}</span
              >
              <button
                type="button"
                class="relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 {val
                  ? 'bg-primary'
                  : 'bg-base-300'}"
                disabled={settingsSaving === field.col}
                on:click={() => toggleUserSetting(field.col, !val)}
              >
                <span
                  class="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200 {val
                    ? 'translate-x-4'
                    : 'translate-x-0.5'}"
                ></span>
              </button>
            </div>
          {/each}
          <div
            class="flex items-center justify-between rounded px-2 py-1.5 hover:bg-base-200/30"
          >
            <span class="text-xs text-contrast-content"
              >{diffDot("gpsIntervalSeconds")}GPS interval (s)</span
            >
            <div class="flex items-center gap-1">
              <button
                class="flex h-5 w-5 items-center justify-center rounded text-xs text-contrast-content/50 hover:bg-base-300 disabled:opacity-30"
                disabled={settingsSaving === "gpsIntervalSeconds" ||
                  getSettingVal("gpsIntervalSeconds", 2) <= 1}
                on:click={() =>
                  toggleUserSetting(
                    "gpsIntervalSeconds",
                    getSettingVal("gpsIntervalSeconds", 2) - 1,
                  )}>−</button
              >
              <span
                class="w-6 text-center text-xs font-medium text-contrast-content"
                >{getSettingVal("gpsIntervalSeconds", 2)}</span
              >
              <button
                class="flex h-5 w-5 items-center justify-center rounded text-xs text-contrast-content/50 hover:bg-base-300 disabled:opacity-30"
                disabled={settingsSaving === "gpsIntervalSeconds" ||
                  getSettingVal("gpsIntervalSeconds", 2) >= 10}
                on:click={() =>
                  toggleUserSetting(
                    "gpsIntervalSeconds",
                    getSettingVal("gpsIntervalSeconds", 2) + 1,
                  )}>+</button
              >
            </div>
          </div>
        </div>

        <!-- Section: Satellite -->
        <div class="space-y-1">
          <h5
            class="text-xs font-semibold uppercase tracking-wider text-contrast-content/40"
          >
            Satellite Imagery
          </h5>
          <div class="rounded px-2 py-1.5">
            <span class="text-xs text-contrast-content"
              >{diffDot("defaultImagerySource")}Default source:
              <span class="text-contrast-content/60"
                >{s.defaultImagerySource ?? "mapbox"}</span
              ></span
            >
          </div>
          {#each Object.entries(IMAGERY_SOURCES).filter(([, src]) => src.canBeDefault) as [key, src]}
            <div
              class="flex items-center justify-between rounded px-2 py-1.5 hover:bg-base-200/30"
            >
              <span class="text-xs text-contrast-content">{src.name}</span>
              <button
                type="button"
                class="rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors {(s.defaultImagerySource ??
                  'mapbox') === key
                  ? 'bg-primary/20 text-primary'
                  : 'text-contrast-content/40 hover:bg-base-300'}"
                disabled={settingsSaving === "defaultImagerySource"}
                on:click={() => toggleUserSetting("defaultImagerySource", key)}
              >
                {(s.defaultImagerySource ?? "mapbox") === key
                  ? "Default"
                  : "Set default"}
              </button>
            </div>
          {/each}
        </div>

        <!-- Section: Layer visibility -->
        <div class="space-y-1">
          <h5
            class="text-xs font-semibold uppercase tracking-wider text-contrast-content/40"
          >
            Layer Visibility
          </h5>
          {#if true}
          {@const lv = s.layerVisibility ?? {}}
          <div
            class="flex items-center justify-between rounded px-2 py-1.5 hover:bg-base-200/30"
          >
            <span class="text-xs text-contrast-content">
              {diffDot("layerVisibility")}Custom visibility ({Object.keys(lv || {})
                .length} layers)
            </span>
            <button
              type="button"
              class="relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 {Object.keys(
                lv || {},
              ).length > 0
                ? 'bg-primary'
                : 'bg-base-300'}"
              disabled={settingsSaving === "layerVisibility"}
              on:click={() =>
                toggleUserSetting(
                  "layerVisibility",
                  Object.keys(lv || {}).length > 0
                    ? {}
                    : { historicalTrails: false },
                )}
            >
              <span
                class="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200 {Object.keys(
                  lv || {},
                ).length > 0
                  ? 'translate-x-4'
                  : 'translate-x-0.5'}"
              ></span>
            </button>
          </div>
          {/if}
        </div>
      </div>

      <div class="modal-action mt-4 flex items-center justify-between">
        <button
          class="btn btn-outline btn-sm text-error"
          disabled={settingsSaving === "__reset__"}
          on:click={resetUserSettings}
        >
          {settingsSaving === "__reset__"
            ? "Resetting..."
            : "Reset to defaults"}
        </button>
        <button
          class="btn btn-outline btn-sm"
          on:click={() => (showUserSettingsModal = false)}>Close</button
        >
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

{#if noteModalEntry}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="modal modal-open" on:click={() => (noteModalEntry = null)}>
    <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
    <div class="modal-box max-w-md font-inter" on:click|stopPropagation>
      <div class="mb-1 flex items-center justify-between">
        <h3 class="flex items-center gap-2 text-lg font-semibold">
          <NotepadText class="h-5 w-5 text-primary" />
          Note
        </h3>
        <button
          type="button"
          class="btn btn-circle btn-ghost btn-sm"
          on:click={() => (noteModalEntry = null)}
        >
          <X class="h-4 w-4" />
        </button>
      </div>

      <p class="mb-3 text-xs text-contrast-content/60">
        {noteModalEntry.owner_name || "Unknown owner"} · {noteModalEntry.map_name ||
          "Unnamed map"}
        {#if mapNotes[noteModalEntry.master_map_id]?.updated_at}
          · last saved
          {timeAgo(mapNotes[noteModalEntry.master_map_id]?.updated_at)}
        {/if}
      </p>

      <textarea
        class="textarea textarea-bordered h-40 w-full resize-y bg-base-100 text-sm leading-relaxed text-contrast-content"
        placeholder="Add a note about this farm — anything you want to remember next time you look at it..."
        maxlength={4000}
        bind:value={noteDrafts[noteModalEntry.master_map_id]}
      ></textarea>

      <div class="mt-2 flex items-center justify-between gap-2">
        <span class="text-[10px] text-contrast-content/40">
          {(noteDrafts[noteModalEntry.master_map_id] ?? "").length}/4000
        </span>
        <span class="flex items-center gap-2">
          {#if noteIsDirty(noteModalEntry.master_map_id, noteDrafts, mapNotes)}
            <span class="text-[10px] text-warning">Unsaved changes</span>
          {/if}
          <button
            type="button"
            class="btn btn-ghost btn-sm"
            disabled={savingNoteId === noteModalEntry.master_map_id}
            on:click={() => (noteModalEntry = null)}
          >
            Cancel
          </button>
          <button
            type="button"
            class="btn btn-primary btn-sm"
            disabled={savingNoteId === noteModalEntry.master_map_id ||
              !noteIsDirty(noteModalEntry.master_map_id, noteDrafts, mapNotes)}
            on:click={saveNoteFromModal}
          >
            {#if savingNoteId === noteModalEntry.master_map_id}
              <span class="loading loading-spinner loading-xs"></span>
            {:else}
              Save note
            {/if}
          </button>
        </span>
      </div>
    </div>
  </div>
{/if}
