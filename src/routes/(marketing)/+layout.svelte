<script lang="ts">
  import "../../app.css"
  import Navbar from "./Navbar.svelte"
  import OgNavbar from "./OGNavbar.svelte"
  import Footer from "./Footer.svelte"

  export let data
</script>

<svelte:head>
  <script src="https://t.contentsquare.net/uxa/e5382af3aa047.js"></script>
</svelte:head>

<div class="min-h-screen bg-background">
  <OgNavbar />
  <slot />
  <Footer />
</div>
