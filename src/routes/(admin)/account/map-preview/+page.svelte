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
  import { onDestroy, onMount } from "svelte"
  import { fly } from "svelte/transition"
  import { goto } from "$app/navigation"
  import { PUBLIC_MAPBOX_ACCESS_TOKEN } from "$env/static/public"
  import {
    LoaderCircle,
    ClipboardList,
    LocateFixed,
    MessageCircle,
    Navigation,
    Pause,
    Play,
    RotateCcw,
    SkipBack,
    SkipForward,
    Check,
    PencilRuler,
    Trash2,
    Users,
    X,
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
  import { IMAGERY, type BaseLook } from "$lib/components/mapnext/mapStyle"
  import { machineFor } from "$lib/components/mapnext/machines"
  import { drawColour } from "$lib/components/mapnext/palette"
  import { distanceM } from "$lib/components/mapnext/geo"
  import { formatDistance, formatHa } from "$lib/components/mapnext/format"
  import {
    PIN_DEFAULT,
    pinChoices as allPinChoices,
    pinColour,
    pinLabel,
    preferenceIconClass,
  } from "$lib/components/mapnext/pins"
  import { markerColor } from "$lib/components/map/markers/markerPalette"
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
  import PinCard from "./PinCard.svelte"
  import MachineCard from "./MachineCard.svelte"
  import PaddockCard from "./PaddockCard.svelte"
  import Messages from "./Messages.svelte"
  import Jobs from "./Jobs.svelte"
  import JobThumb from "./JobThumb.svelte"
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
  const savedBase = load<string>("base")
  const preferred = $userSettingsStore.defaultImagerySource
  let baseKey: string =
    savedBase &&
    (savedBase === "paper" ||
      savedBase === "satellite" ||
      savedBase === "dark" ||
      IMAGERY[savedBase])
      ? savedBase
      : IMAGERY[preferred]
        ? preferred
        : "satellite"
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
  let pinning = false
  let showAllPins = false
  let droppedHere = 0
  let droppedAtStart = 0
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
  let pinCount = 0
  let selectedPin: LivePin | null = null
  let selectedPaddock: Paddock | null = null
  let selectedTrail: TrailInfo | null = null
  let replay: ReplayState | null = null
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
  let deleteAsk = false
  let roadAsk = false
  let selectedCrewId: string | null = null
  let trails: TrailInfo[] = []

  // ── Crew ──
  let self: CrewRow | null = null
  let following: { id: string; mode: "follow" | "cab" } | null = null
  let hideStale = load<boolean>("hide-stale") ?? false
  /** The trail the picked crew member is laying now, in figures. */
  let crewTrail: { since: number; metres: number; ha: number } | null = null
  /** A pin being placed by dragging, before it exists. */
  let placing: { iconClass: string; colour: string } | null = null
  /** Stepping through trails is kept to these (the ones through a paddock). */
  let trailScope: { ids: string[]; name: string } | null = null
  /** The invite card: its link once it has been made. */
  let invite: { link: string | null } | null = null
  let copied = ""

  // ── Pins, all of them, and the lasso for removing several ──
  let pins: LivePin[] = []
  let lasso: { phase: "drawing" | "confirm"; count: number } | null = null

  // ── Paddocks ──
  let paddockTrails: TrailInfo[] = []
  let pickedFeature: string | null = null

  // ── Jobs ──
  let board: JobBoard | null = null
  let jobs: Job[] = []
  /**
   * A job being put together. It has one step or several; taps on the map
   * add places to the step being worked on (`current`).
   */
  let jobDraft: {
    to: string | null
    title: string
    note: string
    steps: { title: string; items: JobItem[] }[]
    current: number
  } | null = null
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
  $: engine?.setInsets(wide ? 352 : 0, wide ? 0 : 76)
  $: pinDistance = selectedPin ? distanceFromMe(selectedPin, readout) : null
  $: if (pinning) droppedHere = Math.max(0, droppedTotal - droppedAtStart)
  let droppedTotal = 0

  // `fix` is only here so the distance refreshes as the viewer moves.
  function distanceFromMe(pin: LivePin, fix: Readout) {
    const mine = engine?.myPosition()
    return mine && fix.hasFix ? distanceM(mine, pin.at) : null
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
    stop.push(
      created.gps.subscribe((v) => (gps = v)),
      created.follow.subscribe((v) => (follow = v)),
      created.linked.subscribe((v) => (linked = v)),
      created.bearing.subscribe((v) => (bearing = v)),
      created.crew.subscribe((v) => (crew = v)),
      created.pinCount.subscribe((v) => (pinCount = v)),
      created.dropped.subscribe((v) => (droppedTotal = v)),
      created.selectedPin.subscribe((v) => (selectedPin = v)),
      created.selectedPaddock.subscribe((v) => (selectedPaddock = v)),
      created.selectedTrail.subscribe((v) => {
        selectedTrail = v
        deleteAsk = false
        if (!v) trailScope = null
      }),
      created.crewTrail.subscribe((v) => (crewTrail = v)),
      created.placing.subscribe((v) => (placing = v)),
      created.replay.subscribe((v) => (replay = v)),
      created.paddockList.subscribe((v) => (paddocks = v)),
      created.farmNames.subscribe((v) => (farmNames = v)),
      created.measure.subscribe((v) => (measure = v)),
      created.movingPin.subscribe((v) => (movingPin = v)),
      created.drawings.subscribe((v) => (drawings = v)),
      created.self.subscribe((v) => (self = v)),
      created.following.subscribe((v) => (following = v)),
      created.pins.subscribe((v) => (pins = v)),
      created.lasso.subscribe((v) => (lasso = v)),
      created.paddockTrails.subscribe((v) => (paddockTrails = v)),
      created.pickedFeature.subscribe((v) => (pickedFeature = v)),
      created.grabbed.subscribe((item) => {
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
    if (!chosen) say("Couldn't set who's driving. Try again from Driver.")
  }

  function someoneElse() {
    clearInterval(driverTimer)
    driverOffer = null
    chooseDriver()
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
    save("base", key)
    engine?.setBase(lookOf(key), imageryOf(key))
  }

  // Say which way up the map is for a moment after it changes.
  let followHint = false
  let followHintTimer: ReturnType<typeof setTimeout>
  function cycleFollow() {
    engine?.setFollow(follow === "follow" ? "cab" : "follow")
    followHint = true
    clearTimeout(followHintTimer)
    followHintTimer = setTimeout(() => (followHint = false), 2400)
  }

  function openPanel(view: ToolView = "home") {
    toolView = view
    panelOpen = true
  }

  function closePanel() {
    panelOpen = false
    saveMachine()
    if (!wide) toolView = "home"
  }

  // ── Pins ──
  function startPinning() {
    panelOpen = false
    stopAsk = false
    pinning = true
    showAllPins = false
    droppedAtStart = droppedTotal
    engine?.armPin(pinKind)
  }

  function stopPinning() {
    pinning = false
    engine?.armPin(null)
  }

  function choosePin(iconClass: string) {
    pinKind = iconClass
    save("pin", iconClass)
    showAllPins = false
    if (pinning) engine?.armPin(iconClass)
  }

  async function removeSelectedPin() {
    const pin = selectedPin
    if (!pin || !engine) return
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
    else if (!operation) say("This farm has no job to record against yet.")
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
  $: messagesShown = (wide || panelOpen) && toolView === "messages"
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
  $: sharePlaces = sharable(readout, selectedPin, selectedPaddock)

  function openChat(id: string | null) {
    messenger?.open(id)
    openPanel("messages")
  }

  // What can be sent as a place right now: where this person is, and
  // whatever they have picked on the map.
  function sharable(
    fix: Readout,
    pin: LivePin | null,
    paddock: Paddock | null,
  ) {
    const list: { key: string; label: string; place: SharedPlace }[] = []
    const mine = engine?.myPosition()
    if (mine && fix.hasFix && userId)
      list.push({
        key: "me",
        label: "Where I am now",
        place: {
          at: mine,
          label: `${myName.trim().split(/\s+/)[0]} is here`,
          refType: "vehicle",
          refId: userId,
        },
      })
    if (pin) {
      const what = pinLabel(pin.iconClass)
      list.push({
        key: "pin",
        label: `The ${what.toLowerCase()} pin I've picked`,
        place: {
          at: pin.at,
          label: pin.note ? `${what}: ${pin.note}`.slice(0, 60) : `${what} pin`,
          refType: "marker",
          refId: pin.id,
        },
      })
    }
    const at = paddock ? engine?.paddockPoint(paddock.id) : null
    if (paddock && at)
      list.push({
        key: "paddock",
        label: `${paddock.name}, the paddock I've picked`,
        place: { at, label: paddock.name, refType: "field", refId: paddock.id },
      })
    return list
  }

  // ── Jobs: something to do at a place, for one person or for anyone ──
  $: jobsWaiting = jobs.filter(
    (job) =>
      job.status !== "done" &&
      (job.takenBy === userId ||
        (job.assignedTo === userId && job.status === "open")),
  ).length
  $: jobsOpen = jobs.filter(
    (job) =>
      job.status === "open" && !job.assignedTo && job.createdBy !== userId,
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
    stopPinning()
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

  function addStep() {
    if (!jobDraft || jobDraft.steps.length >= 8) return
    jobDraft = {
      ...jobDraft,
      steps: [...jobDraft.steps, { title: "", items: [] }],
      current: jobDraft.steps.length,
    }
  }

  function removeStep(index: number) {
    if (!jobDraft || jobDraft.steps.length < 2) return
    const steps = jobDraft.steps.filter((_, i) => i !== index)
    jobDraft = {
      ...jobDraft,
      steps,
      current: Math.min(jobDraft.current, steps.length - 1),
    }
  }

  // A line to follow or an area to work, drawn for the step being added to.
  function drawForJob(kind: "polygon" | "line") {
    engine?.setMeasuring(true, kind, true)
    engine?.setMeasureColour("#F7DB5C")
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

  const span = (ms: number) => {
    const minutes = Math.max(1, Math.round(ms / 60000))
    if (minutes < 60) return `${minutes} min`
    const rest = minutes % 60
    return `${Math.floor(minutes / 60)} h${rest ? ` ${rest} min` : ""}`
  }
  // What a trail being laid has done so far, in words.
  $: trailingNow = crewTrail
    ? [
        `Trailing ${span(now - crewTrail.since)}`,
        `${formatHa(crewTrail.ha)} ha`,
        crewTrail.metres >= 1000
          ? `${(crewTrail.metres / 1000).toFixed(1)} km`
          : `${Math.round(crewTrail.metres)} m`,
      ].join(" · ")
    : ""

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
    stopPinning()
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
    if (await engine?.keepAsPaddock(name))
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
    const name = measure?.paddock?.name
    if (await engine?.cutFromPaddock())
      say(`Cut out of ${name ?? "the paddock"}`)
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
  $: engine?.setTrailMarks(trailMarks)
  function toggleMark(mark: "centre" | "arrows") {
    trailMarks = { ...trailMarks, [mark]: !trailMarks[mark] }
    save("trail-marks", trailMarks)
  }

  // ── Measuring ──
  function startMeasuring() {
    panelOpen = false
    stopPinning()
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

  async function chooseOperation(next: Operation) {
    if (!userId || next.id === operation?.id || trailOn) return
    const result = await operationApi.updateSelectedOperation(userId, next.id)
    if (!result?.success) {
      say("Couldn't switch job. Try again.")
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
    if (pinning) stopPinning()
    else if (driverOffer) confirmDriver()
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
    return fly(node, { y: reduced ? 0 : 24, duration: reduced ? 0 : 240 })
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
    !!placing ||
    !!jobDraft ||
    !!lasso ||
    !!invite ||
    pinning ||
    roadAsk ||
    stopAsk ||
    operatorAsk ||
    !!sprayCard ||
    (trailFound && !foundDismissed) ||
    !!selectedPin ||
    !!selectedCrew ||
    !!selectedPaddock ||
    !!selectedTrail ||
    !!measure ||
    mineSelected

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
  function trailFacts(trail: TrailInfo) {
    const facts = [trail.operator || "No operator"]
    if (trail.machine) facts.push(machineFor(trail.machine).label)
    facts.push(`${trail.width} m wide`)
    if (trail.ha !== null) facts.push(`${formatHa(trail.ha)} ha`)
    if (trail.distance)
      facts.push(
        trail.distance >= 1000
          ? `${(trail.distance / 1000).toFixed(1)} km`
          : `${Math.round(trail.distance)} m`,
      )
    if (trail.end) facts.push(duration(trail.end - trail.start))
    if (trail.overlap !== null && trail.overlap !== undefined)
      facts.push(`${Math.round(trail.overlap)}% overlap`)
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
    deleteAsk = false
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

<svelte:window on:keydown={onKey} />

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

<div class="lp-theme mn" class:wide>
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
      {#if !wide}
        <button
          type="button"
          class="mn-status {status.tone}"
          disabled={status.tone !== "off"}
          on:click={askForLocation}
        >
          <span class="dot"></span>{status.text}
        </button>
      {/if}
      {#if trailOn}
        <button
          type="button"
          class="mn-chip trail"
          on:click={() => (stopAsk = true)}
        >
          <span class="dot"></span>Trail · {formatHa(readout.ha)} ha
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
      {#if readout.paddock}
        <p class="mn-place">
          <b>{readout.paddock.name}</b><span
            >{formatHa(readout.paddock.ha)} ha</span
          >
        </p>
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

    {#if !wide}
      <div class="mn-corner top-right">
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
    {#if !cardOpen}
      <div class="mn-corner bottom-left">
        {#if !wide}
          <!-- On a tablet the crew is listed in the rail. -->
          <button
            type="button"
            class="mn-crew-button"
            aria-label="Crew. {onlineCrew.length} on the map now"
            on:click={() => openPanel("crew")}
          >
            <Users size={22} />
            <span>Crew</span>
            {#if onlineCrew.length}<b>{onlineCrew.length}</b>{/if}
          </button>
        {/if}
      </div>
    {/if}
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
    {#if wide || !cardOpen}
      <div class="mn-corner bottom-right">
        {#if !guest}
          <button
            type="button"
            class="mn-trail-button"
            class:on={trailOn}
            disabled={recording.phase === "starting" ||
              recording.phase === "stopping"}
            aria-label={trailOn
              ? "Stop trail"
              : trailFound
                ? "Your running trail"
                : "Start trail"}
            on:click={trailTap}
          >
            <span class="rec"></span>
            <span>{trailOn ? "Stop" : "Trail"}</span>
          </button>
        {/if}
        {#if !guest}
          <button
            type="button"
            class="mn-pin-button"
            aria-label="Drop a pin"
            on:click={startPinning}
          >
            <PinArt look={choiceLook(pinKind)} size={wide ? 36 : 32} />
            <span>Pin</span>
          </button>
        {/if}
        <button
          type="button"
          class="mn-follow {follow}"
          disabled={!readout.hasFix}
          aria-label={follow === "free"
            ? "Centre on me and follow"
            : follow === "follow"
              ? "Following, north up. Tap for heads-up view"
              : "Heads-up view. Tap for north up"}
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
            {#if follow === "follow" && followHint}<small>North up</small>{/if}
          {/if}
        </button>
      </div>
    {/if}

    {#if driverOffer}
      <!-- ── Who is driving, confirmed on the way in ── -->
      <div class="mn-card" in:rise>
        <p class="lp-eyebrow">Driver</p>
        <h2 class="mn-card-title">Driving as {driverOffer.name}?</h2>
        <p class="mn-card-text">
          Trails laid from this screen are signed with this name.
        </p>
        <div class="mn-card-actions">
          <button
            type="button"
            class="lp-btn lp-btn-ghost"
            on:click={someoneElse}
          >
            Someone else
          </button>
          <button
            type="button"
            class="lp-btn lp-btn-primary mn-count"
            style="--left: {(driverLeft / DRIVER_WAIT) * 100}%"
            on:click={() => confirmDriver()}
          >
            Yes · {driverLeft}
          </button>
        </div>
      </div>
    {:else if jobDraft && !measure}
      <!-- ── Putting a job together ── -->
      {@const stepped = jobDraft.steps.length > 1}
      <div class="mn-card mn-menu" in:rise>
        <div class="mn-card-head">
          <p class="lp-eyebrow">New job</p>
          <button
            type="button"
            class="mn-icon-button"
            aria-label="Close"
            on:click={endJob}
          >
            <X size={22} />
          </button>
        </div>
        <div class="mn-job-build">
          <JobThumb
            items={jobDraft.steps.flatMap((step) => step.items)}
            {paddocks}
            {drawings}
          />
          <div class="mn-fields">
            <input
              type="text"
              bind:value={jobDraft.title}
              maxlength="80"
              placeholder="What needs doing"
              aria-label="What needs doing"
            />
            <input
              type="text"
              bind:value={jobDraft.note}
              maxlength="300"
              placeholder="Anything they should know (optional)"
              aria-label="Notes"
            />
          </div>
        </div>

        <div class="mn-steps">
          {#each jobDraft.steps as step, index}
            <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
            <div
              class="mn-step"
              class:current={stepped && jobDraft.current === index}
              on:click={() => jobDraft && (jobDraft.current = index)}
            >
              {#if stepped}
                <span class="n">{index + 1}</span>
                <input
                  type="text"
                  bind:value={step.title}
                  maxlength="80"
                  placeholder={index === 0
                    ? "First: get the sprayer from the shed"
                    : "Then…"}
                  aria-label="Step {index + 1}"
                  on:focus={() => jobDraft && (jobDraft.current = index)}
                />
                <button
                  type="button"
                  class="mn-icon-button"
                  aria-label="Remove step {index + 1}"
                  on:click|stopPropagation={() => removeStep(index)}
                >
                  <X size={18} />
                </button>
              {/if}
              <div class="mn-job-items">
                {#each step.items as item, i}
                  <span>
                    {item.label}
                    <button
                      type="button"
                      aria-label="Take {item.label} off"
                      on:click|stopPropagation={() =>
                        setStepItems(
                          index,
                          step.items.filter((_, at) => at !== i),
                        )}
                    >
                      <X size={15} />
                    </button>
                  </span>
                {/each}
              </div>
            </div>
          {/each}
        </div>

        <p class="mn-note">
          Tap a paddock or a pin on the map to add it{stepped
            ? ` to step ${jobDraft.current + 1}`
            : ""}; tap it again to take it off. Or add:
        </p>
        <div class="mn-job-tools">
          <button type="button" on:click={() => drawForJob("line")}>
            <Navigation size={15} /> A line to follow
          </button>
          <button type="button" on:click={() => drawForJob("polygon")}>
            <PencilRuler size={15} /> An area
          </button>
          {#if readout.hasFix}
            <button type="button" on:click={addWhereIAm}>
              <LocateFixed size={15} /> Where I am
            </button>
          {/if}
          {#if jobDraft.steps.length < 8}
            <button type="button" on:click={addStep}>
              <ClipboardList size={15} />
              {stepped ? "Another step" : "Make it steps"}
            </button>
          {/if}
        </div>

        <div class="mn-fields">
          <label>
            <span class="lp-eyebrow">For</span>
            <select bind:value={jobDraft.to}>
              <option value={null}>Anyone on the crew</option>
              {#each jobCrew as person (person.id)}
                <option value={person.id}>{person.name}</option>
              {/each}
            </select>
          </label>
        </div>
        <div class="mn-card-actions">
          <button type="button" class="lp-btn lp-btn-ghost" on:click={endJob}>
            Cancel
          </button>
          <button
            type="button"
            class="lp-btn lp-btn-primary"
            disabled={giving || !jobDraft.title.trim() || !jobPlaces}
            on:click={giveJob}
          >
            <ClipboardList size={18} />
            {jobDraft.to ? "Give job" : "Post job"}
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
    {:else if pinning}
      <!-- ── Dropping pins ── -->
      <div class="mn-card" in:rise>
        <div class="mn-card-head">
          <p class="lp-eyebrow">Drop a pin</p>
          <p class="mn-hint" aria-live="polite">
            {#if droppedHere}
              {droppedHere} dropped. Tap again for another.
            {:else}
              Pick what it is, then tap the map.
            {/if}
          </p>
        </div>
        <div class="mn-kinds" class:all={showAllPins}>
          {#each showAllPins ? pinChoices : quickPins as choice (choice.iconClass)}
            <button
              type="button"
              class="mn-kind"
              class:selected={pinKind === choice.iconClass}
              aria-pressed={pinKind === choice.iconClass}
              on:click={() => choosePin(choice.iconClass)}
            >
              <PinArt look={choiceLook(choice.iconClass)} size={34} />
              {choice.label}
            </button>
          {/each}
          {#if !showAllPins}
            <button
              type="button"
              class="mn-kind more"
              on:click={() => (showAllPins = true)}
            >
              All pins
            </button>
          {/if}
        </div>
        <div class="mn-card-actions">
          <button
            type="button"
            class="lp-btn lp-btn-ghost"
            disabled={!readout.hasFix}
            on:click={() => engine?.dropPin(pinKind)}
          >
            At my machine
          </button>
          <button
            type="button"
            class="lp-btn lp-btn-primary"
            on:click={stopPinning}
          >
            Done
          </button>
        </div>
      </div>
    {:else if operatorAsk}
      <!-- ── Who is driving ── -->
      <div class="mn-card" in:rise>
        <div class="mn-card-head">
          <p class="lp-eyebrow">
            {driverOnly ? "Driver" : "Before the trail starts"}
          </p>
          <button
            type="button"
            class="mn-icon-button"
            aria-label="Close"
            on:click={() => {
              operatorAsk = false
              driverOnly = false
            }}
          >
            <X size={22} />
          </button>
        </div>
        <h2 class="mn-card-title">Who's driving?</h2>
        <p class="mn-card-text">
          The trail and its spray record are signed with this name.
        </p>
        {#if operators.length}
          <div class="mn-kinds">
            {#each operators as choice (choice.id)}
              <button
                type="button"
                class="mn-kind"
                disabled={operatorBusy}
                on:click={() => chooseOperator(choice)}
              >
                <strong>{choice.name}</strong>
                {#if choice.in_use_by}<span>in use</span>{/if}
              </button>
            {/each}
          </div>
        {/if}
        <form
          class="mn-field"
          style="margin-top: 10px"
          on:submit|preventDefault={() => chooseOperator(null)}
        >
          <input
            type="text"
            bind:value={operatorName}
            placeholder={operators.length ? "Someone new" : "Your name"}
            autocomplete="name"
            maxlength="40"
          />
          <button
            type="submit"
            class="lp-btn lp-btn-primary"
            disabled={operatorBusy || !operatorName.trim()}
          >
            {driverOnly ? "Set" : "Start"}
          </button>
        </form>
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
    {:else if selectedTrail}
      <!-- ── A trail, picked out: what it was, and a replay of it ── -->
      <div class="mn-card mn-trail-card" in:rise>
        <div class="head">
          <span
            class="swatch"
            style="background: {drawColour(selectedTrail.colour)}"
          ></span>
          <div class="about">
            <p class="lp-eyebrow">
              Trail{trailIndex >= 0
                ? ` ${stepList.length - trailIndex} of ${stepList.length}`
                : ""}{trailScope ? ` through ${trailScope.name}` : ""}
            </p>
            <h2>{day(selectedTrail.start)} · {clock(selectedTrail.start)}</h2>
          </div>
          <button
            type="button"
            class="mn-icon-button"
            aria-label="Close"
            on:click={() => engine?.pickTrail(null)}
          >
            <X size={22} />
          </button>
        </div>
        <p class="facts">{trailFacts(selectedTrail).join(" · ")}</p>

        <div class="mn-replay">
          <button
            type="button"
            class="step"
            aria-label="Older trail"
            disabled={stepList.length < 2}
            on:click={() => stepTrail(1)}
          >
            <SkipBack size={20} fill="currentColor" />
          </button>
          <button
            type="button"
            class="play"
            aria-label={replay?.phase === "playing"
              ? "Pause the replay"
              : replay?.phase === "done"
                ? "Replay again"
                : "Replay this trail"}
            disabled={replay?.phase === "loading"}
            on:click={() =>
              replay?.phase === "playing"
                ? engine?.pauseReplay()
                : engine?.playReplay()}
          >
            {#if replay?.phase === "loading"}
              <span class="mn-spin"><LoaderCircle size={24} /></span>
            {:else if replay?.phase === "playing"}
              <Pause size={24} fill="currentColor" />
            {:else if replay?.phase === "done"}
              <RotateCcw size={24} />
            {:else}
              <Play size={24} fill="currentColor" />
            {/if}
          </button>
          <button
            type="button"
            class="step"
            aria-label="Newer trail"
            disabled={stepList.length < 2}
            on:click={() => stepTrail(-1)}
          >
            <SkipForward size={20} fill="currentColor" />
          </button>
          {#if replay && replay.phase !== "loading"}
            <span class="clock">
              <b>{clock(replay.time)}</b>
              <span>{replay.timed ? "as it happened" : "even pace"}</span>
            </span>
            <button
              type="button"
              class="rate"
              aria-label="Replay speed: {replay.rate} times"
              on:click={nextRate}
            >
              {replay.rate}×
            </button>
          {:else}
            <span class="clock">
              <span>Watch it being laid</span>
            </span>
          {/if}
        </div>
        {#if replay && replay.phase !== "loading"}
          <input
            class="mn-scrub"
            type="range"
            min="0"
            max="1"
            step="0.001"
            value={replay.progress}
            aria-label="Position in the replay"
            style="--done: {(replay.progress * 100).toFixed(1)}%"
            on:input={(e) => engine?.seekReplay(Number(e.currentTarget.value))}
          />
        {/if}

        <div class="mn-marks" role="group" aria-label="Show on this trail">
          <button
            type="button"
            aria-pressed={trailMarks.centre}
            on:click={() => toggleMark("centre")}
          >
            <span class="line" aria-hidden="true"></span> Centre line
          </button>
          <button
            type="button"
            aria-pressed={trailMarks.arrows}
            on:click={() => toggleMark("arrows")}
          >
            <Navigation size={15} fill="currentColor" /> Arrows
          </button>
        </div>

        {#if !guest}
          {#if deleteAsk}
            <p class="mn-warning">
              Delete this trail for good? It comes off the map and out of the
              farm's records, and can't be brought back.
            </p>
            <div class="mn-card-actions">
              <button
                type="button"
                class="lp-btn lp-btn-ghost"
                on:click={() => (deleteAsk = false)}
              >
                Keep it
              </button>
              <button
                type="button"
                class="mn-remove solid"
                on:click={deleteTrail}
              >
                <Trash2 size={17} /> Delete
              </button>
            </div>
          {:else}
            <button
              type="button"
              class="mn-text-button danger"
              on:click={() => (deleteAsk = true)}
            >
              Delete this trail
            </button>
          {/if}
        {/if}
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
            <p class="mn-warning">
              Cut this out of {measure.paddock?.name}? The paddock's boundary
              and hectares change for everyone, and this screen can't put it
              back.
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
                class="mn-remove solid"
                disabled={measure.keeping}
                on:click={cutOut}
              >
                {measure.keeping ? "Cutting…" : "Cut it out"}
              </button>
            </div>
          {:else}
            <div class="mn-keep">
              <button
                type="button"
                disabled={!measure.paddock || measure.keeping}
                on:click={keepOnPaddock}
              >
                <strong>
                  {measure.paddock
                    ? `Keep it on ${measure.paddock.name}`
                    : "Keep it on a paddock"}
                </strong>
                <span>
                  {measure.paddock
                    ? "It shows on the paddock with its name and size."
                    : "Start it inside a paddock to keep it there."}
                </span>
              </button>
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
              {#if !line}
                <button
                  type="button"
                  disabled={measure.keeping}
                  on:click={keepAsPaddock}
                >
                  <strong>Make it a paddock</strong>
                  <span>
                    A new paddock with this as its boundary, named as above.
                  </span>
                </button>
              {/if}
              {#if !line && measure.paddock}
                <button
                  type="button"
                  class="danger"
                  disabled={measure.keeping}
                  on:click={() => (cutAsk = true)}
                >
                  <strong>Cut it out of {measure.paddock.name}</strong>
                  <span>
                    For ground that is never worked: changes the paddock's
                    boundary and hectares for good.
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
    {:else if selectedPin}
      <!-- ── A pin ── -->
      <div in:rise>
        <PinCard
          pin={selectedPin}
          look={engine?.pinLook(selectedPin) ?? {
            iconClass: selectedPin.iconClass,
          }}
          distance={pinDistance}
          {guest}
          choices={pinChoices}
          {choiceLook}
          moving={movingPin === selectedPin.id}
          drawings={pinDrawings}
          {photoLinks}
          {uploading}
          on:place={() => {
            if (engine?.placePin()) say("Pin moved")
          }}
          on:draw={(e) =>
            selectedPin &&
            engine?.startDrawing(selectedPin.id, e.detail, drawColourNow)}
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
      </div>
    {:else if mineSelected}
      <!-- ── Your own machine ── -->
      <div in:rise>
        <MachineCard
          {marker}
          trailing={trailingNow}
          locked={trailOn || trailFound}
          on:close={() => engine?.selectedCrew.set(null)}
          on:change={(e) => changeMachine(e.detail)}
          on:machine={() => {
            engine?.selectedCrew.set(null)
            openPanel("machine")
          }}
        />
      </div>
    {:else if selectedCrew}
      <!-- ── Someone on the crew ── -->
      {#key selectedCrew.id}
        <div class="mn-card mn-menu" in:rise>
          <div class="head">
            <span class="art">
              <svelte:component
                this={vehicles[selectedCrew.type]}
                size="44px"
                bodyColor={selectedCrew.colour}
                outlineColor="#ffffff"
                wheelColor="#15261C"
                loadColor="#F7DB5C"
              />
            </span>
            <div class="about">
              <h2>
                {selectedCrew.name}{selectedCrew.guest ? " (guest)" : ""}
              </h2>
              <p>
                {[
                  selectedCrew.machineLabel,
                  selectedCrew.doing,
                  ...(selectedCrew.trailing
                    ? [
                        `Trailing${selectedCrew.operation ? ` · ${selectedCrew.operation}` : ""}`,
                      ]
                    : selectedCrew.operation
                      ? [selectedCrew.operation]
                      : []),
                  ...(selectedCrew.speed > 0
                    ? [`${selectedCrew.speed} km/h`]
                    : []),
                  ...(selectedCrew.distance !== null
                    ? [`${formatDistance(selectedCrew.distance)} away`]
                    : []),
                ].join(" · ")}
              </p>
            </div>
            <button
              type="button"
              class="mn-icon-button"
              aria-label="Close"
              on:click={() => engine?.selectedCrew.set(null)}
            >
              <X size={22} />
            </button>
          </div>
          {#if trailingNow}
            <p class="mn-trailing"><i></i>{trailingNow}</p>
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
      <div in:rise>
        <PaddockCard
          paddock={selectedPaddock}
          farms={farmNames}
          {guest}
          here={readout.paddock?.name === selectedPaddock.name}
          trails={paddockTrails}
          operation={operation?.name ?? ""}
          {pickedFeature}
          on:draw={startMeasuring}
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
            }
            if (pickTrail(e.detail)) trailScope = scope
          }}
          on:close={() => engine?.selectedPaddock.set(null)}
          on:change={(e) =>
            selectedPaddock &&
            engine?.updatePaddock(selectedPaddock.id, e.detail)}
          on:look={() =>
            selectedPaddock && engine?.lookAtPaddock(selectedPaddock.id)}
          on:remove={async () => {
            const gone = selectedPaddock
            if (gone && (await engine?.removePaddock(gone.id)))
              say(`${gone.name} deleted`)
          }}
        />
      </div>
    {/if}

    {#if snack && !pinning}
      <div class="mn-snack" role="status" in:rise>
        {snack.text}
        {#if snack.action}
          <button type="button" on:click={snack.action.run}
            >{snack.action.label}</button
          >
        {/if}
      </div>
    {/if}

    <!-- ── Toolbox: a side rail on a tablet, a sheet on a phone ── -->
    {#if wide || panelOpen}
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
        {status}
        {marker}
        {recording}
        {guest}
        hasFix={readout.hasFix}
        {crew}
        driver={$operatorStore.operator?.name ?? ""}
        {pinChoices}
        {pinKind}
        {choiceLook}
        {pinCount}
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
        {unread}
        unreadBy={Object.fromEntries(
          conversations.map((convo) => [convo.id, convo.unread]),
        )}
        on:messageCrew={(e) => openChat(e.detail)}
        messageWith={chatName}
        on:messagesBack={() => messenger?.open(null)}
        on:close={closePanel}
        on:locate={askForLocation}
        on:machine={(e) => changeMachine(e.detail)}
        {self}
        {hideStale}
        {pins}
        pinLook={(pin) => engine?.pinLook(pin) ?? { iconClass: pin.iconClass }}
        typeColours={$userSettingsStore.markerTypeDefaultColors ?? {}}
        {jobsWaiting}
        {jobsOpen}
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
        on:lookCrew={(e) => {
          if (e.detail === ME) {
            // Your own row: back to yourself.
            engine?.setFollow("follow")
            if (!wide) closePanel()
          } else if (engine?.lookAt(e.detail)) {
            engine.pickCrew(e.detail)
            if (!wide) closePanel()
          }
        }}
        on:pinKind={(e) => choosePin(e.detail)}
        on:dropPins={startPinning}
        on:operation={(e) => chooseOperation(e.detail)}
        on:lookTrail={(e) => {
          if (pickTrail(e.detail) && !wide) closePanel()
        }}
        on:replayTrail={(e) => {
          if (pickTrail(e.detail, true) && !wide) closePanel()
        }}
        on:lookPaddock={(e) => {
          if (engine?.pickPaddockById(e.detail) && !wide) closePanel()
        }}
        on:base={(e) => setBase(e.detail)}
        on:layer={(e) => setLayer(e.detail.key, e.detail.on)}
        on:measure={startMeasuring}
        on:broadcast={(e) => {
          if (engine?.startBroadcast(e.detail.reason, e.detail.colour))
            if (!wide) closePanel()
        }}
        on:stopBroadcast={() => engine?.stopBroadcast()}
        on:driver={chooseDriver}
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
            places={sharePlaces}
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
            on:send={(e) =>
              chatWith &&
              messenger?.send(
                chatWith,
                e.detail.body,
                e.detail.place,
                crew.find((person) => person.id === chatWith)?.online ?? false,
              )}
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
