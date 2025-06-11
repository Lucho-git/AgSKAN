<script lang="ts">
  import { Mail, MapPin, Phone, ArrowRight } from "lucide-svelte"
  import { onMount } from "svelte"

  let mounted = false
  let formStatus: "idle" | "submitting" | "success" | "error" = "idle"
  let formData = {
    name: "",
    email: "",
    subject: "",
    message: "",
  }

  onMount(() => {
    mounted = true
    // Scroll to top when component mounts
    window.scrollTo(0, 0)
  })

  function handleChange(e: Event) {
    const target = e.target as HTMLInputElement | HTMLTextAreaElement
    const { name, value } = target
    formData = { ...formData, [name]: value }
  }

  function handleSubmit(e: Event) {
    e.preventDefault()
    formStatus = "submitting"

    // Simulate form submission
    setTimeout(() => {
      // 90% chance of success
      if (Math.random() > 0.1) {
        formStatus = "success"
        formData = { name: "", email: "", subject: "", message: "" }
      } else {
        formStatus = "error"
      }
    }, 1500)
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
            We're here to help! Whether you have a question about features,
            pricing, or need support, our team is ready to answer all your
            questions.
          </p>
          <div class="mt-8 flex flex-wrap justify-center gap-4">
            <a
              href="#contact-form"
              class="btn btn-secondary px-6 py-3 text-base"
            >
              Send us a message
            </a>
            <a
              href="tel:+61800555247"
              class="btn btn-outline inline-flex items-center px-6 py-3 text-base"
            >
              <Phone size={18} class="mr-2" />
              Call directly
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
                href="/support"
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
                href="https://www.youtube.com/channel/AgSKANTutorials"
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

  <!-- Contact Section -->
  <section class="relative bg-base-200 py-16" id="contact-form">
    <div
      class="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-transparent via-base-content/30 to-transparent"
    ></div>

    <div class="section-container relative z-10">
      {#if mounted}
        <div class="mx-auto max-w-5xl" in:animationDelay={200}>
          <div class="grid gap-10 md:grid-cols-2">
            <!-- Contact Form -->
            <div class="overflow-hidden rounded-xl bg-base-100 shadow-md">
              <div
                class="h-2 bg-gradient-to-r from-base-content to-base-content/80"
              ></div>
              <div class="p-8">
                <h2
                  class="mb-6 font-sans text-2xl font-bold text-contrast-content"
                >
                  Send Us a Message
                </h2>

                {#if formStatus === "success"}
                  <div
                    class="rounded-lg border border-success/30 bg-success/10 p-6 text-center"
                  >
                    <div
                      class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success/20 text-success"
                    >
                      <svg
                        width="28"
                        height="28"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                        <polyline points="22 4 12 14.01 9 11.01"></polyline>
                      </svg>
                    </div>
                    <h3 class="mb-2 text-xl font-bold text-contrast-content">
                      Message Sent!
                    </h3>
                    <p class="mb-4 text-success">
                      Thank you for reaching out. We'll get back to you as soon
                      as possible.
                    </p>
                    <button
                      on:click={() => (formStatus = "idle")}
                      class="font-medium text-base-content underline hover:text-base-content/80"
                    >
                      Send another message
                    </button>
                  </div>
                {:else}
                  <form on:submit={handleSubmit} class="space-y-5">
                    <div>
                      <label
                        class="mb-2 block text-sm font-medium text-contrast-content"
                      >
                        Your Name <span class="text-error">*</span>
                      </label>
                      <input
                        type="text"
                        name="name"
                        bind:value={formData.name}
                        on:input={handleChange}
                        required
                        class="w-full rounded-lg border border-base-300 bg-base-100 px-4 py-3 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-base-content"
                        placeholder="John Doe"
                      />
                    </div>

                    <div>
                      <label
                        class="mb-2 block text-sm font-medium text-contrast-content"
                      >
                        Your Email <span class="text-error">*</span>
                      </label>
                      <input
                        type="email"
                        name="email"
                        bind:value={formData.email}
                        on:input={handleChange}
                        required
                        class="w-full rounded-lg border border-base-300 bg-base-100 px-4 py-3 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-base-content"
                        placeholder="john@example.com"
                      />
                    </div>

                    <div>
                      <label
                        class="mb-2 block text-sm font-medium text-contrast-content"
                      >
                        Subject <span class="text-error">*</span>
                      </label>
                      <input
                        type="text"
                        name="subject"
                        bind:value={formData.subject}
                        on:input={handleChange}
                        required
                        class="w-full rounded-lg border border-base-300 bg-base-100 px-4 py-3 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-base-content"
                        placeholder="What can we help you with?"
                      />
                    </div>

                    <div>
                      <label
                        class="mb-2 block text-sm font-medium text-contrast-content"
                      >
                        Message <span class="text-error">*</span>
                      </label>
                      <textarea
                        rows="5"
                        name="message"
                        bind:value={formData.message}
                        on:input={handleChange}
                        required
                        class="w-full resize-none rounded-lg border border-base-300 bg-base-100 px-4 py-3 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-base-content"
                        placeholder="Please describe how we can help you..."
                      ></textarea>
                    </div>

                    <div class="pt-2">
                      <button
                        type="submit"
                        disabled={formStatus === "submitting"}
                        class={`relative w-full overflow-hidden rounded-lg px-6 py-3 font-medium text-base-100 transition-all duration-300 ${
                          formStatus === "submitting"
                            ? "cursor-not-allowed bg-base-content/80"
                            : "bg-base-content hover:bg-base-content/90 hover:shadow-lg"
                        }`}
                      >
                        {#if formStatus === "submitting"}
                          <span class="flex items-center justify-center">
                            <svg
                              class="-ml-1 mr-3 h-5 w-5 animate-spin text-base-100"
                              xmlns="http://www.w3.org/2000/svg"
                              fill="none"
                              viewBox="0 0 24 24"
                            >
                              <circle
                                class="opacity-25"
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                stroke-width="4"
                              ></circle>
                              <path
                                class="opacity-75"
                                fill="currentColor"
                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                              ></path>
                            </svg>
                            Sending...
                          </span>
                        {:else if formStatus === "error"}
                          <span>
                            Try Again
                            <svg
                              class="ml-2 inline-block h-5 w-5"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              stroke-width="2"
                              stroke-linecap="round"
                              stroke-linejoin="round"
                            >
                              <path
                                d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"
                              ></path>
                              <path d="M3 3v5h5"></path>
                              <path
                                d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"
                              ></path>
                              <path d="M16 21h5v-5"></path>
                            </svg>
                          </span>
                        {:else}
                          Send Message
                        {/if}
                      </button>

                      {#if formStatus === "error"}
                        <div class="mt-3 text-center text-sm text-error">
                          There was a problem sending your message. Please try
                          again.
                        </div>
                      {/if}
                    </div>
                  </form>
                {/if}
              </div>
            </div>

            <!-- Contact Info -->
            <div class="flex flex-col gap-6">
              <div class="rounded-xl bg-base-100 p-8 shadow-md">
                <h2
                  class="mb-6 font-sans text-2xl font-bold text-contrast-content"
                >
                  Contact Information
                </h2>

                <div class="space-y-6">
                  <div class="flex items-start gap-4">
                    <div
                      class="mt-1 flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-content shadow-sm"
                    >
                      <Phone size={24} />
                    </div>
                    <div>
                      <h3
                        class="mb-2 text-lg font-semibold text-contrast-content"
                      >
                        Phone Support
                      </h3>
                      <a
                        href="tel:+61800555247"
                        class="block text-lg font-medium text-base-content hover:underline"
                      >
                        +61 (800) 555-AGSK
                      </a>
                      <p class="mt-2 text-contrast-content/70">
                        Available Monday - Friday<br />
                        8:00 AM - 6:00 PM (AEST)
                      </p>
                    </div>
                  </div>

                  <div class="flex items-start gap-4">
                    <div
                      class="mt-1 flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-content shadow-sm"
                    >
                      <Mail size={24} />
                    </div>
                    <div>
                      <h3
                        class="mb-2 text-lg font-semibold text-contrast-content"
                      >
                        Email Us
                      </h3>
                      <a
                        href="mailto:support@skanfarming.com.au"
                        class="block text-lg font-medium text-base-content hover:underline"
                      >
                        support@skanfarming.com.au
                      </a>
                      <p class="mt-2 text-contrast-content/70">
                        For general inquiries and support<br />
                        We typically respond within 24 hours
                      </p>
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
</main>
