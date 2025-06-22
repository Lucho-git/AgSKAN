<script>
  import {
    Map,
    Settings,
    Plus,
    Pencil,
    UserPlus,
    MapPin,
    Copy,
    Check,
  } from "lucide-svelte"

  export let currentView
  export let isConnected
  export let isOwner
  export let connectedMap
  export let operations
  export let selectedOperation
  export let handleOperationSelect
  export let isLoading
  export let loadingAction

  // Copy state
  let copied = false

  function copyMapId() {
    if (connectedMap?.id) {
      navigator.clipboard.writeText(connectedMap.id)
      copied = true
      setTimeout(() => (copied = false), 2000)
    }
  }
</script>

{#if isConnected}
  {#if currentView === "main" || currentView === "operations"}
    <!-- Main Menu Display - Show Map + Operation -->
    <!-- Mobile Compact View -->
    <div class="md:hidden">
      <!-- Map Section -->
      <div class="bg-base-200/50 p-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div
              class="flex h-8 w-8 items-center justify-center rounded-full bg-green-100"
            >
              <Map class="h-4 w-4 text-green-600" />
            </div>
            <div>
              <h3 class="text-sm font-bold text-contrast-content">
                {connectedMap.map_name}
              </h3>
              <div class="flex items-center gap-1 text-xs text-green-600">
                <div class="h-1.5 w-1.5 rounded-full bg-green-500"></div>
                <span>Connected</span>
              </div>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span
              class="rounded bg-base-content/10 px-2 py-1 text-xs text-contrast-content/60"
            >
              {isOwner ? "Owner" : "Member"}
            </span>
            <button
              class="rounded p-1.5 transition-colors hover:bg-base-300"
              on:click={copyMapId}
            >
              {#if copied}
                <Check class="h-3 w-3 text-green-500" />
              {:else}
                <Copy class="h-3 w-3 text-contrast-content/60" />
              {/if}
            </button>
          </div>
        </div>
      </div>

      <!-- Operation Section with Dropdown -->
      {#if operations && operations.length > 0}
        <div class="border-t border-base-300 bg-base-200/30 p-4">
          <div class="flex items-center gap-2">
            <MapPin class="h-3 w-3 text-contrast-content/60" />
            <select
              class="cursor-pointer rounded border border-base-300 bg-base-100 p-1 text-xs font-medium text-contrast-content"
              value={selectedOperation?.id}
              on:change={(e) => handleOperationSelect(e.target.value)}
              disabled={isLoading && loadingAction.startsWith("select-")}
            >
              {#each operations as operation}
                <option value={operation.id}>
                  {operation.name} ({operation.year})
                </option>
              {/each}
            </select>
          </div>
        </div>
      {/if}
    </div>

    <!-- Desktop Full View -->
    <div class="hidden space-y-4 p-6 md:block">
      <!-- Map Section -->
      <div class="text-center">
        <div
          class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100"
        >
          <Map class="h-6 w-6 text-green-600" />
        </div>
        <h3 class="font-bold text-contrast-content">{connectedMap.map_name}</h3>
        <p class="text-sm text-contrast-content/60">
          Owner: {connectedMap.owner}
        </p>
      </div>

      <!-- Current Operation with Dropdown -->
      {#if operations && operations.length > 0}
        <div class="rounded-lg bg-base-200 p-3">
          <div class="mb-2 flex items-center gap-2">
            <MapPin class="h-4 w-4 text-contrast-content/60" />
            <span class="text-xs text-contrast-content/60"
              >Current Operation</span
            >
          </div>
          <select
            class="w-full rounded-lg border border-base-300 bg-base-100 p-2 text-sm text-contrast-content outline-none transition-colors focus:border-base-content"
            value={selectedOperation?.id}
            on:change={(e) => handleOperationSelect(e.target.value)}
            disabled={isLoading && loadingAction.startsWith("select-")}
          >
            {#each operations as operation}
              <option value={operation.id}>
                {operation.name} ({operation.year})
              </option>
            {/each}
          </select>
          {#if selectedOperation?.description}
            <div class="mt-2 text-xs text-contrast-content/60">
              {selectedOperation.description}
            </div>
          {/if}
        </div>
      {/if}

      <!-- Map ID -->
      <div class="rounded-lg bg-base-200 p-3">
        <div class="mb-1 flex items-center justify-between">
          <span class="text-xs text-contrast-content/60">Map ID</span>
          <button
            class="text-xs transition-colors hover:text-contrast-content"
            on:click={copyMapId}
          >
            {#if copied}
              <Check class="h-3 w-3 text-green-500" />
            {:else}
              <Copy class="h-3 w-3" />
            {/if}
          </button>
        </div>
        <code class="break-all font-mono text-xs text-contrast-content/80"
          >{connectedMap.id}</code
        >
      </div>

      <!-- Status Indicators -->
      <div class="space-y-2">
        <div class="flex items-center justify-between text-sm">
          <span class="text-contrast-content/60">Status</span>
          <div class="flex items-center gap-1">
            <div class="h-2 w-2 rounded-full bg-green-500"></div>
            <span class="font-medium text-green-600">Connected</span>
          </div>
        </div>

        <div class="flex items-center justify-between text-sm">
          <span class="text-contrast-content/60">Role</span>
          <span class="font-medium text-contrast-content"
            >{isOwner ? "Owner" : "Member"}</span
          >
        </div>
      </div>
    </div>
  {:else if currentView === "settings"}
    <!-- Map Settings Display -->
    <div class="md:hidden">
      <div class="bg-base-200/50 p-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div
              class="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100"
            >
              <Settings class="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <h3 class="text-sm font-bold text-contrast-content">
                {connectedMap.map_name}
              </h3>
              <div class="text-xs text-contrast-content/60">Map Settings</div>
            </div>
          </div>
          <span
            class="rounded bg-base-content/10 px-2 py-1 text-xs text-contrast-content/60"
          >
            {isOwner ? "Owner" : "Member"}
          </span>
        </div>
      </div>
    </div>

    <div class="hidden space-y-4 p-6 md:block">
      <div class="text-center">
        <div
          class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100"
        >
          <Settings class="h-6 w-6 text-blue-600" />
        </div>
        <h3 class="font-bold text-contrast-content">{connectedMap.map_name}</h3>
        <p class="text-sm text-contrast-content/60">
          Owner: {connectedMap.owner}
        </p>
      </div>

      <div class="rounded-lg bg-base-200 p-3">
        <div class="mb-1 flex items-center justify-between">
          <span class="text-xs text-contrast-content/60">Map ID</span>
          <button
            class="text-xs transition-colors hover:text-contrast-content"
            on:click={copyMapId}
          >
            {#if copied}
              <Check class="h-3 w-3 text-green-500" />
            {:else}
              <Copy class="h-3 w-3" />
            {/if}
          </button>
        </div>
        <code class="break-all font-mono text-xs text-contrast-content/80"
          >{connectedMap.id}</code
        >
      </div>

      <div class="space-y-2">
        <div class="flex items-center justify-between text-sm">
          <span class="text-contrast-content/60">Role</span>
          <span class="font-medium text-contrast-content"
            >{isOwner ? "Owner" : "Member"}</span
          >
        </div>
      </div>
    </div>
  {:else if currentView === "create-operation"}
    <!-- Create Operation Display -->
    <div class="md:hidden">
      <div class="bg-base-200/50 p-4">
        <div class="flex items-center gap-3">
          <div
            class="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100"
          >
            <Plus class="h-4 w-4 text-blue-600" />
          </div>
          <div>
            <h3 class="text-sm font-bold text-contrast-content">
              New Operation
            </h3>
            <div class="text-xs text-contrast-content/60">Creating...</div>
          </div>
        </div>
      </div>
    </div>

    <div class="hidden space-y-4 p-6 md:block">
      <div class="text-center">
        <div
          class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100"
        >
          <Plus class="h-6 w-6 text-blue-600" />
        </div>
        <h3 class="font-bold text-contrast-content">New Operation</h3>
        <p class="text-sm text-contrast-content/60">Creating new operation</p>
      </div>

      <div class="rounded-lg bg-base-200 p-3">
        <div class="mb-1 text-xs text-contrast-content/60">Map</div>
        <div class="font-medium text-contrast-content">
          {connectedMap.map_name}
        </div>
      </div>
    </div>
  {:else if currentView === "edit-operation"}
    <!-- Edit Operation Display -->
    <div class="md:hidden">
      <div class="bg-base-200/50 p-4">
        <div class="flex items-center gap-3">
          <div
            class="flex h-8 w-8 items-center justify-center rounded-full bg-yellow-100"
          >
            <Pencil class="h-4 w-4 text-yellow-600" />
          </div>
          <div>
            <h3 class="text-sm font-bold text-contrast-content">
              {selectedOperation?.name || "Edit Operation"}
            </h3>
            <div class="text-xs text-contrast-content/60">
              {selectedOperation?.year || ""}
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="hidden space-y-4 p-6 md:block">
      <div class="text-center">
        <div
          class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-yellow-100"
        >
          <Pencil class="h-6 w-6 text-yellow-600" />
        </div>
        <h3 class="font-bold text-contrast-content">
          {selectedOperation?.name || "Edit Operation"}
        </h3>
        <p class="text-sm text-contrast-content/60">
          Year: {selectedOperation?.year || ""}
        </p>
        {#if selectedOperation?.description}
          <p class="mt-2 text-xs text-contrast-content/60">
            {selectedOperation.description}
          </p>
        {/if}
      </div>

      <div class="rounded-lg bg-base-200 p-3">
        <div class="mb-1 text-xs text-contrast-content/60">Map</div>
        <div class="font-medium text-contrast-content">
          {connectedMap.map_name}
        </div>
      </div>
    </div>
  {:else if currentView === "invite"}
    <!-- Invite Team Members Display -->
    <div class="md:hidden">
      <div class="bg-base-200/50 p-4">
        <div class="flex items-center gap-3">
          <div
            class="flex h-8 w-8 items-center justify-center rounded-full bg-purple-100"
          >
            <UserPlus class="h-4 w-4 text-purple-600" />
          </div>
          <div>
            <h3 class="text-sm font-bold text-contrast-content">Invite Team</h3>
            <div class="text-xs text-contrast-content/60">
              {connectedMap.map_name}
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="hidden space-y-4 p-6 md:block">
      <div class="text-center">
        <div
          class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-purple-100"
        >
          <UserPlus class="h-6 w-6 text-purple-600" />
        </div>
        <h3 class="font-bold text-contrast-content">Invite Team Members</h3>
        <p class="text-sm text-contrast-content/60">
          Share access to {connectedMap.map_name}
        </p>
      </div>

      <div class="rounded-lg bg-base-200 p-3">
        <div class="mb-1 text-xs text-contrast-content/60">Map ID</div>
        <code class="break-all font-mono text-xs text-contrast-content"
          >{connectedMap.id}</code
        >
      </div>
    </div>
  {/if}
{:else}
  <!-- Not Connected Display -->
  <div class="bg-base-200/30 p-4 md:hidden">
    <div class="flex items-center justify-center gap-2">
      <div
        class="flex h-6 w-6 items-center justify-center rounded-full bg-base-300"
      >
        <Map class="h-3 w-3 text-base-content/60" />
      </div>
      <span class="text-sm font-medium text-contrast-content/70"
        >No Map Connected</span
      >
    </div>
  </div>

  <div class="hidden px-6 py-8 text-center md:block">
    <div
      class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-base-200"
    >
      <Map class="h-6 w-6 text-base-content/60" />
    </div>
    <h3 class="mb-2 font-semibold text-contrast-content">No Map Connected</h3>
    <p class="text-sm text-contrast-content/60">
      Create or connect to a map to begin tracking your farm operations.
    </p>
  </div>
{/if}
