<!-- src/lib/components/general/RoadIcon.svelte -->
<!--
  The Lucide "road" icon, inlined from lucide-static v1.28.0 (ISC license).
  lucide-svelte (0.424.0 / 1.0.1) does not yet ship this icon, so we vendor the
  exact SVG paths as a drop-in replacement matching the lucide component API.
-->
<script>
  export let size = 24
  export let color = "currentColor"
  export let strokeWidth = 2
</script>

<svg
  xmlns="http://www.w3.org/2000/svg"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke={color}
  stroke-width={strokeWidth}
  stroke-linecap="round"
  stroke-linejoin="round"
  {...$$restProps}
>
  <path d="M12 17v4" />
  <path d="M12 5V3" />
  <path d="M12 9v3" />
  <path d="M2.077 18.449A2 2 0 0 0 4 21h16a2 2 0 0 0 1.924-2.55l-4-14A2 2 0 0 0 16 3H8a2 2 0 0 0-1.924 1.45z" />
</svg>
