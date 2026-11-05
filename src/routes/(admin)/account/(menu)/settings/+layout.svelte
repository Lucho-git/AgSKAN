<script lang="ts">
  import { page } from "$app/stores"
  import { goto } from "$app/navigation"
  import { getContext, onMount, setContext } from "svelte"
  import type { Writable } from "svelte/store"
  import { session } from "$lib/stores/sessionStore"
  import { profileStore } from "$lib/stores/profileStore"
  import Icon from "@iconify/svelte"
  import SettingsSidebarNav from "$lib/components/settings/SettingsSidebarNav.svelte"
  import SettingsMobileMenu from "$lib/components/settings/SettingsMobileMenu.svelte"
  import SettingsBreadcrumb from "$lib/components/settings/SettingsBreadcrumb.svelte"
  import {
    findSettingsGroup,
    findSettingsItem,
  } from "$lib/settings/settingsNav"

  let adminSection: Writable<string> = getContext("adminSection")
  adminSection.set("settings")

  let loading = true
  let innerWidth = 0
  let hasRedirected = false

  // Breakpoints: phones get a drill-in index, tablets a compact sidebar,
  // desktops the full labelled sidebar.
  $: isMobile = innerWidth < 768
  $: isTablet = innerWidth >= 768 && innerWidth < 1180
  $: currentSection = $page.url.pathname.split("/").pop() || "settings"
  $: currentItem = findSettingsItem(currentSection)
  $: currentGroup = findSettingsGroup(currentSection)

  // Pass mobile state to child components via context
  setContext("settingsMobile", isMobile)


  function navigateBack() {
    goto("/account/settings")
  }

  /** Jump to a destination by id (used by the phone index list). */
  function navigateTo(sectionId: string) {
    const item = findSettingsItem(sectionId)
    goto(item ? item.href : "/account/settings")
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
  <!-- Phones Â· drill-in index, then the page with a group-named back crumb -->
  {#if currentSection === "settings"}
    <SettingsMobileMenu
      on:select={(event) => navigateTo(event.detail)}
      on:signout={handleSignOut}
    />
  {:else}
    <div class="min-w-0">
      <button
        type="button"
        on:click={navigateBack}
        class="mb-2 -ml-1 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-contrast-content/70 transition-colors hover:bg-base-200 hover:text-contrast-content"
      >
        <Icon icon="solar:alt-arrow-left-bold-duotone" width="16" height="16" />
        {currentGroup?.label ?? "Settings"}
      </button>
      <slot />
    </div>
  {/if}
{:else}
  <!-- Tablet + desktop Â· persistent grouped sidebar -->
  <div class="flex items-start gap-6">
    <aside class="sticky top-4 w-64 flex-none overflow-hidden xl:w-72">
      <div class="rounded-2xl bg-base-200/40 p-2">
        <div class="max-h-[calc(100vh-3rem)] overflow-y-auto">
          <SettingsSidebarNav
            {currentSection}
            compact={isTablet}
            on:signout={handleSignOut}
          />
        </div>
      </div>
    </aside>

    <div class="min-w-0 flex-1">
      <SettingsBreadcrumb {currentGroup} {currentItem} />
      <slot />
    </div>
  </div>
{/if}
