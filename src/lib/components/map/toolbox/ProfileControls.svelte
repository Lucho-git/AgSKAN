<!-- src/lib/components/map/toolbox/ProfileControls.svelte -->
<script lang="ts">
  import { toast } from "svelte-sonner"
  import { User, Droplets, MapPin, Crosshair, RefreshCw, UserCheck, Clock, Satellite, Ruler, Zap, Magnet, CloudSun, Car, Warehouse } from "lucide-svelte"
  import RoadIcon from "$lib/components/general/RoadIcon.svelte"
  import { profileStore } from "$lib/stores/profileStore"
  import { userSettingsStore } from "$lib/stores/userSettingsStore"
  import { userSettingsApi } from "$lib/api/userSettingsApi"
  import { operatorStore } from "$lib/stores/operatorStore"
  import { operatorApi } from "$lib/api/operatorApi"
  import OperatorPicker from "$lib/components/map/trails/OperatorPicker.svelte"

  let saving: string | null = null
  let showOperatorPicker = false

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

  $: sprayConfirmEnabled = $userSettingsStore.sprayConfirmEnabled ?? false
  $: autoConfirmMarkers = $userSettingsStore.autoConfirmMarkers ?? false
  $: showBinsAlways = $userSettingsStore.showBinsAlways ?? false
  $: showVehiclesAlways = $userSettingsStore.showVehiclesAlways ?? true
  $: overlayMarkerMenuEnabled = $userSettingsStore.overlayMarkerMenuEnabled ?? false
  $: zoomToLocationMarkers = $userSettingsStore.zoomToLocationMarkers ?? false
  $: zoomToPlacedMarkers = $userSettingsStore.zoomToPlacedMarkers ?? true
  $: gpsIntervalSeconds = $userSettingsStore.gpsIntervalSeconds ?? 2
  $: gpsIntervalStr = String(gpsIntervalSeconds)
  $: roadOverlaysEnabled = $userSettingsStore.roadOverlaysEnabled ?? false
  $: satelliteMenuEnabled = $userSettingsStore.satelliteMenuEnabled ?? true
  $: measureMenuEnabled = $userSettingsStore.measureMenuEnabled ?? true
  $: flashMenuEnabled = $userSettingsStore.flashMenuEnabled ?? true
  $: rockPickingMenuEnabled = $userSettingsStore.rockPickingMenuEnabled ?? true
  $: weatherMenuEnabled = $userSettingsStore.weatherMenuEnabled ?? false

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
        on:change={(e) => updateGpsInterval(parseInt(e.target.value))}>
        <option value="1">1s</option>
        <option value="2">2s</option>
        <option value="3">3s</option>
        <option value="5">5s</option>
        <option value="10">10s</option>
      </select>
    </label>
  </div>

  <!-- Map Marker Settings -->
  <div class="profile-section">
    <h5 class="section-title">Map Marker Settings</h5>

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
