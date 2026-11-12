<script lang="ts">
  /**
   * DESIGN PROTOTYPE — a from-scratch take on onboarding. Nothing here is
   * saved or wired to an account; it exists to try the flow and the feel.
   *
   * The idea: set-up happens ON the map. One question per screen, and every
   * answer visibly changes the farm on the right, so people learn tracking,
   * coverage trails and pins by causing them rather than reading about them.
   *
   * Two paths instead of three roles:
   *   start a map:  job → farm → machine → paddocks → pin → crew → go live
   *   join a map:   code → you → pin → go live
   */
  import { fly } from "svelte/transition"
  import {
    ArrowLeft,
    ArrowRight,
    Check,
    Copy,
    Eye,
    Mail,
    MapPinned,
    Upload,
    Users,
  } from "lucide-svelte"
  import vehicles from "$lib/vehicles"
  import Stage from "./Stage.svelte"
  import MapPinIcon from "./PinIcon.svelte"
  import StoreBadges from "../landing/StoreBadges.svelte"
  import {
    COLOURS,
    MACHINES,
    PIN_KINDS,
    SEASONS,
    machineById,
    type DroppedPin,
    type MachineId,
    type Season,
  } from "./machines"

  type Mode = "start" | "join"
  type StepId =
    | "season"
    | "farm"
    | "machine"
    | "paddocks"
    | "pin"
    | "crew"
    | "code"
    | "you"
    | "live"

  const PATHS: Record<Mode, StepId[]> = {
    start: ["season", "farm", "machine", "paddocks", "pin", "crew", "live"],
    join: ["code", "you", "pin", "live"],
  }
  const EXAMPLE_CODE = "4827"
  const JOINED_FARM = "Example Farm"

  // ── Answers ──
  let mode: Mode | null = null
  let index = 0
  let season: Season | null = null
  let farmName = ""
  let userName = ""
  let machineId: MachineId | null = null
  let colour = COLOURS[0].value
  let watching = false
  let paddockChoice: "upload" | "email" | "skip" | null = null
  let pins: DroppedPin[] = []
  let pinKind: DroppedPin["kind"] = "rock"
  let invited = false
  let locationOn = false
  let code = ["", "", "", ""]
  let codeInputs: HTMLInputElement[] = []
  let direction = 1

  $: steps = mode ? PATHS[mode] : []
  $: done = mode !== null && index >= steps.length
  $: stepId = mode && !done ? steps[index] : null
  $: codeComplete = code.every((d) => d !== "")
  $: firstName = userName.trim().split(/\s+/)[0] ?? ""
  $: machine = machineId && !watching ? machineById(machineId) : null

  // ── What the map shows ──
  $: stageFarm = mode === "join" ? (codeComplete ? JOINED_FARM : "") : farmName
  $: stageBoundaries =
    mode === "join" ? codeComplete : paddockChoice === "upload"
  $: stageCrew =
    mode === "join"
      ? codeComplete
        ? ("real" as const)
        : ("none" as const)
      : stepId === "crew" || stepId === "live" || done
        ? ("ghost" as const)
        : ("none" as const)

  // ── The one-line lesson under the map ──
  $: lesson = (() => {
    if (!mode) return "This is your farm. Every answer changes it."
    if (done) return "You're on the map. So is everything you just set up."
    switch (stepId) {
      case "season":
        return "The map sets itself up for the job you're on."
      case "farm":
        return "Your crew sees this name when they join."
      case "code":
        return codeComplete
          ? "That's the farm, with the crew who are already on it."
          : "Your code connects you to your farm's map."
      case "machine":
      case "you":
        if (!machine) return "Pick a machine and watch it go to work."
        return machine.field
          ? "That coloured strip is your coverage trail. Everyone sees it fill in, live."
          : "Utes, trucks and chasers show up live. They just don't paint coverage."
      case "paddocks":
        return stageBoundaries
          ? "Named paddocks: now “I'm in Creek” means the same thing to everyone."
          : "No boundaries yet. Tracking, trails and pins still work without them."
      case "pin":
        return pins.length
          ? "Dropped. Every operator on the map sees that pin straight away."
          : "Pins are how a crew warns each other: rocks, stumps, gates, bins."
      case "crew":
        return "The faded machines are where your crew will appear once they join."
      case "live":
        return locationOn
          ? "Tracking's on. Your trail keeps recording with the screen off."
          : "Background tracking keeps your trail going while the phone's in your pocket."
      default:
        return ""
    }
  })()

  // ── Moving through it ──
  $: canContinue = (() => {
    switch (stepId) {
      case "season":
        return season !== null
      case "farm":
        return farmName.trim().length > 0
      case "machine":
        return machineId !== null
      case "paddocks":
        return paddockChoice !== null
      case "code":
        return codeComplete
      case "you":
        return userName.trim().length > 0 && (watching || machineId !== null)
      default:
        return true
    }
  })()

  $: nextLabel = (() => {
    if (stepId === "pin" && pins.length === 0) return "Skip for now"
    if (stepId === "crew" && !invited) return "I'll invite them later"
    if (stepId === "live") return locationOn ? "Finish" : "Finish without it"
    return "Continue"
  })()

  function choosePath(next: Mode) {
    direction = 1
    mode = next
    index = 0
  }

  function next() {
    if (!canContinue) return
    direction = 1
    // Arriving at the machine step: suggest the one that suits the job.
    const upcoming = steps[index + 1]
    if (
      (upcoming === "machine" || upcoming === "you") &&
      machineId === null &&
      season
    ) {
      machineId = SEASONS.find((s) => s.id === season)?.machine ?? null
    }
    index += 1
  }

  function back() {
    direction = -1
    if (index === 0) mode = null
    else index -= 1
  }

  function pickSeason(id: Season) {
    season = id
    setTimeout(next, 220)
  }

  function restart() {
    mode = null
    index = 0
    season = null
    farmName = ""
    userName = ""
    machineId = null
    watching = false
    paddockChoice = null
    pins = []
    invited = false
    locationOn = false
    code = ["", "", "", ""]
  }

  function onCodeInput(i: number, event: Event) {
    const input = event.currentTarget as HTMLInputElement
    const digit = input.value.replace(/\D/g, "").slice(-1)
    code[i] = digit
    input.value = digit
    if (digit && i < 3) codeInputs[i + 1]?.focus()
  }

  function onCodeKey(i: number, event: KeyboardEvent) {
    if (event.key === "Backspace" && !code[i] && i > 0)
      codeInputs[i - 1]?.focus()
    if (event.key === "Enter") next()
  }

  async function copyInvite() {
    invited = true
    try {
      await navigator.clipboard.writeText(
        `https://www.skanfarming.com.au/p/${EXAMPLE_CODE}`,
      )
    } catch {
      // Clipboard can be blocked; the prototype carries on regardless.
    }
  }

  const flyIn = (node: Element) => {
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches
    return fly(node, {
      x: reduced ? 0 : 28 * direction,
      duration: reduced ? 0 : 320,
      opacity: 0,
    })
  }
</script>

<svelte:head>
  <title>Get set up — AgSKAN (design prototype)</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="ob">
  <header class="top">
    <a href="/" class="brand" aria-label="AgSKAN home">
      <span class="mark"
        ><img src="/images/logo.svg" alt="" width="34" height="34" /></span
      >
      <span class="word">AgSKAN</span>
    </a>

    {#if mode && !done}
      <div
        class="progress"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={steps.length}
        aria-valuenow={index + 1}
        aria-label="Set-up progress"
      >
        {#each steps as _, i}
          <span class="seg" class:filled={i <= index}></span>
        {/each}
      </div>
      <span class="count">{index + 1} / {steps.length}</span>
    {:else}
      <span class="proto">Design prototype · nothing is saved</span>
    {/if}
  </header>

  <div class="body">
    <!-- The map everything happens on -->
    <aside class="stage-col">
      <div class="tablet">
        <Stage
          farmName={stageFarm}
          {season}
          {machine}
          {colour}
          boundaries={stageBoundaries}
          {pins}
          pinMode={stepId === "pin"}
          crew={stageCrew}
          live={done || locationOn}
          on:drop={(e) => (pins = [...pins, { ...e.detail, kind: pinKind }])}
        />
      </div>
      <p class="lesson" aria-live="polite">{lesson}</p>
    </aside>

    <!-- The question -->
    <main class="panel">
      {#key `${mode}-${stepId}-${done}`}
        <div class="step" in:flyIn>
          {#if !mode}
            <p class="lp-eyebrow">Welcome to AgSKAN</p>
            <h1>Let's get you on the map.</h1>
            <p class="sub">
              Two minutes, one question at a time. You can change any of it
              later.
            </p>

            <div class="choices">
              <button
                type="button"
                class="choice big"
                on:click={() => choosePath("start")}
              >
                <span class="choice-icon"><MapPinned size={22} /></span>
                <span class="choice-text">
                  <strong>Start my farm's map</strong>
                  <span
                    >I run the place, or I'm setting it up for the crew.</span
                  >
                </span>
                <ArrowRight size={18} />
              </button>
              <button
                type="button"
                class="choice big"
                on:click={() => choosePath("join")}
              >
                <span class="choice-icon"><Users size={22} /></span>
                <span class="choice-text">
                  <strong>Join a map</strong>
                  <span>Someone's sent me a code or a link.</span>
                </span>
                <ArrowRight size={18} />
              </button>
            </div>
          {:else if done}
            <p class="lp-eyebrow">All set</p>
            <h1>
              {mode === "join" ? "You're on the map" : "You're live"}{firstName
                ? `, ${firstName}`
                : ""}.
            </h1>
            <p class="sub">
              {mode === "join"
                ? `You've joined ${JOINED_FARM}. Head to the map and get to work.`
                : "Your farm's map is running. Here's where everything landed."}
            </p>

            <ul class="summary">
              {#if mode === "start"}
                <li class="ok">
                  <Check size={15} strokeWidth={3} />
                  {farmName.trim() || "Your farm"} is named
                </li>
              {/if}
              <li class="ok">
                <Check size={15} strokeWidth={3} />
                {watching
                  ? "Watching only, no machine"
                  : machine
                    ? `You're in the ${machine.label.toLowerCase()}`
                    : "On the map"}
              </li>
              {#if mode === "start"}
                <li class:ok={paddockChoice === "upload"}>
                  {#if paddockChoice === "upload"}<Check
                      size={15}
                      strokeWidth={3}
                    />{:else}<span class="later"></span>{/if}
                  {paddockChoice === "upload"
                    ? "Paddocks added"
                    : paddockChoice === "email"
                      ? "Paddocks: we'll load them when you send the files"
                      : "Paddocks: add them any time"}
                </li>
              {/if}
              <li class:ok={pins.length > 0}>
                {#if pins.length}<Check size={15} strokeWidth={3} />{:else}<span
                    class="later"
                  ></span>{/if}
                {pins.length
                  ? `${pins.length} pin${pins.length > 1 ? "s" : ""} dropped`
                  : "No pins yet"}
              </li>
              {#if mode === "start"}
                <li class:ok={invited}>
                  {#if invited}<Check size={15} strokeWidth={3} />{:else}<span
                      class="later"
                    ></span>{/if}
                  {invited
                    ? "Invite link copied for the crew"
                    : "Crew: invite them from the map"}
                </li>
              {/if}
              <li class:ok={locationOn}>
                {#if locationOn}<Check size={15} strokeWidth={3} />{:else}<span
                    class="later"
                  ></span>{/if}
                {locationOn
                  ? "Background tracking on"
                  : "Background tracking off"}
              </li>
            </ul>

            <a href="/account/mapviewer" class="lp-btn lp-btn-primary wide">
              Open my map
              <span class="lp-arrow"><ArrowRight size={18} /></span>
            </a>

            <div class="after">
              <p class="lp-eyebrow">Take it with you</p>
              <StoreBadges />
              <p class="tip">
                Running it in the cab? A mounted tablet is the best seat in the
                house.
                <a href="/knowledge-base#video-hardware"
                  >See what we recommend</a
                >.
              </p>
            </div>

            <button type="button" class="text-link" on:click={restart}
              >Run the prototype again</button
            >
          {:else if stepId === "season"}
            <p class="lp-eyebrow">The job</p>
            <h1>What's on at the moment?</h1>
            <p class="sub">We'll set the map up for it.</p>
            <div class="choices">
              {#each SEASONS as option}
                <button
                  type="button"
                  class="choice"
                  class:selected={season === option.id}
                  on:click={() => pickSeason(option.id)}
                >
                  <span class="choice-text">
                    <strong>{option.label}</strong>
                    <span>{option.note}</span>
                  </span>
                  <ArrowRight size={16} />
                </button>
              {/each}
            </div>
          {:else if stepId === "farm"}
            <p class="lp-eyebrow">Your farm</p>
            <h1>What do we call the place?</h1>
            <p class="sub">Watch the map: it takes the name as you type.</p>
            <label class="field">
              <span>Farm name</span>
              <!-- svelte-ignore a11y-autofocus -->
              <input
                type="text"
                bind:value={farmName}
                placeholder="e.g. Glenrowan"
                autocomplete="organization"
                autofocus
                on:keydown={(e) => e.key === "Enter" && next()}
              />
            </label>
            <label class="field">
              <span>Your name <em>optional</em></span>
              <input
                type="text"
                bind:value={userName}
                placeholder="What the crew calls you"
                autocomplete="name"
                on:keydown={(e) => e.key === "Enter" && next()}
              />
            </label>
          {:else if stepId === "code"}
            <p class="lp-eyebrow">Join a map</p>
            <h1>Got your code?</h1>
            <p class="sub">
              Four digits from whoever runs the map. Opened an invite link
              instead? You'd skip this screen.
            </p>
            <div class="code" role="group" aria-label="Four digit map code">
              {#each code as digit, i}
                <!-- svelte-ignore a11y-autofocus -->
                <input
                  bind:this={codeInputs[i]}
                  value={digit}
                  inputmode="numeric"
                  maxlength="1"
                  autocomplete="off"
                  aria-label="Digit {i + 1}"
                  autofocus={i === 0}
                  on:input={(e) => onCodeInput(i, e)}
                  on:keydown={(e) => onCodeKey(i, e)}
                />
              {/each}
            </div>
            {#if codeComplete}
              <p class="found">
                <Check size={16} strokeWidth={3} /> Found it:
                <strong>{JOINED_FARM}</strong>
              </p>
            {/if}
            <p class="hint">Prototype: any four digits work.</p>
          {:else if stepId === "machine" || stepId === "you"}
            <p class="lp-eyebrow">
              {stepId === "you" ? "You" : "Your machine"}
            </p>
            <h1>
              {stepId === "you"
                ? "Who's joining, and in what?"
                : "What are you in today?"}
            </h1>
            <p class="sub">
              Pick one and watch it go to work. You can swap machines from the
              map any time.
            </p>

            {#if stepId === "you"}
              <label class="field">
                <span>Your name</span>
                <input
                  type="text"
                  bind:value={userName}
                  placeholder="What the crew calls you"
                  autocomplete="name"
                />
              </label>
            {/if}

            <div class="machines" class:dim={watching}>
              {#each MACHINES as option}
                <button
                  type="button"
                  class="machine"
                  class:selected={machineId === option.id && !watching}
                  disabled={watching}
                  aria-pressed={machineId === option.id && !watching}
                  on:click={() => (machineId = option.id)}
                >
                  <span class="art">
                    <svelte:component
                      this={vehicles[option.name]}
                      size="54px"
                      bodyColor={machineId === option.id ? colour : "#9AA39B"}
                      outlineColor="#ffffff"
                      wheelColor="#15261C"
                      loadColor="#F7DB5C"
                    />
                  </span>
                  {option.label}
                </button>
              {/each}
            </div>

            <div class="colours" class:dim={watching}>
              <span class="lp-eyebrow">Colour</span>
              <div class="swatches">
                {#each COLOURS as option}
                  <button
                    type="button"
                    class="swatch"
                    class:selected={colour === option.value}
                    style="--swatch: {option.value}"
                    disabled={watching}
                    aria-label={option.name}
                    aria-pressed={colour === option.value}
                    on:click={() => (colour = option.value)}
                  ></button>
                {/each}
              </div>
            </div>

            {#if stepId === "you"}
              <label class="check">
                <input type="checkbox" bind:checked={watching} />
                <Eye size={16} />
                I'm just watching, not driving
              </label>
            {/if}
          {:else if stepId === "paddocks"}
            <p class="lp-eyebrow">Paddocks</p>
            <h1>Add your paddocks.</h1>
            <p class="sub">
              They're probably already sitting in John Deere Ops Center, Agworld
              or your GPS screen.
            </p>
            <div class="choices">
              <button
                type="button"
                class="choice"
                class:selected={paddockChoice === "upload"}
                on:click={() => (paddockChoice = "upload")}
              >
                <span class="choice-icon"><Upload size={20} /></span>
                <span class="choice-text">
                  <strong>Upload boundary files</strong>
                  <span>Takes a couple of minutes if you have them handy.</span>
                </span>
              </button>
              <button
                type="button"
                class="choice"
                class:selected={paddockChoice === "email"}
                on:click={() => (paddockChoice = "email")}
              >
                <span class="choice-icon"><Mail size={20} /></span>
                <span class="choice-text">
                  <strong>Send them to us</strong>
                  <span>Email the files and we'll load them for you.</span>
                </span>
              </button>
              <button
                type="button"
                class="choice"
                class:selected={paddockChoice === "skip"}
                on:click={() => (paddockChoice = "skip")}
              >
                <span class="choice-icon"><ArrowRight size={20} /></span>
                <span class="choice-text">
                  <strong>Not now</strong>
                  <span>Everything else works without them.</span>
                </span>
              </button>
            </div>
            {#if paddockChoice === "upload"}
              <p class="found">
                <Check size={16} strokeWidth={3} /> 6 paddocks added
              </p>
              <p class="hint">Prototype: this stands in for picking a file.</p>
            {/if}
          {:else if stepId === "pin"}
            <p class="lp-eyebrow">Try it</p>
            <h1>Mark something the crew should know about.</h1>
            <p class="sub">Choose what it is, then tap anywhere on the map.</p>
            <div class="pin-kinds">
              {#each PIN_KINDS as option}
                <button
                  type="button"
                  class="pin-kind"
                  class:selected={pinKind === option.kind}
                  aria-pressed={pinKind === option.kind}
                  on:click={() => (pinKind = option.kind)}
                >
                  <MapPinIcon kind={option.kind} />
                  {option.label}
                </button>
              {/each}
            </div>
            {#if pins.length}
              <p class="found">
                <Check size={16} strokeWidth={3} />
                {pins.length} pin{pins.length > 1 ? "s" : ""} on the map. That's
                all there is to it.
              </p>
            {/if}
          {:else if stepId === "crew"}
            <p class="lp-eyebrow">The crew</p>
            <h1>Bring the crew in.</h1>
            <p class="sub">
              They open the link, pick their machine, and they're on your map.
              No accounts to set up for them.
            </p>
            <div class="invite">
              <div
                class="digits"
                aria-label="Your map code is {EXAMPLE_CODE.split('').join(' ')}"
              >
                {#each EXAMPLE_CODE.split("") as digit}<span>{digit}</span
                  >{/each}
              </div>
              <p class="invite-note">
                Your map code. Read it out over the radio one last time.
              </p>
              <button
                type="button"
                class="lp-btn lp-btn-ghost wide"
                on:click={copyInvite}
              >
                {#if invited}<Check size={17} strokeWidth={3} /> Link copied{:else}<Copy
                    size={17}
                  /> Copy invite link{/if}
              </button>
            </div>
            <p class="hint">
              Adding crew is part of AgSKAN Pro. Your first month is free.
            </p>
          {:else if stepId === "live"}
            <p class="lp-eyebrow">Last thing</p>
            <h1>Let it run in the background.</h1>
            <p class="sub">
              AgSKAN keeps recording your trail with the screen off and the
              phone in your pocket. When your phone asks, choose “Always allow”.
            </p>
            <div class="dialog" class:granted={locationOn}>
              <p class="dialog-title">Allow AgSKAN to use your location?</p>
              <button
                type="button"
                class="dialog-option primary"
                on:click={() => (locationOn = true)}
              >
                {#if locationOn}<Check size={16} strokeWidth={3} />{/if}
                Always allow
              </button>
              <span class="dialog-option muted">Only while using the app</span>
              <span class="dialog-option muted">Don't allow</span>
            </div>
            <p class="hint">
              Prototype: this stands in for your phone's own prompt.
            </p>
          {/if}
        </div>
      {/key}

      {#if mode && !done}
        <footer class="nav">
          <button type="button" class="back" on:click={back}>
            <ArrowLeft size={17} />
            Back
          </button>
          {#if stepId !== "season"}
            <button
              type="button"
              class="lp-btn lp-btn-primary"
              disabled={!canContinue}
              on:click={next}
            >
              {nextLabel}
              <span class="lp-arrow"><ArrowRight size={18} /></span>
            </button>
          {/if}
        </footer>
      {/if}
    </main>
  </div>
</div>

<style>
  .ob {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 100dvh;
    background: var(--lp-paper);
    color: var(--lp-ink);
  }

  /* ── Top bar ── */
  .top {
    display: flex;
    align-items: center;
    gap: 1rem;
    height: 3.75rem;
    padding-inline: max(4vw, 1rem);
  }
  .brand {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    gap: 0.5rem;
  }
  .mark {
    display: flex;
    width: 2.1rem;
    height: 2.1rem;
    border-radius: 0.6rem;
    background: var(--lp-yellow);
  }
  .word {
    display: none;
    font-family: "Archivo", "Montserrat", ui-sans-serif, system-ui, sans-serif;
    font-size: 1.25rem;
    font-weight: 900;
  }
  .progress {
    display: flex;
    flex: 1;
    gap: 5px;
    max-width: 22rem;
    margin-inline: auto;
  }
  .seg {
    flex: 1;
    height: 5px;
    border-radius: 99px;
    background: var(--lp-line);
    transition: background-color 0.3s ease;
  }
  .seg.filled {
    background: var(--lp-ink);
  }
  .count,
  .proto {
    font-family: var(--lp-mono);
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    color: var(--lp-ink-faint);
  }
  .proto {
    margin-left: auto;
  }

  /* ── Layout: map on top (mobile), map beside (desktop) ── */
  .body {
    display: flex;
    flex: 1;
    flex-direction: column;
  }
  .stage-col {
    padding: 0 max(4vw, 1rem);
  }
  .tablet {
    overflow: hidden;
    height: min(34dvh, 300px);
    border: 7px solid #12201a;
    border-radius: 1.4rem;
    background: #12201a;
    box-shadow: 0 24px 44px -26px rgba(10, 25, 15, 0.6);
  }
  .tablet :global(.stage) {
    border-radius: 0.95rem;
  }
  .lesson {
    min-height: 2.9em;
    margin-top: 0.7rem;
    font-size: 0.9rem;
    line-height: 1.45;
    color: var(--lp-ink-soft);
    text-wrap: pretty;
  }
  .panel {
    display: flex;
    flex: 1;
    flex-direction: column;
    padding: 0.75rem max(4vw, 1rem) 0;
  }
  .step {
    flex: 1;
    width: 100%;
    max-width: 30rem;
    margin-inline: auto;
    padding-bottom: 1.5rem;
  }

  @media (min-width: 960px) {
    .word {
      display: inline;
    }
    .body {
      flex-direction: row-reverse;
      align-items: stretch;
      gap: clamp(2rem, 4vw, 4rem);
      padding: 1rem max(4vw, 1rem) 2rem;
    }
    .stage-col {
      display: flex;
      flex: 1.15;
      flex-direction: column;
      justify-content: center;
      padding: 0;
    }
    .tablet {
      height: auto;
      aspect-ratio: 4 / 3;
      max-height: 70dvh;
      border-width: 12px;
      border-radius: 1.8rem;
    }
    .lesson {
      margin-top: 1.1rem;
      font-size: 1.05rem;
      text-align: center;
    }
    .panel {
      flex: 1;
      justify-content: center;
      padding: 0;
    }
    .step {
      flex: 0 1 auto;
    }
  }

  /* ── Step content ── */
  h1 {
    margin-top: 0.7rem;
    font-size: clamp(1.9rem, 5.2vw, 3rem);
    font-weight: 800;
    line-height: 1.02;
    text-wrap: balance;
  }
  .sub {
    margin-top: 0.8rem;
    font-size: 1.02rem;
    line-height: 1.5;
    color: var(--lp-ink-soft);
    text-wrap: pretty;
  }
  .hint {
    margin-top: 0.9rem;
    font-size: 0.82rem;
    color: var(--lp-ink-faint);
  }
  .found {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 1.1rem;
    font-weight: 600;
    color: var(--lp-accent-text);
  }

  .choices {
    display: grid;
    gap: 0.6rem;
    margin-top: 1.5rem;
  }
  .choice {
    display: flex;
    align-items: center;
    gap: 0.9rem;
    width: 100%;
    min-height: 4rem;
    padding: 0.8rem 1rem;
    border: 1.5px solid var(--lp-line);
    border-radius: 1rem;
    background: var(--lp-card);
    text-align: left;
    transition:
      border-color 0.2s ease,
      transform 0.2s ease;
  }
  .choice.big {
    min-height: 5.25rem;
  }
  .choice:hover {
    border-color: var(--lp-ink);
    transform: translateY(-1px);
  }
  .choice.selected {
    border-color: var(--lp-ink);
    box-shadow: inset 0 0 0 1.5px var(--lp-ink);
  }
  .choice-icon {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 2.6rem;
    height: 2.6rem;
    border-radius: 0.8rem;
    background: var(--lp-yellow);
    color: #15261c;
  }
  .choice-text {
    display: grid;
    flex: 1;
    gap: 0.15rem;
  }
  .choice-text strong {
    font-size: 1.05rem;
    font-weight: 700;
  }
  .choice-text span {
    font-size: 0.9rem;
    line-height: 1.35;
    color: var(--lp-ink-soft);
  }

  .field {
    display: grid;
    gap: 0.4rem;
    margin-top: 1.25rem;
    font-size: 0.9rem;
    font-weight: 600;
  }
  .field em {
    font-style: normal;
    font-weight: 400;
    color: var(--lp-ink-faint);
  }
  .field input {
    width: 100%;
    min-height: 3.25rem;
    padding: 0 1rem;
    border: 1.5px solid var(--lp-line);
    border-radius: 0.8rem;
    background: var(--lp-card);
    font-size: 1.05rem;
    color: var(--lp-ink);
  }
  .field input::placeholder {
    color: var(--lp-ink-faint);
  }
  .field input:focus,
  .code input:focus {
    border-color: var(--lp-ink);
    outline: none;
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--lp-yellow) 60%, transparent);
  }

  .code {
    display: flex;
    gap: 0.6rem;
    margin-top: 1.5rem;
  }
  .code input {
    width: 3.6rem;
    height: 4.4rem;
    border: 1.5px solid var(--lp-line);
    border-radius: 0.9rem;
    background: var(--lp-card);
    font-family: var(--lp-display);
    font-size: 2rem;
    font-weight: 800;
    text-align: center;
    color: var(--lp-ink);
  }

  .machines {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.5rem;
    margin-top: 1.4rem;
  }
  .machine {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 0.6rem 0.25rem 0.7rem;
    border: 1.5px solid var(--lp-line);
    border-radius: 1rem;
    background: var(--lp-card);
    font-size: 0.86rem;
    font-weight: 600;
    transition: border-color 0.2s ease;
  }
  .machine:hover:not(:disabled) {
    border-color: var(--lp-ink);
  }
  .machine.selected {
    border-color: var(--lp-ink);
    box-shadow: inset 0 0 0 1.5px var(--lp-ink);
  }
  .art {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 58px;
  }
  .colours {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-top: 1.1rem;
  }
  .swatches {
    display: flex;
    gap: 0.5rem;
  }
  .swatch {
    width: 2.4rem;
    height: 2.4rem;
    border: 3px solid var(--lp-paper);
    border-radius: 50%;
    background: var(--swatch);
    box-shadow: 0 0 0 1.5px var(--lp-line);
  }
  .swatch.selected {
    box-shadow: 0 0 0 2.5px var(--lp-ink);
  }
  .dim {
    opacity: 0.4;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    min-height: 2.75rem;
    margin-top: 1rem;
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
  }
  .check input {
    width: 1.2rem;
    height: 1.2rem;
    accent-color: #15261c;
  }

  .pin-kinds {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 1.4rem;
  }
  .pin-kind {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 3rem;
    padding: 0.3rem 1rem 0.3rem 0.4rem;
    border: 1.5px solid var(--lp-line);
    border-radius: 999px;
    background: var(--lp-card);
    font-size: 0.95rem;
    font-weight: 600;
  }
  .pin-kind.selected {
    border-color: var(--lp-ink);
    box-shadow: inset 0 0 0 1.5px var(--lp-ink);
  }

  .invite {
    margin-top: 1.5rem;
    padding: 1.25rem;
    border: 1.5px solid var(--lp-line);
    border-radius: 1.2rem;
    background: var(--lp-card);
    text-align: center;
  }
  .digits {
    display: flex;
    justify-content: center;
    gap: 0.5rem;
  }
  .digits span {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 3.2rem;
    height: 4rem;
    border-radius: 0.8rem;
    background: #15261c;
    color: #f7db5c;
    font-family: var(--lp-display);
    font-size: 2rem;
    font-weight: 800;
  }
  .invite-note {
    margin: 0.8rem 0 1rem;
    font-size: 0.9rem;
    color: var(--lp-ink-soft);
  }

  .dialog {
    display: grid;
    gap: 0.4rem;
    max-width: 19rem;
    margin-top: 1.5rem;
    padding: 1.1rem;
    border-radius: 1.2rem;
    background: var(--lp-card);
    box-shadow:
      0 0 0 1px var(--lp-line),
      0 22px 40px -24px rgba(10, 25, 15, 0.5);
  }
  .dialog-title {
    margin-bottom: 0.4rem;
    font-weight: 700;
    line-height: 1.3;
  }
  .dialog-option {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    min-height: 2.75rem;
    border-radius: 0.7rem;
    font-size: 0.95rem;
    font-weight: 600;
  }
  .dialog-option.primary {
    background: var(--lp-yellow);
    color: #15261c;
  }
  .dialog.granted .dialog-option.primary {
    background: #1f8a4c;
    color: #fff;
  }
  .dialog-option.muted {
    color: var(--lp-ink-faint);
  }

  .summary {
    display: grid;
    gap: 0.55rem;
    margin: 1.4rem 0 1.6rem;
  }
  .summary li {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    color: var(--lp-ink-faint);
  }
  .summary li.ok {
    font-weight: 600;
    color: var(--lp-ink);
  }
  .summary li.ok :global(svg) {
    color: var(--lp-accent-text);
  }
  .later {
    width: 15px;
    height: 2px;
    border-radius: 2px;
    background: var(--lp-line);
  }
  .after {
    display: grid;
    gap: 0.8rem;
    margin-top: 1.75rem;
    padding-top: 1.4rem;
    border-top: 1px solid var(--lp-line);
  }
  .tip {
    font-size: 0.9rem;
    line-height: 1.5;
    color: var(--lp-ink-soft);
  }
  .tip a,
  .text-link {
    font-weight: 600;
    color: var(--lp-ink);
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .text-link {
    margin-top: 1.4rem;
    font-size: 0.9rem;
  }
  .wide {
    width: 100%;
  }

  /* ── Bottom nav ── */
  .nav {
    position: sticky;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    width: 100%;
    max-width: 30rem;
    margin-inline: auto;
    padding: 0.75rem 0 max(0.9rem, env(safe-area-inset-bottom));
    background: linear-gradient(to top, var(--lp-paper) 70%, transparent);
  }
  .back {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    min-height: 3rem;
    padding: 0 0.5rem;
    font-weight: 600;
    color: var(--lp-ink-soft);
  }
  .back:hover {
    color: var(--lp-ink);
  }
  .nav :global(.lp-btn:disabled) {
    opacity: 0.4;
    box-shadow: none;
    transform: none;
  }

  button:focus-visible,
  a:focus-visible {
    outline: 2px solid var(--lp-accent-text);
    outline-offset: 2px;
  }
  @media (prefers-reduced-motion: reduce) {
    .choice,
    .seg,
    .machine {
      transition: none;
    }
  }
</style>
