<!-- src/lib/components/settings/SettingsBreadcrumb.svelte -->
<!-- Small "Group / Page" crumb above the content on wide layouts, so the
     active destination is obvious even when the nav is an icon rail. -->
<script lang="ts">
  import Icon from "@iconify/svelte"
  import type {
    SettingsNavGroup,
    SettingsNavItem,
  } from "$lib/settings/settingsNav"

  export let currentGroup: SettingsNavGroup | null = null
  export let currentItem: SettingsNavItem | null = null
</script>

{#if currentItem}
  <div class="mb-1.5 flex items-center gap-1.5 px-1 text-xs">
    <span class="text-contrast-content/45">{currentGroup?.label ?? "Settings"}</span>
    <Icon
      icon="solar:alt-arrow-right-bold-duotone"
      width="12"
      height="12"
      class="text-contrast-content/25"
    />
    <span class="font-medium text-contrast-content/80">{currentItem.label}</span>
  </div>
{/if}
