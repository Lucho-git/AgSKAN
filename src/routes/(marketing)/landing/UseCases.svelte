<script lang="ts">
  /** Season-by-season use cases, each with a small map vignette. */
  import { reveal } from "./motion"

  export let id = "seasons"

  const cases = [
    {
      kind: "seeding",
      tag: "Spraying & seeding",
      title: "Seed only what's been sprayed.",
      body: "The sprayer paints a live map of what's done. The seeder follows it, and fill-up spots are pinned for the whole crew.",
    },
    {
      kind: "harvest",
      tag: "Harvest",
      title: "Find the header without a radio call.",
      body: "Chaser bin drivers see every header on the map. Field bins are pinned where truck drivers can find them.",
    },
    {
      kind: "rocks",
      tag: "Rock & stump picking",
      title: "One tap marks it for everyone.",
      body: "Drop a pin on a rock or stump from any cab. The whole crew sees it live, and the picker knows exactly where to go.",
    },
    {
      kind: "contract",
      tag: "Contractors",
      title: "Show clients what's done.",
      body: "Clients see the job as it happens, so there are fewer calls asking whether you've finished their paddock.",
    },
  ]
</script>

<section {id} class="lp-section cases">
  <div class="section-container">
    <header class="head" use:reveal>
      <p class="lp-eyebrow">All season</p>
      <h2 class="lp-h2">Built for the jobs that get messy.</h2>
    </header>

    <div class="grid">
      {#each cases as item, i}
        <article class="tile" use:reveal={i * 70}>
          <div class="scene" aria-hidden="true">
            <svg viewBox="0 0 160 100" preserveAspectRatio="xMidYMid slice">
              {#if item.kind === "seeding"}
                <rect width="160" height="100" fill="#D8B04A" />
                <path
                  d="M-5,20 H165 M-5,36 H165 M-5,52 H112"
                  stroke="#2F62D6"
                  stroke-width="12"
                  opacity="0.6"
                  fill="none"
                />
                <path
                  d="M-5,20 H165 M-5,36 H70"
                  stroke="#15261C"
                  stroke-width="4"
                  stroke-dasharray="2 5"
                  opacity="0.55"
                  fill="none"
                />
                <circle cx="112" cy="52" r="7" fill="#fff" /><circle
                  cx="112"
                  cy="52"
                  r="4.5"
                  fill="#2F62D6"
                />
                <circle cx="70" cy="36" r="7" fill="#fff" /><circle
                  cx="70"
                  cy="36"
                  r="4.5"
                  fill="#15261C"
                />
              {:else if item.kind === "harvest"}
                <rect width="160" height="100" fill="#DDB955" />
                <path
                  d="M26,105 V-5 M42,105 V-5 M58,105 V38"
                  stroke="#D95D39"
                  stroke-width="13"
                  opacity="0.6"
                  fill="none"
                />
                <circle cx="58" cy="38" r="7" fill="#fff" /><circle
                  cx="58"
                  cy="38"
                  r="4.5"
                  fill="#D95D39"
                />
                <circle cx="78" cy="46" r="7" fill="#fff" /><circle
                  cx="78"
                  cy="46"
                  r="4.5"
                  fill="#2F62D6"
                />
                <path
                  d="M84,50 Q112,66 124,62"
                  stroke="#15261C"
                  stroke-width="1.6"
                  stroke-dasharray="3 3"
                  fill="none"
                  opacity="0.6"
                />
                <circle
                  cx="130"
                  cy="60"
                  r="9"
                  fill="#fff"
                  stroke="#15261C"
                  stroke-width="1.8"
                />
                <path
                  d="M126,63.5 V59 L130,55.5 L134,59 V63.5 Z"
                  fill="#D95D39"
                />
              {:else if item.kind === "rocks"}
                <rect width="160" height="100" fill="#6E9B5C" />
                <path
                  d="M22,78 L52,34 L92,62 L128,26"
                  stroke="#fff"
                  stroke-width="1.8"
                  stroke-dasharray="4 4"
                  fill="none"
                  opacity="0.85"
                />
                {#each [[52, 34], [92, 62], [128, 26]] as [cx, cy]}
                  <circle
                    {cx}
                    {cy}
                    r="9"
                    fill="#fff"
                    stroke="#15261C"
                    stroke-width="1.8"
                  />
                  <path
                    d="M-4,2 L-3,-2.5 L1,-4 L4,-1 L3,3 L-1.5,4 Z"
                    transform="translate({cx} {cy})"
                    fill="#6B6F6B"
                  />
                {/each}
                <circle cx="22" cy="78" r="7" fill="#fff" /><circle
                  cx="22"
                  cy="78"
                  r="4.5"
                  fill="#15261C"
                />
              {:else}
                <rect width="160" height="100" fill="#4E8153" />
                <path
                  d="M-5,18 H165 M-5,34 H165 M-5,50 H165 M-5,66 H165 M-5,82 H165"
                  stroke="#F2A277"
                  stroke-width="12"
                  opacity="0.55"
                  fill="none"
                />
                <circle cx="80" cy="50" r="17" fill="#fbf9f2" />
                <path
                  d="M72,50.5 L78,56.5 L89,44.5"
                  stroke="#15261C"
                  stroke-width="3.4"
                  fill="none"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              {/if}
            </svg>
          </div>
          <p class="lp-eyebrow tag">{item.tag}</p>
          <h3>{item.title}</h3>
          <p class="body">{item.body}</p>
        </article>
      {/each}
    </div>
  </div>
</section>

<style>
  .cases {
    background: var(--lp-paper);
  }
  .head {
    max-width: 44rem;
  }
  .head h2 {
    margin-top: 0.9rem;
  }
  .grid {
    display: grid;
    gap: 1rem;
    margin-top: clamp(2rem, 4vw, 3.5rem);
  }
  @media (min-width: 640px) {
    .grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (min-width: 1180px) {
    .grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }
  .tile {
    display: flex;
    flex-direction: column;
    padding: 0.75rem 0.75rem 1.5rem;
    border: 1px solid var(--lp-line);
    border-radius: 1.4rem;
    background: var(--lp-card);
  }
  .scene {
    overflow: hidden;
    aspect-ratio: 16 / 10;
    border-radius: 0.9rem;
  }
  .scene svg {
    display: block;
    width: 100%;
    height: 100%;
  }
  .tag {
    margin: 1.25rem 0.5rem 0;
    color: var(--lp-accent-text);
  }
  h3 {
    margin: 0.55rem 0.5rem 0;
    font-size: 1.4rem;
    font-weight: 700;
    line-height: 1.12;
    color: var(--lp-ink);
    text-wrap: balance;
  }
  .body {
    margin: 0.65rem 0.5rem 0;
    font-size: 0.97rem;
    line-height: 1.55;
    color: var(--lp-ink-soft);
  }
</style>
