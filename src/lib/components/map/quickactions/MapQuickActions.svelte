<!-- src/lib/components/map/quickactions/MapQuickActions.svelte -->
<!-- Orchestrator for the map's quick-action rail (the stack of circular
     buttons above the people menu, bottom-left). It evaluates every
     registered quick-action provider against the current map state and
     renders the items they return, plus the per-feature modals those items
     open (starting with the field-bin quick modal).

     To add a future feature to this space:
       1. write a provider (see providers/fieldBinsQuickAction.js)
       2. register it below — visibility rules live in the provider itself
     Nothing else needs to change. -->
<script>
  import { onDestroy, onMount } from "svelte"
  import { userSettingsStore } from "$lib/stores/userSettingsStore"
  import { confirmedMarkersStore } from "$lib/stores/markerStore"
  import { controlStore } from "$lib/stores/controlStore"
  import { locationPickStore } from "$lib/stores/locationPickStore"
  import { profileStore } from "$lib/stores/profileStore"
  import {
    chaserModalVehicleId,
    closeChaserBinModal,
    openChaserBinModal,
    quickActionProvidersStore,
    registerQuickActionProvider,
  } from "$lib/stores/mapQuickActionStore"
  import {
    chaserLoadsStore,
    loadChaserLoads,
    watchChaserLoads,
  } from "$lib/stores/chaserLoadsStore"
  import { grainBinGlyphsStore, loadGrainBinGlyphs } from "./fieldBinGlyph"
  import { createFieldBinsQuickAction } from "./providers/fieldBinsQuickAction"
  import { createChaserBinQuickAction } from "./providers/chaserBinQuickAction"
  import QuickActionRail from "./QuickActionRail.svelte"
  import FieldBinQuickModal from "./FieldBinQuickModal.svelte"
  import ChaserBinQuickModal from "./ChaserBinQuickModal.svelte"
  import { otherVehiclesStore, userVehicleStore } from "$lib/stores/vehicleStore"
  import { isChaserBinType } from "$lib/utils/grainLoad"

  export let map = null
  export let markerManagerRef = null
  export let mapEventManagerRef = null

  // Which field bin's quick modal is open (marker id) — null = closed.
  let openBinId = null
  /** @type {(() => void) | null} */
  let stopChaserLoadsWatch = null
  let lastLoadsMapId = null

  onMount(() => {
    void loadGrainBinGlyphs()
    // Grain bins (field + mother) — the first provider of the rail (each bin
    // is shown per its own binShowAlways flag).
    const unregisterBins = registerQuickActionProvider(
      createFieldBinsQuickAction({ openBin: (id) => (openBinId = id) }),
    )
    // One button per chaser bin on the map (yours and everyone else's). The
    // modal open state is shared, because the vehicle HUD's bottom bar opens
    // the same modal (see $lib/stores/mapQuickActionStore).
    const unregisterChaser = registerQuickActionProvider(
      createChaserBinQuickAction({ openChaser: openChaserBinModal }),
    )
    return () => {
      unregisterBins()
      unregisterChaser()
    }
  })

  // Chaser loads are shared map data: read them once per map, then follow the
  // realtime feed so a teammate's change lands here immediately. Realtime is
  // best-effort (the socket can drop — the map already polls for vehicle
  // positions on the same fallback), so a slow refresh keeps us converged.
  const CHASER_LOADS_REFRESH_MS = 20000
  /** @type {ReturnType<typeof setInterval> | null} */
  let chaserLoadsTimer = null

  $: mapId = $profileStore?.master_map_id || null
  $: if (mapId && mapId !== lastLoadsMapId) {
    lastLoadsMapId = mapId
    void loadChaserLoads(mapId)
    stopChaserLoadsWatch = watchChaserLoads(mapId)
    if (chaserLoadsTimer) clearInterval(chaserLoadsTimer)
    chaserLoadsTimer = setInterval(
      () => void loadChaserLoads(mapId),
      CHASER_LOADS_REFRESH_MS,
    )
  }

  onDestroy(() => {
    if (stopChaserLoadsWatch) stopChaserLoadsWatch()
    if (chaserLoadsTimer) clearInterval(chaserLoadsTimer)
  })

  // Providers decide what (if anything) the rail shows right now. The extra
  // ctx references ($userSettingsStore, $confirmedMarkersStore, glyph,
  // $userVehicleStore, $otherVehiclesStore, $chaserLoadsStore) make this
  // re-evaluate whenever any of them changes.
  $: items = $quickActionProvidersStore.flatMap(
    (provider) =>
      provider.getItems({
        map,
        settings: $userSettingsStore,
        markers: $confirmedMarkersStore,
        vehicle: $userVehicleStore,
        otherVehicles: $otherVehiclesStore,
        chaserLoads: $chaserLoadsStore,
        glyph: $grainBinGlyphsStore,
        canEdit: $profileStore?.user_type !== "viewer",
      }) || [],
  )

  // The open chaser resolves live from the stores — any chaser on the map can
  // be edited (that's where the shared chaser_loads rows come in). If the
  // machine leaves the map while the modal is open, it simply closes.
  $: chaserTarget = resolveChaserTarget(
    $chaserModalVehicleId,
    $userVehicleStore,
    $otherVehiclesStore,
  )

  /**
   * @param {string | null} vehicleId chaser's operator id
   * @param {any} ownVehicle
   * @param {any[]} others
   */
  function resolveChaserTarget(vehicleId, ownVehicle, others) {
    if (!vehicleId) return null
    if (ownVehicle?.vehicle_id === vehicleId) {
      if (!isChaserBinType(ownVehicle?.vehicle_marker?.type)) return null
      return {
        id: vehicleId,
        own: true,
        marker: ownVehicle.vehicle_marker,
        ownerName: "You",
      }
    }
    const other = (others || []).find((v) => v.vehicle_id === vehicleId)
    if (!other || !isChaserBinType(other?.vehicle_marker?.type)) return null
    return {
      id: vehicleId,
      own: false,
      marker: other.vehicle_marker,
      ownerName: (other.full_name || "Teammate").trim(),
    }
  }

  // Keep the rail out of the way while the vehicles menu is expanded (it
  // would overlap) or while a message location is being picked.
  $: railVisible =
    items.length > 0 &&
    !$controlStore.showVehicleMenu &&
    !$locationPickStore.active &&
    !$locationPickStore.captured

  // The open bin resolves live from the store — if another user deletes it
  // while the modal is open, openBin goes null and the modal simply closes.
  $: openBin = openBinId
    ? $confirmedMarkersStore.find((m) => m.id === openBinId) || null
    : null

  // "Locate": fly the map to the bin, then select it so its usual on-map
  // panel opens — move / stored grain / bin size / colour all live there.
  function locateBin(marker) {
    openBinId = null
    if (!marker) return
    if (map?.flyTo && marker.coordinates) {
      try {
        map.flyTo({
          center: marker.coordinates,
          zoom: Math.max(map.getZoom?.() ?? 0, 15),
          duration: 900,
        })
      } catch {
        // ignore — selecting below still highlights the bin
      }
    }
    // Register the bin as the ACTIVE map selection first (same as the
    // toolbox's "locate marker") so the normal tap-empty-space-to-deselect
    // flow knows there is a marker selected and clears it.
    mapEventManagerRef?.setSelection?.(
      "marker",
      `marker-${marker.id}`,
      markerManagerRef,
    )
    markerManagerRef?.handleMarkerSelection?.({
      features: [
        {
          properties: { id: marker.id },
          geometry: { coordinates: marker.coordinates },
        },
      ],
    })
  }
</script>

{#if railVisible}
  <QuickActionRail
    {items}
    bottomOffset={$profileStore?.user_type === "viewer" ? 76 : 206}
  />
{/if}

{#if openBin}
  <FieldBinQuickModal
    marker={openBin}
    {markerManagerRef}
    on:close={() => (openBinId = null)}
    on:locate={(e) => locateBin(e.detail)}
  />
{/if}

{#if chaserTarget}
  <ChaserBinQuickModal
    chaser={chaserTarget}
    markers={$confirmedMarkersStore}
    {markerManagerRef}
    glyphs={$grainBinGlyphsStore}
    on:close={closeChaserBinModal}
  />
{/if}
