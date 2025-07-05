<script lang="ts">
  import { ArrowRight, Play, Quote, X } from "lucide-svelte"
  import { onMount } from "svelte"
  import { goto } from "$app/navigation"

  let mounted = false
  let activeVideo: number | null = null
  let videoRefs: HTMLVideoElement[] = []
  let showToast = false

  onMount(() => {
    mounted = true
  })

  const testimonials = [
    {
      name: "Kieran Popplewell",
      position: "Broadacre Farmer, WA",
      quote:
        "We saved hours every day once the whole crew was on AgSKAN. I just look at the map and know exactly what's going on.",
      image: "/content/reviews/KieranPoppelwell.JPG",
      hasVideo: false,
    },
    {
      name: "Gary Guelfi",
      position: "Mixed Crop, VIC",
      quote:
        "Easy to on-board new users, fast to load, easy to access at most times, anyone with a phone can be navigating around the farm in minutes.",
      image: "/content/reviews/GaryGuifelli.JPG",
      hasVideo: false,
    },
    {
      name: "Adam Smith",
      position: "3,500ha Operation, NSW",
      quote:
        "You've single-handedly made seeding half as stressful. Working flawlessly. Well done to you and Lachie",
      image: "/content/reviews/AdamSmith.JPG",
      hasVideo: true,
      videoUrl: "/content/reviews/Lingy.mp4",
    },
  ]

  function toggleVideo(index: number) {
    if (activeVideo === index) {
      activeVideo = null
      // Pause video when closing
      if (testimonials[index].hasVideo && videoRefs[index]) {
        videoRefs[index].pause()
        videoRefs[index].currentTime = 0
      }
    } else {
      activeVideo = index
      // Auto-play video when opening (if it's a video testimonial)
      if (testimonials[index].hasVideo && videoRefs[index]) {
        setTimeout(() => {
          videoRefs[index].play()
        }, 100)
      }
    }
  }

  function handleWallOfLoveClick() {
    showToast = true
    setTimeout(() => {
      showToast = false
    }, 3000) // Hide toast after 3 seconds
  }

  // Animation delay placeholder
  function animationDelay(node: HTMLElement, delay: number) {
    return {
      delay,
      duration: 600,
      css: (t: number) => `
        opacity: ${t};
        transform: translateY(${(1 - t) * 20}px);
      `,
    }
  }

  // Fade in animation for video
  function fadeIn(node: HTMLElement) {
    return {
      duration: 300,
      css: (t: number) => `
        opacity: ${t};
        transform: scale(${0.9 + t * 0.1});
      `,
    }
  }

  // Toast animation
  function toastSlide(node: HTMLElement) {
    return {
      duration: 300,
      css: (t: number) => `
        opacity: ${t};
        transform: translateX(${(1 - t) * 100}%);
      `,
    }
  }
</script>

<section class="bg-base-100" id="testimonials">
  <div class="section-container py-20">
    {#if mounted}
      <div in:animationDelay={0}>
        <h2
          class="mb-6 text-center font-sans text-3xl font-bold text-contrast-content md:text-4xl"
        >
          Hear It From the <span class="text-base-content">Paddock</span>
        </h2>

        <p
          class="mx-auto mb-10 max-w-2xl text-center text-lg text-contrast-content/70"
        >
          Real farmers. Real results. Real time saved.
        </p>

        <div class="mt-8 grid gap-6 md:grid-cols-3">
          {#each testimonials as testimonial, index}
            <div
              class="relative rounded-xl bg-base-200 p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md"
              in:animationDelay={100 + index * 100}
            >
              <div
                class="absolute -left-4 -top-4 flex h-8 w-8 items-center justify-center rounded-full bg-base-content text-base-100"
              >
                <Quote size={16} />
              </div>

              <!-- 5-star rating -->
              <div class="mb-4 flex items-center gap-1">
                {#each Array(5) as _, star}
                  <svg
                    class="h-5 w-5 fill-current text-secondary"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"
                    />
                  </svg>
                {/each}
              </div>

              <p class="mb-6 italic text-contrast-content/80">
                "{testimonial.quote}"
              </p>

              <div class="flex items-center gap-4">
                <div class="h-12 w-12 overflow-hidden rounded-full">
                  <img
                    src={testimonial.image}
                    alt={testimonial.name}
                    class="h-full w-full object-cover"
                    on:error={(e) => {
                      // Fallback to random user image if real photo fails
                      e.target.src = `https://randomuser.me/api/portraits/${index % 2 === 0 ? "men" : "women"}/${index + 20}.jpg`
                    }}
                  />
                </div>
                <div>
                  <h4 class="font-bold text-contrast-content">
                    {testimonial.name}
                  </h4>
                  <p class="text-sm text-contrast-content/60">
                    {testimonial.position}
                  </p>
                </div>
              </div>

              <button
                class="mt-4 flex items-center gap-2 font-medium text-primary transition-colors hover:text-primary/80"
                on:click={() => toggleVideo(index)}
              >
                <Play size={16} />
                <span>Watch video</span>
              </button>

              <!-- Video/Placeholder -->
              {#if activeVideo === index}
                <div
                  class="absolute inset-x-0 bottom-[70px] mx-4 mt-4 rounded-lg bg-base-300 p-3 shadow-xl transition-all"
                  in:fadeIn
                >
                  <div class="relative">
                    <button
                      on:click={() => toggleVideo(index)}
                      class="absolute -right-2 -top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-base-content/80 text-base-100 transition-colors hover:bg-base-content"
                    >
                      <X size={14} />
                    </button>

                    {#if testimonial.hasVideo}
                      <!-- Actual video for Adam Smith -->
                      <!-- svelte-ignore a11y-media-has-caption -->
                      <video
                        bind:this={videoRefs[index]}
                        class="aspect-video w-full rounded bg-base-content/20"
                        controls
                        preload="metadata"
                        on:error={() => {
                          // Fallback to placeholder if video fails
                          testimonial.hasVideo = false
                        }}
                      >
                        <source src={testimonial.videoUrl} type="video/mp4" />
                        Your browser does not support the video tag.
                      </video>
                    {:else}
                      <!-- Placeholder for others -->
                      <div
                        class="flex aspect-video items-center justify-center rounded bg-base-content/20 text-contrast-content"
                      >
                        <Play size={36} class="opacity-60" />
                        <span class="sr-only">Video placeholder</span>
                      </div>
                    {/if}

                    <div class="mt-2 text-sm text-contrast-content">
                      <h5 class="font-medium">
                        {testimonial.name}'s Experience with AgSKAN
                      </h5>
                      <p class="mt-1 text-xs text-contrast-content/70">
                        {#if testimonial.hasVideo}
                          Hear directly from {testimonial.name.split(" ")[0]} about
                          using AgSKAN
                        {:else}
                          Watch how {testimonial.name.split(" ")[0]} uses AgSKAN
                          on the farm
                        {/if}
                      </p>
                    </div>
                  </div>
                </div>
              {/if}
            </div>
          {/each}
        </div>

        <div class="mt-10 text-center" in:animationDelay={400}>
          <button
            class="group btn btn-outline w-full max-w-md cursor-not-allowed border-base-content/30 text-lg text-base-content/50"
            on:click={handleWallOfLoveClick}
            disabled
          >
            View All Customer Stories
            <ArrowRight size={18} class="ml-2" />
          </button>
          <p class="mt-3 text-sm text-contrast-content/60">
            See tweets, emails, images, Facebook posts and more from our happy
            customers
          </p>
        </div>
      </div>
    {/if}
  </div>

  <!-- Toast Notification -->
  {#if showToast}
    <div
      class="fixed bottom-6 right-6 z-50 rounded-lg bg-base-content px-6 py-3 text-base-100 shadow-lg"
      in:toastSlide
      out:toastSlide
    >
      <div class="flex items-center gap-2">
        <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
          <path
            fill-rule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
            clip-rule="evenodd"
          />
        </svg>
        <span class="font-medium">Wall of Love coming soon!</span>
      </div>
    </div>
  {/if}
</section>
