<!-- src/lib/components/map/vehicles/VehicleControls.svelte -->
<script>
  import { createEventDispatcher, onDestroy } from "svelte"
  import {
    userVehicleStore,
    userVehicleTrailing,
    otherVehiclesStore,
    serverOtherVehiclesData,
  } from "$lib/stores/vehicleStore"
  import {
    Activity,
    Users,
    Crosshair,
    Target,
    ChevronDown,
    ChevronUp,
    X,
    Navigation,
    Navigation2,
    Eye,
    Settings,
    MoreVertical,
    MessageSquare,
    MapPin,
    Trash2,
    History,
    ArrowRight,
    User,
    UserPlus,
    UserMinus,
    Loader2,
    Check,
    CalendarDays,
    ChevronLeft,
    ChevronRight,
    Clock,
    Move,
    Play,
  } from "lucide-svelte"
  import SVGComponents from "$lib/vehicles/index.js"
  import { userSettingsStore } from "$lib/stores/userSettingsStore"
  import { userSettingsApi } from "$lib/api/userSettingsApi"
  import { profileStore } from "$lib/stores/profileStore"
  import { toast } from "svelte-sonner"
  import TintedIconPreview from "$lib/components/map/markers/TintedIconPreview.svelte"
  import InviteToMapModal from "$lib/components/map/vehicles/InviteToMapModal.svelte"
  import { mapActivityStore } from "$lib/stores/mapActivityStore"
  import { supabase } from "$lib/stores/sessionStore"
  import { messageUnreadStore, openMessagePanel } from "$lib/stores/messageStore"
  import {
    MARKER_COLORS,
    MARKER_COLOR_DEFAULT,
  } from "$lib/components/map/markers/markerPalette"
  import { MARKER_DEFINITIONS } from "$lib/data/markerDefinitions"
  import {
    MAP_LOG_PAGE_SIZE,
    countMapLogSince,
    fetchMapLogPage,
    fetchMapLogTeamOptions,
    getMapLogLastSeen,
    setMapLogLastSeen,
  } from "$lib/api/mapLogApi"

  export let map
  export let currentSpeed = 0
  export let trackedVehicleId = null
  export let isTrackingVehicle = false
  export let isFirstPersonMode = false

  const dispatch = createEventDispatcher()

  const RECENCY_RESORT_INTERVAL_MS = 30 * 1000

  let showUnifiedMenu = false
  let sortedVehicles = []
  let sortedVehicleIds = []
  let lastSortAt = 0
  let lastPrioritySignature = ""

  // ── Tabs (Vehicles | Map Log) & panel settings ────────────────────────
  let activeTab = "vehicles"
  let showSettings = false
  let settingsPos = { left: 0, top: 0 }
  let showInviteModal = false

  // ── Map log state ─────────────────────────────────────────────────────
  let logEntries = []
  let logLoading = false
  let logLoadingMore = false
  let logHasMore = false
  let unreadCount = 0
  let unreadInterval = null
  let expandedLogId = null

  // ── Map log filters (chips, vehicle/account dropdowns, start-from) ────
  const LOG_SIMPLE_CHIPS = [
    { key: "all", label: "All" },
    { key: "markers", label: "Markers" },
    { key: "trailing", label: "Trailing" },
  ]
  const LOG_ACTION_GROUPS = {
    markers: [
      "marker.placed",
      "marker.edited",
      "marker.moved",
      "marker.deleted",
      "marker.restored",
    ],
    trailing: ["trail.started", "trail.closed", "trail.deleted"],
  }
  let logCategory = "all"
  let logStartKey = "now" // now | day
  let logDayValue = "" // YYYY-MM-DD when logStartKey === 'day'
  let showDateMenu = false
  let dateMenuPos = { left: 0, top: 0 }
  let calMonth = null // first-of-month shown in the calendar popover
  let logRefreshing = false

  // Team dropdown — filters the feed to one account's activity. Rows carry
  // each person's vehicle icon so members are easy to identify. Pairs with
  // the category chips (All / Markers / Trailing) and the calendar.
  let logActorId = null
  let showLogTeamMenu = false
  let logTeamMenuPos = { left: 0, top: 0 }
  let logTeamOptions = null
  let logTeamOptionsFetching = false

  // ── One entry per trail (collapsed lifecycle) ─────────────────────────
  // When a trail closes or is deleted, its "started" row is superseded by
  // the later entry — hide the start so each trail appears once.
  $: supersededTrailIds = new Set(
    logEntries
      .filter((e) => e.action === "trail.closed" || e.action === "trail.deleted")
      .map((e) => e.entity_id),
  )
  $: visibleLogEntries = logEntries.filter(
    (e) => !(e.action === "trail.started" && supersededTrailIds.has(e.entity_id)),
  )
  $: startedTrailEntries = new Map(
    logEntries
      .filter((e) => e.action === "trail.started")
      .map((e) => [e.entity_id, e]),
  )

  // ── Row options menu (⋮) ──────────────────────────────────────────────
  let openMenuVehicleId = null
  let openMenuPos = { left: 0, top: 0 }
  $: openMenuVehicle = openMenuVehicleId
    ? sortedVehicles.find((v) => v.id === openMenuVehicleId) ||
      getVehicleById(openMenuVehicleId)
    : null

  // Per-user "show vehicles always" — offscreen tracking dots at the map edge.
  $: showVehiclesAlways = $userSettingsStore?.showVehiclesAlways ?? true

  async function toggleShowVehiclesAlways() {
    const next = !showVehiclesAlways
    userSettingsStore.update((s) => ({ ...s, showVehiclesAlways: next }))
    try {
      const result = await userSettingsApi.updateShowVehiclesAlways(next)
      if (!result?.success) {
        userSettingsStore.update((s) => ({ ...s, showVehiclesAlways: !next }))
      }
    } catch {
      userSettingsStore.update((s) => ({ ...s, showVehiclesAlways: !next }))
    }
  }

  // ── Map log data (tab badge + feed) ───────────────────────────────────
  function getMasterMapId() {
    return $profileStore?.master_map_id || null
  }

  async function refreshUnreadCount() {
    const mapId = getMasterMapId()
    const profileId = $profileStore?.id
    if (!mapId || !profileId) return

    const lastSeen = getMapLogLastSeen(profileId)
    if (!lastSeen) {
      // First ever look — baseline "now" so only genuinely new activity counts.
      setMapLogLastSeen(profileId)
      unreadCount = 0
      return
    }

    const count = await countMapLogSince(mapId, lastSeen)
    unreadCount = Math.max(0, count)
  }

  function markLogSeen() {
    const profileId = $profileStore?.id
    if (profileId) setMapLogLastSeen(profileId)
    unreadCount = 0
  }

  // ── Log filters ───────────────────────────────────────────────────────
  function startOfLocalDay(daysAgo = 0) {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo)
  }

  function parseLogDay(value) {
    const [y, m, d] = String(value).split("-").map(Number)
    if (!y || !m || !d) return null
    return new Date(y, m - 1, d)
  }

  /** "Start from" point as an ISO instant — null means from the newest entry. */
  function getLogSinceIso() {
    switch (logStartKey) {
      case "day": {
        const day = parseLogDay(logDayValue)
        return day ? day.toISOString() : null
      }
      default:
        return null // "now" — the full newest-first feed
    }
  }

  function getLogQuery() {
    const actions = LOG_ACTION_GROUPS[logCategory] || null
    return { since: getLogSinceIso(), actions, actorId: logActorId }
  }

  function getLogStartLabel() {
    switch (logStartKey) {
      case "day": {
        const day = parseLogDay(logDayValue)
        return day
          ? day.toLocaleDateString("en-AU", { day: "numeric", month: "short" })
          : "Pick a day"
      }
      default:
        return "Now"
    }
  }

  function setLogCategory(key) {
    if (logCategory === key) return
    logCategory = key
    reloadLogWithFilters()
  }

  function resetLogFilters() {
    logCategory = "all"
    logStartKey = "now"
    logDayValue = ""
    logActorId = null
    reloadLogWithFilters()
  }

  // Reload page 1 for the current filters. The old list stays visible (dimmed)
  // until the new page lands, so switching chips never flashes empty.
  async function reloadLogWithFilters() {
    if (logRefreshing) return
    logRefreshing = true
    expandedLogId = null
    try {
      await loadLogPage()
    } finally {
      logRefreshing = false
    }
  }

  function positionLogMenu(event, menuWidth, menuHeight) {
    const rect = event.currentTarget.getBoundingClientRect()
    let left = rect.right - menuWidth
    left = Math.max(8, Math.min(left, window.innerWidth - menuWidth - 8))
    let top = rect.bottom + 6
    if (top + menuHeight > window.innerHeight - 8) {
      top = Math.max(8, rect.top - menuHeight - 6)
    }
    return { left, top }
  }

  // ── Team dropdown (activity made by one account) ──────────────────────
  async function toggleLogTeamMenu(event) {
    if (showLogTeamMenu) {
      showLogTeamMenu = false
      return
    }
    logTeamMenuPos = positionLogMenu(event, 224, 300)
    showLogTeamMenu = true
    showDateMenu = false
    closeRowMenu()
    showSettings = false
    ensureLogTeamOptions()
  }

  async function ensureLogTeamOptions() {
    if (logTeamOptionsFetching) return
    const mapId = getMasterMapId()
    if (!mapId || logTeamOptions) return
    logTeamOptionsFetching = true
    try {
      logTeamOptions = await fetchMapLogTeamOptions(mapId)
    } catch (error) {
      console.warn("Failed to load team filter options:", error)
      if (!logTeamOptions) logTeamOptions = []
    } finally {
      logTeamOptionsFetching = false
    }
  }

  function setLogActor(actorId) {
    showLogTeamMenu = false
    logActorId = actorId || null
    reloadLogWithFilters()
  }

  function getLogTeamChipLabel() {
    if (logActorId) {
      const option = (logTeamOptions || []).find(
        (o) => o.actorId === logActorId,
      )
      return option?.name || "Team"
    }
    return "Team"
  }

  // ── Calendar popover (opens instantly from the date chip) ────────────
  function openCalendarMenu(event) {
    if (showDateMenu) {
      showDateMenu = false
      return
    }
    // Open on the month of the selected date, or the current month.
    const selected = logStartKey === "day" ? parseLogDay(logDayValue) : null
    const base = selected || new Date()
    calMonth = new Date(base.getFullYear(), base.getMonth(), 1)
    dateMenuPos = positionLogMenu(event, 232, 296)
    showDateMenu = true
    showLogTeamMenu = false
    closeRowMenu()
    showSettings = false
  }

  function calShiftMonth(delta) {
    if (!calMonth) return
    const next = new Date(
      calMonth.getFullYear(),
      calMonth.getMonth() + delta, 1,
    )
    const now = new Date()
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    if (next > currentMonth) return // activity can't be in the future
    calMonth = next
  }

  function buildCalendarCells(monthDate) {
    const year = monthDate.getFullYear()
    const month = monthDate.getMonth()
    const leading = (new Date(year, month, 1).getDay() + 6) % 7 // Monday first
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const today = startOfLocalDay(0)
    const cells = []
    for (let i = 0; i < leading; i++) cells.push(null)
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day)
      cells.push({
        day,
        iso: `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        future: date.getTime() > today.getTime(),
        today: date.getTime() === today.getTime(),
      })
    }
    return cells
  }

  $: calendarCells = calMonth ? buildCalendarCells(calMonth) : []
  $: calendarTitle = calMonth
    ? calMonth.toLocaleDateString("en-AU", { month: "long", year: "numeric" })
    : ""

  function pickCalendarDay(cell) {
    if (!cell || cell.future) return
    logDayValue = cell.iso
    logStartKey = "day"
    showDateMenu = false
    reloadLogWithFilters()
  }

  function clearLogDate() {
    logStartKey = "now"
    showDateMenu = false
    reloadLogWithFilters()
  }

  function handlePanelScroll() {
    closeRowMenu()
    showDateMenu = false
    showLogTeamMenu = false
  }

  // Infinite scroll — auto-load the next page as the sentinel scrolls into
  // view (replaces the old "Load older activity" button).
  function infiniteScroll(node) {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) maybeLoadOlder()
      },
      { rootMargin: "200px 0px" },
    )
    observer.observe(node)
    return { destroy: () => observer.disconnect() }
  }

  function maybeLoadOlder() {
    if (!logHasMore || logLoading || logLoadingMore || logRefreshing) return
    loadLogPage({ append: true })
  }

  async function loadLogPage({ append = false } = {}) {
    const mapId = getMasterMapId()
    if (!mapId) return false

    if (append) {
      logLoadingMore = true
    } else {
      logLoading = true
    }

    const filters = getLogQuery()
    try {
      const entries = await fetchMapLogPage(mapId, {
        limit: MAP_LOG_PAGE_SIZE,
        beforeId:
          append && logEntries.length
            ? logEntries[logEntries.length - 1].id
            : undefined,
        since: filters.since,
        actions: filters.actions,
        actorId: filters.actorId,
      })
      logEntries = append ? [...logEntries, ...entries] : entries
      logHasMore = entries.length === MAP_LOG_PAGE_SIZE
      return true
    } catch (error) {
      console.warn("Failed to load map log:", error)
      return false
    } finally {
      logLoading = false
      logLoadingMore = false
    }
  }

  // While the log tab is open, merge in anything new without collapsing
  // previously loaded ("Load older") history.
  async function pollLogFeed() {
    const mapId = getMasterMapId()
    if (!mapId) return
    try {
      const filters = getLogQuery()
      const page = await fetchMapLogPage(mapId, {
        limit: MAP_LOG_PAGE_SIZE,
        since: filters.since,
        actions: filters.actions,
        actorId: filters.actorId,
      })
      const existingIds = new Set(logEntries.map((entry) => entry.id))
      const fresh = page.filter((entry) => !existingIds.has(entry.id))
      if (fresh.length > 0) {
        logEntries = [...fresh, ...logEntries]
      }
      markLogSeen()
    } catch (error) {
      console.warn("Failed to refresh map log:", error)
    }
  }

  async function selectTab(tab) {
    activeTab = tab
    showSettings = false
    showDateMenu = false
    showLogTeamMenu = false
    closeRowMenu()
    if (tab === "log") {
      if (logEntries.length > 0) {
        // Already loaded — merge any new entries silently (no reload flicker).
        pollLogFeed()
      } else if (!logLoading) {
        const ok = await loadLogPage()
        if (ok) markLogSeen()
      }
      // If a prefetch is already in flight, its completion marks it seen
      // (see startUnreadPolling) — the tab has already switched.
    }
  }

  function startUnreadPolling() {
    stopUnreadPolling()
    refreshUnreadCount()
    // Preload the feed so switching to the Map Log tab shows content
    // immediately instead of a loading flash.
    if (logEntries.length === 0) {
      loadLogPage().then((ok) => {
        if (ok && activeTab === "log") markLogSeen()
      })
    }
    unreadInterval = setInterval(async () => {
      if (activeTab === "log") {
        if (unreadCount > 0) {
          await pollLogFeed()
        } else {
          await refreshUnreadCount()
        }
      } else {
        await refreshUnreadCount()
      }
    }, 30000)
  }

  function stopUnreadPolling() {
    if (unreadInterval) {
      clearInterval(unreadInterval)
      unreadInterval = null
    }
  }

  onDestroy(() => stopUnreadPolling())

  // Poll the feed while the menu is open; reset transient UI when it closes.
  $: handleMenuVisibility(showUnifiedMenu)
  function handleMenuVisibility(open) {
    if (open) {
      startUnreadPolling()
    } else {
      stopUnreadPolling()
      closeRowMenu()
      showSettings = false
      showDateMenu = false
      showLogTeamMenu = false
    }
  }

  // ── Row options menu (track / track+rotation / message) ───────────────
  function toggleRowMenu(event, vehicleId) {
    if (openMenuVehicleId === vehicleId) {
      closeRowMenu()
      return
    }
    const rect = event.currentTarget.getBoundingClientRect()
    const MENU_W = 220
    const MENU_H = 178
    let left = rect.right - MENU_W
    left = Math.max(8, Math.min(left, window.innerWidth - MENU_W - 8))
    let top = rect.bottom + 6
    if (top + MENU_H > window.innerHeight - 8) {
      top = Math.max(8, rect.top - MENU_H - 6)
    }
    openMenuPos = { left, top }
    openMenuVehicleId = vehicleId
  }

  function closeRowMenu() {
    openMenuVehicleId = null
  }

  function toggleLogEntry(id) {
    expandedLogId = expandedLogId === id ? null : id
  }

  function toggleSettingsMenu(event) {
    if (showSettings) {
      showSettings = false
      return
    }
    const rect = event.currentTarget.getBoundingClientRect()
    const MENU_W = 232
    const MENU_H = 96
    let left = rect.right - MENU_W
    left = Math.max(8, Math.min(left, window.innerWidth - MENU_W - 8))
    let top = rect.bottom + 6
    if (top + MENU_H > window.innerHeight - 8) {
      top = Math.max(8, rect.top - MENU_H - 6)
    }
    settingsPos = { left, top }
    showSettings = true
    closeRowMenu()
  }

  function handleWindowClick() {
    closeRowMenu()
    showSettings = false
    showDateMenu = false
    showLogTeamMenu = false
  }

  function handleWindowKeydown(event) {
    if (event.key === "Escape") {
      closeRowMenu()
      showSettings = false
      showDateMenu = false
      showLogTeamMenu = false
    }
  }

  function menuTrackVehicle(withRotation) {
    const vehicleId = openMenuVehicleId
    closeRowMenu()
    if (!vehicleId) return
    startTrackingVehicle(vehicleId, withRotation ? { rotation: true } : {})
  }

  function menuToggleRotation() {
    closeRowMenu()
    dispatch("toggleFirstPerson")
  }

  function menuStopTracking() {
    closeRowMenu()
    stopTrackingVehicle()
  }

  async function menuRemoveGuest() {
    const vehicle = openMenuVehicle
    closeRowMenu()
    if (!vehicle?.id) return

    const name = getSafeVehicleName(vehicle)
    try {
      const { error } = await supabase.rpc("revoke_guest_access", {
        p_user_id: vehicle.id,
      })
      if (error) throw error

      // Drop them from the local lists immediately — the RPC deletes their
      // vehicle_state row, so nothing should bring them back.
      otherVehiclesStore.update((list) =>
        list.filter((v) => v.vehicle_id !== vehicle.id),
      )
      serverOtherVehiclesData.update((list) =>
        list.filter((v) => v.vehicle_id !== vehicle.id),
      )
      mapActivityStore.update((state) => ({
        ...state,
        connected_profiles: (state.connected_profiles || []).filter(
          (p) => p.id !== vehicle.id,
        ),
        vehicle_states: (state.vehicle_states || []).filter(
          (v) => v.vehicle_id !== vehicle.id,
        ),
      }))

      toast.success(`Removed ${name}'s guest access`, {
        description: "They no longer have access to this map.",
      })
    } catch (e) {
      toast.error("Could not remove guest access", {
        description: e?.message || "Please try again.",
      })
    }
  }

  function menuSendMessage() {
    const vehicle = openMenuVehicle
    closeRowMenu()
    if (!vehicle?.id || vehicle.isCurrentUser) return
    openMessagePanel({ id: vehicle.id, name: getSafeVehicleName(vehicle) })
  }

  // ── Map log presentation helpers ──────────────────────────────────────
  // The app's trail swoosh (same art as the record button).
  const TRAIL_ICON_PATH =
    "M30.165 30.887c-1.604 0.076-21.522-0.043-21.522-0.043-12.101-12.151 18.219-16.173-0.521-26.154l-1.311 1.383-1.746-4.582 5.635 0.439-1.128 1.267c23.438 6.83-3.151 19.631 20.594 27.69v0z"

  const markerDefLookup = new Map(
    MARKER_DEFINITIONS.map((def) => [iconKeyForDefinition(def), def]),
  )

  function iconKeyForDefinition(def) {
    if (!def || def.id === "default") return "default"
    if (def.class?.startsWith("custom-svg")) return `custom-svg-${def.id}`
    if (def.class?.startsWith("ionic-")) return `ionic-${def.id}`
    return def.class || "default"
  }

  /** Log icon string → marker definition usable by TintedIconPreview. */
  function getMarkerIconDef(iconKey) {
    if (!iconKey) return null
    if (iconKey === "default")
      return { id: "default", class: "default", name: "Default Marker" }
    const def = markerDefLookup.get(iconKey)
    if (def) return { id: def.id, class: def.class, name: def.name }
    // Legacy icons no longer in the picker — still renderable if they have art.
    if (iconKey.startsWith("custom-svg-")) {
      return { id: iconKey.slice(11), class: "custom-svg" }
    }
    if (iconKey.startsWith("ionic-")) {
      return { id: iconKey.slice(6), class: iconKey }
    }
    return null
  }

  function getIconDisplayName(iconKey) {
    if (!iconKey || iconKey === "default") return "Default Marker"
    const def = markerDefLookup.get(iconKey)
    if (def?.name) return def.name
    const raw = iconKey
      .replace(/^(custom-svg-|ionic-|at-)/, "")
      .replace(/[_-]+/g, " ")
      .trim()
    return raw.replace(/\b\w/g, (m) => m.toUpperCase())
  }

  function getMarkerColorKey(value) {
    if (!value || value === "random") return MARKER_COLOR_DEFAULT
    return MARKER_COLORS.some((c) => c.key === value)
      ? value
      : MARKER_COLOR_DEFAULT
  }

  function getVehicleIconByType(type) {
    if (!type) return null
    return SVGComponents[type] || SVGComponents.SimpleTractor || null
  }

  function getLogVehicleIcon(entry) {
    return getVehicleIconByType(entry?.details?.vehicle_type)
  }

  function isMarkerAction(action) {
    return typeof action === "string" && action.startsWith("marker.")
  }

  function isTrailAction(action) {
    return typeof action === "string" && action.startsWith("trail.")
  }

  function getActionIcon(action) {
    if (action === "marker.placed") return MapPin
    if (action === "marker.deleted") return Trash2
    if (action === "marker.restored") return History
    if (action === "marker.moved") return Move
    if (action === "operator.changed") return User
    return Activity
  }

  function getActionTint(action) {
    if (action === "marker.placed") return "text-emerald-300"
    if (action === "marker.deleted") return "text-red-300"
    if (action === "marker.restored") return "text-emerald-200"
    if (action === "trail.started") return "text-green-300"
    if (action === "trail.closed") return "text-emerald-200"
    if (action === "trail.deleted") return "text-red-300"
    if (action === "marker.moved") return "text-amber-300"
    if (action === "marker.edited") return "text-sky-300"
    if (action === "vehicle.changed") return "text-violet-300"
    if (action === "operator.changed") return "text-purple-300"
    return "text-white/60"
  }

  function formatDuration(seconds) {
    const s = Math.max(0, Number(seconds) || 0)
    if (s < 60) return "under a minute"
    if (s < 3600) return `${Math.floor(s / 60)}m`
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    return m === 0 ? `${h}h` : `${h}h ${m}m`
  }

  function formatAbsoluteTime(iso) {
    if (!iso) return ""
    return new Date(iso).toLocaleString("en-AU", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    })
  }

  function formatLogTime(iso) {
    if (!iso) return ""
    const ts = new Date(iso).getTime()
    const diff = Date.now() - ts
    const minutes = Math.floor(diff / 60000)
    if (minutes < 1) return "just now"
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}d ago`
    return new Date(iso).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
    })
  }

  /** Expansion rows — only fields that exist on the entry. */
  function getLogDetailRows(entry) {
    const d = entry.details || {}
    const rows = []
    const trailClosed = entry.action === "trail.closed"
    const trailCompleted = entry.action === "trail.started" && d.completed === true

    if (trailClosed || trailCompleted) {
      // Start → finish → duration, grouped right at the top.
      const startedAt = trailClosed
        ? startedTrailEntries.get(entry.entity_id)?.occurred_at
        : entry.occurred_at
      const finishedAt = trailClosed ? entry.occurred_at : d.closed_at
      if (startedAt)
        rows.push({ label: "Started", value: formatAbsoluteTime(startedAt) })
      if (finishedAt)
        rows.push({ label: "Finished", value: formatAbsoluteTime(finishedAt) })
      if (d.duration_s != null)
        rows.push({ label: "Duration", value: formatDuration(d.duration_s) })
    } else {
      rows.push({ label: "Time", value: formatAbsoluteTime(entry.occurred_at) })
    }

    if (isMarkerAction(entry.action)) {
      const iconChanged =
        entry.action === "marker.edited" &&
        d.from_icon &&
        d.from_icon !== d.icon
      if (iconChanged) {
        rows.push({
          label: "Icon changed",
          value: `${getIconDisplayName(d.from_icon)} → ${getIconDisplayName(d.icon)}`,
        })
      } else if (d.icon) {
        rows.push({ label: "Marker", value: getIconDisplayName(d.icon) })
      }
      if (
        entry.action === "marker.edited" &&
        d.from_marker_color &&
        d.from_marker_color !== d.marker_color
      ) {
        rows.push({
          label: "Colour changed",
          value: `${d.from_marker_color} → ${d.marker_color}`,
        })
      } else if (d.marker_color && d.marker_color !== "default") {
        rows.push({ label: "Colour", value: d.marker_color })
      }
      // Style (tint_mode) is deliberately not shown — still recorded server-side.
      if (d.lat != null && d.lng != null) {
        rows.push({
          label: "Position",
          value: `${Number(d.lat).toFixed(5)}, ${Number(d.lng).toFixed(5)}`,
        })
      }
      if (
        entry.action === "marker.moved" &&
        d.from_lat != null &&
        d.from_lng != null
      ) {
        rows.push({
          label: "Moved from",
          value: `${Number(d.from_lat).toFixed(5)}, ${Number(d.from_lng).toFixed(5)}`,
        })
      }
    }

    if (isTrailAction(entry.action)) {
      if (d.operation_name)
        rows.push({ label: "Operation", value: d.operation_name })
      if (d.vehicle_type) {
        rows.push({
          label: "Vehicle",
          value: getVehicleDisplayName({ vehicle_marker: { type: d.vehicle_type } }),
        })
      }
      if (d.vehicle_swath != null)
        rows.push({ label: "Swath", value: `${d.vehicle_swath}m` })
      if (d.vehicle_body_color)
        rows.push({ label: "Machine colour", value: d.vehicle_body_color })
      if (d.operator_name)
        rows.push({ label: "Operator", value: d.operator_name })
      if (d.trail_color)
        rows.push({ label: "Trail colour", value: d.trail_color })
      if (d.trail_width != null)
        rows.push({ label: "Trail width", value: `${d.trail_width}m` })
    }

    // Completed trails carry their metrics (copied onto the start entry when
    // the trail closes). Start/finish/duration already sit at the top.
    if (trailClosed || trailCompleted) {
      if (trailCompleted) {
        rows.push({
          label: "Status",
          value: d.auto_closed ? "Auto-closed (idle)" : "Completed",
        })
      }
      if (d.trail_distance != null) {
        rows.push({
          label: "Distance",
          value: `${(Number(d.trail_distance) / 1000).toFixed(2)} km`,
        })
      }
      if (d.trail_hectares != null) {
        rows.push({ label: "Area", value: `${Number(d.trail_hectares).toFixed(1)} ha` })
      }
      if (d.trail_percentage_overlap != null) {
        rows.push({ label: "Overlap", value: `${d.trail_percentage_overlap}%` })
      }
    }

    if (entry.action === "vehicle.changed") {
      const typeChanged =
        d.from_vehicle_type && d.from_vehicle_type !== d.vehicle_type
      if (d.vehicle_type) {
        rows.push({
          label: typeChanged ? "Vehicle changed" : "Vehicle",
          value: typeChanged
            ? `${getVehicleDisplayName({ vehicle_marker: { type: d.from_vehicle_type } })} → ${getVehicleDisplayName({ vehicle_marker: { type: d.vehicle_type } })}`
            : getVehicleDisplayName({ vehicle_marker: { type: d.vehicle_type } }),
        })
      }
      const colorChanged =
        d.from_vehicle_body_color &&
        d.from_vehicle_body_color !== d.vehicle_body_color
      if (d.vehicle_body_color) {
        rows.push({
          label: colorChanged ? "Colour changed" : "Machine colour",
          value: colorChanged
            ? `${d.from_vehicle_body_color} → ${d.vehicle_body_color}`
            : d.vehicle_body_color,
        })
      }
      const swathChanged =
        d.from_vehicle_swath != null &&
        String(d.from_vehicle_swath) !== String(d.vehicle_swath)
      if (d.vehicle_swath != null) {
        rows.push({
          label: swathChanged ? "Swath changed" : "Swath",
          value: swathChanged
            ? `${d.from_vehicle_swath}m → ${d.vehicle_swath}m`
            : `${d.vehicle_swath}m`,
        })
      }
    }

    if (entry.action === "operator.changed") {
      const changed =
        d.from_operator_name && d.from_operator_name !== d.operator_name
      rows.push({
        label: changed ? "Operator changed" : "Operator",
        value: changed
          ? `${d.from_operator_name} → ${d.operator_name}`
          : d.operator_name || "—",
      })
    }

    if (entry.source === "system") rows.push({ label: "Source", value: "Automatic" })
    return rows
  }

  /** Replayable trail? Completed starts + closes get a "Show trail" action. */
  function canShowTrail(entry) {
    if (entry.entity_type !== "trail") return false
    if (entry.action === "trail.closed") return true
    return entry.action === "trail.started" && entry.details?.completed === true
  }

  function handleShowTrail(entry) {
    dispatch("viewTrail", { trailId: entry.entity_id })
    // The replay panel docks along the bottom of the screen — collapse the
    // menu so it isn't sitting behind it.
    closeUnifiedMenu()
  }

  /** Marker events carry the marker's position in details. */
  function getEntryPosition(entry) {
    const d = entry.details || {}
    if (d.lng == null || d.lat == null) return null
    return { lng: Number(d.lng), lat: Number(d.lat) }
  }

  /** Fly the map to a log entry's recorded position. */
  function locateLogPosition(pos) {
    if (!map || pos?.lng == null || pos?.lat == null) return
    map.flyTo({
      center: [Number(pos.lng), Number(pos.lat)],
      zoom: Math.max(map.getZoom(), 17),
      duration: 800,
    })
  }

  /**
   * Trail log entries record the vehicle in details — zoom to where that
   * vehicle is right now (with a friendly toast when it isn't live).
   */
  function locateTrailVehicle(entry) {
    const vehicleId = entry?.details?.vehicle_id
    const vehicle = vehicleId ? getVehicleById(vehicleId) : null

    if (!vehicle) {
      toast.info("That vehicle isn't on the map right now", {
        description: "You can still replay its trail from this entry.",
      })
      return
    }
    if (!parseCoordinates(vehicle.coordinates)) {
      toast.info("No location yet for this vehicle", {
        description: "It'll appear once it sends its first GPS fix.",
      })
      return
    }

    dispatch("zoomToVehicle", { vehicle })
  }

  function getSafeArray(value) {
    return Array.isArray(value) ? value : []
  }

  function getSafeVehicleName(vehicle, fallback = "Unknown") {
    const rawName = vehicle?.full_name || vehicle?.name || fallback
    const name = String(rawName || fallback).trim()
    return name || fallback
  }

  function normalizeVehicle(vehicle, fallbackName = "Unknown") {
    if (!vehicle) return null
    const id = vehicle.id || vehicle.vehicle_id || null
    return {
      ...vehicle,
      id,
      vehicle_id: vehicle.vehicle_id || id,
      full_name: getSafeVehicleName(vehicle, fallbackName),
      vehicle_marker: vehicle.vehicle_marker || { type: "Pointer" },
      is_trailing: Boolean(vehicle.is_trailing),
      isCurrentUser: Boolean(vehicle.isCurrentUser),
    }
  }

  function truncateName(name, maxLength = 15) {
    const safeName = String(name || "Unknown")
    if (typeof window !== "undefined" && window.innerWidth < 640) {
      if (safeName.length > maxLength) {
        return safeName.substring(0, maxLength - 3) + "..."
      }
    }
    return safeName
  }

  function parseCoordinates(coords) {
    if (!coords) return null
    if (
      typeof coords === "object" &&
      Number.isFinite(Number(coords.latitude)) &&
      Number.isFinite(Number(coords.longitude))
    ) {
      return { latitude: coords.latitude, longitude: coords.longitude }
    }
    if (typeof coords === "string") {
      const cleanedCoords = coords.slice(1, -1)
      const [longitude, latitude] = cleanedCoords.split(",").map(parseFloat)
      return { latitude: latitude, longitude: longitude }
    }
    return null
  }

  function isVehicleOnline(vehicle) {
    if (!vehicle?.last_update) return false
    let timestampMs
    if (typeof vehicle.last_update === "string") {
      timestampMs = new Date(vehicle.last_update).getTime()
    } else {
      timestampMs = vehicle.last_update
    }
    const now = Date.now()
    const diff = now - timestampMs
    const fiveMinutes = 5 * 60 * 1000
    return diff < fiveMinutes
  }

  function getVehicleById(vehicleId) {
    if (vehicleId === $userVehicleStore.vehicle_id) {
      return normalizeVehicle(
        {
          id: $userVehicleStore.vehicle_id,
          full_name: "You",
          vehicle_marker: $userVehicleStore.vehicle_marker,
          coordinates: $userVehicleStore.coordinates,
          heading: $userVehicleStore.heading,
          is_trailing: $userVehicleTrailing,
          last_update: $userVehicleStore.last_update,
          isCurrentUser: true,
        },
        "You",
      )
    }
    const otherVehicle = getSafeArray($otherVehiclesStore).find(
      (vehicle) => vehicle.vehicle_id === vehicleId,
    )
    if (otherVehicle) {
      return normalizeVehicle(
        {
          ...otherVehicle,
          id: otherVehicle.vehicle_id,
          isCurrentUser: false,
        },
        "Unknown Operator",
      )
    }
    return null
  }

  function getVehicleTimestamp(vehicle) {
    if (!vehicle?.last_update) return 0
    return typeof vehicle.last_update === "string"
      ? new Date(vehicle.last_update).getTime()
      : vehicle.last_update || 0
  }

  function getRecencyBucket(vehicle) {
    const timestamp = getVehicleTimestamp(vehicle)
    if (!timestamp) return 5

    const age = Date.now() - timestamp
    if (age < 30 * 1000) return 0
    if (age < 2 * 60 * 1000) return 1
    if (age < 10 * 60 * 1000) return 2
    if (age < 60 * 60 * 1000) return 3
    return 4
  }

  function getStableVehicleLabel(vehicle) {
    return `${getSafeVehicleName(vehicle)} ${getVehicleDisplayName(vehicle)}`
      .trim()
      .toLowerCase()
  }

  function buildVehicleList() {
    const currentVehicle = normalizeVehicle(
      {
        id: $userVehicleStore.vehicle_id,
        full_name: "You",
        vehicle_marker: $userVehicleStore.vehicle_marker,
        coordinates: $userVehicleStore.coordinates,
        heading: $userVehicleStore.heading,
        speed: currentSpeed,
        is_trailing: $userVehicleTrailing,
        last_update: $userVehicleStore.last_update,
        isCurrentUser: true,
      },
      "You",
    )

    const otherVehicles = getSafeArray($otherVehiclesStore)
      .map((vehicle) =>
        normalizeVehicle(
          {
            ...vehicle,
            id: vehicle.vehicle_id,
            isCurrentUser: false,
          },
          "Unknown Operator",
        ),
      )
      .filter(Boolean)

    return [currentVehicle, ...otherVehicles].filter((vehicle) => {
      if (!vehicle?.id) return false
      // Vehicles without a GPS fix yet (e.g. guests who just joined) still
      // belong in the list — they just can't be located until a fix arrives.
      return true
    })
  }

  function getPrioritySignature(vehicles) {
    return vehicles
      .map((vehicle) => ({
        id: vehicle.id,
        tracked: vehicle.id === trackedVehicleId,
        current: Boolean(vehicle.isCurrentUser),
        online: isVehicleOnline(vehicle),
        trailing: Boolean(vehicle.is_trailing),
      }))
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))
      .map(
        (vehicle) =>
          `${vehicle.id}:${vehicle.tracked ? 1 : 0}:${vehicle.current ? 1 : 0}:${vehicle.online ? 1 : 0}:${vehicle.trailing ? 1 : 0}`,
      )
      .join("|")
  }

  function calculateSortedVehicles(vehicles = buildVehicleList()) {
    const previousOrder = new Map(
      sortedVehicleIds.map((vehicleId, index) => [vehicleId, index]),
    )

    return [...vehicles].sort((a, b) => {
      const aOnline = isVehicleOnline(a)
      const bOnline = isVehicleOnline(b)
      const aTrailing = Boolean(a.is_trailing)
      const bTrailing = Boolean(b.is_trailing)
      const aTime = getVehicleTimestamp(a)
      const bTime = getVehicleTimestamp(b)

      if (a.id === trackedVehicleId) return -1
      if (b.id === trackedVehicleId) return 1

      if (a.isCurrentUser && !b.isCurrentUser) return -1
      if (b.isCurrentUser && !a.isCurrentUser) return 1

      const aOnlineTrailing = aOnline && aTrailing
      const bOnlineTrailing = bOnline && bTrailing

      if (aOnlineTrailing && !bOnlineTrailing) return -1
      if (bOnlineTrailing && !aOnlineTrailing) return 1

      if (aOnline && !bOnline) return -1
      if (bOnline && !aOnline) return 1

      if (aTrailing && !bTrailing) return -1
      if (bTrailing && !aTrailing) return 1

      const aRecencyBucket = getRecencyBucket(a)
      const bRecencyBucket = getRecencyBucket(b)

      if (aRecencyBucket !== bRecencyBucket) {
        return aRecencyBucket - bRecencyBucket
      }

      const aPreviousIndex = previousOrder.has(a.id)
        ? previousOrder.get(a.id)
        : Number.POSITIVE_INFINITY
      const bPreviousIndex = previousOrder.has(b.id)
        ? previousOrder.get(b.id)
        : Number.POSITIVE_INFINITY

      if (aPreviousIndex !== bPreviousIndex) {
        return aPreviousIndex - bPreviousIndex
      }

      if (aTime !== bTime) return bTime - aTime

      return getStableVehicleLabel(a).localeCompare(getStableVehicleLabel(b))
    })
  }

  function refreshSortedVehicles() {
    const vehicles = buildVehicleList()
    const prioritySignature = getPrioritySignature(vehicles)
    const now = Date.now()
    const shouldResort =
      sortedVehicleIds.length === 0 ||
      prioritySignature !== lastPrioritySignature ||
      now - lastSortAt >= RECENCY_RESORT_INTERVAL_MS

    if (shouldResort) {
      sortedVehicles = calculateSortedVehicles(vehicles)
      sortedVehicleIds = sortedVehicles.map((vehicle) => vehicle.id)
      lastPrioritySignature = prioritySignature
      lastSortAt = now
      return
    }

    const vehiclesById = new Map(
      vehicles.map((vehicle) => [vehicle.id, vehicle]),
    )
    const orderedVehicles = sortedVehicleIds
      .map((vehicleId) => vehiclesById.get(vehicleId))
      .filter(Boolean)
    const orderedVehicleIds = new Set(
      orderedVehicles.map((vehicle) => vehicle.id),
    )
    const newVehicles = vehicles.filter(
      (vehicle) => !orderedVehicleIds.has(vehicle.id),
    )

    sortedVehicles = [
      ...orderedVehicles,
      ...calculateSortedVehicles(newVehicles),
    ]
    sortedVehicleIds = sortedVehicles.map((vehicle) => vehicle.id)
  }

  function toggleUnifiedMenu() {
    if (showUnifiedMenu) {
      showUnifiedMenu = false
      return
    }

    try {
      refreshSortedVehicles()
    } catch (error) {
      console.error("Failed to prepare vehicle menu", error)
      sortedVehicles = []
      sortedVehicleIds = []
      lastPrioritySignature = ""
      lastSortAt = 0
    }
    showUnifiedMenu = true
  }

  // Refresh row data live, but only reorder immediately when priority state changes.
  // Explicitly reference stores so Svelte tracks them as dependencies
  $: if (
    showUnifiedMenu &&
    ($otherVehiclesStore || true) &&
    ($userVehicleStore || true) &&
    currentSpeed !== undefined
  ) {
    refreshSortedVehicles()
  }

  function closeUnifiedMenu() {
    showUnifiedMenu = false
  }

  function stopTrackingAndClose() {
    dispatch("stopTracking")
    showUnifiedMenu = false
  }

  function startTrackingVehicle(vehicleId, options = {}) {
    dispatch("startTracking", { vehicleId, ...options })
    // Menu stays open so user can see tracking status
  }

  function stopTrackingVehicle() {
    dispatch("stopTracking")
    showUnifiedMenu = false
  }

  function toggleFirstPersonMode() {
    dispatch("toggleFirstPerson")
  }

  function zoomToVehicle(vehicle) {
    dispatch("zoomToVehicle", { vehicle })
    showUnifiedMenu = false
  }

  function zoomToTrackedVehicleInstant() {
    if (trackedVehicle) {
      dispatch("instantZoomToVehicle", { vehicle: trackedVehicle })
    }
  }

  function formatLastUpdate(timestamp) {
    if (!timestamp) return "Unknown"
    let timestampMs =
      typeof timestamp === "string" ? new Date(timestamp).getTime() : timestamp
    const now = Date.now()
    const diff = now - timestampMs
    const minutes = Math.floor(diff / (1000 * 60))
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)
    if (days > 0) return `${days}d ago`
    if (hours > 0) return `${hours}h ago`
    if (minutes > 0) return `${minutes}m ago`
    return "Just now"
  }

  function getOfflineLabel(vehicle) {
    if (isVehicleOnline(vehicle)) return ""
    return "\u00B7 " + formatLastUpdate(vehicle.last_update)
  }

  function formatTrailingDuration(vehicle) {
    if (!vehicle?.trailing_since) return ""
    const ts =
      typeof vehicle.trailing_since === "string"
        ? new Date(vehicle.trailing_since).getTime()
        : vehicle.trailing_since
    const diff = Date.now() - ts
    const mins = Math.floor(diff / 60000)
    const hrs = Math.floor(mins / 60)
    if (hrs > 0) return `${hrs}h ${mins % 60}m`
    return `${mins}m`
  }

  function getVehicleDisplayName(vehicle) {
    const vehicleType = vehicle?.vehicle_marker?.type || "Vehicle"
    const shortNames = {
      FourWheelDriveTractor: "FWD Tractor",
      TowBetweenSeeder: "TB Seeder",
      TowBehindSeeder: "TB Seeder",
      TowBehindSeederTracks: "TB Seeder Tracks",
      TowBehindBoomspray: "TB Boomspray",
      SelfPropelledBoomspray: "SP Boomspray",
      ThreePointBoomspray: "3P Boomspray",
      FarmUte: "Farm Ute",
      FrontWheelChaserBin: "FW Chaser",
      FourWheelDriveChaserBin: "FWD Chaser",
      HeaderDuals: "Header Duals",
      HeaderSingles: "Header Singles",
      HeaderTracks: "Header Tracks",
      SelfPropelledSwather: "SP Swather",
      Spreader: "Spreader",
      Truck: "Truck",
      CabOverTruck: "Cab Over Truck",
      CabOverRoadTrain: "Road Train",
      Baler: "Baler",
      Mower: "Mower",
      SelfPropelledMower: "SP Mower",
      Telehandler: "Telehandler",
      Loader: "Loader",
      SimpleTractor: "Simple Tractor",
      Pointer: "Pointer",
      CombineHarvester: "Combine",
      Excavator: "Excavator",
      Tractor: "Tractor",
      WheelLoader: "Wheel Loader",
      WorkCar: "Work Car",
      Airplane: "Airplane",
      simpleTractor: "Simple Tractor",
    }
    return shortNames[vehicleType] || vehicleType
  }

  function getVehicleIcon(vehicle) {
    const vehicleType = vehicle.vehicle_marker?.type
    if (!vehicleType) return null
    return SVGComponents[vehicleType] || SVGComponents.SimpleTractor || null
  }

  function getVehicleColor(vehicle) {
    return (
      vehicle.vehicle_marker?.bodyColor ||
      vehicle.vehicle_marker?.color ||
      "red"
    )
  }

  /** Get effective speed — 0 if data is stale (>30s) */
  function getEffectiveSpeed(vehicle) {
    if (!vehicle?.last_update) return 0
    const ts =
      typeof vehicle.last_update === "string"
        ? new Date(vehicle.last_update).getTime()
        : vehicle.last_update
    if (Date.now() - ts > 30000) return 0
    return vehicle.speed || 0
  }

  function getTrackedVehicleName(vehicle) {
    if (!vehicle) return "Unknown"
    if (vehicle.isCurrentUser) return "You"
    return truncateName(getSafeVehicleName(vehicle), 10)
  }

  $: trackedVehicle =
    isTrackingVehicle && trackedVehicleId
      ? getVehicleById(trackedVehicleId)
      : null

  $: shouldShowTeamButton =
    !showUnifiedMenu && (!isTrackingVehicle || !trackedVehicle)

  // Count of actively online vehicles (updated in 5-min window)
  $: onlineCount = (() => {
    const others = getSafeArray($otherVehiclesStore).filter((vehicle) =>
      isVehicleOnline(vehicle),
    ).length
    // Include current user if they have coordinates
    const selfOnline = $userVehicleStore.coordinates ? 1 : 0
    return others + selfOnline
  })()
</script>

<!-- Vehicle Controls Button (Team) — positioned above the compass button -->
{#if shouldShowTeamButton}
  <button
    class="fixed left-4 z-50 flex h-16 w-16 items-center justify-center rounded-full border-2 border-black bg-black/70 text-white backdrop-blur transition-all hover:scale-110 hover:bg-black/90"
    style="bottom: calc(1rem + 130px);"
    on:click={toggleUnifiedMenu}
    aria-label="Open vehicle menu"
  >
    <Users size={28} />
    {#if onlineCount > 0}
      <span
        class="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-green-500 px-1 text-[10px] font-bold text-white shadow"
        >{onlineCount}</span
      >
    {/if}
  </button>
{/if}

<!-- Expanded Vehicle Menu -->
{#if showUnifiedMenu}
  <div
    class="menu-expanded fixed left-4 z-50 flex flex-col overflow-hidden rounded-xl bg-black/70 text-white shadow-2xl backdrop-blur-md"
    style="bottom: calc(1rem + 130px); width: 320px; max-width: calc(100vw - 1.5rem); height: min(65vh, 480px); transform-origin: bottom left;"
  >
    <!-- Header: tabs + settings + close -->
    <div class="flex-shrink-0 border-b border-white/20">
      <div class="flex items-center gap-1 px-2 pb-0 pt-2">
        <button
          class="vehicle-tab {activeTab === 'vehicles' ? 'active' : ''}"
          on:click={() => selectTab("vehicles")}
          aria-label="Vehicles tab"
        >
          <Users size={13} />
          <span>Vehicles</span>
          <span class="tab-count">{sortedVehicles.length}</span>
        </button>
        <button
          class="vehicle-tab {activeTab === 'log' ? 'active' : ''}"
          on:click={() => selectTab("log")}
          aria-label="Map log tab"
        >
          <Activity size={13} />
          <span>Map Log</span>
          {#if unreadCount > 0}
            <span class="tab-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
          {/if}
        </button>
        <div class="flex-1"></div>
        <button
          class="header-icon-btn {showSettings ? 'bg-white/15' : ''}"
          on:click|stopPropagation={toggleSettingsMenu}
          aria-label="Vehicle menu settings"
          title="Vehicle menu settings"
        >
          <Settings size={15} class="text-white/80" />
        </button>
        <button
          class="header-icon-btn"
          on:click={closeUnifiedMenu}
          aria-label="Close vehicle menu"
          title="Close menu"
        >
          <X size={16} class="text-white/70" />
        </button>
      </div>
    </div>

    <!-- Tab content -->
    <div class="min-h-0 flex-1 overflow-y-auto" on:scroll={handlePanelScroll}>
      {#if activeTab === "vehicles"}
      {#if sortedVehicles.length === 0}
        <div
          class="flex flex-col items-center justify-center p-6 text-white/70"
        >
          <Users size={32} class="mb-2 opacity-50" />
          <p class="text-sm">No vehicles on map</p>
        </div>
      {:else}
        <div class="divide-y divide-white/10">
          {#each sortedVehicles as vehicle (vehicle.id)}
            {@const online = isVehicleOnline(vehicle)}
            {@const trailing = Boolean(vehicle.is_trailing)}
            {@const isYou = Boolean(vehicle.isCurrentUser)}
            {@const isTracked = vehicle.id === trackedVehicleId}
            {@const speed = getEffectiveSpeed(vehicle)}
            {@const opName =
              vehicle.operation_name &&
              vehicle.operation_name !== "No operation"
                ? vehicle.operation_name
                : null}
            {@const offlineLabel = getOfflineLabel(vehicle)}
            {@const hasFix = parseCoordinates(vehicle.coordinates) !== null}

            <div class="flex items-stretch">
              <button
                class="min-w-0 flex-1 p-3 text-left transition-colors hover:bg-white/10 active:bg-white/20"
                on:click={() => zoomToVehicle(vehicle)}
              >
                <div class="flex items-center gap-3">
                  <!-- Vehicle icon -->
                  <div
                    class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white/20 p-1"
                  >
                    {#if getVehicleIcon(vehicle)}
                      <svelte:component
                        this={getVehicleIcon(vehicle)}
                        bodyColor={getVehicleColor(vehicle)}
                        size="24px"
                      />
                    {:else}
                      <div class="h-4 w-4 rounded bg-white/40"></div>
                    {/if}
                  </div>

                  <!-- Name + type -->
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-1.5">
                      <p
                        class="truncate text-sm font-medium text-white"
                        title={vehicle.full_name}
                      >
                        {truncateName(vehicle.full_name)}
                      </p>
                      {#if isTracked}
                        <span
                          class="flex-shrink-0 rounded bg-green-500/20 px-1 text-[10px] font-medium text-green-300"
                          >Tracking</span
                        >
                      {/if}
                      {#if vehicle.map_role === "viewer"}
                        <span
                          class="flex-shrink-0 rounded bg-amber-500/20 px-1 text-[10px] font-medium text-amber-300"
                          >Guest</span
                        >
                      {/if}
                    </div>
                    <div class="flex items-center gap-2">
                      <p class="truncate text-xs text-white/70">
                        {getVehicleDisplayName(vehicle)}
                      </p>
                      <div
                        class="h-2 w-2 flex-shrink-0 rounded-full border border-white/30"
                        style="background-color: {getVehicleColor(vehicle)}"
                        title="Vehicle color"
                      ></div>
                    </div>
                  </div>

                  <!-- Right column: speed + unified status -->
                  <div
                    class="flex flex-shrink-0 flex-col items-end gap-0.5 self-center"
                  >
                    <div class="flex items-center gap-1.5">
                      {#if speed > 0}
                        <span
                          class="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold text-white/90"
                        >
                          {speed.toFixed(1)} km/h
                        </span>
                      {/if}
                      <div class="relative flex-shrink-0">
                        <div
                          class="h-2 w-2 rounded-full {!hasFix
                            ? 'bg-amber-400'
                            : isYou
                              ? 'bg-blue-400'
                              : trailing && online
                                ? 'bg-green-400'
                                : online
                                  ? 'bg-blue-400'
                                  : 'bg-white/40'}"
                        ></div>
                        {#if hasFix && (isYou || (trailing && online))}
                          <div
                            class="absolute -inset-1 animate-ping rounded-full {isYou
                              ? 'bg-blue-400'
                              : 'bg-green-400'} opacity-30"
                          ></div>
                        {/if}
                      </div>
                      <span
                        class="text-[10px] font-medium {!hasFix
                          ? 'text-amber-300'
                          : isYou
                            ? 'text-blue-300'
                            : trailing && online
                              ? 'text-green-300'
                              : online
                                ? 'text-blue-300'
                                : 'text-white/40'}"
                      >
                        {!hasFix
                          ? isYou
                            ? "You · No GPS"
                            : "No GPS yet"
                          : isYou
                            ? "You"
                            : trailing && online
                              ? "Trailing"
                              : online
                                ? "Online"
                                : `Offline ${offlineLabel}`}
                      </span>
                    </div>
                    {#if opName}
                      <span
                        class="max-w-[100px] truncate text-right text-[10px] text-white/50"
                        >{opName}</span
                      >
                    {/if}
                  </div>
                </div>
              </button>

              <!-- Options: track / track + rotation / message -->
              <button
                class="relative flex h-auto w-12 flex-shrink-0 items-center justify-center border-l border-white/10 transition-colors hover:bg-white/10 active:bg-white/20 {isTracked
                  ? 'bg-green-500/20'
                  : ''}"
                on:click|stopPropagation={(event) =>
                  toggleRowMenu(event, vehicle.id)}
                aria-label="Vehicle options"
                title="Vehicle options"
              >
                <MoreVertical
                  size={16}
                  class={isTracked ? "text-green-300" : "text-white/60"}
                />
                {#if $messageUnreadStore[vehicle.id]}
                  <span class="unread-dot"></span>
                {/if}
              </button>
            </div>
          {/each}
        </div>
      {/if}

      <!-- Invite row — bottom of the vehicle list (members only) -->
      {#if $profileStore?.user_type !== "viewer"}
      <button
        class="flex w-full items-center gap-2.5 border-t border-white/10 px-3 py-3 text-left transition-colors hover:bg-white/10 active:bg-white/20"
        on:click={() => (showInviteModal = true)}
      >
        <span
          class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-blue-500/15"
        >
          <UserPlus size={15} class="text-blue-300" />
        </span>
        <span class="min-w-0 flex-1">
          <span class="block text-sm font-medium text-white">Invite to map</span>
          <span class="block text-xs text-white/60"
            >Send a link by email or text</span
          >
        </span>
        <ChevronRight size={16} class="flex-shrink-0 text-white/40" />
      </button>
      {/if}
      {:else}
        <!-- Filters: category chips + vehicle/account dropdowns + start-from -->
        <div class="log-filter-bar">
          <div class="log-chips">
            {#each LOG_SIMPLE_CHIPS as chip (chip.key)}
              <button
                class="log-chip-btn {logCategory === chip.key ? 'active' : ''}"
                on:click={() => setLogCategory(chip.key)}
              >
                {chip.label}
              </button>
            {/each}
            <button
              class="log-chip-btn dropdown {logActorId ? 'active' : ''}"
              on:click|stopPropagation={toggleLogTeamMenu}
              title="Filter by team member"
            >
              <span class="chip-label">{getLogTeamChipLabel()}</span>
              <ChevronDown size={10} />
            </button>
          </div>
          <button
            class="log-date-btn"
            on:click|stopPropagation={openCalendarMenu}
            title="Pick a date"
          >
            <CalendarDays size={11} />
            <span>{getLogStartLabel()}</span>
            <ChevronDown size={10} />
          </button>
        </div>

        <div class="log-list {logRefreshing ? 'refreshing' : ''}">
        {#if logLoading && logEntries.length === 0}
          <div class="flex items-center justify-center gap-2 p-6 text-white/60">
            <Loader2 size={16} class="animate-spin" />
            <span class="text-xs">Loading activity…</span>
          </div>
        {:else if logEntries.length === 0}
          <div class="flex flex-col items-center justify-center p-6 text-white/70">
            <Activity size={32} class="mb-2 opacity-50" />
            <p class="text-sm">No activity here</p>
            <p class="mt-1 text-center text-xs text-white/50">
              {logStartKey !== "now"
                ? "Nothing matched these filters."
                : "Marker, trail and vehicle activity will appear here as it happens."}
            </p>
            {#if logStartKey !== "now" || logCategory !== "all"}
              <button class="log-show-all-btn" on:click={resetLogFilters}>
                Show everything
              </button>
            {/if}
          </div>
        {:else}
          <div class="divide-y divide-white/10">
            {#each visibleLogEntries as entry (entry.id)}
              {@const expanded = expandedLogId === entry.id}
              {@const toDef = getMarkerIconDef(entry.details?.icon)}
              {@const fromDef = getMarkerIconDef(entry.details?.from_icon)}
              {@const vehicleIcon = getLogVehicleIcon(entry)}
              {@const fromVehicleIcon = getVehicleIconByType(
                entry.details?.from_vehicle_type,
              )}
              {@const entryPos = getEntryPosition(entry)}
              <!-- svelte-ignore a11y-no-static-element-interactions -->
              <div
                class="block w-full cursor-pointer text-left transition-colors hover:bg-white/5"
                role="button"
                tabindex="0"
                on:click={() => toggleLogEntry(entry.id)}
                on:keydown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault()
                    toggleLogEntry(entry.id)
                  }
                }}
                aria-expanded={expanded}
              >
                <div class="flex items-start gap-2.5 px-3 py-2.5">
                  <!-- Leading visual: marker art, before→after, vehicle or trail -->
                  <div
                    class="flex w-[64px] flex-shrink-0 flex-col items-center gap-1 pt-0.5"
                  >
                    <div
                      class="flex min-h-[28px] items-center justify-center gap-0.5"
                    >
                    {#if entry.action === "marker.edited" && fromDef && toDef}
                      <span class="opacity-80">
                        <TintedIconPreview
                          icon={fromDef}
                          colorKey={getMarkerColorKey(entry.details?.from_marker_color)}
                          mode={entry.details?.from_tint_mode || "original"}
                          size={22}
                        />
                      </span>
                      <ArrowRight size={10} class="flex-shrink-0 text-white/40" />
                      <TintedIconPreview
                        icon={toDef}
                        colorKey={getMarkerColorKey(entry.details?.marker_color)}
                        mode={entry.details?.tint_mode || "original"}
                        size={22}
                      />
                    {:else if isMarkerAction(entry.action) && toDef}
                      <span class={entry.action === "marker.deleted" ? "opacity-50" : ""}>
                        <TintedIconPreview
                          icon={toDef}
                          colorKey={getMarkerColorKey(entry.details?.marker_color)}
                          mode={entry.details?.tint_mode || "original"}
                          size={28}
                        />
                      </span>
                    {:else if (entry.action === "trail.started" || entry.action === "trail.closed") && vehicleIcon}
                      <svelte:component
                        this={vehicleIcon}
                        bodyColor={entry.details?.vehicle_body_color || "red"}
                        size="28px"
                      />
                      <svg
                        width="15"
                        height="15"
                        viewBox="0 0 32 32"
                        fill="currentColor"
                        class="flex-shrink-0 {getActionTint(entry.action)}"
                      >
                        <path d={TRAIL_ICON_PATH} />
                      </svg>
                    {:else if entry.action === "vehicle.changed" && vehicleIcon}
                      {#if fromVehicleIcon}
                        <span class="opacity-80">
                          <svelte:component
                            this={fromVehicleIcon}
                            bodyColor={entry.details?.from_vehicle_body_color ||
                              "grey"}
                            size="22px"
                          />
                        </span>
                        <ArrowRight
                          size={10}
                          class="flex-shrink-0 text-white/40"
                        />
                      {/if}
                      <svelte:component
                        this={vehicleIcon}
                        bodyColor={entry.details?.vehicle_body_color || "red"}
                        size={fromVehicleIcon ? "22px" : "28px"}
                      />
                    {:else if isTrailAction(entry.action)}
                      <span class="log-chip">
                        <svg
                          width="15"
                          height="15"
                          viewBox="0 0 32 32"
                          fill="currentColor"
                          class={getActionTint(entry.action)}
                        >
                          <path d={TRAIL_ICON_PATH} />
                        </svg>
                      </span>
                    {:else}
                      <span class="log-chip">
                        <svelte:component
                          this={getActionIcon(entry.action)}
                          size={13}
                          class={getActionTint(entry.action)}
                        />
                      </span>
                    {/if}
                    </div>
                    {#if entry.details?.operator_name}
                      <span
                        class="log-operator-tag"
                        title={entry.details.operator_name}
                      >
                        <User size={9} />
                        <span>{entry.details.operator_name}</span>
                      </span>
                    {/if}
                  </div>

                  <div class="min-w-0 flex-1">
                    <div class="flex items-baseline justify-between gap-2">
                      <span class="truncate text-xs font-semibold text-white"
                        >{entry.actor_name}</span
                      >
                      <span
                        class="flex flex-shrink-0 items-center gap-1 text-[10px] text-white/40"
                      >
                        {formatLogTime(entry.occurred_at)}
                        <ChevronDown
                          size={11}
                          class="transition-transform {expanded ? 'rotate-180' : ''}"
                        />
                      </span>
                    </div>
                    <p class="mt-0.5 text-xs leading-snug text-white/75">
                      {entry.summary}
                      {#if entry.details?.completed}
                        <span
                          class="log-state-pill"
                          class:auto={entry.details?.auto_closed}
                        >
                          {#if entry.details?.auto_closed}<Clock size={9} />{:else}<Check size={9} />{/if}
                          {entry.details?.auto_closed ? "Auto-closed" : "Completed"}
                        </span>
                      {/if}
                    </p>
                    {#if expanded}
                      <div class="log-actions-row">
                        {#if entryPos}
                          <button
                            class="log-action-btn go"
                            title="Zoom to this marker's position"
                            on:click|stopPropagation={() =>
                              locateLogPosition(entryPos)}
                          >
                            <Crosshair size={11} />
                            Go to marker location
                          </button>
                        {/if}
                        {#if isTrailAction(entry.action) && entry.details?.vehicle_id}
                          <button
                            class="log-action-btn go"
                            title="Zoom to this vehicle's current position"
                            on:click|stopPropagation={() =>
                              locateTrailVehicle(entry)}
                          >
                            <Crosshair size={11} />
                            Locate vehicle
                          </button>
                        {/if}
                        {#if canShowTrail(entry)}
                          <button
                            class="log-action-btn trail"
                            on:click|stopPropagation={() => handleShowTrail(entry)}
                          >
                            <Play size={11} />
                            Show trail
                          </button>
                        {/if}
                      </div>
                      <div class="log-details">
                        {#each getLogDetailRows(entry) as row (row.label)}
                          <span class="log-detail-label">{row.label}</span>
                          <span class="log-detail-value">{row.value}</span>
                        {/each}
                      </div>
                    {/if}
                  </div>
                </div>
              </div>
            {/each}
          </div>
          {#if logHasMore}
            <div class="log-load-more" use:infiniteScroll>
              {#if logLoadingMore}
                <Loader2 size={12} class="animate-spin" />
                <span>Loading older activity…</span>
              {:else}
                <span>Scroll for older activity</span>
              {/if}
            </div>
          {:else}
            <div class="log-end">Start of activity in this view</div>
          {/if}
        {/if}
        </div>
      {/if}
    </div>

    <!-- Footer -->
    <div
      class="flex-shrink-0 border-t border-white/20 {isTrackingVehicle
        ? 'bg-green-500/10'
        : ''}"
    >
      {#if isTrackingVehicle && trackedVehicle}
        <div class="flex items-center justify-between p-3">
          <div class="flex items-center gap-2">
            <Target size={14} class="animate-pulse text-green-300" />
            <span class="text-xs text-green-300"
              >Tracking {getTrackedVehicleName(trackedVehicle)}</span
            >
          </div>
          <div class="flex items-center gap-2">
            <button
              on:click={toggleFirstPersonMode}
              class="flex h-7 w-7 items-center justify-center rounded-full transition-all hover:scale-110 {isFirstPersonMode
                ? 'bg-yellow-500/30 hover:bg-yellow-500/50'
                : 'bg-white/20 hover:bg-white/30'}"
              aria-label={isFirstPersonMode
                ? "Disable first-person view"
                : "Enable first-person view"}
            >
              {#if isFirstPersonMode}<Navigation
                  size={12}
                  class="text-yellow-300"
                />{:else}<Navigation2 size={12} class="text-white/70" />{/if}
            </button>
            <button
              on:click={closeUnifiedMenu}
              class="flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:bg-white/10"
              aria-label="Collapse to tracking bar"
              title="Minimize to tracking bar"
            >
              <ChevronDown size={12} class="text-white/70" />
            </button>
          </div>
        </div>
      {:else}
        <button
          class="flex w-full items-center justify-center gap-2 p-3 transition-colors hover:bg-white/10 active:bg-white/20"
          on:click={closeUnifiedMenu}
          aria-label="Collapse menu"
        >
          <ChevronDown size={16} class="text-white/70" />
          <span class="text-xs text-white/60">Collapse</span>
        </button>
      {/if}
    </div>
  </div>
{/if}

<!-- Tracking Bar (minimized) -->
{#if isTrackingVehicle && !showUnifiedMenu && trackedVehicle}
  <div
    class="tracking-bar fixed left-4 z-50 flex h-10 items-center gap-1 rounded-full bg-black/70 px-1 text-white shadow-lg backdrop-blur"
    style="bottom: calc(1rem + 130px); transform-origin: left center;"
  >
    <!-- Expand back to full menu (Users icon + count) -->
    <button
      class="relative flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full transition-colors hover:bg-white/10"
      on:click={toggleUnifiedMenu}
      title="Open vehicle menu"
      aria-label="Open vehicle menu"
    >
      <Users size={20} />
      {#if onlineCount > 0}
        <span
          class="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-green-500 px-0.5 text-[9px] font-bold text-white shadow"
          >{onlineCount}</span
        >
      {/if}
    </button>

    <!-- Separator -->
    <div class="h-6 w-px bg-white/20"></div>

    <!-- Vehicle info (clickable → expand menu, map auto-follows) -->
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div
      class="flex cursor-pointer items-center gap-2 rounded-full px-2 py-1 transition-colors hover:bg-white/10"
      on:click={toggleUnifiedMenu}
      title="Open vehicle menu"
    >
      <div
        class="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-green-500/20 p-0.5"
      >
        {#if getVehicleIcon(trackedVehicle)}
          <svelte:component
            this={getVehicleIcon(trackedVehicle)}
            bodyColor={getVehicleColor(trackedVehicle)}
            size="14px"
          />
        {:else}
          <div class="h-2.5 w-2.5 rounded bg-green-300/60"></div>
        {/if}
      </div>
      <span class="text-xs font-medium text-green-300">Tracking</span>
      <span class="min-w-0 max-w-[100px] truncate text-xs text-white/80"
        >{getTrackedVehicleName(trackedVehicle)}</span
      >
    </div>

    <!-- First person toggle -->
    <button
      on:click={toggleFirstPersonMode}
      class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full transition-all hover:scale-110 {isFirstPersonMode
        ? 'bg-yellow-500/30'
        : 'bg-white/10 hover:bg-white/25'} active:scale-95"
      aria-label={isFirstPersonMode
        ? "Disable first-person"
        : "First-person view"}
      title={isFirstPersonMode
        ? "Disable first-person view"
        : "Enable first-person camera rotation"}
    >
      {#if isFirstPersonMode}
        <Navigation size={14} class="text-yellow-300" />
      {:else}
        <Navigation2 size={14} class="text-white/60" />
      {/if}
    </button>

    <!-- Stop tracking -->
    <button
      on:click={stopTrackingVehicle}
      class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-red-500/20 transition-all hover:scale-110 hover:bg-red-500/40 active:scale-95"
      aria-label="Stop tracking"
      title="Stop tracking"
    >
      <X size={14} class="text-red-300" />
    </button>
  </div>
{/if}

<!-- Vehicle row options menu (fixed so it isn't clipped by the panel) -->
{#if openMenuVehicleId && openMenuVehicle}
  <div
    class="row-options-menu fixed z-[70] overflow-hidden rounded-lg bg-black/85 text-white shadow-2xl backdrop-blur-md"
    style="left: {openMenuPos.left}px; top: {openMenuPos.top}px; width: 220px;"
    on:click|stopPropagation
  >
    {#if openMenuVehicle.id === trackedVehicleId}
      <button class="row-option" on:click={menuStopTracking}>
        <X size={15} class="text-red-300" />
        <span>Stop tracking</span>
      </button>
      <button class="row-option" on:click={menuToggleRotation}>
        {#if isFirstPersonMode}
          <Navigation size={15} class="text-yellow-300" />
          <span>Turn off rotation</span>
        {:else}
          <Navigation2 size={15} class="text-white/70" />
          <span>Track vehicle and rotation</span>
        {/if}
      </button>
    {:else}
      <button class="row-option" on:click={() => menuTrackVehicle(false)}>
        <Crosshair size={15} class="text-white/70" />
        <span>Track vehicle</span>
      </button>
      <button class="row-option" on:click={() => menuTrackVehicle(true)}>
        <Navigation2 size={15} class="text-white/70" />
        <span>Track vehicle and rotation</span>
      </button>
    {/if}
    {#if !openMenuVehicle.isCurrentUser}
      <div class="row-option-divider"></div>
      <button class="row-option" on:click={menuSendMessage}>
        <MessageSquare size={15} class="text-sky-300" />
        <span>Send message</span>
      </button>
    {/if}
    {#if $profileStore?.user_type !== "viewer" && openMenuVehicle.map_role === "viewer" && openMenuVehicle.id !== $userVehicleStore.vehicle_id}
      <div class="row-option-divider"></div>
      <button class="row-option" on:click={menuRemoveGuest}>
        <UserMinus size={15} class="text-red-300" />
        <span class="text-red-300">Remove guest access</span>
      </button>
    {/if}
  </div>
{/if}

<!-- Menu settings dropdown (floats like the row options menu) -->
{#if showSettings}
  <div
    class="row-options-menu fixed z-[70] overflow-hidden rounded-lg bg-black/85 text-white shadow-2xl backdrop-blur-md"
    style="left: {settingsPos.left}px; top: {settingsPos.top}px; width: 232px;"
    on:click|stopPropagation
  >
    <div
      class="px-3 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-wide text-white/40"
    >
      Menu settings
    </div>
    <button
      class="row-option"
      on:click={toggleShowVehiclesAlways}
      aria-pressed={showVehiclesAlways}
    >
      <Eye
        size={15}
        class={showVehiclesAlways ? "text-emerald-300" : "text-white/50"}
      />
      <span>Show off-screen vehicles</span>
      <span class="row-option-state {showVehiclesAlways ? 'on' : ''}"
        >{showVehiclesAlways ? "On" : "Off"}</span
      >
    </button>
  </div>
{/if}

<!-- Log calendar (opens instantly from the date chip) -->
{#if showDateMenu}
  <div
    class="row-options-menu fixed z-[70] overflow-hidden rounded-lg bg-black/85 text-white shadow-2xl backdrop-blur-md"
    style="left: {dateMenuPos.left}px; top: {dateMenuPos.top}px; width: 232px;"
    on:click|stopPropagation
  >
    <div class="log-cal">
      <div class="log-cal-head">
        <button
          class="log-cal-nav"
          on:click={() => calShiftMonth(-1)}
          aria-label="Previous month"
        >
          <ChevronLeft size={14} />
        </button>
        <span class="log-cal-title">{calendarTitle}</span>
        <button
          class="log-cal-nav"
          on:click={() => calShiftMonth(1)}
          aria-label="Next month"
        >
          <ChevronRight size={14} />
        </button>
      </div>
      <div class="log-cal-grid">
        {#each ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as dow (dow)}
          <span class="log-cal-dow">{dow}</span>
        {/each}
        {#each calendarCells as cell}
          {#if cell}
            <button
              class="log-cal-day"
              class:today={cell.today}
              class:selected={logStartKey === "day" && logDayValue === cell.iso}
              disabled={cell.future}
              on:click={() => pickCalendarDay(cell)}
            >
              {cell.day}
            </button>
          {:else}
            <span class="log-cal-day empty"></span>
          {/if}
        {/each}
      </div>
      <div class="log-cal-footer">
        <button class="log-cal-reset" on:click={clearLogDate}>Back to Now</button>
      </div>
    </div>
  </div>
{/if}

<!-- Log team filter dropdown (activity made by one account) -->
{#if showLogTeamMenu}
  <div
    class="row-options-menu fixed z-[70] overflow-hidden rounded-lg bg-black/85 text-white shadow-2xl backdrop-blur-md"
    style="left: {logTeamMenuPos.left}px; top: {logTeamMenuPos.top}px; width: 224px;"
    on:click|stopPropagation
  >
    <div
      class="px-3 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-wide text-white/40"
    >
      Team
    </div>
    {#if logTeamOptionsFetching && !logTeamOptions}
      <div class="flex items-center justify-center gap-2 px-3 py-3 text-[10px] text-white/50">
        <Loader2 size={12} class="animate-spin" /> Loading…
      </div>
    {:else if !logTeamOptions || logTeamOptions.length === 0}
      <div class="px-3 py-3 text-[10px] text-white/50">No accounts found</div>
    {:else}
      <button class="row-option" on:click={() => setLogActor(null)}>
        {#if !logActorId}
          <Check size={15} class="text-emerald-300" />
        {:else}
          <span class="w-[15px]"></span>
        {/if}
        <span>Everyone</span>
      </button>
      {#each logTeamOptions as option (option.actorId)}
        <button class="row-option" on:click={() => setLogActor(option.actorId)}>
          {#if logActorId === option.actorId}
            <Check size={15} class="text-emerald-300" />
          {:else if SVGComponents[option.vehicleType]}
            <span class="log-menu-vehicle-icon">
              <svelte:component
                this={SVGComponents[option.vehicleType]}
                bodyColor={option.bodyColor || "red"}
                size="15px"
              />
            </span>
          {:else}
            <span class="log-menu-vehicle-icon">
              <User size={12} class="text-white/50" />
            </span>
          {/if}
          <span class="row-option-label">{option.name}</span>
          {#if option.lastSeenAt}
            <span class="row-option-soon">{formatLogTime(option.lastSeenAt)}</span>
          {/if}
        </button>
      {/each}
    {/if}
  </div>
{/if}

<!-- Invite to map modal -->
<InviteToMapModal
  open={showInviteModal}
  on:close={() => (showInviteModal = false)}
/>

<svelte:window
  on:click={handleWindowClick}
  on:keydown={handleWindowKeydown}
  on:resize={handleWindowClick}
/>

<style>
  .menu-expanded {
    display: flex;
    flex-direction: column;
    animation: bubbleExpand 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
  }

  .tracking-bar {
    animation: extendFromButton 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55);
  }

  @media (min-width: 640px) {
    .menu-expanded {
      width: 400px !important;
    }
  }

  @media (min-width: 1024px) {
    .menu-expanded {
      width: 450px !important;
    }
  }

  @keyframes bubbleExpand {
    0% {
      opacity: 0;
      transform: scale(0.1) translateY(20px);
    }
    60% {
      opacity: 0.8;
      transform: scale(1.05) translateY(-5px);
    }
    100% {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }

  @keyframes extendFromButton {
    0% {
      opacity: 0;
      transform: scaleX(0.25) translateX(0);
    }
    60% {
      opacity: 0.8;
      transform: scaleX(1.05) translateX(0);
    }
    100% {
      opacity: 1;
      transform: scaleX(1) translateX(0);
    }
  }

  .menu-expanded ::-webkit-scrollbar {
    width: 3px;
  }

  .menu-expanded ::-webkit-scrollbar-track {
    background: transparent;
  }

  .menu-expanded ::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.3);
    border-radius: 2px;
  }

  .menu-expanded ::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.5);
  }

  /* ── Tabs ── */
  .vehicle-tab {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 10px;
    font-size: 12px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.6);
    border-radius: 8px 8px 0 0;
    transition:
      background-color 0.15s,
      color 0.15s;
  }

  .vehicle-tab:hover {
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.9);
  }

  .vehicle-tab.active {
    background: rgba(255, 255, 255, 0.15);
    color: #fff;
  }

  .tab-count {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 9999px;
    padding: 0 6px;
    font-size: 10px;
    line-height: 16px;
  }

  .tab-badge {
    background: #ef4444;
    border-radius: 9999px;
    padding: 0 6px;
    font-size: 10px;
    font-weight: 700;
    line-height: 16px;
    color: #fff;
  }

  .header-icon-btn {
    display: flex;
    height: 30px;
    width: 30px;
    align-items: center;
    justify-content: center;
    border-radius: 9999px;
    transition: background-color 0.15s;
  }

  .header-icon-btn:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .header-icon-btn:active {
    background: rgba(255, 255, 255, 0.2);
  }

  /* ── Row options menu ── */
  .row-options-menu {
    animation: rowMenuPop 0.12s ease-out;
  }

  @keyframes rowMenuPop {
    from {
      opacity: 0;
      transform: translateY(-3px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .row-option {
    display: flex;
    width: 100%;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    font-size: 12px;
    text-align: left;
    transition: background-color 0.15s;
  }

  .row-option:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .row-option:active {
    background: rgba(255, 255, 255, 0.18);
  }

  .row-option-divider {
    height: 1px;
    background: rgba(255, 255, 255, 0.12);
    margin: 3px 0;
  }

  .row-option-soon {
    margin-left: auto;
    font-size: 9px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.45);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 9999px;
    padding: 0 6px;
    line-height: 14px;
  }

  .row-option-state {
    margin-left: auto;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 9999px;
    padding: 0 7px;
    line-height: 15px;
  }

  .row-option-state.on {
    color: #fff;
    border-color: rgba(52, 211, 153, 0.6);
    background: rgba(16, 185, 129, 0.2);
  }

  /* ── Map log rows ── */
  .log-chip {
    display: flex;
    height: 24px;
    width: 24px;
    align-items: center;
    justify-content: center;
    border-radius: 9999px;
    background: rgba(255, 255, 255, 0.1);
  }

  .log-operator-tag {
    display: flex;
    align-items: center;
    gap: 3px;
    max-width: 100%;
    border-radius: 9999px;
    background: rgba(255, 255, 255, 0.12);
    padding: 1px 6px;
    font-size: 9px;
    line-height: 14px;
    color: rgba(255, 255, 255, 0.75);
  }

  .log-operator-tag span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .log-details {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 2px 10px;
    margin-top: 7px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.05);
    padding: 7px 9px;
  }

  .log-detail-label {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.45);
    white-space: nowrap;
  }

  .log-detail-value {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.8);
    overflow-wrap: anywhere;
  }

  /* Shared action-button size (Go / Show trail), colour per action. */
  .log-action-btn {
    display: flex;
    width: 100%;
    align-items: center;
    justify-content: center;
    gap: 6px;
    margin-top: 7px;
    padding: 6px 10px;
    border-radius: 8px;
    font-size: 11px;
    font-weight: 600;
    transition: background 0.15s ease;
  }

  /* Entries can offer two actions side by side (Locate vehicle + Show trail). */
  .log-actions-row {
    display: flex;
    gap: 6px;
  }

  .log-actions-row .log-action-btn {
    width: auto;
    flex: 1;
    min-width: 0;
    white-space: nowrap;
  }

  .log-action-btn.go {
    color: #7dd3fc;
    background: rgba(56, 189, 248, 0.12);
    border: 1px solid rgba(56, 189, 248, 0.25);
  }

  .log-action-btn.go:hover {
    background: rgba(56, 189, 248, 0.24);
  }

  .log-action-btn.trail {
    color: #6ee7b7;
    background: rgba(16, 185, 129, 0.12);
    border: 1px solid rgba(16, 185, 129, 0.25);
  }

  .log-action-btn.trail:hover {
    background: rgba(16, 185, 129, 0.24);
  }

  /* Unread-messages dot on the row options button */
  .unread-dot {
    position: absolute;
    top: 6px;
    right: 8px;
    width: 7px;
    height: 7px;
    border-radius: 9999px;
    background: #f59e0b;
    box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.45);
  }

  .log-state-pill {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    margin-left: 6px;
    padding: 1px 6px;
    border-radius: 9999px;
    font-size: 9px;
    font-weight: 600;
    vertical-align: middle;
    color: #6ee7b7;
    background: rgba(16, 185, 129, 0.16);
    border: 1px solid rgba(16, 185, 129, 0.25);
  }

  .log-state-pill.auto {
    color: #fcd34d;
    background: rgba(245, 158, 11, 0.14);
    border-color: rgba(245, 158, 11, 0.25);
  }

  /* ── Log filters & lazy loading ── */
  .log-filter-bar {
    position: sticky;
    top: 0;
    z-index: 6;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(13, 13, 15, 0.92);
    backdrop-filter: blur(8px);
  }

  .log-chips {
    display: flex;
    flex: 1;
    min-width: 0;
    gap: 5px;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .log-chips::-webkit-scrollbar {
    display: none;
  }

  .log-chip-btn {
    flex-shrink: 0;
    white-space: nowrap;
    border-radius: 9999px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: rgba(255, 255, 255, 0.06);
    padding: 3px 9px;
    font-size: 10px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.65);
    transition:
      background-color 0.15s ease,
      color 0.15s ease,
      border-color 0.15s ease;
  }

  .log-chip-btn:hover {
    background: rgba(255, 255, 255, 0.12);
    color: rgba(255, 255, 255, 0.9);
  }

  .log-chip-btn.active {
    color: #fff;
    border-color: rgba(96, 165, 250, 0.55);
    background: rgba(96, 165, 250, 0.22);
  }

  .log-date-btn {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
    border-radius: 9999px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: rgba(255, 255, 255, 0.06);
    padding: 3px 8px;
    font-size: 10px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.8);
    transition: background-color 0.15s ease;
  }

  .log-date-btn:hover {
    background: rgba(255, 255, 255, 0.14);
  }

  .log-list {
    transition: opacity 0.15s ease;
  }

  .log-list.refreshing {
    opacity: 0.45;
    pointer-events: none;
  }

  .log-load-more,
  .log-end {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 10px;
    font-size: 10px;
    color: rgba(255, 255, 255, 0.45);
  }

  .log-show-all-btn {
    margin-top: 9px;
    border-radius: 9999px;
    border: 1px solid rgba(96, 165, 250, 0.4);
    background: rgba(96, 165, 250, 0.15);
    padding: 3px 11px;
    font-size: 10px;
    font-weight: 600;
    color: #93c5fd;
    transition: background-color 0.15s ease;
  }

  .log-show-all-btn:hover {
    background: rgba(96, 165, 250, 0.28);
  }

  /* ── Calendar popover ── */
  .log-cal {
    padding: 8px 10px 10px;
  }

  .log-cal-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
  }

  .log-cal-title {
    font-size: 11px;
    font-weight: 700;
    color: #fff;
  }

  .log-cal-nav {
    display: flex;
    width: 24px;
    height: 24px;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    color: rgba(255, 255, 255, 0.75);
    transition: background-color 0.15s ease;
  }

  .log-cal-nav:hover {
    background: rgba(255, 255, 255, 0.12);
  }

  .log-cal-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 2px;
  }

  .log-cal-dow {
    padding: 2px 0;
    text-align: center;
    font-size: 9px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.4);
  }

  .log-cal-day {
    display: flex;
    height: 26px;
    align-items: center;
    justify-content: center;
    border-radius: 7px;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.85);
    transition: background-color 0.12s ease;
  }

  .log-cal-day:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.14);
  }

  .log-cal-day.empty {
    visibility: hidden;
  }

  .log-cal-day.today {
    box-shadow: inset 0 0 0 1px rgba(96, 165, 250, 0.7);
  }

  .log-cal-day.selected {
    background: rgba(96, 165, 250, 0.32);
    color: #fff;
    font-weight: 700;
  }

  .log-cal-day:disabled {
    color: rgba(255, 255, 255, 0.2);
  }

  .log-cal-footer {
    margin-top: 8px;
  }

  .log-cal-reset {
    display: flex;
    width: 100%;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: rgba(255, 255, 255, 0.08);
    padding: 4px 8px;
    font-size: 10px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.75);
    transition: background-color 0.15s ease;
  }

  .log-cal-reset:hover {
    background: rgba(255, 255, 255, 0.16);
  }

  .log-chip-btn.dropdown {
    display: flex;
    align-items: center;
    gap: 3px;
  }

  .log-chip-btn.dropdown .chip-label {
    max-width: 78px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .log-menu-vehicle-icon {
    display: flex;
    width: 15px;
    flex-shrink: 0;
    justify-content: center;
  }

  .row-option-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
