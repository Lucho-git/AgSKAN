<!-- $lib/components/LottieAnimation.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from "svelte"
  import lottie from "lottie-web"

  // Animation data (JSON)
  export let animationData: any

  // Configuration options
  export let width: string = "100%"
  export let height: string = "100%"
  export let loop: boolean = true
  export let autoplay: boolean = true
  export let speed: number = 1
  export let renderer: "svg" | "canvas" | "html" = "svg"
  export let className: string = ""

  // Container reference
  let container: HTMLElement

  // Animation instance
  let animation: any

  onMount(() => {
    if (container && animationData) {
      // Create the animation
      animation = lottie.loadAnimation({
        container,
        renderer,
        loop,
        autoplay,
        animationData,
      })

      // Set speed if different from default
      if (speed !== 1) {
        animation.setSpeed(speed)
      }
    }
  })

  // Clean up when component is destroyed
  onDestroy(() => {
    if (animation) {
      animation.destroy()
    }
  })
</script>

<div
  bind:this={container}
  class={className}
  style="width: {width}; height: {height};"
></div>
