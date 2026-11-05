<!-- src/lib/components/general/ConnectionErrorPanel.svelte -->
<!--
  Shared "this screen didn't load" panel used by the error boundaries.

  When we know the device is offline it says so (amber, "your data is safe,
  we'll retry") and reloads the route by itself the moment the connection
  returns, instead of the generic red "Internal Error / our team is working on
  a fix" page that reads like a bug.
-->
<script lang="ts">
  import { onMount, onDestroy } from "svelte"
  import { browser } from "$app/environment"
  import { WifiOff, AlertCircle, RotateCcw, ArrowLeft } from "lucide-svelte"
  import { networkStore, refreshNetworkNow } from "$lib/stores/networkStore"

  /** Force the offline treatment even before the first probe resolves. */
  export let offlineHint = false
  export let headline = "This screen didn't load"
  export let detail = "We hit an unexpected error loading this screen."
  export let status = null
  export let secondaryHref = "/account/"
  export let secondaryLabel = "Dashboard"

  let checking = false
  let revived = false

  $: offline =
    offlineHint ||
    $networkStore.status === "offline" ||
    $networkStore.status === "degraded"

  $: shownHeadline = offline ? "Can't reach AgSKAN" : headline
  $: shownDetail = offline
    ? "You're offline, so this screen couldn't be fetched. Anything you've recorded is saved on this device — reconnect and it will load by itself."
    : detail

  async function handleRetry() {
    if (checking) return
    checking = true
    try {
      const state = await refreshNetworkNow(true)
      if (state.status === "online" || !offline) {
        // Assets are local, so a reload works offline too.
        window.location.reload()
        return
      }
    } finally {
      checking = false
    }
  }

  function handleBackOnline() {
    if (revived) return
    revived = true
    window.location.reload()
  }

  onMount(() => {
    if (!browser) return
    window.addEventListener("online", handleBackOnline)
    void refreshNetworkNow(true)
  })

  onDestroy(() => {
    if (browser) window.removeEventListener("online", handleBackOnline)
  })
</script>

<div class="flex min-h-screen items-center justify-center bg-base-100 px-4">
  <div
    class="w-full max-w-md rounded-2xl border p-8 text-center shadow-xl"
    class:border-amber-200={offline}
    class:bg-amber-50={offline}
    class:border-red-200={!offline}
    class:bg-red-50={!offline}
  >
    <div
      class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full"
      class:bg-amber-100={offline}
      class:bg-red-100={!offline}
    >
      {#if offline}
        <WifiOff class="h-8 w-8 text-amber-700" />
      {:else}
        <AlertCircle class="h-8 w-8 text-red-600" />
      {/if}
    </div>

    <h2
      class="mb-2 text-xl font-bold"
      class:text-amber-900={offline}
      class:text-red-900={!offline}
    >
      {shownHeadline}
    </h2>

    <p
      class="mb-6 text-sm"
      class:text-amber-800={offline}
      class:text-red-700={!offline}
    >
      {shownDetail}
    </p>

    <div class="flex flex-col gap-3 sm:flex-row sm:justify-center">
      <button
        class="flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        on:click={handleRetry}
        disabled={checking}
      >
        <span class:animate-spin={checking}>
          <RotateCcw class="h-4 w-4" />
        </span>
        {checking ? "Checking..." : "Try Again"}
      </button>
      <a
        href={secondaryHref}
        class="flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 font-medium text-gray-700 transition-colors hover:bg-gray-50"
      >
        <ArrowLeft class="h-4 w-4" />
        {secondaryLabel}
      </a>
    </div>

    {#if status}
      <p class="mt-5 text-xs text-contrast-content/50">Error {status}</p>
    {/if}
  </div>
</div>
