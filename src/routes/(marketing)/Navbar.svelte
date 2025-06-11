<script lang="ts">
  import { page } from "$app/stores"
  import { onMount } from "svelte"
  import { Menu, X, ArrowRight } from "lucide-svelte"
  import TextAnimatedDecoration from "$lib/components/luxe/text-animated-decoration/TextAnimatedDecoration.svelte"

  let isMenuOpen = false
  let mounted = false
  let isDarkMode = false
  let isVisible = true
  let lastScrollY = 0

  onMount(() => {
    mounted = true
    // Check if there's a saved theme preference
    const savedTheme = localStorage.getItem("theme")

    if (savedTheme) {
      document.documentElement.setAttribute("data-theme", savedTheme)
      isDarkMode = savedTheme === "skanthemedark"
    } else {
      // Check system preference
      const systemPrefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)",
      ).matches
      isDarkMode = systemPrefersDark
      const initialTheme = isDarkMode ? "skanthemedark" : "skantheme"

      document.documentElement.setAttribute("data-theme", initialTheme)
      localStorage.setItem("theme", initialTheme)
    }

    // Scroll behavior
    const handleScroll = () => {
      const currentScrollY = window.scrollY

      // Show navbar when scrolling up or at top
      if (currentScrollY < lastScrollY || currentScrollY < 100) {
        isVisible = true
      }
      // Hide navbar when scrolling down
      else if (currentScrollY > lastScrollY && currentScrollY > 100) {
        isVisible = false
        isMenuOpen = false // Close mobile menu when hiding navbar
      }

      lastScrollY = currentScrollY
    }

    window.addEventListener("scroll", handleScroll, { passive: true })

    return () => {
      window.removeEventListener("scroll", handleScroll)
    }
  })

  function toggleTheme() {
    isDarkMode = !isDarkMode
    const newTheme = isDarkMode ? "skanthemedark" : "skantheme"
    document.documentElement.setAttribute("data-theme", newTheme)
    localStorage.setItem("theme", newTheme)
  }

  function toggleMenu() {
    isMenuOpen = !isMenuOpen
  }

  function closeMenu() {
    isMenuOpen = false
  }

  $: currentPath = $page.url.pathname

  const navItems = [
    { href: "/how-it-works", label: "How It Works" },
    { href: "/faq", label: "FAQ" },
    { href: "/pricing", label: "Pricing" },
    { href: "/contact-us", label: "Contact Us" },
  ]
</script>

<!-- Navbar spacer to prevent content jumping -->
<div class="h-16"></div>

<nav
  class="fixed top-0 z-50 w-full bg-neutral text-neutral-content shadow-lg transition-transform duration-300 {isVisible
    ? 'translate-y-0'
    : '-translate-y-full'}"
>
  <div class="section-container">
    <div class="flex h-16 items-center justify-between">
      <!-- Logo - Left -->
      <a href="/" class="flex items-center gap-2">
        <div class="mx-2 h-8 w-px bg-neutral-content/30"></div>
        <div
          class="h-10 w-10 bg-neutral-content"
          style="mask: url('/images/logo.svg') no-repeat center; mask-size: contain; -webkit-mask: url('/images/logo.svg') no-repeat center; -webkit-mask-size: contain;"
        ></div>
        <span class="font-archivo text-2xl font-bold text-neutral-content"
          >AgSKAN</span
        >
      </a>

      <!-- Center Navigation - Desktop Only -->
      <div class="hidden items-center space-x-6 lg:flex">
        {#each navItems as item}
          <TextAnimatedDecoration
            href={item.href}
            className="text-lg font-semibold"
          >
            {item.label}
          </TextAnimatedDecoration>
        {/each}
      </div>

      <!-- Right Side - Theme Toggle + Auth Buttons -->
      <div class="hidden items-center space-x-3 lg:flex">
        <!-- Theme Toggle -->
        <label
          class="swap swap-rotate cursor-pointer transition-transform duration-200 hover:scale-110 active:scale-95"
        >
          <input
            type="checkbox"
            class="theme-controller sr-only"
            checked={isDarkMode}
            on:change={toggleTheme}
          />

          <!-- moon icon (shows in light mode) -->
          <svg
            class="swap-off h-6 w-6 fill-current transition-transform duration-200"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
          >
            <path
              d="M21.64,13a1,1,0,0,0-1.05-.14,8.05,8.05,0,0,1-3.37.73A8.15,8.15,0,0,1,9.08,5.49a8.59,8.59,0,0,1,.25-2A1,1,0,0,0,8,2.36,10.14,10.14,0,1,0,22,14.05,1,1,0,0,0,21.64,13Zm-9.5,6.69A8.14,8.14,0,0,1,7.08,5.22v.27A10.15,10.15,0,0,0,17.22,15.63a9.79,9.79,0,0,0,2.1-.22A8.11,8.11,0,0,1,12.14,19.73Z"
            />
          </svg>

          <!-- sun icon (shows in dark mode) -->
          <svg
            class="swap-on h-6 w-6 fill-current transition-transform duration-200"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
          >
            <path
              d="M5.64,17l-.71.71a1,1,0,0,0,0,1.41,1,1,0,0,0,1.41,0l.71-.71A1,1,0,0,0,5.64,17ZM5,12a1,1,0,0,0-1-1H3a1,1,0,0,0,0,2H4A1,1,0,0,0,5,12Zm7-7a1,1,0,0,0,1-1V3a1,1,0,0,0-2,0V4A1,1,0,0,0,12,5ZM5.64,7.05a1,1,0,0,0,.7.29,1,1,0,0,0,.71-.29,1,1,0,0,0,0-1.41l-.71-.71A1,1,0,0,0,4.93,6.34Zm12,.29a1,1,0,0,0,.7-.29l.71-.71a1,1,0,1,0-1.41-1.41L17,5.64a1,1,0,0,0,0,1.41A1,1,0,0,0,17.66,7.34ZM21,11H20a1,1,0,0,0,0,2h1a1,1,0,0,0,0-2Zm-9,8a1,1,0,0,0-1,1v1a1,1,0,0,0,2,0V20A1,1,0,0,0,12,19ZM18.36,17A1,1,0,0,0,17,18.36l.71.71a1,1,0,0,0,1.41,0,1,1,0,0,0,0-1.41ZM12,6.5A5.5,5.5,0,1,0,17.5,12,5.51,5.51,0,0,0,12,6.5Zm0,9A3.5,3.5,0,1,1,15.5,12,3.5,3.5,0,0,1,12,15.5Z"
            />
          </svg>
        </label>

        <!-- Auth Buttons -->
        <a
          href="/account"
          class="rounded-lg border border-neutral-content px-4 py-2 text-sm font-medium text-neutral-content transition-all duration-200 hover:bg-neutral-content hover:text-neutral"
        >
          Dashboard
        </a>
        <a
          href="/account/sign_up"
          class="group flex items-center rounded-lg bg-hover px-4 py-2 text-sm font-medium text-base-content transition-all duration-200 hover:bg-hover/90"
        >
          Sign Up Free
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
          class="swap swap-rotate cursor-pointer transition-transform duration-200 hover:scale-110 active:scale-95"
        >
          <input
            type="checkbox"
            class="theme-controller sr-only"
            checked={isDarkMode}
            on:change={toggleTheme}
          />

          <!-- moon icon (shows in light mode) -->
          <svg
            class="swap-off h-6 w-6 fill-current transition-transform duration-200"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
          >
            <path
              d="M21.64,13a1,1,0,0,0-1.05-.14,8.05,8.05,0,0,1-3.37.73A8.15,8.15,0,0,1,9.08,5.49a8.59,8.59,0,0,1,.25-2A1,1,0,0,0,8,2.36,10.14,10.14,0,1,0,22,14.05,1,1,0,0,0,21.64,13Zm-9.5,6.69A8.14,8.14,0,0,1,7.08,5.22v.27A10.15,10.15,0,0,0,17.22,15.63a9.79,9.79,0,0,0,2.1-.22A8.11,8.11,0,0,1,12.14,19.73Z"
            />
          </svg>

          <!-- sun icon (shows in dark mode) -->
          <svg
            class="swap-on h-6 w-6 fill-current transition-transform duration-200"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
          >
            <path
              d="M5.64,17l-.71.71a1,1,0,0,0,0,1.41,1,1,0,0,0,1.41,0l.71-.71A1,1,0,0,0,5.64,17ZM5,12a1,1,0,0,0-1-1H3a1,1,0,0,0,0,2H4A1,1,0,0,0,5,12Zm7-7a1,1,0,0,0,1-1V3a1,1,0,0,0-2,0V4A1,1,0,0,0,12,5ZM5.64,7.05a1,1,0,0,0,.7.29,1,1,0,0,0,.71-.29,1,1,0,0,0,0-1.41l-.71-.71A1,1,0,0,0,4.93,6.34Zm12,.29a1,1,0,0,0,.7-.29l.71-.71a1,1,0,1,0-1.41-1.41L17,5.64a1,1,0,0,0,0,1.41A1,1,0,0,0,17.66,7.34ZM21,11H20a1,1,0,0,0,0,2h1a1,1,0,0,0,0-2Zm-9,8a1,1,0,0,0-1,1v1a1,1,0,0,0,2,0V20A1,1,0,0,0,12,19ZM18.36,17A1,1,0,0,0,17,18.36l.71.71a1,1,0,0,0,1.41,0,1,1,0,0,0,0-1.41ZM12,6.5A5.5,5.5,0,1,0,17.5,12,5.51,5.51,0,0,0,12,6.5Zm0,9A3.5,3.5,0,1,1,15.5,12,3.5,3.5,0,0,1,12,15.5Z"
            />
          </svg>
        </label>

        <button
          on:click={toggleMenu}
          class="rounded-lg p-2 text-neutral-content transition-colors duration-200 hover:bg-neutral-content hover:text-neutral"
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
          ? 'max-h-96 border-t border-neutral-content/20'
          : 'max-h-0'}"
      >
        <div class="space-y-1 pb-4 pt-4">
          {#each navItems as item}
            <TextAnimatedDecoration
              href={item.href}
              className="p-3 text-xl font-semibold block"
              on:click={closeMenu}
            >
              {item.label}
            </TextAnimatedDecoration>
          {/each}

          <div class="mt-4 space-y-2 border-t border-neutral-content/20 pt-4">
            <a
              href="/account"
              on:click={closeMenu}
              class="block rounded-lg border border-neutral-content px-3 py-3 text-center text-sm font-medium text-neutral-content transition-all duration-200 hover:bg-neutral-content hover:text-neutral"
            >
              Dashboard
            </a>
            <a
              href="/account/sign_up"
              on:click={closeMenu}
              class="group flex items-center justify-center rounded-lg bg-hover px-3 py-3 text-center text-sm font-medium text-hover-content transition-all duration-200 hover:bg-hover/90"
            >
              Sign Up Free
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
