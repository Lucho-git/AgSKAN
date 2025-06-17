<!-- src/routes/(admin)/account/onboarding/manager/map_setup/+page.svelte -->
<script lang="ts">
  import { goto } from "$app/navigation"
  import { ArrowRight, Map, Layers, Settings, CheckCircle } from "lucide-svelte"

  let isCreatingMap = false
  let mapName = ""
  let error = ""
  let mapCode = ""
  let showSuccess = false

  // Function to generate a random UUID-like code
  function generateMapCode() {
    const hexChars = "0123456789abcdef"
    const sections = [8, 4, 4, 4, 12] // Format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

    let uuid = ""
    sections.forEach((length, index) => {
      for (let i = 0; i < length; i++) {
        uuid += hexChars.charAt(Math.floor(Math.random() * hexChars.length))
      }
      if (index < sections.length - 1) {
        uuid += "-"
      }
    })

    return uuid
  }

  function handleCreateMap() {
    isCreatingMap = true
    mapCode = generateMapCode()
  }

  function handleSubmitMap(e: Event) {
    e.preventDefault()

    if (!mapName.trim()) {
      error = "Please enter a map name"
      return
    }

    // Here you would typically save the map data to your backend
    // For now, we'll just simulate success

    // TODO: Implement actual API call
    console.log("Creating map:", { mapName, mapCode })

    // Show success message briefly
    showSuccess = true

    // Navigate to dashboard after 2 seconds
    setTimeout(() => {
      goto("/account/onboarding/manager/boundary_upload")
    }, 2000)
  }

  function handleSkip() {
    // Skip map creation and go to dashboard
    goto("/account/onboarding/manager/team_invite")
  }

  function handleInputChange(value: string) {
    mapName = value
    if (error) error = ""
  }
</script>

<svelte:head>
  <title>Map Setup - AgSKAN</title>
  <meta name="description" content="Set up your farm mapping interface" />
</svelte:head>

<!-- Header -->
<div class="mb-12 text-center">
  <h2 class="mb-3 text-4xl font-bold text-contrast-content">
    Farm <span class="text-base-content">Map Setup</span>
  </h2>
  <p class="mx-auto max-w-md text-contrast-content/60">
    Set up your interactive farm map to visualize and manage field operations
  </p>

  <!-- Skip option -->
  <button
    on:click={handleSkip}
    class="group mx-auto mt-4 flex items-center gap-2 rounded-md border border-base-content/10 bg-base-200 px-4 py-2 text-sm text-contrast-content/60 shadow-sm transition-all duration-300 hover:border-base-content/50 hover:bg-base-content/5 hover:text-base-content hover:shadow"
  >
    <span>Skip for now</span>
    <ArrowRight
      size={14}
      class="text-base-content/40 transition-all group-hover:translate-x-0.5 group-hover:text-base-content"
    />
  </button>
</div>

{#if showSuccess}
  <!-- Success Message -->
  <div
    class="animate-fadeIn relative mx-auto max-w-md overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-xl"
  >
    <!-- Card header decoration -->
    <div
      class="h-1.5 w-full bg-gradient-to-r from-base-content/80 via-base-content to-base-content/80"
    ></div>

    <div class="p-8">
      <div class="flex flex-col items-center text-center">
        <div class="mb-4 rounded-full bg-success/20 p-4 text-success">
          <CheckCircle size={32} />
        </div>
        <h3 class="mb-2 text-xl font-bold text-contrast-content">
          Map Created Successfully!
        </h3>
        <p class="text-sm text-contrast-content/60">
          Taking you to your dashboard...
        </p>
      </div>
    </div>
  </div>
{:else if !isCreatingMap}
  <!-- Create Map Card -->
  <div
    class="relative mx-auto max-w-md overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-xl"
  >
    <!-- Card header decoration -->
    <div
      class="h-1.5 w-full bg-gradient-to-r from-base-content/80 via-base-content to-base-content/80"
    ></div>

    <div class="p-8">
      <div class="mb-6 flex flex-col items-center text-center">
        <div class="mb-4 rounded-full bg-base-content/20 p-4 text-base-content">
          <Map size={32} />
        </div>
        <h3 class="mb-2 text-xl font-bold text-contrast-content">
          Create Your First Map
        </h3>
        <p class="text-sm text-contrast-content/60">
          Start by creating a map for your farm operations
        </p>
      </div>

      <button
        on:click={handleCreateMap}
        class="flex w-full transform items-center justify-center gap-2 rounded-xl bg-base-content py-3 font-semibold text-base-100 shadow-lg shadow-base-content/20 transition-all hover:-translate-y-0.5 hover:bg-base-content/90"
      >
        <Map size={18} />
        <span>Create New Map</span>
      </button>
    </div>
  </div>
{:else}
  <!-- Create Map Form -->
  <div
    class="animate-fadeIn relative mx-auto max-w-md overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-xl"
  >
    <!-- Card header decoration -->
    <div
      class="h-1.5 w-full bg-gradient-to-r from-base-content/80 via-base-content to-base-content/80"
    ></div>

    <div class="p-8">
      <div class="mb-6 flex flex-col items-center">
        <div class="mb-4 flex items-center gap-3">
          <div class="rounded-md bg-base-200 p-2 text-base-content">
            <Map size={20} />
          </div>
          <h3 class="text-xl font-bold text-contrast-content">
            Create New Map
          </h3>
        </div>

        <!-- Map Code Display -->
        <div class="mx-auto mb-2 w-full max-w-xs">
          <div
            class="rounded-full bg-info/20 px-4 py-2 text-center font-mono text-sm text-info"
          >
            {mapCode}
          </div>
        </div>
      </div>

      <form on:submit={handleSubmitMap} class="space-y-6">
        <div class="space-y-2">
          <label
            class="mb-2 flex items-center gap-2 text-sm font-medium text-contrast-content/80"
          >
            <div class="rounded-md bg-base-200 p-1.5 text-base-content">
              <Layers size={14} />
            </div>
            Map Name
          </label>
          <div
            class="relative transition-all duration-300 {error
              ? 'animate-shake'
              : ''}"
          >
            <input
              type="text"
              bind:value={mapName}
              on:input={(e) => handleInputChange(e.target.value)}
              placeholder="e.g. North Field Operations"
              class="w-full border bg-base-200 {error
                ? 'border-error'
                : 'border-base-300 focus:border-base-content'} rounded-xl p-4 text-contrast-content transition-colors placeholder:text-contrast-content/50 focus:outline-none focus:ring-1 focus:ring-base-content"
            />
            {#if error}
              <p
                class="ml-1 mt-1.5 flex items-center gap-1.5 text-xs text-error"
              >
                <span class="inline-block h-1 w-1 rounded-full bg-error"></span>
                {error}
              </p>
            {/if}
          </div>
        </div>

        <div class="pt-4">
          <button
            type="submit"
            class="flex w-full transform items-center justify-center gap-2 rounded-xl bg-base-content py-3 font-semibold text-base-100 shadow-lg shadow-base-content/20 transition-all hover:-translate-y-0.5 hover:bg-base-content/90"
          >
            Create Map
          </button>
        </div>
      </form>

      <div
        class="mt-6 flex items-center justify-center gap-2 border-t border-base-300 pt-4 text-xs text-contrast-content/60"
      >
        <Settings size={12} />
        <span>Advanced settings available after creation</span>
      </div>
    </div>
  </div>
{/if}

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
