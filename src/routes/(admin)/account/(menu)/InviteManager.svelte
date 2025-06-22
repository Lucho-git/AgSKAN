<script>
  import {
    Copy,
    Check,
    Link,
    Share2,
    Phone,
    Mail,
    ChevronLeft,
  } from "lucide-svelte"
  import { toast } from "svelte-sonner"

  export let connectedMap
  export let goBack

  let mapIdCopied = false
  let linkCopied = false

  function copyInviteMapId() {
    if (connectedMap?.id) {
      navigator.clipboard.writeText(connectedMap.id)
      mapIdCopied = true
      setTimeout(() => (mapIdCopied = false), 2000)
      toast.success("Map ID copied to clipboard")
    }
  }

  function copyInviteLink() {
    const shareUrl = `https://www.skanfarming.com.au/login?map_id=${connectedMap.id}`
    navigator.clipboard.writeText(shareUrl)
    linkCopied = true
    setTimeout(() => (linkCopied = false), 2000)
    toast.success("Link copied to clipboard")
  }

  function shareViaSMS() {
    const shareUrl = `https://www.skanfarming.com.au/login?map_id=${connectedMap.id}`
    const messageText = `Join my SKAN farming map using this link: ${shareUrl}`
    const encodedMessage = encodeURIComponent(messageText)
    window.location.href = `sms:?&body=${encodedMessage}`
  }

  function shareViaEmail() {
    const shareUrl = `https://www.skanfarming.com.au/login?map_id=${connectedMap.id}`
    const emailSubject = "Join my SKAN farming map"
    const messageText = `Join my SKAN farming map using this link: ${shareUrl}`
    const encodedSubject = encodeURIComponent(emailSubject)
    const encodedBody = encodeURIComponent(messageText)
    window.location.href = `mailto:?subject=${encodedSubject}&body=${encodedBody}`
  }
</script>

<div class="space-y-6">
  <!-- Back Button -->
  <button
    class="flex items-center gap-2 text-contrast-content/60 transition-colors hover:text-contrast-content"
    on:click={goBack}
  >
    <ChevronLeft class="h-4 w-4" />
    <span class="text-sm">Back</span>
  </button>

  <div class="mb-6 text-center">
    <h3 class="mb-2 text-lg font-semibold text-contrast-content">
      Share Map Access
    </h3>
    <p class="text-sm text-contrast-content/60">
      Share your map with team members using the options below
    </p>
  </div>

  <!-- Map ID Section -->
  <div class="rounded-lg border border-base-300 bg-base-200 p-4">
    <h4 class="mb-2 flex items-center gap-2 font-medium text-contrast-content">
      <Copy class="h-4 w-4" />
      Map ID
    </h4>
    <div class="flex gap-2">
      <input
        type="text"
        value={connectedMap.id}
        readonly
        class="flex-1 rounded-lg border border-base-300 bg-base-100 p-2.5 font-mono text-sm text-contrast-content"
      />
      <button
        class="flex items-center gap-2 rounded-lg bg-base-content px-4 py-2.5 text-base-100 transition-colors hover:bg-base-content/90"
        on:click={copyInviteMapId}
      >
        {#if mapIdCopied}
          <Check class="h-4 w-4" />
        {:else}
          <Copy class="h-4 w-4" />
        {/if}
      </button>
    </div>
    <p class="mt-2 text-xs text-contrast-content/60">
      Share this ID with other users to join your map
    </p>
  </div>

  <!-- Share Link Section -->
  <div class="rounded-lg border border-base-300 bg-base-200 p-4">
    <h4 class="mb-2 flex items-center gap-2 font-medium text-contrast-content">
      <Link class="h-4 w-4" />
      Share Link
    </h4>
    <div class="flex gap-2">
      <input
        type="text"
        value={`https://www.skanfarming.com.au/login?map_id=${connectedMap.id}`}
        readonly
        class="flex-1 rounded-lg border border-base-300 bg-base-100 p-2.5 text-sm text-contrast-content"
      />
      <button
        class="flex items-center gap-2 rounded-lg bg-base-content px-4 py-2.5 text-base-100 transition-colors hover:bg-base-content/90"
        on:click={copyInviteLink}
      >
        {#if linkCopied}
          <Check class="h-4 w-4" />
        {:else}
          <Link class="h-4 w-4" />
        {/if}
      </button>
    </div>
    <p class="mt-2 text-xs text-contrast-content/60">
      Share this link for direct access to your map
    </p>
  </div>

  <!-- Share Options -->
  <div class="space-y-2">
    <h4 class="mb-3 flex items-center gap-2 font-medium text-contrast-content">
      <Share2 class="h-4 w-4" />
      Quick Share
    </h4>

    <button
      class="flex w-full items-center gap-3 rounded-lg bg-base-200 px-4 py-2.5 text-contrast-content transition-colors hover:bg-base-300"
      on:click={shareViaSMS}
    >
      <Phone class="h-4 w-4" />
      <div class="text-left">
        <div class="text-sm font-medium">Share via SMS</div>
        <div class="text-xs text-contrast-content/60">
          Send link through your messaging app
        </div>
      </div>
    </button>

    <button
      class="flex w-full items-center gap-3 rounded-lg bg-base-200 px-4 py-2.5 text-contrast-content transition-colors hover:bg-base-300"
      on:click={shareViaEmail}
    >
      <Mail class="h-4 w-4" />
      <div class="text-left">
        <div class="text-sm font-medium">Share via Email</div>
        <div class="text-xs text-contrast-content/60">
          Send link through your email app
        </div>
      </div>
    </button>
  </div>
</div>
