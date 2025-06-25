<!-- reset_password/+page.svelte -->
<script lang="ts">
  import { getContext, onMount } from "svelte"
  import type { Writable } from "svelte/store"
  import { session } from "$lib/stores/sessionStore"
  import { goto } from "$app/navigation"
  import { userSettingsApi } from "$lib/api/userSettingsApi"
  import SettingsModule from "../settings_module.svelte"

  let adminSection: Writable<string> = getContext("adminSection")
  adminSection.set("settings")

  let loading = true

  onMount(() => {
    // For reset password, we check if we're in a recovery session
    loading = false
  })

  // Handler for resetting password - uses the existing updatePassword method
  // which already handles recovery sessions (without current password)
  async function handleResetPassword(formData) {
    return await userSettingsApi.updatePassword(
      formData.newPassword1,
      formData.newPassword2,
      "", // No current password needed for recovery
    )
  }

  function handleSuccess() {
    // Navigate back to settings or login after success
    setTimeout(() => {
      if ($session) {
        goto("/account/settings")
      } else {
        goto("/login")
      }
    }, 1500)
  }
</script>

<svelte:head>
  <title>Reset Password</title>
</svelte:head>

<h1 class="mb-6 text-2xl font-bold">Settings</h1>

{#if loading}
  <div class="flex h-64 items-center justify-center">
    <div class="loading loading-spinner loading-lg"></div>
  </div>
{:else}
  <SettingsModule
    title="Reset Password"
    editable={true}
    saveButtonTitle="Reset Password"
    successTitle="Password Changed"
    successBody="On next sign in, use your new password."
    apiHandler={handleResetPassword}
    fields={[
      {
        id: "newPassword1",
        label: "New Password",
        initialValue: "",
        inputType: "password",
      },
      {
        id: "newPassword2",
        label: "Confirm New Password",
        initialValue: "",
        inputType: "password",
      },
    ]}
    on:success={handleSuccess}
  />
{/if}
