<script lang="ts">
  /**
   * The crew, one row each: their machine, what they are doing and how far
   * off they are. Tapping a row finds them on the map; the button beside it
   * opens their messages.
   */
  import { createEventDispatcher } from "svelte"
  import { MessageCircle } from "lucide-svelte"
  import vehicles from "$lib/vehicles"
  import { formatDistance } from "$lib/components/mapnext/format"
  import type { CrewRow } from "./liveEngine"

  export let crew: CrewRow[] = []
  /** Messages not yet opened, by who sent them. */
  export let unreadBy: Record<string, number> = {}

  const dispatch = createEventDispatcher<{ look: string; message: string }>()
</script>

<ul class="mn-crew">
  {#each crew as person (person.id)}
    <li>
      <button
        type="button"
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
          {#if person.online}<i aria-label="On the map now"></i>{/if}
        </span>
        <span class="who">
          <strong>{person.name}{person.guest ? " (guest)" : ""}</strong>
          <span class="doing">{person.doing}</span>
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
    </li>
  {/each}
</ul>
