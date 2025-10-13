<script lang="ts">
  import {
    ArrowRight,
    Volume2,
    VolumeX,
    Play,
    Pause,
    Globe,
  } from "lucide-svelte"
  import { goto } from "$app/navigation"
  import { onMount } from "svelte"

  let mounted = false
  let videoElement: HTMLVideoElement
  let isMuted = true
  let isPlaying = false
  let showControls = false
  let controlsTimeout: NodeJS.Timeout

  onMount(() => {
    mounted = true
    if (videoElement) {
      videoElement
        .play()
        .then(() => {
          isPlaying = true
        })
        .catch((error) => {
          console.log("Autoplay prevented:", error)
          isPlaying = false
        })
    }
  })

  function toggleMute() {
    if (videoElement) {
      isMuted = !isMuted
      videoElement.muted = isMuted
      showControlsBriefly()
    }
  }

  function togglePlayPause() {
    if (videoElement) {
      if (videoElement.paused) {
        videoElement.play()
        isPlaying = true
        showControlsBriefly()
      } else {
        videoElement.pause()
        isPlaying = false
      }
    }
  }

  function showControlsBriefly() {
    showControls = true
    clearTimeout(controlsTimeout)
    controlsTimeout = setTimeout(() => {
      if (isPlaying) {
        showControls = false
      }
    }, 2000)
  }

  function handleVideoClick() {
    if (isPlaying) {
      showControlsBriefly()
    } else {
      togglePlayPause()
    }
  }

  function scrollToSection(elementId: string) {
    const element = document.getElementById(elementId)
    if (element) {
      element.scrollIntoView({
        behavior: "smooth",
        block: "start",
      })
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

<section
  class="relative overflow-hidden bg-gradient-to-br from-base-100 to-base-200"
>
  <div class="section-container py-12 md:py-16">
    <div class="grid items-center gap-8 lg:grid-cols-2">
      <!-- Left Column -->
      {#if mounted}
        <div class="space-y-6 lg:pr-8" in:animationDelay={100}>
          <div>
            <h1
              class="font-sans text-3xl font-bold leading-tight text-contrast-content md:text-4xl lg:text-5xl"
            >
              Farm Coordination Made Simple
            </h1>
            <p class="mt-4 text-lg text-contrast-content/80">
              Live GPS tracking, map coverage and team communication. Available
              everywhere.
            </p>
          </div>

          <!-- Compact Platform Buttons -->
          <div class="flex w-full flex-col gap-2 pt-2">
            <button
              class="group relative w-full overflow-hidden rounded-lg bg-brand-content px-6 py-4 shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-xl"
              on:click={() => goto("/login?tab=sign_up")}
            >
              <div class="relative flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <div
                    class="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-content"
                  >
                    <Globe size={20} class="text-neutral" />
                  </div>
                  <div class="text-left">
                    <p class="text-base font-bold text-neutral-content">
                      Start Free Now
                    </p>
                    <p class="text-xs text-neutral-content/80">
                      No credit card required
                    </p>
                  </div>
                </div>
                <ArrowRight
                  size={20}
                  class="text-neutral-content transition-all group-hover:translate-x-2"
                />
              </div>
            </button>

            <a
              href="tel:0439405248"
              class="group flex w-full items-center justify-between rounded-lg border border-base-300 bg-base-100 px-4 py-3 transition-all duration-300 hover:bg-base-200"
            >
              <div class="flex items-center gap-3">
                <div
                  class="flex h-8 w-8 items-center justify-center rounded-md bg-black"
                >
                  <svg
                    class="h-4 w-4 text-white"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path
                      d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"
                    />
                  </svg>
                </div>
                <div class="text-left">
                  <p class="mb-0.5 text-xs text-contrast-content/70">Call Us</p>
                  <p class="text-base font-bold text-contrast-content">
                    0439 405 248
                  </p>
                </div>
              </div>
              <ArrowRight
                size={16}
                class="text-contrast-content/50 transition-all group-hover:translate-x-1 group-hover:text-contrast-content"
              />
            </a>
          </div>
        </div>
      {/if}

      <!-- Right Column - Video -->
      {#if mounted}
        <div class="relative" in:animationDelay={300}>
          <div
            class="hover:shadow-3xl group relative overflow-hidden rounded-2xl shadow-2xl transition-all duration-500 lg:hover:scale-105"
            on:mouseenter={() => (showControls = true)}
            on:mouseleave={() => (showControls = false)}
          >
            <div class="relative aspect-video overflow-hidden bg-black">
              <!-- svelte-ignore a11y-media-has-caption -->
              <video
                bind:this={videoElement}
                class="h-full w-full cursor-pointer object-contain"
                autoplay
                muted
                loop
                playsinline
                preload="auto"
                on:play={() => (isPlaying = true)}
                on:pause={() => (isPlaying = false)}
                on:click={handleVideoClick}
              >
                <source src="/content/landing/HeroVideo.mp4" type="video/mp4" />
              </video>

              <div
                class="pointer-events-none absolute inset-0 transition-opacity duration-300 {showControls ||
                !isPlaying
                  ? 'opacity-100'
                  : 'opacity-0'}"
              >
                <button
                  class="pointer-events-auto absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 shadow-lg transition-all duration-300 hover:scale-110 hover:bg-white"
                  on:click|stopPropagation={togglePlayPause}
                  aria-label={isPlaying ? "Pause video" : "Play video"}
                >
                  {#if isPlaying}
                    <Pause size={20} class="text-base-content" />
                  {:else}
                    <Play size={20} class="ml-1 text-base-content" />
                  {/if}
                </button>

                <button
                  class="pointer-events-auto absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/70 text-white transition-all duration-300 hover:scale-110 hover:bg-black/90"
                  on:click|stopPropagation={toggleMute}
                  aria-label={isMuted ? "Unmute video" : "Mute video"}
                >
                  {#if isMuted}
                    <VolumeX size={18} />
                  {:else}
                    <Volume2 size={18} />
                  {/if}
                </button>
              </div>
            </div>
          </div>
          <div
            class="absolute -bottom-4 -right-4 -z-10 h-32 w-32 rounded-full bg-secondary/20 blur-3xl"
          ></div>
        </div>
      {/if}
    </div>
  </div>
</section>
