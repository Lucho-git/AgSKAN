<!--src\lib\components\map\GuestMapBar.svelte-->
<script lang="ts">
  import { onMount } from "svelte"
  import { goto } from "$app/navigation"
  import {
    ChevronDown,
    DoorOpen,
    MapPin,
    UserPlus,
  } from "lucide-svelte"
  import { supabase } from "$lib/stores/sessionStore"
  import { profileStore } from "$lib/stores/profileStore"
  import { connectedMapStore } from "$lib/stores/connectedMapStore"
  import { selectedOperationStore } from "$lib/stores/operationStore"
  import { goToGuestSignup } from "$lib/utils/guestUpgrade"

  let menuOpen = false

  $: mapId = $profileStore?.master_map_id
  $: mapName = $connectedMapStore?.map_name || "Shared map"

  onMount(loadOperations)

  // Guests can't pick operations (read-only view) — silently make sure a
  // valid operation is always selected so trails still load.
  async function loadOperations() {
    if (!mapId) return
    try {
      const { data, error } = await supabase
        .from("operations")
        .select("id, name, year, master_map_id")
        .eq("master_map_id", mapId)
        .order("year", { ascending: false })
      if (error) throw error
      const operations = data || []
      const current = $selectedOperationStore
      const stillValid =
        current && operations.some((op) => op.id === current.id)
      if (!stillValid && operations.length > 0) {
        selectedOperationStore.set(operations[0])
      }
    } catch (error) {
      console.warn("Guest operation list failed:", error)
    }
  }

  function toggleMenu() {
    menuOpen = !menuOpen
  }

  function closeMenu() {
    menuOpen = false
  }

  function createAccount() {
    closeMenu()
    goToGuestSignup()
  }

  // Leave map = head back to the guest home. Deliberately does NOT
  // disconnect (no clearing master_map_id) — a guest keeps their access and
  // can reopen the map until their invite window expires.
  function leaveMap() {
    closeMenu()
    goto("/guest/home")
  }
</script>

<svelte:window on:click={closeMenu} />

<!-- Ultra-thin status pill for the guest map — now a MENU button. It sits in
     the top strip BETWEEN the back button (left-4) and the right-hand control
     column (right-4), so it must stay one short row (left-20 offset, width
     cap, truncating map name). Tapping it opens the guest menu (create
     account / leave map / sign out). Guests are read-only and don't pick
     operations — a valid one is auto-selected above so trails still load. -->
<div
  class="guest-bar fixed left-20 top-3 z-[60] flex flex-col items-start gap-1.5"
  on:click|stopPropagation
  on:keydown|stopPropagation
>
  <button
    class="flex max-w-[calc(100vw-168px)] items-center gap-1.5 rounded-full border border-white/10 bg-black/70 py-1 pl-2 pr-1.5 shadow-lg backdrop-blur-md transition hover:bg-black/80"
    on:click={toggleMenu}
    aria-haspopup="menu"
    aria-expanded={menuOpen}
    title="Guest menu"
  >
    <span
      class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/20"
    >
      <MapPin size={11} class="text-amber-300" />
    </span>
    <span
      class="min-w-0 truncate text-[10px] font-semibold leading-none text-white"
    >
      {mapName}
    </span>
    <span
      class="shrink-0 whitespace-nowrap text-[9px] uppercase leading-none tracking-wider text-amber-300/90"
    >
      Guest view<span class="hidden sm:inline"> · read only</span>
    </span>
    <span class="guest-chevron" class:open={menuOpen}>
      <ChevronDown size={12} />
    </span>
  </button>

  {#if menuOpen}
    <div
      class="w-44 overflow-hidden rounded-xl border border-white/10 bg-black/85 p-1 shadow-xl backdrop-blur-md"
      role="menu"
    >
      <button
        class="guest-menu-item guest-menu-primary"
        role="menuitem"
        on:click={createAccount}
      >
        <UserPlus size={13} />
        <span>Create account</span>
      </button>
      <button class="guest-menu-item" role="menuitem" on:click={leaveMap}>
        <DoorOpen size={13} />
        <span>Leave map</span>
      </button>
    </div>
  {/if}
</div>

<style>
  .guest-chevron {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    color: rgba(252, 211, 77, 0.8);
    transition: transform 0.15s;
  }
  .guest-chevron.open {
    transform: rotate(180deg);
  }
  .guest-menu-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 10px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: rgba(255, 255, 255, 0.85);
    font-size: 11.5px;
    font-weight: 600;
    text-align: left;
    cursor: pointer;
    transition: background 0.15s;
  }
  .guest-menu-item:hover {
    background: rgba(255, 255, 255, 0.1);
  }
  .guest-menu-item:disabled {
    opacity: 0.55;
    cursor: default;
  }
  .guest-menu-primary {
    color: #fcd34d;
  }
</style>
