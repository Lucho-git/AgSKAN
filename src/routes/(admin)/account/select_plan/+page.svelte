<script lang="ts">
  import PricePlanBox from "$lib/components/general/PricePlanBox.svelte"
  import PricingFAQ from "../../../(marketing)/pricing/PricingFAQ.svelte"
  import PricingPlans from "$lib/components/general/PricingPlans.svelte"

  let currentPlanId = ""
</script>

<svelte:head>
  <title>Select a Plan</title>
</svelte:head>

<div
  class="mb-12 mt-4 flex place-content-center content-center items-center text-center"
>
  <div class="flex w-full flex-col px-6">
    <div>
      <h1 class="mb-6 text-2xl font-bold">Select a Plan</h1>
      <div
        class="mt-0 flex flex-col flex-wrap justify-center gap-10 lg:flex-row"
      >
        <PricingPlans {currentPlanId} />
      </div>
    </div>
  </div>
</div>

<!-- <PricingFAQ /> -->
