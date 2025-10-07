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
  import Founders from "./Founders.svelte"
  import { onMount, tick } from "svelte"
  import { afterNavigate } from "$app/navigation"
  import { browser } from "$app/environment"
  import { page } from "$app/stores"

  // Function to reset focus and scroll
  const resetFocusAndScroll = () => {
    if (browser) {
      window.scrollTo(0, 0)
      document.activeElement?.blur()
    }
  }

  // Handle hash scrolling after components are mounted
  const handleHashScroll = async () => {
    if (!browser) return

    const hash = $page.url.hash
    if (hash) {
      const elementId = hash.substring(1) // Remove the #

      // Wait for all components to be fully rendered
      await tick()

      // Additional small delay to ensure DOM is ready
      setTimeout(() => {
        const element = document.getElementById(elementId)
        if (element) {
          element.scrollIntoView({
            behavior: "smooth",
            block: "start",
          })
        }
      }, 300) // Longer delay for cross-page navigation
    }
  }

  // Handle after navigation
  afterNavigate(() => {
    if (!$page.url.hash) {
      resetFocusAndScroll()
    } else {
      // Don't reset scroll if there's a hash - let handleHashScroll handle it
      handleHashScroll()
    }
  })

  // Handle initial mount
  onMount(() => {
    if (!$page.url.hash) {
      resetFocusAndScroll()
    } else {
      // Handle hash on initial load
      handleHashScroll()
    }

    // Additional safety measure
    if (browser) {
      setTimeout(() => {
        if (!$page.url.hash) {
          resetFocusAndScroll()
        }
      }, 0)
    }
  })

  // React to hash changes (when already on the page)
  $: if ($page.url.hash && browser) {
    handleHashScroll()
  }
</script>

<main class="w-full">
  <Hero />
  <Agskan />
  <ProblemSolution />
  <Setup id="setup" />
  <Partners />

  <Testimonials />
  <Pricing id="pricing" />
  <QandA id="qanda" />
  <Founders />
  <!-- <SignupSection /> -->
</main>
