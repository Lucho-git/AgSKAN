<script lang="ts">
  import { Copy, Link2 } from "lucide-svelte"
  import { toast } from "svelte-sonner"
  import { connectedMapStore } from "$lib/stores/connectedMapStore"

  // Optionally disable the copy buttons (e.g. during a completion flow)
  export let disabled: boolean = false

  $: mapCode = $connectedMapStore?.join_code || $connectedMapStore?.id || ""
  $: shareLink = `https://www.skanfarming.com.au/login?map_code=${mapCode}`
  $: qrCodeUrl = mapCode
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(shareLink)}`
    : ""

  function copyMapCode() {
    if (!mapCode) return
    navigator.clipboard.writeText(mapCode)
    toast.success("Map code copied!")
  }

  function copyShareLink() {
    if (!mapCode) return
    navigator.clipboard.writeText(shareLink)
    toast.success("Share link copied to clipboard!")
  }
</script>

<div class="space-y-4 sm:space-y-5">
  <!-- Map Code -->
  <div>
    <label
      class="mb-1.5 block text-sm font-medium text-contrast-content md:mb-2"
      >Map Code</label
    >
    <div class="flex">
      <input
        type="text"
        value={mapCode}
        readonly
        class="flex-1 rounded-l-lg border border-base-300 bg-base-200 px-3 py-2 font-mono text-sm text-contrast-content focus:border-base-content/40 focus:outline-none"
      />
      <button
        on:click={copyMapCode}
        {disabled}
        class="rounded-r-lg bg-base-content px-3 font-medium text-base-100 transition-colors hover:bg-base-content/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Copy size={16} />
      </button>
    </div>
    <p class="mt-1.5 text-xs text-contrast-content/60">
      Share this code with team members to join your map
    </p>
  </div>

  <!-- Share Link -->
  <div>
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
        on:click={copyShareLink}
        {disabled}
        class="rounded-r-lg bg-base-content px-3 font-medium text-base-100 transition-colors hover:bg-base-content/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Link2 size={16} />
      </button>
    </div>
    <p class="mt-1.5 text-xs text-contrast-content/60">
      Share this link for direct access to your map
    </p>
  </div>

  <!-- QR Code -->
  <div class="border-t border-base-300 pt-4">
    <div class="flex flex-col items-center">
      <label class="mb-2 block text-sm font-medium text-contrast-content"
        >Scan to Join</label
      >
      <div
        class="rounded-2xl bg-gradient-to-br from-base-200 to-base-300 p-3 shadow-inner"
      >
        <div class="rounded-xl bg-white p-4 shadow-sm">
          {#if qrCodeUrl}
            <img
              src={qrCodeUrl}
              alt="QR code to join map"
              class="h-36 w-36 sm:h-44 sm:w-44"
            />
          {/if}
        </div>
      </div>
      <p class="mt-2 text-xs text-contrast-content/60">
        Point a phone camera here
      </p>
    </div>
  </div>
</div>
