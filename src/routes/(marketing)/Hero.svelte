<script lang="ts">
  import {
    ArrowRight,
    Check,
    MapPin,
    Smartphone,
    Play,
    Pause,
  } from "lucide-svelte"
  import { goto } from "$app/navigation"
  import { onMount } from "svelte"

  // For animation wrapper - using a simple placeholder
  let mounted = false
  let videoElement: HTMLVideoElement
  let isPlaying = false

  onMount(() => {
    mounted = true
  })

  function toggleVideo() {
    if (videoElement) {
      if (videoElement.paused) {
        videoElement.play()
        isPlaying = true
      } else {
        videoElement.pause()
        isPlaying = false
      }
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
              class="font-archivo text-5xl font-bold leading-tight text-contrast-content md:text-6xl"
            >
              Like Google Maps -- But Built for Your Farm
            </h1>

            <p class="mt-6 text-xl leading-relaxed text-contrast-content/80">
              See where every operator and machine is, live. Drop pins, avoid
              overlap, and get the job done quicker -- without radio chaos.
            </p>
          </div>

          <ul class="flex flex-col gap-4">
            <li class="group flex items-center gap-3">
              <div
                class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 transition-colors group-hover:bg-primary/20"
              >
                <MapPin size={16} class="text-primary" />
              </div>
              <span class="text-contrast-content/80"
                >No hardware needed -- works on any smartphone or tablet</span
              >
            </li>

            <li class="group flex items-center gap-3">
              <div
                class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 transition-colors group-hover:bg-primary/20"
              >
                <Smartphone size={16} class="text-primary" />
              </div>
              <span class="text-contrast-content/80"
                >Works offline in areas with poor reception</span
              >
            </li>

            <li class="group flex items-center gap-3">
              <div
                class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 transition-colors group-hover:bg-primary/20"
              >
                <Check size={16} class="text-primary" />
              </div>
              <span class="text-contrast-content/80"
                >Trusted by 400+ farms across Australia</span
              >
            </li>
          </ul>

          <div class="flex flex-col gap-4 sm:flex-row">
            <button
              class="group btn btn-secondary"
              on:click={() => goto("/signup")}
            >
              Get Started For Free
              <ArrowRight
                size={16}
                class="ml-2 transition-transform group-hover:translate-x-1"
              />
            </button>
            <a href="#how-it-works" class="group btn btn-outline">
              See How It Works
            </a>
          </div>
        </div>
      {/if}

      <!-- Right Column - Video Player -->
      {#if mounted}
        <div in:animationDelay={300}>
          <div
            class="group relative transform overflow-hidden rounded-2xl transition-all duration-700 hover:scale-[1.02]"
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

                <!-- Video container -->
                <div
                  class="group relative flex h-full w-full items-center justify-center"
                >
                  <!-- Video element -->
                  <!-- svelte-ignore a11y-media-has-caption -->
                  <video
                    bind:this={videoElement}
                    class="h-full w-full rounded-xl object-cover opacity-80"
                    poster="https://images.unsplash.com/photo-1625246333195-78d9c38ad449?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2070&q=80"
                    muted
                    loop
                    preload="metadata"
                  >
                    <source
                      src="https://assets.mixkit.co/videos/preview/mixkit-aerial-view-of-agricultural-land-with-rows-of-crops-14464-large.mp4"
                      type="video/mp4"
                    />
                    Your browser does not support the video tag.
                  </video>

                  <!-- Play/Pause button -->
                  <button
                    class="absolute flex h-16 w-16 items-center justify-center rounded-full bg-primary text-white shadow-lg transition-all duration-300 hover:bg-primary/90 group-hover:scale-110"
                    on:click={toggleVideo}
                  >
                    {#if isPlaying}
                      <Pause size={24} class="text-white" />
                    {:else}
                      <Play size={24} class="ml-1 text-white" />
                    {/if}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      {/if}
    </div>
  </div>
</section>
