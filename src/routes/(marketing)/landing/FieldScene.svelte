<script lang="ts">
  /**
   * Animated close-up of one paddock mid-job, in the farm-map style.
   *
   *  - "seeding": the sprayer works ahead leaving its trail; the seeder comes
   *    two rows behind at half the pace, seeding only sprayed ground.
   *  - "harvest": two headers cut staggered passes, each leaving a trail; the
   *    chaser bin runs alongside on cut ground and leaves none.
   *  - "rocks": the ute drives rock to rock (and one stump), collecting each
   *    with a pulse and a brief "Collected".
   *  - "records": an irregular paddock as the Records view shows it — one
   *    finished job filling it in blue, a second being laid over it in yellow.
   *
   * Trails are always the colour of the machine that left them. Vehicles and
   * pins are the app's own art (MapVehicle / MapPin). The still versions of
   * these scenes live in StillScene.svelte.
   */
  import MapVehicle from "./MapVehicle.svelte"
  import MapPin from "./MapPin.svelte"
  import type { PinKind } from "./pinGlyphs"
  import { smilPlayback, stopAndGo } from "./motion"

  export let kind: "seeding" | "harvest" | "rocks" | "records"

  const BLUE = "#2F62D6"
  const GREEN = "#1F8A4C"
  const RUST = "#D95D39"
  const PURPLE = "#7B4BC4"
  const TEAL = "#0E8C99"
  const CREAM = "#F4F1E6"
  const INK = "#15261C"

  type Runner = {
    name:
      | "SelfPropelledBoomspray"
      | "TowBehindSeeder"
      | "HeaderDuals"
      | "FourWheelDriveChaserBin"
    path: string
    color: string
    size: number
    /** Trail width; 0 means this machine leaves no trail. */
    trail: number
    trailOpacity: number
    /** How much of its path it covers in one loop (1 = all of it). */
    reach: number
  }

  // ── Seeding: rows run left-right and turn inside the fence. Both paths are
  // the same length; the seeder only gets half as far in the same time.
  const SPRAYED = "M-50,31 H232 V77 H-50"
  const seeding: Runner[] = [
    {
      name: "SelfPropelledBoomspray",
      path: "M-50,123 H232 V169 H-50",
      color: BLUE,
      size: 54,
      trail: 44,
      trailOpacity: 0.55,
      reach: 1,
    },
    {
      name: "TowBehindSeeder",
      path: "M-50,31 H232 V77 H-50",
      color: GREEN,
      size: 66,
      trail: 34,
      trailOpacity: 0.8,
      reach: 0.5,
    },
  ]

  // ── Harvest: passes run bottom to top; the second header trails the first.
  const CUT = "M34,260 V-60"
  const harvest: Runner[] = [
    {
      name: "FourWheelDriveChaserBin",
      path: "M34,296 V-84",
      color: BLUE,
      size: 62,
      trail: 0,
      trailOpacity: 0,
      reach: 1,
    },
    {
      name: "HeaderDuals",
      path: "M130,336 V-44",
      color: PURPLE,
      size: 60,
      trail: 46,
      trailOpacity: 0.62,
      reach: 1,
    },
    {
      name: "HeaderDuals",
      path: "M82,270 V-110",
      color: RUST,
      size: 60,
      trail: 46,
      trailOpacity: 0.62,
      reach: 1,
    },
  ]

  // ── Rock picking: the ute pulls up beside each pin, waits while it's
  // collected, then heads out through the gate.
  const finds: { x: number; y: number; kind: PinKind }[] = [
    { x: 78, y: 128, kind: "rock" },
    { x: 150, y: 62, kind: "rock" },
    { x: 214, y: 134, kind: "stump" },
    { x: 268, y: 64, kind: "rock" },
  ]
  const GATE = { x: 294, y: 150 }
  const PICK_PAUSE = 0.08
  const pickup = stopAndGo(
    [
      { x: -30, y: 184 },
      ...finds.map((f) => ({ x: f.x - 13, y: f.y + 13 })),
      GATE,
      { x: 350, y: 150 },
    ],
    [
      ...finds.map((_, i) => ({ arrive: 0.14 + i * 0.16, pause: PICK_PAUSE })),
      { arrive: 0.82 },
      { arrive: 0.92 },
    ],
  )
  const collected = finds.map((f, i) => ({ ...f, at: pickup.mid[i] }))

  // ── Records: yellow passes run parallel to the paddock's long eastern
  // fence, working in from the west. Drawn long and clipped to the boundary.
  const PADDOCK = "176,14 282,14 152,186 54,182 72,150 70,66 88,50"
  const recordPasses = (() => {
    const along = { x: -0.603, y: 0.798 }
    const across = { x: -0.798, y: -0.603 }
    const at = (off: number, s: number) =>
      `${(282 + across.x * off + along.x * s).toFixed(1)},${(14 + across.y * off + along.y * s).toFixed(1)}`
    const offsets = [130, 118, 106, 94, 82, 70]
    return (
      "M" +
      offsets
        .map((off, i) =>
          i % 2 === 0
            ? `${at(off, -10)} L${at(off, 232)}`
            : `${at(off, 232)} L${at(off, -10)}`,
        )
        .join(" L")
    )
  })()

  $: runners = kind === "seeding" ? seeding : kind === "harvest" ? harvest : []
  $: dur = { seeding: "13s", harvest: "9s", rocks: "13s", records: "12s" }[kind]
  $: restAt = { seeding: 6, harvest: 5, rocks: 7, records: 9 }[kind]
  $: description = {
    seeding:
      "A sprayer working ahead of a seeder, each leaving a coverage trail",
    harvest: "Two headers harvesting with a chaser bin alongside",
    rocks: "A ute driving from rock to rock, collecting each one off the map",
    records:
      "An irregular paddock with one finished job in blue and a second being recorded over it in yellow",
  }[kind]
</script>

{#key kind}
  <svg
    use:smilPlayback={restAt}
    viewBox="0 0 320 200"
    preserveAspectRatio="xMidYMid slice"
    role="img"
    aria-label={description}
  >
    {#if kind === "records"}
      <!-- Satellite-style backdrop: neighbouring country, scrub, and the road -->
      <rect width="320" height="200" fill="#34392F" />
      <polygon points="0,0 58,0 44,200 0,200" fill="#423E36" />
      <polygon
        points="58,0 176,0 176,12 88,48 68,64 70,150 52,184 44,200"
        fill="#2B4332"
      />
      <polygon points="312,0 320,0 320,200 176,200" fill="#45413A" />
      <path
        d="M306,-4 L166,204"
        stroke="#77766A"
        stroke-width="3.5"
        fill="none"
      />
      <path
        d="M299,-4 L159,204"
        stroke="#23271F"
        stroke-width="1.2"
        fill="none"
      />

      <clipPath id="lp-records-paddock">
        <polygon points={PADDOCK} />
      </clipPath>
      <g clip-path="url(#lp-records-paddock)">
        <rect width="320" height="200" fill="#4F7FF0" />
        <path
          d={recordPasses}
          class="pass"
          stroke="#F2C230"
          pathLength="100"
          stroke-dasharray="100"
          stroke-dashoffset="100"
        >
          <animate
            attributeName="stroke-dashoffset"
            values="100;0;0"
            keyTimes="0;0.86;1"
            {dur}
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            values="1;1;0"
            keyTimes="0;0.95;1"
            {dur}
            repeatCount="indefinite"
          />
        </path>
      </g>
      <polygon
        points={PADDOCK}
        fill="none"
        stroke="#7BD88A"
        stroke-width="1.2"
      />

      <text x="168" y="104" text-anchor="middle" class="paddock-name"
        >Top paddock</text
      >
      <text x="168" y="116" text-anchor="middle" class="paddock-ha"
        >42.3 ha</text
      >

      <g transform="translate(236 150)">
        <rect width="74" height="38" rx="7" fill="#12161A" opacity="0.72" />
        <circle cx="12" cy="13" r="4" fill="#4F7FF0" />
        <text x="22" y="15.6" class="legend">Sprayed</text>
        <circle cx="12" cy="26" r="4" fill="#F2C230" />
        <text x="22" y="28.6" class="legend">Seeded</text>
      </g>
    {:else if kind === "rocks"}
      <rect width="320" height="200" fill="#6E9B5C" />
      <rect x="292" width="4" height="200" fill="#CDBD92" />
      <rect x="296" width="24" height="200" fill="#C79A5B" />
      <path
        d={pickup.path}
        stroke="#fff"
        stroke-width="1.8"
        stroke-dasharray="4 5"
        fill="none"
        opacity="0.7"
      />
      <MapPin kind="gate" x={GATE.x} y={GATE.y} r={9} />

      {#each collected as c}
        <g>
          <animate
            attributeName="opacity"
            values="0;1;1;0;0"
            keyTimes="0;0.03;{c.at};{c.at + 0.015};1"
            {dur}
            repeatCount="indefinite"
          />
          <MapPin kind={c.kind} x={c.x} y={c.y} r={12} />
        </g>
      {/each}

      <g>
        <animateMotion
          path={pickup.path}
          {dur}
          repeatCount="indefinite"
          calcMode="linear"
          rotate="auto"
          keyPoints={pickup.keyPoints}
          keyTimes={pickup.keyTimes}
        />
        <MapVehicle name="FarmUte" size={34} color={TEAL} />
      </g>

      <!-- Collection: a ring pulses out and "Collected" lifts away -->
      {#each collected as c}
        <circle
          cx={c.x}
          cy={c.y}
          r="12"
          fill="none"
          stroke="#fff"
          stroke-width="3"
          opacity="0"
        >
          <animate
            attributeName="r"
            values="12;12;34;34"
            keyTimes="0;{c.at};{c.at + 0.06};1"
            {dur}
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            values="0;0;1;0;0"
            keyTimes="0;{c.at - 0.001};{c.at};{c.at + 0.06};1"
            {dur}
            repeatCount="indefinite"
          />
        </circle>
        <g opacity="0">
          <animate
            attributeName="opacity"
            values="0;0;1;1;0;0"
            keyTimes="0;{c.at - 0.001};{c.at + 0.012};{c.at + 0.06};{c.at +
              0.095};1"
            {dur}
            repeatCount="indefinite"
          />
          <animateTransform
            attributeName="transform"
            type="translate"
            values="0 4;0 4;0 -8;0 -8"
            keyTimes="0;{c.at};{c.at + 0.095};1"
            {dur}
            repeatCount="indefinite"
          />
          <g transform="translate({c.x - 28} {c.y - 36})">
            <rect width="56" height="16" rx="8" fill={INK} />
            <text x="28" y="11" text-anchor="middle" class="collected"
              >Collected</text
            >
          </g>
        </g>
      {/each}
    {:else}
      {#if kind === "seeding"}
        <rect width="320" height="200" fill="#C79A5B" />
        <rect x="268" width="24" height="200" fill="#CDBD92" />
        <rect x="292" width="28" height="200" fill="#6E9B5C" />
        <path
          d={SPRAYED}
          class="trail"
          stroke={BLUE}
          stroke-width="44"
          opacity="0.55"
        />
      {:else}
        <rect width="320" height="200" fill="#E0B94F" />
        <rect x="256" width="24" height="200" fill="#CDBD92" />
        <rect x="280" width="40" height="200" fill="#6E9B5C" />
        <path
          d={CUT}
          class="trail"
          stroke={RUST}
          stroke-width="46"
          opacity="0.4"
        />
      {/if}

      <!-- Trails first, so every machine drives on top of them -->
      {#each runners.filter((r) => r.trail > 0) as r}
        <path
          d={r.path}
          class="trail"
          stroke={r.color}
          stroke-width={r.trail}
          pathLength="100"
          stroke-dasharray="100"
          stroke-dashoffset="100"
        >
          <animate
            attributeName="stroke-dashoffset"
            values="100;{100 - r.reach * 100};{100 - r.reach * 100}"
            keyTimes="0;0.94;1"
            {dur}
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            values="{r.trailOpacity};{r.trailOpacity};0"
            keyTimes="0;0.95;1"
            {dur}
            repeatCount="indefinite"
          />
        </path>
      {/each}

      {#if kind === "seeding"}
        <MapPin kind="gate" x={268} y={100} r={10} />
        <MapVehicle
          name="CabOverTruck"
          x={280}
          y={156}
          size={40}
          heading={0}
          color={CREAM}
        />
      {:else}
        <MapPin kind="rock" x={206} y={112} r={11} />
        <MapPin kind="gate" x={256} y={170} r={9} />
        <MapPin kind="fieldBin" x={270} y={50} r={13} />
        <MapVehicle
          name="CabOverTruck"
          x={268}
          y={112}
          size={40}
          heading={0}
          color={CREAM}
        />
      {/if}

      {#each runners as r}
        <g>
          <animateMotion
            path={r.path}
            {dur}
            repeatCount="indefinite"
            calcMode="linear"
            rotate="auto"
            keyPoints="0;{r.reach};{r.reach}"
            keyTimes="0;0.94;1"
          />
          <animate
            attributeName="opacity"
            values="1;1;0"
            keyTimes="0;0.95;1"
            {dur}
            repeatCount="indefinite"
          />
          <MapVehicle name={r.name} size={r.size} color={r.color} />
        </g>
      {/each}
    {/if}
  </svg>
{/key}

<style>
  svg {
    display: block;
    width: 100%;
    height: 100%;
  }
  .trail {
    fill: none;
    stroke-linejoin: miter;
  }
  .pass {
    fill: none;
    stroke-width: 10.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  text {
    font-family: var(--lp-mono, ui-monospace, monospace);
  }
  .collected {
    font-size: 8px;
    font-weight: 500;
    letter-spacing: 0.02em;
    fill: #f4f1e6;
  }
  .legend {
    font-size: 7.5px;
    fill: #f4f1e6;
  }
  .paddock-name,
  .paddock-ha {
    font-family: "Inter", ui-sans-serif, system-ui, sans-serif;
    fill: #fff;
    stroke: #10140f;
    stroke-width: 2.4px;
    paint-order: stroke;
  }
  .paddock-name {
    font-size: 10px;
    font-weight: 600;
  }
  .paddock-ha {
    font-size: 9px;
  }
</style>
