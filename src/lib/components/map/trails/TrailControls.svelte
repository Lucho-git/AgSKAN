<!-- src/lib/components/map/trails/TrailControls.svelte -->
<script>
  import { createEventDispatcher } from "svelte"
  import { historicalTrailStore } from "$lib/stores/otherTrailStore"
  import { userVehicleTrailing } from "$lib/stores/vehicleStore"
  import { toast } from "svelte-sonner"

  import { commands } from "$lib/stores/commandStore"
  import { trailPausedStore } from "$lib/stores/currentTrailStore"

  import { Play, Square, Route, Pause } from "lucide-svelte"
  import MyTrails from "$lib/components/map/toolbox/MyTrails.svelte"

  const dispatch = createEventDispatcher()

  $: hasTrails = ($historicalTrailStore || []).some((t) => t.end_time)

  function toggleTrailing() {
    const wasTrailing = $userVehicleTrailing
    commands.trail.toggle()
    if (!wasTrailing) {
      toast.info("Initiating trail recording...")
      dispatch("close")
    }
  }

  function pauseTrailing() {
    commands.trail.pause()
  }

  function resumeTrailing() {
    commands.trail.resume()
  }

  function stopTrailing() {
    commands.trail.stop()
    dispatch("close")
  }
</script>

<div class="trail-controls">
  <!-- Explainer — only shown when no trails exist -->
  {#if !hasTrails}
    <div class="trail-intro">
      <div class="intro-header">
        <Route size={20} />
        <h4>Trail Recording</h4>
      </div>
      <p class="intro-text">
        Records field coverage using vehicle settings. Track paths to see your
        coverage patterns, efficiency and overlap.
      </p>
    </div>
  {/if}

  <!-- Active trail controls (pause/resume + stop) -->
  {#if $userVehicleTrailing}
    <div class="trail-active-controls">
      <button
        class="trail-control-btn pause-resume-btn"
        class:paused={$trailPausedStore}
        on:click={() =>
          $trailPausedStore ? resumeTrailing() : pauseTrailing()}
      >
        <div class="trail-icon">
          {#if $trailPausedStore}
            <Play size={20} />
          {:else}
            <Pause size={20} />
          {/if}
        </div>
        <div class="btn-content">
          <span class="btn-title">
            {$trailPausedStore ? "Resume" : "Pause"}
          </span>
          <span class="btn-subtitle">
            {$trailPausedStore ? "Continue recording" : "Temporarily pause"}
          </span>
        </div>
      </button>

      <button class="trail-control-btn stop-btn" on:click={stopTrailing}>
        <div class="trail-icon">
          <Square size={20} />
        </div>
        <div class="btn-content">
          <span class="btn-title">Stop</span>
          <span class="btn-subtitle">Save trail</span>
        </div>
      </button>
    </div>
  {/if}

  <!-- Trail list (directly inline — no sub-panel) -->
  <div class="trails-container">
    <MyTrails on:selectTrail on:replayTrail />
  </div>
</div>

<style>
  .trail-controls {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow-y: auto;
  }

  /* Introduction — only when no trails */
  .trail-intro {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    padding: 12px;
    margin: 16px 16px 0;
    border-left: 3px solid #22c55e;
    flex-shrink: 0;
  }

  .intro-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
    color: #22c55e;
  }

  .intro-header h4 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
  }

  .intro-text {
    margin: 0;
    font-size: 12px;
    line-height: 1.4;
    color: rgba(255, 255, 255, 0.7);
  }

  /* Active trail controls (pause/resume + stop) */
  .trail-active-controls {
    display: flex;
    gap: 8px;
    padding: 12px 16px;
    flex-shrink: 0;
  }

  .trail-control-btn {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px;
    border-radius: 8px;
    border: 1px solid;
    cursor: pointer;
    transition: all 0.2s ease;
    color: white;
  }

  .trail-control-btn .trail-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .pause-resume-btn {
    background: rgba(59, 130, 246, 0.1);
    border-color: rgba(59, 130, 246, 0.3);
    border-left: 3px solid #3b82f6;
  }
  .pause-resume-btn:hover {
    background: rgba(59, 130, 246, 0.2);
  }
  .pause-resume-btn .trail-icon {
    color: #3b82f6;
  }

  .pause-resume-btn.paused {
    background: rgba(245, 158, 11, 0.1);
    border-color: rgba(245, 158, 11, 0.3);
    border-left-color: #f59e0b;
  }
  .pause-resume-btn.paused:hover {
    background: rgba(245, 158, 11, 0.2);
  }
  .pause-resume-btn.paused .trail-icon {
    color: #f59e0b;
  }

  .stop-btn {
    background: rgba(239, 68, 68, 0.1);
    border-color: rgba(239, 68, 68, 0.3);
    border-left: 3px solid #ef4444;
  }
  .stop-btn:hover {
    background: rgba(239, 68, 68, 0.2);
  }
  .stop-btn .trail-icon {
    color: #ef4444;
  }

  .trail-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .btn-content {
    display: flex;
    flex-direction: column;
    text-align: left;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }

  .btn-title {
    font-size: 14px;
    font-weight: 600;
    color: white;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .btn-subtitle {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.6);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Trails container — takes all available space */
  .trails-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  @media (max-width: 768px) {
    .trail-intro {
      padding: 10px;
    }
    .intro-text {
      font-size: 11px;
    }
  }

  @media (max-width: 480px) {
    .btn-title {
      font-size: 13px;
    }
    .btn-subtitle {
      font-size: 10px;
    }
  }
</style>
