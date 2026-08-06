<script lang="ts">
  import Icon from "@iconify/svelte"
  import { goto } from "$app/navigation"

  const integrations = [
    {
      id: "agworld",
      name: "Agworld",
      icon: "solar:cloud-check-bold-duotone",
      description:
        "Connect your Agworld account to import field boundaries, view activity records (actuals, plans, work orders), and match spray trails.",
      status: "Connected",
      statusColor: "text-success",
      href: "/account/integrations/agworld",
    },
    {
      id: "weather",
      name: "Weather",
      icon: "solar:cloud-sunny-bold-duotone",
      description:
        "Experimental weather explorer — pull current, forecast, and historical weather from independent providers (Open-Meteo, SILO, DPIRD, BoM) and compute spray windows for your fields.",
      status: "New",
      statusColor: "text-info",
      href: "/account/integrations/weather",
    },
  ]
</script>

<div class="page-header">
  <div class="header-left">
    <Icon
      icon="solar:widget-add-bold-duotone"
      width="24"
      height="24"
      class="text-blue-400"
    />
    <div>
      <h1>Integrations</h1>
      <p class="header-subtitle">
        Connect third-party services to AgSKAN
      </p>
    </div>
  </div>
</div>

<div class="grid gap-4 sm:grid-cols-2">
  {#each integrations as integration}
    <button
      class="group flex items-start gap-4 rounded-xl border border-base-300 bg-base-200 p-5 text-left transition-all hover:border-primary/40 hover:bg-base-200/70"
      on:click={() => goto(integration.href)}
      role="link"
      tabindex="0"
      on:keydown={(e) => e.key === "Enter" && goto(integration.href)}
    >
      <div
        class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10"
      >
        <Icon
          icon={integration.icon}
          width="26"
          height="26"
          class="text-primary"
        />
      </div>
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-bold text-contrast-content">
            {integration.name}
          </h3>
          <span
            class="badge badge-sm badge-ghost font-normal {integration.statusColor}"
          >
            {integration.status}
          </span>
        </div>
        <p class="mt-1 text-xs leading-relaxed text-contrast-content/50">
          {integration.description}
        </p>
      </div>
      <Icon
        icon="solar:alt-arrow-right-bold"
        width="18"
        height="18"
        class="mt-1 shrink-0 text-contrast-content/20 transition-transform group-hover:translate-x-0.5 group-hover:text-contrast-content/50"
      />
    </button>
  {/each}
</div>

<style>
  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 20px;
    gap: 16px;
    flex-wrap: wrap;
  }
  .header-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  h1 {
    font-size: 20px;
    font-weight: 700;
    margin: 0;
    color: oklch(var(--contrast-content));
  }
  .header-subtitle {
    font-size: 12px;
    opacity: 0.6;
    margin: 2px 0 0;
    color: oklch(var(--contrast-content));
  }
</style>
