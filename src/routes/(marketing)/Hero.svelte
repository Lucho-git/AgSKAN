<script lang="ts">
  import {
    ArrowRight,
    Check,
    MapPin,
    Smartphone,
    ChevronLeft,
    ChevronRight,
  } from "lucide-svelte"
  import { goto } from "$app/navigation"
  import { onMount } from "svelte"

  // For animation wrapper - using a simple placeholder
  let mounted = false
  let currentSlide = 0
  let slideInterval: NodeJS.Timeout

  const slides = [
    {
      image: "/content/landing/TabletShowcase.png",
      alt: "AgSKAN on tablet showing farm management dashboard",
      title: "Dashboard View",
    },
    {
      image: "/content/landing/MobileShowcase.png",
      alt: "AgSKAN mobile app interface",
      title: "Mobile Interface",
    },
    {
      image: "/content/landing/TractorShowcase.png",
      alt: "Real-time tractor tracking in the field",
      title: "Live Tracking",
    },
  ]

  onMount(() => {
    mounted = true
    startSlideshow()
    return () => {
      if (slideInterval) {
        clearInterval(slideInterval)
      }
    }
  })

  function startSlideshow() {
    if (slideInterval) {
      clearInterval(slideInterval)
    }
    slideInterval = setInterval(() => {
      currentSlide = (currentSlide + 1) % slides.length
    }, 4000) // Change slide every 4 seconds
  }

  function stopSlideshow() {
    if (slideInterval) {
      clearInterval(slideInterval)
    }
  }

  function nextSlide() {
    currentSlide = (currentSlide + 1) % slides.length
    startSlideshow() // Restart with fresh timer
  }

  function prevSlide() {
    currentSlide = currentSlide === 0 ? slides.length - 1 : currentSlide - 1
    startSlideshow() // Restart with fresh timer
  }

  function goToSlide(index: number) {
    currentSlide = index
    startSlideshow() // Restart with fresh timer
  }

  // Add the smooth scroll function from the navbar
  function scrollToSection(elementId: string) {
    const element = document.getElementById(elementId)
    if (element) {
      element.scrollIntoView({
        behavior: "smooth",
        block: "start",
      })
    }
  }

  // Animation delay placeholder - you can replace with your preferred animation library
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

<section class="relative bg-base-100">
  <div class="section-container py-20 sm:py-16">
    <div class="grid items-center gap-12 md:grid-cols-2">
      <!-- Left Column - Text Content -->
      {#if mounted}
        <div class="space-y-8" in:animationDelay={100}>
          <div>
            <h1
              class="font-sans text-4xl font-bold leading-tight text-contrast-content md:text-5xl"
            >
              Farm Coordination Made Simple
            </h1>

            <p class="mt-6 text-xl leading-relaxed text-contrast-content/80">
              Live GPS tracking, vehicle trails, and team communication Simple
              app-based tracking that works with any machine, any brand.
            </p>
          </div>

          <ul class="flex flex-col gap-4">
            <li class="group flex items-center gap-4">
              <div
                class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-base-content shadow-lg transition-all duration-300 group-hover:scale-110 group-hover:shadow-xl group-hover:shadow-base-content/20"
              >
                <MapPin size={18} class="text-base-100" />
              </div>
              <span class="font-medium text-contrast-content/80"
                >No hardware needed — works on any smartphone or tablet
              </span>
            </li>

            <li class="group flex items-center gap-4">
              <div
                class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-base-content shadow-lg transition-all duration-300 group-hover:scale-110 group-hover:shadow-xl group-hover:shadow-base-content/20"
              >
                <Smartphone size={18} class="text-base-100" />
              </div>
              <span class="font-medium text-contrast-content/80"
                >Designed by farmers, for farmers
              </span>
            </li>

            <li class="group flex items-center gap-4">
              <div
                class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-base-content shadow-lg transition-all duration-300 group-hover:scale-110 group-hover:shadow-xl group-hover:shadow-base-content/20"
              >
                <Check size={18} class="text-base-100" />
              </div>
              <span class="font-medium text-contrast-content/80"
                >Loved by 100+ operators across Australia</span
              >
            </li>
          </ul>

          <div class="flex flex-col gap-4 sm:flex-row">
            <button
              class="group btn btn-secondary px-6 text-base shadow-lg transition-all duration-300 hover:shadow-xl hover:shadow-secondary/25"
              on:click={() => goto("/login?tab=sign_up")}
            >
              Get Started For Free
              <ArrowRight
                size={16}
                class="ml-2 transition-transform group-hover:translate-x-1"
              />
            </button>

            <!-- Fixed: Changed from <a> to <button> with proper scroll function -->
            <button
              class="group btn btn-outline px-6 text-base"
              on:click={() => scrollToSection("setup")}
            >
              See How It Works
            </button>
          </div>
        </div>
      {/if}

      <!-- Right Column - Picture Slideshow -->
      {#if mounted}
        <div in:animationDelay={300}>
          <div
            class="group relative transform overflow-hidden rounded-2xl transition-all duration-700 hover:scale-[1.02]"
            on:mouseenter={stopSlideshow}
            on:mouseleave={startSlideshow}
          >
            <div
              class="rounded-2xl border border-base-200 bg-base-200 p-4 shadow-xl backdrop-blur-sm"
            >
              <div
                class="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl"
              >
                <div
                  class="absolute inset-0 bg-gradient-to-br from-primary/5 to-primary/10"
                ></div>

                <!-- Slideshow container -->
                <div class="relative h-full w-full">
                  <!-- Images -->
                  {#each slides as slide, index}
                    <div
                      class="absolute inset-0 transition-opacity duration-500 ease-in-out {currentSlide ===
                      index
                        ? 'opacity-100'
                        : 'opacity-0'}"
                    >
                      <img
                        src={slide.image}
                        alt={slide.alt}
                        class="h-full w-full rounded-xl object-cover"
                        loading={index === 0 ? "eager" : "lazy"}
                        on:error={(e) => {
                          // Fallback to a generic farm image if the custom image fails
                          e.target.src =
                            "https://images.unsplash.com/photo-1625246333195-78d9c38ad449?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2070&q=80"
                        }}
                      />
                    </div>
                  {/each}

                  <!-- Navigation arrows -->
                  <button
                    class="absolute left-4 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-all duration-300 hover:bg-black/70 group-hover:opacity-100"
                    on:click={prevSlide}
                    aria-label="Previous image"
                  >
                    <ChevronLeft size={20} />
                  </button>

                  <button
                    class="absolute right-4 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-all duration-300 hover:bg-black/70 group-hover:opacity-100"
                    on:click={nextSlide}
                    aria-label="Next image"
                  >
                    <ChevronRight size={20} />
                  </button>

                  <!-- Slide indicators -->
                  <div
                    class="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2"
                  >
                    {#each slides as _, index}
                      <button
                        class="h-2 w-2 rounded-full transition-all duration-300 {currentSlide ===
                        index
                          ? 'bg-white'
                          : 'bg-white/50 hover:bg-white/70'}"
                        on:click={() => goToSlide(index)}
                        aria-label="Go to slide {index + 1}"
                      ></button>
                    {/each}
                  </div>

                  <!-- Slide title overlay -->
                  <div
                    class="absolute bottom-4 right-4 rounded-lg bg-black/50 px-3 py-1"
                  >
                    <span class="text-sm font-medium text-white">
                      {slides[currentSlide].title}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      {/if}
    </div>
  </div>
</section>
