<!-- MarkerFilterSettings.svelte -->
<script lang="ts">
  import { onMount } from "svelte"
  import { userSettingsStore } from "$lib/stores/userSettingsStore"
  import { Slider } from "$lib/components/ui/slider"
  import { Button } from "$lib/components/ui/button"
  import { supabase } from "$lib/stores/sessionStore"
  import { session } from "$lib/stores/sessionStore"
  import { toast } from "svelte-sonner"

  // Marker filter settings
  const minDays = 1
  const maxDays = 365 // Updated to 365 days (1 year)

  // Local days value for the slider
  let sliderValue = 7
  let limitMarkersOn = false
  let hasChanges = false
  let saving = false

  // Define preset markers for the slider
  const presetMarkers = [
    { days: 1, label: "1 day" },
    { days: 7, label: "1 week" },
    { days: 30, label: "1 month" },
    { days: 90, label: "3 months" },
    { days: 180, label: "6 months" },
    { days: 365, label: "1 year" },
  ]

  // Format date for display
  function formatDate(dateString) {
    const date = new Date(dateString)
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  }

  // Calculate date based on slider value
  function calculateDateFromSlider(days) {
    const date = new Date()
    date.setDate(date.getDate() - days)
    return date.toISOString()
  }

  // Track slider changes but don't update store yet
  function handleSliderChange(value) {
    const days = value[0]
    sliderValue = days
    hasChanges = true
  }

  // Increment and decrement functions - optimized
  function incrementDays() {
    if (sliderValue < maxDays) {
      sliderValue = Math.min(maxDays, sliderValue + 1)
      hasChanges = true
    }
  }

  function decrementDays() {
    if (sliderValue > minDays) {
      sliderValue = Math.max(minDays, sliderValue - 1)
      hasChanges = true
    }
  }

  // Toggle the marker filter on/off - only local state
  function toggleLimitMarkers() {
    limitMarkersOn = !limitMarkersOn
    hasChanges = true
  }

  // Save changes to store and database
  async function saveChanges() {
    saving = true
    const userId = $session?.user?.id

    if (!userId) {
      toast.error("User not authenticated")
      saving = false
      return
    }

    try {
      // Update the database
      const { error } = await supabase.from("user_settings").upsert(
        {
          user_id: userId,
          limit_markers: limitMarkersOn,
          limit_markers_days: sliderValue,
        },
        { onConflict: "user_id" },
      )

      if (error) {
        console.error("Error saving settings:", error)
        toast.error("Failed to save settings")
        saving = false
        return
      }

      // Update the store with calculated date
      const newDate = calculateDateFromSlider(sliderValue)
      userSettingsStore.update((settings) => ({
        ...settings,
        limitMarkersOn: limitMarkersOn,
        limitMarkersDays: sliderValue,
        limitMarkersDate: newDate,
      }))

      toast.success("Settings saved successfully")
      hasChanges = false
    } catch (err) {
      console.error("Unexpected error saving settings:", err)
      toast.error("An error occurred")
    } finally {
      saving = false
    }
  }

  // Computed date based on current sliderValue - this avoids unnecessary calculations
  $: displayDate = formatDate(calculateDateFromSlider(sliderValue))

  // Initialize local values from store
  $: if ($userSettingsStore && !hasChanges) {
    // Only update from store if user hasn't made changes
    sliderValue = $userSettingsStore.limitMarkersDays || 7
    limitMarkersOn = $userSettingsStore.limitMarkersOn || false
  }

  onMount(() => {
    // Initialize slider value from store
    if ($userSettingsStore) {
      sliderValue = $userSettingsStore.limitMarkersDays || 7
      limitMarkersOn = $userSettingsStore.limitMarkersOn || false
    }
  })
</script>

<!-- Updated with consistent styling to match SettingsModule -->
<div class="card mt-8 flex max-w-xl flex-col p-6 pb-7 shadow md:flex-row">
  <div class="mb-3 w-48 flex-none text-xl font-bold">Map Markers</div>

  <div class="w-full min-w-48">
    <div class="form-widget flex flex-col">
      <!-- Toggle for marker filter -->
      <div class="mb-4 flex items-center">
        <input
          type="checkbox"
          id="limitMarkersToggle"
          class="checkbox-primary checkbox"
          checked={limitMarkersOn}
          on:change={toggleLimitMarkers}
        />
        <label for="limitMarkersToggle" class="ml-2 text-base">
          Only show markers from the last {sliderValue}
          day{sliderValue !== 1 ? "s" : ""}
        </label>
      </div>

      <div class={limitMarkersOn ? "" : "pointer-events-none opacity-50"}>
        <!-- Slider with preset labels -->
        <div class="mb-1 flex justify-between text-xs text-gray-500">
          {#each presetMarkers as marker}
            <span>{marker.label}</span>
          {/each}
        </div>

        <Slider
          value={[sliderValue]}
          onValueChange={handleSliderChange}
          min={minDays}
          max={maxDays}
          step={1}
          class="w-full"
        />

        <!-- Increment/Decrement Buttons - Simplified and optimized -->
        <div class="mt-2 flex justify-center gap-3">
          <button
            type="button"
            class="btn btn-circle btn-outline btn-sm"
            disabled={sliderValue <= minDays || saving}
            on:click|preventDefault={decrementDays}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-4 w-4"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fill-rule="evenodd"
                d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
                clip-rule="evenodd"
              />
            </svg>
          </button>

          <div class="flex items-center font-medium">
            {sliderValue} day{sliderValue !== 1 ? "s" : ""}
          </div>

          <button
            type="button"
            class="btn btn-circle btn-outline btn-sm"
            disabled={sliderValue >= maxDays || saving}
            on:click|preventDefault={incrementDays}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-4 w-4"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fill-rule="evenodd"
                d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
                clip-rule="evenodd"
              />
            </svg>
          </button>
        </div>

        <div class="mt-3 text-center text-sm">
          Showing markers from <span class="font-semibold text-primary"
            >{displayDate}</span
          > to today
        </div>

        <!-- Save button - now with ghost style and more spacing -->
        <div class="mt-5">
          <button
            type="button"
            class="btn btn-outline btn-sm min-w-[145px] {hasChanges
              ? ''
              : 'opacity-50'}"
            disabled={!hasChanges || saving}
            on:click={saveChanges}
          >
            {#if saving}
              <span class="loading loading-spinner loading-md mx-3 align-middle"
              ></span>
            {:else}
              Save Changes
            {/if}
          </button>
        </div>
      </div>
    </div>
  </div>
</div>
