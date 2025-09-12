<!-- src/routes/(admin)/account/onboarding/operator/operator_vehicle/+page.svelte -->
<script lang="ts">
  import { goto } from "$app/navigation"
  import {
    ArrowRight,
    CheckCircle,
    Truck,
    Check,
    Cloud,
    ChevronRight,
    Minus,
    Plus,
    ChevronsLeftRight,
  } from "lucide-svelte"
  import { toast } from "svelte-sonner"
  import { supabase } from "$lib/stores/sessionStore"
  import { profileStore } from "$lib/stores/profileStore"
  import { userVehicleStore } from "../../../../../../stores/vehicleStore"
  import SVGComponents from "$lib/vehicles/index.js"
  import { onMount } from "svelte"

  let completionStatus = null // 'loading' | 'success' | null
  let activeSubPanel = null // null, 'vehicles', 'colors', 'swath'
  let setupMode = "selection" // 'selection' | 'completion'
  let isInitialized = false

  // Animation timing
  let operationStartTime = 0
  const MIN_ANIMATION_TIME = 2000 // 2 seconds minimum
  const SUCCESS_DISPLAY_TIME = 2500 // 2.5 seconds for success state

  // Default vehicle configuration
  const defaultVehicle = {
    type: "Tractor",
    bodyColor: "Yellow",
    swath: 4,
    size: 45,
  }

  // Complete vehicle data - all in one list
  const vehicles = [
    { type: "Tractor", bodyColor: "green", size: 45, swath: 4 },
    { type: "FourWheelDriveTractor", bodyColor: "green", size: 35, swath: 4 },
    { type: "CombineHarvester", bodyColor: "yellow", size: 60, swath: 12 },
    { type: "TowBehindSeeder", bodyColor: "red", size: 80, swath: 12 },
    { type: "TowBetweenSeeder", bodyColor: "red", size: 80, swath: 12 },
    { type: "TowBehindSeederTracks", bodyColor: "red", size: 80, swath: 12 },
    { type: "TowBehindBoomspray", bodyColor: "red", size: 80, swath: 36 },
    { type: "SelfPropelledBoomspray", bodyColor: "red", size: 45, swath: 36 },
    { type: "ThreePointBoomspray", bodyColor: "red", size: 45, swath: 36 },
    { type: "HeaderDuals", bodyColor: "red", size: 50, swath: 12 },
    { type: "HeaderSingles", bodyColor: "red", size: 50, swath: 12 },
    { type: "HeaderTracks", bodyColor: "red", size: 50, swath: 12 },
    { type: "SelfPropelledSwather", bodyColor: "red", size: 50, swath: 12 },
    { type: "Baler", bodyColor: "red", size: 80, swath: 12 },
    { type: "FarmUte", bodyColor: "red", size: 40, swath: 4 },
    { type: "Truck", bodyColor: "red", size: 60, swath: 4 },
    { type: "CabOverTruck", bodyColor: "red", size: 60, swath: 4 },
    { type: "WorkCar", bodyColor: "red", size: 45, swath: 4 },
    { type: "FrontWheelChaserBin", bodyColor: "red", size: 70, swath: 12 },
    { type: "FourWheelDriveChaserBin", bodyColor: "red", size: 70, swath: 12 },
    { type: "Spreader", bodyColor: "red", size: 80, swath: 12 },
    { type: "Mower", bodyColor: "red", size: 60, swath: 12 },
    { type: "SelfPropelledMower", bodyColor: "red", size: 60, swath: 12 },
    { type: "Telehandler", bodyColor: "red", size: 70, swath: 12 },
    { type: "Loader", bodyColor: "red", size: 50, swath: 4 },
    { type: "WheelLoader", bodyColor: "yellow", size: 60, swath: 4 },
    { type: "Excavator", bodyColor: "orange", size: 70, swath: 4 },
    { type: "Airplane", bodyColor: "blue", size: 85, swath: 50 },
  ]

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

  // Initialize vehicle store if needed
  onMount(() => {
    if (!$userVehicleStore || !$userVehicleStore.vehicle_marker) {
      userVehicleStore.update((store) => ({
        ...store,
        vehicle_marker: defaultVehicle,
      }))
    }
    isInitialized = true
  })

  // Get current vehicle settings from store or defaults - with null safety
  $: currentVehicle =
    $userVehicleStore?.vehicle_marker && isInitialized
      ? $userVehicleStore.vehicle_marker
      : defaultVehicle

  // Initialize selections - only after component is initialized
  $: selectedVehicle = isInitialized
    ? currentVehicle?.type || defaultVehicle.type
    : defaultVehicle.type
  $: selectedColor = isInitialized
    ? currentVehicle?.bodyColor || defaultVehicle.bodyColor
    : defaultVehicle.bodyColor
  $: selectedSwath = isInitialized
    ? currentVehicle?.swath || defaultVehicle.swath
    : defaultVehicle.swath
  $: tempSwath = isInitialized
    ? currentVehicle?.swath || defaultVehicle.swath
    : defaultVehicle.swath

  // Check if we have a complete vehicle configuration
  $: hasVehicleConfig = selectedVehicle && selectedColor && selectedSwath > 0

  function showSubPanel(panel) {
    if (panel === "swath") {
      tempSwath = selectedSwath
    }
    activeSubPanel = panel
  }

  function hideSubPanel() {
    activeSubPanel = null
  }

  function selectVehicle(vehicleType) {
    selectedVehicle = vehicleType
    const vehicle = vehicles.find((v) => v.type === vehicleType)
    if (vehicle) {
      selectedSwath = vehicle.swath
      tempSwath = vehicle.swath
    }
    hideSubPanel()
  }

  function selectColor(colorName) {
    selectedColor = colorName
    hideSubPanel()
  }

  function confirmSwath() {
    selectedSwath = tempSwath
    hideSubPanel()
  }

  function updateTempSwath(delta) {
    tempSwath = Math.max(2, Math.min(60, tempSwath + delta))
  }

  function setTempSwath(value) {
    tempSwath = value
  }

  function getDefaultSizeForVehicle(vehicleType) {
    const vehicle = vehicles.find((v) => v.type === vehicleType)
    return vehicle ? vehicle.size : 45
  }

  function getShortName(vehicleType) {
    const shortNames = {
      FourWheelDriveTractor: "4WD Tractor",
      TowBetweenSeeder: "TB Seeder",
      TowBehindSeeder: "TH Seeder",
      TowBehindSeederTracks: "TH Seeder (T)",
      TowBehindBoomspray: "TH Boom",
      SelfPropelledBoomspray: "SP Boom",
      ThreePointBoomspray: "3P Boom",
      FarmUte: "Farm Ute",
      FrontWheelChaserBin: "FW Chaser",
      FourWheelDriveChaserBin: "4WD Chaser",
      HeaderDuals: "Header (D)",
      HeaderSingles: "Header (S)",
      HeaderTracks: "Header (T)",
      SelfPropelledSwather: "SP Swather",
      Spreader: "Spreader",
      Truck: "Truck",
      CabOverTruck: "CO Truck",
      CabOverRoadTrain: "Road Train",
      Baler: "Baler",
      Mower: "Mower",
      SelfPropelledMower: "SP Mower",
      Telehandler: "Telehandler",
      Loader: "Loader",
      SimpleTractor: "Simple Tractor",
      Pointer: "Pointer",
      CombineHarvester: "Combine",
      Excavator: "Excavator",
      Tractor: "Tractor",
      WheelLoader: "Wheel Loader",
      WorkCar: "Work Car",
      Airplane: "Airplane",
    }
    return shortNames[vehicleType] || vehicleType
  }

  function getColorValue(colorName) {
    return colorName || "Green" // Default to Green if undefined
  }

  function getDisplayColor(colorName) {
    if (!colorName) return "#808080" // Default gray for undefined/null colors

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
      // Always save the current vehicle configuration (default or customized)
      const vehicleData = {
        type: selectedVehicle,
        bodyColor: selectedColor,
        swath: selectedSwath,
        size: getDefaultSizeForVehicle(selectedVehicle),
      }

      // Save to vehicle_state table using upsert
      const { error: vehicleError } = await supabase
        .from("vehicle_state")
        .upsert(
          {
            vehicle_id: $profileStore.id,
            vehicle_marker: vehicleData,
          },
          {
            onConflict: "vehicle_id",
          },
        )

      if (vehicleError) throw vehicleError

      // Mark profile as onboarded
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          onboarded: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", $profileStore.id)

      if (profileError) throw profileError

      // Update profile store
      profileStore.update((profile) => ({
        ...profile,
        onboarded: true,
      }))

      // Update vehicle store as well
      userVehicleStore.update((vehicle) => ({
        ...vehicle,
        vehicle_marker: vehicleData,
      }))

      // Wait for minimum animation time
      const elapsedTime = Date.now() - operationStartTime
      const remainingTime = Math.max(0, MIN_ANIMATION_TIME - elapsedTime)

      if (remainingTime > 0) {
        await new Promise((resolve) => setTimeout(resolve, remainingTime))
      }

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

<!-- Only render after initialization to prevent undefined errors -->
{#if isInitialized}
  <!-- Header - mobile optimized -->
  <div class="mb-6 text-center md:mb-10">
    <h2
      class="mb-2 text-2xl font-bold text-contrast-content md:mb-3 md:text-4xl"
    >
      Vehicle <span class="text-base-content">Setup</span>
    </h2>
    <p class="text-sm text-contrast-content/60 md:text-base">
      {completionStatus === "success"
        ? "Your operator setup is complete!"
        : completionStatus === "loading"
          ? "Finalizing your setup..."
          : setupMode === "completion"
            ? "Complete your operator setup"
            : "Configure your primary vehicle"}
    </p>
  </div>

  {#if setupMode === "selection" && !completionStatus}
    <!-- Vehicle Selection Interface -->
    <div class="w-full max-w-full">
      {#if activeSubPanel === null}
        <!-- Main Vehicle Panel -->
        <div
          class="relative overflow-hidden rounded-xl border border-base-300 bg-base-100 shadow-xl md:rounded-2xl"
        >
          <!-- Card header decoration -->
          <div
            class="h-1 w-full bg-gradient-to-r from-base-content/80 via-base-content to-base-content/80 md:h-1.5"
          ></div>

          <div class="p-4 md:p-8">
            <!-- Current Vehicle Display -->
            <div
              class="mb-6 rounded-lg bg-base-200 p-4 text-center md:mb-8 md:rounded-xl md:p-6"
            >
              <div
                class="mb-4 inline-block rounded-lg bg-base-content/10 p-4 md:p-6"
              >
                {#if SVGComponents[selectedVehicle]}
                  <svelte:component
                    this={SVGComponents[selectedVehicle]}
                    bodyColor={getColorValue(selectedColor)}
                    size="80px"
                  />
                {:else}
                  <div class="text-6xl">🚜</div>
                {/if}
              </div>
              <div>
                <h3
                  class="text-lg font-semibold text-contrast-content md:text-xl"
                >
                  {getShortName(selectedVehicle)}
                </h3>
                <p class="text-sm text-contrast-content/60 md:text-base">
                  {selectedColor} • {selectedSwath}m width
                </p>
              </div>
            </div>

            <!-- Configuration Options -->
            <div class="mb-6 space-y-3 md:mb-8 md:space-y-4">
              <button
                class="flex w-full items-center gap-3 rounded-lg border border-base-300 bg-base-200 p-3 transition-all hover:border-base-content/40 hover:bg-base-content/10 md:rounded-xl md:p-4"
                on:click={() => showSubPanel("vehicles")}
              >
                <div
                  class="flex h-8 w-8 items-center justify-center rounded-md bg-base-content/20 text-base-content"
                >
                  {#if SVGComponents[selectedVehicle]}
                    <svelte:component
                      this={SVGComponents[selectedVehicle]}
                      bodyColor={getColorValue(selectedColor)}
                      size="20px"
                    />
                  {:else}
                    <span class="text-sm">🚜</span>
                  {/if}
                </div>
                <div class="flex-1 text-left">
                  <div class="text-xs font-medium text-contrast-content/60">
                    Vehicle Type
                  </div>
                  <div class="text-sm font-semibold text-contrast-content">
                    {getShortName(selectedVehicle)}
                  </div>
                </div>
                <ChevronRight size={16} class="text-contrast-content/40" />
              </button>

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

              <button
                class="flex w-full items-center gap-3 rounded-lg border border-base-300 bg-base-200 p-3 transition-all hover:border-base-content/40 hover:bg-base-content/10 md:rounded-xl md:p-4"
                on:click={() => showSubPanel("swath")}
              >
                <div
                  class="flex h-8 w-8 items-center justify-center rounded-md bg-base-content/20 text-base-content"
                >
                  <ChevronsLeftRight size={16} />
                </div>
                <div class="flex-1 text-left">
                  <div class="text-xs font-medium text-contrast-content/60">
                    Working Width
                  </div>
                  <div class="text-sm font-semibold text-contrast-content">
                    {selectedSwath}m
                  </div>
                </div>
                <ChevronRight size={16} class="text-contrast-content/40" />
              </button>
            </div>

            <!-- Action Buttons -->
            <div class="flex flex-col items-center gap-3">
              <button
                class="flex w-full transform items-center justify-center gap-2 rounded-lg bg-base-content py-3 text-sm font-semibold text-base-100 shadow-lg shadow-base-content/20 transition-all hover:-translate-y-0.5 hover:bg-base-content/90 md:rounded-xl md:py-4 md:text-base"
                on:click={() => (setupMode = "completion")}
              >
                Continue to Complete Setup
                <ArrowRight size={16} />
              </button>

              <p
                class="flex items-center gap-2 text-center text-xs text-contrast-content/40"
              >
                <CheckCircle size={14} />
                Vehicle settings can be changed anytime from your dashboard
              </p>
            </div>
          </div>
        </div>
      {:else if activeSubPanel === "vehicles"}
        <!-- Vehicle Type Selection -->
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
                on:click={hideSubPanel}
              >
                ← Back
              </button>
              <h3 class="text-lg font-semibold text-contrast-content">
                Select Vehicle Type
              </h3>
            </div>

            <div class="max-h-96 overflow-y-auto">
              <div class="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                {#each vehicles as vehicle}
                  <button
                    class="flex flex-col items-center gap-2 rounded-lg border p-3 transition-all {selectedVehicle ===
                    vehicle.type
                      ? 'border-base-content bg-base-content/10 text-base-content'
                      : 'border-base-300 bg-base-200 hover:border-base-content/40 hover:bg-base-content/10'}"
                    on:click={() => selectVehicle(vehicle.type)}
                  >
                    <div class="flex h-8 items-center justify-center">
                      {#if SVGComponents[vehicle.type]}
                        <svelte:component
                          this={SVGComponents[vehicle.type]}
                          bodyColor={getColorValue(selectedColor)}
                          size="32px"
                        />
                      {:else}
                        <span class="text-lg">🚜</span>
                      {/if}
                    </div>
                    <div
                      class="text-center text-xs font-medium text-contrast-content"
                    >
                      {getShortName(vehicle.type)}
                    </div>
                  </button>
                {/each}
              </div>
            </div>
          </div>
        </div>
      {:else if activeSubPanel === "colors"}
        <!-- Color Selection -->
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
                on:click={hideSubPanel}
              >
                ← Back
              </button>
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
      {:else if activeSubPanel === "swath"}
        <!-- Swath/Width Selection -->
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
                on:click={hideSubPanel}
              >
                ← Back
              </button>
              <h3 class="text-lg font-semibold text-contrast-content">
                Working Width
              </h3>
            </div>

            <div class="space-y-6">
              <!-- Current Value Display -->
              <div class="rounded-lg bg-base-200 p-6 text-center">
                <div class="text-3xl font-bold text-base-content">
                  {tempSwath}m
                </div>
                <div class="text-sm text-contrast-content/60">
                  {#if tempSwath <= 4}Small Equipment
                  {:else if tempSwath <= 12}Medium Equipment
                  {:else if tempSwath <= 24}Large Equipment
                  {:else}Extra Large{/if}
                </div>
              </div>

              <!-- Slider Controls -->
              <div class="flex items-center gap-3">
                <button
                  class="flex h-8 w-8 items-center justify-center rounded-lg border border-base-300 bg-base-200 text-base-content transition-colors hover:bg-base-content/10"
                  on:click={() => updateTempSwath(-1)}
                >
                  <Minus size={16} />
                </button>
                <div class="flex-1">
                  <input
                    type="range"
                    min="2"
                    max="60"
                    step="1"
                    value={tempSwath}
                    on:input={(e) => (tempSwath = parseInt(e.target.value))}
                    class="h-2 w-full cursor-pointer appearance-none rounded-lg bg-base-300"
                    style="background: linear-gradient(to right, #10b981 0%, #10b981 {((tempSwath -
                      2) /
                      58) *
                      100}%, #e5e7eb {((tempSwath - 2) / 58) *
                      100}%, #e5e7eb 100%);"
                  />
                </div>
                <button
                  class="flex h-8 w-8 items-center justify-center rounded-lg border border-base-300 bg-base-200 text-base-content transition-colors hover:bg-base-content/10"
                  on:click={() => updateTempSwath(1)}
                >
                  <Plus size={16} />
                </button>
              </div>

              <!-- Preset Buttons -->
              <div class="grid grid-cols-3 gap-2 md:grid-cols-6">
                {#each [4, 8, 12, 18, 24, 36] as preset}
                  <button
                    class="rounded-lg border px-3 py-2 text-sm font-medium transition-all {tempSwath ===
                    preset
                      ? 'border-base-content bg-base-content text-base-100'
                      : 'border-base-300 bg-base-200 text-base-content hover:border-base-content/50'}"
                    on:click={() => setTempSwath(preset)}
                  >
                    {preset}m
                  </button>
                {/each}
              </div>

              <!-- Confirm Button -->
              <button
                class="flex w-full items-center justify-center gap-2 rounded-lg bg-base-content py-3 font-semibold text-base-100 transition-all hover:bg-base-content/90"
                on:click={confirmSwath}
              >
                <Check size={16} />
                Confirm Width
              </button>
            </div>
          </div>
        </div>
      {/if}
    </div>
  {:else}
    <!-- Completion Card -->
    <div
      class="animate-vehicle-setup-fadeIn relative mx-auto max-w-xl overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-xl"
    >
      <div
        class="h-1.5 w-full bg-gradient-to-r from-base-content/80 via-base-content to-base-content/80"
      ></div>

      <div class="p-8 transition-all duration-500 ease-in-out md:p-12">
        {#if completionStatus === "success"}
          <!-- SUCCESS STATE -->
          <div
            class="animate-vehicle-setup-scaleIn flex flex-col items-center gap-6 py-8"
          >
            <div
              class="animate-vehicle-setup-successPulse flex h-24 w-24 items-center justify-center rounded-full bg-green-500/20 shadow-lg shadow-green-500/10"
            >
              <div
                class="animate-vehicle-setup-checkScale flex h-20 w-20 items-center justify-center rounded-full bg-green-500"
              >
                <Check
                  size={40}
                  class="animate-vehicle-setup-checkDraw stroke-[3] text-white"
                />
              </div>
            </div>
            <div class="text-center">
              <h3 class="mb-2 text-2xl font-bold text-contrast-content">
                Setup Complete!
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
              class="animate-vehicle-setup-delayedFadeIn text-sm text-contrast-content/60"
            >
              Redirecting to dashboard...
            </p>
          </div>
        {:else if completionStatus === "loading"}
          <!-- LOADING STATE -->
          <div
            class="animate-vehicle-setup-scaleIn flex flex-col items-center gap-6 py-8"
          >
            <div
              class="relative flex h-24 w-24 items-center justify-center rounded-full bg-blue-500/20"
            >
              <div
                class="animate-vehicle-setup-spin absolute inset-0 rounded-full border-2 border-blue-400/30 border-t-blue-400"
              ></div>
              <Cloud
                size={40}
                class="animate-vehicle-setup-pulse text-blue-400"
              />
            </div>
            <div class="text-center">
              <p class="mb-2 text-xl font-medium text-contrast-content">
                Completing setup...
              </p>
              <p
                class="rounded-full bg-base-200 px-4 py-2 text-sm text-contrast-content/60"
              >
                Finalizing your operator dashboard
              </p>
            </div>
          </div>
        {:else}
          <!-- Final Setup State -->
          <div
            class="animate-vehicle-setup-formEntry flex flex-col items-center gap-6"
          >
            <div
              class="configured-vehicle w-full rounded-lg border border-base-300 bg-base-200 p-6 text-center"
            >
              <div
                class="vehicle-display mb-4 inline-block rounded-lg bg-base-content/10 p-4"
              >
                {#if SVGComponents[selectedVehicle]}
                  <svelte:component
                    this={SVGComponents[selectedVehicle]}
                    bodyColor={getColorValue(selectedColor)}
                    size="64px"
                  />
                {:else}
                  <span class="fallback-medium text-5xl">🚜</span>
                {/if}
              </div>
              <div class="vehicle-summary">
                <h3 class="text-lg font-semibold text-contrast-content">
                  Vehicle Configuration
                </h3>
                <p class="text-sm text-contrast-content/60">
                  {getShortName(selectedVehicle)} • {selectedColor} • {selectedSwath}m
                </p>
              </div>
            </div>
          </div>
        {/if}
      </div>
    </div>

    <!-- Complete Setup Button -->
    {#if !completionStatus}
      <div class="final-actions mt-6 flex flex-col items-center gap-3">
        <button
          class="complete-setup-btn flex w-full transform items-center justify-center gap-2 rounded-xl bg-base-content px-4 py-3 font-semibold text-base-100 shadow-lg shadow-base-content/10 transition-all hover:scale-105 hover:bg-base-content/90 hover:shadow-base-content/20 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 md:py-4 md:text-base"
          on:click={handleCompleteSetup}
          disabled={completionStatus === "loading"}
        >
          {#if completionStatus === "loading"}
            <span class="loading loading-spinner loading-sm"></span>
          {:else}
            <CheckCircle size={18} class="flex-shrink-0" />
          {/if}

          <!-- Responsive button text -->
          <span class="text-center">
            <!-- Mobile: Short text -->
            <span class="block text-sm sm:hidden">Complete Setup</span>
            <!-- Desktop: Full text -->
            <span class="hidden sm:block">Complete Setup & Go to Dashboard</span
            >
          </span>

          {#if !completionStatus}
            <ArrowRight size={18} class="flex-shrink-0" />
          {/if}
        </button>

        <p
          class="setup-note flex items-center gap-2 text-center text-xs text-contrast-content/40"
        >
          <CheckCircle size={14} class="flex-shrink-0" />
          <span
            >Vehicle settings can be changed anytime from your dashboard</span
          >
        </p>
      </div>
    {/if}
  {/if}
{:else}
  <!-- Loading state while initializing -->
  <div
    class="initialization-loading rounded-xl border border-base-300 bg-base-100 p-4 md:p-8"
  >
    <div class="flex items-center justify-center py-12">
      <div class="flex items-center gap-3 text-contrast-content/60">
        <span class="loading loading-spinner loading-md"></span>
        <span>Initializing vehicle setup...</span>
      </div>
    </div>
  </div>
{/if}

<style>
  /* Custom slider styling */
  input[type="range"]::-webkit-slider-thumb {
    appearance: none;
    height: 20px;
    width: 20px;
    border-radius: 50%;
    background: #10b981;
    border: 2px solid white;
    cursor: pointer;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
  }

  input[type="range"]::-moz-range-thumb {
    height: 20px;
    width: 20px;
    border-radius: 50%;
    background: #10b981;
    border: 2px solid white;
    cursor: pointer;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
  }

  /* Vehicle Setup Animations - matching team invite style */
  @keyframes vehicle-setup-fadeIn {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  .animate-vehicle-setup-fadeIn {
    animation: vehicle-setup-fadeIn 0.2s ease-out;
  }

  @keyframes vehicle-setup-scaleIn {
    from {
      opacity: 0;
      transform: scale(0.9);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  .animate-vehicle-setup-scaleIn {
    animation: vehicle-setup-scaleIn 0.2s ease-out;
  }

  @keyframes vehicle-setup-delayedFadeIn {
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

  .animate-vehicle-setup-delayedFadeIn {
    animation: vehicle-setup-delayedFadeIn 1s ease-out;
  }

  @keyframes vehicle-setup-formEntry {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .animate-vehicle-setup-formEntry {
    animation: vehicle-setup-formEntry 0.3s ease-out;
  }

  @keyframes vehicle-setup-spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  .animate-vehicle-setup-spin {
    animation: vehicle-setup-spin 1s linear infinite;
  }

  @keyframes vehicle-setup-pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  .animate-vehicle-setup-pulse {
    animation: vehicle-setup-pulse 2s ease-in-out infinite;
  }

  /* Enhanced success animations */
  @keyframes vehicle-setup-successPulse {
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

  .animate-vehicle-setup-successPulse {
    animation: vehicle-setup-successPulse 2s ease-in-out infinite;
  }

  @keyframes vehicle-setup-checkScale {
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

  .animate-vehicle-setup-checkScale {
    animation: vehicle-setup-checkScale 0.6s ease-out 0.3s both;
  }

  @keyframes vehicle-setup-checkDraw {
    0% {
      stroke-dasharray: 80;
      stroke-dashoffset: 80;
    }
    100% {
      stroke-dasharray: 80;
      stroke-dashoffset: 0;
    }
  }

  .animate-vehicle-setup-checkDraw {
    animation: vehicle-setup-checkDraw 0.5s ease-out 0.5s both;
  }
</style>
