<script lang="ts">
  import { onMount } from "svelte"
  import Icon from "@iconify/svelte"
  import { toast } from "svelte-sonner"
  import { Capacitor } from "@capacitor/core"
  import { supabase } from "$lib/supabaseClient"
  import { getNativePushState, requestNativePushPermission } from "$lib/nativePush"

  // Check if running on native platform
  const isNativePlatform = Capacitor.isNativePlatform()

  // Push state (permission + OneSignal subscription for this device)
  let pushState = {
    available: false,
    permission: false,
    canRequest: false,
    subscriptionId: null as string | null,
    token: null as string | null,
    optedIn: false,
    externalId: null as string | null,
  }
  let loadingState = true
  let requesting = false
  let sending = false

  async function refreshState() {
    pushState = await getNativePushState()
    loadingState = false
  }

  onMount(refreshState)

  $: permissionLabel = pushState.permission
    ? "Enabled"
    : pushState.canRequest
      ? "Not enabled yet"
      : "Blocked in system settings"

  $: subscriptionLabel = pushState.subscriptionId
    ? `Registered (${pushState.subscriptionId.slice(0, 8)}…)`
    : "Not registered yet"

  async function handleEnable() {
    requesting = true
    try {
      const granted = await requestNativePushPermission(true)
      if (granted) {
        toast.success("Notifications enabled", {
          description:
            "Give the device a few seconds to register, then send a test.",
        })
      } else {
        toast.error("Notifications were not enabled", {
          description: "You can allow them later in your phone's settings.",
        })
      }
      // Registration can take a moment after permission is granted.
      setTimeout(refreshState, 1500)
      await refreshState()
    } finally {
      requesting = false
    }
  }

  async function handleSendTest() {
    sending = true
    try {
      const { data, error } = await supabase.functions.invoke(
        "send-test-push",
        { body: {} },
      )
      if (error) {
        toast.error("Test push failed", {
          description: error.message || "Could not reach the push service.",
        })
        return
      }
      // OneSignal's immediate recipient count can read 0 even when the
      // message delivers (alias resolution is async). Treat an accepted send
      // as success when we know a subscription exists — locally on this
      // device, or from the server-side subscription lookup.
      const registered =
        (data?.recipients ?? 0) > 0 ||
        (data?.subscriptions ?? 0) > 0 ||
        !!pushState.subscriptionId
      if (data?.success && registered) {
        toast.success("Test notification sent", {
          description:
            "It should arrive in your notification tray — lock screen too if the app is closed.",
        })
      } else if (data?.success) {
        toast.warning("Sent, but this device hasn't registered yet", {
          description:
            "Tap “Enable notifications” above, wait a few seconds, then try again.",
        })
      } else {
        toast.error("Test push failed", {
          description: data?.error || "Unknown error",
        })
      }
      await refreshState()
    } catch (err) {
      toast.error("Test push failed", {
        description: err?.message || "Unexpected error",
      })
    } finally {
      sending = false
    }
  }
</script>

<svelte:head>
  <title>Notifications</title>
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
        icon="solar:bell-bold-duotone"
        width="18"
        height="18"
        class="text-base-content"
      />
    </div>
    Notifications
  </h2>
</div>

<!-- Content -->
<div class="space-y-6 p-6">
  <!-- Platform Information -->
  <div>
    <h3 class="mb-3 flex items-center gap-2 font-medium text-contrast-content">
      <div class="rounded-lg bg-base-content/10 p-1.5">
        <Icon
          icon="solar:smartphone-bold-duotone"
          width="16"
          height="16"
          class="text-base-content"
        />
      </div>
      Platform
    </h3>

    <div class="rounded-lg border border-base-300 bg-base-200/30 p-4">
      <div class="flex items-center gap-3">
        <div
          class="rounded-full {isNativePlatform ? 'bg-success' : 'bg-info'} p-2"
        >
          <Icon
            icon={isNativePlatform
              ? "solar:smartphone-bold"
              : "solar:global-bold"}
            width="16"
            height="16"
            class="text-white"
          />
        </div>
        <div>
          <p class="font-medium text-contrast-content">
            {isNativePlatform ? "Mobile App" : "Web Browser"}
          </p>
          <p class="text-sm text-contrast-content/60">
            {isNativePlatform
              ? `Running on ${Capacitor.getPlatform()}`
              : "Running in web browser"}
          </p>
        </div>
      </div>
    </div>
  </div>

  {#if isNativePlatform}
    <!-- Push notifications -->
    <div>
      <h3
        class="mb-3 flex items-center gap-2 font-medium text-contrast-content"
      >
        <div class="rounded-lg bg-base-content/10 p-1.5">
          <Icon
            icon="solar:bell-bold-duotone"
            width="16"
            height="16"
            class="text-base-content"
          />
        </div>
        Push Notifications
      </h3>

      <div class="space-y-3">
        <!-- Permission -->
        <div
          class="flex flex-col gap-3 rounded-lg border border-base-300 bg-base-200/30 p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div class="flex items-center gap-3">
            <div class="rounded-lg bg-base-content/10 p-2 flex-shrink-0">
              <Icon
                icon="solar:shield-check-bold-duotone"
                width="18"
                height="18"
                class="text-base-content"
              />
            </div>
            <div>
              <p class="font-medium text-contrast-content">
                Notification Permission
              </p>
              <p class="text-sm text-contrast-content/60">
                Lets the app alert you about messages and farm activity
              </p>
              <p class="text-xs text-contrast-content/40">
                Status: {loadingState ? "Checking…" : permissionLabel}
              </p>
            </div>
          </div>
          <button
            class="btn btn-outline btn-sm gap-2 w-full sm:w-auto"
            disabled={requesting || loadingState}
            on:click={handleEnable}
          >
            {#if requesting}
              <span class="loading loading-spinner loading-xs"></span>
              Enabling…
            {:else}
              <Icon
                icon="solar:bell-bold-duotone"
                width="16"
                height="16"
              />
              {pushState.permission ? "Re-check / Fix" : "Enable Notifications"}
            {/if}
          </button>
        </div>

        <!-- Device registration -->
        <div
          class="flex items-center justify-between rounded-lg border border-base-300 bg-base-200/30 p-4"
        >
          <div class="flex items-center gap-3">
            <div class="rounded-lg bg-base-content/10 p-2">
              <Icon
                icon="solar:devices-bold-duotone"
                width="18"
                height="18"
                class="text-base-content"
              />
            </div>
            <div>
              <p class="font-medium text-contrast-content">This Device</p>
              <p class="text-sm text-contrast-content/60">
                Receives pushes addressed to your account
              </p>
              <p class="text-xs text-contrast-content/40">
                {loadingState ? "Checking…" : subscriptionLabel}
              </p>
            </div>
          </div>
          {#if pushState.subscriptionId && pushState.optedIn}
            <span class="badge badge-success badge-outline text-xs"
              >Ready</span
            >
          {:else if !loadingState}
            <span class="badge badge-ghost text-xs">Waiting</span>
          {/if}
        </div>

        <!-- Linked account -->
        <div
          class="flex items-center justify-between rounded-lg border border-base-300 bg-base-200/30 p-4"
        >
          <div class="flex items-center gap-3">
            <div class="rounded-lg bg-base-content/10 p-2">
              <Icon
                icon="solar:user-check-bold-duotone"
                width="18"
                height="18"
                class="text-base-content"
              />
            </div>
            <div>
              <p class="font-medium text-contrast-content">Linked Account</p>
              <p class="text-sm text-contrast-content/60">
                The signed-in account this device is registered to
              </p>
              <p class="text-xs break-all text-contrast-content/40">
                {loadingState
                  ? "Checking…"
                  : pushState.externalId
                    ? pushState.externalId
                    : "Not linked yet"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Test notification -->
    <div>
      <h3
        class="mb-3 flex items-center gap-2 font-medium text-contrast-content"
      >
        <div class="rounded-lg bg-base-content/10 p-1.5">
          <Icon
            icon="solar:test-tube-bold-duotone"
            width="16"
            height="16"
            class="text-base-content"
          />
        </div>
        Test
      </h3>

      <div
        class="flex flex-col gap-3 rounded-lg border border-base-300 bg-base-200/30 p-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div class="flex items-center gap-3">
          <div class="rounded-lg bg-base-content/10 p-2 flex-shrink-0">
            <Icon
              icon="solar:bell-bing-bold-duotone"
              width="18"
              height="18"
              class="text-base-content"
            />
          </div>
          <div>
            <p class="font-medium text-contrast-content">
              Send a test notification
            </p>
            <p class="text-sm text-contrast-content/60">
              Delivers a push to this account — try it with the app closed to
              check background delivery.
            </p>
          </div>
        </div>
        <button
          class="btn btn-primary btn-sm gap-2 w-full sm:w-auto"
          disabled={sending || loadingState}
          on:click={handleSendTest}
        >
          {#if sending}
            <span class="loading loading-spinner loading-xs"></span>
            Sending…
          {:else}
            <Icon icon="solar:plain-2-bold-duotone" width="16" height="16" />
            Send Test
          {/if}
        </button>
      </div>
    </div>
  {:else}
    <!-- Web platform note -->
    <div>
      <h3
        class="mb-3 flex items-center gap-2 font-medium text-contrast-content"
      >
        <div class="rounded-lg bg-base-content/10 p-1.5">
          <Icon
            icon="solar:monitor-bold-duotone"
            width="16"
            height="16"
            class="text-base-content"
          />
        </div>
        Mobile Push
      </h3>

      <div class="rounded-lg border border-base-300 bg-base-200/30 p-4">
        <div class="flex items-start gap-3">
          <div class="rounded-lg bg-base-content/10 p-2 flex-shrink-0">
            <Icon
              icon="solar:smartphone-2-bold-duotone"
              width="18"
              height="18"
              class="text-base-content"
            />
          </div>
          <div>
            <p class="font-medium text-contrast-content">
              Mobile push is set up in the app
            </p>
            <p class="mt-1 text-sm text-contrast-content/60">
              Native push notifications are delivered to the AgSKAN mobile app.
              Open the app on your phone and go to
              <span class="font-medium">Settings → Notifications</span>
              to enable them and send yourself a test.
            </p>
            <p class="mt-2 text-xs text-contrast-content/40">
              Browser notifications for this web app are managed separately by
              your browser's notification permission.
            </p>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>
