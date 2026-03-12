<script lang="ts">
  /**
   * V13 — "Banner + Strong Free"
   * V6-style pro banner on top, but the free section below is a proper
   * card with features — not just a link. Both sections get equal emphasis.
   */
  import { AlertTriangle, ArrowRight, Check, Minus, Plus, User, X } from "lucide-svelte"
  import { onMount } from "svelte"
  import { goto } from "$app/navigation"

  export let initialMachineCount: number = 2

  const BASE_PRICE = 45.625
  const CURRENCY_SYMBOL = "A$"

  let mounted = false
  let machineCount = initialMachineCount

  onMount(() => { mounted = true })

  $: pricePerSeatMonth = BASE_PRICE * (2 / 3)
  $: totalMonthly = Math.round(machineCount * pricePerSeatMonth)
  $: totalAnnual = Math.round(machineCount * pricePerSeatMonth * 12)

  function increment() { if (machineCount < 20) machineCount++ }
  function decrement() { if (machineCount > 1) machineCount-- }

  $: proFeatures = [
    `Track ${machineCount} operator${machineCount > 1 ? "s" : ""} live`,
    "Background location & coverage trails",
    "Rock picking path tool",
    "Unlimited paddocks & pins",
    "Offline tracking & replay",
    "Shareable map reports",
    "Priority phone support",
    "All future features",
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
      css: (t: number) => `opacity: ${t}; transform: translateY(${(1 - t) * 20}px);`,
    }
  }
</script>

<section class="bg-base-200" id="pricing">
  <div class="section-container py-20">
    {#if mounted}
      <div in:animationDelay={0}>
        <h2 class="mb-4 text-center font-sans text-3xl font-bold text-contrast-content md:text-4xl">
          Simple, Transparent Pricing
        </h2>
        <p class="mx-auto mb-10 max-w-2xl text-center text-contrast-content/70">
          One plan for your whole team. Pick how many operators and go.
        </p>
      </div>

      <!-- Pro banner -->
      <div
        class="relative mx-auto max-w-4xl rounded-xl border border-base-300 bg-base-100 p-6 shadow-xl md:p-8"
        in:animationDelay={100}
      >
        <div class="absolute -top-3.5 left-6 rounded-full bg-secondary px-3 py-1 text-xs font-bold uppercase text-secondary-content shadow-md">
          1 Month Free Trial
        </div>

        <div class="flex flex-col items-center gap-6 md:flex-row md:justify-between">
          <!-- Left: Name -->
          <div class="text-center md:text-left">
            <h3 class="font-sans text-2xl font-bold text-contrast-content">AgSKAN Pro</h3>
            <p class="mt-1 text-sm text-contrast-content/60">Everything your farm needs</p>
          </div>

          <!-- Centre: Price + machine selector -->
          <div class="flex flex-col items-center gap-3">
            <div class="flex items-end">
              <span class="text-5xl font-bold text-contrast-content">{CURRENCY_SYMBOL}{totalMonthly}</span>
              <span class="mb-1 ml-1 text-contrast-content/60">/mo</span>
            </div>
            <p class="text-sm text-contrast-content/50">{CURRENCY_SYMBOL}{totalAnnual}/year</p>

            <div class="flex items-center gap-3 rounded-lg bg-base-200 p-1.5 shadow-md md:p-2">
              <span class="whitespace-nowrap pl-2 text-sm font-medium text-contrast-content">Operators:</span>
              <button
                class="flex h-8 w-8 items-center justify-center rounded-lg border border-base-300 bg-base-100 text-base-content/60 transition-colors hover:bg-base-content hover:text-base-100"
                on:click={decrement}
              >
                <Minus size={14} />
              </button>
              <div class="w-12 text-center">
                <span class="text-lg font-bold text-base-content">{machineCount}</span>
              </div>
              <button
                class="flex h-8 w-8 items-center justify-center rounded-lg border border-base-300 bg-base-100 text-base-content/60 transition-colors hover:bg-base-content hover:text-base-100"
                on:click={increment}
              >
                <Plus size={14} />
              </button>
            </div>
            {#if machineCount === 1}
              <div class="flex items-center justify-center gap-1.5 text-xs text-warning">
                <AlertTriangle size={12} />
                <span>Recommended: at least 2 operators</span>
              </div>
            {/if}
          </div>

          <!-- Right: CTA -->
          <div class="w-full md:w-auto">
            <button
              class="group flex w-full items-center justify-center gap-2 rounded-lg bg-secondary px-8 py-3 text-lg font-medium text-secondary-content shadow-lg shadow-secondary/30 transition-all duration-300 hover:bg-secondary/90 hover:shadow-xl hover:shadow-secondary/40 md:w-auto"
              on:click={() => goto("/login?tab=sign_up")}
            >
              Start Free Month
              <ArrowRight size={16} class="transition-transform group-hover:translate-x-1" />
            </button>
            <p class="mt-2 text-center text-xs text-contrast-content/50">Cancel anytime</p>
          </div>
        </div>
      </div>

      <!-- Pro features grid -->
      <div class="mx-auto mt-8 max-w-3xl" in:animationDelay={200}>
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {#each proFeatures as feature, i}
            <div class="flex flex-col items-center gap-2 rounded-xl p-4 text-center shadow-md {i === 0 ? 'border-2 border-secondary/40 bg-secondary/5' : 'bg-base-100'}">
              <Check size={20} style="color: #22c55e;" />
              <span class="text-sm {i === 0 ? 'font-semibold text-contrast-content' : 'text-contrast-content'}">{feature}</span>
            </div>
          {/each}
        </div>
      </div>

      <!-- Free section — full card -->
      <div class="mx-auto mt-12 max-w-3xl" in:animationDelay={300}>
        <div class="rounded-xl border-2 border-base-content bg-base-100 px-5 py-3 shadow-md md:px-6 md:py-4">
          <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <!-- Left: info + features -->
            <div class="flex-1">
              <div class="flex items-center gap-2">
                <div class="flex h-7 w-7 items-center justify-center rounded-full bg-base-content/10">
                  <User size={14} class="text-base-content" />
                </div>
                <h3 class="font-sans text-lg font-bold text-contrast-content">Free Account</h3>
                <span class="text-sm text-contrast-content/50">— No credit card, no expiry</span>
              </div>
              <div class="ml-9 mt-1.5 flex flex-col gap-0.5 text-sm">
                {#each freeFeatures as feature}
                  <span class="flex items-center gap-1.5 {feature.included ? 'text-contrast-content/70' : 'text-contrast-content/40'}">
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
                <span class="text-3xl font-bold text-contrast-content">{CURRENCY_SYMBOL}0</span>
                <span class="mb-0.5 ml-1 text-contrast-content/50">/forever</span>
              </div>
              <button
                class="group flex items-center gap-2 rounded-lg bg-base-content px-5 py-2 font-medium text-base-100 shadow-lg transition-all duration-300 hover:bg-base-content/90 hover:shadow-xl"
                on:click={() => goto("/login?tab=sign_up")}
              >
                Get Started Free
                <ArrowRight size={14} class="transition-transform group-hover:translate-x-1" />
              </button>
            </div>
          </div>
        </div>
      </div>
    {/if}
  </div>
</section>
