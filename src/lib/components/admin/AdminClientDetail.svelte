<!-- src/lib/components/admin/AdminClientDetail.svelte -->
<!-- Client detail drawer: right-side panel on desktop, full-screen on mobile. -->
<script lang="ts">
  import { onDestroy, onMount } from "svelte"
  import Icon from "@iconify/svelte"
  import { toast } from "svelte-sonner"
  import { MapPin, MessageSquare, Route, X } from "lucide-svelte"
  import {
    adminApi,
    type AdminMapActivity,
    type AdminMapContentStats,
    type AdminMapEntry,
    type AdminMapNote,
    type MapDailyRow,
  } from "$lib/api/adminApi"
  import {
    fieldAreaLabel,
    formatDate,
    markerCountLabel,
    noteIsDirty,
    seatStatusBadge,
    seatStatusLabel,
    subBadge,
    timeAgo,
    trailCountLabel,
  } from "$lib/utils/adminFormat"

  export let entry: AdminMapEntry
  export let contentStatsMap: Map<string, AdminMapContentStats>
  export let activityMap: Map<string, AdminMapActivity> = new Map()
  export let mapNotes: Record<string, AdminMapNote>
  export let noteDrafts: Record<string, string>
  export let savingNoteId: string | null = null

  export let onClose: () => void = () => {}
  export let onSaveNote: (mapId: string) => Promise<boolean> | void = () => {}
  export let onOpenSms: (phone: string, name: string) => void = () => {}
  export let onOpenUserSettings: (member: {
    id: string
    full_name: string | null
  }) => void = () => {}
  export let onEntryUpdated: () => void = () => {}
  export let onReload: () => void = () => {}

  // ── Map ID ──────────────────────────────────────────────────────────────
  function copyMapId() {
    navigator.clipboard
      .writeText(entry.master_map_id)
      .then(() => toast.success("Map ID copied"))
      .catch(() => toast.error("Failed to copy"))
  }

  // ── Members ─────────────────────────────────────────────────────────────
  let editingMemberId: string | null = null
  let editingName = ""
  let savingMemberName = false
  let savingMemberRoleId: string | null = null

  function autofocus(node: HTMLInputElement) {
    node.focus()
    node.select()
  }

  function startEditMember(member: { id: string; full_name: string | null }) {
    editingMemberId = member.id
    editingName = member.full_name || ""
  }

  function cancelEditMember() {
    editingMemberId = null
    editingName = ""
  }

  async function saveMemberName(member: {
    id: string
    full_name: string | null
  }) {
    if (!editingName.trim()) return
    savingMemberName = true
    const result = await adminApi.updateMemberName(
      member.id,
      editingName.trim(),
    )
    if (result.success) {
      member.full_name = editingName.trim()
      entry.members = [...entry.members]
      toast.success("Name updated")
      onEntryUpdated()
    } else {
      toast.error(result.error || "Failed to update name")
    }
    editingMemberId = null
    editingName = ""
    savingMemberName = false
  }

  async function handleMemberRoleChange(
    member: { id: string; full_name: string | null; role?: string | null },
    newRole: string,
  ) {
    if (!newRole || newRole === member.role) return
    const label = newRole.charAt(0).toUpperCase() + newRole.slice(1)
    if (
      !confirm(
        `Change ${member.full_name || "this member"}'s account type to ${label}?`,
      )
    ) {
      // The select already moved in the DOM — re-render to snap it back.
      entry.members = [...entry.members]
      return
    }
    savingMemberRoleId = member.id
    const result = await adminApi.updateMemberRole(member.id, newRole)
    if (result.success) {
      member.role = newRole
      entry.members = [...entry.members]
      toast.success(`${member.full_name || "Member"} is now ${label}`)
      onEntryUpdated()
    } else {
      toast.error(result.error || "Failed to update account type")
      entry.members = [...entry.members]
    }
    savingMemberRoleId = null
  }

  async function handleTransferOwnership(member: {
    id: string
    full_name: string | null
  }) {
    if (
      !confirm(
        `Transfer ownership of this map to "${member.full_name || "this member"}"? This cannot be undone from the dashboard.`,
      )
    )
      return
    const result = await adminApi.transferOwnership(
      entry.master_map_id,
      member.id,
    )
    if (result.success) {
      toast.success(`Ownership transferred to ${member.full_name || "member"}`)
      onReload()
    } else {
      toast.error(result.error || "Failed to transfer ownership")
    }
  }

  // ── Heatmap ─────────────────────────────────────────────────────────────
  let heatmapData: MapDailyRow[] = []
  let heatmapLoading = false
  let heatmapProfiles: string[] = []
  let heatmapProfileIndex = -1 // -1 = all, 0+ = specific profile
  let heatmapCalendarCells: { date: string; dayOfWeek: number }[] = []
  let heatmapMonthLabels: { label: string; col: number }[] = []

  $: heatmapActiveProfile =
    heatmapProfileIndex < 0
      ? "all"
      : (heatmapProfiles[heatmapProfileIndex] ?? "all")

  async function loadHeatmap(mapId: string) {
    heatmapLoading = true
    heatmapProfileIndex = -1
    heatmapCalendarCells = generateCalendarDays(30)
    heatmapMonthLabels = calendarMonthLabels(heatmapCalendarCells)
    const result = await adminApi.fetchDailyActivity(mapId)
    if (result.success) {
      heatmapData = result.data
      heatmapProfiles = [...new Set(result.data.map((r) => r.profile_id))]
    } else {
      heatmapData = []
      heatmapProfiles = []
    }
    heatmapLoading = false
  }

  function getProfileName(profileId: string): string {
    const member = entry.members?.find((m) => m.id === profileId)
    return member?.full_name || profileId.slice(0, 8)
  }

  function generateCalendarDays(
    daysBack: number,
  ): { date: string; dayOfWeek: number }[] {
    const cells: { date: string; dayOfWeek: number }[] = []
    const today = new Date()
    const start = new Date(today)
    start.setDate(start.getDate() - daysBack)
    while (start.getDay() !== 1) start.setDate(start.getDate() - 1)
    while (start <= today) {
      cells.push({
        date: start.toISOString().slice(0, 10),
        dayOfWeek: start.getDay() === 0 ? 6 : start.getDay() - 1,
      })
      start.setDate(start.getDate() + 1)
    }
    return cells
  }

  function calendarMonthLabels(
    cells: { date: string }[],
  ): { label: string; col: number }[] {
    const labels: { label: string; col: number }[] = []
    let lastMonth = ""
    cells.forEach((c, i) => {
      const m = c.date.slice(5, 7)
      if (m !== lastMonth) {
        const monthNames = [
          "Jan",
          "Feb",
          "Mar",
          "Apr",
          "May",
          "Jun",
          "Jul",
          "Aug",
          "Sep",
          "Oct",
          "Nov",
          "Dec",
        ]
        labels.push({
          label: monthNames[parseInt(m) - 1],
          col: Math.floor(i / 7),
        })
        lastMonth = m
      }
    })
    return labels
  }

  function getHeatmapColor(count: number): string {
    if (count === 0) return "bg-base-300"
    if (count <= 1) return "bg-green-400"
    if (count <= 3) return "bg-green-500"
    if (count <= 6) return "bg-green-600"
    return "bg-green-700"
  }

  function getDayActivity(date: string, profileId: string | "all"): number {
    if (profileId === "all") {
      return heatmapData
        .filter((r) => r.activity_date === date)
        .reduce((sum, r) => sum + r.profile_count, 0)
    }
    const row = heatmapData.find(
      (r) => r.activity_date === date && r.profile_id === profileId,
    )
    return row?.profile_count ?? 0
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────
  let prevBodyOverflow = ""
  onMount(() => {
    loadHeatmap(entry.master_map_id)
    prevBodyOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
  })

  onDestroy(() => {
    document.body.style.overflow = prevBodyOverflow
  })

  function handleWindowKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") onClose()
  }
</script>

<svelte:window on:keydown={handleWindowKeydown} />

<!-- Backdrop -->
<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
<div class="fixed inset-0 z-40 bg-black/50" on:click={onClose}></div>

<!-- Drawer / full-screen panel -->
<aside
  class="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-base-300 bg-base-100 shadow-2xl sm:max-w-[620px]"
  role="dialog"
  aria-modal="true"
  aria-label="Client details"
>
  <!-- Header -->
  <header
    class="flex items-start justify-between gap-3 border-b border-base-300 bg-base-100 p-4"
  >
    <div class="min-w-0">
      <h2 class="truncate text-lg font-semibold text-contrast-content">
        {entry.map_name || "Unnamed map"}
      </h2>
      <p class="truncate text-sm text-contrast-content/60">
        {entry.owner_name || "Unknown owner"}{#if entry.company_name}<span
            class="text-contrast-content/35"> · </span
          >{entry.company_name}{/if}
      </p>
      <div class="mt-1.5 flex flex-wrap items-center gap-1">
        <span class="badge badge-sm {subBadge(entry.subscription)}"
          >{entry.subscription}</span
        >
        <span class="badge badge-outline badge-sm"
          >{entry.subscription_status}</span
        >
        {#if entry.founder}
          <span class="badge badge-secondary badge-sm">Founder</span>
        {/if}
        {#if !entry.owner_connected}
          <span class="badge badge-info badge-sm">Headless</span>
        {/if}
        <span class="badge badge-sm {seatStatusBadge(entry.seat_status)}"
          >{seatStatusLabel(entry.seat_status)}</span
        >
      </div>
    </div>
    <button
      type="button"
      class="btn btn-circle btn-ghost btn-sm flex-shrink-0"
      aria-label="Close details"
      title="Close"
      on:click={onClose}
    >
      <X class="h-4 w-4" />
    </button>
  </header>

  <!-- Scrollable content -->
  <div class="flex-1 space-y-3 overflow-y-auto p-4">
    <!-- Map ID -->
    <div
      class="flex items-center gap-2 rounded-lg border border-base-300/60 bg-base-200/30 px-3 py-1.5"
    >
      <span class="text-xs font-medium text-contrast-content/50">Map ID</span>
      <code
        class="min-w-0 flex-1 select-all truncate font-mono text-xs text-contrast-content/70"
      >
        {entry.master_map_id}
      </code>
      <button
        type="button"
        class="btn btn-ghost btn-xs"
        on:click={copyMapId}
        title="Copy Map ID"
      >
        <Icon icon="solar:copy-bold-duotone" width="14" height="14" />
      </button>
    </div>

    <!-- Map & Plan -->
    <section class="rounded-xl border border-base-300/60 bg-base-200/20 p-3.5">
      <h4
        class="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-contrast-content/50"
      >
        <Icon icon="solar:map-bold-duotone" width="12" height="12" />
        Map & Plan
      </h4>
      <p class="text-sm font-medium text-contrast-content">
        {entry.map_name || "Unnamed"}
      </p>
      <p class="text-xs text-contrast-content/50">
        Created: {formatDate(entry.map_created_at)}
      </p>
      <p class="mt-1 text-xs text-contrast-content/60">
        {fieldAreaLabel(entry.master_map_id, contentStatsMap)}
      </p>
      <div
        class="mt-1 flex flex-wrap items-center gap-3 text-xs text-contrast-content/60"
      >
        <span class="flex items-center gap-1">
          <Route class="h-3 w-3" />
          {trailCountLabel(entry.master_map_id, contentStatsMap)}
        </span>
        <span class="flex items-center gap-1">
          <MapPin class="h-3 w-3" />
          {markerCountLabel(entry.master_map_id, contentStatsMap)}
        </span>
      </div>
      <div class="mt-2 flex flex-wrap items-center gap-1">
        <span class="badge badge-sm {subBadge(entry.subscription)}"
          >{entry.subscription}</span
        >
        <span class="badge badge-outline badge-sm"
          >{entry.subscription_status}</span
        >
        {#if entry.payment_interval}
          <span class="badge badge-ghost badge-sm">{entry.payment_interval}</span>
        {/if}
        {#if entry.founder}
          <span class="badge badge-secondary badge-sm">Founder</span>
        {/if}
      </div>
      {#if entry.next_billing_date}
        <p class="mt-1 text-xs text-contrast-content/50">
          Next billing: {formatDate(entry.next_billing_date)}
        </p>
      {/if}

      <!-- Seat usage -->
      <div class="mt-3">
        <div class="mb-1 flex items-center justify-between text-xs">
          <span class="text-contrast-content/60">
            Seat Usage: {entry.connected_vehicles} / {entry.allowed_seats}
            {#if entry.seats_over_limit > 0}
              <span class="text-error">(+{entry.seats_over_limit} over)</span>
            {/if}
          </span>
          <span class="badge badge-xs {seatStatusBadge(entry.seat_status)}"
            >{seatStatusLabel(entry.seat_status)}</span
          >
        </div>
        <div class="h-2 w-full overflow-hidden rounded-full bg-base-300">
          <div
            class="h-full rounded-full transition-all {entry.seat_status ===
            'EXCEEDING'
              ? 'bg-error'
              : entry.seat_status === 'AT_LIMIT'
                ? 'bg-warning'
                : 'bg-success'}"
            style="width: {Math.min(
              (entry.connected_vehicles / Math.max(entry.allowed_seats, 1)) * 100,
              100,
            )}%"
          ></div>
        </div>
      </div>
    </section>

    <!-- Activity -->
    <section class="rounded-xl border border-base-300/60 bg-base-200/20 p-3.5">
      <h4
        class="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-contrast-content/50"
      >
        <Icon icon="solar:chart-bold-duotone" width="12" height="12" />
        Activity
      </h4>
      <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <div class="flex justify-between gap-2">
          <span class="text-contrast-content/60">Vehicles 24h</span>
          <span class="font-medium tabular-nums text-contrast-content"
            >{entry.vehicles_active_24h}</span
          >
        </div>
        <div class="flex justify-between gap-2">
          <span class="text-contrast-content/60">Vehicles 7d</span>
          <span class="font-medium tabular-nums text-contrast-content"
            >{entry.vehicles_active_7d}</span
          >
        </div>
        <div class="flex justify-between gap-2">
          <span class="text-contrast-content/60">Vehicles 30d</span>
          <span class="font-medium tabular-nums text-contrast-content"
            >{entry.vehicles_active_30d}</span
          >
        </div>
        <div class="flex justify-between gap-2">
          <span class="text-contrast-content/60">Members 7d</span>
          <span class="font-medium tabular-nums text-contrast-content"
            >{entry.members_active_7d}</span
          >
        </div>
        <div class="flex justify-between gap-2">
          <span class="text-contrast-content/60">Members 30d</span>
          <span class="font-medium tabular-nums text-contrast-content"
            >{entry.members_active_30d}</span
          >
        </div>
        <div class="flex justify-between gap-2">
          <span class="text-contrast-content/60">Active profiles</span>
          <span class="font-medium tabular-nums text-accent"
            >{activityMap.get(entry.master_map_id)?.active_profiles ?? 0}</span
          >
        </div>
        <div class="flex justify-between gap-2">
          <span class="text-contrast-content/60">Active days</span>
          <span class="font-medium tabular-nums text-accent"
            >{activityMap.get(entry.master_map_id)?.active_days ?? 0}</span
          >
        </div>
      </div>

      <!-- Heatmap -->
      <div class="mt-3">
        {#if heatmapLoading}
          <div class="flex items-center justify-center py-4">
            <span class="loading loading-spinner loading-sm"></span>
          </div>
        {:else}
          {#if heatmapProfiles.length > 1}
            <div class="mb-2 flex items-center justify-center gap-1">
              <button
                type="button"
                class="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-contrast-content/40 hover:bg-base-300 hover:text-contrast-content disabled:opacity-20"
                disabled={heatmapProfileIndex <= -1}
                on:click={() => (heatmapProfileIndex = heatmapProfileIndex - 1)}
              >
                <Icon
                  icon="solar:alt-arrow-left-bold-duotone"
                  width="12"
                  height="12"
                />
              </button>
              <select
                bind:value={heatmapProfileIndex}
                class="w-36 rounded border border-base-300 bg-base-100 px-2 py-0.5 text-center text-xs text-contrast-content"
              >
                <option value={-1}>All profiles</option>
                {#each heatmapProfiles as pid, i}
                  <option value={i}>{getProfileName(pid)}</option>
                {/each}
              </select>
              <button
                type="button"
                class="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-contrast-content/40 hover:bg-base-300 hover:text-contrast-content disabled:opacity-20"
                disabled={heatmapProfileIndex >= heatmapProfiles.length - 1}
                on:click={() => (heatmapProfileIndex = heatmapProfileIndex + 1)}
              >
                <Icon
                  icon="solar:alt-arrow-right-bold-duotone"
                  width="12"
                  height="12"
                />
              </button>
            </div>
          {/if}

          {#if heatmapCalendarCells.length > 0}
            <div>
              <div class="mb-1 ml-6 flex text-[9px] text-contrast-content/40">
                {#each heatmapMonthLabels as ml}
                  <span class="block">{ml.label}</span>
                {/each}
              </div>
              <div class="flex">
                <div class="mr-1 flex flex-col" style="gap: 3px">
                  {#each ["M", "", "W", "", "F", "", ""] as lbl}
                    <span
                      class="flex h-3 w-5 items-center text-[9px] text-contrast-content/40"
                      >{lbl}</span
                    >
                  {/each}
                </div>
                <div
                  class="grid"
                  style="gap: 3px; grid-template-columns: repeat({Math.ceil(
                    heatmapCalendarCells.length / 7,
                  )}, 12px); grid-template-rows: repeat(7, 12px); grid-auto-flow: column;"
                >
                  {#each heatmapCalendarCells as cell}
                    <div
                      class="rounded-sm {getHeatmapColor(
                        getDayActivity(cell.date, heatmapActiveProfile),
                      )}"
                      title="{cell.date}: {getDayActivity(
                        cell.date,
                        heatmapActiveProfile,
                      )} events"
                    ></div>
                  {/each}
                </div>
              </div>
              <div
                class="mt-2 flex items-center gap-2 text-[10px] text-contrast-content/50"
              >
                <span>Less</span>
                <div class="h-2.5 w-2.5 rounded-sm bg-base-300"></div>
                <div class="h-2.5 w-2.5 rounded-sm bg-green-400"></div>
                <div class="h-2.5 w-2.5 rounded-sm bg-green-500"></div>
                <div class="h-2.5 w-2.5 rounded-sm bg-green-600"></div>
                <div class="h-2.5 w-2.5 rounded-sm bg-green-700"></div>
                <span>More</span>
              </div>
            </div>
          {/if}
        {/if}
      </div>
    </section>

    <!-- Owner -->
    <section class="rounded-xl border border-base-300/60 bg-base-200/20 p-3.5">
      <h4
        class="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-contrast-content/50"
      >
        <Icon icon="solar:user-bold-duotone" width="12" height="12" />
        Owner
      </h4>
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <p class="text-sm font-medium text-contrast-content">
            {entry.owner_name || "—"}
          </p>
          <p class="truncate text-xs text-contrast-content/60">
            {entry.owner_email || "—"}
          </p>
          {#if entry.owner_phone}
            <p class="text-xs text-contrast-content/50">{entry.owner_phone}</p>
          {/if}
          {#if entry.company_name}
            <p class="text-xs text-contrast-content/50">{entry.company_name}</p>
          {/if}
        </div>
        {#if entry.owner_phone}
          <button
            type="button"
            class="btn btn-outline btn-xs flex-shrink-0 gap-1"
            on:click={() =>
              onOpenSms(entry.owner_phone || "", entry.owner_name || "")}
          >
            <MessageSquare class="h-3 w-3" /> SMS
          </button>
        {/if}
      </div>
      <div class="mt-2 space-y-0.5 text-xs text-contrast-content/50">
        <p>Last sign-in: {timeAgo(entry.owner_last_sign_in)}</p>
        <p>Joined: {formatDate(entry.owner_created_at)}</p>
      </div>
    </section>

    <!-- Notes -->
    <section class="rounded-xl border border-base-300/60 bg-base-200/20 p-3.5">
      <div class="mb-2 flex items-center justify-between gap-2">
        <h4
          class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-contrast-content/50"
        >
          <Icon icon="solar:document-text-bold-duotone" width="12" height="12" />
          Notes
        </h4>
        {#if mapNotes[entry.master_map_id]?.updated_at}
          <span class="text-[10px] text-contrast-content/40">
            Last saved {timeAgo(mapNotes[entry.master_map_id]?.updated_at)}
          </span>
        {/if}
      </div>
      <textarea
        class="textarea textarea-bordered h-28 w-full resize-y bg-base-100 text-xs leading-relaxed text-contrast-content"
        placeholder="Add a note about this farm — anything you want to remember next time you look at it..."
        maxlength={4000}
        bind:value={noteDrafts[entry.master_map_id]}
      ></textarea>
      <div class="mt-2 flex items-center justify-between gap-2">
        <span class="text-[10px] text-contrast-content/40">
          {(noteDrafts[entry.master_map_id] ?? "").length}/4000
        </span>
        <div class="flex items-center gap-2">
          {#if noteIsDirty(entry.master_map_id, noteDrafts, mapNotes)}
            <span class="text-[10px] text-warning">Unsaved changes</span>
          {/if}
          <button
            type="button"
            class="btn btn-primary btn-xs"
            disabled={savingNoteId === entry.master_map_id ||
              !noteIsDirty(entry.master_map_id, noteDrafts, mapNotes)}
            on:click={() => onSaveNote(entry.master_map_id)}
          >
            {#if savingNoteId === entry.master_map_id}
              <span class="loading loading-spinner loading-xs"></span>
            {:else}
              Save note
            {/if}
          </button>
        </div>
      </div>
    </section>

    <!-- Members -->
    <section class="rounded-xl border border-base-300/60 bg-base-200/20 p-3.5">
      <h4
        class="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-contrast-content/50"
      >
        <Icon
          icon="solar:users-group-rounded-bold-duotone"
          width="12"
          height="12"
        />
        Members ({entry.members.length})
      </h4>
      {#if entry.members && entry.members.length > 0}
        <div
          class="divide-y divide-base-300/60 overflow-hidden rounded-lg border border-base-300/60"
        >
          {#each entry.members as member (member.id)}
            <div class="bg-base-100/60 p-3">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  {#if editingMemberId === member.id}
                    <div class="flex items-center gap-1">
                      <input
                        type="text"
                        bind:value={editingName}
                        use:autofocus
                        on:keydown={(e) =>
                          e.key === "Enter" && saveMemberName(member)}
                        on:keydown={(e) =>
                          e.key === "Escape" && cancelEditMember()}
                        class="w-36 rounded border border-base-300 bg-base-100 px-2 py-1 text-xs text-contrast-content"
                      />
                      <button
                        class="rounded bg-base-content px-2 py-1 text-[10px] font-medium text-base-100 hover:bg-base-content/90 disabled:opacity-50"
                        disabled={savingMemberName}
                        on:click={() => saveMemberName(member)}>Save</button
                      >
                      <button
                        class="rounded border border-base-300 px-2 py-1 text-[10px] text-contrast-content/60 hover:bg-base-200"
                        on:click={cancelEditMember}>Cancel</button
                      >
                    </div>
                  {:else}
                    <span class="inline-flex items-center gap-2">
                      <span class="truncate text-sm font-medium text-contrast-content"
                        >{member.full_name || "—"}</span
                      >
                      <button
                        type="button"
                        class="rounded border border-base-300 px-1.5 py-0.5 text-[10px] text-contrast-content/50 transition-colors hover:bg-base-300 hover:text-contrast-content"
                        on:click={() => startEditMember(member)}
                      >
                        Edit
                      </button>
                    </span>
                  {/if}
                  <p class="mt-0.5 truncate text-xs text-contrast-content/50">
                    {member.email || "—"}
                  </p>
                </div>
                <div class="flex flex-shrink-0 items-center gap-1">
                  {#if member.is_owner}
                    <span class="badge badge-primary badge-sm">Owner</span>
                  {:else}
                    <span class="badge badge-ghost badge-sm"
                      >{member.map_role === "viewer" ? "Viewer" : "Member"}</span
                    >
                  {/if}
                  <button
                    type="button"
                    class="btn btn-ghost btn-xs"
                    on:click={() => onOpenUserSettings(member)}
                    title="View/edit user settings"
                  >
                    <Icon
                      icon="solar:settings-bold-duotone"
                      width="13"
                      height="13"
                    />
                  </button>
                </div>
              </div>
              <div
                class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-contrast-content/50"
              >
                <span>Sign-in {timeAgo(member.last_sign_in)}</span>
                <span>Location {timeAgo(member.last_location_update)}</span>
              </div>
              {#if !member.is_owner}
                <div class="mt-2 flex flex-wrap items-center gap-2">
                  <span class="text-xs text-contrast-content/50">Account</span>
                  <select
                    class="select select-bordered select-xs w-24 text-xs"
                    value={member.role || ""}
                    disabled={savingMemberRoleId === member.id}
                    on:change={(e) =>
                      handleMemberRoleChange(member, e.currentTarget.value)}
                    title="Account type"
                  >
                    <option value="" disabled>—</option>
                    <option value="manager">Manager</option>
                    <option value="operator">Operator</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <button
                    type="button"
                    class="rounded border border-base-300 px-1.5 py-0.5 text-[10px] text-contrast-content/50 transition-colors hover:bg-warning/10 hover:text-warning"
                    on:click={() => handleTransferOwnership(member)}
                  >
                    Make Owner
                  </button>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {:else}
        <p class="text-xs text-contrast-content/40">
          No members connected to this map.
        </p>
      {/if}
    </section>
  </div>
</aside>
