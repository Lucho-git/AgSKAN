<script lang="ts">
  /**
   * Messages, inside the toolbox: the list of people this person has talked
   * to (and the rest of the crew, to start with), or one conversation.
   *
   * Built for a cab: answers that take one tap, a place sent in two (where
   * you are, or whatever is picked on the map), and a place received opens
   * on the map. A job, something to do at a paddock or a pin, is sent from
   * here too and shows with a picture of where it is.
   */
  import { createEventDispatcher, tick } from "svelte"
  import {
    ClipboardList,
    LocateFixed,
    MapPin,
    SendHorizontal,
    X,
  } from "lucide-svelte"
  import vehicles from "$lib/vehicles"
  import JobBlock from "./JobBlock.svelte"
  import type { CrewRow } from "./liveEngine"
  import type {
    Job,
    Message,
    Paddock,
    PinDrawing,
    SharedPlace,
  } from "./liveData"
  import type { Conversation } from "./messenger"

  /** This person's id. */
  export let me: string
  export let crew: CrewRow[] = []
  export let conversations: Conversation[] = []
  /** Who the open conversation is with; null shows the list. */
  export let withId: string | null = null
  export let thread: Message[] = []
  export let loading = false
  export let sending = false
  /** Places that can be sent right now: where I am, and what is picked. */
  export let places: { key: string; label: string; place: SharedPlace }[] = []
  /** The farm, for the picture on a job. */
  export let paddocks: Paddock[] = []
  export let drawings: PinDrawing[] = []
  export let guest = false
  /** Every job on the map, to show the ones messages hand over. */
  export let jobs: Job[] = []

  const dispatch = createEventDispatcher<{
    open: string | null
    send: { body: string; place: SharedPlace | null }
    show: SharedPlace
    look: string
    /** Start putting a job together for this person. */
    job: void
    showJob: Job
    takeJob: string
    finishJob: string
    cancelJob: string
    tickJob: { id: string; index: number; done: boolean }
  }>()

  $: jobById = new Map(jobs.map((job) => [job.id, job]))

  const QUICK = [
    "On my way",
    "Yes",
    "No",
    "Call me",
    "Where are you?",
    "Thanks",
  ]

  let draft = ""
  let attached: { key: string; label: string; place: SharedPlace } | null = null
  let choosing = false
  let threadEl: HTMLDivElement | undefined
  let lastWith: string | null = null

  $: byId = new Map(crew.map((person) => [person.id, person]))
  $: person = withId ? (byId.get(withId) ?? null) : null
  $: talkedTo = new Set(conversations.map((convo) => convo.id))
  $: others = crew.filter((member) => !talkedTo.has(member.id))
  // A new conversation starts clean.
  $: if (withId !== lastWith) {
    lastWith = withId
    draft = ""
    attached = null
    choosing = false
  }
  // Keep the newest message in view.
  $: if (thread.length && threadEl) toEnd()
  async function toEnd() {
    await tick()
    // Through a local name: setting a property on `threadEl` itself would
    // count as changing it, and run this again without end.
    const el = threadEl
    if (el) el.scrollTop = el.scrollHeight
  }

  const nameOf = (convo: Conversation) =>
    byId.get(convo.id)?.name ?? convo.name ?? "Team member"
  const initials = (name: string) =>
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"

  function ago(t: number) {
    const gap = Date.now() - t
    if (gap < 60_000) return "now"
    if (gap < 3_600_000) return `${Math.floor(gap / 60_000)}m`
    if (gap < 86_400_000) return `${Math.floor(gap / 3_600_000)}h`
    if (gap < 604_800_000) return `${Math.floor(gap / 86_400_000)}d`
    return new Date(t).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
    })
  }
  const clock = (t: number) =>
    new Date(t).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    })
  const dayKey = (t: number) => new Date(t).toDateString()
  function dayLabel(t: number) {
    const key = dayKey(t)
    if (key === dayKey(Date.now())) return "Today"
    if (key === dayKey(Date.now() - 86_400_000)) return "Yesterday"
    return new Date(t).toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
    })
  }
  const preview = (message: Message) =>
    (message.from === me ? "You: " : "") +
    (message.body ||
      (message.jobRef
        ? `Job: ${message.jobRef.title}`
        : message.place
          ? message.place.label
          : ""))

  /** The last of mine they have opened: "Seen" goes under that one. */
  $: seen = [...thread].reverse().find((m) => m.from === me && m.read)?.id

  function send(body = draft) {
    const text = body.trim()
    if ((!text && !attached) || sending) return
    dispatch("send", { body: text, place: attached?.place ?? null })
    if (body === draft) draft = ""
    attached = null
    choosing = false
  }
</script>

{#if withId}
  <!-- ── One conversation ── -->
  <div class="mn-convo-head">
    <span class="state" class:on={person?.online}>
      {#if person}
        {person.online ? "On the map now" : "Not on the map"} · {person.doing}
      {:else}
        No longer on this farm
      {/if}
    </span>
    {#if person?.placed}
      <button
        type="button"
        class="mn-text-button"
        on:click={() => withId && dispatch("look", withId)}
      >
        <LocateFixed size={15} /> Find
      </button>
    {/if}
  </div>

  <div class="mn-thread" bind:this={threadEl} aria-live="polite">
    {#if !thread.length}
      <p class="mn-empty">
        {loading
          ? "Loading…"
          : `Nothing yet. Say something to ${person?.name.split(/\s+/)[0] ?? "them"}.`}
      </p>
    {/if}
    {#each thread as message, i (message.id)}
      {#if i === 0 || dayKey(thread[i - 1].at) !== dayKey(message.at)}
        <p class="day">{dayLabel(message.at)}</p>
      {/if}
      <div
        class="mn-bubble"
        class:mine={message.from === me}
        class:placed={!!message.place}
        class:job={!!message.jobRef && jobById.has(message.jobRef.id)}
      >
        {#if message.jobRef && jobById.has(message.jobRef.id)}
          {@const job = jobById.get(message.jobRef.id)}
          {#if job}
            <JobBlock
              {job}
              {me}
              {guest}
              {paddocks}
              {drawings}
              on:show={() => dispatch("showJob", job)}
              on:take={() => dispatch("takeJob", job.id)}
              on:finish={() => dispatch("finishJob", job.id)}
              on:cancel={() => dispatch("cancelJob", job.id)}
              on:tick={(e) => dispatch("tickJob", { id: job.id, ...e.detail })}
            />
          {/if}
        {:else if message.place}
          <button
            type="button"
            class="place"
            on:click={() => message.place && dispatch("show", message.place)}
          >
            <MapPin size={17} />
            <span>{message.place.label}</span>
            <b>Show</b>
          </button>
        {/if}
        {#if message.body}<p>{message.body}</p>{/if}
        <small>
          {clock(message.at)}{message.id === seen ? " · Seen" : ""}
        </small>
      </div>
    {/each}
  </div>

  {#if person}
    <div class="mn-quick" role="group" aria-label="Quick replies">
      {#each QUICK as text}
        <button type="button" disabled={sending} on:click={() => send(text)}>
          {text}
        </button>
      {/each}
    </div>

    {#if choosing}
      <div class="mn-places">
        {#each places as option (option.key)}
          <button
            type="button"
            on:click={() => {
              attached = option
              choosing = false
            }}
          >
            <MapPin size={17} />
            {option.label}
          </button>
        {:else}
          <p class="mn-note">
            Turn your location on, or pick a pin or paddock on the map, and it
            can be sent from here.
          </p>
        {/each}
      </div>
    {/if}
    {#if attached}
      <p class="mn-attached">
        <MapPin size={16} />
        <span>{attached.label}</span>
        <button
          type="button"
          aria-label="Don't send this place"
          on:click={() => (attached = null)}
        >
          <X size={16} />
        </button>
      </p>
    {/if}

    <div class="mn-send-row">
      <button
        type="button"
        class:on={choosing || !!attached}
        aria-expanded={choosing}
        on:click={() => (choosing = !choosing)}
      >
        <MapPin size={18} /> Send location
      </button>
      {#if !guest}
        <button type="button" on:click={() => dispatch("job")}>
          <ClipboardList size={18} /> Send job
        </button>
      {/if}
    </div>

    <form class="mn-compose" on:submit|preventDefault={() => send()}>
      <input
        type="text"
        bind:value={draft}
        maxlength="500"
        placeholder="Message {person.name.split(/\s+/)[0]}"
        autocomplete="off"
        enterkeyhint="send"
      />
      <button
        type="submit"
        class="send"
        aria-label="Send"
        disabled={sending || (!draft.trim() && !attached)}
      >
        <SendHorizontal size={22} />
      </button>
    </form>
  {/if}
{:else}
  <!-- ── Everyone ── -->
  {#if conversations.length}
    <ul class="mn-crew mn-inbox">
      {#each conversations as convo (convo.id)}
        {@const who = byId.get(convo.id)}
        <li>
          <button type="button" on:click={() => dispatch("open", convo.id)}>
            <span class="art" class:away={who?.away}>
              {#if who}
                <svelte:component
                  this={vehicles[who.type]}
                  size="40px"
                  bodyColor={who.colour}
                  outlineColor="#ffffff"
                  wheelColor="#15261C"
                  loadColor="#F7DB5C"
                />
                {#if who.online}<i aria-label="On the map now"></i>{/if}
              {:else}
                <b>{initials(nameOf(convo))}</b>
              {/if}
            </span>
            <span class="who">
              <strong>{nameOf(convo)}</strong>
              <span class="doing" class:unread={convo.unread > 0}
                >{preview(convo.last)}</span
              >
            </span>
            <span class="where">
              <span class="far">{ago(convo.last.at)}</span>
              {#if convo.unread}
                <span class="mn-badge">{convo.unread}</span>
              {/if}
            </span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}

  {#if others.length}
    <p class="lp-eyebrow">
      {conversations.length ? "Message someone else" : "Message the crew"}
    </p>
    <ul class="mn-crew mn-inbox">
      {#each others as member (member.id)}
        <li>
          <button type="button" on:click={() => dispatch("open", member.id)}>
            <span class="art" class:away={member.away}>
              <svelte:component
                this={vehicles[member.type]}
                size="40px"
                bodyColor={member.colour}
                outlineColor="#ffffff"
                wheelColor="#15261C"
                loadColor="#F7DB5C"
              />
              {#if member.online}<i aria-label="On the map now"></i>{/if}
            </span>
            <span class="who">
              <strong>{member.name}{member.guest ? " (guest)" : ""}</strong>
              <span class="doing">{member.doing}</span>
            </span>
          </button>
        </li>
      {/each}
    </ul>
  {:else if !conversations.length}
    <p class="mn-empty">
      Nobody else has joined this farm yet. Once the crew is on, you can message
      any of them from here.
    </p>
  {/if}
{/if}
