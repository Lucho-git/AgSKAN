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

  // Tracks the last hash we actually scrolled to. SvelteKit's `replaceState`
  // (used by the navbar) re-emits the `$page` store with the OLD url, which
  // would otherwise re-trigger this handler and smooth-scroll back to the
  // previous section - fighting the navbar's own scroll. Only scroll when the
  // hash has actually changed.
  let lastHandledHash = ""

  // Handle hash scrolling after components are mounted
  const handleHashScroll = async () => {
    if (!browser) return

    const hash = $page.url.hash
    if (!hash || hash === lastHandledHash) return

    lastHandledHash = hash
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

  // Handle after navigation
  afterNavigate(() => {
    if (!$page.url.hash) {
      // Leaving a hashed section - allow a future return to the same hash to
      // scroll again.
      lastHandledHash = ""
      resetFocusAndScroll()
    } else {
      // Don't reset scroll if there's a hash - let handleHashScroll handle it
      handleHashScroll()
    }
  })

  // Handle initial mount
  onMount(() => {
    if (!$page.url.hash) {
      lastHandledHash = ""
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

  <Testimonials />
  <Partners />

  <Pricing id="pricing" />
  <QandA id="qanda" />
  <Founders />
  <!-- <SignupSection /> -->
</main>
