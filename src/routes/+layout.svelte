<script lang="ts">
  import "../app.css" // Global styles
  import "../app.pcss" // Global PostCSS styles, if any

  import { navigating, updated } from "$app/stores"
  import { expoOut } from "svelte/easing"
  import { slide } from "svelte/transition"

  import { Toaster, toast } from "svelte-sonner"
  import { onMount } from "svelte"
  import { browser } from "$app/environment"
  import { goto } from "$app/navigation"

  // Session management
  import { initializeSession } from "$lib/stores/sessionStore"

  // Capacitor imports
  import { Capacitor } from "@capacitor/core"
  import { StatusBar, Style as StatusBarStyle } from "@capacitor/status-bar"
  import { SplashScreen } from "@capacitor/splash-screen"
  import { App } from "@capacitor/app"

  // Supabase import - you'll need to import your supabase client
  // Adjust this import path based on your setup
  import { supabase } from "$lib/stores/sessionStore"

  // --- Theme Colors for System Bars ---
  const appSystemLightMode_Bars_BackgroundColor = "#102030" // Your Dark Gray
  const appSystemDarkMode_Bars_BackgroundColor = "#f9e58a" // Your Yellow

  // --- Deep Link Handler Functions ---
  function handleDeepLink(urlString: string) {
    console.log("🔗 Deep link received:", urlString)

    // Add iOS-specific delay to ensure app is fully loaded
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    const delay = isIOS ? 500 : 0

    setTimeout(() => {
      try {
        if (urlString.startsWith("agskan://")) {
          const urlWithoutProtocol = urlString.replace("agskan://", "")
          const [pathPart, queryPart] = urlWithoutProtocol.split("?")

          console.log("📋 Deep link parsed:", {
            pathPart,
            queryPart,
            originalUrl: urlString,
            delayUsed: delay,
          })

          if (pathPart === "auth" && queryPart) {
            const params = new URLSearchParams(queryPart)
            const token = params.get("token")
            const userId = params.get("userId")
            const refreshToken = params.get("refresh_token")

            console.log("🔍 Auth parameters:", {
              hasToken: !!token,
              hasUserId: !!userId,
              hasRefreshToken: !!refreshToken,
              tokenLength: token?.length || 0,
            })

            if (token && userId && refreshToken) {
              console.log("✅ Redirecting to auth callback after delay")

              const callbackUrl = `/auth/callback?access_token=${encodeURIComponent(token)}&refresh_token=${encodeURIComponent(refreshToken)}&type=recovery&next=/account`
              goto(callbackUrl)
            } else {
              console.error("❌ Missing auth parameters")
              toast.error("Authentication failed - missing data")
            }
          }
        }
      } catch (error) {
        console.error("💥 Deep link parsing error:", error)
      }
    }, delay)
  }

  // --- Function to Apply Native Theme Styles (iOS handled natively, Android via JS) ---
  async function applyNativeThemeStyles(isSystemDarkMode: boolean) {
    if (!Capacitor.isNativePlatform()) {
      console.log("Not a native platform. Skipping native theme styles.")
      return
    }

    const platform = Capacitor.getPlatform()
    console.log(
      `System is in ${isSystemDarkMode ? "DARK" : "LIGHT"} mode on ${platform}.`,
    )

    try {
      // Only handle Android with JavaScript
      if (platform === "android") {
        const systemBarsBackgroundColorToSet = isSystemDarkMode
          ? appSystemDarkMode_Bars_BackgroundColor // System DARK => YELLOW background
          : appSystemLightMode_Bars_BackgroundColor // System LIGHT => DARK GRAY background

        console.log(
          `  Setting Android system bars background color (top & bottom) via EdgeToEdge to: ${systemBarsBackgroundColorToSet}`,
        )

        try {
          // Dynamically import the EdgeToEdge plugin - only used on Android
          const { EdgeToEdge } = await import(
            "@capawesome/capacitor-android-edge-to-edge-support"
          )
          // Set background using EdgeToEdge plugin (for both bars)
          await EdgeToEdge.setBackgroundColor({
            color: systemBarsBackgroundColorToSet,
          })
          console.log("  EdgeToEdge.setBackgroundColor called for Android.")
        } catch (edgeError) {
          console.error("EdgeToEdge error (Android only):", edgeError)
        }

        // Determine and apply desired icon/text styles for Android STATUS BAR
        let newCapacitorStatusBarStyle: StatusBarStyle

        if (isSystemDarkMode) {
          // SYSTEM is DARK MODE (App uses YELLOW background #f9e58a)
          // We want DARK text/icons for the status bar.
          newCapacitorStatusBarStyle = StatusBarStyle.Dark // Dark = black text/icons
          console.log("  Applying DARK text/icons theme to Android STATUS BAR.")
        } else {
          // SYSTEM is LIGHT MODE (App uses DARK GRAY background #102030)
          // We want LIGHT text/icons for the status bar.
          newCapacitorStatusBarStyle = StatusBarStyle.Light // Light = white text/icons
          console.log(
            "  Applying LIGHT text/icons theme to Android STATUS BAR.",
          )
        }

        // Apply style to the Android status bar
        await StatusBar.setStyle({ style: newCapacitorStatusBarStyle })
        console.log(
          `  Android StatusBar.setStyle called with: ${newCapacitorStatusBarStyle === StatusBarStyle.Light ? "Style.Light" : "Style.Dark"}`,
        )

        // Ensure status bar remains visible on Android
        await StatusBar.show()
        console.log("  Android StatusBar.show() called to ensure visibility.")
      } else if (platform === "ios") {
        // iOS is handled entirely by the native PluginViewController
        console.log(
          "  iOS detected - status bar styling handled by native PluginViewController.",
        )
        console.log("  Skipping JavaScript StatusBar calls for iOS.")
      }
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

  // Function to conditionally initialize EdgeToEdge only on Android
  async function initializeEdgeToEdge() {
    if (Capacitor.getPlatform() === "android") {
      try {
        const { EdgeToEdge } = await import(
          "@capawesome/capacitor-android-edge-to-edge-support"
        )
        console.log("Attempting to enable EdgeToEdge plugin for Android...")
        await EdgeToEdge.enable()
        console.log("EdgeToEdge.enable() successful.")

        const insets = await EdgeToEdge.getInsets()
        console.log(
          "EdgeToEdge Insets (statusBar, navigationBar, etc.):",
          JSON.stringify(insets),
        )
        return true
      } catch (error) {
        console.error("Error initializing EdgeToEdge (Android only):", error)
        return false
      }
    } else {
      console.log(
        "Skipping EdgeToEdge initialization for non-Android platform:",
        Capacitor.getPlatform(),
      )
      return false
    }
  }

  // Simple network test function (simplified version)
  async function testNetworkConnectivity() {
    console.log("Testing network connectivity...")

    try {
      // Test with a known working endpoint instead of Google
      const response = await fetch(
        "https://jsonplaceholder.typicode.com/todos/1",
      )
      console.log("Network connectivity: OK", response.status)
      return true
    } catch (e) {
      console.error("Network connectivity error:", e)
      return false
    }
  }

  onMount(async () => {
    console.log(
      "+++++ ROOT LAYOUT ONMOUNT (iOS Native + Android JS Theme Handling) +++++",
    )

    // Hide splash screen immediately for native platforms
    if (Capacitor.isNativePlatform()) {
      try {
        await SplashScreen.hide()
        console.log("Splash screen hidden successfully")
      } catch (error) {
        console.error("Error hiding splash screen:", error)
      }

      // Deep link handler for native platforms
      console.log("🔗 Setting up deep link listener for native platform...")
      App.addListener("appUrlOpen", (event) => {
        console.log("📱 App opened via deep link:", event.url)
        handleDeepLink(event.url)
      })
      console.log("✅ Deep link listener registered successfully")
    } else {
      console.log("🌐 Web platform detected - deep link listener not needed")
    }

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
        "+++++ NATIVE PLATFORM DETECTED. CONFIGURING PLATFORM-SPECIFIC SYSTEM BARS +++++",
      )

      // Simple network test
      const networkOk = await testNetworkConnectivity()
      if (!networkOk) {
        console.warn(
          "Network connectivity check failed, but continuing app initialization",
        )
      }

      // Initialize EdgeToEdge only on Android
      await initializeEdgeToEdge()

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
    } else {
      console.log("Not a native platform. Skipping native configuration.")
    }

    // ── Swipe-to-collapse for loading / promise toasts ──
    // Sonner disables swiping on loading toasts. We detect swipe-up
    // ourselves and collapse them to a small spinner circle.
    // When the promise resolves (type changes), the collapsed CSS
    // stops matching and the compact result toast shows briefly.
    let swipeTarget: HTMLElement | null = null
    let swipeStartY = 0

    function onSwipeStart(e: PointerEvent) {
      const el = (e.target as HTMLElement)?.closest?.(
        '[data-sonner-toast][data-type="loading"]',
      ) as HTMLElement | null
      if (!el || el.classList.contains("toast-collapsed-spinner")) return
      swipeTarget = el
      swipeStartY = e.clientY
    }

    function onSwipeMove(e: PointerEvent) {
      if (!swipeTarget) return
      const deltaY = swipeStartY - e.clientY // positive = swiped up
      if (deltaY > 30) {
        swipeTarget.classList.add("toast-collapsed-spinner")
        swipeTarget = null
      }
    }

    function onSwipeEnd() {
      swipeTarget = null
    }

    document.addEventListener("pointerdown", onSwipeStart, true)
    document.addEventListener("pointermove", onSwipeMove, true)
    document.addEventListener("pointerup", onSwipeEnd, true)

    return () => {
      document.removeEventListener("pointerdown", onSwipeStart, true)
      document.removeEventListener("pointermove", onSwipeMove, true)
      document.removeEventListener("pointerup", onSwipeEnd, true)
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

<svelte:head>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link
    href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Montserrat:wght@400;500;600;700;800&display=swap"
    rel="stylesheet"
  />
</svelte:head>

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
  <Toaster
    expand={true}
    position="top-center"
    toastOptions={{
      class: "toast-dark-heavy-border",
    }}
  />
</main>

<style>
  /* ═══════════════════════════════════════════════════════════ */
  /*  TOAST THEME: Dark Heavy + Full Border                     */
  /*  0.85 black, heavy blur(20px), full colored border         */
  /*  Matches: resume-modal, trail-modal, vehicle-panel         */
  /* ═══════════════════════════════════════════════════════════ */

  :global([data-sonner-toast].toast-dark-heavy-border) {
    background: rgba(0, 0, 0, 0.85) !important;
    backdrop-filter: blur(20px) !important;
    -webkit-backdrop-filter: blur(20px) !important;
    border: 1.5px solid rgba(255, 255, 255, 0.15) !important;
    border-radius: 14px !important;
    color: #ffffff !important;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.45) !important;
    font-family: "Inter", sans-serif !important;
    padding: 8px 14px !important;
  }

  :global([data-sonner-toast][data-type="success"].toast-dark-heavy-border) {
    border-color: #22c55e !important;
  }
  :global([data-sonner-toast][data-type="error"].toast-dark-heavy-border) {
    border-color: #ef4444 !important;
  }
  :global([data-sonner-toast][data-type="warning"].toast-dark-heavy-border) {
    border-color: #f59e0b !important;
  }
  :global([data-sonner-toast][data-type="info"].toast-dark-heavy-border) {
    border-color: #3b82f6 !important;
  }
  :global([data-sonner-toast][data-type="loading"].toast-dark-heavy-border) {
    border-color: rgba(255, 255, 255, 0.3) !important;
  }

  /* Text styles */
  :global([data-sonner-toast].toast-dark-heavy-border [data-title]) {
    color: #ffffff !important;
    font-weight: 600 !important;
    font-size: 12px !important;
    line-height: 1.3 !important;
  }

  :global([data-sonner-toast].toast-dark-heavy-border [data-description]) {
    color: rgba(255, 255, 255, 0.6) !important;
    font-size: 11px !important;
    font-weight: 400 !important;
    line-height: 1.35 !important;
    margin-top: 2px !important;
  }

  /* Compact icon */
  :global([data-sonner-toast].toast-dark-heavy-border [data-icon]) {
    flex-shrink: 0 !important;
    width: 16px !important;
    height: 16px !important;
  }

  :global([data-sonner-toast].toast-dark-heavy-border [data-icon] svg) {
    width: 14px !important;
    height: 14px !important;
  }

  /* Compact content area */
  :global([data-sonner-toast].toast-dark-heavy-border [data-content]) {
    flex: 1 !important;
    min-width: 0 !important;
    overflow: hidden !important;
  }

  /* Button styles */
  :global([data-sonner-toast].toast-dark-heavy-border [data-button]) {
    background: rgba(255, 255, 255, 0.15) !important;
    color: #f7db5c !important;
    border: 1px solid rgba(255, 255, 255, 0.2) !important;
    border-radius: 6px !important;
    font-weight: 600 !important;
    font-size: 11px !important;
    padding: 4px 10px !important;
  }

  :global([data-sonner-toast].toast-dark-heavy-border [data-close-button]) {
    background: rgba(255, 255, 255, 0.1) !important;
    border: 1px solid rgba(255, 255, 255, 0.15) !important;
    color: rgba(255, 255, 255, 0.7) !important;
  }

  /* Icon colors */
  :global(
    [data-sonner-toast][data-type="success"].toast-dark-heavy-border [data-icon]
  ) {
    color: #22c55e !important;
  }
  :global(
    [data-sonner-toast][data-type="error"].toast-dark-heavy-border [data-icon]
  ) {
    color: #ef4444 !important;
  }
  :global(
    [data-sonner-toast][data-type="warning"].toast-dark-heavy-border [data-icon]
  ) {
    color: #f59e0b !important;
  }
  :global(
    [data-sonner-toast][data-type="info"].toast-dark-heavy-border [data-icon]
  ) {
    color: #3b82f6 !important;
  }

  /* ═══════════════════════════════════════════════════════════ */
  /*  Loading toast: swipe-to-collapse into spinner circle      */
  /*  When promise resolves, type changes → compact result      */
  /* ═══════════════════════════════════════════════════════════ */

  /* Collapsed spinner — small centered circle */
  :global([data-sonner-toast][data-type="loading"].toast-collapsed-spinner) {
    width: 44px !important;
    height: 44px !important;
    min-height: 0 !important;
    max-height: 44px !important;
    padding: 0 !important;
    border-radius: 50% !important;
    overflow: hidden !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    left: 0 !important;
    right: 0 !important;
    margin: 0 auto !important;
    border-color: rgba(255, 255, 255, 0.2) !important;
    transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1) !important;
  }

  /* Hide everything except spinner icon */
  :global(
    [data-sonner-toast][data-type="loading"].toast-collapsed-spinner
      [data-content]
  ),
  :global(
    [data-sonner-toast][data-type="loading"].toast-collapsed-spinner
      [data-button]
  ),
  :global(
    [data-sonner-toast][data-type="loading"].toast-collapsed-spinner
      [data-close-button]
  ) {
    display: none !important;
  }

  /* Center and size the spinner */
  :global(
    [data-sonner-toast][data-type="loading"].toast-collapsed-spinner [data-icon]
  ) {
    width: 22px !important;
    height: 22px !important;
    margin: 0 !important;
  }

  :global(
    [data-sonner-toast][data-type="loading"].toast-collapsed-spinner
      [data-icon]
      svg
  ) {
    width: 22px !important;
    height: 22px !important;
  }

  /* ═══════════════════════════════════════════════════════════ */
  /*  Override sonner mobile breakpoint:                        */
  /*  Default is 600px — tighten to 480px so tablets get the    */
  /*  fixed-width toast instead of full-width stretch.           */
  /* ═══════════════════════════════════════════════════════════ */

  /* Reset sonner's 600px mobile layout for 481–600px range */
  @media (min-width: 481px) and (max-width: 600px) {
    :global([data-sonner-toaster]) {
      left: 50% !important;
      right: auto !important;
      transform: translateX(-50%) !important;
      width: var(--width) !important;
    }

    :global([data-sonner-toaster] [data-sonner-toast]) {
      left: auto !important;
      right: auto !important;
      width: var(--width) !important;
    }
  }
</style>
