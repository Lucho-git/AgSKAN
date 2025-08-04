<script lang="ts">
  import Icon from "@iconify/svelte"
  import { onMount } from "svelte"
  import { browser } from "$app/environment"
  import { supabase } from "$lib/stores/sessionStore"
  import { toast } from "svelte-sonner"

  let isIOS = false
  let isAndroid = false
  let isMobile = false
  let qrCodeUrl = ""
  let isGeneratingLink = false

  const APP_STORE_URL = "https://apps.apple.com/app/agskan/id6746783538"
  const PLAY_STORE_URL =
    "https://play.google.com/store/apps/details?id=com.skanfarming"
  const BASE_URL = "https://www.skanfarming.com.au"

  const features = [
    "Live map overview of your farm",
    "Real-time team member tracking",
    "Track seeding and harvest work",
    "Mark rocks and features with single tap",
    "Background trailing during calls",
  ]

  onMount(() => {
    if (browser) {
      const userAgent = navigator.userAgent
      isIOS = /iPad|iPhone|iPod/.test(userAgent)
      isAndroid = /Android/.test(userAgent)
      isMobile = isIOS || isAndroid

      generateFreshQRCode()
      const interval = setInterval(generateFreshQRCode, 5 * 60 * 1000)
      return () => clearInterval(interval)
    }
  })

  async function generateFreshQRCode() {
    if (!browser) return

    isGeneratingLink = true
    try {
      const authData = await getCurrentSupabaseSession()
      if (!authData) {
        toast.warning("Please log in to generate mobile app link", {
          duration: 5000,
        })
        return
      }

      const authLink = `${BASE_URL}/app-redirect?token=${encodeURIComponent(authData.access_token)}&userId=${encodeURIComponent(authData.user.id)}&refresh_token=${encodeURIComponent(authData.refresh_token)}&source=qr`
      qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(authLink)}`
    } catch (error) {
      toast.error("Failed to generate mobile app link", { duration: 5000 })
    } finally {
      isGeneratingLink = false
    }
  }

  async function getCurrentSupabaseSession() {
    try {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession()
      if (error) throw error

      if (session?.access_token && session?.refresh_token && session?.user) {
        return {
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          user: session.user,
        }
      }
      return null
    } catch (error) {
      console.error("Error getting session:", error)
      return null
    }
  }

  async function handleMobileLinkClick(event) {
    event.preventDefault()

    try {
      const authData = await getCurrentSupabaseSession()
      if (!authData) {
        toast.error("Please log in to access the mobile app", {
          duration: 5000,
        })
        return
      }

      const mobileLink = `${BASE_URL}/app-redirect?token=${encodeURIComponent(authData.access_token)}&userId=${encodeURIComponent(authData.user.id)}&refresh_token=${encodeURIComponent(authData.refresh_token)}&source=mobile`
      window.location.href = mobileLink
    } catch (error) {
      toast.error("Failed to generate mobile app link")
    }
  }
</script>

<svelte:head>
  <title>Get AgSKAN Mobile App</title>
</svelte:head>

<div class="mx-auto max-w-4xl p-4">
  <div class="mb-8">
    <h1 class="mb-4 text-2xl font-bold text-contrast-content sm:text-3xl">
      Get the AgSKAN Mobile App
    </h1>
    <p class="text-base text-contrast-content/70 sm:text-lg">
      Track and trail your farm work with real-time visibility on your mobile
      device.
    </p>
  </div>

  <div class="grid gap-6 lg:grid-cols-2">
    {#if isMobile}
      <!-- Mobile Layout -->
      <div class="space-y-6 lg:col-span-2">
        <!-- Download Section -->
        <div class="rounded-lg bg-base-200 p-4 sm:p-6">
          <h2
            class="mb-4 text-lg font-semibold text-contrast-content sm:text-xl"
          >
            Download AgSKAN
          </h2>

          <!-- Store Buttons -->
          <div class="space-y-3">
            {#if isIOS}
              <a href={APP_STORE_URL} class="block">
                <div
                  class="flex items-center rounded-lg bg-black p-3 text-white transition-transform hover:scale-[1.02]"
                >
                  <Icon
                    icon="simple-icons:apple"
                    width="32"
                    height="32"
                    class="mr-3 flex-shrink-0"
                  />
                  <div class="min-w-0">
                    <div class="text-xs opacity-90">Download on the</div>
                    <div class="text-base font-semibold">App Store</div>
                  </div>
                </div>
              </a>
            {/if}

            {#if isAndroid}
              <a href={PLAY_STORE_URL} class="block">
                <div
                  class="flex items-center rounded-lg bg-black p-3 text-white transition-transform hover:scale-[1.02]"
                >
                  <Icon
                    icon="simple-icons:googleplay"
                    width="32"
                    height="32"
                    class="mr-3 flex-shrink-0"
                  />
                  <div class="min-w-0">
                    <div class="text-xs opacity-90">Get it on</div>
                    <div class="text-base font-semibold">Google Play</div>
                  </div>
                </div>
              </a>
            {/if}
          </div>

          <!-- Quick Open Button -->
          <div class="mt-4 text-center">
            <button
              on:click={handleMobileLinkClick}
              class="btn btn-primary btn-sm"
              disabled={isGeneratingLink}
            >
              {#if isGeneratingLink}
                <span class="loading loading-spinner loading-xs mr-2"></span>
                Generating...
              {:else}
                <Icon
                  icon="solar:login-2-bold-duotone"
                  width="16"
                  height="16"
                  class="mr-2"
                />
                Open AgSKAN
              {/if}
            </button>
            <p class="mt-2 text-xs text-contrast-content/60">
              Opens app if installed
            </p>
          </div>
        </div>

        <!-- Features -->
        <div class="rounded-lg bg-base-200 p-4 sm:p-6">
          <h3 class="mb-3 text-lg font-semibold text-contrast-content">
            Mobile Features
          </h3>
          <ul class="space-y-2">
            {#each features as feature}
              <li class="flex items-start">
                <Icon
                  icon="solar:check-circle-bold"
                  width="16"
                  height="16"
                  class="mr-2 mt-0.5 flex-shrink-0 text-success"
                />
                <span class="text-sm text-contrast-content/80">{feature}</span>
              </li>
            {/each}
          </ul>
        </div>
      </div>
    {:else}
      <!-- Desktop Layout -->
      <!-- QR Code -->
      <div class="rounded-lg bg-base-200 p-6">
        <h2
          class="mb-4 flex items-center text-xl font-semibold text-contrast-content"
        >
          <Icon
            icon="solar:qr-code-bold-duotone"
            width="24"
            height="24"
            class="mr-2"
          />
          Scan with Your Phone
        </h2>

        <div class="text-center">
          {#if qrCodeUrl && !isGeneratingLink}
            <img
              src={qrCodeUrl}
              alt="AgSKAN Mobile Link QR Code"
              class="mx-auto mb-4 rounded-lg bg-white p-3 shadow-lg"
              width="250"
              height="250"
            />
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
                <p class="mt-2 text-sm text-gray-500">
                  {isGeneratingLink
                    ? "Generating secure link..."
                    : "Generating QR code..."}
                </p>
              </div>
            </div>
          {/if}

          <div class="space-y-2">
            <p class="font-medium text-contrast-content">
              Scan to open AgSKAN & auto-login
            </p>
            <p class="text-sm text-contrast-content/60">
              Opens app or redirects to store
            </p>
          </div>

          <button
            on:click={generateFreshQRCode}
            class="btn btn-ghost btn-sm mt-2"
            disabled={isGeneratingLink}
          >
            <Icon
              icon="solar:refresh-bold-duotone"
              width="16"
              height="16"
              class="mr-1 {isGeneratingLink ? 'animate-spin' : ''}"
            />
            Refresh
          </button>

          <!-- Info Cards -->
          <div class="mt-4 space-y-3">
            <div class="rounded-lg bg-info bg-opacity-20 p-3">
              <div class="flex items-center justify-center text-sm">
                <Icon
                  icon="solar:refresh-bold-duotone"
                  width="16"
                  height="16"
                  class="mr-2 text-info"
                />
                <span class="text-info">Refreshes every 5 minutes</span>
              </div>
            </div>

            <div class="rounded-lg bg-success bg-opacity-20 p-3">
              <div class="flex items-start">
                <Icon
                  icon="solar:shield-check-bold"
                  width="16"
                  height="16"
                  class="mr-2 mt-0.5 text-success"
                />
                <div class="text-sm">
                  <p class="font-medium text-success">Smart Login</p>
                  <p class="text-contrast-content/70">
                    Auto-login with current session
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Download Links & Features -->
      <div class="rounded-lg bg-base-200 p-6">
        <h2
          class="mb-4 flex items-center text-xl font-semibold text-contrast-content"
        >
          <Icon
            icon="solar:download-bold-duotone"
            width="24"
            height="24"
            class="mr-2"
          />
          Download Links
        </h2>

        <div class="mb-6 space-y-3">
          <a
            href={APP_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            class="flex items-center rounded-lg bg-black p-3 text-white transition-transform hover:scale-105"
          >
            <Icon
              icon="simple-icons:apple"
              width="28"
              height="28"
              class="mr-3"
            />
            <div class="flex-grow">
              <div class="text-xs">Download on the</div>
              <div class="text-base font-semibold">App Store</div>
            </div>
            <Icon icon="solar:external-link-bold" width="14" height="14" />
          </a>

          <a
            href={PLAY_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            class="flex items-center rounded-lg bg-black p-3 text-white transition-transform hover:scale-105"
          >
            <Icon
              icon="simple-icons:googleplay"
              width="28"
              height="28"
              class="mr-3"
            />
            <div class="flex-grow">
              <div class="text-xs">Get it on</div>
              <div class="text-base font-semibold">Google Play</div>
            </div>
            <Icon icon="solar:external-link-bold" width="14" height="14" />
          </a>
        </div>

        <!-- Features -->
        <div>
          <h3 class="mb-3 text-lg font-semibold text-contrast-content">
            Mobile Features
          </h3>
          <ul class="space-y-2">
            {#each features as feature}
              <li class="flex items-start">
                <Icon
                  icon="solar:check-circle-bold"
                  width="16"
                  height="16"
                  class="mr-2 mt-0.5 text-success"
                />
                <span class="text-sm text-contrast-content/80">{feature}</span>
              </li>
            {/each}
          </ul>
        </div>
      </div>
    {/if}
  </div>
</div>
