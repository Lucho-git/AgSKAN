<script lang="ts">
  /**
   * Jobs, inside the toolbox: what this person has on, what is up for
   * grabs, what they have posted, and what is finished. A job is posted
   * for one person or for anyone on the crew; whoever takes it finishes it,
   * and whoever posted it sees that happen.
   */
  import { createEventDispatcher } from "svelte"
  import { Plus } from "lucide-svelte"
  import JobBlock from "./JobBlock.svelte"
  import type { CrewRow } from "./liveEngine"
  import type { Job, Paddock, PinDrawing } from "./liveData"

  /** This person's id. */
  export let me: string
  /** Every job on the map, the newest first. */
  export let jobs: Job[] = []
  export let crew: CrewRow[] = []
  export let paddocks: Paddock[] = []
  export let drawings: PinDrawing[] = []
  export let guest = false

  const dispatch = createEventDispatcher<{
    new: void
    show: Job
    take: string
    finish: string
    cancel: string
    tick: { id: string; index: number; done: boolean }
  }>()

  $: names = new Map(crew.map((person) => [person.id, person.name]))
  $: live = jobs.filter((job) => job.status !== "done")
  $: mine = live.filter(
    (job) =>
      job.takenBy === me || (job.assignedTo === me && job.status === "open"),
  )
  $: grabs = live.filter(
    (job) => !job.assignedTo && job.status === "open" && job.createdBy !== me,
  )
  $: posted = live.filter((job) => job.createdBy === me && !mine.includes(job))
  // What the rest of the crew has going, so everyone can see the board.
  $: others = live.filter(
    (job) =>
      !mine.includes(job) && !grabs.includes(job) && !posted.includes(job),
  )
  $: finished = jobs.filter((job) => job.status === "done").slice(0, 12)

  function ago(t: number) {
    const gap = Date.now() - t
    if (gap < 60_000) return "just now"
    if (gap < 3_600_000) return `${Math.floor(gap / 60_000)} min ago`
    if (gap < 86_400_000) return `${Math.floor(gap / 3_600_000)} h ago`
    return `${Math.floor(gap / 86_400_000)} d ago`
  }
  const first = (name: string | null | undefined) =>
    (name ?? "Someone").trim().split(/\s+/)[0]
  function who(job: Job) {
    const from =
      job.createdBy === me
        ? "You"
        : first(names.get(job.createdBy) ?? job.createdByName)
    const to = job.assignedTo
      ? job.assignedTo === me
        ? "you"
        : first(names.get(job.assignedTo))
      : "anyone"
    const when =
      job.status === "done" && job.doneAt
        ? `finished ${ago(job.doneAt)}`
        : job.status === "accepted" && job.acceptedAt
          ? `taken ${ago(job.acceptedAt)}`
          : `posted ${ago(job.createdAt)}`
    return `${from} for ${to} · ${when}`
  }
</script>

{#if !guest}
  <button
    type="button"
    class="lp-btn lp-btn-primary"
    on:click={() => dispatch("new")}
  >
    <Plus size={18} strokeWidth={3} /> New job
  </button>
{/if}

{#if !jobs.length}
  <p class="mn-empty">
    No jobs yet. A job is a note about something on the map, a paddock, a pin, a
    spot. Give it to one of the crew, or leave it open for anyone to take. They
    tap "I'm on it", then "Done", and you see it happen.
  </p>
{/if}

{#each [{ title: "Yours", list: mine }, { title: "Up for grabs", list: grabs }, { title: "You've posted", list: posted }, { title: "The rest of the crew", list: others }, { title: "Finished", list: finished }] as group (group.title)}
  {#if group.list.length}
    <section class="mn-section">
      <p class="lp-eyebrow">{group.title} · {group.list.length}</p>
      <div class="mn-jobs">
        {#each group.list as job (job.id)}
          <JobBlock
            {job}
            {me}
            {guest}
            who={who(job)}
            {paddocks}
            {drawings}
            on:show={() => dispatch("show", job)}
            on:take={() => dispatch("take", job.id)}
            on:finish={() => dispatch("finish", job.id)}
            on:cancel={() => dispatch("cancel", job.id)}
            on:tick={(e) => dispatch("tick", { id: job.id, ...e.detail })}
          />
        {/each}
      </div>
    </section>
  {/if}
{/each}
