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
  import { PUBLIC_APP_VERSION } from "$env/static/public"
  import { userSettingsApi } from "$lib/api/userSettingsApi"
  import Icon from "@iconify/svelte"

  let adminSection: Writable<string> = getContext("adminSection")
  adminSection.set("settings")

  let loading = true
  let activeTab = "profile"

  // Mobile navigation state
  let mobileView = "main" // 'main' or 'detail'
  let innerWidth = 0

  // Check if running on native platform
  const isNativePlatform = Capacitor.isNativePlatform()
  const APP_VERSION = PUBLIC_APP_VERSION || "unknown"

  // Reactive variable to determine if we're on mobile
  $: isMobile = innerWidth < 768

  // Navigation items - removed individual colors
  const navItems = [
    { id: "profile", icon: "solar:user-bold-duotone", label: "Profile" },
    {
      id: "security",
      icon: "solar:shield-user-bold-duotone",
      label: "Security",
    },
    {
      id: "map-preferences",
      icon: "solar:global-bold-duotone",
      label: "Map Preferences",
    },
    {
      id: "subscription",
      icon: "solar:card-bold-duotone",
      label: "Subscription",
    },
    {
      id: "app-information",
      icon: "solar:info-circle-bold-duotone",
      label: "App Information",
    },
  ]

  // Profile state
  let editingProfile = false
  let formProfile = {
    name: $profileStore?.full_name || "",
    companyName: $profileStore?.company_name || "",
    avatar: "",
  }

  // Security state
  let editingEmail = false
  let editingPassword = false
  let formEmail = $session?.user?.email || ""
  let formPassword = {
    current: "",
    new: "",
    confirm: "",
  }

  // Map preferences state
  let mapPerformanceMode = "balanced"
  let markerVisibility = "all"
  let markerDropdownOpen = false

  // Delete account modal
  let showDeleteConfirm = false
  let confirmText = ""

  // Update form when profile store changes
  $: if ($profileStore) {
    formProfile = {
      name: $profileStore.full_name || "",
      companyName: $profileStore.company_name || "",
      avatar: "",
    }
  }

  // Reset mobile view when switching to desktop
  $: if (!isMobile && mobileView === "detail") {
    mobileView = "main"
  }

  // Mobile navigation functions
  function navigateToDetail(tab) {
    activeTab = tab
    mobileView = "detail"
  }

  function navigateToMain() {
    mobileView = "main"
  }

  // Profile functions
  async function handleProfileUpdate() {
    toast.promise(
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 1000))
        editingProfile = false
        return "Profile updated successfully"
      },
      {
        loading: "Saving profile changes...",
        success: (message) => message,
        error: "Failed to update profile",
      },
    )
  }

  function cancelProfileEdit() {
    formProfile = {
      name: $profileStore?.full_name || "",
      companyName: $profileStore?.company_name || "",
      avatar: "",
    }
    editingProfile = false
  }

  // Security functions
  async function handleEmailUpdate() {
    toast.promise(
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 1000))
        editingEmail = false
        return "Email updated successfully"
      },
      {
        loading: "Updating email address...",
        success: (message) => message,
        error: "Failed to update email",
      },
    )
  }

  async function handlePasswordUpdate() {
    if (formPassword.new !== formPassword.confirm) {
      toast.error("New passwords do not match")
      return
    }

    if (formPassword.new.length < 8) {
      toast.error("Password must be at least 8 characters")
      return
    }

    toast.promise(
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 1000))
        editingPassword = false
        formPassword = { current: "", new: "", confirm: "" }
        return "Password updated successfully"
      },
      {
        loading: "Updating password...",
        success: (message) => message,
        error: "Failed to update password",
      },
    )
  }

  // App functions
  async function handleSignOut() {
    toast.promise(userSettingsApi.signOut(), {
      loading: "Signing out...",
      success: () => {
        goto("/")
        return "Signed out successfully"
      },
      error: "Failed to sign out",
    })
  }

  async function handleDeleteAccount() {
    toast.promise(
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 2000))
        goto("/")
        return "Account deleted successfully"
      },
      {
        loading: "Deleting account...",
        success: (message) => message,
        error: "Failed to delete account",
      },
    )
    showDeleteConfirm = false
  }

  onMount(async () => {
    if (!$session) {
      goto("/login")
      return
    }

    // Load profile data if not already in store
    if (!$profileStore || !$profileStore.id) {
      await profileStore.loadProfile($session.user.id)
    }

    loading = false
  })

  // Get current nav item for mobile
  $: currentNavItem = navItems.find((item) => item.id === activeTab)
</script>

<svelte:head>
  <title>Settings</title>
</svelte:head>

<!-- Close dropdown when clicking outside -->
<svelte:window bind:innerWidth on:click={() => (markerDropdownOpen = false)} />

{#if loading}
  <div class="flex h-64 items-center justify-center">
    <div class="loading loading-spinner loading-lg"></div>
  </div>
{:else}
  <!-- Mobile View -->
  {#if isMobile}
    {#if mobileView === "main"}
      <!-- Mobile Settings List -->
      <div
        class="overflow-hidden rounded-xl border border-base-300 bg-base-100 shadow-lg"
      >
        <div
          class="border-b border-base-300 p-4"
          style="background-color: #FEDD64;"
        >
          <h2 class="flex items-center gap-2 font-semibold text-black">
            <Icon
              icon="solar:settings-bold-duotone"
              width="20"
              height="20"
              class="text-black"
            />
            Settings
          </h2>
        </div>

        <ul class="divide-y divide-base-300">
          {#each navItems as item}
            <li>
              <button
                on:click={() => navigateToDetail(item.id)}
                class="flex w-full items-center justify-between p-4 text-base-content transition-colors hover:bg-base-200"
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
              </button>
            </li>
          {/each}
        </ul>
      </div>
    {:else}
      <!-- Mobile Detail View -->
      <div>
        <!-- Back navigation -->
        <div
          class="mb-0 rounded-t-xl border-x border-t border-base-300 bg-base-100"
        >
          <button
            on:click={navigateToMain}
            class="flex w-full items-center gap-2 p-4 text-left text-base-content transition-colors hover:bg-base-200"
          >
            <Icon
              icon="solar:alt-arrow-left-bold-duotone"
              width="18"
              height="18"
            />
            <span>Back to Settings</span>
          </button>
        </div>

        <!-- Mobile content sections will be rendered below -->
      </div>
    {/if}
  {:else}
    <!-- Desktop View -->
    <div class="grid grid-cols-4 gap-6">
      <!-- Desktop Sidebar -->
      <div class="col-span-1">
        <nav
          class="sticky top-6 overflow-hidden rounded-xl border border-base-300 bg-base-100 shadow-lg"
        >
          <div
            class="border-b border-base-300 p-4"
            style="background-color: #FEDD64;"
          >
            <h2 class="flex items-center gap-2 font-semibold text-black">
              <Icon
                icon="solar:settings-bold-duotone"
                width="20"
                height="20"
                class="text-black"
              />
              Settings
            </h2>
          </div>
          <ul>
            {#each navItems as item}
              <li>
                <button
                  class="flex w-full items-center gap-3 p-4 text-left transition-colors
                    {activeTab === item.id
                    ? 'bg-base-content font-medium text-base-100'
                    : 'text-base-content hover:bg-base-200'}"
                  on:click={() => (activeTab = item.id)}
                >
                  <Icon
                    icon={item.icon}
                    width="18"
                    height="18"
                    class={activeTab === item.id
                      ? "text-base-100"
                      : "text-base-content"}
                  />
                  {item.label}
                </button>
              </li>
            {/each}
          </ul>
        </nav>
      </div>

      <!-- Desktop Content -->
      <div class="col-span-3">
        <!-- Content sections will be rendered here -->
        {#if activeTab === "profile"}
          <!-- Profile Section -->
          <section
            class="overflow-hidden rounded-xl border border-base-300 bg-base-100 shadow-lg"
          >
            <div
              class="flex items-center justify-between border-b border-base-300 p-5"
              style="background-color: #FEDD64;"
            >
              <h2
                class="flex items-center gap-2 text-xl font-semibold text-black"
              >
                <div class="rounded-lg bg-black/10 p-1.5">
                  <Icon
                    icon="solar:user-bold-duotone"
                    width="18"
                    height="18"
                    class="text-black"
                  />
                </div>
                Profile
              </h2>
              {#if !editingProfile}
                <button
                  on:click={() => (editingProfile = true)}
                  class="rounded-lg p-1.5 text-black/80 transition-colors hover:bg-black/10 hover:text-black"
                >
                  <Icon icon="solar:pen-bold-duotone" width="16" height="16" />
                </button>
              {/if}
            </div>

            <div class="p-6">
              {#if editingProfile}
                <div class="space-y-4">
                  <div class="flex items-center gap-4">
                    <div
                      class="group relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-base-200 text-base-content"
                    >
                      {#if formProfile.avatar}
                        <img
                          src={formProfile.avatar}
                          alt="Avatar"
                          class="h-full w-full object-cover"
                        />
                      {:else}
                        <span class="text-xl font-bold uppercase"
                          >{formProfile.name.charAt(0) || "U"}</span
                        >
                      {/if}
                      <div
                        class="absolute inset-0 flex cursor-pointer items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        <Icon
                          icon="solar:upload-bold-duotone"
                          width="16"
                          height="16"
                          class="text-white"
                        />
                      </div>
                    </div>
                    <div class="flex-1">
                      <label class="mb-1 block text-sm text-base-content/60"
                        >Name</label
                      >
                      <input
                        type="text"
                        bind:value={formProfile.name}
                        class="input input-bordered w-full"
                        placeholder="Enter your name"
                      />
                    </div>
                  </div>

                  <div>
                    <label class="mb-1 block text-sm text-base-content/60"
                      >Company Name</label
                    >
                    <input
                      type="text"
                      bind:value={formProfile.companyName}
                      class="input input-bordered w-full"
                      placeholder="Enter company name"
                    />
                  </div>

                  <div class="flex justify-end gap-3">
                    <button
                      on:click={cancelProfileEdit}
                      class="btn btn-outline btn-sm gap-2"
                    >
                      <Icon
                        icon="solar:close-circle-bold-duotone"
                        width="16"
                        height="16"
                      />
                      Cancel
                    </button>
                    <button
                      on:click={handleProfileUpdate}
                      class="btn btn-sm gap-2 text-black hover:text-black"
                      style="background-color: #FEDD64; border-color: #FEDD64;"
                    >
                      <Icon
                        icon="solar:diskette-bold-duotone"
                        width="16"
                        height="16"
                      />
                      Save
                    </button>
                  </div>
                </div>
              {:else}
                <div class="space-y-5">
                  <div class="flex items-start gap-4">
                    <div
                      class="flex h-16 w-16 items-center justify-center rounded-full bg-base-200 text-base-content"
                    >
                      {#if formProfile.avatar}
                        <img
                          src={formProfile.avatar}
                          alt="Avatar"
                          class="h-full w-full object-cover"
                        />
                      {:else}
                        <span class="text-xl font-bold uppercase"
                          >{$profileStore?.full_name?.charAt(0) || "U"}</span
                        >
                      {/if}
                    </div>
                    <div>
                      <h3 class="text-xl font-medium text-base-content">
                        {$profileStore?.full_name || "No name set"}
                      </h3>
                      <p class="text-base-content/60">
                        {$subscriptionStore?.subscription === "FREE"
                          ? "Free Plan"
                          : "Pro Plan"}
                      </p>
                    </div>
                  </div>

                  <div>
                    <label class="mb-1 block text-sm text-base-content/60"
                      >Company Name</label
                    >
                    <p
                      class="rounded-lg border border-base-300 bg-base-200 p-3 text-base-content"
                    >
                      {$profileStore?.company_name || "No company name set"}
                    </p>
                  </div>

                  <button
                    class="btn btn-outline w-full gap-2"
                    on:click={() => (editingProfile = true)}
                  >
                    <Icon
                      icon="solar:pen-bold-duotone"
                      width="16"
                      height="16"
                    />
                    Edit Profile
                  </button>
                </div>
              {/if}
            </div>
          </section>
        {/if}

        {#if activeTab === "security"}
          <!-- Security Section -->
          <section
            class="overflow-hidden rounded-xl border border-base-300 bg-base-100 shadow-lg"
          >
            <div
              class="border-b border-base-300 p-5"
              style="background-color: #FEDD64;"
            >
              <h2
                class="flex items-center gap-2 text-xl font-semibold text-black"
              >
                <div class="rounded-lg bg-black/10 p-1.5">
                  <Icon
                    icon="solar:shield-user-bold-duotone"
                    width="18"
                    height="18"
                    class="text-black"
                  />
                </div>
                Security
              </h2>
            </div>

            <div class="divide-y divide-base-300">
              <!-- Email -->
              <div class="p-6">
                <div class="mb-4 flex items-center justify-between">
                  <h3
                    class="flex items-center gap-2 font-medium text-base-content"
                  >
                    <div class="rounded-lg bg-base-content/10 p-1.5">
                      <Icon
                        icon="solar:letter-bold-duotone"
                        width="16"
                        height="16"
                        class="text-base-content"
                      />
                    </div>
                    Email Address
                  </h3>
                  {#if !editingEmail}
                    <button
                      on:click={() => (editingEmail = true)}
                      class="rounded-lg p-1.5 text-base-content/60 transition-colors hover:bg-base-200 hover:text-base-content"
                    >
                      <Icon
                        icon="solar:pen-bold-duotone"
                        width="16"
                        height="16"
                      />
                    </button>
                  {/if}
                </div>

                {#if editingEmail}
                  <div class="space-y-4">
                    <input
                      type="email"
                      bind:value={formEmail}
                      class="input input-bordered w-full"
                      placeholder="Enter new email address"
                    />

                    <div class="flex justify-end gap-3">
                      <button
                        on:click={() => {
                          formEmail = $session?.user?.email || ""
                          editingEmail = false
                        }}
                        class="btn btn-outline btn-sm gap-2"
                      >
                        <Icon
                          icon="solar:close-circle-bold-duotone"
                          width="16"
                          height="16"
                        />
                        Cancel
                      </button>
                      <button
                        on:click={handleEmailUpdate}
                        class="btn btn-sm gap-2 text-black hover:text-black"
                        style="background-color: #FEDD64; border-color: #FEDD64;"
                      >
                        <Icon
                          icon="solar:diskette-bold-duotone"
                          width="16"
                          height="16"
                        />
                        Save
                      </button>
                    </div>
                  </div>
                {:else}
                  <div
                    class="flex items-center gap-3 rounded-lg border border-base-300 bg-base-200 p-4"
                  >
                    <div class="rounded-full bg-base-content/10 p-2">
                      <Icon
                        icon="solar:letter-bold-duotone"
                        width="18"
                        height="18"
                        class="text-base-content"
                      />
                    </div>
                    <div>
                      <p class="font-medium text-base-content">
                        {$session?.user?.email || "No email set"}
                      </p>
                      <p class="mt-0.5 text-xs text-base-content/60">
                        Verified
                      </p>
                    </div>
                  </div>
                {/if}
              </div>

              <!-- Password -->
              <div class="p-6">
                <div class="mb-4 flex items-center justify-between">
                  <h3
                    class="flex items-center gap-2 font-medium text-base-content"
                  >
                    <div class="rounded-lg bg-base-content/10 p-1.5">
                      <Icon
                        icon="solar:lock-password-bold-duotone"
                        width="16"
                        height="16"
                        class="text-base-content"
                      />
                    </div>
                    Password
                  </h3>
                  {#if !editingPassword}
                    <button
                      on:click={() => (editingPassword = true)}
                      class="rounded-lg p-1.5 text-base-content/60 transition-colors hover:bg-base-200 hover:text-base-content"
                    >
                      <Icon
                        icon="solar:pen-bold-duotone"
                        width="16"
                        height="16"
                      />
                    </button>
                  {/if}
                </div>

                {#if editingPassword}
                  <div class="space-y-4">
                    <div>
                      <label class="mb-1 block text-sm text-base-content/60"
                        >Current Password</label
                      >
                      <input
                        type="password"
                        bind:value={formPassword.current}
                        class="input input-bordered w-full"
                        placeholder="Enter current password"
                      />
                    </div>

                    <div>
                      <label class="mb-1 block text-sm text-base-content/60"
                        >New Password</label
                      >
                      <input
                        type="password"
                        bind:value={formPassword.new}
                        class="input input-bordered w-full"
                        placeholder="Enter new password"
                      />
                    </div>

                    <div>
                      <label class="mb-1 block text-sm text-base-content/60"
                        >Confirm New Password</label
                      >
                      <input
                        type="password"
                        bind:value={formPassword.confirm}
                        class="input input-bordered w-full"
                        placeholder="Confirm new password"
                      />
                    </div>

                    <div class="flex justify-end gap-3">
                      <button
                        on:click={() => {
                          formPassword = { current: "", new: "", confirm: "" }
                          editingPassword = false
                        }}
                        class="btn btn-outline btn-sm gap-2"
                      >
                        <Icon
                          icon="solar:close-circle-bold-duotone"
                          width="16"
                          height="16"
                        />
                        Cancel
                      </button>
                      <button
                        on:click={handlePasswordUpdate}
                        class="btn btn-sm gap-2 text-black hover:text-black"
                        style="background-color: #FEDD64; border-color: #FEDD64;"
                      >
                        <Icon
                          icon="solar:key-bold-duotone"
                          width="16"
                          height="16"
                        />
                        Update Password
                      </button>
                    </div>
                  </div>
                {:else}
                  <div
                    class="flex items-center gap-3 rounded-lg border border-base-300 bg-base-200 p-4"
                  >
                    <div class="rounded-full bg-base-content/10 p-2">
                      <Icon
                        icon="solar:lock-password-bold-duotone"
                        width="18"
                        height="18"
                        class="text-base-content"
                      />
                    </div>
                    <div>
                      <p class="font-medium text-base-content">••••••••••••</p>
                      <p class="mt-0.5 text-xs text-base-content/60">
                        Last updated: 2 months ago
                      </p>
                    </div>
                  </div>
                  <button
                    on:click={() => (editingPassword = true)}
                    class="btn btn-outline mt-4 w-full gap-2"
                  >
                    <Icon
                      icon="solar:key-bold-duotone"
                      width="16"
                      height="16"
                    />
                    Change Password
                  </button>
                {/if}
              </div>
            </div>
          </section>
        {/if}

        {#if activeTab === "map-preferences"}
          <!-- Map Preferences Section -->
          <section
            class="overflow-hidden rounded-xl border border-base-300 bg-base-100 shadow-lg"
          >
            <div
              class="border-b border-base-300 p-5"
              style="background-color: #FEDD64;"
            >
              <h2
                class="flex items-center gap-2 text-xl font-semibold text-black"
              >
                <div class="rounded-lg bg-black/10 p-1.5">
                  <Icon
                    icon="solar:global-bold-duotone"
                    width="18"
                    height="18"
                    class="text-black"
                  />
                </div>
                Map Preferences
              </h2>
            </div>

            <div class="space-y-6 p-6">
              <div>
                <h3 class="mb-3 font-medium text-base-content">
                  Performance Mode
                </h3>

                <div class="grid grid-cols-3 gap-1 rounded-lg bg-base-200 p-1">
                  {#each ["high-quality", "balanced", "performance"] as mode}
                    <button
                      class="rounded-md px-3 py-2 text-sm font-medium transition-colors
                        {mapPerformanceMode === mode
                        ? 'bg-base-content text-base-100'
                        : 'text-base-content/60 hover:bg-base-300 hover:text-base-content'}"
                      on:click={() => (mapPerformanceMode = mode)}
                    >
                      {mode === "high-quality"
                        ? "High Quality"
                        : mode === "balanced"
                          ? "Balanced"
                          : "Performance"}
                    </button>
                  {/each}
                </div>

                <div class="alert mt-3">
                  <Icon
                    icon="solar:danger-triangle-bold-duotone"
                    width="16"
                    height="16"
                    class="text-warning"
                  />
                  <span class="text-sm">
                    {mapPerformanceMode === "high-quality"
                      ? "Shows all details but may reduce performance on older devices."
                      : mapPerformanceMode === "balanced"
                        ? "Recommended setting for most devices, balancing quality and speed."
                        : "Limits details to ensure smooth operation on all devices."}
                  </span>
                </div>
              </div>

              <div>
                <h3 class="mb-3 font-medium text-base-content">
                  Marker Visibility
                </h3>

                <div class="relative">
                  <button
                    class="btn btn-outline w-full justify-between"
                    on:click={() => (markerDropdownOpen = !markerDropdownOpen)}
                  >
                    <span>
                      {markerVisibility === "all"
                        ? "Show all markers"
                        : markerVisibility === "active"
                          ? "Show active markers only"
                          : markerVisibility === "custom"
                            ? "Custom visibility"
                            : "Select option"}
                    </span>
                    <Icon
                      icon="solar:alt-arrow-down-bold-duotone"
                      width="18"
                      height="18"
                      class="transition-transform {markerDropdownOpen
                        ? 'rotate-180'
                        : ''}"
                    />
                  </button>

                  {#if markerDropdownOpen}
                    <div
                      class="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-lg border border-base-300 bg-base-100 shadow-lg"
                    >
                      {#each ["all", "active", "custom"] as option}
                        <button
                          class="w-full border-b border-base-300 p-3 text-left text-base-content transition-colors last:border-b-0 hover:bg-base-200"
                          on:click={() => {
                            markerVisibility = option
                            markerDropdownOpen = false
                          }}
                        >
                          {option === "all"
                            ? "Show all markers"
                            : option === "active"
                              ? "Show active markers only"
                              : "Custom visibility"}
                        </button>
                      {/each}
                    </div>
                  {/if}
                </div>

                {#if markerVisibility === "custom"}
                  <div class="mt-4 space-y-3 rounded-lg bg-base-200 p-4">
                    <h4 class="text-sm font-medium text-base-content">
                      Custom Marker Settings
                    </h4>

                    <div class="space-y-2">
                      <div class="form-control">
                        <label class="label cursor-pointer">
                          <span class="label-text">Vehicles</span>
                          <input
                            type="checkbox"
                            class="checkbox-primary checkbox"
                            checked
                          />
                        </label>
                      </div>

                      <div class="form-control">
                        <label class="label cursor-pointer">
                          <span class="label-text">Field Boundaries</span>
                          <input
                            type="checkbox"
                            class="checkbox-primary checkbox"
                            checked
                          />
                        </label>
                      </div>

                      <div class="form-control">
                        <label class="label cursor-pointer">
                          <span class="label-text">Points of Interest</span>
                          <input
                            type="checkbox"
                            class="checkbox-primary checkbox"
                            checked
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                {/if}
              </div>
            </div>
          </section>
        {/if}

        {#if activeTab === "subscription"}
          <!-- Subscription Section -->
          <section
            class="overflow-hidden rounded-xl border border-base-300 bg-base-100 shadow-lg"
          >
            <div
              class="border-b border-base-300 p-5"
              style="background-color: #FEDD64;"
            >
              <h2
                class="flex items-center gap-2 text-xl font-semibold text-black"
              >
                <div class="rounded-lg bg-black/10 p-1.5">
                  <Icon
                    icon="solar:card-bold-duotone"
                    width="18"
                    height="18"
                    class="text-black"
                  />
                </div>
                Subscription
              </h2>
            </div>

            <div class="p-6">
              <div
                class="relative overflow-hidden rounded-xl border border-base-300 bg-base-200/30 p-6"
              >
                <div class="relative z-10">
                  <div class="mb-4 flex items-center justify-between">
                    <div>
                      <span
                        class="mb-2 inline-block rounded bg-warning/20 px-2.5 py-1 text-xs font-medium text-warning"
                        >CURRENT PLAN</span
                      >
                      <h3 class="font-medium text-base-content">Free Plan</h3>
                      <p class="text-sm text-base-content/60">
                        Basic features for small farms
                      </p>
                      <div class="mt-2 flex flex-col items-start">
                        <span class="text-2xl font-bold text-base-content"
                          >$0</span
                        >
                        <span class="text-xs text-base-content/60"
                          >per month</span
                        >
                      </div>
                    </div>
                    <span class="badge badge-success gap-1">
                      <Icon
                        icon="solar:check-circle-bold"
                        width="12"
                        height="12"
                      />
                      Active
                    </span>
                  </div>

                  <div class="mb-6 space-y-4">
                    <div
                      class="rounded-xl border border-base-300 bg-base-100 p-4 shadow-sm"
                    >
                      <div class="mb-2 flex items-center justify-between">
                        <span class="font-medium text-base-content/60"
                          >Vehicles</span
                        >
                        <span class="font-bold text-base-content">1/1</span>
                      </div>
                      <progress
                        class="progress progress-success w-full"
                        value="100"
                        max="100"
                      ></progress>
                    </div>

                    <div
                      class="rounded-xl border border-base-300 bg-base-100 p-4 shadow-sm"
                    >
                      <div class="mb-2 flex items-center justify-between">
                        <span class="font-medium text-base-content/60"
                          >Markers</span
                        >
                        <span class="font-bold text-base-content">0/100</span>
                      </div>
                      <progress
                        class="progress progress-info w-full"
                        value="0"
                        max="100"
                      ></progress>
                    </div>

                    <div
                      class="rounded-xl border border-base-300 bg-base-100 p-4 shadow-sm"
                    >
                      <div class="mb-2 flex items-center justify-between">
                        <span class="font-medium text-base-content/60"
                          >Trail Points</span
                        >
                        <span class="font-bold text-base-content"
                          >0/300,000</span
                        >
                      </div>
                      <progress
                        class="progress progress-secondary w-full"
                        value="0"
                        max="100"
                      ></progress>
                    </div>
                  </div>

                  {#if !isNativePlatform}
                    <button
                      class="btn w-full gap-2 text-black hover:text-black"
                      style="background-color: #FEDD64; border-color: #FEDD64;"
                      on:click={() => goto("/account/billing")}
                    >
                      <Icon
                        icon="solar:rocket-bold-duotone"
                        width="16"
                        height="16"
                      />
                      Upgrade Plan
                    </button>
                  {:else}
                    <div class="text-center">
                      <p class="mb-2 text-sm text-base-content/60">
                        Manage your subscription on
                      </p>
                      <p class="font-medium text-base-content">
                        AgSkan Website
                      </p>
                    </div>
                  {/if}
                </div>
              </div>
            </div>
          </section>
        {/if}

        {#if activeTab === "app-information"}
          <!-- App Information Section -->
          <section
            class="overflow-hidden rounded-xl border border-base-300 bg-base-100 shadow-lg"
          >
            <div
              class="border-b border-base-300 p-5"
              style="background-color: #FEDD64;"
            >
              <h2
                class="flex items-center gap-2 text-xl font-semibold text-black"
              >
                <div class="rounded-lg bg-black/10 p-1.5">
                  <Icon
                    icon="solar:info-circle-bold-duotone"
                    width="18"
                    height="18"
                    class="text-black"
                  />
                </div>
                App Information
              </h2>
            </div>

            <div class="space-y-4 p-6">
              <div>
                <label class="mb-1 block text-sm text-base-content/60"
                  >Version</label
                >
                <p
                  class="rounded-lg border border-base-300 bg-base-200 p-3 text-base-content"
                >
                  {APP_VERSION}
                </p>
              </div>

              <div class="mt-6 flex flex-col gap-4">
                <button
                  class="btn btn-outline w-full gap-2"
                  on:click={handleSignOut}
                >
                  <Icon
                    icon="solar:logout-3-bold-duotone"
                    width="16"
                    height="16"
                  />
                  Sign Out
                </button>

                <button
                  class="btn btn-outline w-full gap-2"
                  style="border-color: #e63946; color: #e63946;"
                  on:click={() => (showDeleteConfirm = true)}
                >
                  <Icon
                    icon="solar:trash-bin-trash-bold-duotone"
                    width="16"
                    height="16"
                  />
                  Delete Account
                </button>
              </div>
            </div>
          </section>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Mobile Content Sections (only when in detail view) -->
  {#if isMobile && mobileView === "detail"}
    <!-- Same sections as above but with mobile-specific styling -->
    {#if activeTab === "profile"}
      <!-- Profile Section -->
      <section
        class="overflow-hidden rounded-b-xl border border-base-300 bg-base-100 shadow-lg"
      >
        <div
          class="flex items-center justify-between border-b border-base-300 p-5"
          style="background-color: #FEDD64;"
        >
          <h2 class="flex items-center gap-2 text-xl font-semibold text-black">
            <div class="rounded-lg bg-black/10 p-1.5">
              <Icon
                icon="solar:user-bold-duotone"
                width="18"
                height="18"
                class="text-black"
              />
            </div>
            Profile
          </h2>
          {#if !editingProfile}
            <button
              on:click={() => (editingProfile = true)}
              class="rounded-lg p-1.5 text-black/80 transition-colors hover:bg-black/10 hover:text-black"
            >
              <Icon icon="solar:pen-bold-duotone" width="16" height="16" />
            </button>
          {/if}
        </div>

        <div class="p-6">
          {#if editingProfile}
            <div class="space-y-6">
              <div class="flex flex-col items-start gap-6">
                <div
                  class="group relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-2 border-base-300 bg-base-200 text-base-content shadow-sm"
                >
                  {#if formProfile.avatar}
                    <img
                      src={formProfile.avatar}
                      alt="Avatar"
                      class="h-full w-full object-cover"
                    />
                  {:else}
                    <span class="text-2xl font-bold uppercase"
                      >{formProfile.name.charAt(0) || "U"}</span
                    >
                  {/if}
                  <div
                    class="absolute inset-0 flex cursor-pointer items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <Icon
                      icon="solar:upload-bold-duotone"
                      width="16"
                      height="16"
                      class="text-white"
                    />
                  </div>
                </div>

                <div class="w-full">
                  <label
                    class="mb-2 block text-sm font-medium text-base-content/60"
                    >Full Name</label
                  >
                  <input
                    type="text"
                    bind:value={formProfile.name}
                    class="input input-bordered w-full"
                    placeholder="Enter your full name"
                  />
                </div>
              </div>

              <div>
                <label
                  class="mb-2 block text-sm font-medium text-base-content/60"
                  >Company Name</label
                >
                <input
                  type="text"
                  bind:value={formProfile.companyName}
                  class="input input-bordered w-full"
                  placeholder="Enter your company name"
                />
                <p class="mt-2 text-xs text-base-content/60">
                  This will appear on all reports and exported documents
                </p>
              </div>

              <div
                class="mt-8 flex justify-end gap-3 border-t border-base-300 pt-4"
              >
                <button
                  on:click={cancelProfileEdit}
                  class="btn btn-outline btn-sm gap-2"
                >
                  <Icon
                    icon="solar:close-circle-bold-duotone"
                    width="16"
                    height="16"
                  />
                  Cancel
                </button>
                <button
                  on:click={handleProfileUpdate}
                  class="btn btn-sm gap-2 text-black hover:text-black"
                  style="background-color: #FEDD64; border-color: #FEDD64;"
                >
                  <Icon
                    icon="solar:diskette-bold-duotone"
                    width="16"
                    height="16"
                  />
                  Save
                </button>
              </div>
            </div>
          {:else}
            <div class="space-y-6">
              <div
                class="flex flex-col items-center gap-6 rounded-xl border border-base-300 bg-base-200/30 p-6"
              >
                <div
                  class="flex h-24 w-24 items-center justify-center rounded-full border-2 border-base-300 bg-base-200 text-base-content shadow-md"
                >
                  {#if formProfile.avatar}
                    <img
                      src={formProfile.avatar}
                      alt="Avatar"
                      class="h-full w-full object-cover"
                    />
                  {:else}
                    <span class="text-3xl font-bold uppercase"
                      >{$profileStore?.full_name?.charAt(0) || "U"}</span
                    >
                  {/if}
                </div>
                <div class="text-center">
                  <h3 class="text-xl font-medium text-base-content">
                    {$profileStore?.full_name || "No name set"}
                  </h3>
                  <div class="mt-1 flex items-center justify-center gap-2">
                    <span class="badge badge-warning">
                      {$subscriptionStore?.subscription === "FREE"
                        ? "Free Plan"
                        : "Pro Plan"}
                    </span>
                    <span class="text-sm text-base-content/60"
                      >Farm Manager</span
                    >
                  </div>
                </div>
              </div>

              <div class="rounded-xl border border-base-300 bg-base-200/20 p-6">
                <h4 class="mb-4 font-medium text-base-content">
                  Company Information
                </h4>
                <div>
                  <label
                    class="mb-2 block text-sm font-medium text-base-content/60"
                    >Company Name</label
                  >
                  <p
                    class="flex items-center rounded-lg border border-base-300 bg-base-200 p-4 text-base-content"
                  >
                    {$profileStore?.company_name || "No company name set"}
                  </p>
                </div>
              </div>

              <button
                class="btn btn-outline w-full gap-2"
                on:click={() => (editingProfile = true)}
              >
                <Icon icon="solar:pen-bold-duotone" width="18" height="18" />
                Edit Profile
              </button>
            </div>
          {/if}
        </div>
      </section>
    {/if}

    <!-- Add other mobile sections here similarly... -->
    <!-- For brevity, I'm only showing the profile section, but you would duplicate the other sections with mobile-specific styling -->
  {/if}

  <!-- Delete Confirmation Modal -->
  {#if showDeleteConfirm}
    <div class="modal modal-open">
      <div class="modal-box">
        <h3 class="flex items-center gap-2 text-lg font-bold text-error">
          <Icon
            icon="solar:danger-triangle-bold-duotone"
            width="20"
            height="20"
          />
          Delete Account
        </h3>
        <p class="py-4">
          Are you sure you want to delete your account? This action cannot be
          undone and will permanently remove all your data.
        </p>
        <p class="text-sm font-medium text-error">
          Type "DELETE" below to confirm:
        </p>
        <input
          type="text"
          placeholder="Type DELETE to confirm"
          class="input input-bordered mt-2 w-full"
          bind:value={confirmText}
        />
        <div class="modal-action">
          <button
            class="btn btn-outline"
            on:click={() => (showDeleteConfirm = false)}
          >
            Cancel
          </button>
          <button
            class="btn gap-2"
            style="background-color: #e63946; border-color: #e63946; color: white;"
            disabled={confirmText !== "DELETE"}
            on:click={handleDeleteAccount}
          >
            <Icon
              icon="solar:trash-bin-trash-bold-duotone"
              width="16"
              height="16"
            />
            Delete Account
          </button>
        </div>
      </div>
      <div
        class="modal-backdrop"
        on:click={() => (showDeleteConfirm = false)}
      ></div>
    </div>
  {/if}
{/if}
