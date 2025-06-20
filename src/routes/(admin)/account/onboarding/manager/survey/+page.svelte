<!-- src/routes/(admin)/account/onboarding/manager/survey/+page.svelte -->
<script lang="ts">
  import { goto } from "$app/navigation"
  import { onMount } from "svelte"
  import {
    ArrowLeft,
    ArrowRight,
    Clock,
    Database,
    Globe,
    Grid3x3,
    Map,
    MapPin,
    MapPinned,
    MessageCircle,
    Navigation,
    Target,
    Users,
    CircleCheck,
    X,
    Check,
  } from "lucide-svelte"
  import { toast } from "svelte-sonner"
  import { profileStore } from "$lib/stores/profileStore"
  import { surveyApi } from "$lib/api/surveyApi"

  // Track which step of the survey we're on
  let currentStep = 1
  let showThankYou = false
  let isLoading = false
  let isSaving = false
  let dataLoaded = false
  let hasExistingData = false
  let wasCompleted = false

  let surveyData = {
    referralSource: "",
    otherReferralSource: "",
    role: "",
    otherRole: "",
    hectares: "",
    devicePreference: "",
    featureInterests: [] as string[],
    pathRecreateInterest: "",
    pathOptimizationInterest: "",
    enterpriseGoals: [] as string[],
    technologyInterest: 50,
  }

  let errors = {
    referralSource: "",
    otherReferralSource: "",
    role: "",
    otherRole: "",
    hectares: "",
    devicePreference: "",
    featureInterests: "",
    featureInterestRating: "",
    enterpriseGoals: "",
  }

  // Load existing survey data on component mount
  onMount(async () => {
    if ($profileStore?.id) {
      try {
        isLoading = true
        const result = await surveyApi.loadSurveyData($profileStore.id)

        if (result.hasExistingData) {
          // Prefill the form with existing data
          surveyData = { ...surveyData, ...result.answers }
          hasExistingData = true
          wasCompleted = result.wasCompleted
        }
      } catch (error) {
        console.error("Error loading survey data:", error)
        toast.error("Failed to load existing survey data")
      } finally {
        isLoading = false
        dataLoaded = true
      }
    } else {
      dataLoaded = true
    }
  })

  const REFERRAL_OPTIONS = [
    { id: "instagram", label: "Instagram" },
    { id: "facebook", label: "Facebook" },
    { id: "twitter", label: "X / Twitter" },
    { id: "linkedin", label: "LinkedIn" },
    { id: "email", label: "Email" },
    { id: "news", label: "News article" },
    { id: "friend", label: "Friend or colleague" },
    { id: "other", label: "Other" },
  ]

  const ROLE_OPTIONS = [
    { id: "owner", label: "Owner" },
    { id: "manager", label: "Manager" },
    { id: "operator", label: "Operator" },
    { id: "shareholder", label: "Shareholder" },
    { id: "agronomist", label: "Agronomist" },
    { id: "other", label: "Other" },
  ]

  const HECTARES_OPTIONS = [
    { id: "0-500", label: "0-500" },
    { id: "500-1000", label: "500-1000" },
    { id: "1000-3000", label: "1000-3000" },
    { id: "3000-5000", label: "3000-5000" },
    { id: "5000+", label: "5000+" },
    { id: "na", label: "N/A" },
  ]

  const FEATURE_OPTIONS = [
    { id: "tracking", label: "Tracking completed work", icon: Clock },
    {
      id: "live-locations",
      label: "Live locations of operators",
      icon: MapPinned,
    },
    { id: "poi", label: "Marking points of interest", icon: Target },
    {
      id: "map-overview",
      label: "Interactive map overview (Management)",
      icon: Map,
    },
    { id: "navigation", label: "Assisted Navigation", icon: Navigation },
    { id: "data-storage", label: "Data storage platform", icon: Database },
  ]

  const INTEREST_LEVELS = [
    { id: "not-interested", label: "Not interested" },
    { id: "interested", label: "Interested" },
    { id: "very-interested", label: "Very Interested" },
  ]

  const FUTURE_FEATURES = [
    {
      id: "path-recreate",
      title: "Path Recreate",
      description:
        "Recreate historical paths so new operators can travel the exact same route an experienced operator has taken.",
    },
    {
      id: "path-optimization",
      title: "Path Optimization",
      description:
        "Live turning instructions and visual overlay for operators to always be following the most efficient path.",
    },
  ]

  let modalRef: HTMLDivElement

  function handleInputChange(field: string, value: string) {
    surveyData = { ...surveyData, [field]: value }

    // Clear error when user starts typing
    if (errors[field as keyof typeof errors]) {
      errors = { ...errors, [field]: "" }
    }
  }

  function handleFeatureToggle(featureId: string) {
    // Make a copy of the current features array
    let updatedFeatures = [...surveyData.featureInterests]

    // If already selected, remove it
    if (updatedFeatures.includes(featureId)) {
      updatedFeatures = updatedFeatures.filter((id) => id !== featureId)
    }
    // If not already selected and less than 3 features selected, add it
    else if (updatedFeatures.length < 3) {
      updatedFeatures.push(featureId)
    }

    surveyData = { ...surveyData, featureInterests: updatedFeatures }

    // Clear error if any selection is made
    if (errors.featureInterests && updatedFeatures.length > 0) {
      errors = { ...errors, featureInterests: "" }
    }
  }

  function handleInterestLevelChange(featureId: string, level: string) {
    surveyData = { ...surveyData, [featureId + "Interest"]: level }

    // Clear error if any selection is made
    if (errors.featureInterestRating) {
      errors = { ...errors, featureInterestRating: "" }
    }
  }

  function handleEnterpriseGoalToggle(goalId: string) {
    // Make a copy of the current goals array
    let updatedGoals = [...surveyData.enterpriseGoals]

    // If already selected, remove it
    if (updatedGoals.includes(goalId)) {
      updatedGoals = updatedGoals.filter((id) => id !== goalId)
    }
    // If not already selected, add it
    else {
      updatedGoals.push(goalId)
    }

    surveyData = { ...surveyData, enterpriseGoals: updatedGoals }

    // Clear error if any selection is made
    if (errors.enterpriseGoals && updatedGoals.length > 0) {
      errors = { ...errors, enterpriseGoals: "" }
    }
  }

  function validateStep1() {
    console.log("🔍 validateStep1 - checking surveyData:", {
      referralSource: surveyData.referralSource,
      otherReferralSource: surveyData.otherReferralSource,
      role: surveyData.role,
      otherRole: surveyData.otherRole,
      hectares: surveyData.hectares,
    })

    const newErrors = {
      referralSource: !surveyData.referralSource
        ? "Please select how you heard about us"
        : "",
      otherReferralSource:
        surveyData.referralSource === "other" && !surveyData.otherReferralSource
          ? "Please specify how you heard about us"
          : "",
      role: !surveyData.role ? "Please select your role" : "",
      otherRole:
        surveyData.role === "other" && !surveyData.otherRole
          ? "Please specify your role"
          : "",
      hectares: !surveyData.hectares
        ? "Please select the hectares you work over"
        : "",
      devicePreference: "",
      featureInterests: "",
      featureInterestRating: "",
      enterpriseGoals: "",
    }

    console.log("🔍 validateStep1 - errors found:", newErrors)
    errors = newErrors

    const isValid = !Object.values(newErrors).some(
      (error) => error && error.length > 0,
    )
    console.log("🔍 validateStep1 - final result:", isValid)

    return isValid
  }
  function validateStep2() {
    const newErrors = {
      referralSource: "",
      otherReferralSource: "",
      role: "",
      otherRole: "",
      hectares: "",
      devicePreference: !surveyData.devicePreference
        ? "Please select your device preference"
        : "",
      featureInterests: "",
      featureInterestRating: "",
      enterpriseGoals: "",
    }

    errors = newErrors
    return !Object.values(newErrors).some((error) => error && error.length > 0)
  }

  function validateStep3() {
    const newErrors = {
      referralSource: "",
      otherReferralSource: "",
      role: "",
      otherRole: "",
      hectares: "",
      devicePreference: "",
      featureInterests:
        surveyData.featureInterests.length === 0
          ? "Please select at least one feature"
          : "",
      featureInterestRating: "",
      enterpriseGoals: "",
    }

    errors = newErrors
    return !Object.values(newErrors).some((error) => error && error.length > 0)
  }

  function validateStep4() {
    const bothFeaturesRated =
      surveyData.pathRecreateInterest && surveyData.pathOptimizationInterest

    const newErrors = {
      referralSource: "",
      otherReferralSource: "",
      role: "",
      otherRole: "",
      hectares: "",
      devicePreference: "",
      featureInterests: "",
      featureInterestRating: !bothFeaturesRated
        ? "Please rate your interest in both features"
        : "",
      enterpriseGoals: "",
    }

    errors = newErrors
    return !Object.values(newErrors).some((error) => error && error.length > 0)
  }

  function validateStep5() {
    // Step 5 no longer has validation requirements
    return true
  }

  async function handleNextStep() {
    console.log(`🚀 handleNextStep called - currentStep: ${currentStep}`)
    console.log("📊 Current surveyData:", surveyData)

    if (currentStep === 1) {
      console.log("🔍 Validating step 1...")
      const isValid = validateStep1()
      console.log("✅ Step 1 validation result:", isValid)
      console.log("❌ Step 1 errors:", errors)

      if (isValid) {
        console.log("📈 Moving to step 2")
        currentStep = 2
      } else {
        console.log("🛑 Step 1 validation failed, staying on step 1")
      }
    } else if (currentStep === 2) {
      console.log("🔍 Validating step 2...")
      const isValid = validateStep2()
      console.log("✅ Step 2 validation result:", isValid)
      console.log("❌ Step 2 errors:", errors)

      if (isValid) {
        console.log("📈 Moving to step 3")
        currentStep = 3
      } else {
        console.log("🛑 Step 2 validation failed, staying on step 2")
      }
    } else if (currentStep === 3) {
      console.log("🔍 Validating step 3...")
      const isValid = validateStep3()
      console.log("✅ Step 3 validation result:", isValid)
      console.log("❌ Step 3 errors:", errors)

      if (isValid) {
        console.log("📈 Moving to step 4")
        currentStep = 4
      } else {
        console.log("🛑 Step 3 validation failed, staying on step 3")
      }
    } else if (currentStep === 4) {
      console.log("🔍 Validating step 4...")
      const isValid = validateStep4()
      console.log("✅ Step 4 validation result:", isValid)
      console.log("❌ Step 4 errors:", errors)

      if (isValid) {
        console.log("📈 Moving to step 5")
        currentStep = 5
      } else {
        console.log("🛑 Step 4 validation failed, staying on step 4")
      }
    } else if (currentStep === 5) {
      console.log("🔍 Validating step 5...")
      const isValid = validateStep5()
      console.log("✅ Step 5 validation result:", isValid)

      if (isValid) {
        console.log("🎯 Submitting survey...")
        await handleSubmitSurvey()
      } else {
        console.log("🛑 Step 5 validation failed")
      }
    }

    console.log(`📍 After handleNextStep - currentStep is now: ${currentStep}`)
  }

  // In your Svelte component, update the handleSubmitSurvey function:
  async function handleSubmitSurvey() {
    if (!$profileStore?.id) {
      toast.error("User not found")
      return
    }

    console.log("🎯 Starting survey submission...")
    isSaving = true

    try {
      const result = await surveyApi.saveSurveyData(
        $profileStore.id,
        surveyData,
      )

      if (result.success) {
        console.log("✅ Survey saved successfully, showing thank you modal")
        toast.success("Survey responses saved successfully!")
        showThankYou = true // This should trigger the modal
      } else {
        console.error("❌ Survey save failed:", result.error)
        toast.error("Failed to save survey responses")
      }
    } catch (error) {
      console.error("💥 Error submitting survey:", error)
      toast.error("An error occurred while saving your responses")
    } finally {
      isSaving = false
      console.log(
        "🏁 Survey submission complete, isSaving:",
        isSaving,
        "showThankYou:",
        showThankYou,
      )
    }
  }

  function handlePreviousStep() {
    if (currentStep > 1) {
      currentStep = currentStep - 1
    }
  }

  function handleSkipSurvey() {
    goto("/account/onboarding/manager/map_setup")
  }

  function handleThankYouClose() {
    showThankYou = false
    // Navigate to map setup after closing the thank you modal
    goto("/account/onboarding/manager/map_setup")
  }

  function handleEscape(e: KeyboardEvent) {
    if (e.key === "Escape" && showThankYou) handleThankYouClose()
  }

  function handleClickOutside(e: MouseEvent) {
    if (modalRef && !modalRef.contains(e.target as Node) && showThankYou) {
      handleThankYouClose()
    }
  }

  $: if (showThankYou) {
    document.body.style.overflow = "hidden"
    document.addEventListener("keydown", handleEscape)
    document.addEventListener("mousedown", handleClickOutside)
  } else {
    document.body.style.overflow = ""
    document.removeEventListener("keydown", handleEscape)
    document.removeEventListener("mousedown", handleClickOutside)
  }
</script>

<svelte:head>
  <title>Quick Survey - AgSKAN</title>
  <meta
    name="description"
    content="Help us understand your farming needs better"
  />
</svelte:head>

<!-- Loading state -->
{#if !dataLoaded}
  <div class="flex justify-center py-8">
    <div class="flex items-center gap-3 text-contrast-content/60">
      <span class="loading loading-spinner loading-sm"></span>
      <span>Loading survey...</span>
    </div>
  </div>
{:else}
  <!-- Header -->
  <div class="mb-10 text-center">
    <h2 class="mb-3 text-4xl font-bold text-contrast-content">
      Quick <span class="text-base-content">Survey</span>
      <span class="text-lg font-medium text-contrast-content/60"
        >({currentStep}/5)</span
      >
    </h2>
    <p class="mx-auto max-w-md text-contrast-content/60">
      As a small startup dedicated to agricultural innovation, your feedback is
      invaluable to us. Your insights directly shape our development and help us
      build tools that truly serve your farming needs.
    </p>

    <!-- Skip survey link -->
    <button
      on:click={handleSkipSurvey}
      class="group mx-auto mt-4 flex items-center gap-2 rounded-md border border-base-content/10 bg-base-200 px-4 py-2 text-sm text-contrast-content/60 shadow-sm transition-all duration-300 hover:border-base-content/50 hover:bg-base-content/5 hover:text-base-content hover:shadow"
    >
      <span>Skip survey and continue to map setup</span>
      <ArrowRight
        size={14}
        class="text-base-content/40 transition-all group-hover:translate-x-0.5 group-hover:text-base-content"
      />
    </button>
  </div>

  <!-- Form Card -->
  <div
    class="relative overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-xl"
  >
    <!-- Card header decoration -->
    <div
      class="h-1.5 w-full bg-gradient-to-r from-base-content/80 via-base-content to-base-content/80"
    ></div>

    <form on:submit|preventDefault={handleNextStep} class="p-8 md:p-10">
      <!-- Step 1: Referral, Role and Hectares -->
      {#if currentStep === 1}
        <div class="mb-2 text-xs text-info">Showing Step 1</div>
        <div class="grid gap-8">
          <!-- How did you hear about us -->
          <div class="space-y-2">
            <label
              class="mb-2 flex items-center gap-2 text-sm font-medium text-contrast-content/80"
            >
              <div class="rounded-md bg-base-200 p-1.5 text-base-content">
                <MessageCircle size={16} />
              </div>
              How did you hear about us?
              {#if surveyData.referralSource && hasExistingData}
                <span
                  class="rounded-full bg-success/20 px-2 py-0.5 text-xs text-success"
                >
                  Saved
                </span>
              {/if}
            </label>
            <div
              class="mb-4 rounded-lg border-l-2 border-base-content/30 bg-base-200/70 p-3 text-sm text-contrast-content/60"
            >
              This information helps us understand where our community is coming
              from and supports our growth efforts
            </div>
            <div
              class="relative transition-all duration-300 {errors.referralSource
                ? 'animate-shake'
                : ''}"
            >
              <div class="grid grid-cols-2 gap-3 md:grid-cols-3">
                {#each REFERRAL_OPTIONS as option}
                  <label class="cursor-pointer">
                    <input
                      type="radio"
                      bind:group={surveyData.referralSource}
                      value={option.id}
                      on:change={() =>
                        handleInputChange("referralSource", option.id)}
                      class="sr-only"
                    />
                    <div
                      class="block w-full rounded-lg border p-3 text-center text-sm transition-all
                      {surveyData.referralSource === option.id
                        ? 'border-base-content bg-base-content/20 text-base-content'
                        : 'border-base-300 bg-base-200 text-contrast-content/80 hover:border-base-content/40'}"
                    >
                      {option.label}
                    </div>
                  </label>
                {/each}
              </div>

              {#if surveyData.referralSource === "other"}
                <div class="mt-4">
                  <input
                    type="text"
                    placeholder="Please specify..."
                    bind:value={surveyData.otherReferralSource}
                    on:input={(e) =>
                      handleInputChange("otherReferralSource", e.target.value)}
                    class="w-full border bg-base-200 {errors.otherReferralSource
                      ? 'border-error'
                      : 'border-base-300 focus:border-base-content'} rounded-xl p-4 text-contrast-content transition-colors placeholder:text-contrast-content/50 focus:outline-none focus:ring-1 focus:ring-base-content"
                  />
                  {#if errors.otherReferralSource}
                    <p
                      class="ml-1 mt-1.5 flex items-center gap-1.5 text-xs text-error"
                    >
                      <span class="inline-block h-1 w-1 rounded-full bg-error"
                      ></span>
                      {errors.otherReferralSource}
                    </p>
                  {/if}
                </div>
              {/if}

              {#if errors.referralSource}
                <p
                  class="ml-1 mt-1.5 flex items-center gap-1.5 text-xs text-error"
                >
                  <span class="inline-block h-1 w-1 rounded-full bg-error"
                  ></span>
                  {errors.referralSource}
                </p>
              {/if}
            </div>
          </div>

          <!-- Role in operation -->
          <div class="space-y-2">
            <label
              class="mb-2 flex items-center gap-2 text-sm font-medium text-contrast-content/80"
            >
              <div class="rounded-md bg-base-200 p-1.5 text-base-content">
                <Users size={16} />
              </div>
              What is your role in the operation?
              {#if surveyData.role && hasExistingData}
                <span
                  class="rounded-full bg-success/20 px-2 py-0.5 text-xs text-success"
                >
                  Saved
                </span>
              {/if}
            </label>
            <div
              class="relative transition-all duration-300 {errors.role
                ? 'animate-shake'
                : ''}"
            >
              <div class="grid grid-cols-2 gap-3 md:grid-cols-3">
                {#each ROLE_OPTIONS as option}
                  <label class="cursor-pointer">
                    <input
                      type="radio"
                      bind:group={surveyData.role}
                      value={option.id}
                      on:change={() => handleInputChange("role", option.id)}
                      class="sr-only"
                    />
                    <div
                      class="block w-full rounded-lg border p-3 text-center text-sm transition-all
                      {surveyData.role === option.id
                        ? 'border-base-content bg-base-content/20 text-base-content'
                        : 'border-base-300 bg-base-200 text-contrast-content/80 hover:border-base-content/40'}"
                    >
                      {option.label}
                    </div>
                  </label>
                {/each}
              </div>

              {#if surveyData.role === "other"}
                <div class="mt-4">
                  <input
                    type="text"
                    placeholder="Please specify your role..."
                    bind:value={surveyData.otherRole}
                    on:input={(e) =>
                      handleInputChange("otherRole", e.target.value)}
                    class="w-full border bg-base-200 {errors.otherRole
                      ? 'border-error'
                      : 'border-base-300 focus:border-base-content'} rounded-xl p-4 text-contrast-content transition-colors placeholder:text-contrast-content/50 focus:outline-none focus:ring-1 focus:ring-base-content"
                  />
                  {#if errors.otherRole}
                    <p
                      class="ml-1 mt-1.5 flex items-center gap-1.5 text-xs text-error"
                    >
                      <span class="inline-block h-1 w-1 rounded-full bg-error"
                      ></span>
                      {errors.otherRole}
                    </p>
                  {/if}
                </div>
              {/if}

              {#if errors.role}
                <p
                  class="ml-1 mt-1.5 flex items-center gap-1.5 text-xs text-error"
                >
                  <span class="inline-block h-1 w-1 rounded-full bg-error"
                  ></span>
                  {errors.role}
                </p>
              {/if}
            </div>
          </div>

          <!-- Hectares -->
          <div class="space-y-2">
            <label
              class="mb-2 flex items-center gap-2 text-sm font-medium text-contrast-content/80"
            >
              <div class="rounded-md bg-base-200 p-1.5 text-base-content">
                <Grid3x3 size={16} />
              </div>
              How many hectares do you work over?
              {#if surveyData.hectares && hasExistingData}
                <span
                  class="rounded-full bg-success/20 px-2 py-0.5 text-xs text-success"
                >
                  Saved
                </span>
              {/if}
            </label>
            <div
              class="relative transition-all duration-300 {errors.hectares
                ? 'animate-shake'
                : ''}"
            >
              <div class="grid grid-cols-2 gap-3 md:grid-cols-3">
                {#each HECTARES_OPTIONS as option}
                  <label class="cursor-pointer">
                    <input
                      type="radio"
                      bind:group={surveyData.hectares}
                      value={option.id}
                      on:change={() => handleInputChange("hectares", option.id)}
                      class="sr-only"
                    />
                    <div
                      class="block w-full rounded-lg border p-3 text-center text-sm transition-all
                      {surveyData.hectares === option.id
                        ? 'border-base-content bg-base-content/20 text-base-content'
                        : 'border-base-300 bg-base-200 text-contrast-content/80 hover:border-base-content/40'}"
                    >
                      {option.label}
                    </div>
                  </label>
                {/each}
              </div>

              {#if errors.hectares}
                <p
                  class="ml-1 mt-1.5 flex items-center gap-1.5 text-xs text-error"
                >
                  <span class="inline-block h-1 w-1 rounded-full bg-error"
                  ></span>
                  {errors.hectares}
                </p>
              {/if}
            </div>
          </div>
        </div>
      {/if}

      <!-- Step 2: Device Preferences -->
      {#if currentStep === 2}
        <div class="mb-2 text-xs text-info">Showing Step 2</div>
        <div class="grid gap-8">
          <div class="space-y-2">
            <label
              class="mb-4 flex items-center gap-2 text-sm font-medium text-contrast-content/80"
            >
              <div class="rounded-md bg-base-200 p-1.5 text-base-content">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  class="lucide lucide-device"
                  ><rect
                    width="18"
                    height="12"
                    x="3"
                    y="8"
                    rx="2"
                    ry="2"
                  /><path d="M5 8V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2" /><line
                    x1="12"
                    x2="12"
                    y1="20"
                    y2="22"
                  /></svg
                >
              </div>
              Which device(s) would you prefer to run our software on?
              {#if surveyData.devicePreference && hasExistingData}
                <span
                  class="rounded-full bg-success/20 px-2 py-0.5 text-xs text-success"
                >
                  Saved
                </span>
              {/if}
            </label>

            <div
              class="relative transition-all duration-300 {errors.devicePreference
                ? 'animate-shake'
                : ''}"
            >
              <div class="grid grid-cols-1 gap-3">
                {#each ["ios-phone", "ios-tablet", "android-phone", "android-tablet", "desktop", "any"] as device}
                  {@const labels = {
                    "ios-phone": "iOS Phone",
                    "ios-tablet": "iOS Tablet",
                    "android-phone": "Android Phone",
                    "android-tablet": "Android Tablet",
                    desktop: "Desktop (Stationary)",
                    any: "Open to whatever works best",
                  }}
                  <label class="cursor-pointer">
                    <input
                      type="radio"
                      bind:group={surveyData.devicePreference}
                      value={device}
                      on:change={() =>
                        handleInputChange("devicePreference", device)}
                      class="sr-only"
                    />
                    <div
                      class="block w-full rounded-lg border p-3 text-center text-sm transition-all
                      {surveyData.devicePreference === device
                        ? 'border-base-content bg-base-content/20 text-base-content'
                        : 'border-base-300 bg-base-200 text-contrast-content/80 hover:border-base-content/40'}"
                    >
                      {labels[device]}
                    </div>
                  </label>
                {/each}
              </div>

              {#if errors.devicePreference}
                <p
                  class="ml-1 mt-1.5 flex items-center gap-1.5 text-xs text-error"
                >
                  <span class="inline-block h-1 w-1 rounded-full bg-error"
                  ></span>
                  {errors.devicePreference}
                </p>
              {/if}
            </div>
          </div>
        </div>
      {/if}

      <!-- Step 3: Feature Interest Rating -->
      {#if currentStep === 3}
        <div class="mb-2 text-xs text-info">Showing Step 3</div>
        <div class="grid gap-8">
          <div class="space-y-2">
            <label
              class="mb-4 flex items-center gap-2 text-sm font-medium text-contrast-content/80"
            >
              <div class="rounded-md bg-base-200 p-1.5 text-base-content">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  ><path d="M12 2L2 7l10 5 10-5-10-5z" /><path
                    d="M2 17l10 5 10-5"
                  /><path d="M2 12l10 5 10-5" /></svg
                >
              </div>
              Which of our features are you most interested in?
              {#if surveyData.featureInterests.length > 0 && hasExistingData}
                <span
                  class="rounded-full bg-success/20 px-2 py-0.5 text-xs text-success"
                >
                  Saved
                </span>
              {/if}
            </label>

            <div class="mb-5 text-center text-sm text-contrast-content/60">
              Up to 3.
            </div>

            <div
              class="relative transition-all duration-300 {errors.featureInterests
                ? 'animate-shake'
                : ''}"
            >
              <div class="grid grid-cols-1 gap-3">
                {#each FEATURE_OPTIONS as option}
                  {@const isSelected = surveyData.featureInterests.includes(
                    option.id,
                  )}
                  <div
                    on:click={() => handleFeatureToggle(option.id)}
                    on:keydown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        handleFeatureToggle(option.id)
                      }
                    }}
                    role="button"
                    tabindex="0"
                    class="flex cursor-pointer items-center justify-center rounded-lg p-4 text-sm transition-all
                      {isSelected
                      ? 'border border-base-content bg-base-content/20 text-base-content'
                      : 'border border-base-300 bg-base-200 text-contrast-content/80 hover:border-base-content/40'}
                      {surveyData.featureInterests.length >= 3 && !isSelected
                      ? 'cursor-not-allowed opacity-50'
                      : ''}"
                  >
                    <span class="text-center">{option.label}</span>
                  </div>
                {/each}
              </div>

              {#if errors.featureInterests}
                <p
                  class="ml-1 mt-1.5 flex items-center gap-1.5 text-xs text-error"
                >
                  <span class="inline-block h-1 w-1 rounded-full bg-error"
                  ></span>
                  {errors.featureInterests}
                </p>
              {/if}
            </div>
          </div>
        </div>
      {/if}

      <!-- Step 4: Future Features -->
      {#if currentStep === 4}
        <div class="mb-2 text-xs text-info">Showing Step 4</div>
        <div class="grid gap-8">
          <div class="space-y-2">
            <label
              class="mb-4 flex items-center gap-2 text-sm font-medium text-contrast-content/80"
            >
              <div class="rounded-md bg-base-200 p-1.5 text-base-content">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  ><polygon
                    points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
                  ></polygon></svg
                >
              </div>
              Rate your interest in future features.
              {#if surveyData.pathRecreateInterest && surveyData.pathOptimizationInterest && hasExistingData}
                <span
                  class="rounded-full bg-success/20 px-2 py-0.5 text-xs text-success"
                >
                  Saved
                </span>
              {/if}
            </label>

            <div
              class="relative transition-all duration-300 {errors.featureInterestRating
                ? 'animate-shake'
                : ''}"
            >
              <div class="space-y-10">
                <!-- First Feature -->
                <div class="rounded-xl border border-base-300 bg-base-200 p-6">
                  <h3
                    class="mb-2 text-center text-xl font-bold text-base-content"
                  >
                    {FUTURE_FEATURES[0].title}
                  </h3>
                  <p class="mb-6 text-center text-contrast-content/80">
                    {FUTURE_FEATURES[0].description}
                  </p>

                  <div class="flex flex-wrap justify-center gap-3">
                    {#each INTEREST_LEVELS as level}
                      <div class="relative min-w-[100px] max-w-[150px] flex-1">
                        <label class="cursor-pointer">
                          <input
                            type="radio"
                            bind:group={surveyData.pathRecreateInterest}
                            value={level.id}
                            on:change={() =>
                              handleInterestLevelChange(
                                "pathRecreate",
                                level.id,
                              )}
                            class="sr-only"
                          />
                          <div
                            class="block w-full rounded-lg border p-3 text-center text-sm transition-all
                            {surveyData.pathRecreateInterest === level.id
                              ? 'border-base-content bg-base-content/20 text-base-content'
                              : 'border-base-300 bg-base-100 text-contrast-content/80 hover:border-base-content/40'}"
                          >
                            {level.label}
                          </div>
                        </label>
                      </div>
                    {/each}
                  </div>
                </div>

                <!-- Second Feature -->
                <div class="rounded-xl border border-base-300 bg-base-200 p-6">
                  <h3
                    class="mb-2 text-center text-xl font-bold text-base-content"
                  >
                    {FUTURE_FEATURES[1].title}
                  </h3>
                  <p class="mb-6 text-center text-contrast-content/80">
                    {FUTURE_FEATURES[1].description}
                  </p>

                  <div class="flex flex-wrap justify-center gap-3">
                    {#each INTEREST_LEVELS as level}
                      <div class="relative min-w-[100px] max-w-[150px] flex-1">
                        <label class="cursor-pointer">
                          <input
                            type="radio"
                            bind:group={surveyData.pathOptimizationInterest}
                            value={level.id}
                            on:change={() =>
                              handleInterestLevelChange(
                                "pathOptimization",
                                level.id,
                              )}
                            class="sr-only"
                          />
                          <div
                            class="block w-full rounded-lg border p-3 text-center text-sm transition-all
                            {surveyData.pathOptimizationInterest === level.id
                              ? 'border-base-content bg-base-content/20 text-base-content'
                              : 'border-base-300 bg-base-100 text-contrast-content/80 hover:border-base-content/40'}"
                          >
                            {level.label}
                          </div>
                        </label>
                      </div>
                    {/each}
                  </div>
                </div>
              </div>

              {#if errors.featureInterestRating}
                <p
                  class="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-error"
                >
                  <span class="inline-block h-1 w-1 rounded-full bg-error"
                  ></span>
                  {errors.featureInterestRating}
                </p>
              {/if}
            </div>
          </div>
        </div>
      {/if}

      <!-- Step 5: Enterprise Goals -->
      {#if currentStep === 5}
        <div class="mb-2 text-xs text-info">Showing Step 5</div>
        <div class="grid gap-8">
          <div class="space-y-6">
            <label
              class="mb-2 flex items-center gap-2 text-sm font-medium text-contrast-content/80"
            >
              <div class="rounded-md bg-base-200 p-1.5 text-base-content">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  ><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg
                >
              </div>
              What are the primary goals of your enterprise in the next 5 years?
              {#if surveyData.enterpriseGoals.length > 0 && hasExistingData}
                <span
                  class="rounded-full bg-success/20 px-2 py-0.5 text-xs text-success"
                >
                  Saved
                </span>
              {/if}
            </label>

            <div class="grid grid-cols-1 gap-3">
              <!-- Enterprise Goals Options -->
              {#each [{ id: "expand-land", label: "Expand land holdings" }, { id: "increase-production", label: "Increase production on land already owned" }, { id: "reduce-labor", label: "Reduce labour requirements for my operation" }, { id: "more-tech", label: "Introduce more technology" }] as goal}
                <div
                  on:click={() => handleEnterpriseGoalToggle(goal.id)}
                  on:keydown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      handleEnterpriseGoalToggle(goal.id)
                    }
                  }}
                  role="button"
                  tabindex="0"
                  class="flex cursor-pointer items-center justify-center rounded-lg border p-4 text-sm transition-all
                    {surveyData.enterpriseGoals.includes(goal.id)
                    ? 'border-base-content bg-base-content/20 text-base-content'
                    : 'border-base-300 bg-base-200 text-contrast-content/80 hover:border-base-content/40'}"
                >
                  <span class="text-center">{goal.label}</span>
                </div>
              {/each}
            </div>

            <div class="mt-8">
              <label
                class="mb-4 flex items-center gap-2 text-sm font-medium text-contrast-content/80"
              >
                <div class="rounded-md bg-base-200 p-1.5 text-base-content">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    ><circle cx="12" cy="12" r="10" /><path
                      d="M12 16v-4"
                    /><path d="M12 8h.01" /></svg
                  >
                </div>
                How interested are you in adopting new technologies to increase productivity?
              </label>

              <div class="px-2">
                <input
                  type="range"
                  min="0"
                  max="100"
                  bind:value={surveyData.technologyInterest}
                  class="range-base-content range w-full"
                />

                <div
                  class="mt-2 flex justify-between text-sm text-contrast-content/60"
                >
                  <span>Not Interested</span>
                  <span>Very Interested</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      {/if}

      <!-- Navigation Buttons -->
      <div class="mt-10 flex items-center justify-between gap-4">
        {#if currentStep > 1}
          <button
            type="button"
            on:click={handlePreviousStep}
            class="flex items-center gap-2 rounded-xl border border-transparent bg-transparent px-4 py-2 text-sm font-medium text-contrast-content/60 transition-all hover:border-base-content/20 hover:bg-base-content/5 hover:text-base-content"
          >
            <ArrowLeft size={16} />
            <span>Back</span>
          </button>
        {:else}
          <div></div>
        {/if}

        <button
          type="submit"
          disabled={isSaving}
          class="flex transform items-center justify-center gap-2 rounded-xl bg-base-content px-8 py-3 font-semibold text-base-100 shadow-lg shadow-base-content/20 transition-all hover:-translate-y-0.5 hover:bg-base-content/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {#if isSaving}
            <span class="loading loading-spinner loading-sm"></span>
          {/if}
          <span
            >{currentStep < 5
              ? "Next"
              : hasExistingData
                ? "Update Responses"
                : "Finish"}</span
          >
          <ArrowRight
            size={18}
            class="transition-transform group-hover:translate-x-1"
          />
        </button>
      </div>
    </form>
  </div>
{/if}

<!-- Thank You Modal -->
{#if showThankYou}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
  >
    <div
      bind:this={modalRef}
      class="animate-fadeIn w-full max-w-md overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-2xl"
    >
      <div
        class="h-1.5 w-full bg-gradient-to-r from-base-content/80 via-base-content to-base-content/80"
      ></div>

      <div class="relative p-6">
        <button
          on:click={handleThankYouClose}
          class="absolute right-3 top-3 rounded-full p-2 text-base-content/40 transition-colors hover:bg-base-200 hover:text-base-content"
          aria-label="Close"
        >
          <X size={20} />
        </button>

        <div class="flex flex-col items-center py-6 text-center">
          <div
            class="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-base-content/20"
          >
            <CircleCheck size={40} class="text-base-content" />
          </div>

          <h3 class="mb-3 text-2xl font-bold text-contrast-content">
            {hasExistingData ? "Responses Updated!" : "Thank You!"}
          </h3>
          <p class="mb-6 max-w-xs text-contrast-content/60">
            {hasExistingData
              ? "Your survey responses have been updated successfully."
              : "Your survey responses have been submitted successfully. We appreciate your valuable feedback which helps us improve AgSKAN."}
          </p>

          <div class="w-full border-t border-base-300/40 pt-4">
            <button
              on:click={handleThankYouClose}
              class="flex w-full transform items-center justify-center gap-2 rounded-xl bg-base-content py-3 font-semibold text-base-100 shadow-lg shadow-base-content/20 transition-all hover:-translate-y-0.5 hover:bg-base-content/90"
            >
              Continue to Map Setup
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Your existing styles -->
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

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  .animate-fadeIn {
    animation: fadeIn 0.2s ease-out;
  }
</style>
