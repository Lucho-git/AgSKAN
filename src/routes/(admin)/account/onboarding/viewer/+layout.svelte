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
      <div class="flex items-center justify-between">
        <button
          on:click={goBack}
          class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-contrast-content/60 transition-colors hover:bg-base-200 hover:text-contrast-content"
        >
          <ArrowLeft size={16} />
          <span class="hidden sm:inline">{backButtonText}</span>
        </button>

        <div class="flex items-center gap-2">
          {#each steps as step, i}
            <button
              on:click={() => navigateToStep(i + 1)}
              class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors
                {i + 1 <= currentStep
                  ? 'text-base-content'
                  : 'text-contrast-content/30'}"
              disabled={i + 1 > currentStep}
            >
              <div
                class="flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium
                  {i + 1 < currentStep
                    ? 'bg-base-content text-base-100'
                    : i + 1 === currentStep
                      ? 'bg-violet-500 text-white'
                      : 'border border-base-300 text-contrast-content/30'}"
              >
                {#if i + 1 < currentStep}
                  <Check size={12} />
                {:else}
                  {i + 1}
                {/if}
              </div>
              <span class="hidden sm:inline">{step.label}</span>
            </button>
          {/each}
        </div>

        <div class="w-[100px]"></div>
      </div>
    </div>
  </div>

  <!-- Page content -->
  <main class="container mx-auto px-4 py-6 md:px-6 md:py-10">
    <slot />
  </main>
</div>
