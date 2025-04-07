<!-- src/routes/(admin)/account/user_survey/+page.svelte -->
<script lang="ts">
  import FeatheryForm from "../../../../components/FeatheryForm.svelte"
  import { goto } from "$app/navigation"
  import { onMount } from "svelte"
  import { supabase } from "$lib/stores/sessionStore"
  import { profileStore } from "$lib/stores/profileStore"
  import { browser } from "$app/environment"
  import { Capacitor } from "@capacitor/core"

  let loading = false
  let isNative = false

  // Check if running in Capacitor native environment
  onMount(() => {
    if (browser) {
      try {
        isNative = Capacitor.isNativePlatform()
        console.log("Is running on native platform:", isNative)
      } catch (error) {
        console.error("Error checking native platform:", error)
        isNative = false
      }

      // Update the profile store if needed, but don't redirect automatically
      if ($profileStore?.id) {
        console.log("Profile found, but letting user complete survey")
      }
    }
  })

  async function updateOnboardingStatus() {
    if (!$profileStore?.id) {
      console.error("Cannot update onboarding status: profile ID is undefined")
      return
    }

    try {
      await supabase
        .from("profiles")
        .update({
          onboarded: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", $profileStore.id)

      // Update local store
      profileStore.update((profile) => ({
        ...profile,
        onboarded: true,
      }))

      console.log("Onboarding status updated successfully")
      return true
    } catch (error) {
      console.error("Error updating onboarded status:", error)
      return false
    }
  }

  async function handleFormComplete() {
    console.log("Survey completed!")
    loading = true

    try {
      await updateOnboardingStatus()

      // After survey completion, redirect based on platform
      const nextPath = isNative ? "/account" : "/account/payment_plans"
      console.log("Redirecting to:", nextPath)
      await goto(nextPath)
    } catch (error) {
      console.error("Error during post-survey redirect:", error)
    } finally {
      loading = false
    }
  }

  async function handleSkipSurvey() {
    loading = true
    try {
      // Update onboarding status even when skipping
      await updateOnboardingStatus()

      // If native, go directly to account, otherwise to payment plans
      const nextPath = isNative ? "/account" : "/account/payment_plans"
      console.log("Skipping survey, redirecting to:", nextPath)
      await goto(nextPath)
    } catch (error) {
      console.error("Error navigating:", error)
    } finally {
      loading = false
    }
  }
</script>

<svelte:head>
  <title>User Survey</title>
</svelte:head>

<div
  class="mb-12 mt-4 flex min-h-[100vh] place-content-center content-center items-center text-center"
>
  <div class="flex w-full flex-col px-6">
    <div>
      <h1 class="mb-6 text-2xl font-bold">User Survey</h1>
      <div class="form-container">
        <!-- Pass the event handler to capture form completion -->
        <FeatheryForm on:complete={handleFormComplete} />
        <button
          type="button"
          class="btn btn-secondary mt-4"
          on:click={handleSkipSurvey}
          disabled={loading}
        >
          {loading ? "Processing..." : "Skip Survey"}
        </button>
      </div>
    </div>
  </div>
</div>
