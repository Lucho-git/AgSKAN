<script lang="ts">
  /**
   * The new toolbox: one panel for everything that isn't the map. It opens
   * on you and the crew, with a short list of tools underneath (machine,
   * pins, trails, map, farm); each tool takes over the panel and has a way
   * back. A side rail on a cab tablet, a pull-up sheet on a phone.
   */
  import { createEventDispatcher } from "svelte"
  import {
    ArrowLeft,
    ChevronRight,
    Layers,
    LocateFixed,
    MapPinned,
    Route,
    Tractor,
    Users,
    X,
  } from "lucide-svelte"
  import vehicles from "$lib/vehicles"
  import MachinePicker from "$lib/components/mapnext/MachinePicker.svelte"
  import PinArt from "$lib/components/mapnext/PinArt.svelte"
  import { machineFor } from "$lib/components/mapnext/machines"
  import { drawColour } from "$lib/components/mapnext/palette"
  import { compassPoint } from "$lib/components/mapnext/geo"
  import { formatDistance, formatHa } from "$lib/components/mapnext/format"
  import type { PinChoice } from "$lib/components/mapnext/pins"
  import type {
    BaseChoice,
    CrewRow,
    Loading,
    Operation,
    Readout,
    ToolView,
  } from "./liveEngine"
  import type { FarmChoice, TrailInfo, VehicleMarkerData } from "./liveData"
  import type { RecorderState } from "./recorder"

  export let view: ToolView = "home"
  export let wide = false
  export let status: { tone: string; text: string }
  export let myName: string
  export let marker: VehicleMarkerData
  export let readout: Readout
  export let recording: RecorderState
  export let guest = false
  export let crew: CrewRow[] = []
  export let pinChoices: PinChoice[] = []
  export let pinKind = "default"
  export let pinCount = 0
  export let operations: Operation[] = []
  export let operation: Operation | null = null
  export let trails: TrailInfo[] = []
  export let loading: Loading
  export let base = "satellite"
  export let baseChoices: BaseChoice[] = []
  export let farmName = ""
  export let farmOwner = ""
  export let isOwner = false
  export let farm: { paddocks: number; ha: number } = { paddocks: 0, ha: 0 }
  export let farms: FarmChoice[] = []
  export let currentFarmId = ""

  const dispatch = createEventDispatcher<{
    close: void
    locate: void
    machine: { type: string; colour: string; swath: number }
    lookCrew: string
    startTrail: void
    stopTrail: void
    pinKind: string
    dropPins: void
    operation: Operation
    lookTrail: string
    base: string
    fitFarm: void
    farm: string
    foundTrail: void
    leave: "dashboard" | "viewer"
  }>()

  $: machine = machineFor(marker.type)
  $: colour = drawColour(marker.bodyColor)
  $: trailOn = recording.phase === "on" || recording.phase === "stopping"
  $: online = crew.filter((person) => person.online).length
  $: pinLabelNow =
    pinChoices.find((choice) => choice.iconClass === pinKind)?.label ?? "Pin"
  $: baseLabel = baseChoices.find((choice) => choice.key === base)?.label ?? ""
  $: otherFarms = farms.filter((choice) => choice.id !== currentFarmId)
  $: firstName = myName.trim().split(/\s+/)[0] || "You"

  const TITLES: Record<ToolView, string> = {
    home: "",
    machine: "Your machine",
    pins: "Pins",
    trails: "Trails",
    map: "Map",
    farm: "Farm",
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
    google_satellite:
      "linear-gradient(135deg, #3f5a45 0%, #7a744c 45%, #9a8a5c 70%, #4d6146 100%)",
    bing_aerial:
      "linear-gradient(135deg, #55604a 0%, #7d7350 40%, #6c6a4a 70%, #46553f 100%)",
  }
</script>

<aside class="mn-panel" aria-label="Toolbox">
  {#if view === "home"}
    <header class="mn-panel-head">
      <span class="mark"
        ><img src="/images/logo.svg" alt="" width="30" height="30" /></span
      >
      <span class="word">AgSKAN</span>
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

    <section class="mn-you">
      <div class="mn-you-top">
        <span class="art">
          <svelte:component
            this={vehicles[machine.type]}
            size="48px"
            bodyColor={colour}
            outlineColor="#ffffff"
            wheelColor="#15261C"
            loadColor="#F7DB5C"
          />
        </span>
        <span class="who">
          <strong>{firstName}</strong>
          <span>
            {machine.label}{machine.paints ? ` · ${marker.swath} m` : ""}
          </span>
        </span>
      </div>

      <div class="mn-figures">
        <div>
          <b>{Math.round(readout.speed)}</b><span>km/h</span>
        </div>
        {#if trailOn}
          <div>
            <b>{formatHa(readout.ha)}</b><span>ha this trail</span>
          </div>
        {/if}
        <div>
          <b>{readout.hasFix ? compassPoint(readout.heading) : "–"}</b><span
            >heading</span
          >
        </div>
      </div>

      <p class="mn-where">
        {#if !readout.hasFix}
          Not on the map yet
        {:else if readout.paddock}
          In {readout.paddock.name} · {formatHa(readout.paddock.ha)} ha
        {:else if readout.far}
          A long way from this farm
        {:else}
          Outside the paddocks
        {/if}
        {#if readout.accuracy !== null && readout.hasFix}
          <span>GPS ±{Math.round(readout.accuracy)} m</span>
        {/if}
      </p>

      {#if !guest}
        {#if trailOn}
          <button
            type="button"
            class="mn-stop-trail"
            disabled={recording.phase === "stopping"}
            on:click={() => dispatch("stopTrail")}
          >
            <i></i>
            {recording.phase === "stopping"
              ? "Saving your trail…"
              : "Stop trail"}
          </button>
          {#if recording.waiting > 5}
            <p class="mn-note">
              {recording.waiting} points waiting for signal. They're kept on this
              device and sent when you're back in range.
            </p>
          {/if}
        {:else if recording.phase === "found"}
          <p class="mn-note">
            You have a trail running on another screen, so this one isn't adding
            to it or sharing your position.
          </p>
          <button
            type="button"
            class="lp-btn lp-btn-ghost"
            on:click={() => dispatch("foundTrail")}
          >
            See the running trail
          </button>
        {:else if machine.paints}
          <button
            type="button"
            class="lp-btn lp-btn-primary"
            disabled={!readout.hasFix ||
              !operation ||
              recording.phase === "starting"}
            on:click={() => dispatch("startTrail")}
          >
            {recording.phase === "starting" ? "Starting…" : "Start trail"}
          </button>
          {#if !readout.hasFix}
            <p class="mn-note">A trail needs your location first.</p>
          {:else if !operation}
            <p class="mn-note">
              This farm has no job to record against yet. Add one from the
              dashboard.
            </p>
          {/if}
        {:else}
          <p class="mn-note">
            A {machine.label.toLowerCase()} shows up live for the crew but leaves
            no trail.
          </p>
        {/if}
        {#if recording.problem}
          <p class="mn-warning">{recording.problem}</p>
        {/if}
      {/if}
    </section>

    <nav class="mn-tools" aria-label="Tools">
      {#if !guest}
        <button
          type="button"
          class="mn-tool"
          on:click={() => (view = "machine")}
        >
          <span class="icon"><Tractor size={22} /></span>
          <span class="text">
            <strong>Machine</strong>
            <span
              >{machine.label}{machine.paints
                ? ` · ${marker.swath} m wide`
                : ""}</span
            >
          </span>
          <ChevronRight size={20} />
        </button>
        <button type="button" class="mn-tool" on:click={() => (view = "pins")}>
          <span class="icon"
            ><PinArt look={{ iconClass: pinKind }} size={30} /></span
          >
          <span class="text">
            <strong>Pins</strong>
            <span>Dropping: {pinLabelNow} · {pinCount} on this farm</span>
          </span>
          <ChevronRight size={20} />
        </button>
      {/if}
      <button type="button" class="mn-tool" on:click={() => (view = "trails")}>
        <span class="icon"><Route size={22} /></span>
        <span class="text">
          <strong>Trails</strong>
          <span>
            {#if !operation}
              No job yet
            {:else if loading.trails}
              {operation.name} · loading {loading.trails.done} of {trails.length ||
                "…"}
            {:else}
              {operation.name} · {trails.length}
              {trails.length === 1 ? "trail" : "trails"}
            {/if}
          </span>
        </span>
        <ChevronRight size={20} />
      </button>
      <button type="button" class="mn-tool" on:click={() => (view = "map")}>
        <span class="icon"><Layers size={22} /></span>
        <span class="text">
          <strong>Map</strong>
          <span>{baseLabel}</span>
        </span>
        <ChevronRight size={20} />
      </button>
      <button type="button" class="mn-tool" on:click={() => (view = "farm")}>
        <span class="icon"><MapPinned size={22} /></span>
        <span class="text">
          <strong>Farm</strong>
          <span>{farmName}</span>
        </span>
        <ChevronRight size={20} />
      </button>
    </nav>

    <section class="mn-section">
      <div class="mn-section-head">
        <p class="lp-eyebrow">
          Crew · {online} on the map now
        </p>
        <Users size={16} />
      </div>
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
    </section>

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
        aria-label="Back to the toolbox"
        on:click={() => (view = "home")}
      >
        <ArrowLeft size={22} />
      </button>
      <h2>{TITLES[view]}</h2>
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

    {#if view === "machine"}
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
        tap the map. Tap any pin to see it or remove it.
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
            <PinArt look={{ iconClass: choice.iconClass }} size={36} />
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
                <button
                  type="button"
                  class="mn-tool mn-trail-row"
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
