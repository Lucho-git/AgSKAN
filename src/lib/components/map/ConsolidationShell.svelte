<!-- src/lib/components/map/ConsolidationShell.svelte -->
<!-- Shared "L-shape" shell used by both the review inspector and the -->
<!-- consolidated preview, so the two modes look and feel like the same experience. -->
<!-- Bordered card style with visible lines separating sidebar / map / bottom bar. -->
<script lang="ts">
  import Icon from "@iconify/svelte"

  export let onBack: () => void
  export let countLabel: string = ""
  export let fullscreen: boolean = true
  export let height: string = "clamp(380px,60vh,600px)"
</script>

{#if fullscreen}
  <div class="fixed inset-0 z-[1000] bg-black flex flex-col">
    <div class="flex-1 flex min-h-0 rounded-lg overflow-hidden border border-neutral-700 m-2">
      <!-- Sidebar -->
      <div class="w-[120px] sm:w-[256px] shrink-0 bg-neutral-900 border-r border-neutral-700 flex flex-col">
        <div class="p-2 sm:p-2.5 border-b border-neutral-700 flex items-center gap-1.5 shrink-0">
          <button
            class="btn btn-ghost btn-xs btn-circle text-neutral-300 hover:text-white shrink-0"
            on:click={onBack}
            title="Back"
          >
            <Icon icon="solar:arrow-left-bold" width="18" height="18" />
          </button>
          <span class="text-[11px] sm:text-xs font-semibold text-neutral-300 truncate">{countLabel}</span>
        </div>
        <slot name="sidebar" />
      </div>

      <!-- Map + bottom bar (flex col, bottom bar is a bordered sibling, not floating) -->
      <div class="flex-1 flex flex-col min-w-0">
        <div class="flex-1 min-h-0">
          <slot name="map" />
        </div>
        <div class="shrink-0 border-t border-neutral-700 bg-neutral-900">
          <slot name="bottombar" />
        </div>
      </div>
    </div>
  </div>
{:else}
  <div class="flex rounded-lg overflow-hidden border border-neutral-700" style="height:{height}">
    <!-- Sidebar -->
    <div class="w-[120px] sm:w-[256px] shrink-0 bg-neutral-900 border-r border-neutral-700 flex flex-col">
      <div class="p-2 sm:p-2.5 border-b border-neutral-700 flex items-center gap-1.5 shrink-0">
        <button
          class="btn btn-ghost btn-xs btn-circle text-neutral-300 hover:text-white shrink-0"
          on:click={onBack}
          title="Back"
        >
          <Icon icon="solar:arrow-left-bold" width="18" height="18" />
        </button>
        <span class="text-[11px] sm:text-xs font-semibold text-neutral-300 truncate">{countLabel}</span>
      </div>
      <slot name="sidebar" />
    </div>

    <!-- Map + bottom bar -->
    <div class="flex-1 flex flex-col min-w-0">
      <div class="flex-1 min-h-0">
        <slot name="map" />
      </div>
      <div class="shrink-0 border-t border-neutral-700 bg-neutral-900">
        <slot name="bottombar" />
      </div>
    </div>
  </div>
{/if}
