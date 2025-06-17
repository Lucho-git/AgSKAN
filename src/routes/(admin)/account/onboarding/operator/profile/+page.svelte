<!-- src/routes/(admin)/account/onboarding/operator/profile/+page.svelte -->
<script lang="ts">
  import { goto } from "$app/navigation"
  import { Map, User, Check, ArrowRight, Info } from "lucide-svelte"
  import { supabase } from "$lib/stores/sessionStore"
  import { profileStore } from "$lib/stores/profileStore"
  import { connectedMapStore } from "$lib/stores/connectedMapStore"
  import { mapActivityStore } from "$lib/stores/mapActivityStore"
  import {
    operationStore,
    selectedOperationStore,
  } from "$lib/stores/operationStore.js"
  import { toast } from "svelte-sonner"
  import { mapApi } from "$lib/api/mapApi"

  let formError: string | null = null
  let skipMapId = false
  let joinMapId = ""
  let isValidMapId = false
  let connectedMap: { id: string; map_name: string; owner: string } | null =
    null
  let isLoading = false
  let isJoiningMap = false
  let fullName = ""
  let exampleMapCode = ""

  // Form validation errors
  let errors = {
    fullName: "",
    mapId: "",
  }

  // Generate example map code similar to React version
  function generateExampleMapCode() {
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

  // Initialize example map code
  exampleMapCode = generateExampleMapCode()

  // Check if already connected to a map
  $: hasConnectedMap = $connectedMapStore?.id || connectedMap

  // Computed property for form validation
  $: isFormValid =
    fullName.trim().length > 0 && // Name must not be empty
    (skipMapId || hasConnectedMap) // Either skip map ID or have a connected map

  function handleInputChange(field: string, value: string | boolean) {
    if (field === "fullName") {
      fullName = value as string
    } else if (field === "mapId") {
      let formattedValue = value as string
      // Remove any non-alphanumeric characters except dashes
      formattedValue = formattedValue.replace(/[^a-zA-Z0-9-]/g, "")

      // Auto-add dashes in the right positions for UUID format
      if (formattedValue.length > joinMapId.length) {
        const positions = [8, 13, 18, 23]
        positions.forEach((pos) => {
          if (
            formattedValue.length > pos &&
            formattedValue.charAt(pos) !== "-" &&
            formattedValue.charAt(pos - 1) !== "-"
          ) {
            formattedValue =
              formattedValue.slice(0, pos) + "-" + formattedValue.slice(pos)
          }
        })
      }

      joinMapId = formattedValue
    } else if (field === "skipMapId") {
      skipMapId = value as boolean
    }

    // Clear error when user starts typing
    if (errors[field as keyof typeof errors]) {
      errors = { ...errors, [field]: "" }
    }
  }

  function validateForm() {
    const newErrors = {
      fullName: !fullName ? "Full name is required" : "",
      mapId: "", // Clear mapId error when we have a connected map
    }

    // Only validate mapId if we don't have a connected map and haven't skipped it
    if (!hasConnectedMap && !skipMapId) {
      newErrors.mapId = !joinMapId
        ? "Map ID is required unless you choose to add it later"
        : ""
    }

    errors = newErrors
    return !Object.values(newErrors).some((error) => error)
  }

  async function checkMapIdValidity() {
    if (!joinMapId) {
      isValidMapId = false
      return
    }

    const { data: map, error } = await supabase
      .from("master_maps")
      .select("id")
      .eq("id", joinMapId)
      .single()

    isValidMapId = !error && map !== null
  }

  async function handleJoinMap() {
    isJoiningMap = true
    formError = null

    try {
      const result = await mapApi.connectToMap(joinMapId)

      if (!result.success) {
        throw new Error(result.message || "Failed to join map")
      }

      connectedMap = {
        id: result.data.connectedMap.id,
        map_name: result.data.connectedMap.map_name,
        owner: result.data.connectedMap.owner,
      }

      connectedMapStore.set(result.data.connectedMap)
      mapActivityStore.set(result.data.mapActivity)

      if (result.data.operations && result.data.operations.length > 0) {
        operationStore.set(result.data.operations)

        if (result.data.operation) {
          selectedOperationStore.set(result.data.operation)
        }
      }

      toast.success("Successfully joined map")
    } catch (error) {
      formError = error.message || "Failed to join map"
      toast.error(formError)
    } finally {
      isJoiningMap = false
    }
  }

  async function handleContinue() {
    if (!validateForm()) {
      formError = "Please fill out all required fields"
      return
    }

    isLoading = true
    formError = null

    try {
      const updates = {
        full_name: fullName,
        role: "operator",
        updated_at: new Date().toISOString(),
      }

      if (hasConnectedMap) {
        const mapId = connectedMap?.id || $connectedMapStore.id

        const { data: operationData, error: operationError } = await supabase
          .from("operations")
          .select("id")
          .eq("master_map_id", mapId)
          .limit(1)
          .single()

        if (!operationError && operationData) {
          updates["selected_operation_id"] = operationData.id

          const { data: fullOperation } = await supabase
            .from("operations")
            .select("*")
            .eq("id", operationData.id)
            .single()

          if (fullOperation) {
            operationStore.set([fullOperation])
            selectedOperationStore.set(fullOperation)
          }
        }

        updates["master_map_id"] = mapId
      }

      const { error: updateError } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", $profileStore.id)

      if (updateError) {
        throw new Error("Failed to update profile")
      }

      profileStore.update((profile) => ({
        ...profile,
        full_name: fullName,
        user_type: "operator",
        master_map_id: hasConnectedMap
          ? connectedMap?.id || $connectedMapStore.id
          : null,
        selected_operation_id: updates["selected_operation_id"] || null,
      }))

      if (hasConnectedMap) {
        mapActivityStore.update((store) => {
          const updatedProfiles = store.connected_profiles.map((profile) => {
            if (profile.id === $profileStore.id) {
              return {
                ...profile,
                full_name: fullName,
              }
            }
            return profile
          })

          return {
            ...store,
            connected_profiles: updatedProfiles,
          }
        })
      }

      toast.success("Profile saved successfully!")
      goto("/account/onboarding/operator/operator_vehicle")
    } catch (error) {
      formError = error.message || "Failed to update profile"
      toast.error(formError)
    } finally {
      isLoading = false
    }
  }

  $: {
    if (joinMapId) {
      checkMapIdValidity()
    }
  }
</script>

<svelte:head>
  <title>Join Map - AgSKAN</title>
  <meta name="description" content="Connect to your farm's map" />
</svelte:head>

<!-- Header -->
<div class="mb-10 text-center">
  <h2 class="mb-3 text-4xl font-bold text-contrast-content">
    Join <span class="text-base-content">Map</span>
  </h2>
  <p class="mx-auto max-w-md text-contrast-content/60">
    Connect to your farm's map
  </p>
</div>

<!-- Error Alert -->
{#if formError}
  <div class="alert alert-error mb-6">
    <svg
      xmlns="http://www.w3.org/2000/svg"
      class="h-6 w-6 shrink-0 stroke-current"
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
    <span>{formError}</span>
  </div>
{/if}

{#if hasConnectedMap}
  <!-- Connected Map Card -->
  <div
    class="relative overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-xl"
  >
    <!-- Card header decoration -->
    <div
      class="h-1.5 w-full bg-gradient-to-r from-base-content/80 via-base-content to-base-content/80"
    ></div>

    <div class="p-8 md:p-10">
      <!-- Connected Map Info -->
      <div class="mb-8 rounded-xl bg-base-200 p-6">
        <div class="mb-3 flex items-center gap-3">
          <div class="rounded-md bg-base-content/20 p-2 text-base-content">
            <Map size={20} />
          </div>
          <h3 class="text-lg font-semibold text-contrast-content">
            Connected Map
          </h3>
        </div>
        <p class="font-medium text-contrast-content">
          {$connectedMapStore?.map_name || connectedMap?.map_name}
        </p>
        <p class="text-sm text-contrast-content/60">
          Owned by {$connectedMapStore?.owner || connectedMap?.owner}
        </p>
      </div>

      <!-- Full Name Input -->
      <div class="space-y-2">
        <label
          class="mb-2 flex items-center gap-2 text-sm font-medium text-contrast-content/80"
        >
          <div class="rounded-md bg-base-200 p-1.5 text-base-content">
            <User size={16} />
          </div>
          Full Name
        </label>
        <div
          class="relative transition-all duration-300 {errors.fullName
            ? 'animate-shake'
            : ''}"
        >
          <input
            type="text"
            placeholder="Enter your full name"
            bind:value={fullName}
            on:input={(e) => handleInputChange("fullName", e.target.value)}
            class="w-full border bg-base-200 {errors.fullName
              ? 'border-error'
              : 'border-base-300 focus:border-base-content'} rounded-xl p-4 text-contrast-content transition-colors placeholder:text-contrast-content/50 focus:outline-none focus:ring-1 focus:ring-base-content"
            required
          />
          {#if errors.fullName}
            <p class="ml-1 mt-1.5 flex items-center gap-1.5 text-xs text-error">
              <span class="inline-block h-1 w-1 rounded-full bg-error"></span>
              {errors.fullName}
            </p>
          {/if}
        </div>
      </div>

      <!-- Continue Button -->
      <div class="mt-10 flex flex-col items-center">
        <button
          on:click={handleContinue}
          disabled={!fullName.trim() || isLoading}
          class="flex w-full transform items-center justify-center gap-2 rounded-xl bg-base-content py-4 font-semibold text-base-100 shadow-lg shadow-base-content/20 transition-all hover:-translate-y-0.5 hover:bg-base-content/90 disabled:transform-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          {#if isLoading}
            <span class="loading loading-spinner"></span>
          {:else}
            <span>Continue to Vehicle Selection</span>
            <ArrowRight
              size={18}
              class="transition-transform group-hover:translate-x-1"
            />
          {/if}
        </button>
      </div>
    </div>
  </div>
{:else}
  <!-- Join Map Form -->
  <div
    class="relative overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-xl"
  >
    <!-- Card header decoration -->
    <div
      class="h-1.5 w-full bg-gradient-to-r from-base-content/80 via-base-content to-base-content/80"
    ></div>

    <div class="p-8 md:p-10">
      <div class="grid gap-8">
        <!-- Full Name -->
        <div class="space-y-2">
          <label
            class="mb-2 flex items-center gap-2 text-sm font-medium text-contrast-content/80"
          >
            <div class="rounded-md bg-base-200 p-1.5 text-base-content">
              <User size={16} />
            </div>
            Full Name
          </label>
          <div
            class="relative transition-all duration-300 {errors.fullName
              ? 'animate-shake'
              : ''}"
          >
            <input
              type="text"
              placeholder="Enter your full name"
              bind:value={fullName}
              on:input={(e) => handleInputChange("fullName", e.target.value)}
              class="w-full border bg-base-200 {errors.fullName
                ? 'border-error'
                : 'border-base-300 focus:border-base-content'} rounded-xl p-4 text-contrast-content transition-colors placeholder:text-contrast-content/50 focus:outline-none focus:ring-1 focus:ring-base-content"
              required
            />
            {#if errors.fullName}
              <p
                class="ml-1 mt-1.5 flex items-center gap-1.5 text-xs text-error"
              >
                <span class="inline-block h-1 w-1 rounded-full bg-error"></span>
                {errors.fullName}
              </p>
            {/if}
          </div>
        </div>

        <!-- Map ID -->
        {#if !skipMapId}
          <div class="space-y-2">
            <label
              class="mb-2 flex items-center gap-2 text-sm font-medium text-contrast-content/80"
            >
              <div class="rounded-md bg-base-200 p-1.5 text-base-content">
                <Map size={16} />
              </div>
              Map ID
            </label>
            <div
              class="relative transition-all duration-300 {errors.mapId
                ? 'animate-shake'
                : ''}"
            >
              <div class="space-y-2">
                <div class="flex gap-2">
                  <input
                    type="text"
                    placeholder="Enter map ID"
                    bind:value={joinMapId}
                    on:input={(e) => {
                      handleInputChange("mapId", e.target.value)
                      checkMapIdValidity()
                    }}
                    class="flex-1 border bg-base-200 {errors.mapId
                      ? 'border-error'
                      : 'border-base-300 focus:border-base-content'} rounded-xl p-4 text-contrast-content transition-colors placeholder:text-contrast-content/50 focus:outline-none focus:ring-1 focus:ring-base-content"
                    required={!skipMapId}
                  />
                  <button
                    type="button"
                    on:click={handleJoinMap}
                    disabled={!isValidMapId || isJoiningMap}
                    class="rounded-xl border border-base-300 bg-base-200 px-6 py-4 font-semibold transition-all {!isValidMapId ||
                    isJoiningMap
                      ? 'cursor-not-allowed text-contrast-content/50'
                      : 'text-base-content hover:border-base-content/40 hover:bg-base-content/10'}"
                  >
                    {#if isJoiningMap}
                      <span class="loading loading-spinner loading-sm"></span>
                    {:else}
                      Join
                    {/if}
                  </button>
                </div>

                <!-- Example Map Code -->
                <div class="ml-1 flex items-center gap-2">
                  <div class="text-xs text-info">
                    <Info size={14} />
                  </div>
                  <div class="text-xs text-contrast-content/60">
                    Example format: <span
                      class="rounded-md bg-info/10 px-2 py-0.5 font-mono text-info/80"
                      >{exampleMapCode}</span
                    >
                  </div>
                </div>
              </div>

              {#if joinMapId && !isValidMapId}
                <p
                  class="ml-1 mt-1.5 flex items-center gap-1.5 text-xs text-error"
                >
                  <span class="inline-block h-1 w-1 rounded-full bg-error"
                  ></span>
                  Invalid Map ID
                </p>
              {/if}
              {#if errors.mapId}
                <p
                  class="ml-1 mt-1.5 flex items-center gap-1.5 text-xs text-error"
                >
                  <span class="inline-block h-1 w-1 rounded-full bg-error"
                  ></span>
                  {errors.mapId}
                </p>
              {/if}
            </div>
          </div>
        {/if}

        <!-- Skip Map ID Checkbox -->
        <div class="flex items-start gap-3">
          <div class="flex h-6 items-center pt-1">
            <label class="cursor-pointer">
              <input
                type="checkbox"
                bind:checked={skipMapId}
                on:change={(e) =>
                  handleInputChange("skipMapId", e.target.checked)}
                class="sr-only"
              />
              <div
                class="flex h-5 w-5 items-center justify-center rounded-md transition-all
                {skipMapId
                  ? 'bg-base-content text-base-100'
                  : 'border border-base-300 bg-base-200 hover:border-base-content/50'}"
              >
                {#if skipMapId}
                  <Check size={14} />
                {/if}
              </div>
            </label>
          </div>
          <label class="cursor-pointer text-sm text-base-content">
            I'll add my map ID later
          </label>
        </div>
      </div>

      <!-- Form Actions -->
      <div class="mt-10 flex flex-col items-center">
        <button
          type="button"
          on:click={handleContinue}
          disabled={!isFormValid || isLoading}
          class="flex w-full transform items-center justify-center gap-2 rounded-xl bg-base-content py-4 font-semibold text-base-100 shadow-lg shadow-base-content/10 transition-all hover:-translate-y-0.5 hover:bg-base-content/90 hover:shadow-base-content/20 disabled:transform-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          {#if isLoading}
            <span class="loading loading-spinner"></span>
          {:else}
            <span>Continue to Vehicle Selection</span>
            <ArrowRight
              size={18}
              class="transition-transform group-hover:translate-x-1"
            />
          {/if}
        </button>

        <div
          class="mt-6 flex items-center gap-2 text-xs text-contrast-content/40"
        >
          <Map size={14} />
          <span>You can always connect to a map later from your dashboard</span>
        </div>
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
</style>
