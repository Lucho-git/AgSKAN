<script lang="ts">
  import { session } from "$lib/stores/sessionStore"
  import { userSettingsApi } from "$lib/api/userSettingsApi"
  import { supabase } from "$lib/stores/sessionStore"
  import { page } from "$app/stores"
  import { toast } from "svelte-sonner"
  import Icon from "@iconify/svelte"
  import { X } from "lucide-svelte"

  // Security state
  let editingEmail = false
  let editingPassword = false
  let formEmail = ""
  let formPassword = { current: "", new: "", confirm: "" }

  // Validation state
  let emailError = ""
  let passwordErrors = {
    current: "",
    new: "",
    confirm: "",
    general: "",
  }

  // Initialize form email when session changes
  $: if ($session?.user?.email && !editingEmail) {
    formEmail = $session.user.email
  }

  // Email validation
  $: {
    if (editingEmail && formEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(formEmail)) {
        emailError = "Please enter a valid email address"
      } else if (formEmail === $session?.user?.email) {
        emailError = "New email must be different from current email"
      } else {
        emailError = ""
      }
    } else {
      emailError = ""
    }
  }

  // Password validation
  $: {
    if (editingPassword) {
      // Reset errors
      passwordErrors = {
        current: "",
        new: "",
        confirm: "",
        general: "",
      }

      // Confirm password validation - only check if passwords match
      if (formPassword.confirm && formPassword.new) {
        if (formPassword.new !== formPassword.confirm) {
          passwordErrors.confirm = "Passwords do not match"
        }
      }
    }
  }

  // Check if forms are valid
  $: emailFormValid =
    !emailError && formEmail && formEmail !== $session?.user?.email
  $: passwordFormValid =
    !passwordErrors.confirm &&
    formPassword.current &&
    formPassword.new &&
    formPassword.confirm &&
    formPassword.new === formPassword.confirm

  // Check if user has password or uses OAuth
  let hasPassword = false
  let usingOAuth = false
  let sendingPasswordEmail = false
  let sentPasswordEmail = false
  let savingEmail = false
  let savingPassword = false

  // Check user's authentication method
  $: if ($session?.user) {
    // Check login provider from app_metadata
    if ($session.user?.app_metadata?.provider) {
      const provider = $session.user.app_metadata.provider
      hasPassword = provider === "email"
      usingOAuth = provider !== "email"
    }

    // Use AMR data if available (more reliable)
    // @ts-expect-error: Supabase doesn't maintain AMR typedef
    if ($session.user?.amr) {
      // @ts-expect-error: Supabase doesn't maintain AMR typedef
      hasPassword = $session.user.amr.find((x) => x.method === "password")
        ? true
        : false
      // @ts-expect-error: Supabase doesn't maintain AMR typedef
      usingOAuth = $session.user.amr.find((x) => x.method === "oauth")
        ? true
        : false
    }
  }

  async function handleEmailUpdate() {
    if (!emailFormValid || savingEmail) return
    savingEmail = true

    try {
      const { data, error } = await supabase.auth.updateUser({
        email: formEmail,
      })

      if (error) throw error

      editingEmail = false
      emailError = ""

      toast.success("Confirmation email sent", {
        description: "Check your inbox to complete the change",
        duration: 6000,
      })

      // Update the session store to reflect the new email
      if (data.user) {
        session.update((currentSession) => ({
          ...currentSession,
          user: {
            ...currentSession.user,
            email: data.user.email,
          },
        }))
      }
    } catch (error) {
      console.error("Error updating email:", error)
      emailError = error.message || "Failed to update email address"
    } finally {
      savingEmail = false
    }
  }

  async function handlePasswordUpdate() {
    if (!passwordFormValid || savingPassword) return
    savingPassword = true

    try {
      const result = await userSettingsApi.updatePassword(
        formPassword.new,
        formPassword.confirm,
        formPassword.current,
      )

      if (result.success) {
        editingPassword = false
        formPassword = { current: "", new: "", confirm: "" }
        passwordErrors = {
          current: "",
          new: "",
          confirm: "",
          general: "",
        }
        toast.success("Password updated")
      } else {
        passwordErrors.general = result.message || "Failed to update password"
      }
    } catch (error) {
      console.error("Error updating password:", error)
      passwordErrors.general = "An unexpected error occurred"
    } finally {
      savingPassword = false
    }
  }

  async function sendPasswordSetupEmail() {
    if (!$session?.user?.email) return

    sendingPasswordEmail = true

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        $session.user.email,
        {
          redirectTo: `${$page.url.origin}/auth/callback?next=%2Faccount%2Fsettings%2Freset_password`,
        },
      )

      if (!error) {
        sentPasswordEmail = true
      }
    } catch (error) {
      console.error("Error sending password setup email:", error)
    } finally {
      sendingPasswordEmail = false
    }
  }

  function startEmailEdit() {
    formEmail = $session?.user?.email || ""
    emailError = ""
    editingEmail = true
  }

  function cancelEmailEdit() {
    formEmail = $session?.user?.email || ""
    emailError = ""
    editingEmail = false
  }

  function startPasswordEdit() {
    formPassword = { current: "", new: "", confirm: "" }
    passwordErrors = {
      current: "",
      new: "",
      confirm: "",
      general: "",
    }
    editingPassword = true
  }

  function cancelPasswordEdit() {
    formPassword = { current: "", new: "", confirm: "" }
    passwordErrors = {
      current: "",
      new: "",
      confirm: "",
      general: "",
    }
    editingPassword = false
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
<div class="p-6">
  <div class="space-y-4">

    <!-- ===== EMAIL ===== -->
    <button type="button" on:click={startEmailEdit}
      class="flex w-full items-center gap-3 text-left rounded-lg border border-base-300 bg-base-200/30 p-4 transition-colors hover:border-base-content/20">
      <div class="rounded-lg bg-base-content/10 p-2 flex-shrink-0">
        <Icon icon="solar:letter-bold-duotone" width="18" height="18" class="text-base-content" />
      </div>
      <div class="flex-1 min-w-0">
        <label class="block text-sm text-contrast-content/60">Email Address</label>
        <p class="font-medium text-contrast-content">{$session?.user?.email || "No email set"}</p>
        <p class="mt-0.5 text-xs text-success">Verified</p>
      </div>
      <div class="flex-shrink-0 text-contrast-content/40">
        <Icon icon="solar:pen-bold-duotone" width="18" height="18" />
      </div>
    </button>

    <!-- ===== PASSWORD ===== -->
    {#if hasPassword}
      <button type="button" on:click={startPasswordEdit}
        class="flex w-full items-center gap-3 text-left rounded-lg border border-base-300 bg-base-200/30 p-4 transition-colors hover:border-base-content/20">
        <div class="rounded-lg bg-base-content/10 p-2 flex-shrink-0">
          <Icon icon="solar:lock-password-bold-duotone" width="18" height="18" class="text-base-content" />
        </div>
        <div class="flex-1 min-w-0">
          <label class="block text-sm text-contrast-content/60">Password</label>
          <p class="font-medium text-contrast-content">••••••••••••</p>
        </div>
        <div class="flex-shrink-0 text-contrast-content/40">
          <Icon icon="solar:pen-bold-duotone" width="18" height="18" />
        </div>
      </button>
    {:else}
      <button type="button" on:click={sendPasswordSetupEmail} disabled={sendingPasswordEmail || sentPasswordEmail}
        class="flex w-full items-center gap-3 text-left rounded-lg border border-base-300 bg-base-200/30 p-4 transition-colors hover:border-base-content/20">
        <div class="rounded-lg bg-base-content/10 p-2 flex-shrink-0">
          <Icon icon="solar:lock-password-bold-duotone" width="18" height="18" class="text-base-content" />
        </div>
        <div class="flex-1 min-w-0">
          <label class="block text-sm text-contrast-content/60">Password</label>
          <p class="font-medium text-contrast-content">
            {sentPasswordEmail ? "Email sent — check your inbox" : sendingPasswordEmail ? "Sending..." : "Set a password"}
          </p>
        </div>
        <div class="flex-shrink-0 text-contrast-content/40">
          <Icon icon="solar:pen-bold-duotone" width="18" height="18" />
        </div>
      </button>
    {/if}
  </div>
</div>

<!-- Email Modal -->
{#if editingEmail}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
    on:click={cancelEmailEdit} on:keydown={(e) => e.key === "Escape" && cancelEmailEdit()} role="presentation">
    <div class="w-full max-w-sm rounded-2xl bg-base-100 shadow-2xl overflow-hidden" on:click|stopPropagation role="dialog" aria-modal="true">
      <!-- Header -->
      <div class="flex items-center justify-between border-b border-base-300 px-5 py-4">
        <div class="flex items-center gap-3">
          <div class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-base-content/10">
            <Icon icon="solar:letter-bold-duotone" width="18" height="18" class="text-base-content" />
          </div>
          <h4 class="text-base font-semibold text-contrast-content">Change Email</h4>
        </div>
        <button class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition-colors hover:bg-base-200"
          on:click={cancelEmailEdit} title="Close">
          <X class="h-4 w-4 text-contrast-content/60" />
        </button>
      </div>
      <div class="border-t border-base-300 px-5 py-4">
        <label for="email-input" class="mb-1 block text-sm font-medium text-contrast-content">Email Address</label>
        <input id="email-input" type="email" bind:value={formEmail}
          on:keydown={(e) => e.key === "Enter" && handleEmailUpdate()}
          class="w-full rounded-lg border {emailError ? 'border-error' : 'border-base-300'} bg-base-100 px-4 py-3 text-contrast-content placeholder-contrast-content/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          placeholder="Enter new email address" />
        {#if emailError}
          <p class="mt-1 flex items-center gap-1 text-sm text-error"><Icon icon="solar:info-circle-bold-duotone" width="16" height="16" /> {emailError}</p>
        {/if}
      </div>
      <!-- Footer -->
      <div class="flex justify-end px-5 py-3">
        <button on:click={handleEmailUpdate} disabled={!emailFormValid || savingEmail}
          class="rounded-lg bg-base-content px-4 py-2 text-sm font-medium text-base-100 transition-colors hover:bg-base-content/90 disabled:opacity-50">
          {savingEmail ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Password Modal -->
{#if editingPassword}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
    on:click={cancelPasswordEdit} on:keydown={(e) => e.key === "Escape" && cancelPasswordEdit()} role="presentation">
    <div class="w-full max-w-sm rounded-2xl bg-base-100 shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto" on:click|stopPropagation role="dialog" aria-modal="true">
      <!-- Header -->
      <div class="flex items-center justify-between border-b border-base-300 px-5 py-4">
        <div class="flex items-center gap-3">
          <div class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-base-content/10">
            <Icon icon="solar:lock-password-bold-duotone" width="18" height="18" class="text-base-content" />
          </div>
          <h4 class="text-base font-semibold text-contrast-content">Change Password</h4>
        </div>
        <button class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition-colors hover:bg-base-200"
          on:click={cancelPasswordEdit} title="Close">
          <X class="h-4 w-4 text-contrast-content/60" />
        </button>
      </div>
      <!-- Body -->
      <div class="border-t border-base-300 px-5 py-4">

      {#if passwordErrors.general}
        <div class="mb-4 rounded-lg border border-error bg-error/10 p-3">
          <div class="flex items-center gap-2">
            <Icon icon="solar:danger-circle-bold-duotone" width="16" height="16" class="text-error" />
            <p class="text-sm font-medium text-error">{passwordErrors.general}</p>
          </div>
        </div>
      {/if}

      <div class="space-y-3">
        <!-- Current Password -->
        <div>
          <label class="mb-1 block text-sm text-contrast-content/60">Current Password</label>
          <input type="text" bind:value={formPassword.current}
            on:keydown={(e) => e.key === "Enter" && handlePasswordUpdate()}
            class="w-full rounded-lg border border-base-300 bg-base-100 px-4 py-3 text-contrast-content placeholder-contrast-content/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            placeholder="Enter current password" />
        </div>

        <!-- New Password -->
        <div>
          <label class="mb-1 block text-sm text-contrast-content/60">New Password</label>
          <input type="text" bind:value={formPassword.new}
            on:keydown={(e) => e.key === "Enter" && handlePasswordUpdate()}
            class="w-full rounded-lg border border-base-300 bg-base-100 px-4 py-3 text-contrast-content placeholder-contrast-content/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            placeholder="Enter new password" />
        </div>

        <!-- Confirm New Password -->
        <div>
          <label class="mb-1 block text-sm text-contrast-content/60">Confirm New Password</label>
          <input type="text" bind:value={formPassword.confirm}
            on:keydown={(e) => e.key === "Enter" && handlePasswordUpdate()}
            class="w-full rounded-lg border {passwordErrors.confirm ? 'border-error' : 'border-base-300'} bg-base-100 px-4 py-3 text-contrast-content placeholder-contrast-content/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            placeholder="Confirm new password" />
          {#if passwordErrors.confirm}
            <p class="mt-1 flex items-center gap-1 text-sm text-error"><Icon icon="solar:info-circle-bold-duotone" width="16" height="16" /> {passwordErrors.confirm}</p>
          {/if}
        </div>
      </div>
      </div>
      <!-- Footer -->
      <div class="flex justify-end px-5 py-3">
        <button on:click={handlePasswordUpdate} disabled={!passwordFormValid || savingPassword}
          class="rounded-lg bg-base-content px-4 py-2 text-sm font-medium text-base-100 transition-colors hover:bg-base-content/90 disabled:opacity-50">
          {savingPassword ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  </div>
{/if}
