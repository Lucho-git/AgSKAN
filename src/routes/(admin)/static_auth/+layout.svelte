<script>
  import { onMount } from "svelte"
  import { goto } from "$app/navigation"
  import {
    session,
    supabase,
    initializeSession,
  } from "$lib/stores/sessionStore"
  import { browser } from "$app/environment"
  import { page } from "$app/stores"

  let sessionChecked = false
  let sessionData = null
  let sessionError = null
  let redirecting = false

  console.log("Layout component initializing")
  console.log("Current session state:", $session)

  // Protect this route - redirect to login if not authenticated
  onMount(async () => {
    console.log("Layout mounted, checking session...")

    if (browser) {
      try {
        // Force a refresh of the session
        console.log("Explicitly initializing session...")
        await initializeSession()

        console.log("Getting session directly...")
        const { data, error } = await supabase.auth.getSession()
        sessionData = data.session
        sessionError = error

        console.log("Direct session check result:", sessionData, error)

        // Store session details for debugging
        if (sessionData) {
          console.log("User authenticated:", sessionData.user.email)
          console.log("Access token exists:", Boolean(sessionData.access_token))
          console.log(
            "Session expires:",
            new Date(sessionData.expires_at * 1000).toLocaleString(),
          )
        } else {
          console.log("No session found directly")

          // We wait a bit to see if the store gets populated
          setTimeout(async () => {
            console.log("Delayed session check, store value:", $session)
            if (!$session && !redirecting) {
              console.log("Still no session after delay, redirecting...")
              redirecting = true
              goto("/login")
            }
          }, 1000)
        }
      } catch (e) {
        console.error("Error checking session:", e)
        sessionError = e
      } finally {
        sessionChecked = true
      }
    }
  })

  // Debug the session store changes
  $: {
    console.log("Session store changed:", $session)
    if ($session) {
      console.log("Session detected in store")
    }
  }

  // Watch for session changes and prevent immediate redirect
  let redirectTimeout
  $: if (browser && sessionChecked && $session === null && !redirecting) {
    console.log("Session is null but giving it a moment...")

    // Clear any existing timeout
    if (redirectTimeout) clearTimeout(redirectTimeout)

    // Set a new timeout
    redirectTimeout = setTimeout(() => {
      console.log("Timeout completed, session still null:", $session === null)
      if ($session === null) {
        console.log("Redirecting to login after timeout...")
        redirecting = true
        goto("/login")
      }
    }, 2000) // Give it 2 seconds to populate
  }

  // Format JSON for display
  function formatJson(obj) {
    return JSON.stringify(obj, null, 2)
  }

  // Handle sign out
  async function handleSignOut() {
    console.log("Signing out...")
    await supabase.auth.signOut()
    goto("/login")
  }

  // Clean up on unmount
  onMount(() => {
    return () => {
      if (redirectTimeout) clearTimeout(redirectTimeout)
    }
  })
</script>

<div class="container mx-auto p-6">
  <h1 class="mb-6 text-3xl font-bold">Static Authentication Details</h1>

  <!-- Debug info -->
  <div class="mb-4 rounded-lg bg-blue-50 p-4">
    <h2 class="font-semibold">Debug Information</h2>
    <p>Session checked: {sessionChecked ? "Yes" : "No"}</p>
    <p>Direct session check: {sessionData ? "Found" : "Not found"}</p>
    <p>Store session: {$session ? "Found" : "Not found"}</p>
    <p>Current URL: {$page.url.pathname}</p>
    {#if sessionError}
      <p class="text-red-500">Error: {sessionError.message}</p>
    {/if}
  </div>

  {#if $session}
    <div class="grid gap-6">
      <div class="rounded-lg bg-green-50 p-4">
        <p class="font-semibold text-green-700">✓ Authenticated</p>
        <p class="mt-2">User is signed in as {$session.user.email}</p>
      </div>

      <div class="grid gap-6 md:grid-cols-2">
        <div class="rounded-lg bg-white p-6 shadow">
          <h2 class="mb-4 text-xl font-semibold">User Info</h2>
          <div class="mt-4">
            <p><span class="font-semibold">ID:</span> {$session.user.id}</p>
            <p>
              <span class="font-semibold">Email:</span>
              {$session.user.email}
            </p>
            <p>
              <span class="font-semibold">Last Signed In:</span>
              {new Date($session.user.last_sign_in_at).toLocaleString()}
            </p>
            <p>
              <span class="font-semibold">Created At:</span>
              {new Date($session.user.created_at).toLocaleString()}
            </p>
          </div>
        </div>

        <div class="rounded-lg bg-white p-6 shadow">
          <h2 class="mb-4 text-xl font-semibold">Session Details</h2>
          <div class="mt-4">
            <p>
              <span class="font-semibold">Expires At:</span>
              {new Date($session.expires_at * 1000).toLocaleString()}
            </p>
            <p>
              <span class="font-semibold">Access Token Available:</span>
              {$session.access_token ? "✓" : "✗"}
            </p>
            <p>
              <span class="font-semibold">Refresh Token Available:</span>
              {$session.refresh_token ? "✓" : "✗"}
            </p>
          </div>
        </div>
      </div>

      <div class="rounded-lg bg-white p-6 shadow">
        <h2 class="mb-4 text-xl font-semibold">Full Session Data (JSON)</h2>
        <div class="overflow-x-auto">
          <pre
            class="whitespace-pre-wrap rounded bg-gray-100 p-4 text-sm">{formatJson(
              $session,
            )}</pre>
        </div>
      </div>

      <div class="mt-6">
        <button
          on:click={handleSignOut}
          class="rounded bg-red-600 px-4 py-2 text-white hover:bg-red-700"
        >
          Sign Out
        </button>

        <a
          href="/"
          class="ml-4 inline-block rounded border border-gray-300 px-4 py-2 hover:bg-gray-50"
        >
          Go to Home
        </a>
      </div>
    </div>

    <slot />
  {:else if sessionData && !$session}
    <!-- We have a direct session but the store isn't updated -->
    <div class="rounded-lg bg-yellow-50 p-6">
      <h2 class="text-lg font-semibold">Session detected but not in store</h2>
      <p class="mt-2">
        You appear to be authenticated, but the session store hasn't updated.
        This could be due to initialization timing.
      </p>
      <div class="mt-4">
        <button
          on:click={() => session.set(sessionData)}
          class="rounded bg-blue-500 px-4 py-2 text-white"
        >
          Manually set session
        </button>
      </div>
      <pre class="mt-4 rounded bg-gray-100 p-4 text-sm">{formatJson(
          sessionData,
        )}</pre>
    </div>
  {:else if sessionChecked && !sessionData}
    <div class="flex flex-col items-center justify-center p-12">
      <div class="rounded-lg bg-red-50 p-6 text-center">
        <h2 class="mb-2 text-xl font-semibold text-red-700">
          No Session Found
        </h2>
        <p>
          You don't appear to be authenticated. Redirecting to login page...
        </p>
        <div class="mt-4">
          <a
            href="/login"
            class="inline-block rounded bg-blue-500 px-4 py-2 text-white"
          >
            Go to Login
          </a>
        </div>
      </div>
    </div>
  {:else}
    <div class="flex flex-col items-center justify-center p-12">
      <div class="skeleton mb-4 h-12 w-12 rounded-full"></div>

      <p class="mt-4 text-lg">Checking authentication...</p>
    </div>
  {/if}
</div>
