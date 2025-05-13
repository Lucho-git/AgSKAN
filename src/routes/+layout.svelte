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
  import { EdgeToEdge } from "@capawesome/capacitor-android-edge-to-edge-support"

  // --- Theme Colors for System Bars ---
  const appSystemLightMode_Bars_BackgroundColor = "#102030" // Your Dark Gray
  const appSystemDarkMode_Bars_BackgroundColor = "#f9e58a" // Your Yellow

  // --- Function to Apply Native Theme Styles (Corrected and Simplified) ---
  async function applyNativeThemeStyles(isSystemDarkMode: boolean) {
    if (!Capacitor.isNativePlatform()) {
      console.log("Not a native platform. Skipping native theme styles.")
      return
    }

    try {
      const systemBarsBackgroundColorToSet = isSystemDarkMode
        ? appSystemDarkMode_Bars_BackgroundColor // System DARK => YELLOW background
        : appSystemLightMode_Bars_BackgroundColor // System LIGHT => DARK GRAY background

      console.log(`System is in ${isSystemDarkMode ? "DARK" : "LIGHT"} mode.`)
      console.log(
        `  Setting system bars background color (top & bottom) via EdgeToEdge to: ${systemBarsBackgroundColorToSet}`,
      )

      // 1. Set background using EdgeToEdge plugin (for both bars)
      await EdgeToEdge.setBackgroundColor({
        color: systemBarsBackgroundColorToSet,
      })
      console.log("  EdgeToEdge.setBackgroundColor called.")

      // 2. Determine and apply desired icon/text styles FOR THE STATUS BAR ONLY
      let newCapacitorStatusBarStyle: StatusBarStyle

      if (isSystemDarkMode) {
        // SYSTEM is DARK MODE (App uses YELLOW background #f9e58a)
        // We want DARK text/icons for the status bar.
        newCapacitorStatusBarStyle = StatusBarStyle.Light // Style.Dark SETS STATUS BAR ICONS TO DARK
        console.log("  Applying DARK text/icons theme to STATUS BAR.")
        console.log(
          "    Status Bar Style (Capacitor): Style.Dark (sets status bar icons to dark)",
        )
      } else {
        // SYSTEM is LIGHT MODE (App uses DARK GRAY background #102030)
        // We want LIGHT text/icons for the status bar.
        newCapacitorStatusBarStyle = StatusBarStyle.Dark // Style.Light SETS STATUS BAR ICONS TO LIGHT
        console.log("  Applying LIGHT text/icons theme to STATUS BAR.")
        console.log(
          "    Status Bar Style (Capacitor): Style.Light (sets status bar icons to light)",
        )
      }

      // 3. Apply style to the TOP status bar using @capacitor/status-bar
      await StatusBar.setStyle({ style: newCapacitorStatusBarStyle })
      console.log(
        `  Capacitor StatusBar.setStyle called with: ${newCapacitorStatusBarStyle === StatusBarStyle.Light ? "Style.Light" : "Style.Dark"}`,
      )

      // NOTE: There is NO JS function from EITHER plugin to directly set navigation bar ICON style.
      // We rely on the Android system's default behavior or theme settings for navigation bar icon color
      // based on the background color set by EdgeToEdge.setBackgroundColor().
      console.log(
        "  Navigation bar icon style relies on system behavior / Android theme based on background color.",
      )

      // 4. Ensure status bar remains visible
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
      "+++++ ROOT LAYOUT ONMOUNT (Corrected - EdgeToEdge BG + Capacitor StatusBar Style ONLY) +++++",
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
          await applyNativeThemeStyles(darkModeMediaQuery.matches)

          darkModeMediaQuery.addEventListener("change", handleSystemThemeChange)
          console.log("Added listener for system theme changes.")
        } else {
          console.warn(
            "window.matchMedia is not available. Cannot detect system theme. Applying styles for system light mode as default.",
          )
          await applyNativeThemeStyles(false)
        }

        const insets = await EdgeToEdge.getInsets()
        console.log(
          "EdgeToEdge Insets (statusBar, navigationBar, etc.):",
          JSON.stringify(insets),
        )
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
