<script lang="ts">
  import { toast } from "svelte-sonner"
  import Icon from "@iconify/svelte"

  let mapPerformanceMode = "balanced"
  let markerVisibility = "all"
  let markerDropdownOpen = false

  // Custom marker visibility settings
  let customMarkerSettings = {
    vehicles: true,
    fieldBoundaries: true,
    pointsOfInterest: true,
  }

  const performanceModes = [
    { id: "high-quality", label: "High Quality" },
    { id: "balanced", label: "Balanced" },
    { id: "performance", label: "Performance" },
  ]

  const markerOptions = [
    { id: "all", label: "Show all markers" },
    { id: "active", label: "Show active markers only" },
    { id: "custom", label: "Custom visibility" },
  ]

  function getPerformanceDescription(mode) {
    switch (mode) {
      case "high-quality":
        return "Shows all details but may reduce performance on older devices."
      case "balanced":
        return "Recommended setting for most devices, balancing quality and speed."
      case "performance":
        return "Limits details to ensure smooth operation on all devices."
      default:
        return ""
    }
  }

  function saveMapSettings() {
    toast.success("Map preferences saved successfully")
  }
</script>

<section
  class="overflow-hidden rounded-xl border border-base-300 bg-base-100 shadow-lg"
>
  <div class="border-b border-base-300 p-5">
    <h2 class="flex items-center gap-2 text-xl font-semibold text-base-content">
      <Icon
        icon="solar:global-bold-duotone"
        width="18"
        height="18"
        class="text-primary"
      />
      Map Preferences
    </h2>
  </div>

  <div class="space-y-4 p-4 md:space-y-6 md:p-6">
    <!-- Performance Mode -->
    <div>
      <h3 class="mb-3 font-medium text-base-content">Performance Mode</h3>

      <div class="grid grid-cols-3 gap-1 rounded-lg bg-base-200 p-1">
        {#each performanceModes as mode}
          <button
            class="rounded-md px-3 py-2 text-sm font-medium transition-colors
              {mapPerformanceMode === mode.id
              ? 'bg-primary text-primary-content'
              : 'text-base-content/60 hover:bg-base-300 hover:text-base-content'}"
            on:click={() => (mapPerformanceMode = mode.id)}
          >
            {mode.label}
          </button>
        {/each}
      </div>

      <div class="alert mt-3">
        <Icon
          icon="solar:danger-triangle-bold-duotone"
          width="16"
          height="16"
          class="text-warning"
        />
        <span class="text-sm">
          {getPerformanceDescription(mapPerformanceMode)}
        </span>
      </div>
    </div>

    <!-- Marker Visibility -->
    <div>
      <h3 class="mb-3 font-medium text-base-content">Marker Visibility</h3>

      <div class="relative">
        <button
          class="btn btn-outline w-full justify-between"
          on:click={() => (markerDropdownOpen = !markerDropdownOpen)}
        >
          <span>
            {markerOptions.find((option) => option.id === markerVisibility)
              ?.label || "Select option"}
          </span>
          <Icon
            icon="solar:alt-arrow-down-bold-duotone"
            width="18"
            height="18"
            class="transition-transform {markerDropdownOpen
              ? 'rotate-180'
              : ''}"
          />
        </button>

        {#if markerDropdownOpen}
          <div
            class="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-lg border border-base-300 bg-base-100 shadow-lg"
          >
            {#each markerOptions as option}
              <button
                class="w-full border-b border-base-300 p-3 text-left text-base-content transition-colors last:border-b-0 hover:bg-base-200"
                on:click={() => {
                  markerVisibility = option.id
                  markerDropdownOpen = false
                }}
              >
                {option.label}
              </button>
            {/each}
          </div>
        {/if}
      </div>

      {#if markerVisibility === "custom"}
        <div class="mt-4 space-y-3 rounded-lg bg-base-200 p-4">
          <h4 class="text-sm font-medium text-base-content">
            Custom Marker Settings
          </h4>

          <div class="space-y-2">
            <div class="form-control">
              <label class="label cursor-pointer">
                <span class="label-text">Vehicles</span>
                <input
                  type="checkbox"
                  bind:checked={customMarkerSettings.vehicles}
                  class="checkbox-primary checkbox"
                />
              </label>
            </div>

            <div class="form-control">
              <label class="label cursor-pointer">
                <span class="label-text">Field Boundaries</span>
                <input
                  type="checkbox"
                  bind:checked={customMarkerSettings.fieldBoundaries}
                  class="checkbox-primary checkbox"
                />
              </label>
            </div>

            <div class="form-control">
              <label class="label cursor-pointer">
                <span class="label-text">Points of Interest</span>
                <input
                  type="checkbox"
                  bind:checked={customMarkerSettings.pointsOfInterest}
                  class="checkbox-primary checkbox"
                />
              </label>
            </div>
          </div>
        </div>
      {/if}
    </div>

    <!-- Save button -->
    <div class="pt-4">
      <button class="btn btn-primary w-full gap-2" on:click={saveMapSettings}>
        <Icon icon="solar:diskette-bold-duotone" width="16" height="16" />
        Save Preferences
      </button>
    </div>
  </div>
</section>

<!-- Close dropdown when clicking outside -->
<svelte:window on:click={() => (markerDropdownOpen = false)} />
