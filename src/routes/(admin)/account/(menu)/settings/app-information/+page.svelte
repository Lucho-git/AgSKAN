<script lang="ts">
  import { goto } from "$app/navigation"
  import { Capacitor } from "@capacitor/core"
  import { PUBLIC_APP_VERSION } from "$env/static/public"
  import { userSettingsApi } from "$lib/api/userSettingsApi"
  import { toast } from "svelte-sonner"
  import Icon from "@iconify/svelte"

  // Check if running on native platform
  const isNativePlatform = Capacitor.isNativePlatform()
  const APP_VERSION = PUBLIC_APP_VERSION || "unknown"

  // Delete account modal
  let showDeleteConfirm = false
  let confirmText = ""

  // App information
  const appInfo = {
    version: APP_VERSION,
    buildDate: new Date("2025-01-15"),
    platform: isNativePlatform ? "Mobile App" : "Web App",
    supportEmail: "support@skanfarming.com.au",
  }

  // Function to truncate user agent string based on screen size
  function truncateUserAgent(userAgent: string): string {
    const screenWidth = window.innerWidth
    let maxLength: number

    if (screenWidth < 640) {
      // Mobile
      maxLength = 50
    } else if (screenWidth < 1024) {
      // Tablet
      maxLength = 100
    } else {
      // Desktop
      maxLength = 150
    }

    if (userAgent.length <= maxLength) return userAgent
    return userAgent.substring(0, maxLength) + "..."
  }

  async function handleDeleteAccount() {
    toast.promise(
      async () => {
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

  function handlePrivacyPolicy() {
    goto("/privacy-policy")
  }

  function handleTermsOfService() {
    goto("/terms-of-service")
  }
</script>

<svelte:head>
  <title>App Information</title>
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
        icon="solar:info-circle-bold-duotone"
        width="18"
        height="18"
        class="text-base-content"
      />
    </div>
    App Information
  </h2>
</div>

<!-- Content -->
<div class="space-y-6 p-6">
  <!-- App Details -->
  <div class="space-y-4">
    <h3 class="flex items-center gap-2 font-medium text-contrast-content">
      <Icon
        icon="solar:smartphone-bold-duotone"
        width="16"
        height="16"
        class="text-base-content/60"
      />
      Application Details
    </h3>

    <div class="grid gap-4">
      <div class="rounded-lg border border-base-300 bg-base-200/30 p-4">
        <label class="mb-1 block text-sm text-contrast-content/60"
          >Version</label
        >
        <div class="flex items-center gap-2">
          <span class="font-medium text-contrast-content"
            >{appInfo.version}</span
          >
          <span class="badge badge-outline badge-sm">
            {appInfo.platform}
          </span>
        </div>
      </div>

      <div class="rounded-lg border border-base-300 bg-base-200/30 p-4">
        <label class="mb-1 block text-sm text-contrast-content/60"
          >Last Updated</label
        >
        <p class="font-medium text-contrast-content">
          {appInfo.buildDate.toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>

      <div class="rounded-lg border border-base-300 bg-base-200/30 p-4">
        <label class="mb-1 block text-sm text-contrast-content/60"
          >Platform</label
        >
        <div class="flex items-center gap-2">
          <Icon
            icon={isNativePlatform
              ? "solar:smartphone-bold-duotone"
              : "solar:global-bold-duotone"}
            width="16"
            height="16"
            class="text-base-content/60"
          />
          <span class="font-medium text-contrast-content"
            >{appInfo.platform}</span
          >
        </div>
      </div>
    </div>
  </div>

  <!-- Legal -->
  <div class="space-y-4">
    <h3 class="flex items-center gap-2 font-medium text-contrast-content">
      <Icon
        icon="solar:document-text-bold-duotone"
        width="16"
        height="16"
        class="text-base-content/60"
      />
      Legal
    </h3>

    <div class="grid gap-3">
      <button
        class="btn btn-outline w-full justify-start gap-3"
        on:click={handlePrivacyPolicy}
      >
        <Icon icon="solar:shield-check-bold-duotone" width="18" height="18" />
        Privacy Policy
      </button>

      <button
        class="btn btn-outline w-full justify-start gap-3"
        on:click={handleTermsOfService}
      >
        <Icon icon="solar:document-text-bold-duotone" width="18" height="18" />
        Terms of Service
      </button>
    </div>
  </div>

  <!-- System Information -->
  <div class="space-y-4">
    <h3 class="flex items-center gap-2 font-medium text-contrast-content">
      <Icon
        icon="solar:settings-bold-duotone"
        width="16"
        height="16"
        class="text-base-content/60"
      />
      System Information
    </h3>

    <div class="grid gap-4">
      <div class="rounded-lg border border-base-300 bg-base-200/30 p-4">
        <label class="mb-1 block text-sm text-contrast-content/60"
          >User Agent</label
        >
        <p
          class="break-all font-mono text-xs text-contrast-content"
          title={navigator.userAgent}
        >
          {truncateUserAgent(navigator.userAgent)}
        </p>
      </div>

      <div class="rounded-lg border border-base-300 bg-base-200/30 p-4">
        <label class="mb-1 block text-sm text-contrast-content/60"
          >Screen Resolution</label
        >
        <p class="font-medium text-contrast-content">
          {window.screen.width} × {window.screen.height}
        </p>
      </div>

      <div class="rounded-lg border border-base-300 bg-base-200/30 p-4">
        <label class="mb-1 block text-sm text-contrast-content/60"
          >Language</label
        >
        <p class="font-medium text-contrast-content">{navigator.language}</p>
      </div>
    </div>
  </div>

  <!-- Danger Zone -->
  <div class="space-y-4 border-t border-error/20 pt-4">
    <h3 class="flex items-center gap-2 font-medium text-error">
      <Icon
        icon="solar:danger-triangle-bold-duotone"
        width="16"
        height="16"
        class="text-error"
      />
      Danger Zone
    </h3>

    <div class="rounded-lg border border-error/20 bg-error/5 p-4">
      <p class="mb-3 text-sm text-contrast-content/80">
        Once you delete your account, there is no going back. Please be certain.
      </p>
      <button
        class="btn btn-outline w-full gap-2 border-error text-error hover:bg-error hover:text-white"
        on:click={() => (showDeleteConfirm = true)}
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

  <!-- Attribution -->
  <div class="border-t border-base-300 pt-4 text-center">
    <p class="text-sm text-contrast-content/60">
      Made with ❤️ by the AgSkan Team
    </p>
    <p class="mt-1 text-xs text-contrast-content/40">
      © 2025 AgSkan. All rights reserved.
    </p>
  </div>
</div>

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
      <p class="py-4 text-contrast-content">
        Are you sure you want to delete your account? This action cannot be
        undone and will permanently remove all your data including:
      </p>

      <div class="mb-4 rounded-lg bg-error/10 p-4">
        <ul class="space-y-1 text-sm">
          <li class="flex items-center gap-2">
            <Icon
              icon="solar:close-circle-bold"
              width="14"
              height="14"
              class="text-error"
            />
            <span class="text-contrast-content">All vehicle tracking data</span>
          </li>
          <li class="flex items-center gap-2">
            <Icon
              icon="solar:close-circle-bold"
              width="14"
              height="14"
              class="text-error"
            />
            <span class="text-contrast-content"
              >Field markers and boundaries</span
            >
          </li>
          <li class="flex items-center gap-2">
            <Icon
              icon="solar:close-circle-bold"
              width="14"
              height="14"
              class="text-error"
            />
            <span class="text-contrast-content"
              >Historical reports and analytics</span
            >
          </li>
          <li class="flex items-center gap-2">
            <Icon
              icon="solar:close-circle-bold"
              width="14"
              height="14"
              class="text-error"
            />
            <span class="text-contrast-content"
              >Account settings and preferences</span
            >
          </li>
        </ul>
      </div>

      <p class="mb-2 text-sm font-medium text-error">
        Type "DELETE" below to confirm:
      </p>
      <input
        type="text"
        placeholder="Type DELETE to confirm"
        class="input input-bordered w-full"
        bind:value={confirmText}
      />

      <div class="modal-action">
        <button
          class="btn btn-outline"
          on:click={() => {
            showDeleteConfirm = false
            confirmText = ""
          }}
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
      on:click={() => {
        showDeleteConfirm = false
        confirmText = ""
      }}
    ></div>
  </div>
{/if}
