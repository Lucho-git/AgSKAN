<script lang="ts">
  /** Phone / tablet toggle for the map illustrations. */
  import { Smartphone, Tablet } from "lucide-svelte"
  import { device } from "./device"
</script>

<div class="switch" role="group" aria-label="Preview device">
  <button
    type="button"
    class:active={$device === "phone"}
    aria-pressed={$device === "phone"}
    on:click={() => device.set("phone")}
  >
    <Smartphone size={15} />
    Phone
  </button>
  <button
    type="button"
    class:active={$device === "tablet"}
    aria-pressed={$device === "tablet"}
    on:click={() => device.set("tablet")}
  >
    <Tablet size={15} />
    Tablet
  </button>
</div>

<style>
  .switch {
    display: inline-flex;
    gap: 2px;
    padding: 3px;
    border: 1px solid var(--lp-line);
    border-radius: 999px;
    background: var(--lp-card);
  }
  button {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    min-height: 2.5rem;
    padding: 0.35rem 0.95rem;
    border-radius: 999px;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--lp-ink-soft);
    transition:
      background-color 0.2s ease,
      color 0.2s ease;
  }
  button:hover {
    color: var(--lp-ink);
  }
  button.active {
    background: var(--lp-ink);
    color: var(--lp-paper);
  }
  button:focus-visible {
    outline: 2px solid var(--lp-accent-text);
    outline-offset: 2px;
  }
  @media (prefers-reduced-motion: reduce) {
    button {
      transition: none;
    }
  }
</style>
