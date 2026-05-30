<script>
  // @ts-nocheck
  import { createEventDispatcher } from "svelte"
  import { confirmedMarkersStore, selectedMarkerStore } from "$lib/stores/markerStore"
  import { controlStore } from "$lib/stores/controlStore"
  import { markerVisibilityStore } from "$lib/stores/markerVisibilityStore"
  import { findMarkerByIconClass, getActiveMarkers } from "$lib/data/markerDefinitions"
  import IconSVG from "$lib/components/general/IconSVG.svelte"
  import { MapPin, Search, X } from "lucide-svelte"

  const dispatch = createEventDispatcher()

  let searchQuery = ""
  let markerTypeView = "used"

  const getMarkerDef = (iconClass) => findMarkerByIconClass(iconClass)

  function getIconClassForDefinition(markerDef) {
    if (!markerDef || markerDef.id === "default") return "default"
    if (markerDef.class === "custom-svg") return `custom-svg-${markerDef.id}`
    return markerDef.class || markerDef.id || "default"
  }

  function createMarkerType(key, markerDef) {
    const resolvedMarkerDef = markerDef || getMarkerDef(key)

    return {
      key,
      name: resolvedMarkerDef?.name || "Unknown",
      markerDef: resolvedMarkerDef,
      markerIds: [],
      count: 0,
      hiddenCount: 0,
    }
  }

  function buildMarkerTypes(markers, visibilitySettings, query, includeUnusedTypes) {
    const q = query.trim().toLowerCase()
    const typeMap = new Map()

    if (includeUnusedTypes) {
      for (const markerDef of getActiveMarkers()) {
        const key = getIconClassForDefinition(markerDef)
        if (!typeMap.has(key)) {
          typeMap.set(key, createMarkerType(key, markerDef))
        }
      }
    }

    for (const marker of markers || []) {
      const key = marker.iconClass || "default"
      let markerType = typeMap.get(key)

      if (!markerType) {
        markerType = createMarkerType(key)
        typeMap.set(key, markerType)
      }

      markerType.count += 1
      markerType.markerIds.push(marker.id)
      if (visibilitySettings[marker.id] === "hidden") {
        markerType.hiddenCount += 1
      }
    }

    const markerTypes = Array.from(typeMap.values())
      .filter((markerType) => {
        if (!q) return true
        return markerType.name.toLowerCase().includes(q)
      })
      .map((markerType) => ({
        ...markerType,
        visibleCount: markerType.count - markerType.hiddenCount,
        isVisible: markerType.count === 0 || markerType.hiddenCount < markerType.count,
        isPartial: markerType.hiddenCount > 0 && markerType.hiddenCount < markerType.count,
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))

    if (markerTypes.length === 0) return []

    return [
      {
        name: "Markers",
        markerCount: markerTypes.reduce((count, markerType) => count + markerType.count, 0),
        hiddenCount: markerTypes.reduce((count, markerType) => count + markerType.hiddenCount, 0),
        types: markerTypes,
      },
    ]
  }

  $: categoryGroups = buildMarkerTypes(
    $confirmedMarkersStore || [],
    $markerVisibilityStore || {},
    searchQuery,
    markerTypeView === "all",
  )
  $: totalMarkers = ($confirmedMarkersStore || []).length
  $: hiddenMarkers = ($confirmedMarkersStore || []).reduce(
    (count, marker) => count + ($markerVisibilityStore[marker.id] === "hidden" ? 1 : 0),
    0,
  )
  $: visibleMarkers = totalMarkers - hiddenMarkers
  $: totalTypes = categoryGroups.reduce((count, group) => count + group.types.length, 0)
  $: displayedMarkerIdsCount = categoryGroups.reduce(
    (count, group) => count + group.types.reduce((typeCount, markerType) => typeCount + markerType.markerIds.length, 0),
    0,
  )

  function close() {
    dispatch("close")
  }

  function setTypeVisibility(markerType, visible) {
    const updates = {}
    for (const markerId of markerType.markerIds) {
      const current = $markerVisibilityStore[markerId]
      updates[markerId] = visible ? (current === "hidden" ? "always" : current || "always") : "hidden"
    }

    applyUpdates(updates)
  }

  function setDisplayedVisibility(visible) {
    const updates = {}

    for (const group of categoryGroups) {
      for (const markerType of group.types) {
        for (const markerId of markerType.markerIds) {
          const current = $markerVisibilityStore[markerId]
          updates[markerId] = visible ? (current === "hidden" ? "always" : current || "always") : "hidden"
        }
      }
    }

    applyUpdates(updates)
  }

  function applyUpdates(updates) {
    const markerIds = Object.keys(updates)
    if (markerIds.length === 0) return

    markerVisibilityStore.setManyMarkerVisibility(updates)

    if ($selectedMarkerStore?.id && updates[$selectedMarkerStore.id] === "hidden") {
      selectedMarkerStore.set(null)
      controlStore.update((controls) => ({
        ...controls,
        showMarkerMenu: false,
      }))
    }

    dispatch("change", { markerIds })
  }
</script>

<div class="marker-modal-overlay" data-map-control>
  <button class="marker-modal-backdrop" aria-label="Close marker visibility" on:click={close}></button>

  <section
    class="marker-modal"
    role="dialog"
    aria-modal="true"
    aria-label="Marker visibility"
  >
    <div class="marker-modal-header">
      <div class="header-title-row">
        <div>
          <h3>Marker Visibility</h3>
          <p>{visibleMarkers} visible, {hiddenMarkers} hidden</p>
        </div>
        <button class="close-button" aria-label="Close marker visibility" on:click={close}>
          <X size={16} />
        </button>
      </div>
    </div>

    <div class="marker-modal-body">
      <div class="summary-banner">
        <div class="summary-item">
          <span class="summary-label">Markers</span>
          <span class="summary-value">{totalMarkers}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">Types</span>
          <span class="summary-value">{totalTypes}</span>
        </div>
      </div>

      <div class="search-row">
        <Search size={15} />
        <input bind:value={searchQuery} placeholder="Search marker types..." />
      </div>

      <div class="view-toggle" aria-label="Marker type view">
        <button class:active={markerTypeView === "used"} on:click={() => (markerTypeView = "used")}>
          Your Markers
        </button>
        <button class:active={markerTypeView === "all"} on:click={() => (markerTypeView = "all")}>
          All Markers
        </button>
      </div>

      <div class="bulk-actions">
        <button on:click={() => setDisplayedVisibility(true)} disabled={displayedMarkerIdsCount === 0}>
          Show All
        </button>
        <button on:click={() => setDisplayedVisibility(false)} disabled={displayedMarkerIdsCount === 0}>
          Hide All
        </button>
      </div>

      <div class="type-list">
        {#if categoryGroups.length === 0}
          <div class="empty-state">
            <MapPin size={28} />
            <span>No marker types found</span>
          </div>
        {:else}
          {#each categoryGroups as category}
            <div class="category-section">
              <div class="category-header">
                <span>{category.name}</span>
                <span>{category.markerCount} marker{category.markerCount !== 1 ? "s" : ""}</span>
              </div>

              {#each category.types as markerType (markerType.key)}
                <div class="type-row" class:partial={markerType.isPartial}>
                  <span class="type-icon">
                    {#if markerType.markerDef}
                      {#if markerType.markerDef.id === "default"}
                        <IconSVG icon="mapbox-marker" size="20px" />
                      {:else if markerType.markerDef.class === "custom-svg"}
                        <IconSVG icon={markerType.markerDef.id} size="20px" />
                      {:else if markerType.markerDef.class?.startsWith("ionic-")}
                        <ion-icon name={markerType.markerDef.id} style="font-size: 20px;"></ion-icon>
                      {:else if markerType.markerDef.class?.startsWith("at-")}
                        <i class={`${markerType.markerDef.class}`} style="font-size: 20px;"></i>
                      {:else}
                        <MapPin size={20} />
                      {/if}
                    {:else}
                      <MapPin size={20} />
                    {/if}
                  </span>

                  <span class="type-copy">
                    <span class="type-name">{markerType.name}</span>
                    <span class="type-count">
                      {#if markerType.count === 0}
                        Not used
                      {:else}
                        {markerType.count} marker{markerType.count !== 1 ? "s" : ""}
                      {/if}
                      {#if markerType.isPartial}
                        · {markerType.hiddenCount} hidden
                      {/if}
                    </span>
                  </span>

                  <button
                    class="switch-toggle"
                    class:on={markerType.isVisible}
                    disabled={markerType.count === 0}
                    aria-label={markerType.isVisible ? `Hide ${markerType.name} markers` : `Show ${markerType.name} markers`}
                    on:click={() => setTypeVisibility(markerType, !markerType.isVisible)}
                  >
                    <span></span>
                  </button>
                </div>
              {/each}
            </div>
          {/each}
        {/if}
      </div>
    </div>

    <div class="marker-modal-footer">
      <button class="modal-btn primary" on:click={close}>Done</button>
    </div>
  </section>
</div>

<style>
  .marker-modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 2100;
    background-color: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 14px;
    animation: markerFadeIn 0.2s ease-out;
  }

  .marker-modal {
    position: relative;
    width: min(420px, 94vw);
    max-height: min(720px, 88vh);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    animation: markerSlideIn 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
  }

  .marker-modal-backdrop {
    position: absolute;
    inset: 0;
    border: 0;
    background: transparent;
    cursor: pointer;
  }

  .marker-modal-header {
    padding: 16px 18px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    background: linear-gradient(
      135deg,
      rgba(59, 130, 246, 0.16) 0%,
      rgba(37, 99, 235, 0.1) 100%
    );
  }

  .header-title-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .marker-modal-header h3 {
    margin: 0;
    color: #fff;
    font-size: 16px;
    font-weight: 700;
  }

  .marker-modal-header p {
    margin: 3px 0 0;
    color: rgba(255, 255, 255, 0.6);
    font-size: 12px;
    font-weight: 600;
  }

  .close-button {
    width: 32px;
    height: 32px;
    border: 0;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    color: rgba(255, 255, 255, 0.7);
    cursor: pointer;
    transition: background 0.2s ease, color 0.2s ease;
  }

  .close-button:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }

  .marker-modal-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 16px 18px;
  }

  .marker-modal-body::-webkit-scrollbar {
    width: 4px;
  }

  .marker-modal-body::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 2px;
  }

  .summary-banner {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
    padding: 12px;
    margin-bottom: 12px;
    background: linear-gradient(
      135deg,
      rgba(59, 130, 246, 0.15) 0%,
      rgba(37, 99, 235, 0.1) 100%
    );
    border: 1px solid rgba(59, 130, 246, 0.25);
    border-radius: 10px;
  }

  .summary-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .summary-label,
  .category-header,
  .type-count {
    color: rgba(255, 255, 255, 0.5);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.4px;
    text-transform: uppercase;
  }

  .summary-value {
    color: rgba(255, 255, 255, 0.95);
    font-size: 18px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }

  .search-row {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 38px;
    padding: 0 11px;
    margin-bottom: 10px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(20px);
    color: rgba(255, 255, 255, 0.5);
  }

  .search-row input {
    min-width: 0;
    flex: 1;
    border: 0;
    outline: none;
    background: transparent;
    color: rgba(255, 255, 255, 0.95);
    font-size: 13px;
  }

  .search-row input::placeholder {
    color: rgba(255, 255, 255, 0.38);
  }

  .view-toggle,
  .bulk-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .view-toggle {
    margin-bottom: 14px;
    padding: 4px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.04);
  }

  .bulk-actions {
    margin-bottom: 14px;
  }

  .view-toggle button,
  .bulk-actions button {
    min-height: 34px;
    border: 1px solid transparent;
    border-radius: 10px;
    background: transparent;
    color: rgba(255, 255, 255, 0.78);
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    transition: background 0.2s ease, border-color 0.2s ease;
  }

  .bulk-actions button {
    border-color: rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.05);
  }

  .view-toggle button.active {
    background: rgba(59, 130, 246, 0.24);
    border-color: rgba(59, 130, 246, 0.34);
    color: #fff;
  }

  .view-toggle button:hover,
  .bulk-actions button:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.09);
    border-color: rgba(255, 255, 255, 0.18);
  }

  .bulk-actions button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .type-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .category-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .category-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 0 2px;
  }

  .type-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    min-height: 52px;
    padding: 9px 10px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.05);
  }

  .type-row.partial {
    border-color: rgba(251, 191, 36, 0.26);
    background: rgba(251, 191, 36, 0.08);
  }

  .type-icon {
    width: 30px;
    height: 30px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: rgba(255, 255, 255, 0.74);
  }

  .type-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .type-name {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    color: rgba(255, 255, 255, 0.95);
    font-size: 13px;
    font-weight: 800;
  }

  .type-count {
    letter-spacing: 0.2px;
  }

  .switch-toggle {
    position: relative;
    width: 42px;
    height: 24px;
    padding: 0;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.12);
    cursor: pointer;
    transition: background 0.2s ease, border-color 0.2s ease;
  }

  .switch-toggle span {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.82);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
    transition: transform 0.2s ease, background 0.2s ease;
  }

  .switch-toggle.on {
    background: rgba(34, 197, 94, 0.3);
    border-color: rgba(34, 197, 94, 0.5);
  }

  .switch-toggle.on span {
    transform: translateX(18px);
    background: #22c55e;
  }

  .switch-toggle:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .empty-state {
    min-height: 150px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: rgba(255, 255, 255, 0.45);
    font-size: 13px;
    font-weight: 700;
  }

  .marker-modal-footer {
    padding: 14px 18px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    background: rgba(0, 0, 0, 0.3);
  }

  .modal-btn {
    flex: 1;
    min-height: 40px;
    border: 0;
    border-radius: 10px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    transition: transform 0.2s ease, background 0.2s ease;
  }

  .modal-btn.primary {
    background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
    color: #fff;
  }

  .modal-btn.primary:hover {
    background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
    transform: translateY(-1px);
  }

  @keyframes markerFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes markerSlideIn {
    from {
      transform: translateY(-20px) scale(0.95);
      opacity: 0;
    }
    to {
      transform: translateY(0) scale(1);
      opacity: 1;
    }
  }

  @media (max-width: 640px) {
    .marker-modal {
      width: 95vw;
      max-height: 90vh;
    }

    .marker-modal-body {
      padding: 14px;
    }

    .type-row {
      min-height: 50px;
      padding: 8px;
    }
  }
</style>
