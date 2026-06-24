<script lang="ts">
  import Icon from "@iconify/svelte"
  import { toast } from "svelte-sonner"
  import { connectedMapStore } from "$lib/stores/connectedMapStore"
  import { userSettingsStore } from "$lib/stores/userSettingsStore"
  import { userSettingsApi } from "$lib/api/userSettingsApi"

  const defaultImageryOptions = [
    { key: "mapbox", name: "Mapbox Satellite" },
    { key: "google_satellite", name: "Google Satellite" },
    { key: "bing_aerial", name: "Microsoft Bing Aerial" },
    { key: "esri_standard", name: "Esri World Imagery" },
    { key: "ndvi", name: "NDVI Vegetation Index" },
  ]

  // Derived from store — same pattern as app-information (no flash)
  $: zoomToLocationMarkers = $userSettingsStore.zoomToLocationMarkers ?? true
  $: zoomToPlacedMarkers = $userSettingsStore.zoomToPlacedMarkers ?? true
  $: autoConfirmMarkers = $userSettingsStore.autoConfirmMarkers ?? false
  $: defaultImagerySource = $userSettingsStore.defaultImagerySource ?? "mapbox"

  $: isConnected = $connectedMapStore?.id
  $: mapName = $connectedMapStore?.map_name || "Unknown Map"
  $: mapOwner = $connectedMapStore?.owner || "Unknown Owner"

  $: availableDefaultOptions = defaultImageryOptions

  async function toggleZoomToLocationMarkers() {
    const v = !zoomToLocationMarkers
    userSettingsStore.update(s => ({ ...s, zoomToLocationMarkers: v }))
    try {
      const r = await userSettingsApi.updateMarkerInteractionSettings(v, zoomToPlacedMarkers, autoConfirmMarkers)
      if (!r.success) { userSettingsStore.update(s => ({ ...s, zoomToLocationMarkers: !v })); toast.error("Failed") }
      else { toast.success(v ? "Zoom to location enabled" : "Zoom to location disabled") }
    } catch { userSettingsStore.update(s => ({ ...s, zoomToLocationMarkers: !v })); toast.error("Failed") }
  }

  async function toggleZoomToPlacedMarkers() {
    const v = !zoomToPlacedMarkers
    userSettingsStore.update(s => ({ ...s, zoomToPlacedMarkers: v }))
    try {
      const r = await userSettingsApi.updateMarkerInteractionSettings(zoomToLocationMarkers, v, autoConfirmMarkers)
      if (!r.success) { userSettingsStore.update(s => ({ ...s, zoomToPlacedMarkers: !v })); toast.error("Failed") }
      else { toast.success(v ? "Zoom to placed enabled" : "Zoom to placed disabled") }
    } catch { userSettingsStore.update(s => ({ ...s, zoomToPlacedMarkers: !v })); toast.error("Failed") }
  }

  async function toggleAutoConfirmMarkers() {
    const v = !autoConfirmMarkers
    userSettingsStore.update(s => ({ ...s, autoConfirmMarkers: v }))
    try {
      const r = await userSettingsApi.updateMarkerInteractionSettings(zoomToLocationMarkers, zoomToPlacedMarkers, v)
      if (!r.success) { userSettingsStore.update(s => ({ ...s, autoConfirmMarkers: !v })); toast.error("Failed") }
      else { toast.success(v ? "Auto-confirm enabled" : "Auto-confirm disabled") }
    } catch { userSettingsStore.update(s => ({ ...s, autoConfirmMarkers: !v })); toast.error("Failed") }
  }


  async function setDefaultImagerySource(e: Event) {
    const v = (e.target as HTMLSelectElement).value
    const prev = defaultImagerySource
    userSettingsStore.update(s => ({ ...s, defaultImagerySource: v }))
    try {
      const r = await userSettingsApi.updateDefaultImagerySource(v)
      if (!r.success) { userSettingsStore.update(s => ({ ...s, defaultImagerySource: prev })); toast.error(r.message || "Failed") }
      else { toast.success("Default imagery source updated") }
    } catch (err) { userSettingsStore.update(s => ({ ...s, defaultImagerySource: prev })); toast.error("An error occurred") }
  }
</script>

<svelte:head>
  <title>Map Preferences</title>
</svelte:head>

<div class="flex items-center justify-between border-b border-base-300 bg-base-100 p-5">
  <h2 class="flex items-center gap-2 text-xl font-semibold text-contrast-content">
    <div class="rounded-lg bg-base-content/10 p-1.5">
      <Icon icon="solar:global-bold-duotone" width="18" height="18" class="text-base-content" />
    </div>
    Map Preferences
  </h2>
</div>

<div class="space-y-4 p-6">

  <!-- Connected Map -->
  <div class="rounded-lg border border-base-300 bg-base-200/30 p-4">
    <div class="flex items-center gap-3">
      <div class="rounded-lg bg-base-content/10 p-2 flex-shrink-0">
        <Icon icon="solar:map-bold-duotone" width="18" height="18" class="text-base-content" />
      </div>
      <div class="flex-1 min-w-0">
        <span class="block text-sm text-contrast-content/60">Connected Map</span>
        {#if isConnected}
          <p class="font-medium text-contrast-content">{mapName}</p>
          <p class="text-xs text-contrast-content/60">Owned by {mapOwner}</p>
        {:else}
          <p class="font-medium text-contrast-content">No Map Connected</p>
        {/if}
      </div>
    </div>
  </div>

  <!-- Map Interaction -->
  <div class="rounded-lg border border-base-300 bg-base-200/30 p-4">
    <div class="space-y-4">
      <label class="flex items-start justify-between gap-3 cursor-pointer">
        <div class="flex items-start gap-3 min-w-0">
          <div class="rounded-lg bg-base-content/10 p-2 flex-shrink-0">
            <Icon icon="solar:gps-bold-duotone" width="18" height="18" class="text-base-content" />
          </div>
          <div class="min-w-0">
            <p class="text-sm font-medium text-contrast-content">Zoom to quick-drop markers</p>
            <p class="text-xs text-contrast-content/60">Automatically zoom when using quick-drop to place a pin at your current location</p>
          </div>
        </div>
        <input type="checkbox" class="toggle toggle-primary flex-shrink-0 mt-0.5" checked={zoomToLocationMarkers} on:change={toggleZoomToLocationMarkers} />
      </label>
      <label class="flex items-start justify-between gap-3 cursor-pointer">
        <div class="flex items-start gap-3 min-w-0">
          <div class="rounded-lg bg-base-content/10 p-2 flex-shrink-0">
            <Icon icon="solar:map-point-add-bold-duotone" width="18" height="18" class="text-base-content" />
          </div>
          <div class="min-w-0">
            <p class="text-sm font-medium text-contrast-content">Zoom to placed markers</p>
            <p class="text-xs text-contrast-content/60">Automatically zoom when manually placing pins on the map</p>
          </div>
        </div>
        <input type="checkbox" class="toggle toggle-primary flex-shrink-0 mt-0.5" checked={zoomToPlacedMarkers} on:change={toggleZoomToPlacedMarkers} />
      </label>
      <label class="flex items-start justify-between gap-3 cursor-pointer">
        <div class="flex items-start gap-3 min-w-0">
          <div class="rounded-lg bg-base-content/10 p-2 flex-shrink-0">
            <Icon icon="solar:check-circle-bold-duotone" width="18" height="18" class="text-base-content" />
          </div>
          <div class="min-w-0">
            <p class="text-sm font-medium text-contrast-content">Auto-confirm markers</p>
            <p class="text-xs text-contrast-content/60">Skip the marker edit panel and confirm pins immediately</p>
          </div>
        </div>
        <input type="checkbox" class="toggle toggle-primary flex-shrink-0 mt-0.5" checked={autoConfirmMarkers} on:change={toggleAutoConfirmMarkers} />
      </label>
    </div>
  </div>

  <!-- Satellite Imagery -->
  <div class="rounded-lg border border-base-300 bg-base-200/30 p-4">
    <div class="space-y-4">
      <div>
        <p class="text-sm font-medium text-contrast-content">Satellite Imagery</p>
        <p class="text-xs text-contrast-content/60">Choose which imagery source loads by default when opening the map</p>
      </div>
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex items-center gap-3">
          <div class="rounded-lg bg-base-content/10 p-1.5 flex-shrink-0">
            <Icon icon="solar:star-bold-duotone" width="16" height="16" class="text-base-content" />
          </div>
          <span class="text-sm text-contrast-content">Default source</span>
        </div>
        <select class="select select-bordered select-sm w-full sm:w-auto" value={defaultImagerySource} on:change={setDefaultImagerySource}>
          {#each availableDefaultOptions as opt}
            <option value={opt.key}>{opt.name}</option>
          {/each}
        </select>
      </div>
    </div>
  </div>
</div>
