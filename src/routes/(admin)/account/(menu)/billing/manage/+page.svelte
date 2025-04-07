<!-- src/routes/(admin)/account/billing/manage/+page.svelte -->
<script lang="ts">
  import { onMount } from "svelte"
  import { subscriptionApi } from "$lib/api/subscriptionApi"
  import { toast } from "svelte-sonner"
  import { goto } from "$app/navigation"

  let loading = true
  let error: string | null = null

  onMount(async () => {
    try {
      loading = true
      const result = await subscriptionApi.createPortalSession()

      if (result.success && result.url) {
        // Redirect to Stripe portal
        window.location.href = result.url
      } else {
        error = result.message || "Failed to create portal session"
        toast.error(error)
      }
    } catch (err) {
      error = err.message || "An unexpected error occurred"
      toast.error(error)
    } finally {
      loading = false
    }
  })

  function goBack() {
    goto("/account/billing")
  }
</script>

<svelte:head>
  <title>Manage Subscription</title>
</svelte:head>

<div
  class="container mx-auto flex h-[60vh] flex-col items-center justify-center px-4"
>
  {#if loading}
    <div class="flex flex-col items-center">
      <div class="skeleton mb-4 h-12 w-12 rounded-full"></div>
      <p class="text-lg">Preparing your billing portal...</p>
    </div>
  {:else if error}
    <div class="mx-auto my-8 max-w-xl rounded-lg bg-red-50 p-6 text-center">
      <h2 class="mb-4 text-xl font-bold text-red-700">
        Error Creating Portal Session
      </h2>
      <p class="text-red-600">{error}</p>
      <div class="mt-4">
        <button
          on:click={goBack}
          class="rounded bg-primary px-4 py-2 text-white"
        >
          Return to Billing
        </button>
      </div>
    </div>
  {:else}
    <div class="flex flex-col items-center">
      <div class="skeleton mb-4 h-12 w-12 rounded-full"></div>
      <p class="text-lg">Redirecting to Stripe...</p>
    </div>
  {/if}
</div>
