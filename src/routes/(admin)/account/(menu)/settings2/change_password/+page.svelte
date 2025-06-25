<!-- change_password/+page.svelte -->
<script lang="ts">
  import { page } from "$app/stores"
  import { getContext, onMount } from "svelte"
  import type { Writable } from "svelte/store"
  import SettingsModule from "../settings_module.svelte"
  import { session, supabase } from "$lib/stores/sessionStore"
  import { goto } from "$app/navigation"
  import { userSettingsApi } from "$lib/api/userSettingsApi"

  let adminSection: Writable<string> = getContext("adminSection")
  adminSection.set("settings")

  // Default to showing password form for email-based login
  let hasPassword = false
  let usingOAuth = false
  let loading = true

  onMount(async () => {
    // Check if user is authenticated
    if (!$session) {
      goto("/login")
      return
    }

    console.log("Session user:", $session.user)

    // Check login provider from app_metadata
    if ($session.user?.app_metadata?.provider) {
      const provider = $session.user.app_metadata.provider
      console.log("Auth provider:", provider)

      // If provider is email, assume they have a password
      if (provider === "email") {
        hasPassword = true
      }
      // If provider is oauth (github, google, etc.), mark as oauth
      else if (provider !== "email") {
        usingOAuth = true
      }
    }

    // If we have AMR data, use that instead (more reliable)
    // @ts-expect-error: we ignore because Supabase does not maintain an AMR typedef
    if ($session.user?.amr) {
      console.log("User AMR:", $session.user.amr)
      // @ts-expect-error: we ignore because Supabase does not maintain an AMR typedef
      hasPassword = $session.user.amr.find((x) => x.method === "password")
        ? true
        : false
      // @ts-expect-error: we ignore because Supabase does not maintain an AMR typedef
      usingOAuth = $session.user.amr.find((x) => x.method === "oauth")
        ? true
        : false
    }

    console.log("hasPassword:", hasPassword)
    console.log("usingOAuth:", usingOAuth)

    loading = false
  })

  // Handler for password update using the API
  async function handlePasswordUpdate(formData) {
    return await userSettingsApi.updatePassword(
      formData.newPassword1,
      formData.newPassword2,
      formData.currentPassword,
    )
  }

  function handleSuccess() {
    // Navigate back to settings after success
    setTimeout(() => {
      goto("/account/settings")
    }, 1500)
  }

  let sendBtn
  let sentEmail = false
  let sendingEmail = false

  async function sendForgotPassword() {
    if (!$session?.user?.email) return

    if (sendBtn) {
      sendBtn.disabled = true
      sendBtn.textContent = "Sending..."
    }

    sendingEmail = true

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        $session.user.email,
        {
          redirectTo: `${$page.url.origin}/auth/callback?next=%2Faccount%2Fsettings%2Freset_password`,
        },
      )

      if (error) {
        throw error
      }

      sentEmail = true
    } catch (error) {
      console.error("Error sending password reset email:", error)

      // Reset button if error
      if (sendBtn) {
        sendBtn.disabled = false
        sendBtn.textContent = "Send Set Password Email"
      }
    } finally {
      sendingEmail = false
    }
  }
</script>

<svelte:head>
  <title>Change Password</title>
</svelte:head>

<h1 class="mb-6 text-2xl font-bold">Change Password</h1>

{#if loading}
  <div class="flex h-64 items-center justify-center">
    <div class="loading loading-spinner loading-lg"></div>
  </div>
{:else if hasPassword}
  <SettingsModule
    title="Change Password"
    editable={true}
    saveButtonTitle="Change Password"
    successTitle="Password Changed"
    successBody="On next sign in, use your new password."
    apiHandler={handlePasswordUpdate}
    fields={[
      {
        id: "newPassword1",
        label: "New Password",
        initialValue: "",
        inputType: "password",
      },
      {
        id: "newPassword2",
        label: "Confirm New Password",
        initialValue: "",
        inputType: "password",
      },
      {
        id: "currentPassword",
        label: "Current Password",
        initialValue: "",
        inputType: "password",
      },
    ]}
    on:success={handleSuccess}
  />
{:else}
  <div
    class="card mt-8 flex max-w-md max-w-xl flex-col p-6 pb-7 shadow md:flex-row"
  >
    <div class="flex flex-col gap-y-4">
      {#if usingOAuth}
        <div class="font-bold">Set Password By Email</div>
        <div>
          You use oAuth to sign in ("Sign in with Github" or similar). You can
          continue to access your account using only oAuth if you like!
        </div>
      {:else}
        <div class="font-bold">Change Password By Email</div>
      {/if}
      <div>
        The button below will send you an email at {$session?.user?.email} which
        will allow you to set your password.
      </div>
      <button
        class="btn btn-outline btn-wide {sentEmail ? 'hidden' : ''}"
        bind:this={sendBtn}
        on:click={sendForgotPassword}
      >
        Send Set Password Email
      </button>
      <div class="success alert alert-success {sentEmail ? '' : 'hidden'}">
        Sent email! Please check your inbox and use the link to set your
        password.
      </div>
    </div>
  </div>
{/if}
