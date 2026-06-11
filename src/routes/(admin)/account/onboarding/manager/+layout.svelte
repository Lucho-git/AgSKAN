<!-- src/routes/(admin)/account/onboarding/manager/+layout.svelte -->
<script lang="ts">
  import { page } from "$app/stores"
  import { goto } from "$app/navigation"
  import { Check, ArrowLeft } from "lucide-svelte"

  // Define the steps for manager onboarding
  const steps = [
    {
      id: "profile",
      label: "Farm Details",
      path: "/account/onboarding/manager/profile",
    },
    {
      id: "survey",
      label: "Survey",
      path: "/account/onboarding/manager/survey",
    },
    {
      id: "map_setup",
      label: "Map Setup",
      path: "/account/onboarding/manager/map_setup",
    },
    {
      id: "boundary_upload",
      label: "Boundary Upload",
      path: "/account/onboarding/manager/boundary_upload",
    },
    {
      id: "team_invite",
      label: "Team Invite",
      path: "/account/onboarding/manager/team_invite",
    },
  ]

  // Determine current step based on URL
  $: currentStepIndex =
    steps.findIndex((step) => $page.url.pathname.includes(step.id)) + 1
  $: currentStep = currentStepIndex || 1

  const totalSteps = steps.length

  // Check if we're on boundary upload page (needs wider layout)
  $: isBoundaryUpload = $page.url.pathname.includes("boundary_upload")

  function navigateToStep(stepNumber: number) {
    // Only allow navigation to current step or previous steps
    if (stepNumber <= currentStep) {
      goto(steps[stepNumber - 1].path)
    }
  }

  function goBack() {
    if (currentStep > 1) {
      // Go to previous step
      goto(steps[currentStep - 2].path)
    } else {
      // Go back to role selection if on first step
      goto("/account/onboarding")
    }
  }

  // Get back button text based on current step
  $: backButtonText =
    currentStep > 1 ? steps[currentStep - 2]?.label : "Role Selection"
</script>

<div class="relative min-h-screen overflow-hidden bg-base-100">
  <!-- Decorative Elements - hidden on mobile -->
  <div
    class="pointer-events-none absolute -right-20 top-20 hidden h-64 w-64 rounded-full bg-base-content/5 blur-3xl md:block"
  ></div>
  <div
    class="pointer-events-none absolute -left-20 bottom-20 hidden h-80 w-80 rounded-full bg-base-content/5 blur-3xl md:block"
  ></div>

  <!-- Progress Indicator -->
  <div class="sticky top-0 z-30 border-b border-base-200 bg-base-100/80 backdrop-blur-sm">
    <div class="container mx-auto px-4 py-3 md:px-6 md:py-4">
      <div class="flex items-center gap-4">
        <button
          on:click={goBack}
          class="flex flex-shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm text-contrast-content/60 transition-colors hover:bg-base-200 hover:text-contrast-content"
        >
          <ArrowLeft size={16} />
          <span class="hidden sm:inline">{backButtonText}</span>
        </button>

        <div class="mx-auto w-full max-w-sm md:max-w-lg">
          <div class="flex items-center justify-between">
            {#each Array.from({ length: totalSteps }, (_, i) => i + 1) as step, index}
              <div class="flex flex-col items-center">
                <button
                  on:click={() => navigateToStep(step)}
                  disabled={step > currentStep}
                  class="flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold transition-all md:h-6 md:w-6
                  {step < currentStep
                    ? 'cursor-pointer bg-base-content text-base-100 hover:bg-base-content/90'
                    : step === currentStep
                      ? 'bg-emerald-500 text-white'
                      : 'cursor-not-allowed bg-base-300 text-contrast-content/40'}"
                  title={step <= currentStep ? steps[step - 1]?.label : ""}
                >
                  {#if step < currentStep}
                    <Check size={10} class="md:h-3 md:w-3" strokeWidth={3} />
                  {:else}
                    <span class="text-xs">{step}</span>
                  {/if}
                </button>
              </div>
              {#if index < totalSteps - 1}
                <div class="flex flex-1 items-center px-1 md:px-2">
                  <div class="h-0.5 w-full transition-all {step < currentStep ? 'bg-base-content' : 'bg-base-300'}"></div>
                </div>
              {/if}
            {/each}
          </div>
          <div class="mt-1 hidden md:flex items-start justify-between">
            {#each Array.from({ length: totalSteps }, (_, i) => i + 1) as _s, index}
              <div class="flex flex-col items-center">
                <span class="text-center text-xs text-contrast-content/40">{steps[index].label}</span>
              </div>
              {#if index < totalSteps - 1}
                <div class="flex flex-1 items-center px-1 md:px-2"></div>
              {/if}
            {/each}
          </div>
        </div>
      </div>
    </div>
  </div>

  <main class="container mx-auto px-4 py-6 md:px-6 md:py-10">
    <slot />
  </main>
</div>
