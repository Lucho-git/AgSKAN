<script lang="ts">
  import { Auth } from "@supabase/auth-ui-svelte"
  import { sharedAppearance, oauthProviders } from "../login_config"
  import { page } from "$app/stores"
  import { supabase } from "$lib/stores/sessionStore"
  import { onMount } from "svelte"

  let showSpamWarning = false
  let authComponent: any

  // Function to intercept the form submission
  function handleEmailSubmit() {
    const formElement = document.querySelector("form")
    if (formElement) {
      const originalSubmit = formElement.onsubmit

      formElement.onsubmit = function (e) {
        // Call the original handler first
        if (originalSubmit) {
          originalSubmit.call(this, e)
        }

        // Now show the warning
        showSpamWarning = true
      }
    }
  }

  onMount(() => {
    // Check if we're already in the "email sent" state (URL has ?email= parameter)
    if ($page.url.searchParams.has("email")) {
      showSpamWarning = true
      return
    }

    // Wait a bit for the Auth component to render its form
    setTimeout(handleEmailSubmit, 500)

    // Fallback: watch for changes in the DOM that might indicate email was sent
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          const successMessage = document.querySelector(
            ".supabase-auth-ui_ui-message",
          )
          if (successMessage && successMessage.textContent?.includes("email")) {
            showSpamWarning = true
            observer.disconnect()
          }
        }
      }
    })

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    })

    return () => observer.disconnect()
  })
</script>

<svelte:head>
  <title>Forgot Password</title>
</svelte:head>

<div class="container mx-auto max-w-md px-4 py-8">
  <h1 class="mb-6 text-2xl font-bold text-contrast-content">Forgot Password</h1>

  {#if showSpamWarning}
    <!-- Spam Warning Notice - Only shown after email submission -->
    <div
      class="mb-6 rounded-lg border border-warning bg-warning/10 p-4 text-warning"
    >
      <div class="flex items-start">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="mr-3 mt-0.5 h-5 w-5 flex-shrink-0"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fill-rule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
            clip-rule="evenodd"
          />
        </svg>
        <div>
          <p class="font-medium">Important: Check your spam folder</p>
          <p class="mt-1 text-sm text-warning/80">
            Many of our password reset emails are being flagged as spam. If you
            don't see the email in your inbox, please check your spam or junk
            folder.
          </p>
        </div>
      </div>
    </div>
  {/if}

  <Auth
    supabaseClient={supabase}
    view="forgotten_password"
    redirectTo={`${$page.url.origin}/auth/callback?next=%account`}
    providers={oauthProviders}
    socialLayout="horizontal"
    showLinks={false}
    appearance={sharedAppearance}
    additionalData={undefined}
    bind:this={authComponent}
  />

  <div class="mt-4 text-contrast-content">
    Remember your password?
    <a
      class="text-primary underline transition-colors hover:text-primary/80"
      href="/login"
    >
      Sign in
    </a>.
  </div>
</div>
