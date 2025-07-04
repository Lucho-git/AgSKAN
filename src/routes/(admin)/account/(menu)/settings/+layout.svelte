<script lang="ts">
  import { page } from "$app/stores"
  import { goto } from "$app/navigation"
  import { getContext, onMount, setContext } from "svelte"
  import type { Writable } from "svelte/store"
  import { session } from "$lib/stores/sessionStore"
  import { profileStore } from "$lib/stores/profileStore"
  import Icon from "@iconify/svelte"

  let adminSection: Writable<string> = getContext("adminSection")
  adminSection.set("settings")

  let loading = true
  let innerWidth = 0
  let hasRedirected = false

  $: isMobile = innerWidth < 768
  $: currentSection = $page.url.pathname.split("/").pop() || "settings"

  // Pass mobile state to child components via context
  setContext("settingsMobile", isMobile)

  const navItems = [
    {
      id: "profile",
      icon: "solar:user-bold-duotone",
      label: "Profile",
      href: "/account/settings/profile",
    },
    {
      id: "security",
      icon: "solar:shield-user-bold-duotone",
      label: "Security",
      href: "/account/settings/security",
    },
    {
      id: "map-preferences",
      icon: "solar:global-bold-duotone",
      label: "Map",
      href: "/account/settings/map-preferences",
    },
    {
      id: "location-permissions",
      icon: "solar:gps-bold-duotone",
      label: "Location",
      href: "/account/settings/location-permissions",
    },
    {
      id: "subscription",
      icon: "solar:card-bold-duotone",
      label: "Subscription",
      href: "/account/settings/subscription",
    },
    {
      id: "app-information",
      icon: "solar:info-circle-bold-duotone",
      label: "App",
      href: "/account/settings/app-information",
    },
  ]

  function navigateBack() {
    goto("/account/settings")
  }

  function handleSignOut() {
    goto("/account/sign_out")
  }

  // Handle desktop default redirect
  $: if (
    !loading &&
    !isMobile &&
    currentSection === "settings" &&
    !hasRedirected
  ) {
    hasRedirected = true
    goto("/account/settings/profile", { replaceState: true })
  }

  // Reset redirect flag when switching to mobile or when navigating away from settings root
  $: if (isMobile || currentSection !== "settings") {
    hasRedirected = false
  }

  onMount(async () => {
    if (!$session) {
      goto("/login")
      return
    }

    if (!$profileStore || !$profileStore.id) {
      await profileStore.loadProfile($session.user.id)
    }

    loading = false
  })
</script>

<svelte:head>
  <title>Settings</title>
</svelte:head>

<svelte:window bind:innerWidth />

{#if loading}
  <div class="flex h-64 items-center justify-center">
    <div class="loading loading-spinner loading-lg"></div>
  </div>
{:else if isMobile}
  {#if currentSection === "settings"}
    <!-- Mobile Settings Menu -->
    <div
      class="overflow-hidden rounded-xl border border-base-300 bg-base-100 shadow-lg"
    >
      <div class="border-b border-base-300 bg-base-100 p-4">
        <h2 class="flex items-center gap-2 font-semibold text-contrast-content">
          <Icon
            icon="solar:settings-bold-duotone"
            width="20"
            height="20"
            class="text-base-content"
          />
          Settings
        </h2>
      </div>

      <ul class="divide-y divide-base-300">
        {#each navItems as item}
          <li>
            <a
              href={item.href}
              class="block flex w-full items-center justify-between p-4 text-contrast-content transition-colors hover:bg-base-200"
            >
              <div class="flex items-center gap-3">
                <div class="rounded-lg bg-base-content/10 p-2">
                  <Icon
                    icon={item.icon}
                    width="18"
                    height="18"
                    class="text-base-content"
                  />
                </div>
                <span class="font-medium">{item.label}</span>
              </div>
              <Icon
                icon="solar:alt-arrow-right-bold-duotone"
                width="18"
                height="18"
                class="text-base-content/60"
              />
            </a>
          </li>
        {/each}

        <!-- Sign Out Button - Mobile -->
        <li class="border-t border-base-300">
          <button
            on:click={handleSignOut}
            class="flex w-full items-center gap-3 p-4 text-left text-error transition-colors hover:bg-error/10"
          >
            <div class="rounded-lg bg-error/10 p-2">
              <Icon
                icon="solar:logout-3-bold-duotone"
                width="18"
                height="18"
                class="text-error"
              />
            </div>
            <span class="font-medium">Sign Out</span>
          </button>
        </li>
      </ul>
    </div>
  {:else}
    <!-- Mobile: Connected container with back button + content -->
    <div
      class="overflow-hidden rounded-xl border border-base-300 bg-base-100 shadow-lg"
    >
      <!-- Back Navigation Header -->
      <div class="border-b border-base-300 bg-base-100">
        <button
          on:click={navigateBack}
          class="flex w-full items-center gap-2 p-4 text-left text-contrast-content transition-colors hover:bg-base-200"
        >
          <Icon
            icon="solar:alt-arrow-left-bold-duotone"
            width="18"
            height="18"
            class="text-base-content"
          />
          <span>Back to Settings</span>
        </button>
      </div>

      <!-- Content goes here (no additional wrapper) -->
      <slot />
    </div>
  {/if}
{:else}
  <!-- Desktop View -->
  <div class="grid grid-cols-4 items-start gap-6">
    <!-- Desktop Sidebar -->
    <div class="col-span-1">
      <nav
        class="sticky top-6 h-fit overflow-hidden rounded-xl border border-base-300 bg-base-100 shadow-lg"
      >
        <div class="border-b border-base-300 bg-base-100 p-4">
          <h2
            class="flex items-center gap-2 font-semibold text-contrast-content"
          >
            <Icon
              icon="solar:settings-bold-duotone"
              width="20"
              height="20"
              class="text-base-content"
            />
            Settings
          </h2>
        </div>
        <ul class="min-h-0">
          {#each navItems as item}
            <li>
              <a
                href={item.href}
                class="block flex w-full items-center gap-3 p-4 text-left transition-colors
                    {currentSection === item.id
                  ? 'bg-base-content font-medium text-base-100'
                  : 'text-contrast-content hover:bg-base-200'}"
              >
                <Icon
                  icon={item.icon}
                  width="18"
                  height="18"
                  class={currentSection === item.id
                    ? "text-base-100"
                    : "text-base-content"}
                />
                {item.label}
              </a>
            </li>
          {/each}

          <!-- Sign Out Button - Desktop -->
          <li class="border-t border-base-300">
            <button
              on:click={handleSignOut}
              class="flex w-full items-center gap-3 p-4 text-left text-error transition-colors hover:bg-error/10"
            >
              <Icon
                icon="solar:logout-3-bold-duotone"
                width="18"
                height="18"
                class="text-error"
              />
              Sign Out
            </button>
          </li>
        </ul>
      </nav>
    </div>

    <!-- Desktop Content: Wrapped in section -->
    <div class="col-span-3">
      <section
        class="overflow-hidden rounded-xl border border-base-300 bg-base-100 shadow-lg"
      >
        <slot />
      </section>
    </div>
  </div>
{/if}
