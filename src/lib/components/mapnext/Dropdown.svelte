<script lang="ts">
  /**
   * A dropdown in the menus' own style, in place of the browser's: the
   * whole control is the button, and the choices open as a card of rows
   * big enough for a thumb, the chosen one ticked. The list is hung from
   * the map's root (so a scrolling card can't clip it) and sits under the
   * control, or over it when there is no room below.
   *
   * `look` is how the control itself is drawn:
   *  - "row":   a line with a small label, the value and a chevron
   *  - "block": an info block, label over value (the paddock card's)
   *  - "pill":  a button with fixed words on it (it picks, it has no value)
   *  - "item":  a row inside another menu
   */
  import { createEventDispatcher, onDestroy, tick } from "svelte"
  import { Check, ChevronDown } from "lucide-svelte"
  import vehicles from "$lib/vehicles"
  import { machineFor } from "./machines"

  type Option = {
    value: string
    label: string
    note?: string
    /** A machine to picture beside it (its saved type), in this colour. */
    machine?: string | null
    colour?: string
  }

  export let options: Option[] = []
  /** The chosen value ("pill" and "item" pick without holding one). */
  export let value: string | null = null
  /** The small words on the control: what this is. */
  export let label = ""
  /** What the control says when nothing is chosen. */
  export let placeholder = ""
  export let look: "row" | "block" | "pill" | "item" = "row"
  /** Heading inside the list, when the control's own words aren't enough. */
  export let title = ""
  export let disabled = false

  const dispatch = createEventDispatcher<{ change: string }>()

  let open = false
  let trigger: HTMLButtonElement
  let menu: HTMLDivElement | null = null
  let place = { left: 0, top: 0, width: 0, height: 0, up: false }

  $: chosen = options.find((option) => option.value === value) ?? null

  async function show() {
    if (disabled || !options.length) return
    open = true
    await tick()
    position()
  }
  function hide() {
    open = false
  }
  function pick(option: Option) {
    hide()
    if (option.value !== value || look === "pill" || look === "item")
      dispatch("change", option.value)
  }

  function position() {
    if (!trigger || !menu) return
    const box = trigger.getBoundingClientRect()
    const wide = Math.max(box.width, 220)
    const tall = Math.min(menu.scrollHeight, 320)
    const below = window.innerHeight - box.bottom - 12
    const up = below < Math.min(tall, 200) && box.top > below
    place = {
      left: Math.max(8, Math.min(box.left, window.innerWidth - wide - 8)),
      top: up ? Math.max(8, box.top - 6 - tall) : box.bottom + 6,
      width: wide,
      height: Math.max(120, Math.min(tall, up ? box.top - 14 : below)),
      up,
    }
  }

  /** Hang the list from the map's root, outside whatever scrolls. */
  function hung(node: HTMLElement) {
    const root = trigger.closest(".mn") ?? document.body
    root.appendChild(node)
    return {
      destroy() {
        node.remove()
      },
    }
  }

  function outside(e: Event) {
    if (!open) return
    const target = e.target as Node
    if (trigger.contains(target) || menu?.contains(target)) return
    hide()
  }
  function key(e: KeyboardEvent) {
    if (open && e.key === "Escape") {
      e.stopPropagation()
      hide()
      trigger.focus()
    }
  }
  onDestroy(hide)
</script>

<svelte:window
  on:pointerdown|capture={outside}
  on:keydown={key}
  on:resize={hide}
  on:wheel|capture|passive={outside}
/>

<button
  bind:this={trigger}
  type="button"
  class="mn-dd {look}"
  class:open
  aria-haspopup="listbox"
  aria-expanded={open}
  {disabled}
  on:click|stopPropagation={() => (open ? hide() : show())}
>
  {#if look === "pill" || look === "item"}
    <slot>{label}</slot>
  {:else}
    {#if label}<span class="lp-eyebrow">{label}</span>{/if}
    <strong class:empty={!chosen}>{chosen?.label ?? placeholder}</strong>
  {/if}
  <i><ChevronDown size={look === "block" ? 16 : 17} /></i>
</button>

{#if open}
  <div
    bind:this={menu}
    use:hung
    class="mn-dd-list"
    class:up={place.up}
    role="listbox"
    aria-label={title || label}
    style="left: {place.left}px; top: {place.top}px; width: {place.width}px; max-height: {place.height}px"
  >
    {#if title}<p class="lp-eyebrow">{title}</p>{/if}
    {#each options as option (option.value)}
      <button
        type="button"
        role="option"
        aria-selected={option.value === value}
        on:click|stopPropagation={() => pick(option)}
      >
        {#if option.machine}
          <b class="art">
            <svelte:component
              this={vehicles[machineFor(option.machine).type]}
              size="30px"
              bodyColor={option.colour ?? "#9AA39B"}
              outlineColor="#ffffff"
              wheelColor="#15261C"
              loadColor="#F7DB5C"
            />
          </b>
        {/if}
        <span>
          {option.label}
          {#if option.note}<small>{option.note}</small>{/if}
        </span>
        {#if option.value === value}<Check size={17} strokeWidth={3} />{/if}
      </button>
    {/each}
  </div>
{/if}

<style>
  .mn-dd {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    color: var(--lp-ink);
    text-align: left;
  }
  .mn-dd i {
    display: flex;
    flex-shrink: 0;
    margin-left: auto;
    color: var(--lp-ink-soft);
    transition: transform 0.15s;
  }
  .mn-dd.open i {
    transform: rotate(180deg);
  }
  .mn-dd strong {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mn-dd .lp-eyebrow {
    flex-shrink: 0;
    white-space: nowrap;
  }
  .mn-dd strong.empty {
    font-weight: 600;
    color: var(--lp-ink-soft);
  }
  .mn-dd:disabled {
    opacity: 0.6;
  }

  /* A line: small label, value, chevron. */
  .mn-dd.row {
    width: 100%;
    min-height: 46px;
    padding: 0 12px 0 14px;
    border: 1.5px solid var(--lp-line);
    border-radius: 14px;
    background: var(--lp-card);
  }
  .mn-dd.row strong {
    font-size: 0.98rem;
    font-weight: 700;
  }
  .mn-dd.row:hover:not(:disabled),
  .mn-dd.row.open,
  .mn-dd.block:hover:not(:disabled),
  .mn-dd.block.open {
    border-color: var(--lp-ink);
  }

  /* An info block: label over value, the chevron where the pencil sits. */
  .mn-dd.block {
    display: grid;
    align-content: center;
    gap: 1px;
    width: 100%;
    min-height: 56px;
    padding: 7px 34px 7px 12px;
    border: 1.5px solid var(--lp-line);
    border-radius: 14px;
    background: var(--lp-paper);
  }
  .mn-dd.block strong {
    font-size: 1.02rem;
    font-weight: 800;
    line-height: 1.2;
  }
  .mn-dd.block i {
    position: absolute;
    top: 50%;
    right: 11px;
    margin: -8px 0 0;
  }

  /* A button with its own words on it. */
  .mn-dd.pill {
    justify-content: center;
    gap: 7px;
    min-height: 44px;
    padding: 0 12px 0 14px;
    border: 1.5px solid var(--lp-line);
    border-radius: 99px;
    font-size: 0.9rem;
    font-weight: 700;
    white-space: nowrap;
  }
  .mn-dd.pill i {
    margin-left: 0;
  }
  .mn-dd.pill:hover:not(:disabled),
  .mn-dd.pill.open {
    border-color: var(--lp-ink);
  }

  /* A row inside another (dark) menu. */
  .mn-dd.item {
    width: 100%;
    min-height: 46px;
    padding: 0 12px;
    border-radius: 11px;
    font-size: 0.95rem;
    font-weight: 700;
    color: inherit;
  }
  .mn-dd.item i {
    color: inherit;
    opacity: 0.7;
  }
  .mn-dd.item:hover {
    background: rgba(244, 241, 230, 0.1);
  }

  /* The list. */
  .mn-dd-list {
    position: fixed;
    z-index: 60;
    display: grid;
    align-content: start;
    gap: 2px;
    padding: 6px;
    overflow-y: auto;
    border-radius: 16px;
    background: var(--lp-card);
    box-shadow:
      0 0 0 1.5px var(--lp-ink),
      0 18px 36px -12px rgba(10, 25, 15, 0.6);
    overscroll-behavior: contain;
    scrollbar-width: thin;
    animation: dd-in 0.14s ease-out;
  }
  @keyframes dd-in {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
  }
  .mn-dd-list.up {
    animation-name: dd-up;
  }
  @keyframes dd-up {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
  }
  .mn-dd-list .lp-eyebrow {
    padding: 6px 10px 2px;
  }
  .mn-dd-list button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-height: 44px;
    padding: 6px 10px 6px 12px;
    border-radius: 11px;
    font-size: 0.96rem;
    font-weight: 700;
    color: var(--lp-ink);
    text-align: left;
  }
  .mn-dd-list button span {
    display: grid;
    flex: 1;
    min-width: 0;
  }
  /* The machine a row is about, pictured at its start. */
  .mn-dd-list button .art {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 9px;
    background: #cdbd92;
  }
  .mn-dd-list button small {
    font-size: 0.76rem;
    font-weight: 500;
    color: var(--lp-ink-soft);
  }
  .mn-dd-list button:hover {
    background: var(--lp-paper-2);
  }
  .mn-dd-list button[aria-selected="true"] {
    background: var(--lp-yellow);
    color: #15261c;
  }
  .mn-dd-list button[aria-selected="true"] small {
    color: rgba(21, 38, 28, 0.7);
  }
  @media (prefers-reduced-motion: reduce) {
    .mn-dd-list {
      animation: none;
    }
  }
</style>
