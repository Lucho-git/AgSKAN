<script lang="ts">
  import Icon from "@iconify/svelte"

  // Map preferences state
  let mapPerformanceMode = "balanced"
  let markerVisibility = "all"
  let markerDropdownOpen = false

  // Custom marker settings
  let customMarkerSettings = {
    vehicles: true,
    fieldBoundaries: true,
    pointsOfInterest: true,
  }

  function handlePerformanceModeChange(mode) {
    mapPerformanceMode = mode
    // Here you would save to your API/store
    console.log("Performance mode changed to:", mode)
  }

  function handleMarkerVisibilityChange(visibility) {
    markerVisibility = visibility
    markerDropdownOpen = false
    // Here you would save to your API/store
    console.log("Marker visibility changed to:", visibility)
  }

  function handleCustomMarkerChange() {
    // Here you would save to your API/store
    console.log("Custom marker settings:", customMarkerSettings)
  }
</script>

<svelte:head>
  <title>Map Preferences</title>
</svelte:head>

<!-- Close dropdown when clicking outside -->
<svelte:window on:click={() => (markerDropdownOpen = false)} />

<!-- Header -->
<div
  class="flex items-center justify-between border-b border-base-300 bg-base-100 p-5"
>
  <h2
    class="flex items-center gap-2 text-xl font-semibold text-contrast-content"
  >
    <div class="rounded-lg bg-base-content/10 p-1.5">
      <Icon
        icon="solar:global-bold-duotone"
        width="18"
        height="18"
        class="text-base-content"
      />
    </div>
    Map Preferences
  </h2>
</div>

<!-- Content -->
<div class="space-y-6 p-6">
  <!-- Performance Mode -->
  <div>
    <h3 class="mb-3 flex items-center gap-2 font-medium text-contrast-content">
      <div class="rounded-lg bg-base-content/10 p-1.5">
        <Icon
          icon="solar:speedometer-bold-duotone"
          width="16"
          height="16"
          class="text-base-content"
        />
      </div>
      Performance Mode
    </h3>

    <div class="grid grid-cols-3 gap-1 rounded-lg bg-base-200 p-1">
      {#each ["high-quality", "balanced", "performance"] as mode}
        <button
          class="rounded-md px-3 py-2 text-sm font-medium transition-colors
            {mapPerformanceMode === mode
            ? 'bg-base-content text-base-100'
            : 'text-contrast-content/60 hover:bg-base-300 hover:text-contrast-content'}"
          on:click={() => handlePerformanceModeChange(mode)}
        >
          {mode === "high-quality"
            ? "High Quality"
            : mode === "balanced"
              ? "Balanced"
              : "Performance"}
        </button>
      {/each}
    </div>

    <div class="alert mt-3">
      <Icon
        icon="solar:info-circle-bold-duotone"
        width="16"
        height="16"
        class="text-info"
      />
      <span class="text-sm text-contrast-content">
        {mapPerformanceMode === "high-quality"
          ? "Shows all details but may reduce performance on older devices."
          : mapPerformanceMode === "balanced"
            ? "Recommended setting for most devices, balancing quality and speed."
            : "Limits details to ensure smooth operation on all devices."}
      </span>
    </div>
  </div>

  <!-- Marker Visibility -->
  <div>
    <h3 class="mb-3 flex items-center gap-2 font-medium text-contrast-content">
      <div class="rounded-lg bg-base-content/10 p-1.5">
        <Icon
          icon="solar:map-point-bold-duotone"
          width="16"
          height="16"
          class="text-base-content"
        />
      </div>
      Marker Visibility
    </h3>

    <div class="relative">
      <button
        class="btn btn-outline w-full justify-between"
        on:click|stopPropagation={() =>
          (markerDropdownOpen = !markerDropdownOpen)}
      >
        <span class="text-contrast-content">
          {markerVisibility === "all"
            ? "Show all markers"
            : markerVisibility === "active"
              ? "Show active markers only"
              : markerVisibility === "custom"
                ? "Custom visibility"
                : "Select option"}
        </span>
        <Icon
          icon="solar:alt-arrow-down-bold-duotone"
          width="18"
          height="18"
          class="text-base-content transition-transform {markerDropdownOpen
            ? 'rotate-180'
            : ''}"
        />
      </button>

      {#if markerDropdownOpen}
        <div
          class="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-lg border border-base-300 bg-base-100 shadow-lg"
        >
          {#each ["all", "active", "custom"] as option}
            <button
              class="flex w-full items-center gap-3 border-b border-base-300 p-3 text-left text-contrast-content transition-colors last:border-b-0 hover:bg-base-200"
              on:click|stopPropagation={() =>
                handleMarkerVisibilityChange(option)}
            >
              <Icon
                icon={option === "all"
                  ? "solar:eye-bold-duotone"
                  : option === "active"
                    ? "solar:play-circle-bold-duotone"
                    : "solar:settings-bold-duotone"}
                width="16"
                height="16"
                class="text-base-content/60"
              />
              <span>
                {option === "all"
                  ? "Show all markers"
                  : option === "active"
                    ? "Show active markers only"
                    : "Custom visibility"}
              </span>
            </button>
          {/each}
        </div>
      {/if}
    </div>

    {#if markerVisibility === "custom"}
      <div
        class="mt-4 space-y-3 rounded-lg border border-base-300 bg-base-200 p-4"
      >
        <h4
          class="flex items-center gap-2 text-sm font-medium text-contrast-content"
        >
          <Icon
            icon="solar:settings-bold-duotone"
            width="14"
            height="14"
            class="text-base-content"
          />
          Custom Marker Settings
        </h4>

        <div class="space-y-3">
          <div class="form-control">
            <label class="label cursor-pointer">
              <span
                class="label-text flex items-center gap-2 text-contrast-content"
              >
                <Icon
                  icon="solar:tractor-bold-duotone"
                  width="16"
                  height="16"
                  class="text-base-content/60"
                />
                Vehicles
              </span>
              <input
                type="checkbox"
                class="checkbox-primary checkbox"
                bind:checked={customMarkerSettings.vehicles}
                on:change={handleCustomMarkerChange}
              />
            </label>
          </div>

          <div class="form-control">
            <label class="label cursor-pointer">
              <span
                class="label-text flex items-center gap-2 text-contrast-content"
              >
                <Icon
                  icon="solar:leaf-bold-duotone"
                  width="16"
                  height="16"
                  class="text-base-content/60"
                />
                Field Boundaries
              </span>
              <input
                type="checkbox"
                class="checkbox-primary checkbox"
                bind:checked={customMarkerSettings.fieldBoundaries}
                on:change={handleCustomMarkerChange}
              />
            </label>
          </div>

          <div class="form-control">
            <label class="label cursor-pointer">
              <span
                class="label-text flex items-center gap-2 text-contrast-content"
              >
                <Icon
                  icon="solar:map-point-favourite-bold-duotone"
                  width="16"
                  height="16"
                  class="text-base-content/60"
                />
                Points of Interest
              </span>
              <input
                type="checkbox"
                class="checkbox-primary checkbox"
                bind:checked={customMarkerSettings.pointsOfInterest}
                on:change={handleCustomMarkerChange}
              />
            </label>
          </div>
        </div>
      </div>
    {/if}
  </div>

  <!-- Map Style -->
  <div>
    <h3 class="mb-3 flex items-center gap-2 font-medium text-contrast-content">
      <div class="rounded-lg bg-base-content/10 p-1.5">
        <Icon
          icon="solar:layers-bold-duotone"
          width="16"
          height="16"
          class="text-base-content"
        />
      </div>
      Map Style
    </h3>

    <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
      <div class="rounded-lg border-2 border-base-content bg-base-100 p-3">
        <div class="mb-2 flex items-center gap-3">
          <input
            type="radio"
            name="mapStyle"
            value="satellite"
            class="radio-primary radio"
            checked
          />
          <span class="font-medium text-contrast-content">Satellite View</span>
        </div>
        <p class="text-sm text-contrast-content/60">
          High-resolution satellite imagery with field details
        </p>
      </div>

      <div
        class="cursor-pointer rounded-lg border-2 border-base-300 bg-base-100 p-3 transition-colors hover:border-base-content/30"
      >
        <div class="mb-2 flex items-center gap-3">
          <input
            type="radio"
            name="mapStyle"
            value="terrain"
            class="radio-primary radio"
          />
          <span class="font-medium text-contrast-content">Terrain View</span>
        </div>
        <p class="text-sm text-contrast-content/60">
          Topographical map with elevation and terrain features
        </p>
      </div>
    </div>
  </div>

  <!-- Save Changes -->
  <div class="flex justify-end border-t border-base-300 pt-4">
    <button class="btn btn-primary gap-2">
      <Icon icon="solar:diskette-bold-duotone" width="16" height="16" />
      Save Preferences
    </button>
  </div>
</div>
