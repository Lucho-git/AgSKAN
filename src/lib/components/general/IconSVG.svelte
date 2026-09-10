<!-- src/lib/components/general/IconSVG.svelte -->
<!-- Thin icon renderer. The symbol library lives ONCE in IconSprite.svelte
     (mounted in the root layout). This component only outputs a small
     <svg><use href="#icon"/></svg> — it must NOT re-include any <symbol> or
     <defs> markup, or the library would be duplicated per icon again. -->
<script>
  export let icon = ""
  export let size = "24px"
  export let color = "currentColor"
  export let selected = false // Add selected prop
</script>

<svg width={size} height={size} fill={color}>
  <use xlink:href="#{icon}" />
</svg>
