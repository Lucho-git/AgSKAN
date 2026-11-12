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
    LandPlot,
    LoaderCircle,
    LocateFixed,
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
  import { isGrainBinIcon } from "$lib/components/map/markers/markerPalette"
  import PinArt from "$lib/components/mapnext/PinArt.svelte"
  import { IMAGERY, type BaseLook } from "$lib/components/mapnext/mapStyle"
  import { machineFor } from "$lib/components/mapnext/machines"
  import { drawColour } from "$lib/components/mapnext/palette"
  import { compassPoint, distanceM } from "$lib/components/mapnext/geo"
  import {
    formatAgo,
    formatDistance,
    formatHa,
  } from "$lib/components/mapnext/format"
  import {
    pinChoices as allPinChoices,
    pinColour,
    pinLabel,
    preferenceIconClass,
  } from "$lib/components/mapnext/pins"
  import {
    LiveEngine,
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
    loadFarmChoices,
    loadMyVehicle,
    type FarmChoice,
    type LivePin,
    type Paddock,
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
  const myName = $profileStore?.full_name ?? ""

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
    (savedBase === "paper" || savedBase === "satellite" || IMAGERY[savedBase])
      ? savedBase
      : IMAGERY[preferred]
        ? preferred
        : "satellite"
  const lookOf = (key: string): BaseLook =>
    key === "paper" ? "paper" : "satellite"
  const imageryOf = (key: string) => (IMAGERY[key] ? key : null)
  $: baseChoices = [
    { key: "satellite", label: "Satellite", note: "Real imagery, toned down" },
    { key: "paper", label: "Drawn", note: "Paddocks, lanes and contours" },
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
  let deleteAsk = false
  let roadAsk = false
  let selectedCrewId: string | null = null
  let trails: TrailInfo[] = []
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
        })
        .catch(() => {
          machineRead = true
          readTimer = setTimeout(readMine, 5000)
        })
    readMine()

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

  function pinFacts(pin: LivePin) {
    const facts: string[] = []
    if (pin.note) facts.push(pinLabel(pin.iconClass))
    if (isGrainBinIcon(pin.iconClass)) {
      facts.push(`${Math.round(pin.fill)}% full`)
      if (pin.grainType) facts.push(pin.grainType)
    }
    if (pin.iconClass === "custom-svg-gate")
      facts.push(pin.gateOpen ? "Open" : "Closed")
    if (pin.rockPicked) facts.push("Picked")
    facts.push(`Dropped ${formatAgo(pin.t)}`)
    return facts
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
    startTrail()
  }

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
    !!selectedTrail

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
          aria-label="Toolbox. {onlineCrew.length} of the crew on the map"
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
        </button>
      </div>
    {/if}

    <!-- On a phone a card takes the place of the bottom controls. -->
    {#if wide || !cardOpen}
      {#if !wide}
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
                <b>{readout.hasFix ? compassPoint(readout.heading) : "–"}</b
                ><span>heading</span>
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

      <div class="mn-corner bottom-right">
        {#if wide && !guest}
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
          <p class="lp-eyebrow">Before the trail starts</p>
          <button
            type="button"
            class="mn-icon-button"
            aria-label="Close"
            on:click={() => (operatorAsk = false)}
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
    {:else if selectedPin}
      <!-- ── A pin ── -->
      {#key selectedPin.id}
        <div class="mn-card mn-about-card" in:rise>
          <PinArt
            look={engine?.pinLook(selectedPin) ?? {
              iconClass: selectedPin.iconClass,
            }}
            size={52}
          />
          <div>
            <h2>{selectedPin.note || pinLabel(selectedPin.iconClass)}</h2>
            <p>
              {[
                ...pinFacts(selectedPin),
                ...(pinDistance !== null
                  ? [`${formatDistance(pinDistance)} away`]
                  : []),
              ].join(" · ")}
            </p>
          </div>
          <button
            type="button"
            class="mn-icon-button"
            aria-label="Close"
            on:click={() => engine?.selectedPin.set(null)}
          >
            <X size={22} />
          </button>
          {#if !guest}
            <button
              type="button"
              class="mn-remove"
              on:click={removeSelectedPin}
            >
              <Trash2 size={17} /> Remove pin
            </button>
          {/if}
        </div>
      {/key}
    {:else if selectedCrew}
      <!-- ── Someone on the crew ── -->
      {#key selectedCrew.id}
        <div class="mn-card mn-about-card" in:rise>
          <span class="art">
            <svelte:component
              this={vehicles[selectedCrew.type]}
              size="46px"
              bodyColor={selectedCrew.colour}
              outlineColor="#ffffff"
              wheelColor="#15261C"
              loadColor="#F7DB5C"
            />
          </span>
          <div>
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
      {/key}
    {:else if selectedPaddock}
      <!-- ── A paddock ── -->
      {#key selectedPaddock.id}
        <div class="mn-card mn-about-card" in:rise>
          <span class="art"><LandPlot size={30} /></span>
          <div>
            <h2>{selectedPaddock.name}</h2>
            <p>
              {[
                ...(selectedPaddock.ha > 0
                  ? [`${formatHa(selectedPaddock.ha)} ha`]
                  : []),
                ...(selectedPaddock.farm ? [selectedPaddock.farm] : []),
                ...(readout.paddock?.name === selectedPaddock.name
                  ? ["You're in it"]
                  : []),
              ].join(" · ") || "Paddock"}
            </p>
          </div>
          <button
            type="button"
            class="mn-icon-button"
            aria-label="Close"
            on:click={() => engine?.selectedPaddock.set(null)}
          >
            <X size={22} />
          </button>
          <button
            type="button"
            class="lp-btn lp-btn-ghost wide-row"
            style="margin-top: 8px"
            on:click={() =>
              selectedPaddock && engine?.lookAtPaddock(selectedPaddock.id)}
          >
            <LocateFixed size={18} /> Show the whole paddock
          </button>
        </div>
      {/key}
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
        {myName}
        {marker}
        {readout}
        {recording}
        {guest}
        {crew}
        {pinChoices}
        {pinKind}
        {choiceLook}
        {pinCount}
        {operations}
        {operation}
        {trails}
        {loading}
        base={baseKey}
        {baseChoices}
        {farmName}
        {farmOwner}
        {isOwner}
        {farm}
        {farms}
        currentFarmId={mapId}
        on:close={closePanel}
        on:locate={askForLocation}
        on:machine={(e) => changeMachine(e.detail)}
        on:lookCrew={(e) => {
          if (engine?.lookAt(e.detail)) {
            engine.pickCrew(e.detail)
            if (!wide) closePanel()
          }
        }}
        on:startTrail={trailTap}
        on:stopTrail={() => {
          stopAsk = true
          if (!wide) closePanel()
        }}
        on:pinKind={(e) => choosePin(e.detail)}
        on:dropPins={startPinning}
        on:operation={(e) => chooseOperation(e.detail)}
        pickedTrail={selectedTrail?.id ?? null}
        on:lookTrail={(e) => {
          if (pickTrail(e.detail) && !wide) closePanel()
        }}
        on:replayTrail={(e) => {
          if (pickTrail(e.detail, true) && !wide) closePanel()
        }}
        on:base={(e) => setBase(e.detail)}
        on:fitFarm={() => {
          if (!engine?.fitFarm()) say("This farm has no paddocks yet.")
          else if (!wide) closePanel()
        }}
        on:farm={(e) => switchFarm(e.detail)}
        on:foundTrail={() => {
          foundDismissed = false
          if (!wide) closePanel()
        }}
        on:leave={(e) => leave(e.detail)}
      />
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
