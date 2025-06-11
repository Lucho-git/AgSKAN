<script lang="ts">
  import { ArrowRight, Play } from "lucide-svelte"
  import { onMount } from "svelte"
  import { goto } from "$app/navigation"

  let mounted = false

  onMount(() => {
    mounted = true
  })

  const steps = [
    {
      title: "Download the App",
      description:
        "Install AgSKAN on any phone or tablet -- no hardware, no setup headaches.",
    },
    {
      title: "Upload Your Farm & Invite Your Crew",
      description:
        "Add your paddock boundaries and bring your team on board. Everyone sees the same map, live.",
    },
    {
      title: "Track Operators and Machines in Real Time",
      description:
        "Know where people are, what's been done, and what's next -- from one simple dashboard.",
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
    // Add video modal logic here or navigate to video page
    console.log("Play video")
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
            <div
              class="relative flex aspect-video items-center justify-center bg-base-300"
            >
              <div
                class="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1625246333195-78d9c38ad449?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2070&q=80')] bg-cover bg-center opacity-20"
              ></div>
              <div class="relative flex flex-col items-center gap-4">
                <button
                  class="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-content shadow-lg transition-colors hover:bg-primary/90"
                  on:click={handleVideoClick}
                >
                  <Play size={24} />
                </button>
                <span class="font-medium text-contrast-content"
                  >Watch: How AgSKAN Works in 90 Seconds</span
                >
              </div>
            </div>
          </div>

          <div class="mt-6">
            <button
              class="group btn btn-secondary w-full text-lg shadow-lg shadow-secondary/30 transition-all duration-300 hover:shadow-xl hover:shadow-secondary/40"
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
