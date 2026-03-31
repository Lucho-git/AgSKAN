<!-- src/lib/components/general/PricingPlans.svelte -->
<script lang="ts">
  import { writable } from "svelte/store"
  import PricePlanBox from "./PricePlanBox.svelte"
  import { slide } from "svelte/transition"

  export let currentPlanId: string | null = null

  const billingPeriod = writable<"monthly" | "yearly">("yearly")
  const useFullPrice = writable(true)
  const standardPriceId = "price_1TH522K3At0l0k1HVQWZXNFa"
  const testPriceId = "price_1TBWz2K3At0l0k1H7fXrH3nf"

  const additionalDiscountActive = false // Set this to false when the promotion ends

  $: stripe_price_id = standardPriceId

  const pricingPlans = [
    {
      id: "free",
      name: "🚜SKAN Member",
      description:
        "Join an existing map as an operator, or test out our features free",
      price: {
        monthly: { original: "Free", discounted: "Free" },
        yearly: { original: "Free", discounted: "Free" },
      },
      priceIntervalName: {
        monthly: "no credit card required",
        yearly: "no credit card required",
      },
      stripe_price_id: {
        monthly: null as string | null,
        yearly: null as string | null,
      },
      features: [
        "Join other maps with unlimited resources",
        "1 Map Creation",
        "100 active pin drops",
        "100 000 Trail tokens",
        "Real time location updates",
      ],
      style: "bg-gray-100 border-gray-200",
    },
    {
      id: "pro",
      name: "⭐ SKAN Founder",
      description:
        "Invite other users to your map, completely adjustable # of seats",
      price: {
        monthly: { original: "$45", discounted: "$45" },
        yearly: { original: "$45", discounted: "$30.4" },
      },
      priceIntervalName: { monthly: "per month", yearly: "per year" },
      stripe_price_id: {
        monthly: standardPriceId,
        yearly: standardPriceId,
      },
      stripe_product_id: "prod_U9qgyqB2m0KN8p",
      features: [
        "Invite others to share your map",
        "Customizable # of seats",
        "Unlimited map creation",
        "Unlimited pin drops",
        "Unlimited Trail credits",
        "All vehicles unlocked",
      ],
      style: "bg-blue-100 border-blue-300",
    },
  ]

  $: annualDiscount = pricingPlans.some(
    (plan) =>
      plan.price.yearly &&
      plan.price.yearly.discounted &&
      plan.price.yearly.original,
  )
    ? Math.round(
        (1 -
          (parseFloat(
            pricingPlans[1].price.yearly.discounted.replace("$", ""),
          ) *
            (additionalDiscountActive ? 0.5 : 1)) /
            parseFloat(
              pricingPlans[1].price.yearly.original.replace("$", ""),
            )) *
          100,
      )
    : 0

  function toggleBillingPeriod() {
    billingPeriod.update((current) =>
      current === "monthly" ? "yearly" : "monthly",
    )
  }

  function toggleFullPrice() {
    useFullPrice.update((current) => !current)
    console.log("useFullPrice", stripe_price_id)
  }
</script>

<div class="relative z-0 my-8 w-full">
  <div class="relative z-0 mb-8 flex justify-center">
    <button
      type="button"
      class="relative flex cursor-pointer items-center rounded-full bg-gray-300 p-1"
      on:click={toggleBillingPeriod}
      on:keydown={(e) => e.key === "Enter" && toggleBillingPeriod()}
      aria-label="Toggle billing period"
      role="switch"
      aria-checked={$billingPeriod === "yearly"}
    >
      {#key $billingPeriod}
        <div
          class="absolute h-8 w-32 rounded-full bg-primary"
          style="transform: translateX({$billingPeriod === 'yearly'
            ? '100%'
            : '0'});"
          transition:slide={{ duration: 300 }}
        ></div>
      {/key}
      <span
        class="relative z-0 flex h-8 w-32 items-center justify-center rounded-full text-sm"
        class:text-white={$billingPeriod === "monthly"}
      >
        Monthly
      </span>
      <span
        class="relative z-0 flex h-8 w-32 items-center justify-center rounded-full text-sm"
        class:text-white={$billingPeriod === "yearly"}
      >
        Annually
        {#if annualDiscount > 0}
          <span class="badge badge-secondary absolute -right-4 -top-3 text-xs">
            Save {annualDiscount}%
          </span>
        {/if}
      </span>
    </button>
  </div>

  <div class="mt-12 flex justify-center">
    <div class="flex max-w-4xl flex-col items-center gap-10 lg:flex-row">
      {#each pricingPlans as plan}
        <div
          class="{plan.id === 'pro'
            ? 'order-first'
            : 'order-last'} lg:order-none"
        >
          <PricePlanBox
            plan={{
              ...plan,
              stripe_price_id:
                typeof plan.stripe_price_id === "object"
                  ? plan.stripe_price_id[$billingPeriod]
                  : plan.stripe_price_id,
            }}
            billingPeriod={$billingPeriod}
            isCurrentPlan={plan.id === currentPlanId}
            callToAction={plan.id === "free" ? "Get Started" : "Upgrade"}
            useFullPrice={$useFullPrice}
            {annualDiscount}
            {additionalDiscountActive}
          />
        </div>
      {/each}
    </div>
  </div>
</div>
