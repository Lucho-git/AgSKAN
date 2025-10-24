<script lang="ts">
  import { Mail, MapPin, Phone, ArrowRight } from "lucide-svelte"
  import { onMount } from "svelte"

  let mounted = false

  onMount(() => {
    mounted = true
    // Scroll to top when component mounts
    window.scrollTo(0, 0)
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

<svelte:head>
  <title>Contact Us - AgSKAN</title>
  <meta
    name="description"
    content="Get in touch with AgSKAN. Contact our support team for questions about features, pricing, or technical support."
  />
</svelte:head>

<main class="overflow-x-hidden bg-base-100 text-contrast-content">
  <!-- Hero Section -->
  <section
    class="relative overflow-hidden bg-gradient-to-b from-base-100 to-base-200 pb-16 pt-32"
  >
    <div
      class="absolute right-0 top-0 -mr-48 -mt-48 h-96 w-96 rounded-full bg-base-content/5 blur-3xl"
    ></div>
    <div
      class="absolute bottom-0 left-0 -mb-48 -ml-48 h-96 w-96 rounded-full bg-base-content/5 blur-3xl"
    ></div>

    <div class="section-container relative z-10">
      {#if mounted}
        <div class="mx-auto max-w-3xl text-center" in:animationDelay={0}>
          <h1
            class="mb-6 font-sans text-4xl font-bold text-contrast-content md:text-5xl"
          >
            Get in <span class="text-base-content">Touch</span>
          </h1>
          <p
            class="mx-auto mb-8 max-w-2xl text-lg text-contrast-content/80 md:text-xl"
          >
            We're here to help! Whether you have a question about setup,
            features, pricing or just want a chat. We love hearing from you and
            are ready to answer all your questions.
          </p>

          <!-- Corner Badge Icons - More Solid -->
          <div class="mx-auto mt-8 grid max-w-3xl gap-6 sm:grid-cols-2">
            <a
              href="tel:0439405248"
              class="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-hover to-hover/80 p-8 text-hover-content shadow-lg transition-all hover:-translate-y-1 hover:shadow-xl"
            >
              <div
                class="absolute right-4 top-4 opacity-60 transition-opacity group-hover:opacity-80"
              >
                <Phone size={28} strokeWidth={2.5} />
              </div>
              <div class="relative z-10">
                <h3 class="mb-2 text-2xl font-bold">Call or Text</h3>
                <p class="mb-2 text-3xl font-black">0439 405 248</p>
                <p class="text-sm opacity-90">Available anytime</p>
              </div>
            </a>

            <a
              href="mailto:service@skanfarming.com"
              class="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-dark-card to-dark-card/80 p-8 text-dark-card-content shadow-lg transition-all hover:-translate-y-1 hover:shadow-xl"
            >
              <div
                class="absolute right-4 top-4 opacity-60 transition-opacity group-hover:opacity-80"
              >
                <Mail size={28} strokeWidth={2.5} />
              </div>
              <div class="relative z-10">
                <h3 class="mb-2 text-2xl font-bold">Email Us</h3>
                <p class="mb-2 break-all text-xl font-bold">
                  service@skanfarming.com
                </p>
                <p class="text-sm opacity-90">Response within 24 hours</p>
              </div>
            </a>
          </div>
        </div>
      {/if}
    </div>
  </section>

  <!-- Self Help Section -->
  <section class="bg-base-100 py-16">
    <div class="section-container">
      {#if mounted}
        <div class="mx-auto max-w-5xl" in:animationDelay={100}>
          <h2
            class="mb-10 text-center font-sans text-2xl font-bold text-contrast-content md:text-3xl"
          >
            Looking for Quick Answers?
          </h2>

          <div class="grid gap-6 md:grid-cols-3">
            <div
              class="transform rounded-xl border border-base-300 bg-base-200 p-6 text-center transition-all duration-300 hover:-translate-y-1 hover:border-base-content/30 hover:shadow-md"
            >
              <div
                class="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-secondary text-secondary-content shadow-sm"
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <circle cx="12" cy="12" r="10"></circle>
                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                  <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
              </div>
              <h3 class="mb-3 text-xl font-semibold text-contrast-content">
                Browse our FAQs
              </h3>
              <p class="mb-5 text-contrast-content/70">
                Find answers to the most common questions about our product and
                service.
              </p>
              <a
                href="/#qanda"
                class="group inline-flex items-center font-medium text-base-content hover:text-base-content/80"
              >
                View FAQs
                <ArrowRight
                  size={16}
                  class="ml-2 transition-transform group-hover:translate-x-1"
                />
              </a>
            </div>

            <div
              class="transform rounded-xl border border-base-300 bg-base-200 p-6 text-center transition-all duration-300 hover:-translate-y-1 hover:border-base-content/30 hover:shadow-md"
            >
              <div
                class="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-secondary text-secondary-content shadow-sm"
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                  <path
                    d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"
                  ></path>
                </svg>
              </div>
              <h3 class="mb-3 text-xl font-semibold text-contrast-content">
                Knowledge Base
              </h3>
              <p class="mb-5 text-contrast-content/70">
                Explore in-depth articles, guides, and tutorials for detailed
                information.
              </p>
              <a
                href="/knowledge-base"
                class="group inline-flex items-center font-medium text-base-content hover:text-base-content/80"
              >
                Browse articles
                <ArrowRight
                  size={16}
                  class="ml-2 transition-transform group-hover:translate-x-1"
                />
              </a>
            </div>

            <div
              class="transform rounded-xl border border-base-300 bg-base-200 p-6 text-center transition-all duration-300 hover:-translate-y-1 hover:border-base-content/30 hover:shadow-md"
            >
              <div
                class="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-secondary text-secondary-content shadow-sm"
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="3" y1="9" x2="21" y2="9"></line>
                  <line x1="9" y1="21" x2="9" y2="9"></line>
                </svg>
              </div>
              <h3 class="mb-3 text-xl font-semibold text-contrast-content">
                Video Tutorials
              </h3>
              <p class="mb-5 text-contrast-content/70">
                Watch step-by-step videos to learn how to get the most from
                AgSKAN.
              </p>
              <a
                href="https://www.youtube.com/watch?v=SnbBcs5dbCI&list=PLaZBPWNTvXl-tXt0UG1L3TznBT9NW_LQY"
                target="_blank"
                rel="noopener noreferrer"
                class="group inline-flex items-center font-medium text-base-content hover:text-base-content/80"
              >
                Watch tutorials
                <ArrowRight
                  size={16}
                  class="ml-2 transition-transform group-hover:translate-x-1"
                />
              </a>
            </div>
          </div>
        </div>
      {/if}
    </div>
  </section>
</main>
