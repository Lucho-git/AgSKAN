<!-- src/lib/components/settings/SettingsSidebarNav.svelte -->
<!--
  Variant A — "Sidebar".
  Grouped, searchable navigation. Reads as a proper settings app on desktop and
  collapses to a drill-in list on phones. Chosen structure: group heading +
  row with icon, label and a one-line description of what lives there.
-->
<script lang="ts">
  import Icon from "@iconify/svelte"
  import { createEventDispatcher } from "svelte"
  import {
    filterSettingsItems,
    settingsNavGroups,
    type SettingsNavItem,
  } from "$lib/settings/settingsNav"

  export let currentSection = ""
  export let compact = false

  const dispatch = createEventDispatcher()

  let query = ""
  $: results = filterSettingsItems(query)
  $: searching = query.trim().length > 0

  function isActive(item: SettingsNavItem) {
    return item.id === currentSection
  }
</script>

<div class="flex flex-col">
  <!-- Search -->
  <div class="flex-none px-1 pb-3">
    <label class="relative block">
      <span class="sr-only">Search settings</span>
      <Icon
        icon="solar:magnifer-linear"
        width="16"
        height="16"
        class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-contrast-content/40"
      />
      <input
        type="text"
        bind:value={query}
        placeholder="Search settings"
        class="w-full rounded-xl bg-base-200/60 py-2 pl-9 pr-3 text-sm text-contrast-content placeholder:text-contrast-content/40 focus:bg-base-200 focus:outline-none focus:ring-2 focus:ring-base-content/10"
      />
    </label>
  </div>

  <!-- Nav -->
  <nav class="min-h-0 overflow-y-auto pr-0.5" aria-label="Settings">
    {#if searching}
      <ul class="space-y-0.5">
        {#each results as item (item.id)}
          <li>
            <a
              href={item.href}
              class="group flex items-start gap-2.5 rounded-xl px-2.5 py-2 transition-colors {isActive(
                item,
              )
                ? 'bg-base-content/10'
                : 'hover:bg-base-content/5'}"
            >
              <span class="mt-0.5 flex-none text-contrast-content/70">
                <Icon icon={item.icon} width="18" height="18" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-medium"
                  >{item.label}</span
                >
                <span class="block truncate text-xs text-contrast-content/55"
                  >{item.description}</span
                >
              </span>
            </a>
          </li>
        {/each}
        {#if results.length === 0}
          <li class="px-3 py-6 text-center text-xs text-contrast-content/50">
            Nothing matches “{query}”
          </li>
        {/if}
      </ul>
    {:else}
      {#each settingsNavGroups as group (group.id)}
        <div class="mb-1">
          <p
            class="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-contrast-content/40"
          >
            {group.label}
          </p>
          <ul class="space-y-0.5">
            {#each group.items as item (item.id)}
              {@const active = isActive(item)}
              <li>
                <a
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  title={compact ? item.label : undefined}
                  class="group relative flex items-center gap-2.5 rounded-xl px-2.5 py-2 transition-colors {active
                    ? 'bg-base-content/10 font-medium'
                    : 'hover:bg-base-content/5'}"
                >
                  {#if active}
                    <span
                      class="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-base-content"
                    ></span>
                  {/if}
                  <span
                    class="flex-none {active
                      ? 'text-base-content'
                      : 'text-contrast-content/65 group-hover:text-contrast-content'}"
                  >
                    <Icon icon={item.icon} width="18" height="18" />
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-sm">{item.label}</span>
                    {#if !compact}
                      <span
                        class="block truncate text-[11px] font-normal text-contrast-content/50"
                        >{item.description}</span
                      >
                    {/if}
                  </span>
                </a>
              </li>
            {/each}
          </ul>
        </div>
      {/each}
    {/if}
  </nav>

  <!-- Footer actions -->
  <div class="mt-2 flex-none border-t border-base-300/60 pt-2">
    <button
      type="button"
      on:click={() => dispatch("signout")}
      class="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm text-error transition-colors hover:bg-error/10"
    >
      <Icon icon="solar:logout-3-bold-duotone" width="18" height="18" />
      Sign out
    </button>
  </div>
</div>
