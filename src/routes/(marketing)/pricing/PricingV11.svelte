<script lang="ts">
  /**
   * V11 — "Member Counter"
   * Interactive member count is the hero. Price updates as you tap.
   * Strong free trial emphasis with member count in CTA text.
   */
  import { AlertTriangle, ArrowRight, Check, Minus, Plus, Users } from "lucide-svelte"
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
  $: pricePerOperator = Math.round(pricePerSeatMonth)

  function increment() { if (machineCount < 20) machineCount++ }
  function decrement() { if (machineCount > 1) machineCount-- }

  $: proFeatures = [
    "Real-time machine tracking",
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
      <div class="mx-auto max-w-3xl text-center" in:animationDelay={0}>
        <div class="mb-4 inline-block rounded-full bg-secondary/15 px-4 py-1.5 text-sm font-semibold text-secondary">
          First month free for every operator
        </div>
        <h2 class="mb-3 font-sans text-3xl font-bold text-contrast-content md:text-5xl">
          One plan. Per operator.
        </h2>
        <p class="mx-auto mb-10 max-w-md text-lg text-contrast-content/70">
          {CURRENCY_SYMBOL}{pricePerOperator}/mo per operator — add as many as you need.
        </p>
      </div>

      <!-- Interactive counter card -->
      <div class="mx-auto max-w-lg" in:animationDelay={100}>
        <div class="rounded-2xl border-2 border-base-content bg-base-100 p-8 shadow-xl md:p-10">
          <!-- Counter -->
          <div class="mb-6 text-center">
            <div class="mb-2 flex items-center justify-center gap-2 text-sm font-medium text-contrast-content/60">
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
                <span class="text-6xl font-bold tabular-nums text-contrast-content">{machineCount}</span>
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
              <div class="mt-3 flex items-center justify-center gap-1.5 text-xs text-warning">
                <AlertTriangle size={12} />
                <span>Recommended: at least 2 operators for full team features</span>
              </div>
            {/if}
          </div>

          <!-- Price breakdown -->
          <div class="mb-6 rounded-xl bg-base-200 p-5 text-center">
            <div class="flex items-end justify-center">
              <span class="text-5xl font-bold tracking-tight text-contrast-content">{CURRENCY_SYMBOL}{totalMonthly}</span>
              <span class="mb-1 ml-1 text-contrast-content/50">/mo</span>
            </div>
            <p class="mt-2 text-sm text-contrast-content/50">
              {machineCount} × {CURRENCY_SYMBOL}{pricePerOperator}/mo = {CURRENCY_SYMBOL}{totalAnnual}/year
            </p>
          </div>

          <!-- CTA -->
          <button
            class="group flex w-full items-center justify-center gap-2 rounded-lg bg-secondary px-4 py-3.5 text-lg font-medium text-secondary-content shadow-lg shadow-secondary/30 transition-all duration-300 hover:bg-secondary/90 hover:shadow-xl hover:shadow-secondary/40"
            on:click={() => goto("/login?tab=sign_up")}
          >
            Try {machineCount} operator{machineCount > 1 ? "s" : ""} free for 1 month
            <ArrowRight size={16} class="transition-transform group-hover:translate-x-1" />
          </button>
          <p class="mt-3 text-center text-xs text-contrast-content/50">
            Cancel anytime
          </p>
        </div>
      </div>

      <!-- Features -->
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

      <!-- Free option -->
      <div class="mx-auto mt-10 max-w-lg" in:animationDelay={300}>
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
