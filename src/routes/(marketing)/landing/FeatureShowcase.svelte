<script lang="ts">
  /**
   * "What it does" — one phone, five features. Picking a feature switches
   * which layers the animated map shows. Cycles on its own until the visitor
   * picks one.
   */
  import { onMount } from "svelte"
  import PhoneMap from "./PhoneMap.svelte"
  import Contours from "./Contours.svelte"
  import { reveal } from "./motion"

  export let id = "features"

  type Feature = {
    title: string
    body: string
    caption: string
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
      title: "Operator tracking",
      body: "Watch every machine on the farm move in real time, from any phone or tablet. No more radioing around to find out who's where.",
      caption: "Operator tracking",
      layers: { boundaries: false, tracking: true, trails: false, pins: false },
    },
    {
      title: "Coverage trails",
      body: "Each pass paints the map as it happens, so the seeder can follow the sprayer and nobody doubles back over finished ground.",
      caption: "Coverage trails",
      layers: { boundaries: false, tracking: true, trails: true, pins: false },
    },
    {
      title: "Pin drops",
      body: "Mark rocks, stumps, water tanks and field bins with one tap. The whole crew sees them straight away.",
      caption: "Pin drops",
      layers: { boundaries: false, tracking: false, trails: false, pins: true },
    },
    {
      title: "Paddock boundaries",
      body: "Upload your existing boundary files in a couple of minutes and everyone works off the same named paddocks.",
      caption: "Paddock boundaries",
      layers: { boundaries: true, tracking: false, trails: false, pins: false },
    },
    {
      title: "Patchy reception",
      body: "Trails keep recording when coverage drops out, and upload on their own once you're back in range.",
      caption: "Background recording",
      layers: { boundaries: true, tracking: true, trails: true, pins: true },
      status: "offline",
    },
  ]

  const DWELL_MS = 5200

  let active = 0
  let auto = false
  let section: HTMLElement
  let timer: ReturnType<typeof setInterval> | undefined

  function stopAuto() {
    auto = false
    clearInterval(timer)
    timer = undefined
  }

  function pick(index: number) {
    stopAuto()
    active = index
  }

  onMount(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

    let userStopped = false
    const stopForGood = () => (userStopped = true)
    section.addEventListener("pointerdown", stopForGood)
    section.addEventListener("keydown", stopForGood)

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !userStopped && !timer) {
          auto = true
          timer = setInterval(() => {
            active = (active + 1) % features.length
          }, DWELL_MS)
        } else if (!entry.isIntersecting && timer) {
          stopAuto()
        }
      },
      { threshold: 0.35 },
    )
    observer.observe(section)

    return () => {
      observer.disconnect()
      stopAuto()
      section?.removeEventListener("pointerdown", stopForGood)
      section?.removeEventListener("keydown", stopForGood)
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
      <div class="phone-wrap">
        <PhoneMap
          {...current.layers}
          status={current.status ?? "live"}
          caption={current.caption}
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
    justify-content: center;
  }
  .phone-wrap {
    width: min(66vw, 280px);
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
      grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
      grid-template-areas:
        "phone head"
        "phone list";
      align-items: start;
      column-gap: clamp(3rem, 7vw, 7rem);
      row-gap: 2.5rem;
    }
    .head {
      grid-area: head;
    }
    .phone-col {
      grid-area: phone;
      align-self: center;
    }
    .phone-wrap {
      width: min(100%, 320px);
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
