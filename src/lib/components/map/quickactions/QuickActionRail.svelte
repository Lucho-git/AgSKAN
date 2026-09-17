<!-- src/lib/components/map/quickactions/QuickActionRail.svelte -->
<!-- Generic quick-action rail: the vertical stack of circular buttons that
     floats just above the people (vehicles) button, bottom-left of the map.
     Renders whatever items the registered providers hand it — see
     $lib/stores/mapQuickActionStore for the provider/item contract and
     MapQuickActions for the orchestration. -->
<script>
  import { fly } from "svelte/transition"

  /** @type {Array<{id: string, label: string, title?: string, accent?: string, bg?: string, iconSvg?: string, icon?: any, fill?: number|null, text?: string|null, onActivate?: () => void}>} */
  export let items = []
</script>

{#if items.length}
  <div
    class="qa-rail"
    role="toolbar"
    aria-orientation="vertical"
    aria-label="Map quick actions"
  >
    {#each items as item (item.id)}
      <button
        class="qa-btn"
        style="--qa-accent: {item.accent || '#94a3b8'}; --qa-bg: {item.bg ||
          'rgba(8, 12, 24, 0.88)'};"
        title={item.title || item.label}
        aria-label={item.label}
        on:click={() => item.onActivate?.()}
        in:fly={{ y: 6, duration: 140 }}
        out:fly={{ y: 6, duration: 110 }}
      >
        <span class="qa-disc">
          {#if item.iconSvg}
            <span class="qa-ico">{@html item.iconSvg}</span>
          {:else if item.icon}
            <span class="qa-ico qa-ico-component">
              <svelte:component this={item.icon} size={22} />
            </span>
          {/if}
          {#if item.fill != null}
            <span class="qa-bar">
              <span
                class="qa-bar-fill"
                style="width: {Math.max(0, Math.min(100, item.fill))}%"
              ></span>
            </span>
          {/if}
        </span>
        {#if item.text}
          <span class="qa-tag">{item.text}</span>
        {/if}
      </button>
    {/each}
  </div>
{/if}

<style>
  /* Sits directly above the people button (bottom: 1rem + 130px, 64px tall)
     with a 12px gap; centred on the button's axis (left 16px + 6px).
     The rail area itself is pointer-transparent — only the buttons (and
     their side tags) catch touches, so the empty strip still pans the map. */
  .qa-rail {
    position: fixed;
    left: calc(1rem + 5px);
    bottom: calc(1rem + 206px);
    z-index: 40;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
    padding: 2px;
    max-height: calc(100vh - 320px);
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: none;
    pointer-events: none;
  }
  .qa-rail::-webkit-scrollbar {
    display: none;
  }

  .qa-btn {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0;
    border: none;
    background: transparent;
    cursor: pointer;
    pointer-events: auto;
    touch-action: pan-y;
  }

  .qa-disc {
    position: relative;
    flex: 0 0 auto;
    width: 54px;
    height: 54px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: var(--qa-bg);
    border: 2px solid var(--qa-accent);
    color: var(--qa-accent);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(6px);
    transition:
      transform 0.15s ease,
      box-shadow 0.15s ease;
  }
  .qa-btn:hover .qa-disc {
    transform: scale(1.08);
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.55);
  }
  .qa-btn:active .qa-disc {
    transform: scale(0.94);
  }

  .qa-ico {
    display: flex;
    align-items: center;
    justify-content: center;
    transform: translateY(-3px);
    pointer-events: none;
  }
  .qa-ico :global(svg) {
    display: block;
  }
  .qa-ico-component {
    color: inherit;
  }

  /* Side tag — short text from the item (e.g. what a bin is storing).
     Sits inside the button so tapping the text opens the item too. */
  .qa-tag {
    max-width: 96px;
    padding: 3px 9px;
    border-radius: 999px;
    background: rgba(8, 12, 24, 0.85);
    border: 1px solid var(--qa-accent);
    color: rgba(255, 255, 255, 0.92);
    font-size: 10.5px;
    font-weight: 700;
    line-height: 1.25;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    backdrop-filter: blur(4px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
    pointer-events: none;
  }

  /* Mini fill gauge, mirroring the level bar the bins show on the map.
     A dark outline keeps the level readable on every grain colour (the pale
     disc + pale fills made the borderless track hard to judge). */
  .qa-bar {
    position: absolute;
    left: 50%;
    bottom: 5px;
    transform: translateX(-50%);
    width: 34px;
    height: 6px;
    border-radius: 3px;
    background: rgba(15, 23, 42, 0.3);
    border: 1px solid rgba(15, 23, 42, 0.75);
    overflow: hidden;
    pointer-events: none;
  }
  .qa-bar-fill {
    display: block;
    height: 100%;
    border-radius: 2px;
    background: var(--qa-accent);
  }
</style>
