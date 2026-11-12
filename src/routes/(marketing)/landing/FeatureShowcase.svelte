<script lang="ts">
  /**
   * "What it does" — one device, one continuous seeding job, told in five
   * steps. Each step ADDS to the map (paddocks, then machines, then their
   * trails, then pins) so nothing pops in and out as you move through it.
   *
   * While it plays on its own the steps are locked to the map's loop: the
   * loop is exactly five steps long and restarts with step one, so the ute
   * reaches the rocks just as the pins step comes up. Picking a step by hand
   * stops the auto-play and leaves the map running.
   */
  import { onMount } from "svelte"
  import DeviceMap from "./DeviceMap.svelte"
  import DeviceSwitch from "./DeviceSwitch.svelte"
  import Contours from "./Contours.svelte"
  import { reveal, type Leg } from "./motion"

  export let id = "features"

  type Feature = {
    title: string
    body: string
    layers: {
      boundaries: boolean
      tracking: boolean
      trails: boolean
      pins: boolean
    }
    status?: "live" | "offline"
  }

  const features: Feature[] = [
    {
      title: "Paddock boundaries",
      body: "Upload your existing boundary files in a couple of minutes and everyone works off the same named paddocks.",
      layers: { boundaries: true, tracking: false, trails: false, pins: false },
    },
    {
      title: "Operator tracking",
      body: "Watch every machine on the farm move in real time, from any phone or tablet. No more radioing around to find out who's where.",
      layers: { boundaries: true, tracking: true, trails: false, pins: false },
    },
    {
      title: "Coverage trails",
      body: "Each pass paints the map as it happens, so the seeder can follow the sprayer and nobody doubles back over finished ground.",
      layers: { boundaries: true, tracking: true, trails: true, pins: false },
    },
    {
      title: "Pin drops",
      body: "Mark rocks, stumps, gates and field bins with one tap. The whole crew sees them straight away, and a picked rock comes off the map for everyone.",
      layers: { boundaries: true, tracking: true, trails: true, pins: true },
    },
    {
      title: "Patchy reception",
      body: "Trails keep recording when coverage drops out, and upload on their own once you're back in range.",
      layers: { boundaries: true, tracking: true, trails: true, pins: true },
      status: "offline",
    },
  ]

  const DWELL_MS = 6000
  const LOOP_S = (DWELL_MS * features.length) / 1000

  // The ute's part, in loop fractions (one step = 0.2): it sets off as
  // tracking comes on, waits at the gate through the trails step, then
  // collects the three rocks during the pins step.
  const UTE_DEPART = 0.22
  const UTE_LEGS: Leg[] = [
    { arrive: 0.36, pause: 0.25 },
    { arrive: 0.635, pause: 0.03 },
    { arrive: 0.7, pause: 0.03 },
    { arrive: 0.765, pause: 0.03 },
  ]

  let active = 0
  let auto = false
  let epoch = 0
  let section: HTMLElement
  let timer: ReturnType<typeof setInterval> | undefined
  let userPicked = false

  function stopAuto() {
    auto = false
    clearInterval(timer)
    timer = undefined
  }

  function startAuto() {
    auto = true
    active = 0
    epoch += 1 // restart the map's loop alongside step one
    timer = setInterval(() => {
      active = (active + 1) % features.length
      if (active === 0) epoch += 1
    }, DWELL_MS)
  }

  function pick(index: number) {
    userPicked = true
    stopAuto()
    active = index
  }

  onMount(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // No auto-play: show the full map rather than an empty first step.
      active = 3
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !userPicked && !timer) startAuto()
        else if (!entry.isIntersecting && timer) stopAuto()
      },
      { threshold: 0.35 },
    )
    observer.observe(section)

    return () => {
      observer.disconnect()
      stopAuto()
    }
  })

  $: current = features[active]
</script>

<section {id} class="lp-section showcase" bind:this={section}>
  <Contours depth={0.05} flip />

  <div class="section-container inner">
    <header class="head" use:reveal>
      <p class="lp-eyebrow">What it does</p>
      <h2 class="lp-h2">Everything on the paddock, at a glance.</h2>
    </header>

    <div class="phone-col" use:reveal={80}>
      <DeviceSwitch />
      <div class="phone-wrap">
        <DeviceMap
          {...current.layers}
          scene="seeding"
          truck={false}
          loop={LOOP_S}
          uteDepart={UTE_DEPART}
          uteLegs={UTE_LEGS}
          {epoch}
          status={current.status ?? "live"}
        />
      </div>
    </div>

    <div class="list-col" use:reveal={140}>
      <!-- Mobile: pills + one description -->
      <div class="pills" role="tablist" aria-label="AgSKAN features">
        {#each features as feature, i}
          <button
            type="button"
            role="tab"
            aria-selected={i === active}
            class="pill"
            class:active={i === active}
            on:click={() => pick(i)}
          >
            {feature.title}
          </button>
        {/each}
      </div>
      <p class="pill-body" aria-live="polite">{current.body}</p>

      <!-- Desktop: full list -->
      <ol class="list">
        {#each features as feature, i}
          <li>
            <button
              type="button"
              class="item"
              class:active={i === active}
              aria-pressed={i === active}
              on:click={() => pick(i)}
            >
              <span class="num">0{i + 1}</span>
              <span class="text">
                <span class="title">{feature.title}</span>
                <span class="body">{feature.body}</span>
              </span>
              {#if i === active && auto}
                <span class="bar" style="--dwell: {DWELL_MS}ms"></span>
              {/if}
            </button>
          </li>
        {/each}
      </ol>
    </div>
  </div>
</section>

<style>
  .showcase {
    overflow: hidden;
    background: var(--lp-paper-2);
  }
  .inner {
    position: relative;
    display: grid;
    gap: 2rem;
  }
  .head {
    max-width: 40rem;
  }
  .head h2 {
    margin-top: 0.9rem;
  }
  .phone-col {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.25rem;
  }
  .phone-wrap {
    width: 100%;
  }

  /* Mobile pills */
  .pills {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.5rem;
  }
  .pill {
    min-height: 2.75rem;
    padding: 0.5rem 0.95rem;
    border: 1.5px solid var(--lp-line);
    border-radius: 999px;
    font-size: 0.88rem;
    font-weight: 600;
    color: var(--lp-ink-soft);
    transition:
      background-color 0.2s ease,
      color 0.2s ease,
      border-color 0.2s ease;
  }
  .pill.active {
    border-color: #15261c;
    background: #15261c;
    color: #f4f1e6;
  }
  :global([data-theme="skanthemedark"]) .pill.active {
    border-color: var(--lp-yellow);
    background: var(--lp-yellow);
    color: #15261c;
  }
  .pill-body {
    min-height: 5.5em;
    margin-top: 1.1rem;
    font-size: 1.02rem;
    line-height: 1.55;
    text-align: center;
    color: var(--lp-ink-soft);
  }
  .list {
    display: none;
  }

  @media (min-width: 1024px) {
    .inner {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      grid-template-areas:
        "phone head"
        "phone list";
      align-items: start;
      column-gap: clamp(2.5rem, 5vw, 5rem);
      row-gap: 2.5rem;
    }
    .head {
      grid-area: head;
    }
    .phone-col {
      grid-area: phone;
      align-self: center;
    }
    .phone-col {
      min-height: 640px;
      justify-content: center;
    }
    .list-col {
      grid-area: list;
    }
    .pills,
    .pill-body {
      display: none;
    }
    .list {
      display: block;
      border-top: 1px solid var(--lp-line);
    }
  }

  .item {
    position: relative;
    display: flex;
    width: 100%;
    gap: 1.25rem;
    padding: 1.15rem 0.25rem;
    border-bottom: 1px solid var(--lp-line);
    text-align: left;
    color: var(--lp-ink-faint);
    transition: color 0.25s ease;
  }
  .item:hover,
  .item.active {
    color: var(--lp-ink);
  }
  .num {
    padding-top: 0.3rem;
    font-family: var(--lp-mono);
    font-size: 0.75rem;
    letter-spacing: 0.1em;
  }
  .text {
    display: grid;
    flex: 1;
  }
  .title {
    font-family: var(--lp-display);
    font-size: 1.5rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1.15;
  }
  .body {
    display: block;
    overflow: hidden;
    max-width: 34rem;
    font-size: 1rem;
    line-height: 1.55;
    color: var(--lp-ink-soft);
    opacity: 0;
    transition:
      max-height 0.4s ease,
      opacity 0.3s ease,
      margin-top 0.4s ease;
    max-height: 0;
  }
  .item.active .body {
    max-height: 8em;
    margin-top: 0.5rem;
    opacity: 1;
  }
  .bar {
    position: absolute;
    bottom: -1px;
    left: 0;
    height: 2px;
    width: 100%;
    background: var(--lp-accent-text);
    transform-origin: left;
    animation: progress var(--dwell) linear both;
  }
  @keyframes progress {
    from {
      transform: scaleX(0);
    }
  }
  .item:focus-visible,
  .pill:focus-visible {
    outline: 2px solid var(--lp-accent-text);
    outline-offset: 3px;
  }

  @media (prefers-reduced-motion: reduce) {
    .body,
    .item,
    .pill {
      transition: none;
    }
  }
</style>
