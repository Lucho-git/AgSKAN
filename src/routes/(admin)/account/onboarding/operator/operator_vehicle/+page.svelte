<!-- src/routes/(admin)/account/onboarding/operator/operator_vehicle/+page.svelte -->
<script lang="ts">
  import { goto } from "$app/navigation"
  import { ArrowRight, CheckCircle, Truck } from "lucide-svelte"
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
  <p class="text-contrast-content/60">Vehicle configuration coming soon</p>
</div>

<!-- Vehicle Setup Placeholder -->
<div
  class="relative overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-xl"
>
  <!-- Card header decoration -->
  <div
    class="h-1.5 w-full bg-gradient-to-r from-base-content/80 via-base-content to-base-content/80"
  ></div>

  <div class="flex h-96 items-center justify-center p-8">
    <div class="text-center">
      <div class="mb-6 flex justify-center">
        <div class="rounded-xl bg-base-content/20 p-6">
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
</div>

<!-- Complete Setup Button -->
<div class="mt-10 flex flex-col items-center">
  <button
    on:click={() => goto("/account")}
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
      >Your account setup is complete! You can always configure vehicles later.</span
    >
  </div>
</div>
