<script lang="ts">
  import { session } from "$lib/stores/sessionStore"
  import { toast } from "svelte-sonner"
  import Icon from "@iconify/svelte"

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

<section
  class="overflow-hidden rounded-xl border border-base-300 bg-base-100 shadow-lg"
>
  <div class="border-b border-base-300 p-5">
    <h2 class="flex items-center gap-2 text-xl font-semibold text-base-content">
      <Icon
        icon="solar:shield-user-bold-duotone"
        width="18"
        height="18"
        class="text-primary"
      />
      Security
    </h2>
  </div>

  <div class="divide-y divide-base-300">
    <!-- Email -->
    <div class="p-6">
      <div class="mb-4 flex items-center justify-between">
        <h3 class="flex items-center gap-2 font-medium text-base-content">
          <Icon
            icon="solar:letter-bold-duotone"
            width="16"
            height="16"
            class="text-base-content/60"
          />
          Email Address
        </h3>
        {#if !editingEmail}
          <button
            on:click={() => (editingEmail = true)}
            class="text-base-content/60 transition-colors hover:text-primary"
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
        <p
          class="rounded-lg border border-base-300 bg-base-200 p-3 text-base-content"
        >
          {$session?.user?.email || "No email set"}
        </p>
      {/if}
    </div>

    <!-- Password -->
    <div class="p-6">
      <div class="mb-4 flex items-center justify-between">
        <h3 class="flex items-center gap-2 font-medium text-base-content">
          <Icon
            icon="solar:lock-password-bold-duotone"
            width="16"
            height="16"
            class="text-base-content/60"
          />
          Password
        </h3>
        {#if !editingPassword}
          <button
            on:click={() => (editingPassword = true)}
            class="text-base-content/60 transition-colors hover:text-primary"
          >
            <Icon icon="solar:pen-bold-duotone" width="16" height="16" />
          </button>
        {/if}
      </div>

      {#if editingPassword}
        <div class="space-y-4">
          <div>
            <label class="mb-1 block text-sm text-base-content/60"
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
            <label class="mb-1 block text-sm text-base-content/60"
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
            <label class="mb-1 block text-sm text-base-content/60"
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
        <p
          class="rounded-lg border border-base-300 bg-base-200 p-3 text-base-content"
        >
          ••••••••••••
        </p>
      {/if}
    </div>
  </div>
</section>
