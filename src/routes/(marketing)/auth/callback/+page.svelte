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
    profileCreated: false,
    redirectTo: "",
  }

  async function createOrUpdateProfile(sessionData) {
    // Same profile creation logic as before
    try {
      console.log("Creating or updating profile for user:", sessionData.user.id)

      // Extract all available user data
      const userData = {
        id: sessionData.user.id,
        email: sessionData.user.email,
        full_name: sessionData.user.user_metadata?.full_name || null,
        avatar_url: sessionData.user.user_metadata?.avatar_url || null,
        updated_at: new Date().toISOString(),
        onboarded: false,
        last_sign_in: new Date().toISOString(),
        provider: sessionData.user.app_metadata?.provider || "email",
      }

      console.log("User data prepared:", userData)

      // First check if profile exists
      const { data: existingProfile, error: fetchError } = await supabase
        .from("profiles")
        .select("id, created_at, email")
        .eq("id", sessionData.user.id)
        .single()

      if (fetchError && fetchError.code !== "PGRST116") {
        console.error("Error checking existing profile:", fetchError)
        return false
      }

      if (existingProfile) {
        console.log("Existing profile found, updating:", existingProfile)

        // Profile exists - just update sign in time and other fields if needed
        const { error: updateError } = await supabase
          .from("profiles")
          .update({
            last_sign_in: userData.last_sign_in,
            updated_at: userData.updated_at,
            // Add email if it doesn't exist
            ...(existingProfile.email ? {} : { email: userData.email }),
            // Only update name/avatar if they're null in existing profile
            ...(existingProfile.full_name
              ? {}
              : { full_name: userData.full_name }),
            ...(existingProfile.avatar_url
              ? {}
              : { avatar_url: userData.avatar_url }),
          })
          .eq("id", sessionData.user.id)

        if (updateError) {
          console.error("Error updating profile:", updateError)
          return false
        }

        console.log("Profile updated successfully")
        return true
      } else {
        console.log("No existing profile found, creating new profile")

        // Create new profile with additional created_at field
        const { error: profileError } = await supabase.from("profiles").insert({
          ...userData,
          created_at: new Date().toISOString(),
        })

        if (profileError && profileError.code !== "23505") {
          console.error("Error creating profile:", profileError)
          return false
        } else {
          console.log(
            "Profile created successfully for user:",
            sessionData.user.id,
          )

          // Also create a free subscription entry
          const { error: subscriptionError } = await supabase
            .from("user_subscriptions")
            .insert({
              user_id: sessionData.user.id,
              subscription: "FREE",
              marker_limit: 100,
              trail_limit: 100000,
              current_seats: 1,
              updated_at: new Date().toISOString(),
              created_at: new Date().toISOString(),
            })

          if (subscriptionError && subscriptionError.code !== "23505") {
            console.error("Error creating subscription:", subscriptionError)
          } else {
            console.log(
              "Free subscription created for user:",
              sessionData.user.id,
            )
          }

          return true
        }
      }
    } catch (e) {
      console.error("Error in profile creation/update:", e)
      return false
    }
  }

  onMount(async () => {
    console.log("Auth callback mounting - PROFILE CREATION WILL HAPPEN HERE")
    try {
      // Store debug info
      debugInfo.hash = window.location.hash
      debugInfo.query = window.location.search

      // Get search params from URL
      const hashParams = new URLSearchParams(window.location.hash.substring(1))
      const queryParams = new URLSearchParams(window.location.search)

      // Get next URL from query params or use default
      debugInfo.redirectTo = queryParams.get("next") || "/account"

      console.log("Auth callback parameters:", {
        hash: hashParams.toString(),
        query: queryParams.toString(),
        redirectTo: debugInfo.redirectTo,
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

            // Create or update profile
            debugInfo.profileCreated = await createOrUpdateProfile(data.session)
            console.log("Profile creation result:", debugInfo.profileCreated)
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

          // Create or update profile
          debugInfo.profileCreated = await createOrUpdateProfile(data.session)
          console.log("Profile creation result:", debugInfo.profileCreated)
        }
      }

      debugInfo.sessionResult = sessionResult ? "success" : "failure"

      console.log(
        "Auth process complete, redirecting to:",
        debugInfo.redirectTo,
      )

      // Wait a moment to ensure all state updates
      setTimeout(() => {
        goto(debugInfo.redirectTo)
      }, 1000)
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
      <div class="skeleton mb-4 h-12 w-12 rounded-full"></div>

      <!-- Debug info -->
      <div class="mt-8 rounded-lg bg-gray-50 p-4 text-left text-sm">
        <p>Hash: {debugInfo.hash || "none"}</p>
        <p>Query: {debugInfo.query || "none"}</p>
        <p>Session Result: {debugInfo.sessionResult || "pending"}</p>
        <p>
          Profile Created/Updated: {debugInfo.profileCreated ? "Yes" : "No"}
        </p>
        <p>Redirect To: {debugInfo.redirectTo || "default"}</p>
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
        <p>
          Profile Created/Updated: {debugInfo.profileCreated ? "Yes" : "No"}
        </p>
        <p>Redirect To: {debugInfo.redirectTo || "default"}</p>
      </div>
    </div>
  </div>
{/if}
