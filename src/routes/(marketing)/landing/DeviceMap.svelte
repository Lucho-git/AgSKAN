<script lang="ts">
  /**
   * A phone or tablet frame showing the animated FarmMap with app-style
   * chrome. Follows the shared `device` store unless `device` is passed.
   * Any other prop (scene, layers, labels, loop...) goes straight to FarmMap.
   */
  import FarmMap from "./FarmMap.svelte"
  import { device as deviceStore, type Device } from "./device"

  /** Force a device instead of following the shared switch. */
  export let device: Device | undefined = undefined
  /** Status chip: "live" (green dot) or "offline" (amber, saving locally). */
  export let status: "live" | "offline" = "live"

  $: shown = device ?? $deviceStore
</script>

<div class="device {shown}">
  <div class="screen">
    <FarmMap {...$$restProps} view={shown} />

    <div class="notch" aria-hidden="true"></div>

    <div class="status" class:offline={status === "offline"} aria-hidden="true">
      <span class="dot"></span>
      {status === "offline" ? "NO SIGNAL · SAVING" : "LIVE"}
    </div>
  </div>
</div>

<style>
  .device {
    position: relative;
    width: 100%;
    margin-inline: auto;
    background: #12201a;
    box-shadow:
      0 0 0 1px rgba(255, 255, 255, 0.08) inset,
      0 40px 70px -30px rgba(10, 25, 15, 0.55),
      0 18px 30px -18px rgba(10, 25, 15, 0.45);
  }
  .device.phone {
    max-width: 300px;
    aspect-ratio: 300 / 590;
    padding: 9px;
    border-radius: 2.6rem;
  }
  .device.tablet {
    max-width: 580px;
    aspect-ratio: 4 / 3;
    padding: 13px;
    border-radius: 1.7rem;
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
  .tablet .screen {
    border-radius: 0.95rem;
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

  /* A tablet has a camera dot on the bezel instead of a notch. */
  .tablet .notch {
    top: -9px;
    width: 5px;
    height: 5px;
    background: #2c3d34;
  }
  .tablet .status {
    top: 12px;
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

  @media (prefers-reduced-motion: reduce) {
    .status .dot {
      animation: none;
    }
  }
</style>
