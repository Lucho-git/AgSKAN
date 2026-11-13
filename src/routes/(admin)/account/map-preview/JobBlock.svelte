<script lang="ts">
  /**
   * One job, as it shows in a message and in the jobs list: a picture of
   * where it is, what it is, where it has got to, and the taps that move it
   * on. Anyone on the crew can take an open job; whoever has it finishes
   * it; whoever posted it can withdraw it.
   */
  import { createEventDispatcher } from "svelte"
  import { Check, MapPin } from "lucide-svelte"
  import JobThumb from "./JobThumb.svelte"
  import type { Job, Paddock, PinDrawing } from "./liveData"

  export let job: Job
  /** This person's id. */
  export let me: string
  /** Looking on only: nothing can be changed. */
  export let guest = false
  /** A line about who and when, such as "From Mick · 2 h ago". */
  export let who = ""
  export let paddocks: Paddock[] = []
  export let drawings: PinDrawing[] = []

  const dispatch = createEventDispatcher<{
    show: void
    take: void
    finish: void
    cancel: void
  }>()

  let withdrawing = false
  let timer: ReturnType<typeof setTimeout>

  $: places = job.items.map((item) => item.label).filter(Boolean)
  $: open = job.status === "open"
  $: forMe = job.assignedTo === me
  $: canTake = !guest && open && (forMe || !job.assignedTo)
  $: canFinish =
    !guest && job.status !== "done" && (job.takenBy === me || (open && forMe))
  $: canCancel = !guest && job.createdBy === me && job.status !== "done"
  $: status =
    job.status === "done"
      ? "Done"
      : job.status === "accepted"
        ? job.takenBy === me
          ? "You're on it"
          : `${(job.takenByName ?? "Someone").trim().split(/\s+/)[0]} is on it`
        : job.assignedTo
          ? "Not started"
          : "Up for grabs"

  function withdraw() {
    if (!withdrawing) {
      // A second tap, as for removing anything else.
      withdrawing = true
      clearTimeout(timer)
      timer = setTimeout(() => (withdrawing = false), 2500)
      return
    }
    withdrawing = false
    dispatch("cancel")
  }
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
    <p class="status {job.status}" class:grabs={open && !job.assignedTo}>
      {status}
    </p>
    <strong>{job.title}</strong>
    {#if places.length}
      <span class="places"><MapPin size={13} /> {places.join(", ")}</span>
    {/if}
    {#if job.note}<span class="note">{job.note}</span>{/if}
    {#if who}<span class="who">{who}</span>{/if}
  </div>
  {#if canTake || canFinish || canCancel}
    <div class="moves">
      {#if canCancel}
        <button type="button" class="withdraw" on:click={withdraw}>
          {withdrawing ? "Tap again" : "Withdraw"}
        </button>
      {/if}
      {#if canTake}
        <button type="button" on:click={() => dispatch("take")}>
          {forMe ? "I'm on it" : "I'll take it"}
        </button>
      {/if}
      {#if canFinish}
        <button
          type="button"
          class="finish"
          on:click={() => dispatch("finish")}
        >
          <Check size={16} strokeWidth={3} /> Done
        </button>
      {/if}
    </div>
  {/if}
</div>
