<!-- src/routes/login/+layout.svelte -->
<script>
  import { onMount } from "svelte"
  import { session } from "$lib/stores/sessionStore"
  import { goto } from "$app/navigation"
  import { browser } from "$app/environment"

  // Redirect logged-in users away from login pages
  onMount(() => {
    if (browser && $session) {
      goto("/static_auth")
    }
  })

  // Also watch for session changes
  $: if (browser && $session) {
    goto("/static_auth")
  }
</script>

<div
  class="mx-auto mb-12 flex min-h-[70vh] max-w-lg place-content-center content-center items-center text-center"
>
  <div class="flex w-64 flex-col lg:w-80">
    <slot />
  </div>
</div>
