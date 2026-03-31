<!-- src/lib/components/general/PricingSection.svelte -->
<script lang="ts">
  import { goto } from "$app/navigation"
  import {
    ArrowRight,
    Check,
    Minus,
    Plus,
    Users,
  } from "lucide-svelte"
  import { onMount } from "svelte"
  import { page } from "$app/stores"

  export let ignoreUrlParams = false

  export let currentPlanId: string | null = null
  export let stripePriceIds = {
    yearly: {
      standard: "price_1TH522K3At0l0k1HVQWZXNFa",
      test: "price_1TBWz2K3At0l0k1H7fXrH3nf",
    },
  }
  export let useFullPrice = true
  export let additionalDiscountActive = false

  const BASE_PRICE = 100
  const CURRENCY_SYMBOL = "A$"

  let mounted = false
  let machineCount = 1
  let isTestDiscount = false

  onMount(() => {
    mounted = true
  })

  $: {
    if (!ignoreUrlParams) {
      const discountCode = $page.url.searchParams.get("discountcode")
      isTestDiscount = discountCode === "test"
    } else {
      isTestDiscount = false
    }
  }

  $: pricePerSeat = isTestDiscount ? BASE_PRICE * 0.25 : BASE_PRICE

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

  function animationDelay(node: HTMLElement, delay: number) {
    return {
      delay,
      duration: 600,
      css: (t: number) =>
        `opacity: ${t}; transform: translateY(${(1 - t) * 20}px);`,
    }
  }
</script>

<div class="relative overflow-hidden">
  <div class="container mx-auto px-4 py-8">
    {#if mounted}
      <div class="mx-auto max-w-3xl text-center" in:animationDelay={0}>
        <div
          class="mb-4 inline-block rounded-full bg-secondary px-4 py-1.5 text-sm font-bold text-secondary-content"
        >
          1 month free trial
        </div>
        <h2
          class="mb-3 font-sans text-3xl font-bold text-contrast-content md:text-5xl"
        >
          One Plan. One Price.
        </h2>
        <p class="mx-auto mb-10 max-w-md text-lg text-contrast-content/70">
          Pick your team size — everything's included, no hidden fees.
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
                on:click={decrement}
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
                on:click={increment}
              >
                <Plus size={20} />
              </button>
            </div>

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
                Try {machineCount} operator{machineCount > 1 ? "s" : ""} free for
                1 month
                <ArrowRight
                  size={16}
                  class="transition-transform group-hover:translate-x-1"
                />
              </button>
            </a>
          {/if}
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
                : 'bg-base-100'}"
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
    {/if}
  </div>
</div>
