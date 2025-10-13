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
              href="https://apps.apple.com/us/app/agskan/id6746783538"
              target="_blank"
              rel="noopener noreferrer"
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
                      d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"
                    />
                  </svg>
                </div>
                <p class="text-sm font-semibold text-contrast-content">
                  iOS App
                </p>
              </div>
              <ArrowRight
                size={16}
                class="text-contrast-content/50 transition-all group-hover:translate-x-1 group-hover:text-contrast-content"
              />
            </a>

            <a
              href="https://play.google.com/store/apps/details?id=com.skanfarming"
              target="_blank"
              rel="noopener noreferrer"
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
                      d="M3,20.5V3.5C3,2.91 3.34,2.39 3.84,2.15L13.69,12L3.84,21.85C3.34,21.6 3,21.09 3,20.5M16.81,15.12L6.05,21.34L14.54,12.85L16.81,15.12M20.16,10.81C20.5,11.08 20.75,11.5 20.75,12C20.75,12.5 20.53,12.9 20.18,13.18L17.89,14.5L15.39,12L17.89,9.5L20.16,10.81M6.05,2.66L16.81,8.88L14.54,11.15L6.05,2.66Z"
                    />
                  </svg>
                </div>
                <p class="text-sm font-semibold text-contrast-content">
                  Android App
                </p>
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
