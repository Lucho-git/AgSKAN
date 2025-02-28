<!-- src/routes/auth/callback/+page.svelte -->
<script lang="ts">
  import { onMount } from "svelte"
  import { goto } from "$app/navigation"
  import { supabase, session } from "$lib/stores/sessionStore"

  // Show a loading indicator
  let loading = true
  let error = null
  let debugInfo = {
    hash: "",
    query: "",
    sessionResult: null,
  }

  onMount(async () => {
    console.log("Auth callback mounting")
    try {
      // Store debug info
      debugInfo.hash = window.location.hash
      debugInfo.query = window.location.search

      // Get search params from URL
      const hashParams = new URLSearchParams(window.location.hash.substring(1))
      const queryParams = new URLSearchParams(window.location.search)

      console.log("Auth callback parameters:", {
        hash: hashParams.toString(),
        query: queryParams.toString(),
      })

      let sessionResult = null

      // OAuth login will return a hash fragment
      if (window.location.hash) {
        console.log("Processing hash fragment")
        const accessToken = hashParams.get("access_token")
        const refreshToken = hashParams.get("refresh_token")

        if (accessToken && refreshToken) {
          // Set the session manually
          console.log("Setting session from tokens")
          const { data, error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })

          if (sessionError) throw sessionError
          sessionResult = data.session

          // Manually update the store as well
          if (data.session) {
            console.log("Manually updating session store")
            session.set(data.session)
          }
        }
      }
      // Email verification uses query parameters
      else if (
        queryParams.get("type") === "recovery" ||
        queryParams.get("type") === "signup"
      ) {
        console.log("Processing code exchange")
        const { data, error: codeError } =
          await supabase.auth.exchangeCodeForSession(queryParams.get("code"))

        if (codeError) throw codeError
        sessionResult = data.session

        // Manually update the store as well
        if (data.session) {
          console.log("Manually updating session store from code exchange")
          session.set(data.session)
        }
      }

      debugInfo.sessionResult = sessionResult ? "success" : "failure"

      console.log("Auth process complete, redirecting")

      // Wait a moment to ensure all state updates
      setTimeout(() => {
        console.log("Delayed redirect to static_auth")
        goto("/static_auth")
      }, 500)
    } catch (e) {
      console.error("Error during auth callback:", e)
      error = e.message
      debugInfo.sessionResult = "error: " + e.message
      loading = false
    }
  })
</script>

<svelte:head>
  <title>Authentication</title>
</svelte:head>

{#if loading}
  <div class="flex h-screen items-center justify-center">
    <div class="text-center">
      <h2 class="mb-4 text-xl font-semibold">Completing authentication...</h2>
      <div
        class="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"
      ></div>

      <!-- Debug info -->
      <div class="mt-8 rounded-lg bg-gray-50 p-4 text-left text-sm">
        <p>Hash: {debugInfo.hash || "none"}</p>
        <p>Query: {debugInfo.query || "none"}</p>
        <p>Session Result: {debugInfo.sessionResult || "pending"}</p>
      </div>
    </div>
  </div>
{:else if error}
  <div class="flex h-screen items-center justify-center">
    <div class="text-center">
      <h2 class="mb-4 text-xl font-semibold">Authentication Error</h2>
      <p class="text-red-500">{error}</p>
      <a
        href="/login"
        class="mt-4 inline-block rounded bg-blue-500 px-4 py-2 text-white"
        >Return to login</a
      >

      <!-- Debug info -->
      <div class="mt-8 rounded-lg bg-gray-50 p-4 text-left text-sm">
        <p>Hash: {debugInfo.hash || "none"}</p>
        <p>Query: {debugInfo.query || "none"}</p>
        <p>Session Result: {debugInfo.sessionResult || "pending"}</p>
      </div>
    </div>
  </div>
{/if}
