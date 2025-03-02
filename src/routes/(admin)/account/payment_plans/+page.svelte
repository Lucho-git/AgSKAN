<!-- src/routes/(admin)/account/payment_plans/+page.svelte -->
<script lang="ts">
  import { onMount } from "svelte"
  import PricingSection from "$lib/components/PricingSection.svelte"
  import { supabase, session } from "$lib/stores/sessionStore"
  import { profileStore } from "$lib/stores/profileStore"
  import { toast } from "svelte-sonner"
  import { goto } from "$app/navigation"

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
          console.error("Error updating onboarding status:", updateError)
        }

        // Update local store
        profileStore.update((profile) => ({
          ...profile,
          onboarded: true,
        }))
      }

      // No need to fetch subscription status - just show both plans
      loading = false
    } catch (err) {
      console.error("Error initializing payment page:", err)
      error = err.message
      loading = false
    }
  })

  // Simple function to activate free plan directly
  async function activateFreePlan() {
    try {
      if (!$session?.access_token) {
        throw new Error("No authentication token available")
      }

      const response = await fetch("/api/subscription/free", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${$session.access_token}`,
        },
      })

      if (!response.ok) {
        throw new Error("Failed to activate free plan")
      }

      toast.success("Free plan activated!")
      goto("/account")
    } catch (err) {
      console.error(err)
      toast.error("Failed to activate free plan. Please try again.")
    }
  }
</script>

<svelte:head>
  <title>Select a Plan</title>
</svelte:head>

<div class="container mx-auto px-4">
  {#if loading}
    <div class="flex h-48 items-center justify-center">
      <div
        class="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent"
      ></div>
    </div>
  {:else if error}
    <div class="my-8 rounded-lg bg-red-50 p-6 text-center">
      <h2 class="mb-4 text-xl font-bold text-red-700">Error</h2>
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
      <!-- Custom component to override the free plan button -->
      <div class="relative">
        <PricingSection currentPlanId="none" useFullPrice={true} />

        <!-- Overlay to catch the free plan button click -->
        <div
          class="pointer-events-none absolute left-0 top-0 z-10 h-full w-full"
        >
          <div class="grid h-full md:grid-cols-2">
            <div class="relative">
              <!-- Free plan button overlay -->
              <button
                class="pointer-events-auto absolute bottom-[calc(50%-80px)] left-1/2 h-12 w-[90%] -translate-x-1/2 opacity-0"
                on:click={activateFreePlan}
                aria-label="Get Started with Free Plan"
              />
            </div>
            <div></div>
            <!-- Pro plan column - don't intercept -->
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>
