<script lang="ts">
  /**
   * One job, as it shows in a message and in the jobs list: a picture of
   * where it is, what it is, where it has got to, and (for whoever it was
   * given to) the two taps that move it on.
   */
  import { createEventDispatcher } from "svelte"
  import { Check, MapPin } from "lucide-svelte"
  import JobThumb from "./JobThumb.svelte"
  import type { Job, Paddock, PinDrawing } from "./liveData"

  export let job: Job
  /** It was given to this person (so they are the one who moves it on). */
  export let mine = false
  /** A line about who and when, such as "From Mick · 2h". */
  export let who = ""
  export let paddocks: Paddock[] = []
  export let drawings: PinDrawing[] = []

  const dispatch = createEventDispatcher<{
    show: void
    move: "accepted" | "done"
  }>()

  const STATUS = { open: "Not started", accepted: "On it", done: "Done" }
  $: places = job.items.map((item) => item.label).filter(Boolean)
</script>

<div class="mn-job" class:done={job.status === "done"}>
  <button
    type="button"
    class="where"
    aria-label="Show this job on the map"
    on:click={() => dispatch("show")}
  >
    <JobThumb items={job.items} {paddocks} {drawings} />
  </button>
  <div class="what">
    <p class="status {job.status}">{STATUS[job.status]}</p>
    <strong>{job.title}</strong>
    {#if places.length}
      <span class="places"><MapPin size={13} /> {places.join(", ")}</span>
    {/if}
    {#if job.note}<span class="note">{job.note}</span>{/if}
    {#if who}<span class="who">{who}</span>{/if}
  </div>
  {#if mine && job.status !== "done"}
    <div class="moves">
      {#if job.status === "open"}
        <button type="button" on:click={() => dispatch("move", "accepted")}>
          I'm on it
        </button>
      {/if}
      <button
        type="button"
        class="finish"
        on:click={() => dispatch("move", "done")}
      >
        <Check size={16} strokeWidth={3} /> Done
      </button>
    </div>
  {/if}
</div>
