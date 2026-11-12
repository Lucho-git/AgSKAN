<script lang="ts">
  /**
   * One of the app's own top-down vehicle drawings ($lib/vehicles), placed
   * inside an SVG illustration. Must be rendered inside an <svg>.
   *
   * The vehicle art faces "up"; `heading` rotates it (0 = up, 90 = right).
   * Inside an <animateMotion rotate="auto"> group use heading 90, because
   * auto-rotation lines the +x axis up with the direction of travel.
   */
  import vehicles from "$lib/vehicles"

  type VehicleName = keyof typeof vehicles

  export let name: VehicleName
  /** Length of the vehicle's longest side, in the parent SVG's units. */
  export let size = 28
  export let color = "#2F62D6"
  export let outline = "#ffffff"
  export let wheels = "#15261C"
  export let load = "#F7DB5C"
  export let heading = 90
  /** Centre position in the parent SVG's units. */
  export let x = 0
  export let y = 0
</script>

<g
  transform="translate({x} {y}) rotate({heading}) translate({-size / 2} {-size /
    2})"
>
  <svelte:component
    this={vehicles[name]}
    size={String(size)}
    bodyColor={color}
    outlineColor={outline}
    wheelColor={wheels}
    loadColor={load}
  />
</g>
