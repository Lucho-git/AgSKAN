<script lang="ts">
  import { Play, Quote, X } from "lucide-svelte"
  import { onMount } from "svelte"
  import { tweened } from "svelte/motion"
  import { cubicOut } from "svelte/easing"
  import { fly } from "svelte/transition"

  let mounted = false
  let activeVideo: number | null = null
  let videoRefs: HTMLVideoElement[] = []
  let currentIndex = 1
  let transitionKey = 0

  const cardWidth = 400
  const gap = 16

  const centerPosition = tweened(currentIndex * cardWidth, {
    duration: 700,
    easing: cubicOut,
  })

  onMount(() => {
    mounted = true
  })

  const testimonials = [
    {
      name: "Kieran Popplewell",
      position: "6,000ha Operation - Moora, WA",
      quote:
        "We saved hours every day once the whole crew was on AgSKAN. I just look at the map and know exactly what's going on.",
      image: "/content/reviews/KieranPoppelwell.png",
      hasVideo: false,
    },
    {
      name: "Adam Smith",
      position: "3,500ha Operation, Northam",
      quote:
        "You've single-handedly made seeding half as stressful. Working flawlessly. Well done to you and Lachie",
      image: "/content/reviews/AdamSmith.png",
      hasVideo: true,
      videoUrl: "/content/reviews/Lingy.mp4",
    },
    {
      name: "Harry Brown",
      position: "Browns Ag Spraying - Gnowangerup, WA",
      quote:
        "Game changer for contractors. My clients can see exactly what I've done in real-time. No more calls asking if I've finished their paddock.",
      image: "/content/reviews/HarryBrown.png",
      hasVideo: false,
    },
    {
      name: "Gary Guelfi",
      position: "Mixed Crop, Gnowangerup",
      quote:
        "Easy to on-board new users, fast to load, easy to access at most times, anyone with a phone can be navigating around the farm in minutes.",
      image: "/content/reviews/GaryGuifelli.JPG",
      hasVideo: false,
    },
  ]

  function toggleVideo(index: number) {
    if (activeVideo === index) {
      activeVideo = null
      if (testimonials[index].hasVideo && videoRefs[index]) {
        videoRefs[index].pause()
        videoRefs[index].currentTime = 0
      }
    } else {
      activeVideo = index
      if (testimonials[index].hasVideo && videoRefs[index]) {
        setTimeout(() => {
          videoRefs[index].play()
        }, 100)
      }
    }
  }

  function goToSlide(index: number) {
    if (activeVideo !== null) {
      activeVideo = null
    }
    transitionKey++
    currentIndex = index
  }

  function handleCardClick(index: number) {
    if (index !== currentIndex) {
      goToSlide(index)
    }
  }

  function closeModal() {
    activeVideo = null
    if (videoRefs[currentIndex]) {
      videoRefs[currentIndex].pause()
      videoRefs[currentIndex].currentTime = 0
    }
  }

  // Calculate circular position - always show 1 card on left, rest on right
  function getCircularPosition(index: number, center: number) {
    const totalCards = testimonials.length
    let offset = index - center

    // Wrap around: if we're at the far right, put on the left
    if (offset >= totalCards - 1) {
      offset = offset - totalCards
    } else if (offset < -1) {
      offset += totalCards
    }

    return offset
  }

  $: centerPosition.set(currentIndex * cardWidth)
</script>

<section class="bg-base-100" id="testimonials">
  <div class="section-container py-20">
    {#if mounted}
      <div>
        <h2
          class="mb-6 text-center font-sans text-3xl font-bold text-contrast-content md:text-4xl"
        >
          Hear It From the <span class="text-base-content">Paddock</span>
        </h2>

        <p
          class="mx-auto mb-12 max-w-2xl text-center text-lg text-contrast-content/70"
        >
          Real farmers. Real results. Real time saved.
        </p>

        <div class="relative mx-auto max-w-6xl">
          <!-- Carousel Container -->
          <div class="relative mx-auto px-4">
            <div
              class="relative flex min-h-[480px] items-center justify-center"
            >
              {#key transitionKey}
                {#each testimonials as testimonial, index}
                  {@const circularOffset = getCircularPosition(
                    index,
                    currentIndex,
                  )}
                  {@const isCenter = circularOffset === 0}
                  {@const translateX = circularOffset * (cardWidth + gap)}
                  {@const opacity = isCenter
                    ? 1
                    : circularOffset === -1
                      ? 0.6
                      : circularOffset === 1
                        ? 0.6
                        : 0.3}
                  {@const scale = isCenter ? 1 : 0.9}
                  {@const zIndex = isCenter
                    ? 20
                    : Math.abs(circularOffset) === 1
                      ? 10
                      : 5}

                  <button
                    in:fly={{
                      x:
                        circularOffset === -1
                          ? (testimonials.length - 1) * (cardWidth + gap)
                          : 0,
                      duration: circularOffset === -1 ? 700 : 0,
                      easing: cubicOut,
                    }}
                    out:fly={{
                      x: circularOffset === -1 ? -(cardWidth + gap) * 2 : 0,
                      duration: circularOffset === -1 ? 700 : 0,
                      easing: cubicOut,
                    }}
                    class="absolute flex w-96 flex-shrink-0 items-start justify-center text-left {!isCenter
                      ? 'cursor-pointer hover:opacity-70'
                      : ''}"
                    style="transform: translateX({translateX}px) scale({scale}); z-index: {zIndex}; opacity: {opacity};"
                    on:click={() => handleCardClick(index)}
                    disabled={isCenter}
                  >
                    <div
                      class="relative w-full rounded-xl bg-base-200 p-6 shadow-lg md:p-8"
                    >
                      <div
                        class="absolute -left-3 -top-3 flex h-10 w-10 items-center justify-center rounded-full bg-base-content text-base-100 shadow-md"
                      >
                        <Quote size={20} />
                      </div>

                      <div class="mb-4 flex items-center justify-center gap-1">
                        {#each Array(5) as _}
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

                      <p
                        class="mb-6 text-center text-lg italic text-contrast-content/90"
                      >
                        "{testimonial.quote}"
                      </p>

                      <div class="flex flex-col items-center gap-3">
                        <div class="h-16 w-16 overflow-hidden rounded-full">
                          <img
                            src={testimonial.image}
                            alt={testimonial.name}
                            class="h-full w-full object-cover"
                            on:error={(e) => {
                              e.currentTarget.src = `https://randomuser.me/api/portraits/${index % 2 === 0 ? "men" : "women"}/${index + 20}.jpg`
                            }}
                          />
                        </div>
                        <div class="text-center">
                          <h4 class="font-bold text-contrast-content">
                            {testimonial.name}
                          </h4>
                          <p class="text-sm text-contrast-content/60">
                            {testimonial.position}
                          </p>
                        </div>
                      </div>

                      {#if isCenter && testimonial.hasVideo}
                        <div class="mt-4 flex justify-center">
                          <button
                            class="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-content transition-colors hover:bg-primary/90"
                            on:click|stopPropagation={() => toggleVideo(index)}
                          >
                            <Play size={16} />
                            <span>Watch video</span>
                          </button>
                        </div>
                      {/if}
                    </div>
                  </button>
                {/each}
              {/key}
            </div>

            <!-- Navigation Dots -->
            <div class="mt-8 flex justify-center gap-2">
              {#each testimonials as _, index}
                <button
                  class="h-2 w-2 rounded-full transition-all duration-300 {currentIndex ===
                  index
                    ? 'w-8 bg-primary'
                    : 'bg-base-content/30 hover:bg-base-content/50'}"
                  on:click={() => goToSlide(index)}
                  aria-label="Go to testimonial {index + 1}"
                />
              {/each}
            </div>
          </div>
        </div>
      </div>
    {/if}
  </div>

  <!-- Video Modal -->
  {#if activeVideo !== null && testimonials[activeVideo].hasVideo}
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      on:click={closeModal}
      on:keydown={(e) => e.key === "Escape" && closeModal()}
      role="button"
      tabindex="0"
    >
      <div
        class="relative w-full max-w-4xl"
        on:click|stopPropagation
        on:keydown|stopPropagation
        role="button"
        tabindex="0"
      >
        <button
          on:click={closeModal}
          class="absolute -right-4 -top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white text-gray-900 shadow-lg hover:bg-gray-100"
        >
          <X size={20} />
        </button>

        <!-- svelte-ignore a11y-media-has-caption -->
        <video
          bind:this={videoRefs[activeVideo]}
          class="w-full rounded-lg shadow-2xl"
          controls
          autoplay
          preload="metadata"
        >
          <source src={testimonials[activeVideo].videoUrl} type="video/mp4" />
        </video>
      </div>
    </div>
  {/if}
</section>
