<!-- src/routes/(admin)/account/onboarding/viewer/vehicle/+page.svelte -->
<script lang="ts">
  import { goto } from "$app/navigation"
  import {
    ArrowRight,
    CheckCircle,
    MapPin,
    Check,
    ChevronRight,
    Cloud,
  } from "lucide-svelte"
  import { toast } from "svelte-sonner"
  import { supabase } from "$lib/stores/sessionStore"
  import { profileStore } from "$lib/stores/profileStore"
  import { userVehicleStore } from "$lib/stores/vehicleStore"
  import SVGComponents from "$lib/vehicles/index.js"
  import { onMount } from "svelte"

  let completionStatus = null
  let activeSubPanel = null
  let isInitialized = false

  let operationStartTime = 0
  const MIN_ANIMATION_TIME = 2000
  const SUCCESS_DISPLAY_TIME = 2500

  const defaultVehicle = {
    type: "Pointer",
    bodyColor: "Yellow",
    swath: 4,
    size: 45,
  }

  const colors = [
    "Red",
    "Blue",
    "Green",
    "Yellow",
    "Orange",
    "Purple",
    "SkyBlue",
    "LightGreen",
    "HotPink",
  ]

  onMount(() => {
    if (!$userVehicleStore || !$userVehicleStore.vehicle_marker) {
      userVehicleStore.update((store) => ({
        ...store,
        vehicle_marker: defaultVehicle,
      }))
    }
    isInitialized = true
  })

  $: currentVehicle =
    $userVehicleStore?.vehicle_marker && isInitialized
      ? $userVehicleStore.vehicle_marker
      : defaultVehicle

  $: selectedColor = isInitialized
    ? currentVehicle?.bodyColor || defaultVehicle.bodyColor
    : defaultVehicle.bodyColor

  let hasVehicleConfig = true

  function showSubPanel(panel) {
    activeSubPanel = panel
  }

  function hideSubPanel() {
    activeSubPanel = null
  }

  function selectColor(colorName) {
    selectedColor = colorName
    hideSubPanel()
  }

  function getColorValue(colorName) {
    return colorName || "Green"
  }

  function getDisplayColor(colorName) {
    if (!colorName) return "#808080"
    const colorMap = {
      Red: "#ff0000",
      Blue: "#0000ff",
      Green: "#008000",
      Yellow: "#ffff00",
      Orange: "#ffa500",
      Purple: "#800080",
      SkyBlue: "#87ceeb",
      LightGreen: "#90ee90",
      HotPink: "#ff69b4",
    }
    return colorMap[colorName] || colorName.toLowerCase()
  }

  async function handleCompleteSetup() {
    operationStartTime = Date.now()
    completionStatus = "loading"
    try {
      const vehicleData = {
        type: "Pointer",
        bodyColor: selectedColor,
        swath: 4,
        size: 45,
      }
      const { error: vehicleError } = await supabase
        .from("vehicle_state")
        .upsert(
          { vehicle_id: $profileStore.id, vehicle_marker: vehicleData },
          { onConflict: "vehicle_id" },
        )
      if (vehicleError) throw vehicleError
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ onboarded: true, updated_at: new Date().toISOString() })
        .eq("id", $profileStore.id)
      if (profileError) throw profileError
      profileStore.update((profile) => ({ ...profile, onboarded: true }))
      userVehicleStore.update((vehicle) => ({
        ...vehicle,
        vehicle_marker: vehicleData,
      }))
      const elapsedTime = Date.now() - operationStartTime
      const remainingTime = Math.max(0, MIN_ANIMATION_TIME - elapsedTime)
      if (remainingTime > 0) {
        await new Promise((resolve) => setTimeout(resolve, remainingTime))
      }
      completionStatus = "success"
      toast.success("Viewer setup completed successfully!")
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
  <title>Icon Setup - AgSKAN</title>
  <meta name="description" content="Choose your map icon color" />
</svelte:head>

{#if isInitialized}
  <div class="mb-6 text-center md:mb-10">
    <h2
      class="mb-2 text-2xl font-bold text-contrast-content md:mb-3 md:text-4xl"
    >
      Map <span class="text-base-content">Icon</span>
    </h2>
    <p class="text-sm text-contrast-content/60 md:text-base">
      {completionStatus === "success"
        ? "Your viewer setup is complete!"
        : completionStatus === "loading"
          ? "Finalizing your setup..."
          : "Choose your map icon color"}
    </p>
  </div>

  {#if !completionStatus}
    <div class="mx-auto w-full max-w-xl">
      {#if activeSubPanel === null}
        <div
          class="relative overflow-hidden rounded-xl border border-base-300 bg-base-100 shadow-xl md:rounded-2xl"
        >
          <div
            class="h-1 w-full bg-gradient-to-r from-base-content/80 via-base-content to-base-content/80 md:h-1.5"
          ></div>
          <div class="p-4 md:p-8">
            <div
              class="mb-6 rounded-lg bg-base-200 p-4 text-center md:mb-8 md:rounded-xl md:p-6"
            >
              <div
                class="mb-4 inline-block rounded-lg bg-base-content/10 p-4 md:p-6"
              >
                <svelte:component
                  this={SVGComponents.Pointer}
                  bodyColor={getColorValue(selectedColor)}
                  size="80px"
                />
              </div>
              <div>
                <h3
                  class="text-lg font-semibold text-contrast-content md:text-xl"
                >
                  Map Pin
                </h3>
                <p class="text-sm text-contrast-content/60 md:text-base">
                  {selectedColor}
                </p>
              </div>
            </div>
            <div class="mb-6 space-y-3 md:mb-8 md:space-y-4">
              <button
                class="flex w-full items-center gap-3 rounded-lg border border-base-300 bg-base-200 p-3 transition-all hover:border-base-content/40 hover:bg-base-content/10 md:rounded-xl md:p-4"
                on:click={() => showSubPanel("colors")}
              >
                <div
                  class="h-8 w-8 rounded-md border-2 border-base-300"
                  style="background-color: {getDisplayColor(selectedColor)};"
                ></div>
                <div class="flex-1 text-left">
                  <div class="text-xs font-medium text-contrast-content/60">
                    Color
                  </div>
                  <div class="text-sm font-semibold text-contrast-content">
                    {selectedColor}
                  </div>
                </div>
                <ChevronRight size={16} class="text-contrast-content/40" />
              </button>
            </div>
            <div class="flex flex-col items-center gap-3">
              <button
                class="flex w-full transform items-center justify-center gap-2 rounded-lg bg-base-content py-3 text-sm font-semibold text-base-100 shadow-lg shadow-base-content/20 transition-all hover:-translate-y-0.5 hover:bg-base-content/90 md:rounded-xl md:py-4 md:text-base"
                on:click={handleCompleteSetup}
                disabled={completionStatus === "loading"}
              >
                {#if completionStatus === "loading"}
                  <span class="loading loading-spinner loading-sm"></span>
                {:else}
                  Complete Setup
                  <ArrowRight size={16} />
                {/if}
              </button>
              <p
                class="flex items-center gap-2 text-center text-xs text-contrast-content/40"
              >
                <CheckCircle size={14} />
                Icon color can be changed anytime from your dashboard
              </p>
            </div>
          </div>
        </div>
      {:else if activeSubPanel === "colors"}
        <div
          class="relative overflow-hidden rounded-xl border border-base-300 bg-base-100 shadow-xl md:rounded-2xl"
        >
          <div
            class="h-1 w-full bg-gradient-to-r from-base-content/80 via-base-content to-base-content/80 md:h-1.5"
          ></div>
          <div class="p-4 md:p-8">
            <div
              class="mb-4 flex items-center gap-3 border-b border-base-300 pb-4"
            >
              <button
                class="rounded-lg bg-base-200 px-3 py-2 text-sm font-medium text-base-content transition-colors hover:bg-base-content/10"
                on:click={hideSubPanel}>← Back</button
              >
              <h3 class="text-lg font-semibold text-contrast-content">
                Select Color
              </h3>
            </div>
            <div class="grid grid-cols-3 gap-3 md:grid-cols-4 lg:grid-cols-5">
              {#each colors as colorName}
                <button
                  class="relative flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-all {selectedColor ===
                  colorName
                    ? 'border-base-content'
                    : 'border-base-300 hover:border-base-content/50'}"
                  style="background-color: {getDisplayColor(colorName)};"
                  on:click={() => selectColor(colorName)}
                >
                  <div
                    class="rounded-md bg-black/70 px-2 py-1 text-xs font-medium text-white"
                  >
                    {colorName}
                  </div>
                  {#if selectedColor === colorName}
                    <div
                      class="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-base-content text-base-100"
                    >
                      <Check size={12} />
                    </div>
                  {/if}
                </button>
              {/each}
            </div>
          </div>
        </div>
      {/if}
    </div>
  {/if}

  {#if completionStatus === "success"}
    <div
      class="animate-setup-scaleIn flex flex-col items-center gap-3 py-4 md:gap-4 md:py-6"
    >
      <div
        class="animate-setup-successPulse flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20 shadow-lg shadow-green-500/10 md:h-20 md:w-20"
      >
        <div
          class="animate-setup-checkScale flex h-14 w-14 items-center justify-center rounded-full bg-green-500 md:h-16 md:w-16"
        >
          <Check
            size={28}
            class="animate-setup-checkDraw stroke-[3] text-white md:h-9 md:w-9"
          />
        </div>
      </div>
      <div class="text-center">
        <h3 class="mb-2 text-xl font-bold text-contrast-content md:text-2xl">
          Setup Complete!
        </h3>
        <p class="mb-3 px-2 text-sm text-contrast-content/60 md:text-base">
          Your viewer account is ready
        </p>
        <p
          class="inline-block rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1.5 text-xs text-green-400 md:text-sm"
        >
          Ready for dashboard
        </p>
      </div>
      <p
        class="animate-setup-delayedFadeIn text-xs text-contrast-content/60 md:text-sm"
      >
        Redirecting to dashboard...
      </p>
    </div>
  {:else if completionStatus === "loading"}
    <div
      class="animate-setup-scaleIn flex flex-col items-center gap-3 py-4 md:gap-4 md:py-6"
    >
      <div
        class="relative flex h-16 w-16 items-center justify-center rounded-full bg-blue-500/20 md:h-20 md:w-20"
      >
        <div
          class="animate-setup-spin absolute inset-0 rounded-full border-2 border-blue-400/30 border-t-blue-400"
        ></div>
        <Cloud
          size={28}
          class="animate-setup-pulse text-blue-400 md:h-9 md:w-9"
        />
      </div>
      <div class="text-center">
        <p class="mb-2 text-lg font-medium text-contrast-content md:text-xl">
          Completing setup...
        </p>
        <p
          class="rounded-full bg-base-200 px-3 py-1.5 text-xs text-contrast-content/60 md:text-sm"
        >
          Finalizing your viewer dashboard
        </p>
      </div>
    </div>
  {/if}
{/if}

<style>
  @keyframes setup-scaleIn {
    from {
      opacity: 0;
      transform: scale(0.9);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
  .animate-setup-scaleIn {
    animation: setup-scaleIn 0.2s ease-out;
  }

  @keyframes setup-delayedFadeIn {
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
  .animate-setup-delayedFadeIn {
    animation: setup-delayedFadeIn 1s ease-out;
  }

  @keyframes setup-spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
  .animate-setup-spin {
    animation: setup-spin 1s linear infinite;
  }

  @keyframes setup-pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }
  .animate-setup-pulse {
    animation: setup-pulse 2s ease-in-out infinite;
  }

  @keyframes setup-successPulse {
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
  .animate-setup-successPulse {
    animation: setup-successPulse 2s ease-in-out infinite;
  }

  @keyframes setup-checkScale {
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
  .animate-setup-checkScale {
    animation: setup-checkScale 0.6s ease-out 0.3s both;
  }

  @keyframes setup-checkDraw {
    0% {
      stroke-dasharray: 80;
      stroke-dashoffset: 80;
    }
    100% {
      stroke-dasharray: 80;
      stroke-dashoffset: 0;
    }
  }
  .animate-setup-checkDraw {
    animation: setup-checkDraw 0.8s ease-out 0.5s both;
  }
</style>
