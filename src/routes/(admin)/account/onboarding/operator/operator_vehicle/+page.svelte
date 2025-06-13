<!-- src/routes/(admin)/account/onboarding/operator/operator_vehicle/+page.svelte -->
<script lang="ts">
  import { goto } from "$app/navigation"
  import { ArrowLeft, ArrowRight, CheckCircle, Truck } from "lucide-svelte"
</script>

<svelte:head>
  <title>Vehicle Setup - AgSKAN</title>
  <meta name="description" content="Set up your vehicle information" />
</svelte:head>

<!-- Header -->
<div class="mb-12 text-center">
  <h2 class="mb-2 text-4xl font-bold text-warning">Vehicle Setup</h2>
  <p class="text-contrast-content/60">Vehicle configuration coming soon</p>
</div>

<!-- Back Button -->
<button
  on:click={() => goto("/account/onboarding/operator/profile")}
  class="mb-8 flex items-center gap-2 text-contrast-content/60 transition-colors hover:text-warning"
>
  <ArrowLeft size={16} />
  <span>Back to Profile</span>
</button>

<!-- Vehicle Setup Placeholder -->
<div
  class="flex h-96 items-center justify-center rounded-xl border border-base-300 bg-base-100 p-8 shadow-lg"
>
  <div class="text-center">
    <div class="mb-4 flex justify-center">
      <div class="rounded-full bg-warning/20 p-4">
        <Truck size={32} class="text-warning" />
      </div>
    </div>
    <p class="text-contrast-content/60">
      Vehicle setup interface will be implemented here
    </p>
  </div>
</div>

<!-- Complete Setup Button -->
<div class="mt-10 flex flex-col items-center">
  <button
    on:click={() => goto("/account")}
    class="group btn btn-warning w-full transform py-4 text-lg transition-transform hover:-translate-y-0.5"
  >
    <CheckCircle size={18} />
    <span>Complete Setup & Go to Dashboard</span>
    <ArrowRight
      size={18}
      class="transition-transform group-hover:translate-x-1"
    />
  </button>

  <div class="mt-4 flex items-center gap-2 text-xs text-contrast-content/40">
    <CheckCircle size={14} />
    <span
      >Your account setup is complete! You can always configure vehicles later.</span
    >
  </div>
</div>

<!-- Support Chat Button (fixed position) -->
<div
  class="fixed bottom-6 right-6 cursor-pointer rounded-full bg-warning p-3 text-warning-content shadow-lg transition-all hover:scale-105 hover:bg-warning/90"
>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
    ></path>
  </svg>
</div>
