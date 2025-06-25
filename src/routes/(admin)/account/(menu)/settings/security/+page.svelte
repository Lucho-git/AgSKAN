<script lang="ts">
  import { session } from "$lib/stores/sessionStore"
  import { toast } from "svelte-sonner"
  import Icon from "@iconify/svelte"

  // Security state
  let editingEmail = false
  let editingPassword = false
  let formEmail = $session?.user?.email || ""
  let formPassword = {
    current: "",
    new: "",
    confirm: "",
  }

  async function handleEmailUpdate() {
    toast.promise(
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 1000))
        editingEmail = false
        return "Email updated successfully"
      },
      {
        loading: "Updating email address...",
        success: (message) => message,
        error: "Failed to update email",
      },
    )
  }

  async function handlePasswordUpdate() {
    if (formPassword.new !== formPassword.confirm) {
      toast.error("New passwords do not match")
      return
    }

    if (formPassword.new.length < 8) {
      toast.error("Password must be at least 8 characters")
      return
    }

    toast.promise(
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 1000))
        editingPassword = false
        formPassword = { current: "", new: "", confirm: "" }
        return "Password updated successfully"
      },
      {
        loading: "Updating password...",
        success: (message) => message,
        error: "Failed to update password",
      },
    )
  }
</script>

<svelte:head>
  <title>Security Settings</title>
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
        icon="solar:shield-user-bold-duotone"
        width="18"
        height="18"
        class="text-base-content"
      />
    </div>
    Security
  </h2>
</div>

<!-- Content -->
<div class="divide-y divide-base-300">
  <!-- Email -->
  <div class="p-6">
    <div class="mb-4 flex items-center justify-between">
      <h3 class="flex items-center gap-2 font-medium text-contrast-content">
        <div class="rounded-lg bg-base-content/10 p-1.5">
          <Icon
            icon="solar:letter-bold-duotone"
            width="16"
            height="16"
            class="text-base-content"
          />
        </div>
        Email Address
      </h3>
      {#if !editingEmail}
        <button
          on:click={() => (editingEmail = true)}
          class="rounded-lg p-1.5 text-base-content/60 transition-colors hover:bg-base-200 hover:text-base-content"
        >
          <Icon icon="solar:pen-bold-duotone" width="16" height="16" />
        </button>
      {/if}
    </div>

    {#if editingEmail}
      <div class="space-y-4">
        <input
          type="email"
          bind:value={formEmail}
          class="input input-bordered w-full"
          placeholder="Enter new email address"
        />

        <div class="flex justify-end gap-3">
          <button
            on:click={() => {
              formEmail = $session?.user?.email || ""
              editingEmail = false
            }}
            class="btn btn-outline btn-sm gap-2"
          >
            <Icon
              icon="solar:close-circle-bold-duotone"
              width="16"
              height="16"
            />
            Cancel
          </button>
          <button
            on:click={handleEmailUpdate}
            class="btn btn-primary btn-sm gap-2"
          >
            <Icon icon="solar:diskette-bold-duotone" width="16" height="16" />
            Save
          </button>
        </div>
      </div>
    {:else}
      <div
        class="flex items-center gap-3 rounded-lg border border-base-300 bg-base-200 p-4"
      >
        <div class="rounded-full bg-base-content/10 p-2">
          <Icon
            icon="solar:letter-bold-duotone"
            width="18"
            height="18"
            class="text-base-content"
          />
        </div>
        <div>
          <p class="font-medium text-contrast-content">
            {$session?.user?.email || "No email set"}
          </p>
          <p class="mt-0.5 text-xs text-contrast-content/60">Verified</p>
        </div>
      </div>
    {/if}
  </div>

  <!-- Password -->
  <div class="p-6">
    <div class="mb-4 flex items-center justify-between">
      <h3 class="flex items-center gap-2 font-medium text-contrast-content">
        <div class="rounded-lg bg-base-content/10 p-1.5">
          <Icon
            icon="solar:lock-password-bold-duotone"
            width="16"
            height="16"
            class="text-base-content"
          />
        </div>
        Password
      </h3>
      {#if !editingPassword}
        <button
          on:click={() => (editingPassword = true)}
          class="rounded-lg p-1.5 text-base-content/60 transition-colors hover:bg-base-200 hover:text-base-content"
        >
          <Icon icon="solar:pen-bold-duotone" width="16" height="16" />
        </button>
      {/if}
    </div>

    {#if editingPassword}
      <div class="space-y-4">
        <div>
          <label class="mb-1 block text-sm text-contrast-content/60"
            >Current Password</label
          >
          <input
            type="password"
            bind:value={formPassword.current}
            class="input input-bordered w-full"
            placeholder="Enter current password"
          />
        </div>

        <div>
          <label class="mb-1 block text-sm text-contrast-content/60"
            >New Password</label
          >
          <input
            type="password"
            bind:value={formPassword.new}
            class="input input-bordered w-full"
            placeholder="Enter new password"
          />
        </div>

        <div>
          <label class="mb-1 block text-sm text-contrast-content/60"
            >Confirm New Password</label
          >
          <input
            type="password"
            bind:value={formPassword.confirm}
            class="input input-bordered w-full"
            placeholder="Confirm new password"
          />
        </div>

        <div class="flex justify-end gap-3">
          <button
            on:click={() => {
              formPassword = { current: "", new: "", confirm: "" }
              editingPassword = false
            }}
            class="btn btn-outline btn-sm gap-2"
          >
            <Icon
              icon="solar:close-circle-bold-duotone"
              width="16"
              height="16"
            />
            Cancel
          </button>
          <button
            on:click={handlePasswordUpdate}
            class="btn btn-primary btn-sm gap-2"
          >
            <Icon icon="solar:key-bold-duotone" width="16" height="16" />
            Update Password
          </button>
        </div>
      </div>
    {:else}
      <div
        class="flex items-center gap-3 rounded-lg border border-base-300 bg-base-200 p-4"
      >
        <div class="rounded-full bg-base-content/10 p-2">
          <Icon
            icon="solar:lock-password-bold-duotone"
            width="18"
            height="18"
            class="text-base-content"
          />
        </div>
        <div>
          <p class="font-medium text-contrast-content">••••••••••••</p>
          <p class="mt-0.5 text-xs text-contrast-content/60">
            Last updated: 2 months ago
          </p>
        </div>
      </div>
      <button
        on:click={() => (editingPassword = true)}
        class="btn btn-outline mt-4 w-full gap-2"
      >
        <Icon icon="solar:key-bold-duotone" width="16" height="16" />
        Change Password
      </button>
    {/if}
  </div>
</div>
