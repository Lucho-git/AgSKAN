<script lang="ts">
  /**
   * V15 — "Banner Counter + Free Card"
   * Combines V11's big centred counter interaction with V13's banner-style
   * pro card and separate free-account card at the bottom.
   */
  import { goto } from "$app/navigation"
  import { page } from "$app/stores"
  import {
    AlertTriangle,
    ArrowRight,
    Check,
    Minus,
    Plus,
    User,
    Users,
    X,
  } from "lucide-svelte"
  import { onMount } from "svelte"

  /* ── Props (same as V11 PricingSection) ── */
  export let ignoreUrlParams = false
  export let currentPlanId: string | null = null
  export let stripePriceIds = {
    yearly: {
      standard: "price_1TBWyrK3At0l0k1HoyC9bStL",
      test: "price_1TBWz2K3At0l0k1H7fXrH3nf",
    },
  }
  export let additionalDiscountActive = false

  /* ── Constants ── */
  const BASE_PRICE = 45.625
  const CURRENCY_SYMBOL = "A$"

  let mounted = false
  let machineCount = 2
  let isTestDiscount = false

  onMount(() => {
    mounted = true
  })

  /* ── URL-driven discount ── */
  $: {
    if (!ignoreUrlParams) {
      const discountCode = $page.url.searchParams.get("discountcode")
      isTestDiscount = discountCode === "test"
    } else {
      isTestDiscount = false
    }
  }

  /* ── Price calculations ── */
  $: pricePerSeat = isTestDiscount ? BASE_PRICE * 0.25 : BASE_PRICE * (2 / 3)
  $: totalMonthly = Math.round(machineCount * pricePerSeat)
  $: totalAnnual = Math.round(machineCount * pricePerSeat * 12)
  $: pricePerOperator = Math.round(pricePerSeat)

  $: stripePriceId = isTestDiscount
    ? stripePriceIds.yearly?.test || ""
    : stripePriceIds.yearly?.standard || ""

  $: proUpgradeUrl = `/account/subscribe/${stripePriceId || ""}?seats=${machineCount}${
    additionalDiscountActive ? "&discount=true" : ""
  }${isTestDiscount ? "&discountcode=test" : ""}`

  function increment() {
    if (machineCount < 20) machineCount++
  }
  function decrement() {
    if (machineCount > 1) machineCount--
  }

  /* ── Feature lists (ordered by importance) ── */
  $: proFeatures = [
    {
      label: `Track ${machineCount} machine${machineCount > 1 ? "s" : ""} live`,
      highlight: true,
    },
    { label: "Records coverage in the background", highlight: false },
    { label: "Unlimited paddocks & pins", highlight: false },
    { label: "Offline Ready", highlight: false },
    { label: "Rock picking path tool", highlight: false },
    { label: "Shareable map reports", highlight: false },
    { label: "Priority phone support", highlight: false },
    { label: "All future features", highlight: false },
  ]

  const freeFeatures = [
    { text: "Track yourself live on your map", included: true },
    { text: "Test every feature — no limits", included: true },
    { text: "Invite team members", included: false },
  ]

  function animationDelay(node: HTMLElement, delay: number) {
    return {
      delay,
      duration: 600,
      css: (t: number) =>
        `opacity: ${t}; transform: translateY(${(1 - t) * 20}px);`,
    }
  }
</script>

<section class="bg-base-200" id="pricing">
  <div class="section-container py-20">
    {#if mounted}
      <!-- ────── Header ────── -->
      <div class="mx-auto max-w-3xl text-center" in:animationDelay={0}>
        <div
          class="mb-4 inline-block rounded-full bg-secondary px-4 py-1.5 text-sm font-bold uppercase text-secondary-content"
        >
          1 Month Free Trial
        </div>
        <h2
          class="mb-3 font-sans text-3xl font-bold text-contrast-content md:text-5xl"
        >
          One Plan. One Price.
        </h2>
        <p class="mx-auto mb-10 max-w-md text-lg text-contrast-content/70">
          $1 a day per operator. Just pick your team size — everything's
          included, no hidden fees.
        </p>
      </div>

      <!-- ────── Pro Banner Card (V13-style shell, V11 counter inside) ────── -->
      <div
        class="relative mx-auto max-w-4xl rounded-xl border border-base-300 bg-base-100 p-6 shadow-xl md:p-10"
        in:animationDelay={100}
      >
        <h3
          class="mb-6 text-center font-sans text-2xl font-bold text-contrast-content"
        >
          AgSKAN Pro
        </h3>

        <!-- Counter (V11 style — big centred buttons) -->
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
              on:click={decrement}
            >
              <Minus size={20} />
            </button>
            <div class="w-24 text-center">
              <span
                class="text-6xl font-bold tabular-nums text-contrast-content"
              >
                {machineCount}
              </span>
              <span class="-mt-1 block text-sm text-contrast-content/50">
                operator{machineCount > 1 ? "s" : ""}
              </span>
            </div>
            <button
              class="flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-base-300 bg-base-200 text-base-content/60 transition-all hover:border-base-content hover:bg-base-content hover:text-base-100"
              on:click={increment}
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

        <!-- Price breakdown (V11 style) -->
        <div class="mb-6 rounded-xl bg-base-200 p-5 text-center">
          <div class="flex items-end justify-center">
            <span
              class="text-5xl font-bold tracking-tight text-contrast-content"
            >
              {CURRENCY_SYMBOL}{totalMonthly}
            </span>
            <span class="mb-1 ml-1 text-contrast-content/50">/mo</span>
          </div>
          <p class="mt-2 text-sm text-contrast-content/50">
            {machineCount} × {CURRENCY_SYMBOL}{pricePerOperator}/mo = {CURRENCY_SYMBOL}{totalAnnual}/year
          </p>
        </div>

        <!-- CTA -->
        {#if currentPlanId === "pro"}
          <button
            class="flex w-full items-center justify-center gap-2 rounded-lg bg-base-300 px-4 py-3.5 text-lg font-medium text-base-content"
            disabled
          >
            Current Plan
          </button>
        {:else}
          <a href={proUpgradeUrl}>
            <button
              class="group flex w-full items-center justify-center gap-2 rounded-lg bg-secondary px-4 py-3.5 text-lg font-medium text-secondary-content shadow-lg shadow-secondary/30 transition-all duration-300 hover:bg-secondary/90 hover:shadow-xl hover:shadow-secondary/40"
            >
              Try free for 1 month
              <ArrowRight
                size={16}
                class="transition-transform group-hover:translate-x-1"
              />
            </button>
          </a>
        {/if}
        <p class="mt-3 text-center text-xs text-contrast-content/50">
          Cancel anytime
        </p>
      </div>

      <!-- ────── Pro Features Grid ────── -->
      <div class="mx-auto mt-8 max-w-3xl" in:animationDelay={200}>
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {#each proFeatures as feature, i (feature.label)}
            <div
              class="flex flex-col items-center gap-2 rounded-xl p-4 text-center shadow-md {feature.highlight
                ? 'border-2 border-secondary/40 bg-secondary/5'
                : 'bg-base-100'}"
              style="order: {i};"
            >
              <Check size={20} style="color: #22c55e;" />
              <span
                class="text-sm {feature.highlight
                  ? 'font-semibold text-contrast-content'
                  : 'text-contrast-content'}">{feature.label}</span
              >
            </div>
          {/each}
        </div>
      </div>

      <!-- ────── Free Account Card (V13 style) ────── -->
      <div class="mx-auto mt-12 max-w-3xl" in:animationDelay={300}>
        <div
          class="rounded-xl border-2 border-base-content bg-base-100 px-5 py-3 shadow-md md:px-6 md:py-4"
        >
          <div
            class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <!-- Left: info + features -->
            <div class="flex-1">
              <div class="flex items-center gap-2">
                <div
                  class="flex h-7 w-7 items-center justify-center rounded-full bg-base-content/10"
                >
                  <User size={14} class="text-base-content" />
                </div>
                <h3 class="font-sans text-lg font-bold text-contrast-content">
                  Free Account
                </h3>
                <span class="text-sm text-contrast-content/50">
                  — No credit card, no expiry
                </span>
              </div>
              <div class="ml-9 mt-1.5 flex flex-col gap-0.5 text-sm">
                {#each freeFeatures as feature}
                  <span
                    class="flex items-center gap-1.5 {feature.included
                      ? 'text-contrast-content/70'
                      : 'text-contrast-content/40'}"
                  >
                    {#if feature.included}
                      <Check size={14} style="color: #22c55e;" />
                    {:else}
                      <X size={14} style="color: #ef4444;" />
                    {/if}
                    {feature.text}
                  </span>
                {/each}
              </div>
            </div>

            <!-- Right: CTA -->
            <div class="flex flex-shrink-0 items-center gap-4">
              <div class="flex items-end">
                <span class="text-3xl font-bold text-contrast-content">
                  {CURRENCY_SYMBOL}0
                </span>
                <span class="mb-0.5 ml-1 text-contrast-content/50"
                  >/forever</span
                >
              </div>
              <button
                class="group flex items-center gap-2 rounded-lg bg-base-content px-5 py-2 font-medium text-base-100 shadow-lg transition-all duration-300 hover:bg-base-content/90 hover:shadow-xl"
                on:click={() => goto("/login?tab=sign_up")}
              >
                Get Started Free
                <ArrowRight
                  size={14}
                  class="transition-transform group-hover:translate-x-1"
                />
              </button>
            </div>
          </div>
        </div>
      </div>
    {/if}
  </div>
</section>
