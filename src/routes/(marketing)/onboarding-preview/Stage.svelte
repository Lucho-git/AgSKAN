<script lang="ts">
  /**
   * The onboarding "stage": a small farm map that changes with every answer,
   * so setup is something you watch happen rather than a form you fill in.
   *
   *  - naming the farm titles the map
   *  - choosing a machine puts it to work, painting a trail in your colour
   *  - adding paddocks draws the boundaries and names
   *  - in pin mode, tapping the map drops a pin where you tapped
   *  - crew show as ghosts until they've actually joined
   */
  import { createEventDispatcher } from "svelte"
  import MapVehicle from "../landing/MapVehicle.svelte"
  import MapPin from "../landing/MapPin.svelte"
  import { smilPlayback } from "../landing/motion"
  import type { DroppedPin, Machine, Season } from "./machines"

  export let farmName = ""
  export let season: Season | null = null
  /** Your machine, once chosen. Null shows a plain "you are here" dot. */
  export let machine: Machine | null = null
  export let colour = "#2F62D6"
  export let boundaries = false
  export let pins: DroppedPin[] = []
  /** Tapping the map drops a pin. */
  export let pinMode = false
  /** "ghost": where crew will appear. "real": crew already on this map. */
  export let crew: "none" | "ghost" | "real" = "none"
  export let live = false

  const dispatch = createEventDispatcher<{ drop: { x: number; y: number } }>()

  let svg: SVGSVGElement

  const INK = "#15261C"
  const SCRUB = "#3F6B4A"

  $: homeFill =
    season === "harvest"
      ? "#E0B94F"
      : season === "looking" || !season
        ? "#B9A15E"
        : "#C79A5B"

  $: paddocks = [
    {
      name: "Top",
      fill: "#D8B04A",
      points: "20,20 200,20 172,107 20,107",
      lx: 34,
      ly: 96,
    },
    {
      name: "Hill",
      fill: "#EDD352",
      points: "206,20 460,20 460,107 178,107",
      lx: 214,
      ly: 96,
    },
    {
      name: "Creek",
      fill: "#6E9B5C",
      points: "20,110 137,110 137,300 62,300 20,238",
      lx: 34,
      ly: 134,
    },
    {
      name: "Home",
      fill: homeFill,
      points: "140,110 322,110 322,300 140,300",
      lx: 276,
      ly: 134,
    },
    {
      name: "Dam",
      fill: "#9B5B36",
      points: "342,110 460,110 460,250 420,300 342,300",
      lx: 412,
      ly: 134,
    },
    { name: "", fill: SCRUB, points: "20,243 59,300 20,300", lx: 0, ly: 0 },
    { name: "", fill: SCRUB, points: "460,255 460,300 425,300", lx: 0, ly: 0 },
    {
      name: "Flats",
      fill: "#E3C766",
      points: "20,320 240,320 222,360 20,360",
      lx: 34,
      ly: 344,
    },
    {
      name: "",
      fill: "#6E9B5C",
      points: "246,320 460,320 460,360 228,360",
      lx: 0,
      ly: 0,
    },
  ]

  // Your machine: field machines work "Home" up and down; road vehicles come
  // along the lane and pull up at the gate, leaving no trail.
  const WORK = "M160,292 V124 H186 V292 H212 V124 H238 V292 H264 V190"
  const ROAD = "M-24,310 H332 V128"
  $: myPath = machine?.field ? WORK : ROAD
  $: myDur = machine?.field ? "20s" : "14s"
  $: myTimes = machine?.field ? "0;0.94;1" : "0;0.55;1"

  // Crew: a header working "Dam" and a sprayer in "Top".
  const CREW_HEADER = "M364,290 V124 H388 V290 H412 V190"
  const CREW_SPRAYER = "M36,38 H176 V64 H36 V90 H150"

  function onTap(event: MouseEvent) {
    if (!pinMode) return
    const point = svg.createSVGPoint()
    point.x = event.clientX
    point.y = event.clientY
    const ctm = svg.getScreenCTM()
    if (!ctm) return
    const { x, y } = point.matrixTransform(ctm.inverse())
    dispatch("drop", {
      x: Math.min(448, Math.max(32, x)),
      y: Math.min(340, Math.max(34, y)),
    })
  }
</script>

<div class="stage" class:pin-mode={pinMode}>
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-noninteractive-element-interactions -->
  <svg
    bind:this={svg}
    use:smilPlayback={8}
    viewBox="10 10 460 350"
    preserveAspectRatio="xMidYMid slice"
    role="img"
    aria-label="Your farm map, updating as you set it up"
    on:click={onTap}
  >
    <rect x="-40" y="-40" width="560" height="460" fill="#CDBD92" />

    {#each paddocks as p}
      <polygon points={p.points} fill={p.fill} />
    {/each}
    <ellipse cx="408" cy="232" rx="24" ry="13" fill="#8FB0C9" />
    {#each [[30, 262], [38, 284], [26, 292], [448, 282], [454, 294]] as [cx, cy]}
      <circle {cx} {cy} r="6" fill="#33573D" />
    {/each}

    <!-- Until paddocks are added the country is one washed-out blur -->
    <rect
      x="-40"
      y="-40"
      width="560"
      height="460"
      fill="#CDBD92"
      class="wash"
      class:off={boundaries}
    />

    <!-- Boundaries + names -->
    <g class="layer" class:on={boundaries}>
      {#each paddocks as p, i}
        <polygon
          points={p.points}
          class="fence"
          style="--i: {i}"
          pathLength="100"
        />
        {#if p.name}
          <text x={p.lx} y={p.ly} class="pad-name">{p.name}</text>
        {/if}
      {/each}
    </g>

    <!-- Crew -->
    <g class="layer" class:on={crew !== "none"} class:ghost={crew === "ghost"}>
      {#if crew === "real"}
        <path
          d={CREW_HEADER}
          class="trail"
          stroke="#D95D39"
          stroke-width="22"
          opacity="0.5"
          pathLength="100"
          stroke-dasharray="100"
          stroke-dashoffset="100"
        >
          <animate
            attributeName="stroke-dashoffset"
            values="100;0;0"
            keyTimes="0;0.94;1"
            dur="20s"
            repeatCount="indefinite"
          />
        </path>
        <path
          d={CREW_SPRAYER}
          class="trail"
          stroke="#7B4BC4"
          stroke-width="24"
          opacity="0.5"
          pathLength="100"
          stroke-dasharray="100"
          stroke-dashoffset="100"
        >
          <animate
            attributeName="stroke-dashoffset"
            values="100;0;0"
            keyTimes="0;0.94;1"
            dur="20s"
            repeatCount="indefinite"
          />
        </path>
      {/if}
      <g>
        <animateMotion
          path={CREW_HEADER}
          dur="20s"
          repeatCount="indefinite"
          calcMode="linear"
          rotate="auto"
          keyPoints="0;1;1"
          keyTimes="0;0.94;1"
        />
        <MapVehicle name="HeaderDuals" size={34} color="#D95D39" />
      </g>
      <g>
        <animateMotion
          path={CREW_SPRAYER}
          dur="20s"
          repeatCount="indefinite"
          calcMode="linear"
          rotate="auto"
          keyPoints="0;1;1"
          keyTimes="0;0.94;1"
        />
        <MapVehicle name="SelfPropelledBoomspray" size={34} color="#7B4BC4" />
      </g>
    </g>

    <!-- You -->
    {#key `${machine?.id}-${colour}`}
      {#if machine}
        {#if machine.field}
          <path
            d={WORK}
            class="trail"
            stroke={colour}
            stroke-width={machine.trail}
            opacity="0.62"
            pathLength="100"
            stroke-dasharray="100"
            stroke-dashoffset="100"
          >
            <animate
              attributeName="stroke-dashoffset"
              values="100;0;0"
              keyTimes={myTimes}
              dur={myDur}
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              values="0.62;0.62;0"
              keyTimes="0;0.96;1"
              dur={myDur}
              repeatCount="indefinite"
            />
          </path>
        {/if}
        <g>
          <animateMotion
            path={myPath}
            dur={myDur}
            repeatCount="indefinite"
            calcMode="linear"
            rotate="auto"
            keyPoints="0;1;1"
            keyTimes={myTimes}
          />
          <circle r={machine.size * 0.55} class="halo" fill={colour} />
          <MapVehicle name={machine.name} size={machine.size} color={colour} />
        </g>
        <g>
          <animateMotion
            path={myPath}
            dur={myDur}
            repeatCount="indefinite"
            calcMode="linear"
            keyPoints="0;1;1"
            keyTimes={myTimes}
          />
          <g
            transform="translate({machine.size * 0.4} {-machine.size * 0.5 -
              14})"
          >
            <rect width="30" height="15" rx="7.5" fill={INK} />
            <text x="15" y="10.5" text-anchor="middle" class="tag">You</text>
          </g>
        </g>
      {:else}
        <g transform="translate(231 205)">
          <circle r="11" class="halo" fill="#2F62D6" />
          <circle r="8" fill="#fff" />
          <circle r="5.2" fill="#2F62D6" />
          <g transform="translate(12 -22)">
            <rect width="30" height="15" rx="7.5" fill={INK} />
            <text x="15" y="10.5" text-anchor="middle" class="tag">You</text>
          </g>
        </g>
      {/if}
    {/key}

    <!-- Pins you've dropped -->
    {#each pins as pin (pin)}
      <g class="dropped">
        <MapPin kind={pin.kind} x={pin.x} y={pin.y} r={13} />
      </g>
      <circle cx={pin.x} cy={pin.y} r="13" class="ripple" />
    {/each}

    {#if pinMode && pins.length === 0}
      <g transform="translate(86 196)" class="hint">
        <circle r="16" class="hint-ring" />
        <circle r="5" fill="#fff" />
      </g>
    {/if}
  </svg>

  <div class="chip name" aria-hidden="true">
    <span class="dot" class:live></span>
    <span class="chip-text">{farmName.trim() || "Your farm"}</span>
  </div>
  <div class="chip state" class:live aria-hidden="true">
    {live ? "LIVE" : "SETTING UP"}
  </div>
  {#if pinMode}
    <div class="chip tap" aria-hidden="true">Tap the map to drop a pin</div>
  {/if}
</div>

<style>
  .stage {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #cdbd92;
    isolation: isolate;
  }
  svg {
    display: block;
    width: 100%;
    height: 100%;
  }
  .pin-mode svg {
    cursor: crosshair;
  }

  .wash {
    opacity: 0.42;
    transition: opacity 0.8s ease;
    pointer-events: none;
  }
  .wash.off {
    opacity: 0;
  }

  .layer {
    opacity: 0;
    transition: opacity 0.6s ease;
    pointer-events: none;
  }
  .layer.on {
    opacity: 1;
  }
  .layer.on.ghost {
    opacity: 0.4;
  }

  /* Fences draw themselves on, one paddock after another */
  .fence {
    fill: none;
    stroke: #fff;
    stroke-width: 1.8;
    stroke-dasharray: 100;
    stroke-dashoffset: 100;
    opacity: 0.9;
  }
  .layer.on .fence {
    stroke-dashoffset: 0;
    transition: stroke-dashoffset 0.9s ease;
    transition-delay: calc(var(--i) * 90ms);
  }

  .trail {
    fill: none;
    stroke-linejoin: miter;
  }

  text {
    font-family: var(--lp-mono, ui-monospace, monospace);
    letter-spacing: 0.02em;
    pointer-events: none;
  }
  .pad-name {
    font-size: 10px;
    font-weight: 700;
    fill: #15261c;
  }
  .tag {
    font-size: 8px;
    font-weight: 500;
    fill: #f4f1e6;
  }

  .halo {
    transform-box: fill-box;
    transform-origin: center;
    animation: halo 2.4s ease-out infinite;
  }
  @keyframes halo {
    0% {
      transform: scale(0.7);
      opacity: 0.4;
    }
    100% {
      transform: scale(1.9);
      opacity: 0;
    }
  }

  .dropped {
    transform-box: fill-box;
    transform-origin: 50% 100%;
    animation: drop 0.5s cubic-bezier(0.34, 1.7, 0.5, 1) both;
  }
  @keyframes drop {
    from {
      transform: translateY(-22px) scale(0.3);
      opacity: 0;
    }
  }
  .ripple {
    fill: none;
    stroke: #fff;
    stroke-width: 3;
    transform-box: fill-box;
    transform-origin: center;
    opacity: 0;
    animation: ripple 0.9s ease-out 0.25s both;
    pointer-events: none;
  }
  @keyframes ripple {
    from {
      transform: scale(1);
      opacity: 0.95;
    }
    to {
      transform: scale(3.2);
      opacity: 0;
    }
  }

  .hint {
    pointer-events: none;
  }
  .hint-ring {
    fill: none;
    stroke: #fff;
    stroke-width: 2.5;
    transform-box: fill-box;
    transform-origin: center;
    animation: ripple 1.6s ease-out infinite;
  }

  /* Map chrome */
  .chip {
    position: absolute;
    display: flex;
    align-items: center;
    gap: 7px;
    max-width: 62%;
    padding: 7px 12px;
    border-radius: 99px;
    background: rgba(18, 32, 26, 0.92);
    color: #f4f1e6;
    font-family: var(--lp-mono, ui-monospace, monospace);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    pointer-events: none;
  }
  .chip.name {
    top: 12px;
    left: 12px;
  }
  .chip-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chip.state {
    top: 12px;
    right: 12px;
    font-size: 10px;
    letter-spacing: 0.14em;
    color: rgba(244, 241, 230, 0.7);
  }
  .chip.state.live {
    background: #1f8a4c;
    color: #fff;
  }
  .chip.tap {
    bottom: 12px;
    left: 50%;
    max-width: none;
    background: #f7db5c;
    color: #15261c;
    letter-spacing: 0.02em;
    white-space: nowrap;
    transform: translateX(-50%);
  }
  .dot {
    width: 7px;
    height: 7px;
    flex-shrink: 0;
    border-radius: 50%;
    background: #f7b23b;
  }
  .dot.live {
    background: #39d27a;
  }

  @media (prefers-reduced-motion: reduce) {
    .halo,
    .dropped,
    .ripple,
    .hint-ring {
      animation: none;
    }
    .ripple,
    .hint-ring {
      opacity: 0;
    }
    .wash,
    .layer,
    .layer.on .fence {
      transition: none;
    }
  }
</style>
