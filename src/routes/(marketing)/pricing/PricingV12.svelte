<script lang="ts">
  /**
   * V12 — "Two Row Banners"
   * Two thin horizontal banner cards stacked vertically.
   * Row 1: Pro plan (price + team selector + CTA all inline).
   * Row 2: Free plan (description + CTA inline).
   * Both rows feel the same height — no tall columns.
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
      <div class="mx-auto max-w-3xl text-center" in:animationDelay={0}>
        <h2 class="mb-3 font-sans text-3xl font-bold text-contrast-content md:text-5xl">
          Simple, Transparent Pricing
        </h2>
        <p class="mx-auto mb-10 max-w-lg text-lg text-contrast-content/70">
          Start free or go straight to a team plan — everything's included.
        </p>
      </div>

      <div class="mx-auto flex max-w-4xl flex-col gap-4">

        <!-- Row 1: Pro banner -->
        <div
          class="relative rounded-xl border-2 border-base-content bg-base-100 px-6 py-5 shadow-xl md:px-8"
          in:animationDelay={100}
        >
          <div class="absolute -top-3 left-6 rounded-full bg-secondary px-3 py-0.5 text-[11px] font-bold uppercase text-secondary-content shadow-md">
            1 Month Free Trial
          </div>

          <!-- Desktop: single row. Mobile: stacks naturally. -->
          <div class="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">

            <!-- Left: name + features -->
            <div class="flex-1">
              <h3 class="font-sans text-xl font-bold text-contrast-content">Pro — Team Plan</h3>
              <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-contrast-content/70">
                <span class="flex items-center gap-1.5">
                  <Check size={14} style="color: #22c55e;" />
                  Track {machineCount} operator{machineCount > 1 ? "s" : ""} live
                </span>
                <span class="flex items-center gap-1.5">
                  <Check size={14} style="color: #22c55e;" />
                  Background trails & coverage
                </span>
                <span class="flex items-center gap-1.5">
                  <Check size={14} style="color: #22c55e;" />
                  Rock picking paths
                </span>
                <span class="flex items-center gap-1.5">
                  <Check size={14} style="color: #22c55e;" />
                  Priority support
                </span>
              </div>
            </div>

            <!-- Centre: price + team selector -->
            <div class="flex flex-shrink-0 items-center gap-4">
              <!-- Team size -->
              <div class="flex items-center gap-2 rounded-lg bg-base-200 px-2.5 py-1.5">
                <button
                  class="flex h-7 w-7 items-center justify-center rounded-md border border-base-300 bg-base-100 text-base-content/60 transition-colors hover:bg-base-content hover:text-base-100"
                  on:click={decrement}
                >
                  <Minus size={12} />
                </button>
                <span class="w-6 text-center text-sm font-bold text-base-content">{machineCount}</span>
                <button
                  class="flex h-7 w-7 items-center justify-center rounded-md border border-base-300 bg-base-100 text-base-content/60 transition-colors hover:bg-base-content hover:text-base-100"
                  on:click={increment}
                >
                  <Plus size={12} />
                </button>
                <span class="text-xs text-base-content/50">ops</span>
              </div>

              <!-- Price -->
              <div class="text-right">
                <div class="flex items-end">
                  <span class="text-3xl font-bold text-contrast-content md:text-4xl">{CURRENCY_SYMBOL}{totalMonthly}</span>
                  <span class="mb-0.5 ml-1 text-sm text-contrast-content/50">/mo</span>
                </div>
                <p class="text-xs text-contrast-content/40">{CURRENCY_SYMBOL}{totalAnnual}/yr</p>
              </div>
            </div>

            <!-- Right: CTA -->
            <div class="flex-shrink-0">
              <button
                class="group flex w-full items-center justify-center gap-2 rounded-lg bg-secondary px-6 py-2.5 font-medium text-secondary-content shadow-lg shadow-secondary/30 transition-all duration-300 hover:bg-secondary/90 hover:shadow-xl hover:shadow-secondary/40 md:w-auto"
                on:click={() => goto("/login?tab=sign_up")}
              >
                Start Free Trial
                <ArrowRight size={14} class="transition-transform group-hover:translate-x-1" />
              </button>
              <p class="mt-1.5 text-center text-[11px] text-contrast-content/40">Cancel anytime</p>
            </div>
          </div>

          {#if machineCount === 1}
            <div class="mt-2 flex items-center gap-1.5 text-xs text-warning">
              <AlertTriangle size={12} />
              <span>At least 2 operators recommended for team features</span>
            </div>
          {/if}
        </div>

        <!-- Row 2: Free banner -->
        <div
          class="rounded-xl border border-base-300 bg-base-100 px-6 py-5 shadow-md md:px-8"
          in:animationDelay={200}
        >
          <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <!-- Left: info -->
            <div>
              <h3 class="font-sans text-xl font-bold text-contrast-content">Free Account</h3>
              <p class="mt-1 text-sm text-contrast-content/60">
                1 operator, unlimited paddocks & pins — no credit card, no expiry.
              </p>
            </div>

            <!-- Right: CTA -->
            <button
              class="group flex flex-shrink-0 items-center justify-center gap-2 rounded-lg bg-base-content px-6 py-2.5 font-medium text-base-100 shadow-lg transition-all duration-300 hover:bg-base-content/90 hover:shadow-xl sm:w-auto"
              on:click={() => goto("/login?tab=sign_up")}
            >
              Get Started Free
              <ArrowRight size={14} class="transition-transform group-hover:translate-x-1" />
            </button>
          </div>
        </div>
      </div>
    {/if}
  </div>
</section>
