<script lang="ts">
  import Icon from "@iconify/svelte"
  import { onMount } from "svelte"
  import { browser } from "$app/environment"

  let userAgent = ""
  let isIOS = false
  let isAndroid = false
  let isMobile = false
  let qrCodeUrl = ""
  let authLink = ""

  // Real AgSKAN app store URLs
  const APP_STORE_URL = "https://apps.apple.com/app/agskan/id6746783538"
  const PLAY_STORE_URL =
    "https://play.google.com/store/apps/details?id=com.skanfarming"

  onMount(() => {
    if (browser) {
      userAgent = navigator.userAgent
      isIOS = /iPad|iPhone|iPod/.test(userAgent)
      isAndroid = /Android/.test(userAgent)
      isMobile = isIOS || isAndroid

      generateFreshQRCode()
      // Refresh QR code every 5 minutes to keep JWT fresh
      const interval = setInterval(generateFreshQRCode, 5 * 60 * 1000)

      return () => clearInterval(interval)
    }
  })

  function generateFreshQRCode() {
    if (!browser) return

    const token = getAuthToken()
    const userId = getCurrentUserId()

    // Create universal link that will handle both app opening and fallback
    authLink = `https://skanfarming.com/app-redirect?token=${token}&userId=${userId}&source=qr`

    qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(authLink)}`
  }

  function getCurrentUserId() {
    // Get from your auth system/store - adjust based on your implementation
    return localStorage.getItem("userId") || "demo-user"
  }

  function getAuthToken() {
    // Get from your auth system/store - adjust based on your implementation
    return localStorage.getItem("authToken") || ""
  }

  function generateMobileLink() {
    const token = getAuthToken()
    const userId = getCurrentUserId()
    return `https://skanfarming.com/app-redirect?token=${token}&userId=${userId}&source=mobile`
  }
</script>

<svelte:head>
  <title>Get AgSKAN Mobile App</title>
</svelte:head>

<div class="mx-auto max-w-4xl">
  <div class="mb-8">
    <h1 class="mb-4 text-3xl font-bold">Get the AgSKAN Mobile App</h1>
    <p class="text-lg opacity-80">
      Track and trail your farm work with real-time visibility on your mobile
      device.
    </p>
  </div>

  <div class="grid gap-8 lg:grid-cols-2">
    <!-- Mobile Download (when viewing on mobile) -->
    {#if isMobile}
      <div class="lg:col-span-2">
        <div class="rounded-lg bg-base-200 p-6">
          <h2 class="mb-4 flex items-center text-xl font-semibold">
            <Icon
              icon="solar:download-bold-duotone"
              width="24"
              height="24"
              class="mr-2"
            />
            Download AgSKAN for {isIOS ? "iPhone/iPad" : "Android"}
          </h2>

          <div class="flex justify-center space-y-4">
            {#if isIOS}
              <a
                href={APP_STORE_URL}
                class="flex items-center rounded-lg bg-black p-6 text-white transition-transform hover:scale-105"
              >
                <Icon
                  icon="simple-icons:apple"
                  width="40"
                  height="40"
                  class="mr-4"
                />
                <div>
                  <div class="text-sm">Download on the</div>
                  <div class="text-xl font-semibold">App Store</div>
                </div>
              </a>
            {/if}

            {#if isAndroid}
              <a
                href={PLAY_STORE_URL}
                class="flex items-center rounded-lg bg-black p-6 text-white transition-transform hover:scale-105"
              >
                <Icon
                  icon="simple-icons:googleplay"
                  width="40"
                  height="40"
                  class="mr-4"
                />
                <div>
                  <div class="text-sm">Get it on</div>
                  <div class="text-xl font-semibold">Google Play</div>
                </div>
              </a>
            {/if}
          </div>

          <!-- Mobile Quick Link -->
          <div class="mt-6 text-center">
            <a href={generateMobileLink()} class="btn btn-primary btn-wide">
              <Icon
                icon="solar:login-2-bold-duotone"
                width="20"
                height="20"
                class="mr-2"
              />
              Open in AgSKAN (if installed)
            </a>
            <p class="mt-2 text-xs opacity-70">
              This will open the app if installed, or redirect to download
            </p>
          </div>
        </div>
      </div>
    {:else}
      <!-- Desktop/Tablet View with QR Code -->
      <div class="rounded-lg bg-base-200 p-6">
        <h2 class="mb-4 flex items-center text-xl font-semibold">
          <Icon
            icon="solar:qr-code-bold-duotone"
            width="24"
            height="24"
            class="mr-2"
          />
          Scan with Your Phone
        </h2>

        <div class="text-center">
          {#if qrCodeUrl}
            <div class="mb-4">
              <img
                src={qrCodeUrl}
                alt="AgSKAN Mobile Link QR Code"
                class="mx-auto rounded-lg bg-white p-3 shadow-lg"
                width="200"
                height="200"
              />
            </div>
          {:else}
            <div
              class="mx-auto mb-4 flex h-52 w-52 items-center justify-center rounded-lg bg-white"
            >
              <div class="text-center">
                <Icon
                  icon="solar:refresh-bold-duotone"
                  width="32"
                  height="32"
                  class="mx-auto animate-spin text-gray-400"
                />
                <p class="mt-2 text-sm text-gray-500">Generating QR code...</p>
              </div>
            </div>
          {/if}

          <div class="space-y-2">
            <p class="font-medium">Scan to download & auto-login</p>
            <p class="text-sm opacity-70">
              Opens AgSKAN if installed, or redirects to app store
            </p>
          </div>

          <!-- QR Code refresh indicator -->
          <div class="mt-4 rounded-lg bg-info bg-opacity-20 p-3">
            <div class="flex items-center justify-center text-sm">
              <Icon
                icon="solar:refresh-bold-duotone"
                width="16"
                height="16"
                class="mr-2 text-info"
              />
              <span class="text-info">QR code refreshes every 5 minutes</span>
            </div>
          </div>
        </div>

        <div class="mt-6 rounded-lg bg-success bg-opacity-20 p-4">
          <div class="flex items-start">
            <Icon
              icon="solar:shield-check-bold"
              width="20"
              height="20"
              class="mr-2 mt-0.5 text-success"
            />
            <div class="text-sm">
              <p class="font-medium text-success">Smart Login:</p>
              <p class="mt-1 opacity-80">
                You'll be automatically logged in using your current session.
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Download Links -->
      <div class="rounded-lg bg-base-200 p-6">
        <h2 class="mb-4 flex items-center text-xl font-semibold">
          <Icon
            icon="solar:download-bold-duotone"
            width="24"
            height="24"
            class="mr-2"
          />
          Download Links
        </h2>

        <div class="space-y-4">
          <a
            href={APP_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            class="flex items-center rounded-lg bg-black p-4 text-white transition-transform hover:scale-105"
          >
            <Icon
              icon="simple-icons:apple"
              width="32"
              height="32"
              class="mr-3"
            />
            <div class="flex-grow">
              <div class="text-sm">Download on the</div>
              <div class="text-lg font-semibold">App Store</div>
            </div>
            <Icon icon="solar:external-link-bold" width="16" height="16" />
          </a>

          <a
            href={PLAY_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            class="flex items-center rounded-lg bg-black p-4 text-white transition-transform hover:scale-105"
          >
            <Icon
              icon="simple-icons:googleplay"
              width="32"
              height="32"
              class="mr-3"
            />
            <div class="flex-grow">
              <div class="text-sm">Get it on</div>
              <div class="text-lg font-semibold">Google Play</div>
            </div>
            <Icon icon="solar:external-link-bold" width="16" height="16" />
          </a>
        </div>
      </div>
    {/if}

    <!-- Features -->
    <div class="rounded-lg bg-base-200 p-6">
      <h2 class="mb-4 text-xl font-semibold">AgSKAN Mobile Features</h2>
      <ul class="space-y-3">
        <li class="flex items-start">
          <Icon
            icon="solar:check-circle-bold"
            width="20"
            height="20"
            class="mr-2 mt-1 text-success"
          />
          <span>Live map overview of your farm</span>
        </li>
        <li class="flex items-start">
          <Icon
            icon="solar:check-circle-bold"
            width="20"
            height="20"
            class="mr-2 mt-1 text-success"
          />
          <span>Real-time team member tracking</span>
        </li>
        <li class="flex items-start">
          <Icon
            icon="solar:check-circle-bold"
            width="20"
            height="20"
            class="mr-2 mt-1 text-success"
          />
          <span>Track seeding and harvest work</span>
        </li>
        <li class="flex items-start">
          <Icon
            icon="solar:check-circle-bold"
            width="20"
            height="20"
            class="mr-2 mt-1 text-success"
          />
          <span>Mark rocks and features with single tap</span>
        </li>
        <li class="flex items-start">
          <Icon
            icon="solar:check-circle-bold"
            width="20"
            height="20"
            class="mr-2 mt-1 text-success"
          />
          <span>Background trailing during calls</span>
        </li>
      </ul>
    </div>
  </div>

  <!-- Simple Getting Started -->
  <div class="mt-8 rounded-lg bg-base-200 p-6">
    <h2 class="mb-4 text-xl font-semibold">Getting Started</h2>
    <div class="grid gap-6 md:grid-cols-2">
      <div class="text-center">
        <div
          class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-content"
        >
          1
        </div>
        <h3 class="mb-2 font-semibold">Download</h3>
        <p class="text-sm opacity-70">
          {isMobile
            ? "Tap the download button above"
            : "Scan the QR code or use direct links"}
        </p>
      </div>
      <div class="text-center">
        <div
          class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-content"
        >
          2
        </div>
        <h3 class="mb-2 font-semibold">Start Tracking</h3>
        <p class="text-sm opacity-70">
          You'll be automatically logged in and ready to track your farm
        </p>
      </div>
    </div>
  </div>
</div>
