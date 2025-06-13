<!-- src/routes/(admin)/account/onboarding/manager/+layout.svelte -->
<script lang="ts">
  import { page } from "$app/stores"
  import { goto } from "$app/navigation"
  import { Check } from "lucide-svelte"

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
</script>

<div
  class="relative min-h-screen overflow-hidden bg-gradient-to-b from-base-100 to-base-200"
>
  <!-- Decorative Elements -->
  <div
    class="pointer-events-none absolute -right-20 top-20 h-64 w-64 rounded-full bg-warning/5 blur-3xl"
  ></div>
  <div
    class="pointer-events-none absolute -left-20 bottom-20 h-80 w-80 rounded-full bg-warning/5 blur-3xl"
  ></div>

  <main class="container mx-auto flex flex-col items-center px-6 py-16">
    <div class="relative mx-auto w-full max-w-xl">
      <!-- Progress Indicator -->
      <div class="mb-12 flex items-center justify-center gap-3">
        {#each Array.from({ length: totalSteps }, (_, i) => i + 1) as step, index}
          <div class="flex items-center">
            <button
              on:click={() => navigateToStep(step)}
              disabled={step > currentStep}
              class="flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold transition-all
              {step < currentStep
                ? 'cursor-pointer bg-warning text-warning-content hover:bg-warning/80'
                : step === currentStep
                  ? 'bg-warning text-warning-content'
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
                {step < currentStep ? 'bg-warning' : 'bg-base-300'}"
              ></div>
            {/if}
          </div>
        {/each}
      </div>

      <!-- Page Content Slot -->
      <slot />
    </div>
  </main>
</div>
