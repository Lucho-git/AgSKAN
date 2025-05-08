<script lang="ts">
  import "../app.css" // Global styles
  import "../app.pcss" // Global PostCSS styles, if any

  import { navigating, updated } from "$app/stores"
  import { expoOut } from "svelte/easing"
  import { slide } from "svelte/transition"

  // Font imports
  import "@fontsource/archivo/400.css"
  import "@fontsource/archivo/700.css"
  import "@fontsource/archivo/800.css"
  import "@fontsource/archivo/900.css"
  import "@fontsource/roboto/400.css"
  import "@fontsource/roboto/700.css"

  import { Toaster, toast } from "svelte-sonner"
  import { onMount } from "svelte"
  import { browser } from "$app/environment"

  // Session management
  import { initializeSession } from "$lib/stores/sessionStore"

  // Capacitor imports
  import { Capacitor } from "@capacitor/core"
  import { StatusBar, Style as StatusBarStyle } from "@capacitor/status-bar"

  // Handle app updates
  $: if ($updated) {
    toast.info("An update is available. Refresh to see the latest version.", {
      action: {
        label: "Refresh",
        onClick: () => window.location.reload(),
      },
      duration: 5000000,
    })
  }

  // Initialize session management
  let unsubscribeSession: (() => void) | undefined

  onMount(async () => {
    console.log("+++++ ROOT LAYOUT ONMOUNT FIRING +++++")

    if (browser) {
      console.log("Root layout mounted, initializing session")
      initializeSession()
        .then((cleanup) => {
          if (cleanup) unsubscribeSession = cleanup
        })
        .catch((err) => {
          console.error("Failed to initialize session:", err)
        })
    }

    // --- CAPACITOR NATIVE CONFIGURATION (SAFE AREA & SYSTEM BARS) ---
    if (Capacitor.isNativePlatform()) {
      console.log(
        "+++++ NATIVE PLATFORM: ATTEMPTING DIRECT STATUS BAR CONFIG +++++",
      )
      try {
        await StatusBar.show()
        console.log("StatusBar.show() called.")

        await StatusBar.setOverlaysWebView({ overlay: false })
        console.log(
          "StatusBar.setOverlaysWebView({ overlay: false }) CALLED. Result should be no overlay.",
        )

        // Now StatusBarStyle is defined
        await StatusBar.setStyle({ style: StatusBarStyle.Dark })
        console.log(
          "StatusBar.setStyle({ style: StatusBarStyle.Dark }) called.",
        )

        await StatusBar.setBackgroundColor({ color: "#f9e58a" })
        console.log(
          "StatusBar.setBackgroundColor({ color: '#f9e58a' }) called.",
        )

        console.log(
          "Simplified StatusBar config applied. Overlay should be FALSE.",
        )
      } catch (e) {
        console.error("Error in simplified StatusBar config:", e) // Check if any errors are logged here
      }
    }
    // --- END CAPACITOR NATIVE CONFIGURATION ---

    return () => {
      if (unsubscribeSession) {
        console.log("Cleaning up session subscription in root layout")
        unsubscribeSession()
      }
    }
  })
</script>

<main data-sveltekit-reload={$updated ? "" : "off"}>
  {#if $navigating}
    <div
      class="fixed left-0 right-0 top-0 z-50 h-1 w-full bg-primary"
      transition:slide={{
        delay: 100,
        duration: 12000,
        axis: "x",
        easing: expoOut,
      }}
    ></div>
  {/if}
  <slot />
  <Toaster expand={true} position="top-center" richColors />
</main>

<!--
    CSS custom properties like --ion-safe-area-top, --ion-safe-area-bottom, etc.,
    will be set on the documentElement (<html> tag) by the SafeArea plugin logic above.
    Your individual components and other layouts (like the account layout's top bar,
    bottom navigation, or sidebars) will need to use these CSS variables
    (e.g., padding-top: var(--ion-safe-area-top);) to adjust their spacing
    and avoid being obscured by the system bars.
  -->
