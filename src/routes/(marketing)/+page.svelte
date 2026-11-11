<script lang="ts">
  import LandingHero from "./landing/LandingHero.svelte"
  import FeatureShowcase from "./landing/FeatureShowcase.svelte"
  import RadioToMap from "./landing/RadioToMap.svelte"
  import UseCases from "./landing/UseCases.svelte"
  import HowItWorks from "./landing/HowItWorks.svelte"
  import Reviews from "./landing/Reviews.svelte"
  import FinalCta from "./landing/FinalCta.svelte"
  import Partners from "./PartnerSection.svelte"
  import QandA from "./QandA.svelte"
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

<svelte:head>
  <title>AgSKAN — One live map for the whole farm crew</title>
  <meta
    name="description"
    content="AgSKAN shows every operator, coverage trail and hazard pin on one live farm map. Works on any phone or tablet with no hardware. Start free."
  />
  <link rel="canonical" href="https://www.skanfarming.com.au/" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link
    rel="preconnect"
    href="https://fonts.gstatic.com"
    crossorigin="anonymous"
  />
  <link
    rel="stylesheet"
    href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500..800&family=JetBrains+Mono:wght@400;500;700&display=swap"
  />
</svelte:head>

<main class="w-full">
  <LandingHero />
  <Partners />
  <FeatureShowcase id="features" />
  <RadioToMap />
  <UseCases id="seasons" />
  <HowItWorks id="setup" />
  <Reviews id="testimonials" />
  <Pricing id="pricing" />
  <QandA id="qanda" />
  <Founders />
  <FinalCta />
</main>
