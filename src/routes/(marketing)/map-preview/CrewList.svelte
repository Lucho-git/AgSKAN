<script lang="ts">
  /** Who else is on the map, what they're doing and how far away they are. */
  import { createEventDispatcher } from "svelte"
  import vehicles from "$lib/vehicles"
  import { machineById } from "./farm"
  import { formatDistance } from "./format"
  import type { CrewRow } from "./engine"

  export let crew: CrewRow[] = []

  const dispatch = createEventDispatcher<{ look: string }>()
</script>

<ul class="mv-crew">
  {#each crew as person (person.id)}
    <li>
      <button type="button" on:click={() => dispatch("look", person.id)}>
        <span class="art">
          <svelte:component
            this={vehicles[machineById(person.machine).name]}
            size="40px"
            bodyColor={person.colour}
            outlineColor="#ffffff"
            wheelColor="#15261C"
            loadColor="#F7DB5C"
          />
        </span>
        <span class="who">
          <strong>{person.name}</strong>
          <span class="doing">{person.doing}</span>
        </span>
        <span class="where">
          {#if person.distance !== null}
            <span class="far">{formatDistance(person.distance)}</span>
          {/if}
          <span class="pace" class:still={person.speed === 0}>
            {person.speed === 0 ? "stopped" : `${person.speed} km/h`}
          </span>
        </span>
      </button>
    </li>
  {/each}
</ul>

<style>
  .mv-crew {
    display: grid;
    gap: 0.35rem;
  }
  button {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    width: 100%;
    min-height: 3.5rem;
    padding: 0.35rem 0.7rem 0.35rem 0.4rem;
    border: 1.5px solid var(--lp-line);
    border-radius: 1rem;
    background: var(--lp-paper);
    color: var(--lp-ink);
    text-align: left;
    transition: border-color 0.2s ease;
  }
  button:hover,
  button:focus-visible {
    border-color: var(--lp-ink);
    outline: none;
  }
  .art {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border-radius: 0.8rem;
    background: #cdbd92;
  }
  .who {
    display: grid;
    flex: 1;
    min-width: 0;
    gap: 0.1rem;
  }
  .who strong {
    font-size: 1rem;
    font-weight: 700;
    line-height: 1.15;
  }
  .doing {
    overflow: hidden;
    font-size: 0.85rem;
    line-height: 1.25;
    color: var(--lp-ink-soft);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .where {
    display: grid;
    flex-shrink: 0;
    gap: 0.15rem;
    justify-items: end;
  }
  .far,
  .pace {
    font-family: var(--lp-mono);
    font-size: 0.72rem;
    letter-spacing: 0.04em;
    line-height: 1.2;
  }
  .far {
    font-weight: 700;
  }
  .pace {
    color: var(--lp-accent-text);
  }
  .pace.still {
    color: var(--lp-ink-faint);
  }
</style>
