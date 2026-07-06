<!-- src/lib/components/map/trails/SprayRecordThumbnail.svelte -->
<!--
  Displays a satellite thumbnail of a spray record's field + trail path.
  Uses the shared thumbnailRenderer singleton — ONE Mapbox map load total,
  not one per record. Results are cached in memory after first render.
-->
<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from "svelte"
  import { requestThumbnail, thumbnailCache } from "$lib/utils/thumbnailRenderer"
  import { Loader2 } from "lucide-svelte"

  export let fieldBoundary: any = null
  export let record: any = null
  export let width = 120
  export let height = 90

  const dispatch = createEventDispatcher()

  let dataUrl = ""
  let loading = true
  let unsub: (() => void) | null = null

  onMount(() => {
    if (!fieldBoundary || !record) {
      loading = false
      return
    }

    const rid = record.id
    console.log(`[Thumbnail] Requesting record=${rid.slice(0,8)} field=${record.field_name || "?"} intervals=${record.interval_paths?.length || 0} hasFieldPath=${!!record.field_path?.coordinates?.length}`)
    if (fieldBoundary) {
      const firstRing = fieldBoundary.type === "MultiPolygon" ? fieldBoundary.coordinates[0][0] : fieldBoundary.coordinates[0]
      const fp = (firstRing as any)[0]
      console.log(`[Thumbnail]   boundary type=${fieldBoundary.type} coords=[${fp[0]},${fp[1]}]`)
    }

    requestThumbnail({ recordId: rid, fieldBoundary, record })

    unsub = thumbnailCache.subscribe((cache) => {
      const url = cache[rid]
      if (url) {
        console.log(`[Thumbnail] Cache hit record=${rid.slice(0,8)}`)
        dataUrl = url
        loading = false
        dispatch("ready", { dataUrl: url, recordId: rid })
        if (unsub) { unsub(); unsub = null }
      }
    })
  })

  onDestroy(() => {
    if (unsub) { unsub(); unsub = null }
  })
</script>

<div class="thumbnail-container" style="width:{width}px;height:{height}px">
  {#if loading}
    <div class="thumbnail-loading">
      <Loader2 size={14} class="animate-spin text-white/30" />
    </div>
  {:else if dataUrl}
    <img src={dataUrl} alt="Field snapshot" class="thumbnail-img" title="{record?.field_name || 'Unknown'} — {record?.id?.slice(0,8)}" />
  {:else}
    <div class="thumbnail-error">✗</div>
  {/if}
</div>

<style>
  .thumbnail-container {
    position: relative;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.1);
    flex-shrink: 0;
    cursor: pointer;
    transition: transform 0.2s, border-color 0.2s;
    background: #1a1a2e;
  }
  .thumbnail-container:hover {
    transform: scale(1.05);
    border-color: rgba(59, 130, 246, 0.4);
  }
  .thumbnail-loading {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .thumbnail-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .thumbnail-error {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(255, 255, 255, 0.3);
    font-size: 18px;
  }
</style>