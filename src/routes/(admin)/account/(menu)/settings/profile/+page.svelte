<script lang="ts">
  import { session } from "$lib/stores/sessionStore"
  import { profileStore } from "$lib/stores/profileStore"
  import { toast } from "svelte-sonner"
  import Icon from "@iconify/svelte"

  // Profile state
  let editingProfile = false
  let formProfile = {
    name: $profileStore?.full_name || "",
    companyName: $profileStore?.company_name || "",
    avatar: "",
  }

  // Update form when profile store changes
  $: if ($profileStore) {
    formProfile = {
      name: $profileStore.full_name || "",
      companyName: $profileStore.company_name || "",
      avatar: "",
    }
  }

  async function handleProfileUpdate() {
    toast.promise(
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 1000))
        editingProfile = false
        return "Profile updated successfully"
      },
      {
        loading: "Saving profile changes...",
        success: (message) => message,
        error: "Failed to update profile",
      },
    )
  }

  function cancelProfileEdit() {
    formProfile = {
      name: $profileStore?.full_name || "",
      companyName: $profileStore?.company_name || "",
      avatar: "",
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
  {#if !editingProfile}
    <button
      on:click={() => (editingProfile = true)}
      class="rounded-lg p-1.5 text-base-content/60 transition-colors hover:bg-base-content/10 hover:text-base-content"
    >
      <Icon icon="solar:pen-bold-duotone" width="16" height="16" />
    </button>
  {/if}
</div>

<!-- Content -->
<div class="p-6">
  {#if editingProfile}
    <div class="space-y-4">
      <div class="flex items-center gap-4">
        <div
          class="group relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-base-200 text-contrast-content"
        >
          {#if formProfile.avatar}
            <img
              src={formProfile.avatar}
              alt="Avatar"
              class="h-full w-full object-cover"
            />
          {:else}
            <span class="text-xl font-bold uppercase"
              >{formProfile.name.charAt(0) || "U"}</span
            >
          {/if}
          <div
            class="absolute inset-0 flex cursor-pointer items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100"
          >
            <Icon
              icon="solar:upload-bold-duotone"
              width="16"
              height="16"
              class="text-white"
            />
          </div>
        </div>
        <div class="flex-1">
          <label class="mb-1 block text-sm text-contrast-content/60">Name</label
          >
          <input
            type="text"
            bind:value={formProfile.name}
            class="input input-bordered w-full"
            placeholder="Enter your name"
          />
        </div>
      </div>

      <div>
        <label class="mb-1 block text-sm text-contrast-content/60"
          >Company Name</label
        >
        <input
          type="text"
          bind:value={formProfile.companyName}
          class="input input-bordered w-full"
          placeholder="Enter company name"
        />
      </div>

      <div class="flex justify-end gap-3">
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
          Save
        </button>
      </div>
    </div>
  {:else}
    <div class="space-y-5">
      <div class="flex items-start gap-4">
        <div
          class="flex h-16 w-16 items-center justify-center rounded-full bg-base-200 text-contrast-content"
        >
          {#if formProfile.avatar}
            <img
              src={formProfile.avatar}
              alt="Avatar"
              class="h-full w-full object-cover"
            />
          {:else}
            <span class="text-xl font-bold uppercase"
              >{$profileStore?.full_name?.charAt(0) || "U"}</span
            >
          {/if}
        </div>
        <div>
          <h3 class="text-xl font-medium text-contrast-content">
            {$profileStore?.full_name || "No name set"}
          </h3>
          <p class="text-contrast-content/60">Free Plan</p>
        </div>
      </div>

      <div>
        <label class="mb-1 block text-sm text-contrast-content/60"
          >Company Name</label
        >
        <p
          class="rounded-lg border border-base-300 bg-base-200 p-3 text-contrast-content"
        >
          {$profileStore?.company_name || "No company name set"}
        </p>
      </div>

      <button
        class="btn btn-outline w-full gap-2"
        on:click={() => (editingProfile = true)}
      >
        <Icon icon="solar:pen-bold-duotone" width="16" height="16" />
        Edit Profile
      </button>
    </div>
  {/if}
</div>
