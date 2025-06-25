<script lang="ts">
  import { subscriptionStore } from "$lib/stores/subscriptionStore"
  import { mapActivityStore } from "$lib/stores/mapActivityStore"
  import Icon from "@iconify/svelte"
  import { goto } from "$app/navigation"

  export let isNativePlatform = false

  // Calculate usage statistics
  $: vehiclesUsed = $mapActivityStore?.connected_profiles?.length || 0
  $: totalVehicles = $subscriptionStore?.current_seats || 1
  $: markersUsed = $mapActivityStore?.marker_count || 0
  $: totalMarkers = $subscriptionStore?.subscription === "FREE" ? 100 : 999999
  $: trailPointsUsed = $mapActivityStore?.trail_count || 0
  $: totalTrailPoints =
    $subscriptionStore?.subscription === "FREE" ? 300000 : 999999999

  // Calculate percentages
  $: vehiclePercentage = (vehiclesUsed / totalVehicles) * 100
  $: markerPercentage = (markersUsed / totalMarkers) * 100
  $: trailPercentage = (trailPointsUsed / totalTrailPoints) * 100

  $: isPaidPlan = $subscriptionStore?.subscription !== "FREE"
  $: planName = isPaidPlan ? "Pro Plan" : "Free Plan"
  $: planDescription = isPaidPlan
    ? "Advanced features for growing farms"
    : "Basic features for small farms"

  function formatNumber(num) {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + "M"
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + "K"
    }
    return num.toString()
  }

  function handleUpgrade() {
    if (!isNativePlatform) {
      goto("/account/billing")
    }
  }
</script>

<section
  class="overflow-hidden rounded-xl border border-base-300 bg-base-100 shadow-lg"
>
  <div class="border-b border-base-300 p-5">
    <h2 class="flex items-center gap-2 text-xl font-semibold text-base-content">
      <Icon
        icon="solar:card-bold-duotone"
        width="18"
        height="18"
        class="text-primary"
      />
      Subscription
    </h2>
  </div>

  <div class="p-4 md:p-6">
    <div class="rounded-xl border border-base-300 bg-base-200 p-4 md:p-6">
      <div class="mb-4 flex items-center justify-between">
        <div>
          <h3 class="flex items-center gap-2 font-medium text-base-content">
            {planName}
            {#if isPaidPlan}
              <Icon
                icon="solar:fire-bold"
                width="16"
                height="16"
                class="text-warning"
              />
            {/if}
          </h3>
          <p class="text-sm text-base-content/60">{planDescription}</p>
        </div>
        <span class="badge badge-success gap-1">
          <Icon icon="solar:check-circle-bold" width="12" height="12" />
          Active
        </span>
      </div>

      <!-- Usage Statistics -->
      <div class="mb-6 space-y-4">
        <!-- Vehicles -->
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <span class="flex items-center gap-2 text-base-content/60">
              <Icon
                icon="solar:users-group-rounded-bold-duotone"
                width="16"
                height="16"
              />
              Vehicles
            </span>
            <span class="font-medium text-base-content">
              {vehiclesUsed}/{isPaidPlan ? "∞" : totalVehicles}
            </span>
          </div>
          <progress
            class="progress progress-success w-full"
            value={vehiclePercentage}
            max="100"
          ></progress>
        </div>

        <!-- Markers -->
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <span class="flex items-center gap-2 text-base-content/60">
              <Icon
                icon="solar:map-point-bold-duotone"
                width="16"
                height="16"
              />
              Markers
            </span>
            <span class="font-medium text-base-content">
              {formatNumber(markersUsed)}/{isPaidPlan
                ? "∞"
                : formatNumber(totalMarkers)}
            </span>
          </div>
          <progress
            class="progress progress-info w-full"
            value={markerPercentage}
            max="100"
          ></progress>
        </div>

        <!-- Trail Points -->
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <span class="flex items-center gap-2 text-base-content/60">
              <Icon icon="solar:routing-bold-duotone" width="16" height="16" />
              Trail Points
            </span>
            <span class="font-medium text-base-content">
              {formatNumber(trailPointsUsed)}/{isPaidPlan
                ? "∞"
                : formatNumber(totalTrailPoints)}
            </span>
          </div>
          <progress
            class="progress progress-secondary w-full"
            value={trailPercentage}
            max="100"
          ></progress>
        </div>
      </div>

      <!-- Action Button -->
      {#if isNativePlatform}
        <div class="text-center">
          <p class="mb-2 text-sm text-base-content/60">
            Manage your subscription on
          </p>
          <p class="font-medium text-base-content">AgSkan Website</p>
        </div>
      {:else}
        <button class="btn btn-primary w-full gap-2" on:click={handleUpgrade}>
          {#if isPaidPlan}
            <Icon icon="solar:settings-bold-duotone" width="16" height="16" />
            Manage Subscription
          {:else}
            <Icon icon="solar:rocket-bold-duotone" width="16" height="16" />
            Upgrade Plan
          {/if}
        </button>
      {/if}
    </div>
  </div>
</section>
