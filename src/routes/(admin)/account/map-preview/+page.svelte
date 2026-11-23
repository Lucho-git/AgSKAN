<script lang="ts">
  /**
   * The new map viewer on a real farm (a preview, alongside the current
   * viewer at /account/mapviewer).
   *
   * Same data as the current viewer: the farm's paddocks, pins, crew and
   * trails, live. The screen is the map; everything else is one status chip,
   * one "you" readout, a follow button, a pin button and, for machines that
   * work a paddock, a trail button. The toolbox is a single panel: a side
   * rail on a cab tablet, a pull-up sheet on a phone.
   *
   * `liveData.ts` talks to the server, `liveEngine.ts` draws, `recorder.ts`
   * records the trail. This file is the chrome and the flow.
   */
  import { onDestroy, onMount, setContext } from "svelte"
  import { writable } from "svelte/store"
  import { fade, fly } from "svelte/transition"
  import { goto } from "$app/navigation"
  import { PUBLIC_MAPBOX_ACCESS_TOKEN } from "$env/static/public"
  import {
    LoaderCircle,
    LocateFixed,
    MessageCircle,
    Plus,
    Navigation,
    Check,
    Trash2,
    Users,
    X,
    ArrowLeft,
    Pause,
    Play,
    Wifi,
    WifiOff,
  } from "lucide-svelte"
  import "../../../(marketing)/landing/landing-theme.css"
  import "$lib/components/mapnext/chrome.css"
  import "$lib/components/mapnext/menus.css"
  import vehicles from "$lib/vehicles"
  import { session } from "$lib/stores/sessionStore"
  import { profileStore } from "$lib/stores/profileStore"
  import { connectedMapStore } from "$lib/stores/connectedMapStore"
  import {
    operationStore,
    selectedOperationStore,
  } from "$lib/stores/operationStore"
  import { operatorStore, type Operator } from "$lib/stores/operatorStore"
  import { userSettingsStore } from "$lib/stores/userSettingsStore"
  import { mapApi } from "$lib/api/mapApi"
  import { operationApi } from "$lib/api/operationApi"
  import { operatorApi } from "$lib/api/operatorApi"
  import { resolveDefaultMarkerPreference } from "$lib/utils/defaultMarkerPreference"
  import PinArt from "$lib/components/mapnext/PinArt.svelte"
  import {
    IMAGERY,
    type BaseLook,
    type TrailLevel,
  } from "$lib/components/mapnext/mapStyle"
  import { machineFor } from "$lib/components/mapnext/machines"
  import type { LngLat } from "$lib/components/mapnext/geo"
  import { formatDistance, formatHa } from "$lib/components/mapnext/format"
  import {
    PIN_DEFAULT,
    pinChoices as allPinChoices,
    pinColour,
    asPinStyle,
    pinStyle,
    preferenceIconClass,
    type PinStyle,
  } from "$lib/components/mapnext/pins"
  import { asMenuLook, type MenuLook } from "$lib/components/mapnext/menuLook"
  import {
    asTrailPalette,
    setTrailPalette,
    type TrailPalette,
  } from "$lib/components/mapnext/palette"
  import {
    grainBinDefaultCapacity,
    grainBinName,
    isGrainBinIcon,
    markerColor,
  } from "$lib/components/map/markers/markerPalette"
  import {
    BROADCAST_FOR,
    LiveEngine,
    ME,
    sizeOf,
    type Measure,
    type BaseChoice,
    type CrewRow,
    type FollowMode,
    type GpsState,
    type Loading,
    type Operation,
    type Readout,
    type ReplayState,
    type TrailSuspect,
    type DevGps,
    type Guide,
    type BoundaryEdit,
    type PickedShape,
    type ThroughStats,
    type SetReplayState,
    type ToolView,
  } from "./liveEngine"
  import {
    DRAWING_COLOURS,
    createGuestInvite,
    removeFromMap,
    flashLabel,
    type Job,
    type JobItem,
    loadBroadcastChoices,
    loadFarmChoices,
    loadMyVehicle,
    loadPhotoLinks,
    type PinDrawing,
    type PinPhoto,
    type FarmName,
    type Flash,
    type FarmChoice,
    type LivePin,
    type Message,
    type Paddock,
    type SharedPlace,
    type TrailInfo,
    type VehicleMarkerData,
  } from "./liveData"
  import {
    confirmSprayRecords,
    type FinishedTrail,
    type RecorderState,
  } from "./recorder"
  import LiveJoin from "./LiveJoin.svelte"
  import Toolbox from "./Toolbox.svelte"
  import CrewPanel from "./CrewPanel.svelte"
  import BinCard from "./BinCard.svelte"
  import ProfilePicker from "./ProfilePicker.svelte"
  import type { LogUndo } from "./FarmLog.svelte"
  import PinCard from "./PinCard.svelte"
  import MachineCard from "./MachineCard.svelte"
  import GuideBar from "./GuideBar.svelte"
  import BoundaryCard from "./BoundaryCard.svelte"
  import { PLACES, type PlaceBook } from "./PlaceArt.svelte"
  import PaddockCard from "./PaddockCard.svelte"
  import Messages from "./Messages.svelte"
  import Jobs from "./Jobs.svelte"
  import TrailCard from "./TrailCard.svelte"
  import TrailingNow from "./TrailingNow.svelte"
  import TrailSetCard from "./TrailSetCard.svelte"
  import ShapeCard from "./ShapeCard.svelte"
  import Dropdown from "$lib/components/mapnext/Dropdown.svelte"
  import JobBuilder, { type JobDraft } from "./JobBuilder.svelte"
  import JobBar from "./JobBar.svelte"
  import { JobBoard } from "./jobBoard"
  import { Messenger, type Conversation } from "./messenger"
  import { layerVisibilityStore } from "$lib/stores/layerVisibilityStore"
  import { userSettingsApi } from "$lib/api/userSettingsApi"

  const STORE = "agskan-map-next"
  const load = <T,>(key: string): T | null => {
    try {
      const raw = localStorage.getItem(`${STORE}:${key}`)
      return raw ? (JSON.parse(raw) as T) : null
    } catch {
      return null
    }
  }
  const save = (key: string, value: unknown) => {
    try {
      localStorage.setItem(`${STORE}:${key}`, JSON.stringify(value))
    } catch {
      // Storage can be blocked; the map carries on without it.
    }
  }

  // ── Who and where ──
  // Read once: the account layout has loaded these before this page renders,
  // and changing farm reloads the page.
  const userId = $session?.user?.id ?? $profileStore?.id ?? null
  const mapId = $connectedMapStore?.id ?? null
  const farmName = $connectedMapStore?.map_name ?? "Your farm"
  const farmOwner = $connectedMapStore?.owner ?? "Someone"
  const isOwner = !!$connectedMapStore?.is_owner
  const guest = $profileStore?.user_type === "viewer"

  // What this person is driving. A ute until their saved machine arrives.
  let marker: VehicleMarkerData = {
    type: "FarmUte",
    bodyColor: "Blue",
    size: 40,
    swath: 4,
  }
  let savedMarker = ""
  let saveTimer: ReturnType<typeof setTimeout> | undefined
  let readTimer: ReturnType<typeof setTimeout> | undefined
  /** They picked a machine before their saved one arrived: theirs wins. */
  let machineTouched = false
  /** Whether they have a saved machine, once that has been looked up. */
  let machineRead = false
  let hasMachine = false

  // The colour each of this person's pins is filled with comes from their
  // own marker colour settings (the same ones the current viewer uses).
  $: pinSettings = {
    markerDefaultColor: $userSettingsStore.markerDefaultColor,
    markerTypeDefaultColors: $userSettingsStore.markerTypeDefaultColors,
  }
  $: engine?.setPinSettings(pinSettings)
  /** How a pin of this kind will look when this person drops one. */
  $: choiceLook = (iconClass: string) => ({
    iconClass,
    colour: pinColour({ id: "new", iconClass }, pinSettings),
  })

  // ── Map look ──
  // The map opens in a look of this device's choosing (the dark map unless
  // one has been made the default); a look picked in the Map tool is for
  // this visit.
  const savedBase = load<string>("base-default")
  const preferred = $userSettingsStore.defaultImagerySource
  let baseDefault: string =
    savedBase &&
    (savedBase === "paper" ||
      savedBase === "satellite" ||
      savedBase === "dark" ||
      IMAGERY[savedBase])
      ? savedBase
      : "dark"
  let baseKey: string = baseDefault
  // How vivid trails are, and how pins are drawn: this device's choices.
  let trailLevel: TrailLevel = (() => {
    const saved = load<string>("trail-level")
    return saved === "low" || saved === "bright" ? saved : "medium"
  })()
  let pinLook: PinStyle = asPinStyle(load<string>("pin-style"))
  pinStyle.set(pinLook)
  let trailPalette: TrailPalette = asTrailPalette(load<string>("trail-palette"))
  setTrailPalette(trailPalette)
  /** How the menus are dressed (the Map tool's "Menus"). */
  let menuLook: MenuLook = asMenuLook(load<string>("menu-look"))
  const lookOf = (key: string): BaseLook =>
    key === "paper" ? "paper" : key === "dark" ? "dark" : "satellite"
  const imageryOf = (key: string) => (IMAGERY[key] ? key : null)
  $: baseChoices = [
    { key: "satellite", label: "Satellite", note: "Real imagery, toned down" },
    { key: "paper", label: "Drawn", note: "Paddocks, lanes and contours" },
    { key: "dark", label: "Dark", note: "Dark from afar, imagery up close" },
    ...Object.entries(IMAGERY)
      .filter(
        ([key]) =>
          key === baseKey ||
          key === preferred ||
          ($userSettingsStore.enabledImageryProviders ?? []).includes(
            key as never,
          ),
      )
      .map(([key, imagery]) => ({
        key,
        label: imagery.label,
        note: `${imagery.credit} imagery`,
      })),
  ] as BaseChoice[]

  // ── Where we are in the flow ──
  // Every visit starts the same way. If the browser isn't already allowed
  // to say where this person is, the location prompt comes first; once on
  // the map, anyone who can drive is asked to confirm who is driving.
  const joinedBefore = !!mapId && load<string[]>("joined")?.includes(mapId)
  let phase: "join" | "map" = "join"
  /** Whether location is already allowed, once that has been looked up. */
  let allowed: boolean | null = null
  let settled = false
  let step: "you" | "locate" | "farm" = "you"
  let switching: string | null = null
  let farms: FarmChoice[] = []

  // ── Chrome ──
  let panelOpen = false
  let toolView: ToolView = "home"
  /** On a tablet the toolbox can be put away, to a button at the top left. */
  let railShut = load<boolean>("rail-shut") ?? false
  /**
   * On a phone, and on a tablet while the rail is put away, the crew is a
   * card over the map (from the Crew button, bottom left).
   */
  let crewCard = false
  let crewTab: "crew" | "log" = "crew"
  let crewCardH = 0
  /** The kind picked in the change-pin card, waiting to be confirmed. */
  /** My trail is paused: driving shows dotted and isn't coverage. */
  let trailPaused = false
  /** The grain bin opened from its button on the map (its pin's id). */
  let binOpen: string | null = null
  let wide = false
  let online = true
  let secure = true
  let stopAsk = false
  let operatorAsk = false
  let operators: Operator[] = []
  let operatorName = ""
  let operatorBusy = false
  let sprayCard: FinishedTrail | null = null
  let snack: {
    text: string
    action?: { label: string; run: () => void }
  } | null = null
  let snackTimer: ReturnType<typeof setTimeout> | undefined

  // ── Pins ──
  $: pinChoices = allPinChoices($userSettingsStore.markerUsageOrder ?? [])
  let pinKind: string =
    load<string>("pin") ??
    preferenceIconClass(
      resolveDefaultMarkerPreference($userSettingsStore.defaultMarker),
    )
  // The kinds of pin with a button of their own, bottom right. The first
  // is the default: it is the one a long press on the map drops.
  let quickKinds: string[] = load<string[]>("quick-pins") ?? [pinKind]
  if (!quickKinds.length) quickKinds = [pinKind]
  const pinName = (iconClass: string) =>
    pinChoices.find((choice) => choice.iconClass === iconClass)?.label ?? "Pin"
  function setQuick(kinds: string[]) {
    quickKinds = kinds.length ? kinds : [pinKind]
    save("quick-pins", quickKinds)
    // (The default is also the kind a drawing's pin starts as.)
    pinKind = quickKinds[0]
    save("pin", pinKind)
  }
  // A pin button drops its pin where the machine is, on one tap. Off the
  // default one a small "+" then slides out for a few seconds: the way to
  // the Pins tool, where the buttons are changed and added.
  let pinMore = false
  let pinMoreTimer: ReturnType<typeof setTimeout> | undefined
  function pinTap(iconClass: string) {
    engine?.dropPin(iconClass)
    floatUp(`+ ${pinName(iconClass)}`)
    if (iconClass !== quickKinds[0]) return
    pinMore = true
    clearTimeout(pinMoreTimer)
    pinMoreTimer = setTimeout(() => (pinMore = false), 5000)
  }
  // Dragged off its button, a pin is carried over the map (drawn a little
  // above the finger, so it can be seen) and put down where it is let go;
  // its menu then opens. Let go over "Cancel", or back on the button, and
  // nothing is dropped.
  const PIN_LIFT = 54
  let pinPress: {
    kind: string
    id: number
    x: number
    y: number
    home: DOMRect
    dragging: boolean
  } | null = null
  let pinDrag: { kind: string; x: number; y: number; cancel: boolean } | null =
    null
  let pinCancelZone: HTMLElement | undefined
  function pinDown(event: PointerEvent, kind: string) {
    if (event.button !== 0 && event.pointerType === "mouse") return
    const button = event.currentTarget as HTMLElement
    // (Keeps the moves coming to this button once the finger has left it.)
    try {
      button.setPointerCapture(event.pointerId)
    } catch {
      // Not a pointer that can be captured: the drag still works while the
      // finger is over the page.
    }
    pinPress = {
      kind,
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      home: button.getBoundingClientRect(),
      dragging: false,
    }
  }
  function pinMove(event: PointerEvent) {
    const press = pinPress
    if (!press || press.id !== event.pointerId) return
    if (
      !press.dragging &&
      Math.hypot(event.clientX - press.x, event.clientY - press.y) > 12
    )
      press.dragging = true
    if (!press.dragging) return
    const within = (box: DOMRect | undefined, slack: number) =>
      !!box &&
      event.clientX >= box.left - slack &&
      event.clientX <= box.right + slack &&
      event.clientY >= box.top - slack &&
      event.clientY <= box.bottom + slack
    pinDrag = {
      kind: press.kind,
      x: event.clientX,
      y: event.clientY,
      cancel:
        within(press.home, 4) ||
        within(pinCancelZone?.getBoundingClientRect(), 10),
    }
  }
  async function pinUp(event: PointerEvent) {
    const press = pinPress
    if (!press || press.id !== event.pointerId) return
    pinPress = null
    const drag = pinDrag
    pinDrag = null
    if (!press.dragging) {
      pinTap(press.kind)
      return
    }
    if (!drag || drag.cancel || !engine) return
    const pin = await engine.dropPin(
      press.kind,
      engine.lngLatAt(drag.x, drag.y - PIN_LIFT),
    )
    // Its menu opens: a note, another kind or colour, or delete it again.
    if (pin) engine.selectedPin.set(pin)
  }
  function pinCancel() {
    pinPress = null
    pinDrag = null
  }

  function openPins() {
    pinMore = false
    clearTimeout(pinMoreTimer)
    openPanel("pins")
  }
  // (Where a button was pressed: a word floats up from there.)
  function tapAway(event: Event) {
    const press = event as PointerEvent
    if (typeof press.clientX === "number")
      lastTap = { x: press.clientX, y: press.clientY }
  }
  $: quickPins = [
    ...pinChoices.filter((choice) => choice.iconClass === pinKind),
    ...pinChoices.filter((choice) => choice.iconClass !== pinKind).slice(0, 9),
  ]

  // ── The map ──
  let mapEl: HTMLDivElement
  let engine: LiveEngine | null = null
  let gps: GpsState = "idle"
  let follow: FollowMode = "free"
  let linked = false
  let bearing = 0
  let crew: CrewRow[] = []
  let selectedPin: LivePin | null = null
  let selectedPaddock: Paddock | null = null
  let selectedTrail: TrailInfo | null = null
  let replay: ReplayState | null = null
  let trailSuspect: TrailSuspect | null = null
  let devGps: DevGps | null = null
  // The trail being followed, and which one it is in words.
  let guide: Guide | null = null
  let guideLabel = ""
  // The paddock whose boundary is being changed.
  let boundaryEdit: BoundaryEdit | null = null
  // Drawing was started from a paddock's own menu: what is drawn stays on
  // that paddock (or on a pin), and its boundary is left alone.
  let drawOnPaddock = false
  let paddocks: Paddock[] = []
  let farmNames: FarmName[] = []
  let measure: Measure | null = null
  let movingPin: string | null = null
  let broadcast: Flash | null = null
  let broadcastChoices: { reason: string; label: string; colour: string }[] = []
  /** The clock, ticking while something on screen counts down. */
  let now = Date.now()
  /** The driver chooser was opened to change driver, not to start a trail. */
  let driverOnly = false
  let roadAsk = false
  let selectedCrewId: string | null = null
  let trails: TrailInfo[] = []

  // ── Crew ──
  let self: CrewRow | null = null
  let pinCount = 0
  let following: { id: string; mode: "follow" | "cab" } | null = null
  let hideStale = load<boolean>("hide-stale") ?? false
  /** The trail the picked crew member is laying now, in figures. */
  let crewTrail: {
    since: number
    metres: number
    ha: number
    colour: string
    lit: boolean
  } | null = null
  /** A pin being placed by dragging, before it exists. */
  let placing: { iconClass: string; colour: string } | null = null
  /** Stepping through trails is kept to these (the ones through a paddock). */
  let trailScope: {
    ids: string[]
    name: string
    /** The paddock they all go through, when that is what they share. */
    paddockId?: string | null
  } | null = null
  /** The invite card: its link once it has been made. */
  let invite: { link: string | null } | null = null
  let copied = ""

  // ── Pins, all of them, and the lasso for removing several ──
  let pins: LivePin[] = []
  let lasso: {
    phase: "drawing" | "confirm"
    count: number
    purpose: "pins" | "ground"
  } | null = null

  // ── Paddocks ──
  let paddockTrails: TrailInfo[] = []
  let pickedFeature: string | null = null
  /** The drawing on the picked pin that is picked out. */
  let pickedDrawing: PickedShape | null = null
  /** The paddock whose trails are all on show at once. */
  let through: string | null = null
  let throughStats: ThroughStats | null = null
  /** The last figures for a paddock's trails, kept while they replay. */
  let setStats: ThroughStats | null = null
  $: if (throughStats) setStats = throughStats
  /**
   * A new paddock is being drawn: the farm it is for ("" for none in
   * particular). `null` when the draw tool is being used for anything else.
   */
  let paddockFor: string | null = null
  /**
   * A set of trails taken together: every trail through one paddock, or (no
   * paddock) the whole of the job on show.
   */
  let trailSet: {
    paddockId: string | null
    name: string
    where: string
    trails: TrailInfo[]
  } | null = null
  /** Those trails being replayed together. */
  let setReplay: SetReplayState | null = null
  /** A whole job's figures (a paddock's come from the engine as it shows them). */
  let jobStats: ThroughStats | null = null
  // A paddock's set stays up for as long as its trails are all on show.
  $: if (trailSet?.paddockId && !setReplay && through !== trailSet.paddockId)
    trailSet = null
  function showSet() {
    const paddock = selectedPaddock
    if (!paddock) return
    trailSet = {
      paddockId: paddock.id,
      name: paddock.name,
      where: `through ${paddock.name}`,
      trails: [...paddockTrails].sort((a, b) => a.start - b.start),
    }
    engine?.showThrough(paddock.id)
  }
  function showJobSet() {
    if (!engine || !trails.length) return
    engine.clearSelection()
    const name = operation?.name ?? "this job"
    trailSet = {
      paddockId: null,
      name,
      where: `in ${name}`,
      trails: [...trails].sort((a, b) => a.start - b.start),
    }
    jobStats = engine.statsFor(trails)
  }
  // From one trail back to all of them: the paddock's, if that is where it
  // was opened from, else the job's.
  function allFromTrail() {
    const scope = trailScope
    const paddock = scope?.paddockId
      ? paddocks.find((p) => p.id === scope.paddockId)
      : null
    engine?.pickTrail(null)
    if (paddock) {
      engine?.selectedPaddock.set(paddock)
      showSet()
    } else showJobSet()
  }
  function closeSet() {
    const set = trailSet
    trailSet = null
    engine?.stopSet()
    if (set?.paddockId) engine?.showThrough(null)
  }
  // One trail of the set, opened on its own: the arrows then step through
  // the set's trails as usual.
  function openFromSet(id: string) {
    const set = trailSet
    if (!set) return
    engine?.stopSet()
    const scope = {
      ids: set.trails.map((trail) => trail.id),
      name: set.name,
      paddockId: set.paddockId,
    }
    trailSet = null
    if (pickTrail(id)) trailScope = set.paddockId ? scope : null
  }
  const SET_RATES = [1, 2, 4, 8]
  function nextSetRate() {
    if (!setReplay) return
    engine?.setSetRate(
      SET_RATES[(SET_RATES.indexOf(setReplay.rate) + 1) % SET_RATES.length],
    )
  }

  // A badge that rises from wherever a button was just pressed and fades:
  // "+ Rock" off a pin button. (What happens to a pin already on the map is
  // said on the map, where the pin is: see the engine's `flag`.)
  let lastTap = { x: 0, y: 0 }
  let floaters: {
    id: number
    x: number
    y: number
    text: string
    gone: boolean
  }[] = []
  let floated = 0
  function floatUp(text: string, gone = false) {
    const id = ++floated
    floaters = [...floaters, { id, ...lastTap, text, gone }]
    setTimeout(() => (floaters = floaters.filter((f) => f.id !== id)), 1100)
  }
  /** Asked for a new paddock: how to make it, and for which farm. */
  let paddockAsk: { farmId: string | null } | null = null
  /** The name being given to the paddock being built. */
  let newPaddockName = ""
  /** The farm a lassoed paddock is for, while the lasso is being drawn. */
  let groundFor: { farmId: string | null } | null = null
  function buildPaddock(start: LngLat[][][] | null = null) {
    const ask = paddockAsk ?? groundFor
    if (!ask) return
    paddockAsk = null
    groundFor = null
    newPaddockName = ""
    if (!wide) panelOpen = false
    engine?.newPaddock(ask.farmId, start)
  }
  // From where a trail went: a loop is drawn round the ground, and what
  // the job's trails covered inside it becomes the outline to start from.
  function lassoGround() {
    groundFor = paddockAsk
    paddockAsk = null
    if (!wide) panelOpen = false
    engine?.startLasso("ground")
  }

  // ── Jobs ──
  let board: JobBoard | null = null
  let jobs: Job[] = []
  /**
   * A job being put together. It has one step or several; taps on the map
   * add places to the step being worked on (`current`).
   */
  let jobDraft: JobDraft | null = null
  /** The job whose places are being shown on the map. */
  let shownJob: Job | null = null

  // ── Keeping something drawn with the draw tool ──
  let keepStep = false
  let keepLabel = ""
  let cutAsk = false

  // ── Messages ──
  const myName = $profileStore?.full_name || "Someone"
  let messenger: Messenger | null = null
  let conversations: Conversation[] = []
  let unread = 0
  let chatWith: string | null = null
  /** A place is being picked on the map to send to whoever the chat is with. */
  let placePick = false
  /** The places picked, waiting in the conversation to be sent. */
  let chatPlaces: { label: string; place: SharedPlace }[] = []
  let thread: Message[] = []
  let chatLoading = false
  let chatSending = false
  /** Messages that came in while the messages weren't open, latest last. */
  let notices: Message[] = []
  let farm = { paddocks: 0, ha: 0 }
  let loading: Loading = { paddocks: true, pins: true, trails: null }
  let recording: RecorderState = {
    phase: "off",
    trail: null,
    waiting: 0,
    problem: null,
  }
  let readout: Readout = {
    hasFix: false,
    speed: 0,
    heading: 0,
    ha: 0,
    accuracy: null,
    paddock: null,
    stale: false,
    far: false,
  }
  const stop: (() => void)[] = []

  $: machine = machineFor(marker.type)
  $: trailOn = recording.phase === "on" || recording.phase === "stopping"
  $: operations = ($operationStore ?? []) as Operation[]
  $: operation = ($selectedOperationStore ?? null) as Operation | null
  $: engine?.setOperation(operation)
  $: selectedCrew = selectedCrewId
    ? (crew.find((person) => person.id === selectedCrewId) ?? null)
    : null
  $: onlineCrew = crew.filter((person) => person.online)

  $: status =
    gps === "live"
      ? !online
        ? { tone: "warn", text: "No signal · saving" }
        : readout.stale
          ? { tone: "warn", text: "Looking for GPS" }
          : { tone: "live", text: "Live" }
      : gps === "asking"
        ? { tone: "warn", text: "Finding you" }
        : { tone: "off", text: "Location off" }

  // The first real fix ends the join flow.
  $: if (phase === "join" && step === "locate" && gps === "live") enterMap()
  // Keep "centred" meaning centred in the part of the map that isn't covered.
  $: railOn = wide && !railShut
  $: engine?.setInsets(
    railOn ? 352 : 0,
    wide ? 0 : crewCard && !cardOpen ? Math.max(76, crewCardH + 24) : 76,
  )
  // Who last changed the picked pin, with what they drive.
  $: pinWho = whoIs(selectedPin?.by ?? null, crew, self)
  function whoIs(id: string | null, others: CrewRow[], me: CrewRow | null) {
    if (!id) return null
    const person =
      others.find((row) => row.id === id) ?? (id === userId ? me : null)
    return person
      ? {
          name: id === userId ? myName || "You" : person.name,
          type: person.type as string,
          colour: person.colour,
        }
      : id === userId
        ? { name: myName || "You", type: "", colour: "" }
        : null
  }

  onMount(() => {
    secure = window.isSecureContext
    online = navigator.onLine
    const goOnline = () => (online = true)
    const goOffline = () => (online = false)
    window.addEventListener("online", goOnline)
    window.addEventListener("offline", goOffline)

    // A cab-mounted tablet (or a desktop) gets the side rail.
    const query = window.matchMedia(
      "(min-width: 860px) and (min-height: 480px) and (orientation: landscape)",
    )
    wide = query.matches
    const onQuery = (e: MediaQueryListEvent) => (wide = e.matches)
    query.addEventListener("change", onQuery)
    stop.push(
      () => window.removeEventListener("online", goOnline),
      () => window.removeEventListener("offline", goOffline),
      () => query.removeEventListener("change", onQuery),
    )

    if (userId)
      loadFarmChoices(userId, $profileStore?.recent_maps ?? [])
        .then((list) => (farms = list))
        .catch(() => {})
    if (!mapId || !userId) return

    const created = new LiveEngine(mapEl, PUBLIC_MAPBOX_ACCESS_TOKEN, {
      userId,
      mapId,
      me: marker,
      base: lookOf(baseKey),
      imagery: imageryOf(baseKey),
      pinSettings,
    })
    engine = created
    // (On the dev server only: the engine within reach of the console, and
    // of the tests that drive this page.)
    if (import.meta.env.DEV)
      (window as unknown as { __engine: unknown }).__engine = created
    created.setTrailLevel(trailLevel)
    // Holding a finger on the map drops the default pin there (or the one
    // whose button is pressed), as the current viewer does.
    created.onGround = (outline) => buildPaddock(outline)
    // Trails whose stray GPS was hidden on this device stay that way.
    created.setTrailFixes(load<string[]>("trail-fixes") ?? [])
    created.onTrailFixes = (ids) => save("trail-fixes", ids)
    created.onAway = () => {
      // A tap on open ground puts these away (and does no more): the
      // connection card, "stop the trail?" (the trail carries on), a bin.
      if (netOpen) {
        netOpen = false
        return true
      }
      if (stopAsk && recording.phase !== "stopping") {
        stopAsk = false
        return true
      }
      if (!binOpen) return false
      binOpen = null
      return true
    }
    created.onHold = (at) => {
      if (guest) return
      const kind = quickKinds[0]
      created.dropPin(kind, at)
      say(`${pinName(kind)} dropped`)
    }
    stop.push(
      created.gps.subscribe((v) => (gps = v)),
      created.follow.subscribe((v) => (follow = v)),
      created.linked.subscribe((v) => (linked = v)),
      created.bearing.subscribe((v) => (bearing = v)),
      created.crew.subscribe((v) => (crew = v)),
      created.selectedPin.subscribe((v) => (selectedPin = v)),
      created.selectedPaddock.subscribe((v) => (selectedPaddock = v)),
      created.selectedTrail.subscribe((v) => {
        selectedTrail = v
        if (!v) trailScope = null
      }),
      created.crewTrail.subscribe((v) => (crewTrail = v)),
      created.placing.subscribe((v) => (placing = v)),
      created.replay.subscribe((v) => (replay = v)),
      created.trailSuspect.subscribe((v) => (trailSuspect = v)),
      created.devGps.subscribe((v) => (devGps = v)),
      created.setReplay.subscribe((v) => (setReplay = v)),
      created.guide.subscribe((v) => (guide = v)),
      created.boundary.subscribe((v) => (boundaryEdit = v)),
      created.paddockList.subscribe((v) => (paddocks = v)),
      created.farmNames.subscribe((v) => (farmNames = v)),
      created.measure.subscribe((v) => {
        measure = v
        if (!v) drawOnPaddock = false
      }),
      created.movingPin.subscribe((v) => (movingPin = v)),
      created.drawings.subscribe((v) => (drawings = v)),
      created.self.subscribe((v) => (self = v)),
      created.pinCount.subscribe((v) => (pinCount = v)),
      created.following.subscribe((v) => (following = v)),
      created.pins.subscribe((v) => (pins = v)),
      created.lasso.subscribe((v) => (lasso = v)),
      created.paddockTrails.subscribe((v) => (paddockTrails = v)),
      created.pickedFeature.subscribe((v) => (pickedFeature = v)),
      created.pickedDrawing.subscribe((v) => (pickedDrawing = v)),
      created.through.subscribe((v) => (through = v)),
      created.throughStats.subscribe((v) => (throughStats = v)),
      created.grabbed.subscribe((item) => {
        if (item && placePick) {
          // Picked for a message: back to the conversation with it.
          attachPlace({
            label: item.label,
            place: {
              at: item.at,
              label: item.type === "spot" ? "A spot on the map" : item.label,
              refType:
                item.type === "field"
                  ? "field"
                  : item.type === "marker"
                    ? "marker"
                    : null,
              refId: item.type === "spot" ? null : item.id,
            },
          })
          return
        }
        if (!item || !jobDraft) return
        // Tapping something already on the step takes it off again.
        const same = (other: JobItem) =>
          item.type !== "spot" &&
          other.type === item.type &&
          other.id === item.id
        const now = jobDraft.steps[jobDraft.current]?.items ?? []
        setStepItems(
          jobDraft.current,
          now.some(same)
            ? now.filter((other) => !same(other))
            : [...now, item].slice(0, 12),
        )
      }),
      created.broadcast.subscribe((v) => (broadcast = v)),
      created.heard.subscribe((heard) => {
        if (!heard) return
        say(`${heard.name} is broadcasting ${flashLabel(heard.flash)}`, {
          label: "Show me",
          run: () => {
            snack = null
            if (created.lookAt(heard.id)) created.pickCrew(heard.id)
          },
        })
        created.heard.set(null)
      }),
      created.selectedCrew.subscribe((v) => (selectedCrewId = v)),
      created.trails.subscribe((v) => (trails = v)),
      created.farm.subscribe((v) => (farm = v)),
      created.loading.subscribe((v) => (loading = v)),
      created.readout.subscribe((v) => (readout = v)),
      created.recorder.state.subscribe((v) => (recording = v)),
      created.recorder.paused.subscribe((v) => (trailPaused = v)),
      created.problem.subscribe((text) => {
        if (!text) return
        say(text)
        created.problem.set(null)
      }),
    )
    created.connect()

    const post = new Messenger(mapId, userId, myName)
    messenger = post
    stop.push(
      post.conversations.subscribe((v) => (conversations = v)),
      post.unread.subscribe((v) => (unread = v)),
      post.withId.subscribe((v) => (chatWith = v)),
      post.thread.subscribe((v) => (thread = v)),
      post.loading.subscribe((v) => (chatLoading = v)),
      post.sending.subscribe((v) => (chatSending = v)),
      post.arrived.subscribe((message) => {
        if (!message) return
        // One notice a person: their latest replaces their last.
        notices = [
          ...notices.filter((n) => n.from !== message.from),
          message,
        ].slice(-3)
        navigator.vibrate?.(120)
        post.arrived.set(null)
      }),
      post.problem.subscribe((text) => {
        if (!text) return
        say(text)
        post.problem.set(null)
      }),
      () => post.destroy(),
    )
    post.start()

    const jobBoard = new JobBoard(mapId, userId, myName)
    board = jobBoard
    stop.push(
      jobBoard.jobs.subscribe((v) => (jobs = v)),
      // Someone has put a job up for anyone to take.
      jobBoard.posted.subscribe((job) => {
        if (!job) return
        say(
          `${(job.createdByName ?? "Someone").split(/\s+/)[0]} posted a job: ${job.title}`,
          {
            label: "See it",
            run: () => {
              snack = null
              openPanel("jobs")
            },
          },
        )
        jobBoard.posted.set(null)
      }),
      // One of mine has been taken on or finished.
      jobBoard.moved.subscribe((job) => {
        if (!job) return
        const who = (job.takenByName ?? "Someone").split(/\s+/)[0]
        say(
          job.status === "done"
            ? `${who} finished "${job.title}"`
            : `${who} is on "${job.title}"`,
        )
        jobBoard.moved.set(null)
      }),
      jobBoard.problem.subscribe((text) => {
        if (!text) return
        say(text)
        jobBoard.problem.set(null)
      }),
      () => jobBoard.destroy(),
    )
    jobBoard.start()

    // The engine shares nothing with the crew until it has been told what
    // this person drives, so a slow read can't replace their saved machine
    // with the placeholder. Keep trying until the read comes back.
    const readMine = () =>
      loadMyVehicle(userId)
        .then((mine) => {
          if (mine?.marker && !machineTouched) {
            marker = mine.marker
            savedMarker = JSON.stringify(marker)
            // They already have a machine: joining doesn't ask again.
            if (phase === "join" && step === "you") step = "locate"
          }
          hasMachine = !!mine?.marker
          machineRead = true
          created.setMe(marker, false)
          created.resumeBroadcast(mine?.flash)
          settle()
        })
        .catch(() => {
          machineRead = true
          settle()
          readTimer = setTimeout(readMine, 5000)
        })
    readMine()

    loadBroadcastChoices(mapId)
      .then((choices) => (broadcastChoices = choices))
      .catch(() => {})
    const ticking = setInterval(() => (now = Date.now()), 1000)
    stop.push(() => clearInterval(ticking))

    // Is location already allowed? (Browsers that can't say are asked.)
    const known = (yes: boolean) => {
      allowed = yes
      settle()
    }
    if (secure && navigator.permissions?.query)
      navigator.permissions
        .query({ name: "geolocation" })
        .then((result) => known(result.state === "granted"))
        .catch(() => known(false))
    else known(false)
  })

  // Once it is known what they drive and whether location is on: with
  // location on they go straight to the map (and are asked who is driving);
  // otherwise the location prompt is the first thing they see.
  function settle() {
    if (settled || !machineRead || allowed === null) return
    settled = true
    if (allowed && gps === "idle") engine?.startGps()
    // Someone only looking on isn't asked again once they have been in.
    if (guest ? allowed || joinedBefore : allowed && hasMachine) enterMap()
  }

  onDestroy(() => {
    clearTimeout(saveTimer)
    clearTimeout(readTimer)
    clearTimeout(snackTimer)
    clearInterval(driverTimer)
    stop.forEach((fn) => fn())
    engine?.destroy()
  })

  function say(text: string, action?: { label: string; run: () => void }) {
    snack = { text, action }
    clearTimeout(snackTimer)
    snackTimer = setTimeout(() => (snack = null), action ? 7000 : 4500)
  }

  // ── Machine ──
  function changeMachine(detail: {
    type: string
    colour: string
    swath: number
  }) {
    machineTouched = true
    marker = {
      ...marker,
      type: detail.type,
      bodyColor: detail.colour,
      swath: detail.swath,
      size: machineFor(detail.type).size,
    }
    engine?.setMe(marker, false)
    // People try a few before settling: save once they stop.
    clearTimeout(saveTimer)
    saveTimer = setTimeout(saveMachine, 1500)
  }

  function saveMachine() {
    clearTimeout(saveTimer)
    const now = JSON.stringify(marker)
    if (now === savedMarker || guest) return
    savedMarker = now
    engine?.setMe(marker, true)
  }

  // ── Joining ──
  function enterMap() {
    saveMachine()
    if (mapId) {
      const joined = load<string[]>("joined") ?? []
      if (!joined.includes(mapId)) save("joined", [...joined, mapId].slice(-20))
    }
    phase = "map"
    askDriver()
  }

  // ── Who is driving: confirmed with a tap on every visit ──
  const DRIVER_WAIT = 10
  let driverAsked = false
  /** The name on offer, and whether saying yes has to set it first. */
  let driverOffer: { name: string; operator: Operator | null } | null = null
  let driverLeft = 0
  let driverTimer: ReturnType<typeof setInterval> | undefined

  async function askDriver() {
    if (driverAsked || guest || !mapId) return
    driverAsked = true
    // The account's own check for who is driving may still be on its way.
    for (let i = 0; i < 8 && !$operatorStore.operator; i++)
      await new Promise((done) => setTimeout(done, 250))
    const current = $operatorStore.operator
    if (current) {
      driverOffer = { name: current.name, operator: null }
      // (The rest of the farm's profiles, to pick someone else from.)
      operatorApi.getMapOperators(mapId).then((list) => (operators = list))
    } else {
      // Nobody set yet: offer their own name, from the list if it is there.
      operators = await operatorApi.getMapOperators(mapId)
      const mine = myName.trim().toLowerCase()
      const match = operators.find((o) => o.name.trim().toLowerCase() === mine)
      if (!$profileStore?.full_name) {
        driverOnly = true
        operatorAsk = true
        return
      }
      driverOffer = { name: match?.name ?? myName, operator: match ?? null }
    }
    driverLeft = DRIVER_WAIT
    clearInterval(driverTimer)
    driverTimer = setInterval(() => {
      driverLeft -= 1
      if (driverLeft <= 0) confirmDriver(true)
    }, 1000)
  }

  // Yes (or the wait ran out, which assumes yes when a driver was already
  // set and changes nothing when one wasn't).
  async function confirmDriver(expired = false) {
    const offer = driverOffer
    clearInterval(driverTimer)
    driverOffer = null
    if (!offer || !mapId) return
    if ($operatorStore.operator) {
      if (expired) say(`Driving as ${offer.name}`)
      return
    }
    if (expired) return
    const chosen = offer.operator
      ? await operatorApi.selectOperator(offer.operator.id, mapId)
      : await operatorApi.createAndSelectOperator(mapId, offer.name)
    if (!chosen) say("Couldn't set who's driving. Try again from Profile.")
  }

  // The profile picker. Touching anything but the offer stops its count.
  function holdDriver() {
    clearInterval(driverTimer)
    if (driverOffer) driverLeft = 0
  }
  function closeProfile() {
    clearInterval(driverTimer)
    driverOffer = null
    operatorAsk = false
    driverOnly = false
  }
  // Someone else from the list (or a new name).
  function pickProfile(choice: Operator | null, name = "") {
    if (driverOffer) {
      // On the way in it only sets who is driving; no trail starts.
      clearInterval(driverTimer)
      driverOffer = null
      driverOnly = true
      operatorAsk = true
    }
    operatorName = name
    chooseOperator(choice)
  }

  function askForLocation() {
    panelOpen = false
    step = "locate"
    phase = "join"
  }

  async function switchFarm(id: string) {
    const target = farms.find((choice) => choice.id === id)
    switching = target?.name ?? "the farm"
    saveMachine()
    const result = await mapApi.connectToMap(id)
    if (result?.success) {
      window.location.reload()
      return
    }
    switching = null
    say("Couldn't open that farm. Try again.")
  }

  function leave(where: "dashboard" | "viewer") {
    saveMachine()
    // The current viewer opens its own live link to the crew: give it a
    // clean page rather than handing over mid-flight.
    if (where === "viewer") window.location.href = "/account/mapviewer"
    else goto("/account")
  }

  // ── Map look ──
  function setBase(key: string) {
    baseKey = key
    engine?.setBase(lookOf(key), imageryOf(key))
  }
  function setTrailLevel(level: TrailLevel) {
    trailLevel = level
    save("trail-level", level)
    engine?.setTrailLevel(level)
  }
  function pickTrailPalette(palette: TrailPalette) {
    trailPalette = palette
    save("trail-palette", palette)
    if (engine) engine.setTrailPalette(palette)
    else setTrailPalette(palette)
  }
  function setMenuLook(look: MenuLook) {
    menuLook = look
    save("menu-look", look)
  }
  function setPinStyle(style: PinStyle) {
    pinLook = style
    save("pin-style", style)
    pinStyle.set(style)
    engine?.redrawPins()
  }
  function setBaseDefault(key: string) {
    baseDefault = key
    save("base-default", key)
    say(
      `The map opens in ${
        baseChoices.find((choice) => choice.key === key)?.label ?? "this look"
      } from now on`,
    )
  }

  // Say which way up the map is for a moment after it changes.
  let followHint = false
  let followHintTimer: ReturnType<typeof setTimeout>
  function cycleFollow() {
    // Locked to the machine, north up; then locked and turning with it;
    // then north up again and let go. (A drag lets go from either.)
    engine?.setFollow(
      follow === "free" ? "follow" : follow === "follow" ? "cab" : "free",
    )
    followHint = true
    clearTimeout(followHintTimer)
    followHintTimer = setTimeout(() => (followHint = false), 2400)
  }

  function openPanel(view: ToolView = "home") {
    toolView = view
    panelOpen = true
    if (railShut) setRailShut(false)
    // (The rail lists the crew itself.)
    if (wide) crewCard = false
  }
  // Put the rail away (a tablet), or bring it back.
  function setRailShut(shut: boolean) {
    railShut = shut
    save("rail-shut", shut)
    if (shut) toolView = "home"
  }

  function closePanel() {
    panelOpen = false
    saveMachine()
    if (!wide) toolView = "home"
  }

  // ── Pins ──
  async function removeSelectedPin() {
    const pin = selectedPin
    if (!pin || !engine) return
    // (The map says "Deleted" where the pin was; nothing floats off the
    // menu as well.)
    const removed = await engine.removePin(pin.id)
    if (removed)
      say("Pin removed", {
        label: "Undo",
        run: () => {
          snack = null
          engine?.restorePin(removed)
        },
      })
  }

  // Start or stop a trail, or say why one can't start.
  function trailTap() {
    if (trailOn) stopAsk = true
    else if (trailFound) foundDismissed = false
    else if (!readout.hasFix)
      say("A trail needs your location first.", {
        label: "Turn it on",
        run: () => {
          snack = null
          askForLocation()
        },
      })
    else if (!operation)
      say("This farm has no operation to record against yet.")
    // Utes, trucks and chaser bins don't usually lay a trail: check first.
    else if (!machine.paints) {
      panelOpen = false
      roadAsk = true
    } else startTrail()
  }

  // ── Trails ──
  async function startTrail() {
    if (!engine || !mapId) return
    const operator = $operatorStore.operator
    // A trail is signed by whoever is driving; ask once if we don't know.
    if (!operator) {
      operatorAsk = true
      operators = await operatorApi.getMapOperators(mapId)
      return
    }
    panelOpen = false
    const started = await engine.startTrail({
      id: operator.id,
      name: operator.name,
    })
    if (started) say(`Trail started · ${operation?.name ?? ""}`)
    else if (recording.problem) say(recording.problem)
  }

  async function chooseOperator(choice: Operator | null) {
    if (!mapId || operatorBusy) return
    const name = operatorName.trim()
    if (!choice && !name) return
    operatorBusy = true
    const chosen = choice
      ? await operatorApi.selectOperator(choice.id, mapId)
      : await operatorApi.createAndSelectOperator(mapId, name)
    operatorBusy = false
    if (!chosen) {
      say("Couldn't set who's driving. Try again.")
      return
    }
    operatorAsk = false
    operatorName = ""
    if (driverOnly) {
      driverOnly = false
      say(`Trails are now signed by ${chosen.name}`)
    } else startTrail()
  }

  // Change who is driving, from the toolbox.
  async function chooseDriver() {
    if (!mapId) return
    if (!wide) closePanel()
    driverOnly = true
    operatorAsk = true
    operators = await operatorApi.getMapOperators(mapId)
  }

  // ── Layers: the same switches (and saved setting) as the current viewer ──
  $: engine?.setLayers($layerVisibilityStore)
  let layerTimer: ReturnType<typeof setTimeout> | undefined
  function setLayer(key: string, on: boolean) {
    layerVisibilityStore.setVisibility(key, on)
    clearTimeout(layerTimer)
    layerTimer = setTimeout(
      () =>
        userSettingsApi
          .updateLayerVisibilitySettings({ ...$layerVisibilityStore })
          .catch(() => {}),
      1200,
    )
  }

  // ── Messages ──
  // On screen means the panel is showing them (the rail always is).
  $: messagesShown = (railOn || (!wide && panelOpen)) && toolView === "messages"
  $: messenger?.watch(messagesShown)
  $: if (messagesShown) {
    // Looking at the list, or at a conversation: nothing left to announce.
    notices = chatWith ? notices.filter((n) => n.from !== chatWith) : []
    if (chatWith) messenger?.seen()
  }
  $: chatName = chatWith
    ? (crew.find((person) => person.id === chatWith)?.name ??
      conversations.find((convo) => convo.id === chatWith)?.name ??
      "Team member")
    : ""
  $: notice = notices[notices.length - 1] ?? null

  function openChat(id: string | null) {
    messenger?.open(id)
    openPanel("messages")
  }

  // Sending a place: the messages step aside, the next tap on the map (a
  // paddock, a pin, or bare ground) is the place, and the conversation
  // comes back with it ready to send.
  function pickPlace() {
    if (jobDraft) endJob()
    placePick = true
    if (!wide) panelOpen = false
    engine?.setGrabbing(true)
  }
  function endPlacePick() {
    placePick = false
    engine?.setGrabbing(false)
    openPanel("messages")
  }
  function attachPlace(place: { label: string; place: SharedPlace }) {
    // Another place is added to those already waiting (the same one twice
    // is still one).
    const same = (one: { place: SharedPlace }) =>
      one.place.refId
        ? one.place.refId === place.place.refId
        : !place.place.refId &&
          one.place.at[0] === place.place.at[0] &&
          one.place.at[1] === place.place.at[1]
    if (!chatPlaces.some(same)) chatPlaces = [...chatPlaces, place].slice(0, 6)
    endPlacePick()
  }
  // A message carries one place: several go as several messages, the words
  // with the first.
  async function sendChat(body: string, places: SharedPlace[]) {
    const to = chatWith
    if (!to || !messenger) return
    const online = crew.find((person) => person.id === to)?.online ?? false
    if (!places.length) {
      await messenger.send(to, body, null, online)
      return
    }
    for (let i = 0; i < places.length; i++)
      if (!(await messenger.send(to, i ? "" : body, places[i], online))) return
  }
  function sendWhereIAm() {
    const mine = engine?.myPosition()
    if (!mine || !userId) return
    attachPlace({
      label: "Where I am now",
      place: {
        at: mine,
        label: `${myName.trim().split(/\s+/)[0]} is here`,
        refType: "vehicle",
        refId: userId,
      },
    })
  }

  // ── Jobs: something to do at a place, for one person or for anyone ──
  $: jobsWaiting = jobs.filter(
    (job) =>
      job.status !== "done" &&
      (job.takenBy === userId ||
        (job.assignedTo === userId && job.status === "open")),
  ).length
  $: jobCrew = crew.filter((person) => !person.guest)

  function startJob(to: string | null = null) {
    const picked = engine?.pickedItem()
    shownJob = null
    jobDraft = {
      to,
      title: "",
      note: "",
      steps: [{ title: "", items: picked ? [picked] : [] }],
      current: 0,
    }
    if (!wide) panelOpen = false
    engine?.setGrabbing(true)
  }

  function endJob() {
    jobDraft = null
    engine?.setGrabbing(false)
  }

  function setStepItems(index: number, items: JobItem[]) {
    if (!jobDraft) return
    jobDraft = {
      ...jobDraft,
      steps: jobDraft.steps.map((step, i) =>
        i === index ? { ...step, items } : step,
      ),
    }
  }

  function addToStep(item: JobItem) {
    if (!jobDraft) return
    setStepItems(jobDraft.current, [
      ...jobDraft.steps[jobDraft.current].items,
      item,
    ])
  }

  function addWhereIAm() {
    const mine = engine?.myPosition()
    if (mine)
      addToStep({ type: "spot", id: null, label: "Where I was", at: mine })
  }

  // Where someone on the crew is right now, as a place for the step.
  function addCrewSpot(id: string) {
    const at = engine?.crewPosition(id)
    const person = crew.find((row) => row.id === id)
    if (at && person)
      addToStep({
        type: "spot",
        id: null,
        label: `Where ${person.name.split(/\s+/)[0]} was`,
        at,
      })
    else say("They aren't on the map right now.")
  }

  // A line to follow or an area to work, drawn for the step being added to.
  function drawForJob(kind: "polygon" | "line") {
    engine?.setMeasuring(true, kind, true)
    engine?.setMeasureColour("#F7DB5C")
  }

  // What a tap adds to the step being worked on, as chosen on that step:
  // a place, or the next corner of an area or a line being drawn for it.
  $: jobMode = (
    measure?.forJob ? (measure.kind === "line" ? "line" : "area") : "place"
  ) as "place" | "area" | "line"
  function setJobMode(mode: "place" | "area" | "line") {
    if (mode === jobMode) return
    if (mode === "place") engine?.cancelDrawing()
    else if (measure?.forJob)
      engine?.setMeasureKind(mode === "line" ? "line" : "polygon")
    else drawForJob(mode === "line" ? "line" : "polygon")
  }

  function addDrawnToJob() {
    const drawn = engine?.takeDrawn()
    if (!drawn) return
    addToStep({
      type: drawn.kind === "line" ? "line" : "area",
      id: null,
      label: `${drawn.kind === "line" ? "Line" : "Area"} · ${sizeOf(drawn.kind, drawn.points)}`,
      at: drawn.points[0],
      points: drawn.points,
    })
  }

  // The places of the job being built (or looked at) are marked on the map.
  $: engine?.setJobShapes(jobDraft?.steps ?? shownJob?.steps ?? null)
  $: jobPlaces = jobDraft
    ? jobDraft.steps.reduce((sum, step) => sum + step.items.length, 0)
    : 0

  function showJob(job: Job) {
    shownJob = job
    engine?.showJob(job.items)
    if (!wide) closePanel()
  }

  let giving = false
  async function giveJob() {
    const draft = jobDraft
    const title = draft?.title.trim() ?? ""
    if (!draft || !title || !jobPlaces || giving || !board) return
    giving = true
    const job = await board.post({
      assignedTo: draft.to,
      title: title.slice(0, 80),
      note: draft.note.trim().slice(0, 500),
      // A step with nothing in it and nothing said is left out.
      steps: draft.steps
        .filter((step) => step.items.length || step.title.trim())
        .map((step) => ({
          title: step.title.trim().slice(0, 80),
          items: step.items,
        })),
    })
    giving = false
    if (!job) return
    // Given to one person: it also lands in their messages, so they are
    // told (and their phone is, if they haven't got the map open).
    const person = draft.to
      ? crew.find((member) => member.id === draft.to)
      : null
    if (draft.to)
      await messenger?.send(draft.to, "", null, person?.online ?? false, job)
    say(
      person
        ? `Job given to ${person.name.split(/\s+/)[0]}`
        : "Job posted for anyone on the crew",
    )
    endJob()
  }

  // ── Crew: following, inviting, removing ──
  $: followed = following
    ? (crew.find((person) => person.id === following?.id) ?? null)
    : null
  // One button, three states: follow them (north up), ride along (the map
  // turns the way they are heading), then off again.
  function cycleTail(id: string) {
    const now = following?.id === id ? following.mode : null
    if (now === "cab") engine?.followCrew(null)
    else if (!engine?.followCrew(id, now === "follow" ? "cab" : "follow"))
      say("They aren't on the map to follow yet.")
  }
  $: tailMode =
    selectedCrew && following?.id === selectedCrew.id ? following.mode : null

  // Who is in someone's machine, when it isn't said by the account's own
  // name already ("Mick Harris" driven by "Mick").
  function drivenBy(person: CrewRow) {
    const driver = (person.driver ?? "").trim()
    const d = driver.toLowerCase()
    const a = person.name.trim().toLowerCase()
    return driver && !a.startsWith(d) && !d.startsWith(a) ? driver : ""
  }

  // From the log: a trail still being laid picks the machine laying it,
  // a finished one opens that trail.
  function logCrew(account: string) {
    const id = account === userId ? ME : account
    if (id === ME ? !self : !engine?.lookAt(id)) {
      say(
        id === ME
          ? "You aren't on the map yet."
          : "That machine isn't on the map right now.",
      )
      return
    }
    engine?.pickCrew(id)
    if (id === ME) engine?.setFollow("follow")
  }
  function logTrail(trail: { id: string; operation: string }) {
    if (!trails.some((t) => t.id === trail.id)) {
      say(
        trail.operation && trail.operation !== operation?.name
          ? `That trail is in ${trail.operation}. Switch to ${trail.operation} to see it.`
          : "That trail isn't on the map any more.",
      )
      return
    }
    pickTrail(trail.id)
  }

  // Someone picked in the crew list: found on the map, with their card up.
  // (On a phone the list is a card too, and comes back when theirs goes.)
  function lookCrew(id: string) {
    if (id === ME) engine?.setFollow("follow")
    else if (engine?.lookAt(id)) engine.pickCrew(id)
    else return
    if (!wide) closePanel()
  }

  // Home: back to the view the map opens on, the main body of the farm.
  function goHome() {
    if (!engine?.fitFarm(900, false)) say("This farm has no paddocks yet.")
  }

  // Put back what a row of the log did (or do it over again).
  async function undoLog(what: LogUndo) {
    const ok = (await engine?.undoLogged(what)) ?? false
    if (ok)
      say(
        what.kind === "restore"
          ? "Pin put back"
          : what.kind === "remove"
            ? "Pin removed"
            : what.kind === "move"
              ? "Pin moved back"
              : "Pin changed back",
      )
    return ok
  }

  // ── Grain bins ──
  // A bin's menu opens beside the bin when the bin is tapped. From its
  // button on the map it opens as a card, without going to the bin.
  $: binPin = binOpen ? (pins.find((pin) => pin.id === binOpen) ?? null) : null
  // Picking anything else on the map puts the bin's card away.
  $: if (binOpen && (selectedPin || selectedCrew || selectedPaddock))
    binOpen = null
  /** The bins with a button on the map, by name, and what each button says. */
  $: binRail = guest
    ? []
    : pins
        .filter((pin) => isGrainBinIcon(pin.iconClass) && pin.binButton)
        .map((pin) => {
          const size =
            pin.capacity && pin.capacity > 0
              ? pin.capacity
              : grainBinDefaultCapacity(pin.iconClass)
          const tonnes = (size * Math.max(0, Math.min(100, pin.fill))) / 100
          return {
            pin,
            name: pin.note || grainBinName(pin.iconClass),
            tonnes:
              tonnes >= 10 ? Math.round(tonnes) : Math.round(tonnes * 10) / 10,
          }
        })
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, 6)
  /** What the farm's bins hold, to offer on another bin. */
  $: grainsKnown = [
    ...new Set(
      pins
        .filter((pin) => isGrainBinIcon(pin.iconClass) && pin.grainType.trim())
        .map((pin) => pin.grainType.trim()),
    ),
  ]
  function openBin(id: string) {
    engine?.clearSelection()
    binOpen = id
    if (!wide) closePanel()
  }

  // Pause the trail being laid, or carry on with it.
  function pauseTap() {
    if (!engine) return
    if (trailPaused) {
      if (engine.resumeTrail()) say("Trail going again")
    } else if (engine.pauseTrail())
      say("Trail paused. What you drive now shows as a dotted line.")
  }

  function setHideStale(on: boolean) {
    hideStale = on
    save("hide-stale", on)
  }

  async function openInvite() {
    if (!wide) panelOpen = false
    invite = { link: null }
    try {
      const link = await createGuestInvite()
      if (invite) invite = { link }
    } catch {
      invite = null
      say("Couldn't make an invite link. Try again.")
    }
  }

  $: teamLink = `https://www.skanfarming.com.au/login?map_code=${
    $connectedMapStore?.join_code || mapId || ""
  }`
  async function copyLink(link: string) {
    try {
      await navigator.clipboard.writeText(link)
      copied = link
      setTimeout(() => (copied = ""), 2000)
    } catch {
      say("Couldn't copy it. Press and hold the link instead.")
    }
  }
  function shareLink(link: string) {
    navigator
      .share?.({ title: `Join ${farmName} on AgSKAN`, url: link })
      .catch(() => {})
  }

  async function removeCrew(person: {
    id: string
    guest: boolean
    name: string
  }) {
    if (guest || !(person.guest || isOwner)) return
    try {
      await removeFromMap({ id: person.id, guest: person.guest })
      if (selectedCrewId === person.id) engine?.selectedCrew.set(null)
      say(`${person.name} was taken off this map`)
    } catch {
      say("Couldn't take them off the map. Try again.")
    }
  }

  // What has been written into paddocks on this map before: each crop and
  // the varieties entered with it, the most used first.
  $: cropsUsed = (() => {
    const found = new Map<
      string,
      { crop: string; count: number; varieties: Map<string, number> }
    >()
    for (const paddock of paddocks) {
      const crop = paddock.crop.trim()
      if (!crop) continue
      const key = crop.toLowerCase()
      const entry = found.get(key) ?? { crop, count: 0, varieties: new Map() }
      entry.count++
      const variety = paddock.variety.trim()
      if (variety)
        entry.varieties.set(variety, (entry.varieties.get(variety) ?? 0) + 1)
      found.set(key, entry)
    }
    return [...found.values()]
      .sort((a, b) => b.count - a.count)
      .map((entry) => ({
        crop: entry.crop,
        varieties: [...entry.varieties.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([variety]) => variety),
      }))
  })()

  // ── Pins: the colour a kind gets, finding one, removing several ──
  function setTypeColour(iconClass: string, colour: string) {
    const perType = { ...($userSettingsStore.markerTypeDefaultColors ?? {}) }
    if (colour === "default") delete perType[iconClass]
    else perType[iconClass] = colour
    userSettingsApi
      .updateMarkerDefaultColors(
        "single",
        $userSettingsStore.markerDefaultColor ?? "default",
        perType,
      )
      .catch(() => say("That colour didn't save. Try again."))
  }

  function startLasso() {
    if (!wide) panelOpen = false
    engine?.startLasso()
  }

  async function removeLassoed() {
    const removed = (await engine?.removeLassoed()) ?? []
    if (!removed.length) return
    say(`${removed.length} ${removed.length === 1 ? "pin" : "pins"} removed`, {
      label: "Undo",
      run: () => {
        snack = null
        engine?.restorePins(removed)
      },
    })
  }

  // ── Keeping what the draw tool has drawn ──
  $: if (!measure) {
    keepStep = false
    cutAsk = false
    keepLabel = ""
    paddockFor = null
  }
  $: canKeep =
    !!measure &&
    !measure.drawing &&
    measure.points >= (measure.kind === "line" ? 2 : 3)

  async function keepOnPaddock() {
    const name = measure?.paddock?.name
    if (await engine?.keepOnPaddock(keepLabel, drawColourNow))
      say(`Kept on ${name ?? "the paddock"}`)
  }
  // The pin starts in the middle of the drawing and is dragged into place.
  function keepAsPin() {
    engine?.startPlacing(pinKind)
  }
  async function placePin() {
    if (await engine?.confirmPlacing(keepLabel, drawColourNow))
      say("Pin placed with the drawing on it")
  }
  async function keepAsPaddock() {
    const name = keepLabel.trim()
    if (await engine?.keepAsPaddock(name, paddockFor || null))
      say(`${name || "New paddock"} is now a paddock`)
  }
  const PIN_COLOURS = [
    "default",
    "red",
    "orange",
    "yellow",
    "green",
    "skyblue",
    "blue",
    "purple",
    "pink",
    "black",
  ]
  const pinSwatch = (key: string) =>
    key === "default"
      ? PIN_DEFAULT
      : key === "black"
        ? "#15261C"
        : markerColor(key, "circle-fill").dark
  async function cutOut() {
    const paddock = measure?.paddock
    if (paddock && (await engine?.cutFromPaddock()))
      say(
        `Cut out of ${paddock.name}`,
        offerBoundaryUndo(paddock.id, paddock.name),
      )
  }

  // ── What is attached to the picked pin ──
  let drawings: PinDrawing[] = []
  $: pinDrawings = selectedPin
    ? drawings.filter((drawing) => drawing.pinId === selectedPin?.id)
    : []
  let photoLinks: Record<string, string> = {}
  const linking = new Set<string>()
  let uploading = false
  let drawColourNow = load<string>("draw-colour") ?? DRAWING_COLOURS[0]
  $: wantPhotos(selectedPin)

  // The photo files are private: fetch a link for each one not yet seen.
  function wantPhotos(pin: LivePin | null) {
    const missing = (pin?.photos ?? []).filter(
      (photo) => !photoLinks[photo.id] && !linking.has(photo.id),
    )
    if (!missing.length) return
    missing.forEach((photo) => linking.add(photo.id))
    loadPhotoLinks(missing)
      .then((links) => (photoLinks = { ...photoLinks, ...links }))
      .catch(() => {})
      .finally(() => missing.forEach((photo) => linking.delete(photo.id)))
  }

  // A phone photo is far bigger than a pin needs: send a smaller copy.
  async function shrink(file: File): Promise<Blob> {
    try {
      const picture = await createImageBitmap(file)
      const scale = Math.min(1, 1600 / Math.max(picture.width, picture.height))
      const canvas = document.createElement("canvas")
      canvas.width = Math.round(picture.width * scale)
      canvas.height = Math.round(picture.height * scale)
      canvas
        .getContext("2d")
        ?.drawImage(picture, 0, 0, canvas.width, canvas.height)
      return await new Promise<Blob>((done) =>
        canvas.toBlob((blob) => done(blob ?? file), "image/jpeg", 0.8),
      )
    } catch {
      return file
    }
  }

  async function addPhoto(file: File) {
    const pin = selectedPin
    if (!pin || !engine || uploading) return
    uploading = true
    const added = await engine.addPhoto(pin.id, await shrink(file))
    uploading = false
    if (added) say("Photo added")
  }

  async function removePhoto(photo: PinPhoto) {
    if (selectedPin && (await engine?.removePhoto(selectedPin.id, photo)))
      say("Photo removed")
  }

  function chooseDrawColour(colour: string) {
    drawColourNow = colour
    save("draw-colour", colour)
    // Shown on the map straight away, whichever kind of drawing this is.
    engine?.setDrawingColour(colour)
    engine?.setMeasureColour(colour)
  }

  async function saveDrawing() {
    if (await engine?.saveDrawing()) say("Drawing saved")
  }

  // ── A picked trail's direction marks ──
  let trailMarks = load<{ centre: boolean; arrows: boolean }>(
    "trail-marks",
  ) ?? {
    centre: false,
    arrows: false,
  }
  // (The centre line is always drawn; only the arrows are a choice.)
  $: engine?.setTrailMarks({ ...trailMarks, centre: true })
  function toggleMark(mark: "centre" | "arrows") {
    trailMarks = { ...trailMarks, [mark]: !trailMarks[mark] }
    save("trail-marks", trailMarks)
  }

  // ── Measuring ──
  function startMeasuring() {
    panelOpen = false
    engine?.setMeasuring(true)
  }
  $: areaNow = measure
    ? (measure.drawing?.kind ?? measure.kind) !== "line"
    : true
  const metres = (m: number) =>
    m >= 1000 ? `${(m / 1000).toFixed(2)}` : `${Math.round(m)}`

  $: mineSelected = selectedCrewId === ME
  $: broadcastLeft = broadcast
    ? Math.max(0, broadcast.started + BROADCAST_FOR - now)
    : 0

  // Throwing the running trail away takes a second tap.
  let deleteArmed = false
  let deleteTimer: ReturnType<typeof setTimeout> | undefined
  $: if (!stopAsk) deleteArmed = false
  async function deleteRunningTrail() {
    if (!deleteArmed) {
      deleteArmed = true
      clearTimeout(deleteTimer)
      deleteTimer = setTimeout(() => (deleteArmed = false), 3500)
      return
    }
    deleteArmed = false
    if (await engine?.discardTrail()) {
      stopAsk = false
      say("Trail deleted")
    }
  }

  // ── The connection: what the status chip stands for, spelled out ──
  let netOpen = false
  // (Counted on the second, with the clock.)
  $: trailPoints = trailOn && now ? (engine?.recorder.points.length ?? 0) : 0
  $: trailSaved = Math.max(0, trailPoints - recording.waiting)

  async function stopTrail() {
    if (!engine) return
    const finished = await engine.stopTrail()
    // Still running: it couldn't be saved, and the card says why.
    if (recording.phase !== "off") return
    stopAsk = false
    if (!finished) {
      say("That trail was too short to keep.")
      return
    }
    if (
      finished.sprayRecords.length &&
      $userSettingsStore.sprayConfirmEnabled !== false
    )
      sprayCard = finished
    else say("Trail saved")
  }

  async function confirmSpray() {
    const card = sprayCard
    if (!card) return
    sprayCard = null
    const operator = $operatorStore.operator
    const ok = await confirmSprayRecords(
      card.info.id,
      operator ? { id: operator.id, name: operator.name } : null,
    )
    say(
      ok
        ? "Spray record confirmed"
        : "Couldn't confirm it. Find it in Records.",
    )
  }

  // A new operation, made from the toolbox's heading: added to this map and
  // put on the map straight away, as the dashboard does.
  async function addOperation(name: string, year: number) {
    if (!mapId || !userId || trailOn) return
    const result = await operationApi.addOperation(mapId, name, year)
    const made = result?.success ? (result.operation as Operation | null) : null
    if (!made) {
      say("Couldn't add that operation. Try again.")
      return
    }
    operationStore.update((list) => [...(list ?? []), made as never])
    selectedOperationStore.set(made as never)
    profileStore.update((profile) => ({
      ...profile,
      selected_operation_id: made.id,
    }))
    await operationApi.updateSelectedOperation(userId, made.id)
    say(`${made.name} added`)
  }

  async function chooseOperation(next: Operation) {
    if (!userId || next.id === operation?.id || trailOn) return
    const result = await operationApi.updateSelectedOperation(userId, next.id)
    if (!result?.success) {
      say("Couldn't switch operation. Try again.")
      return
    }
    selectedOperationStore.set(next as never)
    profileStore.update((profile) => ({
      ...profile,
      selected_operation_id: next.id,
    }))
  }

  function onKey(event: KeyboardEvent) {
    if (event.key !== "Escape") return
    if (driverOffer) confirmDriver()
    else if (placing) engine?.cancelPlacing()
    else if (measure?.forJob) engine?.cancelDrawing()
    else if (jobDraft) endJob()
    else if (lasso) engine?.cancelLasso()
    else if (invite) invite = null
    else if (measure?.drawing) engine?.cancelDrawing()
    else if (measure) engine?.setMeasuring(false)
    else if (movingPin) engine?.movePin(null)
    else if (roadAsk) roadAsk = false
    else if (stopAsk) stopAsk = false
    else if (operatorAsk) operatorAsk = false
    else if (selectedPin || selectedCrewId || selectedPaddock || selectedTrail)
      engine?.clearSelection()
    else closePanel()
  }

  const rise = (node: Element) => {
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches
    return fly(node, { y: reduced ? 0 : 16, duration: reduced ? 0 : 150 })
  }

  // A trail of theirs is running that this screen didn't start.
  $: trailFound = recording.phase === "found"
  let foundDismissed = false
  const clock = (t: number) =>
    new Date(t).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    })

  function carryOnHere(thenStop = false) {
    engine?.carryOnTrail()
    if (thenStop) stopAsk = true
    else say("This screen is recording the trail now")
  }

  $: cardOpen =
    !!driverOffer ||
    !!paddockAsk ||
    !!boundaryEdit ||
    !!placing ||
    !!jobDraft ||
    !!lasso ||
    !!invite ||
    roadAsk ||
    stopAsk ||
    operatorAsk ||
    !!sprayCard ||
    (trailFound && !foundDismissed) ||
    !!selectedCrew ||
    !!binPin ||
    !!selectedPaddock ||
    !!selectedTrail ||
    !!trailSet ||
    !!measure ||
    mineSelected
  // On a phone the crew's card takes the bottom of the map too.
  $: bottomTaken = cardOpen || (crewCard && !railOn)

  // ── A picked trail ──
  const day = (t: number) =>
    new Date(t).toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
    })
  const duration = (ms: number) => {
    const minutes = Math.max(1, Math.round(ms / 60000))
    if (minutes < 60) return `${minutes} min`
    const rest = minutes % 60
    return `${Math.floor(minutes / 60)} h${rest ? ` ${rest} min` : ""}`
  }
  // Follow a trail that has already been driven, as a line to steer by.
  // (`demo`: a made-up machine drives it, to see the guide from anywhere.)
  function followTrail(trail: TrailInfo, demo = false) {
    guideLabel = [day(trail.start), trail.operator].filter(Boolean).join(" · ")
    engine?.startGuide(trail, demo)
  }

  // ── Places as pictures ──
  // A paddock or a pin named in a message, a job or a list is drawn as the
  // thing itself; the parts that draw them look it up here.
  const placePaddocks = writable(new Map<string, Paddock>())
  const placePins = writable(new Map<string, LivePin>())
  const placeLook = writable<(pin: LivePin) => { iconClass: string }>(
    (pin) => ({ iconClass: pin.iconClass }),
  )
  setContext<PlaceBook>(PLACES, {
    paddocks: placePaddocks,
    pins: placePins,
    look: placeLook,
  })
  $: placePaddocks.set(
    new Map(paddocks.map((paddock) => [paddock.id, paddock])),
  )
  $: placePins.set(new Map(pins.map((pin) => [pin.id, pin])))
  $: if (engine) placeLook.set(engine.pinLook)

  // ── A paddock's boundary ──
  const offerBoundaryUndo = (id: string, name: string) => ({
    label: "Undo",
    run: async () => {
      snack = null
      if (await engine?.undoBoundary(id)) say(`${name}'s boundary put back`)
    },
  })
  async function saveBoundary() {
    const edit = boundaryEdit
    const saved = edit ? await engine?.saveEdit(newPaddockName) : false
    if (!edit || !saved) return
    if (edit.creating) {
      say(
        saved.made.length > 1
          ? `${saved.made.map((paddock) => paddock.name).join(" and ")} are now paddocks`
          : `${saved.name} is now a paddock`,
      )
      return
    }
    const made = saved.made.map((paddock) => paddock.name)
    const gone = saved.gone.map((paddock) => paddock.name)
    say(
      made.length
        ? `${edit.name} split: ${[edit.name, ...made].join(" and ")}`
        : gone.length
          ? `${gone.join(" and ")} joined onto ${edit.name}`
          : `${edit.name}'s boundary saved`,
      made.length || gone.length
        ? {
            label: "Undo",
            run: async () => {
              snack = null
              if (await engine?.undoSaved(saved))
                say(
                  made.length
                    ? `${edit.name} is one paddock again`
                    : `${gone.join(" and ")} put back`,
                )
            },
          }
        : offerBoundaryUndo(edit.paddockId, edit.name),
    )
  }

  function trailFacts(trail: TrailInfo) {
    const facts: { value: string; label: string }[] = []
    if (trail.ha !== null)
      facts.push({ value: `${formatHa(trail.ha)} ha`, label: "covered" })
    if (trail.distance)
      facts.push({
        value:
          trail.distance >= 1000
            ? `${(trail.distance / 1000).toFixed(1)} km`
            : `${Math.round(trail.distance)} m`,
        label: "driven",
      })
    if (trail.end)
      facts.push({
        value: duration(trail.end - trail.start),
        label: "start to finish",
      })
    facts.push({
      value: `${trail.width} m`,
      label:
        trail.overlap !== null && trail.overlap !== undefined
          ? `wide · ${Math.round(trail.overlap)}% overlap`
          : "wide",
    })
    return facts
  }
  // The trails the arrows step through: all of the job's, or just the
  // ones through the paddock the trail was picked from.
  $: stepList = trailScope
    ? trails.filter((t) => trailScope?.ids.includes(t.id))
    : trails
  $: trailIndex = selectedTrail
    ? stepList.findIndex((t) => t.id === selectedTrail?.id)
    : -1

  function pickTrail(id: string, thenPlay = false) {
    if (!engine?.pickTrail(id)) {
      say("That trail is still loading.")
      return false
    }
    if (thenPlay) engine.playReplay()
    return true
  }

  // Step to the next trail along the list, round the ends.
  function stepTrail(by: number) {
    const list = stepList
    if (trailIndex < 0 || list.length < 2) return
    const playing = !!replay
    const scope = trailScope
    for (let i = 1; i < list.length; i++) {
      const next = list[(trailIndex + by * i + list.length * i) % list.length]
      if (engine?.pickTrail(next.id)) {
        // (Picking lets go of the last trail, which clears the scope.)
        trailScope = scope
        if (playing) engine.playReplay()
        return
      }
    }
  }

  async function deleteTrail() {
    if (await engine?.deletePickedTrail()) say("Trail deleted")
  }

  const RATES = [1, 2, 4, 8]
  function nextRate() {
    if (!replay) return
    engine?.setReplayRate(
      RATES[(RATES.indexOf(replay.rate) + 1) % RATES.length],
    )
  }
</script>

<svelte:window on:keydown={onKey} on:pointerdown|capture={tapAway} />

<svelte:head>
  <title>Map · {farmName} · AgSKAN</title>
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1, viewport-fit=cover"
  />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link
    rel="preconnect"
    href="https://fonts.gstatic.com"
    crossorigin="anonymous"
  />
  <link
    rel="stylesheet"
    href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500..800&family=JetBrains+Mono:wght@400;500;700&display=swap"
  />
</svelte:head>

<div
  class="lp-theme mn"
  class:wide
  class:shut={wide && railShut}
  data-ui={menuLook}
>
  <div class="mn-map" bind:this={mapEl}></div>

  {#if switching}
    <div class="mn-cover">
      <span class="mn-spin"><LoaderCircle size={28} /></span>
      <h1>Opening {switching}…</h1>
    </div>
  {:else if !mapId || !userId}
    <!-- ── No farm to show ── -->
    <div class="mn-cover">
      <p class="lp-eyebrow">New map viewer</p>
      <h1>No farm open yet.</h1>
      <p>
        The map shows one farm at a time. Open one of yours, or create or join a
        farm from the dashboard.
      </p>
      {#if farms.length}
        <div class="mn-tools" style="width: min(24rem, 86vw)">
          {#each farms as choice (choice.id)}
            <button
              type="button"
              class="mn-tool"
              on:click={() => switchFarm(choice.id)}
            >
              <span class="text">
                <strong>{choice.name}</strong>
                <span
                  >{choice.owner === "You"
                    ? "Your farm"
                    : `${choice.owner}'s farm`}</span
                >
              </span>
            </button>
          {/each}
        </div>
      {/if}
      <button
        type="button"
        class="lp-btn lp-btn-ghost"
        on:click={() => leave("dashboard")}
      >
        Go to the dashboard
      </button>
    </div>
  {:else if phase === "map"}
    <!-- ── On the map ── -->
    <div class="mn-corner top-left">
      <div class="mn-toprow">
        {#if !railOn}
          <!-- The way into the toolbox: on a phone, and on a tablet while
               the rail is put away. -->
          <button
            type="button"
            class="mn-tools-button"
            aria-label="Toolbox. {onlineCrew.length} of the crew on the map{unread
              ? `, ${unread} unread ${unread === 1 ? 'message' : 'messages'}`
              : ''}"
            on:click={() => openPanel("home")}
          >
            {#if onlineCrew.length}
              <span class="dots" aria-hidden="true">
                {#each onlineCrew.slice(0, 4) as person}
                  <i style="background: {person.colour}"></i>
                {/each}
              </span>
            {/if}
            Tools
            {#if unread}<span class="mn-badge">{unread}</span>{/if}
          </button>
        {/if}
        <button
          type="button"
          class="mn-status {status.tone}"
          aria-expanded={netOpen}
          aria-label="Connection: {status.text}{trailOn
            ? `, ${trailSaved} trail points saved, ${recording.waiting} waiting`
            : ''}"
          on:click={() =>
            status.tone === "off" ? askForLocation() : (netOpen = !netOpen)}
        >
          <!-- (Once it is live, the operation on the map says more than
               "Live" does; the dot still shows the fix is good.) -->
          <span class="dot"></span><span class="name"
            >{status.tone === "live"
              ? (operation?.name ?? status.text)
              : status.text}</span
          >
          {#if trailOn}
            <!-- The trail's points: saved, or waiting for signal. -->
            <span class="sync" class:waiting={recording.waiting > 0 || !online}>
              {#if recording.waiting > 0 || !online}
                <WifiOff size={13} />{recording.waiting}
              {:else}
                <Wifi size={13} />{trailSaved}
              {/if}
            </span>
          {/if}
        </button>
      </div>
      {#if netOpen}
        <!-- ── The connection, spelled out (as the current viewer's trail
             and network panel does) ── -->
        <div class="mn-net" role="dialog" aria-label="Connection">
          <div class="top">
            <strong>Connection</strong>
            <button
              type="button"
              class="mn-icon-button"
              aria-label="Close"
              on:click={() => (netOpen = false)}
            >
              <X size={20} />
            </button>
          </div>
          <dl>
            <div class:bad={gps !== "live" || readout.stale}>
              <dt>Location</dt>
              <dd>
                {gps !== "live"
                  ? gps === "asking"
                    ? "Finding you"
                    : "Off"
                  : readout.stale
                    ? "Looking for GPS"
                    : readout.accuracy !== null
                      ? `Good to ${Math.round(readout.accuracy)} m`
                      : "Live"}
              </dd>
            </div>
            <div class:bad={!online}>
              <dt>Internet</dt>
              <dd>{online ? "Online" : "No signal"}</dd>
            </div>
            <div class:bad={!linked}>
              <dt>Crew link</dt>
              <dd>{linked ? "Connected" : "Reconnecting"}</dd>
            </div>
            <div>
              <dt>Operation</dt>
              <dd>{operation?.name ?? "None"}</dd>
            </div>
          </dl>
          {#if trailOn && recording.trail}
            <p class="lp-eyebrow">
              Trail · started {clock(recording.trail.start)}
            </p>
            <dl class="three">
              <div>
                <dt>Points</dt>
                <dd>{trailPoints}</dd>
              </div>
              <div>
                <dt>Saved</dt>
                <dd>{trailSaved}</dd>
              </div>
              <div class:bad={recording.waiting > 0}>
                <dt>Waiting</dt>
                <dd>{recording.waiting}</dd>
              </div>
            </dl>
            {#if recording.waiting > 0}
              <p class="note">
                {online
                  ? "Sending the points that are waiting."
                  : "No signal: the points are kept on this device and sent when it is back. Keep this page open."}
              </p>
            {/if}
          {:else}
            <p class="note">No trail is being recorded.</p>
          {/if}
        </div>
      {/if}
      {#if devGps}
        <!-- A made-up position is being fed in: say so, and stop it. -->
        <button
          type="button"
          class="mn-chip cast"
          style="--on: #b4236a"
          aria-label="Made-up GPS is on. Tap to stop it"
          on:click={() => engine?.stopDevGps()}
        >
          <span class="dot"></span>Dev GPS · {devGps.mode === "roam"
            ? "roaming"
            : "tap to drive"}
          <X size={14} />
        </button>
      {/if}
      {#if broadcast}
        <button
          type="button"
          class="mn-chip cast"
          style="--on: {broadcast.colour}"
          on:click={() => openPanel("broadcast")}
        >
          <span class="dot"></span>{flashLabel(broadcast)} · {Math.floor(
            broadcastLeft / 60000,
          )}:{String(Math.floor((broadcastLeft % 60000) / 1000)).padStart(
            2,
            "0",
          )}
        </button>
      {/if}
      {#if shownJob && !jobDraft}
        <p class="mn-chip tail job">
          Job: {shownJob.title}
          <button
            type="button"
            aria-label="Stop showing this job"
            on:click={() => (shownJob = null)}
          >
            <X size={16} />
          </button>
        </p>
      {/if}
      {#if placePick}
        <div class="mn-pickbar">
          <p>
            <b>Tap a paddock, a pin or any spot</b>
            to send it{chatName ? ` to ${chatName.split(/\s+/)[0]}` : ""}
          </p>
          {#if readout.hasFix}
            <button type="button" on:click={sendWhereIAm}>
              <LocateFixed size={16} /> Where I am
            </button>
          {/if}
          <button type="button" on:click={endPlacePick}>Cancel</button>
        </div>
      {/if}
      {#if guide}
        <GuideBar
          {guide}
          label={guideLabel}
          on:stop={() => engine?.stopGuide()}
          on:round={() => engine?.turnGuideRound()}
          on:start={(e) => engine?.setGuideStart(e.detail)}
          on:rate={(e) => engine?.setGuideRate(e.detail)}
        />
      {/if}
      {#if loading.paddocks}
        <p class="mn-chip loading">Loading the farm…</p>
      {:else if loading.trails}
        <p class="mn-chip loading">
          Drawing trails · {loading.trails.done}
        </p>
      {:else if gps === "live" && !linked}
        <p class="mn-chip loading">Reconnecting to the crew…</p>
      {/if}
    </div>

    {#if binRail.length && !jobDraft && !boundaryEdit && !measure && !lasso}
      <!-- ── A button for each grain bin: what is in it, at a glance, and
           its card (level and settings) a tap away ── -->
      <div class="mn-corner top-right mn-binrail">
        {#each binRail as bin (bin.pin.id)}
          <button
            type="button"
            class="mn-binbtn"
            class:open={binOpen === bin.pin.id}
            aria-label="{bin.name}: {bin.tonnes} tonnes{bin.pin.grainType
              ? ` of ${bin.pin.grainType}`
              : ''}"
            on:click={() =>
              binOpen === bin.pin.id ? (binOpen = null) : openBin(bin.pin.id)}
          >
            {#if bin.pin.grainType}
              <span class="tag">{bin.pin.grainType}</span>
            {/if}
            <span class="disc">
              <PinArt
                look={engine?.pinLook(bin.pin) ?? {
                  iconClass: bin.pin.iconClass,
                }}
                size={wide ? 46 : 42}
              />
              <b>{bin.tonnes} t</b>
            </span>
          </button>
        {/each}
      </div>
    {/if}

    {#if notice && !messagesShown}
      <!-- ── A message has come in ── -->
      {#key notice.id}
        <div class="mn-notice" role="status" in:rise>
          <button
            type="button"
            class="open"
            on:click={() => notice && openChat(notice.from)}
          >
            <strong>
              <MessageCircle size={15} />
              {notice.fromName ?? "Team member"}{notices.length > 1
                ? ` · ${notices.length - 1} more`
                : ""}
            </strong>
            <span>
              {notice.body ||
                (notice.jobRef ? `Job: ${notice.jobRef.title}` : "") ||
                notice.place?.label ||
                ""}
            </span>
          </button>
          <button
            type="button"
            class="reply"
            on:click={() => notice && openChat(notice.from)}
          >
            Reply
          </button>
          <button
            type="button"
            class="mn-icon-button"
            aria-label="Put this message away"
            on:click={() => (notices = [])}
          >
            <X size={20} />
          </button>
        </div>
      {/key}
    {/if}

    <!-- On a phone a card takes the place of the bottom controls. -->
    <div class="mn-corner bottom-left" class:away={bottomTaken}>
      {#if !railOn}
        <!-- (With the rail up, the crew is listed in it.) -->
        <button
          type="button"
          class="mn-crew-button"
          aria-label="Crew. {onlineCrew.length} on the map now"
          on:click={() => (crewCard = true)}
        >
          <Users size={22} />
          <span>Crew</span>
          {#if onlineCrew.length}<b>{onlineCrew.length}</b>{/if}
        </button>
      {/if}
    </div>
    <!-- Following one of the crew: a marker on the side says so for as
         long as it lasts; tapping it lets go. -->
    {#if following && followed}
      <button
        type="button"
        class="mn-tailing"
        class:cab={following.mode === "cab"}
        aria-label="Following {followed.name}. Tap to stop"
        on:click={() => engine?.followCrew(null)}
      >
        <span class="art">
          <svelte:component
            this={vehicles[followed.type]}
            size="34px"
            bodyColor={followed.colour}
            outlineColor="#ffffff"
            wheelColor="#15261C"
            loadColor="#F7DB5C"
          />
        </span>
        <span class="words">
          <b>{following.mode === "cab" ? "Riding with" : "Following"}</b>
          {followed.name.split(/\s+/)[0]}
        </span>
        <X size={16} />
      </button>
    {/if}

    <!-- The working buttons sit down the right: trail, pin, and where am I
         at the very bottom. -->
    <div class="mn-corner bottom-right" class:away={!wide && bottomTaken}>
      {#if !guest}
        <!-- A button for each default pin, the first one lowest. One tap
               drops its pin where the machine is. Off the first, a "+" then
               shows beside it for a few seconds: the way to the Pins tool. -->
        <div class="mn-quickpins" class:many={quickKinds.length > 1}>
          {#each [...quickKinds].reverse() as kind (kind)}
            <div class="slot">
              {#if pinMore && kind === quickKinds[0]}
                <button
                  type="button"
                  class="more"
                  aria-label="Change the pin buttons, or add one"
                  title="Change the pin buttons, or add one"
                  transition:fade={{ duration: 160 }}
                  on:click={openPins}
                >
                  <Plus size={20} strokeWidth={3} />
                </button>
              {/if}
              <button
                type="button"
                class="pin"
                class:lifted={pinDrag?.kind === kind}
                aria-label="Drop a {pinName(
                  kind,
                )} pin here, or drag it onto the map"
                on:pointerdown={(e) => pinDown(e, kind)}
                on:pointermove={pinMove}
                on:pointerup={pinUp}
                on:pointercancel={pinCancel}
                on:dragstart|preventDefault
                on:click={(e) => e.detail === 0 && pinTap(kind)}
              >
                <PinArt look={choiceLook(kind)} size={wide ? 54 : 50} />
              </button>
            </div>
          {/each}
        </div>
      {/if}
      {#if !guest}
        <!-- Start or stop a trail. While one is being laid the button
               draws a trail over and over, a pause button sits beside it,
               and a tag under it says which of the two it is doing. -->
        <div class="mn-trailwrap">
          {#if trailOn}
            <button
              type="button"
              class="mn-pause"
              class:paused={trailPaused}
              aria-label={trailPaused
                ? "Carry on with the trail"
                : "Pause the trail"}
              transition:fade={{ duration: 160 }}
              on:click={pauseTap}
            >
              {#if trailPaused}
                <Play size={22} fill="currentColor" />
              {:else}
                <Pause size={22} fill="currentColor" />
              {/if}
            </button>
          {/if}
          <button
            type="button"
            class="mn-trail-button"
            class:on={trailOn}
            class:paused={trailPaused}
            disabled={recording.phase === "starting" ||
              recording.phase === "stopping"}
            aria-label={trailOn
              ? "Stop trail"
              : trailFound
                ? "Your running trail"
                : "Start trail"}
            on:click={trailTap}
          >
            <!-- The trail mark; while a trail is being laid it draws
                   itself over and over (and holds still when paused). -->
            <svg
              class="trailmark"
              class:drawing={trailOn}
              viewBox="0 0 32 32"
              aria-hidden="true"
            >
              <path
                d="M30.165 30.887c-1.604 0.076-21.522-0.043-21.522-0.043-12.101-12.151 18.219-16.173-0.521-26.154l-1.311 1.383-1.746-4.582 5.635 0.439-1.128 1.267c23.438 6.83-3.151 19.631 20.594 27.69v0z"
              />
            </svg>
          </button>
          <!-- The tag under it: "Trail", and "Trailing" (pulsing) while
                 one is being laid. -->
          <span
            class="mn-trailpill"
            class:on={trailOn}
            class:paused={trailPaused}
          >
            {trailOn ? (trailPaused ? "Paused" : "Trailing") : "Trail"}
          </span>
        </div>
      {/if}
      <button
        type="button"
        class="mn-follow {follow}"
        disabled={!readout.hasFix}
        aria-label={follow === "free"
          ? "Lock the map to my machine"
          : follow === "follow"
            ? "Locked to my machine, north up. Tap to turn the map with it"
            : "Locked and turning with my machine. Tap for north up and no lock"}
        on:click={cycleFollow}
      >
        {#if follow === "cab"}
          <span class="needle">
            <Navigation size={wide ? 26 : 24} fill="currentColor" />
          </span>
          {#if followHint}<small>Heads up</small>{/if}
          <span class="mn-north" aria-hidden="true">
            <i style="transform: rotate({-bearing}deg)">N</i>
          </span>
        {:else}
          <LocateFixed size={wide ? 28 : 26} />
          {#if followHint}
            <small>{follow === "follow" ? "Locked" : "North, free"}</small>
          {/if}
        {/if}
      </button>
    </div>

    {#if paddockAsk}
      <!-- ── A new paddock: how to make it ── -->
      <div class="mn-card mn-menu" in:rise>
        <div class="mn-card-head">
          <p class="lp-eyebrow">
            New paddock{farmNames.find((f) => f.id === paddockAsk?.farmId)
              ? ` in ${farmNames.find((f) => f.id === paddockAsk?.farmId)?.name}`
              : ""}
          </p>
          <button
            type="button"
            class="mn-icon-button"
            aria-label="Close"
            on:click={() => (paddockAsk = null)}
          >
            <X size={22} />
          </button>
        </div>
        <div class="mn-keep">
          <button type="button" on:click={() => buildPaddock()}>
            <strong>Draw it on the map</strong>
            <span>
              Tap round it, then move corners, cut holes out, add pieces, split
              it or join a neighbour on.
            </span>
          </button>
        </div>
        <div class="mn-keep">
          <button
            type="button"
            disabled={!trails.length}
            on:click={lassoGround}
          >
            <strong>From where a trail went</strong>
            <span>
              {trails.length
                ? "Draw a loop round the worked ground on the map. Every trail of the job inside the loop makes the boundary."
                : "The job on show has no finished trails. Pick another job below."}
            </span>
          </button>
        </div>
        <Dropdown
          label="Trails of"
          placeholder="No job"
          title="Use the trails of"
          disabled={trailOn}
          value={operation?.id ?? ""}
          options={operations.map((option) => ({
            value: option.id,
            label: option.name,
            note: option.year ? String(option.year) : "",
          }))}
          on:change={(e) => {
            const next = operations.find((option) => option.id === e.detail)
            if (next) chooseOperation(next)
          }}
        />
        <div class="mn-keep">
          <button type="button" disabled>
            <strong>Pick it off the imagery</strong>
            <span>
              Not here yet: choosing a boundary found in the satellite picture.
            </span>
          </button>
        </div>
      </div>
    {:else if boundaryEdit?.shape}
      <!-- ── Changing a line or an area that is drawn on a pin ── -->
      <div class="mn-riser" in:rise>
        <ShapeCard
          edit={boundaryEdit}
          on:colour={(e) => engine?.setShapeColour(e.detail)}
          on:undo={() => engine?.undoEdit()}
          on:cancel={() => engine?.cancelEdit()}
          on:save={async () => {
            if (await engine?.saveShape()) say("Drawing changed")
          }}
        />
      </div>
    {:else if boundaryEdit}
      <!-- ── Changing a paddock's boundary ── -->
      <div class="mn-riser" in:rise>
        <BoundaryCard
          bind:name={newPaddockName}
          edit={boundaryEdit}
          colour={paddocks.find((p) => p.id === boundaryEdit?.paddockId)
            ?.colour ?? null}
          priorAt={paddocks.find((p) => p.id === boundaryEdit?.paddockId)?.prior
            ?.t ?? null}
          on:add={(e) => engine?.startAdding(e.detail)}
          on:join={() => engine?.startJoining()}
          on:cancelJoin={() => engine?.cancelJoining()}
          on:undoPoint={() => engine?.undoAdding()}
          on:cancelAdd={() => engine?.cancelAdding()}
          on:doneAdd={() => engine?.finishAdding()}
          on:removeCorner={() => engine?.removeEditCorner()}
          on:removeRing={() => engine?.removeEditRing()}
          on:undo={() => engine?.undoEdit()}
          on:reset={() => engine?.resetEdit()}
          on:prior={() => engine?.usePriorBoundary()}
          on:cancel={() => engine?.cancelEdit()}
          on:save={saveBoundary}
        />
      </div>
    {:else if jobDraft && (!measure || measure.forJob)}
      <!-- ── Putting a job together ── -->
      <div>
        <JobBuilder
          bind:draft={jobDraft}
          {paddocks}
          {drawings}
          crew={jobCrew}
          {giving}
          mode={jobMode}
          hasFix={readout.hasFix}
          spots={crew.filter((row) => row.placed && !row.me)}
          on:mode={(e) => setJobMode(e.detail)}
          on:me={addWhereIAm}
          on:crew={(e) => addCrewSpot(e.detail)}
          on:close={endJob}
          on:post={giveJob}
        />
      </div>
    {:else if lasso?.purpose === "ground"}
      <!-- ── A loop round the ground a trail covered ── -->
      <div class="mn-card" in:rise>
        <p class="lp-eyebrow">New paddock from a trail</p>
        <h2 class="mn-card-title">Draw a loop round the worked ground.</h2>
        <p class="mn-card-text">
          Drag a line on the map right round it. Whatever the trails of
          {operation?.name ?? "this job"} covered inside the loop becomes the boundary;
          the map stays still while you draw.
        </p>
        <div class="mn-card-actions one">
          <button
            type="button"
            class="lp-btn lp-btn-ghost"
            on:click={() => {
              groundFor = null
              engine?.cancelLasso()
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    {:else if lasso}
      <!-- ── Rounding up pins to remove ── -->
      <div class="mn-card" in:rise>
        <p class="lp-eyebrow">Remove several pins</p>
        {#if lasso.phase === "drawing"}
          <h2 class="mn-card-title">Draw right round them.</h2>
          <p class="mn-card-text">
            Drag a line on the map around the pins to remove. The map stays
            still while you draw.
          </p>
          <div class="mn-card-actions one">
            <button
              type="button"
              class="lp-btn lp-btn-ghost"
              on:click={() => engine?.cancelLasso()}
            >
              Cancel
            </button>
          </div>
        {:else}
          <h2 class="mn-card-title">
            Remove {lasso.count === 1
              ? "this pin"
              : `these ${lasso.count} pins`}?
          </h2>
          <p class="mn-card-text">
            They come off the map for everyone. You can undo straight
            afterwards.
          </p>
          <div class="mn-card-actions three">
            <button
              type="button"
              class="lp-btn lp-btn-ghost"
              on:click={() => engine?.cancelLasso()}
            >
              Cancel
            </button>
            <button
              type="button"
              class="lp-btn lp-btn-ghost"
              on:click={() => engine?.redoLasso()}
            >
              Redraw
            </button>
            <button
              type="button"
              class="mn-remove solid"
              on:click={removeLassoed}
            >
              <Trash2 size={17} /> Remove {lasso.count}
            </button>
          </div>
        {/if}
      </div>
    {:else if invite}
      <!-- ── Inviting someone onto the map ── -->
      <div class="mn-card mn-menu" in:rise>
        <div class="mn-card-head">
          <p class="lp-eyebrow">Invite to {farmName}</p>
          <button
            type="button"
            class="mn-icon-button"
            aria-label="Close"
            on:click={() => (invite = null)}
          >
            <X size={22} />
          </button>
        </div>
        <p class="mn-card-text">
          <b>A guest</b> can look at the map without an account. The link works for
          a week and lets them in for 48 hours.
        </p>
        {#if invite.link}
          <p class="mn-link-box">{invite.link}</p>
          <div class="mn-menu-actions">
            <button
              type="button"
              on:click={() => invite?.link && copyLink(invite.link)}
            >
              {copied === invite.link ? "Copied" : "Copy link"}
            </button>
            {#if typeof navigator !== "undefined" && "share" in navigator}
              <button
                type="button"
                on:click={() => invite?.link && shareLink(invite.link)}
              >
                Send it
              </button>
            {/if}
          </div>
        {:else}
          <p class="mn-note">
            <span class="mn-spin"><LoaderCircle size={16} /></span> Making a link…
          </p>
        {/if}
        <p class="mn-card-text">
          <b>One of the crew</b> signs up with this link and joins the farm for good.
        </p>
        <p class="mn-link-box">{teamLink}</p>
        <div class="mn-menu-actions">
          <button type="button" on:click={() => copyLink(teamLink)}>
            {copied === teamLink ? "Copied" : "Copy link"}
          </button>
          {#if typeof navigator !== "undefined" && "share" in navigator}
            <button type="button" on:click={() => shareLink(teamLink)}>
              Send it
            </button>
          {/if}
        </div>
      </div>
    {:else if roadAsk}
      <!-- ── A trail in a machine that doesn't usually lay one ── -->
      <div class="mn-card" in:rise>
        <p class="lp-eyebrow">Start a trail</p>
        <h2 class="mn-card-title">
          A {machine.label.toLowerCase()} doesn't usually lay a trail.
        </h2>
        <p class="mn-card-text">
          Trails are for machines working a paddock. Start one anyway and it
          records {marker.swath} m wide in your colour, or pick the machine you're
          really in.
        </p>
        <div class="mn-card-actions">
          <button
            type="button"
            class="lp-btn lp-btn-ghost"
            on:click={() => {
              roadAsk = false
              openPanel("machine")
            }}
          >
            Change machine
          </button>
          <button
            type="button"
            class="lp-btn lp-btn-primary"
            on:click={() => {
              roadAsk = false
              startTrail()
            }}
          >
            Start anyway
          </button>
        </div>
      </div>
    {:else if stopAsk}
      <!-- ── Stop the trail? ── -->
      <div class="mn-card" in:rise>
        <p class="lp-eyebrow">Trail running</p>
        <h2 class="mn-card-title">Stop and save this trail?</h2>
        <p class="mn-card-text">
          {formatHa(readout.ha)} ha so far{operation
            ? ` in ${operation.name}`
            : ""}. Stopping saves it to the farm's records.
        </p>
        {#if recording.problem}
          <p class="mn-warning">{recording.problem}</p>
        {/if}
        <div class="mn-card-actions">
          <button
            type="button"
            class="lp-btn lp-btn-ghost"
            disabled={recording.phase === "stopping"}
            on:click={() => (stopAsk = false)}
          >
            Keep going
          </button>
          <button
            type="button"
            class="lp-btn lp-btn-primary"
            disabled={recording.phase === "stopping"}
            on:click={stopTrail}
          >
            {recording.phase === "stopping" ? "Saving…" : "Stop and save"}
          </button>
        </div>
        <!-- Or throw it away: nothing of it is kept. -->
        <button
          type="button"
          class="mn-discard"
          class:armed={deleteArmed}
          disabled={recording.phase === "stopping"}
          on:click={deleteRunningTrail}
        >
          <Trash2 size={16} />
          {deleteArmed
            ? "Tap again to delete this trail"
            : "Delete this trail instead"}
        </button>
      </div>
    {:else if sprayCard}
      <!-- ── The spray record a finished trail produced ── -->
      <div class="mn-card" in:rise>
        <p class="lp-eyebrow">Trail saved</p>
        <h2 class="mn-card-title">
          Covered {sprayCard.sprayRecords.length}
          {sprayCard.sprayRecords.length === 1 ? "paddock" : "paddocks"}
        </h2>
        <p class="mn-card-text">
          {sprayCard.sprayRecords
            .slice(0, 4)
            .map(
              (record) =>
                `${record.field_name ?? "Paddock"}${
                  typeof record.area_hectares === "number"
                    ? ` ${formatHa(record.area_hectares)} ha`
                    : ""
                }`,
            )
            .join(" · ")}{sprayCard.sprayRecords.length > 4 ? " · …" : ""}.
          Confirm to file it as a record, or leave it to check in Records later.
        </p>
        <div class="mn-card-actions">
          <button
            type="button"
            class="lp-btn lp-btn-ghost"
            on:click={() => (sprayCard = null)}
          >
            Not now
          </button>
          <button
            type="button"
            class="lp-btn lp-btn-primary"
            on:click={confirmSpray}
          >
            Confirm record
          </button>
        </div>
      </div>
    {:else if trailFound && !foundDismissed && recording.trail}
      <!-- ── A trail of theirs is running somewhere else ── -->
      <div class="mn-card" in:rise>
        <p class="lp-eyebrow">Trail running</p>
        <h2 class="mn-card-title">
          You have a trail running on another screen.
        </h2>
        <p class="mn-card-text">
          Started {clock(recording.trail.start)}. While it runs there, this
          screen doesn't add to it or share your position. Carry on here only if
          this is the machine doing the work.
        </p>
        <div class="mn-card-actions">
          <button
            type="button"
            class="lp-btn lp-btn-ghost"
            on:click={() => (foundDismissed = true)}
          >
            Not this machine
          </button>
          <button
            type="button"
            class="lp-btn lp-btn-primary"
            on:click={() => carryOnHere()}
          >
            Carry on here
          </button>
        </div>
        <button
          type="button"
          class="mn-text-button"
          on:click={() => carryOnHere(true)}
        >
          Stop and save it from here
        </button>
      </div>
    {:else if trailSet && !selectedTrail}
      <!-- ── A set of trails, together ── -->
      <div class="mn-riser" in:rise>
        <TrailSetCard
          where={trailSet.where}
          trails={trailSet.trails}
          stats={trailSet.paddockId ? (throughStats ?? setStats) : jobStats}
          replay={setReplay}
          on:close={closeSet}
          on:pick={(e) => openFromSet(e.detail)}
          on:play={() => trailSet && engine?.playSet(trailSet.trails)}
          on:pause={() => engine?.pauseSet()}
          on:seek={(e) => engine?.seekSet(e.detail)}
          on:rate={nextSetRate}
        />
      </div>
    {:else if selectedTrail}
      <!-- ── A trail, picked out: what it was, and a replay of it ── -->
      <div class="mn-riser" in:rise>
        <TrailCard
          trail={selectedTrail}
          list={stepList}
          scope={trailScope?.name ?? ""}
          who={[
            selectedTrail.operator || "No operator",
            ...(selectedTrail.machine
              ? [machineFor(selectedTrail.machine).label]
              : []),
          ].join(" · ")}
          facts={trailFacts(selectedTrail)}
          {replay}
          marks={trailMarks}
          busy={guide?.phase === "loading"}
          {guest}
          suspect={trailSuspect?.trailId === selectedTrail.id
            ? trailSuspect
            : null}
          on:fix={async (e) => {
            if (await engine?.fixTrail(e.detail))
              say(
                e.detail
                  ? "Jumps hidden on this device"
                  : "Showing the trail as recorded",
              )
          }}
          on:close={() => engine?.pickTrail(null)}
          on:pick={(e) => {
            const scope = trailScope
            const playing = !!replay
            if (pickTrail(e.detail)) {
              trailScope = scope
              if (playing) engine?.playReplay()
            }
          }}
          on:step={(e) => stepTrail(e.detail)}
          on:play={() => engine?.playReplay()}
          on:pause={() => engine?.pauseReplay()}
          on:seek={(e) => engine?.seekReplay(e.detail)}
          on:rate={nextRate}
          on:mark={(e) => toggleMark(e.detail)}
          on:follow={(e) =>
            selectedTrail && followTrail(selectedTrail, e.detail)}
          on:remove={deleteTrail}
          on:all={allFromTrail}
        />
      </div>
    {:else if placing}
      <!-- ── Placing the pin that goes with a drawing ── -->
      <div class="mn-card mn-menu" in:rise>
        <div class="mn-card-head">
          <p class="lp-eyebrow">Place the pin</p>
          <button
            type="button"
            class="mn-icon-button"
            aria-label="Back"
            on:click={() => engine?.cancelPlacing()}
          >
            <X size={22} />
          </button>
        </div>
        <p class="mn-move-hint">
          <Navigation size={17} /> Drag the pin to where it should sit
        </p>
        <div class="mn-kinds" style="margin-top: 0">
          {#each quickPins as choice (choice.iconClass)}
            <button
              type="button"
              class="mn-kind"
              class:selected={placing.iconClass === choice.iconClass}
              aria-pressed={placing.iconClass === choice.iconClass}
              on:click={() =>
                engine?.setPlacing({ iconClass: choice.iconClass })}
            >
              <PinArt
                look={{ iconClass: choice.iconClass, colour: placing.colour }}
                size={34}
              />
              {choice.label}
            </button>
          {/each}
        </div>
        <div
          class="mn-swatches"
          style="--across: 10"
          role="group"
          aria-label="Pin colour"
        >
          {#each PIN_COLOURS as key}
            <button
              type="button"
              class:selected={placing.colour === key}
              style="--swatch: {pinSwatch(key)}"
              aria-label={key === "default" ? "Default colour" : key}
              aria-pressed={placing.colour === key}
              on:click={() => engine?.setPlacing({ colour: key })}
            ></button>
          {/each}
        </div>
        <div class="mn-fields">
          <input
            type="text"
            bind:value={keepLabel}
            maxlength="40"
            placeholder="Its note: wet patch, drain, rocks…"
            aria-label="A note for the pin"
          />
        </div>
        <div class="mn-card-actions">
          <button
            type="button"
            class="lp-btn lp-btn-ghost"
            on:click={() => engine?.cancelPlacing()}
          >
            Back
          </button>
          <button
            type="button"
            class="lp-btn lp-btn-primary"
            disabled={measure?.keeping}
            on:click={placePin}
          >
            <Check size={18} strokeWidth={3} /> Place pin
          </button>
        </div>
      </div>
    {:else if measure}
      <!-- ── Drawing: to measure, to keep, or for a pin ── -->
      {@const drawing = measure.drawing}
      {@const line = !areaNow}
      <div class="mn-card mn-menu" in:rise>
        <div class="mn-card-head">
          <p class="lp-eyebrow">
            {drawing
              ? line
                ? "Draw a line"
                : "Draw an area"
              : keepStep
                ? "Keep it"
                : "Draw and measure"}
          </p>
          <p class="mn-hint">
            {#if line}
              {measure.points < 2
                ? "Tap the map along the line."
                : `${measure.points} points`}
            {:else}
              {measure.points < 2
                ? "Tap the map to mark each corner."
                : measure.points < 3
                  ? "One more corner gives an area."
                  : `${measure.points} corners`}
            {/if}
          </p>
        </div>
        {#if !drawing && !keepStep}
          <div class="mn-pair" role="group" aria-label="What to draw">
            <button
              type="button"
              aria-pressed={!line}
              on:click={() => engine?.setMeasureKind("polygon")}
            >
              Area
            </button>
            <button
              type="button"
              aria-pressed={line}
              on:click={() => engine?.setMeasureKind("line")}
            >
              Line
            </button>
          </div>
        {/if}
        {#if drawing || keepStep}
          <div
            class="mn-swatches"
            style="--across: 6"
            role="group"
            aria-label="Colour"
          >
            {#each DRAWING_COLOURS as colour}
              <button
                type="button"
                class:selected={(drawing?.colour ?? drawColourNow) === colour}
                style="--swatch: {colour}"
                aria-label="Colour {colour}"
                aria-pressed={(drawing?.colour ?? drawColourNow) === colour}
                on:click={() => chooseDrawColour(colour)}
              ></button>
            {/each}
          </div>
        {/if}
        <div class="mn-measure">
          <div>
            <b>{metres(measure.distance)}</b><span
              >{measure.distance >= 1000 ? "km" : "m"}
              {line ? "long" : "around"}</span
            >
          </div>
          {#if !line}
            <div>
              <b>{measure.points > 2 ? measure.ha.toFixed(2) : "–"}</b><span
                >ha inside</span
              >
            </div>
          {/if}
        </div>

        {#if keepStep && !drawing}
          <div class="mn-fields">
            <input
              type="text"
              bind:value={keepLabel}
              maxlength="40"
              placeholder="Name it: wet patch, drain, rocks…"
              aria-label="A name for it"
            />
          </div>
          {#if cutAsk}
            <p class="mn-note">
              Cut this out of {measure.paddock?.name}? This changes the
              paddock's boundary itself, and its hectares with it. You can put
              it back with Undo, or later from the paddock's Draw menu.
            </p>
            <div class="mn-card-actions">
              <button
                type="button"
                class="lp-btn lp-btn-ghost"
                on:click={() => (cutAsk = false)}
              >
                Leave it
              </button>
              <button
                type="button"
                class="lp-btn lp-btn-primary"
                disabled={measure.keeping}
                on:click={cutOut}
              >
                {measure.keeping ? "Cutting…" : "Cut it out"}
              </button>
            </div>
          {:else}
            <div class="mn-keep">
              {#if paddockFor !== null && (line || measure.overPaddock)}
                <p class="mn-note">
                  {line
                    ? "A paddock is an area. Go back and switch to Area."
                    : "Some of this is already in a paddock. Go back and draw it clear of the others."}
                </p>
              {/if}
              {#if paddockFor === null && (measure.paddock || drawOnPaddock)}
                <button
                  type="button"
                  disabled={!measure.paddock || measure.keeping}
                  on:click={keepOnPaddock}
                >
                  <strong>
                    {measure.paddock
                      ? `Keep it on ${measure.paddock.name}`
                      : "Keep it on the paddock"}
                  </strong>
                  <span>
                    {measure.paddock
                      ? "It shows on the paddock with its name and size."
                      : "Start it inside the paddock to keep it there."}
                  </span>
                </button>
              {/if}
              {#if paddockFor === null}
                <button
                  type="button"
                  disabled={measure.keeping}
                  on:click={keepAsPin}
                >
                  <strong>Drop a pin with it</strong>
                  <span>
                    You drag the pin into place and choose its kind and colour.
                    Shows in the current viewer too.
                  </span>
                </button>
              {/if}
              <!-- Ground that is already a paddock can't become another
                   one; and drawing begun from a paddock's menu is only ever
                   kept on it (its boundary has its own editor). -->
              {#if !line && !measure.overPaddock && !drawOnPaddock}
                <button
                  type="button"
                  disabled={measure.keeping}
                  on:click={keepAsPaddock}
                >
                  <strong>
                    {paddockFor
                      ? `Make it a paddock in ${farmNames.find((f) => f.id === paddockFor)?.name ?? "this farm"}`
                      : "Make it a paddock"}
                  </strong>
                  <span>
                    A new paddock with this as its boundary, named as above.
                  </span>
                </button>
              {/if}
              {#if !line && measure.paddock && !drawOnPaddock && paddockFor === null}
                <button
                  type="button"
                  disabled={measure.keeping}
                  on:click={() => (cutAsk = true)}
                >
                  <strong>Cut it out of {measure.paddock.name}</strong>
                  <span>
                    Changes the paddock's boundary itself, and its hectares. It
                    can be undone.
                  </span>
                </button>
              {/if}
            </div>
            <button
              type="button"
              class="mn-text-button"
              on:click={() => (keepStep = false)}
            >
              Back to drawing
            </button>
          {/if}
        {:else}
          <div class="mn-card-actions three">
            <button
              type="button"
              class="lp-btn lp-btn-ghost"
              disabled={!measure.points}
              on:click={() => engine?.undoMeasure()}
            >
              Undo
            </button>
            {#if drawing}
              <button
                type="button"
                class="lp-btn lp-btn-ghost"
                on:click={() => engine?.cancelDrawing()}
              >
                Cancel
              </button>
              <button
                type="button"
                class="lp-btn lp-btn-primary"
                disabled={drawing.saving || measure.points < (line ? 2 : 3)}
                on:click={saveDrawing}
              >
                {drawing.saving ? "Saving…" : "Save"}
              </button>
            {:else if measure.forJob}
              <button
                type="button"
                class="lp-btn lp-btn-ghost"
                on:click={() => engine?.cancelDrawing()}
              >
                Cancel
              </button>
              <button
                type="button"
                class="lp-btn lp-btn-primary"
                disabled={!canKeep}
                on:click={addDrawnToJob}
              >
                Add to job
              </button>
            {:else}
              <button
                type="button"
                class="lp-btn lp-btn-ghost"
                on:click={() => engine?.setMeasuring(false)}
              >
                Done
              </button>
              <button
                type="button"
                class="lp-btn lp-btn-primary"
                disabled={!canKeep || guest}
                on:click={() => {
                  keepStep = true
                  // It takes the colour it will be kept in straight away.
                  engine?.setMeasureColour(drawColourNow)
                }}
              >
                Keep it
              </button>
            {/if}
          </div>
        {/if}
      </div>
    {:else if binPin && engine}
      <!-- ── A grain bin: its level, and its settings ── -->
      {#key binPin.id}
        <div class="mn-riser" in:rise>
          <BinCard
            pin={binPin}
            look={engine.pinLook(binPin)}
            {guest}
            grains={grainsKnown}
            on:close={() => (binOpen = null)}
            on:find={() =>
              binPin &&
              engine?.showPlace({
                at: [0, 0],
                refType: "marker",
                refId: binPin.id,
              })}
            on:remove={async () => {
              const id = binPin?.id
              binOpen = null
              if (id && (await engine?.removePin(id))) say("Bin removed")
            }}
            on:change={(e) => binPin && engine?.updatePin(binPin.id, e.detail)}
          />
        </div>
      {/key}
    {:else if selectedPin && engine}
      <!-- ── A pin: its menu opens on the map, beside it ── -->
      {#key selectedPin.id}
        <PinCard
          pin={selectedPin}
          look={engine.pinLook(selectedPin)}
          who={pinWho}
          on:preview={(e) =>
            selectedPin && engine?.previewPin(selectedPin.id, e.detail)}
          on:commit={() => engine?.commitPreview()}
          grains={grainsKnown}
          on:editDrawing={(e) => engine?.editDrawing(e.detail)}
          {guest}
          choices={pinChoices}
          {choiceLook}
          typeColours={$userSettingsStore.markerTypeDefaultColors ?? {}}
          on:typeColour={(e) =>
            setTypeColour(e.detail.iconClass, e.detail.colour)}
          moving={movingPin === selectedPin.id}
          drawings={pinDrawings}
          picked={pickedDrawing}
          {photoLinks}
          {uploading}
          map={engine.map}
          place={() =>
            selectedPin ? (engine?.pinPlace(selectedPin.id) ?? null) : null}
          insets={{ left: railOn ? 352 : 0, bottom: wide ? 0 : 76 }}
          on:place={() => {
            if (engine?.placePin()) say("Pin moved")
          }}
          on:draw={(e) =>
            selectedPin &&
            engine?.startDrawing(selectedPin.id, e.detail, drawColourNow)}
          on:drawing={(e) => engine?.pickDrawing(e.detail)}
          on:room={(e) => {
            // (Not while the map is following a machine: it would fight.)
            if (follow === "free" && !following)
              engine?.map.easeTo({ center: e.detail, duration: 500 })
          }}
          on:removeDrawing={async (e) => {
            if (await engine?.removeDrawing(e.detail)) say("Drawing removed")
          }}
          on:photo={(e) => addPhoto(e.detail)}
          on:removePhoto={(e) => removePhoto(e.detail)}
          on:close={() => {
            engine?.movePin(null)
            engine?.selectedPin.set(null)
          }}
          on:change={(e) =>
            selectedPin && engine?.updatePin(selectedPin.id, e.detail)}
          on:move={(e) =>
            engine?.movePin(e.detail && selectedPin ? selectedPin.id : null)}
          on:remove={removeSelectedPin}
        />
      {/key}
    {:else if mineSelected}
      <!-- ── Your own machine ── -->
      <div class="mn-riser" in:rise>
        <MachineCard
          {marker}
          {follow}
          {guest}
          broadcasting={!!broadcast}
          trail={crewTrail}
          {now}
          operation={operation?.name ?? ""}
          on:light={(e) => engine?.lightCrewTrail(e.detail)}
          on:close={() => engine?.selectedCrew.set(null)}
          on:follow={(e) => engine?.setFollow(e.detail)}
          on:broadcast={() => {
            engine?.selectedCrew.set(null)
            openPanel("broadcast")
          }}
          on:machine={() => {
            engine?.selectedCrew.set(null)
            openPanel("machine")
          }}
        />
      </div>
    {:else if selectedCrew}
      <!-- ── Someone on the crew ── -->
      {#key selectedCrew.id}
        <div
          class="mn-card mn-menu"
          style="--accent: {selectedCrew.colour}"
          in:rise
        >
          <div class="head">
            {#if crewCard && !railOn}
              <button
                type="button"
                class="mn-icon-button back"
                aria-label="Back to the crew"
                on:click={() => engine?.selectedCrew.set(null)}
              >
                <ArrowLeft size={22} />
              </button>
            {/if}
            <span class="art">
              <svelte:component
                this={vehicles[selectedCrew.type]}
                size="44px"
                bodyColor={selectedCrew.colour}
                outlineColor="#ffffff"
                wheelColor="#15261C"
                loadColor="#F7DB5C"
              />
              {#if drivenBy(selectedCrew)}
                <!-- Who is signed in to it. -->
                <b
                  class="mn-driver"
                  title="{drivenBy(selectedCrew)} is driving"
                >
                  {drivenBy(selectedCrew).split(/\s+/)[0]}
                </b>
              {/if}
            </span>
            <div class="about">
              <h2>
                {selectedCrew.name}{selectedCrew.guest ? " (guest)" : ""}
              </h2>
              <p>{selectedCrew.machineLabel}</p>
            </div>
            <span class="mn-far">
              {selectedCrew.speed > 0
                ? `${selectedCrew.speed.toFixed(1)} km/h`
                : "Stopped"}
            </span>
            <button
              type="button"
              class="mn-icon-button"
              aria-label="Close"
              on:click={() => {
                engine?.selectedCrew.set(null)
                crewCard = false
              }}
            >
              <X size={22} />
            </button>
          </div>
          {#if crewTrail}
            <TrailingNow
              trail={crewTrail}
              {now}
              operation={selectedCrew.operation ?? ""}
              on:light={(e) => engine?.lightCrewTrail(e.detail)}
            />
          {/if}
          <div class="mn-menu-actions">
            <button
              type="button"
              on:click={() => selectedCrew && openChat(selectedCrew.id)}
            >
              <MessageCircle size={18} /> Message
            </button>
            {#if selectedCrew.placed}
              <button
                type="button"
                class:on={!!tailMode}
                aria-label={tailMode === "cab"
                  ? "Riding along. Tap to stop following"
                  : tailMode === "follow"
                    ? "Following. Tap to ride along"
                    : "Follow"}
                on:click={() => selectedCrew && cycleTail(selectedCrew.id)}
              >
                {#if tailMode === "cab"}
                  <Navigation size={18} fill="currentColor" /> Riding along
                {:else if tailMode === "follow"}
                  <LocateFixed size={18} /> Following
                {:else}
                  <LocateFixed size={18} /> Follow
                {/if}
              </button>
            {/if}
          </div>
          {#if tailMode}
            <p class="mn-note">
              {tailMode === "follow"
                ? "Tap again to ride along: the map turns the way they are heading."
                : "Tap again to stop following."}
            </p>
          {/if}
        </div>
      {/key}
    {:else if selectedPaddock}
      <!-- ── A paddock ── -->
      <div class="mn-riser" in:rise>
        <PaddockCard
          paddock={selectedPaddock}
          farms={farmNames}
          {guest}
          here={readout.paddock?.name === selectedPaddock.name}
          trails={paddockTrails}
          operation={operation?.name ?? ""}
          {pickedFeature}
          allTrails={through === selectedPaddock.id}
          stats={through === selectedPaddock.id ? throughStats : null}
          on:allTrails={showSet}
          on:feature={(e) =>
            selectedPaddock &&
            engine?.pickFeature(selectedPaddock.id, e.detail)}
          on:draw={() => {
            startMeasuring()
            drawOnPaddock = true
          }}
          on:boundary={() =>
            selectedPaddock && engine?.editBoundary(selectedPaddock.id)}
          on:putBack={async () => {
            const paddock = selectedPaddock
            if (paddock && (await engine?.undoBoundary(paddock.id)))
              say(
                `${paddock.name}'s boundary put back`,
                offerBoundaryUndo(paddock.id, paddock.name),
              )
          }}
          on:editFeature={(e) =>
            selectedPaddock &&
            engine?.editFeature(selectedPaddock.id, e.detail)}
          on:removeFeature={async (e) => {
            if (
              selectedPaddock &&
              (await engine?.removeFeature(selectedPaddock.id, e.detail))
            )
              say("Removed from the paddock")
          }}
          crops={cropsUsed}
          on:trail={(e) => {
            const scope = {
              ids: paddockTrails.map((trail) => trail.id),
              name: selectedPaddock?.name ?? "the paddock",
              paddockId: selectedPaddock?.id ?? null,
            }
            if (pickTrail(e.detail)) trailScope = scope
          }}
          on:close={() => engine?.selectedPaddock.set(null)}
          on:change={(e) =>
            selectedPaddock &&
            engine?.updatePaddock(selectedPaddock.id, e.detail)}
          on:remove={async () => {
            const gone = selectedPaddock
            if (gone && (await engine?.removePaddock(gone.id)))
              say(`${gone.name} deleted`)
          }}
        />
      </div>
    {/if}

    {#if pinDrag}
      <!-- ── A pin being carried from its button onto the map ── -->
      <div
        class="mn-pinghost"
        class:cancel={pinDrag.cancel}
        style="left: {pinDrag.x}px; top: {pinDrag.y - PIN_LIFT}px"
        aria-hidden="true"
      >
        <PinArt look={choiceLook(pinDrag.kind)} size={50} />
        <i></i>
      </div>
      <div
        class="mn-pincancel"
        class:over={pinDrag.cancel}
        bind:this={pinCancelZone}
        aria-hidden="true"
      >
        <X size={18} strokeWidth={3} /> Cancel
      </div>
    {/if}
    {#each floaters as floater (floater.id)}
      <span
        class="mn-floater"
        class:gone={floater.gone}
        style="left: {floater.x}px; top: {floater.y}px"
        aria-hidden="true">{floater.text}</span
      >
    {/each}

    {#if snack}
      <div class="mn-snack" role="status" in:rise>
        {snack.text}
        {#if snack.action}
          <button type="button" on:click={snack.action.run}
            >{snack.action.label}</button
          >
        {/if}
      </div>
    {/if}

    {#if jobDraft && (!measure || measure.forJob)}
      <!-- The feed: what a tap on the map does for the job right now. -->
      <div class="mn-feedwrap">
        <JobBar
          step={jobDraft.current + 1}
          steps={jobDraft.steps.length}
          mode={jobMode}
          points={measure?.points ?? 0}
          size={measure
            ? measure.kind === "line"
              ? measure.points > 1
                ? formatDistance(measure.distance)
                : ""
              : measure.points > 2
                ? `${formatHa(measure.ha)} ha`
                : ""
            : ""}
          ready={canKeep}
          on:undo={() => engine?.undoMeasure()}
          on:add={addDrawnToJob}
        />
      </div>
    {/if}

    {#if crewCard && !railOn}
      <!-- ── The crew, on a phone: a card over the map, which still moves
           under it. It steps aside (kept as it was) while another card is
           up, and is back when that one goes. ── -->
      <div
        class="mn-card mn-menu mn-crewcard"
        class:aside={cardOpen}
        bind:clientHeight={crewCardH}
      >
        <CrewPanel
          bind:tab={crewTab}
          closable
          {crew}
          {self}
          selfDriver={$operatorStore.operator?.name ?? ""}
          unreadBy={Object.fromEntries(
            conversations.map((convo) => [convo.id, convo.unread]),
          )}
          {hideStale}
          {guest}
          mapId={mapId ?? ""}
          {undoLog}
          on:close={() => (crewCard = false)}
          on:settings={() => openPanel("crewSettings")}
          on:home={goHome}
          on:look={(e) => lookCrew(e.detail)}
          on:message={(e) => openChat(e.detail)}
          on:invite={openInvite}
          on:lookPlace={(e) => engine?.showPlace({ at: e.detail })}
          on:logCrew={(e) => logCrew(e.detail)}
          on:logTrail={(e) => logTrail(e.detail)}
        />
      </div>
    {/if}

    {#if driverOffer || operatorAsk}
      <!-- ── Who is driving: confirmed on the way in, changed from
           Profile, asked before a trail when nobody is set ── -->
      <ProfilePicker
        {operators}
        current={driverOffer?.name ?? $operatorStore.operator?.name ?? ""}
        countdown={driverOffer ? driverLeft : 0}
        total={DRIVER_WAIT}
        busy={operatorBusy}
        forTrail={operatorAsk && !driverOnly}
        on:confirm={() => (driverOffer ? confirmDriver() : closeProfile())}
        on:hold={holdDriver}
        on:pick={(e) => pickProfile(e.detail)}
        on:add={(e) => pickProfile(null, e.detail)}
        on:close={closeProfile}
      />
    {/if}

    <!-- ── Toolbox: a side rail on a tablet, a sheet on a phone ── -->
    {#if railOn || (!wide && panelOpen)}
      {#if !wide}
        <button
          type="button"
          class="mn-scrim"
          aria-label="Close"
          on:click={closePanel}
        ></button>
      {/if}
      <Toolbox
        bind:view={toolView}
        {wide}
        {marker}
        {recording}
        {guest}
        hasFix={readout.hasFix}
        {crew}
        driver={$operatorStore.operator?.name ?? ""}
        {pinChoices}
        pinKind={quickKinds[0]}
        {choiceLook}
        {operations}
        {operation}
        {trails}
        pickedTrail={selectedTrail?.id ?? null}
        {loading}
        {paddocks}
        pickedPaddock={selectedPaddock?.id ?? null}
        base={baseKey}
        {baseChoices}
        layers={$layerVisibilityStore}
        {broadcastChoices}
        {broadcast}
        {farmName}
        {farmOwner}
        {isOwner}
        {farm}
        {farms}
        currentFarmId={mapId}
        unreadBy={Object.fromEntries(
          conversations.map((convo) => [convo.id, convo.unread]),
        )}
        on:minimise={() => setRailShut(true)}
        on:crewCard={() => {
          closePanel()
          crewCard = true
        }}
        on:messageCrew={(e) => openChat(e.detail)}
        messageWith={chatName}
        on:close={closePanel}
        on:locate={askForLocation}
        on:machine={(e) => changeMachine(e.detail)}
        {self}
        {hideStale}
        {pins}
        pinLook={(pin) => engine?.pinLook(pin) ?? { iconClass: pin.iconClass }}
        typeColours={$userSettingsStore.markerTypeDefaultColors ?? {}}
        {jobsWaiting}
        on:invite={openInvite}
        on:stale={(e) => setHideStale(e.detail)}
        on:removeCrew={(e) => removeCrew(e.detail)}
        on:typeColour={(e) =>
          setTypeColour(e.detail.iconClass, e.detail.colour)}
        on:lookPin={(e) => {
          engine?.showPlace({ at: [0, 0], refType: "marker", refId: e.detail })
          if (!wide) closePanel()
        }}
        on:lasso={startLasso}
        on:lookCrew={(e) => lookCrew(e.detail)}
        quickPinKinds={quickKinds}
        on:quickKinds={(e) => {
          const before = quickKinds
          setQuick(e.detail)
          if (e.detail[0] !== before[0])
            say(`The default pin is now ${pinName(e.detail[0])}`)
        }}
        on:operation={(e) => chooseOperation(e.detail)}
        on:newOperation={(e) => addOperation(e.detail.name, e.detail.year)}
        admin={!!$userSettingsStore.isAdmin}
        {devGps}
        on:devGps={(e) => {
          if (e.detail) engine?.startDevGps(e.detail.mode)
          else engine?.stopDevGps()
        }}
        on:devSpeed={(e) => engine?.setDevSpeed(e.detail)}
        on:lookTrail={(e) => {
          if (pickTrail(e.detail) && !wide) closePanel()
        }}
        on:replayTrail={(e) => {
          if (pickTrail(e.detail, true) && !wide) closePanel()
        }}
        on:lookPaddock={(e) => {
          if (engine?.pickPaddockById(e.detail) && !wide) closePanel()
        }}
        farmList={farmNames}
        {undoLog}
        mapId={mapId ?? ""}
        on:newPaddock={(e) => {
          engine?.clearSelection()
          paddockAsk = { farmId: e.detail }
          if (!wide) closePanel()
        }}
        on:newFarm={async (e) => {
          const made = await engine?.addFarm(e.detail)
          if (made)
            say(`${made.name} added. Tap + beside it to draw a paddock.`)
        }}
        on:logCrew={(e) => logCrew(e.detail)}
        on:logTrail={(e) => logTrail(e.detail)}
        on:lookPlace={(e) => engine?.showPlace({ at: e.detail })}
        on:base={(e) => setBase(e.detail)}
        {baseDefault}
        on:baseDefault={(e) => setBaseDefault(e.detail)}
        {trailLevel}
        on:trailLevel={(e) => setTrailLevel(e.detail)}
        pinStyle={pinLook}
        on:pinStyle={(e) => setPinStyle(e.detail)}
        {menuLook}
        on:menuLook={(e) => setMenuLook(e.detail)}
        {trailPalette}
        on:trailPalette={(e) => pickTrailPalette(e.detail)}
        {pinCount}
        on:bin={(e) => openBin(e.detail)}
        on:layer={(e) => setLayer(e.detail.key, e.detail.on)}
        on:measure={startMeasuring}
        on:broadcast={(e) => {
          if (engine?.startBroadcast(e.detail.reason, e.detail.colour))
            if (!wide) closePanel()
        }}
        on:stopBroadcast={() => engine?.stopBroadcast()}
        on:driver={chooseDriver}
        on:home={goHome}
        on:fitFarm={() => {
          if (!engine?.fitFarm()) say("This farm has no paddocks yet.")
          else if (!wide) closePanel()
        }}
        on:farm={(e) => switchFarm(e.detail)}
        on:leave={(e) => leave(e.detail)}
      >
        <svelte:fragment slot="messages">
          <Messages
            me={userId}
            {crew}
            {conversations}
            withId={chatWith}
            {thread}
            loading={chatLoading}
            sending={chatSending}
            bind:attached={chatPlaces}
            on:pickPlace={pickPlace}
            {paddocks}
            {drawings}
            {guest}
            {jobs}
            on:job={() => startJob(chatWith)}
            on:showJob={(e) => showJob(e.detail)}
            on:tickJob={(e) =>
              board?.tick(e.detail.id, e.detail.index, e.detail.done)}
            on:takeJob={(e) => board?.take(e.detail)}
            on:finishJob={(e) => board?.finish(e.detail)}
            on:cancelJob={(e) => board?.cancel(e.detail)}
            on:open={(e) => messenger?.open(e.detail)}
            on:send={(e) => sendChat(e.detail.body, e.detail.places)}
            on:show={(e) => {
              engine?.showPlace(e.detail)
              if (!wide) closePanel()
            }}
            on:look={(e) => {
              if (engine?.lookAt(e.detail)) {
                engine.pickCrew(e.detail)
                if (!wide) closePanel()
              }
            }}
          />
        </svelte:fragment>
        <svelte:fragment slot="jobs">
          <Jobs
            me={userId}
            {jobs}
            {crew}
            {paddocks}
            {drawings}
            {guest}
            on:new={() => startJob()}
            on:show={(e) => showJob(e.detail)}
            on:tick={(e) =>
              board?.tick(e.detail.id, e.detail.index, e.detail.done)}
            on:take={(e) => board?.take(e.detail)}
            on:finish={(e) => board?.finish(e.detail)}
            on:cancel={async (e) => {
              if (await board?.cancel(e.detail)) say("Job withdrawn")
            }}
          />
        </svelte:fragment>
      </Toolbox>
    {/if}
  {:else if machineRead}
    <LiveJoin
      {farmName}
      {farmOwner}
      {isOwner}
      {farms}
      currentFarmId={mapId}
      {marker}
      bind:step
      {gps}
      {secure}
      {guest}
      known={hasMachine}
      on:machine={(e) => changeMachine(e.detail)}
      on:locate={() => {
        saveMachine()
        engine?.startGps()
      }}
      on:look={enterMap}
      on:farm={(e) => switchFarm(e.detail)}
    />
  {/if}
</div>
