<!-- settings/+page.svelte (with separate marker filter component) -->
<script lang="ts">
  import { getContext, onMount } from "svelte"
  import type { Writable } from "svelte/store"
  import SettingsModule from "./settings_module.svelte"
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

  // Import MarkerFilterSettings component
  import MarkerFilterSettings from "./MarkerFilterSettings.svelte"

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

  <FloatingChat />
  <TestButton
    data={{ session: $session, profile: $profileStore, subscriptionData }}
  />
{/if}
