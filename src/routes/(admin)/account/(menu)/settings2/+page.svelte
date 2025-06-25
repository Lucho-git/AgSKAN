<!-- settings/+page.svelte (updated with theme toggle) -->
<script lang="ts">
  import { getContext, onMount } from "svelte"
  import type { Writable } from "svelte/store"
  import SettingsModule from "./settings_module.svelte"
  import MarkerFilterSettings from "./MarkerFilterSettings.svelte"
  import { PUBLIC_APP_VERSION } from "$env/static/public"
  import { session, supabase } from "$lib/stores/sessionStore"
  import { profileStore } from "$lib/stores/profileStore"
  import { goto } from "$app/navigation"
  import FloatingChat from "../../../../../components/FloatingChat.svelte"
  import TestButton from "./test_button.svelte"
  import { userSettingsApi } from "$lib/api/userSettingsApi"
  import { toast } from "svelte-sonner"
  import { browser } from "$app/environment"
  import { Capacitor } from "@capacitor/core"
  import { Geolocation } from "@capacitor/geolocation"

  // Import the Transistorsoft background geolocation plugin
  import BackgroundGeolocation from "@transistorsoft/capacitor-background-geolocation"

  let adminSection: Writable<string> = getContext("adminSection")
  adminSection.set("settings")

  let loading = true
  let subscriptionData = null
  const APP_VERSION = PUBLIC_APP_VERSION || "unknown"

  // Theme state
  let isDarkMode = false

  // Check if running on native platform
  const isNativePlatform = Capacitor.isNativePlatform()

  // Subscription state
  let currentPlan = "FREE"
  let planStatus = "Active"
  let planQuantity = "1"
  let isPaidPlan = false

  // Location permission states
  let locationPermissionStatus = "Unknown"
  let backgroundLocationStatus = "Unknown"

  // Theme functions
  function initializeTheme() {
    if (!browser) return

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
  }

  function toggleTheme() {
    if (!browser) return

    isDarkMode = !isDarkMode
    const newTheme = isDarkMode ? "skanthemedark" : "skantheme"
    document.documentElement.setAttribute("data-theme", newTheme)
    localStorage.setItem("theme", newTheme)

    // Show a toast to confirm the change
    toast.success(`Switched to ${isDarkMode ? "dark" : "light"} mode`)
  }

  async function loadUserSubscription() {
    try {
      // Fetch user's subscription from the database
      const { data, error } = await supabase
        .from("user_subscriptions")
        .select("*")
        .eq("user_id", $session.user.id)
        .single()

      if (data && !error) {
        subscriptionData = data
        currentPlan = data.subscription || "FREE"
        // Check if the user has a paid plan
        isPaidPlan = currentPlan !== "FREE"

        // Set other subscription details if available
        planStatus = "Active" // This might come from your subscription data
        planQuantity = data.current_seats?.toString() || "1"
      }
    } catch (err) {
      console.error("Error fetching subscription:", err)
    }
  }

  // Handle sign out
  async function handleSignOut() {
    try {
      const result = await userSettingsApi.signOut()
      if (result.success) {
        toast.success("Signed out successfully")
      }
    } catch (error) {
      console.error("Error signing out:", error)
      // Still redirect even if there's an error
      goto("/")
    }
  }

  // Updated checkLocationPermissions function to use status code
  async function checkLocationPermissions() {
    if (!isNativePlatform) {
      locationPermissionStatus = "Not applicable (web)"
      backgroundLocationStatus = "Not applicable (web)"
      return
    }

    try {
      // Check foreground location permission
      const permStatus = await Geolocation.checkPermissions()
      locationPermissionStatus = permStatus.location

      // Check background location status using the status code
      try {
        const providerState = await BackgroundGeolocation.getProviderState()
        // Status code 3 = AUTHORIZATION_STATUS_ALWAYS
        backgroundLocationStatus =
          providerState.status === 3 ? "granted" : "denied"
        console.log(
          `Background location permission (status=${providerState.status}): ${backgroundLocationStatus}`,
        )
      } catch (err) {
        console.error("Error checking background permissions:", err)
        backgroundLocationStatus = "Error checking"
      }
    } catch (err) {
      console.error("Error checking location permissions:", err)
      locationPermissionStatus = "Error checking"
    }
  }

  // Request location permission
  async function requestLocationPermission() {
    if (!isNativePlatform) return

    try {
      const permStatus = await Geolocation.requestPermissions()
      toast.success("Location permission updated")
      locationPermissionStatus = permStatus.location
      await checkLocationPermissions()
    } catch (err) {
      console.error("Error requesting location permission:", err)
      toast.error("Failed to update location permission")
    }
  }

  // Request background location permission using Transistorsoft plugin
  async function requestBackgroundLocationPermission() {
    if (!isNativePlatform) return

    if (locationPermissionStatus !== "granted") {
      toast.error("Please enable location permission first")
      return
    }

    try {
      // First, check current permission state and show it
      const beforeState = await BackgroundGeolocation.getProviderState()
      console.log(
        "Before requesting permission:",
        JSON.stringify(beforeState, null, 2),
      )

      // Show a toast with the current state
      toast.info("Current permission status", {
        description:
          `Enabled: ${beforeState.enabled}\n` +
          `Authorization: ${beforeState.authorization}\n` +
          `Background Permitted: ${beforeState.backgroundPermitted || "N/A"}`,
        duration: 5000,
      })

      // Show explanation
      toast.info(
        "Background location is needed to track field operations while the app is in the background",
        { duration: 5000 },
      )

      // Request the permission
      setTimeout(async () => {
        try {
          // Request background permissions
          await BackgroundGeolocation.requestPermission()

          // Check the state after the request
          const afterState = await BackgroundGeolocation.getProviderState()
          console.log(
            "After requesting permission:",
            JSON.stringify(afterState, null, 2),
          )

          // Show a toast with the new state
          toast.success("Permission request completed", {
            description:
              `Enabled: ${afterState.enabled}\n` +
              `Authorization: ${afterState.authorization}\n` +
              `Background Permitted: ${afterState.backgroundPermitted || "N/A"}`,
            duration: 5000,
          })

          // Update our UI state
          await checkLocationPermissions()
        } catch (err) {
          console.error("Error requesting background location:", err)
          toast.error("Failed to update background location permission", {
            description: err.message || "Unknown error",
          })
        }
      }, 2500)
    } catch (err) {
      console.error("Error in background location flow:", err)
      toast.error("An error occurred", {
        description: err.message || "Unknown error",
      })
    }
  }

  onMount(async () => {
    if (!$session) {
      goto("/login")
      return
    }

    // Initialize theme
    initializeTheme()

    // Load profile data if not already in store
    if (!$profileStore || !$profileStore.id) {
      await profileStore.loadProfile($session.user.id)
    }

    // Load subscription data
    await loadUserSubscription()

    // Check location permissions if on native platform
    if (isNativePlatform) {
      await checkLocationPermissions()
    }

    // Set loading to false once data is available
    loading = false
  })

  // Get the appropriate button text and link based on subscription status
  $: subscriptionButtonText = isPaidPlan
    ? "Manage Subscription"
    : "Upgrade Plan"
  $: subscriptionButtonLink = "/account/billing"

  // Format the plan name for display
  $: formattedPlanName =
    currentPlan === "FREE"
      ? "Free Plan"
      : currentPlan.charAt(0) + currentPlan.slice(1).toLowerCase() + " Plan"

  // Get current theme display name
  $: currentThemeDisplay = isDarkMode ? "Dark Mode" : "Light Mode"
</script>

<svelte:head>
  <title>Settings</title>
</svelte:head>

<h1 class="mb-6 text-2xl font-bold">Settings</h1>

{#if loading}
  <div class="flex h-64 items-center justify-center">
    <div class="loading loading-spinner loading-lg"></div>
  </div>
{:else}
  <!-- settings/+page.svelte (updated Profile card section) -->
  <SettingsModule
    title="Profile"
    editable={false}
    fields={[
      {
        id: "fullName",
        label: "Name",
        initialValue: $profileStore?.full_name ?? "",
      },
      {
        id: "companyName",
        label: "Company Name",
        initialValue: $profileStore?.company_name ?? "",
      },
      {
        id: "website",
        label: "Company Website",
        initialValue: $profileStore?.website ?? "",
      },
    ]}
  >
    <div class="flex flex-col gap-2" slot="buttons">
      <a href="/account/settings/edit_profile">
        <button class="btn btn-outline btn-sm min-w-[145px]">
          Edit Profile
        </button>
      </a>
      <a href="/account/sign_out">
        <button class="btn btn-outline btn-error btn-sm min-w-[145px]">
          Sign Out
        </button>
      </a>
    </div>
  </SettingsModule>

  <!-- Theme Settings Module -->
  <SettingsModule
    title="Appearance"
    editable={false}
    fields={[
      {
        id: "theme",
        label: "Theme",
        initialValue: currentThemeDisplay,
      },
    ]}
  >
    <div class="flex flex-col gap-2" slot="buttons">
      <button
        class="btn btn-outline btn-sm flex min-w-[145px] items-center gap-2"
        on:click={toggleTheme}
      >
        <!-- Theme Toggle Icons (same as navbar) -->
        {#if isDarkMode}
          <!-- Sun icon for switching to light mode -->
          <svg
            class="h-4 w-4 fill-current"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
          >
            <path
              d="M5.64,17l-.71.71a1,1,0,0,0,0,1.41,1,1,0,0,0,1.41,0l.71-.71A1,1,0,0,0,5.64,17ZM5,12a1,1,0,0,0-1-1H3a1,1,0,0,0,0,2H4A1,1,0,0,0,5,12Zm7-7a1,1,0,0,0,1-1V3a1,1,0,0,0-2,0V4A1,1,0,0,0,12,5ZM5.64,7.05a1,1,0,0,0,.7.29,1,1,0,0,0,.71-.29,1,1,0,0,0,0-1.41l-.71-.71A1,1,0,0,0,4.93,6.34Zm12,.29a1,1,0,0,0,.7-.29l.71-.71a1,1,0,1,0-1.41-1.41L17,5.64a1,1,0,0,0,0,1.41A1,1,0,0,0,17.66,7.34ZM21,11H20a1,1,0,0,0,0,2h1a1,1,0,0,0,0-2Zm-9,8a1,1,0,0,0-1,1v1a1,1,0,0,0,2,0V20A1,1,0,0,0,12,19ZM18.36,17A1,1,0,0,0,17,18.36l.71.71a1,1,0,0,0,1.41,0,1,1,0,0,0,0-1.41ZM12,6.5A5.5,5.5,0,1,0,17.5,12,5.51,5.51,0,0,0,12,6.5Zm0,9A3.5,3.5,0,1,1,15.5,12,3.5,3.5,0,0,1,12,15.5Z"
            />
          </svg>
          Light Mode
        {:else}
          <!-- Moon icon for switching to dark mode -->
          <svg
            class="h-4 w-4 fill-current"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
          >
            <path
              d="M21.64,13a1,1,0,0,0-1.05-.14,8.05,8.05,0,0,1-3.37.73A8.15,8.15,0,0,1,9.08,5.49a8.59,8.59,0,0,1,.25-2A1,1,0,0,0,8,2.36,10.14,10.14,0,1,0,22,14.05,1,1,0,0,0,21.64,13Zm-9.5,6.69A8.14,8.14,0,0,1,7.08,5.22v.27A10.15,10.15,0,0,0,17.22,15.63a9.79,9.79,0,0,0,2.1-.22A8.11,8.11,0,0,1,12.14,19.73Z"
            />
          </svg>
          Dark Mode
        {/if}
      </button>
    </div>
  </SettingsModule>

  <SettingsModule
    title="Email"
    editable={false}
    fields={[{ id: "email", initialValue: $session?.user?.email || "" }]}
    editButtonTitle="Change Email"
    editLink="/account/settings/change_email"
  />

  <SettingsModule
    title="Password"
    editable={false}
    fields={[{ id: "password", initialValue: "••••••••••••••••" }]}
    editButtonTitle="Change Password"
    editLink="/account/settings/change_password"
  />

  <!-- Marker Filter Settings Component -->
  <MarkerFilterSettings />

  <!-- Location Permissions Module (Only on native platforms) -->
  {#if isNativePlatform}
    <SettingsModule
      title="Location Permissions"
      editable={false}
      fields={[
        {
          id: "locationPermission",
          label: "Location Access",
          initialValue: locationPermissionStatus,
        },
        {
          id: "backgroundLocation",
          label: "Background Location",
          initialValue: backgroundLocationStatus,
        },
      ]}
    >
      <div class="flex flex-col gap-2" slot="buttons">
        <button
          class="btn btn-outline btn-sm min-w-[180px]"
          on:click={requestLocationPermission}
        >
          Enable Location
        </button>
        <button
          class="btn btn-outline btn-sm min-w-[180px]"
          on:click={async () => {
            try {
              if (locationPermissionStatus !== "granted") {
                toast.error("Please enable location permission first")
                return
              }

              // First check the current status
              const currentStatus =
                await BackgroundGeolocation.getProviderState()
              const hasBackgroundPermission = currentStatus.status === 3 // AUTHORIZATION_STATUS_ALWAYS

              if (hasBackgroundPermission) {
                toast.info("Background location is already enabled", {
                  description:
                    "Your location will be tracked even when the app is in the background",
                  duration: 5000,
                })
                return
              }

              // Show explanation
              toast.info(
                "Background location is needed to track field operations while the app is in the background",
                { duration: 5000 },
              )

              // Request the permission
              setTimeout(async () => {
                try {
                  // Request background permissions
                  await BackgroundGeolocation.requestPermission()

                  // Check if the permission was granted
                  const newStatus =
                    await BackgroundGeolocation.getProviderState()
                  const wasGranted = newStatus.status === 3 // AUTHORIZATION_STATUS_ALWAYS

                  if (wasGranted) {
                    toast.success("Background location enabled", {
                      description:
                        "Your location will now be tracked even when the app is in the background",
                      duration: 5000,
                    })
                  } else {
                    toast.warning("Background location not enabled", {
                      description:
                        "Your location will only be tracked when the app is open",
                      duration: 5000,
                    })
                  }

                  // Update UI to reflect new status
                  backgroundLocationStatus = wasGranted ? "granted" : "denied"
                } catch (err) {
                  console.error("Error requesting background location:", err)
                  toast.error("Could not enable background location", {
                    description:
                      err.message ||
                      "Please try again or check your device settings",
                    duration: 5000,
                  })
                }
              }, 2500)
            } catch (err) {
              console.error("Error in background location flow:", err)
              toast.error("An error occurred", {
                description: err.message || "Unknown error",
              })
            }
          }}
          disabled={locationPermissionStatus !== "granted"}
        >
          Enable Background Location
        </button>
      </div>
    </SettingsModule>
  {/if}

  <!-- Subscription Module - Different for native and web -->
  {#if isNativePlatform}
    <!-- Native version - no button, app store info -->
    <SettingsModule
      title="Subscription"
      editable={false}
      fields={[
        {
          id: "planName",
          label: "Current Plan",
          initialValue: formattedPlanName,
        },
        {
          id: "planStatus",
          label: "Status",
          initialValue: planStatus,
        },
        {
          id: "quantity",
          label: "Quantity",
          initialValue: planQuantity,
        },
        {
          id: "managedBy",
          label: "Managed By",
          initialValue:
            Capacitor.getPlatform() === "ios"
              ? "AgSkan Website"
              : "AgSkan Website",
        },
      ]}
    >
      <!-- No buttons for native platforms -->
      <div slot="buttons"></div>
    </SettingsModule>
  {:else}
    <!-- Web version - with button -->
    <SettingsModule
      title="Subscription"
      editable={false}
      fields={[
        {
          id: "planName",
          label: "Current Plan",
          initialValue: formattedPlanName,
        },
        {
          id: "planStatus",
          label: "Status",
          initialValue: planStatus,
        },
        {
          id: "quantity",
          label: "Quantity",
          initialValue: planQuantity,
        },
      ]}
      editButtonTitle={subscriptionButtonText}
      editLink={subscriptionButtonLink}
    />
  {/if}

  <SettingsModule
    title="App Version"
    editable={false}
    dangerous={true}
    fields={[{ id: "version", initialValue: APP_VERSION }]}
    editButtonTitle="Delete Account"
    editLink="/account/settings/delete_account"
  />

  <!-- <FloatingChat /> -->
  <TestButton
    data={{ session: $session, profile: $profileStore, subscriptionData }}
  />
{/if}
