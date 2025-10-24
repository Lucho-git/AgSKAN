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
<footer class="relative overflow-hidden bg-neutral text-neutral-content">
  <!-- Top divider -->
  <div
    class="h-px bg-gradient-to-r from-transparent via-neutral-content/20 to-transparent"
  ></div>

  <div class="section-container relative z-10 pb-8 pt-12">
    {#if mounted}
      <div
        class="mb-12 grid grid-cols-1 gap-8 md:grid-cols-12"
        in:animationDelay={0}
      >
        <!-- Company info -->
        <div class="md:col-span-5">
          <div class="mb-6">
            <div class="mb-2 flex items-center justify-start gap-3">
              <div
                class="h-12 w-12 bg-neutral-content"
                style="mask: url('/images/logo.svg') no-repeat center; mask-size: contain; -webkit-mask: url('/images/logo.svg') no-repeat center; -webkit-mask-size: contain;"
              ></div>
              <span class="font-archivo text-3xl font-bold text-neutral-content"
                >AgSKAN</span
              >
            </div>
            <div
              class="h-px w-32 bg-gradient-to-r from-neutral-content/30 to-transparent"
            ></div>
          </div>

          <p
            class="mb-6 max-w-md text-sm leading-relaxed text-neutral-content/80"
          >
            Simple farm tracking that brings real-time visibility to your
            operation, without the complexity of traditional farm tech.
          </p>

          <div
            class="mb-6 flex items-start gap-3 text-sm text-neutral-content/70"
          >
            <MapPin size={16} class="mt-1 flex-shrink-0 text-neutral-content" />
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
                class="mb-4 text-lg font-bold uppercase tracking-wide text-neutral-content"
              >
                Links
              </h4>
              <ul class="space-y-2">
                <li>
                  <FooterLink
                    href="/contact-us"
                    className="transition-colors py-1 inline-block"
                  >
                    Contact Us
                  </FooterLink>
                </li>
                <li>
                  <FooterLink
                    href="/team"
                    className="transition-colors py-1 inline-block"
                  >
                    About Us
                  </FooterLink>
                </li>
                <li>
                  <FooterLink
                    href="/knowledge-base"
                    className="transition-colors py-1 inline-block"
                  >
                    Knowledge Base
                  </FooterLink>
                </li>
                <li>
                  <FooterLink
                    href="#pricing"
                    className="transition-colors py-1 inline-block"
                  >
                    Pricing
                  </FooterLink>
                </li>
              </ul>
            </div>

            <!-- Contact -->
            <div>
              <h4
                class="mb-4 text-lg font-bold uppercase tracking-wide text-neutral-content"
              >
                Contact
              </h4>
              <div class="flex flex-col gap-3">
                <a
                  href="mailto:support@skanfarming.com.au"
                  class="flex items-center gap-2 text-sm text-neutral-content/70 transition-colors hover:text-neutral-content"
                >
                  <Mail size={16} />
                  <span>Email Us</span>
                </a>
                <a
                  href="tel:+61439405248"
                  class="flex items-center gap-2 text-sm text-neutral-content/70 transition-colors hover:text-neutral-content"
                >
                  <Phone size={16} />
                  <span>Call Us</span>
                </a>
              </div>
            </div>

            <!-- Socials -->
            <div>
              <h4
                class="mb-4 text-lg font-bold uppercase tracking-wide text-neutral-content"
              >
                Follow Us
              </h4>
              <div class="flex gap-3">
                <a
                  href="https://twitter.com/SKANfarming"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-content/10 text-neutral-content/70 transition-all duration-300 hover:scale-110 hover:bg-neutral-content hover:text-neutral hover:shadow-md hover:shadow-neutral-content/20"
                >
                  <Twitter size={18} />
                </a>
                <a
                  href="https://www.instagram.com/skanfarming"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-content/10 text-neutral-content/70 transition-all duration-300 hover:scale-105 hover:bg-neutral-content hover:text-neutral"
                >
                  <Instagram size={18} />
                </a>
                <a
                  href="https://www.facebook.com/p/SKAN-Farming-61558331905426/"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-content/10 text-neutral-content/70 transition-all duration-300 hover:scale-105 hover:bg-neutral-content hover:text-neutral"
                >
                  <Facebook size={18} />
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Bottom copyright row -->
      <div class="border-t border-neutral-content/10 pt-6">
        <div
          class="flex flex-col items-center justify-between gap-4 text-sm text-neutral-content/60 sm:flex-row"
        >
          <p>
            © {currentYear} SKAN Farming Logistics Pty Ltd. All rights reserved.
          </p>
          <nav class="flex gap-6">
            <a
              href="/terms-of-service"
              class="transition-colors hover:text-neutral-content"
            >
              Terms of Service
            </a>
            <a
              href="/privacy-policy"
              class="transition-colors hover:text-neutral-content"
            >
              Privacy Policy
            </a>
          </nav>
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
