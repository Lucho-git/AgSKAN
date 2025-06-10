<script lang="ts">
  import { ArrowRight, Map, Radio } from "lucide-svelte"
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

<section class="bg-base-100" id="problem-solution">
  <div class="section-container py-20">
    {#if mounted}
      <div class="mx-auto max-w-4xl" in:animationDelay={0}>
        <h2
          class="mb-12 text-center font-sans text-3xl font-bold text-contrast-content md:text-4xl"
        >
          From Radio Chatter to <span class="text-secondary"
            >Real-Time Clarity</span
          >
        </h2>

        <div class="mt-12 grid gap-8 md:grid-cols-2">
          <!-- Problem Card -->
          <div
            class="relative rounded-xl border border-transparent bg-base-200 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-red-500/30 hover:shadow-md"
            style="background: linear-gradient(135deg, rgb(239 68 68 / 0.08), rgb(220 38 38 / 0.05));"
          >
            <div
              class="absolute -top-6 left-6 flex h-12 w-12 items-center justify-center rounded-full text-red-500"
              style="background: linear-gradient(135deg, rgb(239 68 68 / 0.15), rgb(220 38 38 / 0.10));"
            >
              <Radio size={24} />
            </div>
            <h3
              class="mb-4 mt-6 font-sans text-xl font-bold text-contrast-content"
            >
              The Problem
            </h3>
            <p class="text-contrast-content">
              Spraying. Seeding. Harvest. It gets messy fast. You're chasing
              updates, juggling phone calls, and hoping no one's doubled back on
              a paddock.
            </p>
            <ul class="mt-4 space-y-2 text-contrast-content">
              <li class="flex items-start gap-2">
                <span
                  class="mt-[0.125rem] flex-shrink-0 font-bold"
                  style="color: #dc2626;">✗</span
                >
                <span>Constant radio check-ins</span>
              </li>
              <li class="flex items-start gap-2">
                <span
                  class="mt-[0.125rem] flex-shrink-0 font-bold"
                  style="color: #dc2626;">✗</span
                >
                <span>Wasted time and fuel on overlap</span>
              </li>
              <li class="flex items-start gap-2">
                <span
                  class="mt-[0.125rem] flex-shrink-0 font-bold"
                  style="color: #dc2626;">✗</span
                >
                <span>No way to know what's been covered</span>
              </li>
            </ul>
          </div>

          <!-- Solution Card -->
          <div
            class="relative rounded-xl border border-transparent bg-base-200 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-green-500/30 hover:shadow-md"
            style="background: linear-gradient(135deg, rgb(34 197 94 / 0.08), rgb(22 163 74 / 0.05));"
          >
            <div
              class="absolute -top-6 left-6 flex h-12 w-12 items-center justify-center rounded-full text-green-600"
              style="background: linear-gradient(135deg, rgb(34 197 94 / 0.15), rgb(22 163 74 / 0.10));"
            >
              <Map size={24} />
            </div>
            <h3
              class="mb-4 mt-6 font-sans text-xl font-bold text-contrast-content"
            >
              The Solution
            </h3>
            <p class="text-contrast-content">
              AgSKAN cuts through the chaos. One live map shows where everyone
              is, what's done, and what's next -- all from a phone or tablet.
            </p>
            <ul class="mt-4 space-y-2 text-contrast-content">
              <li class="flex items-start gap-2">
                <span
                  class="mt-[0.125rem] flex-shrink-0 font-bold"
                  style="color: #16a34a;">✓</span
                >
                <span>Real-time visibility of all operators</span>
              </li>
              <li class="flex items-start gap-2">
                <span
                  class="mt-[0.125rem] flex-shrink-0 font-bold"
                  style="color: #16a34a;">✓</span
                >
                <span>Live tracking shows completed areas</span>
              </li>
              <li class="flex items-start gap-2">
                <span
                  class="mt-[0.125rem] flex-shrink-0 font-bold"
                  style="color: #16a34a;">✓</span
                >
                <span>Instant hazard alerts to the whole team</span>
              </li>
            </ul>
          </div>
        </div>

        <div class="mt-12">
          <button
            class="group btn btn-secondary w-full shadow-lg shadow-secondary/30 transition-all duration-300 hover:shadow-xl hover:shadow-secondary/40"
            on:click={() => goto("/signup")}
          >
            Start Free and Get Instant Visibility
            <ArrowRight
              size={16}
              class="ml-2 transition-transform group-hover:translate-x-1"
            />
          </button>
        </div>
      </div>
    {/if}
  </div>
</section>
