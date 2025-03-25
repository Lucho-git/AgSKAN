<script lang="ts">
  import { page } from "$app/stores"
  import { afterNavigate } from "$app/navigation"
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
  import { Capacitor } from "@capacitor/core" // Import Capacitor

  import CrispChatWidget from "../../../../components/CrispChatWidget.svelte"

  const adminSectionStore = writable("")
  const isNavigating = writable(false)
  setContext("adminSection", adminSectionStore)

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

  // Calculate usage statistics from mapActivity and subscription stores
  $: seatsUsed = $connectedMapStore?.is_connected
    ? $mapActivityStore?.connected_profiles?.length || 0
    : 1
  $: totalSeats = $subscriptionStore?.current_seats || 1
  $: trailLaid = $mapActivityStore?.trail_count || 0
  $: totalTrail = $subscriptionStore?.trail_limit || 100000

  // Calculate percentages
  $: seatsPercentage = (seatsUsed / totalSeats) * 100
  $: trailPercentage = (trailLaid / totalTrail) * 100

  const selectedColor = "bg-neutral"
  const activeColor = "bg-neutral-content bg-opacity-10 text-neutral-content"
  const hoverColor = "hover:bg-neutral-content hover:text-neutral group"
  const disabledColor = "opacity-50 cursor-not-allowed pointer-events-none"

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
    },
    {
      href: "/account/fieldview",
      icon: "solar:map-bold-duotone",
      label: "Fields",
      labelId: "fieldview",
      topBarIcon: "solar:map-bold-duotone",
      topBarLabel: "Field Overview",
      path: "fieldview",
    },
    {
      href: "/account/pathplanner",
      icon: "solar:routing-2-bold-duotone",
      label: "Paths",
      labelId: "pathplanner",
      topBarIcon: "solar:routing-2-bold-duotone",
      topBarLabel: "Path Planner",
      path: "pathplanner",
    },
    {
      href: browser && Capacitor.isNativePlatform() ? "#" : "/account/billing",
      icon: "solar:wallet-money-bold-duotone",
      label: "Billing",
      labelId: "billing",
      topBarIcon: "solar:bill-list-bold-duotone",
      topBarLabel: "Billing & Invoices",
      path: "billing",
      disabled: browser && Capacitor.isNativePlatform(),
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
    // Prevent navigation for disabled items
    if (item.disabled) {
      e.preventDefault()

      // Show toast message for disabled items
      if (item.tooltip) {
        toast.info(item.tooltip)
      }
      return
    }

    // Only set flag to true if navigating to a different section
    if (currentSection !== item.path) {
      isNavigating.set(true)
    }
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
        class="fixed left-0 right-0 top-0 z-50 flex items-center justify-between bg-neutral p-1 text-neutral-content lg:hidden"
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
            <li class="flex-1">
              <a
                href={item.href}
                on:click={(e) => handleNavigation(e, item)}
                class="flex h-full flex-col items-center justify-center p-1
                    {!$isNavigating && currentSection === item.path
                  ? 'bg-neutral-content text-neutral'
                  : ''} 
                    {item.disabled
                  ? disabledColor
                  : 'transition-colors duration-200 hover:bg-neutral-content hover:text-neutral'}"
              >
                <Icon icon={item.icon} width="24" height="24" />
                <span class="mt-1 text-xs">{item.label}</span>
                {#if item.disabled && item.tooltip}
                  <div class="tooltip tooltip-top text-xs">{item.tooltip}</div>
                {/if}
              </a>
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
            on:click={toggleSidebar}
            class="toggle-sidebar-btn focus:bg-focus focus:text-focus-content flex w-full items-center rounded-lg bg-neutral px-5 hover:bg-neutral-content hover:text-neutral"
          >
            <Icon
              icon={isExpanded
                ? "solar:alt-arrow-left-bold-duotone"
                : "solar:alt-arrow-right-bold-duotone"}
              width="28"
              height="28"
              class="group-hover:text-neutral"
            />
            {#if isExpanded}<span class="ml-2">Collapse Menu</span>{/if}
          </button>
        </li>

        {#each menuItems as item}
          <li class="relative my-1">
            <a
              href={item.href}
              on:click={(e) => handleNavigation(e, item)}
              class="{!$isNavigating && currentSection === item.path
                ? activeColor
                : ''} {item.disabled
                ? disabledColor
                : hoverColor} flex items-center rounded-lg px-5"
              class:tooltip={item.disabled && item.tooltip}
              data-tip={item.tooltip}
            >
              <Icon
                icon={item.icon}
                width="32"
                height="32"
                class="group-hover:text-neutral"
              />
              {#if isExpanded}<span class="ml-2">{item.label}</span>{/if}
            </a>
          </li>
        {/each}

        <li class="mt-auto">
          <hr class=" transform border-neutral-content opacity-20" />
        </li>

        {#if storesReady}
          <li class="my-1">
            <div class="{hoverColor} group flex items-center px-3 py-2">
              <div class="flex flex-col items-center">
                <Icon
                  icon="solar:user-circle-bold-duotone"
                  width="32"
                  height="32"
                  class="flex-shrink-0"
                />
                {#if !isExpanded}
                  <div class="mt-4 flex flex-col items-center space-y-1">
                    <div
                      class=" flex items-center"
                      data-tip="Seats: {seatsUsed}/{totalSeats}"
                    >
                      <Icon
                        icon="solar:users-group-rounded-bold"
                        width="12"
                        height="12"
                        class="mr-1"
                      />
                      <progress
                        class="progress progress-primary w-8 bg-neutral-content group-hover:bg-neutral"
                        value={seatsPercentage}
                        max="100"
                      ></progress>
                    </div>
                    <div
                      class=" flex items-center"
                      data-tip="Trail: {trailLaid}/{totalTrail}"
                    >
                      <Icon
                        icon="solar:routing-bold"
                        width="12"
                        height="12"
                        class="mr-1"
                      />
                      <progress
                        class="progress progress-secondary w-8 bg-neutral-content group-hover:bg-neutral"
                        value={trailPercentage}
                        max="100"
                      ></progress>
                    </div>
                  </div>
                {/if}
              </div>
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
                <div class="flex flex-col space-y-2">
                  <div
                    class=" flex items-center"
                    data-tip="Seats: {seatsUsed}/{totalSeats}"
                  >
                    <Icon
                      icon="solar:users-group-rounded-bold"
                      width="16"
                      height="16"
                      class="mr-1"
                    />
                    <progress
                      class="progress progress-primary w-16 bg-neutral-content group-hover:bg-neutral"
                      value={seatsPercentage}
                      max="100"
                    ></progress>
                    <span class="ml-1 w-2 text-right text-xs">Seats</span>
                  </div>
                  <div
                    class=" flex items-center"
                    data-tip="Trail: {trailLaid}/{totalTrail}"
                  >
                    <Icon
                      icon="solar:routing-bold"
                      width="16"
                      height="16"
                      class="mr-1"
                    />
                    <progress
                      class="progress progress-secondary w-16 bg-neutral-content group-hover:bg-neutral"
                      value={trailPercentage}
                      max="100"
                    ></progress>
                    <span class="ml-1 mr-8 w-0 text-right text-xs">Trail</span>
                  </div>
                </div>
              {/if}
            </div>
          </li>
        {:else}
          <!-- Placeholder while waiting for stores to load -->
          <li class="my-1">
            <div class="flex items-center px-3 py-2">
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
  .menu :focus {
    background-color: theme("colors.neutral-content");
    color: theme("colors.neutral");
  }
</style>
