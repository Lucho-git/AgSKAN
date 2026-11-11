<script lang="ts">
  /** Closing sign-up band. */
  import { ArrowRight, Phone } from "lucide-svelte"
  import Contours from "./Contours.svelte"
  import StoreBadges from "./StoreBadges.svelte"
  import { reveal } from "./motion"
</script>

<section class="lp-section lp-band cta">
  <Contours depth={0.06} flip />

  <div class="section-container inner" use:reveal>
    <p class="lp-eyebrow">Start today</p>
    <h2>Get your crew on the map.</h2>
    <p class="lp-lede lede">
      Start on a free account, add your paddocks and invite the team when you're
      ready. No card, no hardware, no expiry.
    </p>

    <div class="actions">
      <a href="/login?tab=sign_up" class="lp-btn lp-btn-primary start">
        Start free
        <span class="lp-arrow"><ArrowRight size={18} /></span>
      </a>
      <StoreBadges />
    </div>

    <p class="call">
      Rather talk it through?
      <a href="tel:0439405248"><Phone size={15} /> 0439 405 248</a>
    </p>
  </div>
</section>

<style>
  .cta {
    overflow: hidden;
  }
  .inner {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }
  h2 {
    max-width: 14ch;
    margin-top: 1rem;
    font-size: clamp(2.6rem, 7vw, 5.2rem);
    font-weight: 800;
    line-height: 0.96;
    text-wrap: balance;
  }
  .lede {
    max-width: 34rem;
    margin-top: 1.4rem;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    margin-top: 2.25rem;
  }
  .actions :global(.badges) {
    justify-content: center;
  }
  .start {
    min-width: 11.5rem;
    font-size: 1.1rem;
  }
  .call {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 0.4rem 0.75rem;
    margin-top: 2rem;
    font-size: 0.95rem;
    color: var(--lp-band-soft);
  }
  .call a {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-weight: 700;
    color: var(--lp-band-text);
  }
  .call a:hover {
    text-decoration: underline;
  }
</style>
