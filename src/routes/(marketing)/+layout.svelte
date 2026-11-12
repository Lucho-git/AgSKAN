<script lang="ts">
  import "../../app.css"
  import "./landing/landing-theme.css"
  import { page } from "$app/stores"
  import SiteNav from "./SiteNav.svelte"
  import Footer from "./Footer.svelte"

  export let data

  // Sign-in pages are a single focused task: no footer, pared-back header.
  $: isAuthPage =
    $page.url.pathname.startsWith("/login") ||
    $page.url.pathname.startsWith("/reset-password")
  // The onboarding and map prototypes bring their own chrome.
  $: isBare =
    $page.url.pathname.startsWith("/onboarding-preview") ||
    $page.url.pathname.startsWith("/map-preview")
</script>

<svelte:head>
  <script src="https://t.contentsquare.net/uxa/e5382af3aa047.js"></script>
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

<!-- .lp-theme carries the marketing palette (see landing/landing-theme.css) -->
<div class="lp-theme flex min-h-screen flex-col bg-background">
  {#if !isBare}
    <SiteNav minimal={isAuthPage} />
  {/if}
  <slot />
  {#if !isAuthPage && !isBare}
    <Footer />
  {/if}
</div>
