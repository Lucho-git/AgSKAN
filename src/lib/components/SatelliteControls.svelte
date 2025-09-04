<script>
  import { onMount, onDestroy } from "svelte"
  import { toast } from "svelte-sonner"
  import { userSettingsStore } from "$lib/stores/userSettingsStore"
  import { userSettingsApi } from "$lib/api/userSettingsApi"
  import { Star } from "lucide-svelte"

  export let satelliteManager = null

  // UI state (syncs with manager)
  let currentSource = "mapbox"
  let availableSources = []
  let defaultImagerySource = "mapbox"

  // Event unsubscribe functions
  let unsubscribeSourceChange = null

  // Imagery sources configuration (for UI display)
  const IMAGERY_SOURCES = {
    mapbox: {
      name: "Mapbox Satellite",
      description: "Best offline support and caching",
      canBeDefault: true,
    },
    google_satellite: {
      name: "Google Satellite",
      description: "Google satellite imagery",
      canBeDefault: true,
    },
    bing_aerial: {
      name: "Microsoft Bing Aerial",
      description: "High-resolution aerial photography",
      canBeDefault: true,
    },
    esri_standard: {
      name: "Esri World Imagery",
      description: "Standard high-resolution imagery",
      canBeDefault: true,
    },
    ndvi: {
      name: "NDVI Vegetation Index",
      description: "Agricultural vegetation health analysis",
      isNDVI: true,
      canBeDefault: false,
    },
  }

  // ✅ Make these explicitly reactive by including currentSource in the dependencies
  $: availableSources = Object.entries(IMAGERY_SOURCES).filter(
    ([key, source]) => {
      // Always show Mapbox
      if (key === "mapbox") return true

      // Check if this provider is enabled by the user
      return $userSettingsStore.enabledImageryProviders?.includes(key) || false
    },
  )

  $: defaultImagerySource = $userSettingsStore.defaultImagerySource || "mapbox"

  // ✅ Make these functions reactive by depending on currentSource and defaultImagerySource
  $: isDefault = (sourceKey) => {
    return sourceKey === defaultImagerySource
  }

  $: canShowDefaultButton = (sourceKey) => {
    const source = IMAGERY_SOURCES[sourceKey]
    return (
      currentSource === sourceKey &&
      source.canBeDefault &&
      !isDefault(sourceKey)
    )
  }

  onMount(() => {
    if (satelliteManager?.api) {
      // Get current state from manager
      const state = satelliteManager.api.getState()
      currentSource = state.selectedImagerySource

      // Subscribe to source changes
      unsubscribeSourceChange = satelliteManager.api.onSourceChange(
        (newSource) => {
          // ✅ Trigger reactivity by reassigning
          currentSource = newSource
        },
      )
    }
  })

  onDestroy(() => {
    if (unsubscribeSourceChange) {
      unsubscribeSourceChange()
    }
  })

  async function selectSource(sourceKey) {
    if (satelliteManager?.api) {
      try {
        await satelliteManager.api.setSource(sourceKey)
        // currentSource will be updated via the subscription
      } catch (error) {
        toast.error(`Failed to switch to ${IMAGERY_SOURCES[sourceKey].name}`)
      }
    }
  }

  async function makeDefault(sourceKey) {
    try {
      const result = await userSettingsApi.updateDefaultImagerySource(sourceKey)

      if (result.success) {
        toast.success(
          `${IMAGERY_SOURCES[sourceKey].name} set as default satellite`,
        )
      } else {
        toast.error(result.message || "Failed to set default imagery source")
      }
    } catch (error) {
      console.error("Error setting default imagery source:", error)
      toast.error("Failed to set default imagery source")
    }
  }
</script>

<div class="satellite-controls">
  <!-- Satellite Options List -->
  <div class="satellite-options">
    {#each availableSources as [key, source]}
      <div class="satellite-option-container">
        <button
          class="satellite-option"
          class:selected={currentSource === key}
          class:default-option={isDefault(key)}
          class:ndvi-item={source.isNDVI}
          on:click={() => selectSource(key)}
        >
          <div class="option-content">
            <div class="option-header">
              <div class="option-name-section">
                <span class="option-name">{source.name}</span>
                {#if isDefault(key)}
                  <span class="default-badge">DEFAULT</span>
                {/if}
              </div>
              {#if currentSource === key}
                <span class="selected-indicator">✓</span>
              {/if}
            </div>
            <div class="option-description">{source.description}</div>
          </div>
        </button>

        <!-- ✅ Star button now uses reactive function -->
        {#if canShowDefaultButton(key)}
          <button
            class="make-default-btn"
            on:click|stopPropagation={() => makeDefault(key)}
            title="Make this your default satellite"
          >
            <Star size={14} />
          </button>
        {/if}
      </div>
    {/each}
  </div>
</div>

<style>
  .satellite-controls {
    padding: 16px;
  }

  .satellite-options {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .satellite-option-container {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .satellite-option {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 12px;
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: left;
    width: 100%;
    flex: 1;
  }

  .satellite-option:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.2);
    transform: translateY(-1px);
  }

  .satellite-option.selected {
    background: rgba(96, 165, 250, 0.2);
    border-color: rgba(96, 165, 250, 0.4);
  }

  .satellite-option.default-option {
    background: rgba(255, 193, 7, 0.1);
    border-color: rgba(255, 193, 7, 0.3);
  }

  .satellite-option.default-option:hover {
    background: rgba(255, 193, 7, 0.15);
    border-color: rgba(255, 193, 7, 0.4);
  }

  .satellite-option.default-option.selected {
    background: rgba(255, 193, 7, 0.25);
    border-color: rgba(255, 193, 7, 0.5);
  }

  .ndvi-item {
    background: rgba(34, 197, 94, 0.1);
    border-color: rgba(34, 197, 94, 0.3);
  }

  .ndvi-item:hover {
    background: rgba(34, 197, 94, 0.15);
    border-color: rgba(34, 197, 94, 0.4);
  }

  .ndvi-item.selected {
    background: rgba(34, 197, 94, 0.2);
    border-color: rgba(34, 197, 94, 0.4);
  }

  .option-content {
    color: white;
  }

  .option-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
  }

  .option-name-section {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
  }

  .option-name {
    font-weight: 600;
    font-size: 13px;
  }

  .default-badge {
    background: rgba(255, 193, 7, 0.8);
    color: rgba(0, 0, 0, 0.8);
    font-size: 9px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 4px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    transition: all 0.3s ease;
    animation: fadeInScale 0.3s ease;
  }

  @keyframes fadeInScale {
    from {
      opacity: 0;
      transform: scale(0.8);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  .selected-indicator {
    color: #60a5fa;
    font-weight: bold;
    font-size: 12px;
  }

  .option-description {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.7);
    line-height: 1.3;
  }

  .make-default-btn {
    background: rgba(255, 193, 7, 0.2);
    border: 1px solid rgba(255, 193, 7, 0.4);
    border-radius: 6px;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #ffc107;
    cursor: pointer;
    transition: all 0.3s ease;
    flex-shrink: 0;
    animation: slideInRight 0.3s ease;
  }

  @keyframes slideInRight {
    from {
      opacity: 0;
      transform: translateX(20px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  .make-default-btn:hover {
    background: rgba(255, 193, 7, 0.3);
    border-color: rgba(255, 193, 7, 0.6);
    color: #fff;
    transform: scale(1.05);
  }

  /* Mobile Responsive */
  @media (max-width: 768px) {
    .satellite-controls {
      padding: 12px;
    }

    .satellite-options {
      gap: 4px;
    }

    .satellite-option {
      padding: 10px;
    }

    .option-name {
      font-size: 12px;
    }

    .option-description {
      font-size: 10px;
    }

    .default-badge {
      font-size: 8px;
      padding: 1px 4px;
    }

    .make-default-btn {
      width: 28px;
      height: 28px;
    }
  }

  @media (max-width: 480px) {
    .satellite-controls {
      padding: 10px;
    }

    .satellite-option {
      padding: 8px;
    }

    .option-name {
      font-size: 11px;
    }

    .option-description {
      font-size: 9px;
    }

    .default-badge {
      font-size: 7px;
      padding: 1px 3px;
    }

    .make-default-btn {
      width: 24px;
      height: 24px;
    }
  }
</style>
