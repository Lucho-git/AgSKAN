<!--src\lib\components\map\GuestMapBar.svelte-->
<script lang="ts">
  import { onMount } from "svelte"
  import { goto } from "$app/navigation"
  import { toast } from "svelte-sonner"
  import {
    ChevronDown,
    Loader2,
    LogOut,
    MapPin,
    UserPlus,
  } from "lucide-svelte"
  import { supabase } from "$lib/stores/sessionStore"
  import { profileStore } from "$lib/stores/profileStore"
  import { connectedMapStore } from "$lib/stores/connectedMapStore"
  import { selectedOperationStore } from "$lib/stores/operationStore"

  let operations: any[] = []
  let opsOpen = false
  let loadingOps = false

  $: mapId = $profileStore?.master_map_id
  $: mapName = $connectedMapStore?.map_name || "Shared map"
  $: currentOperation = $selectedOperationStore

  onMount(loadOperations)

  async function loadOperations() {
    if (!mapId) return
    loadingOps = true
    try {
      const { data, error } = await supabase
        .from("operations")
        .select("id, name, year, master_map_id")
        .eq("master_map_id", mapId)
        .order("year", { ascending: false })
      if (error) throw error
      operations = data || []

      // Make sure a valid operation is always selected so trails load.
      const current = $selectedOperationStore
      const stillValid =
        current && operations.some((op) => op.id === current.id)
      if (!stillValid && operations.length > 0) {
        selectedOperationStore.set(operations[0])
      }
    } catch (error) {
      console.warn("Guest operation list failed:", error)
    } finally {
      loadingOps = false
    }
  }

  function pickOperation(op: any) {
    opsOpen = false
    if ($selectedOperationStore?.id === op.id) return
    selectedOperationStore.set(op)
  }

  function toggleOps() {
    opsOpen = !opsOpen
  }

  function createAccount() {
    toast.info("Account upgrades are coming soon", {
      description: "Your guest access keeps working in the meantime.",
      duration: 5000,
    })
  }

  function leave() {
    // Keep the anonymous session — reopening the same invite link then
    // rejoins this same guest account instead of creating a new one.
    goto("/")
  }
</script>

<svelte:window on:click={() => (opsOpen = false)} />

<div
  class="guest-bar fixed left-3 top-3 z-[60] flex flex-col gap-1"
  on:click|stopPropagation
  on:keydown|stopPropagation
>
  <div
    class="flex items-center gap-2 rounded-xl border border-white/10 bg-black/70 px-2.5 py-2 shadow-lg backdrop-blur-md"
  >
    <span
      class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500/20"
    >
      <MapPin size={14} class="text-amber-300" />
    </span>
    <div class="min-w-0 pr-1">
      <p class="max-w-[140px] truncate text-xs font-semibold leading-tight text-white">
        {mapName}
      </p>
      <p class="text-[9px] uppercase tracking-wider text-amber-300/90">
        Guest view · read only
      </p>
    </div>

    <!-- Operation switcher -->
    <button
      class="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[11px] font-medium text-white transition hover:bg-white/10"
      on:click|stopPropagation={toggleOps}
      title="Switch operation"
    >
      {#if loadingOps && !currentOperation}
        <Loader2 size={11} class="animate-spin" />
      {/if}
      <span class="max-w-[110px] truncate">
        {currentOperation ? currentOperation.name : "Select operation"}
      </span>
      <ChevronDown
        size={11}
        style={opsOpen ? "transform: rotate(180deg); transition: transform 0.15s" : "transition: transform 0.15s"}
      />
    </button>

    <div class="mx-1 h-6 w-px bg-white/10"></div>

    <button
      class="flex items-center gap-1 rounded-lg bg-amber-500/90 px-2.5 py-1.5 text-[11px] font-semibold text-black transition hover:bg-amber-400"
      on:click|stopPropagation={createAccount}
      title="Create an account"
    >
      <UserPlus size={12} />
      Create account
    </button>

    <button
      class="flex h-7 w-7 items-center justify-center rounded-lg text-white/60 transition hover:bg-white/10 hover:text-white"
      on:click|stopPropagation={leave}
      title="Leave the map (rejoin anytime with the same link)"
    >
      <LogOut size={13} />
    </button>
  </div>

  <!-- Operation dropdown -->
  {#if opsOpen}
    <div
      class="ml-9 max-h-56 w-52 overflow-y-auto rounded-xl border border-white/10 bg-black/80 p-1 shadow-xl backdrop-blur-md"
    >
      {#if operations.length === 0}
        <p class="px-3 py-2 text-[11px] text-white/50">
          {loadingOps ? "Loading operations…" : "No operations on this map"}
        </p>
      {:else}
        {#each operations as op (op.id)}
          <button
            class="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[11px] text-white/80 transition hover:bg-white/10"
            class:op-active={currentOperation?.id === op.id}
            on:click|stopPropagation={() => pickOperation(op)}
          >
            <span class="truncate font-medium">{op.name}</span>
            {#if op.year}
              <span class="ml-2 shrink-0 text-[10px] text-white/40">{op.year}</span>
            {/if}
          </button>
        {/each}
      {/if}
    </div>
  {/if}
</div>

<style>
  .op-active {
    background: rgba(255, 255, 255, 0.12);
  }
</style>
