<script lang="ts" context="module">
  import type { Readable } from "svelte/store"
  import type { PinLook } from "$lib/components/mapnext/pins"
  import type { LivePin, Paddock } from "./liveData"

  /** What the page shares so a place can be drawn as the thing it is. */
  export type PlaceBook = {
    paddocks: Readable<Map<string, Paddock>>
    pins: Readable<Map<string, LivePin>>
    look: Readable<(pin: LivePin) => PinLook>
  }
  export const PLACES = "mapnext-places"
</script>

<script lang="ts">
  /**
   * A place named in a message, a job or a list, as a picture of the thing
   * itself: a paddock by its own shape and colour, a pin by its own icon, a
   * drawn line or area by what was drawn. Anything else (a bare spot, or a
   * paddock or pin this screen doesn't have) gets the plain place mark.
   */
  import { getContext } from "svelte"
  import { MapPin } from "lucide-svelte"
  import PinArt from "$lib/components/mapnext/PinArt.svelte"
  import ShapeArt from "$lib/components/mapnext/ShapeArt.svelte"
  import type { LngLat } from "$lib/components/mapnext/geo"

  /** "field", "marker", "line", "area", or anything else for a bare spot. */
  export let type: string | null = null
  export let id: string | null = null
  /** The corners of a drawn line or area. */
  export let points: LngLat[] | null = null
  export let size = 22

  const book = getContext<PlaceBook | undefined>(PLACES)
  const paddocks = book?.paddocks
  const pins = book?.pins
  const look = book?.look

  $: paddock = type === "field" && id && paddocks ? $paddocks?.get(id) : null
  $: pin = type === "marker" && id && pins ? $pins?.get(id) : null
  $: drawn = points && points.length > 1 ? points : null
</script>

{#if paddock}
  <ShapeArt polygons={paddock.polygons} colour={paddock.colour} {size} />
{:else if pin && $look}
  <PinArt look={$look(pin)} {size} />
{:else if drawn && type === "area"}
  <ShapeArt polygons={[[[...drawn, drawn[0]]]]} colour="#F7DB5C" {size} />
{:else if drawn && type === "line"}
  <ShapeArt line={drawn} {size} />
{:else}
  <MapPin size={Math.round(size * 0.78)} />
{/if}
