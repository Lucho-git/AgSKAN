<script lang="ts">
  import { PUBLIC_APP_VERSION } from "$env/static/public"
  import { userSettingsApi } from "$lib/api/userSettingsApi"
  import { toast } from "svelte-sonner"
  import { goto } from "$app/navigation"
  import Icon from "@iconify/svelte"

  const APP_VERSION = PUBLIC_APP_VERSION || "unknown"

  let showDeleteConfirm = false

  async function handleSignOut() {
    toast.promise(userSettingsApi.signOut(), {
      loading: "Signing out...",
      success: () => {
        goto("/")
        return "Signed out successfully"
      },
      error: "Failed to sign out",
    })
  }

  function confirmDelete() {
    showDeleteConfirm = true
  }

  async function handleDeleteAccount() {
    toast.promise(
      async () => {
        // Simulate API call - replace with actual delete API
        await new Promise((resolve) => setTimeout(resolve, 2000))
        goto("/")
        return "Account deleted successfully"
      },
      {
        loading: "Deleting account...",
        success: (message) => message,
        error: "Failed to delete account",
      },
    )
    showDeleteConfirm = false
  }
</script>

<section
  class="overflow-hidden rounded-xl border border-base-300 bg-base-100 shadow-lg"
>
  <div class="border-b border-base-300 p-5">
    <h2 class="flex items-center gap-2 text-xl font-semibold text-base-content">
      <Icon
        icon="solar:info-circle-bold-duotone"
        width="18"
        height="18"
        class="text-primary"
      />
      App Information
    </h2>
  </div>

  <div class="space-y-4 p-4 md:p-6">
    <!-- App Version -->
    <div>
      <label class="mb-1 block text-sm text-base-content/60">Version</label>
      <p
        class="rounded-lg border border-base-300 bg-base-200 p-3 text-base-content"
      >
        {APP_VERSION}
      </p>
    </div>

    <!-- Actions -->
    <div class="flex flex-col gap-4 pt-6">
      <!-- Sign Out -->
      <button class="btn btn-outline w-full gap-2" on:click={handleSignOut}>
        <Icon icon="solar:logout-3-bold-duotone" width="16" height="16" />
        Sign Out
      </button>

      <!-- Delete Account -->
      <button
        class="btn btn-outline btn-error w-full gap-2"
        on:click={confirmDelete}
      >
        <Icon
          icon="solar:trash-bin-trash-bold-duotone"
          width="16"
          height="16"
        />
        Delete Account
      </button>
    </div>
  </div>
</section>

<!-- Delete Confirmation Modal -->
{#if showDeleteConfirm}
  <div class="modal modal-open">
    <div class="modal-box">
      <h3 class="flex items-center gap-2 text-lg font-bold text-error">
        <Icon
          icon="solar:danger-triangle-bold-duotone"
          width="20"
          height="20"
        />
        Delete Account
      </h3>
      <p class="py-4">
        Are you sure you want to delete your account? This action cannot be
        undone and will permanently remove all your data, including:
      </p>
      <ul
        class="mb-4 list-inside list-disc space-y-1 text-sm text-base-content/80"
      >
        <li>Profile information</li>
        <li>Map data and markers</li>
        <li>Trail history</li>
        <li>All settings and preferences</li>
      </ul>
      <p class="text-sm font-medium text-error">
        Type "DELETE" below to confirm:
      </p>
      <input
        type="text"
        placeholder="Type DELETE to confirm"
        class="input input-bordered mt-2 w-full"
        let:value={confirmText}
      />
      <div class="modal-action">
        <button
          class="btn btn-outline"
          on:click={() => (showDeleteConfirm = false)}
        >
          Cancel
        </button>
        <button
          class="btn btn-error gap-2"
          disabled={confirmText !== "DELETE"}
          on:click={handleDeleteAccount}
        >
          <Icon
            icon="solar:trash-bin-trash-bold-duotone"
            width="16"
            height="16"
          />
          Delete Account
        </button>
      </div>
    </div>
    <div
      class="modal-backdrop"
      on:click={() => (showDeleteConfirm = false)}
    ></div>
  </div>
{/if}
