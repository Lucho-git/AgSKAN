<script lang="ts">
  import { toast } from "svelte-sonner"
  import { session } from "$lib/stores/sessionStore"

  export let subscriptionData
  $: isScheduledForCancellation =
    subscriptionData.stripeSubscription.cancel_at_period_end

  let showCancelModal = false
  let loading = false
  let cancelResult = null

  function openCancelModal() {
    showCancelModal = true
    loading = true
    cancelResult = null
    console.log("Subscription Data:", subscriptionData)

    // Start with immediate loading state, then perform action if reversal
    if (isScheduledForCancellation) {
      // Delay slightly to show loading skeleton
      setTimeout(() => {
        handleCancelAction(true)
      }, 100)
    } else {
      // For regular cancellation, just show the confirmation screen
      setTimeout(() => {
        loading = false
      }, 300) // Brief skeleton for visual consistency
    }
  }

  async function handleCancelAction(isReversal = false) {
    try {
      loading = true
      console.log("Starting cancel action, isReversal=", isReversal)

      const endpoint = isReversal
        ? "/api/subscription/actions/reverse-cancel"
        : "/api/subscription/actions/cancel"

      console.log("Using endpoint:", endpoint)
      console.log("Authorization token available:", !!$session.access_token)

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${$session.access_token}`,
        },
        // Send an empty object to ensure we have a valid JSON body
        body: JSON.stringify({}),
      })

      console.log("Response status:", response.status)

      // Check if response has content
      const contentType = response.headers.get("content-type")
      if (contentType && contentType.includes("application/json")) {
        const data = await response.json()
        console.log("Response data:", data)

        if (!response.ok) {
          throw new Error(data.error || data.message || "Request failed")
        }

        cancelResult = data
      } else {
        // Handle empty response
        console.error("Empty or non-JSON response")
        throw new Error("Invalid response from server")
      }

      if (cancelResult.success) {
        toast.success(
          isReversal
            ? "Cancellation reversed successfully"
            : "Subscription cancelled successfully",
        )
      } else {
        throw new Error(cancelResult.message || "Action failed")
      }
    } catch (error) {
      console.error("Error processing cancel action:", error)
      toast.error(
        isReversal
          ? "Failed to reverse cancellation"
          : "Failed to cancel subscription",
      )
      cancelResult = {
        success: false,
        message: error.message,
      }
    } finally {
      loading = false
    }
  }
</script>

<div class="card mt-8 max-w-xl p-6 shadow">
  <h2 class="mb-4 text-xl font-bold">
    {isScheduledForCancellation
      ? "Subscription Cancellation"
      : "Cancel Subscription"}
  </h2>
  <button
    on:click={openCancelModal}
    class="btn w-full"
    class:btn-error={!isScheduledForCancellation}
    class:btn-success={isScheduledForCancellation}
  >
    {isScheduledForCancellation
      ? "Reverse Cancellation"
      : "Cancel Subscription"}
  </button>
</div>

{#if showCancelModal}
  <div class="modal modal-open">
    <div class="modal-box max-w-2xl">
      <h3 class="mb-6 text-2xl font-bold">
        {isScheduledForCancellation
          ? "Reverse Subscription Cancellation"
          : "Cancel Subscription"}
      </h3>
      {#if loading}
        <div class="space-y-6">
          <!-- Daisy UI Skeleton for subscription details -->
          <div class="rounded-lg bg-base-200 p-6">
            <div class="skeleton mb-3 h-6 w-60"></div>
            <div class="grid grid-cols-2 gap-4">
              <div class="rounded bg-base-100 p-3">
                <div class="skeleton mb-1 h-3 w-12"></div>
                <div class="skeleton h-5 w-24"></div>
              </div>
              <div class="rounded bg-base-100 p-3">
                <div class="skeleton mb-1 h-3 w-16"></div>
                <div class="skeleton h-5 w-20"></div>
              </div>
              <div class="rounded bg-base-100 p-3">
                <div class="skeleton mb-1 h-3 w-20"></div>
                <div class="skeleton h-5 w-8"></div>
              </div>
              <div class="rounded bg-base-100 p-3">
                <div class="skeleton mb-1 h-3 w-24"></div>
                <div class="skeleton h-5 w-24"></div>
              </div>
            </div>
          </div>

          <!-- Skeleton for cancellation/reversal information -->
          <div class="rounded-lg bg-base-200 p-6">
            <div class="skeleton mb-3 h-6 w-48"></div>
            <div class="skeleton mb-4 h-4 w-full"></div>
            <div class="space-y-3">
              <div class="flex items-start">
                <div
                  class="skeleton mr-2 mt-1.5 h-2.5 w-2.5 rounded-full"
                ></div>
                <div class="skeleton h-4 w-full"></div>
              </div>
              <div class="flex items-start">
                <div
                  class="skeleton mr-2 mt-1.5 h-2.5 w-2.5 rounded-full"
                ></div>
                <div class="skeleton h-4 w-full"></div>
              </div>
              <div class="flex items-start">
                <div
                  class="skeleton mr-2 mt-1.5 h-2.5 w-2.5 rounded-full"
                ></div>
                <div class="skeleton h-4 w-full"></div>
              </div>
              <div class="flex items-start">
                <div
                  class="skeleton mr-2 mt-1.5 h-2.5 w-2.5 rounded-full"
                ></div>
                <div class="skeleton h-4 w-full"></div>
              </div>
            </div>
          </div>
        </div>
      {:else if cancelResult}
        <p class="mb-4 rounded-lg bg-base-200 p-4">
          {cancelResult.message}
        </p>
        {#if cancelResult.success}
          <div class="mt-4 rounded-lg bg-success/10 p-4">
            {#if isScheduledForCancellation}
              <p>Your subscription will continue without interruption.</p>
            {:else}
              <p>
                Your subscription will remain active until the end of your
                current billing period.
              </p>
            {/if}
          </div>
        {:else}
          <div class="mt-4 rounded-lg bg-error/10 p-4">
            <p>
              There was a problem with your request. Please try again or contact
              support.
            </p>
          </div>
        {/if}
      {:else}
        <div class="space-y-6">
          <div class="rounded-lg bg-base-200 p-6">
            <h4 class="mb-3 text-lg font-semibold">
              Current Subscription Details:
            </h4>
            <div class="grid grid-cols-2 gap-4">
              <div class="rounded bg-base-100 p-3">
                <p class="text-sm">Plan</p>
                <p class="text-lg font-bold">
                  {subscriptionData.appSubscription.name}
                </p>
              </div>
              <div class="rounded bg-base-100 p-3">
                <p class="text-sm">Billing Cycle</p>
                <p class="text-lg font-bold">
                  {subscriptionData.stripeSubscription.plan.interval}ly
                </p>
              </div>
              <div class="rounded bg-base-100 p-3">
                <p class="text-sm">Number of Seats</p>
                <p class="text-lg font-bold">
                  {subscriptionData.stripeSubscription.quantity}
                </p>
              </div>
              <div class="rounded bg-base-100 p-3">
                <p class="text-sm">Current Period End</p>
                <p class="text-lg font-bold">
                  {new Date(
                    subscriptionData.stripeSubscription.current_period_end *
                      1000,
                  ).toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>

          <div class="rounded-lg bg-base-200 p-6">
            <h4 class="mb-3 text-lg font-semibold">
              {isScheduledForCancellation
                ? "Reversal Information:"
                : "Cancellation Information:"}
            </h4>
            {#if isScheduledForCancellation}
              <p class="mb-4">If you reverse the cancellation:</p>
              <ul class="list-disc space-y-2 pl-6">
                <li>Your subscription will continue without interruption.</li>
                <li>You'll retain access to all current features and seats.</li>
                <li>
                  Your next billing date will remain {new Date(
                    subscriptionData.stripeSubscription.current_period_end *
                      1000,
                  ).toLocaleDateString()}.
                </li>
                <li>Regular billing will resume on this date.</li>
              </ul>
            {:else}
              <p class="mb-4">If you proceed with cancellation:</p>
              <ul class="list-disc space-y-2 pl-6">
                <li>
                  Your current subscription will remain active until
                  <span class="font-bold">
                    {new Date(
                      subscriptionData.stripeSubscription.current_period_end *
                        1000,
                    ).toLocaleDateString()}
                  </span>.
                </li>
                <li>
                  You'll continue to have access to your current number of seats
                  and features during this period.
                </li>
                <li>
                  After the end date, your account will be moved to the free
                  tier plan.
                </li>
                <li>No further charges will be incurred after cancellation.</li>
              </ul>
            {/if}
          </div>
        </div>
      {/if}
      <div class="modal-action mt-6">
        {#if !cancelResult && !loading}
          <button
            type="button"
            class="btn"
            class:btn-error={!isScheduledForCancellation}
            class:btn-success={isScheduledForCancellation}
            disabled={loading}
            on:click={() => handleCancelAction(isScheduledForCancellation)}
          >
            {isScheduledForCancellation
              ? "Confirm Reversal"
              : "Confirm Cancellation"}
          </button>
        {/if}
        <button
          class="btn btn-outline"
          disabled={loading}
          on:click={() => {
            if (cancelResult && cancelResult.success) {
              window.location.reload()
            } else {
              showCancelModal = false
              cancelResult = null
            }
          }}
        >
          {cancelResult && cancelResult.success ? "Refresh Page" : "Close"}
        </button>
      </div>
    </div>
  </div>
{/if}
