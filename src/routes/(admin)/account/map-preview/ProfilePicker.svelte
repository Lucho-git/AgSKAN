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
   * is the farm's names to pick from, and a box to add a new one. A name
   * that is added goes on the list and no more: it is picked with a tap, as
   * any other. Opened from the toolbox, names can be taken off the list too.
   */
  import { createEventDispatcher } from "svelte"
  import { Check, Plus, Trash2, X } from "lucide-svelte"
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
  /** Opened to look after the list: names can be taken off it. */
  export let manage = false

  const dispatch = createEventDispatcher<{
    /** Carry on as the current profile. */
    confirm: void
    /** Something else was touched: stop counting down. */
    hold: void
    pick: Operator
    /** Put a new name on the list (it is not picked). */
    add: string
    /** Take a name off the list, or put it back. */
    remove: Operator
    restore: Operator
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
  // A new name goes on the list; it is marked there for a moment, to be
  // found and tapped. (One that is on the list already is only marked.)
  let added = ""
  let addedTimer: ReturnType<typeof setTimeout> | undefined
  function add() {
    const wanted = name.trim()
    if (!wanted || busy) return
    if (!operators.some((choice) => same(choice.name, wanted)))
      dispatch("add", wanted)
    added = wanted
    clearTimeout(addedTimer)
    addedTimer = setTimeout(() => (added = ""), 6000)
    name = ""
  }

  // Taking a name off: asked on its own row first, and undone from a line
  // under the list for a while after.
  let removing: string | null = null
  let removed: Operator | null = null
  let removedTimer: ReturnType<typeof setTimeout> | undefined
  function remove(choice: Operator) {
    removing = null
    removed = choice
    clearTimeout(removedTimer)
    removedTimer = setTimeout(() => (removed = null), 8000)
    dispatch("remove", choice)
  }
  function restore() {
    if (!removed) return
    dispatch("restore", removed)
    removed = null
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
                <i><Check size={16} strokeWidth={3} /> Current</i>
              {/if}
            </button>
          {/if}
          {#each others as choice (choice.id)}
            {#if removing === choice.id}
              <div class="ask">
                <b>Remove {choice.name}?</b>
                <button
                  type="button"
                  class="yes"
                  disabled={busy}
                  on:click={() => remove(choice)}
                >
                  Remove
                </button>
                <button type="button" on:click={() => (removing = null)}>
                  Keep
                </button>
              </div>
            {:else}
              <div class="row" class:new={same(choice.name, added)}>
                <button
                  type="button"
                  class="pick"
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
                  {#if same(choice.name, added)}<i>Added</i>{/if}
                </button>
                {#if manage && !choice.in_use_by}
                  <button
                    type="button"
                    class="bin"
                    aria-label="Remove {choice.name}"
                    title="Remove {choice.name}"
                    disabled={busy}
                    on:click={() => (removing = choice.id)}
                  >
                    <Trash2 size={18} />
                  </button>
                {/if}
              </div>
            {/if}
          {/each}
        </div>
      {/if}
      {#if removed}
        <p class="undo">
          {removed.name} removed.
          <button type="button" on:click={restore}>Undo</button>
        </p>
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
  .people .me,
  .people .pick {
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
  /* A name, and (looking after the list) the bin beside it. */
  .row {
    display: flex;
    gap: 6px;
    min-width: 0;
  }
  .row .pick {
    flex: 1;
    min-width: 0;
  }
  .row .bin {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 48px;
    border: 1.5px solid var(--lp-line);
    border-radius: 16px;
    background: var(--lp-card);
    color: var(--lp-rust);
  }
  .row .bin:hover:not(:disabled) {
    border-color: var(--lp-rust);
  }
  /* Just added: marked, so it is found and tapped. */
  .row.new .pick {
    border-color: #1f8a4c;
    box-shadow: inset 0 0 0 1px #1f8a4c;
  }
  .row.new .pick i {
    flex-shrink: 0;
    padding: 3px 9px;
    border-radius: 99px;
    background: #1f8a4c;
    font-size: 0.74rem;
    font-style: normal;
    font-weight: 700;
    color: #fff;
    animation: added 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }
  @keyframes added {
    from {
      opacity: 0;
      transform: scale(0.5);
    }
  }
  /* "Remove Dave?" in the row's own place. */
  .ask {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 58px;
    padding: 7px 8px 7px 14px;
    border: 1.5px solid var(--lp-rust);
    border-radius: 16px;
    background: var(--lp-card);
  }
  .ask b {
    flex: 1;
  }
  .ask button {
    flex-shrink: 0;
    min-height: 40px;
    padding: 0 13px;
    border: 1.5px solid var(--lp-line);
    border-radius: 12px;
    font-size: 0.88rem;
    font-weight: 700;
    color: var(--lp-ink);
  }
  .ask .yes {
    border-color: var(--lp-rust);
    background: var(--lp-rust);
    color: #fff;
  }
  .undo {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--lp-ink-soft);
  }
  .undo button {
    min-height: 2.4rem;
    padding: 0 6px;
    font-weight: 800;
    color: var(--lp-ink);
    text-decoration: underline;
    text-underline-offset: 3px;
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
  .people .me:hover:not(:disabled),
  .people .pick:hover:not(:disabled) {
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
