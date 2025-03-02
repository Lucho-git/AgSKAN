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
      goto("/static_auth")
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

<div
  class="mx-auto mb-12 flex min-h-[70vh] max-w-lg place-content-center content-center items-center text-center"
>
  <div class="flex w-64 flex-col lg:w-80">
    <slot />
  </div>
</div>
