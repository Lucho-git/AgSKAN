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

<!-- Header -->
<div class="mb-12 text-center">
  <h2 class="mb-3 text-4xl font-bold text-contrast-content">
    Invite Your <span class="text-base-content">Team</span>
  </h2>
  <p class="mx-auto max-w-md text-contrast-content/60">
    Share your farm map with operators and team members
  </p>
</div>

<!-- Team Invite Card -->
<div
  class="animate-fadeIn relative mx-auto max-w-xl overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-xl"
>
  <!-- Card header decoration -->
  <div
    class="h-1.5 w-full bg-gradient-to-r from-base-content/80 via-base-content to-base-content/80"
  ></div>

  <div class="p-8 transition-all duration-500 ease-in-out">
    {#if completionStatus === "success"}
      <!-- SUCCESS STATE -->
      <div class="animate-scaleIn flex flex-col items-center gap-6 py-8">
        <div
          class="animate-successPulse flex h-24 w-24 items-center justify-center rounded-full bg-green-500/20 shadow-lg shadow-green-500/10"
        >
          <div
            class="animate-checkScale flex h-20 w-20 items-center justify-center rounded-full bg-green-500"
          >
            <Check size={40} class="animate-checkDraw stroke-[3] text-white" />
          </div>
        </div>
        <div class="text-center">
          <h3 class="mb-2 text-2xl font-bold text-contrast-content">
            Setup Complete! 🎉
          </h3>
          <p class="mb-4 text-contrast-content/60">
            Your AgSKAN farm management system is ready
          </p>
          <div class="space-y-2">
            <p
              class="inline-block rounded-full border border-green-500/30 bg-green-500/10 px-4 py-2 text-sm text-green-400"
            >
              Welcome to your dashboard
            </p>
          </div>
        </div>
        <p class="animate-delayedFadeIn text-sm text-contrast-content/60">
          Redirecting to dashboard...
        </p>
      </div>
    {:else if completionStatus === "loading"}
      <!-- LOADING STATE -->
      <div class="animate-scaleIn flex flex-col items-center gap-6 py-8">
        <div
          class="relative flex h-24 w-24 items-center justify-center rounded-full bg-blue-500/20"
        >
          <div
            class="absolute inset-0 animate-spin rounded-full border-2 border-blue-400/30 border-t-blue-400"
          ></div>
          <Cloud size={40} class="animate-pulse text-blue-400" />
        </div>
        <div class="text-center">
          <p class="mb-2 text-xl font-medium text-contrast-content">
            Completing setup...
          </p>
          <p
            class="rounded-full bg-base-200 px-4 py-2 text-sm text-contrast-content/60"
          >
            Finalizing your farm management system
          </p>
        </div>
      </div>
    {:else}
      <!-- FORM STATE -->
      <div class="animate-formEntry">
        <!-- Icon -->
        <div class="mb-8 flex justify-center">
          <div
            class="flex h-24 w-24 items-center justify-center rounded-full bg-base-content/10 transition-all duration-300 hover:scale-110"
          >
            <Users size={48} class="text-base-content" />
          </div>
        </div>

        <h3 class="mb-8 text-center text-2xl font-bold text-base-content">
          Join AgSKAN Map
        </h3>

        <!-- Map ID Section -->
        <div class="mb-6">
          <label class="mb-2 block font-medium text-contrast-content"
            >Map ID</label
          >
          <div class="flex">
            <input
              type="text"
              value={mapId}
              readonly
              class="flex-1 rounded-l-xl border border-base-300 bg-base-200 px-4 py-3 text-contrast-content focus:border-base-content/40 focus:outline-none"
            />
            <button
              on:click={handleCopyMapId}
              class="rounded-r-xl bg-base-content px-4 font-medium text-base-100 transition-colors hover:bg-base-content/90"
              disabled={completionStatus}
            >
              <ClipboardCopy size={20} />
            </button>
          </div>
          <p class="mt-2 text-sm text-contrast-content/60">
            Share this ID with other users to join your map
          </p>
        </div>

        <!-- Share Link Section -->
        <div class="mb-10">
          <label class="mb-2 block font-medium text-contrast-content"
            >Share Link</label
          >
          <div class="flex">
            <input
              type="text"
              value={shareLink}
              readonly
              class="flex-1 truncate rounded-l-xl border border-base-300 bg-base-200 px-4 py-3 text-contrast-content focus:border-base-content/40 focus:outline-none"
            />
            <button
              on:click={handleCopyLink}
              class="rounded-r-xl bg-base-content px-4 font-medium text-base-100 transition-colors hover:bg-base-content/90"
              disabled={completionStatus}
            >
              <Link2 size={20} />
            </button>
          </div>
          <p class="mt-2 text-sm text-contrast-content/60">
            Share this link for direct access to your map
          </p>
        </div>

        <!-- Action Buttons -->
        <div class="flex gap-4">
          <button
            on:click={handleShare}
            disabled={completionStatus}
            class="flex flex-1 items-center justify-center gap-2 rounded-xl border border-base-300 bg-base-200 px-4 py-3 font-medium text-contrast-content transition-all hover:border-base-content/40 hover:bg-base-content/5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Share2 size={18} />
            <span>Share</span>
          </button>

          <button
            on:click={handleComplete}
            disabled={completionStatus}
            class="flex flex-1 transform items-center justify-center gap-2 rounded-xl bg-base-content px-4 py-3 font-semibold text-base-100 shadow-lg shadow-base-content/10 transition-all hover:scale-105 hover:bg-base-content/90 hover:shadow-base-content/20 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
          >
            <span>Complete Setup</span>
            <ArrowRight size={18} />
          </button>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  .animate-fadeIn {
    animation: fadeIn 0.2s ease-out;
  }

  @keyframes scaleIn {
    from {
      opacity: 0;
      transform: scale(0.9);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  .animate-scaleIn {
    animation: scaleIn 0.2s ease-out;
  }

  @keyframes delayedFadeIn {
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

  .animate-delayedFadeIn {
    animation: delayedFadeIn 1s ease-out;
  }

  @keyframes formEntry {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .animate-formEntry {
    animation: formEntry 0.3s ease-out;
  }

  /* Enhanced success animations */
  @keyframes successPulse {
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

  .animate-successPulse {
    animation: successPulse 2s ease-in-out infinite;
  }

  @keyframes checkScale {
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

  .animate-checkScale {
    animation: checkScale 0.6s ease-out 0.3s both;
  }

  @keyframes checkDraw {
    0% {
      stroke-dasharray: 80;
      stroke-dashoffset: 80;
    }
    100% {
      stroke-dasharray: 80;
      stroke-dashoffset: 0;
    }
  }

  .animate-checkDraw {
    animation: checkDraw 0.5s ease-out 0.5s both;
  }
</style>
