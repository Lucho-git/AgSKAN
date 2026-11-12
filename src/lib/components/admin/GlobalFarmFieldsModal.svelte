<!-- src/lib/components/admin/GlobalFarmFieldsModal.svelte -->
<!-- Admin field editor for one map on the global map: its farm names (add,
     delete), its fields (search, select, move to another farm name, delete)
     and uploading a boundary file straight onto the map. Sits over the dark
     map, so it uses the fixed map-overlay look. -->
<script lang="ts">
  import { onMount } from "svelte"
  import Icon from "@iconify/svelte"
  import { Check, Plus, Search, Trash2, Upload, X } from "lucide-svelte"
  import { toast } from "svelte-sonner"
  import { adminApi, type AdminMapField, type GlobalFarm } from "$lib/api/adminApi"
  import { farmApi, FARM_NAME_MAX_LENGTH } from "$lib/api/farmApi"
  import { fileApi } from "$lib/api/fileApi"
  import { processBoundariesApi } from "$lib/api/processBoundariesApi"
  import type { Farm } from "$lib/stores/farmsStore"
  import type { Paddock } from "$lib/types"
  import { formatHa } from "$lib/utils/globalFarmMap"

  export let farm: GlobalFarm
  /** Called on close when anything was changed, so the map can reload. */
  export let onClose: (changed: boolean) => void

  const NO_FARM = "none"

  let loading = true
  let loadError = ""
  let fields: AdminMapField[] = []
  let farmNames: Farm[] = []
  let changed = false
  let busy = false

  let filter = "all" // "all", NO_FARM, or a farm name's id
  let search = ""
  let selected = new Set<string>()
  let confirmingDelete = false

  let newFarmName = ""
  let deletingFarmId: string | null = null

  // ── Derived ───────────────────────────────────────────────────────────────
  $: farmNameById = new Map(farmNames.map((f) => [f.id, f.name]))
  $: countByFarm = fields.reduce((counts, f) => {
    const key = f.farm_id && farmNameById.has(f.farm_id) ? f.farm_id : NO_FARM
    counts.set(key, (counts.get(key) || 0) + 1)
    return counts
  }, new Map<string, number>())
  $: shown = fields.filter((f) => {
    const key = f.farm_id && farmNameById.has(f.farm_id) ? f.farm_id : NO_FARM
    if (filter !== "all" && key !== filter) return false
    const q = search.trim().toLowerCase()
    return !q || f.name.toLowerCase().includes(q)
  })
  $: shownSelected = shown.filter((f) => selected.has(f.field_id)).length
  $: allShownSelected = shown.length > 0 && shownSelected === shown.length
  $: selectedHa = fields
    .filter((f) => selected.has(f.field_id))
    .reduce((sum, f) => sum + (Number(f.area) || 0), 0)
  $: totalHa = fields.reduce((sum, f) => sum + (Number(f.area) || 0), 0)
  // Any change to the selection cancels a half-confirmed delete.
  $: selected, (confirmingDelete = false)

  async function load() {
    const [fieldsResult, farmsResult] = await Promise.all([
      adminApi.fetchMapFields(farm.id),
      farmApi.loadFarms(farm.id),
    ])
    if (!fieldsResult.success || farmsResult.error) {
      loadError = fieldsResult.error || farmsResult.error || "Failed to load fields"
    } else {
      loadError = ""
      fields = fieldsResult.data
      farmNames = farmsResult.farms
      // Drop selections and filters that no longer exist.
      const ids = new Set(fields.map((f) => f.field_id))
      selected = new Set([...selected].filter((id) => ids.has(id)))
      if (filter !== "all" && filter !== NO_FARM && !farmNames.some((f) => f.id === filter)) {
        filter = "all"
      }
    }
    loading = false
  }

  onMount(load)

  // ── Selection ─────────────────────────────────────────────────────────────
  function toggle(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    selected = next
  }

  function toggleAllShown() {
    const next = new Set(selected)
    if (allShownSelected) shown.forEach((f) => next.delete(f.field_id))
    else shown.forEach((f) => next.add(f.field_id))
    selected = next
  }

  // ── Farm names ────────────────────────────────────────────────────────────
  async function addFarmName() {
    const name = newFarmName.trim()
    if (!name || busy) return
    busy = true
    const result = await farmApi.createFarm(farm.id, name)
    busy = false
    if (!result.success) {
      toast.error(result.message || "Couldn't add the farm name")
      return
    }
    newFarmName = ""
    changed = true
    toast.success(`Added "${result.farm?.name ?? name}"`)
    await load()
  }

  async function deleteFarmName(id: string) {
    if (busy) return
    busy = true
    const name = farmNameById.get(id)
    const result = await farmApi.deleteFarm(id)
    busy = false
    deletingFarmId = null
    if (!result.success) {
      toast.error(result.message || "Couldn't delete the farm name")
      return
    }
    changed = true
    toast.success(`Deleted "${name}" — its fields are kept, without a farm name`)
    await load()
  }

  // ── Bulk actions ──────────────────────────────────────────────────────────
  async function moveSelected(farmId: string | null) {
    if (!selected.size || busy) return
    busy = true
    const count = selected.size
    const result = await adminApi.moveFields(farm.id, [...selected], farmId)
    busy = false
    if (!result.success) {
      toast.error(result.error || "Couldn't move the fields")
      return
    }
    changed = true
    selected = new Set()
    toast.success(
      `Moved ${count} ${count === 1 ? "field" : "fields"} to ${farmId ? `"${farmNameById.get(farmId)}"` : "no farm name"}`,
    )
    await load()
  }

  async function deleteSelected() {
    if (!selected.size || busy) return
    if (!confirmingDelete) {
      confirmingDelete = true
      return
    }
    busy = true
    const count = selected.size
    const result = await adminApi.deleteFields(farm.id, [...selected])
    busy = false
    if (!result.success) {
      toast.error(result.error || "Couldn't delete the fields")
      await load()
      return
    }
    changed = true
    selected = new Set()
    toast.success(`Deleted ${count} ${count === 1 ? "field" : "fields"}`)
    await load()
  }

  // ── Upload ────────────────────────────────────────────────────────────────
  let fileInput: HTMLInputElement
  let uploadState: "idle" | "reading" | "review" | "saving" = "idle"
  let uploadError = ""
  let uploadFileName = ""
  let pending: Paddock[] = []
  let uploadFarmId: string | null = null

  $: pendingHa = pending.reduce((sum, p) => sum + (Number(p.area) || 0), 0)

  async function handleFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    input.value = ""
    if (!file) return
    uploadState = "reading"
    uploadError = ""
    uploadFileName = file.name
    pending = []

    // The file is parsed from the admin's own file store, as on the Fields
    // page. A same-named file from an earlier upload is replaced first.
    let stored: any = await fileApi.uploadFile(file)
    if (!stored.success && /exist|duplicate|unique/i.test(stored.message || "")) {
      await fileApi.deleteFile(file.name)
      stored = await fileApi.uploadFile(file)
    }
    if (!stored.success) {
      uploadError = stored.message || "Couldn't upload the file"
      uploadState = "idle"
      return
    }

    const result = await processBoundariesApi.processFile(file.name)
    const paddocks: Paddock[] = (result?.paddocks || []).filter((p: Paddock) => p?.boundary)
    if (result?.status !== "success" || paddocks.length === 0) {
      uploadError = result?.message || "No field boundaries were found in that file"
      uploadState = "idle"
      return
    }
    pending = paddocks
    uploadFarmId = filter !== "all" && filter !== NO_FARM ? filter : null
    uploadState = "review"
  }

  async function savePending() {
    if (!pending.length) return
    uploadState = "saving"
    const result: any = await fileApi.uploadFields(
      farm.id,
      pending.map((p) => ({
        ...p,
        status: "accepted" as const,
        farm_id: uploadFarmId ?? undefined,
      })),
    )
    const added = result.insertedFields?.length || 0
    const rejected = result.rejectedFields?.length || 0
    if (added > 0) {
      changed = true
      toast.success(
        `Added ${added} ${added === 1 ? "field" : "fields"}${rejected ? ` · ${rejected} skipped (${[...new Set(result.rejectedFields.map((r: any) => r.reason))].join(", ")})` : ""}`,
      )
      pending = []
      uploadState = "idle"
      await load()
    } else {
      uploadError = result.message || "None of the fields could be added"
      uploadState = "review"
    }
  }

  function cancelUpload() {
    pending = []
    uploadError = ""
    uploadState = "idle"
  }

  function close() {
    onClose(changed)
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key !== "Escape") return
    event.stopPropagation()
    close()
  }

  const chip =
    "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors"
  const chipOff = "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
  const chipOn = "border-white/40 bg-white/15 text-white"
</script>

<svelte:window on:keydown|capture={handleKeydown} />

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
<div
  class="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm"
  on:click|self={close}
>
  <div class="flex h-full max-h-[760px] w-full max-w-[680px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/85 text-white shadow-2xl backdrop-blur-xl">
    <!-- Header -->
    <div class="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
      <div class="flex min-w-0 items-center gap-2.5">
        <span class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white/10">
          <Icon icon="solar:map-bold-duotone" width="18" height="18" class="text-white/80" />
        </span>
        <div class="min-w-0">
          <h2 class="truncate text-sm font-semibold">
            {farm.map_name?.trim() || "Unnamed map"} · fields
          </h2>
          <p class="truncate text-[11px] text-white/50">
            {#if loading}
              Loading…
            {:else}
              {fields.length.toLocaleString("en-AU")} fields · {formatHa(totalHa)} · {farmNames.length}
              {farmNames.length === 1 ? "farm name" : "farm names"}
            {/if}
          </p>
        </div>
      </div>
      <button
        type="button"
        class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition-colors hover:bg-white/10"
        title="Close"
        on:click={close}
      >
        <X class="h-4 w-4 text-white/70" />
      </button>
    </div>

    {#if loading}
      <div class="flex flex-1 items-center justify-center">
        <span class="loading loading-spinner loading-md text-white/60"></span>
      </div>
    {:else if loadError}
      <div class="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p class="text-xs text-red-300">{loadError}</p>
        <button
          type="button"
          class="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium hover:bg-white/20"
          on:click={() => {
            loading = true
            load()
          }}
        >
          Try again
        </button>
      </div>
    {:else}
      <!-- Farm names: filter, add, delete -->
      <div class="space-y-2 border-b border-white/10 px-4 py-3">
        <p class="text-[10px] font-semibold uppercase tracking-wider text-white/50">Farm names</p>
        <div class="flex flex-wrap items-center gap-1.5">
          <button type="button" class="{chip} {filter === 'all' ? chipOn : chipOff}" on:click={() => (filter = "all")}>
            All
            <span class="font-semibold tabular-nums">{fields.length}</span>
          </button>
          {#each farmNames as name (name.id)}
            {#if deletingFarmId === name.id}
              <span class="{chip} border-red-400/60 bg-red-500/15 text-red-100">
                Delete "{name.name}"?
                <button
                  type="button"
                  class="flex h-5 w-5 items-center justify-center rounded-full bg-red-500/80 hover:bg-red-500"
                  title="Yes, delete this farm name (its fields are kept)"
                  disabled={busy}
                  on:click={() => deleteFarmName(name.id)}
                >
                  <Check class="h-3 w-3" />
                </button>
                <button
                  type="button"
                  class="flex h-5 w-5 items-center justify-center rounded-full hover:bg-white/15"
                  title="Keep it"
                  on:click={() => (deletingFarmId = null)}
                >
                  <X class="h-3 w-3" />
                </button>
              </span>
            {:else}
              <span class="{chip} {filter === name.id ? chipOn : chipOff} pr-1">
                <button type="button" class="flex items-center gap-1.5" on:click={() => (filter = name.id)}>
                  {name.name}
                  <span class="font-semibold tabular-nums">{countByFarm.get(name.id) || 0}</span>
                </button>
                <button
                  type="button"
                  class="flex h-5 w-5 items-center justify-center rounded-full text-white/40 hover:bg-white/15 hover:text-red-300"
                  title="Delete this farm name"
                  on:click={() => (deletingFarmId = name.id)}
                >
                  <X class="h-3 w-3" />
                </button>
              </span>
            {/if}
          {/each}
          {#if countByFarm.get(NO_FARM)}
            <button type="button" class="{chip} {filter === NO_FARM ? chipOn : chipOff}" on:click={() => (filter = NO_FARM)}>
              No farm name
              <span class="font-semibold tabular-nums">{countByFarm.get(NO_FARM)}</span>
            </button>
          {/if}
          <form class="flex items-center gap-1" on:submit|preventDefault={addFarmName}>
            <input
              type="text"
              class="w-32 rounded-full border border-dashed border-white/25 bg-transparent px-3 py-1 text-xs text-white placeholder-white/35 focus:border-white/50 focus:outline-none"
              placeholder="New farm name"
              maxlength={FARM_NAME_MAX_LENGTH}
              bind:value={newFarmName}
            />
            <button
              type="submit"
              class="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20 disabled:opacity-40"
              title="Add farm name"
              disabled={!newFarmName.trim() || busy}
            >
              <Plus class="h-3.5 w-3.5" />
            </button>
          </form>
        </div>
      </div>

      <!-- Search + upload -->
      <div class="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
        <div class="relative flex-1">
          <Search class="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40" />
          <input
            type="text"
            class="w-full rounded-lg border border-white/10 bg-white/5 py-1.5 pl-8 pr-2 text-xs text-white placeholder-white/35 focus:border-white/30 focus:outline-none"
            placeholder="Search fields…"
            bind:value={search}
          />
        </div>
        <input
          bind:this={fileInput}
          type="file"
          class="hidden"
          accept=".zip,.kml,.geojson,.xml"
          on:change={handleFile}
        />
        <button
          type="button"
          class="flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-white/20 disabled:opacity-50"
          title="Shapefile ZIP, KML, GeoJSON or ISOXML"
          disabled={uploadState !== "idle"}
          on:click={() => fileInput.click()}
        >
          <Upload class="h-3.5 w-3.5" />
          Upload fields
        </button>
      </div>

      <!-- Upload progress / review -->
      {#if uploadState !== "idle" || uploadError}
        <div class="border-b border-white/10 bg-white/[0.04] px-4 py-3">
          {#if uploadState === "reading"}
            <p class="flex items-center gap-2 text-xs text-white/70">
              <span class="loading loading-spinner loading-xs"></span>
              Reading {uploadFileName}…
            </p>
          {:else if uploadState === "review" || uploadState === "saving"}
            <div class="space-y-2">
              <p class="text-xs">
                <span class="font-semibold">{pending.length} {pending.length === 1 ? "field" : "fields"}</span>
                <span class="text-white/60">
                  found in {uploadFileName}{pendingHa ? ` · ${formatHa(pendingHa)}` : ""}
                </span>
              </p>
              <p class="max-h-12 overflow-y-auto text-[11px] leading-snug text-white/50">
                {pending.map((p) => p.name).join(", ")}
              </p>
              <div class="flex flex-wrap items-center gap-1.5">
                <span class="text-[10px] font-semibold uppercase tracking-wider text-white/50">Add under</span>
                <button type="button" class="{chip} {uploadFarmId === null ? chipOn : chipOff}" on:click={() => (uploadFarmId = null)}>
                  No farm name
                </button>
                {#each farmNames as name (name.id)}
                  <button type="button" class="{chip} {uploadFarmId === name.id ? chipOn : chipOff}" on:click={() => (uploadFarmId = name.id)}>
                    {name.name}
                  </button>
                {/each}
              </div>
              {#if uploadError}
                <p class="text-xs text-red-300">{uploadError}</p>
              {/if}
              <div class="flex items-center justify-end gap-2">
                <button
                  type="button"
                  class="rounded-lg px-3 py-1.5 text-xs font-medium text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                  disabled={uploadState === "saving"}
                  on:click={cancelUpload}
                >
                  Discard
                </button>
                <button
                  type="button"
                  class="rounded-[10px] bg-gradient-to-br from-green-500 to-green-600 px-4 py-2 text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
                  disabled={uploadState === "saving"}
                  on:click={savePending}
                >
                  {uploadState === "saving" ? "Adding…" : `Add ${pending.length} to this map`}
                </button>
              </div>
            </div>
          {:else if uploadError}
            <div class="flex items-start justify-between gap-2">
              <p class="text-xs text-red-300">{uploadError}</p>
              <button
                type="button"
                class="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full hover:bg-white/10"
                title="Dismiss"
                on:click={() => (uploadError = "")}
              >
                <X class="h-3 w-3 text-white/60" />
              </button>
            </div>
          {/if}
        </div>
      {/if}

      <!-- Field list -->
      <div class="flex items-center gap-3 border-b border-white/10 px-4 py-2 text-[11px] text-white/55">
        <label class="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            class="checkbox checkbox-xs border-white/40"
            checked={allShownSelected}
            disabled={shown.length === 0}
            on:change={toggleAllShown}
          />
          Select all {shown.length.toLocaleString("en-AU")} shown
        </label>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto">
        {#if shown.length === 0}
          <p class="p-8 text-center text-xs text-white/50">
            {fields.length === 0 ? "This map has no fields yet. Upload a boundary file to add some." : "No fields match."}
          </p>
        {:else}
          <ul>
            {#each shown as field (field.field_id)}
              <li>
                <label
                  class="flex cursor-pointer items-center gap-3 border-b border-white/5 px-4 py-1.5 transition-colors hover:bg-white/10 {selected.has(field.field_id) ? 'bg-white/[0.07]' : ''}"
                >
                  <input
                    type="checkbox"
                    class="checkbox checkbox-xs border-white/40"
                    checked={selected.has(field.field_id)}
                    on:change={() => toggle(field.field_id)}
                  />
                  <span class="min-w-0 flex-1 truncate text-xs">{field.name}</span>
                  <span class="w-28 flex-shrink-0 truncate text-right text-[11px] text-white/50">
                    {(field.farm_id && farmNameById.get(field.farm_id)) || "—"}
                  </span>
                  <span class="w-16 flex-shrink-0 text-right text-[11px] tabular-nums text-white/60">
                    {field.area != null ? `${Math.round(Number(field.area)).toLocaleString("en-AU")} ha` : "—"}
                  </span>
                </label>
              </li>
            {/each}
          </ul>
        {/if}
      </div>

      <!-- Footer: bulk actions on the selection -->
      <div class="border-t border-white/10 px-4 py-3">
        {#if selected.size === 0}
          <p class="text-[11px] text-white/45">
            Tick fields to move them to another farm name or delete them.
          </p>
        {:else}
          <div class="space-y-2">
            <div class="flex items-center justify-between gap-2">
              <p class="text-xs">
                <span class="font-semibold">{selected.size.toLocaleString("en-AU")} selected</span>
                <span class="text-white/55">· {formatHa(selectedHa)}</span>
                <button
                  type="button"
                  class="ml-1 text-[11px] text-white/50 underline underline-offset-2 hover:text-white"
                  on:click={() => (selected = new Set())}
                >
                  clear
                </button>
              </p>
              <button
                type="button"
                class="flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-50 {confirmingDelete
                  ? 'bg-gradient-to-br from-red-500 to-red-600'
                  : 'border border-red-400/40 bg-red-500/10 text-red-200'}"
                disabled={busy}
                on:click={deleteSelected}
              >
                <Trash2 class="h-3.5 w-3.5" />
                {confirmingDelete
                  ? `Yes, permanently delete ${selected.size}`
                  : `Delete ${selected.size}`}
              </button>
            </div>
            {#if confirmingDelete}
              <p class="text-[11px] text-red-200/90">
                This can't be undone. Spray records on these fields are deleted with them; trails are kept.
              </p>
            {/if}
            <div class="flex flex-wrap items-center gap-1.5">
              <span class="text-[10px] font-semibold uppercase tracking-wider text-white/50">Move to</span>
              {#each farmNames as name (name.id)}
                <button type="button" class="{chip} {chipOff}" disabled={busy} on:click={() => moveSelected(name.id)}>
                  {name.name}
                </button>
              {/each}
              <button type="button" class="{chip} {chipOff}" disabled={busy} on:click={() => moveSelected(null)}>
                No farm name
              </button>
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>
