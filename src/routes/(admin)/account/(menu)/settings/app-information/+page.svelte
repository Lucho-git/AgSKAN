<script lang="ts">
  import { goto } from "$app/navigation"
  import { Capacitor } from "@capacitor/core"
  import { PUBLIC_APP_VERSION } from "$env/static/public"
  import { userSettingsApi } from "$lib/api/userSettingsApi"
  import { userSettingsStore } from "$lib/stores/userSettingsStore"
  import { toast } from "svelte-sonner"
  import Icon from "@iconify/svelte"
  import { X } from "lucide-svelte"

  // Check if running on native platform
  const isNativePlatform = Capacitor.isNativePlatform()
  const APP_VERSION = PUBLIC_APP_VERSION || "unknown"

  // Delete account modal
  let showDeleteConfirm = false
  let showDeleteSuccess = false
  let confirmText = ""

  // Developer mode
  $: devToolsEnabled = $userSettingsStore.devToolsEnabled
  let showDevPasswordModal = false
  let devPassword = ""
  let devPasswordError = ""

  function handleDevToggleClick() {
    if (devToolsEnabled) {
      // Disabling — no password needed
      toggleDevTools(false)
    } else {
      // Enabling — prompt for password
      devPassword = ""
      devPasswordError = ""
      showDevPasswordModal = true
    }
  }

  function handleDevPasswordSubmit() {
    if (devPassword === "agskan") {
      showDevPasswordModal = false
      devPassword = ""
      devPasswordError = ""
      toggleDevTools(true)
    } else {
      devPasswordError = "Incorrect password"
    }
  }

  async function toggleDevTools(newValue: boolean) {
    // Optimistic update
    userSettingsStore.update((s) => ({ ...s, devToolsEnabled: newValue }))
    const result = await userSettingsApi.updateDevToolsEnabled(newValue)
    if (result.success) {
      toast.success(
        newValue ? "Developer mode enabled" : "Developer mode disabled",
      )
    } else {
      // Revert
      userSettingsStore.update((s) => ({ ...s, devToolsEnabled: !newValue }))
      toast.error("Failed to update setting")
    }
  }

  // Location settings (1Hz + popup toggles)
  $: full1HzEnabled = $userSettingsStore.enableFull1Hz
  $: gpsAcceptedPopupsEnabled = $userSettingsStore.showGpsAcceptedPopups
  $: gpsRejectedPopupsEnabled = $userSettingsStore.showGpsRejectedPopups

  async function handleFull1HzToggle() {
    const newValue = !($userSettingsStore.enableFull1Hz)
    // optimistic update
    userSettingsStore.update((s) => ({ ...s, enableFull1Hz: newValue }))
    try {
      if (userSettingsApi?.updateEnableFull1Hz) {
        const res = await userSettingsApi.updateEnableFull1Hz(newValue)
        if (!res?.success) throw new Error("update failed")
      } else if (userSettingsApi?.updateSetting) {
        const res = await userSettingsApi.updateSetting("enable_full_1hz", newValue)
        if (!res?.success) throw new Error("update failed")
      } else {
        console.warn("No userSettingsApi method to persist setting; stored locally only")
      }
      toast.success(newValue ? "Full 1Hz GPS enabled" : "Full 1Hz GPS disabled")
    } catch (err) {
      userSettingsStore.update((s) => ({ ...s, enableFull1Hz: !newValue }))
      toast.error("Failed to update Full 1Hz GPS setting")
    }
  }

  async function handleGpsAcceptedPopupsToggle() {
    const newValue = !($userSettingsStore.showGpsAcceptedPopups)
    userSettingsStore.update((s) => ({ ...s, showGpsAcceptedPopups: newValue }))
    try {
      const res = await userSettingsApi.updateShowGpsAcceptedPopups(newValue)
      if (!res?.success) throw new Error("update failed")
      toast.success(newValue ? "GPS accepted popups enabled" : "GPS accepted popups disabled")
    } catch (err) {
      userSettingsStore.update((s) => ({ ...s, showGpsAcceptedPopups: !newValue }))
      toast.error("Failed to update GPS accepted popups setting")
    }
  }

  async function handleGpsRejectedPopupsToggle() {
    const newValue = !($userSettingsStore.showGpsRejectedPopups)
    userSettingsStore.update((s) => ({ ...s, showGpsRejectedPopups: newValue }))
    try {
      const res = await userSettingsApi.updateShowGpsRejectedPopups(newValue)
      if (!res?.success) throw new Error("update failed")
      toast.success(newValue ? "GPS rejected popups enabled" : "GPS rejected popups disabled")
    } catch (err) {
      userSettingsStore.update((s) => ({ ...s, showGpsRejectedPopups: !newValue }))
      toast.error("Failed to update GPS rejected popups setting")
    }
  }

  // Record confirmation popup
  $: sprayConfirmEnabled = $userSettingsStore.sprayConfirmEnabled

  async function handleSprayConfirmToggle() {
    const newValue = !($userSettingsStore.sprayConfirmEnabled)
    userSettingsStore.update((s) => ({ ...s, sprayConfirmEnabled: newValue }))
    try {
      const res = await userSettingsApi.updateSprayConfirmEnabled(newValue)
      if (!res?.success) throw new Error("update failed")
      toast.success(newValue ? "Record confirmation popup enabled" : "Record confirmation popup disabled")
    } catch (err) {
      userSettingsStore.update((s) => ({ ...s, sprayConfirmEnabled: !newValue }))
      toast.error("Failed to update record confirmation setting")
    }
  }

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
    try {
      // Show loading state
      const loadingToast = toast.loading("Submitting deletion request...")

      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 2000))

      // Hide loading toast
      toast.dismiss(loadingToast)

      // Close confirmation modal and show success modal
      showDeleteConfirm = false
      showDeleteSuccess = true
      confirmText = ""
    } catch (error) {
      toast.error("Failed to submit deletion request")
    }
  }

  function handlePrivacyPolicy() {
    goto("/privacy-policy")
  }

  function handleTermsOfService() {
    goto("/terms-of-service")
  }

  function closeSuccessModal() {
    showDeleteSuccess = false
    goto("/")
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
<div class="space-y-4 p-6">

  <!-- App Details -->
  <div class="rounded-lg border border-base-300 bg-base-200/30 p-4">
    <div class="flex items-center gap-3">
      <div class="rounded-lg bg-base-content/10 p-2 flex-shrink-0">
        <Icon icon="solar:smartphone-bold-duotone" width="18" height="18" class="text-base-content" />
      </div>
      <div class="flex-1 min-w-0">
        <span class="block text-sm text-contrast-content/60">Version</span>
        <p class="font-medium text-contrast-content">{appInfo.version} <span class="badge badge-outline badge-sm ml-1">{appInfo.platform}</span></p>
      </div>
    </div>
  </div>

  <div class="rounded-lg border border-base-300 bg-base-200/30 p-4">
    <div class="flex items-center gap-3">
      <div class="rounded-lg bg-base-content/10 p-2 flex-shrink-0">
        <Icon icon="solar:calendar-bold-duotone" width="18" height="18" class="text-base-content" />
      </div>
      <div class="flex-1 min-w-0">
        <span class="block text-sm text-contrast-content/60">Last Updated</span>
        <p class="font-medium text-contrast-content">{appInfo.buildDate.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>
      </div>
    </div>
  </div>

  <div class="rounded-lg border border-base-300 bg-base-200/30 p-4">
    <div class="flex items-center gap-3">
      <div class="rounded-lg bg-base-content/10 p-2 flex-shrink-0">
        <Icon icon="solar:monitor-bold-duotone" width="18" height="18" class="text-base-content" />
      </div>
      <div class="flex-1 min-w-0">
        <span class="block text-sm text-contrast-content/60">Screen</span>
        <p class="font-medium text-contrast-content">{window.screen.width} × {window.screen.height}</p>
      </div>
    </div>
  </div>

  <!-- Legal -->
  <button class="flex w-full items-center gap-3 text-left rounded-lg border border-base-300 bg-base-200/30 p-4 transition-colors hover:border-base-content/20" on:click={handlePrivacyPolicy}>
    <div class="rounded-lg bg-base-content/10 p-2 flex-shrink-0">
      <Icon icon="solar:shield-check-bold-duotone" width="18" height="18" class="text-base-content" />
    </div>
    <div class="flex-1 min-w-0">
      <span class="block text-sm text-contrast-content/60">Legal</span>
      <p class="font-medium text-contrast-content">Privacy Policy</p>
    </div>
  </button>

  <button class="flex w-full items-center gap-3 text-left rounded-lg border border-base-300 bg-base-200/30 p-4 transition-colors hover:border-base-content/20" on:click={handleTermsOfService}>
    <div class="rounded-lg bg-base-content/10 p-2 flex-shrink-0">
      <Icon icon="solar:document-text-bold-duotone" width="18" height="18" class="text-base-content" />
    </div>
    <div class="flex-1 min-w-0">
      <span class="block text-sm text-contrast-content/60">Legal</span>
      <p class="font-medium text-contrast-content">Terms of Service</p>
    </div>
  </button>

  <!-- GPS Popups -->
  <div class="rounded-lg border border-base-300 bg-base-200/30 p-4">
    <div class="space-y-4">
      <label class="flex items-start justify-between gap-3 cursor-pointer">
        <div class="flex items-start gap-3 min-w-0">
          <div class="rounded-lg bg-base-content/10 p-2 flex-shrink-0">
            <Icon icon="solar:gps-dot-bold-duotone" width="18" height="18" class="text-base-content" />
          </div>
          <div class="min-w-0">
            <p class="text-sm font-medium text-contrast-content">Full 1Hz GPS</p>
            <p class="text-xs text-contrast-content/60">Apply native 1Hz GPS updates as they arrive.</p>
          </div>
        </div>
        <input type="checkbox" class="toggle toggle-primary flex-shrink-0 mt-0.5" checked={full1HzEnabled} on:change={handleFull1HzToggle} />
      </label>
      <label class="flex items-start justify-between gap-3 cursor-pointer">
        <div class="flex items-start gap-3 min-w-0">
          <div class="rounded-lg bg-base-content/10 p-2 flex-shrink-0">
            <Icon icon="solar:check-circle-bold-duotone" width="18" height="18" class="text-success" />
          </div>
          <div class="min-w-0">
            <p class="text-sm font-medium text-contrast-content">Show GPS Accepted popups</p>
            <p class="text-xs text-contrast-content/60">Visual popup when a GPS fix passes the filter.</p>
          </div>
        </div>
        <input type="checkbox" class="toggle toggle-success flex-shrink-0 mt-0.5" checked={gpsAcceptedPopupsEnabled} on:change={handleGpsAcceptedPopupsToggle} />
      </label>
      <label class="flex items-start justify-between gap-3 cursor-pointer">
        <div class="flex items-start gap-3 min-w-0">
          <div class="rounded-lg bg-base-content/10 p-2 flex-shrink-0">
            <Icon icon="solar:close-circle-bold-duotone" width="18" height="18" class="text-error" />
          </div>
          <div class="min-w-0">
            <p class="text-sm font-medium text-contrast-content">Show GPS Rejected popups</p>
            <p class="text-xs text-contrast-content/60">Visual popup when a GPS fix is filtered out.</p>
          </div>
        </div>
        <input type="checkbox" class="toggle toggle-error flex-shrink-0 mt-0.5" checked={gpsRejectedPopupsEnabled} on:change={handleGpsRejectedPopupsToggle} />
      </label>
    </div>
  </div>

  <!-- Record Confirmation -->
  <div class="rounded-lg border border-base-300 bg-base-200/30 p-4">
    <label class="flex items-start justify-between gap-3 cursor-pointer">
      <div class="flex items-start gap-3 min-w-0">
        <div class="rounded-lg bg-base-content/10 p-2 flex-shrink-0">
          <Icon icon="solar:document-check-bold-duotone" width="18" height="18" class="text-info" />
        </div>
        <div class="min-w-0">
          <p class="text-sm font-medium text-contrast-content">Record Confirmation</p>
          <p class="text-xs text-contrast-content/60">Show a confirmation popup when closing a trail to review and confirm records.</p>
        </div>
      </div>
      <input type="checkbox" class="toggle toggle-info flex-shrink-0 mt-0.5" checked={sprayConfirmEnabled} on:change={handleSprayConfirmToggle} />
    </label>
  </div>

  <!-- Dev Mode -->
  <div class="rounded-lg border border-base-300 bg-base-200/30 p-4">
    <label class="flex items-start justify-between gap-3 cursor-pointer">
      <div class="flex items-start gap-3 min-w-0">
        <div class="rounded-lg bg-base-content/10 p-2 flex-shrink-0">
          <Icon icon="solar:bug-bold-duotone" width="18" height="18" class="text-warning" />
        </div>
        <div class="min-w-0">
          <p class="text-sm font-medium text-contrast-content">Developer Mode</p>
          <p class="text-xs text-contrast-content/60">Unlocks Admin dashboard, Dev Mode &amp; BG Simulation tools.</p>
        </div>
      </div>
      <input type="checkbox" class="toggle toggle-warning flex-shrink-0 mt-0.5" checked={devToolsEnabled} on:change={handleDevToggleClick} />
    </label>
  </div>

  <!-- Danger Zone -->
  <div class="rounded-lg border border-error/20 bg-error/5 p-4">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p class="text-sm text-contrast-content/80">Request account deletion. Please ensure you've saved any important data before proceeding.</p>
      <button class="btn btn-outline gap-2 border-error text-error hover:bg-error hover:text-white flex-shrink-0 flex-nowrap whitespace-nowrap" on:click={() => (showDeleteConfirm = true)}>
        <Icon icon="solar:trash-bin-trash-bold-duotone" width="16" height="16" />
        Request Account Deletion
      </button>
    </div>
  </div>
</div>

<!-- Delete Confirmation Modal -->
{#if showDeleteConfirm}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
    on:click={() => { showDeleteConfirm = false; confirmText = "" }}
    on:keydown={(e) => e.key === "Escape" && (showDeleteConfirm = false, confirmText = "")} role="presentation">
    <div class="w-full max-w-sm rounded-2xl bg-base-100 shadow-2xl overflow-hidden" on:click|stopPropagation role="dialog" aria-modal="true">
      <div class="flex items-center justify-between border-b border-base-300 px-5 py-4">
        <div class="flex items-center gap-3">
          <div class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-base-content/10">
            <Icon icon="solar:danger-triangle-bold-duotone" width="18" height="18" class="text-error" />
          </div>
          <h4 class="text-base font-semibold text-error">Request Account Deletion</h4>
        </div>
        <button class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition-colors hover:bg-base-200"
          on:click={() => { showDeleteConfirm = false; confirmText = "" }} title="Close">
          <X class="h-4 w-4 text-contrast-content/60" />
        </button>
      </div>
      <div class="border-t border-base-300 px-5 py-4 space-y-4">
        <p class="text-sm text-contrast-content">This will permanently remove all your data including vehicle tracking, field markers, reports, and account settings.</p>
        <p class="text-sm font-medium text-error">Type "DELETE" below to confirm:</p>
        <input type="text" placeholder="Type DELETE to confirm" class="input input-bordered w-full" bind:value={confirmText} />
      </div>
      <div class="flex justify-end px-5 py-3">
        <button class="btn btn-error gap-2" disabled={confirmText !== "DELETE"} on:click={handleDeleteAccount}>
          <Icon icon="solar:trash-bin-trash-bold-duotone" width="16" height="16" />
          Submit Deletion Request
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Developer Password Modal -->
{#if showDevPasswordModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
    on:click={() => { showDevPasswordModal = false; devPassword = ""; devPasswordError = "" }}
    on:keydown={(e) => e.key === "Escape" && (showDevPasswordModal = false, devPassword = "", devPasswordError = "")} role="presentation">
    <div class="w-full max-w-sm rounded-2xl bg-base-100 shadow-2xl overflow-hidden" on:click|stopPropagation role="dialog" aria-modal="true">
      <div class="flex items-center justify-between border-b border-base-300 px-5 py-4">
        <h4 class="text-base font-semibold text-contrast-content">Developer Access</h4>
        <button class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition-colors hover:bg-base-200"
          on:click={() => { showDevPasswordModal = false; devPassword = ""; devPasswordError = "" }} title="Close">
          <X class="h-4 w-4 text-contrast-content/60" />
        </button>
      </div>
      <div class="border-t border-base-300 px-5 py-4">
        <p class="mb-3 text-sm text-contrast-content/70">Enter the developer password to enable admin features.</p>
        <input type="password" placeholder="Password" class="input input-bordered w-full" class:input-error={devPasswordError} bind:value={devPassword} autofocus />
        {#if devPasswordError}
          <p class="mt-1 text-xs text-error">{devPasswordError}</p>
        {/if}
      </div>
      <div class="flex justify-end px-5 py-3">
        <button on:click={handleDevPasswordSubmit} class="btn btn-warning gap-2">
          <Icon icon="solar:lock-keyhole-unlocked-bold-duotone" width="16" height="16" /> Unlock
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Delete Success Modal -->
{#if showDeleteSuccess}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
    on:click={closeSuccessModal}
    on:keydown={(e) => e.key === "Escape" && closeSuccessModal()} role="presentation">
    <div class="w-full max-w-sm rounded-2xl bg-base-100 shadow-2xl overflow-hidden" on:click|stopPropagation role="dialog" aria-modal="true">
      <div class="flex items-center justify-between border-b border-base-300 px-5 py-4">
        <h4 class="text-base font-semibold text-contrast-content">Deletion Request Submitted</h4>
        <button class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition-colors hover:bg-base-200"
          on:click={closeSuccessModal} title="Close">
          <X class="h-4 w-4 text-contrast-content/60" />
        </button>
      </div>
      <div class="border-t border-base-300 px-5 py-4 text-center">
        <div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-warning/20">
          <Icon icon="solar:clock-circle-bold-duotone" width="32" height="32" class="text-warning" />
        </div>
        <p class="text-sm text-contrast-content">Your account deletion request has been submitted. Your account will be permanently deleted within 24-48 hours.</p>
      </div>
      <div class="flex justify-end px-5 py-3">
        <button on:click={closeSuccessModal} class="btn btn-outline btn-sm">Close</button>
      </div>
    </div>
  </div>
{/if}
