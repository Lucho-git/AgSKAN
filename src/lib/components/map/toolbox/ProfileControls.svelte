<!-- src/lib/components/map/toolbox/ProfileControls.svelte -->
<script lang="ts">
  import { onMount } from "svelte"
  import { toast } from "svelte-sonner"
  import { User, Droplets, MapPin, Crosshair, RefreshCw, UserCheck, Clock, Satellite, Ruler, Zap, Magnet, CloudSun, Car, Warehouse, Palette, Search, ChevronDown, ChevronRight, ChevronLeft } from "lucide-svelte"
  import RoadIcon from "$lib/components/general/RoadIcon.svelte"
  import { profileStore } from "$lib/stores/profileStore"
  import { userSettingsStore } from "$lib/stores/userSettingsStore"
  import { userSettingsApi } from "$lib/api/userSettingsApi"
  import { operatorStore } from "$lib/stores/operatorStore"
  import { operatorApi } from "$lib/api/operatorApi"
  import OperatorPicker from "$lib/components/map/trails/OperatorPicker.svelte"
  import { getActiveMarkers } from "$lib/data/markerDefinitions"
  import {
    TINT_MODES,
    TINT_MODE_DEFAULT,
    MARKER_STYLE_GROUPS,
    markerStyleGroupFor,
    PICKABLE_MARKER_COLORS,
    MARKER_COLOR_DEFAULT,
    RANDOM_COLOR_KEY,
    MARKER_TYPE_DEFAULT_COLORS,
    markerColor,
    styleSwatchBg,
    type MarkerStyleGroup,
  } from "$lib/components/map/markers/markerPalette"

  // Colours the user can pick as a default (the compact palette — no
  // black/white/rainbow — minus the "Default" reset itself).
  const PICKABLE_COLORS = PICKABLE_MARKER_COLORS.filter(
    (c) => c.key !== MARKER_COLOR_DEFAULT,
  )

  let saving: string | null = null
  let showOperatorPicker = false
  // Marker-related settings live in a collapsible submenu (default open).
  // The submenu is one level deep: pick a group, see only that group's
  // settings (null = the group list).
  let showMarkerSettings = true
  let markerSettingsGroup: string | null = null

  // Marker Settings drill-down menu groups (Style & colours combined).
  const MARKER_SETTINGS_GROUPS = [
    {
      key: "style",
      label: "Style & colours",
      desc: "Marker style, glass and default colours",
      icon: Palette,
    },
    {
      key: "behaviour",
      label: "Behaviour",
      desc: "Menus, camera and icon placement",
      icon: Magnet,
    },
    {
      key: "tracking",
      label: "Tracking",
      desc: "Bins and vehicles at the map edge",
      icon: Car,
    },
  ] as { key: string; label: string; desc: string; icon: any }[]
  $: activeMarkerGroup = MARKER_SETTINGS_GROUPS.find(
    (g) => g.key === markerSettingsGroup,
  )

  async function toggleSprayConfirm(value: boolean) {
    saving = "sprayConfirmEnabled"
    try {
      const result = await userSettingsApi.updateSprayConfirmEnabled(value)
      if (result?.success) {
        toast.success("Spray confirm " + (value ? "enabled" : "disabled"))
      } else {
        toast.error(result?.message || "Failed to update setting")
        userSettingsStore.update((s) => ({ ...s, sprayConfirmEnabled: !value }))
      }
    } catch (e: any) {
      toast.error(e?.message || "Error saving setting")
      userSettingsStore.update((s) => ({ ...s, sprayConfirmEnabled: !value }))
    } finally {
      saving = null
    }
  }

  async function toggleAutoConfirm(value: boolean) {
    saving = "autoConfirmMarkers"
    try {
      const s = $userSettingsStore
      const result = await userSettingsApi.updateMarkerInteractionSettings(
        s.zoomToLocationMarkers ?? false,
        s.zoomToPlacedMarkers ?? true,
        value,
      )
      if (result?.success) {
        toast.success("Auto-confirm " + (value ? "enabled" : "disabled"))
      } else {
        toast.error(result?.message || "Failed to update setting")
        userSettingsStore.update((s) => ({ ...s, autoConfirmMarkers: !value }))
      }
    } catch (e: any) {
      toast.error(e?.message || "Error saving setting")
      userSettingsStore.update((s) => ({ ...s, autoConfirmMarkers: !value }))
    } finally {
      saving = null
    }
  }

  async function setZoomToLocation(value: boolean) {
    saving = "zoomToLocationMarkers"
    try {
      const s = $userSettingsStore
      const result = await userSettingsApi.updateZoomSettings(
        value,
        s.zoomToPlacedMarkers ?? true,
      )
      if (result?.success) {
        toast.success("Camera find on quick drop: " + (value ? "zoom" : "none"))
      } else {
        toast.error(result?.message || "Failed to update setting")
        userSettingsStore.update((s) => ({ ...s, zoomToLocationMarkers: !value }))
      }
    } catch (e: any) {
      toast.error(e?.message || "Error saving setting")
      userSettingsStore.update((s) => ({ ...s, zoomToLocationMarkers: !value }))
    } finally {
      saving = null
    }
  }

  async function setZoomToPlaced(value: boolean) {
    saving = "zoomToPlacedMarkers"
    try {
      const s = $userSettingsStore
      const result = await userSettingsApi.updateZoomSettings(
        s.zoomToLocationMarkers ?? false,
        value,
      )
      if (result?.success) {
        toast.success("Camera find on touch hold: " + (value ? "zoom" : "none"))
      } else {
        toast.error(result?.message || "Failed to update setting")
        userSettingsStore.update((s) => ({ ...s, zoomToPlacedMarkers: !value }))
      }
    } catch (e: any) {
      toast.error(e?.message || "Error saving setting")
      userSettingsStore.update((s) => ({ ...s, zoomToPlacedMarkers: !value }))
    } finally {
      saving = null
    }
  }

  async function toggleOverlayMarkerMenu(value: boolean) {
    saving = "overlayMarkerMenuEnabled"
    try {
      const result = await userSettingsApi.updateOverlayMarkerMenuEnabled(value)
      if (result?.success) {
        toast.success(value ? "Marker menu: on-map panel" : "Marker menu: bottom panel")
      } else {
        toast.error(result?.message || "Failed to update setting")
        userSettingsStore.update((s) => ({ ...s, overlayMarkerMenuEnabled: !value }))
      }
    } catch (e: any) {
      toast.error(e?.message || "Error saving setting")
      userSettingsStore.update((s) => ({ ...s, overlayMarkerMenuEnabled: !value }))
    } finally {
      saving = null
    }
  }

  async function toggleOverlayPlacementMenu(value: boolean) {
    saving = "overlayPlacementMenuEnabled"
    try {
      const result = await userSettingsApi.updateOverlayPlacementMenuEnabled(value)
      if (result?.success) {
        toast.success(value ? "Placement menu: on-map panel" : "Placement menu: bottom panel")
      } else {
        toast.error(result?.message || "Failed to update setting")
        userSettingsStore.update((s) => ({ ...s, overlayPlacementMenuEnabled: !value }))
      }
    } catch (e: any) {
      toast.error(e?.message || "Error saving setting")
      userSettingsStore.update((s) => ({ ...s, overlayPlacementMenuEnabled: !value }))
    } finally {
      saving = null
    }
  }

  async function toggleShowBinsAlways(value: boolean) {
    saving = "showBinsAlways"
    try {
      const result = await userSettingsApi.updateShowBinsAlways(value)
      if (result?.success) {
        toast.success(value ? "Bin edge tracking: on" : "Bin edge tracking: off")
      } else {
        toast.error(result?.message || "Failed to update setting")
        userSettingsStore.update((s) => ({ ...s, showBinsAlways: !value }))
      }
    } catch (e: any) {
      toast.error(e?.message || "Error saving setting")
      userSettingsStore.update((s) => ({ ...s, showBinsAlways: !value }))
    } finally {
      saving = null
    }
  }

  async function toggleShowVehiclesAlways(value: boolean) {
    saving = "showVehiclesAlways"
    try {
      const result = await userSettingsApi.updateShowVehiclesAlways(value)
      if (result?.success) {
        toast.success(value ? "Vehicle edge tracking: on" : "Vehicle edge tracking: off")
      } else {
        toast.error(result?.message || "Failed to update setting")
        userSettingsStore.update((s) => ({ ...s, showVehiclesAlways: !value }))
      }
    } catch (e: any) {
      toast.error(e?.message || "Error saving setting")
      userSettingsStore.update((s) => ({ ...s, showVehiclesAlways: !value }))
    } finally {
      saving = null
    }
  }

  async function setMarkerStyle(value: string) {
    saving = "markerStyle"
    try {
      const result = await userSettingsApi.updateMarkerStyle(value)
      if (result?.success) {
        const label = TINT_MODES.find((m) => m.key === value)?.label || value
        toast.success("Marker style: " + label)
      } else {
        toast.error(result?.message || "Failed to update setting")
      }
    } catch (e: any) {
      toast.error(e?.message || "Error saving setting")
    } finally {
      saving = null
    }
  }

  // The "Icon only" glass disc opacity (0-100 in the UI, 0-1 in the store).
  // The slider applies its value IMMEDIATELY (local store → the map re-tints
  // live) and only persists to the server when the user releases the slider.
  function handleGlassOpacityInput(e: Event) {
    const el = e.currentTarget as HTMLInputElement
    const value = parseInt(el.value) / 100
    userSettingsStore.update((s) => ({ ...s, iconGlassOpacity: value }))
  }

  async function handleGlassOpacityChange(e: Event) {
    const el = e.currentTarget as HTMLInputElement
    const value = parseInt(el.value) / 100
    saving = "iconGlassOpacity"
    try {
      const result = await userSettingsApi.updateIconGlassOpacity(value)
      if (result?.success) {
        toast.success("Icon glass strength: " + Math.round(value * 100) + "%")
      } else {
        toast.error(result?.message || "Failed to update setting")
      }
    } catch (err: any) {
      toast.error(err?.message || "Error saving setting")
    } finally {
      saving = null
    }
  }

  // The 4 grouped marker styles. Switching to a group adopts its default
  // sub-variant unless the current concrete style already belongs to it.
  function setMarkerStyleGroup(group: MarkerStyleGroup) {
    if (!group.modes.includes(markerStyle)) {
      setMarkerStyle(group.modes[0])
    }
  }

  // ── Marker default colours (single / custom) ──
  async function saveMarkerDefaultColors(
    mode: string,
    color: string,
    perType: Record<string, string>,
  ) {
    saving = "markerDefaultColors"
    try {
      console.log("🎨 Saving marker default colours:", { mode, color, perType })
      const result = await userSettingsApi.updateMarkerDefaultColors(
        mode,
        color,
        perType,
      )
      if (result?.success) {
        toast.success("Marker default colours updated")
      } else {
        toast.error(result?.message || "Failed to update setting")
      }
    } catch (e: any) {
      toast.error(e?.message || "Error saving setting")
    } finally {
      saving = null
    }
  }

  function setDefaultColorMode(mode: string) {
    saveMarkerDefaultColors(
      mode,
      $userSettingsStore.markerDefaultColor ?? "blue",
      $userSettingsStore.markerTypeDefaultColors ?? {},
    )
  }

  function setDefaultColor(colorKey: string) {
    saveMarkerDefaultColors(
      $userSettingsStore.markerDefaultColorMode ?? "custom",
      colorKey,
      $userSettingsStore.markerTypeDefaultColors ?? {},
    )
  }

  function setTypeDefault(def: { iconClass: string }, colorKey: string) {
    saveMarkerDefaultColors(
      $userSettingsStore.markerDefaultColorMode ?? "custom",
      $userSettingsStore.markerDefaultColor ?? "blue",
      {
        ...($userSettingsStore.markerTypeDefaultColors ?? {}),
        [def.iconClass]: colorKey,
      },
    )
  }

  // Remove a type's override so it falls back to its built-in preset (or the
  // single default colour).
  function clearTypeDefault(def: { iconClass: string }) {
    const perType = { ...($userSettingsStore.markerTypeDefaultColors ?? {}) }
    delete perType[def.iconClass]
    saveMarkerDefaultColors(
      $userSettingsStore.markerDefaultColorMode ?? "custom",
      $userSettingsStore.markerDefaultColor ?? "blue",
      perType,
    )
  }

  // A type's effective default colour: its override, else its built-in
  // preset, else the single default colour. perType/single are passed in
  // EXPLICITLY because Svelte can't see dependencies read inside a function
  // body — without them the trigger square never re-renders after a pick.
  function typeDefaultFor(
    def: { iconClass: string },
    perType: Record<string, string>,
    single: string,
  ): string {
    return (
      perType[def.iconClass] ||
      MARKER_TYPE_DEFAULT_COLORS[def.iconClass] ||
      single
    )
  }

  // The colour a type's "Default" option falls back to when its override is
  // cleared (its built-in preset, else the single default colour).
  function builtinDefaultKey(def: { iconClass: string }): string {
    return MARKER_TYPE_DEFAULT_COLORS[def.iconClass] || markerDefaultColor
  }

  // Human label for the "Default" option, e.g. "Default (Orange)".
  function builtinDefaultLabel(def: { iconClass: string }): string {
    const key = builtinDefaultKey(def)
    return key === RANDOM_COLOR_KEY ? "Random" : markerColor(key).label
  }

  // The swatch-dot fill for a default colour key ("random" → rainbow),
  // shown in the shade the current marker style actually renders.
  function defaultSwatchBg(key: string, styleKey?: string | null): string {
    if (key === RANDOM_COLOR_KEY)
      return "conic-gradient(from 0deg, #ef4444, #f97316, #eab308, #22c55e, #3b82f6, #a855f7, #ef4444)"
    return styleSwatchBg(markerColor(key, styleKey), styleKey)
  }

  // Colour picker popover state (fixed-position grid opened from the square
  // trigger). mode "type" carries the iconClass being edited.
  type PickerState = {
    mode: "single" | "type"
    iconClass: string | null
    x: number
    y: number
  }
  const POPOVER_WIDTH = 112
  let pickerState: PickerState | null = null

  function closePicker() {
    pickerState = null
  }
  function openSinglePicker(e: MouseEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    pickerState = {
      mode: "single",
      iconClass: null,
      x: Math.max(8, rect.right - POPOVER_WIDTH),
      y: rect.bottom + 6,
    }
  }
  function openTypePicker(def: { iconClass: string }, e: MouseEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    pickerState = {
      mode: "type",
      iconClass: def.iconClass,
      x: Math.max(8, rect.right - POPOVER_WIDTH),
      y: rect.bottom + 6,
    }
  }
  function pickSingleColor(key: string) {
    closePicker()
    setDefaultColor(key)
  }
  function pickTypeColor(def: { iconClass: string }, key: string) {
    closePicker()
    if (key === "builtin") clearTypeDefault(def)
    else setTypeDefault(def, key)
  }
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") pickerState = null
  }

  // Marker type usage counts (used to order the per-type list by usage).
  let usageCounts: Map<string, number> = new Map()

  onMount(async () => {
    const usage = await userSettingsApi.getMarkerTypeUsage()
    if (usage?.success && usage.data) {
      usageCounts = new Map(usage.data.map((d) => [d.icon, d.count]))
    }
  })

  $: sprayConfirmEnabled = $userSettingsStore.sprayConfirmEnabled ?? false
  $: autoConfirmMarkers = $userSettingsStore.autoConfirmMarkers ?? false
  $: showBinsAlways = $userSettingsStore.showBinsAlways ?? false
  $: showVehiclesAlways = $userSettingsStore.showVehiclesAlways ?? true
  $: markerStyle = $userSettingsStore.markerStyle ?? TINT_MODE_DEFAULT
  $: activeStyleGroup = markerStyleGroupFor(markerStyle).key
  // ── Marker default colours ──
  $: markerDefaultColorMode =
    $userSettingsStore.markerDefaultColorMode ?? "custom"
  $: isCustomMode =
    markerDefaultColorMode === "custom" || markerDefaultColorMode === "per-type"
  $: markerDefaultColor = $userSettingsStore.markerDefaultColor ?? "blue"
  $: markerTypeDefaultColors =
    $userSettingsStore.markerTypeDefaultColors ?? {}
  // Active marker types for the per-type picker (iconClass per definition;
  // the "default" pin is excluded — it never takes a default colour).
  // Ordered by usage first (most-used at the top), then alphabetically.
  $: activeMarkerDefs = getActiveMarkers()
    .filter((m: any) => m.id !== "default")
    .map((m: any) => ({
      ...m,
      iconClass:
        m.class === "custom-svg" ? `custom-svg-${m.id}` : m.class,
    }))
    .sort((a: any, b: any) => {
      const ua = usageCounts.get(a.iconClass) || 0
      const ub = usageCounts.get(b.iconClass) || 0
      if (ua !== ub) return ub - ua
      return a.name.localeCompare(b.name)
    })
  // Search filter for the per-type list (matches name or icon class). The
  // usage-then-alphabetical order from activeMarkerDefs is preserved.
  let typeSearch = ""
  $: filteredMarkerDefs = activeMarkerDefs.filter((def: any) => {
    const q = typeSearch.trim().toLowerCase()
    if (!q) return true
    return (
      (def.name || "").toLowerCase().includes(q) ||
      (def.iconClass || "").toLowerCase().includes(q)
    )
  })
  $: iconGlassOpacity = $userSettingsStore.iconGlassOpacity ?? 0.3
  $: iconGlassOpacityPct = Math.round(iconGlassOpacity * 100)
  $: isGlassStyle =
    markerStyle === "icon-dark-glass" || markerStyle === "icon-light-glass"
  $: overlayMarkerMenuEnabled = $userSettingsStore.overlayMarkerMenuEnabled ?? false
  $: overlayPlacementMenuEnabled = $userSettingsStore.overlayPlacementMenuEnabled ?? false
  $: zoomToLocationMarkers = $userSettingsStore.zoomToLocationMarkers ?? false
  $: zoomToPlacedMarkers = $userSettingsStore.zoomToPlacedMarkers ?? true
  $: gpsIntervalSeconds = $userSettingsStore.gpsIntervalSeconds ?? 2
  $: gpsIntervalStr = String(gpsIntervalSeconds)
  $: roadOverlaysEnabled = $userSettingsStore.roadOverlaysEnabled ?? false
  $: satelliteMenuEnabled = $userSettingsStore.satelliteMenuEnabled ?? true
  $: measureMenuEnabled = $userSettingsStore.measureMenuEnabled ?? true
  $: flashMenuEnabled = $userSettingsStore.flashMenuEnabled ?? true
  $: rockPickingMenuEnabled = $userSettingsStore.rockPickingMenuEnabled ?? true
  $: weatherMenuEnabled = $userSettingsStore.weatherMenuEnabled ?? true

  type MenuField =
    | "satelliteMenuEnabled"
    | "measureMenuEnabled"
    | "flashMenuEnabled"
    | "rockPickingMenuEnabled"
    | "weatherMenuEnabled"

  async function toggleMenu(field: MenuField, label: string, value: boolean) {
    saving = field
    try {
      const result = await userSettingsApi.updateMenuVisibility(field, value)
      if (result?.success) {
        toast.success(`${label} menu ${value ? "shown" : "hidden"}`)
      } else {
        toast.error(result?.message || "Failed to update setting")
        userSettingsStore.update((s) => ({ ...s, [field]: !value }))
      }
    } catch (e: any) {
      toast.error(e?.message || "Error saving setting")
      userSettingsStore.update((s) => ({ ...s, [field]: !value }))
    } finally {
      saving = null
    }
  }

  async function toggleRoadOverlays(value: boolean) {
    saving = "roadOverlaysEnabled"
    try {
      const result = await userSettingsApi.updateRoadOverlaysEnabled(value)
      if (result?.success) {
        toast.success("Road overlays menu " + (value ? "shown" : "hidden"))
      } else {
        toast.error(result?.message || "Failed to update setting")
        userSettingsStore.update((s) => ({ ...s, roadOverlaysEnabled: !value }))
      }
    } catch (e: any) {
      toast.error(e?.message || "Error saving setting")
      userSettingsStore.update((s) => ({ ...s, roadOverlaysEnabled: !value }))
    } finally {
      saving = null
    }
  }

  async function updateGpsInterval(value: number) {
    saving = "gpsIntervalSeconds"
    try {
      const result = await userSettingsApi.updateGpsIntervalSeconds(value)
      if (result?.success) {
        toast.success("GPS interval: " + value + "s")
      } else {
        toast.error(result?.message || "Failed to update")
        userSettingsStore.update((s) => ({ ...s, gpsIntervalSeconds: $userSettingsStore.gpsIntervalSeconds }))
      }
    } catch (e: any) {
      toast.error(e?.message || "Error saving setting")
    } finally {
      saving = null
    }
  }

  function handleGpsChange(e: Event) {
    const el = e.currentTarget as HTMLSelectElement
    updateGpsInterval(parseInt(el.value))
  }

  function getInitials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean)
    if (parts.length === 0) return "?"
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }

  function openOperatorPicker() {
    showOperatorPicker = true
  }

  function handleOperatorSelected() {
    showOperatorPicker = false
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="profile-panel">
  <!-- Operator section -->
  <div class="profile-section">
    <h5 class="section-title">Operator</h5>

    <!-- Active operator card (whole card is clickable) -->
    <button
      type="button"
      class="operator-card"
      class:has-operator={$operatorStore?.operator}
      on:click={openOperatorPicker}
    >
      {#if $operatorStore?.operator}
        <div class="operator-avatar" style="--op-color: {$operatorStore.operator.color}">
          {getInitials($operatorStore.operator.name)}
        </div>
        <div class="operator-info">
          <span class="operator-label">Active Operator</span>
          <span class="operator-name">{$operatorStore.operator.name}</span>
        </div>
        <RefreshCw size={16} class="operator-switch-icon" />
      {:else}
        <div class="operator-avatar operator-avatar-empty">
          <User size={20} />
        </div>
        <div class="operator-info">
          <span class="operator-label">No Operator Selected</span>
          <span class="operator-name operator-name-muted">Required to trail</span>
        </div>
        <UserCheck size={16} class="operator-switch-icon" />
      {/if}
    </button>
  </div>

  <!-- Quick settings (tied to account) -->
  <div class="profile-section">
    <div class="section-header-row">
      <h5 class="section-title">Quick Settings</h5>
      <div class="account-badge">
        <div class="account-badge-avatar">
          <User size={12} />
        </div>
        <span>{$profileStore?.full_name || "Account"}</span>
      </div>
    </div>

    <!-- Record Confirmation -->
    <label class="setting-row">
      <div class="setting-icon spray-icon">
        <Droplets size={16} />
      </div>
      <div class="setting-label">
        <span class="setting-name">Record confirm popup</span>
        <span class="setting-desc">Show confirmation when closing a trail</span>
      </div>
      <input type="checkbox" class="setting-toggle-input" checked={sprayConfirmEnabled}
        disabled={saving === "sprayConfirmEnabled"}
        on:change={() => toggleSprayConfirm(!sprayConfirmEnabled)} />
      <span class="setting-toggle-track"><span class="setting-toggle-thumb"></span></span>
    </label>

    <!-- GPS interval -->
    <label class="setting-row">
      <div class="setting-icon gps-icon">
        <Clock size={16} />
      </div>
      <div class="setting-label">
        <span class="setting-name">GPS update interval</span>
        <span class="setting-desc">How often GPS position updates</span>
      </div>
      <select class="gps-select" value={gpsIntervalStr}
        disabled={saving === "gpsIntervalSeconds"}
        on:change={handleGpsChange}>
        <option value="1">1s</option>
        <option value="2">2s</option>
        <option value="3">3s</option>
        <option value="5">5s</option>
        <option value="10">10s</option>
      </select>
    </label>
  </div>

  <!-- Marker Settings -->
  <div class="profile-section">
    <button
      type="button"
      class="submenu-header"
      class:open={showMarkerSettings}
      aria-expanded={showMarkerSettings}
      on:click={() => {
        showMarkerSettings = !showMarkerSettings
        if (showMarkerSettings) markerSettingsGroup = null
      }}
    >
      <span class="submenu-header-label">Marker Settings</span>
      <span class="submenu-chevron"><ChevronDown size={14} /></span>
    </button>

    {#if showMarkerSettings}
      <div class="submenu-body">

        {#if markerSettingsGroup === null}
          <!-- Group list — pick a group to see only those settings -->
          <div class="ms-groups">
            {#each MARKER_SETTINGS_GROUPS as g}
              <button
                type="button"
                class="ms-group-btn"
                on:click={() => (markerSettingsGroup = g.key)}
              >
                <span class="setting-icon marker-icon ms-group-icon">
                  <svelte:component this={g.icon} size={16} />
                </span>
                <span class="ms-group-text">
                  <span class="ms-group-name">{g.label}</span>
                  <span class="ms-group-desc">{g.desc}</span>
                </span>
                <span class="ms-group-arrow"><ChevronRight size={14} /></span>
              </button>
            {/each}
          </div>
        {:else}
          <!-- Drill-down: back + only this group's settings -->
          <div class="ms-view-head">
            <button
              type="button"
              class="ms-back-btn"
              on:click={() => (markerSettingsGroup = null)}
            >
              <ChevronLeft size={14} />
              <span>Back</span>
            </button>
            <span class="ms-view-title">{activeMarkerGroup?.label || ""}</span>
          </div>

          {#if markerSettingsGroup === "style"}
            <!-- Marker style (applied to every marker on the map) -->
            <div class="setting-row setting-row-col">
              <div class="setting-row-top">
                <div class="setting-icon marker-icon">
                  <Palette size={16} />
                </div>
                <div class="setting-label">
                  <span class="setting-name">Marker style</span>
                  <span class="setting-desc">Style applied to every marker on the map</span>
                </div>
              </div>
              <div class="style-seg marker-style-seg">
                {#each MARKER_STYLE_GROUPS as g}
                  <button
                    type="button"
                    class:active={activeStyleGroup === g.key}
                    disabled={saving === "markerStyle"}
                    on:click={() => setMarkerStyleGroup(g)}
                  >{g.label}</button>
                {/each}
              </div>

              <!-- Circle fill → White / Black glyph -->
              {#if activeStyleGroup === "circle-fill"}
                <div class="style-seg marker-style-seg marker-sub-seg">
                  <button
                    type="button"
                    class:active={markerStyle === "circle-fill"}
                    disabled={saving === "markerStyle"}
                    on:click={() => setMarkerStyle("circle-fill")}
                  >White</button>
                  <button
                    type="button"
                    class:active={markerStyle === "circle-fill-black"}
                    disabled={saving === "markerStyle"}
                    on:click={() => setMarkerStyle("circle-fill-black")}
                  >Black</button>
                </div>
              {/if}

              <!-- Icon → Dark / Light glass disc -->
              {#if activeStyleGroup === "icon"}
                <div class="style-seg marker-style-seg marker-sub-seg">
                  <button
                    type="button"
                    class:active={markerStyle === "icon-dark-glass"}
                    disabled={saving === "markerStyle"}
                    on:click={() => setMarkerStyle("icon-dark-glass")}
                  >Dark</button>
                  <button
                    type="button"
                    class:active={markerStyle === "icon-light-glass"}
                    disabled={saving === "markerStyle"}
                    on:click={() => setMarkerStyle("icon-light-glass")}
                  >Light</button>
                </div>
              {/if}
            </div>

            <!-- Icon-only glass strength (shown below the Dark/Light setting) -->
            {#if isGlassStyle}
              <div class="setting-row setting-row-col">
                <div class="setting-row-top">
                  <div class="setting-icon marker-icon">
                    <Palette size={16} />
                  </div>
                  <div class="setting-label">
                    <span class="setting-name">Icon glass strength</span>
                    <span class="setting-desc">How strong the translucent disc behind the icon is</span>
                  </div>
                </div>
                <div class="glass-opacity-row">
                  <input
                    type="range"
                    class="glass-opacity-slider"
                    min="0"
                    max="100"
                    step="10"
                    value={iconGlassOpacityPct}
                    on:input={handleGlassOpacityInput}
                    on:change={handleGlassOpacityChange}
                  />
                  <span class="glass-opacity-value">{iconGlassOpacityPct}%</span>
                </div>
              </div>
            {/if}

            <!-- Default colour: mode + swatches as ONE panel -->
            <div class="setting-row setting-row-col">
              <div class="setting-row-top">
                <div class="setting-icon marker-icon">
                  <Palette size={16} />
                </div>
                <div class="setting-label">
                  <span class="setting-name">Default colour</span>
                  <span class="setting-desc">Colour a new marker gets when it has none set</span>
                </div>
              </div>
              <div class="style-seg marker-style-seg">
                <button
                  type="button"
                  class:active={markerDefaultColorMode === "single"}
                  disabled={saving === "markerDefaultColors"}
                  on:click={() => setDefaultColorMode("single")}
                >Single</button>
                <button
                  type="button"
                  class:active={isCustomMode}
                  disabled={saving === "markerDefaultColors"}
                  on:click={() => setDefaultColorMode("custom")}
                >Custom</button>
              </div>

              {#if markerDefaultColorMode === "single"}
                <div class="sdc-color-row">
                  <button
                    type="button"
                    class="sdc-color-trigger"
                    style="background: {defaultSwatchBg(markerDefaultColor, markerStyle)};"
                    title={`Default colour: ${markerDefaultColor === RANDOM_COLOR_KEY ? "Random" : markerColor(markerDefaultColor).label}`}
                    aria-label="Change the default colour"
                    disabled={saving === "markerDefaultColors"}
                    on:click={(e) => openSinglePicker(e)}
                  ></button>
                </div>
                {#if pickerState?.mode === "single"}
                  {@const p = pickerState}
                  <div class="sdc-color-pop-overlay" on:click={closePicker} on:contextmenu|preventDefault={closePicker}></div>
                  <div class="sdc-color-pop" style="left: {p.x}px; top: {p.y}px;">
                    <button
                      type="button"
                      class="sdc-color-cell sdc-color-cell-special"
                      class:active={markerDefaultColor === RANDOM_COLOR_KEY}
                      style="background: {defaultSwatchBg(RANDOM_COLOR_KEY, markerStyle)};"
                      title="Random — every new marker with no colour set gets a random palette colour"
                      on:click={() => pickSingleColor(RANDOM_COLOR_KEY)}
                    >R</button>
                    {#each PICKABLE_COLORS as c}
                      <button
                        type="button"
                        class="sdc-color-cell"
                        class:active={markerDefaultColor === c.key}
                        style="background: {styleSwatchBg(markerColor(c.key, markerStyle), markerStyle)};"
                        title={c.label}
                        on:click={() => pickSingleColor(c.key)}
                      ></button>
                    {/each}
                  </div>
                {/if}
              {:else if isCustomMode}
                <div class="default-colours-search">
                  <Search size={14} class="default-colours-search-icon" />
                  <input
                    type="text"
                    class="default-colours-search-input"
                    placeholder="Search marker types…"
                    bind:value={typeSearch}
                  />
                  {#if typeSearch}
                    <button
                      type="button"
                      class="default-colours-clear"
                      aria-label="Clear search"
                      on:click={() => (typeSearch = "")}
                    >×</button>
                  {/if}
                </div>
                <div class="default-colours-list">
                  {#each filteredMarkerDefs as def}
                    <div class="default-type-row">
                      <div class="default-type-name" title={def.name}>{def.name}</div>
                      <button
                        type="button"
                        class="sdc-color-trigger"
                        class:sdc-color-trigger-default={!(def.iconClass in markerTypeDefaultColors)}
                        style="background: {def.iconClass in markerTypeDefaultColors
                          ? defaultSwatchBg(typeDefaultFor(def, markerTypeDefaultColors, markerDefaultColor), markerStyle)
                          : "transparent"};"
                        title={`${def.name} default colour`}
                        aria-label={`${def.name} default colour`}
                        disabled={saving === "markerDefaultColors"}
                        on:click={(e) => openTypePicker(def, e)}
                      >{#if !(def.iconClass in markerTypeDefaultColors)}D{/if}</button>
                    </div>
                    {#if pickerState?.mode === "type" && pickerState.iconClass === def.iconClass}
                      {@const p = pickerState}
                      <div class="sdc-color-pop-overlay" on:click={closePicker} on:contextmenu|preventDefault={closePicker}></div>
                      <div class="sdc-color-pop" style="left: {p.x}px; top: {p.y}px;">
                        <button
                          type="button"
                          class="sdc-color-cell sdc-color-cell-special"
                          class:active={!(def.iconClass in markerTypeDefaultColors)}
                          title={`${def.name}: use the built-in default (${builtinDefaultLabel(def)})`}
                          on:click={() => pickTypeColor(def, "builtin")}
                        >D</button>
                        {#each PICKABLE_COLORS as c}
                          <button
                            type="button"
                            class="sdc-color-cell"
                            class:active={typeDefaultFor(def, markerTypeDefaultColors, markerDefaultColor) === c.key}
                            style="background: {styleSwatchBg(markerColor(c.key, markerStyle), markerStyle)};"
                            title={c.label}
                            on:click={() => pickTypeColor(def, c.key)}
                          ></button>
                        {/each}
                      </div>
                    {/if}
                  {/each}
                </div>
              {/if}
            </div>
          {:else if markerSettingsGroup === "behaviour"}
            <!-- Marker menu style -->
            <div class="setting-row setting-row-col">
              <div class="setting-row-top">
                <div class="setting-icon marker-icon">
                  <Magnet size={16} />
                </div>
                <div class="setting-label">
                  <span class="setting-name">Marker menu style</span>
                  <span class="setting-desc">How marker menus open when a marker is selected</span>
                </div>
              </div>
              <div class="style-seg">
                <button
                  type="button"
                  class:active={overlayMarkerMenuEnabled}
                  disabled={saving === "overlayMarkerMenuEnabled"}
                  on:click={() => toggleOverlayMarkerMenu(true)}
                >On Map Panel</button>
                <button
                  type="button"
                  class:active={!overlayMarkerMenuEnabled}
                  disabled={saving === "overlayMarkerMenuEnabled"}
                  on:click={() => toggleOverlayMarkerMenu(false)}
                >Bottom Panel</button>
              </div>
            </div>

            <!-- Placement menu style (for NEW markers) -->
            <div class="setting-row setting-row-col">
              <div class="setting-row-top">
                <div class="setting-icon marker-icon">
                  <Magnet size={16} />
                </div>
                <div class="setting-label">
                  <span class="setting-name">Placement menu style</span>
                  <span class="setting-desc">How the icon menu opens when placing a new marker</span>
                </div>
              </div>
              <div class="style-seg">
                <button
                  type="button"
                  class:active={overlayPlacementMenuEnabled}
                  disabled={saving === "overlayPlacementMenuEnabled"}
                  on:click={() => toggleOverlayPlacementMenu(true)}
                >On Map Panel</button>
                <button
                  type="button"
                  class:active={!overlayPlacementMenuEnabled}
                  disabled={saving === "overlayPlacementMenuEnabled"}
                  on:click={() => toggleOverlayPlacementMenu(false)}
                >Bottom Panel</button>
              </div>
            </div>

            <!-- Camera find on quick drop -->
            <div class="setting-row setting-row-col">
              <div class="setting-row-top">
                <div class="setting-icon zoom-icon">
                  <Crosshair size={16} />
                </div>
                <div class="setting-label">
                  <span class="setting-name">Camera find on quick drop</span>
                  <span class="setting-desc">Auto-zoom map when quick-dropping a marker</span>
                </div>
              </div>
              <div class="style-seg">
                <button
                  type="button"
                  class:active={zoomToLocationMarkers}
                  disabled={saving === "zoomToLocationMarkers"}
                  on:click={() => setZoomToLocation(true)}
                >Zoom</button>
                <button
                  type="button"
                  class:active={!zoomToLocationMarkers}
                  disabled={saving === "zoomToLocationMarkers"}
                  on:click={() => setZoomToLocation(false)}
                >None</button>
              </div>
            </div>

            <!-- Camera find on touch hold -->
            <div class="setting-row setting-row-col">
              <div class="setting-row-top">
                <div class="setting-icon marker-icon">
                  <MapPin size={16} />
                </div>
                <div class="setting-label">
                  <span class="setting-name">Camera find on touch hold</span>
                  <span class="setting-desc">Auto-zoom map when holding to place a marker</span>
                </div>
              </div>
              <div class="style-seg">
                <button
                  type="button"
                  class:active={zoomToPlacedMarkers}
                  disabled={saving === "zoomToPlacedMarkers"}
                  on:click={() => setZoomToPlaced(true)}
                >Zoom</button>
                <button
                  type="button"
                  class:active={!zoomToPlacedMarkers}
                  disabled={saving === "zoomToPlacedMarkers"}
                  on:click={() => setZoomToPlaced(false)}
                >None</button>
              </div>
            </div>

            <!-- Marker icon selection -->
            <div class="setting-row setting-row-col">
              <div class="setting-row-top">
                <div class="setting-icon marker-icon">
                  <Magnet size={16} />
                </div>
                <div class="setting-label">
                  <span class="setting-name">Marker icon selection</span>
                  <span class="setting-desc">Skip the edit panel and use the default icon when placing</span>
                </div>
              </div>
              <div class="style-seg">
                <button
                  type="button"
                  class:active={!autoConfirmMarkers}
                  disabled={saving === "autoConfirmMarkers"}
                  on:click={() => toggleAutoConfirm(false)}
                >Selection menu</button>
                <button
                  type="button"
                  class:active={autoConfirmMarkers}
                  disabled={saving === "autoConfirmMarkers"}
                  on:click={() => toggleAutoConfirm(true)}
                >Use default</button>
              </div>
            </div>
          {:else}
            <!-- Show bins always (offscreen tracking) -->
            <label class="setting-row">
              <div class="setting-icon marker-icon">
                <Warehouse size={16} />
              </div>
              <div class="setting-label">
                <span class="setting-name">Show bins always</span>
                <span class="setting-desc">Track all silo bins at the map edge</span>
              </div>
              <input type="checkbox" class="setting-toggle-input" checked={showBinsAlways}
                disabled={saving === "showBinsAlways"}
                on:change={() => toggleShowBinsAlways(!showBinsAlways)} />
              <span class="setting-toggle-track"><span class="setting-toggle-thumb"></span></span>
            </label>

            <!-- Show vehicles always (offscreen tracking) -->
            <label class="setting-row">
              <div class="setting-icon marker-icon">
                <Car size={16} />
              </div>
              <div class="setting-label">
                <span class="setting-name">Show vehicles always</span>
                <span class="setting-desc">Track recently-active vehicles at the map edge</span>
              </div>
              <input type="checkbox" class="setting-toggle-input" checked={showVehiclesAlways}
                disabled={saving === "showVehiclesAlways"}
                on:change={() => toggleShowVehiclesAlways(!showVehiclesAlways)} />
              <span class="setting-toggle-track"><span class="setting-toggle-thumb"></span></span>
            </label>
          {/if}
        {/if}

      </div>
    {/if}
  </div>

  <!-- Toolbox menu toggles -->
  <div class="profile-section">
    <h5 class="section-title">Toolbox Menus</h5>
    <p class="section-desc">Choose which tools appear in the map toolbox</p>

    <!-- Road Overlays menu -->
    <label class="setting-row">
      <div class="setting-icon road-icon">
        <RoadIcon size={16} />
      </div>
      <div class="setting-label">
        <span class="setting-name">Road overlays menu</span>
        <span class="setting-desc">Show the Road Overlays tool in the toolbox</span>
      </div>
      <input type="checkbox" class="setting-toggle-input" checked={roadOverlaysEnabled}
        disabled={saving === "roadOverlaysEnabled"}
        on:change={() => toggleRoadOverlays(!roadOverlaysEnabled)} />
      <span class="setting-toggle-track"><span class="setting-toggle-thumb"></span></span>
    </label>

    <!-- Satellite menu -->
    <label class="setting-row">
      <div class="setting-icon satellite-icon">
        <Satellite size={16} />
      </div>
      <div class="setting-label">
        <span class="setting-name">Satellite menu</span>
        <span class="setting-desc">Show the Satellite tool in the toolbox</span>
      </div>
      <input type="checkbox" class="setting-toggle-input" checked={satelliteMenuEnabled}
        disabled={saving === "satelliteMenuEnabled"}
        on:change={() => toggleMenu("satelliteMenuEnabled", "Satellite", !satelliteMenuEnabled)} />
      <span class="setting-toggle-track"><span class="setting-toggle-thumb"></span></span>
    </label>

    <!-- Measure menu -->
    <label class="setting-row">
      <div class="setting-icon measure-icon">
        <Ruler size={16} />
      </div>
      <div class="setting-label">
        <span class="setting-name">Measure menu</span>
        <span class="setting-desc">Show the Measure tool in the toolbox</span>
      </div>
      <input type="checkbox" class="setting-toggle-input" checked={measureMenuEnabled}
        disabled={saving === "measureMenuEnabled"}
        on:change={() => toggleMenu("measureMenuEnabled", "Measure", !measureMenuEnabled)} />
      <span class="setting-toggle-track"><span class="setting-toggle-thumb"></span></span>
    </label>

    <!-- Flash Signal menu -->
    <label class="setting-row">
      <div class="setting-icon flash-icon">
        <Zap size={16} />
      </div>
      <div class="setting-label">
        <span class="setting-name">Flash signal menu</span>
        <span class="setting-desc">Show the Flash Signal tool in the toolbox</span>
      </div>
      <input type="checkbox" class="setting-toggle-input" checked={flashMenuEnabled}
        disabled={saving === "flashMenuEnabled"}
        on:change={() => toggleMenu("flashMenuEnabled", "Flash signal", !flashMenuEnabled)} />
      <span class="setting-toggle-track"><span class="setting-toggle-thumb"></span></span>
    </label>

    <!-- Rock Picking menu -->
    <label class="setting-row">
      <div class="setting-icon rock-icon">
        <Magnet size={16} />
      </div>
      <div class="setting-label">
        <span class="setting-name">Rock picking menu</span>
        <span class="setting-desc">Show the Rock Picking tool in the toolbox</span>
      </div>
      <input type="checkbox" class="setting-toggle-input" checked={rockPickingMenuEnabled}
        disabled={saving === "rockPickingMenuEnabled"}
        on:change={() => toggleMenu("rockPickingMenuEnabled", "Rock picking", !rockPickingMenuEnabled)} />
      <span class="setting-toggle-track"><span class="setting-toggle-thumb"></span></span>
    </label>

    <!-- Weather menu -->
    <label class="setting-row">
      <div class="setting-icon weather-icon">
        <CloudSun size={16} />
      </div>
      <div class="setting-label">
        <span class="setting-name">Weather menu</span>
        <span class="setting-desc">Show the Weather tool in the toolbox</span>
      </div>
      <input type="checkbox" class="setting-toggle-input" checked={weatherMenuEnabled}
        disabled={saving === "weatherMenuEnabled"}
        on:change={() => toggleMenu("weatherMenuEnabled", "Weather", !weatherMenuEnabled)} />
      <span class="setting-toggle-track"><span class="setting-toggle-thumb"></span></span>
    </label>
  </div>
</div>

{#if showOperatorPicker && $profileStore?.master_map_id}
  <OperatorPicker
    mapId={$profileStore.master_map_id}
    context="select"
    on:selected={handleOperatorSelected}
    on:close={() => (showOperatorPicker = false)}
  />
{/if}

<style>
  .profile-panel {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  /* Active operator card (clickable button) */
  .operator-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px;
    background: rgba(96, 165, 250, 0.08);
    border: 1px solid rgba(96, 165, 250, 0.2);
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.15s ease;
    width: 100%;
    text-align: left;
  }

  .operator-card:hover {
    background: rgba(96, 165, 250, 0.15);
    border-color: rgba(96, 165, 250, 0.35);
  }

  .operator-card.has-operator {
    background: rgba(74, 222, 128, 0.08);
    border-color: rgba(74, 222, 128, 0.25);
  }

  .operator-card.has-operator:hover {
    background: rgba(74, 222, 128, 0.15);
    border-color: rgba(74, 222, 128, 0.35);
  }

  .operator-avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--op-color, #60a5fa) 25%, transparent);
    border: 2px solid var(--op-color, #60a5fa);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: 700;
    color: var(--op-color, #93c5fd);
    flex-shrink: 0;
  }

  .operator-avatar-empty {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.2);
    color: rgba(255, 255, 255, 0.4);
  }

  .operator-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .operator-label {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: rgba(255, 255, 255, 0.4);
  }

  .operator-name {
    font-size: 15px;
    font-weight: 600;
    color: #fff;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .operator-name-muted {
    color: rgba(255, 255, 255, 0.4);
    font-weight: 400;
    font-size: 13px;
  }

  .operator-switch-icon {
    flex-shrink: 0;
    color: rgba(255, 255, 255, 0.4);
  }

  /* Section header row with account badge */
  .section-header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 6px;
  }

  .account-badge {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 3px 8px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 20px;
    font-size: 10px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.5);
    max-width: 140px;
  }

  .account-badge span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .account-badge-avatar {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: rgba(96, 165, 250, 0.15);
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(96, 165, 250, 0.6);
    flex-shrink: 0;
  }

  /* Settings section */
  .profile-section {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .section-title {
    margin: 0 0 6px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(255, 255, 255, 0.35);
  }

  /* Collapsible marker-settings submenu */
  .submenu-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    margin: 0 0 2px;
    padding: 8px 10px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 9px;
    cursor: pointer;
    transition: background 0.15s ease;
  }
  .submenu-header:hover {
    background: rgba(255, 255, 255, 0.09);
  }
  .submenu-header-label {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(255, 255, 255, 0.55);
  }
  .submenu-chevron {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    color: rgba(255, 255, 255, 0.4);
    transition: transform 0.18s ease;
  }
  .submenu-header.open .submenu-chevron {
    transform: rotate(180deg);
  }
  .submenu-body {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  /* Marker Settings drill-down — group list */
  .ms-groups {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .ms-group-btn {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 8px 10px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    cursor: pointer;
    transition: background 0.15s ease;
  }
  .ms-group-btn:hover {
    background: rgba(255, 255, 255, 0.09);
  }
  .ms-group-icon {
    width: 30px;
    height: 30px;
  }
  .ms-group-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
    text-align: left;
  }
  .ms-group-name {
    font-size: 13px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.9);
  }
  .ms-group-desc {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.45);
  }
  .ms-group-arrow {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    color: rgba(255, 255, 255, 0.4);
  }

  /* Marker Settings drill-down — view head (back + title) */
  .ms-view-head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 2px;
  }
  .ms-back-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 8px;
    font-size: 11px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.75);
    cursor: pointer;
    transition: background 0.15s ease;
  }
  .ms-back-btn:hover {
    background: rgba(255, 255, 255, 0.1);
  }
  .ms-view-title {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(255, 255, 255, 0.45);
  }

  .section-desc {
    margin: -2px 0 6px;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.4);
    line-height: 1.4;
  }

  .setting-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-radius: 10px;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .setting-row:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  .setting-icon {
    width: 30px;
    height: 30px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .spray-icon {
    background: rgba(74, 222, 128, 0.15);
    color: #4ade80;
  }

  .marker-icon {
    background: rgba(167, 139, 250, 0.15);
    color: #a78bfa;
  }

  .gps-icon {
    background: rgba(251, 191, 36, 0.15);
    color: #fbbf24;
  }

  .zoom-icon {
    background: rgba(96, 165, 250, 0.15);
    color: #60a5fa;
  }

  .road-icon {
    background: rgba(251, 191, 36, 0.15);
    color: #fbbf24;
  }

  .satellite-icon {
    background: rgba(56, 189, 248, 0.15);
    color: #38bdf8;
  }

  .measure-icon {
    background: rgba(244, 114, 182, 0.15);
    color: #f472b6;
  }

  .flash-icon {
    background: rgba(234, 179, 8, 0.15);
    color: #eab308;
  }

  .rock-icon {
    background: rgba(52, 211, 153, 0.15);
    color: #34d399;
  }

  .weather-icon {
    background: rgba(56, 189, 248, 0.15);
    color: #38bdf8;
  }

  .setting-label {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .setting-name {
    font-size: 12.5px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.85);
    line-height: 1.3;
  }

  .setting-desc {
    font-size: 10.5px;
    color: rgba(255, 255, 255, 0.4);
    line-height: 1.3;
  }

  /* Blue toggle switch (matches the marker menu's switches) */
  .setting-toggle-input {
    display: none;
  }
  .setting-toggle-track {
    position: relative;
    width: 32px;
    height: 18px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.18);
    transition: background 0.15s ease;
    flex-shrink: 0;
  }
  .setting-toggle-thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #fff;
    transition: left 0.15s ease;
  }
  .setting-row input:checked + .setting-toggle-track {
    background: rgba(96, 165, 250, 0.8);
  }
  .setting-row input:checked + .setting-toggle-track .setting-toggle-thumb {
    left: 16px;
  }
  .setting-row input:disabled + .setting-toggle-track {
    opacity: 0.5;
  }

  /* Marker menu style — segmented picker row */
  .setting-row-col {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }
  .setting-row-top {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .style-seg {
    display: flex;
    gap: 3px;
    padding: 3px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 9px;
  }
  .style-seg button {
    flex: 1;
    border: none;
    background: transparent;
    color: rgba(255, 255, 255, 0.5);
    font-size: 11px;
    font-weight: 600;
    padding: 6px 8px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
  }
  .style-seg button:hover {
    color: rgba(255, 255, 255, 0.85);
  }
  .style-seg button.active {
    background: rgba(96, 165, 250, 0.28);
    color: #93c5fd;
  }
  .style-seg button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Marker style — wraps so all 4 styles fit on one/two rows */
  .marker-style-seg {
    flex-wrap: wrap;
  }
  .marker-style-seg button {
    flex: 1 1 auto;
    min-width: 84px;
  }
  /* Sub-variant row (White/Black, Dark/Light) under the active style */
  .marker-sub-seg {
    margin-top: 6px;
  }

  /* Default-colour pickers — a single colour square that opens a popover
     grid of colour squares to pick from */
  .sdc-color-row {
    display: flex;
    align-items: center;
    margin-top: 6px;
  }
  .sdc-color-trigger {
    width: 26px;
    height: 26px;
    flex-shrink: 0;
    border-radius: 6px;
    border: 2px solid rgba(255, 255, 255, 0.4);
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.35);
    cursor: pointer;
    padding: 0;
    transition: transform 0.15s ease;
  }
  .sdc-color-trigger:hover {
    transform: scale(1.1);
  }
  .sdc-color-trigger:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  /* Type with no override — on its built-in default, shown as dashed D */
  .sdc-color-trigger-default {
    border-style: dashed !important;
    border-color: rgba(255, 255, 255, 0.55) !important;
    background: rgba(255, 255, 255, 0.06) !important;
    color: rgba(255, 255, 255, 0.85);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: 700;
  }
  .sdc-color-pop-overlay {
    position: fixed;
    inset: 0;
    z-index: 60;
  }
  .sdc-color-pop {
    position: fixed;
    z-index: 61;
    width: 112px;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
    padding: 8px;
    background: #1e293b;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 10px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  }
  .sdc-color-cell {
    width: 28px;
    height: 28px;
    border-radius: 6px;
    border: 2px solid rgba(255, 255, 255, 0.2);
    cursor: pointer;
    padding: 0;
    transition: transform 0.12s ease;
  }
  .sdc-color-cell:hover {
    transform: scale(1.12);
  }
  .sdc-color-cell.active {
    /* White ring on the picked colour (border is never set inline, but keep
       it !important so nothing can override the active state). */
    border-color: #fff !important;
    box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.6);
  }
  /* "Random"/"Default" special cells — dashed rim with a glyph */
  .sdc-color-cell-special {
    border: 2px dashed rgba(255, 255, 255, 0.55);
    background: rgba(255, 255, 255, 0.06);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.85);
  }
  .sdc-color-cell-special.active {
    border-style: solid;
    border-color: #fff;
    box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.6);
  }

  /* Search box above the per-type default colour list */
  .default-colours-search {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 8px;
    margin-bottom: 4px;
  }
  .default-colours-search-icon {
    flex-shrink: 0;
    color: rgba(255, 255, 255, 0.45);
  }
  .default-colours-search-input {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: none;
    outline: none;
    color: rgba(255, 255, 255, 0.9);
    font-size: 12px;
  }
  .default-colours-search-input::placeholder {
    color: rgba(255, 255, 255, 0.35);
  }
  .default-colours-clear {
    flex-shrink: 0;
    background: rgba(255, 255, 255, 0.1);
    border: none;
    border-radius: 50%;
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(255, 255, 255, 0.7);
    font-size: 13px;
    line-height: 1;
    cursor: pointer;
    padding: 0;
  }
  .default-colours-clear:hover {
    background: rgba(255, 255, 255, 0.2);
  }

  /* Per-type default colours — one row per type: name, then dropdown */
  .default-type-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
  }
  .default-type-name {
    flex: 1;
    min-width: 0;
    font-size: 11px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.7);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Per-type default colours list — scrollable when long */
  .default-colours-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: 260px;
    overflow-y: auto;
    padding-right: 4px;
  }

  /* Icon-only glass strength — slider shown for the icon-only styles */
  .glass-opacity-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 2px 2px 2px 6px;
  }
  .glass-opacity-slider {
    flex: 1;
    min-width: 0;
    accent-color: #60a5fa;
    cursor: pointer;
  }
  .glass-opacity-slider:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .glass-opacity-value {
    flex-shrink: 0;
    width: 42px;
    text-align: right;
    font-size: 12px;
    font-weight: 600;
    color: #93c5fd;
  }

  /* GPS select */
  .gps-select {
    padding: 4px 8px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 8px;
    color: rgba(255, 255, 255, 0.85);
    font-size: 13px;
    outline: none;
    cursor: pointer;
    flex-shrink: 0;
  }

  .gps-icon {
    background: rgba(251, 191, 36, 0.15);
    color: #fbbf24;
  }
</style>
