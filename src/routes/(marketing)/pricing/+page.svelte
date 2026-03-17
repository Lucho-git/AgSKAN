<script lang="ts">
  import PricingSection from "$lib/components/general/PricingSection.svelte"
  export let currentPlanId: string | null = null
</script>

<div class="container mx-auto px-4">
  <div class="py-16">
    <PricingSection
      {currentPlanId}
      ignoreUrlParams={true}
    />
  </div>
</div>
