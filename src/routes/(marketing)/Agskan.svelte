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

  let hoveredCards = new Array(features.length).fill(false)

  function handleCardMouseEnter(index: number) {
    hoveredCards[index] = true
  }

  function handleCardMouseLeave(index: number) {
    hoveredCards[index] = false
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
        class="mb-16 text-center font-sans text-3xl font-bold text-contrast-content md:text-4xl"
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
            class={`flex h-full cursor-pointer flex-col overflow-hidden rounded-xl bg-base-100 shadow-md transition-all duration-500 ${
              hoveredCards[index]
                ? "transform border-2 border-base-content shadow-lg hover:scale-[1.02]"
                : "border border-base-content/20 hover:border-primary/40 hover:shadow-lg"
            }`}
            in:animationDelay={100 + index * 100}
            on:mouseenter={() => handleCardMouseEnter(index)}
            on:mouseleave={() => handleCardMouseLeave(index)}
            role="button"
            tabindex="0"
            aria-expanded={hoveredCards[index]}
          >
            <!-- Card Header - Always Visible -->
            <div class="flex items-start p-6">
              <div class="flex-1">
                <h3
                  class="mb-3 font-sans text-xl font-bold text-contrast-content"
                >
                  {feature.title}
                </h3>
                <p class="font-medium text-base-content">{feature.subtitle}</p>
              </div>

              <!-- Feature icon in top right -->
              <div
                class={`ml-4 flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full shadow-lg transition-all duration-500 ${
                  hoveredCards[index]
                    ? "scale-110 bg-gradient-to-br from-secondary to-secondary/80 shadow-secondary/20"
                    : "bg-gradient-to-br from-secondary/20 to-secondary/10"
                }`}
              >
                <svelte:component
                  this={feature.icon}
                  size={20}
                  class={hoveredCards[index]
                    ? "text-secondary-content"
                    : "text-secondary"}
                />
              </div>
            </div>

            <!-- Expandable Content - Shows on hover -->
            <div
              class={`overflow-hidden transition-all duration-500 ease-in-out ${
                hoveredCards[index]
                  ? "max-h-[500px] opacity-100"
                  : "max-h-0 opacity-0"
              }`}
            >
              <div class="px-6 pb-6">
                <div class="mb-5 overflow-hidden rounded-lg">
                  <img
                    src={feature.imageUrl}
                    alt={`Demonstrating ${feature.title}`}
                    class="h-auto max-h-[200px] w-full object-cover transition-transform duration-500"
                    loading="lazy"
                  />
                </div>
                <p class="leading-relaxed text-contrast-content/80">
                  {feature.description}
                </p>
              </div>
            </div>

            <!-- Always visible action button -->
            <div class="mt-3 px-6 pb-6">
              <div
                class={`flex w-full items-center justify-center rounded-lg border border-base-content/20 px-4 py-2 font-medium shadow-sm transition-all duration-300 ${
                  hoveredCards[index]
                    ? "bg-base-300/90 text-contrast-content shadow"
                    : "bg-base-200/80 text-contrast-content/80"
                }`}
              >
                {hoveredCards[index] ? "Show Less" : "Learn More"}
                {#if hoveredCards[index]}
                  <ChevronUp
                    size={16}
                    class="ml-2 -translate-y-1 transition-transform duration-300"
                  />
                {:else}
                  <ChevronDown
                    size={16}
                    class="ml-2 transition-transform duration-300"
                  />
                {/if}
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</section>
