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

  // Import session management
  import { initializeSession } from "$lib/stores/sessionStore"
  import { browser } from "$app/environment"

  // Handle app updates
  $: if ($updated) {
    toast.info("An update is available. Refresh to see the latest version.", {
      action: {
        label: "Refresh",
        onClick: () => location.reload(),
      },
      duration: 5000000, // 500 seconds in milliseconds
    })
  }

  // Initialize session management
  let unsubscribe: (() => void) | undefined

  onMount(() => {
    if (browser) {
      console.log("Root layout mounted, initializing session")

      // Initialize the session as early as possible
      initializeSession()
        .then((cleanup) => {
          if (cleanup) unsubscribe = cleanup
        })
        .catch((err) => {
          console.error("Failed to initialize session:", err)
        })
    }

    // Clean up on unmount
    return () => {
      if (unsubscribe) {
        console.log("Cleaning up session subscription in root layout")
        unsubscribe()
      }
    }
  })
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
