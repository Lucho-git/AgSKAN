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

      isNative = Capacitor.isNativePlatform()
      nativeProvider = getNativeProvider()

      console.log(
        "Platform:",
        Capacitor.getPlatform(),
        "| Native:",
        isNative,
        "| Provider:",
        nativeProvider,
      )

      // Handle map_code or legacy map_id from URL if present
      const urlParams = new URLSearchParams(window.location.search)
      const mapCode = urlParams.get("map_code") || urlParams.get("map_id")
      if (mapCode) {
        console.log(`Map code found in URL: ${mapCode}`)
        setPendingMapId(mapCode)
        // Native-app handoff is handled centrally in the root layout so it also
        // runs when an authenticated user is redirected straight to /account.
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

  // Auth UI colours follow the marketing palette (landing-theme.css).
  const appearance = {
    theme: {
      default: {
        colors: {
          brand: "#F7DB5C",
          brandAccent: "#E6C94F",
          brandButtonText: "#15261C",
          inputText: "var(--lp-ink)",
          inputPlaceholder: "var(--lp-ink-faint)",
          messageText: "var(--lp-ink)",
          dividerBackground: "var(--lp-line)",
          inputLabelText: "var(--lp-ink-soft)",
          defaultButtonText: "var(--lp-ink)",
          defaultButtonBackground: "var(--lp-card)",
          defaultButtonBackgroundHover: "var(--lp-paper-2)",
          anchorTextColor: "var(--lp-accent-text)",
          inputBackground: "var(--lp-card)",
          inputBorder: "var(--lp-line)",
          inputBorderHover: "var(--lp-ink-faint)",
          inputBorderFocus: "var(--lp-ink)",
          defaultButtonBorder: "var(--lp-line)",
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
          borderRadiusButton: "0.8rem",
          inputBorderRadius: "0.8rem",
        },
        space: {
          inputPadding: "0.9rem 1rem",
          buttonPadding: "0.95rem 1.25rem",
          labelBottomMargin: "0.4rem",
          spaceMedium: "1.1rem",
        },
        borderWidths: {
          inputBorderWidth: "1.5px",
          buttonBorderWidth: "1.5px",
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

<div class="auth-card animate-fadeIn">
  <div class="auth-head">
    <p class="lp-eyebrow">
      {activeTab === "sign_up" ? "Free account" : "Welcome back"}
    </p>
    <h1>
      {activeTab === "sign_up" ? "Get your farm on the map." : "Sign in."}
    </h1>
    <p class="auth-sub">
      {activeTab === "sign_up"
        ? "No card, no expiry. Add your crew when you're ready."
        : "Pick up where you left off."}
    </p>
  </div>

  <!-- Tab Navigation -->
  <div class="auth-tabs" role="tablist" aria-label="Sign in or sign up">
    <button
      type="button"
      role="tab"
      aria-selected={activeTab === "sign_up"}
      class:active={activeTab === "sign_up"}
      on:click={() => (activeTab = "sign_up")}
    >
      Sign up
    </button>
    <button
      type="button"
      role="tab"
      aria-selected={activeTab === "sign_in"}
      class:active={activeTab === "sign_in"}
      on:click={() => (activeTab = "sign_in")}
    >
      Sign in
    </button>
  </div>

  <!-- Native Platform: Platform-specific Social Button -->
  {#if isNative && nativeProvider}
    <div class="space-y-4">
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

  <div class="auth-links">
    {#if activeTab === "sign_in"}
      <a href="/login/forgot_password">Forgot password?</a>
      <p>
        New to AgSKAN?
        <button type="button" on:click={() => (activeTab = "sign_up")}>
          Sign up for free
        </button>
      </p>
    {:else}
      <p>
        Already have an account?
        <button type="button" on:click={() => (activeTab = "sign_in")}>
          Sign in
        </button>
      </p>
    {/if}
  </div>
</div>

<!-- Footer Note -->
<p class="auth-terms">
  By signing {activeTab === "sign_up" ? "up" : "in"}, you agree to AgSKAN's
  <a href="/terms-of-service">Terms of Service</a>
  and
  <a href="/privacy-policy">Privacy Policy</a>.
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
  .auth-head h1 {
    margin-top: 0.6rem;
    font-size: clamp(2.1rem, 9vw, 2.8rem);
    font-weight: 800;
    line-height: 1;
    color: var(--lp-ink);
    text-wrap: balance;
  }
  .auth-sub {
    margin-top: 0.75rem;
    font-size: 1rem;
    line-height: 1.5;
    color: var(--lp-ink-soft);
  }

  .auth-tabs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 3px;
    margin: 1.75rem 0 1.5rem;
    padding: 4px;
    border: 1px solid var(--lp-line);
    border-radius: 999px;
    background: var(--lp-paper-2);
  }
  .auth-tabs button {
    min-height: 2.9rem;
    border-radius: 999px;
    font-size: 0.98rem;
    font-weight: 600;
    color: var(--lp-ink-soft);
    transition:
      background-color 0.2s ease,
      color 0.2s ease;
  }
  .auth-tabs button.active {
    background: var(--lp-ink);
    color: var(--lp-paper);
  }

  .auth-links {
    display: grid;
    gap: 0.9rem;
    margin-top: 1.5rem;
    text-align: center;
    font-size: 0.95rem;
    color: var(--lp-ink-soft);
  }
  .auth-links a,
  .auth-links button {
    display: inline-block;
    padding: 0.35rem 0.15rem;
    font-weight: 700;
    color: var(--lp-ink);
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .auth-terms {
    margin-top: 2rem;
    padding-top: 1.25rem;
    border-top: 1px solid var(--lp-line);
    text-align: center;
    font-size: 0.78rem;
    line-height: 1.6;
    color: var(--lp-ink-faint);
  }
  .auth-terms a {
    color: var(--lp-ink-soft);
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .auth-tabs button:focus-visible,
  .auth-links a:focus-visible,
  .auth-links button:focus-visible {
    outline: 2px solid var(--lp-accent-text);
    outline-offset: 2px;
  }
  @media (prefers-reduced-motion: reduce) {
    .auth-tabs button {
      transition: none;
    }
  }
</style>
