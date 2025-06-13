<!-- src/routes/(admin)/account/onboarding/manager/profile/+page.svelte -->
<script lang="ts">
  import { goto } from "$app/navigation"
  import {
    User,
    Building2,
    Phone,
    ArrowRight,
    ArrowLeft,
    Check,
    Shield,
  } from "lucide-svelte"
  import { supabase } from "$lib/stores/sessionStore"
  import { profileStore } from "$lib/stores/profileStore"
  import { toast } from "svelte-sonner"

  let formError: string | null = null
  let loading = false

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

  function goBack() {
    goto("/account/onboarding")
  }
</script>

<svelte:head>
  <title>Farm Details - AgSKAN</title>
  <meta name="description" content="Tell us about your farm operation" />
</svelte:head>

<!-- Header -->
<div class="mb-10 text-center">
  <h2 class="mb-3 text-4xl font-bold text-contrast-content">
    Your <span class="text-warning">Farm Details</span>
  </h2>
  <p class="mx-auto max-w-md text-contrast-content/60">
    Help us understand your operation better to customize your experience
  </p>
</div>

<!-- Error Alert -->
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

<!-- Form Card -->
<div
  class="relative overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-xl"
>
  <!-- Card header decoration -->
  <div
    class="h-1.5 w-full bg-gradient-to-r from-warning/80 via-warning to-warning/80"
  ></div>

  <form on:submit|preventDefault={handleSubmit} class="p-8 md:p-10">
    <div class="grid gap-8">
      <!-- Full Name -->
      <div class="space-y-2">
        <label
          class="mb-2 flex items-center gap-2 text-sm font-medium text-contrast-content/80"
        >
          <div class="rounded-md bg-base-200 p-1.5 text-warning">
            <User size={16} />
          </div>
          Full Name
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
            class="input input-bordered w-full text-contrast-content
              {errors.fullName ? 'input-error' : 'focus:border-warning'}"
            required
          />
          {#if errors.fullName}
            <p class="ml-1 mt-1.5 flex items-center gap-1.5 text-xs text-error">
              <span class="inline-block h-1 w-1 rounded-full bg-error"></span>
              {errors.fullName}
            </p>
          {/if}
        </div>
      </div>

      <!-- Company Name -->
      <div class="space-y-2">
        <label
          class="mb-2 flex items-center gap-2 text-sm font-medium text-contrast-content/80"
        >
          <div class="rounded-md bg-base-200 p-1.5 text-warning">
            <Building2 size={16} />
          </div>
          Company/Farm Name
        </label>
        <div
          class="relative transition-all duration-300 {errors.companyName
            ? 'animate-shake'
            : ''}"
        >
          <input
            type="text"
            placeholder="Enter your company or farm name"
            bind:value={formData.companyName}
            on:input={(e) => handleInputChange("companyName", e.target.value)}
            class="input input-bordered w-full text-contrast-content
              {errors.companyName ? 'input-error' : 'focus:border-warning'}"
            required
          />
          {#if errors.companyName}
            <p class="ml-1 mt-1.5 flex items-center gap-1.5 text-xs text-error">
              <span class="inline-block h-1 w-1 rounded-full bg-error"></span>
              {errors.companyName}
            </p>
          {/if}
        </div>
      </div>

      <!-- Mobile Number -->
      <div class="space-y-2">
        <label
          class="mb-2 flex items-center gap-2 text-sm font-medium text-contrast-content/80"
        >
          <div class="rounded-md bg-base-200 p-1.5 text-warning">
            <Phone size={16} />
          </div>
          Mobile Number
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
            on:input={(e) => handleInputChange("mobileNumber", e.target.value)}
            class="input input-bordered w-full text-contrast-content
              {errors.mobileNumber ? 'input-error' : 'focus:border-warning'}"
            required
          />
          {#if errors.mobileNumber}
            <p class="ml-1 mt-1.5 flex items-center gap-1.5 text-xs text-error">
              <span class="inline-block h-1 w-1 rounded-full bg-error"></span>
              {errors.mobileNumber}
            </p>
          {/if}
        </div>
      </div>

      <!-- Agree to Contact -->
      <div class="flex items-start gap-3">
        <div class="flex h-6 items-center pt-1">
          <label class="cursor-pointer">
            <input
              type="checkbox"
              bind:checked={formData.agreeToContact}
              on:change={(e) =>
                handleInputChange("agreeToContact", e.target.checked)}
              class="sr-only"
            />
            <div
              class="flex h-5 w-5 items-center justify-center rounded-md transition-all
              {formData.agreeToContact
                ? 'bg-warning text-warning-content'
                : 'border border-base-300 bg-base-100 hover:border-warning/50'}"
            >
              {#if formData.agreeToContact}
                <Check size={14} />
              {/if}
            </div>
          </label>
        </div>
        <label
          for="agreeToContact"
          class="cursor-pointer text-sm text-contrast-content/80"
        >
          I agree to be contacted by the AGSKAN team for setup assistance and
          important updates about my farm management system
        </label>
      </div>
    </div>

    <!-- Form Actions -->
    <div class="mt-10 flex flex-col items-center">
      <button
        type="submit"
        disabled={!isFormValid || loading}
        class="group btn btn-warning w-full py-4 text-lg
          {!isFormValid || loading
          ? 'btn-disabled'
          : 'transform transition-transform hover:-translate-y-0.5'}"
      >
        {#if loading}
          <span class="loading loading-spinner"></span>
        {:else}
          <span>Continue to Survey</span>
          <ArrowRight
            size={18}
            class="transition-transform group-hover:translate-x-1"
          />
        {/if}
      </button>

      <button
        type="button"
        on:click={goBack}
        class="btn btn-ghost mt-3 w-full text-contrast-content/60 hover:text-warning"
      >
        <ArrowLeft size={16} />
        <span>Back to Role Selection</span>
      </button>

      <div
        class="mt-6 flex items-center gap-2 text-xs text-contrast-content/40"
      >
        <Shield size={14} />
        <span
          >Your information is securely stored and never shared with third
          parties</span
        >
      </div>
    </div>
  </form>
</div>

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
