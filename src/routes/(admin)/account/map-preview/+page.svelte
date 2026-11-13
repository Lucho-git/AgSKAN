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
    ChevronUp,
    LoaderCircle,
    LocateFixed,
    MessageCircle,
    Navigation,
    Pause,
    Play,
    RotateCcw,
    SkipBack,
    SkipForward,
    Trash2,
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
  import { compassPoint, distanceM } from "$lib/components/mapnext/geo"
  import { formatDistance, formatHa } from "$lib/components/mapnext/format"
  import {
    pinChoices as allPinChoices,
    pinColour,
    pinLabel,
    preferenceIconClass,
  } from "$lib/components/mapnext/pins"
  import {
    BROADCAST_FOR,
    LiveEngine,
    ME,
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
    flashLabel,
    loadBroadcastChoices,
    loadFarmChoices,
    loadMyVehicle,
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
  const joinedBefore = !!mapId && load<string[]>("joined")?.includes(mapId)
  let phase: "join" | "map" = joinedBefore ? "map" : "join"
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
      }),
      created.replay.subscribe((v) => (replay = v)),
      created.paddockList.subscribe((v) => (paddocks = v)),
      created.farmNames.subscribe((v) => (farmNames = v)),
      created.measure.subscribe((v) => (measure = v)),
      created.movingPin.subscribe((v) => (movingPin = v)),
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
        })
        .catch(() => {
          machineRead = true
          readTimer = setTimeout(readMine, 5000)
        })
    readMine()

    loadBroadcastChoices(mapId)
      .then((choices) => (broadcastChoices = choices))
      .catch(() => {})
    const ticking = setInterval(() => (now = Date.now()), 1000)
    stop.push(() => clearInterval(ticking))

    // Back again with location already allowed: no need to ask twice.
    if (joinedBefore && secure) {
      navigator.permissions
        ?.query({ name: "geolocation" })
        .then((result) => {
          if (result.state === "granted" && gps === "idle") created.startGps()
        })
        .catch(() => {})
    }
  })

  onDestroy(() => {
    clearTimeout(saveTimer)
    clearTimeout(readTimer)
    clearTimeout(snackTimer)
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
  $: trailIndex = selectedTrail
    ? trails.findIndex((t) => t.id === selectedTrail?.id)
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
    if (trailIndex < 0 || trails.length < 2) return
    const playing = !!replay
    for (let i = 1; i < trails.length; i++) {
      const next =
        trails[(trailIndex + by * i + trails.length * i) % trails.length]
      if (engine?.pickTrail(next.id)) {
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
            <span>{notice.body || notice.place?.label || ""}</span>
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
        <button
          type="button"
          class="mn-me"
          aria-label="You and the crew"
          on:click={() => openPanel("home")}
        >
          <span class="figure">
            <b>{Math.round(readout.speed)}</b><span>km/h</span>
          </span>
          {#if trailOn}
            <span class="figure">
              <b>{formatHa(readout.ha)}</b><span>ha</span>
            </span>
          {:else}
            <span class="figure">
              <b>{readout.hasFix ? compassPoint(readout.heading) : "–"}</b><span
                >heading</span
              >
            </span>
          {/if}
          <ChevronUp size={18} />
        </button>
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
      </div>
    {/if}
    {#if wide || !cardOpen}
      <div class="mn-corner bottom-right">
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
      </div>
    {/if}

    {#if pinning}
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
            Start
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
                ? ` ${trails.length - trailIndex} of ${trails.length}`
                : ""}
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
            disabled={trails.length < 2}
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
            disabled={trails.length < 2}
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
    {:else if measure}
      <!-- ── Measuring ── -->
      <div class="mn-card mn-menu" in:rise>
        <div class="mn-card-head">
          <p class="lp-eyebrow">Measure</p>
          <p class="mn-hint">
            {measure.points < 2
              ? "Tap the map to mark each corner."
              : measure.points < 3
                ? "One more corner gives an area."
                : `${measure.points} corners`}
          </p>
        </div>
        <div class="mn-measure">
          <div>
            <b>{metres(measure.distance)}</b><span
              >{measure.distance >= 1000 ? "km" : "m"} along</span
            >
          </div>
          <div>
            <b>{measure.points > 2 ? measure.ha.toFixed(2) : "–"}</b><span
              >ha inside</span
            >
          </div>
        </div>
        <div class="mn-card-actions">
          <button
            type="button"
            class="lp-btn lp-btn-ghost"
            disabled={!measure.points}
            on:click={() => engine?.undoMeasure()}
          >
            Undo
          </button>
          <button
            type="button"
            class="lp-btn lp-btn-primary"
            on:click={() => engine?.setMeasuring(false)}
          >
            Done
          </button>
        </div>
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
          <div class="mn-menu-actions">
            <button
              type="button"
              on:click={() => selectedCrew && engine?.lookAt(selectedCrew.id)}
            >
              <LocateFixed size={18} /> Centre on them
            </button>
            <button
              type="button"
              on:click={() => selectedCrew && openChat(selectedCrew.id)}
            >
              <MessageCircle size={18} /> Message
            </button>
          </div>
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
        messageWith={chatName}
        on:messagesBack={() => messenger?.open(null)}
        on:close={closePanel}
        on:locate={askForLocation}
        on:machine={(e) => changeMachine(e.detail)}
        on:lookCrew={(e) => {
          if (engine?.lookAt(e.detail)) {
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
