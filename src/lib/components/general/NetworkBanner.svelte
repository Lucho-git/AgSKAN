<!-- src/lib/components/general/NetworkBanner.svelte -->
<!--
  One slim strip that tells the truth about data the app couldn't get:

    1. no connection at all            -> "Offline / Can't reach AgSKAN"
    2. connected but some slice failed -> "Some data didn't load: <what> · Retry"

  Case 2 is the one that used to be invisible: Supabase resolves
  `{ data: null, error }`, so a mid-boot drop left team members without their
  vehicle icons and map totals at zero while the screen looked healthy.

  Retry re-runs the failed fetch in place (no page reload), and the connection
  probe re-runs it automatically once the device is back on.
-->
<script lang="ts">
  import { page } from "$app/stores"
  import { browser } from "$app/environment"
  import { fly } from "svelte/transition"
  import { CloudOff, RefreshCw, WifiOff, AlertTriangle } from "lucide-svelte"
  import { networkStore, refreshNetworkNow } from "$lib/stores/networkStore"
  import {
    describeFailedDomains,
    failedDomains,
    retryFailedDomains,
  } from "$lib/stores/dataStatusStore"
  import { mapChromeHiddenStore } from "$lib/stores/mapChromeStore"

  let checking = false
  let retrying = false

  $: onAccountRoute = browser && $page.url.pathname.startsWith("/account")

  // On the map the top edge belongs to the back / tools / menu buttons, so the
  // strip docks to the bottom there instead of growing over them.
  $: onMapRoute = browser && $page.url.pathname.startsWith("/account/mapviewer")

  $: status = $networkStore.status
  $: networkDown = status === "offline" || status === "degraded"
  $: failed = $failedDomains
  // While the connection is down, that is the message that matters.
  $: dataIncomplete = !networkDown && failed.length > 0

  $: visible =
    onAccountRoute && (networkDown || dataIncomplete) && !$mapChromeHiddenStore

  $: isHardOffline = status === "offline"
  $: headline = networkDown
    ? isHardOffline
      ? "Offline"
      : "Can't reach AgSKAN"
    : "Some data didn't load"

  $: detail = networkDown
    ? isHardOffline
      ? "Anything you record is saved on this device and will sync when you reconnect."
      : "The connection looks patchy — we'll keep retrying."
    : `${describeFailedDomains(failed)} didn't arrive. Retrying won't lose anything you've entered.`

  $: busy = checking || retrying

  async function handleRetry() {
    if (busy) return

    if (networkDown) {
      checking = true
      try {
        await refreshNetworkNow(true)
      } finally {
        checking = false
      }
      return
    }

    retrying = true
    try {
      await retryFailedDomains()
    } finally {
      retrying = false
    }
  }
</script>

{#if visible}
  <div
    class="network-banner"
    class:network-banner-hard={isHardOffline}
    class:network-banner-bottom={onMapRoute}
    style={onMapRoute
      ? undefined
      : "top: var(--status-bar-height, env(safe-area-inset-top, 0px));"}
    role="status"
    aria-live="polite"
    transition:fly={{ y: onMapRoute ? 24 : -24, duration: 180 }}
  >
    <span class="network-banner-icon">
      {#if isHardOffline}
        <WifiOff size={16} />
      {:else if networkDown}
        <CloudOff size={16} />
      {:else}
        <AlertTriangle size={16} />
      {/if}
    </span>
    <span class="network-banner-text">
      <strong>{headline}</strong>
      <span class="network-banner-detail">{detail}</span>
    </span>
    <button
      class="network-banner-retry"
      on:click={handleRetry}
      disabled={busy}
      title={networkDown
        ? "Check the connection again"
        : "Fetch the missing data again"}
    >
      <span class="network-banner-retry-icon" class:network-banner-spin={busy}>
        <RefreshCw size={14} />
      </span>
      {busy ? "Retrying" : "Retry"}
    </button>
  </div>
{/if}

<style>
  .network-banner {
    position: fixed;
    left: 0;
    right: 0;
    z-index: 80;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.45rem 0.75rem;
    background: #92400e;
    color: #fffbeb;
    font-size: 0.75rem;
    line-height: 1.25;
    box-shadow: 0 1px 6px rgb(0 0 0 / 0.25);
  }

  .network-banner-hard {
    background: #7f1d1d;
    color: #fef2f2;
  }

  /* Map viewer: dock as a centred pill above the bottom-left HUD instead of
     covering the top-edge buttons. */
  .network-banner-bottom {
    left: 50%;
    right: auto;
    top: auto;
    bottom: calc(1rem + env(safe-area-inset-bottom, 0px));
    max-width: min(30rem, calc(100vw - 2rem));
    transform: translateX(-50%);
    border-radius: 9999px;
    padding: 0.4rem 0.5rem 0.4rem 0.85rem;
  }

  .network-banner-icon {
    display: flex;
    flex: none;
    opacity: 0.9;
  }

  .network-banner-text {
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
    gap: 0.05rem;
  }

  .network-banner-detail {
    opacity: 0.85;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .network-banner-retry {
    display: flex;
    flex: none;
    align-items: center;
    gap: 0.3rem;
    border: 1px solid currentColor;
    border-radius: 9999px;
    padding: 0.2rem 0.55rem;
    background: transparent;
    color: inherit;
    font-size: 0.7rem;
    font-weight: 600;
    opacity: 0.9;
    cursor: pointer;
  }

  .network-banner-retry:disabled {
    opacity: 0.55;
    cursor: default;
  }

  .network-banner-retry:hover:not(:disabled) {
    opacity: 1;
    background: rgb(255 255 255 / 0.12);
  }

  .network-banner-retry-icon {
    display: flex;
  }

  @keyframes network-banner-spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  .network-banner-spin {
    animation: network-banner-spin 1s linear infinite;
  }

  @media (max-width: 420px) {
    .network-banner-detail {
      display: none;
    }
  }
</style>
