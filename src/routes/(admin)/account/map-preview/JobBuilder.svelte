<script context="module" lang="ts">
  import type { JobItem } from "./liveData"

  /** A job being put together: one step or several, each with its places. */
  export type JobDraft = {
    to: string | null
    title: string
    note: string
    steps: { title: string; items: JobItem[] }[]
    /** The step taps on the map add to. */
    current: number
  }
</script>

<script lang="ts">
  /**
   * Putting a job together. What needs doing is the heading; under it the
   * job is a numbered list of steps, each with the places it points at.
   * One step is being added to at a time (the bar across the top of the map
   * says which, and offers the other things a step can point at). Who it is
   * for is one line with the crew in a list behind it, and the Post button
   * stays in view at the bottom.
   */
  import { createEventDispatcher } from "svelte"
  import { ChevronDown, ClipboardList, MapPin, Plus, X } from "lucide-svelte"
  import JobThumb from "./JobThumb.svelte"
  import PlaceArt from "./PlaceArt.svelte"
  import type { Paddock, PinDrawing } from "./liveData"

  export let draft: JobDraft
  export let paddocks: Paddock[] = []
  export let drawings: PinDrawing[] = []
  /** Who a job can be given to. */
  export let crew: { id: string; name: string }[] = []
  export let giving = false

  const dispatch = createEventDispatcher<{ close: void; post: void }>()
  const MOST = 8

  $: places = draft.steps.reduce((sum, step) => sum + step.items.length, 0)

  function work(index: number) {
    if (draft.current !== index) draft = { ...draft, current: index }
  }
  function addStep() {
    if (draft.steps.length >= MOST) return
    draft = {
      ...draft,
      steps: [...draft.steps, { title: "", items: [] }],
      current: draft.steps.length,
    }
  }
  function removeStep(index: number) {
    if (draft.steps.length < 2) return
    const steps = draft.steps.filter((_, i) => i !== index)
    draft = {
      ...draft,
      steps,
      current: Math.min(
        draft.current > index ? draft.current - 1 : draft.current,
        steps.length - 1,
      ),
    }
  }
  function takeOff(index: number, at: number) {
    draft = {
      ...draft,
      steps: draft.steps.map((step, i) =>
        i === index
          ? { ...step, items: step.items.filter((_, n) => n !== at) }
          : step,
      ),
    }
  }
</script>

<div class="mn-card mn-menu mn-jobmaker">
  <div class="head">
    <JobThumb
      items={draft.steps.flatMap((step) => step.items)}
      {paddocks}
      {drawings}
      width={84}
      height={64}
    />
    <div class="about">
      <p class="lp-eyebrow">New job</p>
      <input
        class="title"
        type="text"
        bind:value={draft.title}
        maxlength="80"
        placeholder="What needs doing?"
        aria-label="What needs doing"
      />
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

  <input
    class="note"
    type="text"
    bind:value={draft.note}
    maxlength="300"
    placeholder="Anything they should know (optional)"
    aria-label="Notes"
  />

  <!-- ── The steps ── -->
  <ol class="jm-steps">
    {#each draft.steps as step, index}
      <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-noninteractive-element-interactions -->
      <li class:current={draft.current === index} on:click={() => work(index)}>
        <span class="n">{index + 1}</span>
        <div class="body">
          <div class="line">
            <input
              type="text"
              bind:value={step.title}
              maxlength="80"
              placeholder={draft.steps.length === 1
                ? "Where, and what to do there"
                : index === 0
                  ? "First…"
                  : "Then…"}
              aria-label="Step {index + 1}"
              on:focus={() => work(index)}
            />
            {#if draft.steps.length > 1}
              <button
                type="button"
                class="mn-icon-button"
                aria-label="Remove step {index + 1}"
                on:click|stopPropagation={() => removeStep(index)}
              >
                <X size={17} />
              </button>
            {/if}
          </div>
          {#if step.items.length}
            <div class="mn-job-items">
              {#each step.items as item, i}
                <span>
                  <PlaceArt
                    type={item.type}
                    id={item.id}
                    points={item.points ?? null}
                    size={20}
                  />
                  {item.label}
                  <button
                    type="button"
                    aria-label="Take {item.label} off"
                    on:click|stopPropagation={() => takeOff(index, i)}
                  >
                    <X size={15} />
                  </button>
                </span>
              {/each}
            </div>
          {:else if draft.current === index}
            <p class="none"><MapPin size={14} /> Tap the map to add a place</p>
          {:else}
            <p class="none idle">No place yet</p>
          {/if}
        </div>
        {#if draft.current === index && draft.steps.length > 1}
          <b class="here">Adding here</b>
        {/if}
      </li>
    {/each}
    {#if draft.steps.length < MOST}
      <li class="more">
        <button type="button" on:click={addStep}>
          <span class="n"><Plus size={16} strokeWidth={3} /></span>
          Add step {draft.steps.length + 1}
        </button>
      </li>
    {/if}
  </ol>

  <!-- ── Who it is for: one line, the crew in a list behind it ── -->
  <label class="mn-drop">
    <span class="lp-eyebrow">For</span>
    <strong>
      {crew.find((person) => person.id === draft.to)?.name ??
        "Anyone on the crew"}
    </strong>
    <ChevronDown size={18} />
    <select
      aria-label="Who the job is for"
      value={draft.to ?? ""}
      on:change={(e) =>
        (draft = { ...draft, to: e.currentTarget.value || null })}
    >
      <option value="">Anyone on the crew</option>
      {#each crew as person (person.id)}
        <option value={person.id}>{person.name}</option>
      {/each}
    </select>
  </label>

  <div class="mn-card-actions">
    <button
      type="button"
      class="lp-btn lp-btn-ghost"
      on:click={() => dispatch("close")}
    >
      Cancel
    </button>
    <button
      type="button"
      class="lp-btn lp-btn-primary"
      disabled={giving || !draft.title.trim() || !places}
      on:click={() => dispatch("post")}
    >
      <ClipboardList size={18} />
      {!draft.title.trim()
        ? "Say what needs doing"
        : !places
          ? "Add a place"
          : draft.to
            ? "Give job"
            : "Post job"}
    </button>
  </div>
</div>

<style>
  .mn-jobmaker .head {
    align-items: center;
  }
  .title {
    width: 100%;
    min-height: 40px;
    padding: 0 2px;
    border-bottom: 2px solid var(--lp-line);
    background: none;
    font-family: var(--lp-display);
    font-size: 1.2rem;
    font-weight: 800;
    color: var(--lp-ink);
    outline: none;
  }
  .title:focus {
    border-color: var(--lp-ink);
  }
  .note {
    width: 100%;
    min-height: 40px;
    padding: 0 12px;
    border: 1.5px solid var(--lp-line);
    border-radius: 12px;
    background: var(--lp-card);
    font-size: 0.95rem;
    color: var(--lp-ink);
  }
  .jm-steps {
    display: grid;
    gap: 0;
    border: 1.5px solid var(--lp-line);
    border-radius: 16px;
    overflow: hidden;
  }
  .jm-steps li {
    position: relative;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 10px;
    padding: 9px 10px;
    border-left: 4px solid transparent;
  }
  .jm-steps li + li {
    border-top: 1.5px solid var(--lp-line);
  }
  .jm-steps li.current {
    border-left-color: var(--lp-yellow);
    background: var(--lp-paper);
  }
  .n {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    margin-top: 4px;
    border-radius: 50%;
    background: var(--lp-paper-2);
    font-family: var(--lp-mono);
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--lp-ink);
  }
  .current > .n {
    background: var(--lp-yellow);
    color: #15261c;
  }
  .body {
    display: grid;
    gap: 6px;
    min-width: 0;
  }
  .line {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .line input {
    flex: 1;
    min-width: 0;
    min-height: 38px;
    padding: 0 2px;
    border-bottom: 1.5px solid transparent;
    background: none;
    font-size: 1rem;
    font-weight: 700;
    color: var(--lp-ink);
    outline: none;
  }
  .line input:focus {
    border-color: var(--lp-ink);
  }
  .line .mn-icon-button {
    width: 36px;
    height: 36px;
  }
  .none {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.86rem;
    font-weight: 700;
    color: #92400e;
  }
  .none.idle {
    font-weight: 500;
    color: var(--lp-ink-soft);
  }
  .here {
    position: absolute;
    top: -1px;
    right: 12px;
    padding: 2px 8px;
    border-radius: 0 0 8px 8px;
    background: var(--lp-yellow);
    font-family: var(--lp-mono);
    font-size: 0.64rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: #15261c;
    text-transform: uppercase;
  }
  .more {
    padding: 0 !important;
    border-left: 0 !important;
  }
  .more button {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 46px;
    padding: 0 10px 0 14px;
    font-size: 0.92rem;
    font-weight: 700;
    color: var(--lp-ink);
    text-align: left;
  }
  .more button:hover {
    background: var(--lp-paper);
  }
  .more .n {
    margin: 0;
    border: 1.5px dashed var(--lp-ink-soft);
    background: none;
  }
</style>
