<script lang="ts">
  import { session } from "$lib/stores/sessionStore"
  import { profileStore } from "$lib/stores/profileStore"
  import { userSettingsApi } from "$lib/api/userSettingsApi"
  import Icon from "@iconify/svelte"

  // Profile state
  let editingProfile = false
  let formProfile = {
    fullName: "",
    companyName: "",
  }

  // Initialize form when component loads or profile store changes
  $: {
    if ($profileStore && !editingProfile) {
      formProfile = {
        fullName: $profileStore.full_name || "",
        companyName: $profileStore.company_name || "",
      }
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
        // Update the profile store with the actual response data
        if ($profileStore && result.data) {
          const updatedProfile = {
            ...$profileStore,
            full_name: result.data.full_name || formProfile.fullName,
            company_name: result.data.company_name || formProfile.companyName,
          }
          profileStore.set(updatedProfile)
        } else if ($profileStore) {
          // Fallback if no data in response
          const updatedProfile = {
            ...$profileStore,
            full_name: formProfile.fullName,
            company_name: formProfile.companyName,
          }
          profileStore.set(updatedProfile)
        }

        editingProfile = false
      }
    } catch (error) {
      console.error("Error updating profile:", error)
    }
  }

  function startEdit() {
    // Initialize form with current profile data when starting edit
    formProfile = {
      fullName: $profileStore?.full_name || "",
      companyName: $profileStore?.company_name || "",
    }
    editingProfile = true
  }

  function cancelProfileEdit() {
    // Reset form to original values
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
            class="w-full rounded-lg border border-base-300 bg-base-100 px-4 py-3 text-contrast-content placeholder-contrast-content/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
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
            class="w-full rounded-lg border border-base-300 bg-base-100 px-4 py-3 text-contrast-content placeholder-contrast-content/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
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
          class="flex items-center gap-2 rounded-lg border border-base-300 bg-base-100 px-4 py-2 text-sm font-medium text-contrast-content hover:bg-base-200 focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          <Icon icon="solar:close-circle-bold-duotone" width="16" height="16" />
          Cancel
        </button>
        <button
          on:click={handleProfileUpdate}
          class="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-content hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          <Icon icon="solar:diskette-bold-duotone" width="16" height="16" />
          Save Changes
        </button>
      </div>
    </div>
  {:else}
    <!-- View Mode -->
    <div class="space-y-6">
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
          class="flex items-center gap-2 rounded-lg border border-base-300 bg-base-100 px-4 py-2 text-sm font-medium text-contrast-content hover:bg-base-200 focus:outline-none focus:ring-2 focus:ring-primary/20"
          on:click={startEdit}
        >
          <Icon icon="solar:pen-bold-duotone" width="16" height="16" />
          Edit Profile
        </button>
      </div>
    </div>
  {/if}
</div>
