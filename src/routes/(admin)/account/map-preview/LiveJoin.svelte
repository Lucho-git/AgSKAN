<script lang="ts">
  /**
   * The short hello before the map: which farm, what you're driving, then a
   * plain explanation of the location prompt before the browser shows its
   * own. Sits over the live map as a sheet (phone) or a side card (tablet).
   */
  import { createEventDispatcher } from "svelte"
  import { fly } from "svelte/transition"
  import {
    ArrowLeft,
    ArrowRight,
    Check,
    ChevronRight,
    LoaderCircle,
    LocateFixed,
  } from "lucide-svelte"
  import MachinePicker from "$lib/components/mapnext/MachinePicker.svelte"
  import { machineFor } from "$lib/components/mapnext/machines"
  import type { GpsState } from "./liveEngine"
  import type { FarmChoice, VehicleMarkerData } from "./liveData"

  export let farmName: string
  export let farmOwner: string
  export let isOwner = false
  /** Other farms this person can open instead. */
  export let farms: FarmChoice[] = []
  export let currentFarmId: string
  export let marker: VehicleMarkerData
  export let step: "you" | "locate" | "farm" = "you"
  export let gps: GpsState = "idle"
  /** Location only works on https (or localhost). */
  export let secure = true
  /** Guests look at the map; they don't choose a machine. */
  export let guest = false

  const dispatch = createEventDispatcher<{
    machine: { type: string; colour: string; swath: number }
    locate: void
    look: void
    farm: string
  }>()

  $: machine = machineFor(marker.type)
  $: blocked = gps === "denied"
  $: failed = gps === "unavailable"
  $: others = farms.filter((farm) => farm.id !== currentFarmId)

  const slide = (node: Element) => {
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches
    return fly(node, { y: reduced ? 0 : 18, duration: reduced ? 0 : 280 })
  }
</script>

<div class="mn-join" role="dialog" aria-modal="true" aria-label="Join the map">
  <div class="panel">
    {#key `${step}-${blocked}-${failed}`}
      <div class="inner" in:slide>
        {#if step === "farm"}
          <p class="lp-eyebrow">Your farms</p>
          <h1>Which farm?</h1>
          <div class="mn-tools block">
            {#each farms as farm (farm.id)}
              <button
                type="button"
                class="mn-tool"
                class:selected={farm.id === currentFarmId}
                on:click={() =>
                  farm.id === currentFarmId
                    ? (step = "you")
                    : dispatch("farm", farm.id)}
              >
                <span class="text">
                  <strong>{farm.name}</strong>
                  <span>
                    {farm.owner === "You"
                      ? "Your farm"
                      : `${farm.owner}'s farm`}
                    {farm.id === currentFarmId ? " · open now" : ""}
                  </span>
                </span>
                <ChevronRight size={20} />
              </button>
            {/each}
          </div>
          <button type="button" class="back" on:click={() => (step = "you")}>
            <ArrowLeft size={16} /> Back
          </button>
        {:else if step === "you"}
          <p class="lp-eyebrow">Join the map</p>
          <h1>{farmName}</h1>
          <p class="sub">
            {isOwner ? "Your farm." : `${farmOwner}'s farm.`}
            {#if guest}
              You're a guest here: you can look around, and the crew can see
              you.
            {:else}
              Pick what you're in today; the crew sees it on their maps.
            {/if}
          </p>
          {#if others.length}
            <button
              type="button"
              class="mn-text-button"
              on:click={() => (step = "farm")}
            >
              Open a different farm
            </button>
          {/if}

          {#if !guest}
            <div class="block">
              <MachinePicker
                compact
                type={marker.type}
                colour={marker.bodyColor}
                swath={marker.swath}
                on:change={(e) => dispatch("machine", e.detail)}
              />
            </div>
          {/if}

          <div class="actions">
            <button
              type="button"
              class="lp-btn lp-btn-primary"
              on:click={() => (step = "locate")}
            >
              Continue
              <span class="lp-arrow"><ArrowRight size={18} /></span>
            </button>
          </div>
        {:else if blocked}
          <p class="lp-eyebrow">Location</p>
          <h1>Location is switched off.</h1>
          <p class="sub">
            Your browser blocked it for this page, so the map can't see where
            you are. To turn it on, tap the padlock or “aA” in the address bar,
            set Location to Allow, then try again.
          </p>
          <p class="hint">
            On an iPhone it can also be off in Settings › Privacy › Location
            Services for your browser.
          </p>
          <div class="actions">
            <button
              type="button"
              class="lp-btn lp-btn-primary"
              on:click={() => dispatch("locate")}
            >
              <LocateFixed size={18} /> Try again
            </button>
            <button
              type="button"
              class="lp-btn lp-btn-ghost"
              on:click={() => dispatch("look")}
            >
              Just look around
            </button>
          </div>
        {:else if failed}
          <p class="lp-eyebrow">Location</p>
          <h1>Can't find you just now.</h1>
          <p class="sub">
            {#if secure}
              No position came back from this device. Check that location is
              switched on, or step outside for a clearer view of the sky.
            {:else}
              Browsers only share location over a secure (https) address, and
              this one isn't.
            {/if}
          </p>
          <div class="actions">
            {#if secure}
              <button
                type="button"
                class="lp-btn lp-btn-primary"
                on:click={() => dispatch("locate")}
              >
                <LocateFixed size={18} /> Try again
              </button>
            {/if}
            <button
              type="button"
              class="lp-btn {secure ? 'lp-btn-ghost' : 'lp-btn-primary'}"
              on:click={() => dispatch("look")}
            >
              Just look around
            </button>
          </div>
        {:else}
          <p class="lp-eyebrow">One permission</p>
          <h1>Put yourself on the map.</h1>
          <p class="sub">
            Your browser is about to ask for your location. Say yes and your
            {machine.label.toLowerCase()} appears on {farmName} where you are, and
            moves when you do.
          </p>
          <ul class="points">
            <li>
              <Check size={16} strokeWidth={3} /> Shared with the crew on this farm,
              and nobody else
            </li>
            <li>
              <Check size={16} strokeWidth={3} /> Used to draw you, and your trail
              once you start one
            </li>
            <li>
              <Check size={16} strokeWidth={3} /> Stops when you close the page
            </li>
          </ul>
          <div class="actions">
            <button
              type="button"
              class="lp-btn lp-btn-primary"
              disabled={gps === "asking"}
              on:click={() => dispatch("locate")}
            >
              {#if gps === "asking"}
                <span class="mn-spin"><LoaderCircle size={18} /></span> Waiting for
                your browser…
              {:else}
                <LocateFixed size={18} /> Use my location
              {/if}
            </button>
            <button
              type="button"
              class="lp-btn lp-btn-ghost"
              on:click={() => dispatch("look")}
            >
              Just look around
            </button>
          </div>
          <button type="button" class="back" on:click={() => (step = "you")}>
            <ArrowLeft size={16} /> Back
          </button>
        {/if}
      </div>
    {/key}
  </div>
</div>
