<script>
  import { onMount } from "svelte"
  import { v4 as uuidv4 } from "uuid"
  import { supabase } from "$lib/supabaseClient"
  import {
    Plus,
    Link2,
    ChevronLeft,
    ChevronRight,
    Clock,
    User,
    Map,
  } from "lucide-svelte"

  export let currentView
  export let isLoading
  export let loadingAction
  export let userMaps
  export let recentMaps
  export let goBack
  export let handleCreateMap
  export let handleConnectToMap

  // Create map state
  let newMapName = ""
  let generatedMapId = uuidv4()

  // Connect state
  let enteredMapId = ""
  let isValidMapId = false

  // Map ID validation
  async function checkMapIdValidity() {
    if (!enteredMapId.trim()) {
      isValidMapId = false
      return
    }

    const { data: map, error } = await supabase
      .from("master_maps")
      .select("id")
      .eq("id", enteredMapId.trim())
      .single()

    isValidMapId = !error && map !== null
  }

  async function onCreateMap() {
    if (!newMapName.trim()) return

    const result = await handleCreateMap(newMapName, generatedMapId)
    if (result.success) {
      newMapName = ""
      generatedMapId = uuidv4()
    }
  }

  async function onConnectToMap(mapId) {
    await handleConnectToMap(mapId)
    enteredMapId = ""
  }
</script>

<div class="space-y-6">
  <!-- Back Button -->
  <button
    class="flex items-center gap-2 text-contrast-content/60 transition-colors hover:text-contrast-content"
    on:click={goBack}
  >
    <ChevronLeft class="h-4 w-4" />
    <span class="text-sm">Back</span>
  </button>

  {#if currentView === "create"}
    <!-- Create Map Form -->
    <form on:submit|preventDefault={onCreateMap} class="space-y-6">
      <div class="rounded-lg border border-base-300 bg-base-200 p-6">
        <div class="mb-4 flex items-center justify-center">
          <div
            class="flex h-16 w-16 items-center justify-center rounded-full bg-yellow-400/20"
          >
            <Map class="h-8 w-8 text-yellow-600" />
          </div>
        </div>
        <div class="text-center">
          <h4 class="text-lg font-semibold text-contrast-content">
            {newMapName || "New Map"}
          </h4>
          <div
            class="mt-2 inline-block rounded bg-base-300 px-2 py-1 font-mono text-xs text-contrast-content/60"
          >
            {generatedMapId}
          </div>
        </div>
      </div>

      <div>
        <label
          for="mapName"
          class="mb-1.5 block text-sm text-contrast-content/60"
        >
          Map Name
        </label>
        <input
          id="mapName"
          type="text"
          bind:value={newMapName}
          class="w-full rounded-lg border border-base-300 bg-base-200 p-3 text-contrast-content outline-none transition-colors focus:border-base-content"
          placeholder="Enter map name"
          required
        />
      </div>

      <button
        type="submit"
        disabled={isLoading}
        class="flex w-full items-center justify-center gap-2 rounded-lg bg-base-content px-6 py-3 font-medium text-base-100 transition-colors hover:bg-base-content/90 {isLoading
          ? 'cursor-not-allowed opacity-50'
          : ''}"
      >
        {#if isLoading && loadingAction === "create"}
          <div
            class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          ></div>
        {:else}
          <Plus class="h-4 w-4" />
        {/if}
        {isLoading && loadingAction === "create"
          ? "Creating Map..."
          : "Create Map"}
      </button>
    </form>
  {:else}
    <!-- Connect/Switch Map -->
    <!-- Manual Connect -->
    <div>
      <label for="mapId" class="mb-2 block text-sm text-contrast-content/60">
        Enter Map ID
      </label>
      <p class="mb-3 text-sm text-contrast-content/60">
        {currentView === "switch-map"
          ? "Enter a Map ID to switch to a different map."
          : "Paste the Map ID here to connect to an existing map."}
      </p>
      <div class="flex gap-2">
        <input
          id="mapId"
          type="text"
          bind:value={enteredMapId}
          on:input={checkMapIdValidity}
          class="flex-1 rounded-lg border border-base-300 bg-base-200 p-2.5 text-contrast-content outline-none transition-colors focus:border-base-content"
          placeholder="Map ID"
        />
        <button
          type="button"
          disabled={!isValidMapId || isLoading}
          class="flex items-center gap-2 rounded-lg bg-base-content px-5 py-2.5 font-medium text-base-100 transition-colors hover:bg-base-content/90 {!isValidMapId ||
          isLoading
            ? 'cursor-not-allowed opacity-50'
            : ''}"
          on:click={() => onConnectToMap(enteredMapId)}
        >
          {#if isLoading && loadingAction === `connect-${enteredMapId}`}
            <div
              class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
            ></div>
          {:else}
            <Link2 class="h-4 w-4" />
          {/if}
          {currentView === "switch-map" ? "Switch" : "Connect"}
        </button>
      </div>
    </div>

    <!-- Quick Connect Lists -->
    {#if recentMaps.length > 0 || userMaps.length > 0}
      <div class="space-y-4">
        {#if recentMaps.length > 0}
          <div>
            <h4
              class="mb-3 flex items-center gap-2 font-medium text-contrast-content"
            >
              <Clock class="h-4 w-4" />
              Recent Maps
            </h4>
            <div class="space-y-2">
              {#each recentMaps.slice(0, 5) as map}
                <button
                  class="group flex w-full items-center justify-between rounded-lg border border-base-300 bg-base-200 p-3 transition-colors hover:bg-base-300"
                  on:click={() => onConnectToMap(map.id)}
                  disabled={isLoading}
                >
                  <div class="text-left">
                    <div class="text-sm font-medium text-contrast-content">
                      {map.map_name}
                    </div>
                    <div class="text-xs text-contrast-content/60">
                      Owner: {map.owner_name}
                    </div>
                  </div>
                  {#if isLoading && loadingAction === `connect-${map.id}`}
                    <div
                      class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                    ></div>
                  {:else}
                    <ChevronRight
                      class="h-4 w-4 transition-transform group-hover:translate-x-1"
                    />
                  {/if}
                </button>
              {/each}
            </div>
          </div>
        {/if}

        {#if userMaps.length > 0}
          <div>
            <h4
              class="mb-3 flex items-center gap-2 font-medium text-contrast-content"
            >
              <User class="h-4 w-4" />
              Your Maps
            </h4>
            <div class="space-y-2">
              {#each userMaps.slice(0, 5) as map}
                <button
                  class="group flex w-full items-center justify-between rounded-lg border border-base-300 bg-base-200 p-3 transition-colors hover:bg-base-300"
                  on:click={() => onConnectToMap(map.id)}
                  disabled={isLoading}
                >
                  <div class="text-left">
                    <div class="text-sm font-medium text-contrast-content">
                      {map.map_name}
                    </div>
                    <div class="text-xs text-contrast-content/60">
                      You own this map
                    </div>
                  </div>
                  {#if isLoading && loadingAction === `connect-${map.id}`}
                    <div
                      class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                    ></div>
                  {:else}
                    <ChevronRight
                      class="h-4 w-4 transition-transform group-hover:translate-x-1"
                    />
                  {/if}
                </button>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    {/if}
  {/if}
</div>
