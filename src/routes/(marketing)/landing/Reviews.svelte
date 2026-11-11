<script lang="ts">
  /** Farmer reviews (verbatim), with an optional video for one of them. */
  import { Play, X } from "lucide-svelte"
  import { reveal } from "./motion"

  export let id = "testimonials"

  const reviews = [
    {
      name: "Kieran Popplewell",
      position: "6,000ha operation · Moora, WA",
      quote:
        "We saved hours every day once the whole crew was on AgSKAN. I just look at the map and know exactly what's going on.",
      image: "/content/reviews/KieranPoppelwell.png",
    },
    {
      name: "Adam Smith",
      position: "3,500ha operation · Northam",
      quote:
        "You've single-handedly made seeding half as stressful. Working flawlessly. Well done to you and Lachie",
      image: "/content/reviews/AdamSmith.png",
      videoUrl: "/content/reviews/Lingy.mp4",
    },
    {
      name: "Harry Brown",
      position: "Browns Ag Spraying · Gnowangerup, WA",
      quote:
        "Game changer for contractors. My clients can see exactly what I've done in real-time. No more calls asking if I've finished their paddock.",
      image: "/content/reviews/HarryBrown.png",
    },
    {
      name: "Gary Guelfi",
      position: "Mixed crop · Gnowangerup",
      quote:
        "Easy to on-board new users, fast to load, easy to access at most times, anyone with a phone can be navigating around the farm in minutes.",
      image: "/content/reviews/GaryGuifelli.JPG",
    },
  ]

  let videoUrl: string | null = null

  function onKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") videoUrl = null
  }
</script>

<svelte:window on:keydown={onKeydown} />

<section {id} class="lp-section reviews">
  <div class="section-container">
    <header class="head" use:reveal>
      <div>
        <p class="lp-eyebrow">From the paddock</p>
        <h2 class="lp-h2">Farmers who've put it to work.</h2>
      </div>
      <p class="score">
        <span class="stars" aria-hidden="true">★★★★★</span>
        <span><strong>5.0</strong> on Google reviews</span>
      </p>
    </header>

    <div class="grid">
      {#each reviews as review, i}
        <figure class="tile" class:feature={i === 0} use:reveal={i * 70}>
          <blockquote>“{review.quote}”</blockquote>
          <figcaption>
            <img src={review.image} alt="" loading="lazy" />
            <span class="who">
              <strong>{review.name}</strong>
              <span>{review.position}</span>
            </span>
            {#if review.videoUrl}
              <button
                type="button"
                class="watch"
                on:click={() => (videoUrl = review.videoUrl ?? null)}
              >
                <Play size={14} />
                Watch
              </button>
            {/if}
          </figcaption>
        </figure>
      {/each}
    </div>
  </div>
</section>

{#if videoUrl}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="video-modal" on:click={() => (videoUrl = null)}>
    <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
    <div class="video-inner" on:click|stopPropagation>
      <button
        type="button"
        class="close"
        aria-label="Close video"
        on:click={() => (videoUrl = null)}
      >
        <X size={20} />
      </button>
      <!-- svelte-ignore a11y-media-has-caption -->
      <video src={videoUrl} controls autoplay playsinline></video>
    </div>
  </div>
{/if}

<style>
  .reviews {
    background: var(--lp-paper);
  }
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: 1.25rem 2rem;
  }
  .head h2 {
    margin-top: 0.9rem;
  }
  .score {
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.6rem 1rem;
    border: 1px solid var(--lp-line);
    border-radius: 999px;
    font-size: 0.92rem;
    color: var(--lp-ink-soft);
  }
  .score strong {
    color: var(--lp-ink);
  }
  .stars {
    color: #e2a400;
    letter-spacing: 0.08em;
  }

  .grid {
    display: grid;
    gap: 1rem;
    margin-top: clamp(2rem, 4vw, 3.5rem);
  }
  @media (min-width: 768px) {
    .grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (min-width: 1180px) {
    .grid {
      grid-template-columns: 1.25fr 1fr 1fr;
    }
    .tile.feature {
      grid-row: span 2;
    }
    .tile:last-child {
      grid-column: span 2;
    }
  }

  .tile {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 1.75rem;
    padding: clamp(1.4rem, 2.4vw, 2rem);
    border: 1px solid var(--lp-line);
    border-radius: 1.4rem;
    background: var(--lp-card);
  }
  .tile.feature {
    border-color: transparent;
    background: #15261c;
    color: #f4f1e6;
  }
  :global([data-theme="skanthemedark"]) .tile.feature {
    background: var(--lp-yellow);
    color: #15261c;
  }
  blockquote {
    font-size: 1.08rem;
    line-height: 1.5;
    color: var(--lp-ink);
    text-wrap: pretty;
  }
  .tile.feature blockquote {
    font-family: var(--lp-display);
    font-size: clamp(1.5rem, 2.4vw, 2.1rem);
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1.14;
    color: inherit;
  }
  figcaption {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.8rem;
  }
  img {
    width: 2.9rem;
    height: 2.9rem;
    flex-shrink: 0;
    border-radius: 50%;
    object-fit: cover;
  }
  .who {
    display: grid;
    flex: 1;
    min-width: 9.5rem;
    font-size: 0.86rem;
    line-height: 1.35;
    color: var(--lp-ink-faint);
  }
  .who strong {
    font-size: 0.98rem;
    color: var(--lp-ink);
  }
  .tile.feature .who,
  .tile.feature .who strong {
    color: inherit;
  }
  .tile.feature .who span {
    opacity: 0.7;
  }
  .watch {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    min-height: 2.75rem;
    padding: 0.4rem 0.95rem;
    border: 1.5px solid var(--lp-line);
    border-radius: 999px;
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--lp-ink);
  }
  .watch:hover {
    border-color: var(--lp-ink);
  }

  .video-modal {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    background: rgba(8, 14, 10, 0.86);
  }
  .video-inner {
    position: relative;
    width: 100%;
    max-width: 56rem;
  }
  video {
    width: 100%;
    max-height: 82vh;
    border-radius: 1rem;
    background: #000;
  }
  .close {
    position: absolute;
    top: -3.25rem;
    right: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.75rem;
    height: 2.75rem;
    border-radius: 50%;
    background: #f4f1e6;
    color: #15261c;
  }
</style>
