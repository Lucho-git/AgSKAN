<!-- src/lib/components/map/toolbox/WeatherToolButton.svelte -->
<script>
  import { createEventDispatcher } from "svelte"
  import { ChevronRight } from "lucide-svelte"
  import { profileStore } from "$lib/stores/profileStore"
  import { userSettingsStore } from "$lib/stores/userSettingsStore"
  import {
    forecastIcon,
    getWeatherHero,
    fetchWeatherHero,
    weatherHeroKey,
  } from "$lib/utils/weather"

  const dispatch = createEventDispatcher()

  // Start from the shared prefetched cache (populated when the map loads) so
  // the hero renders instantly — no first-load spinner.
  let hero = getWeatherHero()
  let loading = !hero
  let iconSvg = hero?.iconSvg ?? forecastIcon(3)
  let temp = hero?.temp ?? null
  let cond = hero?.cond ?? "Weather"
  let locLabel = hero?.locLabel ?? "Farm centre"
  let lastKey = null

  $: mapId = $profileStore?.master_map_id
  $: sourceKey = weatherHeroKey($userSettingsStore.weatherSource ?? null)

  async function load() {
    loading = true
    if (!mapId) {
      loading = false
      return
    }
    const data = await fetchWeatherHero(
      mapId,
      $userSettingsStore.weatherSource ?? null,
    )
    if (data) {
      temp = data.temp
      cond = data.cond
      iconSvg = data.iconSvg
      locLabel = data.locLabel
    } else {
      iconSvg = forecastIcon(3)
      cond = "Weather"
    }
    loading = false
  }

  // Re-fetch when the saved weather source changes (or on first mount)
  $: if (mapId && sourceKey !== lastKey) {
    lastKey = sourceKey
    load()
  }
</script>

<button
  class="wx-hero"
  on:click={() => dispatch("open")}
  title="Open the weather panel"
>
  <div class="wx-icon">{@html iconSvg}</div>
  <div class="wx-main">
    {#if loading && temp == null}
      <span class="wx-temp">Weather</span>
      <span class="wx-cond">Loading…</span>
    {:else if temp != null}
      <span class="wx-temp">{temp}°</span>
      <span class="wx-cond">{cond}</span>
      <span class="wx-loc">{locLabel}</span>
    {:else}
      <span class="wx-temp">Weather</span>
      <span class="wx-cond">Tap to open</span>
    {/if}
  </div>
  <div class="wx-cta">
    <ChevronRight size={14} />
  </div>
</button>

<style>
  .wx-hero {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 12px 14px;
    border-radius: 14px;
    cursor: pointer;
    transition: all 0.2s ease;
    border: 1px solid rgba(56, 189, 248, 0.3);
    background: linear-gradient(
      135deg,
      rgba(56, 189, 248, 0.22),
      rgba(56, 189, 248, 0.05)
    );
    color: #fff;
    text-align: left;
  }
  .wx-hero:hover {
    border-color: rgba(56, 189, 248, 0.55);
    background: linear-gradient(
      135deg,
      rgba(56, 189, 248, 0.32),
      rgba(56, 189, 248, 0.08)
    );
    transform: translateY(-2px);
  }
  .wx-hero:active {
    transform: translateY(0);
  }

  .wx-icon {
    line-height: 0;
    flex-shrink: 0;
  }
  .wx-icon :global(svg) {
    width: 44px;
    height: 44px;
  }

  .wx-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .wx-temp {
    font-size: 22px;
    font-weight: 800;
    line-height: 1;
    white-space: nowrap;
  }
  .wx-cond {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.7);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .wx-loc {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.5);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .wx-cta {
    display: flex;
    align-items: center;
    gap: 2px;
    font-size: 11px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.65);
    flex-shrink: 0;
  }
</style>
