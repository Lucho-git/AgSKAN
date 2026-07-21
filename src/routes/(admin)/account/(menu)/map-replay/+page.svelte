<script lang="ts">
  import MapReplay from "./MapReplay.svelte"
  import { Loader2 } from "lucide-svelte"
  import { getContext } from "svelte"
  import type { Writable } from "svelte/store"

  export let data
  let adminSection: Writable<string> = getContext("adminSection")
  adminSection.set("map-replay")

  $: records = data.records || []
  $: fields = data.fields || []
  $: loading = data.loading
  $: pageError = data.error
</script>

<div class="map-replay-page">
  {#if loading}
    <div class="loading-state">
      <Loader2 size={32} class="animate-spin text-blue-400" />
      <p>Loading map replay...</p>
    </div>
  {:else if pageError}
    <div class="error-state">
      <p>Error: {pageError}</p>
    </div>
  {:else}
    <MapReplay {records} {fields} />
  {/if}
</div>

<style>
  .map-replay-page {
    position: fixed;
    inset: 0;
    top: 0;
    z-index: 100;
    background: #0a0a0f;
  }
  .loading-state, .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 16px;
    color: rgba(255,255,255,0.6);
    font-size: 14px;
  }
</style>
