<!-- src/routes/(admin)/account/(menu)/fieldview/DuplicateFieldCleaner.svelte -->
<script lang="ts">
  import { onMount } from "svelte"
  import { get } from "svelte/store"
  import { supabase } from "$lib/supabaseClient"
  import { session } from "$lib/stores/sessionStore"
  import { toast } from "svelte-sonner"
  import { Loader2, AlertCircle, Check, Trash2, Layers } from "lucide-svelte"
  import SprayRecordThumbnail from "$lib/components/map/trails/SprayRecordThumbnail.svelte"

  let duplicates: any[] = []
  let loading = true
  let expanded = false
  let resolving = false

  onMount(() => loadDuplicates())

  async function loadDuplicates() {
    loading = true
    try {
      const s = get(session)
      const { data: profile } = await supabase.from("profiles")
        .select("master_map_id").eq("id", s?.user?.id).single()
      const mapId = profile?.master_map_id
      if (!mapId) { duplicates = []; return }
      const { data, error } = await supabase.rpc("find_duplicate_fields", { p_map_id: mapId })
      if (error) throw error
      duplicates = (data || []).map((d: any) => ({ ...d, keepA: true }))
    } catch (e: any) {
      toast.error(e.message || "Failed to load duplicates")
    } finally { loading = false }
  }

  function toggleKeep(idx: number) {
    duplicates[idx].keepA = !duplicates[idx].keepA
    duplicates = [...duplicates]
  }
  function keepAllLeft() { duplicates.forEach(d => d.keepA = true); duplicates = [...duplicates] }
  function keepAllRight() { duplicates.forEach(d => d.keepA = false); duplicates = [...duplicates] }

  async function removeAllUnselected() {
    if (!confirm(`Remove ${duplicates.length} unselected field${duplicates.length !== 1 ? "s" : ""}? Selected fields will be kept.`)) return
    resolving = true
    let done = 0
    for (const d of duplicates) {
      const deleteId = d.keepA ? d.field_b_id : d.field_a_id
      const keepId = d.keepA ? d.field_a_id : d.field_b_id
      try {
        const { error } = await supabase.rpc("delete_duplicate_field", { p_delete_field_id: deleteId, p_keep_field_id: keepId })
        if (!error) done++
      } catch (_) {}
    }
    await loadDuplicates()
    resolving = false
    toast.success(`Removed ${done} duplicate${done !== 1 ? "s" : ""}`)
  }
</script>

<div class="dup-cleaner">
  <button class="dup-toggle" on:click={() => (expanded = !expanded)}>
    <Layers size={16} /> <span>Duplicate Field Cleaner</span>
    {#if duplicates.length > 0}<span class="dup-badge">{duplicates.length}</span>{/if}
  </button>
  {#if expanded}
    <div class="dup-panel">
      {#if loading}
        <div class="dup-loading"><Loader2 size={20} class="animate-spin text-blue-400" /> Scanning fields...</div>
      {:else if duplicates.length === 0}
        <div class="dup-empty"><Check size={20} class="text-green-400" /> <span>No duplicate fields found</span></div>
      {:else}
        <div class="dup-toolbar">
          <AlertCircle size={14} class="text-amber-400" />
          <span>{duplicates.length} pair{duplicates.length !== 1 ? "s" : ""}</span>
          <span class="dup-hint">— Click a field to select it for keeping</span>
          <button class="dup-side-btn" on:click={keepAllLeft}>Keep all left</button>
          <button class="dup-side-btn" on:click={keepAllRight}>Keep all right</button>
        </div>
        <div class="dup-list">
          {#each duplicates as dup, i}
            <div class="dup-item">
              <button class="dup-field" class:selected={dup.keepA} on:click={() => toggleKeep(i)}>
                <SprayRecordThumbnail fieldBoundary={null} record={{ id: `dup-${dup.field_a_id}` }} width={80} height={60} />
                <div class="dup-field-info">
                  <span class="dup-field-name">{dup.field_a_name}</span>
                  {#if dup.field_a_farm}<span class="dup-field-farm">{dup.field_a_farm}</span>{/if}
                  <span class="dup-field-area">{dup.field_a_area_ha} ha</span>
                  {#if dup.keepA}<span class="dup-keep-badge">Keeping</span>{/if}
                </div>
              </button>
              <span class="dup-vs">vs</span>
              <button class="dup-field" class:selected={!dup.keepA} on:click={() => toggleKeep(i)}>
                <SprayRecordThumbnail fieldBoundary={null} record={{ id: `dup-${dup.field_b_id}` }} width={80} height={60} />
                <div class="dup-field-info">
                  <span class="dup-field-name">{dup.field_b_name}</span>
                  {#if dup.field_b_farm}<span class="dup-field-farm">{dup.field_b_farm}</span>{/if}
                  <span class="dup-field-area">{dup.field_b_area_ha} ha</span>
                  {#if !dup.keepA}<span class="dup-keep-badge">Keeping</span>{/if}
                </div>
              </button>
            </div>
          {/each}
        </div>
        <div class="dup-footer">
          <button class="dup-remove-btn" on:click={removeAllUnselected} disabled={resolving || duplicates.length === 0}>
            {#if resolving}<Loader2 size={16} class="animate-spin" />{:else}<Trash2 size={16} />{/if}
            Remove all unselected fields ({duplicates.length})
          </button>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .dup-cleaner { margin-bottom: 16px; }
  .dup-toggle { display: flex; align-items: center; gap: 8px; padding: 10px 16px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; color: rgba(255,255,255,0.7); font-size: 14px; cursor: pointer; width: 100%; text-align: left; transition: all 0.2s; }
  .dup-toggle:hover { background: rgba(255,255,255,0.06); }
  .dup-badge { margin-left: auto; background: rgba(239,68,68,0.2); color: #f87171; font-size: 11px; padding: 2px 8px; border-radius: 10px; font-weight: 600; }
  .dup-panel { margin-top: 8px; padding: 16px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; position: relative; }
  .dup-loading, .dup-empty { display: flex; align-items: center; gap: 8px; color: rgba(255,255,255,0.5); font-size: 13px; padding: 12px 0; }
  .dup-toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; color: rgba(251,191,36,0.8); font-size: 12px; flex-wrap: wrap; }
  .dup-hint { color: rgba(255,255,255,0.4); }
  .dup-side-btn { padding: 5px 10px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; color: rgba(255,255,255,0.6); font-size: 11px; cursor: pointer; transition: all 0.15s; }
  .dup-side-btn:hover { background: rgba(255,255,255,0.1); color: white; }
  .dup-list { display: flex; flex-direction: column; gap: 10px; max-height: 400px; overflow-y: auto; padding-bottom: 10px; }
  .dup-item { display: flex; align-items: center; gap: 8px; padding: 10px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: 8px; }
  .dup-field { display: flex; align-items: center; gap: 8px; flex: 1; padding: 8px; background: none; border: 2px solid rgba(255,255,255,0.06); border-radius: 8px; color: white; cursor: pointer; text-align: left; transition: all 0.2s; min-width: 0; }
  .dup-field:hover { border-color: rgba(255,255,255,0.2); }
  .dup-field.selected { border-color: rgba(34,197,94,0.5); background: rgba(34,197,94,0.06); }
  .dup-field-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .dup-field-name { font-size: 13px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dup-field-farm { font-size: 10px; color: rgba(255,255,255,0.3); font-style: italic; }
  .dup-field-area { font-size: 11px; color: rgba(255,255,255,0.4); }
  .dup-keep-badge { font-size: 10px; color: #4ade80; font-weight: 600; }
  .dup-vs { font-size: 11px; color: rgba(255,255,255,0.2); flex-shrink: 0; }
  .dup-footer { position: sticky; bottom: 0; padding: 12px 0 0 0; background: linear-gradient(transparent, rgba(0,0,0,0.95) 30%); }
  .dup-remove-btn { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 10px 20px; width: 100%; background: rgba(239,68,68,0.15); border: 1px solid rgba(239,68,68,0.25); border-radius: 8px; color: #f87171; font-size: 14px; font-weight: 500; cursor: pointer; transition: all 0.2s; }
  .dup-remove-btn:hover:not(:disabled) { background: rgba(239,68,68,0.25); }
  .dup-remove-btn:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
