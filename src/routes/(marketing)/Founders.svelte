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
      <div class="mx-auto max-w-3xl" in:animationDelay={0}>
        <div
          class="relative overflow-hidden rounded-xl bg-base-100 p-8 shadow-md"
        >
          <!-- Decorative elements -->
          <div
            class="absolute right-0 top-0 -mr-16 -mt-16 h-32 w-32 rounded-full bg-primary/10"
          ></div>
          <div
            class="absolute bottom-0 left-0 -mb-12 -ml-12 h-24 w-24 rounded-full bg-primary/10"
          ></div>

          <div class="relative">
            <h2
              class="mb-6 font-archivo text-2xl font-bold text-contrast-content"
            >
              Built by a Farmer and a Software Engineer
            </h2>

            <div class="flex flex-col items-center gap-8 md:flex-row">
              <div class="md:w-3/5">
                <p class="mb-6 leading-relaxed text-contrast-content/80">
                  One of us lived in the paddock. The other built startups.
                  After 20 years of friendship (and too many radio calls), we
                  built a better way to keep farms in sync. Simple tech that
                  just works.
                </p>

                <button
                  class="group inline-flex items-center font-medium text-yellow-500 transition-colors hover:text-yellow-400"
                  on:click={() => goto("/about")}
                >
                  Meet the Founders
                  <ArrowRight size={16} class="ml-2" />
                </button>
              </div>

              <div
                class="rounded-xl bg-gradient-to-br from-primary/10 to-transparent p-6 md:w-2/5"
              >
                <div class="relative flex items-center justify-center">
                  <img
                    src="https://randomuser.me/api/portraits/men/32.jpg"
                    alt="Co-founder JD"
                    class="z-10 h-24 w-24 rounded-full border-4 border-base-100 bg-success/20 object-cover shadow-md"
                  />
                  <img
                    src="https://randomuser.me/api/portraits/men/45.jpg"
                    alt="Co-founder MS"
                    class="absolute -right-4 h-24 w-24 rounded-full border-4 border-base-100 bg-info/20 object-cover shadow-md"
                  />

                  <div
                    class="absolute bottom-0 h-1/2 w-full rounded-full bg-gradient-to-t from-primary/10 to-transparent"
                  ></div>
                </div>

                <div class="mt-6 text-center">
                  <div class="text-sm text-contrast-content/60">Founders</div>
                  <div class="font-medium text-contrast-content">Est. 2020</div>
                  <div
                    class="mt-2 inline-flex items-center gap-1.5 rounded-full bg-yellow-100 px-2 py-1 text-xs text-yellow-800"
                  >
                    <svg
                      width="16"
                      height="12"
                      viewBox="0 0 20 15"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      class="flex-shrink-0"
                    >
                      <rect width="20" height="15" fill="#00008B" />
                      <path d="M0 0H10V7.5H0V0Z" fill="#00008B" />
                      <path d="M0 0L10 7.5L0 15V0Z" fill="#00008B" />
                      <path d="M1.5 0L10 6.5V7.5L0 0H1.5Z" fill="white" />
                      <path d="M10 0L0 7.5V8.5L8.5 0H10Z" fill="white" />
                      <path d="M10 0H8.5L0 6.5V7.5L10 0Z" fill="white" />
                      <path d="M0 0V1L8.5 7.5H10L0 0Z" fill="white" />
                      <path d="M0 0L10 7.5L0 15V0Z" fill="#00008B" />
                      <path d="M0 0L10 7.5L0 15V0Z" fill="#00008B" />
                      <path d="M10 7.5L0 0H1.67L10 6.25V7.5Z" fill="white" />
                      <path d="M10 7.5L0 15H1.67L10 8.75V7.5Z" fill="white" />
                      <path d="M0 0L10 7.5L0 15V0Z" fill="#00008B" />
                      <path d="M0 0H1L10 6.75V7.5L0 0Z" fill="white" />
                      <path d="M0 15H1L10 8.25V7.5L0 15Z" fill="white" />
                      <path
                        d="M4 0V3.75H0V11.25H4V15H6V11.25H10V3.75H6V0H4Z"
                        fill="white"
                      />
                      <path
                        d="M4.5 0V4.5H0V10.5H4.5V15H5.5V10.5H10V4.5H5.5V0H4.5Z"
                        fill="#FF0000"
                      />
                      <path
                        d="M16.95 3.76L17.56 5.62H19.51L17.92 6.79L18.54 8.65L16.95 7.48L15.36 8.65L15.97 6.79L14.38 5.62H16.33L16.95 3.76Z"
                        fill="white"
                      />
                      <path
                        d="M12.32 10.3L12.63 11.26H13.63L12.82 11.86L13.13 12.82L12.32 12.22L11.51 12.82L11.82 11.86L11.01 11.26H12.01L12.32 10.3Z"
                        fill="white"
                      />
                      <path
                        d="M16.95 11.26L17.26 12.22H18.26L17.45 12.82L17.76 13.78L16.95 13.18L16.14 13.78L16.45 12.82L15.64 12.22H16.64L16.95 11.26Z"
                        fill="white"
                      />
                      <path
                        d="M15.26 1.74L15.57 2.7H16.57L15.76 3.3L16.07 4.26L15.26 3.66L14.45 4.26L14.76 3.3L13.95 2.7H14.95L15.26 1.74Z"
                        fill="white"
                      />
                      <path
                        d="M12.32 4.22L12.63 5.18H13.63L12.82 5.78L13.13 6.75L12.32 6.14L11.51 6.75L11.82 5.78L11.01 5.18H12.01L12.32 4.22Z"
                        fill="white"
                      />
                    </svg>
                    Australian Owned & Operated
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    {/if}
  </div>
</section>
