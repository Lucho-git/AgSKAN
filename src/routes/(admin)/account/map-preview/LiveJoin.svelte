<script lang="ts">
  /**
   * The short hello before the map: which farm, what you're driving, then
   * the location prompt. Sits over the live map as a sheet (phone) or a side
   * card (tablet).
   *
   * Picking a machine is a framed screen: the farm in a heading that stays
   * put, the machines scrolling in the middle, and a foot that stays put
   * with the working width and Continue, so neither is ever scrolled away.
   * The location screen is one line and one button.
   */
  import { createEventDispatcher } from "svelte"
  import { fly } from "svelte/transition"
  import {
    ArrowLeft,
    ArrowRight,
    ChevronRight,
    LoaderCircle,
    LocateFixed,
    Minus,
    Plus,
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
  /** They already have a machine saved, so joining didn't ask for one. */
  export let known = false

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

  // The working width, from the foot of the machine screen.
  function nudge(by: number) {
    const next = Math.min(60, Math.max(2, Math.round(marker.swath + by)))
    if (next !== marker.swath)
      dispatch("machine", {
        type: machine.type,
        colour: marker.bodyColor,
        swath: next,
      })
  }

  const slide = (node: Element) => {
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches
    return fly(node, { y: reduced ? 0 : 18, duration: reduced ? 0 : 280 })
  }
</script>

<div class="mn-join" role="dialog" aria-modal="true" aria-label="Join the map">
  <div class="panel" class:framed={step === "you"}>
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
          <!-- ── The farm: stays put ── -->
          <header class="jhead">
            <div class="t">
              <p class="lp-eyebrow">
                Join {isOwner ? "your farm" : `${farmOwner}'s farm`}
              </p>
              <h1>{farmName}</h1>
            </div>
            {#if others.length}
              <button
                type="button"
                class="swap"
                on:click={() => (step = "farm")}
              >
                Change farm
              </button>
            {/if}
          </header>

          <!-- ── The machines: these scroll ── -->
          <div class="jbody">
            {#if guest}
              <p class="sub">
                You're a guest here: you can look around, and the crew can see
                you.
              </p>
            {:else}
              <p class="ask">What are you in today?</p>
              <MachinePicker
                compact
                width={false}
                type={marker.type}
                colour={marker.bodyColor}
                swath={marker.swath}
                on:change={(e) => dispatch("machine", e.detail)}
              />
            {/if}
          </div>

          <!-- ── Working width and Continue: stay put ── -->
          <footer class="jfoot">
            {#if !guest}
              <div class="wide">
                <span class="lp-eyebrow">Working width</span>
                <span class="stepper">
                  <button
                    type="button"
                    aria-label="Narrower"
                    disabled={marker.swath <= 2}
                    on:click={() => nudge(-1)}><Minus size={18} /></button
                  >
                  <b>{marker.swath}<small>m</small></b>
                  <button
                    type="button"
                    aria-label="Wider"
                    disabled={marker.swath >= 60}
                    on:click={() => nudge(1)}><Plus size={18} /></button
                  >
                </span>
              </div>
            {/if}
            <button
              type="button"
              class="lp-btn lp-btn-primary"
              on:click={() => (step = "locate")}
            >
              Continue
              <span class="lp-arrow"><ArrowRight size={18} /></span>
            </button>
          </footer>
        {:else if blocked}
          <h1>Location is off.</h1>
          <p class="sub">
            Tap the padlock (or “aA”) in the address bar, set Location to Allow,
            then try again.
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
              class="quiet"
              on:click={() => dispatch("look")}
            >
              Just look around
            </button>
          </div>
        {:else if failed}
          <h1>Can't find you just now.</h1>
          <p class="sub">
            {secure
              ? "Check that location is switched on, then try again."
              : "Location only works on a secure (https) address."}
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
              <button
                type="button"
                class="quiet"
                on:click={() => dispatch("look")}
              >
                Just look around
              </button>
            {:else}
              <button
                type="button"
                class="lp-btn lp-btn-primary"
                on:click={() => dispatch("look")}
              >
                Just look around
              </button>
            {/if}
          </div>
        {:else}
          <!-- (Back is also the way to another machine, or another farm.) -->
          <button
            type="button"
            class="up"
            aria-label={known ? "Change machine or farm" : "Back"}
            on:click={() => (step = "you")}
          >
            <ArrowLeft size={20} />
          </button>
          <h1>Put yourself on the map.</h1>
          <p class="sub">
            {guest
              ? `The crew on ${farmName} sees where you are.`
              : `The crew on ${farmName} sees your ${machine.label.toLowerCase()} where you are.`}
          </p>
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
              class="quiet"
              on:click={() => dispatch("look")}
            >
              Just look around
            </button>
          </div>
        {/if}
      </div>
    {/key}
  </div>
</div>

<style>
  /* ── Picking a machine: a heading, a scroll, a foot ── */
  .panel.framed {
    --jx: max(4.5vw, 1rem);
    display: flex;
    flex-direction: column;
    padding: 0;
    overflow: hidden;
  }
  .panel.framed .inner {
    display: flex;
    flex: 1;
    flex-direction: column;
    max-width: none;
    min-height: 0;
  }
  .jhead {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: 0.6rem;
    padding: 0.8rem var(--jx) 0.75rem;
    background: var(--mn-band, #15261c);
    box-shadow: inset 0 -3px 0 var(--lp-yellow, #f7db5c);
    color: var(--mn-band-text, #f4f1e6);
  }
  .jhead .t {
    flex: 1;
    min-width: 0;
  }
  .jhead .lp-eyebrow {
    overflow: hidden;
    color: var(--lp-yellow, #f7db5c);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .jhead h1 {
    margin-top: 0.1rem;
    overflow: hidden;
    font-size: clamp(1.3rem, 5.6vw, 1.7rem);
    line-height: 1.1;
    color: inherit;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .jhead .swap {
    flex-shrink: 0;
    min-height: 2.5rem;
    padding: 0 0.8rem;
    border: 1.5px solid rgba(244, 241, 230, 0.45);
    border-radius: 99px;
    font-size: 0.8rem;
    font-weight: 700;
    color: inherit;
    white-space: nowrap;
  }
  .jbody {
    flex: 1;
    min-height: 0;
    padding: 0.8rem var(--jx) 1rem;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  .jbody .ask {
    margin-bottom: 0.7rem;
    font-size: 1.05rem;
    font-weight: 800;
    line-height: 1.2;
  }
  .jbody .sub {
    margin-top: 0;
  }
  .jfoot {
    display: flex;
    flex-shrink: 0;
    align-items: flex-end;
    gap: 0.7rem;
    padding: 0.55rem var(--jx) max(0.7rem, env(safe-area-inset-bottom));
    background: var(--lp-paper-2, #efe9d6);
    box-shadow: inset 0 1px 0 var(--lp-line);
  }
  .jfoot .wide {
    display: grid;
    flex-shrink: 0;
    gap: 0.2rem;
  }
  .jfoot .lp-eyebrow {
    font-size: 0.6rem;
    white-space: nowrap;
  }
  .jfoot .lp-btn {
    flex: 1;
    min-width: 0;
    min-height: 3rem;
    padding-inline: 0.9rem;
  }
  .stepper {
    display: flex;
    align-items: center;
    gap: 0.15rem;
  }
  .stepper button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 42px;
    height: 42px;
    border-radius: 50%;
    background: var(--lp-card);
    color: var(--lp-ink);
    box-shadow: 0 0 0 1.5px var(--lp-line);
  }
  .stepper button:disabled {
    opacity: 0.4;
  }
  .stepper b {
    min-width: 3.1rem;
    font-family: var(--lp-display);
    font-size: 1.5rem;
    font-weight: 800;
    letter-spacing: -0.02em;
    line-height: 1;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .stepper small {
    margin-left: 2px;
    font-family: var(--lp-mono);
    font-size: 0.65rem;
    font-weight: 500;
    color: var(--lp-ink-faint);
  }
  @media (min-width: 860px) and (orientation: landscape) {
    .panel.framed {
      --jx: 1.3rem;
    }
  }

  /* ── The location screens: a line and a button ── */
  .up {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.6rem;
    height: 2.6rem;
    margin: -0.5rem 0 0.2rem -0.6rem;
    border-radius: 50%;
    color: var(--lp-ink-soft);
  }
  .up:hover {
    background: var(--lp-paper-2);
  }
  .up + h1 {
    margin-top: 0;
  }
  .inner > h1:first-child {
    margin-top: 0;
  }
  .actions .lp-btn {
    min-height: 3.4rem;
    font-size: 1.05rem;
  }
  .quiet {
    min-height: 2.9rem;
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--lp-ink-soft);
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  button:focus-visible {
    outline: 2px solid var(--lp-accent-text);
    outline-offset: 2px;
  }
</style>
