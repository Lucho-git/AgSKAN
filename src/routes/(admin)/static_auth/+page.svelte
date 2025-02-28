<script>
  import { browser } from "$app/environment"
  import { session } from "$lib/stores/sessionStore"
</script>

<svelte:head>
  <title>Static Auth Demo</title>
</svelte:head>

{#if $session && browser}
  <div class="mt-6 rounded-lg bg-white p-6 shadow">
    <h2 class="mb-4 text-xl font-semibold">Authentication Success</h2>
    <p>
      You are successfully authenticated in a fully static SvelteKit
      application. This page demonstrates client-side only authentication
      without any server components.
    </p>

    <div class="mt-6 rounded-lg bg-yellow-50 p-4">
      <h3 class="font-semibold text-yellow-800">
        Note about Static Authentication
      </h3>
      <p class="mt-2 text-yellow-700">
        This page is rendered entirely client-side. Your authentication token is
        stored securely in the browser and used to make authenticated API calls
        to Supabase. No server-side rendering or API routes are used in this
        implementation.
      </p>
    </div>
  </div>
{/if}
