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
  } from "lucide-svelte"
  import { toast } from "svelte-sonner"

  // Generate a random map ID for demonstration
  const mapId = "e99d851c-e073-4458-8284-1fd5d2526ea0"
  const shareLink = `https://www.skanfarming.com.au/login?map_id=${mapId}`

  let showSuccess = false

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

  function handleComplete() {
    showSuccess = true
    setTimeout(() => {
      goto("/account")
    }, 2000)
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

{#if showSuccess}
  <!-- Success Message -->
  <div
    class="animate-fadeIn relative mx-auto max-w-md overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-xl"
  >
    <!-- Card header decoration -->
    <div
      class="h-1.5 w-full bg-gradient-to-r from-base-content/80 via-base-content to-base-content/80"
    ></div>

    <div class="p-8">
      <div class="flex flex-col items-center text-center">
        <div class="mb-4 rounded-full bg-success/20 p-4 text-success">
          <CheckCircle size={32} />
        </div>
        <h3 class="mb-2 text-xl font-bold text-contrast-content">
          Setup Complete!
        </h3>
        <p class="text-sm text-contrast-content/60">
          Redirecting to your dashboard...
        </p>
      </div>
    </div>
  </div>
{:else}
  <!-- Team Invite Card -->
  <div
    class="relative mx-auto max-w-xl overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-xl"
  >
    <!-- Card header decoration -->
    <div
      class="h-1.5 w-full bg-gradient-to-r from-base-content/80 via-base-content to-base-content/80"
    ></div>

    <div class="p-8">
      <!-- Icon -->
      <div class="mb-8 flex justify-center">
        <div
          class="flex h-24 w-24 items-center justify-center rounded-full bg-base-content/10"
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
          class="flex flex-1 items-center justify-center gap-2 rounded-xl border border-base-300 bg-base-200 px-4 py-3 font-medium text-contrast-content transition-all hover:border-base-content/40 hover:bg-base-content/5"
        >
          <Share2 size={18} />
          <span>Share</span>
        </button>

        <button
          on:click={handleComplete}
          class="flex flex-1 transform items-center justify-center gap-2 rounded-xl bg-base-content px-4 py-3 font-semibold text-base-100 shadow-lg shadow-base-content/10 transition-all hover:scale-105 hover:bg-base-content/90 hover:shadow-base-content/20"
        >
          <span>Complete Setup</span>
          <ArrowRight size={18} />
        </button>
      </div>
    </div>
  </div>
{/if}

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
</style>
