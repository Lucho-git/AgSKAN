<!-- src/lib/components/map/overlays/Portal.svelte
     Renders its slot into an arbitrary DOM node (e.g. document.body) so
     fixed-position children aren't trapped by transformed ancestors. -->
<script>
  import { onMount } from "svelte"

  export let target = null

  let el

  onMount(() => {
    if (el && target && typeof target.appendChild === "function") {
      target.appendChild(el)
    }
  })
</script>

<div bind:this={el}>
  <slot />
</div>
