<script lang="ts">
  import { onMount } from "svelte"
  import { page } from "$app/stores"
  import { supabase } from "$lib/stores/sessionStore"
  import { goto } from "$app/navigation"
  import { toast } from "svelte-sonner"

  let password = ""
  let confirmPassword = ""
  let loading = false
  let checkingSession = true
  let sessionMissing = false

  function nextPath() {
    const next = $page.url.searchParams.get("next")
    // Only ever follow internal paths.
    return next && next.startsWith("/") && !next.startsWith("//")
      ? next
      : "/account"
  }

  onMount(async () => {
    // The recovery link signs the user in before landing here. Without that
    // session updateUser() can only fail with "Auth session missing".
    const { data } = await supabase.auth.getSession()
    sessionMissing = !data.session
    checkingSession = false
  })

  async function updatePassword() {
    if (password !== confirmPassword) {
      toast.error("Passwords don't match")
      return
    }

    if (password.length < 6) {
      toast.error("Password must be at least 6 characters")
      return
    }

    loading = true

    try {
      const { error } = await supabase.auth.updateUser({
        password: password,
      })

      if (error) throw error

      toast.success("Password updated successfully!")
      goto(nextPath()) // Now they can go to account
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error ?? "")
      if (message.includes("Auth session missing")) {
        sessionMissing = true
        return
      }
      toast.error(message || "Could not update your password")
    } finally {
      loading = false
    }
  }
</script>

<div class="flex min-h-screen items-center justify-center">
  <div class="w-full max-w-md p-6">
    {#if checkingSession}
      <div class="flex flex-col items-center">
        <div class="skeleton mb-4 h-12 w-12 rounded-full"></div>
        <p class="text-lg">Checking your reset link...</p>
      </div>
    {:else if sessionMissing}
      <h1 class="mb-4 text-2xl font-bold">Reset link expired</h1>
      <p class="mb-6 text-sm opacity-80">
        This link has already been used or has expired. Reset links are valid for
        one hour and can only be used once — request a new one and try again.
      </p>
      <a
        href="/login/forgot_password"
        class="block w-full rounded-lg bg-blue-600 p-3 text-center text-white"
        >Send me a new reset link</a
      >
      <a href="/login" class="mt-3 block w-full rounded-lg border p-3 text-center"
        >Back to sign in</a
      >
    {:else}
      <h1 class="mb-6 text-2xl font-bold">Set New Password</h1>

      <form on:submit|preventDefault={updatePassword}>
        <div class="mb-4">
          <label class="mb-2 block text-sm font-medium">New Password</label>
          <input
            type="password"
            bind:value={password}
            class="w-full rounded-lg border p-3"
            required
          />
        </div>

        <div class="mb-6">
          <label class="mb-2 block text-sm font-medium">Confirm Password</label>
          <input
            type="password"
            bind:value={confirmPassword}
            class="w-full rounded-lg border p-3"
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          class="w-full rounded-lg bg-blue-600 p-3 text-white disabled:opacity-50"
        >
          {loading ? "Updating..." : "Update Password"}
        </button>
      </form>
    {/if}
  </div>
</div>
