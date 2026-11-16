<script lang="ts">
  /**
   * The pin someone has tapped, shown the way the current viewer shows it:
   * a copy of the pin springs up to 1.3 times its size (overshooting to 1.4
   * on the way) with a tight white ring on its edge and a soft white glow,
   * and eases back down when it is let go. Mounted in a Mapbox marker
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
  /* The current viewer's selection, measure for measure: a tight white ring
     that sits ON the pin's edge (no gap between them), with a soft white
     glow in two layers round it. Its numbers there are a 2.5px ring and
     5px / 10px of glow on a pin that is then scaled by 1.3; this is laid
     out at the popped size, so they are those times 1.3. */
  .ring {
    position: absolute;
    inset: 0;
    border: 3.25px solid #fff;
    border-radius: 50%;
    box-shadow:
      0 0 6.5px #fff,
      0 0 13px #f8fafc;
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
