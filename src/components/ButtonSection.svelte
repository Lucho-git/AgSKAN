<!-- src/components/ButtonSection.svelte -->
<script>
  import { createEventDispatcher } from "svelte"
  import { mapStore, locationMarkerStore, syncStore } from "../stores/mapStore"
  import { userVehicleStore, userVehicleTrailing } from "../stores/vehicleStore"

  import { controlStore, trailingButtonPressed } from "$lib/stores/controlStore"
  import { toast } from "svelte-sonner"

  import { browser } from "$app/environment"
  import { onMount } from "svelte"
  import { Home, MapPin, Navigation } from "lucide-svelte"

  let isCircular = true

  onMount(async () => {
    console.log("Mounting ButtonSection")

    setTimeout(() => {
      isExpanded = true
    }, 200)
  })

  const dispatch = createEventDispatcher()

  function toggleTrailing() {
    trailingButtonPressed.update((value) => !value)

    if (!$userVehicleTrailing) {
      toast.info("Initiating trail recording...")
    } else {
    }
  }

  function handleBackToDashboard() {
    dispatch("backToDashboard")
  }

  let isExpanded = false

  function toggleExpanded() {
    isExpanded = !isExpanded
  }

  function handleLocationClick() {
    const coordinates = $userVehicleStore.coordinates
    if (coordinates) {
      locationMarkerStore.set(coordinates)
    } else {
      toast.error("Unable to get your current location")
    }
  }

  function handleLocateHome() {
    dispatch("locateHome")
  }
</script>

<div>
  <!-- Back to Dashboard Button, Top Left -->
  <button
    class="top-button btn {isCircular
      ? 'btn-circle'
      : 'btn-square'} btn-lg absolute left-4 top-4 z-10 bg-white bg-opacity-50 hover:bg-opacity-100"
    on:click={handleBackToDashboard}
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      class="h-6 w-6"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M10 19l-7-7m0 0l7-7m-7 7h18"
      />
    </svg>
  </button>

  <!-- Floating button container -->
  <div class="fixed right-4 top-4 z-20 flex flex-col items-end">
    <!-- Toggle expand/collapse button -->
    <button
      class="top-button btn {isCircular
        ? 'btn-circle'
        : 'btn-square'} btn-lg mb-3 bg-white hover:bg-opacity-90"
      on:click={toggleExpanded}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="h-8 w-8 transition-transform duration-300 {isExpanded
          ? 'rotate-180'
          : ''}"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M19 9l-7 7-7-7"
        />
      </svg>
    </button>

    <!-- Button list container -->
    <div
      class="flex origin-top flex-col space-y-3 transition-all duration-700 ease-in-out {isExpanded
        ? 'scale-100 opacity-90'
        : 'h-50 scale-0 overflow-hidden opacity-0'}"
    >
      <!-- InstantLocationMarker Button -->
      <button
        class="menu-button btn {isCircular
          ? 'btn-circle'
          : 'btn-square'} btn-lg bg-white text-sm hover:bg-opacity-90"
        on:click={handleLocationClick}
      >
        <MapPin size={24} />
      </button>

      <!-- Locate Home Button -->
      <button
        class="menu-button btn {isCircular
          ? 'btn-circle'
          : 'btn-square'} btn-lg bg-white hover:bg-opacity-90"
        on:click={handleLocateHome}
      >
        <Home size={24} />
      </button>

      <!-- Toggle Trailing Button -->
      <button
        class="menu-button btn {isCircular
          ? 'btn-circle'
          : 'btn-square'} btn-lg bg-white hover:bg-opacity-90 {$userVehicleTrailing
          ? 'trailing-active'
          : ''} relative"
        on:click={toggleTrailing}
      >
        {#if $userVehicleTrailing}
          <svg
            class={$userVehicleTrailing ? "animate-trail" : ""}
            fill="currentColor"
            width="36px"
            height="36px"
            viewBox="0 0 32 32"
            version="1.1"
            xmlns="http://www.w3.org/2000/svg"
          >
            <title>trail</title>
            <path
              d="M30.165 30.887c-1.604 0.076-21.522-0.043-21.522-0.043-12.101-12.151 18.219-16.173-0.521-26.154l-1.311 1.383-1.746-4.582 5.635 0.439-1.128 1.267c23.438 6.83-3.151 19.631 20.594 27.69v0z"
            ></path>
          </svg>
        {:else}
          <svg
            fill="currentColor"
            width="36px"
            height="36px"
            viewBox="0 0 32 32"
            version="1.1"
            xmlns="http://www.w3.org/2000/svg"
          >
            <title>trail</title>
            <path
              d="M30.165 30.887c-1.604 0.076-21.522-0.043-21.522-0.043-12.101-12.151 18.219-16.173-0.521-26.154l-1.311 1.383-1.746-4.582 5.635 0.439-1.128 1.267c23.438 6.83-3.151 19.631 20.594 27.69v0z"
            ></path>
          </svg>
        {/if}
      </button>
    </div>
  </div>
</div>

<style>
  /* Base styles for all menu buttons */
  .menu-button {
    transition: all 0.3s ease;
    background-color: #f7db5c;
    border: 2px solid #000000;
    color: #000000;
  }

  .menu-button:hover {
    background-color: rgb(0, 0, 0, 0.5);
    color: #f7db5c;
  }

  /* Top button styles */
  .top-button {
    background-color: #f7db5c;
    border: 2px solid #000000;
    color: #000000;
  }

  .top-button:hover {
    background-color: rgb(0, 0, 0, 0.5);
    color: #f7db5c;
  }

  /* Trailing active state */
  .menu-button.trailing-active {
    background-color: #ff0000;
    border: 2px solid #000000;
    color: #f7db5c;
  }

  .menu-button.trailing-active:hover {
    background-color: #dc0000;
    color: #f7db5c;
  }

  @keyframes draw {
    0% {
      stroke-dashoffset: 1000;
    }
    100% {
      stroke-dashoffset: 0;
    }
  }

  @keyframes fillUnfill {
    0%,
    100% {
      fill-opacity: 0;
    }
    50%,
    51% {
      fill-opacity: 1;
    }
  }

  .animate-trail path {
    stroke: currentColor;
    stroke-width: 1;
    fill: currentColor;
    stroke-dasharray: 105;
    animation:
      draw 10s linear infinite,
      fillUnfill 3s linear infinite;
  }

  .trailing-active {
    position: relative;
    overflow: visible !important;
  }
</style>
