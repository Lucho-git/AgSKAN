<script lang="ts">
  /**
   * Jobs, inside the toolbox: what has been given to this person, what they
   * have given others, and what is finished. A job is given to one person;
   * they take it on and finish it, and whoever gave it sees that happen.
   */
  import { createEventDispatcher } from "svelte"
  import { Plus } from "lucide-svelte"
  import JobBlock from "./JobBlock.svelte"
  import type { CrewRow } from "./liveEngine"
  import type { Job, Message, Paddock, PinDrawing } from "./liveData"

  /** This person's id. */
  export let me: string
  /** Every message that carries a job, the newest first. */
  export let jobs: Message[] = []
  export let crew: CrewRow[] = []
  export let paddocks: Paddock[] = []
  export let drawings: PinDrawing[] = []
  export let guest = false

  const dispatch = createEventDispatcher<{
    new: void
    show: Job
    move: { id: number; status: "accepted" | "done" }
  }>()

  $: names = new Map(crew.map((person) => [person.id, person.name]))
  $: forMe = jobs.filter((m) => m.to === me && m.job?.status !== "done")
  $: fromMe = jobs.filter((m) => m.from === me && m.job?.status !== "done")
  $: finished = jobs.filter((m) => m.job?.status === "done").slice(0, 12)

  function ago(t: number) {
    const gap = Date.now() - t
    if (gap < 60_000) return "just now"
    if (gap < 3_600_000) return `${Math.floor(gap / 60_000)} min ago`
    if (gap < 86_400_000) return `${Math.floor(gap / 3_600_000)} h ago`
    return `${Math.floor(gap / 86_400_000)} d ago`
  }
  const first = (name: string) => name.trim().split(/\s+/)[0]
  function who(message: Message) {
    const mine = message.to === me
    const other = mine
      ? (names.get(message.from) ?? message.fromName ?? "Someone")
      : (names.get(message.to) ?? "Someone")
    const when =
      message.job?.status === "done" && message.job.doneAt
        ? `finished ${ago(message.job.doneAt)}`
        : message.job?.status === "accepted" && message.job.acceptedAt
          ? `taken on ${ago(message.job.acceptedAt)}`
          : `given ${ago(message.at)}`
    return `${mine ? "From" : "For"} ${first(other)} · ${when}`
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
    spot, given to one of the crew. They tap "I'm on it", then "Done", and you
    see it happen.
  </p>
{/if}

{#each [{ title: "For you", list: forMe }, { title: "You've given", list: fromMe }, { title: "Finished", list: finished }] as group (group.title)}
  {#if group.list.length}
    <section class="mn-section">
      <p class="lp-eyebrow">{group.title} · {group.list.length}</p>
      <div class="mn-jobs">
        {#each group.list as message (message.id)}
          {#if message.job}
            <JobBlock
              job={message.job}
              mine={message.to === me}
              who={who(message)}
              {paddocks}
              {drawings}
              on:show={() => message.job && dispatch("show", message.job)}
              on:move={(e) =>
                dispatch("move", { id: message.id, status: e.detail })}
            />
          {/if}
        {/each}
      </div>
    </section>
  {/if}
{/each}
