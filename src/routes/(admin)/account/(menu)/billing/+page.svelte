<script lang="ts">
  import { getContext, onMount } from "svelte"
  import type { Writable } from "svelte/store"
  import {
    ArrowRight,
    Check,
    Minus,
    Plus,
    Users,
    Zap,
    CreditCard,
    CalendarDays,
    Shield,
  } from "lucide-svelte"
  import { session } from "$lib/stores/sessionStore"
  import { toast } from "svelte-sonner"
  import { subscriptionApi } from "$lib/api/subscriptionApi"
  import { goto } from "$app/navigation"
  import { page } from "$app/stores"

  let adminSection: Writable<string> = getContext("adminSection")
  adminSection.set("billing")

  export let data

  let loading = data.loading
  let error = data.error
  let portalLoading = false

  // Set defaults
  let currentPlanId = data.currentPlanId || "free"
  let isActiveCustomer = data.isActiveCustomer || false
  let hasEverHadSubscription = data.hasEverHadSubscription || false
  let subscriptionData = data.subscriptionData

  $: currentPlanName =
    subscriptionData?.stripeSubscription?.items?.data?.[0]?.price?.nickname ||
    (currentPlanId === "pro" ? "AgSKAN Pro" : "Free Plan")
  $: isFreePlan =
    currentPlanId === "free" || !currentPlanId || currentPlanId === "none"

  // Pricing logic
  const BASE_PRICE = 100
  const CURRENCY_SYMBOL = "A$"

  let mounted = false
  let machineCount = 2 // Default to 2 for team size
  let isTestDiscount = false

  onMount(() => {
    mounted = true
  })

  // Check for discount code in URL params
  $: {
    const discountCode = $page.url.searchParams.get("discountcode")
    isTestDiscount = discountCode === "test"
  }

  // Pricing calculations (annual only)
  $: pricePerSeat = isTestDiscount ? BASE_PRICE * 0.25 : BASE_PRICE

  $: totalMonthly = Math.round(machineCount * pricePerSeat)
  $: totalAnnual = Math.round(machineCount * pricePerSeat * 12)
  $: pricePerOperator = Math.round(pricePerSeat)

  // Stripe price IDs (AgSKAN Pro — annual only)
  const OLD_PRICE_ID = "price_1TBWyrK3At0l0k1HoyC9bStL" // $365/yr legacy
  const NEW_PRICE_ID = "price_1TH522K3At0l0k1HVQWZXNFa" // $1200/yr ($100/mo)
  const stripePriceIds = {
    yearly: {
      standard: NEW_PRICE_ID,
      test: "price_1TBWz2K3At0l0k1H7fXrH3nf",
    },
  }

  // Detect which plan an active subscriber is on
  $: activePriceId =
    subscriptionData?.stripeSubscription?.items?.data?.[0]?.price?.id
  $: isOnOldPlan = activePriceId === OLD_PRICE_ID
  $: isOnNewPlan = activePriceId === NEW_PRICE_ID
  $: activeUnitAmount =
    subscriptionData?.stripeSubscription?.items?.data?.[0]?.price?.unit_amount // cents per year
  $: activeMonthlyPerSeat = activeUnitAmount
    ? Math.round(activeUnitAmount / 100 / 12)
    : null
  $: activeSeats = subscriptionData?.stripeSubscription?.quantity ?? 1
  $: activeTotalMonthly = activeMonthlyPerSeat
    ? activeMonthlyPerSeat * activeSeats
    : null
  $: activeTotalYearly = activeUnitAmount
    ? Math.round((activeUnitAmount / 100) * activeSeats)
    : null

  $: stripePriceId = isTestDiscount
    ? stripePriceIds.yearly.test
    : stripePriceIds.yearly.standard

  $: proUpgradeUrl = `/account/subscribe/${stripePriceId}?seats=${machineCount}${
    isTestDiscount ? "&discountcode=test" : ""
  }`

  $: proFeatures = [
    `Track ${machineCount} machine${machineCount > 1 ? "s" : ""} live`,
    "Records coverage in the background",
    "Rock picking path tool",
    "Unlimited paddocks & pins",
    "Offline Ready",
    "Shareable map reports",
    "Priority phone support",
    "All future features",
  ]

  function incrementMachines() {
    if (machineCount < 20) machineCount++
  }

  function decrementMachines() {
    if (machineCount > 1) machineCount--
  }

  async function openStripePortal() {
    try {
      portalLoading = true
      const result = await subscriptionApi.createPortalSession()

      if (result.success && result.url) {
        window.location.href = result.url
      } else {
        toast.error(result.message || "Failed to open billing portal")
      }
    } catch (err: any) {
      toast.error("Error: " + (err.message || "Failed to open billing portal"))
    } finally {
      portalLoading = false
    }
  }

  // Animation delay
  function animationDelay(node: HTMLElement, delay: number) {
    return {
      delay,
      duration: 600,
      css: (t: number) => `
        opacity: ${t};
        transform: translateY(${(1 - t) * 20}px);
      `,
    }
  }
</script>

<svelte:head>
  <title>Billing</title>
</svelte:head>

{#if loading}
  <div class="flex h-48 items-center justify-center">
    <div class="loading loading-spinner loading-lg"></div>
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
  <section class="bg-base-100" id="pricing">
    <div class="container mx-auto px-4 py-12">
      {#if mounted}
        <div class="mx-auto max-w-sm text-center" in:animationDelay={0}>
          <div class="mb-6">
            <span
              class="inline-flex items-center gap-1.5 rounded-full bg-secondary/10 px-4 py-1.5 text-sm font-semibold text-secondary"
              ><Zap size={14} />30 days free</span
            >
          </div>
          <h1 class="mb-2 text-2xl font-bold text-contrast-content">
            Your free trial is ready
          </h1>
          <p class="mb-8 text-contrast-content/60">
            Full access to AgSKAN Pro. No obligations.
          </p>

          <p
            class="mb-3 inline-flex items-center gap-1.5 text-sm text-contrast-content/50"
          >
            <Users size={14} />How many operators?
          </p>
          <div class="mb-10 flex items-center justify-center gap-6">
            <button
              class="flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-base-300 bg-base-200 text-base-content/60 transition-all hover:border-base-content hover:bg-base-content hover:text-base-100"
              on:click={decrementMachines}><Minus size={20} /></button
            >
            <div class="w-20 text-center">
              <span
                class="text-6xl font-bold tabular-nums text-contrast-content"
                >{machineCount}</span
              >
              <span class="block text-xs text-contrast-content/50"
                >operator{machineCount > 1 ? "s" : ""}</span
              >
            </div>
            <button
              class="flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-base-300 bg-base-200 text-base-content/60 transition-all hover:border-base-content hover:bg-base-content hover:text-base-100"
              on:click={incrementMachines}><Plus size={20} /></button
            >
          </div>

          <!-- Minimal features -->
          <div
            class="mb-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-contrast-content/50"
          >
            <span class="flex items-center gap-1"
              ><Check size={12} style="color: #22c55e;" />Live tracking</span
            >
            <span class="flex items-center gap-1"
              ><Check size={12} style="color: #22c55e;" />Coverage recording</span
            >
            <span class="flex items-center gap-1"
              ><Check size={12} style="color: #22c55e;" />Offline ready</span
            >
          </div>

          <div class="mb-4">
            <a href={proUpgradeUrl}>
              <button
                class="group w-full rounded-xl bg-secondary px-6 py-4 text-lg font-semibold text-secondary-content shadow-lg shadow-secondary/25 transition-all hover:shadow-xl hover:shadow-secondary/40"
              >
                Start 30-Day Free Trial
                <ArrowRight
                  size={18}
                  class="ml-2 inline transition-transform group-hover:translate-x-1"
                />
              </button>
            </a>
          </div>
          <p class="text-xs text-contrast-content/40">
            Then {CURRENCY_SYMBOL}{totalMonthly}/mo · Cancel anytime
          </p>
        </div>

        {#if hasEverHadSubscription}
          <div class="mt-10 text-center">
            <button
              on:click={openStripePortal}
              class="btn btn-outline btn-sm"
              disabled={portalLoading}
            >
              {#if portalLoading}<span
                  class="loading loading-spinner loading-xs mr-2"
                ></span>{/if}
              View Past Invoices
            </button>
          </div>
        {/if}
      {/if}
    </div>
  </section>
{:else}
  <!-- Active Customer - Show Current Subscription -->
  <div>
    <!-- Header -->
    <div
      class="flex items-center justify-between border-b border-base-300 bg-base-100 p-5"
    >
      <h2
        class="flex items-center gap-2 text-xl font-semibold text-contrast-content"
      >
        <div class="rounded-lg bg-base-content/10 p-1.5">
          <CreditCard size={18} class="text-base-content" />
        </div>
        Billing
      </h2>
    </div>

    <!-- Content -->
    <div class="mx-auto max-w-lg space-y-6 p-6">
      <!-- Subscription Overview -->
      <div>
        <h3
          class="mb-3 flex items-center gap-2 font-medium text-contrast-content"
        >
          <div class="rounded-lg bg-base-content/10 p-1.5">
            <Zap size={16} class="text-base-content" />
          </div>
          Subscription
        </h3>

        <div class="grid gap-4">
          <!-- Plan Card -->
          <div class="rounded-lg border border-base-300 bg-base-200/30 p-4">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm text-contrast-content/60">Current Plan</p>
                <p class="font-medium text-contrast-content">
                  {currentPlanName}
                </p>
                {#if isOnOldPlan}
                  <p class="mt-0.5 text-xs text-contrast-content/40">
                    Legacy plan
                  </p>
                {/if}
              </div>
              <div
                class="badge badge-lg"
                class:badge-success={subscriptionData?.stripeSubscription
                  ?.status === "active"}
                class:badge-warning={subscriptionData?.stripeSubscription
                  ?.status === "trialing"}
                class:badge-error={subscriptionData?.stripeSubscription
                  ?.status === "past_due"}
              >
                {subscriptionData?.stripeSubscription?.status === "trialing"
                  ? "Trial"
                  : subscriptionData?.stripeSubscription?.status === "active"
                    ? "Active"
                    : (subscriptionData?.stripeSubscription?.status ?? "N/A")}
              </div>
            </div>
          </div>

          <!-- Seats Card -->
          <div class="rounded-lg border border-base-300 bg-base-200/30 p-4">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm text-contrast-content/60">Operator Seats</p>
                <p class="font-medium text-contrast-content">
                  {activeSeats}
                  {activeSeats === 1 ? "seat" : "seats"}
                </p>
              </div>
              <div class="rounded-lg bg-base-content/10 p-2">
                <Users size={18} class="text-base-content" />
              </div>
            </div>
          </div>

          <!-- Pricing Card -->
          {#if activeMonthlyPerSeat}
            <div class="rounded-lg border border-base-300 bg-base-200/30 p-4">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm text-contrast-content/60">Cost</p>
                  <p class="font-medium text-contrast-content">
                    {CURRENCY_SYMBOL}{activeTotalMonthly}/mo
                    <span class="text-sm font-normal text-contrast-content/50"
                      >({CURRENCY_SYMBOL}{activeMonthlyPerSeat} × {activeSeats} seat{activeSeats ===
                      1
                        ? ""
                        : "s"})</span
                    >
                  </p>
                  <p class="mt-0.5 text-xs text-contrast-content/40">
                    {CURRENCY_SYMBOL}{activeTotalYearly}/yr billed annually
                  </p>
                </div>
                <div class="rounded-lg bg-base-content/10 p-2">
                  <CreditCard size={18} class="text-base-content" />
                </div>
              </div>
            </div>
          {/if}

          <!-- Next Billing Card -->
          <div class="rounded-lg border border-base-300 bg-base-200/30 p-4">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm text-contrast-content/60">
                  Next Billing Date
                </p>
                <p class="font-medium text-contrast-content">
                  {subscriptionData?.stripeSubscription?.current_period_end
                    ? new Date(
                        subscriptionData.stripeSubscription.current_period_end *
                          1000,
                      ).toLocaleDateString("en-AU", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })
                    : "N/A"}
                </p>
              </div>
              <div class="rounded-lg bg-base-content/10 p-2">
                <CalendarDays size={18} class="text-base-content" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Manage Subscription -->
      <div class="border-t border-base-300 pt-6">
        <button
          class="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-content shadow-sm hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/20"
          on:click={openStripePortal}
          disabled={portalLoading}
        >
          {#if portalLoading}
            <span class="loading loading-spinner loading-xs"></span>
          {/if}
          <Shield size={16} />
          Manage Subscription & Billing
        </button>
        <p class="mt-2 text-center text-xs text-contrast-content/50">
          Update payment method, change seats, view invoices, or cancel
        </p>
      </div>
    </div>
  </div>
{/if}
