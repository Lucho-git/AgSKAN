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
  import { App } from "@capacitor/app" // 👈 CORRECTED: Import App from @capacitor/app

  // Supabase import - you'll need to import your supabase client
  // Adjust this import path based on your setup
  import { supabase } from "$lib/stores/sessionStore"

  // --- Theme Colors for System Bars ---
  const appSystemLightMode_Bars_BackgroundColor = "#102030" // Your Dark Gray
  const appSystemDarkMode_Bars_BackgroundColor = "#f9e58a" // Your Yellow

  // --- Deep Link Handler Functions ---
  function handleDeepLink(urlString: string) {
    console.log("🔗 Deep link received:", urlString)

    try {
      const url = new URL(urlString)
      console.log("📋 Deep link parsed:", {
        protocol: url.protocol,
        hostname: url.hostname,
        pathname: url.pathname,
        search: url.search,
        searchParams: Object.fromEntries(url.searchParams),
      })

      if (url.protocol === "agskan:") {
        const path = url.hostname || url.pathname.replace("/", "") // 'auth' from agskan://auth
        const params = new URLSearchParams(url.search)

        const token = params.get("token")
        const userId = params.get("userId")
        const refreshToken = params.get("refresh_token")

        console.log("🔍 Deep link authentication data:", {
          path,
          hasToken: !!token,
          tokenLength: token?.length || 0,
          userId,
          hasRefreshToken: !!refreshToken,
          refreshTokenLength: refreshToken?.length || 0,
        })

        if (path === "auth") {
          if (token && userId && refreshToken) {
            console.log(
              "✅ All required auth parameters present, attempting auto-login",
            )
            handleAutoLogin(token, userId, refreshToken)
          } else {
            console.error("❌ Missing required auth parameters:", {
              hasToken: !!token,
              hasUserId: !!userId,
              hasRefreshToken: !!refreshToken,
            })

            toast.error(
              "Invalid authentication link - missing required data.",
              {
                description: "Please try logging in manually.",
                duration: 6000,
                action: {
                  label: "Go to Login",
                  onClick: () => goto("/login"),
                },
              },
            )
          }
        } else {
          console.log("ℹ️ Deep link opened app with path:", path)
          toast.info("App opened via deep link", {
            description: `Navigated to: ${path || "home"}`,
            duration: 3000,
          })
        }
      } else {
        console.warn("⚠️ Non-agskan protocol received:", url.protocol)
        toast.warning("Unsupported link format", {
          description: "This link format is not supported by the app.",
          duration: 4000,
        })
      }
    } catch (error) {
      console.error("💥 Error parsing deep link:", error)
      console.error("Original URL string:", urlString)

      toast.error("Invalid deep link format", {
        description: "The link could not be processed.",
        duration: 5000,
      })
    }
  }

  async function handleAutoLogin(
    token: string,
    userId: string,
    refreshToken: string,
  ) {
    console.log("🚀 Starting Supabase auto-login process")
    console.log("📊 Auto-login parameters:", {
      userId,
      hasToken: !!token,
      tokenLength: token?.length || 0,
      hasRefreshToken: !!refreshToken,
      refreshTokenLength: refreshToken?.length || 0,
      timestamp: new Date().toISOString(),
    })

    let loadingToast: string | undefined

    try {
      // Show loading toast
      loadingToast = toast.loading("Authenticating...", {
        description: "Verifying your credentials",
        duration: 15000,
      })

      console.log("🔐 Calling Supabase setSession...")

      // Set the Supabase session using both access and refresh tokens
      const { data, error } = await supabase.auth.setSession({
        access_token: token,
        refresh_token: refreshToken,
      })

      console.log("📡 Supabase setSession response:", {
        hasData: !!data,
        hasError: !!error,
        hasSession: !!data?.session,
        hasUser: !!data?.user,
        errorMessage: error?.message,
        errorStatus: error?.status,
      })

      if (error) {
        console.error("❌ Supabase setSession error details:", {
          message: error.message,
          status: error.status,
          name: error.name,
          cause: error.cause,
        })
        throw error
      }

      // Verify we have valid session and user data
      if (data.session && data.user) {
        console.log("✅ Supabase session established successfully!")
        console.log("👤 User details:", {
          id: data.user.id,
          email: data.user.email,
          emailConfirmed: data.user.email_confirmed_at,
          lastSignIn: data.user.last_sign_in_at,
          createdAt: data.user.created_at,
          role: data.user.role,
          userMetadata: data.user.user_metadata,
        })
        console.log("🎫 Session details:", {
          accessToken: data.session.access_token ? "Present" : "Missing",
          refreshToken: data.session.refresh_token ? "Present" : "Missing",
          expiresAt: data.session.expires_at,
          expiresIn: data.session.expires_in,
          tokenType: data.session.token_type,
        })

        // Verify the userId matches what was passed in the deep link
        if (data.user.id !== userId) {
          console.warn("⚠️ User ID mismatch detected:", {
            deepLinkUserId: userId,
            actualUserId: data.user.id,
            note: "Continuing with actual user ID from token",
          })
        } else {
          console.log("✅ User ID verification passed")
        }

        // Extract user display name
        const userName =
          data.user.user_metadata?.full_name ||
          data.user.user_metadata?.name ||
          data.user.user_metadata?.display_name ||
          data.user.email?.split("@")[0] ||
          "User"

        console.log("🎯 Extracted user display name:", userName)

        // Dismiss loading toast
        if (loadingToast) {
          toast.dismiss(loadingToast)
          loadingToast = undefined
        }

        // Show success message
        toast.success(`Welcome back, ${userName}!`, {
          description: "You have been automatically signed in.",
          duration: 4000,
        })

        console.log("🧭 Navigating to /account...")

        // Navigate to account page (your dashboard)
        await goto("/account")

        console.log("🎉 Auto-login completed successfully!")
        console.log("📍 User should now be on /account page")
      } else {
        // Session was set but no user data received
        console.error("❌ Invalid session data received from Supabase")
        console.error("Session data details:", {
          session: data?.session,
          user: data?.user,
          rawData: data,
        })
        throw new Error(
          "No valid user session could be established - missing session or user data",
        )
      }
    } catch (error: any) {
      console.error("💥 Supabase auto-login failed!")
      console.error("Error details:", {
        message: error?.message,
        status: error?.status,
        name: error?.name,
        stack: error?.stack,
        cause: error?.cause,
        fullError: error,
      })

      // Dismiss loading toast if still showing
      if (loadingToast) {
        toast.dismiss(loadingToast)
        loadingToast = undefined
      }

      // Clear any potentially corrupted session data
      try {
        console.log("🧹 Attempting to clear potentially corrupted session...")
        await supabase.auth.signOut()
        console.log("✅ Session cleared successfully")
      } catch (signOutError: any) {
        console.error("💥 Error during cleanup signOut:", {
          message: signOutError?.message,
          error: signOutError,
        })
      }

      // Determine user-friendly error message based on error type
      let errorMessage = "Authentication failed. Please login manually."
      let errorDescription = ""

      if (
        error?.message?.toLowerCase().includes("invalid") &&
        error?.message?.toLowerCase().includes("token")
      ) {
        errorMessage = "Authentication link has expired"
        errorDescription = "Please request a new login link or login manually."
      } else if (error?.message?.toLowerCase().includes("refresh_token")) {
        errorMessage = "Session could not be restored"
        errorDescription = "Your login session has expired. Please login again."
      } else if (
        error?.message?.toLowerCase().includes("network") ||
        error?.message?.toLowerCase().includes("fetch")
      ) {
        errorMessage = "Network connection error"
        errorDescription =
          "Please check your internet connection and try again."
      } else if (error?.status === 401) {
        errorMessage = "Authentication credentials invalid"
        errorDescription =
          "The login link may have expired or been used already."
      } else if (error?.status === 403) {
        errorMessage = "Access denied"
        errorDescription =
          "Your account may not have permission to access this app."
      } else {
        errorDescription = "An unexpected error occurred during authentication."
      }

      console.log("📋 Showing user error message:", {
        errorMessage,
        errorDescription,
      })

      // Show error toast with action to go to login
      toast.error(errorMessage, {
        description: errorDescription,
        duration: 10000,
        action: {
          label: "Go to Login",
          onClick: () => {
            console.log('🔄 User clicked "Go to Login" - navigating to /login')
            goto("/login")
          },
        },
      })
    }
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
  <Toaster expand={true} position="top-center" richColors />
</main>
