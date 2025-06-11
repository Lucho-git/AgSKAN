<script lang="ts">
  import { ArrowRight, Play, Quote, X } from "lucide-svelte"
  import { onMount } from "svelte"
  import { goto } from "$app/navigation"

  let mounted = false
  let activeVideo: number | null = null

  onMount(() => {
    mounted = true
  })

  const testimonials = [
    {
      name: "Tom Miller",
      position: "Broadacre Farmer, WA",
      quote:
        "We saved hours every day once the whole crew was on AgSKAN. I just look at the map and know exactly what's going on.",
    },
    {
      name: "Karen Doyle",
      position: "Mixed Crop, VIC",
      quote:
        "Before AgSKAN, we were guessing. Now the boys know exactly where to go next. No overlap. No phone tag. Just smooth.",
    },
    {
      name: "Blake Jensen",
      position: "3,500ha Operation, NSW",
      quote:
        "We trialled the free version during spraying and upgraded before harvest. Worth every cent -- the fuel savings alone made it back.",
    },
  ]

  function toggleVideo(index: number) {
    if (activeVideo === index) {
      activeVideo = null
    } else {
      activeVideo = index
    }
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
                    src={`https://randomuser.me/api/portraits/${index % 2 === 0 ? "men" : "women"}/${index + 20}.jpg`}
                    alt={testimonial.name}
                    class="h-full w-full object-cover"
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

              <!-- Video Placeholder -->
              {#if activeVideo === index}
                <div
                  class="absolute inset-x-0 bottom-[70px] mx-4 mt-4 rounded-lg bg-base-300 p-3 shadow-xl transition-all"
                  in:fadeIn
                >
                  <div class="relative">
                    <button
                      on:click={() => (activeVideo = null)}
                      class="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-base-content/80 text-base-100 transition-colors hover:bg-base-content"
                    >
                      <X size={14} />
                    </button>

                    <div
                      class="flex aspect-video items-center justify-center rounded bg-base-content/20 text-contrast-content"
                    >
                      <Play size={36} class="opacity-60" />
                      <span class="sr-only">Video placeholder</span>
                    </div>

                    <div class="mt-2 text-sm text-contrast-content">
                      <h5 class="font-medium">
                        {testimonial.name}'s Experience with AgSKAN
                      </h5>
                      <p class="mt-1 text-xs text-contrast-content/70">
                        Watch how {testimonial.name.split(" ")[0]} uses AgSKAN on
                        the farm
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
            class="group btn btn-outline w-full max-w-md border-base-content text-lg text-base-content hover:bg-base-content hover:text-base-100"
            on:click={() => goto("/wall-of-love")}
          >
            View All Customer Stories
            <ArrowRight
              size={18}
              class="ml-2 transition-transform group-hover:translate-x-1"
            />
          </button>
          <p class="mt-3 text-sm text-contrast-content/60">
            See tweets, emails, images, Facebook posts and more from our happy
            customers
          </p>
        </div>
      </div>
    {/if}
  </div>
</section>
