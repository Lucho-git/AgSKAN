<script lang="ts">
  import { session } from "$lib/stores/sessionStore"
  import { profileStore } from "$lib/stores/profileStore"
  import { userSettingsApi } from "$lib/api/userSettingsApi"
  import { toast } from "svelte-sonner"
  import Icon from "@iconify/svelte"

  // Profile state
  let editingProfile = false
  let formProfile = {
    fullName: $profileStore?.full_name || "",
    companyName: $profileStore?.company_name || "",
  }

  // Update form when profile store changes
  $: if ($profileStore) {
    formProfile = {
      fullName: $profileStore.full_name || "",
      companyName: $profileStore.company_name || "",
    }
  }

  // Handler for profile update using the API
  async function handleProfileUpdate() {
    try {
      const result = await userSettingsApi.updateProfile(
        formProfile.fullName,
        formProfile.companyName,
        "", // Empty website field
      )

      if (result.success) {
        // Update the profile store with the new values
        if ($profileStore) {
          const updatedProfile = {
            ...$profileStore,
            full_name: formProfile.fullName,
            company_name: formProfile.companyName,
          }
          profileStore.set(updatedProfile)
        }

        editingProfile = false
        toast.success("Profile updated successfully")
      } else {
        toast.error(result.error || "Failed to update profile")
      }
    } catch (error) {
      console.error("Error updating profile:", error)
      toast.error("Failed to update profile")
    }
  }

  function cancelProfileEdit() {
    formProfile = {
      fullName: $profileStore?.full_name || "",
      companyName: $profileStore?.company_name || "",
    }
    editingProfile = false
  }
</script>

<svelte:head>
  <title>Profile Settings</title>
</svelte:head>

<!-- Header -->
<div
  class="flex items-center justify-between border-b border-base-300 bg-base-100 p-5"
>
  <h2
    class="flex items-center gap-2 text-xl font-semibold text-contrast-content"
  >
    <div class="rounded-lg bg-base-content/10 p-1.5">
      <Icon
        icon="solar:user-bold-duotone"
        width="18"
        height="18"
        class="text-base-content"
      />
    </div>
    Profile
  </h2>
</div>

<!-- Content -->
<div class="p-6">
  {#if editingProfile}
    <!-- Edit Form -->
    <div class="space-y-6">
      <!-- Profile Avatar Section -->
      <div class="flex items-center gap-6">
        <div
          class="group relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-base-200 text-contrast-content"
        >
          <span class="text-2xl font-bold uppercase">
            {formProfile.fullName.charAt(0) || "U"}
          </span>
          <div
            class="absolute inset-0 flex cursor-pointer items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100"
          >
            <Icon
              icon="solar:upload-bold-duotone"
              width="20"
              height="20"
              class="text-white"
            />
          </div>
        </div>
        <div class="flex-1">
          <h3 class="text-lg font-medium text-contrast-content">
            Profile Picture
          </h3>
          <p class="text-sm text-contrast-content/60">
            Click on the avatar to upload a new profile picture
          </p>
        </div>
      </div>

      <!-- Form Fields -->
      <div class="grid gap-6">
        <!-- Full Name -->
        <div class="space-y-2">
          <label class="block text-sm font-medium text-contrast-content">
            Full Name
          </label>
          <input
            type="text"
            bind:value={formProfile.fullName}
            class="input input-bordered w-full"
            placeholder="Enter your full name"
          />
          <p class="text-xs text-contrast-content/60">
            This is the name that will be displayed across your account
          </p>
        </div>

        <!-- Company Name -->
        <div class="space-y-2">
          <label class="block text-sm font-medium text-contrast-content">
            Company Name
          </label>
          <input
            type="text"
            bind:value={formProfile.companyName}
            class="input input-bordered w-full"
            placeholder="Enter your company name"
          />
          <p class="text-xs text-contrast-content/60">
            The name of your organization or business
          </p>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="flex justify-end gap-3 border-t border-base-300 pt-6">
        <button
          on:click={cancelProfileEdit}
          class="btn btn-outline btn-sm gap-2"
        >
          <Icon icon="solar:close-circle-bold-duotone" width="16" height="16" />
          Cancel
        </button>
        <button
          on:click={handleProfileUpdate}
          class="btn btn-primary btn-sm gap-2"
        >
          <Icon icon="solar:diskette-bold-duotone" width="16" height="16" />
          Save Changes
        </button>
      </div>
    </div>
  {:else}
    <!-- View Mode -->
    <div class="space-y-6">
      <!-- Profile Header -->
      <div class="flex items-center gap-6">
        <div
          class="flex h-20 w-20 items-center justify-center rounded-full bg-base-200 text-contrast-content"
        >
          <span class="text-2xl font-bold uppercase">
            {$profileStore?.full_name?.charAt(0) || "U"}
          </span>
        </div>
        <div>
          <h3 class="text-2xl font-bold text-contrast-content">
            {$profileStore?.full_name || "No name set"}
          </h3>
          <p class="text-contrast-content/60">
            {$profileStore?.company_name || "No company"}
          </p>
        </div>
      </div>

      <!-- Profile Information Cards -->
      <div class="grid gap-4">
        <!-- Name Card -->
        <div class="rounded-lg border border-base-300 bg-base-200/30 p-4">
          <div class="flex items-center justify-between">
            <div>
              <label class="block text-sm text-contrast-content/60"
                >Full Name</label
              >
              <p class="font-medium text-contrast-content">
                {$profileStore?.full_name || "Not set"}
              </p>
            </div>
            <div class="rounded-lg bg-base-content/10 p-2">
              <Icon
                icon="solar:user-bold-duotone"
                width="18"
                height="18"
                class="text-base-content"
              />
            </div>
          </div>
        </div>

        <!-- Company Card -->
        <div class="rounded-lg border border-base-300 bg-base-200/30 p-4">
          <div class="flex items-center justify-between">
            <div>
              <label class="block text-sm text-contrast-content/60"
                >Company Name</label
              >
              <p class="font-medium text-contrast-content">
                {$profileStore?.company_name || "Not set"}
              </p>
            </div>
            <div class="rounded-lg bg-base-content/10 p-2">
              <Icon
                icon="solar:buildings-2-bold-duotone"
                width="18"
                height="18"
                class="text-base-content"
              />
            </div>
          </div>
        </div>

        <!-- Email Card (Read-only) -->
        <div class="rounded-lg border border-base-300 bg-base-200/30 p-4">
          <div class="flex items-center justify-between">
            <div class="min-w-0 flex-1">
              <label class="block text-sm text-contrast-content/60"
                >Email Address</label
              >
              <p class="truncate font-medium text-contrast-content">
                {$session?.user?.email || "Not available"}
              </p>
              <span
                class="mt-1 inline-flex items-center gap-1 text-xs text-success"
              >
                <Icon
                  icon="solar:check-circle-bold-duotone"
                  width="12"
                  height="12"
                />
                Verified
              </span>
            </div>
            <div class="rounded-lg bg-base-content/10 p-2">
              <Icon
                icon="solar:letter-bold-duotone"
                width="18"
                height="18"
                class="text-base-content"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Edit Button -->
      <div class="flex justify-end border-t border-base-300 pt-6">
        <button
          class="btn btn-outline gap-2"
          on:click={() => (editingProfile = true)}
        >
          <Icon icon="solar:pen-bold-duotone" width="16" height="16" />
          Edit Profile
        </button>
      </div>
    </div>
  {/if}
</div>
