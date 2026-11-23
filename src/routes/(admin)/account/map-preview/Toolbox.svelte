<script lang="ts">
  /**
   * The toolbox: one panel for everything that isn't the map. It opens on a
   * grid of tools, each a tile saying what it is set to; a tool takes over
   * the panel and has a way back. New tools are new tiles, so the grid grows
   * across as well as down. A side rail on a cab tablet, a pull-up sheet on
   * a phone.
   *
   * On the rail the grid is kept small and the crew is listed under it, so
   * who is where is always on screen; a phone has its own Crew button, and
   * the crew there is a card over the map (the page's). The rail can be put
   * away with the button at its top left. Beside that is the way back to the
   * farm's dashboard.
   */
  import { createEventDispatcher } from "svelte"
  import {
    ArrowLeft,
    ChevronDown,
    ChevronRight,
    FolderPlus,
    Plus,
    ClipboardList,
    FlaskConical,
    LandPlot,
    Layers,
    LoaderCircle,
    LocateFixed,
    Map as MapIcon,
    MapPin,
    MessageCircle,
    PanelLeftClose,
    Play,
    RadioTower,
    Route,
    Ruler,
    Search,
    Settings,
    Star,
    Tractor,
    UserMinus,
    UserPlus,
    UserRound,
    Users,
    X,
  } from "lucide-svelte"
  import vehicles from "$lib/vehicles"
  import MachinePicker from "$lib/components/mapnext/MachinePicker.svelte"
  import CrewPanel from "./CrewPanel.svelte"
  import PinsTool from "./PinsTool.svelte"
  import type { LogUndo } from "./FarmLog.svelte"
  import type { LngLat } from "$lib/components/mapnext/geo"
  import PinArt from "$lib/components/mapnext/PinArt.svelte"
  import ShapeArt from "$lib/components/mapnext/ShapeArt.svelte"
  import { machineFor } from "$lib/components/mapnext/machines"
  import {
    TRAIL_PALETTE_CHOICES,
    drawColour,
    paletteSample,
    trailColour,
    type TrailPalette,
  } from "$lib/components/mapnext/palette"
  import { formatHa } from "$lib/components/mapnext/format"
  import {
    PIN_STYLES,
    type PinChoice,
    type PinLook,
    type PinStyle,
  } from "$lib/components/mapnext/pins"
  import type { TrailLevel } from "$lib/components/mapnext/mapStyle"
  import { MENU_LOOKS, type MenuLook } from "$lib/components/mapnext/menuLook"
  import type { LivePin } from "./liveData"
  import type {
    BaseChoice,
    CrewRow,
    DevGps,
    Loading,
    Operation,
    ToolView,
  } from "./liveEngine"
  import {
    flashLabel,
    type FarmChoice,
    type FarmName,
    type Flash,
    type Paddock,
    type TrailInfo,
    type VehicleMarkerData,
  } from "./liveData"
  import type { RecorderState } from "./recorder"

  export let view: ToolView = "home"
  export let wide = false
  export let marker: VehicleMarkerData
  export let recording: RecorderState
  export let guest = false
  /** An admin account: offered the testing tools. */
  export let admin = false
  /** The made-up position being fed in, if one is. */
  export let devGps: DevGps | null = null
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
  export let operations: Operation[] = []
  export let operation: Operation | null = null
  export let trails: TrailInfo[] = []
  /** The trail picked out on the map, if any. */
  export let pickedTrail: string | null = null
  export let loading: Loading
  export let paddocks: Paddock[] = []
  export let pickedPaddock: string | null = null
  export let base = "satellite"
  /** The look the map opens in. */
  export let baseDefault = "dark"
  /** How vivid trails are drawn. */
  export let trailLevel: TrailLevel = "medium"
  /** The palette trails are coloured from. */
  export let trailPalette: TrailPalette = "machine"
  /** How pins are drawn. */
  export let pinStyle: PinStyle = "solid"
  /** How the menus are dressed. */
  export let menuLook: MenuLook = "contrast"
  /** How many pins are on the map. */
  export let pinCount = 0
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
  /** The farms (blocks of paddocks) on this map. */
  export let farmList: FarmName[] = []
  /** The map itself, for its log. */
  export let mapId = ""
  /** The kinds of pin with a button of their own on the map. */
  export let quickPinKinds: string[] = []
  /** Put back what a row of the log did. */
  export let undoLog: (what: LogUndo) => Promise<boolean> = async () => false
  /** Who the open conversation is with (their name), if one is open. */
  export let messageWith = ""
  /** Messages not yet opened, by who sent them. */
  export let unreadBy: Record<string, number> = {}
  /** The viewer's own row for the crew list. */
  export let self: CrewRow | null = null
  /** Leave people not seen in ten days out of the crew list. */
  export let hideStale = false
  /** Every pin on the farm, newest first, and how each is drawn. */
  export let pins: LivePin[] = []
  export let pinLook: (pin: LivePin) => PinLook = (pin) => ({
    iconClass: pin.iconClass,
  })
  /** The colour this person has set for each kind of pin. */
  export let typeColours: Record<string, string> = {}
  /** Jobs this person has on that aren't finished. */
  export let jobsWaiting = 0

  const dispatch = createEventDispatcher<{
    close: void
    locate: void
    machine: { type: string; colour: string; swath: number }
    lookCrew: string
    /** The pin buttons on the map, in order: the first is the default. */
    quickKinds: string[]
    operation: Operation
    lookTrail: string
    replayTrail: string
    lookPaddock: string
    base: string
    /** Open the map in this look from now on. */
    baseDefault: string
    trailLevel: TrailLevel
    trailPalette: TrailPalette
    pinStyle: PinStyle
    menuLook: MenuLook
    /** Add an operation to this map, and put it on the map. */
    newOperation: { name: string; year: number }
    /** Start, change or stop the made-up position (testing). */
    devGps: { mode: "roam" | "drive" } | null
    devSpeed: number
    /** Open a bin's card. */
    bin: string
    layer: { key: string; on: boolean }
    measure: void
    broadcast: { reason: string; colour: string }
    stopBroadcast: void
    driver: void
    fitFarm: void
    farm: string
    leave: "dashboard" | "viewer"
    messageCrew: string
    /** Put the rail away (a tablet). */
    minimise: void
    /** Back to the view the map opens on. */
    home: void
    /** Show the crew as its card over the map (a phone). */
    crewCard: void
    invite: void
    stale: boolean
    removeCrew: { id: string; guest: boolean; name: string }
    typeColour: { iconClass: string; colour: string }
    lookPin: string
    lasso: void
    /** Draw a new paddock, for this farm (or none in particular). */
    newPaddock: string | null
    /** Add a farm with this name. */
    newFarm: string
    /** Go to a place the log points at. */
    lookPlace: LngLat
    /** Pick the machine (by account) a log row is about. */
    logCrew: string
    /** Open a finished trail from the log. */
    logTrail: { id: string; operation: string }
  }>()

  // The operation on the map is named in the toolbox's heading; tapping it
  // lists the others (as the current viewer's toolbox does).
  let opOpen = false
  // (The crew's tabs stop under the heading, however tall it has grown.)
  let headH = 0
  function pickOperation(option: Operation) {
    opOpen = false
    if (option.id !== operation?.id) dispatch("operation", option)
  }
  // A new operation, made from the same list.
  let addingOp = false
  let newOpName = ""
  let newOpYear = new Date().getFullYear()
  // Next year's, this year's, and a few back.
  const OP_YEARS = Array.from({ length: 8 }, (_, i) => newOpYear + 1 - i)
  function addOperation() {
    const name = newOpName.trim()
    if (!name) return
    dispatch("newOperation", {
      name,
      year: Number(newOpYear) || new Date().getFullYear(),
    })
    newOpName = ""
    addingOp = false
    opOpen = false
  }
  const DEV_SPEEDS = [8, 15, 30, 60]

  // The crew section has two sides: who is on the map, and what has been
  // happening on it.
  let crewTab: "crew" | "log" = "crew"

  $: names = Object.fromEntries(crew.map((person) => [person.id, person.name]))

  // Removing someone takes a second tap on their row.
  let removing: string | null = null
  let removingTimer: ReturnType<typeof setTimeout>
  function removePerson(person: CrewRow) {
    if (removing !== person.id) {
      removing = person.id
      clearTimeout(removingTimer)
      removingTimer = setTimeout(() => (removing = null), 3000)
      return
    }
    removing = null
    dispatch("removeCrew", {
      id: person.id,
      guest: person.guest,
      name: person.name,
    })
  }

  $: machine = machineFor(marker.type)
  $: colour = drawColour(marker.bodyColor)
  $: trailOn = recording.phase === "on" || recording.phase === "stopping"
  $: otherFarms = farms.filter((choice) => choice.id !== currentFarmId)

  const TITLES: Record<ToolView, string> = {
    home: "",
    messages: "Messages",
    jobs: "Jobs",
    crew: "Crew",
    crewSettings: "Crew settings",
    machine: "Your machine",
    pins: "Pins",
    trails: "Trails",
    paddocks: "Paddocks",
    map: "Map",
    layers: "Layers",
    broadcast: "Broadcast",
    farm: "Farm",
    dev: "Dev mode",
  }

  /** Each tool's mark, shown beside its name at the top of its page. */
  const MARKS: Record<ToolView, typeof Users | null> = {
    home: null,
    messages: MessageCircle,
    jobs: ClipboardList,
    crew: Users,
    crewSettings: Settings,
    machine: Tractor,
    pins: MapPin,
    trails: Route,
    paddocks: LandPlot,
    map: MapIcon,
    layers: Layers,
    broadcast: RadioTower,
    farm: LandPlot,
    dev: FlaskConical,
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
    { key: "markerDrawings", label: "Pin drawings", part: true },
    { key: "vehicles", label: "Crew machines" },
    { key: "vehicleLabels", label: "Name tags", part: true },
    { key: "historicalTrails", label: "Finished trails" },
    { key: "activeTrails", label: "Trails being laid" },
    { key: "trailArrows", label: "Direction arrows on trails", extra: true },
    { key: "powerLines", label: "Power lines" },
    { key: "powerPoles", label: "Power poles", part: true },
  ]

  // ── Paddock list ──
  let paddockSearch = ""
  $: wanted = paddockSearch.trim().toLowerCase()
  $: found = wanted
    ? paddocks.filter((p) => p.name.toLowerCase().includes(wanted))
    : paddocks
  $: paddockGroups = groupByFarm(found, farmList, !!wanted)
  // A group per farm, by name; a farm with nothing in it yet still shows
  // (unless a search is on), so paddocks can be added to it.
  function groupByFarm(list: Paddock[], known: FarmName[], searching: boolean) {
    const groups = new Map<string, Paddock[]>()
    if (!searching && known.length > 1)
      for (const one of known) groups.set(one.id, [])
    for (const paddock of list) {
      const key =
        known.length > 1 &&
        paddock.farmId &&
        known.some((f) => f.id === paddock.farmId)
          ? paddock.farmId
          : ""
      groups.set(key, [...(groups.get(key) ?? []), paddock])
    }
    return [...groups.entries()]
      .map(([key, items]) => ({
        key,
        name: known.find((f) => f.id === key)?.name ?? "",
        items: items.sort((a, b) => a.name.localeCompare(b.name)),
        ha: items.reduce((sum, p) => sum + p.ha, 0),
      }))
      .sort((a, b) =>
        !a.name ? 1 : !b.name ? -1 : a.name.localeCompare(b.name),
      )
  }
  /** Farms folded down to their heading. */
  let folded = new Set<string>()
  // To begin with only the first farm is open.
  let foldedOnce = false
  $: if (!foldedOnce && paddockGroups.length > 1) {
    foldedOnce = true
    folded = new Set(paddockGroups.slice(1).map((group) => group.key))
  }
  function fold(key: string) {
    const next = new Set(folded)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    folded = next
  }
  $: allFolded =
    paddockGroups.length > 0 &&
    paddockGroups.every((group) => folded.has(group.key))
  function foldAll() {
    folded = allFolded
      ? new Set()
      : new Set(paddockGroups.map((group) => group.key))
  }
  let addingFarm = false
  let newFarmName = ""
  function addFarm() {
    const name = newFarmName.trim()
    if (!name) return
    dispatch("newFarm", name)
    newFarmName = ""
    addingFarm = false
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

  // The Map tool's three trail strengths (what each looks like, for its
  // sample).
  const TRAIL_LEVELS: { key: TrailLevel; label: string; strength: number }[] = [
    { key: "low", label: "Low", strength: 0.3 },
    { key: "medium", label: "Medium", strength: 0.5 },
    { key: "bright", label: "Bright", strength: 0.78 },
  ]

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
  class="mn-panel t-{view}"
  class:chat={view === "messages" && !!messageWith}
  style={view === "home" && headH ? `--mn-head-h: ${headH - 14}px` : ""}
  aria-label="Toolbox"
>
  {#if view === "home"}
    <header class="mn-panel-head home" bind:offsetHeight={headH}>
      <!-- (Rarely wanted, so it is the small one.) -->
      <button
        type="button"
        class="mn-dashback"
        aria-label="Back to the {farmName || 'farm'} dashboard"
        title="Back to the {farmName || 'farm'} dashboard"
        on:click={() => dispatch("leave", "dashboard")}
      >
        <ArrowLeft size={16} />
      </button>
      <button
        type="button"
        class="mn-op"
        class:open={opOpen}
        aria-expanded={opOpen}
        aria-label="Operation: {operation?.name ?? 'none'}. Change operation"
        disabled={!operations.length && guest}
        on:click={() => (opOpen = !opOpen)}
      >
        <span>
          <small>Operation</small>
          <b>
            {operation?.name ?? (operations.length ? "Pick one" : "None yet")}
          </b>
        </span>
        {#if operations.length || !guest}<ChevronDown size={18} />{/if}
      </button>
      {#if wide}
        <button
          type="button"
          class="mn-put"
          aria-label="Put the toolbox away"
          title="Put the toolbox away"
          on:click={() => dispatch("minimise")}
        >
          <PanelLeftClose size={24} />
        </button>
      {:else}
        <button
          type="button"
          class="mn-put"
          aria-label="Close"
          on:click={() => dispatch("close")}
        >
          <X size={24} />
        </button>
      {/if}
      {#if opOpen}
        <div class="mn-oplist" role="listbox" aria-label="Operation">
          {#if trailOn}
            <p>Stop your trail to change operation.</p>
          {/if}
          {#each operations as option (option.id)}
            <button
              type="button"
              role="option"
              aria-selected={operation?.id === option.id}
              disabled={trailOn && operation?.id !== option.id}
              on:click={() => pickOperation(option)}
            >
              <i></i>
              <strong>{option.name}</strong>
              {#if operation?.id === option.id && !loading.trails && trails.length}
                <span class="n"><Route size={12} /> {trails.length}</span>
              {/if}
              {#if option.year}<span>{option.year}</span>{/if}
            </button>
          {/each}
          {#if !guest}
            {#if addingOp}
              <form class="new" on:submit|preventDefault={addOperation}>
                <!-- svelte-ignore a11y-autofocus -->
                <input
                  type="text"
                  bind:value={newOpName}
                  maxlength="60"
                  placeholder="Harvest, Spraying…"
                  aria-label="Name of the new operation"
                  autofocus
                />
                <select class="year" bind:value={newOpYear} aria-label="Year">
                  {#each OP_YEARS as year}
                    <option value={year}>{year}</option>
                  {/each}
                </select>
                <button type="submit" disabled={!newOpName.trim() || trailOn}>
                  Add
                </button>
              </form>
            {:else}
              <button
                type="button"
                class="add"
                disabled={trailOn}
                on:click={() => (addingOp = true)}
              >
                <Plus size={16} />
                <strong>New operation</strong>
              </button>
            {/if}
          {/if}
        </div>
      {/if}
    </header>

    <nav class="mn-grid" aria-label="Tools">
      {#if !guest}
        <button
          type="button"
          class="mn-tile t-profile"
          on:click={() => dispatch("driver")}
        >
          <span class="icon"><UserRound size={28} /></span>
          <strong>Profile</strong>
        </button>
      {/if}
      {#if !wide}
        <button
          type="button"
          class="mn-tile t-crew"
          on:click={() => dispatch("crewCard")}
        >
          <span class="icon"><Users size={28} /></span>
          <strong>Crew</strong>
        </button>
      {/if}
      <button
        type="button"
        class="mn-tile t-jobs"
        on:click={() => (view = "jobs")}
      >
        {#if jobsWaiting}<span class="mn-badge">{jobsWaiting}</span>{/if}
        <span class="icon"><ClipboardList size={28} /></span>
        <strong>Jobs</strong>
      </button>
      {#if !guest}
        <button
          type="button"
          class="mn-tile t-machine"
          on:click={() => (view = "machine")}
        >
          <span class="icon art">
            <svelte:component
              this={vehicles[machine.type]}
              size="40px"
              bodyColor={colour}
              outlineColor="#ffffff"
              wheelColor="#15261C"
              loadColor="#F7DB5C"
            />
          </span>
          <strong>Machine</strong>
        </button>
        <button
          type="button"
          class="mn-tile t-pins"
          on:click={() => (view = "pins")}
        >
          {#if loading.pins}
            <span class="mn-count busy"><LoaderCircle size={13} /></span>
          {:else if pinCount}
            <span class="mn-count">{pinCount}</span>
          {/if}
          <span class="icon"
            ><PinArt look={choiceLook(pinKind)} size={38} /></span
          >
          <strong>Pins</strong>
        </button>
      {/if}
      <button
        type="button"
        class="mn-tile t-trails"
        on:click={() => (view = "trails")}
      >
        {#if loading.trails}
          <span class="mn-count busy"><LoaderCircle size={13} /></span>
        {:else if trails.length}
          <span class="mn-count">{trails.length}</span>
        {/if}
        <span class="icon"><Route size={28} /></span>
        <strong>Trails</strong>
      </button>
      <button
        type="button"
        class="mn-tile t-paddocks"
        on:click={() => (view = "paddocks")}
      >
        {#if loading.paddocks}
          <span class="mn-count busy"><LoaderCircle size={13} /></span>
        {:else if paddocks.length}
          <span class="mn-count">{paddocks.length}</span>
        {/if}
        <span class="icon"><LandPlot size={28} /></span>
        <strong>Paddocks</strong>
      </button>
      {#if !guest}
        <button
          type="button"
          class="mn-tile t-cast"
          class:on={!!broadcast}
          style={broadcast ? `--on: ${broadcast.colour}` : ""}
          on:click={() => (view = "broadcast")}
        >
          <span class="icon"><RadioTower size={28} /></span>
          <strong>Broadcast</strong>
        </button>
      {/if}
      <button
        type="button"
        class="mn-tile t-draw"
        on:click={() => dispatch("measure")}
      >
        <span class="icon"><Ruler size={28} /></span>
        <strong>Draw</strong>
      </button>
      <button
        type="button"
        class="mn-tile t-map"
        on:click={() => (view = "map")}
      >
        <span class="icon"><MapIcon size={28} /></span>
        <strong>Map</strong>
      </button>
      <button
        type="button"
        class="mn-tile t-layers"
        on:click={() => (view = "layers")}
      >
        <span class="icon"><Layers size={28} /></span>
        <strong>Layers</strong>
      </button>
      {#if admin}
        <button
          type="button"
          class="mn-tile t-dev"
          class:on={!!devGps}
          style={devGps ? "--on: #b4236a" : ""}
          on:click={() => (view = "dev")}
        >
          <span class="icon"><FlaskConical size={28} /></span>
          <strong>Dev</strong>
        </button>
      {/if}
    </nav>

    {#if wide}
      <!-- The crew, always in view under the tools. -->
      <section class="mn-home-crew" aria-label="Crew">
        <CrewPanel
          bind:tab={crewTab}
          {crew}
          {self}
          selfDriver={driver}
          {unreadBy}
          {hideStale}
          {guest}
          {mapId}
          {undoLog}
          on:settings={() => (view = "crewSettings")}
          on:home={() => dispatch("home")}
          on:driver={() => dispatch("driver")}
          on:look={(e) => dispatch("lookCrew", e.detail)}
          on:message={(e) => dispatch("messageCrew", e.detail)}
          on:invite={() => dispatch("invite")}
          on:lookPlace={(e) => dispatch("lookPlace", e.detail)}
          on:logCrew={(e) => dispatch("logCrew", e.detail)}
          on:logTrail={(e) => dispatch("logTrail", e.detail)}
        />
      </section>
    {/if}

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
        > · imagery © Maxar · power lines and poles © Western Power, © Geoscience
        Australia (CC BY 4.0)
      </p>
    </footer>
  {:else}
    <header class="mn-panel-head">
      <button
        type="button"
        class="mn-icon-button back"
        aria-label="Back"
        on:click={() => {
          // A conversation, and the crew's settings, are opened from the
          // crew list: on a phone that is a card under this sheet.
          if (!wide && (view === "messages" || view === "crewSettings"))
            dispatch("close")
          else view = "home"
        }}
      >
        <ArrowLeft size={22} />
      </button>
      {#if MARKS[view]}
        <span class="mn-headchip">
          <svelte:component this={MARKS[view]} size={19} />
        </span>
      {/if}
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
    {:else if view === "jobs"}
      <slot name="jobs" />
    {:else if view === "crewSettings"}
      <!-- ── Crew settings: who is on the map ── -->
      <button
        type="button"
        class="lp-btn lp-btn-primary"
        on:click={() => dispatch("invite")}
      >
        <UserPlus size={18} /> Invite someone
      </button>
      <button
        type="button"
        class="mn-switch"
        role="switch"
        aria-checked={hideStale}
        on:click={() => dispatch("stale", !hideStale)}
      >
        <span>Hide anyone not seen in 10 days</span>
        <i></i>
      </button>
      <section class="mn-section">
        <p class="lp-eyebrow">Take someone off this map</p>
        {#if !crew.length}
          <p class="mn-empty">Nobody else is on this farm yet.</p>
        {:else}
          {#if !isOwner}
            <p class="mn-note">
              You can remove guests. Only the farm's owner can remove one of the
              crew.
            </p>
          {/if}
          <div class="mn-tools">
            {#each crew as person (person.id)}
              <button
                type="button"
                class="mn-tool"
                class:armed={removing === person.id}
                disabled={!person.guest && !isOwner}
                on:click={() => removePerson(person)}
              >
                <span class="text">
                  <strong>{person.name}</strong>
                  <span>
                    {removing === person.id
                      ? "Tap again to take them off the map"
                      : person.guest
                        ? "Guest"
                        : person.machineLabel}
                  </span>
                </span>
                <UserMinus size={19} />
              </button>
            {/each}
          </div>
        {/if}
      </section>
    {:else if view === "crew"}
      <CrewPanel
        bind:tab={crewTab}
        {crew}
        {self}
        selfDriver={driver}
        {unreadBy}
        {hideStale}
        {guest}
        {mapId}
        {undoLog}
        on:settings={() => (view = "crewSettings")}
        on:home={() => dispatch("home")}
        on:driver={() => dispatch("driver")}
        on:look={(e) => dispatch("lookCrew", e.detail)}
        on:message={(e) => dispatch("messageCrew", e.detail)}
        on:invite={() => dispatch("invite")}
        on:lookPlace={(e) => dispatch("lookPlace", e.detail)}
        on:logCrew={(e) => dispatch("logCrew", e.detail)}
        on:logTrail={(e) => dispatch("logTrail", e.detail)}
      />
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
      <PinsTool
        {pinChoices}
        {choiceLook}
        {pinLook}
        {pins}
        {typeColours}
        {names}
        {guest}
        quick={quickPinKinds}
        on:quickKinds={(e) => dispatch("quickKinds", e.detail)}
        on:colour={(e) => dispatch("typeColour", e.detail)}
        on:lookPin={(e) => dispatch("lookPin", e.detail)}
        on:lasso={() => dispatch("lasso")}
        on:bin={(e) => dispatch("bin", e.detail)}
      />
    {:else if view === "trails"}
      <section class="mn-section">
        <p class="lp-eyebrow">Operation on the map</p>
        {#if operations.length}
          {#if trailOn}
            <p class="mn-note">
              Stop your trail to look at a different operation.
            </p>
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
            This farm has no operations yet. Add one (Spraying, Seeding,
            Harvest…) from the dashboard and its trails show up here.
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
                      style="background: {trailColour(trail.colour, trail.id)}"
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
      {#if !guest}
        {#if addingFarm}
          <form class="mn-newfarm" on:submit|preventDefault={addFarm}>
            <!-- svelte-ignore a11y-autofocus -->
            <input
              type="text"
              bind:value={newFarmName}
              maxlength="60"
              placeholder="Name of the farm"
              aria-label="Name of the new farm"
              autofocus
            />
            <button
              type="submit"
              class="lp-btn lp-btn-primary"
              disabled={!newFarmName.trim()}
            >
              Add
            </button>
            <button
              type="button"
              class="mn-icon-button"
              aria-label="Never mind"
              on:click={() => (addingFarm = false)}
            >
              <X size={20} />
            </button>
          </form>
        {:else}
          <div class="mn-menu-actions">
            <button type="button" on:click={() => dispatch("newPaddock", null)}>
              <Plus size={18} /> New paddock
            </button>
            <button type="button" on:click={() => (addingFarm = true)}>
              <FolderPlus size={18} /> New farm
            </button>
          </div>
        {/if}
      {/if}
      {#if !found.length && (wanted || !paddockGroups.length)}
        <p class="mn-empty">
          {paddocks.length
            ? "No paddock by that name."
            : "This farm has no paddocks yet. Tap New paddock and draw round one."}
        </p>
      {/if}
      {#if paddockGroups.length > 1 && !wanted}
        <button type="button" class="mn-text-button" on:click={foldAll}>
          {allFolded ? "Open every farm" : "Close every farm"}
        </button>
      {/if}
      {#each paddockGroups as group (group.key)}
        {@const open = !!wanted || !folded.has(group.key)}
        <section class="mn-section mn-farm">
          <div class="mn-farm-head">
            <button
              type="button"
              class="fold"
              aria-expanded={open}
              on:click={() => fold(group.key)}
            >
              <ChevronDown size={18} />
              <strong>
                {group.name ||
                  (paddockGroups.length > 1 ? "No farm" : "Paddocks")}
              </strong>
              <span>{group.items.length} · {formatHa(group.ha)} ha</span>
            </button>
            {#if !guest}
              <button
                type="button"
                class="mn-icon-button"
                aria-label="New paddock{group.name ? ` in ${group.name}` : ''}"
                title="New paddock{group.name ? ` in ${group.name}` : ''}"
                on:click={() => dispatch("newPaddock", group.key || null)}
              >
                <Plus size={20} />
              </button>
            {/if}
          </div>
          {#if open}
            {#if group.items.length}
              <div class="mn-tools">
                {#each group.items as paddock (paddock.id)}
                  <button
                    type="button"
                    class="mn-tool"
                    class:selected={pickedPaddock === paddock.id}
                    on:click={() => dispatch("lookPaddock", paddock.id)}
                  >
                    <ShapeArt
                      polygons={paddock.polygons}
                      colour={paddock.colour}
                      size={34}
                    />
                    <span class="text">
                      <strong>{paddock.name}</strong>
                      {#if paddock.crop}<span>{paddock.crop}</span>{/if}
                    </span>
                    <span class="figure">{formatHa(paddock.ha)} ha</span>
                  </button>
                {/each}
              </div>
            {:else}
              <p class="mn-empty">No paddocks in this farm yet.</p>
            {/if}
          {/if}
        </section>
      {/each}
    {:else if view === "map"}
      <!-- ── Map style: the map itself, the trails, the pins ── -->
      <section class="mn-section">
        <p class="lp-eyebrow">Map</p>
        <div class="mn-looks">
          {#each baseChoices as choice (choice.key)}
            <div class="mn-lookwrap">
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
                <span>
                  {choice.label}
                  <small>{choice.note}</small>
                </span>
              </button>
              <!-- The star: the look the map opens in. -->
              <button
                type="button"
                class="star"
                class:on={baseDefault === choice.key}
                aria-pressed={baseDefault === choice.key}
                aria-label={baseDefault === choice.key
                  ? `The map opens in ${choice.label}`
                  : `Open the map in ${choice.label} every time`}
                title={baseDefault === choice.key
                  ? `The map opens in ${choice.label}`
                  : `Open the map in ${choice.label} every time`}
                on:click={() =>
                  baseDefault !== choice.key &&
                  dispatch("baseDefault", choice.key)}
              >
                <Star
                  size={16}
                  fill={baseDefault === choice.key ? "currentColor" : "none"}
                />
              </button>
            </div>
          {/each}
        </div>
        <p class="mn-note">The star is the one the map opens in.</p>
      </section>

      <section class="mn-section">
        <p class="lp-eyebrow">Trail colours</p>
        <div class="mn-presets" role="group" aria-label="Trail colours">
          {#each TRAIL_PALETTE_CHOICES as option (option.key)}
            <button
              type="button"
              aria-pressed={trailPalette === option.key}
              on:click={() =>
                trailPalette !== option.key &&
                dispatch("trailPalette", option.key)}
            >
              <span class="shades">
                {#each paletteSample(option.key) as shade}
                  <i style="background: {shade}"></i>
                {/each}
              </span>
              {option.label}
            </button>
          {/each}
        </div>
        <p class="mn-note">
          Machine is the colour each machine is drawn in. Soft and Classic are
          the same colours in other shades.
        </p>
      </section>

      <section class="mn-section">
        <p class="lp-eyebrow">Trail strength</p>
        <div class="mn-presets" role="group" aria-label="Trail strength">
          {#each TRAIL_LEVELS as level (level.key)}
            <button
              type="button"
              aria-pressed={trailLevel === level.key}
              on:click={() =>
                trailLevel !== level.key && dispatch("trailLevel", level.key)}
            >
              <span class="trails" style="--o: {level.strength}"></span>
              {level.label}
            </button>
          {/each}
        </div>
      </section>

      <section class="mn-section">
        <p class="lp-eyebrow">Markers</p>
        <div class="mn-presets" role="group" aria-label="Marker style">
          {#each PIN_STYLES as option (option.key)}
            <button
              type="button"
              title={option.label}
              aria-pressed={pinStyle === option.key}
              on:click={() =>
                pinStyle !== option.key && dispatch("pinStyle", option.key)}
            >
              <span class="pins">
                <PinArt
                  look={{ iconClass: "ionic-water" }}
                  style={option.key}
                  size={30}
                />
                <PinArt
                  look={{ iconClass: "custom-svg-gate", colour: "red" }}
                  style={option.key}
                  size={30}
                />
                <PinArt
                  look={{ iconClass: "ionic-warning", colour: "yellow" }}
                  style={option.key}
                  size={30}
                />
              </span>
              {option.label}
            </button>
          {/each}
        </div>
      </section>

      <section class="mn-section">
        <p class="lp-eyebrow">Menus</p>
        <div class="mn-presets four" role="group" aria-label="Menu look">
          {#each MENU_LOOKS as option (option.key)}
            <button
              type="button"
              aria-pressed={menuLook === option.key}
              on:click={() =>
                menuLook !== option.key && dispatch("menuLook", option.key)}
            >
              <span class="menu {option.key}"><i></i><b></b><b></b></span>
              {option.label}
            </button>
          {/each}
        </div>
      </section>
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
    {:else if view === "dev"}
      <!-- ── Testing tools (admin accounts): a made-up position ── -->
      <section class="mn-section">
        <p class="lp-eyebrow">Made-up GPS</p>
        <div class="mn-presets" role="group" aria-label="Made-up GPS">
          <button
            type="button"
            aria-pressed={!devGps}
            on:click={() => devGps && dispatch("devGps", null)}
          >
            Off
          </button>
          <button
            type="button"
            aria-pressed={devGps?.mode === "roam"}
            on:click={() =>
              devGps?.mode !== "roam" && dispatch("devGps", { mode: "roam" })}
          >
            Roam
          </button>
          <button
            type="button"
            aria-pressed={devGps?.mode === "drive"}
            on:click={() =>
              devGps?.mode !== "drive" && dispatch("devGps", { mode: "drive" })}
          >
            Drive
          </button>
        </div>
        <p class="mn-note">
          {#if devGps?.mode === "roam"}
            Your machine is working up and down the nearest paddock, then the
            next one.
          {:else if devGps?.mode === "drive"}
            Tap the map and your machine drives there.
          {:else}
            Roam works the nearest paddocks by itself. Drive goes wherever you
            tap the map.
          {/if}
        </p>
      </section>
      <section class="mn-section">
        <p class="lp-eyebrow">Speed</p>
        <div class="mn-presets four" role="group" aria-label="Speed">
          {#each DEV_SPEEDS as kmh}
            <button
              type="button"
              aria-pressed={(devGps?.kmh ?? 12) === kmh}
              disabled={!devGps}
              on:click={() => dispatch("devSpeed", kmh)}
            >
              {kmh} km/h
            </button>
          {/each}
        </div>
      </section>
      <p class="mn-warning">
        The crew sees this position as your real one, and a trail started while
        it runs is saved like any other. Use a test operation.
      </p>
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
