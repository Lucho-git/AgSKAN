<script lang="ts">
  import { ArrowRight, Play } from "lucide-svelte"
  import { onMount } from "svelte"
  import { goto } from "$app/navigation"

  let mounted = false
  let showVideo = false

  onMount(() => {
    mounted = true
  })

  const steps = [
    {
      title: "Download the App",
      description:
        "Install AgSKAN on any phone or tablet — no hardware, no setup headaches.",
    },
    {
      title: "Upload Your Farm & Invite Your Crew",
      description:
        "Add your paddock boundaries and bring your team on board. Everyone sees the same map, live.",
    },
    {
      title: "Track Operators and Machines in Real Time",
      description:
        "Know where people are, what's been done, and what's next — from one simple dashboard.",
    },
  ]

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

  function handleVideoClick() {
    showVideo = true
  }
</script>

<section class="bg-base-200" id="setup">
  <div class="section-container py-20">
    {#if mounted}
      <div in:animationDelay={0}>
        <h2
          class="mb-16 text-center font-sans text-3xl font-bold text-contrast-content md:text-4xl"
        >
          Set Up in <span class="text-base-content">Minutes.</span> Track
          <span class="text-base-content">Everything</span> All Season.
        </h2>

        <div class="relative mx-auto my-16 max-w-5xl">
          <div class="grid gap-6 md:grid-cols-3 md:gap-8">
            {#each steps as step, index}
              <div
                class="group flex flex-col items-center text-center"
                in:animationDelay={100 + index * 100}
              >
                <!-- Step Content -->
                <div
                  class="h-full w-full rounded-xl border border-transparent bg-base-100 p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-base-content/30 hover:shadow-md"
                >
                  <div
                    class="mx-auto mb-4 flex h-8 w-8 items-center justify-center rounded-full bg-base-content text-sm font-bold text-base-100"
                  >
                    {index + 1}
                  </div>
                  <h3
                    class="mb-3 font-sans text-xl font-bold text-contrast-content"
                  >
                    {step.title}
                  </h3>
                  <p class="text-contrast-content/70">{step.description}</p>
                </div>
              </div>
            {/each}
          </div>
        </div>

        <div class="mx-auto mt-16 max-w-3xl" in:animationDelay={400}>
          <div
            class="overflow-hidden rounded-xl border border-transparent bg-base-100 shadow-md transition-all duration-300 hover:-translate-y-1 hover:border-base-content/30 hover:shadow-lg"
          >
            {#if showVideo}
              <div class="aspect-video">
                <iframe
                  class="h-full w-full"
                  src="https://www.youtube.com/embed/FEoL4K-GXWs?si=OYKER1bmZsfwDm6q"
                  title="YouTube video player"
                  frameborder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerpolicy="strict-origin-when-cross-origin"
                  allowfullscreen
                ></iframe>
              </div>
            {:else}
              <div
                class="relative flex aspect-video cursor-pointer items-center justify-center bg-base-300"
                on:click={handleVideoClick}
                role="button"
                tabindex="0"
                on:keydown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    handleVideoClick()
                  }
                }}
              >
                <div
                  class="absolute inset-0 bg-[url('https://img.youtube.com/vi/KMAOcSfhw4c/maxresdefault.jpg')] bg-cover bg-center"
                ></div>
                <div class="absolute inset-0 bg-black/20"></div>
                <div class="relative flex flex-col items-center gap-4">
                  <button
                    class="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-content shadow-lg transition-all duration-300 hover:scale-110 hover:bg-primary/90"
                  >
                    <Play size={24} class="ml-1" />
                  </button>
                  <span class="font-medium text-white shadow-sm"
                    >Watch: How AgSKAN Works in 90 Seconds</span
                  >
                </div>
              </div>
            {/if}
          </div>

          <div class="mt-6">
            <button
              class="group btn btn-secondary w-full text-lg shadow-lg transition-all duration-300 hover:shadow-xl hover:shadow-secondary/40"
              on:click={() => goto("/login?tab=sign_up")}
            >
              Set Up My Farm
              <ArrowRight
                size={16}
                class="ml-2 transition-transform group-hover:translate-x-1"
              />
            </button>
          </div>
        </div>
      </div>
    {/if}
  </div>
</section>
