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
  import { StatusBar } from "@capacitor/status-bar" // For StatusBar.show()
  import { EdgeToEdge } from "@capawesome/capacitor-android-edge-to-edge-support"

  // --- Theme Colors for System Bars ---
  // This color is used for system bar BACKGROUNDS when the SYSTEM is in LIGHT mode.
  const appSystemLightMode_Bars_BackgroundColor = "#102030" // Your Dark Gray

  // This color is used for system bar BACKGROUNDS when the SYSTEM is in DARK mode.
  const appSystemDarkMode_Bars_BackgroundColor = "#f9e58a" // Your Yellow

  // --- Function to Apply Native Theme Styles ---
  async function applyNativeThemeStyles(isSystemDarkMode: boolean) {
    if (!Capacitor.isNativePlatform()) {
      console.log("Not a native platform. Skipping native theme styles.")
      return
    }

    try {
      // Determine the BACKGROUND color for both system bars.
      // EdgeToEdge.setBackgroundColor applies this to both top status bar and bottom navigation bar.
      const systemBarsBackgroundColorToSet = isSystemDarkMode
        ? appSystemDarkMode_Bars_BackgroundColor // System DARK => App's "Dark Mode" => YELLOW background
        : appSystemLightMode_Bars_BackgroundColor // System LIGHT => App's "Light Mode" => DARK GRAY background

      // Determine the ICON/TEXT style for both system bars.
      // This logic directly implements your request:
      // - Dark Mode (yellow BG) => DARK (black) text/icons
      // - Light Mode (dark gray BG) => LIGHT (white) text/icons
      const newSystemBarIconStyle: "DARK" | "LIGHT" = isSystemDarkMode
        ? "DARK" // For YELLOW background (app's dark mode), use DARK text/icons.
        : "LIGHT" // For DARK GRAY background (app's light mode), use LIGHT text/icons.

      console.log(`System is in ${isSystemDarkMode ? "DARK" : "LIGHT"} mode.`)
      console.log(
        `  Setting system bars background color (top & bottom) to: ${systemBarsBackgroundColorToSet}`,
      )
      console.log(
        `  Setting system bars icon/text style (top & bottom) to: ${newSystemBarIconStyle}`,
      )

      // Apply the unified background color to both bars.
      await EdgeToEdge.setBackgroundColor({
        color: systemBarsBackgroundColorToSet,
      })
      console.log("  EdgeToEdge.setBackgroundColor called.")

      // Apply the determined icon/text style to the TOP status bar.
      await EdgeToEdge.setStatusBarStyle({ style: newSystemBarIconStyle })
      console.log("  EdgeToEdge.setStatusBarStyle called.")

      // Apply the SAME determined icon/text style to the BOTTOM navigation bar.
      await EdgeToEdge.setNavigationBarStyle({ style: newSystemBarIconStyle })
      console.log("  EdgeToEdge.setNavigationBarStyle called.")

      // Ensure status bar remains visible (primarily for the top status bar).
      await StatusBar.show()
      console.log("  StatusBar.show() called to ensure visibility.")
    } catch (error) {
      console.error("Error applying native theme styles:", error)
    }
  }

  // --- App Update Handling ---
  $: if ($updated) {
    toast.info("An update is available. Refresh to see the latest version.", {
      action: {
        label: "Refresh",
        onClick: () => window.location.reload(),
      },
      duration: 5000000,
    })
  }

  // --- Component Lifecycle & Native Setup ---
  let unsubscribeSession: (() => void) | undefined
  let darkModeMediaQuery: MediaQueryList | undefined

  const handleSystemThemeChange = (event: MediaQueryListEvent) => {
    console.log(
      "System theme changed event. New state - is dark mode:",
      event.matches,
    )
    applyNativeThemeStyles(event.matches)
  }

  onMount(async () => {
    console.log(
      "+++++ ROOT LAYOUT ONMOUNT (using @capawesome/capacitor-android-edge-to-edge-support) +++++",
    )

    if (browser) {
      console.log("Root layout mounted in browser, initializing session.")
      initializeSession()
        .then((cleanup) => {
          if (cleanup) unsubscribeSession = cleanup
        })
        .catch((err) => {
          console.error("Failed to initialize session:", err)
        })
    }

    if (Capacitor.isNativePlatform()) {
      console.log(
        "+++++ NATIVE PLATFORM DETECTED. CONFIGURING EDGE-TO-EDGE AND SYSTEM BARS +++++",
      )
      try {
        console.log("Attempting to enable EdgeToEdge plugin...")
        await EdgeToEdge.enable()
        console.log("EdgeToEdge.enable() successful.")

        if (window.matchMedia) {
          darkModeMediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
          console.log(
            "Initial system dark mode preference. Is dark mode:",
            darkModeMediaQuery.matches,
          )
          await applyNativeThemeStyles(darkModeMediaQuery.matches) // Apply styles based on initial system theme

          darkModeMediaQuery.addEventListener("change", handleSystemThemeChange)
          console.log("Added listener for system theme changes.")
        } else {
          console.warn(
            "window.matchMedia is not available. Cannot detect system theme. Applying styles for system light mode as default.",
          )
          await applyNativeThemeStyles(false) // Default to styles for system light mode
        }

        const insets = await EdgeToEdge.getInsets()
        console.log(
          "EdgeToEdge Insets (statusBar, navigationBar, etc.):",
          JSON.stringify(insets),
        )
        // document.documentElement.style.setProperty('--status-bar-height', `${insets.statusBar}px`);
      } catch (e) {
        console.error(
          "Error during native platform setup (EdgeToEdge/SystemBars):",
          e,
        )
      }
    } else {
      console.log("Not a native platform. Skipping native configuration.")
    }

    return () => {
      if (unsubscribeSession) {
        console.log("Cleaning up session subscription in root layout.")
        unsubscribeSession()
      }
      if (Capacitor.isNativePlatform() && darkModeMediaQuery) {
        darkModeMediaQuery.removeEventListener(
          "change",
          handleSystemThemeChange,
        )
        console.log("Removed system theme change listener.")
      }
    }
  })
</script>

<main data-sveltekit-reload={$updated ? "" : "off"}>
  {#if $navigating}
    <div
      class="fixed left-0 right-0 top-0 z-50 h-1 w-full bg-primary"
      style="z-index: 9999; top: var(--status-bar-height, env(safe-area-inset-top, 0px));"
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
