<!-- src/lib/components/admin/GlobalFarmDetail.svelte -->
<!-- Farm card for the admin global map: owner, team, vehicles and counts.
     Sits over the map, so it uses the fixed dark map-overlay look rather than
     the theme-adaptive account styles. -->
<script lang="ts">
  import Icon from "@iconify/svelte"
  import { X } from "lucide-svelte"
  import vehicleIcons from "$lib/vehicles/index.js"
  import type { GlobalFarm, GlobalFarmVehicle } from "$lib/api/adminApi"
  import { timeAgo, formatDate } from "$lib/utils/adminFormat"
  import {
    STATUS_META,
    farmStatus,
    formatHa,
    type FarmStatus,
  } from "$lib/utils/globalFarmMap"

  export let farm: GlobalFarm
  export let color: string
  export let savingFlag = false
  export let onClose: () => void
  export let onSelectFarm: (id: string) => void
  export let onLocateVehicle: (vehicle: GlobalFarmVehicle) => void
  export let onSetTestFlag: (isTest: boolean | null) => void

  const REASON_LABEL: Record<string, string> = {
    manual: "Flagged by an admin",
    internal: "Owned by an AgSKAN account",
    name: "Named like a test map",
    duplicate: "Copies another map's fields",
  }

  let status: FarmStatus
  $: status = farmStatus(farm)

  function vehicleComponent(type: string | null) {
    if (!type) return vehicleIcons.Pointer
    const icons = vehicleIcons as Record<string, any>
    return (
      icons[type] ||
      icons[type.charAt(0).toUpperCase() + type.slice(1)] ||
      vehicleIcons.Pointer
    )
  }

  // "SelfPropelledBoomspray" -> "Self Propelled Boomspray"
  function vehicleLabel(type: string | null): string {
    if (!type) return "Vehicle"
    const spaced = type.replace(/([a-z])([A-Z])/g, "$1 $2")
    return spaced.charAt(0).toUpperCase() + spaced.slice(1)
  }

  function roleLabel(member: GlobalFarm["members"][number]): string {
    if (member.is_owner) return "Owner"
    const role = member.map_role || member.role || "Member"
    return role.charAt(0).toUpperCase() + role.slice(1).replace(/_/g, " ")
  }

  $: stats = [
    { label: "Mapped", value: farm.field_count ? formatHa(farm.hectares) : "—" },
    { label: "Fields", value: farm.field_count.toLocaleString("en-AU") },
    { label: "Trails", value: farm.trail_count.toLocaleString("en-AU") },
    { label: "Markers", value: farm.marker_count.toLocaleString("en-AU") },
  ]
</script>

<div class="flex max-h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/80 text-white shadow-2xl backdrop-blur-xl">
  <!-- Header -->
  <div class="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
    <div class="flex min-w-0 items-start gap-3">
      <span
        class="mt-1 h-3.5 w-3.5 flex-shrink-0 rounded-full ring-2 ring-white/25"
        style="background: {color}"
      ></span>
      <div class="min-w-0">
        <h2 class="truncate text-base font-semibold leading-tight">
          {farm.map_name?.trim() || "Unnamed map"}
        </h2>
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
      <span class="flex items-center gap-1.5 rounded-full bg-white/10 px-2 py-0.5">
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
              class="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 p-2 text-left transition-colors enabled:hover:border-white/25 enabled:hover:bg-white/10 disabled:cursor-default"
              disabled={vehicle.lng == null || vehicle.lat == null}
              title={vehicle.lng == null ? "No position reported" : "Show on map"}
              on:click={() => onLocateVehicle(vehicle)}
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
        <ul class="divide-y divide-white/5 rounded-lg border border-white/10 bg-white/5">
          {#each farm.members as member (member.id)}
            <li class="flex items-center gap-2 px-2.5 py-1.5">
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
