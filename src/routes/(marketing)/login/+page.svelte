<script lang="ts">
  import { onMount } from "svelte"
  import { Auth } from "@supabase/auth-ui-svelte"
  import { page } from "$app/stores"
  import { browser } from "$app/environment"
  import { supabase, setPendingMapId } from "$lib/stores/sessionStore"
  import { setupAuthListener } from "$lib/helpers/authHelpers"

  $: activeTab =
    $page.url.searchParams.get("tab") === "sign_up" ? "sign_up" : "sign_in"

  // Process URL parameters
  onMount(() => {
    if (browser) {
      console.log("Login page mounted")

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

  <!-- Supabase Auth Component -->
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
