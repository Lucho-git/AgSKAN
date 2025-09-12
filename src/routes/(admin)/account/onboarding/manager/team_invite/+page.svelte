<!-- src/routes/(admin)/account/onboarding/manager/team_invite/+page.svelte -->
<script lang="ts">
  import { goto } from "$app/navigation"
  import {
    ArrowRight,
    ClipboardCopy,
    Link2,
    Share2,
    Users,
    X,
    CheckCircle,
    Check,
    Cloud,
  } from "lucide-svelte"
  import { toast } from "svelte-sonner"

  // Generate a random map ID for demonstration
  const mapId = "e99d851c-e073-4458-8284-1fd5d2526ea0"
  const shareLink = `https://www.skanfarming.com.au/login?map_id=${mapId}`

  let completionStatus = null // 'loading' | 'success' | null

  // Animation timing
  let operationStartTime = 0
  const MIN_ANIMATION_TIME = 2000 // 2 seconds minimum
  const SUCCESS_DISPLAY_TIME = 2500 // 2.5 seconds for success state

  function handleCopyMapId() {
    navigator.clipboard.writeText(mapId)
    toast.success("Map ID copied to clipboard!")
  }

  function handleCopyLink() {
    navigator.clipboard.writeText(shareLink)
    toast.success("Share link copied to clipboard!")
  }

  function handleShare() {
    // Share API if available, otherwise copy link
    if (navigator.share) {
      navigator
        .share({
          title: "Join my AgSKAN Map",
          text: "Join my farm operations map on AgSKAN",
          url: shareLink,
        })
        .then(() => {
          toast.success("Successfully shared map invitation!")
        })
        .catch((error) => {
          console.log("Error sharing:", error)
          handleCopyLink()
        })
    } else {
      handleCopyLink()
    }
  }

  async function handleComplete() {
    // Record start time for minimum animation duration
    operationStartTime = Date.now()
    completionStatus = "loading"

    try {
      // Simulate any final setup operations if needed
      await new Promise((resolve) => setTimeout(resolve, 1000))

      // Calculate elapsed time and wait for minimum if needed
      const elapsedTime = Date.now() - operationStartTime
      const remainingTime = Math.max(0, MIN_ANIMATION_TIME - elapsedTime)

      if (remainingTime > 0) {
        await new Promise((resolve) => setTimeout(resolve, remainingTime))
      }

      // Show success animation
      completionStatus = "success"
      toast.success("Setup completed successfully!")

      // Navigate after success animation
      setTimeout(() => {
        goto("/account")
      }, SUCCESS_DISPLAY_TIME)
    } catch (error) {
      console.error("Error completing setup:", error)
      completionStatus = null
      toast.error("Failed to complete setup")
    }
  }
</script>

<svelte:head>
  <title>Team Invite - AgSKAN</title>
  <meta name="description" content="Invite team members to your farm map" />
</svelte:head>

<!-- Header - compact for single page view -->
<div class="mb-4 px-4 text-center md:mb-6">
  <h2 class="mb-2 text-2xl font-bold text-contrast-content md:text-3xl">
    Invite Your <span class="text-base-content">Team</span>
  </h2>
  <p class="mx-auto max-w-md text-sm text-contrast-content/60 md:text-base">
    Share your farm map with operators and team members
  </p>
</div>

<!-- Team Invite Card - compact sizing -->
<div
  class="animate-team-invite-fadeIn relative mx-auto max-w-sm overflow-hidden rounded-xl border border-base-300 bg-base-100 shadow-xl md:max-w-lg"
>
  <!-- Card header decoration -->
  <div class="h-1 w-full bg-base-content"></div>

  <div class="p-4 transition-all duration-500 ease-in-out md:p-6">
    {#if completionStatus === "success"}
      <!-- SUCCESS STATE - compact -->
      <div
        class="animate-team-invite-scaleIn flex flex-col items-center gap-3 py-4 md:gap-4 md:py-6"
      >
        <div
          class="animate-team-invite-successPulse flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20 shadow-lg shadow-green-500/10 md:h-20 md:w-20"
        >
          <div
            class="animate-team-invite-checkScale md:h-18 md:w-18 flex h-14 w-14 items-center justify-center rounded-full bg-green-500"
          >
            <Check
              size={28}
              class="animate-team-invite-checkDraw stroke-[3] text-white md:h-9 md:w-9"
            />
          </div>
        </div>
        <div class="text-center">
          <h3 class="mb-2 text-xl font-bold text-contrast-content md:text-2xl">
            Setup Complete!
          </h3>
          <p class="mb-3 px-2 text-sm text-contrast-content/60 md:text-base">
            Your AgSKAN farm management system is ready
          </p>
          <div class="space-y-2">
            <p
              class="inline-block rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1.5 text-xs text-green-400 md:text-sm"
            >
              Welcome to your dashboard
            </p>
          </div>
        </div>
        <p
          class="animate-team-invite-delayedFadeIn text-xs text-contrast-content/60 md:text-sm"
        >
          Redirecting to dashboard...
        </p>
      </div>
    {:else if completionStatus === "loading"}
      <!-- LOADING STATE - compact -->
      <div
        class="animate-team-invite-scaleIn flex flex-col items-center gap-3 py-4 md:gap-4 md:py-6"
      >
        <div
          class="relative flex h-16 w-16 items-center justify-center rounded-full bg-blue-500/20 md:h-20 md:w-20"
        >
          <div
            class="animate-team-invite-spin absolute inset-0 rounded-full border-2 border-blue-400/30 border-t-blue-400"
          ></div>
          <Cloud
            size={28}
            class="animate-team-invite-pulse text-blue-400 md:h-9 md:w-9"
          />
        </div>
        <div class="text-center">
          <p class="mb-2 text-lg font-medium text-contrast-content md:text-xl">
            Completing setup...
          </p>
          <p
            class="rounded-full bg-base-200 px-3 py-1.5 text-xs text-contrast-content/60 md:text-sm"
          >
            <span class="hidden sm:inline"
              >Finalizing your farm management system</span
            >
            <span class="sm:hidden">Finalizing setup</span>
          </p>
        </div>
      </div>
    {:else}
      <!-- FORM STATE - compact -->
      <div class="animate-team-invite-formEntry">
        <!-- Icon -->
        <div class="mb-4 flex justify-center md:mb-5">
          <div
            class="flex h-16 w-16 items-center justify-center rounded-full bg-base-content/10 transition-all duration-300 hover:scale-110 md:h-20 md:w-20"
          >
            <Users size={32} class="text-base-content md:h-10 md:w-10" />
          </div>
        </div>

        <h3
          class="mb-4 text-center text-xl font-bold text-base-content md:mb-5 md:text-2xl"
        >
          Join AgSKAN Map
        </h3>

        <!-- Map ID Section - compact -->
        <div class="mb-3 md:mb-4">
          <label
            class="mb-1.5 block text-sm font-medium text-contrast-content md:mb-2"
            >Map ID</label
          >
          <div class="flex">
            <input
              type="text"
              value={mapId}
              readonly
              class="flex-1 rounded-l-lg border border-base-300 bg-base-200 px-3 py-2 text-sm text-contrast-content focus:border-base-content/40 focus:outline-none"
            />
            <button
              on:click={handleCopyMapId}
              class="rounded-r-lg bg-base-content px-3 font-medium text-base-100 transition-colors hover:bg-base-content/90"
              disabled={completionStatus}
            >
              <ClipboardCopy size={16} />
            </button>
          </div>
          <p class="mt-1.5 text-xs text-contrast-content/60">
            <span class="hidden sm:inline"
              >Share this ID with other users to join your map</span
            >
            <span class="sm:hidden">Share this ID with team members</span>
          </p>
        </div>

        <!-- Share Link Section - compact -->
        <div class="mb-5 md:mb-6">
          <label
            class="mb-1.5 block text-sm font-medium text-contrast-content md:mb-2"
            >Share Link</label
          >
          <div class="flex">
            <input
              type="text"
              value={shareLink}
              readonly
              class="flex-1 truncate rounded-l-lg border border-base-300 bg-base-200 px-3 py-2 text-sm text-contrast-content focus:border-base-content/40 focus:outline-none"
            />
            <button
              on:click={handleCopyLink}
              class="rounded-r-lg bg-base-content px-3 font-medium text-base-100 transition-colors hover:bg-base-content/90"
              disabled={completionStatus}
            >
              <Link2 size={16} />
            </button>
          </div>
          <p class="mt-1.5 text-xs text-contrast-content/60">
            <span class="hidden sm:inline"
              >Share this link for direct access to your map</span
            >
            <span class="sm:hidden">Share this link for direct access</span>
          </p>
        </div>

        <!-- Action Buttons - compact horizontal layout for all screens -->
        <div class="flex gap-3">
          <button
            on:click={handleShare}
            disabled={completionStatus}
            class="flex flex-1 items-center justify-center gap-2 rounded-lg border border-base-300 bg-base-200 px-3 py-2.5 text-sm font-medium text-contrast-content transition-all hover:border-base-content/40 hover:bg-base-content/5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Share2 size={16} />
            <span>Share</span>
          </button>

          <button
            on:click={handleComplete}
            disabled={completionStatus}
            class="flex flex-1 transform items-center justify-center gap-2 rounded-lg bg-base-content px-3 py-2.5 text-sm font-semibold text-base-100 shadow-lg shadow-base-content/10 transition-all hover:scale-105 hover:bg-base-content/90 hover:shadow-base-content/20 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
          >
            <span class="hidden sm:inline">Complete Setup</span>
            <span class="sm:hidden">Complete</span>
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  @keyframes team-invite-fadeIn {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  .animate-team-invite-fadeIn {
    animation: team-invite-fadeIn 0.2s ease-out;
  }

  @keyframes team-invite-scaleIn {
    from {
      opacity: 0;
      transform: scale(0.9);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  .animate-team-invite-scaleIn {
    animation: team-invite-scaleIn 0.2s ease-out;
  }

  @keyframes team-invite-delayedFadeIn {
    0%,
    60% {
      opacity: 0;
      transform: translateY(10px);
    }
    100% {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .animate-team-invite-delayedFadeIn {
    animation: team-invite-delayedFadeIn 1s ease-out;
  }

  @keyframes team-invite-formEntry {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .animate-team-invite-formEntry {
    animation: team-invite-formEntry 0.3s ease-out;
  }

  @keyframes team-invite-spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  .animate-team-invite-spin {
    animation: team-invite-spin 1s linear infinite;
  }

  @keyframes team-invite-pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  .animate-team-invite-pulse {
    animation: team-invite-pulse 2s ease-in-out infinite;
  }

  /* Enhanced success animations */
  @keyframes team-invite-successPulse {
    0%,
    100% {
      transform: scale(1);
      box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.3);
    }
    50% {
      transform: scale(1.05);
      box-shadow: 0 0 0 20px rgba(34, 197, 94, 0);
    }
  }

  .animate-team-invite-successPulse {
    animation: team-invite-successPulse 2s ease-in-out infinite;
  }

  @keyframes team-invite-checkScale {
    0% {
      transform: scale(0);
    }
    50% {
      transform: scale(1.1);
    }
    100% {
      transform: scale(1);
    }
  }

  .animate-team-invite-checkScale {
    animation: team-invite-checkScale 0.6s ease-out 0.3s both;
  }

  @keyframes team-invite-checkDraw {
    0% {
      stroke-dasharray: 80;
      stroke-dashoffset: 80;
    }
    100% {
      stroke-dasharray: 80;
      stroke-dashoffset: 0;
    }
  }

  .animate-team-invite-checkDraw {
    animation: team-invite-checkDraw 0.5s ease-out 0.5s both;
  }
</style>
