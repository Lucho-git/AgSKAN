<script lang="ts">
  /**
   * The toolbox: one panel for everything that isn't the map. It opens on a
   * grid of tools, each a tile saying what it is set to; a tool takes over
   * the panel and has a way back. New tools are new tiles, so the grid grows
   * across as well as down. A side rail on a cab tablet, a pull-up sheet on
   * a phone.
   */
  import { createEventDispatcher } from "svelte"
  import {
    ArrowLeft,
    ChevronRight,
    LandPlot,
    Layers,
    LocateFixed,
    Map as MapIcon,
    MapPinned,
    MessageCircle,
    Play,
    RadioTower,
    Route,
    Ruler,
    Search,
    UserRound,
    Users,
    X,
  } from "lucide-svelte"
  import vehicles from "$lib/vehicles"
  import MachinePicker from "$lib/components/mapnext/MachinePicker.svelte"
  import PinArt from "$lib/components/mapnext/PinArt.svelte"
  import { machineFor } from "$lib/components/mapnext/machines"
  import { drawColour } from "$lib/components/mapnext/palette"
  import { formatDistance, formatHa } from "$lib/components/mapnext/format"
  import type { PinChoice, PinLook } from "$lib/components/mapnext/pins"
  import type {
    BaseChoice,
    CrewRow,
    Loading,
    Operation,
    ToolView,
  } from "./liveEngine"
  import {
    flashLabel,
    type FarmChoice,
    type Flash,
    type Paddock,
    type TrailInfo,
    type VehicleMarkerData,
  } from "./liveData"
  import type { RecorderState } from "./recorder"

  export let view: ToolView = "home"
  export let wide = false
  export let status: { tone: string; text: string }
  export let marker: VehicleMarkerData
  export let recording: RecorderState
  export let guest = false
  export let hasFix = false
  export let crew: CrewRow[] = []
  /** Who the trail is signed by, if anyone is set. */
  export let driver = ""
  export let pinChoices: PinChoice[] = []
  export let pinKind = "default"
  /** How a pin of a kind looks when this person drops one (their colours). */
  export let choiceLook: (iconClass: string) => PinLook = (iconClass) => ({
    iconClass,
  })
  export let pinCount = 0
  export let operations: Operation[] = []
  export let operation: Operation | null = null
  export let trails: TrailInfo[] = []
  /** The trail picked out on the map, if any. */
  export let pickedTrail: string | null = null
  export let loading: Loading
  export let paddocks: Paddock[] = []
  export let pickedPaddock: string | null = null
  export let base = "satellite"
  export let baseChoices: BaseChoice[] = []
  /** Layer switches, by the keys the current viewer saves. */
  export let layers: Record<string, boolean> = {}
  export let broadcastChoices: {
    reason: string
    label: string
    colour: string
  }[] = []
  export let broadcast: Flash | null = null
  export let farmName = ""
  export let farmOwner = ""
  export let isOwner = false
  export let farm: { paddocks: number; ha: number } = { paddocks: 0, ha: 0 }
  export let farms: FarmChoice[] = []
  export let currentFarmId = ""
  /** Messages this person hasn't opened. */
  export let unread = 0
  /** Who the open conversation is with (their name), if one is open. */
  export let messageWith = ""

  const dispatch = createEventDispatcher<{
    close: void
    locate: void
    machine: { type: string; colour: string; swath: number }
    lookCrew: string
    pinKind: string
    dropPins: void
    operation: Operation
    lookTrail: string
    replayTrail: string
    lookPaddock: string
    base: string
    layer: { key: string; on: boolean }
    measure: void
    broadcast: { reason: string; colour: string }
    stopBroadcast: void
    driver: void
    fitFarm: void
    farm: string
    leave: "dashboard" | "viewer"
    messagesBack: void
  }>()

  $: machine = machineFor(marker.type)
  $: colour = drawColour(marker.bodyColor)
  $: trailOn = recording.phase === "on" || recording.phase === "stopping"
  $: online = crew.filter((person) => person.online).length
  $: pinLabelNow =
    pinChoices.find((choice) => choice.iconClass === pinKind)?.label ?? "Pin"
  $: baseLabel = baseChoices.find((choice) => choice.key === base)?.label ?? ""
  $: otherFarms = farms.filter((choice) => choice.id !== currentFarmId)
  $: hidden = LAYERS.filter(
    (layer) => !layer.extra && layers[layer.key] === false,
  ).length

  const TITLES: Record<ToolView, string> = {
    home: "",
    messages: "Messages",
    crew: "Crew",
    machine: "Your machine",
    pins: "Pins",
    trails: "Trails",
    paddocks: "Paddocks",
    map: "Map",
    layers: "Layers",
    broadcast: "Broadcast",
    farm: "Farm",
  }

  /**
   * What can be shown and hidden; the indented ones belong to the one above.
   * An `extra` is off unless it has been switched on.
   */
  const LAYERS: {
    key: string
    label: string
    part?: boolean
    extra?: boolean
  }[] = [
    { key: "fields", label: "Paddocks" },
    { key: "fieldLabels", label: "Paddock names", part: true },
    { key: "fieldHectares", label: "Hectares", part: true },
    { key: "markers", label: "Pins" },
    { key: "markerLabels", label: "Pin notes", part: true },
    { key: "vehicles", label: "Crew machines" },
    { key: "vehicleLabels", label: "Name tags", part: true },
    { key: "historicalTrails", label: "Finished trails" },
    { key: "activeTrails", label: "Trails being laid" },
    { key: "trailArrows", label: "Direction arrows on trails", extra: true },
  ]

  // ── Paddock list ──
  let paddockSearch = ""
  $: wanted = paddockSearch.trim().toLowerCase()
  $: found = wanted
    ? paddocks.filter((p) => p.name.toLowerCase().includes(wanted))
    : paddocks
  $: paddockGroups = groupByFarm(found)
  function groupByFarm(list: Paddock[]) {
    const groups = new Map<string, Paddock[]>()
    for (const paddock of list) {
      const key = paddock.farm ?? ""
      groups.set(key, [...(groups.get(key) ?? []), paddock])
    }
    return [...groups.entries()]
      .map(([name, items]) => ({
        name,
        items: items.sort((a, b) => a.name.localeCompare(b.name)),
        ha: items.reduce((sum, p) => sum + p.ha, 0),
      }))
      .sort((a, b) => b.items.length - a.items.length)
  }

  const day = (t: number) =>
    new Date(t).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
    })
  const clock = (t: number) =>
    new Date(t).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    })

  const SWATCH: Record<string, string> = {
    satellite:
      "linear-gradient(135deg, #4c5a3d 0%, #6f6a44 38%, #8a7a4f 62%, #57633f 100%)",
    paper:
      "repeating-linear-gradient(115deg, transparent 0 13px, rgba(21,38,28,0.14) 13px 14px), linear-gradient(135deg, #e6dec2, #e0c766 55%, #a9be7a)",
    dark: "radial-gradient(circle at 30% 38%, #f472b6 0 9%, transparent 10%), radial-gradient(circle at 62% 58%, #38bdf8 0 12%, transparent 13%), radial-gradient(circle at 74% 28%, #fbbf24 0 6%, transparent 7%), linear-gradient(135deg, #333332 0 62%, #19191a 62%)",
    google_satellite:
      "linear-gradient(135deg, #3f5a45 0%, #7a744c 45%, #9a8a5c 70%, #4d6146 100%)",
    bing_aerial:
      "linear-gradient(135deg, #55604a 0%, #7d7350 40%, #6c6a4a 70%, #46553f 100%)",
  }
</script>

<aside
  class="mn-panel"
  class:chat={view === "messages" && !!messageWith}
  aria-label="Toolbox"
>
  {#if view === "home"}
    <header class="mn-panel-head">
      <span class="mark"
        ><img src="/images/logo.svg" alt="" width="30" height="30" /></span
      >
      <span class="word">{farmName || "AgSKAN"}</span>
      {#if wide}
        <button
          type="button"
          class="mn-status {status.tone}"
          disabled={status.tone !== "off"}
          on:click={() => dispatch("locate")}
        >
          <span class="dot"></span>{status.text}
        </button>
      {:else}
        <button
          type="button"
          class="mn-icon-button"
          aria-label="Close"
          on:click={() => dispatch("close")}
        >
          <X size={22} />
        </button>
      {/if}
    </header>

    <nav class="mn-grid" aria-label="Tools">
      <button type="button" class="mn-tile" on:click={() => (view = "crew")}>
        <span class="icon"><Users size={24} /></span>
        <strong>Crew</strong>
        <small>{online} on now</small>
      </button>
      <button
        type="button"
        class="mn-tile"
        on:click={() => (view = "messages")}
      >
        {#if unread}<span class="mn-badge">{unread}</span>{/if}
        <span class="icon"><MessageCircle size={24} /></span>
        <strong>Messages</strong>
        <small>{unread ? `${unread} new` : "talk to the crew"}</small>
      </button>
      {#if !guest}
        <button
          type="button"
          class="mn-tile"
          on:click={() => (view = "machine")}
        >
          <span class="icon art">
            <svelte:component
              this={vehicles[machine.type]}
              size="34px"
              bodyColor={colour}
              outlineColor="#ffffff"
              wheelColor="#15261C"
              loadColor="#F7DB5C"
            />
          </span>
          <strong>Machine</strong>
          <small>{marker.swath} m wide</small>
        </button>
        <button type="button" class="mn-tile" on:click={() => (view = "pins")}>
          <span class="icon"
            ><PinArt look={choiceLook(pinKind)} size={32} /></span
          >
          <strong>Pins</strong>
          <small>{pinCount} here</small>
        </button>
      {/if}
      <button type="button" class="mn-tile" on:click={() => (view = "trails")}>
        <span class="icon"><Route size={24} /></span>
        <strong>Trails</strong>
        <small>
          {#if loading.trails}
            loading…
          {:else if operation}
            {trails.length} in {operation.name}
          {:else}
            no job yet
          {/if}
        </small>
      </button>
      <button
        type="button"
        class="mn-tile"
        on:click={() => (view = "paddocks")}
      >
        <span class="icon"><LandPlot size={24} /></span>
        <strong>Paddocks</strong>
        <small>{paddocks.length} · {formatHa(farm.ha)} ha</small>
      </button>
      {#if !guest}
        <button
          type="button"
          class="mn-tile"
          class:on={!!broadcast}
          style={broadcast ? `--on: ${broadcast.colour}` : ""}
          on:click={() => (view = "broadcast")}
        >
          <span class="icon"><RadioTower size={24} /></span>
          <strong>Broadcast</strong>
          <small>{broadcast ? flashLabel(broadcast) : "Full, help…"}</small>
        </button>
      {/if}
      <button
        type="button"
        class="mn-tile"
        on:click={() => dispatch("measure")}
      >
        <span class="icon"><Ruler size={24} /></span>
        <strong>Measure</strong>
        <small>distance, area</small>
      </button>
      <button type="button" class="mn-tile" on:click={() => (view = "map")}>
        <span class="icon"><MapIcon size={24} /></span>
        <strong>Map</strong>
        <small>{baseLabel}</small>
      </button>
      <button type="button" class="mn-tile" on:click={() => (view = "layers")}>
        <span class="icon"><Layers size={24} /></span>
        <strong>Layers</strong>
        <small>{hidden ? `${hidden} hidden` : "all showing"}</small>
      </button>
      {#if !guest}
        <button
          type="button"
          class="mn-tile"
          on:click={() => dispatch("driver")}
        >
          <span class="icon"><UserRound size={24} /></span>
          <strong>Driver</strong>
          <small>{driver || "not set"}</small>
        </button>
      {/if}
      <button type="button" class="mn-tile" on:click={() => (view = "farm")}>
        <span class="icon"><MapPinned size={24} /></span>
        <strong>Farm</strong>
        <small>{isOwner ? "yours" : farmOwner}</small>
      </button>
    </nav>

    <footer class="mn-panel-foot">
      <p>
        Map data ©
        <a
          href="https://www.mapbox.com/about/maps/"
          target="_blank"
          rel="noreferrer">Mapbox</a
        >
        ©
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer">OpenStreetMap</a
        > · imagery © Maxar
      </p>
    </footer>
  {:else}
    <header class="mn-panel-head">
      <button
        type="button"
        class="mn-icon-button back"
        aria-label={view === "messages" && messageWith
          ? "Back to all messages"
          : "Back to the tools"}
        on:click={() =>
          view === "messages" && messageWith
            ? dispatch("messagesBack")
            : (view = "home")}
      >
        <ArrowLeft size={22} />
      </button>
      <h2>{view === "messages" && messageWith ? messageWith : TITLES[view]}</h2>
      {#if !wide}
        <button
          type="button"
          class="mn-icon-button"
          aria-label="Close"
          on:click={() => dispatch("close")}
        >
          <X size={22} />
        </button>
      {/if}
    </header>

    {#if view === "messages"}
      <slot name="messages" />
    {:else if view === "crew"}
      <p class="lp-eyebrow">{online} on the map now · {crew.length} in all</p>
      {#if crew.length}
        <ul class="mn-crew">
          {#each crew as person (person.id)}
            <li>
              <button
                type="button"
                disabled={!person.placed}
                on:click={() => dispatch("lookCrew", person.id)}
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
            </li>
          {/each}
        </ul>
      {:else}
        <p class="mn-empty">
          Nobody else has joined this farm yet. Invite the crew from the
          dashboard and they'll show up here.
        </p>
      {/if}
    {:else if view === "machine"}
      {#if trailOn || recording.phase === "found"}
        <p class="mn-warning">
          A trail keeps the machine, colour and width it started with. Stop the
          trail to change them.
        </p>
      {:else}
        <MachinePicker
          type={marker.type}
          colour={marker.bodyColor}
          swath={marker.swath}
          on:change={(e) => dispatch("machine", e.detail)}
        />
      {/if}
    {:else if view === "pins"}
      <p class="mn-note">
        {pinCount}
        {pinCount === 1 ? "pin" : "pins"} on this farm. Choose what you drop, then
        tap the map. Tap any pin to change it, move it or remove it.
      </p>
      <button
        type="button"
        class="lp-btn lp-btn-primary"
        on:click={() => dispatch("dropPins")}
      >
        Drop {pinLabelNow.toLowerCase()} pins
      </button>
      <div class="mn-kinds all" style="margin: 0; padding: 0">
        {#each pinChoices as choice (choice.iconClass)}
          <button
            type="button"
            class="mn-kind"
            class:selected={pinKind === choice.iconClass}
            aria-pressed={pinKind === choice.iconClass}
            on:click={() => dispatch("pinKind", choice.iconClass)}
          >
            <PinArt look={choiceLook(choice.iconClass)} size={36} />
            {choice.label}
          </button>
        {/each}
      </div>
    {:else if view === "trails"}
      <section class="mn-section">
        <p class="lp-eyebrow">Job on the map</p>
        {#if operations.length}
          {#if trailOn}
            <p class="mn-note">Stop your trail to look at a different job.</p>
          {/if}
          <div class="mn-tools">
            {#each operations as option (option.id)}
              <button
                type="button"
                class="mn-tool"
                class:selected={operation?.id === option.id}
                disabled={trailOn && operation?.id !== option.id}
                aria-pressed={operation?.id === option.id}
                on:click={() => dispatch("operation", option)}
              >
                <span class="text">
                  <strong>{option.name}</strong>
                  {#if option.year}<span>{option.year}</span>{/if}
                </span>
                {#if operation?.id === option.id}
                  <span class="figure">ON SHOW</span>
                {/if}
              </button>
            {/each}
          </div>
        {:else}
          <p class="mn-empty">
            This farm has no jobs yet. Add one (Spraying, Seeding, Harvest…)
            from the dashboard and its trails show up here.
          </p>
        {/if}
      </section>

      {#if operation}
        <section class="mn-section">
          {#if trails.length}
            <p class="mn-note">
              Tap a trail to pick it out on the map, or the play button to watch
              it being laid.
            </p>
          {/if}
          <p class="lp-eyebrow">
            {#if loading.trails}
              Loading trails · {loading.trails.done} drawn
            {:else}
              {trails.length}
              {trails.length === 1 ? "trail" : "trails"} in {operation.name}
            {/if}
          </p>
          {#if trails.length}
            <div class="mn-tools">
              {#each trails.slice(0, 60) as trail (trail.id)}
                <div class="mn-trail-row">
                  <button
                    type="button"
                    class="mn-tool"
                    class:selected={pickedTrail === trail.id}
                    on:click={() => dispatch("lookTrail", trail.id)}
                  >
                    <span
                      class="swatch"
                      style="background: {drawColour(trail.colour)}"
                    ></span>
                    <span class="text">
                      <strong>{day(trail.start)} · {clock(trail.start)}</strong>
                      <span
                        >{trail.operator || "No operator"} · {trail.width} m wide</span
                      >
                    </span>
                    {#if trail.ha !== null}
                      <span class="figure">{formatHa(trail.ha)} ha</span>
                    {/if}
                  </button>
                  <button
                    type="button"
                    class="play"
                    aria-label="Replay this trail"
                    on:click={() => dispatch("replayTrail", trail.id)}
                  >
                    <Play size={18} fill="currentColor" />
                  </button>
                </div>
              {/each}
            </div>
            {#if trails.length > 60}
              <p class="mn-note">
                Showing the latest 60. All {trails.length} are drawn on the map.
              </p>
            {/if}
          {:else if !loading.trails}
            <p class="mn-empty">No trails recorded in this job yet.</p>
          {/if}
        </section>
      {/if}
    {:else if view === "paddocks"}
      <label class="mn-search">
        <Search size={18} />
        <input
          type="search"
          bind:value={paddockSearch}
          placeholder="Find a paddock"
          autocomplete="off"
        />
      </label>
      {#if !found.length}
        <p class="mn-empty">
          {paddocks.length
            ? "No paddock by that name."
            : "This farm has no paddocks yet. Add them from the dashboard."}
        </p>
      {/if}
      {#each paddockGroups as group (group.name)}
        <section class="mn-section">
          <p class="lp-eyebrow">
            {group.name || (paddockGroups.length > 1 ? "No farm" : "Paddocks")} ·
            {group.items.length} · {formatHa(group.ha)} ha
          </p>
          <div class="mn-tools">
            {#each group.items as paddock (paddock.id)}
              <button
                type="button"
                class="mn-tool"
                class:selected={pickedPaddock === paddock.id}
                on:click={() => dispatch("lookPaddock", paddock.id)}
              >
                <span
                  class="swatch block"
                  style="background: {paddock.colour ?? 'var(--lp-paper-2)'}"
                ></span>
                <span class="text">
                  <strong>{paddock.name}</strong>
                  {#if paddock.crop}<span>{paddock.crop}</span>{/if}
                </span>
                <span class="figure">{formatHa(paddock.ha)} ha</span>
              </button>
            {/each}
          </div>
        </section>
      {/each}
    {:else if view === "map"}
      <div class="mn-looks">
        {#each baseChoices as choice (choice.key)}
          <button
            type="button"
            class="mn-look"
            class:selected={base === choice.key}
            aria-pressed={base === choice.key}
            on:click={() => dispatch("base", choice.key)}
          >
            <span
              class="swatch"
              style="background: {SWATCH[choice.key] ?? SWATCH.satellite}"
            ></span>
            <span>{choice.label}<small>{choice.note}</small></span>
          </button>
        {/each}
      </div>
      <button
        type="button"
        class="lp-btn lp-btn-ghost"
        on:click={() => dispatch("fitFarm")}
      >
        <LocateFixed size={18} /> Show the whole farm
      </button>
    {:else if view === "layers"}
      <p class="mn-note">
        What the map shows. These are the same switches as the current viewer's,
        and a choice made on either holds on both.
      </p>
      <div class="mn-switches">
        {#each LAYERS as layer (layer.key)}
          {@const on = layer.extra
            ? layers[layer.key] === true
            : layers[layer.key] !== false}
          <button
            type="button"
            class="mn-switch"
            class:part={layer.part}
            role="switch"
            aria-checked={on}
            on:click={() => dispatch("layer", { key: layer.key, on: !on })}
          >
            <span>{layer.label}</span>
            <i></i>
          </button>
        {/each}
      </div>
    {:else if view === "broadcast"}
      {#if broadcast}
        <section class="mn-you">
          <p class="lp-eyebrow">On the crew's maps now</p>
          <p class="mn-live" style="--on: {broadcast.colour}">
            <i></i>{flashLabel(broadcast)}
          </p>
          <p class="mn-note">
            It flashes on your machine for five minutes, then stops by itself.
          </p>
          <button
            type="button"
            class="mn-stop-trail"
            on:click={() => dispatch("stopBroadcast")}
          >
            <i></i> Stop broadcasting
          </button>
        </section>
      {:else}
        <p class="mn-note">
          Flash a word on your machine for the whole crew: on their maps and as
          a notice. It runs five minutes or until you stop it.
        </p>
        {#if !hasFix}
          <p class="mn-warning">
            A broadcast needs your location first, so the crew can see where you
            are.
          </p>
        {/if}
        <div class="mn-casts">
          {#each broadcastChoices as choice (choice.reason)}
            <button
              type="button"
              class="mn-cast"
              style="--on: {choice.colour}"
              disabled={!hasFix}
              on:click={() =>
                dispatch("broadcast", {
                  reason: choice.reason,
                  colour: choice.colour,
                })}
            >
              <RadioTower size={22} />
              {choice.label}
            </button>
          {/each}
        </div>
      {/if}
    {:else if view === "farm"}
      <section class="mn-you">
        <div class="mn-you-top">
          <span class="who">
            <strong>{farmName}</strong>
            <span>{isOwner ? "Your farm" : `${farmOwner}'s farm`}</span>
          </span>
        </div>
        <div class="mn-figures">
          <div><b>{farm.paddocks}</b><span>paddocks</span></div>
          <div><b>{formatHa(farm.ha)}</b><span>hectares</span></div>
          <div><b>{crew.length + 1}</b><span>crew</span></div>
        </div>
        <button
          type="button"
          class="lp-btn lp-btn-ghost"
          on:click={() => dispatch("fitFarm")}
        >
          <LocateFixed size={18} /> Show the whole farm
        </button>
      </section>

      {#if otherFarms.length}
        <section class="mn-section">
          <p class="lp-eyebrow">Open a different farm</p>
          {#if trailOn}
            <p class="mn-note">Stop your trail before changing farm.</p>
          {/if}
          <div class="mn-tools">
            {#each otherFarms as choice (choice.id)}
              <button
                type="button"
                class="mn-tool"
                disabled={trailOn}
                on:click={() => dispatch("farm", choice.id)}
              >
                <span class="text">
                  <strong>{choice.name}</strong>
                  <span
                    >{choice.owner === "You"
                      ? "Your farm"
                      : `${choice.owner}'s farm`}</span
                  >
                </span>
                <ChevronRight size={20} />
              </button>
            {/each}
          </div>
        </section>
      {/if}

      <section class="mn-section">
        <button
          type="button"
          class="mn-text-button"
          on:click={() => dispatch("leave", "dashboard")}
        >
          Back to the dashboard
        </button>
        <button
          type="button"
          class="mn-text-button"
          on:click={() => dispatch("leave", "viewer")}
        >
          Open the current map viewer
        </button>
      </section>
    {/if}
  {/if}
</aside>
