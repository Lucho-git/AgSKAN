<script lang="ts">
  /**
   * The short hello before the map: who you are and what you're in, then a
   * plain explanation of the location prompt before the browser shows its
   * own. Sits over the live map as a sheet (phone) or a side card (tablet).
   */
  import { createEventDispatcher } from "svelte"
  import { fly } from "svelte/transition"
  import {
    ArrowLeft,
    ArrowRight,
    Check,
    LoaderCircle,
    LocateFixed,
  } from "lucide-svelte"
  import vehicles from "$lib/vehicles"
  import { VEHICLE_PALETTE } from "$lib/components/mapnext/palette"
  import { MACHINES, MACHINE_SPECS, machineById } from "./farm"
  import type { GpsState, Me } from "./engine"

  export let me: Me
  export let step: "you" | "locate" = "you"
  export let gps: GpsState = "idle"
  /** Changing machine from the map: skip the location step afterwards. */
  export let returning = false
  /** Location only works on https (or localhost). */
  export let secure = true

  const dispatch = createEventDispatcher<{
    change: Me
    done: void
    locate: void
    drive: void
  }>()

  $: machine = machineById(me.machine)
  $: spec = MACHINE_SPECS[me.machine]
  $: blocked = gps === "denied"
  $: failed = gps === "unavailable"

  const update = (patch: Partial<Me>) => dispatch("change", { ...me, ...patch })

  function next() {
    if (returning) dispatch("done")
    else step = "locate"
  }

  const slide = (node: Element) => {
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches
    return fly(node, { y: reduced ? 0 : 18, duration: reduced ? 0 : 280 })
  }
</script>

<div class="mv-join" role="dialog" aria-modal="true" aria-label="Join the map">
  <div class="panel">
    {#key `${step}-${blocked}-${failed}`}
      <div class="inner" in:slide>
        {#if step === "you"}
          <p class="lp-eyebrow">
            {returning ? "Your machine" : "Join the map"}
          </p>
          <h1>
            {returning ? "What are you in now?" : "Who's joining, and in what?"}
          </h1>

          <label class="field">
            <span>Your name <em>optional</em></span>
            <input
              type="text"
              value={me.name}
              placeholder="What the crew calls you"
              autocomplete="given-name"
              maxlength="24"
              on:input={(e) => update({ name: e.currentTarget.value })}
              on:keydown={(e) => e.key === "Enter" && next()}
            />
          </label>

          <div class="machines">
            {#each MACHINES as option}
              <button
                type="button"
                class="machine"
                class:selected={me.machine === option.id}
                aria-pressed={me.machine === option.id}
                on:click={() => update({ machine: option.id })}
              >
                <span class="art">
                  <svelte:component
                    this={vehicles[option.name]}
                    size="50px"
                    bodyColor={me.machine === option.id ? me.colour : "#9AA39B"}
                    outlineColor="#ffffff"
                    wheelColor="#15261C"
                    loadColor="#F7DB5C"
                  />
                </span>
                {option.label}
              </button>
            {/each}
          </div>

          <div class="colours">
            <span class="lp-eyebrow">Colour</span>
            <div class="swatches">
              {#each VEHICLE_PALETTE as option}
                <button
                  type="button"
                  class="swatch"
                  class:selected={me.colour === option.value}
                  style="--swatch: {option.value}"
                  aria-label={option.label}
                  aria-pressed={me.colour === option.value}
                  on:click={() => update({ colour: option.value })}
                ></button>
              {/each}
            </div>
          </div>

          <p class="lesson">
            {#if spec.swath > 0}
              A {machine.label.toLowerCase()} paints a {spec.swath} m trail in your
              colour as it works.
            {:else}
              A {machine.label.toLowerCase()} shows up live but leaves no trail.
            {/if}
          </p>

          <div class="actions">
            <button type="button" class="lp-btn lp-btn-primary" on:click={next}>
              {returning ? "Back to the map" : "Continue"}
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
          <div class="actions stacked">
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
              on:click={() => dispatch("drive")}
            >
              Take an example drive
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
          <div class="actions stacked">
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
              on:click={() => dispatch("drive")}
            >
              Take an example drive
            </button>
          </div>
        {:else}
          <p class="lp-eyebrow">One permission</p>
          <h1>Put yourself on the map.</h1>
          <p class="sub">
            Your browser is about to ask for your location. Say yes and your
            {machine.label.toLowerCase()} appears where you're standing, and moves
            when you do.
          </p>
          <ul class="points">
            <li>
              <Check size={16} strokeWidth={3} /> Only used to draw you here
            </li>
            <li>
              <Check size={16} strokeWidth={3} /> Stays on this device: this prototype
              sends nothing anywhere
            </li>
            <li>
              <Check size={16} strokeWidth={3} /> Stops when you close the page
            </li>
          </ul>
          <div class="actions stacked">
            <button
              type="button"
              class="lp-btn lp-btn-primary"
              disabled={gps === "asking"}
              on:click={() => dispatch("locate")}
            >
              {#if gps === "asking"}
                <span class="spin"><LoaderCircle size={18} /></span> Waiting for
                your browser…
              {:else}
                <LocateFixed size={18} /> Use my location
              {/if}
            </button>
            <button
              type="button"
              class="lp-btn lp-btn-ghost"
              on:click={() => dispatch("drive")}
            >
              Take an example drive instead
            </button>
          </div>
          {#if !returning}
            <button type="button" class="back" on:click={() => (step = "you")}>
              <ArrowLeft size={16} /> Back
            </button>
          {/if}
        {/if}
      </div>
    {/key}
  </div>
</div>

<style>
  .mv-join {
    position: absolute;
    inset: 0;
    z-index: 30;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    background: linear-gradient(
      to top,
      rgba(13, 22, 17, 0.55),
      rgba(13, 22, 17, 0.08) 60%
    );
  }
  .panel {
    max-height: 90dvh;
    overflow-y: auto;
    padding: 1.4rem max(5vw, 1.1rem) max(1.2rem, env(safe-area-inset-bottom));
    border-radius: 1.6rem 1.6rem 0 0;
    background: var(--lp-paper);
    color: var(--lp-ink);
    box-shadow: 0 -18px 50px -20px rgba(10, 25, 15, 0.6);
    overscroll-behavior: contain;
  }
  .inner {
    width: 100%;
    max-width: 30rem;
    margin-inline: auto;
  }

  @media (min-width: 860px) and (orientation: landscape) {
    .mv-join {
      flex-direction: row;
      align-items: center;
      justify-content: flex-start;
      padding: 1rem;
      background: linear-gradient(
        to right,
        rgba(13, 22, 17, 0.5),
        rgba(13, 22, 17, 0) 70%
      );
    }
    .panel {
      width: min(27rem, 46vw);
      max-height: calc(100dvh - 2rem);
      padding: 1.6rem 1.6rem 1.4rem;
      border-radius: 1.6rem;
    }
  }

  h1 {
    margin-top: 0.5rem;
    font-size: clamp(1.7rem, 5.4vw, 2.3rem);
    font-weight: 800;
    line-height: 1.04;
    text-wrap: balance;
  }
  .sub {
    margin-top: 0.7rem;
    font-size: 1rem;
    line-height: 1.5;
    color: var(--lp-ink-soft);
    text-wrap: pretty;
  }
  .hint {
    margin-top: 0.6rem;
    font-size: 0.85rem;
    line-height: 1.45;
    color: var(--lp-ink-faint);
  }

  .field {
    display: grid;
    gap: 0.35rem;
    margin-top: 1rem;
    font-size: 0.88rem;
    font-weight: 600;
  }
  .field em {
    font-style: normal;
    font-weight: 400;
    color: var(--lp-ink-faint);
  }
  .field input {
    width: 100%;
    min-height: 3rem;
    padding: 0 1rem;
    border: 1.5px solid var(--lp-line);
    border-radius: 0.8rem;
    background: var(--lp-card);
    font-size: 1.05rem;
    color: var(--lp-ink);
  }
  .field input::placeholder {
    color: var(--lp-ink-faint);
  }
  .field input:focus {
    border-color: var(--lp-ink);
    outline: none;
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--lp-yellow) 60%, transparent);
  }

  .machines {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.45rem;
    margin-top: 1rem;
  }
  .machine {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.15rem;
    padding: 0.45rem 0.25rem 0.55rem;
    border: 1.5px solid var(--lp-line);
    border-radius: 1rem;
    background: var(--lp-card);
    font-size: 0.84rem;
    font-weight: 600;
    transition: border-color 0.2s ease;
  }
  .machine:hover {
    border-color: var(--lp-ink);
  }
  .machine.selected {
    border-color: var(--lp-ink);
    box-shadow: inset 0 0 0 1.5px var(--lp-ink);
  }
  .art {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 52px;
  }

  .colours {
    display: grid;
    gap: 0.45rem;
    margin-top: 0.9rem;
  }
  /* Nine across, whatever the width: they share the row. */
  .swatches {
    display: grid;
    grid-template-columns: repeat(9, minmax(0, 1fr));
    gap: 0.25rem;
    max-width: 25.4rem;
  }
  .swatch {
    width: 100%;
    aspect-ratio: 1;
    border: 3px solid var(--lp-paper);
    border-radius: 50%;
    background: var(--swatch);
    box-shadow: 0 0 0 1.5px var(--lp-line);
  }
  .swatch.selected {
    box-shadow: 0 0 0 2.5px var(--lp-ink);
  }
  .lesson {
    min-height: 1.4em;
    margin-top: 0.8rem;
    font-size: 0.9rem;
    line-height: 1.4;
    color: var(--lp-ink-soft);
  }

  .points {
    display: grid;
    gap: 0.5rem;
    margin-top: 1rem;
  }
  .points li {
    display: flex;
    align-items: flex-start;
    gap: 0.55rem;
    font-size: 0.95rem;
    font-weight: 600;
    line-height: 1.35;
  }
  .points li :global(svg) {
    flex-shrink: 0;
    margin-top: 0.15rem;
    color: var(--lp-accent-text);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 1.1rem;
  }
  .actions.stacked {
    display: grid;
    gap: 0.55rem;
  }
  .actions :global(.lp-btn) {
    white-space: normal;
  }
  .actions :global(.lp-btn:disabled) {
    opacity: 0.7;
    transform: none;
  }
  .back {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    min-height: 2.75rem;
    margin-top: 0.4rem;
    font-weight: 600;
    color: var(--lp-ink-soft);
  }
  .spin {
    display: inline-flex;
    animation: mv-spin 0.9s linear infinite;
  }
  @keyframes mv-spin {
    to {
      transform: rotate(360deg);
    }
  }
  button:focus-visible {
    outline: 2px solid var(--lp-accent-text);
    outline-offset: 2px;
  }
  @media (prefers-reduced-motion: reduce) {
    .spin {
      animation: none;
    }
    .machine {
      transition: none;
    }
  }
</style>
