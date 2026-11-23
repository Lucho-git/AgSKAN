<script lang="ts">
  /**
   * The menu for your own machine, picked on the map. It is for what you do
   * with the machine while driving: lock the map to it (north up, or
   * turning with it), put a word out to the crew, and see the trail being
   * laid. Changing the machine itself (which one, its colour, its width) is
   * a setting, and lives in the toolbox: one button here goes there.
   */
  import { createEventDispatcher } from "svelte"
  import {
    LocateFixed,
    Navigation,
    RadioTower,
    Settings2,
    X,
  } from "lucide-svelte"
  import vehicles from "$lib/vehicles"
  import { machineFor } from "$lib/components/mapnext/machines"
  import { drawColour } from "$lib/components/mapnext/palette"
  import type { FollowMode } from "./liveEngine"
  import type { VehicleMarkerData } from "./liveData"
  import TrailingNow from "./TrailingNow.svelte"

  export let marker: VehicleMarkerData
  /** How the map is following this machine now. */
  export let follow: FollowMode = "free"
  /** A word is being broadcast from this machine. */
  export let broadcasting = false
  export let guest = false
  /** The trail being laid, in figures. */
  export let trail: {
    since: number
    metres: number
    ha: number
    colour: string
    lit: boolean
  } | null = null
  export let now = Date.now()
  export let operation = ""

  const dispatch = createEventDispatcher<{
    close: void
    /** Lock the map to the machine this way (or "free" to let go). */
    follow: FollowMode
    broadcast: void
    /** Open the machine's settings in the toolbox. */
    machine: void
    /** Highlight the trail being laid, or take the highlight off. */
    light: boolean
  }>()

  $: machine = machineFor(marker.type)
</script>

<div class="mn-card mn-menu" style="--accent: {drawColour(marker.bodyColor)}">
  <div class="head">
    <span class="art">
      <svelte:component
        this={vehicles[machine.type]}
        size="44px"
        bodyColor={drawColour(marker.bodyColor)}
        outlineColor="#ffffff"
        wheelColor="#15261C"
        loadColor="#F7DB5C"
      />
    </span>
    <div class="about">
      <h2>You</h2>
      <p>{machine.label} · {marker.swath} m wide</p>
    </div>
    <button
      type="button"
      class="mn-icon-button"
      aria-label="Close"
      on:click={() => dispatch("close")}
    >
      <X size={22} />
    </button>
  </div>

  {#if trail}
    <TrailingNow
      {trail}
      {now}
      {operation}
      on:light={(e) => dispatch("light", e.detail)}
    />
  {/if}

  <div class="acts">
    <button
      type="button"
      aria-pressed={follow === "follow"}
      on:click={() =>
        dispatch("follow", follow === "follow" ? "free" : "follow")}
    >
      <LocateFixed size={20} />
      Track
    </button>
    <button
      type="button"
      aria-pressed={follow === "cab"}
      on:click={() => dispatch("follow", follow === "cab" ? "free" : "cab")}
    >
      <Navigation size={20} fill={follow === "cab" ? "currentColor" : "none"} />
      Track heading
    </button>
    {#if !guest}
      <button
        type="button"
        class:live={broadcasting}
        on:click={() => dispatch("broadcast")}
      >
        <RadioTower size={20} />
        Broadcast
      </button>
      <button type="button" on:click={() => dispatch("machine")}>
        <Settings2 size={20} />
        Change
      </button>
    {/if}
  </div>
</div>

<style>
  .acts {
    display: grid;
    grid-auto-columns: minmax(0, 1fr);
    grid-auto-flow: column;
    gap: 6px;
  }
  .acts button {
    display: grid;
    justify-items: center;
    gap: 4px;
    min-height: 60px;
    padding: 9px 4px 8px;
    border: 1.5px solid var(--lp-line);
    border-radius: 14px;
    background: var(--lp-paper);
    font-size: 0.78rem;
    font-weight: 700;
    line-height: 1.15;
    color: var(--lp-ink);
    text-align: center;
  }
  .acts button:hover {
    border-color: var(--lp-ink);
  }
  /* The lock that is on: black with yellow, as the map's own button. */
  .acts button[aria-pressed="true"] {
    border-color: #15261c;
    background: #15261c;
    color: #f7db5c;
  }
  .acts button.live {
    border-color: var(--lp-rust);
    color: var(--lp-rust);
  }
</style>
