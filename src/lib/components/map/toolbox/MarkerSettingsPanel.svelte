<!--
  MarkerSettingsPanel.svelte
  The full "Marker Settings" section (previously inline in ProfileControls):
  a group list (Style & colours / Behaviour / Tracking) with drill-down, all
  the marker style/colour/behaviour settings, and the two help modals
  (MarkerStylePreviewModal + MarkerDefaultColorModal). Shared by Profile →
  Marker settings and the toolbox markers tab so both stay in sync.
-->
<script>
  import { toast } from "svelte-sonner"
  import { userSettingsStore } from "$lib/stores/userSettingsStore"
  import { userSettingsApi } from "$lib/api/userSettingsApi"
  import {
    Car,
    ChevronLeft,
    ChevronRight,
    Crosshair,
    MapPin,
    Magnet,
    Palette,
    RotateCcw,
    Warehouse,
  } from "lucide-svelte"
  import MarkerStylePreviewModal from "./MarkerStylePreviewModal.svelte"
  import MarkerDefaultColorModal from "./MarkerDefaultColorModal.svelte"
  import {
    TINT_MODES,
    TINT_MODE_DEFAULT,
    MARKER_STYLE_GROUPS,
    markerStyleGroupFor,
  } from "$lib/components/map/markers/markerPalette"

  let saving = null
  let showStylePreview = false
  let showDefaultColorHelp = false
  // null = the group list; otherwise the active group key (style/behaviour/
  // tracking) shows only that group's settings.
  let markerSettingsGroup = null

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
  ]
  $: activeMarkerGroup = MARKER_SETTINGS_GROUPS.find(
    (g) => g.key === markerSettingsGroup,
  )

  let resettingPrompt = false

  // Dev/testing escape hatch — reset the first-run onboarding flag so the
  // style → colours popup shows again on the next map load.
  async function resetOnboardingPrompt() {
    resettingPrompt = true
    try {
      const result = await userSettingsApi.resetMarkerOnboarding()
      if (result?.success) {
        toast.success("First-run prompt will show again on next map load")
      } else {
        toast.error(result?.message || "Failed to reset prompt")
      }
    } catch (e) {
      toast.error(e?.message || "Error resetting prompt")
    } finally {
      resettingPrompt = false
    }
  }

  // ── Store reactives ──
  $: autoConfirmMarkers = $userSettingsStore.autoConfirmMarkers ?? false
  $: showBinsAlways = $userSettingsStore.showBinsAlways ?? false
  $: showVehiclesAlways = $userSettingsStore.showVehiclesAlways ?? true
  $: markerStyle = $userSettingsStore.markerStyle ?? TINT_MODE_DEFAULT
  $: activeStyleGroup = markerStyleGroupFor(markerStyle).key
  $: iconGlassOpacity = $userSettingsStore.iconGlassOpacity ?? 0.3
  $: iconGlassOpacityPct = Math.round(iconGlassOpacity * 100)
  $: isGlassStyle =
    markerStyle === "icon-dark-glass" || markerStyle === "icon-light-glass"
  $: overlayMarkerMenuEnabled =
    $userSettingsStore.overlayMarkerMenuEnabled ?? false
  $: overlayPlacementMenuEnabled =
    $userSettingsStore.overlayPlacementMenuEnabled ?? false
  $: zoomToLocationMarkers = $userSettingsStore.zoomToLocationMarkers ?? false
  $: zoomToPlacedMarkers = $userSettingsStore.zoomToPlacedMarkers ?? true

  // ── Handlers (mirror the old ProfileControls section) ──
  async function toggleAutoConfirm(value) {
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
    } catch (e) {
      toast.error(e?.message || "Error saving setting")
      userSettingsStore.update((s) => ({ ...s, autoConfirmMarkers: !value }))
    } finally {
      saving = null
    }
  }

  async function setZoomToLocation(value) {
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
    } catch (e) {
      toast.error(e?.message || "Error saving setting")
      userSettingsStore.update((s) => ({ ...s, zoomToLocationMarkers: !value }))
    } finally {
      saving = null
    }
  }

  async function setZoomToPlaced(value) {
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
    } catch (e) {
      toast.error(e?.message || "Error saving setting")
      userSettingsStore.update((s) => ({ ...s, zoomToPlacedMarkers: !value }))
    } finally {
      saving = null
    }
  }

  async function toggleOverlayMarkerMenu(value) {
    saving = "overlayMarkerMenuEnabled"
    try {
      const result = await userSettingsApi.updateOverlayMarkerMenuEnabled(value)
      if (result?.success) {
        toast.success(value ? "Marker menu: on-map panel" : "Marker menu: bottom panel")
      } else {
        toast.error(result?.message || "Failed to update setting")
        userSettingsStore.update((s) => ({ ...s, overlayMarkerMenuEnabled: !value }))
      }
    } catch (e) {
      toast.error(e?.message || "Error saving setting")
      userSettingsStore.update((s) => ({ ...s, overlayMarkerMenuEnabled: !value }))
    } finally {
      saving = null
    }
  }

  async function toggleOverlayPlacementMenu(value) {
    saving = "overlayPlacementMenuEnabled"
    try {
      const result = await userSettingsApi.updateOverlayPlacementMenuEnabled(value)
      if (result?.success) {
        toast.success(value ? "Placement menu: on-map panel" : "Placement menu: bottom panel")
      } else {
        toast.error(result?.message || "Failed to update setting")
        userSettingsStore.update((s) => ({ ...s, overlayPlacementMenuEnabled: !value }))
      }
    } catch (e) {
      toast.error(e?.message || "Error saving setting")
      userSettingsStore.update((s) => ({ ...s, overlayPlacementMenuEnabled: !value }))
    } finally {
      saving = null
    }
  }

  async function toggleShowBinsAlways(value) {
    saving = "showBinsAlways"
    try {
      const result = await userSettingsApi.updateShowBinsAlways(value)
      if (result?.success) {
        toast.success(value ? "Bin edge tracking: on" : "Bin edge tracking: off")
      } else {
        toast.error(result?.message || "Failed to update setting")
        userSettingsStore.update((s) => ({ ...s, showBinsAlways: !value }))
      }
    } catch (e) {
      toast.error(e?.message || "Error saving setting")
      userSettingsStore.update((s) => ({ ...s, showBinsAlways: !value }))
    } finally {
      saving = null
    }
  }

  async function toggleShowVehiclesAlways(value) {
    saving = "showVehiclesAlways"
    try {
      const result = await userSettingsApi.updateShowVehiclesAlways(value)
      if (result?.success) {
        toast.success(value ? "Vehicle edge tracking: on" : "Vehicle edge tracking: off")
      } else {
        toast.error(result?.message || "Failed to update setting")
        userSettingsStore.update((s) => ({ ...s, showVehiclesAlways: !value }))
      }
    } catch (e) {
      toast.error(e?.message || "Error saving setting")
      userSettingsStore.update((s) => ({ ...s, showVehiclesAlways: !value }))
    } finally {
      saving = null
    }
  }

  async function setMarkerStyle(value) {
    saving = "markerStyle"
    try {
      const result = await userSettingsApi.updateMarkerStyle(value)
      if (result?.success) {
        const label = TINT_MODES.find((m) => m.key === value)?.label || value
        toast.success("Marker style: " + label)
      } else {
        toast.error(result?.message || "Failed to update setting")
      }
    } catch (e) {
      toast.error(e?.message || "Error saving setting")
    } finally {
      saving = null
    }
  }

  // "Use this style" from the style-preview modal: apply the style, then
  // route straight into the default-colours modal (pick a style, then set
  // the colours — the same flow the first-run onboarding walks through).
  function handleApplyStyleFromModal(value) {
    setMarkerStyle(value)
    showStylePreview = false
    showDefaultColorHelp = true
  }

  // The "Icon only" glass disc opacity (0-100 in the UI, 0-1 in the store).
  // The slider applies its value IMMEDIATELY (local store → the map re-tints
  // live) and only persists to the server when the user releases the slider.
  function handleGlassOpacityInput(e) {
    const el = e.currentTarget
    const value = parseInt(el.value) / 100
    userSettingsStore.update((s) => ({ ...s, iconGlassOpacity: value }))
  }

  async function handleGlassOpacityChange(e) {
    const el = e.currentTarget
    const value = parseInt(el.value) / 100
    saving = "iconGlassOpacity"
    try {
      const result = await userSettingsApi.updateIconGlassOpacity(value)
      if (result?.success) {
        toast.success("Icon glass strength: " + Math.round(value * 100) + "%")
      } else {
        toast.error(result?.message || "Failed to update setting")
      }
    } catch (err) {
      toast.error(err?.message || "Error saving setting")
    } finally {
      saving = null
    }
  }

  // The 4 grouped marker styles. Switching to a group adopts its default
  // sub-variant unless the current concrete style already belongs to it.
  function setMarkerStyleGroup(group) {
    if (!group.modes.includes(markerStyle)) {
      setMarkerStyle(group.modes[0])
    }
  }
</script>

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
    <button
      type="button"
      class="ms-reset-prompt"
      disabled={resettingPrompt}
      on:click={resetOnboardingPrompt}
    >
      <RotateCcw size={12} />
      {resettingPrompt ? "Resetting…" : "Reset first-run prompt"}
    </button>
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
        <button
          type="button"
          class="ms-help-btn"
          title="Preview every marker in every style"
          aria-label="Preview marker styles"
          on:click={() => (showStylePreview = true)}
        >?</button>
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
        <button
          type="button"
          class="ms-help-btn"
          title="Set a default colour for each marker type"
          aria-label="Default colour help"
          on:click={() => (showDefaultColorHelp = true)}
        >?</button>
      </div>
      <button
        type="button"
        class="sdc-choose-btn"
        on:click={() => (showDefaultColorHelp = true)}
      >
        <Palette size={14} />
        Choose colours
      </button>
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

{#if showStylePreview}
  <MarkerStylePreviewModal
    onClose={() => (showStylePreview = false)}
    onApplyStyle={handleApplyStyleFromModal}
  />
{/if}

{#if showDefaultColorHelp}
  <MarkerDefaultColorModal onClose={() => (showDefaultColorHelp = false)} />
{/if}

<style>
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

  /* Dev/testing — reset the first-run onboarding popup */
  .ms-reset-prompt {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    margin-top: 4px;
    padding: 7px 10px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px dashed rgba(148, 163, 184, 0.3);
    border-radius: 8px;
    color: #64748b;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: color 0.15s ease, border-color 0.15s ease,
      background 0.15s ease;
  }
  .ms-reset-prompt:hover:not(:disabled) {
    background: rgba(96, 165, 250, 0.1);
    border-color: rgba(96, 165, 250, 0.4);
    color: #93c5fd;
  }
  .ms-reset-prompt:disabled {
    opacity: 0.5;
    cursor: default;
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

  .marker-icon {
    background: rgba(167, 139, 250, 0.15);
    color: #a78bfa;
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
</style>
