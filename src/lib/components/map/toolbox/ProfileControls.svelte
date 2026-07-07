<!-- src/lib/components/map/toolbox/ProfileControls.svelte -->
<script lang="ts">
  import { toast } from "svelte-sonner"
  import { User, Droplets, MapPin, Crosshair, RefreshCw, UserCheck } from "lucide-svelte"
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

  async function toggleZoomLocation(value: boolean) {
    saving = "zoomToLocationMarkers"
    try {
      const s = $userSettingsStore
      const result = await userSettingsApi.updateZoomSettings(
        value,
        s.zoomToPlacedMarkers ?? true,
      )
      if (result?.success) {
        toast.success("Zoom to markers " + (value ? "enabled" : "disabled"))
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

  $: sprayConfirmEnabled = $userSettingsStore.sprayConfirmEnabled ?? false
  $: autoConfirmMarkers = $userSettingsStore.autoConfirmMarkers ?? false
  $: zoomToLocationMarkers = $userSettingsStore.zoomToLocationMarkers ?? false

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

    <!-- Spray Record Confirmation -->
    <label class="setting-row">
      <div class="setting-icon spray-icon">
        <Droplets size={16} />
      </div>
      <div class="setting-label">
        <span class="setting-name">Spray confirm popup</span>
        <span class="setting-desc">Show confirmation when closing a trail</span>
      </div>
      <button
        type="button"
        class="toggle"
        class:toggle-on={sprayConfirmEnabled}
        disabled={saving === "sprayConfirmEnabled"}
        on:click={() => toggleSprayConfirm(!sprayConfirmEnabled)}
      >
        <span class="toggle-knob"></span>
      </button>
    </label>

    <!-- Auto-confirm Markers -->
    <label class="setting-row">
      <div class="setting-icon marker-icon">
        <MapPin size={16} />
      </div>
      <div class="setting-label">
        <span class="setting-name">Auto-confirm markers</span>
        <span class="setting-desc">Skip edit panel when placing markers</span>
      </div>
      <button
        type="button"
        class="toggle"
        class:toggle-on={autoConfirmMarkers}
        disabled={saving === "autoConfirmMarkers"}
        on:click={() => toggleAutoConfirm(!autoConfirmMarkers)}
      >
        <span class="toggle-knob"></span>
      </button>
    </label>

    <!-- Zoom to Location Markers -->
    <label class="setting-row">
      <div class="setting-icon zoom-icon">
        <Crosshair size={16} />
      </div>
      <div class="setting-label">
        <span class="setting-name">Zoom to quick-drop markers</span>
        <span class="setting-desc">Auto-zoom map when dropping location markers</span>
      </div>
      <button
        type="button"
        class="toggle"
        class:toggle-on={zoomToLocationMarkers}
        disabled={saving === "zoomToLocationMarkers"}
        on:click={() => toggleZoomLocation(!zoomToLocationMarkers)}
      >
        <span class="toggle-knob"></span>
      </button>
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
    gap: 2px;
  }

  .section-title {
    margin: 0 0 6px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(255, 255, 255, 0.35);
  }

  .setting-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border-radius: 10px;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .setting-row:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  .setting-icon {
    width: 32px;
    height: 32px;
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

  .setting-label {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .setting-name {
    font-size: 13px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.85);
  }

  .setting-desc {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.4);
    line-height: 1.3;
  }

  /* Toggle switch */
  .toggle {
    position: relative;
    width: 38px;
    height: 22px;
    border-radius: 11px;
    background: rgba(255, 255, 255, 0.15);
    border: none;
    cursor: pointer;
    transition: background 0.2s ease;
    flex-shrink: 0;
    padding: 0;
  }

  .toggle.toggle-on {
    background: rgba(96, 165, 250, 0.6);
  }

  .toggle:disabled {
    opacity: 0.5;
    cursor: wait;
  }

  .toggle-knob {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #ffffff;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
    transition: transform 0.2s ease;
  }

  .toggle-on .toggle-knob {
    transform: translateX(16px);
  }
</style>
