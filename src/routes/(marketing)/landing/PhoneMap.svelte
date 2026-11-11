<script lang="ts">
  /** A phone frame showing the animated FarmMap with app-style chrome. */
  import FarmMap from "./FarmMap.svelte"

  export let boundaries = true
  export let tracking = true
  export let trails = true
  export let pins = true
  /** Status chip: "live" (green dot) or "offline" (amber, saving locally). */
  export let status: "live" | "offline" = "live"
  /** Text for the bottom card. Empty hides the card. */
  export let caption = ""
</script>

<div class="phone">
  <div class="screen">
    <FarmMap {boundaries} {tracking} {trails} {pins} />

    <div class="notch" aria-hidden="true"></div>

    <div class="status" class:offline={status === "offline"} aria-hidden="true">
      <span class="dot"></span>
      {status === "offline" ? "NO SIGNAL · SAVING" : "LIVE"}
    </div>

    {#if caption}
      <div class="sheet" aria-hidden="true">
        {#key caption}
          <span class="sheet-text">{caption}</span>
          <span class="switch"><span class="knob"></span></span>
        {/key}
      </div>
    {/if}
  </div>
</div>

<style>
  .phone {
    position: relative;
    width: 100%;
    aspect-ratio: 300 / 590;
    padding: 9px;
    border-radius: 2.6rem;
    background: #12201a;
    box-shadow:
      0 0 0 1px rgba(255, 255, 255, 0.08) inset,
      0 40px 70px -30px rgba(10, 25, 15, 0.55),
      0 18px 30px -18px rgba(10, 25, 15, 0.45);
  }
  .screen {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    border-radius: 2.05rem;
    background: #cdbd92;
    /* Safari: keep the rounded clip while children animate */
    isolation: isolate;
  }

  .notch {
    position: absolute;
    top: 9px;
    left: 50%;
    width: 26%;
    height: 7px;
    border-radius: 99px;
    background: #12201a;
    transform: translateX(-50%);
  }

  .status {
    position: absolute;
    top: 22px;
    left: 12px;
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 7px 12px 7px 10px;
    border-radius: 99px;
    background: rgba(18, 32, 26, 0.92);
    color: #f4f1e6;
    font-family: var(--lp-mono, ui-monospace, monospace);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.14em;
    transition: background-color 0.4s ease;
  }
  .status .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #39d27a;
    box-shadow: 0 0 0 0 rgba(57, 210, 122, 0.7);
    animation: blink 1.8s ease-out infinite;
  }
  .status.offline .dot {
    background: #f7b23b;
    box-shadow: none;
    animation: none;
  }
  @keyframes blink {
    0% {
      box-shadow: 0 0 0 0 rgba(57, 210, 122, 0.7);
    }
    100% {
      box-shadow: 0 0 0 7px rgba(57, 210, 122, 0);
    }
  }

  .sheet {
    position: absolute;
    right: 12px;
    bottom: 14px;
    left: 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-height: 46px;
    padding: 10px 12px 10px 14px;
    border-radius: 14px;
    background: #fbf9f2;
    box-shadow: 0 8px 20px -8px rgba(10, 25, 15, 0.45);
  }
  .sheet-text {
    color: #15261c;
    font-family: "Inter", ui-sans-serif, system-ui, sans-serif;
    font-size: 12.5px;
    font-weight: 600;
    line-height: 1.2;
    animation: card-in 0.35s ease both;
  }
  .switch {
    position: relative;
    flex-shrink: 0;
    width: 38px;
    height: 22px;
    border-radius: 99px;
    background: #15261c;
    animation: toggle-bg 0.6s ease both;
  }
  .knob {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #f7db5c;
    transform: translateX(16px);
    animation: knob 0.6s cubic-bezier(0.3, 1.4, 0.5, 1) both;
  }
  @keyframes card-in {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
  }
  @keyframes toggle-bg {
    from {
      background: #b9b4a2;
    }
  }
  @keyframes knob {
    from {
      transform: translateX(0);
      background: #fff;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .status .dot,
    .sheet-text,
    .switch,
    .knob {
      animation: none;
    }
  }
</style>
