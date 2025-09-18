<script lang="ts">
  import { supabase } from "$lib/stores/sessionStore"
  import { goto } from "$app/navigation"
  import { toast } from "svelte-sonner"

  let password = ""
  let confirmPassword = ""
  let loading = false

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
      goto("/account") // Now they can go to account
    } catch (error) {
      toast.error(error.message)
    } finally {
      loading = false
    }
  }
</script>

<div class="flex min-h-screen items-center justify-center">
  <div class="w-full max-w-md p-6">
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
  </div>
</div>
