<!-- change_email/+page.svelte -->
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

  // Handler for email update using the API
  async function handleEmailUpdate(formData) {
    return await userSettingsApi.updateEmail(formData.email)
  }

  function handleSuccess() {
    // Navigate back to settings after success (with a small delay)
    setTimeout(() => {
      goto("/account/settings")
    }, 1500)
  }
</script>

<svelte:head>
  <title>Change Email</title>
</svelte:head>

<h1 class="mb-6 text-2xl font-bold">Settings</h1>

{#if loading}
  <div class="flex h-64 items-center justify-center">
    <div class="loading loading-spinner loading-lg"></div>
  </div>
{:else}
  <SettingsModule
    title="Change Email"
    editable={true}
    successTitle="Email change initiated"
    successBody="You should receive emails at both the old and new address to confirm the change. Please click the link in both emails to finalize the change. Until finalized, you must sign in with your current email."
    apiHandler={handleEmailUpdate}
    fields={[
      {
        id: "email",
        label: "Email",
        initialValue: $session?.user?.email ?? "",
        placeholder: "Email address",
      },
    ]}
    on:success={handleSuccess}
  />
{/if}
