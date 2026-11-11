<script lang="ts">
  /**
   * Stylised, animated farm map — the landing page's signature illustration.
   *
   * Pure inline SVG: paddocks are rects, coverage trails are stroked paths
   * revealed with an animated stroke-dashoffset, and machines ride the same
   * paths with <animateMotion>. Layers fade in and out via props so one
   * drawing can illustrate every feature.
   */
  import { onMount } from "svelte"

  export let boundaries = true
  export let tracking = true
  export let trails = true
  export let pins = true
  /** Accessible description of what the picture shows. */
  export let label =
    "Illustrated farm map with paddocks, machines moving, coverage trails and hazard pins"

  let svg: SVGSVGElement

  const LOOP = "20s"

  const paddocks = [
    {
      x: -20,
      y: 26,
      w: 166,
      h: 140,
      fill: "#D8B04A",
      name: "Top",
      ha: "84 ha",
      lx: 12,
      ly: 158,
    },
    {
      x: 154,
      y: 26,
      w: 166,
      h: 140,
      fill: "#EDD352",
      name: "Canola",
      ha: "61 ha",
      lx: 164,
      ly: 46,
    },
    {
      x: -20,
      y: 174,
      w: 156,
      h: 156,
      fill: "#6E9B5C",
      name: "Creek",
      ha: "47 ha",
      lx: 12,
      ly: 194,
    },
    {
      x: 144,
      y: 174,
      w: 176,
      h: 156,
      fill: "#9B5B36",
      name: "Dam",
      ha: "52 ha",
      lx: 154,
      ly: 194,
    },
    {
      x: -20,
      y: 338,
      w: 166,
      h: 242,
      fill: "#DDB955",
      name: "Home",
      ha: "96 ha",
      lx: 12,
      ly: 440,
    },
    {
      x: 154,
      y: 338,
      w: 166,
      h: 242,
      fill: "#4E8153",
      name: "Back",
      ha: "70 ha",
      lx: 236,
      ly: 500,
    },
  ]

  const SPRAYER_PATH =
    "M2,40 H140 V54 H2 V68 H140 V82 H2 V96 H140 V110 H2 V124 H140"
  const HEADER_PATH = "M168,580 V346 H184 V580 H200 V346 H216 V520"
  const UTE_PATH = "M-20,170 H140 V334 H330"
  const DONE_PATH = "M2,352 H140 V366 H2 V380 H140 V394 H2 V408 H140"

  const machines = [
    {
      name: "Sprayer",
      path: SPRAYER_PATH,
      color: "#2F62D6",
      chipW: 44,
      dur: LOOP,
    },
    {
      name: "Header",
      path: HEADER_PATH,
      color: "#D95D39",
      chipW: 40,
      dur: LOOP,
    },
    { name: "Ute", path: UTE_PATH, color: "#15261C", chipW: 24, dur: "13s" },
  ]

  const pinList = [
    { x: 236, y: 96, name: "Water tank", kind: "tank" },
    { x: 60, y: 250, name: "Rock", kind: "rock" },
    { x: 92, y: 478, name: "Stump", kind: "stump" },
    { x: 250, y: 404, name: "Field bin", kind: "bin" },
  ]

  onMount(() => {
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches
    if (reduced) {
      // Hold a representative mid-run frame instead of animating.
      svg.pauseAnimations()
      svg.setCurrentTime(11)
      return
    }
    // Don't burn battery animating a map nobody can see.
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) svg.unpauseAnimations()
      else svg.pauseAnimations()
    })
    observer.observe(svg)
    return () => observer.disconnect()
  })
</script>

<svg
  bind:this={svg}
  class="farm-map"
  viewBox="0 0 300 540"
  preserveAspectRatio="xMidYMid slice"
  role="img"
  aria-label={label}
>
  <rect x="-40" y="-40" width="380" height="640" fill="#CDBD92" />

  <g
    transform="rotate(-4 150 270) translate(150 270) scale(1.1) translate(-150 -270)"
  >
    <!-- Paddocks -->
    {#each paddocks as p}
      <rect x={p.x} y={p.y} width={p.w} height={p.h} rx="3" fill={p.fill} />
    {/each}
    <ellipse cx="236" cy="252" rx="27" ry="15" fill="#8FB0C9" />

    <!-- Boundaries + names -->
    <g class="layer" class:on={boundaries}>
      {#each paddocks as p}
        <rect
          x={p.x + 2.5}
          y={p.y + 2.5}
          width={p.w - 5}
          height={p.h - 5}
          rx="2"
          fill="none"
          stroke="#fff"
          stroke-width="1.6"
          stroke-dasharray="5 4"
          opacity="0.85"
        />
        <text x={p.lx} y={p.ly} class="pad-name">{p.name}</text>
        <text x={p.lx} y={p.ly + 10} class="pad-ha">{p.ha}</text>
      {/each}
    </g>

    <!-- Coverage trails -->
    <g class="layer" class:on={trails}>
      <path d={DONE_PATH} class="trail" stroke="#2F62D6" opacity="0.32" />
      <path
        d={SPRAYER_PATH}
        class="trail"
        stroke="#2F62D6"
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
      <path
        d={HEADER_PATH}
        class="trail wide"
        stroke="#F2A277"
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
          values="0.7;0.7;0"
          keyTimes="0;0.95;1"
          dur={LOOP}
          repeatCount="indefinite"
        />
      </path>
    </g>

    <!-- Hazard / asset pins -->
    <g class="layer" class:on={pins}>
      {#each pinList as pin, i}
        <g transform="translate({pin.x} {pin.y})">
          <g class="pin" style="--i: {i}">
            <ellipse
              cx="0"
              cy="12"
              rx="7"
              ry="2.2"
              fill="#15261C"
              opacity="0.22"
            />
            <circle r="11" fill="#fff" stroke="#15261C" stroke-width="2" />
            {#if pin.kind === "tank"}
              <rect
                x="-4.5"
                y="-4.5"
                width="9"
                height="9"
                rx="2.2"
                fill="#2F62D6"
              />
            {:else if pin.kind === "rock"}
              <path
                d="M-5,2.5 L-3.5,-3 L1,-5 L5,-1.5 L4,4 L-2,5 Z"
                fill="#6B6F6B"
              />
            {:else if pin.kind === "stump"}
              <circle r="5" fill="none" stroke="#8A5A2B" stroke-width="1.8" />
              <circle r="1.7" fill="#8A5A2B" />
            {:else}
              <path d="M-5,4.5 V-1 L0,-5.5 L5,-1 V4.5 Z" fill="#D95D39" />
            {/if}
            <text y="23" text-anchor="middle" class="pin-label">{pin.name}</text
            >
          </g>
        </g>
      {/each}
    </g>

    <!-- Live operators -->
    <g class="layer" class:on={tracking}>
      {#each machines as m}
        <g>
          <animateMotion
            path={m.path}
            dur={m.dur}
            repeatCount="indefinite"
            calcMode="linear"
            keyPoints="0;1;1"
            keyTimes="0;0.92;1"
          />
          <animate
            attributeName="opacity"
            values="0;1;1;0"
            keyTimes="0;0.03;0.95;1"
            dur={m.dur}
            repeatCount="indefinite"
          />
          <circle r="9" class="halo" fill={m.color} />
          <circle r="7" fill="#fff" />
          <circle r="4.6" fill={m.color} />
          <g transform="translate(11 -15)">
            <rect width={m.chipW} height="13" rx="6.5" fill="#15261C" />
            <text x={m.chipW / 2} y="9.2" text-anchor="middle" class="chip-text"
              >{m.name}</text
            >
          </g>
        </g>
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
    stroke-width: 11;
    stroke-linejoin: miter;
  }
  .trail.wide {
    stroke-width: 13;
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
  .pin-label {
    font-size: 7.5px;
    font-weight: 500;
    fill: #15261c;
  }
  .chip-text {
    font-size: 7px;
    font-weight: 500;
    fill: #f4f1e6;
  }

  .halo {
    transform-box: fill-box;
    transform-origin: center;
    opacity: 0.35;
    animation: halo 2.2s ease-out infinite;
  }
  @keyframes halo {
    0% {
      transform: scale(0.8);
      opacity: 0.45;
    }
    100% {
      transform: scale(2.3);
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
    transition-delay: calc(var(--i) * 130ms + 150ms);
  }

  @media (prefers-reduced-motion: reduce) {
    .halo {
      animation: none;
      opacity: 0.25;
      transform: scale(1.5);
    }
    .layer,
    .pin,
    .layer.on .pin {
      transition: none;
    }
  }
</style>
