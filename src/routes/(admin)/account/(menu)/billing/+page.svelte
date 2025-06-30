<script lang="ts">
  import { getContext, onMount } from "svelte"
  import type { Writable } from "svelte/store"
  import SettingsModule from "$lib/components/SettingsModule.svelte"
  import { ArrowRight, Check, Minus, Plus, Users, X, Zap } from "lucide-svelte"
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

  $: currentPlanName = subscriptionData?.appSubscription?.name || "Free Plan"
  $: isFreePlan =
    currentPlanId === "free" || !currentPlanId || currentPlanId === "none"

  // Pricing logic
  const BASE_PRICE = 45.625
  const CURRENCY_SYMBOL = "A$"

  let mounted = false
  let interval = "monthly"
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

  // Pricing calculations
  $: pricePerSeat =
    isTestDiscount && interval === "yearly"
      ? BASE_PRICE * 0.25
      : interval === "yearly"
        ? BASE_PRICE * (2 / 3)
        : BASE_PRICE

  $: totalPrice = machineCount * pricePerSeat
  $: monthlyTotal = machineCount * BASE_PRICE
  $: annualTotal = machineCount * BASE_PRICE * 12
  $: annualDiscountedTotal = isTestDiscount
    ? machineCount * (BASE_PRICE * 0.25) * 12
    : machineCount * (BASE_PRICE * (2 / 3)) * 12
  $: annualSavings = annualTotal - annualDiscountedTotal

  // Display calculations
  $: displayPrice =
    interval === "yearly" ? Math.round(totalPrice * 12) : Math.round(totalPrice)
  $: monthlyDisplayPrice = Math.round(totalPrice)
  $: annualMonthlyPayment = Math.round(totalPrice * 12)
  $: discountPercentage = isTestDiscount ? 75 : 33

  // Stripe price IDs
  const stripePriceIds = {
    monthly: "price_1PkkO8K3At0l0k1HqvxEEBw2",
    yearly: {
      full: "price_1PdxlVK3At0l0k1HoEgkFynm",
      discount: "price_1PdxlUK3At0l0k1Hu6tlYnHe",
      test: "price_1Qrxo8K3At0l0k1Hz7ybpTts",
    },
  }

  $: stripePriceId = (() => {
    if (interval === "monthly") {
      return stripePriceIds.monthly || ""
    }

    if (isTestDiscount && stripePriceIds.yearly?.test) {
      return stripePriceIds.yearly.test
    }

    if (stripePriceIds.yearly?.full) {
      return stripePriceIds.yearly.full
    }

    return stripePriceIds.yearly?.discount || ""
  })()

  $: proUpgradeUrl = `/account/subscribe/${stripePriceId}?seats=${machineCount}${
    isTestDiscount ? "&discountcode=test" : ""
  }`

  const proFeatures = [
    {
      text: `Track ${machineCount} machine${machineCount > 1 ? "s" : ""}`,
      included: true,
    },
    { text: "Invite team members to your maps", included: true },
    { text: "Unlimited paddocks, pins & usage", included: true },
    { text: "Offline tracking & replay", included: true },
    { text: "Shareable map reports", included: true },
    { text: "Priority phone support", included: true },
    { text: "Custom onboarding assistance", included: true },
    { text: "All future features included", included: true },
  ]

  function incrementMachines() {
    if (machineCount < 20) machineCount++
  }

  function decrementMachines() {
    if (machineCount > 1) machineCount--
  }

  function activateYearlySavings() {
    if (interval === "monthly") {
      interval = "yearly"
    }
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
    } catch (err) {
      toast.error("Error: " + (err.message || "Failed to open billing portal"))
    } finally {
      portalLoading = false
    }
  }

  // Animation delay
  function animationDelay(node, delay) {
    return {
      delay,
      duration: 600,
      css: (t) => `
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
  <!-- Free Plan - Show Clean Pricing Section -->
  <section class="min-h-screen bg-base-100" id="pricing">
    <div class="container mx-auto px-4 py-8">
      {#if mounted}
        <div in:animationDelay={0}>
          <h1
            class="mb-4 text-center font-sans text-3xl font-bold text-base-content md:text-4xl"
          >
            Unlock Pro Features
          </h1>

          <p
            class="mx-auto mb-12 max-w-2xl text-center text-lg text-contrast-content/70"
          >
            Upgrade to AgSKAN Pro and transform your farming operation with team
            collaboration, advanced tracking, and powerful analytics.
          </p>

          <div
            class="mb-12 flex flex-col items-center justify-center gap-6 md:flex-row"
          >
            <div class="flex flex-col items-center gap-4 md:flex-row">
              <div
                class="relative flex items-center rounded-full bg-base-200 p-1 shadow-md"
              >
                <button
                  class={`rounded-full px-6 py-2 text-sm font-medium transition-colors ${
                    interval === "monthly"
                      ? "bg-base-content text-base-100"
                      : "text-contrast-content/70 hover:text-contrast-content"
                  }`}
                  on:click={() => (interval = "monthly")}
                >
                  Monthly
                </button>
                <button
                  class={`rounded-full px-6 py-2 text-sm font-medium transition-colors ${
                    interval === "yearly"
                      ? "bg-base-content text-base-100"
                      : "text-contrast-content/70 hover:text-contrast-content"
                  }`}
                  on:click={() => (interval = "yearly")}
                >
                  Yearly
                </button>

                {#if annualSavings > 0}
                  <div
                    class="absolute -right-8 -top-4 z-10 rounded-lg bg-gradient-to-r from-secondary to-accent px-3 py-1.5 text-xs font-bold text-black shadow-md"
                  >
                    Save {CURRENCY_SYMBOL}{Math.round(annualSavings)}
                  </div>
                {/if}
              </div>
            </div>

            <div class="flex flex-col items-center gap-4 md:flex-row">
              <div
                class="flex w-full items-center gap-3 rounded-lg bg-base-200 p-1.5 shadow-md md:w-auto md:p-2"
              >
                <Users class="ml-2 h-5 w-5 text-contrast-content/70" />
                <label
                  class="whitespace-nowrap text-sm font-medium text-contrast-content"
                >
                  Team size:
                </label>
                <div class="flex items-center gap-2">
                  <button
                    class="flex h-8 w-8 items-center justify-center rounded-lg border border-base-content/20 bg-base-100 transition-colors hover:bg-base-300"
                    on:click={decrementMachines}
                    disabled={machineCount <= 1}
                  >
                    <Minus size={16} />
                  </button>
                  <div class="w-12 text-center">
                    <span class="font-bold text-base-content"
                      >{machineCount}</span
                    >
                    <span class="-mt-1 block text-xs text-contrast-content/70"
                      >seats</span
                    >
                  </div>
                  <button
                    class="flex h-8 w-8 items-center justify-center rounded-lg border border-base-content/20 bg-base-100 transition-colors hover:bg-base-300"
                    on:click={incrementMachines}
                    disabled={machineCount >= 20}
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Warning for team size of 1 -->
          {#if machineCount === 1}
            <div
              class="mx-auto mb-6 max-w-md rounded-lg border border-warning/30 bg-warning/10 p-4 text-center"
            >
              <div class="flex items-center justify-center gap-2 text-warning">
                <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fill-rule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clip-rule="evenodd"
                  />
                </svg>
                <span class="font-medium">Not Recommended</span>
              </div>
              <p class="mt-2 text-sm text-contrast-content/70">
                With only 1 seat, you won't be able to invite team members.
                Consider starting with 2 seats to unlock full collaboration
                features.
              </p>
            </div>
          {/if}

          <!-- Only show Pro card since user is on free plan -->
          <div class="mx-auto mt-8 grid max-w-lg gap-8">
            <div
              class="relative rounded-xl border-2 border-base-content bg-base-200 p-6 shadow-xl md:p-8"
              in:animationDelay={200}
            >
              <!-- Popular Badge -->
              <div
                class="absolute -top-4 left-6 rounded-full bg-base-content px-3 py-1 text-xs font-bold uppercase text-base-100"
              >
                Most Popular
                {#if isTestDiscount}
                  <span class="ml-1">• Test Discount</span>
                {/if}
              </div>

              <!-- Savings Card -->
              {#if annualSavings > 0}
                {#if interval === "monthly"}
                  <button
                    class="group absolute right-6 top-6 flex cursor-pointer items-center gap-2 rounded-lg border border-orange-400/30 bg-orange-100/80 px-3 py-2 transition-all duration-200 hover:bg-orange-200/80"
                    on:click={activateYearlySavings}
                    title="Click to switch to yearly billing and save!"
                  >
                    <div
                      class="flex h-5 w-5 items-center justify-center rounded-full border-2 border-orange-500 bg-base-200 transition-all duration-200 group-hover:border-orange-600 group-hover:bg-orange-500"
                    >
                      <Check
                        size={12}
                        class="text-orange-500 opacity-0 transition-all duration-200 group-hover:text-white group-hover:opacity-100"
                      />
                    </div>
                    <div class="text-left">
                      <div
                        class="text-xs font-bold leading-tight text-orange-700"
                      >
                        Save {CURRENCY_SYMBOL}{Math.round(annualSavings)}
                      </div>
                      <div class="text-xs leading-tight text-orange-600">
                        Click to activate
                      </div>
                    </div>
                  </button>
                {:else}
                  <div
                    class="absolute right-6 top-6 flex items-center gap-2 rounded-lg bg-gradient-to-r from-secondary to-accent px-3 py-2 shadow-md"
                  >
                    <div
                      class="flex h-5 w-5 items-center justify-center rounded-full bg-black/20 text-black"
                    >
                      <Check size={12} />
                    </div>
                    <div class="text-left">
                      <div class="text-xs font-bold leading-tight text-black">
                        Saving {CURRENCY_SYMBOL}{Math.round(annualSavings)}
                      </div>
                      <div class="text-xs leading-tight text-black/80">
                        {discountPercentage}% off
                      </div>
                    </div>
                  </div>
                {/if}
              {/if}

              <h3
                class="mb-2 mt-6 font-sans text-2xl font-bold text-base-content"
              >
                AgSKAN Pro
              </h3>

              <div class="mb-6">
                <div class="flex items-end">
                  {#if interval === "monthly"}
                    <span class="text-3xl font-bold text-base-content"
                      >{CURRENCY_SYMBOL}{displayPrice}</span
                    >
                    <span class="ml-1 text-contrast-content/60">/month</span>
                  {:else}
                    <span class="text-3xl font-bold text-base-content"
                      >{CURRENCY_SYMBOL}{monthlyDisplayPrice}</span
                    >
                    <span class="ml-1 text-contrast-content/60">/month</span>
                    <div class="ml-3">
                      <div
                        class="inline-block rounded-md border border-base-300 bg-base-300 px-2 py-0.5"
                      >
                        <span
                          class="flex items-center text-sm font-semibold text-contrast-content"
                        >
                          Billed {CURRENCY_SYMBOL}{annualMonthlyPayment}/year
                        </span>
                      </div>
                    </div>
                  {/if}
                </div>

                <div
                  class="mt-4 flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 p-2.5"
                >
                  <div
                    class="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-success/20 text-success"
                  >
                    <Zap size={14} />
                  </div>
                  <p class="text-sm font-medium text-success">
                    Everything you need to run a connected, efficient farming
                    operation with your team.
                  </p>
                </div>
              </div>

              <ul class="mb-8 space-y-3">
                {#each proFeatures as feature}
                  <li class="flex items-start gap-3">
                    <div class="mt-0.5">
                      {#if feature.included}
                        <Check size={18} style="color: #22c55e;" />
                      {:else}
                        <X size={18} style="color: #dc2626;" />
                      {/if}
                    </div>
                    <span
                      class={feature.included
                        ? "text-contrast-content"
                        : "text-contrast-content/50"}
                    >
                      {feature.text}
                    </span>
                  </li>
                {/each}
              </ul>

              <a href={proUpgradeUrl}>
                <button
                  class="group flex w-full items-center justify-center gap-2 rounded-lg bg-secondary px-4 py-3 text-lg font-medium text-secondary-content shadow-lg shadow-secondary/30 transition-all duration-300 hover:bg-secondary/90 hover:shadow-xl hover:shadow-secondary/40"
                >
                  Upgrade to Pro
                  <ArrowRight
                    size={16}
                    class="transition-transform group-hover:translate-x-1"
                  />
                </button>
              </a>
            </div>
          </div>
        </div>
      {/if}

      {#if hasEverHadSubscription}
        <div class="mt-12 text-center">
          <button
            on:click={openStripePortal}
            class="btn btn-outline btn-sm"
            disabled={portalLoading}
          >
            {#if portalLoading}
              <span class="loading loading-spinner loading-xs mr-2"></span>
            {/if}
            View Past Invoices
          </button>
        </div>
      {/if}
    </div>
  </section>
{:else}
  <!-- Active Customer - Show Current Subscription -->
  <section class="min-h-screen bg-base-100">
    <div class="container mx-auto px-4 py-8">
      <h1
        class="mb-8 text-center font-sans text-2xl font-bold text-base-content"
      >
        Billing & Subscription
      </h1>

      <div class="mx-auto max-w-4xl">
        <SettingsModule
          title="Subscription Details"
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
              initialValue:
                subscriptionData?.stripeSubscription?.status ?? "N/A",
            },
            {
              id: "quantity",
              label: "Machine Licenses",
              initialValue:
                subscriptionData?.stripeSubscription?.quantity?.toString() ??
                "1",
            },
            ...(subscriptionData?.stripeSubscription?.plan?.interval
              ? [
                  {
                    id: "interval",
                    label: "Billing Cycle",
                    initialValue:
                      subscriptionData.stripeSubscription.plan.interval ===
                      "year"
                        ? "Annual"
                        : "Monthly",
                  },
                ]
              : []),
            {
              id: "nextBilling",
              label: "Next Billing Date",
              initialValue: subscriptionData?.stripeSubscription
                ?.current_period_end
                ? new Date(
                    subscriptionData.stripeSubscription.current_period_end *
                      1000,
                  ).toLocaleDateString()
                : "N/A",
            },
          ]}
        >
          <div class="flex flex-col gap-2" slot="buttons">
            <button
              class="btn btn-outline btn-sm min-w-[145px]"
              on:click={openStripePortal}
              disabled={portalLoading}
            >
              {#if portalLoading}
                <span class="loading loading-spinner loading-xs mr-2"></span>
              {/if}
              Manage Subscription
            </button>
          </div>
        </SettingsModule>

        {#if isFreePlan}
          <div class="mt-12">
            <h2
              class="mb-6 text-center font-sans text-xl font-bold text-base-content"
            >
              Reactivate Pro Features
            </h2>
            <p
              class="mx-auto mb-8 max-w-xl text-center text-contrast-content/70"
            >
              Get back to collaborating with your team and unlock all the
              features you had before.
            </p>
            <!-- Show the same clean Pro card for upgrade -->
            <div class="mx-auto max-w-lg">
              <div
                class="relative rounded-xl border-2 border-base-content bg-base-200 p-6 shadow-xl md:p-8"
              >
                <div
                  class="absolute -top-4 left-6 rounded-full bg-base-content px-3 py-1 text-xs font-bold uppercase text-base-100"
                >
                  Reactivate
                </div>

                <h3
                  class="mb-2 mt-6 font-sans text-2xl font-bold text-base-content"
                >
                  AgSKAN Pro
                </h3>

                <div class="mb-6">
                  <div class="flex items-end">
                    <span class="text-3xl font-bold text-base-content"
                      >{CURRENCY_SYMBOL}{Math.round(BASE_PRICE * 2)}</span
                    >
                    <span class="ml-1 text-contrast-content/60">/month</span>
                  </div>

                  <div
                    class="mt-4 flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 p-2.5"
                  >
                    <div
                      class="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-success/20 text-success"
                    >
                      <Zap size={14} />
                    </div>
                    <p class="text-sm font-medium text-success">
                      Pick up right where you left off with full team access.
                    </p>
                  </div>
                </div>

                <a href="/account/subscribe/{stripePriceIds.monthly}?seats=2">
                  <button
                    class="group flex w-full items-center justify-center gap-2 rounded-lg bg-secondary px-4 py-3 text-lg font-medium text-secondary-content shadow-lg shadow-secondary/30 transition-all duration-300 hover:bg-secondary/90 hover:shadow-xl hover:shadow-secondary/40"
                  >
                    Reactivate Pro
                    <ArrowRight
                      size={16}
                      class="transition-transform group-hover:translate-x-1"
                    />
                  </button>
                </a>
              </div>
            </div>
          </div>
        {/if}
      </div>
    </div>
  </section>
{/if}
