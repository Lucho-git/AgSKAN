<script lang="ts">
  import { getContext, onMount } from "svelte"
  import type { Writable } from "svelte/store"
  import SettingsModule from "$lib/components/map/toolbox/SettingsModule.svelte"
  import { ArrowRight, AlertTriangle, Check, Minus, Plus, Users, X, Zap } from "lucide-svelte"
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
  $: pricePerSeat =
    isTestDiscount
      ? BASE_PRICE * 0.25
      : BASE_PRICE * (2 / 3)

  $: totalMonthly = Math.round(machineCount * pricePerSeat)
  $: totalAnnual = Math.round(machineCount * pricePerSeat * 12)
  $: pricePerOperator = Math.round(pricePerSeat)

  // Stripe price IDs (AgSKAN Pro — annual only)
  const stripePriceIds = {
    yearly: {
      standard: "price_1TBWyrK3At0l0k1HoyC9bStL",
      test: "price_1TBWz2K3At0l0k1H7fXrH3nf",
    },
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
  <!-- Free Plan - Show V11 Counter Style Pricing -->
  <section class="min-h-screen bg-base-100" id="pricing">
    <div class="container mx-auto px-4 py-8">
      {#if mounted}
        <div class="mx-auto max-w-3xl text-center" in:animationDelay={0}>
          <div
            class="mb-4 inline-block rounded-full bg-secondary px-4 py-1.5 text-sm font-bold text-secondary-content"
          >
            1 month free trial
          </div>
          <h1
            class="mb-3 font-sans text-3xl font-bold text-contrast-content md:text-5xl"
          >
            Unlock Pro Features
          </h1>
          <p class="mx-auto mb-10 max-w-md text-lg text-contrast-content/70">
            $1 a day per operator. Just pick your team size — everything's
            included, no hidden fees.
          </p>
        </div>

        <!-- Interactive counter card -->
        <div class="mx-auto max-w-lg" in:animationDelay={100}>
          <div
            class="rounded-2xl border-2 border-base-content bg-base-100 p-8 shadow-xl md:p-10"
          >
            <!-- Counter -->
            <div class="mb-6 text-center">
              <div
                class="mb-2 flex items-center justify-center gap-2 text-sm font-medium text-contrast-content/60"
              >
                <Users size={16} />
                How many operators?
              </div>
              <div class="flex items-center justify-center gap-6">
                <button
                  class="flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-base-300 bg-base-200 text-base-content/60 transition-all hover:border-base-content hover:bg-base-content hover:text-base-100"
                  on:click={decrementMachines}
                >
                  <Minus size={20} />
                </button>
                <div class="w-24 text-center">
                  <span
                    class="text-6xl font-bold tabular-nums text-contrast-content"
                    >{machineCount}</span
                  >
                  <span class="-mt-1 block text-sm text-contrast-content/50">
                    operator{machineCount > 1 ? "s" : ""}
                  </span>
                </div>
                <button
                  class="flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-base-300 bg-base-200 text-base-content/60 transition-all hover:border-base-content hover:bg-base-content hover:text-base-100"
                  on:click={incrementMachines}
                >
                  <Plus size={20} />
                </button>
              </div>
              {#if machineCount === 1}
                <div
                  class="mt-3 flex items-center justify-center gap-1.5 text-xs text-warning"
                >
                  <AlertTriangle size={12} />
                  <span
                    >Recommended: at least 2 operators for full team features</span
                  >
                </div>
              {/if}
            </div>

            <!-- Price breakdown -->
            <div class="mb-6 rounded-xl bg-base-200 p-5 text-center">
              <div class="flex items-end justify-center">
                <span
                  class="text-5xl font-bold tracking-tight text-contrast-content"
                  >{CURRENCY_SYMBOL}{totalMonthly}</span
                >
                <span class="mb-1 ml-1 text-contrast-content/50">/mo</span>
              </div>
              <p class="mt-2 text-sm text-contrast-content/50">
                {machineCount} × {CURRENCY_SYMBOL}{pricePerOperator}/mo = {CURRENCY_SYMBOL}{totalAnnual}/year
              </p>
            </div>

            <!-- CTA -->
            <a href={proUpgradeUrl}>
              <button
                class="group flex w-full items-center justify-center gap-2 rounded-lg bg-secondary px-4 py-3.5 text-lg font-medium text-secondary-content shadow-lg shadow-secondary/30 transition-all duration-300 hover:bg-secondary/90 hover:shadow-xl hover:shadow-secondary/40"
              >
                Try {machineCount} operator{machineCount > 1 ? "s" : ""} free for
                1 month
                <ArrowRight
                  size={16}
                  class="transition-transform group-hover:translate-x-1"
                />
              </button>
            </a>
            <p class="mt-3 text-center text-xs text-contrast-content/50">
              Cancel anytime
            </p>
          </div>
        </div>

        <!-- Features -->
        <div class="mx-auto mt-10 max-w-3xl" in:animationDelay={200}>
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {#each proFeatures as feature, i}
              <div
                class="flex flex-col items-center gap-2 rounded-xl p-4 text-center shadow-md {i ===
                0
                  ? 'border-2 border-secondary/40 bg-secondary/5'
                  : 'bg-base-200'}"
              >
                <Check size={20} style="color: #22c55e;" />
                <span
                  class="text-sm {i === 0
                    ? 'font-semibold text-contrast-content'
                    : 'text-contrast-content'}">{feature}</span
                >
              </div>
            {/each}
          </div>
        </div>

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

                <a href="/account/subscribe/{stripePriceIds.yearly.standard}?seats=2">
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
