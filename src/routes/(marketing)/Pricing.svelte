<script lang="ts">
  import { ArrowRight, Check, ChevronDown, X } from "lucide-svelte"
  import { onMount } from "svelte"
  import { goto } from "$app/navigation"
  import { page } from "$app/stores"

  // Props for configuration
  export let initialInterval: "monthly" | "yearly" = "monthly"
  export let initialMachineCount: number = 1
  export let ignoreUrlParams: boolean = false

  type PricingInterval = "monthly" | "yearly"

  const BASE_PRICE = 45.625
  const CURRENCY_SYMBOL = "A$"

  let mounted = false
  let interval: PricingInterval = initialInterval
  let machineCount = initialMachineCount
  let isDropdownOpen = false
  let isTestDiscount = false

  onMount(() => {
    mounted = true
  })

  // Check for discount code in URL params
  $: {
    if (!ignoreUrlParams) {
      const discountCode = $page.url.searchParams.get("discountcode")
      isTestDiscount = discountCode === "test"
      console.log("Discount code:", discountCode)
      console.log("Is test discount:", isTestDiscount)
    } else {
      isTestDiscount = false
    }
  }

  // Pricing calculations based on your module
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

  // Display calculations (no decimals)
  $: displayPrice =
    interval === "yearly" ? Math.round(totalPrice * 12) : Math.round(totalPrice)
  $: monthlyDisplayPrice = Math.round(totalPrice)
  $: annualMonthlyPayment = Math.round(totalPrice * 12)
  $: discountPercentage = isTestDiscount ? 75 : 33

  const freeFeatures = [
    { text: "Track 1 machine", included: true },
    { text: "Create your own paddock map", included: true },
    { text: "Drop pins & test all features", included: true },
    { text: "Join an existing map", included: true },
    { text: "Basic support", included: true },
    { text: "Invite team members", included: false },
    { text: "Offline tracking & replay", included: false },
    { text: "Shareable map reports", included: false },
  ]

  $: proFeatures = [
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

  function handleMachineCountChange(count: number) {
    machineCount = count
    isDropdownOpen = false
  }

  // Animation delay placeholder
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

<section class="bg-base-200" id="pricing">
  <div class="section-container py-20">
    {#if mounted}
      <div in:animationDelay={0}>
        <h2
          class="mb-6 text-center font-archivo text-3xl font-bold text-contrast-content md:text-4xl"
        >
          <span class="text-base-content">Start Free.</span> Upgrade When You're
          Ready.
        </h2>

        <p class="mx-auto mb-10 max-w-2xl text-center text-contrast-content/70">
          Simple, transparent pricing. Pay only for what you need, cancel
          anytime.
        </p>

        <div
          class="mb-10 flex flex-col items-center justify-center gap-6 md:flex-row"
        >
          <div class="flex flex-col items-center gap-4 md:flex-row">
            <div
              class="relative flex items-center rounded-full bg-base-100 p-1 shadow-md"
            >
              <button
                class={`rounded-full px-6 py-2 text-sm font-medium transition-colors ${
                  interval === "monthly"
                    ? "bg-primary text-primary-content"
                    : "text-base-content/70 hover:text-base-content"
                }`}
                on:click={() => (interval = "monthly")}
              >
                Monthly
              </button>
              <button
                class={`rounded-full px-6 py-2 text-sm font-medium transition-colors ${
                  interval === "yearly"
                    ? "bg-primary text-primary-content"
                    : "text-base-content/70 hover:text-base-content"
                }`}
                on:click={() => (interval = "yearly")}
              >
                Yearly
              </button>

              <!-- Annual savings badge always visible when there are savings -->
              {#if annualSavings > 0}
                <div
                  class="absolute -right-2 -top-2 rounded-full bg-success px-2 py-1 text-xs font-bold text-success-content shadow-md"
                >
                  Save {CURRENCY_SYMBOL}{Math.round(annualSavings)}
                </div>
              {/if}
            </div>
          </div>

          <div class="flex flex-col items-center gap-4 md:flex-row">
            <div
              class="relative flex w-full items-center gap-3 rounded-lg bg-base-100 p-1.5 shadow-md md:w-auto md:p-2"
            >
              <label
                class="whitespace-nowrap pl-2 text-sm font-medium text-base-content"
              >
                Machines to track:
              </label>
              <div class="relative w-full md:w-auto">
                <button
                  class="flex w-full min-w-[120px] items-center justify-between rounded-lg border border-base-300 bg-base-100 px-3 py-1.5 text-sm font-medium text-base-content hover:border-primary/30 md:w-auto"
                  on:click={() => (isDropdownOpen = !isDropdownOpen)}
                >
                  <span
                    >{machineCount} machine{machineCount > 1 ? "s" : ""}</span
                  >
                  <ChevronDown
                    size={16}
                    class={`text-base-content/50 transition-transform duration-300 ${isDropdownOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {#if isDropdownOpen}
                  <div
                    class="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-lg border border-base-300 bg-base-100 shadow-lg"
                  >
                    {#each Array.from({ length: 20 }, (_, i) => i + 1) as count}
                      <button
                        class={`w-full cursor-pointer px-4 py-2 text-left text-sm transition-colors ${
                          machineCount === count
                            ? "bg-primary/10 font-medium text-primary"
                            : "text-base-content hover:bg-base-200"
                        }`}
                        on:click={() => handleMachineCountChange(count)}
                      >
                        {count} machine{count > 1 ? "s" : ""}
                      </button>
                    {/each}
                  </div>
                {/if}
              </div>
            </div>
          </div>
        </div>

        <div class="mx-auto mt-8 grid max-w-4xl gap-8 md:grid-cols-2">
          <!-- Free Plan -->
          <div
            class="order-2 rounded-xl bg-base-100 p-6 shadow-md md:order-1 md:p-8"
            in:animationDelay={100}
          >
            <h3
              class="mb-2 font-archivo text-2xl font-bold text-contrast-content"
            >
              AgSKAN Free
            </h3>

            <div class="mb-6">
              <div class="flex items-end">
                <span class="text-3xl font-bold text-contrast-content"
                  >{CURRENCY_SYMBOL}0</span
                >
                <span class="ml-1 text-contrast-content/60"
                  >/{interval === "monthly" ? "month" : "year"}</span
                >
              </div>

              <div
                class="mt-4 flex items-center gap-2 rounded-lg border border-info/30 bg-info/10 p-2.5"
              >
                <div
                  class="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-info/20 text-info"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M12 16v-4"></path>
                    <path d="M12 8h.01"></path>
                  </svg>
                </div>
                <p class="text-sm font-medium text-info">
                  Great for solo operators or trying it out before the season
                  kicks off.
                </p>
              </div>
            </div>

            <ul class="mb-8 space-y-3">
              {#each freeFeatures as feature}
                <li class="flex items-start gap-3">
                  <div
                    class={`mt-0.5 ${feature.included ? "text-success" : "text-error"}`}
                  >
                    {#if feature.included}
                      <Check size={18} />
                    {:else}
                      <X size={18} />
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

            <button
              class="flex w-full items-center justify-center gap-2 rounded-lg bg-base-200 px-4 py-3 font-medium text-base-content transition-colors hover:bg-base-300"
              on:click={() => goto("/signup")}
            >
              Get Started Free
              <ArrowRight size={16} />
            </button>
          </div>

          <!-- Pro Plan -->
          <div
            class="relative order-1 rounded-xl border-2 border-primary bg-base-100 p-6 shadow-xl md:order-2 md:p-8"
            in:animationDelay={200}
          >
            <div
              class="absolute -top-4 left-0 right-0 mx-auto w-fit rounded-full bg-primary px-3 py-1 text-xs font-bold uppercase text-primary-content"
            >
              Popular
              {#if isTestDiscount}
                <span class="ml-1">• Test Discount</span>
              {/if}
            </div>

            <h3
              class="mb-2 font-archivo text-2xl font-bold text-contrast-content"
            >
              AgSKAN Pro
            </h3>

            <div class="mb-6">
              <div class="flex items-end">
                {#if interval === "monthly"}
                  <span class="text-3xl font-bold text-contrast-content"
                    >{CURRENCY_SYMBOL}{displayPrice}</span
                  >
                  <span class="ml-1 text-contrast-content/60">/month</span>
                {:else}
                  <span class="text-3xl font-bold text-contrast-content"
                    >{CURRENCY_SYMBOL}{monthlyDisplayPrice}</span
                  >
                  <span class="ml-1 text-contrast-content/60">/month</span>
                  <div class="ml-3">
                    <div
                      class="inline-block rounded-md bg-success/20 px-2 py-0.5"
                    >
                      <span
                        class="flex items-center text-sm font-semibold text-success"
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
                  class="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-success text-success-content"
                >
                  <Check size={14} />
                </div>
                <p class="text-sm font-medium text-success">
                  Unlock powerful features for an efficient, fully connected
                  farming operation.
                </p>
              </div>
            </div>

            <ul class="mb-8 space-y-3">
              {#each proFeatures as feature}
                <li class="flex items-start gap-3">
                  <div
                    class={`mt-0.5 ${feature.included ? "text-success" : "text-error"}`}
                  >
                    {#if feature.included}
                      <Check size={18} />
                    {:else}
                      <X size={18} />
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

            <button
              class="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 font-medium text-primary-content transition-colors hover:bg-primary/90"
              on:click={() => goto("/upgrade")}
            >
              Upgrade to Pro
              <ArrowRight size={16} />
            </button>

            <div
              class="mt-4 flex items-center justify-center gap-2 text-contrast-content/60"
            >
              <div class="flex items-center">
                {#each Array(5) as _}
                  <svg
                    class="h-5 w-5 fill-current text-yellow-400"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"
                    />
                  </svg>
                {/each}
              </div>
              <span>Used by 400+ farms worldwide</span>
            </div>
          </div>
        </div>
      </div>
    {/if}
  </div>
</section>
