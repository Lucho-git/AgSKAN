<script lang="ts">
  /** Season-by-season use cases, each with a small animated map scene. */
  import FieldScene from "./FieldScene.svelte"
  import { reveal } from "./motion"

  export let id = "seasons"

  type Case = {
    kind: "seeding" | "harvest" | "rocks" | "records"
    tag: string
    title: string
    body: string
  }

  const cases: Case[] = [
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
      kind: "records",
      tag: "Contractors",
      title: "Show clients what's done.",
      body: "Every job is kept as a record, paddock by paddock, so clients can see exactly what was covered. Fewer calls asking whether you've finished.",
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
            <FieldScene kind={item.kind} />
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
