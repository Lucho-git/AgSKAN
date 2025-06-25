<script lang="ts">
  import { goto } from "$app/navigation"
  import { subscriptionStore } from "$lib/stores/subscriptionStore"
  import { Capacitor } from "@capacitor/core"
  import Icon from "@iconify/svelte"

  // Check if running on native platform
  const isNativePlatform = Capacitor.isNativePlatform()

  // Mock subscription data - replace with real data from your store
  $: subscriptionData = {
    plan: $subscriptionStore?.subscription || "FREE",
    usage: {
      vehicles: { current: 1, limit: 1 },
      markers: { current: 0, limit: 100 },
      tracks: { current: 0, limit: 10 },
    },
    nextBilling: new Date("2025-02-25"),
    features: {
      FREE: ["1 Vehicle", "100 Markers", "10 Tracks", "Basic Support"],
      PRO: [
        "5 Vehicles",
        "1,000 Markers",
        "100 Tracks",
        "Advanced Analytics",
        "Priority Support",
        "Export Data",
      ],
      PREMIUM: [
        "Unlimited Vehicles",
        "Unlimited Markers",
        "Unlimited Tracks",
        "Real-time Analytics",
        "24/7 Support",
        "API Access",
        "Custom Integrations",
      ],
    },
  }

  function handleUpgrade(plan) {
    if (isNativePlatform) {
      // Handle in-app purchase for mobile
      console.log(`Initiating in-app purchase for ${plan}`)
    } else {
      // Redirect to web checkout
      goto(`/checkout?plan=${plan.toLowerCase()}`)
    }
  }
</script>

<svelte:head>
  <title>Subscription</title>
</svelte:head>

<!-- Header -->
<div
  class="flex items-center justify-between border-b border-base-300 bg-base-100 p-5"
>
  <h2
    class="flex items-center gap-2 text-xl font-semibold text-contrast-content"
  >
    <div class="rounded-lg bg-base-content/10 p-1.5">
      <Icon
        icon="solar:card-bold-duotone"
        width="18"
        height="18"
        class="text-base-content"
      />
    </div>
    Subscription
  </h2>
</div>

<!-- Content -->
<div class="space-y-6 p-6">
  <!-- Current Plan -->
  <div>
    <h3 class="mb-3 flex items-center gap-2 font-medium text-contrast-content">
      <div class="rounded-lg bg-base-content/10 p-1.5">
        <Icon
          icon="solar:crown-bold-duotone"
          width="16"
          height="16"
          class="text-base-content"
        />
      </div>
      Current Plan
    </h3>

    <div class="rounded-lg border border-base-300 bg-base-200 p-4">
      <div class="flex items-center justify-between">
        <div>
          <h4 class="text-lg font-semibold text-contrast-content">
            {subscriptionData.plan} Plan
          </h4>
          {#if subscriptionData.plan !== "FREE"}
            <p class="text-sm text-contrast-content/60">
              Next billing: {subscriptionData.nextBilling.toLocaleDateString()}
            </p>
          {:else}
            <p class="text-sm text-contrast-content/60">
              No billing - Free forever
            </p>
          {/if}
        </div>
        <div class="badge badge-outline badge-lg">
          {subscriptionData.plan}
        </div>
      </div>
    </div>
  </div>

  <!-- Usage Stats -->
  <div>
    <h3 class="mb-3 flex items-center gap-2 font-medium text-contrast-content">
      <div class="rounded-lg bg-base-content/10 p-1.5">
        <Icon
          icon="solar:chart-bold-duotone"
          width="16"
          height="16"
          class="text-base-content"
        />
      </div>
      Usage Statistics
    </h3>

    <div class="grid gap-4 md:grid-cols-3">
      {#each Object.entries(subscriptionData.usage) as [key, usage]}
        <div class="rounded-lg border border-base-300 bg-base-200 p-4">
          <div class="mb-2 flex items-center justify-between">
            <span class="text-sm font-medium capitalize text-contrast-content">
              {key}
            </span>
            <span class="text-xs text-contrast-content/60">
              {usage.current}/{usage.limit}
            </span>
          </div>
          <div class="h-2 w-full rounded-full bg-base-300">
            <div
              class="h-2 rounded-full {usage.current / usage.limit > 0.8
                ? 'bg-error'
                : usage.current / usage.limit > 0.6
                  ? 'bg-warning'
                  : 'bg-success'}"
              style="width: {Math.min(
                (usage.current / usage.limit) * 100,
                100,
              )}%"
            ></div>
          </div>
        </div>
      {/each}
    </div>
  </div>

  <!-- Available Plans -->
  <div>
    <h3 class="mb-3 flex items-center gap-2 font-medium text-contrast-content">
      <div class="rounded-lg bg-base-content/10 p-1.5">
        <Icon
          icon="solar:layers-bold-duotone"
          width="16"
          height="16"
          class="text-base-content"
        />
      </div>
      Available Plans
    </h3>

    <div class="grid gap-4 md:grid-cols-3">
      {#each Object.entries(subscriptionData.features) as [plan, features]}
        <div
          class="rounded-lg border-2 p-6 {subscriptionData.plan === plan
            ? 'border-base-content bg-base-content/5'
            : 'border-base-300 bg-base-100'}"
        >
          <div class="mb-4 text-center">
            <h4 class="text-xl font-bold text-contrast-content">{plan}</h4>
            <p class="text-2xl font-bold text-contrast-content">
              {plan === "FREE" ? "$0" : plan === "PRO" ? "$9" : "$29"}
              <span class="text-sm font-normal text-contrast-content/60">
                {plan === "FREE" ? "" : "/month"}
              </span>
            </p>
          </div>

          <ul class="mb-6 space-y-2">
            {#each features as feature}
              <li class="flex items-center gap-2 text-sm text-contrast-content">
                <Icon
                  icon="solar:check-circle-bold-duotone"
                  width="16"
                  height="16"
                  class="text-success"
                />
                {feature}
              </li>
            {/each}
          </ul>

          {#if subscriptionData.plan === plan}
            <button class="btn btn-outline w-full" disabled>
              Current Plan
            </button>
          {:else if plan === "FREE"}
            <button class="btn btn-outline w-full" disabled>
              Downgrade Available
            </button>
          {:else}
            <button
              class="btn btn-primary w-full gap-2"
              on:click={() => handleUpgrade(plan)}
            >
              <Icon icon="solar:crown-bold-duotone" width="16" height="16" />
              Upgrade to {plan}
            </button>
          {/if}
        </div>
      {/each}
    </div>
  </div>

  <!-- Billing Information -->
  {#if subscriptionData.plan !== "FREE"}
    <div>
      <h3
        class="mb-3 flex items-center gap-2 font-medium text-contrast-content"
      >
        <div class="rounded-lg bg-base-content/10 p-1.5">
          <Icon
            icon="solar:bill-list-bold-duotone"
            width="16"
            height="16"
            class="text-base-content"
          />
        </div>
        Billing Information
      </h3>

      <div class="space-y-3">
        <button class="btn btn-outline w-full justify-start gap-3">
          <Icon icon="solar:card-bold-duotone" width="18" height="18" />
          Update Payment Method
        </button>

        <button class="btn btn-outline w-full justify-start gap-3">
          <Icon icon="solar:bill-list-bold-duotone" width="18" height="18" />
          View Billing History
        </button>

        <button
          class="btn btn-outline w-full justify-start gap-3 border-error text-error hover:bg-error hover:text-white"
        >
          <Icon icon="solar:close-circle-bold-duotone" width="18" height="18" />
          Cancel Subscription
        </button>
      </div>
    </div>
  {/if}
</div>
