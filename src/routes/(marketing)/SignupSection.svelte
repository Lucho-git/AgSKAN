<script lang="ts">
  import { Auth } from "@supabase/auth-ui-svelte"
  import { sharedAppearance, oauthProviders } from "./login/login_config"
  import { onMount } from "svelte"
  import { supabase, session } from "$lib/stores/sessionStore"
  import { page } from "$app/stores"
  import { browser } from "$app/environment"
  import { setupAuthListener } from "$lib/helpers/authHelpers"

  let mounted = false

  onMount(() => {
    mounted = true

    if (browser) {
      console.log("SignupSection mounted")

      // Use the shared auth listener for consistent behavior
      const {
        data: { subscription },
        checkNow,
      } = setupAuthListener("/static_auth")

      // Force check for existing session
      checkNow()

      return () => {
        subscription.unsubscribe()
      }
    }
  })
</script>

<section class="bg-base-100 py-16" tabindex="-1">
  <div class="container mx-auto px-4">
    <div class="mx-auto max-w-md text-center">
      <h2 class="mb-2 text-3xl font-bold">Get Started Today</h2>
      <p class="mb-8 text-base-content/70">
        Join thousands of farmers mapping their land with precision
      </p>

      <div class="rounded-xl bg-base-100 p-6 shadow-lg">
        {#if mounted && !$session}
          <Auth
            supabaseClient={supabase}
            view="sign_up"
            redirectTo={`${$page.url.origin}/auth/callback`}
            providers={oauthProviders}
            socialLayout="horizontal"
            showLinks={false}
            appearance={sharedAppearance}
          />
        {:else if $session}
          <div class="rounded-lg bg-green-50 p-4 text-center">
            <p class="font-semibold text-green-700">
              You're already signed in!
            </p>
            <a
              href="/static_auth"
              class="mt-3 inline-block rounded-md bg-primary px-4 py-2 text-white"
            >
              Go to your account
            </a>
          </div>
        {/if}
      </div>
    </div>
  </div>
</section>
