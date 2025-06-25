<!-- delete_account/+page.svelte -->
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
    // Check if user is authenticated
    if (!$session) {
      goto("/login")
      return
    }

    loading = false
  })

  // Handler for account deletion using the API
  async function handleDeleteAccount(formData) {
    return await userSettingsApi.deleteAccount(formData.currentPassword)
  }

  function handleSuccess() {
    // Navigate to home after success (with a small delay)
    setTimeout(() => {
      goto("/")
    }, 1500)
  }
</script>

<svelte:head>
  <title>Delete Account</title>
</svelte:head>

<h1 class="mb-6 text-2xl font-bold">Settings</h1>

{#if loading}
  <div class="flex h-64 items-center justify-center">
    <div class="loading loading-spinner loading-lg"></div>
  </div>
{:else}
  <SettingsModule
    editable={true}
    dangerous={true}
    title="Delete Account"
    message="This action cannot be undone. This will permanently delete your account and remove your data from our servers."
    successTitle="Account Deleted"
    successBody="Your account has been successfully deleted. You will be redirected to the home page."
    saveButtonTitle="Delete My Account"
    apiHandler={handleDeleteAccount}
    fields={[
      {
        id: "currentPassword",
        label: "Enter your password to confirm",
        initialValue: "",
        inputType: "password",
      },
    ]}
    on:success={handleSuccess}
  />
{/if}
