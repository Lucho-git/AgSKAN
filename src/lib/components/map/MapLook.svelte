<!-- src/lib/components/map/MapLook.svelte -->
<!-- Renderless. Keeps the live map painted with the current "look" (see
     $lib/utils/mapLook.ts): imagery treatment, the wash outside paddocks, and
     trail colour/opacity. Field paint is applied by MapFields, which owns those
     layers. New trail layers read the look when they are created, so this only
     has to repaint on a look change, plus keep imagery layers (which are
     removed and re-added on provider switch) in line. -->
<script lang="ts">
  import { onDestroy } from "svelte"
  import { currentLook } from "$lib/stores/mapLookStore"
  import { mapFieldsStore } from "$lib/stores/mapFieldsStore"
  import {
    applyBasemapLabels,
    applyBasemapLook,
    applyOutsideLook,
    applyTrailLook,
    type MapboxMap,
  } from "$lib/utils/mapLookApply"

  export let map: MapboxMap
  export let mapLoaded = false
  /** Field list for the outside wash. Defaults to the connected map's fields. */
  export let fields: Array<{
    boundary?: { type: string; coordinates: unknown } | null
  }> | null = null

  let attached = false
  let styleTimer: ReturnType<typeof setTimeout> | null = null

  function ready() {
    try {
      return !!map && mapLoaded && !!map.getStyle()
    } catch {
      return false
    }
  }

  /** Imagery and stacking: cheap, and safe to run whenever the style changes. */
  function applyStyleBound() {
    if (!ready()) return
    applyBasemapLook(map, $currentLook)
    applyBasemapLabels(map, $currentLook)
    applyOutsideLook(map, $currentLook)
  }

  function applyAll() {
    if (!ready()) return
    applyBasemapLook(map, $currentLook)
    applyBasemapLabels(map, $currentLook)
    applyOutsideLook(map, $currentLook, fields ?? $mapFieldsStore)
    applyTrailLook(map, $currentLook)
  }

  function onStyleData() {
    if (styleTimer) return
    styleTimer = setTimeout(() => {
      styleTimer = null
      applyStyleBound()
    }, 150)
  }

  $: if (map && mapLoaded && !attached) {
    attached = true
    map.on("styledata", onStyleData)
    map.on("style.load", applyAll)
  }

  // Repaint on a look change or when the field list changes.
  $: if (attached) {
    $currentLook
    $mapFieldsStore
    fields
    applyAll()
  }

  onDestroy(() => {
    if (styleTimer) clearTimeout(styleTimer)
    try {
      map?.off("styledata", onStyleData)
      map?.off("style.load", applyAll)
    } catch {
      /* map already removed */
    }
  })
</script>
