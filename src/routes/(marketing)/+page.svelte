<script lang="ts">
  import Hero from "./Hero.svelte"
  import Features from "./Features.svelte"
  import Agskan from "./Agskan.svelte"
  import PaddockPath from "./PaddockPath.svelte"
  import Partners from "./PartnerSection.svelte"
  import QandA from "./QandA.svelte"
  import ProblemSolution from "./ProblemSolution.svelte"
  import SignupSection from "./SignupSection.svelte"
  import Setup from "./Setup.svelte"
  import Testimonials from "./Testimonials.svelte"
  import Pricing from "./Pricing.svelte"
  import { onMount } from "svelte"
  import { afterNavigate } from "$app/navigation"
  import { browser } from "$app/environment"

  // Function to reset focus and scroll
  const resetFocusAndScroll = () => {
    if (browser) {
      window.scrollTo(0, 0)
      document.activeElement?.blur()
    }
  }

  // Handle after navigation
  afterNavigate(() => {
    resetFocusAndScroll()
  })

  // Handle initial mount
  onMount(() => {
    resetFocusAndScroll()

    // Additional safety measure
    if (browser) {
      setTimeout(resetFocusAndScroll, 0)
    }
  })
</script>

<main class="w-full">
  <Hero />
  <Partners />

  <Agskan />
  <ProblemSolution />
  <Setup />
  <Testimonials />
  <Pricing />
  <QandA />
  <!-- <SignupSection /> -->
</main>
