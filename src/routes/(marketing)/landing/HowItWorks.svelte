<script lang="ts">
  /** Three-step setup + the "How AgSKAN works" walkthrough video. */
  import { ArrowRight, Play } from "lucide-svelte"
  import { reveal } from "./motion"

  export let id = "setup"

  const VIDEO_ID = "FEoL4K-GXWs"
  let showVideo = false

  const steps = [
    {
      title: "Download the app",
      body: "Install AgSKAN on any phone or tablet. Mount a tablet in the cab for all-day tracking.",
    },
    {
      title: "Add your farm and your crew",
      body: "Upload your paddock boundaries and share your map link. Everyone sees the same map, live.",
    },
    {
      title: "Track the job in real time",
      body: "Know where people are, what's been done and what's next, all season.",
    },
  ]
</script>

<section {id} class="lp-section setup">
  <div class="section-container inner">
    <div class="left">
      <header use:reveal>
        <p class="lp-eyebrow">Set up in minutes</p>
        <h2 class="lp-h2">Three steps, then you're tracking.</h2>
      </header>

      <ol class="step-list">
        {#each steps as step, i}
          <li use:reveal={i * 80}>
            <span class="num">0{i + 1}</span>
            <div>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </div>
          </li>
        {/each}
      </ol>

      <div use:reveal={120}>
        <a href="/login?tab=sign_up" class="lp-btn lp-btn-primary">
          Set up my farm
          <span class="lp-arrow"><ArrowRight size={18} /></span>
        </a>
      </div>
    </div>

    <div class="video" use:reveal={120}>
      {#if showVideo}
        <iframe
          src="https://www.youtube-nocookie.com/embed/{VIDEO_ID}?autoplay=1"
          title="How AgSKAN works"
          frameborder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerpolicy="strict-origin-when-cross-origin"
          allowfullscreen
        ></iframe>
      {:else}
        <button
          type="button"
          class="poster"
          on:click={() => (showVideo = true)}
          aria-label="Play video: How AgSKAN works"
        >
          <img
            src="https://img.youtube.com/vi/{VIDEO_ID}/maxresdefault.jpg"
            alt=""
            loading="lazy"
          />
          <span class="shade"></span>
          <span class="play"><Play size={24} /></span>
          <span class="cap">
            <span class="lp-eyebrow">Watch</span>
            How AgSKAN works
          </span>
        </button>
      {/if}
    </div>
  </div>
</section>

<style>
  .setup {
    background: var(--lp-paper-2);
  }
  .inner {
    display: grid;
    gap: clamp(2.5rem, 5vw, 4.5rem);
    align-items: center;
  }
  @media (min-width: 1024px) {
    .inner {
      grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
    }
  }
  h2 {
    margin-top: 0.9rem;
  }
  .step-list {
    margin: 2rem 0 2.25rem;
    border-top: 1px solid var(--lp-line);
  }
  .step-list li {
    display: flex;
    gap: 1.25rem;
    padding: 1.25rem 0;
    border-bottom: 1px solid var(--lp-line);
  }
  .num {
    padding-top: 0.25rem;
    font-family: var(--lp-mono);
    font-size: 0.75rem;
    letter-spacing: 0.1em;
    color: var(--lp-accent-text);
  }
  .step-list h3 {
    font-size: 1.3rem;
    font-weight: 700;
    line-height: 1.2;
    color: var(--lp-ink);
  }
  .step-list p {
    max-width: 30rem;
    margin-top: 0.35rem;
    line-height: 1.55;
    color: var(--lp-ink-soft);
  }

  .video {
    overflow: hidden;
    aspect-ratio: 16 / 9;
    border-radius: 1.4rem;
    background: #15261c;
    box-shadow: 0 40px 70px -40px rgba(10, 25, 15, 0.6);
  }
  iframe {
    width: 100%;
    height: 100%;
  }
  .poster {
    position: relative;
    display: block;
    width: 100%;
    height: 100%;
  }
  .poster img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.6s ease;
  }
  .poster:hover img {
    transform: scale(1.03);
  }
  .shade {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      to top,
      rgba(13, 22, 17, 0.8),
      rgba(13, 22, 17, 0.05) 60%
    );
  }
  .play {
    position: absolute;
    top: 50%;
    left: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 4.5rem;
    height: 4.5rem;
    padding-left: 4px;
    border-radius: 50%;
    background: var(--lp-yellow);
    color: #15261c;
    transform: translate(-50%, -50%);
    transition: transform 0.25s ease;
  }
  .poster:hover .play {
    transform: translate(-50%, -50%) scale(1.08);
  }
  .cap {
    position: absolute;
    bottom: 1.25rem;
    left: 1.5rem;
    display: grid;
    gap: 0.2rem;
    text-align: left;
    font-family: var(--lp-display);
    font-size: 1.25rem;
    font-weight: 700;
    color: #f4f1e6;
  }
  .cap .lp-eyebrow {
    color: rgba(244, 241, 230, 0.7);
  }
  @media (prefers-reduced-motion: reduce) {
    .poster img,
    .play {
      transition: none;
    }
  }
</style>
