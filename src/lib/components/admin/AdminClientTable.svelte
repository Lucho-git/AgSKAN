<!-- src/lib/components/admin/AdminClientTable.svelte -->
<!-- Client list for the admin portal.
       · Phones (<640px): stacked rows — no horizontal scrolling:
           owner · map + chips · seats / active 24h / GPS / sign-in
       · sm+ : table (Plan + Founder appear from lg+).
     Activity stats (active 24h, GPS, sign-in) are combined in one column
     with bold labels + dot separators. Status only flags exceptions. -->
<script lang="ts">
  import Icon from "@iconify/svelte"
  import { MapPin, MessageSquare, NotepadText, Route } from "lucide-svelte"
  import type {
    AdminMapContentStats,
    AdminMapEntry,
    AdminMapNote,
  } from "$lib/api/adminApi"
  import {
    fieldSizeLabel,
    markerCountValue,
    notePreview,
    seatStatusLabel,
    subscriptionLabel,
    timeAgo,
    trailCountValue,
  } from "$lib/utils/adminFormat"
  import AdminStatBadge from "./AdminStatBadge.svelte"

  export let entries: AdminMapEntry[]
  export let contentStatsMap: Map<string, AdminMapContentStats>
  export let mapNotes: Record<string, AdminMapNote>
  export let selectedMapId: string | null = null
  // Suppress the mapping / trails / markers chips until content stats load so
  // every row doesn't flash "No mapping" while the RPC is in flight.
  export let statsLoaded = true
  export let onOpen: (entry: AdminMapEntry) => void = () => {}
  export let onOpenSms: (phone: string, name: string) => void = () => {}
  export let onOpenNote: (entry: AdminMapEntry) => void = () => {}

  // Phones get the stacked layout instead of the scrolling table.
  let w = 1280
  $: isMobile = w < 640

  function seatTone(status: string): "error" | "warning" | "success" {
    if (status === "EXCEEDING") return "error"
    if (status === "AT_LIMIT") return "warning"
    return "success"
  }
</script>

<svelte:window bind:innerWidth={w} />

{#if isMobile}
  <!-- ── Phone layout: stacked rows, everything wraps, no sideways scroll ── -->
  <div
    class="divide-y divide-base-300 overflow-hidden rounded-lg border border-base-300 bg-base-100"
  >
    {#each entries as entry (entry.master_map_id)}
      <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
      <div
        class="cursor-pointer px-3 py-2 transition-colors hover:bg-base-content/5
          {entry.seat_status === 'EXCEEDING' ? 'bg-error/5' : ''}
          {entry.seat_status === 'AT_LIMIT' ? 'bg-warning/5' : ''}"
        on:click={() => onOpen(entry)}
      >
        <!-- Owner + exception chips -->
        <div class="flex items-center gap-2">
          <Icon
            icon={selectedMapId === entry.master_map_id
              ? "solar:alt-arrow-down-bold"
              : "solar:alt-arrow-right-bold"}
            width="12"
            height="12"
            class="flex-shrink-0 text-contrast-content/40"
          />
          <span class="min-w-0 flex-1 font-medium text-contrast-content"
            >{entry.owner_name || "Unknown"}</span
          >
          {#if !entry.owner_connected}
            <AdminStatBadge value="Headless" tone="info" />
          {/if}
          {#if entry.seat_status !== "OK"}
            <AdminStatBadge
              value={seatStatusLabel(entry.seat_status)}
              tone={seatTone(entry.seat_status)}
            />
          {/if}
        </div>

        <!-- Map + plan + content chips -->
        <div class="mt-1 flex flex-wrap items-center gap-1.5 pl-5">
          <span class="text-xs text-contrast-content"
            >{entry.map_name || "Unnamed"}</span
          >
          <AdminStatBadge
            value={subscriptionLabel(entry.subscription)}
            tone={entry.subscription === "FREE" ? "muted" : "neutral"}
          />
          {#if entry.founder}
            <AdminStatBadge value="Founder" tone="secondary" />
          {/if}
          {#if statsLoaded}
            <AdminStatBadge
              value={fieldSizeLabel(entry.master_map_id, contentStatsMap)}
              tone={fieldSizeLabel(entry.master_map_id, contentStatsMap) ===
              "No mapping"
                ? "muted"
                : "neutral"}
            />
            <AdminStatBadge
              icon={Route}
              value={trailCountValue(
                entry.master_map_id,
                contentStatsMap,
              ).toLocaleString("en-AU")}
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
          {/if}
        </div>

        <!-- Stats line: seats · active 24h · GPS · Sign-in -->
        <div
          class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-5 text-[11px] text-contrast-content/60"
        >
          <span
            ><span class="font-medium text-contrast-content/80"
              >{entry.connected_vehicles}/{entry.allowed_seats}</span
            >
            seats</span
          >
          <span class="text-contrast-content/25">·</span>
          <span
            ><span
              class="font-medium tabular-nums {entry.vehicles_active_24h > 0
                ? 'text-contrast-content/80'
                : 'text-contrast-content/35'}">{entry.vehicles_active_24h}</span
            >
            active 24h</span
          >
          <span class="text-contrast-content/25">·</span>
          <span class="inline-flex items-center gap-1">
            <span class="font-medium text-contrast-content/80">GPS</span>
            <span class="text-contrast-content/25">·</span>
            <span
              class={entry.latest_vehicle_update
                ? "text-contrast-content/70"
                : "text-contrast-content/30"}>{timeAgo(
                entry.latest_vehicle_update,
              )}</span
            >
          </span>
          <span class="text-contrast-content/25">·</span>
          <span class="inline-flex items-center gap-1">
            <span class="font-medium text-contrast-content/80">Sign-in</span>
            <span class="text-contrast-content/25">·</span>
            <span
              class={entry.latest_member_sign_in
                ? "text-contrast-content/70"
                : "text-contrast-content/30"}>{timeAgo(
                entry.latest_member_sign_in,
              )}</span
            >
          </span>
        </div>

        {#if mapNotes[entry.master_map_id]?.note}
          <div
            class="mt-0.5 flex items-center gap-1 pl-5 text-[11px] text-accent"
          >
            <Icon
              icon="solar:document-text-bold-duotone"
              width="11"
              height="11"
            />
            <span class="truncate">{mapNotes[entry.master_map_id]?.note}</span>
          </div>
        {/if}
      </div>
      {#if selectedMapId === entry.master_map_id}
        <div class="border-t border-base-300 bg-base-200/10">
          <slot name="rowDetail" {entry}></slot>
        </div>
      {/if}
    {/each}
  </div>
{:else}
  <!-- ── Table layout (sm+) ─────────────────────────────────────────────── -->
  <div
    class="overflow-hidden overflow-x-auto rounded-lg border border-base-300 bg-base-100"
  >
    <table class="w-full border-collapse text-left text-xs">
      <thead>
        <tr
          class="border-b-2 border-base-300 bg-base-200/60 text-contrast-content/60"
        >
          <th class="w-8 border-r border-base-300"></th>
          <th class="border-r border-base-300 px-2 py-1.5 font-medium lg:px-3">
            Owner
          </th>
          <th class="border-r border-base-300 px-2 py-1.5 font-medium lg:px-3">
            Map
          </th>
          <th
            class="hidden whitespace-nowrap border-r border-base-300 px-2 py-1.5 font-medium lg:table-cell lg:px-3"
          >
            Plan
          </th>
          <th
            class="border-r border-base-300 px-2 py-1.5 text-center font-medium lg:px-3"
          >
            Users
          </th>
          <th
            class="whitespace-nowrap border-r border-base-300 px-2 py-1.5 font-medium lg:px-3"
          >
            Activity
          </th>
          <th class="px-2 py-1.5 font-medium lg:px-3">Status</th>
        </tr>
      </thead>
      <tbody>
        {#each entries as entry (entry.master_map_id)}
          <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
          <tr
            class="cursor-pointer border-b border-base-300 transition-colors hover:bg-base-content/5
              {entry.seat_status === 'EXCEEDING' ? 'bg-error/5' : ''}
              {entry.seat_status === 'AT_LIMIT' ? 'bg-warning/5' : ''}"
            on:click={() => onOpen(entry)}
          >
            <td class="w-8 border-r border-base-300 px-1.5 lg:px-2">
              <Icon
                icon={selectedMapId === entry.master_map_id
                  ? "solar:alt-arrow-down-bold"
                  : "solar:alt-arrow-right-bold"}
                width="12"
                height="12"
                class="text-contrast-content/40"
              />
            </td>

            <!-- Owner — always shown in full -->
            <td class="border-r border-base-300 px-2 py-1.5 lg:px-3">
              <div class="flex flex-wrap items-center gap-1.5">
                <span class="font-medium text-contrast-content"
                  >{entry.owner_name || "Unknown"}</span
                >
                {#if !entry.owner_connected}
                  <AdminStatBadge value="Headless" tone="info" />
                {/if}
              </div>
              <div class="hidden text-contrast-content/50 sm:block">
                {entry.owner_email || "—"}
              </div>
              <div class="flex items-center gap-0.5 text-contrast-content/50">
                {#if entry.owner_phone}
                  <span>{entry.owner_phone}</span>
                  <button
                    type="button"
                    class="btn btn-ghost btn-xs px-1 text-primary hover:bg-primary/10"
                    title="Send SMS"
                    on:click|stopPropagation={() =>
                      onOpenSms(
                        entry.owner_phone || "",
                        entry.owner_name || "",
                      )}
                  >
                    <MessageSquare class="h-3.5 w-3.5" />
                  </button>
                {/if}
                <button
                  type="button"
                  class="btn btn-ghost btn-xs px-1 text-contrast-content/50 hover:bg-base-content/10"
                  title={notePreview(entry.master_map_id, mapNotes)}
                  aria-label="Edit note"
                  on:click|stopPropagation={() => onOpenNote(entry)}
                >
                  <NotepadText class="h-3.5 w-3.5" />
                </button>
              </div>
            </td>

            <!-- Map -->
            <td class="border-r border-base-300 px-2 py-1.5 lg:px-3">
              <div
                class="flex flex-wrap items-center gap-1.5 text-contrast-content"
              >
                <span class="whitespace-nowrap"
                  >{entry.map_name || "Unnamed"}</span
                >
                {#if statsLoaded}
                  <AdminStatBadge
                    value={fieldSizeLabel(entry.master_map_id, contentStatsMap)}
                    tone={fieldSizeLabel(
                      entry.master_map_id,
                      contentStatsMap,
                    ) === "No mapping"
                      ? "muted"
                      : "neutral"}
                  />
                  <AdminStatBadge
                    icon={Route}
                    value={trailCountValue(
                      entry.master_map_id,
                      contentStatsMap,
                    ).toLocaleString("en-AU")}
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
                {/if}
              </div>
              {#if entry.company_name}
                <div class="text-contrast-content/50">{entry.company_name}</div>
              {/if}
              {#if mapNotes[entry.master_map_id]?.note}
                <div
                  class="mt-0.5 flex items-center gap-1 text-[11px] text-accent"
                  title={mapNotes[entry.master_map_id]?.note}
                >
                  <Icon
                    icon="solar:document-text-bold-duotone"
                    width="11"
                    height="11"
                  />
                  <span class="max-w-[18rem] truncate"
                    >{mapNotes[entry.master_map_id]?.note}</span
                  >
                </div>
              {/if}
            </td>

            <!-- Plan — badges stack as whole units: plan chip first, Founder
                 chip on its own line below -->
            <td
              class="hidden border-r border-base-300 px-2 py-1.5 lg:table-cell lg:px-3"
            >
              <AdminStatBadge
                value={subscriptionLabel(entry.subscription)}
                tone={entry.subscription === "FREE" ? "muted" : "neutral"}
              />
              {#if entry.founder}
                <div class="mt-1">
                  <AdminStatBadge value="Founder" tone="secondary" />
                </div>
              {/if}
            </td>

            <!-- Users (seats) -->
            <td
              class="border-r border-base-300 px-2 py-1.5 text-center lg:px-3"
            >
              <span
                class="font-semibold tabular-nums {entry.seat_status ===
                'EXCEEDING'
                  ? 'text-error'
                  : entry.seat_status === 'AT_LIMIT'
                    ? 'text-warning'
                    : 'text-contrast-content'}"
                >{entry.connected_vehicles}/{entry.allowed_seats}</span
              >
            </td>

            <!-- Activity — active 24h + GPS + sign-in, bold labels + dots -->
            <td
              class="whitespace-nowrap border-r border-base-300 px-2 py-1.5 lg:px-3"
            >
              <div class="flex items-baseline gap-1">
                <span
                  class="font-medium tabular-nums {entry.vehicles_active_24h > 0
                    ? 'text-contrast-content/80'
                    : 'text-contrast-content/35'}">{entry.vehicles_active_24h}</span
                >
                <span class="text-contrast-content/50">active 24h</span>
              </div>
              <div class="flex items-center gap-1">
                <span class="font-medium text-contrast-content/80">GPS</span>
                <span class="text-contrast-content/25">·</span>
                <span
                  class={entry.latest_vehicle_update
                    ? "text-contrast-content/70"
                    : "text-contrast-content/30"}>{timeAgo(
                    entry.latest_vehicle_update,
                  )}</span
                >
              </div>
              <div class="flex items-center gap-1">
                <span class="font-medium text-contrast-content/80">Sign-in</span>
                <span class="text-contrast-content/25">·</span>
                <span
                  class={entry.latest_member_sign_in
                    ? "text-contrast-content/70"
                    : "text-contrast-content/30"}>{timeAgo(
                    entry.latest_member_sign_in,
                  )}</span
                >
              </div>
            </td>

            <!-- Status — chip only for exceptions (quieter table) -->
            <td class="px-2 py-1.5 lg:px-3">
              {#if entry.seat_status !== "OK"}
                <AdminStatBadge
                  value={seatStatusLabel(entry.seat_status)}
                  tone={seatTone(entry.seat_status)}
                />
              {/if}
            </td>
          </tr>
          <!-- Inline detail expansion — supplied by the page via the rowDetail slot -->
          {#if selectedMapId === entry.master_map_id}
            <tr>
              <td
                colspan="7"
                class="border-b border-base-300 bg-base-200/10 p-0"
              >
                <slot name="rowDetail" {entry}></slot>
              </td>
            </tr>
          {/if}
        {/each}
      </tbody>
    </table>
  </div>
{/if}
