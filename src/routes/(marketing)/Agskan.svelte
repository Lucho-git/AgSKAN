<script lang="ts">
  import { Compass, Map, MapPin, Sprout, Play } from "lucide-svelte"
  import { onMount } from "svelte"

  let mounted = false
  let videoRefs: HTMLVideoElement[] = []
  let observer: IntersectionObserver

  onMount(() => {
    mounted = true

    // Set up Intersection Observer for mobile autoplay
    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const video = entry.target as HTMLVideoElement
          const index = videoRefs.indexOf(video)

          if (entry.isIntersecting && index !== -1) {
            // Video is in view
            video.play().catch(() => {
              // Autoplay failed - this is expected on some browsers
              console.log("Autoplay prevented for video", index)
            })
          } else if (index !== -1) {
            // Video is out of view
            video.pause()
            video.currentTime = 0
          }
        })
      },
      {
        threshold: 0.5, // Play when 50% of video is visible
      },
    )

    // Observe all videos once they're mounted
    setTimeout(() => {
      videoRefs.forEach((video) => {
        if (video) {
          observer.observe(video)
        }
      })
    }, 100)

    return () => {
      // Cleanup
      if (observer) {
        observer.disconnect()
      }
    }
  })

  const features = [
    {
      icon: Map,
      title: "Real-Time Tracking",
      subtitle: "Know Where Everyone Is -- Without the Phone Calls",
      description:
        "See your operators and gear live in the paddock. No more guessing, no more radio chatter -- just clear visibility from any phone or tablet.",
      hasVideo: true,
      videoUrl: "/content/landing/MachinesMoving.mp4",
      imageUrl:
        "https://images.unsplash.com/photo-1548266652-99cf27701ced?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=800&q=80",
    },
    {
      icon: Sprout,
      title: "Path Recreate",
      subtitle: "Review, Learn, and Improve Field Performance",
      description:
        "Animate completed coverage to see exactly how operators performed. Track distance traveled, hectares covered, and overlap stats -- a powerful educational tool for training and improvement.",
      hasVideo: true,
      videoUrl: "/content/landing/PathRecreateClip.mp4",
      fallbackImageUrl:
        "https://images.unsplash.com/photo-1530836369250-ef72a3f5cda8?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=800&q=80",
    },
    {
      icon: Compass,
      title: "Paddock Upload",
      subtitle: "Put Every Operator on the Same Page",
      description:
        "Upload or draw your paddocks in seconds. Every team member sees the same live boundary -- no confusion, no crossed wires.",
      hasVideo: true,
      videoUrl: "/content/landing/FieldUploadClip.mp4",
      fallbackImageUrl:
        "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=800&q=80",
    },
    {
      icon: MapPin,
      title: "Pin Drops",
      subtitle: "Tag Hazards Before They Waste Time",
      description:
        "Drop pins for rocks, stumps, or wet patches with one tap. Everyone sees it, instantly -- no more gear damage or delays.",
      hasVideo: true,
      videoUrl: "/content/landing/PinDrop.mp4",
      customFit: true,
      imageUrl:
        "https://images.unsplash.com/photo-1609252509102-aa73ff8eab1a?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=800&q=80",
    },
  ]

  let hoveredIndex: number | null = null

  function handleMouseEnter(index: number) {
    hoveredIndex = index
    if (features[index].hasVideo && videoRefs[index]) {
      videoRefs[index].play()
    }
  }

  function handleMouseLeave(index: number) {
    hoveredIndex = null
    if (features[index].hasVideo && videoRefs[index]) {
      videoRefs[index].pause()
      videoRefs[index].currentTime = 0
    }
  }

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
</script>

<section class="bg-base-200" id="features">
  <div class="section-container px-4 py-12 md:py-20">
    {#if mounted}
      <h2
        class="mb-8 text-center font-sans text-2xl font-bold text-contrast-content md:mb-16 md:text-4xl"
        in:animationDelay={0}
      >
        Built to <span class="text-base-content">Solve Real Problems</span> in the
        Field
      </h2>

      <div class="mx-auto grid max-w-6xl gap-4 md:grid-cols-2 md:gap-6">
        {#each features as feature, index}
          <div
            class="group relative overflow-hidden rounded-2xl bg-base-100 shadow-md transition-all duration-500 hover:shadow-2xl"
            in:animationDelay={100 + index * 100}
            on:mouseenter={() => handleMouseEnter(index)}
            on:mouseleave={() => handleMouseLeave(index)}
            role="button"
            tabindex="0"
          >
            <!-- Background Image/Video -->
            <div
              class="absolute inset-0 transition-transform duration-700 {feature.customFit
                ? ''
                : 'group-hover:scale-105'}"
            >
              {#if feature.hasVideo}
                {#if feature.customFit}
                  <div
                    class="flex h-full w-full items-center justify-center bg-black"
                  >
                    <video
                      bind:this={videoRefs[index]}
                      class="max-h-full max-w-full"
                      style="width: 100%; height: 100%; object-fit: contain;"
                      muted
                      loop
                      playsinline
                      preload="metadata"
                      on:error={() => {
                        feature.hasVideo = false
                      }}
                    >
                      <source src={feature.videoUrl} type="video/mp4" />
                      Your browser does not support the video tag.
                    </video>
                  </div>
                {:else}
                  <video
                    bind:this={videoRefs[index]}
                    class="h-full w-full object-cover"
                    muted
                    loop
                    playsinline
                    preload="metadata"
                    on:error={() => {
                      feature.hasVideo = false
                    }}
                  >
                    <source src={feature.videoUrl} type="video/mp4" />
                    Your browser does not support the video tag.
                  </video>
                {/if}
              {:else}
                <img
                  src={feature.imageUrl}
                  alt={`Demonstrating ${feature.title}`}
                  class="h-full w-full object-cover"
                  loading="lazy"
                  on:error={(e) => {
                    if (feature.fallbackImageUrl) {
                      e.target.src = feature.fallbackImageUrl
                    }
                  }}
                />
              {/if}
              <!-- Gradient overlay - visible by default, disappears on hover -->
              <div
                class={`absolute inset-0 bg-gradient-to-t from-base-300/100 via-base-300/80 to-transparent transition-all duration-500 ${
                  hoveredIndex === index ? "opacity-0" : "opacity-100"
                }`}
              />
            </div>

            <!-- Content -->
            <div
              class="relative flex min-h-[280px] flex-col justify-end p-6 md:min-h-[320px] md:p-8"
            >
              <div class="mb-3 flex items-center gap-3">
                <div
                  class="flex h-10 w-10 items-center justify-center rounded-lg bg-base-100/90 shadow-lg backdrop-blur-sm transition-all duration-300 group-hover:scale-110 group-hover:bg-secondary"
                >
                  <svelte:component
                    this={feature.icon}
                    size={20}
                    class="text-base-content transition-colors group-hover:text-secondary-content"
                  />
                </div>
                {#if feature.hasVideo}
                  <div
                    class="flex h-8 w-8 items-center justify-center rounded-full bg-base-100/90 shadow-md backdrop-blur-sm transition-all duration-300 group-hover:scale-110"
                  >
                    <Play
                      size={14}
                      class="ml-0.5 text-base-content"
                      fill="currentColor"
                    />
                  </div>
                {/if}
              </div>

              <!-- Text content - visible by default, hidden on hover -->
              <div
                class={`transition-all duration-500 ${
                  hoveredIndex === index
                    ? "translate-y-2 opacity-0"
                    : "translate-y-0 opacity-100"
                }`}
              >
                <h3
                  class="mb-2 font-sans text-xl font-bold text-contrast-content md:text-2xl"
                >
                  {feature.title}
                </h3>
                <p class="mb-3 font-medium text-base-content">
                  {feature.subtitle}
                </p>
                <p
                  class="text-sm leading-relaxed text-contrast-content/90 md:text-base"
                >
                  {feature.description}
                </p>
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</section>
