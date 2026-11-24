<script lang="ts">
  /**
   * The crew, a short row each: two lines beside a small picture of the
   * machine, so a phone shows a good many at once. An account is usually a
   * machine ("H3", "Wheels") that people take turns in, so the name is
   * whoever is in it now (the driver they picked), when that is known, with
   * the account's name small after it. The second line is what they are
   * doing (the trailing badge when a trail is being laid) and the paddock
   * they are in; their speed sits at the end of the first. Your own machine
   * is first, with who is driving to change and Home beside it. Tapping a
   * row finds them on the map; the button beside it opens their messages.
   *
   * Whoever is on the map now (or laying a trail) sits on a light blue
   * shade; someone laying a trail also carries a badge in the colour the
   * trail is being laid in. The list keeps a steady order (the engine
   * decides it) so rows don't jump about.
   */
  import { createEventDispatcher } from "svelte"
  import {
    Home,
    MapPin,
    MessageCircle,
    UserPlus,
    UserRound,
  } from "lucide-svelte"
  import vehicles from "$lib/vehicles"
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
  /** Offer, on your own row, to change who is driving. */
  export let canDrive = false

  const dispatch = createEventDispatcher<{
    look: string
    message: string
    invite: void
    /** Back to the view the map opens on. */
    home: void
    /** Change who is driving (the names menu). */
    driver: void
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
  {#if !self}
    <!-- (Not on the map yet: Home still has a row.) -->
    <li>
      <button type="button" class="invite" on:click={() => dispatch("home")}>
        <span class="art"><Home size={19} /></span>
        <span class="who">
          <strong>Home</strong>
          <span class="doing">Back to the farm</span>
        </span>
      </button>
    </li>
  {/if}
  {#each rows as person (person.id)}
    {@const said = named(person)}
    <li>
      <button
        type="button"
        class:live={person.trailing || (person.online && !person.me)}
        disabled={!person.placed}
        on:click={() => dispatch("look", person.id)}
      >
        <span class="art" class:away={person.away}>
          <svelte:component
            this={vehicles[person.type]}
            size="30px"
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
          <span class="line">
            <strong>{said.head}</strong>
            {#if said.over}
              <span class="acct" title={said.over}>{said.over}</span>
            {/if}
            {#if person.guest}
              <em class="guest">Guest</em>
            {/if}
            {#if person.speed > 0}
              <span class="pace">{Math.round(person.speed)} km/h</span>
            {/if}
          </span>
          <span class="line">
            {#if person.trailing}
              <span
                class="job on"
                style="background: {person.colour}; color: {onColour(
                  person.colour,
                )}"
              >
                <i></i>Trailing
              </span>
            {:else}
              <span class="doing">{person.action}</span>
            {/if}
            {#if person.where}
              <span class="place"><MapPin size={11} />{person.where}</span>
            {/if}
            <!-- (Your own job is on the chip at the top of the map.) -->
            {#if person.operation && !person.me}
              <span class="job">{person.operation}</span>
            {/if}
          </span>
        </span>
      </button>
      {#if person.me}
        {#if canDrive}
          <button
            type="button"
            class="msg"
            aria-label="Change who's driving{selfDriver
              ? ` (now ${selfDriver})`
              : ''}"
            title="Change who's driving"
            on:click={() => dispatch("driver")}
          >
            <UserRound size={19} />
          </button>
        {/if}
        <button
          type="button"
          class="msg home"
          aria-label="Home: back to the farm"
          title="Home: back to the farm"
          on:click={() => dispatch("home")}
        >
          <Home size={19} />
        </button>
      {:else}
        <button
          type="button"
          class="msg"
          aria-label="Message {person.name}{unreadBy[person.id]
            ? `, ${unreadBy[person.id]} unread`
            : ''}"
          on:click={() => dispatch("message", person.id)}
        >
          <MessageCircle size={19} />
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
        <span class="art"><UserPlus size={19} /></span>
        <span class="who">
          <strong>Invite someone</strong>
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
