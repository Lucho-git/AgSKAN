<script lang="ts">
  import {
    Facebook,
    Instagram,
    Mail,
    MapPin,
    Phone,
    Twitter,
  } from "lucide-svelte"
  import FooterLink from "$lib/components/luxe/footerlink/FooterLink.svelte"
  import { onMount } from "svelte"

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

  const currentYear = new Date().getFullYear()
</script>

<div class="flex-grow"></div>
<footer class="relative overflow-hidden bg-base-200">
  <!-- Top divider -->
  <div
    class="h-px bg-gradient-to-r from-transparent via-contrast-content/20 to-transparent"
  ></div>

  <div class="section-container relative z-10 pb-8 pt-12">
    {#if mounted}
      <div
        class="mb-12 grid grid-cols-1 gap-8 md:grid-cols-12"
        in:animationDelay={0}
      >
        <!-- Company info -->
        <div class="md:col-span-5">
          <div class="mb-4 flex items-center">
            <span
              class="mr-2 bg-gradient-to-r from-primary to-secondary bg-clip-text font-archivo text-2xl font-bold text-transparent"
              >AgSKAN</span
            >
            <div class="mx-2 h-5 w-px bg-contrast-content/30"></div>
            <span class="text-sm text-contrast-content/70"
              >Farming Logistics</span
            >
          </div>

          <p
            class="mb-6 max-w-md text-sm leading-relaxed text-contrast-content/80"
          >
            Simple farm tracking that brings real-time visibility to your
            operation, without the complexity of traditional farm tech.
          </p>

          <div
            class="mb-6 flex items-start gap-3 text-sm text-contrast-content/70"
          >
            <MapPin size={16} class="mt-1 flex-shrink-0 text-primary" />
            <div>
              SKAN Farming Logistics Pty Ltd<br />
              ABN: 26 675 693 464
            </div>
          </div>
        </div>

        <!-- Links & Info -->
        <div class="md:col-span-7">
          <div class="grid grid-cols-1 gap-8 sm:grid-cols-3">
            <!-- Links -->
            <div>
              <h4
                class="mb-4 text-lg font-bold uppercase tracking-wide text-primary"
              >
                Links
              </h4>
              <ul class="space-y-2">
                <li>
                  <FooterLink
                    href="/contact"
                    className="text-contrast-content/80 transition-colors py-1 inline-block"
                  >
                    Contact Us
                  </FooterLink>
                </li>
                <li>
                  <FooterLink
                    href="/about"
                    className="text-contrast-content/80 transition-colors py-1 inline-block"
                  >
                    About Us
                  </FooterLink>
                </li>
                <li>
                  <FooterLink
                    href="/knowledge-base"
                    className="text-contrast-content/80 transition-colors py-1 inline-block"
                  >
                    Knowledge Base
                  </FooterLink>
                </li>
                <li>
                  <FooterLink
                    href="/wall-of-love"
                    className="text-contrast-content/80 transition-colors py-1 inline-block"
                  >
                    Wall of Love
                  </FooterLink>
                </li>
                <li>
                  <FooterLink
                    href="#pricing"
                    className="text-contrast-content/80 transition-colors py-1 inline-block"
                  >
                    Pricing
                  </FooterLink>
                </li>
              </ul>
            </div>

            <!-- Legal -->
            <div>
              <h4
                class="mb-4 text-lg font-bold uppercase tracking-wide text-primary"
              >
                Legal
              </h4>
              <ul class="space-y-2">
                <li>
                  <FooterLink
                    href="/docs/terms_of_service.pdf"
                    target="_blank"
                    className="text-contrast-content/80 transition-colors py-1 inline-block"
                  >
                    Terms of Service
                  </FooterLink>
                </li>
                <li>
                  <FooterLink
                    href="/docs/SKAN-Privacy-Policy.pdf"
                    target="_blank"
                    className="text-contrast-content/80 transition-colors py-1 inline-block"
                  >
                    Privacy Policy
                  </FooterLink>
                </li>
                <li>
                  <FooterLink
                    href="/"
                    className="text-contrast-content/80 transition-colors py-1 inline-block"
                  >
                    Data Security
                  </FooterLink>
                </li>
              </ul>
            </div>

            <!-- Contact -->
            <div>
              <h4
                class="mb-4 text-lg font-bold uppercase tracking-wide text-primary"
              >
                Contact
              </h4>
              <div class="mt-2 grid max-w-[160px] grid-cols-3 gap-3">
                <a
                  href="https://twitter.com/SKANfarming"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="flex h-10 w-10 items-center justify-center rounded-full bg-contrast-content/10 text-contrast-content/70 transition-all duration-300 hover:scale-110 hover:bg-primary hover:text-base-100 hover:shadow-md hover:shadow-primary/20"
                >
                  <Twitter size={18} />
                </a>
                <a
                  href="#"
                  class="flex h-10 w-10 items-center justify-center rounded-full bg-contrast-content/10 text-contrast-content/70 transition-all duration-300 hover:scale-105 hover:bg-primary hover:text-base-100"
                >
                  <Instagram size={18} />
                </a>
                <a
                  href="mailto:support@skanfarming.com.au"
                  class="flex h-10 w-10 items-center justify-center rounded-full bg-contrast-content/10 text-contrast-content/70 transition-all duration-300 hover:scale-105 hover:bg-primary hover:text-base-100"
                >
                  <Mail size={18} />
                </a>
                <a
                  href="tel:+61439405248"
                  class="flex h-10 w-10 items-center justify-center rounded-full bg-contrast-content/10 text-contrast-content/70 transition-all duration-300 hover:scale-105 hover:bg-primary hover:text-base-100"
                >
                  <Phone size={18} />
                </a>
                <a
                  href="#"
                  class="flex h-10 w-10 items-center justify-center rounded-full bg-contrast-content/10 text-contrast-content/70 transition-all duration-300 hover:scale-105 hover:bg-primary hover:text-base-100"
                >
                  <Facebook size={18} />
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Bottom section -->
      <div
        class="mb-6 h-px bg-gradient-to-r from-transparent via-contrast-content/20 to-transparent"
      ></div>

      <div
        class="flex flex-col items-center justify-between gap-3 text-sm text-contrast-content/70 md:flex-row"
        in:animationDelay={200}
      >
        <div class="font-medium">
          &copy; {currentYear} SKAN Farming Logistics. All rights reserved.
        </div>
        <div class="flex items-center">
          Made with <span class="mx-1 text-red-500">❤</span> in Australia for farmers
        </div>
      </div>
    {/if}
  </div>
</footer>

<style>
  .font-archivo {
    font-family: "Archivo", Arial, sans-serif;
  }
</style>
