<script lang="ts">
  /**
   * The crew, one row each. An account is usually a machine ("H3",
   * "Wheels") that people take turns in, so its name sits over the machine's
   * picture and the name beside it is whoever is in it now (the driver they
   * picked), when that is known. Then what they are doing, the job they are
   * on, and how far off they are. Your own machine is first. Tapping a row
   * finds them on the map; the button beside it opens their messages.
   *
   * Whoever is on the map now (or laying a trail) sits on a light blue
   * shade; someone laying a trail also carries a badge in the colour the
   * trail is being laid in. The list keeps a steady order (the engine
   * decides it) so rows don't jump about.
   */
  import { createEventDispatcher } from "svelte"
  import { MessageCircle, UserPlus } from "lucide-svelte"
  import vehicles from "$lib/vehicles"
  import { formatDistance } from "$lib/components/mapnext/format"
  import type { CrewRow } from "./liveEngine"

  export let crew: CrewRow[] = []
  /** The viewer's own row, once they are on the map. */
  export let self: CrewRow | null = null
  /** Who the viewer is driving as, if they have picked. */
  export let selfDriver = ""
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

  /**
   * The two names on a row: `head` beside the machine, `over` on top of it.
   * With a driver known that is the driver and the account; otherwise just
   * the account. (An account named for its own driver, "Mick Harris" driven
   * by "Mick", is said once.)
   */
  $: named = (person: CrewRow) => {
    const account = person.name.trim()
    const driver = (person.me ? selfDriver : (person.driver ?? "")).trim()
    const a = account.toLowerCase()
    const d = driver.toLowerCase()
    return driver && !a.startsWith(d) && !d.startsWith(a)
      ? { head: driver, over: account }
      : { head: account, over: "" }
  }

  /** Ink or white, whichever reads on a colour. */
  function onColour(hex: string) {
    const n = parseInt(hex.replace("#", "").slice(0, 6), 16)
    if (Number.isNaN(n)) return "#ffffff"
    const bright =
      (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
    return bright > 0.6 ? "#15261c" : "#ffffff"
  }
</script>

<ul class="mn-crew">
  {#each rows as person (person.id)}
    {@const said = named(person)}
    <li>
      <button
        type="button"
        class:live={person.trailing || (person.online && !person.me)}
        disabled={!person.placed}
        on:click={() => dispatch("look", person.id)}
      >
        <span class="unit">
          {#if said.over}
            <b class="acct" title={said.over}>{said.over}</b>
          {/if}
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
        </span>
        <span class="who">
          <span class="line">
            <strong>{said.head}</strong>
            {#if person.guest}
              <em class="guest">Guest</em>
            {/if}
            {#if person.distance !== null}
              <span class="far">{formatDistance(person.distance)}</span>
            {/if}
          </span>
          <span class="line">
            <span class="doing">{person.doing}</span>
            {#if person.speed > 0}
              <span class="pace">{person.speed} km/h</span>
            {/if}
          </span>
          {#if person.trailing}
            <span
              class="job on"
              style="background: {person.colour}; color: {onColour(
                person.colour,
              )}"
            >
              <i></i>Trailing{person.operation ? ` · ${person.operation}` : ""}
            </span>
          {:else if person.operation}
            <span class="job">{person.operation}</span>
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
        <span class="unit">
          <span class="art"><UserPlus size={22} /></span>
        </span>
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
