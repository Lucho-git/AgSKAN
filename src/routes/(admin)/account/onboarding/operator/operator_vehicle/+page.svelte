<!-- src/routes/(admin)/account/onboarding/operator/operator_vehicle/+page.svelte -->
<script lang="ts">
  import { goto } from "$app/navigation"
  import { ArrowRight, CheckCircle, Truck, Check, Cloud } from "lucide-svelte"
  import { toast } from "svelte-sonner"

  let completionStatus = null // 'loading' | 'success' | null

  // Animation timing
  let operationStartTime = 0
  const MIN_ANIMATION_TIME = 2000 // 2 seconds minimum
  const SUCCESS_DISPLAY_TIME = 2500 // 2.5 seconds for success state

  async function handleCompleteSetup() {
    // Record start time for minimum animation duration
    operationStartTime = Date.now()
    completionStatus = "loading"

    try {
      // Simulate any final setup operations if needed
      await new Promise((resolve) => setTimeout(resolve, 1000))

      // Calculate elapsed time and wait for minimum if needed
      const elapsedTime = Date.now() - operationStartTime
      const remainingTime = Math.max(0, MIN_ANIMATION_TIME - elapsedTime)

      if (remainingTime > 0) {
        await new Promise((resolve) => setTimeout(resolve, remainingTime))
      }

      // Show success animation
      completionStatus = "success"
      toast.success("Operator setup completed successfully!")

      // Navigate after success animation
      setTimeout(() => {
        goto("/account")
      }, SUCCESS_DISPLAY_TIME)
    } catch (error) {
      console.error("Error completing setup:", error)
      completionStatus = null
      toast.error("Failed to complete setup")
    }
  }
</script>

<svelte:head>
  <title>Vehicle Setup - AgSKAN</title>
  <meta name="description" content="Set up your vehicle information" />
</svelte:head>

<!-- Header -->
<div class="mb-12 text-center">
  <h2 class="mb-2 text-4xl font-bold text-contrast-content">
    Vehicle <span class="text-base-content">Setup</span>
  </h2>
  <p class="text-contrast-content/60">
    {completionStatus === "success"
      ? "Your operator setup is complete!"
      : completionStatus === "loading"
        ? "Finalizing your setup..."
        : "Vehicle configuration coming soon"}
  </p>
</div>

<!-- Vehicle Setup Card -->
<div
  class="animate-operator-vehicle-fadeIn relative overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-xl"
>
  <!-- Card header decoration -->
  <div
    class="h-1.5 w-full bg-gradient-to-r from-base-content/80 via-base-content to-base-content/80"
  ></div>

  <div class="transition-all duration-500 ease-in-out">
    {#if completionStatus === "success"}
      <!-- SUCCESS STATE -->
      <div
        class="animate-operator-vehicle-scaleIn flex flex-col items-center gap-6 p-8 py-12"
      >
        <div
          class="animate-operator-vehicle-successPulse flex h-24 w-24 items-center justify-center rounded-full bg-green-500/20 shadow-lg shadow-green-500/10"
        >
          <div
            class="animate-operator-vehicle-checkScale flex h-20 w-20 items-center justify-center rounded-full bg-green-500"
          >
            <Check
              size={40}
              class="animate-operator-vehicle-checkDraw stroke-[3] text-white"
            />
          </div>
        </div>
        <div class="text-center">
          <h3 class="mb-2 text-2xl font-bold text-contrast-content">
            Setup Complete! 🚜
          </h3>
          <p class="mb-4 text-contrast-content/60">
            Your operator account is ready for field operations
          </p>
          <div class="space-y-2">
            <p
              class="inline-block rounded-full border border-green-500/30 bg-green-500/10 px-4 py-2 text-sm text-green-400"
            >
              Ready for dashboard
            </p>
          </div>
        </div>
        <p
          class="animate-operator-vehicle-delayedFadeIn text-sm text-contrast-content/60"
        >
          Redirecting to dashboard...
        </p>
      </div>
    {:else if completionStatus === "loading"}
      <!-- LOADING STATE -->
      <div
        class="animate-operator-vehicle-scaleIn flex flex-col items-center gap-6 p-8 py-12"
      >
        <div
          class="relative flex h-24 w-24 items-center justify-center rounded-full bg-blue-500/20"
        >
          <div
            class="animate-operator-vehicle-spin absolute inset-0 rounded-full border-2 border-blue-400/30 border-t-blue-400"
          ></div>
          <Cloud
            size={40}
            class="animate-operator-vehicle-pulse text-blue-400"
          />
        </div>
        <div class="text-center">
          <p class="mb-2 text-xl font-medium text-contrast-content">
            Completing setup...
          </p>
          <p
            class="rounded-full bg-base-200 px-4 py-2 text-sm text-contrast-content/60"
          >
            Preparing your operator dashboard
          </p>
        </div>
      </div>
    {:else}
      <!-- PLACEHOLDER STATE -->
      <div
        class="animate-operator-vehicle-formEntry flex items-center justify-center p-8 py-12"
      >
        <div class="text-center">
          <div class="mb-6 flex justify-center">
            <div
              class="rounded-xl bg-base-content/20 p-6 transition-all duration-300 hover:scale-110"
            >
              <Truck size={48} class="text-base-content" />
            </div>
          </div>
          <h3 class="mb-3 text-xl font-semibold text-contrast-content">
            Vehicle Configuration
          </h3>
          <p class="max-w-md text-contrast-content/60">
            Vehicle setup interface will be implemented here. You'll be able to
            configure your equipment and preferences.
          </p>
        </div>
      </div>
    {/if}
  </div>
</div>

<!-- Complete Setup Button -->
{#if !completionStatus}
  <div
    class="animate-operator-vehicle-formEntry mt-10 flex flex-col items-center"
  >
    <button
      on:click={handleCompleteSetup}
      class="group flex w-full transform items-center justify-center gap-2 rounded-xl bg-base-content py-4 font-semibold text-base-100 shadow-lg shadow-base-content/20 transition-all hover:-translate-y-0.5 hover:bg-base-content/90"
    >
      <CheckCircle size={18} />
      <span>Complete Setup & Go to Dashboard</span>
      <ArrowRight
        size={18}
        class="transition-transform group-hover:translate-x-1"
      />
    </button>

    <div class="mt-6 flex items-center gap-2 text-xs text-contrast-content/40">
      <CheckCircle size={14} />
      <span
        >Your account setup is complete! You can always configure vehicles
        later.</span
      >
    </div>
  </div>
{/if}

<style>
  @keyframes operator-vehicle-fadeIn {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  .animate-operator-vehicle-fadeIn {
    animation: operator-vehicle-fadeIn 0.2s ease-out;
  }

  @keyframes operator-vehicle-scaleIn {
    from {
      opacity: 0;
      transform: scale(0.9);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  .animate-operator-vehicle-scaleIn {
    animation: operator-vehicle-scaleIn 0.2s ease-out;
  }

  @keyframes operator-vehicle-delayedFadeIn {
    0%,
    60% {
      opacity: 0;
      transform: translateY(10px);
    }
    100% {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .animate-operator-vehicle-delayedFadeIn {
    animation: operator-vehicle-delayedFadeIn 1s ease-out;
  }

  @keyframes operator-vehicle-formEntry {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .animate-operator-vehicle-formEntry {
    animation: operator-vehicle-formEntry 0.3s ease-out;
  }

  @keyframes operator-vehicle-spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  .animate-operator-vehicle-spin {
    animation: operator-vehicle-spin 1s linear infinite;
  }

  @keyframes operator-vehicle-pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  .animate-operator-vehicle-pulse {
    animation: operator-vehicle-pulse 2s ease-in-out infinite;
  }

  /* Enhanced success animations */
  @keyframes operator-vehicle-successPulse {
    0%,
    100% {
      transform: scale(1);
      box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.3);
    }
    50% {
      transform: scale(1.05);
      box-shadow: 0 0 0 20px rgba(34, 197, 94, 0);
    }
  }

  .animate-operator-vehicle-successPulse {
    animation: operator-vehicle-successPulse 2s ease-in-out infinite;
  }

  @keyframes operator-vehicle-checkScale {
    0% {
      transform: scale(0);
    }
    50% {
      transform: scale(1.1);
    }
    100% {
      transform: scale(1);
    }
  }

  .animate-operator-vehicle-checkScale {
    animation: operator-vehicle-checkScale 0.6s ease-out 0.3s both;
  }

  @keyframes operator-vehicle-checkDraw {
    0% {
      stroke-dasharray: 80;
      stroke-dashoffset: 80;
    }
    100% {
      stroke-dasharray: 80;
      stroke-dashoffset: 0;
    }
  }

  .animate-operator-vehicle-checkDraw {
    animation: operator-vehicle-checkDraw 0.5s ease-out 0.5s both;
  }
</style>
