<script lang="ts">
  import Icon from "@iconify/svelte"
  import { onMount } from "svelte"
  import { browser } from "$app/environment"
  import { supabase } from "$lib/stores/sessionStore"
  import { toast } from "svelte-sonner"

  let userAgent = ""
  let isIOS = false
  let isAndroid = false
  let isMobile = false
  let qrCodeUrl = ""
  let authLink = ""
  let isGeneratingLink = false

  // Real AgSKAN app store URLs
  const APP_STORE_URL = "https://apps.apple.com/app/agskan/id6746783538"
  const PLAY_STORE_URL =
    "https://play.google.com/store/apps/details?id=com.skanfarming"

  // Your Vercel deployment URL
  const BASE_URL =
    "https://agskan-git-app-rebrand-lucho-gits-projects.vercel.app"

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

  async function generateFreshQRCode() {
    if (!browser) return

    console.log("🔄 Generating fresh QR code with current auth tokens...")
    isGeneratingLink = true

    try {
      const authData = await getCurrentSupabaseSession()

      if (!authData) {
        console.warn("⚠️ No active session found for QR generation")
        toast.warning("Please log in to generate mobile app link", {
          duration: 5000,
        })
        return
      }

      // Create universal link using your Vercel URL
      authLink = `${BASE_URL}/app-redirect?token=${encodeURIComponent(authData.access_token)}&userId=${encodeURIComponent(authData.user.id)}&refresh_token=${encodeURIComponent(authData.refresh_token)}&source=qr`

      console.log("✅ Generated universal link:", {
        userId: authData.user.id,
        hasAccessToken: !!authData.access_token,
        hasRefreshToken: !!authData.refresh_token,
        linkLength: authLink.length,
        url: authLink,
      })

      qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(authLink)}`
    } catch (error) {
      console.error("❌ Error generating QR code:", error)
      toast.error("Failed to generate mobile app link", {
        description: "Please try refreshing the page or logging in again.",
        duration: 5000,
      })
    } finally {
      isGeneratingLink = false
    }
  }

  async function getCurrentSupabaseSession() {
    try {
      console.log("📡 Getting current Supabase session...")

      const {
        data: { session },
        error,
      } = await supabase.auth.getSession()

      if (error) {
        console.error("❌ Supabase getSession error:", error)
        throw error
      }

      if (session?.access_token && session?.refresh_token && session?.user) {
        console.log("✅ Got session from Supabase client:", {
          userId: session.user.id,
          email: session.user.email,
          expiresAt: session.expires_at,
          hasAccessToken: !!session.access_token,
          hasRefreshToken: !!session.refresh_token,
        })

        return {
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          user: session.user,
          expires_at: session.expires_at,
        }
      }

      console.warn("⚠️ No valid session found")
      return null
    } catch (error) {
      console.error("💥 Error getting Supabase session:", error)
      return null
    }
  }

  async function generateMobileLink() {
    console.log("📱 Generating mobile universal link...")

    try {
      const authData = await getCurrentSupabaseSession()

      if (!authData) {
        toast.error("Please log in to access the mobile app", {
          duration: 5000,
        })
        return "#"
      }

      const mobileLink = `${BASE_URL}/app-redirect?token=${encodeURIComponent(authData.access_token)}&userId=${encodeURIComponent(authData.user.id)}&refresh_token=${encodeURIComponent(authData.refresh_token)}&source=mobile`

      console.log("📱 Generated mobile universal link:", {
        userId: authData.user.id,
        linkLength: mobileLink.length,
      })

      return mobileLink
    } catch (error) {
      console.error("❌ Error generating mobile link:", error)
      toast.error("Failed to generate mobile app link")
      return "#"
    }
  }

  async function handleMobileLinkClick(event: Event) {
    event.preventDefault()

    const link = await generateMobileLink()
    if (link !== "#") {
      console.log("🔗 Opening mobile universal link:", link)
      window.location.href = link
    }
  }

  // Debug function to show current session info
  async function debugSession() {
    console.log("🐛 Debug: Current session info")
    const authData = await getCurrentSupabaseSession()
    console.log("Session data:", authData)

    if (authData) {
      toast.success("Session found! Check console for details", {
        duration: 3000,
      })
    } else {
      toast.error("No active session found", {
        duration: 3000,
      })
    }
  }
</script>

<svelte:head>
  <title>Get AgSKAN Mobile App</title>
</svelte:head>

<div class="mx-auto max-w-4xl p-4">
  <div class="mb-8">
    <h1 class="mb-4 text-3xl font-bold">Get the AgSKAN Mobile App</h1>
    <p class="text-lg opacity-80">
      Track and trail your farm work with real-time visibility on your mobile
      device.
    </p>

    <!-- Debug button -->
    <button
      on:click={debugSession}
      class="mt-2 text-xs opacity-50 hover:opacity-100"
    >
      🐛 Debug Session
    </button>
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
            <button
              on:click={handleMobileLinkClick}
              class="btn btn-primary btn-wide"
              disabled={isGeneratingLink}
            >
              {#if isGeneratingLink}
                <span class="loading loading-spinner loading-sm mr-2"></span>
                Generating link...
              {:else}
                <Icon
                  icon="solar:login-2-bold-duotone"
                  width="20"
                  height="20"
                  class="mr-2"
                />
                Open in AgSKAN (if installed)
              {/if}
            </button>
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
          {#if qrCodeUrl && !isGeneratingLink}
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
                <p class="mt-2 text-sm text-gray-500">
                  {isGeneratingLink
                    ? "Generating secure link..."
                    : "Generating QR code..."}
                </p>
              </div>
            </div>
          {/if}

          <div class="space-y-2">
            <p class="font-medium">Scan to open AgSKAN & auto-login</p>
            <p class="text-sm opacity-70">
              Opens AgSKAN if installed, or redirects to app store
            </p>
          </div>

          <!-- Manual refresh button -->
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
            Refresh QR Code
          </button>

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
          Download Linkss
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
