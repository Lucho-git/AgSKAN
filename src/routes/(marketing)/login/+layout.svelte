<!-- src/routes/login/+layout.svelte -->
<script>
  import { onMount } from "svelte"
  import { session } from "$lib/stores/sessionStore"
  import { goto } from "$app/navigation"
  import { browser } from "$app/environment"

  // Flag to track initial session check
  let initialCheckComplete = false

  // Only redirect if user is already logged in when they visit the page
  onMount(() => {
    if (browser && $session) {
      console.log("User already logged in, redirecting away from login page")
      goto("/account")
    }
    initialCheckComplete = true
  })

  // Don't redirect on session changes after initial load
  // This prevents redirecting away during the authentication process
  $: if (browser && initialCheckComplete && $session) {
    // Do nothing - we'll let the Auth UI handle the redirect
    console.log("Session detected, but letting Auth UI handle redirect flow")
  }
</script>

<div class="min-h-screen bg-base-200 py-16">
  <div class="container mx-auto px-4">
    <div class="flex justify-center">
      <div class="w-full max-w-md">
        <slot />
      </div>
    </div>
  </div>
</div>
