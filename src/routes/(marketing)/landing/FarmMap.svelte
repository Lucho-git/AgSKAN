<script lang="ts">
  /**
   * Stylised, animated farm map — the landing page's signature illustration.
   *
   * Pure inline SVG: paddocks are polygons, coverage trails are stroked paths
   * revealed with an animated stroke-dashoffset, and the app's own vehicle
   * drawings ride the same paths with <animateMotion>. Layers fade in and out
   * via props so one drawing can illustrate every feature.
   *
   * A phone frames the two middle columns of paddocks top to bottom; a
   * tablet frames the lower two rows a little wider. The work happens where
   * both can see it.
   */
  import MapVehicle from "./MapVehicle.svelte"
  import MapPin from "./MapPin.svelte"
  import type { PinKind } from "./pinGlyphs"
  import { smilPlayback, stopAndGo, type Leg } from "./motion"

  export let boundaries = true
  export let tracking = true
  export let trails = true
  export let pins = true
  /** Which job is under way: sprayer + seeder, header + chaser bin, or none. */
  export let scene: "seeding" | "harvest" | "none" = "harvest"
  /** Framing: a phone crops to the middle of the farm. */
  export let view: "phone" | "tablet" = "phone"
  /** Name tags above each machine. */
  export let labels = true
  /** Include the truck that parks at the field bin. */
  export let truck = true
  /** Length of one loop, in seconds. Read once, at creation. */
  export let loop = 22
  /**
   * The ute's run to the three rocks, as loop fractions: when it sets off,
   * then when it reaches the gate and each rock (and how long it stops).
   */
  export let uteDepart = 0
  export let uteLegs: Leg[] = [
    { arrive: 0.38 },
    { arrive: 0.45, pause: 0.07 },
    { arrive: 0.6, pause: 0.07 },
    { arrive: 0.74 },
  ]
  /** Change this to restart the loop from the beginning. */
  export let epoch = 0
  /** Accessible description of what the picture shows. */
  export let label =
    "Illustrated farm map with paddocks, machines moving, coverage trails and hazard pins"

  let svg: SVGSVGElement
  let lastEpoch = epoch
  $: if (svg && epoch !== lastEpoch) {
    lastEpoch = epoch
    svg.setCurrentTime(0)
  }

  const LOOP = `${loop}s`
  const BLUE = "#2F62D6"
  const GREEN = "#1F8A4C"
  const RUST = "#D95D39"
  const TEAL = "#0E8C99"
  const INK = "#15261C"
  const SCRUB = "#3F6B4A"

  $: viewBox = view === "tablet" ? "140 196 440 330" : "226 76 268 482"

  const rect = (x1: number, y1: number, x2: number, y2: number) =>
    `${x1},${y1} ${x2},${y1} ${x2},${y2} ${x1},${y2}`

  // Paddocks share fence lines (a 3-unit gap) wherever they can. The only
  // roads are the lane along y=333 and the one running down between "Home"
  // and "Back". The three worked paddocks are plain rectangles; the ones
  // around them are whatever shape the country left.
  const paddocks = [
    {
      name: "Top",
      ha: "84 ha",
      fill: "#D8B04A",
      points: "186,20 397,20 337,171 186,171",
      lx: 236,
      ly: 150,
    },
    {
      name: "Canola",
      ha: "61 ha",
      fill: "#EDD352",
      points: "403,20 600,20 600,110 548,171 343,171",
      lx: 377,
      ly: 150,
    },
    {
      name: "Creek",
      ha: "47 ha",
      fill: "#6E9B5C",
      points: rect(186, 174, 353, 326),
      lx: 236,
      ly: 306,
    },
    {
      name: "Dam",
      ha: "52 ha",
      fill: "#9B5B36",
      points: "356,174 548,174 590,250 566,326 356,326",
      lx: 377,
      ly: 194,
    },
    {
      name: "Home",
      ha: "96 ha",
      fill: "#C79A5B",
      points: rect(186, 340, 353, 580),
      lx: 236,
      ly: 468,
    },
    {
      name: "Back",
      ha: "70 ha",
      fill: "#E0B94F",
      points: rect(367, 340, 534, 580),
      lx: 377,
      ly: 478,
    },
    // Around the edges — mostly seen on a tablet
    {
      name: "",
      ha: "",
      fill: "#4E8153",
      points: "-30,20 183,20 183,236 128,326 -30,326",
      lx: 0,
      ly: 0,
    },
    {
      name: "",
      ha: "",
      fill: SCRUB,
      points: "183,240 183,326 132,326",
      lx: 0,
      ly: 0,
    },
    {
      name: "",
      ha: "",
      fill: "#E3C766",
      points: rect(-30, 340, 183, 580),
      lx: 0,
      ly: 0,
    },
    {
      name: "",
      ha: "",
      fill: SCRUB,
      points: "551,174 750,174 750,326 569,326 593,250",
      lx: 0,
      ly: 0,
    },
    {
      name: "",
      ha: "",
      fill: "#6E9B5C",
      points: "537,340 600,340 548,580 537,580",
      lx: 0,
      ly: 0,
    },
    {
      name: "",
      ha: "",
      fill: "#E8CC57",
      points: "604,340 750,340 750,580 552,580",
      lx: 0,
      ly: 0,
    },
  ]
  // Tree clumps in the scrub
  const trees = [
    [570, 192],
    [600, 212],
    [586, 292],
    [612, 268],
    [640, 232],
    [602, 314],
    [668, 290],
    [174, 268],
    [162, 298],
    [176, 314],
    [150, 318],
  ]

  // Work runs up and down the paddocks, so it reads the same whether the
  // frame is a tall phone or a wide tablet.

  // Seeding, all in "Home": the first two passes are already sprayed. The
  // sprayer carries on across the paddock; the seeder follows behind at half
  // the pace, so it only ever seeds sprayed ground.
  const SPRAYED_PATH = "M246,520 V352 H270 V520"
  const SPRAYER_PATH = "M270,520 H294 V352 H318 V520 H342 V400"
  const SEEDER_PATH = "M246,520 V352 H270 V520 H294 V376"
  // Harvest, in "Back": the edge pass is already cut. One header works up and
  // down leaving its trail. The chaser bin leaves none: it keeps beside the
  // header for one pass (its auger only reaches from one side, so it can't
  // follow the header round the turn), then heads out the gate and pulls up
  // by the field bin, next to the truck.
  const CUT_PATH = "M381,580 V352"
  const HEADER_PATH = "M405,520 V352 H429 V505 H453 V396"
  const HEADER_TRAVEL = 0.92
  const HEADER_LENGTH = 168 + 24 + 153 + 24 + 109
  // Loop fraction the header (and the chaser beside it) takes per map unit.
  const PACE = HEADER_TRAVEL / HEADER_LENGTH
  const chaserPoints = [
    { x: 381, y: 534 },
    { x: 381, y: 366 }, // top of the pass
    { x: 381, y: 333 }, // out the gate, onto the lane
    { x: 410, y: 333 }, // beside the field bin
  ]
  const chaser = stopAndGo(chaserPoints, [
    { arrive: 168 * PACE },
    { arrive: (168 + 33) * PACE },
    { arrive: (168 + 33 + 29) * PACE },
  ])
  // Shared, and never leaving a trail: the truck comes up the road and parks
  // beside the field bin; the ute heads through the gate into "Creek" and
  // stops at each rock, which comes off the map as it's picked.
  const TRUCK_PATH = "M360,640 V333 H452"
  const ROCKS = [
    { x: 318, y: 290 },
    { x: 270, y: 262 },
    { x: 300, y: 224 },
  ]
  const ute = stopAndGo(
    [{ x: 100, y: 333 }, { x: 330, y: 333 }, ...ROCKS],
    uteLegs,
    uteDepart,
  )

  type Machine = {
    label: string
    name:
      | "SelfPropelledBoomspray"
      | "TowBehindSeeder"
      | "HeaderDuals"
      | "FourWheelDriveChaserBin"
      | "CabOverTruck"
      | "FarmUte"
    path: string
    color: string
    size: number
    chipW: number
    /** animateMotion timing: where along the path, at which loop fractions. */
    keyPoints: string
    keyTimes: string
    /** Loop fraction at which the machine first appears. */
    appear: number
  }

  const WORK = { keyPoints: "0;1;1", keyTimes: "0;0.92;1", appear: 0 }
  // The seeder covers half the ground the sprayer does in the same time.
  const SEEDER_REACH = 0.5

  const seedingMachines: Machine[] = [
    {
      label: "Sprayer",
      name: "SelfPropelledBoomspray",
      path: SPRAYER_PATH,
      color: BLUE,
      size: 30,
      chipW: 44,
      ...WORK,
    },
    {
      label: "Seeder",
      name: "TowBehindSeeder",
      path: SEEDER_PATH,
      color: GREEN,
      size: 42,
      chipW: 40,
      ...WORK,
      keyPoints: `0;${SEEDER_REACH};${SEEDER_REACH}`,
    },
  ]
  const harvestMachines: Machine[] = [
    {
      label: "Chaser",
      name: "FourWheelDriveChaserBin",
      path: chaser.path,
      color: BLUE,
      size: 36,
      chipW: 40,
      keyPoints: chaser.keyPoints,
      keyTimes: chaser.keyTimes,
      appear: 0,
    },
    {
      label: "Header",
      name: "HeaderDuals",
      path: HEADER_PATH,
      color: RUST,
      size: 32,
      chipW: 40,
      ...WORK,
      keyTimes: `0;${HEADER_TRAVEL};1`,
    },
  ]
  const truckMachine: Machine = {
    label: "Truck",
    name: "CabOverTruck",
    path: TRUCK_PATH,
    color: "#F4F1E6",
    size: 28,
    chipW: 34,
    keyPoints: "0;1;1",
    keyTimes: "0;0.36;1",
    appear: 0,
  }
  const uteMachine: Machine = {
    label: "Ute",
    name: "FarmUte",
    path: ute.path,
    color: TEAL,
    size: 21,
    chipW: 24,
    keyPoints: ute.keyPoints,
    keyTimes: ute.keyTimes,
    appear: uteDepart,
  }
  const sharedMachines: Machine[] = truck
    ? [truckMachine, uteMachine]
    : [uteMachine]

  // Rocks and stumps out in the paddocks, gates on the fence lines, and the
  // field bin by the road. `pickedAt` is the loop fraction at which the ute
  // picks that rock up.
  const pinList: {
    x: number
    y: number
    kind: PinKind
    name: string
    pickedAt?: number
  }[] = [
    { x: 456, y: 124, kind: "waterTank", name: "Water tank" },
    { x: 290, y: 132, kind: "rock", name: "Rock" },
    { x: 330, y: 172, kind: "gate", name: "" },
    { x: 492, y: 214, kind: "stump", name: "Stump" },
    { x: 355, y: 244, kind: "gate", name: "" },
    { x: 330, y: 326, kind: "gate", name: "" },
    { x: 381, y: 340, kind: "gate", name: "" },
    { x: 418, y: 298, kind: "fieldBin", name: "Field bin" },
    ...ROCKS.map((r, i) => ({
      ...r,
      kind: "rock" as const,
      name: "",
      pickedAt: ute.mid[i + 1],
    })),
  ]
  const picked = pinList.flatMap((p) =>
    p.pickedAt ? [{ x: p.x, y: p.y, at: p.pickedAt }] : [],
  )

  /** Opacity timing: hidden until `from`, fade in, hold, fade out at the end. */
  const lifeTimes = (from: number) =>
    from > 0 ? `0;${from};${from + 0.03};0.95;1` : "0;0.03;0.95;1"
  const lifeValues = (from: number) => (from > 0 ? "0;0;1;1;0" : "0;1;1;0")
</script>

<svg
  bind:this={svg}
  use:smilPlayback={loop * 0.55}
  class="farm-map"
  {viewBox}
  preserveAspectRatio="xMidYMid slice"
  role="img"
  aria-label={label}
>
  <rect x="-80" y="-80" width="880" height="700" fill="#CDBD92" />

  <g transform="rotate(-4 360 270)">
    <!-- Paddocks -->
    {#each paddocks as p}
      <polygon points={p.points} fill={p.fill} />
    {/each}
    {#each trees as [cx, cy]}
      <circle {cx} {cy} r="7" fill="#33573D" />
    {/each}
    <ellipse cx="456" cy="262" rx="27" ry="15" fill="#8FB0C9" />

    <!-- Boundaries + names -->
    <g class="layer" class:on={boundaries}>
      {#each paddocks as p}
        <polygon
          points={p.points}
          fill="none"
          stroke="#fff"
          stroke-width="1.6"
          stroke-dasharray="5 4"
          opacity="0.85"
        />
        {#if p.name}
          <text x={p.lx} y={p.ly} class="pad-name">{p.name}</text>
          <text x={p.lx} y={p.ly + 10} class="pad-ha">{p.ha}</text>
        {/if}
      {/each}
    </g>

    <!-- Coverage trails: seeding. Each trail is its machine's colour. -->
    <g class="layer" class:on={trails && scene === "seeding"}>
      <path
        d={SPRAYED_PATH}
        class="trail"
        stroke={BLUE}
        stroke-width="24"
        opacity="0.55"
      />
      <path
        d={SPRAYER_PATH}
        class="trail"
        stroke={BLUE}
        stroke-width="24"
        pathLength="100"
        stroke-dasharray="100"
        stroke-dashoffset="100"
      >
        <animate
          attributeName="stroke-dashoffset"
          values="100;0;0"
          keyTimes="0;0.92;1"
          dur={LOOP}
          repeatCount="indefinite"
        />
        <animate
          attributeName="opacity"
          values="0.55;0.55;0"
          keyTimes="0;0.95;1"
          dur={LOOP}
          repeatCount="indefinite"
        />
      </path>
      <path
        d={SEEDER_PATH}
        class="trail"
        stroke={GREEN}
        stroke-width="20"
        pathLength="100"
        stroke-dasharray="100"
        stroke-dashoffset="100"
      >
        <animate
          attributeName="stroke-dashoffset"
          values="100;{100 - SEEDER_REACH * 100};{100 - SEEDER_REACH * 100}"
          keyTimes="0;0.92;1"
          dur={LOOP}
          repeatCount="indefinite"
        />
        <animate
          attributeName="opacity"
          values="0.8;0.8;0"
          keyTimes="0;0.95;1"
          dur={LOOP}
          repeatCount="indefinite"
        />
      </path>
    </g>

    <!-- Coverage trails: harvest -->
    <g class="layer" class:on={trails && scene === "harvest"}>
      <path
        d={CUT_PATH}
        class="trail"
        stroke={RUST}
        stroke-width="22"
        opacity="0.4"
      />
      <path
        d={HEADER_PATH}
        class="trail"
        stroke={RUST}
        stroke-width="22"
        pathLength="100"
        stroke-dasharray="100"
        stroke-dashoffset="100"
      >
        <animate
          attributeName="stroke-dashoffset"
          values="100;0;0"
          keyTimes="0;0.92;1"
          dur={LOOP}
          repeatCount="indefinite"
        />
        <animate
          attributeName="opacity"
          values="0.62;0.62;0"
          keyTimes="0;0.95;1"
          dur={LOOP}
          repeatCount="indefinite"
        />
      </path>
    </g>

    <!-- Pins: the app's own pin art -->
    <g class="layer" class:on={pins}>
      {#each pinList as pin, i}
        <g class="pin" style="--i: {i}">
          <g>
            {#if pin.pickedAt}
              <animate
                attributeName="opacity"
                values="0;1;1;0;0"
                keyTimes="0;0.03;{pin.pickedAt};{pin.pickedAt + 0.015};1"
                dur={LOOP}
                repeatCount="indefinite"
              />
            {/if}
            <MapPin
              kind={pin.kind}
              x={pin.x}
              y={pin.y}
              r={pin.kind === "gate" ? 8.5 : 11}
              label={pin.name}
            />
          </g>
        </g>
      {/each}
    </g>

    <!-- Live operators. Each machine is drawn twice on the same path: the
         vehicle turns with the path, its name tag stays upright. -->
    {#each [{ on: tracking && scene === "seeding", list: seedingMachines }, { on: tracking && scene === "harvest", list: harvestMachines }, { on: tracking, list: sharedMachines }] as group}
      <g class="layer" class:on={group.on}>
        {#each group.list as m}
          <g opacity="0">
            <animateMotion
              path={m.path}
              dur={LOOP}
              repeatCount="indefinite"
              calcMode="linear"
              rotate="auto"
              keyPoints={m.keyPoints}
              keyTimes={m.keyTimes}
            />
            <animate
              attributeName="opacity"
              values={lifeValues(m.appear)}
              keyTimes={lifeTimes(m.appear)}
              dur={LOOP}
              repeatCount="indefinite"
            />
            <circle
              r={m.size * 0.5}
              class="halo"
              fill={m.color === "#F4F1E6" ? INK : m.color}
            />
            <MapVehicle name={m.name} size={m.size} color={m.color} />
          </g>
          {#if labels}
            <g opacity="0">
              <animateMotion
                path={m.path}
                dur={LOOP}
                repeatCount="indefinite"
                calcMode="linear"
                keyPoints={m.keyPoints}
                keyTimes={m.keyTimes}
              />
              <animate
                attributeName="opacity"
                values={lifeValues(m.appear)}
                keyTimes={lifeTimes(m.appear)}
                dur={LOOP}
                repeatCount="indefinite"
              />
              <g transform="translate({m.size * 0.42} {-m.size * 0.5 - 12})">
                <rect width={m.chipW} height="13" rx="6.5" fill={INK} />
                <text
                  x={m.chipW / 2}
                  y="9.2"
                  text-anchor="middle"
                  class="chip-text">{m.label}</text
                >
              </g>
            </g>
          {/if}
        {/each}
      </g>
    {/each}

    <!-- A ring pulses out from each rock as the ute collects it -->
    <g class="layer" class:on={pins && tracking}>
      {#each picked as p}
        <circle
          cx={p.x}
          cy={p.y}
          r="10"
          fill="none"
          stroke="#fff"
          stroke-width="2.5"
          opacity="0"
        >
          <animate
            attributeName="r"
            values="10;10;26;26"
            keyTimes="0;{p.at};{p.at + 0.035};1"
            dur={LOOP}
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            values="0;0;0.95;0;0"
            keyTimes="0;{p.at - 0.001};{p.at};{p.at + 0.035};1"
            dur={LOOP}
            repeatCount="indefinite"
          />
        </circle>
      {/each}
    </g>
  </g>
</svg>

<style>
  .farm-map {
    display: block;
    width: 100%;
    height: 100%;
  }

  .layer {
    opacity: 0;
    transition: opacity 0.55s ease;
  }
  .layer.on {
    opacity: 1;
  }

  .trail {
    fill: none;
    stroke-linejoin: miter;
  }

  text {
    font-family: var(--lp-mono, ui-monospace, monospace);
    letter-spacing: 0.02em;
  }
  .pad-name {
    font-size: 8.5px;
    font-weight: 700;
    fill: #15261c;
  }
  .pad-ha {
    font-size: 7px;
    fill: #15261c;
    opacity: 0.6;
  }
  .chip-text {
    font-size: 7px;
    font-weight: 500;
    fill: #f4f1e6;
  }

  .halo {
    transform-box: fill-box;
    transform-origin: center;
    opacity: 0.3;
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

  /* Pins drop in, one after another, whenever the layer is switched on. */
  .pin {
    transform-box: fill-box;
    transform-origin: 50% 100%;
    transform: translateY(-14px) scale(0.4);
    opacity: 0;
    transition:
      transform 0.25s ease,
      opacity 0.25s ease;
  }
  .layer.on .pin {
    transform: none;
    opacity: 1;
    transition:
      transform 0.55s cubic-bezier(0.34, 1.7, 0.5, 1),
      opacity 0.3s ease;
    transition-delay: calc(var(--i) * 80ms + 150ms);
  }

  @media (prefers-reduced-motion: reduce) {
    .halo {
      animation: none;
      opacity: 0.2;
      transform: scale(1.3);
    }
    .layer,
    .pin,
    .layer.on .pin {
      transition: none;
    }
  }
</style>
