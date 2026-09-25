<!-- src/lib/components/admin/AdminStatBadge.svelte -->
<script lang="ts">
  // Compact chip used across the admin portal (table, cards, status flags).
  // Neutral by default; semantic tones use low-alpha colour, per STYLE.md.
  export let icon: any = null
  export let value = ""
  export let title = ""
  export let tone:
    | "neutral"
    | "muted"
    | "secondary"
    | "error"
    | "warning"
    | "info"
    | "success" = "neutral"

  const TONES: Record<string, string> = {
    neutral: "bg-base-content/10 text-contrast-content/80",
    muted: "bg-base-content/5 text-contrast-content/55",
    secondary: "bg-secondary/20 text-secondary",
    error: "bg-error/15 text-error",
    warning: "bg-warning/15 text-warning",
    info: "bg-info/15 text-info",
    success: "bg-success/15 text-success",
  }
</script>

<span
  class="inline-flex flex-shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-base-content/10 px-1.5 py-0.5 text-[11px] font-medium leading-none tabular-nums {TONES[
    tone
  ] || TONES.neutral}"
  {title}
>
  {#if icon}
    <svelte:component this={icon} class="h-3 w-3" />
  {/if}
  {value}
</span>
