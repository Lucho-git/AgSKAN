<script lang="ts">
  import "../app.css"
  import { navigating, updated } from "$app/stores"
  import { expoOut } from "svelte/easing"
  import { slide } from "svelte/transition"
  import "@fontsource/archivo/400.css"
  import "@fontsource/archivo/700.css"
  import "@fontsource/archivo/800.css"
  import "@fontsource/archivo/900.css"

  import "@fontsource/roboto/400.css"
  import "@fontsource/roboto/700.css"

  import { Toaster, toast } from "svelte-sonner"

  import { onMount } from "svelte"
  import "../app.pcss"
  import { ModeWatcher } from "mode-watcher"

  $: if ($updated) {
    toast.info("An update is available. Refresh to see the latest version.", {
      action: {
        label: "Refresh",
        onClick: () => location.reload(),
      },
      duration: 5000000, // 500 seconds in milliseconds
    })
  }
</script>

<main data-sveltekit-reload={$updated ? "" : "off"}>
  {#if $navigating}
    <div
      class="fixed left-0 right-0 top-0 z-50 h-1 w-full bg-primary"
      in:slide={{ delay: 100, duration: 12000, axis: "x", easing: expoOut }}
    ></div>
  {/if}
  <!-- <ModeWatcher /> -->

  <slot />

  <Toaster expand={true} position="top-center" richColors />
</main>
