<!-- src/routes/(marketing)/guest/upgrade/+page.svelte -->
<!-- Guest signup page — adapts to the invite's "Keep their access after
     signup" checkbox (profiles.retain_after_signup):
       - ticked  → upgrade the anonymous guest session into a real account in
                   place (auth.updateUser keeps the same user id, so the
                   profile + map membership carry over) and make the access
                   permanent.
       - unticked → the guest STAYS on the map while filling the form; only
                   on SUBMIT (after validation passes) are they fully retired
                   from the map (retire_self_from_map: pointer row deleted,
                   map unlinked — same as "Remove guest access") and a fresh
                   account is created (signUp), heading toward the usual
                   /account setup. -->
<script lang="ts">
  import { onMount } from "svelte"
  import { goto } from "$app/navigation"
  import {
    ArrowRight,
    Check,
    Loader2,
    MailCheck,
    Sparkles,
  } from "lucide-svelte"
  import { supabase, clearPendingMapId } from "$lib/stores/sessionStore"
  import { mapApi } from "$lib/api/mapApi"
  import { resetMapStores } from "$lib/stores/resetMapStores"
  import { updateOrCreateProfile } from "$lib/helpers/authHelpers"

  let step: "loading" | "form" | "saving" | "confirm" | "done" | "error" =
    "loading"
  let mapName = "the map"
  let email = ""
  let password = ""
  let keepAccess = true
  let errorMessage = ""

  onMount(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const uid = session?.user?.id
      if (!uid) {
        goto("/guest/home")
        return
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("master_map_id, retain_after_signup")
        .eq("id", uid)
        .single()

      // Already a real account (email set, or an anonymous session that was
      // upgraded / has a pending confirmation) — there is nothing to sign up
      // for. Send them to their app instead of looping the guest home (this
      // was the "create account just refreshes the page" bug).
      const su = session.user
      const isAccount =
        su.is_anonymous === false || !!su.email || !!su.new_email
      if (isAccount) {
        goto(profile?.master_map_id ? "/account/mapviewer" : "/account")
        return
      }

      // No map → nothing to sign up for.
      if (!profile?.master_map_id) {
        goto("/guest/home")
        return
      }

      // Ticked invite → the new account keeps the map access (upgrade this
      // session in place). Unticked → fresh signup: the guest STAYS on the
      // map until they submit a valid form, then they are fully retired
      // (pointer row deleted + map unlinked) and a brand-new account is
      // created. Their name is handled by the usual signup flow.
      keepAccess = !!profile.retain_after_signup

      try {
        mapName = localStorage.getItem("guest_map_name") || mapName
      } catch {
        /* storage unavailable */
      }
      step = "form"
    } catch (error) {
      errorMessage = "Could not load your guest details."
      step = "error"
    }
  })

  // Validate BEFORE touching anything — submitting without a valid email
  // used to retire the guest from the map first and only then bounce off
  // Supabase's "invalid email" error, leaving them kicked out with no
  // account.
  function validateForm() {
    const cleanEmail = email.trim()
    if (!cleanEmail) return "Enter your email address."
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail))
      return "That email doesn't look right - check for typos."
    if (!password) return "Choose a password."
    if (password.length < 6)
      return "Your password needs at least 6 characters."
    return ""
  }

  async function createAccount() {
    const problem = validateForm()
    if (problem) {
      errorMessage = problem
      return
    }
    errorMessage = ""
    step = "saving"
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const uid = session?.user?.id
      if (!uid) {
        throw new Error(
          "Your guest session was lost — please open your invite link again.",
        )
      }

      if (keepAccess) {
        await upgradeInPlace(uid)
      } else {
        await signUpFresh(uid)
      }
    } catch (error: any) {
      errorMessage = error?.message || "Could not create your account."
      step = "error"
    }
  }

  // Ticked invite: upgrade THIS anonymous session into a real account. Same
  // user id, so the guest profile (and their place on this map) carries over.
  async function upgradeInPlace(uid: string) {
    const { data, error } = await supabase.auth.updateUser({
      email: email.trim(),
      password,
    })
    if (error) throw friendlyAuthError(error)

    // This path exists because the invite ticked "keep their access after
    // signup" — make the map access permanent (no guest window expiring).
    // Their name is handled by the usual signup flow.
    const { error: profileError } = await supabase
      .from("profiles")
      .update({ access_expires_at: null })
      .eq("id", uid)
    if (profileError) {
      console.warn("Could not make map access permanent:", profileError.message)
    }

    // With email confirmation enabled the new email stays pending until the
    // link is clicked — access keeps working in the meantime.
    const pendingConfirmation = !!data?.user?.new_email
    step = pendingConfirmation ? "confirm" : "done"
    if (!pendingConfirmation) {
      setTimeout(() => goto("/account/mapviewer"), 1400)
    }
  }

  // Unticked invite: the guest does NOT keep the map. Only NOW — after the
  // form validated — do we retire them (pointer row dropped + map unlinked,
  // the same retirement as "Remove guest access", so every member's map
  // loses them right away) and end the anonymous session, then create a
  // fresh account that goes through the usual signup outcome (/account
  // setup).
  async function signUpFresh(uid: string) {
    await retireSelfFromMap(uid)
    // Drop the guest's map from the module-level stores too: the new account
    // lives in the SAME tab memory, and the onboarding "join map" step would
    // otherwise treat the guest's map as "already connected" and attach the
    // new account to it (this was the "still connected after signup" bug).
    resetMapStores()
    clearPendingMapId()
    try {
      await supabase.auth.signOut({ scope: "local" })
    } catch (error) {
      console.warn("Guest sign-out before signup failed:", error)
    }

    const options: Record<string, unknown> = {
      emailRedirectTo: `${window.location.origin}/auth/callback?next=/account`,
    }

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options,
    })
    if (error) throw friendlyAuthError(error)

    // With confirmation on, an already-registered email comes back as a
    // user with no identities instead of an error.
    if (data?.user && data.user.identities?.length === 0) {
      throw new Error(
        "That email already has an AgSKAN account — sign in to it instead, or use a different email.",
      )
    }

    if (data?.session) {
      // Signed in immediately (email confirmation off) — provision the
      // profile exactly like the usual signup path does, then head into the
      // standard account setup.
      try {
        await updateOrCreateProfile(data.session)
      } catch (error) {
        console.warn("Profile provisioning failed:", error)
      }
      step = "done"
      setTimeout(() => goto("/account"), 1400)
    } else {
      // Confirmation email sent — its link finishes setup and lands on
      // /account.
      step = "confirm"
    }
  }

  // Full stop: drop their pointer row and unlink the map server-side (the
  // same retirement the member-side "Remove guest access" button and the
  // expiry cron use) so every other member's map loses them right away. The
  // old client-side disconnect left the pointer row behind, so the team's
  // map kept showing them until the next 60s poll.
  async function retireSelfFromMap(uid: string) {
    try {
      const { error } = await supabase.rpc("retire_self_from_map")
      if (error) throw error
      return
    } catch (error: any) {
      console.warn(
        "retire_self_from_map unavailable, falling back to disconnect:",
        error?.message || error,
      )
    }
    // Fallback for deployments without this migration.
    try {
      const result = await mapApi.disconnectFromMap()
      if (!result.success) {
        console.warn("Guest disconnect before signup failed:", result.message)
      }
    } catch (error) {
      console.warn("Guest disconnect before signup failed:", error)
    }
    try {
      await supabase.from("vehicle_state").delete().eq("vehicle_id", uid)
    } catch (error) {
      console.warn("Guest pointer cleanup failed:", error)
    }
  }

  function friendlyAuthError(error: any) {
    const message = error?.message || ""
    if (/already|registered|exists/i.test(message)) {
      return new Error(
        "That email already has an AgSKAN account — sign in to it instead, or use a different email.",
      )
    }
    return error
  }
</script>

<svelte:head>
  <title>Create your account — AgSKAN</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="flex min-h-[70vh] items-center justify-center px-4 py-10">
  <div
    class="w-full max-w-md rounded-2xl border border-base-300 bg-base-100 p-6 shadow-xl sm:p-8"
  >
    {#if step === "loading"}
      <div class="flex flex-col items-center gap-3 py-8 text-base-content/60">
        <Loader2 size={24} class="animate-spin" />
        <p class="text-sm">Checking your guest access…</p>
      </div>
    {:else if step === "form" || step === "saving"}
      <div class="flex flex-col items-center gap-2 text-center">
        <div
          class="mb-1 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/15"
        >
          <Sparkles size={26} class="text-amber-500" />
        </div>
        <p class="text-xs font-semibold uppercase tracking-wider text-amber-600">
          Create your account
        </p>
        <h1 class="text-xl font-bold text-base-content">
          {#if keepAccess}
            Keep your access to {mapName}
          {:else}
            Create your AgSKAN account
          {/if}
        </h1>
        <p class="mt-1 text-sm text-base-content/60">
          {#if keepAccess}
            This invite lets you stay on the map after you create an account —
            your access continues without a guest window.
          {:else}
            Heads up — this guest invite doesn't include post-signup access.
            Creating an account will remove you from {mapName} as a guest and
            set you up with your own account.
          {/if}
        </p>

        <div class="mt-4 w-full text-left">
          <label
            class="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-base-content/50"
            for="guest-account-email">Email</label
          >
          <input
            id="guest-account-email"
            type="email"
            bind:value={email}
            on:input={() => (errorMessage = "")}
            placeholder="you@example.com"
            autocomplete="email"
            class="input input-bordered w-full"
          />
        </div>

        <div class="mt-4 w-full text-left">
          <label
            class="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-base-content/50"
            for="guest-account-password">Password</label
          >
          <input
            id="guest-account-password"
            type="password"
            bind:value={password}
            on:input={() => (errorMessage = "")}
            placeholder="At least 6 characters"
            autocomplete="new-password"
            class="input input-bordered w-full"
          />
        </div>

        {#if errorMessage}
          <p class="mt-3 w-full text-left text-xs font-medium text-error">
            {errorMessage}
          </p>
        {/if}

        <button
          class="group mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-hover px-4 py-2.5 text-sm font-medium text-base-content shadow-lg transition-all duration-300 hover:bg-hover/90 disabled:cursor-not-allowed disabled:opacity-60"
          on:click={createAccount}
          disabled={step === "saving"}
        >
          {#if step === "saving"}
            <Loader2 size={16} class="animate-spin" /> Creating your account…
          {:else}
            Create account
            <ArrowRight
              size={16}
              class="transition-transform group-hover:translate-x-1"
            />
          {/if}
        </button>

        <p class="mt-3 text-xs text-base-content/50">
          By creating an account you agree to AgSKAN's
          <a href="/terms-of-service" class="hover:underline">Terms of Service</a
          >
          and
          <a href="/privacy-policy" class="hover:underline">Privacy Policy</a>.
        </p>
      </div>
    {:else if step === "confirm"}
      <div class="flex flex-col items-center gap-3 py-2 text-center">
        <div
          class="flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/15"
        >
          <MailCheck size={26} class="text-amber-500" />
        </div>
        <h1 class="text-xl font-bold text-base-content">Confirm your email</h1>
        <p class="text-sm text-base-content/60">
          We've sent a confirmation link to <strong>{email}</strong>.
          {#if keepAccess}
            Your map access keeps working while you confirm.
          {:else}
            Click it to finish setting up your account.
          {/if}
        </p>
        <button
          class="group mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-hover px-4 py-2.5 text-sm font-medium text-base-content shadow-lg transition-all duration-300 hover:bg-hover/90"
          on:click={() => goto(keepAccess ? "/account/mapviewer" : "/login")}
        >
          {keepAccess ? "Continue to the map" : "Go to sign in"}
          <ArrowRight
            size={16}
            class="transition-transform group-hover:translate-x-1"
          />
        </button>
      </div>
    {:else if step === "done"}
      <div class="flex flex-col items-center gap-3 py-2 text-center">
        <div
          class="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15"
        >
          <Check size={26} class="text-emerald-500" />
        </div>
        <h1 class="text-xl font-bold text-base-content">You're all set</h1>
        <p class="text-sm text-base-content/60">
          {#if keepAccess}
            Your account is created and you're staying on {mapName}. Taking
            you to the map…
          {:else}
            Your account is ready. Taking you through account setup…
          {/if}
        </p>
        <Loader2 size={18} class="animate-spin text-base-content/50" />
      </div>
    {:else}
      <div class="flex flex-col items-center gap-3 py-2 text-center">
        <h1 class="text-lg font-semibold text-base-content">
          Something went wrong
        </h1>
        <p class="text-sm text-base-content/60">{errorMessage}</p>
        <button
          class="group mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-hover px-4 py-2.5 text-sm font-medium text-base-content shadow-lg transition-all duration-300 hover:bg-hover/90"
          on:click={() => goto("/guest/home")}
        >
          Back to your guest home
          <ArrowRight
            size={16}
            class="transition-transform group-hover:translate-x-1"
          />
        </button>
      </div>
    {/if}
  </div>
</div>
