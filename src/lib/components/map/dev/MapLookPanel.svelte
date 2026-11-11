<!-- src/lib/components/map/dev/MapLookPanel.svelte -->
<!-- Floating tuner for the map "look": pick a preset, then nudge imagery, field
     and trail values with sliders. Everything writes to mapLookStore, which
     the map repaints from live. Dev tools only while looks are being chosen. -->
<script lang="ts">
  import { createEventDispatcher } from "svelte"
  import {
    Palette,
    X,
    RotateCcw,
    Copy,
    ChevronDown,
    ChevronUp,
  } from "lucide-svelte"
  import { toast } from "svelte-sonner"
  import {
    currentLook,
    mapLookState,
    resetLookOverrides,
    setLookOverride,
    setLookPreset,
  } from "$lib/stores/mapLookStore"
  import {
    PRESET_LABELS,
    PRESET_ORDER,
    TRAIL_PALETTES,
    type MapLook,
    type TrailPaletteName,
  } from "$lib/utils/mapLook"

  const dispatch = createEventDispatcher()

  let collapsed = false

  const presetNames = PRESET_ORDER
  const paletteNames = Object.keys(TRAIL_PALETTES) as TrailPaletteName[]
  const swatchNames = ["red", "orange", "yellow", "green", "blue", "purple"]

  type Slider = {
    group: keyof MapLook
    key: string
    label: string
    min: number
    max: number
    step: number
  }

  const sections: { title: string; sliders: Slider[] }[] = [
    {
      title: "Imagery",
      sliders: [
        {
          group: "basemap",
          key: "saturation",
          label: "Colour",
          min: -1,
          max: 1,
          step: 0.05,
        },
        {
          group: "basemap",
          key: "contrast",
          label: "Contrast",
          min: -1,
          max: 1,
          step: 0.05,
        },
        {
          group: "basemap",
          key: "brightnessMax",
          label: "Brightness",
          min: 0.3,
          max: 1,
          step: 0.05,
        },
        {
          group: "basemap",
          key: "brightnessMin",
          label: "Lift shadows",
          min: 0,
          max: 0.6,
          step: 0.05,
        },
      ],
    },
    {
      title: "Outside fields",
      sliders: [
        {
          group: "outside",
          key: "strength",
          label: "Wash",
          min: 0,
          max: 1,
          step: 0.05,
        },
      ],
    },
    {
      title: "Fields",
      sliders: [
        {
          group: "fields",
          key: "fillOpacity",
          label: "Fill",
          min: 0,
          max: 1,
          step: 0.02,
        },
        {
          group: "fields",
          key: "outlineWidth",
          label: "Outline",
          min: 0,
          max: 6,
          step: 0.5,
        },
      ],
    },
    {
      title: "Trails",
      sliders: [
        {
          group: "trails",
          key: "opacity",
          label: "Opacity",
          min: 0.2,
          max: 1,
          step: 0.05,
        },
      ],
    },
  ]

  $: look = $currentLook
  $: tuned = Object.keys($mapLookState.overrides).length > 0

  function valueOf(l: MapLook, s: Slider): number {
    return (l[s.group] as unknown as Record<string, number>)[s.key]
  }

  function set(group: keyof MapLook, key: string, value: unknown) {
    // Group and key come from the fixed tables above.
    ;(setLookOverride as (g: string, k: string, v: unknown) => void)(
      group,
      key,
      value,
    )
  }

  function onSlide(s: Slider, event: Event) {
    set(s.group, s.key, Number((event.currentTarget as HTMLInputElement).value))
  }

  async function copySettings() {
    const text = JSON.stringify($mapLookState, null, 2)
    try {
      await navigator.clipboard.writeText(text)
      toast.success("Look settings copied")
    } catch {
      toast.error("Couldn't copy settings")
    }
  }
</script>

<div class="mlook-panel">
  <div class="mlook-header">
    <div class="mlook-badge">
      <Palette size={12} />
      MAP LOOK
    </div>
    <span class="mlook-current">
      {PRESET_LABELS[$mapLookState.preset]}{tuned ? " · tuned" : ""}
    </span>
    <button
      class="mlook-icon-btn"
      title={collapsed ? "Expand" : "Collapse"}
      on:click={() => (collapsed = !collapsed)}
    >
      {#if collapsed}<ChevronUp size={14} />{:else}<ChevronDown
          size={14}
        />{/if}
    </button>
    <button
      class="mlook-icon-btn"
      title="Close"
      on:click={() => dispatch("close")}
    >
      <X size={14} />
    </button>
  </div>

  {#if !collapsed}
    <div class="mlook-body">
      <div class="mlook-seg presets">
        {#each presetNames as name}
          <button
            class="mlook-seg-btn"
            class:active={$mapLookState.preset === name}
            on:click={() => setLookPreset(name)}
          >
            {PRESET_LABELS[name]}
          </button>
        {/each}
      </div>

      {#each sections as section}
        <div class="mlook-section">
          <div class="mlook-title">{section.title}</div>

          {#each section.sliders as s}
            <label class="mlook-row">
              <span class="mlook-label">{s.label}</span>
              <input
                type="range"
                class="mlook-slider"
                min={s.min}
                max={s.max}
                step={s.step}
                value={valueOf(look, s)}
                on:input={(e) => onSlide(s, e)}
              />
              <span class="mlook-value">{valueOf(look, s).toFixed(2)}</span>
            </label>
          {/each}

          {#if section.title === "Imagery"}
            <label class="mlook-row mlook-check">
              <input
                type="checkbox"
                checked={look.basemap.hideRoadsAndLabels}
                on:change={(e) =>
                  set("basemap", "hideRoadsAndLabels", e.currentTarget.checked)}
              />
              <span>Hide roads and place labels</span>
            </label>
          {:else if section.title === "Fields"}
            <label class="mlook-row mlook-check">
              <input
                type="checkbox"
                checked={look.fields.autoPalette}
                on:change={(e) =>
                  set("fields", "autoPalette", e.currentTarget.checked)}
              />
              <span>Vary field colours</span>
            </label>
          {:else if section.title === "Trails"}
            <label class="mlook-row mlook-check">
              <input
                type="checkbox"
                checked={look.trails.colorBy === "trail"}
                on:change={(e) =>
                  set(
                    "trails",
                    "colorBy",
                    e.currentTarget.checked ? "trail" : "vehicle",
                  )}
              />
              <span>Colour each closed trail separately</span>
            </label>
            <div class="mlook-palettes">
              {#each paletteNames as name}
                <button
                  class="mlook-palette"
                  class:active={look.trails.palette === name}
                  on:click={() => set("trails", "palette", name)}
                >
                  <span class="mlook-palette-name">{name}</span>
                  <span class="mlook-swatches">
                    {#each swatchNames as c}
                      <span
                        class="mlook-swatch"
                        style="background: {TRAIL_PALETTES[name][c]}"
                      ></span>
                    {/each}
                  </span>
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {/each}

      <div class="mlook-actions">
        <button
          class="mlook-action"
          disabled={!tuned}
          on:click={resetLookOverrides}
        >
          <RotateCcw size={13} /> Reset to preset
        </button>
        <button class="mlook-action" on:click={copySettings}>
          <Copy size={13} /> Copy settings
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .mlook-panel {
    position: fixed;
    top: 72px;
    right: 12px;
    z-index: 900;
    width: 280px;
    max-width: calc(100vw - 24px);
    max-height: calc(100vh - 96px);
    display: flex;
    flex-direction: column;
    gap: 4px;
    color: #f3f4f6;
    font-size: 12px;
    pointer-events: auto;
  }

  .mlook-header,
  .mlook-body {
    background: rgba(10, 10, 10, 0.92);
    border: 1px solid rgba(96, 165, 250, 0.45);
    border-radius: 8px;
    backdrop-filter: blur(8px);
  }

  .mlook-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px 6px 10px;
  }

  .mlook-badge {
    display: flex;
    align-items: center;
    gap: 4px;
    font-weight: 700;
    font-size: 10px;
    letter-spacing: 0.06em;
    color: #93c5fd;
  }

  .mlook-current {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: rgba(243, 244, 246, 0.75);
  }

  .mlook-icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 6px;
    color: rgba(243, 244, 246, 0.8);
  }
  .mlook-icon-btn:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .mlook-body {
    padding: 10px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .mlook-seg {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: 1fr;
    gap: 4px;
  }

  .mlook-seg.presets {
    grid-auto-flow: row;
    grid-template-columns: repeat(2, 1fr);
  }

  .mlook-seg-btn {
    padding: 7px 4px;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(255, 255, 255, 0.05);
    color: rgba(243, 244, 246, 0.85);
    font-weight: 600;
    text-transform: capitalize;
  }
  .mlook-seg-btn.active {
    background: rgba(96, 165, 250, 0.25);
    border-color: #60a5fa;
    color: #ffffff;
  }

  .mlook-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .mlook-title {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: rgba(243, 244, 246, 0.55);
  }

  .mlook-row {
    display: grid;
    grid-template-columns: 78px 1fr 36px;
    align-items: center;
    gap: 8px;
  }

  .mlook-check {
    grid-template-columns: auto 1fr;
    cursor: pointer;
  }

  .mlook-slider {
    width: 100%;
    accent-color: #60a5fa;
  }

  .mlook-value {
    text-align: right;
    font-variant-numeric: tabular-nums;
    color: rgba(243, 244, 246, 0.7);
  }

  .mlook-palettes {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
  }

  .mlook-palette {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(255, 255, 255, 0.05);
    text-align: left;
  }
  .mlook-palette.active {
    border-color: #60a5fa;
    background: rgba(96, 165, 250, 0.2);
  }

  .mlook-palette-name {
    text-transform: capitalize;
    font-weight: 600;
  }

  .mlook-swatches {
    display: flex;
    gap: 2px;
  }

  .mlook-swatch {
    flex: 1;
    height: 8px;
    border-radius: 2px;
  }

  .mlook-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
  }

  .mlook-action {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 7px 4px;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(255, 255, 255, 0.05);
    color: rgba(243, 244, 246, 0.9);
  }
  .mlook-action:disabled {
    opacity: 0.4;
  }
</style>
