<!-- settings/+page.svelte (with separate marker filter component) -->
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

        <!-- Improved debug button to check permission in detail
        <button
          class="btn btn-outline btn-sm min-w-[180px]"
          on:click={async () => {
            try {
              const providerState =
                await BackgroundGeolocation.getProviderState()
              console.log(
                "Provider State:",
                JSON.stringify(providerState, null, 2),
              )

              // Check background permission (status code 3 = ALWAYS)
              const hasBackgroundPermission = providerState.status === 3

              // Update UI to match the actual status
              backgroundLocationStatus = hasBackgroundPermission
                ? "granted"
                : "denied"

              // Show detailed status information
              toast.success("Permission Status", {
                description:
                  `Location: ${locationPermissionStatus}\n` +
                  `Background: ${backgroundLocationStatus}\n` +
                  `Status Code: ${providerState.status} (${hasBackgroundPermission ? "ALWAYS" : "NOT ALWAYS"})\n` +
                  `GPS: ${providerState.gps ? "Enabled" : "Disabled"}\n` +
                  `Network: ${providerState.network ? "Enabled" : "Disabled"}`,
                duration: 8000,
              })
            } catch (err) {
              console.error("Error checking permissions:", err)
              toast.error("Could not check permission status", {
                description: err.message || "Unknown error",
              })
            }
          }}
        >
          Check Permission Status
        </button> -->
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
