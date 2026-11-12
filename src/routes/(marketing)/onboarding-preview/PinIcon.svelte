<script lang="ts">
  /** One of the app's pin glyphs as a small standalone icon. */
  import MapPin from "../landing/MapPin.svelte"
  import type { PinKind } from "../landing/pinGlyphs"

  export let kind: PinKind
  export let size = 36
</script>

<svg width={size} height={size} viewBox="-15 -15 30 30" aria-hidden="true">
  <MapPin {kind} r={13} />
</svg>
