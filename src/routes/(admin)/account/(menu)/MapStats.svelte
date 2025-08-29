<script lang="ts">
  import { goto } from "$app/navigation"
  import { Skeleton } from "$lib/components/ui/skeleton"
  import { connectedMapStore } from "$lib/stores/connectedMapStore"
  import { mapActivityStore } from "$lib/stores/mapActivityStore"
  import { Card, CardContent } from "$lib/components/ui/card"
  import {
    Truck,
    Route,
    MapPin,
    ChevronRight,
    Layers,
    BarChart3,
  } from "lucide-svelte"
  import PinsDialog from "./PinsDialog.svelte"

  // Use new store data
  $: mapMarkers = $mapActivityStore?.marker_count || 0
  $: vehicles = $mapActivityStore?.connected_profiles?.length || 0
  $: trailHectares = $mapActivityStore?.trail_hectares || 0
  $: fieldBoundaries = $mapActivityStore?.field_count || 0

  $: masterSubscription = $connectedMapStore.masterSubscription
  $: loading = !$connectedMapStore || !masterSubscription
  $: isPaidSubscription = masterSubscription?.subscription !== "FREE"

  // Format hectares for display
  function formatHectares(hectares: number): string {
    // 🆕 ADD: Handle undefined/null values
    if (hectares == null || hectares === undefined) {
      return "0 ha"
    }

    if (hectares >= 1000) {
      return (hectares / 1000).toFixed(1) + "K ha"
    } else if (hectares >= 100) {
      return Math.round(hectares) + " ha"
    } else if (hectares >= 10) {
      return hectares.toFixed(1) + " ha"
    } else {
      return hectares.toFixed(2) + " ha"
    }
  }

  function formatNumber(num: number): string {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + "M"
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + "K"
    }
    return num.toString()
  }

  // Subscription limits
  let markerLimit = 100
  let fieldBoundariesMax = 10
  let yourMapId = $connectedMapStore.id
  let pinsDialogOpen = false

  function openPinsDialog() {
    pinsDialogOpen = true
  }

  function goToFieldView() {
    goto("/account/fieldview")
  }
</script>

{#if loading}
  <!-- Mobile Loading -->
  <div class="mb-8 grid grid-cols-2 gap-4 md:hidden">
    {#each Array(4) as _}
      <Card class="rounded-2xl border border-base-300 bg-base-100 shadow-md">
        <CardContent
          class="flex h-full flex-col items-center justify-center p-4"
        >
          <Skeleton class="mb-3 h-10 w-10 rounded-full" />
          <Skeleton class="mb-2 h-4 w-16 rounded-full" />
          <Skeleton class="mb-2 h-5 w-12 rounded-full" />
          <Skeleton class="mb-3 h-3 w-20 rounded-full" />
          <Skeleton class="h-3 w-16 rounded-full" />
        </CardContent>
      </Card>
    {/each}
  </div>

  <!-- Desktop Loading -->
  <div class="mb-8 hidden md:block">
    <Card class="rounded-lg border border-base-300 bg-base-100 shadow-md">
      <CardContent class="p-6">
        <div class="mb-6 flex items-center gap-3 border-b border-base-300 pb-4">
          <Skeleton class="h-8 w-8 rounded-full" />
          <div>
            <Skeleton class="mb-1 h-5 w-32 rounded-full" />
            <Skeleton class="h-3 w-48 rounded-full" />
          </div>
        </div>
        <div class="grid grid-cols-4 gap-6">
          {#each Array(4) as _}
            <Card class="rounded-2xl border border-base-300 bg-base-100">
              <CardContent class="p-6 text-center">
                <Skeleton class="mx-auto mb-4 h-12 w-12 rounded-full" />
                <Skeleton class="mx-auto mb-2 h-4 w-16 rounded-full" />
                <Skeleton class="mx-auto mb-3 h-5 w-12 rounded-full" />
                <Skeleton class="mx-auto mb-4 h-3 w-20 rounded-full" />
                <Skeleton class="mx-auto h-3 w-16 rounded-full" />
              </CardContent>
            </Card>
          {/each}
        </div>
      </CardContent>
    </Card>
  </div>
{:else}
  <!-- Mobile Layout -->
  <div class="mb-8 grid grid-cols-2 gap-4 md:hidden">
    <!-- 🆕 UPDATED: Vehicles Card - removed button wrapper and view details -->
    <div
      class="group relative rounded-2xl border border-base-300 bg-base-100 p-4 transition-all duration-300 hover:-translate-y-1 hover:border-green-500/50 hover:shadow-lg"
    >
      <!-- Background gradient overlay -->
      <div
        class="absolute inset-0 rounded-2xl bg-gradient-to-br from-green-500/5 via-transparent to-green-500/10 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
      ></div>

      <div class="relative z-10">
        <!-- Icon Section -->
        <div class="mb-3 flex items-center justify-center">
          <div
            class="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/10 transition-all duration-300 group-hover:scale-110 group-hover:bg-green-500/20"
          >
            <Truck size={20} class="text-green-500" />
          </div>
        </div>

        <!-- Content -->
        <div class="text-center">
          <h3
            class="mb-2 text-sm font-semibold text-contrast-content transition-colors duration-300 group-hover:text-green-500"
          >
            Vehicles
          </h3>
          <div class="mb-2">
            <span class="text-base font-bold text-base-content">{vehicles}</span
            >
            <span class="ml-1 text-base text-contrast-content"
              >/ {masterSubscription.current_seats}</span
            >
          </div>
          <p class="text-xs text-contrast-content">Active</p>
        </div>
      </div>
    </div>

    <!-- Pins Card -->
    <button on:click={openPinsDialog} class="text-left">
      <div
        class="group relative cursor-pointer rounded-2xl border border-base-300 bg-base-100 p-4 transition-all duration-300 hover:-translate-y-1 hover:border-blue-500/50 hover:shadow-lg"
      >
        <!-- Background gradient overlay -->
        <div
          class="absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-500/5 via-transparent to-blue-500/10 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        ></div>

        <div class="relative z-10">
          <!-- Icon Section -->
          <div class="mb-3 flex items-center justify-center">
            <div
              class="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/10 transition-all duration-300 group-hover:scale-110 group-hover:bg-blue-500/20"
            >
              <MapPin size={20} class="text-blue-500" />
            </div>
          </div>

          <!-- Content -->
          <div class="text-center">
            <h3
              class="mb-2 text-sm font-semibold text-contrast-content transition-colors duration-300 group-hover:text-blue-500"
            >
              Pins
            </h3>
            <div class="mb-2">
              <span class="text-base font-bold text-base-content"
                >{mapMarkers}</span
              >
              {#if !isPaidSubscription}
                <span class="ml-1 text-base text-contrast-content"
                  >/ {markerLimit}</span
                >
              {/if}
            </div>
            <p class="mb-3 text-xs text-contrast-content">
              {#if isPaidSubscription}
                Unlimited
              {:else}
                {markerLimit - mapMarkers} available
              {/if}
            </p>

            <!-- Expandable indicator -->
            <div
              class="flex items-center justify-center gap-2 font-medium text-blue-500"
            >
              <span class="text-xs">View Details</span>
              <ChevronRight
                size={12}
                class="transition-transform duration-300 group-hover:translate-x-1"
              />
            </div>
          </div>
        </div>
      </div>
    </button>

    <!-- 🆕 UPDATED: Trail Hectares Card - removed cursor-pointer class and view details -->
    <div
      class="group relative rounded-2xl border border-base-300 bg-base-100 p-4 transition-all duration-300 hover:-translate-y-1 hover:border-indigo-500/50 hover:shadow-lg"
    >
      <!-- Background gradient overlay -->
      <div
        class="absolute inset-0 rounded-2xl bg-gradient-to-br from-indigo-500/5 via-transparent to-indigo-500/10 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
      ></div>

      <div class="relative z-10">
        <!-- Icon Section -->
        <div class="mb-3 flex items-center justify-center">
          <div
            class="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500/10 transition-all duration-300 group-hover:scale-110 group-hover:bg-indigo-500/20"
          >
            <Route size={20} class="text-indigo-500" />
          </div>
        </div>

        <!-- Content -->
        <div class="text-center">
          <h3
            class="mb-2 text-sm font-semibold text-contrast-content transition-colors duration-300 group-hover:text-indigo-500"
          >
            Trails
          </h3>
          <div class="mb-2">
            <span class="text-base font-bold text-base-content"
              >{formatHectares(trailHectares)}</span
            >
          </div>
          <p class="text-xs text-contrast-content">Total coverage</p>
        </div>
      </div>
    </div>

    <!-- Field Boundaries Card -->
    <button on:click={goToFieldView} class="text-left">
      <div
        class="group relative cursor-pointer rounded-2xl border border-base-300 bg-base-100 p-4 transition-all duration-300 hover:-translate-y-1 hover:border-sky-500/50 hover:shadow-lg"
      >
        <!-- Background gradient overlay -->
        <div
          class="absolute inset-0 rounded-2xl bg-gradient-to-br from-sky-500/5 via-transparent to-sky-500/10 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        ></div>

        <div class="relative z-10">
          <!-- Icon Section -->
          <div class="mb-3 flex items-center justify-center">
            <div
              class="flex h-10 w-10 items-center justify-center rounded-full bg-sky-500/10 transition-all duration-300 group-hover:scale-110 group-hover:bg-sky-500/20"
            >
              <Layers size={20} class="text-sky-500" />
            </div>
          </div>

          <!-- Content -->
          <div class="text-center">
            <h3
              class="mb-2 text-sm font-semibold text-contrast-content transition-colors duration-300 group-hover:text-sky-500"
            >
              Fields
            </h3>
            <div class="mb-2">
              <span class="text-base font-bold text-base-content"
                >{fieldBoundaries}</span
              >
              {#if !isPaidSubscription}
                <span class="ml-1 text-base text-contrast-content"
                  >/ {fieldBoundariesMax}</span
                >
              {/if}
            </div>
            <p class="mb-3 text-xs text-contrast-content">
              {#if isPaidSubscription}
                Unlimited
              {:else}
                {fieldBoundariesMax - fieldBoundaries} remaining
              {/if}
            </p>

            <!-- Expandable indicator -->
            <div
              class="flex items-center justify-center gap-2 font-medium text-sky-500"
            >
              <span class="text-xs">View Details</span>
              <ChevronRight
                size={12}
                class="transition-transform duration-300 group-hover:translate-x-1"
              />
            </div>
          </div>
        </div>
      </div>
    </button>
  </div>

  <!-- Desktop Layout -->
  <div class="mb-8 hidden md:block">
    <div
      class="rounded-lg border border-base-300 bg-base-100 p-6 shadow-md transition-all duration-300 hover:shadow-lg"
    >
      <div class="mb-6 flex items-center gap-3 border-b border-base-300 pb-4">
        <div
          class="flex h-8 w-8 items-center justify-center rounded-full bg-yellow-400/20 shadow-sm"
        >
          <BarChart3 size={16} class="text-yellow-400" />
        </div>
        <div>
          <h4 class="text-lg font-semibold text-base-content">Farm Overview</h4>
          <p class="mt-0.5 text-xs text-contrast-content">
            Track your farm's key metrics and usage statistics
          </p>
        </div>
      </div>

      <div class="grid grid-cols-4 gap-6">
        <!-- 🆕 UPDATED: Vehicles Card - removed view details -->
        <div
          class="group relative rounded-2xl border border-base-300 bg-base-100 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-green-500/50 hover:shadow-lg"
        >
          <!-- Background gradient overlay -->
          <div
            class="absolute inset-0 rounded-2xl bg-gradient-to-br from-green-500/5 via-transparent to-green-500/10 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          ></div>

          <div class="relative z-10">
            <!-- Icon Section -->
            <div class="mb-4 flex items-center justify-center">
              <div
                class="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10 transition-all duration-300 group-hover:scale-110 group-hover:bg-green-500/20"
              >
                <Truck size={24} class="text-green-500" />
              </div>
            </div>

            <!-- Content -->
            <div class="text-center">
              <h3
                class="mb-2 text-base font-semibold text-contrast-content transition-colors duration-300 group-hover:text-green-500"
              >
                Vehicles
              </h3>
              <div class="mb-3">
                <span class="text-lg font-bold text-base-content"
                  >{vehicles}</span
                >
                <span class="ml-1 text-lg text-contrast-content"
                  >/ {masterSubscription.current_seats}</span
                >
              </div>
              <p class="text-sm text-contrast-content">Active</p>
            </div>
          </div>
        </div>

        <!-- Pins Card -->
        <button on:click={openPinsDialog} class="text-left">
          <div
            class="group relative cursor-pointer rounded-2xl border border-base-300 bg-base-100 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-blue-500/50 hover:shadow-lg"
          >
            <!-- Background gradient overlay -->
            <div
              class="absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-500/5 via-transparent to-blue-500/10 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            ></div>

            <div class="relative z-10">
              <!-- Icon Section -->
              <div class="mb-4 flex items-center justify-center">
                <div
                  class="flex h-12 w-12 items-center justify-center rounded-full bg-blue-500/10 transition-all duration-300 group-hover:scale-110 group-hover:bg-blue-500/20"
                >
                  <MapPin size={24} class="text-blue-500" />
                </div>
              </div>

              <!-- Content -->
              <div class="text-center">
                <h3
                  class="mb-2 text-base font-semibold text-contrast-content transition-colors duration-300 group-hover:text-blue-500"
                >
                  Pins
                </h3>
                <div class="mb-3">
                  <span class="text-lg font-bold text-base-content"
                    >{mapMarkers}</span
                  >
                  {#if !isPaidSubscription}
                    <span class="ml-1 text-lg text-contrast-content"
                      >/ {markerLimit}</span
                    >
                  {/if}
                </div>
                <p class="mb-4 text-sm text-contrast-content">
                  {#if isPaidSubscription}
                    Unlimited
                  {:else}
                    {markerLimit - mapMarkers} available
                  {/if}
                </p>

                <!-- Expandable indicator -->
                <div
                  class="flex items-center justify-center gap-2 font-medium text-blue-500"
                >
                  <span class="text-xs">View Details</span>
                  <ChevronRight
                    size={14}
                    class="transition-transform duration-300 group-hover:translate-x-1"
                  />
                </div>
              </div>
            </div>
          </div>
        </button>

        <!-- 🆕 UPDATED: Trail Hectares Card - removed view details -->
        <div
          class="group relative rounded-2xl border border-base-300 bg-base-100 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-indigo-500/50 hover:shadow-lg"
        >
          <!-- Background gradient overlay -->
          <div
            class="absolute inset-0 rounded-2xl bg-gradient-to-br from-indigo-500/5 via-transparent to-indigo-500/10 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          ></div>

          <div class="relative z-10">
            <!-- Icon Section -->
            <div class="mb-4 flex items-center justify-center">
              <div
                class="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-500/10 transition-all duration-300 group-hover:scale-110 group-hover:bg-indigo-500/20"
              >
                <Route size={24} class="text-indigo-500" />
              </div>
            </div>

            <!-- Content -->
            <div class="text-center">
              <h3
                class="mb-2 text-base font-semibold text-contrast-content transition-colors duration-300 group-hover:text-indigo-500"
              >
                Trails
              </h3>
              <div class="mb-3">
                <span class="text-lg font-bold text-base-content"
                  >{formatHectares(trailHectares)}</span
                >
              </div>
              <p class="text-sm text-contrast-content">Total coverage</p>
            </div>
          </div>
        </div>

        <!-- Field Boundaries Card -->
        <button on:click={goToFieldView} class="text-left">
          <div
            class="group relative cursor-pointer rounded-2xl border border-base-300 bg-base-100 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-sky-500/50 hover:shadow-lg"
          >
            <!-- Background gradient overlay -->
            <div
              class="absolute inset-0 rounded-2xl bg-gradient-to-br from-sky-500/5 via-transparent to-sky-500/10 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            ></div>

            <div class="relative z-10">
              <!-- Icon Section -->
              <div class="mb-4 flex items-center justify-center">
                <div
                  class="flex h-12 w-12 items-center justify-center rounded-full bg-sky-500/10 transition-all duration-300 group-hover:scale-110 group-hover:bg-sky-500/20"
                >
                  <Layers size={24} class="text-sky-500" />
                </div>
              </div>

              <!-- Content -->
              <div class="text-center">
                <h3
                  class="mb-2 text-base font-semibold text-contrast-content transition-colors duration-300 group-hover:text-sky-500"
                >
                  Fields
                </h3>
                <div class="mb-3">
                  <span class="text-lg font-bold text-base-content"
                    >{fieldBoundaries}</span
                  >
                  {#if !isPaidSubscription}
                    <span class="ml-1 text-lg text-contrast-content"
                      >/ {fieldBoundariesMax}</span
                    >
                  {/if}
                </div>
                <p class="mb-4 text-sm text-contrast-content">
                  {#if isPaidSubscription}
                    Unlimited
                  {:else}
                    {fieldBoundariesMax - fieldBoundaries} remaining
                  {/if}
                </p>

                <!-- Expandable indicator -->
                <div
                  class="flex items-center justify-center gap-2 font-medium text-sky-500"
                >
                  <span class="text-xs">View Details</span>
                  <ChevronRight
                    size={14}
                    class="transition-transform duration-300 group-hover:translate-x-1"
                  />
                </div>
              </div>
            </div>
          </div>
        </button>
      </div>
    </div>
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
