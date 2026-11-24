<!--
  The new public site, kept beside the live one until it takes over.

  Everything in this (next) group is a preview: the new landing page at
  /landing-preview, the new sign-in screen at /login-preview, and the
  onboarding and map prototypes at /onboarding-preview and /map-preview.
  Nothing on the live site links to them, and search engines are asked to
  leave them alone. The live landing page, layout and sign-in are still the
  ones in (marketing).

  To switch over: this layout replaces (marketing)/+layout.svelte,
  landing-preview/+page.svelte replaces (marketing)/+page.svelte, and
  login-preview/+layout.svelte and +page.svelte replace the two in
  (marketing)/login. (The shared pieces they are built from already live in
  (marketing)/landing and (marketing)/SiteNav.svelte.)
-->
<script lang="ts">
  import "../../app.css"
  import "../(marketing)/landing/landing-theme.css"
  import { page } from "$app/stores"
  import SiteNav from "../(marketing)/SiteNav.svelte"
  import Footer from "../(marketing)/Footer.svelte"

  // Sign-in pages are a single focused task: no footer, pared-back header.
  $: isAuthPage = $page.url.pathname.startsWith("/login-preview")
  // The onboarding and map prototypes bring their own chrome.
  $: isBare =
    $page.url.pathname.startsWith("/onboarding-preview") ||
    $page.url.pathname.startsWith("/map-preview")
</script>

<svelte:head>
  <meta name="robots" content="noindex, nofollow" />
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
