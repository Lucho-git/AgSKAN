<script lang="ts">
  import { getContext, onMount } from "svelte"
  import type { Writable } from "svelte/store"
  import { session } from "$lib/stores/sessionStore"
  import { profileStore } from "$lib/stores/profileStore"
  import { subscriptionStore } from "$lib/stores/subscriptionStore"
  import { goto } from "$app/navigation"
  import { toast } from "svelte-sonner"
  import { browser } from "$app/environment"
  import { Capacitor } from "@capacitor/core"
  import Icon from "@iconify/svelte"
  
  // Import section components
  import ProfileSection from "./ProfileSection.svelte"
  import SecuritySection from "./SecuritySection.svelte"
  import MapPreferencesSection from "./MapPreferencesSection.svelte"
  import SubscriptionSection from "./SubscriptionSection.svelte"
  import AppInformationSection from "./AppInformationSection.svelte"

  let adminSection: Writable<string> = getContext("adminSection")
  adminSection.set("settings")

  let loading = true
  let activeTab = "profile"
  
  // Check if running on native platform
  const isNativePlatform = Capacitor.isNativePlatform()

  // Navigation items
  const navItems = [
    { id: 'profile', icon: 'solar:user-bold-duotone', label: 'Profile' },
    { id: 'security', icon: 'solar:shield-user-bold-duotone', label: 'Security' },
    { id: 'map-preferences', icon: 'solar:global-bold-duotone', label: 'Map Preferences' },
    { id: 'subscription', icon: 'solar:card-bold-duotone', label: 'Subscription' },
    { id: 'app-information', icon: 'solar:info-circle-bold-duotone', label: 'App Information' }
  ]

  onMount(async () => {
    if (!$session) {
      goto("/login")
      return
    }

    // Load profile data if not already in store
    if (!$profileStore || !$profileStore.id) {
      await profileStore.loadProfile($session.user.id)
    }

    // Set loading to false once data is available
    loading = false
  })

  // Get current nav item
  $: currentNavItem = navItems.find(item => item.id === activeTab)
</script>

<svelte:head>
  <title>Settings</title>
</svelte:head>

{#if loading}
  <div class="flex h-64 items-center justify-center">
    <div class="loading loading-spinner loading-lg"></div>
  </div>
{:else}
  <div class="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
    <!-- Sidebar navigation -->
    <div class="md:col-span-1">
      <!-- Desktop sidebar navigation -->
      <nav class="hidden md:block bg-base-200 rounded-xl overflow-hidden border border-base-300 shadow-lg sticky top-6">
        <div class="p-4 border-b border-base-300">
          <h2 class="font-semibold text-base-content flex items-center gap-2">
            <Icon icon="solar:settings-bold-duotone" width="20" height="20" class="text-primary" />
            Settings
          </h2>
        </div>
        <ul>
          {#each navItems as item}
            <li>
              <button
                class="flex items-center gap-3 p-4 w-full text-left transition-colors
                  {activeTab === item.id 
                    ? 'bg-primary text-primary-content font-medium' 
                    : 'text-base-content hover:bg-base-300'}"
                on:click={() => activeTab = item.id}
              >
                <Icon icon={item.icon} width="18" height="18" />
                {item.label}
              </button>
            </li>
          {/each}
        </ul>
      </nav>
      
      <!-- Mobile compact navigation -->
      <div class="md:hidden">
        <div class="bg-base-200 rounded-xl overflow-hidden border border-base-300 shadow-lg mb-4">
          <div class="p-3 border-b border-base-300 flex justify-between items-center">
            <h2 class="font-medium text-base-content text-sm flex items-center gap-2">
              <Icon icon="solar:settings-bold-duotone" width="16" height="16" class="text-primary" />
              Settings
            </h2>
          </div>
          <div class="grid grid-cols-3 gap-1 p-2">
            {#each navItems as item}
              <button
                class="flex flex-col items-center justify-center p-2 rounded-lg transition-colors
                  {activeTab === item.id 
                    ? 'bg-primary text-primary-content font-medium' 
                    : 'text-base-content hover:bg-base-300'}"
                on:click={() => activeTab = item.id}
              >
                <div class="mb-1">
                  <Icon icon={item.icon} width="16" height="16" />
                </div>
                <span class="text-[10px] whitespace-nowrap">{item.label}</span>
              </button>
            {/each}
          </div>
        </div>
      </div>
    </div>
    
    <!-- Settings content -->
    <div class="md:col-span-2 space-y-6">
      <!-- Mobile active section indicator -->
      <div class="md:hidden flex items-center mb-2">
        <h3 class="text-lg font-medium text-base-content flex items-center gap-2">
          {#if currentNavItem}
            <Icon icon={currentNavItem.icon} width="18" height="18" class="text-primary" />
            {currentNavItem.label}
          {/if}
        </h3>
      </div>

      <!-- Profile Section -->
      {#if activeTab === 'profile'}
        <ProfileSection />
      {/if}
      
      <!-- Security Section -->
      {#if activeTab === 'security'}
        <SecuritySection />
      {/if}
      
      <!-- Map Preferences -->
      {#if activeTab === 'map-preferences'}
        <MapPreferencesSection />
      {/if}
      
      <!-- Subscription Section -->
      {#if activeTab === 'subscription'}
        <SubscriptionSection {isNativePlatform} />
      {/if}
      
      <!-- App Information -->
      {#if activeTab === 'app-information'}
        <AppInformationSection />
      {/if}
    </div>
  </div>
{/if}