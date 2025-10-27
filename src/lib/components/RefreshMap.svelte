<!-- src/lib/components/RefreshMap.svelte -->
<script>
  import { createEventDispatcher } from "svelte"
  import { RotateCcw, AlertCircle } from "lucide-svelte"

  const dispatch = createEventDispatcher()

  let isRefreshing = false

  async function handleRefresh() {
    if (isRefreshing) return

    isRefreshing = true
    dispatch("refresh")

    // Reset after a delay to show the animation
    // The actual refresh will happen in the parent component
    setTimeout(() => {
      isRefreshing = false
    }, 2000)
  }
</script>

<div class="refresh-controls">
  <div class="control-section">
    <h4 class="section-title">Refresh Map Data</h4>
    <p class="section-description">
      Reload all map data including markers, fields, trails, and vehicle
      positions from the server.
    </p>
  </div>

  <div class="control-section">
    <button
      class="refresh-button"
      class:refreshing={isRefreshing}
      on:click={handleRefresh}
      disabled={isRefreshing}
    >
      <RotateCcw size={20} class={isRefreshing ? "spinning" : ""} />
      <span>{isRefreshing ? "Refreshing..." : "Refresh Map"}</span>
    </button>
  </div>

  <div class="info-section">
    <div class="info-box">
      <AlertCircle size={16} />
      <p class="info-text">
        This will reload all data from the server. Your current map view will be
        preserved.
      </p>
    </div>
  </div>
</div>

<style>
  .refresh-controls {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .control-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .section-title {
    font-size: 16px;
    font-weight: 600;
    color: white;
    margin: 0;
  }

  .section-description {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.7);
    margin: 0;
    line-height: 1.5;
  }

  .refresh-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    width: 100%;
    padding: 14px 20px;
    background: rgba(96, 165, 250, 0.2);
    border: 1px solid rgba(96, 165, 250, 0.4);
    border-radius: 8px;
    color: #60a5fa;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .refresh-button:hover:not(:disabled) {
    background: rgba(96, 165, 250, 0.3);
    border-color: rgba(96, 165, 250, 0.6);
    transform: translateY(-1px);
  }

  .refresh-button:active:not(:disabled) {
    transform: translateY(0);
  }

  .refresh-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .refresh-button.refreshing {
    background: rgba(96, 165, 250, 0.15);
    border-color: rgba(96, 165, 250, 0.3);
  }

  .refresh-button :global(.spinning) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  .info-section {
    margin-top: 4px;
  }

  .info-box {
    display: flex;
    gap: 10px;
    padding: 12px;
    background: rgba(96, 165, 250, 0.1);
    border: 1px solid rgba(96, 165, 250, 0.2);
    border-radius: 8px;
    align-items: flex-start;
    color: rgba(96, 165, 250, 0.9);
  }

  .info-box :global(svg) {
    flex-shrink: 0;
    margin-top: 2px;
  }

  .info-text {
    font-size: 12px;
    line-height: 1.5;
    margin: 0;
    color: rgba(255, 255, 255, 0.8);
  }

  /* Mobile responsive */
  @media (max-width: 768px) {
    .refresh-controls {
      padding: 14px;
      gap: 16px;
    }

    .section-title {
      font-size: 15px;
    }

    .section-description {
      font-size: 12px;
    }

    .refresh-button {
      padding: 12px 16px;
      font-size: 13px;
    }

    .info-text {
      font-size: 11px;
    }
  }
</style>
