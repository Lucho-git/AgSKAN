<!-- src/routes/(marketing)/guest/upgrade/+page.svelte -->
<!-- In-app signup for guests whose invite was created with "Keep their access
     after signup" ticked (profiles.retain_after_signup). Converts the
     anonymous guest session into a real account via auth.updateUser — the
     user id stays the same, so the profile (and their membership of the map)
     carries over and they stay joined. The usual signup flow is used for
     guests without the retain flag (see $lib/utils/guestUpgrade). -->
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
  import { supabase } from "$lib/stores/sessionStore"

  let step: "loading" | "form" | "saving" | "confirm" | "done" | "error" =
    "loading"
  let mapName = "the map"
  let fullName = ""
  let email = ""
  let password = ""
  let errorMessage = ""

  onMount(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const uid = session?.user?.id
      // Only anonymous guests qualify — a real account (or signed-out
      // visitor) goes back to the guest home.
      if (!uid || session?.user?.email) {
        goto("/guest/home")
        return
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, master_map_id, retain_after_signup")
        .eq("id", uid)
        .single()

      // No map, or the invite wasn't marked to keep access after signup.
      if (!profile?.master_map_id || !profile?.retain_after_signup) {
        goto("/guest/home")
        return
      }

      fullName =
        profile.full_name && profile.full_name !== "Visitor"
          ? profile.full_name
          : ""
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

  async function createAccount() {
    if (!email.trim() || !password) {
      errorMessage = "Enter your email and a password."
      return
    }
    if (password.length < 6) {
      errorMessage = "Your password needs at least 6 characters."
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

      // Upgrade THIS anonymous session into a real account. Same user id, so
      // the guest profile (and their place on this map) carries over.
      const { data, error } = await supabase.auth.updateUser({
        email: email.trim(),
        password,
      })
      if (error) {
        const message = error.message || ""
        if (/already|registered|exists/i.test(message)) {
          throw new Error(
            "That email already has an AgSKAN account — sign in to it instead, or use a different email.",
          )
        }
        throw error
      }

      // This path exists because the invite ticked "keep their access after
      // signup" — make the map access permanent (no guest window expiring).
      const patch: Record<string, unknown> = { access_expires_at: null }
      if (fullName.trim()) patch.full_name = fullName.trim()
      const { error: profileError } = await supabase
        .from("profiles")
        .update(patch)
        .eq("id", uid)
      if (profileError) {
        console.warn(
          "Could not make map access permanent:",
          profileError.message,
        )
      }

      // With email confirmation enabled the new email stays pending until
      // the link is clicked — access keeps working in the meantime.
      const pendingConfirmation = !!data?.user?.new_email
      step = pendingConfirmation ? "confirm" : "done"
      if (!pendingConfirmation) {
        setTimeout(() => goto("/account/mapviewer"), 1400)
      }
    } catch (error: any) {
      errorMessage = error?.message || "Could not create your account."
      step = "error"
    }
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
          Keep your access to {mapName}
        </h1>
        <p class="mt-1 text-sm text-base-content/60">
          This invite lets you stay on the map after you create an account —
          your access continues without a guest window.
        </p>

        <div class="mt-4 w-full text-left">
          <label
            class="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-base-content/50"
            for="guest-account-name">Your name</label
          >
          <input
            id="guest-account-name"
            type="text"
            bind:value={fullName}
            placeholder="Your name"
            maxlength="60"
            class="input input-bordered w-full"
          />
        </div>

        <div class="mt-4 w-full text-left">
          <label
            class="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-base-content/50"
            for="guest-account-email">Email</label
          >
          <input
            id="guest-account-email"
            type="email"
            bind:value={email}
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
          We've sent a confirmation link to <strong>{email}</strong>. Your map
          access keeps working while you confirm.
        </p>
        <button
          class="group mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-hover px-4 py-2.5 text-sm font-medium text-base-content shadow-lg transition-all duration-300 hover:bg-hover/90"
          on:click={() => goto("/account/mapviewer")}
        >
          Continue to the map
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
          Your account is created and you're staying on {mapName}. Taking you
          to the map…
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
