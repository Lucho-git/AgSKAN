<script lang="ts">
  /**
   * Pricing section wrapper — toggle between design variations.
   * Add ?variant=3|6|10|11 to the URL, or use the floating dev toggle.
   */
  import PricingOriginal from "./pricing/PricingOriginal.svelte"
  import PricingV3 from "./pricing/PricingV3.svelte"
  import PricingV6 from "./pricing/PricingV6.svelte"
  import PricingV10 from "./pricing/PricingV10.svelte"
  import PricingV11 from "./pricing/PricingV11.svelte"
  import PricingV12 from "./pricing/PricingV12.svelte"
  import PricingV13 from "./pricing/PricingV13.svelte"
  import PricingV14 from "./pricing/PricingV14.svelte"
  import { page } from "$app/stores"
  import { browser } from "$app/environment"

  export let id: string = "pricing"

  type Variant = "original" | "3" | "6" | "10" | "11" | "12" | "13" | "14"

  const variants: { key: Variant; label: string; description: string }[] = [
    { key: "original", label: "Original", description: "Current design (monthly/yearly toggle, Free vs Pro)" },
    { key: "3", label: "V3 — Stacked Hero", description: "Giant price + 3 highlight cards + feature grid" },
    { key: "6", label: "V6 — Banner", description: "Horizontal banner with inline CTA + feature grid" },
    { key: "10", label: "V10 — Two Cards", description: "Balanced Free + Pro cards side by side" },
    { key: "11", label: "V11 — Counter", description: "Interactive operator counter with per-seat breakdown" },
    { key: "12", label: "V12 — Two Rows", description: "Two thin horizontal banners stacked: Pro + Free" },
    { key: "13", label: "V13 — Banner+Free", description: "V6 banner + strong free section with features" },
    { key: "14", label: "V14 — Free First", description: "Free hero banner top, Pro upsell below" },
  ]

  const validKeys = variants.map((v) => v.key)

  // Default to V11; override via ?variant= URL param
  let activeVariant: Variant = "11"

  $: {
    if (browser) {
      const param = $page.url.searchParams.get("variant")
      if (param && validKeys.includes(param as Variant)) {
        activeVariant = param as Variant
      }
    }
  }
</script>

<!-- Floating variant toggle (dev helper — remove when you've picked a winner) -->
<div class="sticky top-0 z-50 border-b border-warning/30 bg-warning/10 backdrop-blur-sm">
  <div class="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-1.5 px-4 py-2">
    <span class="mr-2 text-xs font-semibold uppercase tracking-wide text-warning-content/70">
      Variant:
    </span>
    {#each variants as v}
      <button
        class={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
          activeVariant === v.key
            ? "bg-base-content text-base-100 shadow-sm"
            : "bg-base-100/80 text-base-content/70 hover:bg-base-100 hover:text-base-content"
        }`}
        title={v.description}
        on:click={() => (activeVariant = v.key)}
      >
        {v.label}
      </button>
    {/each}
  </div>
</div>

<div {id}>
  {#if activeVariant === "original"}
    <PricingOriginal />
  {:else if activeVariant === "3"}
    <PricingV3 />
  {:else if activeVariant === "6"}
    <PricingV6 />
  {:else if activeVariant === "10"}
    <PricingV10 />
  {:else if activeVariant === "11"}
    <PricingV11 />
  {:else if activeVariant === "12"}
    <PricingV12 />
  {:else if activeVariant === "13"}
    <PricingV13 />
  {:else if activeVariant === "14"}
    <PricingV14 />
  {/if}
</div>
