<!-- edit_profile/+page.svelte -->
<script lang="ts">
  import { getContext, onMount } from "svelte"
  import type { Writable } from "svelte/store"
  import { session } from "$lib/stores/sessionStore"
  import { profileStore } from "$lib/stores/profileStore"
  import { goto } from "$app/navigation"
  import { userSettingsApi } from "$lib/api/userSettingsApi"
  import SettingsModule from "../settings_module.svelte"

  let adminSection: Writable<string> = getContext("adminSection")
  adminSection.set("settings")

  let loading = true
  let profile = null

  onMount(async () => {
    // Check if user is authenticated
    if (!$session) {
      goto("/login")
      return
    }

    // Get profile info
    profile = $profileStore
    loading = false
  })

  // Handler for profile update using the API
  async function handleProfileUpdate(formData) {
    return await userSettingsApi.updateProfile(
      formData.fullName,
      formData.companyName,
      formData.website,
    )
  }

  function handleSuccess(event) {
    // Extract the updated profile data from the event
    const updatedData = event.detail.data || {}

    // Update the profile store with the new values
    if ($profileStore) {
      // Create a new profile object with updated values
      const updatedProfile = {
        ...$profileStore,
        full_name:
          updatedData.full_name ||
          event.detail.formData?.fullName ||
          $profileStore.full_name,
        company_name:
          updatedData.company_name ||
          event.detail.formData?.companyName ||
          $profileStore.company_name,
        website:
          updatedData.website ||
          event.detail.formData?.website ||
          $profileStore.website,
      }

      // Update the store
      profileStore.set(updatedProfile)
    }

    // Navigate back to settings after success (with a small delay)
    setTimeout(() => {
      goto("/account/settings")
    }, 1500)
  }
</script>

<svelte:head>
  <title>Edit Profile</title>
</svelte:head>

<h1 class="mb-6 text-2xl font-bold">Settings</h1>

{#if loading}
  <div class="flex h-64 items-center justify-center">
    <div class="loading loading-spinner loading-lg"></div>
  </div>
{:else}
  <SettingsModule
    editable={true}
    title="Edit Profile"
    successTitle="Profile Updated"
    successBody="Your profile has been updated successfully."
    apiHandler={handleProfileUpdate}
    fields={[
      {
        id: "fullName",
        label: "Name",
        initialValue: profile?.full_name ?? "",
        placeholder: "Your full name",
      },
      {
        id: "companyName",
        label: "Company Name",
        initialValue: profile?.company_name ?? "",
        placeholder: "Your company name",
      },
      {
        id: "website",
        label: "Company Website",
        initialValue: profile?.website ?? "",
        placeholder: "https://example.com",
      },
    ]}
    on:success={handleSuccess}
  />
{/if}
