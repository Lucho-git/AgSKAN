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
    // A fresh sign-out hard-reloads here; clear the coordination flag.
    if (browser) sessionStorage.removeItem("signout_in_progress")

    if (browser && $session) {
      console.log("User already logged in, redirecting away from login page")
      goto("/account")
    }
    initialCheckComplete = true
  })

  // Redirect to /account once a genuine session is established (sign-in)
  $: if (browser && initialCheckComplete && $session) {
    goto("/account")
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
