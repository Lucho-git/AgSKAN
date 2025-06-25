<!-- MarkerFilterSettings.svelte -->
<script lang="ts">
  import { onMount } from "svelte"
  import { userSettingsStore } from "$lib/stores/userSettingsStore"
  import { supabase } from "$lib/stores/sessionStore"
  import { session } from "$lib/stores/sessionStore"
  import { toast } from "svelte-sonner"

  // Preset options for days
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

  let selectedDays = 0 // 0 means no limit (show all)
  let hasChanges = false
  let saving = false

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
    if (days === 0) return null // No limit
    const date = new Date()
    date.setDate(date.getDate() - days)
    return date.toISOString()
  }

  // Handle selection change
  function handleSelectionChange(event) {
    selectedDays = parseInt(event.target.value)
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
      const limitMarkersOn = selectedDays > 0

      // Update the database
      const { error } = await supabase.from("user_settings").upsert(
        {
          user_id: userId,
          limit_markers: limitMarkersOn,
          limit_markers_days: selectedDays,
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
      const newDate = calculateDateFromDays(selectedDays)
      userSettingsStore.update((settings) => ({
        ...settings,
        limitMarkersOn: limitMarkersOn,
        limitMarkersDays: selectedDays,
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

  // Get display info for selected option
  $: selectedOption = dayOptions.find((option) => option.value === selectedDays)
  $: showDateRange = selectedDays > 0
  $: displayDate = showDateRange
    ? formatDate(calculateDateFromDays(selectedDays))
    : null

  // Initialize from store
  $: if ($userSettingsStore && !hasChanges) {
    if ($userSettingsStore.limitMarkersOn) {
      selectedDays = $userSettingsStore.limitMarkersDays || 7
    } else {
      selectedDays = 0 // Show all
    }
  }

  onMount(() => {
    if ($userSettingsStore) {
      if ($userSettingsStore.limitMarkersOn) {
        selectedDays = $userSettingsStore.limitMarkersDays || 7
      } else {
        selectedDays = 0
      }
    }
  })
</script>

<div class="card mt-8 flex max-w-xl flex-col p-6 pb-7 shadow md:flex-row">
  <div class="mb-3 w-48 flex-none text-xl font-bold">Map Performance</div>

  <div class="w-full min-w-48">
    <div class="form-widget flex flex-col">
      <!-- Performance explanation with better styling -->
      <div class="mb-4 rounded-lg border border-info/20 bg-info/5 p-3">
        <div class="flex items-start gap-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="mt-0.5 h-5 w-5 flex-shrink-0 text-info"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fill-rule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
              clip-rule="evenodd"
            />
          </svg>
          <div>
            <div class="mb-1 text-sm font-medium text-info">
              Improve map performance
            </div>
            <div class="text-xs text-base-content/70">
              Limit markers by date to <span class="font-medium"
                >speed up loading</span
              >
              and
              <span class="font-medium">reduce lag</span> when viewing the map.
            </div>
          </div>
        </div>
      </div>

      <div class="mb-4">
        <label for="markerLimit" class="mb-2 block text-sm font-medium">
          Show markers from:
        </label>
        <select
          id="markerLimit"
          class="select select-bordered w-full"
          value={selectedDays}
          on:change={handleSelectionChange}
        >
          {#each dayOptions as option}
            <option value={option.value}>
              {option.label}
            </option>
          {/each}
        </select>
      </div>

      <!-- Description and date range display -->
      <div class="mb-4 rounded-lg bg-base-200 p-3">
        <div class="text-sm font-medium text-base-content">
          {selectedOption?.description}
        </div>
        {#if showDateRange && displayDate}
          <div class="mt-2 text-xs text-base-content/70">
            Showing markers from <span class="font-semibold text-primary">
              {displayDate}
            </span> to today
          </div>
        {/if}
      </div>

      <!-- Save button with ghost styling -->
      <div class="flex justify-start">
        <button
          type="button"
          class="btn btn-ghost btn-sm min-w-[120px] {hasChanges
            ? 'btn-outline'
            : 'opacity-50'}"
          disabled={!hasChanges || saving}
          on:click={saveChanges}
        >
          {#if saving}
            <span class="loading loading-spinner loading-sm"></span>
            Saving...
          {:else}
            Save Changes
          {/if}
        </button>
      </div>
    </div>
  </div>
</div>
