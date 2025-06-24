<script lang="ts">
  import { Skeleton } from "$lib/components/ui/skeleton"
  import { connectedMapStore } from "$lib/stores/connectedMapStore"
  import { mapActivityStore } from "$lib/stores/mapActivityStore"
  import { Card, CardContent } from "$lib/components/ui/card"
  import { Truck, Route, MapPin } from "lucide-svelte"
  import PinsDialog from "./PinsDialog.svelte"

  $: mapMarkers = $mapActivityStore.marker_count
  $: vehicles = $mapActivityStore.connected_profiles.length
  $: trailCoordinates = $mapActivityStore.trail_count
  $: masterSubscription = $connectedMapStore.masterSubscription
  $: loading = !$connectedMapStore || !masterSubscription
  $: isPaidSubscription = masterSubscription?.subscription !== "FREE"

  function formatNumber(num: number): string {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + "M"
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + "K"
    }
    return num.toString()
  }

  let markerLimit = 100
  let yourMapId = $connectedMapStore.id
  let pinsDialogOpen = false

  function openPinsDialog() {
    pinsDialogOpen = true
  }
</script>

{#if loading}
  <div class="grid grid-cols-3 gap-2 sm:gap-4">
    {#each Array(3) as _}
      <Card class="border border-base-300 bg-base-100 shadow-md">
        <CardContent
          class="flex h-full flex-col items-center justify-center p-3"
        >
          <Skeleton class="mb-2 h-[16px] w-[60px] rounded-full" />
          <Skeleton class="h-[20px] w-[40px] rounded-full" />
          <Skeleton class="mt-1 h-[12px] w-[80px] rounded-full" />
        </CardContent>
      </Card>
    {/each}
  </div>
{:else}
  <div class="grid grid-cols-3 gap-2 sm:gap-4">
    <!-- Map Markers Card -->
    <button on:click={openPinsDialog} class="text-left">
      <Card
        class="group cursor-pointer border border-base-300 bg-base-100 shadow-md transition-all duration-300 hover:shadow-lg"
      >
        <CardContent
          class="flex h-full flex-col items-center justify-center p-3"
        >
          <div class="mb-2">
            <div
              class="mx-auto flex h-6 w-6 items-center justify-center rounded-full bg-green-100 transition-all duration-300 group-hover:scale-105"
            >
              <MapPin size={14} class="text-green-600" />
            </div>
          </div>
          <p class="mb-1 text-xs font-semibold text-contrast-content">Pins</p>
          <div class="mb-1 text-sm font-bold text-contrast-content">
            {mapMarkers}/{markerLimit}
          </div>
          <p
            class="text-center text-[10px] leading-tight text-contrast-content/60"
          >
            {#if isPaidSubscription}
              Unlimited
            {:else}
              {markerLimit - mapMarkers} left
            {/if}
          </p>
        </CardContent>
      </Card>
    </button>

    <!-- Vehicles Card -->
    <Card
      class="border border-base-300 bg-base-100 shadow-md transition-all duration-300 hover:shadow-lg"
    >
      <CardContent class="flex h-full flex-col items-center justify-center p-3">
        <div class="mb-2">
          <div
            class="mx-auto flex h-6 w-6 items-center justify-center rounded-full bg-blue-100"
          >
            <Truck size={14} class="text-blue-600" />
          </div>
        </div>
        <p class="mb-1 text-xs font-semibold text-contrast-content">Vehicles</p>
        <div class="mb-1 text-sm font-bold text-contrast-content">
          {vehicles}/{masterSubscription.current_seats}
        </div>
        <p
          class="text-center text-[10px] leading-tight text-contrast-content/60"
        >
          Active
        </p>
      </CardContent>
    </Card>

    <!-- Trail Points Card -->
    <Card
      class="border border-base-300 bg-base-100 shadow-md transition-all duration-300 hover:shadow-lg"
    >
      <CardContent class="flex h-full flex-col items-center justify-center p-3">
        <div class="mb-2">
          <div
            class="mx-auto flex h-6 w-6 items-center justify-center rounded-full bg-purple-100"
          >
            <Route size={14} class="text-purple-600" />
          </div>
        </div>
        <p class="mb-1 text-xs font-semibold text-contrast-content">
          Trail Points
        </p>
        <div class="mb-1 text-sm font-bold text-contrast-content">
          {formatNumber(trailCoordinates)}
        </div>
        <p
          class="text-center text-[10px] leading-tight text-contrast-content/60"
        >
          {#if isPaidSubscription}
            Unlimited
          {:else}
            300K limit
          {/if}
        </p>
      </CardContent>
    </Card>
  </div>

  <!-- PinsDialog -->
  <PinsDialog
    bind:open={pinsDialogOpen}
    mapId={yourMapId}
    {mapMarkers}
    {isPaidSubscription}
    {markerLimit}
  />
{/if}
