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
  <div class="section-container py-20">
    {#if mounted}
      <div class="mx-auto max-w-4xl" in:animationDelay={0}>
        <div
          class="overflow-hidden rounded-xl border border-base-300 bg-base-100 shadow-xl"
        >
          <!-- Main Content -->
          <div class="p-6 sm:p-8">
            <h2 class="mb-6 text-2xl font-bold text-contrast-content">
              Built by a Farmer and a Software Engineer
            </h2>
            <div class="mb-8">
              <p class="mb-6 text-contrast-content/70">
                One of us lived in the paddock. The other built startups. After
                20 years of friendship (and too many radio calls), we built a
                better way to keep farms in sync.
              </p>

              <!-- Combined Founders Section -->
              <div class="rounded-lg border border-base-300 bg-base-200 p-6">
                <div class="mb-4 h-64 overflow-hidden rounded-lg sm:h-72">
                  <img
                    src="/images/team.jpg"
                    alt="AgSKAN Founders"
                    class="h-full w-full object-cover object-center"
                    style="object-position: center 25%;"
                  />
                </div>
                <div class="flex items-end justify-between">
                  <div>
                    <h4 class="font-semibold text-contrast-content">
                      Ryan Skamp & Lachie Ross
                    </h4>
                    <p class="text-sm text-base-content">
                      Farmer & Software Engineer
                    </p>
                  </div>
                  <div class="flex items-center gap-3">
                    <div class="text-sm text-contrast-content/60">
                      Est. 2023
                    </div>
                    <div
                      class="rounded-lg border border-base-300 bg-base-100 px-4 py-1.5 text-sm text-contrast-content"
                    >
                      Based in Australia
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="mb-8">
              <h3 class="mb-4 text-xl font-semibold text-contrast-content">
                Our Mission
              </h3>

              <p class="text-contrast-content/70">
                We built a better way to keep farms in sync. No complicated
                interfaces, no steep learning curves—just straightforward
                solutions designed for the realities of agricultural life.
              </p>
            </div>

            <!-- Simplified Call to action with arrow -->
            <button
              class="inline-flex items-center gap-1 font-semibold text-base-content transition-colors hover:text-base-content/80 hover:underline"
              on:click={() => goto("/team")}
            >
              Meet the Founders
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
    {/if}
  </div>
</section>
