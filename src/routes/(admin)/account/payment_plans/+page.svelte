<!-- src/routes/(admin)/account/payment_plans/+page.svelte -->
<script lang="ts">
  import { onMount } from "svelte"
  import PricingSection from "$lib/components/PricingSection.svelte"
  import { supabase } from "$lib/stores/sessionStore"
  import { profileStore } from "../../../../stores/profileStore"
  import { toast } from "svelte-sonner"

  let currentPlanId = "none"
  let loading = true
  let error = null

  // Ensure profile is marked as onboarded on mount
  onMount(async () => {
    try {
      // If we're here, the user has completed previous steps, so mark them as onboarded
      if ($profileStore?.id) {
        const { error: updateError } = await supabase
          .from("profiles")
          .update({
            onboarded: true,
            updated_at: new Date().toISOString(),
          })
          .eq("id", $profileStore.id)

        if (updateError) {
          console.error("Error updating onboarded status:", updateError)
        }

        // Update local store
        profileStore.update((profile) => ({
          ...profile,
          onboarded: true,
        }))
      }

      // Fetch customer information
      // Note: Since customer creation likely requires server-side APIs for Stripe,
      // we'll make an API call to a server endpoint to handle this
      const response = await fetch("/api/customer/status", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      })

      if (!response.ok) {
        throw new Error("Failed to fetch customer status")
      }

      const data = await response.json()
      currentPlanId = data.currentPlanId || "none"
    } catch (err) {
      console.error("Error initializing payment page:", err)
      error = err.message
      toast.error("Failed to load subscription information")
    } finally {
      loading = false
    }
  })
</script>

<svelte:head>
  <title>Billing</title>
</svelte:head>

<div class="container mx-auto px-4">
  {#if loading}
    <div class="flex h-96 items-center justify-center">
      <div class="flex flex-col items-center">
        <div
          class="h-16 w-16 animate-spin rounded-full border-4 border-primary border-t-transparent"
        ></div>
        <p class="mt-4 text-xl">Loading subscription information...</p>
      </div>
    </div>
  {:else if error}
    <div class="my-8 rounded-lg bg-red-50 p-6 text-center">
      <h2 class="mb-4 text-xl font-bold text-red-700">
        Error Loading Subscription Information
      </h2>
      <p class="text-red-600">{error}</p>
      <button
        class="mt-4 rounded bg-primary px-4 py-2 text-white"
        on:click={() => window.location.reload()}
      >
        Try Again
      </button>
    </div>
  {:else}
    <div class="py-2">
      <h1 class="mb-4 text-center text-4xl font-bold">Select a Plan</h1>
      <PricingSection {currentPlanId} useFullPrice={true} />
    </div>
  {/if}
</div>
