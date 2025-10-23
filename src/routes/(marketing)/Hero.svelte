<script lang="ts">
  import {
    ArrowRight,
    Volume2,
    VolumeX,
    Play,
    Pause,
    Globe,
    Phone,
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
                <div class="text-left">
                  <p class="text-base font-bold text-neutral-content">
                    Start Free Now
                  </p>
                  <p class="text-xs text-neutral-content/80">
                    No card required
                  </p>
                </div>
                <ArrowRight
                  size={20}
                  class="text-neutral-content transition-all group-hover:translate-x-2"
                />
              </div>
            </button>

            <a
              href="tel:0439405248"
              class="group flex w-full items-center justify-between rounded-lg border border-base-300 bg-base-100 px-6 py-4 transition-all duration-300 hover:bg-base-200"
            >
              <div class="text-left">
                <p class="text-base font-bold text-contrast-content">
                  0439 405 248
                </p>
                <p class="text-xs text-contrast-content/70">Call us</p>
              </div>
              <Phone
                size={20}
                class="text-contrast-content/50 transition-all group-hover:text-contrast-content"
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
