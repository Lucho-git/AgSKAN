<script lang="ts">
  import { onMount } from "svelte"
  import { page } from "$app/stores"
  import { browser } from "$app/environment"
  import Icon from "@iconify/svelte"

  let status = "Detecting device..."
  let isIOS = false
  let isAndroid = false
  let isMobile = false
  let token = ""
  let userId = ""
  let refreshToken = ""
  let source = ""
  let countdown = 3

  // App store URLs
  const APP_STORE_URL = "https://apps.apple.com/app/agskan/id6746783538"
  const PLAY_STORE_URL =
    "https://play.google.com/store/apps/details?id=com.skanfarming"

  onMount(() => {
    if (browser) {
      // Get URL parameters
      token = $page.url.searchParams.get("token") || ""
      userId = $page.url.searchParams.get("userId") || ""
      refreshToken = $page.url.searchParams.get("refresh_token") || ""
      source = $page.url.searchParams.get("source") || ""

      console.log("🔗 App redirect page loaded with params:", {
        hasToken: !!token,
        tokenLength: token.length,
        userId,
        hasRefreshToken: !!refreshToken,
        refreshTokenLength: refreshToken.length,
        source,
        userAgent: navigator.userAgent,
        url: $page.url.href,
      })

      // Detect platform
      const userAgent = navigator.userAgent
      isIOS = /iPad|iPhone|iPod/.test(userAgent)
      isAndroid = /Android/.test(userAgent)
      isMobile = isIOS || isAndroid

      console.log("📱 Platform detection:", { isIOS, isAndroid, isMobile })

      if (isMobile) {
        if (token && userId && refreshToken) {
          status = "Preparing to open AgSKAN..."
          attemptAppRedirect()
        } else {
          status = "Invalid link - missing authentication data"
          console.error("❌ Missing required parameters:", {
            hasToken: !!token,
            hasUserId: !!userId,
            hasRefreshToken: !!refreshToken,
          })
        }
      } else {
        status = "Please open this link on your mobile device"
      }
    }
  })

  function attemptAppRedirect() {
    console.log("🚀 Attempting app redirect...")

    // Create the deep link URL
    const deepLinkUrl = `agskan://auth?token=${encodeURIComponent(token)}&userId=${encodeURIComponent(userId)}&refresh_token=${encodeURIComponent(refreshToken)}&source=${encodeURIComponent(source)}`

    console.log("🔗 Generated deep link:", {
      url: deepLinkUrl,
      length: deepLinkUrl.length,
    })

    status = "Opening AgSKAN app..."

    // Try to open the app immediately
    console.log("📱 Attempting to open app with deep link")
    window.location.href = deepLinkUrl

    // Start countdown and fallback to app store
    let countdownInterval = setInterval(() => {
      countdown--
      if (countdown <= 0) {
        clearInterval(countdownInterval)
        fallbackToAppStore()
      }
    }, 1000)

    // Also try after a short delay (in case the first attempt fails)
    setTimeout(() => {
      if (countdown > 0) {
        console.log("🔄 Trying deep link again after delay")
        window.location.href = deepLinkUrl
      }
    }, 500)
  }

  function fallbackToAppStore() {
    console.log("🏪 Falling back to app store")
    status = "App not installed - redirecting to store..."

    setTimeout(() => {
      if (isIOS) {
        console.log("🍎 Redirecting to App Store")
        window.location.href = APP_STORE_URL
      } else if (isAndroid) {
        console.log("🤖 Redirecting to Play Store")
        window.location.href = PLAY_STORE_URL
      }
    }, 1000)
  }

  function manualStoreRedirect() {
    if (isIOS) {
      window.location.href = APP_STORE_URL
    } else if (isAndroid) {
      window.location.href = PLAY_STORE_URL
    }
  }

  function tryAgainButton() {
    countdown = 3
    attemptAppRedirect()
  }
</script>

<svelte:head>
  <title>Opening AgSKAN App...</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</svelte:head>

<div
  class="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/10 to-secondary/10 p-4"
>
  <div
    class="w-full max-w-md rounded-2xl bg-base-100 p-8 text-center shadow-xl"
  >
    <!-- AgSKAN Logo/Icon -->
    <div class="mb-6">
      <div class="relative mx-auto mb-4 h-20 w-20">
        <div
          class="absolute inset-0 rounded-full border-4 border-primary/20"
        ></div>
        <div
          class="absolute inset-0 animate-spin rounded-full border-4 border-primary border-t-transparent"
        ></div>
        <div
          class="absolute inset-2 flex items-center justify-center rounded-full bg-primary/10"
        >
          <Icon icon="solar:tractor-bold" class="h-8 w-8 text-primary" />
        </div>
      </div>
    </div>

    <!-- Status Text -->
    <h1 class="mb-2 text-2xl font-bold text-base-content">Opening AgSKAN</h1>

    <p class="mb-6 text-base-content/70">
      {status}
    </p>

    <!-- Countdown -->
    {#if countdown > 0 && isMobile && token && userId && refreshToken}
      <div class="mb-6 rounded-lg bg-base-200 p-4">
        <div class="flex items-center justify-center font-mono text-lg">
          <Icon
            icon="solar:clock-circle-bold"
            class="mr-2 h-5 w-5 text-primary"
          />
          {countdown}s
        </div>
        <p class="mt-1 text-sm text-base-content/60">
          Attempting to open AgSKAN...
        </p>
      </div>
    {/if}

    <!-- Platform Info -->
    {#if isMobile}
      <div class="mb-6 rounded-lg bg-base-200 p-4">
        <div
          class="flex items-center justify-center text-sm text-base-content/60"
        >
          <Icon icon="solar:smartphone-bold" class="mr-2 h-4 w-4" />
          {isIOS ? "iOS Device" : "Android Device"} Detected
        </div>
      </div>
    {:else}
      <div class="mb-6 rounded-lg bg-warning/20 p-4">
        <div class="flex items-center justify-center text-sm text-warning">
          <Icon icon="solar:desktop-bold" class="mr-2 h-4 w-4" />
          Desktop detected - please use your mobile device
        </div>
      </div>
    {/if}

    <!-- Action Buttons -->
    <div class="space-y-3">
      {#if isMobile && token && userId && refreshToken}
        <button on:click={tryAgainButton} class="btn btn-primary w-full">
          <Icon icon="solar:refresh-bold" class="mr-2 h-4 w-4" />
          Try Opening App Again
        </button>

        <button on:click={manualStoreRedirect} class="btn btn-outline w-full">
          <Icon icon="solar:download-bold" class="mr-2 h-4 w-4" />
          Download AgSKAN {isIOS ? "from App Store" : "from Play Store"}
        </button>
      {:else if isMobile}
        <button
          on:click={manualStoreRedirect}
          class="btn btn-primary w-full"
          disabled={!isIOS && !isAndroid}
        >
          <Icon icon="solar:download-bold" class="mr-2 h-4 w-4" />
          Download AgSKAN
        </button>
      {:else}
        <div class="text-sm text-base-content/60">
          Please open this link on your mobile device to access AgSKAN
        </div>
      {/if}
    </div>

    <!-- Debug Info (remove in production) -->
    {#if token && userId && refreshToken}
      <details class="mt-6 text-left">
        <summary class="cursor-pointer text-xs opacity-50">Debug Info</summary>
        <div class="mt-2 rounded bg-base-200 p-2 text-xs opacity-60">
          <div>User ID: {userId.substring(0, 8)}...</div>
          <div>Token: {token.substring(0, 20)}...</div>
          <div>Refresh: {refreshToken.substring(0, 20)}...</div>
          <div>Source: {source}</div>
        </div>
      </details>
    {/if}
  </div>
</div>
