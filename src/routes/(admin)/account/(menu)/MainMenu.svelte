<script>
  import {
    Globe,
    Settings,
    MapPin,
    UserPlus,
    Plus,
    Search,
    ChevronRight,
  } from "lucide-svelte"

  export let isConnected
  export let navigateTo
</script>

<div class="space-y-3">
  {#if isConnected}
    <!-- Connected State Main Menu -->
    <button
      class="group flex w-full items-center justify-between rounded-lg bg-base-content px-4 py-4 font-medium text-base-100 transition-colors hover:bg-base-content/90"
      on:click={() => (window.location.href = "/account/mapviewer")}
    >
      <div class="flex items-center gap-3">
        <Globe class="h-5 w-5" />
        <div class="text-left">
          <div class="font-medium">Launch Map</div>
          <div class="text-sm text-base-100/70">View your interactive map</div>
        </div>
      </div>
      <ChevronRight
        class="h-4 w-4 transition-transform group-hover:translate-x-1"
      />
    </button>

    <button
      class="flex w-full items-center gap-3 rounded-lg bg-base-200 px-4 py-3 text-contrast-content transition-colors hover:bg-base-300"
      on:click={() => navigateTo("settings")}
    >
      <Settings class="h-4 w-4" />
      <div class="text-left">
        <div class="text-sm font-medium">Map Settings</div>
        <div class="text-xs text-contrast-content/60">
          Configure map preferences
        </div>
      </div>
    </button>

    <button
      class="flex w-full items-center gap-3 rounded-lg bg-base-200 px-4 py-3 text-contrast-content transition-colors hover:bg-base-300"
      on:click={() => navigateTo("operations")}
    >
      <MapPin class="h-4 w-4" />
      <div class="text-left">
        <div class="text-sm font-medium">Manage Operations</div>
        <div class="text-xs text-contrast-content/60">
          Add, edit, and organize operations
        </div>
      </div>
    </button>

    <button
      class="flex w-full items-center gap-3 rounded-lg bg-base-200 px-4 py-3 text-contrast-content transition-colors hover:bg-base-300"
      on:click={() => navigateTo("invite")}
    >
      <UserPlus class="h-4 w-4" />
      <div class="text-left">
        <div class="text-sm font-medium">Invite Team Members</div>
        <div class="text-xs text-contrast-content/60">
          Share map access with others
        </div>
      </div>
    </button>
  {:else}
    <!-- Disconnected State Main Menu -->
    <div class="mb-6 text-center">
      <p class="text-contrast-content/60">Get started with map management</p>
    </div>

    <button
      class="flex w-full items-center gap-3 rounded-lg bg-base-content px-4 py-3 font-medium text-base-100 transition-colors hover:bg-base-content/90"
      on:click={() => navigateTo("create")}
    >
      <Plus class="h-4 w-4" />
      <div class="text-left">
        <div class="text-sm font-medium">Create New Map</div>
        <div class="text-xs text-base-100/70">Start a new farm map</div>
      </div>
    </button>

    <button
      class="flex w-full items-center gap-3 rounded-lg bg-base-200 px-4 py-3 text-contrast-content transition-colors hover:bg-base-300"
      on:click={() => navigateTo("connect")}
    >
      <Search class="h-4 w-4" />
      <div class="text-left">
        <div class="text-sm font-medium">Connect to Map</div>
        <div class="text-xs text-contrast-content/60">Join an existing map</div>
      </div>
    </button>
  {/if}
</div>
