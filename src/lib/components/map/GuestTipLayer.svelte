<!-- src/lib/components/map/GuestTipLayer.svelte -->
<script>
  import { guestTipStore } from "$lib/utils/guestMode"
</script>

{#if $guestTipStore}
  <div
    class="guest-mode-tip"
    style="left: {$guestTipStore.x}px; top: {$guestTipStore.y}px;"
  >
    {$guestTipStore.text}
  </div>
{/if}

<style>
  .guest-mode-tip {
    position: fixed;
    transform: translate(-50%, -100%);
    z-index: 99999;
    background: rgba(0, 0, 0, 0.88);
    color: #fde68a;
    border: 1px solid rgba(245, 158, 11, 0.45);
    padding: 6px 10px;
    border-radius: 8px;
    font-size: 12px;
    white-space: nowrap;
    pointer-events: none;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  }

  /* Global: greyed-out guest-locked controls anywhere on the map page. */
  :global(.guest-disabled) {
    opacity: 0.45;
    filter: grayscale(0.9);
    cursor: not-allowed;
  }
</style>
