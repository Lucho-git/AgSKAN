<script lang="ts">
  /**
   * V6 — "Compact Price Banner"
   * Horizontal banner-style price with CTA inline, features below in cards.
   * Feels fast / action-oriented.
   */
  import { AlertTriangle, ArrowRight, Check, Minus, Plus } from "lucide-svelte"
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

      <!-- Horizontal banner card -->
      <div
        class="mx-auto max-w-4xl rounded-xl border-2 border-base-content bg-base-100 p-6 shadow-xl md:p-8"
        in:animationDelay={100}
      >
        <div class="flex flex-col items-center gap-6 md:flex-row md:justify-between">
          <!-- Left: Name + badge -->
          <div class="text-center md:text-left">
            <div class="mb-2 inline-block rounded-full bg-secondary px-3 py-1 text-xs font-bold uppercase text-secondary-content shadow-md">
              1 Month Free
            </div>
            <h3 class="font-sans text-2xl font-bold text-contrast-content">AgSKAN Pro</h3>
            <p class="mt-1 text-sm text-contrast-content/60">Everything your farm needs</p>
          </div>

          <!-- Centre: Price + machine selector -->
          <div class="flex flex-col items-center gap-3">
            <div class="flex items-end">
              <span class="text-5xl font-bold text-contrast-content">{CURRENCY_SYMBOL}{totalMonthly}</span>
              <span class="mb-1 ml-1 text-contrast-content/60">/mo</span>
            </div>
            <p class="text-sm text-contrast-content/50">
              {CURRENCY_SYMBOL}{totalAnnual}/year
            </p>

            <!-- Team size +/- -->
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
            <p class="mt-2 text-center text-xs text-contrast-content/50">
              Cancel anytime
            </p>
          </div>
        </div>
      </div>

      <!-- Features grid -->
      <div class="mx-auto mt-10 max-w-3xl" in:animationDelay={200}>
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {#each proFeatures as feature, i}
            <div class="flex flex-col items-center gap-2 rounded-xl p-4 text-center shadow-md {i === 0 ? 'border-2 border-secondary/40 bg-secondary/5' : 'bg-base-100'}">
              <Check size={20} style="color: #22c55e;" />
              <span class="text-sm {i === 0 ? 'font-semibold text-contrast-content' : 'text-contrast-content'}">{feature}</span>
            </div>
          {/each}
        </div>
      </div>

      <!-- Free explore card -->
      <div class="mx-auto mt-10 max-w-lg" in:animationDelay={250}>
        <div class="flex flex-col items-center gap-4 rounded-xl bg-base-100 p-5 shadow-md sm:flex-row sm:justify-between">
          <div>
            <span class="font-sans font-bold text-contrast-content">Just want to explore?</span>
            <p class="text-sm text-contrast-content/60">1 operator, no credit card, no expiry.</p>
          </div>
          <button
            class="group btn btn-outline flex-shrink-0 border-base-content text-sm text-base-content hover:bg-base-content hover:text-base-100"
            on:click={() => goto("/login?tab=sign_up")}
          >
            Start Free
            <ArrowRight size={14} class="ml-1 transition-transform group-hover:translate-x-1" />
          </button>
        </div>
      </div>
    {/if}
  </div>
</section>
