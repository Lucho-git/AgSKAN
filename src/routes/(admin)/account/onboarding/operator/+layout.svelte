<!-- src/routes/(admin)/account/onboarding/operator/+layout.svelte -->
<script lang="ts">
  import { page } from "$app/stores"
  import { goto } from "$app/navigation"
  import { Check, ArrowLeft } from "lucide-svelte"

  // Define the steps for operator onboarding
  const steps = [
    {
      id: "profile",
      label: "Join Map",
      path: "/account/onboarding/operator/profile",
    },
    {
      id: "operator_vehicle",
      label: "Vehicle Setup",
      path: "/account/onboarding/operator/operator_vehicle",
    },
  ]

  // Determine current step based on URL
  $: currentStepIndex =
    steps.findIndex((step) => $page.url.pathname.includes(step.id)) + 1
  $: currentStep = currentStepIndex || 1

  const totalSteps = steps.length

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

<div class="min-h-screen bg-base-100">
  <!-- Decorative Elements -->
  <div
    class="pointer-events-none absolute -right-20 top-20 h-64 w-64 rounded-full bg-base-content/5 blur-3xl"
  ></div>
  <div
    class="pointer-events-none absolute -left-20 bottom-20 h-80 w-80 rounded-full bg-base-content/5 blur-3xl"
  ></div>

  <main class="container mx-auto flex flex-col items-center px-6 py-16">
    <div class="relative mx-auto w-full max-w-xl">
      <!-- Progress Indicator (centered) -->
      <div class="mb-4 flex items-center justify-center gap-3">
        {#each Array.from({ length: totalSteps }, (_, i) => i + 1) as step, index}
          <div class="flex items-center">
            <button
              on:click={() => navigateToStep(step)}
              disabled={step > currentStep}
              class="flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold transition-all
              {step < currentStep
                ? 'cursor-pointer bg-base-content text-base-100 hover:bg-base-content/90'
                : step === currentStep
                  ? 'bg-base-content text-base-100'
                  : 'cursor-not-allowed bg-base-300 text-base-content/40'}
              {step <= currentStep ? 'hover:scale-105' : ''}"
              title={step <= currentStep ? steps[step - 1]?.label : ""}
            >
              {#if step < currentStep}
                <Check size={14} strokeWidth={3} />
              {:else}
                <span>{step}</span>
              {/if}
            </button>

            {#if index < totalSteps - 1}
              <div
                class="mx-3 h-[2px] w-12 transition-all
                {step < currentStep ? 'bg-base-content' : 'bg-base-300'}"
              ></div>
            {/if}
          </div>
        {/each}
      </div>

      <!-- Back Button (left-aligned, below progress bar) -->
      <div class="mb-8 flex">
        <button
          on:click={goBack}
          class="flex items-center gap-2 rounded-xl border border-transparent bg-transparent px-4 py-2 text-sm font-medium text-contrast-content/60 transition-all hover:border-base-content/20 hover:bg-base-content/5 hover:text-base-content"
        >
          <ArrowLeft size={16} />
          <span class="hidden sm:inline">Back to {backButtonText}</span>
          <span class="sm:hidden">Back</span>
        </button>
      </div>

      <!-- Page Content Slot -->
      <slot />
    </div>
  </main>
</div>
