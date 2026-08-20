<!-- src/lib/components/map/toolbox/ProfileControls.svelte -->
<script lang="ts">
  import { toast } from "svelte-sonner"
  import { User, Droplets, RefreshCw, UserCheck, Clock, Satellite, Ruler, Zap, Magnet, CloudSun, ChevronDown } from "lucide-svelte"
  import RoadIcon from "$lib/components/general/RoadIcon.svelte"
  import { profileStore } from "$lib/stores/profileStore"
  import { userSettingsStore } from "$lib/stores/userSettingsStore"
  import { userSettingsApi } from "$lib/api/userSettingsApi"
  import { operatorStore } from "$lib/stores/operatorStore"
  import { operatorApi } from "$lib/api/operatorApi"
  import OperatorPicker from "$lib/components/map/trails/OperatorPicker.svelte"
  import MarkerSettingsPanel from "./MarkerSettingsPanel.svelte"

  let saving: string | null = null
  let showOperatorPicker = false
  // Marker-related settings live in a collapsible submenu (default open).
  // The submenu is one level deep: pick a group, see only that group's
  // settings (null = the group list).
  let showMarkerSettings = true

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

  $: sprayConfirmEnabled = $userSettingsStore.sprayConfirmEnabled ?? false
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
      }}
    >
      <span class="submenu-header-label">Marker Settings</span>
      <span class="submenu-chevron"><ChevronDown size={14} /></span>
    </button>

    {#if showMarkerSettings}
      <div class="submenu-body">
        <MarkerSettingsPanel />
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
  /* "?" help button on the Marker style row — opens the style preview modal */
  .ms-help-btn {
    margin-left: auto;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 999px;
    border: 1px solid rgba(148, 163, 184, 0.35);
    background: rgba(255, 255, 255, 0.05);
    color: #94a3b8;
    font-size: 13px;
    font-weight: 700;
    line-height: 1;
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease,
      border-color 0.15s ease;
  }
  .ms-help-btn:hover {
    background: rgba(96, 165, 250, 0.18);
    border-color: rgba(96, 165, 250, 0.55);
    color: #93c5fd;
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

  /* "Choose colours" button — opens the MarkerDefaultColorModal */
  .sdc-choose-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border: 1px solid rgba(245, 158, 11, 0.5);
    background: rgba(245, 158, 11, 0.14);
    color: #fcd34d;
    font-size: 13px;
    font-weight: 700;
    padding: 9px 14px;
    border-radius: 10px;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease;
  }
  .sdc-choose-btn:hover:not(:disabled) {
    background: rgba(245, 158, 11, 0.26);
    border-color: rgba(245, 158, 11, 0.75);
  }
  .sdc-choose-btn:disabled {
    opacity: 0.5;
    cursor: default;
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
