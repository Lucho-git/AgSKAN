<script lang="ts">
  import "../../app.css"
  import "./landing/landing-theme.css"
  import { page } from "$app/stores"
  import Navbar from "./Navbar.svelte"
  import OgNavbar from "./OGNavbar.svelte"
  import Footer from "./Footer.svelte"

  export let data

  // The redesigned home page carries its own palette (see landing-theme.css).
  $: isLanding = $page.url.pathname === "/"
</script>

<svelte:head>
  <script src="https://t.contentsquare.net/uxa/e5382af3aa047.js"></script>
</svelte:head>

<div class="min-h-screen bg-background" class:lp-theme={isLanding}>
  <OgNavbar />
  <slot />
  <Footer />
</div>
