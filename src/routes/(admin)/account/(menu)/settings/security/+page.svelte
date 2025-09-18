<script lang="ts">
  import { session } from "$lib/stores/sessionStore"
  import { userSettingsApi } from "$lib/api/userSettingsApi"
  import { supabase } from "$lib/stores/sessionStore"
  import { page } from "$app/stores"
  import { toast } from "svelte-sonner"
  import Icon from "@iconify/svelte"

  // Security state
  let editingEmail = false
  let editingPassword = false
  let formEmail = ""
  let formPassword = {
    current: "",
    new: "",
    confirm: "",
  }

  // Password visibility state
  let showCurrentPassword = false
  let showNewPassword = false
  let showConfirmPassword = false

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
    if (!emailFormValid) return

    try {
      // Direct update without verification
      const { data, error } = await supabase.auth.updateUser({
        email: formEmail,
      })

      if (error) throw error

      // Update was successful
      editingEmail = false
      emailError = ""

      // Show success message
      toast.success("Email updated successfully!", {
        description: "Your email has been changed.",
        duration: 4000,
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
    }
  }

  async function handlePasswordUpdate() {
    if (!passwordFormValid) return

    try {
      const result = await userSettingsApi.updatePassword(
        formPassword.new,
        formPassword.confirm,
        formPassword.current,
      )

      if (result.success) {
        editingPassword = false
        formPassword = { current: "", new: "", confirm: "" }
        // Reset password visibility
        showCurrentPassword = false
        showNewPassword = false
        showConfirmPassword = false
        passwordErrors = {
          current: "",
          new: "",
          confirm: "",
          general: "",
        }
      } else {
        passwordErrors.general = result.error || "Failed to update password"
      }
    } catch (error) {
      console.error("Error updating password:", error)
      passwordErrors.general = "An unexpected error occurred"
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
    showCurrentPassword = false
    showNewPassword = false
    showConfirmPassword = false
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
    showCurrentPassword = false
    showNewPassword = false
    showConfirmPassword = false
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
<div class="divide-y divide-base-300">
  <!-- Email -->
  <div class="p-6">
    <div class="mb-4">
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
    </div>

    {#if editingEmail}
      <div class="space-y-4">
        <div>
          <input
            type="email"
            bind:value={formEmail}
            class="w-full rounded-lg border {emailError
              ? 'border-error'
              : 'border-base-300'} bg-base-100 px-4 py-3 text-contrast-content placeholder-contrast-content/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            placeholder="Enter new email address"
          />
          {#if emailError}
            <p class="mt-1 flex items-center gap-1 text-sm text-error">
              <Icon
                icon="solar:info-circle-bold-duotone"
                width="16"
                height="16"
              />
              {emailError}
            </p>
          {/if}
        </div>

        <div class="flex justify-end gap-3">
          <button
            on:click={cancelEmailEdit}
            class="flex items-center gap-2 rounded-lg border border-base-300 bg-base-100 px-4 py-2 text-sm font-medium text-contrast-content hover:bg-base-200 focus:outline-none focus:ring-2 focus:ring-primary/20"
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
            disabled={!emailFormValid}
            class="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-content hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Icon icon="solar:diskette-bold-duotone" width="16" height="16" />
            Save
          </button>
        </div>
      </div>
    {:else}
      <div
        class="flex items-center gap-3 rounded-lg border border-base-300 bg-base-200/30 p-4"
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
      <button
        on:click={startEmailEdit}
        class="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-base-300 bg-base-100 px-4 py-2 text-sm font-medium text-contrast-content hover:bg-base-200 focus:outline-none focus:ring-2 focus:ring-primary/20"
      >
        <Icon icon="solar:letter-bold-duotone" width="16" height="16" />
        Change Email
      </button>
    {/if}
  </div>

  <!-- Password -->
  <div class="p-6">
    <div class="mb-4">
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
    </div>

    {#if editingPassword && hasPassword}
      <div class="space-y-4">
        {#if passwordErrors.general}
          <div class="rounded-lg border border-error bg-error/10 p-4">
            <div class="flex items-center gap-2">
              <Icon
                icon="solar:danger-circle-bold-duotone"
                width="20"
                height="20"
                class="text-error"
              />
              <p class="font-medium text-error">Error</p>
            </div>
            <p class="mt-1 text-sm text-error/80">{passwordErrors.general}</p>
          </div>
        {/if}

        <!-- Current Password -->
        <div>
          <label class="mb-1 block text-sm text-contrast-content/60"
            >Current Password</label
          >
          <div class="relative">
            {#if showCurrentPassword}
              <input
                type="text"
                bind:value={formPassword.current}
                class="w-full rounded-lg border border-base-300 bg-base-100 px-4 py-3 pr-12 text-contrast-content placeholder-contrast-content/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="Enter current password"
              />
            {:else}
              <input
                type="password"
                bind:value={formPassword.current}
                class="w-full rounded-lg border border-base-300 bg-base-100 px-4 py-3 pr-12 text-contrast-content placeholder-contrast-content/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="Enter current password"
              />
            {/if}
            <button
              type="button"
              on:click={() => (showCurrentPassword = !showCurrentPassword)}
              class="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-base-content/60 hover:bg-base-200 hover:text-base-content"
            >
              <Icon
                icon={showCurrentPassword
                  ? "solar:eye-closed-bold-duotone"
                  : "solar:eye-bold-duotone"}
                width="18"
                height="18"
              />
            </button>
          </div>
        </div>

        <!-- New Password -->
        <div>
          <label class="mb-1 block text-sm text-contrast-content/60"
            >New Password</label
          >
          <div class="relative">
            {#if showNewPassword}
              <input
                type="text"
                bind:value={formPassword.new}
                class="w-full rounded-lg border border-base-300 bg-base-100 px-4 py-3 pr-12 text-contrast-content placeholder-contrast-content/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="Enter new password"
              />
            {:else}
              <input
                type="password"
                bind:value={formPassword.new}
                class="w-full rounded-lg border border-base-300 bg-base-100 px-4 py-3 pr-12 text-contrast-content placeholder-contrast-content/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="Enter new password"
              />
            {/if}
            <button
              type="button"
              on:click={() => (showNewPassword = !showNewPassword)}
              class="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-base-content/60 hover:bg-base-200 hover:text-base-content"
            >
              <Icon
                icon={showNewPassword
                  ? "solar:eye-closed-bold-duotone"
                  : "solar:eye-bold-duotone"}
                width="18"
                height="18"
              />
            </button>
          </div>
        </div>

        <!-- Confirm New Password -->
        <div>
          <label class="mb-1 block text-sm text-contrast-content/60"
            >Confirm New Password</label
          >
          <div class="relative">
            {#if showConfirmPassword}
              <input
                type="text"
                bind:value={formPassword.confirm}
                class="w-full rounded-lg border {passwordErrors.confirm
                  ? 'border-error'
                  : 'border-base-300'} bg-base-100 px-4 py-3 pr-12 text-contrast-content placeholder-contrast-content/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="Confirm new password"
              />
            {:else}
              <input
                type="password"
                bind:value={formPassword.confirm}
                class="w-full rounded-lg border {passwordErrors.confirm
                  ? 'border-error'
                  : 'border-base-300'} bg-base-100 px-4 py-3 pr-12 text-contrast-content placeholder-contrast-content/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="Confirm new password"
              />
            {/if}
            <button
              type="button"
              on:click={() => (showConfirmPassword = !showConfirmPassword)}
              class="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-base-content/60 hover:bg-base-200 hover:text-base-content"
            >
              <Icon
                icon={showConfirmPassword
                  ? "solar:eye-closed-bold-duotone"
                  : "solar:eye-bold-duotone"}
                width="18"
                height="18"
              />
            </button>
          </div>
          {#if passwordErrors.confirm}
            <p class="mt-1 flex items-center gap-1 text-sm text-error">
              <Icon
                icon="solar:info-circle-bold-duotone"
                width="16"
                height="16"
              />
              {passwordErrors.confirm}
            </p>
          {/if}
        </div>

        <div class="flex justify-end gap-3">
          <button
            on:click={cancelPasswordEdit}
            class="flex items-center gap-2 rounded-lg border border-base-300 bg-base-100 px-4 py-2 text-sm font-medium text-contrast-content hover:bg-base-200 focus:outline-none focus:ring-2 focus:ring-primary/20"
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
            disabled={!passwordFormValid}
            class="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-content hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Icon icon="solar:key-bold-duotone" width="16" height="16" />
            Update Password
          </button>
        </div>
      </div>
    {:else if hasPassword}
      <div
        class="flex items-center gap-3 rounded-lg border border-base-300 bg-base-200/30 p-4"
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
        on:click={startPasswordEdit}
        class="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-base-300 bg-base-100 px-4 py-2 text-sm font-medium text-contrast-content hover:bg-base-200 focus:outline-none focus:ring-2 focus:ring-primary/20"
      >
        <Icon icon="solar:key-bold-duotone" width="16" height="16" />
        Change Password
      </button>
    {:else}
      <!-- OAuth users or users without password -->
      <div class="space-y-4">
        {#if usingOAuth}
          <div class="rounded-lg border border-base-300 bg-base-200/30 p-4">
            <h4 class="mb-2 font-medium text-contrast-content">
              Set Password By Email
            </h4>
            <p class="mb-4 text-sm text-contrast-content/60">
              You use OAuth to sign in ("Sign in with Github" or similar). You
              can continue to access your account using only OAuth if you like,
              or set a password for additional security.
            </p>
          </div>
        {:else}
          <div class="rounded-lg border border-base-300 bg-base-200/30 p-4">
            <h4 class="mb-2 font-medium text-contrast-content">
              Change Password By Email
            </h4>
          </div>
        {/if}

        <p class="text-sm text-contrast-content/60">
          The button below will send you an email at {$session?.user?.email} which
          will allow you to set your password.
        </p>

        {#if !sentPasswordEmail}
          <button
            on:click={sendPasswordSetupEmail}
            disabled={sendingPasswordEmail}
            class="flex w-full items-center justify-center gap-2 rounded-lg border border-base-300 bg-base-100 px-4 py-2 text-sm font-medium text-contrast-content hover:bg-base-200 focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {#if sendingPasswordEmail}
              <div
                class="h-4 w-4 animate-spin rounded-full border-2 border-contrast-content/20 border-t-contrast-content"
              ></div>
              Sending...
            {:else}
              <Icon icon="solar:letter-bold-duotone" width="16" height="16" />
              Send Set Password Email
            {/if}
          </button>
        {:else}
          <div class="rounded-lg border border-success bg-success/10 p-4">
            <div class="flex items-center gap-2">
              <Icon
                icon="solar:check-circle-bold-duotone"
                width="20"
                height="20"
                class="text-success"
              />
              <p class="font-medium text-success">Email Sent!</p>
            </div>
            <p class="mt-1 text-sm text-success/80">
              Please check your inbox and use the link to set your password.
            </p>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>
