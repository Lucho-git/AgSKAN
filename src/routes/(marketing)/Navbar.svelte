<script lang="ts">
  import { Menu, ArrowRight } from "lucide-svelte"
  import { Button } from "$lib/components/ui/button"
  import { cn } from "$lib/utils"
  import TextAnimatedDecoration from "$lib/components/luxe/text-animated-decoration/TextAnimatedDecoration.svelte"
  import { onMount } from "svelte"

  let isMenuOpen = false
  let isDarkMode = false

  onMount(() => {
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
  })

  function toggleTheme() {
    isDarkMode = !isDarkMode
    const newTheme = isDarkMode ? "skanthemedark" : "skantheme"
    document.documentElement.setAttribute("data-theme", newTheme)
    localStorage.setItem("theme", newTheme)
  }
</script>

<nav
  class="sticky top-0 z-50 w-full bg-base-100 text-contrast-content shadow-sm"
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

      <!-- Center Navigation Links - Desktop -->
      <nav class="hidden items-center gap-6 lg:flex">
        <TextAnimatedDecoration
          href="/support"
          className="text-lg font-semibold "
        >
          Support
        </TextAnimatedDecoration>
        <TextAnimatedDecoration href="/team" className="text-lg font-semibold ">
          Team
        </TextAnimatedDecoration>
        <TextAnimatedDecoration
          href="/pricing"
          className="text-lg font-semibold "
        >
          Pricing
        </TextAnimatedDecoration>
      </nav>

      <!-- Right Side Buttons - Desktop -->
      <div class="hidden items-center gap-3 lg:flex">
        <!-- Theme Toggle Button -->
        <label
          class="swap swap-rotate cursor-pointer transition-transform duration-200 hover:scale-110 active:scale-95"
        >
          <input
            type="checkbox"
            class="theme-controller sr-only"
            checked={isDarkMode}
            on:change={toggleTheme}
          />

          <!-- sun icon -->
          <svg
            class="swap-off h-6 w-6 fill-current transition-all duration-200 hover:text-yellow-500"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
          >
            <path
              d="M5.64,17l-.71.71a1,1,0,0,0,0,1.41,1,1,0,0,0,1.41,0l.71-.71A1,1,0,0,0,5.64,17ZM5,12a1,1,0,0,0-1-1H3a1,1,0,0,0,0,2H4A1,1,0,0,0,5,12Zm7-7a1,1,0,0,0,1-1V3a1,1,0,0,0-2,0V4A1,1,0,0,0,12,5ZM5.64,7.05a1,1,0,0,0,.7.29,1,1,0,0,0,.71-.29,1,1,0,0,0,0-1.41l-.71-.71A1,1,0,0,0,4.93,6.34Zm12,.29a1,1,0,0,0,.7-.29l.71-.71a1,1,0,1,0-1.41-1.41L17,5.64a1,1,0,0,0,0,1.41A1,1,0,0,0,17.66,7.34ZM21,11H20a1,1,0,0,0,0,2h1a1,1,0,0,0,0-2Zm-9,8a1,1,0,0,0-1,1v1a1,1,0,0,0,2,0V20A1,1,0,0,0,12,19ZM18.36,17A1,1,0,0,0,17,18.36l.71.71a1,1,0,0,0,1.41,0,1,1,0,0,0,0-1.41ZM12,6.5A5.5,5.5,0,1,0,17.5,12,5.51,5.51,0,0,0,12,6.5Zm0,9A3.5,3.5,0,1,1,15.5,12,3.5,3.5,0,0,1,12,15.5Z"
            />
          </svg>

          <!-- moon icon -->
          <svg
            class="swap-on h-6 w-6 fill-current transition-all duration-200 hover:text-blue-400"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
          >
            <path
              d="M21.64,13a1,1,0,0,0-1.05-.14,8.05,8.05,0,0,1-3.37.73A8.15,8.15,0,0,1,9.08,5.49a8.59,8.59,0,0,1,.25-2A1,1,0,0,0,8,2.36,10.14,10.14,0,1,0,22,14.05,1,1,0,0,0,21.64,13Zm-9.5,6.69A8.14,8.14,0,0,1,7.08,5.22v.27A10.15,10.15,0,0,0,17.22,15.63a9.79,9.79,0,0,0,2.1-.22A8.11,8.11,0,0,1,12.14,19.73Z"
            />
          </svg>
        </label>

        <!-- Login Button (DaisyUI Ghost) -->

        <a href="/login" class="btn btn-outline">Login</a>

        <!-- Sign Up Button (DaisyUI Filled with Arrow) -->
        <a href="/signup" class="btn btn-secondary">
          Sign Up For Free
          <ArrowRight class="h-4 w-4" />
        </a>
      </div>

      <!-- Mobile Menu Button -->
      <Button
        variant="ghost"
        size="icon"
        class="h-8 w-8  lg:hidden"
        on:click={() => (isMenuOpen = !isMenuOpen)}
      >
        {#if isMenuOpen}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-6 w-6"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        {:else}
          <Menu class="h-6 w-6" />
        {/if}
        <span class="sr-only">Toggle menu</span>
      </Button>
    </div>

    <!-- Mobile Menu -->
    {#if isMenuOpen}
      <div class="border-t border-base-content/10 lg:hidden">
        <div class="py-4">
          <nav class="flex flex-col gap-6">
            <TextAnimatedDecoration
              href="/support"
              className="p-3 text-2xl font-semibold "
              on:click={() => (isMenuOpen = false)}
            >
              Support
            </TextAnimatedDecoration>
            <TextAnimatedDecoration
              href="/team"
              className="p-3 text-2xl font-semibold "
              on:click={() => (isMenuOpen = false)}
            >
              Team
            </TextAnimatedDecoration>
            <TextAnimatedDecoration
              href="/pricing"
              className="p-3 text-2xl font-semibold "
              on:click={() => (isMenuOpen = false)}
            >
              Pricing
            </TextAnimatedDecoration>

            <!-- Mobile buttons -->
            <div class="flex flex-col gap-3 pt-4">
              <a
                href="/login"
                class="btn btn-outline btn-sm"
                on:click={() => (isMenuOpen = false)}>Login</a
              >
              <a
                href="/signup"
                class="btn btn-secondary btn-sm"
                on:click={() => (isMenuOpen = false)}
              >
                Sign Up For Free
                <ArrowRight class="h-4 w-4" />
              </a>

              <!-- Mobile Theme Toggle -->
              <label
                class="swap swap-rotate cursor-pointer self-start transition-transform duration-200 hover:scale-110 active:scale-95"
              >
                <input
                  type="checkbox"
                  class="theme-controller sr-only"
                  checked={isDarkMode}
                  on:change={toggleTheme}
                />

                <!-- sun icon -->
                <svg
                  class="swap-off h-6 w-6 fill-current transition-all duration-200 hover:text-yellow-500"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M5.64,17l-.71.71a1,1,0,0,0,0,1.41,1,1,0,0,0,1.41,0l.71-.71A1,1,0,0,0,5.64,17ZM5,12a1,1,0,0,0-1-1H3a1,1,0,0,0,0,2H4A1,1,0,0,0,5,12Zm7-7a1,1,0,0,0,1-1V3a1,1,0,0,0-2,0V4A1,1,0,0,0,12,5ZM5.64,7.05a1,1,0,0,0,.7.29,1,1,0,0,0,.71-.29,1,1,0,0,0,0-1.41l-.71-.71A1,1,0,0,0,4.93,6.34Zm12,.29a1,1,0,0,0,.7-.29l.71-.71a1,1,0,1,0-1.41-1.41L17,5.64a1,1,0,0,0,0,1.41A1,1,0,0,0,17.66,7.34ZM21,11H20a1,1,0,0,0,0,2h1a1,1,0,0,0,0-2Zm-9,8a1,1,0,0,0-1,1v1a1,1,0,0,0,2,0V20A1,1,0,0,0,12,19ZM18.36,17A1,1,0,0,0,17,18.36l.71.71a1,1,0,0,0,1.41,0,1,1,0,0,0,0-1.41ZM12,6.5A5.5,5.5,0,1,0,17.5,12,5.51,5.51,0,0,0,12,6.5Zm0,9A3.5,3.5,0,1,1,15.5,12,3.5,3.5,0,0,1,12,15.5Z"
                  />
                </svg>

                <!-- moon icon -->
                <svg
                  class="swap-on h-6 w-6 fill-current transition-all duration-200 hover:text-blue-400"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M21.64,13a1,1,0,0,0-1.05-.14,8.05,8.05,0,0,1-3.37.73A8.15,8.15,0,0,1,9.08,5.49a8.59,8.59,0,0,1-.25-2A1,1,0,0,0,8,2.36,10.14,10.14,0,1,0,22,14.05,1,1,0,0,0,21.64,13Zm-9.5,6.69A8.14,8.14,0,0,1,7.08,5.22v.27A10.15,10.15,0,0,0,17.22,15.63a9.79,9.79,0,0,0,2.1-.22A8.11,8.11,0,0,1,12.14,19.73Z"
                  />
                </svg>
              </label>
            </div>
          </nav>
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
