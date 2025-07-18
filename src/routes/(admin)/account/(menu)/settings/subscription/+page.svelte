<script lang="ts">
  import { onMount } from "svelte"
  import { goto } from "$app/navigation"
  import { session, supabase } from "$lib/stores/sessionStore"
  import { Capacitor } from "@capacitor/core"
  import Icon from "@iconify/svelte"

  // Check if running on native platform
  const isNativePlatform = Capacitor.isNativePlatform()

  let loading = true
  let subscriptionData = null

  // Subscription state
  let currentPlan = "FREE"
  let planQuantity = "1"
  let isPaidPlan = false

  async function loadUserSubscription() {
    try {
      // Fetch user's subscription from the database (same as settings page)
      const { data, error } = await supabase
        .from("user_subscriptions")
        .select("*")
        .eq("user_id", $session.user.id)
        .single()

      if (data && !error) {
        subscriptionData = data
        currentPlan = data.subscription || "FREE"
        isPaidPlan = currentPlan !== "FREE"
        planQuantity = data.current_seats?.toString() || "1"
      }
    } catch (err) {
      console.error("Error fetching subscription:", err)
    }
  }

  function handleUpgrade() {
    // Only redirect if not on native platform
    if (!isNativePlatform) {
      goto("/account/billing")
    }
  }

  function handleManageBilling() {
    // Only redirect if not on native platform
    if (!isNativePlatform) {
      goto("/account/billing")
    }
  }

  onMount(async () => {
    if (!$session) {
      goto("/login")
      return
    }

    await loadUserSubscription()
    loading = false
  })

  // Reactive values based on loaded data
  $: formattedPlanName =
    currentPlan === "FREE"
      ? "Free Plan"
      : currentPlan.charAt(0) + currentPlan.slice(1).toLowerCase() + " Plan"
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
  {#if loading}
    <div class="flex h-32 items-center justify-center">
      <div class="loading loading-spinner loading-md"></div>
    </div>
  {:else}
    <!-- Current Plan -->
    <div>
      <h3
        class="mb-3 flex items-center gap-2 font-medium text-contrast-content"
      >
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

      <div class="rounded-lg border border-base-300 bg-base-200/30 p-4">
        <div class="flex items-center justify-between">
          <div>
            <h4 class="text-lg font-semibold text-contrast-content">
              {formattedPlanName}
            </h4>
            {#if isPaidPlan}
              <p class="text-sm text-contrast-content/60">
                Next billing: February 25, 2025
              </p>
            {:else}
              <p class="text-sm text-contrast-content/60">
                No billing - Free forever
              </p>
            {/if}
          </div>
          <div class="badge badge-outline badge-lg">
            {currentPlan}
          </div>
        </div>
      </div>
    </div>

    <!-- Plan Details -->
    <div>
      <h3
        class="mb-3 flex items-center gap-2 font-medium text-contrast-content"
      >
        <div class="rounded-lg bg-base-content/10 p-1.5">
          <Icon
            icon="solar:users-group-two-rounded-bold-duotone"
            width="16"
            height="16"
            class="text-base-content"
          />
        </div>
        Plan Details
      </h3>

      <div class="grid gap-4 md:grid-cols-2">
        <div class="rounded-lg border border-base-300 bg-base-200/30 p-4">
          <label class="mb-1 block text-sm text-contrast-content/60">
            Team Members
          </label>
          <p class="font-medium text-contrast-content">
            {planQuantity}
            {planQuantity === "1" ? "seat" : "seats"} available
          </p>
        </div>

        <div class="rounded-lg border border-base-300 bg-base-200/30 p-4">
          <label class="mb-1 block text-sm text-contrast-content/60">
            Features
          </label>
          <p class="font-medium text-contrast-content">
            {currentPlan === "FREE" ? "Basic tracking" : "Advanced features"}
          </p>
        </div>
      </div>
    </div>

    {#if currentPlan === "FREE"}
      <!-- Upgrade Sales Pitch -->
      <div>
        <h3
          class="mb-3 flex items-center gap-2 font-medium text-contrast-content"
        >
          <div class="rounded-lg bg-base-content/10 p-1.5">
            <Icon
              icon="solar:star-bold-duotone"
              width="16"
              height="16"
              class="text-base-content"
            />
          </div>
          Upgrade to Premium
        </h3>

        <div
          class="rounded-lg border border-base-content/20 bg-base-content/5 p-6"
        >
          <div class="mb-4 flex items-start gap-3">
            <div class="rounded-full bg-base-content p-2">
              <Icon
                icon="solar:users-group-two-rounded-bold"
                width="20"
                height="20"
                class="text-base-100"
              />
            </div>
            <div>
              <h4 class="text-lg font-semibold text-contrast-content">
                Collaborate with Your Team
              </h4>
              <p class="mt-1 text-sm text-contrast-content/80">
                Upgrade to Premium and invite team members to share your farm
                tracking map. Perfect for coordinating field operations across
                multiple operators.
              </p>
            </div>
          </div>

          <div class="mb-6 space-y-3">
            <div class="flex items-center gap-3">
              <Icon
                icon="solar:check-circle-bold-duotone"
                width="20"
                height="20"
                class="text-base-content"
              />
              <span class="text-sm text-contrast-content">
                Invite unlimited team members to your map
              </span>
            </div>
            <div class="flex items-center gap-3">
              <Icon
                icon="solar:check-circle-bold-duotone"
                width="20"
                height="20"
                class="text-base-content"
              />
              <span class="text-sm text-contrast-content">
                Real-time collaboration and tracking
              </span>
            </div>
            <div class="flex items-center gap-3">
              <Icon
                icon="solar:check-circle-bold-duotone"
                width="20"
                height="20"
                class="text-base-content"
              />
              <span class="text-sm text-contrast-content">
                Advanced reporting and analytics
              </span>
            </div>
            <div class="flex items-center gap-3">
              <Icon
                icon="solar:check-circle-bold-duotone"
                width="20"
                height="20"
                class="text-base-content"
              />
              <span class="text-sm text-contrast-content">
                Priority support and updates
              </span>
            </div>
          </div>

          <button
            class="btn btn-outline w-full gap-2 border-base-content text-base-content hover:bg-base-content hover:text-base-100"
            class:btn-disabled={isNativePlatform}
            disabled={isNativePlatform}
            on:click={handleUpgrade}
          >
            <Icon icon="solar:crown-bold-duotone" width="16" height="16" />
            {isNativePlatform ? "Upgrade via Web App" : "Upgrade to Premium"}
          </button>

          {#if isNativePlatform}
            <p class="mt-2 text-center text-xs text-contrast-content/60">
              Billing management is only available in the web version
            </p>
          {/if}
        </div>
      </div>
    {:else}
      <!-- Billing Management for paid plans -->
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
          Billing Management
        </h3>

        <div class="space-y-3">
          <button
            class="btn btn-outline w-full justify-start gap-3"
            class:btn-disabled={isNativePlatform}
            disabled={isNativePlatform}
            on:click={handleManageBilling}
          >
            <Icon icon="solar:settings-bold-duotone" width="18" height="18" />
            {isNativePlatform
              ? "Manage Billing (Web Only)"
              : "Manage Billing & Payment"}
          </button>

          <div class="rounded-lg border border-info/20 bg-info/5 p-4">
            <div class="flex items-start gap-3">
              <Icon
                icon="solar:info-circle-bold-duotone"
                width="20"
                height="20"
                class="mt-0.5 text-info"
              />
              <div>
                <p class="text-sm font-medium text-contrast-content">
                  Billing Information
                </p>
                <p class="mt-1 text-xs text-contrast-content/60">
                  {isNativePlatform
                    ? "Billing management is only available in the web version of the app. Please visit the web app to manage your payment methods and subscription settings."
                    : "Manage your payment methods, view billing history, and update subscription settings in the billing portal."}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    {/if}
  {/if}
</div>
