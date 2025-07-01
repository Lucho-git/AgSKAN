<script lang="ts">
  import { page } from "$app/stores"
  import { afterNavigate, goto } from "$app/navigation"
  import "../../../../app.css"
  import { writable, derived } from "svelte/store"
  import { setContext, onMount } from "svelte"
  import icons from "$lib/icons"
  import Icon from "@iconify/svelte"
  import { toast } from "svelte-sonner"
  import { profileStore } from "$lib/stores/profileStore"
  import { subscriptionStore } from "$lib/stores/subscriptionStore"
  import { connectedMapStore } from "$lib/stores/connectedMapStore"
  import { mapActivityStore } from "$lib/stores/mapActivityStore"
  import { browser } from "$app/environment"
  import { Capacitor } from "@capacitor/core"

  import CrispChatWidget from "../../../../components/CrispChatWidget.svelte"

  const adminSectionStore = writable("")
  const isNavigating = writable(false)
  setContext("adminSection", adminSectionStore)

  // Theme state
  let isDarkMode = false

  // When navigation completes, update this flag
  afterNavigate(() => {
    isNavigating.set(false)
  })

  let isExpanded = true

  const shouldShowDrawer = derived(
    page,
    ($page) => !$page.url.pathname.includes("/account/mapviewer"),
  )

  function toggleSidebar() {
    isExpanded = !isExpanded
  }

  let crispComponent: any

  function handleChatClick() {
    if (crispComponent) {
      crispComponent.toggleChat()
    }
  }

  // Theme functions
  function initializeTheme() {
    if (!browser) return

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
  }

  function toggleTheme() {
    if (!browser) return

    isDarkMode = !isDarkMode
    const newTheme = isDarkMode ? "skanthemedark" : "skantheme"
    document.documentElement.setAttribute("data-theme", newTheme)
    localStorage.setItem("theme", newTheme)

    toast.success(`Switched to ${isDarkMode ? "dark" : "light"} mode`)
  }

  onMount(() => {
    initializeTheme()
  })

  const selectedColor = "bg-neutral"
  // Updated to match mobile navbar highlighting
  const activeColor = "bg-neutral-content text-neutral"
  const hoverColor = "hover:bg-neutral-content hover:text-neutral group"
  // Removed pointer-events-none to allow clicks on disabled items
  const disabledColor = "opacity-50 cursor-not-allowed"

  // Check if connected to a map
  $: isMapConnected = Boolean($connectedMapStore?.id)

  const menuItems = [
    {
      href: "/account",
      icon: "solar:home-bold-duotone",
      label: "Home",
      labelId: "home",
      topBarIcon: "solar:home-angle-bold-duotone",
      topBarLabel: "Dashboard",
      path: "home",
    },
    {
      href: "/account/mapviewer",
      icon: "solar:map-point-wave-bold-duotone",
      label: "Map",
      labelId: "mapviewer",
      topBarIcon: "solar:map-point-search-bold-duotone",
      topBarLabel: "Map Viewer",
      path: "mapviewer",
      requiresMap: true,
      tooltip: "Connect to a map first to access the map viewer",
    },
    {
      href: "/account/fieldview",
      icon: "solar:map-bold-duotone",
      label: "Fields",
      labelId: "fieldview",
      topBarIcon: "solar:map-bold-duotone",
      topBarLabel: "Field Overview",
      path: "fieldview",
      requiresMap: true,
      tooltip: "Connect to a map first to access the field overview",
    },
    // {
    //   href: "/account/pathplanner",
    //   icon: "solar:routing-2-bold-duotone",
    //   label: "Paths",
    //   labelId: "pathplanner",
    //   topBarIcon: "solar:routing-2-bold-duotone",
    //   topBarLabel: "Path Planner",
    //   path: "pathplanner",
    // },
    {
      href: browser && Capacitor.isNativePlatform() ? "#" : "/account/billing",
      icon: "solar:wallet-money-bold-duotone",
      label: "Billing",
      labelId: "billing",
      topBarIcon: "solar:bill-list-bold-duotone",
      topBarLabel: "Billing & Invoices",
      path: "billing",
      disabled: browser && Capacitor.isNativePlatform(),
      tooltip:
        browser && Capacitor.isNativePlatform()
          ? "Billing is not available in the mobile app"
          : undefined,
    },
    {
      href: "/account/settings",
      icon: "solar:settings-bold-duotone",
      label: "Settings",
      labelId: "settings",
      topBarIcon: "solar:settings-minimalistic-bold-duotone",
      topBarLabel: "Account Settings",
      path: "settings",
    },
  ]

  // Directly determine the current section from the URL path
  $: {
    const path = $page.url.pathname
    if (path === "/account" || path === "/account/") {
      $adminSectionStore = "home"
    } else {
      // Extract the part after "/account/"
      const pathPart = path.split("/account/")[1]?.split("/")[0]
      $adminSectionStore = pathPart || "home"
    }
  }

  $: currentSection = $adminSectionStore

  // Function to handle navigation
  function handleNavigation(e, item) {
    // Always prevent default first
    e.preventDefault()

    // Check if item requires map connection and we're not connected
    const itemDisabled = item.disabled || (item.requiresMap && !isMapConnected)

    // Handle disabled items
    if (itemDisabled) {
      // Show different toast messages based on the reason for being disabled
      if (item.requiresMap && !isMapConnected) {
        // Create a toast with action button
        toast("You need to connect to a map first", {
          description: "Create or connect to a map to access this feature",
          action: {
            label: "Go to Home",
            onClick: () => {
              goto("/account")
            },
          },
          duration: 5000,
        })
      } else if (item.tooltip) {
        toast.info(item.tooltip)
      }
      return
    }

    // If not disabled, proceed with navigation
    // Only set flag to true if navigating to a different section
    if (currentSection !== item.path) {
      isNavigating.set(true)
    }

    // Use SvelteKit's goto for instant navigation
    goto(item.href)
  }

  // Function to check if an item should be disabled - make this more explicit
  $: getItemDisabledStatus = (item) => {
    if (item.disabled) return true
    if (item.requiresMap && !isMapConnected) return true
    return false
  }

  // Wait for stores to be populated
  $: storesReady =
    browser && $profileStore?.id && $subscriptionStore?.subscription
</script>

<div class="drawer lg:drawer-open">
  <input id="admin-drawer" type="checkbox" class="drawer-toggle" />

  <div class="drawer-content flex min-h-screen flex-col">
    {#if $shouldShowDrawer}
      <!-- Mobile Top Bar -->
      <div
        class="fixed-top fixed left-0 right-0 top-0 z-50 flex items-center justify-between bg-neutral p-1 text-neutral-content lg:hidden"
      >
        <div class="flex items-center">
          <Icon
            icon={menuItems.find((item) => item.path === currentSection)
              ?.topBarIcon || menuItems[0].topBarIcon}
            width="24"
            height="24"
          />
          <span class="ml-3 font-semibold"
            >{menuItems.find((item) => item.path === currentSection)
              ?.topBarLabel || menuItems[0].topBarLabel}</span
          >
        </div>
        <div class="flex items-center gap-2">
          <!-- Mobile Theme Toggle -->
          <button
            on:click={toggleTheme}
            class="hover:bg-neutral-focus rounded-full p-1 transition-colors duration-200"
          >
            <Icon
              icon={isDarkMode
                ? "solar:sun-bold-duotone"
                : "solar:moon-bold-duotone"}
              width="20"
              height="20"
            />
          </button>
          <!-- Chat Button -->
          <button
            on:click={handleChatClick}
            class="bg-neutral-focus rounded-full p-1 transition-colors duration-200"
          >
            <Icon
              icon="solar:chat-round-line-bold-duotone"
              width="24"
              height="24"
            />
          </button>
        </div>
      </div>
    {/if}

    <div class="flex-grow overflow-auto pb-16 pt-14 lg:pb-0 lg:pt-0">
      <div class="container px-6 py-3 lg:px-12 lg:py-6">
        <slot />
      </div>
    </div>

    {#if $shouldShowDrawer}
      <!-- Mobile Bottom Navbar -->
      <nav
        class="fixed bottom-0 left-0 right-0 z-50 bg-neutral text-neutral-content lg:hidden"
      >
        <ul class="flex h-16 items-stretch">
          {#each menuItems as item}
            {@const isItemDisabled = getItemDisabledStatus(item)}
            <li class="flex-1">
              <button
                on:click={(e) => handleNavigation(e, item)}
                class="flex h-full w-full flex-col items-center justify-center p-1
                    {!$isNavigating && currentSection === item.path
                  ? 'bg-neutral-content text-neutral'
                  : ''} 
                    {isItemDisabled
                  ? disabledColor
                  : 'transition-colors duration-200 hover:bg-neutral-content hover:text-neutral'}"
              >
                <Icon icon={item.icon} width="24" height="24" />
                <span class="mt-1 text-xs">{item.label}</span>
              </button>
            </li>
          {/each}
        </ul>
      </nav>
    {/if}
  </div>

  {#if $shouldShowDrawer}
    <!-- Desktop Sidebar -->
    <div class="drawer-side">
      <label for="admin-drawer" class="drawer-overlay"></label>
      <ul
        class="menu menu-lg min-h-full w-80 p-4 {selectedColor} text-neutral-content lg:border-r"
        class:w-80={isExpanded}
        class:w-35={!isExpanded}
      >
        <li class="my-1">
          <button
            class="no-focus-active flex w-full items-center rounded-lg bg-neutral px-5 hover:bg-neutral-content hover:text-neutral"
            on:click={toggleSidebar}
          >
            <Icon
              icon={isExpanded
                ? "solar:alt-arrow-left-bold-duotone"
                : "solar:alt-arrow-right-bold-duotone"}
              width="28"
              height="28"
            />
            {#if isExpanded}<span class="ml-2">Collapse Menu</span>{/if}
          </button>
        </li>

        {#each menuItems as item}
          {@const isItemDisabled = getItemDisabledStatus(item)}
          <li class="relative my-1">
            <button
              on:click={(e) => handleNavigation(e, item)}
              class="nav-link {!$isNavigating && currentSection === item.path
                ? activeColor
                : ''} {isItemDisabled
                ? disabledColor
                : hoverColor} flex w-full items-center rounded-lg px-5"
              class:tooltip={isItemDisabled && item.tooltip}
              data-tip={item.tooltip}
            >
              <Icon
                icon={item.icon}
                width="32"
                height="32"
                class={!$isNavigating && currentSection === item.path
                  ? "text-neutral"
                  : "group-hover:text-neutral"}
              />
              {#if isExpanded}<span class="ml-2">{item.label}</span>{/if}
            </button>
          </li>
        {/each}

        <li class="mt-auto">
          <hr class=" transform border-neutral-content opacity-20" />
        </li>

        <!-- Theme Toggle Section -->
        <li class="my-1">
          <div class="flex items-center px-5 py-4">
            <button
              class="no-focus-active flex w-full items-center gap-3 rounded-lg p-2 transition-colors duration-200 hover:bg-neutral-content hover:bg-opacity-20"
              on:click={toggleTheme}
            >
              <Icon
                icon={isDarkMode
                  ? "solar:sun-bold-duotone"
                  : "solar:moon-bold-duotone"}
                width="20"
                height="20"
              />
              {#if isExpanded}
                <span class="text-sm font-medium">
                  {isDarkMode ? "Light Mode" : "Dark Mode"}
                </span>
              {/if}
            </button>
          </div>
        </li>

        <!-- Profile Section -->
        {#if storesReady}
          <li class="my-1">
            <div class="{hoverColor} group flex items-center px-5 py-3">
              <Icon
                icon="solar:user-circle-bold-duotone"
                width="32"
                height="32"
                class="flex-shrink-0 group-hover:text-neutral"
              />
              {#if isExpanded}
                <div class="ml-2 flex-grow">
                  <p class="text-sm font-semibold">
                    {$profileStore?.full_name || "Loading..."}
                  </p>
                  {#if $subscriptionStore?.subscription === "FREE"}
                    <p class="text-xs opacity-70">Free Plan</p>
                  {:else}
                    <p class="flex items-center text-xs opacity-70">
                      Pro Plan
                      <Icon
                        icon="solar:fire-bold"
                        width="12"
                        height="12"
                        class="ml-1"
                      />
                    </p>
                  {/if}
                </div>
              {/if}
            </div>
          </li>
        {:else}
          <!-- Placeholder while waiting for stores to load -->
          <li class="my-1">
            <div class="flex items-center px-5 py-3">
              <div class="flex-shrink-0">
                <div
                  class="h-8 w-8 animate-pulse rounded-full bg-neutral-content bg-opacity-20"
                ></div>
              </div>
              {#if isExpanded}
                <div class="ml-2 flex-grow">
                  <div
                    class="h-4 w-24 animate-pulse rounded bg-neutral-content bg-opacity-20"
                  ></div>
                  <div
                    class="mt-1 h-3 w-16 animate-pulse rounded bg-neutral-content bg-opacity-20"
                  ></div>
                </div>
              {/if}
            </div>
          </li>
        {/if}

        <li class="my-1">
          <hr class="rotate-180 border-neutral-content opacity-20" />
        </li>

        <li class="my-1">
          <a
            href="/account/sign_out"
            class="{hoverColor} flex items-center rounded-lg px-5 text-base"
          >
            <Icon
              icon="solar:logout-3-bold-duotone"
              width="28"
              height="28"
              class="group-hover:text-neutral"
            />
            {#if isExpanded}<span class="ml-2">Sign Out</span>{/if}
          </a>
        </li>
      </ul>
    </div>
  {/if}
</div>

<CrispChatWidget bind:this={crispComponent} />

<style>
  /* Only apply focus styles to navigation links, not utility buttons */
  .menu .nav-link:focus {
    background-color: theme("colors.neutral-content");
    color: theme("colors.neutral");
  }

  /* Prevent focus styles on utility buttons */
  .menu .no-focus-active:focus {
    outline: none;
    background-color: transparent !important;
    color: theme("colors.neutral-content") !important;
  }

  /* Ensure hover styles still work for utility buttons */
  .menu .no-focus-active:hover {
    background-color: theme("colors.neutral-content") !important;
    color: theme("colors.neutral") !important;
  }

  /* Prevent child elements from inheriting focus colors */
  .menu .no-focus-active:focus * {
    color: inherit !important;
  }
</style>
