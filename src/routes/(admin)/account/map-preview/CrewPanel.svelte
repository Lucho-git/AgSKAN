<script lang="ts">
  /**
   * The crew and the farm's log, as two tabs with the list under them. It
   * sits under the tools on a tablet's rail, and is a card of its own over
   * the map on a phone (where it can be closed).
   */
  import { createEventDispatcher } from "svelte"
  import { ScrollText, Settings, Users, X } from "lucide-svelte"
  import CrewRows from "./CrewRows.svelte"
  import FarmLog, { type LogUndo } from "./FarmLog.svelte"
  import type { LngLat } from "$lib/components/mapnext/geo"
  import type { CrewRow } from "./liveEngine"

  export let crew: CrewRow[] = []
  export let self: CrewRow | null = null
  export let selfDriver = ""
  export let unreadBy: Record<string, number> = {}
  export let hideStale = false
  export let guest = false
  export let mapId = ""
  /** Put back (or redo) what a row of the log did. */
  export let undoLog: (what: LogUndo) => Promise<boolean> = async () => false
  /** Which side is showing. */
  export let tab: "crew" | "log" = "crew"
  /** A card of its own: it gets a close button. */
  export let closable = false

  const dispatch = createEventDispatcher<{
    look: string
    message: string
    invite: void
    settings: void
    close: void
    lookPlace: LngLat
    logCrew: string
    logTrail: { id: string; operation: string }
  }>()

  $: online = crew.filter((person) => person.online).length
</script>

<div class="mn-crew-head">
  <div class="mn-tabs" role="tablist" aria-label="Crew and log">
    <button
      type="button"
      role="tab"
      aria-selected={tab === "crew"}
      on:click={() => (tab = "crew")}
    >
      <Users size={15} /> Crew
      {#if online}<b>{online}</b>{/if}
    </button>
    <button
      type="button"
      role="tab"
      aria-selected={tab === "log"}
      on:click={() => (tab = "log")}
    >
      <ScrollText size={15} /> Log
    </button>
  </div>
  <span class="ends">
    {#if !guest}
      <button
        type="button"
        class="mn-icon-button"
        aria-label="Crew settings"
        on:click={() => dispatch("settings")}
      >
        <Settings size={20} />
      </button>
    {/if}
    {#if closable}
      <button
        type="button"
        class="mn-icon-button"
        aria-label="Close"
        on:click={() => dispatch("close")}
      >
        <X size={22} />
      </button>
    {/if}
  </span>
</div>
{#if tab === "log" && mapId}
  <FarmLog
    {mapId}
    {guest}
    undo={undoLog}
    on:look={(e) => dispatch("lookPlace", e.detail)}
    on:crew={(e) => dispatch("logCrew", e.detail)}
    on:trail={(e) => dispatch("logTrail", e.detail)}
  />
{:else if crew.length || self || !guest}
  <CrewRows
    {crew}
    {self}
    {selfDriver}
    {unreadBy}
    {hideStale}
    canInvite={!guest}
    on:look={(e) => dispatch("look", e.detail)}
    on:message={(e) => dispatch("message", e.detail)}
    on:invite={() => dispatch("invite")}
  />
{:else}
  <p class="mn-empty">
    Nobody else has joined this farm yet. Invite the crew from the dashboard and
    they'll show up here.
  </p>
{/if}

<style>
  .ends {
    display: flex;
    align-items: center;
    gap: 2px;
  }
</style>
