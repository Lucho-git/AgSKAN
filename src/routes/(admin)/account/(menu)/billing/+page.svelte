<script lang="ts">
  import { getContext, onMount } from "svelte"
  import type { Writable } from "svelte/store"
  import SettingsModule from "../settings/settings_module.svelte"
  import PricingSection from "$lib/components/PricingSection.svelte"
  import { session } from "$lib/stores/sessionStore"
  import { toast } from "svelte-sonner"

  let adminSection: Writable<string> = getContext("adminSection")
  adminSection.set("billing")

  export let data

  let loading = data.loading
  let error = data.error

  // Set defaults
  let currentPlanId = data.currentPlanId || "free"
  let isActiveCustomer = data.isActiveCustomer || false
  let hasEverHadSubscription = data.hasEverHadSubscription || false
  let subscriptionData = data.subscriptionData

  $: currentPlanName = subscriptionData?.appSubscription?.name || "Free Plan"
  $: isFreePlan =
    currentPlanId === "free" || !currentPlanId || currentPlanId === "none"
</script>

<svelte:head>
  <title>Billing</title>
</svelte:head>

{#if loading}
  <div class="flex h-48 items-center justify-center">
    <div class="skeleton h-12 w-12 rounded-full"></div>
  </div>
{:else if error}
  <div class="mx-auto my-8 max-w-xl rounded-lg bg-red-50 p-6 text-center">
    <h2 class="mb-4 text-xl font-bold text-red-700">
      Error Loading Billing Information
    </h2>
    <p class="text-red-600">{error}</p>
    <div class="mt-4">
      <a
        href="/account/billing"
        class="rounded bg-primary px-4 py-2 text-white"
      >
        Try Again
      </a>
    </div>
  </div>
{:else if !isActiveCustomer}
  <div class="container mx-auto px-4">
    <div class="py-2">
      <h1 class="mb-4 text-center text-4xl font-bold">Upgrade Your Account</h1>
      <p class="mb-8 text-center text-lg text-base-content/80">
        Choose a paid plan to unlock additional features and capabilities
      </p>
      <!-- Only show the pro plan by setting currentPlanId to "free" -->
      <PricingSection currentPlanId="free" useFullPrice={true} />
    </div>

    {#if hasEverHadSubscription}
      <div class="mt-10 text-center">
        <a href="/account/billing/manage" class="link">View past invoices</a>
      </div>
    {/if}
  </div>
{:else}
  <div class="container mx-auto px-4">
    <h1 class="mb-6 text-center text-2xl font-bold">Billing</h1>

    <SettingsModule
      title="Subscription"
      editable={false}
      fields={[
        {
          id: "planName",
          label: "Current Plan",
          initialValue: currentPlanName,
        },
        {
          id: "planStatus",
          label: "Status",
          initialValue: subscriptionData?.stripeSubscription?.status ?? "N/A",
        },
        {
          id: "quantity",
          label: "Quantity",
          initialValue:
            subscriptionData?.stripeSubscription?.quantity?.toString() ?? "1",
        },
        ...(subscriptionData?.stripeSubscription?.plan?.interval
          ? [
              {
                id: "interval",
                label: "Billing Interval",
                initialValue:
                  subscriptionData.stripeSubscription.plan.interval === "year"
                    ? "Annually"
                    : "Monthly",
              },
            ]
          : []),
        {
          id: "nextBilling",
          label: "Next Billing Date",
          initialValue: subscriptionData?.stripeSubscription?.current_period_end
            ? new Date(
                subscriptionData.stripeSubscription.current_period_end * 1000,
              ).toLocaleDateString()
            : "N/A",
        },
      ]}
      editButtonTitle="Manage Subscription"
      editLink="/account/billing/manage"
    />

    {#if isFreePlan}
      <div class="mt-12">
        <h2 class="mb-6 text-center text-xl font-bold">Upgrade Options</h2>
        <!-- Only show the pro plan by setting currentPlanId to "free" -->
        <PricingSection currentPlanId="free" useFullPrice={true} />
      </div>
    {/if}
  </div>
{/if}
