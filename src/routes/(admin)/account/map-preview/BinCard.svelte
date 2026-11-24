<script lang="ts">
  /**
   * A grain bin opened from its button on the map (or from the Pins tool),
   * without going to it: the same Fill and Settings a bin's own menu has,
   * as a card. Find takes the map to the bin, where its menu opens beside
   * it (and it can be moved).
   */
  import { createEventDispatcher } from "svelte"
  import { LocateFixed, X } from "lucide-svelte"
  import PinArt from "$lib/components/mapnext/PinArt.svelte"
  import { grainBinName } from "$lib/components/map/markers/markerPalette"
  import type { PinLook } from "$lib/components/mapnext/pins"
  import BinBody from "./BinBody.svelte"
  import type { LivePin, PinPatch } from "./liveData"

  export let pin: LivePin
  export let look: PinLook
  export let guest = false
  /** What the farm's other bins store. */
  export let grains: string[] = []

  const dispatch = createEventDispatcher<{
    close: void
    /** Go to it on the map. */
    find: void
    change: PinPatch
    remove: void
  }>()
</script>

<div class="mn-card mn-menu mn-bin">
  <div class="head">
    <span class="art"><PinArt {look} size={44} /></span>
    <div class="about">
      <h2>{pin.note || grainBinName(pin.iconClass)}</h2>
      <p>
        {pin.grainType.trim()
          ? `Storing ${pin.grainType.trim()}`
          : "No contents set"}
      </p>
    </div>
    <button
      type="button"
      class="mn-icon-button"
      aria-label="Find it on the map"
      title="Find it on the map"
      on:click={() => dispatch("find")}
    >
      <LocateFixed size={20} />
    </button>
    <button
      type="button"
      class="mn-icon-button"
      aria-label="Close"
      on:click={() => dispatch("close")}
    >
      <X size={22} />
    </button>
  </div>
  <BinBody
    {pin}
    {guest}
    {grains}
    on:change
    on:remove={() => dispatch("remove")}
  />
</div>

<style>
  .mn-bin {
    display: grid;
    gap: 10px;
    max-width: 24rem;
  }
  /* (The card's own padding, for the settings' foot to reach its edges.) */
  .mn-bin :global(.bin) {
    --bin-pad: 14px;
  }
  .mn-bin .head {
    gap: 6px;
  }
  .mn-bin .head .art {
    width: 46px;
    height: 46px;
    margin-right: 4px;
    background: none;
  }
  .mn-bin .head .mn-icon-button {
    width: 38px;
    height: 38px;
  }
</style>
