<script lang="ts">
  import { toast } from "svelte-sonner"
  import { session } from "$lib/stores/sessionStore"

  export let data
  let { subscriptionData, seatManagementInfo } = data
  let currentSeats = subscriptionData.stripeSubscription.quantity || 1
  let selectedSeats = currentSeats
  let showSeatsModal = false
  let loading = false
  let modalContent = null
  let importantInfo = null
  let updateResult = null
  let previewError = null

  $: seatDifference = selectedSeats - currentSeats
  $: isIncreasing = seatDifference > 0
  $: isDecreasing = seatDifference < 0

  function incrementSeats() {
    selectedSeats += 1
  }

  function decrementSeats() {
    if (selectedSeats > 1) selectedSeats -= 1
  }

  function openSeatsModal() {
    showSeatsModal = true
    loading = true
    modalContent = null
    importantInfo = null
    previewError = null

    // Fetch data after modal is opened
    fetchProratedSeatsPreview()
  }

  async function fetchProratedSeatsPreview() {
    try {
      console.log("Fetching seat proration preview...")
      console.log(
        "Current auth token:",
        $session.access_token ? "Available" : "Not available",
      )

      const response = await fetch(
        "/api/subscription/previews/prorated-seats",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${$session.access_token}`,
          },
          body: JSON.stringify({
            quantity: selectedSeats,
            appliedDate: isIncreasing ? "now" : "later",
          }),
        },
      )

      console.log("Response status:", response.status)

      if (!response.ok) {
        const errorData = await response.json()
        console.error("Preview error response:", errorData)
        previewError = errorData.error || "Failed to fetch preview"
        throw new Error(previewError)
      }

      const result = await response.json()
      console.log("Proration Preview result:", result)

      if (result.type === "success") {
        const parsedData = JSON.parse(result.data)
        const prorationPreview = parsedData[2]
        console.log("Parsed Proration Preview:", prorationPreview)
        modalContent = prorationPreview

        importantInfo = extractImportantInfo(prorationPreview, isIncreasing)
        console.log("Important Information:", importantInfo)
      } else {
        previewError = result.error || "Failed to calculate preview"
        throw new Error(previewError)
      }
    } catch (error) {
      console.error("Error fetching proration preview:", error)
      toast.error("Failed to load seat pricing preview")
      previewError = error.message || "An unexpected error occurred"
    } finally {
      loading = false
    }
  }

  function extractImportantInfo(prorationPreview, isIncreasing) {
    try {
      const lines = prorationPreview.lines.data

      const currentSeats = lines[0].quantity
      const newSeats = lines[1].quantity
      const anchorDate = new Date(lines[0].period.end * 1000)
      const daysUntilAnchor = Math.ceil(
        (lines[0].period.end - lines[0].period.start) / (24 * 60 * 60),
      )
      const futureCost = lines[2].amount / 100
      const immediateCharge = isIncreasing
        ? (lines[0].amount + lines[1].amount) / 100
        : 0
      const billingCycle = lines[0].price.recurring.interval
      console.log("IsIncreasing?", isIncreasing)
      const nextPaymentDate = isIncreasing ? anchorDate : new Date()
      const currency = lines[0].currency

      // Calculate monthly costs
      const baseRatePerSeat = futureCost / newSeats
      const monthlyCost =
        billingCycle === "year" ? baseRatePerSeat / 12 : baseRatePerSeat
      const oldMonthly = currentSeats * monthlyCost
      const newMonthly = newSeats * monthlyCost
      const monthlyDifference = newMonthly - oldMonthly

      return {
        currentSeats,
        newSeats,
        billingCycle: billingCycle === "year" ? "annual" : "monthly",
        currency,
        changeAppliedDate: isIncreasing
          ? "immediately"
          : "on next billing date",
        immediateCharge,
        futureCost,
        anchorDate: anchorDate.toISOString().split("T")[0],
        daysUntilAnchor,
        isIncreasing,
        nextPaymentDate: nextPaymentDate.toISOString().split("T")[0],
        lineItems: lines.map((item) => ({
          description: item.description,
          amount: item.amount / 100,
          proration: item.proration,
        })),
        oldMonthly,
        newMonthly,
        monthlyDifference,
        monthlyCost,
      }
    } catch (error) {
      console.error("Error extracting important info:", error)
      // Return null and let the component handle it
      return null
    }
  }

  async function updateSeats() {
    try {
      loading = true
      console.log("Updating seats...")

      const response = await fetch("/api/subscription/actions/update-seats", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${$session.access_token}`,
        },
        body: JSON.stringify({
          quantity: importantInfo.newSeats,
          appliedDate: importantInfo.isIncreasing ? "now" : "later",
        }),
      })

      console.log("Update response status:", response.status)

      if (!response.ok) {
        const errorData = await response.json()
        console.error("Update error response:", errorData)
        throw new Error(errorData.error || "Failed to update seats")
      }

      updateResult = await response.json()
      console.log("Update result:", updateResult)

      if (updateResult.success) {
        toast.success("Subscription updated successfully")
      } else {
        throw new Error(updateResult.error || "Update failed")
      }
    } catch (error) {
      console.error("Error updating seats:", error)
      toast.error("Failed to update subscription")
      updateResult = {
        success: false,
        error: error.message,
      }
    } finally {
      loading = false
    }
  }
</script>

<div class="card mt-8 max-w-xl p-6 shadow">
  <h2 class="mb-4 text-xl font-bold">Manage Seats</h2>
  <div class="mb-4 flex items-center justify-center">
    <button
      class="btn btn-outline btn-sm {isDecreasing ? 'text-red-500' : ''}"
      on:click={decrementSeats}
      disabled={selectedSeats === 1}
    >
      -
    </button>
    <span class="mx-4 text-lg font-bold text-black">
      {selectedSeats}
      {selectedSeats === 1 ? "seat" : "seats"}
    </span>
    <button
      class="btn btn-outline btn-sm {isIncreasing
        ? 'hover:from-secondary-focus hover:to-accent-focus bg-gradient-to-r from-secondary to-accent text-secondary-content'
        : ''}"
      on:click={incrementSeats}
    >
      +
    </button>
  </div>
  <button
    on:click={openSeatsModal}
    class="btn w-full {seatDifference === 0
      ? 'btn-disabled'
      : isDecreasing
        ? 'btn-outline btn-warning'
        : 'hover:from-secondary-focus hover:to-accent-focus bg-gradient-to-r from-secondary to-accent text-secondary-content'}"
    disabled={seatDifference === 0}
  >
    {#if isDecreasing}
      Reduce {Math.abs(seatDifference)} seats
    {:else if isIncreasing}
      Add {seatDifference} seats
    {:else}
      Modify number of seats
    {/if}
  </button>
</div>

{#if showSeatsModal}
  <div class="modal modal-open">
    <div class="modal-box max-w-2xl">
      {#if updateResult}
        {#if updateResult.success}
          <h3 class="mb-6 text-2xl font-bold">
            Subscription Updated Successfully
          </h3>
          <div class="space-y-4">
            {#if updateResult.discountApplied}
              <p class="rounded-lg bg-info/20 p-4">
                A discount has been applied to your subscription.
              </p>
            {/if}
            <p class="rounded-lg bg-success/20 p-4">
              Your seat count has been updated to {updateResult.newQuantity}.
            </p>
          </div>
        {:else}
          <h3 class="mb-6 text-2xl font-bold">Update Failed</h3>
          <p class="mb-4 rounded-lg bg-error/20 p-4">{updateResult.error}</p>
          {#if updateResult.code === "card_declined"}
            <p class="rounded-lg bg-base-200 p-4">
              Your card was declined. Please update your payment method and try
              again.
            </p>
          {:else if updateResult.code === "insufficient_funds"}
            <p class="rounded-lg bg-base-200 p-4">
              Your card has insufficient funds. Please use a different payment
              method.
            </p>
          {/if}
        {/if}
      {:else}
        <h3 class="mb-6 text-2xl font-bold">Confirm Seat Update</h3>
        {#if loading}
          <div class="space-y-6">
            <!-- Skeleton for the seat change details using Daisy UI skeleton -->
            <div class="py-4">
              <div class="skeleton mb-2 h-6 w-3/4"></div>
            </div>

            <!-- Skeleton for Immediate Changes -->
            <div class="rounded-lg bg-base-200 p-6">
              <div class="skeleton mb-4 h-6 w-1/2"></div>
              <div class="skeleton mb-3 h-5 w-full"></div>
              <div class="skeleton h-4 w-2/3"></div>
            </div>

            <!-- Skeleton for Future Billing -->
            <div class="rounded-lg bg-base-200 p-6">
              <div class="skeleton mb-4 h-6 w-1/2"></div>
              <div class="skeleton mb-3 h-5 w-full"></div>
              <div class="skeleton mb-6 h-4 w-4/5"></div>

              <div class="border-t pt-4">
                <div class="skeleton mx-auto mb-4 h-5 w-1/2"></div>

                <div class="mb-3 flex items-center justify-between">
                  <div class="skeleton h-4 w-1/3"></div>
                  <div class="skeleton h-5 w-20"></div>
                </div>

                <div class="mb-3 flex items-center justify-between">
                  <div class="skeleton h-4 w-1/3"></div>
                  <div class="skeleton h-5 w-20"></div>
                </div>

                <div class="skeleton mx-auto mt-4 h-5 w-2/3"></div>
              </div>
            </div>
          </div>
        {:else if importantInfo}
          <div class="space-y-6">
            <p class="text-lg">
              You are {importantInfo.isIncreasing ? "Increasing" : "Decreasing"}
              your subscription from
              <span
                class="inline-block rounded bg-base-300 px-2 py-1 font-semibold"
                >{importantInfo.currentSeats}</span
              >
              to
              <span
                class="inline-block rounded bg-base-300 px-2 py-1 font-semibold"
                >{importantInfo.newSeats}</span
              >
              seat{importantInfo.newSeats > 1 ? "s" : ""}
            </p>

            <div class="rounded-lg bg-base-200 p-6">
              <h4 class="mb-3 text-lg font-semibold">Immediate Changes:</h4>
              {#if importantInfo.isIncreasing}
                <p class="mb-2">
                  You will be upgraded to {importantInfo.newSeats} seats and be charged
                  <span
                    class="inline-block rounded bg-base-300 px-2 py-1 font-bold"
                  >
                    ${Math.ceil(importantInfo.immediateCharge)}
                    {importantInfo.currency}
                  </span>
                </p>
                <p class="text-sm text-base-content/70">
                  This fee covers the additional seat{importantInfo.newSeats -
                    importantInfo.currentSeats >
                  1
                    ? "s"
                    : ""}
                  for {importantInfo.daysUntilAnchor} days.
                </p>
              {:else}
                <p class="mb-2 text-lg">
                  Continued access to your
                  <span
                    class="inline-block rounded bg-base-300 px-2 py-1 font-bold"
                  >
                    {importantInfo.currentSeats}
                  </span>
                  seats for

                  <span
                    class="inline-block rounded bg-base-300 px-2 py-1 font-bold"
                  >
                    {importantInfo.daysUntilAnchor}
                  </span>

                  more days
                </p>
                <p class="text-sm text-base-content/70">
                  No charges will be applied for reducing seats.
                </p>
              {/if}
            </div>

            <div class="rounded-lg bg-base-200 p-6">
              <h4 class="mb-3 text-lg font-semibold">Future Billing:</h4>
              <p class="mb-2">
                On <span class="font-semibold">{importantInfo.anchorDate}</span
                >, your new {importantInfo.billingCycle} subscription cost will be
                <span
                  class="inline-block rounded bg-base-300 px-2 py-1 font-bold"
                >
                  ${Math.ceil(importantInfo.futureCost)}
                  {importantInfo.currency}
                </span>
              </p>
              <p class="mb-4 text-sm text-base-content/70">
                This will be your new {importantInfo.billingCycle} rate unless further
                changes are made.
              </p>

              <div class="border-t pt-4">
                <p class="mb-2 text-center font-semibold">
                  Monthly Cost Comparison
                </p>
                <div class="mb-2 flex items-center justify-between">
                  <span>Current monthly rate:</span>
                  <span class="font-bold">
                    <span class="inline-block rounded bg-base-300 px-2 py-1">
                      ${importantInfo.oldMonthly.toFixed(2)}
                    </span>
                  </span>
                </div>
                <div class="mb-2 flex items-center justify-between">
                  <span>New monthly rate:</span>
                  <span class="font-bold">
                    <span class="inline-block rounded bg-base-300 px-2 py-1">
                      ${importantInfo.newMonthly.toFixed(2)}
                    </span>
                  </span>
                </div>
                <p class="text-md mt-2 text-center">
                  {importantInfo.monthlyDifference > 0 ? "Increase" : "Savings"}
                  of
                  <span
                    class="inline-block rounded bg-base-300 px-2 py-1 font-bold"
                    class:text-primary={importantInfo.monthlyDifference < 0}
                  >
                    ${Math.abs(importantInfo.monthlyDifference).toFixed(2)}
                  </span>
                  {importantInfo.currency} per month
                </p>
              </div>
            </div>
          </div>
        {:else if previewError}
          <div class="rounded-lg bg-error/20 p-4">
            <p>Unable to load preview information. Please try again.</p>
            <span class="mt-2 block font-medium">Error: {previewError}</span>
          </div>
        {/if}
      {/if}
      <div class="modal-action mt-6">
        {#if !updateResult && importantInfo}
          <button
            type="button"
            class="btn btn-primary"
            disabled={loading}
            on:click={updateSeats}
          >
            Confirm Update
          </button>
        {/if}
        <button
          class="btn btn-outline"
          disabled={loading}
          on:click={() => {
            if (updateResult && updateResult.success) {
              window.location.reload()
            } else {
              showSeatsModal = false
              updateResult = null
            }
          }}
        >
          {updateResult && updateResult.success ? "Refresh Page" : "Close"}
        </button>
      </div>
    </div>
  </div>
{/if}
