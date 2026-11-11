<script lang="ts">
  import { ArrowRight, Phone } from "lucide-svelte"
  import Contours from "./Contours.svelte"
  import PhoneMap from "./PhoneMap.svelte"
  import StoreBadges from "./StoreBadges.svelte"
  import { parallax } from "./motion"
</script>

<section class="lp-hero">
  <Contours depth={0.04} />

  <div class="section-container inner">
    <div class="copy">
      <p class="lp-eyebrow rise" style="--d: 0ms">
        Live farm map · any phone or tablet
      </p>
      <h1 class="rise" style="--d: 70ms">
        One live map for the <span class="mark">whole crew.</span>
      </h1>
      <p class="lp-lede lede rise" style="--d: 140ms">
        See where every operator is, what's been covered and what to steer
        around — live, on the phone that's already in the cab. No hardware to
        buy.
      </p>

      <div class="actions rise" style="--d: 210ms">
        <a href="/login?tab=sign_up" class="lp-btn lp-btn-primary start">
          Start free
          <span class="lp-arrow"><ArrowRight size={18} /></span>
        </a>
        <StoreBadges />
      </div>

      <p class="fine rise" style="--d: 280ms">
        Free account · no card · no expiry
      </p>

      <div class="proof rise" style="--d: 350ms">
        <span class="score">
          <span class="stars" aria-hidden="true">★★★★★</span>
          <span><strong>5.0</strong> on Google</span>
        </span>
        <a href="tel:0439405248" class="call">
          <Phone size={15} />
          0439 405 248
        </a>
      </div>
    </div>

    <div class="stage rise" style="--d: 200ms">
      <div class="glow" aria-hidden="true"></div>

      <div class="float float-a" aria-hidden="true" use:parallax={0.07}>
        <span class="dots">
          <i style="background:#2F62D6"></i>
          <i style="background:#D95D39"></i>
          <i style="background:#15261C"></i>
        </span>
        3 operators live
      </div>

      <div class="phone-wrap">
        <PhoneMap caption="Operator tracking" />
      </div>

      <div class="float float-b" aria-hidden="true" use:parallax={0.13}>
        <span class="pin"></span>
        Rock marked · just now
      </div>
    </div>
  </div>
</section>

<style>
  .lp-hero {
    position: relative;
    overflow: hidden;
    background: var(--lp-paper);
    padding-block: clamp(2.5rem, 6vw, 5rem) clamp(3.5rem, 7vw, 6rem);
  }
  .inner {
    position: relative;
    display: grid;
    align-items: center;
    gap: clamp(2.5rem, 5vw, 4rem);
  }
  @media (min-width: 1024px) {
    .inner {
      grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr);
    }
  }

  h1 {
    margin-top: 1.1rem;
    font-size: clamp(2.7rem, 7.4vw, 5.4rem);
    font-weight: 800;
    line-height: 0.96;
    color: var(--lp-ink);
    text-wrap: balance;
  }
  .mark {
    background: linear-gradient(
      transparent 62%,
      var(--lp-yellow) 62%,
      var(--lp-yellow) 92%,
      transparent 92%
    );
    -webkit-box-decoration-break: clone;
    box-decoration-break: clone;
  }
  :global([data-theme="skanthemedark"]) .mark {
    background: none;
    color: var(--lp-yellow);
  }

  .lede {
    max-width: 34rem;
    margin-top: 1.4rem;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
    margin-top: 2rem;
  }
  .start {
    min-width: 11.5rem;
    font-size: 1.1rem;
  }
  .fine {
    margin-top: 0.9rem;
    font-family: var(--lp-mono);
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    color: var(--lp-ink-faint);
  }

  .proof {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem 1.75rem;
    margin-top: 2rem;
    padding-top: 1.4rem;
    border-top: 1px solid var(--lp-line);
    font-size: 0.95rem;
    color: var(--lp-ink-soft);
  }
  .score {
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
  }
  .stars {
    color: #e2a400;
    letter-spacing: 0.08em;
  }
  .score strong {
    color: var(--lp-ink);
  }
  .call {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    font-weight: 600;
    color: var(--lp-ink);
  }
  .call:hover {
    text-decoration: underline;
  }

  /* Phone stage */
  .stage {
    position: relative;
    display: flex;
    justify-content: center;
  }
  .phone-wrap {
    position: relative;
    width: min(74vw, 300px);
  }
  .glow {
    position: absolute;
    top: 12%;
    left: 50%;
    width: min(120%, 520px);
    aspect-ratio: 1;
    border-radius: 50%;
    background: radial-gradient(
      closest-side,
      rgba(247, 219, 92, 0.38),
      rgba(247, 219, 92, 0)
    );
    transform: translateX(-50%);
  }

  .float {
    position: absolute;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 0.55rem;
    padding: 0.6rem 0.9rem;
    border: 1px solid rgba(21, 38, 28, 0.08);
    border-radius: 999px;
    background: #fbf9f2;
    color: #15261c;
    font-size: 0.8rem;
    font-weight: 600;
    white-space: nowrap;
    box-shadow: 0 14px 30px -14px rgba(10, 25, 15, 0.5);
  }
  .float-a {
    top: 16%;
    right: max(0px, calc(50% - 235px));
  }
  .float-b {
    bottom: 22%;
    left: max(0px, calc(50% - 250px));
  }
  .dots {
    display: inline-flex;
  }
  .dots i {
    width: 11px;
    height: 11px;
    margin-left: -3px;
    border: 2px solid #fbf9f2;
    border-radius: 50%;
  }
  .dots i:first-child {
    margin-left: 0;
  }
  .pin {
    width: 10px;
    height: 10px;
    border: 2.5px solid #15261c;
    border-radius: 50%;
    background: #f7db5c;
  }

  /* Entrance */
  .rise {
    animation: rise 0.8s cubic-bezier(0.2, 0.7, 0.2, 1) both;
    animation-delay: var(--d, 0ms);
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(18px);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .rise {
      animation: none;
    }
  }
</style>
