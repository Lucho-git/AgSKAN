<!-- src/lib/components/admin/GlobalFarmEditModal.svelte -->
<!-- Edit modals for the admin global map. "person" edits one member's name,
     account type and vehicle (picked from the icons, not a dropdown); "map"
     renames the map and hands it to a different owner. Sits over the dark
     map, so it uses the fixed map-overlay look. -->
<script lang="ts">
  import Icon from "@iconify/svelte"
  import { X } from "lucide-svelte"
  import vehicleIcons from "$lib/vehicles/index.js"
  import type { GlobalFarm, GlobalFarmVehicle } from "$lib/api/adminApi"
  import { vehicleIconKey } from "$lib/utils/globalFarmMap"

  type MemberChange = {
    id: string
    name?: string
    role?: string
    vehicle?: { type: string; bodyColor: string }
  }

  export let farm: GlobalFarm
  export let mode: { kind: "person"; id: string } | { kind: "map" }
  export let onClose: () => void
  export let onLocateVehicle: (vehicle: GlobalFarmVehicle) => void
  export let onRenameMap: (name: string) => Promise<boolean>
  export let onSaveMember: (change: MemberChange) => Promise<boolean>
  export let onMakeOwner: (memberId: string) => Promise<boolean>

  const ICON_KEYS = Object.keys(vehicleIcons)
  const COLORS = [
    "Red", "Orange", "Yellow", "Green", "Blue", "Purple", "Pink",
  ]
  const ROLES = [
    { id: "manager", label: "Manager", icon: "solar:shield-user-bold-duotone", note: "Runs the farm" },
    { id: "operator", label: "Operator", icon: "solar:user-bold-duotone", note: "Drives and records" },
    { id: "viewer", label: "Viewer", icon: "solar:eye-bold-duotone", note: "Looks only" },
  ]

  let saving = false

  // ── Person ────────────────────────────────────────────────────────────────
  $: personId = mode.kind === "person" ? mode.id : null
  $: member = personId ? (farm.members.find((m) => m.id === personId) ?? null) : null
  $: vehicle = personId ? (farm.vehicles.find((v) => v.id === personId) ?? null) : null

  let name = ""
  let role = ""
  let type = "Pointer"
  let color = "Yellow"
  // ── Map ───────────────────────────────────────────────────────────────────
  let mapName = ""
  let ownerId = ""
  $: currentOwner = farm.members.find((m) => m.is_owner) ?? null
  $: newOwner =
    ownerId && ownerId !== currentOwner?.id
      ? (farm.members.find((m) => m.id === ownerId) ?? null)
      : null

  // Fill the form once per thing being edited — not again when the farm
  // reloads underneath after a save.
  let filledFor = ""
  $: fill(mode.kind === "person" ? `person:${mode.id}` : `map:${farm.id}`)
  function fill(key: string) {
    if (key === filledFor) return
    filledFor = key
    if (mode.kind === "person") {
      const id = mode.id
      const m = farm.members.find((x) => x.id === id)
      const v = farm.vehicles.find((x) => x.id === id)
      name = m?.name || v?.name || ""
      role = (m?.role || "").toLowerCase()
      type = vehicleIconKey(v?.type ?? null, ICON_KEYS)
      color = v?.color || "Yellow"
    } else {
      mapName = farm.map_name?.trim() || ""
      ownerId = farm.members.find((x) => x.is_owner)?.id || ""
    }
  }

  $: colorOptions = COLORS.some((c) => c.toLowerCase() === color.toLowerCase())
    ? COLORS
    : [color, ...COLORS]

  function iconFor(key: string) {
    return (vehicleIcons as Record<string, any>)[key]
  }

  // "SelfPropelledBoomspray" -> "Self Propelled Boomspray"
  function label(key: string): string {
    return key.replace(/([a-z])([A-Z])/g, "$1 $2")
  }

  async function savePerson() {
    if (!personId) return
    const change: MemberChange = { id: personId }
    const trimmed = name.trim()
    if (trimmed && trimmed !== (member?.name || "")) change.name = trimmed
    if (role && role !== (member?.role || "").toLowerCase()) change.role = role
    if (
      vehicle &&
      (type !== vehicleIconKey(vehicle.type, ICON_KEYS) || color !== (vehicle.color || "Yellow"))
    ) {
      change.vehicle = { type, bodyColor: color }
    }
    if (!change.name && !change.role && !change.vehicle) return onClose()
    saving = true
    const ok = await onSaveMember(change)
    saving = false
    if (ok) onClose()
  }

  async function saveMap() {
    const trimmed = mapName.trim()
    const rename = !!trimmed && trimmed !== (farm.map_name?.trim() || "")
    if (!rename && !newOwner) return onClose()
    saving = true
    let ok = true
    if (rename) ok = await onRenameMap(trimmed)
    if (ok && newOwner) ok = await onMakeOwner(newOwner.id)
    saving = false
    if (ok) onClose()
  }

  const inputClass =
    "w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-white/40 focus:outline-none"
  const labelClass = "mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-white/50"
</script>

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
<div
  class="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm"
  on:click|self={onClose}
>
  <form
    class="flex max-h-full w-full max-w-[460px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/85 text-white shadow-2xl backdrop-blur-xl"
    on:submit|preventDefault={mode.kind === "person" ? savePerson : saveMap}
  >
    <!-- Header -->
    <div class="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
      <div class="flex min-w-0 items-center gap-2.5">
        <span class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white/10">
          {#if mode.kind === "person" && vehicle}
            <svelte:component this={iconFor(type)} bodyColor={color} size="26px" />
          {:else}
            <Icon
              icon={mode.kind === "person" ? "solar:user-bold-duotone" : "solar:map-bold-duotone"}
              width="18"
              height="18"
              class="text-white/80"
            />
          {/if}
        </span>
        <div class="min-w-0">
          <h2 class="truncate text-sm font-semibold">
            {mode.kind === "person"
              ? member?.name || vehicle?.name || "Unnamed person"
              : farm.map_name?.trim() || "Unnamed map"}
          </h2>
          <p class="truncate text-[11px] text-white/50">
            {#if mode.kind === "person"}
              {member?.is_owner ? "Map owner · " : ""}{farm.map_name?.trim() || "Unnamed map"}
            {:else}
              Map name and owner
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

    <!-- Body -->
    <div class="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
      {#if mode.kind === "person"}
        {#if member?.email || member?.phone}
          <div class="flex flex-wrap gap-1.5">
            {#if member.email}
              <a
                href="mailto:{member.email}"
                class="inline-flex min-w-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                title="Email this person"
              >
                <Icon icon="solar:letter-bold-duotone" width="14" height="14" class="flex-shrink-0 text-white/50" />
                <span class="truncate">{member.email}</span>
              </a>
            {/if}
            {#if member.phone}
              <a
                href="tel:{member.phone}"
                class="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                title="Call this person"
              >
                <Icon icon="solar:phone-bold-duotone" width="14" height="14" class="flex-shrink-0 text-white/50" />
                {member.phone}
              </a>
            {/if}
          </div>
        {/if}

        <label class="block">
          <span class={labelClass}>Name</span>
          <input type="text" class={inputClass} maxlength="80" bind:value={name} />
        </label>

        {#if member}
          <div>
            <span class={labelClass}>Account type</span>
            <div class="grid grid-cols-3 gap-1.5">
              {#each ROLES as option (option.id)}
                <button
                  type="button"
                  aria-pressed={role === option.id}
                  class="flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-center transition-colors {role === option.id
                    ? 'border-emerald-400/70 bg-emerald-400/15'
                    : 'border-white/10 bg-white/5 hover:bg-white/10'}"
                  on:click={() => (role = option.id)}
                >
                  <Icon icon={option.icon} width="20" height="20" class={role === option.id ? "text-emerald-300" : "text-white/60"} />
                  <span class="text-xs font-medium">{option.label}</span>
                  <span class="text-[10px] leading-tight text-white/45">{option.note}</span>
                </button>
              {/each}
            </div>
          </div>
        {/if}

        {#if vehicle}
          <div>
            <span class={labelClass}>Vehicle · <span class="normal-case tracking-normal text-white/80">{label(type)}</span></span>
            <div class="grid max-h-[212px] grid-cols-6 gap-1.5 overflow-y-auto pr-1">
              {#each ICON_KEYS as key (key)}
                <button
                  type="button"
                  aria-pressed={type === key}
                  title={label(key)}
                  class="flex aspect-square items-center justify-center rounded-lg border transition-colors {type === key
                    ? 'border-emerald-400/70 bg-emerald-400/15'
                    : 'border-white/10 bg-white/5 hover:bg-white/10'}"
                  on:click={() => (type = key)}
                >
                  <svelte:component this={iconFor(key)} bodyColor={color} size="38px" />
                </button>
              {/each}
            </div>
          </div>

          <div>
            <span class={labelClass}>Colour · <span class="normal-case tracking-normal text-white/80">{color}</span></span>
            <div class="flex flex-wrap gap-2">
              {#each colorOptions as option (option)}
                <button
                  type="button"
                  aria-pressed={color === option}
                  title={option}
                  class="h-8 w-8 rounded-full border-2 transition-transform hover:scale-110 {color === option
                    ? 'border-white ring-2 ring-emerald-400/70'
                    : 'border-white/25'}"
                  style="background: {option}"
                  on:click={() => (color = option)}
                ></button>
              {/each}
            </div>
          </div>
        {:else}
          <p class="text-xs text-white/50">
            This person hasn't put a vehicle on this map yet, so there's no vehicle to change.
          </p>
        {/if}
      {:else}
        <label class="block">
          <span class={labelClass}>Map name</span>
          <input type="text" class={inputClass} maxlength="80" bind:value={mapName} />
        </label>

        <div>
          <span class={labelClass}>Owner</span>
          {#if farm.members.length === 0}
            <p class="text-xs text-white/50">Nobody is on this map to hand it to.</p>
          {:else}
            <div class="max-h-[260px] space-y-1 overflow-y-auto pr-1">
              {#each farm.members as person (person.id)}
                <button
                  type="button"
                  aria-pressed={ownerId === person.id}
                  class="flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors {ownerId === person.id
                    ? 'border-amber-300/70 bg-amber-300/10'
                    : 'border-white/10 bg-white/5 hover:bg-white/10'}"
                  on:click={() => (ownerId = person.id)}
                >
                  <Icon
                    icon={ownerId === person.id ? "solar:crown-bold-duotone" : "solar:user-bold-duotone"}
                    width="18"
                    height="18"
                    class={ownerId === person.id ? "flex-shrink-0 text-amber-300" : "flex-shrink-0 text-white/40"}
                  />
                  <span class="min-w-0 flex-1 truncate text-sm">{person.name || "Unnamed"}</span>
                  <span class="flex-shrink-0 text-[11px] text-white/45">
                    {person.is_owner ? "Current owner" : person.role || "Member"}
                  </span>
                </button>
              {/each}
            </div>
          {/if}
          {#if newOwner}
            <p class="mt-2 rounded-lg border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-xs text-amber-100/90">
              Saving hands this map to {newOwner.name || "this person"}.
              {currentOwner?.name || "The current owner"} stays on it as an ordinary member.
            </p>
          {/if}
        </div>
      {/if}
    </div>

    <!-- Footer -->
    <div class="flex items-center justify-between gap-2 border-t border-white/10 px-4 py-3">
      <span>
        {#if mode.kind === "person" && vehicle && vehicle.lng != null && vehicle.lat != null}
          <button
            type="button"
            class="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs font-medium transition-colors hover:bg-white/20"
            on:click={() => {
              if (vehicle) onLocateVehicle(vehicle)
              onClose()
            }}
          >
            Show on map
          </button>
        {/if}
      </span>
      <button
        type="submit"
        class="rounded-[10px] bg-gradient-to-br from-green-500 to-green-600 px-4 py-2.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        disabled={saving}
      >
        {#if saving}
          Saving...
        {:else if mode.kind === "map" && newOwner}
          Save and transfer
        {:else}
          Save changes
        {/if}
      </button>
    </div>
  </form>
</div>
