<script lang="ts">
  import { onMount } from "svelte"
  import { browser } from "$app/environment"
  import { page } from "$app/stores"

  let userAgent = ""
  let isIOS = false
  let isAndroid = false

  const APP_STORE_URL = "https://apps.apple.com/app/agskan/id6746783538"
  const PLAY_STORE_URL =
    "https://play.google.com/store/apps/details?id=com.skanfarming"

  onMount(() => {
    if (browser) {
      userAgent = navigator.userAgent
      isIOS = /iPad|iPhone|iPod/.test(userAgent)
      isAndroid = /Android/.test(userAgent)

      // Get URL parameters
      const token = $page.url.searchParams.get("token")
      const userId = $page.url.searchParams.get("userId")
      const source = $page.url.searchParams.get("source")

      if (token && userId) {
        attemptAppOpen(token, userId)
      } else {
        // No auth data, just redirect to app store
        redirectToAppStore()
      }
    }
  })

  function attemptAppOpen(token, userId) {
    // Try to open the app with deep link
    const deepLink = `agskan://auth?token=${token}&userId=${userId}&autoLogin=true`

    // Create hidden iframe to attempt deep link
    const iframe = document.createElement("iframe")
    iframe.style.display = "none"
    iframe.src = deepLink
    document.body.appendChild(iframe)

    // Set a timer to redirect to app store if app doesn't open
    const timeout = setTimeout(() => {
      document.body.removeChild(iframe)
      redirectToAppStore()
    }, 2500)

    // If the page loses focus (app opened), clear the timeout
    const handleBlur = () => {
      clearTimeout(timeout)
      if (document.body.contains(iframe)) {
        document.body.removeChild(iframe)
      }
      window.removeEventListener("blur", handleBlur)
    }

    window.addEventListener("blur", handleBlur)
  }

  function redirectToAppStore() {
    if (isIOS) {
      window.location.href = APP_STORE_URL
    } else if (isAndroid) {
      window.location.href = PLAY_STORE_URL
    } else {
      // Desktop - redirect back to main site
      window.location.href = "https://skanfarming.com/account/app"
    }
  }
</script>

<svelte:head>
  <title>Opening AgSKAN...</title>
</svelte:head>

<div class="flex min-h-screen items-center justify-center">
  <div class="text-center">
    <div class="mb-4">
      <div
        class="mx-auto h-16 w-16 animate-spin rounded-full border-4 border-primary border-t-transparent"
      ></div>
    </div>
    <h1 class="mb-2 text-xl font-semibold">Opening AgSKAN...</h1>
    <p class="text-gray-600">
      If the app doesn't open automatically, you'll be redirected to download
      it.
    </p>
  </div>
</div>
