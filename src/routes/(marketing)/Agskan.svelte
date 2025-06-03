<script lang="ts">
  import {
    ChevronDown,
    ChevronUp,
    Compass,
    Map,
    MapPin,
    Sprout,
  } from "lucide-svelte"
  import { onMount } from "svelte"

  let mounted = false

  onMount(() => {
    mounted = true
  })

  const features = [
    {
      icon: Map,
      title: "Real-Time Tracking",
      subtitle: "Know Where Everyone Is -- Without the Phone Calls",
      description:
        "See your operators and gear live in the paddock. No more guessing, no more radio chatter -- just clear visibility from any phone or tablet.",
      imageUrl:
        "https://images.unsplash.com/photo-1548266652-99cf27701ced?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=800&q=80",
    },
    {
      icon: Sprout,
      title: "Seeding Assist",
      subtitle: "Stop Overlap. Hit Every Strip.",
      description:
        "Live trails show exactly where the sprayer's been, so your planter doesn't miss a beat. Fewer skips. Tighter passes. Better coverage.",
      imageUrl:
        "https://images.unsplash.com/photo-1530836369250-ef72a3f5cda8?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=800&q=80",
    },
    {
      icon: Compass,
      title: "Paddock Upload",
      subtitle: "Put Every Operator on the Same Page",
      description:
        "Upload or draw your paddocks in seconds. Every team member sees the same live boundary -- no confusion, no crossed wires.",
      imageUrl:
        "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=800&q=80",
    },
    {
      icon: MapPin,
      title: "Pin Drops",
      subtitle: "Tag Hazards Before They Waste Time",
      description:
        "Drop pins for rocks, stumps, or wet patches with one tap. Everyone sees it, instantly -- no more gear damage or delays.",
      imageUrl:
        "https://images.unsplash.com/photo-1609252509102-aa73ff8eab1a?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=800&q=80",
    },
  ]

  let expandedCards = new Array(features.length).fill(false)

  function toggleCard(index: number) {
    expandedCards[index] = !expandedCards[index]
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
</script>

<section class="bg-base-200" id="features">
  <div class="section-container py-20">
    {#if mounted}
      <h2
        class="mb-16 text-center font-archivo text-3xl font-bold text-contrast-content md:text-4xl"
        in:animationDelay={0}
      >
        Built to <span class="text-base-content">Solve Real Problems</span> in the
        Field
      </h2>

      <div
        class="mx-auto grid max-w-6xl grid-cols-1 gap-8 md:grid-cols-2 md:gap-12"
      >
        {#each features as feature, index}
          <div
            class={`flex h-full flex-col overflow-hidden rounded-xl bg-base-100 shadow-md transition-all duration-300 ${
              expandedCards[index]
                ? "border-2 border-primary shadow-lg"
                : "border border-base-300 hover:border-primary/40 hover:shadow-lg"
            }`}
            in:animationDelay={100 + index * 100}
          >
            <!-- Card Header - Always Visible -->
            <div class="flex items-start p-6">
              <div class="flex-1">
                <div
                  class={`mb-4 flex h-16 w-16 items-center justify-center rounded-full shadow-sm backdrop-blur-sm ${
                    expandedCards[index] ? "bg-primary" : "bg-primary/10"
                  }`}
                >
                  <svelte:component
                    this={feature.icon}
                    size={32}
                    class={expandedCards[index]
                      ? "text-primary-content"
                      : "text-primary"}
                  />
                </div>
                <h3
                  class="mb-3 font-archivo text-xl font-bold text-contrast-content"
                >
                  {feature.title}
                </h3>
                <p class="font-medium text-base-content">{feature.subtitle}</p>
              </div>

              <!-- Only show collapse button when expanded -->
              {#if expandedCards[index]}
                <button
                  on:click={() => toggleCard(index)}
                  class="ml-4 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary shadow-sm transition-all hover:bg-primary/20"
                  aria-label="Show less"
                >
                  <ChevronUp size={20} />
                </button>
              {/if}
            </div>

            <!-- Expandable Content -->
            <div
              class={`overflow-hidden transition-all duration-300 ${
                expandedCards[index]
                  ? "max-h-[500px] opacity-100"
                  : "max-h-0 opacity-0"
              }`}
            >
              <div class="px-6 pb-6">
                <div class="mb-5 overflow-hidden rounded-lg">
                  <img
                    src={feature.imageUrl}
                    alt={`Demonstrating ${feature.title}`}
                    class="h-auto max-h-[200px] w-full object-cover"
                    loading="lazy"
                  />
                </div>
                <p class="leading-relaxed text-contrast-content/80">
                  {feature.description}
                </p>
              </div>
            </div>

            <!-- Learn More Button - Only when not expanded -->
            {#if !expandedCards[index]}
              <div class="mt-3 px-6 pb-6">
                <button
                  on:click={() => toggleCard(index)}
                  class="group flex w-full items-center justify-center rounded-lg border border-base-300 bg-base-200/80 px-4 py-2 font-medium text-contrast-content/80 shadow-sm transition-all hover:bg-base-300/90 hover:text-contrast-content hover:shadow"
                >
                  Learn more
                  <ChevronDown
                    size={16}
                    class="ml-2 transition-transform group-hover:translate-y-1"
                  />
                </button>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
</section>
