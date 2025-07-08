<script lang="ts">
  import { onMount } from "svelte"
  import { Auth } from "@supabase/auth-ui-svelte"
  import { page } from "$app/stores"
  import { browser } from "$app/environment"
  import { supabase, setPendingMapId } from "$lib/stores/sessionStore"
  import { setupAuthListener } from "$lib/helpers/authHelpers"
  import {
    Palette,
    RotateCcw,
    Type,
    AlignVerticalSpaceBetween,
  } from "lucide-svelte"

  $: activeTab =
    $page.url.searchParams.get("tab") === "sign_up" ? "sign_up" : "sign_in"

  // Style variation state
  let showStylePanel = false
  let activePanel = "typography" // "typography", "spacing"

  // Typography settings
  let fontSizes = {
    baseInputSize: "16px",
    baseLabelSize: "14px",
    baseButtonSize: "16px",
  }

  // Spacing settings
  let spacing = {
    inputPadding: "0.75rem 1rem",
    buttonPadding: "0.75rem 1.25rem",
    borderRadiusButton: "0.5rem",
    inputBorderRadius: "0.5rem",
    inputBorderWidth: "0.5px",
    defaultButtonBorderWidth: "0.5px", // Need this back for the theme
    googleButtonBorderWidth: "2px",
  }

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

  // Default style configuration
  const defaultColors = {
    brand: "#F7DB5C",
    brandAccent: "#E6C94F",
    brandButtonText: "#232322",
    inputText: "oklch(var(--contrast-content) / 0.7)", // Faded
    messageText: "hsl(var(--bc))",
    dividerBackground: "oklch(var(--contrast-content) / 0.2)",
    inputLabelText: "hsl(var(--bc) / 0.8)", // Slightly faded
    defaultButtonText: "hsl(var(--bc))",
    anchorTextColor: "hsl(var(--p))",
    inputBackground: "hsl(var(--b1))",
    inputBorder: "oklch(var(--contrast-content) / 0.4)", // Much more faded
    defaultButtonBorder: "oklch(var(--contrast-content) / 0.25)",
  }

  // Typography presets
  const typographyPresets = {
    small: {
      name: "Small",
      baseInputSize: "14px",
      baseLabelSize: "12px",
      baseButtonSize: "14px",
    },
    default: {
      name: "Default",
      baseInputSize: "16px",
      baseLabelSize: "14px",
      baseButtonSize: "16px",
    },
    large: {
      name: "Large",
      baseInputSize: "18px",
      baseLabelSize: "16px",
      baseButtonSize: "18px",
    },
    xlarge: {
      name: "Extra Large",
      baseInputSize: "20px",
      baseLabelSize: "18px",
      baseButtonSize: "20px",
    },
  }

  // Spacing presets
  const spacingPresets = {
    compact: {
      name: "Compact",
      inputPadding: "0.5rem 0.75rem",
      buttonPadding: "0.5rem 1rem",
      borderRadiusButton: "0.25rem",
      inputBorderRadius: "0.25rem",
      inputBorderWidth: "0.5px",
      defaultButtonBorderWidth: "0.5px",
      googleButtonBorderWidth: "2px",
    },
    default: {
      name: "Default",
      inputPadding: "0.75rem 1rem",
      buttonPadding: "0.75rem 1.25rem",
      borderRadiusButton: "0.5rem",
      inputBorderRadius: "0.5rem",
      inputBorderWidth: "0.5px",
      defaultButtonBorderWidth: "0.5px",
      googleButtonBorderWidth: "2px",
    },
    spacious: {
      name: "Spacious",
      inputPadding: "1rem 1.25rem",
      buttonPadding: "1rem 1.5rem",
      borderRadiusButton: "0.75rem",
      inputBorderRadius: "0.75rem",
      inputBorderWidth: "1px",
      defaultButtonBorderWidth: "1px",
      googleButtonBorderWidth: "3px",
    },
    rounded: {
      name: "Very Rounded",
      inputPadding: "0.75rem 1rem",
      buttonPadding: "0.75rem 1.25rem",
      borderRadiusButton: "1.5rem",
      inputBorderRadius: "1.5rem",
      inputBorderWidth: "0.5px",
      defaultButtonBorderWidth: "0.5px",
      googleButtonBorderWidth: "2px",
    },
  }

  // Generate appearance config based on current settings - RESTORED THE FULL CONFIG
  $: currentAppearance = {
    theme: {
      default: {
        colors: defaultColors,
        fonts: {
          bodyFontFamily: `ui-sans-serif, system-ui, sans-serif`,
        },
        fontSizes: fontSizes,
        radii: {
          borderRadiusButton: spacing.borderRadiusButton,
          inputBorderRadius: spacing.inputBorderRadius,
        },
        space: {
          inputPadding: spacing.inputPadding,
          buttonPadding: spacing.buttonPadding,
        },
        borderWidths: {
          inputBorderWidth: spacing.inputBorderWidth,
          defaultButtonBorderWidth: spacing.defaultButtonBorderWidth,
          googleButtonBorderWidth: spacing.googleButtonBorderWidth,
          buttonBorderWidth: spacing.googleButtonBorderWidth,
        },
      },
    },
    style: {
      button: {
        borderWidth: spacing.googleButtonBorderWidth,
        borderStyle: "solid",
      },
      socialButton: {
        borderWidth: spacing.googleButtonBorderWidth,
        borderStyle: "solid",
      },
    },
    className: {
      button: "custom-auth-button",
      socialButton: "custom-social-button",
      container: "custom-auth-container",
    },
  }

  // Reset functions
  function resetToDefaults() {
    fontSizes = { ...typographyPresets.default }
    spacing = { ...spacingPresets.default }
  }

  function applyTypographyPreset(preset) {
    fontSizes = { ...typographyPresets[preset] }
  }

  function applySpacingPreset(preset) {
    spacing = { ...spacingPresets[preset] }
  }
</script>

<svelte:head>
  <title>Sign In - AgSKAN</title>
  <meta
    name="description"
    content="Sign in to your AgSKAN account to access farm coordination tools."
  />
</svelte:head>

<!-- Style Testing Panel -->
<div class="fixed bottom-4 left-4 z-50">
  <div class="relative">
    <!-- Toggle Button -->
    <button
      class="btn btn-circle btn-primary shadow-lg"
      on:click={() => (showStylePanel = !showStylePanel)}
    >
      <Palette size={20} />
    </button>

    <!-- Style Panel -->
    {#if showStylePanel}
      <div
        class="absolute bottom-16 left-0 max-h-96 w-80 overflow-hidden rounded-lg border border-base-200 bg-base-100 shadow-xl"
      >
        <!-- Panel Header -->
        <div class="border-b border-base-200 p-4">
          <div class="mb-3 flex items-center justify-between">
            <h3 class="font-medium text-base-content">Style Testing Panel</h3>
            <button
              class="btn btn-ghost btn-xs"
              on:click={resetToDefaults}
              title="Reset All"
            >
              <RotateCcw size={14} />
            </button>
          </div>

          <!-- Panel Tabs -->
          <div class="flex rounded-md bg-base-200 p-1">
            <button
              class="flex-1 rounded px-3 py-1 text-xs transition-all {activePanel ===
              'typography'
                ? 'bg-base-100 shadow'
                : ''}"
              on:click={() => (activePanel = "typography")}
            >
              <Type size={12} class="mr-1 inline" />
              Text
            </button>
            <button
              class="flex-1 rounded px-3 py-1 text-xs transition-all {activePanel ===
              'spacing'
                ? 'bg-base-100 shadow'
                : ''}"
              on:click={() => (activePanel = "spacing")}
            >
              <AlignVerticalSpaceBetween size={12} class="mr-1 inline" />
              Space
            </button>
          </div>
        </div>

        <!-- Panel Content -->
        <div class="max-h-64 overflow-y-auto p-4">
          {#if activePanel === "typography"}
            <!-- Typography Controls -->
            <div class="space-y-4">
              <!-- Typography Presets -->
              <div>
                <label
                  class="mb-2 block text-xs font-medium text-base-content/80"
                  >Presets</label
                >
                <div class="grid grid-cols-2 gap-1">
                  {#each Object.entries(typographyPresets) as [key, preset]}
                    <button
                      class="btn btn-xs"
                      on:click={() => applyTypographyPreset(key)}
                    >
                      {preset.name}
                    </button>
                  {/each}
                </div>
              </div>

              <!-- Custom Font Sizes -->
              <div class="space-y-2">
                <div>
                  <label class="text-xs text-base-content/80"
                    >Input Size: {fontSizes.baseInputSize}</label
                  >
                  <input
                    type="range"
                    min="12"
                    max="24"
                    step="1"
                    bind:value={fontSizes.baseInputSize}
                    on:input={(e) =>
                      (fontSizes.baseInputSize = e.target.value + "px")}
                    class="range range-xs w-full"
                  />
                </div>

                <div>
                  <label class="text-xs text-base-content/80"
                    >Label Size: {fontSizes.baseLabelSize}</label
                  >
                  <input
                    type="range"
                    min="10"
                    max="20"
                    step="1"
                    bind:value={fontSizes.baseLabelSize}
                    on:input={(e) =>
                      (fontSizes.baseLabelSize = e.target.value + "px")}
                    class="range range-xs w-full"
                  />
                </div>

                <div>
                  <label class="text-xs text-base-content/80"
                    >Button Size: {fontSizes.baseButtonSize}</label
                  >
                  <input
                    type="range"
                    min="12"
                    max="24"
                    step="1"
                    bind:value={fontSizes.baseButtonSize}
                    on:input={(e) =>
                      (fontSizes.baseButtonSize = e.target.value + "px")}
                    class="range range-xs w-full"
                  />
                </div>
              </div>
            </div>
          {:else if activePanel === "spacing"}
            <!-- Spacing Controls -->
            <div class="space-y-4">
              <!-- Spacing Presets -->
              <div>
                <label
                  class="mb-2 block text-xs font-medium text-base-content/80"
                  >Presets</label
                >
                <div class="grid grid-cols-2 gap-1">
                  {#each Object.entries(spacingPresets) as [key, preset]}
                    <button
                      class="btn btn-xs"
                      on:click={() => applySpacingPreset(key)}
                    >
                      {preset.name}
                    </button>
                  {/each}
                </div>
              </div>

              <!-- Custom Spacing -->
              <div class="space-y-3">
                <div>
                  <label class="mb-1 block text-xs text-base-content/80"
                    >Input Padding</label
                  >
                  <select
                    bind:value={spacing.inputPadding}
                    class="select select-xs w-full"
                  >
                    <option value="0.5rem 0.75rem"
                      >Small (0.5rem 0.75rem)</option
                    >
                    <option value="0.75rem 1rem">Default (0.75rem 1rem)</option>
                    <option value="1rem 1.25rem">Large (1rem 1.25rem)</option>
                    <option value="1.25rem 1.5rem">XL (1.25rem 1.5rem)</option>
                  </select>
                </div>

                <div>
                  <label class="mb-1 block text-xs text-base-content/80"
                    >Button Padding</label
                  >
                  <select
                    bind:value={spacing.buttonPadding}
                    class="select select-xs w-full"
                  >
                    <option value="0.5rem 1rem">Small (0.5rem 1rem)</option>
                    <option value="0.75rem 1.25rem"
                      >Default (0.75rem 1.25rem)</option
                    >
                    <option value="1rem 1.5rem">Large (1rem 1.5rem)</option>
                    <option value="1.25rem 1.75rem">XL (1.25rem 1.75rem)</option
                    >
                  </select>
                </div>

                <div>
                  <label class="mb-1 block text-xs text-base-content/80"
                    >Border Radius</label
                  >
                  <select
                    bind:value={spacing.borderRadiusButton}
                    on:change={() =>
                      (spacing.inputBorderRadius = spacing.borderRadiusButton)}
                    class="select select-xs w-full"
                  >
                    <option value="0rem">None (0rem)</option>
                    <option value="0.25rem">Small (0.25rem)</option>
                    <option value="0.5rem">Default (0.5rem)</option>
                    <option value="0.75rem">Large (0.75rem)</option>
                    <option value="1rem">XL (1rem)</option>
                    <option value="1.5rem">Pill (1.5rem)</option>
                  </select>
                </div>

                <div>
                  <label class="mb-1 block text-xs text-base-content/80"
                    >Input Border Width</label
                  >
                  <select
                    bind:value={spacing.inputBorderWidth}
                    class="select select-xs w-full"
                  >
                    <option value="0px">None (0px)</option>
                    <option value="0.5px">Ultra Thin (0.5px)</option>
                    <option value="1px">Thin (1px)</option>
                    <option value="1.5px">Medium Thin (1.5px)</option>
                    <option value="2px">Medium (2px)</option>
                    <option value="3px">Thick (3px)</option>
                    <option value="4px">Extra Thick (4px)</option>
                  </select>
                </div>

                <!-- Google Auth specific options -->
                <div class="border-t border-base-300 pt-3">
                  <h4 class="mb-2 text-xs font-semibold text-base-content">
                    Google Auth Button
                  </h4>

                  <div>
                    <label class="mb-1 block text-xs text-base-content/80"
                      >Google Button Border Width</label
                    >
                    <select
                      bind:value={spacing.googleButtonBorderWidth}
                      class="select select-xs w-full"
                    >
                      <option value="0px">None (0px)</option>
                      <option value="0.5px">Ultra Thin (0.5px)</option>
                      <option value="1px">Thin (1px)</option>
                      <option value="1.5px">Medium Thin (1.5px)</option>
                      <option value="2px">Medium (2px)</option>
                      <option value="3px">Thick (3px)</option>
                      <option value="4px">Extra Thick (4px)</option>
                      <option value="5px">Very Thick (5px)</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </div>
</div>

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
    <!-- RESTORED THE FULL KEY FOR PROPER RE-RENDERING -->
    {#key `${JSON.stringify(fontSizes)}-${JSON.stringify(spacing)}-${spacing.googleButtonBorderWidth}`}
      <Auth
        supabaseClient={supabase}
        view={activeTab}
        redirectTo={`${$page.url.origin}/auth/callback?next=/account`}
        providers={["google"]}
        socialLayout="horizontal"
        showLinks={false}
        appearance={currentAppearance}
      />
    {/key}
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
  <a href="/terms" class="text-base-content hover:underline">Terms of Service</a
  >
  and
  <a href="/privacy" class="text-base-content hover:underline">Privacy Policy</a
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

  /* Google auth button styling */
  :global(.custom-auth-button) {
    border-width: v-bind("spacing.googleButtonBorderWidth") !important;
    border-style: solid !important;
  }

  :global(.custom-social-button) {
    border-width: v-bind("spacing.googleButtonBorderWidth") !important;
    border-style: solid !important;
  }

  :global(.supabase-auth-ui_ui button) {
    border-width: v-bind("spacing.googleButtonBorderWidth") !important;
    border-style: solid !important;
  }

  :global(button[data-provider="google"]) {
    border-width: v-bind("spacing.googleButtonBorderWidth") !important;
    border-style: solid !important;
  }

  :global([class*="supabase-auth-ui"] button[type="button"]) {
    border-width: v-bind("spacing.googleButtonBorderWidth") !important;
    border-style: solid !important;
  }

  :global(.custom-auth-container button) {
    border-width: v-bind("spacing.googleButtonBorderWidth") !important;
    border-style: solid !important;
  }
</style>
