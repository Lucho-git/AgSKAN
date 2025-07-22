<script lang="ts">
  import { onMount } from "svelte"
  import { Auth } from "@supabase/auth-ui-svelte"
  import { page } from "$app/stores"
  import { browser } from "$app/environment"
  import { supabase, setPendingMapId } from "$lib/stores/sessionStore"
  import { setupAuthListener } from "$lib/helpers/authHelpers"
  import {
    signInWithGoogle,
    signInWithApple,
    getNativeProvider,
  } from "$lib/helpers/socialAuth"
  import { Capacitor } from "@capacitor/core"

  $: activeTab =
    $page.url.searchParams.get("tab") === "sign_up" ? "sign_up" : "sign_in"

  let isNative = false
  let nativeProvider: "google" | "apple" | null = null
  let isSocialLoading = false

  // Debug info
  let debugInfo = {
    isNativePlatform: false,
    platform: "",
    userAgent: "",
    capacitorNative: false,
  }

  // Handle native social login
  async function handleNativeSocialLogin() {
    if (!isNative || !nativeProvider) return

    isSocialLoading = true
    try {
      if (nativeProvider === "google") {
        await signInWithGoogle()
      } else if (nativeProvider === "apple") {
        await signInWithApple()
      }
    } catch (error) {
      console.error(`${nativeProvider} login failed:`, error)
    } finally {
      isSocialLoading = false
    }
  }

  // Process URL parameters
  onMount(() => {
    if (browser) {
      console.log("Login page mounted")

      // Gather debug information
      debugInfo = {
        isNativePlatform: Capacitor.isNativePlatform(),
        platform: Capacitor.getPlatform(),
        userAgent: navigator.userAgent,
        capacitorNative: Capacitor.isNativePlatform(),
      }

      console.log("Debug Info:", debugInfo)

      isNative = Capacitor.isNativePlatform()
      nativeProvider = getNativeProvider()

      console.log("isNative:", isNative)
      console.log("nativeProvider:", nativeProvider)

      // Handle map_id from URL if present
      const urlParams = new URLSearchParams(window.location.search)
      const mapId = urlParams.get("map_id")
      if (mapId) {
        console.log(`Map ID found in URL: ${mapId}`)
        setPendingMapId(mapId)
      }

      // Set up auth state change listener with consistent behavior
      const {
        data: { subscription },
        checkNow,
      } = setupAuthListener("/account")

      // Force check for existing session
      checkNow()

      return () => {
        subscription.unsubscribe()
      }
    }
  })

  // Fixed appearance configuration
  const appearance = {
    theme: {
      default: {
        colors: {
          brand: "#F7DB5C",
          brandAccent: "#E6C94F",
          brandButtonText: "#232322",
          inputText: "oklch(var(--contrast-content) / 0.7)",
          messageText: "hsl(var(--bc))",
          dividerBackground: "oklch(var(--contrast-content) / 0.2)",
          inputLabelText: "hsl(var(--bc) / 0.8)",
          defaultButtonText: "hsl(var(--bc))",
          anchorTextColor: "hsl(var(--p))",
          inputBackground: "hsl(var(--b1))",
          inputBorder: "oklch(var(--contrast-content) / 0.4)",
          defaultButtonBorder: "oklch(var(--contrast-content) / 0.25)",
        },
        fonts: {
          bodyFontFamily: `ui-sans-serif, system-ui, sans-serif`,
        },
        fontSizes: {
          baseInputSize: "16px",
          baseLabelSize: "14px",
          baseButtonSize: "16px",
        },
        radii: {
          borderRadiusButton: "0.5rem",
          inputBorderRadius: "0.5rem",
        },
        space: {
          inputPadding: "0.75rem 1rem",
          buttonPadding: "0.75rem 1.25rem",
        },
        borderWidths: {
          inputBorderWidth: "1.5px",
          defaultButtonBorderWidth: "1.5px",
        },
      },
    },
  }
</script>

<svelte:head>
  <title>Sign In - AgSKAN</title>
  <meta
    name="description"
    content="Sign in to your AgSKAN account to access farm coordination tools."
  />
</svelte:head>

<div class="rounded-xl bg-base-100 p-8 shadow-xl">
  <!-- Debug Information (remove this in production) -->
  <div class="mb-4 rounded bg-gray-100 p-3 text-xs">
    <strong>Debug Info:</strong><br />
    Platform: {debugInfo.platform}<br />
    Is Native: {debugInfo.isNativePlatform}<br />
    Native Provider: {nativeProvider || "null"}<br />
    User Agent: {debugInfo.userAgent.substring(0, 50)}...
  </div>

  <div class="mb-8 text-center">
    <h1 class="mb-2 font-archivo text-2xl font-bold text-contrast-content">
      {activeTab === "sign_up" ? "Create Account" : "Welcome Back"}
    </h1>
    <p class="text-contrast-content/60">
      {activeTab === "sign_up"
        ? "Join thousands of farmers using AgSKAN"
        : "Sign in to your AgSKAN account"}
    </p>
  </div>

  <!-- Tab Navigation -->
  <div class="mb-6 flex rounded-lg bg-base-200 p-1">
    <button
      class="flex-1 rounded-md px-4 py-2 text-sm font-medium transition-all duration-200 {activeTab ===
      'sign_in'
        ? 'bg-base-100 text-base-content shadow-sm'
        : 'text-contrast-content/60 hover:text-base-content'}"
      on:click={() => (activeTab = "sign_in")}
    >
      Sign In
    </button>
    <button
      class="flex-1 rounded-md px-4 py-2 text-sm font-medium transition-all duration-200 {activeTab ===
      'sign_up'
        ? 'bg-base-100 text-base-content shadow-sm'
        : 'text-contrast-content/60 hover:text-base-content'}"
      on:click={() => (activeTab = "sign_up")}
    >
      Sign Up
    </button>
  </div>

  <!-- Native Platform: Platform-specific Social Button -->
  {#if isNative && nativeProvider}
    <div class="space-y-4">
      <div class="text-center text-sm font-medium text-green-600">
        Native Mode: {nativeProvider.toUpperCase()} Authentication
      </div>

      <!-- Google Button for Android -->
      {#if nativeProvider === "google"}
        <button
          on:click={handleNativeSocialLogin}
          disabled={isSocialLoading}
          class="btn btn-outline w-full gap-3 border-2 border-base-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50"
        >
          {#if isSocialLoading}
            <span class="loading loading-spinner loading-sm"></span>
          {:else}
            <svg class="h-5 w-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
          {/if}
          Continue with Google
        </button>
      {/if}

      <!-- Apple Button for iOS -->
      {#if nativeProvider === "apple"}
        <button
          on:click={handleNativeSocialLogin}
          disabled={isSocialLoading}
          class="btn w-full gap-3 border-black bg-black text-white hover:bg-gray-800"
        >
          {#if isSocialLoading}
            <span class="loading loading-spinner loading-sm"></span>
          {:else}
            <svg class="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"
              />
            </svg>
          {/if}
          Continue with Apple
        </button>
      {/if}

      <!-- Email/Password Form -->
      <div class="divider">or</div>
      <Auth
        supabaseClient={supabase}
        view={activeTab}
        redirectTo={`${$page.url.origin}/auth/callback?next=/account`}
        providers={[]}
        showLinks={false}
        {appearance}
      />
    </div>
  {:else}
    <!-- Web Platform: Use Supabase Auth UI with both providers -->
    <div class="space-y-6">
      <div class="text-center text-sm font-medium text-blue-600">
        Web Mode: Full OAuth Flow
      </div>

      <Auth
        supabaseClient={supabase}
        view={activeTab}
        redirectTo={`${$page.url.origin}/auth/callback?next=/account`}
        providers={["google", "apple"]}
        socialLayout="horizontal"
        showLinks={false}
        {appearance}
      />
    </div>
  {/if}

  {#if activeTab === "sign_in"}
    <div class="mt-4 text-center">
      <a
        class="hover:text-base-content-focus text-sm font-medium text-base-content transition-colors duration-200"
        href="/login/forgot_password"
      >
        Forgot Password?
      </a>
    </div>
  {/if}

  <!-- Toggle between Sign In/Up -->
  {#if activeTab === "sign_in"}
    <div class="mt-6 text-center">
      <span class="text-sm text-contrast-content/60"
        >Don't have an account?
      </span>
      <button
        on:click={() => (activeTab = "sign_up")}
        class="hover:text-base-content-focus text-sm font-medium text-base-content transition-colors duration-200"
      >
        Sign up for free
      </button>
    </div>
  {/if}

  {#if activeTab === "sign_up"}
    <div class="mt-6 text-center">
      <span class="text-sm text-contrast-content/60"
        >Already have an account?
      </span>
      <button
        on:click={() => (activeTab = "sign_in")}
        class="hover:text-base-content-focus text-sm font-medium text-base-content transition-colors duration-200"
      >
        Sign in
      </button>
    </div>
  {/if}
</div>

<!-- Footer Note -->
<p class="mt-6 text-center text-xs text-contrast-content/60">
  By signing {activeTab === "sign_up" ? "up" : "in"}, you agree to AgSKAN's
  <a href="/terms-of-service" class="text-base-content hover:underline"
    >Terms of Service</a
  >
  and
  <a href="/privacy-policy" class="text-base-content hover:underline"
    >Privacy Policy</a
  >.
</p>

<!-- Success Alert -->
{#if $page.url.searchParams.get("verified") == "true"}
  <div class="fixed bottom-4 right-4 z-50">
    <div role="alert" class="alert alert-success shadow-lg">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="h-6 w-6 shrink-0 stroke-current"
        fill="none"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      <span>Email verified! Please sign in.</span>
    </div>
  </div>
{/if}

<style>
  .font-archivo {
    font-family: "Archivo", Arial, sans-serif;
  }
</style>
