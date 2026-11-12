<script lang="ts">
  /**
   * The pin someone has tapped, shown the way the current viewer shows it:
   * a copy of the pin springs up to 1.3 times its size inside a thin bright
   * ring, and eases back down when it is let go. Mounted in a Mapbox marker
   * over the pin's place (the pin in the layer itself is hidden meanwhile);
   * taps pass through to the map.
   */
  import { pinDataUrl } from "./pins"

  /** The pin's image key (see `pinImageKey`). */
  export let image: string
  /** Size of the pin as drawn in the layer, in pixels. */
  export let size = 37
  /** Being let go: shrink back before it is removed. */
  export let leaving = false

  // Laid out at its full popped size, so it is drawn sharp at that size
  // rather than stretched up from the smaller one.
  $: big = Math.round(size * 1.3)
  $: src = pinDataUrl(image, big * 2)
</script>

<div class="mn-picked" class:leaving style="--big: {big}px" aria-hidden="true">
  <img {src} alt="" width={big} height={big} />
  <span class="ring"></span>
</div>

<style>
  .mn-picked {
    position: relative;
    width: var(--big);
    height: var(--big);
    pointer-events: none;
    transform-origin: 50% 50%;
    animation: mn-pick-pop 0.42s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }
  .mn-picked.leaving {
    animation: mn-pick-leave 0.2s cubic-bezier(0.22, 1, 0.36, 1) both;
  }
  img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  /* Just outside the pin's own disc. */
  .ring {
    position: absolute;
    inset: 0;
    border: 3px solid #fff;
    border-radius: 50%;
    box-shadow:
      0 0 0 1.5px rgba(21, 38, 28, 0.6),
      0 0 6px 1px #fff,
      0 0 14px 3px rgba(247, 219, 92, 0.95);
  }
  /* From the size it has in the layer, past its resting size, and back. */
  @keyframes mn-pick-pop {
    0% {
      transform: scale(0.77);
    }
    55% {
      transform: scale(1.08);
    }
    100% {
      transform: scale(1);
    }
  }
  @keyframes mn-pick-leave {
    to {
      transform: scale(0.77);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .mn-picked,
    .mn-picked.leaving {
      animation: none;
    }
  }
</style>
