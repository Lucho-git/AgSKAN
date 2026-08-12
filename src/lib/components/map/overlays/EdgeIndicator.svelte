<!-- src/lib/components/map/overlays/EdgeIndicator.svelte -->
<!-- General off-screen attention indicator. For every item registered in
     mapAttentionStore whose coordinate falls outside the viewport, a
     circular badge is pinned to the nearest screen edge along the angle to
     the target, with a pulsing ring to call the user's attention. -->
<script>
  import { onMount, onDestroy } from "svelte"
  import { mapAttentionStore } from "$lib/stores/mapAttentionStore"

  export let map

  $: attentionItems = $mapAttentionStore

  const BADGE = 44 // badge diameter (px)
  const RADIUS = BADGE / 2

  let placed = []
  let containerLeft = 0
  let containerTop = 0

  function compute(list) {
    if (!map || !map.getContainer || typeof map.project !== "function") {
      placed = []
      return
    }
    const container = map.getContainer()
    const r = container.getBoundingClientRect()
    containerLeft = r.left
    containerTop = r.top
    const w = r.width
    const h = r.height
    const cx = w / 2
    const cy = h / 2
    const margin = RADIUS + 2
    const next = []
    for (const item of list) {
      if (!item?.coordinates) continue
      let p
      try {
        p = map.project(item.coordinates)
      } catch {
        continue
      }
      const onScreen = p.x > -10 && p.x < w + 10 && p.y > -10 && p.y < h + 10
      if (onScreen) {
        next.push({ item, x: -9999, y: -9999, show: false })
        continue
      }
      // Bins render a fill bar beneath the badge — leave extra room on the
      // vertical edges so the bar stays on-screen too.
      const barPad = item.barLevel !== undefined ? 12 : 0
      const m = margin + barPad
      // Clamp the point to the viewport edge along the ray from the centre.
      let dx = p.x - cx
      let dy = p.y - cy
      if (dx === 0 && dy === 0) dx = 0.0001
      const ts = []
      if (dx !== 0) {
        ts.push(dx < 0 ? (m - cx) / dx : (w - m - cx) / dx)
      }
      if (dy !== 0) {
        ts.push(dy < 0 ? (m - cy) / dy : (h - m - cy) / dy)
      }
      const t = Math.min(...ts.filter((v) => v > 0))
      next.push({
        item,
        x: cx + dx * t,
        y: cy + dy * t,
        show: true,
      })
    }
    placed = next
  }

  function refresh(list) {
    compute(list)
  }

  // Recompute whenever the attention list or the map changes.
  $: if (map) refresh(attentionItems)

  // Clicking a badge pans the map over to the target (zoom unchanged), or
  // runs the item's custom onClick (e.g. "return to marker") if provided.
  function focus(item) {
    if (typeof item?.onClick === "function") {
      item.onClick()
      return
    }
    if (!map || !item?.coordinates) return
    try {
      map.panTo(item.coordinates, { duration: 900 })
    } catch {
      // ignore
    }
  }

  function onMapEvent() {
    refresh(attentionItems)
  }

  onMount(() => {
    refresh(attentionItems)
    if (!map) return
    map.on("move", onMapEvent)
    map.on("zoom", onMapEvent)
    map.on("rotate", onMapEvent)
    map.on("pitch", onMapEvent)
    map.on("resize", onMapEvent)
  })

  onDestroy(() => {
    if (!map) return
    map.off("move", onMapEvent)
    map.off("zoom", onMapEvent)
    map.off("rotate", onMapEvent)
    map.off("pitch", onMapEvent)
    map.off("resize", onMapEvent)
  })
</script>

{#each placed as { item, x, y, show } (item.id)}
  {#if show}
    <div
      class="edge-badge"
      style="left:{containerLeft + x}px; top:{containerTop + y}px; --ec:{item.color || '#f59e0b'};"
      title={item.label || "Off-screen"}
      role="button"
      aria-label={`Go to ${item.label || "off-screen item"}`}
      on:click={() => focus(item)}
    >
      <span class="edge-badge-ring"></span>
      <span
        class="edge-badge-ico"
        style={item.heading !== undefined
          ? `transform: rotate(${item.heading}deg);`
          : ''}
      >
        {#if item.component}
          <svelte:component this={item.component} {...(item.componentProps || {})} />
        {:else if item.icon}
          <svelte:component this={item.icon} size={18} />
        {:else if item.iconSvg}
          {@html item.iconSvg}
        {:else if item.barLevel !== undefined}
          <span class="edge-badge-dot"></span>
        {/if}
      </span>
      {#if item.barLevel !== undefined}
        <span class="edge-badge-bar">
          <span
            class="edge-badge-bar-fill"
            style="width:{Math.max(0, Math.min(100, item.barLevel))}%; background:{item.barColor || '#f59e0b'};"
          ></span>
        </span>
      {/if}
    </div>
  {/if}
{/each}

<style>
  .edge-badge {
    position: fixed;
    transform: translate(-50%, -50%);
    width: 44px;
    height: 44px;
    z-index: 1002;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: rgba(8, 12, 24, 0.92);
    border: 2px solid var(--ec);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.55);
    cursor: pointer;
    transition: transform 0.15s ease;
  }
  .edge-badge:hover {
    transform: translate(-50%, -50%) scale(1.12);
  }
  .edge-badge-ring {
    position: absolute;
    inset: -7px;
    border-radius: 50%;
    border: 2px solid var(--ec);
    opacity: 0;
    animation: edge-ping 1.8s ease-out infinite;
  }
  .edge-badge-ico {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--ec);
  }
  /* Bin tracking: a little colour dot when no icon is supplied. */
  .edge-badge-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--ec);
    box-shadow: 0 0 8px var(--ec);
  }
  /* Bin tracking: mini fill bar beneath the badge showing how full the bin is. */
  .edge-badge-bar {
    position: absolute;
    top: calc(100% + 5px);
    left: 50%;
    transform: translateX(-50%);
    width: 34px;
    height: 6px;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.14);
    border: 1px solid rgba(255, 255, 255, 0.18);
    overflow: hidden;
  }
  .edge-badge-bar-fill {
    display: block;
    height: 100%;
    border-radius: 3px;
  }
  @keyframes edge-ping {
    0% {
      transform: scale(0.75);
      opacity: 0.7;
    }
    70% {
      transform: scale(1.4);
      opacity: 0;
    }
    100% {
      transform: scale(1.4);
      opacity: 0;
    }
  }
</style>
