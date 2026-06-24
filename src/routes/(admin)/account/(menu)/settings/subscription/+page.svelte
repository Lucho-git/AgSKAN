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

  onMount(async () => {
    if (!$session) {
      goto("/login")
      return
    }

    await loadUserSubscription()
    loading = false
  })

  // Reactive values based on loaded data
  $: formattedPlanName = currentPlan === "FREE" ? "Free Plan" : currentPlan

  $: nextBillingFormatted = subscriptionData?.next_billing_date
    ? new Date(subscriptionData.next_billing_date).toLocaleDateString("en-AU", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null
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
<div class="space-y-4 p-6">
  {#if loading}
    <div class="flex h-32 items-center justify-center">
      <div class="loading loading-spinner loading-md"></div>
    </div>
  {:else}
    <!-- Current Plan (clickable) -->
    <button
      class="flex w-full items-center gap-3 text-left rounded-lg border border-base-300 bg-base-200/30 p-4 transition-colors hover:border-base-content/20"
      on:click={() => !isNativePlatform && goto("/account/billing")}
      disabled={isNativePlatform}
    >
      <div class="rounded-lg bg-base-content/10 p-2 flex-shrink-0">
        <Icon icon="solar:crown-bold-duotone" width="18" height="18" class="text-base-content" />
      </div>
      <div class="flex-1 min-w-0">
        <label class="block text-sm text-contrast-content/60">Current Plan</label>
        <p class="font-medium text-contrast-content">{formattedPlanName}</p>
        {#if isPaidPlan && nextBillingFormatted}
          <p class="text-xs text-contrast-content/60">Next billing: {nextBillingFormatted}</p>
        {:else if !isPaidPlan}
          <p class="text-xs text-contrast-content/60">No billing - Free forever</p>
        {/if}
      </div>
      <div class="flex-shrink-0 flex h-7 items-center justify-center rounded-lg bg-base-content px-2.5 text-xs font-medium text-base-100 shadow-sm transition-all duration-300 md:h-8">
        <span class="font-semibold">Manage</span>
      </div>
    </button>

    <!-- Plan Details -->
    <div class="rounded-lg border border-base-300 bg-base-200/30 p-4">
      <div class="flex items-center gap-3">
        <div class="rounded-lg bg-base-content/10 p-2 flex-shrink-0">
          <Icon icon="solar:users-group-two-rounded-bold-duotone" width="18" height="18" class="text-base-content" />
        </div>
        <div class="flex-1 min-w-0">
          <label class="block text-sm text-contrast-content/60">Team Members</label>
          <p class="font-medium text-contrast-content">{planQuantity} {planQuantity === "1" ? "seat" : "seats"} available</p>
        </div>
      </div>
    </div>


  {/if}
</div>
