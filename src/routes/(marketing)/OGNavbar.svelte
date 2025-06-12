<script lang="ts">
  import { page } from "$app/stores"
  import { goto } from "$app/navigation"
  import { onMount } from "svelte"
  import { afterNavigate } from "$app/navigation"
  import { fade } from "svelte/transition"
  import { Menu, X, ArrowRight, Sun, Moon, ChevronDown } from "lucide-svelte"
  import OgTextAnimatedDecoration from "$lib/components/luxe/text-animated-decoration/OgTextAnimatedDecoration.svelte"

  let isMenuOpen = false
  let mounted = false
  let isDarkMode = true
  let isVisible = true
  let lastScrollY = 0
  let isScrollingFromButton = false
  let isNavigating = false
  let isCompanyDropdownOpen = false
  let hoverTimeout: NodeJS.Timeout | null = null

  onMount(() => {
    mounted = true

    const savedTheme = localStorage.getItem("theme")

    if (savedTheme) {
      document.documentElement.setAttribute("data-theme", savedTheme)
      isDarkMode = savedTheme === "skanthemedark"
    } else {
      isDarkMode = true
      const defaultTheme = "skanthemedark"
      document.documentElement.setAttribute("data-theme", defaultTheme)
    }

    const handleScroll = () => {
      if (isScrollingFromButton || isNavigating) return

      const currentScrollY = window.scrollY

      if (currentScrollY < lastScrollY || currentScrollY < 100) {
        isVisible = true
      } else if (currentScrollY > lastScrollY && currentScrollY > 100) {
        isVisible = false
        isMenuOpen = false
        isCompanyDropdownOpen = false
      }

      lastScrollY = currentScrollY
    }

    // Close dropdowns when clicking outside
    const handleClickOutside = (event) => {
      if (!event.target.closest(".dropdown-container")) {
        isCompanyDropdownOpen = false
      }
    }

    window.addEventListener("scroll", handleScroll, { passive: true })
    document.addEventListener("click", handleClickOutside)

    return () => {
      window.removeEventListener("scroll", handleScroll)
      document.removeEventListener("click", handleClickOutside)
    }
  })

  afterNavigate(() => {
    isNavigating = true
    isVisible = true
    isCompanyDropdownOpen = false

    setTimeout(() => {
      isNavigating = false
    }, 1500)
  })

  function toggleTheme() {
    isDarkMode = !isDarkMode
    const newTheme = isDarkMode ? "skanthemedark" : "skantheme"
    document.documentElement.setAttribute("data-theme", newTheme)
    localStorage.setItem("theme", newTheme)
  }

  function toggleMenu() {
    isMenuOpen = !isMenuOpen
    if (isMenuOpen) {
      isCompanyDropdownOpen = false
    }
  }

  function closeMenu() {
    isMenuOpen = false
    isCompanyDropdownOpen = false
  }

  function scrollToSection(elementId: string) {
    closeMenu()
    isNavigating = true
    isVisible = true

    if ($page.url.pathname !== "/") {
      goto(`/#${elementId}`)
      return
    }

    isScrollingFromButton = true

    const element = document.getElementById(elementId)
    if (element) {
      element.scrollIntoView({
        behavior: "smooth",
        block: "start",
      })

      setTimeout(() => {
        isScrollingFromButton = false
        isNavigating = false
      }, 1500)
    }
  }

  // Hover functions for dropdown
  function handleDropdownEnter() {
    if (hoverTimeout) {
      clearTimeout(hoverTimeout)
      hoverTimeout = null
    }
    isCompanyDropdownOpen = true
  }

  function handleDropdownLeave() {
    hoverTimeout = setTimeout(() => {
      isCompanyDropdownOpen = false
    }, 150) // Small delay to prevent flickering when moving cursor
  }

  $: currentPath = $page.url.pathname

  const companyLinks = [
    { href: "/team", label: "About Us" },
    { href: "/contact-us", label: "Contact Us" },
    { href: "/wall-of-love", label: "Wall of Love" },
    { href: "/knowledge-base", label: "Knowledge Base" },
    { href: "/support", label: "Support Center (old)" },
  ]
</script>

<!-- Mobile Menu Backdrop Blur -->
{#if isMenuOpen}
  <div
    class="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm lg:hidden"
    on:click={closeMenu}
    transition:fade={{ duration: 200 }}
  ></div>
{/if}

<!-- Navbar spacer to prevent content jumping -->
<div class="h-16"></div>

<nav
  class="fixed top-0 z-50 w-full bg-base-100 text-contrast-content shadow-sm transition-transform duration-300 {isVisible
    ? 'translate-y-0'
    : '-translate-y-full'}"
>
  <div class="section-container">
    <div class="flex h-16 items-center justify-between">
      <!-- Logo - Left -->
      <a href="/" class="flex items-center gap-2">
        <div
          class="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary"
        >
          <img
            src="/images/logo.svg"
            alt="AgSKAN Gear Logo"
            class="h-11 w-11"
          />
        </div>
        <span
          class="font-archivo text-3xl font-black leading-none text-base-content"
          >AgSKAN</span
        >
      </a>

      <!-- Center Navigation - Desktop Only -->
      <div class="hidden items-center space-x-5 lg:flex">
        <!-- How It Works -->
        <OgTextAnimatedDecoration
          href="javascript:void(0)"
          className="text-base font-semibold cursor-pointer"
          on:click={() => scrollToSection("setup")}
        >
          How It Works
        </OgTextAnimatedDecoration>

        <!-- Pricing -->
        <OgTextAnimatedDecoration
          href="javascript:void(0)"
          className="text-base font-semibold cursor-pointer"
          on:click={() => scrollToSection("pricing")}
        >
          Pricing
        </OgTextAnimatedDecoration>

        <!-- FAQ -->
        <OgTextAnimatedDecoration
          href="javascript:void(0)"
          className="text-base font-semibold cursor-pointer"
          on:click={() => scrollToSection("qanda")}
        >
          FAQ
        </OgTextAnimatedDecoration>

        <!-- Company Dropdown with Hover -->
        <div
          class="dropdown-container relative"
          on:mouseenter={handleDropdownEnter}
          on:mouseleave={handleDropdownLeave}
        >
          <button
            class="flex items-center gap-1 text-base font-semibold transition-colors hover:text-primary"
            on:click={() => (isCompanyDropdownOpen = !isCompanyDropdownOpen)}
          >
            Company
            <ChevronDown
              size={14}
              class="transition-transform duration-200 {isCompanyDropdownOpen
                ? 'rotate-180'
                : ''}"
            />
          </button>

          {#if isCompanyDropdownOpen}
            <div
              class="absolute left-0 top-full mt-2 w-48 rounded-lg bg-base-100 py-2 shadow-lg ring-1 ring-base-content/10"
            >
              {#each companyLinks as link}
                <div class="px-4 py-2">
                  <OgTextAnimatedDecoration
                    href={link.href}
                    className="text-sm font-medium"
                    on:click={closeMenu}
                  >
                    {link.label}
                  </OgTextAnimatedDecoration>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>

      <!-- Right Side - Theme Toggle + Auth Buttons -->
      <div class="hidden items-center space-x-3 lg:flex">
        <!-- Theme Toggle with Flipped Rotation -->
        <label
          class="swap swap-rotate mr-2 cursor-pointer transition-transform duration-200 hover:scale-110 active:scale-95 [&_.swap-rotate>*]:!duration-300"
        >
          <input
            type="checkbox"
            class="sr-only"
            checked={isDarkMode}
            on:change={toggleTheme}
          />

          <!-- Sun icon (shows when dark mode is ON) -->
          <Sun size={24} class="swap-on stroke-current" fill="none" />

          <!-- Moon icon (shows when light mode is ON) -->
          <Moon size={24} class="swap-off stroke-current" fill="none" />
        </label>

        <!-- Auth Buttons -->
        <a href="/login" class="btn btn-outline px-6 text-base">Dashboard</a>
        <a
          href="/login?tab=sign_up"
          class="group btn btn-secondary px-6 text-base shadow-lg transition-all duration-300 hover:shadow-xl hover:shadow-secondary/25"
        >
          Sign Up For Free
          <ArrowRight
            size={16}
            class="ml-2 transition-transform group-hover:translate-x-1"
          />
        </a>
      </div>

      <!-- Mobile Menu Button -->
      <div class="flex items-center space-x-2 lg:hidden">
        <!-- Mobile Theme Toggle -->
        <label
          class="swap swap-rotate cursor-pointer transition-transform duration-200 hover:scale-110 active:scale-95 [&_.swap-rotate>*]:!duration-300"
        >
          <input
            type="checkbox"
            class="sr-only"
            checked={isDarkMode}
            on:change={toggleTheme}
          />

          <Sun size={24} class="swap-on stroke-current" fill="none" />
          <Moon size={24} class="swap-off stroke-current" fill="none" />
        </label>

        <button
          on:click={toggleMenu}
          class="rounded-lg p-2 transition-all duration-200 hover:scale-110 active:scale-95"
          aria-label="Toggle menu"
        >
          {#if isMenuOpen}
            <X size={24} />
          {:else}
            <Menu size={24} />
          {/if}
        </button>
      </div>
    </div>

    <!-- Mobile Navigation -->
    {#if mounted}
      <div
        class="overflow-hidden transition-all duration-300 lg:hidden {isMenuOpen
          ? 'max-h-screen border-t border-base-content/10'
          : 'max-h-0'}"
      >
        <div class="space-y-1 pb-4 pt-4">
          <!-- Mobile Main Links -->
          <button
            class="block w-full rounded-lg p-3 text-left text-base font-semibold text-contrast-content hover:bg-base-200"
            on:click={() => scrollToSection("setup")}
          >
            How It Works
          </button>

          <button
            class="block w-full rounded-lg p-3 text-left text-base font-semibold text-contrast-content hover:bg-base-200"
            on:click={() => scrollToSection("pricing")}
          >
            Pricing
          </button>

          <button
            class="block w-full rounded-lg p-3 text-left text-base font-semibold text-contrast-content hover:bg-base-200"
            on:click={() => scrollToSection("qanda")}
          >
            FAQ
          </button>

          <!-- Mobile Company Section -->
          <div class="mt-2 border-t border-base-content/10 pt-2">
            <div
              class="px-3 py-2 text-sm font-bold uppercase tracking-wide text-base-content/90"
            >
              Company
            </div>
            {#each companyLinks as link}
              <a
                href={link.href}
                on:click={closeMenu}
                class="block rounded-lg p-3 text-base font-semibold text-contrast-content hover:bg-base-200"
              >
                {link.label}
              </a>
            {/each}
          </div>

          <!-- Mobile Auth Buttons -->
          <div class="mt-4 space-y-2 border-t border-base-content/10 pt-4">
            <a
              href="/login"
              on:click={closeMenu}
              class="btn btn-outline w-full px-6 text-base"
            >
              Dashboard
            </a>
            <a
              href="/login?tab=sign_up"
              on:click={closeMenu}
              class="group btn btn-secondary w-full px-6 text-base shadow-lg transition-all duration-300 hover:shadow-xl hover:shadow-secondary/25"
            >
              Sign Up For Free
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
</nav>

<style>
  .font-archivo {
    font-family: "Archivo", Arial, sans-serif;
  }
</style>
