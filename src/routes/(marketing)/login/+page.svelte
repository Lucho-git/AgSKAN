<script lang="ts">
  // routes/login/+page.svelte
  import { onMount } from "svelte"
  import { Auth } from "@supabase/auth-ui-svelte"
  import { sharedAppearance, oauthProviders } from "./login_config"
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

        // Store using the existing helper
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
</script>

<svelte:head>
  <title>Sign In / Sign Up</title>
</svelte:head>

<div class="mx-auto w-full max-w-2xl">
  <div class="mb-5 flex justify-around">
    <button
      class={`px-5 py-2 ${activeTab === "sign_in" ? "border-b-2 border-black font-bold" : ""}`}
      on:click={() => (activeTab = "sign_in")}>Sign In</button
    >
    <button
      class={`px-5 py-2 ${activeTab === "sign_up" ? "border-b-2 border-black font-bold" : ""}`}
      on:click={() => (activeTab = "sign_up")}>Sign Up</button
    >
  </div>

  <div class="rounded-lg border border-gray-300 p-5">
    <div class="auth-wrapper">
      <Auth
        supabaseClient={supabase}
        view={activeTab}
        redirectTo={`${$page.url.origin}/auth/callback?next=/account`}
        providers={oauthProviders}
        socialLayout="horizontal"
        showLinks={false}
        appearance={sharedAppearance}
      />
    </div>
    {#if activeTab === "sign_in"}
      <div class="mt-4 text-center">
        <a
          class="px-5 py-2 transition-all duration-200 hover:border-b-2 hover:border-black hover:font-bold"
          href="/login/forgot_password"
        >
          Forgot Password?
        </a>
      </div>
    {/if}
  </div>
</div>

{#if $page.url.searchParams.get("verified") == "true"}
  <div role="alert" class="alert alert-success mt-5">
    <svg
      xmlns="http://www.w3.org/2000/svg"
      class="h-6 w-6 shrink-0 stroke-current"
      fill="none"
      viewBox="0 0 24 24"
      ><path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
      /></svg
    >
    <span>Email verified! Please sign in.</span>
  </div>
{/if}

<style>
  :global(.auth-wrapper > div) {
    width: 100% !important;
    max-width: none !important;
  }
</style>
