<script lang="ts">
  /**
   * DESIGN PROTOTYPE — a from-scratch take on the map viewer, in the landing
   * page's visual language, on a real map. Not wired to an account: nothing
   * is read from or sent to the server.
   *
   * Real: the map, the viewer's own position, heading, speed and the trail
   * their machine paints. Example: the paddocks, the crew and their pins,
   * which are placed around wherever the viewer is.
   *
   * The screen is the map. Everything else is one status chip, one "you"
   * readout, one follow button and one pin button; the crew and settings live
   * in a single panel that is a side rail on a cab tablet and a pull-up sheet
   * on a phone.
   */
  import { onDestroy, onMount } from "svelte"
  import { fly } from "svelte/transition"
  import { PUBLIC_MAPBOX_ACCESS_TOKEN } from "$env/static/public"
  import {
    ChevronUp,
    LocateFixed,
    Minus,
    Navigation,
    Play,
    Plus,
    Square,
    Trash2,
    X,
  } from "lucide-svelte"
  import vehicles from "$lib/vehicles"
  import {
    MapEngine,
    type CrewRow,
    type FollowMode,
    type GpsState,
    type Me,
    type Pin,
    type Readout,
  } from "./engine"
  import type { BaseLook } from "./mapStyle"
  import { MACHINE_SPECS, machineById } from "./farm"
  import { compassPoint, distanceM } from "./geo"
  import { PIN_KINDS, pinGlyphs, type PinKind } from "./glyphs"
  import { formatAgo, formatDistance, formatHa } from "./format"
  import CrewList from "./CrewList.svelte"
  import JoinSheet from "./JoinSheet.svelte"
  import PinGlyph from "./PinGlyph.svelte"

  const STORE = "agskan-map-preview"
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
      // Storage can be blocked; the prototype carries on without it.
    }
  }

  // ── Choices ──
  const saved = load<Me>("me")
  // Rust by default: the example crew already use blue, green and teal.
  let me: Me = saved ?? { name: "", machine: "sprayer", colour: "#D95D39" }
  let base: BaseLook = load<BaseLook>("base") ?? "satellite"
  let introSeen = load<boolean>("intro") === true

  // ── Where we are in the flow ──
  let phase: "join" | "map" = "join"
  let step: "you" | "locate" = saved ? "locate" : "you"
  let returning = false

  // ── Chrome ──
  let panelOpen = false
  let panelLead: "you" | "crew" = "you"
  let pinning = false
  let pinKind: PinKind = "rock"
  let dropped = 0
  let wide = false
  let online = true
  let secure = true

  // ── The map ──
  let mapEl: HTMLDivElement
  let engine: MapEngine | null = null
  let ready = false
  let gps: GpsState = "idle"
  let follow: FollowMode = "free"
  let driving = false
  let bearing = 0
  let crew: CrewRow[] = []
  let pins: Pin[] = []
  let selectedPin: Pin | null = null
  let readout: Readout = {
    hasFix: false,
    speed: 0,
    heading: 0,
    ha: 0,
    accuracy: null,
    paddock: null,
    stale: false,
  }
  const stop: (() => void)[] = []

  $: machine = machineById(me.machine)
  $: spec = MACHINE_SPECS[me.machine]
  $: paints = spec.swath > 0
  $: firstName = me.name.trim().split(/\s+/)[0] || "You"

  $: status = driving
    ? { tone: "drive", text: "Example drive" }
    : gps === "live"
      ? !online
        ? { tone: "warn", text: "No signal · saving" }
        : readout.stale
          ? { tone: "warn", text: "Looking for GPS" }
          : { tone: "live", text: "Live" }
      : gps === "asking"
        ? { tone: "warn", text: "Finding you" }
        : { tone: "off", text: "Location off" }

  // The first real fix ends the join flow.
  $: if (phase === "join" && step === "locate" && gps === "live") phase = "map"
  // Keep "centred" meaning centred in the part of the map that isn't covered.
  $: engine?.setInsets(wide ? 336 : 0, wide ? 0 : 76)
  $: pinDistance =
    selectedPin && readout.hasFix && engine
      ? distanceFromMe(selectedPin, readout)
      : null

  // `fix` is only here so the distance refreshes as the viewer moves.
  function distanceFromMe(pin: Pin, fix: Readout) {
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

    const created = new MapEngine(mapEl, PUBLIC_MAPBOX_ACCESS_TOKEN, {
      me,
      base,
    })
    engine = created
    stop.push(
      created.ready.subscribe((v) => (ready = v)),
      created.gps.subscribe((v) => (gps = v)),
      created.follow.subscribe((v) => (follow = v)),
      created.driving.subscribe((v) => (driving = v)),
      created.bearing.subscribe((v) => (bearing = v)),
      created.crew.subscribe((v) => (crew = v)),
      created.pins.subscribe((v) => (pins = v)),
      created.selectedPin.subscribe((v) => (selectedPin = v)),
      created.readout.subscribe((v) => (readout = v)),
      () => window.removeEventListener("online", goOnline),
      () => window.removeEventListener("offline", goOffline),
      () => query.removeEventListener("change", onQuery),
    )

    // Back again with location already allowed: no need to ask twice.
    if (saved && secure) {
      navigator.permissions
        ?.query({ name: "geolocation" })
        .then((result) => {
          if (result.state === "granted" && gps === "idle") created.startGps()
        })
        .catch(() => {})
    }
  })

  onDestroy(() => {
    stop.forEach((fn) => fn())
    engine?.destroy()
  })

  function changeMe(next: Me) {
    me = next
    save("me", me)
    engine?.setMe(me)
  }

  function finishJoin() {
    save("me", me)
    returning = false
    phase = "map"
  }

  function exampleDrive() {
    save("me", me)
    engine?.startDrive()
    returning = false
    panelOpen = false
    phase = "map"
  }

  function changeMachine() {
    panelOpen = false
    stopPinning()
    returning = true
    step = "you"
    phase = "join"
  }

  function askForLocation() {
    panelOpen = false
    returning = false
    step = "locate"
    phase = "join"
  }

  function setBase(look: BaseLook) {
    base = look
    save("base", look)
    engine?.setBase(look)
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

  function openPanel(lead: "you" | "crew") {
    panelLead = lead
    panelOpen = true
  }

  function lookAtCrew(id: string) {
    engine?.lookAt(id)
    panelOpen = false
  }

  function startPinning() {
    panelOpen = false
    pinning = true
    dropped = 0
    engine?.armPin(pinKind)
  }

  function stopPinning() {
    pinning = false
    engine?.armPin(null)
  }

  function choosePin(kind: PinKind) {
    pinKind = kind
    engine?.armPin(kind)
  }

  function dropAtMe() {
    engine?.dropPin(pinKind)
  }

  // Count drops made while the picker is open, to confirm each one.
  let pinCount = 0
  $: if (pins.length !== pinCount) {
    if (pinning && pins.length > pinCount) dropped += pins.length - pinCount
    pinCount = pins.length
  }

  function dismissIntro() {
    introSeen = true
    save("intro", true)
  }

  function onKey(event: KeyboardEvent) {
    if (event.key !== "Escape") return
    if (pinning) stopPinning()
    else if (selectedPin) engine?.selectedPin.set(null)
    else panelOpen = false
  }

  const rise = (node: Element) => {
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches
    return fly(node, { y: reduced ? 0 : 24, duration: reduced ? 0 : 240 })
  }
</script>

<svelte:window on:keydown={onKey} />

<svelte:head>
  <title>Map — AgSKAN (design prototype)</title>
  <meta name="robots" content="noindex" />
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1, viewport-fit=cover"
  />
</svelte:head>

<div class="mv" class:wide class:paper={base === "paper"} class:pinning>
  <div class="mv-map" bind:this={mapEl}></div>

  {#if phase === "map"}
    <!-- ── On the map ── -->
    {#if !wide}
      <div class="mv-corner top-left">
        <button
          type="button"
          class="mv-status {status.tone}"
          disabled={status.tone !== "off"}
          on:click={askForLocation}
        >
          <span class="dot"></span>{status.text}
        </button>
        <div class="mv-row">
          {#if driving}
            <button
              type="button"
              class="mv-stop"
              on:click={() => engine?.stopDrive()}
            >
              <Square size={11} fill="currentColor" /> Stop
            </button>
          {/if}
          {#if readout.paddock}
            <p class="mv-place">
              <b>{readout.paddock.name}</b><span>{readout.paddock.ha} ha</span>
            </p>
          {/if}
        </div>
      </div>

      <div class="mv-corner top-right">
        <button
          type="button"
          class="mv-crew-button"
          aria-label="Crew: {crew.length} on the map"
          on:click={() => openPanel("crew")}
        >
          <span class="dots" aria-hidden="true">
            {#each crew as person}
              <i style="background: {person.colour}"></i>
            {/each}
          </span>
          Crew
        </button>
        <div class="mv-look" role="group" aria-label="Map style">
          <button
            type="button"
            aria-pressed={base === "satellite"}
            on:click={() => setBase("satellite")}>Satellite</button
          >
          <button
            type="button"
            aria-pressed={base === "paper"}
            on:click={() => setBase("paper")}>Drawn</button
          >
        </div>
      </div>
    {/if}

    <!-- On a phone a pin's card takes the place of the bottom controls. -->
    {#if !pinning && (wide || !selectedPin)}
      {#if !wide}
        <button
          type="button"
          class="mv-me"
          aria-label="You and the crew"
          on:click={() => openPanel("you")}
        >
          <span class="figure">
            <b>{Math.round(readout.speed)}</b><span>km/h</span>
          </span>
          {#if paints}
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
      {/if}

      <div class="mv-corner bottom-right">
        {#if wide}
          <div class="mv-zoom">
            <button
              type="button"
              aria-label="Zoom in"
              on:click={() => engine?.zoomBy(1)}><Plus size={24} /></button
            >
            <button
              type="button"
              aria-label="Zoom out"
              on:click={() => engine?.zoomBy(-1)}><Minus size={24} /></button
            >
          </div>
        {/if}
        <button
          type="button"
          class="mv-follow {follow}"
          disabled={!readout.hasFix}
          aria-label={follow === "free"
            ? "Centre on me and follow"
            : follow === "follow"
              ? "Following, north up. Tap for heads-up view"
              : "Heads-up view. Tap for north up"}
          on:click={cycleFollow}
        >
          {#if follow === "cab"}
            <span class="needle" style="transform: rotate({-45}deg)">
              <Navigation size={wide ? 26 : 24} fill="currentColor" />
            </span>
            {#if followHint}<small>Heads up</small>{/if}
          {:else}
            <LocateFixed size={wide ? 28 : 26} />
            {#if follow === "follow" && followHint}<small>North up</small>{/if}
          {/if}
        </button>
        {#if follow === "cab"}
          <span class="mv-north" aria-hidden="true">
            <i style="transform: rotate({-bearing}deg)">N</i>
          </span>
        {/if}
        <button
          type="button"
          class="mv-pin-button"
          aria-label="Drop a pin"
          on:click={startPinning}
        >
          <PinGlyph kind="rock" size={wide ? 34 : 30} />
          <span>Pin</span>
        </button>
      </div>
    {/if}

    <!-- ── Dropping pins ── -->
    {#if pinning}
      <div class="mv-card mv-pinning" in:rise>
        <div class="mv-card-head">
          <p class="lp-eyebrow">Drop a pin</p>
          <p class="mv-hint" aria-live="polite">
            {#if dropped}
              {dropped} dropped. Tap again for another.
            {:else}
              Pick what it is, then tap the map.
            {/if}
          </p>
        </div>
        <div class="mv-kinds">
          {#each PIN_KINDS as kind}
            <button
              type="button"
              class="mv-kind"
              class:selected={pinKind === kind}
              aria-pressed={pinKind === kind}
              on:click={() => choosePin(kind)}
            >
              <PinGlyph {kind} size={34} />
              {pinGlyphs[kind].label}
            </button>
          {/each}
        </div>
        <div class="mv-card-actions">
          <button
            type="button"
            class="lp-btn lp-btn-ghost"
            disabled={!readout.hasFix}
            on:click={dropAtMe}
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
    {:else if selectedPin}
      <!-- ── A pin ── -->
      {#key selectedPin.id}
        <div class="mv-card mv-pin-card" in:rise>
          <span class="glyph"
            ><PinGlyph kind={selectedPin.kind} size={52} /></span
          >
          <div class="about">
            <h2>{selectedPin.note || pinGlyphs[selectedPin.kind].label}</h2>
            <p>
              {#if selectedPin.by === "you"}
                Dropped by you · {formatAgo(selectedPin.t)}
              {:else}
                Example pin
              {/if}
              {#if pinDistance !== null}
                · {formatDistance(pinDistance)} away{/if}
            </p>
          </div>
          <button
            type="button"
            class="mv-icon-button"
            aria-label="Close"
            on:click={() => engine?.selectedPin.set(null)}
          >
            <X size={22} />
          </button>
          <button
            type="button"
            class="mv-remove"
            on:click={() => selectedPin && engine?.removePin(selectedPin.id)}
          >
            <Trash2 size={17} /> Remove pin
          </button>
        </div>
      {/key}
    {:else if !introSeen && ready}
      <div class="mv-card mv-intro" in:rise>
        <p class="lp-eyebrow">Design prototype</p>
        <p class="mv-intro-text">
          You're real: your position, heading and trail. The paddocks, the crew
          and their pins are examples placed around you.
        </p>
        <button
          type="button"
          class="lp-btn lp-btn-primary"
          on:click={dismissIntro}>Got it</button
        >
      </div>
    {/if}

    <!-- ── You and the crew: a side rail on a tablet, a sheet on a phone ── -->
    {#if wide || panelOpen}
      {#if !wide}
        <button
          type="button"
          class="mv-scrim"
          aria-label="Close"
          on:click={() => (panelOpen = false)}
        ></button>
      {/if}
      <aside
        class="mv-panel"
        class:crew-first={!wide && panelLead === "crew"}
        aria-label="You and the crew"
      >
        <header class="mv-panel-head">
          <span class="mark"
            ><img src="/images/logo.svg" alt="" width="30" height="30" /></span
          >
          <span class="word">AgSKAN</span>
          {#if wide}
            <button
              type="button"
              class="mv-status {status.tone}"
              disabled={status.tone !== "off"}
              on:click={askForLocation}
            >
              <span class="dot"></span>{status.text}
            </button>
          {:else}
            <button
              type="button"
              class="mv-icon-button"
              aria-label="Close"
              on:click={() => (panelOpen = false)}
            >
              <X size={22} />
            </button>
          {/if}
        </header>

        <section class="mv-you">
          <div class="mv-you-top">
            <span class="art">
              <svelte:component
                this={vehicles[machine.name]}
                size="48px"
                bodyColor={me.colour}
                outlineColor="#ffffff"
                wheelColor="#15261C"
                loadColor="#F7DB5C"
              />
            </span>
            <span class="who">
              <strong>{firstName}</strong>
              <span>
                {machine.label}{paints ? ` · ${spec.swath} m` : " · no trail"}
              </span>
            </span>
          </div>

          <div class="mv-figures">
            <div>
              <b>{Math.round(readout.speed)}</b><span>km/h</span>
            </div>
            {#if paints}
              <div>
                <b>{formatHa(readout.ha)}</b><span>ha covered</span>
              </div>
            {/if}
            <div>
              <b>{readout.hasFix ? compassPoint(readout.heading) : "–"}</b><span
                >heading</span
              >
            </div>
          </div>

          <p class="mv-where">
            {#if !readout.hasFix}
              Not on the map yet
            {:else if readout.paddock}
              In {readout.paddock.name} · {readout.paddock.ha} ha
            {:else}
              Outside the paddocks
            {/if}
            {#if readout.accuracy !== null && readout.hasFix}
              <span>GPS ±{Math.round(readout.accuracy)} m</span>
            {/if}
          </p>

          <div class="mv-you-actions">
            {#if driving}
              <button
                type="button"
                class="lp-btn lp-btn-ghost"
                on:click={() => engine?.stopDrive()}
              >
                <Square size={14} fill="currentColor" /> Stop example drive
              </button>
            {:else}
              <button
                type="button"
                class="lp-btn lp-btn-ghost"
                on:click={exampleDrive}
              >
                <Play size={15} fill="currentColor" /> Example drive
              </button>
            {/if}
            <button
              type="button"
              class="mv-text-button"
              on:click={changeMachine}>Change machine</button
            >
            {#if readout.ha > 0}
              <button
                type="button"
                class="mv-text-button"
                on:click={() => engine?.clearTrail()}>Clear my trail</button
              >
            {/if}
          </div>
        </section>

        <section class="mv-crew-block">
          <div class="mv-section-head">
            <p class="lp-eyebrow">Crew · {crew.length} on the map</p>
            <span class="mv-example">Example</span>
          </div>
          <CrewList {crew} on:look={(e) => lookAtCrew(e.detail)} />
        </section>

        <footer class="mv-panel-foot">
          {#if wide}
            <div class="mv-look" role="group" aria-label="Map style">
              <button
                type="button"
                aria-pressed={base === "satellite"}
                on:click={() => setBase("satellite")}>Satellite</button
              >
              <button
                type="button"
                aria-pressed={base === "paper"}
                on:click={() => setBase("paper")}>Drawn</button
              >
            </div>
          {/if}
          <p>
            Design prototype: you are real; paddocks, crew and their pins are
            examples. Nothing is sent anywhere.
          </p>
          <p class="credit">
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
      </aside>
    {/if}
  {:else}
    <JoinSheet
      {me}
      bind:step
      {gps}
      {returning}
      {secure}
      on:change={(e) => changeMe(e.detail)}
      on:done={finishJoin}
      on:locate={() => engine?.startGps()}
      on:drive={exampleDrive}
    />
  {/if}
</div>

<style>
  .mv {
    --mv-gap: max(12px, env(safe-area-inset-left));
    --mv-top: max(12px, env(safe-area-inset-top));
    --mv-bottom: max(14px, env(safe-area-inset-bottom));
    /* Width the side rail takes on a tablet; 0 on a phone. */
    --mv-rail: 0px;
    position: fixed;
    inset: 0;
    overflow: hidden;
    background: #cdbd92;
    color: var(--lp-ink);
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
  }
  .mv.wide {
    --mv-rail: 324px;
  }
  .mv-map {
    position: absolute;
    inset: 0;
  }
  .mv-map :global(.mapboxgl-ctrl-logo),
  .mv-map :global(.mapboxgl-ctrl-attrib) {
    display: none;
  }
  .mv button {
    font-family: inherit;
  }
  .mv button:focus-visible {
    outline: 3px solid var(--lp-yellow);
    outline-offset: 2px;
  }

  /* ── Paddock names: mono, like the illustrated map ── */
  .mv-map :global(.mv-paddock-label) {
    display: grid;
    justify-items: center;
    gap: 1px;
    color: #f4f1e6;
    opacity: var(--mv-label-opacity, 1);
    text-shadow:
      0 0 3px rgba(13, 22, 17, 0.95),
      0 1px 6px rgba(13, 22, 17, 0.8);
    transition: opacity 0.25s ease;
    pointer-events: none;
  }
  .mv-map :global(.mv-paddock-label b),
  .mv-map :global(.mv-paddock-label span) {
    font-family: var(--lp-mono);
    letter-spacing: 0.03em;
    line-height: 1.1;
    white-space: nowrap;
  }
  .mv-map :global(.mv-paddock-label b) {
    font-size: var(--mv-label-size, 12px);
    font-weight: 700;
  }
  .mv-map :global(.mv-paddock-label span) {
    font-size: calc(var(--mv-label-size, 12px) * 0.8);
    opacity: 0.85;
  }
  .mv.paper .mv-map :global(.mv-paddock-label) {
    color: #15261c;
    text-shadow: none;
  }
  .mv.paper .mv-map :global(.mv-paddock-label span) {
    opacity: 0.62;
  }

  /* ── Corners ── */
  .mv-corner {
    position: absolute;
    z-index: 10;
    display: flex;
    flex-direction: column;
    gap: 8px;
    pointer-events: none;
  }
  .mv-corner > :global(*) {
    pointer-events: auto;
  }
  .top-left {
    top: var(--mv-top);
    left: var(--mv-gap);
    align-items: flex-start;
  }
  .top-right {
    top: var(--mv-top);
    right: var(--mv-gap);
    align-items: flex-end;
  }
  .bottom-right {
    right: var(--mv-gap);
    bottom: var(--mv-bottom);
    align-items: center;
    gap: 12px;
  }
  .mv-row {
    display: flex;
    align-items: stretch;
    gap: 6px;
  }

  /* Status chip: the one from the landing page's device frames. */
  .mv-status,
  .mv-stop {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 36px;
    padding: 0 14px 0 12px;
    border-radius: 99px;
    background: rgba(18, 32, 26, 0.94);
    color: #f4f1e6;
    font-family: var(--lp-mono) !important;
    font-size: 11.5px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    white-space: nowrap;
    box-shadow: 0 4px 14px -6px rgba(10, 25, 15, 0.7);
  }
  .mv-status .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #8d978f;
  }
  .mv-status.live .dot {
    background: #39d27a;
    animation: mv-blink 1.8s ease-out infinite;
  }
  .mv-status.warn .dot {
    background: #f7b23b;
  }
  .mv-status.drive .dot {
    background: #f7db5c;
  }
  .mv-status.off {
    text-decoration: underline;
    text-decoration-color: rgba(244, 241, 230, 0.4);
    text-underline-offset: 3px;
  }
  @keyframes mv-blink {
    0% {
      box-shadow: 0 0 0 0 rgba(57, 210, 122, 0.7);
    }
    100% {
      box-shadow: 0 0 0 8px rgba(57, 210, 122, 0);
    }
  }
  .mv-stop {
    gap: 6px;
    background: #f7db5c;
    color: #15261c;
  }

  .mv-place {
    display: inline-flex;
    align-items: baseline;
    gap: 8px;
    padding: 7px 12px;
    border-radius: 12px;
    background: var(--lp-card);
    box-shadow:
      0 0 0 1px var(--lp-line),
      0 4px 14px -6px rgba(10, 25, 15, 0.5);
  }
  .mv-place b,
  .mv-place span {
    font-family: var(--lp-mono);
    letter-spacing: 0.04em;
    line-height: 1.1;
  }
  .mv-place b {
    font-size: 14px;
    font-weight: 700;
  }
  .mv-place span {
    font-size: 11.5px;
    color: var(--lp-ink-soft);
  }

  .mv-crew-button {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    padding: 0 14px 0 10px;
    border-radius: 99px;
    background: var(--lp-card);
    color: var(--lp-ink);
    font-size: 15px;
    font-weight: 700;
    box-shadow:
      0 0 0 1px var(--lp-line),
      0 4px 14px -6px rgba(10, 25, 15, 0.5);
  }
  .mv-crew-button .dots {
    display: flex;
  }
  .mv-crew-button .dots i {
    width: 16px;
    height: 16px;
    margin-left: -5px;
    border: 2px solid var(--lp-card);
    border-radius: 50%;
  }
  .mv-crew-button .dots i:first-child {
    margin-left: 0;
  }

  /* Satellite / Drawn */
  .mv-look {
    display: inline-flex;
    padding: 3px;
    border-radius: 99px;
    background: rgba(18, 32, 26, 0.94);
    box-shadow: 0 4px 14px -6px rgba(10, 25, 15, 0.7);
  }
  .mv-look button {
    min-height: 34px;
    padding: 0 12px;
    border-radius: 99px;
    color: rgba(244, 241, 230, 0.72);
    font-family: var(--lp-mono);
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  .mv-look button[aria-pressed="true"] {
    background: #f4f1e6;
    color: #15261c;
  }

  /* ── "You" readout (phone) ── */
  .mv-me {
    position: absolute;
    bottom: var(--mv-bottom);
    left: var(--mv-gap);
    z-index: 10;
    display: flex;
    align-items: center;
    gap: 14px;
    min-height: 64px;
    padding: 8px 12px 8px 18px;
    border-radius: 22px;
    background: rgba(18, 32, 26, 0.95);
    color: #f4f1e6;
    box-shadow: 0 10px 24px -10px rgba(10, 25, 15, 0.8);
  }
  .mv-me .figure {
    display: grid;
    justify-items: start;
    min-width: 46px;
  }
  .mv-me .figure b {
    font-family: var(--lp-display);
    font-size: 30px;
    font-weight: 800;
    letter-spacing: -0.02em;
    line-height: 0.95;
    font-variant-numeric: tabular-nums;
  }
  .mv-me .figure span {
    font-family: var(--lp-mono);
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(244, 241, 230, 0.7);
  }
  .mv-me :global(svg) {
    opacity: 0.6;
  }

  /* ── Follow, zoom and pin ── */
  .mv-follow,
  .mv-zoom {
    background: var(--lp-card);
    color: var(--lp-ink);
    box-shadow:
      0 0 0 1px var(--lp-line),
      0 8px 20px -10px rgba(10, 25, 15, 0.7);
  }
  .mv-follow {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 58px;
    height: 58px;
    border-radius: 50%;
  }
  .mv-follow:disabled {
    opacity: 0.55;
  }
  .mv-follow.follow,
  .mv-follow.cab {
    background: #15261c;
    color: #f7db5c;
    box-shadow: 0 8px 20px -10px rgba(10, 25, 15, 0.9);
  }
  .mv-follow small {
    position: absolute;
    right: calc(100% + 8px);
    padding: 5px 9px;
    border-radius: 99px;
    background: rgba(18, 32, 26, 0.94);
    color: #f4f1e6;
    font-family: var(--lp-mono);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    white-space: nowrap;
  }
  .mv-follow .needle {
    display: flex;
  }
  .mv-north {
    position: absolute;
    top: -4px;
    right: -4px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: #f4f1e6;
    box-shadow: 0 0 0 1px #d6d1bd;
    pointer-events: none;
  }
  .mv.wide .mv-north {
    top: 112px;
  }
  .mv-north i {
    font-family: var(--lp-mono);
    font-size: 11px;
    font-style: normal;
    font-weight: 700;
    color: #d95d39;
  }
  .mv-zoom {
    display: grid;
    border-radius: 18px;
  }
  .mv-zoom button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 54px;
    height: 54px;
  }
  .mv-zoom button + button {
    border-top: 1px solid var(--lp-line);
  }
  .mv-pin-button {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1px;
    width: 68px;
    height: 68px;
    border-radius: 24px;
    background: var(--lp-yellow);
    color: #15261c;
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.5) inset,
      0 12px 24px -10px rgba(120, 95, 10, 0.9);
  }
  .mv-pin-button span {
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.02em;
    line-height: 1;
  }
  .mv.wide .mv-follow {
    width: 64px;
    height: 64px;
  }
  .mv.wide .mv-pin-button {
    width: 80px;
    height: 80px;
    border-radius: 28px;
  }
  .mv.wide .mv-pin-button span {
    font-size: 13px;
  }

  /* ── Cards that rise from the bottom of the map ── */
  .mv-card {
    position: absolute;
    right: var(--mv-gap);
    bottom: var(--mv-bottom);
    left: calc(var(--mv-rail) + var(--mv-gap));
    z-index: 12;
    max-width: 34rem;
    margin-inline: auto;
    padding: 14px;
    border-radius: 22px;
    background: var(--lp-card);
    box-shadow:
      0 0 0 1px var(--lp-line),
      0 20px 40px -18px rgba(10, 25, 15, 0.7);
  }
  /* On a tablet the cards stop short of the buttons down the right edge. */
  .mv.wide .mv-card {
    right: calc(var(--mv-gap) + 96px);
  }
  .mv-card-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 4px 12px;
  }
  .mv-hint {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--lp-ink-soft);
  }
  .mv-kinds {
    display: flex;
    gap: 8px;
    margin: 12px -14px 0;
    padding: 2px 14px 6px;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .mv-kinds::-webkit-scrollbar {
    display: none;
  }
  .mv-kind {
    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    min-width: 72px;
    padding: 8px 8px 7px;
    border: 1.5px solid var(--lp-line);
    border-radius: 16px;
    background: var(--lp-paper);
    color: var(--lp-ink);
    font-size: 0.78rem;
    font-weight: 600;
    white-space: nowrap;
  }
  .mv-kind.selected {
    border-color: var(--lp-ink);
    box-shadow: inset 0 0 0 1.5px var(--lp-ink);
  }
  .mv-card-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-top: 10px;
  }
  .mv-card :global(.lp-btn) {
    min-height: 3rem;
    padding-inline: 1rem;
    font-size: 0.98rem;
  }
  .mv-card :global(.lp-btn:disabled) {
    opacity: 0.45;
  }

  .mv-pin-card {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 4px 12px;
  }
  .mv-pin-card h2 {
    font-size: 1.25rem;
    font-weight: 800;
    line-height: 1.1;
  }
  .mv-pin-card p {
    margin-top: 2px;
    font-size: 0.88rem;
    color: var(--lp-ink-soft);
  }
  .mv-remove {
    display: inline-flex;
    grid-column: 1 / -1;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 48px;
    margin-top: 8px;
    border: 1.5px solid color-mix(in srgb, var(--lp-rust) 55%, transparent);
    border-radius: 99px;
    color: var(--lp-rust);
    font-weight: 700;
  }
  .mv-icon-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    color: var(--lp-ink-soft);
  }
  .mv-icon-button:hover {
    background: var(--lp-paper-2);
  }

  .mv-intro {
    top: calc(var(--mv-top) + 100px);
    bottom: auto;
    display: grid;
    gap: 8px;
  }
  .mv.wide .mv-intro {
    top: var(--mv-top);
  }
  .mv-intro-text {
    font-size: 0.98rem;
    line-height: 1.45;
    text-wrap: pretty;
  }
  .mv-intro :global(.lp-btn) {
    justify-self: start;
    min-height: 2.75rem;
  }

  /* ── Panel: sheet on a phone ── */
  .mv-scrim {
    position: absolute;
    inset: 0;
    z-index: 19;
    background: rgba(13, 22, 17, 0.35);
  }
  .mv-panel {
    position: absolute;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 20;
    display: flex;
    flex-direction: column;
    gap: 16px;
    max-height: 86dvh;
    padding: 14px max(16px, env(safe-area-inset-left))
      max(16px, env(safe-area-inset-bottom));
    overflow-y: auto;
    border-radius: 24px 24px 0 0;
    background: var(--lp-card);
    box-shadow: 0 -18px 50px -20px rgba(10, 25, 15, 0.7);
    overscroll-behavior: contain;
    scrollbar-width: thin;
    animation: mv-rise 0.26s cubic-bezier(0.2, 0.7, 0.2, 1);
  }
  @keyframes mv-rise {
    from {
      transform: translateY(40px);
      opacity: 0;
    }
  }
  .mv-panel.crew-first .mv-crew-block {
    order: -1;
  }
  .mv-panel.crew-first .mv-panel-head {
    order: -2;
  }
  /* …and a rail beside the map on a cab tablet. */
  .mv.wide .mv-panel {
    gap: 12px;
    top: var(--mv-top);
    right: auto;
    bottom: var(--mv-bottom);
    left: var(--mv-gap);
    width: calc(var(--mv-rail) - 12px);
    max-height: none;
    padding: 14px;
    border-radius: 24px;
    box-shadow:
      0 0 0 1px var(--lp-line),
      0 20px 44px -20px rgba(10, 25, 15, 0.75);
    animation: none;
  }

  .mv-panel-head {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .mv-panel-head .mark {
    display: flex;
    width: 30px;
    height: 30px;
    border-radius: 9px;
    background: var(--lp-yellow);
  }
  .mv-panel-head .word {
    margin-right: auto;
    font-family: "Archivo", "Montserrat", ui-sans-serif, system-ui, sans-serif;
    font-size: 1.1rem;
    font-weight: 900;
  }
  .mv-panel .mv-status {
    min-height: 30px;
    padding: 0 11px 0 9px;
    font-size: 10px;
    box-shadow: none;
  }

  .mv-you {
    display: grid;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 18px;
    background: var(--lp-paper);
    box-shadow: 0 0 0 1px var(--lp-line);
  }
  .mv-you-top {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .mv-you-top .art {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 56px;
    height: 56px;
    border-radius: 14px;
    background: #cdbd92;
  }
  .mv-you-top .who {
    display: grid;
    flex: 1;
    min-width: 0;
  }
  .mv-you-top .who strong {
    overflow: hidden;
    font-family: var(--lp-display);
    font-size: 1.35rem;
    font-weight: 800;
    letter-spacing: -0.02em;
    line-height: 1.1;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mv-you-top .who span {
    font-family: var(--lp-mono);
    font-size: 0.72rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--lp-ink-soft);
  }
  .mv-text-button {
    min-height: 44px;
    padding: 0 8px;
    font-size: 0.9rem;
    font-weight: 700;
    color: var(--lp-ink);
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .mv-figures {
    display: flex;
    gap: 6px;
  }
  .mv-figures div {
    display: grid;
    flex: 1;
    padding: 8px 10px;
    border-radius: 12px;
    background: var(--lp-card);
    box-shadow: 0 0 0 1px var(--lp-line);
  }
  .mv-figures b {
    font-family: var(--lp-display);
    font-size: 2rem;
    font-weight: 800;
    letter-spacing: -0.03em;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .mv-figures span {
    font-family: var(--lp-mono);
    font-size: 0.62rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--lp-ink-faint);
  }
  .mv-where {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 2px 10px;
    font-size: 0.92rem;
    font-weight: 600;
  }
  .mv-where span {
    font-family: var(--lp-mono);
    font-size: 0.72rem;
    font-weight: 400;
    letter-spacing: 0.04em;
    color: var(--lp-ink-faint);
  }
  .mv-you-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0 14px;
  }
  .mv-you-actions :global(.lp-btn) {
    flex: 1 0 100%;
    margin-bottom: 4px;
  }
  .mv-you-actions .mv-text-button {
    min-height: 40px;
    padding: 0;
  }
  .mv-you-actions :global(.lp-btn) {
    min-height: 2.9rem;
    padding: 0.5rem 1.1rem;
    font-size: 0.95rem;
  }

  .mv-crew-block {
    display: grid;
    gap: 8px;
  }
  .mv-section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .mv-example {
    padding: 3px 8px;
    border: 1px dashed var(--lp-ink-faint);
    border-radius: 99px;
    font-family: var(--lp-mono);
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--lp-ink-soft);
  }

  .mv-panel-foot {
    display: grid;
    gap: 8px;
    justify-items: start;
    margin-top: auto;
    font-size: 0.78rem;
    line-height: 1.4;
    color: var(--lp-ink-faint);
  }
  .mv-panel-foot .credit a {
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .mv-status.live .dot,
    .mv-panel {
      animation: none;
    }
  }
</style>
