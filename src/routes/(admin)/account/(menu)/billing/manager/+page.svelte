<script lang="ts">
  import { enhance } from "$app/forms"
  import { onMount } from "svelte"
  import SettingsModule from "../../settings/settings_module.svelte"
  import ManageSeats from "./ManageSeats.svelte"
  import ChangeBillingInterval from "./ChangeBillingInterval.svelte"
  import CancelSubscription from "./CancelSubscription.svelte"
  import { goto } from "$app/navigation"
  import { toast } from "svelte-sonner"

  export let data
  let loading = data.loading
  let error = data.error
  let subscriptionData = null

  // Handle data loading and errors in onMount instead of top-level returns
  onMount(() => {
    if (error) {
      toast.error(error)
      goto("/account/billing")
      return
    }

    if (!loading && data.subscriptionData) {
      subscriptionData = data.subscriptionData
    }
  })

  $: interval = subscriptionData?.stripeSubscription?.plan?.interval || "month"
  $: isYearly = interval === "year"
</script>

<svelte:head>
  <title>Manage Billing</title>
</svelte:head>

{#if loading}
  <div class="flex h-48 items-center justify-center">
    <div
      class="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent"
    ></div>
  </div>
{:else if error}
  <div class="mx-auto my-8 max-w-xl rounded-lg bg-red-50 p-6 text-center">
    <h2 class="mb-4 text-xl font-bold text-red-700">
      Error Loading Billing Information
    </h2>
    <p class="text-red-600">{error}</p>
    <div class="mt-4 flex justify-center gap-4">
      <button
        class="rounded bg-primary px-4 py-2 text-white"
        on:click={() => window.location.reload()}
      >
        Try Again
      </button>
      <button
        class="rounded bg-secondary px-4 py-2 text-white"
        on:click={() => goto("/account/billing")}
      >
        Return to Billing
      </button>
    </div>
  </div>
{:else if subscriptionData}
  <h1 class="mb-6 text-2xl font-bold">Manage Billing</h1>
  <div class="alert alert-info mb-4 mt-2 w-4/5">
    <div>
      <h3 class="font-bold">
        Pricing Section is new, Contact us to handle it directly
      </h3>
      <div class="text-sm">
        If their are any issues or the pricing details seems wrong, please
        contact us at 0439405248, or send a message in the chat. We'll be happy
        to assist you.
      </div>
    </div>
  </div>
  <SettingsModule
    title="Current Subscription"
    editable={false}
    fields={[
      {
        id: "planName",
        label: "Current Plan",
        initialValue: subscriptionData.appSubscription.name,
      },
      {
        id: "planStatus",
        label: "Status",
        initialValue: subscriptionData.stripeSubscription.status,
      },
      {
        id: "quantity",
        label: "Quantity",
        initialValue:
          subscriptionData?.stripeSubscription?.quantity?.toString() ?? "1",
      },
      {
        id: "interval",
        label: "Billing Interval",
        initialValue: isYearly ? "Yearly" : "Monthly",
      },
      {
        id: "nextBilling",
        label: "Next Billing Date",
        initialValue: new Date(
          subscriptionData.stripeSubscription.current_period_end * 1000,
        ).toLocaleDateString(),
      },
    ]}
    editButtonTitle="Home"
    editLink="/account"
  />

  <ManageSeats {data} />
  <!-- <ChangeBillingInterval {subscriptionData} /> -->
  <CancelSubscription {subscriptionData} />
{:else}
  <div class="flex h-48 items-center justify-center">
    <div class="text-center">
      <p class="mb-4 text-lg">No subscription data available</p>
      <button
        class="rounded bg-primary px-4 py-2 text-white"
        on:click={() => goto("/account/billing")}
      >
        Return to Billing
      </button>
    </div>
  </div>
{/if}
