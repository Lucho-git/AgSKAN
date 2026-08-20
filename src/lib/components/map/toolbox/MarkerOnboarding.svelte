<!--
  MarkerOnboarding.svelte
  First-run popup flow for the marker settings: the FIRST time the map loads
  (fresh account, or after the 2026-08-20 update) it shows a short intro, then
  walks the user through picking a marker style ("Use this style") and the
  default colours (OK). Completing — or dismissing — the flow persists
  marker_onboarding_done on the server so it never shows again; the flow is
  always reachable later from Profile → Marker settings.
-->
<script>
  import { Palette, X } from "lucide-svelte"
  import { userSettingsStore } from "$lib/stores/userSettingsStore"
  import { userSettingsApi } from "$lib/api/userSettingsApi"
  import MarkerStylePreviewModal from "./MarkerStylePreviewModal.svelte"
  import MarkerDefaultColorModal from "./MarkerDefaultColorModal.svelte"

  /** Whether the main map has finished loading (gate for showing the popup). */
  export let mapLoaded = false

  $: done = $userSettingsStore?.markerOnboardingDone ?? false
  // "Not now" on the intro dismisses WITHOUT marking done — it comes back on
  // the next map load until it's been dismissed 3 times (then it stops).
  $: skips = $userSettingsStore?.markerOnboardingSkips ?? 0
  // Step 0 = intro, step 1 = pick a marker style, step 2 = default colours.
  let step = 0
  let finished = false
  $: visible = mapLoaded && !done && skips < 3 && !finished

  // "Use this style" — apply the style (the map re-tints live via the store),
  // then advance to the colours step. The style modal no longer closes
  // itself; the parent decides (see MarkerStylePreviewModal.handleApplyStyle).
  async function applyStyle(value) {
    try {
      await userSettingsApi.updateMarkerStyle(value)
    } finally {
      step = 2
    }
  }

  // Any way the flow ends (OK, ✕, clicking the backdrop, "Not now") persists
  // the flag so the popup never nags again. The user can reopen the modals
  // anytime from Profile → Marker settings.
  async function finish() {
    if (finished) return
    finished = true
    try {
      await userSettingsApi.setMarkerOnboardingDone()
    } catch (e) {
      console.warn("Could not persist marker onboarding done:", e)
    }
  }

  // "Not now" / ✕ on the intro: dismiss for now, show again on the next map
  // load (up to 3 times total, then it marks done so it stops).
  async function skip() {
    if (finished) return
    finished = true
    try {
      await userSettingsApi.skipMarkerOnboarding()
    } catch (e) {
      console.warn("Could not record marker onboarding skip:", e)
    }
  }
</script>

{#if visible}
  {#if step === 0}
    <div class="mo-overlay" role="presentation">
      <div
        class="mo-card"
        role="dialog"
        aria-modal="true"
        aria-label="New marker colours and styles"
      >
        <div class="mo-head">
          <div class="mo-badge">
            <Palette size={20} />
          </div>
          <div class="mo-head-text">
            <h2 class="mo-title">New look for your markers</h2>
            <p class="mo-sub">
              We've updated markers with new colours and styles.
            </p>
          </div>
          <button
            type="button"
            class="mo-close"
            aria-label="Close"
            on:click={skip}
          >
            <X size={18} />
          </button>
        </div>
        <div class="mo-body">
          <p>
            Pick the marker style you like best, then choose the default
            colours — it only takes a few seconds.
          </p>
          <p class="mo-hint">
            You can change these any time in the toolbox under
            <b>Profile</b>.
          </p>
        </div>
        <div class="mo-actions">
          <button type="button" class="mo-skip" on:click={skip}>
            Not now
          </button>
          <button type="button" class="mo-cta" on:click={() => (step = 1)}>
            Pick a style
          </button>
        </div>
      </div>
    </div>
  {:else if step === 1}
    <MarkerStylePreviewModal onClose={finish} onApplyStyle={applyStyle} />
  {:else}
    <MarkerDefaultColorModal onClose={finish} />
  {/if}
{/if}

<style>
  .mo-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 80;
    padding: 16px;
  }

  .mo-card {
    background: rgba(2, 6, 23, 0.96);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 16px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    width: min(92vw, 420px);
    animation: moIn 0.2s ease-out;
  }

  .mo-head {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 18px 18px 0;
  }

  .mo-badge {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    border-radius: 10px;
    background: rgba(245, 158, 11, 0.16);
    border: 1px solid rgba(245, 158, 11, 0.45);
    color: #fcd34d;
    flex-shrink: 0;
  }

  .mo-head-text {
    min-width: 0;
    flex: 1;
  }

  .mo-title {
    font-size: 16px;
    font-weight: 700;
    color: #f1f5f9;
    margin: 0;
  }

  .mo-sub {
    font-size: 12px;
    color: #94a3b8;
    margin: 3px 0 0;
    line-height: 1.4;
  }

  .mo-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: transparent;
    color: #cbd5e1;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.15s ease, color 0.15s ease;
  }

  .mo-close:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #f1f5f9;
  }

  .mo-body {
    padding: 14px 18px 0;
  }

  .mo-body p {
    margin: 0;
    font-size: 13px;
    color: #cbd5e1;
    line-height: 1.55;
  }

  .mo-hint {
    margin-top: 10px !important;
    font-size: 12px !important;
    color: #94a3b8 !important;
  }

  .mo-hint b {
    color: #e2e8f0;
  }

  .mo-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    padding: 16px 18px 18px;
  }

  .mo-skip {
    border: 1px solid rgba(148, 163, 184, 0.35);
    background: transparent;
    color: #94a3b8;
    font-size: 13px;
    font-weight: 600;
    padding: 8px 16px;
    border-radius: 999px;
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease;
  }

  .mo-skip:hover {
    background: rgba(148, 163, 184, 0.12);
    color: #cbd5e1;
  }

  .mo-cta {
    border: 1px solid rgba(245, 158, 11, 0.5);
    background: rgba(245, 158, 11, 0.14);
    color: #fcd34d;
    font-size: 13px;
    font-weight: 700;
    padding: 8px 20px;
    border-radius: 999px;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease;
  }

  .mo-cta:hover {
    background: rgba(245, 158, 11, 0.26);
    border-color: rgba(245, 158, 11, 0.75);
  }

  @keyframes moIn {
    from {
      opacity: 0;
      transform: translateY(8px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
</style>
