<script lang="ts">
  /**
   * V14 — "Free-First Banner"
   * Leads with free — big hero banner saying "Start for free".
   * Pro upsell below as a banner with inline team selector.
   * Strongest emphasis on free account of any variant.
   */
  import { AlertTriangle, ArrowRight, Check, MapPin, Minus, Plus, Route } from "lucide-svelte"
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

  const freeHighlights = [
    { icon: MapPin, text: "Paddocks, pins & polygons" },
    { icon: Route, text: "Background trails & recording" },
    { icon: Check, text: "Test every feature — unlimited" },
  ]

  $: proFeatures = [
    `Track ${machineCount} operator${machineCount > 1 ? "s" : ""} live`,
    "Background location & coverage trails",
    "Rock picking path tool",
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
      <div class="mx-auto max-w-3xl text-center" in:animationDelay={0}>
        <h2 class="mb-3 font-sans text-3xl font-bold text-contrast-content md:text-5xl">
          Start Mapping for Free
        </h2>
        <p class="mx-auto mb-10 max-w-lg text-lg text-contrast-content/70">
          No credit card, no time limit. Add your team when you're ready.
        </p>
      </div>

      <!-- Free hero banner -->
      <div
        class="mx-auto max-w-4xl rounded-xl border-2 border-base-content bg-base-100 p-6 shadow-xl md:p-8"
        in:animationDelay={100}
      >
        <div class="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <!-- Left: Name + price -->
          <div class="text-center md:text-left">
            <h3 class="font-sans text-2xl font-bold text-contrast-content">Free Account</h3>
            <div class="mt-2 flex items-end justify-center md:justify-start">
              <span class="text-5xl font-bold text-contrast-content">{CURRENCY_SYMBOL}0</span>
              <span class="mb-1 ml-1 text-contrast-content/50">/forever</span>
            </div>
            <p class="mt-1 text-sm text-contrast-content/60">1 operator · No credit card required</p>
          </div>

          <!-- Centre: Highlights -->
          <div class="flex flex-1 justify-center">
            <div class="flex flex-wrap gap-4">
              {#each freeHighlights as h}
                <div class="flex items-center gap-2 text-sm text-contrast-content/80">
                  <div class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-base-content/10">
                    <svelte:component this={h.icon} size={16} class="text-base-content" />
                  </div>
                  <span>{h.text}</span>
                </div>
              {/each}
            </div>
          </div>

          <!-- Right: CTA -->
          <div class="w-full md:w-auto">
            <button
              class="group flex w-full items-center justify-center gap-2 rounded-lg bg-base-content px-8 py-3 text-lg font-medium text-base-100 shadow-lg transition-all duration-300 hover:bg-base-content/90 hover:shadow-xl md:w-auto"
              on:click={() => goto("/login?tab=sign_up")}
            >
              Get Started
              <ArrowRight size={16} class="transition-transform group-hover:translate-x-1" />
            </button>
          </div>
        </div>
      </div>

      <!-- Pro upsell section -->
      <div class="mx-auto mt-10 max-w-4xl" in:animationDelay={200}>
        <p class="mb-4 text-center text-sm font-semibold uppercase tracking-wide text-contrast-content/40">
          Need your whole team?
        </p>

        <!-- Pro banner -->
        <div class="relative rounded-xl border border-base-300 bg-base-100 p-6 shadow-md md:p-8">
          <div class="absolute -top-3 left-6 rounded-full bg-secondary px-3 py-0.5 text-[11px] font-bold uppercase text-secondary-content shadow-md">
            1 Month Free Trial
          </div>

          <div class="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <!-- Left: name -->
            <div>
              <h3 class="font-sans text-xl font-bold text-contrast-content">AgSKAN Pro</h3>
              <p class="mt-1 text-sm text-contrast-content/60">Everything for your whole team</p>
            </div>

            <!-- Centre: price + team selector -->
            <div class="flex flex-shrink-0 items-center gap-4">
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
                Start Team Trial
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

        <!-- Pro feature pills -->
        <div class="mt-4 flex flex-wrap justify-center gap-2">
          {#each proFeatures as feature, i}
            <span class="rounded-full px-3 py-1.5 text-xs shadow-sm {i === 0 ? 'border border-secondary/40 bg-secondary/10 font-semibold text-contrast-content' : 'bg-base-100 text-contrast-content/70'}">
              {feature}
            </span>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</section>
