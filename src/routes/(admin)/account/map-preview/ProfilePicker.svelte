<script lang="ts">
  /**
   * Who is driving, over the whole screen.
   *
   * On the way into the map it is one question: "Is this you?", the name in
   * full (it wraps; it is never cut short), and Yes or No. Yes counts down
   * and says itself. No, or touching anything else, stops the count; No
   * turns the screen into the list.
   *
   * The list (after No, from Profile, or before a trail when nobody is set)
   * is the farm's profiles to pick from, and a box to add a new one.
   */
  import { createEventDispatcher } from "svelte"
  import { Check, Plus, X } from "lucide-svelte"
  import type { Operator } from "$lib/stores/operatorStore"

  /** The farm's profiles. */
  export let operators: Operator[] = []
  /** The profile that is set (or on offer), by name. */
  export let current = ""
  /** Seconds until the offer says yes by itself; 0 for no count. */
  export let countdown = 0
  export let total = 10
  export let busy = false
  /** Asked because a trail is about to start: picking one starts it. */
  export let forTrail = false

  const dispatch = createEventDispatcher<{
    /** Carry on as the current profile. */
    confirm: void
    /** Something else was touched: stop counting down. */
    hold: void
    pick: Operator
    add: string
    close: void
  }>()

  let name = ""

  // It opened as a question (a count was running), and No hasn't been said.
  // (Stopping the count by touching the list leaves the question where it
  // is, so nothing moves under a finger.)
  let offered = false
  let declined = false
  $: if (countdown > 0) offered = true
  $: asking = !!current && offered && !declined

  const same = (a: string, b: string) =>
    a.trim().toLowerCase() === b.trim().toLowerCase()
  $: others = operators.filter((choice) => !same(choice.name, current))
  const initials = (who: string) =>
    who
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() ?? "")
      .join("") || "?"

  function no() {
    declined = true
    dispatch("hold")
  }
  function add() {
    const wanted = name.trim()
    if (!wanted || busy) return
    const known = operators.find((choice) => same(choice.name, wanted))
    if (known) dispatch("pick", known)
    else dispatch("add", wanted)
    name = ""
  }
</script>

<div
  class="mn-profile"
  role="dialog"
  aria-modal="true"
  aria-label="Who's driving"
>
  <div class="inner">
    <header>
      <h1>{asking ? "Is this you?" : "Who's driving?"}</h1>
      <button
        type="button"
        class="mn-icon-button"
        aria-label="Close"
        on:click={() => dispatch("close")}
      >
        <X size={24} />
      </button>
    </header>

    {#if asking}
      <div class="offer">
        <div class="who">
          <span class="face">{initials(current)}</span>
          <b>{current}</b>
        </div>
        <div class="ans">
          <button
            type="button"
            class="me"
            disabled={busy}
            on:click={() => dispatch("confirm")}
          >
            {#if countdown > 0}
              <span
                class="count"
                style="width: {(countdown / total) * 100}%"
                aria-hidden="true"
              ></span>
            {/if}
            <span class="go">
              <Check size={20} strokeWidth={3} />
              Yes{countdown > 0 ? ` · ${countdown}` : ""}
            </span>
          </button>
          <button type="button" class="no" on:click={no}>No</button>
        </div>
      </div>
    {/if}

    <div class="rest" on:pointerdown={() => dispatch("hold")}>
      {#if (current && !asking) || others.length}
        <p class="lp-eyebrow">
          {asking ? "Someone else" : "Pick a name"}
        </p>
        <div class="people">
          {#if current && !asking}
            <!-- The one that is set (or was offered): first in the list. -->
            <button
              type="button"
              class="me"
              class:set={!offered}
              disabled={busy}
              on:click={() => dispatch("confirm")}
            >
              <span class="face">{initials(current)}</span>
              <b>{current}</b>
              {#if !offered}
                <i><Check size={16} strokeWidth={3} /> Driving</i>
              {/if}
            </button>
          {/if}
          {#each others as choice (choice.id)}
            <button
              type="button"
              disabled={busy}
              on:click={() => dispatch("pick", choice)}
            >
              <span class="face" style="--c: {choice.color || '#60a5fa'}">
                {initials(choice.name)}
              </span>
              <b>
                {choice.name}
                {#if choice.in_use_by}
                  <small>in {choice.in_use_by} now</small>
                {/if}
              </b>
            </button>
          {/each}
        </div>
      {/if}

      <form on:submit|preventDefault={add}>
        <input
          type="text"
          bind:value={name}
          placeholder={operators.length ? "Add a new name" : "Your name"}
          aria-label="Name for a new profile"
          autocomplete="name"
          maxlength="40"
          on:focus={() => dispatch("hold")}
        />
        <button
          type="submit"
          class="lp-btn lp-btn-primary"
          disabled={busy || !name.trim()}
        >
          <Plus size={18} strokeWidth={3} /> Add
        </button>
      </form>
      <p class="lead">
        {forTrail
          ? "The trail is signed with this name."
          : "Trails are signed with this name."}
      </p>
    </div>
  </div>
</div>

<style>
  .mn-profile {
    position: absolute;
    inset: 0;
    z-index: 50;
    display: flex;
    justify-content: center;
    overflow-y: auto;
    background: var(--lp-paper);
    color: var(--lp-ink);
    animation: in 0.22s ease-out;
  }
  @keyframes in {
    from {
      opacity: 0;
      transform: translateY(14px);
    }
  }
  .inner {
    display: flex;
    flex-direction: column;
    gap: 14px;
    width: min(30rem, 100%);
    height: max-content;
    min-height: 100%;
    padding: max(14px, env(safe-area-inset-top)) 16px
      max(22px, env(safe-area-inset-bottom));
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  header .mn-icon-button {
    flex-shrink: 0;
    margin-right: -8px;
    color: var(--lp-ink);
  }
  h1 {
    font-family: var(--lp-display);
    font-size: clamp(1.8rem, 8vw, 2.4rem);
    font-weight: 800;
    letter-spacing: -0.03em;
    line-height: 1;
  }
  .face {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 42px;
    height: 42px;
    border-radius: 50%;
    background: var(--c, var(--lp-ink));
    box-shadow: inset 0 0 0 1.5px rgba(21, 38, 28, 0.35);
    font-family: var(--lp-display);
    font-size: 1rem;
    font-weight: 800;
    color: #15261c;
  }

  /* ── The question: the name in full, then Yes or No ── */
  .offer {
    display: grid;
    gap: 14px;
    padding: 16px 14px 14px;
    border: 2px solid #15261c;
    border-radius: 22px;
    background: var(--lp-yellow);
    color: #15261c;
    box-shadow: 0 14px 28px -16px rgba(120, 95, 10, 0.9);
  }
  .who {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }
  .who .face {
    width: 54px;
    height: 54px;
    background: #15261c;
    box-shadow: none;
    font-size: 1.2rem;
    color: var(--lp-yellow);
  }
  /* (The name wraps to as many lines as it needs: it is never cut.) */
  .who b {
    min-width: 0;
    font-family: var(--lp-display);
    font-size: clamp(1.5rem, 7.4vw, 2rem);
    font-weight: 800;
    letter-spacing: -0.02em;
    line-height: 1.08;
    overflow-wrap: anywhere;
  }
  .ans {
    display: grid;
    grid-template-columns: minmax(0, 1.7fr) minmax(0, 1fr);
    gap: 8px;
  }
  .ans button {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 58px;
    overflow: hidden;
    border: 2px solid #15261c;
    border-radius: 16px;
    font-size: 1.15rem;
    font-weight: 800;
  }
  .ans .me {
    background: #15261c;
    color: #fbf8ee;
  }
  .ans .no {
    background: #fbf8ee;
    color: #15261c;
  }
  .ans .count {
    position: absolute;
    inset: 0 auto 0 0;
    background: rgba(255, 255, 255, 0.2);
    transition: width 1s linear;
  }
  .ans .go {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  /* ── The list, and a new name ── */
  .rest {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
  }
  .people {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(13rem, 100%), 1fr));
    gap: 6px;
  }
  .people button {
    display: flex;
    align-items: center;
    gap: 11px;
    min-height: 58px;
    padding: 7px 12px 7px 9px;
    border: 1.5px solid var(--lp-line);
    border-radius: 16px;
    background: var(--lp-card);
    color: var(--lp-ink);
    text-align: left;
  }
  .people b {
    flex: 1;
    min-width: 0;
    font-size: 1.05rem;
    font-weight: 800;
    line-height: 1.15;
    overflow-wrap: anywhere;
  }
  .people small {
    display: block;
    font-size: 0.76rem;
    font-weight: 600;
    color: var(--lp-ink-soft);
  }
  .people button:hover:not(:disabled) {
    border-color: var(--lp-ink);
  }
  .people .me.set {
    border-color: var(--lp-ink);
    box-shadow: inset 0 0 0 1px var(--lp-ink);
  }
  .people .me .face {
    background: var(--lp-yellow);
  }
  .people .me i {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    gap: 4px;
    padding: 3px 9px;
    border-radius: 99px;
    background: var(--lp-ink);
    font-size: 0.74rem;
    font-style: normal;
    font-weight: 700;
    color: var(--lp-paper);
  }
  .people button:disabled,
  .ans .me:disabled {
    opacity: 0.6;
  }
  form {
    display: flex;
    gap: 8px;
    margin-top: 4px;
  }
  input {
    flex: 1;
    width: 0;
    min-width: 0;
    min-height: 3.1rem;
    padding: 0 14px;
    border: 1.5px solid var(--lp-line);
    border-radius: 16px;
    background: var(--lp-card);
    font-size: 1.05rem;
    color: var(--lp-ink);
  }
  input:focus {
    border-color: var(--lp-ink);
    outline: none;
  }
  form .lp-btn {
    min-height: 3.1rem;
    padding-inline: 1.1rem;
  }
  .lead {
    font-size: 0.84rem;
    line-height: 1.4;
    color: var(--lp-ink-faint);
  }
  @media (prefers-reduced-motion: reduce) {
    .mn-profile {
      animation: none;
    }
    .ans .count {
      transition: none;
    }
  }
</style>
