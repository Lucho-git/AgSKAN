<!--src\lib\components\map\GuestMapBar.svelte-->
<script lang="ts">
  import { onMount } from "svelte"
  import { toast } from "svelte-sonner"
  import { MapPin, UserPlus } from "lucide-svelte"
  import { supabase } from "$lib/stores/sessionStore"
  import { profileStore } from "$lib/stores/profileStore"
  import { connectedMapStore } from "$lib/stores/connectedMapStore"
  import { selectedOperationStore } from "$lib/stores/operationStore"

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

  function createAccount() {
    toast.info("Account upgrades are coming soon", {
      description: "Your guest access keeps working in the meantime.",
      duration: 5000,
    })
  }
</script>

<!-- Ultra-thin status pill for the guest map. It sits in the top strip
     BETWEEN the back button (left-4) and the right-hand control column
     (right-4), so it must stay one short row — hence the left-20 offset,
     the width cap and the truncating map name. Guests are read-only and
     don't pick operations, so there is no operation switcher anymore
     (a valid operation is auto-selected above so trails still load). -->
<div
  class="guest-bar fixed left-20 top-3 z-[60] flex max-w-[calc(100vw-168px)] items-center gap-1.5 rounded-full border border-white/10 bg-black/70 py-1 pl-2 pr-1 shadow-lg backdrop-blur-md"
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
  <button
    class="ml-0.5 flex shrink-0 items-center gap-1 rounded-full bg-amber-500/90 px-2 py-1 text-[10px] font-semibold leading-none text-black transition hover:bg-amber-400"
    on:click={createAccount}
    title="Create an account"
  >
    <UserPlus size={11} />
    <span class="hidden sm:inline">Create account</span>
  </button>
</div>
