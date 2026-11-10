<!-- src/routes/auth/callback/+page.svelte -->
<script lang="ts">
  import { onMount } from "svelte"
  import { goto } from "$app/navigation"
  import { supabase, session, initialAuthUrl } from "$lib/stores/sessionStore"
  import { toast } from "svelte-sonner"

  // Show a loading indicator
  let loading = true
  let error: string | null = null
  let debugInfo = {
    hash: "",
    query: "",
    sessionResult: "",
    profileCreated: false,
    redirectTo: "",
    isDeepLink: false,
    isRecovery: false,
  }

  async function createOrUpdateProfile(sessionData) {
    // Same profile creation logic as before
    try {
      console.log("Creating or updating profile for user:", sessionData.user.id)

      const getMetadataString = (...values) =>
        values
          .find((value) => typeof value === "string" && value.trim())
          ?.trim() || null

      const metadataFullName = getMetadataString(
        sessionData.user.user_metadata?.full_name,
        sessionData.user.user_metadata?.name,
      )
      const metadataAvatarUrl = getMetadataString(
        sessionData.user.user_metadata?.avatar_url,
        sessionData.user.user_metadata?.picture,
      )

      // Extract all available user data
      const userData = {
        id: sessionData.user.id,
        email: sessionData.user.email,
        full_name: metadataFullName,
        avatar_url: metadataAvatarUrl,
        updated_at: new Date().toISOString(),
        onboarded: false,
        last_sign_in: new Date().toISOString(),
        provider: sessionData.user.app_metadata?.provider || "email",
      }

      console.log("User data prepared:", userData)

      // First check if profile exists
      const { data: existingProfile, error: fetchError } = await supabase
        .from("profiles")
        .select("id, created_at, email, full_name, avatar_url")
        .eq("id", sessionData.user.id)
        .single()

      if (fetchError && fetchError.code !== "PGRST116") {
        console.error("Error checking existing profile:", fetchError)
        return false
      }

      if (existingProfile) {
        console.log("Existing profile found, updating:", existingProfile)

        const profileUpdates = {
          last_sign_in: userData.last_sign_in,
          updated_at: userData.updated_at,
        }

        if (!existingProfile.email && userData.email) {
          profileUpdates.email = userData.email
        }

        if (!existingProfile.full_name && userData.full_name) {
          profileUpdates.full_name = userData.full_name
        } else if (!userData.full_name) {
          console.warn(
            "Auth callback did not receive a usable full_name; preserving existing profile name",
            {
              userId: sessionData.user.id,
              provider: userData.provider,
              hasExistingFullName: !!existingProfile.full_name,
              metadataKeys: Object.keys(sessionData.user.user_metadata || {}),
            },
          )
        }

        if (!existingProfile.avatar_url && userData.avatar_url) {
          profileUpdates.avatar_url = userData.avatar_url
        }

        // Profile exists - just update sign in time and other fields if needed
        const { error: updateError } = await supabase
          .from("profiles")
          .update(profileUpdates)
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

  // GoTrue hands back a machine code (otp_expired, access_denied, ...) when a
  // one-time link has already been consumed or has timed out.
  function describeLinkError(code: string | null) {
    const known: Record<string, string> = {
      otp_expired: "That reset link has expired.",
      access_denied: "That reset link has already been used.",
      flow_state_not_found: "That link is no longer valid.",
    }
    return (code && known[code]) || "That link is no longer valid."
  }

  onMount(async () => {
    console.log("Auth callback mounting - PROFILE CREATION WILL HAPPEN HERE")
    let isRecoveryFlow = false
    try {
      // On a fresh page load supabase-js may already have stripped the tokens out
      // of the URL, so fall back to the load-time snapshot — but only for the page
      // that produced it, since SPA navigation keeps a stale snapshot from before.
      const sameDocument = initialAuthUrl.pathname === window.location.pathname
      const liveHash = new URLSearchParams(
        window.location.hash.replace(/^#/, ""),
      )
      const liveQuery = new URLSearchParams(window.location.search)
      const hashParams = liveHash.toString()
        ? liveHash
        : sameDocument
          ? initialAuthUrl.hash
          : liveHash
      const queryParams = liveQuery.toString()
        ? liveQuery
        : sameDocument
          ? initialAuthUrl.query
          : liveQuery
      debugInfo.hash = initialAuthUrl.rawHash
      debugInfo.query = initialAuthUrl.rawSearch

      // GoTrue reports failures as #error=access_denied&error_code=otp_expired...
      const linkErrorCode =
        hashParams.get("error_code") ||
        queryParams.get("error_code") ||
        hashParams.get("error") ||
        queryParams.get("error")
      const linkErrorDescription =
        hashParams.get("error_description") ||
        queryParams.get("error_description")

      // FIXED: Check for recovery type in BOTH query params AND hash params
      isRecoveryFlow =
        queryParams.get("type") === "recovery" ||
        hashParams.get("type") === "recovery"
      debugInfo.isRecovery = isRecoveryFlow

      console.log("Recovery check:", {
        queryType: queryParams.get("type"),
        hashType: hashParams.get("type"),
        hasLinkError: Boolean(linkErrorCode || linkErrorDescription),
        isRecoveryFlow,
      })

      // FIXED: Properly handle the next parameter to avoid encoding issues
      let nextParam = queryParams.get("next") || "/account"

      // Clean up any malformed encoding and ensure proper format
      if (nextParam.includes("%")) {
        // If it contains % but doesn't start with /, it might be malformed
        try {
          nextParam = decodeURIComponent(nextParam)
        } catch (e) {
          console.warn("Failed to decode next parameter:", nextParam)
          nextParam = "/account" // fallback
        }
      }

      // Ensure it starts with /
      if (!nextParam.startsWith("/")) {
        nextParam = "/" + nextParam.replace(/^%*/, "") // Remove any leading % characters
      }

      // Additional safety check for the specific corruption we saw
      if (nextParam.includes("�") || nextParam.includes("%EF%BF%BD")) {
        nextParam = "/account"
      }

      // FIXED: Override redirect for recovery flows
      const postResetNext = nextParam
      if (isRecoveryFlow) {
        // Carry the caller's destination through so we can honour it after the
        // password has been changed (otherwise they always land on /account).
        debugInfo.redirectTo = `/reset-password?next=${encodeURIComponent(postResetNext)}`
        console.log("Recovery flow detected, redirecting to password reset")
      } else {
        debugInfo.redirectTo = nextParam
      }

      // ADDED: Check if this is a deep link flow (tokens in query params)
      const deepLinkAccessToken = queryParams.get("access_token")
      const deepLinkRefreshToken = queryParams.get("refresh_token")
      // Sign-in confirmations and recovery links deliver their tokens in the hash.
      const hashAccessToken = hashParams.get("access_token")
      const hashRefreshToken = hashParams.get("refresh_token")
      const authCode = queryParams.get("code")
      const tokenHash = queryParams.get("token_hash")
      // Refresh token alone is sufficient — we can derive a fresh access token.
      debugInfo.isDeepLink = !!deepLinkRefreshToken

      console.log("Auth callback parameters:", {
        hash: hashParams.toString(),
        query: queryParams.toString(),
        redirectTo: debugInfo.redirectTo,
        isDeepLink: debugInfo.isDeepLink,
        isRecovery: debugInfo.isRecovery,
        linkErrorCode,
      })

      // A link that expired or was already used comes back with an error and no
      // session, so stop before sending anyone to a reset form they can't use.
      if (linkErrorCode || linkErrorDescription) {
        throw new Error(
          linkErrorDescription || describeLinkError(linkErrorCode),
        )
      }

      // Identity carried in the URL always wins over whatever session the browser
      // happens to hold — a shared computer must not reset the wrong account.
      const urlAccessToken = deepLinkAccessToken || hashAccessToken
      const urlRefreshToken = deepLinkRefreshToken || hashRefreshToken
      const hasUrlIdentity = Boolean(
        urlAccessToken || urlRefreshToken || authCode || tokenHash,
      )
      let sessionResult = hasUrlIdentity
        ? null
        : (await supabase.auth.getSession()).data.session

      // Fall back to handling the tokens ourselves if supabase-js could not.
      if (!sessionResult) {
        if (urlAccessToken && urlRefreshToken) {
          console.log("Setting session from tokens")
          const { data, error: sessionError } = await supabase.auth.setSession({
            access_token: urlAccessToken,
            refresh_token: urlRefreshToken,
          })
          if (sessionError) throw sessionError
          sessionResult = data.session
        } else if (deepLinkRefreshToken) {
          // Refresh-only deep links: derive a fresh session from the token.
          console.log("Deriving session from refresh token")
          const { data, error: refreshError } =
            await supabase.auth.refreshSession({
              refresh_token: deepLinkRefreshToken,
            })
          if (refreshError) throw refreshError
          sessionResult = data.session
        } else if (authCode) {
          // Email confirmation / recovery delivered as a PKCE code
          console.log("Processing code exchange for type:", queryParams.get("type"))
          const { data, error: codeError } =
            await supabase.auth.exchangeCodeForSession(authCode)
          if (codeError) throw codeError
          sessionResult = data.session
        } else if (tokenHash) {
          // Email templates that verify with a token hash instead of tokens
          console.log("Verifying token hash for type:", queryParams.get("type"))
          const { data, error: otpError } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: (queryParams.get("type") || "recovery") as "recovery",
          })
          if (otpError) throw otpError
          sessionResult = data.session
        }
      }

      if (sessionResult) {
        console.log("Manually updating session store")
        session.set(sessionResult)

        // Create or update profile
        debugInfo.profileCreated = await createOrUpdateProfile(sessionResult)
        console.log("Profile creation result:", debugInfo.profileCreated)

        // FIXED: Show appropriate toast based on recovery type
        if (isRecoveryFlow) {
          toast.success("Recovery link verified!", {
            description: "Please set your new password.",
            duration: 4000,
          })
        } else {
          const userName =
            sessionResult.user.user_metadata?.full_name ||
            sessionResult.user.user_metadata?.name ||
            sessionResult.user.email?.split("@")[0] ||
            "User"
          const isSignup = queryParams.get("type") === "signup"

          toast.success(
            isSignup ? `Welcome, ${userName}!` : `Welcome back, ${userName}!`,
            {
              description: isSignup
                ? "Your account has been created successfully."
                : "You have been automatically signed in.",
              duration: 4000,
            },
          )
        }
      } else if (isRecoveryFlow) {
        // A recovery link that yields no session can never set a password, so
        // send the user back for a fresh link instead of an unusable form.
        throw new Error("That reset link is no longer valid.")
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
      const message = e instanceof Error ? e.message : String(e)
      console.error("Error during auth callback:", e)
      debugInfo.sessionResult = "error: " + message

      if (isRecoveryFlow) {
        // Reset links are single-use and short-lived; the fix is always a new one.
        toast.error("That reset link didn't work", {
          description:
            "Reset links can only be used once and expire after an hour. Request a new one to continue.",
          duration: 8000,
        })
        setTimeout(() => {
          goto("/login/forgot_password?error=link_expired")
        }, 1200)
        return
      }

      error = message
      loading = false

      // ADDED: Show error toast for failed authentication
      toast.error("Authentication failed", {
        description: "Please try logging in again.",
        duration: 5000,
        action: {
          label: "Go to Login",
          onClick: () => goto("/login"),
        },
      })
    }
  })
</script>

<!-- Rest of your template stays the same -->
<svelte:head>
  <title>Authentication</title>
</svelte:head>

{#if loading}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-base-100 bg-opacity-50 backdrop-blur-sm"
  >
    <div
      class="container mx-auto flex flex-col items-center justify-center px-4"
    >
      <div class="flex flex-col items-center">
        <div class="skeleton mb-4 h-12 w-12 rounded-full"></div>
        <p class="text-lg">Just a moment...</p>
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
    </div>
  </div>
{/if}
