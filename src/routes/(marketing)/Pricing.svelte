<script lang="ts">
  /**
   * Pricing section — V15 "Banner Counter" is the live variant.
   * Other variants are kept below (commented out) for reference.
   */
  // import PricingOriginal from "./pricing/PricingOriginal.svelte"
  // import PricingV3 from "./pricing/PricingV3.svelte"
  // import PricingV6 from "./pricing/PricingV6.svelte"
  // import PricingV10 from "./pricing/PricingV10.svelte"
  // import PricingV11 from "./pricing/PricingV11.svelte"
  // import PricingV12 from "./pricing/PricingV12.svelte"
  // import PricingV13 from "./pricing/PricingV13.svelte"
  // import PricingV14 from "./pricing/PricingV14.svelte"
  import PricingV15 from "./pricing/PricingV15.svelte"

  export let id: string = "pricing"
</script>

<div {id}>
  <PricingV15 />
</div>

<!-- DEV: Uncomment the block below and the imports above to restore the variant switcher
<div class="sticky top-0 z-50 border-b border-warning/30 bg-warning/10 backdrop-blur-sm">
  <div class="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-1.5 px-4 py-2">
    <span class="mr-2 text-xs font-semibold uppercase tracking-wide text-warning-content/70">
      Variant:
    </span>
  </div>
</div>

<div {id}>
  <PricingOriginal />
  <PricingV3 />
  <PricingV6 />
  <PricingV10 />
  <PricingV11 />
  <PricingV12 />
  <PricingV13 />
  <PricingV14 />
  <PricingV15 />
</div>
-->
