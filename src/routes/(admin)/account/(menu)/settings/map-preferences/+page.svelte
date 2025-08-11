<script lang="ts">
  import { onMount } from "svelte"
  import Icon from "@iconify/svelte"
  import { toast } from "svelte-sonner"
  import { connectedMapStore } from "$lib/stores/connectedMapStore"
  import { userSettingsStore } from "$lib/stores/userSettingsStore"
  import { supabase } from "$lib/stores/sessionStore"
  import { session } from "$lib/stores/sessionStore"

  // Preset options for days (same as MarkerFilterSettings)
  const dayOptions = [
    {
      value: 0,
      label: "Show all markers",
      description: "All markers visible",
    },
    {
      value: 1,
      label: "Last 1 day",
      description: "Today's markers only",
    },
    {
      value: 4,
      label: "Last 4 days",
      description: "Past 4 days",
    },
    {
      value: 7,
      label: "Last 7 days",
      description: "Past week",
    },
    {
      value: 30,
      label: "Last 30 days",
      description: "Past month",
    },
    {
      value: 90,
      label: "Last 90 days",
      description: "Past 3 months",
    },
    {
      value: 180,
      label: "Last 180 days",
      description: "Past 6 months",
    },
    {
      value: 365,
      label: "Last 365 days",
      description: "Past year",
    },
  ]

  // Available imagery providers
  const imageryProviders = [
    {
      key: "google_satellite",
      name: "Google Satellite",
      description: "Google Satellite Imagery",
      icon: "solar:global-bold-duotone",
    },
    {
      key: "bing_aerial",
      name: "Microsoft Bing Aerial",
      description: "High-resolution aerial photography",
      icon: "solar:camera-bold-duotone",
    },
    {
      key: "esri_clarity",
      name: "Esri Clarity+",
      description: "Enhanced clarity processing, may use older imagery",
      icon: "solar:eye-bold-duotone",
    },
    {
      key: "esri_standard",
      name: "Esri World Imagery",
      description: "Standard high-resolution imagery",
      icon: "solar:planet-bold-duotone",
    },
    {
      key: "esri_vivid",
      name: "Esri Vivid Basemap",
      description: "Enhanced colors for vegetation analysis",
      icon: "solar:palette-bold-duotone",
    },
    {
      key: "ndvi",
      name: "NDVI Vegetation Index",
      description: "Agricultural vegetation health analysis",
      icon: "solar:leaf-bold-duotone",
    },
  ]

  // Default options for imagery selector
  const defaultImageryOptions = [
    { key: "mapbox", name: "Mapbox Satellite" },
    { key: "google_satellite", name: "Google Satellite" },
    { key: "bing_aerial", name: "Microsoft Bing Aerial" },
    { key: "esri_clarity", name: "Esri Clarity+" },
    { key: "esri_standard", name: "Esri World Imagery" },
    { key: "esri_vivid", name: "Esri Vivid Basemap" },
  ]

  // Marker display settings
  let selectedDays = 0
  let zoomToLocationMarkers = true
  let zoomToPlacedMarkers = true
  let saving = false

  // Satellite imagery settings
  let satelliteDropdownEnabled = false
  let enabledImageryProviders = []
  let defaultImagerySource = "mapbox"
  let showSatelliteInput = false
  let satelliteCode = ""

  // Reactive values from stores
  $: isConnected = $connectedMapStore?.id
  $: mapName = $connectedMapStore?.map_name || "Unknown Map"
  $: mapOwner = $connectedMapStore?.owner || "Unknown Owner"
  $: lastSync = new Date()

  // Get display info for selected option
  $: selectedOption = dayOptions.find((option) => option.value === selectedDays)
  $: showDateRange = selectedDays > 0
  $: displayDate = showDateRange
    ? formatDate(calculateDateFromDays(selectedDays))
    : null

  // Filter default options based on enabled providers
  $: availableDefaultOptions = defaultImageryOptions.filter(
    (option) =>
      option.key === "mapbox" || enabledImageryProviders.includes(option.key),
  )

  // Format date for display
  function formatDate(dateString) {
    const date = new Date(dateString)
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  }

  // Calculate date based on selected days
  function calculateDateFromDays(days) {
    if (days === 0) return null
    const date = new Date()
    date.setDate(date.getDate() - days)
    return date.toISOString()
  }

  // Handle selection change with instant save
  async function handleSelectionChange(event) {
    selectedDays = parseInt(event.target.value)
    await saveMarkerLimitSetting()
  }

  // Handle zoom setting changes with instant save
  async function handleLocationZoomToggle() {
    zoomToLocationMarkers = !zoomToLocationMarkers
    await saveZoomSettings()
  }

  async function handlePlacedZoomToggle() {
    zoomToPlacedMarkers = !zoomToPlacedMarkers
    await saveZoomSettings()
  }

  // Handle satellite dropdown toggle
  function handleSatelliteDropdownToggle() {
    if (satelliteDropdownEnabled) {
      satelliteDropdownEnabled = false
      saveSatelliteSettings()
    } else {
      showSatelliteInput = true
      satelliteCode = ""
    }
  }

  // Handle satellite code submission
  async function handleSatelliteCodeSubmit() {
    if (satelliteCode.toLowerCase() === "allow") {
      satelliteDropdownEnabled = true
      showSatelliteInput = false
      satelliteCode = ""
      await saveSatelliteSettings()
      toast.success("Satellite imagery options enabled!")
    } else {
      toast.error("Invalid code. Please contact support for access.")
      satelliteCode = ""
    }
  }

  // Cancel satellite input
  function cancelSatelliteInput() {
    showSatelliteInput = false
    satelliteCode = ""
  }

  // Handle imagery provider checkbox changes
  async function handleImageryProviderToggle(providerKey) {
    if (enabledImageryProviders.includes(providerKey)) {
      enabledImageryProviders = enabledImageryProviders.filter(
        (key) => key !== providerKey,
      )
    } else {
      enabledImageryProviders = [...enabledImageryProviders, providerKey]
    }

    // If the current default is being disabled, reset to mapbox
    if (
      !enabledImageryProviders.includes(defaultImagerySource) &&
      defaultImagerySource !== "mapbox"
    ) {
      defaultImagerySource = "mapbox"
    }

    await saveSatelliteSettings()
  }

  // Handle default imagery source change
  async function handleDefaultImageryChange(event) {
    defaultImagerySource = event.target.value
    await saveSatelliteSettings()
  }

  // Save marker limit setting
  async function saveMarkerLimitSetting() {
    saving = true
    const userId = $session?.user?.id

    if (!userId) {
      toast.error("User not authenticated")
      saving = false
      return
    }

    try {
      const limitMarkersOn = selectedDays > 0

      const { error } = await supabase.from("user_settings").upsert(
        {
          user_id: userId,
          limit_markers: limitMarkersOn,
          limit_markers_days: selectedDays,
        },
        { onConflict: "user_id" },
      )

      if (error) {
        console.error("Error saving marker limit settings:", error)
        toast.error("Failed to save marker limit settings")
        saving = false
        return
      }

      const newDate = calculateDateFromDays(selectedDays)
      userSettingsStore.update((settings) => ({
        ...settings,
        limitMarkersOn: limitMarkersOn,
        limitMarkersDays: selectedDays,
        limitMarkersDate: newDate,
      }))

      toast.success("Marker display settings updated")
    } catch (err) {
      console.error("Unexpected error saving marker limit settings:", err)
      toast.error("An error occurred")
    } finally {
      saving = false
    }
  }

  // Save zoom settings
  async function saveZoomSettings() {
    saving = true
    const userId = $session?.user?.id

    if (!userId) {
      toast.error("User not authenticated")
      saving = false
      return
    }

    try {
      const { error } = await supabase.from("user_settings").upsert(
        {
          user_id: userId,
          zoom_to_location_markers: zoomToLocationMarkers,
          zoom_to_placed_markers: zoomToPlacedMarkers,
        },
        { onConflict: "user_id" },
      )

      if (error) {
        console.error("Error saving zoom settings:", error)
        toast.error("Failed to save zoom settings")
        saving = false
        return
      }

      userSettingsStore.update((settings) => ({
        ...settings,
        zoomToLocationMarkers: zoomToLocationMarkers,
        zoomToPlacedMarkers: zoomToPlacedMarkers,
      }))

      toast.success("Zoom settings updated")
    } catch (err) {
      console.error("Unexpected error saving zoom settings:", err)
      toast.error("An error occurred")
    } finally {
      saving = false
    }
  }

  // Save satellite settings
  async function saveSatelliteSettings() {
    saving = true
    const userId = $session?.user?.id

    if (!userId) {
      toast.error("User not authenticated")
      saving = false
      return
    }

    try {
      const { error } = await supabase.from("user_settings").upsert(
        {
          user_id: userId,
          satellite_dropdown_enabled: satelliteDropdownEnabled,
          enabled_imagery_providers: enabledImageryProviders,
          default_imagery_source: defaultImagerySource,
        },
        { onConflict: "user_id" },
      )

      if (error) {
        console.error("Error saving satellite settings:", error)
        toast.error("Failed to save satellite settings")
        saving = false
        return
      }

      userSettingsStore.update((settings) => ({
        ...settings,
        satelliteDropdownEnabled: satelliteDropdownEnabled,
        enabledImageryProviders: enabledImageryProviders,
        defaultImagerySource: defaultImagerySource,
      }))

      toast.success("Satellite imagery settings updated")
    } catch (err) {
      console.error("Unexpected error saving satellite settings:", err)
      toast.error("An error occurred")
    } finally {
      saving = false
    }
  }

  // Initialize from store
  $: if ($userSettingsStore) {
    // Initialize marker limit settings
    if ($userSettingsStore.limitMarkersOn) {
      selectedDays = $userSettingsStore.limitMarkersDays || 7
    } else {
      selectedDays = 0
    }

    // Initialize zoom settings with fallbacks
    zoomToLocationMarkers = $userSettingsStore.zoomToLocationMarkers ?? true
    zoomToPlacedMarkers = $userSettingsStore.zoomToPlacedMarkers ?? true

    // Initialize satellite settings
    satelliteDropdownEnabled =
      $userSettingsStore.satelliteDropdownEnabled ?? false
    enabledImageryProviders = $userSettingsStore.enabledImageryProviders ?? []
    defaultImagerySource = $userSettingsStore.defaultImagerySource ?? "mapbox"
  }

  onMount(() => {
    if ($userSettingsStore) {
      // Initialize marker limit settings
      if ($userSettingsStore.limitMarkersOn) {
        selectedDays = $userSettingsStore.limitMarkersDays || 7
      } else {
        selectedDays = 0
      }

      // Initialize zoom settings with fallbacks
      zoomToLocationMarkers = $userSettingsStore.zoomToLocationMarkers ?? true
      zoomToPlacedMarkers = $userSettingsStore.zoomToPlacedMarkers ?? true

      // Initialize satellite settings
      satelliteDropdownEnabled =
        $userSettingsStore.satelliteDropdownEnabled ?? false
      enabledImageryProviders = $userSettingsStore.enabledImageryProviders ?? []
      defaultImagerySource = $userSettingsStore.defaultImagerySource ?? "mapbox"
    }
  })
</script>

<svelte:head>
  <title>Map Preferences</title>
</svelte:head>

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
  <!-- Connected Map Status -->
  <div>
    <h3 class="mb-3 flex items-center gap-2 font-medium text-contrast-content">
      <div class="rounded-lg bg-base-content/10 p-1.5">
        <Icon
          icon="solar:map-bold-duotone"
          width="16"
          height="16"
          class="text-base-content"
        />
      </div>
      Connected Map
    </h3>

    {#if isConnected}
      <div class="rounded-lg border border-base-300 bg-base-200/30 p-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="rounded-full bg-success p-2">
              <Icon
                icon="solar:check-circle-bold"
                width="16"
                height="16"
                class="text-white"
              />
            </div>
            <div>
              <p class="font-medium text-contrast-content">{mapName}</p>
              <p class="text-sm text-contrast-content/60">
                Owned by {mapOwner}
              </p>
              <p class="text-xs text-contrast-content/40">
                Last sync: {lastSync.toLocaleTimeString()}
              </p>
            </div>
          </div>
        </div>
      </div>
    {:else}
      <div class="rounded-lg border border-base-300 bg-base-200/30 p-4">
        <div class="flex items-center gap-3">
          <div class="rounded-full bg-error p-2">
            <Icon
              icon="solar:close-circle-bold"
              width="16"
              height="16"
              class="text-white"
            />
          </div>
          <div>
            <p class="font-medium text-contrast-content">No Map Connected</p>
            <p class="text-sm text-contrast-content/60">
              Connect to a map to view data
            </p>
          </div>
        </div>
      </div>
    {/if}
  </div>

  <!-- Satellite Imagery Settings -->
  <div>
    <h3 class="mb-3 flex items-center gap-2 font-medium text-contrast-content">
      <div class="rounded-lg bg-base-content/10 p-1.5">
        <Icon
          icon="solar:satellite-bold-duotone"
          width="16"
          height="16"
          class="text-base-content"
        />
      </div>
      Satellite Imagery
    </h3>

    <div class="space-y-4">
      <!-- Satellite Dropdown Toggle -->
      <div class="rounded-lg border border-base-300 bg-base-200/30 p-4">
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <div class="flex items-start gap-3">
              <div class="rounded-lg bg-base-content/10 p-2">
                <Icon
                  icon="solar:layers-bold-duotone"
                  width="18"
                  height="18"
                  class="text-base-content"
                />
              </div>
              <div>
                <p class="font-medium text-contrast-content">
                  Advanced Imagery Options
                </p>
                <p class="text-sm text-contrast-content/60">
                  Enable additional satellite imagery providers and NDVI
                  analysis
                </p>
                {#if satelliteDropdownEnabled}
                  <p class="mt-1 text-xs text-success">Feature enabled</p>
                {:else}
                  <p class="mt-1 text-xs text-contrast-content/40">
                    Feature disabled - requires access code
                  </p>
                {/if}
              </div>
            </div>
            <button
              class="btn btn-sm {satelliteDropdownEnabled
                ? 'btn-error'
                : 'btn-primary'}"
              on:click={handleSatelliteDropdownToggle}
              disabled={saving}
            >
              {satelliteDropdownEnabled ? "Disable" : "Enable"}
            </button>
          </div>

          <!-- Satellite Code Input -->
          {#if showSatelliteInput}
            <div class="rounded-lg border border-primary/20 bg-primary/5 p-4">
              <div class="space-y-3">
                <p class="text-sm font-medium text-contrast-content">
                  Enter access code to enable advanced imagery features:
                </p>
                <div class="flex gap-2">
                  <input
                    type="text"
                    class="input input-bordered flex-1"
                    placeholder="Enter access code"
                    bind:value={satelliteCode}
                    on:keydown={(e) =>
                      e.key === "Enter" && handleSatelliteCodeSubmit()}
                  />
                  <button
                    class="btn btn-primary"
                    on:click={handleSatelliteCodeSubmit}
                    disabled={!satelliteCode.trim()}
                  >
                    Submit
                  </button>
                  <button class="btn btn-ghost" on:click={cancelSatelliteInput}>
                    Cancel
                  </button>
                </div>
                <p class="text-xs text-contrast-content/60">
                  Contact support if you need an access code for advanced
                  imagery features.
                </p>
              </div>
            </div>
          {/if}

          <!-- Imagery Provider Selection -->
          {#if satelliteDropdownEnabled}
            <div class="space-y-4">
              <div class="rounded-lg border border-info/20 bg-info/5 p-4">
                <div class="flex items-start gap-3">
                  <Icon
                    icon="solar:info-circle-bold-duotone"
                    width="20"
                    height="20"
                    class="mt-0.5 text-info"
                  />
                  <div>
                    <p class="text-sm font-medium text-contrast-content">
                      Select Available Imagery Sources
                    </p>
                    <p class="mt-1 text-xs text-contrast-content/60">
                      Choose which satellite imagery providers appear in your
                      map dropdown menu. Mapbox Satellite is always available.
                    </p>
                  </div>
                </div>
              </div>

              <!-- Provider Checkboxes -->
              <div class="grid gap-3 sm:grid-cols-2">
                {#each imageryProviders as provider}
                  <div
                    class="rounded-lg border border-base-300 bg-base-200/30 p-3"
                  >
                    <div class="flex items-center justify-between">
                      <div class="flex items-start gap-3">
                        <div class="rounded-lg bg-base-content/10 p-1.5">
                          <Icon
                            icon={provider.icon}
                            width="16"
                            height="16"
                            class="text-base-content"
                          />
                        </div>
                        <div>
                          <p class="text-sm font-medium text-contrast-content">
                            {provider.name}
                          </p>
                          <p class="text-xs text-contrast-content/60">
                            {provider.description}
                          </p>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        class="checkbox-primary checkbox"
                        checked={enabledImageryProviders.includes(provider.key)}
                        on:change={() =>
                          handleImageryProviderToggle(provider.key)}
                        disabled={saving}
                      />
                    </div>
                  </div>
                {/each}
              </div>

              <!-- Default Imagery Source Selection -->
              {#if enabledImageryProviders.length > 0}
                <div
                  class="rounded-lg border border-base-300 bg-base-200/30 p-4"
                >
                  <div class="space-y-3">
                    <div class="flex items-start gap-3">
                      <div class="rounded-lg bg-base-content/10 p-2">
                        <Icon
                          icon="solar:star-bold-duotone"
                          width="18"
                          height="18"
                          class="text-base-content"
                        />
                      </div>
                      <div>
                        <p class="font-medium text-contrast-content">
                          Default Imagery Source
                        </p>
                        <p class="text-sm text-contrast-content/60">
                          Choose which imagery source loads by default when
                          opening the map
                        </p>
                      </div>
                    </div>
                    <select
                      class="select select-bordered w-full"
                      value={defaultImagerySource}
                      on:change={handleDefaultImageryChange}
                      disabled={saving}
                    >
                      {#each availableDefaultOptions as option}
                        <option value={option.key}>
                          {option.name}
                        </option>
                      {/each}
                    </select>
                  </div>
                </div>
              {/if}
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>

  <!-- Map Interaction Settings -->
  <div>
    <h3 class="mb-3 flex items-center gap-2 font-medium text-contrast-content">
      <div class="rounded-lg bg-base-content/10 p-1.5">
        <Icon
          icon="solar:cursor-bold-duotone"
          width="16"
          height="16"
          class="text-base-content"
        />
      </div>
      Map Interaction
    </h3>

    <div class="space-y-4">
      <!-- Location marker zoom setting -->
      <div class="rounded-lg border border-base-300 bg-base-200/30 p-4">
        <div class="flex items-center justify-between">
          <div class="flex items-start gap-3">
            <div class="rounded-lg bg-base-content/10 p-2">
              <Icon
                icon="solar:gps-bold-duotone"
                width="18"
                height="18"
                class="text-base-content"
              />
            </div>
            <div>
              <p class="font-medium text-contrast-content">
                Zoom to location markers
              </p>
              <p class="text-sm text-contrast-content/60">
                Automatically zoom when dropping pins at your current location
              </p>
            </div>
          </div>
          <input
            type="checkbox"
            class="toggle toggle-primary"
            checked={zoomToLocationMarkers}
            on:change={handleLocationZoomToggle}
            disabled={saving}
          />
        </div>
      </div>

      <!-- Placed marker zoom setting -->
      <div class="rounded-lg border border-base-300 bg-base-200/30 p-4">
        <div class="flex items-center justify-between">
          <div class="flex items-start gap-3">
            <div class="rounded-lg bg-base-content/10 p-2">
              <Icon
                icon="solar:map-point-add-bold-duotone"
                width="18"
                height="18"
                class="text-base-content"
              />
            </div>
            <div>
              <p class="font-medium text-contrast-content">
                Zoom to placed markers
              </p>
              <p class="text-sm text-contrast-content/60">
                Automatically zoom when manually placing pins on the map
              </p>
            </div>
          </div>
          <input
            type="checkbox"
            class="toggle toggle-primary"
            checked={zoomToPlacedMarkers}
            on:change={handlePlacedZoomToggle}
            disabled={saving}
          />
        </div>
      </div>
    </div>
  </div>

  <!-- Marker Display Settings -->
  <div>
    <h3 class="mb-3 flex items-center gap-2 font-medium text-contrast-content">
      <div class="rounded-lg bg-base-content/10 p-1.5">
        <Icon
          icon="solar:history-bold-duotone"
          width="16"
          height="16"
          class="text-base-content"
        />
      </div>
      Marker Display
    </h3>

    <div class="space-y-4">
      <!-- Performance explanation -->
      <div class="rounded-lg border border-info/20 bg-info/5 p-4">
        <div class="flex items-start gap-3">
          <Icon
            icon="solar:info-circle-bold-duotone"
            width="20"
            height="20"
            class="mt-0.5 text-info"
          />
          <div>
            <p class="text-sm font-medium text-contrast-content">
              Improve map performance
            </p>
            <p class="mt-1 text-xs text-contrast-content/60">
              Limit markers by date to speed up loading and reduce lag when
              viewing the map.
            </p>
          </div>
        </div>
      </div>

      <!-- Marker limit selection -->
      <div class="rounded-lg border border-base-300 bg-base-200/30 p-4">
        <div class="space-y-4">
          <div>
            <label
              for="markerLimit"
              class="mb-2 block text-sm font-medium text-contrast-content"
            >
              Show markers from:
            </label>
            <select
              id="markerLimit"
              class="select select-bordered w-full"
              value={selectedDays}
              on:change={handleSelectionChange}
              disabled={saving}
            >
              {#each dayOptions as option}
                <option value={option.value}>
                  {option.label}
                </option>
              {/each}
            </select>
          </div>

          <!-- Description and date range display -->
          <div class="rounded-lg bg-base-200 p-3">
            <div class="text-sm font-medium text-contrast-content">
              {selectedOption?.description}
            </div>
            {#if showDateRange && displayDate}
              <div class="mt-2 text-xs text-contrast-content/60">
                Showing markers from <span class="font-semibold text-primary">
                  {displayDate}
                </span> to today
              </div>
            {/if}
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Saving indicator -->
  {#if saving}
    <div class="flex items-center justify-center">
      <div class="flex items-center gap-2 text-sm text-base-content/60">
        <span class="loading loading-spinner loading-sm"></span>
        Saving...
      </div>
    </div>
  {/if}

  <!-- Map Information -->
  <div class="rounded-lg border border-base-300 bg-base-200/10 p-4">
    <div class="flex items-start gap-3">
      <Icon
        icon="solar:info-circle-bold-duotone"
        width="20"
        height="20"
        class="mt-0.5 text-info"
      />
      <div>
        <p class="text-sm font-medium text-contrast-content">
          About Map Preferences
        </p>
        <p class="mt-1 text-xs text-contrast-content/60">
          These settings control how your map behaves and what data is
          displayed. Changes are applied instantly and will affect all map views
          throughout the application.
        </p>
      </div>
    </div>
  </div>
</div>
