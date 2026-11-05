<!-- src/lib/components/settings/SettingsMobileMenu.svelte -->
<!--
  Phone settings index: grouped rows with a one-line description and a chevron.
  Used by every variant when there is no room for a persistent nav.
-->
<script lang="ts">
  import Icon from "@iconify/svelte"
  import { createEventDispatcher } from "svelte"
  import { settingsNavGroups } from "$lib/settings/settingsNav"

  const dispatch = createEventDispatcher()
</script>

<div class="space-y-5">
  {#each settingsNavGroups as group (group.id)}
    <section>
      <h3
        class="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-contrast-content/40"
      >
        {group.label}
      </h3>

      <div class="overflow-hidden rounded-2xl bg-base-200/50">
        {#each group.items as item, index (item.id)}
          <button
            type="button"
            on:click={() => dispatch("select", item.id)}
            class="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors active:bg-base-300/40 {index >
            0
              ? 'border-t border-base-300/50'
              : ''}"
          >
            <span
              class="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-base-100 text-contrast-content/70"
            >
              <Icon icon={item.icon} width="18" height="18" />
            </span>

            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-medium">{item.label}</span>
              <span class="block truncate text-xs text-contrast-content/55"
                >{item.description}</span
              >
            </span>

            <Icon
              icon="solar:alt-arrow-right-bold-duotone"
              width="16"
              height="16"
              class="flex-none text-contrast-content/35"
            />
          </button>
        {/each}
      </div>
    </section>
  {/each}

  <button
    type="button"
    on:click={() => dispatch("signout")}
    class="flex w-full items-center justify-center gap-2 rounded-2xl bg-error/10 py-3 text-sm font-medium text-error transition-colors active:bg-error/20"
  >
    <Icon icon="solar:logout-3-bold-duotone" width="16" height="16" />
    Sign out
  </button>
</div>
