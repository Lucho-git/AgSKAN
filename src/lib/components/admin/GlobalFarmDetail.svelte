<!-- src/lib/components/admin/GlobalFarmDetail.svelte -->
<!-- Farm card for the admin global map: owner, team, vehicles, counts and the
     month's activity. Clicking the name, a vehicle or a person opens the edit
     modal (GlobalFarmEditModal), which the page owns.
     Sits over the map, so it uses the fixed dark map-overlay look rather than
     the theme-adaptive account styles. -->
<script lang="ts">
  import Icon from "@iconify/svelte"
  import { Pencil, X } from "lucide-svelte"
  import vehicleIcons from "$lib/vehicles/index.js"
  import {
    adminApi,
    type GlobalFarm,
    type MapDailyRow,
  } from "$lib/api/adminApi"
  import { timeAgo, formatDate } from "$lib/utils/adminFormat"
  import {
    STATUS_META,
    farmStatus,
    formatHa,
    vehicleIconKey,
    type FarmStatus,
  } from "$lib/utils/globalFarmMap"

  export let farm: GlobalFarm
  export let color: string
  export let savingFlag = false
  export let onClose: () => void
  export let onSelectFarm: (id: string) => void
  export let onSetTestFlag: (isTest: boolean | null) => void
  export let onEditMap: () => void
  export let onEditPerson: (id: string) => void
  export let onJoinMap: () => void
  export let joining = false

  const REASON_LABEL: Record<string, string> = {
    manual: "Flagged by an admin",
    internal: "Owned by an AgSKAN account",
    name: "Named like a test map",
    duplicate: "Copies another map's fields",
  }
  const ICON_KEYS = Object.keys(vehicleIcons)

  let status: FarmStatus
  $: status = farmStatus(farm)

  function vehicleComponent(type: string | null) {
    return (vehicleIcons as Record<string, any>)[vehicleIconKey(type, ICON_KEYS)]
  }

  // "SelfPropelledBoomspray" -> "Self Propelled Boomspray"
  function vehicleLabel(type: string | null): string {
    if (!type) return "Vehicle"
    const spaced = type.replace(/([a-z])([A-Z])/g, "$1 $2")
    return spaced.charAt(0).toUpperCase() + spaced.slice(1)
  }

  function roleLabel(member: GlobalFarm["members"][number]): string {
    if (member.is_owner) return "Owner"
    const role = member.role || member.map_role || "Member"
    return role.charAt(0).toUpperCase() + role.slice(1).replace(/_/g, " ")
  }

  $: stats = [
    { label: "Mapped", value: farm.field_count ? formatHa(farm.hectares) : "—" },
    { label: "Fields", value: farm.field_count.toLocaleString("en-AU") },
    { label: "Trails", value: farm.trail_count.toLocaleString("en-AU") },
    { label: "Markers", value: farm.marker_count.toLocaleString("en-AU") },
  ]

  // ── This month's activity (same calendar as the admin dashboard) ──────────
  let heatmapData: MapDailyRow[] = []
  let heatmapLoading = false
  let heatmapProfile = "all"
  let heatmapCells: string[] = []
  let loadedFarmId = ""

  $: heatmapProfiles = [...new Set(heatmapData.map((r) => r.profile_id))]
  $: activeDays = new Set(heatmapData.map((r) => r.activity_date)).size

  // A different farm: load its month.
  $: if (farm.id !== loadedFarmId) {
    loadedFarmId = farm.id
    loadHeatmap(farm.id)
  }

  function calendarDays(daysBack: number): string[] {
    const cells: string[] = []
    const today = new Date()
    const start = new Date(today)
    start.setDate(start.getDate() - daysBack)
    while (start.getDay() !== 1) start.setDate(start.getDate() - 1)
    while (start <= today) {
      cells.push(start.toISOString().slice(0, 10))
      start.setDate(start.getDate() + 1)
    }
    return cells
  }

  async function loadHeatmap(mapId: string) {
    heatmapLoading = true
    heatmapProfile = "all"
    heatmapData = []
    heatmapCells = calendarDays(30)
    const result = await adminApi.fetchDailyActivity(mapId)
    if (mapId !== farm.id) return // a newer farm was picked meanwhile
    heatmapData = result.success ? result.data : []
    heatmapLoading = false
  }

  function dayActivity(rows: MapDailyRow[], date: string, profile: string): number {
    return rows
      .filter((r) => r.activity_date === date && (profile === "all" || r.profile_id === profile))
      .reduce((sum, r) => sum + Number(r.profile_count), 0)
  }

  function heatColor(count: number): string {
    if (count === 0) return "bg-white/10"
    if (count <= 1) return "bg-green-300"
    if (count <= 3) return "bg-green-400"
    if (count <= 6) return "bg-green-500"
    return "bg-green-600"
  }

  function profileName(id: string): string {
    return farm.members.find((m) => m.id === id)?.name || id.slice(0, 8)
  }

</script>

<div class="flex max-h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/80 text-white shadow-2xl backdrop-blur-xl">
  <!-- Header: click the name to rename the map or change its owner -->
  <div class="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
    <div class="flex min-w-0 flex-1 items-start gap-3">
      <span
        class="mt-1 h-3.5 w-3.5 flex-shrink-0 rounded-full ring-2 ring-white/25"
        style="background: {color}"
      ></span>
      <div class="min-w-0 flex-1">
        <button
          type="button"
          class="group flex max-w-full items-center gap-1.5 text-left"
          title="Rename this map or change its owner"
          on:click={onEditMap}
        >
          <h2 class="truncate text-base font-semibold leading-tight">
            {farm.map_name?.trim() || "Unnamed map"}
          </h2>
          <Pencil class="h-3 w-3 flex-shrink-0 text-white/30 transition-colors group-hover:text-white/80" />
        </button>
        <p class="mt-0.5 truncate text-xs text-white/60">
          {farm.owner_name || farm.owner_email || "Unknown owner"}
          {#if farm.company_name}
            · {farm.company_name}
          {/if}
        </p>
      </div>
    </div>
    <button
      type="button"
      class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition-colors hover:bg-white/10"
      title="Close"
      on:click={onClose}
    >
      <X class="h-4 w-4 text-white/70" />
    </button>
  </div>

  <div class="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
    <!-- Badges -->
    <div class="flex flex-wrap items-center gap-1.5 text-[11px] font-medium">
      <span class="flex items-center gap-1.5 rounded-full bg-white/10 px-2 py-0.5" title={STATUS_META[status].hint}>
        <span class="h-2 w-2 rounded-full" style="background: {STATUS_META[status].color}"></span>
        {STATUS_META[status].label}
      </span>
      <span
        class="rounded-full px-2 py-0.5 {farm.paid
          ? 'bg-emerald-400/20 text-emerald-300'
          : 'bg-white/10 text-white/70'}"
      >
        {farm.paid ? "Paid plan" : "Free plan"}
      </span>
      <span
        class="rounded-full bg-white/10 px-2 py-0.5 {farm.paid && farm.member_count > farm.paid_seats ? 'text-amber-300' : 'text-white/70'}"
        title="Seats paid for on the plan / people on the map"
      >
        {farm.paid_seats} paid · {farm.member_count} {farm.member_count === 1 ? "seat" : "seats"} used
      </span>
      {#if farm.is_test}
        <span class="rounded-full bg-amber-400/20 px-2 py-0.5 text-amber-300">Test map</span>
      {/if}
      <span class="text-white/45">
        {farm.last_activity ? `Last active ${timeAgo(farm.last_activity).toLowerCase()}` : "No activity yet"}
      </span>
    </div>

    <!-- Test / duplicate explanation -->
    {#if farm.is_test}
      <div class="rounded-lg border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs text-amber-100/90">
        <p class="font-medium text-amber-200">Hidden from the map and totals by default</p>
        <ul class="mt-1 space-y-0.5">
          {#each farm.test_reasons as reason}
            <li>
              {REASON_LABEL[reason] ?? reason}{#if reason === "duplicate" && farm.duplicate_of}:
                <button
                  type="button"
                  class="font-medium underline decoration-amber-200/50 underline-offset-2 hover:text-white"
                  on:click={() => farm.duplicate_of && onSelectFarm(farm.duplicate_of.id)}
                >
                  {farm.duplicate_of.name?.trim() || "Unnamed map"}
                </button>
                ({farm.duplicate_of.shared_fields} shared fields){/if}
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    <button
      type="button"
      class="flex w-full items-center justify-center gap-2 rounded-[10px] bg-gradient-to-br from-green-500 to-green-600 px-4 py-2.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
      title="Connect your own account to this map and open it in the map viewer"
      disabled={joining}
      on:click={onJoinMap}
    >
      {#if joining}
        <span class="loading loading-spinner loading-xs"></span>
        Joining…
      {:else}
        <Icon icon="solar:login-3-bold-duotone" width="16" height="16" />
        Join and view map
      {/if}
    </button>

    <!-- Counts -->
    <div class="grid grid-cols-4 gap-1.5">
      {#each stats as stat}
        <div class="rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-center">
          <p class="text-sm font-semibold tabular-nums">{stat.value}</p>
          <p class="mt-0.5 text-[10px] uppercase tracking-wider text-white/50">{stat.label}</p>
        </div>
      {/each}
    </div>

    {#if !farm.located_by}
      <p class="text-xs text-white/50">
        No fields mapped and no vehicle position yet, so this farm isn't on the map.
      </p>
    {:else if farm.located_by === "vehicles"}
      <p class="text-xs text-white/50">
        No fields mapped yet — placed where its vehicles were last seen.
      </p>
    {/if}

    <!-- This month's activity -->
    <section>
      <div class="mb-1.5 flex items-center justify-between gap-2">
        <h3 class="text-[10px] font-semibold uppercase tracking-wider text-white/50">
          Last 30 days
          {#if !heatmapLoading}
            <span class="ml-1 normal-case tracking-normal text-white/70">
              {activeDays} active {activeDays === 1 ? "day" : "days"}
            </span>
          {/if}
        </h3>
        {#if heatmapProfiles.length > 1}
          <select
            bind:value={heatmapProfile}
            class="max-w-[9rem] rounded-md border border-white/10 bg-black/60 px-1.5 py-0.5 text-[10px] text-white/80 focus:outline-none"
            aria-label="Show activity for"
          >
            <option value="all">Everyone</option>
            {#each heatmapProfiles as id}
              <option value={id}>{profileName(id)}</option>
            {/each}
          </select>
        {/if}
      </div>
      {#if heatmapLoading}
        <div class="flex h-[102px] items-center justify-center">
          <span class="loading loading-spinner loading-sm text-white/50"></span>
        </div>
      {:else}
        <div class="flex items-end gap-3">
          <div class="flex">
            <div class="mr-1 flex flex-col" style="gap: 3px">
              {#each ["M", "", "W", "", "F", "", ""] as label}
                <span class="flex h-3 w-4 items-center text-[9px] text-white/40">{label}</span>
              {/each}
            </div>
            <div
              class="grid"
              style="gap: 3px; grid-template-columns: repeat({Math.ceil(heatmapCells.length / 7)}, 12px); grid-template-rows: repeat(7, 12px); grid-auto-flow: column;"
            >
              {#each heatmapCells as date}
                {@const count = dayActivity(heatmapData, date, heatmapProfile)}
                <div class="rounded-sm {heatColor(count)}" title="{date}: {count} events"></div>
              {/each}
            </div>
          </div>
          <div class="flex items-center gap-1 pb-0.5 text-[9px] text-white/40">
            Less
            <span class="h-2 w-2 rounded-sm bg-white/10"></span>
            <span class="h-2 w-2 rounded-sm bg-green-300"></span>
            <span class="h-2 w-2 rounded-sm bg-green-400"></span>
            <span class="h-2 w-2 rounded-sm bg-green-500"></span>
            <span class="h-2 w-2 rounded-sm bg-green-600"></span>
            More
          </div>
        </div>
      {/if}
    </section>

    <!-- Vehicles -->
    <section>
      <h3 class="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/50">
        Vehicles · {farm.vehicles.length}
        {#if farm.vehicles_active_24h > 0}
          <span class="ml-1 normal-case tracking-normal text-emerald-300">
            {farm.vehicles_active_24h} active in 24h
          </span>
        {/if}
      </h3>
      {#if farm.vehicles.length === 0}
        <p class="text-xs text-white/45">No vehicles have reported a position.</p>
      {:else}
        <div class="grid grid-cols-2 gap-1.5">
          {#each farm.vehicles as vehicle (vehicle.id)}
            <button
              type="button"
              class="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 p-2 text-left transition-colors hover:border-white/25 hover:bg-white/10"
              title="Change this vehicle or its driver's details"
              on:click={() => onEditPerson(vehicle.id)}
            >
              <span class="flex h-9 w-9 flex-shrink-0 items-center justify-center">
                <svelte:component
                  this={vehicleComponent(vehicle.type)}
                  bodyColor={vehicle.color || "Yellow"}
                  size="34px"
                />
              </span>
              <span class="min-w-0">
                <span class="block truncate text-xs font-medium">
                  {vehicle.name || "Unnamed"}
                </span>
                <span class="block truncate text-[10px] text-white/50">
                  {vehicleLabel(vehicle.type)}
                </span>
                <span class="block truncate text-[10px] {vehicle.recording ? 'font-medium text-emerald-300' : 'text-white/45'}">
                  {vehicle.recording ? "Recording now" : timeAgo(vehicle.last_update)}
                </span>
              </span>
            </button>
          {/each}
        </div>
      {/if}
    </section>

    <!-- Team -->
    <section>
      <h3 class="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/50">
        Team · {farm.member_count}
      </h3>
      {#if farm.members.length === 0}
        <p class="text-xs text-white/45">Nobody is connected to this map right now.</p>
      {:else}
        <ul class="divide-y divide-white/5 overflow-hidden rounded-lg border border-white/10 bg-white/5">
          {#each farm.members as member (member.id)}
            <li>
              <button
                type="button"
                class="flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition-colors hover:bg-white/10"
                title="Edit this person"
                on:click={() => onEditPerson(member.id)}
              >
                <Icon
                  icon={member.is_owner ? "solar:crown-bold-duotone" : "solar:user-bold-duotone"}
                  width="14"
                  height="14"
                  class={member.is_owner ? "flex-shrink-0 text-amber-300" : "flex-shrink-0 text-white/40"}
                />
                <span class="min-w-0 flex-1 truncate text-xs">{member.name || "Unnamed"}</span>
                <span class="flex-shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/60">
                  {roleLabel(member)}
                </span>
                <span class="w-14 flex-shrink-0 text-right text-[10px] tabular-nums text-white/45">
                  {timeAgo(member.last_sign_in)}
                </span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <p class="text-[10px] text-white/35">
      Map created {formatDate(farm.created_at)}{#if farm.owner_email} · {farm.owner_email}{/if}
    </p>
  </div>

  <!-- Footer: test flag -->
  <div class="flex items-center justify-between gap-2 border-t border-white/10 px-4 py-2.5">
    <span class="text-[10px] text-white/40">
      {#if farm.manual_flag === null}
        Classified automatically
      {:else}
        Set by an admin
      {/if}
    </span>
    <span class="flex items-center gap-1.5">
      {#if farm.manual_flag !== null}
        <button
          type="button"
          class="rounded-lg px-2.5 py-1.5 text-xs font-medium text-white/60 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
          disabled={savingFlag}
          on:click={() => onSetTestFlag(null)}
        >
          Reset
        </button>
      {/if}
      <button
        type="button"
        class="rounded-lg border border-white/20 bg-white/10 px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-white/20 disabled:opacity-50"
        disabled={savingFlag}
        on:click={() => onSetTestFlag(!farm.is_test)}
      >
        {#if savingFlag}
          Saving...
        {:else if farm.is_test}
          Mark as real client
        {:else}
          Mark as test map
        {/if}
      </button>
    </span>
  </div>
</div>
