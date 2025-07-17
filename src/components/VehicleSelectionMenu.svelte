<script>
  import { createEventDispatcher } from "svelte"
  import SVGComponents from "$lib/vehicles/index.js"
  import { onMount } from "svelte"

  import { toast } from "svelte-sonner"
  import { Button } from "$lib/components/ui/button"
  import * as Card from "$lib/components/ui/card"
  import { Slider } from "$lib/components/ui/slider"
  import * as Tabs from "$lib/components/ui/tabs"
  import { ScrollArea } from "$lib/components/ui/scroll-area"

  import {
    Edit,
    Truck,
    Paintbrush,
    Maximize,
    Minimize,
    Info,
    ChevronsLeftRight,
  } from "lucide-svelte"

  const dispatch = createEventDispatcher()

  export let showMenu = false
  export let currentVehicleType
  export let currentVehicleSize // Size in pixels
  export let currentVehicleColor
  export let currentVehicleSwath

  let activeTab = "vehicles"
  let usedColors = []

  $: vehicles = [
    { type: "FourWheelDriveTractor", bodyColor: "green", size: 60, swath: 4 },
    { type: "TowBetweenSeeder", bodyColor: "red", size: 60, swath: 12 },
    { type: "TowBehindSeeder", bodyColor: "red", size: 60, swath: 12 },
    { type: "TowBehindSeederTracks", bodyColor: "red", size: 60, swath: 12 },
    { type: "TowBehindBoomspray", bodyColor: "red", size: 60, swath: 36 },
    { type: "SelfPropelledBoomspray", bodyColor: "red", size: 60, swath: 36 },
    { type: "ThreePointBoomspray", bodyColor: "red", size: 60, swath: 36 },
    { type: "FarmUte", bodyColor: "red", size: 60, swath: 4 },
    { type: "FrontWheelChaserBin", bodyColor: "red", size: 60, swath: 12 },
    { type: "FourWheelDriveChaserBin", bodyColor: "red", size: 60, swath: 12 },
    { type: "HeaderDuals", bodyColor: "red", size: 60, swath: 12 },
    { type: "HeaderSingles", bodyColor: "red", size: 60, swath: 12 },
    { type: "HeaderTracks", bodyColor: "red", size: 60, swath: 12 },
    { type: "SelfPropelledSwather", bodyColor: "red", size: 60, swath: 12 },
    { type: "Spreader", bodyColor: "red", size: 60, swath: 12 },
    { type: "Truck", bodyColor: "red", size: 60, swath: 4 },
    { type: "CabOverTruck", bodyColor: "red", size: 60, swath: 4 },
    { type: "CabOverRoadTrain", bodyColor: "red", size: 60, swath: 4 },
    { type: "Baler", bodyColor: "red", size: 60, swath: 12 },
    { type: "Mower", bodyColor: "red", size: 60, swath: 12 },
    { type: "SelfPropelledMower", bodyColor: "red", size: 60, swath: 12 },
    { type: "Telehandler", bodyColor: "red", size: 60, swath: 12 },
    { type: "Loader", bodyColor: "red", size: 60, swath: 4 },
    { type: "SimpleTractor", bodyColor: "red", size: 60, swath: 4 },
    { type: "Pointer", bodyColor: "green", size: 60, swath: 4 },
    { type: "CombineHarvester", bodyColor: "yellow", size: 60, swath: 12 },
    { type: "Excavator", bodyColor: "orange", size: 60, swath: 4 },
    { type: "Tractor", bodyColor: "green", size: 60, swath: 4 },
    { type: "WheelLoader", bodyColor: "yellow", size: 60, swath: 4 },
    { type: "WorkCar", bodyColor: "red", size: 60, swath: 4 },
    { type: "Airplane", bodyColor: "blue", size: 60, swath: 50 },
  ]

  let swathValue = [12] // Default value, adjust as needed

  $: initialVehicle =
    vehicles.find((v) => v.type === currentVehicleType) || vehicles[0]

  $: selectedVehicle = {
    ...initialVehicle,
    swath: currentVehicleSwath || initialVehicle.swath,
  }

  $: {
    if (selectedVehicle.swath !== swathValue[0]) {
      swathValue = [selectedVehicle.swath]
    }
  }

  function updateSwath(value) {
    const newValue = Array.isArray(value) ? value[0] : value
    swathValue = [newValue]
    selectedVehicle = { ...selectedVehicle, swath: newValue }
  }

  function selectVehicle(vehicle) {
    selectedVehicle = { ...vehicle }
    swathValue = [vehicle.swath || 12.0]
  }

  $: hasChanged =
    selectedVehicle.type !== initialVehicle.type ||
    selectedVehicle.bodyColor !== initialVehicle.bodyColor ||
    selectedVehicle.size !== initialVehicle.size ||
    selectedVehicle.swath !== initialVehicle.swath

  let isMobile = false

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

  // Function to create shortened vehicle names
  function getShortName(vehicleType) {
    const shortNames = {
      FourWheelDriveTractor: "FWDTractor",
      TowBetweenSeeder: "TBSeeder",
      TowBehindSeeder: "TBSeeder",
      TowBehindSeederTracks: "TBSeederT",
      TowBehindBoomspray: "TBBoom",
      SelfPropelledBoomspray: "SPBoom",
      ThreePointBoomspray: "3PBoom",
      FarmUte: "FarmUte",
      FrontWheelChaserBin: "FWChaser",
      FourWheelDriveChaserBin: "FWDChaser",
      HeaderDuals: "HeaderD",
      HeaderSingles: "HeaderS",
      HeaderTracks: "HeaderT",
      SelfPropelledSwather: "SPSwather",
      Spreader: "Spreader",
      Truck: "Truck",
      CabOverTruck: "COTruck",
      CabOverRoadTrain: "CORoad",
      Baler: "Baler",
      Mower: "Mower",
      SelfPropelledMower: "SPMower",
      Telehandler: "Telehand",
      Loader: "Loader",
      SimpleTractor: "STractor",
      Pointer: "Pointer",
      CombineHarvester: "Combine",
      Excavator: "Excavator",
      Tractor: "Tractor",
      WheelLoader: "WLoader",
      WorkCar: "WorkCar",
      Airplane: "Airplane",
    }
    return shortNames[vehicleType] || vehicleType
  }

  onMount(() => {
    const checkMobile = () => {
      isMobile = window.innerWidth < 640
    }
    checkMobile()

    window.addEventListener("resize", checkMobile)

    vehicles = vehicles.map((vehicle) => {
      if (vehicle.type === currentVehicleType) {
        return {
          ...vehicle,
          size: currentVehicleSize || 60,
          bodyColor: currentVehicleColor,
          swath: currentVehicleSwath,
        }
      }
      return {
        ...vehicle,
        bodyColor: cycleRandomItems(colors, usedColors),
      }
    })

    return () => {
      window.removeEventListener("resize", checkMobile)
    }
  })

  function confirmSelection() {
    toast.success(
      `Selected Vehicle: [${selectedVehicle.bodyColor} ${selectedVehicle.type}]`,
    )

    dispatch("vehicleSelected", {
      ...selectedVehicle,
      size: selectedVehicle.size,
      swath: swathValue[0],
    })

    dispatch("closeMenu")
  }

  function cancelSelection() {
    dispatch("closeMenu")
  }

  function selectColor(bodyColor) {
    selectedVehicle = { ...selectedVehicle, bodyColor }
  }

  function getRandomItem(array) {
    return array[Math.floor(Math.random() * array.length)]
  }

  function cycleRandomItems(array, usedItems) {
    const availableItems = array.filter((item) => !usedItems.includes(item))
    if (availableItems.length === 0) {
      usedItems.length = 0
      return getRandomItem(array)
    }
    const selectedItem = getRandomItem(availableItems)
    usedItems.push(selectedItem)
    return selectedItem
  }
</script>

<!-- Backdrop for mobile -->
{#if showMenu && isMobile}
  <div
    class="fixed inset-0 z-10 bg-black bg-opacity-50 transition-opacity"
    on:click={cancelSelection}
  ></div>
{/if}

<div
  class="fixed bottom-0 left-0 right-0 z-20 flex transform flex-col rounded-t-lg bg-white shadow-lg transition-transform duration-300"
  class:translate-y-full={!showMenu}
  class:translate-y-0={showMenu}
  style="height: {isMobile ? '100vh' : '60vh'}; max-height: {isMobile
    ? '100vh'
    : '60vh'}; padding: {isMobile ? '1rem' : '2rem'};"
>
  <div class="flex flex-grow flex-col overflow-hidden text-black sm:flex-row">
    <div
      class="flex w-full flex-grow flex-col overflow-hidden sm:w-1/2 sm:pr-4"
    >
      <Card.Root class="h-full overflow-hidden border-2 border-gray-300">
        <Tabs.Root
          value={activeTab}
          onValueChange={(value) => (activeTab = value)}
          class="flex h-full flex-col rounded-lg bg-gray-100 p-1 shadow-inner"
        >
          <Tabs.List class="grid w-full flex-shrink-0 grid-cols-3 gap-1">
            <Tabs.Trigger
              value="vehicles"
              class="rounded-md px-4 py-2 text-gray-700 transition-all duration-200 hover:bg-gray-200 data-[state=active]:bg-white data-[state=active]:shadow-md"
            >
              Vehicles
            </Tabs.Trigger>
            <Tabs.Trigger
              value="colors"
              class="rounded-md px-4 py-2 text-gray-700 transition-all duration-200 hover:bg-gray-200 data-[state=active]:bg-white data-[state=active]:shadow-md"
            >
              Colors
            </Tabs.Trigger>
            <Tabs.Trigger
              value="swath"
              class="rounded-md px-4 py-2 text-gray-700 transition-all duration-200 hover:bg-gray-200 data-[state=active]:bg-white data-[state=active]:shadow-md"
            >
              Swath
            </Tabs.Trigger>
          </Tabs.List>
          <div class="flex-grow overflow-hidden">
            <Tabs.Content value="vehicles" class="h-full">
              <div class="h-full overflow-y-auto p-4 pb-8">
                <div class="grid-container">
                  {#each vehicles as vehicle}
                    <div class="flex flex-col items-center space-y-1">
                      <Button
                        variant="outline"
                        class="h-24 w-24 border-2 p-2 {selectedVehicle.type ===
                        vehicle.type
                          ? 'border-blue-500 bg-blue-50'
                          : ''}"
                        on:click={() => selectVehicle(vehicle)}
                      >
                        <svelte:component
                          this={SVGComponents[vehicle.type]}
                          bodyColor={vehicle.bodyColor}
                          size="100%"
                        />
                      </Button>
                      <span
                        class="max-w-full text-center text-xs font-medium leading-tight text-gray-700"
                      >
                        {getShortName(vehicle.type)}
                      </span>
                    </div>
                  {/each}
                </div>
              </div>
            </Tabs.Content>
            <Tabs.Content value="colors" class="h-full">
              <div class="h-full overflow-y-auto p-4 pb-8">
                <div
                  class="grid gap-3"
                  style="grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));"
                >
                  {#each colors as color}
                    <button
                      class="relative flex h-16 w-full items-center justify-center rounded-lg border-2 transition-all hover:scale-105 {selectedVehicle.bodyColor ===
                      color
                        ? 'border-gray-800 ring-2 ring-blue-300'
                        : 'border-gray-200'}"
                      style="background-color: {color};"
                      on:click={() => selectColor(color)}
                    >
                      <div class="absolute bottom-1 left-1 right-1">
                        <span
                          class="inline-block rounded bg-white bg-opacity-90 px-1.5 py-0.5 text-xs font-medium text-gray-900"
                        >
                          {color}
                        </span>
                      </div>
                    </button>
                  {/each}
                </div>
              </div>
            </Tabs.Content>
            <Tabs.Content value="swath" class="h-full">
              <div class="h-full overflow-hidden p-4">
                <div class="h-full space-y-4">
                  <Card.Root class="h-full">
                    <Card.Header class="flex items-center pb-3">
                      <Card.Title class="flex items-center text-base">
                        Swath Width
                        <Button
                          variant="ghost"
                          size="icon"
                          class="ml-2 h-6 w-6"
                          on:click={() => {
                            toast.info("About Swath Width", {
                              description:
                                "Swath width is the area covered by your vehicle in one pass. Proper swath setting ensures correct trailing visuals.",
                              duration: 7000,
                            })
                          }}
                        >
                          <Info class="h-3 w-3" />
                        </Button>
                      </Card.Title>
                    </Card.Header>
                    <Card.Content class="space-y-4">
                      <div class="grid grid-cols-3 gap-2">
                        {#each [4, 8, 10, 12, 24, 36] as preset}
                          <button
                            class="rounded-full px-2 py-1 text-xs {selectedVehicle.swath ===
                            preset
                              ? 'bg-primary text-white'
                              : 'bg-gray-200'}"
                            on:click={() => updateSwath(preset)}
                          >
                            {preset}m
                          </button>
                        {/each}
                      </div>
                      <div class="flex items-center space-x-2">
                        <Minimize class="h-4 w-4" />
                        <Slider
                          value={swathValue}
                          onValueChange={updateSwath}
                          min={2}
                          max={60}
                          step={1}
                          class="flex-grow [&_[role=slider]]:h-4 [&_[role=slider]]:w-4 [&_[role=slider]]:bg-gray-100 [&_[role=slider]]:shadow-[inset_-2px_-2px_5px_rgba(255,255,255,0.7),inset_2px_2px_5px_rgba(0,0,0,0.1)] [&_[role=track]]:h-1.5 [&_[role=track]]:bg-gray-200 [&_[role=track]]:shadow-[inset_1px_1px_3px_rgba(0,0,0,0.1),inset_-1px_-1px_3px_rgba(255,255,255,0.7)]"
                        />
                        <span class="text-sm font-semibold"
                          >{swathValue[0]}m</span
                        >
                      </div>
                    </Card.Content>
                  </Card.Root>
                </div>
              </div>
            </Tabs.Content>
          </div>
        </Tabs.Root>
      </Card.Root>
    </div>

    <!-- Vehicle display box -->
    <div class="mt-4 flex w-full flex-col sm:mt-0 sm:w-1/2 sm:pl-4">
      <Card.Root class="h-full w-full">
        <Card.Header class="pb-2 text-center">
          <Card.Title class="max-w-full break-words px-2 text-xl font-semibold">
            {selectedVehicle.type}
          </Card.Title>
        </Card.Header>
        <Card.Content class="space-y-4">
          <Button
            variant={activeTab === "vehicles" ? "default" : "outline"}
            class="relative flex h-40 w-full items-center justify-center border-2 {activeTab ===
            'vehicles'
              ? 'border-blue-500'
              : 'border-gray-200'}"
            on:click={() => (activeTab = "vehicles")}
          >
            <Edit class="absolute right-2 top-2 h-4 w-4 text-gray-400" />
            <svelte:component
              this={SVGComponents[selectedVehicle.type]}
              bodyColor={selectedVehicle.bodyColor}
              size={`${selectedVehicle.size * 1.8}px`}
            />
          </Button>
          <div class="grid grid-cols-2 gap-4">
            <Button
              variant={activeTab === "colors" ? "default" : "outline"}
              class="relative flex h-20 flex-col items-center justify-center border-2 {activeTab ===
              'colors'
                ? 'border-blue-500'
                : 'border-gray-200'}"
              on:click={() => (activeTab = "colors")}
            >
              <Edit class="absolute right-2 top-2 h-4 w-4 text-gray-400" />
              <Paintbrush class="mb-2 h-5 w-5" />
              <span>{selectedVehicle.bodyColor}</span>
            </Button>
            <Button
              variant={activeTab === "swath" ? "default" : "outline"}
              class="relative flex h-20 flex-col items-center justify-center border-2 {activeTab ===
              'swath'
                ? 'border-blue-500'
                : 'border-gray-200'}"
              on:click={() => (activeTab = "swath")}
            >
              <Edit class="absolute right-2 top-2 h-4 w-4 text-gray-400" />
              <Minimize class="mb-2 h-5 w-5" />
              <span>{swathValue[0]}m</span>
            </Button>
          </div>
        </Card.Content>
      </Card.Root>
    </div>
  </div>

  <!-- Underneath section: Cancel and Confirm buttons -->
  <div class="mt-6 flex flex-shrink-0">
    <button class="btn mr-2 flex-1" on:click={cancelSelection}>Cancel</button>
    <button
      class="btn btn-primary ml-2 flex-1"
      on:click={confirmSelection}
      disabled={!hasChanged}
    >
      Confirm
    </button>
  </div>
</div>

<style>
  .grid-container {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(85px, 1fr));
    gap: 1rem;
  }
</style>
