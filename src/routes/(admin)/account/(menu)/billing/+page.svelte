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
  let seatUpdateLoading = false

  // Set defaults
  let currentPlanId = data.currentPlanId || "free"
  let isActiveCustomer = data.isActiveCustomer || false
  let hasEverHadSubscription = data.hasEverHadSubscription || false
  let subscriptionData = data.subscriptionData
  let desiredSeats = Number(subscriptionData?.stripeSubscription?.quantity ?? 1)

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
  $: activeSubscriptionItem =
    subscriptionData?.stripeSubscription?.items?.data?.[0]
  $: activePrice = activeSubscriptionItem?.price
  $: activePlan = subscriptionData?.stripeSubscription?.plan
  $: activePriceId = getStripeId(activePrice) || getStripeId(activePlan)
  $: isOnOldPlan = activePriceId === OLD_PRICE_ID
  $: isOnNewPlan = activePriceId === NEW_PRICE_ID
  $: billingPricing = subscriptionData?.billingPricing
  $: activeBillingInterval =
    billingPricing?.recurringInterval ??
    activePrice?.recurring?.interval ??
    activePlan?.interval ??
    "year"
  $: activeUnitAmount =
    billingPricing?.netUnitAmountCents ??
    billingPricing?.grossUnitAmountCents ??
    getStripeAmountCents(activePrice) ??
    getStripeAmountCents(activePlan)
  $: hasUsableSeatPrice = activeUnitAmount != null && activeUnitAmount > 0
  $: activeMonthlyPerSeat = hasUsableSeatPrice
    ? getMonthlyAmountFromIntervalCents(activeUnitAmount, activeBillingInterval)
    : null
  $: activeYearlyPerSeat = hasUsableSeatPrice
    ? getYearlyAmountFromIntervalCents(activeUnitAmount, activeBillingInterval)
    : null
  $: activeSeats =
    activeSubscriptionItem?.quantity ??
    subscriptionData?.stripeSubscription?.quantity ??
    1
  $: activeTotalMonthly =
    activeMonthlyPerSeat != null ? activeMonthlyPerSeat * activeSeats : null
  $: activeTotalYearly =
    activeYearlyPerSeat != null ? activeYearlyPerSeat * activeSeats : null
  $: seatDelta = desiredSeats - activeSeats
  $: seatsChanged = seatDelta !== 0
  $: projectedSeatMonthly =
    activeMonthlyPerSeat != null ? activeMonthlyPerSeat * desiredSeats : null
  $: projectedSeatYearly =
    activeYearlyPerSeat != null ? activeYearlyPerSeat * desiredSeats : null
  $: seatChangeMonthlyDelta =
    activeMonthlyPerSeat != null
      ? Math.abs(seatDelta) * activeMonthlyPerSeat
      : null
  $: seatChangeYearlyDelta =
    activeYearlyPerSeat != null
      ? Math.abs(seatDelta) * activeYearlyPerSeat
      : null
  $: nextBillingDateLabel = subscriptionData?.stripeSubscription
    ?.current_period_end
    ? formatDateFromSeconds(
        subscriptionData.stripeSubscription.current_period_end,
      )
    : "your next billing date"
  $: todayLabel = new Date().toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
  $: pricingDebug = {
    currentPlanName,
    activePriceId,
    activeUnitAmount,
    activeBillingInterval,
    hasUsableSeatPrice,
    billingPricing,
    activePrice,
    activePlan,
    subscriptionItem: activeSubscriptionItem,
    subscriptionDiscount: subscriptionData?.stripeSubscription?.discount,
    subscriptionDiscounts: subscriptionData?.stripeSubscription?.discounts,
  }
  $: if (seatsChanged && !hasUsableSeatPrice) {
    console.warn(
      "[Billing] Seat estimate unavailable from Stripe payload",
      pricingDebug,
    )
  }

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

  function incrementDesiredSeats() {
    if (desiredSeats < 50) desiredSeats++
  }

  function decrementDesiredSeats() {
    if (desiredSeats > 1) desiredSeats--
  }

  function getStripeAmountCents(stripePrice: any) {
    if (!stripePrice || typeof stripePrice === "string") return null

    const amount = stripePrice?.unit_amount ?? stripePrice?.amount

    if (typeof amount === "number" && amount > 0) return amount

    const tierAmount =
      stripePrice?.tiers?.[0]?.unit_amount ??
      stripePrice?.tiers?.[0]?.flat_amount

    if (typeof tierAmount === "number" && tierAmount > 0) return tierAmount

    const decimalAmount =
      stripePrice?.unit_amount_decimal ?? stripePrice?.amount_decimal

    if (decimalAmount == null || decimalAmount === "") return null

    const parsedAmount = Number(decimalAmount)

    return Number.isFinite(parsedAmount) && parsedAmount > 0
      ? parsedAmount
      : null
  }

  function getMonthlyAmountFromIntervalCents(
    amountCents: number,
    interval: string | null | undefined,
  ) {
    const amount = amountCents / 100

    switch (interval) {
      case "month":
        return amount
      case "year":
        return amount / 12
      case "week":
        return (amount * 52) / 12
      case "day":
        return (amount * 365) / 12
      default:
        return null
    }
  }

  function getYearlyAmountFromIntervalCents(
    amountCents: number,
    interval: string | null | undefined,
  ) {
    const amount = amountCents / 100

    switch (interval) {
      case "month":
        return amount * 12
      case "year":
        return amount
      case "week":
        return amount * 52
      case "day":
        return amount * 365
      default:
        return null
    }
  }

  function formatCurrency(
    amount: number | null | undefined,
    options: { tinyStyle?: "compact" | "prose" } = {},
  ) {
    if (amount == null || !Number.isFinite(amount)) return null

    const tinyStyle = options.tinyStyle ?? "compact"

    if (amount > 0 && amount < 0.01) {
      return tinyStyle === "prose"
        ? `less than ${CURRENCY_SYMBOL}0.01`
        : `${CURRENCY_SYMBOL}0.00`
    }

    return `${CURRENCY_SYMBOL}${amount.toLocaleString("en-AU", {
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      maximumFractionDigits: 2,
    })}`
  }

  function getStripeId(stripeObject: any) {
    if (typeof stripeObject === "string") return stripeObject
    return stripeObject?.id ?? null
  }

  function formatDateFromSeconds(timestamp: number) {
    return new Date(timestamp * 1000).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    })
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

  async function openSeatUpdatePortal() {
    if (!seatsChanged) return

    try {
      seatUpdateLoading = true
      const result = await subscriptionApi.createPortalSession(
        "/account/billing?seat_update_returned=true",
        {
          flow: "seat_update_confirm",
          seatQuantity: desiredSeats,
        },
      )

      if (result.success && result.url) {
        window.location.href = result.url
      } else {
        toast.error(result.message || "Failed to open seat change review")
      }
    } catch (err: any) {
      toast.error(
        "Error: " + (err.message || "Failed to open seat change review"),
      )
    } finally {
      seatUpdateLoading = false
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
            <div class="flex items-center justify-between gap-4">
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

            <div class="mt-4 rounded-lg bg-base-100 p-3">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <p
                    class="text-xs font-medium uppercase text-contrast-content/50"
                  >
                    New seat count
                  </p>
                  <p class="mt-1 text-sm text-contrast-content/70">
                    {#if seatsChanged}
                      {seatDelta > 0 ? "Add" : "Remove"}
                      {Math.abs(seatDelta)} seat{Math.abs(seatDelta) === 1
                        ? ""
                        : "s"}
                    {:else}
                      No change selected
                    {/if}
                  </p>
                </div>
                <div
                  class="flex items-center rounded-lg border border-base-300 bg-base-200"
                >
                  <button
                    type="button"
                    class="flex h-10 w-10 items-center justify-center text-contrast-content/70 transition hover:bg-base-300 disabled:opacity-40"
                    aria-label="Decrease operator seats"
                    on:click={decrementDesiredSeats}
                    disabled={desiredSeats <= 1 || seatUpdateLoading}
                  >
                    <Minus size={16} />
                  </button>
                  <div
                    class="w-12 text-center text-lg font-semibold tabular-nums text-contrast-content"
                  >
                    {desiredSeats}
                  </div>
                  <button
                    type="button"
                    class="flex h-10 w-10 items-center justify-center text-contrast-content/70 transition hover:bg-base-300 disabled:opacity-40"
                    aria-label="Increase operator seats"
                    on:click={incrementDesiredSeats}
                    disabled={desiredSeats >= 50 || seatUpdateLoading}
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>

              {#if projectedSeatMonthly != null && projectedSeatYearly != null}
                <div
                  class="mt-3 flex items-center justify-between border-t border-base-300 pt-3 text-sm"
                >
                  <span class="text-contrast-content/60">
                    {seatsChanged ? "New cost" : "Current cost"}
                  </span>
                  <span class="font-medium text-contrast-content">
                    {formatCurrency(projectedSeatMonthly)}/mo
                    <span class="text-contrast-content/40">
                      · {formatCurrency(projectedSeatYearly)}/yr
                    </span>
                  </span>
                </div>
              {/if}

              {#if seatsChanged}
                <div
                  class="mt-3 rounded-lg border border-base-300 bg-base-200/60 p-3 text-sm"
                >
                  {#if seatDelta > 0 && seatChangeMonthlyDelta != null && seatChangeYearlyDelta != null}
                    <p class="font-medium text-contrast-content">
                      Additional {formatCurrency(seatChangeMonthlyDelta, {
                        tinyStyle: "prose",
                      })}/mo from {todayLabel}
                    </p>
                    <p class="mt-1 text-xs text-contrast-content/60">
                      That is {formatCurrency(seatChangeYearlyDelta)}/yr for
                      {Math.abs(seatDelta)} extra seat{Math.abs(seatDelta) === 1
                        ? ""
                        : "s"}.
                    </p>
                  {:else if seatDelta < 0 && projectedSeatMonthly != null && projectedSeatYearly != null}
                    <p class="font-medium text-contrast-content">
                      {formatCurrency(projectedSeatMonthly)}/mo from {nextBillingDateLabel}
                    </p>
                    <p class="mt-1 text-xs text-contrast-content/60">
                      Your projected subscription becomes {formatCurrency(
                        projectedSeatYearly,
                      )}/yr for {desiredSeats} seat{desiredSeats === 1
                        ? ""
                        : "s"}
                      at the next billing period.
                    </p>
                  {:else if seatDelta > 0}
                    <p class="font-medium text-contrast-content">
                      Changes will be applied immediately
                    </p>
                    <p class="mt-1 text-xs text-contrast-content/60">
                      Estimated for {Math.abs(seatDelta)} extra seat{Math.abs(
                        seatDelta,
                      ) === 1
                        ? ""
                        : "s"}.
                    </p>
                    <p class="mt-2 break-all text-[11px] text-warning">
                      Billing debug: price={activePriceId ?? "missing"}, amount={activeUnitAmount ??
                        "missing"}, interval={activeBillingInterval ??
                        "missing"}, reason={billingPricing?.estimateUnavailableReason ??
                        "none"}
                    </p>
                  {:else}
                    <p class="font-medium text-contrast-content">
                      Reduced seats apply from {nextBillingDateLabel}
                    </p>
                    <p class="mt-1 text-xs text-contrast-content/60">
                      Estimated for {desiredSeats} seat{desiredSeats === 1
                        ? ""
                        : "s"}.
                    </p>
                    <p class="mt-2 break-all text-[11px] text-warning">
                      Billing debug: price={activePriceId ?? "missing"}, amount={activeUnitAmount ??
                        "missing"}, interval={activeBillingInterval ??
                        "missing"}, reason={billingPricing?.estimateUnavailableReason ??
                        "none"}
                    </p>
                  {/if}
                </div>
              {/if}

              <button
                type="button"
                class="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-4 py-2.5 text-sm font-medium text-primary transition hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-50"
                on:click={openSeatUpdatePortal}
                disabled={!seatsChanged || seatUpdateLoading}
              >
                {#if seatUpdateLoading}
                  <span class="loading loading-spinner loading-xs"></span>
                {/if}
                Review Seat Change in Stripe
              </button>
            </div>
          </div>

          <!-- Pricing Card -->
          {#if activeMonthlyPerSeat != null && activeTotalMonthly != null && activeTotalYearly != null}
            <div class="rounded-lg border border-base-300 bg-base-200/30 p-4">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm text-contrast-content/60">Cost</p>
                  <p class="font-medium text-contrast-content">
                    {formatCurrency(activeTotalMonthly)}/mo
                    <span class="text-sm font-normal text-contrast-content/50"
                      >({formatCurrency(activeMonthlyPerSeat)} × {activeSeats} seat{activeSeats ===
                      1
                        ? ""
                        : "s"})</span
                    >
                  </p>
                  <p class="mt-0.5 text-xs text-contrast-content/40">
                    {formatCurrency(activeTotalYearly)}/yr billed annually
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
