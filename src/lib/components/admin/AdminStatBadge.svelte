<!-- src/lib/components/admin/AdminStatBadge.svelte -->
<script lang="ts">
  // Compact stat badge used across the admin portal (list cards + detail):
  // ghost badge, thin black outline, optional icon + tabular number.
  export let icon: any = null
  export let value = ""
  export let title = ""
</script>

<span
  class="badge badge-ghost badge-sm gap-1 border border-black font-medium tabular-nums"
  {title}
>
  {#if icon}
    <svelte:component this={icon} class="h-3 w-3" />
  {/if}
  {value}
</span>
