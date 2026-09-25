<!-- src/lib/components/admin/AdminClientCard.svelte -->
<script lang="ts">
  import Icon from "@iconify/svelte"
  import {
    ChevronRight,
    MapPin,
    MessageSquare,
    NotepadText,
    Route,
  } from "lucide-svelte"
  import type {
    AdminMapContentStats,
    AdminMapEntry,
    AdminMapNote,
  } from "$lib/api/adminApi"
  import {
    fieldSizeLabel,
    markerCountValue,
    notePreview,
    subBadge,
    timeAgo,
    trailCountValue,
  } from "$lib/utils/adminFormat"
  import AdminStatBadge from "./AdminStatBadge.svelte"

  export let entry: AdminMapEntry
  export let contentStatsMap: Map<string, AdminMapContentStats>
  export let mapNotes: Record<string, AdminMapNote>
  export let selected = false
  export let onOpen: (entry: AdminMapEntry) => void = () => {}
  export let onOpenSms: (phone: string, name: string) => void = () => {}
  export let onOpenNote: (entry: AdminMapEntry) => void = () => {}
</script>

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
<article
  class="cursor-pointer rounded-xl border bg-base-100 p-3.5 transition-colors hover:bg-base-200/40 {selected
    ? 'border-primary/60 ring-1 ring-primary/30'
    : 'border-base-300 hover:border-base-content/20'}"
  on:click={() => onOpen(entry)}
>
  <div class="flex items-start justify-between gap-3">
    <div class="min-w-0">
      <div class="flex flex-wrap items-center gap-1.5">
        <h3 class="truncate text-base font-semibold text-contrast-content">
          {entry.map_name || "Unnamed"}
        </h3>
        <span class="badge badge-sm {subBadge(entry.subscription)}"
          >{entry.subscription}</span
        >
        {#if entry.founder}
          <span class="badge badge-secondary badge-sm">Founder</span>
        {/if}
        {#if !entry.owner_connected}
          <span class="badge badge-info badge-sm">Headless</span>
        {/if}
        {#if entry.seat_status === "EXCEEDING"}
          <span class="badge badge-error badge-sm">Over seats</span>
        {:else if entry.seat_status === "AT_LIMIT"}
          <span class="badge badge-warning badge-sm">At limit</span>
        {/if}
      </div>
      <p class="mt-1 truncate text-sm text-contrast-content/60">
        {entry.owner_name || "Unknown owner"}{#if entry.owner_email}<span
            class="text-contrast-content/35"> · </span
          >{entry.owner_email}{/if}
      </p>
    </div>
    <div class="flex flex-shrink-0 items-center gap-0.5">
      {#if entry.owner_phone}
        <button
          type="button"
          class="btn btn-ghost btn-circle btn-sm text-primary"
          title="Send SMS"
          on:click|stopPropagation={() =>
            onOpenSms(entry.owner_phone || "", entry.owner_name || "")}
        >
          <MessageSquare class="h-4 w-4" />
        </button>
      {/if}
      <button
        type="button"
        class="btn btn-ghost btn-circle btn-sm text-contrast-content/50"
        title={notePreview(entry.master_map_id, mapNotes)}
        aria-label="Edit note"
        on:click|stopPropagation={() => onOpenNote(entry)}
      >
        <NotepadText class="h-4 w-4" />
      </button>
      <button
        type="button"
        class="btn btn-ghost btn-circle btn-sm text-contrast-content/40"
        aria-label="Open details"
        title="Open details"
        on:click|stopPropagation={() => onOpen(entry)}
      >
        <ChevronRight class="h-4 w-4" />
      </button>
    </div>
  </div>

  <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
    <span class="flex items-center gap-1">
      <AdminStatBadge
        value={fieldSizeLabel(entry.master_map_id, contentStatsMap)}
        title="Combined mapped area"
      />
      <AdminStatBadge
        icon={Route}
        value={trailCountValue(entry.master_map_id, contentStatsMap).toLocaleString(
          "en-AU",
        )}
        title="Trails recorded"
      />
      <AdminStatBadge
        icon={MapPin}
        value={markerCountValue(
          entry.master_map_id,
          contentStatsMap,
        ).toLocaleString("en-AU")}
        title="Markers placed"
      />
    </span>
    <span class="text-xs text-contrast-content/50"
      >Last GPS {timeAgo(entry.latest_vehicle_update)}</span
    >
    <span class="text-xs text-contrast-content/50"
      >{entry.vehicles_active_24h} active 24h</span
    >
    <span class="text-xs text-contrast-content/50"
      >{entry.connected_vehicles}/{entry.allowed_seats} seats</span
    >
    <span class="text-xs text-contrast-content/50"
      >{entry.total_members} users</span
    >
  </div>

  {#if mapNotes[entry.master_map_id]?.note}
    <div
      class="mt-2 flex items-center gap-1.5 text-xs text-accent"
      title={mapNotes[entry.master_map_id]?.note}
    >
      <Icon icon="solar:document-text-bold-duotone" width="12" height="12" />
      <span class="truncate">{mapNotes[entry.master_map_id]?.note}</span>
    </div>
  {/if}
</article>
