<!-- src/lib/components/map/messages/LocationPickerBanner.svelte -->
<!-- Top banner shown while the user is choosing a location on the map to attach to a message. -->
<script>
  import { MapPin, X, ChevronRight } from "lucide-svelte"
  import {
    locationPickStore,
    pickedLocationStore,
    cancelLocationPick,
    finishLocationPickReview,
    startLocationPick,
  } from "$lib/stores/locationPickStore"

  $: capturedLabel = $pickedLocationStore?.label || "Dropped pin"
</script>

{#if $locationPickStore.active}
  <div class="pick-banner">
    <span class="pick-banner-icon">
      <MapPin size={16} />
    </span>
    <p>Tap the map to attach a location — a marker, a field, or any spot.</p>
    <button on:click={cancelLocationPick} aria-label="Cancel" title="Cancel">
      <X size={16} />
    </button>
  </div>
{:else if $locationPickStore.captured}
  <div class="pick-banner captured">
    <span class="pick-banner-icon picked">
      <MapPin size={16} />
    </span>
    <p class="pick-captured-text">
      <strong>{capturedLabel}</strong> selected — check it on the map, then
      continue.
    </p>
    <button
      class="pick-change"
      on:click={startLocationPick}
      aria-label="Change location"
      title="Pick a different location"
    >
      Change
    </button>
    <button
      class="pick-confirm"
      on:click={finishLocationPickReview}
      aria-label="Back to message"
      title="Attach this location"
    >
      Back to message
      <ChevronRight size={14} />
    </button>
  </div>
{/if}

<style>
  .pick-banner {
    position: fixed;
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 120;
    display: flex;
    width: min(440px, calc(100vw - 24px));
    align-items: center;
    gap: 10px;
    border-radius: 12px;
    border: 1px solid rgba(56, 189, 248, 0.4);
    background: rgba(10, 10, 12, 0.94);
    padding: 10px 12px;
    color: #fff;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(10px);
    animation: pick-in 0.18s ease-out;
  }

  @keyframes pick-in {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(-8px);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  }

  .pick-banner p {
    flex: 1;
    font-size: 12px;
    line-height: 1.35;
    color: rgba(255, 255, 255, 0.85);
  }

  .pick-banner-icon {
    display: flex;
    height: 28px;
    width: 28px;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    border-radius: 9999px;
    background: rgba(56, 189, 248, 0.18);
    color: #7dd3fc;
  }

  .pick-banner button {
    display: flex;
    height: 34px;
    width: 34px;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
    color: rgba(255, 255, 255, 0.65);
  }

  .pick-banner button:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }

  /* ── Captured (review) state ── */
  .pick-banner.captured {
    flex-wrap: wrap;
    border-color: rgba(74, 222, 128, 0.45);
  }

  .pick-banner.captured .pick-captured-text {
    flex: 1 1 160px;
  }

  .pick-banner-icon.picked {
    background: rgba(74, 222, 128, 0.18);
    color: #86efac;
  }

  .pick-captured-text strong {
    color: #fff;
  }

  .pick-banner .pick-change {
    width: auto;
    height: 34px;
    padding: 0 10px;
    font-size: 12px;
    font-weight: 600;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    color: rgba(255, 255, 255, 0.75);
  }

  .pick-banner .pick-confirm {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    width: auto;
    height: 34px;
    padding: 0 12px;
    font-size: 12px;
    font-weight: 700;
    border-radius: 10px;
    background: rgba(56, 189, 248, 0.22);
    border: 1px solid rgba(56, 189, 248, 0.45);
    color: #bae6fd;
  }

  .pick-banner .pick-confirm:hover {
    background: rgba(56, 189, 248, 0.34);
    color: #fff;
  }
</style>
