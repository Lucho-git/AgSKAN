<script lang="ts">
  /**
   * The crew, one row each: their machine, what they are doing, the job they
   * are on, and how far off they are. Your own machine is first. Tapping a
   * row finds them on the map; the button beside it opens their messages.
   *
   * Someone laying a trail is marked in green, and the list keeps a steady
   * order (the engine decides it) so rows don't jump about.
   */
  import { createEventDispatcher } from "svelte"
  import { MessageCircle, UserPlus } from "lucide-svelte"
  import vehicles from "$lib/vehicles"
  import { formatDistance } from "$lib/components/mapnext/format"
  import type { CrewRow } from "./liveEngine"

  export let crew: CrewRow[] = []
  /** The viewer's own row, once they are on the map. */
  export let self: CrewRow | null = null
  /** Messages not yet opened, by who sent them. */
  export let unreadBy: Record<string, number> = {}
  /** Leave out anyone not heard from in ten days. */
  export let hideStale = false
  /** Offer an "Invite" row at the end. */
  export let canInvite = false

  const dispatch = createEventDispatcher<{
    look: string
    message: string
    invite: void
  }>()

  const STALE = 10 * 86_400_000
  $: stale = crew.filter(
    (person) =>
      !person.online && (!person.seen || Date.now() - person.seen > STALE),
  )
  $: shown = hideStale ? crew.filter((person) => !stale.includes(person)) : crew
  $: rows = self ? [self, ...shown] : shown
</script>

<ul class="mn-crew">
  {#each rows as person (person.id)}
    <li>
      <button
        type="button"
        class:trailing={person.trailing}
        disabled={!person.placed}
        on:click={() => dispatch("look", person.id)}
      >
        <span class="art" class:away={person.away}>
          <svelte:component
            this={vehicles[person.type]}
            size="40px"
            bodyColor={person.colour}
            outlineColor="#ffffff"
            wheelColor="#15261C"
            loadColor="#F7DB5C"
          />
          {#if person.online && !person.me}
            <i aria-label="On the map now"></i>
          {/if}
        </span>
        <span class="who">
          <strong>{person.name}{person.guest ? " (guest)" : ""}</strong>
          <span class="doing">{person.doing}</span>
          {#if person.trailing}
            <span class="job on">
              <i></i>Trailing{person.operation ? ` · ${person.operation}` : ""}
            </span>
          {:else if person.operation}
            <span class="job">{person.operation}</span>
          {/if}
        </span>
        <span class="where">
          {#if person.distance !== null}
            <span class="far">{formatDistance(person.distance)}</span>
          {/if}
          {#if person.speed > 0}
            <span class="pace">{person.speed} km/h</span>
          {/if}
        </span>
      </button>
      {#if !person.me}
        <button
          type="button"
          class="msg"
          aria-label="Message {person.name}{unreadBy[person.id]
            ? `, ${unreadBy[person.id]} unread`
            : ''}"
          on:click={() => dispatch("message", person.id)}
        >
          <MessageCircle size={20} />
          {#if unreadBy[person.id]}
            <span class="mn-badge">{unreadBy[person.id]}</span>
          {/if}
        </button>
      {/if}
    </li>
  {/each}
  {#if canInvite}
    <li>
      <button type="button" class="invite" on:click={() => dispatch("invite")}>
        <span class="art"><UserPlus size={22} /></span>
        <span class="who">
          <strong>Invite someone</strong>
          <span class="doing">Send a link that lets them onto this map</span>
        </span>
      </button>
    </li>
  {/if}
</ul>

{#if hideStale && stale.length}
  <p class="mn-note">
    {stale.length} not seen in 10 days {stale.length === 1 ? "is" : "are"} hidden.
  </p>
{/if}
