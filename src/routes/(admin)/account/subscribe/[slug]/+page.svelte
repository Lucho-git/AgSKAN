<!-- src/routes/(admin)/account/subscribe/[slug]/+page.svelte -->
<script lang="ts">
  import { onMount } from "svelte"
  import { goto } from "$app/navigation"
  import { session } from "$lib/stores/sessionStore"
  import { toast } from "svelte-sonner"
  import {
    createCheckoutSession,
    createFreeSubscription,
  } from "$lib/helpers/subscriptionHelpers"

  export let data

  onMount(async () => {
    try {
      // If there's an error, show it and redirect
      if (data.error) {
        toast.error(data.error)
        setTimeout(() => goto("/account/payment_plans"), 2000)
        return
      }

      if (!$session) {
        throw new Error("Authentication required")
        return
      }

      // Get slug and params
      const params = new URLSearchParams(window.location.search)
      const slug = window.location.pathname.split("/").pop()

      // Free plan handling
      if (slug === "free_plan") {
        const { error } = await createFreeSubscription({ session: $session })

        if (error) {
          throw new Error(`Failed to activate free plan: ${error}`)
        }

        toast.success("Free plan activated!")
        goto("/account")
        return
      }

      // Paid plan handling
      const seats = parseInt(params.get("seats") || "1")
      const discount = params.get("discount") === "true"
      const discountcode = params.get("discountcode")

      // Create checkout session
      const { error, stripeUrl } = await createCheckoutSession({
        session: $session,
        priceId: slug,
        seats,
        discount,
        discountcode,
      })

      if (error || !stripeUrl) {
        throw new Error(error || "Failed to create checkout session")
      }

      // Redirect to Stripe
      window.location.href = stripeUrl
    } catch (error) {
      console.error("Error:", error)
      toast.error(error.message || "An unexpected error occurred")
      setTimeout(() => goto("/account/payment_plans"), 2000)
    }
  })
</script>

<!-- Minimal UI: Only show while processing -->
<div
  class="fixed inset-0 z-50 flex items-center justify-center bg-base-100 bg-opacity-50 backdrop-blur-sm"
>
  <div class="container mx-auto flex flex-col items-center justify-center px-4">
    <div class="flex flex-col items-center">
      <div class="skeleton mb-4 h-12 w-12 rounded-full"></div>
      <p class="text-lg">"Just a moment..."</p>
    </div>
  </div>
</div>
