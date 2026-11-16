<script lang="ts">
  /**
   * Who is driving, over the whole screen: carry on as the profile that is
   * set (one big button), pick another from the farm's list, or add a new
   * one. On the way into the map the big button counts down and says yes by
   * itself; touching anything else stops the count.
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
      <p class="lp-eyebrow">Profile</p>
      <button
        type="button"
        class="mn-icon-button"
        aria-label="Close"
        on:click={() => dispatch("close")}
      >
        <X size={24} />
      </button>
    </header>
    <h1>Who's driving?</h1>
    <p class="lead">
      {forTrail
        ? "The trail and its spray record are signed with this name."
        : "Trails laid from this screen are signed with this name."}
    </p>

    {#if current}
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
        <span class="face">{initials(current)}</span>
        <span class="words">
          <small>{countdown > 0 ? "Carry on as" : "Driving as"}</small>
          <b>{current}</b>
        </span>
        <span class="go">
          <Check size={20} strokeWidth={3} />
          {countdown > 0 ? `Yes · ${countdown}` : "Keep"}
        </span>
      </button>
    {/if}

    <div class="rest" on:pointerdown={() => dispatch("hold")}>
      {#if others.length}
        <p class="lp-eyebrow">{current ? "Someone else" : "Pick your name"}</p>
        <div class="people">
          {#each others as choice (choice.id)}
            <button
              type="button"
              disabled={busy}
              on:click={() => dispatch("pick", choice)}
            >
              <span class="face" style="--c: {choice.color || '#60a5fa'}">
                {initials(choice.name)}
              </span>
              <span class="words">
                <b>{choice.name}</b>
                {#if choice.in_use_by}
                  <small>in {choice.in_use_by} now</small>
                {/if}
              </span>
            </button>
          {/each}
        </div>
      {/if}

      <p class="lp-eyebrow">Add a profile</p>
      <form on:submit|preventDefault={add}>
        <input
          type="text"
          bind:value={name}
          placeholder={operators.length ? "A new name" : "Your name"}
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
    gap: 12px;
    width: min(34rem, 100%);
    height: max-content;
    min-height: 100%;
    padding: max(18px, env(safe-area-inset-top)) 18px
      max(22px, env(safe-area-inset-bottom));
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  header .mn-icon-button {
    margin-right: -8px;
    color: var(--lp-ink);
  }
  h1 {
    font-family: var(--lp-display);
    font-size: clamp(2rem, 7vw, 2.7rem);
    font-weight: 800;
    letter-spacing: -0.03em;
    line-height: 1;
  }
  .lead {
    margin-bottom: 4px;
    font-size: 0.98rem;
    line-height: 1.4;
    color: var(--lp-ink-soft);
  }
  .face {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 46px;
    height: 46px;
    border-radius: 50%;
    background: var(--c, var(--lp-ink));
    box-shadow: inset 0 0 0 1.5px rgba(21, 38, 28, 0.35);
    font-family: var(--lp-display);
    font-size: 1.05rem;
    font-weight: 800;
    color: #15261c;
  }
  .words {
    display: grid;
    flex: 1;
    min-width: 0;
    gap: 1px;
    text-align: left;
  }
  .words b {
    overflow: hidden;
    font-size: 1.1rem;
    font-weight: 800;
    line-height: 1.15;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .words small {
    font-size: 0.78rem;
    color: var(--lp-ink-soft);
  }
  /* The profile that is set: one big button. */
  .me {
    position: relative;
    display: flex;
    align-items: center;
    gap: 14px;
    min-height: 84px;
    padding: 12px 16px;
    overflow: hidden;
    border: 2px solid var(--lp-ink);
    border-radius: 22px;
    background: var(--lp-yellow);
    color: #15261c;
    box-shadow: 0 14px 28px -16px rgba(120, 95, 10, 0.9);
  }
  .me .count {
    position: absolute;
    inset: 0 auto 0 0;
    background: rgba(255, 255, 255, 0.4);
    transition: width 1s linear;
  }
  .me > :not(.count) {
    position: relative;
  }
  .me .face {
    width: 54px;
    height: 54px;
    background: #15261c;
    color: var(--lp-yellow);
    font-size: 1.2rem;
  }
  .me .words b {
    font-size: 1.45rem;
  }
  .me .words small {
    color: rgba(21, 38, 28, 0.75);
    font-weight: 700;
  }
  .me .go {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    gap: 6px;
    min-height: 44px;
    padding: 0 16px;
    border-radius: 99px;
    background: #15261c;
    color: #fbf8ee;
    font-size: 0.98rem;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .rest {
    display: grid;
    gap: 10px;
    margin-top: 8px;
  }
  .people {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
    gap: 8px;
  }
  .people button {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 64px;
    padding: 8px 14px 8px 10px;
    border: 1.5px solid var(--lp-line);
    border-radius: 18px;
    background: var(--lp-card);
    color: var(--lp-ink);
  }
  .people button:hover:not(:disabled) {
    border-color: var(--lp-ink);
  }
  .people button:disabled,
  .me:disabled {
    opacity: 0.6;
  }
  form {
    display: flex;
    gap: 8px;
  }
  input {
    flex: 1;
    min-width: 0;
    min-height: 3.2rem;
    padding: 0 16px;
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
    min-height: 3.2rem;
    padding-inline: 1.1rem;
  }
  @media (prefers-reduced-motion: reduce) {
    .mn-profile {
      animation: none;
    }
    .me .count {
      transition: none;
    }
  }
</style>
