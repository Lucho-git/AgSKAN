<!-- src/routes/(admin)/account/onboarding/viewer/+layout.svelte -->
<script lang="ts">
  import { page } from "$app/stores"
  import { goto } from "$app/navigation"
  import { Check, ArrowLeft } from "lucide-svelte"

  // Define the steps for viewer onboarding
  const steps = [
    {
      id: "profile",
      label: "Join Map",
      path: "/account/onboarding/viewer/profile",
    },
    {
      id: "vehicle",
      label: "Map Icon",
      path: "/account/onboarding/viewer/vehicle",
    },
  ]

  $: currentStepIndex =
    steps.findIndex((step) => $page.url.pathname.includes(step.id)) + 1
  $: currentStep = currentStepIndex || 1

  const totalSteps = steps.length

  function navigateToStep(stepNumber: number) {
    if (stepNumber <= currentStep) {
      goto(steps[stepNumber - 1].path)
    }
  }

  function goBack() {
    if (currentStep > 1) {
      goto(steps[currentStep - 2].path)
    } else {
      goto("/account/onboarding")
    }
  }

  $: backButtonText = currentStep > 1 && steps[currentStep - 2]
    ? steps[currentStep - 2]?.label
    : "Role Selection"
</script>

<div class="relative min-h-screen overflow-hidden bg-base-100">
  <!-- Header with step indicators -->
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

        <div class="mx-auto w-full max-w-xs md:max-w-sm">
          <div class="flex items-center justify-between">
            {#each Array.from({ length: totalSteps }, (_, i) => i + 1) as step, index}
              <div class="flex flex-col items-center">
                <button
                  on:click={() => navigateToStep(step)}
                  disabled={step > currentStep}
                  class="flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold transition-all md:h-7 md:w-7
                  {step < currentStep
                    ? 'cursor-pointer bg-base-content text-base-100 hover:bg-base-content/90'
                    : step === currentStep
                      ? 'bg-violet-500 text-white'
                      : 'cursor-not-allowed bg-base-300 text-contrast-content/40'}"
                  title={step <= currentStep ? steps[step - 1]?.label : ""}
                >
                  {#if step < currentStep}
                    <Check size={12} strokeWidth={3} />
                  {:else}
                    <span>{step}</span>
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

  <!-- Page content -->
  <main class="container mx-auto px-4 py-6 md:px-6 md:py-10">
    <slot />
  </main>
</div>
