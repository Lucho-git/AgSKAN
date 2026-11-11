<script lang="ts">
  /** Before/after band: radio chatter vs. one shared map. */
  import { Check, X } from "lucide-svelte"
  import Contours from "./Contours.svelte"
  import { reveal } from "./motion"

  const before = [
    "Constant radio check-ins",
    "Wasted time and fuel on overlap",
    "No way to know what's been covered",
  ]
  const after = [
    "Real-time visibility of all operators",
    "Live tracking shows completed areas",
    "Instant hazard alerts to the whole team",
  ]
</script>

<section class="lp-section lp-band band" id="problem-solution">
  <Contours depth={0.06} />

  <div class="section-container inner">
    <header use:reveal>
      <p class="lp-eyebrow">Why crews switch</p>
      <h2 class="lp-h2">
        From radio chatter to <span class="accent">one clear picture.</span>
      </h2>
      <p class="lp-lede lede">
        Spraying. Seeding. Harvest. It gets messy fast — chasing updates,
        juggling phone calls and hoping no one's doubled back on a paddock.
        AgSKAN puts where everyone is, what's done and what's next on one map.
      </p>
    </header>

    <div class="cols">
      <div class="col" use:reveal={80}>
        <p class="lp-eyebrow">Without it</p>
        <ul>
          {#each before as item}
            <li class="was">
              <span class="icon no"><X size={15} strokeWidth={3} /></span>
              {item}
            </li>
          {/each}
        </ul>
      </div>
      <div class="col with" use:reveal={160}>
        <p class="lp-eyebrow">With AgSKAN</p>
        <ul>
          {#each after as item}
            <li>
              <span class="icon yes"><Check size={15} strokeWidth={3} /></span>
              {item}
            </li>
          {/each}
        </ul>
      </div>
    </div>
  </div>
</section>

<style>
  .band {
    overflow: hidden;
  }
  .inner {
    position: relative;
    display: grid;
    gap: clamp(2.5rem, 5vw, 4rem);
  }
  @media (min-width: 1024px) {
    .inner {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      align-items: end;
    }
  }
  h2 {
    margin-top: 0.9rem;
  }
  .accent {
    color: var(--lp-yellow);
  }
  .lede {
    max-width: 34rem;
    margin-top: 1.4rem;
  }

  .cols {
    display: grid;
    gap: 1rem;
  }
  @media (min-width: 640px) {
    .cols {
      grid-template-columns: 1fr 1fr;
    }
  }
  .col {
    padding: 1.5rem;
    border: 1px solid var(--lp-band-line);
    border-radius: 1.25rem;
  }
  .col.with {
    border-color: transparent;
    background: var(--lp-band-2);
  }
  ul {
    display: grid;
    gap: 0.95rem;
    margin-top: 1.25rem;
  }
  li {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    font-size: 1.02rem;
    font-weight: 600;
    line-height: 1.35;
  }
  li.was {
    font-weight: 500;
    color: var(--lp-band-soft);
  }
  .icon {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 50%;
  }
  .icon.no {
    background: rgba(217, 93, 57, 0.2);
    color: #f08e6e;
  }
  .icon.yes {
    background: var(--lp-yellow);
    color: #15261c;
  }
</style>
