<!-- src/routes/(admin)/account/onboard_manager/+page.svelte -->
<script lang="ts">
  import { goto } from "$app/navigation"
  import { User, Building2, Phone } from "lucide-svelte"
  import { supabase } from "$lib/stores/sessionStore"
  import { profileStore } from "../../../../stores/profileStore"
  import { subscriptionStore } from "../../../../stores/subscriptionStore"
  import { toast } from "svelte-sonner"

  let formError: string | null = null
  let fullName = ""
  let companyName = ""
  let mobile = ""
  let contactable = true // Set to true by default
  let loading = false

  // Computed property for form validation
  $: isFormValid =
    fullName.trim().length > 0 &&
    companyName.trim().length > 0 &&
    mobile.replace(/\D/g, "").length >= 8 &&
    mobile.replace(/\D/g, "").length <= 10

  // Phone number formatting
  function formatPhoneNumber(value: string) {
    // Remove all non-numeric characters
    const cleaned = value.replace(/\D/g, "")

    // Format as 04XX XXX XXX
    if (cleaned.length <= 4) {
      return cleaned
    } else if (cleaned.length <= 7) {
      return `${cleaned.slice(0, 4)} ${cleaned.slice(4)}`
    } else {
      return `${cleaned.slice(0, 4)} ${cleaned.slice(4, 7)} ${cleaned.slice(7, 10)}`
    }
  }

  function handlePhoneInput(event: Event) {
    const input = event.target as HTMLInputElement
    const formatted = formatPhoneNumber(input.value)
    mobile = formatted
  }

  async function setupFreeSubscription() {
    try {
      // Create a free subscription for the user
      const { error } = await supabase.from("user_subscriptions").upsert({
        user_id: $profileStore.id,
        subscription: "FREE",
        marker_limit: 100,
        trail_limit: 10000,
        current_seats: 5,
        lingering_seats: 0,
        next_billing_date: new Date(
          Date.now() + 365 * 24 * 60 * 60 * 1000,
        ).toISOString(), // 1 year from now
      })

      if (error) throw error

      // Update subscription store
      subscriptionStore.set({
        subscription: "FREE",
        marker_limit: 100,
        trail_limit: 10000,
        lingering_seats: 0,
        current_seats: 5,
        next_billing_date: new Date(
          Date.now() + 365 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      })
    } catch (error) {
      console.error("Failed to setup subscription:", error)
      throw new Error("Failed to setup subscription")
    }
  }

  async function handleSubmit() {
    if (!isFormValid) {
      formError = "Please fill out all required fields"
      return
    }

    loading = true
    formError = null

    try {
      // Set up free subscription first
      await setupFreeSubscription()

      // Update the profile with the manager's details
      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          full_name: fullName,
          company_name: companyName,
          mobile: mobile,
          contactable: contactable,
          role: "manager",
          onboarded: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", $profileStore.id)

      if (updateError) throw updateError

      // Update profile store
      profileStore.update((profile) => ({
        ...profile,
        full_name: fullName,
        company_name: companyName,
        user_type: "manager",
      }))

      toast.success("Setup completed successfully!")
      goto("/account/user_survey")
    } catch (error) {
      console.error("Error:", error)
      formError = error.message || "Failed to update profile"
      toast.error(formError)
    } finally {
      loading = false
    }
  }
</script>

<div class="min-h-screen bg-base-200 px-4 py-12">
  <div class="mx-auto max-w-xl">
    <div class="mb-16 text-center">
      <h1 class="mb-4 text-5xl font-bold text-base-content">Farm Details</h1>
      <p class="text-xl text-base-content/70">Tell us about your operation</p>
    </div>

    {#if formError}
      <div class="alert alert-error mb-6">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-6 w-6 shrink-0 stroke-current"
          fill="none"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <span>{formError}</span>
      </div>
    {/if}

    <div class="card bg-base-100 shadow-xl">
      <div class="card-body">
        <div class="form-control mb-6">
          <label class="label items-center gap-2">
            <User size={18} class="text-base-content/70" />
            <span class="label-text">Full Name</span>
          </label>
          <input
            type="text"
            bind:value={fullName}
            placeholder="Enter your full name"
            class="input input-bordered w-full"
            required
          />
        </div>

        <div class="form-control mb-6">
          <label class="label items-center gap-2">
            <Building2 size={18} class="text-base-content/70" />
            <span class="label-text">Company/Farm Name</span>
          </label>
          <input
            type="text"
            bind:value={companyName}
            placeholder="Enter your company name"
            class="input input-bordered w-full"
            required
          />
        </div>

        <div class="form-control mb-6">
          <label class="label items-center gap-2">
            <Phone size={18} class="text-base-content/70" />
            <span class="label-text">Mobile Number</span>
          </label>
          <input
            type="tel"
            bind:value={mobile}
            on:input={handlePhoneInput}
            placeholder="04XX XXX XXX"
            class="input input-bordered w-full"
            required
          />
        </div>

        <div class="form-control mb-8">
          <label class="label cursor-pointer justify-start gap-2">
            <input
              type="checkbox"
              bind:checked={contactable}
              class="checkbox checkbox-sm"
            />
            <span class="label-text">
              I agree to be contacted for setup assistance and important updates
            </span>
          </label>
        </div>

        <button
          on:click={handleSubmit}
          class="btn btn-primary w-full"
          disabled={!isFormValid || loading}
        >
          {#if loading}
            <span class="loading loading-spinner"></span>
          {/if}
          Continue to Map Setup
        </button>
      </div>
    </div>
  </div>
</div>
