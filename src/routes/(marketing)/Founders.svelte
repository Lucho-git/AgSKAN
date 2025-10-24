<script lang="ts">
  import { ArrowRight } from "lucide-svelte"
  import { onMount } from "svelte"
  import { goto } from "$app/navigation"

  let mounted = false

  onMount(() => {
    mounted = true
  })

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

<section class="bg-base-200" id="founders">
  <div class="section-container py-12 sm:py-20">
    {#if mounted}
      <div class="mx-auto max-w-4xl" in:animationDelay={0}>
        <div
          class="overflow-hidden rounded-xl border border-base-300 bg-base-100 shadow-xl"
        >
          <!-- Main Content -->
          <div class="p-6 sm:p-8">
            <h2
              class="mb-4 text-xl font-bold text-contrast-content sm:mb-6 sm:text-2xl"
            >
              Built by a Farmer and a Software Engineer
            </h2>
            <div class="mb-6 sm:mb-8">
              <p
                class="mb-6 text-sm leading-relaxed text-contrast-content/70 sm:text-base"
              >
                One of us lived in the paddock. The other built startups. After
                20 years of friendship (and too many radio calls), we built a
                better way to keep farms in sync.
              </p>

              <!-- Combined Founders Section -->
              <div
                class="rounded-lg border border-base-300 bg-base-200 p-4 sm:p-6"
              >
                <div class="mb-4 h-48 overflow-hidden rounded-lg sm:h-72">
                  <img
                    src="/images/team.jpg"
                    alt="AgSKAN Founders"
                    class="h-full w-full object-cover object-center"
                    style="object-position: center 25%; transform: scale(1.2);"
                  />
                </div>

                <!-- Mobile: Stack vertically -->
                <div class="space-y-3 sm:space-y-0">
                  <div>
                    <h4 class="font-semibold text-contrast-content">
                      Lachie Ross & Ryan Skamp
                    </h4>
                    <p class="text-sm text-base-content">
                      Software Engineer & Farmer
                    </p>
                  </div>

                  <!-- Mobile: Stack badges -->
                  <div class="flex flex-wrap items-center gap-2 sm:justify-end">
                    <div class="text-xs text-contrast-content/60 sm:text-sm">
                      Est. 2023
                    </div>
                    <div
                      class="rounded-lg border border-base-300 bg-base-100 px-3 py-1 text-xs text-contrast-content sm:px-4 sm:py-1.5 sm:text-sm"
                    >
                      Based in Australia
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="mb-6 sm:mb-8">
              <h3
                class="mb-3 text-lg font-semibold text-contrast-content sm:mb-4 sm:text-xl"
              >
                Our Mission
              </h3>

              <p
                class="text-sm leading-relaxed text-contrast-content/70 sm:text-base"
              >
                We built a better way to keep farms in sync. No complicated
                interfaces, no steep learning curves—just straightforward
                solutions designed for the realities of agricultural life.
              </p>
            </div>

            <!-- Simplified Call to action with arrow -->
            <button
              class="inline-flex items-center gap-1 text-sm font-semibold text-base-content transition-colors hover:text-base-content/80 hover:underline sm:text-base"
              on:click={() => goto("/team")}
            >
              Meet the Founders
              <ArrowRight size={16} class="flex-shrink-0" />
            </button>
          </div>
        </div>
      </div>
    {/if}
  </div>
</section>
