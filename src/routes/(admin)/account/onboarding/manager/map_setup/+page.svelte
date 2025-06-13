<!-- src/routes/(admin)/account/onboarding/manager/map_setup/+page.svelte -->
<script lang="ts">
  import { goto } from "$app/navigation"
  import { ArrowLeft, ArrowRight, CheckCircle } from "lucide-svelte"
</script>

<svelte:head>
  <title>Map Setup - AgSKAN</title>
  <meta name="description" content="Set up your farm mapping interface" />
</svelte:head>

<!-- Header -->
<div class="mb-12 text-center">
  <h2 class="mb-2 text-4xl font-bold text-warning">Map Setup</h2>
  <p class="text-contrast-content/60">Map setup page coming soon</p>
</div>

<!-- Back Button -->
<button
  on:click={() => goto("/account/onboarding/manager/survey")}
  class="mb-8 flex items-center gap-2 text-contrast-content/60 transition-colors hover:text-warning"
>
  <ArrowLeft size={16} />
  <span>Back to Survey</span>
</button>

<!-- Map Interface Placeholder -->
<div
  class="flex h-96 items-center justify-center rounded-xl border border-base-300 bg-base-100 p-8 shadow-lg"
>
  <p class="text-contrast-content/60">Map interface will be implemented here</p>
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
      >Your account setup is complete! You can always return to configure maps
      later.</span
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
