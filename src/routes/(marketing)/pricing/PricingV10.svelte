<script lang="ts">
  /**
   * V10 — "Zero Commitment"
   * Two balanced compact cards side-by-side: Free (primary) + Pro (secondary).
   * Both cards are deliberately kept thin & equal height.
   */
  import {
    AlertTriangle,
    ArrowRight,
    Check,
    Minus,
    Plus,
    Users,
  } from "lucide-svelte"
  import { onMount } from "svelte"
  import { goto } from "$app/navigation"

  export let initialMachineCount: number = 2

  const BASE_PRICE = 45.625
  const CURRENCY_SYMBOL = "A$"

  let mounted = false
  let machineCount = initialMachineCount

  onMount(() => {
    mounted = true
  })

  $: pricePerSeatMonth = BASE_PRICE * (2 / 3)
  $: totalMonthly = Math.round(machineCount * pricePerSeatMonth)
  $: totalAnnual = Math.round(machineCount * pricePerSeatMonth * 12)

  function increment() {
    if (machineCount < 20) machineCount++
  }
  function decrement() {
    if (machineCount > 1) machineCount--
  }

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
      <div class="mx-auto max-w-4xl text-center" in:animationDelay={0}>
        <h2
          class="mb-3 font-sans text-3xl font-bold text-contrast-content md:text-5xl"
        >
          Start free. Upgrade when ready.
        </h2>
        <p class="mx-auto mb-10 max-w-lg text-lg text-contrast-content/70">
          Map your farm today — add your team whenever you need to.
        </p>
      </div>

      <!-- Two balanced cards -->
      <div class="mx-auto grid max-w-3xl gap-6 md:grid-cols-2">
        <!-- Free card -->
        <div
          class="relative flex flex-col rounded-xl border-2 border-base-content bg-base-100 p-6 shadow-xl"
          in:animationDelay={100}
        >
          <div
            class="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-base-content px-4 py-1 text-xs font-bold uppercase text-base-100 shadow-md"
          >
            Start Here
          </div>

          <h3 class="mt-2 font-sans text-xl font-bold text-contrast-content">
            Free Account
          </h3>
          <div class="mt-3 flex items-end">
            <span class="text-4xl font-bold text-contrast-content"
              >{CURRENCY_SYMBOL}0</span
            >
            <span class="mb-0.5 ml-1 text-contrast-content/60">/forever</span>
          </div>

          <ul class="mt-4 space-y-2 text-sm">
            <li class="flex items-center gap-2">
              <Check size={16} style="color: #22c55e;" />
              <span class="text-contrast-content">Track 1 machine live</span>
            </li>
            <li class="flex items-center gap-2">
              <Check size={16} style="color: #22c55e;" />
              <span class="text-contrast-content"
                >Create paddocks & drop pins</span
              >
            </li>
            <li class="flex items-center gap-2">
              <Check size={16} style="color: #22c55e;" />
              <span class="text-contrast-content"
                >Test every feature — no limits</span
              >
            </li>
          </ul>

          <div class="mt-auto pt-5">
            <button
              class="group flex w-full items-center justify-center gap-2 rounded-lg bg-base-content px-4 py-2.5 font-medium text-base-100 shadow-lg transition-all duration-300 hover:bg-base-content/90 hover:shadow-xl"
              on:click={() => goto("/login?tab=sign_up")}
            >
              Get Started Free
              <ArrowRight
                size={14}
                class="transition-transform group-hover:translate-x-1"
              />
            </button>
            <p class="mt-2 text-center text-xs text-contrast-content/50">
              No credit card · No expiry
            </p>
          </div>
        </div>

        <!-- Pro card -->
        <div
          class="relative flex flex-col rounded-xl border border-base-300 bg-base-100 p-6 shadow-md"
          in:animationDelay={200}
        >
          <div
            class="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-secondary px-4 py-1 text-xs font-bold uppercase text-secondary-content shadow-md"
          >
            1 Month Free Trial
          </div>

          <h3 class="mt-2 font-sans text-xl font-bold text-contrast-content">
            Pro — Team Plan
          </h3>
          <div class="mt-3 flex items-center justify-between">
            <div class="flex items-end">
              <span class="text-4xl font-bold text-contrast-content"
                >{CURRENCY_SYMBOL}{totalMonthly}</span
              >
              <span class="mb-0.5 ml-1 text-contrast-content/60">/mo</span>
            </div>
            <!-- Inline team size selector -->
            <div
              class="flex items-center gap-2 rounded-lg bg-base-200 px-2 py-1"
            >
              <button
                class="flex h-7 w-7 items-center justify-center rounded-md border border-base-300 bg-base-100 text-base-content/60 transition-colors hover:bg-base-content hover:text-base-100"
                on:click={decrement}
              >
                <Minus size={12} />
              </button>
              <span class="w-6 text-center text-sm font-bold text-base-content"
                >{machineCount}</span
              >
              <button
                class="flex h-7 w-7 items-center justify-center rounded-md border border-base-300 bg-base-100 text-base-content/60 transition-colors hover:bg-base-content hover:text-base-100"
                on:click={increment}
              >
                <Plus size={12} />
              </button>
              <span class="text-xs text-base-content/50">ops</span>
            </div>
          </div>
          <p class="mt-1 text-xs text-contrast-content/50">
            Billed at {CURRENCY_SYMBOL}{totalAnnual}/yr
          </p>
          {#if machineCount === 1}
            <div class="mt-1 flex items-center gap-1.5 text-xs text-warning">
              <AlertTriangle size={12} />
              <span>At least 2 recommended for team features</span>
            </div>
          {/if}

          <ul class="mt-4 space-y-2 text-sm">
            <li
              class="flex items-center gap-2 rounded-lg border border-secondary/30 bg-secondary/5 px-2 py-1.5"
            >
              <Check size={16} style="color: #22c55e;" />
              <span class="font-semibold text-contrast-content"
                >Track {machineCount} operator{machineCount > 1 ? "s" : ""} in real
                time</span
              >
            </li>
            <li class="flex items-center gap-2">
              <Check size={16} style="color: #22c55e;" />
              <span class="text-contrast-content"
                >Background trails & coverage recording</span
              >
            </li>
            <li class="flex items-center gap-2">
              <Check size={16} style="color: #22c55e;" />
              <span class="text-contrast-content"
                >Rock picking paths & offline replay</span
              >
            </li>
          </ul>

          <div class="mt-auto pt-5">
            <button
              class="group flex w-full items-center justify-center gap-2 rounded-lg bg-secondary px-4 py-2.5 font-medium text-secondary-content shadow-lg shadow-secondary/30 transition-all duration-300 hover:bg-secondary/90 hover:shadow-xl hover:shadow-secondary/40"
              on:click={() => goto("/login?tab=sign_up")}
            >
              Start Free Team Trial
              <ArrowRight
                size={14}
                class="transition-transform group-hover:translate-x-1"
              />
            </button>
            <p class="mt-2 text-center text-xs text-contrast-content/50">
              Cancel anytime
            </p>
          </div>
        </div>
      </div>
    {/if}
  </div>
</section>
