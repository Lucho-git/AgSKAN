<!-- src/routes/(admin)/account/onboarding/manager/profile/+page.svelte -->
<script lang="ts">
  import { goto } from "$app/navigation"
  import {
    User,
    Building2,
    Phone,
    ArrowRight,
    Check,
    Shield,
  } from "lucide-svelte"
  import { supabase } from "$lib/stores/sessionStore"
  import { profileStore } from "$lib/stores/profileStore"
  import { toast } from "svelte-sonner"
  import { onMount } from "svelte"

  let formError: string | null = null
  let loading = false
  let dataLoaded = false

  // Form data
  let formData = {
    fullName: "",
    companyName: "",
    mobileNumber: "",
    agreeToContact: true,
  }

  // Form validation errors
  let errors = {
    fullName: "",
    companyName: "",
    mobileNumber: "",
  }

  // Reactive validation
  $: isFormValid =
    formData.fullName.trim().length > 0 &&
    formData.companyName.trim().length > 0 &&
    formData.mobileNumber.trim().length > 0

  // Load existing profile data when component mounts
  onMount(async () => {
    if ($profileStore) {
      // Prefill form with existing data from profile store
      console.log("Profile store state on load:", $profileStore)
      formData = {
        fullName: $profileStore.full_name || "",
        companyName: $profileStore.company_name || "",
        mobileNumber: $profileStore.mobile || "",
        agreeToContact: $profileStore.contactable !== false, // Default to true if null/undefined
      }
      dataLoaded = true
    } else {
      // If profile store is empty, try to fetch from database
      try {
        const { data: profile, error } = await supabase
          .from("profiles")
          .select("full_name, company_name, mobile, contactable")
          .single()

        if (error) {
          console.error("Error fetching profile:", error)
        } else if (profile) {
          formData = {
            fullName: profile.full_name || "",
            companyName: profile.company_name || "",
            mobileNumber: profile.mobile || "",
            agreeToContact: profile.contactable !== false,
          }
        }
      } catch (error) {
        console.error("Error loading profile data:", error)
      } finally {
        dataLoaded = true
      }
    }
  })

  function handleInputChange(field: string, value: string | boolean) {
    formData = { ...formData, [field]: value }

    // Clear error when user starts typing
    if (errors[field as keyof typeof errors]) {
      errors = { ...errors, [field]: "" }
    }
  }

  function validateForm() {
    const newErrors = {
      fullName: !formData.fullName ? "Full name is required" : "",
      companyName: !formData.companyName ? "Company/Farm name is required" : "",
      mobileNumber: !formData.mobileNumber ? "Mobile number is required" : "",
    }

    errors = newErrors
    return !Object.values(newErrors).some((error) => error)
  }

  async function handleSubmit() {
    if (!validateForm()) {
      formError = "Please fill out all required fields"
      return
    }

    loading = true
    formError = null

    try {
      // Update the profile with the manager's details
      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          full_name: formData.fullName,
          company_name: formData.companyName,
          mobile: formData.mobileNumber,
          contactable: formData.agreeToContact,
          role: "manager",
          onboarded: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", $profileStore.id)

      if (updateError) throw updateError

      // Update profile store
      profileStore.update((profile) => ({
        ...profile,
        full_name: formData.fullName,
        company_name: formData.companyName,
        mobile: formData.mobileNumber,
        contactable: formData.agreeToContact,
        user_type: "manager",
      }))

      toast.success("Farm details saved successfully!")
      goto("/account/onboarding/manager/survey")
    } catch (error) {
      console.error("Error:", error)
      formError = error.message || "Failed to update profile"
      toast.error(formError)
    } finally {
      loading = false
    }
  }

  // Check if any fields have been prefilled
  $: hasExistingData =
    dataLoaded &&
    (formData.fullName || formData.companyName || formData.mobileNumber)
</script>

<svelte:head>
  <title>Farm Details - AgSKAN</title>
  <meta name="description" content="Tell us about your farm operation" />
</svelte:head>

<!-- Header - compact for single page view -->
<div class="mb-4 px-4 text-center md:mb-6">
  <h2 class="mb-2 text-2xl font-bold text-contrast-content md:text-3xl">
    Your <span class="text-base-content">Farm Details</span>
  </h2>
  <p class="mx-auto max-w-md text-sm text-contrast-content/60">
    Help us understand your operation better
  </p>
</div>

<!-- Loading state while fetching data -->
{#if !dataLoaded}
  <div class="flex justify-center py-6">
    <div class="flex items-center gap-3 text-contrast-content/60">
      <span class="loading loading-spinner loading-sm"></span>
      <span class="text-sm">Loading your information...</span>
    </div>
  </div>
{:else}
  <!-- Error Alert - compact -->
  {#if formError}
    <div class="alert alert-error mx-4 mb-3 md:mb-4">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="h-5 w-5 shrink-0 stroke-current"
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
      <span class="text-sm">{formError}</span>
    </div>
  {/if}

  <!-- Form Card - compact -->
  <div
    class="relative mx-4 mx-auto max-w-lg overflow-hidden rounded-xl border border-base-300 bg-base-100 shadow-xl"
  >
    <!-- Card header decoration -->
    <div class="h-1 w-full bg-base-content"></div>

    <form on:submit|preventDefault={handleSubmit} class="p-4 md:p-6">
      <div class="grid gap-4 md:gap-5">
        <!-- Full Name - compact -->
        <div class="space-y-2">
          <label
            class="flex items-center gap-2 text-sm font-medium text-contrast-content/80"
          >
            <div class="rounded-md bg-base-200 p-1 text-base-content">
              <User size={14} />
            </div>
            Full Name
            {#if formData.fullName && hasExistingData}
              <span
                class="rounded-full bg-success/20 px-2 py-0.5 text-xs text-success"
              >
                Saved
              </span>
            {/if}
          </label>
          <div
            class="relative transition-all duration-300 {errors.fullName
              ? 'animate-shake'
              : ''}"
          >
            <input
              type="text"
              placeholder="Enter your full name"
              bind:value={formData.fullName}
              on:input={(e) => handleInputChange("fullName", e.target.value)}
              class="w-full border bg-base-200 {errors.fullName
                ? 'border-error'
                : 'border-base-300 focus:border-base-content'} rounded-lg p-2.5 text-sm text-contrast-content transition-colors placeholder:text-contrast-content/50 focus:outline-none focus:ring-1 focus:ring-base-content md:p-3"
              required
            />
            {#if errors.fullName}
              <p class="ml-1 mt-1 flex items-center gap-1.5 text-xs text-error">
                <span class="inline-block h-1 w-1 rounded-full bg-error"></span>
                {errors.fullName}
              </p>
            {/if}
          </div>
        </div>

        <!-- Company Name - compact -->
        <div class="space-y-2">
          <label
            class="flex items-center gap-2 text-sm font-medium text-contrast-content/80"
          >
            <div class="rounded-md bg-base-200 p-1 text-base-content">
              <Building2 size={14} />
            </div>
            <span class="hidden sm:inline">Company/Farm Name</span>
            <span class="sm:hidden">Farm Name</span>
            {#if formData.companyName && hasExistingData}
              <span
                class="rounded-full bg-success/20 px-2 py-0.5 text-xs text-success"
              >
                Saved
              </span>
            {/if}
          </label>
          <div
            class="relative transition-all duration-300 {errors.companyName
              ? 'animate-shake'
              : ''}"
          >
            <input
              type="text"
              placeholder="Enter your farm name"
              bind:value={formData.companyName}
              on:input={(e) => handleInputChange("companyName", e.target.value)}
              class="w-full border bg-base-200 {errors.companyName
                ? 'border-error'
                : 'border-base-300 focus:border-base-content'} rounded-lg p-2.5 text-sm text-contrast-content transition-colors placeholder:text-contrast-content/50 focus:outline-none focus:ring-1 focus:ring-base-content md:p-3"
              required
            />
            {#if errors.companyName}
              <p class="ml-1 mt-1 flex items-center gap-1.5 text-xs text-error">
                <span class="inline-block h-1 w-1 rounded-full bg-error"></span>
                {errors.companyName}
              </p>
            {/if}
          </div>
        </div>

        <!-- Mobile Number - compact -->
        <div class="space-y-2">
          <label
            class="flex items-center gap-2 text-sm font-medium text-contrast-content/80"
          >
            <div class="rounded-md bg-base-200 p-1 text-base-content">
              <Phone size={14} />
            </div>
            Mobile Number
            {#if formData.mobileNumber && hasExistingData}
              <span
                class="rounded-full bg-success/20 px-2 py-0.5 text-xs text-success"
              >
                Saved
              </span>
            {/if}
          </label>
          <div
            class="relative transition-all duration-300 {errors.mobileNumber
              ? 'animate-shake'
              : ''}"
          >
            <input
              type="tel"
              placeholder="04XX XXX XXX"
              bind:value={formData.mobileNumber}
              on:input={(e) =>
                handleInputChange("mobileNumber", e.target.value)}
              class="w-full border bg-base-200 {errors.mobileNumber
                ? 'border-error'
                : 'border-base-300 focus:border-base-content'} rounded-lg p-2.5 text-sm text-contrast-content transition-colors placeholder:text-contrast-content/50 focus:outline-none focus:ring-1 focus:ring-base-content md:p-3"
              required
            />
            {#if errors.mobileNumber}
              <p class="ml-1 mt-1 flex items-center gap-1.5 text-xs text-error">
                <span class="inline-block h-1 w-1 rounded-full bg-error"></span>
                {errors.mobileNumber}
              </p>
            {/if}
          </div>
        </div>

        <!-- Agree to Contact - compact -->
        <div class="flex items-start gap-2">
          <div class="flex h-5 items-center">
            <label class="cursor-pointer">
              <input
                type="checkbox"
                bind:checked={formData.agreeToContact}
                on:change={(e) =>
                  handleInputChange("agreeToContact", e.target.checked)}
                class="sr-only"
              />
              <div
                class="flex h-4 w-4 items-center justify-center rounded transition-all
                {formData.agreeToContact
                  ? 'bg-base-content text-base-100'
                  : 'border border-base-300 bg-base-200 hover:border-base-content/50'}"
              >
                {#if formData.agreeToContact}
                  <Check size={12} />
                {/if}
              </div>
            </label>
          </div>
          <label
            for="agreeToContact"
            class="cursor-pointer text-xs leading-relaxed text-contrast-content"
          >
            I agree to be contacted by the AgSKAN team for setup assistance and
            important updates
          </label>
        </div>
      </div>

      <!-- Form Actions - compact -->
      <div class="mt-4 flex flex-col items-center md:mt-5">
        <button
          type="submit"
          disabled={!isFormValid || loading}
          class="flex w-full transform items-center justify-center gap-2 rounded-lg bg-base-content py-2.5 text-sm font-semibold text-base-100 shadow-lg shadow-base-content/20 transition-all hover:-translate-y-0.5 hover:bg-base-content/90 disabled:transform-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          {#if loading}
            <span class="loading loading-spinner loading-sm"></span>
          {:else}
            <span>
              {hasExistingData ? "Update & Continue" : "Continue"}
            </span>
            <ArrowRight
              size={16}
              class="transition-transform group-hover:translate-x-1"
            />
          {/if}
        </button>

        <div
          class="mt-3 flex items-center gap-2 px-2 text-center text-xs text-contrast-content/40"
        >
          <Shield size={12} class="flex-shrink-0" />
          <span>Your information is securely stored and never shared</span>
        </div>
      </div>
    </form>
  </div>
{/if}

<style>
  @keyframes shake {
    0%,
    100% {
      transform: translateX(0);
    }
    25% {
      transform: translateX(-5px);
    }
    75% {
      transform: translateX(5px);
    }
  }

  .animate-shake {
    animation: shake 0.3s ease-in-out;
  }
</style>
