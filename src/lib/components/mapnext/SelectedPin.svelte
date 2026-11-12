<script lang="ts">
  /**
   * The pin someone has tapped, lifted off the map: it springs up larger on
   * a yellow disc while rings ripple out from it. Mounted in a Mapbox marker
   * over the pin's place in the pin layer; taps pass through to the map.
   */
  import { pinDataUrl } from "./pins"

  /** The pin's image key (see `pinImageKey`). */
  export let image: string
  /** Size of the pin as drawn in the layer right now, in pixels. */
  export let size = 36

  $: src = pinDataUrl(image, 144)
</script>

{#key image}
  <div class="mn-picked" style="--size: {size}px" aria-hidden="true">
    <span class="ripple"></span>
    <span class="ripple late"></span>
    <span class="plate"></span>
    <img {src} alt="" width={size} height={size} />
  </div>
{/key}

<style>
  .mn-picked {
    position: relative;
    width: var(--size);
    height: var(--size);
    pointer-events: none;
  }
  img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    transform: scale(1.5);
    filter: drop-shadow(0 5px 6px rgba(10, 25, 15, 0.45));
    animation:
      mn-pick-pop 0.42s cubic-bezier(0.3, 1.8, 0.45, 1) both,
      mn-pick-float 2.6s ease-in-out 0.42s infinite;
  }
  .plate,
  .ripple {
    position: absolute;
    top: 50%;
    left: 50%;
    width: calc(var(--size) * 1.86);
    height: calc(var(--size) * 1.86);
    border-radius: 50%;
    transform: translate(-50%, -50%);
  }
  .plate {
    background: #f7db5c;
    box-shadow:
      0 0 0 2px #15261c,
      0 8px 18px -6px rgba(10, 25, 15, 0.7);
    animation: mn-pick-plate 0.36s cubic-bezier(0.3, 1.5, 0.5, 1) both;
  }
  .ripple {
    border: 3px solid #f7db5c;
    opacity: 0;
    animation: mn-pick-ripple 2.2s ease-out 0.2s infinite;
  }
  .ripple.late {
    animation-delay: 1.3s;
  }
  @keyframes mn-pick-pop {
    from {
      transform: scale(1);
    }
    to {
      transform: scale(1.5);
    }
  }
  @keyframes mn-pick-float {
    50% {
      transform: scale(1.42);
    }
  }
  @keyframes mn-pick-plate {
    from {
      transform: translate(-50%, -50%) scale(0.5);
      opacity: 0;
    }
  }
  @keyframes mn-pick-ripple {
    0% {
      transform: translate(-50%, -50%) scale(0.9);
      opacity: 0.85;
    }
    100% {
      transform: translate(-50%, -50%) scale(2.1);
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    img,
    .plate,
    .ripple {
      animation: none;
    }
  }
</style>
